import React, { useEffect } from "react";

/** v372: the design files' fonts — Rye (display) + Plus Jakarta Sans (portfolio / poster text). The app itself only
 *  ships DM Sans, so every Diwali / portfolio-flow screen calls this once; one <link> for both, loaded on demand. */
export const DESIGN_FONTS_HREF = "https://fonts.googleapis.com/css2?family=Rye&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
export function useDesignFonts() {
  useEffect(() => {
    try {
      if (document.getElementById("ybx-design-fonts")) return;
      const l = document.createElement("link");
      l.id = "ybx-design-fonts"; l.rel = "stylesheet"; l.href = DESIGN_FONTS_HREF;
      document.head.appendChild(l);
    } catch { /* no document */ }
  }, []);
}

// v372 (Ravi's "Ybex Portfolio Flow" design 4a / 3b / 3c): small festive pieces shared by the portfolio wall,
// the tag sheet and the entry confirmation — a marigold garland, a CSS diya tile and a four-point sparkle.

const MARIGOLD = [
  "repeating-conic-gradient(rgba(150,50,0,.3) 0deg, rgba(150,50,0,.3) 9deg, transparent 9deg, transparent 24deg), radial-gradient(circle at 40% 35%, #FFE14D 0, #FF9A1F 50%, #D9540C 100%)",
  "repeating-conic-gradient(rgba(150,50,0,.3) 0deg, rgba(150,50,0,.3) 9deg, transparent 9deg, transparent 24deg), radial-gradient(circle at 40% 35%, #FFF2A0 0, #FFC21F 50%, #E8920A 100%)",
];

/** A row of marigold flowers (toran) across the top edge of a box. */
export function Marigolds({ size = 13, count = 40, top = -4, className = "", center = false }) {
  return (
    <div aria-hidden="true" className={className}
      style={{ position: "absolute", left: 0, right: 0, top, display: "flex", justifyContent: center ? "center" : "flex-start", paddingLeft: 3, opacity: 0.9, overflow: "hidden", pointerEvents: "none" }}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, marginLeft: -3, background: MARIGOLD[i % 2] }} />
      ))}
    </div>
  );
}

/** White rounded tile with a little CSS diya (flame + bowl). */
export function DiyaTile({ size = 40 }) {
  const k = size / 40;
  return (
    <div aria-hidden="true" style={{ width: size, height: size, flexShrink: 0, borderRadius: 13 * k, background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(232,85,47,.18)" }}>
      <span style={{ width: 8 * k, height: 13 * k, borderRadius: "50% / 65% 65% 35% 35%", background: "radial-gradient(at 50% 75%, #fff 0, #FFE14D 40%, #FF7A1A 90%)", boxShadow: `0 0 ${8 * k}px ${3 * k}px rgba(255,190,60,.55)`, marginBottom: -2 * k, position: "relative", zIndex: 1 }} />
      <span style={{ width: 24 * k, height: 10 * k, borderRadius: `${2 * k}px ${2 * k}px ${14 * k}px ${14 * k}px / ${2 * k}px ${2 * k}px ${10 * k}px ${10 * k}px`, background: "linear-gradient(#F08A2E, #C2410C)" }} />
    </div>
  );
}

/** Four-point star. */
export function Sparkle({ x, y, size = 14, color = "#FFE14D" }) {
  return <span aria-hidden="true" style={{ position: "absolute", left: x, top: y, width: size, height: size, background: color, clipPath: "polygon(50% 0, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0 50%, 40% 40%)" }} />;
}
