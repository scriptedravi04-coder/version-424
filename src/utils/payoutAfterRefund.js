// v346: what the admin still owes the creator after a PART refund to the brand.
// Same rule as the server (backend/adminMoney.ts netAfterPartialRefund): only a PROCESSED refund counts,
// payable = max(0, creator net − refunded part).

/** The refunded part (₹) that comes off the creator's payout, or 0. */
export function refundedPart(tx) {
  const refunded = Number(tx?.refund_amount) || 0;
  if (!tx || String(tx.refund_status || "").toUpperCase() !== "PROCESSED" || refunded <= 0) return 0;
  return refunded;
}

/** Creator payout still to send. `net` defaults to the row's creator_net_amount. */
export function payableAfterRefund(tx, net = Number(tx?.creator_net_amount) || 0) {
  const r = refundedPart(tx);
  if (!r) return Number(net) || 0;
  return Math.max(0, Math.round((Number(net) || 0) - r));
}
