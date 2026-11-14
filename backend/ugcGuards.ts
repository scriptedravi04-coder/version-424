// UGC lifecycle guards — WHO may act on an order, and WHEN.
//
// Session 19c audit: every UGC order action except "submit" and "approve" accepted any
// signed-in user. A stranger could cancel someone's order (and write a "refund processed"
// row), spend its revisions, decline on the creator's behalf, or reset a completed order to
// ACCEPTED; a cancelled-and-refunded order could still be approved and paid out; a raw order
// could be paid out before anything was delivered. These helpers are the one place that
// answers the two questions for UGC. Campaign has its own (campaignGuards.ts).

import { partyRole, upper } from "./campaignGuards";

export { partyRole };

export const UGC_CLOSED = ["COMPLETED", "CANCELLED", "REFUNDED", "CLOSED", "EXPIRED"];
/** A deliverable (draft video) is with the brand. */
export const UGC_DRAFT_WITH_BRAND = ["SUBMITTED", "CONTENT_SUBMITTED", "UNDER_REVIEW", "DELIVERED", "REVISION_DECLINED", "DISPUTED"];
/** The brand asked for changes to the draft. */
export const UGC_DRAFT_REVISION = ["REVISION_REQ", "REVISION_REQUESTED", "CHANGES_REQUESTED", "NEEDS_REVISION"];
/** Collaboration: draft approved, live post owed / being corrected. */
export const UGC_LIVE_LINK_DUE = ["CONTENT_APPROVED", "AWAITING_LIVE_LINK", "REVISION_REQUESTED_LINKS", "REVISION_DECLINED_LINKS", "LIVE_LINK_REVISION_REQ", "COMPLETED_APPROVAL"];
/** Collaboration: a live link is with the brand. */
export const UGC_LINK_WITH_BRAND = ["LINKS_UNDER_REVIEW", "LIVE_LINKS_SUBMITTED", "PROOF_SUBMITTED"];

export const orderStatus = (order: any) => upper(order?.status);

export function isUgcOrderClosed(order: any): boolean {
  if (!order) return false;
  return UGC_CLOSED.includes(orderStatus(order)) ||
    ["REFUNDED", "RELEASED", "PAID"].includes(upper(order?.payment_status)) ||
    ["COMPLETED", "CANCELLED"].includes(upper(order?.brand_status));
}

export function isUgcOrderRefunded(order: any): boolean {
  return orderStatus(order) === "CANCELLED" || upper(order?.payment_status) === "REFUNDED";
}

/** Has the creator delivered anything for this order? */
export function hasUgcDeliverable(order: any): boolean {
  if (!order) return false;
  return Boolean(order.video_url || order.delivered_at) ||
    [...UGC_DRAFT_WITH_BRAND, ...UGC_DRAFT_REVISION, ...UGC_LIVE_LINK_DUE, ...UGC_LINK_WITH_BRAND].includes(orderStatus(order));
}

export function ugcForbid(res: any, needed: "brand" | "creator" | "party") {
  const msg = needed === "brand" ? "Only the brand on this order can do this."
    : needed === "creator" ? "Only the creator on this order can do this."
    : "Only the brand or creator on this order can do this.";
  return res.status(403).json({ error: msg, code: "NOT_ORDER_PARTY", _status: 403 });
}

export function ugcConflict(res: any, code: string, error: string, extra: Record<string, any> = {}) {
  return res.status(409).json({ error, detail: error, code, _status: 409, ...extra });
}

export function isAdmin(user: any) {
  return upper(user?.role) === "ADMIN";
}

/** Public fields of a brief, safe to show to a logged-out visitor. */
export function publicBrief(b: any) {
  return {
    id: b.id,
    brief_id: b.id,
    order_id: b.id,
    title: b.title || b.product_name || "UGC Brief",
    product_name: b.product_name || b.title || "UGC Product",
    brand_name: b.brand_name || "Brand",
    brand_logo: b.brand_logo || b.brand?.logo || null,
    deliverable_type: b.deliverable_type || null,
    category: b.deliverable_type || null,
    video_duration: b.video_duration || null,
    video_length: b.video_duration || null,
    budget: Number(b.budget) || 0,
    amount: Number(b.budget) || 0,
    max_creators: Number(b.max_creators) || 1,
    claimed_count: Number(b.claimed_count) || 0,
    instructions: b.product_description || null,
    product_description: b.product_description || null,
    status: "open",
    date: b.created_at || null,
    created_at: b.created_at || null,
    is_public_preview: true
  };
}


// v378 (QA M1): a signed-in user who does not own the brief (a creator browsing) gets the brief without private
// fields — payment ids, contact details, delivered files / links, refund / escrow notes. Owner and admin get it all.
const PRIVATE_BRIEF_KEY = /(^|_)(email|phone|mobile|razorpay|payment|refund|escrow|invoice|deliverable_url|delivered|submission|admin|notes?)(_|$)/i;
export function briefForOutsider(b: any): any {
  if (!b || typeof b !== "object") return b;
  const out: any = {};
  for (const k of Object.keys(b)) {
    if (PRIVATE_BRIEF_KEY.test(k)) continue;
    const v = b[k];
    out[k] = v && typeof v === "object" && !Array.isArray(v) && (k === "brand" || k === "brand_profile") ? briefForOutsider(v) : v;
  }
  return out;
}
export function isBriefOwner(viewer: any, brief: any): boolean {
  if (!viewer || !brief) return false;
  return String(viewer.role || "") === "admin" || String(viewer.user_id) === String(brief.brand_id) || (Boolean(viewer.parent_brand_id) && String(viewer.parent_brand_id) === String(brief.brand_id));
}
