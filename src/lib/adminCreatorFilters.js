// v396 (Ravi): Admin → Users → Creators / Unclaimed get the same filters as Explore Creators
// (followers range, city, state, niche, platform, language, gender, rate per reel, paid/barter, sort)
// plus a few admin-only ones (profile status, KYC, Instagram fetched). Pure functions — tested in
// src/v396AdminCreatorFilters.test.js. The lists match src/pages/dashboard/Explore.jsx.
import { ALL_INDIAN_STATES_AND_UTS, COMPREHENSIVE_INDIAN_CITIES } from "./locations";
import { approvedByAdmin, isHiddenFromExplore } from "./visibleCreators";

export const NICHE_GROUPS = [
  { group: "Fashion & Beauty", items: ["Fashion", "Beauty & Makeup", "Skincare", "Jewellery & Accessories"] },
  { group: "Health & Lifestyle", items: ["Fitness & Gym", "Yoga & Wellness", "Health & Nutrition", "Mental Health"] },
  { group: "Food & Travel", items: ["Food & Cooking", "Travel & Vlogging", "Street Food", "Hotel & Hospitality"] },
  { group: "Tech & Gaming", items: ["Tech & Gadgets", "Mobile Reviews", "Gaming", "AI & Software"] },
  { group: "Finance & Education", items: ["Personal Finance", "Stock Market", "Education & Coaching", "Career & Jobs"] },
  { group: "Entertainment", items: ["Comedy & Memes", "Music & Dance", "Movies & Web Series", "Podcasts"] },
  { group: "Parenting & Home", items: ["Parenting", "Interior Design", "DIY & Craft", "Pets"] },
  { group: "Sports & Automotive", items: ["Sports & Cricket", "Cycling & Running", "Automotive"] },
];
export const CITY_OPTIONS = Array.from(new Set([
  "Mumbai", "Delhi", "Bangalore", "Bengaluru", "Hyderabad", "Chennai", "Kolkata", "Pune", "Ahmedabad", "Jaipur",
  "Lucknow", "Surat", "Kochi", "Chandigarh", "Indore", "Bhopal", "Noida", "Gurgaon", "Gurugram", "Nagpur", "Patna",
  ...(COMPREHENSIVE_INDIAN_CITIES || []).map((c) => c.city),
].filter(Boolean)));
export const STATE_OPTIONS = [...(ALL_INDIAN_STATES_AND_UTS || [])];
export const LANGUAGES = ["English", "Hindi", "Punjabi", "Gujarati", "Marathi", "Tamil", "Telugu", "Bengali", "Kannada"];
export const PLATFORMS = ["Instagram", "YouTube", "TikTok", "Facebook"];
export const GENDERS = ["Any", "Male", "Female", "Other"];
export const FOLLOWER_TIERS = [
  { key: "under_1k", label: "Under 1K", min: 0, max: 1000 },
  { key: "nano", label: "Nano 1K–10K", min: 1000, max: 10000 },
  { key: "micro", label: "Micro 10K–1L", min: 10000, max: 100000 },
  { key: "macro", label: "Macro 1L–10L", min: 100000, max: 1000000 },
  { key: "mega", label: "Mega 10L+", min: 1000000, max: Infinity },
];
export const RATE_TIERS = [
  { key: "under_5k", label: "Under ₹5K", min: 0, max: 5000 },
  { key: "5k_15k", label: "₹5K – ₹15K", min: 5000, max: 15000 },
  { key: "15k_30k", label: "₹15K – ₹30K", min: 15000, max: 30000 },
  { key: "above_30k", label: "₹30K+", min: 30000, max: Infinity },
];
// v396 (Ravi: one status, same words everywhere): decided in Admin → Waitlist (Approve / Reject)
export const PROFILE_STATUSES = [
  { key: "live", label: "Live on Explore" }, { key: "waiting", label: "Waiting for approval" }, { key: "not_approved", label: "Not approved" }, { key: "hidden", label: "Hidden from Explore" },
];
export const STATUS_STYLE = {
  live: { label: "Live on Explore", dot: "#10B981", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", hint: "Shows on Explore and has a public profile." },
  waiting: { label: "Waiting", dot: "#F59E0B", cls: "bg-amber-50 text-amber-800 border-amber-200", hint: "Can use the app. Not on Explore until you approve in Waitlist." },
  not_approved: { label: "Not approved", dot: "#EF4444", cls: "bg-red-50 text-red-700 border-red-200", hint: "Can still use the app, never on Explore. Approve later from Waitlist → Rejected Bin." },
  hidden: { label: "Hidden", dot: "#6B7280", cls: "bg-gray-100 text-gray-700 border-gray-200", hint: "Approved but hidden from Explore by an admin." },
};
export const KYC_STATUSES = [
  { key: "APPROVED", label: "KYC approved" }, { key: "PENDING", label: "KYC pending" }, { key: "NOT_SUBMITTED", label: "No KYC" }, { key: "REJECTED", label: "KYC rejected" },
];
export const IG_STATES = [
  { key: "fetched", label: "Instagram fetched" }, { key: "not_fetched", label: "Not fetched yet" }, { key: "failed", label: "Private / fetch failed" }, { key: "no_handle", label: "No Instagram handle" },
];
export const SORTS = [
  { key: "default", label: "Newest joined" }, { key: "followers", label: "Most followers" }, { key: "followers_asc", label: "Fewest followers" },
  { key: "engagement", label: "Best engagement" }, { key: "reach", label: "Best reach" }, { key: "rate_asc", label: "Lowest rate" },
];

export const EMPTY_CREATOR_FILTERS = Object.freeze({
  niches: [], cities: [], states: [], platforms: [], languages: [], gender: "Any",
  followerRanges: [], minFollowers: "", maxFollowers: "", rateRanges: [], collabMode: "Both",
  profileStatus: [], kyc: [], ig: [], sortBy: "default",
});

export function parseCount(raw) {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const t = String(raw).trim().toLowerCase().replace(/,/g, "");
  if (!t) return 0;
  const m = t.match(/^([\d.]+)\s*(k|l|lakh|m|cr)?\+?$/);
  if (m) {
    const n = parseFloat(m[1]);
    const mult = { k: 1e3, l: 1e5, lakh: 1e5, m: 1e6, cr: 1e7 }[m[2]] || 1;
    return Math.round(n * mult);
  }
  return parseInt(t.replace(/[^0-9]/g, ""), 10) || 0;
}

const cpOf = (u) => u?.creator_profile || {};
const low = (v) => String(v ?? "").toLowerCase();
export const followersOf = (u) => { const cp = cpOf(u); return parseCount(cp.followers_instagram || cp.followers || cp.follower_count || cp.followers_count || u?.followers || cp.followers_youtube || 0); };
const nicheText = (u) => { const cp = cpOf(u); const cn = Array.isArray(cp.content_niches) ? cp.content_niches.join(" ") : cp.content_niches; return low([cp.primary_niche, cp.category, cn, u?.category].filter(Boolean).join(" ")); };
const cityOf = (u) => low(cpOf(u).city || u?.city || u?.location || "");
const stateOf = (u) => low(cpOf(u).state || u?.state || "");
const rateOf = (u) => { const cp = cpOf(u); const rc = cp.rate_card || {}; return Number(cp.rate_reel || cp.reel_rate || rc.reels || rc.reel || cp.base_rate || cp.rate || 0) || 0; };
const reachOf = (u) => { const cp = cpOf(u); return parseCount(cp.instagram_avg_reach || cp.avg_reach_per_reel || cp.avg_reach || 0); };
const engagementOf = (u) => parseFloat(cpOf(u).engagement_rate || 0) || 0;
export function kycOf(u) {
  const s = String(u?.kyc_status || (u?.kyc_verified ? "APPROVED" : "NOT_SUBMITTED")).toUpperCase();
  if (["APPROVED", "VERIFIED"].includes(s)) return "APPROVED";
  if (["REJECTED", "FAILED"].includes(s)) return "REJECTED";
  if (["PENDING", "SUBMITTED", "UNDER_REVIEW", "IN_REVIEW"].includes(s)) return "PENDING";
  return "NOT_SUBMITTED";
}
/** v396: the ONE creator status (same rule as Explore — backend/exploreGate.ts): live / waiting / not_approved / hidden. */
export function profileStatusOf(u) {
  const cp = cpOf(u);
  const row = { ...cp, profile_status: cp.profile_status ?? u?.profile_status, created_at: cp.created_at || u?.created_at, is_claimed: cp.is_claimed ?? u?.is_claimed, creator_type: cp.creator_type };
  const s = low(row.profile_status);
  if (s === "rejected") return "not_approved";
  if (approvedByAdmin(row)) return isHiddenFromExplore(row) ? "hidden" : "live";
  return "waiting";
}
export function igStateOf(u) {
  const cp = cpOf(u);
  const handle = String(cp.instagram_handle || cp.handle || "").replace(/^@+/, "").trim();
  if (!handle) return "no_handle";
  if (cp.instagram_stats && typeof cp.instagram_stats === "object" && cp.instagram_stats.error) return "failed";
  const fetched = cp.instagram_stats || cp.ig_fetched_at || cp.instagram_fetched_at || cp.instagram_synced_at || cp.instagram_last_synced || cp.ig_last_fetched_at;
  return fetched ? "fetched" : "not_fetched";
}

/** How many filter groups are on (for the badge on the Filters button). */
export function countCreatorFilters(f = EMPTY_CREATOR_FILTERS) {
  let n = 0;
  for (const k of ["niches", "cities", "states", "platforms", "languages", "followerRanges", "rateRanges", "profileStatus", "kyc", "ig"]) if ((f[k] || []).length) n += 1;
  if (f.gender && f.gender !== "Any") n += 1;
  if (f.collabMode && f.collabMode !== "Both") n += 1;
  if (String(f.minFollowers || "").trim() || String(f.maxFollowers || "").trim()) n += 1;
  if (f.sortBy && f.sortBy !== "default") n += 1;
  return n;
}

/** Filters + sorts the admin users list (creator rows). Rows keep their original order for "default". */
export function applyCreatorFilters(list, f = EMPTY_CREATOR_FILTERS) {
  let out = Array.isArray(list) ? list.slice() : [];
  if (f.niches?.length) out = out.filter((u) => { const t = nicheText(u); return f.niches.some((n) => t.includes(low(n)) || low(n).split(/\s*&\s*/).some((part) => part.length > 3 && t.includes(part))); });
  if (f.cities?.length) out = out.filter((u) => { const c = cityOf(u); return c && f.cities.some((x) => c.includes(low(x))); });
  if (f.states?.length) out = out.filter((u) => { const s = stateOf(u); return s && f.states.some((x) => s.includes(low(x))); });
  if (f.platforms?.length) out = out.filter((u) => {
    const cp = cpOf(u);
    return f.platforms.some((p) => {
      const k = low(p);
      if (k === "instagram") return Boolean(cp.instagram_handle || cp.instagram || cp.followers_instagram);
      if (k === "youtube") return Boolean(cp.youtube_channel || cp.youtube || cp.followers_youtube);
      return Boolean(cp[k] || low(cp.platform).includes(k) || low(cp.platforms).includes(k));
    });
  });
  if (f.languages?.length) out = out.filter((u) => {
    const cp = cpOf(u);
    const langs = (Array.isArray(cp.languages) ? cp.languages : String(cp.languages || "").split(/[,·/]/)).map(low).map((s) => s.trim());
    const one = low(cp.language);
    return f.languages.some((l) => langs.includes(low(l)) || one.includes(low(l)));
  });
  if (f.gender && f.gender !== "Any") out = out.filter((u) => low(cpOf(u).gender) === low(f.gender));
  if (f.followerRanges?.length) out = out.filter((u) => {
    const n = followersOf(u);
    return f.followerRanges.some((key) => { const t = FOLLOWER_TIERS.find((x) => x.key === key); return t && n >= t.min && n < t.max; });
  });
  const min = parseCount(f.minFollowers), max = parseCount(f.maxFollowers);
  if (String(f.minFollowers || "").trim()) out = out.filter((u) => followersOf(u) >= min);
  if (String(f.maxFollowers || "").trim() && max > 0) out = out.filter((u) => followersOf(u) <= max);
  if (f.rateRanges?.length) out = out.filter((u) => {
    const r = rateOf(u);
    if (!r) return false;
    return f.rateRanges.some((key) => { const t = RATE_TIERS.find((x) => x.key === key); return t && r >= t.min && (t.max === Infinity || r <= t.max); });
  });
  if (f.collabMode && f.collabMode !== "Both") out = out.filter((u) => {
    const cp = cpOf(u); const pref = low(cp.collab_preference);
    const barterOnly = cp.barter === true || pref.includes("barter");
    return f.collabMode === "Barter" ? barterOnly : (!barterOnly || pref.includes("paid"));
  });
  if (f.profileStatus?.length) out = out.filter((u) => f.profileStatus.includes(profileStatusOf(u)));
  if (f.kyc?.length) out = out.filter((u) => f.kyc.includes(kycOf(u)));
  if (f.ig?.length) out = out.filter((u) => f.ig.includes(igStateOf(u)));
  const by = f.sortBy || "default";
  if (by === "followers") out.sort((a, b) => followersOf(b) - followersOf(a));
  else if (by === "followers_asc") out.sort((a, b) => followersOf(a) - followersOf(b));
  else if (by === "engagement") out.sort((a, b) => engagementOf(b) - engagementOf(a));
  else if (by === "reach") out.sort((a, b) => reachOf(b) - reachOf(a));
  else if (by === "rate_asc") out.sort((a, b) => (rateOf(a) || Infinity) - (rateOf(b) || Infinity));
  return out;
}
