import express from "express";

// Session 43 (v289, Ravi): promo popup when the app opens — three layouts, all just the designer's
// poster: the whole poster is tappable (opens link_url), a ✕ closes it, no extra button.
// Table: scripts/sql/session43_promos.sql (promo_popups).
//
//   GET    /promos/active                 → the one live promo for me (role / guest), or { promo: null }
//   POST   /promos/:id/event {type}       → "view" | "click" counter
//   GET    /admin/promos                  → list (admin)
//   POST   /admin/promos                  → create / edit (id in body = edit)
//   DELETE /admin/promos/:id

export const LAYOUTS = ["fullscreen", "card", "sheet", "banner"] as const; // banner = My Profile strip (v290)
export const AUDIENCES = ["all", "creator", "brand", "guest"] as const;
export const FREQUENCIES = ["once", "daily", "every_open"] as const;
/** Poster sizes shown to the admin / designer (px). Text should stay inside the safe area. */
export const POSTER_SIZES: Record<string, { w: number; h: number; safe: string }> = {
  fullscreen: { w: 1080, h: 2340, safe: "keep text and faces inside the middle 1080 × 1920" },
  card: { w: 960, h: 1400, safe: "keep 40 px clear on every side (corners are rounded)" },
  sheet: { w: 1080, h: 1200, safe: "keep the top 120 px for the ✕ and the rounded top" },
  banner: { w: 1080, h: 200, safe: "keep text 40 px away from the left / right edges (rounded corners)" },
};

const isAdmin = (u: any) => Boolean(u && (u.role === "admin" || u.is_admin === true));
const okLink = (v: string) => v === "" || /^\/[\w\-/?=&#.%]*$/.test(v) || /^https:\/\/[^\s]+$/.test(v);
const okImage = (v: string) => /^https:\/\/[^\s]+$/.test(v) || /^\/api\/files\/[\w-]+$/.test(v);

/** v348: a link copied from the web app (https://ybexapp.ai.studio/refer, ybexmedia.in/…) becomes the app
 *  page "/refer", so it opens inside the installed app instead of a browser. Other links stay as they are. */
export function appPath(v: string): string {
  const m = /^https?:\/\/(?:www\.)?(?:ybexapp\.ai\.studio|ybexmedia\.in)(\/[^\s]*)?$/i.exec(String(v || "").trim());
  if (!m) return v;
  return m[1] && m[1] !== "/" ? m[1] : "/dashboard";
}

export function cleanPromo(body: any): { item?: any; error?: string } {
  const b = body || {};
  const image_url = String(b.image_url || "").trim();
  if (!okImage(image_url)) return { error: "Upload the poster image first." };
  const link_url = appPath(String(b.link_url || "").trim());
  if (!okLink(link_url)) return { error: "Link must be an app page like /refer or a full https:// address." };
  const layout = (LAYOUTS as readonly string[]).includes(b.layout) ? b.layout : "fullscreen";
  const audience = (AUDIENCES as readonly string[]).includes(b.audience) ? b.audience : "all";
  const frequency = (FREQUENCIES as readonly string[]).includes(b.frequency) ? b.frequency : "once";
  const date = (v: any) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? undefined : d.toISOString(); };
  const starts_at = date(b.starts_at), ends_at = date(b.ends_at);
  if (starts_at === undefined || ends_at === undefined) return { error: "Check the start / end date." };
  if (starts_at && ends_at && ends_at <= starts_at) return { error: "End must be after start." };
  return {
    item: {
      ...(b.id ? { id: String(b.id) } : {}),
      title: String(b.title || "").trim().slice(0, 80), layout, image_url, link_url, audience, frequency,
      starts_at, ends_at, is_active: Boolean(b.is_active), priority: Math.max(-100, Math.min(100, Math.round(Number(b.priority) || 0))),
    },
  };
}

/** The promo a person sees now: live, in its dates, for their group; highest priority, newest first. */
export function pickPromo(rows: any[], who: "creator" | "brand" | "guest" | "other", now = Date.now(), kind: "popup" | "banner" = "popup") {
  return livePromos(rows, who, now, kind)[0] || null;
}

/** v348: every live promo for this person, best first (priority, then newest). The phone picks the first
 *  one that is due (a "once" popup already seen no longer blocks the next one) and takes turns between
 *  popups with the same top priority, so a new popup no longer hides an older one for good. */
export function livePromos(rows: any[], who: "creator" | "brand" | "guest" | "other", now = Date.now(), kind: "popup" | "banner" = "popup") {
  const live = (rows || []).filter((p) => {
    if (!p || !p.is_active || !p.image_url) return false;
    if ((p.layout === "banner") !== (kind === "banner")) return false;
    if (p.starts_at && new Date(p.starts_at).getTime() > now) return false;
    if (p.ends_at && new Date(p.ends_at).getTime() <= now) return false;
    if (p.audience === "all") return who !== "other";
    return p.audience === who;
  });
  live.sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return live;
}

export function setupPromoRoutes(
  router: express.Router,
  { supabase, privilegedSupabase, parseAuthUser }: { supabase: any; privilegedSupabase: any; parseAuthUser: (req: express.Request) => Promise<any> }
) {
  const sb = () => privilegedSupabase || supabase;
  let cache: { at: number; rows: any[] } | null = null;
  const loadLive = async () => {
    // Session 48: 10 s (was 30 s) — each server copy keeps its own cache, so a new popup could wait 30 s
    // on a copy that did not handle the admin's save.
    if (cache && Date.now() - cache.at < 10000) return cache.rows;
    const { data, error } = await sb().from("promo_popups").select("*").eq("is_active", true).limit(50);
    if (error) throw error;
    cache = { at: Date.now(), rows: data || [] };
    return cache.rows;
  };

  router.get("/promos/active", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!sb()) return res.json({ promo: null });
    try {
      const user = await parseAuthUser(req).catch(() => null);
      const who = !user ? "guest" : user.role === "creator" ? "creator" : user.role === "brand" ? "brand" : "other";
      const list = livePromos(await loadLive(), who as any).slice(0, 8)
        .map((p: any) => ({ id: p.id, layout: p.layout, image_url: p.image_url, link_url: p.link_url || "", frequency: p.frequency, updated_at: p.updated_at, priority: Number(p.priority) || 0 }));
      return res.json({ promo: list[0] || null, promos: list }); // v348: the whole list (old apps read `promo`)
    } catch {
      return res.json({ promo: null }); // table not created yet → nothing to show
    }
  });

  // v290 (Ravi): the small banner under the photo on My Profile (creator + brand). None live → null.
  router.get("/promos/banner", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!sb()) return res.json({ banner: null });
    try {
      const user = await parseAuthUser(req).catch(() => null);
      const who = user?.role === "creator" ? "creator" : user?.role === "brand" ? "brand" : "other";
      const p = pickPromo(await loadLive(), who as any, Date.now(), "banner");
      return res.json({ banner: p ? { id: p.id, image_url: p.image_url, link_url: p.link_url || "" } : null });
    } catch { return res.json({ banner: null }); }
  });

  router.post("/promos/:id/event", async (req, res) => {
    // v344: counters only from signed-in users (PromoPopup/ProfileBanner only run for them)
    const user = await parseAuthUser(req).catch(() => null);
    if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });
    const field = req.body?.type === "click" ? "clicks" : req.body?.type === "view" ? "views" : null;
    if (!field || !sb() || !/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.json({ ok: false });
    try { await sb().rpc("promo_popups_bump", { p_id: req.params.id, p_field: field }); } catch { /* counters are best-effort */ }
    return res.json({ ok: true });
  });

  router.get("/admin/promos", async (req, res) => {
    if (!isAdmin(await parseAuthUser(req))) return res.status(403).json({ detail: "Admin only", _status: 403 });
    if (!sb()) return res.json({ items: [], sizes: POSTER_SIZES });
    const { data, error } = await sb().from("promo_popups").select("*").order("created_at", { ascending: false });
    if (error) return res.status(503).json({ error: "The promo_popups table is missing — run scripts/sql/session43_promos.sql.", sizes: POSTER_SIZES });
    return res.json({ items: data || [], sizes: POSTER_SIZES });
  });

  router.post("/admin/promos", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    const { item, error } = cleanPromo(req.body);
    if (error) return res.status(400).json({ error });
    if (!sb()) return res.status(503).json({ error: "Database not connected." });
    const row = { ...item, updated_at: new Date().toISOString(), ...(item.id ? {} : { created_by: String(user.user_id) }) };
    const { data, error: e } = await sb().from("promo_popups").upsert(row, { onConflict: "id" }).select().maybeSingle();
    if (e) return res.status(503).json({ error: /does not exist|relation/i.test(e.message) ? "The promo_popups table is missing — run scripts/sql/session43_promos.sql." : "Could not save." });
    cache = null;
    return res.json({ item: data });
  });

  router.delete("/admin/promos/:id", async (req, res) => {
    if (!isAdmin(await parseAuthUser(req))) return res.status(403).json({ detail: "Admin only", _status: 403 });
    if (!sb()) return res.status(503).json({ error: "Database not connected." });
    const { error } = await sb().from("promo_popups").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: "Could not delete." });
    cache = null;
    return res.json({ ok: true });
  });
}
