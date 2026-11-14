import { isInhouseBrand, isInhouseOrderId, checkInhousePin } from "./directInvites"; // v419
import { getCreatorKycStatus } from "./creatorKyc";
import { netAfterPartialRefund } from "./adminMoney";
import { logIgnored } from "./logIgnored";
import { readRiskControls } from "./riskControls";
import { emitThreadEvent, emitAdminEvent } from "./socketAccess";
import express from "express";
import crypto from "crypto";
import Razorpay from "razorpay";
import { getRazorpay } from "./helpers";
import { calculateFee as calculatePlatformFee } from "../src/utils/feeCalculator";
import { quoteBrandPayment, quoteNotes, quoteFromNotes, brandStamp, loadFeeConfig, claimBrandCoupon, confirmBrandCoupon } from "./brandFee"; // v364 split fee; v366 atomic coupon
import { feeAtPaymentTime } from "./stampedFee";
import { resolveCreatorCoupon, recordCouponUse } from "./creatorCoupons";
import { decideSignatureCheck } from "./paymentTestMode";
import { ephemeralGet, ephemeralSet, ephemeralList, ephemeralTake } from "./ephemeralStore";
import { verifyWebhookSignature, webhookOrderInfo } from "./razorpayWebhook";

// Session 56: the last Razorpay order made for a campaign deal (see create-order).
const PENDING_ORDER_TTL_MS = 30 * 60 * 1000;
// v366: the quote each order was made with (test-mode orders have no Razorpay notes to read it back from)
const ORDER_QUOTE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
// v419: orders that never went through Razorpay — test mode, and deals of Ybex in-house brands (funded by Ybex).
const isNoGatewayOrder = (id: unknown) => String(id || "").startsWith("order_test_") || isInhouseOrderId(id);
const orderQuoteKey = (orderId: string) => `orderquote:${orderId}`;
const pendingOrderKey = (dealId: string) => `rzp_pending_order:${dealId}`;
import { parsePayoutMethod, toPublicPayoutMethod, payoutRequestBlock, toEligibleDeal, isEligibleForPayout, PAYOUT_READY_DEAL_STATUSES } from "./payoutMethods";
import { payoutReleaseBlock, refundBlock, pickPayoutAccount, isPayoutRequested, fetchAllRows, isBriefDeposit, SERVICE_FEE_REFUND_TAG, refundedSoFar, feeRefundedSoFar, refundNote } from "./adminMoney";

// All payment, escrow, and payout-related routes: Razorpay order creation
// and verification, admin transaction/refund management, admin escrow
// overview and manual payout release, and creator-facing transaction/
// payout-eligibility endpoints.
//
// Extracted from server.ts as part of an ongoing, incremental effort to
// split the single giant startServer() function into smaller, focused
// files. Every dependency this code needs from the outer server.ts scope
// (the Supabase clients, in-memory db helpers, auth, notifications, etc.)
// is passed in explicitly rather than relied on via closure, so this file
// has no hidden coupling to server.ts beyond what's listed below.
export function setupPaymentRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    logAdminAction,
    sendNotification,
    fetchUserScopedTransactions,
    serializeChatMessage,
    insertChatMessageToSupabase,
    parseThreadState,
    getIsTestMode,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    logAdminAction: (user: any, action: string, targetType: string, targetId: string, details?: any) => Promise<any>;
    sendNotification: (db: any, userId: string, type: string, message: string) => Promise<any>;
    fetchUserScopedTransactions: (userId: string, role?: string) => Promise<any[]>;
    serializeChatMessage: (a?: any, b?: any, c?: any, d?: any) => any;
    insertChatMessageToSupabase: (payload: any) => Promise<any>;
    parseThreadState: (thread: any) => any;
    getIsTestMode: () => boolean;
  }
) {
  const getIsoNow = () => new Date().toISOString();
  const threadAlertCooldowns = new Map<string, number>();

  // Session 58 (Ravi): brands see only the total they paid — never the creator's payout, the Ybex fee or the GST.
  const isBrandViewer = (u: any) => ["brand", "agency", "talent_manager"].includes(String(u?.role || ""));
  const totalsOnly = (u: any, row: any) => {
    if (!isBrandViewer(u) || !row || String(row.creator_id || "") === String(u.user_id)) return row;
    const { creator_net_amount: _a, net_amount: _b, platform_fee_amount: _c, fee_amount: _d, gst_amount: _e, correct_fee_amount: _f, fee_correction_note: _g, ...rest } = row;
    return { ...rest, is_refund_row: String(row.payout_type || "") === "refund" || (Number(row.refund_amount) > 0 && Number(row.creator_net_amount || 0) === 0 && Number(row.platform_fee_amount || 0) === 0) };
  };

  // v332 (Ravi "hn"): when the database can't be read, answer 503 PAYMENTS_UNAVAILABLE (not an empty list), so the
  // app shows "couldn't load — try again" instead of "no payments" / "add a payout method".
  const unavailable = (res: express.Response) =>
    res.status(503).json({ code: "PAYMENTS_UNAVAILABLE", error: "Payments couldn't be loaded right now. Please try again.", retry: true });

  // v404 (QA L-1, Ravi: "kr de"): the dashboard, chat payout card and Eva all ask for /transactions at the same time —
  // those calls now share ONE database read per user while it is running (nothing is cached after it ends, so a new
  // payment shows at once). Optional paging: ?limit=20&offset=40 → that slice + X-Total-Count; no params = full list.
  const inFlightTx = new Map<string, Promise<any[]>>();
  const sharedTx = (userId: string, role?: string) => {
    const k = `${userId}|${role || ""}`;
    let p = inFlightTx.get(k);
    if (!p) {
      p = Promise.resolve(fetchUserScopedTransactions(userId, role)).finally(() => inFlightTx.delete(k));
      inFlightTx.set(k, p);
    }
    return p;
  };

  router.get("/transactions", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    try {
      const txns = (await sharedTx(isBrandViewer(user) ? String(user.parent_brand_id || user.user_id) : user.user_id, user.role)) || []; // v416 (CR5)
      const lim = Number.parseInt(String(req.query.limit ?? ""), 10);
      if (Number.isFinite(lim) && lim > 0) {
        const off = Math.max(0, Number.parseInt(String(req.query.offset ?? "0"), 10) || 0);
        res.setHeader("X-Total-Count", String(txns.length));
        return res.json(txns.slice(off, off + Math.min(lim, 100)).map((t: any) => totalsOnly(user, t)));
      }
      return res.json(txns.map((t: any) => totalsOnly(user, t)));
    } catch (err) {
      console.error("[/transactions] Exception fetching transactions:", err);
      return unavailable(res);
    }
  });


  router.get("/escrow-transactions", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    try {
      // v416 (CR5): a brand team member sees their brand's payments (was their own id → empty list)
      const data = await sharedTx(isBrandViewer(user) ? String(user.parent_brand_id || user.user_id) : user.user_id, user.role);

      const mapped = (data || []).map((e: any, idx: number) => ({
        id: e.id || `et-${idx}`,
        contract_id: e.contract_id || `CTR-${String(e.deal_id || e.id || "0000").slice(0, 8).toUpperCase()}`,
        brand_id: e.brand_id,
        creator_id: e.creator_id,
        creator_name: e.users?.name || e.creator_name || "Creator", // v423 (P17): was a made-up "Creator Pro"
        amount: Number(e.gross_amount || e.amount || 0),
        gross_amount: Number(e.gross_amount || 0),
        ...(isBrandViewer(user) && String(e.creator_id || "") !== String(user.user_id) ? {} : { creator_net_amount: Number(e.creator_net_amount || 0) }),
        status: (e.payout_status === 'RELEASED' || e.payout_status === 'PAID')
          ? "released"
          : ["COMPLETED"].includes((e.status || "").toUpperCase())
            ? "released"
            : ["SUCCESS", "ACTIVE", "ESCROW_HELD"].includes((e.status || "").toUpperCase())
              ? "held"
              : (e.status || "held").toLowerCase(),
        payout_status: e.payout_status,
        payout_reference: e.payout_reference,
        escrow_hold: e.escrow_hold,
        created_at: e.created_at || new Date().toISOString(),
        payout_completed_at: e.payout_completed_at || null,
        payout_released_at: e.payout_released_at || e.payout_completed_at || null,
        is_brand_approved: e.is_brand_approved,
        deal_status: e.deal_status
      }));

      res.json(mapped);
    } catch (err) {
      console.error("[/escrow-transactions] Exception:", err);
      unavailable(res);
    }
  });


  // Session 24: rules in backend/payoutMethods.ts (see the comment there).
  const loadCreatorDeals = async (userId: string) => {
    let rows: any[] = [];
    if (supabase) {
      try {
        const { data, error } = await (privilegedSupabase || supabase)
          .from('deals')
          // v375: no `campaigns(title)` embed — deals.campaign_id has no foreign key to campaigns, so the database
          // answered 400 to the whole read and Earnings showed "Your earnings are safe" to every creator with a
          // brand-approved deal. Titles are looked up separately below.
          .select('*, transactions(*)')
          .eq('creator_id', userId)
          .in('status', PAYOUT_READY_DEAL_STATUSES) // session 38: brand-approved only
          .order('updated_at', { ascending: false });
        if (error) {
          console.warn("[payout-eligible-deals] Supabase error:", error.message);
          throw Object.assign(new Error(error.message), { code: "TX_READ_FAILED" });
        }
        const campaignIds = Array.from(new Set((data || []).map((d: any) => d.campaign_id).filter(Boolean).map(String)));
        if (campaignIds.length > 0) {
          try {
            const { data: camps, error: campErr } = await (privilegedSupabase || supabase)
              .from('campaigns').select('campaign_id, title').in('campaign_id', campaignIds);
            if (campErr) throw campErr;
            const titles = new Map((camps || []).map((c: any) => [String(c.campaign_id), c.title]));
            for (const d of (data || []) as any[]) {
              const t = titles.get(String(d.campaign_id || ""));
              if (t) d.campaigns = { title: t };
            }
          } catch (e: any) {
            logIgnored("payment_routes:eligibleCampaignTitles", e); // a title is cosmetic — the deal list still loads
          }
        }
        if (Array.isArray(data)) {
          rows = data.map((d: any) => ({ deal: d, tx: Array.isArray(d.transactions) ? d.transactions[0] : d.transactions }));
        }
      } catch (e: any) {
        console.warn("[payout-eligible-deals] Supabase error:", e);
        throw e;
      }
    }
    if (rows.length === 0) {
      const db = getDb();
      rows = (db.deals || [])
        .filter((d: any) => (d.creator_id === userId || d.creatorId === userId) && PAYOUT_READY_DEAL_STATUSES.includes(d.status))
        .map((d: any) => ({ deal: d, tx: (db.transactions || []).find((t: any) => t.deal_id === d.id) || null }));
    }
    return rows;
  };

  router.get("/creator/payout-eligible-deals", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ error: "Unauthorized" });
    try {
      const rows = await loadCreatorDeals(user.user_id || user.id);
      return res.json(rows.map(({ deal, tx }) => toEligibleDeal(deal, tx)).filter(isEligibleForPayout));
    } catch (err: any) {
      console.error("[/creator/payout-eligible-deals] Exception:", err);
      return unavailable(res);
    }
  });

  const readPayoutMethod = async (userId: string) => {
    if (privilegedSupabase) {
      try {
        const { data, error } = await privilegedSupabase
          .from('creator_payment_methods').select('*').eq('user_id', userId).limit(1);
        if (error) {
          console.warn("[payment-methods] read error:", error.message);
          throw Object.assign(new Error(error.message), { code: "TX_READ_FAILED" });
        }
        if (Array.isArray(data) && data[0]) return data[0];
      } catch (e: any) { logIgnored("payment_routes:readPayoutMethod", e); throw e; }
    }
    const db = getDb();
    return (db.creator_payment_methods || []).find((m: any) => m.user_id === userId) || null;
  };

  router.get("/creator/payment-methods", async (req, res) => {
    try {
      const user = await parseAuthUser(req);
      if (!user || user.role !== "creator") {
        return res.status(403).json({ error: "Only creators can access payment methods" });
      }
      const m = await readPayoutMethod(user.user_id);
      const pub = toPublicPayoutMethod(m);
      res.json(pub && (pub.upi_id || pub.account_last4) ? [pub] : []);
    } catch (e: any) {
      console.error("Error fetching payment methods:", e);
      unavailable(res);
    }
  });

  router.post("/creator/payment-methods", async (req, res) => {
    try {
      const user = await parseAuthUser(req);
      if (!user || user.role !== "creator") {
        return res.status(403).json({ error: "Only creators can modify payment methods" });
      }
      const { row, error: invalid } = parsePayoutMethod(req.body || {});
      if (!row) return res.status(400).json({ error: invalid });

      const nowIso = getIsoNow();
      // Shared table first: that is what survives a restart and what admins read.
      if (privilegedSupabase) {
        const payload = { user_id: user.user_id, ...row, updated_at: nowIso };
        let { error } = await privilegedSupabase.from('creator_payment_methods').upsert(payload, { onConflict: 'user_id' });
        if (error) {
          // No unique constraint on user_id → do it by hand.
          const { data: existing } = await privilegedSupabase.from('creator_payment_methods').select('user_id').eq('user_id', user.user_id).limit(1);
          ({ error } = Array.isArray(existing) && existing.length
            ? await privilegedSupabase.from('creator_payment_methods').update(payload).eq('user_id', user.user_id)
            : await privilegedSupabase.from('creator_payment_methods').insert(payload));
        }
        if (error) {
          console.error("[payment-methods] save failed:", error.message);
          return res.status(502).json({ error: "Couldn't save your payout details. Please try again." });
        }
      }

      const db = getDb();
      db.creator_payment_methods = db.creator_payment_methods || [];
      let method = db.creator_payment_methods.find((m: any) => m.user_id === user.user_id);
      if (method) Object.assign(method, row, { updated_at: nowIso });
      else {
        method = { id: "pm_" + crypto.randomUUID(), user_id: user.user_id, ...row, created_at: nowIso, updated_at: nowIso };
        db.creator_payment_methods.push(method);
      }
      saveDb(db);
      res.json({ success: true, method: toPublicPayoutMethod(method) });
    } catch (e: any) {
      console.error("Error saving payment method:", e);
      res.status(500).json({ error: e.message || "Failed to save payment method" });
    }
  });

  router.post("/creator/payout-request", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ error: "Unauthorized" });

    const { deal_id, note } = req.body || {};
    if (!deal_id) return res.status(400).json({ error: "deal_id is required" });
    const userId = user.user_id || user.id;
    const nowIso = getIsoNow();
    try {
      // The server's own deal + transaction — never the client's word for amount or status.
      let deal: any = null;
      let tx: any = null;
      if (supabase) {
        try {
          const { data } = await (privilegedSupabase || supabase).from('deals').select('*, transactions(*)').eq('id', deal_id).maybeSingle();
          if (data) {
            deal = data;
            tx = Array.isArray(data.transactions) ? data.transactions[0] : data.transactions;
          }
        } catch (e: any) { logIgnored("payment_routes:payoutRequestDeal", e); }
      }
      const db = getDb();
      if (!deal) deal = (db.deals || []).find((d: any) => d.id === deal_id) || null;
      if (!tx) tx = (db.transactions || []).find((t: any) => t.deal_id === deal_id) || null;

      const block = payoutRequestBlock(userId, deal, tx);
      if (block) return res.status(block.status).json({ error: block.error, code: block.code });

      const alreadyRequested = String(tx.payout_status || "").toUpperCase() === "PROCESSING";
      if (supabase) {
        const { error } = await (privilegedSupabase || supabase)
          .from('transactions')
          .update({ payout_status: 'PROCESSING', ...(note ? { notes: String(note).slice(0, 1000) } : {}), updated_at: nowIso })
          .eq('deal_id', deal_id)
          // Session 58: never turn a row that was already paid out back into "requested".
          .or('payout_status.is.null,payout_status.not.in.(PAID,COMPLETED)');
        if (error) {
          console.error("[payout-request] update failed:", error.message);
          return res.status(502).json({ error: "Couldn't send the request. Please try again." });
        }
      }
      const localTx = (db.transactions || []).find((t: any) => t.deal_id === deal_id);
      if (localTx) {
        localTx.payout_status = 'PROCESSING';
        localTx.updated_at = nowIso;
        saveDb(db);
      }
      try {
        emitAdminEvent?.(req.app.get("io"), "payout_requested", { deal_id, creator_id: userId, reminder: alreadyRequested, at: nowIso });
      } catch (e: any) { logIgnored("payment_routes:payoutRequestEmit", e); }

      return res.json({
        success: true,
        message: alreadyRequested ? "Reminder sent to the Ybex finance team." : "Payout request sent to the Ybex finance team.",
        deal_id,
        payout_status: 'PROCESSING',
        reminder: alreadyRequested,
      });
    } catch (err: any) {
      console.error("[/creator/payout-request] Exception:", err);
      return res.status(500).json({ error: "Failed to raise payout request" });
    }
  });


  router.get("/admin/transactions", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== "admin" && user.role !== "sub_admin" && user.team_role !== "sub_admin")) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }

    if (supabase) {
      try {
        // Session 38: every page, not just Supabase's first 1000 rows.
        const { data, error } = await fetchAllRows((from, to) => supabase
          .from('transactions')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, to));

        if (error) {
          console.error("[/admin/transactions] Error fetching transactions:", error);
          return res.status(500).json({ detail: "Database error fetching transactions" });
        }
        return res.json(data || []);
      } catch (err) {
        console.error("[/admin/transactions] Exception fetching transactions:", err);
        return res.status(500).json({ detail: "Internal server error" });
      }
    } else {
      const db = getDb();
      return res.json(db.transactions || []);
    }
  });


  router.post("/admin/transactions/:id/refund", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized. Admin privileges required." });
    }

    const { id } = req.params;
    const {
      refund_amount,
      refund_reason,
      refund_reference,
      refund_status,
      fee_correction_note
    } = req.body;

    const amountNum = Number(refund_amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ error: "Please enter a valid refund amount greater than 0." });
    }

    const targetStatus = (refund_status || 'PROCESSED').toUpperCase();
    // Session 58: only these two (any other text left the payment stuck in REFUND_PENDING).
    if (!['PENDING', 'PROCESSED'].includes(targetStatus)) return res.status(400).json({ error: "Refund status must be PENDING or PROCESSED." });
    if (targetStatus === 'PROCESSED' && (!refund_reference || !String(refund_reference).trim())) {
      return res.status(400).json({ error: "Reference / UTR number is required when marking a refund as PROCESSED." });
    }

    const cleanRef = refund_reference ? String(refund_reference).trim() : null;
    const cleanReason = refund_reason ? String(refund_reason).trim() : null;
    const cleanFeeNote = fee_correction_note ? String(fee_correction_note).trim() : null;
    const nowIso = getIsoNow();

    let updatedTx: any = null;

    if (supabase) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        let findQuery = supabase.from('transactions').select('*');
        if (isUuid) {
          findQuery = findQuery.or(`id.eq.${id},zaakpay_order_id.eq.${id}`);
        } else {
          findQuery = findQuery.eq('zaakpay_order_id', id);
        }
        const { data: matched, error: findErr } = await findQuery;
        if (findErr) {
          console.error("[Admin Refund] Error finding transaction:", findErr);
          return res.status(502).json({ error: "Couldn't load this payment. Please try again." });
        }

        const existingTx = matched && matched.length > 0 ? matched[0] : null;

        // Session 38: no "refunded" toast for a payment that doesn't exist, no refund above what
        // was paid, none after the creator was paid, and never twice.
        if (!existingTx) {
          return res.status(404).json({ error: "Payment not found. Refresh the list and try again.", code: "TX_NOT_FOUND" });
        }
        // v365: "fee" = refund of the brand's service fee (Ybex's share, creator's pay untouched); default "deal".
        const refundFrom = String(req.body?.refund_from || "deal").toLowerCase() === "fee" ? "fee" : "deal";
        const refundStop = refundBlock(existingTx, amountNum, targetStatus, refundFrom);
        if (refundStop) return res.status(refundStop.status).json({ error: refundStop.error, code: refundStop.code });

        // v366: refund_amount is the running total returned to the brand (a 2nd refund after a part / fee refund adds up);
        // the service-fee part is kept in the note tag so the creator's payout only loses the DEAL part.
        // Completing / correcting a PENDING refund: the amount is the new total (nothing is added twice).
        const completingPending = String(existingTx.refund_status || '').toUpperCase() === 'PENDING' || String(existingTx.status || '').toUpperCase() === 'REFUND_PENDING';
        const prevRefunded = completingPending ? 0 : refundedSoFar(existingTx);
        const totalRefunded = Math.round((prevRefunded + amountNum) * 100) / 100;
        const feeAdded = refundFrom === "fee" && !completingPending ? amountNum : 0;
        const dealPartAfter = Math.max(0, totalRefunded - (feeRefundedSoFar(existingTx) + feeAdded));
        const updatePayload: any = {
          refund_amount: totalRefunded,
          refund_status: targetStatus,
          refund_reason: prevRefunded > 0 && cleanReason ? `${cleanReason}${existingTx.refund_reason ? ` · earlier: ${existingTx.refund_reason}` : ""}`.slice(0, 1000) : cleanReason,
          refund_reference: prevRefunded > 0 && cleanRef && existingTx.refund_reference ? `${cleanRef}, ${existingTx.refund_reference}`.slice(0, 300) : cleanRef,
          fee_correction_note: refundNote(existingTx, feeAdded > 0 ? "fee" : "deal", feeAdded, cleanFeeNote)
        };

        if (targetStatus === 'PROCESSED') {
          updatePayload.refunded_at = nowIso;
          updatePayload.refunded_by = user.user_id;
        }

        if (existingTx) {
          // Session 56 (payment audit): compare-and-set — save only if the row is still as checked
          // above, so two admins (or a double tap) can't both record a refund, or refund money that
          // was just paid out.
          const unchanged = (q: any) => {
            q = q.eq('id', existingTx.id).eq('status', existingTx.status);
            q = existingTx.payout_status == null ? q.is('payout_status', null) : q.eq('payout_status', existingTx.payout_status);
            q = existingTx.refund_status == null ? q.is('refund_status', null) : q.eq('refund_status', existingTx.refund_status);
            return q;
          };
          let { data: updatedRows, error: updateErr } = await unchanged((privilegedSupabase || supabase)
            .from('transactions')
            .update({
              ...updatePayload,
              // Session 58: only a FULL refund marks the whole payment refunded (a part refund blocked the rest of the payout).
              ...(refundFrom !== "fee" && dealPartAfter + 0.5 >= (Number(existingTx.gross_amount) || 0) ? (targetStatus === 'PROCESSED' ? { status: 'REFUNDED' } : { status: 'REFUND_PENDING' }) : {}) // v365: a fee-only refund never marks the deal refunded; v366: the deal part across all refunds
            }))
            .select('*');

          if (updateErr && updateErr.message && updateErr.message.includes('transactions_status_check')) {
            const retryRes = await unchanged((privilegedSupabase || supabase)
              .from('transactions')
              .update(updatePayload))
              .select('*');
            updatedRows = retryRes.data;
            updateErr = retryRes.error;
          }

          if (updateErr) {
            console.error("[Admin Refund] Supabase update error:", updateErr);
            return res.status(500).json({ error: updateErr.message || "Failed to update transaction refund record." });
          }
          if (!updatedRows || updatedRows.length === 0) {
            return res.status(409).json({ error: "This payment changed while you were saving (another admin may have just recorded it). Refresh and check.", code: "TX_CHANGED" });
          }
          updatedTx = updatedRows && updatedRows[0] ? updatedRows[0] : { ...existingTx, ...updatePayload };

          // If linked to a deal, release escrow hold on refund processing
          if (existingTx.deal_id && targetStatus === 'PROCESSED' && refundFrom !== "fee" && dealPartAfter + 0.5 >= (Number(existingTx.gross_amount) || 0)) {
            try {
              // v414: a full refund closes the deal — clear the funded date too (it alone counted as "funded") and cancel it,
              // so no payout can be released for money the brand already got back.
              await (privilegedSupabase || supabase)
                .from('deals')
                .update({
                  escrow_hold: false,
                  escrow_hold_at: null,
                  status: 'CANCELLED',
                  updated_at: nowIso
                })
                .eq('id', existingTx.deal_id);
            } catch (dealErr) {
              console.warn("[Admin Refund] Could not update linked deal escrow_hold:", dealErr);
            }
            // v414: free the creator slot — the deal's campaign application is cancelled too.
            try {
              const client = privilegedSupabase || supabase;
              const { data: dRow } = await client.from('deals').select('application_id').eq('id', existingTx.deal_id).maybeSingle();
              if (dRow?.application_id) {
                await client.from('campaign_applications').update({ status: 'CANCELLED' }).eq('application_id', dRow.application_id);
                const la = (getDb().campaign_applications || []).find((a: any) => a.application_id === dRow.application_id);
                if (la) la.status = 'CANCELLED';
              }
            } catch (appErr) {
              console.warn("[Admin Refund] Could not cancel the campaign application:", appErr);
            }
            // v414: close the chat thread too and tell both sides in the chat.
            try {
              const client = privilegedSupabase || supabase;
              const { data: thrRows } = await client
                .from('chat_threads')
                .select('id, brand_id, creator_id')
                .eq('deal_id', existingTx.deal_id)
                .limit(1);
              let thr: any = Array.isArray(thrRows) && thrRows[0] ? thrRows[0] : null;
              if (!thr) {
                const { data: thrById } = await client.from('chat_threads').select('id, brand_id, creator_id').eq('id', `thread_camp_${existingTx.deal_id}`).maybeSingle();
                if (thrById) thr = thrById;
              }
              if (thr?.id) {
                await client.from('chat_threads').update({ status: 'CANCELLED', flow_state: 'CANCELLED', updated_at: nowIso }).eq('id', thr.id);
                const refundText = "Payment refunded to brand — deal closed";
                const refundMsg: any = {
                  message_id: crypto.randomUUID(),
                  thread_id: thr.id,
                  sender_user_id: thr.brand_id || null,
                  text: serializeChatMessage(refundText, "system", "system", { action: 'deal_refunded', status: 'CANCELLED' }),
                  message_type: 'system',
                  metadata: { action: 'deal_refunded', status: 'CANCELLED', refunded_at: nowIso },
                  created_at: nowIso
                };
                await insertChatMessageToSupabase(refundMsg);
                const dbR = getDb();
                if (dbR) {
                  if (!dbR.chat_messages) dbR.chat_messages = [];
                  dbR.chat_messages.push({ ...refundMsg, id: refundMsg.message_id, content: refundText });
                  const lt = (dbR.chat_threads || []).find((t: any) => t.id === thr.id);
                  if (lt) { lt.status = 'CANCELLED'; lt.flow_state = 'CANCELLED'; lt.updated_at = nowIso; }
                  const ld = (dbR.deals || []).find((d: any) => d.id === existingTx.deal_id);
                  if (ld) { ld.status = 'CANCELLED'; ld.escrow_hold = false; ld.escrow_hold_at = null; ld.updated_at = nowIso; }
                  saveDb(dbR);
                }
                const ioR = req.app?.get?.("io");
                if (ioR) {
                  ioR.to(thr.id).emit("new_message", refundMsg);
                  emitThreadEvent(ioR, "thread_updated", { id: thr.id, threadId: thr.id, status: 'CANCELLED', flow_state: 'CANCELLED' });
                }
                // v418 (cancel test): both sides also get a bell / push notification, not only the chat line.
                const refundNotifs = [
                  { uid: thr.brand_id, title: "Refund done", message: `₹${Math.round(amountNum).toLocaleString("en-IN")} refunded for your cancelled deal. It reaches your account in 5–7 working days.` },
                  { uid: thr.creator_id, title: "Deal closed", message: "The brand's cancellation was approved and the deal is closed." },
                ].filter((x) => x.uid);
                for (const x of refundNotifs) {
                  const notif = { id: `notif_${crypto.randomUUID().slice(0, 10)}`, user_id: x.uid, type: "deal_refunded", title: x.title, message: x.message, link: `/messages/${thr.id}`, read: false, created_at: nowIso };
                  try { await client.from("notifications").insert(notif); } catch (e: any) { console.warn("[Admin Refund] notification failed:", e?.message || e); }
                  if (dbR) { if (!dbR.notifications) dbR.notifications = []; dbR.notifications.push(notif); }
                }
                if (dbR) saveDb(dbR);
              }
            } catch (thrErr) {
              console.warn("[Admin Refund] Could not close the linked chat thread:", thrErr);
            }
          }
          // v414: a full refund of a UGC order payment closes the order too (same idea as a UGC cancel: payment REFUNDED,
          // escrow off, order CANCELLED unless it was already COMPLETED, thread CANCELLED, note in the chat).
          if (!existingTx.deal_id && existingTx.ugc_order_id && targetStatus === 'PROCESSED' && refundFrom !== "fee" && dealPartAfter + 0.5 >= (Number(existingTx.gross_amount) || 0)) {
            const client = privilegedSupabase || supabase;
            const orderId = String(existingTx.ugc_order_id);
            let orderClosed = false;
            try {
              await client.from('ugc_orders').update({ payment_status: 'REFUNDED', escrow_hold: false, refunded_at: nowIso, updated_at: nowIso }).eq('id', orderId);
              const { data: moved } = await client.from('ugc_orders')
                .update({ status: 'CANCELLED', brand_status: 'CANCELLED', creator_status: 'CANCELLED', cancelled_at: nowIso, updated_at: nowIso })
                .eq('id', orderId).neq('status', 'COMPLETED').select('id');
              orderClosed = Array.isArray(moved) && moved.length > 0;
            } catch (ugcErr) {
              console.warn("[Admin Refund] Could not close the linked UGC order:", ugcErr);
            }
            const dbU = getDb();
            const lo = (dbU?.ugc_orders || []).find((o: any) => o.id === orderId);
            if (lo) {
              lo.payment_status = 'REFUNDED'; lo.escrow_hold = false; lo.updated_at = nowIso;
              if (String(lo.status || '').toUpperCase() !== 'COMPLETED') { lo.status = 'CANCELLED'; lo.brand_status = 'CANCELLED'; lo.creator_status = 'CANCELLED'; }
            }
            if (orderClosed) {
              try {
                const { data: thrRows } = await client.from('chat_threads').select('id, brand_id').or(`id.eq.thread_ugc_${orderId},deal_id.eq.${orderId}`).limit(1);
                const thr: any = Array.isArray(thrRows) && thrRows[0] ? thrRows[0] : null;
                if (thr?.id) {
                  await client.from('chat_threads').update({ status: 'CANCELLED', flow_state: 'CANCELLED', updated_at: nowIso }).eq('id', thr.id);
                  const refundText = "Payment refunded to brand — order closed";
                  const refundMsg: any = {
                    message_id: crypto.randomUUID(), thread_id: thr.id, sender_user_id: thr.brand_id || null,
                    text: serializeChatMessage(refundText, "system", "system", { action: 'order_refunded', status: 'CANCELLED' }),
                    message_type: 'system',
                    metadata: { action: 'order_refunded', status: 'CANCELLED', refunded_at: nowIso },
                    created_at: nowIso
                  };
                  await insertChatMessageToSupabase(refundMsg);
                  if (dbU) {
                    if (!dbU.chat_messages) dbU.chat_messages = [];
                    dbU.chat_messages.push({ ...refundMsg, id: refundMsg.message_id, content: refundText });
                    const lt = (dbU.chat_threads || []).find((t: any) => t.id === thr.id);
                    if (lt) { lt.status = 'CANCELLED'; lt.flow_state = 'CANCELLED'; lt.updated_at = nowIso; }
                  }
                  const ioU = req.app?.get?.("io");
                  if (ioU) {
                    ioU.to(thr.id).emit("new_message", refundMsg);
                    emitThreadEvent(ioU, "thread_updated", { id: thr.id, threadId: thr.id, status: 'CANCELLED', flow_state: 'CANCELLED' });
                  }
                }
              } catch (thrErr) {
                console.warn("[Admin Refund] Could not close the UGC chat thread:", thrErr);
              }
            }
            if (dbU) saveDb(dbU);
          }
        }
      } catch (err: any) {
        console.error("[Admin Refund] Exception:", err);
        // Session 38: this used to carry on and answer "success" with nothing saved.
        return res.status(500).json({ error: "Couldn't save the refund. Please try again." });
      }
    }

    // Sync with mock database if transaction exists locally
    const db = getDb();
    if (!db.transactions) db.transactions = [];
    const localIdx = db.transactions.findIndex((t: any) => t.id === id || t.transaction_id === id || t.zaakpay_order_id === id);
    if (localIdx >= 0) {
      db.transactions[localIdx] = {
        ...db.transactions[localIdx],
        refund_amount: amountNum,
        refund_status: targetStatus,
        refund_reason: cleanReason,
        refund_reference: cleanRef,
        fee_correction_note: cleanFeeNote,
        status: targetStatus === 'PROCESSED' ? 'REFUNDED' : 'REFUND_PENDING',
        refunded_at: targetStatus === 'PROCESSED' ? nowIso : undefined,
        refunded_by: targetStatus === 'PROCESSED' ? user.user_id : undefined,
        updated_at: nowIso
      };
      if (!updatedTx) updatedTx = db.transactions[localIdx];
      saveDb(db);
    } else if (!updatedTx) {
      updatedTx = {
        id,
        refund_amount: amountNum,
        refund_status: targetStatus,
        refund_reason: cleanReason,
        refund_reference: cleanRef,
        fee_correction_note: cleanFeeNote,
        status: targetStatus === 'PROCESSED' ? 'REFUNDED' : 'REFUND_PENDING',
        refunded_at: targetStatus === 'PROCESSED' ? nowIso : undefined
      };
    }

    await logAdminAction(user, 'REFUND_TRANSACTION', 'TRANSACTION', id, {
      refund_amount: amountNum,
      refund_status: targetStatus,
      refund_reference: cleanRef,
      refund_reason: cleanReason
    });

    return res.json({
      success: true,
      transaction: updatedTx
    });
  });


  router.get("/admin/escrow/overview", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    if (!supabase) return res.status(500).json({ error: "DB not initialized" });

    try {
      // Session 38: all pages (Supabase stops at 1000 rows per request).
      const { data: txns, error } = await fetchAllRows((from, to) => supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to));
      if (error) throw error;

      // Fetch related data with correct column names.
      //
      // These lookups are what turn the ledger into readable rows. Their errors used to be
      // dropped on the floor: one wrong column name here returns null, every map comes out
      // empty, and the panel quietly renders "Brand" / "Creator" / "UGC Content Deal"
      // placeholders with no clue why. Each one is now checked and named in the log.
      const [
        { data: deals, error: dealsErr },
        { data: ugcOrders, error: ugcOrdersErr },
        { data: ugcBriefs, error: ugcBriefsErr },
        { data: campaigns, error: campaignsErr },
        { data: users, error: usersErr },
        { data: brandProfiles, error: brandProfilesErr },
        { data: creatorProfiles, error: creatorProfilesErr },
        { data: creatorKyc, error: creatorKycErr },
        { data: payoutMethods, error: payoutMethodsErr }
      ] = await Promise.all([
        fetchAllRows((f, t) => supabase.from('deals').select('id, status, campaign_id, brand_id, creator_id').range(f, t)),
        fetchAllRows((f, t) => supabase.from('ugc_orders').select('id, brief_id, status, brand_id, creator_id').range(f, t)),
        fetchAllRows((f, t) => supabase.from('ugc_briefs').select('id, title, product_name, brand_name, brand_id').range(f, t)),
        fetchAllRows((f, t) => supabase.from('campaigns').select('*').range(f, t)), // v396 (QA M-8, Ravi OK): also rows keyed by id
        fetchAllRows((f, t) => supabase.from('users').select('user_id, name, email').range(f, t)),
        fetchAllRows((f, t) => supabase.from('brand_profiles').select('user_id, company_name').range(f, t)),
        fetchAllRows((f, t) => supabase.from('creator_profiles').select('user_id, name, verified, profile_status').range(f, t)),
        // creator_kyc too. A creator who entered their UPI during KYC had it written to
        // creator_kyc and verifications, never to creator_profiles — so the payout modal,
        // which only read creator_profiles, showed "Not set" while the details sat in the
        // database the whole time.
        // NOTE the column names: creator_kyc is keyed on creator_id (not user_id) and uses
        // bank_account_no / bank_holder_name.
        fetchAllRows((f, t) => supabase.from('creator_kyc').select('creator_id, upi_id, bank_account_no, bank_ifsc, bank_holder_name, full_name, status').range(f, t)),
        // Session 38: what the creator saved in Earnings → payout details. The modal never read
        // it, so admins saw "Missing Bank/UPI" for creators who had filled it in.
        fetchAllRows((f, t) => (privilegedSupabase || supabase).from('creator_payment_methods').select('*').range(f, t))
      ]);

      const lookupErrors: string[] = [];
      const noteLookupError = (label: string, err: any) => {
        if (!err) return;
        lookupErrors.push(label);
        console.error(`[admin/escrow/overview] ${label} lookup failed — names will fall back to placeholders:`, err.message || err);
      };
      noteLookupError('deals', dealsErr);
      noteLookupError('ugc_orders', ugcOrdersErr);
      noteLookupError('ugc_briefs', ugcBriefsErr);
      noteLookupError('campaigns', campaignsErr);
      noteLookupError('users', usersErr);
      noteLookupError('brand_profiles', brandProfilesErr);
      noteLookupError('creator_profiles', creatorProfilesErr);
      noteLookupError('creator_kyc', creatorKycErr);
      noteLookupError('creator_payment_methods', payoutMethodsErr);

      const dealsMap = new Map<string, any>((deals || []).map((d: any) => [d.id, d]));
      const ugcOrdersMap = new Map<string, any>((ugcOrders || []).map((u: any) => [u.id, u]));
      const ugcBriefsMap = new Map<string, any>((ugcBriefs || []).map((b: any) => [b.id, b]));
      const campaignsMap = new Map<string, any>();
      // v396 (QA M-8, Ravi OK 2 Nov): a deal may point at the campaign's id or campaign_id — admin escrow showed "Campaign deal"
      for (const c of campaigns || []) { if (c?.id) campaignsMap.set(String(c.id), c); if (c?.campaign_id) campaignsMap.set(String(c.campaign_id), c); }
      const usersMap = new Map<string, any>((users || []).map((u: any) => [u.user_id, u]));
      const brandProfilesMap = new Map<string, string>((brandProfiles || []).map((bp: any) => [bp.user_id, bp.company_name]));
      // The whole row, not just the name — the admin payout modal needs the UPI/bank fields
      // off the same record. creator_profiles is the source of truth for these; the copy
      // sometimes embedded on the transaction row is a snapshot that goes stale.
      const creatorProfilesMap = new Map<string, any>((creatorProfiles || []).map((cp: any) => [cp.user_id, cp]));

      const creatorKycMap = new Map<string, any>((creatorKyc || []).map((k: any) => [k.creator_id, k]));
      const payoutMethodsMap = new Map<string, any>((payoutMethods || []).map((m: any) => [m.user_id, m]));

      /**
       * Payout details for a creator, from wherever they actually entered them.
       *
       * Two different screens write these: profile settings writes creator_profiles, and
       * KYC writes creator_kyc. Reading only one meant half the creators showed "Not set"
       * on the payout modal even though their details were saved. Either source is taken,
       * field by field, so a partially-filled profile still resolves.
       */
      const payoutAccountFor = (cid: any) => {
        if (!cid) return null;
        return pickPayoutAccount(payoutMethodsMap.get(cid), creatorProfilesMap.get(cid), creatorKycMap.get(cid));
      };

      const enrichedTransactions = (txns || []).map((tx: any) => {
        let deal_status = undefined;
        let is_brand_approved = undefined;
        let brand_name = undefined;
        let brand_id = tx.brand_id;
        let campaign_title = undefined;
        let campaign_id = undefined;
        let creator_name = undefined;
        let creator_id = tx.creator_id;
        
        const deal = tx.deal_id ? dealsMap.get(tx.deal_id) : null;
        const ugcOrder = tx.ugc_order_id ? ugcOrdersMap.get(tx.ugc_order_id) : null;

        if (deal) {
          deal_status = deal.status;
          is_brand_approved = Boolean(deal.status === 'COMPLETED' || deal.status === 'APPROVED' || tx.payout_status === 'RELEASED' || tx.payout_status === 'READY_FOR_RELEASE');
          campaign_id = deal.campaign_id;
          brand_id = deal.brand_id || brand_id;
          creator_id = deal.creator_id || creator_id;
          
          const campaign = deal.campaign_id ? campaignsMap.get(String(deal.campaign_id)) : null;
          if (campaign) {
            campaign_title = campaign.title;
            brand_name = campaign.brand_name || brandProfilesMap.get(campaign.brand_user_id) || usersMap.get(campaign.brand_user_id)?.name;
            if (!brand_id) brand_id = campaign.brand_user_id;
          }
          if (!brand_name && deal.brand_id) {
            brand_name = brandProfilesMap.get(deal.brand_id) || usersMap.get(deal.brand_id)?.name;
          }

          const cId = deal.creator_id || tx.creator_id;
          creator_name = (creatorProfilesMap.get(cId) || {}).name || usersMap.get(cId)?.name;
        } else if (ugcOrder) {
          deal_status = ugcOrder.status;
          is_brand_approved = Boolean(ugcOrder.status === 'COMPLETED' || ugcOrder.status === 'APPROVED' || tx.payout_status === 'RELEASED' || tx.payout_status === 'READY_FOR_RELEASE');
          brand_id = ugcOrder.brand_id || brand_id;
          creator_id = ugcOrder.creator_id || creator_id;

          const brief = ugcOrder.brief_id ? ugcBriefsMap.get(ugcOrder.brief_id) : null;
          campaign_title = brief?.title ? `UGC: ${brief.title}` : (brief?.product_name ? `UGC: ${brief.product_name}` : "Instant UGC Order");
          brand_name = brief?.brand_name || brandProfilesMap.get(ugcOrder.brand_id) || usersMap.get(ugcOrder.brand_id)?.name;

          const cId = ugcOrder.creator_id || tx.creator_id;
          creator_name = (creatorProfilesMap.get(cId) || {}).name || usersMap.get(cId)?.name;
        } else if (tx.brief_id) {
          // Session 56: a UGC brief deposit (no creator yet).
          const brief = ugcBriefsMap.get(tx.brief_id);
          campaign_title = `UGC brief deposit: ${brief?.title || brief?.product_name || tx.brief_id}`;
          brand_id = brief?.brand_id || brand_id;
          brand_name = brief?.brand_name || brandProfilesMap.get(brand_id) || usersMap.get(brand_id)?.name;
        } else {
          if (tx.creator_id) {
            creator_name = (creatorProfilesMap.get(tx.creator_id) || {}).name || usersMap.get(tx.creator_id)?.name;
          }
          if (tx.brand_id) {
            brand_name = brandProfilesMap.get(tx.brand_id) || usersMap.get(tx.brand_id)?.name;
          }
        }

        const account = payoutAccountFor(creator_id);
        return {
          ...tx,
          deal_status,
          is_brand_approved,
          brand_name: brand_name || "Unknown Brand",
          brand_id,
          campaign_title: campaign_title || "Campaign Deal",
          campaign_id,
          creator_name: creator_name || "Content Creator",
          creator_payout_account: account,
          // Session 38: the creator's current saved account wins over the old snapshot on the
          // payment row; one destination only (UPI or bank), never a mix of the two.
          upi_id: account ? account.upi_id : (tx.upi_id || null),
          bank_account_no: account ? account.account_number : (tx.bank_account_no || null),
          bank_ifsc: account ? account.ifsc_code : (tx.bank_ifsc || null),
          bank_name: account ? account.bank_name : (tx.bank_name || null),
          bank_holder_name: (account && account.account_holder_name) || tx.bank_holder_name || null,
          // Session 38: "Request payout" from Earnings sets payout_status PROCESSING only; the
          // Payment Requests tab looked for payout_requested and never showed it.
          payout_requested: isPayoutRequested(tx),
          is_brief_deposit: isBriefDeposit(tx),
          // v347 (Ravi approved): what is actually left to pay the creator after a part refund to the brand
          // (creator_net_amount is kept as-is; the payout screen should show this one).
          payable_net: netAfterPartialRefund(tx, Number(tx.creator_net_amount) || 0),
          creator_id
        };
      });

      res.json({
        transactions: enrichedTransactions,
        lookup_errors: lookupErrors.length > 0 ? lookupErrors : undefined
      });
    } catch (err: any) {
      console.error("Error fetching admin escrow overview:", err);
      res.status(500).json({ error: err.message });
    }
  });


  router.post("/admin/escrow/:dealId/release-payout", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized. Admin privileges required." });
    }

    const { dealId } = req.params;
    const {
      utr_number,
      reason,
      transaction_id,
      deal_id,
      ugc_order_id,
      creator_id,
      creator_net_amount,
      gross_amount,
      platform_fee_amount
    } = req.body;

    if (!utr_number || !String(utr_number).trim()) {
      return res.status(400).json({ error: "UTR / Banking reference number is required to release payout." });
    }
    // Session 58 (Q11): admin emergency "freeze all payouts" switch blocks recording new payouts too.
    if ((await readRiskControls(privilegedSupabase || supabase)).payoutFreezeAll) {
      return res.status(409).json({ error: "All payouts are frozen in Fees & Risk settings. Turn the freeze off to release.", code: "PAYOUTS_FROZEN" });
    }

    const cleanUtr = String(utr_number).trim();
    const cleanReason = reason ? String(reason).trim() : "Payout released by admin";
    const nowIso = getIsoNow();

    const targetDealId = deal_id || ugc_order_id || dealId;
    // Session 56 (payment audit): ids are used in database filters — plain ids only.
    const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
    if (!SAFE_ID.test(String(targetDealId || "")) || (transaction_id && !SAFE_ID.test(String(transaction_id)))) {
      return res.status(400).json({ error: "Invalid deal or transaction id." });
    }
    let targetCreatorId = creator_id || null;
    // Populated alongside targetCreatorId below. Without it the local-thread fallback match
    // further down throws a ReferenceError inside a swallowing try/catch, which silently
    // skipped the "Payout Disbursed" chat card and the socket update on every release.
    let targetBrandId: string | null = null;
    let netPayout = Number(creator_net_amount) || 0;

    if (supabase) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetDealId);
        
        // Find matching transaction
        let txnQuery = supabase.from('transactions').select('*');
        if (transaction_id) {
          txnQuery = txnQuery.eq('id', transaction_id);
        } else if (isUuid) {
          txnQuery = txnQuery.or(`deal_id.eq.${targetDealId},id.eq.${targetDealId},ugc_order_id.eq.${targetDealId}`);
        } else {
          // Session 56: UGC order ids are not UUIDs; comparing them with the uuid `id` column made the
          // whole lookup fail, and the "already paid" guard was then skipped.
          txnQuery = txnQuery.eq('ugc_order_id', targetDealId);
        }

        const { data: matchedTxns, error: matchErr } = await txnQuery;
        if (matchErr) {
          console.error("[Admin Release Payout] transaction lookup failed:", matchErr);
          return res.status(502).json({ error: "Couldn't read this payment. Nothing was marked paid — try again." });
        }
        // Prefer the money row (not a refund row) when there are several.
        const matchedTx = (matchedTxns || []).find((t: any) => !t.refund_amount && String(t.payout_type || '') !== 'refund') || (matchedTxns && matchedTxns[0]) || null;
        // Session 56: a payout is always recorded against the brand's payment row. Without one there is
        // nothing to guard against a second payout, so stop here.
        if (!matchedTx) {
          return res.status(404).json({ error: "No payment was found for this deal, so the payout can't be recorded.", code: "NO_PAYMENT" });
        }

        // Session 38: a second "mark paid" sent the creator a second payout card + email, and a
        // refunded payment could still be marked paid out.
        const releaseStop = payoutReleaseBlock(matchedTx);
        if (releaseStop) return res.status(releaseStop.status).json({ error: releaseStop.error, code: releaseStop.code });
        // Session 58: no payout to a creator whose KYC isn't approved (the screen always showed "Verified KYC").
        {
          const payee = String(matchedTx.creator_id || targetCreatorId || "");
          const kyc = payee ? await getCreatorKycStatus(privilegedSupabase || supabase, getDb(), payee) : "NONE";
          if (kyc === "UNKNOWN") return res.status(502).json({ error: "Couldn't check the creator's KYC. Nothing was marked paid — try again.", code: "KYC_CHECK_FAILED" });
          if (kyc !== "APPROVED") return res.status(409).json({ error: "This creator's KYC isn't approved yet, so the payout can't be sent.", code: "KYC_REQUIRED" });
        }
        // Session 58: an admin "Freeze escrow" (dispute) put a hold on this deal → no payout until it is resolved.
        if (matchedTx.deal_id) {
          const { data: hold } = await supabase.from('deals').select('escrow_hold, escrow_hold_by_admin_id, escrow_hold_reason').eq('id', matchedTx.deal_id).maybeSingle();
          if (hold && hold.escrow_hold === true && hold.escrow_hold_by_admin_id) {
            return res.status(409).json({ error: `This deal's money is frozen by an admin${hold.escrow_hold_reason ? ` (${String(hold.escrow_hold_reason).slice(0, 120)})` : ""}. Resolve the dispute first.`, code: "ESCROW_FROZEN" });
          }
        }

        if (matchedTx) {
          // Session 56: the payment row's own creator and amount win over what the page sent.
          if (matchedTx.creator_id) targetCreatorId = matchedTx.creator_id;
          if (!targetBrandId && matchedTx.brand_id) targetBrandId = matchedTx.brand_id;
          if (Number(matchedTx.creator_net_amount) > 0) netPayout = Number(matchedTx.creator_net_amount);
          netPayout = netAfterPartialRefund(matchedTx, netPayout); // Session 58: minus a part refund to the brand
          // v347 (Ravi approved): when a processed part refund leaves nothing for the creator, stop here.
          // Before, net 0 fell through to the deal / UGC-order lookup below, which recomputed the FULL net
          // (ignoring the refund) and recorded it PAID.
          if (String(matchedTx.refund_status || '').toUpperCase() === 'PROCESSED' && Number(matchedTx.refund_amount) > 0 && !(netPayout > 0)) {
            return res.status(400).json({ error: "Nothing left to pay after the refund.", code: "NOTHING_LEFT_AFTER_REFUND" });
          }
        }
        if (!(netPayout >= 0)) netPayout = 0;

        // If still missing creator or netPayout, lookup deal or ugc_order
        if (!targetCreatorId || !netPayout) {
          if (isUuid) {
            const { data: dRec } = await supabase.from('deals').select('*').eq('id', targetDealId).maybeSingle();
            if (dRec) {
              if (!targetCreatorId && dRec.creator_id) targetCreatorId = dRec.creator_id;
              if (!targetBrandId && (dRec.brand_id || dRec.brand_user_id)) targetBrandId = dRec.brand_id || dRec.brand_user_id;
              if (!netPayout) {
                const gross = Number(dRec.agreed_amount || dRec.gross_amount) || 0;
                const feeCalc = await feeAtPaymentTime(supabase, { dealId: dRec.id }, gross, calculatePlatformFee); // session 36: stamped fee
                netPayout = feeCalc.creatorNet;
              }
            }
          }
          if (!targetCreatorId || !netPayout) {
            const { data: uRec } = await supabase.from('ugc_orders').select('*').eq('id', targetDealId).maybeSingle();
            if (uRec) {
              if (!targetCreatorId && uRec.creator_id) targetCreatorId = uRec.creator_id;
              if (!targetBrandId && uRec.brand_id) targetBrandId = uRec.brand_id;
              if (!netPayout) {
                const gross = Number(uRec.creator_payout || uRec.escrow_amount || uRec.agreed_amount || uRec.budget) || 0;
                const feeCalc = await feeAtPaymentTime(supabase, { ugcOrderId: uRec.id, briefId: uRec.brief_id }, gross, calculatePlatformFee); // session 36: stamped fee
                netPayout = feeCalc.creatorNet;
              }
            }
          }
        }

        // Update transactions table (only with columns that exist in the database)
        let updateTxnQuery = (privilegedSupabase || supabase).from('transactions').update({
          payout_status: 'PAID',
          status: 'SUCCESS',
          payout_reference: cleanUtr,
          payout_completed_at: nowIso,
          payout_completed_by: user?.user_id || user?.id || null,
          admin_action_note: cleanReason,
          admin_action_by: user?.user_id || user?.id || null
        });

        // Session 56: save only if the row is still exactly as we checked it (compare-and-set), so two
        // admins / a double tap can't both record a payout; the second one gets "already paid".
        updateTxnQuery = updateTxnQuery.eq('id', matchedTx.id);
        updateTxnQuery = matchedTx.payout_status == null ? updateTxnQuery.is('payout_status', null) : updateTxnQuery.eq('payout_status', matchedTx.payout_status);
        updateTxnQuery = matchedTx.refund_status == null ? updateTxnQuery.is('refund_status', null) : updateTxnQuery.eq('refund_status', matchedTx.refund_status);
        updateTxnQuery = updateTxnQuery.eq('status', matchedTx.status);

        const { data: savedRows, error: txnUpdateErr } = await (updateTxnQuery as any).select('id');
        if (txnUpdateErr) {
          console.error("[Admin Release Payout] Transaction update error:", txnUpdateErr);
          return res.status(502).json({ error: "Couldn't save the payout. Nothing was marked paid — try again." });
        }
        if (!savedRows || savedRows.length === 0) {
          return res.status(409).json({ error: "This payment changed while you were saving (another admin may have just recorded it). Refresh and check.", code: "TX_CHANGED" }); // Session 58: not "ALREADY_PAID" — nothing was paid; the phone screen moved it to Transferred
        }

        // Update deals table (if applicable)
        if (isUuid) {
          try {
            await (privilegedSupabase || supabase).from('deals').update({
              escrow_hold: false,
              updated_at: nowIso
            }).eq('id', targetDealId);
          } catch (e) {
            console.warn("[Admin Release Payout] deals update warning:", e);
          }
        }

        // Update ugc_orders table (if applicable)
        await (privilegedSupabase || supabase).from('ugc_orders').update({
          payout_status: 'PAID',
          // Session 56: 'PAID' is not an allowed payment_status (live CHECK) — the whole update failed.
          payment_status: 'RELEASED',
          escrow_hold: false,
          utr_number: cleanUtr,
          updated_at: nowIso
        }).or(`id.eq.${targetDealId},deal_id.eq.${targetDealId}`);

        // Update payout_requests table
        try {
          await (privilegedSupabase || supabase).from('payout_requests').update({
            status: 'PAID',
            utr_number: cleanUtr,
            updated_at: nowIso
          }).or(`deal_id.eq.${targetDealId},id.eq.${targetDealId}`);
        } catch (prErr: any) { logIgnored("payment_routes:821", prErr); }

        // Send notification to Creator
        if (targetCreatorId) {
          try {
            await sendNotification(
              null,
              targetCreatorId,
              "payout_released",
              `🎉 Payout of ₹${netPayout > 0 ? netPayout.toLocaleString('en-IN') : 'funds'} has been disbursed to your bank account! UTR / Reference: ${cleanUtr}`
            );
          } catch (notifErr: any) { logIgnored("payment_routes:832", notifErr); }
        }

        // Add system chat message to thread & emit socket.io update
        try {
          const targetThreads: any[] = [];
          if (supabase) {
            try {
              const { data: threads } = await (privilegedSupabase || supabase)
                .from('chat_threads')
                .select('id, brand_id, creator_id, deal_id')
                .or(`id.eq.${targetDealId},deal_id.eq.${targetDealId},ugc_order_id.eq.${targetDealId}`)
                .limit(10);
              if (threads && threads.length > 0) {
                targetThreads.push(...threads);
              }
            } catch (thrErr: any) { logIgnored("payment_routes:848", thrErr); }
          }

          const localDb = getDb();
          const matchedLocal = (localDb.chat_threads || []).filter((t: any) =>
            t.id === targetDealId ||
            t.deal_id === targetDealId ||
            t.ugc_order_id === targetDealId ||
            (targetCreatorId && t.creator_id === targetCreatorId && targetBrandId && t.brand_id === targetBrandId)
          );
          for (const ml of matchedLocal) {
            if (!targetThreads.some(tt => tt.id === ml.id)) {
              targetThreads.push(ml);
            }
          }

          if (targetThreads.length > 0) {
            for (const thr of targetThreads) {
              // Session 58 (Ravi): this card is seen by the brand too — it shows the deal's TOTAL, not the creator's amount
              // after the Ybex fee (the creator's own card / notification still show what they received).
              const dealTotal = Number(matchedTx?.gross_amount) > 0 ? Number(matchedTx.gross_amount) : 0;
              const sysMsg = `💸 Payout Disbursed! Admin has released the payment${dealTotal > 0 ? ` for this ₹${dealTotal.toLocaleString('en-IN')} deal` : ''} to the creator's bank account. UTR / Ref: ${cleanUtr}`;

              // IMPORTANT: message_type must be exactly 'payout_released'
              const msgRecord = {
                message_id: crypto.randomUUID(),
                thread_id: thr.id,
                sender_user_id: user?.user_id || 'system',
                sender_role: 'system',
                text: sysMsg,
                content: sysMsg,
                message_type: 'payout_released',
                metadata: {
                  action: 'PAYOUT_RELEASED',
                  utr_number: cleanUtr,
                  payout_status: 'PAID',
                  creator_net_amount: netPayout,
                  net_amount: netPayout,
                  gross_amount: dealTotal || undefined,
                  disbursed_at: nowIso
                },
                created_at: nowIso
              };

              if (supabase) {
                try {
                  await insertChatMessageToSupabase(msgRecord);
                } catch (insErr: any) { logIgnored("payment_routes:891", insErr); }
              }

              if (!localDb.chat_messages) localDb.chat_messages = [];
              localDb.chat_messages.push(msgRecord);

              const io = req.app.get("io");
              if (io) {
                io.to(thr.id).emit("new_message", msgRecord);
                emitThreadEvent(io, "thread_updated", {
                  id: thr.id,
                  threadId: thr.id,
                  payout_status: "PAID",
                  utr_number: cleanUtr,
                  lastMessage: msgRecord
                });
              }
            }
            saveDb(localDb);
          }
        } catch (chatErr) {
          console.warn("[Admin Release Payout] Chat sync warning:", chatErr);
        }

        // Broadcast admin escrow event
        const io = req.app.get("io");
        if (io) {
          emitThreadEvent(io, "payout_released", {
            deal_id: targetDealId,
            transaction_id: transaction_id || matchedTx?.id,
            utr_number: cleanUtr,
            creator_id: targetCreatorId,
            gross_amount: Number(matchedTx?.gross_amount) || undefined // Session 58: the brand gets this event too — total only
          });
        }

        return res.json({
          success: true,
          message: `Payout of ₹${netPayout.toLocaleString('en-IN')} released successfully! UTR: ${cleanUtr}`,
          utr_number: cleanUtr,
          deal_id: targetDealId,
          payout_status: 'RELEASED'
        });
      } catch (err: any) {
        console.error("[Admin Release Payout] Error:", err);
        return res.status(500).json({ error: err.message || "Failed to release payout." });
      }
    }

    // Memory DB Fallback
    const db = getDb();
    if (db) {
      if (db.transactions) {
        const tx = db.transactions.find((t: any) =>
          t.id === transaction_id || t.deal_id === targetDealId || t.ugc_order_id === targetDealId || t.id === targetDealId
        );
        if (tx) {
          tx.payout_status = "RELEASED";
          tx.status = "SUCCESS";
          tx.escrow_hold = false;
          tx.utr_number = cleanUtr;
          tx.payout_reference = cleanUtr;
          tx.payout_date = nowIso;
          tx.payout_notes = cleanReason;
          if (!targetCreatorId && tx.creator_id) targetCreatorId = tx.creator_id;
          if (!netPayout && tx.creator_net_amount) netPayout = tx.creator_net_amount;
        }
      }
      if (db.deals) {
        const d = db.deals.find((x: any) => x.id === targetDealId);
        if (d) {
          d.payout_status = "PAID";
          d.payment_status = "PAID";
          d.escrow_hold = false;
          d.utr_number = cleanUtr;
        }
      }
      if (db.ugc_orders) {
        const uo = db.ugc_orders.find((x: any) => x.id === targetDealId || x.deal_id === targetDealId);
        if (uo) {
          uo.payout_status = "PAID";
          uo.payment_status = "PAID";
          uo.escrow_hold = false;
          uo.utr_number = cleanUtr;
        }
      }
      saveDb(db);
    }

    const io = req.app.get("io");
    if (io) {
      emitThreadEvent(io, "payout_released", {
        deal_id: targetDealId,
        transaction_id,
        utr_number: cleanUtr,
        creator_id: targetCreatorId,
        creator_net_amount: netPayout
      });
    }

    return res.json({
      success: true,
      message: `Payout of ₹${netPayout.toLocaleString('en-IN')} released successfully! UTR: ${cleanUtr}`,
      utr_number: cleanUtr,
      deal_id: targetDealId,
      payout_status: 'RELEASED'
    });
  });


  // v364: Review & pay — the brand sees exactly what create-order will charge. Body: { deal_id | thread_id | gross_amount
  // (UGC brief: budget × creators), coupon_code }. Campaign deals read the amount from the deal, never the browser.
  router.post("/payments/quote", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required" });
    let gross = Number(req.body?.gross_amount ?? req.body?.amount ?? 0) || 0;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let candidate = String(req.body?.deal_id || req.body?.thread_id || "");
    if (candidate.startsWith("thread_camp_")) candidate = candidate.replace("thread_camp_", "");
    const client = privilegedSupabase || supabase;
    try {
      if (client && candidate && !UUID_RE.test(candidate) && req.body?.thread_id) {
        const { data: thr } = await client.from('chat_threads').select('deal_id').eq('id', req.body.thread_id).maybeSingle();
        if (thr?.deal_id && UUID_RE.test(thr.deal_id)) candidate = thr.deal_id;
      }
      if (client && UUID_RE.test(candidate)) {
        const { data: d } = await client.from('deals').select('agreed_amount, brand_id, creator_id').eq('id', candidate).maybeSingle();
        // v396 (QA S-8, Ravi OK 2 Nov): only the deal's own brand / creator (or admin) may see its amount
        const me = [String(user?.parent_brand_id || ""), String(user?.user_id || "")].filter(Boolean);
        const staff = user?.role === 'admin' || user?.team_role === 'sub_admin';
        if (d && !staff && !me.includes(String(d.brand_id || "")) && !me.includes(String(d.creator_id || ""))) {
          return res.status(403).json({ error: "NOT_YOUR_DEAL", detail: "This deal belongs to another account." });
        }
        if (Number(d?.agreed_amount) > 0) gross = Number(d.agreed_amount);
      }
    } catch (e: any) { logIgnored("payment_routes:quote-deal", e); }
    if (!(gross > 0)) return res.status(400).json({ error: "AMOUNT_MISSING", detail: "The amount to pay isn't set yet." });
    const quote = await quoteBrandPayment(client, gross, { brandId: String(user?.parent_brand_id || user?.user_id || ""), couponCode: req.body?.coupon_code });
    if (await isInhouseBrand(String(user?.parent_brand_id || user?.user_id || ""))) return res.json({ ok: true, inhouse: true, quote: { ...quote, brandFeeBasePercent: 0, brandFeePercent: 0, brandFee: 0, brandFeeGst: 0, total: 0, couponCode: null, couponDiscount: 0, inhouse: true } }); // v419: funded by Ybex
    return res.json({ ok: true, quote });
  });

  router.post("/payments/razorpay/create-order", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required", detail: "Please sign in to proceed with payment." });
    }

    const { deal_id, thread_id, campaign_id, brief_id, creator_id, gross_amount, amount } = req.body;

    // Session 58 (payment audit): no amount → no order. It used to fall back to a made-up ₹1,000.
    let verifiedGrossAmount = Number(gross_amount ?? amount ?? 0);
    if (!verifiedGrossAmount || isNaN(verifiedGrossAmount) || verifiedGrossAmount <= 0) {
      verifiedGrossAmount = 0;
    }

    // CAMPAIGN escrow: the amount comes from the deal, not from the browser. The order used to
    // be created for whatever the client sent, and the escrow was then recorded at the deal's
    // full agreed amount — so paying ₹1 recorded ₹20,000 as held. The order is also tagged with
    // its deal so a paid order cannot be presented later as payment for a different deal.
    let campaignOrderDealId: string | null = null;
    let campaignDealStatus = ""; // v414: closed deals can't be paid
    {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let candidate = String(deal_id || thread_id || "");
      if (candidate.startsWith("thread_camp_")) candidate = candidate.replace("thread_camp_", "");
      const client = privilegedSupabase || supabase;
      if (client && candidate && !candidate.startsWith("ugcord_") && !candidate.startsWith("thread_ugc_")) {
        try {
          if (!UUID_RE.test(candidate) && thread_id) {
            const { data: thr } = await client.from('chat_threads').select('deal_id').eq('id', thread_id).maybeSingle();
            if (thr?.deal_id && UUID_RE.test(thr.deal_id)) candidate = thr.deal_id;
          }
          if (UUID_RE.test(candidate)) {
            const { data: dealRec } = await client.from('deals').select('id, agreed_amount, status, brand_id').eq('id', candidate).maybeSingle(); // v414: + status; v423: + brand_id
            const dealAmt = Number(dealRec?.agreed_amount);
            // v423 (P13): only the deal's own brand (or its team / an admin) may open a payment for it — same rule as UGC orders and /payments/quote.
            const myBrandIds = [user?.parent_brand_id, user?.user_id].filter(Boolean).map(String); // team / collab-request deals carry either id
            if (dealRec?.brand_id && !myBrandIds.includes(String(dealRec.brand_id)) && String(user?.role || "").toLowerCase() !== 'admin') {
              return res.status(403).json({ error: "NOT_YOUR_DEAL", code: "NOT_YOUR_DEAL", detail: "This deal belongs to another brand." });
            }
            if (dealRec && dealAmt > 0) {
              campaignOrderDealId = dealRec.id;
              verifiedGrossAmount = dealAmt;
              campaignDealStatus = String(dealRec.status || "").toUpperCase(); // v414
            }
          }
        } catch (e: any) {
          console.warn("[Razorpay Create Order] campaign deal amount lookup failed:", e?.message || e);
        }
      }
    }

    // v366 (Ravi: "instant UGC orders ka amount browser se aata hai — fix karo"): an instant UGC order (ugcord_…, or its
    // chat thread thread_ugc_<orderId>) is charged what the ORDER says on the server (same rule persistEscrowPayment
    // uses: creator_payout → escrow_amount → agreed_amount), never the browser's number. The order must belong to this
    // brand and must not be paid already. The order id goes on the Razorpay notes so the payment can't be reused.
    let ugcOrderForPay: string | null = null;
    if (!campaignOrderDealId) {
      const client = privilegedSupabase || supabase;
      const raw = String(deal_id || thread_id || "");
      const orderId = raw.startsWith("ugcord_") ? raw : raw.startsWith("thread_ugc_") ? raw.replace(/^thread_ugc_/, "") : "";
      if (client && orderId) {
        try {
          const { data: uo } = await client.from('ugc_orders').select('id, brand_id, creator_payout, escrow_amount, agreed_amount, escrow_hold, payment_status').eq('id', orderId).maybeSingle();
          if (uo) {
            const actingBrand = String(user?.parent_brand_id || user?.user_id || "");
            if (uo.brand_id && String(uo.brand_id) !== actingBrand && user?.role !== 'admin') {
              return res.status(403).json({ error: "NOT_YOUR_ORDER", code: "NOT_YOUR_ORDER", detail: "This order belongs to another brand." });
            }
            if (uo.escrow_hold || /^(paid|held|escrow_held|success)$/i.test(String(uo.payment_status || ""))) {
              return res.status(409).json({ error: "ALREADY_PAID", code: "ALREADY_PAID", paid: true, detail: "This order is already paid — the money is held safely." });
            }
            const orderAmt = Number(uo.creator_payout || uo.escrow_amount || uo.agreed_amount) || 0;
            if (!(orderAmt > 0)) return res.status(400).json({ error: "AMOUNT_MISSING", code: "AMOUNT_MISSING", detail: "This order has no amount yet, so payment can't start." });
            verifiedGrossAmount = Math.round(orderAmt);
            ugcOrderForPay = String(uo.id);
          }
        } catch (e: any) {
          console.warn("[Razorpay Create Order] UGC order amount lookup failed:", e?.message || e);
          return res.status(503).json({ error: "ORDER_LOOKUP_FAILED", code: "ORDER_LOOKUP_FAILED", detail: "Couldn't check this order right now. Please try again in a moment." });
        }
      }
    }

    if (!(verifiedGrossAmount > 0)) {
      return res.status(400).json({ error: "AMOUNT_MISSING", code: "AMOUNT_MISSING", detail: "The amount to pay isn't set yet, so payment can't start." });
    }

    // WHEN: the escrow is paid only after BOTH sides signed (Ravi's flow: amount agreed →
    // agreement → both sign → payment). A deal could be funded with the contract unsigned, and
    // the creator then had money in escrow for terms they never accepted.
    if (campaignOrderDealId) {
      const client = privilegedSupabase || supabase;
      let thr: any = (getDb().chat_threads || []).find((t: any) => t.deal_id === campaignOrderDealId || t.id === `thread_camp_${campaignOrderDealId}`);
      if (client) {
        try {
          const { data } = await client
            .from('chat_threads')
            .select('agreement_signed_creator, agreement_signed_brand, status, flow_state') // v414: + status/flow_state
            .eq('deal_id', campaignOrderDealId)
            .limit(1);
          if (data && data[0]) thr = data[0];
        } catch (e: any) {
          console.warn("[Razorpay Create Order] signature lookup failed:", e?.message || e);
        }
      }
      // v414: a cancelled / refunded / completed deal can't be paid (paying it used to bring it back to life).
      const thrClosed = String(thr?.status || "").toUpperCase() === 'CANCELLED' || ['CANCELLED', 'REFUNDED', 'COMPLETED'].includes(String(thr?.flow_state || "").toUpperCase());
      if (['CANCELLED', 'REFUNDED', 'COMPLETED'].includes(campaignDealStatus) || thrClosed) {
        return res.status(409).json({ error: "DEAL_CLOSED", code: "DEAL_CLOSED", detail: "This deal is closed (cancelled, refunded or completed), so it can't be paid." });
      }
      if (thr && !(thr.agreement_signed_creator && thr.agreement_signed_brand)) {
        const waitingFor = !thr.agreement_signed_brand && !thr.agreement_signed_creator ? "both parties" : !thr.agreement_signed_brand ? "the brand" : "the creator";
        return res.status(409).json({
          error: "CONTRACT_NOT_SIGNED",
          code: "CONTRACT_NOT_SIGNED",
          detail: `Both sides need to sign the agreement before you pay — waiting for ${waitingFor}.` // v423 (P16)
        });
      }
    }

    // v364 (Ravi: "brand fee 8% deal amount ke upar brand ke bill mein judegi; coupon se 4%"): the brand pays the deal
    // amount + the brand fee (split model). The quote is computed here on the server (coupon checked here too) and
    // written on the Razorpay order notes, so the payment check and the stamp later use the same numbers.
    const quote = await quoteBrandPayment(privilegedSupabase || supabase, verifiedGrossAmount, { brandId: String(user?.parent_brand_id || user?.user_id || ""), couponCode: req.body?.coupon_code });
    if (req.body?.coupon_code && quote.couponError) {
      return res.status(400).json({ error: "COUPON_INVALID", code: "COUPON_INVALID", detail: quote.couponError, quote });
    }
    const payableAmount = Math.max(verifiedGrossAmount, Math.round(quote.total || verifiedGrossAmount));

    // v419 (Ravi): a Ybex in-house brand doesn't pay — the deal is recorded as funded by Ybex right here (no Razorpay,
    // brand charged ₹0, no brand fee), the creator sees it funded like any deal, and Ybex pays the creator from Payouts.
    if ((campaignOrderDealId || ugcOrderForPay) && (await isInhouseBrand(String(user?.parent_brand_id || user?.user_id || "")))) {
      // v419 (security layer): the PIN the admin set when marking this brand. Without it nothing is recorded.
      const pinState = await checkInhousePin(String(user?.parent_brand_id || user?.user_id || ""), req.body?.inhouse_pin);
      if (pinState !== "ok") {
        const msg = { missing: "Enter the in-house pay PIN.", wrong: "Wrong in-house pay PIN.", locked: "Too many wrong PINs. Try again in 15 minutes.", not_set: "No pay PIN is set for this brand. Ask an admin to mark it again with a PIN." }[pinState];
        return res.status(pinState === "locked" ? 429 : 403).json({ error: "INHOUSE_PIN", code: pinState === "missing" ? "INHOUSE_PIN_REQUIRED" : "INHOUSE_PIN_" + pinState.toUpperCase(), detail: msg });
      }
      const inhouseOrderId = `order_inhouse_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
      const inhousePaymentId = `pay_inhouse_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const zeroQuote: any = { ...quote, gross: verifiedGrossAmount, brandFeeBasePercent: 0, brandFeePercent: 0, brandFee: 0, brandFeeGst: 0, total: 0, couponCode: null, couponId: null, couponDiscount: 0, inhouse: true };
      await ephemeralSet(orderQuoteKey(inhouseOrderId), { ...quoteNotes(zeroQuote), ...(ugcOrderForPay ? { ugc_order_id: ugcOrderForPay } : {}), inhouse: "1" }, ORDER_QUOTE_TTL_MS).catch((e: any) => logIgnored("payment_routes:inhouse-quote", e));
      const result = await persistEscrowPayment({ razorpay_order_id: inhouseOrderId, razorpay_payment_id: inhousePaymentId, deal_id: campaignOrderDealId || ugcOrderForPay || deal_id, thread_id, user, req });
      if (result.amountMismatch) return res.status(400).json({ error: "INHOUSE_FAILED", code: "INHOUSE_FAILED", detail: result.amountMismatch });
      console.log(`[payments] in-house deal funded by Ybex: ${campaignOrderDealId || ugcOrderForPay} ₹${result.safeGross}`);
      return res.json({ success: true, inhouse: true, verified: true, order_id: inhouseOrderId, payment_id: inhousePaymentId, deal_id: deal_id || null, thread_id: thread_id || null, gross_amount: result.safeGross, quote: zeroQuote, state_sync_failed: Boolean(result.dealUpdateError || result.threadUpdateError) });
    }

    let rzp: Razorpay | null = null;
    try {
      rzp = getRazorpay();
    } catch (err: any) {
      console.warn("[Razorpay Create Order] Razorpay config notice:", err.message);
    }

    // Session 56 (payment audit, Ravi OK): ONE payment per deal.
    //  1. A deal whose payment is already held cannot be paid again (a second tap, a second phone,
    //     or the Pay button coming back after the app was closed during a UPI switch).
    //  2. The last order made for this deal is remembered for 30 min. If Razorpay says it was
    //     paid (verify never reached us), it is recorded now instead of charging again; if it is
    //     still open, the SAME order is handed back, so Razorpay itself refuses a second payment.
    if (campaignOrderDealId) {
      const client = privilegedSupabase || supabase;
      if (client) {
        try {
          const { data: held } = await client.from('deals').select('escrow_hold').eq('id', campaignOrderDealId).maybeSingle();
          // A payment row for this deal also counts (after the payout escrow_hold goes back to false).
          const { data: paidRows } = await client.from('transactions').select('id').eq('deal_id', campaignOrderDealId).limit(1);
          if (held?.escrow_hold || (Array.isArray(paidRows) && paidRows.length > 0)) {
            return res.status(409).json({ error: "ALREADY_PAID", code: "ALREADY_PAID", paid: true, detail: "This deal is already paid — the money is held safely." });
          }
        } catch (e: any) { logIgnored("payment_routes:create-order-held", e); }
      }
      const pending = await ephemeralGet(pendingOrderKey(campaignOrderDealId)).catch(() => null);
      if (rzp && pending?.order_id) {
        try {
          const prev: any = await rzp.orders.fetch(pending.order_id);
          const prevStatus = String(prev?.status || "").toLowerCase();
          if (prevStatus === "paid") {
            // v423 (P6): the captured payment's id — never the order id; can't tell → the brand is asked to wait, not to pay again
            const paymentId = await capturedPaymentIdFor(pending.order_id).catch(() => null);
            if (!paymentId) return res.status(409).json({ error: "PAYMENT_CONFIRMING", code: "PAYMENT_CONFIRMING", detail: "Your earlier payment is still being confirmed. Please check again in a few minutes — don't pay again." });
            const result = await persistEscrowPayment({ razorpay_order_id: pending.order_id, razorpay_payment_id: paymentId, deal_id: campaignOrderDealId, thread_id: thread_id || null, user, req });
            if (!result.amountMismatch) {
              return res.status(409).json({ error: "ALREADY_PAID", code: "ALREADY_PAID", paid: true, order_id: pending.order_id, detail: "Your earlier payment went through — it is now recorded. You were not charged again." });
            }
          } else if (Number(prev?.amount) === Math.round(payableAmount * 100) && prevStatus !== "paid" && String(prev?.notes?.coupon_code || "") === String(quote.couponCode || "")) { // v364: same total + same coupon
            return res.json({
              success: true,
              key_id: process.env.RAZORPAY_KEY_ID,
              order_id: prev.id,
              amount: prev.amount,
              currency: prev.currency,
              transaction_id: crypto.randomUUID(),
              is_test_mode: getIsTestMode(),
              reused_order: true,
              quote, // v364
              user_name: user.name || "",
              user_email: user.email || "",
              user_phone: user.phone || ""
            });
          }
        } catch (e: any) { logIgnored("payment_routes:create-order-pending", e); }
      }
    }

    // v366: after the order exists — remember its quote (test-mode orders have no Razorpay notes) and hold the coupon for
    // it atomically (claim_coupon in the database: two brands paying at the same moment can't both take the last use).
    const afterOrderCreated = async (orderId: string): Promise<string | null> => {
      await ephemeralSet(orderQuoteKey(orderId), { ...quoteNotes(quote), ...(ugcOrderForPay ? { ugc_order_id: ugcOrderForPay } : {}) }, ORDER_QUOTE_TTL_MS).catch((e: any) => logIgnored("payment_routes:order-quote-save", e));
      if (quote.couponId) {
        const claim = await claimBrandCoupon(privilegedSupabase || supabase, { couponId: quote.couponId, brandId: String(user?.parent_brand_id || user?.user_id || ""), orderId, discount: quote.couponDiscount });
        if (!claim.ok) return claim.reason || "This coupon can't be used right now.";
      }
      return null;
    };

    let order: any = null;
    if (rzp) {
      try {
        const options: any = {
          amount: Math.round(payableAmount * 100), // v364: deal amount + brand fee (split model)
          currency: "INR",
          receipt: `rcpt_${Date.now()}`
        };
        if (campaignOrderDealId) {
          options.notes = { deal_id: campaignOrderDealId, kind: "campaign_escrow" };
        } else if (ugcOrderForPay) {
          options.notes = { ugc_order_id: ugcOrderForPay, kind: "ugc_order" }; // v366
        } else if (!deal_id && !thread_id) {
          // Session 58: a UGC brief payment — tagged so the webhook can spot a paid brief that was never created
          // (app closed during the UPI switch → money taken, nothing on the server).
          options.notes = { kind: "ugc_brief", brand_id: String(user?.user_id || "").slice(0, 60) };
        }
        options.notes = { ...(options.notes || {}), ...quoteNotes(quote) }; // v364
        order = await rzp.orders.create(options);
        if (order?.id) {
          const couponProblem = await afterOrderCreated(order.id); // v366
          if (couponProblem) return res.status(400).json({ error: "COUPON_INVALID", code: "COUPON_INVALID", detail: couponProblem, quote });
        }
        if (order?.id && campaignOrderDealId) {
          await ephemeralSet(pendingOrderKey(campaignOrderDealId), { order_id: order.id }, PENDING_ORDER_TTL_MS).catch((e: any) => logIgnored("payment_routes:pending-order-save", e));
        }
        // v423 (P8): a UGC brief order is also remembered on the SERVER for this brand (3 days), so a brief paid on the
        // phone can be finished from the laptop (GET /payments/brief-paid-orders) instead of opening a second checkout.
        if (order?.id && options.notes?.kind === "ugc_brief") {
          const ownerId = String(user?.parent_brand_id || user?.user_id || "");
          await ephemeralSet(`briefpay:${ownerId}:${order.id}`, { order_id: order.id, amount: verifiedGrossAmount, at: Date.now() }, 3 * 24 * 3600 * 1000).catch((e: any) => logIgnored("payment_routes:briefpay-save", e));
        }
      } catch (err: any) {
        console.warn("[Razorpay Create Order] Razorpay API call failed:", err.message);
      }
    }

    if (!order) {
      if (getIsTestMode()) {
        const simulatedOrderId = `order_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const couponProblem = await afterOrderCreated(simulatedOrderId); // v366: test orders are stamped + counted like real ones
        if (couponProblem) return res.status(400).json({ error: "COUPON_INVALID", code: "COUPON_INVALID", detail: couponProblem, quote });
        const transactionId = crypto.randomUUID();
        return res.json({
          success: true,
          key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder",
          order_id: simulatedOrderId,
          amount: Math.round(payableAmount * 100),
          quote, // v364
          currency: "INR",
          transaction_id: transactionId,
          is_test_mode: true,
          user_name: user.name || "",
          user_email: user.email || "",
          user_phone: user.phone || ""
        });
      }
      return res.status(500).json({ error: "Failed to create Razorpay order." });
    }

    const transactionId = crypto.randomUUID();
    return res.json({
      success: true,
      key_id: process.env.RAZORPAY_KEY_ID,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      quote, // v364: what the brand sees in Review & pay
      transaction_id: transactionId,
      is_test_mode: getIsTestMode(),
      user_name: user.name || "",
      user_email: user.email || "",
      user_phone: user.phone || ""
    });
  });

  // v389 (QA, Ravi OK 30 Oct): "ek hi Razorpay payment do baar record ho sakta hai" — verify, the status poll and the webhook all arrive within a
  // second, each read "not recorded yet" and each inserted a row (two SUCCESS rows, two "Payment Secured" cards). Calls for the SAME order id now
  // run one after the other inside this server copy (the second one finds the first row and stops), and a final check after the insert removes
  // this call's own row when another server copy got there first. (A database unique index on the order id is listed in PENDING_DB_CHANGES.md.)
  /** v423 (P6): the id of the CAPTURED payment on a Razorpay order (an order can have failed attempts first), or null.
   *  `claimed` (a pay_… id the browser sent) is accepted only when it is one of this order's captured payments. */
  async function capturedPaymentIdFor(orderId: string, claimed?: string | null): Promise<string | null> {
    const rzp: any = getRazorpay();
    if (!rzp || !orderId) return null;
    const pays: any = await rzp.orders.fetchPayments(orderId);
    const items: any[] = Array.isArray(pays?.items) ? pays.items : [];
    const captured = items.filter((p: any) => p && String(p.status || "").toLowerCase() === "captured" && typeof p.id === "string");
    if (claimed) { const hit = captured.find((p: any) => p.id === claimed); if (hit) return hit.id; }
    return captured[0]?.id || null;
  }

  const escrowLocks = new Map<string, Promise<unknown>>();
  async function persistEscrowPayment(args: Parameters<typeof persistEscrowPaymentInner>[0]): Promise<Awaited<ReturnType<typeof persistEscrowPaymentInner>>> {
    const key = String(args.razorpay_order_id || "");
    if (!key) return persistEscrowPaymentInner(args);
    const prev = escrowLocks.get(key) || Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const mine = prev.then(() => gate);
    escrowLocks.set(key, mine);
    try {
      await prev.catch(() => {});
      return await persistEscrowPaymentInner(args);
    } finally {
      release();
      if (escrowLocks.get(key) === mine) escrowLocks.delete(key);
    }
  }

  async function persistEscrowPaymentInner({
    razorpay_order_id,
    razorpay_payment_id,
    deal_id,
    thread_id,
    user,
    req,
  }: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    deal_id?: string | null;
    thread_id?: string | null;
    user?: any;
    req: express.Request;
  }): Promise<{ safeGross: number; dealUpdateError: string | null; threadUpdateError: string | null; alreadyProcessed: boolean; amountMismatch?: string | null; unconfirmed?: boolean; duplicatePayment?: boolean; dealClosed?: string | null }> {
    let dealUpdateError: string | null = null;
    let threadUpdateError: string | null = null;
    let dealClosedAfterPay: string | null = null; // v414: set when the money arrived after the deal was closed
    let isAlreadyProcessed = false;  // FIX #5: Track this early for socket event logic

    if (supabase && razorpay_order_id) {
      try {
        // The Razorpay order id is stored in transactions.zaakpay_order_id (old column name, kept). This check stops the
        // same order being recorded twice.
        const { data: existingTxn } = await supabase
          .from('transactions')
          .select('gross_amount, id')
          .eq('zaakpay_order_id', razorpay_order_id)
          .maybeSingle();
        if (existingTxn) {
          console.log(`[persistEscrowPayment] Payment already processed (idempotency hit). Transaction ID: ${existingTxn.id}, Gross: ₹${existingTxn.gross_amount}`);
          isAlreadyProcessed = true;  // FIX #5: Mark as duplicate
          return { safeGross: Number(existingTxn.gross_amount) || 0, dealUpdateError: null, threadUpdateError: null, alreadyProcessed: true };
        }
      } catch (e) {
        console.warn("[persistEscrowPayment] Idempotency check failed, proceeding anyway:", e);
      }
    }

    let grossAmount = 0;
    let targetCreatorId: string | null = null;
    let targetBrandId: string | null = user?.user_id || null;
    let campaignDealUuid: string | null = null;

    if (supabase) {
      try {
        let checkDealId = deal_id || thread_id;
        if (checkDealId && checkDealId.startsWith("thread_camp_")) {
          checkDealId = checkDealId.replace("thread_camp_", "");
        }
        if (checkDealId) {
          if (checkDealId.startsWith("ugcord_")) {
            const { data: uOrder } = await supabase.from('ugc_orders').select('*').eq('id', checkDealId).maybeSingle();
            if (uOrder) {
              grossAmount = Number(uOrder.creator_payout || uOrder.escrow_amount || uOrder.agreed_amount || uOrder.budget) || 0;
              if (uOrder.creator_id) targetCreatorId = uOrder.creator_id;
              if (uOrder.brand_id) targetBrandId = uOrder.brand_id;
            }
          } else {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(checkDealId);
            if (isUuid) {
              const { data: dealRec } = await supabase.from('deals').select('*').eq('id', checkDealId).maybeSingle();
              if (dealRec) {
                grossAmount = Number(dealRec.agreed_amount || dealRec.amount_fixed || dealRec.budget || dealRec.gross_amount) || 0;
                if (grossAmount > 0) campaignDealUuid = dealRec.id;
                if (dealRec.creator_id) targetCreatorId = dealRec.creator_id;
                if (dealRec.brand_id || dealRec.brand_user_id) targetBrandId = dealRec.brand_id || dealRec.brand_user_id;
              }
            }
            if (!grossAmount) {
              const { data: uOrder } = await supabase.from('ugc_orders').select('*').eq('id', checkDealId).maybeSingle();
              if (uOrder) {
                grossAmount = Number(uOrder.creator_payout || uOrder.escrow_amount || uOrder.agreed_amount || uOrder.budget) || 0;
                if (uOrder.creator_id) targetCreatorId = uOrder.creator_id;
                if (uOrder.brand_id) targetBrandId = uOrder.brand_id;
              }
            }
          }
        }
        if (thread_id && (!grossAmount || grossAmount <= 0)) {
          const { data: threadRec } = await supabase.from('chat_threads').select('*').eq('id', thread_id).maybeSingle();
          if (threadRec) {
            const parsed = parseThreadState(threadRec);
            grossAmount = Number(threadRec.agreed_amount || threadRec.amount_fixed || parsed.amount_fixed) || 0;
            if (threadRec.creator_id) targetCreatorId = threadRec.creator_id;
            if (threadRec.brand_id) targetBrandId = threadRec.brand_id;
          }
        }
      } catch (e) {
        console.warn("[persistEscrowPayment] DB lookup error:", e);
      }
    }

    // v364: the order's notes say what the brand was charged (deal amount + brand fee + coupon). Orders made before
    // v364 have none → checked and recorded at the deal amount exactly as before.
    let orderQuote: ReturnType<typeof quoteFromNotes> = null;
    let orderPaidRupees = 0;
    let boundUgcOrder: string | null = null; // v366
    if (!isNoGatewayOrder(razorpay_order_id)) {
      try {
        const o: any = await getRazorpay().orders.fetch(razorpay_order_id);
        orderQuote = quoteFromNotes(o?.notes);
        orderPaidRupees = Number(o?.amount_paid || 0) / 100;
        boundUgcOrder = o?.notes?.ugc_order_id ? String(o.notes.ugc_order_id) : null;
      } catch (e: any) { logIgnored("payment_routes:order-notes", e); }
    } else {
      // v366: test-mode orders have no Razorpay record — the quote create-order remembered is used instead, so the brand
      // fee is stamped and the coupon counted exactly like a real payment.
      try {
        const saved: any = await ephemeralGet(orderQuoteKey(razorpay_order_id));
        orderQuote = quoteFromNotes(saved);
        if (orderQuote) orderPaidRupees = Number(orderQuote.total) || 0;
        boundUgcOrder = saved?.ugc_order_id ? String(saved.ugc_order_id) : null;
      } catch (e: any) { logIgnored("payment_routes:order-quote-read", e); }
    }

    if (!grossAmount || grossAmount <= 0) {
      if (orderQuote?.gross) grossAmount = Math.round(orderQuote.gross); // v364: the order amount includes the brand fee
      else {
      try {
        const rzp = getRazorpay();
        const rzpOrder = await rzp.orders.fetch(razorpay_order_id);
        if (rzpOrder?.amount) {
          grossAmount = Math.round(Number(rzpOrder.amount) / 100);
        }
      } catch (e: any) { logIgnored("payment_routes:1231", e); }
      }
    }
    // v347 (Ravi approved): no amount from the deal / order / thread AND Razorpay couldn't tell us either →
    // the payment is UNCONFIRMED (retryable), never recorded as a ₹1 "funded" hold (safeGross = max(1, 0)).
    // Same shape as the Razorpay-error case below, so /verify, check-status and the webhook (500 retry) handle it.
    // Test mode keeps its old behaviour (simulated orders have no Razorpay record).
    if (!(grossAmount > 0) && !getIsTestMode() && !isNoGatewayOrder(razorpay_order_id)) {
      const mismatch = "The payment amount could not be confirmed. Please retry in a moment.";
      console.error("[persistEscrowPayment] payment hold NOT recorded (amount unknown):", { razorpay_order_id, campaignDealUuid });
      return { safeGross: 0, dealUpdateError: null, threadUpdateError: null, alreadyProcessed: false, amountMismatch: mismatch, unconfirmed: true };
    }

    // CAMPAIGN: the escrow is recorded at the deal's amount, so the money Razorpay actually took
    // must cover it, and the order must belong to this deal. Neither was checked. Fails closed:
    // if the order cannot be confirmed, nothing is marked funded and the client can retry.
    // Session 53 (security): the "paid amount covers it" check now runs for EVERY payment (UGC orders and
    // other threads too), not only campaign deals — a ₹1 order could be recorded as a full payment hold.
    let unconfirmed = false;
    if (grossAmount > 0 && !getIsTestMode() && !isNoGatewayOrder(razorpay_order_id)) {
      let mismatch: string | null = null;
      try {
        const rzpOrder: any = await getRazorpay().orders.fetch(razorpay_order_id);
        // Session 58: only money actually captured counts (an authorised-but-not-captured order passed on `amount`).
        const paidRupees = Number(rzpOrder?.amount_paid || 0) / 100;
        const boundDeal = rzpOrder?.notes?.deal_id;
        const payingUgcOrder = String(deal_id || "").startsWith("ugcord_") ? String(deal_id) : String(thread_id || "").startsWith("thread_ugc_") ? String(thread_id).replace(/^thread_ugc_/, "") : "";
        if (campaignDealUuid && boundDeal && boundDeal !== campaignDealUuid) {
          mismatch = "This payment belongs to a different deal.";
        } else if (boundUgcOrder && payingUgcOrder && boundUgcOrder !== payingUgcOrder) {
          mismatch = "This payment belongs to a different UGC order."; // v366
        } else if (paidRupees + 0.5 < grossAmount) {
          mismatch = `The payment (₹${paidRupees}) does not cover the agreed amount (₹${grossAmount}).`;
        } else if (orderQuote && Math.abs(Number(orderQuote.gross) - grossAmount) <= 0.5 && paidRupees + 0.5 < Number(orderQuote.total)) {
          // v364: the brand fee is part of what the brand owes
          mismatch = `The payment (₹${paidRupees}) does not cover the amount due (₹${orderQuote.total} incl. service fee).`;
        }
      } catch (e: any) {
        mismatch = "The payment amount could not be confirmed with Razorpay. Please retry in a moment.";
        unconfirmed = true; // Session 58: a temporary Razorpay error — the webhook asks Razorpay to retry
      }
      if (mismatch) {
        console.error("[persistEscrowPayment] payment hold NOT recorded:", { razorpay_order_id, campaignDealUuid, grossAmount, mismatch });
        return { safeGross: 0, dealUpdateError: null, threadUpdateError: null, alreadyProcessed: false, amountMismatch: mismatch, unconfirmed };
      }
    }

    const safeGross = Math.max(1, Math.round(grossAmount || 0));
    // Session 36 (Ravi OK): a creator coupon (auto-apply launch offer or saved code) is applied HERE, once,
    // when the brand pays; the result is stamped on the transaction below. Offer mode overrides coupons.
    const fundingCoupon = await resolveCreatorCoupon(privilegedSupabase || supabase, targetCreatorId, safeGross);
    const feeCalc = await calculatePlatformFee(safeGross, supabase || undefined, fundingCoupon || undefined);
    const platformFee = Math.round(feeCalc.platformFee || 0);
    const gstAmount = Math.round(feeCalc.gstAmount || 0);
    const creatorNet = Math.round(feeCalc.creatorNet || (safeGross - platformFee - gstAmount));
    const nowIso = getIsoNow();

    if (supabase) {
      try {
        let validDealId: string | null = null;
        let validUgcOrderId: string | null = null;
        
        const candidateId = deal_id || thread_id;
        if (candidateId) {
          if (candidateId.startsWith("ugcord_")) {
            validUgcOrderId = candidateId;
          } else if (candidateId.startsWith("thread_camp_")) {
            const extracted = candidateId.replace("thread_camp_", "");
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(extracted);
            if (isUuid) {
              validDealId = extracted;
            }
          } else {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateId);
            if (isUuid) {
              const { data: dCheck } = await supabase.from('deals').select('id').eq('id', candidateId).maybeSingle();
              if (dCheck) validDealId = candidateId;
            }
            if (!validDealId) {
              const { data: uCheck } = await supabase.from('ugc_orders').select('id').eq('id', candidateId).maybeSingle();
              if (uCheck) validUgcOrderId = candidateId;
            }
          }
        }

        
        if (!validDealId && !validUgcOrderId && deal_id) {
          let checkFallback = deal_id;
          if (checkFallback.startsWith("thread_camp_")) checkFallback = checkFallback.replace("thread_camp_", "");
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(checkFallback);
          if (isUuid) validDealId = checkFallback;
          else validUgcOrderId = checkFallback;
        }


        const txnId = crypto.randomUUID();
        const hasValidSource = (Boolean(validDealId) !== Boolean(validUgcOrderId));
        

        if (hasValidSource) {
          // Session 58: one deposit per deal / order. A second payment (double tap, phone + laptop, an old checkout
          // reopened) used to be recorded as a SECOND deposit. It is not recorded again; admins are told to refund it.
          {
            let dupQ: any = (privilegedSupabase || supabase).from('transactions').select('id, zaakpay_order_id')
              .in('status', ['SUCCESS', 'ESCROW_HELD', 'PAID', 'CAPTURED']).neq('payout_type', 'refund').limit(1);
            dupQ = validDealId ? dupQ.eq('deal_id', validDealId) : dupQ.eq('ugc_order_id', validUgcOrderId);
            const { data: dupRows } = await dupQ;
            const dup = Array.isArray(dupRows) ? dupRows.find((r: any) => r.zaakpay_order_id !== razorpay_order_id) : null;
            if (dup) {
              console.error("[persistEscrowPayment] SECOND payment for an already-funded deal/order — not recorded:", { razorpay_order_id, razorpay_payment_id, validDealId, validUgcOrderId });
              try {
                const { data: admins } = await (privilegedSupabase || supabase).from('users').select('user_id').eq('role', 'admin');
                for (const a of admins || []) {
                  await sendNotification(getDb(), a.user_id, 'refund_due', `Duplicate payment — refund needed: a brand paid twice for the same ${validDealId ? 'deal ' + validDealId : 'UGC order ' + validUgcOrderId}. Refund Razorpay payment ${razorpay_payment_id || razorpay_order_id} (₹${safeGross}).`);
                }
              } catch { /* the log line above stays */ }
              return { safeGross, dealUpdateError: null, threadUpdateError: null, alreadyProcessed: true, duplicatePayment: true };
            }
          }
          // the Razorpay order id is stored in zaakpay_order_id (old column name, kept); the payment id in razorpay_payment_id
          const { error: insErr } = await (privilegedSupabase || supabase).from('transactions').insert({
            id: txnId,
            deal_id: validDealId || null,
            ugc_order_id: validUgcOrderId || null,
            creator_id: targetCreatorId || null,
            gross_amount: safeGross,
            platform_fee_amount: platformFee,
            creator_net_amount: creatorNet,
            gst_amount: gstAmount,
            // v364: what the brand paid on top (split fee) — only when the order's quote matches this deal amount
            ...(orderQuote && Math.abs(Number(orderQuote.gross) - safeGross) <= 0.5 ? brandStamp(orderQuote, orderPaidRupees) : {}),
            zaakpay_order_id: razorpay_order_id,
            razorpay_payment_id: razorpay_payment_id || null, // Session 58: column added — the payment id is kept now
            ...(isInhouseOrderId(razorpay_order_id) ? { brand_paid_amount: 0, brand_fee_amount: 0, brand_fee_gst: 0, notes: "Ybex in-house brand — funded by Ybex, no money collected from the brand. Pay the creator from Payouts as usual." } : {}), // v419
            brand_id: targetBrandId || null,
            status: 'SUCCESS',
            payout_status: 'PENDING',
            payout_type: 'full',
            created_at: nowIso
          });
          // Session 58: another path (verify / status poll / webhook) recorded this same payment a moment earlier —
          // stop here (no second "Payment Secured" message, no false "issue updating your deal").
          if (insErr && String((insErr as any).code) === '23505') {
            return { safeGross, dealUpdateError: null, threadUpdateError: null, alreadyProcessed: true };
          }
          // v389: two server copies can still insert at the same moment (the lock above is per copy). The OLDEST row for this order stays;
          // a later one removes itself and reports "already processed".
          if (!insErr && razorpay_order_id) {
            try {
              const { data: sameOrder } = await (privilegedSupabase || supabase).from('transactions').select('id, created_at')
                .eq('zaakpay_order_id', razorpay_order_id).order('created_at', { ascending: true }).order('id', { ascending: true }).limit(5);
              if (Array.isArray(sameOrder) && sameOrder.length > 1 && sameOrder[0].id !== txnId) {
                await (privilegedSupabase || supabase).from('transactions').delete().eq('id', txnId);
                console.warn("[persistEscrowPayment] duplicate row for the same order removed:", { razorpay_order_id, txnId, kept: sameOrder[0].id });
                return { safeGross, dealUpdateError: null, threadUpdateError: null, alreadyProcessed: true };
              }
            } catch (e) { console.warn("[persistEscrowPayment] duplicate check notice:", e); }
          }
          if (!insErr && feeCalc?.appliedCoupon && targetCreatorId) {
            await recordCouponUse(privilegedSupabase || supabase, feeCalc.appliedCoupon, { creatorId: targetCreatorId, dealId: validDealId || null, ugcOrderId: validUgcOrderId || null, discount: Number(feeCalc.discountApplied || 0) });
          }
          if (insErr) { console.error('[persistEscrowPayment] Supabase transaction insert error:', insErr); dealUpdateError = JSON.stringify(insErr); }
          // v364: a brand-fee coupon used on this payment counts once (redemption row + used_count)
          if (!insErr && orderQuote?.couponId && Math.abs(Number(orderQuote.gross) - safeGross) <= 0.5) {
            const full = Math.round((safeGross * Number((await loadFeeConfig(privilegedSupabase || supabase))?.brand_fee_pct || 0)) / 100);
            await confirmBrandCoupon(privilegedSupabase || supabase, { orderId: razorpay_order_id, couponId: orderQuote.couponId, brandId: String(targetBrandId || ""), dealId: validDealId || null, ugcOrderId: validUgcOrderId || null, discount: Math.max(0, full - Number(orderQuote.brandFee || 0)) }); // v366: atomic, once per order
          }
        }

        if (validDealId) {
          // v414: never revive a closed deal — only a deal that isn't cancelled / refunded / completed is moved to ACTIVE.
          const { data: movedRows, error: dealErr } = await (privilegedSupabase || supabase).from('deals').update({
            status: 'ACTIVE',
            escrow_hold: true,
            escrow_hold_at: nowIso,
            updated_at: nowIso
          }).eq('id', validDealId).not('status', 'in', '(CANCELLED,REFUNDED,COMPLETED)').select('id');
          if (dealErr) {
            dealUpdateError = dealErr.message || String(dealErr);
            console.error("[persistEscrowPayment] deals.update FAILED (payment succeeded but deal not marked active):", dealErr);
          } else if (!(Array.isArray(movedRows) && movedRows.length)) {
            // v414: nothing moved — check if the deal was closed before the money arrived.
            try {
              const { data: dNow } = await (privilegedSupabase || supabase).from('deals').select('status').eq('id', validDealId).maybeSingle();
              if (['CANCELLED', 'REFUNDED', 'COMPLETED'].includes(String(dNow?.status || '').toUpperCase())) dealClosedAfterPay = String(dNow.status).toUpperCase();
            } catch (e: any) { logIgnored("payment_routes:v414-closed-deal-check", e); }
          }
        }
        if (dealClosedAfterPay) {
          // v414: payment landed on a closed deal. The transaction row stays as received; the deal and thread are NOT
          // touched. Admins are told to refund and the chat gets a note.
          console.error("[persistEscrowPayment] payment received for a CLOSED deal — refund needed:", { validDealId, dealClosedAfterPay, razorpay_order_id, razorpay_payment_id });
          try {
            const { data: admins } = await (privilegedSupabase || supabase).from('users').select('user_id').eq('role', 'admin');
            for (const a of admins || []) {
              await sendNotification(getDb(), a.user_id, 'refund_due', `Payment after cancel — refund needed: a brand paid ₹${safeGross} for deal ${validDealId}, which is already ${dealClosedAfterPay.toLowerCase()}. Refund Razorpay payment ${razorpay_payment_id || razorpay_order_id}.`);
            }
          } catch (e: any) { logIgnored("payment_routes:v414-closed-deal-admin", e); }
          try {
            let closedThreadId = thread_id || null;
            if (!closedThreadId) {
              const { data: tr } = await (privilegedSupabase || supabase).from('chat_threads').select('id').eq('deal_id', validDealId).limit(1);
              if (Array.isArray(tr) && tr[0]) closedThreadId = tr[0].id;
            }
            if (closedThreadId) {
              const noteText = "Payment received after the deal was cancelled — Ybex will refund the brand";
              const note = {
                message_id: crypto.randomUUID(), thread_id: closedThreadId, sender_user_id: null,
                text: serializeChatMessage(noteText, "system", "system", { action: 'payment_after_cancel', amount: safeGross }),
                message_type: 'system',
                metadata: { action: 'payment_after_cancel', amount: safeGross, refund_due: true },
                created_at: nowIso
              };
              await insertChatMessageToSupabase(note);
              const ldb = getDb();
              if (ldb) { if (!ldb.chat_messages) ldb.chat_messages = []; ldb.chat_messages.push({ ...note, id: note.message_id, content: noteText }); saveDb(ldb); }
              const io = req?.app?.get?.("io");
              if (io) io.to(closedThreadId).emit("new_message", note);
            }
          } catch (e: any) { logIgnored("payment_routes:v414-closed-deal-msg", e); }
        }
        if (validUgcOrderId) {
          const { error: ugcErr } = await (privilegedSupabase || supabase).from('ugc_orders').update({
            payment_status: 'ESCROW_HELD',
            status: 'IN_PROGRESS',
            escrow_hold: true,
            escrow_held_at: nowIso,
            updated_at: nowIso
          }).eq('id', validUgcOrderId);
          if (ugcErr) {
            dealUpdateError = ugcErr.message || String(ugcErr);
            console.error("[persistEscrowPayment] ugc_orders.update FAILED (payment succeeded but order not marked active):", ugcErr);
          }
        }

        let targetThreadId = dealClosedAfterPay ? null : (thread_id || null); // v414: closed deal → leave the thread alone
        if (!dealClosedAfterPay && !targetThreadId && (validDealId || validUgcOrderId || candidateId || deal_id)) {
          const lookupId = validDealId || validUgcOrderId || candidateId || deal_id;
          const { data: thrRow } = await (privilegedSupabase || supabase)
            .from('chat_threads')
            .select('id, brand_id, creator_id')
            .or(`id.eq.${lookupId},deal_id.eq.${lookupId}`)
            .maybeSingle();
          if (thrRow) {
            targetThreadId = thrRow.id;
            if (!targetBrandId && thrRow.brand_id) targetBrandId = thrRow.brand_id;
          }
        }

        if (targetThreadId) {
          // IMPORTANT: chat_threads has no payment_funded/escrow_funded/
          // funded_at columns in the real Postgres schema — writing them
          // previously caused a PGRST204 error that silently rejected this
          // ENTIRE update (including status/flow_state), which is the
          // actual root cause of the deal staying stuck on "Payment
          // pending" forever after a real, successful Razorpay payment.
          // The real source of truth for "is this paid?" is deals.escrow_hold
          // (and ugc_orders.escrow_hold for UGC orders) — chat_threads only
          // needs its own real status/flow_state columns updated.
          const { error: threadErr } = await (privilegedSupabase || supabase).from('chat_threads').update({
            status: 'ACTIVE',
            flow_state: 'ACTIVE',
            updated_at: nowIso
          }).eq('id', targetThreadId);
          if (threadErr) {
            threadUpdateError = threadErr.message || String(threadErr);
            console.error("[persistEscrowPayment] chat_threads.update FAILED:", threadErr);
          }

          try {
            const msgText = `💰 Payment Secured! ₹${safeGross.toLocaleString('en-IN')} has been deposited and is now held safely in a secure payment hold. The creator can begin work.`;
            const sysContent = serializeChatMessage(msgText, "payment_secured", "system", {
              action: 'payment_secured',
              amount: safeGross,
              paid_at: nowIso
            });

            const isUuid = (val: any) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
            const senderUid = isUuid(targetBrandId) ? targetBrandId : (isUuid(user?.user_id) ? user.user_id : null);

            const paymentMsg = {
              message_id: crypto.randomUUID(),
              thread_id: targetThreadId,
              sender_user_id: senderUid,
              text: sysContent,
              message_type: 'payment_secured',
              metadata: {
                action: 'payment_secured',
                amount: safeGross,
                paid_at: nowIso
              },
              created_at: nowIso
            };
            await insertChatMessageToSupabase(paymentMsg);

            const db = getDb();
            if (db) {
              if (!db.chat_messages) db.chat_messages = [];
              db.chat_messages.push({
                ...paymentMsg,
                id: paymentMsg.message_id,
                content: paymentMsg.text
              });
              const mThr = (db.chat_threads || []).find((t: any) => t.id === targetThreadId || t.deal_id === targetThreadId);
              if (mThr) {
                mThr.status = 'ACTIVE';
                mThr.flow_state = 'ACTIVE';
              }
              const mDeal = (db.deals || []).find((d: any) => d.id === validDealId);
              if (mDeal) {
                mDeal.status = 'ACTIVE';
                mDeal.escrow_hold = true;
              }
              saveDb(db);
            }

            // FIX #5: Only emit socket events if this is NOT a duplicate/already-processed payment
            const io = req.app.get("io");
            if (io && !isAlreadyProcessed) {  // ✅ FIX #5: Skip events for duplicates
              io.to(targetThreadId).emit("new_message", paymentMsg);
              emitThreadEvent(io, "payment_funded", { 
                threadId: targetThreadId, 
                dealId: validDealId, 
                amount: safeGross
              });
              emitThreadEvent(io, "thread_updated", { 
                id: targetThreadId, 
                threadId: targetThreadId, 
                status: "ACTIVE", 
                payment_funded: true, 
                lastMessage: paymentMsg
              });
            }
          } catch (mErr) {
            console.warn("[persistEscrowPayment] Could not insert payment_secured message:", mErr);
          }
        }
      } catch (dbErr) { console.error('[persistEscrowPayment] DB update exception:', dbErr); dealUpdateError = String(dbErr); }
    }

    const db = getDb();
    if (db) {
      if (!db.transactions) db.transactions = [];
      db.transactions.push({
        id: crypto.randomUUID(),
        deal_id: deal_id || null,
        ugc_order_id: deal_id && deal_id.startsWith("ugcord_") ? deal_id : null,
        creator_id: targetCreatorId || null,
        gross_amount: safeGross,
        platform_fee_amount: platformFee,
        creator_net_amount: creatorNet,
        gst_amount: gstAmount,
        razorpay_order_id,
        razorpay_payment_id,
        status: 'SUCCESS',
        escrow_hold: true,
        payout_status: 'PENDING',
        created_at: nowIso
      });
      saveDb(db);
    }

    if (dealUpdateError || threadUpdateError) {
      console.error("[persistEscrowPayment] Payment succeeded but deal/thread state failed to fully sync:", { dealUpdateError, threadUpdateError, deal_id, thread_id });
    }

    return { safeGross, dealUpdateError, threadUpdateError, alreadyProcessed: false, dealClosed: dealClosedAfterPay || null }; // v414
  }

  router.post("/payments/razorpay/verify", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      deal_id,
      thread_id,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing required Razorpay payment verification parameters." });
    }
    // v423 (QA): ids go into database filters further down — plain ids only (a crafted "x,id.eq.<other>" could reach
    // another deal's chat thread), same rule as check-status.
    {
      const SAFE = /^[A-Za-z0-9_-]{1,80}$/;
      for (const v of [razorpay_order_id, razorpay_payment_id, deal_id, thread_id]) {
        if (v && !SAFE.test(String(v))) return res.status(400).json({ verified: false, error: "Invalid id." });
      }
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    // A `pay_test_` id no longer skips verification on its own — it is honoured
    // only while test mode is on. See backend/paymentTestMode.ts.
    const decision = decideSignatureCheck({
      paymentId: razorpay_payment_id,
      testMode: getIsTestMode(),
      hasSecret: Boolean(secret)
    });

    if (decision.action === "reject_simulated") {
      console.warn(`[Razorpay Verify] Simulated payment id rejected outside test mode: ${razorpay_payment_id}`);
      return res.status(400).json({ verified: false, error: decision.reason });
    }

    if (decision.action === "missing_secret") {
      return res.status(500).json({ error: decision.reason });
    }

    let verifiedPaymentId = String(razorpay_payment_id);
    if (decision.action === "verify") {
      let skipHmac = false;
      // Session 58: "ondismiss" (checkout closed after paying in the UPI app) is the same case as "polling" — the
      // order is confirmed with Razorpay below; it used to fail with "Invalid signature".
      const pollingPath = razorpay_signature === "pending" && (req.body.source === "polling" || req.body.source === "ondismiss") && razorpay_order_id;
      if (pollingPath && supabase) {
        // v423 (QA): already recorded (by check-status / the webhook) → that IS the answer; never an "invalid signature" error
        try {
          const { data: done } = await supabase.from('transactions').select('id, gross_amount, razorpay_payment_id').eq('zaakpay_order_id', razorpay_order_id).limit(1);
          if (Array.isArray(done) && done.length) {
            return res.json({ verified: true, success: true, already_recorded: true, payment_id: done[0].razorpay_payment_id || null, order_id: razorpay_order_id, deal_id: deal_id || null, thread_id: thread_id || null, gross_amount: Number(done[0].gross_amount) || 0, state_sync_failed: false, state_sync_error: null, duplicate_payment: false });
          }
        } catch (e: any) { logIgnored("payment_routes:verify-recorded", e); }
      }
      if (pollingPath) {
        try {
          const rzp = getRazorpay();
          if (rzp) {
            const rzpOrder = await rzp.orders.fetch(razorpay_order_id);
            if (rzpOrder?.status === "paid") {
              // v423 (P6): no signature on this path, so the browser's payment id is trusted only if it is one of this
              // order's CAPTURED payments; otherwise Razorpay's captured payment is used.
              const captured = await capturedPaymentIdFor(razorpay_order_id, String(razorpay_payment_id)).catch(() => null);
              if (captured) { verifiedPaymentId = captured; skipHmac = true; }
            }
          }
        } catch (e) {
          console.warn("[Razorpay Verify] Order status check failed during polling verify:", e);
        }
      }

      // v423 (QA): the polling / window-closed path has no real signature — if Razorpay couldn't confirm it just now,
      // answer "still confirming" (the app retries) instead of comparing "pending" with an HMAC.
      if (!skipHmac && pollingPath) {
        return res.status(503).json({ verified: false, retry: true, code: 'PAYMENT_UNCONFIRMED', error: "We're still confirming your payment with the bank. Please don't pay again — we'll check again in a moment." });
      }
      if (!skipHmac) {
        const body = `${razorpay_order_id}|${razorpay_payment_id}`;
        const expectedSignature = crypto
          .createHmac("sha256", secret as string)
          .update(body)
          .digest("hex");

        // v423 (P17): timing-safe compare (the webhook already was)
        const sigA = Buffer.from(expectedSignature, "utf8"), sigB = Buffer.from(String(razorpay_signature), "utf8");
        if (sigA.length !== sigB.length || !crypto.timingSafeEqual(sigA, sigB)) {
          console.warn(`[Razorpay Verify] Signature mismatch for order: ${razorpay_order_id}`);
          return res.status(400).json({
            verified: false,
            error: "Invalid Razorpay payment signature. Payment verification failed."
          });
        }
      }
    }

    const result = await persistEscrowPayment({ razorpay_order_id, razorpay_payment_id: verifiedPaymentId, deal_id, thread_id, user, req });
    // v423 (P4): Razorpay couldn't confirm the payment just now — tell the app to check again shortly (the money may
    // well be taken), instead of a "failed" message that makes the brand pay twice.
    if (result.unconfirmed) {
      return res.status(503).json({ verified: false, retry: true, code: 'PAYMENT_UNCONFIRMED', error: "We're still confirming your payment with the bank. Please don't pay again — we'll check again in a moment." });
    }
    if (result.amountMismatch) {
      return res.status(400).json({ verified: false, error: result.amountMismatch, code: 'ESCROW_AMOUNT_MISMATCH' });
    }
    const stateSyncFailed = Boolean(result.dealUpdateError || result.threadUpdateError);

    return res.json({
      verified: true,
      success: true,
      duplicate_payment: Boolean(result.duplicatePayment), // v423 (P5): a second payment for an already-paid deal → the app says "refund in 5-7 days"
      payment_id: verifiedPaymentId,
      order_id: razorpay_order_id,
      deal_id: deal_id || null,
      thread_id: thread_id || null,
      gross_amount: result.safeGross,
      state_sync_failed: stateSyncFailed,
      state_sync_error: stateSyncFailed ? (result.dealUpdateError || result.threadUpdateError) : null,
      deal_closed: result.dealClosed || null // v414: paid after the deal closed → Ybex refunds
    });
  });


  router.post("/payments/razorpay/check-status", async (req, res) => {
    const { deal_id, thread_id, order_id } = req.body;
    // v423 (P14): payment status is not public — sign-in required (the app always sends the token).
    const statusUser = await parseAuthUser(req).catch(() => null);
    if (!statusUser) return res.status(401).json({ paid: false, error: "Please sign in." });

    if (!order_id && !deal_id && !thread_id) {
      return res.status(400).json({ paid: false, error: "Missing identifier for status check." });
    }
    // Session 56: ids go into a database filter below — only plain ids are accepted (a crafted
    // value like "x,status.eq.SUCCESS" made any paid row answer "paid").
    const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
    if ((order_id && !SAFE_ID.test(String(order_id))) || (deal_id && !SAFE_ID.test(String(deal_id))) || (thread_id && !SAFE_ID.test(String(thread_id)))) {
      return res.status(400).json({ paid: false, error: "Invalid id." });
    }

    // 1. Has this order already been persisted as a successful transaction?
    if (supabase) {
      try {
        let query = supabase.from('transactions').select('*').or('payout_type.is.null,payout_type.neq.refund'); // v423 (P14): deposit rows only — a refund row is not "paid" (null = old deposit rows)
        if (order_id) {
          // the Razorpay order id lives in zaakpay_order_id (old column name)
          // Session 58: "order_…" compared with the uuid id column errored, so every poll fell through to Razorpay.
          query = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(order_id)) ? query.or(`zaakpay_order_id.eq.${order_id},id.eq.${order_id}`) : query.eq('zaakpay_order_id', order_id);
        } else if (deal_id) {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deal_id);
          if (isUuid) {
            query = query.eq('deal_id', deal_id);
          } else {
            query = query.eq('ugc_order_id', deal_id);
          }
        }
        const { data: txns } = await query.limit(5);
        // v423 (P14): a deposit that was later released / refunded was still PAID — it must never say "pending" (pay again).
        const txn = (txns || []).find((t: any) => ['SUCCESS', 'COMPLETED', 'HELD', 'ESCROW_HELD', 'PAID', 'CAPTURED', 'RELEASED', 'REFUNDED'].includes(String(t.status || '').toUpperCase()));
        if (txn) {
          {
            return res.json({ paid: true, status: 'paid', order_id: order_id || txn.zaakpay_order_id });
          }
        }
      } catch (e) {
        console.warn("[Razorpay check-status] DB check error:", e);
      }
    }

    // 2. Not yet in our DB — ask Razorpay directly. If THEY say it's paid,
    //    this is exactly the race-condition case: a UPI payment can settle
    //    on Razorpay's side before our own /verify call ever runs. Rather
    //    than just reporting "paid" and leaving our database stale (the
    //    root cause of the "stuck on Payment pending" bug), actually
    //    persist the payment right here too, using the same shared logic
    //    /verify uses — so no matter which path "wins" the race, the deal
    //    and thread genuinely get marked ACTIVE.
    if (order_id && order_id.startsWith("order_")) {
      try {
        const rzp = getRazorpay();
        const order = await rzp.orders.fetch(order_id);
        if (order?.status === "paid") {
          const user = statusUser;
          // v423 (P6): the CAPTURED payment of this order (items[0] could be a failed attempt; never the order id).
          const paymentId = await capturedPaymentIdFor(order_id).catch(() => null);
          if (!paymentId) return res.json({ paid: false, status: "pending", order_id, retry: true });

          const result = await persistEscrowPayment({ razorpay_order_id: order_id, razorpay_payment_id: paymentId, deal_id, thread_id, user, req });
          if (result.amountMismatch) {
            return res.status(400).json({ paid: false, status: "mismatch", order_id, error: result.amountMismatch, code: 'ESCROW_AMOUNT_MISMATCH' });
          }
          if (result.dealUpdateError || result.threadUpdateError) {
            console.error("[Razorpay check-status] Payment detected as paid but state sync failed:", { dealUpdateError: result.dealUpdateError, threadUpdateError: result.threadUpdateError });
          }
          return res.json({ paid: true, status: "paid", order_id, gross_amount: result.safeGross });
        }
      } catch (e: any) { logIgnored("payment_routes:1645", e); }
    }

    const db = getDb();
    if (db && db.transactions) {
      const txn = db.transactions.find((t: any) => 
        (order_id && (t.razorpay_order_id === order_id || t.zaakpay_order_id === order_id)) ||
        (deal_id && (t.deal_id === deal_id || t.ugc_order_id === deal_id))
      );
      if (txn && (txn.status === 'SUCCESS' || txn.status === 'COMPLETED')) {
        return res.json({ paid: true, status: 'paid', order_id });
      }
    }

    return res.json({ paid: false, status: 'pending', order_id });
  });


  // Session 56 (payment audit): Razorpay tells us directly when a campaign deal's order is paid, so
  // a payment is recorded even when the brand's app was closed before /verify ran. Off until
  // RAZORPAY_WEBHOOK_SECRET is set. Only orders made by create-order for a deal carry deal_id in
  // their notes; everything else is acknowledged and ignored (UGC briefs have their own recovery).
  router.post("/payments/razorpay/webhook", async (req: any, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ ok: false, error: "Webhook not configured." });
    const sig = String(req.headers["x-razorpay-signature"] || "");
    if (!verifyWebhookSignature(req.rawBody, sig, secret)) {
      console.warn("[Razorpay webhook] bad signature — ignored");
      return res.status(400).json({ ok: false });
    }
    const info = webhookOrderInfo(req.body);
    if (info && info.kind === "ugc_brief") {
      // Session 58: if no brief was created for this paid order within 10 minutes, admins are told (refund / create).
      // v423 (P8): the watch is saved in the database (not a timer in this server's memory, which a restart lost) and is
      // written once per order — order.paid and payment.captured both arrive, admins were told twice.
      const watchKey = `briefwatch:${info.orderId}`;
      const already = await ephemeralGet(watchKey).catch(() => null);
      if (!already) await ephemeralSet(watchKey, { order_id: info.orderId, due: Date.now() + 10 * 60 * 1000 }, 3 * 24 * 3600 * 1000).catch((e: any) => logIgnored("payment_routes:briefwatch-set", e));
      return res.json({ ok: true, watching: true });
    }
    // v423 (P1): Instant UGC orders (kind ugc_order, notes.ugc_order_id) are recorded here too — before, a brand who paid in the
    // UPI app and had Ybex closed in the background was charged while the order stayed "payment pending".
    const webhookTarget = info && info.kind === "campaign_escrow" ? info.dealId : info && info.kind === "ugc_order" ? (info.ugcOrderId || null) : null;
    if (!info || !webhookTarget) return res.json({ ok: true, ignored: true });
    try {
      // Same checks as /verify: persistEscrowPayment confirms the paid amount with Razorpay, refuses an
      // order made for another deal, and does nothing if this order was already recorded.
      // v423 (P6): the payment id comes from Razorpay's own captured payment for this order — never the order id.
      let webhookPaymentId = info.paymentId;
      if (!webhookPaymentId) webhookPaymentId = await capturedPaymentIdFor(info.orderId).catch(() => null);
      if (!webhookPaymentId) return res.status(500).json({ ok: false, retry: true }); // Razorpay retries; the next event carries the payment
      const result = await persistEscrowPayment({ razorpay_order_id: info.orderId, razorpay_payment_id: webhookPaymentId, deal_id: webhookTarget, thread_id: null, user: null, req });
      if (result.amountMismatch) console.error("[Razorpay webhook] payment hold NOT recorded:", info.orderId, result.amountMismatch);
      // Session 58: Razorpay couldn't be asked just now → answer 500 so Razorpay retries (200 dropped it for good).
      if (result.unconfirmed) return res.status(500).json({ ok: false, retry: true });
      return res.json({ ok: true, recorded: !result.amountMismatch, already: result.alreadyProcessed });
    } catch (e: any) {
      console.error("[Razorpay webhook] failed:", e?.message || e);
      return res.status(500).json({ ok: false }); // Razorpay retries later
    }
  });

  // v423 (P8): paid UGC brief orders with no brief after 10 minutes → one admin alert per order. Runs every 5 minutes on
  // any server copy; the watch row is deleted before alerting, so two copies can't both alert.
  const briefWatchTick = async () => {
    try {
      const client = privilegedSupabase || supabase;
      if (!client) return;
      const rows = await ephemeralList("briefwatch:", 50);
      for (const row of rows) {
        const due = Number(row?.value?.due) || 0;
        const orderId = String(row?.value?.order_id || "");
        if (!orderId || Date.now() < due) continue;
        if (!(await ephemeralTake(row.key))) continue; // another server copy took it
        const { data: b } = await client.from('ugc_briefs').select('id').eq('razorpay_order_id', orderId).limit(1);
        if (Array.isArray(b) && b.length) continue;
        const { data: admins } = await client.from('users').select('user_id').eq('role', 'admin');
        for (const a of admins || []) await sendNotification(getDb(), a.user_id, 'refund_due', `A brand paid for a UGC brief (Razorpay order ${orderId}) but the brief was never created. Create it for them or refund the payment.`);
      }
    } catch (e: any) { console.error("[Razorpay webhook] brief check failed:", e?.message || e); }
  };
  if (process.env.NODE_ENV !== "test" && !process.env.VITEST) { const bw: any = setInterval(briefWatchTick, 5 * 60 * 1000); bw.unref?.(); }

  // v423 (P8): this brand's PAID UGC brief orders that have no brief yet (made on any device in the last 3 days).
  router.get("/payments/brief-paid-orders", async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Please sign in." });
    const client = privilegedSupabase || supabase;
    const rzp: any = getRazorpay();
    if (!client || !rzp) return res.json({ orders: [] });
    const ownerId = String(user?.parent_brand_id || user?.user_id || "");
    try {
      const want = Math.round(Number(req.query?.amount) || 0); // the app sends the amount it is about to pay
      const rows = (await ephemeralList(`briefpay:${ownerId}:`, 50))
        .filter((r: any) => !want || Math.round(Number(r?.value?.amount) || 0) === want)
        .sort((a: any, b: any) => (Number(b?.value?.at) || 0) - (Number(a?.value?.at) || 0)) // newest first
        .slice(0, 5); // at most 5 Razorpay checks per call
      const out: any[] = [];
      for (const row of rows) {
        const orderId = String(row?.value?.order_id || "");
        if (!/^order_[A-Za-z0-9]+$/.test(orderId)) continue;
        const { data: used } = await client.from('ugc_briefs').select('id').eq('razorpay_order_id', orderId).limit(1);
        if (Array.isArray(used) && used.length) { await ephemeralTake(row.key).catch(() => null); continue; } // brief exists → forget the order
        const o: any = await rzp.orders.fetch(orderId).catch(() => null);
        if (String(o?.status || "").toLowerCase() !== "paid") continue;
        out.push({ order_id: orderId, amount: Number(row.value.amount) || 0, at: row.value.at || null });
      }
      return res.json({ orders: out });
    } catch (e: any) {
      logIgnored("payment_routes:briefpay-list", e);
      return res.json({ orders: [] });
    }
  });

  router.post("/payments/razorpay/test-complete", async (req, res) => {
    // Issue #7 Fix: Use centralized test mode detection
    const isDevOrPreview = getIsTestMode();

    if (!isDevOrPreview) {
      return res.status(403).json({ error: "Test payment simulation is disabled in production environments." });
    }

    const user = await parseAuthUser(req);
    // Session 58 (security): even in test mode, only a signed-in brand (or admin) may simulate a payment.
    if (!user) return res.status(401).json({ error: "Please sign in." });
    if (!["brand", "admin"].includes(String(user.role || "").toLowerCase())) return res.status(403).json({ error: "Brands only." });
    const { deal_id, thread_id, order_id } = req.body;
    for (const v of [deal_id, thread_id, order_id]) if (v && !/^[A-Za-z0-9_-]{1,80}$/.test(String(v))) return res.status(400).json({ error: "Invalid id." }); // v423 (QA)

    const simulatedOrderId = order_id || `order_test_${Date.now()}`;
    const simulatedPaymentId = `pay_test_${Date.now()}`;

    const result = await persistEscrowPayment({ razorpay_order_id: simulatedOrderId, razorpay_payment_id: simulatedPaymentId, deal_id, thread_id, user, req });
    const stateSyncFailed = Boolean(result.dealUpdateError || result.threadUpdateError);

    return res.json({
      verified: true,
      success: true,
      is_test: true,
      order_id: simulatedOrderId,
      payment_id: simulatedPaymentId,
      deal_id: deal_id || null,
      thread_id: thread_id || null,
      gross_amount: result.safeGross,
      state_sync_failed: stateSyncFailed,
      state_sync_error: stateSyncFailed ? (result.dealUpdateError || result.threadUpdateError) : null
    });
  });



  router.post([
    "/campaign/threads/:threadId/alert-admin-payout",
    "/ugc/threads/:threadId/alert-admin-payout",
    "/chat/v2/threads/:threadId/alert-admin-payout"
  ], async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { threadId } = req.params;
    const now = Date.now();
    const nowIso = getIsoNow();

    // 1. Rate limiting check: 60s cooldown per thread
    const lastAlertTime = threadAlertCooldowns.get(threadId) || 0;
    if (now - lastAlertTime < 60000) {
      const remainingSecs = Math.ceil((60000 - (now - lastAlertTime)) / 1000);
      return res.status(429).json({
        error: `An alert was recently sent. Please wait ${remainingSecs}s before sending another reminder.`
      });
    }

    const rawNote = req.body?.note;
    const note = (rawNote && String(rawNote).trim()) || "Brand requested priority fund release for creator";

    if (supabase) {
      let { data: thread } = await supabase
        .from('chat_threads')
        .select('*')
        .eq('id', threadId)
        .maybeSingle();

      if (!thread) {
        const { data: t2 } = await supabase
          .from('chat_threads')
          .select('*')
          .eq('deal_id', threadId)
          .maybeSingle();
        thread = t2;
      }

      // A thread nobody can find used to count as "authorized", and the deal id came from the
      // request body — so any user could stamp "brand requested fund release" and their own
      // note onto any deal's transactions in the admin escrow panel.
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }
      const uid = user.user_id || user.id;
      const isAuthorized = (
        thread.brand_id === uid || thread.brand_id === user.user_id || thread.brand_id === user.id ||
        thread.brand_id === user.parent_brand_id ||
        thread.creator_id === uid || thread.creator_id === user.user_id || thread.creator_id === user.id ||
        user.role === 'admin'
      );
      if (!isAuthorized) {
        return res.status(403).json({ error: "Not authorized to send alerts for this thread" });
      }
      // The deal is the thread's own, never one named by the caller.
      const targetDealId = thread.campaign_deal_id || thread.ugc_order_id || thread.deal_id || thread.id;

      // Session 38 (Ravi): a creator may ask to be paid only after the brand approved the work.
      // The chat nudge had no stage check at all (Earnings → Request payout already had one).
      if (user.role !== 'admin') {
        try {
          const c = privilegedSupabase || supabase;
          let stage: string | null = null;
          if (thread.ugc_order_id) {
            const { data: o } = await c.from('ugc_orders').select('status').eq('id', thread.ugc_order_id).maybeSingle();
            stage = o ? String(o.status || '').toUpperCase() : null;
          } else {
            const dealKey = thread.campaign_deal_id || thread.deal_id;
            if (dealKey) {
              const { data: d } = await c.from('deals').select('status').eq('id', dealKey).maybeSingle();
              stage = d ? String(d.status || '').toUpperCase() : null;
            }
          }
          if (stage && !PAYOUT_READY_DEAL_STATUSES.includes(stage)) {
            return res.status(409).json({ error: "You can ask for payment once the brand has approved your work.", code: "NOT_APPROVED" });
          }
        } catch (e: any) { logIgnored("payment_routes:alertPayoutStage", e); }
      }

      // Per-user cooldown too: the per-thread one could be dodged by changing the thread id.
      const userKey = `user:${uid}`;
      const lastUserAlert = threadAlertCooldowns.get(userKey) || 0;
      if (now - lastUserAlert < 60000) {
        const remainingSecs = Math.ceil((60000 - (now - lastUserAlert)) / 1000);
        return res.status(429).json({ error: `An alert was recently sent. Please wait ${remainingSecs}s before sending another reminder.` });
      }

      // Record rate limit timestamp
      threadAlertCooldowns.set(threadId, now);
      threadAlertCooldowns.set(userKey, now);

      // Record / update payout request in payout_requests table (deal_id is a uuid column — UGC orders are
      // flagged on their transaction row below instead).
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(targetDealId))) try {
        const { data: existingPr } = await (privilegedSupabase || supabase)
          .from('payout_requests')
          .select('*')
          .eq('deal_id', targetDealId)
          .maybeSingle();

        const newCount = existingPr ? (Number(existingPr.request_count) || 1) + 1 : 1;
        await (privilegedSupabase || supabase).from('payout_requests').upsert({
          deal_id: targetDealId,
          thread_id: threadId,
          creator_id: thread?.creator_id || null,
          creator_name: thread?.creator_name || 'Creator',
          request_count: newCount,
          note: note,
          status: 'PENDING_ADMIN',
          created_at: existingPr?.created_at || nowIso,
          updated_at: nowIso
        }, { onConflict: 'deal_id' });
      } catch (prErr) {
        console.warn("[alert-admin-payout] payout_requests warning:", prErr);
      }

      // Update transactions table so admin EscrowDashboard displays nudged counter & notes
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetDealId);
        let txnQuery = supabase.from('transactions').select('id, payout_request_count');
        if (isUuid) {
          txnQuery = txnQuery.or(`deal_id.eq.${targetDealId},id.eq.${targetDealId},ugc_order_id.eq.${targetDealId}`);
        } else {
          // Session 58: a UGC order id isn't a uuid — comparing it with the uuid `id` column made the whole
          // lookup error, so the admin was never flagged (the creator still saw "sent").
          txnQuery = txnQuery.eq('ugc_order_id', targetDealId);
        }
        const { data: txns } = await txnQuery;
        if (txns && txns.length > 0) {
          for (const tx of txns) {
            const nextCount = (Number(tx.payout_request_count) || 0) + 1;
            await (privilegedSupabase || supabase).from('transactions').update({
              payout_requested: true,
              payout_request_count: nextCount,
              payout_request_notes: note,
              last_payout_requested_at: nowIso,
              updated_at: nowIso
            }).eq('id', tx.id);
          }
        }
      } catch (txErr) {
        console.warn("[alert-admin-payout] transactions update error:", txErr);
      }

      // Dispatch notification to admins
      try {
        const { data: adminUsers } = await supabase
          .from('users')
          .select('user_id')
          .eq('role', 'admin');

        if (adminUsers && adminUsers.length > 0) {
          for (const adm of adminUsers) {
            await sendNotification(
              null,
              adm.user_id,
              "admin_payout_alert",
              // Session 58 (bug hunt): it always said "Brand" — the alert is sent by whoever is signed in (usually the creator).
              `🔔 Priority Payout Alert: ${String(user?.role || "").toLowerCase() === "creator" ? "Creator" : String(user?.role || "").toLowerCase() === "brand" ? "Brand" : "User"} requested fund release for deal ${targetDealId}. Note: "${note}"`
            );
          }
        }
      } catch (notifErr) {
        console.warn("[alert-admin-payout] admin notification warning:", notifErr);
      }

      // Broadcast real-time Socket.io event for admin sessions
      const io = req.app.get("io");
      if (io) {
        emitAdminEvent(io, "admin_payout_alert", {
          deal_id: targetDealId,
          thread_id: threadId,
          note,
          requested_at: nowIso
        });
      }

      return res.json({
        success: true,
        message: "Priority payout alert sent to Admin! Secure payment hold finance desk has been notified."
      });
    }

    // In-memory DB Fallback
    const db = getDb();
    const thread = (db.chat_threads || []).find((t: any) => t.id === threadId || t.deal_id === threadId);
    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }
    const uid = user.user_id || user.id;
    const isAuthorized = (
      thread.brand_id === uid || thread.brand_id === user.user_id || thread.brand_id === user.id ||
      thread.brand_id === user.parent_brand_id ||
      thread.creator_id === uid || thread.creator_id === user.user_id || thread.creator_id === user.id ||
      user.role === 'admin'
    );
    if (!isAuthorized) {
      return res.status(403).json({ error: "Not authorized to send alerts for this thread" });
    }
    const targetDealId = thread.campaign_deal_id || thread.ugc_order_id || thread.deal_id || thread.id;

    threadAlertCooldowns.set(threadId, now);

    if (db) {
      if (db.transactions) {
        const tx = db.transactions.find((t: any) => t.deal_id === targetDealId || t.id === targetDealId || t.ugc_order_id === targetDealId);
        if (tx) {
          tx.payout_requested = true;
          tx.payout_request_count = (Number(tx.payout_request_count) || 0) + 1;
          tx.payout_request_notes = note;
          tx.last_payout_requested_at = nowIso;
        }
      }
      saveDb(db);
    }

    const io = req.app.get("io");
    if (io) {
      emitAdminEvent(io, "admin_payout_alert", {
        deal_id: targetDealId,
        thread_id: threadId,
        note,
        requested_at: nowIso
      });
    }

    return res.json({
      success: true,
      message: "Priority payout alert sent to Admin! Secure payment hold finance desk has been notified."
    });
  });

}
