import React, { useEffect } from "react";
import { X } from "lucide-react";
import { motion, useDragControls } from "framer-motion";
import { backdropMotion, sheetMotion, shouldCloseSheet } from "../../../lib/motion";
import useBackToClose from "../../../lib/popupRules";

// Session 37: shared motion settings (lib/motion.js) + drag the top of the sheet down to close.
// Session 41: `fixed` — pin to the screen. On a long page (campaign detail) an absolute sheet sat
// at the bottom of the whole page, so the page footer and the Apply bar showed under it.
export default function MobileSheet({ onClose, children, fixed = false }) {
  const controls = useDragControls();
  useBackToClose(typeof onClose === "function", onClose); // v426: phone Back closes the sheet, not the page
  // v415: Escape closes the sheet (keyboard / desktop-width phones)
  useEffect(() => {
    if (!onClose) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" style={{ position: fixed ? "fixed" : "absolute", inset: 0, zIndex: fixed ? 60 : 30, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <motion.div
        {...backdropMotion}
        style={{
          position: "absolute",
          inset: 0,
          // Session 41: no blur behind sheets — fading a blurred layer is what made sheets stutter
          // on phones. A slightly darker plain layer looks the same and stays smooth.
          background: "rgba(18,18,26,.55)",
          willChange: "opacity",
        }}
        onClick={onClose}
      />
      <motion.div
        {...sheetMotion}
        drag={onClose ? "y" : false}
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        dragMomentum={false}
        onDragEnd={(_e, info) => { if (onClose && shouldCloseSheet(info)) onClose(); }}
        style={{
          position: "relative",
          zIndex: 31,
          background: "#fff",
          borderRadius: "22px 22px 0 0",
          padding: "10px 20px calc(24px + env(safe-area-inset-bottom, 0px))", // v330: clear the iPhone home bar
          boxShadow: "0 -18px 44px -16px rgba(18,18,26,.3)",
          maxHeight: "88%",
          overflowY: "auto",
          willChange: "transform",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
          overscrollBehavior: "contain",
        }}
      >
        <div
          onPointerDown={(e) => onClose && controls.start(e)}
          data-testid="sheet-grip"
          style={{ padding: "8px 0 14px", margin: "-10px auto 2px", width: 120, touchAction: "none", cursor: onClose ? "grab" : "default" }}
        >
          <div style={{ height: 5, width: 44, borderRadius: 3, background: "#E5E5EA", margin: "0 auto" }} />
        </div>
        {children}
      </motion.div>
    </div>
  );
}

export function SheetHeader({ title, subtitle, onClose }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>{/* v330: long names/titles wrap instead of pushing the X off-screen */}
        <div style={{ font: "600 17px 'DM Sans',sans-serif", letterSpacing: "-.3px", color: "#0A0A0A" }}>{title}</div>
        {subtitle && <div style={{ marginTop: 4, font: "400 13px/1.5 'DM Sans',sans-serif", color: "#6B7280" }}>{subtitle}</div>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close" /* v330: icon-only button had no label; 28px → 32px tap target */
        style={{ width: 40, height: 40, borderRadius: 20 /* v332 · v415: 40px close button */, background: "#F2F2F7", border: "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}
      >
        <X size={12} color="#6B7280" strokeWidth={2.6} />
      </button>
    </div>
  );
}
