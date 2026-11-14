// v419 (Ravi: admin panel on the phone, from the "Admin Mobile" design) — data for the mobile admin.
// Every list comes from the same admin APIs the desktop admin uses; nothing here is sample data.
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../lib/api";
import { userKind } from "../../../lib/adminSearch";
import { isPaidOut, isRefunded } from "../../../../backend/adminMoney";
import { payableAfterRefund } from "../../../utils/payoutAfterRefund"; // v431

// ---------- tiny shared cache: one fetch per key, reused by every screen, refreshable ----------
const cache = new Map(); // key -> { at, data, promise }
const listeners = new Map(); // key -> Set(fn)
const STALE_MS = 45000;

function emit(key) { (listeners.get(key) || new Set()).forEach((fn) => { try { fn(); } catch { /* listener gone */ } }); }

export async function loadKey(key, fetcher, { fresh = false } = {}) {
  const hit = cache.get(key);
  if (!fresh && hit && hit.data !== undefined && Date.now() - hit.at < STALE_MS) return hit.data;
  if (!fresh && hit?.promise) return hit.promise;
  if (fresh && hit?.promise && hit.promiseAt && Date.now() - hit.promiseAt < 1500) return hit.promise; // v431: one reload, not two
  const promise = (async () => {
    try {
      const data = await fetcher();
      cache.set(key, { at: Date.now(), data });
      return data;
    } catch (err) {
      cache.set(key, { at: 0, data: hit?.data, error: err });
      throw err;
    } finally {
      emit(key);
    }
  })();
  cache.set(key, { ...(hit || {}), promise, promiseAt: Date.now() });
  return promise;
}

export function invalidate(...keys) { keys.forEach((k) => { const h = cache.get(k); if (h) cache.set(k, { ...h, at: 0 }); }); }
export function resetAdminMobileCache() { cache.clear(); }

// v431 (audit #37 / #21 / #54): keep phone screens fresh.
//  - a change made anywhere in the app (full desktop sections inside the phone frame too) marks the matching lists stale
//    and reloads the ones on screen — a payout marked paid in the full desk leaves the phone card;
//  - coming back to the app (tab visible again) reloads what's on screen if it is older than 45 s.
const KEYS_FOR_URL = [
  [/\/admin\/(escrow|transactions|payout)/i, ["escrow", "stats"]], [/\/admin\/ugc-refunds/i, ["refunds"]],
  [/\/admin\/referral/i, ["referral"]], [/\/admin\/verifications|\/kyc/i, ["kyc"]], [/\/admin\/waitlist/i, ["waitlist"]],
  [/\/admin\/campaigns/i, ["campaigns"]], [/\/admin\/users/i, ["users"]],
];
function reloadOnScreen(keys) {
  invalidate("counts", ...keys);
  [...new Set(["counts", ...keys])].forEach((k) => { if ((listeners.get(k)?.size || 0) > 0 && FETCHERS[k]) loadKey(k, FETCHERS[k], { fresh: true }).catch(() => {}); });
}
if (typeof window !== "undefined") {
  window.addEventListener("ybex:data-changed", (e) => {
    const url = String(e?.detail?.url || "");
    const keys = KEYS_FOR_URL.filter(([re]) => re.test(url)).flatMap(([, k]) => k);
    if (keys.length) reloadOnScreen(keys);
  });
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const stale = [...listeners.keys()].filter((k) => (listeners.get(k)?.size || 0) > 0 && Date.now() - (cache.get(k)?.at || 0) > STALE_MS);
    if (stale.length) reloadOnScreen(stale);
  });
}

/** useAdminData("kyc") → { data, loading, error, refresh } */
export function useAdminData(key, opts = {}) {
  const fetcher = FETCHERS[key];
  const [, force] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const fn = () => mounted.current && force((n) => n + 1);
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    if (opts.enabled !== false) loadKey(key, fetcher).catch(() => {});
    return () => { mounted.current = false; listeners.get(key)?.delete(fn); };
  }, [key, opts.enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = useCallback(() => loadKey(key, fetcher, { fresh: true }).catch(() => {}), [key, fetcher]);
  const h = cache.get(key) || {};
  return { data: h.data, loading: h.data === undefined && !h.error, error: h.data === undefined ? h.error : null, refresh };
}

// ---------- helpers ----------
export const fmtK = (n) => { n = Number(n) || 0; if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"; if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K"; return n.toLocaleString("en-IN"); };
export const inr = (n) => "₹" + Math.round(Number(n || 0)).toLocaleString("en-IN");
/** v431 (audit #56): money to SEND — paise kept (₹8,999.50 stays ₹8,999.50, not ₹9,000). */
export const inrExact = (n) => { const v = Number(n || 0); return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }); };
export const initials = (s) => String(s || "?").replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
export const igUrl = (h) => "https://www.instagram.com/" + String(h || "").replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/+$/, "") + "/";
export const cleanHandle = (h) => String(h || "").trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
const AV = [{ bg: "#F5F0FF", fg: "#7C3AED" }, { bg: "#ECFDF5", fg: "#047857" }, { bg: "#FFF7ED", fg: "#C2410C" }, { bg: "#F0F9FF", fg: "#0369A1" }, { bg: "#FDF2F8", fg: "#BE185D" }];
export const avatarColor = (seed) => { let h = 0; for (const c of String(seed || "")) h = (h * 31 + c.charCodeAt(0)) | 0; return AV[Math.abs(h) % AV.length]; };
export const maskAcc = (s) => { const v = String(s || "").replace(/\s/g, ""); if (!v) return ""; return v.length <= 4 ? v : "XXXXXX" + v.slice(-4); };
const toTime = (v) => { const t = new Date(v || 0).getTime(); return Number.isFinite(t) ? t : 0; };

/** "2h ago" / "Yesterday" / "3d ago" / "7 Nov" */
export function ago(v, now = Date.now()) {
  const t = toTime(v); if (!t) return "";
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d ago`;
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
/** age of the oldest item for a queue tile: "6h", "2d" */
export function ageShort(v, now = Date.now()) {
  const t = toTime(v); if (!t) return "";
  const h = Math.max(0, Math.floor((now - t) / 3600000));
  if (h < 1) return "<1h";
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
export const isOlderThan = (v, hours, now = Date.now()) => { const t = toTime(v); return !!t && now - t > hours * 3600000; };
export const dateShort = (v) => { const t = toTime(v); return t ? new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""; };
export const dateLong = (v) => { const t = toTime(v); return t ? new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""; };
const oldestOf = (arr, f) => arr.reduce((o, x) => { const t = toTime(f(x)); return t && (!o || t < o) ? t : o; }, 0) || null;

// ---------- normalizers ----------
const pick = (...v) => v.find((x) => x !== undefined && x !== null && String(x).trim() !== "");

/** v431 (audit #9): one status name per meaning — SUBMITTED / UNDER_REVIEW / IN_REVIEW = PENDING, VERIFIED = APPROVED. */
export function kycStatusOf(v) {
  const st = String(v || "PENDING").toUpperCase();
  if (["UNDER_REVIEW", "SUBMITTED", "IN_REVIEW", "PENDING_REVIEW", "REVIEW"].includes(st)) return "PENDING";
  if (["VERIFIED", "COMPLETED"].includes(st)) return "APPROVED";
  return st;
}
/** v431 (audit #8): a pending KYC with no document can't be approved (desktop hides those too). */
export const kycReviewable = (r) => r?.status === "PENDING" && Array.isArray(r.docs) && r.docs.length > 0;

export function normKyc(r) {
  const d = r.documents || {};
  const isBrand = String(r.kind || r.type).toLowerCase() === "brand";
  const docs = isBrand
    ? [["Incorporation proof", pick(r.incorporation_doc_url, r.data?.incorporation_doc_url)], ["GST certificate", pick(r.gst_certificate_url, r.data?.gst_certificate_url)], ["Company PAN", pick(r.pan_card_url, r.data?.pan_card_url)]]
    : [["PAN card", pick(r.pan_card_url, r.pan_doc_url, d.pan_photo_url, d.pan_card_url)], ["Aadhaar front", pick(r.aadhaar_front_url, d.aadhaar_front_url)], ["Aadhaar back", pick(r.aadhaar_back_url, d.aadhaar_back_url)], ["UPI QR code", pick(r.upi_qr_code_url, d.upi_qr_code_url)]];
  const rateCard = r.rate_card || {};
  return {
    id: String(r.verification_id || r.id),
    userId: r.user_id || r.creator_id || r.brand_id || r.id,
    type: isBrand ? "brand" : "creator",
    name: pick(isBrand ? r.company_name : r.full_name, r.name, isBrand ? "Brand" : "Creator"),
    email: pick(r.email, r.poc_email, r.user?.email) || "",
    handle: cleanHandle(pick(r.instagram_handle, r.social_handle, isBrand ? "" : r.handle) || ""),
    website: isBrand ? pick(r.website, r.website_url, r.handle) || "" : "",
    followers: Number(pick(r.follower_count, r.followers) || 0),
    reach: Number(r.avg_reach || 0),
    niche: pick(r.niche, r.primary_niche, r.category) || "",
    city: [r.city, r.state].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(", ") || r.address || "",
    dob: pick(r.dob, r.date_of_birth, r.creator_dob) || "",
    phone: pick(r.phone, r.mobile, r.creator_phone, r.poc_phone) || "",
    languages: Array.isArray(r.languages) ? r.languages.join(", ") : (r.languages || ""),
    reel: Number(pick(r.rate_reel, rateCard.reels, rateCard.reel) || 0),
    story: Number(pick(r.rate_story, rateCard.stories, rateCard.story) || 0),
    yt: Number(pick(r.rate_yt_video, rateCard.yt_video) || 0),
    mode: r.barter_mode || "",
    pan: pick(r.pan_number, d.pan_number) || "",
    aadhaar: pick(r.aadhaar_number, d.aadhaar_number) ? "XXXX XXXX " + String(pick(r.aadhaar_number, d.aadhaar_number)).replace(/\D/g, "").slice(-4) : "",
    bankHolder: pick(r.bank_holder_name, d.bank_holder_name) || "",
    bankAcc: maskAcc(pick(r.bank_account_number, r.bank_account_no, r.bank_account, d.bank_account_number, d.bank_account_no)),
    ifsc: pick(r.bank_ifsc, d.bank_ifsc) || "",
    upi: pick(r.upi_id, d.upi_id) || "",
    gstin: pick(r.gstin, r.gst_number) || "",
    poc: pick(r.poc_name, r.authorized_person_name) || "",
    designation: pick(r.poc_designation, r.designation) || "",
    incType: r.incorporation_type || "",
    docs: docs.filter(([, url]) => !!url).map(([label, url]) => ({ label, url })),
    photo: pick(r.photo, r.profile_photo_url, r.picture, r.avatar_url, r.logo, r.user?.picture) || "", // v430: KYC list showed only initials
    status: kycStatusOf(r.status), // v431 (audit #9)
    submittedAt: r.submitted_at || r.created_at || "",
    bio: r.bio && r.bio !== "QA creator profile" ? r.bio : "", // v431 (audit #12)
    reason: pick(r.rejection_reason, r.admin_note) || "",
    raw: r,
  };
}

export function normUser(u) {
  const cp = u.creator_profile || {}, bp = u.brand_profile || {};
  const kind = userKind(u);
  const name = u.role === "brand" ? (bp.company_name || u.brand_setup?.company_name || u.name) : (u.name || cp.name);
  return {
    id: u.user_id,
    name: name || u.email || "Account",
    kind,
    email: u.email || "",
    handle: cleanHandle(cp.instagram_handle || bp.instagram_handle || ""),
    followers: Number(cp.followers_instagram || cp.followers || cp.follower_count || 0),
    city: cp.city || bp.city || "",
    joinedAt: u.created_at || "",
    banned: u.banned === true,
    suspended: u.suspended === true || (u.suspended_until ? Date.parse(u.suspended_until) > Date.now() : false), // v431 (audit #16)
    deleted: u.is_deleted === true,
    kycStatus: String(u.kyc_status || u.kyc?.status || "").toUpperCase(),
    profileStatus: cp.profile_status || "",
    phone: u.phone || "",
    photo: pick(u.picture, cp.photo, cp.picture, cp.avatar_url, cp.profile_picture_url, bp.logo, bp.photo) || "", // v430
    raw: u,
  };
}

const READY_STATES = ["READY_FOR_RELEASE", "PAYOUT_PENDING_ADMIN", "PROCESSING"];
/** A creator payout the admin can send now — same idea as the server's payout-request count. */
export function isPayoutReady(t) {
  if (!t || t.is_brief_deposit) return false;
  if (isPaidOut(t) || isRefunded(t)) return false;
  const st = String(t.status || "").toUpperCase();
  if (["FAILED", "CANCELLED", "CANCELED"].includes(st)) return false; // v431 (audit #6): a failed / cancelled payment is never payable
  if (["PENDING", "CREATED"].includes(st) && !t.payout_requested) return false;
  return t.payout_requested === true || READY_STATES.includes(String(t.payout_status || "").toUpperCase()) || t.is_brand_approved === true;
}
export function normPayout(t) {
  const gross = Number(t.gross_amount || t.amount || 0);
  const fee = Number(t.platform_fee_amount || 0), gst = Number(t.gst_amount || 0);
  // v431 (audit #1): what is still owed after a PART refund — the server's payable_net first, else the same rule
  // as desktop (payableAfterRefund). It showed creator_net_amount (₹9,000 instead of ₹7,000).
  const baseNet = Number(t.creator_net_amount) || Math.max(0, gross - fee - gst);
  const net = t.payable_net !== undefined && t.payable_net !== null && t.payable_net !== "" ? Math.max(0, Number(t.payable_net) || 0) : payableAfterRefund(t, baseNet);
  const bank = t.bank_account_no ? [t.bank_name || "Bank", "••••" + String(t.bank_account_no).slice(-4), t.bank_ifsc].filter(Boolean).join(" · ") : "";
  return {
    id: String(t.id), list: "payouts",
    name: t.creator_name || "Creator",
    photo: pick(t.creator_photo, t.creator_avatar, t.creator_picture) || "", // v431
    context: [t.brand_name, t.campaign_title || t.deliverable_type].filter(Boolean).join(" · ") || "Deal payout",
    amount: net,
    method: t.upi_id ? "UPI" : bank ? "Bank" : "",
    dest: t.upi_id || bank || "",
    copyText: t.upi_id || [t.bank_holder_name, t.bank_account_no, t.bank_ifsc].filter(Boolean).join(" · "),
    at: t.last_payout_requested_at || t.updated_at || t.created_at,
    raw: t,
  };
}
export function normRefund(r) {
  const a = r.refund_account_snapshot || r.account_snapshot || {};
  // v431 (audit #2): the snapshot uses bank_account_number / bank_ifsc / bank_holder_name
  const accNo = pick(a.bank_account_number, a.account_number, a.bank_account_no), ifsc = pick(a.bank_ifsc, a.ifsc), holder = pick(a.bank_holder_name, a.account_holder_name, a.holder_name);
  const bank = accNo ? [a.bank_name || "Bank", "••••" + String(accNo).slice(-4), ifsc].filter(Boolean).join(" · ") : "";
  return {
    id: String(r.id), list: "refunds",
    name: r.brand_name || r.brand_email || "Brand",
    context: [r.brief_title ? `UGC · ${r.brief_title}` : "UGC refund", r.reason].filter(Boolean).join(" · "),
    amount: Number(r.amount || 0),
    method: a.upi_id ? "UPI" : bank ? "Bank" : "",
    dest: a.upi_id || bank || "",
    copyText: a.upi_id || [holder, accNo, ifsc].filter(Boolean).join(" · "),
    at: r.requested_at || r.created_at,
    raw: r,
  };
}
export function normReferral(w) {
  return {
    id: String(w.id), list: "referral",
    name: w.name || w.email || "User",
    context: `Referral reward${w.role ? " · " + w.role : ""}`,
    amount: Number(w.amount || 0),
    method: w.upi_id ? "UPI" : "",
    dest: w.upi_id || "",
    copyText: w.upi_id || "",
    at: w.requested_at || w.created_at,
    raw: w,
  };
}

// ---------- fetchers (one per cache key) ----------
const arr = (d, ...keys) => { if (Array.isArray(d)) return d; for (const k of keys) if (Array.isArray(d?.[k])) return d[k]; return []; };
export const FETCHERS = {
  counts: async () => (await api.get("admin/pending-counts")).data || {}, // v431 (audit #32): server's short cache is fine
  stats: async () => (await api.get("admin/stats")).data || {},
  kyc: async () => arr((await api.get("admin/verifications")).data, "verifications", "data").map(normKyc),
  users: async () => arr((await api.get("/admin/users")).data, "users").map(normUser),
  escrow: async () => arr((await api.get("admin/escrow/overview")).data, "transactions"),
  refunds: async () => arr((await api.get("/admin/ugc-refunds")).data, "refunds"),
  referral: async () => arr((await api.get("admin/referral-withdrawals")).data, "withdrawals"),
  waitlist: async () => arr((await api.get("admin/waitlist")).data, "waitlist", "entries"),
  campaigns: async () => arr((await api.get("admin/campaigns")).data, "campaigns"),
  tickets: async () => arr((await api.get("/admin/support/tickets")).data, "tickets"),
  reports: async () => arr((await api.get("admin/reports")).data, "reports"),
  ugcOrders: async () => arr((await api.get("admin/ugc/orders")).data, "orders"),
  notifications: async () => arr((await api.get("notifications")).data, "notifications"),
};

// ---------- derived queues ----------
export const isWaitPending = (w) => { const s = String(w?.status || "").toLowerCase(); return !s || s === "pending"; };
export const isCampaignInReview = (c) => [c?.stage, c?.status].some((s) => ["under_review", "under review", "pending"].includes(String(s || "").toLowerCase())) && String(c?.status || "").toLowerCase() !== "live";
export const isTicketOpen = (t) => ["OPEN", "IN PROGRESS", "PENDING"].includes(String(t?.status || "").toUpperCase()) && t?.page_context !== "/feedback-bot";
export const isReportOpen = (r) => ["open", "pending"].includes(String(r?.status || "").toLowerCase());
const UGC_LIVE = ["CLAIMED", "ACCEPTED", "IN_PROGRESS", "ACTIVE", "REVISION_REQ", "REVISION_REQUESTED", "SUBMITTED", "PENDING"];
export const isUgcLive = (o) => UGC_LIVE.includes(String(o?.status || "").toUpperCase());

export function payQueues({ escrow, refunds, referral }) {
  return {
    payouts: (escrow || []).filter(isPayoutReady).map(normPayout).sort((a, b) => toTime(a.at) - toTime(b.at)),
    refunds: (refunds || []).filter((r) => String(r.status || "").toUpperCase() === "PENDING").map(normRefund),
    referral: (referral || []).filter((w) => String(w.status || "") === "requested").map(normReferral),
  };
}
export const oldest = (list, f) => oldestOf(list || [], f);

/** Track a write: refresh the affected caches + counts. */
export function afterWrite(...keys) { invalidate("counts", ...keys); [...keys, "counts"].forEach((k) => FETCHERS[k] && loadKey(k, FETCHERS[k], { fresh: true }).catch(() => {})); }
