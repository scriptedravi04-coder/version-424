// Session 36 (Ravi): admin bulk email, done properly.
//  - Audiences are strict: creators → signed-up creators only; brands → brands only; agencies → agency
//    brands; unclaimed_creators → approved-but-not-signed-up creator profiles only; all → all of these.
//  - Never sent to: banned / deleted accounts, people who unsubscribed, people added by Admin CSV import
//    (they never signed up or agreed to anything), test / fake addresses.
//  - Every email has an Unsubscribe link + List-Unsubscribe header (GET/POST /api/public/unsubscribe).
//  - "Send" only QUEUES the emails and answers at once. A queue run sends a batch within a daily cap
//    (Resend free plan = 100/day): right after "Send", and from Cloud Scheduler
//    POST /api/internal/cron/email-queue (x-cron-secret). The rest go the next day.
//  - Every recipient has a status (queued / sent / failed / skipped + reason) → report + "Retry failed".
// Tables: email_broadcasts, email_broadcast_recipients, email_unsubscribes (scripts/sql/OLD_SQL_already_run.sql (session36 part)).
// Without them it falls back to the local cache (one server), so it still works in development.
import express from "express";
import { fetchAllRows } from "./adminMoney";
import crypto from "crypto";
import { Resend, buildEmailHtml, getValidFromEmail } from "./helpers";
import { lowPriorityBudget, emailQueueSummary, sentToday, dailyLimit } from "./emailBudget";
import { sendQueuedEmailsNow } from "./helpers"; // v419
import { signEmailLink, verifyEmailLink, appBaseUrl, simplePage, cronAuthorized } from "./emailLinks";

export const AUDIENCES = ["creators", "brands", "agencies", "unclaimed_creators", "all"] as const;
export type Audience = typeof AUDIENCES[number];
export const DAILY_CAP = () => Math.max(1, Number(process.env.BROADCAST_DAILY_LIMIT) || 80);

type Deps = {
  supabase: any;
  privilegedSupabase: any;
  getDb: () => any;
  saveDb: (db: any) => void;
  parseAuthUser: (req: express.Request) => Promise<any>;
  logAdminAction?: (user: any, action: string, type: string, id: string, details: any) => Promise<any>;
};

export const isRealEmail = (em: string) => {
  const e = String(em || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  return !(e.endsWith("@ybex.io") || e.includes("@example.com") || e.endsWith(".demo") || e.includes("dev-user") || e.includes("dev-brand") || e.includes("unclaimed_"));
};

/** Pure: who gets the email. Inputs are plain rows; returns unique {email, name}. */
export function buildAudience(audience: Audience, src: {
  users: any[]; brandProfiles: any[]; creatorProfiles: any[]; unsubscribed: Set<string>; csvImported: Set<string>;
}) {
  const blockedIds = new Set(src.users.filter((u) => u.banned === true || u.is_deleted === true).map((u) => u.user_id));
  const out = new Map<string, { email: string; name: string }>();
  const add = (email: any, name: any, userId?: string) => {
    const e = String(email || "").trim().toLowerCase();
    if (!isRealEmail(e) || out.has(e)) return;
    if (userId && blockedIds.has(userId)) return;
    if (src.unsubscribed.has(e) || src.csvImported.has(e)) return;
    out.set(e, { email: e, name: String(name || "").trim() || "there" });
  };
  const live = (u: any) => u.banned !== true && u.is_deleted !== true && u.auth_method !== "unclaimed";
  const brandIds = new Set(src.brandProfiles.filter((b) => b.is_deleted !== true).map((b) => b.user_id));
  const agencyIds = new Set(src.brandProfiles.filter((b) => b.is_agency === true && b.is_deleted !== true).map((b) => b.user_id));

  const creators = () => src.users.filter((u) => live(u) && String(u.role).toLowerCase() === "creator").forEach((u) => add(u.email, u.name, u.user_id));
  const brandsOf = (ids: Set<string>) => {
    src.users.filter((u) => live(u) && (ids.has(u.user_id) || (ids === brandIds && String(u.role).toLowerCase() === "brand")))
      .forEach((u) => add(u.email, u.name, u.user_id));
    src.brandProfiles.filter((b) => ids.has(b.user_id) && b.is_deleted !== true).forEach((b) => add(b.email, b.company_name, b.user_id));
  };
  const unclaimed = () => src.creatorProfiles
    .filter((p) => p.is_claimed === false && p.is_deleted !== true && String(p.profile_status || "approved").toLowerCase() !== "rejected")
    .forEach((p) => add(p.email, p.name, p.user_id));

  if (audience === "creators") creators();
  else if (audience === "brands") brandsOf(brandIds);
  else if (audience === "agencies") brandsOf(agencyIds);
  else if (audience === "unclaimed_creators") unclaimed();
  else { creators(); brandsOf(brandIds); unclaimed(); }
  return [...out.values()];
}

export function unsubscribeUrl(email: string) {
  const e = String(email || "").trim().toLowerCase();
  const t = signEmailLink("unsub", e);
  return t ? `${appBaseUrl()}/api/public/unsubscribe?e=${encodeURIComponent(e)}&t=${t}` : null;
}

/** v396 (QA E-1): old app addresses typed by the admin (ybexapp.ai.studio, *.run.app) become the real site. Pure-ish. */
export function fixOldLinks(text: any): string {
  return String(text ?? "").replace(/https?:\/\/(?:www\.)?(?:ybexapp\.ai\.studio|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app)/gi, appBaseUrl());
}
/** v396 (QA E-1): {{name}} / {{first_name}} are filled in; any other {{…}} is removed, never printed. Pure. */
export function fillPlaceholders(text: any, r: { name?: string }): string {
  const full = String(r?.name || "").trim() || "there";
  const first = full.split(/\s+/)[0] || "there";
  return String(text ?? "").replace(/\{\{\s*([a-z_ ]+?)\s*\}\}/gi, (_m, k) => {
    const key = String(k).toLowerCase().replace(/\s+/g, "_");
    return key === "name" || key === "full_name" ? full : key === "first_name" || key === "firstname" ? first : "";
  });
}
export function broadcastSubject(b: any, r: { name?: string }): string {
  return fillPlaceholders(b?.subject, r).replace(/\s{2,}/g, " ").trim() || "Update from Ybex";
}

export function broadcastEmail(b0: any, r: { email: string; name: string }) {
  const unsub = unsubscribeUrl(r.email);
  const b = { ...b0, heading: b0?.heading ? fillPlaceholders(b0.heading, r) : b0?.heading, body_text: fixOldLinks(fillPlaceholders(b0?.body_text, r)), cta_url: b0?.cta_url ? fixOldLinks(b0.cta_url) : b0?.cta_url }; // v396 (QA E-1)
  const ctaUrl = b.cta_url ? (String(b.cta_url).startsWith("http") ? b.cta_url : `${appBaseUrl()}${String(b.cta_url).startsWith("/") ? "" : "/"}${b.cta_url}`) : null;
  const esc = (t: string) => String(t || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const html = buildEmailHtml({
    title: b.heading || broadcastSubject(b, r),
    greeting: `Hi ${esc(r.name)},`,
    paragraphs: [`<span style="white-space: pre-wrap;">${esc(b.body_text)}</span>`],
    // the old tool passed `cta`, which the template never read — the button never showed
    button: b.cta_label && ctaUrl ? { text: esc(b.cta_label), link: ctaUrl } : undefined,
    footerHtml: unsub ? `You get Ybex updates because you have a Ybex account. <a href="${unsub}" style="color:#6b7280">Unsubscribe</a>` : undefined,
  });
  return { html, unsub };
}

// ---------------------------------------------------------------- storage (Supabase or local fallback)
function store(deps: Deps) {
  const c = deps.privilegedSupabase || deps.supabase;
  const db = () => deps.getDb();
  const local = (k: string) => { const d = db(); if (!d[k]) d[k] = []; return d[k] as any[]; };
  let tablesOk: boolean | null = null;
  const hasTables = async () => {
    if (tablesOk !== null) return tablesOk;
    if (!c) return (tablesOk = false);
    const { error } = await c.from("email_broadcasts").select("id").limit(1);
    return (tablesOk = !error);
  };
  return {
    client: c,
    hasTables,
    async unsubscribed(): Promise<Set<string>> {
      const set = new Set<string>(local("email_unsubscribes").map((r: any) => String(r.email).toLowerCase()));
      if (c) { const { data, error } = await c.from("email_unsubscribes").select("email"); if (!error) for (const r of data || []) set.add(String(r.email).toLowerCase()); }
      return set;
    },
    async addUnsubscribe(email: string) {
      const row = { email, created_at: new Date().toISOString() };
      const l = local("email_unsubscribes"); if (!l.some((r: any) => r.email === email)) l.push(row);
      if (c) await c.from("email_unsubscribes").upsert([row], { onConflict: "email" });
      deps.saveDb(db());
    },
    async createBroadcast(b: any, recipients: any[]) {
      local("email_broadcasts").unshift(b);
      local("email_broadcast_recipients").push(...recipients);
      if (await hasTables()) {
        const { error } = await c.from("email_broadcasts").insert([b]);
        if (error) throw new Error(error.message);
        for (let i = 0; i < recipients.length; i += 500) {
          const { error: e2 } = await c.from("email_broadcast_recipients").insert(recipients.slice(i, i + 500));
          if (e2) throw new Error(e2.message);
        }
      }
      deps.saveDb(db());
    },
    async listBroadcasts() {
      if (await hasTables()) {
        const { data } = await c.from("email_broadcasts").select("*").order("created_at", { ascending: false }).limit(50);
        return data || [];
      }
      return local("email_broadcasts").slice(0, 50);
    },
    async getBroadcast(id: string) {
      if (await hasTables()) {
        const { data } = await c.from("email_broadcasts").select("*").eq("id", id).maybeSingle();
        return data;
      }
      return local("email_broadcasts").find((b: any) => b.id === id) || null;
    },
    async recipients(id: string) {
      if (await hasTables()) {
        const { data } = await c.from("email_broadcast_recipients").select("*").eq("broadcast_id", id).order("email").limit(5000);
        return data || [];
      }
      return local("email_broadcast_recipients").filter((r: any) => r.broadcast_id === id);
    },
    async queued(limit: number) {
      if (await hasTables()) {
        const { data } = await c.from("email_broadcast_recipients").select("*").eq("status", "queued").order("created_at").limit(limit);
        return data || [];
      }
      return local("email_broadcast_recipients").filter((r: any) => r.status === "queued").slice(0, limit);
    },
    async sentSince(iso: string) {
      if (await hasTables()) {
        const { count } = await c.from("email_broadcast_recipients").select("id", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", iso);
        return Number(count) || 0;
      }
      return local("email_broadcast_recipients").filter((r: any) => r.status === "sent" && r.sent_at >= iso).length;
    },
    async updateRecipient(id: string, patch: any) {
      const l = local("email_broadcast_recipients"); const i = l.findIndex((r: any) => r.id === id); if (i >= 0) l[i] = { ...l[i], ...patch };
      if (await hasTables()) await c.from("email_broadcast_recipients").update(patch).eq("id", id);
    },
    /** Session 58: take one queued row before sending (two runs at once used to email the same person twice). */
    async claimRecipient(r: any): Promise<boolean> {
      if (!(await hasTables())) return true;
      const n = Number(r.attempts || 0);
      let q = c.from("email_broadcast_recipients").update({ attempts: n + 1 }).eq("id", r.id).eq("status", "queued");
      q = r.attempts == null ? q.is("attempts", null) : q.eq("attempts", n);
      const { data, error } = await q.select("id");
      return !error && Array.isArray(data) && data.length > 0;
    },
    async requeueFailed(id: string) {
      const l = local("email_broadcast_recipients");
      for (const r of l) if (r.broadcast_id === id && r.status === "failed") { r.status = "queued"; r.error = null; }
      if (await hasTables()) await c.from("email_broadcast_recipients").update({ status: "queued", error: null }).eq("broadcast_id", id).eq("status", "failed");
      deps.saveDb(db());
    },
    async refreshCounts(id: string) {
      const rs = await this.recipients(id);
      const n = (s: string) => rs.filter((r: any) => r.status === s).length;
      const patch = { sent: n("sent"), failed: n("failed"), skipped: n("skipped"), queued: n("queued"), status: n("queued") > 0 ? "sending" : "done" };
      const l = local("email_broadcasts"); const i = l.findIndex((b: any) => b.id === id); if (i >= 0) l[i] = { ...l[i], ...patch };
      if (await hasTables()) await c.from("email_broadcasts").update(patch).eq("id", id);
      return patch;
    },
    save() { deps.saveDb(db()); },
  };
}

/** Sends queued emails, at most `max` and never more than the daily cap. */
export async function processEmailQueue(deps: Deps, max = 40, opts: { force?: boolean } = {}) {
  const s = store(deps);
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  // v399: broadcasts are low priority — only in the night window and only what today's Resend quota still allows.
  // v419: "Send now" (force) = exactly the number the admin typed, any hour.
  const budget = opts.force ? max : await lowPriorityBudget();
  const left = opts.force ? max : Math.min(DAILY_CAP() - (await s.sentSince(since.toISOString())), Number.isFinite(budget) ? budget : Infinity);
  const result = { sent: 0, failed: 0, skipped: 0, waiting_for_tomorrow: false };
  if (left <= 0) { result.waiting_for_tomorrow = true; return result; }
  const batch = await s.queued(Math.min(max, left));
  if (batch.length === 0) return result;
  const key = process.env.RESEND_API_KEY;
  if (!key) return result; // stay queued until the key is set
  const resend = new Resend(key);
  const unsub = await s.unsubscribed();
  const cache = new Map<string, any>();
  const touched = new Set<string>();
  for (const r of batch) {
    if (!(await s.claimRecipient(r))) continue; // another run already took it
    touched.add(r.broadcast_id);
    if (unsub.has(String(r.email).toLowerCase())) {
      await s.updateRecipient(r.id, { status: "skipped", error: "unsubscribed" }); result.skipped++; continue;
    }
    let b = cache.get(r.broadcast_id);
    if (!b) { b = await s.getBroadcast(r.broadcast_id); cache.set(r.broadcast_id, b); }
    if (!b) { await s.updateRecipient(r.id, { status: "skipped", error: "broadcast missing" }); result.skipped++; continue; }
    const { html, unsub: u } = broadcastEmail(b, r);
    try {
      const out: any = await resend.emails.send({
        from: getValidFromEmail(process.env.RESEND_FROM_EMAIL),
        to: [r.email],
        subject: broadcastSubject(b, r), // v396 (QA E-1)
        html,
        ...(u ? { headers: { "List-Unsubscribe": `<${u}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
      });
      if (out?.error) {
        await s.updateRecipient(r.id, { status: "failed", error: String(out.error.message || out.error.name || "send failed").slice(0, 300), attempts: Number(r.attempts || 0) + 1 });
        result.failed++;
      } else {
        await s.updateRecipient(r.id, { status: "sent", sent_at: new Date().toISOString(), error: null, attempts: Number(r.attempts || 0) + 1 });
        result.sent++;
      }
    } catch (e: any) {
      await s.updateRecipient(r.id, { status: "failed", error: String(e?.message || e).slice(0, 300), attempts: Number(r.attempts || 0) + 1 });
      result.failed++;
    }
  }
  for (const id of touched) await s.refreshCounts(id);
  s.save();
  return result;
}

async function loadAudienceSources(deps: Deps) {
  const c = deps.privilegedSupabase || deps.supabase;
  const db = deps.getDb();
  let users: any[] = [], brandProfiles: any[] = [], creatorProfiles: any[] = [], waitlist: any[] = [];
  if (c) {
    // Session 58: every page (Supabase returns at most 1000 rows) — past row 1000 people were missed, and CSV-imported
    // contacts past row 1000 weren't excluded.
    const [u, b, p, w] = await Promise.all([
      fetchAllRows((x, y) => c.from("users").select("user_id, email, name, role, banned, is_deleted, auth_method").range(x, y)),
      fetchAllRows((x, y) => c.from("brand_profiles").select("user_id, email, company_name, is_agency, is_deleted").range(x, y)),
      fetchAllRows((x, y) => c.from("creator_profiles").select("user_id, email, name, is_claimed, is_deleted, profile_status").range(x, y)),
      fetchAllRows((x, y) => c.from("waitlist").select("email, source").range(x, y)),
    ]);
    users = u.data || []; brandProfiles = b.data || []; creatorProfiles = p.data || []; waitlist = w.data || [];
  } else {
    users = db.users || []; brandProfiles = db.brand_profiles || []; creatorProfiles = db.creator_profiles || []; waitlist = db.waitlist || [];
  }
  const csvImported = new Set<string>(waitlist.filter((w: any) => w.source === "csv_import").map((w: any) => String(w.email || "").toLowerCase()));
  return { users, brandProfiles, creatorProfiles, csvImported };
}

const isAdmin = (u: any) => u && (u.role === "admin" || u.role === "sub_admin" || u.team_role === "sub_admin");

export function setupEmailBroadcastRoutes(router: express.Router, deps: Deps) {
  // Queue a broadcast (replaces the old send-everything-in-one-request route).
  router.post("/admin/broadcast-email", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ detail: "Only admins can send broadcasts" });
    const { targetAudience, subject, heading, bodyText, ctaLabel, ctaUrl } = req.body || {};
    if (!subject || !bodyText) return res.status(400).json({ error: "Subject and Body text are required" });
    const audience = (AUDIENCES as readonly string[]).includes(targetAudience) ? targetAudience as Audience : null;
    if (!audience) return res.status(400).json({ error: "Choose who should get this email." });
    try {
      const s = store(deps);
      const src = await loadAudienceSources(deps);
      const list = buildAudience(audience, { ...src, unsubscribed: await s.unsubscribed() });
      if (list.length === 0) return res.status(400).json({ error: "Nobody matches this audience (after removing banned, deleted and unsubscribed)." });
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const b = {
        id, subject: String(subject).slice(0, 200), heading: heading ? String(heading).slice(0, 200) : null,
        body_text: String(bodyText).slice(0, 10000), cta_label: ctaLabel ? String(ctaLabel).slice(0, 80) : null,
        cta_url: ctaUrl ? String(ctaUrl).slice(0, 500) : null, audience, created_by: user.user_id, created_at: now,
        total: list.length, sent: 0, failed: 0, skipped: 0, queued: list.length, status: "sending",
      };
      const rows = list.map((r) => ({ id: crypto.randomUUID(), broadcast_id: id, email: r.email, name: r.name, status: "queued", error: null, attempts: 0, sent_at: null, created_at: now }));
      await s.createBroadcast(b, rows);
      await deps.logAdminAction?.(user, "broadcast_email", "broadcast", id, { audience, subject: b.subject, total: list.length });
      const first = await processEmailQueue(deps, 20).catch(() => null);
      return res.json({
        ok: true, id, total: list.length, first_batch: first,
        message: `Queued ${list.length} email(s). Up to ${DAILY_CAP()} go out per day; see the report below.`,
      });
    } catch (e: any) {
      console.error("[broadcast] queue error:", e?.message || e);
      return res.status(500).json({ error: "Could not queue the broadcast: " + (e?.message || e) });
    }
  });

  router.get("/admin/broadcasts", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ detail: "Admin only" });
    return res.json({ broadcasts: await store(deps).listBroadcasts(), daily_cap: DAILY_CAP() });
  });

  router.get("/admin/broadcasts/:id", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ detail: "Admin only" });
    const s = store(deps);
    const b = await s.getBroadcast(req.params.id);
    if (!b) return res.status(404).json({ error: "Not found" });
    return res.json({ broadcast: b, recipients: await s.recipients(req.params.id) });
  });

  router.post("/admin/broadcasts/:id/retry-failed", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ detail: "Admin only" });
    const s = store(deps);
    await s.requeueFailed(req.params.id);
    const counts = await s.refreshCounts(req.params.id);
    const run = await processEmailQueue(deps, 20).catch(() => null);
    return res.json({ ok: true, counts, run });
  });

  // v419 (Ravi: "queue wali emails ja hi nahi rahi"): what is waiting + a "Send now" with the number the admin types.
  // The night send only ran when someone used the site in the 2:30–5:30 am window, so on quiet nights nothing went.
  router.get("/admin/email-queue", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ detail: "Admin only" });
    const s = store(deps);
    const [mails, bq, sent] = await Promise.all([emailQueueSummary(500), s.queued(5000).catch(() => []), sentToday()]);
    return res.json({ ...mails, broadcast_waiting: (bq || []).length, sent_today: sent, daily_limit: dailyLimit() });
  });
  router.post("/admin/email-queue/send", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user) || user?.team_role === "sub_admin") return res.status(403).json({ detail: "Only a full admin can send the queue." });
    const n = Math.floor(Number(req.body?.count));
    if (!Number.isFinite(n) || n < 1 || n > 500) return res.status(400).json({ error: "Type how many emails to send (1 to 500)." });
    try {
      const mails: any = await sendQueuedEmailsNow(n);
      if (mails?.error) return res.status(500).json({ error: mails.error });
      const rest = Math.max(0, n - (mails.sent || 0) - (mails.failed || 0));
      const bc = rest > 0 ? await processEmailQueue(deps, rest, { force: true }).catch(() => ({ sent: 0, failed: 0, skipped: 0 })) : { sent: 0, failed: 0, skipped: 0 };
      return res.json({ ok: true, sent: (mails.sent || 0) + (bc.sent || 0), failed: (mails.failed || 0) + (bc.failed || 0), left_waiting: mails.left_waiting, quota_full: (mails.sent || 0) + (bc.sent || 0) < n && (mails.left_waiting > 0) });
    } catch (e: any) { return res.status(500).json({ error: "Couldn't send now: " + (e?.message || e) }); }
  });

  router.post("/internal/cron/email-queue", async (req, res) => {
    if (!cronAuthorized(req.headers["x-cron-secret"])) return res.status(401).json({ error: "Unauthorized" });
    // v419: the scheduler call also sends the waiting single mails (in the night window, within today's quota).
    try {
      const budget = await lowPriorityBudget();
      const mails = budget > 0 ? await sendQueuedEmailsNow(Number.isFinite(budget) ? Math.min(100, budget) : 100).catch(() => null) : null;
      return res.json({ ok: true, mails, ...(await processEmailQueue(deps, 100)) });
    }
    catch (e: any) { return res.status(500).json({ error: "Queue run failed" }); }
  });

  const unsubscribe = async (req: express.Request, res: express.Response) => {
    const e = String(req.query.e || req.body?.e || "").trim().toLowerCase();
    const t = String(req.query.t || req.body?.t || "");
    if (!e || !verifyEmailLink("unsub", e, t)) {
      return res.status(400).type("html").send(simplePage("Link not valid", "This unsubscribe link is broken or too old. Write to support@ybexmedia.in and we will remove you."));
    }
    await store(deps).addUnsubscribe(e);
    return res.type("html").send(simplePage("You're unsubscribed", "You will not get Ybex update emails any more. Emails about your own deals, payments and account still come, because you need them."));
  };
  router.get("/public/unsubscribe", unsubscribe);
  router.post("/public/unsubscribe", unsubscribe);
}
