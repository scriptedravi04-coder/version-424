// Session 38 (Ravi: "PHELE YE SAB THEEK KRO"). Admin money rules in one place, kept pure so
// they are tested on their own (backend/adminMoney.test.ts).

const up = (v: any) => String(v ?? "").trim().toUpperCase();

/** Money already sent to the creator.
 *  Session 56 (payment audit): RELEASED alone is NOT paid out. Brand approval writes RELEASED
 *  ("released to the payout queue", campaign_lifecycle.ts / ugcLifecycleService.ts) — nothing has
 *  reached the creator's bank yet. Counting it as paid made the admin desk refuse every approved
 *  payout with "already marked paid", so creators could never be paid. Paid out = the admin marked
 *  it PAID / COMPLETED, or a UTR / payout reference is on it. */
export function isPaidOut(tx: any): boolean {
  if (!tx) return false;
  const ps = up(tx.payout_status);
  return ["PAID", "COMPLETED"].includes(ps) || Boolean(String(tx.payout_reference || tx.utr_number || "").trim());
}

/** Session 56: a UGC brief's deposit row (brief_id only). The money for each creator is paid out
 *  through that creator's own order row, so the deposit itself is never paid out, refunded here or
 *  counted as "held" (that would count the same money twice once orders are approved). UGC refunds
 *  go through the UGC Refunds queue. */
export function isBriefDeposit(tx: any): boolean {
  return Boolean(tx && tx.brief_id && !tx.deal_id && !tx.ugc_order_id);
}

/** A refund to the brand has been started but not finished. */
export function isRefundInProgress(tx: any): boolean {
  if (!tx) return false;
  return up(tx.status) === "REFUND_PENDING" || up(tx.refund_status) === "PENDING";
}

/** The brand's money really arrived for this row. */
export function isFunded(tx: any): boolean {
  if (!tx) return false;
  return ["SUCCESS", "ESCROW_HELD", "PAID", "PROCESSED", "ACTIVE"].includes(up(tx.status));
}

/** Money already returned to the brand (or the refund is on its way). */
export function isRefunded(tx: any): boolean {
  if (!tx) return false;
  // Session 58: a PART refund (e.g. ₹2,000 of ₹20,000) is not "refunded" — the rest can still be paid out.
  // v366: only the DEAL part counts (a service-fee refund comes out of Ybex's fee and leaves the deal payable).
  const gross = Number(tx.gross_amount) || 0;
  const dealPart = dealRefundedSoFar(tx);
  // (a PROCESSED refund with no amount is an old full refund, as before)
  const partial = up(tx.refund_status) === "PROCESSED" && gross > 0 && Number(tx.refund_amount) > 0 && dealPart < gross - 0.5;
  return up(tx.status) === "REFUNDED" || up(tx.payout_status) === "REFUNDED" || (up(tx.refund_status) === "PROCESSED" && !partial);
}

/** Brand money the platform is holding right now: paid in, not paid out, not refunded. */
export function isEscrowHeld(tx: any): boolean {
  if (!tx || isBriefDeposit(tx)) return false;
  const st = up(tx.status);
  if (st !== "SUCCESS" && st !== "ESCROW_HELD") return false;
  return !isPaidOut(tx) && !isRefunded(tx);
}

/** The creator has asked for this payout and it has not been sent yet. */
export function isPayoutRequested(tx: any): boolean {
  if (!tx || isBriefDeposit(tx) || isPaidOut(tx) || isRefunded(tx)) return false;
  return tx.payout_requested === true || up(tx.payout_status) === "PROCESSING";
}

type Block = { status: number; code: string; error: string } | null;

/** Admin "Mark payout paid": refuse a second payout and a payout on refunded money. */
export function payoutReleaseBlock(tx: any): Block {
  if (!tx) return null; // the route resolves the creator/amount from the deal itself
  if (isBriefDeposit(tx)) {
    return { status: 409, code: "BRIEF_DEPOSIT", error: "This is a UGC brief deposit. Creators are paid per order once the brand approves their video." };
  }
  if (isRefunded(tx)) {
    return { status: 409, code: "ALREADY_REFUNDED", error: "This payment was refunded to the brand, so it can't be paid out to the creator." };
  }
  if (isPaidOut(tx)) {
    const ref = String(tx.payout_reference || tx.utr_number || "").trim();
    return { status: 409, code: "ALREADY_PAID", error: `This payout is already marked paid${ref ? ` (UTR ${ref})` : ""}.` };
  }
  // Session 56: not while a refund to the brand is on its way, and not for a payment that never came in.
  if (isRefundInProgress(tx)) {
    return { status: 409, code: "REFUND_IN_PROGRESS", error: "A refund to the brand is in progress for this payment, so it can't be paid out." };
  }
  if (!isFunded(tx)) {
    return { status: 409, code: "NOT_FUNDED", error: "The brand's payment for this deal hasn't been received, so there is nothing to pay out." };
  }
  return null;
}

/** Admin campaign refund: never more than was paid, never after the creator was paid, never twice. */
export function refundBlock(tx: any, amount: number, targetStatus: string, from: string = "deal"): Block {
  if (!tx) return null;
  // v365: a service-fee refund can't be more than the fee the brand paid
  if (from === "fee") {
    const fee = serviceFeePaid(tx);
    if (!(fee > 0)) return { status: 400, code: "NO_SERVICE_FEE", error: "This payment has no service fee to refund." };
    if (Number(amount) > fee + 0.005) return { status: 400, code: "REFUND_TOO_HIGH", error: `A service-fee refund can't be more than the fee paid (₹${fee.toLocaleString("en-IN")}).` };
  }
  if (isBriefDeposit(tx)) {
    return { status: 409, code: "BRIEF_DEPOSIT", error: "UGC brief money is refunded from the UGC Refunds queue, not here." };
  }
  if (isPaidOut(tx)) {
    return { status: 409, code: "ALREADY_PAID_OUT", error: "The creator has already been paid for this deal, so it can't be refunded here." };
  }
  // v366 (Ravi: "service fee refund ke baad deal ka refund block ho jata hai — fix karo"): a refund can follow an earlier
  // PART refund, up to what is left of what the brand paid. Still refused: a fully refunded payment, and a refund that is
  // still PENDING (finish that one first).
  // v396 (QA M-3): after the whole DEAL amount went back, the brand's service fee (split model) could never be refunded —
  // the row is REFUNDED. A fee refund is still allowed while some of the fee is left.
  const feeStillLeft = from === "fee" && Math.max(0, serviceFeePaid(tx) - feeRefundedSoFar(tx)) > 0.5 && refundableLeft(tx) > 0.5;
  if (!feeStillLeft && (up(tx.status) === "REFUNDED"
    || (up(tx.refund_status) === "PROCESSED" && (!(Number(tx.refund_amount) > 0) || refundableLeft(tx) <= 0.5)))) { // old full refund / nothing left
    return { status: 409, code: "ALREADY_REFUNDED", error: "This payment is already fully refunded." };
  }
  // A PENDING refund is being completed (or corrected): the amount sent is the new TOTAL refunded — checked against paid below.
  const completingPending = up(tx.refund_status) === "PENDING" || up(tx.status) === "REFUND_PENDING";
  // v365 (deep test): with the split fee the brand paid the deal amount + service fee (brand_paid_amount) — the admin may
  // refund up to that (Ravi: "admin mai option, main manually bharunga"); older payments: the deal amount as before.
  const paid = paidByBrand(tx);
  const left = refundableLeft(tx);
  if (from === "fee" && !completingPending) {
    const feeLeft = Math.max(0, serviceFeePaid(tx) - feeRefundedSoFar(tx));
    if (Number(amount) > feeLeft + 0.005) return { status: 400, code: "REFUND_TOO_HIGH", error: `Only ₹${feeLeft.toLocaleString("en-IN")} of the service fee is left to refund.` };
  }
  if (!completingPending && refundedSoFar(tx) > 0 && Number(amount) > left + 0.005) {
    return { status: 400, code: "REFUND_TOO_HIGH", error: `Already refunded ₹${refundedSoFar(tx).toLocaleString("en-IN")} · only ₹${left.toLocaleString("en-IN")} can still be refunded.` };
  }
  // Session 56: nothing to refund when no money arrived (or the amount is unknown).
  // v418 (QA v406 M-3): after a FULL deal refund the row is REFUNDED (not "funded") but the brand's service fee is
  // still with us — let that fee refund through (feeStillLeft already caps it to the fee that is left).
  if (!isFunded(tx) && up(tx.status) !== "REFUND_PENDING" && !(feeStillLeft && up(tx.status) === "REFUNDED")) {
    return { status: 409, code: "NOT_FUNDED", error: "No payment was received for this deal, so there is nothing to refund." };
  }
  if (!(paid > 0)) {
    return { status: 409, code: "NO_AMOUNT", error: "The paid amount for this deal is unknown — check the payment before refunding." };
  }
  if (Number(amount) > paid + 0.005) {
    return { status: 400, code: "REFUND_TOO_HIGH", error: `Refund can't be more than the amount paid (₹${paid.toLocaleString("en-IN")}).` };
  }
  void targetStatus;
  return null;
}

/**
 * Where to send a creator's payout. The creator's own saved method (Earnings → payout details,
 * table creator_payment_methods) wins; profile / KYC fields fill in only when it is missing.
 * Exactly one destination comes from the saved method: UPI or bank, never a mix.
 */
export function pickPayoutAccount(method: any, profile: any, kyc: any) {
  if (method && (method.upi_id || method.bank_account_number)) {
    const isUpi = Boolean(method.upi_id);
    return {
      account_holder_name: method.account_holder_name || profile?.name || kyc?.full_name || null,
      bank_name: isUpi ? null : (method.bank_name || null),
      account_number: isUpi ? null : method.bank_account_number,
      ifsc_code: isUpi ? null : (method.bank_ifsc || null),
      upi_id: isUpi ? method.upi_id : null,
      verified: true,
      source: "creator_payment_methods",
    };
  }
  if (!profile && !kyc) return null;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      if (profile?.[k]) return profile[k];
      if (kyc?.[k]) return kyc[k];
    }
    return null;
  };
  const upi = pick("upi_id", "vpa");
  const acct = pick("bank_account_number", "account_number", "bank_account_no");
  return {
    account_holder_name: pick("beneficiary_name", "account_holder_name", "bank_holder_name", "full_name"),
    bank_name: pick("bank_name"),
    account_number: acct,
    ifsc_code: pick("bank_ifsc", "ifsc_code"),
    upi_id: upi,
    verified: Boolean(profile?.payout_verified || profile?.bank_verified || upi || acct),
    source: "profile",
  };
}

/**
 * Supabase returns at most 1000 rows per request. Reads every page.
 * `makeQuery(from, to)` must build a fresh query each time (a used builder can't be reused).
 */
export async function fetchAllRows(makeQuery: (from: number, to: number) => any, pageSize = 1000, maxRows = 100000): Promise<{ data: any[]; error: any }> {
  const out: any[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await makeQuery(from, from + pageSize - 1);
    if (error) return { data: out, error };
    const rows = Array.isArray(data) ? data : [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return { data: out, error: null };
}

/** Session 58: what is left for the creator after a PART refund to the brand (creator net minus the refunded part). */
/** v365: a refund of the brand's own service fee (split model) — it comes out of Ybex's fee, never the creator's pay. */
export const SERVICE_FEE_REFUND_TAG = "[service-fee refund]";
/** v366: "[service-fee refund]" optionally followed by "fee ₹<total>" (v365 notes had only the tag). */
const FEE_PART_RE = /^\[service-fee refund\](?:\s*fee ₹(\d+(?:\.\d+)?))?\s*/;
export const isServiceFeeRefund = (tx: any) => String(tx?.fee_correction_note || "").startsWith(SERVICE_FEE_REFUND_TAG);
/** v365: the most that can be refunded from the brand's service fee (fee + GST on it). */
export const serviceFeePaid = (tx: any) => Math.max(0, (Number(tx?.brand_fee_amount) || 0) + (Number(tx?.brand_fee_gst) || 0));
/** v366: everything the brand paid for this row (deal + service fee), else the deal amount (older payments). */
export const paidByBrand = (tx: any) => (String(tx?.zaakpay_order_id || "").startsWith("order_inhouse_") ? 0 : Number(tx?.brand_paid_amount) > 0 ? Number(tx.brand_paid_amount) : (Number(tx?.gross_amount ?? tx?.amount ?? 0) || 0)); // v419: Ybex in-house deals bring in no money
/** v366: refund_amount is the running TOTAL returned to the brand (PROCESSED refunds; a PENDING one counts too). */
export const refundedSoFar = (tx: any) => (["PROCESSED", "PENDING"].includes(up(tx?.refund_status)) ? Math.max(0, Number(tx?.refund_amount) || 0) : 0);
/** v366: the service-fee part of refundedSoFar. Written as "[service-fee refund] fee ₹800 · reason"; a v365 note without the number was
 *  a fee-only refund, so all of refund_amount was fee. */
export function feeRefundedSoFar(tx: any): number {
  const note = String(tx?.fee_correction_note || "");
  if (!note.startsWith(SERVICE_FEE_REFUND_TAG)) return 0;
  const m = FEE_PART_RE.exec(note);
  return Math.min(refundedSoFar(tx), m && m[1] ? Number(m[1]) : refundedSoFar(tx));
}
/** v366: the deal part of refundedSoFar (this is what comes off the creator's payout). */
export const dealRefundedSoFar = (tx: any) => Math.max(0, refundedSoFar(tx) - feeRefundedSoFar(tx));
/** v366: what can still be refunded (never more than the brand paid in total). */
export const refundableLeft = (tx: any) => Math.max(0, Math.round((paidByBrand(tx) - refundedSoFar(tx)) * 100) / 100);
/** v366: fee_correction_note for a refund — keeps the running fee part in the tag so later refunds split correctly. */
export function refundNote(tx: any, from: "fee" | "deal", amount: number, note: string | null): string | null {
  const feeTotal = feeRefundedSoFar(tx) + (from === "fee" ? Math.max(0, Number(amount) || 0) : 0);
  const strip = (v: any) => String(v || "").replace(FEE_PART_RE, "").replace(/^\s*·\s*/, "").trim();
  const old = strip(tx?.fee_correction_note);
  const fresh = strip(note);
  const text = [fresh, old && old !== fresh ? old : ""].filter(Boolean).join(" · ") || "";
  return feeTotal > 0 ? `${SERVICE_FEE_REFUND_TAG} fee ₹${Math.round(feeTotal * 100) / 100}${text ? " · " + text : ""}` : (text || null);
}
export function netAfterPartialRefund(tx: any, net: number): number {
  if (!tx || up(tx.refund_status) !== "PROCESSED") return net;
  const dealPart = dealRefundedSoFar(tx); // v365/v366: the service-fee part never touches the creator's pay
  if (dealPart <= 0) return net;
  return Math.max(0, Math.round((Number(net) || 0) - dealPart));
}

/** v396 (QA M-1): what the CREATOR should see as their net on a transaction after a processed part refund, or null when
 *  nothing changes. Some flows already store the reduced net (campaign_lifecycle.ts, v389) and others don't (admin payout),
 *  so it only takes the refund off when the stored net is still the full one (gross − fee [− GST]). Pure. */
export function creatorShownNet(tx: any): number | null {
  if (!tx || up(tx.refund_status) !== "PROCESSED") return null;
  const dealPart = dealRefundedSoFar(tx);
  if (!(dealPart > 0)) return null;
  const net = Number(tx.creator_net_amount);
  const gross = Number(tx.gross_amount);
  if (!Number.isFinite(net) || !Number.isFinite(gross) || gross <= 0) return null;
  const fee = Number(tx.platform_fee_amount) || 0, gst = Number(tx.gst_amount) || 0;
  const full = Math.abs(net - (gross - fee - gst)) <= 1 || Math.abs(net - (gross - fee)) <= 1;
  return full ? Math.max(0, Math.round(net - dealPart)) : null;
}

/** v396 (QA M-1): fix creator_net_amount in an API answer meant for a creator (Earnings, escrow list, chat chip …).
 *  Walks objects / arrays (bounded); the full value stays in creator_net_amount_before_refund. Returns the same body. */
export function applyCreatorNetAfterRefund(body: any, depth = 0, refundRows?: Map<string, any>): any {
  if (!body || typeof body !== "object" || depth > 6) return body;
  if (Array.isArray(body)) { for (let i = 0; i < Math.min(body.length, 3000); i++) applyCreatorNetAfterRefund(body[i], depth + 1, refundRows); return body; }
  const extra = refundRows && body.id != null && !("refund_status" in body) ? refundRows.get(String(body.id)) : null;
  if ("creator_net_amount" in body && ("refund_status" in body || extra)) {
    const shown = creatorShownNet(extra ? { ...extra, ...body, refund_status: extra.refund_status, refund_amount: extra.refund_amount, fee_correction_note: extra.fee_correction_note, platform_fee_amount: body.platform_fee_amount ?? extra.platform_fee_amount, gst_amount: body.gst_amount ?? extra.gst_amount } : body);
    if (shown != null && shown !== Number(body.creator_net_amount)) {
      body.creator_net_amount_before_refund = body.creator_net_amount;
      body.creator_net_amount = shown;
    }
  }
  for (const k of Object.keys(body)) { const v = body[k]; if (v && typeof v === "object") applyCreatorNetAfterRefund(v, depth + 1, refundRows); }
  return body;
}

/** v396 (QA M-1): ids of transaction-like rows in an answer that carry a net but no refund fields (some locked routes
 *  answer with a trimmed row). Bounded walk. */
export function idsMissingRefund(body: any, out: Set<string> = new Set(), depth = 0): Set<string> {
  if (!body || typeof body !== "object" || depth > 6 || out.size >= 500) return out;
  if (Array.isArray(body)) { for (let i = 0; i < Math.min(body.length, 3000); i++) idsMissingRefund(body[i], out, depth + 1); return out; }
  if ("creator_net_amount" in body && !("refund_status" in body) && body.id != null && "gross_amount" in body) out.add(String(body.id));
  for (const k of Object.keys(body)) { const v = body[k]; if (v && typeof v === "object") idsMissingRefund(v, out, depth + 1); }
  return out;
}
