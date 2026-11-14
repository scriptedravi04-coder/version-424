import React from "react";
import { MessageCircle, Mail, PhoneCall, Headphones } from "lucide-react";


// Session 49 (clean-up): moved out of BrandHomeMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function CampaignManagerCard(props) {
  const { handleContactEmail, handleOpenWhatsApp, onScheduleCall } = props; // v330: onScheduleCall opens the Schedule Call sheet
  return (
    <div style={{ flexShrink: 0, padding: "14px 14px 0" }}>
          <div
            style={{
              background: "#fff",
              border: "1px solid #E6E6EE",
              borderRadius: "18px",
              padding: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "20px",
                  overflow: "hidden",
                  flexShrink: 0,
                  background: "#EFE6FF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {/* v332: was a stock-photo face shown as "your Campaign Manager" — a plain support icon instead */}
                <Headphones size={18} color="#7C3AED" strokeWidth={1.9} aria-hidden="true" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: "600 13px/1.3 'DM Sans', sans-serif", color: "#0A0A0A" }}>
                  Need help shortlisting 10+ creators?
                </div>
                <div
                  style={{
                    marginTop: "2px",
                    font: "400 11px 'DM Sans', sans-serif",
                    color: "#6B7280",
                  }}
                >
                  Talk to the Ybex campaign team{/* v358: no "dedicated manager" promise */}
                </div>
              </div>
            </div>

            {/* Support Actions: Contact Us (Mail) & WhatsApp (+91 87640 04299) */}
            {/* v330: + "Schedule a call" (primary, rightmost). Wraps to its own full-width row on narrow phones (320px). */}
            <div style={{ marginTop: "11px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <button
                type="button"
                onClick={handleContactEmail}
                style={{
                  flex: "1 1 96px", // v330: was flex: 1 (lets the third button wrap on small screens)
                  minWidth: 0,
                  height: "40px", // v332: 40px tap target
                  borderRadius: "11px",
                  background: "#F3EDFF",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  cursor: "pointer",
                }}
              >
                <Mail size={14} color="#7C3AED" strokeWidth={1.9} />
                <span style={{ font: "600 12px 'DM Sans', sans-serif", color: "#7C3AED" }}>
                  Contact Us
                </span>
              </button>

              <button
                type="button"
                onClick={handleOpenWhatsApp}
                style={{
                  flex: "1 1 96px", // v330: was flex: 1 (lets the third button wrap on small screens)
                  minWidth: 0,
                  height: "40px", // v332: 40px tap target
                  borderRadius: "11px",
                  background: "#16A34A",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  cursor: "pointer",
                }}
              >
                <MessageCircle size={14} color="#fff" strokeWidth={1.9} />
                <span style={{ font: "600 12px 'DM Sans', sans-serif", color: "#fff" }}>
                  WhatsApp
                </span>
              </button>

              {onScheduleCall && (
                <button
                  type="button"
                  onClick={onScheduleCall}
                  style={{
                    flex: "1 1 150px", // v330
                    minWidth: 0,
                    height: "40px", // v332: 40px tap target
                    borderRadius: "11px",
                    background: "#7C3AED",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    cursor: "pointer",
                  }}
                >
                  <PhoneCall size={14} color="#fff" strokeWidth={1.9} />
                  <span style={{ font: "600 12px 'DM Sans', sans-serif", color: "#fff", whiteSpace: "nowrap" }}>
                    Schedule a call
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
  );
}
