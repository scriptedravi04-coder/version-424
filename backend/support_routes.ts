import { logIgnored } from "./logIgnored";
import express from "express";
import { isSubAdmin, acceptedPermissions } from "./adminPermissions";
import { isFullAdmin } from "./authSecurity";
import crypto from "crypto";
import { Resend, buildEmailHtml } from "./helpers";
import { FEEDBACK_PAGE } from "./feedback_routes";
import { publicSiteUrl } from "./siteUrl"; // v388

// Support ticket routes: replying to a ticket, fetching a ticket's
// messages, listing a user's own tickets, and creating a new ticket
// (from either an order-support-modal or the general help-center flow —
// both funnel through the same createSupportTicketHandler).
export function setupSupportRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    sendNotification,
    logAdminAction,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    sendNotification: (db: any, userId: string, type: string, message: string) => Promise<any>;
    logAdminAction: (user: any, action: string, targetType: string, targetId: string, details?: any) => Promise<any>;
  }
) {
  const getIsoNow = () => new Date().toISOString();
  // Session 58: these /support/... staff actions sit outside the /admin permission gate — a sub-admin needs the
  // helpdesk permission (any sub-admin could read ticket messages and send official replies).
  const helpdeskAllowed = (u: any) => {
    if (!u) return false;
    if (isFullAdmin(u)) return true;
    if (!isSubAdmin(u)) return true; // the user-side checks decide
    const keys = acceptedPermissions("manage_helpdesk");
    return Array.isArray(u.permissions) && u.permissions.some((p: any) => typeof p === "string" ? keys.includes(p)
      : p && keys.includes(p.permission_key || p.key) && (p.allowed === true || p.allowed === 1 || p.allowed === "true"));
  };

  router.post("/support/tickets/:id/reply", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin') || !helpdeskAllowed(user)) {
      return res.status(403).json({ error: "Unauthorized. Admin access required." });
    }

    const ticketId = req.params.id;
    const { message, attachments } = req.body || {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: "Reply message cannot be empty." });
    }

    // Find the ticket
    let ticket: any = null;
    if (supabase) {
      try {
        const { data: tData, error: tErr } = await (privilegedSupabase || supabase)
          .from('support_tickets')
          .select('*')
          .eq('ticket_id', ticketId)
          .maybeSingle();
        if (tData) ticket = tData;
        if (tErr) console.warn("Error finding ticket in Supabase:", tErr);
      } catch (e) {
        console.warn("Exception finding ticket in Supabase:", e);
      }
    }

    const db = getDb();
    if (!ticket) {
      ticket = (db.support_tickets || []).find((t: any) => t.ticket_id === ticketId || t.id === ticketId);
    }

    if (!ticket) {
      return res.status(404).json({ error: "Support ticket not found." });
    }

    const messageId = crypto.randomUUID();
    const newMsg = {
      message_id: messageId,
      ticket_id: ticketId,
      sender_id: user.user_id,
      sender_type: 'admin',
      message: message.trim(),
      attachments: Array.isArray(attachments) ? attachments : [],
      created_at: getIsoNow()
    };

    // Insert into Supabase ticket_messages
    if (supabase) {
      try {
        const { error: insertErr } = await (privilegedSupabase || supabase)
          .from('ticket_messages')
          .insert(newMsg);
        if (insertErr) {
          console.error("Supabase ticket_messages insert error:", insertErr);
        }
      } catch (e: any) {
        console.error("Supabase ticket_messages insert exception:", e?.message || e);
      }

      // Update support_tickets updated_at and assigned_admin_id
      try {
        await (privilegedSupabase || supabase)
          .from('support_tickets')
          .update({
            updated_at: getIsoNow(),
            assigned_admin_id: user.user_id
          })
          .eq('ticket_id', ticketId);
      } catch (e) {
        console.warn("Supabase support_tickets update exception:", e);
      }
    }

    // Local DB fallback & sync
    if (!db.ticket_messages) db.ticket_messages = [];
    db.ticket_messages.push(newMsg);
    if (db.support_tickets) {
      const locTicket = db.support_tickets.find((t: any) => t.ticket_id === ticketId || t.id === ticketId);
      if (locTicket) {
        locTicket.updated_at = getIsoNow();
        locTicket.assigned_admin_id = user.user_id;
      }
    }
    saveDb(db);

    // Look up recipient user for notification & Resend email
    let ticketUser: any = null;
    if (ticket.user_id) {
      if (supabase) {
        try {
          const { data: uData } = await (privilegedSupabase || supabase)
            .from('users')
            .select('user_id, email, name')
            .eq('user_id', ticket.user_id)
            .maybeSingle();
          if (uData) ticketUser = uData;
        } catch (e) {
          console.warn("Error fetching ticket user in Supabase:", e);
        }
      }
      if (!ticketUser && db.users) {
        ticketUser = db.users.find((u: any) => u.user_id === ticket.user_id);
      }
    }

    // Send email notification via Resend
    let emailSent = false;
    const toEmail = ticketUser?.email;
    const userName = ticketUser?.name || "User";
    const apiKey = process.env.RESEND_API_KEY;

    if (toEmail && toEmail.includes('@') && !toEmail.endsWith('.demo') && !toEmail.includes('@example.com')) {
      if (apiKey) {
        try {
          const resendClient = new Resend(apiKey);
          const fromEmail = process.env.RESEND_FROM_EMAIL || "Ybex Support <noreply@ybexmedia.in>";
          const appUrl = publicSiteUrl(); // v388

          const emailHtml = buildEmailHtml({
            title: `Support Resolution: Ticket #${ticketId.slice(0, 8)}`,
            greeting: `Hello ${userName},`,
            paragraphs: [
              `Our support resolution team has responded to your inquiry regarding "<strong>${ticket.subject || ticket.category || 'Support Request'}</strong>":`,
              `<div style="background: #f8fafc; border-left: 4px solid #6366f1; padding: 14px 18px; border-radius: 6px; margin: 16px 0; font-size: 14px; color: #1e293b; line-height: 1.6; white-space: pre-wrap;">${message.trim()}</div>`,
              `You can view the full conversation history or reply from your Helpdesk dashboard.`
            ],
            button: {
              text: "Open my ticket",
              link: `${appUrl}/support/tickets/${encodeURIComponent(ticketId)}` // v373: this ticket, not Help home
            }
          });

          const resendRes = await resendClient.emails.send({
            from: fromEmail,
            to: [toEmail],
            subject: `Ybex support replied: ${ticket.subject || 'your ticket'} [#${ticketId.slice(0, 8)}]`, // v373: say it first
            html: emailHtml
          });

          if (resendRes?.error) {
            console.warn("[Support Reply Email Error]:", resendRes.error);
          } else {
            emailSent = true;
            console.log(`[Support Reply Email Sent] Delivered to ${toEmail} for ticket ${ticketId}`);
          }
        } catch (mailErr: any) {
          console.error("[Support Reply Email Exception]:", mailErr?.message || mailErr);
        }
      } else {
        console.log(`[Support Reply Email Skipped - No RESEND_API_KEY] Would notify ${toEmail} for ticket ${ticketId}`);
      }
    }

    // In-app notification
    if (ticket.user_id) {
      try {
        await sendNotification(
          db,
          ticket.user_id,
          'SUPPORT_REPLY',
          `Support team replied to ticket #${ticketId.slice(0, 8)}: "${ticket.subject || 'Support Ticket'}"`
        );
      } catch (notifErr) {
        console.warn("Error sending in-app notification:", notifErr);
      }
    }

    // Log admin activity
    await logAdminAction(user, 'reply_ticket', 'support_ticket', ticketId, {
      message_preview: message.trim().slice(0, 80),
      recipient_email: toEmail || null,
      email_sent: emailSent
    });

    res.json({
      success: true,
      message: "Reply sent & email delivered to user",
      data: newMsg,
      email_delivered: emailSent
    });
  });

  router.get("/support/tickets/:id/messages", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const ticketId = req.params.id;
    // Session 22: any logged-in user could read ANY ticket's messages. Owner or staff only.
    if (!isSupportStaff(user)) {
      const owner = await ticketOwner(ticketId);
      if (!owner || !actingIdsOf(user).includes(String(owner))) return res.status(403).json({ error: "Not your ticket." });
    }
    if (supabase) {
      try {
        const { data, error } = await (privilegedSupabase || supabase)
          .from('ticket_messages')
          .select('*')
          .eq('ticket_id', ticketId)
          .order('created_at', { ascending: true });
        if (!error && data) return res.json(data);
      } catch (e) { logIgnored("support_routes:230", e); }
    }

    const db = getDb();
    const msgs = (db.ticket_messages || []).filter((m: any) => m.ticket_id === ticketId);
    res.json(msgs);
  });

  // Session 34 (Ravi): the ticket owner can reply inside their ticket. Owner only (brand team
  // members act for the parent brand, same rule as reading). A reply on a RESOLVED ticket opens it
  // again (the user still needs help); a CLOSED ticket takes no replies. 1–2000 characters, and
  // at most one reply per 3 seconds per user. The message is saved first — if it cannot be
  // saved the user sees the database reason instead of a fake "sent".
  const lastUserReplyAt = new Map<string, number>();
  router.post("/support/tickets/:id/messages", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const ticketId = String(req.params.id || "");
    const text = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!text) return res.status(400).json({ error: "Reply message cannot be empty." });
    if (text.length > 2000) return res.status(400).json({ error: "Please keep your reply under 2000 characters." });

    const db = getDb();
    let ticket: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from("support_tickets").select("*").eq("ticket_id", ticketId).maybeSingle();
        if (data) ticket = data;
      } catch (e) { logIgnored("support_routes:user-reply-find", e); }
    }
    if (!ticket) ticket = (db.support_tickets || []).find((t: any) => t.ticket_id === ticketId);
    if (!ticket) return res.status(404).json({ error: "Support ticket not found." });
    if (!actingIdsOf(user).includes(String(ticket.user_id))) return res.status(403).json({ error: "Not your ticket." });

    const status = String(ticket.status || "").toUpperCase();
    if (status === "CLOSED") return res.status(409).json({ error: "This ticket is closed. Please open a new ticket.", code: "TICKET_CLOSED" });

    const now = Date.now();
    const last = lastUserReplyAt.get(String(user.user_id)) || 0;
    if (now - last < 3000) return res.status(429).json({ error: "Please wait a moment before sending again." });
    lastUserReplyAt.set(String(user.user_id), now);

    const nowIso = getIsoNow();
    const newMsg = {
      message_id: crypto.randomUUID(),
      ticket_id: ticketId,
      sender_id: user.user_id,
      sender_type: "user",
      message: text,
      attachments: [],
      created_at: nowIso,
    };
    const patch: any = { updated_at: nowIso };
    if (status === "RESOLVED") patch.status = "OPEN";

    if (supabase) {
      const { error: insErr } = await (privilegedSupabase || supabase).from("ticket_messages").insert(newMsg);
      if (insErr) {
        console.error("[support user reply] ticket_messages insert error:", insErr);
        lastUserReplyAt.delete(String(user.user_id));
        return res.status(500).json({ error: `Could not send your reply: ${insErr.message || "database error"}` });
      }
      const { error: upErr } = await (privilegedSupabase || supabase).from("support_tickets").update(patch).eq("ticket_id", ticketId);
      if (upErr) console.warn("[support user reply] support_tickets update error:", upErr);
    }
    if (!db.ticket_messages) db.ticket_messages = [];
    db.ticket_messages.push(newMsg);
    const loc = (db.support_tickets || []).find((t: any) => t.ticket_id === ticketId);
    if (loc) Object.assign(loc, patch);
    saveDb(db);

    res.json({ success: true, data: newMsg, status: patch.status || ticket.status || "OPEN" });
  });

  const isSupportStaff = (u: any) => (["admin", "sub_admin"].includes(String(u?.role)) || u?.team_role === "sub_admin") && helpdeskAllowed(u);
  const actingIdsOf = (u: any) => [u?.user_id, u?.parent_brand_id].filter(Boolean).map(String);
  async function ticketOwner(ticketId: string): Promise<string | null> {
    const local = (getDb().support_tickets || []).find((t: any) => t.ticket_id === ticketId);
    if (local?.user_id) return String(local.user_id);
    if (!supabase) return null;
    try {
      const { data } = await (privilegedSupabase || supabase).from("support_tickets").select("user_id").eq("ticket_id", ticketId).maybeSingle();
      return data?.user_id ? String(data.user_id) : null;
    } catch (e) { logIgnored("support_routes:ticketOwner", e); return null; }
  }

  // Session 22: the admin helpdesk and analytics read/updated support_tickets straight from the
  // browser (anon key), which needed the table to be open to everyone. Staff-only endpoints now.
  router.get("/admin/support/tickets", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || !isSupportStaff(user)) return res.status(403).json({ error: "Admin privileges required." });
    if (supabase) {
      try {
        const { data, error } = await (privilegedSupabase || supabase).from("support_tickets").select("*").order("created_at", { ascending: false });
        // v293: the Ybex Assist bot's reports have their own section (Help desk → Chatbot), not this list.
        if (!error && data) return res.json(data.filter((t: any) => t.page_context !== FEEDBACK_PAGE));
      } catch (e) { logIgnored("support_routes:admin-list", e); }
    }
    const local = [...(getDb().support_tickets || [])].filter((t: any) => t.page_context !== FEEDBACK_PAGE).sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
    res.json(local);
  });

  router.patch("/admin/support/tickets/:id/status", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || !isSupportStaff(user)) return res.status(403).json({ error: "Admin privileges required." });
    const status = String(req.body?.status || "").slice(0, 40);
    if (!status) return res.status(400).json({ error: "status required" });
    const patch = { status, assigned_admin_id: user.user_id, updated_at: new Date().toISOString() };
    if (supabase) {
      const { error } = await (privilegedSupabase || supabase).from("support_tickets").update(patch).eq("ticket_id", req.params.id);
      if (error) return res.status(502).json({ error: error.message });
    }
    const db = getDb();
    const t = (db.support_tickets || []).find((x: any) => x.ticket_id === req.params.id);
    if (t) { Object.assign(t, patch); saveDb(db); }
    res.json({ ok: true, ...patch });
  });

  router.get("/support/my-tickets", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const db = getDb();
    const localMap: Map<any, any> = new Map((db.support_tickets || []).map((lt: any) => [lt.ticket_id, lt]));

    let tickets: any[] = [];
    if (supabase) {
      try {
        const { data, error } = await (privilegedSupabase || supabase)
          .from('support_tickets')
          .select('*')
          .eq('user_id', user.user_id)
          .order('created_at', { ascending: false });
        if (!error && data) {
          tickets = data.map((t: any) => {
            const localRec = localMap.get(t.ticket_id);
            const extractedOrderId = (typeof t.page_context === 'string' && t.page_context.startsWith('/deals/'))
              ? t.page_context.replace('/deals/', '').split(/[?#]/)[0]
              : null;
            return {
              ...t,
              order_id: t.order_id || localRec?.order_id || extractedOrderId || null,
              thread_id: t.thread_id || localRec?.thread_id || null
            };
          });
        } else if (error) {
          console.warn("[my-tickets] Supabase select error:", error);
        }
      } catch (e) {
        console.warn("[my-tickets] Supabase select exception:", e);
      }
    }

    if (tickets.length === 0) {
      const locTickets = (db.support_tickets || [])
        .filter((t: any) => t.user_id === user.user_id)
        .map((t: any) => ({
          ...t,
          order_id: t.order_id || null,
          thread_id: t.thread_id || null
        }));
      if (locTickets.length > 0) {
        tickets = locTickets;
      }
    }

    res.json({ tickets: tickets.filter((t: any) => t.page_context !== FEEDBACK_PAGE) });
  });

  const createSupportTicketHandler = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const {
      thread_id,
      order_id,
      campaign_title,
      deal_amount,
      issue_category,
      category,
      message,
      description,
      subject,
      brand_details,
      creator_details,
      priority,
      page_context,
      attachments
    } = req.body || {};

    const ticketMsg = (message || description || "").toString().trim();
    if (!ticketMsg && !subject) {
      return res.status(400).json({ error: "Message or subject is required to raise a support ticket." });
    }

    const ticketId = crypto.randomUUID();
    const resolvedCategory = issue_category || category || (order_id ? 'Order Dispute' : 'General Support');
    const resolvedSubject = (subject || "").toString().trim() || 
      (order_id ? `Order Dispute: ${campaign_title || 'Order #' + String(order_id).substring(0, 8)}` : `Support Request: ${resolvedCategory}`);
    const resolvedPriority = priority || (order_id ? 'HIGH' : 'MEDIUM');
    const resolvedThreadId = thread_id || null;
    const resolvedOrderId = order_id || null;
    const resolvedPageContext = page_context || (resolvedOrderId ? `/deals/${resolvedOrderId}` : '/help');
    const nowIso = getIsoNow();

    const ticketRecord = {
      ticket_id: ticketId,
      user_id: user.user_id,
      role: user.role || 'user',
      subject: resolvedSubject,
      category: resolvedCategory,
      status: 'OPEN',
      priority: resolvedPriority,
      assigned_admin_id: null,
      page_context: resolvedPageContext,
      created_at: nowIso,
      updated_at: nowIso,
      thread_id: resolvedThreadId
    };

    let messageRecord: any = null;
    if (ticketMsg) {
      messageRecord = {
        message_id: crypto.randomUUID(),
        ticket_id: ticketId,
        sender_id: user.user_id,
        sender_type: user.role === 'admin' ? 'admin' : 'user',
        message: ticketMsg,
        attachments: Array.isArray(attachments) ? attachments : [],
        created_at: nowIso
      };
    }

    if (supabase) {
      try {
        const { error: tErr } = await (privilegedSupabase || supabase)
          .from('support_tickets')
          .insert(ticketRecord);
        if (tErr) console.error("[createSupportTicket] Supabase support_tickets insert error:", tErr);
      } catch (e) {
        console.error("[createSupportTicket] Supabase support_tickets exception:", e);
      }

      if (messageRecord) {
        try {
          const { error: mErr } = await (privilegedSupabase || supabase)
            .from('ticket_messages')
            .insert(messageRecord);
          if (mErr) console.error("[createSupportTicket] Supabase ticket_messages insert error:", mErr);
        } catch (e) {
          console.error("[createSupportTicket] Supabase ticket_messages exception:", e);
        }
      }
    }

    // Local DB sync
    const db = getDb();
    if (!db.support_tickets) db.support_tickets = [];
    if (!db.ticket_messages) db.ticket_messages = [];

    const localTicket = {
      ...ticketRecord,
      order_id: resolvedOrderId,
      thread_id: resolvedThreadId,
      campaign_title: campaign_title || null,
      deal_amount: deal_amount || 0,
      brand_details: brand_details || null,
      creator_details: creator_details || null
    };
    db.support_tickets.unshift(localTicket);

    if (messageRecord) {
      db.ticket_messages.push(messageRecord);
    }
    saveDb(db);

    return res.status(201).json({
      success: true,
      ticket_id: ticketId,
      ticket: {
        ...ticketRecord,
        order_id: resolvedOrderId,
        thread_id: resolvedThreadId
      },
      message: "Support ticket created successfully"
    });
  };
  router.post("/support/order-ticket", createSupportTicketHandler);
  router.post("/support/tickets", createSupportTicketHandler);
}
