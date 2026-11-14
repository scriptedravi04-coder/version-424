import express from "express";

// Session 29 (Ravi): the creator dashboard showed invented numbers — fixed trend pills
// ("+18% (180)", "+22% (₹4.2k)"), hardcoded sparklines, "Monthly Earnings" that was really the sum
// of every payment sitting in escrow, ₹0 on every deal card (it read a field that does not exist),
// a stock shoe photo and "Brand Partner" for brands without a logo/name. It also called the public
// profile route, which adds +1 profile view on every dashboard load and every live refresh.
//
// GET /dashboard/creator returns only numbers the server can stand behind (rule: a money claim in
// the UI must match the server). The money rules are the SAME as the Earnings page
// (src/pages/dashboard/Earnings.jsx): released = payout RELEASED / PAID / has a UTR or payout
// reference; the creator's share = creator_net_amount, else net_amount, else gross − platform fee.
// WHO: the logged-in creator, own data only. Read-only; nothing here writes.

export const DEAL_STAGE: Record<string, { group: "negotiating" | "in_progress" | "brand_review" | "ended"; label: string; creator_action?: string }> = {
  BRIEF_SENT: { group: "negotiating", label: "Brief received", creator_action: "Reply to the brief" },
  NEGOTIATING: { group: "negotiating", label: "Negotiating" },
  NEGOTIATING_COUNTER: { group: "negotiating", label: "Negotiating" },
  AI_AGREEMENT_READY: { group: "negotiating", label: "Agreement ready", creator_action: "Sign the agreement" },
  ACTIVE: { group: "in_progress", label: "In progress", creator_action: "Upload your draft" },
  SUBMITTED: { group: "brand_review", label: "Draft with brand" },
  CHANGES_REQUESTED: { group: "in_progress", label: "Changes requested", creator_action: "Upload the changes" },
  REVISION_REQ: { group: "in_progress", label: "Changes requested", creator_action: "Upload the changes" },
  REVISION_DECLINED: { group: "brand_review", label: "Revision declined" },
  CONTENT_APPROVED: { group: "in_progress", label: "Draft approved", creator_action: "Post and add the live link" },
  PROOF_SUBMITTED: { group: "brand_review", label: "Live link with brand" },
  REVISION_REQUESTED_LINKS: { group: "in_progress", label: "Link changes requested", creator_action: "Fix the live link" },
  REVISION_DECLINED_LINKS: { group: "brand_review", label: "Live link under review" },
  COMPLETED: { group: "ended", label: "Completed" },
  CANCELLED: { group: "ended", label: "Cancelled" },
  EXPIRED: { group: "ended", label: "Expired" },
  PARTIALLY_CANCELLED: { group: "ended", label: "Partly cancelled" },
};

// UGC order tokens (backend/statusTokens.ts UGC_ORDER_STATUSES).
export const UGC_STAGE: Record<string, { group: "in_progress" | "brand_review" | "ended"; label: string; creator_action?: string }> = {
  ACCEPTED: { group: "in_progress", label: "In progress", creator_action: "Upload your video" },
  SUBMITTED: { group: "brand_review", label: "Video with brand" },
  IN_REVIEW: { group: "brand_review", label: "Video with brand" },
  REVISION_REQ: { group: "in_progress", label: "Changes requested", creator_action: "Upload the changes" },
  REVISION_DECLINED: { group: "brand_review", label: "Revision declined" },
  CONTENT_APPROVED: { group: "ended", label: "Approved" },
  COMPLETED: { group: "ended", label: "Completed" },
  CANCELLED: { group: "ended", label: "Cancelled" },
  EXPIRED: { group: "ended", label: "Expired" },
};

const num = (v: any): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function isReleasedTx(t: any): boolean {
  return t?.payout_status === "RELEASED" || t?.payout_status === "PAID" || Boolean(t?.utr_number || t?.utrNumber || t?.payout_reference);
}

/** Creator's share of one transaction — same order as the Earnings page. */
export function txNet(t: any, feeConfig: any): number {
  const direct = num(t?.creator_net_amount) ?? num(t?.net_amount);
  if (direct !== null) return direct;
  const gross = Number(t?.gross_amount || t?.amount || 0);
  let fee = num(t?.platform_fee_amount) ?? num(t?.fee_amount);
  if (fee === null) {
    const threshold = num(feeConfig?.threshold_amount) || 20000;
    const below = num(feeConfig?.below_threshold_rate) ?? 15;
    const above = num(feeConfig?.above_threshold_rate) ?? 5;
    const rate = gross < threshold ? below : above;
    fee = Math.round(gross * (rate / 100) * 100) / 100;
  }
  return Math.max(0, Math.round((gross - fee) * 100) / 100);
}

const IST_MONTH = (d: any): string | null => {
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7); // YYYY-MM
};

export function summariseEarnings(txns: any[], feeConfig: any, now: Date = new Date()) {
  const thisMonth = IST_MONTH(now);
  let released_total = 0, released_this_month = 0, in_escrow = 0, paid_out_count = 0;
  for (const t of txns || []) {
    const net = txNet(t, feeConfig);
    if (isReleasedTx(t)) {
      released_total += net;
      paid_out_count += 1;
      const when = t.payout_completed_at || t.payout_released_at || t.created_at || t.updated_at;
      if (IST_MONTH(when) === thisMonth) released_this_month += net;
    } else if (t?.status !== "REFUNDED") {
      in_escrow += net;
    }
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return { released_total: r(released_total), released_this_month: r(released_this_month), in_escrow: r(in_escrow), paid_out_count, month: thisMonth };
}

type Row = Record<string, any>;

export function buildWorkItems({ deals = [], threadsByDeal = {}, ugcOrders = [], brands = {}, campaigns = {}, briefs = {} }: {
  deals?: Row[]; threadsByDeal?: Record<string, Row>; ugcOrders?: Row[]; brands?: Record<string, Row>; campaigns?: Record<string, Row>; briefs?: Record<string, Row>;
}) {
  const items: Row[] = [];
  for (const d of deals) {
    const thread = threadsByDeal[String(d.id)] || null;
    const token = String(thread?.flow_state || d.status || "").toUpperCase();
    const stage = DEAL_STAGE[token] || { group: "in_progress", label: token ? token.replace(/_/g, " ").toLowerCase() : "In progress" };
    const brand = brands[d.brand_id] || null;
    items.push({
      kind: "campaign",
      id: d.id,
      thread_id: thread?.id || null,
      title: campaigns[d.campaign_id]?.title || d.deliverables || null,
      brand_id: d.brand_id || null,
      brand_name: brand?.company_name || null, // null → the screen shows its own placeholder, never a made-up name
      brand_logo: brand?.logo || null,
      status: token || null,
      stage_group: stage.group,
      stage_label: stage.label,
      creator_action: (stage as any).creator_action || null,
      // What the brand agreed to pay (gross). Not the creator's net — label it "Agreed fee".
      amount: num(d.agreed_amount) ?? num(thread?.agreed_amount),
      amount_kind: "agreed_fee",
      deadline: d.content_deadline || null,
      updated_at: d.updated_at || thread?.updated_at || d.created_at || null,
    });
  }
  for (const o of ugcOrders) {
    const token = String(o.status || "").toUpperCase();
    const stage = UGC_STAGE[token] || { group: "in_progress", label: token ? token.replace(/_/g, " ").toLowerCase() : "In progress" };
    const brand = brands[o.brand_id] || null;
    const brief = briefs[o.brief_id] || null;
    items.push({
      kind: "ugc",
      id: o.id,
      thread_id: o.thread_id || null,
      title: brief?.title || brief?.product_name || null,
      brand_id: o.brand_id || null,
      brand_name: brand?.company_name || null,
      brand_logo: brand?.logo || null,
      status: token || null,
      stage_group: stage.group,
      stage_label: stage.label,
      creator_action: (stage as any).creator_action || null,
      // The creator's payout for this order (already net of Ybex's UGC commission).
      amount: num(o.creator_payout),
      amount_kind: "your_payout",
      // Session 33: the creator's own timer (rule 50, starts at signing) comes first.
      deadline: o.internal_deadline || o.deadline || o.due_at || null,
      updated_at: o.updated_at || o.created_at || null,
    });
  }
  items.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  return items;
}

export function buildCreatorDashboard(input: {
  txns?: Row[]; feeConfig?: any; deals?: Row[]; threadsByDeal?: Record<string, Row>; ugcOrders?: Row[];
  brands?: Record<string, Row>; campaigns?: Record<string, Row>; briefs?: Record<string, Row>;
  profileViews?: number | null; acceptedApplications?: number; now?: Date;
}) {
  const work = buildWorkItems(input);
  const open = work.filter((w) => w.stage_group !== "ended");
  const ended = work.filter((w) => w.stage_group === "ended");
  const brandIds = new Set(work.filter((w) => w.stage_group !== "ended" || w.status === "COMPLETED").map((w) => w.brand_id).filter(Boolean));
  return {
    generated_at: (input.now || new Date()).toISOString(),
    earnings: summariseEarnings(input.txns || [], input.feeConfig, input.now),
    counts: {
      open_work: open.length,
      needs_your_action: open.filter((w) => w.creator_action).length,
      with_brand: open.filter((w) => w.stage_group === "brand_review").length,
      negotiating: open.filter((w) => w.stage_group === "negotiating").length,
      completed: ended.filter((w) => w.status === "COMPLETED" || w.status === "CONTENT_APPROVED").length,
      brands_worked_with: brandIds.size,
      accepted_applications: input.acceptedApplications || 0,
      profile_views: input.profileViews ?? null,
    },
    // Newest first. The screen decides how many to show.
    open_work: open,
    recent_completed: ended.slice(0, 10),
  };
}

export function setupCreatorDashboardRoutes(
  router: express.Router,
  { supabase, privilegedSupabase, getDb, parseAuthUser, fetchUserScopedTransactions, getFullFeeAndReferralConfig }: {
    supabase: any; privilegedSupabase: any; getDb: () => any; parseAuthUser: (req: any) => Promise<any>;
    fetchUserScopedTransactions: (userId: string, role?: string) => Promise<any[]>;
    getFullFeeAndReferralConfig: () => Promise<any>;
  }
) {
  router.get("/dashboard/creator", async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    if (user.role !== "creator") return res.status(403).json({ error: "Creators only" });
    const me = String(user.user_id);

    const [txns, feeConfig] = await Promise.all([
      fetchUserScopedTransactions(me, user.role).catch(() => []),
      getFullFeeAndReferralConfig().catch(() => null),
    ]);
    // Only this creator's side of each transaction.
    const myTxns = (txns || []).filter((t: any) => !t.creator_id || String(t.creator_id) === me);

    const client = privilegedSupabase || supabase;
    if (!client) {
      const db = getDb() || {};
      const deals = (db.deals || []).filter((d: any) => String(d.creator_id) === me);
      const threadsByDeal: Record<string, any> = {};
      (db.chat_threads || []).forEach((t: any) => { if (t.deal_id) threadsByDeal[String(t.deal_id)] = t; });
      const brands: Record<string, any> = {};
      (db.brand_profiles || []).forEach((b: any) => { brands[b.user_id] = b; });
      const profile = (db.creator_profiles || []).find((p: any) => String(p.user_id) === me);
      return res.json(buildCreatorDashboard({
        txns: myTxns, feeConfig, deals, threadsByDeal, brands,
        ugcOrders: (db.ugc_orders || []).filter((o: any) => String(o.creator_id) === me),
        profileViews: profile ? Number(profile.profile_views || 0) : null,
      }));
    }

    try {
      const [dealsRes, ugcRes, profileRes, appsRes] = await Promise.all([
        client.from("deals").select("id, brand_id, campaign_id, status, agreed_amount, deliverables, content_deadline, created_at, updated_at").eq("creator_id", me),
        client.from("ugc_orders").select("*").eq("creator_id", me),
        client.from("creator_profiles").select("profile_views").eq("user_id", me).maybeSingle(),
        client.from("campaign_applications").select("application_id", { count: "exact", head: true }).eq("creator_id", me).in("status", ["accepted", "approved"]),
      ]);
      const deals = dealsRes?.data || [];
      const ugcOrders = ugcRes?.data || [];
      const dealIds = deals.map((d: any) => d.id).filter(Boolean);
      const brandIds = Array.from(new Set([...deals, ...ugcOrders].map((r: any) => r.brand_id).filter(Boolean)));
      const campaignIds = Array.from(new Set(deals.map((d: any) => d.campaign_id).filter(Boolean)));
      const briefIds = Array.from(new Set(ugcOrders.map((o: any) => o.brief_id).filter(Boolean)));

      const [threadsRes, brandsRes, campsRes, briefsRes] = await Promise.all([
        dealIds.length ? client.from("chat_threads").select("id, deal_id, flow_state, agreed_amount, updated_at").in("deal_id", dealIds) : { data: [] },
        brandIds.length ? client.from("brand_profiles").select("user_id, company_name, logo").in("user_id", brandIds) : { data: [] },
        campaignIds.length ? client.from("campaigns").select("campaign_id, title").in("campaign_id", campaignIds) : { data: [] },
        briefIds.length ? client.from("ugc_briefs").select("*").in("id", briefIds) : { data: [] },
      ]);
      const threadsByDeal: Record<string, any> = {};
      (threadsRes?.data || []).forEach((t: any) => { if (t.deal_id) threadsByDeal[String(t.deal_id)] = t; });
      const brands: Record<string, any> = {};
      (brandsRes?.data || []).forEach((b: any) => { brands[b.user_id] = b; });
      const campaigns: Record<string, any> = {};
      (campsRes?.data || []).forEach((c: any) => { campaigns[c.campaign_id] = c; });
      const briefs: Record<string, any> = {};
      (briefsRes?.data || []).forEach((b: any) => { briefs[b.id] = b; });

      return res.json(buildCreatorDashboard({
        txns: myTxns, feeConfig, deals, threadsByDeal, ugcOrders, brands, campaigns, briefs,
        profileViews: profileRes?.data ? Number(profileRes.data.profile_views || 0) : null,
        acceptedApplications: appsRes?.count || 0,
      }));
    } catch (e: any) {
      console.error("[/dashboard/creator]", e?.message || e);
      return res.status(503).json({ error: "Could not load your dashboard. Please try again.", code: "DASHBOARD_FAILED" });
    }
  });
}
