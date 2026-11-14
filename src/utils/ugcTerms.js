// Session 24 (Ravi's decisions). Same values as backend/ugcTerms.ts.
export const DELIVERY_OPTIONS = [
  { hours: 24, label: "Express", sub: "24 hours" },
  { hours: 48, label: "Standard", sub: "48 hours" },
  { hours: 72, label: "Relaxed", sub: "72 hours" },
];
export const DEFAULT_DELIVERY_HOURS = 48;
export const UGC_REVISION_LIMIT = 3;

/** A valid option, else `fallback` (48 for a new brief, 24 for briefs made before the option). */
export function deliveryHoursOf(v, fallback = DEFAULT_DELIVERY_HOURS) {
  const n = Number(v);
  return [24, 48, 72].includes(n) ? n : fallback;
}

/**
 * Total hours an order had for its first draft, from its own dates (created_at → deadline).
 * Timers used a fixed 24h, so a 48h order would show a wrong progress ring.
 */
export function orderWindowHours(order, fallback = 24) {
  const start = Date.parse(order?.created_at || "");
  const end = Date.parse(order?.internal_deadline || order?.deadline || order?.sla_expires_at || "");
  if (!start || !end || end <= start) return fallback;
  const h = Math.round((end - start) / 3600000);
  return [24, 48, 72].includes(h) ? h : Math.max(1, h);
}
