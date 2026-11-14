import { logIgnored } from "./logIgnored";
import { loadPitchData, saveAdminPitchFields, PITCH_STATUSES } from "./pitchLeads";
import { emitThreadEvent } from "./socketAccess";
import express from "express";
import crypto from "crypto";
import { Resend, buildEmailHtml, getValidFromEmail } from "./helpers";
import { publicSiteUrl } from "./siteUrl"; // v388

export function setupAdminPitchLeadsRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    logAdminAction,
    insertChatMessageToSupabase,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    logAdminAction?: (userId: string, action: string, targetType: string, targetId: string, detail?: string) => void;
    insertChatMessageToSupabase?: (payload: any) => Promise<any>;
  }
) {
  const getIsoNow = () => new Date().toISOString();

  const verifyAdmin = async (req: express.Request, res: express.Response) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== "admin" && user.role !== "sub_admin" && user.team_role !== "sub_admin")) {
      res.status(403).json({ error: "Unauthorized. Admin privileges required." });
      return null;
    }
    return user;
  };

  // 1. GET /admin/pitch-leads
  router.get("/admin/pitch-leads", async (req, res) => {
    const admin = await verifyAdmin(req, res);
    if (!admin) return;

    // Session 38: Supabase first (brief_requests + names + threads), local-only rows added.
    const { briefRequests, creatorProfiles, brandProfiles, users, chatThreads, chatMessages } =
      await loadPitchData({ getClient: () => privilegedSupabase || null, getDb });

    // Query parameters
    const { status, filter, q } = req.query;

    const enriched = briefRequests.map((b: any) => {
      // Find creator info
      const cp = creatorProfiles.find((p: any) => p.user_id === b.creator_id || p.id === b.creator_id) || {};
      const cu = users.find((u: any) => u.user_id === b.creator_id || u.id === b.creator_id) || {};
      
      const isUnclaimed =
        b.creator_is_claimed === false ||
        cp.is_claimed === false ||
        cp.auth_method === "unclaimed" ||
        cu.auth_method === "unclaimed" ||
        cu.is_claimed === false ||
        !cu;

      const creatorData = {
        id: b.creator_id,
        user_id: b.creator_id,
        name: b.creator_name || cp.name || cp.full_name || cu.name || "Creator",
        handle: b.creator_handle || cp.instagram_handle || cp.handle || "",
        avatar: cp.picture || cp.photo || cp.avatar_url || cu.picture || "",
        email: b.creator_email || cp.email || cu.email || "",
        phone: b.creator_phone || cp.phone || cp.whatsapp || cu.phone || "",
        followers: cp.followers || cp.instagram_followers || cp.follower_count || 0,
        is_claimed: !isUnclaimed,
        instagram_url: cp.instagram_url || (b.creator_handle ? `https://instagram.com/${b.creator_handle.replace('@', '')}` : null)
      };

      // Find brand info
      const bp = brandProfiles.find((p: any) => p.user_id === b.brand_id) || {};
      const bu = users.find((u: any) => u.user_id === b.brand_id) || {};
      const brandData = {
        id: b.brand_id,
        name: b.brand_name || bp.company_name || bu.name || "Brand Partner",
        company_name: bp.company_name || b.brand_name || bu.name || "Brand Partner",
        logo: bp.logo || bu.picture || "",
        email: b.brand_email || bu.email || ""
      };

      // Thread & message info
      const thread = chatThreads.find((t: any) => t.id === b.thread_id || (t.brand_id === b.brand_id && t.creator_id === b.creator_id));
      const threadId = thread?.id || b.thread_id;
      const threadMsgs = chatMessages.filter((m: any) => m.thread_id === threadId);
      const lastMsg = threadMsgs.length > 0 ? threadMsgs[threadMsgs.length - 1] : null;

      return {
        ...b,
        thread_id: threadId,
        creator: creatorData,
        brand: brandData,
        last_message: lastMsg ? {
          text: lastMsg.text || lastMsg.content,
          sender_role: lastMsg.sender_role,
          from_name: lastMsg.from_name,
          is_admin_brokered: Boolean(lastMsg.is_admin_brokered),
          created_at: lastMsg.created_at
        } : null,
        messages_count: threadMsgs.length
      };
    });

    // Compute stats across all records
    const stats = {
      total: enriched.length,
      new_count: enriched.filter((p: any) => (p.status || "NEW").toUpperCase() === "NEW").length,
      in_negotiation_count: enriched.filter((p: any) => (p.status || "").toUpperCase() === "IN_NEGOTIATION").length,
      accepted_count: enriched.filter((p: any) => (p.status || "").toUpperCase() === "ACCEPTED").length,
      declined_count: enriched.filter((p: any) => (p.status || "").toUpperCase() === "DECLINED").length,
      unregistered_count: enriched.filter((p: any) => !p.creator.is_claimed).length
    };

    // Filter results
    let filtered = enriched;

    if (status && status !== "ALL") {
      filtered = filtered.filter((p: any) => (p.status || "NEW").toUpperCase() === String(status).toUpperCase());
    }

    if (filter === "unregistered") {
      filtered = filtered.filter((p: any) => !p.creator.is_claimed);
    } else if (filter === "registered") {
      filtered = filtered.filter((p: any) => p.creator.is_claimed);
    }

    if (q && typeof q === "string" && q.trim()) {
      const queryStr = q.toLowerCase().trim();
      filtered = filtered.filter((p: any) =>
        (p.creator.name && p.creator.name.toLowerCase().includes(queryStr)) ||
        (p.creator.handle && p.creator.handle.toLowerCase().includes(queryStr)) ||
        (p.brand.name && p.brand.name.toLowerCase().includes(queryStr)) ||
        (p.campaign_title && p.campaign_title.toLowerCase().includes(queryStr)) ||
        (p.message && p.message.toLowerCase().includes(queryStr))
      );
    }

    // Sort newest first
    filtered.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    res.json({
      pitches: filtered,
      stats
    });
  });

  // 2. GET /admin/pitch-leads/:threadId/messages
  router.get("/admin/pitch-leads/:threadId/messages", async (req, res) => {
    const admin = await verifyAdmin(req, res);
    if (!admin) return;

    const { threadId } = req.params;
    const db = getDb();

    let messages: any[] = [];
    if (supabase) {
      try {
        const { data: mData } = await (privilegedSupabase || supabase)
          .from("chat_messages")
          .select("*")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: true });
        if (mData) messages = mData;
      } catch (e) { logIgnored("admin_pitch_leads_routes:173", e); }
    }

    const localMsgs = (db.chat_messages || []).filter((m: any) => m.thread_id === threadId);
    localMsgs.forEach((lm: any) => {
      const mid = lm.message_id || lm.id;
      if (!messages.some((m: any) => (m.message_id || m.id) === mid)) {
        messages.push(lm);
      }
    });

    messages.sort((a: any, b: any) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

    res.json({ messages });
  });

  // 3. POST /admin/pitch-leads/:threadId/reply-as-creator
  // CRITICAL REQUIREMENT: The admin replies on behalf of the creator so the brand
  // experiences a direct, seamless response with no third-party friction or suspicion.
  router.post("/admin/pitch-leads/:threadId/reply-as-creator", async (req, res) => {
    const admin = await verifyAdmin(req, res);
    if (!admin) return;

    const { threadId } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Message text cannot be empty." });
    }

    const db = getDb();
    const chatThreads = db.chat_threads || [];
    const briefRequests = db.brief_requests || [];
    const creatorProfiles = db.creator_profiles || [];

    // Find thread
    let thread = chatThreads.find((t: any) => t.id === threadId || t.deal_id === threadId);
    if (!thread && supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase)
          .from("chat_threads")
          .select("*")
          .eq("id", threadId)
          .maybeSingle();
        if (data) thread = data;
      } catch (e) { logIgnored("admin_pitch_leads_routes:218", e); }
    }

    if (!thread) {
      // Check if threadId matches a brief_request
      const matchedBrief = briefRequests.find((b: any) => b.thread_id === threadId || b.id === threadId);
      if (matchedBrief) {
        thread = {
          id: matchedBrief.thread_id || threadId,
          brand_id: matchedBrief.brand_id,
          creator_id: matchedBrief.creator_id,
          creator_name: matchedBrief.creator_name
        };
      }
    }

    if (!thread) {
      return res.status(404).json({ error: "Pitch conversation thread not found." });
    }

    const cp = creatorProfiles.find((p: any) => p.user_id === thread.creator_id || p.id === thread.creator_id) || {};
    const creatorName = cp.name || cp.full_name || thread.creator_name || "Creator";

    const msgId = crypto.randomUUID();
    const nowIso = getIsoNow();

    const dbMsg = {
      message_id: msgId,
      thread_id: thread.id,
      sender_user_id: thread.creator_id, // Sent under creator's identity!
      receiver_user_id: thread.brand_id,
      sender_role: "creator",
      from_name: creatorName,
      text: text.trim(),
      content: text.trim(),
      message_type: "text",
      is_admin_brokered: true,
      created_at: nowIso,
      read: false
    };

    if (insertChatMessageToSupabase) {
      try {
        await insertChatMessageToSupabase(dbMsg);
      } catch (e) { logIgnored("admin_pitch_leads_routes:262", e); }
    } else if (supabase) {
      try {
        await (privilegedSupabase || supabase).from("chat_messages").insert(dbMsg);
      } catch (e) { logIgnored("admin_pitch_leads_routes:266", e); }
    }

    if (!db.chat_messages) db.chat_messages = [];
    const localMsg = {
      ...dbMsg,
      id: msgId,
      sender_id: thread.creator_id,
      receiver_id: thread.brand_id
    };
    db.chat_messages.push(localMsg);

    // Update thread updated_at
    const localThr = (db.chat_threads || []).find((t: any) => t.id === thread.id);
    if (localThr) {
      localThr.updated_at = nowIso;
      localThr.last_message = localMsg;
    }

    // Advance pitch lead status to IN_NEGOTIATION if currently NEW
    const pitch = briefRequests.find((b: any) => b.thread_id === thread.id || b.creator_id === thread.creator_id);
    if (pitch && (pitch.status === "NEW" || !pitch.status)) {
      pitch.status = "IN_NEGOTIATION";
      pitch.updated_at = nowIso;
    }

    saveDb(db);

    // Emit live socket event so the brand immediately sees the message!
    const io = req.app.get("io");
    if (io) {
      io.to(thread.id).emit("new_message", localMsg);
      io.to(`user_${thread.brand_id}`).emit("new_message", localMsg);
      emitThreadEvent(io, "thread_updated", { threadId: thread.id, last_message: localMsg });
    }

    if (logAdminAction) {
      logAdminAction(admin.user_id, "BROKER_PITCH_REPLY", "pitch_lead", thread.id, `Replied as creator ${creatorName} to brand`);
    }

    res.json({
      success: true,
      message: localMsg
    });
  });

  // 4. PATCH /admin/pitch-leads/:id/status
  router.patch("/admin/pitch-leads/:id/status", async (req, res) => {
    const admin = await verifyAdmin(req, res);
    if (!admin) return;

    const { id } = req.params;
    const { status, admin_notes } = req.body;
    if (status && !PITCH_STATUSES.includes(String(status).toUpperCase())) {
      return res.status(400).json({ error: "Unknown status." });
    }

    // Session 38: find it in Supabase too; save admin's status/notes to pitch_lead_admin (never
    // the invite row's own status — that drives the locked invite flow).
    const { briefRequests } = await loadPitchData({ getClient: () => privilegedSupabase || null, getDb });
    const pitch = briefRequests.find((b: any) => b.id === id || b.thread_id === id);

    if (!pitch) {
      return res.status(404).json({ error: "Pitch lead record not found." });
    }

    const saveErr = await saveAdminPitchFields(privilegedSupabase || null, String(pitch.id), {
      admin_status: status ? String(status).toUpperCase() : undefined,
      admin_notes: admin_notes !== undefined ? String(admin_notes) : undefined,
    }, admin.user_id);
    if (saveErr) return res.status(502).json({ error: `Couldn't save: ${saveErr}` });

    if (status) pitch.status = String(status).toUpperCase();
    if (admin_notes !== undefined) pitch.admin_notes = admin_notes;
    pitch.updated_at = getIsoNow();
    const db = getDb();
    const localPitch = (db.brief_requests || []).find((b: any) => b.id === pitch.id);
    if (localPitch) { Object.assign(localPitch, { status: pitch.status, admin_notes: pitch.admin_notes, updated_at: pitch.updated_at }); saveDb(db); }

    if (logAdminAction) {
      logAdminAction(admin.user_id, "UPDATE_PITCH_STATUS", "pitch_lead", id, `Updated pitch status to ${status}`);
    }

    res.json({
      success: true,
      pitch
    });
  });

  // 5. POST /admin/pitch-leads/:id/send-creator-email
  router.post("/admin/pitch-leads/:id/send-creator-email", async (req, res) => {
    const admin = await verifyAdmin(req, res);
    if (!admin) return;

    const { id } = req.params;
    const { custom_note, target_email } = req.body;

    const db = getDb();
    // Session 38: Supabase invites too (the local file alone was empty on Cloud Run).
    const { briefRequests } = await loadPitchData({ getClient: () => privilegedSupabase || null, getDb });
    const pitch = briefRequests.find((b: any) => b.id === id || b.thread_id === id);

    if (!pitch) {
      return res.status(404).json({ error: "Pitch lead record not found." });
    }

    const emailToSend = target_email || pitch.creator_email;
    if (!emailToSend) {
      return res.status(400).json({ error: "No email address found for this creator. Please provide an email." });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Email service (Resend API key) is not configured." });
    }

    try {
      const resendClient = new Resend(apiKey);
      const appUrl = publicSiteUrl(); // v373: ybex.club is not our domain · v388: never the AI Studio address

      // v373: the button used `url` (the builder reads `link`) so it opened "undefined"; the unclaimed link went to the
      // old /auth/register. Plain English, the offer first, typed text escaped.
      const e = (v: any) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]);
      const { emailFactsHtml } = await import("./helpers");
      const emailHtml = buildEmailHtml({
        eyebrow: "Paid offer",
        icon: "&#129309;",
        preheader: `${e(pitch.budget_range || "Paid")} · ${pitch.creator_is_claimed ? "reply in chat" : "claim your profile to reply"}`,
        title: `${e(pitch.brand_name)} has a paid offer for you`,
        greeting: `Hi ${e(String(pitch.creator_name || "there").split(" ")[0])},`,
        paragraphs: [
          `<strong>${e(pitch.brand_name)}</strong> wants to work with you on a paid campaign on Ybex.`,
          ...(pitch.message ? [`<em>“${e(pitch.message)}”</em>`] : []),
          ...(custom_note ? [e(custom_note)] : []),
        ],
        blocks: emailFactsHtml([["Campaign", e(pitch.campaign_title || "Direct collaboration")], ["Budget", e(pitch.budget_range || "To discuss")], ["Deliverables", e(pitch.deliverables || "")], ["Timeline", e(pitch.timeline || "")]]),
        button: {
          text: pitch.creator_is_claimed ? "Reply in chat" : "Claim my profile and reply",
          link: pitch.creator_is_claimed
            ? `${appUrl}/chat/${pitch.thread_id}`
            : `${appUrl}/signup?role=creator&ref=pitch&email=${encodeURIComponent(emailToSend)}`
        },
        reason: "You're getting this because a brand wants to work with you on Ybex.",
      });

      const response = await resendClient.emails.send({
        from: getValidFromEmail("YBEX Collaborations <collabs@ybexmedia.in>"),
        to: emailToSend,
        subject: `${pitch.brand_name} wants to pay you ${pitch.budget_range || ""} for a collab`.replace(/\s+for/, " for"),
        html: emailHtml
      });

      pitch.admin_notes = (pitch.admin_notes ? pitch.admin_notes + "\n" : "") + `[${new Date().toLocaleDateString()}] Outreach email sent to ${emailToSend}`;
      pitch.updated_at = getIsoNow();
      await saveAdminPitchFields(privilegedSupabase || null, String(pitch.id), { admin_notes: pitch.admin_notes }, admin.user_id);
      const localPitch = (db.brief_requests || []).find((b: any) => b.id === pitch.id);
      if (localPitch) { localPitch.admin_notes = pitch.admin_notes; localPitch.updated_at = pitch.updated_at; }
      saveDb(db);

      res.json({
        success: true,
        message: `Outreach email sent successfully to ${emailToSend}!`,
        resend_data: response.data
      });
    } catch (err: any) {
      console.error("[send-creator-email error]:", err);
      res.status(500).json({ error: err?.message || "Failed to send email outreach." });
    }
  });
}
