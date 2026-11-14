import { isThreadCancelled } from "./dealState"; // v414
import React from "react";
import { motion } from "framer-motion";
import { formatAmount } from "../../utils/safeFormat";
import { maskContact } from "../../utils/maskContact";

// The two cards posted when a brand shortlists a creator for a campaign.
//
// Before this, acceptance sent one plain text line — "Congratulations! You've been selected.
// Let's negotiate the terms." — with no renderer for its message_type, so it rendered as an
// ordinary chat bubble carrying no information and no action.
//
// WHY THERE ARE TWO CARDS, AND WHY ONLY ONE HAS BUTTONS
//
// The creator set the price when they applied. Showing the creator an "Accept ₹15,000"
// button on their own offer is meaningless — they will always accept their own number, and
// the brand never gets to negotiate at all. So:
//
//   Card 1  from the BRAND    — the good news. No buttons.
//   Card 2  from the CREATOR  — their application offer. Accept/Negotiate, brand only.
//
// Neither card hardcodes an alignment. MessageBubble decides left/right from `isMine`, so
// the brand sees its own card on the right and the creator's on the left, and the creator
// sees exactly the mirror image. A fixed side would be wrong for one of them.

/**
 * Original handshake illustration.
 *
 * Inline SVG rather than a PNG: no asset to ship, it recolours itself for dark mode through
 * the theme variables, and it stays sharp at any size on any screen.
 */
// Session 43 (Ravi: "proper handshake"): the picture from Ravi's "Handshake Cards" design
// (public/img/handshake.webp), on a soft tinted circle with a floor shadow and two sparkles.
function Handshake({ tone = "violet" }) {
  const green = tone === "green";
  const circle = green ? "#E6F6EF" : "#F2EAFF";
  const floor = green ? "rgba(14,159,110,.16)" : "rgba(124,58,237,.18)";
  const spark = green ? "#5FD3A7" : "#A78BFA";
  const fade = "linear-gradient(90deg,transparent 0,#000 14%,#000 86%,transparent 100%)";
  return (
    <div style={{ position: "relative", height: 140, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 4px" }} role="img" aria-label="Handshake">
      <div style={{ position: "absolute", width: 111, height: 111, borderRadius: "50%", background: circle }} />
      <div style={{ position: "absolute", bottom: 4, width: 182, height: 12, borderRadius: "50%", background: floor, filter: "blur(4px)" }} />
      <span style={{ position: "absolute", zIndex: 1, left: "10%", top: 2, color: spark, fontSize: 14 }}>✦</span>
      <span style={{ position: "absolute", zIndex: 1, right: "11%", top: 0, color: spark, fontSize: 11, opacity: 0.8 }}>✦</span>
      <img
        src="/img/handshake.webp"
        alt=""
        loading="lazy"
        draggable={false}
        style={{ position: "relative", width: 240, maxWidth: "82%", height: "auto", filter: "drop-shadow(0 8px 10px rgba(20,17,28,.22))", WebkitMaskImage: fade, maskImage: fade }}
      />
    </div>
  );
}

const Shell = ({ tone, children }) => (
  <motion.div
    initial={{ opacity: 0, y: 12, scale: 0.98 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    className="w-full max-w-[340px] rounded-[20px] overflow-hidden border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-lg"
  >
    <div
      className="h-[5px]"
      style={{
        background:
          tone === "green"
            ? "linear-gradient(90deg,#34d399,#0f9d58)"
            : "linear-gradient(90deg,#8b5cf6,#6d3aec)"
      }}
    />
    {children}
  </motion.div>
);

// v332: lists / objects (deliverables) showed as "[object Object]" or broke the card; long titles overflowed.
const asText = (v) => (v == null ? "" : Array.isArray(v) ? v.map(asText).filter(Boolean).join(", ") : typeof v === "object" ? String(v.title || v.name || v.type || v.label || "") : String(v));
// v332: dates in IST, nothing instead of "Invalid Date"
const istWhen = (v) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? ` · ${d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).replace(/\b(am|pm)\b/g, (s) => s.toUpperCase())}` : ""; };
const Row = ({ label, value }) => (
  <div className="flex justify-between gap-2.5 text-[12.5px] py-1 border-t border-[var(--border-subtle)] first:border-t-0">
    <span className="text-[var(--text-secondary)] shrink-0">{label}</span>
    <span className="font-bold text-right text-[var(--text-primary)] min-w-0 [overflow-wrap:anywhere]">{asText(value)}</span>
  </div>
);

/** Card 1 — from the brand. Information only; the action lives on the creator's card. */
export function ShortlistCongratsCard({ message, campaignTitle, isMine = false }) {
  const m = message?.metadata || {};
  const isDirectInvite = Boolean(
    m.is_direct_invite || 
    message?.message_type === 'brand_invitation_card' ||
    message?.message_type === 'pitch_invite'
  );
  const title = m.campaign_title || campaignTitle || "this campaign";
  const brandName = m.brand_name || "Brand Partner";

  return (
    <Shell tone="violet">
      <div className="px-4 pt-4 pb-2.5 text-center">
        <Handshake tone="violet" />
        <span className="inline-block text-[11px] font-extrabold tracking-[0.09em] uppercase px-2.5 py-[3.5px] rounded-full mb-2 bg-[var(--violet)]/10 text-[var(--violet)]">
          {isDirectInvite ? "Direct Campaign Invitation" : isMine ? "Creator shortlisted" : "You're shortlisted"}
        </span>
        <h3 className="text-[17px] font-extrabold tracking-tight mb-1 text-[var(--text-primary)]">
          {isMine ? (isDirectInvite ? "Invitation sent 🎉" : "Shortlisted 🎉") : isDirectInvite ? "You're Invited! 🎉" : "Congratulations! 🎉"}
        </h3>
        <p className="text-[12.5px] text-[var(--text-secondary)] m-0">
          {isMine ? (
            <>
              You {isDirectInvite ? "invited this creator to collaborate on" : "shortlisted this creator for"} <b className="text-[var(--text-primary)]">{title}</b>.
            </>
          ) : isDirectInvite ? (
            <>
              <b className="text-[var(--text-primary)]">{brandName}</b> invited you to collaborate on <b className="text-[var(--text-primary)]">{title}</b>.
            </>
          ) : (
            <>
              You have been shortlisted for <b className="text-[var(--text-primary)]">{title}</b>.
              <br />
              Let's finalize the terms.
            </>
          )}
        </p>
      </div>

      <div className="px-4 pb-4">
        <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-[14px] px-3.5 py-3">
          <p className="text-[11px] font-extrabold tracking-[0.08em] uppercase text-[var(--text-tertiary)] mb-1">
            Campaign details
          </p>
          <Row label="Campaign" value={title} />
          {(m.budget_label || m.proposed_budget) ? (
            <Row label="Offered budget" value={m.budget_label || m.proposed_budget} />
          ) : m.amount ? (
            <Row label="Offered budget" value={`₹${formatAmount(m.amount)}`} />
          ) : null}
          {(m.deliverable || m.deliverables) && (
            <Row label="Deliverables" value={m.deliverable || m.deliverables} />
          )}
          {(m.timeline || m.delivery_days) && (
            <Row label="Timeline" value={m.timeline || `${m.delivery_days} days`} />
          )}
        </div>

        {m.pitch && (
          <div className="mt-2.5 bg-[var(--bg-base)] border border-[var(--border-subtle)] border-l-[3px] border-l-[var(--violet)] rounded-[10px] px-3.5 py-2.5 text-left">
            <p className="text-[11px] font-extrabold tracking-[0.08em] uppercase text-[var(--text-tertiary)] mb-0.5">
              Brand's Pitch & Notes
            </p>
            <p className="m-0 text-[13px] italic text-[var(--text-primary)] [overflow-wrap:anywhere]">"{m.pitch}"</p>
          </div>
        )}
      </div>

      <p className="text-[10.5px] text-[var(--text-tertiary)] text-center px-4 pt-2 pb-3 border-t border-[var(--border-subtle)] m-0">
        {isDirectInvite ? "Accepted by creator · Terms open for collaboration" : "No action required — see your offer below"}
      </p>
    </Shell>
  );
}

/**
 * Direct invitation, card 1 (session 27, Ravi): the creator's automatic thank-you, sent when the
 * creator accepts the invite. Information only. The brand's offer card (card 2) follows it.
 */
export function InviteThanksCard({ message, campaignTitle }) {
  const m = message?.metadata || {};
  const title = m.campaign_title || campaignTitle || "this campaign";
  const text = message?.content || message?.text || `Thanks for inviting me to "${title}"! Happy to discuss the details here.`;
  return (
    <Shell tone="violet">
      <div className="px-4 pt-4 pb-3 text-center" data-testid="invite-thanks-card">
        <Handshake tone="violet" />
        <span className="inline-block text-[11px] font-extrabold tracking-[0.09em] uppercase px-2.5 py-[3.5px] rounded-full mb-2 bg-[var(--violet)]/10 text-[var(--violet)]">
          Invitation accepted
        </span>
        <h3 className="text-[17px] font-extrabold tracking-tight mb-1 text-[var(--text-primary)]">
          Thanks for the invite!
        </h3>
        <p className="text-[12.5px] text-[var(--text-secondary)] m-0">{text}</p>
      </div>
      <div className="px-4 pb-4">
        <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-[14px] px-3.5 py-3">
          <Row label="Campaign" value={title} />
        </div>
      </div>
    </Shell>
  );
}

/**
 * Card 2 — from the creator. Their application, replayed into the chat so the brand can act
 * on it.
 *
 * The buttons are gated on the party that did NOT set the price (canAct), never on isMine:
 * the brand answers a creator's application, the creator answers a brand's invitation offer.
 */
export function CreatorApplicationOfferCard({
  message,
  isUserBrand,
  campaignTitle,
  onNegotiate,
  onAccept,
  allMessages,
  thread
}) {
  const m = message?.metadata || {};
  // Direct invitation (session 26): the BRAND's offer, answered by the CREATOR. The mirror of
  // the application card — whoever did not set the price gets Accept / Negotiate.
  const isInviteOffer = message?.message_type === 'brand_invitation_offer' || m.action === 'brand_invitation_offer';
  const isDirectInvite = Boolean(
    !isInviteOffer && (m.is_direct_invite ||
    message?.message_type === 'creator_invitation_acceptance')
  );
  const amount = Number(m.proposed_fee ?? m.amount ?? 0);
  const title = m.campaign_title || campaignTitle || "this campaign";
  // v416 (C2): the creator applied without a fee → no "offer from creator" and no Accept; the brand makes the first offer.
  const noFee = !isInviteOffer && !isDirectInvite && (m.no_fee_proposed === true || !(amount > 0));

  const threadFlowUpper = String(thread?.flow_state || '').toUpperCase();
  const threadStatusUpper = String(thread?.status || '').toUpperCase();
  const isAgreementExecuted = Boolean(
    (thread?.agreement_signed_creator && thread?.agreement_signed_brand) ||
    thread?.agreement_signed_at ||
    threadStatusUpper === 'ACTIVE' ||
    ['ESCROW_PAID', 'ESCROW_FUNDED', 'COMPLETED', 'PAID', 'CONTENT_SUBMITTED', 'IN_REVIEW', 'APPROVED', 'CLOSED'].includes(threadStatusUpper) ||
    ['ESCROW_PAID', 'ESCROW_FUNDED', 'COMPLETED', 'CONTENT_SUBMITTED', 'IN_REVIEW', 'APPROVED', 'CLOSED'].includes(threadFlowUpper)
  );
  const isAgreementReady = Boolean(
    threadFlowUpper === 'AI_AGREEMENT_READY' ||
    threadFlowUpper === 'AGREEMENT_SIGNED' ||
    threadStatusUpper === 'AI_AGREEMENT_READY' ||
    threadStatusUpper === 'AGREEMENT_SIGNED'
  );

  const hasSubsequentCounters = (allMessages || []).some(msg => 
    msg && (msg.message_type === 'negotiation_offer' || msg.message_type === 'offer')
  );

  const sendOfferButton = (
          <button
            type="button"
            onClick={onNegotiate}
            className="w-full text-[12.5px] font-extrabold py-2.5 rounded-xl bg-[var(--violet)] text-white hover:opacity-90 transition-opacity cursor-pointer"
          >
            Send offer
          </button>
  );
  const actionButtons = (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onNegotiate}
              className="flex-1 text-[12.5px] font-extrabold py-2.5 rounded-xl border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
            >
              Negotiate
            </button>
            <button
              type="button"
              onClick={() => onAccept ? onAccept(amount) : (onNegotiate && onNegotiate())}
              className="flex-1 text-[12.5px] font-extrabold py-2.5 rounded-xl bg-[var(--violet)] text-white hover:opacity-90 transition-opacity cursor-pointer"
            >
              {amount > 0 ? `Accept ₹${formatAmount(amount)}` : "Accept" /* v332: no "Accept ₹0" */}
            </button>
          </div>
  );
  const waitingNote = (
          <div className="flex items-center justify-center gap-2 bg-[var(--bg-base)] border border-dashed border-[var(--border-default)] rounded-xl py-2.5 text-[12px] font-bold text-[var(--text-tertiary)]">
            {isInviteOffer ? "Waiting for the creator's reply" : noFee ? "Waiting for the brand's offer" : "Awaiting brand response"}
            <span className="flex gap-1">
              <span className="w-[5px] h-[5px] rounded-full bg-current animate-pulse" />
              <span className="w-[5px] h-[5px] rounded-full bg-current animate-pulse [animation-delay:200ms]" />
              <span className="w-[5px] h-[5px] rounded-full bg-current animate-pulse [animation-delay:400ms]" />
            </span>
          </div>
  );

  return (
    <Shell tone="green">
      <div className="px-4 pt-4 pb-2.5 text-center">
        <Handshake tone="green" />
        <span className={`inline-block text-[11px] font-extrabold tracking-[0.09em] uppercase px-2.5 py-[3.5px] rounded-full mb-2 ${noFee ? "bg-[var(--bg-elevated)] text-[var(--text-secondary)]" : "bg-[var(--green)]/10 text-[var(--green)]"}`}>
          {isInviteOffer ? "Offer from brand" : isDirectInvite ? "Invitation Accepted 🤝" : noFee ? "No fee proposed yet" : "Offer from creator"}{/* v416 (C2) */}
        </span>
        <h3 className="text-[17px] font-extrabold tracking-tight mb-1 text-[var(--text-primary)]">
          {isInviteOffer ? "Glad to have you on board!" : isDirectInvite ? "Excited to collaborate! 🤝" : "Thank you for choosing me! 🤝"}
        </h3>
        <p className="text-[12.5px] text-[var(--text-secondary)] m-0">
          {isInviteOffer
            ? "Thanks for accepting the invitation. Here is our offer — accept it, or suggest your fee."
            : isDirectInvite
            ? "Thank you for the invitation — I've accepted your proposal below."
            : noFee
            ? (isUserBrand ? "The creator didn't propose a fee. Make an offer to start." : "You didn't propose a fee. The brand will send an offer.")
            : "Here is my proposal below — ready to move forward."}
        </p>
      </div>

      <div className="px-4 pb-4">
        <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-[14px] px-3.5 py-3 mb-2.5">
          <p className="text-[11px] font-extrabold tracking-[0.08em] uppercase text-[var(--text-tertiary)] mb-1">
            {isInviteOffer ? "Offered fee" : isDirectInvite ? "Agreed / Proposed fee" : "Proposed fee"}
          </p>
          {noFee ? (
            <p className="text-[15px] font-bold leading-snug mb-2 text-[var(--text-secondary)]">No fee proposed yet — make an offer</p>
          ) : (
          <p className="text-[29px] font-black tracking-tighter font-mono leading-none mb-2 text-[var(--text-primary)]">
            {amount > 0 ? `₹${formatAmount(amount)}` : "—" /* v332: no "₹0" */}
          </p>
          )}
          <Row label="Campaign" value={title} />
          {(m.deliverable || m.deliverables) && (
            <Row label="Deliverables" value={m.deliverable || m.deliverables} />
          )}
          {(m.timeline || m.delivery_days) && (
            <Row label="Timeline" value={m.timeline || `${m.delivery_days} days`} />
          )}
          {m.revisions != null && <Row label="Revisions" value={`${m.revisions} included`} />}
        </div>

        {m.pitch && (
          <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] border-l-[3px] border-l-[var(--violet)] rounded-[10px] px-3.5 py-2.5 mb-2.5 text-left">
            <p className="text-[11px] font-extrabold tracking-[0.08em] uppercase text-[var(--text-tertiary)] mb-0.5">
              {isInviteOffer ? "Brand's note" : "Creator's note"}
            </p>
            <p className="m-0 text-[13px] italic text-[var(--text-primary)] [overflow-wrap:anywhere]">"{maskContact(m.pitch) /* v346: hide phone/email in the creator's note; v414: the brand's invite pitch too */}"</p>
          </div>
        )}

        {isThreadCancelled(thread) && !isAgreementExecuted ? (
          <div className="py-2.5 w-full text-center text-xs font-bold rounded-xl border bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-secondary)] select-none">
            Deal cancelled {/* v414 */}
          </div>
        ) : hasSubsequentCounters ? (
          <div className="py-2.5 w-full text-center text-xs font-bold rounded-xl border bg-[var(--violet-soft)] border-[var(--violet-border)] text-[var(--violet)] select-none">
            Countered
          </div>
        ) : isAgreementExecuted || isAgreementReady ? (
          <div className="py-2.5 w-full text-center text-xs font-bold rounded-xl border bg-[#F0FDF4] border-[#A7F3D0] text-[var(--green)] flex items-center justify-center gap-1.5 select-none">
            {isAgreementExecuted ? "Signed ✓" : "Accepted ✓"}
          </div>
        ) : isInviteOffer ? (
          // Invitation offer: the brand set the price, so the CREATOR answers it.
          !isUserBrand ? actionButtons : waitingNote
        ) : isUserBrand ? (
          // Application offer: the creator set the price, so only the BRAND answers it.
          // v416 (C2): no fee from the creator → the brand sends the first offer (nothing to Accept).
          noFee ? sendOfferButton : actionButtons
        ) : (
          waitingNote
        )}
      </div>

      {/* Footer attribution */}
      <p className="text-[10.5px] text-[var(--text-tertiary)] text-center px-4 pt-2 pb-3 border-t border-[var(--border-subtle)] m-0">
        {isInviteOffer ? "Sent with the invitation" : isDirectInvite ? "Direct Campaign Invitation Accepted" : "Submitted with application"}
        {isInviteOffer ? istWhen(m.invited_at || m.applied_at) : istWhen(m.applied_at)}
      </p>
    </Shell>
  );
}

export default ShortlistCongratsCard;
