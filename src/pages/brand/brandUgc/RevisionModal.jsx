import React from "react";
import { X } from "lucide-react";
import { Presence, PopupBackdrop, PopupPanel } from "../../../components/common/Popup"; // v415
import useScrollLock from "../../../lib/useScrollLock";

// v415: Escape closes the sheet, and the page behind does not scroll while it is open.
function useSheetBehaviour(open, onClose) {
  useScrollLock(open);
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}


// Session 49 (clean-up): moved out of BrandUGCMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function RevisionModal(props) {
  const { handleSubmitRevision, revisionNotes, setRevisionNotes, setShowRevisionModal, showRevisionModal, submittingRevision, isLinkStage = false } = props;
  // v358: the same sheet asks for a corrected LIVE LINK after the draft was approved — video-editing wording was wrong there
  const close = React.useCallback(() => { if (!submittingRevision) setShowRevisionModal(false); }, [submittingRevision, setShowRevisionModal]);
  useSheetBehaviour(showRevisionModal, close); // v415
  return (
    <Presence>
          {showRevisionModal && (
            <div key="revision-sheet" className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-0 sm:p-4">{/* v415: above the order's sticky action bar */}
              <PopupBackdrop 
                onClick={close} 
                className="fixed inset-0 bg-black/50 backdrop-blur-xs" 
              />
              <PopupPanel kind="auto" below={640} onClose={close}
                role="dialog" aria-modal="true" aria-label={isLinkStage ? "Ask for a corrected link" : "Ask for changes"}
                className="relative bg-white w-full max-w-lg rounded-t-[26px] sm:rounded-[26px] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] z-10 space-y-4 max-h-[85vh] max-h-[85dvh] overflow-y-auto overscroll-contain" /* v330: home bar + iOS dvh */
              >
                <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-2" />
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold text-[#0A0A0A]">{isLinkStage ? "Ask for a corrected link" : "Ask for changes"}</h3>{/* v415: "Free Revision" read like an upsell */}
                  <button type="button" onClick={close} aria-label="Close" className="text-gray-500 hover:text-gray-600 w-10 h-10 -mr-2 flex items-center justify-center">{/* v330 */}
                    <X size={20} />
                  </button>
                </div>
                <p className="text-xs text-[#6B7280]">
                  {isLinkStage
                    ? "Say what's wrong with the post or link (e.g. wrong account, caption missing the tag, post not public)."
                    : "Be specific about required adjustments (e.g. cut length, caption placement, lighting)."}
                </p>
                <textarea 
                  rows={4}
                  autoFocus /* v415: focus into the sheet */
                  aria-label="What should the creator change?" /* v332: textarea had no label */
                  value={revisionNotes}
                  onChange={(e) => setRevisionNotes(e.target.value)}
                  placeholder={isLinkStage ? "e.g. Please tag @ourbrand in the caption and share the link to the public post." : "e.g. Please show the texture at 0:08 for 2 more seconds, and update the link CTA overlay."}
                  className="w-full bg-[#F9F9FB] border border-[#E5E5EA] rounded-xl p-3.5 text-base text-[#0A0A0A] outline-none focus:border-[#7C3AED]" /* v330: 16px stops iOS zoom */
                />
                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={close} 
                    disabled={submittingRevision}
                    className="flex-1 py-3 bg-[#F2F2F7] rounded-xl text-xs font-bold text-[#0A0A0A] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    type="button"
                    disabled={submittingRevision || !revisionNotes.trim()} /* v415: nothing to send yet */
                    onClick={handleSubmitRevision}
                    className="flex-1 py-3 bg-[#7C3AED] hover:bg-[#6D28D9] rounded-xl text-xs font-bold text-white shadow-md disabled:opacity-50"
                  >
                    {submittingRevision ? "Sending…" : "Send request"}
                  </button>
                </div>
              </PopupPanel>
            </div>
          )}
        </Presence>
  );
}
