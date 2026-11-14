// v366 (Ravi: "admin mai option choda kar vaha mai dekh lunga kisko kitna dena hai manually fill krke bas ye hona
// chahiye brand se kitna aya kitne fees thi and refund kyu de rha hai").
// Admin → UGC Refunds: each refund shows what the brand paid for that brief (deal + service fee − coupon), and the
// admin can add a manual service-fee refund (amount + reason). A fee refund is an ordinary ugc_refunds row (slots 0,
// reason starts with the tag below), so it goes through the same "mark as sent with UTR" step and brand notice.
// Caps: never more than the fee that is left, never more than the brand paid in total for the brief.
import crypto from "crypto";
import { toAdminRefundSnapshot } from "./ugcRefundAccounts";

export const UGC_FEE_REFUND_TAG = "[service-fee refund]";
export const isUgcFeeRefund = (r: any) => String(r?.reason || "").startsWith(UGC_FEE_REFUND_TAG);
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** The brief's deposit row: brief_id set, not an order / deal row. */
export const isDepositRow = (tx: any) => Boolean(tx && tx.brief_id && !tx.deal_id && !tx.ugc_order_id);

export type FeeView = {
  brand_paid: number; deal_amount: number; service_fee: number; fee_pct: number | null; coupon_code: string | null;
  fee_refunded: number; total_refunded: number; fee_left: number; total_left: number;
};

/** What the brand paid for one brief and what is still refundable. `refunds` = that brief's ugc_refunds rows. */
export function feeView(deposit: any, refunds: any[] = []): FeeView | null {
  if (!deposit) return null;
  const deal = Number(deposit.gross_amount) || 0;
  const fee = Math.max(0, (Number(deposit.brand_fee_amount) || 0) + (Number(deposit.brand_fee_gst) || 0));
  const paid = Number(deposit.brand_paid_amount) > 0 ? Number(deposit.brand_paid_amount) : deal;
  const live = (refunds || []).filter((r) => String(r?.status || "").toUpperCase() !== "FAILED");
  const feeRefunded = live.filter(isUgcFeeRefund).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const total = live.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return {
    brand_paid: r2(paid), deal_amount: r2(deal), service_fee: r2(fee),
    fee_pct: deposit.brand_fee_pct != null ? Number(deposit.brand_fee_pct) : null,
    coupon_code: deposit.coupon_code || null,
    fee_refunded: r2(feeRefunded), total_refunded: r2(total),
    fee_left: r2(Math.max(0, Math.min(fee - feeRefunded, paid - total))),
    total_left: r2(Math.max(0, paid - total)),
  };
}

/** null = OK, else the reason the fee refund can't be added. */
export function feeRefundProblem(view: FeeView | null, amount: number, reason: string): string | null {
  if (!view || !(view.service_fee > 0)) return "This brief has no service fee to refund.";
  if (!(Number(amount) > 0)) return "Enter the amount to refund.";
  if (String(reason || "").trim().length < 4) return "Write why the fee is being refunded.";
  if (Number(amount) > view.fee_left + 0.005) {
    return view.fee_left > 0
      ? `Only ₹${view.fee_left.toLocaleString("en-IN")} of the service fee can still be refunded.`
      : "The service fee has already been refunded.";
  }
  return null;
}

const DEPOSIT_COLS = "id, brief_id, brand_id, deal_id, ugc_order_id, gross_amount, brand_paid_amount, brand_fee_amount, brand_fee_gst, brand_fee_pct, coupon_code, created_at";

/** Adds `fee_view` to each queue row (one deposit lookup for all briefs). Never throws — the queue still loads. */
export async function attachFeeViews(client: any, refunds: any[], localTx: any[] = []): Promise<any[]> {
  const ids = Array.from(new Set((refunds || []).map((r) => r?.brief_id).filter(Boolean)));
  if (!ids.length) return refunds;
  let deposits: any[] = [];
  if (client) {
    try {
      const { data, error } = await client.from("transactions").select(DEPOSIT_COLS).in("brief_id", ids);
      if (!error && Array.isArray(data)) deposits = data.filter(isDepositRow);
    } catch { /* falls back to local rows */ }
  }
  const pick = (briefId: string) =>
    deposits.find((t) => t.brief_id === briefId && Number(t.brand_paid_amount) > 0)
    || deposits.find((t) => t.brief_id === briefId)
    || (localTx || []).find((t) => isDepositRow(t) && t.brief_id === briefId && Number(t.brand_paid_amount) > 0)
    || null;
  return refunds.map((r) => ({ ...r, is_fee_refund: isUgcFeeRefund(r), fee_view: feeView(pick(r.brief_id), refunds.filter((x) => x.brief_id === r.brief_id)) }));
}

type Deps = {
  parseAuthUser: (req: any) => Promise<any>;
  isAdmin: (u: any) => boolean;
  client: () => any;
  getDb: () => any;
  saveDb: (db: any) => void;
};

/** POST /admin/ugc-refunds/fee { brief_id, amount, reason } → a PENDING fee refund row in the queue. */
export function registerUgcFeeRefundRoute(router: any, deps: Deps) {
  router.post("/admin/ugc-refunds/fee", async (req: any, res: any) => {
    const user = await deps.parseAuthUser(req);
    if (!user || !deps.isAdmin(user)) return res.status(403).json({ error: "Admin access required" });
    const briefId = String(req.body?.brief_id || "").trim();
    const amount = r2(Number(req.body?.amount));
    const reason = String(req.body?.reason || "").trim().slice(0, 500);
    if (!briefId) return res.status(400).json({ error: "Which brief is this for?" });
    const client = deps.client();
    if (!client) return res.status(503).json({ error: "Refunds can't be saved right now. Try again in a minute." });

    const { data: txs, error: txErr } = await client.from("transactions").select(DEPOSIT_COLS).eq("brief_id", briefId);
    if (txErr) return res.status(503).json({ error: "Couldn't load the payment. Try again." });
    const deposits = (txs || []).filter(isDepositRow);
    const deposit = deposits.find((t: any) => Number(t.brand_paid_amount) > 0) || deposits[0] || null;
    const { data: rows, error: rErr } = await client.from("ugc_refunds").select("id, brief_id, amount, status, reason").eq("brief_id", briefId);
    if (rErr) return res.status(503).json({ error: "Couldn't load earlier refunds. Try again." });
    const view = feeView(deposit, rows || []);
    const problem = feeRefundProblem(view, amount, reason);
    if (problem) return res.status(400).json({ error: problem, code: "FEE_REFUND_INVALID", fee_view: view });

    let brandId = deposit.brand_id || null;
    if (!brandId) {
      const { data: brief } = await client.from("ugc_briefs").select("brand_id").eq("id", briefId).maybeSingle();
      brandId = brief?.brand_id || null;
    }
    if (!brandId) return res.status(409).json({ error: "Couldn't find the brand for this brief." });
    const { data: acc } = await client.from("brand_refund_accounts").select("*").eq("brand_id", brandId).maybeSingle();
    const snapshot = toAdminRefundSnapshot(acc);
    if (!snapshot || (!snapshot.upi_id && !snapshot.bank_account_number)) {
      return res.status(409).json({ error: "The brand hasn't added a refund account yet.", code: "REFUND_ACCOUNT_REQUIRED" });
    }
    const nowIso = new Date().toISOString();
    const row = {
      id: `ugcref_fee_${crypto.randomUUID()}`,
      brief_id: briefId, brand_id: brandId, amount, slots: 0,
      reason: `${UGC_FEE_REFUND_TAG} ${reason}`,
      status: "PENDING", refund_account_snapshot: snapshot,
      utr: null, failure_reason: null, requested_at: nowIso, processed_at: null, processed_by: null,
    };
    const { error: insErr } = await client.from("ugc_refunds").insert(row);
    if (insErr) return res.status(502).json({ error: "Couldn't save the fee refund. Nothing was changed." });
    try {
      const db = deps.getDb();
      if (!db.admin_logs) db.admin_logs = [];
      db.admin_logs.unshift({ id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, actor_id: user.user_id, action: "UGC_FEE_REFUND_ADDED", target_id: row.id, details: `Service-fee refund ₹${amount} for brief ${briefId}: ${reason}`, created_at: nowIso });
      deps.saveDb(db);
    } catch { /* log only */ }
    return res.json({ ok: true, refund: row, fee_view: feeView(deposit, [...(rows || []), row]) });
  });
}
