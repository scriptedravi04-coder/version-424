// Session 21. Every flow_state the backend writes, in one list.
//
// Status tokens are a contract with the database (rule 7: update the DB constraint first). They
// were scattered as string literals over a dozen files, with near-duplicates in circulation
// (LIVE_LINK_SUBMITTED vs LIVE_LINKS_SUBMITTED, REVISION_REQ vs REVISION_REQUESTED). New code
// should import from here; backend/statusTokens.test.ts fails if a file writes a flow_state that
// is not listed, so a new token cannot slip in without being added (and the constraint checked).

export const FLOW_STATES = {
  // Negotiation
  BRIEF_SENT: "BRIEF_SENT",
  NEGOTIATING: "NEGOTIATING",
  NEGOTIATING_COUNTER: "NEGOTIATING_COUNTER",
  AI_AGREEMENT_READY: "AI_AGREEMENT_READY",
  // Contract signed / escrow funded, work in progress
  ACTIVE: "ACTIVE",
  // Draft
  SUBMITTED: "SUBMITTED",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
  REVISION_REQ: "REVISION_REQ", // UGC's name for CHANGES_REQUESTED
  REVISION_DECLINED: "REVISION_DECLINED",
  CONTENT_APPROVED: "CONTENT_APPROVED",
  // Live link
  PROOF_SUBMITTED: "PROOF_SUBMITTED",
  REVISION_REQUESTED_LINKS: "REVISION_REQUESTED_LINKS",
  REVISION_DECLINED_LINKS: "REVISION_DECLINED_LINKS",
  // End
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  PARTIALLY_CANCELLED: "PARTIALLY_CANCELLED",
} as const;

export type FlowState = (typeof FLOW_STATES)[keyof typeof FLOW_STATES];
export const ALL_FLOW_STATES: string[] = Object.values(FLOW_STATES);

export const UGC_BRIEF_STATUSES = {
  OPEN: "OPEN",
  CLAIMED: "CLAIMED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  PARTIALLY_CANCELLED: "PARTIALLY_CANCELLED",
} as const;

export const UGC_ORDER_STATUSES = {
  ACCEPTED: "ACCEPTED",
  SUBMITTED: "SUBMITTED",
  IN_REVIEW: "IN_REVIEW",
  CONTENT_APPROVED: "CONTENT_APPROVED",
  REVISION_REQ: "REVISION_REQ",
  REVISION_DECLINED: "REVISION_DECLINED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
} as const;

export const UGC_REFUND_STATUSES = {
  PENDING: "PENDING",
  PROCESSED: "PROCESSED",
  FAILED: "FAILED",
} as const;

/**
 * Why an order ended before its first draft (ugc_orders.expiry_reason, free text in the DB).
 * CREATOR_CANCELLED counts on the creator's profile like a missed deadline; the GRACE (within
 * 1 hour of the timer starting) and UNSIGNED (reservation never signed) variants do not.
 * All of them stop the creator from claiming that brief again.
 */
export const UGC_EXPIRY_REASONS = {
  NO_DRAFT_BY_DEADLINE: "NO_DRAFT_BY_DEADLINE",
  CREATOR_CANCELLED: "CREATOR_CANCELLED",
  CREATOR_CANCELLED_GRACE: "CREATOR_CANCELLED_GRACE",
  CREATOR_CANCELLED_UNSIGNED: "CREATOR_CANCELLED_UNSIGNED",
  /** The brand cancelled one order (no draft 24h+ after the timer started). Never the creator's fault. */
  BRAND_CANCELLED: "BRAND_CANCELLED",
} as const;

/** Reasons that block a re-claim of the same brief by the same creator. */
export const UGC_NO_RECLAIM_REASONS: string[] = [
  UGC_EXPIRY_REASONS.NO_DRAFT_BY_DEADLINE,
  UGC_EXPIRY_REASONS.CREATOR_CANCELLED,
  UGC_EXPIRY_REASONS.CREATOR_CANCELLED_GRACE,
  UGC_EXPIRY_REASONS.CREATOR_CANCELLED_UNSIGNED,
];

/** Reasons that count as "late" on the creator's profile (on-time %). */
export const UGC_COUNTS_AS_LATE_REASONS: string[] = [
  UGC_EXPIRY_REASONS.NO_DRAFT_BY_DEADLINE,
  UGC_EXPIRY_REASONS.CREATOR_CANCELLED,
];
