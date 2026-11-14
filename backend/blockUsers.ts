// v337 (Session 59, Ravi: "hn kr do") — Block a user (Apple guideline 1.2: apps with chat / profiles must let people
// block abusive users and must tell the developer).
//
// Table `blocked_users (blocker_id, blocked_id, created_at)` — migration session59_blocked_users, server-only (RLS on,
// no policies). For a brand team member the blocker is the PARENT brand (the whole team shares the block, same as the
// inbox). Not a locked file; the locked routes are only GUARDED from here (registered before them, they can only
// refuse) and their list answers are FILTERED on the way out — no locked file changed.
//
// What a block does (both directions — neither side can reach the other):
//  - no new chat messages (POST /chat/v2/threads/:id/messages → 403 BLOCKED);
//  - no invite from the brand, no application from the creator;
//  - the other person's chats, invitations and applications are hidden from the lists. A chat whose payment is
//    already held stays in the inbox (money has to finish properly), marked `blocked`, but messages stay off;
//  - the Ybex team gets a report row ("user_block") so they can look at it.

import { randomUUID } from "crypto";

type Deps = {
  supabase: any;
  privilegedSupabase: any;
  getDb: () => any;
  saveDb: (db: any) => void;
  parseAuthUser: (req: any) => Promise<any>;
  getActingBrandId: (user: any) => any;
};

export type BlockState = { byMe: Set<string>; byThem: Set<string> };

const CACHE_MS = 30_000;

export function blockerIdFor(user: any): string {
  if (!user) return "";
  return String(user.parent_brand_id || user.user_id || "");
}

/** "by_me" | "by_them" | null for a person id, given a user's block state. */
export function blockSide(state: BlockState | null | undefined, otherId: any): "by_me" | "by_them" | null {
  const id = String(otherId || "");
  if (!state || !id) return null;
  if (state.byMe.has(id)) return "by_me";
  if (state.byThem.has(id)) return "by_them";
  return null;
}

/** The other person in a chat thread for this viewer (creator ↔ brand). */
export function threadOtherId(t: any, meIds: Set<string>): string {
  const c = String(t?.creator_id || t?.creator?.user_id || "");
  const b = String(t?.brand_id || t?.brand?.user_id || "");
  if (c && meIds.has(c)) return b;
  if (b && meIds.has(b)) return c;
  return "";
}

/** Inbox filter: hide blocked chats; a chat with money already held stays, marked `blocked`. */
export function filterThreadsForBlocks(threads: any[], state: BlockState, meIds: Set<string>): any[] {
  if (!Array.isArray(threads) || (!state.byMe.size && !state.byThem.size)) return threads;
  const out: any[] = [];
  for (const t of threads) {
    const side = blockSide(state, threadOtherId(t, meIds));
    if (!side) { out.push(t); continue; }
    if (t?.payment_funded || t?.escrow_hold) out.push({ ...t, blocked: side });
  }
  return out;
}

export function filterByPerson(rows: any[], state: BlockState, pick: (r: any) => any[]): any[] {
  if (!Array.isArray(rows) || (!state.byMe.size && !state.byThem.size)) return rows;
  return rows.filter((r) => !pick(r).some((id) => blockSide(state, id)));
}

export function blockMessage(side: "by_me" | "by_them", what: "message" | "invite" | "apply", name = ""): string {
  const who = name || "this person";
  if (side === "by_me") {
    if (what === "message") return `You blocked ${who}. Unblock them from their profile to send messages.`;
    if (what === "invite") return `You blocked ${who}. Unblock them from their profile to send an invite.`;
    return `You blocked ${who}. Unblock them from their profile to apply.`;
  }
  if (what === "message") return "You can't send messages in this chat.";
  if (what === "invite") return "You can't invite this creator.";
  return "You can't apply to this campaign.";
}

export function setupBlockRoutes(router: any, deps: Deps) {
  const { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser } = deps;
  const client = () => privilegedSupabase || null;
  const cache = new Map<string, { at: number; state: BlockState }>();

  const forget = (...ids: string[]) => ids.forEach((id) => cache.delete(id));

  async function stateFor(user: any): Promise<BlockState> {
    const ids = [...new Set([String(user?.user_id || ""), blockerIdFor(user)].filter(Boolean))];
    const key = ids.join("|");
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.state;
    const state: BlockState = { byMe: new Set(), byThem: new Set() };
    if (client()) {
      const [mine, theirs] = await Promise.all([
        client().from("blocked_users").select("blocked_id").in("blocker_id", ids),
        client().from("blocked_users").select("blocker_id").in("blocked_id", ids),
      ]);
      if (mine.error || theirs.error) throw new Error("BLOCKS_READ_FAILED");
      (mine.data || []).forEach((r: any) => state.byMe.add(String(r.blocked_id)));
      (theirs.data || []).forEach((r: any) => state.byThem.add(String(r.blocker_id)));
    } else {
      for (const r of getDb()?.blocked_users || []) {
        if (ids.includes(String(r.blocker_id))) state.byMe.add(String(r.blocked_id));
        if (ids.includes(String(r.blocked_id))) state.byThem.add(String(r.blocker_id));
      }
    }
    cache.set(key, { at: Date.now(), state });
    return state;
  }
  /** Never blocks a request because the check itself failed. */
  async function safeState(user: any): Promise<BlockState | null> {
    try { return await stateFor(user); } catch (e: any) { console.warn("[blocks] read failed:", e?.message || e); return null; }
  }
  const meIdsFor = (user: any) => new Set([String(user?.user_id || ""), blockerIdFor(user)].filter(Boolean));

  /** A creator id from a profile page may be the user id or (old links) a creator_profiles row id. */
  async function resolveUserId(raw: string): Promise<{ user_id: string; name: string; role: string } | null> {
    const id = String(raw || "").trim().slice(0, 120);
    if (!id) return null;
    if (client()) {
      const { data } = await client().from("users").select("user_id, name, role").eq("user_id", id).maybeSingle();
      if (data) return { user_id: String(data.user_id), name: String(data.name || ""), role: String(data.role || "") };
      return null;
    }
    const u = (getDb()?.users || []).find((x: any) => String(x.user_id) === id);
    return u ? { user_id: String(u.user_id), name: String(u.name || ""), role: String(u.role || "") } : null;
  }

  // ── Block / unblock / list ────────────────────────────────────────────────────────────────────────────
  router.get("/blocks", async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated" });
    const blocker = blockerIdFor(user);
    try {
      let rows: any[] = [];
      if (client()) {
        const { data, error } = await client().from("blocked_users").select("blocked_id, created_at").eq("blocker_id", blocker).order("created_at", { ascending: false }).limit(500);
        if (error) throw error;
        rows = data || [];
      } else {
        rows = (getDb()?.blocked_users || []).filter((r: any) => String(r.blocker_id) === blocker);
      }
      const ids = rows.map((r) => String(r.blocked_id));
      let people: any[] = [];
      if (ids.length && client()) {
        const { data } = await client().from("users").select("user_id, name, role").in("user_id", ids);
        people = data || [];
      } else if (ids.length) {
        people = (getDb()?.users || []).filter((u: any) => ids.includes(String(u.user_id)));
      }
      const byId = new Map(people.map((p: any) => [String(p.user_id), p]));
      return res.json({
        blocked: rows.map((r) => {
          const p: any = byId.get(String(r.blocked_id)) || {};
          return { user_id: String(r.blocked_id), name: p.name || "Ybex user", role: p.role || null, blocked_at: r.created_at || null };
        }),
      });
    } catch (e: any) {
      console.error("[blocks] list failed:", e?.message || e);
      return res.status(503).json({ error: "Couldn't load your blocked list. Please try again.", code: "BLOCKS_UNAVAILABLE" });
    }
  });

  router.get("/users/:id/block", async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated" });
    const state = await safeState(user);
    return res.json({ blocked: blockSide(state, req.params.id) === "by_me" });
  });

  router.post("/users/:id/block", async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated" });
    const blocker = blockerIdFor(user);
    const target = await resolveUserId(req.params.id).catch(() => null);
    if (!target) return res.status(404).json({ error: "This profile wasn't found." });
    if (target.user_id === blocker || target.user_id === String(user.user_id)) return res.status(400).json({ error: "You can't block yourself." });
    if (["admin", "sub_admin"].includes(target.role.toLowerCase())) return res.status(400).json({ error: "The Ybex team can't be blocked. Use Help to report a problem." });
    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    const row = { blocker_id: blocker, blocked_id: target.user_id, created_at: new Date().toISOString() };
    try {
      if (client()) {
        const { error } = await client().from("blocked_users").upsert(row, { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true });
        if (error) throw error;
      } else {
        const db = getDb();
        db.blocked_users = db.blocked_users || [];
        if (!db.blocked_users.some((r: any) => r.blocker_id === row.blocker_id && r.blocked_id === row.blocked_id)) db.blocked_users.push(row);
        saveDb(db);
      }
    } catch (e: any) {
      console.error("[blocks] save failed:", e?.message || e);
      return res.status(503).json({ error: "Couldn't block right now. Please try again." });
    }
    cache.clear();
    // Apple 1.2: the developer must hear about it. One report row for the team (Admin → System reports).
    if (client()) {
      client().from("reports").insert({
        report_id: randomUUID(),
        reported_by: String(user.user_id),
        reported_by_name: String(user.name || user.email || "").slice(0, 120) || null,
        target_type: "user_block",
        target_id: target.user_id,
        reason: [`Blocked ${target.name || target.user_id}`, reason ? `Reason: ${reason}` : ""].filter(Boolean).join(" · "),
        status: "open",
        created_at: row.created_at,
      }).then(({ error }: any) => { if (error) console.warn("[blocks] report row failed:", error.message); }, () => {});
    }
    return res.json({ ok: true, blocked: true, name: target.name || null });
  });

  router.delete("/users/:id/block", async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated" });
    const blocker = blockerIdFor(user);
    const id = String(req.params.id || "").slice(0, 120);
    try {
      if (client()) {
        const { error } = await client().from("blocked_users").delete().eq("blocker_id", blocker).eq("blocked_id", id);
        if (error) throw error;
      } else {
        const db = getDb();
        db.blocked_users = (db.blocked_users || []).filter((r: any) => !(r.blocker_id === blocker && r.blocked_id === id));
        saveDb(db);
      }
    } catch (e: any) {
      console.error("[blocks] unblock failed:", e?.message || e);
      return res.status(503).json({ error: "Couldn't unblock right now. Please try again." });
    }
    cache.clear();
    return res.json({ ok: true, blocked: false });
  });

  // ── Guards in front of the locked routes (they only ever add a refusal) ─────────────────────────────────
  router.post("/chat/v2/threads/:threadId/messages", async (req: any, res: any, next: any) => {
    try {
      const user = await parseAuthUser(req);
      if (!user || ["admin", "sub_admin"].includes(String(user.role || ""))) return next();
      const state = await safeState(user);
      if (!state || (!state.byMe.size && !state.byThem.size)) return next();
      const id = String(req.params.threadId || "");
      if (!/^[\w-]{1,120}$/.test(id)) return next();
      let t: any = null;
      if (client()) {
        const { data } = await client().from("chat_threads").select("id, creator_id, brand_id").or(`id.eq.${id},deal_id.eq.${id}`).limit(1);
        t = (data || [])[0] || null;
      }
      if (!t) t = (getDb()?.chat_threads || []).find((x: any) => x.id === id || x.deal_id === id) || null;
      if (!t) return next();
      const side = blockSide(state, threadOtherId(t, meIdsFor(user)));
      if (!side) return next();
      const msg = blockMessage(side, "message");
      return res.status(403).json({ code: "BLOCKED", blocked: side, error: msg, detail: msg });
    } catch { return next(); }
  });

  router.post(["/creators/:id/invite", "/creators/:id/send-brief"], async (req: any, res: any, next: any) => {
    try {
      const user = await parseAuthUser(req);
      if (!user) return next();
      const state = await safeState(user);
      const side = blockSide(state, req.params.id);
      if (!side) return next();
      const msg = blockMessage(side, "invite");
      return res.status(403).json({ code: "BLOCKED", blocked: side, error: msg, detail: msg });
    } catch { return next(); }
  });

  // v414: accepting an invite from a brand that is blocked (either way) opened a deal + chat with them.
  router.post(["/creators/invitations/:id/accept", "/creator/invitations/:id/accept"], async (req: any, res: any, next: any) => {
    try {
      const user = await parseAuthUser(req);
      if (!user) return next();
      const state = await safeState(user);
      if (!state || (!state.byMe.size && !state.byThem.size)) return next();
      const id = String(req.params.id || "").slice(0, 120);
      let brandId = "";
      if (client()) {
        const { data } = await client().from("brief_requests").select("brand_id").eq("id", id).maybeSingle();
        brandId = String(data?.brand_id || "");
      }
      if (!brandId) brandId = String((getDb()?.brief_requests || []).find((b: any) => String(b.id) === id)?.brand_id || "");
      const side = blockSide(state, brandId);
      if (!side) return next();
      const msg = side === "by_me" ? "You blocked this brand. Unblock them from their profile to accept." : "You can't accept this invitation.";
      return res.status(403).json({ code: "BLOCKED", blocked: side, error: msg, detail: msg });
    } catch { return next(); }
  });

  router.post("/campaigns/apply", async (req: any, res: any, next: any) => {
    try {
      const user = await parseAuthUser(req);
      const id = String(req.body?.campaign_id || "");
      if (!user || !id) return next();
      const state = await safeState(user);
      if (!state || (!state.byMe.size && !state.byThem.size)) return next();
      let brandId = "";
      if (client()) {
        const { data } = await client().from("campaigns").select("brand_user_id").eq("campaign_id", id).maybeSingle();
        brandId = String(data?.brand_user_id || "");
      } else {
        brandId = String((getDb()?.campaigns || []).find((c: any) => String(c.campaign_id) === id)?.brand_user_id || "");
      }
      const side = blockSide(state, brandId);
      if (!side) return next();
      const msg = blockMessage(side, "apply");
      return res.status(403).json({ code: "BLOCKED", blocked: side, error: msg, detail: msg });
    } catch { return next(); }
  });

  // ── List answers filtered on the way out (inbox, invitations, applicants) ────────────────────────────────
  const filterJson = (pickFilter: (body: any, state: BlockState, user: any) => any) => async (req: any, res: any, next: any) => {
    let user: any = null;
    try { user = await parseAuthUser(req); } catch { user = null; }
    if (!user) return next();
    const state = await safeState(user);
    if (!state || (!state.byMe.size && !state.byThem.size)) return next();
    const send = res.json.bind(res);
    res.json = (body: any) => {
      try { if (res.statusCode < 400) return send(pickFilter(body, state, user)); } catch { /* send as it is */ }
      return send(body);
    };
    return next();
  };

  router.get("/chat/v2/threads", filterJson((body, state, user) =>
    Array.isArray(body) ? filterThreadsForBlocks(body, state, meIdsFor(user)) : body));

  router.get(["/creators/invitations", "/creators/invitations/pending", "/creator/invitations"], filterJson((body, state) => {
    if (!body || typeof body !== "object" || !Array.isArray(body.invitations)) return body;
    const pick = (r: any) => [r?.brand_id];
    const invitations = filterByPerson(body.invitations, state, pick);
    const pending = Array.isArray(body.pending) ? filterByPerson(body.pending, state, pick) : body.pending;
    return { ...body, invitations, pending, pending_count: Array.isArray(pending) ? pending.length : body.pending_count };
  }));

  router.get("/campaigns/:campaign_id/applications", filterJson((body, state) =>
    Array.isArray(body) ? filterByPerson(body, state, (r: any) => [r?.creator_id, r?.user_id, r?.creator?.user_id]) : body));

  return { stateFor: safeState, forget };
}
