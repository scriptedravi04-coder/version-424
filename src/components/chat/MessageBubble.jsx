import React from "react";
import { ShortlistCongratsCard, CreatorApplicationOfferCard, InviteThanksCard } from "./ShortlistCards";
import { motion } from "framer-motion";
import SystemMessage from "./SystemMessage";
import OfferCard from "./OfferCard";
import ContentProofNotice from "./ContentProofNotice";
import { mediaProxyUrl } from "../../lib/mediaUrl";
import { istTime, dateSeparatorFor } from "./chatTime"; // v332; v417: + date separators
import { allowsLegacyTextMatch, USER_MESSAGE_TYPES, isSupportMessage } from "./dealState"; // v414; v417: + isSupportMessage

// v415: M7 links typed in chat open in a new tab. Only http(s) — "javascript:" etc. stay plain text.
// Trailing punctuation (".", ",", ")") is left out of the link. Text stays text (React escapes it).
const LINK_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
export function splitLinks(text) {
  const str = String(text ?? "");
  const parts = [];
  let last = 0;
  for (const m of str.matchAll(LINK_RE)) {
    let url = m[0];
    const trail = url.match(/[.,;:!?)\]}'"]+$/);
    if (trail) url = url.slice(0, -trail[0].length);
    if (!url) continue;
    let ok = false;
    try { const u = new URL(url); ok = u.protocol === "http:" || u.protocol === "https:"; } catch { ok = false; }
    if (!ok) continue;
    if (m.index > last) parts.push({ text: str.slice(last, m.index) });
    parts.push({ text: url, href: url });
    last = m.index + url.length;
  }
  if (last < str.length) parts.push({ text: str.slice(last) });
  return parts;
}
export function LinkifiedText({ text, linkClassName = "underline underline-offset-2 font-medium break-all", linkStyle }) {
  const parts = splitLinks(text);
  return (
    <>
      {parts.map((p, i) => (p.href ? (
        <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow" className={linkClassName} style={linkStyle} onClick={(e) => e.stopPropagation()}>{p.text}</a>
      ) : <React.Fragment key={i}>{p.text}</React.Fragment>))}
    </>
  );
}

// v417: "Today" / "Yesterday" / "7 Nov 2026" line between days (desktop + mobile list).
// prevMessage = the message shown just before this one (null for the first). Not passed → no line.
export function DateSeparator({ message, prevMessage }) {
  const label = prevMessage === undefined ? "" : dateSeparatorFor(message, prevMessage);
  if (!label) return null;
  return (
    <div className="flex items-center justify-center my-2" style={{ flexShrink: 0, alignSelf: "stretch" }} data-testid="date-separator" role="separator" aria-label={label}>
      <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-white/90 dark:bg-[var(--bg-elevated)] text-slate-600 dark:text-[var(--text-secondary)] border border-[var(--border-default)]" style={{ fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
    </div>
  );
}

// v417: wrapper adds the date line above the bubble.
export default function MessageBubble(props) {
  const sep = <DateSeparator message={props.message} prevMessage={props.prevMessage} />;
  return (<>{sep}<MessageBubbleBody {...props} /></>);
}

function MessageBubbleBody({ message, isMine, isUserBrand, threadId, thread, campaignTitle, onActionComplete, onViewContract, onNegotiate, onSelectUploadTab, onViewInvoice, onTriggerReview, onDownloadInvoice, partnerPic, partnerName, allMessages, onRetry = null /* v414 */ }) {
  const msgType = message.message_type || message.type || message.metadata?.action || '';
  // v414: a typed message ("Payout Released", "will send the live post link tonight") was turned into a card by its
  // text. Text is now only read for old system rows with no type and no sender; user messages are always plain bubbles.
  const isUserMsg = USER_MESSAGE_TYPES.has(String(message.message_type || message.type || '').toLowerCase());
  const msgContent = (!isUserMsg && allowsLegacyTextMatch(message)) ? (message.content || message.text || '') : '';
  
  const isPaymentApprovedMsg = 
    msgType === 'payment_trigger' || 
    msgType === 'payment_released' || 
    msgType === 'payout_released' || 
    msgType === 'live_links_approved' || 
    message.metadata?.action === 'live_links_approved' || 
    message.metadata?.action === 'payment_released' || 
    message.metadata?.action === 'payout_released' || 
    message.metadata?.action === 'PAYOUT_RELEASED' || 
    msgContent.includes("Deliverables Approved & Payment Released") || 
    msgContent.includes("payout is being processed via Escrow") || 
    msgContent.includes("Payment Released & Approved") || 
    msgContent.includes("Payout Released") || 
    msgContent.includes("Payout Disbursed") || 
    msgContent.includes("Invoice generated and payment has been processed");

  const isSystem = !isUserMsg && ( // v414: a user-typed message is never a system card
    isPaymentApprovedMsg ||
    msgType === 'system' || 
    msgType === 'creator_signed' || 
    msgType === 'brand_signed' || 
    msgType === 'agreement_executed' || 
    msgType === 'payment_secured' || 
    msgType === 'contract_signing' || 
    msgType === 'payment_funded' || 
    msgType === 'live_links_submitted' || 
    msgType === 'live_links_resubmit_request' || 
    msgType === 'live_links_resubmit_declined' || 
    msgType === 'chat_closed' || 
    msgType === 'order_cancelled' || 
    msgType === 'content_approved' ||
    message.sender_role === 'system');
  const isOffer = message.message_type === 'offer' || message.message_type === 'negotiation_offer';
  const isContentProof = message.message_type === 'content_proof_submitted' || message.message_type === 'CHANGES_REQUESTED' || message.message_type === 'revision_requested' || message.message_type === 'revision_declined';

  // Shortlist and Direct Invitation cards. Checked before isSystem, which would otherwise swallow them.
  //
  // Alignment comes from isMine, exactly like a normal message: the brand sees its own
  // congratulations/invitation on the right and the creator's offer on the left, and the creator sees
  // the mirror of that. Pinning either card to a fixed side would be wrong for one of them.
  const isShortlistOrInviteCard =
    msgType === 'campaign_approved' ||
    msgType === 'creator_application_offer' ||
    msgType === 'brand_invitation_card' ||
    msgType === 'creator_invitation_acceptance' ||
    msgType === 'brand_invitation_offer' ||
    msgType === 'pitch_invite';

  // Direct invitation: the creator's automatic thank-you is a card too (session 27).
  const inviteMeta = typeof message?.metadata === 'string' ? (() => { try { return JSON.parse(message.metadata); } catch { return {}; } })() : (message?.metadata || {});
  if (inviteMeta?.action === 'invite_greeting') {
    return (
      <div className={`flex ${isMine ? "justify-end" : "justify-start"} my-4 px-2`}>
        <InviteThanksCard message={{ ...message, metadata: inviteMeta }} campaignTitle={campaignTitle} />
      </div>
    );
  }

  if (isShortlistOrInviteCard) {
    const isBrandCard = msgType === 'campaign_approved' || msgType === 'brand_invitation_card' || msgType === 'pitch_invite';
    const justifyClass = isMine ? "justify-end" : "justify-start";
    return (
      <div className={`flex ${justifyClass} my-4 px-2`}>
        {isBrandCard ? (
          <ShortlistCongratsCard message={message} campaignTitle={campaignTitle} isMine={isMine} /* v332: brand's own card no longer says "You're shortlisted" */ />
        ) : (
          <CreatorApplicationOfferCard
            message={message}
            isUserBrand={isUserBrand}
            campaignTitle={campaignTitle}
            onNegotiate={onNegotiate}
            onAccept={() => {
              if (onViewContract) {
                const m = message?.metadata || {};
                const amount = Number(m.proposed_fee ?? m.amount ?? 0);
                onViewContract({
                  amount: amount,
                  campaign_title: m.campaign_title || campaignTitle,
                  deliverable: m.deliverable,
                  timeline: m.timeline
                });
              } else if (onNegotiate) {
                onNegotiate();
              }
            }}
            allMessages={allMessages}
            thread={thread}
          />
        )}
      </div>
    );
  }

  if (isSystem) {
    return (
      <SystemMessage 
        message={message} 
        isUserBrand={isUserBrand} 
        threadId={threadId} 
        campaignTitle={campaignTitle} 
        onActionComplete={onActionComplete} 
        thread={thread}
        isMine={isMine} 
        onViewContract={onViewContract}
        onNegotiate={onNegotiate}
        onSelectUploadTab={onSelectUploadTab}
        onViewInvoice={onViewInvoice}
        onTriggerReview={onTriggerReview}
        onDownloadInvoice={onDownloadInvoice}
        allMessages={allMessages}
      />
    );
  }

  if (isOffer) {
    return (
      <OfferCard 
        message={message} 
        threadId={threadId} 
        thread={thread}
        campaignTitle={campaignTitle} 
        onActionComplete={onActionComplete} 
        isMine={isMine} 
        isUserBrand={isUserBrand}
        onViewContract={onViewContract}
        onNegotiate={onNegotiate}
        allMessages={allMessages}
      />
    );
  }

  if (isContentProof) {
    const justifyClass = isMine ? "justify-end" : "justify-start";
    return (
      <motion.div 
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className={`flex ${justifyClass} my-4 px-2`}
      >
        {!isMine && (
          <div className="w-8 h-8 rounded-full overflow-hidden bg-[var(--bg-elevated)] flex items-center justify-center mr-3 flex-shrink-0 mt-auto mb-1 border border-[var(--border-default)] shadow-sm">
            {partnerPic ? (
              <img src={partnerPic} alt={partnerName} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; } /* v330: no broken-image icon */} />
            ) : (
              <span className="text-xs font-bold text-[var(--text-secondary)] uppercase">
                {(partnerName || "U").charAt(0)}
              </span>
            )}
          </div>
        )}
        
        <ContentProofNotice 
          message={message} 
          isUserBrand={isUserBrand} 
          threadId={threadId} 
          thread={thread}
          allMessages={allMessages}
          onActionComplete={onActionComplete} 
        />
      </motion.div>
    );
  }

  const isBrandSender = message.sender_role === 'brand';
  const isSupportSender = isSupportMessage(message) && !isMine; // v415: staff message, label it "Ybex Support"; v417: old + new shapes
  const justifyClass = isMine ? "justify-end" : "justify-start";
  const roundedCorners = isMine ? "rounded-3xl rounded-br-sm" : "rounded-3xl rounded-bl-sm";
  
  const bubbleBg = isMine
    ? "bg-[var(--violet)] text-white font-semibold"
    : "bg-white dark:bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)] shadow-sm";
     
  const timeTextClass = "text-inherit opacity-60 text-right mt-1";

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={`flex ${justifyClass} my-1 md:my-3`}
    >
      {!isMine && (
        <div className="w-6 h-6 md:w-8 md:h-8 rounded-full overflow-hidden bg-[var(--bg-elevated)] flex items-center justify-center mr-1.5 md:mr-3 flex-shrink-0 mt-auto mb-0.5 border border-[var(--border-default)] shadow-xs">
          {isSupportSender ? (
            <span className="text-[10px] md:text-xs font-bold text-[var(--violet)]">Y</span>
          ) : partnerPic ? (
            <img src={partnerPic} alt={partnerName} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; } /* v330: no broken-image icon */} />
          ) : (
            <span className="text-[10px] md:text-xs font-bold text-[var(--text-secondary)] uppercase">
              {(partnerName || "U").charAt(0)}
            </span>
          )}
        </div>
      )}
      <div
        onClick={message.status === 'failed' && typeof onRetry === 'function' ? onRetry : undefined /* v414: tap to try again */}
        role={message.status === 'failed' && typeof onRetry === 'function' ? 'button' : undefined}
        title={message.status === 'failed' && typeof onRetry === 'function' ? 'Tap to try again' : undefined}
        data-testid={message.status === 'failed' ? 'failed-message' : undefined}
        className={`${message.status === 'failed' && typeof onRetry === 'function' ? 'cursor-pointer ' : ''}max-w-[85%] md:max-w-[75%] px-2.5 py-2 md:px-5 md:py-3.5 text-[13px] md:text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] shadow-sm md:shadow-lg ${bubbleBg} ${roundedCorners}`}>
        {isSupportSender && (
          /* v417: small badge + name so staff messages never look like the brand's / creator's */
          <div className="flex items-center gap-1.5 mb-1" data-testid="support-label">
            <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-[1px] rounded bg-[var(--violet)] text-white">Staff</span>
            <span className="text-[11px] font-bold text-[var(--violet)]">Ybex Support</span>
          </div>
        )}
        <LinkifiedText text={message.content || message.text} />{/* v415: M7 clickable links */}
        {/* Session 58 (Q16): attached file — opens through the private media link */}
        {msgType === 'attachment' && mediaProxyUrl(message.metadata?.attachment_url) && (
          /\.(png|jpe?g|webp|gif)$/i.test(String(message.metadata.attachment_url))
            ? <a href={mediaProxyUrl(message.metadata.attachment_url)} target="_blank" rel="noopener noreferrer" className="block mt-2"><img src={mediaProxyUrl(message.metadata.attachment_url)} alt="Attachment" className="max-h-60 rounded-xl object-cover" loading="lazy" /></a>
            : <a href={mediaProxyUrl(message.metadata.attachment_url)} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 underline font-bold">Open file</a>
        )}
        <div className={`text-[11px] md:text-[10px] mt-0.5 tracking-wider ${timeTextClass}`}>
          {/* v332: a message that failed to send looked sent (it showed a time) — now it says so */}
          {message.status === 'failed' ? <span className="font-bold opacity-100">{message.fail_reason ? `Not sent — ${message.fail_reason}` : (typeof onRetry === 'function' ? "Not sent — tap to try again" : "Not sent — check your connection") /* v414 */}</span> : message.status === 'sending' ? "Sending…" : istTime(message.created_at) /* v332: IST (was the device time zone) and no "Invalid Date" */}
        </div>
      </div>
    </motion.div>
  );
}
