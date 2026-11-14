// Session 23 — UGC order lists: work still to do on top, finished work below.
//
// Both lists (creator "Manage UGC Orders", brand "UGC Orders") were sorted by id only, so an
// order In Production could sit between two Completed & Paid ones.
//
// Order:
//   1. Open orders (anything not finished) — nearest deadline first, then newest.
//   2. Finished orders (completed / cancelled / rejected / declined / refunded / closed)
//      — newest first.
// A disputed order is NOT finished: it still needs someone's attention.

const CLOSED = new Set(["COMPLETED", "CANCELLED", "CANCELED", "REJECTED", "DECLINED", "REFUNDED", "CLOSED", "EXPIRED"]);

export function isClosedOrder(o) {
  const vals = [o?.status, o?.rawStatus, o?.stage, o?.raw?.status].map((v) => String(v || "").toUpperCase());
  return vals.some((v) => CLOSED.has(v));
}

const time = (v) => {
  const t = new Date(v || 0).getTime();
  return Number.isFinite(t) && t > 0 ? t : 0;
};

function newest(o) {
  const r = o?.raw || {};
  return Math.max(time(r.updated_at), time(r.completed_at), time(r.created_at), time(o?.updated_at), time(o?.created_at));
}

/** Comparator for Array.prototype.sort (stable in all current browsers). */
export function compareOrdersForWork(a, b) {
  const ac = isClosedOrder(a), bc = isClosedOrder(b);
  if (ac !== bc) return ac ? 1 : -1;
  if (!ac) {
    const ad = time(a?.deadline), bd = time(b?.deadline);
    // Nearest deadline first; orders without a deadline after those with one.
    if (ad && bd && ad !== bd) return ad - bd;
    if (!!ad !== !!bd) return ad ? -1 : 1;
  }
  const an = newest(a), bn = newest(b);
  if (an !== bn) return bn - an;
  // Old behaviour as the last tie-break: id, descending.
  return String(b?.id).localeCompare(String(a?.id));
}

export function sortOrdersForWork(list) {
  return [...(list || [])].sort(compareOrdersForWork);
}
