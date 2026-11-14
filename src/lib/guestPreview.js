// v349 (Ravi, desktop screenshot): the logged-out Explore preview showed 8 cards in a 5-column grid —
// one full row, then 3 cards and two empty slots before the blurred "Sign in or register" block.
// The preview now shows whole rows only: about `base` cards, rounded to a multiple of the grid's
// current column count (5 cols → 10, 4 → 8, 3 → 9, 2 → 8, 1 → 8). Fewer creators than that → all of them.
export const GUEST_PREVIEW_BASE = 8;

export function guestPreviewCount(cols, total, base = GUEST_PREVIEW_BASE) {
  const n = Math.max(1, Math.floor(Number(cols) || 1));
  const rows = Math.max(1, Math.round(base / n));
  return Math.max(0, Math.min(Number(total) || 0, n * rows));
}

/** Number of tracks in a CSS grid's computed grid-template-columns ("240px 240px 240px" → 3). */
export function gridColumnCount(template) {
  const parts = String(template || "").trim().split(/\s+/).filter((p) => p && p !== "none");
  return parts.length || 1;
}
