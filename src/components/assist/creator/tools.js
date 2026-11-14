// Session 54: Eva for creators — the "hands". Every read is a call the creator's own screens already make
// (campaigns, UGC briefs, my applications, my UGC orders, my profile, KYC, transactions). The only thing Eva
// SENDS for the creator is a campaign application — the same `campaigns/apply` call the campaign page makes,
// and only after the creator taps "Send" on a filled-in card. UGC briefs open the UGC screen (claiming needs
// the OTP agreement there).
import { api } from "../../../lib/api";
import { fetchPayoutMethods } from "../../../lib/payoutMethods"; // v347
import { safeStorage } from "../../../utils/storage";
import { readEvaSettings, blockedSwitch } from "../../feedback/evaSettings";
import { rankOpportunities, categoryMatches, nichesOfMe, pendingInvites, PITCH_MIN, PITCH_MAX, QUOTE_MIN, QUOTE_MAX, charCount } from "./creatorLogic";

const me = () => { try { return JSON.parse(safeStorage.getItem("ybex_user") || "null") || {}; } catch { return {}; } };
const ls = {
  get: (k) => { try { return window.localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const cache = new Map();
// v328: one key helper for read AND delete — force-refresh used to delete the bare "me"/"work" key, which never
// matched the per-account key, so applied campaigns kept showing "Apply in 1 tap" for 3 minutes.
const cacheKey = (key) => `${me().user_id || "anon"}|${key}`; // Session 58: per account (another login in the same tab saw the last one's data)
const uncache = (key) => cache.delete(cacheKey(key));
async function cached(key, ms, fn) {
  key = cacheKey(key);
  const c = cache.get(key);
  if (c && Date.now() - c.at < ms) return c.v;
  const v = await fn();
  cache.set(key, { at: Date.now(), v });
  return v;
}
export const clearCache = () => cache.clear();
// v363: anything saved anywhere in the app (profile, rates, portfolio…) → Eva reads fresh next time.
if (typeof window !== "undefined") window.addEventListener("ybex:data-changed", () => cache.clear());
const arr = (x) => (Array.isArray(x) ? x : []);

// ── the creator ──────────────────────────────────────────────────────────────────────────────────────
export async function loadMe(force = false) {
  // v328: "Earnings & payouts" switched off → Eva doesn't read KYC or payout methods (separate cache entry).
  const money = !blockedSwitch("creator", "kyc");
  const key = money ? "me" : "me-nomoney";
  if (force) uncache(key);
  const out = await cached(key, 60e3, async () => {
    const [p, k, pm] = await Promise.all([
      api.get("creators/me").then((r) => r?.data?.profile || r?.data || {}).catch(() => ({})),
      money ? api.get("verifications/me").then((r) => r?.data || null).catch(() => null) : null,
      money ? fetchPayoutMethods({}).catch(() => ({ __failed: true })) : null, // v332; v347: KYC UPI counts too
    ]);
    const u = me();
    const profile = { ...u, ...(p || {}) };
    const kyc = String(k?.status || k?.kyc_status || u?.kyc_status || (u?.kyc_verified ? "approved" : "") || "").toLowerCase();
    const methods = arr(pm?.methods || pm?.payment_methods || pm);
    // v332: payoutUnknown = the server couldn't read it — Eva must not say "no bank / UPI added".
    return { profile, kyc, kycRaw: k, hasPayout: methods.length > 0 || Boolean(pm?.upi_id || pm?.account_number), payoutUnknown: Boolean(pm?.__failed), user: u, money };
  });
  if (out?.payoutUnknown) uncache(key); // v332: read again next time
  return out;
}

// v419 (Ravi): Eva fills a missing profile detail in chat and saves it straight away (same PATCH as the profile
// screen; the server keeps every field that isn't sent).
export async function saveProfileFields(payload) {
  try {
    await api.patch("creators/me", payload, { timeout: 20000 });
    cache.clear();
    try { window.dispatchEvent(new Event("ybex:data-changed")); } catch { /* no window */ }
    return true;
  } catch { return false; }
}

// ── work ─────────────────────────────────────────────────────────────────────────────────────────────
export async function loadWork(force = false) {
  if (force) { uncache("work"); } // v328: same key as cached()
  return cached("work", 3 * 60e3, async () => {
    const [campaigns, briefs, applications, orders] = await Promise.all([
      api.get("campaigns").then((r) => arr(r.data)).catch(() => []),
      api.get("ugc/briefs/available").then((r) => arr(r.data)).catch(() => []),
      api.get("campaigns/my-applications").then((r) => arr(r.data)).catch(() => []),
      api.get("ugc/orders/creator").then((r) => arr(r.data)).catch(() => []),
    ]);
    return { campaigns, briefs, applications, orders };
  });
}
export async function opportunities({ ugcOnly = false, campaignsOnly = false, niches = null } = {}) {
  const [{ profile }, work] = await Promise.all([loadMe(), loadWork()]);
  let list = rankOpportunities({ campaigns: ugcOnly ? [] : work.campaigns, briefs: campaignsOnly ? [] : work.briefs }, profile, { applied: work.applications, niches }); // v431: niche named in the message
  return { list, profile };
}

// v419 (QA): the creator's own deal chats (same data + state words as the inbox).
export async function loadThreads(force = false) {
  if (force) uncache("threads");
  return cached("threads", 60e3, async () => api.get("chat/v2/threads").then((r) => arr(r.data)).catch(() => null));
}

export async function loadMoney() {
  // v332 (Ravi): a failed read is not "no earnings" — `failed` makes Eva say she couldn't check, and it isn't cached.
  let failed = false;
  const fail = () => { failed = true; return []; };
  const out = await cached("money", 60e3, async () => {
    const [txns, eligible] = await Promise.all([
      api.get("transactions").then((r) => arr(r.data)).catch(fail),
      api.get("creator/payout-eligible-deals").then((r) => arr(r.data?.deals || r.data)).catch(fail),
    ]);
    return { txns, eligible, failed };
  });
  if (out?.failed) uncache("money");
  return out;
}

/** Market data from live campaigns + open briefs (aggregated on the server, no brand names). */
export async function loadInsights() {
  return cached("insights", 10 * 60e3, async () => {
    try { const { data } = await api.get("assist/creator/insights", { timeout: 15000, bypassCache: true }); return data?.ok ? data.insights : null; } catch { return null; }
  });
}

// ── brand invitations waiting for this creator (read only — Accept / Decline happen in the app's own
// invitation popup, CreatorReviewInvitationModal, with its own calls) ─────────────────────────────────
export async function loadInvites() {
  try { const { data } = await api.get("creators/invitations", { bypassCache: true }); return pendingInvites(data); } catch { return []; }
}

// ── apply (the same call and checks as the campaign page) ─────────────────────────────────────────────
export async function applyTo(opp, { pitch, amount }) {
  const { profile, kyc, user, money } = await loadMe();
  if (opp.kind !== "campaign") return { ok: false, code: "UGC", message: "UGC briefs are claimed on the UGC screen (you sign there with a code)." };
  if (!(user?.onboarded || profile?.onboarded || profile?.onboarding_complete)) return { ok: false, code: "ONBOARD", message: "Finish your profile setup first, then you can apply." };
  // v328: with "Earnings & payouts" off Eva hasn't read KYC — the server still checks it on apply.
  if ((money !== false || kyc) && !/approved|verified/.test(kyc)) return { ok: false, code: "KYC", message: "Your KYC isn't verified yet — brands can only pay verified creators." };
  if (!categoryMatches(opp.categories || [], nichesOfMe(profile))) return { ok: false, code: "NICHE", message: "This campaign is for a different niche than your profile." };
  const amt = Math.round(Number(amount) || 0);
  if (amt < QUOTE_MIN) return { ok: false, code: "AMOUNT", message: "Please enter your quote (₹100 or more)." };
  if (amt > QUOTE_MAX) return { ok: false, code: "AMOUNT", message: "Your quote can be at most ₹50,00,000." };
  const pl = charCount(String(pitch || "").trim()); // v329: same count as the card's counter (emoji = 1)
  if (pl < PITCH_MIN) return { ok: false, code: "PITCH", message: "Write a little more in your pitch (20+ characters)." };
  if (pl > PITCH_MAX) return { ok: false, code: "PITCH", message: "Keep your pitch under 500 characters." };
  try {
    const { data } = await api.post("campaigns/apply", {
      campaign_id: opp.id,
      proposed_amount: amt,
      pitch: String(pitch).trim(),
      creator_name: String(profile?.name || user?.name || "Creator").trim(),
      creator_location: profile?.city || null,
      due_date: null,
      terms_and_conditions: null,
    });
    uncache("work"); // v328: the per-account key, so the campaign shows "Applied" right away
    return { ok: true, thread_id: data?.thread_id || null };
  } catch (e) {
    return applyError(e);
  }
}
// v329: the server's answer in plain English, with the button that fixes it. `error` can be an object (it was
// rendered as-is → React crash), "Already applied" is a 400, KYC a 403, a closed campaign a 409.
export function applyError(e) {
  const status = Number(e?.response?.status) || 0;
  const d = e?.response?.data || {};
  const pick = (v) => (typeof v === "string" ? v : v && typeof v.message === "string" ? v.message : "");
  const raw = (pick(d.error) || pick(d.detail) || pick(d.message)).trim();
  if (!e?.response) return { ok: false, code: "NETWORK", message: "No internet connection — check your network and tap Send again." };
  if (/already applied/i.test(raw)) { uncache("work"); return { ok: false, code: "APPLIED", message: "You've already applied to this campaign." }; }
  if (/kyc/i.test(raw)) return { ok: false, code: "KYC", message: "Your KYC isn't verified yet — finish KYC, then you can apply." };
  if (d.code === "APPLICATIONS_CLOSED" || status === 409) return { ok: false, code: "CLOSED", message: raw && raw.length <= 140 ? raw : "This campaign isn't taking applications any more." };
  if (status === 404) return { ok: false, code: "CLOSED", message: "This campaign isn't live any more." };
  if (status === 401 || /not authenticated|unauthori[sz]ed/i.test(raw)) return { ok: false, code: "LOGIN", message: "Your login has expired — please log in again, then apply." };
  if (status === 403 && raw && raw.length <= 140) return { ok: false, code: "SERVER", message: raw };
  if (status === 429) return { ok: false, code: "SERVER", message: "Too many tries — please wait a minute and tap Send again." };
  return { ok: false, code: "SERVER", message: "Couldn't send the application. Please try again, or apply from the campaign page." };
}

// ── campaign alerts (server: assist_saved_searches, label "campaign_alerts") ─────────────────────────
export async function setCampaignAlerts(on, profile) {
  try {
    if (on) {
      const { data } = await api.post("assist/saved-searches", { label: "campaign_alerts", filters: { kind: "campaigns", niches: nichesOfMe(profile).slice(0, 8), city: profile?.city || "" } }, { timeout: 15000 });
      return Boolean(data?.ok);
    }
    const { data } = await api.get("assist/saved-searches", { timeout: 15000, bypassCache: true });
    const row = arr(data?.searches).find((s) => s.label === "campaign_alerts");
    if (!row) return true;
    const r = await api.delete(`assist/saved-searches/${encodeURIComponent(row.id)}`, { timeout: 15000 });
    return Boolean(r?.data?.ok);
  } catch { return false; }
}
export async function campaignAlertsOn() {
  try { const { data } = await api.get("assist/saved-searches", { timeout: 15000, bypassCache: true }); return arr(data?.searches).some((s) => s.label === "campaign_alerts"); } catch { return false; }
}

// ── daily message count on this phone (the server counts AI calls too) ─────────────────────────────────
export const DAILY_LIMIT = 30;
const dayKey = () => `ybex_eva_count::${me()?.user_id || ""}::${new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)}`;
export function takeMessage() {
  const n = Number(ls.get(dayKey()) || 0);
  if (n >= DAILY_LIMIT) return false;
  ls.set(dayKey(), String(n + 1));
  return true;
}

// ── AI (optional) ───────────────────────────────────────────────────────────────────────────────────
let aiOff = 0;
export async function askAi(task, text, { history = [], context } = {}) {
  if (Date.now() < aiOff) return null;
  try {
    const { data } = await api.post("assist/ai", { task, text, history: history.slice(-8), context, lang: readEvaSettings().lang }, { timeout: 25000 });
    return data?.ok ? data.data : null;
  } catch (e) {
    const code = e?.response?.data?.code;
    if (code === "LIMIT" && typeof window !== "undefined") window.__ybEvaAiLimit = Date.now(); // v438: "AI replies used up for today"
    if (code === "NO_AI" || code === "LIMIT") aiOff = Date.now() + 10 * 60 * 1000;
    return null;
  }
}

// ── small helpers for the week number (growth ideas change each week) ──────────────────────────────────
export const weekNo = (now = Date.now()) => Math.floor(now / (7 * 864e5));
