// One payload for POST /support/order-ticket (backend/support_routes.ts createSupportTicketHandler).
// Desktop OrderSupportModal and the mobile sheet both build it here, so a ticket raised from a
// phone carries the same order id, amount and party details as one raised from desktop.

export const ORDER_TICKET_CATEGORIES = {
  brand: [
    ["Creator Declined Changes", "Creator declined revision / changes"],
    ["Deliverable Does Not Match Brief", "Deliverable does not match the brief"],
    ["Communication / Delay Issue", "Creator unresponsive or timeline delay"],
    ["Audio / Video Quality Issue", "Audio / video / caption quality"],
    ["Other Order Dispute", "Other order issue"],
  ],
  creator: [
    ["Revision Outside Agreed Scope", "Revision is outside the agreed scope"],
    ["Brand Unresponsive", "Brand is not responding / reviewing"],
    ["Payment / Secure Payment Hold Issue", "Payment or secure payment hold issue"],
    ["Brief Changed After Agreement", "Brief changed after signing"],
    ["Other Order Dispute", "Other order issue"],
  ],
};

export function buildOrderTicketPayload({ thread, threadId, category, message }) {
  const orderId = String(thread?.deal_id || thread?.ugc_order_id || thread?.id || threadId || "ORD-PENDING");
  const campaignTitle =
    thread?.campaign_title || thread?.campaign?.title || thread?.ugc_order?.title || thread?.title || "Campaign Collaboration";
  const dealAmount = thread?.amount_fixed || thread?.agreed_amount || thread?.deal_amount || 0;
  return {
    thread_id: threadId || thread?.id,
    order_id: orderId,
    campaign_title: campaignTitle,
    deal_amount: dealAmount,
    issue_category: category,
    message: String(message || "").trim(),
    subject: `Order Dispute: ${campaignTitle} (Order #${orderId.substring(0, 8)})`,
    brand_details: {
      id: thread?.brand_id || thread?.brand?.id,
      name: thread?.brand?.name || thread?.brand_name || "Brand",
      email: thread?.brand?.email || "",
      phone: thread?.brand?.phone || thread?.brand?.phone_number || "",
    },
    creator_details: {
      id: thread?.creator_id || thread?.creator?.id,
      name: thread?.creator?.name || thread?.creator_name || "Creator",
      email: thread?.creator?.email || "",
      phone: thread?.creator?.phone || thread?.creator?.phone_number || "",
    },
  };
}

/** Returns the ticket id, or null (the caller shows the error). Never invents an id. */
export async function raiseOrderTicket(api, args) {
  const res = await api.post("/support/order-ticket", buildOrderTicketPayload(args));
  return res?.data?.ticket_id || res?.data?.ticket?.ticket_id || null;
}
