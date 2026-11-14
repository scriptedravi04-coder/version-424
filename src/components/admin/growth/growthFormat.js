// Session 46: small number / text helpers for the Admin growth screens. No logic about the
// business lives here — only how a number is written.

/** ₹1,23,456 */
export const inr = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");

/** ₹12.4k · ₹3.2 L · ₹1.5 Cr — for tight spaces. */
export function inrShort(n) {
  const v = Math.round(Number(n) || 0);
  if (v >= 10000000) return "₹" + (v / 10000000).toFixed(2).replace(/\.?0+$/, "") + " Cr";
  if (v >= 100000) return "₹" + (v / 100000).toFixed(2).replace(/\.?0+$/, "") + " L";
  if (v >= 1000) return "₹" + (v / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return "₹" + v;
}

export const num = (n) => (Number(n) || 0).toLocaleString("en-IN");

/** +12% · -8% · "new" when there was nothing last time. */
export function trendText(p) {
  if (p === null || p === undefined) return "new";
  return `${p > 0 ? "+" : ""}${p}%`;
}

/** "3 days", "1 day", "today". */
export function daysText(d) {
  if (d === null || d === undefined) return "—";
  if (d <= 0) return "today";
  return d === 1 ? "1 day" : `${d} days`;
}

/** 18 → "18 hours", 50 → "2.1 days". */
export function hoursText(h) {
  if (h === null || h === undefined) return "—";
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${(Math.round((h / 24) * 10) / 10)} days`;
}

export const ZONE_LABEL = {
  brand_shortage: "Needs brands",
  creator_shortage: "Needs creators",
  balanced: "Balanced",
  too_small: "Too small to judge",
};

export const GAP_LABEL = {
  creators_needed: "Needs creators",
  campaigns_needed: "Needs campaigns",
  balanced: "Balanced",
};
