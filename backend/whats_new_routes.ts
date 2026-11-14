import express from "express";
import crypto from "crypto";

// Session 41 (Ravi) — "What's new" popup. The admin writes a short update (title + a few points,
// for creators, brands or everyone) and publishes it; every user of that group sees it once,
// like the Terms popup but without blocking the app. Tables: scripts/sql/OLD_SQL_already_run.sql (session41 part).
//
//   GET  /whats-new/latest          → newest published update for my role that I have not closed
//   POST /whats-new/:id/seen        → I closed it (never shown again)
//   GET  /admin/whats-new           → admin list
//   POST /admin/whats-new           → admin create / edit (id in body = edit)
//   POST /admin/whats-new/:id/publish  { published: true|false }
//   DELETE /admin/whats-new/:id

export type WhatsNewItem = {
  id: string;
  title: string;
  points: string[];
  audience: "all" | "creator" | "brand";
  cta_label?: string | null;
  cta_url?: string | null;
  published: boolean;
  published_at?: string | null;
  created_at?: string;
};

const AUDIENCES = new Set(["all", "creator", "brand"]);

/** v286: updates published after this user's account was made (no join date known → all). */
export function onlyAfterJoin<T extends { published_at?: string | null; created_at?: string }>(items: T[], user: any): T[] {
  const joined = Date.parse(String(user?.created_at || user?.createdAt || ""));
  if (!Number.isFinite(joined)) return items;
  return (items || []).filter((it) => {
    const at = Date.parse(String(it?.published_at || it?.created_at || ""));
    return !Number.isFinite(at) || at > joined;
  });
}

/** Cleans what the admin typed. Returns { item } or { error }. */
export function cleanWhatsNewInput(body: any): { item?: Partial<WhatsNewItem>; error?: string } {
  const title = String(body?.title || "").trim().slice(0, 120);
  if (!title) return { error: "Add a title." };
  const raw = Array.isArray(body?.points) ? body.points : String(body?.points || "").split("\n");
  const points = raw.map((p: any) => String(p || "").trim()).filter(Boolean).slice(0, 6).map((p: string) => p.slice(0, 220));
  if (points.length === 0) return { error: "Add at least one point." };
  const audience = AUDIENCES.has(String(body?.audience)) ? body.audience : "all";
  const ctaUrl = String(body?.cta_url || "").trim();
  // Only links inside the app ("/campaigns", "/creator/ugc") — never an outside site.
  if (ctaUrl && !/^\/[A-Za-z0-9/_\-?=&.]*$/.test(ctaUrl)) return { error: "The button link must be a page inside the app, like /campaigns." };
  const ctaLabel = String(body?.cta_label || "").trim().slice(0, 30);
  return { item: { title, points, audience, cta_label: ctaUrl ? (ctaLabel || "Try it") : null, cta_url: ctaUrl || null } };
}

/** Newest published item for this role that the user has not seen. */
export function pickLatestForUser(items: WhatsNewItem[], role: string, seenIds: Set<string>): WhatsNewItem | null {
  const r = role === "brand" ? "brand" : role === "creator" ? "creator" : null;
  const list = (items || [])
    .filter((i) => i && i.published && !seenIds.has(i.id))
    .filter((i) => i.audience === "all" || (r && i.audience === r))
    .sort((a, b) => String(b.published_at || b.created_at || "").localeCompare(String(a.published_at || a.created_at || "")));
  return list[0] || null;
}

const isAdmin = (u: any) => Boolean(u && (u.role === "admin" || u.is_admin === true));

export function setupWhatsNewRoutes(
  router: express.Router,
  { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser }: {
    supabase: any; privilegedSupabase: any; getDb: () => any; saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
  }
) {
  const sb = () => privilegedSupabase || supabase;

  async function allItems(): Promise<WhatsNewItem[]> {
    if (sb()) {
      const { data, error } = await sb().from("whats_new").select("*").order("created_at", { ascending: false });
      if (!error && Array.isArray(data)) return data;
      if (error) console.error("whats_new read failed:", error.message || error);
    }
    return getDb().whats_new || [];
  }

  router.get("/whats-new/latest", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    try {
      const items = await allItems();
      let seen: string[] = [];
      if (sb()) {
        const { data } = await sb().from("whats_new_seen").select("item_id").eq("user_id", user.user_id);
        seen = (data || []).map((r: any) => r.item_id);
      } else {
        seen = (getDb().whats_new_seen || []).filter((r: any) => r.user_id === user.user_id).map((r: any) => r.item_id);
      }
      // v286 (Ravi): "naye bande ko What's New mat dikhao" — only updates published AFTER the person
      // joined. Someone who signed up after an update already has it, so it is skipped for them.
      return res.json({ item: pickLatestForUser(onlyAfterJoin(items, user), user.role, new Set(seen)) });
    } catch (e: any) {
      console.error("whats-new latest failed:", e?.message || e);
      return res.json({ item: null });
    }
  });

  router.post("/whats-new/:id/seen", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const row = { user_id: user.user_id, item_id: String(req.params.id), seen_at: new Date().toISOString() };
    if (sb()) {
      const { error } = await sb().from("whats_new_seen").upsert(row, { onConflict: "user_id,item_id" });
      if (error) return res.status(500).json({ error: "Could not save." });
    } else {
      const db = getDb();
      db.whats_new_seen = db.whats_new_seen || [];
      if (!db.whats_new_seen.some((r: any) => r.user_id === row.user_id && r.item_id === row.item_id)) db.whats_new_seen.push(row);
      saveDb(db);
    }
    return res.json({ ok: true });
  });

  router.get("/admin/whats-new", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    return res.json(await allItems());
  });

  router.post("/admin/whats-new", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    const { item, error } = cleanWhatsNewInput(req.body);
    if (error) return res.status(400).json({ error });
    const id = req.body?.id ? String(req.body.id) : crypto.randomUUID();
    const row: any = { id, ...item };
    if (!req.body?.id) { row.published = false; row.created_at = new Date().toISOString(); }
    if (sb()) {
      const { data, error: e } = await sb().from("whats_new").upsert(row, { onConflict: "id" }).select().maybeSingle();
      if (e) return res.status(500).json({ error: "Could not save. Did you run scripts/sql/OLD_SQL_already_run.sql (session41 part)?" });
      return res.json(data || row);
    }
    const db = getDb();
    db.whats_new = db.whats_new || [];
    const i = db.whats_new.findIndex((x: any) => x.id === id);
    if (i >= 0) db.whats_new[i] = { ...db.whats_new[i], ...row }; else db.whats_new.unshift(row);
    saveDb(db);
    return res.json(i >= 0 ? db.whats_new[i] : row);
  });

  router.post("/admin/whats-new/:id/publish", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    const published = req.body?.published !== false;
    const patch = { published, published_at: published ? new Date().toISOString() : null };
    if (sb()) {
      const { error } = await sb().from("whats_new").update(patch).eq("id", req.params.id);
      if (error) return res.status(500).json({ error: "Could not update." });
    } else {
      const db = getDb();
      const it = (db.whats_new || []).find((x: any) => x.id === req.params.id);
      if (!it) return res.status(404).json({ error: "Not found" });
      Object.assign(it, patch);
      saveDb(db);
    }
    return res.json({ ok: true, ...patch });
  });

  router.delete("/admin/whats-new/:id", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    if (sb()) {
      const { error } = await sb().from("whats_new").delete().eq("id", req.params.id);
      if (error) return res.status(500).json({ error: "Could not delete." });
    } else {
      const db = getDb();
      db.whats_new = (db.whats_new || []).filter((x: any) => x.id !== req.params.id);
      saveDb(db);
    }
    return res.json({ ok: true });
  });
}

// ═══ v436 (Ravi: Admin › Developer › "How it works" videos — ADMIN_HOW_IT_WORKS_VIDEOS_SPEC.md) ═══════════════════
// 10 tutorial videos (B1–B5 brand, C1–C5 creator) + one YouTube playlist link. Each video is a YouTube link OR an
// uploaded file, or "not set" (hidden in the app). No new database table: the settings are one small JSON file in the
// public "banners" storage bucket (hiw/config.json), uploaded videos sit next to it (hiw/<code>-<time>.<ext>).
// The 15-day cleanup only touches content-submissions, so these files stay.
//   GET  /hiw-videos                     → { videos: {B1: {source, url, title}}, playlist_url }   (signed-in users)
//   GET  /admin/hiw-videos               → the full settings (full admins)
//   PUT  /admin/hiw-videos/:code         { source: "youtube"|"file"|null, youtube_url?, file_url? }
//   PUT  /admin/hiw-videos-playlist      { url }
//   POST /admin/hiw-videos/:code/upload-url { filename, contentType, size } → signed upload into banners/hiw/

export const HIW_VIDEOS: { code: string; role: "brand" | "creator"; title: string; section: string }[] = [
  { code: "B1", role: "brand", title: "Chat and Deal", section: "Brand · Chat" },
  { code: "B2", role: "brand", title: "Post a UGC Brief", section: "Brand · Instant UGC" },
  { code: "B3", role: "brand", title: "Create a Campaign", section: "Brand · Campaigns" },
  { code: "B4", role: "brand", title: "Payments", section: "Brand · Payments" },
  { code: "B5", role: "brand", title: "Eva for Brands", section: "Brand · Eva" },
  { code: "C1", role: "creator", title: "Chat and Deal", section: "Creator · Chat" },
  { code: "C2", role: "creator", title: "Earn from UGC Briefs", section: "Creator · Instant UGC" },
  { code: "C3", role: "creator", title: "Apply to Campaigns", section: "Creator · Campaigns" },
  { code: "C4", role: "creator", title: "Earnings and Payout", section: "Creator · Payments" },
  { code: "C5", role: "creator", title: "Eva for Creators", section: "Creator · Eva" },
];
const HIW_CODES = new Set(HIW_VIDEOS.map((v) => v.code));
const HIW_BUCKET = "banners";
const HIW_FILE = "hiw/config.json";
const HIW_MAX_BYTES = 200 * 1024 * 1024;

/** A YouTube watch / short / youtu.be / playlist link → the cleaned https link, else "". Pure. */
export function cleanYoutubeUrl(raw: any, { playlist = false } = {}): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return ""; }
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  if (!["youtube.com", "youtu.be", "music.youtube.com"].includes(host)) return "";
  if (playlist) return u.searchParams.get("list") ? `https://www.youtube.com/playlist?list=${encodeURIComponent(u.searchParams.get("list") as string)}` : (host === "youtube.com" && /^\/@|^\/c\/|^\/channel\//.test(u.pathname) ? `https://www.youtube.com${u.pathname}` : "");
  if (host === "youtu.be") return /^\/[\w-]{6,}$/.test(u.pathname) ? `https://youtu.be${u.pathname}` : "";
  if (u.pathname === "/watch" && /^[\w-]{6,}$/.test(u.searchParams.get("v") || "")) return `https://www.youtube.com/watch?v=${u.searchParams.get("v")}`;
  const m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]{6,})/);
  return m ? `https://www.youtube.com/watch?v=${m[2]}` : "";
}

/** Settings as stored → a clean object (unknown codes dropped; one source per video). Pure. */
export function normalizeHiw(raw: any) {
  const out: any = { videos: {}, playlist_url: cleanYoutubeUrl(raw?.playlist_url, { playlist: true }) || null, updated_at: raw?.updated_at || null };
  for (const v of HIW_VIDEOS) {
    const r = raw?.videos?.[v.code] || {};
    const yt = cleanYoutubeUrl(r.youtube_url);
    const file = typeof r.file_url === "string" && /^https:\/\//.test(r.file_url) ? r.file_url : "";
    const source = r.source === "youtube" && yt ? "youtube" : r.source === "file" && file ? "file" : null;
    out.videos[v.code] = { code: v.code, role: v.role, title: v.title, source, youtube_url: source === "youtube" ? yt : null, file_url: source === "file" ? file : null, updated_at: r.updated_at || null, updated_by: r.updated_by || null };
  }
  return out;
}
/** What the app needs: only videos that are set (Not set = hidden). Pure. */
export function publicHiw(cfg: any) {
  const n = normalizeHiw(cfg);
  const videos: any = {};
  for (const [code, v] of Object.entries<any>(n.videos)) if (v.source) videos[code] = { code, role: v.role, title: v.title, source: v.source, url: v.source === "youtube" ? v.youtube_url : v.file_url };
  return { videos, playlist_url: n.playlist_url };
}
const isFullAdminUser = (u: any) => Boolean(u && (u.role === "admin" || u.is_admin === true) && u.team_role !== "sub_admin" && u.role !== "sub_admin");

export function setupHiwVideoRoutes(
  router: express.Router,
  { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser }: {
    supabase: any; privilegedSupabase: any; getDb: () => any; saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
  }
) {
  const sb = () => privilegedSupabase || supabase;
  let cache: { at: number; cfg: any } | null = null;
  async function readCfg(fresh = false): Promise<any> {
    if (!fresh && cache && Date.now() - cache.at < 5 * 60_000) return cache.cfg;
    let cfg: any = null;
    if (sb()?.storage) {
      try {
        const { data, error } = await sb().storage.from(HIW_BUCKET).download(HIW_FILE);
        if (!error && data) cfg = JSON.parse(Buffer.from(await data.arrayBuffer()).toString("utf8"));
      } catch { cfg = null; }
    }
    if (!cfg) cfg = getDb().hiw_videos || {};
    cfg = normalizeHiw(cfg);
    cache = { at: Date.now(), cfg };
    return cfg;
  }
  async function writeCfg(cfg: any): Promise<boolean> {
    const clean = normalizeHiw({ ...cfg, updated_at: new Date().toISOString() });
    const db = getDb(); db.hiw_videos = clean; saveDb(db);
    if (sb()?.storage) {
      const { error } = await sb().storage.from(HIW_BUCKET).upload(HIW_FILE, Buffer.from(JSON.stringify(clean)), { contentType: "application/json", upsert: true, cacheControl: "60" });
      if (error) { console.error("[hiw] save failed:", error.message || error); return false; }
    }
    cache = { at: Date.now(), cfg: clean };
    return true;
  }

  router.get("/hiw-videos", async (req, res) => {
    const user = await parseAuthUser(req).catch(() => null);
    if (!user) return res.status(401).json({ detail: "Not authenticated" });
    res.set("Cache-Control", "private, max-age=300");
    return res.json(publicHiw(await readCfg()));
  });

  router.get("/admin/hiw-videos", async (req, res) => {
    const user = await parseAuthUser(req).catch(() => null);
    if (!isFullAdminUser(user)) return res.status(403).json({ detail: "Developer access only" });
    const cfg = await readCfg(true);
    return res.json({ ...cfg, list: HIW_VIDEOS.map((v) => cfg.videos[v.code]) });
  });

  router.put("/admin/hiw-videos-playlist", async (req, res) => {
    const user = await parseAuthUser(req).catch(() => null);
    if (!isFullAdminUser(user)) return res.status(403).json({ detail: "Developer access only" });
    const raw = String(req.body?.url || "").trim();
    const url = raw ? cleanYoutubeUrl(raw, { playlist: true }) : "";
    if (raw && !url) return res.status(400).json({ detail: "Paste a YouTube playlist or channel link." });
    const cfg = await readCfg(true);
    if (!(await writeCfg({ ...cfg, playlist_url: url || null }))) return res.status(500).json({ detail: "Couldn't save. Try again." });
    return res.json({ ok: true, playlist_url: url || null });
  });

  router.put("/admin/hiw-videos/:code", async (req, res) => {
    const user = await parseAuthUser(req).catch(() => null);
    if (!isFullAdminUser(user)) return res.status(403).json({ detail: "Developer access only" });
    const code = String(req.params.code || "").toUpperCase();
    if (!HIW_CODES.has(code)) return res.status(404).json({ detail: "Unknown video" });
    const source = req.body?.source === "youtube" || req.body?.source === "file" ? req.body.source : null;
    const row: any = { source, youtube_url: null, file_url: null, updated_at: new Date().toISOString(), updated_by: user.user_id };
    if (source === "youtube") {
      row.youtube_url = cleanYoutubeUrl(req.body?.youtube_url);
      if (!row.youtube_url) return res.status(400).json({ detail: "Paste a YouTube link (youtube.com or youtu.be)." });
    }
    if (source === "file") {
      const f = String(req.body?.file_url || "");
      if (!/^https:\/\//.test(f) || !f.includes(`/${HIW_BUCKET}/hiw/`)) return res.status(400).json({ detail: "Upload the video file first." });
      row.file_url = f;
    }
    const cfg = await readCfg(true);
    cfg.videos = { ...cfg.videos, [code]: { ...(cfg.videos?.[code] || {}), ...row } };
    if (!(await writeCfg(cfg))) return res.status(500).json({ detail: "Couldn't save. Try again." });
    const saved = (await readCfg()).videos[code];
    return res.json({ ok: true, video: saved });
  });

  router.post("/admin/hiw-videos/:code/upload-url", async (req, res) => {
    const user = await parseAuthUser(req).catch(() => null);
    if (!isFullAdminUser(user)) return res.status(403).json({ detail: "Developer access only" });
    const code = String(req.params.code || "").toUpperCase();
    if (!HIW_CODES.has(code)) return res.status(404).json({ detail: "Unknown video" });
    const type = String(req.body?.contentType || "");
    const size = Number(req.body?.size || 0);
    if (!/^video\//.test(type)) return res.status(400).json({ detail: "Choose a video file." });
    if (size > HIW_MAX_BYTES) return res.status(413).json({ detail: "This video is too big (max 200 MB)." });
    const ext = (String(req.body?.filename || "").match(/\.([a-z0-9]{2,5})$/i)?.[1] || "mp4").toLowerCase();
    const path = `hiw/${code}-${Date.now()}.${ext}`;
    if (!sb()?.storage) return res.status(503).json({ detail: "File storage isn't set up." });
    const { data, error } = await sb().storage.from(HIW_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return res.status(500).json({ detail: "Couldn't start the upload." });
    const { data: pub } = sb().storage.from(HIW_BUCKET).getPublicUrl(path);
    return res.json({ bucket: HIW_BUCKET, path: data.path, token: data.token, signedUrl: data.signedUrl, publicUrl: pub?.publicUrl || "" });
  });
}
