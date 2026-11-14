// Session 22. Deliverable videos behind short-lived signed URLs.
//
// Before:
//   - `content-submissions` (UGC videos, campaign deliverables, chat attachments) was a PUBLIC
//     bucket. The browser built `/object/public/...` links itself, so anyone holding a link —
//     or guessing a path — could download the clean video before the brand approved and paid.
//     The "Ybex Protected Draft" watermark was only a CSS layer on top of that open file.
//   - The server forced every non-KYC bucket back to public on each start, so making the bucket
//     private in the Supabase dashboard would have been undone by the next deploy.
//   - Uploads handed out 7-day signed URLs that were stored in the DB and kept working after they
//     leaked.
//
// Now:
//   - The browser never gets a storage link directly. Every private-bucket reference (relative
//     path, public URL, old signed URL) is shown as `/api/media?src=...`.
//   - `/api/media` checks the viewer (session cookie, or the `k` media key from /auth/me), checks
//     that the viewer is staff, the uploader, or a party of the deal the file belongs to, and
//     redirects to a signed URL that dies after MEDIA_URL_TTL_SECONDS.
//   - The server no longer makes these buckets public. Once the bucket is private in the
//     dashboard, the old public links stop working and only /api/media can open a file.
import crypto from "crypto";

export const PRIVATE_MEDIA_BUCKETS = ["content-submissions", "live-proofs", "ugc-assets"];
export const ADMIN_ONLY_BUCKETS = ["kyc-documents"];
const ALL_PRIVATE = [...PRIVATE_MEDIA_BUCKETS, ...ADMIN_ONLY_BUCKETS];

/** Buckets the server must never switch to public (startup check and ensureBucketExists). */
export function isPrivateBucket(name: string): boolean {
  const n = String(name || "").toLowerCase();
  return ALL_PRIVATE.includes(n) || n.includes("kyc") || n.includes("document") || n === "contracts" || n === "sensitive-docs";
}

/** Long enough to watch a UGC video and seek; short enough that a copied link is useless soon. */
export const MEDIA_URL_TTL_SECONDS = 15 * 60;
export const MEDIA_KEY_TTL_MS = 12 * 60 * 60 * 1000;

// Session 43 (v284, Supabase egress): every view got a NEW signed link, so the phone could never
// reuse a video it had already downloaded — a 43 MB draft cost 43 MB of egress per play. A link is
// now reused for MEDIA_URL_REUSE_MS (≤ 1/3 of its life, so a reused link still has 10+ minutes
// left). The access check still runs on every request; only the signing is shared. A player asking
// again after an error (`_r` in the URL) always gets a fresh link.
export const MEDIA_URL_REUSE_MS = 5 * 60 * 1000;
const signedCache = new Map<string, { url: string; at: number }>();
export function reusableSignedUrl(ref: StorageRef, now = Date.now()): { url: string; expiresIn: number } | null {
  const hit = signedCache.get(`${ref.bucket}/${ref.path}`);
  if (!hit || now - hit.at >= MEDIA_URL_REUSE_MS) return null;
  return { url: hit.url, expiresIn: MEDIA_URL_TTL_SECONDS - Math.ceil((now - hit.at) / 1000) };
}
export function rememberSignedUrl(ref: StorageRef, url: string, now = Date.now()) {
  if (signedCache.size > 2000) {
    for (const [k, v] of signedCache) if (now - v.at >= MEDIA_URL_REUSE_MS) signedCache.delete(k);
    if (signedCache.size > 2000) signedCache.clear();
  }
  signedCache.set(`${ref.bucket}/${ref.path}`, { url, at: now });
}
export function __clearSignedUrlCache() { signedCache.clear(); }

// Folders inside content-submissions that belong to one deal thread / UGC order.
const THREAD_FOLDERS = ["ugc-videos/", "campaign-deliverables/", "campaign-videos/", "campaign-submissions/", "chat-attachments/", "chat-submissions/"];

export type StorageRef = { bucket: string; path: string };

function cleanPath(p: string): string {
  let out = String(p || "").split("?")[0].split("#")[0];
  try { out = decodeURIComponent(out); } catch (e) { /* keep raw */ }
  out = out.replace(/^\/+/, "");
  if (!out || out.includes("..") || out.includes("\\")) return "";
  return out;
}

/**
 * Turns anything the app stores for a file into { bucket, path }, or null when it is not a file
 * in one of our private buckets (Instagram/YouTube/Drive links, public images, blobs).
 */
export function parseStorageRef(src: any): StorageRef | null {
  let s = String(src || "").trim();
  if (!s || s.startsWith("blob:") || s.startsWith("data:")) return null;

  // Our own proxy link pasted back in.
  const proxy = s.match(/\/api\/media\?(?:.*&)?src=([^&]+)/);
  if (proxy) {
    try { s = decodeURIComponent(proxy[1]); } catch (e) { return null; }
  }

  // Pseudo URLs the app wrote in the past: https://ugc-videos/..., https://content-submissions/...
  const pseudo = s.match(/^https?:\/\/(ugc-videos|campaign-deliverables|chat-submissions|chat-attachments|content-submissions|live-proofs|ugc-assets)\/(.+)$/);
  if (pseudo) s = `${pseudo[1]}/${pseudo[2]}`;

  if (/^https?:\/\//i.test(s)) {
    // Supabase storage URL: /storage/v1/object/{public|sign|authenticated}/<bucket>/<path>
    const m = s.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/);
    if (!m) return null;
    const bucket = m[1];
    if (!ALL_PRIVATE.includes(bucket)) return null;
    const path = cleanPath(m[2]);
    return path ? { bucket, path } : null;
  }

  // Relative references.
  for (const b of ALL_PRIVATE) {
    if (s.startsWith(`${b}/`)) {
      const path = cleanPath(s.slice(b.length + 1));
      return path ? { bucket: b, path } : null;
    }
  }
  if (THREAD_FOLDERS.some((f) => s.startsWith(f))) {
    const path = cleanPath(s);
    return path ? { bucket: "content-submissions", path } : null;
  }
  return null;
}

/**
 * Who a file belongs to, read from its path:
 *   ugc-videos/<orderId>/<file>              → thread/order id
 *   <folder>/<threadId>-<13-digit ms>.<ext>   → thread id
 *   <userId>/file_xxx.ext                     → uploader (the /upload route)
 */
export function ownersFromPath(path: string): { threadIds: string[]; uploaderId: string | null } {
  const p = String(path || "");
  const folder = THREAD_FOLDERS.find((f) => p.startsWith(f));
  if (folder) {
    const rest = p.slice(folder.length);
    const threadIds = new Set<string>();
    const slash = rest.indexOf("/");
    if (slash > 0) threadIds.add(rest.slice(0, slash));
    const file = slash > 0 ? rest.slice(slash + 1) : rest;
    const m = file.match(/^(.+)-\d{10,}\.[A-Za-z0-9]+$/);
    if (m && m[1]) threadIds.add(m[1]);
    return { threadIds: Array.from(threadIds), uploaderId: null };
  }
  const slash = p.indexOf("/");
  return { threadIds: [], uploaderId: slash > 0 ? p.slice(0, slash) : null };
}

export type AccessDeps = {
  isStaff: (user: any) => boolean;
  actingIds: (user: any) => string[];
  isThreadParty: (user: any, threadId: string) => Promise<boolean>;
  /** Does the viewer have any deal/order/thread with this user? */
  sharesDealWith: (user: any, otherUserId: string) => Promise<boolean>;
};

export async function canViewMedia(user: any, ref: StorageRef, deps: AccessDeps): Promise<boolean> {
  if (!user || !ref) return false;
  if (deps.isStaff(user)) return true;
  const mine = deps.actingIds(user);
  const { threadIds, uploaderId } = ownersFromPath(ref.path);

  if (ADMIN_ONLY_BUCKETS.includes(ref.bucket)) {
    return !!uploaderId && mine.includes(uploaderId); // own KYC only
  }
  if (uploaderId && mine.includes(uploaderId)) return true;
  for (const t of threadIds) {
    if (await deps.isThreadParty(user, t)) return true;
  }
  if (uploaderId && (await deps.sharesDealWith(user, uploaderId))) return true;
  return false;
}

// ---------- media key ----------
// The app logs in with a Bearer token in localStorage; a <video src> cannot send that header,
// and the session cookie can be missing (embedded preview, older logins). /auth/me hands out a
// media key instead: it opens files this user may see for 12h and cannot be used to log in.

let cachedSecret: Buffer | null = null;
function secret(): Buffer {
  if (cachedSecret) return cachedSecret;
  const base = process.env.MEDIA_KEY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  cachedSecret = base
    ? crypto.createHash("sha256").update(`ybex-media-key:${base}`).digest()
    : crypto.randomBytes(32); // one instance only; the cookie still works on the others
  return cachedSecret;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function issueMediaKey(userId: string, now = Date.now()): string {
  const exp = now + MEDIA_KEY_TTL_MS;
  const payload = `${Buffer.from(String(userId)).toString("base64url")}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the user id the key was issued to, or null. */
export function verifyMediaKey(key: any, now = Date.now()): string | null {
  const parts = String(key || "").split(".");
  if (parts.length !== 3) return null;
  const [uid64, expStr, mac] = parts;
  const payload = `${uid64}.${expStr}`;
  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < now) return null;
  try {
    return Buffer.from(uid64, "base64url").toString() || null;
  } catch (e) {
    return null;
  }
}
