// Session 24. Numbers for the creator card the brand sees after a claim (rating, completed
// orders, on-time %). Only real data: every figure is null when there is nothing to base it on,
// and the card then says "New on Ybex" instead of showing 0 stars or 0%.
import express from "express";
import { getCreatorKycStatus } from "./creatorKyc";
import { UGC_COUNTS_AS_LATE_REASONS } from "./statusTokens";

const DONE = ["COMPLETED", "APPROVED", "PAID", "RELEASED"];

export type CreatorUgcStats = {
  creator_id: string;
  kyc_verified: boolean;
  completed_orders: number;
  on_time_pct: number | null;
  on_time_sample: number;
  rating_avg: number | null;
  rating_count: number;
};

/**
 * On time = the first draft arrived by the order's deadline. `delivered_at` is overwritten by
 * later revisions, so only orders with no revision count (a late revision is not a late draft).
 * An order the system expired for a missed deadline counts as late, and so does a creator who
 * cancelled a signed order (except within the 1-hour grace — expiry_reason tells them apart).
 */
export function computeCreatorStats(creatorId: string, orders: any[], reviews: any[], kycVerified: boolean): CreatorUgcStats {
  const mine = (orders || []).filter((o) => o && o.creator_id === creatorId);
  const completed = mine.filter((o) =>
    DONE.includes(String(o.status || "").toUpperCase()) || ["RELEASED", "PAID"].includes(String(o.payment_status || "").toUpperCase())
  ).length;

  let onTime = 0;
  let sample = 0;
  for (const o of mine) {
    if (String(o.status || "").toUpperCase() === "EXPIRED" || UGC_COUNTS_AS_LATE_REASONS.includes(o.expiry_reason)) { sample++; continue; }
    // A grace-period / never-signed cancel is not an order the creator worked on: skip it.
    if (String(o.status || "").toUpperCase() === "CANCELLED") continue;
    if (Number(o.revisions_used || 0) > 0) continue;
    const due = Date.parse(o.internal_deadline || "");
    const got = Date.parse(o.delivered_at || "");
    if (!due || !got) continue;
    sample++;
    if (got <= due) onTime++;
  }

  const ratings = (reviews || [])
    .filter((r) => r && (r.target_id === creatorId || r.creator_id === creatorId) && r.reviewer_id !== creatorId)
    .map((r) => Number(r.rating))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);

  return {
    creator_id: creatorId,
    kyc_verified: kycVerified,
    completed_orders: completed,
    on_time_pct: sample > 0 ? Math.round((onTime / sample) * 100) : null,
    on_time_sample: sample,
    rating_avg: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    rating_count: ratings.length,
  };
}

export function setupCreatorStatsRoutes(
  router: express.Router,
  { supabase, privilegedSupabase, getDb, parseAuthUser }: { supabase: any; privilegedSupabase: any; getDb: () => any; parseAuthUser: (req: any) => Promise<any> }
) {
  router.get("/creators/:id/ugc-stats", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const creatorId = String(req.params.id || "");
    if (!creatorId) return res.status(400).json({ error: "creator id is required" });

    const db = getDb();
    const client = privilegedSupabase || supabase;
    let orders: any[] = (db.ugc_orders || []).filter((o: any) => o.creator_id === creatorId);
    let reviews: any[] = [];
    if (client) {
      try {
        const cols = "id, creator_id, status, payment_status, internal_deadline, delivered_at, revisions_used";
        let { data, error } = await client.from("ugc_orders").select(`${cols}, expiry_reason`).eq("creator_id", creatorId);
        // Before scripts/sql/ugc_deadlines_relist_refunds.sql runs there is no expiry_reason column.
        if (error) ({ data } = await client.from("ugc_orders").select(cols).eq("creator_id", creatorId));
        if (Array.isArray(data)) {
          const byId = new Map(orders.map((o: any) => [o.id, o]));
          data.forEach((o: any) => byId.set(o.id, { ...(byId.get(o.id) || {}), ...o }));
          orders = Array.from(byId.values());
        }
      } catch (e: any) { console.warn("[ugc-stats] orders:", e?.message || e); }
      try {
        const { data } = await client.from("reviews").select("rating, target_id, reviewer_id").eq("target_id", creatorId);
        if (Array.isArray(data)) reviews = data;
      } catch (e: any) { console.warn("[ugc-stats] reviews:", e?.message || e); }
    }
    const kyc = await getCreatorKycStatus(client, db, creatorId);
    return res.json(computeCreatorStats(creatorId, orders, reviews, kyc === "APPROVED"));
  });
}
