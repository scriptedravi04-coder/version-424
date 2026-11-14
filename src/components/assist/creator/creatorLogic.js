// Session 54 (Ravi: "jaise brand panel ke liye chatbot banaya hai, waisa hi creator panel ke liye bhi … pura system"):
// Eva for CREATORS — the pure brain. No React, no server call, no storage: it reads a sentence, works out what
// the creator wants, and does the maths (campaign match, profile score, fair rate, earnings, deadlines…).
// Everything works with the AI off. The data comes from tools.js (the same lists the creator's screens load).
import { NICHES, nichesIn, cityIn, parseCount, numOf } from "../brand/brandLogic";
import { inr } from "../../feedback/assistKnowledge";

const lower = (t) => String(t || "").toLowerCase();
export const DAY = 864e5;
// v328: creator-facing counts in Indian style — 1.5 lakh → "1.5L", 1.2 crore → "1.2Cr"; thousands stay "15K".
export const shortNum = (n) => {
  const v = Number(n) || 0;
  const one = (x) => x.toFixed(x >= 10 ? 0 : 1).replace(/\.0$/, "");
  if (v >= 1e7) return `${one(v / 1e7)}Cr`;
  if (v >= 1e5) return `${one(v / 1e5)}L`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}K`;
  return String(Math.round(v));
};
// v328: IST (Asia/Kolkata, +5:30) helpers for month buckets.
const IST = 5.5 * 3600e3;
export const istMonth = (d) => { const t = d instanceof Date ? d.getTime() : Date.parse(d || ""); return Number.isFinite(t) ? new Date(t + IST).toISOString().slice(0, 7) : ""; };

// ── the creator's own profile ───────────────────────────────────────────────────────────────────────
export const followersOfMe = (p) => parseCount(p?.followers_instagram || p?.follower_count || p?.ig_followers || 0) + parseCount(p?.followers_youtube || p?.yt_subscribers || 0);
export const reachOfMe = (p) => parseCount(p?.avg_views_30d || p?.instagram_avg_reach || p?.avg_reach || p?.rate_card?.avg_reach || p?.rate_card?.instagram_avg_reach || 0);
export const nichesOfMe = (p) => {
  const raw = [p?.category, p?.primary_niche, p?.niche, ...(Array.isArray(p?.sub_categories) ? p.sub_categories : []), ...(Array.isArray(p?.categories) ? p.categories : [])]
    .concat(Array.isArray(p?.content_niches) ? p.content_niches : String(p?.content_niches || "").split(","))
    .filter(Boolean).map((x) => lower(x).trim()).filter(Boolean);
  return [...new Set(raw)];
};
/** The app's niche groups (Fashion, Food…) this creator belongs to. */
export const nicheGroupsOfMe = (p) => [...new Set(nichesOfMe(p).flatMap((n) => nichesIn(n)).concat(nichesIn(nichesOfMe(p).join(" "))))];
const photoOfMe = (p) => p?.picture || p?.photo || p?.avatar_url || p?.profile_picture || "";
const portfolioOf = (p) => (Array.isArray(p?.portfolio) ? p.portfolio : []).filter(Boolean);
export const myRates = (p) => ({
  reel: Number(p?.rate_reel || p?.reel_rate || p?.rate_card?.reel || p?.rate_card?.reels || 0) || 0,
  story: Number(p?.rate_story || p?.story_rate || p?.rate_card?.story || p?.rate_card?.stories || 0) || 0,
  yt: Number(p?.rate_yt_video || p?.rate_card?.yt_video || p?.rate_card?.youtube_integration || 0) || 0,
});

// ── does a campaign / brief fit this creator? (same keyword rule as the Apply check in CampaignDetail) ──
const words = (s) => String(s || "").toLowerCase().replace(/[&,/]/g, " ").split(/\s+/).map((w) => w.trim()).filter((w) => w.length > 2 && !["and", "the", "for", "with"].includes(w));
export function categoryMatches(campaignCategories, creatorNiches) {
  const camp = (campaignCategories || []).map((c) => lower(c).trim()).filter(Boolean);
  if (!camp.length) return true;
  if (!creatorNiches.length) return false;
  const ck = creatorNiches.flatMap(words), kk = camp.flatMap(words);
  if (kk.some((a) => ck.some((b) => b.includes(a) || a.includes(b)))) return true;
  return camp.some((a) => creatorNiches.some((b) => b.includes(a) || a.includes(b)));
}
const campCategories = (c) => (Array.isArray(c?.categories) ? c.categories : c?.category ? [c.category] : []);
const budgetOf = (c) => Number(c?.budget_max || c?.budget || c?.budget_min || 0) || 0;
const deadlineOf = (c) => Date.parse(c?.deadline || c?.apply_by || c?.end_date || "") || 0;

/** Campaigns + UGC briefs ranked for this creator: { kind, id, title, brand, budget, deadline, score, why[] } */
export function rankOpportunities({ campaigns = [], briefs = [] } = {}, profile = {}, { applied = [], now = Date.now(), niches = null } = {}) {
  // v431 (Eva audit #5): a niche named in the message ("beauty campaigns") wins over the profile niche.
  const asked = (Array.isArray(niches) ? niches : []).map((n) => lower(n).trim()).filter(Boolean);
  const mine = asked.length ? asked : nichesOfMe(profile);
  const groups = asked.length ? [...new Set(asked.flatMap((n) => nichesIn(n)).concat(niches))] : nicheGroupsOfMe(profile);
  // v431 (Eva audit #7): no niche on the profile → show everything (Eva asks them to set one) instead of nothing.
  const anyNiche = !mine.length || niches === "all"; // v435: "all" = every live campaign (apply to a brand by name)
  const city = lower(profile?.city);
  const fol = followersOfMe(profile);
  const appliedIds = new Set(applied.map((a) => String(a.campaign_id || a.id)));
  const out = [];
  for (const c of campaigns || []) {
    const id = String(c.campaign_id || c.id || "");
    if (!id) continue;
    const st = lower(c.status || c.stage);
    if (st && !["live", "approved"].includes(st)) continue;
    if (c.applications_paused || c.closed_at) continue; // v328: paused / closed campaigns don't take applications (backend/campaignManage applyBlockReason)
    const dl = deadlineOf(c);
    if (dl && dl + DAY < now) continue;
    const cats = campCategories(c);
    if (!anyNiche && !categoryMatches(cats, mine)) continue;
    let score = 40; const why = [];
    if (cats.length && mine.length) { score += 25; why.push(cats.slice(0, 2).join(", ")); }
    const loc = lower(`${c.location_type || ""} ${Array.isArray(c.specific_locations) ? c.specific_locations.join(" ") : ""} ${c.city || ""}`);
    if (city && loc.includes(city)) { score += 10; why.push(profile.city); }
    if (c.follower_min && fol && fol < Number(c.follower_min)) { score -= 25; why.push(`needs ${shortNum(c.follower_min)}+ followers`); }
    else if (c.follower_max && fol && fol > Number(c.follower_max)) { score -= 10; }
    const b = budgetOf(c);
    if (b) { score += Math.min(15, Math.round(Math.log10(b + 1) * 3)); why.push(`up to ${inr(b)}`); }
    if (dl) { const d = Math.ceil((dl - now) / DAY); if (d <= 3) why.push(d <= 0 ? "closes today" : `closes in ${d} day${d > 1 ? "s" : ""}`); }
    out.push({ kind: "campaign", id, title: c.title || "Campaign", brand: c.brand_name || "Brand", budget: b, budget_min: Number(c.budget_min) || 0, deadline: dl || null, score: Math.max(5, Math.min(99, score)), why, categories: cats, applied: appliedIds.has(id) || Boolean(c.has_applied), raw: c });
  }
  for (const b of briefs || []) {
    const id = String(b.id || "");
    if (!id || (b.status && String(b.status).toUpperCase() !== "OPEN")) continue;
    const text = `${b.title || ""} ${b.product_name || ""} ${b.product_description || ""} ${b.category || ""}`;
    const g = nichesIn(text);
    if (asked.length && g.length && !g.some((x) => groups.includes(x))) continue; // v431: "beauty" asked → no food brief
    let score = 45; const why = [];
    if (g.length && groups.length && g.some((x) => groups.includes(x))) { score += 25; why.push(g[0]); }
    const money = Number(b.budget) || 0;
    if (money) { score += Math.min(15, Math.round(Math.log10(money + 1) * 3)); why.push(`${inr(money)} per video`); }
    const left = Math.max(0, Number(b.max_creators || 1) - Number(b.claimed_count || 0));
    if (left <= 0) continue;
    why.push(`${left} slot${left > 1 ? "s" : ""} left`);
    out.push({ kind: "ugc", id, title: b.title || b.product_name || "UGC video", brand: b.brand_name || "Brand", budget: money, deadline: null, score: Math.max(5, Math.min(99, score)), why, categories: g, applied: false, raw: b });
  }
  return out.sort((a, b) => (Number(a.applied) - Number(b.applied)) || (b.score - a.score) || (b.budget - a.budget));
}

// ── fair rate (same benchmark as the onboarding rate card: reel ≈ 30% of reach, story 12%, YouTube 60%) ──
const TIER_BASE = { Bronze: 500, Silver: 1500, Gold: 5000, Platinum: 15000 };
export function fairRates(profile = {}, market = null) {
  // v419 (QA): reach is never guessed from followers any more ("~3K reach → ₹900" for a creator whose real deal was ₹12,000).
  const reach = reachOfMe(profile);
  const tier = String(profile?.tier || "bronze").replace(/^./, (m) => m.toUpperCase());
  const base = TIER_BASE[tier] || 500;
  const round = (n) => Math.max(100, Math.round(n / 100) * 100);
  const reel = round(Math.max(base, reach * 0.3));
  const r = {
    reach,
    reel: { low: round(reel * 0.8), high: round(reel * 1.25) },
    story: { low: round(Math.max(base * 0.4, reach * 0.12) * 0.8), high: round(Math.max(base * 0.4, reach * 0.12) * 1.25) },
    yt: { low: round(Math.max(base * 2, reach * 0.6) * 0.8), high: round(Math.max(base * 2, reach * 0.6) * 1.25) },
    market: market && market.median_budget ? market.median_budget : 0,
  };
  return r;
}
export function rateAdvice(profile = {}, market = null) {
  const fr = fairRates(profile, market);
  const mine = myRates(profile);
  const notes = [];
  if (!fr.reach) notes.push("Add your average reach in your profile so I can check your rate.");
  if (mine.reel) {
    if (mine.reel > fr.reel.high * 1.3) notes.push(`Your reel rate ${inr(mine.reel)} is well above ${inr(fr.reel.high)} — brands may skip or negotiate.`);
    else if (mine.reel < fr.reel.low * 0.6) notes.push(`Your reel rate ${inr(mine.reel)} is low for your reach — you can ask ${inr(fr.reel.low)}+.`);
    else notes.push(`Your reel rate ${inr(mine.reel)} is in the right range.`);
  } else notes.push("You haven't set a reel rate yet — add it so brands can invite you directly.");
  if (fr.market) notes.push(`Live campaigns in your niche pay up to about ${inr(fr.market)} per creator.`);
  return { ...fr, mine, notes };
}

// ── Session 58 (Eva handoff, part 3): the apply card's limits and the one rate rule ────────────────────
// A fair reel quote is about ₹0.30 per average view. The apply card says so in its ⚠️ line; Eva's chat
// replies only give the amount ("around ₹X per reel"), never the formula.
export const PITCH_MIN = 20, PITCH_MAX = 500, QUOTE_MIN = 100, QUOTE_MAX = 5000000;
const PER_VIEW = 0.3;
/** Around what a creator with this reach should quote for one reel (₹, rounded to 100). 0 = no reach known. */
export function fairQuote(reach) {
  const r = Number(reach) || 0;
  return r > 0 ? Math.max(QUOTE_MIN, Math.round((r * PER_VIEW) / 100) * 100) : 0;
}
/** Checks a quote against the limits and the reach rule → { ok, level: empty|error|warn|good|info, fair, message } */
export function quoteCheck(reach, quote) {
  const q = Math.round(Number(String(quote ?? "").replace(/[^\d.]/g, "")) || 0);
  const fair = fairQuote(reach);
  if (!q) return { ok: false, level: "empty", fair, message: "" };
  if (q < QUOTE_MIN) return { ok: false, level: "error", fair, message: `Minimum quote is ${inr(QUOTE_MIN)}.` };
  if (q > QUOTE_MAX) return { ok: false, level: "error", fair, message: `Maximum quote is ${inr(QUOTE_MAX)}.` };
  if (!fair) return { ok: true, level: "info", fair, message: "Add your average reach in your profile and I'll check if this rate fits." };
  // v328: ✅ up to +10% of the fair rate, same as CreatorSettings validateRate (rate <= suggested * 1.10)
  if (q > fair * 1.1) return { ok: true, level: "warn", fair, message: `⚠️ Heads up! For your reach, a competitive rate would be around ${inr(fair)} (₹0.30/view). Your quoted charges are higher — you can still submit, brands may negotiate.` };
  return { ok: true, level: "good", fair, message: "✅ Your charges look justified for your reach." };
}
// v329: characters as a person counts them — an emoji / Hindi letter with its matra is 1, not 2 (".length" let
// 10 emoji pass the 20-character minimum). Intl.Segmenter where the browser has it, else code points.
const SEG = (() => { try { return typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null; } catch { return null; } })();
const graphemes = (s) => (SEG ? Array.from(SEG.segment(String(s ?? "")), (x) => x.segment) : Array.from(String(s ?? "")));
export const charCount = (s) => graphemes(s).length;
/** v329: cut text to at most `max` characters without splitting an emoji / letter in half. */
export const cutChars = (s, max) => { const g = graphemes(s); return g.length > max ? g.slice(0, max).join("") : String(s ?? ""); };
/** v329: the quote box — digits only, no leading zeros, cut at a decimal point ("4,500.50" → "4500"), max 8 digits. */
export const cleanQuoteInput = (v) => String(v ?? "").split(".")[0].replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "").replace(/^0$/, "").slice(0, 8);
/** The pitch counter under the textarea: "n/500 · min 20" (amber while too short). */
export function pitchCheck(pitch) {
  const n = charCount(String(pitch || "").trim()); // v329: emoji / Hindi count as 1
  return { n, ok: n >= PITCH_MIN && n <= PITCH_MAX, short: n < PITCH_MIN, label: `${n}/${PITCH_MAX} · min ${PITCH_MIN}` };
}
/** GET creators/invitations → the invites still waiting for this creator (same filter as the home card). */
export function pendingInvites(resp) {
  const list = Array.isArray(resp?.pending) ? resp.pending
    : (Array.isArray(resp?.invitations) ? resp.invitations : Array.isArray(resp) ? resp : []).filter((i) => i && i.status === "pending_creator_acceptance");
  return list.filter((i) => i && i.id);
}

// ── profile score: what's missing, each with the screen that fixes it ─────────────────────────────────
export function profileScore(profile = {}, { kyc = "", hasPayout = false, money = true } = {}) {
  const items = [
    { key: "photo", label: "Profile photo", done: Boolean(photoOfMe(profile)), weight: 12, section: "profile" },
    // v363: a short bio used to stay "pending" with no reason shown — now the item says how short it is.
    (() => { const n = String(profile?.bio || "").trim().length; return { key: "bio", label: n > 0 && n < 40 ? `Bio is too short (${n}/40 characters) — add a line or two` : "Bio (2–3 lines about you, 40+ characters)", done: n >= 40, weight: 12, section: "profile" }; })(),
    { key: "niche", label: "Niche / category", done: nichesOfMe(profile).length > 0, weight: 12, section: "profile" },
    { key: "city", label: "City", done: Boolean(String(profile?.city || "").trim()), weight: 6, section: "profile" },
    { key: "insta", label: "Instagram handle + followers", done: Boolean(profile?.instagram_handle || profile?.instagram) && followersOfMe(profile) > 0, weight: 14, section: "platforms" },
    { key: "reach", label: "Average reach", done: reachOfMe(profile) > 0, weight: 10, section: "platforms" },
    { key: "rates", label: "Rate card (reel / story)", done: myRates(profile).reel > 0, weight: 10, section: "rates" },
    { key: "portfolio", label: "2+ portfolio pieces", done: portfolioOf(profile).length >= 2, weight: 10, section: "portfolio" },
    { key: "kyc", label: "KYC verified (needed to get paid)", done: /approved|verified/i.test(String(kyc || "")), weight: 9, section: "kyc" },
    { key: "payout", label: "Bank / UPI for payouts", done: Boolean(hasPayout), weight: 5, section: "kyc" },
  ].filter((i) => money || (i.key !== "kyc" && i.key !== "payout")); // v328: "Earnings & payouts" switched off → no KYC / payout items
  const total = items.reduce((a, i) => a + i.weight, 0);
  const got = items.filter((i) => i.done).reduce((a, i) => a + i.weight, 0);
  return { score: Math.round((got / total) * 100), items, missing: items.filter((i) => !i.done) };
}

// ── money ─────────────────────────────────────────────────────────────────────────────────────────────
// v328: paid = money reached the bank (PAID / COMPLETED, or a UTR / payout reference) — same rule as
// backend/creatorPayoutRequests.ts isPaidToBank. RELEASED = brand approved, payout comes next (not paid yet).
const isPaidOut = (t) => ["PAID", "COMPLETED"].includes(String(t?.payout_status || "").toUpperCase()) || Boolean(String(t?.payout_reference || t?.utr_number || "").trim());
const isApprovedNext = (t) => !isPaidOut(t) && String(t?.payout_status || "").toUpperCase() === "RELEASED";
export function earningsSummary(txns = [], now = new Date()) {
  const ym = istMonth; // v328: month bucket in IST
  const thisMonth = ym(now);
  const rows = (txns || []).filter((t) => !/refund|fail|cancel/i.test(String(t?.status || "")));
  const net = (t) => Number(t?.creator_net_amount || t?.net_amount || t?.amount || 0) || 0;
  const paid = rows.filter(isPaidOut);
  const approved = rows.filter(isApprovedNext); // v328: "Approved · payout next" bucket
  const pending = rows.filter((t) => !isPaidOut(t) && !isApprovedNext(t));
  const month = paid.filter((t) => ym(t.payout_completed_at || t.updated_at || t.created_at) === thisMonth);
  return {
    total: paid.reduce((a, t) => a + net(t), 0),
    month: month.reduce((a, t) => a + net(t), 0),
    approved: approved.reduce((a, t) => a + net(t), 0),
    approvedCount: approved.length,
    pending: pending.reduce((a, t) => a + net(t), 0),
    pendingCount: pending.length,
    paidCount: paid.length, // v329: jobs whose money reached the bank (the card says "paid" only for these)
    deals: paid.length + approved.length, // v328: only paid / approved jobs (unapproved escrow rows aren't "paid jobs")
    // v328: no nextPayout — the backend never sends expected_payout_date.
  };
}

// ── what's due (UGC orders + accepted campaign work) ──────────────────────────────────────────────────
export function dueItems({ orders = [], applications = [] } = {}, now = Date.now()) {
  const items = [];
  for (const o of orders || []) {
    const stage = String(o.stage || o.status || "").toUpperCase();
    const title = o.brief?.title || o.title || "UGC video";
    const due = Date.parse(o.sla_deadline || o.internal_deadline || o.deadline || "") || 0;
    const left = due ? Math.ceil((due - now) / 36e5) : null;
    const when = left == null ? "" : left <= 0 ? " — overdue" : left < 24 ? ` — ${left}h left` : ` — ${Math.ceil(left / 24)} days left`;
    if (["IN_PROGRESS", "CLAIMED", "ACCEPTED", "ACTIVE"].includes(stage)) items.push({ key: `o-${o.id}`, text: `Upload your video for "${title}"${when}`, link: "/creator/ugc", cta: "Open", urgent: left != null && left < 24 });
    else if (["REVISION_REQ", "REVISION_REQUESTED"].includes(stage)) items.push({ key: `o-${o.id}`, text: `Brand asked for changes on "${title}"${when}`, link: "/creator/ugc", cta: "Fix", urgent: true });
    else if (["CONTENT_APPROVED", "COMPLETED_APPROVAL", "AWAITING_LIVE_LINK", "REVISION_REQUESTED_LINKS"].includes(stage) && (o.requires_live_link || o.is_collaboration)) items.push({ key: `o-${o.id}`, text: `Post "${title}" and add the live link`, link: "/creator/ugc", cta: "Add link", urgent: true });
  }
  for (const a of applications || []) {
    const st = String(a.status || "").toUpperCase();
    if (/COMPLETED|CANCEL/i.test(String(a.deal?.status || ""))) continue; // v328: finished / cancelled deals aren't to-do
    if (a.thread_id && ["ACCEPTED", "SHORTLISTED", "ACTIVE"].includes(st)) items.push({ key: `a-${a.campaign_id || a.id}`, text: `"${a.campaign_title || a.title || "Campaign"}" accepted you — reply in chat`, link: `/chat/${a.thread_id}`, cta: "Chat" });
  }
  return items.sort((x, y) => Number(Boolean(y.urgent)) - Number(Boolean(x.urgent))).slice(0, 8);
}

// ── market insight from live campaigns + briefs (server aggregates; this turns it into lines) ───────────
export function insightLines(ins = {}, profile = {}) {
  const lines = [];
  const groups = nicheGroupsOfMe(profile);
  const top = (ins.top_niches || []).slice(0, 3);
  if (top.length) lines.push(`Most wanted right now: ${top.map((t) => `${t.niche} (${t.count})`).join(", ")}.`);
  const mine = (ins.niches || []).find((n) => groups.includes(n.niche));
  if (mine) lines.push(`${mine.niche}: ${mine.count} live — brands pay up to ~${inr(mine.median_budget || 0)} per creator.`);
  if (ins.ugc && ins.ugc.count) lines.push(`UGC videos: ${ins.ugc.count} open briefs, ~${inr(ins.ugc.median_budget || 0)} per video${ins.ugc.top_format ? `, mostly ${ins.ugc.top_format}` : ""}.`);
  if ((ins.formats || []).length) lines.push(`Asked most: ${ins.formats.slice(0, 3).join(", ")}.`);
  if (!lines.length) lines.push("Not enough live campaigns yet to see a pattern — I'll tell you as brands post more.");
  return lines;
}

// ── writing helpers that work without AI ─────────────────────────────────────────────────────────────
export function pitchFor(opp, profile = {}) {
  const name = String(profile?.name || "").trim().split(/\s+/)[0] || "I"; // v329: "  Ravi" had an empty first word
  const niche = nicheGroupsOfMe(profile)[0] || nichesOfMe(profile)[0] || "lifestyle";
  const fol = followersOfMe(profile), reach = reachOfMe(profile);
  const stats = [fol ? `${shortNum(fol)} followers` : "", reach ? `~${shortNum(reach)} average reach` : ""].filter(Boolean).join(" and ");
  return `Hi! ${name === "I" ? "I'm" : `I'm ${name},`} a ${lower(niche)} creator${profile?.city ? ` from ${profile.city}` : ""}${stats ? ` with ${stats}` : ""}. "${opp?.title || "Your campaign"}" fits my audience well — I'll make an honest, scroll-stopping reel that shows the product clearly and delivers on time.`;
}
export function suggestedAmount(opp, profile = {}) {
  const fr = fairRates(profile);
  // v328: no own reel rate → pre-fill the same fair quote quoteCheck uses (≈ ₹0.30 × avg views), so Eva's own
  // suggestion doesn't trigger her ⚠️. Still capped at the campaign budget below.
  const mine = myRates(profile).reel || fairQuote(fr.reach) || Math.round((fr.reel.low + fr.reel.high) / 2);
  const max = Number(opp?.budget) || 0, min = Number(opp?.budget_min) || 0;
  let amt = mine;
  if (max && amt > max) amt = max;
  if (min && amt < min) amt = min;
  return Math.max(100, Math.round(amt / 100) * 100);
}
// v328 (Ravi): UGC shows the brief budget only — labelled "Brief budget", not "You get"; no fee line.
export function explainBrief(b = {}) {
  const dos = Array.isArray(b.dos) ? b.dos : String(b.dos || "").split(/\n|•/).map((x) => x.trim()).filter(Boolean);
  const donts = Array.isArray(b.donts) ? b.donts : String(b.donts || "").split(/\n|•/).map((x) => x.trim()).filter(Boolean);
  const fmt = { collaboration_reel: "a reel posted on your Instagram (collab)", ugc_video_edited: "an edited video they'll use as an ad", ugc_video_raw: "raw clips (no editing) they will edit" }[b.deliverable_type] || "a short video";
  return {
    title: b.title || b.product_name || "Brief",
    lines: [
      `What: ${fmt}${b.video_duration ? `, ${b.video_duration}` : ""}.`,
      b.product_name ? `Product: ${b.product_name}${b.product_description ? ` — ${String(b.product_description).slice(0, 140)}` : ""}.` : "",
      b.detailed_requirements ? `They want: ${String(b.detailed_requirements).slice(0, 220)}` : "",
      b.budget ? `Brief budget: ${inr(b.budget)}${b.delivery_hours ? `, deliver within ${b.delivery_hours} hours` : ""}.` : "",
    ].filter(Boolean),
    dos, donts,
  };
}
export function draftChecklist(b = {}) {
  const items = [
    "Product is clearly visible in the first 3 seconds",
    "You say the product name at least once",
    `Length is right${b.video_duration ? ` (${b.video_duration})` : ""}`,
    "Good light, clear sound, no background noise",
    "Vertical 9:16, no other brand's logo in frame",
  ];
  if (b.deliverable_type === "collaboration_reel") items.push("Caption has #ad / paid partnership tag");
  for (const d of (Array.isArray(b.dos) ? b.dos : []).slice(0, 3)) items.push(`Do: ${d}`);
  for (const d of (Array.isArray(b.donts) ? b.donts : []).slice(0, 3)) items.push(`Don't: ${d}`);
  return items;
}
const IDEA_BANK = {
  Fashion: ["3 ways to style one outfit", "Budget vs premium look", "Get ready with me for a wedding", "Outfit for each day of the week", "Thrift haul + try-on"],
  Health: ["My honest morning routine", "1 habit that changed my sleep", "Myth vs fact in 30 seconds", "What I eat in a busy day", "Desk stretches in 60 seconds"],
  Food: ["₹100 meal challenge", "Street food rating in your city", "5-minute recipe with 3 ingredients", "Trying a viral food trend", "Tiffin ideas for the week"],
  Tech: ["Phone settings nobody uses", "Budget gadget under ₹999 tested", "My desk setup tour", "3 apps that save time", "Old vs new: is the upgrade worth it?"],
  Fitness: ["No-equipment 10-minute workout", "Form check: common mistakes", "What I eat after the gym", "30-day challenge day 1", "Beginner's first week plan"],
  Travel: ["₹5,000 weekend trip plan", "Hidden spots in your city", "Packing in one bag", "Things I wish I knew before going", "Train vs flight cost check"],
  Lifestyle: ["A day in my life", "Room makeover under ₹2,000", "Things I stopped buying", "My Sunday reset", "5 small habits that help"],
  Finance: ["How I split my salary", "One money mistake to avoid", "Explaining SIP in 30 seconds", "Saving challenge for a month", "Credit card myth vs fact"],
};
export function growthIdeas(profile = {}, week = 0) {
  const g = nicheGroupsOfMe(profile)[0] || "Lifestyle";
  const bank = IDEA_BANK[g] || IDEA_BANK.Lifestyle;
  const pick = [0, 1, 2].map((i) => bank[(week + i) % bank.length]);
  return {
    niche: g,
    ideas: pick,
    tips: [
      "Hook in the first 2 seconds — say the result first.",
      "Post at the same time 4–5 days a week; reels between 7–10 pm do best in India.",
      "Reply to every comment in the first hour — it pushes the reel to more people.",
    ],
  };
}

// ── what does the creator want? ──────────────────────────────────────────────────────────────────────
const RX = {
  handoff: /\b(campaign manager|manager se|insaan|human|real person|team se baat|baat karni|talk to (someone|team|a person))\b/,
  caps: /\b(what can you do|kya kar sakt[ie]|tum kya karti|help me|madad)\b/, // v328: bare "feature(s)" removed — feature ideas go to the team
  // v328: either order + plurals ("stop notifications", "notifications off", "disable alerts")
  alertsOff: /\b(alerts?|notifications?|batana)\b.*\b(band|off|stop|mat|disable)\b|\b(stop|turn off|switch off|disable|band karo|band kar do)\b.*\b(alerts?|notifications?)\b/,
  alertsOn: /\b(naya|naye|new)\b.*\b(campaigns?|briefs?|kaam|deals?|brands?)\b.*\b(aaye|aaye to|batana|bata dena|notify|alert)\b|\b(alert|notify) me\b|\bcampaign alert\b/,
  apply: /\b(apply|apply kar|apply karo|apply kardo|apply kar do|bhej do application)\b/,
  insights: /\b(brands? kya (maang|chahte|chahiye|demand)|demand|trend(ing)?|market|kya chal raha|kis cheez ki demand)\b/,
  rate: /\b(rate|rates|kitna charge|charge kar|kitne paise|price|pricing|fees?|kitna lu|kitna maang|should i charge|how much (should|can|do) i (charge|ask|quote)|what (should|do) i charge|my quote)\b/,
  invites: /\b(invit(e|es|ation|ations)|invited me|mujhe invite|kisne invite|brand (ne )?bulaya|offers?|brand ne bheja)\b/, // v328: "offers from brands" / "brand offers"
  bio: /\bbio\b/,
  portfolio: /\bportfolio\b/,
  // v333 (Ravi: "Can you create good profile for me" showed campaigns): words BEFORE "profile" count too.
  profile: /\b(profile)\b.*\b(score|improve|better|achh?i|complete|check|kaisi|strong)\b|\b(meri|my) profile\b|\brate (my|meri|mera) profile\b|\b(create|make|build|set ?up|improve|fix|complete|good|great|better|best|strong|achh?i|acchi|badhiya|banao|bana do|sudhar\w*)\b.*\bprofile\b|\bprofile\b.*\b(banao|bana do|bana de|banado)\b/,
  script: /\b(hooks?|scripts?|scrip|skript|captions?|hashtags?|likh do|likho|likh de)\b/, // v333: "scrip" typo
  checklist: /\b(checklist|draft check|submit karne se pehle|before (i )?submit|check my (video|draft))\b/,
  brief: /\b(brief|ye brand|brand kya chahta|samjha|samjhao|explain)\b/,
  // v328: "paise kab milenge", "when will I get my money / get paid" → payout check
  kyc: /\b(kyc|pan(?!\s*india)|upi|bank|payout (ruka|nahi|pending|kyun|kab)|pais[ae] (nahi|kab|kyun)|payment (nahi|kab|kyun|ruka)|get (my )?(money|paid|payment)|getting paid|be paid)\b/,
  // v329: "how much did I earn", "my pending payouts", "show my payments", "kitne paise mile" → earnings
  earnings: /\b(kamai|kamaya|earn|earned|earning|earnings|income|kitna mila|kitne paise mile|paise mile|payouts?|wallet|payments?)\b/,
  due: /\b(deadlines?|pending|kya baaki|baaki hai|kab tak|reminder|kya karna hai|to[- ]?do|due)\b/, // v328: "to do" with a space
  growth: /\b(grow|growth|followers? badh|reach badh|content ideas?|idea do|kya post|post kya|viral)\b/,
  refer: /\b(refer|referral|invite (a |my )?friends?|(dost|friends?) ko (bulao|invite|join|refer)|mera code|refer code|referral code)\b/, // v435: "my friend is threatening me" is not a referral
  share: /\b(share card|story card|share karna|flex|achievement)\b/,
  ugc: /\bugc\b/,
  // v419 (QA): the creator's OWN UGC orders and deals — these used to get the open-campaigns list.
  myUgc: /\bugc\b.*\b(orders?|timer|time|kitna|bacha|baaki|deadline|status|kab tak|left|due)\b|\b(my|mere|meri|mera)\b.*\bugc\b|\bugc (order|video) (ka|ki|status)/,
  myDeals: /\b(deals?|collabs?)\b.*\b(status|kya hua|kahan|update|chal raha|kab|kitna|stage)\b|\b(my|mere|meri|mera)\s+(deals?|collabs?|orders?)\b|\brevision\b|\bdeal ka chat\b|\bchat kholo\b|\binvoice\b|\bkon ?sa brand\b.*\bpay\b|\bbrand ne (reply|jawab|revision|video)|\bdraft (kab|due|kitne din)\b/,
  // v328: bare "work" removed ("how does it work?" isn't a campaign search); "work for me" is caught by "for me".
  // v419 (Ravi): Eva's free invoice maker — make one, or open "my invoices".
  invoice: /\b(create|make|generate|bana\w*|new|nayi|naya|free)\b.*\b(invoices?|bill)\b|\b(invoices?|bill)\b.*\b(bana\w*|create|make|generate|chahiye|chaiye|karna|likh\w*)\b|\binvoice (generator|maker)\b|^\s*(create |new )?invoices?\s*$|\b(my|meri|mere|all)\s+invoices?\b|\binvoice (history|list)\b/,
  // v419: Eva as a manager — fill profile in chat, payment ETA, month report, agreement, content plan, brand reply, best match.
  fillProfile: /\b(profile|details?)\b.*\b(complete|poori|puri|pura|bhar\w*|fill)\b.*\b(karo|kar do|kardo|karwa\w*|karna|do|de|it|chat)\b|\b(complete|fill|poori|puri)\s+(my|meri|mera)\s+(profile|details?)\b|\bmissing (details?|info)\b|\b(dob|date of birth|birthday|gender|languages?)\b.*\b(add|daal\w*|update|save|set|badal\w*|change|hai|h)\b/,
  brandReply: /\b(brand ko|brand ke liye|to the brand)\b.*\b(reply|jawab|message|msg|likh\w*|bolu|kya bolu)\b|\b(reply|jawab)\b.*\b(brand|offer)\b|\b(negotiat\w*|counter ?offer|mol ?bhav|low offer|offer (kiya|diya|aaya|bheja)|kam paise (de|offer))\b/,
  agreement: /\b(agreement|contract|anubandh|terms (and|&) conditions)\b/,
  payWhen: /\b(pais[ae]|payment|payout|money|amount)\b.*\b(kab|when|kitne din|aayega|aayenge|aaega|milega|milenge|status|kahan|take|takes|kitna time)\b|\bhow long\b.*\b(payout|payment|paid|money)\b|\bkab (aayega|milega|aaega)\b|\bwhen (will )?i (get|be) paid\b/,
  monthReport: /\b(monthly report|month(ly)? summary|mahine (ki|ka) (report|hisab|hisaab|summary)|is mahine (ki|ka)? ?(report|hisab|hisaab|summary|performance)|report card|(meri|my|mera) (report|performance))\b/,
  plan: /\b(content plan|posting plan|content calendar|calendar|(hafte|week|weekly|7 din) (ka|ke|ki)? ?plan|plan (banao|bana do|bana de|do|de|chahiye)|schedule (banao|bana do))\b/,
  match: /\b(best|sabse (achha|acha|sahi|accha)|perfect|match\w*|suit\w*)\b.*\b(campaigns?|briefs?|kaam|deals?|brands?)\b|\b(campaigns?|briefs?|kaam)\b.*\b(match|fit|suit)\w*/,
  // v431 (Eva audit #6): "write a pitch for the Nykaa Diwali campaign" → a pitch, not a campaign list.
  pitch: /\b(pitch|pitches)\b|\b(apply|application) (message|note|text)\b/,
  campaigns: /\b(campaigns?|brands?|kaam|find work|new work|any work|deals?|collabs?|opportunit\w*|mere liye kya|for me|dhundo|dhundh|find)\b/,
};
/** → { intent } or null (null = the old helper answers: hi / thanks / bug / idea / budget). */
// v328: a question about Ybex's own fee / commission → the knowledge answer (null), not the creator's rate.
const PLATFORM_FEE = /\b(ybex('?s)?|platform|service|convenience)\b.*\b(fees?|commission|cut)\b|\b(platform|service|convenience) charges?\b|\b(fees?|commission)\b.*\b(ybex|platform)\b|\bkitna (kat|cut)/;
export function detectCreatorIntent(text) {
  const t = ` ${lower(text)} `;
  if (PLATFORM_FEE.test(t) && !RX.kyc.test(t)) return null; // v328
  if (/\brate (my|meri|mera) profile\b/.test(t)) return { intent: "profile" }; // v328: "rate my profile" isn't a rate question
  if (/\bkitne paise (mile|mila|aaye)\b/.test(t) && !RX.kyc.test(t)) return { intent: "earnings" }; // v329: "money I got", not "what to charge"
  // v329: "apply to boAt with my quote 5000" / "apply for 5k rate" is an application with a quote, not a rate question.
  const applyWithQuote = RX.apply.test(t) && !/\?|\b(how much|kitna|kitne|should i)\b/.test(t);
  // v435 (Eva question test #10/#11): these are Ybex FAQs / safety — Eva's FAQ answers handle them, not a card.
  if (/\b(refund|escrow|delete (my )?account|contact support|customer care|team members?|threaten\w*|harass\w*|blackmail\w*|cancel (my |the |this |a )?(campaign|brief|order|deal|collab|application)|less than (agreed|promised|decided)|kam (paise|payment) (aaya|mila|aaye))\b/.test(t) || /\b(why|kyun|kyu)\b.*\b(payment|payout|paisa|paise|money|amount)\b.*\b(less|kam|cut|kat|deduct\w*)\b/.test(t)) return null;
  // v438 (Eva deep test #9): "explain how ybex payments protect me" is an FAQ (not the earnings card); "brand is
  // offering 2000 for a reel, what should I reply" is a reply to an offer (not the campaign list).
  if (/\b(explain|how (does|do|is|are)|kaise)\b.*\b(payments?|escrow|money)\b.*\b(protect\w*|safe\w*|work\w*|secure\w*)\b|\b(payments?|escrow)\b.*\b(protect (me|us)|keep\w* me safe)\b/.test(t)) return null;
  if (/\b(offer\w*|offering|de raha|de rahi|bol raha)\b.*\b(reply|respond|answer|bolu|kya (bolu|likhu|karu|jawab)|what (should|do) i (say|reply|do))\b|\b(what (should|do) i (say|reply)|kya (bolu|likhu|jawab du))\b.*\b(offer\w*|brand)\b/.test(t)) return { intent: "brandReply" };
  for (const k of ["handoff", "pitch", "invoice", "alertsOff", "alertsOn", "fillProfile", "brandReply", "agreement", "payWhen", "monthReport", "plan", "match", "myUgc", "myDeals", "insights", "checklist", "kyc", "rate", "bio", "portfolio", "profile", "script", "refer", "invites", "share", "growth", "earnings", "due", "caps"]) {
    if (k === "rate" && applyWithQuote) continue; // v329
    if (k === "handoff" && /\b(are you|r u|is this|bot|robot|ai|machine)\b/.test(t)) continue; // v435: "are you a bot or human?" is a question, not a hand-off
    if (k === "pitch" && RX.apply.test(t) && !/\b(write|likh\w*|bana\w*|draft|make|create|give|chahiye|need)\b/.test(t)) continue; // v431: "apply with my pitch …" stays an apply
    if (RX[k].test(t)) return { intent: k };
  }
  if (RX.brief.test(t) && /\b(brief|brand)\b/.test(t)) return { intent: "brief" };
  if (RX.apply.test(t)) return { intent: "apply" };
  // v345 (tester: "I need to know about UGC" got a list / a builder instead of an answer): "what is / tell me about /
  // kya hai / samjhao …" with no "find / dikhao / apply" → Eva explains (knowledge answer).
  const infoOnly = /\b(know about|knw about|what is|what's|whats|what are|what does|tell me about|explain|meaning|kya hai|kya hota|kya hote|kya hoti|matlab|samjha\w*|how does|how do(es)? .* work|how it works|kaise kaam)\b/.test(t)
    && !/\b(find|show|dikhao|dhundo|dhundh|list|apply|for me|mere liye|new|latest|available)\b/.test(t);
  if (infoOnly && (RX.ugc.test(t) || RX.campaigns.test(t))) return null;
  if (RX.ugc.test(t)) return { intent: "campaigns", ugcOnly: true };
  if (RX.campaigns.test(t)) return { intent: "campaigns" };
  return null;
}
// v328: money in an apply message ("₹5,000", "5k", "1.5 lakh", "rs 4500") — read it as the quote, and
// strip it before reading a count so "apply for 5k" isn't "apply to 5".
const AMOUNT_RX = /(?:₹|\brs\.?|\binr)\s*\d[\d,]*(?:\.\d+)?\s*(?:k|lakh|lac|l)?\b|\b\d+(?:\.\d+)?\s*(?:k|lakh|lakhs|lac|l)\b|\b\d[\d,]*(?:\.\d+)?\s*(?:rs|rupees?|inr|\/-)(?=\s|$|[.,!?])|\b\d{1,3}(?:,\d{2,3})+(?:\.\d+)?\b|\b\d{3,}(?:\.\d+)?\b/gi;
const amountValue = (m) => {
  const x = lower(m).replace(/₹|\brs\.?|\binr|rupees?|\/-/g, "").replace(/,/g, "").trim();
  const n = parseFloat(x);
  if (!Number.isFinite(n)) return 0;
  const mul = /(lakhs?|lac|l)$/.test(x) ? 1e5 : /k$/.test(x) ? 1e3 : 1;
  return Math.round(n * mul);
};
const stripAmounts = (text) => String(text || "").replace(AMOUNT_RX, " ");
/** v328: "apply to Boat for ₹5,000" → 5000; no amount → 0. */
export function applyAmount(text) {
  const m = String(text || "").match(AMOUNT_RX) || [];
  // v329: a bare year ("the Diwali 2026 campaign") isn't a ₹2,026 quote; "₹2026" / "2026 rs" still is.
  const hit = m.find((x) => !/^\s*20[2-3]\d\s*$/.test(x));
  return hit ? amountValue(hit) : 0;
}
/** v328: the campaign the message names (brand or a title word), if any. */
const NAME_SKIP = new Set(["apply", "campaign", "campaigns", "karo", "kardo", "kar", "please", "top", "the", "for", "and", "with", "this", "that", "all", "sab", "saare", "sare", "mere", "liye", "pe", "par", "quote", "rate", "amount", "reel", "reels", "send", "application", "brand", "brands", "ugc", "video", "first", "best", "new", "one"]);
/** v435 (Eva question test #6): the brand / campaign word in "apply to Nykaa with 5000", "Mamaearth pe apply karo". Pure. */
const GENERIC_TARGET = /^(all|sab|saare|sare|top|best|this|that|it|them|campaigns?|brands?|me|my|mere|ugc|reels?|first|new|one|two|three|\d+)$/i;
export function applyTarget(text = "") {
  const t = stripAmounts(String(text));
  const m = t.match(/\b(?:to|for|on|at|with brand)\s+(?:the\s+)?([a-z0-9][\w&'.-]+)/i) || t.match(/\b([a-z0-9][\w&'.-]+)\s+(?:pe|par|ko|wale|wala|ke liye)\b/i);
  const w = m ? m[1] : "";
  return w && !GENERIC_TARGET.test(w) && !NAME_SKIP.has(lower(w)) ? w : "";
}
/** v435 (Eva question test #7): "campaigns in Mumbai", "above 10000", "barter collabs" → filters on the list. Pure. */
export function campaignFiltersIn(text = "") {
  const t = lower(text);
  const city = cityIn(text);
  let min = 0, max = 0;
  const m1 = t.match(/\b(?:above|over|more than|min(?:imum)?|at least|se (?:zyada|upar|jyada))\s*₹?\s*([\d.,]+\s*(?:k|lakh|l)?)/) || t.match(/₹?\s*([\d.,]+\s*(?:k|lakh|l)?)\s*(?:\+|se (?:zyada|upar|jyada)|or more|and above)/);
  if (m1) min = numOf(m1[1]);
  const m2 = t.match(/\b(?:under|below|less than|max(?:imum)?|up ?to|tak)\s*₹?\s*([\d.,]+\s*(?:k|lakh|l)?)/) || t.match(/₹?\s*([\d.,]+\s*(?:k|lakh|l)?)\s*(?:tak|se kam|or less)\b/);
  if (m2) max = numOf(m2[1]);
  const barter = /\b(barter|product ke badle|free product|gifting)\b/.test(t) ? "barter" : /\b(paid only|only paid|sirf paise|cash)\b/.test(t) ? "paid" : "";
  return { city, min: min >= 500 ? min : 0, max: max >= 500 ? max : 0, barter };
}
export function applyCampaignFilters(list = [], f = {}) {
  const isBarter = (o) => o.raw?.is_barter === true || /barter/i.test(String(o.raw?.collab_mode || "")) || (!Number(o.raw?.budget_min) && !Number(o.raw?.budget_max) && !Number(o.budget));
  return list.filter((o) => {
    if (f.city) {
      const loc = lower(`${o.raw?.location_type || ""} ${Array.isArray(o.raw?.specific_locations) ? o.raw.specific_locations.join(" ") : ""} ${o.raw?.city || ""}`);
      if (loc && !/pan.?india|anywhere|all india|remote|online/.test(loc) && !loc.includes(lower(f.city))) return false;
    }
    if (f.min && (Number(o.budget) || 0) < f.min) return false;
    if (f.max && (Number(o.budget_min || o.budget) || 0) > f.max) return false;
    if (f.barter === "barter" && !isBarter(o)) return false;
    if (f.barter === "paid" && isBarter(o)) return false;
    return true;
  });
}
export function pickByName(list = [], text = "") {
  const toks = lower(stripAmounts(text)).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !NAME_SKIP.has(w));
  if (!toks.length) return null;
  const ws = (s) => lower(s).split(/[^a-z0-9]+/).filter(Boolean);
  return list.find((o) => ws(o.brand).some((w) => toks.includes(w))) || list.find((o) => ws(o.title).some((w) => w.length >= 3 && !NAME_SKIP.has(w) && toks.includes(w))) || null;
}
/** A bug report or a feature idea for the team (classify() result + the text). */
export const isReportText = (kind, text) => kind?.type === "feedback" && (kind.category === "bug" || (kind.category === "feature" && /\b(suggest|suggestion|feature|idea|please add|add (karo|kar do|kijiye)|should (have|add)|hona chahiye)\b/i.test(String(text || ""))));
/** v328: a bug, or an idea that isn't a question ("mera rate kitna hona chahiye" is a question) → goes to the team. */
export function reportClearsIntent(kind, text) {
  if (kind?.type === "feedback" && kind.category === "bug") return true;
  const asksQuestion = /\?|\b(kitna|kitni|kitne|kya|kaise|kab|kaun|how|what|when|which|why)\b/i.test(String(text || ""));
  return isReportText(kind, text) && !asksQuestion;
}
/** "top 3 pe apply karo" → 3; "sab pe" → 5 */
export function applyCount(text) {
  const m = lower(stripAmounts(text)).match(/\b(\d{1,2})\b/); // v328: amounts stripped first
  if (m) return Math.min(5, Math.max(1, Number(m[1])));
  return /\b(sab|all|saare|sare)\b/.test(lower(text)) ? 5 : 1;
}
// ── v419 (QA): the creator's own deals and UGC orders, in the same words the inbox uses ──────────────
const DONE_RX = /CANCEL|REFUND|COMPLETED|CLOSED|DECLINED|REJECTED/i;
const leftText = (iso, now) => {
  const t = Date.parse(iso || ""); if (!t) return "";
  const h = Math.ceil((t - now) / 36e5);
  if (h <= 0) return "overdue";
  return h < 24 ? `${h}h left` : `${Math.ceil(h / 24)} days left`;
};
/** threads (chat/v2/threads) → deal lines for a "steps" card. `chipFor(thread)` = the inbox chip (same state everywhere). */
export function dealLines(threads = [], chipFor = () => null, now = Date.now()) {
  return (threads || []).filter((t) => t && !t.is_ugc && !DONE_RX.test(String(t.status || "")) && !DONE_RX.test(String(t.flow_state || "")))
    .map((t) => {
      const chip = chipFor(t) || {};
      const brand = t.brand?.company_name || t.brand?.name || t.brand_name || "Brand";
      const title = String(t.campaign_title || t.campaigns?.title || "Your deal").split(" — ")[0].slice(0, 60);
      const amt = Number(t.agreed_amount) || 0;
      const left = leftText(t.deadline, now);
      const state = t.cancel_requested ? "Cancellation under review" : chip.label || "In progress";
      const upload = /upload/i.test(state);
      return { key: `d-${t.id}`, text: `${brand} · ${title}${amt ? ` · ₹${amt.toLocaleString("en-IN")}` : ""} — ${state}${left ? ` · draft ${left}` : ""}`, link: `/chat/${t.id}`, cta: upload ? "Upload" : "Open chat", urgent: Boolean(chip.needsAction) || left === "overdue" };
    })
    .sort((x, y) => Number(y.urgent) - Number(x.urgent)).slice(0, 8);
}
/** UGC orders (ugc/orders/creator) → lines with time left; links to Manage orders. */
export function ugcLines(orders = [], now = Date.now()) {
  const word = { IN_PROGRESS: "make & upload the video", CLAIMED: "make & upload the video", ACCEPTED: "make & upload the video", ACTIVE: "make & upload the video",
    REVISION_REQ: "brand asked for changes", REVISION_REQUESTED: "brand asked for changes", SUBMITTED: "submitted — waiting for the brand", PENDING_APPROVAL: "submitted — waiting for the brand",
    CONTENT_APPROVED: "approved", AWAITING_LIVE_LINK: "post it and add the live link", COMPLETED: "done" };
  return (orders || []).filter((o) => o && !DONE_RX.test(String(o.stage || o.status || "")))
    .map((o) => {
      const st = String(o.stage || o.status || "").toUpperCase();
      const title = o.brief?.title || o.title || "UGC video";
      const amt = Number(o.creator_payout || o.amount) || 0;
      const left = leftText(o.sla_deadline || o.internal_deadline || o.deadline, now);
      return { key: `u-${o.id}`, text: `"${title}"${amt ? ` · ₹${amt.toLocaleString("en-IN")}` : ""} — ${word[st] || st.toLowerCase().replace(/_/g, " ")}${left ? ` · ${left}` : ""}`, link: "/creator/ugc/orders", cta: /changes|upload/.test(word[st] || "") ? "Open" : "View", urgent: left === "overdue" || /changes/.test(word[st] || "") || (/left/.test(left) && /h left/.test(left)) };
    })
    .sort((x, y) => Number(y.urgent) - Number(x.urgent)).slice(0, 8);
}

// ── v419 (QA): rate questions — which format, and a reach the creator typed ──────────────────────────
export function rateFormat(text) {
  const t = lower(text);
  if (/\b(story|stories)\b/.test(t)) return "story";
  if (/\b(youtube|yt|integration|subs|subscribers)\b/.test(t)) return "yt";
  return "reel";
}
export function reachFromText(text) {
  const m = lower(text).match(/(\d+(?:\.\d+)?)\s*(k|lakh|lac|l)?\s*(?:avg\.?|average)?\s*(?:views|reach)\b|(?:reach|views)\s*(?:hai|is|of|=|:)?\s*(\d+(?:\.\d+)?)\s*(k|lakh|lac|l)?\b/);
  if (!m) return 0;
  const n = parseFloat(m[1] || m[3]); const u = m[2] || m[4] || "";
  return Math.round(n * (u === "k" ? 1e3 : u ? 1e5 : 1));
}
const PER_FORMAT = { reel: 0.3, story: 0.12, yt: 0.6 };
export function fairFor(format, reach) {
  const r = Number(reach) || 0;
  return r > 0 ? Math.max(QUOTE_MIN, Math.round((r * (PER_FORMAT[format] || 0.3)) / 100) * 100) : 0;
}

// ── v419 (QA): caption / hashtags written for the creator's own topic ─────────────────────────────────
export function writeMode(text) {
  const t = lower(text);
  const h = /\bhash ?tags?\b/.test(t), c = /\bcaptions?\b/.test(t), s = /\b(scripts?|scrip|skript|hooks?)\b/.test(t);
  if (h && !c && !s) return "hashtags";
  if (c && !s) return h ? "caption+tags" : "caption";
  return "script";
}
const STOP_TOPIC = /^(a|an|the|me|my|for|mere|mera|meri|liye|ke|ka|ki|ek|please|pls|plz|can|you|u|write|likho|likh|do|de|dena|bana|banao|make|create|give|script|scripts|scrip|skript|hook|hooks|caption|captions|hashtag|hashtags|reel|reels|video|short|30|60|second|seconds|sec|s|aur|and|with|bhi|par|pe|on|about|ko|to|i|want|need|chahiye)$/i;
export function topicFrom(text) {
  const t = String(text || "");
  const m = t.match(/(?:for|about|on)\s+(?:my\s+|a\s+|an\s+|the\s+)?(.{2,60}?)(?:\s+(?:reel|video|post|brand|launch))?\s*[.?!]?$/i) || t.match(/(.{2,60}?)\s+(?:ke liye|ke upar|pe|par)\b/i);
  const raw = m ? m[1] : t;
  const words = raw.split(/[^\p{L}\p{N}&'-]+/u).filter((w) => w && !STOP_TOPIC.test(w));
  return words.slice(0, 5).join(" ");
}
const NICHE_TAGS = { food: ["#foodie", "#foodreels", "#indianfood", "#homemade"], beauty: ["#skincare", "#makeup", "#beautytips", "#glowup"], fashion: ["#ootd", "#fashionreels", "#styleinspo", "#indianfashion"],
  fitness: ["#fitness", "#workout", "#gymreels", "#healthylifestyle"], tech: ["#tech", "#gadgets", "#techreview", "#unboxing"], travel: ["#travel", "#travelreels", "#incredibleindia", "#wanderlust"],
  comedy: ["#comedy", "#funnyreels", "#relatable", "#memes"], lifestyle: ["#lifestyle", "#dayinmylife", "#reelsindia", "#vlog"] };
// v431 (Eva audit #8): festivals / moments are not products — "Tried diwali so you don't have to" read oddly.
const OCCASIONS = { diwali: ["#diwali", "#happydiwali", "#festivevibes", `#diwali${new Date().getFullYear()}`], holi: ["#holi", "#happyholi", "#festivevibes"], navratri: ["#navratri", "#garba", "#festivevibes"],
  durga: ["#durgapuja", "#festivevibes"], eid: ["#eid", "#eidmubarak", "#festivevibes"], christmas: ["#christmas", "#merrychristmas", "#festivevibes"], "new year": ["#newyear", "#newyearvibes"],
  rakhi: ["#rakhi", "#rakshabandhan"], "raksha bandhan": ["#rakshabandhan", "#rakhi"], wedding: ["#weddingseason", "#shaadi", "#indianwedding"], shaadi: ["#shaadi", "#weddingseason"],
  monsoon: ["#monsoon", "#monsoonvibes"], summer: ["#summer", "#summervibes"], winter: ["#winter", "#wintervibes"], karwa: ["#karwachauth", "#festivevibes"], onam: ["#onam", "#festivevibes"], pongal: ["#pongal", "#festivevibes"],
  festive: ["#festivevibes", "#festiveseason"], festival: ["#festivevibes", "#festiveseason"], "valentine": ["#valentinesday", "#love"] };
export function occasionIn(topic) {
  const t = ` ${String(topic || "").toLowerCase()} `;
  return Object.keys(OCCASIONS).find((k) => t.includes(` ${k}`)) || "";
}
export function hashtagsFor(topic, niche = "") {
  const occ = occasionIn(topic);
  const words = String(topic || "").toLowerCase().split(/\s+/).filter((w) => w.length > 2).slice(0, 3);
  const own = words.length ? [...(words.length > 1 ? ["#" + words.join("")] : []), ...words.map((w) => "#" + w)] : [];
  const nk = (s) => Object.keys(NICHE_TAGS).find((k) => String(s || "").toLowerCase().includes(k)) || Object.keys(NICHE_TAGS).find((k) => nichesIn(String(s || "")).some((g) => lower(g).includes(k)));
  // the topic's own niche first; the profile niche only when the topic says nothing else (no food tags on a tech reel)
  const key = nk(topic) || (occ ? "" : nk(niche)) || (occ ? "" : "lifestyle");
  const base = [...own, ...(occ ? OCCASIONS[occ] : []), ...(key ? NICHE_TAGS[key] : []), "#reels", "#reelsindia", "#ad"];
  return [...new Set(base)].slice(0, 12);
}
export function captionFor(topic) {
  const p = String(topic || "").trim() || "this";
  const occ = occasionIn(p);
  if (occ) {
    const name = occ.replace(/\b\w/g, (c) => c.toUpperCase());
    const rest = p.replace(new RegExp(`\\b${occ}\\b`, "i"), "").replace(/\s+/g, " ").trim();
    return rest
      ? `${name} mood: ${rest} ✨ Here's how I'm doing it this year — save it for later and tell me yours below 👇`
      : `${name} mood is ON ✨ Here's what my ${name} looks like this year — what's on your list? Tell me below 👇`;
  }
  return `Tried ${p} so you don't have to 👀 Honest take in the reel — would you try it? Tell me below 👇`;
}

export { NICHES, cityIn, numOf };

// ═══ v419 (Ravi): Eva as the creator's manager ═══════════════════════════════════════════════════════════════
// ── 1. fill the profile in chat (saved straight to the server — no "go to settings") ────────────────────────
export const FILL_ORDER = ["gender", "dob", "languages", "city", "niche", "barter"];
const dobOf = (p) => String(p?.dob || p?.date_of_birth || p?.rate_card?.dob || "").trim();
const langsOfMe = (p) => (Array.isArray(p?.languages) ? p.languages : String(p?.languages || "").split(",")).map((x) => String(x).trim()).filter(Boolean);
export function missingFill(p = {}) {
  const has = {
    gender: Boolean(String(p?.gender || "").trim()),
    dob: Boolean(dobOf(p)),
    languages: langsOfMe(p).length > 0,
    city: Boolean(String(p?.city || "").trim()),
    niche: nichesOfMe(p).length > 0,
    barter: Boolean(String(p?.barter_mode || p?.barter || "").trim()),
  };
  return FILL_ORDER.filter((k) => !has[k]);
}
export const NICHE_CHIPS = ["Fashion", "Beauty", "Lifestyle", "Food", "Entertainment", "Fitness", "Travel", "Tech", "Comedy", "Education", "Gaming", "Music", "Finance"];
const LANGS = ["Hindi", "English", "Hinglish", "Bengali", "Gujarati", "Punjabi", "Marathi", "Tamil", "Telugu", "Kannada", "Malayalam", "Odia", "Assamese", "Urdu", "Bhojpuri", "Haryanvi", "Marwari"];
const BARTER = [["Products Only", "Yes, barter OK", "Haan, barter OK"], ["Hybrid (Paid + Barter)", "Paid + barter", "Paise + product dono"], ["Paid Campaigns Only", "Paid only", "Sirf paise"]];
export function fillQuestion(field, lang = "en") {
  const hi = lang === "hi";
  const q = {
    gender: [hi ? "Aapka gender? (brands kabhi female ya male creators dhoondhte hain)" : "Your gender? (brands sometimes look for female or male creators)", ["Female", "Male", "Other"]],
    dob: [hi ? "Aapki date of birth? Jaise \"10 May 2001\". (Private rehti hai — brands ko sirf age range dikhti hai)" : "Your date of birth? e.g. \"10 May 2001\". (Kept private — brands only see an age range)", []],
    languages: [hi ? "Aap kaunsi languages mein content banate ho? Ek ya zyada likho, jaise \"Hindi, English\"." : "Which languages do you make content in? One or more, e.g. \"Hindi, English\".", ["Hindi", "English", "Hinglish"]],
    city: [hi ? "Aap kis shehar mein ho?" : "Which city are you in?", []],
    niche: [hi ? "Aapka content kis category ka hai? (1–2 chuno)" : "What's your content category? (pick 1–2)", NICHE_CHIPS.slice(0, 8)],
    barter: [hi ? "Barter chalega? (paise ki jagah brand ka product)" : "Are you OK with barter? (the brand's product instead of money)", BARTER.map((b) => (hi ? b[2] : b[1]))],
  }[field];
  return { text: q[0], chips: q[1] };
}
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/** "10 May 2001" · "10/05/2001" · "2001-05-10" → "2001-05-10" (age 13–80), else null. */
export function parseDob(text, now = Date.now()) {
  const t = lower(text).replace(/(\d)(st|nd|rd|th)\b/g, "$1");
  let y, m, d, x;
  if ((x = t.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/))) [y, m, d] = [x[1], x[2], x[3]];
  else if ((x = t.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/))) [d, m, y] = [x[1], x[2], x[3]];
  else if ((x = t.match(/\b(\d{1,2})\s*([a-z]{3,9})\s*,?\s*(\d{4})\b/)) && MONTHS[x[2].slice(0, 3)]) [d, m, y] = [x[1], MONTHS[x[2].slice(0, 3)], x[3]];
  else if ((x = t.match(/\b([a-z]{3,9})\s*(\d{1,2})\s*,?\s*(\d{4})\b/)) && MONTHS[x[1].slice(0, 3)]) [m, d, y] = [MONTHS[x[1].slice(0, 3)], x[2], x[3]];
  else return null;
  [y, m, d] = [Number(y), Number(m), Number(d)];
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCDate() !== d) return null;
  const age = (now - dt.getTime()) / (365.25 * 864e5);
  if (age < 13 || age > 80) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
export const prettyDate = (iso) => { const [y, m, d] = String(iso).split("-").map(Number); return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`; };
const title = (s) => String(s).trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
/** The answer to one question → { payload, show } to save, or null when it doesn't fit. */
export function parseFill(field, text) {
  const t = ` ${lower(text).trim()} `;
  if (field === "gender") {
    if (/\b(female|f|ladki|girl|woman|women|mahila|lady)\b/.test(t)) return { payload: { gender: "Female" }, show: "Female" };
    if (/\b(male|m|ladka|boy|man|men|purush)\b/.test(t)) return { payload: { gender: "Male" }, show: "Male" };
    if (/\b(other|non[- ]?binary|prefer not|anya)\b/.test(t)) return { payload: { gender: "Other" }, show: "Other" };
    return null;
  }
  if (field === "dob") { const d = parseDob(text); return d ? { payload: { dob: d, date_of_birth: d }, show: prettyDate(d) } : null; }
  if (field === "languages") {
    const al = { bangla: "Bengali", oriya: "Odia", rajasthani: "Marwari" };
    const got = [...new Set([...LANGS.filter((l) => new RegExp(`\\b${l.toLowerCase()}\\b`).test(t)), ...Object.keys(al).filter((k) => t.includes(` ${k}`)).map((k) => al[k])])];
    return got.length ? { payload: { languages: got, language: got.join(", ") }, show: got.join(", ") } : null;
  }
  if (field === "city") {
    const known = cityIn(text);
    const raw = String(text || "").trim().replace(/^(main|mai|me|i am in|i live in|i'm in|from|city is|meri city|mera shehar)\s+/i, "").replace(/\s+(se|mein|me|hu|hoon|hun|hai|rehti hu|rehta hu)\b.*$/i, "").trim();
    const city = known || (/^[a-zA-Z][a-zA-Z .]{1,30}$/.test(raw) && raw.split(/\s+/).length <= 3 ? title(raw) : "");
    return city ? { payload: { city }, show: city } : null;
  }
  if (field === "niche") {
    const got = NICHE_CHIPS.filter((n) => t.includes(` ${n.toLowerCase()}`));
    const groups = got.length ? got : nichesIn(text);
    const pick = [...new Set(groups)].slice(0, 3);
    return pick.length ? { payload: { category: pick.join(", "), primary_niche: pick.join(", ") }, show: pick.join(", ") } : null;
  }
  if (field === "barter") {
    if (/\b(dono|both|hybrid|paise \+|paid \+|paid and|mix)\b/.test(t)) return { payload: { barter: BARTER[1][0] }, show: BARTER[1][1] };
    if (/\b(nahi|nahin|no|na|paid only|sirf paise|only paid|cash)\b/.test(t)) return { payload: { barter: BARTER[2][0] }, show: BARTER[2][1] };
    if (/\b(haan|han|ha|yes|ok|okay|chalega|barter ok|sure|theek)\b/.test(t)) return { payload: { barter: BARTER[0][0] }, show: BARTER[0][1] };
    return null;
  }
  return null;
}
/** "meri DOB 10 May 2001 hai" / "mera gender female" — fields named in one message. */
export function fillsInText(text) {
  const t = lower(text), out = [];
  if (/\b(dob|date of birth|birthday|janam|janm|born)\b/.test(t)) { const r = parseFill("dob", text); if (r) out.push(["dob", r]); }
  if (/\bgender\b/.test(t)) { const r = parseFill("gender", t.replace(/\bgender\b/g, "")); if (r) out.push(["gender", r]); }
  if (/\b(languages?|bhasha)\b/.test(t)) { const r = parseFill("languages", text); if (r) out.push(["languages", r]); }
  if (/\b(barter)\b/.test(t)) { const r = parseFill("barter", t.replace(/\bbarter\b/g, "")); if (r) out.push(["barter", r]); }
  return out;
}

// ── 2. "paisa kab aayega" — every payment with its stage and when it lands ──────────────────────────────────
const addWorkingDays = (ms, n) => { let d = new Date(ms + IST); let left = n; while (left > 0) { d = new Date(d.getTime() + 864e5); const w = d.getUTCDay(); if (w !== 0 && w !== 6) left -= 1; } return d; };
const dayText = (d) => `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
export function paymentLines(txns = [], { kycOk = true } = {}, now = Date.now()) {
  const net = (t) => Number(t?.creator_net_amount || t?.net_amount || t?.amount || 0) || 0;
  const label = (t) => t?.brand_name || t?.campaign_title || t?.brief_title || "A deal";
  const rows = (txns || []).filter((t) => !/refund|fail|cancel/i.test(String(t?.status || "")) && net(t) > 0);
  const paidOut = (t) => ["PAID", "COMPLETED"].includes(String(t?.payout_status || "").toUpperCase()) || Boolean(String(t?.payout_reference || t?.utr_number || "").trim());
  const out = [];
  for (const t of rows.filter((x) => !paidOut(x))) {
    const released = String(t?.payout_status || "").toUpperCase() === "RELEASED" || /released|approved/i.test(String(t?.status || "")) || t?.is_brand_approved === true;
    if (released) {
      const from = Date.parse(t.released_at || t.approved_at || t.updated_at || "") || now;
      const by = addWorkingDays(Math.max(from, now - 864e5 * 10), 2);
      out.push({ text: kycOk ? `${inr(net(t))} from ${label(t)} — approved ✅ Reaches your bank / UPI by about ${dayText(by)} (1–2 working days).` : `${inr(net(t))} from ${label(t)} is approved, but your KYC isn't verified — finish KYC and it's sent in 1–2 working days.`, link: kycOk ? "/earnings" : "/settings?section=kyc&from=eva", cta: kycOk ? "Earnings" : "Finish KYC", tone: kycOk ? "ok" : "warn", amount: net(t) });
    } else {
      out.push({ text: `${inr(net(t))} from ${label(t)} — safe with Ybex. It's released after the brand approves your final content${t?.kind === "campaign" ? " and live link" : ""}, then 1–2 working days to your bank.`, link: t?.deal_id ? `/creator/inbox` : "/earnings", cta: "Open deal", tone: "wait", amount: net(t) });
    }
  }
  const paid = rows.filter(paidOut).sort((a, b) => Date.parse(b.payout_completed_at || b.updated_at || 0) - Date.parse(a.payout_completed_at || a.updated_at || 0)).slice(0, 2);
  for (const t of paid) {
    const on = Date.parse(t.payout_completed_at || t.updated_at || "");
    out.push({ text: `${inr(net(t))}${t?.brand_name ? ` from ${t.brand_name}` : ""} — paid ✅${on ? ` on ${dayText(new Date(on + IST))}` : ""}${t?.payout_reference || t?.utr_number ? ` (UTR ${t.payout_reference || t.utr_number})` : ""}.`, link: "/earnings", cta: "Earnings", tone: "done", amount: net(t) });
  }
  return out;
}

// ── 3. the month's report card ────────────────────────────────────────────────────────────────────────────
export function monthReport({ txns = [], applications = [], threads = [], orders = [], profile = {} } = {}, now = new Date()) {
  const m = istMonth(now);
  const lastM = (() => { const [y, mo] = m.split("-").map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`; })();
  const net = (t) => Number(t?.creator_net_amount || t?.net_amount || t?.amount || 0) || 0;
  const ok = (txns || []).filter((t) => !/refund|fail|cancel/i.test(String(t?.status || "")));
  const inMonth = (rows, mm, ...keys) => rows.filter((r) => keys.some((k) => istMonth(r?.[k]) === mm));
  const earned = inMonth(ok, m, "payout_completed_at", "released_at").reduce((a, t) => a + net(t), 0);
  const earnedLast = inMonth(ok, lastM, "payout_completed_at", "released_at").reduce((a, t) => a + net(t), 0);
  const newDeals = inMonth(ok, m, "created_at").length;
  const apps = inMonth(applications || [], m, "created_at", "applied_at");
  const accepted = apps.filter((a) => /accept|approved|shortlist|hired|selected/i.test(String(a?.status || ""))).length;
  const ugcDone = inMonth((orders || []).filter((o) => /APPROVED|COMPLETED|PAID|RELEASED/i.test(String(o?.stage || o?.status || ""))), m, "approved_at", "completed_at", "updated_at").length;
  const brands = [...new Set(inMonth(ok, m, "created_at").map((t) => t?.brand_name).filter(Boolean))];
  const lines = [
    `Earned: ${inr(earned)}${earnedLast ? ` (last month ${inr(earnedLast)}${earned > earnedLast ? " ↑" : earned < earnedLast ? " ↓" : ""})` : ""}`,
    `New paid deals: ${newDeals}${brands.length ? ` — ${brands.slice(0, 3).join(", ")}` : ""}`,
    `Applications sent: ${apps.length}${apps.length ? ` · ${accepted} accepted` : ""}`,
    ugcDone ? `UGC videos approved: ${ugcDone}` : "",
  ].filter(Boolean);
  const tips = [];
  if (!apps.length) tips.push("You didn't apply to any campaign this month — apply to 5 that match you; most creators get hired after a few tries.");
  else if (apps.length >= 5 && !accepted) tips.push("Lots of applications but none accepted — sharpen your pitch: say the result you'll get the brand, and add 2 portfolio pieces.");
  if (!reachOfMeSafe(profile)) tips.push("Add your average reach — brands filter by it and skip profiles without it.");
  if (missingFill(profile).length) tips.push("Your profile is missing details brands search by — say \"complete my profile\" and I'll fill it here.");
  if (!tips.length) tips.push("Good month — keep posting 4–5 times a week and apply to new matching campaigns as they come.");
  return { month: m, earned, earnedLast, newDeals, apps: apps.length, accepted, lines, tips };
}
const reachOfMeSafe = (p) => { try { return reachOfMe(p); } catch { return 0; } };

// ── 4. agreement in simple words + red flags in a pasted contract ─────────────────────────────────────────
export const AGREEMENT_SIMPLE = {
  en: [
    "Money first: the brand pays into Ybex's secure hold BEFORE you start. You're never working unpaid.",
    "You get paid after the brand approves your final content (and the live link for posts) — then 1–2 working days to your bank.",
    "Revisions: only what's written in the agreement, and only inside the brief. Anything new — you can say no.",
    "Posts stay live at least 90 days. Mark them as a paid partnership (#ad).",
    "You own your content. The brand gets a NON-exclusive licence — 12 months for campaigns, 6 months for UGC — so you can still work with other brands.",
    "Cancel before your first draft → the brand gets the refund. After a draft, Ybex support decides fairly.",
    "Problem? Ybex support first; if not solved in 30 days, arbitration in Jaipur.",
    "Platform fee and TDS are cut from your payout as shown on screen — no hidden charges.",
  ],
  hi: [
    "Paisa pehle: brand kaam shuru hone SE PEHLE paisa Ybex ke secure hold mein daalta hai. Free mein kaam kabhi nahi.",
    "Brand final content approve kare (post ke liye live link bhi) — uske baad 1–2 working days mein paisa bank mein.",
    "Revisions: sirf utne jitne agreement mein likhe hain, aur sirf brief ke andar. Kuch naya maange to mana kar sakte ho.",
    "Post kam se kam 90 din live rakhni hai, aur #ad / paid partnership likhna hai.",
    "Content aapka hi rehta hai. Brand ko NON-exclusive licence milta hai — campaign 12 mahine, UGC 6 mahine — aap doosre brands ke saath bhi kaam kar sakte ho.",
    "Pehla draft bhejne se pehle cancel → brand ko refund. Draft ke baad Ybex support sahi faisla karega.",
    "Koi dikkat? Pehle Ybex support; 30 din mein na sulje to Jaipur mein arbitration.",
    "Platform fee aur TDS payout se katte hain, screen pe dikhte hain — koi chhupa charge nahi.",
  ],
};
const FLAGS = [
  [/\b(perpetuity|perpetual|in perpetuity|forever|lifetime|irrevocabl\w*)\b/i, "Rights forever (perpetual / irrevocable) — ask for a time limit like 6–12 months."],
  [/\bexclusiv\w*/i, "Exclusivity — you may not work with other brands. Ask how long and which brands, and charge extra for it."],
  [/\b(unlimited revisions?|as many revisions|until (the brand is )?satisfied)\b/i, "Unlimited revisions — fix it to 1–2 revisions."],
  [/\b(60|90|120)\s*days?\b.*\b(pay|payment|invoice)|\b(pay|payment)\b.*\b(60|90|120)\s*days?\b|net\s*(60|90)/i, "Payment after 60–90 days — ask for payment upfront or within 7–15 days (on Ybex it's held before you start)."],
  [/\b(penalt\w*|liquidated damages|deduct\w*|fine of)\b/i, "Penalty / deductions — check the amount and when it applies."],
  [/\b(paid ads?|whitelist\w*|boost\w*|dark posts?|spark ads?)\b/i, "Your content used in paid ads — that's extra; ask for an ads fee."],
  [/\b(raw footage|source files|all files)\b/i, "They want raw footage — that's usually charged extra."],
  [/\b(no payment|without payment|free of cost|exposure)\b/i, "No / unclear payment — get the amount in writing before you start."],
  [/\b(indemnif\w*)\b/i, "Indemnity — you'd pay for their losses. Keep it limited to your own mistakes."],
];
export const contractFlags = (text) => FLAGS.filter(([rx]) => rx.test(String(text || ""))).map(([, msg]) => msg);

// ── 5. a 7-day content plan ───────────────────────────────────────────────────────────────────────────────
const FEST = [["01-14", "Makar Sankranti"], ["01-26", "Republic Day"], ["02-14", "Valentine's Day"], ["03-08", "Women's Day"], ["08-15", "Independence Day"], ["10-02", "Gandhi Jayanti"], ["12-25", "Christmas"], ["12-31", "New Year's Eve"]];
export function contentPlan(profile = {}, now = Date.now(), due = []) {
  const g = nicheGroupsOfMe(profile)[0] || "Lifestyle";
  const bank = IDEA_BANK[g] || IDEA_BANK.Lifestyle;
  const wk = Math.floor(now / (7 * 864e5));
  const fmt = ["Reel", "Story poll", "Reel", "Carousel", "Reel", "Behind the scenes (story)", "Rest / reply to comments"];
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(now + IST + i * 864e5);
    const md = `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    const fest = FEST.find(([k]) => k === md);
    const dl = (due || []).find((x) => { const t = Date.parse(x?.due || x?.deadline || ""); return t && Math.floor((t + IST) / 864e5) === Math.floor((now + IST) / 864e5) + i; });
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
    const idea = dl ? `Brand work due: ${dl.title || dl.text || "your deal"} — finish & submit first` : fest ? `${fest[1]} special — ${bank[(wk + i) % bank.length]}` : fmt[i].startsWith("Rest") ? fmt[i] : `${fmt[i]}: ${bank[(wk + i) % bank.length]}`;
    days.push({ text: `${day} ${dayText(d)} — ${idea}` });
  }
  return { niche: g, days, tip: "Post 7–10 pm; hook in the first 2 seconds; reply to comments in the first hour." };
}

// ── 6. reply to a brand (offer / negotiation) — template when the AI is off ──────────────────────────────
export function brandReplyKind(text) {
  const t = lower(text);
  if (/\b(kam|low|less|negotiat\w*|counter|mol ?bhav|zyada (do|chahiye)|increase|badha)\b/.test(t)) return "counter";
  if (/\b(mana|decline|reject|nahi karna|no thanks|refuse|busy)\b/.test(t)) return "decline";
  if (/\b(details?|brief|kya chahiye|deliverables?|deadline|kab tak)\b/.test(t)) return "details";
  if (/\b(accept|haan|yes|deal done|kar lunga|kar lungi|ok)\b/.test(t)) return "accept";
  return "counter";
}
export function brandReplyDraft({ kind = "counter", offer = 0, myRate = 0, fair = 0, brand = "" } = {}) {
  const hi = brand ? `Hi ${brand} team,` : "Hi,";
  const ask = Math.max(myRate || 0, fair || 0, offer ? Math.round(offer * 1.3 / 500) * 500 : 0);
  if (kind === "decline") return `${hi}\n\nThank you for thinking of me! I won't be able to take this one up right now, but I'd love to work together on a future campaign.\n\nBest,`;
  if (kind === "details") return `${hi}\n\nThanks for reaching out — sounds interesting! Could you share:\n• the deliverables (reel / story / both)\n• the deadline\n• the product and key points to cover\n• usage rights (organic only, or ads too?)\n\nThen I'll confirm my quote.\n\nBest,`;
  if (kind === "accept") return `${hi}\n\nHappy to go ahead${offer ? ` at ${inr(offer)}` : ""}! Please send the brief and confirm the deal on Ybex — I'll start as soon as the payment is in Ybex's secure hold.\n\nBest,`;
  return `${hi}\n\nThanks for the offer${offer ? ` of ${inr(offer)}` : ""}! I really like the product. For a reel with my reach and engagement, my rate is ${ask ? inr(ask) : "[your rate]"} — it includes the concept, shoot, edit and 1 revision.${offer && ask > offer ? ` If the budget is fixed, I can do a story set at ${inr(offer)} instead.` : ""}\n\nLet me know what works and we can confirm the deal on Ybex.\n\nBest,`;
}

/** v435 (Eva question test #12): "show my earnings and also find new campaigns and write my bio" → 3 requests.
 *  Only splits when every part is its own different request (by `detect`); otherwise null. Max 3. Pure. */
export function splitRequests(text = "", detect = detectCreatorIntent) {
  const raw = String(text || "").trim();
  if (raw.length < 12 || !/\b(and also|and then|and|also|aur|plus|then|phir|saath mein)\b|[,;]/i.test(raw)) return null;
  const parts = raw.split(/\s*(?:,|;|\band also\b|\band then\b|\balso\b|\band\b|\baur\b|\bplus\b|\bthen\b|\bphir\b|\bsaath mein\b)\s*/i).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 2);
  if (parts.length < 2) return null;
  const hits = parts.map((p) => detect(p)?.intent || "");
  if (hits.some((h) => !h) || new Set(hits).size !== hits.length) return null;
  return parts.slice(0, 3);
}

/** v438 (Eva deep test #6): "make it shorter / funnier / more polite", "hindi mein likho", "for Nykaa vitamin C serum"
 *  — a request to change Eva's LAST text (pitch, script, caption, bio, reply). Pure. */
export function editRequest(text = "") {
  const t = lower(text).trim();
  if (!t || t.split(/\s+/).length > 14) return false;
  return /^(make it|make this|make that|change it|change this|change that|rewrite|redo|re-?write it|thoda|isko|ise|isse|ye wala|same but|now|and )\b/.test(t)
    || /\b(shorter|longer|funnier|funny|more (polite|formal|casual|fun|professional|friendly|catchy)|less (formal|salesy)|polite|formal|casual tone|in hindi|hindi (mein|me)|in english|english (mein|me)|hinglish (mein|me)|translate|chhota|lamba|short kar|bada kar)\b/.test(t)
    || /^(for|about)\s+[a-z0-9]/.test(t);
}
/** A fallback edit when the AI is off: shorter = first two sentences; otherwise unchanged. Pure. */
export function editFallback(text = "", ask = "") {
  if (/\b(short|chhota|short kar)/i.test(ask)) {
    // v442: hashtags are kept apart — a caption keeps its first sentence and 4 tags
    const all = String(text).split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const tagLine = (l) => /^(#[\w\u0900-\u097F]+\s*)+$/.test(l);
    const tags = all.filter(tagLine).join(" ").split(/\s+/).filter(Boolean);
    const lines = all.filter((l) => !tagLine(l));
    const tagOut = tags.length ? "\n" + tags.slice(0, 4).join(" ") : "";
    if (lines.length > 2) return lines.slice(0, Math.max(2, Math.ceil(lines.length / 2))).join("\n") + tagOut; // whole lines, never half a step
    const parts = lines.join(" ").split(/(?<=[^\d\s][.!?])\s+/); // "1. Hook" is not the end of a sentence
    const keep = parts.length > 2 ? 2 : 1;
    return parts.slice(0, keep).join(" ") + tagOut;
  }
  return String(text);
}
