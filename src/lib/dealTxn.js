// v333: one place that decides WHICH transaction row belongs to a deal.
//
// Why: a deal can have more than one row (the v310 double-payout bug left an extra row f3d6d152… on the
// Dell mouse deal with amount 0). Every screen used `rows.find(...)`, so whichever row came first won:
// the receipt showed ₹0.00, the chat payout card fell back to the deal amount (₹13,000) instead of the
// creator's ₹11,700, and Earnings listed the deal twice (one "In hold ₹0"). These helpers always pick the
// row that carries the real money and hide empty copies.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const txnMoney = (t) => Math.max(num(t?.gross_amount), num(t?.amount), num(t?.creator_net_amount), num(t?.net_amount));

export const isTxnPaid = (t) => {
  const ps = String(t?.payout_status || "").toUpperCase();
  return ps === "PAID" || ps === "COMPLETED" || Boolean(t?.utr_number || t?.payout_reference);
};

const isTxnDead = (t) => {
  const st = String(t?.status || "").toUpperCase();
  const ps = String(t?.payout_status || "").toUpperCase();
  return st === "FAILED" || st === "INITIATED" || ps === "CANCELLED";
};

// Higher = better: paid to bank > released > held; then the row with money; then the newest.
const rank = (t) => {
  const ps = String(t?.payout_status || "").toUpperCase();
  let r = 0;
  if (isTxnPaid(t)) r += 4000;
  else if (ps === "RELEASED") r += 3000;
  if (!isTxnDead(t)) r += 1000;
  if (txnMoney(t) > 0) r += 500;
  if (num(t?.creator_net_amount) > 0) r += 100;
  return r;
};

const newer = (a, b) => {
  const ta = new Date(a?.payout_completed_at || a?.updated_at || a?.created_at || 0).getTime() || 0;
  const tb = new Date(b?.payout_completed_at || b?.updated_at || b?.created_at || 0).getTime() || 0;
  return ta >= tb ? a : b;
};

export const better = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra > rb ? a : b;
  return newer(a, b);
};

/** The best row for a deal / UGC order, given the ids that thread can be known by. */
export function pickDealTxn(rows, ids) {
  const want = new Set((ids || []).filter(Boolean).map(String));
  if (!want.size || !Array.isArray(rows)) return null;
  let best = null;
  for (const t of rows) {
    const keys = [t?.campaign_deal_id, t?.deal_id, t?.ugc_order_id].filter(Boolean).map(String);
    if (keys.some((k) => want.has(k))) best = better(best, t);
  }
  return best;
}

const dealKey = (t) => {
  if (t?.ugc_order_id) return `u:${t.ugc_order_id}`;
  const d = t?.campaign_deal_id || t?.deal_id;
  return d ? `d:${d}` : null;
};

/**
 * Creator lists: one row per deal. A second row for the same deal is a copy (one deal = one payout),
 * so only the best one is kept. Rows with no deal id are left as they are.
 */
export function oneRowPerDeal(rows) {
  if (!Array.isArray(rows)) return [];
  const byKey = new Map();
  const loose = [];
  rows.forEach((t, i) => {
    const k = dealKey(t);
    if (!k) { loose.push([i, t]); return; }
    const cur = byKey.get(k);
    byKey.set(k, cur ? [Math.min(cur[0], i), better(cur[1], t)] : [i, t]);
  });
  return [...byKey.values(), ...loose].sort((a, b) => a[0] - b[0]).map(([, t]) => t);
}

/** What the creator gets in the bank for this row, or null when it isn't recorded yet. */
export const creatorNetOf = (t) => (t && num(t.creator_net_amount) > 0 ? num(t.creator_net_amount) : null);
