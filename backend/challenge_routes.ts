import express from "express";
import { creatorProfileStrength } from "../src/lib/creatorTasks"; // v377: ₹50 only after a complete profile
import { readCreatorsLean } from "./inboxLean"; // v428: list reads without Instagram posts (egress)
import crypto from "crypto";
import { isFullAdmin } from "./authSecurity";
import { fallbackSecret } from "./fallbackSecret"; // v396
import { fetchByUsername, lookupConfigured, graphError } from "./instagramConnect"; // v373: live views / likes for judging
import {
  CHALLENGE_ID, MAX_ENTRIES, RANKS, ENTRIES_CLOSE_AT, STARTS_AT, phaseAt, entriesOpen, datesFrom, dayText, DEFAULT_DATES,
  isEntryLink, entryKey, stampMessage, rankMessage, captionChecks, RECHARGE_SLOTS,
} from "../src/lib/diwaliChallenge";

// v367 (Ravi): Diwali Creator Challenge. No new table or column — an entry is a signed stamp inside the creator's
// portfolio item JSON (creator_profiles.portfolio), a winner is a signed rank on the same item.
//
//   GET  /challenge/public               → phase, server time, entry count, winners (from 5 Nov) — no login
//   GET  /challenge/me                   → my entries + can I enter (creator)
//   POST /challenge/stamp {items}        → signed stamps for items about to be saved with the toggle ON (creator)
//   GET  /admin/challenge/entries        → every entry (admin staff)
//   POST /admin/challenge/winner {user_id, item_id, rank|null} → mark / clear a winner (full admin)
// v377 (Ravi, "Diwali Challenge v2: Easy Entry"): any reel of the creator's own; admin reviews each entry
//   POST /admin/challenge/review {user_id, item_id, status: approved|rejected|pending} → entry status (admin)
//   POST /admin/challenge/recharge {user_id, sent} → "₹50 recharge sent" tick (admin)
//   GET  /admin/challenge/no-reel → creators who signed up since the start but have no entry (WhatsApp follow-up)
// The first 300 CREATORS (by their first entry that isn't rejected) get the ₹50 recharge — one per creator.
//
// The creator's app saves the stamp with its normal portfolio save (locked creators_routes.ts, unchanged). A stamp
// without a valid signature, after 2 Nov 23:59 IST, on a non-Instagram link, or past the 3rd entry is ignored.

function secret(): string {
  return process.env.CHALLENGE_SECRET || process.env.EMAIL_LINK_SECRET || process.env.CRON_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SESSION_SECRET || fallbackSecret(); // v396 (QA S-11)
}
export function sign(msg: string): string {
  return crypto.createHmac("sha256", secret()).update(msg).digest("base64url").slice(0, 32);
}
function same(a: string, b: string): boolean {
  return typeof a === "string" && typeof b === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Parsed portfolio entries of one profile row (string or object elements). Pure. */
export function parsePortfolio(list: any): any[] {
  return (Array.isArray(list) ? list : []).map((v: any) => {
    if (v && typeof v === "object") return v;
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (!t.startsWith("{")) return null;
    try { const o = JSON.parse(t); return o && typeof o === "object" ? o : null; } catch { return null; }
  });
}

/**
 * The valid entries of one creator, oldest first, at most MAX_ENTRIES. Pure (but needs the secret).
 * v367 deep test: an entry counts when the reel is still in the portfolio AND it has a valid signed stamp — either on
 * the portfolio item itself, or in the server's own ledger (ybex_ephemeral). The ledger keeps an entry (and a prize)
 * even if a later save from an old screen / another phone / the desktop editor dropped the stamp from the item.
 */
export function validEntries(userId: string, portfolio: any, ledger: any = null, closesAt: number = ENTRIES_CLOSE_AT): any[] {
  const items = parsePortfolio(portfolio).filter((it: any) => it && it.id && isEntryLink(it.content_url));
  const byKey = new Map<string, any>();
  for (const it of items) if (!byKey.has(entryKey(it.content_url))) byKey.set(entryKey(it.content_url), it);
  const ranks: Record<string, string> = (ledger && typeof ledger.ranks === "object" && ledger.ranks) || {};
  const okAt = (a: any) => { const t = Date.parse(a); return Number.isFinite(t) && t >= STARTS_AT && t <= closesAt; };
  const cands: any[] = [];
  // 1) stamps saved on the portfolio items
  for (const it of items) {
    if (it.challenge !== CHALLENGE_ID || !it.challenge_at || !it.challenge_sig || !okAt(it.challenge_at)) continue;
    if (!same(String(it.challenge_sig), sign(stampMessage(userId, it.id, it.challenge_at)))) continue;
    cands.push({ key: entryKey(it.content_url), at: it.challenge_at, item: it });
  }
  // 2) stamps in the server ledger, matched to the reel by its Instagram shortcode
  for (const l of (ledger && Array.isArray(ledger.entries) ? ledger.entries : [])) {
    const it = byKey.get(String(l?.key || ""));
    if (!it || !okAt(l.at) || !same(String(l.sig || ""), sign(stampMessage(userId, l.item_id, l.at)))) continue;
    cands.push({ key: l.key, at: l.at, item: it });
  }
  cands.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const out: any[] = [];
  const seen = new Set<string>();
  for (const c of cands) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    const it = c.item;
    const signedRank = it.challenge_rank && (RANKS as readonly string[]).includes(it.challenge_rank)
      && same(String(it.challenge_rank_sig || ""), sign(rankMessage(userId, it.id, it.challenge_rank))) ? it.challenge_rank : null;
    const ledgerRank = (RANKS as readonly string[]).includes(ranks[c.key]) ? ranks[c.key] : null;
    const rank = ranks[c.key] === "none" ? null : (ledgerRank || signedRank);
    out.push({ ...it, challenge: CHALLENGE_ID, challenge_at: c.at, challenge_rank: rank });
    if (out.length >= MAX_ENTRIES) break;
  }
  return out;
}

const handleOf = (row: any) => String(row?.instagram || row?.instagram_handle || "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[/?#].*$/, "").replace(/^@/, "").trim();

/** One creator row → its entries (not yet numbered). Pure. */
export function rowEntries(row: any, ledger: any = null, closesAt: number = ENTRIES_CLOSE_AT): any[] {
  const uid = String(row?.user_id || "");
  if (!uid) return [];
  // v373: numbers saved on the portfolio item are the ones from the day it was added; Admin → "Refresh numbers" keeps
  // the live ones in the ledger (stats by reel shortcode), and those win when present.
  const stats = (ledger && typeof ledger.stats === "object" && ledger.stats) || {};
  const follows = typeof ledger?.follows === "boolean" ? ledger.follows : null; // v396: admin's "Follows @ybex.in" tick
  return validEntries(uid, row.portfolio, ledger, closesAt).map((it) => {
    const live = stats[entryKey(it.content_url)] || null;
    const st = entryStatus(ledger, entryKey(it.content_url), live, follows); // v396
    return {
      user_id: uid, item_id: String(it.id), name: row.name || "", handle: handleOf(row) || cleanHandle(ledger?.handle), photo: row.picture || row.photo || "",
      followers: Number(row.followers_instagram) || null, content_url: it.content_url, cover: it.cover || "",
      views: Number(live?.views ?? it.views) || 0, likes: Number(live?.likes ?? it.likes) || 0, at: it.challenge_at, rank: it.challenge_rank || null,
      stats_at: live?.at || null, caption_ok: live ? live.caption_ok ?? null : null, live_found: live ? live.found !== false : null,
      tags: live?.tags || null, posted_at: live?.posted_at || null, posted_ok: live ? live.posted_ok ?? null : null,
      status: st.status, auto_rejected: st.auto, auto_reason: st.reason, follows, // v396
      recharge_sent_at: ledger?.recharge_sent_at || null, // v377
    };
  });
}

/** v377: an entry's review status from the creator's ledger. Pure. */
export function statusOf(ledger: any, key: string): "pending" | "approved" | "rejected" {
  const v = ledger && typeof ledger.review === "object" && ledger.review ? ledger.review[key] : null;
  return v === "approved" || v === "rejected" ? v : "pending";
}

/** v396 (Ravi: "jinhone hashtags use hi nahi kiye, wo kyu dikh rahe / count ho rahe"): after "Refresh numbers", a reel
 *  whose caption misses @ybex.in / #Ybex / #YbexDiwaliChallenge, or that was posted before the start, or a creator the
 *  admin marked "doesn't follow @ybex.in", is rejected automatically — out of the count and the ₹50 line. The admin's own
 *  Approve / Reject always wins. "Reel not found" (not in the last 25 posts / private) stays pending. Pure. */
export function entryStatus(ledger: any, key: string, live: any, follows: boolean | null = null): { status: "pending" | "approved" | "rejected"; auto: boolean; reason: string } {
  const manual = statusOf(ledger, key);
  if (manual !== "pending") return { status: manual, auto: false, reason: "" };
  const why: string[] = [];
  if (live && live.found !== false && live.caption_ok === false) why.push("tags missing");
  if (live && live.found !== false && live.posted_ok === false) why.push("posted before the start");
  if (follows === false) why.push("doesn't follow @ybex.in");
  return why.length ? { status: "rejected", auto: true, reason: why.join(", ") } : { status: "pending", auto: false, reason: "" };
}

/** v377: ₹50 recharge order — the first RECHARGE_SLOTS creators by their earliest entry that isn't rejected.
 *  Returns user_id → place (1…300). Pure. */
export function rechargeOrder(list: any[], slots: number = RECHARGE_SLOTS): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of [...(list || [])].sort(byTime)) {
    if (e.status === "rejected" || out.has(e.user_id)) continue;
    if (out.size >= slots) break;
    out.set(e.user_id, out.size + 1);
  }
  return out;
}
/** v377: entries that still count (not rejected). Pure. */
export const liveEntries = (list: any[]) => (list || []).filter((e) => e.status !== "rejected");

const byTime = (a: any, b: any) => Date.parse(a.at) - Date.parse(b.at) || a.user_id.localeCompare(b.user_id) || a.item_id.localeCompare(b.item_id);

/** All rows → one numbered list (Entry #1 = earliest). Pure. */
export function numberEntries(rows: any[], ledgers: Record<string, any> = {}, closesAt: number = ENTRIES_CLOSE_AT): any[] {
  const all: any[] = [];
  for (const row of rows || []) all.push(...rowEntries(row, ledgers[String(row?.user_id || "")] || null, closesAt));
  all.sort(byTime);
  return all.map((e, i) => ({ ...e, no: i + 1 }));
}

/** My entries numbered against everyone else's (cached) list — so "Entry #N" is right straight after saving. Pure. */
export function numberMine(mine: any[], others: any[]): any[] {
  const me = mine[0]?.user_id;
  const rest = (others || []).filter((e) => e.user_id !== me);
  return [...mine].sort(byTime).map((e, i) => ({ ...e, no: 1 + i + rest.filter((o) => byTime(o, e) < 0).length }));
}

/**
 * v368 (Ravi: "powered by ke logos, brands ke naam aur scripts admin se change ho, ek hi jagah se"): the sponsors and
 * prizes the admin saves. Cleans whatever the browser sent; never trusts it. Pure.
 *   sponsors: [{ name, logo (data:image/png|jpeg|webp;base64… ≤ 400 kB, or https URL), scripts: [text…] }] (max 8)
 *   prizes:   [{ title, value, note }] (max 6)
 */
export function cleanConfig(raw: any): { sponsors: any[]; prizes: any[]; reels: any[]; scripts: string[]; pool?: string; winners?: string; everyone?: string; closes_at?: string; results_at?: string } {
  const txt = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, n);
  const logoOk = (v: any) => {
    const l = String(v || "").trim();
    if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(l) && l.length <= 400_000) return l;
    if (/^https:\/\/[^\s"'<>]{4,500}$/.test(l)) return l;
    return "";
  };
  const sponsors = (Array.isArray(raw?.sponsors) ? raw.sponsors : []).slice(0, 8).map((x: any) => ({
    name: txt(x?.name, 40),
    logo: logoOk(x?.logo),
    scripts: (Array.isArray(x?.scripts) ? x.scripts : []).map((t: any) => txt(t, 600)).filter(Boolean).slice(0, 10),
  })).filter((x: any) => x.name);
  const prizes = (Array.isArray(raw?.prizes) ? raw.prizes : []).slice(0, 6).map((x: any) => ({
    title: txt(x?.title, 40), value: txt(x?.value, 60), note: txt(x?.note, 120),
  })).filter((x: any) => x.title && x.value);
  // v371 (Ravi: "2–3 example reels admin se upload, offer page pe chalti rahe"): uploaded video links (our storage).
  const https = (v: any) => { const u = String(v || "").trim(); return /^https:\/\/[^\s"'<>]{4,800}$/.test(u) ? u : ""; };
  const reels = (Array.isArray(raw?.reels) ? raw.reels : []).slice(0, 10)
    .map((x: any) => ({ url: https(x?.url), poster: https(x?.poster), caption: txt(x?.caption, 80) }))
    .filter((x: any) => x.url).slice(0, 3);
  // v369: dates the admin picks (entries close / winners shown). Kept only when they pass datesFrom's checks.
  // v376 (Ravi: "mujhe only scripts dalni hai, logo / naam nahi"): scripts with no brand → shown on /offer without a name
  const scripts = (Array.isArray(raw?.scripts) ? raw.scripts : []).map((t: any) => txt(t, 600)).filter(Boolean).slice(0, 10);
  const out: any = { sponsors, prizes, reels, scripts, pool: txt(raw?.pool, 40), winners: txt(raw?.winners, 40), everyone: txt(raw?.everyone, 220) };
  if (raw?.closes_at != null || raw?.results_at != null) {
    const d = datesFrom(raw);
    const want = Date.parse(String(raw?.closes_at || ""));
    if (Number.isFinite(want) && d.closesAt === want) {
      out.closes_at = new Date(d.closesAt).toISOString();
      out.results_at = new Date(d.resultsAt).toISOString();
    }
  }
  return out;
}

/** Key for the sponsor / prize settings — NOT under LEDGER_PREFIX, so it is never read as a creator's ledger. */
export const CONFIG_KEY = `challengecfg:${CHALLENGE_ID}`;

/**
 * v371 (Ravi: "entry ke liye sirf basics — naam, Instagram username, email ya phone; poora onboarding nahi"):
 * who may enter. Pure.
 */
export function basicsOf(user: any, profile: any, ledger: any) {
  const name = String(user?.name || user?.full_name || profile?.name || "").trim();
  const contact = String(user?.email || user?.phone || profile?.phone || profile?.business_email || profile?.email || "").trim();
  const handle = cleanHandle(handleOf(profile || {}) || ledger?.handle || "");
  const onboarded = Boolean(user?.onboarded || user?.onboarding_completed || user?.onboarding_complete || profile?.onboarding_complete);
  return { name, contact, handle, onboarded, eligible: onboarded || Boolean(name && contact) };
}
/** "@Ravi.K " / instagram.com/ravi.k/ → "ravi.k" ("" when it isn't a valid username). Pure. */
export function cleanHandle(v: any): string {
  const h = String(v || "").trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[/?#].*$/, "").replace(/^@+/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(h) ? h : "";
}

export const LEDGER_PREFIX = `challenge:${CHALLENGE_ID}:`;
const LEDGER_TABLE = "ybex_ephemeral"; // service-role only key/value table (scripts/sql/ybex_ephemeral.sql) — no new table
const LEDGER_EXPIRES = "2027-12-31T00:00:00Z";

/** v373: one creator's latest posts (Instagram) → live numbers for their entries, by shortcode. Pure. */
export function liveStatsFor(entries: any[], media: any[], nowIso: string): Record<string, any> {
  const byKey = new Map<string, any>();
  for (const m of media || []) if (m?.permalink) byKey.set(entryKey(m.permalink), m);
  const out: Record<string, any> = {};
  for (const e of entries || []) {
    const k = entryKey(e.content_url);
    const m = byKey.get(k);
    out[k] = m
      ? (() => { const c = captionChecks(m.caption); const posted = Date.parse(String(m.at || "")); // v377: all three tags + posted after the start
          return { views: Number(m.views) || 0, likes: Number(m.likes) || 0, comments: Number(m.comments) || 0, caption_ok: c.ok, tags: c, posted_at: m.at || null, posted_ok: Number.isFinite(posted) ? posted >= STARTS_AT : null, found: true, at: nowIso }; })()
      : { views: Number(e.views) || 0, likes: Number(e.likes) || 0, found: false, at: nowIso }; // not in the last 25 posts / deleted / private
  }
  return out;
}

export function setupChallengeRoutes(
  router: express.Router,
  { supabase, privilegedSupabase, parseAuthUser, fetchIg }: { supabase: any; privilegedSupabase: any; parseAuthUser: (req: express.Request) => Promise<any>; fetchIg?: (handle: string) => Promise<any> }
) {
  const igFetch = fetchIg || ((h: string) => fetchByUsername(h));
  const igReady = () => Boolean(fetchIg) || lookupConfigured();
  const sb = () => privilegedSupabase || supabase;
  let cache: { at: number; list: any[] } | null = null;
  let loading: Promise<any[]> | null = null; // one load at a time per instance (no thundering herd)
  let ledgerOff = false;

  const pick = (r: any) => ({ user_id: r.user_id, name: r.name, instagram: r.instagram, instagram_handle: r.instagram_handle, picture: r.picture, photo: r.photo, followers_instagram: r.followers_instagram, portfolio: r.portfolio });

  /** Every ledger row → { user_id: ledger }. null when the table is missing (then we fall back to scanning profiles). */
  async function readLedgers(): Promise<Record<string, any> | null> {
    if (ledgerOff) return null;
    try {
      // v373 deep test: Supabase returns at most 1,000 rows per request (max-rows), whatever .limit() says — with more
      // than 1,000 entrants / reminders the rest of the ledger (and the prizes in it) was silently skipped. Read in pages.
      const out: Record<string, any> = {};
      for (let from = 0; from < 50000; from += 1000) {
        const q = sb().from(LEDGER_TABLE).select("key, value").like("key", `${LEDGER_PREFIX}%`);
        const { data, error } = await (typeof q.order === "function" ? q.order("key", { ascending: true }) : q).range(from, from + 999); // stable pages
        if (error) { if (/does not exist|could not find|PGRST205|42P01/i.test(`${error.message} ${error.code}`)) ledgerOff = true; return from ? out : null; }
        for (const r of data || []) out[String(r.key).slice(LEDGER_PREFIX.length)] = r.value || {};
        if (!data || data.length < 1000) break;
      }
      return out;
    } catch { return null; }
  }
  async function readLedger(uid: string): Promise<any> {
    if (ledgerOff) return null;
    try {
      const { data, error } = await sb().from(LEDGER_TABLE).select("value").eq("key", LEDGER_PREFIX + uid).maybeSingle();
      if (error) return null;
      return data?.value || null;
    } catch { return null; }
  }
  async function writeLedger(uid: string, value: any): Promise<boolean> {
    if (ledgerOff) return false;
    try {
      const { error } = await sb().from(LEDGER_TABLE).upsert({ key: LEDGER_PREFIX + uid, value, expires_at: LEDGER_EXPIRES });
      if (error && /does not exist|could not find|PGRST205|42P01/i.test(`${error.message} ${error.code}`)) ledgerOff = true;
      return !error;
    } catch { return false; }
  }

  let cfgCache: { at: number; value: any } | null = null;
  /** Saved sponsors / prizes, or null (then the page uses the defaults in src/lib/diwaliChallenge.ts). */
  let cfgLoading: Promise<any> | null = null;
  async function readConfig(force = false): Promise<any> {
    if (!force && cfgCache && Date.now() - cfgCache.at < 30_000) return cfgCache.value;
    if (!force && cfgLoading) return cfgLoading;
    cfgLoading = readConfigNow();
    try { return await cfgLoading; } finally { cfgLoading = null; }
  }
  async function readConfigNow(): Promise<any> {
    let value: any = null;
    try {
      const { data, error } = await sb().from(LEDGER_TABLE).select("value").eq("key", CONFIG_KEY).maybeSingle();
      if (!error && data?.value) value = cleanConfig(data.value);
    } catch { /* defaults */ }
    cfgCache = { at: Date.now(), value };
    return value;
  }

  const datesNow = async () => datesFrom(await readConfig().catch(() => null));

  async function scanProfiles(onlyIds: Set<string> | null): Promise<any[]> {
    const rows: any[] = [];
    for (let from = 0; from < 50000; from += 1000) {
      const { data, error } = await readCreatorsLean(sb(), (q: any) => q.not("portfolio", "is", null).range(from, from + 999));
      if (error) throw error;
      for (const r of data || []) {
        if (!(onlyIds && onlyIds.has(String(r.user_id))) && !JSON.stringify(r.portfolio || "").includes(CHALLENGE_ID)) continue;
        rows.push(pick(r));
      }
      if (!data || data.length < 1000) break;
    }
    return rows;
  }

  async function loadAll(force = false): Promise<any[]> {
    if (!force && cache && Date.now() - cache.at < 60_000) return cache.list;
    if (loading) return loading;
    loading = (async () => {
      const ledgers = (await readLedgers()) || {};
      const ids = Object.keys(ledgers);
      let rows: any[];
      if (!ledgerOff && ids.length) {
        // Every entry since v367 is in the ledger → read only those creators (fast), plus a scan for stamps the
        // ledger may have missed (a write that failed) once the list is small enough to be cheap.
        rows = [];
        for (let i = 0; i < ids.length; i += 200) {
          const { data, error } = await readCreatorsLean(sb(), (q: any) => q.in("user_id", ids.slice(i, i + 200)));
          if (error) throw error;
          rows.push(...(data || []).map(pick));
        }
        if (!cache || force) {
          const have = new Set(rows.map((r) => String(r.user_id)));
          for (const r of await scanProfiles(null)) if (!have.has(String(r.user_id))) rows.push(r);
        }
      } else {
        rows = await scanProfiles(null);
      }
      const list = numberEntries(rows, ledgers, (await datesNow()).closesAt);
      cache = { at: Date.now(), list };
      return list;
    })();
    try { return await loading; } finally { loading = null; }
  }

  async function profileOf(userId: string) {
    const { data } = await sb().from("creator_profiles").select("*").eq("user_id", userId).maybeSingle();
    return data || null;
  }

  async function myEntries(uid: string): Promise<any[]> {
    const [profile, ledger] = await Promise.all([profileOf(uid), readLedger(uid)]);
    return profile ? rowEntries(pick(profile), ledger, (await datesNow()).closesAt) : [];
  }

  router.get("/challenge/public", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    const now = Date.now();
    const d = sb() ? await datesNow() : DEFAULT_DATES;
    const phase = phaseAt(now, d);
    let entries = 0, creators = 0, winners: any[] = [];
    let rechargeLeft = RECHARGE_SLOTS;
    try {
      if (sb()) {
        const list = await loadAll();
        const live = liveEntries(list); // v377: rejected entries don't count
        entries = live.length;
        creators = new Set(live.map((e) => e.user_id)).size;
        rechargeLeft = Math.max(0, RECHARGE_SLOTS - rechargeOrder(list).size);
        if (now >= d.resultsAt) {
          winners = list.filter((e) => e.rank).sort((a, b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank) || b.views - a.views)
            .map((e) => ({ rank: e.rank, no: e.no, name: e.name, handle: e.handle, photo: e.photo, user_id: e.user_id, cover: e.cover, content_url: e.content_url, views: e.views, likes: e.likes }));
        }
      }
    } catch { /* counts stay 0 */ }
    const config = sb() ? await readConfig().catch(() => null) : null;
    return res.json({ now, phase, starts_at: d.startsAt, closes_at: d.closesAt, results_at: d.resultsAt, entries, creators, winners, config,
      recharge_left: rechargeLeft, recharge_slots: RECHARGE_SLOTS });
  });

  router.get("/challenge/me", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const user = await parseAuthUser(req).catch(() => null);
    if (!user) return res.status(401).json({ error: "Log in first." });
    const now = Date.now();
    const d = sb() ? await datesNow() : DEFAULT_DATES;
    let mine: any[] = [];
    let onboarded = Boolean(user.onboarded || user.onboarding_completed || user.onboarding_complete);
    let basics: any = basicsOf(user, null, null);
    let remind = false;
    let recharge: any = { place: null, sent_at: null, left: RECHARGE_SLOTS };
    try {
      if (sb()) {
        const uid = String(user.user_id);
        const [list, own, prof, led] = await Promise.all([loadAll(), myEntries(uid), profileOf(uid), readLedger(uid)]);
        // v377: my place in the ₹50 recharge line (my fresh entries + everyone else's cached list)
        const order = rechargeOrder([...list.filter((e) => e.user_id !== uid), ...own]);
        recharge = { place: order.get(uid) || null, sent_at: led?.recharge_sent_at || null, left: Math.max(0, RECHARGE_SLOTS - order.size) };
        basics = basicsOf(user, prof, led);
        remind = Boolean(led?.remind);
        mine = numberMine(own, list); // fresh for me, so "Entry #N" shows right after saving (any instance)
        if (now < d.resultsAt) mine = mine.map((e) => ({ ...e, rank: null })); // no spoilers before results day
        onboarded = basics.onboarded;
      }
    } catch { /* empty */ }
    return res.json({
      now, phase: phaseAt(now, d), starts_at: d.startsAt, closes_at: d.closesAt, results_at: d.resultsAt, is_creator: user.role === "creator", onboarded,
      eligible: basics.eligible, handle: basics.handle, need_handle: !basics.handle, remind, // v371: basics are enough to enter
      entries: mine, left: Math.max(0, MAX_ENTRIES - mine.length), max: MAX_ENTRIES, recharge,
      sponsor_names: ((sb() ? await readConfig().catch(() => null) : null)?.sponsors || []).map((x: any) => x.name), // v368: tag a sponsor → toggle
      pool: (sb() ? (await readConfig().catch(() => null))?.pool : "") || "", // v371: Home card headline
    });
  });

  // v373 deep test: two stamp requests from the same creator at the same moment (double tap, two phones) both saw
  // "2 left" and both got stamps — the 4th reel showed "Entry is in" but never counted. One at a time per creator.
  const stampLocks = new Map<string, Promise<any>>();
  router.post("/challenge/stamp", async (req, res) => {
    const user = await parseAuthUser(req).catch(() => null);
    if (!user) return res.status(401).json({ error: "Log in first." });
    if (user.role !== "creator") return res.status(403).json({ error: "Only creators can enter the challenge." });
    if (!sb()) return res.status(503).json({ error: "The server is not connected to the database." });
    const lockId = String(user.user_id);
    const prev = stampLocks.get(lockId) || Promise.resolve();
    let release: () => void = () => {};
    const mine = new Promise<void>((r) => { release = r; });
    const chain = prev.then(() => mine);
    stampLocks.set(lockId, chain);
    await prev.catch(() => {});
    try { return await stampNow(req, res, user); }
    finally { release(); if (stampLocks.get(lockId) === chain) stampLocks.delete(lockId); }
  });
  async function stampNow(req: express.Request, res: express.Response, user: any) {
    const dates = await datesNow();
    if (!entriesOpen(Date.now(), dates)) return res.status(400).json({ error: `Entries for the Diwali Challenge closed on ${dayText(dates.closesAt)}.` });
    const uid = String(user.user_id);
    const profile = await profileOf(uid);
    const ledger0 = await readLedger(uid);
    const basics = basicsOf(user, profile, ledger0);
    if (!basics.eligible) return res.status(400).json({ error: "Add your name and email or phone number to your Ybex profile first.", code: "NOT_ONBOARDED" });
    const sentHandle = cleanHandle(req.body?.handle);
    const handle = basics.handle || sentHandle;
    if (!handle) return res.status(400).json({ error: "Add your Instagram username to enter.", code: "NEED_HANDLE" });
    const items = (Array.isArray(req.body?.items) ? req.body.items : []).slice(0, 10)
      .map((x: any) => ({ id: String(x?.id || "").slice(0, 80), content_url: String(x?.content_url || "").trim().slice(0, 500) }))
      .filter((x: any) => /^[\w.-]{3,80}$/.test(x.id));
    if (!items.length) return res.status(400).json({ error: "Nothing to enter." });
    const bad = items.find((x: any) => !isEntryLink(x.content_url));
    if (bad) return res.status(400).json({ error: "Only an Instagram reel or post link counts (instagram.com/reel/… or /p/…).", code: "BAD_LINK" });
    const ledger = ledger0;
    const have = validEntries(uid, profile?.portfolio, ledger, dates.closesAt);
    const haveKeys = new Set(have.map((e) => entryKey(e.content_url)));
    const fresh = items.filter((x: any, i: number, a: any[]) => !haveKeys.has(entryKey(x.content_url)) && a.findIndex((y) => entryKey(y.content_url) === entryKey(x.content_url)) === i);
    // v373: stamps handed out in the last 15 min whose reel isn't saved in the portfolio yet (the app saves right after
    // stamping) still hold a slot — otherwise two quick requests each saw "2 left" and a 4th "entry" never counted.
    const reqKeys = new Set(items.map((x: any) => entryKey(x.content_url)));
    const pending = new Set((Array.isArray(ledger?.entries) ? ledger.entries : [])
      .filter((l: any) => l?.key && !haveKeys.has(l.key) && !reqKeys.has(l.key) && Date.now() - Date.parse(l.at) < 15 * 60_000)
      .map((l: any) => l.key)).size;
    const left = Math.max(0, MAX_ENTRIES - have.length - pending);
    if (!fresh.length) return res.status(400).json({ error: "This reel is already in the challenge.", code: "DUPLICATE" });
    if (fresh.length > left) return res.status(400).json({ error: left ? `You can enter ${left} more reel${left === 1 ? "" : "s"} (max ${MAX_ENTRIES}).` : `You've used all ${MAX_ENTRIES} entries.`, code: "LIMIT" });
    const at = new Date().toISOString();
    const stamps: Record<string, any> = {};
    for (const x of fresh) stamps[x.id] = { challenge: CHALLENGE_ID, challenge_at: at, challenge_sig: sign(stampMessage(uid, x.id, at)) };
    // the server's own copy; it only counts once the reel is really saved in the portfolio
    const keep = (Array.isArray(ledger?.entries) ? ledger.entries : []).filter((l: any) => !fresh.some((x: any) => entryKey(x.content_url) === l?.key)).slice(-20);
    await writeLedger(uid, { ...(ledger || {}), handle, remind: false, entries: [...keep, ...fresh.map((x: any) => ({ key: entryKey(x.content_url), item_id: x.id, at, sig: stamps[x.id].challenge_sig }))] });
    cache = null;
    return res.json({ stamps, left: left - fresh.length });
  }

  // v371: "Not yet — remind me" (creator joined, reel not posted yet). Kept in the creator's ledger row.
  router.post("/challenge/remind", async (req, res) => {
    const user = await parseAuthUser(req).catch(() => null);
    if (!user) return res.status(401).json({ error: "Log in first." });
    if (user.role !== "creator") return res.status(403).json({ error: "Only creators can join the challenge." });
    if (!sb()) return res.status(503).json({ error: "Database not connected." });
    const uid = String(user.user_id);
    const [led, prof] = await Promise.all([readLedger(uid), profileOf(uid)]);
    const b = basicsOf(user, prof, led);
    const handle = b.handle || cleanHandle(req.body?.handle);
    const ok = await writeLedger(uid, { ...(led || {}), remind: true, remind_at: new Date().toISOString(), ...(handle ? { handle } : {}),
      contact: { name: b.name, email: String(user.email || prof?.business_email || ""), phone: String(user.phone || prof?.phone || "") } });
    return ok ? res.json({ ok: true }) : res.status(500).json({ error: "Could not save. Try again." });
  });

  // v371: who asked to be reminded and hasn't entered yet (Admin → Challenge entries → Reminders CSV).
  router.get("/admin/challenge/reminders", async (req, res) => {
    const u = await parseAuthUser(req).catch(() => null);
    if (!u || !(u.role === "admin" || u.is_admin === true)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    if (!sb()) return res.json({ reminders: [] });
    const [ledgers, list] = await Promise.all([readLedgers(), loadAll(true)]);
    const entered = new Set(list.map((e) => e.user_id));
    const reminders = Object.entries(ledgers || {}).filter(([uid, l]: any) => l?.remind && !entered.has(uid))
      .map(([uid, l]: any) => ({ user_id: uid, name: l.contact?.name || "", email: l.contact?.email || "", phone: l.contact?.phone || "", handle: l.handle || "", at: l.remind_at || "" }));
    return res.json({ reminders });
  });

  router.get("/admin/challenge/entries", async (req, res) => {
    const u = await parseAuthUser(req).catch(() => null);
    if (!u || !(u.role === "admin" || u.is_admin === true)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    if (!sb()) return res.json({ entries: [] });
    try {
      const list = await loadAll(req.query.fresh === "1");
      const d = await datesNow();
      // v377: WhatsApp / email for follow-up and the ₹50 recharge, and each creator's place in the recharge line
      const ids = [...new Set(list.map((e) => e.user_id))];
      const contact = new Map<string, any>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await sb().from("users").select("user_id, email, phone").in("user_id", ids.slice(i, i + 200));
        for (const r of data || []) contact.set(String(r.user_id), r);
      }
      // v377 (Ravi): the ₹50 goes only to creators who completed their profile → show how far each one is
      const profiles = new Map<string, any>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await readCreatorsLean(sb(), (q: any) => q.in("user_id", ids.slice(i, i + 200)));
        for (const r of data || []) profiles.set(String(r.user_id), creatorProfileStrength(r));
      }
      const order = rechargeOrder(list);
      const entries = list.map((e) => ({ ...e, profile_percent: profiles.get(e.user_id)?.percent ?? 0, profile_missing: profiles.get(e.user_id)?.missing || [], phone: contact.get(e.user_id)?.phone || "", email: /@ybex\.io$/i.test(String(contact.get(e.user_id)?.email || "")) ? "" : (contact.get(e.user_id)?.email || ""), recharge_place: order.get(e.user_id) || null }));
      return res.json({ entries, phase: phaseAt(Date.now(), d), closes_at: d.closesAt, results_at: d.resultsAt, recharge_left: Math.max(0, RECHARGE_SLOTS - order.size), recharge_slots: RECHARGE_SLOTS });
    } catch {
      return res.status(500).json({ error: "Could not load entries." });
    }
  });

  // v373 deep test: nothing refreshed an entry's views / likes after it was saved, and winners are picked on them.
  // Admin → Challenge entries → "Refresh numbers" calls this step by step (5 creators per call, keep the page open):
  // each entrant's last 25 Instagram posts → live views / likes / hashtag check into the ledger.
  router.post("/admin/challenge/refresh-stats", async (req, res) => {
    const u = await parseAuthUser(req).catch(() => null);
    if (!u || !(u.role === "admin" || u.is_admin === true)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    if (!sb()) return res.status(503).json({ error: "Database not connected." });
    if (!igReady()) return res.status(400).json({ error: "Instagram fetch isn't set up on the server (IG_GRAPH_TOKEN / IG_BUSINESS_ID).", code: "NOT_CONFIGURED" });
    const offset = Math.max(0, Math.floor(Number(req.body?.offset) || 0));
    const list = await loadAll(offset === 0);
    const byUser = new Map<string, any[]>();
    for (const e of list) { if (!byUser.has(e.user_id)) byUser.set(e.user_id, []); byUser.get(e.user_id)!.push(e); }
    const users = [...byUser.keys()].sort();
    const batch = users.slice(offset, offset + 5);
    let updated = 0; const errors: any[] = [];
    for (const uid of batch) {
      const mine = byUser.get(uid) || [];
      const handle = cleanHandle(mine[0]?.handle);
      if (!handle) { errors.push({ user_id: uid, error: "No Instagram username" }); continue; }
      try {
        const stats = await igFetch(handle);
        const led = (await readLedger(uid)) || {};
        await writeLedger(uid, { ...led, stats: { ...((led && led.stats) || {}), ...liveStatsFor(mine, stats?.media || [], new Date().toISOString()) } });
        updated++;
      } catch (e: any) {
        const g = graphError(e);
        if (g.code === "TOKEN" || g.code === "RATE_LIMIT") return res.status(502).json({ error: g.error, code: g.code, offset, total: users.length, updated });
        errors.push({ user_id: uid, handle, error: g.error });
      }
    }
    cache = null;
    const next = offset + batch.length;
    return res.json({ ok: true, offset, next, total: users.length, done: next >= users.length, updated, errors });
  });

  // v377: Approve / Reject / back to Pending. Approve only when the reel is the creator's own, public, posted after the
  // start, and the caption has @ybex.in + #Ybex + #YbexDiwaliChallenge (the list shows the checks from "Refresh numbers").
  router.post("/admin/challenge/review", async (req, res) => {
    const u = await parseAuthUser(req).catch(() => null);
    if (!u || !(u.role === "admin" || u.is_admin === true)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    const uid = String(req.body?.user_id || "");
    const itemId = String(req.body?.item_id || "");
    const status = String(req.body?.status || "");
    if (!uid || !itemId) return res.status(400).json({ error: "Missing entry." });
    if (!["approved", "rejected", "pending"].includes(status)) return res.status(400).json({ error: "Unknown status." });
    if (!sb()) return res.status(503).json({ error: "Database not connected." });
    const profile = await profileOf(uid);
    if (!profile) return res.status(404).json({ error: "Creator not found." });
    const ledger = (await readLedger(uid)) || {};
    const entryItem = validEntries(uid, profile.portfolio, ledger, (await datesNow()).closesAt).find((e) => String(e.id) === itemId);
    if (!entryItem) return res.status(400).json({ error: "That reel is not a valid entry any more." });
    const k = entryKey(entryItem.content_url);
    const review = { ...((ledger && ledger.review) || {}) };
    if (status === "pending") delete review[k]; else review[k] = status;
    const ok = await writeLedger(uid, { ...ledger, review, review_by: String(u.user_id || ""), review_at: new Date().toISOString() });
    if (!ok) return res.status(500).json({ error: "Could not save." });
    cache = null;
    return res.json({ ok: true, status });
  });

  // v396: "Follows @ybex.in" — Instagram's API can't tell who follows us, so the admin checks and ticks it (per creator).
  // follows: true | false | null (null = not checked). false rejects that creator's pending entries (entryStatus).
  router.post("/admin/challenge/follow", async (req, res) => {
    const u = await parseAuthUser(req).catch(() => null);
    if (!u || !(u.role === "admin" || u.is_admin === true)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    const uid = String(req.body?.user_id || "");
    if (!uid) return res.status(400).json({ error: "Missing creator." });
    const v = req.body?.follows;
    if (!(v === true || v === false || v === null)) return res.status(400).json({ error: "follows must be true, false or null." });
    if (!sb()) return res.status(503).json({ error: "Database not connected." });
    const ledger = (await readLedger(uid)) || {};
    const next: any = { ...ledger, follow_by: String(u.user_id || ""), follow_at: new Date().toISOString() };
    if (v === null) delete next.follows; else next.follows = v;
    const ok = await writeLedger(uid, next);
    if (!ok) return res.status(500).json({ error: "Could not save." });
    cache = null;
    return res.json({ ok: true, follows: v });
  });

  // v377: "₹50 recharge sent" tick (one per creator).
  router.post("/admin/challenge/recharge", async (req, res) => {
    const u = await parseAuthUser(req).catch(() => null);
    if (!u || !(u.role === "admin" || u.is_admin === true)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    const uid = String(req.body?.user_id || "");
    if (!uid) return res.status(400).json({ error: "Missing creator." });
    if (!sb()) return res.status(503).json({ error: "Database not connected." });
    const ledger = (await readLedger(uid)) || {};
    const sentAt = req.body?.sent ? new Date().toISOString() : null;
    const ok = await writeLedger(uid, { ...ledger, recharge_sent_at: sentAt, recharge_by: String(u.user_id || "") });
    if (!ok) return res.status(500).json({ error: "Could not save." });
    cache = null;
    return res.json({ ok: true, recharge_sent_at: sentAt });
  });

  // v377: signed up since the challenge started, no entry yet → WhatsApp / email follow-up list.
  router.get("/admin/challenge/no-reel", async (req, res) => {
    const u = await parseAuthUser(req).catch(() => null);
    if (!u || !(u.role === "admin" || u.is_admin === true)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    if (!sb()) return res.json({ creators: [] });
    try {
      const d = await datesNow();
      const list = await loadAll(true);
      const entered = new Set(list.map((e) => e.user_id));
      const users: any[] = [];
      for (let from = 0; from < 20000; from += 1000) {
        const { data, error } = await sb().from("users").select("user_id, name, email, phone, created_at, is_deleted").eq("role", "creator")
          .gte("created_at", new Date(d.startsAt).toISOString()).order("created_at", { ascending: false }).range(from, from + 999);
        if (error) throw error;
        users.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const left = users.filter((x) => !x.is_deleted && !entered.has(String(x.user_id)));
      const handles = new Map<string, string>();
      for (let i = 0; i < left.length; i += 200) {
        const { data } = await sb().from("creator_profiles").select("user_id, instagram, instagram_handle").in("user_id", left.slice(i, i + 200).map((x) => x.user_id));
        for (const r of data || []) handles.set(String(r.user_id), handleOf(r));
      }
      const ledgers = (await readLedgers()) || {};
      return res.json({ creators: left.map((x) => ({
        user_id: x.user_id, name: x.name || "", handle: handles.get(String(x.user_id)) || cleanHandle(ledgers[x.user_id]?.handle) || "",
        email: /@ybex\.io$/i.test(String(x.email || "")) ? "" : (x.email || ""), phone: x.phone || "", joined_at: x.created_at, remind: Boolean(ledgers[x.user_id]?.remind),
      })) });
    } catch (e: any) {
      return res.status(500).json({ error: "Could not load the list." });
    }
  });

  router.get("/admin/challenge/config", async (req, res) => {
    const u = await parseAuthUser(req).catch(() => null);
    if (!u || !(u.role === "admin" || u.is_admin === true)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    res.set("Cache-Control", "no-store");
    return res.json({ config: sb() ? await readConfig(true) : null });
  });

  router.post("/admin/challenge/config", express.json({ limit: "4mb" }), async (req, res) => {
    const u = await parseAuthUser(req).catch(() => null);
    if (!isFullAdmin(u)) return res.status(403).json({ detail: "Only a full admin can change sponsors and prizes.", _status: 403 });
    if (!sb()) return res.status(503).json({ error: "Database not connected." });
    const value = cleanConfig(req.body?.config);
    if (req.body?.config?.closes_at && !value.closes_at) return res.status(400).json({ error: "Pick a close date after 22 Oct and within 120 days, and a results date on or after it." });
    const bad = (Array.isArray(req.body?.config?.sponsors) ? req.body.config.sponsors : []).find((x: any) => x?.logo && !value.sponsors.find((v) => v.name === String(x.name || "").trim().slice(0, 40))?.logo);
    if (bad) return res.status(400).json({ error: `The logo for ${bad.name || "a sponsor"} is too big or not an image. Use a PNG, JPG or WebP under 300 KB.` });
    try {
      const { error } = await sb().from(LEDGER_TABLE).upsert({ key: CONFIG_KEY, value: { ...value, updated_at: new Date().toISOString(), updated_by: String(u.user_id || "") }, expires_at: LEDGER_EXPIRES });
      if (error) {
        const missing = /does not exist|could not find|PGRST205|42P01/i.test(`${error.message} ${error.code}`);
        return res.status(500).json({ error: missing ? "Saving needs the table ybex_ephemeral (scripts/sql/ybex_ephemeral.sql). Ask Claude / run it once in Supabase." : "Could not save. Try again." });
      }
    } catch { return res.status(500).json({ error: "Could not save. Try again." }); }
    cfgCache = { at: Date.now(), value };
    cache = null; // entries depend on the close date
    return res.json({ ok: true, config: value });
  });

  router.post("/admin/challenge/winner", async (req, res) => {
    const u = await parseAuthUser(req).catch(() => null);
    if (!isFullAdmin(u)) return res.status(403).json({ detail: "Only a full admin can mark winners.", _status: 403 });
    const uid = String(req.body?.user_id || "");
    const itemId = String(req.body?.item_id || "");
    const rank = req.body?.rank ? String(req.body.rank) : null;
    if (!uid || !itemId) return res.status(400).json({ error: "Missing entry." });
    if (rank && !(RANKS as readonly string[]).includes(rank)) return res.status(400).json({ error: "Unknown rank." });
    if (!sb()) return res.status(503).json({ error: "Database not connected." });
    const profile = await profileOf(uid);
    if (!profile) return res.status(404).json({ error: "Creator not found." });
    const ledger = await readLedger(uid);
    const entryItem = validEntries(uid, profile.portfolio, ledger, (await datesNow()).closesAt).find((e) => String(e.id) === itemId);
    if (!entryItem) return res.status(400).json({ error: "That reel is not a valid entry any more." });
    // the prize lives in the server ledger (a creator's save can't remove it) and on the item (for the ribbon)
    const k = entryKey(entryItem.content_url);
    const savedLedger = await writeLedger(uid, { ...(ledger || {}), ranks: { ...((ledger && ledger.ranks) || {}), [k]: rank || "none" } });
    let found = false;
    const next = (Array.isArray(profile.portfolio) ? profile.portfolio : []).map((raw: any) => {
      const isStr = typeof raw === "string";
      const it = parsePortfolio([raw])[0];
      if (!it || String(it.id) !== itemId) return raw;
      found = true;
      const copy = { ...it };
      if (rank) { copy.challenge_rank = rank; copy.challenge_rank_sig = sign(rankMessage(uid, itemId, rank)); }
      else { delete copy.challenge_rank; delete copy.challenge_rank_sig; }
      return isStr ? JSON.stringify(copy) : copy;
    });
    if (!found) return res.status(404).json({ error: "Entry not found." });
    const { error } = await sb().from("creator_profiles").update({ portfolio: next }).eq("user_id", uid);
    if (error && !savedLedger) return res.status(500).json({ error: "Could not save." });
    cache = null;
    return res.json({ ok: true, rank });
  });
}
