// Session 51 (Ravi): "Ybex Assist" for BRANDS — the pure brain. No React, no server call, no storage here:
// it reads a sentence and works out what the brand wants, then ranks / compares / plans with plain maths.
// Everything here also works when the AI is off (no key, free quota used up, network down).
// The data it works on comes from tools.js (the same lists the app already shows the brand).
import { parseAmount, inr } from "../../feedback/assistKnowledge";
import { CITIES } from "../../../lib/indiaCities";
import { istDateString } from "../../../utils/istDate";

const lower = (t) => String(t || "").toLowerCase();
const clean = (t) => lower(t).replace(/[₹,]/g, (m) => (m === "₹" ? " ₹" : "")).replace(/\s+/g, " ").trim();

// ── numbers: 10k · 1.5 lakh · 2m · 50,000 ───────────────────────────────────────────────────────────
const UNIT = { k: 1e3, thousand: 1e3, hazar: 1e3, hazaar: 1e3, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, m: 1e6, mn: 1e6, million: 1e6, cr: 1e7, crore: 1e7, crores: 1e7 };
export function numOf(s) {
  // v328: a unit only counts as a whole word right after the number (one optional space) — "under 8000 male",
  // "10000 max", "3000 lucknow" used to read the next word's first letter as m / l (₹8,000,000,000).
  const m = String(s || "").toLowerCase().replace(/,/g, "").match(/(\d+(?:\.\d+)?)(?:\s?(k|thousand|hazaa?r|lakhs?|lac|l|mn|m|million|crores?|cr)(?![a-z]))?/);
  if (!m) return null;
  return Math.round(Number(m[1]) * (m[2] ? UNIT[m[2]] || 1 : 1));
}
// v329: brand cards in Indian style like the creator side — 1.5 lakh → "1.5L", 1.2 crore → "1.2Cr" (was "1.2M");
// 99,999 → "1L" (was "100K").
export const shortNum = (n) => {
  const v = Number(n) || 0;
  const one = (x) => x.toFixed(x >= 10 ? 0 : 1).replace(/\.0$/, "");
  if (v >= 1e7 || Math.round(v / 1e5 * 10) / 10 >= 100) return `${one(v / 1e7)}Cr`;
  if (v >= 1e5 || Math.round(v / 1e3) >= 100) return `${one(v / 1e5)}L`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}K`;
  return String(Math.round(v));
};
// v329: "10-50k" / "1-1.5 lakh" — the unit written once after a range belongs to both numbers (was 10 … 50,000).
const UNIT_RX = /(k|thousand|hazaa?r|lakhs?|lac|l|mn|m|million|crores?|cr)\s*$/;
export function rangeNums(a, b) {
  let x = numOf(a), y = numOf(b);
  const ua = String(a || "").toLowerCase().trim().match(UNIT_RX), ub = String(b || "").toLowerCase().trim().match(UNIT_RX);
  if (x && y && !ua && ub) { const k = UNIT[ub[1]] || 1; if (x * k <= y && x < y) x = Math.round(Number(String(a).replace(/[^\d.]/g, "")) * k); }
  return [x, y];
}

// ── creator fields (same readers as Explore) ─────────────────────────────────────────────────────────
export const parseCount = (raw) => {
  if (typeof raw === "number") return raw;
  const s = String(raw || "").trim().toLowerCase().replace(/,/g, "");
  const m = s.match(/^([\d.]+)\s*([km])?/);
  if (!m) return 0;
  return Math.round(Number(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : 1)) || 0;
};
export const cid = (c) => c?.user_id || c?.id;
export const nameOf = (c) => String(c?.full_name || c?.name || "").trim() || "Creator";
export const followersOf = (c) => parseCount(c?.followers_count || c?.follower_count || c?.followers_instagram || c?.ig_followers || c?.followers_youtube || 0);
export const rateOf = (c) => Number(c?.rate_reel || c?.reel_rate || c?.rate_card?.reels || c?.rate_card?.reel || c?.base_rate || c?.rate || 0) || 0;
export const reachOf = (c) => parseCount(c?.avg_reach_per_reel || c?.avg_reach || c?.avg_views_30d || c?.instagram_stats?.avg_views || c?.instagram_stats?.avg_reach || c?.youtube_avg_views || 0);
// v419: every creator detail a brand can ask Eva about.
export const erOf = (c) => Number(c?.engagement_rate || c?.instagram_stats?.engagement_rate || 0) || 0;
export const ytOf = (c) => parseCount(c?.followers_youtube || c?.yt_subscribers || 0);
const BARTER_OK = /^(barter_ok|barter_friendly|partial_barter|products only|product|yes|true|hybrid.*)$/i;
export const barterOk = (c) => BARTER_OK.test(String(c?.barter_mode || c?.barter || "").trim());
export const isVerifiedCreator = (c) => Boolean(c?.instagram_verified_at || c?.verified === true);
export const ageBandOf = (c) => String(c?.age_band || "");
const STATES = ["andhra pradesh","arunachal pradesh","assam","bihar","chhattisgarh","goa","gujarat","haryana","himachal pradesh","jharkhand","karnataka","kerala","madhya pradesh","maharashtra","manipur","meghalaya","mizoram","nagaland","odisha","punjab","rajasthan","sikkim","tamil nadu","telangana","tripura","uttar pradesh","uttarakhand","west bengal","jammu and kashmir","delhi ncr","chandigarh"];
const STATE_ALIAS = { "up": "uttar pradesh", "mp": "madhya pradesh", "bengal": "west bengal", "orissa": "odisha", "tn": "tamil nadu", "j&k": "jammu and kashmir", "kashmir": "jammu and kashmir", "uk": "uttarakhand" };
export function stateIn(text) {
  const t = ` ${lower(text).replace(/[^a-z&\s]/g, " ").replace(/\s+/g, " ")} `;
  const hit = [...STATES].sort((a, b) => b.length - a.length).find((n) => t.includes(` ${n} `));
  if (hit) return hit;
  const a = Object.keys(STATE_ALIAS).find((k) => t.includes(` ${k} `) && !(k === "uk" && /\buk\b.*\b(london|abroad)\b/.test(t)));
  return a && a !== "up" && a !== "uk" ? STATE_ALIAS[a] : (a && new RegExp(`\\b${a}\\b\\s*(ke|se|wale|state|creators?|influencers?)`).test(t) ? STATE_ALIAS[a] : "");
}
export const nicheOf = (c) => String(c?.category || (Array.isArray(c?.content_niches) ? c.content_niches[0] : String(c?.content_niches || "").split(",")[0]) || "").trim();
const nicheText = (c) => lower(`${c?.category || ""} ${Array.isArray(c?.content_niches) ? c.content_niches.join(" ") : c?.content_niches || ""}`);
const langsOf = (c) => (Array.isArray(c?.languages) ? c.languages : String(c?.languages || c?.language || "").split(",")).map((x) => lower(x).trim()).filter(Boolean);

// Same niche groups as Explore's chips (ExploreMobile CATEGORY_CHIPS) + a few product words.
export const NICHES = [
  { label: "Fashion", keys: ["fashion", "beauty", "makeup", "skincare", "skin care", "jewellery", "jewelry", "style", "cosmetic", "serum", "lipstick", "clothing", "saree", "kurti", "salon", "hair"] },
  { label: "Health", keys: ["health", "wellness", "yoga", "nutrition", "mental", "ayurveda", "supplement", "protein"] },
  { label: "Food", keys: ["food", "cooking", "recipe", "restaurant", "cafe", "snack", "chai", "coffee", "masala", "khana"] },
  { label: "Tech", keys: ["tech", "gadget", "gaming", "software", "ai", "phone", "mobile", "laptop", "earbuds", "app"] },
  { label: "Fitness", keys: ["fitness", "gym", "sports", "workout", "running", "cricket"] },
  { label: "Travel", keys: ["travel", "hotel", "trip", "tourism", "ghoomna"] },
  { label: "Lifestyle", keys: ["lifestyle", "vlog", "family", "parenting", "home", "decor", "kids", "baby", "pet"] },
  { label: "Finance", keys: ["finance", "money", "business", "education", "stock", "trading", "insurance", "loan", "course"] },
];
const NICHE_KEYS = (label) => NICHES.find((n) => n.label === label)?.keys || [lower(label)];
export function nichesIn(text) {
  const t = ` ${lower(text).replace(/[^a-z\s]/g, " ")} `;
  return NICHES.filter((n) => n.keys.some((k) => t.includes(` ${k} `) || t.includes(` ${k}s `))).map((n) => n.label);
}

export function cityIn(text) {
  const t = ` ${lower(text).replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ")} `;
  const names = Object.keys(CITIES).sort((a, b) => b.length - a.length);
  const hit = names.find((n) => t.includes(` ${n} `));
  return hit ? hit.replace(/\b\w/g, (m) => m.toUpperCase()) : "";
}

// v328: same whole-word unit rule as numOf (was `\s*(?:k|m|…|l)?` — "8000 male" grabbed the "m").
export const NUM = String.raw`\d+(?:\.\d+)?(?:\s?(?:k|m|mn|lakh|lakhs|lac|l|cr|crores?)(?![a-z]))?`;
/** "Jaipur ke fashion creators 10k–50k followers, ₹15k tak, reach 30k+, top 5" → filters */
export function parseCreatorQuery(text) {
  const t = clean(text);
  const f = { city: cityIn(t), state: "", niches: nichesIn(t), followersMin: 0, followersMax: 0, maxRate: 0, minReach: 0, count: 0, sort: "", gender: "", language: "", split: null, minEr: 0, ageMin: 0, ageMax: 0, barter: false, platform: "", verified: false };
  // followers: "10k-50k followers", "10k se 50k", "50k+ followers", "under 50k followers", nano / micro / macro / mega
  let explicitFollowers = false;
  let m = t.match(new RegExp(`(${NUM})\\s*(?:-|–|to|se)\\s*(${NUM})\\s*(?:followers?|subs|subscribers)?`));
  if (m && !/(₹|\brs\.?|\brupees?|\bbudget|\brate|\btak)\s*$/.test(t.slice(0, m.index)) && !/^\s*(rupees?\b|rs\b)/.test(t.slice(m.index + m[0].length))) {
    const [a, b] = rangeNums(m[1], m[2]); // v329: "10-50k followers" = 10k–50k
    if (a && b && b > a && b >= 1000) { f.followersMin = a; f.followersMax = b; explicitFollowers = true; }
  }
  if (!f.followersMax) {
    m = t.match(new RegExp(`(${NUM})\\s*\\+?\\s*(se (?:zyada|jyada|upar|uppar|kam|neeche|niche)|or more|or less|plus)?\\s*(?:followers?|subs|subscribers)`));
    if (m) {
      const n = numOf(m[1]);
      const before = t.slice(Math.max(0, m.index - 14), m.index);
      const after = t.slice(m.index + m[0].length);
      // v419: "1 lakh se zyada / above / more than … followers" is a minimum (it is the default too, but "se kam" after wins).
      if (/(se kam|se neeche|se niche|or less)/.test(m[2] || "") || /(under|below|tak|max|less than|se kam|kam)/.test(before) || /^\s*(tak|se kam|or less|max|se neeche|se niche)/.test(after)) f.followersMax = n;
      else f.followersMin = n;
      explicitFollowers = true;
    }
  }
  if (!f.followersMax && !f.followersMin) {
    m = t.match(new RegExp(`(?:followers?|subs|subscribers)\\s*(?:of|min|minimum|kam se kam|above|over|more than)?\\s*(${NUM})\\s*(\\+|se (?:zyada|jyada|upar|uppar)|above|plus)?`));
    if (m && (m[2] || /(min|kam se kam|above|over|more than)/.test(m[0]))) { f.followersMin = numOf(m[1]); explicitFollowers = true; }
  }
  if (!f.followersMin && !f.followersMax) {
    if (/\bnano\b/.test(t)) { f.followersMin = 1000; f.followersMax = 10000; }
    else if (/\bmicro\b/.test(t)) { f.followersMin = 10000; f.followersMax = 100000; }
    else if (/\bmacro\b/.test(t)) { f.followersMin = 100000; f.followersMax = 1000000; }
    else if (/\b(mega|celebrit(y|ies))\b/.test(t)) { f.followersMin = 1000000; }
  }
  // reach: "reach 30k+", "30k reach", "reach 30k se upar"
  m = t.match(new RegExp(`(?:reach|views)\\s*(?:of|min|minimum|kam se kam)?\\s*(${NUM})`)) || t.match(new RegExp(`(${NUM})\\s*\\+?\\s*(?:avg\\s*)?(?:reach|views)`));
  if (m) f.minReach = numOf(m[1]) || 0;
  // rate: "₹15k tak", "under 15000", "budget 10k", "rate 8k", "15k per reel"
  m = t.match(new RegExp(`(?:₹|\\brs\\.?|\\binr|\\bbudget(?:\\s+of)?|\\brate|\\bprice|\\bfees?|\\bmax)\\s*(${NUM})`)) || t.match(new RegExp(`(${NUM})\\s*(?:rs|rupees?)?\\s*(?:tak|per (?:reel|video|post)|max\\b|se kam)`))
    // Session 58: "creators under 9000" (Eva handoff: "creators under ₹4k") — not when followers / reach follow.
    || ((x) => (x && !/^\s*(?:followers?|subs|subscribers|reach|views)/.test(t.slice(x.index + x[0].length)) ? x : null))(t.match(new RegExp(`\\b(?:under|below|within|up ?to|less than)\\s*(${NUM})`)));
  if (m) {
    const n = numOf(m[1]);
    if (n && n !== f.minReach && !(explicitFollowers && (n === f.followersMax || n === f.followersMin))) f.maxRate = n;
  }
  // how many / order
  m = t.match(/\b(?:top|best|sirf|only|bas)?\s*(\d{1,3})\s*(?:creators?|influencers?|log|logo|profiles?|chahiye|dikhao|do\b)/) || t.match(/\btop\s*(\d{1,2})\b/);
  if (m) f.count = Math.min(100, Number(m[1]));
  if (/(sasta|saste|sasti|cheap|lowest rate|kam rate|budget friendly|affordable)/.test(t)) f.sort = "rate";
  else if (/(most followers|sabse (zyada|jyada) followers|biggest|bade creators|popular)/.test(t)) f.sort = "followers";
  else if (/(\btop\b|\bbest\b|highest reach|sabse (zyada|jyada) reach|most reach|zyada reach)/.test(t)) f.sort = "reach";
  if (/\b(female|women|woman|girls?|ladki|ladkiyan|ladies|she)\b/.test(t)) f.gender = "female";
  else if (/\b(male|men|man|boys?|ladke|ladka|guys|he)\b/.test(t)) f.gender = "male";
  m = t.match(/\b(hindi|english|hinglish|tamil|telugu|marathi|bengali|bangla|gujarati|punjabi|kannada|malayalam|odia|oriya|bhojpuri|assamese|urdu|haryanvi|marwari|rajasthani)\b/);
  if (m) f.language = { bangla: "bengali", oriya: "odia", rajasthani: "marwari" }[m[1]] || m[1];
  // v419: state, gender split, engagement, age, barter, YouTube, verified.
  // v435 (Eva question test #9): "under 5000 rupees" read "und-ER 5000" as engagement 5000% — engagement needs a whole word now.
  if (!f.city) f.state = stateIn(t);
  const gm = t.match(/(\d{1,2})\s*(?:male|men|boys?|ladke|ladka|guys)\b/), gf = t.match(/(\d{1,2})\s*(?:female|women|girls?|ladki|ladkiyan|ladkiya|ladies)\b/);
  if (gm && gf) { f.split = { male: Number(gm[1]), female: Number(gf[1]) }; f.gender = ""; f.count = f.split.male + f.split.female; }
  m = t.match(/\b(?:engagement|er)\s*(?:rate)?\s*(?:of|min|minimum|kam se kam|above|over)?\s*(\d+(?:\.\d+)?)\s*%?/) || t.match(/(\d+(?:\.\d+)?)\s*%\s*\+?\s*(?:se (?:zyada|upar)\s*)?(?:engagement|er)\b/);
  if (m) f.minEr = Number(m[1]);
  m = t.match(/\b(?:age|umar|umra|aged?)\s*(\d{2})\s*(?:-|–|to|se)\s*(\d{2})\b/) || t.match(/\b(\d{2})\s*(?:-|–|to|se)\s*(\d{2})\s*(?:saal|years?|yrs?|age|umar|ki age|ke)\b/);
  if (m && Number(m[1]) >= 13 && Number(m[2]) <= 80 && Number(m[2]) > Number(m[1])) { f.ageMin = Number(m[1]); f.ageMax = Number(m[2]); }
  if (/\b(barter|product ke badle|products? only|free product|gifting|barter wale)\b/.test(t)) f.barter = true;
  if (/\b(youtubers?|youtube)\b/.test(t)) f.platform = "youtube";
  if (/\b(verified|blue tick)\b/.test(t) && !/\bnot verified\b/.test(t)) f.verified = true;
  return f;
}
/** v419: "10 creators 50k mein?", "budget 1 lakh, kitne creators?", "50k me 10 influencers mil jayenge?" →
 *  { count, budget } (count 0 = "how many fit"). null when it is not a total-budget question. */
export function parseBudgetFit(text) {
  const t = clean(text);
  if (!/\b(creators?|influencers?|log|logo)\b/.test(t)) return null;
  const money = t.match(new RegExp(`(?:₹|\\brs\\.?\\s*|\\binr\\s*|\\bbudget(?:\\s+(?:of|hai|is))?\\s*)(${NUM})`)) || t.match(new RegExp(`\\b(${NUM})\\s*(?:rs|rupees?|ka budget|budget|mein|me|main|men|in)\\b`));
  if (!money) return null;
  const budget = numOf(money[1]);
  if (!budget || budget < 500) return null;
  const totalWord = /\b(total|kul|mein|me|main|men|in|budget|kitne|how many|mil (jayenge|jaenge|sakte)|fit|possible|ho (jayega|jaega|sakta))\b/.test(t);
  if (!totalWord || /\bper (creator|reel|video|post)\b|\btak\b/.test(t)) return null;
  const cm = t.match(/\b(\d{1,3})\s*(?:creators?|influencers?|log|logo)\b/);
  const count = cm && Number(cm[1]) !== budget ? Number(cm[1]) : 0;
  if (!count && !/\b(kitne|how many|kitna|kaun kaun)\b/.test(t)) return null;
  return { count, budget };
}

/** v419: how many creators (from the search) fit a total budget — totals only, a single creator's rate is never shown. */
export function budgetFit(list, { count, budget }) {
  const rates = (list || []).map(rateOf).filter((r) => r > 0).sort((a, b) => a - b);
  const n = count || 0;
  let fit = 0, sum = 0;
  for (const r of rates) { if (sum + r > budget) break; sum += r; fit += 1; }
  const per = n ? Math.floor(budget / n) : 0;
  const under = per ? rates.filter((r) => r <= per).length : 0;
  const cheapN = n ? rates.slice(0, n).reduce((a, b) => a + b, 0) : 0;
  const mid = rates.length ? rates[Math.floor(rates.length / 2)] : 0;
  return { priced: rates.length, fit, per, under, enough: n ? rates.length >= n && cheapN <= budget : fit > 0, needFor: n && rates.length >= n ? cheapN : 0, typicalTotal: n ? mid * n : 0 };
}

export const hasCreatorFilters = (f) => Boolean(f.city || f.state || f.niches?.length || f.followersMin || f.followersMax || f.maxRate || f.minReach || f.gender || f.language || f.split || f.minEr || f.ageMin || f.barter || f.platform || f.verified);

/** Narrow an already Explore-filtered list with the extra filters Explore has no chip for, then sort + cut. */
export function refineCreators(list, f) {
  let out = (list || []).filter((c) => {
    const fc = followersOf(c);
    if (f.followersMin && fc < f.followersMin) return false;
    if (f.followersMax && fc > f.followersMax) return false;
    if (f.minReach && reachOf(c) < f.minReach) return false;
    if (f.maxRate) { const r = rateOf(c); if (!r || r > f.maxRate) return false; }
    if (f.niches?.length && !f.niches.some((lab) => NICHE_KEYS(lab).some((k) => nicheText(c).includes(k)))) return false;
    // v419: a creator with no gender / language set does not match that filter (it used to slip in).
    if (f.gender && !(c.gender && lower(c.gender).startsWith(f.gender.charAt(0)))) return false;
    if (f.language && !langsOf(c).some((l) => l.startsWith(f.language.slice(0, 4)))) return false;
    if (f.state && !lower(`${c.state || ""} ${c.city || ""}`).includes(f.state) && !(f.state === "delhi ncr" && /delhi|noida|gurgaon|gurugram|faridabad|ghaziabad/.test(lower(c.city)))) return false;
    if (f.split && !/^(m|f)/.test(lower(c.gender))) return false;
    if (f.minEr && erOf(c) < f.minEr) return false;
    if (f.ageMin) { const [a, b] = ageBandOf(c).split("-").map(Number); if (!a || b < f.ageMin || a > f.ageMax) return false; }
    if (f.barter && !barterOk(c)) return false;
    if (f.platform === "youtube" && !ytOf(c)) return false;
    if (f.verified && !isVerifiedCreator(c)) return false;
    return true;
  });
  const by = { rate: (a, b) => (rateOf(a) || 9e9) - (rateOf(b) || 9e9), reach: (a, b) => reachOf(b) - reachOf(a), followers: (a, b) => followersOf(b) - followersOf(a) };
  // Session 58 (Eva rule: creator rates are private from brands) — never order brands' results by rate.
  if (f.sort && f.sort !== "rate" && by[f.sort]) out = [...out].sort(by[f.sort]);
  // v419: "5 male 5 female" → that many of each (best reach first when no order was asked).
  if (f.split) {
    const ord = f.sort && by[f.sort] && f.sort !== "rate" ? by[f.sort] : by.reach;
    const pick = (g, n) => [...out].filter((c) => lower(c.gender).startsWith(g)).sort(ord).slice(0, n);
    out = [...pick("m", f.split.male), ...pick("f", f.split.female)];
  }
  return out;
}

export function describeFilters(f) {
  const bits = [];
  if (f.niches?.length) bits.push(f.niches.join(" / "));
  if (f.city) bits.push(f.city);
  if (f.followersMin && f.followersMax) bits.push(`${shortNum(f.followersMin)}–${shortNum(f.followersMax)} followers`);
  else if (f.followersMin) bits.push(`${shortNum(f.followersMin)}+ followers`);
  else if (f.followersMax) bits.push(`up to ${shortNum(f.followersMax)} followers`);
  if (f.minReach) bits.push(`reach ${shortNum(f.minReach)}+`);
  if (f.maxRate) bits.push(`budget up to ${inr(f.maxRate)}`);
  if (f.split) bits.push(`${f.split.male} male + ${f.split.female} female`);
  else if (f.gender) bits.push(f.gender);
  if (f.language) bits.push(f.language);
  if (f.state) bits.push(f.state.replace(/\b\w/g, (x) => x.toUpperCase()));
  if (f.minEr) bits.push(`engagement ${f.minEr}%+`);
  if (f.ageMin) bits.push(`age ${f.ageMin}–${f.ageMax}`);
  if (f.barter) bits.push("barter OK");
  if (f.platform === "youtube") bits.push("YouTube");
  if (f.verified) bits.push("verified");
  return bits.join(" · ");
}

// ── what does the brand want? ─────────────────────────────────────────────────────────────────────
const RX = {
  handoff: /\b(campaign manager|manager se|insaan|human|real person|call (me|karo)|whatsapp|team se baat|baat karni|talk to (someone|team|a person))\b/,
  saveSearch: /\b(naya|naye|new)\b.*\b(aaye|aayen|aayein|aa jaye|join|batana|bata dena|notify|alert)\b|\b(alert|notify) me\b|\bsave (this|ye) search\b/,
  compare: /\b(vs|versus|compare|comparison|tulna|mukabla)\b/,
  repeat: /\b(dobara|again|repeat|pichli baar|pichhli baar|last time|same brief|wahi brief|fir se|phir se)\b/,
  // Session 58: "report" alone ("I want to report a bug") is not the monthly report — it needs a month / summary word.
  report: /\b(summary|summery|is mahine|iss mahine|this month|monthly|mahine ka|month ka|hisab|hisaab|(my|meri|mera) report|report (of|for) (this|last) month)\b/,
  alerts: /\b(pending|attention|alerts?|kya karna hai|kya baaki|to-?do|kuch rukha|wait kar|kya bacha)\b/,
  applicants: /\b(applicants?|applications?|apply kiye|apply kiya|kaun apply|kisne apply|who applied|applied|best applicant|rank)\b/,
  write: /\b(hooks?|scripts?|captions?|hashtags?|likh do|likho)\b/,
  briefCheck: /\b(brief)\b.*\b(check|review|sahi|theek|thik|achha|better|improve)\b|\bcheck (my|mera) brief\b/,
  planner: /\b(plan|planner|plan karo|plan banao|plan bana do|plan kar do|sale plan|launch plan|festival plan)\b/,
  festival: /\b(diwali|holi|navratri|eid|christmas|raksha ?bandhan|rakhi|valentine|new year|independence day|festival|tyohar)\b/,
  // Session 58: English word order too ("I need UGC videos", "create a UGC brief") — Eva's starter box.
  ugcCreate: /\b(ugc)\b.*\b(chahiye|chaiye|banana|banani|bana do|create|post|need|want|karna|karni)\b|\b(need|want|create|make|post|order)\b.*\bugc\b|\b(\d+)\s*(ugc\s*)?videos?\s*(chahiye|chaiye|need)/,
  campaignCreate: /\bcampaign\b.*\b(banani|banana|bana do|create|start|launch|chalani|chahiye|chaiye|karni)\b|\b(new|nayi|naya) campaign\b/,
  // Session 58: English word order ("I want to create a campaign") — not when they are asking for creators.
  campaignCreateEn: /\b(create|start|launch|make|run|set up|post)\b.*\bcampaign\b/,
  status: /\b(meri|mera|mere|my)\b.*\b(campaigns?|orders?|briefs?|payments?|paisa|paise|hold|status)\b|\b(kahan tak|kya haal|status|kitna paisa|payment hold|kab release)\b|\bhow much\b.*\b(paid|spent|spend|pay|held|on hold)\b/, // v328: "how much paid / spent" = status (money)
  product: /(https?:\/\/\S+|\bmera product\b|\bmy product\b|\bproduct (hai|is)\b|\bproduct link\b)/,
  creators: /\b(creators?|influencers?|youtubers?|bloggers?|instagrammers?|reelers?|models?)\b/,
};

/** → { intent, ...extra } or null (null = leave it to the old feedback / help brain). */
/** v345: "what is / tell me about / know about / kya hai / samjhao …" — the brand wants an explanation. */
export const isInfoAsk = (text) => /\b(know about|knw about|what is|what's|whats|what are|what does|tell me about|explain|meaning|kya hai|kya hota|kya hote|kya hoti|matlab|samjha\w*|bata(o|iye|na)? .*(ugc|campaign)|how does|how do(es)? .* work|how it works|kaise kaam)\b/.test(lower(text));

export function detectBrandIntent(text) {
  const t = lower(text);
  if (!t.trim()) return null;
  // v435 (Eva question test #10): FAQs / safety go to Eva's fixed answers, not a card; "are you a bot or human?" is a question.
  if (/\b(refund|escrow|delete (my )?account|contact support|customer care|team members?|add (my )?(team|colleague)|threaten\w*|harass\w*|blackmail\w*|cancel (my |the |this |a )?(campaign|brief|order|deal|collab)|less than (agreed|promised|decided))\b/.test(t) || /\b(why|kyun|kyu)\b.*\b(payment|payout|paisa|paise|money|amount)\b.*\b(less|kam|cut|kat|deduct\w*)\b/.test(t)) return null;
  if (RX.handoff.test(t) && !/\b(are you|r u|is this|bot|robot|ai|machine)\b/.test(t)) return { intent: "handoff" };
  // v419 (Ravi): the free invoice maker ("bill banao", "create an invoice", "my invoices") — not a question about
  // Ybex's own GST invoice for a payment ("invoice for my payment", "download GST invoice"), which the help answers.
  if (/\b(invoices?|bill)\b/.test(t) && !/\b(ybex|payment|paid|refund|escrow|gst invoice|tax invoice|download (my )?(gst|tax))\b/.test(t)
    && /\b(create|make|generate|bana\w*|new|nayi|naya|free|chahiye|chaiye|likh\w*|generator|maker|history|list|my|meri|mere|all)\b|^\s*invoices?\s*$/.test(t)) return { intent: "invoice", list: /\b(my|meri|mere|all)\s+invoices?\b|\binvoice (history|list)\b/.test(t) };
  if (RX.saveSearch.test(t)) return { intent: "saveSearch" };
  if (RX.compare.test(t) && /\bvs\b|versus|compare/.test(t)) return { intent: "compare", names: compareNames(text) };
  if (RX.repeat.test(t) && /\b(brief|ugc|order|video|campaign)\b/.test(t)) return { intent: "repeat", keyword: repeatKeyword(text) };
  // v419: a total-budget question ("10 creators 50k mein?") — before the creator search (that reads 50k as a per-creator rate).
  const bf = parseBudgetFit(text);
  if (bf) return { intent: "budgetFit", ...bf, filters: { ...parseCreatorQuery(text), maxRate: 0, count: 0 } };
  if (RX.write.test(t)) return { intent: "write" };
  if (RX.briefCheck.test(t)) return { intent: "briefCheck" };
  if (RX.applicants.test(t)) return { intent: "applicants" };
  if (RX.planner.test(t) && (RX.festival.test(t) || parseAmount(text) || /\b(campaign|launch|sale)\b/.test(t))) return { intent: "planner", budget: parseAmount(text) };
  if (RX.festival.test(t) && parseAmount(text)) return { intent: "planner", budget: parseAmount(text) };
  // v345 (tester: "I need to know about UGC" opened the UGC brief builder): a question ABOUT UGC / campaigns is
  // answered (Eva's knowledge), it doesn't start a brief — unless the brand also says make / post / order or gives an amount.
  const infoOnly = isInfoAsk(t) && !/\b(bana\w*|create|post|order|make|start|launch|chahiye|chaiye)\b/.test(t) && !parseAmount(text);
  if (RX.ugcCreate.test(t) && !infoOnly) return { intent: "ugcCreate" };
  // v328: "create a campaign for my brand" was blocked by "my" — only a status question stops it now.
  if (!infoOnly && (RX.campaignCreate.test(t) || (RX.campaignCreateEn.test(t) && !RX.creators.test(t))) && !/\b(status|kahan tak|kya haal|payments?|pending)\b/.test(t)) return { intent: "campaignCreate" };
  if (RX.report.test(t)) return { intent: "report" };
  if (RX.alerts.test(t) && !RX.creators.test(t)) return { intent: "alerts" };
  // Session 58: "creators for my campaign" is a creator search, not campaign status.
  if (RX.creators.test(t) && !/\b(status|payments?|paisa|paise|hold|kahan tak|kya haal|kab release)\b/.test(t)) return { intent: "creators", filters: parseCreatorQuery(text) };
  if (RX.status.test(t)) return { intent: "status" };
  const f = parseCreatorQuery(text);
  if (RX.product.test(t)) return { intent: "product" };
  if (RX.creators.test(t) || (hasCreatorFilters(f) && /(dikhao|chahiye|chaiye|find|show|search|dhundo|dhoondo|list)/.test(t))) return { intent: "creators", filters: f };
  return null;
}

// v328: money words in a status question → needs the "Payments & reports" switch.
export const isMoneyAsk = (text) => /\b(payments?|paid|pay|spent|spend|paisa|paise|hold|held|escrow|kharch\w*|release|money)\b/.test(lower(text));
// v328: GET /campaigns?mine=true sends `applicants` (array of rows), not a count.
export const appCountOf = (c) => (Array.isArray(c?.applicants) ? c.applicants.length : Number(c?.applications_count ?? c?.applicants_count ?? 0) || 0);

export function compareNames(text) {
  const parts = String(text || "").replace(/\b(compare|comparison|tulna|karo|kar do|between|aur|and)\b/gi, " vs ").split(/\s+(?:vs\.?|versus)\s+|,/i);
  return parts.map((p) => p.replace(/[^\p{L}\p{N}@._\s-]/gu, " ").replace(/\s+/g, " ").trim()).filter((p) => p.length >= 2).slice(0, 4);
}
export function repeatKeyword(text) {
  const t = lower(text).replace(/\b(pichli|pichhli|baar|wala|wali|wale|last|time|ugc|brief|order|video|dobara|again|repeat|chahiye|chaiye|same|wahi|fir|phir|se|do|karo|mujhe|mera|meri|the|for)\b/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return t.length >= 3 ? t : "";
}

/** Find creators by name / handle (for "Riya vs Aman"). */
export function findByNames(list, names) {
  return names.map((n) => {
    const q = lower(n).replace(/^@/, "");
    const hit = (list || []).find((c) => lower(nameOf(c)) === q || lower(c.instagram_handle || c.handle || "").replace(/^@/, "") === q)
      || (list || []).find((c) => lower(nameOf(c)).includes(q) || lower(c.instagram_handle || c.handle || "").includes(q));
    return { query: n, creator: hit || null };
  });
}
/** Reach the brand gets for every ₹1,000 (only when both numbers are real). */
export const reachPer1000 = (c) => { const r = rateOf(c), re = reachOf(c); return r > 0 && re > 0 ? Math.round((re / r) * 1000) : 0; };

// ── applicants ranking ───────────────────────────────────────────────────────────────────────────
/** Score an applicant for a campaign: niche match, reach, rate inside the budget, follower range. */
export function scoreApplicant(campaign, app, creator) {
  const why = []; let score = 0;
  const cats = (Array.isArray(campaign?.categories) ? campaign.categories : String(campaign?.category || campaign?.niche || "").split(",")).map((x) => lower(x).trim()).filter(Boolean);
  const nt = nicheText(creator || {});
  if (cats.length && cats.some((c) => nt.includes(c) || c.includes(nicheOf(creator).toLowerCase() || "@@"))) { score += 40; why.push("niche match"); }
  const reach = reachOf(creator || {}), fc = followersOf(creator || {});
  if (reach) { score += Math.min(30, Math.round(Math.log10(reach + 1) * 6)); why.push(`${shortNum(reach)} avg reach`); }
  const ask = Number(app?.proposed_amount || app?.proposed_rate || app?.bid_amount || app?.quote || app?.expected_rate || 0) || rateOf(creator || {});
  const max = Number(campaign?.budget_max || campaign?.budget || 0);
  if (ask && max) {
    // Session 58 (Eva handoff §8b): "fits budget", never the creator's amount.
    // v328: the applicant's own bid (proposed_amount from /campaigns/:id/applications) is checked first, not the card rate.
    if (ask <= max) { score += 20; why.push("fits budget"); } else { score -= 10; why.push("over budget"); }
  }
  const fmin = Number(campaign?.follower_min || 0), fmax = Number(campaign?.follower_max || 0);
  if (fc && (fmin || fmax) && fc >= (fmin || 0) && fc <= (fmax || Infinity)) { score += 10; why.push("follower range fits"); }
  return { score, why };
}

// ── brand to-do (alerts) — same rules as the "Needs your action" box on brand home ───────────────────
export function computeAlerts({ orders = [], campaigns = [] } = {}) {
  let drafts = 0, liveLinks = 0, countered = 0;
  for (const o of orders) {
    const s = String(o.brand_status || o.status || o.stage || "").toUpperCase();
    if (["SUBMITTED", "CONTENT_SUBMITTED", "DELIVERED", "DRAFT_SUBMITTED", "PENDING_REVIEW", "IN_REVIEW"].includes(s)) drafts++;
    if (["LIVE_LINK_SUBMITTED", "PROOF_SUBMITTED"].includes(s)) liveLinks++; // Session 58: same rule as brand home
    if (s === "PRICE_COUNTERED" || s === "NEGOTIATING") countered++;
  }
  const items = [];
  if (drafts) items.push({ key: "drafts", text: `${drafts} UGC draft${drafts > 1 ? "s" : ""} waiting for your review`, link: "/brand/ugc/orders", cta: "Review" });
  if (liveLinks) items.push({ key: "live", text: `${liveLinks} live link${liveLinks > 1 ? "s" : ""} to approve (releases the creator's payout)`, link: "/brand/ugc/orders", cta: "Approve" });
  if (countered) items.push({ key: "counter", text: `${countered} creator${countered > 1 ? "s" : ""} sent a counter offer`, link: "/brand/inbox", cta: "Open" }); // Session 53: was /brand/campaigns/:id (no such page)
  const now = Date.now();
  for (const c of campaigns) {
    const st = lower(c.status);
    if (st && !["live", "approved", "active"].includes(st)) continue;
    const apps = appCountOf(c); // v328: the list sends an `applicants` array
    const id = c.campaign_id || c.id;
    if (apps > 0) items.push({ key: `apps-${id}`, text: `${apps} application${apps > 1 ? "s" : ""} on "${c.title || "your campaign"}"`, link: `/brand/campaigns/${id}/applicants`, cta: "See" });
    // v329: India calendar days — a date-only close ("2026-10-17") lasts all of that IST day (it was read as
    // 5:30 am and dropped the same morning), and the line says "today" / "tomorrow" / "in 2 days" (not "today / tomorrow").
    const raw = c.applications_close || c.deadline || c.end_date || "";
    const dl = Date.parse(raw);
    if (dl) {
      const closeDay = /^\d{4}-\d{2}-\d{2}$/.test(String(raw)) ? String(raw) : istDateString(0, dl);
      const days = Math.round((Date.parse(closeDay) - Date.parse(istDateString(0, now))) / 864e5);
      const open = /^\d{4}-\d{2}-\d{2}$/.test(String(raw)) ? days >= 0 : dl > now;
      if (open && days >= 0 && days <= 2) items.push({ key: `dl-${id}`, text: `"${c.title || "Campaign"}" closes ${days === 0 ? "today" : days === 1 ? "tomorrow" : "in 2 days"}`, link: `/brand/campaigns/${id}/applicants`, cta: "Open" }); // Session 53: was /brand/campaigns/:id (no such page)
    }
  }
  return items.slice(0, 8);
}

// ── this month's report ────────────────────────────────────────────────────────────────────────────
const ESCROW_FUNDED = ["deposited", "held", "in_escrow", "video_submitted", "escrow_held", "active", "approved", "released", "completed", "paid", "funded"];
export function monthlyReport({ orders = [], payments = [], campaigns = [], paymentsFailed = false } = {}, now = new Date()) {
  // v329: the month is the India (IST) month, not the phone's time zone (UTC phones moved 1st-of-month payments).
  const ym = (d) => { const t = d instanceof Date ? d.getTime() : Date.parse(d || ""); return Number.isFinite(t) ? new Date(t + 5.5 * 3600e3).toISOString().slice(0, 7) : ""; };
  const cur = ym(now);
  const inMonth = (d) => ym(d) === cur;
  const spent = payments.filter((p) => inMonth(p.created_at || p.createdAt) && ESCROW_FUNDED.includes(lower(p.status))).reduce((a, p) => a + (Number(p.amount || p.gross_amount) || 0), 0);
  const done = orders.filter((o) => ["COMPLETED", "APPROVED", "PAID", "CONTENT_APPROVED"].includes(String(o.status || o.stage || "").toUpperCase()) && inMonth(o.completed_at || o.approved_at || o.updated_at));
  const creators = new Set(orders.filter((o) => inMonth(o.created_at || o.claimed_at || o.updated_at)).map((o) => o.creator_id).filter(Boolean));
  const hrs = done.map((o) => (Date.parse(o.submitted_at || o.delivered_at || "") - Date.parse(o.claimed_at || o.accepted_at || o.created_at || "")) / 36e5).filter((h) => Number.isFinite(h) && h > 0);
  const avgHours = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : 0;
  const liveCampaigns = campaigns.filter((c) => ["live", "approved", "active"].includes(lower(c.status))).length;
  const monthName = now.toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" }); // v329: IST
  return { monthName, spent: paymentsFailed ? null : spent /* v332: couldn't read → "—", not ₹0 */, videos: done.length, creators: creators.size, avgHours, liveCampaigns };
}
export function reportText(r, brand = "") {
  return [
    `Ybex report — ${r.monthName}${brand ? ` · ${brand}` : ""}`,
    `Spent: ${r.spent == null ? "—" : inr(r.spent)}`,
    `Videos delivered: ${r.videos}`,
    `Creators worked with: ${r.creators}`,
    r.avgHours ? `Avg delivery time: ${r.avgHours} h` : "",
    `Live campaigns: ${r.liveCampaigns}`,
  ].filter(Boolean).join("\n");
}

// ── festival / launch planner (works without AI; AI only adds the wording) ───────────────────────────
const BANDS = { nano: 5500, micro: 16000, ugc: 2500 };
export function festivalPlan(text, budget) {
  const t = lower(text);
  const name = (t.match(/\b(diwali|holi|navratri|eid|christmas|raksha ?bandhan|rakhi|valentine'?s?|new year|independence day)\b/) || [])[1] || "launch";
  const b = Math.max(0, Number(budget) || 0);
  const creatorsShare = Math.round(b * 0.65), ugcShare = b - creatorsShare;
  const micro = Math.floor((creatorsShare * 0.6) / BANDS.micro);
  const nano = Math.floor((creatorsShare - micro * BANDS.micro) / BANDS.nano);
  const ugc = Math.floor(ugcShare / BANDS.ugc);
  const title = name === "launch" ? "Launch plan" : `${name.replace(/\b\w/g, (m) => m.toUpperCase())} plan`;
  return {
    title, budget: b, creatorsShare, ugcShare, micro, nano, ugc,
    timeline: [
      { when: "3 weeks before", what: "Post the campaign + UGC brief on Ybex" },
      { when: "2 weeks before", what: "Shortlist creators, send invites, sign agreements" },
      { when: "1 week before", what: "Drafts in — review, ask for changes once" },
      { when: "2–3 days before", what: "Teasers / UGC ads go live" },
      { when: "Festival week", what: "Main reels live; approve live links" },
      { when: "After", what: "Approve payouts, see the monthly report" },
    ],
  };
}

// ── brief quality check (rules; the AI adds wording when it is on) ───────────────────────────────────
export function checkBrief(b = {}) {
  const issues = [], good = [];
  const text = `${b.title || ""} ${b.product_description || b.description || ""} ${b.detailed_requirements || b.requirementsText || ""}`;
  if (!String(b.product_url || "").trim() && !/https?:\/\//.test(text)) issues.push("Product link missing — creators can't see what they are selling.");
  else good.push("Product link is there.");
  const words = String(b.detailed_requirements || b.requirementsText || b.description || "").trim().split(/\s+/).filter(Boolean).length;
  if (words < 15) issues.push("Requirements are very short — add the key message, must-say points and the vibe (15+ words).");
  else good.push("Requirements are detailed.");
  if (!/(\d+\s*(s|sec|second|min)|reel|story|post|video|short)/i.test(`${b.video_duration || ""} ${b.deliverablesText || ""} ${text}`)) issues.push("Deliverable is not clear — say what and how long (e.g. 1 reel, 30s).");
  const budget = Number(b.budget || b.budgetMax || b.budgetMin || 0);
  const type = String(b.deliverable_type || "");
  const min = Math.max(UGC_MIN_BUDGET, type === "ugc_video_raw" ? 1500 : type === "ugc_video_edited" ? 2500 : type ? 2000 : 3000); // v420: never below the floor
  if (budget && budget < min) issues.push(`Budget ${inr(budget)} is low for this format — creators usually expect ${inr(min)}+.`);
  if (!(b.dos || []).length && !/\b(do|don'?t|must|avoid)\b/i.test(text)) issues.push("No do's / don'ts — add 2–3 so the first draft is right.");
  const score = Math.max(10, 100 - issues.length * 18);
  return { score, issues, good };
}

// ── UGC brief from chat: what we still need to ask ──────────────────────────────────────────────────
// The bot never asks for more.
// never asks for more. `min` below is only the usual market rate, shown as a tip ("aam taur pe…").
export const UGC_MIN_BUDGET = 2000; // v420: special offer (usually ₹3,000)
export const UGC_MAX_BUDGET = 500000; // v416
export const UGC_FORMATS = [
  { key: "collaboration_reel", label: "Collab reel (on creator's Instagram)", min: 2000, words: ["collab", "collaboration", "reel", "instagram", "post"] },
  { key: "ugc_video_edited", label: "UGC video, edited (for your ads)", min: 2500, words: ["edited", "ad", "ads", "edit"] },
  { key: "ugc_video_raw", label: "UGC video, raw clips", min: 1500, words: ["raw", "clips", "unedited"] },
];
export function readUgcFields(text, prev = {}) {
  const t = lower(text);
  const out = { ...prev };
  const vids = t.match(/\b(\d{1,2})\s*(?:ugc\s*)?(?:videos?|reels?|creators?)\b/);
  if (vids) out.max_creators = Math.min(50, Number(vids[1]));
  const per = t.match(/(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?\s*k?)\s*(?:per|\/|each|har|ek)\s*(?:video|reel|creator)?/) || t.match(/(?:₹|\brs\.?|\binr|\bbudget|\brate)\s*(\d[\d,]*\s*k?)/);
  if (per) { const n = numOf(per[1]); if (n >= 100) out.budget = n; }
  const dur = t.match(/\b(15|30|60|90)\s*(?:s|sec|secs|second|seconds)\b/);
  if (dur) out.video_duration = `${dur[1]}s`;
  const fmt = UGC_FORMATS.find((f) => f.words.some((w) => new RegExp(`\\b${w}\\b`).test(t)));
  if (fmt && !out.deliverable_type) out.deliverable_type = fmt.key;
  const url = String(text).match(/https?:\/\/\S+/);
  if (url) out.product_url = url[0];
  const STOP = /^(ugc|video|videos|reel|reels|brand|instagram|chahiye|chaiye|mujhe|mere|mera|meri|apne|hamare|the|a|an|my|our|ads?|advert\w*|promotion|marketing|launch|youtube|me|us)$/i; // v329: "Glow serum for ads" → product "ads"
  const prod = String(text).match(/\bproduct[:\s]+([A-Za-z][\w &'-]{1,40}?)(?:[,.]|$)/i)
    || String(text).match(/\bfor\s+(?:my\s+|our\s+|the\s+)?([A-Za-z][\w'-]{1,30}(?:\s+[A-Z][\w'-]{1,30})?)/)
    || String(text).match(/\b([A-Za-z][\w'-]{1,30})\s+(?:ke\s+liye|ka\s+(?:ugc|video)|ki\s+(?:ugc|video))/i);
  if (prod && !out.product_name && !STOP.test(prod[1].trim())) out.product_name = prod[1].trim();
  return out;
}
// Session 58 (Eva handoff §6 / §7.3): one question at a time, shown in a glass question box inside the chat
// (label, "n of N", lime progress bar, big option buttons; free-text questions get a text box + Next and
// suggestions under "OR PICK ONE"). UI copy is English. `field` is what the answer fills.
export const UGC_STEPS = ["product_name", "deliverable_type", "max_creators", "budget", "detailed_requirements"];
export function nextUgcQuestion(d = {}) {
  const q = (field, ask, extra) => ({ field, ask, label: "UGC BRIEF", step: UGC_STEPS.indexOf(field) + 1, total: UGC_STEPS.length, ...extra });
  if (!d.product_name) return q("product_name", "What is it for? A product, an app or an event — type its name (add a link if you have one).", { input: true, placeholder: "e.g. Vitamin C face serum", suggestions: ["My skincare product", "My app", "My event"] });
  if (!d.deliverable_type) return q("deliverable_type", "Which kind of video do you need?", { chips: UGC_FORMATS.map((f) => ({ label: `${f.label} · from ${inr(f.min)}`, value: f.key })) });
  if (!d.max_creators) return q("max_creators", "How many videos? (1 creator = 1 video)", { chips: [1, 2, 3, 5, 10].map((n) => ({ label: `${n} video${n > 1 ? "s" : ""}`, value: n })) });
  if (!d.budget) {
    const min = UGC_FORMATS.find((f) => f.key === d.deliverable_type)?.min || 2000;
    return q("budget", `Budget per video? Creators usually take ${inr(min)} or more for this format.`, { input: true, placeholder: `₹${min.toLocaleString("en-IN")}`, chips: [min, Math.round(min * 1.5 / 500) * 500, min * 2].map((n) => ({ label: `${inr(n)} per video`, value: String(n) })) });
  }
  if (!d.detailed_requirements) return q("detailed_requirements", "What should the video say or show? 1–2 lines, or skip.", { input: true, placeholder: "e.g. Show the texture, say it's fragrance-free", suggestions: ["Skip"] });
  return null;
}
export function ugcDraftFrom(d = {}) {
  const fmt = UGC_FORMATS.find((f) => f.key === d.deliverable_type) || UGC_FORMATS[0];
  return {
    title: d.title || (d.product_name ? `${d.product_name} — UGC video` : "UGC video"),
    product_name: d.product_name || "",
    product_description: d.product_description || "",
    detailed_requirements: d.detailed_requirements && !/^skip$/i.test(d.detailed_requirements) ? d.detailed_requirements : "",
    product_url: d.product_url || "",
    sample_content_url: "",
    deliverable_type: fmt.key,
    video_duration: d.video_duration || "30s",
    budget: Math.min(UGC_MAX_BUDGET, Math.max(UGC_MIN_BUDGET, Number(d.budget) || fmt.min)), // v416
    max_creators: Math.max(1, Number(d.max_creators) || 1),
    delivery_hours: d.delivery_hours || 48,
    dos: Array.isArray(d.dos) ? d.dos : [],
    donts: Array.isArray(d.donts) ? d.donts : [],
  };
}

// ── campaign draft from chat ────────────────────────────────────────────────────────────────────────
export function campaignDraftFrom(text, prev = {}) {
  const f = parseCreatorQuery(text);
  const t = lower(text);
  const tier = f.followersMin >= 1e6 ? "Mega" : f.followersMin >= 1e5 ? "Macro" : f.followersMax && f.followersMax <= 10000 ? "Nano" : /\bnano\b/.test(t) ? "Nano" : "Micro";
  const count = (t.match(/\b(\d{1,3})\s*(?:creators?|influencers?)\b/) || [])[1];
  const platforms = [/(youtube|yt)\b/.test(t) ? "YouTube" : null, /(instagram|insta|ig|reel)\b/.test(t) || !/(youtube|yt)\b/.test(t) ? "Instagram" : null].filter(Boolean);
  const budget = f.maxRate || parseAmount(text) || 0;
  return {
    ...prev,
    campaignTitle: prev.campaignTitle || (f.niches[0] ? `${f.niches[0]} creators${f.city ? ` in ${f.city}` : ""}` : "New campaign"),
    requirementsText: prev.requirementsText || String(text).slice(0, 600),
    selectedCategories: f.niches.length ? f.niches : prev.selectedCategories || [],
    selectedPlatforms: platforms,
    selectedFollowerRanges: [tier],
    collabMode: "Paid",
    isBudgetRange: Boolean(budget),
    budgetMin: budget ? String(Math.round(budget * 0.6)) : prev.budgetMin || "",
    budgetMax: budget ? String(budget) : prev.budgetMax || "",
    budget: budget ? String(budget) : prev.budget || "",
    deliverablesText: prev.deliverablesText || (/(story|stories)/.test(t) ? "1 Reel + 2 Stories" : "1 Reel"),
    selectedLocations: f.city ? [f.city] : prev.selectedLocations || [],
    selectedLanguages: f.language ? [f.language.replace(/\b\w/g, (m) => m.toUpperCase())] : prev.selectedLanguages || ["Hindi", "English"],
    creatorsNeeded: count ? (Number(count) < 5 ? "<5" : Number(count) <= 15 ? "5–15" : Number(count) <= 25 ? "15–25" : "Custom") : prev.creatorsNeeded || "5–15",
    customCreatorsNeeded: count ? String(count) : prev.customCreatorsNeeded || "10",
  };
}

// ── Session 58 (Eva handoff §7.2): the campaign builder in chat — the same fields and order as
// MobileCampaignCreate (Brief: title, brief, niche · Who & how much: platforms, reach, payout, deliverables,
// applications close · advanced targeting). Eva only prepares `campaign_draft`; the brand publishes there.
export const CAMPAIGN_STEPS = ["campaignTitle", "requirementsText", "selectedCategories", "selectedPlatforms", "selectedFollowerRanges", "payout", "deliverablesText", "deadline", "advanced"];
export const REACH_TIERS = [["Nano", "Nano · 4k–10k"], ["Micro", "Micro · 10k–50k"], ["Macro", "Macro · 50k–500k"], ["Mega", "Mega · 500k–1M"], ["Celebrities", "Celebrities · 1M+"]];
// v328: India date (toISOString was the UTC date — one day off between midnight and 5:30 am IST).
const isoInDays = (n, now = Date.now()) => istDateString(n, now);
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** v328: "2 weeks", "1 month", "30 Nov", "Nov 30", "30/11", "10" (days) → "YYYY-MM-DD" (IST), else "". */
export function parseCloseDate(text, now = Date.now()) {
  const t = lower(text).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const days = (n) => (n > 0 && n <= 365 ? isoInDays(n, now) : "");
  const amt = (x) => (/^(a|an|one|ek)$/.test(x) ? 1 : Number(x));
  let m = t.match(/^(?:in\s+)?(\d{1,3}|a|an|one|ek)\s*(days?|din|weeks?|wks?|hafte|hafta|months?|mahin[ae])(?:\s+(?:from now|later|mein|me|baad))?$/);
  if (m) { const n = amt(m[1]); return days(/^(w|h)/.test(m[2]) ? n * 7 : /^m/.test(m[2]) ? n * 30 : n); }
  let d = 0, mo = -1;
  if ((m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?([a-z]{3,9})$/))) { d = Number(m[1]); mo = MONTHS.indexOf(m[2].slice(0, 3)); }
  else if ((m = t.match(/^([a-z]{3,9})\s*(\d{1,2})(?:st|nd|rd|th)?$/))) { d = Number(m[2]); mo = MONTHS.indexOf(m[1].slice(0, 3)); }
  else if ((m = t.match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})$/))) { d = Number(m[1]); mo = Number(m[2]) - 1; }
  if (mo >= 0 && mo < 12 && d >= 1) {
    const today = isoInDays(0, now);
    let y = Number(today.slice(0, 4));
    const iso = (yy) => `${yy}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const valid = (yy) => new Date(Date.UTC(yy, mo, d)).getUTCDate() === d;
    if (!valid(y) && !valid(y + 1)) return "";
    if (!valid(y) || iso(y) <= today) y += 1; // next occurrence (today itself is too late to close)
    return valid(y) ? iso(y) : "";
  }
  if (/^\d{1,3}$/.test(t)) { const n = Number(t); return n > 0 && n < 120 ? isoInDays(n, now) : ""; }
  return "";
}
export function nextCampaignQuestion(c = {}) {
  const q = (field, ask, extra) => ({ field, ask, label: "NEW CAMPAIGN", step: CAMPAIGN_STEPS.indexOf(field) + 1, total: CAMPAIGN_STEPS.length, ...extra });
  if (!c.campaignTitle) return q("campaignTitle", "What should we call this campaign?", { input: true, placeholder: "e.g. Diwali glow serum launch", suggestions: ["Product launch", "Festive sale", "Brand awareness"] });
  if (!c.requirementsText) return q("requirementsText", "Write the creative brief — what should creators make and say? (at least 15 characters)", { input: true, minLength: 15, placeholder: "e.g. A 30s reel showing your morning routine with our serum", suggestions: [] }); // v329: the box shows n/15 and waits for 15
  if (!c.selectedCategories || !c.selectedCategories.length) return q("selectedCategories", "Which niche? Pick up to 3 (tap one, or type a few).", { input: true, placeholder: "e.g. Fashion, Food", chips: NICHES.map((n) => ({ label: n.label, value: n.label })) }); // v329: "type a few" had no text box
  if (!c.selectedPlatforms || !c.selectedPlatforms.length) return q("selectedPlatforms", "Which platforms?", { chips: [{ label: "Instagram", value: "Instagram" }, { label: "YouTube", value: "YouTube" }, { label: "Both", value: "Instagram, YouTube" }] });
  if (!c.selectedFollowerRanges || !c.selectedFollowerRanges.length) return q("selectedFollowerRanges", "What creator reach do you want?", { chips: REACH_TIERS.map(([v, l]) => ({ label: l, value: v })) });
  if (!c.budgetMax && !c.budget) return q("payout", "Payout per creator?", { input: true, placeholder: "e.g. 8000–18000 or 10000", chips: [["₹2,000–₹5,000", "2000-5000"], ["₹5,000–₹10,000", "5000-10000"], ["₹8,000–₹18,000", "8000-18000"], ["₹15,000–₹30,000", "15000-30000"]].map(([l, v]) => ({ label: l, value: v })) });
  if (!c.deliverablesText) return q("deliverablesText", "Deliverables — what exactly do you need from each creator?", { input: true, placeholder: "e.g. 1 Reel + 2 Stories with link", suggestions: ["1 Reel", "1 Reel + 2 Stories with link", "1 YouTube video"] });
  if (!c.deadline) return q("deadline", "When should applications close?", { chips: [7, 14, 21, 30].map((n) => ({ label: `In ${n} days`, value: isoInDays(n) })) });
  if (!c.advancedDone) return q("advanced", "Advanced targeting: any gender, Hindi + English, Pan India, 5–15 creators. Keep these?", { chips: [{ label: "Keep defaults", value: "keep" }, { label: "Change on the next screen", value: "change" }] });
  return null;
}
/** Read one answer into the campaign draft. Returns { c, error }. */
export function readCampaignAnswer(field, text, prev = {}) {
  const raw = String(text || "").trim();
  const c = { ...prev };
  if (field === "campaignTitle") c.campaignTitle = raw.slice(0, 100);
  else if (field === "requirementsText") {
    if (raw.length < 15) return { c: prev, error: "Please enter a creative brief (minimum 15 characters)." };
    c.requirementsText = raw.slice(0, 800);
  } else if (field === "selectedCategories") {
    // v328: exact chip value first, else whole words ("Lifestyle" used to match Fashion's "style" key too).
    const exact = NICHES.find((n) => lower(n.label) === lower(raw));
    const found = exact ? [exact.label] : nichesIn(raw);
    if (!found.length) return { c: prev, error: "Pick a niche from the list (up to 3)." };
    c.selectedCategories = [...new Set(found)].slice(0, 3);
    // v329: more than 3 → say which 3 were kept (they were dropped silently).
    if (new Set(found).size > 3) return { c, error: null, note: `Up to 3 niches — I kept ${c.selectedCategories.join(", ")}.` };
  } else if (field === "selectedPlatforms") {
    const p = [/insta|ig|reel/i.test(raw) ? "Instagram" : null, /youtube|yt/i.test(raw) ? "YouTube" : null].filter(Boolean);
    c.selectedPlatforms = p.length ? p : /both/i.test(raw) ? ["Instagram", "YouTube"] : ["Instagram"];
  } else if (field === "selectedFollowerRanges") {
    // v329: "celebrity" / "celeb" also picks Celebrities (only "celebrities" did; the rest fell back to Micro).
    const hit = REACH_TIERS.filter(([v]) => new RegExp(`\\b${v === "Celebrities" ? "celeb" : v}`, "i").test(raw)).map(([v]) => v);
    c.selectedFollowerRanges = hit.length ? hit : ["Micro"];
  } else if (field === "payout") {
    // v328: full units (1.5 lakh, 2 lac, 10k) and ranges ("50000 to 1 lakh") — only "k" was read before.
    const parts = (lower(raw).replace(/,/g, "").match(new RegExp(NUM, "g")) || []).filter((x) => numOf(x) > 0).slice(0, 2);
    const nums = parts.length === 2 ? rangeNums(parts[0], parts[1]) : parts.map(numOf); // v329: "10-20k" = ₹10,000–₹20,000 (was ₹10)
    if (nums.length === 2 && nums[0] > nums[1]) nums.reverse();
    if (!nums.length) return { c: prev, error: "Tell me an amount, e.g. 10000 or 8000–18000." };
    if (nums.length >= 2 && nums[0] < nums[1]) { c.isBudgetRange = true; c.budgetMin = String(nums[0]); c.budgetMax = String(nums[1]); c.budget = String(nums[1]); }
    else { c.isBudgetRange = false; c.budget = String(nums[0]); c.budgetMin = String(nums[0]); c.budgetMax = String(nums[0]); }
  } else if (field === "deliverablesText") c.deliverablesText = raw.slice(0, 300);
  else if (field === "deadline") {
    const d = parseCloseDate(raw); // v328: weeks / months / "30 Nov" / "30/11"; a bare number = days
    if (!d) return { c: prev, error: "Pick one: in 7, 14, 21 or 30 days — or type a date like 30 Nov, or \"2 weeks\"." };
    c.deadline = d;
  } else if (field === "advanced") { c.advancedDone = true; c.openAdvanced = /change/i.test(raw); }
  return { c, error: null };
}
/** Fill what the builder didn't ask with the screen's own defaults. */
export function campaignBuilderDraft(c = {}) {
  return {
    campaignTitle: c.campaignTitle || "New campaign", requirementsText: c.requirementsText || "",
    selectedCategories: c.selectedCategories || [], selectedPlatforms: c.selectedPlatforms || ["Instagram"],
    selectedFollowerRanges: c.selectedFollowerRanges || ["Micro"], collabMode: "Paid",
    isBudgetRange: c.isBudgetRange !== undefined ? c.isBudgetRange : true,
    budgetMin: c.budgetMin || "8000", budgetMax: c.budgetMax || "18000", budget: c.budget || c.budgetMax || "8000",
    deliverablesText: c.deliverablesText || "", deadline: c.deadline || isoInDays(14),
    gender: "Any", selectedLanguages: ["Hindi", "English"], selectedLocations: [], creatorsNeeded: "5–15", customCreatorsNeeded: "10",
    openAdvanced: Boolean(c.openAdvanced),
  };
}

// ── hooks / script without AI (tested formats) ─────────────────────────────────────────────────────
export function templateScript(product = "your product") {
  const p = String(product || "your product").trim() || "your product";
  // Session 58: Eva's UI is English — the fallback (AI off) script was Hinglish.
  return [
    "Hooks:",
    `1. "I used ${p} for 7 days — here's what happened 👇"`,
    `2. "Stop scrolling if you've ever struggled with ___"`,
    `3. "3 things ${p} does that nobody tells you"`,
    "",
    "30s script:",
    "0–3s  Hook (the problem or a surprising result)",
    `3–12s Show the problem, then ${p} in hand`,
    "12–24s 2–3 benefits, shown in real use",
    "24–30s Result + CTA: \"Link in bio / use code ___\"",
    "",
    `Caption: ${p} actually worked ✨ What's your favourite? #ad #${p.replace(/\s+/g, "")} #ugc #honestreview`,
  ].join("\n");
}

// Session 52: "chat clear karo" / "nayi chat" → delete the saved chat history.
// Session 58: "new chat" only starts a fresh chat (the old one stays in the menu) — it is not a delete.
export const NEW_CHAT = /^(nayi|new|naya|start (a )?new) chat$/i;
export const CLEAR_CHAT = /^(chat|history|purani chat|old chat)\s*(clear|delete|saaf|mita|hata)\w*(\s*(karo|kar do|do|kijiye|please))?$|^(clear|delete) (the )?(chat|history)$/i;
