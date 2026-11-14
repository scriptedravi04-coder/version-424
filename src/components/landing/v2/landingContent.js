import { api } from "../../../lib/api";

// v333 (Ravi: "logos and reviews admin ki platform settings se upload hote hai"): the landing page reads the same
// admin content as before — Admin → Landing content → brand logos (/landing-brands) and reviews (/landing-reviews).
// No admin reviews → the reviews section is hidden (the design's sample quotes are never shown as real ones).
const clean = (v) => String(v || "").trim();

export function toDesignReview(r) {
  const parts = clean(r.author_role).split(" • ");
  return {
    type: r.type === "brand" ? "brand" : "creator",
    name: clean(r.author_name) || (r.type === "brand" ? "Brand" : "Creator"),
    handle: parts[0] || clean(r.category),
    role: parts.length > 1 ? parts.slice(1).join(" • ") : clean(r.category),
    photo: clean(r.author_image) && !/ui-avatars|dicebear/.test(r.author_image) ? r.author_image : "",
    quote: clean(r.content),
    proof: clean(r.highlight_text),
  };
}

export async function loadLandingContent() {
  const [logos, reviews, creators] = await Promise.all([
    api.get("/landing-brands").then((r) => (Array.isArray(r.data) ? r.data : [])).catch(() => []),
    api.get("/landing-reviews").then((r) => (Array.isArray(r.data) ? r.data : [])).catch(() => []),
    api.get("/landing-creators").then((r) => (Array.isArray(r.data?.creators) ? r.data.creators : [])).catch(() => []),
  ]);
  return {
    cmsLogos: logos.filter((b) => b && b.logo_url && b.is_active !== false),
    cmsReviews: reviews.filter((r) => r && clean(r.content) && r.is_active !== false).map(toDesignReview),
    cmsCreators: creators.filter((c) => c && clean(c.picture)).map((c) => [clean(c.name) || "Creator", [clean(c.category), clean(c.city)].filter(Boolean).join(" · "), clean(c.picture)]),
  };
}

/**
 * v343 (Ravi: "landing pe wahi creators dikhe jo admin se home screen pe on kiye"): the creator wall (9 tiles, 3 columns).
 * Real creators only — the ones the admin ticked "Show on creator home" (GET /landing-creators). No grey "Creator ·
 * Fashion · Mumbai" placeholder tiles any more: with fewer than 9 creators the list repeats, never two in a row.
 * `fallback` (the design's own photos) is used only until the list loads / if the server has nobody.
 */
export function landingWallCards(cmsCreators, fallback, total = 9) {
  const list = Array.isArray(cmsCreators) && cmsCreators.length ? cmsCreators : fallback;
  if (!list.length) return [];
  // The views place tile k at column/row ORDER[c][r] = k. Pick the creator per (column, row) so no two
  // neighbouring tiles (side by side or one above the other) show the same person.
  const ORDER = [[0, 5, 6], [3, 1, 7], [4, 8, 2]];
  const n = list.length;
  const pick = (c, r) => (n >= 9 ? c * 3 + r : n === 3 || n < 3 ? (c + r) % n : (c * 3 + r) % n);
  const out = new Array(total);
  ORDER.forEach((col, c) => col.forEach((k, r) => { if (k < total) out[k] = list[pick(c, r)]; }));
  return out.filter(Boolean).map(([name, sub, p]) => ({ name, sub, real: true, slot: false, img: { position: "absolute", inset: 0, background: `url('${String(p).replace(/'/g, "%27")}') center top/cover` } }));
}
