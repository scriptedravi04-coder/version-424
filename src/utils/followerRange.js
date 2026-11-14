// Session 58: the follower range a brand picked (Nano … Celebrities) as numbers, saved on the campaign.
// The old payload always sent 10k–500k (or 4k / 1M) whatever was picked.
const TIERS = { Nano: [4000, 10000], Micro: [10000, 50000], Macro: [50000, 500000], Mega: [500000, 1000000], Celeb: [1000000, null], Celebrities: [1000000, null] };
export function followerRangeFor(selected) {
  const picked = (Array.isArray(selected) ? selected : []).map((k) => TIERS[k]).filter(Boolean);
  if (!picked.length) return { follower_min: null, follower_max: null };
  const min = Math.min(...picked.map((t) => t[0]));
  const max = picked.some((t) => t[1] == null) ? null : Math.max(...picked.map((t) => t[1]));
  return { follower_min: min, follower_max: max };
}

// v358: the reverse — a saved campaign's follower_min / follower_max back to the tiers, so editing a campaign keeps
// its targeting (the edit screens used to reset it to "Micro" and save 10k–50k over it). `keys` = the screen's own
// tier names (desktop "Celeb", phone "Celebrities"). Nothing saved → [] (the caller keeps its default).
export function tiersForRange(min, max, keys = ["Nano", "Micro", "Macro", "Mega", "Celeb"]) {
  const lo = Number(min);
  if (min == null || min === "" || !Number.isFinite(lo)) return [];
  const hi = max == null || max === "" ? null : Number(max);
  // v416: a tier counts when it OVERLAPS the saved range (5k–500k kept Micro+Macro and dropped Nano,
  // so saving the edit narrowed the reach to 10k–500k). Touching edges (10k–50k vs Nano 4k–10k) don't count.
  return keys.filter((k) => {
    const t = TIERS[k];
    if (!t) return false;
    if (t[1] == null) return hi == null || t[0] < hi;
    if (t[1] <= lo) return false;
    return hi == null || t[0] < hi;
  });
}

// v416: preview text for the picked tiers — sorted small → big and touching ranges merged
// ("Nano + Micro" → "4k - 50k"; "Micro + Mega" → "10k - 50k / 500k - 1M").
const fmtK = (n) => (n >= 1000000 ? `${n / 1000000}M` : `${n / 1000}k`);
export function followerRangeText(selected) {
  const picked = (Array.isArray(selected) ? selected : []).map((k) => TIERS[k]).filter(Boolean)
    .slice().sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [lo, hi] of picked) {
    const last = merged[merged.length - 1];
    if (last && last[1] != null && lo <= last[1]) last[1] = hi == null || last[1] == null ? null : Math.max(last[1], hi);
    else if (!last || last[1] != null) merged.push([lo, hi]);
  }
  return merged.map(([lo, hi]) => (hi == null ? `${fmtK(lo)}+` : `${fmtK(lo)} - ${fmtK(hi)}`)).join(" / ");
}
