import express from "express";
import crypto from "crypto";

// Session 43 (v287, Ravi): "Ybex Assist" feedback bot on the creator + brand dashboards.
// No new table: every chat becomes a Support Ticket (support_tickets + ticket_messages, the tables
// the Help desk already uses) with page_context "/feedback-bot", so replies work from the Help desk
// too. Admin → Feedback lists them with the sender's basic details.
//
//   POST /feedback              { ticket_id?, category, message, attachments[], screen, app_version, os, device_model }
//                               → first message makes the ticket, later ones are added to it
//   GET  /admin/feedback?category=bug|feature|confusing|general&role=creator|brand

export const FEEDBACK_PAGE = "/feedback-bot";
export const FEEDBACK_CATEGORIES: Record<string, string> = {
  bug: "Feedback · Bug",
  feature: "Feedback · Suggestion",
  confusing: "Feedback · Confusing",
  general: "Feedback · General",
};
const KIND_OF = Object.fromEntries(Object.entries(FEEDBACK_CATEGORIES).map(([k, v]) => [v, k]));

// v419 (Eva security review M3): only our own uploads — any https URL (tracking pixel / phishing link shown to the
// admin as "Screenshot") and "/uploads/../.." paths were accepted.
export function isOwnAttachment(a: string): boolean {
  if (!a || a.length > 600 || a.includes("..")) return false;
  if (/^\/api\/files\/[\w-]+$/.test(a) || /^\/uploads\/[\w./-]+$/.test(a)) return true;
  try {
    const u = new URL(a);
    if (u.protocol !== "https:") return false;
    const own = [process.env.SUPABASE_URL, process.env.VITE_SUPABASE_URL, "https://ybexmedia.in", "https://www.ybexmedia.in"]
      .filter(Boolean).map((x) => { try { return new URL(String(x)).host; } catch { return ""; } }).filter(Boolean);
    return own.includes(u.host);
  } catch { return false; }
}

export function cleanFeedback(body: any): { item?: any; error?: string } {
  const message = String(body?.message || "").trim().slice(0, 2000);
  if (!message) return { error: "Write a message." };
  const category = FEEDBACK_CATEGORIES[String(body?.category)] ? String(body.category) : "general";
  const attachments = (Array.isArray(body?.attachments) ? body.attachments : [])
    .map((a: any) => String(a || "")).filter(isOwnAttachment).slice(0, 4);
  const short = (v: any, n = 80) => String(v || "").trim().slice(0, n);
  return {
    item: {
      ticket_id: short(body?.ticket_id, 64) || null, category, message, attachments,
      screen: short(body?.screen, 60) || "dashboard", app_version: short(body?.app_version, 30),
      os: short(body?.os, 40), device_model: short(body?.device_model, 80),
    },
  };
}

/** One readable line the team sees under the first message. */
export const deviceLine = (it: any) =>
  [it.screen && `Screen: ${it.screen}`, it.os && `OS: ${it.os}`, it.device_model && `Device: ${it.device_model}`, it.app_version && `App: ${it.app_version}`]
    .filter(Boolean).join(" · ");

/** v293 (Ravi: "make what the bot collects smarter"): no new column — the area and the urgency are worked
 *  out from the person's own words when the ticket is made (subject / priority) and again when admin reads. */
export const FEEDBACK_AREAS: [string, RegExp][] = [
  ["Payments", /payment|\bpay\b|paid|refund|razorpay|money|payout|withdraw|wallet|invoice|\bupi\b|bank|earning|escrow|secure hold/i],
  ["Chat & deals", /\bchat|message|offer|contract|agreement|negotiat|\bdeal|\bsign(ed|ing)?\b|inbox/i],
  ["Campaigns", /campaign|applicant|\bapply|applied|brief|invite/i],
  ["UGC orders", /\bugc|draft|live link|video|\border/i],
  ["Login & account", /log ?in|sign ?up|\botp\b|password|account|e-?mail|google|apple/i],
  ["Profile & KYC", /profile|\bkyc|verif|photo|\bbio\b|portfolio|rate card|niche|onboarding/i],
  ["Explore", /explore|search|filter|browse|creators list/i],
  ["Notifications", /notification|\bpush\b|alert/i],
  ["Refer & Earn", /refer|coupon|reward|creator code/i],
  ["App speed & look", /slow|\blag|crash|hang|freez|loading|splash|keyboard|scroll|status bar|\bui\b|design|dark mode|colou?r/i],
];
export function detectArea(text: string, screen = ""): string {
  const t = `${text || ""} ${screen || ""}`;
  let best = "", top = 0;
  for (const [name, re] of FEEDBACK_AREAS) {
    const g = new RegExp(re.source, "gi");
    const n = (t.match(g) || []).length;
    if (n > top) { top = n; best = name; }
  }
  return best;
}
const URGENT = /crash|can'?t log ?in|cannot log ?in|unable to (log|pay|sign)|money|payment|paid|refund|stuck|not (opening|loading|working)|nahi (chal|khul)|paise/i;
export function feedbackPriority(category: string, text: string, area = ""): "HIGH" | "MEDIUM" | "LOW" {
  if (category === "bug") return URGENT.test(text) || area === "Payments" || area === "Login & account" ? "HIGH" : "MEDIUM";
  if (category === "confusing") return "MEDIUM";
  return "LOW";
}
/** The footer the bot adds ("— Screen: … · OS: …") is split from the person's own words. */
export function splitDevice(raw: string): { text: string; device: string } {
  const m = String(raw || "").match(/^([\s\S]*?)\n\n— (Screen: [^\n]*)$/);
  return m ? { text: m[1], device: m[2] } : { text: String(raw || ""), device: "" };
}

// v329: + sub-admins — adminPermissionGate already requires "manage_helpdesk" for /admin/feedback, but this check
// refused every sub-admin anyway (the Help desk tickets route lets them in).
// v329 review: no bare team_role check — a non-admin role with a stale team_role "sub_admin" skips the gate's
// manage_helpdesk check (adminPermissions.isSubAdmin needs role admin / sub_admin), so it must not pass here.
const isAdmin = (u: any) => Boolean(u && (u.role === "admin" || u.role === "sub_admin" || u.is_admin === true));
const LIMIT_PER_HOUR = 30;
const hits = new Map<string, { n: number; at: number }>();
export function feedbackAllowed(userId: string, now = Date.now()) {
  const h = hits.get(userId);
  if (!h || now - h.at > 3600e3) { hits.set(userId, { n: 1, at: now }); return true; }
  h.n += 1;
  if (hits.size > 5000) hits.clear();
  return h.n <= LIMIT_PER_HOUR;
}

export function setupFeedbackRoutes(
  router: express.Router,
  { supabase, privilegedSupabase, parseAuthUser, getDb, saveDb }: {
    supabase: any; privilegedSupabase: any; parseAuthUser: (req: express.Request) => Promise<any>; getDb: () => any; saveDb: (db: any) => void;
  }
) {
  const sb = () => privilegedSupabase || supabase;

  router.post("/feedback", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Please log in." });
    if (!feedbackAllowed(String(user.user_id))) return res.status(429).json({ error: "Too many messages. Try again in a bit." });
    const { item, error } = cleanFeedback(req.body);
    if (error) return res.status(400).json({ error });
    const now = new Date().toISOString();
    let ticketId: string | null = null;

    // A follow-up message goes into the same ticket — only the person's own feedback ticket.
    if (item.ticket_id) {
      if (sb()) {
        const { data } = await sb().from("support_tickets").select("ticket_id,user_id,page_context").eq("ticket_id", item.ticket_id).maybeSingle();
        if (data && data.user_id === user.user_id && data.page_context === FEEDBACK_PAGE) ticketId = data.ticket_id;
      } else {
        const t = (getDb().support_tickets || []).find((x: any) => x.ticket_id === item.ticket_id);
        if (t && t.user_id === user.user_id && t.page_context === FEEDBACK_PAGE) ticketId = t.ticket_id;
      }
    }
    const db = getDb();
    if (!db.support_tickets) db.support_tickets = [];
    if (!db.ticket_messages) db.ticket_messages = [];

    if (!ticketId) {
      ticketId = crypto.randomUUID();
      const area = detectArea(item.message, item.screen);
      const ticket = {
        ticket_id: ticketId, user_id: user.user_id, role: user.role || "user",
        subject: `${area ? `${area} · ` : ""}${item.message.split("\n")[0]}`.slice(0, 90), category: FEEDBACK_CATEGORIES[item.category],
        status: "OPEN", priority: feedbackPriority(item.category, item.message, area), assigned_admin_id: null,
        page_context: FEEDBACK_PAGE, created_at: now, updated_at: now, thread_id: null,
      };
      if (sb()) {
        const { error: e } = await sb().from("support_tickets").insert(ticket);
        if (e) { console.error("[feedback] ticket:", e.message); return res.status(500).json({ error: "Could not send. Try again." }); }
      }
      db.support_tickets.push(ticket);
    } else if (sb()) {
      await sb().from("support_tickets").update({ updated_at: now, status: "OPEN" }).eq("ticket_id", ticketId);
    }

    const info = deviceLine(item);
    const msg = {
      message_id: crypto.randomUUID(), ticket_id: ticketId, sender_id: user.user_id, sender_type: "user",
      message: info ? `${item.message}\n\n— ${info}` : item.message, attachments: item.attachments, created_at: now,
    };
    if (sb()) {
      const { error: e } = await sb().from("ticket_messages").insert(msg);
      if (e) { console.error("[feedback] message:", e.message); return res.status(500).json({ error: "Could not send. Try again." }); }
    }
    db.ticket_messages.push(msg);
    saveDb(db);
    return res.json({ ok: true, ticket_id: ticketId });
  });

  router.get("/admin/feedback", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    const wantCat = FEEDBACK_CATEGORIES[String(req.query.category || "")] || null;
    const wantRole = ["creator", "brand"].includes(String(req.query.role)) ? String(req.query.role) : null;
    let tickets: any[] = [], messages: any[] = [], users: any[] = [];
    if (sb()) {
      let q = sb().from("support_tickets").select("*").eq("page_context", FEEDBACK_PAGE).order("created_at", { ascending: false }).limit(300);
      if (wantCat) q = q.eq("category", wantCat);
      if (wantRole) q = q.eq("role", wantRole);
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: "Could not load feedback." });
      tickets = data || [];
      const ids = tickets.map((t) => t.ticket_id);
      const uids = [...new Set(tickets.map((t) => t.user_id))];
      // v329: paged — one read stops at 1,000 rows (Supabase max rows), so with 200 tickets × several messages
      // the newest replies were cut off; and a failed read is an error, not tickets with no messages.
      for (let i = 0; i < ids.length; i += 200) {
        for (let from = 0; from < 20000; from += 1000) {
          const { data: m, error: em } = await sb().from("ticket_messages").select("*").in("ticket_id", ids.slice(i, i + 200))
            .order("created_at", { ascending: true }).order("message_id", { ascending: true }).range(from, from + 999);
          if (em) return res.status(500).json({ error: "Could not load feedback." });
          messages.push(...(m || []));
          if (!m || m.length < 1000) break;
        }
      }
      for (let i = 0; i < uids.length; i += 200) {
        const { data: u } = await sb().from("users").select("user_id,name,email,phone,role,created_at,picture") /* Session 58: city / photo are not columns — the whole lookup failed, so Chatbot reports had no name / email / phone */.in("user_id", uids.slice(i, i + 200));
        users.push(...(u || []));
      }
    } else {
      const db = getDb();
      tickets = (db.support_tickets || []).filter((t: any) => t.page_context === FEEDBACK_PAGE && (!wantCat || t.category === wantCat) && (!wantRole || t.role === wantRole));
      messages = (db.ticket_messages || []).filter((m: any) => tickets.some((t) => t.ticket_id === m.ticket_id));
      users = (db.users || []).filter((u: any) => tickets.some((t) => t.user_id === u.user_id));
    }
    const byUser = new Map(users.map((u: any) => [u.user_id, u]));
    const wantStatus = ["open", "done"].includes(String(req.query.status)) ? String(req.query.status) : null;
    const isOpen = (t: any) => String(t.status || "").toUpperCase() === "OPEN" || String(t.status || "").toUpperCase() === "IN PROGRESS";
    const all = tickets.map((t) => {
      const u: any = byUser.get(t.user_id) || {};
      const msgs = messages.filter((m) => m.ticket_id === t.ticket_id);
      const first = splitDevice((msgs.find((m) => m.sender_type === "user") || msgs[0] || {}).message || t.subject || "");
      const whole = msgs.filter((m) => m.sender_type === "user").map((m) => splitDevice(m.message).text).join(" ") || first.text;
      const area = detectArea(whole, (first.device.match(/Screen: ([^·]*)/) || [])[1] || "");
      return {
        ticket_id: t.ticket_id, kind: KIND_OF[t.category] || "general", status: t.status, created_at: t.created_at, updated_at: t.updated_at,
        open: isOpen(t), area, priority: t.priority || feedbackPriority(KIND_OF[t.category] || "general", whole, area),
        headline: first.text.split("\n")[0].slice(0, 140), device: first.device,
        user: { user_id: t.user_id, name: u.name || "", email: u.email || "", phone: u.phone || "", role: u.role || t.role, joined: u.created_at || null, city: u.city || "", photo: u.photo || u.picture || "" },
        messages: msgs.map((m) => ({ id: m.message_id, from: m.sender_type, text: splitDevice(m.message).text, attachments: m.attachments || [], at: m.created_at })),
      };
    });
    // Counts ignore the status filter so the boxes always show the whole picture.
    const counts = { bug: 0, feature: 0, confusing: 0, general: 0 } as Record<string, number>;
    const openCounts = { bug: 0, feature: 0, confusing: 0, general: 0 } as Record<string, number>;
    all.forEach((i) => { counts[i.kind] = (counts[i.kind] || 0) + 1; if (i.open) openCounts[i.kind] = (openCounts[i.kind] || 0) + 1; });
    const items = all.filter((i) => !wantStatus || (wantStatus === "open" ? i.open : !i.open));
    return res.json({ items, counts, openCounts });
  });
}
