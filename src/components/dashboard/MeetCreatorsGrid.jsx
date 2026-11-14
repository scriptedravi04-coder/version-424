import React from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

// Session 48 (Ravi + testing team): one "Meet the Creators" grid for the brand home AND the creator
// home ("Meet our top creators").
//  • Cards go left → right, row by row (1 2 3 / 4 5 6 / 7 8 9). Before, the first column took cards
//    1-3 and the other two columns stayed empty when only 3 creators were live — one thin column on the
//    left and the "10k+ verified creators" box sitting on top of the third card.
//  • The box is as tall as the rows it really has, so the call-to-action sits UNDER the cards with only
//    a soft fade over the last row, never on top of a whole card.
//  • The creator home passes its own call-to-action ("You could be the next top creator").
const COL_STYLE = [
  { paddingTop: 6, height: 150, float: 3.5, dur: 6.2, delay: 0 },
  { paddingTop: 24, height: 154, float: 4, dur: 6.8, delay: 0.6 },
  { paddingTop: 0, height: 148, float: 3.5, dur: 6.5, delay: 0.3 },
];
// Session 58 (Ravi: "isko vesa hi kro" — the earlier look): cards fill COLUMN by column again
// (1-2-3 down the first column, 4-5-6 the second, 7-8-9 the third), up to 9 creators.
export const MAX = 9;
/** v397: the grid never gets wider than on an iPhone (390 px), so cards look the same on every phone. */
export const GRID_MAX_W = 390;
const PER_COL = 3;
const GLOW = ["#7C3AED", "#F43F5E", "#0EA5E9", "#EC4899", "#F97316", "#B45309"];

/** Split creators into 3 columns, column by column (3 per column). Exported for the test. */
export function toColumns(list, max = MAX) {
  const cols = [[], [], []];
  (Array.isArray(list) ? list : []).slice(0, max).forEach((c, i) => cols[Math.min(2, Math.floor(i / PER_COL))].push(c));
  return cols;
}

/** Height of the grid box for n creators: the tallest column + room for the call-to-action. */
export function gridHeight(n) {
  const rows = Math.max(1, Math.min(PER_COL, Math.min(MAX, n)));
  return 30 + rows * 164 + 120;
}

function Card({ cr, col, idx, onOpen }) {
  const s = COL_STYLE[col];
  return (
    <motion.div
      animate={{ y: [0, -s.float, 0] }}
      transition={{ duration: s.dur + idx * 0.5, repeat: Infinity, ease: "easeInOut", delay: s.delay + idx * 0.35 }}
      whileTap={{ scale: 0.96 }}
      onClick={() => onOpen?.(cr)}
      // v332: keyboard / screen-reader users can open the card too
      role="button"
      tabIndex={0}
      aria-label={cr.name ? `Open ${cr.name}'s profile` : "Open creator profile"}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(cr); } }}
      data-testid="meet-creator-card"
      style={{ position: "relative", flexShrink: 0, height: s.height, cursor: "pointer" }}
    >
      <div style={{ position: "absolute", inset: "12px 5px -6px", borderRadius: 20, background: cr.glowColor || GLOW[(col + idx * 3) % GLOW.length], opacity: 0.55, filter: "blur(18px)", transform: "translateZ(0)" }} />
      <div style={{ position: "relative", height: "100%", borderRadius: 18, overflow: "hidden", background: "#16161B", boxShadow: "0 10px 22px -12px rgba(18,18,26,0.65)", border: "1px solid rgba(255,255,255,0.08)" }}>
        {cr.photo ? (
          <img src={cr.photo} alt={cr.name || "Creator"} className="w-full h-full object-cover" loading="lazy"
            onError={(e) => { e.currentTarget.style.display = "none"; }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/70 text-3xl font-bold">
            {(cr.name || "C").charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "26px 8px 8px", background: "linear-gradient(180deg, rgba(10,10,10,0) 0%, rgba(10,10,10,0.88) 100%)", pointerEvents: "none" }}>
          <div style={{ font: "700 12px/1.2 'DM Sans', sans-serif", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>
            {cr.name}
          </div>
          {cr.reach ? (
            <div style={{ marginTop: 2, display: "flex", alignItems: "baseline", gap: 4, minWidth: 0 }}>
              <span style={{ font: "700 11px 'DM Sans', sans-serif", color: "#fff" }}>{cr.reach}</span>
              <span style={{ font: "600 7.5px 'DM Sans', sans-serif", letterSpacing: "0.5px", color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap" }}>AVG REACH</span>
            </div>
          ) : cr.sub ? (
            <div style={{ marginTop: 2, font: "600 9.5px 'DM Sans', sans-serif", color: "rgba(255,255,255,0.8)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cr.sub}</div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

export default function MeetCreatorsGrid({ creators, onOpen, ctaTitle, ctaSub, ctaLabel, onCta, testId = "meet-creators-grid" }) {
  const cols = toColumns(creators);
  const n = cols.reduce((a, c) => a + c.length, 0);
  if (!n) return null;
  return (
    <div data-testid={testId} style={{ flexShrink: 0, position: "relative", marginTop: 10, height: gridHeight(n), overflow: "hidden" }}>
      {/* v397 (Ravi: "jo size iPhone mein aa rahi hai wahi sab mein fix, Android mein phone ke hisaab se phail jaati hai"):
          the cards keep the iPhone width (390 px screen → ~115 px per card) and sit in the middle on wider phones. */}
      <div data-testid="meet-creators-cols" style={{ padding: "6px 14px 0", display: "flex", gap: 9, maxWidth: GRID_MAX_W, margin: "0 auto", boxSizing: "border-box" }}>
        {cols.map((list, col) => (
          <div key={col} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10, paddingTop: COL_STYLE[col].paddingTop }}>
            {list.map((cr, idx) => <Card key={cr.id || `${col}-${idx}`} cr={cr} col={col} idx={idx} onOpen={onOpen} />)}
          </div>
        ))}
      </div>

      {/* Soft fade over the bottom + the call-to-action under the cards */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 150, background: "linear-gradient(180deg, rgba(244,244,248,0) 0%, rgba(244,244,248,0.9) 38%, #F4F4F8 62%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", padding: "0 24px 16px", textAlign: "center" }}>
        <div style={{ font: "700 15px 'DM Sans', sans-serif", letterSpacing: "-0.3px", color: "#0A0A0A" }}>{ctaTitle}</div>
        {ctaSub ? <div style={{ marginTop: 3, font: "400 11.5px 'DM Sans', sans-serif", color: "#6B7280" }}>{ctaSub}</div> : null}
        {ctaLabel ? (
          <button type="button" onClick={onCta} data-testid={`${testId}-cta`}
            style={{ marginTop: 12, height: 40, padding: "0 20px", borderRadius: 12, background: "#7C3AED", border: "none", display: "flex", alignItems: "center", gap: 7, boxShadow: "0 10px 20px -12px rgba(124,58,237,1)", cursor: "pointer" }}>
            <span style={{ font: "600 12.5px 'DM Sans', sans-serif", color: "#fff" }}>{ctaLabel}</span>
            <ArrowRight size={14} color="#fff" strokeWidth={2.3} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
