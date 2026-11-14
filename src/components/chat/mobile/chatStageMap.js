import { isUgcThread as sharedIsUgcThread } from "../../../utils/dealFlow";
import { isThreadCancelled, cancelledLabel, isServerWrittenMessage, isClosedNotCompleted } from "../dealState"; // v359; v414: isServerWrittenMessage, isClosedNotCompleted
// Session 58 (bug hunt): a person typing "payment released kab hoga?" closed the chat — only SYSTEM cards count.
const isChatText = (m) => !isServerWrittenMessage(m); // v414: only server-written rows

// Central place that turns a thread's real backend state (status / flow_state /
// ugc_order.status / signature flags) into what the mobile stage bar shows.
// Mirrors the same fields ChatBox.jsx already reads — nothing new is invented here,
// this just classifies the existing state machine for the mobile UI's "one grammar" spec.

export function getChatStage({ thread, isBrand, isUgcOrder, isMySignatureSigned, isOtherPartySigned, isDealCompleted, messages }) {
  const hasCompletedMsg = (messages || []).some(m => {
    const type = (m.message_type || m.type || '').toLowerCase();
    const content = (m.content || m.text || '').toLowerCase();
    const action = (m.metadata?.action || '').toLowerCase();
    const status = (m.metadata?.status || '').toLowerCase();
    return (
      type === 'payment_trigger' || 
      type === 'payout_released' || 
      type === 'payment_released' ||
      type === 'live_links_approved' ||
      type === 'chat_closed' ||
      action === 'live_links_approved' ||
      action === 'payout_released' ||
      status === 'completed' ||
      (!isChatText(m) && content.includes('escrow payment released')) ||
      (!isChatText(m) && content.includes('payout has been released')) ||
      (!isChatText(m) && content.includes('payment released')) ||
      (!isChatText(m) && content.includes('payout released')) ||
      (!isChatText(m) && content.includes('deliverables & live links approved')) ||
      (!isChatText(m) && content.includes('collaboration completed')) ||
      (!isChatText(m) && content.includes('ugc deliverable approved')) ||
      (!isChatText(m) && content.includes('invoice generated and payment has been processed'))
    );
  });

  // v414: a cancelled / refunded / expired order (UGC cancel writes status COMPLETED + flow CANCELLED) is not completed.
  const completed = !isClosedNotCompleted(thread) && Boolean(
    isDealCompleted ||
    hasCompletedMsg ||
    thread?.isDealCompleted ||
    ["COMPLETED", "CLOSED", "PAID", "RELEASED", "RESOLVED"].includes(String(thread?.status || "").toUpperCase()) ||
    ["COMPLETED", "CLOSED", "PAID", "RELEASED"].includes(String(thread?.flow_state || "").toUpperCase()) ||
    ["COMPLETED", "CLOSED", "PAID", "RELEASED"].includes(String(thread?.payout_status || "").toUpperCase()) ||
    ["COMPLETED", "CLOSED", "PAID", "RELEASED"].includes(String(thread?.ugc_order?.status || "").toUpperCase()) ||
    Boolean(thread?.utr_number || thread?.payout_utr)
  );

  if (completed) {
    const alreadyRated = Boolean(thread?.rating_submitted || thread?.review_submitted || (isBrand ? thread?.reviewed_by_brand : thread?.reviewed_by_creator));
    return {
      key: "completed",
      // v414: "released" only once Ybex has actually paid (UTR); approval alone means the payout is still being processed.
      label: (thread?.utr_number || thread?.payout_utr || thread?.payout_completed) ? "Deal completed · Payout released" : "Deal completed · Payout processing",
      dot: "#059669",
      bg: "#ECFDF5",
      text: "#065F46",
      action: alreadyRated ? null : { label: "Rate partner", key: "rate" },
    };
  }

  // v359 (Ravi OK): cancelled / closed orders kept "In production" (and stayed in "Needs action").
  if (isThreadCancelled(thread)) {
    const what = cancelledLabel(thread);
    return {
      key: "cancelled",
      chip: what,
      label: isUgcOrder ? `Order closed · ${what.toLowerCase()}` : `Deal ${what.toLowerCase()}`,
      dot: "#9CA3AF",
      bg: "#F3F4F6",
      text: "#4B5563",
      action: null,
    };
  }

  const status = String(thread?.status || thread?.ugc_order?.status || "").toUpperCase();
  const flow = String(thread?.flow_state || "").toUpperCase();
  // v415: DECLINED_REVISION / RESUBMISSION_DECLINED are older names for "creator declined the changes"
  const DECLINED_REVISION_ALIASES = { DECLINED_REVISION: "REVISION_DECLINED", RESUBMISSION_DECLINED: "REVISION_DECLINED" };
  const rawS = flow || status; // prefer flow_state when present, same precedence ChatBox uses
  const s = DECLINED_REVISION_ALIASES[rawS] || rawS;

  // --- UGC order flow ---
  //
  // This branch was written when a UGC order had no live-link step and approval was the end
  // of the deal, and it was never revisited when collaboration orders arrived. The result:
  // after a draft approval, CONTENT_APPROVED matched the "approved" case and the creator was
  // told "Approved & unlocked" with no action — never offered "Add live link" — while every
  // live-link state below matched nothing at all and fell through to "In production".
  //
  // The order of these checks mirrors backend/ugcOrderStage.ts. Live-link states come first
  // because they are the later, more specific part of the flow.
  if (isUgcOrder) {
    if (["REVISION_DECLINED_LINKS"].includes(s)) {
      return {
        key: "ugc_links_declined",
        label: isBrand ? "Creator declined the link change · your call" : "You declined · discuss in chat",
        dot: "#E11D48",
        bg: "#FFF1F2",
        text: "#9F1239",
        // v359 (Ravi OK): the brand has to decide (approve the link as it is, or talk it out) — was no action,
        // so this chat never showed in "Needs action" / quick actions.
        action: isBrand ? { label: "Decide next step", key: "decide_links" } : null,
      };
    }
    if (["REVISION_REQUESTED_LINKS", "LIVE_LINK_REVISION_REQ"].includes(s)) {
      return {
        key: "ugc_links_revision",
        label: isBrand ? "Awaiting corrected live link" : "Your turn · fix live link",
        dot: "#D97706",
        bg: "#FFFBEB",
        text: "#92400E",
        action: isBrand ? null : { label: "Resubmit live link", key: "resubmit_live_link" },
      };
    }
    if (["PROOF_SUBMITTED", "LINKS_UNDER_REVIEW", "LIVE_LINK_SUBMITTED", "LINKS_SUBMITTED"].includes(s)) {
      return {
        key: "ugc_links_submitted",
        label: isBrand ? "Live link submitted · verify it" : "Live link submitted · under review",
        dot: "#7C3AED",
        bg: "#F5F0FF",
        text: "#5B21B6",
        action: isBrand ? { label: "Review live link", key: "review_live_link" } : null,
      };
    }
    if (["CONTENT_APPROVED", "DRAFT_APPROVED", "AWAITING_LIVE_LINK", "COMPLETED_APPROVAL"].includes(s)) {
      // Draft approved, escrow still held, nothing published yet. Calling this "approved"
      // hid the one step the creator still had to take, and hid from the brand that it was
      // waiting on the creator.
      return {
        key: "ugc_awaiting_live_link",
        label: isBrand ? "Waiting for live link" : "Draft approved · post it",
        dot: "#0891B2",
        bg: "#ECFEFF",
        text: "#155E75",
        action: isBrand ? null : { label: "Add live link", key: "submit_live_link" },
      };
    }
    if (["REVISION_DECLINED", "DISPUTED"].includes(s)) {
      return {
        key: "ugc_revision_declined",
        label: isBrand ? "Creator declined the changes · your call" : "You declined · discuss in chat",
        dot: "#E11D48",
        bg: "#FFF1F2",
        text: "#9F1239",
        action: isBrand ? { label: "Approve or talk it out", key: "decide_revision" } : null, // v359 (Ravi OK)
      };
    }
    if (["REVISION_REQUESTED", "REVISION_REQ", "IN_REVISION"].includes(s)) {
      // The lifecycle writes REVISION_REQ. Only REVISION_REQUESTED was listed here, so a
      // real revision request fell through to "In production".
      return {
        key: "ugc_revision",
      label: isBrand ? "Revision requested" : "Revision requested · resubmit",
        dot: "#D97706",
        bg: "#FFFBEB",
        text: "#92400E",
        action: isBrand ? null : { label: "Upload revised draft", key: "reupload" },
      };
    }
    if (["SUBMITTED", "CONTENT_SUBMITTED", "IN_REVIEW"].includes(s)) {
      return {
        key: "ugc_submitted",
      label: isBrand ? "Draft submitted · review it" : "Submitted · awaiting review",
        dot: "#7C3AED",
        bg: "#F5F0FF",
        text: "#5B21B6",
        action: isBrand ? { label: "Review draft", key: "review" } : null,
      };
    }
    if (["APPROVED", "COMPLETED", "PAID", "RELEASED"].includes(s)) {
      // CONTENT_APPROVED is deliberately no longer in this list — it is a draft approval,
      // not the end of the deal.
      return {
        key: "ugc_approved",
      label: "Approved & unlocked",
        dot: "#059669",
        bg: "#ECFDF5",
        text: "#065F46",
        action: null,
      };
    }
    // claimed / in progress / default
    return {
      key: "ugc_active",
      label: isBrand ? "In production" : "Claimed · working on it",
      dot: "#7C3AED",
      bg: "#F5F0FF",
      text: "#5B21B6",
      action: null,
    };
  }

  // --- Campaign Deal flow ---
  // Session 58 (Q16): a thread can say ACTIVE before anything is signed or paid — that showed "In production".
  const funded = threadLooksFunded(thread);
  const preWork = !funded && (s === "ACTIVE" || s === "");
  // v355 (Ravi OK): price agreed, nobody signed yet (AI_AGREEMENT_READY / SIGNED…) used to match "s !== ACTIVE" here
  // → inbox said "Offer received" while the chat said "SIGN AGREEMENT". Contract states go to the contract stage below.
  const CONTRACT_STATES = ["AI_AGREEMENT_READY", "AGREEMENT_SIGNED", "SIGNED"];
  // v355: later states (draft sent, changes, live link…) also never mean "negotiating" just because no signature flag came back.
  const LATER_STATES = ["ESCROW_FUNDED", "ESCROW_HELD", "ESCROW_PAID", "IN_PROGRESS", "CONTENT_SUBMITTED", "IN_REVIEW", "SUBMITTED", "DELIVERED_APPROVAL",
    "COMPLETED_APPROVAL", "REVISION_REQUESTED", "REVISION_REQ", "CHANGES_REQUESTED", "REVISION_DECLINED", "CHANGES_DECLINED", "CONTENT_APPROVED", "APPROVED",
    "PROOF_SUBMITTED", "LINKS_UNDER_REVIEW", "LIVE_LINK_SUBMITTED", "LIVE_LINKS_SUBMITTED", "LINKS_SUBMITTED", "LIVE_LINK_REVISION", "REVISION_REQUESTED_LINKS",
    "REVISION_DECLINED_LINKS", "LIVE_LINKS_APPROVED", "RELEASED", "PAID", "CLOSED", "RESOLVED", "COMPLETED"];
  if (["NEGOTIATING", "NEGOTIATING_COUNTER"].includes(s) || (!isMySignatureSigned && !isOtherPartySigned && !CONTRACT_STATES.includes(s) && !LATER_STATES.includes(s) && (s !== "ACTIVE" || preWork))) {
    // Session 58 (Q16): "Respond to counter" only for the side that RECEIVED the counter, not the sender too.
    const counterBy = lastCounterBy(thread, messages);
    const otherHasCountered = s === "NEGOTIATING_COUNTER" && counterBy !== (isBrand ? "brand" : "creator");
    // v355: who made the first offer (application price = creator, invitation = brand) — the creator who applied
    // with their own price used to see "Offer received" on their own offer.
    const offerBy = s === "NEGOTIATING_COUNTER" ? null : lastOfferBy(thread, messages);
    return {
      key: "negotiating",
      counter: s === "NEGOTIATING_COUNTER" ? (otherHasCountered ? "received" : "sent") : null,
      offer: offerBy ? (offerBy === (isBrand ? "brand" : "creator") ? "sent" : "received") : null,
      label: "Negotiating · no payment yet",
      dot: "#D97706",
      bg: "#FFFBEB",
      text: "#92400E",
      action: otherHasCountered ? { label: "Respond to counter", key: "respond_counter", pulse: true } : null,
    };
  }
  if (["AI_AGREEMENT_READY", "AGREEMENT_SIGNED", "SIGNED"].includes(s) && !(isMySignatureSigned && isOtherPartySigned)) {
    return {
      key: "contract",
      label: isMySignatureSigned ? "Waiting for the other party to sign" : "Contract ready · sign to continue",
      dot: "#7C3AED",
      bg: "#F5F0FF",
      text: "#5B21B6",
      action: isMySignatureSigned ? null : { label: "Sign contract", key: "sign" },
    };
  }
  // Session 58 (Q16): both signed but the brand hasn't paid yet — not "In production".
  if (!funded && isMySignatureSigned && isOtherPartySigned && ["AI_AGREEMENT_READY", "AGREEMENT_SIGNED", "SIGNED", "ACTIVE", ""].includes(s)) {
    return {
      key: "awaiting_payment",
      label: isBrand ? "Both signed · pay to start" : "Signed · waiting for brand payment",
      dot: "#D97706",
      bg: "#FFFBEB",
      text: "#92400E",
      action: null,
    };
  }
  if (["ESCROW_FUNDED", "ESCROW_HELD", "ESCROW_PAID", "ACTIVE", "IN_PROGRESS"].includes(s)) {
    return {
      key: "escrow_active",
      label: isBrand ? "Payment held safely · creator is working" : "Payment held safely · upload your draft",
      dot: "#059669",
      bg: "#ECFDF5",
      text: "#065F46",
      // v355: it is the creator's turn now — shows in "Needs action" / quick actions.
      action: isBrand ? null : { label: "Upload draft", key: "upload" },
    };
  }
  if (["CONTENT_SUBMITTED", "IN_REVIEW", "SUBMITTED", "DELIVERED_APPROVAL", "COMPLETED_APPROVAL"].includes(s)) {
    return {
      key: "draft_submitted",
      label: isBrand ? "Draft submitted · review it" : "Draft sent · awaiting review",
      dot: "#7C3AED",
      bg: "#F5F0FF",
      text: "#5B21B6",
      action: isBrand ? { label: "Review draft", key: "review" } : null,
    };
  }
  // v414: the creator declined the LIVE-LINK fix — its own stage (it said "declined the changes", which is about the draft).
  if (s === "REVISION_DECLINED_LINKS") {
    return {
      key: "links_declined",
      label: isBrand ? "Creator declined link fix · approve or contact support" : "You declined the link fix · waiting for brand",
      dot: "#D97706",
      bg: "#FFFBEB",
      text: "#92400E",
      action: isBrand ? { label: "Decide next step", key: "decide_links" } : null,
    };
  }
  // v355: the creator declined the changes → both wait for the brand / support; nobody uploads.
  if (["REVISION_DECLINED", "CHANGES_DECLINED", "REVISION_DECLINED_LINKS"].includes(s)) {
    return {
      key: "changes_declined",
      label: isBrand ? "Creator declined the changes · reply in chat" : "You declined the changes · waiting for brand",
      dot: "#D97706",
      bg: "#FFFBEB",
      text: "#92400E",
      action: isBrand ? { label: "Reply to the creator", key: "decide_changes" } : null, // v359 (Ravi OK): the brand's turn
    };
  }
  if (["REVISION_REQUESTED", "REVISION_REQ", "CHANGES_REQUESTED"].includes(s)) {
    return {
      key: "changes_requested",
      label: isBrand ? "Changes requested · awaiting revision" : "Changes requested · resubmit",
      dot: "#D97706",
      bg: "#FFFBEB",
      text: "#92400E",
      action: isBrand ? null : { label: "Upload revised draft", key: "reupload" },
    };
  }
  if (["CONTENT_APPROVED", "APPROVED"].includes(s)) {
    return {
      key: "content_approved",
      label: isBrand ? "Approved · waiting on live link" : "Approved · submit your live link",
      dot: "#7C3AED",
      bg: "#F5F0FF",
      text: "#5B21B6",
      action: !isBrand ? { label: "Add live link", key: "live_link" } : null,
    };
  }
  if (["PROOF_SUBMITTED", "LINKS_UNDER_REVIEW", "LIVE_LINK_SUBMITTED", "LIVE_LINKS_SUBMITTED", "LINKS_SUBMITTED"].includes(s)) {
    return {
      key: "live_link_submitted",
      label: isBrand ? "Live link submitted · approve it" : "Live link sent · awaiting approval",
      dot: "#7C3AED",
      bg: "#F5F0FF",
      text: "#5B21B6",
      action: isBrand ? { label: "Approve & release", key: "approve_live_link" } : null,
    };
  }
  if (["LIVE_LINK_REVISION", "REVISION_REQUESTED_LINKS"].includes(s)) {
    return {
      key: "live_link_revision",
      label: isBrand ? "Live link revision requested" : "Fix live link · resubmit",
      dot: "#D97706",
      bg: "#FFFBEB",
      text: "#92400E",
      action: !isBrand ? { label: "Resubmit link", key: "live_link" } : null,
    };
  }
  if (["LIVE_LINKS_APPROVED", "RELEASED", "PAID"].includes(s)) {
    const hasUtr = Boolean(thread?.payout_utr || thread?.utr_number);
    return {
      key: "paid",
      label: hasUtr ? "Payment completed · UTR shared" : "Approved · payout processing", // v414: not "released" before Ybex pays
      dot: "#059669",
      bg: "#ECFDF5",
      text: "#065F46",
      action: null,
    };
  }
  if (["CLOSED", "RESOLVED", "COMPLETED"].includes(s)) {
    const alreadyRated = Boolean(thread?.rating_submitted || thread?.review_submitted);
    return {
      key: "completed",
      label: "Collaboration completed",
      dot: "#059669",
      bg: "#ECFDF5",
      text: "#065F46",
      action: alreadyRated ? null : { label: "Rate collaboration", key: "rate" },
    };
  }

  // Fallback — don't guess, just show a neutral chat state
  return { key: "chat", label: "Chat", dot: "#6B7280", bg: "#F2F2F7", text: "#6B7280", action: null };
}

// Same signature-flag derivation useChatThreadMobile.js uses. Kept here so the inbox
// list (which never mounts the chat hook) classifies a thread exactly like the chat
// screen does — one grammar, one source.
export function getSignatureFlags(thread, isBrand) {
  const isCreatorSigned = Boolean(
    thread?.agreement_signed_creator ||
    thread?.is_signed_creator ||
    thread?.creator_signed ||
    thread?.contract_signed_creator
  );
  const isBrandSigned = Boolean(
    thread?.agreement_signed_brand ||
    thread?.is_signed_brand ||
    thread?.brand_signed ||
    thread?.contract_signed_brand
  );
  return {
    isMySignatureSigned: isBrand ? isBrandSigned : isCreatorSigned,
    isOtherPartySigned: isBrand ? isCreatorSigned : isBrandSigned,
  };
}

// Session 58 (Q16): is the brand's payment held for this thread? (Subset of ChatBox's isEscrowFunded.)
const FUNDED_PAY = ["ESCROW_HELD", "PAID", "RELEASED", "COMPLETED", "SUCCESS"];
const FUNDED_STATES = ["ESCROW_FUNDED", "ESCROW_HELD", "ESCROW_PAID", "IN_PROGRESS", "SUBMITTED", "CONTENT_SUBMITTED", "IN_REVIEW", "REVISION_REQUESTED", "REVISION_REQ", "CONTENT_APPROVED", "APPROVED", "LIVE_LINKS_SUBMITTED", "LIVE_LINK_REVISION", "LIVE_LINKS_APPROVED", "COMPLETED"];
export function threadLooksFunded(thread) {
  const t = thread || {};
  const up = (v) => String(v || "").toUpperCase();
  return Boolean(
    t.payment_funded === true || t.escrow_funded === true || t.escrow_hold === true || t.deal?.escrow_hold === true ||
    t.escrow_held_at || t.deal?.escrow_hold_at ||
    FUNDED_PAY.includes(up(t.payment_status)) || FUNDED_PAY.includes(up(t.deal?.payment_status)) ||
    FUNDED_STATES.includes(up(t.flow_state)) || FUNDED_STATES.includes(up(t.deal?.status)) ||
    t.utr_number || t.transaction?.utr_number
  );
}

// Session 58 (Q16): who sent the latest counter — "brand", "creator" or null when unknown.
export function lastCounterBy(thread, messages) {
  const list = Array.isArray(messages) && messages.length ? messages : (thread?.last_message ? [thread.last_message] : []);
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i] || {};
    const type = String(m.message_type || m.type || m.metadata?.action || "").toLowerCase();
    if (type !== "negotiation_offer" && m.metadata?.action !== "negotiation_offer") continue;
    const role = String(m.sender_role || m.metadata?.sender_role || "").toLowerCase();
    if (role === "brand" || role === "creator") return role;
    const sid = String(m.sender_user_id || m.sender_id || "");
    if (sid && thread?.creator_id && sid === String(thread.creator_id)) return "creator";
    if (sid && thread?.brand_id && sid === String(thread.brand_id)) return "brand";
    return null;
  }
  return null;
}

// v355: who made the latest price offer (application / invitation / counter) — "brand", "creator" or null.
const OFFER_TYPES = { creator_application_offer: "creator", brand_invitation_offer: "brand" };
export function lastOfferBy(thread, messages) {
  const list = Array.isArray(messages) && messages.length ? messages : (thread?.last_message ? [thread.last_message] : []);
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i] || {};
    const type = String(m.message_type || m.type || "").toLowerCase();
    const action = String(m.metadata?.action || "").toLowerCase();
    if (OFFER_TYPES[type]) return OFFER_TYPES[type];
    if (type !== "negotiation_offer" && action !== "negotiation_offer") continue;
    const role = String(m.sender_role || m.metadata?.sender_role || "").toLowerCase();
    if (role === "brand" || role === "creator") return role;
    const sid = String(m.sender_user_id || m.sender_id || "");
    if (sid && thread?.creator_id && sid === String(thread.creator_id)) return "creator";
    if (sid && thread?.brand_id && sid === String(thread.brand_id)) return "brand";
    return null;
  }
  return null;
}

// Same fields populateThreadData() sets on every thread in GET /chat/v2/threads.
export function getIsUgcThread(thread) {
  // Kept as a named export because the mobile inbox already imports it, but the decision
  // itself now comes from the shared detector so mobile can never disagree with desktop.
  return sharedIsUgcThread(thread);
}

// Short forms of the chat stage labels, for the inbox list row where the chip sits
// next to a name, a campaign title and a timestamp. Keyed off getChatStage()'s `key`
// so the two can't drift: if a stage is added to the map above and no short label is
// listed here, the chip falls back to the full stage label rather than a raw enum.
const INBOX_LABELS = {
  ugc_awaiting_live_link: { brand: "Waiting for live link", creator: "Draft approved · post it" },
  ugc_links_submitted: { brand: "Verify live link",    creator: "Live link under review" },
  ugc_links_revision:  { brand: "Awaiting corrected link", creator: "Your turn · fix live link" },
  ugc_links_declined:  { brand: "Creator declined · your call", creator: "You declined" }, // v359
  ugc_revision_declined: { brand: "Creator declined · your call", creator: "You declined" }, // v359
  ugc_revision:        { brand: "Awaiting revision",   creator: "Your turn · reupload" },
  ugc_submitted:       { brand: "Awaiting your review", creator: "Waiting on brand" },
  ugc_approved:        { brand: "Approved",            creator: "Approved" },
  ugc_active:          { brand: "In production",       creator: "In production" },
  negotiating:         { brand: "Negotiating",         creator: "Offer received" },
  escrow_active:       { brand: "In production",       creator: "Your turn · upload draft" }, // v355
  changes_declined:    { brand: "Creator declined · your call", creator: "Waiting on brand" },  // v355 · v359
  links_declined:      { brand: "Link fix declined · your call", creator: "Waiting on brand" }, // v414
  awaiting_payment:    { brand: "Pay to start",        creator: "Waiting for payment" },
  draft_submitted:     { brand: "Awaiting your review", creator: "Waiting on brand" },
  changes_requested:   { brand: "Awaiting revision",   creator: "Your turn · reupload" },
  content_approved:    { brand: "Awaiting live link",  creator: "Add live link" },
  live_link_submitted: { brand: "Review live link",    creator: "Waiting on brand" },
  live_link_revision:  { brand: "Revision requested",  creator: "Fix live link" },
  completed:           { brand: "Payout released",     creator: "Payout released" },
  chat:                { both: "Active" },
};

export function getInboxChip(thread, isBrand) {
  const isUgcOrder = getIsUgcThread(thread);
  const { isMySignatureSigned, isOtherPartySigned } = getSignatureFlags(thread, isBrand);
  const stage = getChatStage({ thread, isBrand, isUgcOrder, isMySignatureSigned, isOtherPartySigned });

  let label;
  let bg = stage.bg;
  let text = stage.text;
  let dot = stage.dot;

  const statusStr = String(thread?.status || thread?.ugc_order?.status || thread?.flow_state || "").toUpperCase();

  // v419 (Ravi): cancel requested on a paid deal → one clear state everywhere (inbox, quick actions), no upload nudge.
  if (thread?.cancel_requested && stage.key !== "cancelled" && stage.key !== "completed" && stage.key !== "paid") {
    return { key: "cancel_review", label: "Cancellation under review", bg: "#FFFBEB", text: "#B45309", dot: "#F59E0B", needsAction: false };
  }

  if (stage.key === "cancelled") {
    label = stage.chip === "Declined" ? (isBrand ? "Declined by creator" : "Declined") /* v414: declined chats are closed too — same chip text as before */ : (stage.chip || "Cancelled"); // v359 (Ravi OK)
    dot = "#9CA3AF";
    bg = "#F3F4F6";
    text = "#4B5563";
  } else if (statusStr.includes("EXPIRED")) {
    label = "Expired";
    dot = "#9CA3AF";
    bg = "#F3F4F6";
    text = "#4B5563";
  } else if ((statusStr.includes("DECLINED") && !/REVISION_DECLINED|CHANGES_DECLINED|DECLINED_REVISION|RESUBMISSION_DECLINED/.test(statusStr)) || statusStr.includes("REJECTED")) { // v415: + older declined-revision names
    // v355: "the creator declined the CHANGES" is not a declined deal — it keeps its own chip below.
    label = isBrand ? "Declined by creator" : "Declined";
    dot = "#9CA3AF";
    bg = "#F3F4F6";
    text = "#4B5563";
  } else if (stage.key === "negotiating" && stage.counter) {
    // Session 58 (Q16): the side that received a counter must answer it; the sender just waits.
    label = stage.counter === "received" ? "Respond to counter" : "Counter sent";
  } else if (stage.key === "negotiating" && stage.offer === "sent") {
    label = "Offer sent · waiting"; // v355: your own application price / invitation
  } else if (stage.key === "negotiating" && stage.offer === "received") {
    label = "Offer received";
  } else if (stage.key === "contract") {
    label = isMySignatureSigned ? (isBrand ? "Waiting on creator" : "Waiting on brand") : "Sign contract"; // v355: a brand that signed saw "Waiting on brand"
    dot = isMySignatureSigned ? "#7C3AED" : "#EF4444";
    bg = isMySignatureSigned ? "#F5F3FF" : "#FEE2E2";
    text = isMySignatureSigned ? "#6D28D9" : "#DC2626";
  } else if (stage.key === "paid" || stage.key === "completed" || stage.key === "ugc_approved") {
    // "₹x received" is a claim about money, so it needs evidence that money actually moved.
    // ugc_approved used to be reached by a mere draft approval, and the creator's inbox then
    // showed a green "₹15,000 received" for a deal where nothing had been paid and nothing
    // had even been posted yet. The stage no longer includes draft approvals, and this line
    // no longer takes the stage's word for it either.
    const payoutAmt = thread?.agreed_amount || thread?.amount_fixed || thread?.ugc_order?.amount || thread?.amount;
    const payoutReleased = Boolean(
      thread?.utr_number ||
      thread?.payout_utr ||
      ["RELEASED", "PAID", "COMPLETED"].includes(String(thread?.payout_status || "").toUpperCase()) ||
      ["COMPLETED", "PAID", "RELEASED"].includes(String(thread?.status || "").toUpperCase()) ||
      ["COMPLETED", "PAID", "RELEASED"].includes(String(thread?.ugc_order?.status || "").toUpperCase())
    );
    // Session 58 (Ravi: inbox said "₹13,000 received" while Earnings said ₹0 paid to bank): "received" only
    // once the money really went to the bank (UTR / PAID). Approved-but-not-yet-paid says so.
    const paidToBank = Boolean(thread?.utr_number || thread?.payout_utr || thread?.payout_reference ||
      ["PAID"].includes(String(thread?.payout_status || "").toUpperCase()));
    // v355 (Ravi OK): the creator's chip showed the GROSS deal amount ("₹13,000 received") while the chat pill,
    // payout card and receipt show what reaches the bank (after convenience fee & TDS). The inbox list has no
    // net amount, so the creator's chip shows no amount; the brand still sees the deal amount.
    const amt = isBrand && payoutAmt ? `₹${Number(payoutAmt).toLocaleString("en-IN")}` : "";
    label = !isBrand && paidToBank
      ? "Payment received"
      : !isBrand && payoutReleased
        ? "Approved · payout next"
        : (paidToBank ? (amt ? `${amt} · paid to creator` : "Paid to creator") : payoutReleased ? (amt ? `${amt} · payout processing` : "Payout processing") : "Approved"); // v414: "released" only once Ybex has paid
    dot = "#10B981";
    bg = "#ECFDF5";
    text = "#059669";
  } else if (stage.key === "changes_requested" || stage.key === "ugc_revision") {
    if (!isBrand) {
      label = "Your turn · reupload";
      dot = "#EF4444";
      bg = "#FEE2E2";
      text = "#DC2626";
    } else {
      label = "Awaiting revision";
      dot = "#F59E0B";
      bg = "#FEF3C7";
      text = "#B45309";
    }
  } else if (stage.key === "draft_submitted" || stage.key === "ugc_submitted") {
    if (isBrand) {
      label = "Awaiting your review";
      dot = "#F59E0B";
      bg = "#FEF3C7";
      text = "#B45309";
    } else {
      label = "Waiting on brand";
      dot = "#7C3AED";
      bg = "#F5F3FF";
      text = "#6D28D9";
    }
  } else {
    const entry = INBOX_LABELS[stage.key];
    label = entry ? (entry.both || (isBrand ? entry.brand : entry.creator)) : stage.label;
  }

  return {
    key: stage.key,
    label,
    bg,
    text,
    dot,
    needsAction: (stage.key === "completed" || stage.key === "paid" || stage.key === "cancelled") ? false : (Boolean(stage.action) || (!isBrand && label.includes("Your turn")) || (isBrand && String(label).toLowerCase().includes("review")) || ["Offer received", "Respond to counter", "Sign contract"].includes(label)), // v415: "Review live link" (capital R) was missed; M8 an offer / counter / contract waiting on me is an action
  };
}

// v419: the lowest offer / counter in this chat — ₹3,000, or ₹500 when the server says so (Ybex in-house brands
// send offer_minimum). The open chat sets it, so offer boxes without the thread at hand read the same number.
// v420 (Ravi): ₹2,000 special offer for every paid deal (usually ₹3,000) — same number as the server's MIN_OFFER.
export const OFFER_FLOOR = 2000;
let OPEN_FLOOR = OFFER_FLOOR;
export const offerFloorOf = (t) => (Number(t?.offer_minimum) > 0 ? Number(t.offer_minimum) : OFFER_FLOOR);
export function setOpenOfferFloor(t) { OPEN_FLOOR = offerFloorOf(t); }
export const openOfferFloor = () => OPEN_FLOOR;
export const inr0 = (n) => `₹${Number(n).toLocaleString("en-IN")}`;
