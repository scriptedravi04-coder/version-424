// v354 (Ravi: "username ek baar maanga, bas — photo, followers, reach, engagement, reels sab apne aap aa jaaye.
// Manually photo upload kari hai to wahi rahe. Inactive users ko baar-baar fetch mat karo. Admin se ek button jo
// sab creators + waitlist ka fetch kar de.")
//
// Pure helpers (tested) + the Instagram profile-photo copy. Everything still comes from Meta's official
// Business Discovery API (no scraping). Instagram's picture links expire after a few days, so the picture is
// copied once into our own "avatars" bucket at avatars/ig/<username>.<ext> — that path is also how we know a
// photo came from Instagram (and may be refreshed) instead of being uploaded by the creator (never touched).
import { shrinkPhoto } from "./imageResize";
import { logIgnored } from "./logIgnored";

const DAY = 24 * 3600 * 1000;

// ───────────────────────────── reels / posts ─────────────────────────────

// Words that usually mean a paid / gifted brand post. Instagram's API doesn't say "paid partnership" for other
// accounts, so this is a hint ("Looks like a brand collab"), never a filter — the creator still picks.
const COLLAB_RE = /(#ad\b|#ads\b|#advert|#sponsored|#sponsor\b|#collab|#collaboration|#partnership|#paidpartnership|paid partnership|#gifted|\bgifted by\b|#brandpartner|#brandambassador|#ambassador|#promo\b|#promotion|in collaboration with|in association with|use (?:my )?code|discount code|coupon code|#barter|#pr\b|#prpackage)/i;

/** "@boat.nirvana" from a caption → "boat.nirvana" (first @mention), else null. Pure. */
export function firstMention(caption: any): string | null {
  const m = /@([a-z0-9._]{2,30})/i.exec(String(caption || ""));
  return m ? m[1].replace(/\.$/, "").toLowerCase() : null;
}

/** Last posts → small list the portfolio picker shows. Reels first are NOT forced; order = newest first. Pure. */
export function mediaListFrom(media: any[] = [], max = 25) {
  return (Array.isArray(media) ? media : []).slice(0, max).map((p: any) => {
    const caption = String(p?.caption || "");
    const kind = String(p?.media_product_type || "").toUpperCase() === "REELS" ? "reel"
      : String(p?.media_type || "").toUpperCase() === "VIDEO" ? "reel"
      : String(p?.media_type || "").toUpperCase() === "CAROUSEL_ALBUM" ? "carousel" : "post";
    const isVideo = String(p?.media_type || "").toUpperCase() === "VIDEO";
    const views = Number(p?.view_count ?? p?.views ?? p?.play_count);
    return {
      id: String(p?.id || ""),
      permalink: typeof p?.permalink === "string" ? p.permalink : null,
      caption: caption.slice(0, 800), // v377: long captions kept their hashtags at the end (the challenge checks them)
      kind,
      thumb: p?.thumbnail_url || (!isVideo ? p?.media_url : null) || null,
      likes: Number.isFinite(Number(p?.like_count)) ? Number(p.like_count) : null,
      comments: Number.isFinite(Number(p?.comments_count)) ? Number(p.comments_count) : null,
      views: Number.isFinite(views) && views > 0 ? views : null,
      at: p?.timestamp || null,
      collab: COLLAB_RE.test(caption),
      brand: firstMention(caption),
    };
  }).filter((x) => x.permalink);
}

/** The first e-mail written in the Instagram bio, else null. (Meta never gives the account's login e-mail.) Pure. */
export function emailFromBio(bio: any): string | null {
  const m = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.exec(String(bio || ""));
  return m ? m[0].toLowerCase().replace(/\.$/, "") : null;
}

// ───────────────────────────── photos ─────────────────────────────

/** True when a photo may be (re)placed by the Instagram one: none yet, our own Instagram copy, or a stock
 *  login / placeholder picture. A photo the creator uploaded is never replaced. Pure. */
export function photoIsReplaceable(url: any): boolean {
  const u = String(url || "").trim();
  if (!u) return true;
  return /\/avatars\/ig\//.test(u) || /googleusercontent\.com|ui-avatars\.com|dicebear\.com|gravatar\.com/i.test(u);
}

/** True when the photo is our Instagram copy (path avatars/ig/…). Pure. */
export const isIgPhoto = (url: any) => /\/avatars\/ig\//.test(String(url || ""));

/** Copies an Instagram picture into avatars/ig/<username>.<ext>. Returns our public URL, or null. */
export async function copyIgPhoto(client: any, username: string, pictureUrl: string, f: typeof fetch = fetch): Promise<string | null> {
  if (!client?.storage || !pictureUrl || !/^https:\/\//i.test(pictureUrl) || !/^[a-z0-9._]{1,30}$/.test(username)) return null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 9000);
    const r = await f(pictureUrl, { signal: ctl.signal } as any).finally(() => clearTimeout(t));
    const type = String(r.headers?.get?.("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
    if (!r.ok || !/^image\/(jpeg|jpg|png|webp)$/.test(type)) return null;
    const raw = Buffer.from(await r.arrayBuffer());
    if (!raw.length || raw.length > 6 * 1024 * 1024) return null;
    const small = await shrinkPhoto(raw, type, "avatars");
    const ext = small.ext || "jpg";
    const path = `ig/${username}.${ext}`;
    const { error } = await client.storage.from("avatars").upload(path, small.buffer, { contentType: small.contentType, upsert: true, cacheControl: "604800" }); // v428: 7 days (was 1 h) — egress
    if (error) { logIgnored("instagram:photo-upload", error); return null; }
    const { data } = client.storage.from("avatars").getPublicUrl(path);
    // ?v= so phones / the service worker load the new picture after a refresh (same path, new file).
    return data?.publicUrl ? `${data.publicUrl}?v=${Date.now().toString(36)}` : null;
  } catch (e: any) { logIgnored("instagram:photo-copy", e); return null; }
}

/** v363: Instagram / Facebook CDN only — the portfolio cover copy never fetches any other address. Pure. */
export function isIgCdnUrl(u: any): boolean {
  try {
    const url = new URL(String(u || ""));
    if (url.protocol !== "https:") return false;
    const h = url.hostname.toLowerCase();
    return h.endsWith(".cdninstagram.com") || h === "cdninstagram.com" || h.endsWith(".fbcdn.net") || h === "fbcdn.net";
  } catch { return false; }
}
/** v363: "instagram.com/reel/ABC123/?igsh=…" → "ABC123" (reel, reels, p, tv). Pure. */
export function igShortcode(u: any): string | null {
  const m = /instagram\.com\/(?:[^/?#]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{5,})/i.exec(String(u || ""));
  return m ? m[1] : null;
}
/** v363 (Ravi: "portfolio ke pages mein preview nahi dikh raha"): Instagram's cover links expire in a few days, so the
 *  picked reel's cover is copied to our storage once (avatars/portfolio/<user>/<id>.<ext>) and that link is saved. */
export async function copyPortfolioCover(client: any, userId: string, itemId: string, coverUrl: string, f: typeof fetch = fetch): Promise<string | null> {
  const safeUser = String(userId || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  const safeId = String(itemId || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  if (!client?.storage || !safeUser || !safeId || !isIgCdnUrl(coverUrl)) return null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 9000);
    const r = await f(coverUrl, { signal: ctl.signal } as any).finally(() => clearTimeout(t));
    const type = String(r.headers?.get?.("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
    if (!r.ok || !/^image\/(jpeg|jpg|png|webp)$/.test(type)) return null;
    const raw = Buffer.from(await r.arrayBuffer());
    if (!raw.length || raw.length > 8 * 1024 * 1024) return null;
    const small = await shrinkPhoto(raw, type, "avatars");
    const path = `portfolio/${safeUser}/${safeId}.${small.ext || "jpg"}`;
    const { error } = await client.storage.from("avatars").upload(path, small.buffer, { contentType: small.contentType, upsert: true, cacheControl: "604800" }); // v428: 7 days (was 1 day) — egress
    if (error) { logIgnored("instagram:cover-upload", error); return null; }
    const { data } = client.storage.from("avatars").getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (e: any) { logIgnored("instagram:cover-copy", e); return null; }
}

// ───────────────────────────── refresh schedule ─────────────────────────────

/** How often a creator's numbers are refreshed, from when they last used the app (Ravi: daily users daily;
 *  people who stopped opening the app every few days; forgotten / never-logged-in profiles every 10 days).
 *  Login renewals are stored once a day, so "today" = used in the last 24 h. Pure. */
export function refreshEveryDays(lastActiveMs: number | null, now = Date.now()): number {
  if (!lastActiveMs || !Number.isFinite(lastActiveMs)) return 10;
  const idle = now - lastActiveMs;
  if (idle < DAY) return 1;
  if (idle < 7 * DAY) return 3;
  return 10;
}

/** Is a refresh due? syncedAt = last fetch (null → yes). 1 h slack so the hourly job doesn't skip a day. Pure. */
export function refreshDue(syncedAtIso: any, lastActiveMs: number | null, now = Date.now()): boolean {
  const t = Date.parse(String(syncedAtIso || ""));
  if (!Number.isFinite(t)) return true;
  return now - t >= refreshEveryDays(lastActiveMs, now) * DAY - 3600 * 1000;
}

/** v419 (Ravi: "credits sirf unpe jo app regularly kholte hain — 50 roz, baari-baari"): who gets today's automatic
 *  Instagram refresh. Only creators who used the app in the last ACTIVE_DAYS days; each at most once a day; oldest
 *  fetch first, so day 1 = first 50, day 2 = next 50 … and after everyone it starts again from the first ones.
 *  Creators who don't open the app are never refreshed automatically (admin can still press Fetch). Pure. */
export const AUTO_REFRESH_PER_DAY = 50;
export const AUTO_REFRESH_ACTIVE_DAYS = 7;
export function pickAutoRefresh(rows: Array<{ user_id: any; instagram_synced_at?: any }>, lastActive: Map<string, number>, limit: number, now = Date.now()): string[] {
  if (!(limit > 0)) return [];
  return (rows || [])
    .filter((r) => {
      const used = lastActive.get(String(r.user_id));
      if (!used || now - used > AUTO_REFRESH_ACTIVE_DAYS * DAY) return false;
      const t = Date.parse(String(r.instagram_synced_at || ""));
      return !Number.isFinite(t) || now - t >= DAY - 3600 * 1000;
    })
    .sort((a, b) => (Date.parse(String(a.instagram_synced_at || "")) || 0) - (Date.parse(String(b.instagram_synced_at || "")) || 0))
    .slice(0, limit).map((r) => String(r.user_id));
}

/** Login rows → last time each user used the app (expires_at is "last use + 30 days"). Pure. */
export function lastActiveByUser(sessions: any[], sessionMs: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of sessions || []) {
    const exp = Date.parse(String(s?.expires_at || ""));
    if (!s?.user_id || !Number.isFinite(exp)) continue;
    const used = exp - sessionMs;
    if (used > (out.get(String(s.user_id)) || 0)) out.set(String(s.user_id), used);
  }
  return out;
}

// ───────────────────────────── Meta call budget ─────────────────────────────

/** One shared sliding window for every Business Discovery call (Meta allows ~200 / hour for Ybex's account). */
export function makeBudget(limit = 180, windowMs = 3600 * 1000) {
  const calls: number[] = [];
  const prune = (now: number) => { while (calls.length && now - calls[0] >= windowMs) calls.shift(); };
  return {
    take(now = Date.now()) { prune(now); if (calls.length >= limit) return false; calls.push(now); return true; },
    left(now = Date.now()) { prune(now); return limit - calls.length; },
    /** ms until one more call fits (0 = now). v373: `keep` = calls left untouched for people signing up right now. */
    waitMs(now = Date.now(), keep = 0) {
      prune(now);
      const cap = Math.max(0, limit - keep);
      if (calls.length < cap) return 0;
      const drop = calls.length - cap + 1; // this many must age out first
      return Math.max(0, windowMs - (now - calls[drop - 1]));
    },
  };
}
