import React from "react";
import { Lightbulb, RefreshCw, X } from "lucide-react";
import { Presence, PopupBackdrop, PopupPanel } from "../../../components/common/Popup"; // v415: shared open/close motion
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
export default function AiPromptSheet(props) {
  const { aiGenerating, handleGenerateWithAi, postData, setShowAiAssist, showAiAssist } = props;
  const close = React.useCallback(() => setShowAiAssist(false), [setShowAiAssist]);
  // v416 (U11): the brand has typed something to write from
  const hasTyped = [postData?.product_name, postData?.title, postData?.detailed_requirements, postData?.product_description].some((v) => String(v || "").trim().length >= 2);
  useSheetBehaviour(showAiAssist, close);
  // v415: z-[1000] layer (z-50 sat level with the bottom nav), the shared sheet motion, drag-down to close
  return (
    <Presence>
          {showAiAssist && (
            <div key="ai-prompt-sheet" className="fixed inset-0 z-[1000] flex items-end justify-center">
              <PopupBackdrop 
                onClick={close} 
                className="fixed inset-0 bg-black/60 backdrop-blur-xs" 
              />
              <PopupPanel kind="sheet" onClose={close}
                role="dialog" aria-modal="true" aria-label="AI brief generator"
                className="relative bg-white w-full max-w-lg rounded-t-[28px] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] z-10 space-y-4 max-h-[85vh] max-h-[85dvh] overflow-y-auto overscroll-contain" /* v330 */
              >
                <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto" />
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#F1E8FF] text-[#7C3AED] flex items-center justify-center">
                      <Lightbulb size={16} />
                    </div>
                    <h3 className="text-base font-bold text-[#0A0A0A]">Write my brief with Eva</h3>
                  </div>
                  <button type="button" onClick={close} aria-label="Close" className="text-gray-500 w-10 h-10 -mr-2 flex items-center justify-center">{/* v330 */}
                    <X size={20} />
                  </button>
                </div>

                <p className="text-xs text-[#6B7280]">
                  Pick a category, or let Ybex Eva write the brief from what you've typed. You can edit everything after.{/* v330: our assistant is Ybex Eva, not "Gemini AI" */}
                </p>

                {/* Category Preset chips */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Skincare Glow Routine", prompt: "Skincare serum hydrating detan" },
                    { label: "D2C Snack / Drink", prompt: "Healthy organic energy beverage" },
                    { label: "Fitness & Gym Wear", prompt: "Athleisure gym compression activewear" },
                    { label: "Tech / App Review", prompt: "Mobile app fintech productivity tool" }
                  ].map(cat => (
                    <button
                      key={cat.label}
                      type="button"
                      disabled={aiGenerating}
                      onClick={() => handleGenerateWithAi(cat.prompt)}
                      className="p-3 rounded-xl border border-[#E5E5EA] bg-[#F9F9FB] text-left hover:border-[#7C3AED] hover:bg-[#F8F4FF] transition-all disabled:opacity-50"
                    >
                      <span className="text-xs font-bold text-[#0A0A0A] block">{cat.label}</span>
                      <span className="text-[10px] text-[#7C3AED] font-semibold">Generate →</span>
                    </button>
                  ))}
                </div>

                <div className="pt-2">
                  {!hasTyped && <p className="text-[11px] text-[#6B7280] mb-2 text-center">Type a title or product name first to use this.</p>}{/* v416 (U11) */}
                  <button
                    type="button"
                    disabled={aiGenerating || !hasTyped} /* v416 (U11): nothing typed → nothing to write from */
                    onClick={() => handleGenerateWithAi("")}
                    className="w-full py-3.5 bg-[#7C3AED] text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    {aiGenerating ? <RefreshCw size={14} className="animate-spin" /> : <Lightbulb size={14} />}
                    {aiGenerating ? "Writing your brief…" : "Write from what I've typed"}{/* v415: busy text */}
                  </button>
                </div>
              </PopupPanel>
            </div>
          )}
        </Presence>
  );
}
