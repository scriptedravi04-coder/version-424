import { getCreatorKycStatus } from "./creatorKyc";
// Session 57 (Ravi's Money screens design, ER-04: one "Request payout" for all ready money).
//
// "Ready" = the brand approved the work (payout_status RELEASED, or the deal / UGC order is
// approved) and Ybex hasn't sent it to the bank yet (no UTR, not PAID). The old per-deal
// /creator/payout-request refuses RELEASED rows ("already released"), so approved money could never be
// asked for from the app. This marks every ready payment of the signed-in creator as requested for the
// finance desk (the same payout_requested flag the chat "alert admin" button sets) and tells admins once.
// Nothing moves money here — the admin still pays out by hand and records the UTR.
import { logIgnored } from "./logIgnored";
import { readRiskControls } from "./riskControls";
import { isRefunded, isRefundInProgress } from "./adminMoney"; // v346
import { hasKycPayoutAccount } from "./kycPayoutMethod"; // v347

const up = (v: any) => String(v ?? "").trim().toUpperCase();

export function isPaidToBank(tx: any): boolean {
  if (!tx) return false;
  return ["PAID", "COMPLETED"].includes(up(tx.payout_status)) || Boolean(String(tx.payout_reference || tx.utr_number || "").trim());
}
// v346: same rule as the admin money screens (adminMoney.ts). A PART refund (₹2,000 of ₹20,000,
// refund PROCESSED) no longer blocks the rest of the payout; a full refund, or one still in progress, does.
function isRefundedOrRefunding(tx: any): boolean {
  if (!tx) return false;
  if (isRefunded(tx) || isRefundInProgress(tx)) return true;
  const gross = Number(tx.gross_amount) || 0, refunded = Number(tx.refund_amount) || 0;
  return gross > 0 && refunded >= gross; // whole amount refunded even if the status lags
}

/** Pure: which of these transaction rows are ready to be paid to the creator. */
export function readyRows(txns: any[], { approvedDealIds = new Set<string>(), approvedOrderIds = new Set<string>() } = {}) {
  // Session 58: one deal / UGC order is paid once — if two rows exist for the same one, only one counts.
  const seen = new Set<string>();
  const once = (t: any) => {
    const k = t.deal_id ? `d:${t.deal_id}` : t.ugc_order_id ? `u:${t.ugc_order_id}` : `t:${t.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  };
  const rank = (t: any) => (up(t?.payout_status) === "RELEASED" ? 0 : 1);
  return [...(txns || [])].sort((a, b) => rank(a) - rank(b)).filter((t) => {
    if (!t || isPaidToBank(t) || isRefundedOrRefunding(t)) return false;
    if (t.brief_id && !t.deal_id && !t.ugc_order_id) return false; // brief deposit
    if (!["SUCCESS", "ESCROW_HELD", "PAID", "PROCESSED"].includes(up(t.status))) return false;
    if (up(t.payout_status) === "RELEASED") return once(t);
    if (t.deal_id && approvedDealIds.has(String(t.deal_id))) return once(t);
    if (t.ugc_order_id && approvedOrderIds.has(String(t.ugc_order_id))) return once(t);
    return false;
  });
}

export function setupCreatorPayoutRequestRoutes(router: any, { supabase, privilegedSupabase, parseAuthUser, sendNotification }: any) {
  const lastByUser = new Map<string, number>();

  router.post("/creator/payout-request-ready", async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Please sign in." });
    if (String(user.role || "").toLowerCase() !== "creator") return res.status(403).json({ error: "Only creators can request a payout." });
    const client = privilegedSupabase || supabase;
    if (!client) return res.status(503).json({ error: "Payments are unavailable right now. Please try again." });
    const uid = String(user.user_id);
    const now = Date.now();
    if (now - (lastByUser.get(uid) || 0) < 30_000) {
      return res.status(429).json({ error: "You just sent a request. Please wait a moment." });
    }

    try {
      // Session 58 (Q11): admin emergency "freeze all payouts" switch.
      const risk = await readRiskControls(client);
      if (risk.payoutFreezeAll) return res.status(409).json({ error: "Payouts are paused for a short while. Your money is safe — please try again later.", code: "PAYOUTS_FROZEN" });
      const { data: methods } = await client.from("creator_payment_methods").select("id").eq("user_id", uid).limit(1);
      if (!Array.isArray(methods) || methods.length === 0) {
        // v347: the UPI / bank given in KYC counts too (admin payout reads the same — adminMoney.pickPayoutAccount).
        const fromKyc = await hasKycPayoutAccount(client, uid);
        if (fromKyc === null) return res.status(502).json({ error: "Couldn't check your payout details right now. Please try again." });
        if (!fromKyc) return res.status(409).json({ error: "Add a UPI ID or bank account first, so finance knows where to send it.", code: "NO_PAYOUT_METHOD" });
      }
      // Session 58: the screen says KYC is needed before money is sent — the server now checks it too.
      const kyc = await getCreatorKycStatus(client, {}, uid);
      if (kyc === "UNKNOWN") return res.status(502).json({ error: "Couldn't check your KYC right now. Please try again." });
      if (kyc !== "APPROVED") return res.status(409).json({ error: "Complete your KYC first — it's needed before any money can be sent to you.", code: "KYC_REQUIRED" });
      const { data: txns, error } = await client.from("transactions").select("*").eq("creator_id", uid).limit(500);
      if (error) return res.status(502).json({ error: "Couldn't read your payments. Please try again." });
      const dealIds = [...new Set((txns || []).map((t: any) => t.deal_id).filter(Boolean))];
      const orderIds = [...new Set((txns || []).map((t: any) => t.ugc_order_id).filter(Boolean))];
      const approvedDealIds = new Set<string>();
      const approvedOrderIds = new Set<string>();
      if (dealIds.length) {
        const { data: ds } = await client.from("deals").select("id, status, creator_id").in("id", dealIds);
        (ds || []).forEach((d: any) => { if (String(d.creator_id) === uid && ["COMPLETED", "APPROVED"].includes(up(d.status))) approvedDealIds.add(String(d.id)); });
      }
      if (orderIds.length) {
        const { data: os } = await client.from("ugc_orders").select("id, status, creator_id").in("id", orderIds);
        (os || []).forEach((o: any) => { if (String(o.creator_id) === uid && up(o.status) === "COMPLETED") approvedOrderIds.add(String(o.id)); });
      }
      const rows = readyRows(txns || [], { approvedDealIds, approvedOrderIds });
      if (!rows.length) return res.status(409).json({ error: "Nothing is ready to pay out yet. Money becomes ready when the brand approves your work.", code: "NOTHING_READY" });

      // Session 58 (Q11): admin minimum withdrawal amount.
      const readyTotal = rows.reduce((sum: number, t: any) => sum + (Number(t.creator_net_amount) || 0), 0);
      if (risk.minWithdrawal > 0 && readyTotal < risk.minWithdrawal) {
        return res.status(409).json({ error: `You can request a payout once ₹${Math.round(risk.minWithdrawal).toLocaleString("en-IN")} is ready. Ready now: ₹${Math.round(readyTotal).toLocaleString("en-IN")}.`, code: "BELOW_MIN_WITHDRAWAL" });
      }
      const nowIso = new Date(now).toISOString();
      let total = 0;
      for (const t of rows) {
        const { error: upErr } = await client.from("transactions").update({
          payout_requested: true,
          payout_request_count: (Number(t.payout_request_count) || 0) + 1,
          last_payout_requested_at: nowIso,
          updated_at: nowIso,
        }).eq("id", t.id).eq("creator_id", uid);
        if (upErr) { logIgnored("creatorPayoutRequests:update", upErr); continue; }
        total += Number(t.creator_net_amount) || 0;
      }
      lastByUser.set(uid, now);

      try {
        const { data: admins } = await client.from("users").select("user_id").eq("role", "admin");
        for (const a of admins || []) {
          await sendNotification(null, a.user_id, "admin_payout_alert", `💸 Payout request: ${user.name || "A creator"} asked for ₹${Math.round(total).toLocaleString("en-IN")} (${rows.length} approved deal${rows.length > 1 ? "s" : ""}).`);
        }
      } catch (e: any) { logIgnored("creatorPayoutRequests:notify", e); }

      return res.json({ ok: true, count: rows.length, amount: Math.round(total), message: "Payout requested. You'll get the UTR number once it's sent." });
    } catch (e: any) {
      console.error("[payout-request-ready]", e?.message || e);
      return res.status(500).json({ error: "Couldn't send the request. Please try again." });
    }
  });
}
