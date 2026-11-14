// Session 58 (Ravi: "payout mai glitch, ek ko hi 2 count kr raha hai"). The live `transactions` table
// fills new rows with refund_status = 'NONE' and refund_amount = 0 by default. Several checks read
// "any refund_status at all" as "this row is a refund", so every real payment row looked like a refund:
// on approval the deposit row was skipped and a SECOND payout row was inserted (one deal counted twice).
// One rule for everyone: a row is a refund only if it really carries a refund.
const up = (v: any) => String(v ?? "").trim().toUpperCase();
const NO_REFUND = new Set(["", "NONE", "NULL", "NA", "N/A", "NOT_REQUESTED"]);

/** True only when the row really holds a refund (amount > 0, a real refund status, or a refund date). */
export function hasRefund(tx: any): boolean {
  if (!tx) return false;
  if (Number(tx.refund_amount) > 0) return true;
  if (!NO_REFUND.has(up(tx.refund_status))) return true;
  return Boolean(tx.refunded_at);
}
