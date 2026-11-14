import React from "react";
import { X, Upload, AlertTriangle, AlertCircle } from "lucide-react";


// Session 49 (clean-up): moved out of ManageUGCOrdersView.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function RevisionAlertHeader(props) {
  const { fileInputRef, selectedOrder, setDeclineMode, setShowDeclineModal, setShowReuploadForm, showReuploadForm } = props;
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 p-5 rounded-2xl space-y-4 shadow-sm relative overflow-hidden text-left">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
                
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 shrink-0 mt-0.5">
                    <AlertTriangle size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-[var(--text-primary)]">Brand Needs Some Changes</h4>
                      <span className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md uppercase tracking-wider font-extrabold">
                        Revision Request
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1">
                      The brand has reviewed your draft and requested some revisions. Please review their instructions and upload the revised video below:
                    </p>
                  </div>
                </div>

                <div className="p-3.5 md:p-4 bg-[var(--bg-base)] border border-amber-500/30 rounded-xl shadow-xs">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <AlertCircle size={14} className="text-amber-500 shrink-0" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      Need Changes (Revision Instructions):
                    </span>
                  </div>
                  <p className="text-xs md:text-sm text-[var(--text-primary)] font-semibold leading-relaxed bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg">
                    {selectedOrder.revisionNotes || "Brand requested modifications to the submitted video."}
                  </p>
                </div>

                {/* Quick Actions */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDeclineMode("draft");
                      setShowDeclineModal(true);
                    }}
                    className="flex-1 py-2.5 px-4 bg-[var(--bg-card)] hover:bg-red-500/10 text-red-600 dark:text-red-400 font-bold text-xs rounded-xl border border-red-500/30 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <X size={14} />
                    <span>Decline Changes</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowReuploadForm(prev => !prev);
                      if (!showReuploadForm) {
                        setTimeout(() => {
                          fileInputRef.current?.scrollIntoView({ behavior: 'smooth' });
                        }, 100);
                      }
                    }}
                    className="flex-1 py-2.5 px-4 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-[#7C3AED]/10 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Upload size={14} />
                    <span>{showReuploadForm ? "Hide Upload Form" : "Upload Revised Deliverable"}</span>
                  </button>
                </div>
              </div>
  );
}
