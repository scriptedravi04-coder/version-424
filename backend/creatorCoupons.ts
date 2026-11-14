// Session 36: creator coupons — an auto-apply launch offer, or a code the creator saved in Earnings.
// Applied ONCE, when the brand pays (persistEscrowPayment); the resulting fee is stamped on the
// transaction (see stampedFee.ts), and each funded deal adds one coupon_redemptions row.
// Brand coupons wait for Phase 2 (Option B), because today the fee is paid out of the creator's side.

const nowMs = () => Date.now();
function couponLive(c: any, at = nowMs()) {
  if (!c) return false;
  if (String(c.status || "active").toLowerCase() !== "active") return false;
  if (c.valid_from && Date.parse(c.valid_from) > at) return false;
  if (c.valid_until && Date.parse(c.valid_until) < at) return false;
  if (Number(c.usage_limit) > 0 && Number(c.used_count || 0) >= Number(c.usage_limit)) return false;
  const to = String(c.applies_to || "all").toLowerCase();
  return to === "all" || to === "creator" || to === "creators";
}
const perUserLimit = (c: any) => Number(c.applies_to_first_n_payouts) > 0 ? Number(c.applies_to_first_n_payouts) : (Number(c.per_user_limit) > 0 ? Number(c.per_user_limit) : 1);

/** Pure: pick the coupon for this creator. Saved code first, then the best auto-apply offer. */
export function pickCreatorCoupon(coupons: any[], redemptions: any[], creatorId: string, at = nowMs(), dealGross?: number) {
  const usedBy = (couponId: string) => redemptions.filter((r) => r.coupon_id === couponId && r.user_id === creatorId);
  const used = (c: any) => usedBy(c.id).reduce((n, r) => n + (Number(r.payouts_consumed) || 0), 0);
  const claimed = new Set(redemptions.filter((r) => r.user_id === creatorId).map((r) => r.coupon_id));
  // Session 58: the coupon's minimum deal value counts at payment too (it was only checked on the display screen).
  const minOk = (c: any) => !(Number(dealGross) > 0) || !(Number(c.min_campaign_value) > 0) || Number(dealGross) >= Number(c.min_campaign_value);
  const ok = (c: any) => couponLive(c, at) && used(c) < perUserLimit(c) && minOk(c);
  const saved = coupons.filter((c) => claimed.has(c.id) && ok(c));
  const auto = coupons.filter((c) => c.auto_apply === true && ok(c));
  const pool = saved.length ? saved : auto;
  if (!pool.length) return null;
  // best for the creator: zero fee first, then the lowest override rate, then the biggest flat discount
  const score = (c: any) => c.type === "zero_fee" ? -1 : (c.type === "fee_rate_override" || c.type === "override_fee_rate") ? Number(c.override_fee_rate ?? 100) : 100 - Number(c.discount_amount || 0) / 1000;
  const c = pool.sort((a, b) => score(a) - score(b))[0];
  return { ...c, _dealNumber: used(c) + 1, _dealsTotal: perUserLimit(c) };
}

export async function resolveCreatorCoupon(client: any, creatorId?: string | null, dealGross?: number) {
  if (!client || !creatorId) return null;
  let picked: any = null;
  try {
    const [{ data: coupons }, { data: reds }] = await Promise.all([
      client.from("coupons").select("*").eq("status", "active"),
      client.from("coupon_redemptions").select("coupon_id, user_id, payouts_consumed").eq("user_id", String(creatorId)),
    ]);
    picked = pickCreatorCoupon(coupons || [], reds || [], String(creatorId), nowMs(), dealGross);
  } catch { picked = null; }
  if (picked && picked.type === "zero_fee") return picked;
  // Session 36: referral reward — fee-free deals earned by inviting creators (referralProgram.ts)
  try {
    const { referralSummary, REFERRAL_FREE_DEAL_ID } = await import("./referralProgram");
    const s = await referralSummary({ supabase: client, privilegedSupabase: client, getDb: () => ({}) }, String(creatorId));
    if (s.fd.left > 0) {
      return { id: REFERRAL_FREE_DEAL_ID, code: "REFERRAL", type: "zero_fee", auto_apply: true, referral: true,
        _dealNumber: s.fd.total - s.fd.left + 1, _dealsTotal: s.fd.total, valid_until: s.fd.expires_at };
    }
  } catch { /* referral tables not there yet */ }
  return picked;
}

/** After a funded deal used a coupon: one redemption row per deal + the coupon's used_count. */
export async function recordCouponUse(client: any, coupon: any, info: { creatorId: string; dealId?: string | null; ugcOrderId?: string | null; discount: number }) {
  if (!client || !coupon?.id) return;
  if (coupon.id === "referral_free_deal") {
    const { referralData } = await import("./referralProgram");
    await referralData({ supabase: client, privilegedSupabase: client, getDb: () => ({}) }).recordFreeDealUse(info.creatorId, info.dealId, info.ugcOrderId);
    return;
  }
  try {
    await client.from("coupon_redemptions").insert([{
      coupon_id: coupon.id, user_id: info.creatorId, deal_id: info.dealId || null, ugc_order_id: info.ugcOrderId || null,
      discount_applied: Math.round(info.discount || 0), payouts_consumed: 1, redeemed_at: new Date().toISOString(),
    }]);
    // v378 (QA M3): +1 by compare-and-set — two payments at the same moment can't both write the same count
    // (the second one re-reads and tries again).
    for (let i = 0; i < 5; i++) {
      const { data } = await client.from("coupons").select("used_count").eq("id", coupon.id).maybeSingle();
      const cur = Number(data?.used_count || 0);
      let q = client.from("coupons").update({ used_count: cur + 1, updated_at: new Date().toISOString() }).eq("id", coupon.id);
      q = data?.used_count == null ? q.is("used_count", null) : q.eq("used_count", cur);
      const { data: done } = await q.select("id");
      if (!Array.isArray(done) || done.length > 0) break;
    }
  } catch (e: any) { console.warn("[coupon] could not record use:", e?.message || e); }
}

/** Creator saves a promo code once (Earnings). Stored as a claim row (payouts_consumed 0); it is
 *  then applied to their next funded deals, up to the coupon's "first N" limit. */
export function setupCreatorCouponRoutes(router: any, deps: { supabase: any; privilegedSupabase: any; parseAuthUser: (req: any) => Promise<any> }) {
  const client = () => deps.privilegedSupabase || deps.supabase;
  router.post("/creator/coupon", async (req: any, res: any) => {
    const user = await deps.parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Sign in first." });
    if (String(user.role || "").toLowerCase() !== "creator") return res.status(403).json({ error: "Promo codes here are for creators." });
    const code = String(req.body?.code || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ error: "Enter a promo code." });
    // v378 (QA M2): "%" / "_" matched any coupon through ilike and gave its real code away. Codes are letters, numbers,
    // "-" and "_" only, and the match is exact (case-insensitive, wildcards escaped).
    if (!/^[A-Z0-9_-]{2,40}$/.test(code)) return res.status(404).json({ error: "This code is not valid or has expired." });
    if (!client()) return res.status(503).json({ error: "Promo codes are not available right now." });
    const { data: list } = await client().from("coupons").select("*").ilike("code", code.replace(/[\\%_]/g, (m) => "\\" + m)).limit(1);
    const c = list?.[0];
    if (!c || !couponLive(c)) return res.status(404).json({ error: "This code is not valid or has expired." });
    const { data: mine } = await client().from("coupon_redemptions").select("coupon_id, user_id, payouts_consumed").eq("user_id", String(user.user_id)).eq("coupon_id", c.id);
    if ((mine || []).length === 0) {
      await client().from("coupon_redemptions").insert([{ coupon_id: c.id, user_id: String(user.user_id), payouts_consumed: 0, discount_applied: 0, redeemed_at: new Date().toISOString() }]);
    }
    const used = (mine || []).reduce((n: number, r: any) => n + (Number(r.payouts_consumed) || 0), 0);
    return res.json({ ok: true, code: c.code, type: c.type, override_fee_rate: c.override_fee_rate ?? null, deals_left: Math.max(0, perUserLimit(c) - used), valid_until: c.valid_until || null });
  });

  // What the creator has: saved code or auto offer, and how many deals are left.
  router.get("/creator/coupon", async (req: any, res: any) => {
    const user = await deps.parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Sign in first." });
    const c = await resolveCreatorCoupon(client(), user.user_id);
    if (!c) return res.json({ coupon: null });
    return res.json({ coupon: { code: c.auto_apply ? null : c.code, type: c.type, override_fee_rate: c.override_fee_rate ?? null, deal_number: c._dealNumber, deals_total: c._dealsTotal, valid_until: c.valid_until || null, auto: c.auto_apply === true } });
  });
}
