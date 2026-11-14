// Session 22. Fields a public profile must never show to other users.
const PRIVATE_KEY = /^(email|e_mail|phone|phone_number|mobile|whatsapp.*|contact_.*|personal_.*|bank.*|account.*|ifsc.*|upi.*|pan|pan_.*|aadhaar.*|aadhar.*|gst.*|gstin|address|full_address|pincode|password.*|.*_kyc.*|kyc.*|payout_.*|beneficiary.*|dob|date_of_birth)$/i;

// v378 (QA L2): admin-only / internal columns of creator_profiles, plus a safety net for new column names that sound
// private (secret, token, hash, note, internal, admin, kyc, bank, payout, address …) — a new sensitive column is
// hidden by default even if nobody adds it to the list above.
const INTERNAL_KEY = /^(managed_by_agency_id|is_platinum_override|review_eta_hours|reviewed_at|submitted_at|hidden_from_explore|session_token.*|.*_secret|.*_token|.*_hash|.*_notes?|admin_.*|internal_.*|.*_internal|private_.*|.*_private|.*_address|.*_pan|.*_aadhaar|.*_ifsc|.*_upi|.*_bank.*)$/i;
function isPrivateKey(k: string): boolean {
  return PRIVATE_KEY.test(k) || INTERNAL_KEY.test(k) || /(_email|_phone|_mobile)$/i.test(k);
}

// v346: strip private keys at EVERY depth (objects and arrays), not just one level. Before this,
// GET /api/creators/:id (no login) leaked e.g. rate_card.extras.phone. Public values (rate numbers,
// platform names etc.) are kept as they are — only private KEYS are dropped.
function stripDeep(v: any, depth: number, seen: WeakSet<object>): any {
  if (!v || typeof v !== "object") return v;
  if (v instanceof Date) return v;
  if (depth > 20 || seen.has(v)) return Array.isArray(v) ? [] : {};
  seen.add(v);
  if (Array.isArray(v)) return v.map((x) => stripDeep(x, depth + 1, seen));
  const out: any = {};
  for (const [k, val] of Object.entries(v)) {
    if (isPrivateKey(k)) continue;
    out[k] = stripDeep(val, depth + 1, seen);
  }
  return out;
}

export function stripPrivateProfileFields<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  return stripDeep(obj, 0, new WeakSet()) as T;
}
