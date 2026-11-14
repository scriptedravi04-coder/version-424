// Session 24. The creator's KYC status from GET /verifications/me, as one of
// "APPROVED" | "PENDING" | "REJECTED" | "NONE". Same meaning as backend/creatorKyc.ts.
export function normalizeKycStatus(v) {
  if (!v) return "NONE";
  const s = String(v.status || v.kyc_status || "").toUpperCase();
  if (!s) return "NONE";
  if (["APPROVED", "VERIFIED", "APPROVE", "SUCCESS"].includes(s)) return "APPROVED";
  if (["REJECTED", "DECLINED", "DENIED"].includes(s)) return "REJECTED";
  if (s === "NOT_SUBMITTED" || s === "NONE") return "NONE";
  return "PENDING";
}
