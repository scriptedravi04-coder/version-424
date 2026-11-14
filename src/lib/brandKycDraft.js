// v347 (owner: "Brand KYC form refresh karne par khaali ho jaata hai").
// Per-user autosave of the brand KYC TEXT fields (src/lib/userDraft.js keys it by the signed-in
// user). Never saved: the uploaded proof document link, OTPs. Restored only when the server has
// no KYC for this brand (or a REJECTED one the brand is fixing, and the draft is newer) — a
// pending / approved KYC always loads from the server. Cleared after a successful submit.
import { draftGet, draftSet, draftRemove } from "./userDraft";

export const BRAND_KYC_DRAFT = "brand_kyc_draft";
export const BRAND_KYC_DRAFT_FIELDS = [
  "businessType", "companyName", "siteUrl", "gst", "pan",
  "pocName", "pocEmail", "pocPhone", "pocDesignation",
];

/** Pure: only the text fields, as length-capped strings. */
export function pickBrandKycDraftFields(f) {
  const out = {};
  for (const k of BRAND_KYC_DRAFT_FIELDS) {
    const v = f?.[k];
    if (typeof v === "string") out[k] = v.slice(0, 500);
  }
  if (out.businessType && !["registered", "solo"].includes(out.businessType)) delete out.businessType;
  return out;
}

const hasTyped = (fields) => Object.entries(fields || {}).some(([k, v]) => k !== "businessType" && String(v || "").trim());

export function saveBrandKycDraft(f, step) {
  const fields = pickBrandKycDraftFields(f);
  if (!hasTyped(fields)) return;
  try {
    draftSet(BRAND_KYC_DRAFT, JSON.stringify({ v: 1, saved_at: new Date().toISOString(), step: ["business", "contact"].includes(step) ? step : null, fields }));
  } catch { /* ignore */ }
}

export function loadBrandKycDraft() {
  try {
    const raw = draftGet(BRAND_KYC_DRAFT);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || typeof d !== "object" || !d.fields) return null;
    const fields = pickBrandKycDraftFields(d.fields);
    return hasTyped(fields) ? { ...d, fields } : null;
  } catch { return null; }
}

export function clearBrandKycDraft() {
  try { draftRemove(BRAND_KYC_DRAFT); } catch { /* ignore */ }
}

/**
 * Pure: may this draft fill the form? `record` = the server's KYC (null when not submitted).
 * Pending / approved → never (the server is the truth). Rejected → only a draft saved after the
 * server's last update (the brand was fixing it and refreshed).
 */
export function shouldRestoreBrandKycDraft(record, draft) {
  if (!draft) return false;
  if (!record) return true;
  if (String(record.status || "").toUpperCase() !== "REJECTED") return false;
  const serverAt = Date.parse(record.updated_at || record.reviewed_at || record.created_at || "");
  const draftAt = Date.parse(draft.saved_at || "");
  return Number.isFinite(serverAt) && Number.isFinite(draftAt) && draftAt > serverAt;
}

/** Pure: the form with the draft's non-empty values on top. */
export function applyBrandKycDraft(base, draft) {
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(draft?.fields || {})) {
    if (String(v || "").trim() || k === "businessType") out[k] = v;
  }
  return out;
}
