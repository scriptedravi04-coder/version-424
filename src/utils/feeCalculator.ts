import { SupabaseClient } from '@supabase/supabase-js';

export interface AppliedCoupon {
  id?: string;
  code?: string;
  type?: 'zero_fee' | 'fee_rate_override' | 'flat_discount' | string;
  override_fee_rate?: number;
  discount_amount?: number;
  value?: number;
  [key: string]: any;
}

export interface FeeOptions {
  /** v364: a coupon that lowers the BRAND fee (applies_to 'brand_fee'); only used when fee_model is 'split'. */
  brandCoupon?: AppliedCoupon | null;
  /** v364: config row already loaded by the caller (skips the DB read). */
  config?: any;
}

/** v364 (Ravi: "creator 0% till Diwali, brand 8% upar se, coupon se 4%"): is the split model on for this config row? */
export function isSplitFee(config: any): boolean {
  return String(config?.fee_model || "").toLowerCase() === "split";
}
const pctOr = (v: any, d: number) => (v != null && v !== "" && !isNaN(Number(v)) ? Math.max(0, Math.min(100, Number(v))) : d);

/** v364: the brand-side fee for a gross amount, with an optional brand-fee coupon. Pure. */
export function brandFeeFor(grossAmount: number, config: any, brandCoupon?: AppliedCoupon | null) {
  const gross = Math.max(0, Number(grossAmount) || 0);
  const basePct = pctOr(config?.brand_fee_pct, 0);
  let pct = basePct;
  let fee = Math.round((gross * pct) / 100);
  let couponDiscount = 0;
  let couponApplied: AppliedCoupon | undefined;
  if (brandCoupon && brandCoupon.type) {
    const t = String(brandCoupon.type);
    const before = fee;
    if (t === "zero_fee") { pct = 0; fee = 0; }
    else if (t === "fee_rate_override" || t === "override_fee_rate") {
      pct = Math.min(Math.max(0, Number(brandCoupon.override_fee_rate ?? brandCoupon.value ?? 0) || 0), basePct); // only LOWER
      fee = Math.round((gross * pct) / 100);
    } else if (t === "flat_discount") {
      const off = Math.max(0, Number(brandCoupon.discount_amount ?? brandCoupon.value ?? 0) || 0);
      fee = Math.max(0, fee - off);
      pct = gross > 0 ? Math.round((fee / gross) * 10000) / 100 : 0;
    }
    couponDiscount = Math.max(0, before - fee);
    couponApplied = brandCoupon;
  }
  const gstRate = config?.platform_gst_registered ? (Number(config?.gst_rate) || 18.0) / 100 : 0;
  const gst = Math.round(fee * gstRate);
  return { basePct, pct, fee, gst, couponDiscount, couponApplied, payable: Math.round(gross + fee + gst) };
}

export async function calculateFee(
  grossAmount: number,
  supabaseOrCoupon?: SupabaseClient | AppliedCoupon | null,
  appliedCouponParam?: AppliedCoupon | null,
  options?: FeeOptions
) {
  let supabase: SupabaseClient | undefined;
  let appliedCoupon: AppliedCoupon | undefined;

  if (supabaseOrCoupon && typeof (supabaseOrCoupon as any).from === 'function') {
    supabase = supabaseOrCoupon as SupabaseClient;
    appliedCoupon = appliedCouponParam || undefined;
  } else if (supabaseOrCoupon && typeof supabaseOrCoupon === 'object') {
    appliedCoupon = supabaseOrCoupon as AppliedCoupon;
  }

  let config: any = options?.config || null;
  if (!config && supabase) {
    try {
      const { data, error } = await supabase
        .from('platform_fee_config')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data) {
        config = data;
      }
    } catch (e) {
      console.warn("Fee config fetch warning, using standard tiered rule:", e);
    }
  }

  const threshold = (config?.threshold_amount != null && !isNaN(Number(config.threshold_amount))) ? Number(config.threshold_amount) : 20000;
  const belowRate = (config?.below_threshold_rate != null && !isNaN(Number(config.below_threshold_rate))) ? Number(config.below_threshold_rate) : 15.0;
  const aboveRate = (config?.above_threshold_rate != null && !isNaN(Number(config.above_threshold_rate))) ? Number(config.above_threshold_rate) : 5.0;

  let rate = grossAmount < threshold ? belowRate : aboveRate;

  let platformFee = Math.round((grossAmount * rate) / 100);
  let discountApplied = 0;

  // Session 36 (Ravi): "offer mode" — ₹0 platform fee + a small convenience fee (admin sets the %,
  // default 2%). Coupons do not stack on top of it. The fee a deal gets is stamped on its transaction
  // when the brand pays; payouts read that stamp (backend/stampedFee.ts), so switching the offer off
  // never changes a deal that was paid during it.
  const offerOn = config?.offer_mode === true;
  const offerPct = (config?.offer_fee_pct != null && !isNaN(Number(config.offer_fee_pct))) ? Math.max(0, Math.min(100, Number(config.offer_fee_pct))) : 2.0;
  if (offerOn) {
    const normalFee = platformFee;
    // v347 (Ravi approved): an offer can only LOWER the fee — a 10% offer on a ₹50,000 deal (normally 5%)
    // charged ₹5,000 instead of ₹2,500. When the normal fee is lower, the normal fee (and rate) stays.
    const offerFee = Math.round((grossAmount * offerPct) / 100);
    platformFee = Math.min(normalFee, offerFee);
    if (platformFee === offerFee) rate = offerPct;
    discountApplied = Math.max(0, normalFee - platformFee);
  }

  if (!offerOn && appliedCoupon && appliedCoupon.type) {
    const couponType = appliedCoupon.type;
    if (couponType === 'zero_fee') {
      rate = 0;
      discountApplied = platformFee;
      platformFee = 0;
    } else if (couponType === 'fee_rate_override' || couponType === 'override_fee_rate') {
      // Session 58: a coupon can only LOWER the fee, never below 0 (a negative rate paid the creator more than the
      // brand paid; a higher rate raised the fee).
      const originalRate = rate;
      const overrideRate = Math.min(Math.max(0, Number(appliedCoupon.override_fee_rate ?? appliedCoupon.value ?? 0) || 0), Number(originalRate) || 0);
      rate = overrideRate;
      const originalFee = platformFee;
      platformFee = Math.round((grossAmount * overrideRate) / 100);
      discountApplied = Math.max(0, originalFee - platformFee);
    } else if (couponType === 'flat_discount') {
      // v347 (Ravi approved): a negative ("-100") or non-numeric ("abc") discount is treated as 0 — it raised
      // the fee / turned the amounts into NaN. The fee never goes below 0.
      const flatDisc = Math.max(0, Number(appliedCoupon.discount_amount ?? appliedCoupon.value ?? 0) || 0);
      discountApplied = Math.min(platformFee, flatDisc);
      platformFee = Math.max(0, platformFee - flatDisc);
    }
  }

  // v364: split model — the creator's fee is creator_fee_pct (default 0, no tiers, no offer, no creator coupon) and the
  // brand pays brand_fee_pct ON TOP of the deal amount. platformFee / creatorNet below stay the CREATOR side, so the
  // stamped-fee payout rule (backend/stampedFee.ts) is unchanged. The brand side is returned separately.
  const split = isSplitFee(config);
  if (split) {
    rate = pctOr(config?.creator_fee_pct, 0);
    platformFee = Math.round((grossAmount * rate) / 100);
    discountApplied = 0;
  }

  const isGstRegistered = Boolean(config?.platform_gst_registered);
  const gstRate = isGstRegistered ? ((Number(config?.gst_rate) || 18.0) / 100) : 0;
  const gstAmount = Math.round(platformFee * gstRate);
  const creatorNet = Math.round(grossAmount - platformFee - gstAmount);

  const brand = split ? brandFeeFor(grossAmount, config, options?.brandCoupon) : { basePct: 0, pct: 0, fee: 0, gst: 0, couponDiscount: 0, couponApplied: undefined, payable: Math.round(grossAmount) };

  return {
    grossAmount,
    feePercent: rate,
    platformFee,
    gstAmount,
    creatorNet,
    discountApplied,
    appliedCoupon: split ? undefined : (offerOn ? undefined : appliedCoupon),
    feeKind: split ? 'split' : (offerOn ? 'convenience' : 'platform'),
    // v364: brand side (0 in the legacy model)
    feeModel: split ? 'split' : 'legacy',
    brandFeeBasePercent: brand.basePct,
    brandFeePercent: brand.pct,
    brandFee: brand.fee,
    brandFeeGst: brand.gst,
    brandCouponDiscount: brand.couponDiscount,
    brandCoupon: brand.couponApplied,
    brandPayable: brand.payable,
  };
}
