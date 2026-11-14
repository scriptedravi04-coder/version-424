// Session 21. A cancelled UGC order is refunded through Razorpay.
//
// Before: cancel wrote a refund row with refund_status 'PROCESSED' and told the chat "Escrow
// funds of ₹X have been refunded" — and no money moved. The brand's payment stayed with the
// platform and nobody was told to return it.
//
// Now: the brief's Razorpay order → its captured payment → a partial refund of this order's
// share. refund_status is 'PROCESSED' only when Razorpay accepted the refund; anything else is
// 'PENDING' (an admin refunds by hand) and the caller alerts the admins. Only those two values
// are used — they are the ones the code (and so the DB constraint) already knows.

export type RefundOutcome = {
  refund_status: "PROCESSED" | "PENDING";
  razorpay_refund_id?: string;
  razorpay_payment_id?: string;
  reason?: string;
};

type Deps = {
  getRazorpay: () => any;
  isTestMode: () => boolean;
};

export async function refundUgcOrder(
  deps: Deps,
  { razorpayOrderId, amount, orderId }: { razorpayOrderId?: string | null; amount: number; orderId: string }
): Promise<RefundOutcome> {
  const paise = Math.round(Number(amount) * 100);
  if (!(paise > 0)) return { refund_status: "PENDING", reason: "No refundable amount on the order." };
  if (!razorpayOrderId) return { refund_status: "PENDING", reason: "The brief has no Razorpay payment on record." };
  if (deps.isTestMode()) return { refund_status: "PENDING", reason: "Test mode: no real payment to refund." };

  let rzp: any;
  try {
    rzp = deps.getRazorpay();
  } catch (e: any) {
    return { refund_status: "PENDING", reason: `Razorpay is not configured: ${e?.message || e}` };
  }

  try {
    const payments = await rzp.orders.fetchPayments(razorpayOrderId);
    const captured = (payments?.items || []).find((p: any) => p.status === "captured");
    if (!captured) return { refund_status: "PENDING", reason: "No captured payment found for the brief's order." };

    const refundable = Number(captured.amount || 0) - Number(captured.amount_refunded || 0);
    if (paise > refundable) {
      return { refund_status: "PENDING", razorpay_payment_id: captured.id, reason: `Only ₹${(refundable / 100).toFixed(2)} of the payment is still refundable.` };
    }

    const refund = await rzp.payments.refund(captured.id, {
      amount: paise,
      notes: { ugc_order_id: orderId, reason: "UGC order cancelled" },
    });
    // Razorpay answers 'pending' or 'processed': either way the refund is accepted and the money
    // is on its way back (usually 5–7 working days).
    if (refund?.id && ["pending", "processed"].includes(String(refund.status))) {
      return { refund_status: "PROCESSED", razorpay_refund_id: refund.id, razorpay_payment_id: captured.id };
    }
    return { refund_status: "PENDING", razorpay_payment_id: captured.id, reason: `Razorpay returned status "${refund?.status}".` };
  } catch (e: any) {
    const msg = e?.error?.description || e?.message || String(e);
    console.error("[refundUgcOrder] Razorpay refund failed:", msg);
    return { refund_status: "PENDING", reason: `Razorpay refund failed: ${msg}` };
  }
}

/** The chat line for the cancellation, true to what actually happened to the money. */
export function refundMessageLine(outcome: RefundOutcome, amount: number): string {
  const amt = `₹${Number(amount || 0).toLocaleString("en-IN")}`;
  return outcome.refund_status === "PROCESSED"
    ? `A refund of ${amt} has been sent to the brand's original payment method (usually 5–7 working days).`
    : `A refund of ${amt} is due to the brand — the Ybex team will process it.`;
}
