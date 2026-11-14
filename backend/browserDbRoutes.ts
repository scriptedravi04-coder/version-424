// Session 22. Endpoints that replace the browser's DIRECT Supabase writes/reads (anon key) on
// sensitive tables, so RLS on `users`, `deals`, `chat_threads` can be locked to the server.
// Before: the browser updated `users` itself (onboarding: is_agency) and the admin helpdesk read
// `chat_threads`, `deals` and `users` (email/phone) itself — which only worked because those
// tables let ANY anon caller read and update every row (e.g. set their own role to admin).
import express from "express";

const isStaff = (u: any) => ["admin", "sub_admin"].includes(String(u?.role)) || u?.team_role === "sub_admin";

export function setupBrowserDbRoutes(
  router: express.Router,
  deps: { parseAuthUser: (req: any) => Promise<any>; getClient: () => any; getDb: () => any; saveDb: (db: any) => void }
) {
  // Brand onboarding: agency flag on the user's own row only.
  router.post("/users/me/agency", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user) return res.status(401).json({ detail: "Not authenticated" });
    // v396 (Ravi: "creators ke naam ke aage Agency likha hai — loophole?"): only a brand account can mark itself an agency
    if (!["brand", "agency", "talent_manager"].includes(String(user.role || "").toLowerCase())) return res.status(403).json({ detail: "Only brand accounts can be marked as an agency." });
    const is_agency = Boolean(req.body?.is_agency);
    const agency_type = req.body?.agency_type ? String(req.body.agency_type).slice(0, 80) : null;
    const client = deps.getClient();
    if (client) {
      // Session 35: users has no is_agency / agency_type column (this always returned 502). Agency
      // details belong to the brand profile (brand_profiles.is_agency + agency_type).
      const acting = String(user.parent_brand_id || user.user_id);
      let { error } = await client.from("brand_profiles").update({ is_agency, agency_type }).eq("user_id", acting);
      // Until the agency_type column is added (session 35 SQL), still save is_agency.
      if (error && /agency_type/i.test(String(error.message))) ({ error } = await client.from("brand_profiles").update({ is_agency }).eq("user_id", acting));
      if (error) return res.status(502).json({ detail: "Could not save.", error: "Could not save." }); // v378 (QA L3): no raw database text to the browser
    }
    const db = deps.getDb();
    const local = (db.users || []).find((u: any) => u.user_id === user.user_id);
    if (local) { local.is_agency = is_agency; local.agency_type = agency_type; deps.saveDb(db); }
    res.json({ ok: true, is_agency, agency_type });
  });

  // Onboarding "Profile submitted" notification for the user themself.
  router.post("/notifications/me/system", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user) return res.status(401).json({ detail: "Not authenticated" });
    const client = deps.getClient();
    const row = {
      user_id: user.user_id,
      type: "system",
      title: String(req.body?.title || "Update").slice(0, 120),
      message: String(req.body?.message || "").slice(0, 500),
      created_at: new Date().toISOString(),
    };
    if (client) {
      const { error } = await client.from("notifications").insert(row);
      if (error) return res.status(502).json({ detail: "Could not save.", error: "Could not save." }); // v378 (QA L3)
    }
    res.json({ ok: true });
  });

  // Admin helpdesk: the deal/thread a ticket is about, with both parties' contact details.
  router.get("/admin/helpdesk/context", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user || !isStaff(user)) return res.status(403).json({ detail: "Admin privileges required." });
    const orderId = String(req.query?.order_id || "").trim();
    const client = deps.getClient();
    if (!orderId || !client) return res.json({ data: null });
    let data: any = null;
    try {
      if (orderId.startsWith("thread_")) {
        const r = await client.from("chat_threads").select("*, brand:brand_id(*), creator:creator_id(*)").eq("id", orderId).maybeSingle();
        data = r.data || null;
      } else if (orderId.startsWith("ORD-")) {
        const r = await client.from("deals").select("*, brand:brand_id(*), creator:creator_id(*)").eq("id", orderId).maybeSingle();
        if (r.data) data = { deal: r.data, brand: r.data.brand, creator: r.data.creator, brand_id: r.data.brand_id, creator_id: r.data.creator_id };
      }
      if (data) {
        const ids = [data.brand_id, data.creator_id].filter(Boolean);
        if (ids.length) {
          const { data: users } = await client.from("users").select("user_id, name, email, phone").in("user_id", ids);
          const b = (users || []).find((u: any) => u.user_id === data.brand_id);
          const c = (users || []).find((u: any) => u.user_id === data.creator_id);
          if (b) data.brand = { ...(data.brand || {}), ...b };
          if (c) data.creator = { ...(data.creator || {}), ...c };
        }
      }
    } catch (e: any) {
      console.warn("[helpdesk] context lookup failed:", e?.message || e);
    }
    res.json({ data });
  });

  // Brand dashboard deal counters (the brand's own deals only).
  router.get("/brands/me/deal-stats", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user) return res.status(401).json({ detail: "Not authenticated" });
    const ids = [user.user_id, user.parent_brand_id].filter(Boolean).map(String);
    const client = deps.getClient();
    if (!client) return res.json({ deals: [] });
    // deals has no deal_id column — the id is "id" (this list was always empty before session 35).
    const { data } = await client.from("deals").select("id, status, created_at").in("brand_id", ids);
    res.json({ deals: (data || []).map((d: any) => ({ ...d, deal_id: d.id })) });
  });

  // Session 25: brand dashboard applicant counters. Session 34: + campaign_id/status for the
  // "Important for you" new-applicants task (still the brand's own campaigns only). The browser read campaign_applications
  // directly, which needs an anon "SELECT everything" policy (every pitch and amount public).
  router.get("/brands/me/application-stats", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user) return res.status(401).json({ detail: "Not authenticated" });
    const acting = String(user.parent_brand_id || user.user_id);
    const client = deps.getClient();
    if (!client) return res.json({ applications: [] });
    const { data: camps } = await client.from("campaigns").select("campaign_id").eq("brand_user_id", acting);
    const ids = (camps || []).map((c: any) => c.campaign_id).filter(Boolean);
    if (!ids.length) return res.json({ applications: [] });
    // no applied_at column (session 35). Session 58 (bug hunt): the brand filter sat INSIDE that comment, so every
    // brand got every application on the platform.
    const { data } = await client.from("campaign_applications").select("application_id, campaign_id, status, created_at").in("campaign_id", ids);
    res.json({ applications: data || [] });
  });

  // Admin helpdesk ticket list: names/emails of the ticket owners.
  router.get("/admin/helpdesk/users", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user || !isStaff(user)) return res.status(403).json({ detail: "Admin privileges required." });
    const ids = String(req.query?.ids || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 200);
    const client = deps.getClient();
    if (!ids.length || !client) return res.json({ users: [] });
    const { data } = await client.from("users").select("user_id, name, email, role").in("user_id", ids);
    res.json({ users: data || [] });
  });

  // Onboarding: is this username free?
  router.get("/users/username-available", async (req, res) => {
    const username = String(req.query?.u || "").trim();
    if (!username || username.length > 60) return res.json({ available: false });
    const client = deps.getClient();
    if (!client) return res.json({ available: true });
    const { data } = await client.from("users").select("user_id").eq("username", username).limit(1);
    res.json({ available: !(data && data.length) });
  });

  // Own-row writes for the profile tables (onboarding, settings, portfolio, social channels).
  // These tables are now SELECT-only for the browser, so the old direct upserts failed. The
  // server writes them as the service role, but ONLY the caller's own row, and never the
  // columns that staff control (verification, KYC, rating, role, featured, suspension).
  router.post("/db/own", async (req, res) => {
    const user = await deps.parseAuthUser(req);
    if (!user) return res.status(401).json({ error: { message: "Not authenticated" } });
    const { table, op, values, match, options } = req.body || {};
    const rule = OWN_TABLES[String(table)];
    if (!rule || !rule.ops.includes(String(op))) return res.status(400).json({ error: { message: "Not allowed." } });
    const ownerId = rule.actingBrand ? String(user.parent_brand_id || user.user_id) : String(user.user_id);
    const clean = (v: any) => {
      if (!v || typeof v !== "object" || Array.isArray(v)) return {};
      const out: any = {};
      for (const [k, val] of Object.entries(v)) {
        if (STAFF_ONLY.test(k)) continue;
        if (k === "profile_status" && !["draft", "under_review", "pending"].includes(String(val))) continue;
        out[k] = val;
      }
      out[rule.owner] = ownerId; // always the caller's own row
      return out;
    };
    const client = deps.getClient();
    if (!client) return res.status(503).json({ error: { message: "Database not configured." } });
    try {
      let q: any = client.from(table);
      // Session 53 (security): the conflict key must include the owner column, so an upsert can never
      // land on (and take over) another user's row through some other unique column.
      const conflictKey = options?.onConflict && String(options.onConflict).split(",").map((x: string) => x.trim()).includes(rule.owner) ? String(options.onConflict) : null;
      if (op === "upsert") q = q.upsert(Array.isArray(values) ? values.map(clean) : clean(values), conflictKey ? { onConflict: conflictKey } : undefined);
      else if (op === "insert") q = q.insert(Array.isArray(values) ? values.map(clean) : clean(values));
      else if (op === "update") q = q.update(table === "notifications" ? { read: Boolean(values?.read) } : clean(values));
      else if (op === "delete") q = q.delete();
      if (op === "update" || op === "delete") {
        q = q.eq(rule.owner, ownerId);
        for (const [k, v] of Object.entries(match || {})) {
          if (k !== rule.owner && /^[a-z_]+$/.test(k)) q = q.eq(k, v as any);
        }
      }
      const { data, error } = await q.select();
      if (error) return res.status(400).json({ error: { message: error.message } });
      res.json({ data });
    } catch (e: any) {
      res.status(500).json({ error: { message: e?.message || "Write failed" } });
    }
  });
}

const OWN_TABLES: Record<string, { owner: string; ops: string[]; actingBrand?: boolean }> = {
  brand_profiles: { owner: "user_id", ops: ["upsert", "update"], actingBrand: true },
  creator_profiles: { owner: "user_id", ops: ["upsert", "update"] },
  creator_portfolio_items: { owner: "creator_id", ops: ["insert", "update", "delete"] },
  creator_social_channels: { owner: "creator_id", ops: ["upsert", "insert", "update", "delete"] },
  notifications: { owner: "user_id", ops: ["update"] }, // mark as read only
};
const STAFF_ONLY = /^(id|verified|is_verified|verification_.*|kyc_.*|approved.*|is_approved|is_featured|featured|rating|avg_rating|aggregate_.*|trust_score|score|is_claimed|role|team_role|banned|is_banned|suspended|is_suspended|admin_.*|reviewed_by|reviewed_at|created_at|fake_follower_pct|performance_.*|tier|is_platinum_override|show_on_creator_home|is_deleted|deleted_at|hidden_from_explore|instagram_verified_at|instagram_verify_method|instagram_synced_at|instagram_stats)$/i; // v349: + explore hide / Instagram sync (server only) // Session 53: + computed / admin-only profile fields
