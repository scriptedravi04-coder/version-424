import React from "react";


// Session 49 (clean-up): moved out of CreatorHomeMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function UgcLiveTimerCard(props) {
  const { activeUgcOrders, navigate, nearestUgcOrder, ugcCountdown } = props;
  return <>{nearestUgcOrder && ugcCountdown && (
        <div style={{ flexShrink: 0, padding: "14px 14px 0" }}>
          <div
            style={{
              background: "#fff",
              border: "1.5px solid #BBF7D0",
              borderRadius: "20px",
              padding: "12px",
              boxShadow: "0 14px 28px -24px rgba(5,150,105,0.6)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {/* Conic Timer Ring */}
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "26px",
                  background: `conic-gradient(${ugcCountdown.color} 0% ${ugcCountdown.fillPercent}%, #E7F5EC ${ugcCountdown.fillPercent}% 100%)`,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "21px",
                    background: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={ugcCountdown.color}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  >
                    <circle cx="12" cy="13" r="8" />
                    <path d="M12 9v4l2.5 1.5" />
                    <path d="M9.5 2.5h5" />
                  </svg>
                </div>
              </div>

              {/* Countdown & Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "3px",
                      background: "#16A34A",
                      animation: "pulse 1.4s infinite",
                    }}
                  />
                  <span
                    style={{
                      font: "800 9.5px 'DM Sans', sans-serif",
                      letterSpacing: "0.9px",
                      color: "#15803D",
                    }}
                  >
                    {ugcCountdown.formattedDeadline === "Overdue" || ugcCountdown.hoursLeft == null ? "UGC LIVE" : "UGC LIVE · UPLOAD IN"}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: "2px",
                    font: "800 22px/1.1 'DM Sans', sans-serif",
                    letterSpacing: "-0.8px",
                    color: "#0A0A0A",
                  }}
                >
                  {ugcCountdown.formattedDeadline === "Overdue" ? "Overdue" : ugcCountdown.formatted}{/* v332: not "0h 00m" */}
                </div>
                <div
                  style={{
                    marginTop: "2px",
                    font: "500 11px 'DM Sans', sans-serif",
                    color: "#6B7280",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {nearestUgcOrder.brief?.title || nearestUgcOrder.title || "UGC order"}
                  {/* v353: no brand name → nothing (it said "Brand Partner") */}
                  {(nearestUgcOrder.brief?.brand_name || nearestUgcOrder.brand_name) ? ` · ${nearestUgcOrder.brief?.brand_name || nearestUgcOrder.brand_name}` : ""}
                  {Number(nearestUgcOrder.creator_payout || nearestUgcOrder.brief?.budget || 0) > 0
                    ? ` · ₹${Number(nearestUgcOrder.creator_payout || nearestUgcOrder.brief?.budget).toLocaleString("en-IN")}`
                    : ""}
                </div>
              </div>

              {/* Primary Action Button (Right Aligned per Architecture Rule) */}
              <button
                type="button"
                onClick={() =>
                  navigate(`/creator/ugc?tab=manage&orderId=${nearestUgcOrder.id}`)
                }
                style={{
                  height: "40px",
                  padding: "0 14px",
                  borderRadius: "13px",
                  background: "#7C3AED",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  flexShrink: 0,
                  boxShadow: "0 10px 20px -12px rgba(124,58,237,1)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 16V4" />
                  <path d="M7.5 8.5L12 4l4.5 4.5" />
                  <path d="M4 17v2.5A1.5 1.5 0 005.5 21h13a1.5 1.5 0 001.5-1.5V17" />
                </svg>
                <span style={{ font: "700 12.5px 'DM Sans', sans-serif", color: "#fff" }}>
                  Upload
                </span>
              </button>
            </div>

            {/* Bottom Dashed Row */}
            <div
              style={{
                marginTop: "11px",
                paddingTop: "10px",
                borderTop: "1px dashed #E5E7EB",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ font: "500 11px 'DM Sans', sans-serif", color: "#6B7280" }}>
                {/* v332: it read "Submit before Overdue" once the deadline passed */}
                {ugcCountdown.formattedDeadline === "Overdue" ? (
                  <b style={{ color: "#DC2626", fontWeight: 700 }}>Deadline passed · upload as soon as you can</b>
                ) : (
                  <>
                    Submit before{" "}
                    <b style={{ color: "#0A0A0A", fontWeight: 700 }}>
                      {ugcCountdown.formattedDeadline}
                    </b>
                  </>
                )}
              </span>
              {activeUgcOrders.length > 1 && (
                <button
                  type="button"
                  onClick={() => navigate("/creator/ugc?tab=manage")}
                  style={{
                    font: "600 11px 'DM Sans', sans-serif",
                    color: "#7C3AED",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "10px 0 10px 12px", // v332: bigger tap area
                    margin: "-10px 0",
                  }}
                >
                  +{activeUgcOrders.length - 1} more UGC
                </button>
              )}
            </div>
          </div>
        </div>
      )}</>;
}
