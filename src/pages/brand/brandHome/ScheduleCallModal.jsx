import React from "react";
import { createPortal } from "react-dom";
import { istDateString } from "../../../utils/istDate";
import { RefreshCw, X, Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion"; // v415
import useScrollLock from "../../../lib/useScrollLock"; // v415


// Session 49 (clean-up): moved out of BrandHomeMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function ScheduleCallModal(props) {
  const { handleScheduleCallSubmit, isScheduleCallModalOpen, scheduleCallDate, scheduleCallNote, scheduleCallSubmitting, scheduleCallTime, setIsScheduleCallModalOpen, setScheduleCallDate, setScheduleCallNote, setScheduleCallTime } = props;
  // v343: drawn on <body> so the bottom nav, page footer and Eva bubble can never sit on top of it.
  // v415: it popped in and vanished with no motion, the page behind scrolled, Escape did nothing.
  useScrollLock(Boolean(isScheduleCallModalOpen));
  React.useEffect(() => {
    if (!isScheduleCallModalOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setIsScheduleCallModalOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isScheduleCallModalOpen, setIsScheduleCallModalOpen]);
  if (typeof document === "undefined") return null;
  return createPortal(<AnimatePresence>{isScheduleCallModalOpen && (
          <motion.div
            key="schedule-call"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} /* v415 */
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9999, // v330: stays above the bottom nav (z-50)
              background: "rgba(10,10,10,0.55)",
              backdropFilter: "blur(6px)",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
            }}
            onClick={() => setIsScheduleCallModalOpen(false)}
          >
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }} /* v415: slides up like the other sheets */
              style={{
                width: "100%",
                maxWidth: "440px",
                background: "#fff",
                borderRadius: "28px 28px 0 0",
                padding: "24px 20px calc(32px + env(safe-area-inset-bottom, 0px))", // v330: clear the home indicator
                maxHeight: "90dvh", // v330: scrollable on short phones
                overflowY: "auto",
                overscrollBehavior: "contain",
                boxSizing: "border-box",
                boxShadow: "0 -20px 40px rgba(0,0,0,0.15)",
              }}
              onClick={(e) => e.stopPropagation()}
              role="dialog" // v330
              aria-modal="true"
              aria-label="Schedule a call with your campaign manager"
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <h3
                    style={{
                      font: "700 18px 'DM Sans', sans-serif",
                      color: "#0A0A0A",
                      letterSpacing: "-0.4px",
                    }}
                  >
                    Schedule a call with your campaign manager{/* v415: matches the card that opens it */}
                  </h3>
                  <p style={{ font: "400 12px 'DM Sans', sans-serif", color: "#6B7280" }}>
                    Get personalized recommendations for 10+ creator campaigns
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close" // v330
                  onClick={() => setIsScheduleCallModalOpen(false)}
                  style={{
                    flexShrink: 0, // v330
                    width: "40px", // v332: 40px tap target
                    height: "40px",
                    borderRadius: "20px",
                    background: "#F4F4F8",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <X size={16} color="#6B7280" />
                </button>
              </div>

              <form onSubmit={handleScheduleCallSubmit}>
                <div style={{ marginBottom: "14px" }}>
                  <label
                    style={{
                      display: "block",
                      font: "600 12px 'DM Sans', sans-serif",
                      color: "#374151",
                      marginBottom: "6px",
                    }}
                  >
                    Preferred Date
                  </label>
                  <input
                    type="date"
                    required
                    value={scheduleCallDate}
                    onChange={(e) => setScheduleCallDate(e.target.value)}
                    min={istDateString(1)} // v330: earliest = tomorrow (IST)
                    style={{
                      width: "100%",
                      height: "44px",
                      borderRadius: "12px",
                      border: "1px solid #E5E7EB",
                      padding: "0 12px",
                      font: "500 16px 'DM Sans', sans-serif", // v332: 16px stops iPhone zoom on focus
                      color: "#0A0A0A",
                      outline: "none",
                      boxSizing: "border-box",
                      // v343: iPhone date box ignored width:100% and ran off the right edge
                      display: "block",
                      minWidth: 0,
                      maxWidth: "100%",
                      WebkitAppearance: "none",
                      appearance: "none",
                      background: "#fff",
                      textAlign: "left",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label
                    style={{
                      display: "block",
                      font: "600 12px 'DM Sans', sans-serif",
                      color: "#374151",
                      marginBottom: "6px",
                    }}
                  >
                    Preferred Time Slot (IST){/* v332: say which time zone the slots are in */}
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    {["11:30 AM", "02:30 PM", "04:30 PM", "06:00 PM"].map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setScheduleCallTime(slot)}
                        aria-pressed={scheduleCallTime === slot} // v332
                        style={{
                          height: "40px",
                          borderRadius: "10px",
                          border:
                            scheduleCallTime === slot ? "1.5px solid #7C3AED" : "1px solid #E5E7EB",
                          background: scheduleCallTime === slot ? "#F3EDFF" : "#fff",
                          color: scheduleCallTime === slot ? "#7C3AED" : "#374151",
                          font: "600 12px 'DM Sans', sans-serif",
                          cursor: "pointer",
                        }}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label
                    style={{
                      display: "block",
                      font: "600 12px 'DM Sans', sans-serif",
                      color: "#374151",
                      marginBottom: "6px",
                    }}
                  >
                    Brief Requirement or Note (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Need 15 D2C creators for Diwali unboxing campaign"
                    value={scheduleCallNote}
                    onChange={(e) => setScheduleCallNote(e.target.value)}
                    style={{
                      width: "100%",
                      borderRadius: "12px",
                      border: "1px solid #E5E7EB",
                      padding: "10px 12px",
                      font: "400 16px 'DM Sans', sans-serif", // v332: 16px stops iPhone zoom on focus
                      color: "#0A0A0A",
                      outline: "none",
                      boxSizing: "border-box",
                      resize: "none",
                    }}
                  />
                </div>

                {/* Strict Button Alignment Architecture: Cancel on Left, Submit on Right */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setIsScheduleCallModalOpen(false)}
                    style={{
                      flex: 1,
                      height: "44px",
                      borderRadius: "12px",
                      background: "#F4F4F8",
                      border: "none",
                      font: "600 13px 'DM Sans', sans-serif",
                      color: "#6B7280",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={scheduleCallSubmitting}
                    aria-busy={scheduleCallSubmitting} // v330
                    style={{
                      flex: 2,
                      height: "44px",
                      borderRadius: "12px",
                      background: "#7C3AED",
                      border: "none",
                      font: "700 13px 'DM Sans', sans-serif",
                      color: "#fff",
                      cursor: scheduleCallSubmitting ? "default" : "pointer", // v330
                      opacity: scheduleCallSubmitting ? 0.75 : 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      whiteSpace: "nowrap",
                      boxShadow: "0 10px 20px -10px rgba(124,58,237,0.8)",
                    }}
                  >
                    {scheduleCallSubmitting ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        <span>Sending…</span>{/* v415 */}
                      </>
                    ) : (
                      <>
                        <Check size={16} />
                        <span>Request call</span>{/* v415: plainer */}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}</AnimatePresence>, document.body);
}
