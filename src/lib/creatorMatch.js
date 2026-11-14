// Session 31 (Ravi): real match % on the desktop creator profile, replacing the random score.
// Built only from the viewing brand's own data (profile + its campaigns) and the creator's profile.
//   Category 40% · Platform 20% · Budget 25% · Location 15%
// A part with no data on either side is left out and the remaining weights are re-normalised.
// No usable part at all → null (the screen shows no %). Nothing here is invented.

export const MATCH_WEIGHTS = { category: 40, platform: 20, budget: 25, location: 15 };

const norm = (s) => String(s ?? "").trim().toLowerCase();

const toList = (v) => {
  if (v == null || v === "") return [];
  if (Array.isArray(v)) return v.flatMap(toList);
  if (typeof v === "string") {
    const t = v.trim();
    if (t.startsWith("[")) {
      try { return toList(JSON.parse(t)); } catch { /* plain text */ }
    }
    return t.split(/[,|/]/).map((x) => x.trim()).filter(Boolean);
  }
  if (typeof v === "object") return toList(v.name || v.label || v.value || "");
  return [String(v)];
};

const uniq = (arr) => [...new Set(arr.map(norm).filter(Boolean))];

// "Beauty & Skincare" vs "skincare" → related. Words of 4+ letters, so "and"/"&" never match.
const words = (s) => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
const related = (a, b) => {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const wy = new Set(words(y));
  return words(x).some((w) => wy.has(w));
};

const PLATFORM_ALIASES = [
  ["instagram", /insta|^ig$|reel|story|stories/],
  ["youtube", /youtube|^yt$|shorts/],
  ["facebook", /facebook|^fb$/],
  ["linkedin", /linkedin/],
  ["twitter", /twitter|^x$/],
  ["snapchat", /snapchat/],
  ["moj", /^moj$/],
  ["josh", /^josh$/],
  ["sharechat", /sharechat/],
];
const platformKey = (p) => {
  const t = norm(p);
  if (!t) return null;
  const hit = PLATFORM_ALIASES.find(([, re]) => re.test(t));
  return hit ? hit[0] : t;
};

const positive = (n) => {
  const v = Number(String(n ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(v) && v > 0 ? v : null;
};

/** The creator's lowest real price (rate card fields only; 0 / empty = not set). */
export function creatorLowestRate(c = {}) {
  const rc = c.rate_card && typeof c.rate_card === "object" ? c.rate_card : {};
  const vals = [
    c.rate_reel, c.reel_rate, c.rate_story, c.story_rate, c.rate_post, c.post_rate,
    c.rate_yt_video, c.youtube_video_rate, c.rate_yt_short, c.youtube_short_rate, c.min_rate, c.starting_rate,
    ...Object.values(rc),
  ].map(positive).filter((v) => v != null);
  return vals.length ? Math.min(...vals) : null;
}

/** Brand's highest budget per creator, from its campaigns, else its profile budget range text. */
export function brandBudgetMax(brand = {}, campaigns = []) {
  const fromCampaigns = campaigns.map((x) => positive(x.budget_max) ?? positive(x.budget_min)).filter((v) => v != null);
  if (fromCampaigns.length) return Math.max(...fromCampaigns);
  const text = String(brand.budget_range || "");
  const nums = [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k|l|lakh|lac)?/gi)].map((m) => {
    const n = Number(m[1].replace(/,/g, ""));
    const unit = norm(m[2]);
    return unit === "k" ? n * 1000 : unit ? n * 100000 : n;
  }).filter((n) => n > 0);
  return nums.length ? Math.max(...nums) : null;
}

const creatorPlatforms = (c = {}) => {
  const out = toList(c.platforms).map(platformKey);
  if (c.instagram || c.instagram_handle || c.ig_handle) out.push("instagram");
  if (c.youtube || c.youtube_handle || c.yt_handle || c.youtube_channel) out.push("youtube");
  return [...new Set(out.filter(Boolean))];
};

const pct = (n) => Math.round(n * 100);

/**
 * @param {{creator: object, brand?: object, campaigns?: object[]}} input
 * @returns {null | {score: number, reason: string, parts: Array<{key:string, weight:number, value:number, label:string}>}}
 */
export function computeCreatorMatch({ creator, brand = {}, campaigns = [] } = {}) {
  if (!creator) return null;
  const c = creator;
  const camps = (Array.isArray(campaigns) ? campaigns : []).filter(Boolean);
  const parts = [];

  // Category — brand's industry, preferred niches and its campaigns' categories.
  const brandCats = uniq([
    ...toList(brand.industry), ...toList(brand.preferred_niches), ...toList(brand.target_categories),
    ...camps.flatMap((x) => toList(x.categories)),
  ]);
  const mainCat = norm(c.category);
  const subCats = uniq([...toList(c.sub_categories), ...toList(c.categories), ...toList(c.niches)]);
  if (brandCats.length && (mainCat || subCats.length)) {
    let value = 0, label = "Different category";
    if (mainCat && brandCats.some((b) => related(mainCat, b))) { value = 1; label = "Same category"; }
    else if (subCats.some((s) => brandCats.some((b) => related(s, b)))) { value = 0.6; label = "Related category"; }
    parts.push({ key: "category", weight: MATCH_WEIGHTS.category, value, label });
  }

  // Platform — share of the brand's campaign platforms this creator is on.
  const wanted = [...new Set(camps.flatMap((x) => toList(x.platforms)).map(platformKey).filter(Boolean))];
  const has = creatorPlatforms(c);
  if (wanted.length && has.length) {
    const covered = wanted.filter((p) => has.includes(p)).length;
    const value = covered / wanted.length;
    const label = value === 1 ? "On your platforms" : value > 0 ? "On some of your platforms" : "Not on your platforms";
    parts.push({ key: "platform", weight: MATCH_WEIGHTS.platform, value, label });
  }

  // Budget — creator's lowest rate against the brand's highest budget.
  const rate = creatorLowestRate(c);
  const budget = brandBudgetMax(brand, camps);
  if (rate != null && budget != null) {
    let value = 0, label = "Rate above your budget";
    if (rate <= budget) { value = 1; label = "Rate fits your budget"; }
    else if (rate <= budget * 1.5) { value = 0.5; label = "Rate a little above your budget"; }
    parts.push({ key: "budget", weight: MATCH_WEIGHTS.budget, value, label });
  }

  // Location — same city, else same state.
  const bCity = norm(brand.city), bState = norm(brand.state);
  const cCity = norm(c.city), cState = norm(c.state);
  if ((bCity || bState) && (cCity || cState)) {
    let value = 0, label = "Different location";
    if (bCity && cCity && bCity === cCity) { value = 1; label = "Same city"; }
    else if (bState && cState && bState === cState) { value = 0.6; label = "Same state"; }
    parts.push({ key: "location", weight: MATCH_WEIGHTS.location, value, label });
  }

  if (!parts.length) return null;
  const total = parts.reduce((s, p) => s + p.weight, 0);
  const score = pct(parts.reduce((s, p) => s + p.weight * p.value, 0) / total);
  // Reason line: strongest parts first, at most two, sentence case.
  const sorted = [...parts].sort((a, b) => b.value * b.weight - a.value * a.weight);
  const picks = sorted.slice(0, 2).map((p) => p.label);
  const reason = picks.map((t, i) => (i === 0 ? t : t.charAt(0).toLowerCase() + t.slice(1))).join(" · ");
  return { score, reason, parts };
}
