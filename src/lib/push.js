import { api } from "./api";
import { releaseNativePushOnLogout } from "./nativePush";

// Session 41 — push notifications on this phone / browser.
// iPhone: only works when Ybex is added to the Home Screen (iOS 16.4+); in a Safari tab
// PushManager does not exist, so pushSupported() is false and nothing is shown.

export function pushSupported() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

function keyToBytes(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

let cachedKey;
export async function pushServerKey() {
  if (cachedKey !== undefined) return cachedKey;
  try {
    const { data } = await api.get("push/public-key");
    cachedKey = data?.key || null;
  } catch {
    cachedKey = null;
  }
  return cachedKey;
}

/** Subscribes this device and saves it on the server. Needs permission "granted". */
export async function savePushSubscription() {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const key = await pushServerKey();
  if (!key) return false;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // Session 43 (Ravi: "pushes reach iPhone, rarely Android"): a phone that subscribed while the
  // server had a different key (the AI Studio keys, then the new ones) keeps an old subscription that
  // the push service rejects for ever. If the saved key isn't the server's current key, subscribe again.
  try {
    const have = sub?.options?.applicationServerKey;
    if (sub && have) {
      const a = new Uint8Array(have), b = keyToBytes(key);
      const same = a.length === b.length && a.every((v, i) => v === b[i]);
      if (!same) { await sub.unsubscribe(); sub = null; }
    }
  } catch (e) { /* older browser without options — keep the subscription */ }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) });
  await api.post("push/subscribe", { subscription: sub.toJSON() });
  return true;
}

/** Session 58: on logout this phone stops getting the account's pushes (deal / payout alerts kept arriving on a shared
 *  phone after logout). It goes back to "guest", so app-wide announcements still reach it. Never throws. */
export async function releasePushOnLogout() {
  releaseNativePushOnLogout(); // v336: iPhone App Store app (Apple push) — never throws
  try {
    if (!pushSupported()) return;
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 1500))]);
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub?.endpoint) await api.post("push/unsubscribe", { endpoint: sub.endpoint, to_guest: true }, { timeout: 4000 });
  } catch { /* logout must never wait on this */ }
}

/** Called from a button tap (iPhone only allows the phone's popup after a tap).
 *  Session 43: returns as soon as the phone's popup is answered. Saving the device used to be
 *  awaited here, and it waits for the service worker to finish installing (it downloads the whole
 *  app for offline use first) — on a first open that took 1–1.5 min and the button sat on
 *  "One sec…". The save now runs in the background; if it fails, the next app open retries it
 *  (PushPermissionScreen re-saves whenever permission is already "granted"). */
export async function askPushPermission() {
  if (!pushSupported()) return "unsupported";
  const result = await Notification.requestPermission();
  if (result === "granted") {
    savePushSubscription().catch((e) => console.warn("Push subscribe failed (retried next open):", e));
  }
  return result;
}
