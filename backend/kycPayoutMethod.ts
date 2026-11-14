// v347 (owner: "KYC mein UPI dene ke baad bhi Earnings payout account maangta hai").
//
// The creator KYC form requires a UPI ID and saves it to creator_kyc.upi_id (also the
// verifications row's documents.upi_id and a mirror on creator_profiles.upi_id). The admin panel
// reads it from there and shows "Payout Linked", and the admin payout modal already falls back to
// it (adminMoney.pickPayoutAccount). But Earnings asks GET /creator/payment-methods, which reads
// only creator_payment_methods — empty for these creators — so Earnings said "Add a payout
// account" and POST /creator/payout-request-ready refused with NO_PAYOUT_METHOD.
//
// This file is the one answer to "what payout account did the creator give in KYC?":
//  - GET /creator/payment-methods/kyc → [] or [the KYC method] (source "kyc", is_default true,
//    UPI masked like refund accounts "ab***@bank", bank as last 4 only). The browser asks it only
//    when GET /creator/payment-methods is empty (src/lib/payoutMethods.js), so a method the
//    creator saves later always wins.
//  - creatorPayoutRequests.ts (payout-request-ready) accepts a KYC method the same way.
// GET /creator/payment-methods itself lives in payment_routes.ts, which is locked
// (scripts/protectedFlows.mjs) — so the fallback is a separate route, not a change there.
import { isRealVerificationRow } from "./creatorKyc";
import { parsePayoutMethod } from "./payoutMethods";
import { logIgnored } from "./logIgnored";

export type KycPayoutAccount = {
  method_type: "UPI" | "BANK";
  upi_id: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  account_holder_name: string | null;
  updated_at: string | null;
};

const str = (v: any) => (v === undefined || v === null ? "" : String(v).trim());
const up = (v: any) => str(v).toUpperCase();

/** Same mask the app already uses for UPI it shows back (ugcRefundAccounts.toPublicRefundAccount). */
export function maskUpi(upi: any): string | null {
  const u = str(upi);
  if (!u) return null;
  return `${u.slice(0, 2)}***@${u.split("@")[1] || ""}`;
}

/**
 * Pure. The payout account a creator gave in KYC, from the rows the KYC submit writes
 * (creators_routes.ts): creator_kyc first, else the newest real verifications row's documents,
 * else the creator_profiles mirror. UPI first (the form requires it); bank only when there is no
 * valid UPI. A REJECTED KYC does not count (the details may be what was wrong). Invalid values are
 * ignored, using the same rules as a saved method (parsePayoutMethod).
 */
export function kycPayoutFromRows(creatorKycRow: any, verificationRows: any[] = [], profile: any = null): KycPayoutAccount | null {
  if (up(creatorKycRow?.status) === "REJECTED") return null;
  const real = (verificationRows || []).filter(isRealVerificationRow);
  const v = real[0];
  if (!creatorKycRow && v && up(v.status) === "REJECTED") return null;
  let docs: any = v?.documents;
  if (typeof docs === "string") { try { docs = JSON.parse(docs); } catch { docs = null; } }
  if (!docs || typeof docs !== "object" || Array.isArray(docs)) docs = {};
  const holder = str(creatorKycRow?.bank_holder_name || docs.bank_holder_name || creatorKycRow?.full_name || docs.creator_name || profile?.beneficiary_name) || null;
  const updatedAt = creatorKycRow?.updated_at || creatorKycRow?.created_at || v?.updated_at || v?.created_at || null;

  for (const upi of [creatorKycRow?.upi_id, docs.upi_id, profile?.upi_id]) {
    const { row } = parsePayoutMethod({ method_type: "UPI", upi_id: str(upi) });
    if (row) return { method_type: "UPI", upi_id: row.upi_id, bank_account_number: null, bank_ifsc: null, account_holder_name: holder, updated_at: updatedAt };
  }
  const banks = [
    [creatorKycRow?.bank_account_no, creatorKycRow?.bank_ifsc],
    [docs.bank_account, docs.bank_ifsc],
    [profile?.bank_account_number, profile?.bank_ifsc],
  ];
  for (const [acc, ifsc] of banks) {
    const { row } = parsePayoutMethod({ method_type: "BANK", bank_account_number: str(acc), bank_ifsc: str(ifsc), account_holder_name: holder || "" });
    if (row) return { method_type: "BANK", upi_id: null, bank_account_number: row.bank_account_number, bank_ifsc: row.bank_ifsc, account_holder_name: holder, updated_at: updatedAt };
  }
  return null;
}

/** What the browser gets — same shape as toPublicPayoutMethod, never a full account number or full UPI. */
export function toPublicKycPayoutMethod(a: KycPayoutAccount | null) {
  if (!a) return null;
  const acc = str(a.bank_account_number);
  return {
    id: "kyc",
    method_type: a.method_type,
    upi_id: a.method_type === "UPI" ? maskUpi(a.upi_id) : null,
    upi_masked: a.method_type === "UPI",
    account_holder_name: a.account_holder_name || null,
    bank_ifsc: a.method_type === "BANK" ? a.bank_ifsc : null,
    account_last4: a.method_type === "BANK" && acc ? acc.slice(-4) : null,
    source: "kyc",
    is_default: true,
    updated_at: a.updated_at || null,
  };
}

/**
 * Reads the KYC payout account for one creator. `client` = privileged Supabase client; `local` =
 * local db fallback. Returns { account, error } — error is set when the lookup itself failed.
 */
export async function readKycPayoutAccount(client: any, local: any, creatorId: string): Promise<{ account: KycPayoutAccount | null; error: any }> {
  if (!creatorId) return { account: null, error: null };
  if (!client) {
    const ck = (local?.creator_kyc || []).find((k: any) => k.creator_id === creatorId || k.user_id === creatorId) || null;
    const vs = (local?.verifications || []).filter((v: any) => v.user_id === creatorId)
      .sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    const cp = (local?.creator_profiles || []).find((p: any) => p.user_id === creatorId) || null;
    return { account: kycPayoutFromRows(ck, vs, cp), error: null };
  }
  try {
    const { data: ck, error: e1 } = await client.from("creator_kyc").select("*").eq("creator_id", creatorId).maybeSingle();
    if (e1) throw e1;
    let account = kycPayoutFromRows(ck, [], null);
    if (account || up(ck?.status) === "REJECTED") return { account, error: null };
    const { data: vs, error: e2 } = await client.from("verifications").select("status, note, documents, created_at")
      .eq("user_id", creatorId).order("created_at", { ascending: false });
    if (e2) throw e2;
    // creator_profiles is only a mirror; a missing column must not break the lookup.
    let cp: any = null;
    try {
      const { data } = await client.from("creator_profiles").select("*").eq("user_id", creatorId).maybeSingle();
      cp = data || null;
    } catch (e: any) { logIgnored("kycPayoutMethod:profile", e); }
    account = kycPayoutFromRows(ck, vs || [], cp);
    return { account, error: null };
  } catch (e: any) {
    console.error("[kycPayoutMethod] lookup failed:", e?.message || e);
    return { account: null, error: e };
  }
}

export function setupKycPayoutMethodRoutes(router: any, { supabase, privilegedSupabase, getDb, parseAuthUser }: any) {
  router.get("/creator/payment-methods/kyc", async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user || String(user.role || "").toLowerCase() !== "creator") {
      return res.status(403).json({ error: "Only creators can access payment methods" });
    }
    const client = privilegedSupabase || supabase || null;
    const { account, error } = await readKycPayoutAccount(client, client ? null : getDb?.(), String(user.user_id));
    if (error) return res.status(503).json({ code: "PAYMENTS_UNAVAILABLE", error: "Payments couldn't be loaded right now. Please try again.", retry: true });
    const pub = toPublicKycPayoutMethod(account);
    return res.json(pub ? [pub] : []);
  });
}

/** Used by payout requests: the creator has a saved method, or a KYC payout account. */
export async function hasKycPayoutAccount(client: any, creatorId: string): Promise<boolean | null> {
  const { account, error } = await readKycPayoutAccount(client, null, creatorId);
  if (error) return null;
  return Boolean(account);
}
