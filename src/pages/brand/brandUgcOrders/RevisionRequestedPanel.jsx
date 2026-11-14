import React from "react";
import { RotateCcw, AlertCircle } from "lucide-react";


// Session 49 (clean-up): moved out of BrandUGCOrders.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function RevisionRequestedPanel(props) {
  const { navigate, selectedOrder } = props;
  return <>{selectedOrder.stage === "REVISION_REQUESTED" && (
            <div className="bg-amber-500/10 border border-amber-500/30 p-5 rounded-2xl space-y-4 shadow-sm relative overflow-hidden text-left animate-in fade-in duration-200">{/* v415: no zoom pop on every refresh */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
              
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 shrink-0 mt-0.5">
                  <AlertCircle size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* v332: this panel is shown to the brand — it said "Brand Needs Some Changes" */}
                    <h4 className="text-sm font-bold text-[var(--text-primary)]">You asked for changes</h4>
                    <span className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md uppercase tracking-wider font-extrabold">
                      Revision Request
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1">
                    The creator has been notified and is editing the video according to your feedback.
                  </p>
                </div>
              </div>

              {/* Revision Instructions Note in Yellow Sync with Chat */}
              <div className="p-3.5 md:p-4 bg-[var(--bg-base)] border border-amber-500/30 rounded-xl shadow-xs">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <AlertCircle size={14} className="text-amber-500 shrink-0" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Your change request:{/* v332: plain copy */}
                  </span>
                </div>
                <p className="text-xs md:text-sm text-[var(--text-primary)] font-semibold leading-relaxed bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg">
                  {selectedOrder.revisionNotes || "No notes were added to this request."}{/* v332: clearer empty fallback */}
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1 text-xs text-amber-700 dark:text-amber-400 font-medium">
                <div className="flex items-center gap-2">
                  <RotateCcw size={14} className="text-amber-500 shrink-0" />{/* v332: no endless spinning icon (looked like a stuck loader) */}
                  <span>Waiting for the creator to upload the revised video</span>
                </div>
                {selectedOrder.threadId && (
                  <button
                    type="button"
                    onClick={() => navigate(`/brand/inbox/${selectedOrder.threadId}`)}
                    className="text-xs font-bold text-[var(--violet)] hover:underline flex items-center gap-1 cursor-pointer min-h-[40px] shrink-0" /* v332: tap target */
                  >
                    <span>View in Chat</span>
                  </button>
                )}
              </div>
            </div>
          )}</>;
}
