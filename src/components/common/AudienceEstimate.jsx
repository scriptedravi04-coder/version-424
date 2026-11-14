// Session 40 (Ravi, option B): "Authentic audience" and "Performance score" are always shown as an
// ESTIMATE from the creator's own numbers (src/utils/audienceEstimate.ts) — never the old server
// value made from the follower count, and never a default like 94 or 5.4%.
import React from "react";
import { estimateForCreator, ESTIMATE_NOTE } from "../../utils/audienceEstimate";

export { estimateForCreator, ESTIMATE_NOTE };

/** "~87%" / "91/100" / null (not enough data). */
export function estimateText(creator, kind) {
  const est = estimateForCreator(creator);
  if (!est.enough) return null;
  if (kind === "authentic") return est.authenticPct == null ? null : `~${est.authenticPct}%`;
  if (kind === "performance") return est.performanceScore == null ? null : `${est.performanceScore}/100`;
  if (kind === "engagement") return est.engagementRate == null ? null : `${est.engagementRate}%`;
  return null;
}

/** The value with a small "Estimate" pill, or "Not enough data". */
export function EstimateValue({ creator, kind, className = "", pillClassName = "" }) {
  const text = estimateText(creator, kind);
  if (!text) {
    return <span className={`text-sm font-semibold text-gray-500 ${pillClassName}`}>Not enough data</span>;
  }
  return (
    <span className={`inline-flex items-baseline gap-1.5 ${className}`} title={ESTIMATE_NOTE}>
      {text}
      <span className={`text-[11px] font-bold uppercase tracking-wider text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md align-middle ${pillClassName}`}>
        Estimate
      </span>
    </span>
  );
}

export function EstimateNote({ className = "" }) {
  return <p className={`text-[10px] text-gray-500 font-medium mt-1 ${className}`}>{ESTIMATE_NOTE}</p>;
}
