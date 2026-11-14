// THE one place that decides what stage a UGC order is at.
//
// Why this file exists
// -------------------
// `/ugc/orders/brand` and `/ugc/orders/creator` each rebuilt this answer inline, and both
// copies recognised a narrower set of tokens than the lifecycle actually writes. The clearest
// example, and the reported bug: on a collaboration order the brand approves the draft,
// `syncUgcLifecycleEvent` writes `status: 'AWAITING_LIVE_LINK'` to ugc_orders — and neither
// route listed `AWAITING_LIVE_LINK` anywhere in its derivation chain. The step survived only
// if `draft_approved_at` had persisted to Supabase AND the chat_threads row was found with
// `flow_state = 'CONTENT_APPROVED'`. Lose either one and both Manage Orders screens stayed on
// "draft under review" forever, while the chat — which reads the thread and the messages
// directly — showed the correct state. That is exactly the reported symptom: chat right,
// Manage Orders frozen.
//
// So the fix is not to add one more token to two places. It is to derive the stage from every
// signal at once, in one function, with the chat timeline as a first-class source — because
// the chat timeline is the thing that was never wrong.
//
// RULE FOR NEW CODE: never rebuild this inline. Import resolveUgcStage. If a new lifecycle
// action is added to ugcLifecycleService, add its message action here and both screens follow
// automatically.
//
// This file is UGC-only and pure — no Supabase, no Express, no campaign logic. Campaign deals
// have their own state machine and must not be routed through here.

export type UgcPhase =
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'REVISION_REQ'
  // The draft-stage counterpart of REVISION_DECLINED_LINKS. Its absence was a real defect,
  // not a simplification: a declined revision was folded back into REVISION_REQ, so both
  // screens kept showing "Brand Needs Some Changes" with the Decline and Upload buttons
  // still live, and the creator could decline the same request over and over.
  | 'REVISION_DECLINED'
  | 'CONTENT_APPROVED'
  | 'PROOF_SUBMITTED'
  | 'REVISION_REQUESTED_LINKS'
  | 'REVISION_DECLINED_LINKS'
  | 'COMPLETED'
  | 'CANCELLED';

const str = (v: any) => (typeof v === 'string' ? v : '');
const upper = (v: any) => str(v).toUpperCase().trim();
const lower = (v: any) => str(v).toLowerCase().trim();

/**
 * `metadata.action` on the lifecycle chat message. This is the most reliable signal there is:
 * it is written by syncUgcLifecycleEvent in the same breath as the status, it goes to
 * chat_messages (a table with no column whitelist problems), and it is what the chat screen
 * itself renders. Keyed on action rather than message_type because 'content_approved' is used
 * for BOTH a draft approval (collaboration, payout still held) and a final approval (raw UGC,
 * payout released) — only the action tells them apart, and confusing the two would either
 * hide a pending live-link step or claim a payout that never happened.
 */
const ACTION_PHASE: Record<string, UgcPhase> = {
  deliverable_submitted: 'SUBMITTED',
  draft_approved: 'CONTENT_APPROVED',
  live_link_submitted: 'PROOF_SUBMITTED',
  live_links_resubmit_requested: 'REVISION_REQUESTED_LINKS',
  live_links_resubmit_declined: 'REVISION_DECLINED_LINKS',
  revision_requested: 'REVISION_REQ',
  revision_declined: 'REVISION_DECLINED',
  approved: 'COMPLETED',
  live_links_approved: 'COMPLETED',
  payout_released: 'COMPLETED',
  order_cancelled: 'CANCELLED'
};

/** Fallback for older messages written before metadata.action was set on every event. */
const TYPE_PHASE: Record<string, UgcPhase> = {
  content_proof_submitted: 'SUBMITTED',
  live_links_submitted: 'PROOF_SUBMITTED',
  live_links_resubmit_request: 'REVISION_REQUESTED_LINKS',
  live_links_resubmit_declined: 'REVISION_DECLINED_LINKS',
  revision_requested: 'REVISION_REQ',
  revision_declined: 'REVISION_DECLINED',
  live_links_approved: 'COMPLETED',
  payout_released: 'COMPLETED',
  order_cancelled: 'CANCELLED'
  // 'content_approved' is deliberately absent — ambiguous without metadata.action.
};

const THREAD_FLOW_PHASE: Record<string, UgcPhase> = {
  SUBMITTED: 'SUBMITTED',
  CONTENT_SUBMITTED: 'SUBMITTED',
  CONTENT_APPROVED: 'CONTENT_APPROVED',
  DRAFT_APPROVED: 'CONTENT_APPROVED',
  AWAITING_LIVE_LINK: 'CONTENT_APPROVED',
  PROOF_SUBMITTED: 'PROOF_SUBMITTED',
  LINKS_UNDER_REVIEW: 'PROOF_SUBMITTED',
  LIVE_LINK_SUBMITTED: 'PROOF_SUBMITTED',
  LINKS_SUBMITTED: 'PROOF_SUBMITTED',
  REVISION_REQUESTED_LINKS: 'REVISION_REQUESTED_LINKS',
  REVISION_DECLINED_LINKS: 'REVISION_DECLINED_LINKS',
  REVISION_REQ: 'REVISION_REQ',
  REVISION_REQUESTED: 'REVISION_REQ',
  REVISION_DECLINED: 'REVISION_DECLINED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};

/**
 * Order status tokens. `AWAITING_LIVE_LINK` and `LINKS_UNDER_REVIEW` are the two the lifecycle
 * writes and the old inline chains never listed — the actual defect. They are first here on
 * purpose.
 */
const ORDER_STATUS_PHASE: Record<string, UgcPhase> = {
  AWAITING_LIVE_LINK: 'CONTENT_APPROVED',
  LINKS_UNDER_REVIEW: 'PROOF_SUBMITTED',
  CONTENT_APPROVED: 'CONTENT_APPROVED',
  DRAFT_APPROVED: 'CONTENT_APPROVED',
  COMPLETED_APPROVAL: 'CONTENT_APPROVED',
  LIVE_LINK_SUBMITTED: 'PROOF_SUBMITTED',
  PROOF_SUBMITTED: 'PROOF_SUBMITTED',
  REVISION_REQUESTED_LINKS: 'REVISION_REQUESTED_LINKS',
  REVISION_DECLINED_LINKS: 'REVISION_DECLINED_LINKS',
  REVISION_REQ: 'REVISION_REQ',
  REVISION_REQUESTED: 'REVISION_REQ',
  IN_REVISION: 'REVISION_REQ',
  DISPUTED: 'REVISION_DECLINED',
  SUBMITTED: 'SUBMITTED',
  DELIVERED: 'SUBMITTED',
  CONTENT_SUBMITTED: 'SUBMITTED',
  COMPLETED: 'COMPLETED',
  APPROVED: 'COMPLETED',
  PAID: 'COMPLETED',
  RELEASED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};

export type UgcStageInput = {
  order: any;
  thread?: any | null;
  /** Chat messages for this thread, any order. Optional — everything still works without them. */
  messages?: any[] | null;
  /**
   * Whether this order needs a published live post link before payout. Resolved by the caller
   * from order / brief / deliverable_type so this module stays free of that chain (and free of
   * a circular import back into ugc_routes).
   */
  requiresLiveLink: boolean;
};

export type UgcStageResult = {
  phase: UgcPhase;
  /** Status token sent to the frontends. Unchanged from what the old inline chains emitted. */
  status: string;
  brandStage: string;
  creatorStage: string;
  isCompleted: boolean;
  isCancelled: boolean;
  isContentApproved: boolean;
  isLiveLinkSubmitted: boolean;
  /** Which signal decided the phase. Logged when sources disagree; never sent to the client. */
  source: 'terminal' | 'message' | 'thread' | 'order_status' | 'order_timestamp' | 'default';
};

function messageTimestamp(m: any): number {
  return (
    Date.parse(m?.created_at || '') ||
    Date.parse(m?.timestamp || '') ||
    Date.parse(m?.sent_at || '') ||
    0
  );
}

function phaseFromMessage(m: any): UgcPhase | null {
  const action = lower(m?.metadata?.action || m?.action);
  if (action && ACTION_PHASE[action]) return ACTION_PHASE[action];

  const type = lower(m?.message_type || m?.type);
  if (type && TYPE_PHASE[type]) return TYPE_PHASE[type];

  // Last resort for a 'content_approved' message with no metadata.action: the draft-approval
  // copy is the only one that asks for a live post link. Matching the ask rather than the word
  // "approved" keeps a raw-UGC approval from being read as a pending live-link step.
  if (type === 'content_approved') {
    const text = lower(m?.text || m?.content);
    if (text.includes('live post link') || text.includes('draft approved')) return 'CONTENT_APPROVED';
    return 'COMPLETED';
  }
  return null;
}

/**
 * The most recent message that carries a lifecycle phase. Latest-wins, not furthest-along-wins:
 * a revision request is a step backwards and has to be able to overturn an earlier approval.
 */
export function phaseFromMessages(messages?: any[] | null): UgcPhase | null {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  let best: UgcPhase | null = null;
  let bestAt = -1;
  for (let i = 0; i < messages.length; i++) {
    const phase = phaseFromMessage(messages[i]);
    if (!phase) continue;
    // Index breaks ties so that messages sharing a timestamp still resolve in arrival order.
    const at = messageTimestamp(messages[i]) || i;
    if (at >= bestAt) {
      bestAt = at;
      best = phase;
    }
  }
  return best;
}

export function resolveUgcStage(input: UgcStageInput): UgcStageResult {
  const order = input?.order || {};
  const thread = input?.thread || null;
  const requiresLiveLink = Boolean(input?.requiresLiveLink);

  const orderStatus = upper(order.status);
  const paymentStatus = upper(order.payment_status);
  const threadFlow = upper(thread?.flow_state);
  const threadStatus = upper(thread?.status);

  let phase: UgcPhase | null = null;
  let source: UgcStageResult['source'] = 'default';

  // 1. Terminal money states win outright, from any source. Once escrow is released or
  //    refunded the order is done, and no older chat message may drag it back.
  const isCancelled = orderStatus === 'CANCELLED' || threadFlow === 'CANCELLED' || paymentStatus === 'REFUNDED';
  const isCompleted =
    orderStatus === 'COMPLETED' ||
    paymentStatus === 'RELEASED' ||
    paymentStatus === 'PAID' ||
    threadStatus === 'COMPLETED' ||
    threadFlow === 'COMPLETED' ||
    Boolean(order.escrow_released_at) ||
    Boolean(order.utr_number || order.payout_reference);

  if (isCancelled) {
    phase = 'CANCELLED';
    source = 'terminal';
  } else if (isCompleted) {
    phase = 'COMPLETED';
    source = 'terminal';
  }

  // 2. The chat timeline. Placed above the order row on purpose: chat_messages is written on
  //    every lifecycle event and has no column whitelist to fall through, which is why chat
  //    stayed correct while the order row went stale.
  if (!phase) {
    const fromChat = phaseFromMessages(input?.messages);
    if (fromChat) {
      phase = fromChat;
      source = 'message';
    }
  }

  // 3. The chat thread's flow_state.
  if (!phase && threadFlow && THREAD_FLOW_PHASE[threadFlow]) {
    phase = THREAD_FLOW_PHASE[threadFlow];
    source = 'thread';
  }

  // 4. The order's own status token.
  if (!phase && orderStatus && ORDER_STATUS_PHASE[orderStatus]) {
    phase = ORDER_STATUS_PHASE[orderStatus];
    source = 'order_status';
  }

  // 5. Timestamps and artefacts the order carries, for rows written before the status tokens
  //    settled.
  if (!phase) {
    if (order.live_link || order.live_links_submitted || order.live_link_submitted_at) {
      phase = 'PROOF_SUBMITTED';
      source = 'order_timestamp';
    } else if (order.draft_approved_at || order.content_approved === true) {
      phase = 'CONTENT_APPROVED';
      source = 'order_timestamp';
    } else if (order.video_url || order.delivered_at) {
      phase = 'SUBMITTED';
      source = 'order_timestamp';
    }
  }

  if (!phase) phase = 'IN_PROGRESS';

  // A live link cannot be pending on an order that never needed one. Without this a raw UGC
  // order whose type went missing would sit on "waiting for live link" forever and its payout
  // would never be released.
  if (!requiresLiveLink && (phase === 'CONTENT_APPROVED' || phase === 'PROOF_SUBMITTED')) {
    phase = 'COMPLETED';
  }

  const statusToken =
    phase === 'IN_PROGRESS'
      ? (orderStatus || 'IN_PROGRESS')
      : phase;

  let brandStage: string;
  let creatorStage: string;
  switch (phase) {
    case 'COMPLETED':
      brandStage = 'COMPLETED';
      creatorStage = 'COMPLETED';
      break;
    case 'CANCELLED':
      brandStage = 'CANCELLED';
      creatorStage = 'CANCELLED';
      break;
    case 'REVISION_REQUESTED_LINKS':
      brandStage = 'REVISION_REQUESTED_LINKS';
      creatorStage = 'REVISION_REQUESTED_LINKS';
      break;
    case 'REVISION_DECLINED_LINKS':
      brandStage = 'REVISION_DECLINED_LINKS';
      creatorStage = 'REVISION_DECLINED_LINKS';
      break;
    case 'PROOF_SUBMITTED':
      brandStage = 'LIVE_LINK_SUBMITTED';
      creatorStage = 'LIVE_LINK_SUBMITTED';
      break;
    case 'CONTENT_APPROVED':
      // These two names differ, and have to: the brand's screen keys its "waiting for the
      // creator's live link" panel off AWAITING_LIVE_LINK, the creator's keys its "publish and
      // submit your link" panel off COMPLETED_APPROVAL.
      brandStage = 'AWAITING_LIVE_LINK';
      creatorStage = 'COMPLETED_APPROVAL';
      break;
    case 'REVISION_REQ':
      brandStage = 'REVISION_REQUESTED';
      creatorStage = 'REVISION_REQUESTED';
      break;
    case 'REVISION_DECLINED':
      // Both screens get their own panel for this. The brand's already existed and was
      // simply never reachable; the creator's is new. The point of separating it from
      // REVISION_REQ is that the request is over — the creator has answered it — so the
      // buttons that answer it must be gone.
      brandStage = 'REVISION_DECLINED';
      creatorStage = 'REVISION_DECLINED';
      break;
    case 'SUBMITTED':
      brandStage = 'IN_REVIEW';
      creatorStage = 'IN_REVIEW';
      break;
    default:
      brandStage = orderStatus === 'ACCEPTED' || !orderStatus ? 'IN_PROGRESS' : orderStatus;
      creatorStage = brandStage;
      break;
  }

  return {
    phase,
    status: statusToken,
    brandStage,
    creatorStage,
    isCompleted: phase === 'COMPLETED',
    isCancelled: phase === 'CANCELLED',
    isContentApproved:
      phase === 'COMPLETED' ||
      phase === 'CONTENT_APPROVED' ||
      phase === 'PROOF_SUBMITTED' ||
      phase === 'REVISION_REQUESTED_LINKS' ||
      phase === 'REVISION_DECLINED_LINKS',
    isLiveLinkSubmitted: phase === 'PROOF_SUBMITTED',
    source
  };
}

export default { resolveUgcStage, phaseFromMessages };
