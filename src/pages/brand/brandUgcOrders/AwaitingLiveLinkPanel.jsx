import React from "react";
import { CheckCircle2, MessageCircle, Eye } from "lucide-react";
import VideoEmbedPreview from "../../../components/shared/VideoEmbedPreview";


// Session 49 (clean-up): moved out of BrandUGCOrders.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function AwaitingLiveLinkPanel(props) {
  const { isDeliverableUnlockedForBrand, navigate, selectedOrder, setIsPreviewModalOpen } = props;
  return <>{selectedOrder.stage === "AWAITING_LIVE_LINK" && (
            <div className="bg-[var(--bg-elevated)] border border-emerald-500/30 p-5 rounded-2xl space-y-4 shadow-xs relative overflow-hidden text-left">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-default)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 flex items-center justify-center shrink-0">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">{/* v332: wrap on small screens; shown to the brand, so "You approved" */}
                      <h4 className="text-xs font-bold text-[var(--text-primary)]">You approved the video draft</h4>
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-md uppercase tracking-wider font-extrabold">
                        Draft Approved
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-tertiary)] font-medium mt-0.5">
                      Waiting for creator to publish reel/post on social media and submit the live link
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsPreviewModalOpen(true)}
                  className="bg-[var(--bg-card)] hover:bg-[var(--border-default)] text-[var(--text-primary)] border border-[var(--border-default)] font-bold px-3.5 py-2 rounded-xl text-xs uppercase tracking-wider transition-all shadow-xs active:scale-95 cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <Eye size={14} className="text-[var(--violet)]" />
                  <span>View Approved Draft</span>
                </button>
              </div>

              {/* Video Preview Embed Container */}
              {(selectedOrder.deliverableUrl || selectedOrder.driveUrl) && (
                <div className="rounded-2xl overflow-hidden border border-[var(--border-default)] bg-[var(--bg-elevated)] p-1.5">
                  <VideoEmbedPreview 
                    url={selectedOrder.deliverableUrl || selectedOrder.driveUrl} 
                    isApproved={isDeliverableUnlockedForBrand(selectedOrder)}
                    watermark={!isDeliverableUnlockedForBrand(selectedOrder)}
                  />
                </div>
              )}

              {/* Waiting for Live Link Banner */}
              <div className="p-4 bg-[#F5F0FF]/50 dark:bg-indigo-950/20 border border-[#DDD6FE] dark:border-[#6D28D9]/40 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-[#7C3AED] shrink-0" />{/* v415: no endless ping while waiting */}
                  <div>
                    <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 block">
                      Waiting for the creator's live link{/* v332: calmer copy */}
                    </span>
                    <p className="text-[11px] text-[#6D28D9]/80 dark:text-indigo-300/80 mt-0.5">
                      The creator will publish the approved video and share the live link. You'll check the post here before releasing the payment.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const targetId = selectedOrder.threadId || selectedOrder.id;
                    navigate(`/brand/inbox/${targetId}`);
                  }}
                  className="px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95 whitespace-nowrap self-start sm:self-auto"
                >
                  <MessageCircle size={14} />
                  <span>Chat with Creator</span>
                </button>
              </div>
            </div>
          )}</>;
}
