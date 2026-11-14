// Session 34 (Ravi): "Important for you" on the BRAND desktop dashboard — the same one-card
// rotator as the creator (components/dashboard/ImportantForYou.jsx), built from real data only.
// Order (Ravi):
//   1. Content to review: UGC draft / live link (GET ugc/orders/brand, status = resolved stage),
//      and campaign deal threads waiting on the brand for a draft / live link (flow_state).
//   2. Deal room — brand's turn (GET chat/v2/threads): creator counter offer, agreement to sign,
//      escrow to fund.
//   3. New (pending) applicants per campaign (GET /brands/me/application-stats).
//   4. KYC to verify / under review (GET /verifications/me).
//   5. Company profile incomplete (GET brands/me).
//   6. Nothing pending → "Post a campaign" and "Explore creators".
// No always-on promo tasks. Desktop only — brand mobile home has its own "Needs action".
import { TASK_THEMES, kycState, timeAgo } from "./creatorTasks";

const rupees = (n) => `₹${Math.round(Number(n)).toLocaleString("en-IN")}`;
const up = (s) => String(s || "").toUpperCase().trim();
const initialOf = (s, fb = "•") => (String(s || "").trim()[0] || fb).toUpperCase();
const ENDED = new Set(["COMPLETED", "CANCELLED", "EXPIRED", "PARTIALLY_CANCELLED"]);

const amountOf = (t) => Number(t?.counter_amount || t?.agreed_amount || t?.amount_fixed || 0) || 0;
const creatorName = (x) => x?.creator?.name || x?.creator_name || "Creator";
const threadRoute = (t) => `/brand/inbox/${encodeURIComponent(t.id)}`;

/** Company profile: five equal parts, from the brand_profiles row. */
export function brandProfileStrength(p = {}) {
  const b = p || {};
  const parts = [
    { label: "Company name", done: Boolean(String(b.company_name || "").trim()) },
    { label: "Logo", done: Boolean(b.logo || b.logo_url) },
    { label: "Industry", done: Boolean(String(b.industry || b.category || "").trim()) },
    { label: "About", done: Boolean(String(b.description || b.about || "").trim()) },
    { label: "Website", done: Boolean(String(b.website || "").trim()) },
  ];
  const done = parts.filter((x) => x.done).length;
  return { percent: done * 20, missing: parts.filter((x) => !x.done).map((x) => x.label) };
}

/** Is it the brand's turn on this campaign deal thread? Returns the step, or null. */
export function brandDealStep(t) {
  if (!t || t.is_ugc || t.deal_type === "UGC" || t.type === "ugc") return null;
  const state = up(t.flow_state || t.status);
  if (ENDED.has(state)) return null;
  const brandSigned = Boolean(t.agreement_signed_brand || t.is_signed_brand || t.brand_signed || t.contract_signed_brand);
  const creatorSigned = Boolean(t.agreement_signed_creator || t.is_signed_creator || t.creator_signed || t.contract_signed_creator);
  const funded = Boolean(t.payment_funded || t.escrow_hold || t.escrow_funded);

  if (state === "SUBMITTED") return "review_draft";
  if (state === "PROOF_SUBMITTED") return "review_link";
  if (state === "NEGOTIATING_COUNTER") {
    // Who sent the latest offer is only on the message (backend brand-accept-counter reads it the
    // same way). Only claim "creator countered" when the last message IS the creator's offer.
    const m = t.last_message;
    const isOffer = m && (m.message_type === "negotiation_offer" || m?.metadata?.action === "negotiation_offer");
    return isOffer && String(m.sender_user_id) === String(t.creator_id) ? "counter" : null;
  }
  if (brandSigned && creatorSigned) return funded ? null : "fund";
  if (!brandSigned && (state === "AI_AGREEMENT_READY" || creatorSigned)) return "sign";
  return null;
}

/**
 * @returns {Array<{id, kind, theme, initial, kicker, brand, title, m1l, m1v, m2l, m2v, cta, action}>}
 *   action = { type: "route", to }
 */
export function buildBrandTasks({
  ugcOrders = [], threads = [], applications = [], campaigns = [],
  kycStatus = null, kycVerified = false, profile = null, profileLoaded = false, now = Date.now(),
} = {}) {
  const tasks = [];

  // 1. Content to review (UGC orders + campaign deal threads)
  for (const o of Array.isArray(ugcOrders) ? ugcOrders : []) {
    const st = up(o?.status);
    if (st !== "SUBMITTED" && st !== "PROOF_SUBMITTED") continue;
    const link = st === "PROOF_SUBMITTED";
    tasks.push({
      id: `ugc_${link ? "link" : "draft"}_${o.id}`, kind: "review", theme: TASK_THEMES.invite,
      initial: initialOf(creatorName(o), "U"), logo: o.creator_avatar || "",
      kicker: link ? "UGC · LIVE LINK TO APPROVE" : "UGC · DRAFT TO REVIEW",
      brand: creatorName(o),
      title: o.brief?.title || o.title || "UGC order",
      m1l: "PAYOUT", m1v: Number(o.creator_payout || o.amount || 0) > 0 ? rupees(o.creator_payout || o.amount) : "See order",
      m2l: "SENT", m2v: timeAgo(o.updated_at || o.submitted_at || o.created_at, now) || "Recently",
      cta: link ? "Check live link" : "Review draft",
      action: { type: "route", to: "/brand/ugc/orders" },
    });
  }
  const list = Array.isArray(threads) ? threads : [];
  const steps = list.map((t) => ({ t, step: brandDealStep(t) })).filter((x) => x.step);
  for (const { t, step } of steps.filter((x) => x.step === "review_draft" || x.step === "review_link")) {
    const link = step === "review_link";
    tasks.push({
      id: `deal_${step}_${t.id}`, kind: "review", theme: TASK_THEMES.invite,
      initial: initialOf(creatorName(t), "C"), logo: t.creator?.picture || "",
      kicker: link ? "CAMPAIGN · LIVE LINK TO APPROVE" : "CAMPAIGN · DRAFT TO REVIEW",
      brand: creatorName(t), title: t.campaign_title || "Campaign deal",
      m1l: "AGREED FEE", m1v: amountOf(t) ? rupees(amountOf(t)) : "See deal",
      m2l: "SENT", m2v: timeAgo(t.updated_at, now) || "Recently",
      cta: link ? "Check live link" : "Review draft",
      action: { type: "route", to: threadRoute(t) },
    });
  }

  // 2. Deal room — brand's turn
  const DEAL = {
    counter: { kicker: "DEAL ROOM · COUNTER OFFER", m1l: "CREATOR ASKS", m2v: "Accept or counter", cta: "Respond" },
    sign: { kicker: "DEAL ROOM · AGREEMENT", m1l: "AGREED FEE", m2v: "Sign the agreement", cta: "Sign now" },
    fund: { kicker: "DEAL ROOM · FUND PAYMENT", m1l: "TO FUND", m2v: "Creator starts after this", cta: "Fund payment" },
  };
  for (const key of ["counter", "sign", "fund"]) {
    for (const { t } of steps.filter((x) => x.step === key)) {
      const d = DEAL[key];
      tasks.push({
        id: `deal_${key}_${t.id}`, kind: "deal", theme: key === "fund" ? TASK_THEMES.deadline : TASK_THEMES.profile,
        initial: initialOf(creatorName(t), "C"), logo: t.creator?.picture || "",
        kicker: d.kicker, brand: creatorName(t), title: t.campaign_title || "Campaign deal",
        m1l: d.m1l, m1v: amountOf(t) ? rupees(amountOf(t)) : "See deal",
        m2l: "NEXT STEP", m2v: d.m2v, cta: d.cta,
        action: { type: "route", to: threadRoute(t) },
      });
    }
  }

  // 3. New applicants per campaign (pending = not accepted / rejected yet)
  const titles = new Map((Array.isArray(campaigns) ? campaigns : []).map((c) => [String(c.campaign_id || c.id), c.title || c.campaign_title || "Campaign"]));
  const byCampaign = new Map();
  for (const a of Array.isArray(applications) ? applications : []) {
    if (!a?.campaign_id) continue;
    const s = up(a.status);
    if (s && s !== "PENDING" && s !== "APPLIED") continue;
    const k = String(a.campaign_id);
    const cur = byCampaign.get(k) || { count: 0, latest: 0 };
    cur.count += 1;
    cur.latest = Math.max(cur.latest, new Date(a.applied_at || a.created_at || 0).getTime() || 0);
    byCampaign.set(k, cur);
  }
  [...byCampaign.entries()].sort((a, b) => b[1].latest - a[1].latest).forEach(([cid, v]) => {
    tasks.push({
      id: `applicants_${cid}`, kind: "applicants", theme: TASK_THEMES.explore,
      initial: String(v.count > 99 ? "99+" : v.count),
      kicker: "NEW APPLICANTS", brand: titles.get(cid) || "Your campaign",
      title: `${v.count} new applicant${v.count === 1 ? "" : "s"} to review`,
      m1l: "WAITING", m1v: String(v.count), m2l: "LATEST", m2v: v.latest ? timeAgo(v.latest, now) : "Recently",
      cta: "Review applicants",
      action: { type: "route", to: `/brand/campaigns/${encodeURIComponent(cid)}/applicants` },
    });
  });

  // 4. KYC
  const kyc = kycState(kycStatus, kycVerified);
  if (kyc === "none" || kyc === "rejected") {
    tasks.push({
      id: "kyc", kind: "kyc", theme: TASK_THEMES.kyc, initial: "KYC",
      kicker: kyc === "rejected" ? "BUSINESS KYC · REJECTED" : "BUSINESS KYC", brand: "GST / PAN",
      title: kyc === "rejected" ? "Fix your business KYC" : "Verify your business",
      m1l: "STATUS", m1v: kyc === "rejected" ? "Rejected" : "Not verified",
      m2l: "NEEDED FOR", m2v: "Paying creators",
      cta: kyc === "rejected" ? "Fix KYC" : "Verify now",
      action: { type: "route", to: "/brand/kyc" },
    });
  } else if (kyc === "pending") {
    tasks.push({
      id: "kyc_review", kind: "kyc", theme: TASK_THEMES.kyc, initial: "KYC",
      kicker: "BUSINESS KYC · UNDER REVIEW", brand: "GST / PAN", title: "Your KYC is being checked",
      m1l: "STATUS", m1v: "Submitted", m2l: "USUALLY", m2v: "24–48 hours",
      cta: "Check status", action: { type: "route", to: "/brand/kyc" },
    });
  }

  // 5. Company profile
  if (profileLoaded) {
    const { percent, missing } = brandProfileStrength(profile || {});
    if (percent < 100) {
      tasks.push({
        id: "profile", kind: "profile", theme: TASK_THEMES.profile, initial: `${percent}%`,
        kicker: "COMPANY PROFILE", brand: "Public brand page", title: "Complete your company profile",
        m1l: "DONE", m1v: `${percent}%`, m2l: "MISSING", m2v: missing.join(", "),
        cta: "Finish profile", action: { type: "route", to: "/brand/profile" },
      });
    }
  }

  // 6. Nothing pending
  if (tasks.length === 0) {
    tasks.push(
      {
        id: "post_campaign", kind: "explore", theme: TASK_THEMES.explore, initial: "★",
        kicker: "ALL CAUGHT UP", brand: "Ybex", title: "Post a campaign",
        m1l: "CAMPAIGNS", m1v: String((Array.isArray(campaigns) ? campaigns : []).length), m2l: "NEXT STEP", m2v: "Get creator applications",
        cta: "Post a campaign", action: { type: "route", to: "/brand/campaigns/create" },
      },
      {
        id: "explore_creators", kind: "explore", theme: TASK_THEMES.explore, initial: "★",
        kicker: "ALL CAUGHT UP", brand: "Ybex", title: "Explore creators",
        m1l: "INVITE", m1v: "Directly", m2l: "NEXT STEP", m2v: "Find creators for your brand",
        cta: "Explore creators", action: { type: "route", to: "/creators" },
      },
    );
  }
  return tasks;
}
