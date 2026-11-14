// Session 39 (Ravi, M35 + M41): "Creators like you, winning on YBEX" on the creator Home (and the
// small rotating photos on the onboarding photo step) show ONLY the creators the admin ticks (v343: any number;
// the same list also fills the landing page's creator wall — GET /landing-creators):
// (v291: nobody ticked → the best approved creators show automatically.)
// Admin → Users → creator → "Show on creator home" (creator_profiles.show_on_creator_home,
// scripts/sql/OLD_SQL_already_run.sql (session39 part)). Nobody ticked → the section hides; nothing is made up.
import express from "express";
import { readCreatorsLean } from "./inboxLean"; // v428: list reads without Instagram posts (egress)
import { isHiddenFromExplore, awaitingReview } from "./exploreGate"; // v349 · v357: awaitingReview

type Deps = {
  supabase: any; privilegedSupabase: any; getDb: () => any; saveDb: (db: any) => void;
  parseAuthUser: (req: express.Request) => Promise<any>;
  logAdminAction?: (user: any, action: string, type: string, id: string, detail: any) => Promise<any>;
};

// v343 (Ravi: "home page pe kitne bhi select kar sakta hu"): no cap on how many the admin ticks any more.
// HOME_PICKS_MAX is only the size of the AUTO list (nobody ticked); HOME_PICKS_LIST caps one response.
export const HOME_PICKS_MAX = 4;
export const HOME_PICKS_LIST = 30;
const isAdmin = (u: any) => u && (u.role === "admin" || u.role === "sub_admin" || u.team_role === "sub_admin");

/** Public-safe card fields only (no email, phone, rates). */
export function toHomePick(p: any) {
  const followers = Number(p.followers_instagram || p.ig_followers || p.instagram_followers || p.follower_count || 0) + Number(p.followers_youtube || 0);
  return {
    id: p.user_id,
    name: String(p.name || "Creator").trim(),
    picture: p.picture || p.photo || "",
    category: p.category || "",
    city: p.city || "",
    followers,
    avg_reach: Number(p.avg_views_30d || p.average_reach || p.instagram_avg_reach || 0),
  };
}

/** Same rule as src/lib/visibleCreators.js: approved from the waitlist, real name, no test / bypass accounts. */
export function isShowableCreator(p: any): boolean {
  if (!p || p.is_deleted) return false;
  if (isHiddenFromExplore(p)) return false; // v349: admin hid this creator from Explore / Meet the Creators
  const st = String(p.profile_status || "approved").toLowerCase();
  if (st !== "approved") return false;
  if (awaitingReview(p)) return false; // v357: "approved" only by the DB default — the admin hasn't reviewed them yet
  const n = String(p.name || p.full_name || "").trim().toLowerCase();
  if (n.length < 2 || n === "c" || n.startsWith("test")) return false;
  const h = String(p.instagram_handle || p.handle || "").toLowerCase();
  return !n.includes("developer bypass") && !h.includes("dev_bypass");
}

/** v291 (Ravi: the creator-home section never showed): when the admin ticked nobody, show the
 *  best approved creators automatically — those with a photo first, then by followers. */
export function autoHomePicks(rows: any[], viewerId: string, max = HOME_PICKS_MAX): any[] {
  return (rows || [])
    .filter((p) => isShowableCreator(p) && p.user_id !== viewerId)
    .map((p) => ({ p, card: toHomePick(p) }))
    .sort((a, b) => (Number(!!b.card.picture) - Number(!!a.card.picture)) || (b.card.followers - a.card.followers))
    .slice(0, max)
    .map((x) => x.p);
}

/** v343: landing wall cards — only showable creators that have a photo (no grey empty tiles). */
export function landingCreatorCards(rows: any[]): any[] {
  return (rows || [])
    .filter((p) => isShowableCreator(p))
    .map(toHomePick)
    .filter((c) => /^https?:\/\//.test(String(c.picture || "")) || String(c.picture || "").startsWith("/"))
    .map((c) => ({ id: c.id, name: c.name, picture: c.picture, category: c.category, city: c.city }));
}

export function setupCreatorHomePicks(router: express.Router, deps: Deps) {
  const c = () => deps.privilegedSupabase || deps.supabase;

  router.get("/creators/home-picks", async (req, res) => {
    const viewer = await deps.parseAuthUser(req);
    if (!viewer) return res.status(401).json({ error: "Unauthorized" });
    let rows: any[] = [];
    const db = c();
    if (db) {
      try {
        const { data, error } = await readCreatorsLean(db, (q: any) => q.eq("show_on_creator_home", true).limit(HOME_PICKS_LIST));
        if (!error && Array.isArray(data)) rows = data;
      } catch { rows = []; }
    } else {
      rows = (deps.getDb().creator_profiles || []).filter((p: any) => p.show_on_creator_home === true).slice(0, HOME_PICKS_LIST);
    }
    // v346: ticked rows follow the same rule as the auto picks — only showable (approved, real)
    // creators, and never the viewer's own profile.
    rows = rows.filter((p) => !p.is_deleted && isShowableCreator(p) && p.user_id !== viewer.user_id);
    if (rows.length === 0) {
      try {
        if (db) {
          const { data } = await readCreatorsLean(db, (q: any) => q.limit(200));
          rows = autoHomePicks(Array.isArray(data) ? data : [], viewer.user_id);
        } else {
          rows = autoHomePicks(deps.getDb().creator_profiles || [], viewer.user_id);
        }
      } catch { rows = []; }
    }
    res.set("Cache-Control", "private, max-age=120");
    return res.json({ picks: rows.map(toHomePick) });
  });

  // v343 (Ravi): the landing page's creator wall shows the SAME creators the admin ticks for the app home.
  // Public (no login): card fields only, approved creators with a photo. Nobody ticked → best approved ones.
  // v391 (speed QA): same answer for every visitor → kept 60 s in memory.
  let landingCache: { at: number; body: any } | null = null;
  router.get("/landing-creators", async (_req, res) => {
    if (landingCache && Date.now() - landingCache.at < 60_000) { res.set("Cache-Control", "public, max-age=300"); return res.json(landingCache.body); }
    const db = c();
    let rows: any[] = [];
    try {
      if (db) {
        const { data, error } = await readCreatorsLean(db, (q: any) => q.eq("show_on_creator_home", true).limit(HOME_PICKS_LIST));
        if (!error && Array.isArray(data)) rows = data;
      } else {
        rows = (deps.getDb().creator_profiles || []).filter((p: any) => p.show_on_creator_home === true).slice(0, HOME_PICKS_LIST);
      }
    } catch { rows = []; }
    let picks = landingCreatorCards(rows);
    if (picks.length === 0) {
      try {
        const all = db ? ((await readCreatorsLean(db, (q: any) => q.limit(200))).data || []) : (deps.getDb().creator_profiles || []);
        picks = landingCreatorCards(autoHomePicks(all, "", 9));
      } catch { picks = []; }
    }
    res.set("Cache-Control", "public, max-age=300");
    landingCache = { at: Date.now(), body: { creators: picks } };
    return res.json({ creators: picks });
  });

  // v346: is this creator going to actually appear when ticked? (approved + has a profile photo)
  const homePickWarning = (p: any): string | undefined => {
    const pic = String(p?.picture || p?.photo || "").trim();
    if (isHiddenFromExplore(p)) return "This creator is hidden from Explore & Meet the Creators, so they won't show until you unhide them."; // v349
    if (!p || !isShowableCreator(p) || !pic) return "Shows only after the creator is approved and has a profile photo.";
    return undefined;
  };

  router.post("/admin/creators/:userId/home-pick", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ error: "Admin only" });
    const userId = String(req.params.userId || "");
    const on = Boolean(req.body?.on);
    const db = c();
    let profile: any = null; // v346: used for the "won't show yet" warning
    if (db) {
      const { error } = await db.from("creator_profiles").update({ show_on_creator_home: on }).eq("user_id", userId);
      if (error) return res.status(502).json({ error: "Could not save. Has scripts/sql/OLD_SQL_already_run.sql (session39 part) been run?", code: "HOME_PICK_SAVE_FAILED" });
      if (on) {
        try {
          const { data } = await db.from("creator_profiles").select("*").eq("user_id", userId).limit(1);
          profile = Array.isArray(data) ? data[0] || null : data || null;
        } catch { profile = null; }
      }
    } else {
      const local = deps.getDb() || {};
      if (!local.creator_profiles) local.creator_profiles = [];
      const list = local.creator_profiles;
      let p = list.find((x: any) => x.user_id === userId || x.id === userId);
      if (!p) {
        const u = (local.users || []).find((x: any) => x.user_id === userId || x.id === userId);
        if (u) {
          p = { user_id: userId, id: userId, name: u.name, show_on_creator_home: on };
          list.push(p);
        } else {
          return res.status(404).json({ error: "Creator profile not found" });
        }
      } else {
        p.show_on_creator_home = on;
      }
      deps.saveDb(local);
      profile = p;
    }
    try { await deps.logAdminAction?.(user, on ? "home_pick_on" : "home_pick_off", "creator", userId, {}); } catch { /* log only */ }
    // v346: still saved, but tell the admin when the tick won't show anything yet.
    const warning = on ? homePickWarning(profile) : undefined;
    return res.json(warning ? { ok: true, on, warning } : { ok: true, on });
  });

  // v349 (Ravi): "Explore Creators se kisi creator ko kaise hataun? Sirf delete / ban hai." — a third option:
  // Admin → Users → creator → "Hide from Explore & Meet the Creators". hidden_from_explore = true drops the
  // creator from every brand / public list (visibleOnExplore, visibleCreators, isShowableCreator) but keeps
  // the account, profile link, deals and chats working. /admin/creators/* is gated by adminPermissionGate
  // (sub-admins need manage_users); this route still refuses anyone who is not admin staff.
  router.post("/admin/creators/:userId/explore-hide", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!isAdmin(user)) return res.status(403).json({ error: "Admin only" });
    const userId = String(req.params.userId || "").trim();
    if (!userId) return res.status(400).json({ error: "Missing creator" });
    const hidden = req.body?.hidden === true || req.body?.hidden === "true";
    const db = c();
    if (db) {
      const { data, error } = await db.from("creator_profiles").update({ hidden_from_explore: hidden, updated_at: new Date().toISOString() /* v429: Explore notices the change */ }).eq("user_id", userId).select("user_id");
      if (error) return res.status(502).json({ error: "Could not save. Please try again.", code: "EXPLORE_HIDE_SAVE_FAILED" });
      if (Array.isArray(data) && data.length === 0) return res.status(404).json({ error: "Creator profile not found" });
    } else {
      const local = deps.getDb() || {};
      const p = (local.creator_profiles || []).find((x: any) => x.user_id === userId || x.id === userId);
      if (!p) return res.status(404).json({ error: "Creator profile not found" });
      p.hidden_from_explore = hidden;
      deps.saveDb(local);
    }
    try { await deps.logAdminAction?.(user, hidden ? "explore_hide_on" : "explore_hide_off", "creator", userId, { hidden_from_explore: hidden }); } catch { /* log only */ }
    return res.json({ ok: true, hidden });
  });
}
