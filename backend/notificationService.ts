// Notification helpers: in-app notifications, admin broadcasts, activity / super-admin emails.
// Moved out of server.ts in session 22 — behaviour unchanged. Admin alerts reach admins only
// (see docs/code/ARCHITECTURE.md "PROTECTED CHANGES" #16).
const escapeHtml = (v: any): string => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]); // Session 58
import { Resend, buildEmailHtml } from "./helpers";
import { ADMIN_ROOM } from "./socketAccess";
import { publicSiteUrl } from "./siteUrl"; // v388

/** v400 (Ravi: "deal / campaign updates turant dikhani hogi"): these activity e-mails go at once; KYC, new-work digests and
 *  other notices wait for the night window (backend/emailBudget.ts). */
export function activityEmailPriority(type: string): "high" | "low" {
  const t = String(type || "").toUpperCase();
  if (/KYC|ASSIST_NEW|NEW_CREATORS|WELCOME|PROFILE/.test(t)) return "low";
  return /CAMPAIGN|APPLI|APPLY|DEAL|OFFER|PAY|REFUND|ESCROW|UGC|ORDER|BRIEF|INVITE|CONTRACT|DELIVER|REVISION|DRAFT|SUBMISSION|HIRE|SHORTLIST|COLLAB|MILESTONE|DISPUTE/.test(t)
    ? "high" : "low";
}

/** v400: notification types that never send an e-mail (bell + phone push only). */
export const NO_EMAIL_TYPES = new Set(['USER_REGISTERED', 'KYC_SUBMITTED', 'PROFILE_NUDGE', 'PHOTO_NUDGE']);

/** v373: subject / heading / button for one in-app notice that is also emailed. Pure (tested). */
export function activityEmailCopy(type: string, message = ""): { subject: string; heading: string; ctaLabel: string; ctaUrl: string; preheader: string; eyebrow: string } {
  const t = String(type || "").toUpperCase();
  const normalizedType = t; // (name kept: v291 checks KYC / PROFILE come before the content branch)
  const first = String(message || "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "").split(/\n|(?<=[.!?])\s/)[0].trim().slice(0, 90);
  const c = (subject: string, heading: string, ctaLabel: string, ctaUrl: string, eyebrow: string, preheader = first) => ({ subject, heading, ctaLabel, ctaUrl, eyebrow, preheader });
  if (normalizedType.includes('KYC')) {
    const ok = t.includes("APPROVED") || t.includes("VERIFIED"), no = t.includes("REJECT") || t.includes("FAIL");
    // v419 (Ravi: subject = just "KYC approved" / "KYC rejected"). The Users page sends type "kyc_update", so the
    // message decides too (it used to fall into "Update on your Ybex KYC").
    const m = String(message || "").toLowerCase();
    const ok2 = ok || (!no && /approved|verified/.test(m) && !/not approved|rejected/.test(m));
    const no2 = no || /rejected|not approved|failed/.test(m);
    return ok2 && !no2 ? c("KYC approved", "Your KYC is verified", "Open Earnings", "/earnings", "KYC")
      : no2 ? c("KYC rejected", "Your KYC needs one change", "Fix my KYC", "/kyc", "KYC")
        : c("KYC update — more details needed", "Your KYC needs a detail", "Check KYC", "/kyc", "KYC");
  }
  if (normalizedType.includes('PROFILE') && (t.includes("APPROVED") || t.includes("LIVE"))) return c("Your profile is now live for brands", "You're live on Ybex", "See my profile", "/profile", "Approved"); // v419
  if (t.includes("PROFILE") && t.includes("REJECT")) return c("Profile needs one fix", "Your profile needs a change", "Open my profile", "/profile", "Profile");
  if (t.startsWith("CAMPAIGN_LIVE")) return c("Your campaign is live", "Your campaign is live", "Open my campaigns", "/brand/campaigns", "Campaign live");
  if (t.startsWith("CAMPAIGN_REJECT")) return c("Campaign needs one fix", "Your campaign needs changes", "Open my campaigns", "/brand/campaigns", "Campaign");
  if (t.includes("PAYOUT")) {
    const admin = t.includes("ADMIN");
    if (admin) return c("💸 Payout request waiting", // admin-only; a test pins this subject
       "A creator asked for a payout", "Open payout requests", "/admin?tab=escrow&view=requests", "Admin");
    return t.includes("RELEASED") ? c("Payout sent to your bank", "Your payout is sent", "Open Earnings", "/earnings", "Payout")
      : c("Payout update", "Your payout was updated", "Open Earnings", "/earnings", "Payout");
  }
  if (t === "REFUND_DUE") return c("Refund needed — action", "A refund needs your action", "Open payments", "/admin?tab=escrow", "Admin");
  if (t.includes("REFUND_ACCOUNT")) return c("Add your refund account", "Add your refund account", "Add refund account", "/brand/payments", "Refund");
  if (t.includes("REFUND")) return c("Refund on the way", "Your refund is on its way", "Open payments", "/brand/payments", "Refund");
  if (t.includes("DEAL_SETTLED")) return c("Deal settled", "Your deal is settled", "Open my deals", "/collabs", "Deal");
  if (t.includes("PAYMENT_FUNDED") || t.includes("DEAL_SIGNED") || t.includes("PAYMENT_RECEIVED") || t.includes("ESCROW"))
    return c("Deal confirmed — start work", "Payment is held safely — you can start", "Open the deal", "/collabs", "Deal confirmed");
  if (t.includes("OFFER")) return c("New paid offer — reply now", "You received an offer", "Open the chat", "/chat", "Offer");
  if (t.includes("APPLICATION") || t.includes("APPLY")) return c("New creator applied", "A creator applied", "Review applications", "/brand/campaigns", "Campaign");
  if (t.includes("SUBMITTED") || t.includes("UGC_READY") || t.includes("PROOF")) return c("Draft ready — review now", "A draft is ready for review", "Review the draft", "/collabs", "Draft");
  if (t.includes("APPROVED")) return c("Your work is approved", "Your work was approved", "Open the deal", "/collabs", "Approved");
  if (t.includes("REJECTED") || t.includes("REVISION")) return c("Brand asked for a change", "A change was requested", "See the note", "/collabs", "Change");
  if (t.includes("BRIEF") || t.includes("COST")) return c("A brand wants you", "A brand is interested", "Open the chat", "/chat", "Brand");
  if (t.includes("TICKET") || t.includes("SUPPORT")) return c("Support replied", "Support replied", "Open my tickets", "/help/tickets", "Support");
  if (t.includes("ADMIN") || t.includes("CUSTOM") || t === "REMINDER") return c(first || "A message from the Ybex team", "A message from the Ybex team", "Open Ybex", "/dashboard", "Ybex team");
  return c(first.length <= 45 && first ? first : "Ybex update", "Update on your account", "Open Ybex", "/dashboard", "Update");
}


/** v419: e-mail-safe Explore-style creator card + the red "change your photo" line. Pure (tested). */
export function profileCardHtml(cp: any, site: string): string {
    const fmt = (n: any) => { const v = Number(n) || 0; return v >= 1e5 ? (v / 1e5).toFixed(1).replace(/\.0$/, "") + "L" : v >= 1e3 ? (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : v ? String(v) : "—"; };
    const photo = String(cp.photo || cp.picture || cp.profile_photo_url || "").trim();
    const name = escapeHtml(String(cp.name || "").replace(/^@/, "").slice(0, 40) || "You");
    const handle = escapeHtml(String(cp.instagram_handle || "").replace(/^@/, "").slice(0, 30));
    const niche = escapeHtml(String(cp.primary_niche || cp.category || cp.niche || "").slice(0, 30));
    const city = escapeHtml(String(cp.city || "").slice(0, 24));
    const followers = fmt(cp.instagram_followers ?? cp.followers ?? cp.follower_count);
    const reach = fmt(cp.avg_reach ?? cp.average_reach ?? cp.avg_views ?? cp.instagram_stats?.avg_views);
    const F = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";
    // v419 (Ravi: "aisi thodi dikhti hai creators ko"): the same card as Explore — the photo fills the card, a dark
    // shade at the bottom with the name, followers (+ avg reach) and city with a pin.
    const hasPhoto = Boolean(photo && /^https?:\/\//.test(photo));
    const bg = hasPhoto ? `background:#2A2734 url('${escapeHtml(photo)}') center / cover no-repeat;background-color:#2A2734` : "background:#D9CBB0;background-image:linear-gradient(180deg,#E6D8BE 0%,#A08D6E 100%)";
    const initials = `<div style="width:64px;height:64px;border-radius:32px;background:#F6F4F1;color:#3F3A4F;font:800 22px/64px ${F};text-align:center;margin:0 auto">${name.charAt(0).toUpperCase()}</div>`;
    const reachTxt = reach !== "—" ? ` · ${reach} avg reach` : "";
    return `<p style="margin:6px 0 10px;font:700 12px ${F};letter-spacing:1px;color:#8A8599;text-align:center">THIS IS HOW BRANDS SEE YOU</p>
<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="width:230px;margin:0 auto 16px;border-collapse:separate">
<tr><td height="300" valign="bottom" style="height:300px;width:230px;border-radius:18px;overflow:hidden;${bg}">
${hasPhoto ? `<!--[if mso]><img src="${escapeHtml(photo)}" width="230" height="300" alt=""><![endif]-->` : `<div style="padding-top:56px">${initials}</div>`}
<div style="padding:${hasPhoto ? "150px" : "70px"} 14px 14px;border-radius:0 0 18px 18px;background:linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(10,8,20,.82) 100%)">
<div style="font:800 17px ${F};color:#FFFFFF">${name}</div>
<div style="font:700 12.5px ${F};color:#FFFFFF;opacity:.95;margin-top:2px">${followers} followers</div>
${reachTxt ? `<div style="font:600 11.5px ${F};color:#FFFFFF;opacity:.85;margin-top:1px">${reach} avg reach</div>` : ""}
${city ? `<div style="font:600 11.5px ${F};color:#FFFFFF;opacity:.85;margin-top:6px">&#128205; ${city}</div>` : ""}
</div></td></tr></table>
<p style="margin:0 0 16px;font:700 13.5px/1.5 ${F};color:#DC2626;text-align:center">Your photo is the first thing brands see. Not your best? <a href="${site}/profile" style="color:#DC2626;text-decoration:underline">Change it now</a> — a clear face photo gets more offers.</p>`;
}

export function createNotificationService(deps: {
  clients: () => { supabase: any; privilegedSupabase: any };
  getDb: () => any;
  saveDb: (db: any) => void;
  getIsoNow: () => string;
  app: any;
}) {
  async function broadcastAdminNotification({
    type,
    message,
    metadata = {},
    actor_id,
    title
  }: {
    type: string;
    message: string;
    metadata?: any;
    actor_id?: string;
    title?: string;
  }) {
    try {
      const notifId = "notif_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
      const createdAt = deps.getIsoNow();
      const payload: any = {
        notif_id: notifId,
        user_id: 'admin',
        type: type || 'admin_system_alert',
        message: message,
        title: title || null,
        read: false,
        is_admin_message: true,
        // v396: event_type keeps the live socket copy and this server's local copy out of the blocking
        // pop-up too (the Supabase rows already had it) — "Pending Creator Verification" kept popping up.
        event_type: type || 'admin_system_alert',
        created_at: createdAt
      };

      // 1. Insert into local DB
      const db = deps.getDb();
      if (!db.notifications) db.notifications = [];
      db.notifications.unshift(payload);
      deps.saveDb(db);

      // 2. Insert into Supabase notifications table
      if (deps.clients().supabase) {
        try {
          const { data: adminUsers } = await deps.clients().supabase
            .from('users')
            .select('user_id')
            .or('role.eq.admin,role.eq.sub_admin,team_role.eq.sub_admin');
          
          // No copy for the 'all' audience. That is the platform-wide broadcast list — every
          // creator and brand reads it — so each admin alert (a new signup's name, email and
          // role, KYC submissions, …) used to land in every user's notification list.
          // Session 58: notifications.user_id must be a real user (foreign key) — the extra 'admin' row made the WHOLE
          // insert fail, so payout-due / refund-due / KYC alerts never reached any admin's bell or phone. One row per
          // admin now; event_type keeps them out of the blocking pop-up.
          const rowsToInsert: any[] = [];

          if (adminUsers && adminUsers.length > 0) {
            adminUsers.forEach((adm: any) => {
              if (adm.user_id && adm.user_id !== 'admin') {
                rowsToInsert.push({
                  ...payload,
                  notif_id: notifId + "_" + (adm.user_id || '').slice(-6),
                  user_id: adm.user_id,
                  event_type: payload.type || 'admin_system_alert',
                });
              }
            });
          }

          if (rowsToInsert.length) {
            const { error: insErr } = await (deps.clients().privilegedSupabase || deps.clients().supabase).from('notifications').insert(rowsToInsert);
            if (insErr) console.error("[Admin Notification] not saved:", insErr.message);
          }
        } catch (sErr) {
          console.warn("[Admin Notification Supabase Insert Warning]", sErr);
        }
      }

      // 3. Emit real-time Socket.io events
      const ioInstance = deps.app.get("io");
      if (ioInstance) {
        // Admins only. This also emitted to EVERY socket (the old admin room it targeted had no
        // members), so each admin alert popped up live for every user.
        ioInstance.to(ADMIN_ROOM).emit("admin_notification", payload);
        ioInstance.to(ADMIN_ROOM).emit("bell_notification", payload);
        ioInstance.to(ADMIN_ROOM).emit("new_notification", payload);
      }
      return payload;
    } catch (err) {
      console.error("[Broadcast Admin Notification Error]", err);
    }
  }

  /** v419 (Ravi: "profile approve mail mein unka card dikhe — jaise Explore mein dikhte hain — aur photo badalne ki
   *  red line"): an e-mail-safe copy of the Explore creator card (photo, name, @handle, niche, followers, avg reach). */
  async function profileCardBlock(type: string, toEmail: string, site: string): Promise<string> {
    const t = String(type || "").toUpperCase();
    if (!(t.includes("PROFILE") && (t.includes("APPROVED") || t.includes("LIVE")))) return "";
    let cp: any = null;
    try {
      const db = deps.clients().privilegedSupabase || deps.clients().supabase;
      if (db) { const { data } = await db.from("creator_profiles").select("*").ilike("email", toEmail).limit(1); cp = data?.[0] || null; }
    } catch { /* card is optional */ }
    if (!cp) cp = (deps.getDb()?.creator_profiles || []).find((x: any) => String(x.email || "").toLowerCase() === String(toEmail).toLowerCase()) || null;
    if (!cp) return "";
    return profileCardHtml(cp, site);
  }

  async function sendActivityNotificationEmail({
    toEmail,
    recipientName,
    type,
    message
  }: {
    toEmail: string;
    recipientName: string;
    type: string;
    message: string;
  }) {
    if (!toEmail || !toEmail.includes('@') || toEmail.endsWith('.demo') || toEmail.includes('@example.com') || toEmail.endsWith('@ybex.io')) return;
    // Session 58 (Ravi: "user ko warning vali mail ka jhanjhat hatana hai"): warning / suspend / ban no longer
    // email the user. The in-app notice, the violation record and the super-admin alert stay as they were.
    const accountActionType = String(type || '').toUpperCase();
    if (["WARN", "WARNING", "ACCOUNT_WARNING", "SUSPEND", "SUSPENDED", "ACCOUNT_SUSPENDED", "BAN", "BANNED", "ACCOUNT_BANNED"].includes(accountActionType)) return;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.log(`[Resend Notification Skipped - No RESEND_API_KEY] To: ${toEmail} | Message: ${message}`);
      return;
    }

    try {
      const resendClient = new Resend(apiKey);
      const fromEmail = process.env.RESEND_FROM_EMAIL || "Ybex <noreply@ybexmedia.in>";
      const appBaseUrl = publicSiteUrl(); // v388

      // v373 (Ravi: subjects that say the point first, plain English, right page): one table for every notice type.
      // Fixed: a rejected CAMPAIGN fell into "Content revision requested" (button to deals); campaign live, payment held,
      // refunds, settled deals and admin reminders all got "New activity on Ybex Media" + a Home button.
      const copy = activityEmailCopy(type, message);
      const { subject, heading, ctaLabel, ctaUrl } = copy;
      const fullCtaUrl = `${appBaseUrl}${ctaUrl.startsWith('/') ? '' : '/'}${ctaUrl}`;

      // v396 (QA E-3): brand-facing notices (refunds, campaigns, applications) greet the company by its full name —
      // "Hi Glow," for Glow Naturals read wrong. People still get their first name.
      const fullName = String(recipientName || "").trim();
      const brandFacing = /REFUND|CAMPAIGN|APPLICATION|APPLY/.test(String(type || "").toUpperCase());
      const firstName = brandFacing ? fullName.slice(0, 40) : fullName.split(/\s+/)[0];
      const htmlContent = buildEmailHtml({
      title: heading,
      preheader: escapeHtml(copy.preheader || ""),
      eyebrow: copy.eyebrow,
      reason: "You're getting this because of activity on your Ybex account.",
      greeting: firstName && firstName.toLowerCase() !== "there" ? `Hi ${escapeHtml(firstName)},` : "Hi there,",
      paragraphs: [
        "<div style='white-space: pre-wrap;'>" + escapeHtml(message) + "</div>"
      ],
      button: ctaLabel ? { text: ctaLabel, link: fullCtaUrl } : undefined,
      blocks: await profileCardBlock(type, toEmail, appBaseUrl), // v419: how brands see them
    });

      const response = await resendClient.emails.send({ priority: activityEmailPriority(type), // v400: deal / campaign / payment now, the rest at night
        from: fromEmail,
        to: [toEmail],
        subject: subject,
        html: htmlContent
      });

      if (response.error) {
        console.warn(`[Resend Activity Mailer Error] ${toEmail}: ${response.error.message}`);
      } else {
        console.log(`[Resend Activity Mailer Success] Sent to ${toEmail} | Subject: ${subject}`);
      }
    } catch (err: any) {
      console.error(`[Resend Activity Mailer Exception] ${toEmail}:`, err?.message || err);
    }
  }

  async function sendSuperAdminAlertEmail({
    subject,
    title,
    details
  }: {
    subject: string;
    title: string;
    details: string;
  }) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;

    const adminEmails = new Set<string>();
    if (process.env.ADMIN_EMAIL) adminEmails.add(process.env.ADMIN_EMAIL.toLowerCase());
    adminEmails.add('commonuseforpro@gmail.com');

    const recipients = Array.from(adminEmails).filter(e => e && e.includes('@') && !e.endsWith('@placeholder.demo'));
    if (recipients.length === 0) return;

    try {
      const resendClient = new Resend(apiKey);
      const fromEmail = process.env.RESEND_FROM_EMAIL || "Ybex <noreply@ybexmedia.in>";
      const appUrl = publicSiteUrl(); // v388

      const htmlContent = buildEmailHtml({
      title: escapeHtml(subject),
      greeting: "Admin Team,",
      // Session 58: user-typed text (sign-up names, payout notes) is escaped — it could put a fake link in a real Ybex email.
      paragraphs: ["<pre style='background: #f8fafc; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 13px; color: #334155; white-space: pre-wrap;'>" + escapeHtml(details) + "</pre>"],
      button: { text: "Open Admin Dashboard", link: appUrl + "/admin" }
    });

      for (const adminEmail of recipients) {
        await resendClient.emails.send({ priority: "low", // v399 email budget: waits for the night window
          from: fromEmail,
          to: [adminEmail],
          subject: `[ADMIN ALERT] ${subject}`,
          html: htmlContent
        }).catch(e => console.warn(`[SuperAdminAlert] Error sending to ${adminEmail}:`, e?.message));
      }
    } catch (err: any) {
      console.error("[SuperAdminAlert Exception]:", err?.message || err);
    }
  }

  async function sendNotification(db: any, userId: string, type: string, message: string) {
    if (!userId) {
      console.warn("[sendNotification] Warning: recipient userId is undefined or empty. Skipping notification.");
      return;
    }
    const notif_id = `notif_${Math.random().toString(36).substring(2, 11)}`;
    const created_at = deps.getIsoNow();

    const actualDb = db || deps.getDb();
    if (actualDb) {
      if (!actualDb.notifications) actualDb.notifications = [];
      actualDb.notifications.push({
        notif_id,
        user_id: userId,
        type,
        message,
        read: false,
        created_at
      });
      if (!db) {
        deps.saveDb(actualDb);
      }
    }

    // Trigger Resend email notification asynchronously in background
    (async () => {
      try {
        let recipientEmail: string | null = null;
        let recipientName: string = 'User';

        if (actualDb && actualDb.users) {
          const found = actualDb.users.find((u: any) => u.user_id === userId || u.id === userId);
          if (found && found.email) {
            recipientEmail = found.email;
            recipientName = found.full_name || found.name || found.brand_name || found.company_name || 'User';
          }
        }

        if (!recipientEmail && deps.clients().supabase) {
          const { data: uData } = await (deps.clients().privilegedSupabase || deps.clients().supabase).from('users').select('email, name').eq('user_id', userId).maybeSingle();
          if (uData && uData.email) {
            recipientEmail = uData.email;
            recipientName = uData.name || 'User';
          }
        }

        // Skip immediate email for routine chat messages to prevent email flooding/spam
        // Real-time notification is already sent to the UI/bell and socket
        const normType = (type || '').toUpperCase();
        if (normType.includes('MESSAGE') || normType === 'NEW_MESSAGE' || normType === 'CHAT') {
          return;
        }
        // Session 58 (Ravi: "emails kam karo"): bell + phone push only, no email, for these:
        // the brand just submitted the campaign itself; a fraud re-check note; warning / suspend / ban.
        if (['CAMPAIGN_UNDER_REVIEW', 'VERIFICATION', 'WARNING', 'SUSPEND', 'BAN'].includes(normType)) {
          return;
        }
        // v373: a support reply already sends its own email with the reply text — this was the second one.
        if (normType === 'SUPPORT_REPLY') return;
        // v400 (Ravi 4 Nov, Resend free = 100 mails/day): on 4 Nov these alone were ~440 e-mails (247 user_registered + 92
        // kyc_submitted to every admin, 103 profile nudges). Bell + phone push only for them — no e-mail.
        if (NO_EMAIL_TYPES.has(normType)) return;
        // Staff log in to the admin panel and see the bell; their @admin.ybex logins are not real mailboxes.
        if (/@admin\.ybex$/i.test(String(recipientEmail || ''))) return;

        if (recipientEmail && recipientEmail.includes('@') && !recipientEmail.endsWith('@placeholder.demo')) {
          await sendActivityNotificationEmail({
            toEmail: recipientEmail,
            recipientName,
            type,
            message
          });
        }
      } catch (emailErr) {
        console.warn(`[sendNotification:Email] Failed to trigger activity email for ${userId}:`, emailErr);
      }
    })();

    if (deps.clients().supabase) {
      (async () => {
        try {
          // Check if recipient user exists in public.users to prevent foreign key violation
          const { data: userExists } = await deps.clients().supabase
            .from("users")
            .select("user_id")
            .eq("user_id", userId)
            .maybeSingle();

          // Session 58: a missing recipient (e.g. an account an admin wiped) is skipped. It used to INSERT a fake,
          // onboarded user ("<id>@placeholder.demo") that then showed up in admin and user lists.
          if (!userExists) {
            console.warn(`[sendNotification] Recipient ${userId} not found — notification skipped.`);
            return;
          }

          const { error } = await (deps.clients().privilegedSupabase || deps.clients().supabase).from("notifications").insert({
            notif_id,
            user_id: userId,
            type,
            message,
            read: false,
            created_at
          });

          if (error) {
            console.log(`Supabase Realtime notification dispatch error for user ${userId}:`, error.message || error);
          } else {
            console.log(`Realtime notification triggered on Supabase for ${userId}: ${type}`);
          }
        } catch (err: any) {
          console.log(`Supabase Realtime notification catch error for user ${userId}:`, err?.message || err);
        }
      })();
    }
  }

  return { broadcastAdminNotification, sendActivityNotificationEmail, sendSuperAdminAlertEmail, sendNotification };
}
