import express from "express";
import { fanOutNotification } from "./notifyFanout";

// Notification routes (list/unread, mark-all-read, mark-one-read,
// acknowledge, and admin-triggered send) and tag routes (popular tags,
// tag search/autocomplete, and creating a new tag).
// An admin alert (from broadcastAdminNotification) — for staff eyes only, whatever its user_id.
export function isAdminOnlyNotification(n: any): boolean {
  if (!n) return false;
  if (n.is_admin_message === true) return true;
  return String(n.notif_id || n.id || "").endsWith("_all") && String(n.notif_id || n.id || "").startsWith("notif_");
}

export function setupTagsAndNotificationsRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    getActingBrandId,
    sendActivityNotificationEmail,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    getActingBrandId: (user: any) => any;
    sendActivityNotificationEmail?: (opts: any) => Promise<any>;
  }
) {
  const getIsoNow = () => new Date().toISOString();

    const POPULAR_TAGS = [
    "Fashion", "Beauty", "Tech", "Lifestyle", "Travel", "Food", 
    "Fitness", "Finance", "Gaming", "Education", "Entertainment",
    "Health", "Wellness", "Self-care", "Gym", "PersonalCare", "HealthCare",
    "OTT", "MotoVlog", "LGBTQ", "Motivation", "Spirituality", "Parenting",
    "Anime", "KPop", "Sports", "Vlog", "Review", "Comedy", "Music", "Art",
    "Automotive", "RealEstate", "Photography", "Videography", "Podcast"
  ];
  
  let ALL_TAGS = [
    ...POPULAR_TAGS,
    "Software", "Unboxing", "Tutorial", "Skits",
    "Dance", "Design", "Streaming", "Esports", "News", "Politics", "Science",
    "History", "Nature", "Animals", "Pets", "DIY", "Crafts",
    "Skincare", "Makeup", "Yoga", "Meditation", "Nutrition", "Diet",
    "Crypto", "Investing", "Trading", "Business", "Marketing", "Sales",
    "Coding", "Web3", "AI", "Startup", "Entrepreneurship", "Books",
    "Movies", "TV", "Drama", "Action", "Thriller", "Horror", "Romance",
    "Comedy", "SciFi", "Fantasy", "Animation", "Documentary", "Indie",
    "Vintage", "Thrift", "Streetwear", "Sneakers", "Luxury", "Jewelry",
    "Accessories", "Watches", "Bags", "Shoes", "Home", "Decor", "Interior",
    "Architecture", "Garden", "Plants", "Landscaping", "Outdoors", "Camping",
    "Hiking", "Fishing", "Hunting", "Survival", "Tactical", "Military",
    "Aviation", "Boating", "Sailing", "Surfing", "Snowboarding", "Skiing",
    "Skateboarding", "BMX", "Motocross", "Racing", "Drifting", "Offroad",
    "Trucks", "Cars", "Motorcycles", "Bicycles", "Scooters", "EVs",
    "Gadgets", "Smartphones", "Laptops", "PCs", "Audio", "Headphones",
    "Speakers", "Cameras", "Lenses", "Drones", "VR", "AR", "Robotics",
    "Space", "Astronomy", "Physics", "Chemistry", "Biology", "Medicine",
    "Psychology", "Sociology", "Philosophy", "Religion", "Theology", "Mythology"
  ];

  router.get(["/notifications", "/notifications/unread"], async (req, res) => {
    try {
      const user = await parseAuthUser(req);
      if (!user) {
        return res.json([]);
      }

      const actingId = user.role === "brand" ? getActingBrandId(user) : user.user_id;
      const isStaff = user.role === "admin" || user.team_role === "sub_admin";
      const isUnreadOnly = req.path.includes("/unread") || req.query.unread === "true";

      let supabaseNotifs: any[] = [];
      if (supabase) {
        try {
          let q = supabase.from("notifications").select("*");
          if (user.role === "admin" || user.team_role === "sub_admin") {
            q = q.or(`user_id.eq.${actingId},user_id.eq.admin,user_id.eq.all`);
          } else {
            q = q.or(`user_id.eq.${actingId},user_id.eq.all`);
          }

          if (isUnreadOnly) {
            q = q.eq("read", false);
          }

          const { data, error } = await q.order("created_at", { ascending: false }).limit(60);
          if (!error && Array.isArray(data)) {
            // Admin alerts written to 'all' before the fix are still in the table: never show
            // them to a non-admin. (Filtered here, not in the query, so a missing column
            // cannot break the whole list.)
            supabaseNotifs = isStaff ? data : data.filter((n: any) => !isAdminOnlyNotification(n));
          }
        } catch (sErr) {
          console.warn("[Notifications Supabase Fetch Warning]", sErr);
        }
      }

      const db = getDb();
      if (!db.notifications) db.notifications = [];
      const localNotifs = (db.notifications || []).filter((n: any) => {
        const matchesUser =
          n.user_id === actingId ||
          (n.user_id === "all" && (isStaff || !isAdminOnlyNotification(n))) ||
          ((user.role === "admin") && (n.user_id === "admin" || n.is_admin_message));
        if (!matchesUser) return false;
        if (isUnreadOnly && (n.read === true || n.dismissed === true)) return false;
        return true;
      });

      const map = new Map<string, any>();
      for (const item of supabaseNotifs) {
        const id = item.notif_id || item.id;
        if (id) map.set(id, { ...item, notif_id: id });
      }
      for (const item of localNotifs) {
        const id = item.notif_id || item.id;
        if (id && !map.has(id)) {
          map.set(id, { ...item, notif_id: id });
        }
      }

      let list = Array.from(map.values()).sort((a, b) => {
        const tA = new Date(a.created_at || 0).getTime();
        const tB = new Date(b.created_at || 0).getTime();
        return tB - tA;
      });

      // Default welcome notification if list is empty
      if (list.length === 0 && !isUnreadOnly) {
        const welcomeNotif = {
          notif_id: `welcome_${actingId}`,
          user_id: actingId,
          title: "Welcome to Ybex!", // v353: the app says "Ybex" everywhere else
          message: `Welcome aboard, ${user.name || "Creator"}! Explore deals, campaigns, and collaborations in your dashboard.`,
          link: user.role === "brand" ? "/brand/dashboard" : "/dashboard", // v353: tapping it opened the Inbox
          type: "general",
          subtype: "welcome",
          read: true, // Session 58: it is never saved, so "unread" brought the badge back every minute
          created_at: getIsoNow(),
        };
        list.push(welcomeNotif);
      }

      return res.json(list);
    } catch (err) {
      console.error("[Get Notifications Error]", err);
      // v353: was 200 + [] → the screen said "You're all caught up" on a server error instead of "Couldn't load · Retry".
      return res.status(500).json({ error: "Couldn't load notifications. Try again." });
    }
  });


  router.post("/notifications/read-all", async (req, res) => {
    try {
      const user = await parseAuthUser(req);
      if (!user) {
        return res.json({ success: true, read_count: 0 });
      }

      const actingId = user.role === "brand" ? getActingBrandId(user) : user.user_id;

      if (supabase) {
        try {
          await (privilegedSupabase || supabase)
            .from("notifications")
            .update({ read: true })
            .eq("user_id", actingId);

          if (user.role === "admin") {
            await (privilegedSupabase || supabase)
              .from("notifications")
              .update({ read: true })
              .eq("user_id", "admin");
          }
        } catch (sErr) {
          console.warn("[Notifications Mark All Read Supabase Warning]", sErr);
        }
      }

      const db = getDb();
      if (db.notifications) {
        db.notifications.forEach((n: any) => {
          if (n.user_id === actingId || ((user.role === "admin") && n.user_id === "admin")) {
            n.read = true;
          }
        });
        saveDb(db);
      }

      return res.json({ success: true });
    } catch (err) {
      console.error("[Notifications Read All Error]", err);
      return res.json({ success: true });
    }
  });



  // Session 24. WHO for one notification: only its owner (or admins, for the shared "admin"
  // inbox). Before, any signed-in — or signed-out — caller could mark ANY notification read, and
  // the raw id went straight into a PostgREST .or() filter string.
  const notifOwnersFor = (user: any): string[] => {
    const acting = user.role === "brand" ? getActingBrandId(user) : user.user_id;
    const owners = [acting, user.user_id].filter(Boolean);
    if (user.role === "admin") owners.push("admin");
    return Array.from(new Set(owners.map(String)));
  };
  const SAFE_NOTIF_ID = /^[A-Za-z0-9_\-:.]{1,120}$/;

  router.post("/notifications/:id/read", async (req, res) => {
    try {
      const { id } = req.params;
      const user = await parseAuthUser(req);
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      if (!SAFE_NOTIF_ID.test(String(id || ""))) return res.status(400).json({ error: "Invalid notification id" });
      const owners = notifOwnersFor(user);
      let found = false; // v402 (QA S-9): someone else's notice (or an unknown id) is a 404, not "success"

      if (supabase && id) {
        try {
          const { error: upErr, count } = await (privilegedSupabase || supabase)
            .from("notifications")
            .update({ read: true }, { count: "exact" })
            .eq("notif_id", id) // notifications has no "id" column (session 35)
            .in("user_id", owners);
          if (!upErr && Number(count) > 0) found = true;
          // v344: supabase returns { error } instead of throwing — report it, don't fake success
          if (upErr) {
            console.warn("[Notification Mark Read Supabase Error]", upErr);
            return res.status(502).json({ error: "Could not mark notification as read" });
          }
        } catch (sErr) {
          console.warn("[Notification Mark Read Supabase Warning]", sErr);
        }
      }

      const db = getDb();
      if (db.notifications && id) {
        const target = db.notifications.find((n: any) => (n.notif_id === id || n.id === id) && owners.includes(String(n.user_id)));
        if (target) {
          target.read = true;
          found = true;
          saveDb(db);
        }
      }

      if (!found) return res.status(404).json({ error: "Notification not found", code: "NOT_FOUND" });
      return res.json({ success: true, notif_id: id });
    } catch (err) {
      console.error("[Notification Mark Read Error]", err);
      return res.json({ success: true });
    }
  });


  router.post("/notifications/:id/ack", async (req, res) => {
    try {
      const { id } = req.params;
      const { action } = req.body || {};
      const user = await parseAuthUser(req);
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      if (!SAFE_NOTIF_ID.test(String(id || ""))) return res.status(400).json({ error: "Invalid notification id" });
      const owners = notifOwnersFor(user);

      if (supabase && id) {
        try {
          const { error: ackErr } = await (privilegedSupabase || supabase)
            .from("notifications")
            .update({ read: true, acknowledged_at: new Date().toISOString(), action_taken: String(action || "acknowledged").slice(0, 60), action_taken_at: new Date().toISOString() })
            .eq("notif_id", id) // notifications has no "id" column (session 35)
            .in("user_id", owners);
          // v344: supabase returns { error } instead of throwing — report it, don't fake success
          if (ackErr) {
            console.warn("[Notification Ack Supabase Error]", ackErr);
            return res.status(502).json({ error: "Could not acknowledge notification" });
          }
        } catch (sErr) {
          console.warn("[Notification Ack Supabase Warning]", sErr);
        }
      }

      const db = getDb();
      if (db.notifications && id) {
        const target = db.notifications.find((n: any) => (n.notif_id === id || n.id === id) && owners.includes(String(n.user_id)));
        if (target) {
          target.acknowledged = true;
          target.read = true;
          target.ack_action = action || "acknowledged";
          saveDb(db);
        }
      }

      return res.json({ success: true, notif_id: id });
    } catch (err) {
      console.error("[Notification Ack Error]", err);
      return res.json({ success: true });
    }
  });


  router.post("/admin/notifications/send", async (req, res) => {
    try {
      const user = await parseAuthUser(req);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ detail: "Admin only", _status: 403 });
      }

      const {
        message,
        title,
        target_user_id,
        target_type,
        subtype,
        channels,
        is_blocking,
        action_url,
        redirect_path
      } = req.body;

      if (!message) {
        return res.status(400).json({ detail: "Message is required" });
      }

      const notifId = "notif_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
      const targetUserId = target_type === "all" || !target_user_id ? "all" : target_user_id;

      const payload: any = {
        notif_id: notifId,
        user_id: targetUserId,
        title: title || "System Announcement",
        message: message,
        type: "admin_broadcast",
        subtype: subtype || "general",
        read: false,
        acknowledged: false,
        is_blocking: Boolean(is_blocking),
        redirect_path: redirect_path || action_url || null,
        created_at: getIsoNow()
      };

      if (supabase) {
        // Session 35: acknowledged / is_blocking are not notifications columns — the insert failed
        // as a whole, so admin messages never reached the database. They stay on the local copy.
        // Session 53: a failed save is now reported instead of "successfully dispatched".
        const { acknowledged: _ack, is_blocking: _blk, ...dbRow } = payload;
        let insErr: any = null;
        try {
          if (targetUserId === "all") {
            // Session 58: one row per user — a single "all" row is refused by the database (user_id is a foreign key).
            const fan = await fanOutNotification(privilegedSupabase || supabase, dbRow, "all");
            if (!fan.ok) insErr = { message: fan.error };
          } else {
            const r = await (privilegedSupabase || supabase).from("notifications").insert(dbRow);
            insErr = r?.error || null;
          }
        } catch (sErr) { insErr = sErr; }
        if (insErr) {
          console.warn("[Admin Notification Send Supabase Warning]", insErr?.message || insErr);
          return res.status(500).json({ error: "The message could not be saved: " + (insErr?.message || "database error") });
        }
      }

      // Session 53: the "Email" channel really sends an email now (one user only). WhatsApp / SMS were
      // shown in the admin panel but never sent anything — they were removed from the panel.
      let emailed = false;
      const wantsEmail = Array.isArray(channels) && channels.includes("email");
      if (wantsEmail && targetUserId !== "all" && sendActivityNotificationEmail) {
        try {
          const { data: tu } = await (privilegedSupabase || supabase).from("users").select("email, name").eq("user_id", targetUserId).maybeSingle();
          if (tu?.email && String(tu.email).includes("@")) {
            await sendActivityNotificationEmail({ toEmail: tu.email, recipientName: tu.name || "there", type: "ADMIN_MESSAGE", message });
            emailed = true;
          }
        } catch (e: any) { console.warn("[Admin Notification Email]", e?.message || e); }
      }

      const db = getDb();
      if (!db.notifications) db.notifications = [];
      if (!(supabase && targetUserId === "all")) { db.notifications.unshift(payload); saveDb(db); } // Session 58: "all" rows live in the database now

      const ioInstance = app.get("io");
      if (ioInstance) {
        if (targetUserId === "all") {
          ioInstance.emit("bell_notification", payload);
          ioInstance.emit("new_notification", payload);
        } else {
          ioInstance.to(`user_${targetUserId}`).emit("bell_notification", payload); // sockets join user_<id>
          ioInstance.to(`user_${targetUserId}`).emit("new_notification", payload);
        }
      }

      return res.json({ success: true, notification: payload, emailed });
    } catch (err) {
      console.error("[Admin Send Notification Error]", err);
      return res.status(500).json({ detail: "Failed to send notification" });
    }
  });


  router.get("/tags/popular", (req, res) => {
    return res.json(POPULAR_TAGS);
  });


  router.get("/tags/search", (req, res) => {
    const rawQ = ((req.query.q || "") as string).trim();
    const q = rawQ.toLowerCase();
    const qNorm = q.replace(/[-_\s]+/g, "");
    
    if (!q) {
      return res.json(ALL_TAGS.slice(0, 15));
    }
    
    const matched = ALL_TAGS.filter(t => {
      const tLower = t.toLowerCase();
      const tNorm = tLower.replace(/[-_\s]+/g, "");
      return tLower.includes(q) || tNorm.includes(qNorm);
    });
    
    // Deduplicate case-insensitively
    const seen = new Set<string>();
    const uniqueMatched: string[] = [];
    for (const item of matched) {
      const key = item.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueMatched.push(item);
      }
    }

    return res.json(uniqueMatched.slice(0, 15));
  });


  // v344: logged-in users only; trimmed, max 40 chars, letters/numbers/space/&-# only, deduped case-insensitively
  const SAFE_TAG = /^[\p{L}\p{N} &\-#]{1,40}$/u;
  router.post("/tags/create", async (req, res) => {
    const user = await parseAuthUser(req).catch(() => null);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { name } = req.body || {};
    if (name && typeof name === "string") {
      const cleanName = name.trim().replace(/\s+/g, " ");
      if (!cleanName || cleanName.length > 40 || !SAFE_TAG.test(cleanName)) {
        return res.status(400).json({ error: "Invalid tag name" });
      }
      const existing = ALL_TAGS.find((t: string) => t.toLowerCase() === cleanName.toLowerCase());
      if (existing) return res.json({ success: true, tag: existing });
      ALL_TAGS.push(cleanName);
      return res.json({ success: true, tag: cleanName });
    }
    return res.status(400).json({ error: "Invalid tag name" });
  });

}
