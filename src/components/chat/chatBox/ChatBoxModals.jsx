import React from "react";
import { Loader2, CheckCircle, Award, X, Star } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SendBrief from "../SendBrief";
import BrandAgreement from "../BrandAgreement";
import AgreementSign from "../AgreementSign";
import DealInfoPanel from "../DealInfoPanel";
import NegotiationTable from "../NegotiationTable";
import SafetyModal from "../SafetyModal";
import ContractModal from "../ContractModal";
import { Presence } from "../../common/Popup";
import useScrollLock from "../../../lib/useScrollLock"; // v415


// Session 49 (clean-up): moved out of ChatBox.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function ChatBoxModals(props) {
  const { commRating, currentOffer, currentThread, handleAcceptSafety, handleReviewSubmit, isBrand, isNegotiationLocked, loadMessages, overallRating, partnerName, qualRating, refreshThread, reviewComment, setCommRating, setOverallRating, setQualRating, setReviewComment, setShowBrandAgreeModal, setShowBriefModal, setShowContractModal, setShowCreatorAgreeModal, setShowInfoPanel, setShowNegotiationTable, setShowReviewModal, setShowSafetyModal, setTimeRating, showBrandAgreeModal, showBriefModal, showContractModal, showCreatorAgreeModal, showInfoPanel, showNegotiationTable, showReviewModal, showSafetyModal, submittingReview, timeRating, user } = props;
  // v415: rating popup — page behind doesn't scroll, Escape closes (not while saving).
  useScrollLock(Boolean(showReviewModal));
  React.useEffect(() => {
    if (!showReviewModal) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !submittingReview) setShowReviewModal(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showReviewModal, submittingReview, setShowReviewModal]);
  return (
    <AnimatePresence>{/* v415: every child has its own key (AnimatePresence mixed them up without keys) */}
        <SafetyModal key="safety" isOpen={showSafetyModal} onClose={() => setShowSafetyModal(false)} onAccept={handleAcceptSafety} user={user} />
        <Presence key="brief">{showBriefModal && <SendBrief key="sendbrief" threadId={currentThread.id} onClose={() => setShowBriefModal(false)} onSent={() => { loadMessages(); refreshThread(); }} />}</Presence>
        {showBrandAgreeModal && <BrandAgreement key="brandagree" thread={currentThread} onClose={() => setShowBrandAgreeModal(false)} onSigned={() => { loadMessages(); refreshThread(); }} />}
        {showCreatorAgreeModal && <AgreementSign key="creatoragree" thread={currentThread} onClose={() => setShowCreatorAgreeModal(false)} onSigned={() => { loadMessages(); refreshThread(); }} />}
        {showInfoPanel && <DealInfoPanel key="dealinfo" thread={currentThread} role={isBrand ? 'brand' : 'creator'} onClose={() => setShowInfoPanel(false)} />}
        {showNegotiationTable && <NegotiationTable key="negotiation" thread={currentThread} role={isBrand ? 'brand' : 'creator'} locked={isNegotiationLocked} onClose={() => setShowNegotiationTable(false)} onActionComplete={() => { loadMessages(); refreshThread(); }} />}
        {showContractModal && (
          <ContractModal 
            key="contract"
            thread={currentThread} 
            offer={currentOffer} 
            user={user} 
            onClose={() => setShowContractModal(false)} 
            onSigned={() => { 
              setShowContractModal(false); 
              loadMessages(); 
              refreshThread(); 
            }} 
          />
        )}

        {showReviewModal && (
          <motion.div
            key="review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => { if (e.target === e.currentTarget && !submittingReview) setShowReviewModal(false); } /* v415: tap outside closes */}
            role="dialog"
            aria-modal="true"
            aria-label="Rate collaboration"
            className="fixed inset-0 bg-slate-950/70 z-[1000] flex items-center justify-center p-4" /* v415: above the bottom nav (was z-50) */
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-[var(--bg-card)] border border-[var(--border-strong)] w-full max-w-md rounded-2xl overflow-y-auto max-h-[90dvh] shadow-2xl text-left" /* v332: scrolls on short screens (the buttons were cut off) */
            >
              {/* Header */}
              <div className="p-5 border-b border-[var(--border-default)] flex items-center justify-between bg-gradient-to-r from-[var(--bg-elevated)] to-[var(--bg-card)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                    <Award size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Rate this collaboration</h3>{/* v415: sentence case */}
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">Share how it went</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReviewModal(false)}
                  aria-label="Close" /* v332: icon-only button had no label */
                  className="w-10 h-10 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] rounded-xl transition-all cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 space-y-4">
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Congratulations on completing the campaign! Please share your honest rating of <strong className="text-[var(--text-primary)]">{partnerName}</strong>. Your feedback is fully confidential and helps keep the Ybex marketplace safe and trusted.
                </p>

                {/* Star Selectors */}
                <div className="space-y-1 bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl p-3">
                  <div className="flex items-center justify-between pb-3.5 mb-2 border-b border-[var(--border-default)]">
                    <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wide">Overall rating</span>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setOverallRating(star)}
                          aria-label={`Overall ${star} of 5`} /* v332 */
                          className="p-1 hover:scale-125 transition-transform cursor-pointer"
                        >
                          <Star
                            size={22}
                            className={star <= overallRating ? "fill-amber-400 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]" : "text-slate-600 hover:text-amber-300"}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-xs text-[var(--text-secondary)]">Communication</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button key={star} type="button" onClick={() => setCommRating(star)} aria-label={`Communication ${star} of 5`} className="p-1 cursor-pointer">
                          <Star size={15} className={star <= commRating ? "fill-amber-400 text-amber-400" : "text-slate-600"} />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-xs text-[var(--text-secondary)]">Punctuality</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button key={star} type="button" onClick={() => setTimeRating(star)} aria-label={`Punctuality ${star} of 5`} className="p-1 cursor-pointer">
                          <Star size={15} className={star <= timeRating ? "fill-amber-400 text-amber-400" : "text-slate-600"} />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-xs text-[var(--text-secondary)]">Quality of work</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button key={star} type="button" onClick={() => setQualRating(star)} aria-label={`Quality ${star} of 5`} className="p-1 cursor-pointer">
                          <Star size={15} className={star <= qualRating ? "fill-amber-400 text-amber-400" : "text-slate-600"} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Comment */}
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5" htmlFor="chat-review-comment">Write a review (optional)</label>
                  <textarea
                    rows={3}
                    id="chat-review-comment"
                    className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] focus:border-[var(--violet)] focus:ring-1 focus:ring-[var(--violet)] rounded-xl p-3 text-[16px] md:text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    // v332: the text above says feedback is confidential — the placeholder said it goes to other users
                    placeholder={`How was it working with ${partnerName}?`}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="p-5 border-t border-[var(--border-default)] bg-[var(--bg-elevated)]/40 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowReviewModal(false)}
                  className="flex-1 py-3 bg-[var(--bg-card)] border border-[var(--border-default)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl text-xs font-bold transition-all text-center cursor-pointer"
                >
                  Skip for now
                </button>
                <button
                  type="button"
                  onClick={handleReviewSubmit}
                  disabled={submittingReview}
                  className="flex-1 py-3 bg-gradient-to-r from-[var(--violet)] to-[#7C3AED] hover:from-[#7C3AED] hover:to-[#6D28D9] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submittingReview ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Submitting…</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={14} />
                      <span>Submit review</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
  );
}
