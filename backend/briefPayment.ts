// Session 24. Which local transaction rows make a Razorpay order "already used" for a UGC brief.
//
// Order of calls when a brand posts a brief: create-order → Razorpay checkout →
// /payments/razorpay/verify (persistEscrowPayment writes a LOCAL row with this razorpay_order_id
// but no brief/deal/order, because the brief doesn't exist yet) → POST /ugc/briefs. The reuse
// check counted that unlinked row, so the brief was always refused after a successful payment.

const sameOrder = (t: any, orderId: string) =>
  Boolean(orderId) && (t?.razorpay_order_id === orderId || t?.zaakpay_order_id === orderId);

/** A row for this order that already funds a brief, deal or UGC order. */
export function isPaymentFundingSomething(t: any, orderId: string): boolean {
  return sameOrder(t, orderId) && Boolean(t?.brief_id || t?.deal_id || t?.ugc_order_id);
}

/** The verify-step row for this order that nothing claimed yet. */
export function isUnlinkedPaymentRow(t: any, orderId: string): boolean {
  return sameOrder(t, orderId) && !t?.brief_id && !t?.deal_id && !t?.ugc_order_id;
}
