// Session 36: remember who invited this visitor (ybexmedia.in/r/<CODE> or ?ref=) and any creator code
// from a link (ybexmedia.in/code/<CODE>), so they are applied after sign-up / on the /apply form.
const REF_KEY = "ybex_ref";
const CODE_KEY = "ybex_creator_code";
const MAX_AGE = 30 * 24 * 3600 * 1000;

const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify({ v, at: Date.now() })); } catch { /* private mode */ } };
const get = (k) => {
  try {
    const x = JSON.parse(localStorage.getItem(k) || "null");
    if (!x || Date.now() - Number(x.at) > MAX_AGE) return "";
    return String(x.v || "");
  } catch { return ""; }
};
const drop = (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

export const cleanCode = (c) => String(c || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40);
export function rememberReferral(code) { const c = cleanCode(code); if (c && !get(REF_KEY)) put(REF_KEY, c); } // first inviter wins
export function storedReferral() { return get(REF_KEY); }
export function forgetReferral() { drop(REF_KEY); }
export function rememberCreatorCode(code) { const c = cleanCode(code); if (c) put(CODE_KEY, c); }
export function storedCreatorCode() { return get(CODE_KEY); }
export function forgetCreatorCode() { drop(CODE_KEY); }
export function captureRefFromUrl(search = typeof window !== "undefined" ? window.location.search : "") {
  try { const p = new URLSearchParams(search); const r = p.get("ref") || p.get("referral_code"); if (r) rememberReferral(r); } catch { /* ignore */ }
}
