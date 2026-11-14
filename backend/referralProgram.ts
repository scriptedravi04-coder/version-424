// Session 36 (Ravi): creator referral programme — the main way to fill Ybex with creators.
//
// A creator shares ybexmedia.in/r/<CODE>. Whoever joins through it (account sign-up OR the /apply form)
// counts as a "join" for the referrer. Rewards, all set by the admin (referral_config, defaults below):
//   1. Fee-free deals — every 3 joins → the referrer's next 2 funded deals at 0% fee (valid 180 days).
//      Used through the normal coupon path (creatorCoupons.ts) and stamped on the deal at payment.
//   2. Featured — 7 days at the top of brand search ("Featured" label) after each 3 joins.
//   3. A share of what the friend earns (Session 39, Ravi): 0.2% of what each referred creator
//      RECEIVED on PAID deals (after the Ybex fee), at most ₹2,000 per referred creator. Paid by Ybex,
//      never taken from the referred creator. (Before session 39: 20% of the Ybex fee.)
// Rewards are DERIVED from referrals + transactions (no hooks in the locked payment code).
// Fraud guards: no self-referral (same id / email / phone), only new accounts (≤ 7 days old), one
// referrer per person, monthly cap per referrer, admin can reject a referral.
import express from "express";
import crypto from "crypto";
import { INVITE_DEFAULTS, normaliseInvite, inviteWallet, loadInviteFacts } from "./inviteRewards";

export const DEFAULTS = {
  signups_per_reward: 3,
  free_deals_per_reward: 2,
  free_deals_valid_days: 180,
  featured_days: 7,
  share_pct_of_fee: 20, // old rule, kept only so old config rows still read
  share_pct_of_earnings: 0.2,
  share_cap_per_creator: 2000,
  min_withdraw: 11, // v290 (Ravi): ₹11 — admin can change it
  monthly_cap_per_user: 20,
  attribution_days: 30,
  is_active: true,
};
export type ReferralConfig = typeof DEFAULTS & typeof INVITE_DEFAULTS;
export const REFERRAL_FREE_DEAL_ID = "referral_free_deal";
const DAY = 24 * 3600 * 1000;
// Session 58: RELEASED = brand approved, not yet paid to the creator (can still be refunded) → not counted.
const PAID = ["PAID", "COMPLETED", "DISBURSED"];

export function referralCodeForId(userId: string) {
  const id = String(userId || "").replace(/-/g, "");
  return id ? `YBEX-${id.slice(0, 8).toUpperCase()}` : "";
}

export function normaliseConfig(row: any): ReferralConfig {
  const n = (v: any, d: number, min = 0, max = 1e9) => { const x = Number(v); return Number.isFinite(x) && x >= min && x <= max ? x : d; };
  return {
    signups_per_reward: n(row?.signups_per_reward, DEFAULTS.signups_per_reward, 1, 100),
    free_deals_per_reward: n(row?.free_deals_per_reward, DEFAULTS.free_deals_per_reward, 0, 50),
    free_deals_valid_days: n(row?.free_deals_valid_days, DEFAULTS.free_deals_valid_days, 1, 3650),
    featured_days: n(row?.featured_days, DEFAULTS.featured_days, 0, 365),
    share_pct_of_fee: n(row?.share_pct_of_fee, DEFAULTS.share_pct_of_fee, 0, 100),
    share_pct_of_earnings: n(row?.share_pct_of_earnings, DEFAULTS.share_pct_of_earnings, 0, 100),
    share_cap_per_creator: n(row?.share_cap_per_creator, DEFAULTS.share_cap_per_creator, 0, 1e7),
    min_withdraw: n(row?.min_withdraw, DEFAULTS.min_withdraw, 0, 1e6),
    monthly_cap_per_user: n(row?.monthly_cap_per_user, DEFAULTS.monthly_cap_per_user, 1, 10000),
    attribution_days: n(row?.attribution_days, DEFAULTS.attribution_days, 1, 365),
    is_active: row?.is_active === false ? false : true,
    ...normaliseInvite(row), // v290: ₹21 friend reward, ₹500 brand invite (inviteRewards.ts)
  };
}

// v346: joins over the monthly cap ("over_cap") never earn rewards — the cap was only cosmetic before.
const NOT_COUNTED = ["rejected", "over_cap"];
const counts = (r: any) => !NOT_COUNTED.includes(String(r?.status || "joined").toLowerCase());

/** Pure: reward blocks from a referrer's referrals (oldest first). */
export function rewardBlocks(referrals: any[], cfg: ReferralConfig) {
  const ok = referrals.filter(counts).slice().sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const blocks: Array<{ completed_at: string; free_deals: number; expires_at: string; featured_until: string }> = [];
  for (let i = cfg.signups_per_reward - 1; i < ok.length; i += cfg.signups_per_reward) {
    const at = Date.parse(ok[i].created_at) || Date.now();
    blocks.push({
      completed_at: new Date(at).toISOString(),
      free_deals: cfg.free_deals_per_reward,
      expires_at: new Date(at + cfg.free_deals_valid_days * DAY).toISOString(),
      featured_until: new Date(at + cfg.featured_days * DAY).toISOString(),
    });
  }
  return { joined: ok.length, blocks, to_next: cfg.signups_per_reward - (ok.length % cfg.signups_per_reward) };
}

/** Pure: free deals still usable now.
 *  `used` may be a plain count (old behaviour: spent oldest-block-first) or — v346 — the list of uses
 *  with their created_at: each use is then spent on the oldest block that was LIVE when it was made
 *  (completed_at <= use < expires_at), so a block that expired unused can no longer "absorb" a later
 *  use and hand out an extra 0%-fee deal. A use with no date (or made when no block was live) is
 *  charged to the block still live now that expires first — the cautious choice. */
export function freeDealsLeft(blocks: ReturnType<typeof rewardBlocks>["blocks"], usedCount: number | Array<{ created_at?: string | null }>, now = Date.now()) {
  const rem = blocks.map((b) => b.free_deals);
  if (Array.isArray(usedCount)) {
    const t = (u: any) => Date.parse(String(u?.created_at || ""));
    const dated = usedCount.filter((u) => Number.isFinite(t(u))).sort((a, b) => t(a) - t(b));
    const undated = usedCount.length - dated.length;
    const chargeLiveNow = () => {
      let best = -1;
      blocks.forEach((b, i) => {
        if (rem[i] > 0 && Date.parse(b.expires_at) > now && (best < 0 || b.expires_at < blocks[best].expires_at)) best = i;
      });
      if (best < 0) best = rem.findIndex((r) => r > 0);
      if (best >= 0) rem[best] -= 1;
    };
    for (const u of dated) {
      const at = t(u);
      const i = blocks.findIndex((b, k) => rem[k] > 0 && (Date.parse(b.completed_at) || 0) <= at && at < Date.parse(b.expires_at));
      if (i >= 0) rem[i] -= 1; else chargeLiveNow();
    }
    for (let k = 0; k < undated; k++) chargeLiveNow();
  } else {
    let used = Math.max(0, Number(usedCount) || 0);
    if (!Number.isFinite(Number(usedCount))) used = Infinity; // v346: unknown uses → nothing left (fail closed)
    for (let i = 0; i < blocks.length; i++) { const take = Math.min(used, rem[i]); used -= take; rem[i] -= take; }
  }
  let left = 0, total = 0, soonest: string | null = null;
  blocks.forEach((b, i) => {
    if (rem[i] > 0 && Date.parse(b.expires_at) > now) {
      left += rem[i]; total += b.free_deals;
      if (!soonest || b.expires_at < soonest) soonest = b.expires_at;
    }
  });
  return { left, total, expires_at: soonest };
}

/** Pure: cash share. netByCreator = what each referred creator received (after the Ybex fee) on PAID deals. */
export function shareEarned(referredIds: string[], netByCreator: Map<string, number>, cfg: ReferralConfig) {
  let total = 0;
  const per: Record<string, number> = {};
  for (const id of referredIds) {
    const v = Math.min(cfg.share_cap_per_creator, ((netByCreator.get(id) || 0) * cfg.share_pct_of_earnings) / 100);
    per[id] = Math.round(v * 100) / 100;
    total += per[id];
  }
  return { total: Math.round(total * 100) / 100, per };
}

type Deps = {
  supabase: any; privilegedSupabase: any; getDb: () => any; saveDb: (db: any) => void;
  parseAuthUser: (req: express.Request) => Promise<any>;
  logAdminAction?: (user: any, action: string, type: string, id: string, detail: any) => Promise<any>;
};

// ---------------------------------------------------------------- data access
export function referralData(deps: { supabase: any; privilegedSupabase: any; getDb: () => any; saveDb?: (db: any) => void }) {
  const c = () => deps.privilegedSupabase || deps.supabase;
  const local = (k: string) => { const d = deps.getDb(); if (!d[k]) d[k] = []; return d[k] as any[]; };
  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => { try { return await fn(); } catch { return fallback; } };
  return {
    async config(): Promise<ReferralConfig> {
      if (!c()) return normaliseConfig(deps.getDb().referral_program || {});
      const row = await safe(async () => (await c().from("referral_config").select("*").limit(1).maybeSingle()).data, null);
      return normaliseConfig({ ...(deps.getDb().referral_program || {}), ...(row || {}) });
    },
    async referralsOf(referrerId: string) {
      const rows = c() ? await safe(async () => (await c().from("referrals").select("*").eq("referrer_id", referrerId)).data || [], [] as any[]) : [];
      for (const r of local("referrals")) if (r.referrer_id === referrerId && !rows.some((x: any) => x.id === r.id)) rows.push(r);
      return rows;
    },
    async allReferrals() {
      const rows = c() ? await safe(async () => (await c().from("referrals").select("*").limit(20000)).data || [], [] as any[]) : [];
      for (const r of local("referrals")) if (!rows.some((x: any) => x.id === r.id)) rows.push(r);
      return rows;
    },
    async referralFor(referredId: string) {
      if (c()) { const r = await safe(async () => (await c().from("referrals").select("*").eq("referred_id", referredId).limit(1)).data?.[0], null); if (r) return r; }
      return local("referrals").find((r: any) => r.referred_id === referredId) || null;
    },
    async insertReferral(row: any) {
      local("referrals").push(row); deps.saveDb?.(deps.getDb());
      if (c()) { const { error } = await c().from("referrals").insert([row]); if (error) console.warn("[referral] insert:", error.message); }
    },
    async updateReferral(id: string, patch: any) {
      const l = local("referrals"); const i = l.findIndex((r: any) => r.id === id); if (i >= 0) l[i] = { ...l[i], ...patch };
      deps.saveDb?.(deps.getDb());
      if (c()) await safe(async () => c().from("referrals").update(patch).eq("id", id), null);
    },
    async freeDealUses(userId: string) {
      // v346: a failed read counts as "all used" (Infinity → 0 free deals left), never as "none used".
      const list = await this.freeDealUseList(userId);
      return list === null ? Number.POSITIVE_INFINITY : list.length;
    },
    /** v346: every free-deal use with its created_at (to spend it on the block live at that time).
     *  null when the database read failed — callers must then treat it as no free deals available. */
    async freeDealUseList(userId: string): Promise<Array<{ id: string; created_at: string | null }> | null> {
      const out: Array<{ id: string; created_at: string | null }> = [];
      if (c()) {
        try {
          const { data, error } = await c().from("referral_reward_uses").select("id, created_at").eq("user_id", userId);
          if (error || !Array.isArray(data)) return null;
          for (const r of data) out.push({ id: String(r.id), created_at: r.created_at || null });
        } catch { return null; }
      }
      for (const r of local("referral_reward_uses")) {
        if (r.user_id === userId && !out.some((x) => x.id === String(r.id))) out.push({ id: String(r.id), created_at: r.created_at || null });
      }
      return out;
    },
    async recordFreeDealUse(userId: string, dealId?: string | null, ugcOrderId?: string | null) {
      const row = { id: crypto.randomUUID(), user_id: userId, deal_id: dealId || null, ugc_order_id: ugcOrderId || null, created_at: new Date().toISOString() };
      local("referral_reward_uses").push(row); deps.saveDb?.(deps.getDb());
      if (c()) await safe(async () => c().from("referral_reward_uses").insert([row]), null);
    },
    /** What each creator received on PAID deals, after the Ybex fee (Session 39 referral rule). */
    async paidNetByCreator(creatorIds: string[]) {
      const m = new Map<string, number>();
      if (!creatorIds.length || !c()) return m;
      const rows = await safe(async () => (await c().from("transactions").select("id, deal_id, ugc_order_id, creator_id, creator_net_amount, gross_amount, platform_fee_amount, payout_status, status").in("creator_id", creatorIds)).data || [], [] as any[]);
      const seen = new Set<string>(); // Session 58: one payout per deal / order (duplicate rows were counted twice)
      for (const t of rows) {
        const key = t.deal_id ? `d:${t.deal_id}` : t.ugc_order_id ? `u:${t.ugc_order_id}` : `t:${t.id}`;
        const paid = PAID.includes(String(t.payout_status || "").toUpperCase());
        if (!paid || String(t.status || "").toUpperCase() === "REFUNDED") continue;
        if (seen.has(key)) continue;
        seen.add(key);
        const net = Number(t.creator_net_amount);
        const value = Number.isFinite(net) && net > 0 ? net : Math.max(0, (Number(t.gross_amount) || 0) - (Number(t.platform_fee_amount) || 0));
        m.set(t.creator_id, (m.get(t.creator_id) || 0) + value);
      }
      return m;
    },
    async withdrawals(userId?: string) {
      let rows: any[] = [];
      if (c()) {
        let q = c().from("referral_withdrawals").select("*").order("created_at", { ascending: false });
        if (userId) q = q.eq("user_id", userId);
        rows = await safe(async () => (await q).data || [], [] as any[]);
      }
      for (const r of local("referral_withdrawals")) if ((!userId || r.user_id === userId) && !rows.some((x) => x.id === r.id)) rows.push(r);
      return rows;
    },
    async saveWithdrawal(row: any, patch?: any) {
      const l = local("referral_withdrawals"); const i = l.findIndex((r: any) => r.id === row.id);
      const next = { ...row, ...(patch || {}) };
      if (i >= 0) l[i] = next; else l.unshift(next);
      deps.saveDb?.(deps.getDb());
      if (c()) {
        if (patch) {
          // Session 58: only if it is still in the state we checked (two admins: "paid" + "reject" can't both win).
          const { data, error } = await c().from("referral_withdrawals").update(patch).eq("id", row.id).eq("status", row.status || "requested").select("id");
          if (error) throw new Error(error.message);
          if (!data || !data.length) throw new Error("WITHDRAWAL_CHANGED");
        } else {
          const { error } = await c().from("referral_withdrawals").insert([row]);
          if (error) throw new Error(error.message);
        }
      }
      return next;
    },
    async userById(id: string) {
      if (c()) { const u = await safe(async () => (await c().from("users").select("user_id, email, phone, name, role, created_at, banned, is_deleted").eq("user_id", id).maybeSingle()).data, null); if (u) return u; }
      return (deps.getDb().users || []).find((u: any) => u.user_id === id) || null;
    },
    async userByCode(code: string) {
      const clean = String(code || "").trim().toUpperCase();
      const m = clean.match(/^YBEX-([0-9A-F]{6,8})$/);
      if (!m) return null;
      const pick = (list: any[]) => list.find((u: any) => referralCodeForId(u.user_id) === clean || (`YBEX-${String(u.user_id).slice(0, 6)}`).toUpperCase() === clean);
      if (c()) {
        const list = await safe(async () => (await c().from("users").select("user_id, email, phone, name, role, banned, is_deleted").ilike("user_id", `${m[1].slice(0, 6).toLowerCase()}%`).limit(20)).data || [], [] as any[]);
        const f = pick(list); if (f) return f;
      }
      return pick(deps.getDb().users || []) || null;
    },
  };
}

export async function referralSummary(deps: Parameters<typeof referralData>[0], userId: string) {
  const d = referralData(deps);
  const cfg = await d.config();
  const refs = await d.referralsOf(userId);
  const rb = rewardBlocks(refs, cfg);
  // v346: spend each use on the block live when it was made; DB read failed → no free deals (fail closed).
  const uses = await d.freeDealUseList(userId);
  const fd = uses === null ? { left: 0, total: 0, expires_at: null as string | null } : freeDealsLeft(rb.blocks, uses);
  const accountIds = refs.filter(counts).map((r) => String(r.referred_id)).filter((id) => !id.startsWith("waitlist:"));
  const share = shareEarned(accountIds, await d.paidNetByCreator(accountIds), cfg);
  const wd = await d.withdrawals(userId);
  const withdrawn = wd.filter((w) => String(w.status) !== "rejected").reduce((n, w) => n + (Number(w.amount) || 0), 0);
  // v290: ₹21 friend rewards + ₹500 brand invites (locked until 2 own deals) — inviteRewards.ts.
  const c = deps.privilegedSupabase || deps.supabase;
  let invite = inviteWallet(cfg, { friendsComplete: [], brandQualified: [], iAmComplete: false, iWasReferred: false, myCompletedDeals: 0 });
  // Session 57: who among the invited is done (profile 100% / brand funded) — for the "people you invited" list.
  const progress = { complete: new Set<string>(), qualified: new Set<string>() };
  try {
    const f = await loadInviteFacts(c, deps.getDb, userId, refs, await d.referralFor(userId));
    const bq = f.brandQualifiedFor(cfg.brand_invite_min_deal);
    invite = inviteWallet(cfg, { ...f, brandQualified: bq });
    (f.friendsComplete || []).forEach((id: string) => progress.complete.add(String(id)));
    (bq || []).forEach((x: any) => progress.qualified.add(String(x?.id)));
  } catch (e: any) { console.warn("[invite] facts:", e?.message || e); }
  const featuredUntil = [rb.blocks.map((b) => b.featured_until).filter((t) => Date.parse(t) > Date.now()).sort().pop(), invite.featured_until].filter(Boolean).sort().pop() || null;
  const earnedAll = share.total + invite.available;
  return { cfg, refs, rb, fd, share, invite, withdrawn, balance: Math.max(0, Math.round((earnedAll - withdrawn) * 100) / 100), wd, featuredUntil, progress };
}

/** Records who invited a new account (or an /apply application). Returns a reason when skipped. */
export async function recordReferral(deps: Parameters<typeof referralData>[0], code: string, referred: { id: string; email?: string; phone?: string; createdAt?: string; type?: string }) {
  const d = referralData(deps);
  const cfg = await d.config();
  if (!cfg.is_active) return { ok: false, reason: "programme_off" };
  const ref = await d.userByCode(code);
  if (!ref || ref.banned || ref.is_deleted) return { ok: false, reason: "unknown_code" };
  if (ref.user_id === referred.id) return { ok: false, reason: "self" };
  const same = (a?: string, b?: string) => a && b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  const digits = (p?: string) => String(p || "").replace(/\D/g, "").slice(-10);
  if (same(ref.email, referred.email) || (digits(ref.phone) && digits(ref.phone) === digits(referred.phone))) return { ok: false, reason: "self" };
  if (referred.createdAt && Date.now() - Date.parse(referred.createdAt) > 7 * DAY) return { ok: false, reason: "not_new" };
  if (await d.referralFor(referred.id)) return { ok: false, reason: "already" };
  // an /apply application that later becomes an account: move it, do not count twice
  if (referred.email) {
    const mine = await d.referralsOf(ref.user_id);
    const wl = mine.find((r) => String(r.referred_id).startsWith("waitlist:") && same(r.referred_email, referred.email));
    if (wl && !referred.id.startsWith("waitlist:")) { await d.updateReferral(wl.id, { referred_id: referred.id }); return { ok: true, moved: true }; }
  }
  const monthAgo = Date.now() - 30 * DAY;
  const recent = (await d.referralsOf(ref.user_id)).filter((r) => counts(r) && Date.parse(r.created_at) > monthAgo).length;
  const row: any = {
    id: crypto.randomUUID(), referrer_id: ref.user_id, referred_id: referred.id, referred_type: referred.type || "creator",
    status: recent >= cfg.monthly_cap_per_user ? "over_cap" : "joined", trigger_action: "signup",
    reward_amount: 0, created_at: new Date().toISOString(),
  };
  if (referred.email) row.referred_email = String(referred.email).toLowerCase();
  await d.insertReferral(row);
  return { ok: true, status: row.status };
}

const isAdmin = (u: any) => u && (u.role === "admin" || u.role === "sub_admin" || u.team_role === "sub_admin");

/** v290: the UPI id we pay rewards to — creator payout method / KYC, or the brand's refund account. */
export async function payoutUpiOf(deps: { supabase: any; privilegedSupabase: any; getDb: () => any }, user: any): Promise<string> {
  const c = deps.privilegedSupabase || deps.supabase;
  const pick = (rows: any[]) => String((rows || []).map((r) => r?.upi_id).find((v) => v && String(v).includes("@")) || "");
  const db = deps.getDb();
  const tries: Array<[string, string]> = user.role === "brand"
    ? [["brand_refund_accounts", "brand_id"], ["brand_refund_accounts", "user_id"]]
    : [["creator_payment_methods", "creator_id"], ["creator_payment_methods", "user_id"], ["creator_kyc", "creator_id"]];
  for (const [table, col] of tries) {
    let rows: any[] = [];
    if (c) { try { rows = (await c.from(table).select("upi_id").eq(col, user.user_id)).data || []; } catch { rows = []; } }
    else rows = (db[table] || []).filter((r: any) => String(r[col]) === String(user.user_id));
    const v = pick(rows); if (v) return v;
  }
  return "";
}
const mask = (name: string) => { const n = String(name || "Creator").trim(); return n.length <= 2 ? n : `${n.split(" ")[0].slice(0, 12)}`; };

export function setupReferralRoutes(router: express.Router, deps: Deps) {
  const d = referralData(deps);

  // New account says who invited it (code kept by the browser from /r/<CODE>, max 30 days).
  router.post("/referrals/claim", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Sign in first." });
    const u = await d.userById(user.user_id);
    const r = await recordReferral(deps, String(req.body?.code || ""), {
      id: user.user_id, email: u?.email || user.email, phone: u?.phone, createdAt: u?.created_at || user.created_at, type: user.role,
    });
    return res.json(r);
  });

  router.get("/referrals/me", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Sign in first." });
    const s = await referralSummary(deps, user.user_id);
    const people = await Promise.all(s.refs.slice(-50).reverse().map(async (r) => {
      const id = String(r.referred_id);
      const u = id.startsWith("waitlist:") ? null : await d.userById(id);
      const type = String(r.referred_type || u?.role || "creator").toLowerCase() === "brand" ? "brand" : "creator";
      return {
        name: mask(u?.name || (type === "brand" ? "New brand" : "New creator")),
        status: r.status === "rejected" ? "not counted" : (r.status === "over_cap" ? "over monthly limit" : "joined"),
        joined_at: r.created_at, earned: s.share.per[id] || 0,
        // Session 57: type + progress for the invite lists (creator: profile 100%; brand: first funded deal).
        type, complete: s.progress?.complete?.has(id) || false, qualified: s.progress?.qualified?.has(id) || false,
      };
    }));
    return res.json({
      code: referralCodeForId(user.user_id),
      link_path: `/r/${referralCodeForId(user.user_id)}`,
      joined: s.rb.joined,
      to_next_reward: s.rb.to_next,
      signups_per_reward: s.cfg.signups_per_reward,
      free_deals_per_reward: s.cfg.free_deals_per_reward,
      free_deals_left: s.fd.left,
      free_deals_valid_days: s.cfg.free_deals_valid_days,
      monthly_cap_per_user: s.cfg.monthly_cap_per_user,
      free_deals_expire_at: s.fd.expires_at,
      featured_until: s.featuredUntil,
      featured_days: s.cfg.featured_days,
      share_pct_of_earnings: s.cfg.share_pct_of_earnings,
      share_cap_per_creator: s.cfg.share_cap_per_creator,
      earned: s.share.total + s.invite.available,
      share_earned: s.share.total,
      invite: s.invite,
      friend_reward: s.cfg.friend_reward,
      friend_reward_cap: s.cfg.friend_reward_cap,
      brand_invite_reward: s.cfg.brand_invite_reward,
      brand_invite_max_brands: s.cfg.brand_invite_max_brands,
      brand_invite_min_deal: s.cfg.brand_invite_min_deal,
      brand_invite_unlock_deals: s.cfg.brand_invite_unlock_deals,
      brand_invite_featured_days: s.cfg.brand_invite_featured_days,
      withdrawn: s.withdrawn,
      balance: s.balance,
      min_withdraw: s.cfg.min_withdraw,
      withdrawals: s.wd.slice(0, 20).map((w) => ({ id: w.id, amount: w.amount, status: w.status, utr: w.status === "paid" ? w.utr : null, created_at: w.created_at })),
      people,
      programme_active: s.cfg.is_active,
    });
  });

  router.post("/referrals/withdraw", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Sign in first." });
    const s = await referralSummary(deps, user.user_id);
    const amount = Math.floor(Number(req.body?.amount) || s.balance);
    if (amount < s.cfg.min_withdraw) return res.status(400).json({ error: `You can withdraw once your balance reaches ₹${s.cfg.min_withdraw}.`, min_withdraw: s.cfg.min_withdraw, balance: s.balance });
    if (amount > s.balance) return res.status(400).json({ error: "That is more than your balance." });
    if (s.wd.some((w) => w.status === "requested")) return res.status(400).json({ error: "You already have a withdrawal in progress." });
    // v290 (Ravi): admin pays by hand on UPI — snapshot the person's UPI id on the request.
    const upi_id = await payoutUpiOf(deps, user);
    if (!upi_id) return res.status(400).json({ error: "Add your UPI ID in Payout details first, then withdraw.", code: "NO_UPI" });
    const row: any = { id: crypto.randomUUID(), user_id: user.user_id, amount, status: "requested", utr: null, created_at: new Date().toISOString(), paid_at: null, upi_id };
    try { await d.saveWithdrawal(row); }
    catch (e: any) {
      // referral_withdrawals.upi_id not added yet (session 43 SQL) → save without it, admin looks it up.
      if (/upi_id/.test(String(e?.message || ""))) {
        const { upi_id: _u, ...rest } = row;
        try { await d.saveWithdrawal(rest); } catch { return res.status(502).json({ error: "Could not save the request." }); }
      } else return res.status(502).json({ error: "Could not save the request." });
    }
    // Session 58: two taps at the same moment could both pass the "already in progress" check → keep only the
    // first request, remove this one.
    const open = (await d.withdrawals(user.user_id)).filter((w: any) => String(w.status || "") === "requested").sort((x: any, y: any) => String(x.created_at).localeCompare(String(y.created_at)) || String(x.id).localeCompare(String(y.id)));
    if (open.length > 1 && open[0].id !== row.id) {
      try { const cl = deps.privilegedSupabase || deps.supabase; if (cl) await cl.from("referral_withdrawals").delete().eq("id", row.id).eq("status", "requested"); } catch { /* best effort */ }
      const l = deps.getDb?.()?.referral_withdrawals; if (Array.isArray(l)) { const i = l.findIndex((r: any) => r.id === row.id); if (i >= 0) l.splice(i, 1); deps.saveDb?.(deps.getDb()); }
      return res.status(400).json({ error: "You already have a withdrawal in progress." });
    }
    return res.json({ ok: true, withdrawal: row });
  });

  // Creators shown first (with a "Featured" label) in brand search.
  router.get("/creators/featured", async (_req, res) => {
    const cfg = await d.config();
    const all = await d.allReferrals();
    const by = new Map<string, any[]>();
    for (const r of all) { if (!by.has(r.referrer_id)) by.set(r.referrer_id, []); by.get(r.referrer_id)!.push(r); }
    const now = Date.now();
    const out: Array<{ user_id: string; until: string }> = [];
    for (const [id, rows] of by) {
      const until = rewardBlocks(rows, cfg).blocks.map((b) => b.featured_until).filter((t) => Date.parse(t) > now).sort().pop();
      if (until) out.push({ user_id: id, until });
    }
    res.set("Cache-Control", "public, max-age=300");
    return res.json({ featured: out });
  });

  // ---------------------------------------------------------------- admin
  router.get("/admin/referral-program", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ error: "Admin only" });
    const cfg = await d.config();
    const all = await d.allReferrals();
    const c = deps.privilegedSupabase || deps.supabase;
    let users: any[] = [], profiles: any[] = [], waitlist: any[] = [];
    if (c) {
      users = (await c.from("users").select("user_id, role, created_at, banned, is_deleted, auth_method")).data || [];
      profiles = (await c.from("creator_profiles").select("user_id, profile_status, is_claimed")).data || [];
      waitlist = (await c.from("waitlist").select("id, status, created_at, role")).data || [];
    }
    const creators = users.filter((u) => u.role === "creator" && !u.banned && !u.is_deleted && u.auth_method !== "unclaimed");
    const referredIds = new Set(all.filter(counts).map((r) => String(r.referred_id)));
    const approved = profiles.filter((p) => String(p.profile_status || "").toLowerCase() === "approved").length;
    const monthAgo = Date.now() - 30 * DAY;
    return res.json({
      config: cfg,
      numbers: {
        creator_accounts: creators.length,
        creator_accounts_last_30_days: creators.filter((u) => Date.parse(u.created_at) > monthAgo).length,
        approved_creator_profiles: approved,
        applications_total: waitlist.filter((w) => (w.role || "creator") === "creator").length,
        applications_pending: waitlist.filter((w) => String(w.status || "").toLowerCase() === "pending").length,
        referral_joins: all.filter(counts).length,
        referral_joins_last_30_days: all.filter((r) => counts(r) && Date.parse(r.created_at) > monthAgo).length,
        creators_from_referral_pct: creators.length ? Math.round((creators.filter((u) => referredIds.has(u.user_id)).length / creators.length) * 1000) / 10 : 0,
      },
    });
  });

  router.put("/admin/referral-program", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Only a full admin can change the programme." });
    const next = normaliseConfig({ ...(await d.config()), ...(req.body || {}) });
    const db = deps.getDb(); db.referral_program = next; deps.saveDb(db);
    const c = deps.privilegedSupabase || deps.supabase;
    if (c) {
      const { data: row } = await c.from("referral_config").select("id").limit(1).maybeSingle();
      const patch = { ...next, updated_at: new Date().toISOString() };
      const write = (p: any) => (row?.id != null ? c.from("referral_config").update(p).eq("id", row.id) : c.from("referral_config").insert([p]));
      let { error } = await write(patch);
      if (error && /column/i.test(error.message)) {
        // v290 columns not added yet → save the old settings now, tell the admin what is missing.
        const old: any = { ...patch }; Object.keys(INVITE_DEFAULTS).forEach((k) => delete old[k]);
        ({ error } = await write(old));
        if (!error) return res.json({ ok: true, config: next, warning: "Invite reward numbers need the session 43 SQL (docs/database/SUPABASE_PROMPT_SESSION43.md)." });
      }
      if (error) return res.status(502).json({ error: "Could not save (run the session 36 and session 39 SQL): " + error.message });
    }
    await deps.logAdminAction?.(user, "referral_program_update", "referral_config", "1", next);
    return res.json({ ok: true, config: next });
  });

  router.get("/admin/referral-list", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ error: "Admin only" });
    const all = (await d.allReferrals()).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 500);
    return res.json({ referrals: all });
  });

  router.post("/admin/referrals/:id/reject", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ error: "Admin only" });
    await d.updateReferral(req.params.id, { status: "rejected" });
    await deps.logAdminAction?.(user, "referral_reject", "referral", req.params.id, {});
    return res.json({ ok: true });
  });

  router.get("/admin/referral-withdrawals", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ error: "Admin only" });
    // v290: name, role and UPI next to each request, so the admin can pay from the list.
    const list = await d.withdrawals();
    const out = await Promise.all(list.slice(0, 300).map(async (w: any) => {
      const u = await d.userById(String(w.user_id));
      return { ...w, name: u?.name || "", email: u?.email || "", role: u?.role || "", upi_id: w.upi_id || (u ? await payoutUpiOf(deps, u) : "") };
    }));
    return res.json({ withdrawals: out });
  });

  router.post("/admin/referral-withdrawals/:id/:action", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ error: "Admin only" });
    const w = (await d.withdrawals()).find((x) => x.id === req.params.id);
    if (!w) return res.status(404).json({ error: "Not found" });
    // Session 58 (bug hunt): only a REQUESTED withdrawal can be paid or rejected — rejecting an already-paid one gave the
    // balance back (a second payout became possible).
    if (String(w.status || "requested").toLowerCase() !== "requested") return res.status(409).json({ error: `This withdrawal is already ${w.status}.` });
    if (req.params.action === "paid") {
      const utr = String(req.body?.utr || "").trim();
      if (!utr) return res.status(400).json({ error: "Enter the UTR / bank reference." });
      try { await d.saveWithdrawal(w, { status: "paid", utr, paid_at: new Date().toISOString() }); }
      catch (e: any) { return res.status(409).json({ error: /WITHDRAWAL_CHANGED/.test(String(e?.message)) ? "Another admin just updated this withdrawal. Refresh." : "Couldn't save. Try again." }); }
    } else if (req.params.action === "reject") {
      try { await d.saveWithdrawal(w, { status: "rejected" }); }
      catch (e: any) { return res.status(409).json({ error: /WITHDRAWAL_CHANGED/.test(String(e?.message)) ? "Another admin just updated this withdrawal. Refresh." : "Couldn't save. Try again." }); }
    } else return res.status(400).json({ error: "Unknown action" });
    await deps.logAdminAction?.(user, `referral_withdrawal_${req.params.action}`, "referral_withdrawal", w.id, { amount: w.amount });
    return res.json({ ok: true });
  });
}
