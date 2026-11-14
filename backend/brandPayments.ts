import { hasRefund } from "./refundFlags";
// Session 57 (Ravi's Money screens design, BP-01 / 01b / 02). One read-only list of a brand's money:
// campaign payments (per deal), UGC brief deposits (per brief), and every refund (campaign + UGC),
// with the summary numbers at the top. Nothing is written here; the money rules live in the locked
// payment files and are not touched.
import express from "express";
import { logIgnored } from "./logIgnored";
import { isBrandLike } from "./roleGuards"; // v416 (CR4)
import { isDepositRow, isUgcFeeRefund } from "./ugcFeeRefunds"; // v416 (U1/U3)

const up = (v: any) => String(v ?? "").trim().toUpperCase();
const actingBrandId = (u: any) => String(u?.parent_brand_id || u?.user_id || "");
const num = (v: any) => Number(v) || 0;

// v418: Indian GSTIN shape (2-digit state, PAN, entity no., Z, check char)
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Pure: a campaign payment row's status for the brand. */
export function campaignPaymentStatus(tx: any): "escrow" | "released" | "refunded" {
  const st = up(tx?.status), ps = up(tx?.payout_status), rs = up(tx?.refund_status);
  // v396 (QA M-2): a PART refund is not "Refunded" — the deal goes on (escrow / released) with the refunded part noted
  const partOnly = rs === "PROCESSED" && st !== "REFUNDED" && ps !== "REFUNDED" && num(tx?.refund_amount) > 0 && num(tx?.refund_amount) < num(tx?.gross_amount);
  if (!partOnly && (st === "REFUNDED" || ps === "REFUNDED" || rs === "PROCESSED")) return "refunded";
  if (ps === "RELEASED" || ps === "PAID" || ps === "COMPLETED" || String(tx?.payout_reference || "").trim()) return "released";
  return "escrow";
}

/** v396 (QA M-2 / M-7): what one campaign payment row adds to "Spent this year" (paid − refunded back) and to
 *  "In escrow" (the deal money still held — never the brand's service fee + GST, which isn't held). Pure. */
export function campaignMoney(tx: any): { paid: number; refunded: number; spent: number; held: number } {
  const paid = num(tx?.brand_paid_amount) || num(tx?.gross_amount);
  const refunded = up(tx?.refund_status) === "PROCESSED" ? Math.min(paid, num(tx?.refund_amount)) : 0;
  const deal = num(tx?.gross_amount) || paid;
  const held = campaignPaymentStatus(tx) === "escrow" ? Math.max(0, deal - refunded) : 0;
  return { paid, refunded, spent: Math.max(0, paid - refunded), held };
}

/** Pure: a UGC brief's status from its orders. Released once every claimed slot is approved and no slot is open. */
export function briefPaymentStatus(brief: any, orders: any[], heldLeft: number | null = null): { status: "escrow" | "released"; delivered: number; completed: number; live: number } {
  const live = (orders || []).filter((o) => !["CANCELLED", "EXPIRED"].includes(up(o.status)));
  const completed = live.filter((o) => up(o.status) === "COMPLETED").length;
  const delivered = live.filter((o) => ["SUBMITTED", "QUALITY_REVIEW", "CONTENT_APPROVED", "AWAITING_LIVE_LINK", "LINKS_UNDER_REVIEW", "COMPLETED"].includes(up(o.status))).length;
  const slots = Math.max(0, num(brief?.max_creators));
  // v423 (P10): when the money split is known, "released" = something was paid out and nothing is held any more — a
  // brief whose other slots were cancelled / refunded no longer stays "In escrow" for ever.
  const allDone = (slots > 0 && completed >= slots) || (heldLeft !== null && completed > 0 && num(heldLeft) <= 0);
  return { status: allDone ? "released" : "escrow", delivered, completed, live: live.length };
}

/** v416 (U1/U2): one UGC brief's money, split the way the brand reads it. Pure.
 *  released = creator budget of approved (COMPLETED / payment RELEASED) orders;
 *  refunded / refund_pending = budget refunds for cancelled slots (service-fee refunds are counted apart);
 *  held = the rest of the creator budget still held by Ybex — open (unclaimed) paid slots count as held. */
export function ugcBriefMoney(brief: any, orders: any[] = [], refunds: any[] = [], deposit: any = null) {
  const per = num(brief?.budget);
  const live = (refunds || []).filter((r) => up(r?.status) !== "FAILED");
  const slotRefunds = live.filter((r) => !isUgcFeeRefund(r));
  const refunded = slotRefunds.filter((r) => up(r.status) === "PROCESSED").reduce((a, r) => a + num(r.amount), 0);
  const refundPending = slotRefunds.filter((r) => up(r.status) !== "PROCESSED").reduce((a, r) => a + num(r.amount), 0);
  const feeRefunded = live.filter(isUgcFeeRefund).filter((r) => up(r.status) === "PROCESSED").reduce((a, r) => a + num(r.amount), 0);
  const refundedSlots = slotRefunds.reduce((a, r) => a + Math.max(0, num(r.slots)), 0);
  const releasedCount = (orders || []).filter((o) => up(o?.status) === "COMPLETED" || up(o?.payment_status) === "RELEASED").length;
  // what was paid for creators: the deposit when known, else today's slots + the refunded ones
  const dealAmount = num(deposit?.gross_amount) || per * (Math.max(0, num(brief?.max_creators)) + refundedSlots);
  const serviceFee = Math.max(0, num(deposit?.brand_fee_amount));
  const serviceFeeGst = Math.max(0, num(deposit?.brand_fee_gst));
  const brandPaid = num(deposit?.brand_paid_amount) || dealAmount + serviceFee + serviceFeeGst;
  const released = Math.min(dealAmount, per * releasedCount);
  const held = Math.max(0, dealAmount - released - refunded - refundPending);
  return { deal_amount: dealAmount, brand_paid: brandPaid, service_fee: serviceFee, service_fee_gst: serviceFeeGst, released, held, refunded, refund_pending: refundPending, fee_refunded: feeRefunded, released_count: releasedCount };
}

function dealDetail(deal: any): string {
  const st = up(deal?.status);
  if (st === "CONTENT_SUBMITTED" || st === "PROOF_SUBMITTED") return "Draft in your review";
  if (st === "COMPLETED" || st === "APPROVED" || st === "CONTENT_APPROVED") return "Approved";
  if (deal?.content_deadline) {
    const d = new Date(deal.content_deadline);
    if (!Number.isNaN(d.getTime())) return `Draft due ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
  }
  return "Creator is working on it";
}

export function setupBrandPaymentsRoutes(router: express.Router, { supabase, privilegedSupabase, parseAuthUser }: any) {
  router.get("/brand/payments-overview", async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Please sign in." });
    if (!isBrandLike(user.role)) return res.status(403).json({ error: "Brands only" }); // v416 (CR4): agency / talent manager too
    const c = privilegedSupabase || supabase;
    if (!c) return res.json({ ok: false, items: [], refunds: [] });
    const brandId = actingBrandId(user);
    const ids = [...new Set([brandId, String(user.user_id)])];
    try {
      const [dealsR, briefsR, accR, ugcRefR, kycR] = await Promise.all([
        c.from("deals").select("id, campaign_id, creator_id, agreed_amount, status, content_deadline, created_at").in("brand_id", ids).limit(1000),
        c.from("ugc_briefs").select("id, title, product_name, budget, max_creators, status, razorpay_order_id, created_at").in("brand_id", ids).limit(1000),
        c.from("brand_refund_accounts").select("id").in("brand_id", ids).limit(1),
        c.from("ugc_refunds").select("id, brief_id, brand_id, amount, slots, reason, status, utr, failure_reason, requested_at, processed_at").in("brand_id", ids).limit(500),
        // v418: the brand's GSTIN for its receipts — only a business that gave one at KYC (solo brands send none)
        Promise.resolve(c.from("brand_kyc").select("gst_number").in("brand_id", ids).limit(5)).catch(() => null),
      ]);
      // v332: a failed read is not "no payments" (the first-time screen) — the app shows "Try again" instead.
      if (dealsR?.error || briefsR?.error || ugcRefR?.error) throw new Error("payments read failed");
      const deals = dealsR?.data || [];
      const briefs = (briefsR?.data || []).filter((b: any) => b.razorpay_order_id); // paid briefs only
      const dealIds = deals.map((d: any) => d.id);
      const briefIds = briefs.map((b: any) => b.id);

      const [txR, campR, ordersR] = await Promise.all([
        dealIds.length ? c.from("transactions").select("id, deal_id, gross_amount, brand_paid_amount, brand_fee_amount, brand_fee_gst, brand_fee_pct, coupon_code, platform_fee_amount, gst_amount, creator_net_amount, status, payout_status, payout_reference, refund_amount, refund_status, refund_reference, refund_reason, refunded_at, zaakpay_order_id, created_at").in("deal_id", dealIds) : { data: [] },
        deals.length ? c.from("campaigns").select("*").in("campaign_id", [...new Set(deals.map((d: any) => d.campaign_id).filter(Boolean))]) : { data: [] },
        briefIds.length ? c.from("ugc_orders").select("id, brief_id, status, payment_status, creator_id").in("brief_id", briefIds) : { data: [] },
      ]);
      if ((txR as any)?.error) throw new Error("transactions read failed");
      // v416 (U3): each paid brief's deposit row (what the brand paid: creator budget + service fee + GST)
      let briefDeposits: any[] = [];
      if (briefIds.length) {
        try {
          const dR: any = await c.from("transactions").select("*").in("brief_id", briefIds);
          if (!dR?.error) briefDeposits = (dR?.data || []).filter(isDepositRow);
        } catch (e: any) { logIgnored("brandPayments:briefDeposits", e); }
      }
      const depositOf = (briefId: string) => briefDeposits.find((t: any) => String(t.brief_id) === briefId && num(t.brand_paid_amount) > 0)
        || briefDeposits.find((t: any) => String(t.brief_id) === briefId) || null;
      const creatorIds = [...new Set([...deals.map((d: any) => d.creator_id), ...(ordersR?.data || []).map((o: any) => o.creator_id)].filter(Boolean))];
      const { data: people } = creatorIds.length ? await c.from("users").select("user_id, name").in("user_id", creatorIds) : { data: [] };
      const nameOf = new Map((people || []).map((p: any) => [String(p.user_id), p.name]));
      // v396 (QA M-8): "Campaign deal" showed when the campaign row is keyed by id — look up both ids
      let campRows: any[] = campR?.data || [];
      const missingCamp = [...new Set(deals.map((d: any) => String(d.campaign_id || "")).filter(Boolean))].filter((id) => !campRows.some((x: any) => String(x.campaign_id) === id));
      if (missingCamp.length) {
        try { const r2: any = await c.from("campaigns").select("*").in("id", missingCamp); campRows = campRows.concat(r2?.data || []); } catch { /* names are optional */ }
      }
      const titleOf = new Map<string, any>();
      for (const x of campRows) { const tt = x.title || x.name; if (!tt) continue; if (x.campaign_id) titleOf.set(String(x.campaign_id), tt); if (x.id) titleOf.set(String(x.id), tt); }
      const dealOf = new Map(deals.map((d: any) => [String(d.id), d]));
      const ordersByBrief = new Map<string, any[]>();
      (ordersR?.data || []).forEach((o: any) => { const k = String(o.brief_id); ordersByBrief.set(k, [...(ordersByBrief.get(k) || []), o]); });

      const items: any[] = [];
      const refunds: any[] = [];
      const retained: { date: string; amount: number }[] = []; // v396: fully refunded rows whose fee was kept
      for (const t of txR?.data || []) {
        const d: any = dealOf.get(String(t.deal_id)) || {};
        if (hasRefund(t)) { // Session 58: refund_status 'NONE' (DB default) is not a refund
          refunds.push({
            id: `tx_${t.id}`, kind: "campaign", title: titleOf.get(String(d.campaign_id)) || "Campaign deal",
            amount: num(t.refund_amount), status: up(t.refund_status) === "PROCESSED" ? "refunded" : "pending",
            reason: t.refund_reason || null, utr: up(t.refund_status) === "PROCESSED" ? (t.refund_reference || null) : null,
            date: t.refunded_at || t.created_at,
          });
          if (up(t.status) === "REFUNDED") { // v396 (QA M-2): a kept service fee still counts as spent
            const m = campaignMoney(t);
            if (m.spent > 0) retained.push({ date: t.created_at, amount: m.spent });
            continue;
          }
        }
        items.push({
          id: t.id, kind: "campaign", deal_id: t.deal_id,
          title: titleOf.get(String(d.campaign_id)) || "Campaign deal",
          who: nameOf.get(String(d.creator_id)) || "Creator",
          amount: num(t.brand_paid_amount) || num(t.gross_amount), // Session 58 (Ravi): brands see only the total — no fee / GST / creator payout; v364: what the brand paid incl. service fee
          ...(num(t.brand_fee_amount) > 0 ? { deal_amount: num(t.gross_amount), service_fee: num(t.brand_fee_amount), service_fee_pct: num(t.brand_fee_pct), coupon_code: t.coupon_code || null } : {}),
          // v416 (U3): receipt fields (same names as a transaction row, so one receipt works for both)
          gross_amount: num(t.gross_amount), brand_paid_amount: num(t.brand_paid_amount) || num(t.gross_amount),
          brand_fee_amount: num(t.brand_fee_amount), brand_fee_gst: num(t.brand_fee_gst), brand_fee_pct: t.brand_fee_pct ?? null,
          payee_name: nameOf.get(String(d.creator_id)) || "Creator", transaction_id: t.id,
          // v416 (U1): released to the creator (deal money once paid out, minus any refunded part)
          released: campaignPaymentStatus(t) === "released" ? Math.max(0, (num(t.gross_amount) || num(t.brand_paid_amount)) - campaignMoney(t).refunded) : 0,
          status: campaignPaymentStatus(t),
          detail: campaignPaymentStatus(t) === "escrow" ? dealDetail(d) : null,
          ...(campaignMoney(t).refunded > 0 ? { refunded_amount: campaignMoney(t).refunded } : {}), // v396 (QA M-2)
          spent: campaignMoney(t).spent, held: campaignMoney(t).held, // v396 (QA M-2 / M-7)
          date: t.created_at, order_id: t.zaakpay_order_id || null,
        });
      }
      const ugcRefRows: any[] = ugcRefR?.data || [];
      for (const b of briefs) {
        const orders = ordersByBrief.get(String(b.id)) || [];
        const slots = Math.max(1, num(b.max_creators));
        const dep = depositOf(String(b.id));
        const m = ugcBriefMoney(b, orders, ugcRefRows.filter((r: any) => String(r.brief_id) === String(b.id)), dep);
        const s = briefPaymentStatus(b, orders, num(m.held) + num(m.refund_pending)); // v423 (P10): a refund still pending is not "released"
        // v416 (U3): the real creator name when one creator is on it, else "Creators (n)"
        const names = [...new Set(orders.filter((o: any) => !["CANCELLED", "EXPIRED"].includes(up(o.status))).map((o: any) => nameOf.get(String(o.creator_id))).filter(Boolean))];
        const payee = names.length === 1 && slots === 1 ? String(names[0]) : slots > 1 ? `Creators (${slots})` : "Creator";
        items.push({
          id: `brief_${b.id}`, kind: "ugc", brief_id: b.id,
          title: b.title || b.product_name || "UGC brief",
          who: `${slots} creator${slots > 1 ? "s" : ""}`,
          amount: num(b.budget) * slots,
          // v416 (U1/U2/U3): money split + receipt fields
          held: m.held, released: m.released, refunded_amount: m.refunded, refund_pending: m.refund_pending,
          deal_amount: m.deal_amount, gross_amount: m.deal_amount, brand_paid_amount: m.brand_paid,
          brand_fee_amount: m.service_fee, brand_fee_gst: m.service_fee_gst, brand_fee_pct: dep?.brand_fee_pct ?? null,
          service_fee: m.service_fee, coupon_code: dep?.coupon_code || null,
          payee_name: payee, creator_names: names, released_count: m.released_count,
          transaction_id: dep?.id || null, payment_id: dep?.razorpay_payment_id || null,
          // Session 58 (bug hunt): a cancelled brief was shown as "Released" with its full amount — the money
          // goes back to the brand (see refunds), so it gets its own status.
          status: up(b.status) === "CANCELLED" ? "cancelled" : s.status,
          detail: s.status === "escrow" ? `${s.delivered} of ${slots} delivered` : null,
          date: b.created_at, order_id: b.razorpay_order_id,
        });
      }
      for (const r of ugcRefR?.data || []) {
        const b = briefs.find((x: any) => String(x.id) === String(r.brief_id));
        refunds.push({
          id: `ugc_${r.id}`, kind: "ugc", brief_id: r.brief_id || null, is_fee_refund: isUgcFeeRefund(r), title: b?.title || b?.product_name || "UGC brief",
          amount: num(r.amount), status: up(r.status) === "PROCESSED" ? "refunded" : up(r.status) === "FAILED" ? "failed" : "pending",
          reason: r.reason || null, utr: up(r.status) === "PROCESSED" ? (r.utr || null) : null,
          failure: r.failure_reason || null, date: r.processed_at || r.requested_at,
        });
      }
      items.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
      refunds.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

      const year = new Date().getFullYear();
      const summary = {
        // v396 (QA M-7): deal money held (not the brand fee + GST); v396 (QA M-2): spent = paid − refunded back
        in_escrow: items.filter((i) => i.status === "escrow").reduce((a, i) => a + (i.kind === "campaign" ? num(i.held) : i.amount), 0),
        spent_this_year: items.filter((i) => new Date(i.date || 0).getFullYear() === year).reduce((a, i) => a + (i.kind === "campaign" ? num(i.spent) : i.amount), 0)
          + retained.filter((r) => new Date(r.date || 0).getFullYear() === year).reduce((a, r) => a + r.amount, 0),
        active_campaign: items.filter((i) => i.kind === "campaign" && i.status === "escrow").length,
        active_ugc: items.filter((i) => i.kind === "ugc" && i.status === "escrow").length,
        has_refund_account: Array.isArray(accR?.data) && accR.data.length > 0,
        refund_waiting: refunds.filter((r) => r.status !== "refunded").reduce((a, r) => a + r.amount, 0),
      };
      // v416 (U1/U2): clearly named totals. spent_this_year = what the brand PAID this year (it includes money still
      // held), so it must not be labelled "Released". held_now counts open paid UGC slots too.
      const sumOf = (list: any[], k: string) => list.reduce((a, i) => a + num(i[k]), 0);
      const thisYear = (i: any) => new Date(i.date || 0).getFullYear() === year;
      Object.assign(summary, {
        held_now: sumOf(items.filter((i) => i.kind === "campaign"), "held") + sumOf(items.filter((i) => i.kind === "ugc"), "held"),
        released_total: sumOf(items, "released"),
        released_this_year: sumOf(items.filter(thisYear), "released"),
        refunded_total: refunds.filter((r) => r.status === "refunded").reduce((a, r) => a + num(r.amount), 0),
        paid_this_year: summary.spent_this_year,
        ugc_held_now: sumOf(items.filter((i) => i.kind === "ugc"), "held"),
        ugc_released_total: sumOf(items.filter((i) => i.kind === "ugc"), "released"),
        ugc_refunded_total: refunds.filter((r) => r.kind === "ugc" && r.status === "refunded").reduce((a, r) => a + num(r.amount), 0),
      });
      (summary as any).in_escrow = (summary as any).held_now; // v416 (U2): same number under the old name (open paid UGC slots included)
      // v418: GSTIN on receipts only when the brand registered as a business with a valid GSTIN.
      const gstRaw = ((kycR as any)?.data || []).map((r: any) => String(r?.gst_number || "").trim().toUpperCase()).find((g: string) => GSTIN_RE.test(g)) || null;
      (summary as any).brand_gstin = gstRaw;
      if (gstRaw) for (const it of items) it.brand_gstin = gstRaw;
      return res.json({ ok: true, items, refunds, summary });
    } catch (e: any) {
      logIgnored("brandPayments:overview", e);
      return res.status(503).json({ ok: false, code: "PAYMENTS_UNAVAILABLE", error: "Payments couldn't be loaded right now. Please try again.", retry: true });
    }
  });
}
