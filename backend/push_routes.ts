import express from "express";
import { fetchAllRows } from "./adminMoney";
import { clientIp } from "./authSecurity";
import crypto from "crypto";
import webpush from "web-push";
import { apnsConfig, sendApns, isApnsToken, APNS_PREFIX } from "./apns";
import { fcmConfig, sendFcm, isFcmToken, FCM_PREFIX } from "./fcm"; // v364: Android app (android-app/)

// Session 41 (Ravi) — push notifications (phone notifications, even when the app is closed).
//
// 1. Deal pushes — automatic. Every row the app already writes to `notifications` (new message,
//    invite, application, counter, contract, UGC, payment, KYC…) is also sent to the user's phone.
//    A small loop reads new rows every 20 s, so not one locked deal/chat/payment file was changed.
// 2. Promo pushes — the admin writes them (any language) in Admin → Push notifications:
//    audience = everyone / creators / brands / creators of chosen niches (city: Phase 2);
//    send now or schedule. No daily limit (Session 43, Ravi: marketing pushes are unlimited).
// No on/off setting in the app (Ravi). Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT —
// without them everything here just stays quiet. Tables: scripts/sql/OLD_SQL_already_run.sql (session41 part).

/** Session 43 (Ravi): promo pushes have no daily cap any more. null = no limit. */
export const PROMO_DAILY_LIMIT: number | null = null;

/** Why a push reached nobody — shown to the admin instead of a bare "Sent to 0 phones". */
export function zeroSendReason(audienceUsers: number, devices: number, enabled = true): string | null {
  if (!enabled) return "Push is switched off on the server (VAPID keys missing).";
  if (audienceUsers === 0) return "Nobody matches this audience.";
  if (devices === 0) return "Nobody in this audience has turned on notifications on their phone yet.";
  return null;
}
const AUDIENCES = new Set(["all", "creator", "brand", "niche", "guest"]);

// Session 43 (v285, Ravi): "app install kiya, login nahi kiya, phir bhi notifications aane chahiye".
// A phone that allowed notifications before signing in is saved with this user_id (the column is
// text, so no database change). When the person signs in, the same phone (same endpoint) is moved
// to their real account by the normal save. "Everyone" promo pushes include these phones.
export const GUEST_USER_ID = "guest";

/** Only real browser push services are accepted from phones that are not signed in. */
export function isValidPushEndpoint(endpoint: any): boolean {
  try {
    const u = new URL(String(endpoint || ""));
    if (u.protocol !== "https:" || String(endpoint).length > 1000) return false;
    const h = u.hostname;
    return h === "fcm.googleapis.com" || h === "android.googleapis.com" || h === "updates.push.services.mozilla.com"
      || h === "web.push.apple.com" || h.endsWith(".push.apple.com") || h.endsWith(".notify.windows.com");
  } catch {
    return false;
  }
}

/** Small guard so nobody can fill the table with fake guest phones: 20 guest saves per IP per hour. */
const guestHits = new Map<string, { n: number; at: number }>();
export function guestSaveAllowed(ip: string, now = Date.now()): boolean {
  const key = String(ip || "?");
  const h = guestHits.get(key);
  if (!h || now - h.at > 3600e3) { guestHits.set(key, { n: 1, at: now }); return true; }
  h.n += 1;
  if (guestHits.size > 5000) guestHits.clear();
  return h.n <= 20;
}

/** Cleans what the admin typed for a promo push. */
export function cleanPushInput(body: any): { item?: any; error?: string } {
  const title = String(body?.title || "").trim().slice(0, 80);
  const message = String(body?.message || "").trim().slice(0, 240);
  if (!title) return { error: "Add a title." };
  if (!message) return { error: "Add a message." };
  const audience = AUDIENCES.has(String(body?.audience)) ? String(body.audience) : "all";
  const niches = audience === "niche"
    ? (Array.isArray(body?.niches) ? body.niches : []).map((n: any) => String(n || "").trim()).filter(Boolean).slice(0, 20)
    : [];
  if (audience === "niche" && niches.length === 0) return { error: "Pick at least one niche." };
  const url = String(body?.url || "").trim();
  if (url && !/^\/[A-Za-z0-9/_\-?=&.]*$/.test(url)) return { error: "The page must be inside the app, like /campaigns." };
  let sendAt: string | null = null;
  if (body?.send_at) {
    const t = Date.parse(body.send_at);
    if (Number.isNaN(t)) return { error: "Pick a valid date and time." };
    sendAt = new Date(t).toISOString();
  }
  return { item: { title, message, url: url || null, audience, niches, send_at: sendAt } };
}

/** Does this creator profile match any of the chosen niches? (niche / primary_niche / categories) */
export function creatorMatchesNiches(cp: any, niches: string[]): boolean {
  const want = new Set((niches || []).map((n) => String(n).toLowerCase()));
  if (want.size === 0) return false;
  const have = [cp?.niche, cp?.primary_niche, ...(Array.isArray(cp?.categories) ? cp.categories : []),
    ...(Array.isArray(cp?.niches) ? cp.niches : [])]
    .flatMap((v: any) => String(v || "").split(","))
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return have.some((h) => want.has(h));
}

/** Push payload from an in-app notification row. Links are kept inside the app. */
export function payloadFromNotification(n: any) {
  const link = typeof n?.link === "string" && n.link.startsWith("/") ? n.link : "/notifications";
  return {
    title: String(n?.title || "Ybex").slice(0, 80),
    body: String(n?.message || n?.body || "").slice(0, 240),
    url: link,
    tag: n?.id ? `n-${n.id}` : undefined,
  };
}

const isAdmin = (u: any) => Boolean(u && (u.role === "admin" || u.is_admin === true));

// Session 43 (v284, Supabase quota): the loop below used to wake every 20 s and run two Supabase
// queries even when nothing happened (≈8,600 requests + log lines a day per server). Now it wakes
// every 60 s, and every notification this server inserts (server.ts notifications wrapper) calls
// kickPushLoop() so its push still goes out within ~2 s.
export const PUSH_IDLE_INTERVAL_MS = 5 * 60000; // v422 (Supabase egress): was 1 min — scheduled pushes go out within 5 min; "send now" still kicks the loop at once
export const PUSH_KICK_DELAY_MS = 1500;
let kickHandler: (() => void) | null = null;
let kickTimer: any = null;
export function kickPushLoop() {
  if (!kickHandler || kickTimer) return;
  kickTimer = setTimeout(() => { kickTimer = null; kickHandler?.(); }, PUSH_KICK_DELAY_MS);
  kickTimer.unref?.();
}

export function setupPushRoutes(
  router: express.Router,
  { supabase, privilegedSupabase, parseAuthUser }: {
    supabase: any; privilegedSupabase: any; parseAuthUser: (req: express.Request) => Promise<any>;
  }
) {
  const sb = () => privilegedSupabase || supabase;
  const pub = process.env.VAPID_PUBLIC_KEY || "";
  const priv = process.env.VAPID_PRIVATE_KEY || "";
  // v336: two kinds of phones — web push (website / Android app / iPhone Home Screen app, VAPID keys) and the iPhone
  // App Store app (Apple APNs, backend/apns.ts). Either one turns the push system on.
  const webOn = Boolean(pub && priv && sb());
  const apnsOn = Boolean(apnsConfig() && sb());
  const fcmOn = Boolean(fcmConfig() && sb()); // v364: Android app (Capacitor) → Firebase Cloud Messaging
  const enabled = webOn || apnsOn || fcmOn;
  if (webOn) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@ybex.in", pub, priv);
  } else {
    console.warn("[push] web push off — VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set (or no database).");
  }
  if (!apnsOn) console.warn("[push] iPhone app push off — APNS_KEY / APNS_KEY_ID / APNS_TEAM_ID not set.");
  if (!fcmOn) console.warn("[push] Android app push off — FCM_SERVICE_ACCOUNT_JSON not set.");

  async function subsFor(userIds: string[]) {
    if (!enabled || userIds.length === 0) return [];
    const out: any[] = [];
    for (let i = 0; i < userIds.length; i += 300) {
      const { data, error } = await sb().from("push_subscriptions").select("*").in("user_id", userIds.slice(i, i + 300));
      if (error) { console.error("[push] read subscriptions:", error.message); break; }
      out.push(...(data || []));
    }
    return out;
  }

  /** Sends to every phone of these users. Dead subscriptions (404/410) are removed.
   *  v393 (Ravi: "Sent to 12 phones but nobody got it"): returns a breakdown (web / Android app / iPhone, failed, removed) and sends
   *  20 phones at a time (it used to be one by one — thousands of phones could outlast the 60 s request limit). */
  async function sendDetailed(userIds: string[], payload: any, preSubs?: any[]) {
    const subs = preSubs ?? await subsFor([...new Set(userIds)]); // v429: the push loop reads phones once per batch
    const st = { sent: 0, failed: 0, removed: 0, skipped: 0, web: 0, android: 0, iphone: 0, lastError: "" };
    const one = async (s: any) => {
      const ep = String(s.endpoint || "");
      const kind: "web" | "android" | "iphone" = ep.startsWith(APNS_PREFIX) ? "iphone" : ep.startsWith(FCM_PREFIX) ? "android" : "web";
      const drop = async () => { st.removed++; await sb().from("push_subscriptions").delete().eq("endpoint", s.endpoint); };
      try {
        if (kind === "iphone") {
          if (!apnsOn) { st.skipped++; return; }
          const r = await sendApns(ep.slice(APNS_PREFIX.length), payload);
          if (r.ok) { st.sent++; st[kind]++; } else if (r.gone) await drop(); else { st.failed++; st.lastError = `iPhone ${r.status} ${r.reason || ""}`.trim(); console.error("[push] apns failed:", r.status, r.reason); }
          return;
        }
        if (kind === "android") {
          if (!fcmOn) { st.skipped++; return; }
          const r = await sendFcm(ep.slice(FCM_PREFIX.length), payload);
          if (r.ok) { st.sent++; st[kind]++; } else if (r.gone) await drop(); else { st.failed++; st.lastError = `Android ${r.status} ${r.reason || ""}`.trim(); console.error("[push] fcm failed:", r.status, r.reason); }
          return;
        }
        if (!webOn) { st.skipped++; return; }
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24, urgency: "high" }); // Session 43: Android delivers 'high
          st.sent++; st.web++;
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410 || e?.statusCode === 403) await drop(); // 403 = made with an old key; the phone re-subscribes on next open (Session 43)
          else { st.failed++; st.lastError = `Browser ${e?.statusCode || e?.message || e}`; console.error("[push] send failed:", e?.statusCode || e?.message || e); }
        }
      } catch (e: any) { st.failed++; st.lastError = String(e?.message || e).slice(0, 80); }
    };
    for (let i = 0; i < subs.length; i += 20) await Promise.all(subs.slice(i, i + 20).map(one));
    return st;
  }
  async function sendToUsers(userIds: string[], payload: any): Promise<number> {
    return (await sendDetailed(userIds, payload)).sent;
  }

  router.get("/push/public-key", (_req, res) => res.json({ key: webOn ? pub : null }));

  // v336: the iPhone App Store app registers its Apple push token (signed in, or as a guest like web push).
  router.post("/push/native-register", async (req, res) => {
    const user = await parseAuthUser(req);
    // v364: platform "android" = the Android app's FCM token (case-sensitive, kept as sent).
    const platform = String(req.body?.platform || "ios");
    const token = String(req.body?.token || "").trim();
    const android = platform === "android";
    if (android ? !fcmOn : !apnsOn) return res.json({ ok: false, reason: "push_off" });
    if (android ? !isFcmToken(token) : (platform !== "ios" || !isApnsToken(token))) return res.status(400).json({ error: "Bad token" });
    const endpoint = android ? FCM_PREFIX + token : APNS_PREFIX + token.toLowerCase();
    if (!user) {
      const ip = clientIp(req);
      if (!guestSaveAllowed(ip)) return res.status(429).json({ error: "Too many requests" });
      const { data: had } = await sb().from("push_subscriptions").select("user_id").eq("endpoint", endpoint).limit(1);
      if (had && had.length && had[0].user_id && had[0].user_id !== GUEST_USER_ID) return res.json({ ok: true, guest: false });
    }
    const row = {
      user_id: user ? user.user_id : GUEST_USER_ID, endpoint, p256dh: android ? "fcm" : "apns", auth: android ? "android" : "ios",
      user_agent: String(req.headers["user-agent"] || "").slice(0, 300), last_used_at: new Date().toISOString(),
    };
    const { error } = await sb().from("push_subscriptions").upsert(row, { onConflict: "endpoint" });
    if (error) { console.error("[push] save apns token:", error.message); return res.status(500).json({ error: "Could not save" }); }
    return res.json({ ok: true, guest: !user });
  });

  router.post("/push/subscribe", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!webOn) return res.json({ ok: false, reason: "push_off" });
    const s = req.body?.subscription || {};
    if (!s.endpoint || !s.keys?.p256dh || !s.keys?.auth) return res.status(400).json({ error: "Bad subscription" });
    if (!user) {
      // Not signed in yet (v285): keep the phone as a guest. Never take a phone away from an account.
      if (!isValidPushEndpoint(s.endpoint)) return res.status(400).json({ error: "Bad subscription" });
      const ip = clientIp(req); // Session 58
      if (!guestSaveAllowed(ip)) return res.status(429).json({ error: "Too many requests" });
      const { data: had } = await sb().from("push_subscriptions").select("user_id").eq("endpoint", String(s.endpoint)).limit(1);
      if (had && had.length && had[0].user_id && had[0].user_id !== GUEST_USER_ID) return res.json({ ok: true, guest: false });
    }
    const row = {
      user_id: user ? user.user_id : GUEST_USER_ID, endpoint: String(s.endpoint), p256dh: String(s.keys.p256dh), auth: String(s.keys.auth),
      user_agent: String(req.headers["user-agent"] || "").slice(0, 300), last_used_at: new Date().toISOString(),
    };
    const { error } = await sb().from("push_subscriptions").upsert(row, { onConflict: "endpoint" });
    if (error) { console.error("[push] save subscription:", error.message); return res.status(500).json({ error: "Could not save" }); }
    return res.json({ ok: true, guest: !user });
  });

  router.post("/push/unsubscribe", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    if (enabled && req.body?.endpoint) {
      // Session 58: logout hands the phone back to "guest" (announcements only) instead of keeping the account's pushes.
      if (req.body?.to_guest) await sb().from("push_subscriptions").update({ user_id: GUEST_USER_ID }).eq("endpoint", String(req.body.endpoint)).eq("user_id", user.user_id);
      else await sb().from("push_subscriptions").delete().eq("endpoint", String(req.body.endpoint)).eq("user_id", user.user_id);
    }
    return res.json({ ok: true });
  });

  // ---------- Admin: promo pushes ----------
  router.get("/admin/push", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    if (!sb()) return res.json({ enabled, items: [] });
    const { data, error } = await sb().from("push_campaigns").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) return res.status(500).json({ enabled, error: "Could not load. Did you run scripts/sql/OLD_SQL_already_run.sql (session41 part)?" });
    const { count } = await sb().from("push_subscriptions").select("endpoint", { count: "exact", head: true });
    return res.json({ enabled, devices: count || 0, items: data || [] });
  });

  router.post("/admin/push", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    const { item, error } = cleanPushInput(req.body);
    if (error) return res.status(400).json({ error });
    const row = { id: crypto.randomUUID(), ...item, created_by: user.user_id, created_at: new Date().toISOString() };
    const { error: e } = await sb().from("push_campaigns").insert(row);
    if (e) return res.status(500).json({ error: "Could not save. Did you run scripts/sql/OLD_SQL_already_run.sql (session41 part)?" });
    const report = !row.send_at ? await runCampaign(row) : null; // send now
    return res.json({ ok: true, id: row.id, report });
  });

  router.delete("/admin/push/:id", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    // Only a scheduled push that has not gone out can be cancelled.
    await sb().from("push_campaigns").delete().eq("id", req.params.id).is("sent_at", null);
    return res.json({ ok: true });
  });

  async function audienceIds(c: any): Promise<string[]> {
    if (c.audience === "guest") return [GUEST_USER_ID]; // installed the app, not signed up yet
    // Session 58: every row (Supabase returns at most 1000 per read), never banned / deleted accounts, and never people
    // who turned "Offers and promotions" off (latest marketing consent = false, or on the email unsubscribe list).
    let ids: string[] = [];
    if (c.audience === "niche") {
      const { data } = await fetchAllRows((a, b) => sb().from("creator_profiles").select("user_id, niche, primary_niche, categories, is_deleted").range(a, b));
      ids = (data || []).filter((cp: any) => !cp.is_deleted && creatorMatchesNiches(cp, c.niches || [])).map((cp: any) => cp.user_id);
    } else {
      const { data } = await fetchAllRows((a, b) => {
        let q = sb().from("users").select("user_id, role, email, banned, is_deleted");
        if (c.audience === "creator" || c.audience === "brand") q = q.eq("role", c.audience);
        else q = q.in("role", ["creator", "brand"]);
        return q.range(a, b);
      });
      ids = (data || []).filter((u: any) => !u.banned && !u.is_deleted).map((u: any) => u.user_id);
    }
    const optedOut = await promoOptOuts();
    ids = ids.filter((id) => !optedOut.has(String(id)));
    if (c.audience === "all") ids.push(GUEST_USER_ID); // Everyone = signed-up users + phones not signed in yet
    return ids;
  }

  async function promoOptOuts(): Promise<Set<string>> {
    const out = new Set<string>();
    try {
      const { data: rows } = await fetchAllRows((a, b) => sb().from("user_consents").select("user_id, granted, created_at").eq("kind", "marketing").order("created_at", { ascending: true }).range(a, b));
      const last = new Map<string, boolean>();
      for (const r of rows || []) last.set(String(r.user_id), Boolean(r.granted)); // oldest → newest, so the newest wins
      for (const [uid, granted] of last) if (!granted) out.add(uid);
      const { data: unsub } = await fetchAllRows((a, b) => sb().from("email_unsubscribes").select("email").range(a, b));
      const emails = new Set((unsub || []).map((u: any) => String(u.email || "").toLowerCase()).filter(Boolean));
      if (emails.size) {
        const { data: us } = await fetchAllRows((a, b) => sb().from("users").select("user_id, email").range(a, b));
        for (const u of us || []) if (emails.has(String(u.email || "").toLowerCase())) out.add(String(u.user_id));
      }
    } catch (e: any) { console.warn("[push] opt-out check notice", e?.message || e); }
    return out;
  }

  async function runCampaign(c: any) {
    // Claim it first so two servers / two loops never send the same push twice.
    const nowIso = new Date().toISOString();
    const { data: claimed } = await sb().from("push_campaigns").update({ sent_at: nowIso }).eq("id", c.id).is("sent_at", null).select("id");
    if (!claimed || claimed.length === 0) return;
    const ids = await audienceIds(c);
    const devices = (await subsFor([...new Set(ids)])).length;
    const st = await sendDetailed(ids, { title: c.title, body: c.message, url: c.url || "/", tag: `promo-${c.id}` });
    const sent = st.sent;
    if (ids.length) {
      const rows = ids.map((id) => ({ user_id: id, kind: "promo", ref: c.id, sent_at: nowIso }));
      for (let i = 0; i < rows.length; i += 500) await sb().from("push_log").insert(rows.slice(i, i + 500));
    }
    await sb().from("push_campaigns").update({ sent_count: sent }).eq("id", c.id);
    return { audience: ids.length, devices, sent, failed: st.failed, removed: st.removed, skipped: st.skipped, web: st.web, android: st.android, iphone: st.iphone, last_error: st.lastError || null,
      reason: sent === 0 ? (zeroSendReason(ids.length, devices, enabled) || (st.failed ? `${st.failed} phone(s) refused the message (${st.lastError || "unknown error"}).` : st.skipped ? "These phones need the Android / iPhone app push keys, which are not set on the server." : null)) : null };
  }

  // ---------- Loops: scheduled promos + deal pushes from new notifications ----------
  if (enabled && process.env.NODE_ENV !== "test") {
    // Session 58: start a few minutes back (a restart / deploy gap used to lose those pushes) and always re-read a short
    // window behind the cursor — a row stamped earlier but saved later was skipped for good. push_log stops doubles.
    const LOOKBACK_MS = 2 * 60 * 1000;
    let cursor = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    // v388 (QA: after a burst of 200+ notifications with the SAME created_at — profile nudges, send-to-all — the cursor stopped on the
    // 200th row, every tick re-read the same 200 and the push loop never moved on): when a batch is FULL the next read continues from the
    // (created_at, id) pair of its last row instead of looking back, and up to 5 full batches are drained per tick.
    let cursorId: string | null = null;
    let lastFull = false;
    // v407 (Supabase logs: ~6,400 push_log writes a day): every minute the 2-minute look-back read the same notifications
    // again and wrote a push_log row for each (ignored as a duplicate, but still a database call). Ids this server already
    // handled are remembered, so each notification costs one write. Another server copy still dedupes via push_log.
    const handled = new Set<string>();
    const BATCH = 200;
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const now = new Date().toISOString();
        const { data: due } = await sb().from("push_campaigns").select("*").is("sent_at", null).not("send_at", "is", null).lte("send_at", now).limit(5);
        for (const c of due || []) await runCampaign(c);

        for (let pass = 0; pass < 5; pass++) {
          let q = sb().from("notifications").select("id, user_id, title, message, link, created_at");
          q = lastFull && cursorId !== null
            ? q.or(`created_at.gt.${cursor},and(created_at.eq.${cursor},id.gt.${cursorId})`)
            : q.gt("created_at", new Date(Date.parse(cursor) - LOOKBACK_MS).toISOString());
          const { data: fresh, error } = await q.order("created_at", { ascending: true }).order("id", { ascending: true }).limit(BATCH);
          if (error || !fresh || !fresh.length) { lastFull = false; break; }
          cursor = fresh[fresh.length - 1].created_at;
          cursorId = String(fresh[fresh.length - 1].id);
          lastFull = fresh.length >= BATCH;
          // v429 (Supabase log limit): one push_log write and one phone read for the whole batch — it was 2 calls per
          // notification (a send-to-all of 200 = 400 database calls). One push per notification on any number of
          // servers: the server whose write lands gets the ref back and sends; the others get nothing and skip.
          const todo = fresh.filter((n: any) => n.user_id && n.id && !handled.has(String(n.id)));
          if (todo.length) {
            const at = new Date().toISOString();
            const { data: mine, error: logErr } = await sb().from("push_log")
              .upsert(todo.map((n: any) => ({ user_id: n.user_id, kind: "deal", ref: String(n.id), sent_at: at })),
                { onConflict: "kind,ref,user_id", ignoreDuplicates: true })
              .select("ref, user_id");
            if (!logErr) for (const n of todo) { handled.add(String(n.id)); if (handled.size > 5000) handled.delete(handled.values().next().value as string); }
            const won = new Set((mine || []).map((r: any) => `${r.ref}|${r.user_id}`));
            const send = todo.filter((n: any) => won.has(`${n.id}|${n.user_id}`));
            if (send.length) {
              const allSubs = await subsFor([...new Set(send.map((n: any) => String(n.user_id)))]);
              for (const n of send) {
                const subs = allSubs.filter((x: any) => String(x.user_id) === String(n.user_id));
                if (subs.length) await sendDetailed([n.user_id], payloadFromNotification(n), subs);
              }
            }
          }
          if (!lastFull) break;
        }
      } catch (e: any) {
        console.error("[push] loop:", e?.message || e);
      } finally {
        busy = false;
      }
    };
    setInterval(tick, PUSH_IDLE_INTERVAL_MS).unref?.();
    kickHandler = () => { tick(); };
  }
}
