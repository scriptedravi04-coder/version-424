import express from "express";
import { staffTargetBlock } from "./adminTargetGuard";
import { adminTargetBlock, countFullAdmins, isAdminAccount } from "./adminTargetGuard";
import { pickMarkupSettings } from "./platformSettings";
import { referralData } from "./referralProgram";
import { safePromiseTimeout } from "./helpers";
import { restoreFromBin } from "./binRestore";
import { __resetFeeConfigCache } from "./brandFee"; // v364

// Admin campaign moderation (approve/reject a submitted campaign, delete),
// a legacy user delete/restore/ban/unban path (separate from the newer
// enforcement-panel warn/suspend/ban flow), platform-wide settings
// (markup/deduction percentages, AI review toggle), and fee/referral config
// (reads/writes go through the shared getSettings / getFullFeeAndReferralConfig
// helpers so the single source of truth for these values stays in server.ts).

/** v396 (QA M-5): which fee-config value is not allowed ("" when all fine). Pure. */
export function feeConfigProblem(body: any): string {
  const limits: Record<string, [number, number, string]> = {
    threshold_amount: [0, 1e8, "Threshold amount"], below_threshold_rate: [0, 100, "Below-threshold fee %"], above_threshold_rate: [0, 100, "Above-threshold fee %"],
    gst_rate: [0, 100, "GST %"], ugc_commission_pct: [0, 100, "UGC commission %"], min_withdrawal_amount: [0, 1e8, "Minimum withdrawal"],
    withdrawal_fee_rate: [0, 100, "Withdrawal fee %"], dispute_refund_window_days: [0, 3650, "Refund window days"],
    min_campaign_budget: [0, 1e9, "Minimum campaign budget"], max_campaign_budget: [0, 1e9, "Maximum campaign budget"],
    creator_fee_pct: [0, 30, "Creator fee %"], brand_fee_pct: [0, 30, "Brand fee %"],
  };
  for (const [k, [min, max, label]] of Object.entries(limits)) {
    if (!(k in (body || {}))) continue;
    const v = body[k];
    if (v === undefined || v === null) continue; // not sent / no value saved yet → left as it is
    if (typeof v === "string" && !v.trim()) return `${label} can't be empty.`;
    const n = Number(v);
    if (!Number.isFinite(n)) return `${label} must be a number.`;
    if (n < min || n > max) return `${label} must be between ${min} and ${max}.`;
  }
  return "";
}
export function setupAdminCampaignsSettingsRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    logAdminAction,
    sendNotification,
    getSettings,
    savePlatformSettings,
    getFullFeeAndReferralConfig,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    logAdminAction: (user: any, action: any, targetType: any, targetId: any, detail: any) => Promise<any>;
    sendNotification: (db: any, userId: any, type: any, message: any) => Promise<any>;
    getSettings: (db: any) => any;
    savePlatformSettings?: (patch: Record<string, number>) => Promise<string | null>;
    getFullFeeAndReferralConfig: () => Promise<any>;
  }
) {
  const getIsoNow = () => new Date().toISOString();

  router.get("/admin/campaigns", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    if (supabase) {
      const { data, error } = await (privilegedSupabase || supabase).from('campaigns').select('*').order('created_at', { ascending: false });
      if (!error && data) {
        return res.json(data);
      }
    }
    const db = getDb();
    res.json((db.campaigns || []).slice().reverse());
  });

  router.post("/admin/campaigns/:campaign_id/status", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    const db = getDb();
    const campaignId = req.params.campaign_id;
    const stage = req.body.stage; // Live, Rejected, etc.
    const status = stage === "Live" ? "live" : stage === "Rejected" ? "rejected" : "under_review";
    const reason = req.body.reason || "";

    if (supabase) {
       try {
         const { data: campData } = await (privilegedSupabase || supabase).from('campaigns').select('brand_user_id, title, status').eq('campaign_id', campaignId).maybeSingle()
         // v431 (admin audit #61): the phone sends expect_status "under_review" — refuse when another admin already decided
         if (req.body?.expect_status && campData && !["under_review", "pending", "draft", ""].includes(String(campData.status || "").toLowerCase())) {
           return res.status(409).json({ error: `This campaign is already ${String(campData.status).toLowerCase().replace(/_/g, " ")}.`, code: "ALREADY_DECIDED" });
         };
         const { error } = await (privilegedSupabase || supabase).from('campaigns').update({
           status: status
         }).eq('campaign_id', campaignId);
         if (error) {
           console.error("Supabase campaign status update failed:", error);
           // Session 53: say so, instead of "Campaign marked as Live" when nothing changed.
           return res.status(500).json({ error: "Could not change the campaign status: " + (error.message || "database error") });
         }
         if (campData && campData.brand_user_id) {
           if (stage === "Live") {
             await sendNotification(db, campData.brand_user_id, "CAMPAIGN_LIVE", `Your campaign '${campData.title}' is now LIVE! Creators can apply.`);
           } else if (stage === "Rejected" || stage === "Review Failed") {
             await sendNotification(db, campData.brand_user_id, "CAMPAIGN_REJECTED", `Campaign '${campData.title}' rejected: ${reason || "Policy non-compliance"}.`);
           }
         }
       } catch (syncErr) {
         console.error("Error in Supabase campaign status flow:", syncErr);
       }
    }

    const campaign = (db.campaigns || []).find(c => c.campaign_id === campaignId);
    if (campaign) {
      campaign.stage = stage;
      campaign.status = status;
      campaign.rejectReason = reason;
      
      if (stage === "Live" && campaign.brand_user_id) {
        await sendNotification(db, campaign.brand_user_id, "CAMPAIGN_LIVE", `Your campaign '${campaign.title}' is now LIVE! Creators can apply.`);
      } else if ((stage === "Rejected" || stage === "Review Failed") && campaign.brand_user_id) {
        await sendNotification(db, campaign.brand_user_id, "CAMPAIGN_REJECTED", `Campaign '${campaign.title}' rejected: ${reason || "Policy non-compliance"}.`);
      }

      saveDb(db);
      res.json({ ok: true, campaign });
    } else {
      res.json({ ok: true });
    }
  });

  router.post("/admin/users/:user_id/delete", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }

    const activeClient = privilegedSupabase || supabase;
    // v288 (Ravi, rule 56): admin / sub-admin accounts can be sent to the bin too — only by a full
    // admin, never yourself, never the last full admin. (Before, any sub-admin could bin a full admin.)
    {
      let target: any = (getDb().users || []).find((u: any) => u.user_id === req.params.user_id) || null;
      if (activeClient) {
        try { const { data } = await activeClient.from('users').select('*').eq('user_id', req.params.user_id).limit(1); if (data?.[0]) target = data[0]; } catch { /* local copy */ }
      }
      const block = adminTargetBlock(user, target || { user_id: req.params.user_id }, isAdminAccount(target) ? await countFullAdmins(activeClient, getDb()) : 99);
      if (block) return res.status(block.status).json({ error: block.error, code: block.code, detail: block.error });
    }
    if (activeClient) {
      const { error } = await activeClient.from('users').update({ is_deleted: true, banned: true }).eq('user_id', req.params.user_id);
      if (error) {
        return res.status(500).json({ error: "Failed to delete user in Supabase: " + error.message });
      }
      await activeClient.from('creator_profiles').update({ is_deleted: true, updated_at: new Date().toISOString() }).eq('user_id', req.params.user_id);
      await activeClient.from('brand_profiles').update({ is_deleted: true }).eq('user_id', req.params.user_id);
      // An unclaimed creator has only a profile row, addressed by its own id (session 27).
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.user_id)) {
        await activeClient.from('creator_profiles').update({ is_deleted: true, updated_at: new Date().toISOString() }).eq('id', req.params.user_id);
      }

      await logAdminAction(user, 'delete_user', 'user', req.params.user_id, { reason: "Deleted and sent to bin" });
    }

    const db = getDb();
    if (!db.deleted_user_ids) db.deleted_user_ids = [];
    if (!db.deleted_user_ids.includes(req.params.user_id)) {
      db.deleted_user_ids.push(req.params.user_id);
    }
    const dbUser = (db.users || []).find((u: any) => u.user_id === req.params.user_id);
    if (dbUser) {
      dbUser.is_deleted = true;
      dbUser.banned = true;
      if (dbUser.email) {
        if (!db.deleted_user_emails) db.deleted_user_emails = [];
        if (!db.deleted_user_emails.includes(dbUser.email.toLowerCase())) {
          db.deleted_user_emails.push(dbUser.email.toLowerCase());
        }
      }
    }
    // Normal delete keeps every row (Ravi, session 27): it only marks them. Data goes only with
    // the complete wipe. The profile and waitlist rows used to be removed here.
    for (const cp of db.creator_profiles || []) {
      if (cp.user_id === req.params.user_id || String(cp.id) === req.params.user_id) cp.is_deleted = true;
    }
    for (const bp of db.brand_profiles || []) {
      if (bp.user_id === req.params.user_id) bp.is_deleted = true;
    }
    for (const w of db.waitlist || []) {
      if (w.user_id === req.params.user_id || w.id === req.params.user_id) w.is_deleted = true;
    }
    saveDb(db);
    res.json({ ok: true });
  });

  router.post("/admin/users/:user_id/restore", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    // Session 58: never on yourself, and only a full admin may restore / unban an admin account.
    {
      const tb = await staffTargetBlock(user, req.params.user_id, privilegedSupabase || supabase, getDb(), "restore");
      if (tb) return res.status(tb.status).json({ error: tb.error, detail: tb.error, code: tb.code });
    }
    const activeClient = privilegedSupabase || supabase;
    const db = getDb();
    // Undo everything the normal delete did — profiles and the deleted lists too (session 27).
    await restoreFromBin(req.params.user_id, { db, client: activeClient });
    saveDb(db);
    await logAdminAction(user, 'restore_user', 'user', req.params.user_id, { reason: "Restored from bin" });
    res.json({ ok: true });
  });

  router.post("/admin/users/:user_id/unban", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    // Session 58: never on yourself, and only a full admin may restore / unban an admin account.
    {
      const tb = await staffTargetBlock(user, req.params.user_id, privilegedSupabase || supabase, getDb(), "unban");
      if (tb) return res.status(tb.status).json({ error: tb.error, detail: tb.error, code: tb.code });
    }

    const activeClient = privilegedSupabase || supabase;
    if (activeClient) {
      // Session 53: a ban also hides the account (is_deleted), so unban must bring it back too —
      // before, "User unbanned" left the account hidden and unable to log in.
      const { error } = await activeClient.from('users').update({ banned: false, is_deleted: false, suspended_until: null }).eq('user_id', req.params.user_id);
      if (error) {
        return res.status(500).json({ error: "Failed to unban user in Supabase: " + error.message });
      }
      await logAdminAction(user, 'reinstate_user', 'user', req.params.user_id, {});
    }

    const db = getDb();
    try { await restoreFromBin(req.params.user_id, { db, client: activeClient }); } catch { /* profiles stay as they are */ }
    const dbUser = db.users.find((u) => u.user_id === req.params.user_id);
    if (dbUser) {
      dbUser.banned = false;
      dbUser.is_deleted = false;
      saveDb(db);
    }
    res.json({ ok: true });
  });

  router.delete("/admin/campaigns/:campaign_id", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    if (!supabase) {
      return res.status(500).json({ error: "Supabase client not initialized" });
    }

    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('campaign_id', req.params.campaign_id);

    if (error) {
      return res.status(500).json({ error: "Failed to delete campaign from Supabase: " + error.message });
    }

    await logAdminAction(user, 'delete_campaign', 'campaign', req.params.campaign_id, {});
    res.json({ ok: true });
  });

  // Settings
  // v419 admin cleanup: removed old GET /admin/settings (replaced by /admin/fee-config)

  // v419 admin cleanup: removed old PUT /admin/settings (replaced by /admin/fee-config)

  // FEATURE 1: Fee & Referral Config Routes
  router.get("/admin/fee-config", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized. Admin access required." });
    }
    const combined = await getFullFeeAndReferralConfig();
    res.json(combined);
  });

  router.put("/admin/fee-config", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized. Admin access required." });
    }

    const db = getDb();
    if (!db.fee_configs || !Array.isArray(db.fee_configs) || db.fee_configs.length === 0) {
      db.fee_configs = [{ id: 1 }];
    }

    const body = req.body || {};
    // v396 (QA M-5): an emptied box saved 0 % (Number("") = 0) and -5 saved 0 — refuse empty / non-number / out-of-range
    const bad = feeConfigProblem(body);
    if (bad) return res.status(400).json({ error: bad, code: "BAD_FEE_VALUE" });
    for (const k of ["threshold_amount", "below_threshold_rate", "above_threshold_rate", "gst_rate", "ugc_commission_pct", "min_withdrawal_amount", "withdrawal_fee_rate", "dispute_refund_window_days", "min_campaign_budget", "max_campaign_budget", "creator_fee_pct", "brand_fee_pct"]) {
      if (body[k] === null) delete body[k]; // v396: null = keep the saved value (it used to become 0)
    }
    const current = db.fee_configs[0] || { id: 1 };

    if (body.threshold_amount !== undefined) current.threshold_amount = Math.max(0, Number(body.threshold_amount));
    if (body.below_threshold_rate !== undefined) current.below_threshold_rate = Math.max(0, Math.min(100, Number(body.below_threshold_rate)));
    if (body.above_threshold_rate !== undefined) current.above_threshold_rate = Math.max(0, Math.min(100, Number(body.above_threshold_rate)));
    if (body.gst_rate !== undefined) current.gst_rate = Math.max(0, Math.min(100, Number(body.gst_rate)));
    if (body.platform_gst_registered !== undefined) current.platform_gst_registered = Boolean(body.platform_gst_registered);
    if (body.platform_gstin !== undefined) current.platform_gstin = String(body.platform_gstin || '').trim();
    if (body.ugc_commission_pct !== undefined) current.ugc_commission_pct = Math.max(0, Math.min(100, Number(body.ugc_commission_pct)));
    if (body.min_withdrawal_amount !== undefined) current.min_withdrawal_amount = Math.max(0, Number(body.min_withdrawal_amount));
    if (body.withdrawal_fee_rate !== undefined) current.withdrawal_fee_rate = Math.max(0, Math.min(100, Number(body.withdrawal_fee_rate)));
    if (body.payout_freeze_all !== undefined) current.payout_freeze_all = Boolean(body.payout_freeze_all);
    if (body.dispute_refund_window_days !== undefined) current.dispute_refund_window_days = Math.max(0, Number(body.dispute_refund_window_days));
    if (body.min_campaign_budget !== undefined) current.min_campaign_budget = Math.max(0, Number(body.min_campaign_budget));
    if (body.max_campaign_budget !== undefined) current.max_campaign_budget = Math.max(0, Number(body.max_campaign_budget));
    // v364 (Ravi: "Admin mein Creator fee % aur Brand fee % alag alag boxes"): split model, 0–30 % each.
    if (body.fee_model !== undefined) current.fee_model = String(body.fee_model).toLowerCase() === 'split' ? 'split' : 'legacy';
    if (body.creator_fee_pct !== undefined && Number.isFinite(Number(body.creator_fee_pct))) current.creator_fee_pct = Math.max(0, Math.min(30, Number(body.creator_fee_pct)));
    if (body.brand_fee_pct !== undefined && Number.isFinite(Number(body.brand_fee_pct))) current.brand_fee_pct = Math.max(0, Math.min(30, Number(body.brand_fee_pct)));
    current.updated_at = getIsoNow();

    db.fee_configs[0] = current;
    db.platform_fee_config = current;
    saveDb(db);

    if (supabase) {
      try {
        const { error: feeSaveErr } = await (privilegedSupabase || supabase)
          .from('platform_fee_config')
          .upsert({
            id: 1,
            threshold_amount: current.threshold_amount,
            below_threshold_rate: current.below_threshold_rate,
            above_threshold_rate: current.above_threshold_rate,
            gst_rate: current.gst_rate,
            platform_gst_registered: current.platform_gst_registered,
            platform_gstin: current.platform_gstin,
            ugc_commission_pct: current.ugc_commission_pct,
            // Session 58 (Ravi): Fees & Risk controls are saved on the server now (columns added) and enforced.
            ...(current.payout_freeze_all !== undefined ? { payout_freeze_all: Boolean(current.payout_freeze_all) } : {}),
            ...(current.min_withdrawal_amount !== undefined ? { withdrawal_min_limit: Number(current.min_withdrawal_amount) || 0 } : {}),
            ...(current.min_campaign_budget !== undefined ? { min_campaign_budget: Number(current.min_campaign_budget) || null } : {}),
            ...(current.max_campaign_budget !== undefined ? { max_campaign_budget: Number(current.max_campaign_budget) || null } : {}),
            ...(current.withdrawal_fee_rate !== undefined ? { withdrawal_fee_rate: Number(current.withdrawal_fee_rate) || 0 } : {}),
            ...(current.dispute_refund_window_days !== undefined ? { dispute_refund_window_days: Number(current.dispute_refund_window_days) || null } : {}),
            ...(current.fee_model !== undefined ? { fee_model: current.fee_model } : {}), // v364
            ...(current.creator_fee_pct !== undefined ? { creator_fee_pct: Number(current.creator_fee_pct) } : {}),
            ...(current.brand_fee_pct !== undefined ? { brand_fee_pct: Number(current.brand_fee_pct) } : {}),
            updated_at: current.updated_at
          });
        // v365 (deep test): a failed save used to answer "saved" — the fees in Admin and the live fees could differ
        if (feeSaveErr) return res.status(502).json({ error: `Couldn't save the fees: ${feeSaveErr.message || "database error"}. Nothing changed live.` });
        __resetFeeConfigCache(); // v364: the new % apply to the next quote at once
      } catch (err) {
        console.error("Failed to sync fee config to Supabase:", err);
      }
    }

    await logAdminAction(user, 'edited_fees', 'platform_settings', 'fee-config', current);

    const full = await getFullFeeAndReferralConfig();
    res.json(full);
  });

  router.post("/admin/fee-config", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized. Admin access required." });
    }

    const body = req.body || {};
    const creator_referral_reward = body.creator_referral_reward !== undefined ? Number(body.creator_referral_reward) : 500;
    const brand_referral_reward = body.brand_referral_reward !== undefined ? Number(body.brand_referral_reward) : 1000;
    const referral_trigger_action = body.referral_trigger_action ? String(body.referral_trigger_action) : 'first_completed_collab';
    const referral_monthly_cap = body.referral_monthly_cap !== undefined ? Number(body.referral_monthly_cap) : 10;
    const referral_enabled = body.referral_enabled !== undefined ? Boolean(body.referral_enabled) : true;
    // v378 (QA L6): rewards and the monthly cap must be real, non-negative numbers (−9999 was saved).
    const okNum = (v: number, max: number) => Number.isFinite(v) && v >= 0 && v <= max;
    if (!okNum(creator_referral_reward, 100000) || !okNum(brand_referral_reward, 100000) || !okNum(referral_monthly_cap, 1000)) {
      return res.status(400).json({ error: "Referral rewards must be between ₹0 and ₹1,00,000, and the monthly cap between 0 and 1,000.", detail: "Referral rewards must be between ₹0 and ₹1,00,000, and the monthly cap between 0 and 1,000." });
    }

    const refObj = {
      creator_referral_reward,
      brand_referral_reward,
      referral_trigger_action,
      referral_monthly_cap,
      referral_enabled,
      updated_at: getIsoNow()
    };

    const db = getDb();
    db.referral_config = refObj;

    // Also sync with fee_configs[0]
    if (db.fee_configs && db.fee_configs[0]) {
      db.fee_configs[0] = { ...db.fee_configs[0], ...refObj };
    }
    saveDb(db);

    // Save to Supabase referral_config if available
    if (supabase) {
      try {
        const dbTriggerCondition = 'first_paid_collab_completed';
        await safePromiseTimeout(
          (privilegedSupabase || supabase)
            .from('referral_config')
            .upsert({
              id: 'singleton',
              creator_referral_reward,
              brand_referral_reward,
              trigger_condition: dbTriggerCondition,
              monthly_cap_per_user: referral_monthly_cap,
              is_active: referral_enabled,
              updated_at: getIsoNow()
            }, { onConflict: 'id' }),
          5000,
          null
        );
      } catch (err) {
        console.error("Supabase referral_config upsert error:", err);
      }
    }

    await logAdminAction(user, 'edited_referrals', 'platform_settings', 'referral-config', refObj);

    res.json({
      success: true,
      message: "Referral program configuration updated!",
      config: refObj
    });
  });

  router.get("/admin/referrals", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized. Admin access required." });
    }
    const full = await getFullFeeAndReferralConfig();
    // Session 38: the activity list read only this server's local file (empty on a fresh
    // instance, lost on deploy). It now uses the same Supabase-first list as the referral
    // programme (backend/referralProgram.ts), newest first, with names filled in.
    let activity: any[] = [];
    try {
      const rows = await referralData({ supabase, privilegedSupabase, getDb, saveDb }).allReferrals();
      activity = rows.sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).slice(0, 500);
      const ids = Array.from(new Set(activity.flatMap((r: any) => [r.referrer_id, r.referred_id]).filter(Boolean).map(String)));
      const names = new Map<string, any>();
      const client = privilegedSupabase || supabase;
      for (let i = 0; client && i < ids.length; i += 200) {
        const { data } = await client.from("users").select("user_id, name, email, role").in("user_id", ids.slice(i, i + 200));
        for (const u of data || []) names.set(String(u.user_id), u);
      }
      activity = activity.map((r: any) => {
        const referrer = names.get(String(r.referrer_id));
        const referred = names.get(String(r.referred_id));
        return {
          ...r,
          referrer_name: r.referrer_name || referrer?.name || referrer?.email || r.referrer_id || "—",
          referred_name: r.referred_name || referred?.name || referred?.email || r.referred_email || r.referred_id || "—",
          referred_type: r.referred_type || referred?.role || null,
        };
      });
    } catch (e: any) {
      console.warn("[admin/referrals] activity:", e?.message || e);
    }
    res.json({
      config: full.config,
      activity
    });
  });
}
