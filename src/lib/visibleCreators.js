// v286 (Ravi): one rule for "which creators may a brand see" — Explore, the dashboard's
// "Meet the Creators" and the creator panel's "Top creators" all use it. Only creators approved
// from the waitlist (profile_status "approved"), never deleted / test / developer-bypass accounts.
const nameOf = (c) => String(c?.full_name || c?.name || "").trim();

// v349: same rule as backend/exploreGate.ts isHiddenFromExplore.
export function isHiddenFromExplore(c) {
  const v = c?.hidden_from_explore;
  return v === true || v === 1 || String(v).toLowerCase() === "true";
}

// v357: same rule as backend/exploreGate.ts approvedByAdmin. The database marks a new profile "approved" by
// default, so a creator who only signed up (no admin review yet) must not count as approved.
export const EXPLORE_GATE_FROM = Date.parse("2026-10-10T00:00:00Z");
export function approvedByAdmin(c) {
  if (!c) return false;
  if (String(c.profile_status || "approved").toLowerCase() !== "approved") return false;
  if (c.reviewed_at) return true;
  if (c.is_claimed === false || String(c.creator_type || "").toLowerCase() === "unclaimed") return true;
  const created = Date.parse(c.created_at || c.inserted_at || "");
  if (!Number.isFinite(created) || created < EXPLORE_GATE_FROM) return true; // existing creators stay listed
  return false;
}

export function visibleCreators(list) {
  return (list || []).filter((c) => {
    if (!c || c.is_deleted) return false;
    // v349 (Ravi): admin "Hide from Explore & Meet the Creators" (creator_profiles.hidden_from_explore)
    if (isHiddenFromExplore(c)) return false;
    const st = String(c.profile_status || "approved").toLowerCase();
    if (st !== "approved") return false;
    if (!approvedByAdmin(c)) return false; // v357: waiting for the admin's review
    const n = nameOf(c).toLowerCase();
    if (n.length < 2 || n === "c" || n.startsWith("test")) return false;
    const h = String(c.instagram_handle || c.handle || "").toLowerCase();
    return !n.includes("developer bypass") && !h.includes("dev_bypass");
  });
}
