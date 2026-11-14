// Session 23 — one source of truth for "where is this deal", for the MOBILE chat.
//
// Mobile used to keep its own, different copy of these flags. It did not read `payment_funded`
// (so a paid deal still showed "Make payment"), treated ANY old revision message as an open
// revision, and showed "Sign agreement" while the price was still being negotiated. Every
// expression below is copied from desktop ChatBox.jsx (same fields, same order) so both screens
// agree. If desktop logic changes, change it here too (guard: session23.test.ts).

import { resolveReviewFlags } from "./chatFlowState";
// Session 58 (bug hunt): a person typing "payment released kab hoga?" closed the chat — only SYSTEM cards count.
// v414: "text" was the only type ignored, so an attachment/file caption (or any user type) could still fake
// "payment released" / "payment secured". Text is now only read from messages the SERVER wrote.
export const USER_MESSAGE_TYPES = new Set(["text", "attachment", "file", "image", "video"]); // v414: same list as backend USER_CHAT_MESSAGE_TYPES
export const LIFECYCLE_MESSAGE_TYPES = new Set([ // v414: types only the server writes
  "system", "payment_trigger", "payment_released", "payout_released", "payment_secured", "payment_funded",
  "live_links_approved", "live_links_submitted", "live_links_resubmit_request", "live_links_resubmit_declined",
  "content_approved", "draft_approved", "content_proof_submitted", "revision_requested", "revision_declined",
  "changes_requested", "chat_closed", "order_cancelled", "brand_signed", "creator_signed", "agreement_executed",
  "agreement_signed", "contract_signing", "contract_ready", "partially_signed", "campaign_approved",
  "creator_application_offer", "brand_invitation_offer", "brand_invitation_card", "creator_invitation_acceptance",
  "pitch_invite", "negotiation_offer", "offer", "admin_injection", "deal_cancelled",
]);
const typeOfMsg = (m) => String(m?.message_type || m?.type || "").toLowerCase();
// v414: "system" (or empty) as the sender id means the server wrote it.
export const hasRealSender = (m) => {
  const id = String(m?.sender_user_id || "").trim();
  return Boolean(id) && id.toLowerCase() !== "system";
};
// v414: true only for rows the server/system wrote — never for anything a user typed.
export function isServerWrittenMessage(m) {
  if (!m) return false;
  const t = typeOfMsg(m);
  if (USER_MESSAGE_TYPES.has(t)) return false;
  if (m.status === "sending" || m.status === "failed" || m.is_temp || String(m.id || "").startsWith("temp_")) return false;
  return m.sender_role === "system" || !hasRealSender(m) || LIFECYCLE_MESSAGE_TYPES.has(t);
}
// v414: old rows saved before message types existed may still be read by their text — only if no message_type
// (or "system") AND no real sender. Everything else picks its card from message_type / metadata.action only.
export function allowsLegacyTextMatch(m) {
  if (!m) return false;
  const t = String(m.message_type || "").toLowerCase();
  if (m.status === "sending" || m.status === "failed" || m.is_temp || String(m.id || "").startsWith("temp_")) return false;
  return (!t || t === "system") && !hasRealSender(m);
}
const isChatText = (m) => !isServerWrittenMessage(m); // v414: was message_type === "text" only

const up = (v) => String(v || "").toUpperCase();

export function getDealAmount(t) {
  return t?.agreed_amount || t?.amount_fixed || t?.campaign?.budget || t?.campaign_budget || t?.ugc_order?.amount || t?.ugc_order?.creator_payout || t?.ugc_order?.agreed_amount || 0;
}

// v359 (Ravi OK): a cancelled deal / closed UGC order. The chat used to keep "PAYMENT SECURED" and the inbox chip
// "In production" for it. Cancelled anywhere (thread, flow, UGC order, deal) counts; for a UGC order an expired or
// refunded order is closed too. Never true for a completed deal.
// v414: same closed list as the server (backend/chat_routes.ts CHAT_CLOSED_STATES) — the composer is swapped for
// the closed note on exactly the chats the server refuses messages on.
export const CHAT_CLOSED_STATES = ["CANCELLED", "CANCELED", "DECLINED", "REJECTED", "REFUNDED", "EXPIRED"];
export function isThreadCancelled(t) {
  if (!t) return false;
  const vals = [t.status, t.flow_state, t.ugc_order?.status, t.deal?.status].map(up);
  if (vals.some((v) => CHAT_CLOSED_STATES.includes(v))) return true; // v414: was CANCELLED / CANCELED only
  return up(t.ugc_order?.payment_status) === "REFUNDED"; // v414: refunded UGC order
}

// v414: a cancelled / refunded / expired order is never "completed". UGC cancels write thread status COMPLETED with
// flow_state CANCELLED (ugcDeadlineService), which used to show "Deal completed · Payout processing" + Rate partner.
export function isClosedNotCompleted(t) {
  if (!t) return false;
  if (["CANCELLED", "CANCELED", "REFUNDED", "EXPIRED"].includes(up(t.flow_state))) return true;
  if (["CANCELLED", "EXPIRED"].includes(up(t.ugc_order?.status))) return true;
  return up(t.ugc_order?.payment_status) === "REFUNDED";
}

export function cancelledLabel(t) {
  const ugc = up(t?.ugc_order?.status);
  const flow = up(t?.flow_state);
  if (ugc === "REFUNDED" || up(t?.ugc_order?.payment_status) === "REFUNDED" || flow === "REFUNDED" || up(t?.deal?.status) === "REFUNDED") return "Refunded"; // v414: + payment_status / flow / deal
  if (ugc === "EXPIRED" || flow === "EXPIRED" || up(t?.status) === "EXPIRED") return "Expired"; // v414: + flow
  if ([t?.status, t?.flow_state, t?.deal?.status].map(up).some((v) => v === "DECLINED" || v === "REJECTED")) return "Declined"; // v414
  return "Cancelled";
}

// v415: H3 more "the money is in" signals, shared by desktop ChatBox and mobile. A funded deal kept offering
// "Make payment" when the thread had flow_state "escrow_funded" (any case) but payment_funded false.
export const FUNDED_PAY_STATES = ["ESCROW_HELD", "PAID", "RELEASED", "COMPLETED"];
export const FUNDED_FLOW_STATES = ["SUBMITTED", "CONTENT_SUBMITTED", "COMPLETED", "APPROVED", "IN_PROGRESS", "ACCEPTED", "REVISION_REQUESTED", "REVISION_REQ", "CHANGES_DECLINED", "CONTENT_APPROVED", "LIVE_LINKS_SUBMITTED", "LIVE_LINK_REVISION", "LIVE_LINKS_APPROVED",
  "ESCROW_FUNDED", "ESCROW_HELD", "ESCROW_PAID", "FUNDED", "PAYMENT_HELD", "PAYMENT_SECURED", "PAYMENT_FUNDED"]; // v415: + funded flow states
export function hasExtraFundedSignal(t, messages = []) {
  if (!t) return false;
  if (["REFUNDED", "REFUND_PENDING"].includes(up(t.payment_status))) return false; // money went back
  if (["ESCROW_FUNDED", "ESCROW_HELD", "ESCROW_PAID", "FUNDED", "PAYMENT_HELD", "PAYMENT_SECURED", "PAYMENT_FUNDED"].includes(up(t.flow_state))) return true;
  if (up(t.status) === "ESCROW_HELD" || up(t.deal?.status) === "ESCROW_HELD") return true;
  // a held transaction row attached to the thread
  const txs = [t.transaction, ...(Array.isArray(t.transactions) ? t.transactions : [])].filter(Boolean);
  if (txs.some((x) => up(x.status) === "ESCROW_HELD" || up(x.escrow_status) === "ESCROW_HELD" || up(x.escrow_status) === "HELD")) return true;
  if (["ESCROW_HELD", "HELD"].includes(up(t.escrow_status))) return true;
  // a "payment held" card the SERVER wrote (never a typed message)
  return (messages || []).some((m) => {
    if (!isServerWrittenMessage(m)) return false;
    const text = String(m.text || m.content || "").toLowerCase();
    const a = String(m.metadata?.action || "").toLowerCase();
    return a === "payment_held" || a === "escrow_held" || text.includes("payment held") || text.includes("held safely in a secure payment hold") || text.includes("payment is held safely");
  });
}

export function deriveDealState({ thread: currentThread, messages = [], isBrand = false }) {
  const msgs = messages || [];

  const isCreatorSigned = Boolean(
    currentThread?.agreement_signed_creator || currentThread?.is_signed_creator ||
    currentThread?.creator_signed || currentThread?.contract_signed_creator
  );
  const isBrandSigned = Boolean(
    currentThread?.agreement_signed_brand || currentThread?.is_signed_brand ||
    currentThread?.brand_signed || currentThread?.contract_signed_brand
  );
  const isMySignatureSigned = isBrand ? isBrandSigned : isCreatorSigned;
  const isOtherPartySigned = isBrand ? isCreatorSigned : isBrandSigned;

  const rawStatus = up(currentThread?.status || currentThread?.ugc_order?.status);
  const ugcStatus = up(currentThread?.ugc_order?.status);
  const flowState = up(currentThread?.flow_state);

  const isUgcOrder = Boolean(
    currentThread?.is_ugc || currentThread?.ugc_order_id || currentThread?.ugc_brief_id ||
    currentThread?.ugc_order || currentThread?.deal_type === "UGC" || currentThread?.type === "ugc" ||
    currentThread?.ugc_title ||
    // v389 (QA, Ravi OK 30 Oct): never decided by the title — a campaign called "UGC Reels for Diwali" is a campaign (type / id only).
    currentThread?.id?.startsWith("ugcord_") || currentThread?.deal_id?.startsWith("ugcord_") ||
    currentThread?.id?.startsWith("thread_ugc_")
  );

  const isAgreementSigned = isUgcOrder ? true : (currentThread ? (isBrandSigned && isCreatorSigned) : false);
  const isDealFixed = isUgcOrder ? true : (currentThread ? Boolean(
    (currentThread?.status && up(currentThread.status) !== "NEGOTIATING") ||
    currentThread?.flow_state === "AI_AGREEMENT_READY" ||
    // v414: one signature keeps status NEGOTIATING (server), but the price is fixed — show "sign / waiting signature"
    currentThread?.agreement_signed_brand === true || currentThread?.agreement_signed_creator === true ||
    ["AGREEMENT_SIGNED", "AWAITING_SIGNATURE", "CONTRACT_READY", "AGREEMENT_PENDING"].includes(up(currentThread?.flow_state)) ||
    currentThread?.is_ugc
  ) : false);

  const hasCompletedMessage = msgs.some((m) => {
    const type = (m.message_type || m.type || "").toLowerCase();
    const content = (m.content || m.text || "").toLowerCase();
    const action = (m.metadata?.action || "").toLowerCase();
    const status = (m.metadata?.status || "").toLowerCase();
    return (
      type === "payment_trigger" || type === "payout_released" || type === "payment_released" ||
      type === "live_links_approved" || type === "chat_closed" ||
      action === "live_links_approved" || action === "payout_released" || status === "completed" ||
      (!isChatText(m) && content.includes("escrow payment released")) || (!isChatText(m) && content.includes("payout has been released")) ||
      (!isChatText(m) && content.includes("payment released")) || (!isChatText(m) && content.includes("payout released")) ||
      (!isChatText(m) && content.includes("deliverables & live links approved")) || (!isChatText(m) && content.includes("collaboration completed")) ||
      (!isChatText(m) && content.includes("ugc deliverable approved")) ||
      (!isChatText(m) && content.includes("invoice generated and payment has been processed"))
    );
  });

  const deliverableTypeStr = String(
    currentThread?.deliverable_type || currentThread?.ugc_order?.deliverable_type ||
    currentThread?.ugc_brief?.deliverable_type || currentThread?.brief?.deliverable_type || ""
  ).toLowerCase();

  const isCollabOrder = currentThread?.requires_live_link !== undefined
    ? Boolean(currentThread.requires_live_link)
    : (currentThread?.is_collaboration !== undefined
      ? Boolean(currentThread.is_collaboration)
      : (isUgcOrder ? (!deliverableTypeStr.includes("raw") && !deliverableTypeStr.includes("edited") && !deliverableTypeStr.startsWith("ugc_video") && (deliverableTypeStr.includes("collab") || deliverableTypeStr.includes("reel"))) : true));

  const DONE = ["COMPLETED", "CLOSED", "PAID", "RELEASED"];
  const isDealCompleted = currentThread && !isClosedNotCompleted(currentThread) /* v414: cancelled / refunded is not done */ ? Boolean(
    hasCompletedMessage ||
    [...DONE, "RESOLVED"].includes(up(currentThread?.status)) ||
    DONE.includes(up(currentThread?.ugc_order?.status)) ||
    DONE.includes(up(currentThread?.ugc_order?.payment_status)) ||
    DONE.includes(up(currentThread?.payout_status)) ||
    DONE.includes(up(currentThread?.flow_state)) ||
    Boolean(currentThread?.utr_number || currentThread?.transaction?.utr_number) ||
    (isUgcOrder && !isCollabOrder && (
      Boolean(currentThread?.ugc_order?.draft_approved_at || currentThread?.draft_approved_at) ||
      ["APPROVED", "CONTENT_APPROVED"].includes(up(currentThread?.ugc_order?.status)) ||
      ["APPROVED", "CONTENT_APPROVED"].includes(up(currentThread?.status)) ||
      ["APPROVED", "CONTENT_APPROVED"].includes(up(currentThread?.flow_state))
    ))
  ) : false;

  const FUNDED_PAY = FUNDED_PAY_STATES; // v415
  const FUNDED_STATE = FUNDED_FLOW_STATES; // v415: H3 + escrow_funded etc.
  const isPaymentFunded = Boolean(
    currentThread?.payment_funded === true || currentThread?.escrow_funded === true ||
    currentThread?.escrow_hold === true || currentThread?.deal?.escrow_hold === true ||
    currentThread?.ugc_order?.escrow_hold === true ||
    Boolean(currentThread?.escrow_held_at || (currentThread?.deal?.escrow_hold_at && currentThread?.deal?.escrow_hold !== false) || (currentThread?.ugc_order?.escrow_held_at && currentThread?.ugc_order?.escrow_hold !== false)) /* v414: a refund sets escrow_hold false */ ||
    FUNDED_PAY.includes(up(currentThread?.payment_status)) ||
    FUNDED_PAY.includes(up(currentThread?.deal?.payment_status)) ||
    FUNDED_PAY.includes(up(currentThread?.ugc_order?.payment_status)) ||
    FUNDED_STATE.includes(rawStatus) || FUNDED_STATE.includes(flowState) ||
    hasCompletedMessage || hasExtraFundedSignal(currentThread, msgs) /* v415: H3 */ ||
    Boolean(currentThread?.utr_number || currentThread?.transaction?.utr_number) ||
    (isUgcOrder && currentThread?.ugc_brief_id && currentThread?.payment_funded !== false) ||
    msgs.some((m) => {
      const type = (m.message_type || "").toLowerCase();
      const text = (m.text || m.content || "").toLowerCase();
      const meta = m.metadata || {};
      return (
        type === "payment_funded" || type === "payment_secured" ||
        meta.action === "escrow_funded" || meta.action === "payment_secured" ||
        meta.isPayment === true || meta.payment_funded === true ||
        (!isChatText(m) && text.includes("escrow payment secured")) || (!isChatText(m) && text.includes("secured into ybex escrow")) ||
        (!isChatText(m) && text.includes("deposited into ybex escrow")) || (!isChatText(m) && text.includes("payment secured"))
      );
    })
  );

  const relevantActions = msgs.filter((m) =>
    m.message_type === "content_proof_submitted" || m.message_type === "CHANGES_REQUESTED" ||
    m.message_type === "revision_requested" || m.message_type === "revision_declined" ||
    m.message_type === "live_links_submitted"
  );
  const latestActionMsg = relevantActions.length ? relevantActions[relevantActions.length - 1] : null;

  const dealStatus = up(currentThread?.deal?.status || currentThread?.status);
  const APPROVED = ["APPROVED", "CONTENT_APPROVED", "REVISION_REQUESTED_LINKS", "REVISION_DECLINED_LINKS", "COMPLETED_APPROVAL"];
  const isContentApproved = !isDealCompleted && (
    APPROVED.includes(rawStatus) || APPROVED.includes(ugcStatus) || APPROVED.includes(flowState) ||
    APPROVED.includes(dealStatus) || currentThread?.content_approved === true ||
    currentThread?.deal?.status === "CONTENT_APPROVED" || currentThread?.flow_state === "CONTENT_APPROVED" ||
    msgs.some((m) => m.message_type === "content_approved" || (m.metadata && (m.metadata.action === "draft_approved" || m.metadata.status === "CONTENT_APPROVED")))
  );

  const { isRevisionRequested, isRevisionDeclined, isContentSubmitted } = resolveReviewFlags({
    isDealCompleted, isContentApproved, rawStatus, ugcStatus, flowState,
    latestActionType: latestActionMsg?.message_type || null,
  });

  const isCampaignThread = !isUgcOrder;
  const isNegotiationLocked = isCampaignThread && Boolean(
    currentThread?.agreement_signed_brand || currentThread?.agreement_signed_creator ||
    ["CONTRACT_SIGNED", "PROOF_SUBMITTED", "ACTIVE", "COMPLETED"].includes(flowState) // v414: same as desktop — an unsigned agreement doesn't lock the price
  );

  const linkMsgs = msgs.filter((m) => {
    const type = (m.message_type || m.type || "").toLowerCase();
    const action = (m.metadata?.action || "").toLowerCase();
    return (
      type === "live_links_resubmit_request" || type === "live_links_resubmit_declined" ||
      type === "live_links_submitted" || type === "live_links_approved" ||
      action === "live_links_resubmit_requested" || action === "live_links_resubmit_declined" ||
      action === "live_link_submitted" || action === "live_links_approved"
    );
  });
  const latestLinkActionMsg = linkMsgs.length ? linkMsgs[linkMsgs.length - 1] : null;
  const lt = (latestLinkActionMsg?.message_type || "").toLowerCase();
  const la = (latestLinkActionMsg?.metadata?.action || "").toLowerCase();
  const linkReopenedByMsg = Boolean(latestLinkActionMsg && (
    lt === "live_links_resubmit_request" || la === "live_links_resubmit_requested" ||
    lt === "live_links_resubmit_declined" || la === "live_links_resubmit_declined"
  ));
  const LINK_REV = ["REVISION_REQUESTED_LINKS", "REVISION_DECLINED_LINKS", "LIVE_LINK_REVISION_REQ", "LIVE_LINK_REVISION"];
  const isUgcLinksRevisionOpen = isUgcOrder && isCollabOrder && (
    LINK_REV.some((s) => s === rawStatus || s === ugcStatus || s === flowState || s === dealStatus) || linkReopenedByMsg
  );
  const isCampaignLinksRevisionOpen = !isUgcOrder && (
    LINK_REV.some((s) => s === rawStatus || s === flowState || s === dealStatus) || linkReopenedByMsg
  );
  const isLiveLinksRevisionOpen = isUgcOrder ? isUgcLinksRevisionOpen : isCampaignLinksRevisionOpen;

  const linkSubmittedByMsg = lt === "live_links_submitted" || la === "live_link_submitted";
  const isLiveLinksSubmitted = !isDealCompleted && !isUgcLinksRevisionOpen && !isCampaignLinksRevisionOpen && (
    isUgcOrder
      ? (isCollabOrder && (["LIVE_LINKS_SUBMITTED", "LINKS_SUBMITTED", "LINKS_UNDER_REVIEW"].includes(ugcStatus) || Boolean(currentThread?.ugc_order?.live_links_submitted) || linkSubmittedByMsg))
      : (["LIVE_LINKS_SUBMITTED", "LINKS_SUBMITTED", "LINKS_UNDER_REVIEW", "PROOF_SUBMITTED"].includes(rawStatus) ||
        ["PROOF_SUBMITTED", "LINKS_UNDER_REVIEW", "LIVE_LINKS_SUBMITTED"].includes(flowState) ||
        Boolean(currentThread?.live_links_submitted) || Boolean(currentThread?.deal?.live_links_submitted) ||
        linkSubmittedByMsg)
  );

  return {
    isUgcOrder, isCollabOrder, isCreatorSigned, isBrandSigned, isMySignatureSigned, isOtherPartySigned,
    isAgreementSigned, isDealFixed, isNegotiationLocked, isPaymentFunded, isDealCompleted,
    isContentApproved, isRevisionRequested, isRevisionDeclined, isContentSubmitted,
    isLiveLinksRevisionOpen, isLiveLinksSubmitted, amount: getDealAmount(currentThread),
    isCancelled: !isDealCompleted && isThreadCancelled(currentThread), // v359
  };
}

// v417: staff / admin messages in a deal chat are shown as "Ybex Support" (creators thought the brand wrote them).
// Supports every shape the server has used: sender_role "admin"/"support" (chat v2 send), metadata.sender_role,
// metadata.is_admin / is_support, the v417 server marker (is_staff: true, sender_label "Ybex Support",
// metadata.is_staff), admin "inject message" rows (message_type admin_injection, metadata.action
// admin_message, from_name "Platform Admin"), and sender_type "admin" (support ticket rows).
const SUPPORT_ROLES = new Set(["admin", "support", "staff", "sub_admin", "ybex_support"]);
export function isSupportMessage(m) {
  if (!m) return false;
  let meta = m.metadata || {};
  if (typeof meta === "string") { try { meta = JSON.parse(meta) || {}; } catch { meta = {}; } }
  const role = String(m.sender_role || "").toLowerCase();
  if (role === "brand" || role === "creator" || role === "system") {
    // v417: a party's own role wins, unless the server marked the row as staff in metadata.
    return SUPPORT_ROLES.has(String(meta.sender_role || "").toLowerCase()) || meta.is_support === true || meta.is_admin === true || meta.is_staff === true || m.is_staff === true;
  }
  if (SUPPORT_ROLES.has(role)) return true;
  if (SUPPORT_ROLES.has(String(meta.sender_role || "").toLowerCase())) return true;
  if (meta.is_support === true || meta.is_admin === true || meta.from_support === true) return true;
  if (m.is_staff === true || meta.is_staff === true || m.sender_label === "Ybex Support") return true; // v417: agent A's marker
  if (String(m.sender_type || "").toLowerCase() === "admin") return true;
  const t = String(m.message_type || m.type || "").toLowerCase();
  if (t === "admin_injection" || t === "admin_message" || t === "support_message") return true;
  if (String(meta.action || "").toLowerCase() === "admin_message" || meta.injected_by) return true;
  const from = String(m.from_name || "").trim().toLowerCase();
  return from === "platform admin" || from === "ybex support";
}

// v417: revision allowance used up? revision_count is the allowance, revisions_used the count so far
// (deal / thread / UGC order). Unknown numbers → false (never block on a guess).
export function revisionLimitReached(thread) {
  if (!thread) return false;
  const pick = (...vals) => vals.map((v) => (v === null || v === undefined || v === "" ? NaN : Number(v))).find((n) => Number.isFinite(n));
  const allowed = pick(thread.ugc_order?.revision_count, thread.revision_count, thread.deal?.revision_count);
  const used = pick(thread.ugc_order?.revisions_used, thread.revisions_used, thread.deal?.revisions_used);
  if (!Number.isFinite(allowed) || !Number.isFinite(used) || allowed < 0) return false;
  return used >= allowed;
}
// v417: the server said "Revision limit reached" for a changes request.
export function isRevisionLimitError(err) {
  const d = err?.response?.data || {};
  const txt = [d.error, d.detail, d.message, d.code].filter((v) => typeof v === "string").join(" ");
  if (/revision limit|REVISION_LIMIT/i.test(txt)) return true;
  const used = Number(d.revisions_used), allowed = Number(d.revision_count);
  return Number(err?.response?.status) === 400 && Number.isFinite(used) && Number.isFinite(allowed) && used >= allowed;
}
export const REVISION_LIMIT_TEXT = "Revision limit reached. Need more changes? Contact Ybex Support."; // v417

// v417: chat attachment check, same rules as the server: images (jpg, png, webp, heic, heif, gif), mp4/mov video, pdf; max 50 MB.
export const CHAT_ATTACH_EXTS = ["jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "mp4", "mov", "pdf"];
export const CHAT_ATTACH_MAX_BYTES = 50 * 1024 * 1024;
export const CHAT_ATTACH_ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.heif,.gif,.mp4,.mov,.pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,video/mp4,video/quicktime,application/pdf";
const CHAT_ATTACH_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif", "video/mp4", "video/quicktime", "application/pdf"]);
/** v417: "" when the file can be attached, else a short message to show. */
export function chatAttachmentError(file) {
  if (!file) return "Please choose a file.";
  const name = String(file.name || "");
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const type = String(file.type || "").toLowerCase();
  const okType = ext ? CHAT_ATTACH_EXTS.includes(ext) : CHAT_ATTACH_MIME.has(type);
  if (!okType) return "You can attach photos, MP4/MOV videos or PDFs.";
  if (Number(file.size || 0) > CHAT_ATTACH_MAX_BYTES) return "This file is over 50 MB. Please send a smaller file or a drive link.";
  if (Number(file.size || 0) <= 0) return "This file is empty.";
  return "";
}


// v418: the 6-step deal tracker shown in the chat's Deal menu (campaign / direct deals; not UGC orders).
export const DEAL_TRACK_STEPS = ["Offer", "Sign", "Pay", "Draft", "Live", "Payout"];
/** Pure: index of the current step (0–5), 6 = every step done, -1 = closed / not a tracked deal. */
export function dealTrackerStep(thread, flags) {
  const f = flags || {};
  if (f.isCancelled || f.isThreadCancelled || f.isUgcOrder) return -1;
  const raw = [thread?.flow_state, thread?.status, thread?.payment_status, thread?.deal?.status].map((v) => String(v || "").toUpperCase());
  if (f.isDealCompleted || raw.some((v) => ["COMPLETED", "RELEASED", "PAID", "CLOSED"].includes(v))) return 6;
  if (f.isLiveLinksSubmitted) return 5;
  if (f.isContentApproved) return 4;
  if (f.isPaymentFunded || f.isContentSubmitted) return 3;
  if (f.isAgreementSigned) return 2;
  if (f.isDealFixed || f.isNegotiationLocked) return 1;
  return 0;
}
/** Pure: one plain line saying what happens next, for the brand or the creator. */
export function dealTrackerNext(step, isBrand) {
  const B = ["Agree on the price in chat", "Both of you sign the agreement", "Pay to start the work", "Creator sends the draft for your review", "Creator posts it and shares the live link", "Ybex releases the payment to the creator"];
  const C = ["Agree on the price in chat", "Both of you sign the agreement", "Brand pays to start the work", "Send your draft for review", "Post it and share the live link", "Payment comes to your bank"];
  if (step >= 6) return "Deal completed";
  if (step < 0) return "";
  return (isBrand ? B : C)[step] || "";
}
