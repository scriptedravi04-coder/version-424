// Session 24. Creator payout destination (UPI / bank) and the per-deal payout request.
//
// Before: GET /creator/payment-methods read only the local db_mock.json (lost on every Cloud
// Run restart, while the Supabase row stayed), returned the full account number to the browser,
// and POST saved anything without checking it (switching to UPI even kept the old bank fields).
// POST /creator/payout-request let any signed-in user set ANY deal's transaction to PROCESSING —
// including one already RELEASED/PAID — and /creator/payout-eligible-deals invented ₹5,000
// amounts and an 85% net.

export type PayoutMethodInput = {
  method_type?: string;
  account_details?: any;
  bank_account_number?: string;
  bank_ifsc?: string;
  upi_id?: string;
  account_holder_name?: string;
  bank_name?: string;
};

export type PayoutMethodRow = {
  bank_account_number: string | null;
  bank_ifsc: string | null;
  upi_id: string | null;
  account_holder_name: string | null;
};

const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^[0-9]{9,18}$/;

/** Validates and normalises a save request. Exactly one destination: UPI or bank, never a mix. */
export function parsePayoutMethod(body: PayoutMethodInput): { row?: PayoutMethodRow; error?: string } {
  const b = body || {};
  const d = b.account_details || {};
  const type = String(b.method_type || (b.upi_id ? "UPI" : "BANK")).toUpperCase();

  if (type === "UPI") {
    const upi = String(d.upi_id ?? b.upi_id ?? "").trim();
    if (!UPI_RE.test(upi)) return { error: "Enter a valid UPI ID, like name@bank." };
    return { row: { upi_id: upi, bank_account_number: null, bank_ifsc: null, account_holder_name: null } };
  }
  if (type !== "BANK") return { error: "Choose UPI or bank account." };

  const acc = String(d.account_no ?? d.account_number ?? b.bank_account_number ?? "").replace(/\s+/g, "");
  const ifsc = String(d.ifsc ?? b.bank_ifsc ?? "").trim().toUpperCase();
  const holder = String(d.holder_name ?? d.account_holder ?? b.account_holder_name ?? "").trim();
  if (!ACCOUNT_RE.test(acc)) return { error: "Account number should be 9 to 18 digits." };
  if (!IFSC_RE.test(ifsc)) return { error: "Enter a valid IFSC code, like HDFC0001234." };
  if (holder.length < 2) return { error: "Enter the account holder's name as per bank records." };
  return { row: { upi_id: null, bank_account_number: acc, bank_ifsc: ifsc, account_holder_name: holder } };
}

/** What the browser gets: never the full account number. */
export function toPublicPayoutMethod(m: any) {
  if (!m) return null;
  const acc = String(m.bank_account_number || "");
  const isUpi = Boolean(m.upi_id);
  return {
    id: m.id || null,
    method_type: isUpi ? "UPI" : "BANK",
    upi_id: m.upi_id || null,
    account_holder_name: m.account_holder_name || null,
    bank_ifsc: m.bank_ifsc || null,
    account_last4: acc ? acc.slice(-4) : null,
    updated_at: m.updated_at || m.created_at || null,
  };
}

const PAID = ["RELEASED", "PAID", "COMPLETED"];

/** Deal statuses where the brand has approved and the creator may ask to be paid. */
export const PAYOUT_READY_DEAL_STATUSES = ["COMPLETED", "APPROVED"];

/**
 * WHO + WHEN for a payout request on one deal. `deal` / `tx` are the server's own rows.
 * Returns null when allowed, else { status, error }.
 */
export function payoutRequestBlock(userId: string, deal: any, tx: any): { status: number; code: string; error: string } | null {
  if (!deal) return { status: 404, code: "DEAL_NOT_FOUND", error: "Deal not found." };
  const owner = String(deal.creator_id || deal.creatorId || "");
  if (!owner || owner !== String(userId)) return { status: 403, code: "NOT_YOUR_DEAL", error: "This deal is not yours." };
  if (!tx) return { status: 409, code: "NO_ESCROW", error: "There is no secure payment on record for this deal yet." };
  const ps = String(tx.payout_status || "").toUpperCase();
  if (PAID.includes(ps) || tx.utr_number || tx.payout_reference) {
    return { status: 409, code: "ALREADY_PAID", error: "This payout has already been released." };
  }
  // Session 56: money returned (or being returned) to the brand can't be asked for.
  const st = String(tx.status || "").toUpperCase();
  const rs = String(tx.refund_status || "").toUpperCase();
  if (st === "REFUNDED" || st === "REFUND_PENDING" || rs === "PROCESSED" || rs === "PENDING") {
    return { status: 409, code: "REFUNDED", error: "This payment was refunded to the brand." };
  }
  const ds = String(deal.status || "").toUpperCase();
  // Session 38 (Ravi): only after the brand approved the work. PROOF_SUBMITTED (live link sent,
  // brand not yet approved) used to be allowed.
  if (!PAYOUT_READY_DEAL_STATUSES.includes(ds)) {
    return { status: 409, code: "NOT_APPROVED", error: "The brand hasn't approved this deal yet." };
  }
  return null;
}

/** One row of /creator/payout-eligible-deals, with the field names desktop and mobile read. */
export function toEligibleDeal(d: any, tx: any) {
  const ps = String(tx?.payout_status || "").toUpperCase();
  const gross = Number(tx?.gross_amount ?? tx?.amount ?? d.agreed_amount ?? d.budget ?? 0) || 0;
  const netRaw = tx?.creator_net_amount ?? tx?.net_amount;
  const net = netRaw === undefined || netRaw === null ? null : Number(netRaw);
  const title = d.campaigns?.title || d.campaign_title || d.title || "Collab Campaign";
  return {
    id: d.id,
    deal_id: d.id,
    campaign_title: title,
    deal_title: title,
    brand_name: d.brand_name || d.brands?.name || null,
    agreed_amount: Number(d.agreed_amount ?? d.budget ?? 0) || 0,
    amount: gross,
    gross_amount: gross,
    // Only the server's own figure; null when there is none (the UI then shows no amount).
    creator_net_amount: net,
    net_amount: net,
    status: d.status,
    payout_status: ps || "PENDING",
    payout_requested: ps === "PROCESSING",
    has_escrow: Boolean(tx),
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
}

/** Paid-out deals are not "eligible"; neither are deals with no escrow payment. */
export function isEligibleForPayout(row: any) {
  return row.has_escrow && !PAID.includes(String(row.payout_status || "").toUpperCase());
}
