// Session 56 (payment audit). Razorpay webhook helpers.
//
// Why: a brand pays in the UPI app, Android closes Ybex in the background, and our /verify call never
// runs. The money is taken but the deal stays "payment pending" (and the brand may pay again).
// With the webhook, Razorpay itself tells the server "order paid" and the deal is marked paid.
//
// Turned on only when RAZORPAY_WEBHOOK_SECRET is set (Razorpay Dashboard → Webhooks → URL
// https://<your app>/api/payments/razorpay/webhook, events: order.paid, payment.captured).
import crypto from "crypto";

/** Razorpay signs the RAW request body with the webhook secret (HMAC-SHA256, hex). */
export function verifyWebhookSignature(rawBody: Buffer | string | undefined | null, signature: string | undefined | null, secret: string | undefined | null): boolean {
  if (!rawBody || !signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** The order / payment / deal this event is about, or null when it is not a "paid" event. */
export function webhookOrderInfo(body: any): { orderId: string; paymentId: string | null; dealId: string | null; kind: string | null; ugcOrderId?: string | null } | null {
  const event = String(body?.event || "");
  if (event !== "order.paid" && event !== "payment.captured") return null;
  const order = body?.payload?.order?.entity || null;
  const payment = body?.payload?.payment?.entity || null;
  const orderId = String(order?.id || payment?.order_id || "");
  if (!/^order_[A-Za-z0-9]+$/.test(orderId)) return null;
  const notes = order?.notes || payment?.notes || {};
  const dealId = typeof notes?.deal_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(notes.deal_id) ? notes.deal_id : null;
  const paymentId = typeof payment?.id === "string" && payment.id.startsWith("pay_") ? payment.id : null;
  // v423 (P1): Instant UGC orders carry notes.ugc_order_id (ugcord_…) — the webhook records those too.
  const ugcOrderId = typeof notes?.ugc_order_id === "string" && /^ugcord_[A-Za-z0-9_-]{4,80}$/.test(notes.ugc_order_id) ? notes.ugc_order_id : null;
  return { orderId, paymentId, dealId, kind: typeof notes?.kind === "string" ? notes.kind : null, ugcOrderId };
}
