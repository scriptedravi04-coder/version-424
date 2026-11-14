// v349 (Session 62, Ravi: "Instagram ka data manually daalna pad raha hai — 12k daala, 3 din baad 15k ho gaye to
// update nahi hota. Real data chahiye. Username daalte hi fetch ho jaaye. DM code + Instagram login dono option do.")
//
// Three ways, all through Meta's official APIs (no scraping, no passwords):
//  1. USERNAME → numbers. Ybex's own Instagram professional account asks Meta's Business Discovery API for the
//     creator's public numbers (followers, posts, likes / comments / views of the last 25 posts). Works for any
//     Business / Creator account (most influencers). Personal accounts → "switch to a Creator account (free)".
//     Env: IG_GRAPH_TOKEN (Ybex's long-lived token, Facebook Login: instagram_basic + pages_read_engagement +
//     instagram_manage_messages) + IG_BUSINESS_ID (Ybex's Instagram professional account id).
//  2. DM CODE → proves the account is theirs. The creator gets "YBX-482913", sends it as a DM to Ybex's Instagram.
//     Meta's webhook (POST /api/webhooks/instagram) gives the sender; we read the sender's username and mark that
//     Instagram verified for that creator. Env: IG_WEBHOOK_VERIFY_TOKEN, META_APP_SECRET (signature),
//     IG_DM_USERNAME (shown to creators), optional IG_MESSAGING_TOKEN (page token; else IG_GRAPH_TOKEN).
//  3. INSTAGRAM LOGIN (OAuth, Instagram's own page) → verified + reach / views insights. Env: IG_APP_ID,
//     IG_APP_SECRET. Redirect URI to add in Meta: <APP_URL>/api/instagram/oauth/callback.
// Numbers refresh by themselves every day (in-process job, ≤ 60 creators an hour — Meta allows 200 calls/hour).
// A creator whose numbers come from Instagram can't overwrite them by hand (guard on POST /creators/profile,
// which itself is a locked file and is not changed).
import { setSignupFollowerLookup } from "./followerGate";
import crypto from "crypto";
import express from "express";
import { ephemeralSet, ephemeralGet, ephemeralDelete } from "./ephemeralStore";
import { logIgnored } from "./logIgnored";
import { fallbackSecret } from "./fallbackSecret"; // v396
import { qualifyCreatorAll } from "./metaCapi"; // v395: Meta "QualifiedCreator" (1,000+ followers); v418: + 10K
import { cronAuthorized } from "./emailLinks"; // v373
import { clientIp, SESSION_MS } from "./authSecurity"; // v352
import { mediaListFrom, emailFromBio, photoIsReplaceable, isIgPhoto, copyIgPhoto, pickAutoRefresh, AUTO_REFRESH_PER_DAY, lastActiveByUser, makeBudget, copyPortfolioCover, igShortcode } from "./instagramAutofill"; // v354; v363 portfolio covers

const GRAPH_VERSION = () => process.env.IG_GRAPH_VERSION || "v26.0";
const env = (k: string) => String(process.env[k] || "").trim();
const DAY = 24 * 3600 * 1000;

// ───────────────────────────── pure helpers (tested) ─────────────────────────────

/** "@Name", "instagram.com/name/", "https://www.instagram.com/name?igsh=…" → "name". null when not valid. */
export function cleanUsername(v: any): string | null {
  let s = String(v ?? "").trim();
  const m = /instagram\.com\/([^/?#\s]+)/i.exec(s);
  if (m) s = m[1];
  s = s.replace(/^@+/, "").replace(/\/+$/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(s) && !/^\.|\.\.|\.$/.test(s) ? s : null;
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

/** Business Discovery / Instagram Login profile + media → the numbers we keep. Pure. */
export function statsFromInstagram(profile: any, media: any[] = [], extra: any = {}, now = Date.now()) {
  const posts = (Array.isArray(media) ? media : []).slice(0, 25);
  const likes = posts.map((p) => Number(p.like_count)).filter((n) => Number.isFinite(n) && n >= 0);
  const comments = posts.map((p) => Number(p.comments_count)).filter((n) => Number.isFinite(n) && n >= 0);
  const reels = posts.filter((p) => String(p.media_product_type || "").toUpperCase() === "REELS" || String(p.media_type || "").toUpperCase() === "VIDEO");
  const views = reels.map((p) => Number(p.view_count ?? p.views ?? p.play_count)).filter((n) => Number.isFinite(n) && n > 0);
  // v409 (Ravi: @aryanxploree — 1.7K avg views but "0 followers"): Meta sometimes leaves followers_count out. Missing is
  // now null ("unknown"), never 0 — a 0 sent real creators to the "under 500" page / blocked their sign-up.
  const followers = profile?.followers_count == null || !Number.isFinite(Number(profile.followers_count)) ? null : Math.max(0, Math.round(Number(profile.followers_count)));
  const avgLikes = avg(likes), avgComments = avg(comments), avgViews = avg(views);
  const er = (followers || 0) > 0 && (avgLikes || avgComments) ? Math.round(((avgLikes + avgComments) / (followers as number)) * 10000) / 100 : null;
  return {
    username: String(profile?.username || "").toLowerCase() || null,
    name: profile?.name || null,
    profile_picture_url: profile?.profile_picture_url || null,
    followers,
    follows: Number(profile?.follows_count) || null,
    media_count: Number(profile?.media_count) || null,
    avg_likes: avgLikes,
    avg_comments: avgComments,
    avg_views: avgViews || null,
    engagement_rate: er,
    posts_checked: posts.length,
    reach_28d: extra.reach_28d ?? null,
    views_28d: extra.views_28d ?? null,
    source: extra.source || "business_discovery",
    fetched_at: new Date(now).toISOString(),
    // v354: last posts (portfolio picker) + an e-mail written in the bio (Meta never gives the login e-mail).
    media: mediaListFrom(posts),
    bio_email: emailFromBio(profile?.biography),
    biography: profile?.biography ? String(profile.biography).slice(0, 500) : null, // v363: brand onboarding fills the description
    website: cleanWebsite(profile?.website), // v366
  };
}

/** The creator_profiles columns a fetch updates. Old numbers are never wiped by a failed fetch. Pure. */
export function profilePatchFromStats(stats: any, nowIso: string) {
  const patch: any = {
    instagram_handle: stats.username, instagram: stats.username,
    followers_instagram: stats.followers, ig_followers: stats.followers, follower_count: stats.followers,
    avg_likes_30d: stats.avg_likes, avg_comments_30d: stats.avg_comments,
    instagram_stats: stats, instagram_synced_at: nowIso, updated_at: nowIso,
  };
  if (stats.avg_views) patch.avg_views_30d = stats.avg_views;
  else if (stats.reach_28d) patch.avg_views_30d = stats.reach_28d;
  if (stats.engagement_rate !== null && stats.engagement_rate !== undefined) patch.engagement_rate = stats.engagement_rate;
  return patch;
}

/** Meta error → our code + a plain message. Pure. */
export function graphError(err: any): { code: string; error: string } {
  const e = err?.error || err || {};
  const sub = Number(e.error_subcode), code = Number(e.code);
  if (sub === 2207013 || /cannot find user|not.*business|professional/i.test(String(e.message || ""))) {
    return { code: "NOT_PROFESSIONAL", error: "We couldn't read this account. Check the username, and make sure it's a public Creator or Business account (Instagram → Settings → Account type → switch to Creator — free, takes 30 seconds)." };
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) return { code: "RATE_LIMIT", error: "Instagram is busy right now. Try again in a few minutes." };
  // v372 (Ravi: "kisi ko bhi fetch nahi kar pa raha" — 144 waitlist rows): Meta answered "Cannot call API for app … on
  // behalf of user …" (code 200 / 10 / 102 / 463 / 467). That is Ybex's own Facebook login token losing its permission
  // (password changed, app removed, permission revoked) — NOT the creator's fault. Said plainly so admin knows to renew it.
  if (code === 190 || code === 102 || code === 463 || code === 467 || ((code === 200 || code === 10) && /on behalf of user|permission/i.test(String(e.message || "")))
    || /cannot call api for app|error validating access token|session has been invalidated|has not authorized application/i.test(String(e.message || ""))) {
    return { code: "TOKEN", error: "Instagram fetch is paused on Ybex's side right now (our Instagram connection needs renewing). The Ybex team is on it — try again later." };
  }
  return { code: "IG_ERROR", error: "Couldn't reach Instagram right now. Try again in a minute." };
}

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function makeDmCode(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
  return `YBX-${s}`;
}
/** Finds "YBX-XXXXXX" in a DM (any case, with or without the dash / spaces). Pure. */
export function extractDmCode(text: any): string | null {
  const m = /\bYBX[\s-]?([A-Z0-9]{6})\b/i.exec(String(text || ""));
  return m ? `YBX-${m[1].toUpperCase()}` : null;
}

/** Meta webhook signature (X-Hub-Signature-256: sha256=<hex>). Pure. */
export function validMetaSignature(raw: Buffer | string, header: any, secret: string): boolean {
  if (!secret || !header) return false;
  const want = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(String(header)), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const tokenKey = () => crypto.createHash("sha256").update(env("IG_TOKEN_KEY") || env("MEDIA_KEY_SECRET") || env("SESSION_SECRET") || env("SUPABASE_SERVICE_ROLE_KEY") || "ybex-ig").digest();
export function sealToken(t: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", tokenKey(), iv);
  const enc = Buffer.concat([c.update(String(t), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}
export function openToken(s: string): string | null {
  try {
    const [iv, tag, enc] = String(s || "").split(".").map((x) => Buffer.from(x, "base64url"));
    const d = crypto.createDecipheriv("aes-256-gcm", tokenKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch { return null; }
}

const stateSecret = () => env("OAUTH_STATE_SECRET") || env("SESSION_SECRET") || env("SUPABASE_SERVICE_ROLE_KEY") || fallbackSecret(); // v396 (QA S-11)
export function makeIgState(userId: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ u: userId, t: now, n: crypto.randomBytes(6).toString("hex") })).toString("base64url");
  return `${body}.${crypto.createHmac("sha256", stateSecret()).update(body).digest("base64url")}`;
}
export function readIgState(state: string, now = Date.now()): string | null {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return null;
  const want = crypto.createHmac("sha256", stateSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!p?.u || now - Number(p.t) > 15 * 60 * 1000) return null;
    return String(p.u);
  } catch { return null; }
}

/** What the creator / admin screens get. Pure. */
export function igStatus(row: any, conn: any = null) {
  const stats = row?.instagram_stats || null;
  const handle = cleanUsername(row?.instagram_handle || row?.instagram) || null;
  const same = Boolean(handle && stats?.username && handle === stats.username);
  return {
    handle,
    synced: Boolean(row?.instagram_synced_at && same && !stats?.error),
    synced_at: row?.instagram_synced_at || null,
    verified: Boolean(row?.instagram_verified_at && same),
    verified_at: row?.instagram_verified_at || null,
    method: row?.instagram_verify_method || null,
    stats: same && !stats?.error ? stats : null,
    last_error: stats?.error ? stats.error : null,
    oauth_connected: Boolean(conn?.access_token_enc),
  };
}

export const IG_METRIC_FIELDS = ["ig_followers", "instagram_followers", "followers_instagram", "follower_count", "avg_views_30d",
  "instagram_avg_reach", "average_reach", "avg_likes_30d", "instagram_avg_likes", "avg_comments_30d", "instagram_avg_comments"];

// ───────────────────────────── Meta calls ─────────────────────────────

type Fetch = typeof fetch;
// v373 (Ravi: bulk fetch ate the hourly limit, so sign-ups got "Instagram is busy"): Meta says how much of the hour is
// used in a response header; the background fetches (bulk + auto refresh) stop at 70 % and leave the rest for people.
export const metaUsage = { pct: 0, at: 0 };
export function usageFromHeaders(get: (k: string) => string | null | undefined): number | null {
  let best: number | null = null;
  for (const k of ["x-business-use-case-usage", "x-app-usage", "x-ad-account-usage"]) {
    const raw = get(k); if (!raw) continue;
    try {
      const j = JSON.parse(raw);
      const rows = k === "x-business-use-case-usage" ? Object.values(j).flat() as any[] : [j];
      for (const r of rows) for (const f of ["call_count", "total_cputime", "total_time"]) {
        const n = Number((r as any)?.[f]); if (Number.isFinite(n)) best = Math.max(best ?? 0, n);
      }
    } catch { /* not JSON */ }
  }
  return best;
}
async function getJson(f: Fetch, url: string, init?: any) {
  const r = await f(url, init);
  try { const u = usageFromHeaders((k) => (r as any)?.headers?.get?.(k)); if (u !== null) { metaUsage.pct = u; metaUsage.at = Date.now(); } } catch { /* headers optional */ }
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw j?.error ? j : { error: { message: `HTTP ${r.status}` } };
  return j;
}

export function lookupConfigured() { return Boolean(env("IG_GRAPH_TOKEN") && env("IG_BUSINESS_ID")); }
export function dmConfigured() { return lookupConfigured() && Boolean(env("IG_WEBHOOK_VERIFY_TOKEN") && env("META_APP_SECRET") && env("IG_DM_USERNAME")); }
export function oauthConfigured() { return Boolean(env("IG_APP_ID") && env("IG_APP_SECRET")); }

/** v366: the website on an Instagram profile → "https://…" (bare domains get https://), anything else → null. Pure. */
export function cleanWebsite(v: any): string | null {
  let t = String(v ?? "").trim();
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) { if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t)) return null; t = `https://${t}`; }
  try { const u = new URL(t); return /^https?:$/.test(u.protocol) ? u.toString().slice(0, 300) : null; } catch { return null; }
}
/** Business Discovery: the public numbers of any professional account, asked by Ybex's own account. */
// v354: + biography, and per post id / caption / permalink / thumbnail (portfolio picker). If Meta refuses one of the
// extra fields (#100 "nonexisting field"), the call is repeated once with the v349 field list, so numbers never break.
const BD_MEDIA_FULL = "id,caption,permalink,thumbnail_url,media_url,media_type,media_product_type,like_count,comments_count,view_count,timestamp";
const BD_MEDIA_SAFE = "media_type,media_product_type,like_count,comments_count,view_count,timestamp";
export async function fetchByUsername(username: string, f: Fetch = fetch) {
  // v366 (Ravi: brand step 1 should also fill the website): + website. If Meta refuses "website" only, ask again
  // without it (media fields kept); any other refused field → the safe v349 list as before.
  const ask = (mediaFields: string, bio: boolean, website = false) => {
    const fields = `business_discovery.username(${username}){username,name,${bio ? "biography," : ""}${website ? "website," : ""}profile_picture_url,followers_count,follows_count,media_count,media.limit(25){${mediaFields}}}`;
    return getJson(f, `https://graph.facebook.com/${GRAPH_VERSION()}/${encodeURIComponent(env("IG_BUSINESS_ID"))}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(env("IG_GRAPH_TOKEN"))}`);
  };
  let j: any;
  try { j = await ask(BD_MEDIA_FULL, true, true); }
  catch (e: any) {
    if (Number(e?.error?.code) !== 100) throw e;
    logIgnored("instagram:bd-fields", e);
    if (/website/i.test(String(e?.error?.message || ""))) {
      try { j = await ask(BD_MEDIA_FULL, true, false); }
      catch (e2: any) { if (Number(e2?.error?.code) !== 100) throw e2; j = await ask(BD_MEDIA_SAFE, false); }
    } else {
      j = await ask(BD_MEDIA_SAFE, false);
    }
  }
  const bd = j?.business_discovery;
  if (!bd) throw { error: { message: "Cannot find User", error_subcode: 2207013 } };
  return statsFromInstagram(bd, bd.media?.data || [], { source: "business_discovery" });
}

/** Instagram Login token → profile + media + 28-day reach / views. */
export async function fetchWithUserToken(token: string, f: Fetch = fetch) {
  const base = `https://graph.instagram.com/${GRAPH_VERSION()}`;
  const me = await getJson(f, `${base}/me?fields=user_id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count&access_token=${encodeURIComponent(token)}`);
  let media: any[] = [];
  try { media = (await getJson(f, `${base}/me/media?fields=id,caption,permalink,thumbnail_url,media_url,media_type,media_product_type,like_count,comments_count,timestamp&limit=25&access_token=${encodeURIComponent(token)}`))?.data || []; } catch (e: any) { logIgnored("instagram:media", e); }
  const extra: any = { source: "instagram_login" };
  try {
    const until = Math.floor(Date.now() / 1000), since = until - 28 * 86400;
    const ins = await getJson(f, `${base}/me/insights?metric=reach,views&period=day&metric_type=total_value&since=${since}&until=${until}&access_token=${encodeURIComponent(token)}`);
    for (const m of ins?.data || []) {
      const v = Number(m?.total_value?.value);
      if (m?.name === "reach" && Number.isFinite(v)) extra.reach_28d = v;
      if (m?.name === "views" && Number.isFinite(v)) extra.views_28d = v;
    }
  } catch (e: any) { logIgnored("instagram:insights", e); }
  return { stats: statsFromInstagram(me, media, extra), igUserId: String(me?.user_id || me?.id || "") };
}

// v352 (Ravi: "jaha jaha username daalte hain wahan Fetch lagao" — apply form, onboarding, settings, admin).
/** Sliding-window limiter: true when one more call fits (and records it). Pure apart from the map it is given. */
export function takeSlot(map: Map<string, number[]>, key: string, limit: number, now = Date.now(), windowMs = 3600000): boolean {
  const list = (map.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= limit) { map.set(key, list); return false; }
  list.push(now); map.set(key, list);
  return true;
}
/** Only the numbers a form needs (no picture URL kept anywhere — Instagram's links expire). Pure. */
/** v409: followers we can trust for a yes/no — missing → null; "0" while reels get 200+ views is Meta not giving the
 *  number (hidden / not returned) → null too. null = "couldn't read", the sign-up lets them through. Pure. */
export function trustedFollowers(stats: any): number | null {
  const f = stats?.followers;
  if (f === null || f === undefined || f === "" || !Number.isFinite(Number(f))) return null;
  const n = Math.max(0, Math.round(Number(f)));
  if (n === 0 && (Number(stats?.avg_views) || 0) >= 200) return null;
  return n;
}

/** v410 (Ravi: "bina fetch ke aage badha toh account ban jaata hai — phir kuch der baad auto fetch hona chahiye"): a new
 *  creator account with an Instagram username asks for its numbers a few seconds later (sign-up routes call this). */
let refreshKick: ((userId: string) => Promise<any>) | null = null;
export function kickInstagramRefresh(userId: string, delayMs = 4000) {
  if (!refreshKick || !userId) return;
  const t: any = setTimeout(() => { refreshKick?.(String(userId)).catch(() => {}); }, delayMs);
  t?.unref?.();
}

export function previewFields(stats: any) {
  return {
    username: stats?.username || null, name: stats?.name || null,
    followers: trustedFollowers(stats), avg_views: stats?.avg_views ?? null, avg_likes: stats?.avg_likes ?? null,
    avg_comments: stats?.avg_comments ?? null, engagement_rate: stats?.engagement_rate ?? null,
    media_count: stats?.media_count ?? null, fetched_at: stats?.fetched_at || null,
    bio_email: stats?.bio_email || null, // v354
    bio: stats?.biography || null, // v363 (brand step 1: "We'll fill in the rest")
    website: stats?.website || null, // v366
  };
}

/** v366: what "Disconnect Instagram" clears on creator_profiles — only Instagram fields. */
export const IG_DISCONNECT_PATCH = {
  instagram_handle: null, instagram: null, instagram_stats: null, instagram_synced_at: null,
  instagram_verified_at: null, instagram_verify_method: null,
  ig_followers: null, followers_instagram: null, follower_count: null,
  avg_views_30d: null, avg_likes_30d: null, avg_comments_30d: null, engagement_rate: null,
};

// ───────────────────────────── routes ─────────────────────────────

type Deps = {
  supabase: any; privilegedSupabase: any; getDb: () => any;
  parseAuthUser: (req: express.Request) => Promise<any>;
  sendNotification?: (db: any, userId: any, type: any, message: any) => Promise<any>;
  logAdminAction?: (user: any, action: string, type: string, id: string, detail: any) => Promise<any>;
  fetchImpl?: Fetch;
};

const isAdmin = (u: any) => u && (u.role === "admin" || u.role === "sub_admin" || u.team_role === "sub_admin");
const appUrl = () => (env("APP_URL") || env("SITE_URL") || "https://ybexapp.ai.studio").replace(/\/+$/, "");
const redirectUri = () => `${appUrl()}/api/instagram/oauth/callback`;

export function setupInstagramRoutes(router: express.Router, deps: Deps) {
  const db = () => deps.privilegedSupabase || deps.supabase;
  const f: Fetch = deps.fetchImpl || fetch;
  const recent = new Map<string, number[]>(); // per-user lookup throttle (10 / hour)

  const loadRow = async (userId: string) => {
    const { data } = await db().from("creator_profiles").select("user_id, name, instagram, instagram_handle, instagram_stats, instagram_synced_at, instagram_verified_at, instagram_verify_method, photo, picture, avatar_url").eq("user_id", userId).maybeSingle();
    return data || null;
  };
  const loadConn = async (userId: string) => {
    try { const { data } = await db().from("instagram_connections").select("*").eq("user_id", userId).maybeSingle(); return data || null; } catch { return null; }
  };
  /** Another creator already VERIFIED this Instagram → refuse (one account per Instagram). */
  const takenByOther = async (username: string, userId: string) => {
    const { data } = await db().from("creator_profiles").select("user_id").ilike("instagram_handle", String(username).replace(/[\\%_]/g, (m: string) => "\\" + m)).not("instagram_verified_at", "is", null).neq("user_id", userId).limit(1);
    return Array.isArray(data) && data.length > 0;
  };
  // ── v354: one cache + one Meta budget for every Business Discovery call (preview, lookup, daily refresh, bulk) ──
  const budget = makeBudget(180);
  // v373: calls the background (bulk fetch, auto refresh) must leave for sign-ups / onboarding each hour
  const BG_KEEP = Math.max(0, Number(process.env.IG_SIGNUP_RESERVE) || 80);
  const bgWaitMs = () => {
    const metaBusy = metaUsage.pct >= 70 && Date.now() - metaUsage.at < 20 * 60 * 1000 ? 15 * 60 * 1000 : 0;
    return Math.max(budget.waitMs(Date.now(), BG_KEEP), metaBusy);
  };
  const statsCache = new Map<string, { at: number; stats: any }>();
  const CACHE_MS = 6 * 3600 * 1000;
  const statsFor = async (username: string): Promise<any> => {
    const hit = statsCache.get(username);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.stats;
    if (!budget.take()) throw { error: { code: 4, message: "Ybex hourly Instagram budget used up" } }; // → RATE_LIMIT
    const stats = await fetchByUsername(username, f);
    statsCache.set(username, { at: Date.now(), stats });
    if (statsCache.size > 3000) statsCache.delete(statsCache.keys().next().value as string);
    return stats;
  };
  // v402: the Join screen / sign-up guard reads followers through the same cache + hourly Meta budget.
  setSignupFollowerLookup(lookupConfigured() ? async (u: string) => {
    const st = await statsFor(u);
    return trustedFollowers(st); // v409: Number(null) was 0 → a missing count blocked the sign-up
  } : null);
  const storage = () => deps.privilegedSupabase || deps.supabase;
  const photoCopies = new Map<string, { at: number; url: string }>();
  /** Our own copy of the Instagram picture (avatars/ig/<username>), made at most once per 6 h per username. */
  const igPhotoUrl = async (username: string, stats: any): Promise<string | null> => {
    const hit = photoCopies.get(username);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.url;
    const url = await copyIgPhoto(storage(), username, stats?.profile_picture_url, f);
    if (url) { photoCopies.set(username, { at: Date.now(), url }); if (photoCopies.size > 3000) photoCopies.delete(photoCopies.keys().next().value as string); }
    return url;
  };
  /** Instagram picture for a profile — only when it has no photo, a Google/placeholder one, or our older Instagram copy
   *  (refreshed at most weekly). A photo the creator uploaded is never replaced. */
  const profilePhotoFor = async (row: any, stats: any): Promise<string | null> => {
    const current = row?.photo || row?.picture || row?.avatar_url || "";
    if (!photoIsReplaceable(current) || !stats?.username) return null;
    const photoAt = Date.parse(String(row?.instagram_stats?.photo_at || ""));
    if (isIgPhoto(current) && Number.isFinite(photoAt) && Date.now() - photoAt < 7 * DAY) return null;
    return igPhotoUrl(stats.username, stats);
  };
  const syncUserPicture = async (userId: string, url: string) => {
    try {
      const { data: u } = await db().from("users").select("picture").eq("user_id", userId).maybeSingle();
      if (u && photoIsReplaceable(u.picture)) await db().from("users").update({ picture: url }).eq("user_id", userId);
    } catch (e: any) { logIgnored("instagram:user-picture", e); }
  };
  /** Numbers + reels (+ the Instagram photo when allowed) → creator_profiles. */
  const saveStats = async (userId: string, stats: any, verify: string | null, extra: any = {}, rowIn: any = undefined) => {
    const row = rowIn === undefined ? await loadRow(userId) : rowIn;
    const nowIso = new Date().toISOString();
    const photo = await profilePhotoFor(row, stats);
    const kept = { ...stats, photo_at: photo ? nowIso : (row?.instagram_stats?.photo_at || null) };
    const patch: any = { ...profilePatchFromStats(kept, nowIso), ...extra };
    if (photo) { patch.photo = photo; patch.picture = photo; patch.avatar_url = photo; }
    if (verify) { patch.instagram_verified_at = nowIso; patch.instagram_verify_method = verify; }
    const { error } = await db().from("creator_profiles").update(patch).eq("user_id", userId);
    if (error) throw error;
    if (photo) await syncUserPicture(userId, photo);
    return { patch, row, photo };
  };

  // v352: is "Fetch" switched on? (forms hide the button when not) — public, no Meta call.
  router.get("/instagram/config", (_req, res) => res.json({ lookup: lookupConfigured() }));

  // v352: username → numbers WITHOUT saving (apply form, onboarding, admin edit forms). The form fills its own
  // fields and saves them the normal way. Login optional. Meta allows ~200 calls / hour for Ybex's account, so:
  // 6-hour cache per username, 6 / hour per visitor (IP) when logged out, 15 / hour per user, 60 / hour for admins,
  // and at most 80 non-admin previews an hour in total (leaves room for the daily refresh + settings fetches).
  const previewCache = new Map<string, { at: number; stats: any }>();
  const previewHits = new Map<string, number[]>();
  router.post("/instagram/preview", async (req, res) => {
    const username = cleanUsername(req.body?.username);
    if (!username) return res.status(400).json({ error: "Enter the Instagram username, like @yourname." });
    if (!lookupConfigured()) return res.status(503).json({ code: "NOT_CONFIGURED", error: "Instagram fetch isn't switched on yet. Enter the numbers by hand for now." });
    const now = Date.now();
    const hit = previewCache.get(username);
    let user: any = null;
    try { user = await deps.parseAuthUser(req); } catch { user = null; }
    const admin = isAdmin(user);
    // v354: + our copy of the Instagram photo (forms use it when no photo was uploaded) and, for a logged-in
    // person, the last posts (onboarding portfolio picker). Cached answers cost no Meta call.
    const answer = async (raw: any) => {
      const out: any = { ok: true, stats: previewFields(raw) };
      out.stats.photo_url = await igPhotoUrl(username, raw).catch(() => null);
      if (user?.user_id) out.media = raw?.media || [];
      return out;
    };
    if (hit && now - hit.at < 6 * 3600000) return res.json({ cached: true, ...(await answer(hit.stats)) });
    const key = user?.user_id ? `u:${user.user_id}` : `ip:${clientIp(req)}`;
    if (!takeSlot(previewHits, key, admin ? 60 : user ? 15 : 20, now)) return res.status(429).json({ code: "RATE_LIMIT", error: "Too many tries. Try again in an hour, or type the numbers by hand." });
    if (!admin && !takeSlot(previewHits, "all", 80, now)) return res.status(429).json({ code: "RATE_LIMIT", error: "Instagram is busy right now. Type the numbers by hand, they'll update by themselves later." });
    try {
      const raw = await statsFor(username);
      previewCache.set(username, { at: now, stats: raw });
      if (previewCache.size > 2000) previewCache.delete(previewCache.keys().next().value as string);
      return res.json(await answer(raw));
    } catch (e: any) {
      if (e?.error) { const g = graphError(e); return res.status(g.code === "NOT_PROFESSIONAL" ? 404 : 502).json(g); }
      console.error("[instagram preview]", e?.message || e);
      return res.status(500).json({ error: "Couldn't fetch. Try again." });
    }
  });

  const openRefreshAt = new Map<string, number>(); // v372: refresh-on-open, once per 30 min per creator
  router.get("/creator/instagram", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user || user.role !== "creator") return res.status(403).json({ error: "Creators only" });
    if (!db()) return res.json({ status: igStatus(null), configured: { lookup: false, dm: false, oauth: false } });
    let [row, conn] = await Promise.all([loadRow(user.user_id), loadConn(user.user_id)]);
    // v372 (Ravi's video: "Synced 2 days ago · refreshes daily"): the hourly job below is a timer, and Cloud Run pauses
    // the server's CPU between requests, so it hardly ever ran. Now opening Social platforms refreshes numbers older than
    // a day inside this request (max ~6 s, once per 30 min per creator, only while the shared Meta budget has room).
    try {
      const synced = Date.parse(String(row?.instagram_synced_at || ""));
      const last = openRefreshAt.get(user.user_id) || 0;
      // v410: a profile that was NEVER fetched (sign-up went on while Instagram couldn't be read) is fetched on open too
      if ((!Number.isFinite(synced) || Date.now() - synced > 20 * 3600 * 1000) && Date.now() - last > 30 * 60 * 1000
        && !row?.instagram_stats?.error && (lookupConfigured() || conn?.access_token_enc) && budget.left() > 20) {
        openRefreshAt.set(user.user_id, Date.now());
        if (openRefreshAt.size > 5000) openRefreshAt.delete(openRefreshAt.keys().next().value as string);
        const r: any = await Promise.race([refreshOne(user.user_id), new Promise((ok) => setTimeout(() => ok({ ok: false, timeout: true }), 6000))]);
        if (r?.ok) row = await loadRow(user.user_id);
      }
    } catch (e: any) { logIgnored("instagram:open-refresh", e); }
    return res.json({
      status: igStatus(row, conn),
      configured: { lookup: lookupConfigured(), dm: dmConfigured(), oauth: oauthConfigured() },
      dm_username: env("IG_DM_USERNAME").replace(/^@/, "") || null,
    });
  });

  // 1. Username → numbers (saved straight away; "Verified" needs 2 or 3).
  router.post("/creator/instagram/lookup", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user || user.role !== "creator") return res.status(403).json({ error: "Creators only" });
    const username = cleanUsername(req.body?.username);
    if (!username) return res.status(400).json({ error: "Enter your Instagram username, like @yourname." });
    if (!lookupConfigured() || !db()) return res.status(503).json({ code: "NOT_CONFIGURED", error: "Instagram fetch isn't switched on yet. Enter your numbers by hand for now." });
    const now = Date.now();
    const list = (recent.get(user.user_id) || []).filter((t) => now - t < 3600000);
    if (list.length >= 10) return res.status(429).json({ error: "Too many tries. Try again in an hour." });
    recent.set(user.user_id, [...list, now]);
    try {
      if (await takenByOther(username, user.user_id)) return res.status(409).json({ code: "TAKEN", error: "This Instagram is already verified by another Ybex account. Write to support if it's yours." });
      const stats = await statsFor(username); // v354: shared 6 h cache (a preview a minute ago costs nothing)
      const row = await loadRow(user.user_id);
      const keepVerified = row?.instagram_verified_at && cleanUsername(row?.instagram_handle) === username;
      const extra: any = keepVerified ? {} : { instagram_verified_at: null, instagram_verify_method: null };
      const { patch, photo } = await saveStats(user.user_id, stats, null, extra, row);
      const meta_events = await qualifyCreatorAll({ user, followers: stats?.followers, req }); // v395/v418: empty unless this is the first time a new creator has 1,000+ / 10,000+
      return res.json({ ok: true, status: igStatus({ ...row, ...patch }), photo_url: photo || null, media: stats?.media || [], ...(meta_events.length ? { meta_event: meta_events[0], meta_events } : {}) });
    } catch (e: any) {
      if (e?.error) { const g = graphError(e); return res.status(g.code === "NOT_PROFESSIONAL" ? 404 : 502).json(g); }
      console.error("[instagram lookup]", e?.message || e);
      return res.status(500).json({ error: "Couldn't save. Try again." });
    }
  });

  // v363 (portfolio design 1d / 1g / 1e): the creator's own reels for the "Select" tab, a pasted link's cover + numbers,
  // and our own copy of each picked cover (Instagram's links expire, which is why previews were blank).
  const coverCopies = new Map<string, number>();
  router.post("/creator/portfolio/ig-media", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user || user.role !== "creator") return res.status(403).json({ error: "Creators only" });
    const row = db() ? await loadRow(user.user_id) : null;
    const handle = cleanUsername(row?.instagram_handle || row?.instagram || req.body?.username);
    if (!handle) return res.status(400).json({ code: "NO_HANDLE", error: "Add your Instagram username first." });
    if (!lookupConfigured()) return res.json({ handle, media: Array.isArray(row?.instagram_stats?.media) ? row.instagram_stats.media : [], cached: true });
    try {
      const stats = await statsFor(handle);
      return res.json({ handle, media: stats?.media || [] });
    } catch (e: any) {
      const saved = Array.isArray(row?.instagram_stats?.media) ? row.instagram_stats.media : [];
      if (saved.length) return res.json({ handle, media: saved, cached: true });
      if (e?.error) { const g = graphError(e); return res.status(g.code === "NOT_PROFESSIONAL" ? 404 : 502).json(g); }
      return res.status(502).json({ error: "Couldn't load your Instagram posts. Paste a link instead." });
    }
  });
  router.post("/creator/portfolio/link-preview", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user || user.role !== "creator") return res.status(403).json({ error: "Creators only" });
    const code = igShortcode(req.body?.url);
    if (!code) return res.json({ found: false });
    const row = db() ? await loadRow(user.user_id) : null;
    const handle = cleanUsername(row?.instagram_handle || row?.instagram);
    let media: any[] = Array.isArray(row?.instagram_stats?.media) ? row.instagram_stats.media : [];
    let hit = media.find((m: any) => igShortcode(m?.permalink) === code);
    if (!hit && handle && lookupConfigured()) {
      try { media = (await statsFor(handle))?.media || []; hit = media.find((m: any) => igShortcode(m?.permalink) === code); } catch (e: any) { logIgnored("instagram:link-preview", e); }
    }
    if (!hit) return res.json({ found: false });
    const cover = hit.thumb ? await copyPortfolioCover(storage(), user.user_id, `ig_${hit.id || code}`, hit.thumb, f) : null;
    return res.json({ found: true, item: { ...hit, cover } });
  });
  router.post("/creator/portfolio/covers", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user || user.role !== "creator") return res.status(403).json({ error: "Creators only" });
    const items = (Array.isArray(req.body?.items) ? req.body.items : []).slice(0, 12);
    const now = Date.now();
    const used = (coverCopies.get(user.user_id) || 0);
    if (used > 120) return res.status(429).json({ error: "Too many covers at once. Try again later." });
    coverCopies.set(user.user_id, used + items.length);
    if (coverCopies.size > 5000) coverCopies.clear();
    const out: Record<string, string | null> = {};
    await Promise.all(items.map(async (it: any) => {
      const id = String(it?.id || "").slice(0, 80);
      if (!id) return;
      out[id] = await copyPortfolioCover(storage(), user.user_id, id, String(it?.url || ""), f);
    }));
    void now;
    return res.json({ covers: out });
  });

  // 2a. DM code for "send this to @ybex".
  router.post("/creator/instagram/dm-code", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user || user.role !== "creator") return res.status(403).json({ error: "Creators only" });
    if (!dmConfigured()) return res.status(503).json({ code: "NOT_CONFIGURED", error: "DM verification isn't switched on yet." });
    const prevKey = `igdm:user:${user.user_id}`;
    const prev = await ephemeralGet(prevKey);
    if (prev?.code) await ephemeralDelete(`igdm:code:${prev.code}`);
    const code = makeDmCode();
    const value = { user_id: user.user_id, username: cleanUsername(req.body?.username) };
    await ephemeralSet(`igdm:code:${code}`, value, 30 * 60 * 1000);
    await ephemeralSet(prevKey, { code }, 30 * 60 * 1000);
    const dmTo = env("IG_DM_USERNAME").replace(/^@/, "");
    return res.json({ code, dm_to: dmTo, dm_link: `https://ig.me/m/${encodeURIComponent(dmTo)}`, expires_in_min: 30 });
  });

  // 2b. Meta webhook — verify (GET) and DMs (POST, raw body checked in server.ts).
  router.get("/webhooks/instagram", (req, res) => {
    const q: any = req.query || {};
    if (q["hub.mode"] === "subscribe" && env("IG_WEBHOOK_VERIFY_TOKEN") && q["hub.verify_token"] === env("IG_WEBHOOK_VERIFY_TOKEN")) {
      return res.status(200).send(String(q["hub.challenge"] || ""));
    }
    return res.sendStatus(403);
  });
  router.post("/webhooks/instagram", async (req: any, res) => {
    if (!validMetaSignature(req.rawBody || Buffer.from(""), req.get("x-hub-signature-256"), env("META_APP_SECRET"))) return res.sendStatus(403);
    res.sendStatus(200); // Meta wants an answer within 5 s; the work continues below
    try {
      for (const entry of req.body?.entry || []) {
        for (const ev of entry?.messaging || []) {
          if (ev?.message?.is_echo || !ev?.sender?.id) continue;
          const code = extractDmCode(ev?.message?.text);
          if (code) await handleDmCode(String(ev.sender.id), code);
        }
      }
    } catch (e: any) { console.warn("[instagram webhook]", e?.message || e); }
  });

  const msgToken = () => env("IG_MESSAGING_TOKEN") || env("IG_GRAPH_TOKEN");
  const reply = async (igsid: string, text: string) => {
    try {
      await f(`https://graph.facebook.com/${GRAPH_VERSION()}/me/messages?access_token=${encodeURIComponent(msgToken())}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: igsid }, message: { text } }),
      });
    } catch (e: any) { logIgnored("instagram:reply", e); }
  };
  async function handleDmCode(igsid: string, code: string) {
    const rec = await ephemeralGet(`igdm:code:${code}`);
    if (!rec?.user_id) return reply(igsid, "This Ybex code has expired or is wrong. Get a new one in the Ybex app → Profile → Social platforms.");
    let sender: any = null;
    try { sender = await getJson(f, `https://graph.facebook.com/${GRAPH_VERSION()}/${encodeURIComponent(igsid)}?fields=username,name&access_token=${encodeURIComponent(msgToken())}`); } catch (e: any) { logIgnored("instagram:sender", e); }
    const username = cleanUsername(sender?.username);
    if (!username) return reply(igsid, "We couldn't read your username. Please try again in a minute.");
    if (await takenByOther(username, rec.user_id)) return reply(igsid, `@${username} is already verified on another Ybex account. Write to Ybex support if it's yours.`);
    await ephemeralDelete(`igdm:code:${code}`);
    let stats: any = null;
    try { stats = await statsFor(username); } catch (e: any) { logIgnored("instagram:dm-fetch", e); }
    const nowIso = new Date().toISOString();
    if (stats) await saveStats(rec.user_id, stats, "dm");
    else {
      // personal account: ownership is proven, numbers stay as entered until they switch to Creator
      await db().from("creator_profiles").update({ instagram_handle: username, instagram: username, instagram_verified_at: nowIso, instagram_verify_method: "dm",
        instagram_stats: { username, error: "not_professional", checked_at: nowIso }, instagram_synced_at: nowIso }).eq("user_id", rec.user_id);
    }
    await reply(igsid, stats ? `✅ Verified! @${username} is now linked to your Ybex profile. Your numbers update by themselves every day.` : `✅ @${username} is verified on Ybex. Switch to a Creator account (Instagram → Settings → Account type) so your numbers update by themselves.`);
    try { await deps.sendNotification?.(null, rec.user_id, "instagram_verified", `Instagram @${username} verified ✅`); } catch (e: any) { logIgnored("instagram:notify", e); }
  }

  // 3. Instagram Login.
  router.get("/creator/instagram/oauth-url", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user || user.role !== "creator") return res.status(403).json({ error: "Creators only" });
    if (!oauthConfigured()) return res.status(503).json({ code: "NOT_CONFIGURED", error: "Instagram login isn't switched on yet." });
    const q = new URLSearchParams({
      enable_fb_login: "0", force_authentication: "1", client_id: env("IG_APP_ID"), redirect_uri: redirectUri(),
      response_type: "code", scope: "instagram_business_basic,instagram_business_manage_insights", state: makeIgState(String(user.user_id)),
    });
    return res.json({ url: `https://www.instagram.com/oauth/authorize?${q.toString()}` });
  });
  router.get("/instagram/oauth/callback", async (req, res) => {
    const back = (r: string) => res.redirect(`${appUrl()}/profile?ig=${encodeURIComponent(r)}`);
    const userId = readIgState(String(req.query?.state || ""));
    const code = String(req.query?.code || "").replace(/#_$/, "");
    if (!userId) return back("expired");
    if (!code) return back(String(req.query?.error_reason || "cancelled").slice(0, 40));
    try {
      const form = new URLSearchParams({ client_id: env("IG_APP_ID"), client_secret: env("IG_APP_SECRET"), grant_type: "authorization_code", redirect_uri: redirectUri(), code });
      const short = await getJson(f, "https://api.instagram.com/oauth/access_token", { method: "POST", body: form, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      const long = await getJson(f, `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(env("IG_APP_SECRET"))}&access_token=${encodeURIComponent(short.access_token)}`);
      const { stats, igUserId } = await fetchWithUserToken(long.access_token, f);
      if (!stats.username) return back("failed");
      if (await takenByOther(stats.username, userId)) return back("taken");
      await saveStats(userId, stats, "oauth");
      const nowIso = new Date().toISOString();
      await db().from("instagram_connections").upsert({
        user_id: userId, ig_user_id: igUserId || null, username: stats.username, method: "oauth",
        access_token_enc: sealToken(long.access_token), token_expires_at: new Date(Date.now() + (Number(long.expires_in) || 60 * 86400) * 1000).toISOString(),
        updated_at: nowIso,
      });
      return back("connected");
    } catch (e: any) {
      console.warn("[instagram oauth]", e?.error?.message || e?.message || e);
      return back("failed");
    }
  });

  router.post("/creator/instagram/disconnect", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user || user.role !== "creator") return res.status(403).json({ error: "Creators only" });
    if (!db()) return res.status(503).json({ error: "No database." });
    // v366 (Ravi: "disconnect pe handle aur purane numbers reh jaate hain"): the Instagram link goes completely —
    // username, fetched numbers, sync and verification. Nothing else on the profile is touched.
    const { error: connErr } = await db().from("instagram_connections").delete().eq("user_id", user.user_id);
    if (connErr) logIgnored("instagram:disconnect-conn", connErr);
    const { error } = await db().from("creator_profiles").update(IG_DISCONNECT_PATCH).eq("user_id", user.user_id);
    if (error) return res.status(500).json({ error: "Couldn't disconnect. Try again." });
    return res.json({ ok: true });
  });

  // Admin: refresh one creator now (Admin → Users → creator).
  router.post("/admin/creators/:id/instagram-refresh", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ error: "Admin only" });
    const id = String(req.params.id || "");
    const r = await refreshOne(id);
    try { await deps.logAdminAction?.(user, "instagram_refresh", "creator_profile", id, { ok: r.ok }); } catch (e: any) { logIgnored("instagram:log", e); }
    return r.ok ? res.json(r) : res.status(r.status || 502).json(r);
  });

  refreshKick = (id: string) => (bgWaitMs() ? Promise.resolve(null) : refreshOne(id)); // v410: right after sign-up
  async function refreshOne(userId: string): Promise<any> {
    if (!db()) return { ok: false, status: 503, error: "No database." };
    const [row, conn] = await Promise.all([loadRow(userId), loadConn(userId)]);
    const handle = cleanUsername(row?.instagram_handle || row?.instagram);
    if (!handle) return { ok: false, status: 400, error: "This creator has no Instagram username." };
    try {
      let token = conn?.access_token_enc ? openToken(conn.access_token_enc) : null;
      if (token && conn?.token_expires_at && Date.parse(conn.token_expires_at) - Date.now() < 10 * DAY) {
        try {
          const r = await getJson(f, `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
          token = r.access_token;
          await db().from("instagram_connections").update({ access_token_enc: sealToken(token!), token_expires_at: new Date(Date.now() + (Number(r.expires_in) || 60 * 86400) * 1000).toISOString(), updated_at: new Date().toISOString() }).eq("user_id", userId);
        } catch (e: any) { logIgnored("instagram:token-refresh", e); }
      }
      let stats: any = null;
      if (token && conn?.username === handle) {
        try { stats = (await fetchWithUserToken(token, f)).stats; } catch (e: any) { logIgnored("instagram:oauth-refresh", e); }
      }
      if (!stats && lookupConfigured()) stats = await statsFor(handle);
      if (!stats) return { ok: false, status: 503, error: "Instagram fetch isn't switched on yet." };
      await saveStats(userId, stats, null, {}, row);
      // v395: a creator who signed up with a smaller number and grew (or whose numbers arrived late) is still counted — server side only
      void qualifyCreatorAll({ /* v418: 1K + 10K */ user: { user_id: userId, role: "creator" }, followers: stats?.followers, getUser: async () => (await db().from("users").select("user_id, email, phone, role, created_at").eq("user_id", userId).maybeSingle()).data });
      return { ok: true, stats };
    } catch (e: any) {
      const g = graphError(e);
      if (g.code === "NOT_PROFESSIONAL") {
        const nowIso = new Date().toISOString();
        await db().from("creator_profiles").update({ instagram_stats: { username: handle, error: "not_professional", checked_at: nowIso }, instagram_synced_at: nowIso }).eq("user_id", userId);
      }
      return { ok: false, status: g.code === "NOT_PROFESSIONAL" ? 404 : 502, ...g };
    }
  }

  // v354: smart refresh (Ravi: "jo daily active hain unka daily, jo bhool gaye unka 3–5 din / 10 din baad").
  // Every hour: profiles whose numbers are due — used the app in the last day → daily; 1–7 days ago → every 3 days;
  // longer / never logged in (unclaimed) → every 10 days. Max 60 an hour, inside the shared Meta budget.
  const lastActiveFor = async (ids: string[]): Promise<Map<string, number>> => {
    const sessions: any[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      try {
        const { data } = await db().from("user_sessions").select("user_id, expires_at").in("user_id", ids.slice(i, i + 200));
        if (Array.isArray(data)) sessions.push(...data);
      } catch (e: any) { logIgnored("instagram:sessions", e); }
    }
    return lastActiveByUser(sessions, SESSION_MS);
  };
  const dueProfiles = async (limit: number): Promise<string[]> => {
    const { data } = await db().from("creator_profiles").select("user_id, instagram_handle, instagram_synced_at")
      .not("instagram_handle", "is", null).neq("instagram_handle", "").not("is_deleted", "is", true).limit(2000);
    const rows = (data || []).filter((r: any) => cleanUsername(r.instagram_handle));
    const active = await lastActiveFor(rows.map((r: any) => String(r.user_id)));
    return pickAutoRefresh(rows, active, limit); // v419: active creators only, oldest fetch first
  };
  // v419: at most AUTO_REFRESH_PER_DAY automatic refreshes a day (India date), shared by every server copy.
  const autoKey = () => `ig:auto:${new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)}`;
  const autoLeftToday = async () => { try { const v = await ephemeralGet(autoKey()); return Math.max(0, AUTO_REFRESH_PER_DAY - (Number(v?.n) || 0)); } catch { return 0; } };
  const autoCount = async () => { try { const v = await ephemeralGet(autoKey()); await ephemeralSet(autoKey(), { n: (Number(v?.n) || 0) + 1 }, 2 * 24 * 3600e3); } catch (e: any) { logIgnored("instagram:auto-count", e); } };
  /** v419: one round of the automatic refresh (hourly timer / cron): today's left-over share, active creators only. */
  const runActiveRefresh = async (maxMs: number) => {
    const started = Date.now(); let done = 0;
    const left = await autoLeftToday();
    if (!left) return { done, left: 0 };
    for (const id of await dueProfiles(left)) {
      if (Date.now() - started > maxMs || bgWaitMs()) break; // keep room for people signing up right now
      await refreshOne(id); await autoCount(); done += 1;
      await new Promise((ok) => setTimeout(ok, 1500));
    }
    return { done, left: Math.max(0, left - done) };
  };
  if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
    let running = false;
    const run = async () => {
      if (running || !db() || (!lookupConfigured() && !oauthConfigured())) return;
      running = true;
      try {
        await runActiveRefresh(10 * 60 * 1000); // v419: active creators only, 50 a day
      } catch (e: any) { console.warn("[instagram] smart refresh:", e?.message || e); } finally { running = false; }
    };
    const first: any = setTimeout(run, 3 * 60 * 1000); first.unref?.();
    const every: any = setInterval(run, 60 * 60 * 1000); every.unref?.();
  }

  // Guard in front of the (locked) POST /creators/profile: numbers that come from Instagram can't be typed over.
  // Changing the Instagram username drops the old sync / verification.
  // v378 (QA M11): the same guard now also covers PATCH /creators/me (the phone's profile save went around it).
  // v378 (QA M10): "onboarding complete" is accepted only when the profile has an Instagram username (sent now or saved).
  const profileGuard = async (req: any, _res: any, next: any) => {
    try {
      const user = await deps.parseAuthUser(req);
      if (!user || user.role !== "creator" || !db() || !req.body || typeof req.body !== "object") return next();
      // v378 (QA L9): basic checks on creator profile fields (empty name, 10,000-character bio, negative rates).
      const b0 = req.body;
      if (b0.name !== undefined && !String(b0.name || "").trim()) return _res.status(400).json({ detail: "Name can't be empty." });
      for (const [k, max] of [["name", 80], ["bio", 1500], ["city", 80], ["state", 80], ["category", 80], ["primary_niche", 80]] as const) {
        if (b0[k] !== undefined && b0[k] !== null && String(b0[k]).length > max) return _res.status(400).json({ detail: `${k.replace(/_/g, " ")} is too long (max ${max} characters).` });
      }
      for (const k of ["rate_reel", "rate_story", "rate_yt_video", "ig_followers", "instagram_followers", "followers_instagram", "follower_count", "youtube_subscribers", "followers_youtube", "avg_views_30d", "average_reach"]) {
        if (b0[k] !== undefined && b0[k] !== null && b0[k] !== "" && (!Number.isFinite(Number(b0[k])) || Number(b0[k]) < 0)) return _res.status(400).json({ detail: "Numbers (rates, followers, reach) can't be negative." });
      }
      const row = await loadRow(user.user_id);
      const wantsComplete = req.body.onboarding_complete === true || req.body.onboarding_completed === true;
      if (wantsComplete) {
        const ig = cleanUsername(req.body.instagram ?? req.body.instagram_handle ?? row?.instagram_handle ?? row?.instagram ?? "");
        const yt = String(req.body.youtube ?? req.body.youtube_channel ?? req.body.youtube_handle ?? "").trim();
        if (!ig && !yt) { delete req.body.onboarding_complete; delete req.body.onboarding_completed; }
      }
      if (!row?.instagram_synced_at) return next();
      const statsUser = row?.instagram_stats?.username || cleanUsername(row?.instagram_handle);
      const sent = req.body.instagram ?? req.body.instagram_handle;
      const sentClean = sent === undefined ? undefined : cleanUsername(sent);
      if (sent !== undefined && sentClean !== statsUser) {
        await db().from("creator_profiles").update({ instagram_synced_at: null, instagram_verified_at: null, instagram_verify_method: null, instagram_stats: null }).eq("user_id", user.user_id);
        await db().from("instagram_connections").delete().eq("user_id", user.user_id);
        return next();
      }
      if (!row?.instagram_stats?.error) for (const k of IG_METRIC_FIELDS) delete req.body[k];
    } catch (e: any) { logIgnored("instagram:profile-guard", e); }
    return next();
  };
  router.post("/creators/profile", profileGuard);
  router.patch("/creators/me", profileGuard);

  // v354: Admin → "Fetch Instagram for everyone" — every creator profile (claimed + unclaimed) and every pending
  // waitlist application with a username: numbers + the Instagram photo where none was uploaded.
  // v363 (Ravi: "waitlist mai fetch hi nahi kar raha"): the v354 job ran in the background after the reply, but the
  // hosting (Cloud Run) pauses the server's CPU between requests and restarts copies, so the job stalled after a few
  // creators and the waitlist (done last) never got fetched. Now the admin screen drives it: each
  // POST /admin/creators/instagram-bulk/step fetches the next few inside that request and says what's left. Nothing is
  // kept in server memory, so it works on any server copy. Waitlist goes first; results go to the waitlist's own
  // ig_followers / instagram_stats / instagram_synced_at / instagram_fetch_error (the form's numbers stay as typed).
  const WL_STATS_KEYS = ["username", "name", "followers", "follows", "media_count", "avg_likes", "avg_comments", "avg_views", "engagement_rate", "posts_checked", "source", "fetched_at", "bio_email"];
  const compactStats = (s: any) => { const o: any = {}; for (const k of WL_STATS_KEYS) if (s?.[k] !== undefined && s?.[k] !== null) o[k] = s[k]; return o; };
  const FRESH_MS = 20 * 3600 * 1000;
  const isFresh = (iso: any, since: number | null) => {
    const t = Date.parse(String(iso || ""));
    if (!Number.isFinite(t)) return false;
    return since ? t >= since : Date.now() - t < FRESH_MS;
  };
  /** Everything the run still has to do, read fresh from the database each time. */
  // v373 (Ravi: "jo fetch ho chuke unhe dobara fetch mat karo, sirf naye"): mode "new" = only rows never fetched (the
  // default button); "old" = also rows last fetched 7+ days ago (oldest first); "since" = the old "also ones updated
  // today" run (everything not fetched after the admin pressed Fetch).
  const STALE_MS = 7 * 24 * 3600 * 1000;
  async function bulkQueue(since: number | null, skip: Set<string>, mode: "new" | "old" | "since" = since ? "since" : "new") {
    let wl: any[] = [];
    try {
      const { data } = await db().from("waitlist").select("id, social_handle, instagram_link, status, profile_photo_url, instagram_synced_at").limit(5000);
      wl = (data || []).filter((w: any) => /^pending$/i.test(String(w.status || "")) && cleanUsername(w.social_handle || w.instagram_link));
    } catch (e: any) { logIgnored("instagram:bulk-waitlist", e); }
    const { data: profs } = await db().from("creator_profiles").select("user_id, instagram_handle, instagram, instagram_synced_at")
      .not("is_deleted", "is", true).limit(5000);
    const people = (profs || []).filter((r: any) => cleanUsername(r.instagram_handle || r.instagram));
    const freshOf = (iso: any) => {
      if (mode === "since") return isFresh(iso, since);
      const t = Date.parse(String(iso || ""));
      if (!Number.isFinite(t)) return false; // never fetched → always to do
      return mode === "new" ? true : Date.now() - t < STALE_MS;
    };
    const items = [
      ...wl.map((w: any) => ({ kind: "waitlist", key: `w:${w.id}`, row: w, at: Date.parse(String(w.instagram_synced_at || "")) || 0, handle: cleanUsername(w.social_handle || w.instagram_link)!, fresh: freshOf(w.instagram_synced_at) })),
      ...people.map((p: any) => ({ kind: "creator", key: `c:${p.user_id}`, row: p, at: Date.parse(String(p.instagram_synced_at || "")) || 0, handle: cleanUsername(p.instagram_handle || p.instagram)!, fresh: freshOf(p.instagram_synced_at) })),
    ];
    // never fetched first (waitlist before creators), then the oldest fetch
    const todo = items.filter((i) => !i.fresh && !skip.has(i.key)).sort((a, b) => (a.at ? 1 : 0) - (b.at ? 1 : 0) || a.at - b.at || (a.kind === b.kind ? 0 : a.kind === "waitlist" ? -1 : 1));
    return { total: items.length, fresh: items.filter((i) => i.fresh).length, todo };
  }
  async function fetchWaitlistRow(w: any, handle: string) {
    const nowIso = new Date().toISOString();
    try {
      const stats = await statsFor(handle);
      const patch: any = { ig_followers: stats.followers ?? null, instagram_stats: compactStats(stats), instagram_synced_at: nowIso, instagram_fetch_error: null };
      let photo = false;
      if (photoIsReplaceable(w.profile_photo_url)) {
        const url = await igPhotoUrl(handle, stats);
        if (url) { patch.profile_photo_url = url; photo = true; }
      }
      const { error } = await db().from("waitlist").update(patch).eq("id", w.id);
      if (error) throw error;
      return { ok: true, photo };
    } catch (e: any) {
      const g = e?.error ? graphError(e) : { code: "", error: e?.message || String(e) };
      if (g.code === "RATE_LIMIT" || g.code === "TOKEN") throw e; // not this person's fault — wait / stop the run (v372: TOKEN no longer marks every row "Fetch failed")
      const why = g.code === "NOT_PROFESSIONAL" ? "Personal or private account (needs a public Business/Creator account)"
        : g.code === "TOKEN" ? "Ybex's Instagram token needs renewing (IG_GRAPH_TOKEN)"
        : String(e?.error?.message || g.error || "Fetch failed").slice(0, 160);
      try { await db().from("waitlist").update({ instagram_fetch_error: why, instagram_synced_at: nowIso }).eq("id", w.id); } catch (e2: any) { logIgnored("instagram:wl-error", e2); }
      return { ok: false, error: why };
    }
  }
  const bulkConfigured = () => lookupConfigured() && Boolean(db());
  router.get("/admin/creators/instagram-bulk", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ error: "Admin only" });
    return res.json({ configured: bulkConfigured(), budget_left: budget.left(), stepped: true });
  });
  // Body: { force, since (ms, when the admin pressed Fetch), skip: [keys that failed in this run] }.
  router.post("/admin/creators/instagram-bulk/step", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ error: "Admin only" });
    if (!bulkConfigured()) return res.status(503).json({ code: "NOT_CONFIGURED", error: "Instagram fetch isn't switched on yet (IG_GRAPH_TOKEN / IG_BUSINESS_ID)." });
    const force = Boolean(req.body?.force);
    const sinceNum = Number(req.body?.since);
    const since = force && Number.isFinite(sinceNum) && sinceNum > 0 ? Math.min(sinceNum, Date.now()) : null;
    const mode: "new" | "old" | "since" = since ? "since" : req.body?.mode === "old" ? "old" : "new";
    const skip = new Set<string>((Array.isArray(req.body?.skip) ? req.body.skip : []).slice(0, 5000).map(String));
    const r = await bulkStep({ since, mode, skip, max: 6, maxMs: 18000 });
    if (r.status === 503) return res.status(503).json(r.body);
    if (r.idle) { try { await deps.logAdminAction?.(user, "instagram_bulk_fetch", "creator_profile", "all", { force, mode }); } catch (e: any) { logIgnored("instagram:bulk-log", e); } }
    return res.json(r.body);
  });
  /** One slice of the background fetch (admin button or the hourly cron). Uses only the background share of the budget. */
  async function bulkStep({ since, mode, skip, max, maxMs }: { since: number | null; mode: "new" | "old" | "since"; skip: Set<string>; max: number; maxMs: number }): Promise<any> {
    const out: any = { done: [], failed: [], photos: 0, waiting_until: null };
    const started = Date.now();
    let q = await bulkQueue(since, skip, mode);
    for (const item of q.todo) {
      if (out.done.length + out.failed.length >= max || Date.now() - started > maxMs) break;
      if (!statsCache.has(item.handle) && bgWaitMs()) { out.waiting_until = new Date(Date.now() + bgWaitMs()).toISOString(); out.reserved = true; break; }
      try {
        if (item.kind === "waitlist") {
          const r = await fetchWaitlistRow(item.row, item.handle);
          if (r.ok) { out.done.push(item.key); if (r.photo) out.photos += 1; } else out.failed.push({ key: item.key, who: item.handle, error: r.error });
        } else {
          const r = await refreshOne(String(item.row.user_id));
          if (r?.code === "TOKEN") { out.token_error = r.error; break; } // v372
          if (r?.ok) out.done.push(item.key);
          else out.failed.push({ key: item.key, who: item.handle, error: String(r?.error || "Fetch failed").slice(0, 160) });
        }
      } catch (e: any) {
        const g = e?.error ? graphError(e) : { code: "", error: e?.message || String(e) };
        if (g.code === "RATE_LIMIT") { out.waiting_until = new Date(Date.now() + Math.max(budget.waitMs(), 60000)).toISOString(); break; }
        if (g.code === "TOKEN") { out.token_error = g.error; break; } // v372: Ybex's own token is dead → stop, say why
        out.failed.push({ key: item.key, who: item.handle, error: String(g.error || "Fetch failed").slice(0, 160) });
      }
    }
    // v372: the screen stops on a 503 and shows this message (was: 144 rows each marked "Fetch failed")
    if (out.token_error && !out.done.length) return { status: 503, body: { code: "TOKEN", error: "Meta stopped accepting Ybex's Instagram token (\"Cannot call API for app … on behalf of user …\"). Make a new long-lived IG_GRAPH_TOKEN in Meta and put it in the server settings, then fetch again." } };
    if (out.done.length || out.failed.length) {
      for (const f of out.failed) skip.add(f.key);
      q = await bulkQueue(since, skip, mode);
    }
    const idle = !out.done.length && !out.failed.length && !out.waiting_until;
    return { status: 200, idle, body: { ...out, mode, total: q.total, fresh: q.fresh, remaining: q.todo.length, budget_left: budget.left(), reserve: BG_KEEP, configured: true } };
  }
  // v373: hourly auto refresh, called by Cloud Scheduler (the server's own timers don't run on Cloud Run):
  //   POST /api/internal/cron/instagram-refresh   header x-cron-secret: CRON_SECRET   (every hour)
  // New usernames first (sign-ups whose fetch was busy, new waitlist rows), then anyone last fetched 7+ days ago.
  // Stays inside the background share of the hour, so sign-ups never get "Instagram is busy" because of it.
  router.post("/internal/cron/instagram-refresh", async (req, res) => {
    if (!cronAuthorized(req.headers["x-cron-secret"])) return res.status(401).json({ error: "Unauthorized" });
    if (!bulkConfigured()) return res.json({ ok: true, skipped: "not configured" });
    const skip = new Set<string>();
    let done = 0, failed = 0, waiting: string | null = null;
    const started = Date.now();
    // v419 (Ravi): no more "everyone fetched 7+ days ago" — only never-fetched usernames here, then today's share of
    // active creators (runActiveRefresh). Inactive creators are not refreshed automatically.
    for (const mode of ["new"] as const) {
      while (Date.now() - started < 45000) {
        const r = await bulkStep({ since: null, mode, skip, max: 6, maxMs: Math.max(1000, 45000 - (Date.now() - started)) });
        if (r.status !== 200) return res.status(r.status).json(r.body);
        done += r.body.done.length; failed += r.body.failed.length;
        if (r.body.waiting_until) { waiting = r.body.waiting_until; break; }
        if (r.idle || !r.body.remaining) break;
      }
      if (waiting) break;
    }
    const auto = waiting ? { done: 0, left: await autoLeftToday() } : await runActiveRefresh(Math.max(0, 50000 - (Date.now() - started)));
    return res.json({ ok: true, done, failed, waiting_until: waiting, active_refreshed: auto.done, active_left_today: auto.left, budget_left: budget.left() });
  });
  // Old start call (v354 screens still open in a browser): same as one step.
  router.post("/admin/creators/instagram-bulk", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ error: "Admin only" });
    return res.json({ configured: bulkConfigured(), stepped: true, running: false });
  });

  return { refreshOne };
}
