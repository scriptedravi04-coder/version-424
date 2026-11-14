import { logIgnored } from "./logIgnored";
import express from "express";
import { readCreatorsLean } from "./inboxLean"; // v428: list reads without Instagram posts (egress)
import { approveCreatorApplication, approveAccountProfile, sendApplicationDecisionEmail, onlyColumns, WAITLIST_COLUMNS } from "./creatorApplication";
import { prepareCsvRows, toWaitlistRow, fillMissing, CSV_MAX_ROWS, CSV_IMPORT_SOURCE, mobileKey, handleKey } from "./waitlistCsvImport";
import { platformLabel } from "./waitlistPlatform";
import { awaitingReview } from "./exploreGate"; // v357

const getIsoNow = () => new Date().toISOString();

// Admin waitlist / approval queue: merges raw `waitlist` table rows with any
// registered creator/brand profiles still sitting in `under_review`, so admins
// see one unified list. Approve either activates a registered profile, or —
// for a creator who applied via the public form and never signed up — creates
// an "unclaimed" shadow user + creator_profile so they show up in Explore
// Creators immediately (claimable later if they register with the same info).
export function setupAdminWaitlistRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    sendNotification,
    checkAdminPerm,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    sendNotification: (db: any, userId: any, type: any, message: any) => Promise<any>;
    checkAdminPerm: (user: any, perm: string) => Promise<boolean>;
  }
) {
  router.get("/admin/waitlist", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }

    try {
      const activeClient = privilegedSupabase || supabase;
      let waitlistData: any[] = [];
      let creatorProfiles: any[] = [];
      let brandProfiles: any[] = [];
      let allUsers: any[] = [];
      let allCreatorKyc: any[] = [];

      if (activeClient) {
        const [wRes, cpRes, bpRes, uRes, ckRes] = await Promise.all([
          activeClient.from('waitlist').select('*').order('created_at', { ascending: false }),
          readCreatorsLean(activeClient, (q: any) => q.order('created_at', { ascending: false })),
          activeClient.from('brand_profiles').select('*').order('created_at', { ascending: false }),
          // Session 35: only columns that exist (the old lists named mobile / dob / gender / city /
          // is_claimed … on users and dob / phone / aadhaar_number on creator_kyc, so both reads failed
          // and no row ever got its account or KYC details). KYC: only what this list shows.
          activeClient.from('users').select('user_id, email, name, phone, picture, role, auth_method, created_at'),
          activeClient.from('creator_kyc').select('creator_id, instagram_handle, follower_count, niche, status')
        ]);
        waitlistData = wRes.data || [];
        creatorProfiles = cpRes.data || [];
        brandProfiles = bpRes.data || [];
        allUsers = uRes.data || [];
        allCreatorKyc = ckRes.data || [];
      }

      const localDb = getDb();
      if (localDb.waitlist && Array.isArray(localDb.waitlist)) {
        const seenWIds = new Set(waitlistData.map((w: any) => String(w.id || '')));
        localDb.waitlist.forEach((w: any) => {
          const wId = String(w.id || '');
          if (!wId || !seenWIds.has(wId)) {
            waitlistData.push(w);
            if (wId) seenWIds.add(wId);
          }
        });
      }

      if (localDb.creator_profiles && Array.isArray(localDb.creator_profiles)) {
        const seenCpIds = new Set(creatorProfiles.map((c: any) => String(c.user_id || '')));
        localDb.creator_profiles.forEach((c: any) => {
          if (c.user_id && !seenCpIds.has(String(c.user_id))) {
            creatorProfiles.push(c);
            seenCpIds.add(String(c.user_id));
          }
        });
      }

      if (localDb.brand_profiles && Array.isArray(localDb.brand_profiles)) {
        const seenBpIds = new Set(brandProfiles.map((b: any) => String(b.user_id || '')));
        localDb.brand_profiles.forEach((b: any) => {
          if (b.user_id && !seenBpIds.has(String(b.user_id))) {
            brandProfiles.push(b);
            seenBpIds.add(String(b.user_id));
          }
        });
      }

      const userMap = new Map<string, any>();
      const userEmailMap = new Map<string, any>();
      (allUsers || []).forEach(u => {
        if (u.user_id) userMap.set(u.user_id, u);
        if (u.email) userEmailMap.set(u.email.toLowerCase().trim(), u);
      });
      (localDb.users || []).forEach((u: any) => {
        if (u.user_id && !userMap.has(u.user_id)) userMap.set(u.user_id, u);
        if (u.email && !userEmailMap.has(u.email.toLowerCase().trim())) userEmailMap.set(u.email.toLowerCase().trim(), u);
      });

      const kycMap = new Map<string, any>();
      (allCreatorKyc || []).forEach(k => {
        if (k.creator_id) kycMap.set(k.creator_id, k);
      });

      const mappedList: any[] = [];
      const seenKeys = new Set<string>();

      // v413 (Ravi: "ek hi creator 2 baar dikh raha hai"): a "Started" lead (checked @handle on the Join screen) is
      // dropped once a creator account with the same Instagram handle exists — the real account row replaces it.
      const igKey = (v: any) => String(v || '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/^@/, '').replace(/[/?#].*$/, '');
      const accountHandles = new Set<string>();
      (creatorProfiles || []).forEach((cp: any) => { const h = igKey(cp.instagram_handle || cp.handle); if (h) accountHandles.add(h); });
      (allCreatorKyc || []).forEach((k: any) => { const h = igKey(k.instagram_handle); if (h) accountHandles.add(h); });
      // v419 (Ravi): a lead that was approved from the "Started" row while the person also had an account left that account
      // waiting — approve the account now (once; reviewed_at is set), so the same person never sits in the list twice.
      const accountByHandle = new Map<string, any>();
      (creatorProfiles || []).forEach((cp: any) => { const h = igKey(cp.instagram_handle || cp.handle); if (h && !cp.is_deleted && (!accountByHandle.has(h) || cp.reviewed_at)) accountByHandle.set(h, cp); });
      for (const w of waitlistData || []) {
        if (String(w.status || '').toLowerCase() !== 'approved') continue;
        const cp = accountByHandle.get(igKey(w.social_handle)) || (w.linked_user_id ? (creatorProfiles || []).find((c: any) => String(c.user_id) === String(w.linked_user_id)) : null);
        if (cp && awaitingReview(cp)) {
          if (await approveAccountProfile(activeClient, localDb, cp.user_id)) { cp.profile_status = 'approved'; cp.reviewed_at = getIsoNow(); }
        }
      }
      waitlistData = (waitlistData || []).filter((w: any) => !(String(w.source || '') === 'join_started' && accountHandles.has(igKey(w.social_handle))));

      // 1. Process all entries from waitlist table (preserving all distinct creator applications)
      (waitlistData || []).forEach((w) => {
        const emailKey = (w.email || '').toLowerCase().trim();
        const idKey = String(w.id || '');
        if (idKey && seenKeys.has(idKey)) return;

        if (idKey) seenKeys.add(idKey);
        if (w.user_id && w.is_registered_user) seenKeys.add(String(w.user_id));
        if (w.linked_user_id) seenKeys.add(String(w.linked_user_id));

        const u = (w.linked_user_id ? userMap.get(w.linked_user_id) : null) || 
                  (w.user_id ? userMap.get(w.user_id) : null) || 
                  (w.is_registered_user && emailKey ? userEmailMap.get(emailKey) : null);
        const k = (w.linked_user_id ? kycMap.get(w.linked_user_id) : null) || (w.user_id ? kycMap.get(w.user_id) : null);

        const statusRaw = String(w.status || 'Pending').trim();
        let status = 'Pending';
        if (statusRaw.toLowerCase() === 'approved') status = 'Approved';
        else if (statusRaw.toLowerCase() === 'rejected') status = 'Rejected';

        const isBrand = w.role === 'brand' || Boolean(w.company_name);
        const isRegistered = w.is_registered_user === true || (u && u.auth_method !== 'unclaimed' && u.is_claimed !== false);

        const phoneVal = w.phone || w.mobile || u?.phone || u?.mobile || k?.phone || "";
        const dobVal = w.dob || w.date_of_birth || u?.dob || u?.date_of_birth || k?.dob || "";
        const genderVal = w.gender || u?.gender || "";
        const cityVal = w.city || u?.city || "";
        const stateVal = w.state || u?.state || "";
        const nicheVal = w.niche || w.category || w.primary_niche || (isBrand ? "Retail" : "Fashion & Lifestyle");
        const handleVal = w.social_handle || w.handle || w.instagram_handle || (w.name ? "@" + w.name.toLowerCase().replace(/\s+/g, '') : "");
        // v363: real numbers fetched from Instagram (ig_followers / instagram_stats) win over what the form said;
        // the form's own number stays visible as form_followers.
        const formFollowers = Number(w.followers || w.follower_count || 0);
        const igFollowers = Number(w.ig_followers || 0);
        const followersCount = igFollowers || formFollowers;
        const photoVal = w.profile_photo_url || w.photo || w.picture || u?.picture || "";

        mappedList.push({
          id: w.id || "wl_" + (emailKey || Math.random().toString(36).substring(2, 7)),
          user_id: w.linked_user_id || w.user_id || w.id,
          role: isBrand ? "brand" : "creator",
          name: isBrand ? (w.company_name || w.name || "Brand Representative") : (w.name || u?.name || "Creator"),
          company_name: w.company_name || (isBrand ? (w.name || "Brand") : ""),
          email: w.email || u?.email || "",
          handle: handleVal,
          social_handle: handleVal,
          instagram_link: w.instagram_link || (handleVal && !handleVal.includes('youtube.com') ? "https://instagram.com/" + handleVal.replace(/^@/, '') : ""),
          youtube: w.youtube || w.youtube_url || "",
          youtube_link: w.youtube || w.youtube_url || "",
          website: w.website || "",
          followers: followersCount,
          form_followers: formFollowers,
          ig_followers: igFollowers || null,
          ig_stats: w.instagram_stats || null,
          ig_synced_at: w.instagram_synced_at || null,
          ig_error: w.instagram_fetch_error || null,
          // Session 40: from what the creator gave (handle/link), not the stored label.
          platform: platformLabel({
            stored: w.platform,
            instagram: [w.instagram_link, w.social_handle, w.handle, w.instagram_handle],
            youtube: [w.youtube, w.youtube_url],
          }),
          status,
          profile_status: status === 'Approved' ? 'approved' : (status === 'Rejected' ? 'rejected' : 'under_review'),
          created_at: w.created_at || getIsoNow(),
          date: w.created_at ? w.created_at.split("T")[0] : getIsoNow().split("T")[0],
          photo: photoVal,
          picture: photoVal,
          category: nicheVal,
          niche: nicheVal,
          city: cityVal,
          state: stateVal,
          location: cityVal ? cityVal + (stateVal ? ', ' + stateVal : '') : (stateVal || "India"),
          mobile: phoneVal,
          phone: phoneVal,
          dob: dobVal,
          date_of_birth: dobVal,
          gender: genderVal,
          charges: w.charges || "",
          pricing: w.pricing || {
            reel: Number(w.rate_reel || 0),
            story: Number(w.rate_story || 0),
            yt_video: Number(w.rate_yt_video || 0),
            ugc: Number(w.rate_reel || 0)
          },
          ugc_rating: Number(w.ugc_rating || 7),
          avg_reach: w.avg_reach || "",
          collab_types: Array.isArray(w.collab_types) ? w.collab_types : [],
          sample_links: Array.isArray(w.sample_links) ? w.sample_links : [],
          portfolio: Array.isArray(w.sample_links) ? w.sample_links : (w.portfolio || []),
          notes: w.notes || w.about || w.bio || "",
          about: w.about || w.notes || w.bio || "",
          is_registered_user: isRegistered,
          reject_reason: w.reject_reason || w.rejectReason || "",
          rejectReason: w.reject_reason || w.rejectReason || "",
          panel_message: w.panel_message || "",
          source: w.source || "" // v397: "low_followers_work" = under 500 followers, shared a work link
        });
      });

      // 2. Add any registered creator profiles that are 'under_review' and NOT already in mapped waitlist
      // v357: also creators the database marked "approved" by default (signed up, never reviewed) — Ravi wants every
      // registered creator here until he approves them.
      (creatorProfiles || []).forEach((cp) => {
        if (cp.is_deleted) return;
        if (cp.profile_status !== 'under_review' && !awaitingReview(cp)) return;
        const emailKey = (cp.email || '').toLowerCase().trim();
        const idKey = String(cp.user_id || '');
        if (emailKey && seenKeys.has(emailKey)) return;
        if (idKey && seenKeys.has(idKey)) return;

        if (emailKey) seenKeys.add(emailKey);
        if (idKey) seenKeys.add(idKey);

        const u = userMap.get(cp.user_id) || (emailKey ? userEmailMap.get(emailKey) : null);
        const k = kycMap.get(cp.user_id);
        const phoneVal = cp.phone || cp.mobile || u?.phone || u?.mobile || k?.phone || "";
        const nicheVal = cp.primary_niche || cp.category || k?.niche || "Fashion & Lifestyle";
        const handleVal = cp.instagram_handle || cp.handle || (k?.instagram_handle ? "@" + k.instagram_handle.replace(/^@/, '') : "@" + (cp.name || "creator").toLowerCase().replace(/\s+/g, ''));
        const followersCount = Number(cp.followers_instagram || cp.follower_count || cp.followers || k?.follower_count || 0);
        const photoVal = cp.photo || cp.picture || u?.picture || "";

        mappedList.push({
          id: cp.user_id,
          user_id: cp.user_id,
          role: "creator",
          name: cp.name || cp.full_name || u?.name || "Creator",
          email: cp.email || u?.email || "",
          handle: handleVal,
          social_handle: handleVal,
          instagram_link: handleVal && !handleVal.includes('youtube.com') ? "https://instagram.com/" + handleVal.replace(/^@/, '') : "",
          youtube: cp.youtube || "",
          youtube_link: cp.youtube || "",
          followers: followersCount,
          // Session 40: from what the creator gave (handle/link), not the stored label.
          platform: platformLabel({
            stored: cp.platform,
            instagram: [cp.instagram_handle, cp.handle, cp.instagram, k?.instagram_handle],
            youtube: [cp.youtube, cp.youtube_channel_url],
          }),
          status: "Pending",
          profile_status: "under_review",
          created_at: cp.created_at || getIsoNow(),
          date: cp.created_at ? cp.created_at.split("T")[0] : getIsoNow().split("T")[0],
          photo: photoVal,
          picture: photoVal,
          category: nicheVal,
          niche: nicheVal,
          city: cp.city || u?.city || "",
          state: cp.state || u?.state || "",
          location: cp.city ? cp.city + (cp.state ? ', ' + cp.state : '') : (cp.state || "India"),
          mobile: phoneVal,
          phone: phoneVal,
          dob: cp.dob || u?.dob || "",
          gender: cp.gender || u?.gender || "",
          charges: cp.charges || (cp.rate_reel ? "₹" + cp.rate_reel : ""),
          pricing: {
            reel: Number(cp.rate_reel || 0),
            story: Number(cp.rate_story || 0),
            yt_video: Number(cp.rate_yt_video || 0),
            ugc: Number(cp.rate_reel || 0)
          },
          ugc_rating: Number(cp.ugc_rating || 7),
          avg_reach: cp.avg_views_30d || "",
          collab_types: cp.collab_types || [],
          sample_links: cp.portfolio || [],
          portfolio: cp.portfolio || [],
          notes: cp.bio || cp.about || "",
          about: cp.about || cp.bio || "",
          is_registered_user: true,
          reject_reason: "",
          rejectReason: "",
          panel_message: cp.panel_message || ""
        });
      });

      // 3. Add any registered brand profiles that are 'under_review' and NOT already in mapped waitlist
      (brandProfiles || []).forEach((bp) => {
        if (bp.profile_status !== 'under_review') return;
        const emailKey = (bp.email || '').toLowerCase().trim();
        const idKey = String(bp.user_id || '');
        if (emailKey && seenKeys.has(emailKey)) return;
        if (idKey && seenKeys.has(idKey)) return;

        if (emailKey) seenKeys.add(emailKey);
        if (idKey) seenKeys.add(idKey);

        const u = userMap.get(bp.user_id) || (emailKey ? userEmailMap.get(emailKey) : null);
        const photoVal = bp.logo || bp.photo || bp.picture || u?.picture || "";

        mappedList.push({
          id: bp.user_id,
          user_id: bp.user_id,
          role: "brand",
          company_name: bp.company_name || bp.brand_name || u?.name || "Brand",
          name: bp.contact_person || bp.rep_name || u?.name || bp.company_name || "Brand Representative",
          email: bp.email || u?.email || "",
          website: bp.website || "",
          monthly_budget: bp.monthly_budget || bp.budget || "",
          company_size: bp.company_size || "",
          status: "Pending",
          profile_status: "under_review",
          created_at: bp.created_at || getIsoNow(),
          date: bp.created_at ? bp.created_at.split("T")[0] : getIsoNow().split("T")[0],
          photo: photoVal,
          picture: photoVal,
          category: bp.industry || bp.category || "Retail",
          niche: bp.industry || bp.category || "Retail",
          city: bp.city || u?.city || "",
          state: bp.state || u?.state || "",
          location: bp.city ? bp.city + (bp.state ? ', ' + bp.state : '') : (bp.state || "India"),
          mobile: bp.phone || u?.phone || "",
          phone: bp.phone || u?.phone || "",
          is_registered_user: true,
          reject_reason: "",
          rejectReason: "",
          panel_message: bp.panel_message || ""
        });
      });

      // v419 (Ravi: "waitlist se hi KYC bhi approve ho jaye"): each creator row carries its KYC state, so the team can
      // approve both from one place. And two real accounts with the same Instagram are flagged (not hidden) so the team
      // can pick the one to keep.
      const handleCount = new Map<string, number>();
      mappedList.forEach((r: any) => { if (r.role === 'creator' && r.is_registered_user) { const h = igKey(r.social_handle); if (h) handleCount.set(h, (handleCount.get(h) || 0) + 1); } });
      mappedList.forEach((r: any) => {
        if (r.role !== 'creator') return;
        const k = kycMap.get(String(r.user_id || ''));
        r.kyc_status = k ? String(k.status || '').toLowerCase() : '';
        const h = igKey(r.social_handle);
        if (r.is_registered_user && h && (handleCount.get(h) || 0) > 1) r.same_handle_accounts = handleCount.get(h);
      });

      // Sort: Pending applications first, then by created_at descending
      mappedList.sort((a, b) => {
        if (a.status === "Pending" && b.status !== "Pending") return -1;
        if (a.status !== "Pending" && b.status === "Pending") return 1;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });

      // Assign sequence position #1, #2, etc.
      mappedList.forEach((item, idx) => {
        item.position = idx + 1;
      });

      return res.json(mappedList);
    } catch (err: any) {
      console.error("Error fetching waitlist queue:", err);
      return res.status(500).json({ error: "Failed to fetch approval queue: " + err.message });
    }
  });

  router.patch("/admin/waitlist/:id", async (req, res) => {
    try {
      const user = await parseAuthUser(req);
      if (!user || !(await checkAdminPerm(user, 'manage_users'))) {
        if (user?.role !== 'admin') return res.status(403).json({ detail: "Admin only", _status: 403 });
      }

      const targetId = req.params.id;
      const updates = req.body;
      const activeClient = privilegedSupabase || supabase;

      if (activeClient) {
        // Supabase refuses the WHOLE update when one key is not a real column (the edit form also sends
        // phone / location / photo / about for older screens). So only the real, editable columns go to
        // Supabase — this is what makes the profile photo (profile_photo_url) actually save.
        const LOCKED = new Set(["id", "status", "role", "created_at", "linked_user_id", "is_registered_user", "terms_accepted_at", "reject_reason", "panel_message", "source"]);
        const editable = WAITLIST_COLUMNS.filter((c: string) => !LOCKED.has(c));
        const dbUpdates: any = onlyColumns(updates || {}, editable);
        // v365: email is optional now — an empty box is saved as null (unique when present, so "" twice would clash)
        if ("email" in dbUpdates) { const e = String(dbUpdates.email || "").trim().toLowerCase(); dbUpdates.email = e || null; }
        if (Object.keys(dbUpdates).length) {
          const { error: upErr } = await activeClient.from('waitlist').update(dbUpdates).eq('id', targetId);
          if (upErr) return res.status(500).json({ error: "Could not save: " + upErr.message });
        }
      }

      const localDb = getDb();
      if (localDb.waitlist) {
        const wIdx = localDb.waitlist.findIndex((w: any) => String(w.id) === String(targetId) || String(w.user_id) === String(targetId));
        if (wIdx >= 0) {
          localDb.waitlist[wIdx] = { ...localDb.waitlist[wIdx], ...updates };
        }
      }
      saveDb(localDb);

      return res.json({ ok: true, message: "Waitlist entry updated successfully" });
    } catch (err: any) {
      console.error("Waitlist patch error:", err);
      return res.status(500).json({ error: err.message || "Failed to update waitlist entry" });
    }
  });

  // Admin Approve Waitlist Entry / Creator / Brand
  // Session 36: Admin → Waitlist → Upload CSV. preview=true only checks; otherwise good rows are saved as
  // Pending waitlist rows (source csv_import) for normal review. Nothing is invented, nothing is approved.
  router.post("/admin/waitlist/import-csv", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only" });
    }
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows || rows.length === 0) return res.status(400).json({ detail: "The file has no rows." });
    if (rows.length > CSV_MAX_ROWS) return res.status(400).json({ detail: `Up to ${CSV_MAX_ROWS} rows per file.` });
    const activeClient = privilegedSupabase || supabase;
    const existing = new Set<string>();
    const knownMobiles = new Set<string>();
    const knownHandles = new Set<string>();
    const addMobile = (v: any) => { const k = mobileKey(v); if (k) knownMobiles.add(k); };
    const addHandle = (v: any) => { const k = handleKey(v); if (k) knownHandles.add(k); };
    // v291 (Ravi): rows an earlier partial import already made (source csv_import) can be completed by
    // uploading the same file again — only their EMPTY cells get filled.
    const earlier = new Map<string, any>();
    const earlierByHandle = new Map<string, any>(); // v365: handle-only rows (no email) an earlier import made
    const remember = (r: any) => {
      const e = String(r?.email || "").trim().toLowerCase();
      if (!e) {
        // v365: a row without an email is known by its Instagram handle (and mobile)
        const h = handleKey(r?.social_handle) || handleKey(r?.instagram_link);
        if (r?.source === CSV_IMPORT_SOURCE && r?.id && h) { earlierByHandle.set(h, r); return; }
        addMobile(r?.mobile); addHandle(r?.social_handle); addHandle(r?.instagram_link);
        return;
      }
      existing.add(e);
      if (r.source === CSV_IMPORT_SOURCE && r.id) { earlier.set(e, r); return; } // a re-upload may complete it
      addMobile(r.mobile); addHandle(r.social_handle); addHandle(r.instagram_link);
    };
    try {
      if (activeClient) {
        // Session 58: also users' phone numbers and creators' Instagram handles (Explore creators), so a person
        // already on Ybex under another email is skipped too.
        const [w, u, cp] = await Promise.all([
          activeClient.from('waitlist').select('*'),
          activeClient.from('users').select('email, phone'),
          activeClient.from('creator_profiles').select('email, instagram, instagram_handle'),
        ]);
        for (const r of (w.data || [])) remember(r);
        for (const r of (u.data || [])) { if (r?.email) existing.add(String(r.email).trim().toLowerCase()); addMobile(r?.phone); }
        for (const r of (cp.data || [])) { if (r?.email) existing.add(String(r.email).trim().toLowerCase()); addHandle(r?.instagram_handle); addHandle(r?.instagram); }
      }
      const localDb = getDb();
      for (const r of (localDb.waitlist || [])) { const e = String(r?.email || "").trim().toLowerCase(); if (!e ? !r?.id || !earlierByHandle.has(handleKey(r?.social_handle)) : !earlier.has(e)) remember(r); }
      for (const r of (localDb.users || [])) if (r?.email) existing.add(String(r.email).trim().toLowerCase());
    } catch (e) { logIgnored("admin_waitlist_routes:import-csv", e); }

    // v365: a handle that an email row of an earlier import already has is "known" for handle-only rows
    for (const r of earlier.values()) { const h = handleKey(r?.social_handle) || handleKey(r?.instagram_link); if (h && !earlierByHandle.has(h)) knownHandles.add(h); }
    const results = prepareCsvRows(rows, existing, new Set(earlier.keys()), { mobiles: knownMobiles, handles: knownHandles, updatableHandles: new Set(earlierByHandle.keys()) });
    const summary = {
      total: results.length,
      ok: results.filter((r) => r.status === "ok").length,
      updates: results.filter((r) => r.status === "update").length,
      errors: results.filter((r) => r.status === "error").length,
      duplicates: results.filter((r) => r.status === "duplicate").length,
    };
    if (req.body?.preview) return res.json({ preview: true, summary, results });

    const toSave = results.filter((r) => r.status === "ok").map((r) => toWaitlistRow(r.value!));
    const patches = results.filter((r) => r.status === "update").map((r) => {
      const old = r.value!.email ? earlier.get(String(r.value!.email).toLowerCase())
        : earlierByHandle.get(handleKey(r.value!.social_handle) || handleKey(r.value!.instagram_link)); // v365
      return { id: old?.id, patch: old ? fillMissing(old, r.value!) : {} };
    }).filter((x) => x.id && Object.keys(x.patch).length > 0);
    if (toSave.length === 0 && patches.length === 0) return res.status(400).json({ detail: "No valid rows to import.", summary, results });
    if (activeClient) {
      if (toSave.length) {
        const { error } = await activeClient.from('waitlist').insert(toSave);
        if (error) {
          console.error("[import-csv] waitlist insert failed:", error.message);
          return res.status(502).json({ detail: "Could not save the rows. Nothing was imported.", error: error.message });
        }
      }
      for (const x of patches) {
        const { error } = await activeClient.from('waitlist').update(x.patch).eq('id', x.id);
        if (error) console.error("[import-csv] waitlist update failed:", error.message);
      }
    }
    const localDb = getDb();
    if (!localDb.waitlist) localDb.waitlist = [];
    localDb.waitlist.push(...toSave);
    for (const x of patches) {
      const lr = localDb.waitlist.find((w: any) => w.id === x.id);
      if (lr) Object.assign(lr, x.patch);
    }
    saveDb(localDb);
    return res.json({ imported: toSave.length, updated: patches.length, summary, results });
  });

  router.post("/admin/waitlist/:id/approve", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }

    const targetId = req.params.id;
    const activeClient = privilegedSupabase || supabase;

    try {
      const localDb = getDb();
      if (!localDb.users) localDb.users = [];
      if (!localDb.creator_profiles) localDb.creator_profiles = [];
      if (!localDb.brand_profiles) localDb.brand_profiles = [];
      if (!localDb.waitlist) localDb.waitlist = [];

      // 1. Check if item exists in waitlist table
      let waitlistEntry: any = null;
      if (activeClient) {
        const { data } = await activeClient.from('waitlist').select('*').eq('id', targetId).maybeSingle();
        if (data) waitlistEntry = data;
        else {
          const { data: byUser } = await activeClient.from('waitlist').select('*').eq('linked_user_id', targetId).limit(1).maybeSingle(); // Session 58: waitlist has no user_id column (the .or errored)
          if (byUser) waitlistEntry = byUser;
        }
      }
      if (!waitlistEntry && localDb.waitlist) {
        waitlistEntry = localDb.waitlist.find((w: any) => String(w.id) === String(targetId) || String(w.linked_user_id) === String(targetId) || String(w.user_id) === String(targetId));
      }

      // v431 (admin audit #61): the phone sends expect_pending — refuse when another admin already decided
      if (req.body?.expect_pending && waitlistEntry && !["", "pending"].includes(String(waitlistEntry.status || "").toLowerCase())) {
        return res.status(409).json({ error: `Already ${String(waitlistEntry.status).toLowerCase()} by another admin.`, code: "ALREADY_DECIDED" });
      }
      // 2. Check if item exists as a registered creator profile
      let existingCp: any = null;
      if (activeClient) {
        const { data } = await activeClient.from('creator_profiles').select('*').eq('user_id', targetId).maybeSingle();
        if (data) existingCp = data;
      }
      if (!existingCp && localDb.creator_profiles) {
        existingCp = localDb.creator_profiles.find((c: any) => String(c.user_id) === String(targetId));
      }

      // 3. Check if item exists as a registered brand profile
      let existingBp: any = null;
      if (activeClient) {
        const { data } = await activeClient.from('brand_profiles').select('*').eq('user_id', targetId).maybeSingle();
        if (data) existingBp = data;
      }
      if (!existingBp && localDb.brand_profiles) {
        existingBp = localDb.brand_profiles.find((b: any) => String(b.user_id) === String(targetId));
      }

      const defaultPhoto = ""; // no stock photo — it used to become the creator's real profile picture (session 27)

      // BRANCH 1: Brand Profile Approval
      if (existingBp || waitlistEntry?.role === 'brand') {
        const brandUserId = existingBp?.user_id || waitlistEntry?.linked_user_id || waitlistEntry?.user_id || targetId;
        if (activeClient) {
          await activeClient.from('brand_profiles').update({ profile_status: 'approved', reviewed_at: getIsoNow() }).eq('user_id', brandUserId);
          await activeClient.from('waitlist').update({ status: 'Approved' }).eq('id', targetId);
        }
        const bpIdx = localDb.brand_profiles.findIndex((b: any) => String(b.user_id) === String(brandUserId));
        if (bpIdx >= 0) localDb.brand_profiles[bpIdx].profile_status = 'approved';
        const wIdx = localDb.waitlist.findIndex((w: any) => String(w.id) === String(targetId));
        if (wIdx >= 0) localDb.waitlist[wIdx].status = 'Approved';
        saveDb(localDb);

        await sendNotification(null, brandUserId, 'profile_approved', 'Your brand profile is live. Start posting campaigns.');
        return res.json({ ok: true, message: 'Brand approved successfully' });
      }

      // BRANCH 2: Registered Creator Profile Approval (Already has regular auth user)
      if (existingCp && (existingCp.is_claimed !== false && existingCp.creator_type !== 'unclaimed') && waitlistEntry?.is_registered_user !== false) {
        if (activeClient) {
          await activeClient.from('creator_profiles').update({ profile_status: 'approved', reviewed_at: getIsoNow() }).eq('user_id', targetId);
          await activeClient.from('waitlist').update({ status: 'Approved' }).eq('id', targetId);
        }
        const cpIdx = localDb.creator_profiles.findIndex((c: any) => String(c.user_id) === String(targetId));
        if (cpIdx >= 0) { localDb.creator_profiles[cpIdx].profile_status = 'approved'; localDb.creator_profiles[cpIdx].reviewed_at = getIsoNow(); } // v357
        const wIdx = localDb.waitlist.findIndex((w: any) => String(w.id) === String(targetId));
        if (wIdx >= 0) localDb.waitlist[wIdx].status = 'Approved';
        saveDb(localDb);

        await sendNotification(null, targetId, 'profile_approved', 'Your profile is approved and live for brands on Explore Creators. Below is how brands see you.');
        return res.json({ ok: true, message: 'Creator approved successfully' });
      }

      // BRANCH 3 (session 34): public application → ONE unclaimed profile on Explore, never a change to
      // a real account; approval email. Shared with batch-approve (backend/creatorApplication.ts).
      if (!waitlistEntry) return res.status(404).json({ error: 'Application not found' });
      const result: any = await approveCreatorApplication(waitlistEntry, { client: activeClient, getDb, saveDb });
      if (!result.ok) return res.status(500).json({ error: result.error });
      const emailed = await sendApplicationDecisionEmail(waitlistEntry, 'approved');
      return res.json({ ...result, emailed });
    } catch (err: any) {
      console.error('Waitlist approve error:', err);
      return res.status(500).json({ error: 'Approval failed: ' + err.message });
    }
  });

  router.post("/admin/waitlist/:id/reject", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }

    const targetId = req.params.id;
    // Session 34 (Ravi): the reason goes to the creator by email, so it is required.
    const reason = String(req.body?.reason || "").trim().slice(0, 500);
    if (reason.length < 3) return res.status(400).json({ error: "Please write the reason — it is emailed to the creator." });
    const activeClient = privilegedSupabase || supabase;

    try {
      // v431 (admin audit #61): refuse a stale reject when another admin already decided (the phone sends expect_pending)
      if (req.body?.expect_pending && activeClient) {
        const { data: wr } = await activeClient.from("waitlist").select("status").eq("id", targetId).maybeSingle();
        if (wr && !["", "pending"].includes(String(wr.status || "").toLowerCase())) return res.status(409).json({ error: `Already ${String(wr.status).toLowerCase()} by another admin.`, code: "ALREADY_DECIDED" });
      }
      if (activeClient) {
        // (profiles have no reject_reason column — the reason is kept on the waitlist row and emailed)
        await activeClient.from("creator_profiles").update({ profile_status: "rejected", reviewed_at: getIsoNow() }).eq("user_id", targetId);
        await activeClient.from("brand_profiles").update({ profile_status: "rejected", reviewed_at: getIsoNow() }).eq("user_id", targetId);
        await activeClient.from("waitlist").update({ status: "Rejected", reject_reason: reason }).eq("id", targetId);
      }

      const localDb = getDb();
      if (localDb.waitlist) {
        const wIdx = localDb.waitlist.findIndex((w: any) => String(w.id) === String(targetId) || String(w.user_id) === String(targetId) || String(w.linked_user_id) === String(targetId));
        if (wIdx >= 0) {
          localDb.waitlist[wIdx].status = "Rejected";
          localDb.waitlist[wIdx].rejectReason = reason;
          localDb.waitlist[wIdx].reject_reason = reason;
        }
      }
      if (localDb.creator_profiles) {
        const cpIdx = localDb.creator_profiles.findIndex((c: any) => String(c.user_id) === String(targetId));
        if (cpIdx >= 0) {
          localDb.creator_profiles[cpIdx].profile_status = "rejected";
          localDb.creator_profiles[cpIdx].reject_reason = reason;
        }
      }
      saveDb(localDb);

      let entry: any = (localDb.waitlist || []).find((w: any) => String(w.id) === String(targetId)) || null;
      if (activeClient) {
        const { data } = await activeClient.from("waitlist").select("*").eq("id", targetId).maybeSingle();
        if (data) entry = data;
      }
      const emailed = entry ? await sendApplicationDecisionEmail(entry, "rejected", reason) : false;
      return res.json({ ok: true, message: "Profile rejected.", emailed });
    } catch (err: any) {
      console.error("Waitlist reject error:", err);
      return res.status(500).json({ error: "Rejection failed: " + err.message });
    }
  });

  router.post("/admin/waitlist/batch-approve", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    // Session 34: each row read from the database (not only this server's cache), approved with the
    // same rules as a single approve, and emailed.
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 200) : [];
    const activeClient = privilegedSupabase || supabase;
    const results: any[] = [];
    for (const targetId of ids) {
      let entry: any = null;
      if (activeClient) {
        const { data } = await activeClient.from('waitlist').select('*').eq('id', targetId).maybeSingle();
        entry = data || null;
      }
      if (!entry) entry = (getDb().waitlist || []).find((w: any) => String(w.id) === String(targetId)) || null;
      if (!entry) { results.push({ id: targetId, ok: false, error: 'Application not found' }); continue; }
      if (entry.role === 'brand') { results.push({ id: targetId, ok: false, error: 'Brand application — approve it on its own' }); continue; }
      const r: any = await approveCreatorApplication(entry, { client: activeClient, getDb, saveDb });
      if (r.ok) r.emailed = await sendApplicationDecisionEmail(entry, 'approved');
      // v373: Resend takes about 2 emails a second — a bulk approve sent them all at once and the extra ones failed.
      if (r.emailed) await new Promise((ok) => setTimeout(ok, Number(process.env.BULK_EMAIL_GAP_MS ?? 550)));
      results.push({ id: targetId, ...r });
    }
    const approved = results.filter((r) => r.ok).length;
    return res.json({ ok: approved === results.length, approved, failed: results.length - approved, results });
  });

  // v402 (Ravi: "profile picture matter karti hai — Explore pe dikhega; notification bhej pao photo sahi karne ka"):
  // Waitlist → "Ask for photo" sends a bell + phone notice (no e-mail — PHOTO_NUDGE is in NO_EMAIL_TYPES) to the chosen
  // creators. Ids are waitlist / creator ids from the list; only ones with an account get it.
  router.post("/admin/waitlist/photo-nudge", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    const ids: string[] = Array.from(new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map((x: any) => String(x || "").trim()).filter(Boolean))).slice(0, 300) as string[];
    if (!ids.length) return res.status(400).json({ error: "Choose at least one creator." });
    const c = privilegedSupabase || supabase;
    const userIds = new Set<string>();
    try {
      if (c) {
        const { data: us } = await c.from("users").select("user_id, role").in("user_id", ids);
        for (const u of us || []) if (String(u.role || "") === "creator") userIds.add(String(u.user_id));
        const { data: wl } = await c.from("waitlist").select("id, linked_user_id").in("id", ids);
        for (const w of wl || []) if (w.linked_user_id) userIds.add(String(w.linked_user_id));
      } else {
        for (const id of ids) userIds.add(id);
      }
      let sent = 0;
      for (const uid of userIds) {
        try {
          await sendNotification(null, uid, "PHOTO_NUDGE", "Add a clear photo of you 📸 Brands pick creators they can see — tap to upload your best photo.");
          sent++;
        } catch (e: any) { console.warn("[photo-nudge]", uid, e?.message || e); }
      }
      return res.json({ ok: true, sent, skipped: ids.length - sent });
    } catch (err: any) {
      console.error("photo-nudge error:", err?.message || err);
      return res.status(500).json({ error: "Couldn't send just now. Please try again." });
    }
  });

  router.post("/admin/waitlist/:id/message", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || (user.role !== 'admin' && user.role !== 'sub_admin' && user.team_role !== 'sub_admin')) {
      return res.status(403).json({ detail: "Admin only", _status: 403 });
    }
    if (!supabase) {
      return res.status(500).json({ error: "Supabase client not initialized" });
    }
    const targetId = req.params.id;
    const messageText = req.body.message || "";

    try {
      // Session 58 (bug hunt): the id here is a WAITLIST row id. The note went to that id as if it were a user (nobody
      // got it) and to profile columns that don't exist. Now: save it on the waitlist row, and notify the linked
      // account (by linked_user_id, or by the same email) when there is one.
      const c = privilegedSupabase || supabase;
      let wl: any = null;
      try { const r = await c.from("waitlist").select("id, linked_user_id, email").eq("id", targetId).maybeSingle(); wl = r.data || null; } catch (e) { /* not a waitlist id */ }
      const { error: wlErr } = wl ? await c.from("waitlist").update({ panel_message: messageText }).eq("id", targetId) : { error: null };
      if (wlErr) return res.status(502).json({ error: "Couldn't save the message. Please try again." });

      const localDb = getDb();
      if (localDb.waitlist) {
        const wIdx = localDb.waitlist.findIndex((w: any) => String(w.id) === String(targetId));
        if (wIdx >= 0) {
          localDb.waitlist[wIdx].panel_message = messageText;
          saveDb(localDb);
        }
      }

      let recipient: string | null = wl?.linked_user_id || null;
      if (!recipient && wl?.email) {
        try { const r = await c.from("users").select("user_id").ilike("email", String(wl.email).trim().replace(/[\\%_]/g, (m: string) => "\\" + m)).limit(1); recipient = r.data?.[0]?.user_id || null; } catch (e) { /* no account */ }
      }
      if (!wl) {
        // Called with a user id (campaign review queue) → that user.
        try { const r = await c.from("users").select("user_id").eq("user_id", targetId).limit(1); recipient = r.data?.[0]?.user_id || null; } catch (e) { /* unknown id */ }
      }
      if (recipient) {
        await sendNotification(null, recipient, "admin_message", `Update from Ybex Admin: ${messageText}`);
      }

      return res.json({ ok: true, delivered: Boolean(recipient) });
    } catch (err: any) {
      console.error("Waitlist message error:", err);
      return res.status(500).json({ error: "Failed to send message: " + err.message });
    }
  });
}
