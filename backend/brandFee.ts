// v364 (Ravi: "Creator fee 0% till Diwali, brand fee 8% upar se, coupon lage toh 4% — campaign aur UGC dono").
//
// One place for the BRAND side of the fee:
//   - loadFeeConfig(client)      platform_fee_config row (30 s cache) — fee_model 'split' | 'legacy',
//                                creator_fee_pct, brand_fee_pct, GST settings
//   - findBrandCoupon(...)       a code the brand typed, checked on the SERVER (active, dates, limits, min value,
//                                applies_to 'brand_fee')
//   - quoteBrandPayment(...)     what the brand pays: deal amount + brand fee (+ GST on it when registered)
//   - recordBrandCoupon(...)     coupon_redemptions row + used_count + 1, once per payment
// The creator side stays in src/utils/feeCalculator.ts (platform_fee_amount = creator fee, stamped at payment time).
import { calculateFee, isSplitFee } from "../src/utils/feeCalculator";
import { logIgnored } from "./logIgnored";

let cache: { at: number; row: any } | null = null;
let lastGood: any = null; // v388: the last config that was read successfully
export function __resetFeeConfigCache() { cache = null; lastGood = null; }

export async function loadFeeConfig(client: any, maxAgeMs = 30000): Promise<any> {
  if (cache && Date.now() - cache.at < maxAgeMs) return cache.row;
  let row: any = null;
  let failed = false;
  if (client) {
    try {
      const { data, error } = await client.from("platform_fee_config").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (error) failed = true; else if (data) row = data;
    } catch (e: any) { failed = true; logIgnored("brandFee:config", e); }
  }
  // v388 (QA: one Supabase hiccup while a brand paid cached "no config" for 30 s → old model: brand 0%, creator 15% stamped on the deal):
  // a FAILED read never replaces the last good config; it is retried after 3 s, and until then the last good row is used.
  if (failed && lastGood) { cache = { at: Date.now() - Math.max(0, maxAgeMs - 3000), row: lastGood }; return lastGood; }
  if (!failed && row) lastGood = row;
  cache = { at: failed ? Date.now() - Math.max(0, maxAgeMs - 3000) : Date.now(), row };
  return row;
}
/** Sync view of the last loaded config (for hot paths like rate-card markup). */
export const lastFeeConfig = () => cache?.row || null;
export const splitFeeOn = () => isSplitFee(cache?.row);

export const cleanCouponCode = (v: any) => String(v || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
export const isBrandFeeCoupon = (c: any) => String(c?.applies_to || "").toLowerCase() === "brand_fee";

/** Pure: why a coupon can't be used now ("" = usable). */
export function brandCouponProblem(c: any, opts: { gross: number; usedByThisBrand?: number; now?: number }): string {
  const now = opts.now ?? Date.now();
  if (!c) return "This coupon code doesn't exist.";
  if (!isBrandFeeCoupon(c)) return "This code isn't a brand coupon.";
  if (String(c.status || "").toLowerCase() !== "active") return "This coupon isn't active.";
  if (c.valid_from && Date.parse(c.valid_from) > now) return "This coupon hasn't started yet.";
  if (c.valid_until && Date.parse(c.valid_until) < now) return "This coupon has expired.";
  if (c.usage_limit != null && Number(c.usage_limit) > 0 && Number(c.used_count || 0) >= Number(c.usage_limit)) return "This coupon has been fully used.";
  if (c.per_user_limit != null && Number(c.per_user_limit) > 0 && Number(opts.usedByThisBrand || 0) >= Number(c.per_user_limit)) return "You've already used this coupon.";
  if (c.min_campaign_value != null && Number(c.min_campaign_value) > 0 && Number(opts.gross || 0) < Number(c.min_campaign_value)) return `This coupon works on deals of ₹${Number(c.min_campaign_value).toLocaleString("en-IN")} or more.`;
  return "";
}

export async function findBrandCoupon(client: any, code: any, brandId: string, gross: number): Promise<{ coupon: any | null; error: string; code: string }> {
  const clean = cleanCouponCode(code);
  if (!clean) return { coupon: null, error: "", code: "" };
  if (!client) return { coupon: null, error: "Coupons can't be checked right now.", code: clean };
  try {
    // v365: "_" is an ilike wildcard — escape it so DIWALI_4 can't match DIWALIX4
    const { data } = await client.from("coupons").select("*").ilike("code", clean.replace(/[\\%_]/g, (m) => `\\${m}`)).limit(1);
    const c = Array.isArray(data) ? data[0] : null;
    let used = 0;
    if (c?.id && brandId && c.per_user_limit) {
      const { count } = await client.from("coupon_redemptions").select("id", { count: "exact", head: true }).eq("coupon_id", c.id).eq("user_id", brandId);
      used = Number(count) || 0;
    }
    const problem = brandCouponProblem(c, { gross, usedByThisBrand: used });
    return problem ? { coupon: null, error: problem, code: clean } : { coupon: c, error: "", code: clean };
  } catch (e: any) {
    logIgnored("brandFee:coupon", e);
    return { coupon: null, error: "Coupons can't be checked right now.", code: clean };
  }
}

export type BrandQuote = {
  feeModel: "split" | "legacy";
  gross: number;
  creatorFeePercent: number; creatorFee: number; creatorNet: number;
  brandFeeBasePercent: number; brandFeePercent: number; brandFee: number; brandFeeGst: number;
  couponDiscount: number; couponCode: string | null; couponId: string | null; couponError: string;
  total: number;
};

/** What the brand pays for `gross` (deal amount or brief budget × slots). Never throws. */
export async function quoteBrandPayment(client: any, gross: number, opts: { brandId?: string; couponCode?: any } = {}): Promise<BrandQuote> {
  // v396 (QA M-4): read fresh for every quote — with the 30 s cache, a brand paying right after an admin fee change was
  // charged on the OLD model while the deal got stamped on the new one (calculateFee always reads fresh).
  const config = await loadFeeConfig(client, 0);
  const g = Math.max(0, Math.round(Number(gross) || 0));
  const split = isSplitFee(config);
  const found = split && opts.couponCode ? await findBrandCoupon(client, opts.couponCode, String(opts.brandId || ""), g) : { coupon: null, error: "", code: "" };
  const calc: any = await calculateFee(g, null, null, { config: config || {}, brandCoupon: found.coupon || null });
  return {
    feeModel: split ? "split" : "legacy",
    gross: g,
    creatorFeePercent: Number(calc.feePercent) || 0,
    creatorFee: Number(calc.platformFee) || 0,
    creatorNet: Number(calc.creatorNet) || 0,
    brandFeeBasePercent: Number(calc.brandFeeBasePercent) || 0,
    brandFeePercent: Number(calc.brandFeePercent) || 0,
    brandFee: Number(calc.brandFee) || 0,
    brandFeeGst: Number(calc.brandFeeGst) || 0,
    couponDiscount: Number(calc.brandCouponDiscount) || 0,
    couponCode: found.coupon ? found.code : null,
    couponId: found.coupon?.id || null,
    couponError: found.error || "",
    total: split ? Number(calc.brandPayable) || g : g,
  };
}

/** Razorpay order notes carry the quote so the payment can be checked and stamped later. */
export function quoteNotes(q: BrandQuote) {
  return {
    fee_model: q.feeModel, gross: String(q.gross), brand_fee_pct: String(q.brandFeePercent), brand_fee: String(q.brandFee),
    brand_fee_gst: String(q.brandFeeGst), brand_total: String(q.total), coupon_code: q.couponCode || "", coupon_id: q.couponId || "",
  };
}
/** Read back what quoteNotes wrote (null for orders made before v364). */
export function quoteFromNotes(notes: any) {
  if (!notes || notes.brand_total == null || notes.brand_total === "") return null;
  const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    feeModel: String(notes.fee_model || "legacy"), gross: n(notes.gross), brandFeePercent: n(notes.brand_fee_pct), brandFee: n(notes.brand_fee),
    brandFeeGst: n(notes.brand_fee_gst), total: n(notes.brand_total), couponCode: String(notes.coupon_code || "") || null, couponId: String(notes.coupon_id || "") || null,
  };
}

/** Transaction columns for the brand side (added 21 Oct 2026). */
export function brandStamp(q: { brandFeePercent: number; brandFee: number; brandFeeGst: number; total: number; couponCode: string | null } | null, paidRupees?: number) {
  if (!q) return {};
  return {
    brand_fee_pct: q.brandFeePercent, brand_fee_amount: q.brandFee, brand_fee_gst: q.brandFeeGst,
    brand_paid_amount: paidRupees && paidRupees > 0 ? Math.round(paidRupees) : q.total, coupon_code: q.couponCode || null,
  };
}

/** One redemption row + used_count + 1. Never throws. */
export async function recordBrandCoupon(client: any, couponId: string | null, brandId: string, refs: { dealId?: string | null; ugcOrderId?: string | null; campaignId?: string | null }, discount: number) {
  if (!client || !couponId) return;
  try {
    // v366: coupon_redemptions is unique per (coupon, brand) — a brand's 2nd use (per-brand limit > 1) only bumps used_count.
    const { error: insErr } = await client.from("coupon_redemptions").insert({ coupon_id: couponId, user_id: brandId || null, deal_id: refs.dealId || null, ugc_order_id: refs.ugcOrderId || null, campaign_id: refs.campaignId || null, discount_applied: Math.max(0, Math.round(discount || 0)), redeemed_at: new Date().toISOString() });
    if (insErr && String(insErr.code || "") !== "23505") logIgnored("brandFee:redeem-row", insErr);
    const { data } = await client.from("coupons").select("used_count").eq("id", couponId).maybeSingle();
    await client.from("coupons").update({ used_count: (Number(data?.used_count) || 0) + 1, updated_at: new Date().toISOString() }).eq("id", couponId);
  } catch (e: any) { logIgnored("brandFee:redeem", e); }
}

// ───────────── v366: atomic coupon use (Ravi: "do payments ek saath aaye toh dono aakhri coupon le lete hain — fix karo") ─────────────
// The database functions claim_coupon / confirm_coupon / release_coupon (migration v366_coupon_reservations) lock the
// coupon row while they count, so two brands paying at the same moment can't both take the last use:
//   claim   — when an order is created: checks status, dates, usage_limit (used + live holds) and the per-brand limit,
//             then holds one use for that order (expires after ttl minutes if the brand never pays).
//   confirm — when the payment is recorded: the hold becomes a use, used_count + 1 exactly once (idempotent).
// If the functions don't exist yet (code deployed before the migration) the old path is used (recordBrandCoupon).
const fnMissing = (err: any) => /PGRST202|42883|could not find the function|function .* does not exist/i.test(`${err?.code || ""} ${err?.message || ""}`);
const CLAIM_REASONS: Record<string, string> = {
  not_found: "This coupon code doesn't exist.",
  inactive: "This coupon isn't active.",
  not_started: "This coupon hasn't started yet.",
  expired: "This coupon has expired.",
  used_up: "This coupon has just been fully used.",
  brand_limit: "You've already used this coupon.",
};

export async function claimBrandCoupon(client: any, a: { couponId: string; brandId: string; orderId: string; discount?: number; ttlMinutes?: number }): Promise<{ ok: boolean; reason?: string; fallback?: boolean }> {
  if (!client?.rpc || !a.couponId || !a.orderId) return { ok: true, fallback: true };
  try {
    const { data, error } = await client.rpc("claim_coupon", {
      p_coupon_id: a.couponId, p_brand_id: a.brandId || null, p_order_id: a.orderId,
      p_ttl_minutes: a.ttlMinutes ?? 30, p_discount: Math.max(0, Math.round(Number(a.discount) || 0)),
    });
    if (error) {
      if (fnMissing(error)) return { ok: true, fallback: true };
      logIgnored("brandFee:claim", error);
      return { ok: false, reason: "Coupons can't be checked right now. Try again, or pay without the coupon." };
    }
    const r = typeof data === "string" ? JSON.parse(data) : data;
    if (r == null) return { ok: true, fallback: true }; // no answer (older DB / proxy) — the coupon was already checked; legacy path
    if (r?.ok) return { ok: true };
    return { ok: false, reason: CLAIM_REASONS[String(r?.reason || "")] || "This coupon can't be used right now." };
  } catch (e: any) {
    logIgnored("brandFee:claim", e);
    return { ok: false, reason: "Coupons can't be checked right now. Try again, or pay without the coupon." };
  }
}

export async function confirmBrandCoupon(client: any, a: { orderId: string; couponId: string | null; brandId: string; dealId?: string | null; ugcOrderId?: string | null; campaignId?: string | null; discount?: number }): Promise<{ ok: boolean; via: "rpc" | "legacy" | "none" }> {
  if (!client || !a.couponId) return { ok: false, via: "none" };
  if (client.rpc && a.orderId) {
    try {
      const { data, error } = await client.rpc("confirm_coupon", {
        p_order_id: a.orderId, p_coupon_id: a.couponId, p_brand_id: a.brandId || null,
        p_deal_id: a.dealId || null, p_ugc_order_id: a.ugcOrderId || null, p_campaign_id: a.campaignId || null,
        p_discount: Math.max(0, Math.round(Number(a.discount) || 0)),
      });
      if (!error) {
        const r = typeof data === "string" ? JSON.parse(data) : data;
        if (r?.ok) return { ok: true, via: "rpc" };
      } else if (!fnMissing(error)) {
        logIgnored("brandFee:confirm", error);
        return { ok: false, via: "rpc" };
      }
    } catch (e: any) { logIgnored("brandFee:confirm", e); return { ok: false, via: "rpc" }; }
  }
  await recordBrandCoupon(client, a.couponId, a.brandId, { dealId: a.dealId, ugcOrderId: a.ugcOrderId, campaignId: a.campaignId }, Number(a.discount) || 0);
  return { ok: true, via: "legacy" };
}
