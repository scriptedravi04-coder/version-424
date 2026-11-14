import { getMediaKey } from "./mediaKey";
import { apiUrl } from "./native";

// Files in these buckets are private. The browser never opens them directly — only through
// /api/media, which checks who is asking and hands out a 15-minute signed link.
// Keep in step with backend/mediaAccess.ts (parseStorageRef).
const PRIVATE_BUCKETS = ["content-submissions", "live-proofs", "ugc-assets", "kyc-documents"];
const CONTENT_FOLDERS = ["ugc-videos/", "campaign-deliverables/", "campaign-videos/", "campaign-submissions/", "chat-attachments/", "chat-submissions/"];
const PSEUDO = /^https?:\/\/(ugc-videos|campaign-deliverables|chat-submissions|chat-attachments|content-submissions|live-proofs|ugc-assets)\/(.+)$/;

/** "bucket/path" for a private file reference, or null for anything else. */
export function privateStorageRef(src) {
  let s = typeof src === "string" ? src.trim() : "";
  if (!s || s.startsWith("blob:") || s.startsWith("data:")) return null;
  // Our own proxy link (the /upload route returns one): read its src back out.
  const proxy = s.match(/\/api\/media\?(?:.*&)?src=([^&]+)/);
  if (proxy) {
    try { s = decodeURIComponent(proxy[1]); } catch (e) { return null; }
  }
  const pseudo = s.match(PSEUDO);
  if (pseudo) s = `${pseudo[1]}/${pseudo[2]}`;
  if (/^https?:\/\//i.test(s)) {
    const m = s.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/);
    if (!m || !PRIVATE_BUCKETS.includes(m[1])) return null;
    let p = m[2];
    try { p = decodeURIComponent(p); } catch (e) { /* keep raw */ }
    return `${m[1]}/${p}`;
  }
  s = s.split("?")[0].replace(/^\/+/, "");
  if (PRIVATE_BUCKETS.some((b) => s.startsWith(`${b}/`))) return s;
  if (CONTENT_FOLDERS.some((f) => s.startsWith(f))) return `content-submissions/${s}`;
  return null;
}

/** The URL to put in src/href for a private file, or null when src is not one. */
export function mediaProxyUrl(src) {
  const ref = privateStorageRef(src);
  if (!ref) return null;
  const k = getMediaKey();
  // src last, so the link still ends in ".mp4"/".png" for code that looks at the extension.
  return apiUrl(`/api/media?${k ? `k=${encodeURIComponent(k)}&` : ""}src=${encodeURIComponent(ref)}`); // v335: absolute inside the iPhone app
}

/** For plain href/src attributes: the proxy link for a private file, otherwise the value as given. */
export function mediaHref(src) {
  const proxied = mediaProxyUrl(src);
  if (proxied) return proxied;
  // Session 58: /api/files/<id> (KYC uploads, some photos) also needs the media key — an <img> can't send the login header.
  if (typeof src === "string" && /^(?:https?:\/\/[^/]+)?\/api\/files\/[^?#]+$/.test(src.trim())) {
    const k = getMediaKey();
    if (k) return `${src.trim()}?k=${encodeURIComponent(k)}`;
  }
  return src;
}
