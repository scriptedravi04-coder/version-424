import React from "react";
import { CheckCircle, Eye } from "lucide-react";


// Session 49 (clean-up): moved out of ChatBox.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function ChatBoxSignatureStatus(props) {
  const { currentThread, getDealAmount, isBrand, setCurrentOffer, setShowContractModal, setShowNegotiationTable } = props;
  return (
    <div className="mt-5 space-y-3">
                          {/* Check who has signed */}
                          <div className="flex flex-col gap-2 p-3 bg-[var(--bg-card)] rounded-xl border border-[var(--border-default)] text-xs text-left">
                            <div className="flex justify-between">
                              <span className="text-[var(--text-secondary)]">Creator Signature:</span>
                              <span className={`font-bold ${currentThread?.agreement_signed_creator ? 'text-emerald-500' : 'text-amber-500'}`}>
                                {currentThread?.agreement_signed_creator ? 'Signed ✓' : 'Pending ⏳'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[var(--text-secondary)]">Brand Signature:</span>
                              <span className={`font-bold ${currentThread?.agreement_signed_brand ? 'text-emerald-500' : 'text-amber-500'}`}>
                                {currentThread?.agreement_signed_brand ? 'Signed ✓' : 'Pending ⏳'}
                              </span>
                            </div>
                          </div>

                          {((isBrand && !currentThread?.agreement_signed_brand) || (!isBrand && !currentThread?.agreement_signed_creator)) ? (
                            <div className="space-y-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setCurrentOffer({
                                    id: currentThread?.id,
                                    amount: getDealAmount(currentThread),
                                    revision_count: currentThread?.revision_count || 1,
                                    deadline: currentThread?.deadline,
                                  });
                                  setShowContractModal(true);
                                }}
                                className="w-full py-3 px-4 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-[var(--violet)]/10 flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <CheckCircle size={16} />
                                <span>Sign Partnership Contract</span>
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => {
                                  setShowNegotiationTable(true);
                                }}
                                className="w-full py-2 px-4 bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] font-bold text-xs rounded-xl border border-[var(--border-default)] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <Eye size={13} />
                                <span>View Offer</span>
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-bold">
                                {/* v332: kept saying "waiting" after both sides had signed */}
                                {currentThread?.agreement_signed_creator && currentThread?.agreement_signed_brand
                                  ? "Both sides have signed the agreement."
                                  : "You have signed! Waiting for the other party's signature."}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowNegotiationTable(true);
                                }}
                                className="w-full py-2 px-4 bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] font-bold text-xs rounded-xl border border-[var(--border-default)] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <Eye size={13} />
                                <span>View Offer</span>
                              </button>
                            </div>
                          )}
                        </div>
  );
}
