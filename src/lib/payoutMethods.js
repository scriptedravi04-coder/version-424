// v347 (owner: "KYC mein UPI dene ke baad bhi Earnings payout account maangta hai").
// The creator's payout accounts as every screen should see them: what they saved in Earnings
// (GET /creator/payment-methods) wins; when that is empty, the UPI / bank they gave in KYC
// (GET /creator/payment-methods/kyc → source "kyc", is_default, UPI masked) counts, so nobody is
// asked to add an account twice. A failure of the main read still throws (callers show
// "couldn't load"); a failure of the KYC read just means "none from KYC".
import { api } from "./api";

export const isKycPayoutMethod = (m) => String(m?.source || "") === "kyc";

/** Pure: saved methods win; else the KYC one. */
export function mergePayoutMethods(saved, fromKyc) {
  const own = Array.isArray(saved) ? saved.filter(Boolean) : [];
  if (own.length) return own;
  return (Array.isArray(fromKyc) ? fromKyc : []).filter((m) => m && (m.upi_id || m.account_last4)).slice(0, 1);
}

export async function fetchPayoutMethods(opts = { bypassCache: true }) {
  const { data } = await api.get("creator/payment-methods", opts);
  const saved = Array.isArray(data) ? data : [];
  if (saved.length) return saved;
  const fromKyc = await api.get("creator/payment-methods/kyc", opts).then((r) => r?.data).catch(() => []);
  return mergePayoutMethods(saved, fromKyc);
}

/** Short label: "UPI · ab***@okaxis (from KYC)" / "Bank ••1234". */
export function payoutMethodLabel(m) {
  if (!m) return "";
  const base = m.upi_id ? `UPI · ${m.upi_id}` : `Bank ••${m.account_last4 || ""}`;
  return isKycPayoutMethod(m) ? `${base} (from KYC)` : base;
}
