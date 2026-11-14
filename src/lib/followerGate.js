// v397 (Ravi, 2 Nov 2026): new creators need 500+ Instagram followers (server: backend/followerGate.ts).
// The number can be changed in Admin → Platform Settings → Creator sign-up (0 = no limit); pages load it once.
import { api } from "./api";

export const MIN_FOLLOWERS = 500; // default until the server answers
let liveMin = MIN_FOLLOWERS;
let loading = null;
/** The live minimum (last value the server gave). */
export const currentMin = () => liveMin;
/** Asks the server once per page load; never throws. */
export function loadFollowerMin() {
  if (!loading) {
    loading = api.get("public/follower-gate").then((r) => {
      const n = Number(r?.data?.min);
      if (Number.isFinite(n) && n >= 0) liveMin = Math.round(n);
      return liveMin;
    }).catch(() => liveMin);
  }
  return loading;
}
export function _setMinForTests(n) { liveMin = n; loading = null; }

export const subLine = (min = liveMin) => `Brands on Ybex look for ${Number(min).toLocaleString("en-IN")}+ followers. You're closer than you think.`;

export const GATE_COPY = {
  emoji: "🌱",
  title: "Every big creator started small.",
  sub: subLine(MIN_FOLLOWERS),
  workTitle: "Drop your best work link below.",
  workSub: "If it matches brand standards, someone from the Ybex team will personally message you.",
  placeholder: "Paste your work link (reel, Drive, portfolio)",
  button: "Send my work",
  doneEmoji: "🙌",
  doneTitle: "Got it!",
  doneSub: "Someone from the Ybex team will personally message you if your work is a fit.",
};

/** A known follower number under the minimum. Empty / not-a-number = unknown = not blocked. Pure. */
export function belowMinFollowers(n, min = liveMin) {
  if (!(min > 0)) return false; // 0 = no limit
  if (n === null || n === undefined || n === "") return false;
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 && v < min;
}

/** The follower number came from Instagram itself (fetch or Instagram login), not typed. Pure. */
export const igVerified = (s) => ["instagram_fetch", "oauth"].includes(String(s?.instagramConnectedVia || "")) && s?.followerCount !== "" && s?.followerCount != null;

/**
 * Why a creator can't go on (null = fine). Pure.
 *  "unverified" — v397 (Ravi, 3 Nov): Instagram couldn't be read (private / personal account / wrong username). No access
 *                 without a fetched public Professional account — family members with 10 followers were getting in.
 *  "low"        — fetched, but under the minimum followers.
 */
export function gateReason(s, min = liveMin) {
  if (!s || s.followerGateExempt || !String(s.instagramHandle || "").trim()) return null;
  if (!igVerified(s)) return "unverified";
  return belowMinFollowers(s.followerCount, min) ? "low" : null;
}
export function onboardingGated(s, min = liveMin) { return Boolean(gateReason(s, min)); }

export const UNVERIFIED_COPY = {
  emoji: "🔒",
  title: "We couldn't open your Instagram.",
  sub: (handle) => `Is @${String(handle || "").replace(/^@+/, "")} a public Professional (Creator) account? Ybex reads your followers from Instagram, so it has to be public and Professional.`,
  steps: "Instagram → Settings → Account type and tools → Switch to professional account → Creator. Then make it Public.",
  retry: "I've switched — check again",
  workTitle: "Still a creator? Paste your best reel link.",
  workSub: "Our team will check it and personally open your account for you.",
  doneSub: "Our team will check your work and personally open your account for you.",
};

/** "reel.com/x" → "https://reel.com/x"; null when it can't be a link. Pure. */
export function cleanWorkLink(raw) {
  let s = String(raw || "").trim();
  if (!s || s.length > 500) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s.replace(/^\/+/, "");
  try {
    const u = new URL(s);
    return ["http:", "https:"].includes(u.protocol) && u.hostname.includes(".") ? u.toString() : null;
  } catch { return null; }
}
