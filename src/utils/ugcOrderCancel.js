// Session 25. Client copy of the order-cancel rules (backend/services/ugcDeadlineService.ts).
// The server decides; these only decide what the screen offers and what it says.
import { deliveryHoursOf, orderWindowHours } from "./ugcTerms";

/** Same list as CREATOR_CANCEL_REASONS on the server. */
export const CREATOR_CANCEL_REASONS = [
  "Not feeling well",
  "Brief is not what I expected",
  "Product not received",
  "Other",
];

const HOUR = 3600000;
export const CREATOR_CANCEL_GRACE_MS = HOUR;
export const BRAND_ORDER_CANCEL_WAIT_MS = 24 * HOUR;

function hasDraft(o) {
  if (!o) return false;
  const s = String(o.status || "").toUpperCase();
  return Boolean(o.video_url || o.submission_link || o.drive_url || o.delivered_at) ||
    ["SUBMITTED", "IN_REVIEW", "CONTENT_SUBMITTED", "DELIVERED", "REVISION_REQ", "REVISION_REQUESTED", "REVISION_DECLINED", "CONTENT_APPROVED", "COMPLETED"].includes(s);
}

const CLOSED = ["COMPLETED", "CANCELLED", "EXPIRED", "REFUNDED", "CLOSED"];

/** When the order's timer started (ms), or null. */
export function orderTimerStartMs(order) {
  const due = Date.parse(order?.internal_deadline || order?.deadline || "");
  const hours = deliveryHoursOf(order?.brief?.delivery_hours ?? order?.delivery_hours, orderWindowHours(order, 24));
  if (Number.isFinite(due)) return due - hours * HOUR;
  const created = Date.parse(order?.created_at || "");
  return Number.isFinite(created) ? created : null;
}

/** Creator: can this order be cancelled from the workspace, and does it count? */
export function creatorCancelInfo(order, nowMs = Date.now()) {
  const raw = order?.raw || order || {};
  const status = String(raw.status || "").toUpperCase();
  if (!raw.id && !order?.id) return { allowed: false };
  if (hasDraft(raw) || CLOSED.includes(status)) return { allowed: false };
  const neverSigned = raw.agreement_signed_creator === false || raw.agreement_signed_creator === null;
  if (neverSigned) return { allowed: true, counts: false, graceLeftMs: 0 };
  const start = orderTimerStartMs(raw);
  const since = start === null ? Infinity : nowMs - start;
  const inGrace = since >= 0 && since < CREATOR_CANCEL_GRACE_MS;
  return { allowed: true, counts: !inGrace, graceLeftMs: inGrace ? CREATOR_CANCEL_GRACE_MS - since : 0 };
}

/** Brand: can this one order be cancelled now? */
export function brandCancelInfo(order, nowMs = Date.now()) {
  const raw = order?.raw || order || {};
  const status = String(raw.status || "").toUpperCase();
  if (CLOSED.includes(status)) return { show: false };
  if (hasDraft(raw)) return { show: true, allowed: false, why: "DRAFT" };
  const start = orderTimerStartMs(raw);
  // v414: same rule as the server — the later of 24h after claim and the order's own delivery deadline
  const deadlineMs = Date.parse(raw.internal_deadline || "");
  const at = start === null ? null : Math.max(start + BRAND_ORDER_CANCEL_WAIT_MS, Number.isFinite(deadlineMs) ? deadlineMs : start + BRAND_ORDER_CANCEL_WAIT_MS);
  if (at === null || nowMs < at) return { show: true, allowed: false, why: "TOO_EARLY", allowedAtMs: at };
  return { show: true, allowed: true };
}

export function formatWait(ms) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  // v416: long waits in days ("12d 21h", was "309h 35m")
  if (h >= 48) { const d = Math.floor(h / 24); const hh = h % 24; return hh ? `${d}d ${hh}h` : `${d}d`; }
  return r ? `${h}h ${r}m` : `${h}h`;
}
