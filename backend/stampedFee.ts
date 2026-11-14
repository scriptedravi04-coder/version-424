// Session 36 (Ravi, option A): the fee a deal gets is the fee at the moment the brand PAID. When the
// brand pays, the fee is already written on the transaction (platform_fee_amount / creator_net_amount /
// gst_amount — payment_routes persistEscrowPayment, services/escrowService). At payout, use that stamp
// instead of re-calculating with today's settings, so turning an offer on or off never changes a deal
// that is already paid. Only when no stamp exists (very old rows) do we fall back to the calculator.
type FeeResult = { feePercent: number; platformFee: number; gstAmount: number; creatorNet: number; source: "stamped" | "calculated" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pure: apply a stamped transaction's rates to an amount. null when the row has no usable stamp. */
export function feeFromStamp(tx: any, amount: number): FeeResult | null {
  const gross = Number(tx?.gross_amount) || 0;
  if (!tx || gross <= 0 || tx.platform_fee_amount == null || isNaN(Number(tx.platform_fee_amount))) return null;
  const feeRate = Number(tx.platform_fee_amount) / gross;
  const gstRate = (Number(tx.gst_amount) || 0) / gross;
  const amt = Math.max(0, Number(amount) || 0);
  const platformFee = Math.round(amt * feeRate);
  const gstAmount = Math.round(amt * gstRate);
  return {
    feePercent: Math.round(feeRate * 10000) / 100,
    platformFee,
    gstAmount,
    creatorNet: Math.max(0, Math.round(amt - platformFee - gstAmount)),
    source: "stamped",
  };
}

export async function findStampedTransaction(client: any, ids: { dealId?: any; ugcOrderId?: any; briefId?: any }) {
  if (!client) return null;
  const tries: Array<[string, any]> = [];
  const d = ids.dealId ? String(ids.dealId) : "";
  const u = ids.ugcOrderId ? String(ids.ugcOrderId) : "";
  if (d && UUID_RE.test(d)) tries.push(["deal_id", d]);
  if (d) tries.push(["campaign_deal_id", d]);
  if (u) { if (UUID_RE.test(u)) tries.push(["ugc_order_id", u]); tries.push(["ugc_order_id_text", u]); }
  if (ids.briefId) tries.push(["brief_id", String(ids.briefId)]);
  for (const [col, val] of tries) {
    try {
      const { data, error } = await client.from("transactions")
        .select("gross_amount, platform_fee_amount, gst_amount, created_at, status")
        .eq(col, val).gt("gross_amount", 0).order("created_at", { ascending: true }).limit(5);
      if (error || !Array.isArray(data)) continue;
      const row = data.find((r: any) => r.platform_fee_amount != null && String(r.status || "").toUpperCase() !== "REFUNDED");
      if (row) return row;
    } catch { /* try the next key */ }
  }
  return null;
}

/** Fee for a payout: the stamp from payment time, else today's calculator. */
export async function feeAtPaymentTime(
  client: any,
  ids: { dealId?: any; ugcOrderId?: any; briefId?: any },
  amount: number,
  calculate: (amount: number, client: any) => Promise<any>,
): Promise<FeeResult> {
  const tx = await findStampedTransaction(client, ids);
  const stamped = feeFromStamp(tx, amount);
  if (stamped) return stamped;
  const c = await calculate(amount, client);
  return {
    feePercent: Number(c?.feePercent ?? 15),
    platformFee: Number(c?.platformFee ?? 0),
    gstAmount: Number(c?.gstAmount ?? 0),
    creatorNet: Number(c?.creatorNet ?? amount),
    source: "calculated",
  };
}
