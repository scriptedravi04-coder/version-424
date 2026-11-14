// Session 24. One answer to "has this creator passed KYC?" for the server.
//
// Before: server.ts isCreatorKycVerified read creator_kyc by `user_id` — that table is keyed by
// `creator_id` (admin approval, /verifications/me). The query errored, the helper "failed open",
// and the campaign-apply KYC gate let everyone through. It also trusted `users.verified`, which is
// set by a password reset (email ownership) and by public creator imports — not by KYC.
//
// Now: approved only when the admin's KYC decision says so — `creator_kyc.status` (by creator_id)
// or a real (non-onboarding) `verifications` row with status approved.

export type KycStatus = "APPROVED" | "PENDING" | "REJECTED" | "NONE" | "UNKNOWN";

const APPROVED = ["APPROVED", "VERIFIED", "APPROVE", "SUCCESS"];
const REJECTED = ["REJECTED", "DECLINED", "DENIED"];

function norm(v: any): KycStatus | null {
  const s = String(v || "").toUpperCase();
  if (!s) return null;
  if (APPROVED.includes(s)) return "APPROVED";
  if (REJECTED.includes(s)) return "REJECTED";
  return "PENDING";
}

/** Same filter /verifications/me uses: onboarding auto-rows are not a KYC submission. */
export function isRealVerificationRow(r: any): boolean {
  if (!r) return false;
  if (r.note === "Auto-submitted during onboarding") return false;
  const d = r.documents;
  if (!d) return true;
  if (Array.isArray(d)) return !d.includes("Onboarding Profile") && !d.includes("Corporate Registration");
  if (typeof d === "string") return !d.includes("Onboarding Profile") && !d.includes("Corporate Registration");
  return true;
}

/**
 * Same priority as GET /verifications/me (what the creator sees): creator_kyc first, else the
 * newest real verifications row. Server and screen must agree on "approved".
 */
export function resolveKycStatus(creatorKycRow: any, verificationRows: any[]): KycStatus {
  const a = norm(creatorKycRow?.status);
  const real = (verificationRows || []).filter(isRealVerificationRow);
  const b = real.length ? norm(real[0]?.status) : null; // rows come newest first
  return a || b || "NONE";
}

/**
 * `client` = Supabase client (privileged). `local` = the local db fallback. Returns UNKNOWN when
 * the lookup itself failed — callers decide (UGC claim refuses and asks to retry).
 */
export async function getCreatorKycStatus(client: any, local: any, creatorId: string): Promise<KycStatus> {
  if (!creatorId) return "NONE";
  if (!client) {
    const ck = (local?.creator_kyc || []).find((k: any) => k.creator_id === creatorId || k.user_id === creatorId);
    const vs = (local?.verifications || []).filter((v: any) => v.user_id === creatorId);
    const s = resolveKycStatus(ck, vs);
    // Local dev without a database keeps working.
    return s === "NONE" ? "APPROVED" : s;
  }
  try {
    const { data: ck, error: e1 } = await client.from("creator_kyc").select("status").eq("creator_id", creatorId).maybeSingle();
    if (e1) throw e1;
    const { data: vs, error: e2 } = await client
      .from("verifications").select("status, note, documents, created_at")
      .eq("user_id", creatorId).order("created_at", { ascending: false });
    if (e2) throw e2;
    return resolveKycStatus(ck, vs || []);
  } catch (e: any) {
    console.error("[getCreatorKycStatus] lookup failed:", e?.message || e);
    return "UNKNOWN";
  }
}

/**
 * Session 28 (Ravi: "KYC is done but Launch says complete KYC"). Brand version of the same rule.
 * Same priority as GET /verifications/me for a brand (what the dashboard badge shows):
 * brand_kyc (by brand_id) first, else the newest real verifications row. The campaign gate used
 * to read brand_kyc only, so a brand approved through the verifications table saw
 * "Approved Partner" on the dashboard and "complete your KYC" on Launch.
 */
export async function getBrandKycStatus(client: any, local: any, brandId: string): Promise<KycStatus> {
  if (!brandId) return "NONE";
  if (!client) {
    const bk = (local?.brand_kyc || []).find((k: any) => k.brand_id === brandId || k.id === brandId);
    const vs = (local?.verifications || []).filter((v: any) => v.user_id === brandId);
    const s = resolveKycStatus(bk, vs);
    return s === "NONE" ? "APPROVED" : s; // local dev without a database keeps working
  }
  try {
    const { data: bk, error: e1 } = await client.from("brand_kyc").select("status").eq("brand_id", brandId).maybeSingle();
    if (e1) throw e1;
    const { data: vs, error: e2 } = await client
      .from("verifications").select("status, note, documents, created_at")
      .eq("user_id", brandId).order("created_at", { ascending: false });
    if (e2) throw e2;
    return resolveKycStatus(bk, vs || []);
  } catch (e: any) {
    console.error("[getBrandKycStatus] lookup failed:", e?.message || e);
    return "UNKNOWN";
  }
}

/** The flags the browser also trusts (AuthContext.isKycApproved). */
export function userFlagsSayKycApproved(user: any): boolean {
  return Boolean(user?.kyc_verified === true || String(user?.kyc_status || "").toUpperCase() === "APPROVED");
}
