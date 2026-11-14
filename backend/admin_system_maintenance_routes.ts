import express from "express";
import crypto from "crypto";
import { safePromiseTimeout } from "./helpers";
import { isEscrowHeld, isPayoutRequested, fetchAllRows } from "./adminMoney";
import { countNewUnclaimedPitchesQuick } from "./pitchLeads";
import { isLiveServer } from "./liveServer"; // v376: demo logins never work on the live server
import { ephemeralSet, ephemeralGet, ephemeralDelete } from "./ephemeralStore";

// v378 (QA M12 — "maintenance on ho gaya, off nahi ho raha"): the Supabase row maintenance_mode is the ONE source of
// truth. The auto-off time ("turn off after N hours") used to live only in this server copy's local file, which the
// site never reads when Supabase answers — so auto-off never happened. It is now kept in ybex_ephemeral
// (maintenance:until:creator / :brand) and every reader of the row calls applyMaintenanceAutoOff, which switches a
// side off in Supabase once its time has passed. No new table or column.
export const MAINT_MSG_MAX = 500;
export async function applyMaintenanceAutoOff(client: any, row: any): Promise<any> {
  if (!client || !row) return row;
  let out = row;
  for (const side of ["creator", "brand"] as const) {
    const col = side === "creator" ? "creator_side_enabled" : "brand_side_enabled";
    if (!out[col]) continue;
    let until: any = null;
    try { until = await ephemeralGet(`maintenance:until:${side}`); } catch { until = null; }
    const t = Date.parse(String(until?.until || ""));
    if (Number.isFinite(t) && Date.now() >= t) {
      try {
        await client.from("maintenance_mode").update({ [col]: false }).eq("id", "singleton");
        await ephemeralDelete(`maintenance:until:${side}`);
      } catch { /* next reader tries again */ }
      out = { ...out, [col]: false };
    }
  }
  return out;
}

// Mirrors isDemoLoginEnabled in server.ts. Session 22: ONLY an explicit DEMO_LOGIN=true turns it
// on. It used to follow payment test mode, which is ON by default on any run.app URL — so on the
// live Cloud Run site anyone could GET /api/admin/bypass and receive a working ADMIN token.
export function demoLoginEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (isLiveServer(env)) return false; // v376: DEMO_LOGIN=true was found on the live server
  const explicit = String(env.DEMO_LOGIN || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(explicit);
}

const getIsoNow = () => new Date().toISOString();

// Admin system/maintenance toolkit: a dev-only login bypass, the platform
// maintenance-mode toggle (creator/brand side, with a broadcast socket event),
// the "System Collabs" dispute-mediation panel (list every deal/collab across
// Supabase + local db, view its chat, force a status override, extend the
// deadline, inject an admin message into the thread, freeze escrow, or
// formally resolve a dispute), and the admin dashboard's aggregate stats
// (pending-approval counts, platform totals, and the revenue/users chart).
export function setupAdminSystemMaintenanceRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    logAdminAction,
    insertChatMessageToSupabase,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    logAdminAction: (user: any, action: any, targetType: any, targetId: any, detail: any) => Promise<any>;
    insertChatMessageToSupabase: (msgRecord: any) => Promise<any>;
  }
) {
  // Demo admin token handout. Same rule as the dev_bypass tokens: test mode only.
  router.get("/demo/login-enabled", (req, res) => {
    res.json({ enabled: demoLoginEnabled() });
  });

  // v419 admin cleanup: removed the demo-login /admin/bypass route (not for production)


  router.post("/admin/maintenance", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || user.role !== "admin") return res.status(403).json({ detail: "Admin only", _status: 403 });
    const db = getDb();
    if (!db.platform_settings) db.platform_settings = { brand_markup_pct: 2, creator_deduction_pct: 2, agency_markup_pct: 5, agency_deduction_pct: 5 };
    
    const { type, maintenance, autoOffHours } = req.body;
    // v378 (QA L10): the message is capped (20 KB was accepted).
    const message = req.body?.message === undefined ? undefined : String(req.body.message || "").slice(0, MAINT_MSG_MAX);
    let untilTime = null;
    
    if (maintenance && autoOffHours) {
        const time = new Date();
        time.setHours(time.getHours() + Number(autoOffHours));
        untilTime = time.toISOString();
    }

    if (type === 'creator') {
      db.platform_settings.maintenance_mode_creator = maintenance;
      db.platform_settings.maintenance_creator_until = untilTime;
    } else if (type === 'brand') {
      db.platform_settings.maintenance_mode_brand = maintenance;
      db.platform_settings.maintenance_brand_until = untilTime;
    }
    
    if (message !== undefined) {
      db.platform_settings.maintenance_message = message;
    }
    db.platform_settings.maintenance_enabled_by = user.user_id;
    db.platform_settings.maintenance_enabled_at = new Date().toISOString();

    saveDb(db);

    // Update Supabase if available
    let creatorEnabledFinal = !!db.platform_settings.maintenance_mode_creator;
    let brandEnabledFinal = !!db.platform_settings.maintenance_mode_brand;
    let messageFinal = message !== undefined ? message : (db.platform_settings.maintenance_message || "");

    const client = privilegedSupabase || supabase;
    if (client) {
      try {
        const { data: current } = await client
          .from('maintenance_mode')
          .select('*')
          .eq('id', 'singleton')
          .maybeSingle();

        const creatorVal = type === 'creator' ? maintenance : (current ? current.creator_side_enabled : false);
        const brandVal = type === 'brand' ? maintenance : (current ? current.brand_side_enabled : false);
        const textVal = message !== undefined ? message : (current ? current.message : '');

        const { error } = await client.from('maintenance_mode').upsert({
          id: 'singleton',
          creator_side_enabled: !!creatorVal,
          brand_side_enabled: !!brandVal,
          message: textVal || '',
          enabled_by: user.user_id,
          enabled_at: new Date().toISOString()
        });

        if (error) {
          console.error("Error updating Supabase maintenance_mode table:", error.message);
        } else {
          // v378 (QA M12): auto-off time where every server copy can see it.
          if (type === 'creator' || type === 'brand') {
            try {
              if (maintenance && untilTime) await ephemeralSet(`maintenance:until:${type}`, { until: untilTime }, Number(autoOffHours) * 3600_000 + 24 * 3600_000);
              else await ephemeralDelete(`maintenance:until:${type}`);
            } catch (e: any) { console.warn("[maintenance] auto-off time not saved:", e?.message || e); }
          }
          creatorEnabledFinal = !!creatorVal;
          brandEnabledFinal = !!brandVal;
          messageFinal = textVal || '';
        }
      } catch (err: any) {
        console.error("Exception updating Supabase maintenance_mode table:", err.message || err);
      }
    }

    // Log the toggle action to admin_activity_logs (Supabase)
    if (privilegedSupabase) {
      const { error: logErr } = await privilegedSupabase.from('admin_activity_logs').insert({
        admin_id: user.user_id,
        user_id: user.user_id,
        email: user.email,
        action: 'toggled_maintenance_mode',
        target_id: type,
        target_type: 'platform',
        details: JSON.stringify({ type, enabled: maintenance, message: messageFinal }),
        detail: { type, enabled: maintenance, message: messageFinal },
        created_at: new Date().toISOString()
      });
      if (logErr) {
        console.error("Error inserting to admin_activity_logs on maintenance toggle:", logErr.message || logErr);
      }
    }

    // Emit Socket.io event to broadcast to active users
    const io = req.app.get("io");
    if (io) {
      io.emit("system_maintenance_toggle", {
        type,
        maintenance: !!maintenance,
        maintenance_mode_creator: creatorEnabledFinal,
        maintenance_mode_brand: brandEnabledFinal,
        message: messageFinal,
        autoOffHours,
        updatedAt: new Date().toISOString()
      });
    }

    res.json({ 
      ok: true, 
      maintenance_mode_creator: creatorEnabledFinal,
      maintenance_mode_brand: brandEnabledFinal,
      message: messageFinal,
      enabled_by: user.user_id,
      enabled_at: db.platform_settings.maintenance_enabled_at
    });
  });


  // ─── ADMIN SYSTEM-COLLABS: 1. List All Collabs & Active Disputes ───────────
  router.get("/admin/system-collabs", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized. Admin privileges required." });
    }

    const collabsList: any[] = [];
    const seenIds = new Set<string>();

    if (supabase) {
      try {
        const { data: dealsData, error: dealsErr } = await (privilegedSupabase || supabase)
          .from('deals')
          .select('*')
          .order('created_at', { ascending: false });

        if (dealsErr) {
          console.error("[/admin/system-collabs] Deals query error:", dealsErr);
        }

        if (dealsData && dealsData.length > 0) {
          const campaignIds = Array.from(new Set(dealsData.map((d: any) => d.campaign_id).filter(Boolean)));
          const brandIds = Array.from(new Set(dealsData.map((d: any) => d.brand_id).filter(Boolean)));
          const creatorIds = Array.from(new Set(dealsData.map((d: any) => d.creator_id).filter(Boolean)));
          const dealIds = dealsData.map((d: any) => d.id);

          const [campaignsRes, brandsRes, creatorsRes, usersRes, threadsRes] = await Promise.all([
            campaignIds.length > 0
              ? (privilegedSupabase || supabase).from('campaigns').select('campaign_id, title').in('campaign_id', campaignIds)
              : Promise.resolve({ data: [] }),
            brandIds.length > 0
              ? (privilegedSupabase || supabase).from('brand_profiles').select('user_id, company_name').in('user_id', brandIds)
              : Promise.resolve({ data: [] }),
            creatorIds.length > 0
              ? (privilegedSupabase || supabase).from('creator_profiles').select('user_id, name').in('user_id', creatorIds)
              : Promise.resolve({ data: [] }),
            (privilegedSupabase || supabase).from('users').select('user_id, name, email').in('user_id', [...brandIds, ...creatorIds]),
            (privilegedSupabase || supabase).from('chat_threads').select('id, deal_id').in('deal_id', dealIds)
          ]);

          const campaignMap: Record<string, any> = {};
          (campaignsRes.data || []).forEach((c: any) => { campaignMap[c.campaign_id] = c; });

          const brandMap: Record<string, any> = {};
          (brandsRes.data || []).forEach((b: any) => { brandMap[b.user_id] = b; });

          const creatorMap: Record<string, any> = {};
          (creatorsRes.data || []).forEach((c: any) => { creatorMap[c.user_id] = c; });

          const userMap: Record<string, any> = {};
          (usersRes.data || []).forEach((u: any) => { userMap[u.user_id] = u; });

          const threadByDeal: Record<string, string> = {};
          (threadsRes.data || []).forEach((t: any) => {
            if (t.deal_id) threadByDeal[t.deal_id] = t.id;
          });

          dealsData.forEach((d: any) => {
            seenIds.add(String(d.id));
            const brandName = brandMap[d.brand_id]?.company_name || userMap[d.brand_id]?.name || userMap[d.brand_id]?.email || "Brand Partner";
            const creatorName = creatorMap[d.creator_id]?.name || userMap[d.creator_id]?.name || userMap[d.creator_id]?.email || "Creator";
            const campaignTitle = campaignMap[d.campaign_id]?.title || d.deliverables || "Campaign Collaboration";

            collabsList.push({
              id: d.id,
              campaign: campaignTitle,
              brand: brandName,
              creator: creatorName,
              escrow: Number(d.agreed_amount || 0),
              escrow_hold: Boolean(d.escrow_hold),
              escrow_hold_reason: d.escrow_hold_reason || null,
              status: d.status || "In Progress",
              deadline: d.content_deadline || "No deadline set",
              lastUpdate: d.updated_at ? new Date(d.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : (d.created_at ? new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : "Recently"),
              thread_id: threadByDeal[d.id] || null,
              brand_id: d.brand_id,
              creator_id: d.creator_id,
              campaign_id: d.campaign_id,
              created_at: d.created_at,
              updated_at: d.updated_at
            });
          });
        }
      } catch (err) {
        console.error("[/admin/system-collabs] Error fetching Supabase deals:", err);
      }
    }

    // Merge or fallback to mock database collabs/deals
    const db = getDb();
    const mockDeals = db.deals || [];
    const mockCollabs = db.collabs || [];

    [...mockDeals, ...mockCollabs].forEach((c: any) => {
      const cId = String(c.id || c.collab_id);
      if (seenIds.has(cId)) return;
      seenIds.add(cId);

      const brandUser = (db.users || []).find((u: any) => u.user_id === c.brand_id || u.user_id === c.from_user_id);
      const creatorUser = (db.users || []).find((u: any) => u.user_id === c.creator_id || u.user_id === c.to_user_id);
      const camp = (db.campaigns || []).find((cp: any) => cp.campaign_id === c.campaign_id);

      collabsList.push({
        id: cId,
        campaign: camp?.title || c.deliverable || c.title || "Direct Collaboration",
        brand: c.brand_name || brandUser?.name || "Brand Partner",
        creator: c.creator_name || creatorUser?.name || "Creator",
        escrow: Number(c.agreed_amount || c.rate || c.proposed_amount || c.payout || 0),
        escrow_hold: Boolean(c.escrow_hold),
        escrow_hold_reason: c.escrow_hold_reason || null,
        status: c.status || "In Progress",
        deadline: c.content_deadline || c.deadline || "No deadline set",
        lastUpdate: c.updated_at ? new Date(c.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : (c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : "Recently"),
        thread_id: c.thread_id || null,
        brand_id: c.brand_id || c.from_user_id,
        creator_id: c.creator_id || c.to_user_id,
        campaign_id: c.campaign_id,
        created_at: c.created_at,
        updated_at: c.updated_at
      });
    });

    return res.json(collabsList);
  });

  // ─── ADMIN SYSTEM-COLLABS: 2. Get Chat Messages for Deal Thread ───────────
  router.get("/admin/system-collabs/:id/messages", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized. Admin privileges required." });
    }

    const collabId = req.params.id;
    const formattedMessages: any[] = [];

    if (supabase) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(collabId);
        let thrQuery = (privilegedSupabase || supabase).from('chat_threads').select('*');
        if (isUuid) {
          thrQuery = thrQuery.or(`deal_id.eq.${collabId},id.eq.${collabId}`);
        } else {
          thrQuery = thrQuery.eq('deal_id', collabId);
        }
        const { data: threads } = await thrQuery;
        const thread = threads && threads.length > 0 ? threads[0] : null;

        if (thread) {
          const { data: msgs } = await (privilegedSupabase || supabase)
            .from('chat_messages')
            .select('*')
            .eq('thread_id', thread.id)
            .order('created_at', { ascending: true });

          if (msgs) {
            msgs.forEach((m: any) => {
              const isAdmin = m.message_type === 'admin_injection' || m.from_name === 'Platform Admin';
              const sender = m.from_name || (m.sender_user_id === thread.brand_id ? "Brand" : m.sender_user_id === thread.creator_id ? "Creator" : (isAdmin ? "Platform Admin" : "System"));
              formattedMessages.push({
                id: m.message_id || m.id,
                type: isAdmin ? 'admin_injection' : (m.message_type === 'system' ? 'system' : 'standard'),
                sender,
                time: m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
                text: m.text || m.content || "",
                created_at: m.created_at
              });
            });
          }
        }
      } catch (err) {
        console.error("[/admin/system-collabs/:id/messages] Error:", err);
      }
    }

    // Check mock database if no messages found
    if (formattedMessages.length === 0) {
      const db = getDb();
      const thr = (db.chat_threads || []).find((t: any) => t.deal_id === collabId || t.collab_id === collabId || t.id === collabId);
      if (thr) {
        const msgs = (db.chat_messages || []).filter((m: any) => m.thread_id === thr.id);
        msgs.forEach((m: any) => {
          const isAdmin = m.message_type === 'admin_injection' || m.sender_role === 'admin';
          formattedMessages.push({
            id: m.id || m.message_id,
            type: isAdmin ? 'admin_injection' : 'standard',
            sender: m.from_name || (m.sender_id === thr.brand_id ? "Brand" : m.sender_id === thr.creator_id ? "Creator" : (isAdmin ? "Platform Admin" : "System")),
            time: m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
            text: m.text || m.content || "",
            created_at: m.created_at
          });
        });
      }
    }

    return res.json(formattedMessages);
  });

  // ─── ADMIN SYSTEM-COLLABS: 3. Force Status Override ───────────────────────
  router.post("/admin/system-collabs/:id/force-status", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized. Admin privileges required." });
    }

    const collabId = req.params.id;
    const { status, reason } = req.body;

    if (!status || !String(status).trim()) {
      return res.status(400).json({ error: "Status is required." });
    }
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: "Reason for status override is required." });
    }

    const cleanStatus = String(status).trim();
    const cleanReason = String(reason).trim();
    const nowIso = getIsoNow();

    if (supabase) {
      try {
        const updateData: any = {
          status: cleanStatus,
          updated_at: nowIso
        };
        if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(cleanStatus.toUpperCase())) {
          updateData.escrow_hold = false;
        }

        await (privilegedSupabase || supabase)
          .from('deals')
          .update(updateData)
          .eq('id', collabId);

        // Inject notification to thread if available
        const { data: threads } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('id')
          .eq('deal_id', collabId);

        if (threads && threads.length > 0) {
          await insertChatMessageToSupabase({
            message_id: crypto.randomUUID(),
            thread_id: threads[0].id,
            sender_user_id: user.user_id,
            from_name: "Platform Admin",
            text: `⚠️ Administrative Status Override: Deal status changed to "${cleanStatus}". Reason: ${cleanReason}`,
            message_type: 'admin_injection',
            metadata: { action: 'status_override', status: cleanStatus, reason: cleanReason },
            read: false,
            created_at: nowIso
          });
        }
      } catch (err) {
        console.error("[/admin/system-collabs/force-status] Supabase error:", err);
      }
    }

    const db = getDb();
    const targetDeal = (db.deals || []).find((d: any) => d.id === collabId) || (db.collabs || []).find((c: any) => c.collab_id === collabId || c.id === collabId);
    if (targetDeal) {
      targetDeal.status = cleanStatus;
      targetDeal.updated_at = nowIso;
      if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(cleanStatus.toUpperCase())) {
        targetDeal.escrow_hold = false;
      }
      saveDb(db);
    }

    await logAdminAction(user, 'FORCE_COLLAB_STATUS', 'DEAL', collabId, { status: cleanStatus, reason: cleanReason });

    return res.json({ success: true, status: cleanStatus });
  });

  // ─── ADMIN SYSTEM-COLLABS: 4. Extend Content Deadline ────────────────────
  router.post("/admin/system-collabs/:id/extend-deadline", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized. Admin privileges required." });
    }

    const collabId = req.params.id;
    const { new_deadline, reason } = req.body;

    if (!new_deadline || !String(new_deadline).trim()) {
      return res.status(400).json({ error: "New deadline date is required." });
    }

    const cleanDeadline = String(new_deadline).trim();
    const cleanReason = reason ? String(reason).trim() : "Admin extension request";
    const nowIso = getIsoNow();

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(collabId);

    if (supabase && isUuid) {
      try {
        await (privilegedSupabase || supabase)
          .from('deals')
          .update({
            content_deadline: cleanDeadline,
            updated_at: nowIso
          })
          .eq('id', collabId);

        const { data: threads } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('id')
          .eq('deal_id', collabId);

        if (threads && threads.length > 0) {
          await insertChatMessageToSupabase({
            message_id: crypto.randomUUID(),
            thread_id: threads[0].id,
            sender_user_id: user.user_id,
            from_name: "Platform Admin",
            text: `📅 Deadline Extended: Platform Admin updated submission deadline to ${cleanDeadline}. Note: ${cleanReason}`,
            message_type: 'admin_injection',
            metadata: { action: 'extend_deadline', new_deadline: cleanDeadline, reason: cleanReason },
            read: false,
            created_at: nowIso
          });
        }
      } catch (err) {
        console.error("[/admin/system-collabs/extend-deadline] Supabase error:", err);
      }
    }

    const db = getDb();
    const targetDeal = (db.deals || []).find((d: any) => d.id === collabId) || (db.collabs || []).find((c: any) => c.collab_id === collabId || c.id === collabId);
    if (targetDeal) {
      targetDeal.content_deadline = cleanDeadline;
      targetDeal.deadline = cleanDeadline;
      targetDeal.updated_at = nowIso;
      saveDb(db);
    }

    await logAdminAction(user, 'EXTEND_DEADLINE', 'DEAL', collabId, { new_deadline: cleanDeadline, reason: cleanReason });

    return res.json({ success: true, new_deadline: cleanDeadline });
  });

  // ─── ADMIN SYSTEM-COLLABS: 5. Inject Message into Chat Thread ─────────────
  router.post("/admin/system-collabs/:id/inject-message", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized. Admin privileges required." });
    }

    const collabId = req.params.id;
    const { message } = req.body;

    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: "Message content cannot be empty." });
    }

    const cleanMsg = String(message).trim();
    const nowIso = getIsoNow();
    const msgId = crypto.randomUUID();
    let threadId = "";

    if (supabase) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(collabId);
        let thrQuery = (privilegedSupabase || supabase).from('chat_threads').select('*');
        if (isUuid) {
          thrQuery = thrQuery.or(`deal_id.eq.${collabId},id.eq.${collabId}`);
        } else {
          thrQuery = thrQuery.eq('deal_id', collabId);
        }
        const { data: threads } = await thrQuery;

        if (threads && threads.length > 0) {
          threadId = threads[0].id;
        } else if (isUuid) {
          // Look up deal to create thread if none exists
          const { data: dRec } = await (privilegedSupabase || supabase).from('deals').select('*').eq('id', collabId).maybeSingle();
          if (dRec) {
            threadId = crypto.randomUUID();
            await (privilegedSupabase || supabase).from('chat_threads').insert({
              id: threadId,
              deal_id: collabId,
              campaign_id: dRec.campaign_id,
              brand_id: dRec.brand_id,
              creator_id: dRec.creator_id,
              status: 'ACTIVE',
              flow_state: 'ACTIVE',
              created_at: nowIso,
              updated_at: nowIso
            });
          }
        }

        if (threadId) {
          await insertChatMessageToSupabase({
            message_id: msgId,
            thread_id: threadId,
            sender_user_id: user.user_id,
            from_name: "Platform Admin",
            text: cleanMsg,
            message_type: 'admin_injection',
            metadata: { action: 'admin_message', injected_by: user.name || user.email },
            read: false,
            created_at: nowIso
          });

          await (privilegedSupabase || supabase).from('chat_threads').update({
            updated_at: nowIso
          }).eq('id', threadId);
        }
      } catch (err) {
        console.error("[/admin/system-collabs/inject-message] Supabase error:", err);
      }
    }

    // Update local db
    const db = getDb();
    if (!db.chat_messages) db.chat_messages = [];
    db.chat_messages.push({
      id: msgId,
      message_id: msgId,
      thread_id: threadId || collabId,
      sender_id: user.user_id,
      from_name: "Platform Admin",
      sender_role: "admin",
      message_type: "admin_injection",
      text: cleanMsg,
      content: cleanMsg,
      created_at: nowIso
    });
    saveDb(db);

    const injectedMessage = {
      id: msgId,
      type: 'admin_injection',
      sender: 'Platform Admin',
      text: cleanMsg,
      time: new Date(nowIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      created_at: nowIso
    };

    const io = req.app.get("io");
    if (io && threadId) {
      io.to(threadId).emit("new_message", injectedMessage);
    }

    await logAdminAction(user, 'INJECT_MESSAGE', 'DEAL', collabId, { message: cleanMsg });

    return res.json({
      success: true,
      injectedMessage
    });
  });

  // ─── ADMIN SYSTEM-COLLABS: 6. Freeze Escrow ──────────────────────────────
  router.post("/admin/system-collabs/:id/freeze", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized. Admin privileges required." });
    }

    const collabId = req.params.id;
    const { reason } = req.body;

    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: "Reason for freezing escrow is required." });
    }

    const cleanReason = String(reason).trim();
    const nowIso = getIsoNow();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(collabId);

    if (supabase && isUuid) {
      try {
        await (privilegedSupabase || supabase)
          .from('deals')
          .update({
            escrow_hold: true,
            escrow_hold_reason: cleanReason,
            escrow_hold_by_admin_id: user.user_id,
            escrow_hold_at: nowIso,
            updated_at: nowIso
          })
          .eq('id', collabId);

        // Update matching transaction if exists
        await (privilegedSupabase || supabase)
          .from('transactions')
          .update({
            escrow_hold: true,
            admin_action_by: user.user_id,
            admin_action_note: cleanReason
          })
          .eq('deal_id', collabId);

        // Notify thread
        const { data: threads } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('id')
          .eq('deal_id', collabId);

        if (threads && threads.length > 0) {
          await insertChatMessageToSupabase({
            message_id: crypto.randomUUID(),
            thread_id: threads[0].id,
            sender_user_id: user.user_id,
            from_name: "Platform Admin",
            text: `🔒 ESCROW FUNDS FROZEN: Platform Admin has placed an escrow hold on this collaboration. Reason: ${cleanReason}`,
            message_type: 'admin_injection',
            metadata: { action: 'freeze_escrow', reason: cleanReason },
            read: false,
            created_at: nowIso
          });
        }
      } catch (err) {
        console.error("[/admin/system-collabs/freeze] Supabase error:", err);
      }
    }

    const db = getDb();
    const targetDeal = (db.deals || []).find((d: any) => d.id === collabId) || (db.collabs || []).find((c: any) => c.collab_id === collabId || c.id === collabId);
    if (targetDeal) {
      targetDeal.escrow_hold = true;
      targetDeal.escrow_hold_reason = cleanReason;
      targetDeal.updated_at = nowIso;
      saveDb(db);
    }

    await logAdminAction(user, 'FREEZE_ESCROW', 'DEAL', collabId, { reason: cleanReason });

    return res.json({ success: true, message: "Escrow funds frozen successfully" });
  });

  // ─── ADMIN SYSTEM-COLLABS: 7. Enforce Dispute Resolution ──────────────────
  router.post("/admin/system-collabs/:id/resolve", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ error: "Unauthorized. Admin privileges required." });
    }

    const collabId = req.params.id;
    const { resolution, rationale, brand_refund_pct, creator_payout_pct } = req.body;

    if (!resolution || !['refund', 'partial', 'pay'].includes(String(resolution).toLowerCase())) {
      return res.status(400).json({ error: "Invalid resolution. Must be 'refund', 'partial', or 'pay'." });
    }

    const cleanResolution = String(resolution).toLowerCase();
    const cleanRationale = rationale ? String(rationale).trim() : "Dispute resolution enforced by administrator.";
    const nowIso = getIsoNow();

    if (supabase) {
      try {
        let dealStatus = 'COMPLETED';
        if (cleanResolution === 'refund') {
          dealStatus = 'CANCELLED';
        }

        await (privilegedSupabase || supabase)
          .from('deals')
          .update({
            status: dealStatus,
            escrow_hold: false,
            escrow_hold_reason: `Resolved via dispute mediation: ${cleanRationale}`,
            updated_at: nowIso
          })
          .eq('id', collabId);
        // Session 58: close the deal chat too — it stayed ACTIVE, so the brand could still approve a draft (overwriting
        // CANCELLED) and the creator could still post a live link on a refunded deal.
        await (privilegedSupabase || supabase).from('chat_threads')
          .update({ status: dealStatus, flow_state: dealStatus, updated_at: nowIso })
          .eq('deal_id', collabId);

        // Update transactions if any
        // Session 27: a dispute decision moves NO money by itself. It used to write
        // refund_status 'PROCESSED' / payout_status 'RELEASED' while nothing was sent — the ledger
        // and the chat then claimed a refund or payout that never happened. Now the money is queued
        // for the admin to send by hand (same tokens the manual refund/payout flows use).
        if (cleanResolution === 'refund' || cleanResolution === 'partial') {
          await (privilegedSupabase || supabase)
            .from('transactions')
            .update({
              refund_status: 'PENDING',
              refund_reason: cleanResolution === 'partial'
                ? `Dispute split — brand ${Number(brand_refund_pct) || 0}%, creator ${Number(creator_payout_pct) || 0}%: ${cleanRationale}`
                : cleanRationale,
            })
            .eq('deal_id', collabId);
        }
        if (cleanResolution === 'pay' || cleanResolution === 'partial') {
          await (privilegedSupabase || supabase)
            .from('transactions')
            .update({ payout_status: 'PENDING', admin_action_note: cleanRationale })
            .eq('deal_id', collabId);
        }

        // Post notice to chat thread
        const { data: threads } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('id')
          .eq('deal_id', collabId);

        if (threads && threads.length > 0) {
          await insertChatMessageToSupabase({
            message_id: crypto.randomUUID(),
            thread_id: threads[0].id,
            sender_user_id: user.user_id,
            from_name: "Platform Admin",
            text: `⚖️ DISPUTE RESOLVED BY ADMIN:\nOutcome: ${cleanResolution.toUpperCase()} (Brand: ${brand_refund_pct || 0}%, Creator: ${creator_payout_pct || 0}%)\nRationale: ${cleanRationale}\nThe Ybex team will send the money by hand and share the reference here.`,
            message_type: 'admin_injection',
            metadata: { action: 'resolve_dispute', resolution: cleanResolution, rationale: cleanRationale, brand_refund_pct, creator_payout_pct },
            read: false,
            created_at: nowIso
          });
        }
      } catch (err) {
        console.error("[/admin/system-collabs/resolve] Supabase error:", err);
      }
    }

    const db = getDb();
    const targetDeal = (db.deals || []).find((d: any) => d.id === collabId) || (db.collabs || []).find((c: any) => c.collab_id === collabId || c.id === collabId);
    if (targetDeal) {
      targetDeal.status = cleanResolution === 'refund' ? 'CANCELLED' : 'COMPLETED';
      targetDeal.escrow_hold = false;
      targetDeal.updated_at = nowIso;
      saveDb(db);
    }

    await logAdminAction(user, 'RESOLVE_DISPUTE', 'DEAL', collabId, {
      resolution: cleanResolution,
      rationale: cleanRationale,
      brand_refund_pct,
      creator_payout_pct
    });

    return res.json({ success: true, message: "Dispute decided. Send the refund / payout by hand — it is queued as PENDING." });
  });

  let pendingCountsCache: { at: number; body: any } | null = null; // v363
  router.get("/admin/pending-counts", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }

    if (!supabase) return res.json({});
    // v363 (Ravi: "Slowest APIs" — pending-counts ~2 s, asked by every open admin tab every 30 s): the same answer is
    // reused for 20 s on this server copy, so a second tab / quick reload costs nothing. ?fresh=1 skips it.
    if (!req.query?.fresh && pendingCountsCache && Date.now() - pendingCountsCache.at < 20000) return res.json(pendingCountsCache.body);
    const sb = privilegedSupabase || supabase;
    const count = (q: any) => safePromiseTimeout(q, 15000, { count: 0 } as any).then((r: any) => Number(r?.count) || 0).catch(() => 0);

    try {
      const [waitlist, kyc, campaigns, reports, helpdesk, ugcRefunds, referralWithdrawals, payoutRows, ugcActive] = await Promise.all([
        count(sb.from('waitlist').select('*', { count: 'exact', head: true }).in('status', ['Pending', 'pending', 'PENDING'])),
        // v419: the KYC list (admin/verifications) reads creator_kyc + brand_kyc — the badge counted the old
        // "verifications" table (prod: 195 vs 86 really waiting), so the KYC dot never matched the list.
        Promise.all(['creator_kyc', 'brand_kyc'].map((t) => count(sb.from(t).select('*', { count: 'exact', head: true }).in('status', ['pending', 'PENDING', 'under_review', 'UNDER_REVIEW']))))
          .then((n) => n[0] + n[1]),
        count(sb.from('campaigns').select('*', { count: 'exact', head: true }).in('status', ['pending', 'under_review', 'Under Review'])),
        count(sb.from('reports').select('*', { count: 'exact', head: true }).in('status', ['open', 'pending', 'OPEN', 'PENDING'])),
        // Session 38: tickets are saved as "OPEN" / "IN PROGRESS"; this looked for "open" /
        // "pending", so the Help Desk dot never lit up.
        // v293: the Ybex Assist bot's tickets (page_context /feedback-bot) have their own section, so they don't light this dot.
        (async () => {
          const open = ['OPEN', 'IN PROGRESS', 'open', 'in progress', 'pending', 'PENDING'];
          const total = await count(sb.from('support_tickets').select('*', { count: 'exact', head: true }).in('status', open));
          const bot = await count(sb.from('support_tickets').select('*', { count: 'exact', head: true }).eq('page_context', '/feedback-bot').in('status', open));
          return Math.max(0, total - bot);
        })(),
        count(sb.from('ugc_refunds').select('*', { count: 'exact', head: true }).eq('status', 'PENDING')),
        count(sb.from('referral_withdrawals').select('*', { count: 'exact', head: true }).eq('status', 'requested')),
        // Payout requests: "Request payout" sets payout_status PROCESSING, the chat nudge sets
        // payout_requested. Both still unpaid / not refunded.
        safePromiseTimeout((async () => {
          const both = await fetchAllRows((f, t) => sb.from('transactions').select('id, status, payout_status, payout_reference, refund_status, payout_requested').or('payout_status.eq.PROCESSING,payout_requested.eq.true').range(f, t));
          if (!both.error) return both;
          // A database without the payout_requested column: PROCESSING alone.
          return fetchAllRows((f, t) => sb.from('transactions').select('id, status, payout_status, payout_reference, refund_status').eq('payout_status', 'PROCESSING').range(f, t));
        })(), 15000, { data: [] } as any).catch(() => ({ data: [] })),
        // v419: UGC orders still being worked on — the Overview used to download every order to count these.
        count(sb.from('ugc_orders').select('*', { count: 'exact', head: true }).in('status', ['CLAIMED', 'ACCEPTED', 'IN_PROGRESS', 'ACTIVE', 'REVISION_REQ', 'REVISION_REQUESTED', 'SUBMITTED', 'PENDING']))
      ]);
      const payoutRequests = ((payoutRows as any)?.data || []).filter((tx: any) => isPayoutRequested(tx)).length;

      // Session 38: pitches from Supabase (brief_requests + admin status), not the local file.
      let pitchesCount = 0;
      try {
        pitchesCount = await countNewUnclaimedPitchesQuick({ getClient: () => privilegedSupabase || null, getDb });
      } catch (e: any) { console.warn("[pending-counts] pitches:", e?.message || e); }

      const body = {
        waitlist,
        kyc,
        campaigns,
        reports,
        helpdesk,
        pitches: pitchesCount || 0,
        payout_requests: payoutRequests,
        ugc_refunds: ugcRefunds,
        referral_withdrawals: referralWithdrawals,
        ugc_active: ugcActive,
        // Payments sidebar dot: anything money-related waiting for an admin.
        escrow: payoutRequests + ugcRefunds + referralWithdrawals
      };
      pendingCountsCache = { at: Date.now(), body };
      return res.json(body);
    } catch (e) {
      console.error("Error fetching pending counts:", e);
      return res.json({ waitlist: 0, kyc: 0, campaigns: 0, reports: 0, escrow: 0, helpdesk: 0, pitches: 0, payout_requests: 0, ugc_refunds: 0, referral_withdrawals: 0 });
    }
  });

  router.get("/admin/stats", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }

    if (supabase) {
      try {
        const [
          { count: usersCount },
          { count: creatorsCount },
          { count: brandsCount },
          { count: campaignsCount },
          { count: liveCampaignsCount },
          { count: collabsCount },
          { count: transactionsCount },
          { data: transactionsData },
          { data: liveCampaignsData }
        ] = await Promise.all([
          safePromiseTimeout((privilegedSupabase || supabase).from('users').select('*', { count: 'exact', head: true }), 15000, { count: 0 }),
          safePromiseTimeout((privilegedSupabase || supabase).from('creator_profiles').select('*', { count: 'exact', head: true }), 15000, { count: 0 }),
          safePromiseTimeout((privilegedSupabase || supabase).from('brand_profiles').select('*', { count: 'exact', head: true }), 15000, { count: 0 }),
          safePromiseTimeout((privilegedSupabase || supabase).from('campaigns').select('*', { count: 'exact', head: true }), 15000, { count: 0 }),
          safePromiseTimeout((privilegedSupabase || supabase).from('campaigns').select('*', { count: 'exact', head: true }).eq('status', 'live'), 15000, { count: 0 }),
          safePromiseTimeout((privilegedSupabase || supabase).from('deals').select('*', { count: 'exact', head: true }), 15000, { count: 0 }),
          safePromiseTimeout((privilegedSupabase || supabase).from('transactions').select('*', { count: 'exact', head: true }), 15000, { count: 0 }),
          // Session 38: every page — Supabase answers at most 1000 rows per request.
          safePromiseTimeout(fetchAllRows((f, t) => (privilegedSupabase || supabase).from('transactions').select('gross_amount, platform_fee_amount, status, payout_status, payout_reference, refund_status').range(f, t)), 30000, { data: [] } as any),
          safePromiseTimeout(fetchAllRows((f, t) => (privilegedSupabase || supabase).from('campaigns').select('budget_max').eq('status', 'live').range(f, t)), 30000, { data: [] } as any)
        ]);
        
        let escrowSecured = 0;
        let platformRevenue = 0;
        
        if (transactionsData) {
           transactionsData.forEach((tx: any) => {
              const st = String(tx.status || '').toUpperCase();
              // Held = paid in and not yet paid out or refunded. Session 38: a released payout keeps
              // status SUCCESS (payout_status PAID), so it kept counting as "secured" — isEscrowHeld
              // also checks the payout and refund fields.
              if (isEscrowHeld(tx)) escrowSecured += Number(tx.gross_amount) || 0;
              if (['SUCCESS', 'ESCROW_HELD', 'RELEASED', 'COMPLETED'].includes(st)) platformRevenue += Number(tx.platform_fee_amount) || 0;
           });
        }
        
        let liveCampaignsBudget = 0;
        if (liveCampaignsData) {
           liveCampaignsBudget = liveCampaignsData.reduce((acc: number, c: any) => acc + (Number(c.budget_max) || Number(c.budget) || 0), 0);
        }

        return res.json({
          users: usersCount || 0,
          creators: creatorsCount || 0,
          brands: brandsCount || 0,
          campaigns: campaignsCount || 0,
          live_campaigns: liveCampaignsCount || 0,
          collabs: collabsCount || 0,
          transactions: transactionsCount || 0,
          liveValue: liveCampaignsBudget,
          escrowSecured: escrowSecured,
          platformRevenue: platformRevenue
        });
      } catch (e) {
        console.error("Error fetching stats:", e);
        return res.status(500).json({ error: "Internal server error" });
      }
    } else {
      const db = getDb();
      const liveCampaigns = db.campaigns.filter((c: any) => c.status === "live" || c.stage === "live" || c.status === "approved");
      let liveValue = liveCampaigns.reduce((sum: number, c: any) => sum + (Number(c.budget_max) || Number(c.budget) || 0), 0);
      let escrowSecured = 0;
      let commission = 0;
      
      const txns = db.transactions || [];
      txns.forEach((tx: any) => {
         const st = String(tx.status || '').toUpperCase();
         if (isEscrowHeld(tx)) escrowSecured += Number(tx.gross_amount) || 0;
         if (['SUCCESS', 'ESCROW_HELD', 'RELEASED', 'COMPLETED'].includes(st)) commission += Number(tx.platform_fee_amount) || 0;
      });
      
      return res.json({
        users: db.users.length,
        creators: db.creator_profiles.length,
        brands: db.brand_profiles.length,
        campaigns: db.campaigns.length,
        live_campaigns: liveCampaigns.length,
        collabs: db.collabs ? db.collabs.length : 0,
        transactions: txns.length,
        liveValue: liveValue,
        escrowSecured: escrowSecured,
        platformRevenue: commission
      });
    }
  });

  
  router.get("/admin/chart-data", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }

    const days = req.query.days ? parseInt(req.query.days as string, 10) : 7;
    const dateList: Array<{ label: string; dateStart: Date; dateEnd: Date }> = [];
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      
      const dayStart = new Date(d);
      dayStart.setHours(0, 0, 0, 0);
      
      const dayEnd = new Date(d);
      dayEnd.setHours(23, 59, 59, 999);

      const label = days <= 7 
        ? weekdayNames[d.getDay()] 
        : `${d.getMonth() + 1}/${d.getDate()}`;
        
      dateList.push({ label, dateStart: dayStart, dateEnd: dayEnd });
    }

    if (supabase) {
      try {
        const [
          { data: dbUsers, error: usersErr },
          { data: dbTxns, error: txnsErr }
        ] = await Promise.all([
          fetchAllRows((f, t) => (privilegedSupabase || supabase).from('users').select('created_at').range(f, t)),
          fetchAllRows((f, t) => (privilegedSupabase || supabase).from('transactions').select('created_at, gross_amount, platform_fee_amount, status').range(f, t))
        ]);

        if (usersErr) throw usersErr;
        if (txnsErr) throw txnsErr;

        const usersData = (dbUsers || []).map((u: any) => u.created_at ? new Date(u.created_at).getTime() : 0);
        const txnsData = (dbTxns || []).map((t: any) => ({
          time: t.created_at ? new Date(t.created_at).getTime() : 0,
          gross: Number(t.gross_amount) || 0,
          fee: Number(t.platform_fee_amount) || 0,
          status: t.status
        }));

        const revenue = dateList.map(item => {
          const start = item.dateStart.getTime();
          const end = item.dateEnd.getTime();
          const dayTxns = txnsData.filter((t: any) => t.time >= start && t.time <= end && (t.status === 'SUCCESS' || t.status === 'COMPLETED'));
          const gmv = dayTxns.reduce((sum: number, t: any) => sum + t.gross, 0);
          const fee = dayTxns.reduce((sum: number, t: any) => sum + t.fee, 0);
          return {
            name: item.label,
            gmv,
            fee
          };
        });

        const users = dateList.map(item => {
          const end = item.dateEnd.getTime();
          // Cumulative user count up to end of this day
          const count = usersData.filter((time: number) => time <= end).length;
          return {
            name: item.label,
            count
          };
        });

        return res.json({ revenue, users });
      } catch (e: any) {
        console.error("Error in chart-data query:", e);
        return res.status(500).json({ error: "Failed to fetch real chart data" });
      }
    } else {
      const db = getDb();
      const dbUsers = db.users || [];
      const dbTxns = db.transactions || [];

      const usersData = dbUsers.map((u: any) => u.created_at ? new Date(u.created_at).getTime() : 0);
      const txnsData = dbTxns.map((t: any) => ({
        time: t.created_at ? new Date(t.created_at).getTime() : 0,
        gross: Number(t.gross_amount) || Number(t.amount) || 0,
        fee: Number(t.platform_fee_amount) || Number(t.fee) || 0,
        status: t.status
      }));

      const revenue = dateList.map(item => {
        const start = item.dateStart.getTime();
        const end = item.dateEnd.getTime();
        const dayTxns = txnsData.filter((t: any) => t.time >= start && t.time <= end && (t.status === 'SUCCESS' || t.status === 'COMPLETED'));
        const gmv = dayTxns.reduce((sum: number, t: any) => sum + t.gross, 0);
        const fee = dayTxns.reduce((sum: number, t: any) => sum + t.fee, 0);
        return {
          name: item.label,
          gmv,
          fee
        };
      });

      const users = dateList.map(item => {
        const end = item.dateEnd.getTime();
        const count = usersData.filter((time: number) => time <= end).length;
        return {
          name: item.label,
          count
        };
      });

      return res.json({ revenue, users });
    }
  });
}
