import React from "react";
import { AlertTriangle } from "lucide-react";


// Session 49 (clean-up): moved out of CreatorUGCMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function RevisionNoticeCard(props) {
  const { declineOpen, declineReason, declining, handleDeclineChanges, selectedOrder, setDeclineOpen, setDeclineReason } = props;
  return <>{selectedOrder.stage === "REVISION_REQUESTED" && (
            <div className="bg-[#FEF2F2] border border-[#FCA5A5] rounded-[18px] p-3.5">
              <div className="flex items-start gap-2.5 text-[#B91C1C]">
                <AlertTriangle size={18} strokeWidth={2.2} className="shrink-0 mt-0.5 text-[#DC2626]" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[13px]">Revision requested by brand</div>
                  {selectedOrder.revisionNotes && (
                    <div className="mt-1 text-[11.5px] leading-relaxed text-[#991B1B] italic bg-white/70 p-2 rounded-[10px] border border-[#FECACA]">
                      “{selectedOrder.revisionNotes}”
                    </div>
                  )}
                  {/* v332: hidden when unknown (it read "Remaining revisions: undefined") */}
                  {Number.isFinite(Number(selectedOrder.revisionsLeft)) && selectedOrder.revisionsLeft !== null && selectedOrder.revisionsLeft !== "" && (
                    <div className="mt-2 text-[10.5px] font-semibold text-[#B91C1C]">
                      Remaining revisions: {selectedOrder.revisionsLeft}
                    </div>
                  )}
                </div>
              </div>

              {/* Session 24: decline the changes (desktop "Decline Changes"). */}
              {declineOpen ? (
                <div className="mt-3 bg-white rounded-[14px] border border-[#FECACA] p-3 flex flex-col gap-2">
                  <div className="font-bold text-[10px] tracking-[0.8px] uppercase text-[#6B7280]">Reason for declining</div>
                  <textarea
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="e.g. This change is outside the agreed brief."
                    className="h-[70px] w-full border border-[#E4E4EC] rounded-[12px] p-2.5 text-[16px] resize-none" /* v332: 16px so iPhone doesn't zoom in */
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setDeclineOpen(false); setDeclineReason(""); }}
                      className="h-10 px-4 rounded-[12px] border border-[#E4E4EC] bg-white text-[#5C5C6B] font-bold text-[12.5px] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDeclineChanges}
                      disabled={declining || !declineReason.trim()}
                      className={`flex-1 h-10 rounded-[12px] font-bold text-[12.5px] text-white ${declining || !declineReason.trim() ? "bg-[#FCA5A5] cursor-not-allowed" : "bg-[#DC2626] cursor-pointer"}`}
                    >
                      {declining ? "Sending…" : "Decline changes"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setDeclineOpen(true)}
                  className="mt-3 w-full h-10 rounded-[12px] border border-[#FCA5A5] bg-white text-[#DC2626] font-bold text-[12.5px] cursor-pointer"
                >
                  Decline changes
                </button>
              )}
            </div>
          )}</>;
}
