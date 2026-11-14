// v363 (Ravi's "Instagram Auto Fetch" design — portfolio 1h / 1d / 1g / 1e): one shape for every portfolio item,
// whatever an older build saved (a bare link, a JSON string, or the old {title, brand_name, content_url} object).
// Pure helpers only — no server calls here.
import { captionHasTag } from "../../lib/diwaliChallenge"; // v367
//
// Saved item (creator_profiles.portfolio, text[] of JSON):
//   { id, source: "ig" | "link" | "upload", content_url, cover, views, likes, brand_name, date, title, platform,
//     self_reported }   ← self_reported: views typed by the creator on an uploaded file

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** 42100 → "42.1K", 120000 → "1.2L", 12500000 → "1.3Cr" (Indian short form). null for nothing. Pure. */
export function shortCount(v) {
  const n = num(v);
  if (!n) return null;
  const cut = (x) => (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10).toString().replace(/\.0$/, "");
  if (n >= 1e7) return `${cut(n / 1e7)}Cr`;
  if (n >= 1e5) return `${cut(n / 1e5)}L`;
  if (n >= 1e3) return `${cut(n / 1e3)}K`;
  return String(Math.round(n));
}

/** "2026-09-12T…" → "12 Sep". "" when unknown. Pure. */
export function shortDate(iso) {
  const t = Date.parse(String(iso || ""));
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/** "@Lenskart " / "lenskart" → "Lenskart"-style display name kept as typed, minus a leading @. Pure. */
export function cleanBrand(v) {
  return String(v || "").trim().replace(/^@+/, "").replace(/\s+/g, " ").trim().slice(0, 60);
}
export const brandKey = (v) => cleanBrand(v).toLowerCase();
/** "@lenskart" from a caption → "Lenskart" (first letter up; the creator can still change it). Pure. */
export function niceBrand(v) {
  const b = cleanBrand(v);
  return b ? b.charAt(0).toUpperCase() + b.slice(1) : "";
}

function platformOf(url) {
  const u = String(url || "").toLowerCase();
  if (/instagram\.com|instagr\.am/.test(u)) return "instagram";
  if (/youtube\.com|youtu\.be/.test(u)) return "youtube";
  return u ? "other" : "";
}

let seq = 0;
export const newId = (prefix = "pf") => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Any stored entry → a normalized item, or null when there's nothing usable. Pure. */
export function parseItem(raw, index = 0) {
  let v = raw;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    if (t.startsWith("{") || t.startsWith("\"")) {
      try { v = JSON.parse(t); if (typeof v === "string") v = JSON.parse(v); } catch { v = t; }
    }
    if (typeof v === "string") v = { content_url: v };
  }
  if (!v || typeof v !== "object") return null;
  const url = String(v.content_url || v.url || v.link || "").trim();
  const cover = String(v.cover || v.thumbnail || v.thumbnail_url || v.cover_url || "").trim();
  if (!url && !cover) return null;
  const brand = cleanBrand(v.brand_name || v.brand || "");
  return {
    ...v,
    id: String(v.id || `old_${index}_${url.slice(-12)}`),
    source: v.source || (String(v.id || "").startsWith("ig_") ? "ig" : "link"),
    content_url: url,
    cover: /^https?:\/\//i.test(cover) ? cover : "",
    views: num(v.views),
    likes: num(v.likes),
    brand_name: brand,
    date: v.date || v.at || "",
    title: v.title || (brand ? `${brand} collab` : ""),
    platform: v.platform || platformOf(url),
    self_reported: Boolean(v.self_reported),
  };
}

export function parseList(list) {
  return (Array.isArray(list) ? list : []).map((x, i) => parseItem(x, i)).filter(Boolean);
}

/** Items → brand groups (biggest first). Items with no brand go to one "Other work" group at the end. Pure. */
export function groupByBrand(items) {
  const map = new Map();
  for (const it of items || []) {
    const key = brandKey(it.brand_name) || "__none";
    if (!map.has(key)) map.set(key, { key, brand: cleanBrand(it.brand_name) || "Other work", items: [] });
    map.get(key).items.push(it);
  }
  const groups = [...map.values()].map((g) => {
    const views = g.items.reduce((a, i) => a + (i.views || 0), 0);
    const likes = g.items.reduce((a, i) => a + (i.likes || 0), 0);
    return { ...g, views, likes };
  });
  return groups.sort((a, b) => (a.key === "__none") - (b.key === "__none") || b.items.length - a.items.length);
}

/** "7 reels · 1.2L views" — likes when no views are known; never a made-up number. Pure. */
export function groupLine(g) {
  const n = g.items.length;
  // v372: a group of only photo posts (/p/ links) says "post", not "reel"
  const posts = g.items.filter((i) => /instagram\.com\/(?:[^/]+\/)?p\//i.test(String(i?.content_url || ""))).length;
  const word = posts && posts === n ? "post" : "reel";
  const parts = [`${n} ${n === 1 ? word : `${word}s`}`];
  if (g.views) parts.push(`${shortCount(g.views)} views`);
  else if (g.likes) parts.push(`${shortCount(g.likes)} likes`);
  return parts.join(" · ");
}

/** One reel's number for a tile: views, else likes, else nothing. Pure. */
export function itemStat(it) {
  if (num(it?.views)) return { kind: "views", text: shortCount(it.views) };
  if (num(it?.likes)) return { kind: "likes", text: shortCount(it.likes) };
  return null;
}

/** Instagram media (from creator/portfolio/ig-media) → a pending item before it has a brand. Pure. */
export function mediaToPending(m) {
  return {
    id: `ig_${m.id || newId("x")}`,
    source: "ig",
    content_url: m.permalink || "",
    thumb: m.thumb || "",
    cover: m.cover || "",
    views: num(m.views),
    likes: num(m.likes),
    date: m.at || "",
    platform: "instagram",
    suggested: niceBrand(m.brand || ""),
    caption: String(m.caption || "").split("\n")[0].slice(0, 140),
    collab: Boolean(m.collab),
    challenge_hit: captionHasTag(m.caption), // v367: #YbexDiwaliChallenge / @ybex.in anywhere in the full caption
  };
}

/** Pending item + brand → what gets saved. Pure. */
export function finalizeItem(p, brand) {
  const b = cleanBrand(brand);
  return {
    id: p.id || newId(),
    source: p.source || "link",
    content_url: p.content_url || "",
    cover: p.cover || "",
    views: num(p.views),
    likes: num(p.likes),
    brand_name: b,
    date: p.date || new Date().toISOString(),
    title: `${b} collab`,
    platform: p.platform || platformOf(p.content_url),
    description: p.caption || "",
    self_reported: Boolean(p.self_reported),
    ...(p.stamp || {}), // v367: Diwali Challenge stamp from the server (challenge, challenge_at, challenge_sig)
  };
}

/** Pending items → groups to tag one after another, by the brand guessed from the caption. Pure. */
export function tagQueue(pending) {
  const map = new Map();
  for (const p of pending || []) {
    const key = brandKey(p.suggested) || `__solo_${p.id}`;
    if (!map.has(key)) map.set(key, { key, suggested: cleanBrand(p.suggested), items: [] });
    map.get(key).items.push(p);
  }
  return [...map.values()];
}

/** Brands already on the profile that start with / contain what's typed. Pure. */
export function suggestBrands(typed, items, limit = 4) {
  const q = brandKey(typed);
  const names = groupByBrand(items).filter((g) => g.key !== "__none").map((g) => ({ brand: g.brand, count: g.items.length }));
  if (!q) return names.slice(0, limit);
  return names.filter((n) => n.brand.toLowerCase().includes(q) && n.brand.toLowerCase() !== q).slice(0, limit);
}

/** Same link already in the portfolio? Instagram links compared by their shortcode. Pure. */
export function linkKey(url) {
  const u = String(url || "").trim();
  const m = /instagram\.com\/(?:[^/?#]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{5,})/i.exec(u);
  if (m) return `ig:${m[1]}`;
  return u.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
}

/** Saved items in the shape the server keeps (drops UI-only keys). Pure. */
export function toSaved(items) {
  return (items || []).map((it) => {
    const { thumb, suggested, caption, collab, challenge_hit, enter, stamp, ig_handle, ...rest } = it; // eslint-disable-line no-unused-vars
    return rest;
  });
}
