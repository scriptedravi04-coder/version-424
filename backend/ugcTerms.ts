// Session 24 (Ravi's decisions). UGC order terms shared by the server.
//
// - First-draft deadline: the brand picks Express 24h / Standard 48h / Relaxed 72h when posting
//   (default 48h). Briefs from before this change have no value and keep the old 24h.
// - Revisions: 3 on every UGC order.

export const DELIVERY_HOUR_OPTIONS = [24, 48, 72] as const;
export const DEFAULT_DELIVERY_HOURS = 48;
export const UGC_REVISION_LIMIT = 3;

/** A valid option, else `fallback` (48 for a new brief; callers pass 24 for old briefs). */
export function normalizeDeliveryHours(v: any, fallback: number = DEFAULT_DELIVERY_HOURS): number {
  const n = Number(v);
  return (DELIVERY_HOUR_OPTIONS as readonly number[]).includes(n) ? n : fallback;
}

/** PostgREST "column not found" (PGRST204) or Postgres undefined_column (42703) for `col`. */
export function isMissingColumnError(err: any, col: string): boolean {
  const code = String(err?.code || "");
  const msg = String(err?.message || err?.details || "");
  return (code === "PGRST204" || code === "42703" || /column/i.test(msg)) && msg.includes(col);
}

/** Every slot of the brief has a finished order (not just every order that exists). */
export function isBriefFullyDelivered(doneOrders: number, maxCreators: any): boolean {
  const slots = Math.max(1, Number(maxCreators) || 1);
  return doneOrders >= slots;
}
