// Session 42: is Ybex running as the installed app (added to the Home Screen / installed from
// Chrome), not as a normal browser tab? The installed app opens /app (public/manifest.json →
// start_url): login → dashboard, logged out → the app welcome screen, never the website landing.
export function isStandalone() {
  try {
    // v335: the iPhone app (Capacitor, files inside the app) behaves like the installed app: /app start, no landing.
    if (typeof window !== "undefined" && window.Capacitor && (window.Capacitor.isNativePlatform?.() || window.Capacitor.isNative)) return true;
    return (
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true
    );
  } catch {
    return false;
  }
}

/** A long random password for accounts made with an email code only (the person never sees it;
 *  they log in with codes, or set their own later with "Forgot password"). */
export function randomPassword() {
  const bytes = new Uint8Array(24);
  try { window.crypto.getRandomValues(bytes); } catch { for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256); }
  return "Yb!" + Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 32) + "9a";
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * v370 (Ravi: "website pe bhi app wala login — pehle Creator / Brand, phir email, neeche Google"): where /login and
 * /signup go now. ?role=creator|brand (ads, blog CTAs) skips the role cards and opens the email box for that side;
 * next / utm / ref / email stay on the link. ?demo=… keeps the old form (test server only). Pure.
 */
export function appAuthTarget(search, opts = {}) {
  const q = new URLSearchParams(search || "");
  if (q.get("demo")) return null;
  const r = String(q.get("role") || q.get("type") || "").toLowerCase();
  const role = r === "brand" || r === "agency" ? "brand" : r === "creator" || r === "influencer" ? "creator" : "";
  q.delete("role"); q.delete("type");
  // v408 (QA #2): /login (landing "Sign in") opens the Log in screen itself, not the role cards / Join screen
  if (opts.login && !role) { q.set("login", "1"); return `/app/continue/creator?${q.toString()}`; }
  const rest = q.toString();
  return `${role ? `/app/continue/${role}` : "/app"}${rest ? `?${rest}` : ""}`;
}
