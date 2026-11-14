import { hasRefund } from "./refundFlags";
// Session 36 (Ravi): campaign / deal refunds work like UGC refunds. Refunds are sent by hand (Razorpay
// free plan has no automatic refunds), so:
//  1. the brand keeps ONE refund account (UPI or bank) — the same brand_refund_accounts row UGC uses
//     (GET/POST /api/brand/refund-account, ugc_routes.ts);
//  2. the admin's Refund screen shows that account so the money can be sent, or asks the brand to add it;
//  3. the admin records the UTR with the existing POST /admin/transactions/:id/refund (payment_routes.ts,
//     unchanged) and the brand is told;
//  4. the brand sees every refund with its status and UTR (GET /api/brand/refunds).
// No locked file is changed for this.
import express from "express";
import { isBrandLike } from "./roleGuards"; // v416 (CR4)
import { isUgcFeeRefund } from "./ugcFeeRefunds";

type Deps = {
  supabase: any;
  privilegedSupabase: any;
  getDb: () => any;
  parseAuthUser: (req: express.Request) => Promise<any>;
  sendNotification: (db: any, userId: any, type: any, message: any) => Promise<any>;
};

const isAdmin = (u: any) => u && (u.role === "admin" || u.role === "sub_admin" || u.team_role === "sub_admin");
const actingBrandId = (u: any) => String(u?.parent_brand_id || u?.user_id || "");
const inr = (n: any) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

export function toBrandRefund(tx: any) {
  return {
    id: tx.id,
    deal_id: tx.deal_id || tx.campaign_deal_id || null,
    amount: Number(tx.refund_amount) || 0,
    status: String(tx.refund_status || "").toUpperCase(),   // PENDING | PROCESSED
    reference: tx.refund_status && String(tx.refund_status).toUpperCase() === "PROCESSED" ? (tx.refund_reference || null) : null,
    reason: tx.refund_reason || null,
    refunded_at: tx.refunded_at || null,
    created_at: tx.created_at || null,
    kind: "campaign", // v416 (U2)
  };
}

/** v416 (U2): a UGC brief refund (ugc_refunds row) in the same shape as a campaign refund, so one list shows both. */
export function toBrandUgcRefund(r: any, briefTitle?: string | null) {
  const st = String(r?.status || "").toUpperCase();
  return {
    id: `ugc_${r.id}`,
    deal_id: null,
    brief_id: r.brief_id || null,
    title: briefTitle || null,
    amount: Number(r.amount) || 0,
    status: st === "PROCESSED" ? "PROCESSED" : st === "FAILED" ? "FAILED" : "PENDING",
    reference: st === "PROCESSED" ? (r.utr || null) : null,
    reason: r.reason || null,
    failure_reason: st === "FAILED" ? (r.failure_reason || null) : null,
    refunded_at: st === "PROCESSED" ? (r.processed_at || null) : null,
    created_at: r.requested_at || null,
    kind: "ugc",
    is_fee_refund: isUgcFeeRefund(r),
  };
}

export function setupCampaignRefundRoutes(router: express.Router, deps: Deps) {
  const client = () => deps.privilegedSupabase || deps.supabase;

  // Admin: the brand's full refund account, to send the money.
  router.get("/admin/refund-account/:brandId", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ error: "Admin only" });
    const brandId = String(req.params.brandId || "");
    let row: any = null;
    if (client()) {
      const { data } = await client().from("brand_refund_accounts").select("*").eq("brand_id", brandId).maybeSingle();
      row = data || null;
    }
    if (!row) row = (deps.getDb().brand_refund_accounts || []).find((a: any) => a.brand_id === brandId) || null;
    if (!row) return res.json({ refund_account: null });
    return res.json({
      refund_account: {
        method_type: row.method_type || (row.upi_id ? "UPI" : "BANK"),
        upi_id: row.upi_id || null,
        bank_account_number: row.bank_account_number || null,
        bank_ifsc: row.bank_ifsc || null,
        account_holder_name: row.account_holder_name || null,
        updated_at: row.updated_at || null,
      },
    });
  });

  // Admin: tell the brand (a) to add a refund account, or (b) that the refund was sent.
  router.post("/admin/refunds/notify", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ error: "Admin only" });
    const brandId = String(req.body?.brand_id || "");
    const kind = String(req.body?.kind || "");
    if (!brandId || !["needs_account", "processed"].includes(kind)) return res.status(400).json({ error: "brand_id and kind are required" });
    const amount = inr(req.body?.amount);
    const ref = String(req.body?.reference || "").trim();
    const message = kind === "needs_account"
      ? `A refund of ${amount} is ready for you. Add your refund account (UPI or bank) in Payments so we can send it.`
      : `Your refund of ${amount} has been sent${ref ? ` (UTR ${ref})` : ""}. It can take 1–2 working days to show in your account.`;
    try {
      await deps.sendNotification(deps.getDb(), brandId, kind === "processed" ? "refund_processed" : "refund_account_needed", message);
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(502).json({ error: "Could not notify the brand." });
    }
  });

  // Brand: my refunds — campaign / deal AND (v416, U2) UGC brief refunds (each row has kind "campaign" | "ugc").
  router.get("/brand/refunds", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!isBrandLike(user.role)) return res.status(403).json({ error: "Brands only" }); // v416 (CR4)
    const brandId = actingBrandId(user);
    let rows: any[] = [];
    let ugcRows: any[] = [];
    if (client()) {
      const cols = "id, deal_id, campaign_deal_id, refund_amount, refund_status, refund_reference, refund_reason, refunded_at, created_at";
      // Session 58 (bug hunt): campaign payment rows are saved WITHOUT brand_id, so looking them up by brand_id alone
      // found nothing. Also look them up through the brand's own deals (same way Payments does).
      const ids = [...new Set([brandId, String(user.user_id)])];
      const { data: deals } = await client().from("deals").select("id").in("brand_id", ids).limit(1000);
      const dealIds = (deals || []).map((d: any) => d.id);
      const [byBrand, byDeal, ugcR] = await Promise.all([
        client().from("transactions").select(cols).eq("brand_id", brandId).not("refund_status", "is", null),
        dealIds.length ? client().from("transactions").select(cols).in("deal_id", dealIds).not("refund_status", "is", null) : Promise.resolve({ data: [], error: null }),
        client().from("ugc_refunds").select("id, brief_id, amount, slots, reason, status, utr, failure_reason, requested_at, processed_at").in("brand_id", ids).limit(500),
      ]);
      // v416 (CR21): a failed read is not "no refunds" — the card shows "couldn't load, try again"
      if ((byBrand as any)?.error || (byDeal as any)?.error || (ugcR as any)?.error) {
        return res.status(503).json({ code: "REFUNDS_UNAVAILABLE", error: "Refunds couldn't be loaded right now. Please try again.", retry: true });
      }
      const ugcList: any[] = (ugcR as any)?.data || [];
      const titleOf = new Map<string, string>();
      const briefIds = [...new Set(ugcList.map((r: any) => r.brief_id).filter(Boolean))];
      if (briefIds.length) {
        try {
          const { data: bs } = await client().from("ugc_briefs").select("id, title, product_name").in("id", briefIds);
          (bs || []).forEach((b: any) => titleOf.set(String(b.id), b.title || b.product_name || "UGC brief"));
        } catch { /* titles are optional */ }
      }
      ugcRows = ugcList.map((r: any) => toBrandUgcRefund(r, titleOf.get(String(r.brief_id)) || "UGC brief"));
      const seen = new Set<string>();
      rows = [...((byBrand as any).data || []), ...((byDeal as any).data || [])]
        .filter((t: any) => { const k = String(t.id); if (seen.has(k)) return false; seen.add(k); return true; })
        .filter(hasRefund) // Session 58: skip the 'NONE' default rows
        .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
    }
    if (rows.length === 0) {
      rows = (deps.getDb().transactions || []).filter((t: any) => t.brand_id === brandId && hasRefund(t));
    }
    if (!client()) {
      const ids = [brandId, String(user.user_id)];
      ugcRows = (deps.getDb().ugc_refunds || []).filter((r: any) => ids.includes(String(r.brand_id))).map((r: any) => toBrandUgcRefund(r, "UGC brief"));
    }
    let hasAccount = false;
    if (client()) {
      const { data } = await client().from("brand_refund_accounts").select("id").in("brand_id", [brandId, String(user.user_id)]);
      hasAccount = Array.isArray(data) && data.length > 0;
    }
    if (!hasAccount) hasAccount = (deps.getDb().brand_refund_accounts || []).some((a: any) => a.brand_id === brandId || a.brand_id === user.user_id);
    const all = [...rows.map(toBrandRefund), ...ugcRows]
      .sort((a: any, b: any) => String(b.refunded_at || b.created_at || "").localeCompare(String(a.refunded_at || a.created_at || "")));
    return res.json({ refunds: all, has_refund_account: hasAccount });
  });
}
