import React, { useState } from "react";
import { Play, Eye, Heart } from "lucide-react";
import { itemStat } from "./portfolioModel";

// v363 (Ravi's portfolio design): shared bits — the soft purple "bloom" background, frosted glass panes, a cover
// with a calm placeholder when there's no picture, and the round brand initial.

export const GLASS = "bg-white/60 backdrop-blur-xl border border-white/80 shadow-[0_8px_30px_-12px_rgba(76,29,149,0.25)]";

export function Bloom({ className = "" }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{
        background:
          "radial-gradient(70% 38% at 85% 0%, rgba(167,139,250,0.42), transparent 70%)," +
          "radial-gradient(55% 32% at 0% 42%, rgba(244,114,182,0.16), transparent 70%)," +
          "radial-gradient(60% 35% at 100% 78%, rgba(196,181,253,0.35), transparent 70%)," +
          "linear-gradient(180deg,#F6F3FE 0%,#F4F1FB 100%)",
      }}
    />
  );
}

export function BrandInitial({ name, size = 30, className = "" }) {
  const ch = (String(name || "?").replace(/^@/, "").trim()[0] || "?").toUpperCase();
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-[#0A0A0A] text-white font-black ring-2 ring-white shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {ch}
    </span>
  );
}

/** A reel / post cover. No picture (old item, expired link, YouTube…) → soft gradient + play icon. */
export function Cover({ src, alt = "", className = "", children, label }) {
  const [broken, setBroken] = useState(false);
  const show = src && !broken;
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: "linear-gradient(160deg,#EDE7FC,#D9CFF7)" }}>
      {show ? (
        <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="absolute inset-0 w-full h-full object-cover" draggable="false" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[#7C3AED]/70">
          <Play size={20} fill="currentColor" />
          {label && <span className="text-[10px] font-bold uppercase tracking-wide text-[#7C3AED]/60 px-2 text-center leading-tight">{label}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

/** ▸ 42.1K (views) or ♥ 1.2K (likes) — nothing when Meta gave neither. */
export function StatChip({ item, className = "" }) {
  const s = itemStat(item);
  if (!s) return null;
  const Icon = s.kind === "views" ? Eye : Heart;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10.5px] font-bold text-white ${className}`}>
      {s.kind === "views" ? <Play size={9} fill="currentColor" /> : <Icon size={10} />} {s.text}
      {item?.self_reported ? <span className="font-medium opacity-80">*</span> : null}
    </span>
  );
}
