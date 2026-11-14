import { isAdminStaff } from "./authSecurity";
import express from "express";
import crypto from "crypto";

const getIsoNow = () => new Date().toISOString();

// Admin-managed marketing/content surfaces: dashboard banners (backs
// BannerManager.jsx), and the public landing page's brand-logo strip +
// testimonial reviews (each has a public GET + admin-only POST/DELETE).
// v391 (speed QA): the landing page's two public lists are read by every visitor. Keep the answer for 45 s in memory
// (any admin save / delete clears it at once) so a busy hour is not one Supabase query per visitor.
const publicListCache = new Map<string, { at: number; body: any }>();
const PUBLIC_LIST_TTL_MS = 45_000;
export function clearPublicListCache() { publicListCache.clear(); }

export function setupAdminContentRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    processBase64Image,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    processBase64Image?: (imgUrl: string, bucket: string, user_id: string) => Promise<any>;
  }
) {
  // Session 31 (Ravi): banner pictures were saved as base64 text inside banners.image_url and sent
  // with every dashboard load. New and edited banners now go to the 'banners' Storage bucket (made
  // small on the way — backend/imageResize.ts); only the link is kept in the table.
  const isDataImage = (v: any) => typeof v === "string" && v.startsWith("data:image/");
  const storeBannerImage = async (imgUrl: any): Promise<string> => {
    if (!isDataImage(imgUrl)) return imgUrl;
    if (!processBase64Image) throw new Error("Image storage is not set up on the server.");
    const url = await processBase64Image(imgUrl, "banners", "banners");
    if (!url || isDataImage(url)) throw new Error("The banner picture could not be stored. Please try again.");
    return url;
  };

  // Session 25: FAQ articles. The admin page wrote faq_articles straight from the browser with
  // the public key — either RLS refused it silently (toast said "saved") or, with an open
  // policy, anyone could edit the help centre. Admin-only, server-side, service role.
  const FAQ_FIELDS = ["title", "content", "category", "target_role", "is_active"];
  const pickFaq = (b: any) => {
    const out: any = {};
    for (const k of FAQ_FIELDS) if (b && b[k] !== undefined) out[k] = b[k];
    return out;
  };
  const faqAdmin = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user || !["admin", "sub_admin"].includes(String(user.role || "").toLowerCase())) {
      res.status(403).json({ error: "Admins only" });
      return null;
    }
    if (!privilegedSupabase) {
      res.status(503).json({ error: "The server is not using the Supabase service key (SUPABASE_SERVICE_ROLE_KEY)." });
      return null;
    }
    return user;
  };
  // v419 admin cleanup: removed unused POST /admin/faq (no screen used it)
  // v419 admin cleanup: removed unused PUT /admin/faq/:id
  // v419 admin cleanup: removed unused DELETE /admin/faq/:id

  // Helper to map DB row to Admin UI format
  const mapDbToAdminBanner = (b: any) => ({
    id: b.id,
    type: b.target_dashboard === 'all' ? 'Common' : (b.target_dashboard === 'brand' ? 'Brand' : 'Influencer'),
    placement: 'Dashboard Hero Carousel', // default for now
    link: b.link_url || "",
    status: b.active ? "Live" : "Draft",
    imgUrl: b.image_url,
    start_date: b.start_date,
    end_date: b.end_date,
    created_at: b.created_at,
    created_by: b.created_by
  });

  router.get("/admin/banners", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || !isAdminStaff(user)) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    
    if (privilegedSupabase || supabase) {
      try {
        const { data, error } = await (privilegedSupabase || supabase).from('banners').select('*').order('created_at', { ascending: false });
        if (!error && data) {
          return res.json(data.map(mapDbToAdminBanner));
        }
      } catch (e) { console.error("Error fetching admin banners from Supabase:", e); }
    }
    
    const db = getDb();
    res.json(db.banners || []);
  });

  router.post("/admin/banners", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || !isAdminStaff(user)) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    const { type, placement, link, status, start_date, end_date } = req.body || {};
    if (!req.body?.imgUrl) return res.status(400).json({ error: "imgUrl is required" });
    let imgUrl: string;
    try { imgUrl = await storeBannerImage(req.body.imgUrl); }
    catch (e: any) { return res.status(500).json({ error: e?.message || "The banner picture could not be stored." }); }

    const newBanner = {
      id: crypto.randomUUID(),
      target_dashboard: type === 'Common' ? 'all' : (type === 'Brand' ? 'brand' : 'creator'),
      link_url: link || null,
      active: status === 'Live',
      image_url: imgUrl,
      start_date: start_date || null,
      end_date: end_date || null,
      created_at: getIsoNow(),
      created_by: user.user_id || user.id
    };

    if (privilegedSupabase || supabase) {
      try {
        const { data, error } = await (privilegedSupabase || supabase).from('banners').insert(newBanner).select();
        if (!error && data && data[0]) {
          return res.json(mapDbToAdminBanner(data[0]));
        } else {
          console.error("Supabase insert banner error:", error);
        }
      } catch (e) { console.error("Exception inserting banner:", e); }
    }

    const db = getDb();
    db.banners = db.banners || [];
    const localBanner = {
      id: newBanner.id,
      type: type || "Influencer",
      placement: placement || "Dashboard Hero Carousel",
      link: link || "",
      status: status || "Live",
      imgUrl,
      start_date: start_date || null,
      end_date: end_date || null,
      created_at: newBanner.created_at,
      created_by: newBanner.created_by
    };
    db.banners.push(localBanner);
    saveDb(db);
    res.json(localBanner);
  });

  router.put("/admin/banners/:id", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || !isAdminStaff(user)) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    const { id } = req.params;
    const { type, placement, link, status, start_date, end_date } = req.body || {};
    let imgUrl = req.body?.imgUrl;
    if (imgUrl !== undefined) {
      try { imgUrl = await storeBannerImage(imgUrl); }
      catch (e: any) { return res.status(500).json({ error: e?.message || "The banner picture could not be stored." }); }
    }

    let updateData: any = {};
    if (type !== undefined) updateData.target_dashboard = type === 'Common' ? 'all' : (type === 'Brand' ? 'brand' : 'creator');
    if (link !== undefined) updateData.link_url = link || null;
    if (status !== undefined) updateData.active = status === 'Live';
    if (imgUrl !== undefined) updateData.image_url = imgUrl;
    if (start_date !== undefined) updateData.start_date = start_date || null;
    if (end_date !== undefined) updateData.end_date = end_date || null;

    if (privilegedSupabase || supabase) {
      try {
        const { data, error } = await (privilegedSupabase || supabase).from('banners').update(updateData).eq('id', id).select();
        if (!error && data && data[0]) {
          return res.json(mapDbToAdminBanner(data[0]));
        }
      } catch (e) { console.error("Exception updating banner:", e); }
    }

    const db = getDb();
    db.banners = db.banners || [];
    const banner = db.banners.find((b: any) => b.id === id);
    if (!banner) return res.status(404).json({ error: "Banner not found" });

    if (type !== undefined) banner.type = type;
    if (placement !== undefined) banner.placement = placement;
    if (link !== undefined) banner.link = link;
    if (status !== undefined) banner.status = status;
    if (imgUrl !== undefined) banner.imgUrl = imgUrl;
    if (start_date !== undefined) banner.start_date = start_date;
    if (end_date !== undefined) banner.end_date = end_date;

    saveDb(db);
    res.json(banner);
  });

  router.delete("/admin/banners/:id", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || !isAdminStaff(user)) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    const { id } = req.params;

    if (privilegedSupabase || supabase) {
      try {
        const { error } = await (privilegedSupabase || supabase).from('banners').delete().eq('id', id);
        console.log("Delete banner error:", error);
      } catch (e) { console.error("Exception deleting banner:", e); }
    }

    const db = getDb();
    db.banners = db.banners || [];
    const before = db.banners.length;
    db.banners = db.banners.filter((b: any) => b.id !== id);
    if (db.banners.length !== before) {
      saveDb(db);
    }
    res.json({ ok: true });
  });

  // One-time move: banners whose picture is still base64 text → Storage. Safe to press again.
  router.post("/admin/banners/move-to-storage", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || !isAdminStaff(user)) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    const client = privilegedSupabase;
    if (!client) return res.status(503).json({ error: "The server is not using the Supabase service key." });
    const { data, error } = await client.from("banners").select("id, image_url").like("image_url", "data:image/%");
    if (error) return res.status(500).json({ error: error.message });
    const result = { found: (data || []).length, moved: 0, failed: [] as string[] };
    for (const row of data || []) {
      try {
        const url = await storeBannerImage(row.image_url);
        const { error: upErr } = await client.from("banners").update({ image_url: url }).eq("id", row.id);
        if (upErr) throw new Error(upErr.message);
        result.moved++;
      } catch (e: any) {
        result.failed.push(`${row.id}: ${e?.message || e}`);
      }
    }
    return res.json(result);
  });

  router.get(["/landing-brands", "/admin/landing-brands"], async (req, res) => {
    const isPublic = !String(req.path || "").startsWith("/admin/");
    if (isPublic) {
      const hit = publicListCache.get("brands");
      if (hit && Date.now() - hit.at < PUBLIC_LIST_TTL_MS) { res.set("Cache-Control", "public, max-age=60"); return res.json(hit.body); }
    }
    const send = (body: any) => { if (isPublic) { publicListCache.set("brands", { at: Date.now(), body }); res.set("Cache-Control", "public, max-age=60"); } return res.json(body); };
    const db = getDb();
    const activeClient = privilegedSupabase || supabase;
    if (activeClient) {
      try {
        const { data, error } = await activeClient.from('landing_brands').select('*').order('created_at', { ascending: false });
        if (data && data.length > 0) return send(data);
      } catch(e) {
        console.error("Error fetching landing_brands from Supabase:", e);
      }
    }
    // No invented "trusted brands" (Nike / Puma / Adidas were shown by default) — session 27.
    const defaultBrands: any[] = [];
    return send((db as any).landing_brands || defaultBrands);
  });

  router.post("/admin/landing-brands", async (req, res) => {
    clearPublicListCache();
    // Session 22: these four had NO login check — anyone could add or delete landing-page brands/reviews.
    const actor = await parseAuthUser(req);
    if (!actor || (actor.role !== "admin" && actor.role !== "sub_admin" && actor.team_role !== "sub_admin")) {
      return res.status(403).json({ error: "Admin privileges required.", detail: "Admin privileges required." });
    }
    const { name, logo_url } = req.body;
    const newBrand = {
      id: req.body.id || crypto.randomUUID(),
      name: name || "Brand",
      logo_url: logo_url || "",
      created_at: new Date().toISOString()
    };
    const activeClient = privilegedSupabase || supabase;
    if (activeClient) {
      try {
        const { data, error } = await activeClient.from('landing_brands').insert(newBrand).select();
        if (error) {
          console.error("Supabase insert error for landing_brands:", error);
        } else if (data && data[0]) {
          const db = getDb();
          if (!(db as any).landing_brands) (db as any).landing_brands = [];
          (db as any).landing_brands.unshift(data[0]);
          saveDb(db);
          return res.json(data[0]);
        }
      } catch(e) {
        console.error("Exception inserting landing_brands to Supabase:", e);
      }
    }
    const db = getDb();
    if (!(db as any).landing_brands) (db as any).landing_brands = [];
    (db as any).landing_brands.unshift(newBrand);
    saveDb(db);
    res.json(newBrand);
  });

  router.delete("/admin/landing-brands/:id", async (req, res) => {
    clearPublicListCache();
    // Session 22: these four had NO login check — anyone could add or delete landing-page brands/reviews.
    const actor = await parseAuthUser(req);
    if (!actor || (actor.role !== "admin" && actor.role !== "sub_admin" && actor.team_role !== "sub_admin")) {
      return res.status(403).json({ error: "Admin privileges required.", detail: "Admin privileges required." });
    }
    const { id } = req.params;
    const activeClient = privilegedSupabase || supabase;
    if (activeClient) {
      try {
        await activeClient.from('landing_brands').delete().eq('id', id);
      } catch(e) {
        console.error("Error deleting landing_brands from Supabase:", e);
      }
    }
    const db = getDb();
    if ((db as any).landing_brands) {
      (db as any).landing_brands = (db as any).landing_brands.filter((b: any) => b.id !== id);
      saveDb(db);
    }
    res.json({ ok: true });
  });

  // Session 31 (Ravi): landing reviews are only what the admin adds, and a failed save is an error.
  // Before, a Supabase failure silently kept the review in server memory and said "Review added!" —
  // it vanished on the next restart. Now: Supabase or a clear error. Each review has a 1–5 rating.
  const reviewsClient = () => privilegedSupabase || supabase;
  const isAdminActor = (actor: any) =>
    Boolean(actor) && (actor.role === "admin" || actor.role === "sub_admin" || actor.team_role === "sub_admin");
  const missingColumn = (error: any, col: string) =>
    Boolean(error) && (error.code === "PGRST204" || error.code === "42703") && String(error.message || "").includes(col);

  router.get(["/landing-reviews", "/admin/landing-reviews"], async (req, res) => {
    const isPublic = !String(req.path || "").startsWith("/admin/");
    if (isPublic) {
      const hit = publicListCache.get("reviews");
      if (hit && Date.now() - hit.at < PUBLIC_LIST_TTL_MS) { res.set("Cache-Control", "public, max-age=60"); return res.json(hit.body); }
    }
    const client = reviewsClient();
    if (client) {
      try {
        const { data, error } = await client.from('landing_reviews').select('*').order('created_at', { ascending: false });
        if (error) {
          console.error("Error fetching landing_reviews from Supabase:", error.message);
          return res.json([]);
        }
        const body = Array.isArray(data) ? data : [];
        if (isPublic) { publicListCache.set("reviews", { at: Date.now(), body }); res.set("Cache-Control", "public, max-age=60"); }
        return res.json(body);
      } catch(e) {
        console.error("Error fetching landing_reviews from Supabase:", e);
        return res.json([]);
      }
    }
    // Local dev without Supabase only.
    res.json((getDb() as any).landing_reviews || []);
  });

  router.post("/admin/landing-reviews", async (req, res) => {
    clearPublicListCache();
    const actor = await parseAuthUser(req);
    if (!isAdminActor(actor)) {
      return res.status(403).json({ error: "Admin privileges required.", detail: "Admin privileges required." });
    }
    const content = String(req.body?.content || "").trim();
    const author = String(req.body?.author_name || "").trim();
    if (!content || !author) return res.status(400).json({ error: "Name and review text are required." });
    const ratingNum = Math.round(Number(req.body?.rating ?? 5));
    const rating = Number.isFinite(ratingNum) ? Math.min(5, Math.max(1, ratingNum)) : 5;
    const newReview: any = {
      id: req.body.id || crypto.randomUUID(),
      author_name: author,
      author_role: req.body.author_role || "",
      author_image: req.body.author_image || "",
      content,
      category: req.body.category || "",
      highlight_text: req.body.highlight_text || "",
      highlight_color: req.body.highlight_color || "purple",
      type: req.body.type === "brand" ? "brand" : "creator",
      rating,
      created_at: new Date().toISOString(),
      created_by: actor.user_id || actor.id || null,
    };
    const client = reviewsClient();
    if (!client) return res.status(503).json({ error: "Database is not connected — the review was NOT saved." });
    try {
      let warning: string | null = null;
      let row = { ...newReview };
      let { data, error } = await client.from('landing_reviews').insert(row).select();
      // Older table without these columns: save the review anyway and say what was left out.
      for (const col of ["created_by", "rating"]) {
        if (error && missingColumn(error, col)) {
          delete row[col];
          if (col === "rating") warning = "Saved, but the star rating was not stored: the landing_reviews table has no 'rating' column yet.";
          ({ data, error } = await client.from('landing_reviews').insert(row).select());
        }
      }
      if (error || !data || !data[0]) {
        console.error("Supabase insert error for landing_reviews:", error);
        return res.status(500).json({ error: `The review was NOT saved: ${error?.message || "no row returned"}` });
      }
      return res.json(warning ? { ...data[0], warning } : data[0]);
    } catch (e: any) {
      console.error("Exception inserting landing_reviews to Supabase:", e);
      return res.status(500).json({ error: `The review was NOT saved: ${e?.message || e}` });
    }
  });

  router.delete("/admin/landing-reviews/:id", async (req, res) => {
    clearPublicListCache();
    const actor = await parseAuthUser(req);
    if (!isAdminActor(actor)) {
      return res.status(403).json({ error: "Admin privileges required.", detail: "Admin privileges required." });
    }
    const client = reviewsClient();
    if (!client) return res.status(503).json({ error: "Database is not connected — nothing was deleted." });
    try {
      const { data, error } = await client.from('landing_reviews').delete().eq('id', req.params.id).select('id');
      if (error) return res.status(500).json({ error: `The review was NOT deleted: ${error.message}` });
      if (!data || data.length === 0) return res.status(404).json({ error: "Review not found (already deleted?)." });
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ error: `The review was NOT deleted: ${e?.message || e}` });
    }
  });
}
