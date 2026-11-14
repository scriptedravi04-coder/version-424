// v378 (Ravi: "Google sign-in app mai hi website chala deta hai"): on an iPhone, the Ybex app added to the Home Screen
// opens Google in a separate browser sheet. The sign-in used to finish INSIDE that sheet (the website ran there and the
// app stayed logged out). Now the app passes a one-time id; the server keeps the login for it, and the app — still open
// under the sheet — asks every 2 s and signs itself in. The sheet only says "Signed in — go back to the Ybex app".
import { api } from "./api";

/** Home Screen web app on iPhone / iPad (not Safari, not the App Store app). */
export function isIosHomeScreenApp() {
  try {
    if (window.Capacitor?.isNativePlatform?.()) return false;
    return window.navigator.standalone === true;
  } catch { return false; }
}

export function newHandoffId() {
  const b = new Uint8Array(16);
  try { window.crypto.getRandomValues(b); } catch { for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

let timer = null;
/** Polls for up to 5 minutes. onDone({ token, role }) once. */
export function waitForHandoff(id, onDone) {
  if (timer) clearInterval(timer);
  const until = Date.now() + 5 * 60 * 1000;
  let busy = false;
  const stop = () => { if (timer) clearInterval(timer); timer = null; document.removeEventListener("visibilitychange", tick); };
  const tick = async () => {
    if (busy) return;
    if (Date.now() > until) { stop(); return; }
    busy = true;
    try {
      const { data } = await api.get("auth/oauth/handoff", { params: { h: id }, bypassCache: true });
      if (data?.token) { stop(); onDone(data); }
      else if (data?.pending_signup) { stop(); onDone({ pending: data.pending_signup, email: data.email || "" }); } // v408
    } catch { /* 404 = not yet */ } finally { busy = false; }
  };
  timer = setInterval(tick, 2000);
  document.addEventListener("visibilitychange", tick);
  return stop;
}
