// Session 43 (v290, Ravi) — invite rewards on top of the session-36 referral programme.
//
//  1. Friend reward: a friend you invited (creator or brand) completes their profile 100%
//     → you get ₹21 and the friend gets ₹21 (welcome). Your friend rewards stop at ₹1,000 in total.
//     "100%" = basic details + KYC approved (+ for creators: photo, niche/bio, Instagram/YouTube,
//     rate card and at least one portfolio item).
//  2. Brand invite: a brand you invited funds its first deal / UGC order of ₹5,000 or more
//     → you get ₹500 (+ 7 days Featured if you are a creator), at most 10 brands (= up to ₹5,000).
//     This ₹500 stays LOCKED in your wallet until you have completed 2 deals yourself.
//     (The ₹21 rewards are never locked.)
//  All amounts / limits live in referral_config and are changed by the admin. Rewards are DERIVED
//  from referrals + profiles + deals (no hooks in the locked payment code), like session 36.
//  Wallet money is paid to the person's UPI by hand from Admin → Referrals → Withdrawals (with UTR).

export const INVITE_DEFAULTS = {
  friend_reward: 21,
  friend_reward_cap: 1000,
  brand_invite_reward: 500,
  brand_invite_max_brands: 10,
  brand_invite_min_deal: 5000,
  brand_invite_unlock_deals: 2,
  brand_invite_featured_days: 7,
};
export type InviteConfig = typeof INVITE_DEFAULTS;

export function normaliseInvite(row: any): InviteConfig {
  const n = (v: any, d: number, min = 0, max = 1e7) => { const x = Number(v); return Number.isFinite(x) && x >= min && x <= max ? x : d; };
  return {
    friend_reward: n(row?.friend_reward, INVITE_DEFAULTS.friend_reward, 0, 100000),
    friend_reward_cap: n(row?.friend_reward_cap, INVITE_DEFAULTS.friend_reward_cap, 0, 1e7),
    brand_invite_reward: n(row?.brand_invite_reward, INVITE_DEFAULTS.brand_invite_reward, 0, 1e6),
    brand_invite_max_brands: n(row?.brand_invite_max_brands, INVITE_DEFAULTS.brand_invite_max_brands, 0, 1000),
    brand_invite_min_deal: n(row?.brand_invite_min_deal, INVITE_DEFAULTS.brand_invite_min_deal, 0, 1e8),
    brand_invite_unlock_deals: n(row?.brand_invite_unlock_deals, INVITE_DEFAULTS.brand_invite_unlock_deals, 0, 100),
    brand_invite_featured_days: n(row?.brand_invite_featured_days, INVITE_DEFAULTS.brand_invite_featured_days, 0, 365),
  };
}

const U = (v: any) => String(v || "").toUpperCase();
const has = (v: any) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== "" && String(v) !== "0");
// Session 58: users has no kyc_* columns — the KYC row (creator_kyc / brand_kyc) decides.
export const kycApproved = (u: any, kycRow?: any) =>
  Boolean(u?.kyc_verified === true || ["approved", "verified"].includes(String(u?.kyc_status || kycRow?.status || "").toLowerCase()));

/** Is this account's profile 100%? */
export function profileComplete(user: any, profile: any, portfolioCount: number, kycRow?: any): boolean {
  if (!user || user.banned || user.is_deleted) return false;
  if (!kycApproved(user, kycRow)) return false;
  const p = profile || {};
  if (user.role === "brand") {
    return has(p.company_name) && has(p.logo || user.picture || user.photo) && has(p.industry || p.category);
  }
  const rc = p.rate_card || {};
  const rate = [p.rate_reel, p.reel_rate, p.rate_story, p.story_rate, p.rate_yt_video, p.youtube_video_rate, rc.reels, rc.reel, rc.stories, rc.story].some((v) => Number(v || 0) > 0) || p.barter_mode === true;
  const portfolio = portfolioCount > 0 || (Array.isArray(p.portfolio) && p.portfolio.length > 0);
  return has(p.photo || p.profile_photo_url || user.picture || user.photo) &&
    has(p.bio) && has(p.content_niches || p.primary_niche || p.category || p.niche || p.categories) &&
    has(p.instagram_handle || p.instagram || p.youtube || p.youtube_channel_url || p.ig_followers || p.followers_instagram) &&
    rate && portfolio;
}

/** Money a brand has put into a deal / UGC order (0 if it never reached the payment hold). */
export function fundedAmount(row: any, kind: "deal" | "order"): number {
  const amount = Number(row?.amount ?? row?.agreed_amount ?? row?.total_amount ?? row?.price ?? row?.budget ?? 0) || 0;
  const paid = kind === "deal"
    ? Boolean(row?.escrow_hold || row?.escrow_hold_at) || ["ESCROW_HELD", "PAID", "RELEASED", "COMPLETED"].includes(U(row?.payment_status)) || ["COMPLETED", "RELEASED"].includes(U(row?.status))
    : ["ESCROW_HELD", "PAID", "CAPTURED", "RELEASED", "COMPLETED"].includes(U(row?.payment_status)) || Boolean(row?.escrow_held_at || row?.escrow_hold) || U(row?.status) === "COMPLETED";
  const undone = ["REFUNDED", "CANCELLED", "CANCELED"].includes(U(row?.status)) || U(row?.payment_status) === "REFUNDED";
  return paid && !undone ? amount : 0;
}
export const isCompleted = (row: any) => ["COMPLETED", "RELEASED"].includes(U(row?.status)) || U(row?.payment_status) === "RELEASED";

/**
 * Pure: everything the wallet shows.
 *  friendsComplete: ids of my counted referrals whose profile is 100% (any role)
 *  brandQualified:  [{ id, at }] my referred brands whose first funded deal ≥ min (at = when)
 *  iAmComplete / iWasReferred: my own ₹21 welcome
 *  myCompletedDeals: deals I finished myself (unlock rule)
 */
export function inviteWallet(cfg: InviteConfig, x: {
  friendsComplete: string[]; brandQualified: { id: string; at: string }[]; iAmComplete: boolean; iWasReferred: boolean; myCompletedDeals: number;
}, now = Date.now()) {
  const friendCount = x.friendsComplete.length;
  const friendEarned = Math.min(cfg.friend_reward_cap, friendCount * cfg.friend_reward);
  const welcome = x.iAmComplete && x.iWasReferred ? cfg.friend_reward : 0;
  const brands = x.brandQualified.slice().sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(0, cfg.brand_invite_max_brands);
  const brandTotal = brands.length * cfg.brand_invite_reward;
  const unlocked = x.myCompletedDeals >= cfg.brand_invite_unlock_deals;
  const featuredUntil = cfg.brand_invite_featured_days > 0
    ? brands.map((b) => new Date(Date.parse(b.at) + cfg.brand_invite_featured_days * 86400e3).toISOString()).filter((t) => Date.parse(t) > now).sort().pop() || null
    : null;
  return {
    friend_count: friendCount, friend_earned: friendEarned, friend_cap_reached: friendEarned >= cfg.friend_reward_cap && cfg.friend_reward_cap > 0,
    welcome, brand_count: brands.length, brand_total: brandTotal, brand_unlocked: unlocked,
    deals_to_unlock: Math.max(0, cfg.brand_invite_unlock_deals - x.myCompletedDeals),
    available: friendEarned + welcome + (unlocked ? brandTotal : 0),
    locked: unlocked ? 0 : brandTotal,
    featured_until: featuredUntil,
  };
}

/** Loads what inviteWallet needs for one person. Missing tables / columns → treated as "not yet". */
export async function loadInviteFacts(c: any, getDb: () => any, userId: string, refs: any[], myReferral: any) {
  const safe = async <T>(fn: () => Promise<T>, fb: T): Promise<T> => { try { return await fn(); } catch { return fb; } };
  // v346: over-cap joins ("over_cap") are not counted, same as rejected ones.
  const counted = refs.filter((r) => !["rejected", "over_cap"].includes(String(r.status || "").toLowerCase()) && !String(r.referred_id).startsWith("waitlist:"));
  const ids = Array.from(new Set([...counted.map((r) => String(r.referred_id)), userId]));
  const db = getDb();
  const rows = async (table: string, col: string, vals: string[], local: any[] = []) => {
    if (!vals.length) return [] as any[];
    if (c) return safe(async () => (await c.from(table).select("*").in(col, vals)).data || [], [] as any[]);
    return (local || []).filter((r: any) => vals.includes(String(r[col])));
  };
  const users = await rows("users", "user_id", ids, db.users);
  const cps = await rows("creator_profiles", "user_id", ids, db.creator_profiles);
  const bps = await rows("brand_profiles", "user_id", ids, db.brand_profiles);
  const items = await rows("creator_portfolio_items", "creator_id", ids, db.creator_portfolio_items);
  const ckyc = await rows("creator_kyc", "creator_id", ids, db.creator_kyc);
  const bkyc = await rows("brand_kyc", "brand_id", ids, db.brand_kyc);
  const brandIds = counted.filter((r) => String(r.referred_type || "") === "brand" || users.find((u: any) => u.user_id === r.referred_id)?.role === "brand").map((r) => String(r.referred_id));
  const brandDeals = await rows("deals", "brand_id", brandIds, db.deals);
  const brandOrders = await rows("ugc_orders", "brand_id", brandIds, db.ugc_orders);
  const myDealsC = await rows("deals", "creator_id", [userId], db.deals);
  const myDealsB = await rows("deals", "brand_id", [userId], db.deals);
  const myOrdersB = await rows("ugc_orders", "brand_id", [userId], db.ugc_orders);
  const myOrdersC = await rows("ugc_orders", "creator_id", [userId], db.ugc_orders);

  const complete = (id: string) => {
    const u = users.find((x: any) => x.user_id === id);
    const prof = u?.role === "brand" ? bps.find((x: any) => x.user_id === id) : cps.find((x: any) => x.user_id === id);
    const kyc = u?.role === "brand" ? bkyc.find((x: any) => String(x.brand_id) === id) : ckyc.find((x: any) => String(x.creator_id) === id);
    return profileComplete(u, prof, items.filter((i: any) => String(i.creator_id) === id).length, kyc);
  };
  const cfgMin = (min: number) => brandIds.map((id) => {
    const funded = [
      ...brandDeals.filter((d: any) => String(d.brand_id) === id).map((d: any) => ({ amt: fundedAmount(d, "deal"), at: d.escrow_hold_at || d.updated_at || d.created_at })),
      ...brandOrders.filter((o: any) => String(o.brand_id) === id).map((o: any) => ({ amt: fundedAmount(o, "order"), at: o.escrow_held_at || o.updated_at || o.created_at })),
    ].filter((f) => f.amt >= min).sort((a, b) => String(a.at).localeCompare(String(b.at)));
    return funded.length ? { id, at: String(funded[0].at || new Date().toISOString()) } : null;
  }).filter(Boolean) as { id: string; at: string }[];
  const mineDone = [...myDealsC, ...myDealsB].filter(isCompleted).length + [...myOrdersB, ...myOrdersC].filter(isCompleted).length;
  return {
    friendsComplete: counted.map((r) => String(r.referred_id)).filter((id) => id !== userId && complete(id)),
    brandQualifiedFor: cfgMin,
    iAmComplete: complete(userId),
    iWasReferred: Boolean(myReferral && String(myReferral.status || "").toLowerCase() !== "rejected"),
    myCompletedDeals: mineDone,
  };
}
