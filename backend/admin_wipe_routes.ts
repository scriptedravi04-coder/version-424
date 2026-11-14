import express from "express";
import { adminTargetBlock, countFullAdmins, isAdminAccount } from "./adminTargetGuard";
import bcrypt from "bcryptjs";
import { logIgnored } from "./logIgnored";
import { cronAuthorized } from "./emailLinks";
import { WIPE_UNLINK_COLUMNS, wipePlan, activeMoney, wipeLocal } from "./accountWipe";

// Session 27, rule 56. POST /admin/users/:id/wipe — "Complete wipe out" (see accountWipe.ts).
//   WHO:  a full admin (role "admin"), re-entering their own password. Not a sub-admin.
//         Never yourself, never another admin.
//   Money in flight: allowed (testing tool), but only after the admin confirms it (`force`).
// The normal delete (bin, restorable) stays at POST /admin/users/:id/delete.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failures = new Map<string, number[]>();
const FAIL_WINDOW_MS = 15 * 60 * 1000;

export async function passwordMatches(password: string, row: any): Promise<boolean> {
  const hash = String(row?.password_hash || "");
  const pw = String(password || "");
  if (!pw) return false;
  if (hash.startsWith("$2")) {
    try { return await bcrypt.compare(pw, hash); } catch { return false; }
  }
  if (hash.startsWith("mock_hash_")) return hash === "mock_hash_" + pw;
  return Boolean((hash && hash === pw) || (row?.password && row.password === pw));
}

export function setupAdminWipeRoutes(
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    logAdminAction,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    logAdminAction: (user: any, action: any, targetType: any, targetId: any, detail: any) => Promise<any>;
  }
) {
  router.post("/admin/users/:id/wipe", async (req, res) => {
    const admin = await parseAuthUser(req);
    if (!admin || admin.role !== "admin" || admin.team_role === "sub_admin") {
      return res.status(403).json({ error: "Only a full admin can wipe an account.", code: "ADMIN_ONLY" });
    }
    const targetParam = String(req.params.id || "").trim();
    const password = String(req.body?.password || "");
    if (!targetParam) return res.status(400).json({ error: "Which account?" });
    if (!password) return res.status(400).json({ error: "Enter your admin password to confirm.", code: "PASSWORD_REQUIRED" });

    // Brute-force guard on the password prompt.
    const key = String(admin.user_id);
    const now = Date.now();
    const recent = (failures.get(key) || []).filter((t) => now - t < FAIL_WINDOW_MS);
    if (recent.length >= 5) return res.status(429).json({ error: "Too many wrong passwords. Try again in 15 minutes.", code: "TOO_MANY_ATTEMPTS" });

    const client = privilegedSupabase || null;
    if (supabase && !client) {
      return res.status(503).json({ error: "The service key is not set on the server, so a full wipe is not possible.", code: "SERVICE_KEY_MISSING" });
    }
    const db = getDb();

    // 1. The admin's own password.
    let adminRow: any = (db.users || []).find((u: any) => u.user_id === admin.user_id) || null;
    if (client) {
      try {
        const { data } = await client.from("users").select("*").eq("user_id", admin.user_id).limit(1);
        if (data?.[0]) adminRow = data[0];
      } catch (e) { logIgnored("admin_wipe:admin-row", e); }
    }
    if (!(await passwordMatches(password, adminRow))) {
      recent.push(now);
      failures.set(key, recent);
      return res.status(401).json({ error: "Wrong admin password.", code: "WRONG_PASSWORD" });
    }
    failures.delete(key);

    // 2. The target — an account (users) or an unclaimed creator profile.
    let targetUser: any = (db.users || []).find((u: any) => u.user_id === targetParam) || null;
    let profile: any = (db.creator_profiles || []).find((p: any) => p.user_id === targetParam || String(p.id) === targetParam) || null;
    if (client) {
      try {
        const { data } = await client.from("users").select("*").eq("user_id", targetParam).limit(1);
        if (data?.[0]) targetUser = data[0];
        const { data: p1 } = await client.from("creator_profiles").select("*").eq("user_id", targetParam).limit(1);
        if (p1?.[0]) profile = p1[0];
        else if (UUID_RE.test(targetParam)) {
          const { data: p2 } = await client.from("creator_profiles").select("*").eq("id", targetParam).limit(1);
          if (p2?.[0]) profile = p2[0];
        }
        if (!targetUser && profile?.user_id) {
          const { data: u2 } = await client.from("users").select("*").eq("user_id", profile.user_id).limit(1);
          if (u2?.[0]) targetUser = u2[0];
        }
      } catch (e) { logIgnored("admin_wipe:target", e); }
    }
    if (!targetUser && !profile) return res.status(404).json({ error: "Account not found.", code: "NOT_FOUND" });
    const uid = String(targetUser?.user_id || profile?.user_id || targetParam);
    if (uid === String(admin.user_id)) return res.status(400).json({ error: "You cannot wipe your own account.", code: "SELF" });
    // v288 (Ravi): admin / sub-admin accounts can be wiped too — by a full admin, never the last full
    // admin (rule 56, see adminTargetGuard.ts). Their admin_permissions rows go with them (wipePlan).
    const targetIsAdmin = isAdminAccount(targetUser);
    if (targetIsAdmin) {
      const block = adminTargetBlock(admin, targetUser, await countFullAdmins(client, db));
      if (block) return res.status(block.status).json({ error: block.error, code: block.code });
    }
    // 3–5 (v404: shared with the 30-day purge job).
    const forced = req.body?.force === true;
    const w = await wipeAccountData({ client, db, uid, targetParam, targetUser, profile, force: forced });
    const { blocking, ids, report, errors, email } = w;
    if (w.stopped) {
      return res.status(409).json({
        error: "This account has money in escrow. Tick \"Wipe anyway\" to delete it together with those deals.",
        code: "WIPE_HAS_ACTIVE_MONEY",
        items: blocking.slice(0, 20),
      });
    }

    // v399: the wipe said "wiped completely" even when the account itself was still there. Check, and say so.
    if (client && w.stillThere) {
      await logAdminAction(admin, "wipe_user_failed", "user", uid, { email, supabase: report, errors: errors.slice(0, 20), at: new Date().toISOString() }).catch(() => {});
      const why = errors.find((e) => e.startsWith("users.")) || errors[0] || "";
      return res.status(500).json({
        error: "The account could not be removed completely. Its other data was cleared — please try the wipe again.",
        code: "WIPE_INCOMPLETE",
        detail: why.slice(0, 200),
        supabase: report,
        errors,
      });
    }

    // 6. Local store.
    const localCounts = wipeLocal(db, ids);
    saveDb(db);

    await logAdminAction(admin, "wipe_user", "user", uid, {
      email, name: targetUser?.name || profile?.name || "", forced_with_money: blocking.length ? blocking.slice(0, 20) : undefined, supabase: report, local: localCounts, errors: errors.slice(0, 20),
      at: new Date().toISOString(),
    }).catch(() => {});

    return res.json({ ok: true, wiped: uid, supabase: report, local: localCounts, errors });
  });
}

/** v404: steps 3–5 of the wipe as one function, shared by the admin wipe and the 30-day purge job (below).
 *  Returns blocking (money in flight) without deleting anything when force is false. */
export async function wipeAccountData(
  { client, db, uid, targetParam, targetUser, profile, force }:
  { client: any; db: any; uid: string; targetParam: string; targetUser: any; profile: any; force: boolean },
): Promise<{ blocking: string[]; stopped: boolean; ids: any; report: Record<string, number>; errors: string[]; email: string; stillThere: boolean }> {
  const userIds = Array.from(new Set([uid, targetParam].filter(Boolean)));
  const email = String(targetUser?.email || profile?.email || "").trim().toLowerCase();
    // 3. Everything tied to the user.
    const pick = async (table: string, cols: string[], values: string[]) => {
      const rows: any[] = [];
      if (client) {
        for (const c of cols) {
          try {
            const { data, error } = await client.from(table).select("*").in(c, values).limit(5000);
            if (!error) rows.push(...(data || []));
          } catch (e) { logIgnored(`admin_wipe:pick-${table}`, e); }
        }
      }
      for (const r of db[table] || []) if (cols.some((c) => values.includes(String(r?.[c])))) rows.push(r);
      const seen = new Set<string>();
      return rows.filter((r) => { const k = String(r?.id ?? r?.campaign_id ?? JSON.stringify(r)); if (seen.has(k)) return false; seen.add(k); return true; });
    };
    const threads = await pick("chat_threads", ["creator_id", "brand_id"], userIds);
    const deals = await pick("deals", ["creator_id", "brand_id"], userIds);
    const campaigns = await pick("campaigns", ["brand_user_id"], userIds);
    const briefs = await pick("ugc_briefs", ["brand_id"], userIds);
    const ordersDirect = await pick("ugc_orders", ["creator_id", "brand_id"], userIds);
    const briefIds = briefs.map((b) => String(b.id)).filter(Boolean);
    const ordersOfBriefs = briefIds.length ? await pick("ugc_orders", ["brief_id"], briefIds) : [];
    const orders = [...ordersDirect, ...ordersOfBriefs.filter((o) => !ordersDirect.some((d) => d.id === o.id))];

    // 4. Money in flight (Ravi, session 27: the wipe is a testing tool, so it is NOT blocked).
    //    The admin is told once and must send `force: true` to go ahead; the log records it.
    const blocking = activeMoney(deals, orders);
    if (blocking.length && !force) return { blocking, stopped: true, ids: null, report: {}, errors: [], email, stillThere: true };

    const ids = {
      userIds,
      threadIds: threads.map((t) => String(t.id)).filter(Boolean),
      dealIds: deals.map((d) => String(d.id)).filter(Boolean),
      campaignIds: campaigns.map((c) => String(c.campaign_id || c.id)).filter(Boolean),
      orderIds: orders.map((o) => String(o.id)).filter(Boolean),
      email,
    };

    // 5. Supabase, children first. A table or column that does not exist is only reported.
    const report: Record<string, number> = {};
    const errors: string[] = [];
    if (client) {
      // Session 28: signed agreement records can only be removed through this database function
      // (the table blocks normal deletes). Done first, while the thread/order ids are known.
      if (typeof client.rpc === "function") try {
        const { data: n, error } = await client.rpc("wipe_agreement_signatures", {
          p_user_id: uid, p_thread_ids: [...ids.threadIds, ...ids.orderIds], p_order_ids: ids.orderIds,
        });
        if (error) errors.push(`agreement_signatures: ${error.message || error}`);
        else report.agreement_signatures = Number(n) || 0;
      } catch (e: any) { errors.push(`agreement_signatures: ${e?.message || e}`); }
      // v399: unlink the kept records (logs etc.) first, or the users row cannot be deleted.
      for (const { table, column } of WIPE_UNLINK_COLUMNS) {
        try {
          const { error } = await client.from(table).update({ [column]: null }).in(column, ids.userIds);
          if (error && !/does not exist|schema cache|PGRST20[45]|42P01|42703/i.test(String(error.message || error.code || ""))) errors.push(`${table}.${column} (unlink): ${error.message || error}`);
        } catch (e: any) { logIgnored(`admin_wipe:unlink-${table}`, e); }
      }
      for (const step of wipePlan(ids)) {
        for (let i = 0; i < step.values.length; i += 100) {
          const chunk = step.values.slice(i, i + 100);
          try {
            const { error, count } = await client.from(step.table).delete({ count: "exact" }).in(step.column, chunk);
            if (error) { errors.push(`${step.table}.${step.column}: ${error.message || error}`); break; }
            report[step.table] = (report[step.table] || 0) + (count || 0);
          } catch (e: any) { errors.push(`${step.table}.${step.column}: ${e?.message || e}`); break; }
        }
      }
      if (profile?.id && UUID_RE.test(String(profile.id))) {
        try { await client.from("creator_profiles").delete().eq("id", profile.id); } catch (e) { logIgnored("admin_wipe:profile-id", e); }
      }
      // Payment records stay (accounting); only the wiped person's name/email are blanked.
      for (const col of ["user_id", "creator_id", "brand_id"]) {
        for (const f of ["user_email", "email", "creator_name", "brand_name", "name"]) {
          try { await client.from("transactions").update({ [f]: null }).in(col, userIds); } catch { /* column may not exist */ }
        }
      }
      // The login itself, so the same email can sign up fresh.
      let authDeleted = false;
      const authIds = [targetUser?.auth_id, targetUser?.auth_user_id, targetUser?.supabase_uid, targetUser?.id, uid]
        .map((v) => String(v || "")).filter((v) => UUID_RE.test(v));
      for (const aid of Array.from(new Set(authIds))) {
        try {
          const { error } = await client.auth.admin.deleteUser(aid);
          if (!error) { authDeleted = true; break; }
        } catch (e) { logIgnored("admin_wipe:auth-id", e); }
      }
      if (!authDeleted && email && client.auth?.admin?.listUsers) {
        try {
          for (let page = 1; page <= 10 && !authDeleted; page++) {
            const { data } = await client.auth.admin.listUsers({ page, perPage: 1000 });
            const hit = (data?.users || []).find((u: any) => String(u.email || "").toLowerCase() === email);
            if (hit) { const { error } = await client.auth.admin.deleteUser(hit.id); authDeleted = !error; }
            if (!data?.users || data.users.length < 1000) break;
          }
        } catch (e) { logIgnored("admin_wipe:auth-email", e); }
      }
      report.auth_user = authDeleted ? 1 : 0;
    }

    let stillThere = false;
    if (client) {
      try {
        const { data } = await client.from("users").select("user_id").in("user_id", userIds).limit(1);
        stillThere = Array.isArray(data) && data.length > 0;
      } catch (e) { logIgnored("admin_wipe:verify", e); }
    }
    return { blocking, stopped: false, ids, report, errors, email, stillThere };
}

// ── v404 (QA P-1, Ravi: "kr de"): an account the user deleted themselves (Settings → Delete account) is hidden and
// login-blocked at once (is_deleted = true), and after 30 days everything is removed for good with the same
// "complete wipe" the admin panel uses. Payment records (transactions) are kept for accounting, name/email blanked.
//
// Needs the column users.deletion_requested_at (docs/database/PENDING_DB_CHANGES.md, docs/database/PENDING_DB_CHANGES.md (v404)).
// Until it exists the job does nothing (the read fails → "column_missing"). Only self-serve deletions are purged
// (deletion_reason = "self_serve"); admin "bin" deletes are never touched. Admin accounts and accounts with money
// still in escrow are skipped (no force).

export const PURGE_AFTER_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export function purgeCutoff(now: number = Date.now()): string {
  return new Date(now - PURGE_AFTER_DAYS * DAY).toISOString();
}

/** Pure: is this users row due for the purge? (the database query uses the same rules) */
export function purgeDue(row: any, now: number = Date.now()): boolean {
  if (!row || row.is_deleted !== true) return false;
  if (String(row.deletion_reason || "") !== "self_serve") return false;
  const at = Date.parse(String(row.deletion_requested_at || ""));
  if (!Number.isFinite(at)) return false;
  if (isAdminAccount(row)) return false;
  return at <= now - PURGE_AFTER_DAYS * DAY;
}

export async function runAccountPurge(
  { client, getDb, saveDb, logAdminAction }: { client: any; getDb: () => any; saveDb: (db: any) => void; logAdminAction?: (...a: any[]) => Promise<any> },
  { now = Date.now(), limit = 10 }: { now?: number; limit?: number } = {},
): Promise<{ ok: boolean; skipped?: string; purged: string[]; held: string[]; failed: string[] }> {
  const out = { ok: true, purged: [] as string[], held: [] as string[], failed: [] as string[] };
  if (!client) return { ...out, skipped: "no_service_key" };
  let rows: any[] = [];
  try {
    const { data, error } = await client.from("users")
      .select("*")
      .eq("is_deleted", true)
      .eq("deletion_reason", "self_serve")
      .lt("deletion_requested_at", purgeCutoff(now))
      .limit(limit);
    if (error) return { ...out, skipped: /deletion_requested_at|deletion_reason|42703|column/i.test(String(error.message || error.code || "")) ? "column_missing" : "read_failed" };
    rows = (data || []).filter((r: any) => purgeDue(r, now));
  } catch (e) {
    logIgnored("account-purge:read", e);
    return { ...out, skipped: "read_failed" };
  }
  for (const u of rows) {
    const uid = String(u.user_id);
    try {
      const db = getDb();
      const w = await wipeAccountData({ client, db, uid, targetParam: uid, targetUser: u, profile: null, force: false });
      if (w.stopped) { out.held.push(uid); continue; }
      if (w.stillThere) { out.failed.push(uid); continue; }
      wipeLocal(db, w.ids);
      saveDb(db);
      out.purged.push(uid);
      await logAdminAction?.({ user_id: "system", name: "30-day purge", role: "admin" }, "purge_deleted_account", "user", uid, {
        email: w.email, deleted_at: u.deletion_requested_at, supabase: w.report, errors: w.errors.slice(0, 20), at: new Date(now).toISOString(),
      }).catch(() => {});
    } catch (e) {
      logIgnored("account-purge:wipe", e);
      out.failed.push(uid);
    }
  }
  if (out.purged.length || out.held.length || out.failed.length) console.log("[account-purge]", JSON.stringify(out));
  return out;
}

export function setupAccountPurge(
  router: express.Router,
  deps: { privilegedSupabase: any; getDb: () => any; saveDb: (db: any) => void; logAdminAction?: (...a: any[]) => Promise<any> },
) {
  const run = (limit?: number) => runAccountPurge({ client: deps.privilegedSupabase || null, getDb: deps.getDb, saveDb: deps.saveDb, logAdminAction: deps.logAdminAction }, { limit });

  // Cloud Scheduler (optional): POST /api/internal/cron/account-purge with x-cron-secret, once a day.
  router.post("/internal/cron/account-purge", async (req, res) => {
    if (!cronAuthorized(req.headers["x-cron-secret"])) return res.status(401).json({ error: "Unauthorized" });
    try { return res.json(await run(25)); } catch { return res.status(500).json({ error: "Purge run failed" }); }
  });

  // Also on a timer: checks every 6 hours, runs at most once a day per server.
  let last = 0;
  const tick = () => {
    if (Date.now() - last < 20 * 60 * 60 * 1000) return;
    last = Date.now();
    run(10).catch((e) => logIgnored("account-purge:tick", e));
  };
  const t = setInterval(tick, 6 * 60 * 60 * 1000);
  (t as any).unref?.();
  const first = setTimeout(tick, 10 * 60 * 1000);
  (first as any).unref?.();
}
