import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Loader2, ShieldAlert, RefreshCw, X, Send } from "lucide-react";


// Session 49 (clean-up): moved out of SystemMessage.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function SysLiveLinksDeclinedBody(props) {
  const { brandReRequestNotes, handleApproveLiveLinks, handleSendReRequestLinks, loadingAction, setBrandReRequestNotes, setIsSupportModalOpen, setShowApproveDeclinedConfirm, setShowBrandReRequestForm, showApproveDeclinedConfirm, showBrandReRequestForm, thread } = props;
  return (
    <AnimatePresence mode="wait">
                {!showBrandReRequestForm ? (
                  <motion.div 
                    key="action-buttons"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="flex flex-col gap-2.5 w-full"
                  >
                    {/* Top Row: 2 Buttons */}
                    <div className="grid grid-cols-2 gap-2.5 w-full">
                      {/* 1: Contact Support (White background) */}
                      <button
                        type="button"
                        onClick={() => setIsSupportModalOpen(true)}
                        disabled={loadingAction}
                        className="w-full py-2.5 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-98"
                        title="Contact Ybex Dispute Admin with full order & contact details"
                      >
                        <ShieldAlert size={14} className="text-slate-600 shrink-0" />
                        <span className="truncate">Contact Support</span>
                      </button>

                      {/* 2: Re-request Changes (Yellow background) */}
                      <button
                        type="button"
                        onClick={() => setShowBrandReRequestForm(true)}
                        disabled={loadingAction}
                        className="w-full py-2.5 px-3 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-98"
                        title="Ask creator again to submit correct live links"
                      >
                        <RefreshCw size={14} className="text-amber-700 shrink-0" />
                        <span className="truncate">Re-request Changes</span>
                      </button>
                    </div>

                    {/* 3: Approve Last Submission (Full-Width Green Button with Confirmation) */}
                    {showApproveDeclinedConfirm ? (
                      <div className="space-y-3 bg-emerald-50/50 border border-emerald-100 p-4 rounded-xl mt-2.5">
                        <p className="text-[11px] text-emerald-800 font-bold leading-normal">
                          ⚠️ Are you sure? This releases the secure payout of {Number(thread?.amount_fixed || thread?.agreed_amount) > 0 ? `₹${Number(thread?.amount_fixed || thread?.agreed_amount).toLocaleString('en-IN')}` : "the agreed amount"} to the creator and is completely irreversible.
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setShowApproveDeclinedConfirm(false)}
                            className="py-2 px-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold transition-all cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleApproveLiveLinks}
                            disabled={loadingAction}
                            className="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                          >
                            {loadingAction ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                            <span>Confirm & Release Payment</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowApproveDeclinedConfirm(true)}
                        disabled={loadingAction}
                        className="w-full mt-2.5 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-600/15 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                        title="Accept the previously submitted links and release the payment"
                      >
                        {loadingAction ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={16} />}
                        <span className="truncate">Approve Last Submission</span>
                      </button>
                    )}
                  </motion.div>
                ) : (
                  <motion.div 
                    key="re-request-form"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex flex-col gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">Clarify Link Corrections Needed:</span>
                      <button 
                        type="button"
                        onClick={() => setShowBrandReRequestForm(false)}
                        aria-label="Close" /* v332: icon-only button had no label */
                        className="p-2 hover:bg-slate-200 rounded-full transition-colors cursor-pointer"
                      >
                        <X size={14} className="text-slate-500" />
                      </button>
                    </div>

                    <textarea
                      value={brandReRequestNotes}
                      onChange={e => setBrandReRequestNotes(e.target.value)}
                      placeholder="Explain why the live link needs resubmission (e.g. incorrect URL, private profile, missing tag)..."
                      aria-label="Link corrections needed"
                      className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:ring-1 focus:ring-[#7C3AED] focus:outline-none resize-none h-20"
                    />

                    <div className="flex gap-2">
                      <button 
                        type="button"
                        onClick={() => setShowBrandReRequestForm(false)}
                        className="px-3 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button 
                        type="button"
                        onClick={handleSendReRequestLinks}
                        disabled={loadingAction || !brandReRequestNotes.trim()}
                        className="flex-1 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-50 cursor-pointer"
                      >
                        {loadingAction ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Re-send Resubmit Request
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
  );
}
