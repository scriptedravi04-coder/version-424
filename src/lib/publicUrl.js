// Session 43: every link people share — invite, referral, profile, campaign, install — is built
// from ONE place. Ravi (v292, was version80 in v281 / version270 in v273): the live app IS https://ybexapp.ai.studio, so by default the
// links use the address the app is open on. To force another address later (own domain), set
// VITE_PUBLIC_SITE_URL at build time — then every shared link uses that instead.
const FORCED = String(
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_PUBLIC_SITE_URL) || ""
).replace(/\/+$/, "");

export const PUBLIC_SITE_URL = FORCED || "https://ybexapp.ai.studio";

export function publicOrigin() {
  if (FORCED) return FORCED;
  if (typeof window !== "undefined" && window.location && /^https?:/.test(window.location.origin)) return window.location.origin;
  return PUBLIC_SITE_URL;
}
