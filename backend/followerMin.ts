import { ephemeralGet, ephemeralSet } from "./ephemeralStore";

// v397 (Ravi, 2 Nov 2026: "admin panel ke andar bhi option de de limit lagane ki"): the minimum Instagram followers a
// new creator needs. Admin → Platform Settings → Creator sign-up. Kept in the existing ybex_ephemeral table
// (key below, ~10 years), so no new table or column. 0 = no limit. Every server reads it through a 60 s cache.
export const DEFAULT_MIN_FOLLOWERS = 500;
export const MAX_MIN_FOLLOWERS = 100000;
const KEY = "setting:creator_min_followers";
const TEN_YEARS = 10 * 365 * 24 * 3600 * 1000;
let cache: { v: number; at: number } | null = null;

/** A number the admin typed → whole number 0–100,000, or null when it isn't one. Pure. */
export function cleanMinFollowers(raw: any): number | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const n = Number(String(raw).replace(/[,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > MAX_MIN_FOLLOWERS) return null;
  return Math.round(n);
}

export async function getMinFollowers(): Promise<number> {
  if (cache && Date.now() - cache.at < 60000) return cache.v;
  let v = DEFAULT_MIN_FOLLOWERS;
  try {
    const saved = await ephemeralGet(KEY);
    const n = cleanMinFollowers(saved?.min ?? saved);
    if (n !== null) v = n;
  } catch { /* keep the default */ }
  cache = { v, at: Date.now() };
  return v;
}

export async function setMinFollowers(min: number, by: string): Promise<void> {
  await ephemeralSet(KEY, { min, by, at: new Date().toISOString() }, TEN_YEARS);
  cache = { v: min, at: Date.now() };
}

export function _resetMinFollowersCache() { cache = null; }
