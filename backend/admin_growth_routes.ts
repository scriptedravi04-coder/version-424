// Session 46 (Ravi): data for the Admin Overview "Growth Command Center".
//
//   GET  /api/admin/growth          → the whole report (numbers come from backend/adminGrowth.ts)
//   POST /api/admin/growth/nudge    → send a real reminder (bell + email) to a group the report found
//
// Read-only except the reminder. No new table or column: it only reads tables that already exist
// and falls back to fewer columns when a column is missing on an older database. Reads use the
// service-role client (the browser's own client cannot see other people's rows).
import express from "express";
import { isSubAdmin } from "./adminPermissions";
import { safePromiseTimeout } from "./helpers";
import { fetchAllRows } from "./adminMoney";
import { buildGrowthReport, nudgeTargets, type GrowthRaw, type NudgeKind } from "./adminGrowth";
import { isRealVerificationRow, resolveKycStatus } from "./creatorKyc";
import { ephemeralGet, ephemeralSet } from "./ephemeralStore";

const CACHE_MS = 60 * 1000;
/** A person gets the same reminder at most once in this time. */
export const NUDGE_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
/** Most reminders one click may send. */
export const NUDGE_MAX_PER_CLICK = 100;

const isStaff = (u: any) => !!u && (u.role === "admin" || u.role === "sub_admin" || u.team_role === "sub_admin");

export function setupAdminGrowthRoutes(
  router: express.Router,
  { supabase, privilegedSupabase, getDb, parseAuthUser, logAdminAction, sendNotification, checkAdminPerm }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    parseAuthUser: (req: express.Request) => Promise<any>;
    logAdminAction: (user: any, action: any, targetType: any, targetId: any, detail: any) => Promise<any>;
    sendNotification: (db: any, userId: string, type: string, message: string) => Promise<any>;
    checkAdminPerm: (user: any, perm: string) => Promise<boolean>;
  }
) {
  const sb = () => privilegedSupabase || supabase;
  let cache: { at: number; raw: GrowthRaw } | null = null;

  /** Read one table, trying the column lists in order. null = the table could not be read at all. */
  async function grab(table: string, columnSets: string[]): Promise<any[] | null> {
    for (const cols of columnSets) {
      const r: any = await safePromiseTimeout(
        fetchAllRows((f, t) => sb().from(table).select(cols).range(f, t)),
        30000,
        { data: [], error: { message: "timeout" } } as any
      ).catch(() => ({ data: [], error: { message: "failed" } }));
      if (!r?.error) return r?.data || [];
    }
    return null;
  }

  async function loadRaw(force: boolean): Promise<GrowthRaw> {
    if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.raw;

    let raw: GrowthRaw;
    if (supabase) {
      const [users, creators, brands, campaigns, applications, deals, transactions, ugcOrders, sessions, referrals, creatorKyc, verifications] = await Promise.all([
        grab("users", ["user_id, role, created_at, name, email, phone, signup_source", "user_id, role, created_at, name, email, phone", "user_id, role, created_at, name, email", "user_id, role, created_at"]),
        grab("creator_profiles", ["user_id, name, city, state, niche, rate_card, created_at", "user_id, name, city, state, niche, rate_card", "user_id, name, city, state, rate_card", "*"]),
        grab("brand_profiles", ["user_id, company_name, city, state, is_agency, created_at", "user_id, company_name, city, state, created_at", "*"]),
        grab("campaigns", ["campaign_id, brand_user_id, brand_name, title, status, categories, budget_max, created_at", "*"]),
        grab("campaign_applications", ["application_id, campaign_id, creator_id, status, created_at", "application_id, campaign_id, creator_id, status", "*"]),
        grab("deals", ["id, application_id, campaign_id, creator_id, brand_id, agreed_amount, status, created_at, updated_at", "id, application_id, campaign_id, creator_id, brand_id, agreed_amount, status", "*"]),
        grab("transactions", [
          "id, deal_id, ugc_order_id, creator_id, gross_amount, platform_fee_amount, creator_net_amount, status, payout_status, payout_reference, refund_status, payout_requested, payout_completed_at, created_at",
          "id, deal_id, ugc_order_id, creator_id, gross_amount, platform_fee_amount, creator_net_amount, status, payout_status, payout_reference, refund_status, payout_completed_at, created_at",
          "id, deal_id, ugc_order_id, creator_id, gross_amount, platform_fee_amount, creator_net_amount, status, payout_status, payout_reference, refund_status, created_at",
          "*",
        ]),
        grab("ugc_orders", ["id, brand_id", "*"]),
        grab("user_sessions", ["user_id, created_at, last_active", "user_id, created_at", "*"]),
        grab("referrals", ["referrer_id, referred_id, status, created_at", "*"]),
        grab("creator_kyc", ["creator_id, status"]),
        grab("verifications", ["user_id, status, note, documents, created_at", "user_id, status, created_at"]),
      ]);

      // One KYC answer per creator, by the same rule the rest of the app uses (creatorKyc.ts).
      const ckBy = new Map<string, any>();
      for (const k of creatorKyc || []) if (k?.creator_id) ckBy.set(k.creator_id, k);
      const vBy = new Map<string, any[]>();
      for (const v of verifications || []) {
        if (!v?.user_id) continue;
        const l = vBy.get(v.user_id) || [];
        l.push(v);
        vBy.set(v.user_id, l);
      }
      const kyc: any[] = [];
      for (const c of creators || []) {
        const rows = (vBy.get(c.user_id) || []).filter(isRealVerificationRow).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        kyc.push({ creator_id: c.user_id, status: resolveKycStatus(ckBy.get(c.user_id), rows) });
      }

      raw = {
        users: users || [], creators: creators || [], brands: brands || [], campaigns: campaigns || [],
        applications: applications || [], deals: deals || [], transactions: transactions || [],
        ugcOrders: ugcOrders || [], sessions, referrals: referrals || [], kyc,
        // Session 58: the users.signup_source column exists (it came back in the first, widest read).
        sourceTracked: Array.isArray(users) && (users.length === 0 || Object.prototype.hasOwnProperty.call(users[0], "signup_source")),
      };
    } else {
      const db = getDb() || {};
      const ckBy = new Map<string, any>();
      for (const k of db.creator_kyc || []) ckBy.set(k.creator_id || k.user_id, k);
      raw = {
        users: db.users || [], creators: db.creator_profiles || [], brands: db.brand_profiles || [], campaigns: db.campaigns || [],
        applications: db.campaign_applications || db.applications || [], deals: db.deals || [], transactions: db.transactions || [],
        ugcOrders: db.ugc_orders || [], sessions: db.user_sessions || [], referrals: db.referrals || [],
        kyc: (db.creator_profiles || []).map((c: any) => ({
          creator_id: c.user_id,
          status: resolveKycStatus(ckBy.get(c.user_id), (db.verifications || []).filter((v: any) => v.user_id === c.user_id)),
        })),
      };
    }
    cache = { at: Date.now(), raw };
    return raw;
  }

  router.get("/admin/growth", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!isStaff(user)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    try {
      const raw = await loadRaw(String(req.query.refresh || "") === "1");
      const report: any = buildGrowthReport(raw, new Date());
      // Session 58: brands' email / phone only for full admins (any staff member, even blog-only, could read them).
      if (isSubAdmin(user) && Array.isArray(report?.unpaidBrands)) report.unpaidBrands = report.unpaidBrands.map((b: any) => ({ ...b, email: null, phone: null }));
      return res.json(report);
    } catch (e: any) {
      console.error("[admin/growth]", e?.message || e);
      return res.status(500).json({ error: "Could not build the growth report. Try again in a moment." });
    }
  });

  router.post("/admin/growth/nudge", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!isStaff(user)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    // Writing to people needs the same permission as managing users.
    if (!(await checkAdminPerm(user, "manage_users"))) {
      return res.status(403).json({ error: "You don't have permission for this. Ask the super admin to enable it for you.", code: "ADMIN_PERMISSION_MISSING", permission: "manage_users" });
    }
    const kind = String(req.body?.kind || "") as NudgeKind;
    if (kind !== "creator_profile" && kind !== "brand_payment") return res.status(400).json({ error: "Unknown reminder type." });

    try {
      // The list is rebuilt here from the database — the browser only says which group.
      const raw = await loadRaw(true);
      const targets = nudgeTargets(raw, kind, new Date());
      let sent = 0, skipped = 0;
      const sentIds: string[] = [];
      for (const t of targets) {
        if (sent >= NUDGE_MAX_PER_CLICK) { skipped++; continue; }
        const key = `growth_nudge:${kind}:${t.user_id}`;
        let recent: any = null;
        try { recent = await ephemeralGet(key); } catch { recent = null; }
        if (recent) { skipped++; continue; }
        try {
          await sendNotification(null, t.user_id, "reminder", t.message);
          try { await ephemeralSet(key, { at: Date.now() }, NUDGE_COOLDOWN_MS); } catch { /* cooldown is best effort */ }
          sent++;
          sentIds.push(t.user_id);
        } catch (e: any) {
          skipped++;
          console.warn("[growth nudge] failed for", t.user_id, e?.message || e);
        }
      }
      await logAdminAction(user, "GROWTH_REMINDER", "USER", "bulk", { kind, sent, skipped, total: targets.length, sample: sentIds.slice(0, 20) });
      return res.json({
        success: true, sent, skipped, total: targets.length,
        message: targets.length === 0
          ? "Nobody needs this reminder right now."
          : `Reminder sent to ${sent} ${sent === 1 ? "person" : "people"}${skipped ? `; ${skipped} skipped (reminded in the last 3 days or over the limit of ${NUDGE_MAX_PER_CLICK})` : ""}.`,
      });
    } catch (e: any) {
      console.error("[admin/growth/nudge]", e?.message || e);
      return res.status(500).json({ error: "Could not send reminders. Try again in a moment." });
    }
  });
}
