import express from "express";

export interface PublicCreatorRoutesDeps {
  supabase: any;
  privilegedSupabase: any;
  getDb: () => any;
  saveDb: (db: any) => void;
  parseAuthUser?: (req: express.Request) => Promise<any>;
}

/**
 * Session 36 (Ravi): both legacy routes are CLOSED.
 *
 * - POST /api/public/creators/apply used to create a "verified" creator profile straight away, with
 *   invented numbers (4.8% engagement, score 82) and no review. No page calls it any more; the real
 *   form is /apply → POST /api/public/creator-apply (creatorApplication.ts, rule 72: Pending waitlist row).
 * - POST /api/public/creators/bulk-import (admin only) filled missing fields with invented defaults
 *   (10,000 followers, ₹5,000, Mumbai, "verified"). Replaced by Admin → Waitlist → Upload CSV
 *   (POST /api/admin/waitlist/import-csv), which only creates Pending waitlist rows for review.
 */
export function setupPublicCreatorRoutes(
  _app: express.Application,
  router: express.Router,
  { parseAuthUser }: PublicCreatorRoutesDeps
) {
  router.post("/public/creators/apply", (_req, res) => {
    return res.status(410).json({
      error: "This form has moved — please apply at ybexmedia.in/apply",
      moved_to: "/apply",
    });
  });

  router.post("/public/creators/bulk-import", async (req, res) => {
    const actor = parseAuthUser ? await parseAuthUser(req) : null;
    if (!actor || !(["admin", "sub_admin"].includes(String(actor.role)) || actor.team_role === "sub_admin")) {
      return res.status(403).json({ error: "Admin privileges required." });
    }
    return res.status(410).json({
      error: "Bulk import was replaced by Admin → Waitlist → Upload CSV (rows go to review, nothing is invented).",
      moved_to: "/api/admin/waitlist/import-csv",
    });
  });
}
