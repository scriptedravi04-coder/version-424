import React from "react";
import { AnimatePresence } from "framer-motion";
import { RefreshCw, X, AlertTriangle } from "lucide-react";
import { Presence, PopupBackdrop, PopupPanel } from "../../../components/common/Popup";


// Session 49 (clean-up): moved out of ManageUGCOrdersView.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function DeclineRevisionsModal(props) {
  const { declineMode, declineReason, declining, handleDeclineChanges, setDeclineReason, setShowDeclineModal, showDeclineModal } = props;
  return (
    <AnimatePresence>
        <Presence>{showDeclineModal && (
          <PopupBackdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <PopupPanel kind="modal"
              className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto" /* v332: scrolls when the phone keyboard is open */
            >
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-default)]">
                <div className="flex items-center gap-2 text-rose-600">
                  <AlertTriangle size={18} />
                  <h3 className="font-bold text-sm text-[var(--text-primary)]">
                    {declineMode === "links" ? "Decline Live Link Correction" : "Decline Revision Request"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDeclineModal(false)}
                  aria-label="Close" /* v330 */
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] cursor-pointer" /* v332: bigger tap target */
                >
                  <X size={16} />
                </button>
              </div>

              <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {declineMode === "links"
                  ? "Provide a polite explanation to the brand on why you cannot update the live post or URL (e.g. video already published per agreed brief, algorithm restrictions, etc.)."
                  : "Provide a polite explanation to the brand on why these requested modifications cannot be accommodated (e.g. out of scope of initial brief, physical product limitation, etc.)."}
              </div>

              <div>
                <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1.5">
                  Reason for Declining
                </label>
                <textarea
                  rows={4}
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder={declineMode === "links" ? "Explain why the live post changes cannot be fulfilled..." : "Explain why the requested changes cannot be fulfilled..."}
                  className="w-full p-3 bg-[var(--bg-base)] rounded-xl text-base md:text-xs font-medium text-[var(--text-primary)] border border-[var(--border-default)] outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all resize-none" /* v332: 16px on phones (iOS zoom) */
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeclineModal(false)}
                  className="flex-1 py-2.5 bg-[var(--bg-elevated)] hover:bg-[var(--border-default)] text-[var(--text-secondary)] font-bold text-xs rounded-xl border border-[var(--border-default)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeclineChanges}
                  disabled={declining || !declineReason.trim()}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-red-600/20 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {declining ? <RefreshCw size={14} className="animate-spin" /> : <X size={14} />}
                  <span>{declineMode === "links" ? "Decline Link Correction" : "Decline Revisions"}</span>
                </button>
              </div>
            </PopupPanel>
          </PopupBackdrop>
        )}</Presence>
      </AnimatePresence>
  );
}
