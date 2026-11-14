import React from "react";
import { ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";


// Session 49 (clean-up): moved out of BrandHomeMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function BrandHomeActions(props) {
  const { importantDir, importantPauseUntil, isNewBrand, navigate, needsActionItems, onboardingStepIdx, onboardingTasks, swipeImportant } = props;
  return <>{isNewBrand ? (
          // NEW BRAND ONBOARDING CAROUSEL (Auto-rotates, 1/3, 2/3, 3/3)
          onboardingTasks.length > 0 && (
            <div style={{ flexShrink: 0, padding: "16px 14px 0" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 2px 8px",
                }}
              >
                <span
                  style={{
                    font: "700 10px 'DM Sans', sans-serif",
                    letterSpacing: "1.1px",
                    color: "#6B7280", // v415: contrast
                    whiteSpace: "nowrap",
                  }}
                >
                  IMPORTANT FOR YOU ·{" "}
                  {onboardingTasks.length > 1
                    ? `${(onboardingStepIdx % onboardingTasks.length) + 1}/${onboardingTasks.length}`
                    : "1/1"}
                </span>
                {onboardingTasks.length > 1 && (
                  <div style={{ display: "flex", gap: "4px" }}>
                    {onboardingTasks.map((_, i) => (
                      <div
                        key={i}
                        style={{
                          height: "4px",
                          width: i === onboardingStepIdx % onboardingTasks.length ? "14px" : "4px",
                          borderRadius: "2px",
                          background:
                            i === onboardingStepIdx % onboardingTasks.length ? "#7C3AED" : "#D4D4DC",
                          transition: "all 0.3s ease",
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Current Active Onboarding Card */}
              {(() => {
                const currentTask =
                  onboardingTasks[onboardingStepIdx % onboardingTasks.length] || onboardingTasks[0];
                const IconComponent = currentTask.icon;
                return (
                  <div style={{ position: "relative", overflow: "hidden", borderRadius: "18px" }}>
                  <AnimatePresence initial={false} mode="popLayout" custom={importantDir}>
                  <motion.div
                    key={onboardingStepIdx % onboardingTasks.length}
                    custom={importantDir}
                    data-testid="important-card"
                    initial={{ x: importantDir > 0 ? "60%" : "-60%", opacity: 0 }}
                    animate={{ x: 0, opacity: 1, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } }}
                    exit={{ x: importantDir > 0 ? "-60%" : "60%", opacity: 0, transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
                    drag={onboardingTasks.length > 1 ? "x" : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.35}
                    onDragStart={() => { importantPauseUntil.current = Date.now() + 7000; }}
                    onDragEnd={(_e, info) => {
                      if (info.offset.x < -50 || info.velocity.x < -400) swipeImportant(1);
                      else if (info.offset.x > 50 || info.velocity.x > 400) swipeImportant(-1);
                    }}
                    style={{
                      touchAction: "pan-y",
                      willChange: "transform",
                      background: "#fff",
                      border: "1px solid #E6E6EE",
                      borderRadius: "18px",
                      padding: "11px 12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "11px",
                    }}
                  >
                    <div
                      style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "13px",
                        background: currentTask.iconBg,
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <IconComponent size={18} strokeWidth={1.9} color={currentTask.iconColor} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          font: "600 13.5px 'DM Sans', sans-serif",
                          color: "#0A0A0A",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {currentTask.title}
                      </div>
                      <div
                        style={{
                          marginTop: "2px",
                          font: "400 11px 'DM Sans', sans-serif",
                          color: "#6B7280",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {currentTask.desc}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={currentTask.onClick}
                      style={{
                        height: "36px", // v332: bigger tap target
                        padding: "0 13px",
                        borderRadius: "11px",
                        background: "#7C3AED",
                        border: "none",
                        display: "flex",
                        alignItems: "center",
                        flexShrink: 0,
                        font: "600 11.5px 'DM Sans', sans-serif",
                        color: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      {currentTask.btnText}
                    </button>
                  </motion.div>
                  </AnimatePresence>
                  </div>
                );
              })()}
            </div>
          )
        ) : (
          // ACTIVE BRAND: NEEDS YOUR ACTION LIST (Only rendered if there are real pending items)
          needsActionItems.length > 0 && (
            <div style={{ flexShrink: 0, padding: "16px 14px 0" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 2px 8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      font: "700 10px 'DM Sans', sans-serif",
                      letterSpacing: "1.1px",
                      color: "#6B7280", // v415: contrast
                      whiteSpace: "nowrap",
                    }}
                  >
                    NEEDS YOUR ACTION
                  </span>
                  <span
                    style={{
                      height: "16px",
                      padding: "0 5px",
                      borderRadius: "8px",
                      background: "#7C3AED",
                      display: "flex",
                      alignItems: "center",
                      font: "700 9px 'DM Sans', sans-serif",
                      color: "#fff",
                    }}
                  >
                    {needsActionItems.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/brand/ugc/orders")}
                  style={{
                    minHeight: "40px", // v332: tap target
                    padding: "0 4px",
                    font: "600 11.5px 'DM Sans', sans-serif",
                    color: "#7C3AED",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  View all
                </button>
              </div>

              <div
                style={{
                  background: "#fff",
                  border: "1px solid #E6E6EE",
                  borderRadius: "18px",
                  padding: "2px 12px",
                }}
              >
                {needsActionItems.map((item, idx) => {
                  const ItemIcon = item.icon;
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "10px 0",
                        borderTop: idx > 0 ? "1px solid #F1F1F6" : "none",
                      }}
                    >
                      <div
                        style={{
                          width: "34px",
                          height: "34px",
                          borderRadius: "11px",
                          background: item.iconBg,
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <ItemIcon size={16} strokeWidth={1.9} color={item.iconColor} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            font: "600 12.5px 'DM Sans', sans-serif",
                            color: "#0A0A0A",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.title}
                        </div>
                        <div
                          style={{
                            marginTop: "2px",
                            font: "500 10.5px 'DM Sans', sans-serif",
                            color: item.subColor || "#6B7280",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.subtitle}
                        </div>
                      </div>

                      {item.btnText && (
                        <button
                          type="button"
                          onClick={item.onClick}
                          style={{
                            height: "34px", // v332: was 28px — hard to hit
                            padding: "0 11px",
                            borderRadius: "9px",
                            background: item.btnBg,
                            border: "none",
                            display: "flex",
                            alignItems: "center",
                            flexShrink: 0,
                            font: "600 11px 'DM Sans', sans-serif",
                            color: item.btnColor,
                            cursor: "pointer",
                          }}
                        >
                          {item.btnText}
                        </button>
                      )}

                      {item.hasChevron && (
                        <button
                          type="button"
                          onClick={item.onClick}
                          aria-label={`Open: ${item.title}`} // v332: icon-only button had no label; 40px tap target
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                            width: "40px",
                            height: "40px",
                            marginRight: "-12px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <ChevronRight size={14} color="#C4C4CC" strokeWidth={2.2} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )
        )}</>;
}
