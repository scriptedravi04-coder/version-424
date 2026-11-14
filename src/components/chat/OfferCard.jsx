import { openOfferFloor, inr0 } from "./mobile/chatStageMap"; // v419
import { isThreadCancelled } from "./dealState"; // v414
import React, { useState } from "react";
import { safeArray } from "../../utils/safeFormat";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Send, X } from "lucide-react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { calmError } from "./calmError"; // v332
import { istTime } from "./chatTime"; // v332

export default function OfferCard({ 
  message, 
  threadId, 
  thread,
  campaignTitle, 
  onActionComplete, 
  isMine, 
  isUserBrand, 
  onViewContract,
  allMessages
}) {
  const offer = message.metadata || {};
  const displayAmount = offer.amount || offer.proposed_amount || (thread && (thread.counter_amount || thread.amount_fixed)) || 0;

  const threadStatusUpper = String(thread?.status || '').toUpperCase();
  const threadFlowUpper = String(thread?.flow_state || '').toUpperCase();

  // v414: "Signed ✓" only when BOTH signatures are in (or the deal has moved past signing). One signature used to
  // flip status to ACTIVE and this card said "Signed ✓" while the other side hadn't signed yet.
  // (flow ACTIVE is only written once the contract is executed — for UGC that's the creator's signature.)
  const isAgreementExecuted = Boolean(
    (thread?.agreement_signed_creator && thread?.agreement_signed_brand) ||
    threadFlowUpper === 'ACTIVE' ||
    ['ESCROW_PAID', 'ESCROW_FUNDED', 'COMPLETED', 'PAID', 'CONTENT_SUBMITTED', 'IN_REVIEW', 'APPROVED', 'CLOSED'].includes(threadStatusUpper) ||
    ['ESCROW_PAID', 'ESCROW_FUNDED', 'COMPLETED', 'CONTENT_SUBMITTED', 'IN_REVIEW', 'APPROVED', 'CLOSED'].includes(threadFlowUpper)
  );

  const isAgreementReady = Boolean(
    threadFlowUpper === 'AI_AGREEMENT_READY' ||
    threadFlowUpper === 'AGREEMENT_SIGNED' ||
    threadStatusUpper === 'AI_AGREEMENT_READY' ||
    threadStatusUpper === 'AGREEMENT_SIGNED'
  );

  // Check if this offer was superseded by a newer counter offer in the thread
  const myMsgId = message.id || message.message_id;
  const myCreatedAt = message.created_at ? new Date(message.created_at).getTime() : 0;

  const offerMessages = (allMessages || []).filter(m => 
    m && (m.message_type === 'negotiation_offer' || m.message_type === 'offer')
  );

  let isSuperseded = false;
  if (offerMessages.length > 1) {
    const myIndex = offerMessages.findIndex(m => (m.id || m.message_id) === myMsgId);
    if (myIndex !== -1) {
      if (myIndex < offerMessages.length - 1) {
        isSuperseded = true;
      }
    } else if (myCreatedAt > 0) {
      const hasNewer = offerMessages.some(m => {
        const t = m.created_at ? new Date(m.created_at).getTime() : 0;
        return t > myCreatedAt;
      });
      if (hasNewer) isSuperseded = true;
    }
  }

  if (offer.status === 'COUNTERED' || message.status === 'COUNTERED') {
    isSuperseded = true;
  }

  // v414: a counter declined on the server (decline-counter posts a 'counter_offer_declined' system message after it).
  const isDeclined = !isSuperseded && (allMessages || []).some(m => {
    if (m?.metadata?.action !== 'counter_offer_declined') return false;
    const t = m.created_at ? new Date(m.created_at).getTime() : 0;
    return t >= myCreatedAt;
  });

  // v414: UGC prices are fixed by the brief — the server refuses counters/accepts there, so the card is read-only
  const isUgcThreadCard = Boolean(thread && (thread.is_ugc || thread.ugc_order_id || thread.ugc_brief_id ||
    String(thread.deal_type || '').toUpperCase() === 'UGC' || /^(thread_ugc_|ugcord_)/.test(String(thread.id || ''))));
  const dealClosedCard = isThreadCancelled(thread) && !isAgreementExecuted; // v414: cancelled deal → read-only card
  const isResolved = Boolean(
    isUgcThreadCard || dealClosedCard ||
    offer.status === 'ACCEPTED' || 
    offer.status === 'SIGNED' || 
    offer.status === 'REJECTED' ||
    isDeclined || // v414
    isAgreementExecuted ||
    isAgreementReady ||
    isSuperseded
  );

  const isPending = !isResolved;
  // v414: the counter's own revisions, else the thread's, else the server default (5). 0 is a real value.
  const revisionsIncluded = [offer.revision_count, thread?.revision_count]
    .map(v => (v === null || v === undefined || v === '' ? NaN : Number(v)))
    .find(n => Number.isFinite(n) && n >= 0) ?? 5;
  const [loading, setLoading] = useState(false);
  const [isNegotiating, setIsNegotiating] = useState(false);
  const [counterPrice, setCounterPrice] = useState("");

  const timeText = istTime(message.created_at); // v330: IST; v332: a missing date showed "Invalid Date"
  // v332: IST / Indian date order, "Invalid Date" guarded, and "As agreed" instead of the bare "N/A"
  const deadlineText = offer.deadline && !Number.isNaN(new Date(offer.deadline).getTime())
    ? new Date(offer.deadline).toLocaleDateString("en-IN", { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: "Asia/Kolkata" })
    : 'As agreed';
  
  const handleAcceptOffer = async () => {
    setLoading(true);
    try {
      const response = await api.post(`/campaign/threads/${threadId}/brand-accept-counter`, {
        counter_amount: displayAmount
      });
      toast.success("Offer accepted! Agreement updated successfully. 🤝");
      if (onActionComplete) onActionComplete(response.data);
    } catch (err) {
      toast.error(calmError(err, "Couldn't accept the offer. Please try again.")); // v332: no raw error text
    } finally {
      setLoading(false);
    }
  };

  const handleSendCounter = async () => {
    const amountNum = Number(counterPrice);
    if (!counterPrice || amountNum <= 0) {
      toast.error("Please enter a valid price.");
      return;
    }
    if (amountNum < openOfferFloor()) { // v419: ₹500 for Ybex in-house brands
      toast.error(`Minimum offer amount for this deal is ${inr0(openOfferFloor())}.`);
      return;
    }
    
    setLoading(true);
    try {
      const response = await api.post(`/campaign/threads/${threadId}/creator-negotiate`, {
        counter_amount: amountNum
      });
      toast.success("Counter offer proposed! 🚀", {
        description: `Counter offer of ₹${amountNum.toLocaleString('en-IN')} sent.`
      });
      setIsNegotiating(false);
      setCounterPrice("");
      if (onActionComplete) onActionComplete(response.data);
    } catch (err) {
      toast.error(calmError(err, "Couldn't send the counter offer. Please try again.")); // v332
    } finally {
      setLoading(false);
    }
  };

  // Styled according to mine vs yours design (Screenshot 3 & Screenshot 2)
  const cardBgClass = isMine 
    ? "bg-[#6366F1] text-white border-none" 
    : "bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-default)]";

  const labelColor = isMine ? "text-indigo-200" : "text-[var(--text-secondary)]";
  const valueColor = isMine ? "text-white" : "text-[var(--text-primary)]";
  const dividerClass = isMine ? "border-indigo-400/30" : "border-[var(--border-default)]";

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`my-2 md:my-3 flex ${isMine ? "justify-end" : "justify-start"}`}
    >
      <div className={`w-full max-w-[280px] sm:max-w-[340px] md:max-w-[380px] p-3.5 md:p-5 shadow-md md:shadow-xl rounded-xl md:rounded-2xl transition-all ${cardBgClass}`}>
        
        {/* Header */}
        <div className="flex justify-between items-center mb-2.5 md:mb-4">
          <span className={`text-[11px] md:text-[10px] font-bold uppercase tracking-wider ${isMine ? "text-indigo-100/90" : "text-[var(--text-tertiary)]"}`}>
            {isMine ? "Offer from You" : (isUserBrand ? "Offer from Creator" : "Offer from Brand")}
          </span>
          <span className={`text-[11px] md:text-[10px] ${isMine ? "text-indigo-200/80" : "text-[var(--text-tertiary)]"}`}>{timeText}</span>
        </div>

        {/* Amount */}
        <div className="text-xl md:text-3xl font-mono font-black tracking-tight mb-2.5 md:mb-4 flex items-baseline">
          <span className="text-sm md:text-lg mr-1 opacity-90">₹</span>
          <span>{Number(displayAmount).toLocaleString('en-IN') /* v332: a text amount ("5000") showed without commas */}</span>
        </div>

        {/* Detailed Breakdown Box */}
        <div className={`space-y-1.5 md:space-y-3 pt-2 md:pt-3 border-t ${dividerClass}`}>
          <div className="flex justify-between text-[11px] md:text-xs">
            <span className={labelColor}>Campaign</span>
            <span className={`font-semibold ${valueColor} truncate max-w-[130px] md:max-w-[160px]`}>{campaignTitle}</span>
          </div>
          
          <div className="flex justify-between text-[11px] md:text-xs">
            <span className={labelColor}>Deadline</span>
            <span className={`font-semibold ${valueColor}`}>{deadlineText}</span>
          </div>

          <div className="flex justify-between text-[11px] md:text-xs">
            <span className={labelColor}>Revisions</span>
            <span className={`font-semibold ${valueColor}`}>{revisionsIncluded} included</span>{/* v414: was "|| 1"; server default is 5 */}
          </div>

          {offer.deliverables && offer.deliverables.length > 0 ? (
            <div className={`pt-2 border-t ${dividerClass} text-[11px] md:text-xs`}>
              <span className={`block font-bold mb-1 uppercase tracking-wider text-[11px] md:text-[10px] ${isMine ? "text-indigo-100" : "text-[var(--text-secondary)]"}`}>
                Deliverables:
              </span>
              <ul className={`list-disc list-inside space-y-0.5 md:space-y-1 ${isMine ? "text-indigo-100" : "text-[var(--text-secondary)]"} pl-1`}>
                { safeArray(offer.deliverables).map((del, i) => (
                  <li key={i} className="truncate">{typeof del === "object" && del ? (del.title || del.type || del.name || "") : String(del) /* v332: object items crashed / showed [object Object] */}</li>
                ))}
              </ul>
            </div>
          ) : (message.content || message.text) ? (
            <div className={`pt-2 border-t ${dividerClass} text-[11px] md:text-xs`}>
              <p className={`${isMine ? "text-indigo-100" : "text-[var(--text-secondary)]"} italic`}>
                {message.content || message.text}
              </p>
            </div>
          ) : null}
        </div>

        {/* Action Button Section */}
        <div className="mt-3 md:mt-5">
          {isPending ? (
            isMine ? (
              <div className="py-2 md:py-3 w-full text-center bg-white/10 text-indigo-100 text-[11px] md:text-xs font-bold rounded-lg md:rounded-xl border border-white/20 select-none">
                Waiting...
              </div>
            ) : (
              <AnimatePresence mode="wait">
                {!isNegotiating ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="flex gap-2"
                  >
                    <button 
                      onClick={() => setIsNegotiating(true)}
                      disabled={loading}
                      className="flex-1 py-2 md:py-3 bg-[var(--bg-elevated)] hover:bg-[var(--border-default)] border border-[var(--border-default)] text-[var(--text-primary)] text-[11px] md:text-xs font-bold rounded-lg md:rounded-xl transition-colors"
                    >
                      Negotiate
                    </button>
                    <button 
                      onClick={handleAcceptOffer}
                      disabled={loading}
                      className="flex-1 py-2 md:py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-[11px] md:text-xs font-extrabold rounded-lg md:rounded-xl transition-colors shadow-md shadow-emerald-500/10"
                    >
                      {loading ? "Accepting…" : "Accept" /* v332: no sign it was working */}
                    </button>
                  </motion.div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`p-2.5 md:p-3.5 rounded-lg md:rounded-xl border flex flex-col gap-2 md:gap-3 ${
                      isMine ? "bg-[#6D28D9]/50 border-[#7C3AED]/30" : "bg-[var(--bg-elevated)] border-[var(--border-default)]"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] md:text-[10px] font-bold uppercase tracking-wider">Propose Price:</span>
                      <button 
                        type="button"
                        onClick={() => setIsNegotiating(false)}
                        aria-label="Close" /* v332: icon-only button had no label */
                        className="p-1.5 hover:bg-black/10 rounded-full transition-colors"
                      >
                        <X size={12} className="md:w-3.5 md:h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1 px-2.5 py-1.5 md:px-3 md:py-2 bg-[var(--bg-base)] border border-[var(--border-default)] rounded-lg md:rounded-xl">
                      <span className="text-xs font-bold text-[var(--text-secondary)]">₹</span>
                      <input 
                        type="number"
                        value={counterPrice}
                        onChange={e => setCounterPrice(e.target.value)}
                        placeholder={offer.amount ? String(offer.amount) : "Amount"}
                        className="w-full bg-transparent border-none text-xs font-mono font-bold text-[var(--text-primary)] focus:ring-0 focus:outline-none p-0"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button 
                        onClick={() => setIsNegotiating(false)}
                        className="px-2.5 py-1.5 md:px-3 md:py-2 bg-[var(--bg-base)] border border-[var(--border-default)] text-[var(--text-secondary)] text-[11px] md:text-xs font-bold rounded-md md:rounded-lg hover:bg-[var(--bg-elevated)] transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={handleSendCounter}
                        disabled={loading || !counterPrice || Number(counterPrice) <= 0}
                        className="flex-1 py-1.5 md:py-2 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white text-[11px] md:text-xs font-bold rounded-md md:rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        <Send size={11} className="md:w-3 md:h-3" /> Send Propose
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )
          ) : (
            <div className="space-y-2 md:space-y-3">
              <div className={`py-2 md:py-2.5 w-full text-center text-[11px] md:text-xs font-bold rounded-lg md:rounded-xl border flex items-center justify-center gap-1.5 md:gap-2
                ${dealClosedCard ? 'bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-secondary)]' : (offer.status === 'ACCEPTED' || isAgreementExecuted || (isResolved && !isSuperseded && !isDeclined)) ? 'bg-[#F0FDF4] border-[#A7F3D0] text-[var(--green)]' : 
                  (offer.status === 'COUNTERED' || isSuperseded) ? 'bg-[var(--violet-soft)] border-[var(--violet-border)] text-[var(--violet)]' : 
                  offer.status === 'SIGNED' ? 'bg-[#F0FDF4] border-[#A7F3D0] text-[var(--green)]' :
                  'bg-[#FEF2F2] border-[#FECACA] text-[var(--red)]'}`
              }>
                {!dealClosedCard && (offer.status === 'ACCEPTED' || isAgreementExecuted || (isResolved && !isSuperseded && !isDeclined) || offer.status === 'SIGNED') && <CheckCircle size={13} className="md:w-3.5 md:h-3.5" />}
                {isAgreementExecuted ? 'Signed ✓' :
                 dealClosedCard ? 'Deal cancelled' : /* v414 */
                 isSuperseded ? 'Countered' :
                 isDeclined ? 'Declined' : /* v414 */
                 (offer.status === 'ACCEPTED' || isResolved) ? 'Accepted ✓' : 
                 offer.status === 'SIGNED' ? 'Signed ✓' :
                 offer.status === 'COUNTERED' ? 'Countered' : 'Rejected'}
              </div>

              {/* Show Contract only after acceptance */}
              {(offer.status === 'ACCEPTED' || isResolved || offer.status === 'SIGNED' || isAgreementExecuted) && !isSuperseded && !isDeclined && !dealClosedCard /* v414 */ && (
                <button 
                  onClick={() => onViewContract && onViewContract(offer)}
                  className="w-full py-2 md:py-2.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white text-[11px] md:text-xs font-extrabold rounded-lg md:rounded-xl transition-colors shadow-md shadow-[var(--violet)]/10"
                >
                  {isAgreementExecuted ? "View Partnership Contract" : "Sign Partnership Contract"}
                </button>
              )}
            </div>
          )}
        </div>

      </div>
    </motion.div>
  );
}
