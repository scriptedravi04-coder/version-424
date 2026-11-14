import React from "react";
import { motion } from "framer-motion";
import MobileEventRow from "./MobileEventRow";
import MobileOfferCard from "./MobileOfferCard";
import MobileDeliverableCard from "./MobileDeliverableCard";
import MobileLiveLinksCard from "./MobileLiveLinksCard";
import MobilePayoutCard from "./MobilePayoutCard";
import MobileEscrowFundedCard from "./MobileEscrowFundedCard";
import MobileContractCard from "./MobileContractCard";
import MobileChangesCard from "./MobileChangesCard";
import MobileDeclinedCard from "./MobileDeclinedCard";
import {
  MobileShortlistCongratsCard,
  MobileCreatorApplicationOfferCard,
  MobileInviteThanksCard,
} from "./MobileShortlistCards";
import { allowsLegacyTextMatch, USER_MESSAGE_TYPES, isSupportMessage } from "../dealState"; // v414; v417: + isSupportMessage
import { mediaProxyUrl } from "../../../lib/mediaUrl"; // v417: attachment link
import { LinkifiedText, DateSeparator } from "../MessageBubble"; // v415: M7 clickable links; v417: + date line

// v414: plain typed messages were turned into action cards by their text ("Thank you for the invitation!" -> offer
// card with Accept, "will send the live post link tonight" -> live-links review). The card now comes from
// message_type / metadata.action; text is only read for OLD system rows with no type and no sender.
const isUserTyped = (m) => USER_MESSAGE_TYPES.has(String(m?.message_type || m?.type || "").toLowerCase());
const legacyText = (m) => (!isUserTyped(m) && allowsLegacyTextMatch(m) ? String(m?.content || m?.text || "").toLowerCase() : "");

// Which review card a message is. Shared with ChatBoxMobile, which uses it to work out which
// cards are superseded (see supersededReviewCards).
export function isLiveLinkMessage(message) {
  if (isUserTyped(message)) return false; // v414
  const rawType = (message?.message_type || message?.type || message?.metadata?.action || "").toLowerCase();
  const contentLower = legacyText(message); // v414: legacy rows only
  return (
    rawType === "live_links_submitted" ||
    rawType === "live_link_submitted" ||
    rawType === "live_links_resubmit_request" ||
    rawType === "live_link" ||
    message?.metadata?.action === "live_link_submitted" ||
    message?.metadata?.action === "live_links_submitted" ||
    Boolean(message?.metadata?.link && (rawType.includes("link") || contentLower.includes("link"))) ||
    contentLower.includes("live post link") ||
    contentLower.includes("live post links") ||
    contentLower.includes("submitted live campaign links") ||
    contentLower.includes("submitted live post")
  );
}

export function isDeliverableMessage(message) {
  if (isUserTyped(message)) return false; // v414
  if (isLiveLinkMessage(message)) return false;
  const rawType = (message?.message_type || message?.type || message?.metadata?.action || "").toLowerCase();
  return rawType === "content_proof_submitted" || rawType === "deliverable_submitted" || Boolean(message?.metadata?.media_url);
}

const DRAFT_STEP_CLOSERS = ["changes_requested", "revision_requested", "revision_declined", "content_approved", "draft_approved", "payment_released", "payout_released", "live_links_approved", "order_cancelled"];
const LINK_STEP_CLOSERS = ["live_links_approved", "payment_released", "payout_released", "live_links_resubmit_declined", "order_cancelled"];

/**
 * Indexes of review cards whose buttons must not work any more: a newer card of the same kind
 * came after them, or the deal moved past their step. Every old card used to keep its
 * Approve / Request-changes buttons — on campaigns and UGC alike.
 */
export function supersededReviewCards(messages) {
  const out = new Set();
  if (!Array.isArray(messages)) return out;
  const typeOf = (m) => (m?.message_type || m?.type || m?.metadata?.action || "").toLowerCase();
  let laterLink = false;
  let laterDraft = false;
  let laterLinkDecline = false; // v414: declined cards are superseded too (only the latest keeps buttons)
  let laterDraftDecline = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const t = typeOf(m);
    if (t === "live_links_resubmit_declined") { // v414
      if (laterLinkDecline || laterLink) out.add(i);
      laterLinkDecline = true;
    } else if (t === "revision_declined" || t === "live_declined") { // v414
      if (laterDraftDecline || laterDraft) out.add(i);
      laterDraftDecline = true;
    }
    if (isLiveLinkMessage(m)) {
      if (laterLink) out.add(i);
      laterLink = true;
    } else if (isDeliverableMessage(m)) {
      if (laterDraft) out.add(i);
      laterDraft = true;
    }
    if (LINK_STEP_CLOSERS.includes(t)) laterLink = true;
    if (DRAFT_STEP_CLOSERS.includes(t) || isLiveLinkMessage(m)) laterDraft = true;
    // v414: a newer submission / approval / payout closes an older decline card
    if (isLiveLinkMessage(m) || ["live_links_approved", "payment_released", "payout_released", "order_cancelled"].includes(t)) laterLinkDecline = true;
    if (isDeliverableMessage(m) || isLiveLinkMessage(m) || ["content_approved", "draft_approved", "payment_released", "payout_released", "live_links_approved", "order_cancelled", "revision_requested", "changes_requested"].includes(t)) laterDraftDecline = true;
  }
  return out;
}

// v332: a message with a bad / missing date showed "Invalid Date" under the bubble.
const istTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).replace(/\b(am|pm)\b/g, (s) => s.toUpperCase());
};

// v417: date line ("Today" / "Yesterday" / "7 Nov 2026") above the row; the row before it comes from allMessages.
export default function MobileMessageRow({ allMessages = [], ...props }) {
  const list = Array.isArray(allMessages) ? allMessages : [];
  const i = list.indexOf(props.message);
  const prev = i < 0 ? undefined : (i === 0 ? null : list[i - 1]);
  return (<><DateSeparator message={props.message} prevMessage={prev} /><MobileMessageRowBody {...props} allMessages={list} /></>);
}

function MobileMessageRowBody({
  message,
  isMine,
  isBrand,
  isUgcOrder,
  thread,
  amount,
  campaignTitle,
  isDealCompleted,
  onAcceptOffer,
  onCounterOffer,
  onApproveDeliverable,
  onOpenRequestChanges,
  onOpenReupload,
  isUploadDue = false, // v353
  onApproveLiveLinks,
  onOpenRejectLiveLinks,
  onOpenContract,
  onOpenRating,
  onDeclineChanges,
  onOpenOrderSupport,
  isChangesActive = false,
  // Session 31: brand's "send corrected live links" request (was shown as a submitted-links card
  // with Approve & pay on it).
  onOpenLiveLink,
  // Session 43 (Ravi): the "Draft approved" box carries its own Submit live link button (as on
  // desktop), not only the quick bar under the chat.
  isLiveLinkDue = false,
  onDeclineLinkResubmission,
  isLinkFixActive = false,
  isSuperseded = false,
  // Needed by MobileOfferCard (v171c) to tell the latest offer from older ones. It was used
  // below without being a prop — a ReferenceError that crashed the mobile chat on any offer.
  allMessages = [],
  onRetry = null, // v414: tap a failed bubble to send it again
}) {
  const rawType = (message.message_type || message.type || message.metadata?.action || "").toLowerCase();
  const contentLower = legacyText(message); // v414: "" for typed/user messages — they never become cards by text
  const userTyped = isUserTyped(message); // v414

  const isShortlistCongrats = !userTyped && (
    rawType === "campaign_approved" ||
    rawType === "brand_invitation_card" ||
    rawType === "pitch_invite" ||
    contentLower.includes("you're invited to collaborate") ||
    contentLower.includes("congratulations! you've been selected") ||
    contentLower.includes("you have been selected") ||
    contentLower.includes("you've been selected. let's negotiate") ||
    contentLower.includes("you've been selected"));

  const isCreatorApplicationOffer = !userTyped && (
    rawType === "creator_application_offer" ||
    rawType === "brand_invitation_offer" ||
    rawType === "creator_invitation_acceptance" ||
    contentLower.includes("excited to collaborate") ||
    contentLower.includes("thank you for choosing me") ||
    contentLower.includes("thank you for the invitation") ||
    contentLower.includes("here is my proposal below") ||
    contentLower.includes("mera proposal neeche hai") ||
    (contentLower.includes("my proposal:") && contentLower.includes("₹")));

  const isOffer = rawType === "offer" || rawType === "negotiation_offer";
  const isContract =
    rawType === "contract_signing" ||
    rawType === "contract_ready" ||
    rawType === "partially_signed";
  const isExecuted = rawType === "agreement_executed" || contentLower.includes("agreement executed");
  const isSigningAnnouncement =
    !isExecuted &&
    (rawType === "brand_signed" ||
      rawType === "creator_signed" ||
      rawType === "agreement_signed" ||
      contentLower.includes("has signed the partnership agreement") ||
      contentLower.includes("has signed the agreement") ||
      contentLower.includes("has signed the ugc contract") ||
      contentLower.includes("brand has signed") ||
      contentLower.includes("creator has signed") ||
      contentLower.includes("brand signed") ||
      contentLower.includes("creator signed"));
  const isChangesRequested = rawType === "changes_requested" || rawType === "revision_requested";
  const isRevisionDeclined = rawType === "revision_declined" || rawType === "live_declined";
  // Session 43 (Ravi): the creator declining the brand's live-link changes came through as a plain
  // purple message. It is a card now, like the draft decline (brand: support / re-request / approve).
  const isLinkFixDeclined =
    rawType === "live_links_resubmit_declined" ||
    message.metadata?.action === "live_links_resubmit_declined" ||
    contentLower.includes("declined live links resubmission") ||
    contentLower.includes("declined live link resubmission");
  // v414 (F3): payout is decided first — "UGC Deliverable Approved & Payment Released!" is a payout, not "Draft approved".
  const isPayout =
    rawType === "payment_trigger" ||
    rawType === "payment_released" ||
    rawType === "payout_released" ||
    rawType === "live_links_approved" ||
    contentLower.includes("payment released") ||
    contentLower.includes("payout released") ||
    contentLower.includes("payout has been released");
  const isDraftApproved = !isPayout && (
    rawType === "content_approved" ||
    rawType === "draft_approved" ||
    contentLower.includes("draft approved") ||
    contentLower.includes("draft video approved") ||
    contentLower.includes("deliverable approved"));
  const isLiveLink = isLiveLinkMessage(message);
  const isLinkResubmitRequest =
    rawType === "live_links_resubmit_request" || rawType === "live_links_resubmit_requested" ||
    message.metadata?.action === "live_links_resubmit_requested";
  const isDeliverable = isDeliverableMessage(message);
  const isEscrowFunded =
    rawType === "payment_secured" ||
    rawType === "payment_funded" ||
    contentLower.includes("escrow funded");

  // Direct invitation: the creator's automatic thank-you is a card (session 27).
  const greetMeta = typeof message?.metadata === "string"
    ? (() => { try { return JSON.parse(message.metadata); } catch { return {}; } })()
    : (message?.metadata || {});
  if (greetMeta?.action === "invite_greeting") {
    return <MobileInviteThanksCard message={message} campaignTitle={campaignTitle} isMine={isMine} thread={thread} />;
  }

  if (isShortlistCongrats) {
    return (
      <MobileShortlistCongratsCard
        message={message}
        campaignTitle={campaignTitle}
        isMine={isMine}
        amount={amount}
        thread={thread}
      />
    );
  }

  if (isCreatorApplicationOffer) {
    return (
      <MobileCreatorApplicationOfferCard
        message={message}
        campaignTitle={campaignTitle}
        isMine={isMine}
        isBrand={isBrand}
        thread={thread}
        amount={amount}
        // Accepting the opening offer = signing the contract at that amount, exactly like the
        // desktop card (ContractModal). It used to call brand-accept-counter, which answers
        // 409 NO_COUNTER_PENDING when no counter exists — so mobile "Accept ₹X" never worked.
        onAcceptOffer={onOpenContract || onAcceptOffer}
        onCounterOffer={onCounterOffer}
        allMessages={allMessages}
      />
    );
  }

  if (isOffer) {
    return (
      <MobileOfferCard
        message={message}
        isMine={isMine}
        isBrand={isBrand}
        onAccept={onAcceptOffer}
        onCounter={onCounterOffer}
        allMessages={allMessages}
        thread={thread}
      />
    );
  }

  if (isContract) {
    return (
      <MobileContractCard
        message={message}
        thread={thread}
        isBrand={isBrand}
        onOpenContract={onOpenContract}
      />
    );
  }

  if (isExecuted) {
    // Session 43 (Ravi): no separate box — a centred line like "Offer of ₹X accepted…" above it.
    const amt = amount ? ` ₹${Number(amount).toLocaleString("en-IN")}` : "";
    return (
      <MobileEventRow
        message={{
          ...message,
          content: isBrand
            ? `🎉 Both parties have now signed the${amt} agreement. The deal is active — fund the secure payment hold to start the work.`
            : `🎉 Both parties have now signed the${amt} agreement. The deal is active — waiting for the brand to fund the secure payment hold.`,
        }}
      />
    );
  }

  if (isSigningAnnouncement) {
    return <MobileEventRow message={message} />;
  }

  if (isLinkResubmitRequest) {
    return (
      <MobileChangesCard
        variant="links"
        message={message}
        isBrand={isBrand}
        onOpenReupload={onOpenLiveLink}
        onDeclineChanges={onDeclineLinkResubmission}
        isActive={isLinkFixActive && !isSuperseded}
      />
    );
  }

  if (isChangesRequested) {
    return (
      <MobileChangesCard
        message={message}
        isBrand={isBrand}
        onOpenReupload={onOpenReupload}
        onDeclineChanges={onDeclineChanges}
        isActive={isChangesActive}
      />
    );
  }

  if (isLinkFixDeclined) {
    const raw = message.metadata?.reason || message.metadata?.feedback || String(message.content || message.text || "");
    const reason = raw.includes(":") && /declined live links? resubmission/i.test(raw) ? raw.split(":").slice(1).join(":").trim() : raw;
    const canAct = !isDealCompleted && !isSuperseded;
    return (
      <MobileDeclinedCard
        variant="links"
        message={{ ...message, metadata: { ...(message.metadata || {}), reason: reason || "The creator declined the link changes." } }}
        isBrand={isBrand}
        onApproveLast={canAct ? onApproveLiveLinks : null}
        onOpenChanges={canAct ? onOpenRejectLiveLinks : null}
        onContactSupport={onOpenOrderSupport || (() => { window.location.assign("/help/tickets"); })}
        isDone={Boolean(isDealCompleted || isSuperseded) /* v353 */}
      />
    );
  }

  if (isRevisionDeclined) {
    return (
      <MobileDeclinedCard
        message={message}
        isBrand={isBrand}
        // v332: same rule as the link card above — after the deal is done the old buttons stay off
        // v414: and an older (superseded) decline card has no working buttons either
        onApproveLast={!isDealCompleted && !isSuperseded ? onApproveDeliverable : null}
        onOpenChanges={!isDealCompleted && !isSuperseded ? onOpenRequestChanges : null}
        onContactSupport={onOpenOrderSupport || (() => { window.location.assign("/help/tickets"); })}
        isDone={Boolean(isDealCompleted || isSuperseded) /* v353 */}
      />
    );
  }

  if (isDraftApproved) {
    const timeText = istTime(message.created_at); // session 30: no made-up time when the message has none (v332: + no "Invalid Date")

    return (
      <div
        style={{
          flexShrink: 0,
          alignSelf: "stretch",
          boxSizing: "border-box",
          borderLeft: "3px solid #0B7B45",
          borderRadius: "4px 14px 14px 4px",
          background: "#fff",
          padding: "12px 14px",
          boxShadow: "0 10px 24px -22px rgba(16,16,20,.5)",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 10,
              flexShrink: 0,
              background: "#ECFDF5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              font: "400 13px/28px 'DM Sans',sans-serif",
            }}
          >
            🎬
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                font: "600 9.5px 'DM Sans',sans-serif",
                letterSpacing: "1px",
                textTransform: "uppercase",
                color: "#0B7B45",
              }}
            >
              Draft approved 🎉
            </div>
            <div style={{ marginTop: 3, font: "600 12.5px 'DM Sans',sans-serif", color: "#0A0A0A" }}>
              Woohoo! Draft approved
            </div>
          </div>
          <span style={{ font: "400 10.5px 'DM Sans',sans-serif", color: "#6E6E7C", flexShrink: 0 }}>
            {timeText}
          </span>
        </div>
        <div style={{ marginTop: 8, font: "400 12px/1.5 'DM Sans',sans-serif", color: "#5C5C6B" }}>
          {isBrand
            ? "You approved the draft. Waiting for the creator to post it and send the live link ⏳"
            : "Brand has approved your content draft. Post it and submit your live post link."}
        </div>
        {!isBrand && isLiveLinkDue && onOpenLiveLink && (
          <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onOpenLiveLink}
              data-testid="draft-approved-submit-link"
              style={{
                height: 40, padding: "0 16px", borderRadius: 12, border: "none", background: "#0B7B45", color: "#fff",
                font: "700 13px 'DM Sans',sans-serif", display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer",
              }}
            >
              🔗 Submit live link
            </button>
          </div>
        )}
      </div>
    );
  }

  if (isLiveLink) {
    return (
      <MobileLiveLinksCard
        message={message}
        thread={thread}
        isMine={isMine}
        isBrand={isBrand}
        amount={amount}
        isDealCompleted={isDealCompleted}
        isSuperseded={isSuperseded}
        onApprove={onApproveLiveLinks}
        onReject={onOpenRejectLiveLinks}
      />
    );
  }

  if (isDeliverable) {
    return (
      <MobileDeliverableCard
        message={message}
        thread={thread}
        isMine={isMine}
        isBrand={isBrand}
        isUgcOrder={isUgcOrder}
        isDealCompleted={isDealCompleted}
        isSuperseded={isSuperseded}
        onApprove={onApproveDeliverable}
        onRequestChanges={onOpenRequestChanges}
        onContactSupport={onOpenOrderSupport || (() => { window.location.assign("/help/tickets"); }) /* v417: revision limit reached */}
        onReupload={onOpenReupload}
      />
    );
  }

  if (isEscrowFunded) {
    return (
      <MobileEscrowFundedCard
        message={message}
        amount={amount}
        campaignTitle={campaignTitle}
        isBrand={isBrand}
        onOpenUpload={isUploadDue ? onOpenReupload : null /* v353: only while the draft upload is the next step */}
      />
    );
  }

  if (isPayout) {
    return (
      <MobilePayoutCard
        message={message}
        isBrand={isBrand}
        thread={thread}
        amount={amount}
        campaignTitle={campaignTitle}
        onOpenRating={onOpenRating}
      />
    );
  }

  if (message.sender_role === "system" || rawType === "system") {
    return <MobileEventRow message={message} />;
  }

  // Plain Chat Message Bubble
  const timeText = istTime(message.created_at); // v330: IST; v332: no "Invalid Date"
  const content = message.content || message.text || "";
  const failed = message.status === "failed";
  const canRetry = failed && typeof onRetry === "function"; // v414
  const bubbleRadius = isMine ? "20px 20px 8px 20px" : "20px 20px 20px 8px";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      onClick={canRetry ? onRetry : undefined /* v414 */}
      role={canRetry ? "button" : undefined}
      aria-label={canRetry ? "Message not sent. Tap to try again" : undefined}
      data-testid={failed ? "failed-message" : undefined}
      style={{
        cursor: canRetry ? "pointer" : undefined, // v414
        flexShrink: 0,
        alignSelf: isMine ? "flex-end" : "flex-start",
        // Size to the message (session 23): a fixed 302px made "Hii" a full-width bar.
        width: "fit-content",
        minWidth: 64,
        maxWidth: "78%",
        borderRadius: bubbleRadius,
        padding: "9px 13px 7px",
        background: isMine ? "linear-gradient(165deg,#7C3AED,#5B21B6)" : "#fff",
        color: isMine ? "#fff" : "#0A0A0A",
        boxShadow: "0 10px 24px -20px rgba(16,16,20,.4)",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {(message.sender_role === "admin" || isSupportMessage(message)) && !isMine && (
        /* v415: staff message; v417: small badge + name, old and new shapes */
        <div data-testid="support-label" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <span style={{ font: "700 9.5px 'DM Sans',sans-serif", letterSpacing: ".04em", textTransform: "uppercase", color: "#fff", background: "#6D28D9", borderRadius: 4, padding: "1px 5px" }}>Staff</span>
          <span style={{ font: "700 11px 'DM Sans',sans-serif", color: "#6D28D9" }}>Ybex Support</span>
        </div>
      )}
      {/* v330: keep the line breaks people type (they were collapsed into one line) */}
      <div style={{ font: "400 13px/1.45 'DM Sans',sans-serif", wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}><LinkifiedText text={content} linkClassName="underline underline-offset-2 font-medium" linkStyle={{ color: "inherit", wordBreak: "break-all" }} /></div>{/* v415: M7 */}
      {(() => { /* v417: the attached file itself (it showed only "📎 Attached file") — opened through the private media link */
        const att = message.metadata?.attachment_url;
        const href = att ? mediaProxyUrl(att) : "";
        if (!href) return null;
        return /\.(png|jpe?g|webp|gif)$/i.test(String(att))
          ? <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: "block", marginTop: 6 }}><img src={href} alt="Attachment" loading="lazy" style={{ maxHeight: 220, maxWidth: "100%", borderRadius: 12, objectFit: "cover" }} /></a>
          : <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: "inline-block", marginTop: 6, color: "inherit", fontWeight: 700, textDecoration: "underline" }}>Open file</a>;
      })()}
      <div
        style={{
          marginTop: 3,
          font: "400 10px 'DM Sans',sans-serif",
          // v332: red #EF4444 on the purple bubble was unreadable — a light red there
          color: failed ? (isMine ? "#FECACA" : "#DC2626") : isMine ? "rgba(255,255,255,.7)" : "#6E6E7C",
          fontWeight: failed ? 600 : 400,
          textAlign: isMine ? "right" : "left",
        }}
      >
        {failed
          ? (message.fail_reason ? `Not sent — ${message.fail_reason}` : "Not sent — tap to try again") /* v414: server's reason for a block; else retry */
          : message.status === "sending" ? "Sending…" : timeText}
      </div>
    </motion.div>
  );
}
