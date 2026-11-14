// v334 (Ravi: "offline cheeze daal do app mai jo bola tha") — one place for "the phone has no internet".
//
//  • isOffline() / useOnline(): the phone's own online flag (iPhone app, Android TWA, browser).
//  • makeOfflineError(): what api.js rejects with when an action (POST / PUT / PATCH / DELETE) is tapped
//    offline. It never reaches the server. Its text is the calm line below, in every place screens read an
//    error from (err.message, response.data.error / detail / message), so existing toasts show it as is.
//  • installOfflineToasts(toast): every toast that is about being offline ("You're offline…", "Couldn't
//    load…", "Network Error" while offline) becomes ONE calm grey toast (same id) — never a red pile.
//  • A toast from api.js only when the person just tapped something (background saves stay quiet).
import { useEffect, useRef, useState } from "react";

export const OFFLINE_CODE = "OFFLINE";
export const OFFLINE_MESSAGE = "You're offline — try again when you're back online";
export const OFFLINE_TOAST_ID = "ybex-offline";

export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/** true while the phone is online; re-renders on the browser's online / offline events. */
export function useOnline() {
  const [online, setOnline] = useState(() => !isOffline());
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

/** Calls `cb` once each time the phone comes back online (screens that show saved data reload quietly). */
export function useBackOnline(cb, delayMs = 800) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    let t = 0;
    const on = () => { clearTimeout(t); t = setTimeout(() => { try { const p = ref.current?.(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ } }, delayMs); };
    window.addEventListener("online", on);
    return () => { clearTimeout(t); window.removeEventListener("online", on); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function makeOfflineError(config) {
  const err = new Error(OFFLINE_MESSAGE);
  err.name = "OfflineError";
  err.code = OFFLINE_CODE;
  err.isOffline = true;
  err.config = config || {};
  err.response = {
    status: 0,
    statusText: "Offline",
    headers: {},
    config: config || {},
    data: { code: OFFLINE_CODE, error: OFFLINE_MESSAGE, detail: OFFLINE_MESSAGE, message: OFFLINE_MESSAGE },
  };
  return err;
}

export const isOfflineError = (err) => err?.code === OFFLINE_CODE || err?.response?.data?.code === OFFLINE_CODE;

// Last tap / key press — an action blocked within a few seconds of it was started by the person.
let lastGestureAt = 0;
let gesturesInstalled = false;
function installGestureClock() {
  if (gesturesInstalled || typeof window === "undefined") return;
  gesturesInstalled = true;
  const mark = () => { lastGestureAt = Date.now(); };
  window.addEventListener("pointerdown", mark, true);
  window.addEventListener("keydown", mark, true);
  window.addEventListener("submit", mark, true);
}
export const userJustActed = (ms = 4000) => Date.now() - lastGestureAt < ms;

let toastRef = null;
export function showOfflineToast() {
  try { toastRef?.(OFFLINE_MESSAGE, { id: OFFLINE_TOAST_ID, duration: 3500 }); } catch { /* no toaster yet */ }
}

/** v364: one calm grey toast with its own id (server updating, outbox saved / synced). Never throws. */
export function showCalmToast(message, id = OFFLINE_TOAST_ID, duration = 3500) {
  try { toastRef?.(message, { id, duration }); } catch { /* no toaster yet */ }
}
export const SERVER_TOAST_ID = "ybex-server-down";
const SERVER_DOWN_TEXT = "Ybex is updating right now — try again in a few minutes";
let serverDownNow = () => false;
/** v364: src/lib/api.js tells this file how to ask "is the server down?" (no import cycle). */
export function setServerDownCheck(fn) { if (typeof fn === "function") serverDownNow = fn; }

// While offline, a failure toast ("Couldn't load…", "Failed to upload…", "…try again") is about the missing internet.
const LOAD_FAIL = /couldn.t|could not|failed|unable to|try again|network|connection|timeout|timed out/i;
function isOfflineText(msg) {
  if (typeof msg !== "string") return false;
  if (msg.includes(OFFLINE_MESSAGE)) return true;
  return isOffline() && LOAD_FAIL.test(msg);
}
// v364: while the server is updating, "Couldn't load / Server error / try again" toasts are about that.
function isServerDownText(msg) {
  if (typeof msg !== "string") return false;
  if (msg.includes(SERVER_DOWN_TEXT)) return true;
  return !isOffline() && serverDownNow() && (LOAD_FAIL.test(msg) || /server/i.test(msg));
}

/** Called once at start-up (src/index.jsx) with sonner's toast. */
export function installOfflineToasts(toast) {
  installGestureClock();
  if (!toast || toast.__ybOffline) return;
  toastRef = toast;
  for (const kind of ["error", "warning", "info", "message"]) {
    const original = toast[kind];
    if (typeof original !== "function") continue;
    toast[kind] = (msg, opts) => {
      if (isServerDownText(msg)) {
        if (opts?.id != null && opts.id !== SERVER_TOAST_ID) { try { toast.dismiss(opts.id); } catch { /* ignore */ } }
        return toast(SERVER_DOWN_TEXT, { id: SERVER_TOAST_ID, duration: 3500 });
      }
      if (isOfflineText(msg)) {
        // A "Uploading…" spinner toast that this error was meant to replace is closed, not left spinning.
        if (opts?.id != null && opts.id !== OFFLINE_TOAST_ID) { try { toast.dismiss(opts.id); } catch { /* ignore */ } }
        return toast(OFFLINE_MESSAGE, { id: OFFLINE_TOAST_ID, duration: 3500 });
      }
      return original(msg, opts);
    };
  }
  toast.__ybOffline = true;
  // Back online → the offline toast goes away by itself.
  window.addEventListener("online", () => { try { toast.dismiss(OFFLINE_TOAST_ID); } catch { /* ignore */ } });
}
