// Session 38 (Ravi: "fake views vale rehne do ... only creators dekh paye, brands nahi").
// Creators keep the generated views / "applied" numbers and faces (utils/campaignStats.js,
// locked). Brands, agencies and admins see only real numbers and real applicant photos.
import { getCampaignStats, getCampaignAvatars } from "./campaignStats";

const REAL_ONLY_ROLES = ["brand", "talent_manager", "agency", "admin", "sub_admin"];

export function seesRealCampaignStats(user) {
  const role = String(user?.role || "").toLowerCase();
  return REAL_ONLY_ROLES.includes(role) || String(user?.team_role || "").toLowerCase() === "sub_admin";
}

/** Real applicant count from whatever the server sent. */
export function realAppliedCount(c) {
  if (Array.isArray(c?.applicants)) return c.applicants.length;
  const n = Number(c?.applications_count ?? c?.applicants_count ?? c?.application_count);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Real view count if the server tracks one; null = don't show a number. */
export function realViewCount(c) {
  const n = Number(c?.view_count ?? c?.views_count ?? c?.real_views);
  return Number.isFinite(n) && n >= 0 && (c?.view_count != null || c?.views_count != null || c?.real_views != null) ? n : null;
}

export function campaignStatsFor(c, user) {
  if (!seesRealCampaignStats(user)) return getCampaignStats(c);
  return { views: realViewCount(c), applied: realAppliedCount(c) };
}

/** Faces next to "N applied": generated ones for creators, only real photos for everyone else. */
export function campaignAvatarsFor(c, count, user) {
  if (!seesRealCampaignStats(user)) return getCampaignAvatars(c, count);
  return (Array.isArray(c?.applicants) ? c.applicants : [])
    .map((a) => a?.creator_photo || a?.photo || a?.profile_photo_url || a?.avatar_url)
    .filter(Boolean)
    .slice(0, 4);
}
