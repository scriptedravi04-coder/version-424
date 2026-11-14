// v348 (Ravi: "refund karte waqt mujhe manually option de — kitna brand ko, kitna creator ko, meri
// convenience fee 5% / 2% / 1% ya kuch nahi, ya aadha aadha. Tu decide mat kar.")
//
// Admin → Escrow → "Settle manually" on a campaign / invite deal payment. The admin decides the whole
// split of the money the brand paid (gross_amount):
//   brand gets back  B   (sent by hand to the brand's refund UPI / bank, UTR typed in)
//   creator gets     C   (sent by hand to the creator's payout UPI / bank, UTR typed in)
//   Ybex keeps       K   (convenience fee — any % or ₹, can be 0)
//   B + C + K must equal what the brand paid. Nothing is pre-chosen; the app never decides the split.
//
// One save records everything on the payment row (no new table / column — AGENTS.md "no DB changes"):
//   refund_*            = the brand part (PROCESSED + UTR)            — when B > 0
//   payout_*            = the creator part (PAID + UTR)               — when C > 0
//   platform_fee_amount = K, gst_amount = 0, correct_fee_amount = K
//   creator_net_amount  = C       → the creator's Earnings / payout card show what they really got.
//   A later "Release payout" on the same row is refused by the locked route: C > 0 → already PAID;
//   C = 0 with a brand refund → "Nothing left after the refund"; C = 0 and B = 0 (Ybex keeps it all)
//   → payout_reference "NO-PAYOUT" so it counts as closed.
//   notes               = JSON record of the split + the ORIGINAL fee / GST / net (audit), reason, note
//   fee_correction_note = one readable line of the same.
// The locked payment_routes.ts is NOT changed. UGC orders keep their own UGC Refunds queue (rules 51–52).
import express from "express";
import { isBriefDeposit, isFunded, isPaidOut, pickPayoutAccount } from "./adminMoney";
import { getCreatorKycStatus } from "./creatorKyc";
import { readKycPayoutAccount } from "./kycPayoutMethod";
import { readRiskControls } from "./riskControls";
import { logIgnored } from "./logIgnored";

const up = (v: any) => String(v ?? "").trim().toUpperCase();
const str = (v: any) => (v === undefined || v === null ? "" : String(v).trim());
const toPaise = (v: any) => Math.round((Number(v) || 0) * 100);
const fromPaise = (p: number) => Math.round(p) / 100;
const inr = (n: any) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const UTR_RE = /^[A-Za-z0-9/_ .-]{6,40}$/;
export const SETTLEMENT_TAG = "ybex_manual_settlement";

export type SettlementInput = {
  brand_amount: number;
  creator_amount: number;
  ybex_amount: number;
  ybex_percent?: number | null;
  reason: string;
  note?: string;
  brand_utr?: string;
  creator_utr?: string;
};

type Problem = { status: number; code: string; error: string };

/** Why this payment can't be settled here (or null). Pure. */
export function settlementBlock(tx: any): Problem | null {
  if (!tx) return { status: 404, code: "TX_NOT_FOUND", error: "Payment not found. Refresh the list and try again." };
  if (isBriefDeposit(tx) || tx.ugc_order_id || !tx.deal_id) {
    return { status: 409, code: "NOT_A_DEAL", error: "Only campaign / invite deal payments can be settled here. UGC money goes through Admin → Escrow → UGC Refunds." };
  }
  if (readSettlement(tx)) return { status: 409, code: "ALREADY_SETTLED", error: "This payment is already settled." };
  if (isPaidOut(tx)) return { status: 409, code: "ALREADY_PAID_OUT", error: "The creator was already paid for this deal, so it can't be settled again." };
  if (up(tx.refund_status) === "PROCESSED" || up(tx.status) === "REFUNDED" || up(tx.payout_status) === "REFUNDED") {
    return { status: 409, code: "ALREADY_REFUNDED", error: "A refund for this payment is already marked sent." };
  }
  if (!isFunded(tx) && up(tx.status) !== "REFUND_PENDING") {
    return { status: 409, code: "NOT_FUNDED", error: "The brand's payment for this deal hasn't been received, so there is nothing to settle." };
  }
  if (!(Number(tx.gross_amount) > 0)) return { status: 409, code: "NO_AMOUNT", error: "The paid amount for this deal is unknown — check the payment first." };
  return null;
}

/** Checks the admin's split. Returns { problem } or { clean } (amounts rounded to paise). Pure. */
export function validateSettlement(tx: any, body: any): { problem?: Problem; clean?: SettlementInput } {
  const bad = (error: string, code = "BAD_INPUT"): { problem: Problem } => ({ problem: { status: 400, code, error } });
  const nums = ["brand_amount", "creator_amount", "ybex_amount"].map((k) => body?.[k]);
  if (nums.some((n) => n === "" || n === null || n === undefined || !Number.isFinite(Number(n)))) return bad("Fill all three amounts (brand, creator, Ybex). Use 0 for nobody.");
  const [b, c, k] = nums.map(toPaise);
  if (b < 0 || c < 0 || k < 0) return bad("Amounts can't be negative.");
  const gross = toPaise(tx?.gross_amount);
  if (b + c + k !== gross) {
    return bad(`Brand + creator + Ybex must add up to ${inr(fromPaise(gross))} (now ${inr(fromPaise(b + c + k))}).`, "SPLIT_MISMATCH");
  }
  const reason = str(body?.reason);
  if (reason.length < 3) return bad("Write the reason for this refund / settlement.");
  if (reason.length > 300) return bad("Reason is too long (300 characters max).");
  const note = str(body?.note);
  if (note.length > 500) return bad("Note is too long (500 characters max).");
  const brandUtr = str(body?.brand_utr).toUpperCase();
  const creatorUtr = str(body?.creator_utr).toUpperCase();
  if (b > 0 && !UTR_RE.test(brandUtr)) return bad("Enter the UTR of the money you sent to the brand (6–40 letters / numbers).");
  if (c > 0 && !UTR_RE.test(creatorUtr)) return bad("Enter the UTR of the money you sent to the creator (6–40 letters / numbers).");
  const pct = body?.ybex_percent === null || body?.ybex_percent === undefined || body?.ybex_percent === "" ? null : Number(body.ybex_percent);
  return {
    clean: {
      brand_amount: fromPaise(b),
      creator_amount: fromPaise(c),
      ybex_amount: fromPaise(k),
      ybex_percent: pct !== null && Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : null,
      reason,
      note: note || undefined,
      brand_utr: b > 0 ? brandUtr : undefined,
      creator_utr: c > 0 ? creatorUtr : undefined,
    },
  };
}

/** The settlement saved on a payment row (or null). Pure. */
export function readSettlement(tx: any): any | null {
  const raw = tx?.notes;
  if (!raw || typeof raw !== "string" || !raw.includes(SETTLEMENT_TAG)) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed[SETTLEMENT_TAG] ? parsed[SETTLEMENT_TAG] : null;
  } catch { return null; }
}

/** The one readable line (fee_correction_note / admin log / notification text). Pure. */
export function settlementLine(s: SettlementInput): string {
  const pct = s.ybex_percent !== null && s.ybex_percent !== undefined ? ` (${s.ybex_percent}%)` : "";
  return `Manual settlement: brand ${inr(s.brand_amount)}, creator ${inr(s.creator_amount)}, Ybex fee ${inr(s.ybex_amount)}${pct}. Reason: ${s.reason}`;
}

/** The update for the transactions row. Pure. */
export function settlementUpdate(tx: any, s: SettlementInput, adminId: string, nowIso: string) {
  const gross = toPaise(tx.gross_amount);
  const b = toPaise(s.brand_amount), c = toPaise(s.creator_amount);
  const fullRefund = b >= gross;
  const record = {
    [SETTLEMENT_TAG]: {
      ...s,
      gross_amount: fromPaise(gross),
      original: {
        platform_fee_amount: Number(tx.platform_fee_amount) || 0,
        gst_amount: Number(tx.gst_amount) || 0,
        creator_net_amount: Number(tx.creator_net_amount) || 0,
        status: tx.status ?? null, payout_status: tx.payout_status ?? null, refund_status: tx.refund_status ?? null,
        notes: tx.notes || null,
      },
      settled_by: adminId,
      settled_at: nowIso,
    },
  };
  const update: any = {
    platform_fee_amount: s.ybex_amount,
    gst_amount: 0,
    correct_fee_amount: s.ybex_amount,
    creator_net_amount: fromPaise(c),
    fee_correction_note: settlementLine(s),
    notes: JSON.stringify(record),
    escrow_hold: false,
    updated_at: nowIso,
    status: fullRefund ? "REFUNDED" : c > 0 ? "SUCCESS" : "PROCESSED",
    payout_status: fullRefund ? "REFUNDED" : c > 0 ? "PAID" : "CANCELLED",
  };
  if (b > 0) {
    Object.assign(update, {
      refund_amount: s.brand_amount, refund_status: "PROCESSED", refund_reason: s.reason,
      refund_reference: s.brand_utr, refunded_at: nowIso, refunded_by: adminId,
    });
  } else {
    // an earlier "pending refund" is replaced by this decision
    Object.assign(update, { refund_amount: 0, refund_status: "NONE" });
  }
  if (c === 0 && b === 0) update.payout_reference = "NO-PAYOUT"; // nothing to brand or creator: closed, never paid later
  if (c > 0) {
    Object.assign(update, {
      payout_reference: s.creator_utr, payout_completed_at: nowIso, payout_completed_by: adminId,
      admin_action_note: s.note ? `${s.reason} — ${s.note}` : s.reason, admin_action_by: adminId,
    });
  }
  return update;
}

/** "upi://pay" link for a QR (pa, pn, am, tn). Pure; null when there is no valid UPI. */
export function upiPayLink(upi: any, name: any, amount: number, note: string): string | null {
  const pa = str(upi);
  if (!/^[\w.\-]{2,256}@[A-Za-z][\w.\-]{1,64}$/.test(pa) || !(amount > 0)) return null;
  const q = new URLSearchParams({ pa, pn: str(name).slice(0, 50) || "Ybex", am: (Math.round(amount * 100) / 100).toFixed(2), cu: "INR", tn: str(note).slice(0, 50) });
  return `upi://pay?${q.toString()}`;
}

type Deps = {
  supabase: any;
  privilegedSupabase: any;
  getDb: () => any;
  parseAuthUser: (req: express.Request) => Promise<any>;
  sendNotification: (db: any, userId: any, type: any, message: any) => Promise<any>;
  logAdminAction?: (user: any, action: string, targetType: string, targetId: string, detail: any) => Promise<any>;
};

const isAdmin = (u: any) => u && (u.role === "admin" || u.role === "sub_admin" || u.team_role === "sub_admin");

export function setupManualSettlementRoutes(router: express.Router, deps: Deps) {
  const client = () => deps.privilegedSupabase || deps.supabase;

  async function loadTx(id: string) {
    if (!client()) {
      const row = (deps.getDb().transactions || []).find((t: any) => String(t.id) === id) || null;
      return { tx: row, error: null };
    }
    const { data, error } = await client().from("transactions").select("*").eq("id", id).maybeSingle();
    return { tx: data || null, error };
  }

  async function partiesFor(tx: any) {
    let brandId = str(tx.brand_id), creatorId = str(tx.creator_id), title = "";
    if (client() && tx.deal_id) {
      const { data: deal } = await client().from("deals").select("brand_id, creator_id, campaign_id").eq("id", tx.deal_id).maybeSingle();
      if (deal) {
        brandId = brandId || str(deal.brand_id);
        creatorId = creatorId || str(deal.creator_id);
        if (deal.campaign_id) {
          const { data: camp } = await client().from("campaigns").select("title").eq("campaign_id", deal.campaign_id).maybeSingle();
          title = str(camp?.title);
        }
      }
    }
    return { brandId, creatorId, title };
  }

  // Everything the settle sheet needs: amounts, both people, where to send each part.
  router.get("/admin/settlements/:txId", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ error: "Admin only" });
    const id = String(req.params.txId || "");
    if (!SAFE_ID.test(id)) return res.status(400).json({ error: "Invalid payment id." });
    const { tx, error } = await loadTx(id);
    if (error) return res.status(502).json({ error: "Couldn't load this payment. Please try again." });
    if (!tx) return res.status(404).json({ error: "Payment not found." });
    const { brandId, creatorId, title } = await partiesFor(tx);

    let brandName = "Brand", creatorName = "Creator", brandAccount: any = null, creatorAccount: any = null, kyc = "UNKNOWN";
    if (client()) {
      try {
        const ids = [brandId, creatorId].filter(Boolean);
        const [{ data: users }, { data: bp }, { data: cp }, { data: ra }, { data: methods }] = await Promise.all([
          ids.length ? client().from("users").select("user_id, name").in("user_id", ids) : Promise.resolve({ data: [] }),
          brandId ? client().from("brand_profiles").select("user_id, company_name").eq("user_id", brandId).maybeSingle() : Promise.resolve({ data: null }),
          creatorId ? client().from("creator_profiles").select("*").eq("user_id", creatorId).maybeSingle() : Promise.resolve({ data: null }),
          brandId ? client().from("brand_refund_accounts").select("*").eq("brand_id", brandId).maybeSingle() : Promise.resolve({ data: null }),
          creatorId ? client().from("creator_payment_methods").select("*").eq("user_id", creatorId) : Promise.resolve({ data: [] }),
        ]);
        const uname = (uid: string) => str((users || []).find((u: any) => u.user_id === uid)?.name);
        brandName = str(bp?.company_name) || uname(brandId) || "Brand";
        creatorName = str(cp?.name) || uname(creatorId) || "Creator";
        if (ra) brandAccount = {
          method_type: ra.method_type || (ra.upi_id ? "UPI" : "BANK"), upi_id: ra.upi_id || null,
          bank_account_number: ra.bank_account_number || null, bank_ifsc: ra.bank_ifsc || null, account_holder_name: ra.account_holder_name || null,
        };
        const list = Array.isArray(methods) ? methods : [];
        const method = list.find((m: any) => m.is_default) || list[0] || null;
        if (method && (method.upi_id || method.bank_account_number)) {
          const p = pickPayoutAccount(method, cp, null);
          creatorAccount = p ? { method_type: p.upi_id ? "UPI" : "BANK", upi_id: p.upi_id, bank_account_number: p.account_number, bank_ifsc: p.ifsc_code, account_holder_name: p.account_holder_name, source: "saved" } : null;
        }
        if (!creatorAccount && creatorId) {
          const { account } = await readKycPayoutAccount(client(), null, creatorId);
          if (account) creatorAccount = { ...account, source: "kyc" };
        }
        if (creatorId) kyc = await getCreatorKycStatus(client(), null, creatorId);
      } catch (e: any) { logIgnored("manualSettlement:get", e); }
    }

    const block = settlementBlock(tx);
    return res.json({
      transaction: {
        id: tx.id, deal_id: tx.deal_id || null, gross_amount: Number(tx.gross_amount) || 0,
        platform_fee_amount: Number(tx.platform_fee_amount) || 0, gst_amount: Number(tx.gst_amount) || 0,
        creator_net_amount: Number(tx.creator_net_amount) || 0, status: tx.status || null,
        refund_status: tx.refund_status || null, payout_status: tx.payout_status || null, created_at: tx.created_at || null,
      },
      title, brand: { id: brandId || null, name: brandName, account: brandAccount },
      creator: { id: creatorId || null, name: creatorName, account: creatorAccount, kyc_status: kyc },
      settlement: readSettlement(tx),
      can_settle: !block, blocked_reason: block?.error || null,
    });
  });

  // Save the admin's decision (after the money was sent by hand).
  router.post("/admin/settlements/:txId", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ error: "Admin only" });
    const id = String(req.params.txId || "");
    if (!SAFE_ID.test(id)) return res.status(400).json({ error: "Invalid payment id." });
    const { tx, error } = await loadTx(id);
    if (error) return res.status(502).json({ error: "Couldn't load this payment. Nothing was saved — try again." });
    const block = settlementBlock(tx);
    if (block) return res.status(block.status).json({ error: block.error, code: block.code });
    const { problem, clean } = validateSettlement(tx, req.body);
    if (problem || !clean) return res.status(problem!.status).json({ error: problem!.error, code: problem!.code });

    const { brandId, creatorId } = await partiesFor(tx);
    if (clean.creator_amount > 0) {
      if (!creatorId) return res.status(409).json({ error: "No creator is linked to this payment, so nothing can be paid to a creator.", code: "NO_CREATOR" });
      if ((await readRiskControls(client())).payoutFreezeAll) {
        return res.status(409).json({ error: "All payouts are frozen in Fees & Risk settings. Turn the freeze off, or give the creator ₹0.", code: "PAYOUTS_FROZEN" });
      }
      const kyc = await getCreatorKycStatus(client(), client() ? null : deps.getDb(), creatorId);
      if (kyc === "UNKNOWN") return res.status(502).json({ error: "Couldn't check the creator's KYC. Nothing was saved — try again.", code: "KYC_CHECK_FAILED" });
      if (kyc !== "APPROVED") return res.status(409).json({ error: "The creator's KYC isn't approved, so a creator payout can't be recorded. Approve KYC first, or give the creator ₹0.", code: "KYC_REQUIRED" });
    }
    if (clean.brand_amount > 0 && !brandId) return res.status(409).json({ error: "No brand is linked to this payment.", code: "NO_BRAND" });

    const nowIso = new Date().toISOString();
    const adminId = String(user.user_id || user.id || "admin");
    const update = settlementUpdate(tx, clean, adminId, nowIso);

    if (client()) {
      // compare-and-set: only if the row is still exactly as checked (two admins / a double tap)
      let q = client().from("transactions").update(update).eq("id", tx.id).eq("status", tx.status);
      q = tx.payout_status == null ? q.is("payout_status", null) : q.eq("payout_status", tx.payout_status);
      q = tx.refund_status == null ? q.is("refund_status", null) : q.eq("refund_status", tx.refund_status);
      const { data: saved, error: upErr } = await q.select("id");
      if (upErr) {
        console.error("[manualSettlement] save failed:", upErr.message || upErr);
        return res.status(502).json({ error: "Couldn't save the settlement. Nothing was changed — try again." });
      }
      if (!saved || saved.length === 0) return res.status(409).json({ error: "This payment changed while you were saving. Refresh and check.", code: "TX_CHANGED" });
      try {
        await client().from("deals").update({ escrow_hold: false, updated_at: nowIso }).eq("id", tx.deal_id);
      } catch (e: any) { logIgnored("manualSettlement:deal", e); }
      if (clean.creator_amount > 0) {
        try {
          await client().from("payout_requests").update({ status: "PAID", utr_number: clean.creator_utr, updated_at: nowIso }).eq("deal_id", tx.deal_id);
        } catch (e: any) { logIgnored("manualSettlement:payout_requests", e); }
      }
    } else {
      const db = deps.getDb();
      const row = (db.transactions || []).find((t: any) => String(t.id) === String(tx.id));
      if (row) Object.assign(row, update);
    }

    const extra = clean.note ? ` Note: ${clean.note}` : "";
    try {
      if (brandId) {
        await deps.sendNotification(null, brandId, clean.brand_amount > 0 ? "refund_processed" : "deal_settled",
          clean.brand_amount > 0
            ? `Ybex sent you a refund of ${inr(clean.brand_amount)} for this deal (UTR ${clean.brand_utr}). It can take 1–2 working days to show. Reason: ${clean.reason}.${extra}`
            : `Ybex closed the payment for this deal. Reason: ${clean.reason}.${extra}`);
      }
      if (creatorId) {
        await deps.sendNotification(null, creatorId, clean.creator_amount > 0 ? "payout_released" : "deal_settled",
          clean.creator_amount > 0
            ? `Ybex sent you ${inr(clean.creator_amount)} for this deal (UTR ${clean.creator_utr}). Reason: ${clean.reason}.${extra}`
            : `Ybex closed the payment for this deal with no payout to you. Reason: ${clean.reason}.${extra}`);
      }
    } catch (e: any) { logIgnored("manualSettlement:notify", e); }

    try {
      await deps.logAdminAction?.(user, "MANUAL_SETTLEMENT", "TRANSACTION", String(tx.id), { ...clean, gross_amount: Number(tx.gross_amount) || 0 });
    } catch (e: any) { logIgnored("manualSettlement:log", e); }

    return res.json({ success: true, message: settlementLine(clean), settlement: readSettlement({ notes: update.notes }) });
  });
}
