import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Plus } from "lucide-react";


// Session 49 (clean-up): moved out of BrandUGCMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function CreateFabMenu(props) {
  const { fabOpen, handleResumeDraft, handleStartNewBrief, hasDraft, setFabOpen, view } = props;
  // v415: Escape closes the menu
  React.useEffect(() => {
    if (!fabOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setFabOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fabOpen, setFabOpen]);
  return <>{view === "main" && (
        <>
          {/* FAB Backdrop */}
          <AnimatePresence>
            {fabOpen && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1, transition: { duration: 0.2 } }} 
                exit={{ opacity: 0, transition: { duration: 0.15 } }} 
                onClick={() => setFabOpen(false)} 
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs" 
                aria-hidden="true"
              />
            )}
          </AnimatePresence>

          {/* FAB Popup Menu */}
          <AnimatePresence>
            {fabOpen && (
              <motion.div 
                initial={{ scale: 0.92, opacity: 0, y: 12 }} 
                animate={{ scale: 1, opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } }} 
                exit={{ scale: 0.96, opacity: 0, y: 8, transition: { duration: 0.14 } }} 
                style={{ transformOrigin: "bottom right" }} /* v415: grows out of the + button, quicker and without the bounce */
                className="fixed bottom-[calc(164px+env(safe-area-inset-bottom))] right-5 z-50 flex flex-col items-end gap-2.5"
                role="menu" aria-label="Create"
              >
                {hasDraft && (
                  <button 
                    type="button" role="menuitem"
                    onClick={handleResumeDraft}
                    className="bg-white text-[#0A0A0A] font-bold text-xs px-4 py-3 rounded-2xl shadow-xl border border-[#E5E5EA] flex items-center gap-2.5 active:scale-95 transition-all cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                      <Clock size={14} />
                    </div>
                    <span>Resume draft</span>
                  </button>
                )}

                <button 
                  type="button" role="menuitem" autoFocus
                  onClick={handleStartNewBrief}
                  className="bg-white text-[#0A0A0A] font-bold text-xs px-4 py-3 rounded-2xl shadow-xl border border-[#E5E5EA] flex items-center gap-2.5 active:scale-95 transition-all cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-lg bg-[#F1E8FF] text-[#7C3AED] flex items-center justify-center">
                    <Plus size={14} />
                  </div>
                  <span>New brief</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Floating Action Button (Raised cleanly above 84px bottom navbar) */}
          <button 
            type="button"
            onClick={() => setFabOpen(!fabOpen)}
            className="fixed bottom-[calc(96px+env(safe-area-inset-bottom))] right-5 z-40 w-14 h-14 rounded-[19px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white flex items-center justify-center shadow-[0_14px_28px_-12px_rgba(124,58,237,.65)] active:scale-95 transition-all cursor-pointer"
            aria-label={fabOpen ? "Close menu" : "Create brief"} // v332: FAB + menu clear the iPhone home bar; label matches state
            aria-expanded={fabOpen}
          >
            <motion.div animate={{ rotate: fabOpen ? 45 : 0 }} transition={{ duration: 0.2 }}>
              <Plus size={24} strokeWidth={2.5} />
            </motion.div>
          </button>
        </>
      )}</>;
}
