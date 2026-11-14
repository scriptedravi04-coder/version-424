// v376: the Instagram username typed on the sign-up screen (mobile + SMS code), kept on this device so the
// Diwali Challenge / portfolio username box is already filled. Tiny on purpose (imported by portfolio screens).
const IG_KEY = "ybex_signup_ig";
const ls = () => { try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; } };

/** Instagram username typed at sign-up — pre-fills the challenge / portfolio username box. */
export function rememberSignupIg(handle) {
  const h = String(handle || "").trim().replace(/^.*instagram\.com\//i, "").replace(/^@+/, "").replace(/[/?#].*$/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(h)) return "";
  try { ls()?.setItem(IG_KEY, h); } catch { /* private mode */ }
  return h;
}
export function signupIg() {
  try { return String(ls()?.getItem(IG_KEY) || ""); } catch { return ""; }
}

