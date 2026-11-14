// v402 (Ravi 4 Nov: "sabse pehle Instagram username maang ke wahin fetch kar lo — 500 nahi hai to wahin mana kar do,
// account hi mat banao"): the app's Join screen checks the Instagram username BEFORE any account or code e-mail.
// The server checks again when the account is made (backend/followerGate.ts signupFollowerBlock).
import { api } from "./api";
import { loadFollowerMin, belowMinFollowers } from "./followerGate";

const KEY = "ybex_ig_precheck";
export const IG_USERNAME_RE = /^[a-z0-9._]{1,30}$/;
export const cleanIgUsername = (v) => String(v || "").trim().replace(/^.*instagram\.com\//i, "").replace(/^@+/, "").replace(/[/?#\s].*$/, "").toLowerCase();

/**
 * → { state, username, followers, name, photo_url, min }
 *   state: "ok" (min+ followers) | "low" (fetched, under the minimum) | "unverified" (not found / private / not
 *   Professional) | "unknown" (Meta busy, fetch switched off, network — let them go on; the onboarding gate still checks).
 */
export async function checkInstagram(raw) {
  const username = cleanIgUsername(raw);
  const min = await loadFollowerMin();
  if (!IG_USERNAME_RE.test(username)) return { state: "invalid", username, min };
  try {
    const { data } = await api.post("instagram/preview", { username });
    const st = data?.stats || {};
    const followers = st.followers == null ? null : Number(st.followers);
    const out = { username, followers, name: st.name || null, photo_url: st.photo_url || null, min };
    if (followers === null || !Number.isFinite(followers)) return { ...out, state: "unknown" };
    return { ...out, state: belowMinFollowers(followers, min) ? "low" : "ok" };
  } catch (e) {
    const status = e?.response?.status;
    const code = e?.response?.data?.code;
    if (status === 404 || code === "NOT_PROFESSIONAL" || code === "NOT_FOUND") return { state: "unverified", username, min };
    return { state: "unknown", username, min };
  }
}

/** Remembered for the next screens (Google round trip, "One last step", photo + name). */
export function rememberPrecheck(r) {
  try { window.localStorage.setItem(KEY, JSON.stringify({ ...r, at: Date.now() })); } catch { /* private mode */ }
}
export function lastPrecheck(maxAgeMs = 3600 * 1000) { // v408 (QA #8): 1 hour (was 6) — the join form shows it with "Change"
  try {
    const r = JSON.parse(window.localStorage.getItem(KEY) || "null");
    return r && Date.now() - Number(r.at || 0) < maxAgeMs ? r : null;
  } catch { return null; }
}
export function clearPrecheck() { try { window.localStorage.removeItem(KEY); } catch { /* ignore */ } }

/** Lines under the Instagram box (fade in / out). */
export const IG_HINTS = [
  "🔒 Just your username — no login, no password",
  "Ybex will never ask for your Instagram password",
  "Trusted by 3,000+ creators",
];

/** v407: does a creator account already use this Instagram username? → { exists, email_hint } (never throws). */
export async function checkIgAccount(raw) {
  const username = cleanIgUsername(raw);
  if (!IG_USERNAME_RE.test(username)) return { exists: false };
  try {
    const { data } = await api.post("public/ig-account", { username });
    return { exists: Boolean(data?.exists), email_hint: data?.email_hint || null };
  } catch { return { exists: false }; }
}

/** v407: "10234" → "10.2K", "1250000" → "1.3M". */
export function shortCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e4 ? 1 : 1).replace(/\.0$/, "")}K`;
  return String(Math.round(v));
}
