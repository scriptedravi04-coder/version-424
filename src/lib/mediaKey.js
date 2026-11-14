import { safeStorage } from "../utils/storage";

// Short-lived key from /auth/me that lets <video>/<img> open deliverables through /api/media.
// It cannot be used to log in (backend/mediaAccess.ts).
const KEY = "ybex_media_key";

export function rememberMediaKey(me) {
  try {
    const k = me?.media_key || me?.user?.media_key;
    if (k) safeStorage.setItem(KEY, k);
  } catch (e) { /* storage unavailable */ }
}

export function forgetMediaKey() {
  try { safeStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
}

export function getMediaKey() {
  try { return safeStorage.getItem(KEY) || ""; } catch (e) { return ""; }
}
