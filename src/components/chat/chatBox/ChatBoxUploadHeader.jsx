import React from "react";
import { Video, Clock } from "lucide-react";


// Session 49 (clean-up): moved out of ChatBox.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function ChatBoxUploadHeader(props) {
  const { isContentApproved, isContentSubmitted, isDealCompleted, isLinksRevisionOpen, isLiveLinksSubmitted, isManualRevisionOpen, isRevisionRequested, setInputMode, setIsManualRevisionOpen } = props;
  return (
    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isContentSubmitted && !isDealCompleted && !isContentApproved
                            ? "bg-amber-500/20 text-amber-800 dark:text-amber-300 border-2 border-amber-500/40"
                            : isDealCompleted
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                              : "bg-[#7C3AED]/15 text-[#7C3AED] dark:text-indigo-400 border border-[#7C3AED]/30"
                        }`}>
                          {isContentSubmitted && !isDealCompleted && !isContentApproved ? (
                            <Clock size={20} className="text-amber-700 dark:text-amber-400 animate-pulse" />
                          ) : (
                            <Video size={20} />
                          )}
                        </div>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-[var(--text-primary)]">
                              {isDealCompleted ? "Collaboration Completed" : isLiveLinksSubmitted ? "Live Links Under Review" : isContentApproved ? (isLinksRevisionOpen ? "Resubmit Live Links" : "Submit Live Links") : (isRevisionRequested || isManualRevisionOpen) ? "Submit Revised Deliverable" : isContentSubmitted ? "Draft Under Review" : "Upload Content Deliverable"}
                            </h4>
                            {isLiveLinksSubmitted && !isDealCompleted && (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-900 dark:text-emerald-200 text-[10px] font-mono font-black uppercase tracking-wider">
                                Links Submitted
                              </span>
                            )}
                            {isContentSubmitted && !isDealCompleted && !isContentApproved && !isLiveLinksSubmitted && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-900 dark:text-amber-200 text-[10px] font-mono font-black uppercase tracking-wider">
                                Under Review
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                            {isDealCompleted ? "Deliverables approved and payment has been released." : isLiveLinksSubmitted ? "Your live post link has been submitted to the brand for review and payout release." : isContentApproved ? (isLinksRevisionOpen ? "Please upload the corrected live post URLs based on brand feedback." : "Submit the final live URLs where you published the content.") : (isRevisionRequested || isManualRevisionOpen) ? "Upload your updated video draft deliverable below." : isContentSubmitted ? "Draft has been submitted to the brand for review." : "Upload your video file or share a link for brand review."}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setInputMode("chat");
                          setIsManualRevisionOpen(false);
                        }}
                        className="px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl transition-all cursor-pointer"
                      >
                        Back to Chat
                      </button>
                    </div>
  );
}
