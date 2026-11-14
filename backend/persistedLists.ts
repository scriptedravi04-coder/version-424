// Session 52 (Ravi: "sab alag-alag tables se proper database managed hai na?"): two things a brand does
// on a creator's profile used to live ONLY in the server's memory (lost on every restart / new server):
//   • Save creator  → public.saved_creators   (brand_id, creator_id)
//   • Brand review  → public.creator_reviews  (the table + tier trigger already existed in Supabase)
// Both tables are server-only (RLS, no policies). Every helper returns null when the database can't
// answer, and the route then keeps the old in-memory behaviour, so nothing breaks if Supabase is down.

const rid = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** Save ↔ unsave. → { saved } or null. */
export async function toggleSavedCreator(c: any, brandId: string, creatorId: string): Promise<{ saved: boolean } | null> {
  if (!c || !brandId || !creatorId) return null;
  try {
    const { data, error } = await c.from("saved_creators").select("id").eq("brand_id", brandId).eq("creator_id", creatorId).limit(1);
    if (error) return null;
    if (data && data.length) {
      const { error: e2 } = await c.from("saved_creators").delete().eq("brand_id", brandId).eq("creator_id", creatorId);
      return e2 ? null : { saved: false };
    }
    const { error: e3 } = await c.from("saved_creators").insert({ id: rid("sav"), brand_id: brandId, creator_id: creatorId, created_at: new Date().toISOString() });
    if (e3 && String(e3.code) === "23505") return { saved: true }; // saved twice at once
    return e3 ? null : { saved: true };
  } catch { return null; }
}

/** Has this brand saved any of these creator ids? → true/false or null. */
export async function isCreatorSaved(c: any, brandId: string, creatorIds: any[]): Promise<boolean | null> {
  const ids = Array.from(new Set((creatorIds || []).filter(Boolean).map(String)));
  if (!c || !brandId || !ids.length) return null;
  try {
    const { data, error } = await c.from("saved_creators").select("id").eq("brand_id", brandId).in("creator_id", ids).limit(1);
    if (error) return null;
    return Boolean(data && data.length);
  } catch { return null; }
}

/** The review a brand writes on a creator's profile → a creator_reviews row. One star value is used for
 *  all three parts so the table's trigger keeps overall_rating = the stars the brand gave. */
export function reviewRow(review: any) {
  const r = Math.max(1, Math.min(5, Math.round(Number(review.rating) || 0)));
  return {
    creator_id: String(review.creator_id),
    brand_id: String(review.brand_id),
    communication_rating: r, timeliness_rating: r, quality_rating: r,
    review_text: String(review.comment || "").slice(0, 2000),
    created_at: review.created_at || new Date().toISOString(),
  };
}

export async function insertCreatorReview(c: any, review: any): Promise<boolean> {
  if (!c) return false;
  try {
    const { error } = await c.from("creator_reviews").insert(reviewRow(review));
    if (error) console.warn("[creator_reviews] insert:", error.message);
    return !error;
  } catch { return false; }
}

/** Reviews from the table, in the shape the profile screen already reads (rating, comment, brand_name…). */
export async function fetchCreatorReviewsFromTable(c: any, creatorId: string): Promise<any[] | null> {
  if (!c || !creatorId) return null;
  try {
    const { data, error } = await c.from("creator_reviews").select("*").eq("creator_id", String(creatorId))
      .order("created_at", { ascending: false }).limit(100);
    if (error) return null;
    const rows: any[] = data || [];
    // Session 58: reviews brands leave in the deal chat are saved to `reviews` (target = the creator). The profile only
    // read creator_reviews, so every creator showed "New on Ybex". Both are shown now.
    try {
      const { data: dealReviews } = await c.from("reviews").select("id, reviewer_id, target_id, rating, quality_rating, communication_rating, timeliness_rating, comment, created_at")
        .eq("target_id", String(creatorId)).neq("reviewer_id", String(creatorId)).order("created_at", { ascending: false }).limit(100);
      for (const r of dealReviews || []) {
        rows.push({ id: r.id, creator_id: creatorId, brand_id: r.reviewer_id, overall_rating: r.rating, quality_rating: r.quality_rating,
          communication_rating: r.communication_rating, timeliness_rating: r.timeliness_rating, review_text: r.comment || "", created_at: r.created_at });
      }
      rows.sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    } catch { /* deal reviews are optional */ }
    const brandIds = Array.from(new Set(rows.map((r: any) => String(r.brand_id)).filter(Boolean)));
    const names: Record<string, any> = {};
    if (brandIds.length) {
      try {
        const { data: users } = await c.from("users").select("user_id, name, picture").in("user_id", brandIds);
        for (const u of users || []) names[u.user_id] = u;
        const { data: brands } = await c.from("brand_profiles").select("user_id, company_name, logo").in("user_id", brandIds);
        for (const b of brands || []) names[b.user_id] = { ...(names[b.user_id] || {}), company_name: b.company_name, logo: b.logo };
      } catch { /* names are optional */ }
    }
    return rows.map((r: any) => {
      const b = names[r.brand_id] || {};
      return {
        id: r.id, creator_id: r.creator_id, creator_user_id: r.creator_id, brand_id: r.brand_id,
        brand_name: b.company_name || b.name || "Brand Partner", brand_avatar: b.logo || b.picture || "",
        rating: Number(r.overall_rating) || Number(r.quality_rating) || 5, overall_rating: r.overall_rating,
        communication_rating: r.communication_rating, timeliness_rating: r.timeliness_rating, quality_rating: r.quality_rating,
        comment: r.review_text || "", created_at: r.created_at,
      };
    });
  } catch { return null; }
}

/** Table rows first, then any in-memory ones not yet in the table (older servers), newest first. */
export function mergeReviews(fromTable: any[] | null, local: any[]) {
  if (!fromTable) return local;
  const key = (r: any) => `${r.brand_id}|${String(r.comment || "").trim()}|${Number(r.rating)}`;
  const have = new Set(fromTable.map(key));
  return [...fromTable, ...local.filter((r) => !have.has(key(r)))]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}
