// Session 58 (Ravi: "han kro") — remember where a visitor first came from, so the Admin Growth page can
// show Instagram / Google / Meta ads / … signups. Only the first visit is kept (a later visit with ad
// tags replaces a plain one). After sign-in it is sent once; the server saves it only on a new account.
import { safeStorage } from "../utils/storage";
import { trackFunnel } from "./metaPixel"; // v362

const KEY = "yb_signup_src";
const REG_KEY = (uid) => `yb_reg_${uid}`;
const NEW_ACCOUNT_MS = 60 * 60 * 1000;

/** v376: account made in the last hour. */
export function isNewAccount(user, now = Date.now()) {
  const created = new Date(user?.created_at || 0).getTime();
  return Boolean(created) && now - created < NEW_ACCOUNT_MS;
}

/** v376: Meta CompleteRegistration once per account per device. `force` = the sign-up screen knows the account is new
 *  (some sign-in answers carry no created_at, so the hour check alone missed them). */
export function trackRegistration(user, method = "", force = false) {
  const uid = user?.user_id;
  if (!uid || user.role === "admin" || user.role === "sub_admin") return false;
  if (!force && !isNewAccount(user)) return false;
  try { if (safeStorage.getItem(REG_KEY(uid))) return false; safeStorage.setItem(REG_KEY(uid), "1"); } catch { /* still send once */ }
  // v418: same event id as the server's Conversions API copy (backend/metaCapi.ts registrationEventId) → counted once
  trackFunnel("CompleteRegistration", { role: user.role || "", method: method || user.auth_method || "" }, `reg_${uid}`);
  return true;
}
const SENT = "yb_signup_src_sent";

// v418: the first-visit tags also live in a cookie for 30 days (the whole ybexmedia.in site shares it, www or not),
// so a cleared localStorage or a www ↔ non-www hop doesn't lose the ad.
const COOKIE = "yb_src";
function cookieDomain() {
  try { const h = window.location.hostname; return /(^|\.)ybexmedia\.in$/.test(h) ? "; domain=.ybexmedia.in" : ""; } catch { return ""; }
}
function readCookie() {
  try {
    const m = String(document.cookie || "").split(/;\s*/).find((p) => p.startsWith(COOKIE + "="));
    return m ? JSON.parse(decodeURIComponent(m.slice(COOKIE.length + 1))) : null;
  } catch { return null; }
}
function write(v) {
  try { safeStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage off */ }
  try { document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(v))}; max-age=${30 * 86400}; path=/; samesite=lax${cookieDomain()}`; } catch { /* cookies off */ }
}
const tagged = (v) => Boolean(v && (v.utm_source || v.gclid || v.fbclid));
function read() {
  let ls = null;
  try { ls = JSON.parse(safeStorage.getItem(KEY) || "null"); } catch { ls = null; }
  const ck = readCookie();
  if (tagged(ls)) return ls;
  if (tagged(ck)) return ck;
  return ls || ck;
}
/** v418: the saved first-visit tags (or null). */
export const getSignupSource = read;

/** Call once when the app starts. */
export function captureSignupSource() {
  if (typeof window === "undefined") return;
  try {
    const q = new URLSearchParams(window.location.search || "");
    const tag = (k) => (q.get(k) || "").slice(0, 120);
    const now = {
      utm_source: tag("utm_source"), utm_medium: tag("utm_medium"), utm_campaign: tag("utm_campaign"),
      gclid: q.get("gclid") ? 1 : 0, fbclid: q.get("fbclid") ? 1 : 0,
      referrer: String(document.referrer || "").slice(0, 200),
      app: (window.navigator.standalone === true || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)) ? 1 : 0,
      at: Date.now(),
    };
    // A referrer from our own site says nothing about where the person came from.
    // Nor does the Google / Apple sign-in page sending them back, or the payment window.
    if (/ybex|accounts\.google|appleid\.apple|razorpay/i.test(now.referrer) && !now.referrer.startsWith("android-app://")) now.referrer = "";
    const hasTags = !!(now.utm_source || now.gclid || now.fbclid);
    const old = read();
    const oldHasTags = !!(old && (old.utm_source || old.gclid || old.fbclid));
    if (!old || (hasTags && !oldHasTags)) write(now);
    carryTagsInUrl();
  } catch (e) {
    console.warn("[signupSource] not saved:", e?.message || e);
  }
}

// v418: on the sign-up / offer pages the ad's tags stay in the address bar. When an in-app browser (Instagram /
// Facebook) sends the person to Chrome ("Open in browser", or Google refusing to sign in inside the app), the copied
// address still carries utm_source, so the new browser knows the ad too.
const ENTRY = /^\/(app(\/continue\/(creator|brand))?|offer|offers|challenge|signup|login|apply-creator)?\/?$/;
export function carryTagsInUrl() {
  try {
    const src = read();
    if (!tagged(src) || !src.utm_source || !ENTRY.test(window.location.pathname || "")) return;
    const q = new URLSearchParams(window.location.search || "");
    if (q.get("utm_source")) return;
    for (const k of ["utm_source", "utm_medium", "utm_campaign"]) if (src[k]) q.set(k, src[k]);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${q.toString()}${window.location.hash || ""}`);
  } catch { /* address bar untouched */ }
}

/** v418: tell the server the ad's tags as soon as the e-mail is typed (the code may be opened in another browser). */
export function sendPreSource(api, email) {
  try {
    const src = read();
    if (!api || !email || !tagged(src)) return;
    api.post("auth/pre-source", { email, utm_source: src.utm_source, utm_medium: src.utm_medium, utm_campaign: src.utm_campaign, gclid: src.gclid, fbclid: src.fbclid })
      .catch(() => {});
  } catch { /* optional */ }
}

/** v418: the Android app's Google Play install referrer ("utm_source=meta&utm_campaign=…") becomes the first-visit tags. */
export function saveInstallReferrer(referrer) {
  try {
    const q = new URLSearchParams(String(referrer || ""));
    const now = {
      utm_source: (q.get("utm_source") || "").slice(0, 120), utm_medium: (q.get("utm_medium") || "").slice(0, 120),
      utm_campaign: (q.get("utm_campaign") || "").slice(0, 120), gclid: q.get("gclid") ? 1 : 0, fbclid: 0,
      referrer: "android-app://com.android.vending", app: 1, at: Date.now(),
    };
    const old = read();
    if (!old || (tagged(now) && !tagged(old))) { write(now); return true; }
    return false;
  } catch { return false; }
}

/** Call after any sign-in. Sends once per browser; the server ignores old accounts. */
export function sendSignupSource(api, user) {
  if (!user?.user_id || !api) return;
  if (user.role === "admin" || user.role === "sub_admin") return;
  try {
    if (safeStorage.getItem(SENT) === String(user.user_id)) return;
    const created = new Date(user.created_at || 0).getTime();
    if (created && Date.now() - created > 2 * 24 * 60 * 60 * 1000) { safeStorage.setItem(SENT, String(user.user_id)); return; }
    safeStorage.setItem(SENT, String(user.user_id));
    // v362: a brand-new account (made in the last hour) counts as one sign-up for Meta / GA.
    trackRegistration(user); // v376: shared with the sign-up screens (fires once per account)
    api.post("auth/signup-source", read() || {}).catch((e) => console.warn("[signupSource] send failed:", e?.message || e));
  } catch (e) {
    console.warn("[signupSource] skipped:", e?.message || e);
  }
}
