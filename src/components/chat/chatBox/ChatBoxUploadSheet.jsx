import { checkLiveLink } from "../../../utils/liveLinkCheck";
import React from "react";
import { Loader2, Upload, CheckCircle, Video, X, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";


// Session 49 (clean-up): moved out of ChatBox.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
// v332: inputs in this phone sheet use 16px text (smaller text made iPhones zoom in on tap).
export default function ChatBoxUploadSheet(props) {
  const { contentNotes, contentUrl, currentThread, handleCreatorSubmitContent, handleSendLiveLinks, isContentApproved, isContentSubmitted, isDealCompleted, isLiveLinksSubmitted, isRevisionRequested, livePostNotes, livePostUrl, messages, selectedUploadFile, setContentNotes, setContentUrl, setLivePostNotes, setLivePostUrl, setShowUploadSheet, showUploadSheet, uploadLoading } = props;
  return (
    <AnimatePresence>
          {showUploadSheet && (
            <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowUploadSheet(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-xs"
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 300 }}
                className="relative z-10 bg-[var(--bg-card)] rounded-t-3xl border-t border-[var(--border-default)] shadow-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[85dvh] overflow-y-auto" /* v332: dvh + clear the iPhone home bar */
              >
                {/* Drag handle */}
                <div className="w-12 h-1.5 bg-gray-300 dark:bg-neutral-700 rounded-full mx-auto mb-4" />

                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#7C3AED]/10 rounded-xl flex items-center justify-center text-[#7C3AED] border border-[#7C3AED]/20 shrink-0">
                      <Video size={20} />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-[var(--text-primary)]">
                        {isDealCompleted ? "Collaboration Completed" : isLiveLinksSubmitted ? "Live Links Under Review" : isContentApproved ? "Submit Live Links" : isContentSubmitted ? "Draft Under Review" : "Upload Content"}
                      </h4>
                      <p className="text-xs text-[var(--text-secondary)]">Deliverable for brand review and approval.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowUploadSheet(false)}
                    aria-label="Close" /* v332: icon-only button had no label */
                    className="p-2.5 rounded-full hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-500 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                {isDealCompleted ? (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-left">
                    <h5 className="text-xs font-bold text-emerald-400">Collaboration Completed! 🎉</h5>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-1">Deliverables approved and payment has been released.</p>
                  </div>
                ) : isLiveLinksSubmitted ? (
                  <div className="space-y-3 text-left">
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-2.5">
                      <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-emerald-400 font-bold">Live Link Submitted! 🚀</p>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          Waiting for brand verification to release payout.
                        </p>
                        {(currentThread?.live_link || (messages || []).find(m => m.message_type === 'live_links_submitted')?.metadata?.link) && (
                          <div className="mt-2 text-[11px] font-mono text-emerald-500 break-all">
                            {currentThread?.live_link || (messages || []).find(m => m.message_type === 'live_links_submitted')?.metadata?.link}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : isContentApproved ? (
                  <div className="space-y-3 text-left">
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2.5">
                      <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                      <p className="text-xs text-emerald-400 font-medium">Draft Approved! Please submit your live link:</p>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1 uppercase tracking-wider">
                        Paste your live post link (Instagram/YouTube/etc.)
                      </label>
                      <input
                        id="sheet-live-post-link-input"
                        type="url"
                        value={livePostUrl}
                        onChange={(e) => setLivePostUrl(e.target.value)}
                        placeholder="https://instagram.com/p/... or https://youtu.be/..."
                        autoCapitalize="none"
                        className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-3 py-2 text-base text-[var(--text-primary)] focus:outline-none focus:border-emerald-500"
                      />
                          {livePostUrl.trim() && !checkLiveLink(livePostUrl).ok && checkLiveLink(livePostUrl).message && (
                            <p className="text-[11px] text-rose-500 mt-1">{checkLiveLink(livePostUrl).message}</p>
                          )}
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1 uppercase tracking-wider">
                        Additional notes for the brand (optional)
                      </label>
                      <textarea
                        id="sheet-live-post-notes-input"
                        rows={2}
                        value={livePostNotes}
                        onChange={(e) => setLivePostNotes(e.target.value)}
                        placeholder="Additional notes for the brand (optional)"
                        className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-3 py-2 text-base text-[var(--text-primary)] focus:outline-none focus:border-emerald-500 resize-none"
                      />
                    </div>
                    <button
                      id="sheet-submit-live-link-button"
                      type="button"
                      onClick={async () => {
                        await handleSendLiveLinks();
                        setShowUploadSheet(false);
                      }}
                      disabled={uploadLoading || !checkLiveLink(livePostUrl).ok}
                      className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {uploadLoading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                      <span>Submit Live Link</span>
                    </button>
                  </div>
                ) : isContentSubmitted && !isRevisionRequested ? (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-left">
                    <h5 className="text-xs font-bold text-amber-500">Draft Currently Under Review</h5>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                      Your deliverable draft has been submitted. The brand will review it shortly.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <input
                      type="url"
                      value={contentUrl}
                      onChange={(e) => setContentUrl(e.target.value)}
                      placeholder="Google Drive, Dropbox, or Loom link..."
                      aria-label="Drive, Dropbox or Loom link"
                      autoCapitalize="none"
                      className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-3 py-2 text-base text-[var(--text-primary)] focus:outline-none"
                    />
                    <textarea
                      rows={2}
                      value={contentNotes}
                      onChange={(e) => setContentNotes(e.target.value)}
                      placeholder="Notes for brand review..."
                      aria-label="Notes for brand review"
                      className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-3 py-2 text-base text-[var(--text-primary)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        await handleCreatorSubmitContent();
                        setShowUploadSheet(false);
                      }}
                      disabled={uploadLoading || (!selectedUploadFile && !contentUrl.trim())}
                      className="w-full py-3 bg-[var(--violet)] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {uploadLoading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      <span>Submit Deliverable</span>
                    </button>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
  );
}
