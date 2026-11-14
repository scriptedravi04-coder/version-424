import express from "express";
import crypto from "crypto"; // v414: notification ids
import { isBrandLike } from "./roleGuards"; // v417: delete draft

// Session 30 (Ravi: "inka backend bhi bana do"): the campaign actions from the brand mobile design
// (MG-05 / MG-06) that had no server side yet. New file — the locked campaign logic
// (campaigns_routes.ts) is NOT edited. The apply guard runs BEFORE the locked apply route and only
// adds a refusal for paused / closed campaigns; everything else falls through unchanged.
//
// WHO: only the brand that owns the campaign (or its acting team member), or an admin.
// WHEN: every change stamps *_at + *_by on the campaign row.
// DB: needs two columns — scripts/sql/session30_campaign_manage.sql (Ravi runs it in Supabase).

export const CLOSED_STATUS = "completed"; // the same token the brand's "Completed" tab reads

export function applyBlockReason(c: any): string | null {
  if (!c) return null;
  if (String(c.status || "").toLowerCase() === CLOSED_STATUS || c.closed_at) return "This campaign is closed and no longer takes applications.";
  if (c.applications_paused) return "The brand has paused new applications for this campaign.";
  return null;
}

/** Session 58: only a live campaign before its deadline (+1 day grace) takes applications. Drafts, campaigns under
 *  review / rejected, and expired ones were still accepting applies through the API and on desktop. */
export function applyOpenReason(c: any, now = Date.now()): string | null {
  if (!c) return null;
  const st = String(c.status || "").toLowerCase();
  if (st && !["live", "approved", "active"].includes(st)) return "This campaign isn't open for applications right now.";
  const dl = c.deadline ? Date.parse(c.deadline) : NaN;
  if (Number.isFinite(dl) && dl + 24 * 3600 * 1000 < now) return "The deadline for this campaign has passed.";
  return null;
}

const norm = (v: any): string[] => {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  return arr.map((x: any) => String(x || "").trim().toLowerCase()).filter(Boolean);
};

/** Creators whose categories overlap the campaign's. Pure, for tests. */
export function countMatchingCreators(campaign: any, creators: any[]): number {
  const want = new Set([...norm(campaign?.categories), ...norm(campaign?.niche), ...norm(campaign?.category)]);
  if (!want.size) return 0;
  // Session 58: match on words too — a "Fashion & Style" campaign matches "Fashion" creators.
  const STOP = new Set(["and", "the", "for", "style", "other", "general"]);
  const words = (arr: string[]) => arr.flatMap((x) => x.split(/[^a-z0-9]+/)).filter((w) => w.length >= 3 && !STOP.has(w));
  const wantWords = new Set(words([...want]));
  return (creators || []).filter((p) => {
    if (p?.is_deleted === true) return false;
    const have = [...norm(p.categories), ...norm(p.niche), ...norm(p.category)];
    return have.some((h) => want.has(h)) || words(have).some((w) => wantWords.has(w));
  }).length;
}

const missingColumn = (err: any) => /column .* does not exist|could not find the .* column/i.test(String(err?.message || ""));

export function setupCampaignManageRoutes(
  router: express.Router,
  { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, getActingBrandId }: {
    supabase: any; privilegedSupabase: any; getDb: () => any; saveDb: (db?: any) => void;
    parseAuthUser: (req: any) => Promise<any>; getActingBrandId: (u: any) => string;
  }
) {
  const client = () => privilegedSupabase || supabase;

  async function loadOwned(req: any, res: any) {
    const user = await parseAuthUser(req);
    if (!user) { res.status(403).json({ detail: "Not authenticated" }); return null; }
    const id = String(req.params.id || "");
    let camp: any = null;
    if (client()) {
      const { data } = await client().from("campaigns").select("*").eq("campaign_id", id).maybeSingle();
      camp = data;
    } else {
      camp = (getDb()?.campaigns || []).find((c: any) => String(c.campaign_id) === id) || null;
    }
    if (!camp) { res.status(404).json({ error: "Campaign not found" }); return null; }
    const isAdmin = String(user.role || "").toLowerCase() === "admin";
    if (!isAdmin && String(camp.brand_user_id) !== String(getActingBrandId(user))) {
      res.status(403).json({ error: "Only the brand that owns this campaign can change it." });
      return null;
    }
    return { user, camp, id };
  }

  async function write(id: string, patch: any, res: any) {
    if (client()) {
      const { data, error } = await client().from("campaigns").update(patch).eq("campaign_id", id).select("*").maybeSingle();
      if (error) {
        if (missingColumn(error)) {
          res.status(503).json({ error: "This action needs a one-time database update. Please contact support.", code: "SETUP_NEEDED" });
        } else {
          res.status(500).json({ error: error.message || "Could not update the campaign." });
        }
        return null;
      }
      return data;
    }
    const db = getDb();
    const c = (db.campaigns || []).find((x: any) => String(x.campaign_id) === id);
    Object.assign(c, patch);
    saveDb(db);
    return c;
  }

  // Pause / resume new applications. Existing applicants and deals are not touched.
  router.post("/campaigns/:id/applications-paused", async (req: any, res: any) => {
    const ctx = await loadOwned(req, res);
    if (!ctx) return;
    if (applyBlockReason({ ...ctx.camp, applications_paused: false })) {
      return res.status(409).json({ error: "This campaign is closed." });
    }
    const paused = Boolean(req.body?.paused);
    const now = new Date().toISOString();
    const row = await write(ctx.id, { applications_paused: paused, applications_paused_at: paused ? now : null, applications_paused_by: paused ? ctx.user.user_id : null }, res);
    if (!row) return;
    return res.json({ ok: true, campaign: row, applications_paused: paused });
  });

  // Close: no new pitches; hired creators keep their deals (deals are not touched here).
  router.post("/campaigns/:id/close", async (req: any, res: any) => {
    const ctx = await loadOwned(req, res);
    if (!ctx) return;
    if (String(ctx.camp.status || "").toLowerCase() === "draft") {
      return res.status(409).json({ error: "A draft is not live — delete or edit it instead." });
    }
    const row = await write(ctx.id, { status: CLOSED_STATUS, closed_at: new Date().toISOString(), closed_by: ctx.user.user_id }, res);
    if (!row) return;
    // v414: applications still waiting are closed too (REJECTED, the status a "no" already uses) and those creators told.
    let closedApplications = 0;
    try {
      const reason = "Campaign closed by the brand";
      const title = ctx.camp.title ? `"${ctx.camp.title}"` : "A campaign you applied to";
      if (client()) {
        const { data: moved } = await client()
          .from("campaign_applications")
          .update({ status: "REJECTED", rejection_reason: reason })
          .eq("campaign_id", ctx.id)
          .or("status.is.null,status.eq.PENDING")
          .select("application_id, creator_id");
        const list = Array.isArray(moved) ? moved : [];
        closedApplications = list.length;
        const ids = [...new Set(list.map((a: any) => a.creator_id).filter(Boolean))];
        if (ids.length) {
          await client().from("notifications").insert(ids.map((uid) => ({
            notif_id: crypto.randomUUID(), user_id: uid, type: "application_rejected",
            message: `Campaign closed — ${title} is no longer hiring, so your application was closed.`
          })));
        }
      } else {
        const db = getDb();
        for (const a of (db?.campaign_applications || [])) {
          if (String(a.campaign_id) === ctx.id && (!a.status || String(a.status).toUpperCase() === "PENDING")) {
            a.status = "REJECTED"; a.rejection_reason = reason; closedApplications++;
          }
        }
        saveDb(db);
      }
    } catch (e: any) {
      console.error("[campaign close] could not close pending applications:", e?.message || e);
    }
    return res.json({ ok: true, campaign: row, closed_applications: closedApplications });
  });

  // v417: delete a DRAFT campaign. Only the owner brand (or its team member / old rows saved under the member) or an admin.
  // campaigns has no soft-delete / archived status, so the row is removed. 409 when it isn't a draft or already has deals;
  // leftover applications of the draft (normally none — drafts take no applies) are removed first.
  router.delete("/campaigns/:id", async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ error: "Not authenticated", detail: "Not authenticated" });
    const id = String(req.params.id || "");
    let camp: any = null;
    if (client()) {
      const { data, error } = await client().from("campaigns").select("*").eq("campaign_id", id).maybeSingle();
      if (error) return res.status(500).json({ error: "Could not delete the draft. Please try again." });
      camp = data;
    }
    const db = getDb() || {};
    const local = (db.campaigns || []).find((c: any) => String(c.campaign_id) === id) || null;
    camp = camp || local;
    if (!camp) return res.status(404).json({ error: "Draft not found", detail: "Draft not found" });
    const isAdmin = String(user.role || "").toLowerCase() === "admin";
    const owner = String(camp.brand_user_id || "");
    const mine = owner && (owner === String(getActingBrandId(user)) || owner === String(user.user_id));
    if (!isAdmin && !(mine && (isBrandLike(user.role) || user.parent_brand_id))) {
      return res.status(403).json({ error: "Only the brand that owns this draft can delete it.", detail: "Only the brand that owns this draft can delete it.", code: "NOT_OWNER" });
    }
    if (String(camp.status || "").toLowerCase() !== "draft") {
      return res.status(409).json({ error: "Only drafts can be deleted. Close the campaign instead.", detail: "Only drafts can be deleted. Close the campaign instead.", code: "NOT_A_DRAFT" });
    }
    if (client()) {
      const { count } = await client().from("deals").select("id", { count: "exact", head: true }).eq("campaign_id", id);
      if (Number(count) > 0) return res.status(409).json({ error: "This campaign already has deals, so it can't be deleted.", detail: "This campaign already has deals, so it can't be deleted.", code: "HAS_DEALS" });
      const { error: appErr } = await client().from("campaign_applications").delete().eq("campaign_id", id);
      if (appErr) console.warn("[campaign delete] applications:", appErr.message || appErr);
      const { error } = await client().from("campaigns").delete().eq("campaign_id", id).eq("status", camp.status);
      if (error) return res.status(500).json({ error: "Could not delete the draft. Please try again.", detail: error.message || "" });
    } else if ((db.deals || []).some((d: any) => String(d.campaign_id) === id)) {
      return res.status(409).json({ error: "This campaign already has deals, so it can't be deleted.", detail: "This campaign already has deals, so it can't be deleted.", code: "HAS_DEALS" });
    }
    if (Array.isArray(db.campaigns)) db.campaigns = db.campaigns.filter((c: any) => String(c.campaign_id) !== id);
    if (Array.isArray(db.campaign_applications)) db.campaign_applications = db.campaign_applications.filter((a: any) => String(a.campaign_id) !== id);
    saveDb(db);
    return res.json({ ok: true });
  });

  // "N creators match this brief" — category overlap with creator profiles. Count only, no names.
  router.get("/campaigns/:id/matching-creators", async (req: any, res: any) => {
    const ctx = await loadOwned(req, res);
    if (!ctx) return;
    let creators: any[] = [];
    if (client()) {
      const { data, error } = await client().from("creator_profiles").select("user_id, categories, niche, category, is_deleted").range(0, 9999);
      if (error) return res.status(500).json({ error: "Could not count creators." });
      creators = data || [];
    } else {
      creators = getDb()?.creator_profiles || [];
    }
    return res.json({ count: countMatchingCreators(ctx.camp, creators), categories: norm(ctx.camp.categories) });
  });

  // Guard in front of the locked apply route: refuse paused / closed campaigns, else continue.
  router.post("/campaigns/apply", async (req: any, res: any, next: any) => {
    try {
      const id = String(req.body?.campaign_id || "");
      if (!id) return next();
      let camp: any = null;
      if (client()) {
        const { data, error } = await client().from("campaigns").select("*").eq("campaign_id", id).maybeSingle();
        if (error) return next(); // never block applying because this check failed
        camp = data;
      } else {
        camp = (getDb()?.campaigns || []).find((c: any) => String(c.campaign_id) === id);
      }
      const why = applyBlockReason(camp) || applyOpenReason(camp);
      if (why) return res.status(409).json({ error: why, detail: why, code: "APPLICATIONS_CLOSED" });
      // Session 58: only creators apply, and never to their own campaign.
      const user = parseAuthUser ? await parseAuthUser(req).catch(() => null) : null;
      if (user && String(user.role || "").toLowerCase() !== "creator") return res.status(403).json({ error: "Only creators can apply to campaigns.", detail: "Only creators can apply to campaigns." });
      if (user && camp && String(camp.brand_user_id || "") === String(user.user_id || "")) return res.status(403).json({ error: "You can't apply to your own campaign.", detail: "You can't apply to your own campaign." });
      return next();
    } catch {
      return next();
    }
  });
}
