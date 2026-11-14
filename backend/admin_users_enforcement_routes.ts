import { restoreFromBin } from "./binRestore";
import { listInhouseBrands, setInhouseBrand, inhousePinProblem } from "./directInvites"; // v419
import { readCreatorsLean } from "./inboxLean"; // v428: list reads without Instagram posts (egress)
import { payoutReleaseBlock, netAfterPartialRefund } from "./adminMoney"; // v431: payout pre-check
import { getCreatorKycStatus } from "./creatorKyc"; // v431
import { readRiskControls } from "./riskControls"; // v431
import { passwordMatches } from "./admin_wipe_routes"; // v419: admin password re-check
import { adminTargetBlock, countFullAdmins } from "./adminTargetGuard";
import bcrypt from "bcryptjs";
import { isAdminStaff, isFullAdmin, newPasswordProblem, isRlsError, SERVICE_KEY_HELP, newSupportToken, SUPPORT_MINUTES, isSupportToken, requestToken } from "./authSecurity";
import express from "express";
import { staffTargetBlock } from "./adminTargetGuard";
import { roleUpdateFor } from "./adminRoleChange";
import { MODERATION_TABLE, violationType } from "./chatModeration";
import { safePromiseTimeout } from "./helpers";

const getIsoNow = () => new Date().toISOString();

// Admin user-moderation & enforcement toolkit: warn/suspend/ban/reinstate a
// user (each with an email notification + a super-admin alert), a free-text
// custom message to a user, a user's violation history, warning templates +
// the templated-warning action, a user's activity timeline, creating new
// admin/sub-admin accounts, sending a promotional broadcast email to a chosen
// audience, the merged admin users list (users + creator/brand profiles +
// KYC + permissions in one shape), and team-role/permission management.
// Session 53 (security): warn / suspend / ban follow the same rule as delete — never yourself, and only a
// full admin may act on an admin account. Before, a sub-admin could ban the Super Admin through the API.
async function enforcementBlock(actor: any, targetId: string, client: any, db: any) {
  let target: any = null;
  try {
    if (client) {
      const { data } = await client.from("users").select("user_id,role,team_role").eq("user_id", targetId) /* Session 58: users has no is_admin column — the query errored and the guard let everything through */.maybeSingle();
      target = data || null;
    }
  } catch { target = null; }
  if (!target) target = (db?.users || []).find((u: any) => u.user_id === targetId) || null;
  const block = adminTargetBlock(actor, target, await countFullAdmins(client, db));
  return block ? { ...block, error: block.error.replace("delete or wipe", "warn, suspend or ban") } : null;
}


/** v396 (Ravi: "waitlist se approve karte hi creator waitlist se chala jata hai na?"): Users → Unclaimed used to list
 *  EVERY waitlist creator row (pending and rejected too) as a made-up unclaimed creator, and an approved one twice
 *  (its real unclaimed profile + the row). Pending / rejected people belong to the Waitlist only; an approved row is
 *  shown here only for old approvals that never got a real profile (no linked account, handle not on any profile). */
export function waitlistNeedsShadowRow(w: any, profiles: any[]): boolean {
  if (String(w?.status || "").toLowerCase() !== "approved") return false;
  if (String(w?.linked_user_id || "").trim()) return false;
  const h = String(w?.social_handle || w?.handle || "").replace(/^@+/, "").trim().toLowerCase();
  const e = String(w?.email || "").trim().toLowerCase();
  return !(profiles || []).some((c: any) =>
    (h && String(c?.instagram_handle || c?.handle || "").replace(/^@+/, "").trim().toLowerCase() === h) ||
    (e && String(c?.email || "").trim().toLowerCase() === e));
}

export function setupAdminUsersEnforcementRoutes(
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
    sendActivityNotificationEmail,
    sendSuperAdminAlertEmail,
    checkAdminPerm,
    getUserPassword,
    recordUserPassword,
    DEFAULT_WARNING_TEMPLATES,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    logAdminAction: (user: any, action: any, targetType: any, targetId: any, detail: any) => Promise<any>;
    sendNotification: (db: any, userId: any, type: any, message: any) => Promise<any>;
    sendActivityNotificationEmail: (opts: any) => Promise<any>;
    sendSuperAdminAlertEmail: (opts: any) => Promise<any>;
    checkAdminPerm: (user: any, perm: string) => Promise<boolean>;
    getUserPassword: (userId: string | null | undefined, email?: string | null | undefined) => string | null;
    recordUserPassword: (userId: string | null | undefined, email: string | null | undefined, password: string | null | undefined) => void;
    DEFAULT_WARNING_TEMPLATES: any[];
  }
) {
  router.post("/admin/users/:id/warn", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || user.role !== "admin") return res.status(403).json({ detail: "Admin only", _status: 403 });
    const targetId = req.params.id;
    {
      const block = await enforcementBlock(user, targetId, privilegedSupabase || supabase, getDb());
      if (block) return res.status(block.status).json({ error: block.error, detail: block.error, code: block.code });
    }
    const reason = req.body.reason || "Policy Violation";

    if (!supabase) {
      return res.status(500).json({ error: "Supabase client not initialized" });
    }

    // Session 35: users has no suspended / is_suspended column, so this update failed every time and
    // the warning was never saved (500). A warning = violation record + email (below); no column write.

    const { error: violErr } = await (privilegedSupabase || supabase).from('user_violations').insert({
      user_id: targetId,
      violation_type: "Warning",
      reason: reason
    });

    if (violErr) {
      return res.status(500).json({ error: "Failed to write warning to database: " + violErr.message });
    }

    // Fetch target user for Resend email delivery
    let targetEmail = '';
    let targetName = 'User';
    try {
      const { data: tu } = await (privilegedSupabase || supabase).from('users').select('email, name').eq('user_id', targetId).maybeSingle();
      if (tu) {
        targetEmail = tu.email || '';
        targetName = tu.name || 'User';
      }
    } catch (e) { console.warn("Error getting target user for warn email:", e); }

    if (targetEmail) {
      sendActivityNotificationEmail({
        toEmail: targetEmail,
        recipientName: targetName,
        type: 'WARNING',
        message: `An official warning has been issued on your account for: ${reason}. Please review platform compliance guidelines.`
      }).catch((err: any) => console.warn("Failed to send warning email:", err));
    }

    sendSuperAdminAlertEmail({
      subject: `Account Warning Issued: ${targetName}`,
      title: `Official Warning Issued to User`,
      details: `Target User: ${targetName} (${targetEmail || targetId})\nIssued By: ${user.name || user.email}\nReason: ${reason}`
    }).catch((err: any) => console.warn("Super admin alert failed:", err));

    await logAdminAction(user, 'warn_user', 'user', targetId, { reason });
    res.json({ ok: true });
  });

  router.post("/admin/users/:id/suspend", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || user.role !== "admin") return res.status(403).json({ detail: "Admin only", _status: 403 });
    const targetId = req.params.id;
    {
      const block = await enforcementBlock(user, targetId, privilegedSupabase || supabase, getDb());
      if (block) return res.status(block.status).json({ error: block.error, detail: block.error, code: block.code });
    }
    const duration = req.body.duration || "Suspended";
    const reason = req.body.reason || "Suspended";

    if (!supabase) {
      return res.status(500).json({ error: "Supabase client not initialized" });
    }

    const { error: violErr } = await (privilegedSupabase || supabase).from('user_violations').insert({
      user_id: targetId,
      violation_type: "Suspension",
      reason: `${reason} (Duration: ${duration})`
    });

    if (violErr) {
      return res.status(500).json({ error: "Failed to write suspension to database: " + violErr.message });
    }

    // Session 58: the suspension now really blocks the account (it used to be only a record + email). Duration in days.
    const days = Math.min(365, Math.max(1, parseInt(String(duration), 10) || 7));
    const until = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
    const { error: susErr } = await (privilegedSupabase || supabase).from('users').update({ suspended_until: until }).eq('user_id', targetId);
    if (susErr) return res.status(502).json({ error: "Couldn't suspend the account: " + susErr.message });
    try { await (privilegedSupabase || supabase).from('user_sessions').delete().eq('user_id', targetId); } catch { /* login is refused anyway */ }
    (req.app as any)?.get?.("authLookup")?.forgetAll?.();

    let targetEmail = '';
    let targetName = 'User';
    try {
      const { data: tu } = await (privilegedSupabase || supabase).from('users').select('email, name').eq('user_id', targetId).maybeSingle();
      if (tu) {
        targetEmail = tu.email || '';
        targetName = tu.name || 'User';
      }
    } catch (e) { console.warn("Error getting target user for suspend email:", e); }

    if (targetEmail) {
      sendActivityNotificationEmail({
        toEmail: targetEmail,
        recipientName: targetName,
        type: 'SUSPEND',
        message: `Your account has been suspended for ${parseInt(String(duration), 10) || 7} days due to: ${reason}. Please contact helpdesk if you believe this is an error.`
      }).catch((err: any) => console.warn("Failed to send suspend email:", err));
    }

    sendSuperAdminAlertEmail({
      subject: `Account Suspended: ${targetName}`,
      title: `User Account Temporarily Suspended`,
      details: `Target User: ${targetName} (${targetEmail || targetId})\nDuration: ${duration}\nReason: ${reason}\nAdmin: ${user.name || user.email}`
    }).catch((err: any) => console.warn("Super admin alert failed:", err));

    await logAdminAction(user, 'suspend_user', 'user', targetId, { duration, reason });
    res.json({ ok: true });
  });

  // v419 (Ravi): Ybex in-house brands — ₹500 minimum instead of ₹3,000, and "Pay" records the deal as funded by Ybex
  // (no Razorpay, brand pays ₹0; Ybex pays the creator from Payouts as usual). Full admins only, logged.
  const inhouseFails = new Map<string, number[]>(); // v419
  router.get("/admin/inhouse-brands", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || !isAdminStaff(user)) return res.status(403).json({ detail: "Admin only", _status: 403 });
    res.json({ brands: await listInhouseBrands() });
  });
  router.post("/admin/brands/:id/inhouse", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || !isFullAdmin(user)) return res.status(403).json({ detail: "Only a full admin can change this.", _status: 403 });
    const targetId = String(req.params.id || "").trim();
    if (!targetId) return res.status(400).json({ detail: "Brand missing" });
    const on = req.body?.on === true || req.body?.on === "true";
    // v419 (Ravi: "admin password chahiye… security layer"): marking / unmarking needs the admin's own password,
    // and marking also sets a pay PIN that the ₹0 in-house payment asks for. 5 wrong passwords = 15 min lock.
    const key = String(user.user_id);
    const now = Date.now();
    const recent = (inhouseFails.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
    if (recent.length >= 5) return res.status(429).json({ detail: "Too many wrong passwords. Try again in 15 minutes.", code: "TOO_MANY_ATTEMPTS" });
    const password = String(req.body?.password || "");
    if (!password) return res.status(400).json({ detail: "Enter your admin password to confirm.", code: "PASSWORD_REQUIRED" });
    const pin = String(req.body?.pin || "").trim();
    if (on && inhousePinProblem(pin)) return res.status(400).json({ detail: inhousePinProblem(pin), code: "PIN_INVALID" });
    let adminRow: any = (getDb().users || []).find((u: any) => u.user_id === user.user_id) || null;
    try {
      const { data } = await (privilegedSupabase || supabase).from("users").select("*").eq("user_id", user.user_id).limit(1);
      if (data?.[0]) adminRow = data[0];
    } catch { /* falls back to the local row */ }
    if (!(await passwordMatches(password, adminRow))) {
      recent.push(now); inhouseFails.set(key, recent);
      return res.status(401).json({ detail: "Wrong admin password.", code: "WRONG_PASSWORD" });
    }
    inhouseFails.delete(key);
    let name = "";
    try {
      const { data } = await (privilegedSupabase || supabase).from("users").select("name, role").eq("user_id", targetId).maybeSingle();
      if (data && !/brand|agency|talent/i.test(String(data.role || ""))) return res.status(400).json({ detail: "Only brand accounts can be marked in-house." });
      name = String(data?.name || "");
    } catch { /* name is only for the list */ }
    await setInhouseBrand(targetId, on, { name, by: String(user.email || user.user_id), pin: on ? pin : "" });
    await logAdminAction(user, on ? "inhouse_brand_on" : "inhouse_brand_off", "user", targetId, { name });
    res.json({ ok: true, inhouse: on });
  });

  router.post("/admin/users/:id/ban", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || user.role !== "admin") return res.status(403).json({ detail: "Admin only", _status: 403 });
    const targetId = req.params.id;
    {
      const block = await enforcementBlock(user, targetId, privilegedSupabase || supabase, getDb());
      if (block) return res.status(block.status).json({ error: block.error, detail: block.error, code: block.code });
    }

    if (!supabase) {
      return res.status(500).json({ error: "Supabase client not initialized" });
    }

    const { error } = await (privilegedSupabase || supabase).from('users').update({ banned: true, is_deleted: true }).eq('user_id', targetId);
    if (error) {
      return res.status(500).json({ error: "Failed to ban user: " + error.message });
    }

    let targetEmail = '';
    let targetName = 'User';
    try {
      const { data: tu } = await (privilegedSupabase || supabase).from('users').select('email, name').eq('user_id', targetId).maybeSingle();
      if (tu) {
        targetEmail = tu.email || '';
        targetName = tu.name || 'User';
      }
    } catch (e) { console.warn("Error getting target user for ban email:", e); }

    if (targetEmail) {
      sendActivityNotificationEmail({
        toEmail: targetEmail,
        recipientName: targetName,
        type: 'BAN',
        message: `Your Ybex Media account access has been permanently terminated due to severe platform terms violation.`
      }).catch((err: any) => console.warn("Failed to send ban email:", err));
    }

    sendSuperAdminAlertEmail({
      subject: `Account Banned: ${targetName}`,
      title: `User Account Permanently Banned`,
      details: `Target User: ${targetName} (${targetEmail || targetId})\nAction: BANNED & DELETED\nAdmin: ${user.name || user.email}`
    }).catch((err: any) => console.warn("Super admin alert failed:", err));

    await logAdminAction(user, 'ban_user', 'user', targetId, { reason: "Banned" });
    res.json({ ok: true });
  });

  router.post("/admin/users/:id/reinstate", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || user.role !== "admin") return res.status(403).json({ detail: "Admin only", _status: 403 });
    // Session 58: never on yourself, and only a full admin may restore / unban an admin account.
    {
      const tb = await staffTargetBlock(user, req.params.id, privilegedSupabase || supabase, getDb(), "reinstate");
      if (tb) return res.status(tb.status).json({ error: tb.error, detail: tb.error, code: tb.code });
    }
    const targetId = req.params.id;
    const db = getDb();
    const activeClient = privilegedSupabase || supabase;

    // 1. Update local database
    const localUser = db.users?.find((u: any) => u.user_id === targetId || u.id === targetId);
    if (localUser) {
      localUser.banned = false;
      localUser.suspended = false;
      localUser.is_suspended = false;
      localUser.is_restricted = false;
      localUser.is_deleted = false;
    }

    // Out of the bin as well: profiles and the deleted lists (session 27).
    await restoreFromBin(targetId, { db, client: activeClient });
    if (db.user_violations) {
      db.user_violations = db.user_violations.filter((v: any) => v.user_id !== targetId);
    }
    if (db.chat_violations) {
      db.chat_violations.forEach((v: any) => {
        if (v.sender_id === targetId) {
          v.status = 'RESOLVED_SAFE';
          v.resolved_by = user.user_id;
          v.resolved_at = new Date().toISOString();
        }
      });
    }
    saveDb(db);

    // 2. Update Supabase if available
    if (activeClient) {
      try {
        await activeClient.from('users').update({
          banned: false,
          is_deleted: false,
          suspended_until: null // Session 58: lifts a suspension too
        }).eq('user_id', targetId);

        await activeClient.from('user_violations').delete().eq('user_id', targetId);
      } catch (err: any) {
        console.warn("[Admin Reinstate] Supabase error:", err.message);
      }
    }

    await logAdminAction(user, 'reinstate_user', 'user', targetId, {});
    res.json({ ok: true, message: "User account reinstated and all restrictions lifted." });
  });

  // v419 admin cleanup: removed unused send-custom-message (no screen used it)

  router.get("/admin/users/:id/violations", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || user.role !== "admin") return res.status(403).json({ detail: "Admin only", _status: 403 });
    const targetId = req.params.id;
    const db = getDb();
    const activeClient = privilegedSupabase || supabase;

    let violationsList: any[] = [];

    if (activeClient) {
      try {
        const { data, error } = await activeClient
          .from('user_violations')
          .select('*')
          .eq('user_id', targetId)
          .order('created_at', { ascending: false });

        if (!error && data) {
          violationsList = data;
        }
      } catch (err: any) {
        console.warn("[Admin Violations] Supabase fetch error:", err.message);
      }
    }

    if (violationsList.length === 0) {
      const localViolations = (db.user_violations || []).filter((v: any) => v.user_id === targetId);
      const localChatViolations = (db.chat_violations || []).filter((v: any) => v.sender_id === targetId);
      
      violationsList = [
        ...localViolations.map((v: any) => ({
          id: v.id || v.notif_id,
          user_id: v.user_id,
          type: v.violation_type || 'Platform Violation',
          date: v.created_at ? v.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
          reason: v.reason || `Violation on thread ${v.thread_id || ''}`
        })),
        ...localChatViolations.map((v: any) => ({
          id: v.id,
          user_id: v.sender_id,
          type: v.violation_type === 'hard_number' ? 'Off-Platform Contact Attempt' : 'Suspicious Keyword',
          date: v.detected_at ? v.detected_at.split('T')[0] : new Date().toISOString().split('T')[0],
          reason: `Attempted: "${v.message_content_attempted || v.content || ''}" (${v.status || 'DETECTED'})`
        }))
      ];
    } else {
      violationsList = violationsList.map(v => ({
        id: v.id,
        user_id: v.user_id,
        type: v.violation_type,
        date: v.created_at ? v.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
        reason: v.reason || 'Account policy violation'
      }));
    }

    // Session 38: blocked chat messages of this user, from chat_moderation_events (Supabase).
    if (activeClient) {
      try {
        const { data: chatRows } = await activeClient.from(MODERATION_TABLE).select('*').eq('sender_id', targetId).order('created_at', { ascending: false }).limit(200);
        for (const ev of chatRows || []) {
          if (violationsList.some((v: any) => v.id === ev.id)) continue;
          violationsList.push({
            id: ev.id,
            user_id: ev.sender_id,
            type: violationType(ev) === 'hard_number' ? 'Off-Platform Contact Attempt' : 'Suspicious Keyword',
            date: ev.created_at ? String(ev.created_at).split('T')[0] : new Date().toISOString().split('T')[0],
            reason: `Attempted: "${ev.content || ''}" (${ev.status === 'OPEN' ? 'DETECTED' : ev.status})`
          });
        }
      } catch (err: any) {
        console.warn("[Admin Violations] chat moderation fetch error:", err.message);
      }
    }

    res.json(violationsList);
  });

  // FEATURE 1: Warning Templates & Enforcement Warning Routes
  router.get("/admin/templates", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized. Admin access required." });
    }

    const db = getDb();
    if (!db.warning_templates || db.warning_templates.length === 0) {
      db.warning_templates = [...DEFAULT_WARNING_TEMPLATES];
      saveDb(db);
    }

    const subtype = req.query.subtype as string;
    let templates = db.warning_templates;
    if (subtype) {
      templates = templates.filter((t: any) => !t.subtype || t.subtype === subtype);
    }

    res.json(templates);
  });

  router.post("/admin/enforcement/warning", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized. Admin access required." });
    }

    const { target_user_id, template_id, custom_note, channels } = req.body || {};
    if (!target_user_id) {
      return res.status(400).json({ error: "target_user_id is required" });
    }
    // Session 58: same rule as warn / suspend / ban (a sub-admin could formally warn the Super Admin).
    {
      const wb = await enforcementBlock(user, String(target_user_id), privilegedSupabase || supabase, getDb());
      if (wb) return res.status(wb.status).json({ error: wb.error, code: wb.code });
    }
    if (!template_id && (!custom_note || !String(custom_note).trim())) {
      return res.status(400).json({ error: "Either template_id or custom_note must be provided" });
    }

    const db = getDb();
    const allTemplates = (db.warning_templates && db.warning_templates.length > 0) ? db.warning_templates : DEFAULT_WARNING_TEMPLATES;
    const matchedTemplate = template_id ? allTemplates.find((t: any) => t.template_id === template_id || t.id === template_id) : null;

    let warningText = "";
    if (matchedTemplate && custom_note && String(custom_note).trim()) {
      warningText = `${matchedTemplate.name}: ${String(custom_note).trim()}`;
    } else if (matchedTemplate) {
      warningText = matchedTemplate.text || matchedTemplate.name;
    } else {
      warningText = String(custom_note || "").trim();
    }

    const warningReason = matchedTemplate?.name || (custom_note ? (String(custom_note).length > 60 ? String(custom_note).substring(0, 57) + '...' : String(custom_note)) : "Policy Violation");
    const activeChannels = Array.isArray(channels) ? channels : ["in_app", "email"];
    const now = getIsoNow();
    const violId = `viol_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const violItem = {
      id: violId,
      user_id: target_user_id,
      violation_type: "Warning",
      reason: warningText || warningReason,
      created_at: now
    };

    if (!db.user_violations) db.user_violations = [];
    db.user_violations.unshift(violItem);

    // Update target user warning count & timestamp in local DB
    const targetUser = (db.users || []).find((u: any) => u.user_id === target_user_id || u.id === target_user_id);
    if (targetUser) {
      targetUser.warning_count = (targetUser.warning_count || 0) + 1;
      targetUser.last_warning_at = now;
      targetUser.last_warning_reason = warningReason;
    }

    // Channel 1: In-app notification
    if (activeChannels.includes("in_app")) {
      await sendNotification(db, target_user_id, "WARNING", `Official Warning: ${warningText || warningReason}`);
    }

    saveDb(db);

    // Record warning in Supabase user_violations
    if (supabase) {
      try {
        const { error: vErr } = await (privilegedSupabase || supabase).from('user_violations').insert({
          user_id: target_user_id,
          violation_type: "Warning",
          reason: warningText || warningReason
        });
        if (vErr) console.error("[Admin Warning] warning not recorded:", vErr.message); // Session 58: supabase-js doesn't throw
      } catch (sErr: any) {
        console.warn("[Admin Warning] Supabase violation write notice:", sErr.message || sErr);
      }
    }

    // Channel 2: Email notification via Resend
    let targetEmail = targetUser?.email || '';
    let targetName = targetUser?.name || targetUser?.full_name || 'User';

    if (!targetEmail && supabase) {
      try {
        const { data: tu } = await (privilegedSupabase || supabase).from('users').select('email, name').eq('user_id', target_user_id).maybeSingle();
        if (tu) {
          targetEmail = tu.email || '';
          targetName = tu.name || targetName;
        }
      } catch (e) {
        console.warn("[Admin Warning] Error fetching user profile for warning email:", e);
      }
    }

    if (activeChannels.includes("email")) {
      if (targetEmail) {
        sendActivityNotificationEmail({
          toEmail: targetEmail,
          recipientName: targetName,
          type: 'WARNING',
          message: `An official warning has been issued on your account: ${warningText}. Please review platform compliance guidelines.`
        }).catch((err: any) => console.warn("[Admin Warning] Failed to send warning email via Resend:", err));
      }

      sendSuperAdminAlertEmail({
        subject: `Account Warning Issued: ${targetName}`,
        title: `Official Warning Issued to User`,
        details: `Target User: ${targetName} (${targetEmail || target_user_id})\nIssued By: ${user.name || user.email}\nReason: ${warningText}\nChannels: ${activeChannels.join(', ')}`
      }).catch((err: any) => console.warn("[Admin Warning] Super admin alert failed:", err));
    }

    // Log admin action
    await logAdminAction(user, 'warn_user', 'user', target_user_id, {
      template_id: template_id || null,
      template_name: matchedTemplate?.name || null,
      custom_note: custom_note || null,
      warning_text: warningText,
      channels: activeChannels
    });

    res.json({
      success: true,
      message: "Warning issued successfully",
      warning: violItem
    });
  });

  router.get("/admin/users/:id/timeline", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || !(await checkAdminPerm(user, 'manage_users'))) {
      if (user?.role !== 'admin') return res.status(403).json({ detail: "Requires manage_users permission" });
    }
    
    if (!supabase) return res.json([]);
    
    const { data, error } = await (privilegedSupabase || supabase)
      .from('user_activity_timeline')
      .select('*')
      .eq('user_id', req.params.id)
      .order('event_at', { ascending: false })
      .limit(100);
      
    if (error) {
      console.error("Timeline error:", error);
      return res.status(500).json({ error: error.message });
    }
    return res.json(data || []);
  });

  router.post("/admin/users/create", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || !isAdminStaff(user)) {
      return res.status(403).json({ detail: "Only admins can create accounts" });
    }

    const { name, email, password, role, team_role, permissions } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ detail: "Email and password are required" });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ detail: "Enter a valid email address." });
    }
    const finalRole = String(role || 'admin').toLowerCase();
    if (!['admin', 'sub_admin', 'creator', 'brand'].includes(finalRole)) {
      return res.status(400).json({ detail: "Unknown role." });
    }
    const finalTeamRole = ['admin', 'sub_admin'].includes(finalRole)
      ? (team_role === 'admin' ? 'admin' : 'sub_admin')
      : null;
    // Session 25: only a full (super) admin creates admin staff. A sub-admin used to be able to
    // create a "Super Admin (Full Access)" account.
    if (['admin', 'sub_admin'].includes(finalRole) && !isFullAdmin(user)) {
      return res.status(403).json({ detail: "Only a Super Admin can create admin accounts." });
    }
    const weak = newPasswordProblem(password);
    if (weak) return res.status(400).json({ detail: weak, error: weak });

    if (!supabase) {
      return res.status(500).json({ error: "Supabase client not initialized" });
    }
    if (!privilegedSupabase) {
      return res.status(503).json({ error: SERVICE_KEY_HELP, code: "SERVICE_KEY_MISSING" });
    }

    // Session 25: bcrypt (rule 48). This stored "mock_hash_<password>" — the password in plain text.
    const password_hash = await bcrypt.hash(String(password), 10);

    // Generate unique user_id
    const user_id = "user_" + Date.now() + Math.random().toString(36).substr(2, 9);
    
    // Default name if missing
    const finalName = name || email.split('@')[0];

    const dbUser = {
      user_id,
      email: cleanEmail,
      name: finalName,
      password_hash,
      role: finalRole,
      team_role: finalTeamRole,
      onboarded: true,
      verified: true,
      created_at: new Date().toISOString()
    };

    const newUser = {
      ...dbUser,
      onboarding_completed: true,
      email_verified: true,
      permissions: permissions || []
    };

    const activeClient = privilegedSupabase || supabase;
    const { error } = await activeClient.from('users').insert([dbUser]);

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: "An account with this email already exists." });
      }
      if (isRlsError(error)) {
        return res.status(503).json({ error: SERVICE_KEY_HELP, code: "SERVICE_KEY_MISSING" });
      }
      return res.status(500).json({ error: "Failed to create user in database: " + error.message });
    }

    // Update local JSON db fallback
    const localDb = getDb();
    if (!localDb.users) localDb.users = [];
    localDb.users.push(newUser);
    
    recordUserPassword(user_id, email, password);

    // Insert permissions if any
    if (permissions && Array.isArray(permissions) && permissions.length > 0) {
      const permsToInsert = permissions.map((p: any) => ({
        user_id,
        permission_key: p,
        allowed: true
      }));
      await activeClient.from('admin_permissions').insert(permsToInsert);

      if (!localDb.admin_permissions) localDb.admin_permissions = [];
      permsToInsert.forEach((p: any) => localDb.admin_permissions.push(p));
    }

    saveDb(localDb);
    
    await logAdminAction(user, 'create_user', 'user', user_id, { email, role, team_role, permissions });

    res.json({ ok: true, user: newUser });
  });

  // Session 36: POST /admin/broadcast-email moved to backend/emailBroadcasts.ts (strict audiences,
  // unsubscribe, queue within the daily Resend limit, per-recipient report, retry).

  router.get("/admin/users", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || !(await checkAdminPerm(user, 'manage_users'))) {
      if (user?.role !== 'admin') {
         return res.status(403).json({ detail: "Requires manage_users permission" });
      }
    }
    
    let usersData: any[] = [];
    let permData: any[] = [];
    let creatorProfilesData: any[] = [];
    let brandProfilesData: any[] = [];
    let creatorKycData: any[] = [];
    let brandKycData: any[] = [];
    let verifData: any[] = [];

    if (supabase) {
      try {
        const [uRes, pRes, cpRes, bpRes, ckRes, bkRes, vRes, wRes] = await Promise.all([
          safePromiseTimeout((privilegedSupabase || supabase).from('users').select('*').order('created_at', { ascending: false }).limit(5000), 15000, { data: [], error: null }),
          safePromiseTimeout((privilegedSupabase || supabase).from('admin_permissions').select('*'), 15000, { data: [], error: null }),
          safePromiseTimeout(readCreatorsLean(privilegedSupabase || supabase), 15000, { data: [], error: null }),
          safePromiseTimeout((privilegedSupabase || supabase).from('brand_profiles').select('*'), 15000, { data: [], error: null }),
          safePromiseTimeout((privilegedSupabase || supabase).from('creator_kyc').select('*'), 15000, { data: [], error: null }),
          safePromiseTimeout((privilegedSupabase || supabase).from('brand_kyc').select('*'), 15000, { data: [], error: null }),
          safePromiseTimeout((privilegedSupabase || supabase).from('verifications').select('*'), 15000, { data: [], error: null }),
          safePromiseTimeout((privilegedSupabase || supabase).from('waitlist').select('*'), 15000, { data: [], error: null })
        ]);
        usersData = uRes.data || [];
        permData = pRes.data || [];
        creatorProfilesData = cpRes.data || [];
        brandProfilesData = bpRes.data || [];
        creatorKycData = ckRes.data || [];
        brandKycData = bkRes.data || [];
        verifData = vRes.data || [];
        if (wRes.data && Array.isArray(wRes.data)) {
          wRes.data.forEach((w: any) => {
            if (w && w.role !== 'brand' && !w.company_name && waitlistNeedsShadowRow(w, creatorProfilesData)) { // v396
              const uId = w.id || w.user_id || w.linked_user_id;
              const photo = w.profile_photo_url || w.photo || w.picture || '';
              if (uId && !creatorProfilesData.some((c: any) => c.user_id === uId)) {
                creatorProfilesData.push({
                  user_id: uId,
                  name: w.name || "Creator",
                  email: w.email || "",
                  is_claimed: false,
                  photo: photo,
                  picture: photo,
                  phone: w.phone || w.mobile || "",
                  city: w.city || "",
                  state: w.state || "",
                  instagram_handle: w.social_handle || w.handle || "",
                  handle: w.handle || w.social_handle || "",
                  follower_count: Number(w.followers || 0),
                  primary_niche: w.niche || w.category || "Fashion & Lifestyle",
                  rate_reel: Number(w.pricing?.reel || w.rate_reel || 0),
                  charges: w.charges || "",
                  created_at: w.created_at || getIsoNow(),
                  profile_status: w.status?.toLowerCase() === 'approved' ? 'approved' : 'pending'
                });
              }
            }
          });
        }
      } catch (err) {
        console.warn("[/admin/users Supabase fetch error]", err);
      }
    }

    const db = getDb();
    const deletedUserIds = new Set(db.deleted_user_ids || []);
    const deletedEmails = new Set((db.deleted_user_emails || []).map((e: string) => String(e).toLowerCase()));

    if (!usersData || usersData.length === 0) {
      usersData = db.users || [];
    } else {
      const existingIds = new Set(usersData.map((u: any) => u.user_id));
      (db.users || []).forEach((u: any) => {
        if (!existingIds.has(u.user_id)) {
          usersData.push(u);
          existingIds.add(u.user_id);
        }
      });
    }

    // Deleted (bin) accounts are KEPT in the list, marked is_deleted — the admin panel hides them
    // everywhere except the Recycle Bin, where they can be restored. They used to be filtered out
    // here, so the bin was always empty (session 27).
    const isBinned = (x: any) => x?.is_deleted === true ||
      Boolean(x?.user_id && deletedUserIds.has(x.user_id)) ||
      Boolean(x?.email && deletedEmails.has(String(x.email).toLowerCase()));
    usersData = usersData.map((u: any) => (isBinned(u) ? { ...u, is_deleted: true } : u));
    creatorProfilesData = (creatorProfilesData || []).map((cp: any) => (isBinned(cp) ? { ...cp, is_deleted: true } : cp));
    
    const localDb = getDb();
    const cpMap = new Map((creatorProfilesData || []).map((cp: any) => [cp.user_id, cp]));
    (localDb.creator_profiles || []).forEach((cp: any) => {
      if (cp.user_id && !cpMap.has(cp.user_id)) cpMap.set(cp.user_id, cp);
    });

    // Also include any localDb waitlist creators as shadow profiles
    (localDb.waitlist || []).forEach((w: any) => {
      if (w && w.role !== 'brand' && !w.company_name && waitlistNeedsShadowRow(w, Array.from(cpMap.values()))) { // v396
        const uId = w.user_id || w.id;
        if (uId && !cpMap.has(uId)) {
          cpMap.set(uId, {
            user_id: uId,
            name: w.name || "Creator",
            email: w.email || "",
            is_claimed: false,
            phone: w.phone || w.mobile || "",
            city: w.city || "",
            state: w.state || "",
            instagram_handle: w.social_handle || w.handle || "",
            handle: w.handle || w.social_handle || "",
            follower_count: Number(w.followers || 0),
            primary_niche: w.niche || w.category || "Fashion & Lifestyle",
            charges: w.charges || "",
            created_at: w.created_at || getIsoNow()
          });
        }
      }
    });

    const bpMap = new Map((brandProfilesData || []).map((bp: any) => [bp.user_id, bp]));
    (localDb.brand_profiles || []).forEach((bp: any) => {
      if (bp.user_id && !bpMap.has(bp.user_id)) bpMap.set(bp.user_id, bp);
    });

    // v375 (Ravi: brands list should show the brand's name): brands that haven't finished setup have no
    // brand_profiles name yet — take the company name / logo / Instagram they already typed in onboarding.
    const brandSetup = new Map<string, any>();
    if (supabase) {
      try {
        const missing = (usersData || []).filter((u: any) => u.role === 'brand' && !String(bpMap.get(u.user_id)?.company_name || '').trim()).map((u: any) => u.user_id);
        if (missing.length) {
          const r: any = await safePromiseTimeout((privilegedSupabase || supabase).from('onboarding_progress').select('user_id, answers').in('user_id', missing.slice(0, 1000)), 8000, { data: [], error: null });
          for (const row of r?.data || []) {
            const a = row?.answers || {};
            const name = String(a.companyName || '').trim().slice(0, 120);
            if (name || a.logoUrl || a.instagramHandle) brandSetup.set(row.user_id, { company_name: name || null, logo: (typeof a.logoUrl === 'string' && /^https?:\/\//.test(a.logoUrl)) ? a.logoUrl : null, instagram_handle: String(a.instagramHandle || '').slice(0, 40) || null });
          }
        }
      } catch (e: any) { /* the list works without it */ }
    }

    const ckMap = new Map((creatorKycData || []).map((ck: any) => [ck.creator_id, ck]));
    const bkMap = new Map((brandKycData || []).map((bk: any) => [bk.brand_id, bk]));
    const vMap = new Map((verifData || []).map((v: any) => [v.user_id || v.verification_id, v]));

    const existingUserIds = new Set((usersData || []).map((u: any) => u.user_id));

    // Merge any creator profiles that don't have a user record yet
    for (const [userId, cp] of cpMap.entries()) {
      if (!existingUserIds.has(userId)) {
        usersData.push({
          user_id: userId,
          name: cp.name || "Creator",
          email: cp.email || "",
          role: "creator",
          auth_method: cp.is_claimed === false ? "unclaimed" : "direct",
          is_claimed: cp.is_claimed ?? false,
          is_unclaimed: cp.is_claimed === false,
          picture: cp.photo || cp.picture || null,
          created_at: cp.created_at || getIsoNow(),
          onboarded: cp.onboarding_complete ?? false,
          verified: cp.verified ?? false,
          is_deleted: cp.is_deleted === true,
          creator_profile_id: cp.id || null
        });
        existingUserIds.add(userId);
      }
    }

    const mapped = (usersData || []).map((u: any) => {
       const p = (permData || []).filter((p: any) => p.user_id === u.user_id);
       const cp: any = cpMap.get(u.user_id);
       const bp: any = bpMap.get(u.user_id);
       const ck: any = ckMap.get(u.user_id);
       const bk: any = bkMap.get(u.user_id);
       const vf: any = vMap.get(u.user_id);

       const isUnclaimed = (u.role === 'creator' || u.role === 'unclaimed' || !u.role || u.auth_method === 'unclaimed' || u.is_unclaimed === true) && (cp?.is_claimed === false || u.auth_method === 'unclaimed' || u.is_claimed === false || u.is_unclaimed === true) && u.role !== 'brand';
       // v396: "Agency" is a kind of BRAND account. A creator with a leftover brand_profiles row (from an earlier brand
       // sign-up / role switch) was listed as "Agency" — only brand accounts get it now.
       const isAgency = u.role === 'brand' && (u.is_agency === true || bp?.is_agency === true);
       const plainPass = null; // Session 24: passwords are never shown

       // Resolve comprehensive KYC & Verification status
       let kycStatus = 'NOT_SUBMITTED';
       let kycObj = null;
       if (u.role === 'brand') {
         kycObj = bk || vf;
         if (bk?.status) {
           kycStatus = bk.status.toUpperCase();
         } else if (vf?.status) {
           kycStatus = vf.status.toUpperCase();
         } else if (u.kyc_verified || bp?.verified) { // Session 58: users.verified = email, not KYC
           kycStatus = 'APPROVED';
         }
       } else {
         kycObj = ck || vf;
         if (ck?.status) {
           kycStatus = ck.status.toUpperCase();
         } else if (vf?.status) {
           kycStatus = vf.status.toUpperCase();
         } else if (u.kyc_verified || cp?.verified) {
           kycStatus = 'APPROVED';
         }
       }

       const isKycApproved = kycStatus === 'APPROVED';
       const upiId = ck?.upi_id || bk?.upi_id || u.upi_id || null;
       const bankAcc = ck?.bank_account_no || bk?.bank_account_no || null;
       const hasPaymentDetails = Boolean(upiId || bankAcc || ck?.upi_qr_code_url);

       return {
         ...u,
         user_id: u.user_id,
         name: isUnclaimed ? (cp?.name || u.name || "Creator") : (u.name || bp?.company_name || cp?.name || ""),
         email: u.email || bp?.email || cp?.email || "",
         role: isUnclaimed ? "creator" : (u.role || "creator"),
         team_role: u.team_role || null,
         created_at: u.created_at,
         picture: isUnclaimed ? (cp?.photo || cp?.picture || u.picture || null) : (u.picture || bp?.logo || cp?.photo || cp?.picture || null),
         banned: u.banned ?? false,
         suspended: u.suspended ?? false,
         is_claimed: !isUnclaimed,
         is_unclaimed: isUnclaimed,
         auth_method: isUnclaimed ? 'unclaimed' : (u.auth_method || 'direct'),
         is_agency: isAgency,
         creator_profile: cp || (isUnclaimed ? {
           user_id: u.user_id,
           name: u.name || "Creator",
           email: u.email,
           instagram_handle: u.instagram_handle || u.handle || "",
           follower_count: u.follower_count || 0,
           primary_niche: u.primary_niche || u.category || "Lifestyle",
           charges: u.charges || "",
           photo: u.picture || null,
           is_claimed: false
         } : null),
         brand_profile: bp || null,
         brand_setup: (!bp?.company_name && brandSetup.get(u.user_id)) || null, // v375: typed in onboarding, setup not finished
         kyc: kycObj || null,
         kyc_status: kycStatus,
         kyc_verified: isKycApproved,
         verified: isKycApproved || cp?.verified === true || bp?.verified === true,
         has_payment_details: hasPaymentDetails,
         payment_info: {
           upi_id: upiId,
           has_qr: Boolean(ck?.upi_qr_code_url),
           bank_account_no: bankAcc,
           bank_ifsc: ck?.bank_ifsc || bk?.bank_ifsc || null,
           bank_holder_name: ck?.bank_holder_name || bk?.bank_holder_name || null
         },
         plain_password: plainPass,
         permissions: p
       };
    });
    const finalUsers = mapped.map((u: any) => (isBinned(u) ? { ...u, is_deleted: true } : u));
    return res.json(finalUsers);
  });

  router.post("/admin/users/:id/team_role", async (req, res) => {
    const user = await parseAuthUser(req);
    // Session 25: only a full admin changes team roles (a sub-admin could promote anyone to admin).
    if (!user || !isFullAdmin(user)) {
      return res.status(403).json({ detail: "Only a Super Admin can manage admin roles" });
    }
    const { team_role } = req.body || {};
    if (!['admin', 'sub_admin', null, ''].includes(team_role)) {
      return res.status(400).json({ detail: "Unknown team role." });
    }
    if (req.params.id === user.user_id) {
      return res.status(400).json({ detail: "You can't change your own admin role." });
    }

    const activeClient = privilegedSupabase || supabase;
    const localDb = getDb();

    // Session 40: "Standard User" puts the account back to its own role (see adminRoleChange.ts).
    let facts: any = {};
    if (!team_role) {
      const localBrand = (localDb.brand_profiles || []).find((b: any) => b.user_id === req.params.id) || null;
      const localCreator = (localDb.creator_profiles || []).find((c: any) => c.user_id === req.params.id) || null;
      facts = { brandProfile: localBrand, creatorProfile: localCreator };
      if (activeClient) {
        try {
          const { data: bp } = await activeClient.from('brand_profiles').select('user_id, is_agency').eq('user_id', req.params.id).maybeSingle();
          if (bp) facts.brandProfile = bp;
          const { data: cp } = await activeClient.from('creator_profiles').select('user_id').eq('user_id', req.params.id).maybeSingle();
          if (cp) facts.creatorProfile = cp;
        } catch (e: any) {
          console.warn("[team_role] profile lookup failed:", e?.message || e);
        }
      }
    }

    const plan = roleUpdateFor(team_role, facts);
    if (plan.ok === false) { const bad = plan as { status: number; detail: string }; return res.status(bad.status).json({ detail: bad.detail }); }

    if (activeClient) {
      const { error } = await activeClient.from('users').update(plan.fields).eq('user_id', req.params.id);
      if (error) {
        // Session 40: this used to log and still answer "saved".
        console.error("Failed to update team role in Supabase:", error.message);
        return res.status(500).json({ detail: "Could not save the role: " + error.message });
      }
      if (plan.clearPermissions) {
        try {
          const { error: delErr } = await activeClient.from('admin_permissions').delete().eq('user_id', req.params.id);
          if (delErr) console.warn("[team_role] could not clear module permissions:", delErr.message);
        } catch (e: any) {
          console.warn("[team_role] could not clear module permissions:", e?.message || e);
        }
      }
    }

    if (localDb.users) {
      const u = localDb.users.find((x: any) => x.user_id === req.params.id);
      if (u) {
        u.team_role = plan.fields.team_role;
        u.role = plan.fields.role;
      }
      if (plan.clearPermissions && Array.isArray(localDb.admin_permissions)) {
        localDb.admin_permissions = localDb.admin_permissions.filter((p: any) => p.user_id !== req.params.id);
      }
      saveDb(localDb);
    }

    await logAdminAction(user, 'update_team_role', 'user', req.params.id, { new_team_role: plan.fields.team_role, new_role: plan.fields.role });
    res.json({ ok: true, role: plan.fields.role, team_role: plan.fields.team_role });
  });

  router.post("/admin/users/:id/permissions", async (req, res) => {
    const user = await parseAuthUser(req);
    // Session 40: a Sub-Admin could pass this check and give itself every module. Super Admin only.
    if (!user || !isFullAdmin(user)) {
      return res.status(403).json({ detail: "Only a Super Admin can manage permissions" });
    }
    const { permissions } = req.body; // array of { permission_key, allowed } or array of strings
    
    const activeClient = privilegedSupabase || supabase;
    if (activeClient) {
      const { error: deleteErr } = await activeClient.from('admin_permissions').delete().eq('user_id', req.params.id);
      if (deleteErr) {
        console.warn("Failed to clear permissions in Supabase:", deleteErr.message);
      }
      
      if (permissions && Array.isArray(permissions) && permissions.length > 0) {
        const inserts = permissions.map((p: any) => ({
           user_id: req.params.id,
           permission_key: typeof p === 'string' ? p : (p.permission_key || p.key),
           allowed: typeof p === 'object' && p.allowed !== undefined ? Boolean(p.allowed) : true
        }));
        const { error: insertErr } = await activeClient.from('admin_permissions').insert(inserts);
        if (insertErr) {
          console.error("Failed to insert permissions in Supabase:", insertErr.message);
          return res.status(500).json({ error: "Failed to insert permissions: " + insertErr.message });
        }
      }
    }

    // Always update local DB fallback as well
    const localDb = getDb();
    if (!localDb.admin_permissions) localDb.admin_permissions = [];
    localDb.admin_permissions = localDb.admin_permissions.filter((p: any) => p.user_id !== req.params.id);
    if (permissions && Array.isArray(permissions) && permissions.length > 0) {
      permissions.forEach((p: any) => {
        localDb.admin_permissions.push({
          user_id: req.params.id,
          permission_key: typeof p === 'string' ? p : (p.permission_key || p.key),
          allowed: typeof p === 'object' && p.allowed !== undefined ? Boolean(p.allowed) : true
        });
      });
    }
    saveDb(localDb);

    await logAdminAction(user, 'update_permissions', 'user', req.params.id, { permissions });
    res.json({ ok: true });
  });

  // ── v429 Support mode ─────────────────────────────────────────────────────────────────────────────────────
  // No code from the user (Ravi). The admin gives a reason; a 30-minute login for that user is made; the user gets a
  // notification; every change is logged (server.ts). Admin / staff accounts can't be opened this way.
  router.post("/admin/support/:id/start", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || user.support_mode || isSupportToken(requestToken(req))) return res.status(403).json({ error: "Admin only" });
    if (!isFullAdmin(user) && !(await checkAdminPerm(user, "manage_helpdesk")) && !(await checkAdminPerm(user, "manage_users"))) return res.status(403).json({ error: "You need the Helpdesk or Manage users permission" });
    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    if (reason.length < 5) return res.status(400).json({ error: "Write why you are opening this account (what the user asked for)." });
    const client = privilegedSupabase || supabase;
    if (!client) return res.status(503).json({ error: "Database not ready" });
    const targetId = String(req.params.id);
    const { data: target } = await client.from("users").select("user_id, name, email, role, team_role, banned, is_deleted").eq("user_id", targetId).maybeSingle();
    if (!target) return res.status(404).json({ error: "User not found" });
    if (isAdminStaff(target) || target.user_id === user.user_id) return res.status(403).json({ error: "Support mode can't open an admin or staff account." });
    if (target.banned || target.is_deleted) return res.status(400).json({ error: "This account is banned or deleted." });
    const token = newSupportToken(user.user_id);
    const expires_at = new Date(Date.now() + SUPPORT_MINUTES * 60 * 1000).toISOString();
    const { error } = await client.from("user_sessions").insert({ user_id: target.user_id, session_token: token, expires_at, created_at: getIsoNow() });
    if (error) return res.status(500).json({ error: "Couldn't open support mode: " + (error.message || error) });
    await logAdminAction(user, "support_mode_start", "user", target.user_id, { reason, minutes: SUPPORT_MINUTES });
    sendNotification(getDb(), target.user_id, "support_mode",
      `Ybex support opened your account to help you: "${reason}". It closes by itself in ${SUPPORT_MINUTES} minutes. Support can't touch your payments, bank details, KYC or agreements. Every change is recorded.`
    ).catch(() => {});
    res.json({ ok: true, token, expires_at, user: { user_id: target.user_id, name: target.name, role: target.role } });
  });

  // Ends a support login early (the admin presses Exit). Uses the support token itself.
  router.post("/admin/support/end", async (req, res) => {
    const tok = requestToken(req);
    if (!isSupportToken(tok)) return res.status(400).json({ error: "Not in support mode" });
    const client = privilegedSupabase || supabase;
    try { await client?.from("user_sessions").delete().eq("session_token", tok); } catch { /* expires by itself */ }
    res.json({ ok: true });
  });

  // ── v431 (admin phone audit #3): check a payout BEFORE the admin sends money from the bank app ──────────────
  // Same stops as POST /admin/escrow/:id/release-payout (payment_routes.ts), read-only: payouts frozen, payment
  // missing / refunded / already paid, creator KYC not approved, deal frozen, nothing left after a part refund.
  router.get("/admin/escrow/payout-check", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || !(isFullAdmin(user) || (await checkAdminPerm(user, "manage_escrow")))) return res.status(403).json({ error: "Admin only" });
    const client = privilegedSupabase || supabase;
    if (!client) return res.status(503).json({ ok: false, error: "Database not ready" });
    const SAFE = /^[A-Za-z0-9_-]{1,80}$/;
    const txId = String(req.query.transaction_id || ""), dealId = String(req.query.deal_id || ""), ugcId = String(req.query.ugc_order_id || "");
    if ((txId && !SAFE.test(txId)) || (dealId && !SAFE.test(dealId)) || (ugcId && !SAFE.test(ugcId)) || !(txId || dealId || ugcId)) {
      return res.status(400).json({ ok: false, error: "Invalid id." });
    }
    try {
      if ((await readRiskControls(client)).payoutFreezeAll) return res.json({ ok: false, code: "PAYOUTS_FROZEN", error: "All payouts are frozen in Fees & Risk settings." });
      let q = client.from("transactions").select("*");
      q = txId ? q.eq("id", txId) : ugcId ? q.eq("ugc_order_id", ugcId) : q.eq("deal_id", dealId);
      const { data: rows, error } = await q.limit(10);
      if (error) return res.json({ ok: false, code: "CHECK_FAILED", error: "Couldn't read this payment. Try again." });
      const tx = (rows || []).find((t: any) => !t.refund_amount && String(t.payout_type || "") !== "refund") || (rows || [])[0];
      if (!tx) return res.json({ ok: false, code: "NO_PAYMENT", error: "No payment was found for this deal." });
      const stop = payoutReleaseBlock(tx);
      if (stop) return res.json({ ok: false, code: stop.code, error: stop.error });
      const kyc = tx.creator_id ? await getCreatorKycStatus(client, getDb(), String(tx.creator_id)) : "NONE";
      if (kyc === "UNKNOWN") return res.json({ ok: false, code: "KYC_CHECK_FAILED", error: "Couldn't check the creator's KYC. Try again." });
      if (kyc !== "APPROVED") return res.json({ ok: false, code: "KYC_REQUIRED", error: "This creator's KYC isn't approved yet." });
      if (tx.deal_id) {
        const { data: hold } = await client.from("deals").select("escrow_hold, escrow_hold_by_admin_id, escrow_hold_reason").eq("id", tx.deal_id).maybeSingle();
        if (hold?.escrow_hold === true && hold.escrow_hold_by_admin_id) return res.json({ ok: false, code: "ESCROW_FROZEN", error: `This deal's money is frozen${hold.escrow_hold_reason ? ` (${String(hold.escrow_hold_reason).slice(0, 120)})` : ""}.` });
      }
      const net = Number(tx.creator_net_amount) || 0;
      const payable = netAfterPartialRefund(tx, net);
      if (net > 0 && payable <= 0) return res.json({ ok: false, code: "NOTHING_LEFT_AFTER_REFUND", error: "Nothing left to pay after the refund." });
      res.json({ ok: true, payable, net });
    } catch (e: any) {
      res.json({ ok: false, code: "CHECK_FAILED", error: "Couldn't check this payout. Try again." });
    }
  });
}
