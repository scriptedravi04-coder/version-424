// Session 46 (Ravi): Admin Overview becomes an "Executive Growth Command Center".
//
// This file is PURE: it takes plain rows (already read from the database by
// admin_growth_routes.ts) and returns the numbers the screen shows. No database, no network, no
// clock of its own (`now` is passed in) — so every number can be tested on its own
// (backend/adminGrowth.test.ts).
//
// Rules (Ravi): every number comes from a real row. Nothing is invented, estimated from random
// values or filled with a sample. When a number cannot be known with today's tables (e.g. which
// ad channel a signup came from) the report says so (`available: false` / `trackingGap`) instead
// of guessing. No new table or column is needed.
import { isEscrowHeld, isPaidOut, isRefunded, isPayoutRequested } from "./adminMoney";

export const DAY = 24 * 60 * 60 * 1000;
export const HOUR = 60 * 60 * 1000;

/** Documented thresholds — the screen prints them next to the numbers they drive. */
export const GROWTH_RULES = {
  /** A city needs this many people + campaigns before it is judged at all. */
  minCityVolume: 5,
  /** Brand shortage: this many creators (or more) for every one brand. */
  creatorsPerBrandLimit: 5,
  /** Creator shortage: fewer applicants than this per campaign, with at least minCampaigns campaigns. */
  applicantsPerCampaignLimit: 3,
  minCampaigns: 2,
  /** A deal waiting for the brand's payment this long counts as "stuck". */
  stuckPaymentHours: 24,
  /** A draft campaign this old counts as "abandoned". */
  draftCampaignDays: 3,
  /** A live campaign this old with no applicant needs a push. */
  emptyCampaignDays: 3,
  /** A brand that paid once and was silent this long is a win-back target. */
  winBackDays: 30,
  /** Target: campaign created → deal completed. */
  targetDealDays: 7,
  /** Volume at which a city's ad priority is fully weighted. */
  fullWeightVolume: 30,
} as const;

// ───────────────────────── input / output types ─────────────────────────

export type GrowthRaw = {
  users: any[];
  creators: any[];
  brands: any[];
  campaigns: any[];
  applications: any[];
  deals: any[];
  transactions: any[];
  ugcOrders: any[];
  sessions: any[] | null; // null = could not be read
  referrals: any[];
  kyc: any[]; // one resolved row per creator: { creator_id, status } (see resolveKycStatus)
  /** Session 58: true when users.signup_source exists (then each user row may carry it). */
  sourceTracked?: boolean;
};

export const SOURCE_LABEL: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", meta_ads: "Meta ads (Instagram / Facebook)", google: "Google search",
  google_ads: "Google ads", youtube: "YouTube", linkedin: "LinkedIn", whatsapp: "WhatsApp", x: "X / Twitter",
  other_search: "Other search engine", other_website: "Another website", android_app: "Android app (Play Store)",
  app: "Installed app", direct: "Direct (typed the address / no link)",
};

// ───────────────────────── small helpers ─────────────────────────

const up = (v: any) => String(v ?? "").trim().toUpperCase();
const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const ts = (v: any): number | null => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};
const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

/** Percent change from `prev` to `cur`. null when there is nothing to compare with. */
export function change(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

const NO_CITY = "Not set";

/** "  new   DELHI, delhi" → "New Delhi"-style key is NOT attempted; only spacing, case and a trailing ", State". */
export function cityKey(raw: any): string {
  let s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return NO_CITY;
  s = s.split(",")[0].trim();
  if (!s || /^(india|n\/a|na|none|null|-|unknown)$/i.test(s)) return NO_CITY;
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

const stateKey = (raw: any): string => {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s || /^(india|n\/a|na|none|null|-|unknown)$/i.test(s)) return NO_CITY;
  return s.split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)).join(" ");
};

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const SUCCESS = ["SUCCESS", "ESCROW_HELD", "RELEASED", "COMPLETED"];
/** Money that really came in: a successful payment that was not refunded. */
export const isRealPayment = (tx: any) => SUCCESS.includes(up(tx?.status)) && !isRefunded(tx);

const DEAL_RANK: Record<string, number> = {
  NEGOTIATING: 3, PENDING: 3,
  ACTIVE: 4, IN_PROGRESS: 4,
  CONTENT_SUBMITTED: 5, PENDING_REVIEW: 5, PROOF_SUBMITTED: 5, SUBMITTED: 5,
  COMPLETED: 6, RELEASED: 6, PAID: 6,
};

/** How far a deal got: 3 chat · 4 payment held · 5 draft in · 6 approved & paid. */
export function dealRank(deal: any, hasPayment: boolean): number {
  const st = up(deal?.status);
  if (st === "CANCELLED" || st === "REJECTED" || st === "DECLINED") return hasPayment ? 4 : 3;
  let r = DEAL_RANK[st] ?? 3;
  if (hasPayment && r < 4) r = 4;
  return r;
}
const isCancelled = (deal: any) => ["CANCELLED", "REJECTED", "DECLINED"].includes(up(deal?.status));

const splitTags = (v: any): string[] => {
  // The profile screen's own placeholder text is not a category.
  if (typeof v === "string" && /go to settings/i.test(v)) return [];
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,/|&;]+/) : [];
  const out: string[] = [];
  for (const t of arr) {
    const s = String(t ?? "").replace(/\s+/g, " ").trim();
    if (!s || /go to settings/i.test(s)) continue;
    out.push(s.split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)).join(" "));
  }
  return Array.from(new Set(out));
};

const hasRate = (rc: any) => {
  if (!rc || typeof rc !== "object") return false;
  return Object.values(rc).some((v) => typeof v === "number" && v > 0) || Object.values(rc).some((v) => typeof v === "string" && Number(v) > 0);
};

type Indexes = ReturnType<typeof buildIndexes>;

function buildIndexes(raw: GrowthRaw) {
  const usersById = new Map<string, any>();
  for (const u of raw.users) if (u?.user_id) usersById.set(u.user_id, u);
  const creatorsById = new Map<string, any>();
  for (const c of raw.creators) if (c?.user_id) creatorsById.set(c.user_id, c);
  const brandsById = new Map<string, any>();
  for (const b of raw.brands) if (b?.user_id) brandsById.set(b.user_id, b);
  const campaignsById = new Map<string, any>();
  for (const c of raw.campaigns) if (c?.campaign_id) campaignsById.set(c.campaign_id, c);
  const dealsById = new Map<string, any>();
  for (const d of raw.deals) if (d?.id) dealsById.set(d.id, d);
  const ugcById = new Map<string, any>();
  for (const o of raw.ugcOrders) if (o?.id) ugcById.set(o.id, o);

  // payments grouped by deal / ugc order
  const paymentsByDeal = new Map<string, any[]>();
  for (const tx of raw.transactions) {
    if (!isRealPayment(tx) || !tx.deal_id) continue;
    const l = paymentsByDeal.get(tx.deal_id) || [];
    l.push(tx);
    paymentsByDeal.set(tx.deal_id, l);
  }

  /** The brand who paid a transaction (campaign deal or UGC order). */
  const brandOfTx = (tx: any): string | null => {
    if (tx.deal_id) return dealsById.get(tx.deal_id)?.brand_id || null;
    if (tx.ugc_order_id) return ugcById.get(tx.ugc_order_id)?.brand_id || null;
    return null;
  };
  const creatorOfTx = (tx: any): string | null => tx.creator_id || (tx.deal_id ? dealsById.get(tx.deal_id)?.creator_id : null) || null;

  const kycOk = new Set<string>();
  for (const k of raw.kyc) {
    const id = k?.creator_id || k?.user_id;
    if (id && ["APPROVED", "VERIFIED", "APPROVE", "SUCCESS"].includes(up(k.status))) kycOk.add(id);
  }
  // Same rule as backend/creatorKyc.ts: only the admin's KYC decision counts. The profile's own
  // "verified" flag is NOT a KYC approval.

  const appsByCampaign = new Map<string, number>();
  const appCreators = new Set<string>();
  for (const a of raw.applications) {
    if (a?.campaign_id) appsByCampaign.set(a.campaign_id, (appsByCampaign.get(a.campaign_id) || 0) + 1);
    if (a?.creator_id) appCreators.add(a.creator_id);
  }

  const brandName = (id: string) => brandsById.get(id)?.company_name || usersById.get(id)?.name || "Brand";
  const creatorName = (id: string) => creatorsById.get(id)?.name || usersById.get(id)?.name || "Creator";
  const isBrandCampaign = (c: any) => up(c?.status) !== "DRAFT";

  return {
    usersById, creatorsById, brandsById, campaignsById, dealsById, ugcById, paymentsByDeal,
    brandOfTx, creatorOfTx, kycOk, appsByCampaign, appCreators, brandName, creatorName, isBrandCampaign,
  };
}

// ───────────────────────── 1. geography ─────────────────────────

export type CityRow = {
  city: string; creators: number; brands: number; campaigns: number; applications: number; gmv: number; gmvSharePct: number;
  appsPerCampaign: number | null; creatorsEarning: number; brandsPaying: number;
  creatorConversion: number; brandConversion: number;
  zone: "brand_shortage" | "creator_shortage" | "balanced" | "too_small";
  priority: number; action: string;
};

function buildGeography(raw: GrowthRaw, ix: Indexes) {
  type Acc = { creators: number; brands: number; campaigns: number; applications: number; gmv: number; creatorsEarning: Set<string>; brandsPaying: Set<string>; };
  const cities = new Map<string, Acc>();
  const states = new Map<string, { creators: number; brands: number }>();
  const get = (k: string): Acc => {
    let a = cities.get(k);
    if (!a) { a = { creators: 0, brands: 0, campaigns: 0, applications: 0, gmv: 0, creatorsEarning: new Set(), brandsPaying: new Set() }; cities.set(k, a); }
    return a;
  };
  const getState = (k: string) => { let s = states.get(k); if (!s) { s = { creators: 0, brands: 0 }; states.set(k, s); } return s; };

  for (const c of raw.creators) { get(cityKey(c.city)).creators++; getState(stateKey(c.state)).creators++; }
  for (const b of raw.brands) { get(cityKey(b.city)).brands++; getState(stateKey(b.state)).brands++; }
  const brandCity = (id: string) => cityKey(ix.brandsById.get(id)?.city);
  for (const c of raw.campaigns) {
    if (!ix.isBrandCampaign(c)) continue;
    get(brandCity(c.brand_user_id)).campaigns++;
  }
  for (const a of raw.applications) {
    const camp = ix.campaignsById.get(a.campaign_id);
    if (!camp || !ix.isBrandCampaign(camp)) continue;
    get(brandCity(camp.brand_user_id)).applications++;
  }
  // Deal value is credited to the BRAND's city (where the money comes from).
  let totalGmv = 0;
  for (const tx of raw.transactions) {
    if (!isRealPayment(tx)) continue;
    const cr = ix.creatorOfTx(tx);
    const br = ix.brandOfTx(tx);
    const gross = num(tx.gross_amount);
    totalGmv += gross;
    if (cr && ix.creatorsById.has(cr)) get(cityKey(ix.creatorsById.get(cr).city)).creatorsEarning.add(cr);
    if (br && ix.brandsById.has(br)) { const a = get(brandCity(br)); a.brandsPaying.add(br); a.gmv += gross; }
    else get(NO_CITY).gmv += gross;
  }

  const L = GROWTH_RULES;
  const rows: CityRow[] = [];
  for (const [city, a] of cities) {
    if (city === NO_CITY) continue;
    const volume = a.creators + a.brands + a.campaigns;
    const appsPerCampaign = a.campaigns > 0 ? round1(a.applications / a.campaigns) : null;
    let zone: CityRow["zone"] = "balanced";
    let imbalance = 0;
    if (volume < L.minCityVolume) zone = "too_small";
    else if (a.creators >= L.minCityVolume && a.creators >= a.brands * L.creatorsPerBrandLimit) {
      zone = "brand_shortage";
      imbalance = a.creators > 0 ? Math.min(1, Math.max(0.3, 1 - (a.brands * L.creatorsPerBrandLimit) / a.creators)) : 0;
    } else if (a.campaigns >= L.minCampaigns && (appsPerCampaign ?? 0) < L.applicantsPerCampaignLimit) {
      zone = "creator_shortage";
      imbalance = Math.min(1, Math.max(0.3, 1 - (appsPerCampaign ?? 0) / L.applicantsPerCampaignLimit));
    }
    const priority = zone === "brand_shortage" || zone === "creator_shortage"
      ? Math.round(100 * imbalance * Math.min(1, volume / L.fullWeightVolume)) : 0;
    const action = zone === "brand_shortage"
      ? `Run Meta / LinkedIn ads for local brands and agencies in ${city}.`
      : zone === "creator_shortage"
        ? `Run Instagram / Reels ads: "Get brand deals in ${city}".`
        : zone === "too_small" ? "Too few people here to judge yet." : "Balanced — no extra ads needed.";
    rows.push({
      city, creators: a.creators, brands: a.brands, campaigns: a.campaigns, applications: a.applications,
      gmv: Math.round(a.gmv), gmvSharePct: pct(a.gmv, totalGmv),
      appsPerCampaign, creatorsEarning: a.creatorsEarning.size, brandsPaying: a.brandsPaying.size,
      creatorConversion: pct(a.creatorsEarning.size, a.creators), brandConversion: pct(a.brandsPaying.size, a.brands),
      zone, priority, action,
    });
  }
  rows.sort((x, y) => (y.priority - x.priority) || ((y.creators + y.brands) - (x.creators + x.brands)));
  const unset = cities.get(NO_CITY);
  const stateRows = [...states.entries()].filter(([k]) => k !== NO_CITY)
    .map(([state, v]) => ({ state, ...v })).sort((a, b) => (b.creators + b.brands) - (a.creators + a.brands)).slice(0, 12);
  return {
    cities: rows.slice(0, 20),
    states: stateRows,
    totalCities: rows.length,
    unsetCity: { creators: unset?.creators || 0, brands: unset?.brands || 0 },
    topMoney: rows.filter((r) => r.gmv > 0).sort((x, y) => y.gmv - x.gmv).slice(0, 3),
    gmvUnknownCity: Math.round(unset?.gmv || 0),
    brandShortage: rows.filter((r) => r.zone === "brand_shortage").slice(0, 5),
    creatorShortage: rows.filter((r) => r.zone === "creator_shortage").slice(0, 5),
  };
}

// ───────────────────────── 2. people & activity ─────────────────────────

function buildPeople(raw: GrowthRaw, ix: Indexes, now: number) {
  // split
  const agencies = raw.brands.filter((b) => b.is_agency === true).length;
  const split = {
    creators: raw.creators.length,
    verifiedCreators: raw.creators.filter((c) => ix.kycOk.has(c.user_id)).length,
    brands: raw.brands.length - agencies,
    agencies,
  };

  // activity (login sessions)
  let activity: any = { available: false };
  if (raw.sessions) {
    const roleOf = (id: string) => {
      const r = String(ix.usersById.get(id)?.role || "").toLowerCase();
      if (r === "creator" || r === "brand") return r;
      return ix.creatorsById.has(id) ? "creator" : ix.brandsById.has(id) ? "brand" : "other";
    };
    const last = new Map<string, number>();
    for (const s of raw.sessions) {
      const t = ts(s.last_active) ?? ts(s.last_active_at) ?? ts(s.created_at);
      if (!s.user_id || t == null) continue;
      if (t > (last.get(s.user_id) || 0)) last.set(s.user_id, t);
    }
    const count = (windowMs: number) => {
      const out = { total: 0, creators: 0, brands: 0 };
      for (const [id, t] of last) {
        if (now - t > windowMs) continue;
        out.total++;
        const r = roleOf(id);
        if (r === "creator") out.creators++;
        if (r === "brand") out.brands++;
      }
      return out;
    };
    const totalAccounts = raw.creators.length + raw.brands.length;
    const dau = count(DAY), wau = count(7 * DAY), mau = count(30 * DAY);
    activity = {
      available: true, dau, wau, mau,
      stickiness: mau.total > 0 ? pct(dau.total, mau.total) : 0,
      mauShare: pct(mau.total, totalAccounts),
      note: "Counted from login sessions. A session ends at logout, so these are a floor, not an exact head-count.",
    };
  }

  // top spenders / earners
  const spend = new Map<string, { total: number; payments: number; last: number; dealIds: Set<string> }>();
  const earn = new Map<string, { net: number; paidOut: number; payments: number; last: number }>();
  for (const tx of raw.transactions) {
    if (!isRealPayment(tx)) continue;
    const t = ts(tx.created_at) || 0;
    const gross = num(tx.gross_amount);
    const br = ix.brandOfTx(tx);
    if (br) {
      const s = spend.get(br) || { total: 0, payments: 0, last: 0, dealIds: new Set() };
      s.total += gross; s.payments++; s.last = Math.max(s.last, t);
      s.dealIds.add(tx.deal_id || tx.ugc_order_id || tx.id);
      spend.set(br, s);
    }
    const cr = ix.creatorOfTx(tx);
    if (cr) {
      const net = num(tx.creator_net_amount) || Math.max(0, gross - num(tx.platform_fee_amount));
      const e = earn.get(cr) || { net: 0, paidOut: 0, payments: 0, last: 0 };
      e.net += net; e.payments++; e.last = Math.max(e.last, t);
      if (isPaidOut(tx)) e.paidOut += net;
      earn.set(cr, e);
    }
  }
  const topBrands = [...spend.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 10)
    .map(([id, s]) => ({ user_id: id, name: ix.brandName(id), total: Math.round(s.total), deals: s.dealIds.size, lastPaid: s.last ? new Date(s.last).toISOString() : null }));
  const topCreators = [...earn.entries()].sort((a, b) => b[1].net - a[1].net).slice(0, 10)
    .map(([id, e]) => ({ user_id: id, name: ix.creatorName(id), earned: Math.round(e.net), paidOut: Math.round(e.paidOut), deals: e.payments, city: cityKey(ix.creatorsById.get(id)?.city) }));

  // churn risk 1: brands whose deal waits for payment / draft campaigns left
  const L = GROWTH_RULES;
  const stuckBy = new Map<string, { deals: number; amount: number; oldest: number | null }>();
  for (const d of raw.deals) {
    if (isCancelled(d) || up(d.status) !== "NEGOTIATING") continue;
    if ((ix.paymentsByDeal.get(d.id) || []).length) continue;
    const created = ts(d.created_at);
    if (created != null && now - created < L.stuckPaymentHours * HOUR) continue;
    const key = d.brand_id;
    if (!key) continue;
    const s = stuckBy.get(key) || { deals: 0, amount: 0, oldest: null };
    s.deals++; s.amount += num(d.agreed_amount);
    if (created != null) s.oldest = s.oldest == null ? created : Math.min(s.oldest, created);
    stuckBy.set(key, s);
  }
  const draftBy = new Map<string, { drafts: number; oldest: number | null }>();
  for (const c of raw.campaigns) {
    if (up(c.status) !== "DRAFT") continue;
    const created = ts(c.created_at);
    if (created != null && now - created < L.draftCampaignDays * DAY) continue;
    const s = draftBy.get(c.brand_user_id) || { drafts: 0, oldest: null };
    s.drafts++;
    if (created != null) s.oldest = s.oldest == null ? created : Math.min(s.oldest, created);
    draftBy.set(c.brand_user_id, s);
  }
  const brandIds = new Set<string>([...stuckBy.keys(), ...draftBy.keys()]);
  const unpaidBrands = [...brandIds].map((id) => {
    const st = stuckBy.get(id); const dr = draftBy.get(id);
    const oldest = Math.min(...[st?.oldest, dr?.oldest].filter((x): x is number => x != null), Infinity);
    const u = ix.usersById.get(id);
    return {
      user_id: id, name: ix.brandName(id), email: u?.email || null, phone: u?.phone || null,
      waitingDeals: st?.deals || 0, waitingAmount: Math.round(st?.amount || 0), draftCampaigns: dr?.drafts || 0,
      waitingDays: Number.isFinite(oldest) ? Math.floor((now - oldest) / DAY) : null,
    };
  }).sort((a, b) => (b.waitingAmount - a.waitingAmount) || (b.draftCampaigns - a.draftCampaigns)).slice(0, 15);
  const unpaidTotals = {
    brands: brandIds.size,
    /** Brands with a deal waiting for payment (the people the "Remind brands" button reaches). */
    dealBrands: stuckBy.size,
    deals: [...stuckBy.values()].reduce((a, s) => a + s.deals, 0),
    amount: Math.round([...stuckBy.values()].reduce((a, s) => a + s.amount, 0)),
    drafts: [...draftBy.values()].reduce((a, s) => a + s.drafts, 0),
  };

  // churn risk 2: creators with a profile but no KYC or no rate card
  const incomplete = raw.creators.map((c) => {
    const needsKyc = !ix.kycOk.has(c.user_id);
    const needsRate = !hasRate(c.rate_card);
    return { c, needsKyc, needsRate };
  }).filter((x) => x.needsKyc || x.needsRate);
  const incompleteCreators = {
    total: incomplete.length,
    needKyc: incomplete.filter((x) => x.needsKyc).length,
    needRateCard: incomplete.filter((x) => x.needsRate).length,
    list: incomplete
      .sort((a, b) => (ts(a.c.created_at) ?? Infinity) - (ts(b.c.created_at) ?? Infinity))
      .slice(0, 15)
      .map((x) => ({
        user_id: x.c.user_id, name: x.c.name || ix.usersById.get(x.c.user_id)?.name || "Creator",
        city: cityKey(x.c.city), needsKyc: x.needsKyc, needsRateCard: x.needsRate,
        daysSinceSignup: ts(x.c.created_at) != null ? Math.floor((now - (ts(x.c.created_at) as number)) / DAY) : null,
      })),
  };

  return { split, activity, topBrands, topCreators, unpaidBrands, unpaidTotals, incompleteCreators };
}

// ───────────────────────── 3. funnel & velocity ─────────────────────────

function buildFunnel(raw: GrowthRaw, ix: Indexes, now: number) {
  const liveCampaigns = raw.campaigns.filter((c) => ix.isBrandCampaign(c));
  const campaignsWithApps = liveCampaigns.filter((c) => (ix.appsByCampaign.get(c.campaign_id) || 0) > 0).length;
  const apps = raw.applications.filter((a) => {
    const camp = ix.campaignsById.get(a.campaign_id);
    return camp && ix.isBrandCampaign(camp);
  }).length;

  const ranks = raw.deals.map((d) => dealRank(d, (ix.paymentsByDeal.get(d.id) || []).length > 0));
  const atLeast = (n: number) => ranks.filter((r) => r >= n).length;
  const cancelled = raw.deals.filter(isCancelled).length;

  const steps = [
    { key: "campaigns", label: "Campaigns sent for review", unit: "campaigns", count: liveCampaigns.length },
    { key: "applications", label: "Applications received", unit: "applications", count: apps },
    { key: "chat", label: "Accepted → chat & negotiation", unit: "deals", count: atLeast(3) },
    { key: "paid", label: "Payment held", unit: "deals", count: atLeast(4) },
    { key: "draft", label: "Draft submitted", unit: "deals", count: atLeast(5) },
    { key: "done", label: "Approved & paid out", unit: "deals", count: atLeast(6) },
  ].map((s, i, arr) => ({
    ...s,
    // Drop-off is only shown between deal stages (accepted → paid → draft → done). Applications →
    // deals is not a strict drop: a deal can also start from a direct invite, with no application.
    dropPct: i >= 3 ? (arr[i - 1].count > 0 ? Math.round((1 - s.count / arr[i - 1].count) * 1000) / 10 : null) : null,
    keepPct: i >= 3 ? (arr[i - 1].count > 0 ? pct(s.count, arr[i - 1].count) : null) : null,
  }));
  const withDrop = steps.filter((s, i) => s.dropPct != null && steps[i - 1].count >= 3);
  const worst = withDrop.length ? withDrop.reduce((a, b) => ((b.dropPct as number) > (a.dropPct as number) ? b : a)) : null;
  const diagnosis: Record<string, string> = {
    paid: "Deals stall after the chat: the price or trust is the likely problem. Nudge brands to pay, and review fee/pricing.",
    draft: "Brands paid but creators are slow to deliver the first draft — remind creators of the deadline.",
    done: "Drafts are in but approval is slow — brands are late to approve. Nudge brands to review drafts.",
  };

  // velocity
  const targetDays = GROWTH_RULES.targetDealDays;
  const total: number[] = [], pay: number[] = [], accept: number[] = [];
  const appsById = new Map<string, any>();
  for (const a of raw.applications) if (a?.application_id) appsById.set(a.application_id, a);
  for (const d of raw.deals) {
    const paid = ix.paymentsByDeal.get(d.id) || [];
    const created = ts(d.created_at);
    const ac = ts(appsById.get(d.application_id)?.created_at);
    if (created != null && ac != null && created >= ac) accept.push((created - ac) / HOUR);
    if (paid.length && created != null) {
      const first = Math.min(...paid.map((p) => ts(p.created_at) ?? Infinity));
      if (Number.isFinite(first) && first >= created) pay.push((first - created) / HOUR);
    }
    if (dealRank(d, paid.length > 0) === 6 && !isCancelled(d)) {
      const camp = ix.campaignsById.get(d.campaign_id);
      const start = ts(camp?.created_at);
      const end = ts(d.updated_at);
      if (start != null && end != null && end >= start) total.push((end - start) / DAY);
    }
  }
  const velocity = {
    targetDays,
    completedSample: total.length,
    avgDays: total.length ? round1(avg(total) as number) : null,
    medianDays: total.length ? round1(median(total) as number) : null,
    avgHoursToAccept: accept.length ? round1(avg(accept) as number) : null,
    avgHoursToPay: pay.length ? round1(avg(pay) as number) : null,
    note: "Campaign created → deal marked completed (the date the deal was last updated).",
  };

  // live campaigns nobody applied to
  const emptyCampaigns = raw.campaigns.filter((c) => {
    if (!["LIVE", "APPROVED"].includes(up(c.status))) return false;
    if ((ix.appsByCampaign.get(c.campaign_id) || 0) > 0) return false;
    const created = ts(c.created_at);
    return created != null && now - created >= GROWTH_RULES.emptyCampaignDays * DAY;
  }).sort((a, b) => (ts(a.created_at) as number) - (ts(b.created_at) as number)).slice(0, 10)
    .map((c) => ({ campaign_id: c.campaign_id, title: c.title || "Campaign", brand: c.brand_name || ix.brandName(c.brand_user_id), days: Math.floor((now - (ts(c.created_at) as number)) / DAY), budget: Math.round(num(c.budget_max)) }));

  return { steps, worst: worst ? { key: worst.key, label: worst.label, dropPct: worst.dropPct, diagnosis: diagnosis[worst.key] || "" } : null, cancelled, velocity, emptyCampaigns };
}

// ───────────────────────── 4. money ─────────────────────────

function buildMoney(raw: GrowthRaw, now: number) {
  const real = raw.transactions.filter(isRealPayment);
  const gmv = real.reduce((a, t) => a + num(t.gross_amount), 0);
  const fees = real.reduce((a, t) => a + num(t.platform_fee_amount), 0);
  const held = raw.transactions.filter(isEscrowHeld);
  const req = raw.transactions.filter(isPayoutRequested);
  const inRange = (from: number, to: number) => real.filter((t) => { const x = ts(t.created_at); return x != null && x >= from && x < to; });
  const sum = (l: any[], k: string) => l.reduce((a, t) => a + num(t[k]), 0);
  const w1 = inRange(now - 7 * DAY, now + 1), w0 = inRange(now - 14 * DAY, now - 7 * DAY);
  const m1 = inRange(now - 30 * DAY, now + 1), m0 = inRange(now - 60 * DAY, now - 30 * DAY);
  const oldestReq = Math.min(...req.map((t) => ts(t.created_at) ?? Infinity), Infinity);
  return {
    gmv: Math.round(gmv), netRevenue: Math.round(fees), takeRatePct: gmv > 0 ? round1((fees / gmv) * 100) : 0,
    payments: real.length,
    held: { amount: Math.round(held.reduce((a, t) => a + num(t.gross_amount), 0)), count: held.length },
    payouts: {
      pendingCount: req.length,
      pendingAmount: Math.round(req.reduce((a, t) => a + (num(t.creator_net_amount) || num(t.gross_amount)), 0)),
      oldestPaymentAgeDays: Number.isFinite(oldestReq) ? Math.floor((now - oldestReq) / DAY) : null,
      paidOutCount: real.filter(isPaidOut).length,
      // Payment received → payout sent, from the payout_completed_at the admin's "Mark paid" writes.
      velocity: (() => {
        const days: number[] = [];
        for (const t of real) {
          if (!isPaidOut(t)) continue;
          const a = ts(t.created_at), b = ts(t.payout_completed_at);
          if (a != null && b != null && b >= a) days.push((b - a) / DAY);
        }
        return { sample: days.length, avgDays: days.length ? round1(avg(days) as number) : null, medianDays: days.length ? round1(median(days) as number) : null };
      })(),
    },
    week: { gmv: Math.round(sum(w1, "gross_amount")), prevGmv: Math.round(sum(w0, "gross_amount")), fee: Math.round(sum(w1, "platform_fee_amount")) },
    month: { gmv: Math.round(sum(m1, "gross_amount")), prevGmv: Math.round(sum(m0, "gross_amount")), fee: Math.round(sum(m1, "platform_fee_amount")) },
  };
}

// ───────────────────────── 5. categories, acquisition, activation ─────────────────────────

function buildCategories(raw: GrowthRaw, ix: Indexes, now: number) {
  const demand = new Map<string, { campaigns: number; recent: number; prior: number; budget: number }>();
  const supply = new Map<string, number>();
  for (const c of raw.campaigns) {
    if (!ix.isBrandCampaign(c)) continue;
    const created = ts(c.created_at);
    for (const cat of splitTags(c.categories)) {
      const d = demand.get(cat) || { campaigns: 0, recent: 0, prior: 0, budget: 0 };
      d.campaigns++; d.budget += num(c.budget_max);
      if (created != null && now - created < 14 * DAY) d.recent++;
      else if (created != null && now - created < 28 * DAY) d.prior++;
      demand.set(cat, d);
    }
  }
  for (const cr of raw.creators) for (const t of splitTags(cr.niche)) supply.set(t, (supply.get(t) || 0) + 1);
  const keys = new Set([...demand.keys(), ...supply.keys()]);
  const rows = [...keys].map((k) => {
    const d = demand.get(k) || { campaigns: 0, recent: 0, prior: 0, budget: 0 };
    const creators = supply.get(k) || 0;
    const growth = change(d.recent, d.prior);
    const gap: "creators_needed" | "campaigns_needed" | "balanced" =
      d.campaigns >= 2 && creators < d.campaigns * 2 ? "creators_needed"
        : creators >= 5 && d.campaigns * 3 < creators ? "campaigns_needed" : "balanced";
    return { category: k, campaigns: d.campaigns, creators, avgBudget: d.campaigns ? Math.round(d.budget / d.campaigns) : 0, recent: d.recent, prior: d.prior, growthPct: growth, gap };
  }).sort((a, b) => (b.campaigns + b.creators) - (a.campaigns + a.creators)).slice(0, 10);
  const creatorsWithoutNiche = raw.creators.filter((c) => !splitTags(c.niche).length).length;
  return { rows, creatorsWithoutNiche };
}

function buildAcquisition(raw: GrowthRaw, ix: Indexes, now: number) {
  const referred = new Set<string>();
  for (const r of raw.referrals) if (r?.referred_id) referred.add(r.referred_id);
  const roleOf = (u: any) => String(u.role || "").toLowerCase();
  const people = raw.users.filter((u) => ["creator", "brand"].includes(roleOf(u)));
  const viaReferral = people.filter((u) => referred.has(u.user_id));
  const last30 = (u: any) => { const t = ts(u.created_at); return t != null && now - t < 30 * DAY; };
  const rewarded = raw.referrals.filter((r) => ["REWARDED", "COMPLETED", "PAID", "CONVERTED"].includes(up(r.status))).length;
  // Session 58: people who did not come by referral are split by users.signup_source once it is recorded.
  const tracked = !!raw.sourceTracked;
  const rest = people.filter((u) => !referred.has(u.user_id));
  const bySource = new Map<string, any[]>();
  const notRecorded: any[] = [];
  for (const u of rest) {
    const k = tracked ? String(u.signup_source || "").trim().toLowerCase() : "";
    if (!k) { notRecorded.push(u); continue; }
    bySource.set(k, [...(bySource.get(k) || []), u]);
  }
  const sourceChannels = [...bySource.entries()]
    .map(([k, list]) => ({ key: `src_${k}`, label: SOURCE_LABEL[k] || k, count: list.length, last30: list.filter(last30).length }))
    .sort((a, b) => b.count - a.count);
  return {
    total: people.length,
    channels: [
      { key: "referral", label: "Referral (Refer & Earn)", count: viaReferral.length, last30: viaReferral.filter(last30).length },
      ...sourceChannels,
      { key: "other", label: tracked ? "Source not recorded (joined before tracking started)" : "Direct / source not recorded", count: notRecorded.length, last30: notRecorded.filter(last30).length },
    ],
    referralPct: pct(viaReferral.length, people.length),
    referralsConverted: rewarded,
    referralsTotal: raw.referrals.length,
    trackingGap: !tracked,
    trackingNote: tracked
      ? "Tracking is on: every new signup is saved with where it came from. Tip: put ?utm_source=instagram (or meta / google…) on the links in your ads and bio."
      : "Which ad or site a signup came from (Instagram, Google, Meta…) is not saved yet, so those channels cannot be split. It needs one small database change — see docs/database/PENDING_DB_CHANGES.md.",
  };
}

function buildActivation(raw: GrowthRaw, ix: Indexes, now: number) {
  const creatorsSignedUp = raw.users.filter((u) => String(u.role || "").toLowerCase() === "creator").length;
  const brandsSignedUp = raw.users.filter((u) => String(u.role || "").toLowerCase() === "brand").length;
  const earning = new Set<string>(), paying = new Set<string>();
  const paidCount = new Map<string, Set<string>>();
  const lastPaid = new Map<string, number>();
  for (const tx of raw.transactions) {
    if (!isRealPayment(tx)) continue;
    const cr = ix.creatorOfTx(tx), br = ix.brandOfTx(tx);
    if (cr) earning.add(cr);
    if (br) {
      paying.add(br);
      const s = paidCount.get(br) || new Set<string>(); s.add(tx.deal_id || tx.ugc_order_id || tx.id); paidCount.set(br, s);
      lastPaid.set(br, Math.max(lastPaid.get(br) || 0, ts(tx.created_at) || 0));
    }
  }
  const brandsWithCampaign = new Set(raw.campaigns.filter((c) => ix.isBrandCampaign(c)).map((c) => c.brand_user_id));
  const brandsWithDeal = new Set(raw.deals.map((d) => d.brand_id).filter(Boolean));
  const creators = [
    { key: "signup", label: "Signed up", count: creatorsSignedUp },
    { key: "profile", label: "Created profile", count: raw.creators.length },
    { key: "kyc", label: "KYC approved", count: raw.creators.filter((c) => ix.kycOk.has(c.user_id)).length },
    { key: "rate", label: "Added rate card", count: raw.creators.filter((c) => hasRate(c.rate_card)).length },
    { key: "applied", label: "Applied to a campaign", count: [...ix.appCreators].filter((id) => ix.creatorsById.has(id)).length },
    { key: "earned", label: "Got a paid deal", count: [...earning].filter((id) => ix.creatorsById.has(id)).length },
  ];
  const brands = [
    { key: "signup", label: "Signed up", count: brandsSignedUp },
    { key: "profile", label: "Created profile", count: raw.brands.length },
    { key: "campaign", label: "Sent a campaign", count: [...brandsWithCampaign].filter((id) => ix.brandsById.has(id)).length },
    { key: "deal", label: "Accepted a creator", count: [...brandsWithDeal].filter((id) => ix.brandsById.has(id)).length },
    { key: "paid", label: "Paid for a deal", count: [...paying].filter((id) => ix.brandsById.has(id)).length },
  ];
  const withPct = (steps: { key: string; label: string; count: number }[]) =>
    steps.map((s, i) => ({ ...s, ofPrevPct: i === 0 ? 100 : pct(s.count, steps[i - 1].count), ofFirstPct: pct(s.count, steps[0].count) }));

  const payingBrands = [...paying];
  const repeat = payingBrands.filter((id) => (paidCount.get(id)?.size || 0) >= 2).length;
  const winBack = payingBrands
    .filter((id) => now - (lastPaid.get(id) || 0) >= GROWTH_RULES.winBackDays * DAY)
    .map((id) => {
      const total = raw.transactions.filter((t) => isRealPayment(t) && ix.brandOfTx(t) === id).reduce((a, t) => a + num(t.gross_amount), 0);
      const u = ix.usersById.get(id);
      return { user_id: id, name: ix.brandName(id), email: u?.email || null, lifetime: Math.round(total), daysQuiet: Math.floor((now - (lastPaid.get(id) || 0)) / DAY) };
    }).sort((a, b) => b.lifetime - a.lifetime).slice(0, 10);
  return {
    creators: withPct(creators), brands: withPct(brands),
    brandRetention: { payingBrands: payingBrands.length, repeatBrands: repeat, repeatPct: pct(repeat, payingBrands.length), winBack, winBackDays: GROWTH_RULES.winBackDays },
  };
}

// ───────────────────────── pulse + smart alerts ─────────────────────────

function buildPulse(raw: GrowthRaw, ix: Indexes, now: number, money: ReturnType<typeof buildMoney>) {
  const between = (rows: any[], key: string, from: number, to: number) => rows.filter((r) => { const t = ts(r[key]); return t != null && t >= from && t < to; }).length;
  const signups = raw.users.filter((u) => ["creator", "brand"].includes(String(u.role || "").toLowerCase()));
  const camps = raw.campaigns.filter((c) => ix.isBrandCampaign(c));
  const mk = (cur: number, prev: number) => ({ cur, prev, changePct: change(cur, prev) });
  return {
    signups: mk(between(signups, "created_at", now - 7 * DAY, now + 1), between(signups, "created_at", now - 14 * DAY, now - 7 * DAY)),
    campaigns: mk(between(camps, "created_at", now - 7 * DAY, now + 1), between(camps, "created_at", now - 14 * DAY, now - 7 * DAY)),
    applications: mk(between(raw.applications, "created_at", now - 7 * DAY, now + 1), between(raw.applications, "created_at", now - 14 * DAY, now - 7 * DAY)),
    gmv: { cur: money.week.gmv, prev: money.week.prevGmv, changePct: change(money.week.gmv, money.week.prevGmv) },
  };
}

export type Insight = { id: string; level: "action" | "warn" | "info" | "good"; title: string; body: string; cta?: { label: string; tab: string } };

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

function buildInsights(r: GrowthBase): Insight[] {
  const out: Insight[] = [];
  const L = GROWTH_RULES;
  const bs = r.geography.brandShortage[0];
  if (bs) out.push({ id: "brand-shortage", level: "action", title: `${bs.city}: creators are waiting, brands are missing`,
    body: `${bs.creators} creators but only ${bs.brands} brand${bs.brands === 1 ? "" : "s"} in ${bs.city}. ${bs.action}`, cta: { label: "See cities", tab: "where" } });
  const cs = r.geography.creatorShortage[0];
  if (cs) out.push({ id: "creator-shortage", level: "action", title: `${cs.city}: campaigns are not getting enough applicants`,
    body: `${cs.campaigns} campaigns got ${cs.applications} application${cs.applications === 1 ? "" : "s"} (${cs.appsPerCampaign ?? 0} per campaign, goal ${L.applicantsPerCampaignLimit}+). ${cs.action}`, cta: { label: "See cities", tab: "where" } });
  if (r.people.unpaidTotals.deals > 0) out.push({ id: "stuck-payment", level: "warn", title: `${r.people.unpaidTotals.deals} deal${r.people.unpaidTotals.deals === 1 ? "" : "s"} waiting for the brand's payment`,
    body: `${inr(r.people.unpaidTotals.amount)} is agreed but not paid for over ${L.stuckPaymentHours} hours, across ${r.people.unpaidTotals.brands} brand${r.people.unpaidTotals.brands === 1 ? "" : "s"}. A call or reminder closes this fastest.`, cta: { label: "See who", tab: "people" } });
  if (r.funnel.worst) out.push({ id: "funnel-drop", level: "warn", title: `Biggest drop: ${r.funnel.worst.label} (${r.funnel.worst.dropPct}% lost)`, body: r.funnel.worst.diagnosis, cta: { label: "Open funnel", tab: "funnel" } });
  if (r.funnel.emptyCampaigns.length) out.push({ id: "empty-campaigns", level: "warn", title: `${r.funnel.emptyCampaigns.length} live campaign${r.funnel.emptyCampaigns.length === 1 ? " has" : "s have"} no applicants`,
    body: `Live for ${L.emptyCampaignDays}+ days with nobody applying. Push these to creators or help the brand improve the brief.`, cta: { label: "See campaigns", tab: "funnel" } });
  if (r.people.incompleteCreators.total > 0) out.push({ id: "creator-incomplete", level: "warn", title: `${r.people.incompleteCreators.total} creators are not bookable yet`,
    body: `${r.people.incompleteCreators.needKyc} still need KYC and ${r.people.incompleteCreators.needRateCard} have no rate card. Send them a reminder.`, cta: { label: "See creators", tab: "people" } });
  if (r.money.payouts.pendingCount > 0) out.push({ id: "payout-wait", level: "warn", title: `${r.money.payouts.pendingCount} creator payout${r.money.payouts.pendingCount === 1 ? "" : "s"} waiting`,
    body: `${inr(r.money.payouts.pendingAmount)} to pay out${r.money.payouts.oldestPaymentAgeDays != null ? `; the oldest is from a payment ${r.money.payouts.oldestPaymentAgeDays} day(s) old` : ""}. Fast payouts keep creators coming back.`, cta: { label: "Open payouts", tab: "escrow&view=requests" } });
  const hot = r.categories.rows.find((c) => c.gap === "creators_needed" && (c.growthPct ?? 0) > 0);
  if (hot) out.push({ id: "category-gap", level: "action", title: `${hot.category}: more brands asking than creators available`,
    body: `${hot.campaigns} campaigns and ${hot.creators} creator${hot.creators === 1 ? "" : "s"}${hot.growthPct != null ? `; new campaigns are up ${hot.growthPct}% in the last 14 days` : ""}. Recruit ${hot.category.toLowerCase()} creators.`, cta: { label: "See categories", tab: "grow" } });
  if (r.activation.brandRetention.winBack.length) out.push({ id: "win-back", level: "action", title: `${r.activation.brandRetention.winBack.length} brands paid once and went quiet`,
    body: `No payment for ${L.winBackDays}+ days. Repeat brands are the cheapest growth — reach out with a new offer.`, cta: { label: "See brands", tab: "grow" } });
  const noCity = r.geography.unsetCity.creators + r.geography.unsetCity.brands;
  if (noCity > 0) out.push({ id: "city-missing", level: "info", title: `${noCity} accounts have no city`,
    body: "City-wise ad advice only counts accounts with a city. Ask people to add theirs (onboarding / settings).", cta: { label: "See cities", tab: "where" } });
  if (r.acquisition.trackingGap) out.push({ id: "tracking-gap", level: "info", title: "Signup source is not tracked yet", body: "You can't see which ad brings people until the source is saved at signup. Needs one small database change." });
  const s = r.pulse.signups;
  if (s.changePct != null && s.changePct >= 20 && s.cur >= 5) out.push({ id: "signup-up", level: "good", title: `Signups up ${s.changePct}% this week`, body: `${s.cur} new accounts vs ${s.prev} last week.` });
  if (s.changePct != null && s.changePct <= -20 && s.prev >= 5) out.push({ id: "signup-down", level: "warn", title: `Signups down ${Math.abs(s.changePct)}% this week`, body: `${s.cur} new accounts vs ${s.prev} last week. Check if ads or social posts slowed down.` });
  const g = r.pulse.gmv;
  if (g.changePct != null && g.changePct >= 20 && g.cur > 0) out.push({ id: "gmv-up", level: "good", title: `Deal value up ${g.changePct}% this week`, body: `${inr(g.cur)} vs ${inr(g.prev)} last week.` });
  const order = { action: 0, warn: 1, good: 2, info: 3 } as const;
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

// ───────────────────────── entry point ─────────────────────────

function buildBase(raw: GrowthRaw, nowDate: Date) {
  const now = nowDate.getTime();
  const ix = buildIndexes(raw);
  const money = buildMoney(raw, now);
  return {
    generatedAt: nowDate.toISOString(),
    rules: GROWTH_RULES,
    pulse: buildPulse(raw, ix, now, money),
    geography: buildGeography(raw, ix),
    people: buildPeople(raw, ix, now),
    funnel: buildFunnel(raw, ix, now),
    money,
    categories: buildCategories(raw, ix, now),
    acquisition: buildAcquisition(raw, ix, now),
    activation: buildActivation(raw, ix, now),
  };
}
type GrowthBase = ReturnType<typeof buildBase>;
export type GrowthReport = GrowthBase & { insights: Insight[] };

export function buildGrowthReport(raw: Partial<GrowthRaw>, now: Date = new Date()) {
  const safe: GrowthRaw = {
    users: raw.users || [], creators: raw.creators || [], brands: raw.brands || [], campaigns: raw.campaigns || [],
    applications: raw.applications || [], deals: raw.deals || [], transactions: raw.transactions || [],
    ugcOrders: raw.ugcOrders || [], sessions: raw.sessions === undefined ? null : raw.sessions,
    referrals: raw.referrals || [], kyc: raw.kyc || [], sourceTracked: !!raw.sourceTracked,
  };
  const base = buildBase(safe, now);
  const report: GrowthReport = { ...base, insights: buildInsights(base) };
  return report;
}

// ───────────────────────── reminder targets (used by the "Send reminder" buttons) ─────────────────────────

export type NudgeKind = "creator_profile" | "brand_payment";

/** Who a reminder goes to. The server recomputes this itself — it never trusts ids sent by the browser. */
export function nudgeTargets(raw: Partial<GrowthRaw>, kind: NudgeKind, now: Date = new Date()): { user_id: string; message: string }[] {
  const full: GrowthRaw = {
    users: raw.users || [], creators: raw.creators || [], brands: raw.brands || [], campaigns: raw.campaigns || [],
    applications: raw.applications || [], deals: raw.deals || [], transactions: raw.transactions || [],
    ugcOrders: raw.ugcOrders || [], sessions: null, referrals: raw.referrals || [], kyc: raw.kyc || [],
  };
  const ix = buildIndexes(full);
  const t = now.getTime();
  if (kind === "creator_profile") {
    return full.creators.map((c) => {
      const needsKyc = !ix.kycOk.has(c.user_id);
      const needsRate = !hasRate(c.rate_card);
      if (!needsKyc && !needsRate) return null;
      const todo = [needsKyc ? "KYC" : "", needsRate ? "rate card" : ""].filter(Boolean).join(" and ");
      return { user_id: c.user_id as string, message: `Finish your Ybex profile: add your ${todo} so brands can book you and you can get paid.` };
    }).filter((x): x is { user_id: string; message: string } => !!x && !!x.user_id);
  }
  const by = new Map<string, number>();
  for (const d of full.deals) {
    if (isCancelled(d) || up(d.status) !== "NEGOTIATING") continue;
    if ((ix.paymentsByDeal.get(d.id) || []).length) continue;
    const created = ts(d.created_at);
    if (created != null && t - created < GROWTH_RULES.stuckPaymentHours * HOUR) continue;
    if (d.brand_id) by.set(d.brand_id, (by.get(d.brand_id) || 0) + 1);
  }
  return [...by.entries()].map(([id, n]) => ({
    user_id: id,
    message: `You have ${n} creator${n === 1 ? "" : "s"} waiting to start. Complete the payment so the work can begin.`,
  }));
}
