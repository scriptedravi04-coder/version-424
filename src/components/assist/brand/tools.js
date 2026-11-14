// Session 51 (Ravi): Ybex Assist for brands — the bot's "hands". Every read uses a call the brand's own
// screens already make (Explore list, my campaigns, my UGC orders / briefs, payment hold), with the
// brand's own login. Nothing here pays, publishes or invites: drafts are written to the SAME draft slots
// the UGC / campaign screens already read, and the brand finishes there with their own tap.
import { api } from "../../../lib/api";
import { draftGet, draftSet } from "../../../lib/userDraft";
import { visibleCreators } from "../../../lib/visibleCreators";
import { applyFilters } from "../../explore/mobile/ExploreMobile";
import { safeStorage } from "../../../utils/storage";
import * as M from "./memory";
import { readEvaSettings } from "../../feedback/evaSettings";
import { refineCreators, findByNames, scoreApplicant, computeAlerts, monthlyReport, ugcDraftFrom, cid, parseCreatorQuery, appCountOf } from "./brandLogic";

const userId = () => { try { const u = JSON.parse(safeStorage.getItem("ybex_user") || "null"); return String(u?.parent_brand_id || u?.user_id || u?.id || ""); } catch { return ""; } };
const ls = {
  get: (k) => { try { return window.localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* private mode */ } },
};

// ── creators (the Explore list) ─────────────────────────────────────────────────────────────────────
let creatorsCache = null;
export async function loadCreators() {
  if (creatorsCache && Date.now() - creatorsCache.at < 5 * 60 * 1000) return creatorsCache.list;
  const { data } = await api.get("creators/explore", { timeout: 30000 });
  const list = visibleCreators(Array.isArray(data) ? data : []);
  creatorsCache = { at: Date.now(), list };
  return list;
}

/** Same result as Explore with these filters (+ followers range / reach / gender / language / sort). */
export async function searchCreators(f) {
  const list = await loadCreators();
  const base = applyFilters(list, f.city || "", { categories: f.niches || [], followers: [], maxRate: f.maxRate || 0, city: "" });
  // A city Explore cannot place → plain text match on the city instead.
  const placed = f.city && base.length === 0 ? applyFilters(list, "", { categories: f.niches || [], followers: [], maxRate: f.maxRate || 0, city: f.city }) : base;
  return refineCreators(placed, { ...f, niches: [] });
}

export async function compareCreators(names) {
  return findByNames(await loadCreators(), names);
}

// ── the brand's own data ────────────────────────────────────────────────────────────────────────────
let brandCache = null;
const currentUid = () => userId();
export async function loadBrandData(force = false) {
  // Session 58: the cache belongs to one account (a different login in the same tab used to get these numbers).
  // v328: "Payments & reports" off → Eva doesn't read the payment list at all (and a cached copy isn't reused).
  const moneyOn = readEvaSettings().money !== false;
  if (!force && brandCache && brandCache.uid === currentUid() && brandCache.moneyOn === moneyOn && Date.now() - brandCache.at < 60 * 1000) return brandCache.data;
  const [c, o, p, b] = await Promise.allSettled([
    api.get("campaigns?mine=true"),
    api.get("ugc/orders/brand"),
    moneyOn ? api.get("escrow-transactions") : Promise.resolve({ data: [] }),
    api.get("ugc/briefs/my"),
  ]);
  const arr = (r, k) => { const d = r.status === "fulfilled" ? r.value?.data : null; const v = k && d && !Array.isArray(d) ? d[k] : d; return Array.isArray(v) ? v : []; };
  // v332: paymentsFailed = the server couldn't read payments → Eva says so instead of "₹0 in payment hold" (not cached).
  const paymentsFailed = moneyOn && p.status === "rejected";
  const data = { campaigns: arr(c), orders: arr(o, "orders"), payments: arr(p), briefs: arr(b), paymentsFailed };
  brandCache = paymentsFailed ? null : { at: Date.now(), data, uid: currentUid(), moneyOn };
  return data;
}
export const alertsNow = async () => computeAlerts(await loadBrandData());
export const reportNow = async () => monthlyReport(await loadBrandData(true));

export async function statusSummary() {
  const { campaigns, orders, payments, briefs, paymentsFailed } = await loadBrandData(true);
  const live = campaigns.filter((x) => ["live", "approved", "active"].includes(String(x.status || "").toLowerCase()));
  const apps = campaigns.reduce((a, x) => a + appCountOf(x), 0); // v328: `applicants` array, not a count field
  const byStage = {};
  for (const o of orders) { const s = String(o.stage || o.status || "OTHER").toUpperCase(); byStage[s] = (byStage[s] || 0) + 1; }
  const HELD = ["deposited", "held", "in_escrow", "video_submitted", "pending", "escrow_held", "active", "approved"];
  const held = payments.filter((x) => HELD.includes(String(x.status || "").toLowerCase())).reduce((a, x) => a + (Number(x.amount || x.gross_amount) || 0), 0);
  return { campaigns: campaigns.length, live: live.length, applications: apps, orders: orders.length, byStage, held: paymentsFailed ? null : held, briefs: briefs.length, liveList: live.slice(0, 5) };
}

/** Top applicants of one campaign (named in the text, else the one with most applications). */
export async function rankApplicants(text) {
  const { campaigns } = await loadBrandData(true);
  if (!campaigns.length) return { campaign: null, rows: [] };
  const t = String(text || "").toLowerCase();
  const named = campaigns.find((c) => c.title && t.includes(String(c.title).toLowerCase().slice(0, 18)))
    || campaigns.find((c) => String(c.title || "").toLowerCase().split(/\s+/).some((w) => w.length > 3 && t.includes(w)));
  const campaign = named || [...campaigns].sort((a, b) => appCountOf(b) - appCountOf(a))[0]; // v328: real counts
  const id = campaign.campaign_id || campaign.id;
  let apps = [];
  try { const { data } = await api.get(`/campaigns/${id}/applications`); apps = Array.isArray(data) ? data : data?.applications || []; } catch { apps = []; }
  const creators = await loadCreators().catch(() => []);
  const byId = new Map(creators.map((c) => [String(cid(c)), c]));
  const rows = apps
    .filter((a) => !["rejected", "withdrawn"].includes(String(a.status || "").toLowerCase()))
    // v328: not on Explore → the application row's own name / photo / niche / followers (never its amount).
    .map((a) => { const c = byId.get(String(a.creator_id)) || { name: a.full_name || a.creator_name || a.name || "Creator", user_id: a.creator_id, picture: a.profile_photo_url || a.avatar_url || a.picture || "", category: a.category, city: a.city || a.creator_location, followers_count: a.raw_followers || a.followers_count || 0 }; return { app: a, creator: c, ...scoreApplicant(campaign, a, c) }; })
    .sort((x, y) => y.score - x.score);
  return { campaign, rows };
}

// ── drafts the existing screens already open ─────────────────────────────────────────────────────────
/** UGC: the post screen restores `ugc_draft` and its step; step 5 = Review & pay. */
export function openUgcDraft(fields) {
  const formData = ugcDraftFrom(fields);
  draftSet("ugc_draft", JSON.stringify({ formData, step: 5, updated_at: Date.now(), from: "assist" }));
  return "/brand/ugc/post";
}
/** v345 (tester: "Eva se banaya tha, ab UGC mein dikh nahi raha"): the brief Eva finishes is kept as the UGC draft
 *  right away (UGC → "Draft brief · Resume"), not only after "Review & Pay now". A brief the brand was writing by
 *  hand is never replaced. */
export function rememberUgcDraft(fields) {
  try {
    const cur = JSON.parse(draftGet("ugc_draft") || "null");
    const curData = cur && (cur.formData || cur);
    const manual = cur && cur.from !== "assist" && curData && (curData.title || curData.product_name);
    if (manual) return false;
    draftSet("ugc_draft", JSON.stringify({ formData: ugcDraftFrom(fields), step: 5, updated_at: Date.now(), from: "assist" }));
    return true;
  } catch { return false; }
}
/** Campaign: the create screen restores `campaign_draft` (same keys it saves). */
// Session 58: `view` = which part of Create campaign opens ("review" = Review & launch, "advanced", "step1").
export function openCampaignDraft(d, view = "step1") {
  draftSet("campaign_draft", JSON.stringify({ ...d, title: d.campaignTitle, description: d.requirementsText, updatedAt: Date.now(), from: "assist", openView: view }));
  return "/brand/campaigns/create";
}
/** The brief being written right now (UGC first, then campaign), for "check my brief". */
export function currentDraft() {
  try { const u = JSON.parse(draftGet("ugc_draft") || "null"); if (u) return { kind: "ugc", data: u.formData || u }; } catch { /* bad json */ }
  try { const c = JSON.parse(draftGet("campaign_draft") || "null"); if (c) return { kind: "campaign", data: c }; } catch { /* bad json */ }
  return null;
}
/** "Pichli baar wala serum UGC" → that brief's fields (latest if no word matches). */
export async function lastBrief(keyword) {
  const { briefs } = await loadBrandData(true);
  if (!briefs.length) return null;
  const k = String(keyword || "").toLowerCase();
  const sorted = [...briefs].sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));
  const b = (k && sorted.find((x) => `${x.title || ""} ${x.product_name || ""}`.toLowerCase().includes(k))) || sorted[0];
  return {
    title: b.title, product_name: b.product_name, product_description: b.product_description, detailed_requirements: b.detailed_requirements || b.requirements,
    product_url: b.product_url, deliverable_type: b.deliverable_type, video_duration: b.video_duration, budget: Number(b.budget || b.budget_per_creator || 0),
    max_creators: Number(b.max_creators || 1), delivery_hours: Number(b.delivery_hours || 48), dos: Array.isArray(b.dos) ? b.dos : [], donts: Array.isArray(b.donts) ? b.donts : [],
  };
}

// ── saved searches → "naye creators aaye to batana" ────────────────────────────────────────────────
// Session 52: kept on the server (memory.js) → the server also sends a bell + phone push when a new
// creator matches. The phone copy below is only the fallback when the server can't be reached.
const SAVED = () => `ybex_assist_saved::${userId()}`;
function saveLocal(filters, label, seen = []) {
  const all = readSaved().filter((s) => s.label !== label).slice(-4);
  all.push({ filters, label, seen, at: Date.now() });
  ls.set(SAVED(), JSON.stringify(all));
  return all.length;
}
/** → "server" (push on) | "phone" (shown when the chat opens). */
export async function saveSearch(filters, label) {
  const found = await searchCreators({ ...parseCreatorQuery(""), ...filters }).catch(() => []);
  const ids = found.map((c) => String(cid(c)));
  if (await M.saveSearchServer(filters, label, ids)) return "server";
  saveLocal(filters, label, ids);
  return "phone";
}
export function readSaved() { try { const v = JSON.parse(ls.get(SAVED()) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
/** New creators in each saved search since the last check (the first check only remembers who is there). */
export async function newInSavedSearches() {
  let server = await M.listSavedServer();
  // Searches saved on this phone before Session 52 move to the server once.
  if (server && !server.length && readSaved().length) {
    for (const s of readSaved()) await M.saveSearchServer(s.filters, s.label, s.seen || []);
    ls.set(SAVED(), "[]");
    server = await M.listSavedServer();
  }
  if (server) {
    const out = [];
    // Session 58: the "Notify me from Eva" off-switch is stored as a row too — it is not a search.
    for (const s of server.filter((x) => x?.label !== "eva_mute" && x?.filters?.kind !== "mute")) {
      const found = await searchCreators({ ...parseCreatorQuery(""), ...s.filters }).catch(() => null);
      if (!found) continue;
      const seen = new Set((s.seen_ids || []).map(String));
      const freshIds = new Set((s.fresh_ids || []).map(String));
      const fresh = found.filter((c) => freshIds.has(String(cid(c))) || !seen.has(String(cid(c))));
      // Session 58: they count as "seen" only once the brand actually opens the update (FeedbackBot postNews),
      // not just because Eva loaded — before, unopened "N updates" were lost for good.
      const seenNow = { id: s.id, ids: found.map((c) => String(cid(c))) };
      if (fresh.length) out.push({ label: s.label, creators: fresh.slice(0, 10), filters: s.filters, seen: seenNow });
      else if (freshIds.size) M.markSeenServer(seenNow.id, seenNow.ids);
    }
    return out;
  }
  const saved = readSaved();
  if (!saved.length) return [];
  const out = [];
  for (const s of saved) {
    const found = await searchCreators({ ...parseCreatorQuery(""), ...s.filters }).catch(() => []);
    const ids = found.map((c) => String(cid(c)));
    if (s.seen.length) {
      const fresh = found.filter((c) => !s.seen.includes(String(cid(c))));
      if (fresh.length) out.push({ label: s.label, creators: fresh.slice(0, 10), filters: s.filters });
    }
    s.seen = ids.slice(0, 2000);
  }
  ls.set(SAVED(), JSON.stringify(saved));
  return out;
}

// ── daily message count on this phone (the server keeps its own count for AI calls) ─────────────────
export const DAILY_LIMIT = 30;
const dayKey = () => `ybex_assist_count::${userId()}::${new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)}`;
export function takeMessage() {
  const n = Number(ls.get(dayKey()) || 0);
  if (n >= DAILY_LIMIT) return false;
  ls.set(dayKey(), String(n + 1));
  return true;
}

// ── AI (optional) ───────────────────────────────────────────────────────────────────────────────────
let aiOff = 0; // after NO_AI / LIMIT, don't ask again for a while
export async function askAi(task, text, { history = [], context } = {}) {
  if (Date.now() < aiOff) return null;
  try {
    const { data } = await api.post("assist/ai", { task, text, history: history.slice(-8), context, lang: readEvaSettings().lang }, { timeout: 25000 });
    return data?.ok ? data.data : null;
  } catch (e) {
    const code = e?.response?.data?.code;
    if (code === "LIMIT" && typeof window !== "undefined") window.__ybEvaAiLimit = Date.now(); // v438: "AI replies used up for today"
    if (code === "NO_AI" || code === "LIMIT" || code === "BRANDS_ONLY") aiOff = Date.now() + 10 * 60 * 1000;
    return null;
  }
}
