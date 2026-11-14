import { logIgnored } from "./logIgnored";
import { toggleSavedCreator, isCreatorSaved, insertCreatorReview } from "./persistedLists"; // Session 52: saved creators + reviews in their tables
import { readCreatorsLean } from "./inboxLean"; // v428: list reads without Instagram posts (egress)
import { stripPrivateProfileFields } from "./profilePrivacy";
import { emitThreadEvent, emitAdminEvent } from "./socketAccess";
import { INVITE_PENDING, INVITE_ACCEPTING, isInvitedCreator, inviteAmount, formatInviteTimeline, parseInviteBudget, MIN_INVITE_AMOUNT, toInviteRow, isStaleAccepting, campaignInviteConflict, minPayoutFor, INVITE_DECLINED, isInviteExpired, isInviteWithdrawn, inviteViewStatus, duplicateInvite, WITHDRAWN_REASON, INVITE_WITHDRAWN } from "./directInvites"; // v414: expiry, withdraw, duplicate
import express from "express";
import { audienceEstimate } from "../src/utils/audienceEstimate";
import crypto from "crypto";
import { isBrandLike } from "./roleGuards"; // v416
import { transformRateCard, Resend, buildEmailHtml, getValidFromEmail } from "./helpers";
import { maskContactDetails } from "./contactSecurityFilter"; // v389
import { publicSiteUrl } from "./siteUrl"; // v389

// Public creator-facing and creator-discovery routes: creator profile
// creation, public creator listing/search, viewing a single creator's
// public profile, reviews, saving/bookmarking creators, requesting a
// collab-cost estimate, sending a brief directly, "my own profile"
// shortcuts, agency-side creator listing, and toggling work-mode
// (available/unavailable for collabs).
//
// Three thin wrappers (handleCreatorKycSubmit, handleGetCreatorProfile,
// handleGetCreatorsMe) still have their actual logic in server.ts — only
// the route registration is here, with the real handler function passed
// in as a dependency, exactly like the earlier UGC thin-wrapper split.
// Session 58 (bug hunt): rate_card got the brand / agency markup but rate_reel / rate_story / rate_yt_video (which the
// profile screens read first) did not, so brands saw the raw rate.
const withMarkedRates = (row: any, pct: number) => {
  const picked: any = {};
  for (const k of ["rate_reel", "rate_story", "rate_yt_video"]) if (typeof row?.[k] === "number" || (row?.[k] != null && row?.[k] !== "" && !Number.isNaN(Number(row[k])))) picked[k] = Number(row[k]);
  return Object.keys(picked).length ? transformRateCard(picked, pct) : {};
};

const profileViewSeen = new Set<string>(); // Session 58: viewer|creator|day already counted (per server)

export function setupCreatorsRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    syncEntityTags,
    processBase64Image,
    getSettings,
    markupForRole,
    getActingBrandId,
    logTeamActivity,
    handleCreatorKycSubmit: externalHandleCreatorKycSubmit,
    handleGetCreatorProfile: externalHandleGetCreatorProfile,
    handleGetCreatorsMe: externalHandleGetCreatorsMe,
    sanitizeCreatorProfile: externalSanitizeCreatorProfile,
    fetchCreatorReviews: externalFetchCreatorReviews,
    broadcastAdminNotification,
    insertChatMessageToSupabase,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    syncEntityTags: (entityType: string, entityId: string, tags: any[]) => Promise<any>;
    processBase64Image: (imgUrl: string, bucket: string, user_id: string) => Promise<any>;
    getSettings: (db: any) => any;
    markupForRole: (role: string | null | undefined, settings: any) => number;
    getActingBrandId: (user: any) => any;
    logTeamActivity: (db: any, user: any, action: string, detail: string) => void;
    handleCreatorKycSubmit?: (req: express.Request, res: express.Response) => any;
    handleGetCreatorProfile?: (req: express.Request, res: express.Response) => any;
    handleGetCreatorsMe?: (req: express.Request, res: express.Response) => any;
    sanitizeCreatorProfile?: (cp: any, localProfile?: any) => any;
    fetchCreatorReviews?: (creatorId: string, limit?: any) => Promise<any>;
    broadcastAdminNotification?: (payload: any) => Promise<any>;
    insertChatMessageToSupabase?: (payload: any) => Promise<any>;
  }
) {
  const getIsoNow = () => new Date().toISOString();

  // ---- Direct invitations store (session 26) -------------------------------------------------
  // public.brief_requests is SERVER-ONLY (RLS on, no policies, anon/authenticated revoked), so
  // only the service-role client can use it. Without it (tests / local dev) the local store is
  // the only copy, as before. The local copy is also kept as a cache in production.
  const inviteClient = privilegedSupabase || null;

  const cacheInvite = (inv: any) => {
    const db = getDb();
    db.brief_requests = db.brief_requests || [];
    const i = db.brief_requests.findIndex((b: any) => b.id === inv.id);
    if (i >= 0) db.brief_requests[i] = { ...db.brief_requests[i], ...inv };
    else db.brief_requests.push(inv);
    return i >= 0 ? db.brief_requests[i] : inv;
  };

  /** The invite by id — Supabase first (shared by every server instance), then the local copy. */
  const loadInvite = async (id: string): Promise<any> => {
    if (inviteClient) {
      try {
        const { data, error } = await inviteClient.from("brief_requests").select("*").eq("id", id).maybeSingle();
        if (error) console.error("[invites] load failed:", error.message || error);
        if (data) return cacheInvite(data);
      } catch (e) { logIgnored("creators_routes:invite-load", e); }
    }
    return (getDb().brief_requests || []).find((b: any) => b.id === id) || null;
  };

  /** Write fields of an invite; with `onlyIfStatus` the write happens only while the row still has that status. */
  const writeInvite = async (id: string, fields: any, onlyIfStatus?: string): Promise<{ ok: boolean; error?: string }> => {
    if (!inviteClient) return { ok: true };
    try {
      let q: any = inviteClient.from("brief_requests").update(toInviteRow(fields)).eq("id", id);
      if (onlyIfStatus) q = q.eq("status", onlyIfStatus);
      const { data, error } = await q.select("id");
      if (error) return { ok: false, error: error.message || String(error) };
      if (onlyIfStatus && (!Array.isArray(data) || data.length === 0)) return { ok: false, error: "STATUS_CHANGED" };
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  };

  // v407 (Ravi OK, Supabase logs: ~1,100 failed calls a day): the live creator_profiles table has no "id" column (its key is
  // user_id), so the profile-id reads below always failed. After the first "column … id does not exist" this server copy
  // stops asking; a database that has the column keeps working as before.
  let profileIdColumnMissing = false;
  const noteProfileIdError = (e: any) => { if (/creator_profiles\.id|column .*\bid\b.*does not exist|42703/i.test(String(e?.message || e?.code || ""))) profileIdColumnMissing = true; };

  /** WHO for accept/decline: the invited creator by user id or email — or by their own profile id. */
  const isMyInvite = async (invite: any, user: any): Promise<boolean> => {
    if (isInvitedCreator(invite, user)) return true;
    if (String(user?.role || "").toLowerCase() !== "creator" || !invite?.creator_id) return false;
    const local = (getDb().creator_profiles || []).some((p: any) => p?.user_id === user.user_id && String(p?.id) === String(invite.creator_id));
    if (local) return true;
    const c = privilegedSupabase || supabase;
    if (!c || profileIdColumnMissing) return false;
    try {
      const { data, error } = await c.from("creator_profiles").select("id").eq("user_id", user.user_id).limit(5);
      if (error) { noteProfileIdError(error); return false; }
      return (data || []).some((p: any) => String(p?.id) === String(invite.creator_id));
    } catch { return false; }
  };

  const internalFetchCreatorReviews = async (creatorId: string, limit?: any) => {
    const db = getDb();
    const reviews = (db.creator_reviews || [])
      .filter((r: any) => r.creator_id === creatorId || r.creator_user_id === creatorId)
      .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    return limit ? reviews.slice(0, limit) : reviews;
  };

  const internalSanitizeCreatorProfile = (cp: any, localProfile?: any) => {
    if (!cp) return cp;
    let cover_image = cp.cover_image || cp.rate_card?.cover_image || localProfile?.cover_image || "";
    let category = cp.category;
    if (category === "Go to Settings & select category first") {
      category = "";
    }
    let primary_niche = cp.primary_niche;
    if (primary_niche === "Go to Settings & select category first") {
      primary_niche = "";
    }
    let niche = cp.niche;
    if (niche === "Go to Settings & select category first") {
      niche = "";
    }
    if (Array.isArray(niche)) {
      niche = niche.filter((n: any) => n !== "Go to Settings & select category first");
    }
    const dob = cp.dob || cp.date_of_birth || cp.rate_card?.dob || cp.rate_card?.date_of_birth || localProfile?.dob || localProfile?.date_of_birth || "";
    const experience = cp.experience || cp.experience_years || cp.rate_card?.experience || localProfile?.experience || "2+ Years";
    const rate_reel = cp.rate_reel || cp.reel_rate || cp.rate_card?.reels || cp.rate_card?.reel || localProfile?.rate_reel || 0;
    const rate_story = cp.rate_story || cp.story_rate || cp.rate_card?.stories || cp.rate_card?.story || localProfile?.rate_story || 0;
    const rate_yt_video = cp.rate_yt_video || cp.youtube_video_rate || cp.rate_card?.yt_video || localProfile?.rate_yt_video || 0;

    return {
      ...cp,
      category,
      primary_niche,
      niche,
      cover_image,
      dob,
      date_of_birth: dob,
      experience,
      rate_reel,
      rate_story,
      rate_yt_video
    };
  };

  const sanitizeCreator = externalSanitizeCreatorProfile || internalSanitizeCreatorProfile;
  const getCreatorReviews = externalFetchCreatorReviews || internalFetchCreatorReviews;

  const internalHandleCreatorKycSubmit = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const db = getDb();
    const actingId = user.user_id;
    const body = req.body || {};

    const fullName = body.fullName || body.creator_name || body.legalName || user.name || "Creator";
    const panNumber = (body.panNumber || body.creator_pan || body.identity_num || "").trim().toUpperCase();
    // Session 34 (Ravi): Aadhaar is no longer collected — KYC is PAN + bank/UPI. Anything sent is ignored.
    const aadhaarNumber = "";
    const panCardUrl = body.panCardUrl || body.panPhotoUrl || body.uploaded_files?.[0] || "";
    const aadhaarFrontUrl = "";
    const aadhaarBackUrl = "";
    // Session 58 (bug hunt): the desktop KYC page sends `upiQrCodeUrl` / `ifsc` — both were dropped.
    const upiQrUrl = body.upiQrUrl || body.upiQrCodeUrl || body.upi_qr_code_url || body.uploaded_files?.[3] || "";
    const gstin = (body.gstin || "").trim().toUpperCase();
    const address = body.address || body.creator_state || "";
    const payoutMethod = body.payoutMethod || body.payout_method || (body.bankAccount ? "bank" : "upi");
    const bankAccount = body.bankAccount || body.bank_account || body.accountNumber || "";
    const bankIfsc = (body.bankIfsc || body.bank_ifsc || body.ifscCode || body.ifsc || "").trim().toUpperCase();
    const bankName = body.bankName || body.bank_name || "";
    const bankHolderName = body.bankHolderName || body.bank_holder_name || body.holderName || fullName;
    const upiId = body.upiId || body.upi_id || "";

    const documents = {
      creator_name: fullName,
      creator_pan: panNumber,
      identity_num: panNumber,
      pan_photo_url: panCardUrl,
      aadhaar_number: aadhaarNumber,
      aadhaar_front_url: aadhaarFrontUrl,
      aadhaar_back_url: aadhaarBackUrl,
      gstin: gstin || null,
      address,
      payout_method: payoutMethod,
      bank_name: bankName,
      bank_account: bankAccount,
      bank_ifsc: bankIfsc,
      bank_holder_name: bankHolderName,
      upi_id: upiId,
      upi_qr_code_url: upiQrUrl,
      uploaded_files: [panCardUrl, aadhaarFrontUrl, aadhaarBackUrl, upiQrUrl].filter(Boolean),
      submitted_at: getIsoNow()
    };

    if (!db.verifications) db.verifications = [];
    const existingIndex = db.verifications.findIndex((v: any) => v.user_id === actingId && v.kind === "creator");

    const verificationDoc = {
      verification_id: existingIndex >= 0 ? db.verifications[existingIndex].verification_id : `ver_${Math.random().toString(36).substring(2, 10)}`,
      user_id: actingId,
      name: fullName,
      email: user.email,
      photo: user.picture || "",
      kind: "creator",
      type: "Creator",
      category: "Creator",
      handle: user.name || "",
      followers: 0,
      documents,
      note: body.note || "",
      status: "pending",
      created_at: existingIndex >= 0 ? db.verifications[existingIndex].created_at : getIsoNow(),
      updated_at: getIsoNow()
    };

    if (existingIndex >= 0) {
      db.verifications[existingIndex] = verificationDoc;
    } else {
      db.verifications.push(verificationDoc);
    }

    if (!db.creator_profiles) db.creator_profiles = [];
    let cp = db.creator_profiles.find((p: any) => p.user_id === actingId);
    if (cp) {
      cp.verified = false;
      cp.verification_status = "PENDING";
    }

    const u = db.users?.find((u: any) => u.user_id === user.user_id);
    if (u) {
      u.kyc_status = "pending";
      // Session 58 (bug hunt): users.verified means EMAIL verified — setting it false here locked people out of password login.
    }

    if (supabase) {
      try {
        await (privilegedSupabase || supabase).from('verifications').upsert({
          verification_id: verificationDoc.verification_id,
          user_id: verificationDoc.user_id,
          name: verificationDoc.name,
          email: verificationDoc.email,
          photo: verificationDoc.photo,
          kind: 'creator',
          documents: verificationDoc.documents,
          status: 'pending',
          created_at: verificationDoc.created_at
        }, { onConflict: 'verification_id' });

        // Session 58 (bug hunt): a failed save used to still answer "submitted"; a missing PAN photo was replaced by a
        // stock picture (admins saw a random image as the PAN card); the UPI QR was never stored here.
        const { error: kycSaveErr } = await (privilegedSupabase || supabase).from('creator_kyc').upsert({
          creator_id: actingId,
          full_name: fullName,
          pan_number: panNumber || "",
          pan_card_url: panCardUrl || "",
          upi_qr_code_url: upiQrUrl || null,
          aadhaar_front_url: aadhaarFrontUrl || "",
          aadhaar_back_url: aadhaarBackUrl || "",
          gstin: gstin || null,
          address: address || "",
          bank_account_no: bankAccount || "",
          bank_ifsc: bankIfsc || "",
          bank_holder_name: bankHolderName || fullName,
          upi_id: upiId || null,
          status: 'PENDING'
        }, { onConflict: 'creator_id' });
        if (kycSaveErr) throw kycSaveErr;

        // Mirror the payout details onto creator_profiles as well.
        //
        // KYC wrote them only to creator_kyc and verifications, while the admin payout modal
        // read creator_profiles — so a creator who entered their UPI during KYC showed up as
        // "Not set" at payout time. The read side now checks both, and this keeps the two in
        // step going forward. Non-fatal: a missing column must not fail a KYC submission.
        try {
          const payoutMirror: any = {};
          if (upiId) payoutMirror.upi_id = upiId;
          if (bankAccount) payoutMirror.bank_account_number = bankAccount;
          if (bankIfsc) payoutMirror.bank_ifsc = bankIfsc;
          if (bankHolderName || fullName) payoutMirror.beneficiary_name = bankHolderName || fullName;
          if (Object.keys(payoutMirror).length > 0) {
            const { error: mirrorErr } = await (privilegedSupabase || supabase)
              .from('creator_profiles')
              .update(payoutMirror)
              .eq('user_id', actingId);
            if (mirrorErr) {
              console.warn("[creator kyc] payout mirror to creator_profiles skipped:", mirrorErr.message || mirrorErr);
            }
          }
        } catch (e: any) {
          console.warn("[creator kyc] payout mirror skipped:", e?.message || e);
        }

        // Session 58 (bug hunt): users.verified means EMAIL verified — setting it false here locked people out of password login.
      } catch (err: any) {
        console.error("Error inserting Supabase creator KYC:", err);
        return res.status(500).json({ detail: "We couldn't save your KYC right now. Please try again in a minute.", code: "KYC_SAVE_FAILED" });
      }
    }

    if (broadcastAdminNotification) {
      broadcastAdminNotification({
        type: 'kyc_submitted',
        message: `Creator KYC submitted: ${fullName} (${user.email})`,
        title: 'Pending Creator Verification',
        actor_id: actingId,
        metadata: { userId: actingId, name: fullName, email: user.email, kind: 'creator' }
      }).catch(e => console.warn("Failed to broadcast creator KYC notification:", e));
    }

    saveDb(db);
    return res.json({ ok: true, status: "PENDING", verification: verificationDoc });
  };

  const internalHandleGetCreatorProfile = async (req: any, res: any) => {
    try {
      let targetUserId = req.params.user_id || req.params.id;
      if (!targetUserId || targetUserId === "me") {
        const user = await parseAuthUser(req);
        if (!user) return res.status(401).json({ detail: "Not authenticated" });
        targetUserId = user.user_id;
      }

      let c: any = null;

      // 1. Try finding in Supabase creator_profiles
      if (supabase) {
        try {
          const { data: byUserId } = await (privilegedSupabase || supabase)
            .from('creator_profiles')
            .select('*')
            .eq('user_id', targetUserId)
            .maybeSingle();
          if (byUserId) c = byUserId;

          // Session 58: only a real handle reaches the filter — "zz,email.eq.x@y.com" was spliced into it (email check).
          if (!c && /^@?[a-z0-9._]{1,30}$/i.test(String(targetUserId))) {
            const { data: byHandle } = await (privilegedSupabase || supabase)
              .from('creator_profiles')
              .select('*')
              // Session 58 (security): no lookup by email here — anyone could test which emails have an account.
              .or(`instagram_handle.ilike.${String(targetUserId).replace(/^@/, "")},instagram.ilike.${String(targetUserId).replace(/^@/, "")}`)
              .maybeSingle();
            if (byHandle) c = byHandle;
          }
        } catch (sbErr) {
          console.warn("[handleGetCreatorProfile] Supabase lookup error:", sbErr);
        }
      }

      // 2. Try finding in local db.creator_profiles
      if (!c) {
        const db = getDb();
        c = (db.creator_profiles || []).find((cp: any) => 
          cp.user_id === targetUserId || 
          cp.id === targetUserId ||
          (cp.instagram_handle && cp.instagram_handle.toLowerCase() === targetUserId.toLowerCase()) ||
          (cp.instagram && cp.instagram.toLowerCase() === targetUserId.toLowerCase())
        );
      }

      // 3. If not found in creator_profiles, check if user exists in users table.
      // Session 58 (bug hunt): only for the creator THEMSELF — a stranger's lookup used to write a made-up creator
      // profile for any user id or email (even a brand) and show it publicly.
      const lookupViewer = !c ? await parseAuthUser(req).catch(() => null) : null;
      if (!c && lookupViewer && String(lookupViewer.user_id) === String(targetUserId) && String(lookupViewer.role || "").toLowerCase() === "creator") {
        let foundUser: any = null;
        if (supabase) {
          try {
            const { data: uData } = await (privilegedSupabase || supabase)
              .from('users')
              .select('*')
              .eq('user_id', targetUserId)
              .maybeSingle();
            if (uData) foundUser = uData;
          } catch (e) { logIgnored("creators_routes:329", e); }
        }
        if (!foundUser) {
          const db = getDb();
          foundUser = (db.users || []).find((u: any) => u.user_id === targetUserId);
        }

        // If found in users: create default profile so new creators can view their profile immediately
        if (foundUser) {
          c = {
            user_id: foundUser.user_id,
            name: foundUser.name || "Creator",
            email: foundUser.email,
            picture: foundUser.picture || "",
            photo: foundUser.picture || "",
            bio: "",
            category: "", // Session 58: no invented defaults (category / gender / languages / score)
            sub_categories: [],
            city: "",
            state: "",
            languages: [],
            gender: "",
            followers_instagram: 0,
            followers_youtube: 0,
            rate_card: { reels: 0, stories: 0, youtube_integration: 0, cover_image: "" },
            barter: "cash_only",
            payment_terms: "within_30_days",
            creator_type: "influencer",
            work_mode: "active",
            engagement_rate: 0,
            fake_follower_pct: 0,
            avg_views_30d: 0,
            performance_score: null,
            profile_views: 0,
            onboarding_complete: false,
            created_at: getIsoNow(),
            updated_at: getIsoNow()
          };

          try {
            if (supabase) {
              await (privilegedSupabase || supabase).from('creator_profiles').upsert(c, { onConflict: 'user_id' });
            }
            const db = getDb();
            if (!db.creator_profiles) db.creator_profiles = [];
            const existingIdx = db.creator_profiles.findIndex((cp: any) => cp.user_id === c.user_id);
            if (existingIdx >= 0) db.creator_profiles[existingIdx] = c;
            else db.creator_profiles.push(c);
            saveDb(db);
          } catch (errInit) {
            console.error("Failed to auto-init creator profile:", errInit);
          }
        }
      }

      // 4. Demo fallback if demo requested
      if (!c && (targetUserId === "demo" || targetUserId === "demo_creator")) {
        const db = getDb();
        c = (db.creator_profiles || [])[0] || null;
      }

      if (!c) {
        return res.status(404).json({ detail: "Creator not found" });
      }
      // Session 58 (bug hunt): deleted creators' profiles still opened.
      if (c.is_deleted === true) return res.status(404).json({ detail: "Creator not found" });

      // Session 58 (bug hunt): the creator's own visits (dashboard / "creators/me" refreshes) counted as profile views —
      // the number was mostly the creator themself. Only OTHER people's visits count now.
      const viewer = await parseAuthUser(req);
      const isOwnView = Boolean(viewer && String(viewer.user_id) === String(c.user_id || targetUserId));
      // Session 58: one view per signed-in visitor per day (every reload / re-render / bot added one).
      const viewKey = viewer ? `${viewer.user_id}|${c.user_id || targetUserId}|${new Date().toISOString().slice(0, 10)}` : "";
      const countThis = Boolean(viewer) && !isOwnView && !profileViewSeen.has(viewKey);
      if (countThis) { profileViewSeen.add(viewKey); if (profileViewSeen.size > 20000) profileViewSeen.clear(); }
      const newViews = (c.profile_views || 0) + (countThis ? 1 : 0);
      if (supabase && countThis) {
        try {
          await (privilegedSupabase || supabase)
            .from('creator_profiles')
            .update({ profile_views: newViews })
            .eq('user_id', c.user_id);
        } catch (e) { logIgnored("creators_routes:405", e); }
      }
      c.profile_views = newViews;

      const db = getDb();
      const settings = getSettings(db);

      const creatorUserId = c.user_id || targetUserId;
      let creatorDeals: any[] = [];
      if (supabase) {
        try {
          const { data: dealsData } = await (privilegedSupabase || supabase)
            .from('deals')
            .select('status, performance_score, performance_tier') // Session 58: each deal's own score, not the profile's self-estimate
            .eq('creator_id', creatorUserId);
          if (dealsData) {
            creatorDeals = dealsData.filter((d: any) => d.status === 'COMPLETED');
          }
        } catch (e) { logIgnored("creators_routes:424", e); }
      } else {
        creatorDeals = (db.collabs || []).filter((deal: any) => 
          (deal.to_user_id === creatorUserId || deal.creator_id === creatorUserId) && 
          deal.status === 'COMPLETED'
        );
      }

      let aggregate_score = null;
      let aggregate_tier = null;
      
      if (creatorDeals.length > 0) {
        const scoredDeals = creatorDeals.filter((d: any) => Number(d.performance_score) > 0);
        if (scoredDeals.length > 0) {
          const sum = scoredDeals.reduce((acc: number, d: any) => acc + Number(d.performance_score), 0);
          aggregate_score = Math.round(sum / scoredDeals.length);
          
          if (aggregate_score >= 90) aggregate_tier = "PLATINUM";
          else if (aggregate_score >= 75) aggregate_tier = "GOLD";
          else if (aggregate_score >= 60) aggregate_tier = "SILVER";
          else aggregate_tier = "BRONZE";
        }
      }

      const localProfile = db.creator_profiles?.find((p: any) => p.user_id === creatorUserId);
      const reviews = await getCreatorReviews(creatorUserId, c?.user_id || c?.id);

      let isSaved = false;
      if (viewer && isBrandLike(viewer.role)) { // v416 (CR4)
        const brand_id = getActingBrandId(viewer);
        isSaved = (db.saved_creators || []).some((s: any) => 
          s.brand_id === brand_id && (s.creator_id === creatorUserId || s.creator_id === c.user_id)
        );
        const savedInTable = await isCreatorSaved(privilegedSupabase, brand_id, [creatorUserId, c?.user_id]);
        if (savedInTable !== null) isSaved = savedInTable;
      }

      const mapped = sanitizeCreator({ 
        ...c,
        isSaved,
        aggregate_score,
        aggregate_tier,
        reviews
      }, localProfile);

      if (!viewer || (viewer.user_id !== creatorUserId && viewer.role !== "admin")) {
        const pct = markupForRole(viewer?.role, settings);
        if (pct) {
          mapped.rate_card = transformRateCard(c.rate_card, pct);
          // Session 58 (bug hunt): the screens read the top-level rates first, which skipped the markup entirely.
          Object.assign(mapped, withMarkedRates(mapped, pct));
        }
      }

      // Session 22: this public route returned the whole creator_profiles row to anyone, logged
      // in or not. Contact, bank, UPI and ID fields now go only to the creator and staff.
      const ownerOrStaff = viewer && (viewer.user_id === creatorUserId || ["admin", "sub_admin"].includes(String(viewer.role)) || viewer.team_role === "sub_admin");
      res.json(ownerOrStaff ? mapped : stripPrivateProfileFields(mapped));
    } catch(err) {
      console.error(err);
      res.status(500).json({ detail: "Server error" });
    }
  };

  const internalHandleGetCreatorsMe = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const db = getDb();
    const cp = db.creator_profiles?.find((c: any) => c.user_id === user.user_id);
    res.json(cp || { user_id: user.user_id, name: user.name, email: user.email });
  };

  const handleCreatorKycSubmit = externalHandleCreatorKycSubmit || internalHandleCreatorKycSubmit;
  const handleGetCreatorProfile = externalHandleGetCreatorProfile || internalHandleGetCreatorProfile;
  const handleGetCreatorsMe = externalHandleGetCreatorsMe || internalHandleGetCreatorsMe;

  router.post("/creator/kyc/submit", handleCreatorKycSubmit);
  router.post("/verifications/creator", handleCreatorKycSubmit);

  // Shared by POST /creators/profile (desktop, onboarding) and PATCH /creators/me (mobile profile).
  // Mobile called PATCH /creators/me, which did not exist, so every mobile profile save 404d.
  // The handler merges with the existing profile, so a partial payload is safe.
  const saveCreatorProfile = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const body = req.body;

    if (body.email && body.email !== user.email) {
      if (supabase) {
        const { data: existingUser } = await (privilegedSupabase || supabase)
          .from('users')
          .select('user_id')
          .eq('email', body.email)
          .maybeSingle();
        if (existingUser && existingUser.user_id !== user.user_id) {
          return res.status(400).json({ detail: "Email address is already in use by another account." });
        }
      } else {
         const db = getDb();
         const existingUser = db.users.find((u) => u.email && u.email.toLowerCase() === body.email.toLowerCase() && u.user_id !== user.user_id);
         if (existingUser) {
           return res.status(400).json({ detail: "Email address is already in use by another account." });
         }
      }
    }

    // Fetch existing profile to prevent overwriting with blank values if partial save occurs
    let existingProfile: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase)
          .from('creator_profiles')
          .select('*')
          .eq('user_id', user.user_id)
          .maybeSingle();
        if (data) existingProfile = data;
      } catch (e) {
        console.warn("Could not load existing creator profile for merge:", e);
      }
    } else {
      const db = getDb();
      const localProfile = db.creator_profiles?.find(c => c.user_id === user.user_id);
      if (localProfile) existingProfile = localProfile;
    }

    const followers = Number(
      body.ig_followers !== undefined ? body.ig_followers :
      (body.instagram_followers !== undefined ? body.instagram_followers : 
      (body.followers_instagram !== undefined ? body.followers_instagram : 
      (body.follower_count !== undefined ? body.follower_count : 
      (existingProfile?.ig_followers || existingProfile?.instagram_followers || existingProfile?.followers_instagram || existingProfile?.follower_count || 0))))
    );
    const subs = Number(body.youtube_subscribers !== undefined ? body.youtube_subscribers : (body.followers_youtube !== undefined ? body.followers_youtube : (body.yt_subscribers !== undefined ? body.yt_subscribers : (existingProfile?.followers_youtube || 0))));
    const totalFollowers = followers + subs;

    const igReach = Number(
      body.avg_views_30d !== undefined ? body.avg_views_30d :
      (body.instagram_avg_reach !== undefined ? body.instagram_avg_reach : 
      (body.average_reach !== undefined ? body.average_reach : 
      (body.reach !== undefined ? body.reach : 
      (existingProfile?.instagram_avg_reach || existingProfile?.average_reach || existingProfile?.avg_views_30d || 0)))) // session 40: real reach before the old estimated views
    );

    const igLikes = Number(
      body.avg_likes_30d !== undefined ? body.avg_likes_30d :
      (body.instagram_avg_likes !== undefined ? body.instagram_avg_likes :
      (existingProfile?.avg_likes_30d || 0))
    );

    const igComments = Number(
      body.avg_comments_30d !== undefined ? body.avg_comments_30d :
      (body.instagram_avg_comments !== undefined ? body.instagram_avg_comments :
      (existingProfile?.avg_comments_30d || 0))
    );

    const ytViews = Number(body.youtube_avg_views !== undefined ? body.youtube_avg_views : (body.yt_avg_views !== undefined ? body.yt_avg_views : (existingProfile?.youtube_avg_views || 0)));
    const totalReach = igReach + ytViews;

    // Server-side Engagement Rate calculation: ((avg_likes_30d + avg_comments_30d) / ig_followers) * 100
    let er: number | null = null;
    if (followers > 0) {
      if (igLikes > 0 || igComments > 0) {
        er = parseFloat((((igLikes + igComments) / followers) * 100).toFixed(2));
      } else if (igReach > 0) {
        er = parseFloat(((igReach / followers) * 100).toFixed(2));
      } else {
        er = 0;
      }
      if (er > 100) er = 100;
    } else if (subs > 0 && ytViews > 0) {
      er = parseFloat(((ytViews / subs) * 100).toFixed(2));
      if (er > 100) er = 100;
    } else if (existingProfile?.engagement_rate !== undefined && existingProfile?.engagement_rate !== null) {
      er = Number(existingProfile.engagement_rate);
    } else {
      er = 0;
    }

    // Session 40 (Ravi, option B): the old "fake %" came from followers mod 120 and the score from
    // that. Now both are an ESTIMATE from the creator's own likes / comments / reach vs typical
    // levels for the account size (src/utils/audienceEstimate.ts). Not enough data → null, and
    // screens show "Not enough data" instead of a number.
    const est = audienceEstimate({ followers, avgLikes: igLikes, avgComments: igComments, avgReach: igReach });
    const fake: number | null = est.authenticPct === null ? null : 100 - est.authenticPct;
    const perf: number | null = est.performanceScore;

    // Avg views (30d) = the reach the creator gave us. No more "followers x 0.12" when it is missing.
    // Session 58: Instagram reach only — YouTube views have their own column now (they used to be folded in here and
    // came back as Instagram reach after a reload, while YouTube showed 0).
    const avg_views = igReach > 0 ? igReach : 0;

    const stats_last_updated_at = body.stats_last_updated_at || getIsoNow();

    const rate_reel_val = Number(body.reel_rate !== undefined ? body.reel_rate : (body.rate_reel !== undefined ? body.rate_reel : (existingProfile?.rate_reel || (existingProfile?.rate_card && (existingProfile.rate_card.reels || existingProfile.rate_card.reel)) || 0)));
    const rate_story_val = Number(body.story_rate !== undefined ? body.story_rate : (body.rate_story !== undefined ? body.rate_story : (existingProfile?.rate_story || (existingProfile?.rate_card && (existingProfile.rate_card.stories || existingProfile.rate_card.story)) || 0)));
    const rate_yt_video_val = Number(body.youtube_video_rate !== undefined ? body.youtube_video_rate : (body.rate_yt_video !== undefined ? body.rate_yt_video : (existingProfile?.rate_yt_video || (existingProfile?.rate_card && existingProfile.rate_card.yt_video) || 0)));

    let rateCardData: any = {};
    if (existingProfile?.rate_card && typeof existingProfile.rate_card === 'object') {
      rateCardData = { ...existingProfile.rate_card };
    } else {
      rateCardData = { reels: rate_reel_val, stories: rate_story_val, yt_video: rate_yt_video_val, reel: rate_reel_val, story: rate_story_val };
    }
    if (body.rate_card && typeof body.rate_card === 'object') {
      // Deep merge nested other_platforms and extras if they exist
      const existingOtherPlats = rateCardData.other_platforms || {};
      const newOtherPlats = body.rate_card.other_platforms || {};
      const existingExtras = rateCardData.extras || {};
      const newExtras = body.rate_card.extras || {};

      rateCardData = { 
        ...rateCardData, 
        ...body.rate_card,
        other_platforms: { ...existingOtherPlats, ...newOtherPlats },
        extras: { ...existingExtras, ...newExtras }
      };
    }

    // Also handle top-level other_platforms from onboarding
    if (body.other_platforms && typeof body.other_platforms === 'object') {
      const existingOtherPlats = rateCardData.other_platforms || {};
      rateCardData.other_platforms = { ...existingOtherPlats, ...body.other_platforms };
    }

    // Ensure all variants of keys are populated/synchronized for safety
    const dobVal = body.dob || body.date_of_birth || (body.dobYear && body.dobMonth && body.dobDay ? `${body.dobYear}-${String(body.dobMonth).padStart(2, '0')}-${String(body.dobDay).padStart(2, '0')}` : undefined) || existingProfile?.dob || existingProfile?.date_of_birth || existingProfile?.rate_card?.dob || existingProfile?.rate_card?.date_of_birth || "";
    const experienceVal = body.experience || body.experience_years || body.ugc_experience || existingProfile?.experience || existingProfile?.rate_card?.experience || "2+ Years";

    rateCardData.reels = Number(rateCardData.reels !== undefined ? rateCardData.reels : (rateCardData.reel !== undefined ? rateCardData.reel : rate_reel_val));
    rateCardData.stories = Number(rateCardData.stories !== undefined ? rateCardData.stories : (rateCardData.story !== undefined ? rateCardData.story : rate_story_val));
    rateCardData.yt_video = Number(rateCardData.yt_video !== undefined ? rateCardData.yt_video : rate_yt_video_val);
    rateCardData.reel = rateCardData.reels;
    rateCardData.story = rateCardData.stories;
    rateCardData.dob = dobVal;
    rateCardData.date_of_birth = dobVal;
    rateCardData.experience = experienceVal;
    rateCardData.cover_image = body.cover_image || existingProfile?.cover_image || rateCardData.cover_image || "";

    let rawPicture = body.photo || body.profile_photo_url || existingProfile?.photo || existingProfile?.picture || user.picture || "";
    let rawCover = body.cover_image || existingProfile?.cover_image || "";
    rawPicture = await processBase64Image(rawPicture, "profile-assets", user.user_id);
    rawCover = await processBase64Image(rawCover, "cover-images", user.user_id);

    const ensureString = (val: any): string => {
      if (Array.isArray(val)) return val.join(", ");
      return typeof val === 'string' ? val : "";
    };

    let finalCategory = ensureString(body.category !== undefined ? body.category : (body.primary_niche !== undefined ? body.primary_niche : (existingProfile?.category || existingProfile?.primary_niche || "")));
    if (finalCategory === "Go to Settings & select category first") {
      finalCategory = "";
    }

    const instagram_val = body.instagram !== undefined ? body.instagram : (body.instagram_handle !== undefined ? body.instagram_handle : (existingProfile?.instagram || existingProfile?.instagram_handle || ""));
    const youtube_val = body.youtube !== undefined ? body.youtube : (body.youtube_channel_url !== undefined ? body.youtube_channel_url : (existingProfile?.youtube || existingProfile?.youtube_channel_url || ""));
    const barter_val = body.barter !== undefined ? body.barter : (body.barter_mode !== undefined ? body.barter_mode : (existingProfile?.barter || existingProfile?.barter_mode || "cash_only"));
    const payment_terms_val = body.payment_terms !== undefined ? body.payment_terms : (existingProfile?.payment_terms || "within_30_days");

    const profileData = {
      user_id: user.user_id,
      name: body.name || body.full_name || existingProfile?.name || user.name,
      email: body.email || existingProfile?.email || user.email,
      picture: rawPicture,
      photo: rawPicture,
      bio: body.bio !== undefined ? body.bio : (existingProfile?.bio || ""),
      category: finalCategory,
      sub_categories: body.sub_categories !== undefined ? body.sub_categories : (existingProfile?.sub_categories || []),
      city: body.city !== undefined ? body.city : (existingProfile?.city || ""),
      state: body.state !== undefined ? body.state : (existingProfile?.state || ""),
      languages: body.languages !== undefined ? body.languages : (existingProfile?.languages || []),
      gender: body.gender !== undefined ? body.gender : (existingProfile?.gender || ""),
      instagram: instagram_val,
      youtube: youtube_val,
      twitter: body.twitter !== undefined ? body.twitter : (body.other_platforms?.twitter || body.other_platforms?.x || rateCardData.other_platforms?.twitter || rateCardData.other_platforms?.x || existingProfile?.twitter || ""),
      linkedin: body.linkedin !== undefined ? body.linkedin : (body.other_platforms?.linkedin || rateCardData.other_platforms?.linkedin || existingProfile?.linkedin || ""),
      followers_instagram: followers,
      followers_youtube: subs,
      rate_card: rateCardData,
      cover_image: rawCover,
      barter: barter_val,
      payment_terms: payment_terms_val,
      portfolio: body.portfolio !== undefined ? body.portfolio : (existingProfile?.portfolio || []),
      past_brands: body.past_brands !== undefined ? body.past_brands : (existingProfile?.past_brands || []),
      creator_type: body.creator_type !== undefined ? body.creator_type : (existingProfile?.creator_type || "influencer"),
      work_mode: body.work_mode !== undefined ? body.work_mode : (existingProfile?.work_mode || "active"),
      onboarding_complete: body.onboarding_complete !== undefined ? body.onboarding_complete : (existingProfile?.onboarding_complete !== undefined ? existingProfile.onboarding_complete : true),
      profile_status: body.profile_status || existingProfile?.profile_status || "under_review",
      engagement_rate: er,
      fake_follower_pct: fake,
      avg_views_30d: avg_views,
      avg_likes_30d: igLikes,
      avg_comments_30d: igComments,
      performance_score: perf,
      profile_views: existingProfile?.profile_views || 0,
      instagram_handle: instagram_val,
      follower_count: followers,
      ig_followers: followers,
      instagram_followers: followers,
      average_reach: igReach,
      instagram_avg_reach: igReach,
      stats_last_updated_at: stats_last_updated_at,
      primary_niche: finalCategory,
      barter_mode: barter_val,
      rate_reel: rate_reel_val,
      rate_story: rate_story_val,
      rate_yt_video: rate_yt_video_val,
      dob: dobVal,
      date_of_birth: dobVal,
      experience: experienceVal,
      experience_years: experienceVal,
      updated_at: getIsoNow(),
    };

    try {
       // Update or Insert into creator_profiles
       let profileError = null;
       if (supabase) {
         try {
           const supabaseCreatorData: any = {
             user_id: profileData.user_id,
             name: profileData.name,
             email: profileData.email,
             picture: profileData.picture,
             photo: profileData.photo,
             bio: profileData.bio,
             category: profileData.category,
             sub_categories: profileData.sub_categories,
             city: profileData.city,
             state: profileData.state,
             languages: profileData.languages,
             gender: profileData.gender,
             instagram: profileData.instagram,
             youtube: profileData.youtube,
             twitter: profileData.twitter,
             linkedin: profileData.linkedin,
             followers_instagram: profileData.followers_instagram,
             followers_youtube: profileData.followers_youtube,
             rate_card: profileData.rate_card,
             barter: profileData.barter,
             payment_terms: profileData.payment_terms,
             portfolio: profileData.portfolio,
             past_brands: profileData.past_brands,
             creator_type: profileData.creator_type,
             work_mode: profileData.work_mode,
             engagement_rate: profileData.engagement_rate,
             fake_follower_pct: profileData.fake_follower_pct,
             avg_views_30d: profileData.avg_views_30d,
             youtube_avg_views: Number.isFinite(ytViews) && ytViews > 0 ? Math.round(ytViews) : null,
             avg_likes_30d: profileData.avg_likes_30d,
             avg_comments_30d: profileData.avg_comments_30d,
             performance_score: profileData.performance_score,
             profile_views: profileData.profile_views,
             instagram_handle: instagram_val,
             follower_count: followers,
             ig_followers: followers,
             primary_niche: finalCategory,
             barter_mode: barter_val,
             rate_reel: rate_reel_val,
             rate_story: rate_story_val,
             rate_yt_video: rate_yt_video_val,
             updated_at: profileData.updated_at
           };

           const { data: existing } = await (privilegedSupabase || supabase).from('creator_profiles').select('user_id').eq('user_id', user.user_id).maybeSingle();
           if (existing) {
             const { error } = await (privilegedSupabase || supabase).from('creator_profiles').update(supabaseCreatorData).eq('user_id', user.user_id);
             profileError = error;
           } else {
             const { error } = await (privilegedSupabase || supabase).from('creator_profiles').insert(supabaseCreatorData);
             profileError = error;
           }
         } catch (catchErr: any) {
           console.error("Supabase creator_profiles save exception:", catchErr);
           profileError = catchErr;
         }
       }
       if (profileError) {
         console.error("Error upserting creator profile in Supabase:", profileError.message || profileError);
         return res.status(500).json({ error: "Supabase creator profile save failed: " + (profileError.message || String(profileError)) });
       }

       // DOB and experience are carried inside rate_card (a JSON column that always exists),
       // but every reader would rather have real columns. Written separately and
       // deliberately NOT fatal: if creator_profiles has no dob/experience column yet this
       // fails with PGRST204 and the rate_card copy still carries the value, instead of
       // taking the whole onboarding save down with it.
       if (supabase && (dobVal || experienceVal)) {
         try {
           const extraCols: any = {};
           if (dobVal) {
             extraCols.dob = dobVal;
             extraCols.date_of_birth = dobVal;
           }
           if (experienceVal) {
             extraCols.experience = experienceVal;
             extraCols.experience_years = experienceVal;
           }
           const { error: extraErr } = await (privilegedSupabase || supabase)
             .from('creator_profiles')
             .update(extraCols)
             .eq('user_id', user.user_id);
           if (extraErr) {
             console.warn(
               "[creators/profile] dob/experience columns not written (rate_card copy still holds them):",
               extraErr.message || extraErr
             );
           }
         } catch (e: any) {
           console.warn("[creators/profile] dob/experience column write skipped:", e?.message || e);
         }
       }

       // Update users table
       const isComplete = Boolean(body.onboarding_complete || body.onboarding_completed || user.onboarded);
       if (supabase) {
         const extractedPhone = body.phone !== undefined ? body.phone : body.contact_info?.phone;
         // Session 53 (security): the LOGIN email is never changed from the profile form. The mobile
         // "Business Inquiries Email" box was silently replacing the creator's login email (no code
         // check) — the creator was then locked out. The login email changes only through the
         // OTP-checked /account/email flow; the business email stays on creator_profiles.email.
         const userUpdatePayload: any = { 
             picture: profileData.picture,
             name: profileData.name,
         };
         if (isComplete) {
           userUpdatePayload.onboarded = true;
         }
         // Session 58: only fills an EMPTY login phone (onboarding). The settings form re-sends an old copy of the
         // phone on every save, which used to undo an Account → phone change. Changes go through /account/phone.
         if (extractedPhone && !String(user.phone || "").trim()) {
             userUpdatePayload.phone = extractedPhone;
         }
         // DOB belongs on the user record too. Admin KYC, admin user details and the
         // waitlist panel all read users.dob as one of their sources; without this the
         // date collected at onboarding only ever lived inside creator_profiles.rate_card.
         if (dobVal) {
             userUpdatePayload.dob = dobVal;
             userUpdatePayload.date_of_birth = dobVal;
         }

         const { error: userError } = await (privilegedSupabase || supabase)
           .from('users')
           .update(userUpdatePayload)
           .eq('user_id', user.user_id);
         if (userError) {
           console.error("Error updating user onboard status:", JSON.stringify(userError));
         }
       }
       
       // Fallback for local dev
       const db = getDb();
       if (!db.creator_profiles) db.creator_profiles = [];
       const idx = db.creator_profiles.findIndex(c => c.user_id === user.user_id);
       if (idx > -1) {
         db.creator_profiles[idx] = { ...db.creator_profiles[idx], ...profileData };
       } else {
         db.creator_profiles.push(profileData);
       }
       const usr = db.users?.find((u: any) => u.user_id === user.user_id);
       if (usr) {
         usr.picture = profileData.picture;
         usr.photo = profileData.picture;
         usr.avatar = profileData.picture;
         usr.name = profileData.name;
         // usr.email (login email) is not changed here — Session 53, see above.
         if (dobVal) {
           usr.dob = dobVal;
           usr.date_of_birth = dobVal;
         }
         if (isComplete) {
           usr.onboarded = true;
         }
       }
       const kycRecord = (db.creator_kyc || []).find((k: any) => k.creator_id === user.user_id || k.user_id === user.user_id);
       if (kycRecord && dobVal) {
         kycRecord.dob = dobVal;
         kycRecord.date_of_birth = dobVal;
       }
       saveDb(db);

       // Universal Category & Niche Search Sync
       (async () => {
         try {
           const tagsToSync = [];
           if (profileData.category) tagsToSync.push({ name: profileData.category, type: 'niche' as const });
           if (Array.isArray(profileData.sub_categories)) {
             profileData.sub_categories.forEach((sc: string) => {
               if (sc) tagsToSync.push({ name: sc, type: 'skill' as const });
             });
           }
           if (Array.isArray(req.body.niches)) {
             req.body.niches.forEach((n: string) => {
               if (n) tagsToSync.push({ name: n, type: 'niche' as const });
             });
           }
           if (Array.isArray(req.body.skills)) {
             req.body.skills.forEach((s: string) => {
               if (s) tagsToSync.push({ name: s, type: 'skill' as const });
             });
           }
           if (Array.isArray(profileData.languages)) {
             profileData.languages.forEach((lang: string) => {
               if (lang) tagsToSync.push({ name: lang, type: 'language' as const });
             });
           }
           const prof = req.body.rate_card?.extras?.profession || req.body.profession;
           if (prof) {
             tagsToSync.push({ name: prof, type: 'profession' as const });
           }
           const uniqueTags = Array.from(
             new Map(tagsToSync.map(item => [item.name.toLowerCase() + '-' + item.type, item])).values()
           );
           if (uniqueTags.length > 0) {
             await syncEntityTags('creator_profile', user.user_id, uniqueTags);
           }
         } catch (e) {
           console.error("Error in creator profile tag sync:", e);
         }
       })();

       // Handle verifications insert if not exists
       if (supabase) {
         const { data: pendingVer } = await supabase
         .from('verifications')
         .select('verification_id')
         .eq('user_id', user.user_id)
         .eq('status', 'pending')
         .maybeSingle();

       if (!pendingVer) {
         await (privilegedSupabase || supabase).from('verifications').insert({
           verification_id: `ver_${Math.random().toString(36).substring(2, 10)}`,
           user_id: user.user_id,
           name: profileData.name,
           email: profileData.email,
           photo: profileData.picture || "",
           kind: "creator",
           category: profileData.category || "Unknown",
           handle: profileData.instagram || profileData.youtube || `@${profileData.name.split(" ")[0].toLowerCase()}`,
           followers: (profileData.followers_instagram || 0) + (profileData.followers_youtube || 0) || 0 /* Session 58: no made-up follower count */,
           documents: ["Onboarding Profile"],
           note: "Auto-submitted during onboarding",
           status: "pending",
           created_at: getIsoNow(),
         });
       }
       }
       res.json({ ok: true });
    } catch(err) {
       console.error(err);
       res.status(500).json({ detail: "Server error" });
    }
  };
  router.post("/creators/profile", saveCreatorProfile);
  router.patch("/creators/me", saveCreatorProfile);


  // Explore Creators (session 27). The page used to read creator_profiles straight from the
  // browser: every column of every row, no limit — including photos stored as multi-MB `data:`
  // strings when an upload had failed — and it broke whenever that browser read was blocked.
  // Now the server reads it once a minute and sends only public fields.
  let exploreCache: { at: number; data: any[]; sig?: string | null; fullAt?: number } | null = null;
  let exploreLoading: Promise<any[]> | null = null; // v378 (QA M13): one shared read when the cache is empty
  const EXPLORE_TTL_MS = 10 * 60 * 1000; // v428: 10 min (was 1 min) — every refill read every creator from Supabase (egress)
  const EXPLORE_FULL_MS = 60 * 60 * 1000; // v429: a full read at least once an hour, even when the check sees no change
  /** v429: "<count>|<newest updated_at>" — a few bytes instead of the whole list. null when it can't be read. */
  const exploreSignature = async (c: any): Promise<string | null> => {
    if (!c) return null;
    try {
      const { data, count, error } = await c.from("creator_profiles").select("updated_at", { count: "exact" })
        .order("updated_at", { ascending: false, nullsFirst: false }).limit(1);
      if (error) return null;
      return `${count ?? "?"}|${data?.[0]?.updated_at || ""}`;
    } catch { return null; }
  };
  // v419: Eva can filter by age without the date of birth leaving the server — only a broad band goes out.
  const ageBand = (row: any) => {
    const raw = String(row?.dob || row?.date_of_birth || row?.rate_card?.dob || row?.rate_card?.date_of_birth || "").trim();
    const t = raw ? Date.parse(raw.length === 10 && /^\d{2}[-/]\d{2}[-/]\d{4}$/.test(raw) ? raw.slice(6) + "-" + raw.slice(3, 5) + "-" + raw.slice(0, 2) : raw) : NaN;
    if (!Number.isFinite(t)) return "";
    const age = Math.floor((Date.now() - t) / (365.25 * 864e5));
    if (age < 18 || age > 80) return "";
    return age <= 24 ? "18-24" : age <= 34 ? "25-34" : age <= 44 ? "35-44" : "45-80";
  };
  const slimExploreRow = (row: any) => {
    const out: any = stripPrivateProfileFields(row || {});
    const band = ageBand(row);
    if (band) out.age_band = band;
    for (const [k, v] of Object.entries(out)) {
      if (typeof v === "string" && v.startsWith("data:") && v.length > 4096) out[k] = "";
      else if (typeof v === "string" && v.length > 20000) out[k] = v.slice(0, 2000);
    }
    return out;
  };
  router.get("/creators/explore", async (req, res) => {
    // Session 58 (bug hunt): Explore sent the RAW rates to everyone — the same markup as the profile page applies now
    // (per viewer; the cached list stays raw).
    const withViewerMarkup = async (list: any[]) => {
      const viewer = await parseAuthUser(req).catch(() => null);
      const pct = markupForRole(viewer?.role, getSettings(getDb()));
      if (!pct) return list;
      return list.map((r: any) => ({ ...r, ...(r.rate_card ? { rate_card: transformRateCard(r.rate_card, pct) } : {}), ...withMarkedRates(r, pct) }));
    };
    if (exploreCache && Date.now() - exploreCache.at < EXPLORE_TTL_MS) {
      res.setHeader("X-Explore-Cache", "hit");
      return res.json(await withViewerMarkup(exploreCache.data));
    }
    // v429 (Ravi: egress kam karo): after 10 min, first a tiny check (how many creators + newest change). Nothing
    // changed → the same list is kept (no full read). A full read still happens at least once an hour.
    if (exploreCache && exploreCache.sig && Date.now() - (exploreCache.fullAt || 0) < EXPLORE_FULL_MS) {
      const sig = await exploreSignature(privilegedSupabase || supabase);
      if (sig && sig === exploreCache.sig) {
        exploreCache.at = Date.now();
        res.setHeader("X-Explore-Cache", "same");
        return res.json(await withViewerMarkup(exploreCache.data));
      }
    }
    // v378 (QA M13): when the cache is empty, many visitors at once used to start one full read EACH (p99 ~5 s under
    // load). Now the first one reads and the rest wait for that same read.
    if (exploreLoading) {
      try { const shared = await exploreLoading; res.setHeader("X-Explore-Cache", "shared"); return res.json(await withViewerMarkup(shared)); }
      catch { /* fall through and read ourselves */ }
    }
    let doneLoading: (v: any[]) => void = () => {}; let failLoading: (e: any) => void = () => {};
    exploreLoading = new Promise<any[]>((ok, no) => { doneLoading = ok; failLoading = no; });
    exploreLoading.catch(() => {});
    try {
    let rows: any[] | null = null;
    const c = privilegedSupabase || supabase;
    const sigBefore = c ? await exploreSignature(c) : null; // v429: taken BEFORE the read, so a change during it is never missed
    if (c) {
      try {
        rows = [];
        for (let from = 0; from < 5000; from += 1000) {
          const { data, error } = await readCreatorsLean(c, (q: any) => q.order("user_id", { ascending: true }).range(from, from + 999)); // v329: fixed order — pages no longer overlap / skip
          if (error) { console.error("[explore] creator_profiles read failed:", error.message || error); rows = null; break; }
          rows.push(...(data || []));
          if (!data || data.length < 1000) break;
        }
      } catch (e) { logIgnored("creators_routes:explore", e); rows = null; }
    }
    if (!rows) rows = getDb().creator_profiles || [];
    const db = getDb();
    const deletedIds = new Set((db.deleted_user_ids || []).map(String));
    const list = rows
      .filter((r: any) => r && !r.is_deleted && !(r.user_id && deletedIds.has(String(r.user_id))))
      .filter((r: any) => {
        const name = String(r?.name || "").toLowerCase();
        const handle = String(r?.instagram_handle || r?.handle || "").toLowerCase();
        return !name.includes("developer bypass") && !handle.includes("dev_bypass");
      })
      .map(slimExploreRow);
    exploreCache = { at: Date.now(), data: list, sig: sigBefore, fullAt: Date.now() }; // v429
    doneLoading(list);
    return res.json(await withViewerMarkup(list));
    } catch (e: any) { failLoading(e); throw e; } finally { exploreLoading = null; }
  });

  router.get("/creators", async (req, res) => {
    const db = getDb();
    const viewer = await parseAuthUser(req);
    if (!viewer) return res.status(401).json({ error: "Unauthorized" });
    let list = db.creator_profiles || [];
    
    const deletedUserIds = new Set(db.deleted_user_ids || []);
    const deletedEmails = new Set((db.deleted_user_emails || []).map((e: string) => String(e).toLowerCase()));

    // Only show verified profiles unless creator is viewing themselves or requested by an admin
    list = list.filter((c) => {
      // Exclude soft-deleted profiles unless viewing self
      if (c.is_deleted && viewer?.user_id !== c.user_id) return false;
      if (c.user_id && deletedUserIds.has(c.user_id)) return false;
      if (c.email && deletedEmails.has(String(c.email).toLowerCase())) return false;
      
      if (c.verified) return true;
      if (viewer?.role === "admin") return true;
      if (viewer?.user_id === c.user_id) return true;
      return false;
    });

    const {
      q,
      category,
      city,
      platform,
      min_followers,
      max_followers,
      max_budget,
      min_engagement,
      language,
      gender,
      barter,
      creator_type,
      sort_by,
    } = req.query;

    if (q) {
      list = list.filter((c) => c.name.toLowerCase().includes((q as string).toLowerCase()));
    }
    if (category) {
      list = list.filter((c) => c.category === category);
    }
    if (city) {
      list = list.filter((c) => c.city === city);
    }
    if (language) {
      list = list.filter((c) => c.languages && c.languages.includes(language));
    }
    if (gender) {
      list = list.filter((c) => c.gender === gender);
    }
    if (barter) {
      list = list.filter((c) => c.barter === barter);
    }
    if (creator_type) {
      list = list.filter((c) => c.creator_type === creator_type);
    }
    if (min_engagement) {
      list = list.filter((c) => c.engagement_rate >= parseFloat(min_engagement as string));
    }

    const settings = getSettings(db);
    const pct = markupForRole(viewer?.role, settings);

    const totalFollowers = (c: any) => (c.followers_instagram || 0) + (c.followers_youtube || 0);
    const minRate = (c: any) => {
      const rc = c.rate_card || {};
      const values = Object.values(rc).filter((v) => typeof v === "number") as number[];
      return values.length > 0 ? Math.min(...values) : 0;
    };

    let processed = list.map((c) => {
      const mapped = { ...c };
      if (pct) {
        mapped.rate_card = transformRateCard(c.rate_card, pct);
        Object.assign(mapped, withMarkedRates(mapped, pct)); // Session 58: same markup on the top-level rates
      }
      mapped.total_followers = totalFollowers(mapped);
      mapped.min_rate = minRate(mapped);
      return mapped;
    });

    if (min_followers) {
      processed = processed.filter((c) => c.total_followers >= parseInt(min_followers as string, 10));
    }
    if (max_followers) {
      processed = processed.filter((c) => c.total_followers <= parseInt(max_followers as string, 10));
    }
    if (max_budget) {
      processed = processed.filter((c) => c.min_rate <= parseInt(max_budget as string, 10));
    }
    if (platform === "instagram") {
      processed = processed.filter((c) => c.instagram);
    }
    if (platform === "youtube") {
      processed = processed.filter((c) => c.youtube);
    }

    if (sort_by === "followers") {
      processed.sort((a, b) => b.total_followers - a.total_followers);
    } else if (sort_by === "engagement") {
      processed.sort((a, b) => b.engagement_rate - a.engagement_rate);
    } else if (sort_by === "budget") {
      processed.sort((a, b) => a.min_rate - b.min_rate);
    } else {
      processed.sort((a, b) => b.performance_score - a.performance_score);
    }

    // Session 58 (security): other users never get emails / phones / date of birth from this list.
    res.json(processed.slice(0, 100).map((c: any) => (viewer?.role === "admin" || viewer?.user_id === c.user_id ? c : stripPrivateProfileFields(c))));
  });


  router.post("/creators/:id/review", async (req, res) => {
    try {
      const user = await parseAuthUser(req);
      if (!user) return res.status(401).json({ detail: "Please log in to submit a review.", _status: 401 });
      const { rating, comment } = req.body;
      if (!rating || Number(rating) < 1 || Number(rating) > 5) {
        return res.status(400).json({ error: "Rating must be between 1 and 5." });
      }
      if (!comment || !String(comment).trim()) {
        return res.status(400).json({ error: "Comment is required." });
      }

      const creatorId = req.params.id;
      const db = getDb();
      if (!db.creator_reviews) db.creator_reviews = [];
      // Session 58 (security): only a brand that finished a deal with this creator may review — once per brand.
      // Anyone (even the creator) could post unlimited reviews before.
      if (String(user.role || "").toLowerCase() !== "brand") return res.status(403).json({ error: "Only brands who worked with this creator can review them." });
      const brandKey = String(user.parent_brand_id || user.user_id);
      const c0 = privilegedSupabase || supabase;
      if (c0) {
        const { data: done } = await c0.from("deals").select("id").eq("creator_id", creatorId).eq("brand_id", brandKey).in("status", ["COMPLETED", "completed"]).limit(1);
        if (!done || !done.length) return res.status(403).json({ error: "You can review a creator after completing a deal with them." });
        const { data: mine } = await c0.from("creator_reviews").select("id").eq("creator_id", creatorId).eq("brand_id", brandKey).limit(1);
        if (mine && mine.length) return res.status(409).json({ error: "You have already reviewed this creator." });
      }

      const reviewObj = {
        id: "rev_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        creator_id: creatorId,
        creator_user_id: creatorId,
        brand_id: brandKey, // Session 58: the brand (not the team member), so the "already reviewed" check matches
        brand_name: user.name || "Brand Partner",
        brand_avatar: user.picture || "",
        rating: Number(rating),
        comment: String(comment).trim(),
        created_at: getIsoNow()
      };

      db.creator_reviews.push(reviewObj);
      saveDb(db);
      await insertCreatorReview(privilegedSupabase, reviewObj); // Session 52: kept in creator_reviews

      res.json({ success: true, review: reviewObj });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to submit review" });
    }
  });


  router.post("/creators/:id/save", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    if (!isBrandLike(user.role)) return res.status(403).json({ detail: "Only brands can save creators" }); // v416 (CR4)

    const db = getDb();
    db.saved_creators = db.saved_creators || [];
    const brand_id = getActingBrandId(user);
    const creator_id = req.params.id;

    const idx = db.saved_creators.findIndex((s) => s.brand_id === brand_id && s.creator_id === creator_id);
    // Session 52: the saved_creators table is the real list; memory only when the database can't answer.
    const fromTable = await toggleSavedCreator(privilegedSupabase, brand_id, creator_id);
    let saved = false;
    if (fromTable) {
      saved = fromTable.saved;
      if (!saved && idx > -1) db.saved_creators.splice(idx, 1);
      if (saved && idx < 0) db.saved_creators.push({ brand_id, creator_id, created_at: getIsoNow() });
    } else if (idx > -1) {
      db.saved_creators.splice(idx, 1);
    } else {
      db.saved_creators.push({ brand_id, creator_id, created_at: getIsoNow() });
      saved = true;
    }
    saveDb(db);
    res.json({ saved });
  });


  router.get("/creators/:id/saved-status", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || !isBrandLike(user.role)) return res.json({ saved: false }); // v416 (CR4)
    const db = getDb();
    db.saved_creators = db.saved_creators || [];
    const brand_id = getActingBrandId(user);
    const creator_id = req.params.id;
    const inTable = await isCreatorSaved(privilegedSupabase, brand_id, [creator_id]);
    const isSaved = inTable !== null ? inTable : db.saved_creators.some((s) => s.brand_id === brand_id && s.creator_id === creator_id);
    res.json({ saved: isSaved });
  });


  router.post("/creators/:id/request-collab-cost", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    if (!isBrandLike(user.role)) return res.status(403).json({ detail: "Only brands can request cost" }); // v416 (CR4)

    const db = getDb();
    db.collab_cost_requests = db.collab_cost_requests || [];
    const brand_id = getActingBrandId(user);
    const creator_id = req.params.id;
    const { deliverable_type, brand_message } = req.body;

    const newRequest = {
      id: `cost_req_${Math.random().toString(36).substring(2, 10)}`,
      brand_id,
      creator_id,
      deliverable_type,
      brand_message,
      status: "PENDING",
      created_at: getIsoNow(),
    };

    db.collab_cost_requests.push(newRequest);

    db.notifications = db.notifications || [];
    db.notifications.push({
      notif_id: `notif_${Math.random().toString(36).substring(2, 10)}`,
      user_id: creator_id,
      type: "collab_cost",
      message: `A brand requested collab cost for ${deliverable_type}`,
      read: false,
      created_at: getIsoNow(),
    });

    saveDb(db);
    res.json(newRequest);
  });


  const handleSendBrief = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    if (!isBrandLike(user.role)) return res.status(403).json({ detail: "Only brands can send briefs" }); // v416 (CR4)

    const db = getDb();
    db.brief_requests = db.brief_requests || [];
    db.chat_threads = db.chat_threads || [];
    db.chat_messages = db.chat_messages || [];
    db.notifications = db.notifications || [];

    const brand_id = getActingBrandId(user);
    const creatorParamId = req.params.id;
    const {
      campaign_title,
      budget_range,
      deliverables,
      timeline,
      message
    } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Please provide a brief or invitation message." });
    }
    // The invite becomes a real campaign deal when the creator accepts, so it needs a real fee.
    const offeredAmount = parseInviteBudget(budget_range);
    const inviteMin = await minPayoutFor(user?.parent_brand_id || user?.user_id); // v419: ₹500 for a Ybex in-house brand
    if (offeredAmount < inviteMin) {
      return res.status(400).json({
        error: `Please enter the fee you are offering (₹${inviteMin.toLocaleString("en-IN")} or more).`,
        code: "INVITE_AMOUNT_REQUIRED",
      });
    }
    if (String(creatorParamId) === String(user.user_id)) {
      return res.status(400).json({ error: "You cannot invite yourself." });
    }
    // brief_requests is server-only. With Supabase but no service-role key the invite used to be
    // kept in THIS instance's memory only — the creator's dashboard (another instance, or after a
    // restart) never saw it. Say so instead (session 27).
    if (supabase && !inviteClient) {
      console.error("[send-brief] SUPABASE_SERVICE_ROLE_KEY is not set — invitations cannot be stored.");
      return res.status(503).json({ error: "Invitations are unavailable right now. Please contact support.", code: "SERVICE_KEY_MISSING" });
    }

    // 1. Resolve creator profile & account
    let creatorProfile: any = null;
    let creatorUser: any = null;

    // One column per query: `.or(user_id.eq.X,id.eq.X)` failed as a whole whenever `id` is a
    // uuid column and X is not a uuid (session 27) — the invite then went out with no email.
    const lookupOne = async (table: string, column: string) => {
      const c = privilegedSupabase || supabase;
      if (!c) return null;
      if (column === "id" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(creatorParamId))) return null;
      try {
        const { data } = await c.from(table).select("*").eq(column, creatorParamId).limit(1);
        return Array.isArray(data) && data[0] ? data[0] : null;
      } catch (e) { logIgnored(`creators_routes:invite-lookup-${table}`, e); return null; }
    };
    creatorProfile = (await lookupOne("creator_profiles", "user_id")) || (await lookupOne("creator_profiles", "id"));
    const userKey = creatorProfile?.user_id || creatorParamId;
    if (privilegedSupabase || supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from("users").select("*").eq("user_id", userKey).limit(1);
        if (Array.isArray(data) && data[0]) creatorUser = data[0];
      } catch (e) { logIgnored("creators_routes:invite-lookup-users", e); }
    }

    if (!creatorProfile) {
      creatorProfile = (db.creator_profiles || []).find(
        (c: any) => c.user_id === creatorParamId || c.id === creatorParamId
      );
    }
    if (!creatorUser) {
      creatorUser = (db.users || []).find(
        (u: any) => u.user_id === creatorParamId || u.id === creatorParamId
      );
    }

    const creatorId = creatorProfile?.user_id || creatorUser?.user_id || creatorParamId;
    const creatorName = creatorProfile?.name || creatorProfile?.full_name || creatorUser?.name || "Creator";
    const creatorEmail = String(creatorProfile?.email || creatorProfile?.contact_email || creatorUser?.email || "").trim().toLowerCase();
    const creatorPhone = creatorProfile?.phone || creatorProfile?.whatsapp || creatorUser?.phone || "";
    const creatorHandle = creatorProfile?.instagram_handle || creatorProfile?.handle || creatorProfile?.instagram || "";
    const creatorAvatar = creatorProfile?.picture || creatorProfile?.photo || creatorProfile?.avatar_url || creatorUser?.picture || "";

    // v347 (Ravi approved): the creator is already in THIS campaign with this brand (a live application or an
    // open deal chat) → no second invite (it became a second deal + chat on accept). The campaign is the one
    // picked in the invite sheet (campaign_id), else the brand's campaign with exactly this title.
    // Lookups that fail never block the invite (same as before).
    let pickedCampaign = false; // v414: the invite names one of the brand's campaigns
    {
      const cc = privilegedSupabase || supabase;
      const wantId = String(req.body?.campaign_id || "").trim();
      const wantTitle = String(campaign_title || "").trim().toLowerCase();
      try {
        let brandCampaigns: any[] = [];
        if (cc) {
          const { data } = await cc.from("campaigns").select("campaign_id, title, brand_user_id").eq("brand_user_id", brand_id).limit(500);
          brandCampaigns = Array.isArray(data) ? data : [];
        } else {
          brandCampaigns = (db.campaigns || []).filter((c: any) => String(c.brand_user_id) === String(brand_id));
        }
        const byId = wantId ? brandCampaigns.find((c: any) => String(c.campaign_id) === wantId) : null;
        const byTitle = !byId && wantTitle ? brandCampaigns.filter((c: any) => String(c.title || "").trim().toLowerCase() === wantTitle) : [];
        const camp = byId || (byTitle.length === 1 ? byTitle[0] : null);
        if (camp) pickedCampaign = true;
        if (camp) {
          let apps: any[] = [];
          let thrs: any[] = [];
          if (cc) {
            const [a, t] = await Promise.all([
              cc.from("campaign_applications").select("application_id, status").eq("campaign_id", camp.campaign_id).eq("creator_id", creatorId).limit(20),
              cc.from("chat_threads").select("id, status, flow_state").eq("campaign_id", camp.campaign_id).eq("creator_id", creatorId).eq("brand_id", brand_id).limit(20),
            ]);
            apps = Array.isArray(a?.data) ? a.data : [];
            thrs = Array.isArray(t?.data) ? t.data : [];
          } else {
            apps = (camp.applicants || []).filter((x: any) => String(x.creator_user_id || x.creator_id) === String(creatorId));
            thrs = (db.chat_threads || []).filter((t: any) => String(t.campaign_id) === String(camp.campaign_id) && String(t.creator_id) === String(creatorId) && String(t.brand_id) === String(brand_id));
          }
          const clash = campaignInviteConflict(apps, thrs);
          if (clash) {
            const msg = clash.reason === "in_deal"
              ? `${creatorName} is already in a deal with you for this campaign — open the chat instead.`
              : `${creatorName} has already applied to this campaign — review the application instead.`;
            return res.status(409).json({ code: "ALREADY_IN_CAMPAIGN", reason: clash.reason, thread_id: clash.thread_id, campaign_id: camp.campaign_id, error: msg, detail: msg });
          }
        }
      } catch (e) { logIgnored("creators_routes:invite-already-in-campaign", e); }
    }

    // v414: re-inviting the same creator used to create a second invite → a second deal + chat on accept.
    // Refused while an invite for the same campaign is pending / being accepted, or was accepted in the
    // last 30 days and its chat is still open (any open invite when no campaign is named). Lookup errors never block.
    {
      try {
        let mine: any[] = [];
        if (inviteClient) {
          const { data } = await inviteClient.from("brief_requests").select("*").eq("brand_id", brand_id).eq("creator_id", creatorId).order("created_at", { ascending: false }).limit(50);
          mine = Array.isArray(data) ? data : [];
        }
        for (const b of db.brief_requests || []) {
          if (String(b?.brand_id) === String(brand_id) && String(b?.creator_id) === String(creatorId) && !mine.some((m: any) => m.id === b.id)) mine.push(b);
        }
        const threadIds = mine.map((m: any) => m?.thread_id).filter(Boolean).map(String);
        const openThreads = new Set<string>();
        if (threadIds.length) {
          const cc = privilegedSupabase || supabase;
          let rows: any[] = [];
          if (cc) {
            const { data } = await cc.from("chat_threads").select("id, status, flow_state").in("id", threadIds).limit(50);
            rows = Array.isArray(data) ? data : [];
          } else {
            rows = (db.chat_threads || []).filter((t: any) => threadIds.includes(String(t.id)));
          }
          const dead = ["COMPLETED", "CLOSED", "CANCELLED", "CANCELED", "DECLINED", "REJECTED", "REFUNDED", "EXPIRED", "PAID", "RELEASED"];
          for (const t of rows) if (!dead.includes(String(t.status || "").toUpperCase()) && !dead.includes(String(t.flow_state || "").toUpperCase())) openThreads.add(String(t.id));
        }
        const dup = duplicateInvite(mine, { campaign_title: String(campaign_title || "").trim() || "Campaign Collaboration", has_campaign: pickedCampaign }, Date.now(), openThreads);
        if (dup) {
          const accepted = String(dup.status) === "accepted";
          const msg = accepted
            ? `${creatorName} already accepted your invitation for this campaign — open the chat instead.`
            : `You have already invited ${creatorName}. Wait for them to reply, or withdraw that invitation first.`;
          return res.status(409).json({ code: "ALREADY_INVITED", invite_id: dup.id, thread_id: dup.thread_id || null, status: inviteViewStatus(dup), error: msg, detail: msg });
        }
      } catch (e) { logIgnored("creators_routes:invite-duplicate-check", e); }
    }

    // Determine registration status:
    // A creator is unregistered if is_claimed is false, or auth_method is 'unclaimed', or user account doesn't exist/unclaimed
    const isUnclaimed =
      creatorProfile?.is_claimed === false ||
      creatorProfile?.auth_method === "unclaimed" ||
      creatorUser?.auth_method === "unclaimed" ||
      creatorUser?.is_claimed === false ||
      !creatorUser;

    const isRegistered = !isUnclaimed;

    // 2. Resolve Brand Profile details
    let brandProf: any = (db.brand_profiles || []).find((b: any) => b.user_id === brand_id) || {};
    // v416 (C4): the brand profile lives in Supabase — the local copy is often missing, so creators saw the
    // account name ("Brand Owner") instead of the company name.
    if (!brandProf.company_name && (privilegedSupabase || supabase)) {
      try {
        const { data: bpRow } = await (privilegedSupabase || supabase).from("brand_profiles").select("*").eq("user_id", brand_id).maybeSingle();
        if (bpRow) brandProf = { ...brandProf, ...bpRow };
      } catch (e) { logIgnored("creators_routes:invite-brand-profile", e); }
    }
    const brandName = brandProf.company_name || user.name || "Brand Partner";
    const brandLogo = brandProf.logo || brandProf.profile_photo_url || user.picture || "";
    const brandEmail = user.email || "";

    const nowIso = getIsoNow();

    // v414: the brand's free text is saved with contact details masked (it is shown to the creator and copied
    // into the chat's offer card, past the chat filter).
    const formattedDeliverables = maskContactDetails(String(deliverables || "").trim()) || "To be discussed in chat";
    const formattedTimeline = formatInviteTimeline(timeline) || "Flexible";
    const formattedBudget = `₹${offeredAmount.toLocaleString("en-IN")}`;
    const formattedTitle = maskContactDetails(String(campaign_title || "").trim()) || "Campaign Collaboration";
    const formattedPitch = maskContactDetails(String(message).trim());

    // Helper to calculate deliverables count
    const numMatches = formattedDeliverables.match(/\b\d+\b/g);
    const deliverablesCount = numMatches && numMatches.length > 0
      ? numMatches.reduce((acc: number, curr: string) => acc + parseInt(curr, 10), 0)
      : (formattedDeliverables.split(/[,+\n;]/).map((s: string) => s.trim()).filter(Boolean).length || 1);

    // Gated Direct Brand Invitation:
    // Do NOT automatically open a live chat thread or allow direct messaging.
    // Save the invite as a pending direct pitch/invitation in the database with status pending_creator_acceptance.
    const briefId = `brief_req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newBrief = {
      id: briefId,
      brand_id,
      brand_name: brandName,
      brand_logo: brandLogo,
      brand_email: brandEmail,
      creator_id: creatorId,
      creator_name: creatorName,
      creator_handle: creatorHandle,
      creator_email: creatorEmail,
      creator_phone: creatorPhone,
      creator_is_claimed: isRegistered,
      campaign_title: formattedTitle,
      campaign_description: (typeof req.body.campaign_description === "string" && req.body.campaign_description.trim() ? maskContactDetails(req.body.campaign_description) : "") || formattedPitch, // v414: masked
      budget_range: formattedBudget,
      proposed_budget: formattedBudget,
      amount: offeredAmount,
      deliverables: formattedDeliverables,
      deliverables_count: deliverablesCount,
      timeline: formattedTimeline,
      message: formattedPitch,
      pitch: formattedPitch,
      status: "pending_creator_acceptance",
      thread_id: null,
      admin_notes: "",
      created_at: nowIso,
      updated_at: nowIso,
    };

    if (inviteClient) {
      const { error: invErr } = await inviteClient.from("brief_requests").insert(toInviteRow(newBrief));
      if (invErr) {
        console.error("[send-brief] brief_requests insert failed:", invErr.message || invErr);
        return res.status(500).json({ error: "Could not send the invitation. Please try again.", detail: invErr.message });
      }
    }
    db.brief_requests.push(newBrief);

    // In-app Notification for creator
    const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const creatorNotif = {
      notif_id: notifId,
      user_id: creatorId,
      type: "campaign_invite",
      title: "Campaign Invitation Received",
      message: `You received a campaign invitation from ${brandName} for "${formattedTitle}" (${formattedBudget})!`,
      data: { brief_id: briefId, status: "pending_creator_acceptance", budget: formattedBudget, brand_name: brandName, campaign_title: formattedTitle },
      read: false,
      created_at: nowIso,
    };
    db.notifications.push(creatorNotif);

    if (supabase) {
      try {
        await (privilegedSupabase || supabase).from("notifications").insert(creatorNotif);
      } catch (e) { logIgnored("creators_routes:notif_insert", e); }
    }

    // Email outreach if configured
    const appUrl = publicSiteUrl(); // v389: was APP_URL || "https://ybex.club" — never the hosting address or a foreign domain
    const apiKey = process.env.RESEND_API_KEY;

    // v389 (QA, Ravi OK 30 Oct): the brand's own words went into the email as raw HTML (a brand could send <a href=evil> or a phone number from
    // collabs@ybexmedia.in, past the chat's contact filter). Every brand-written value is escaped; the free text also gets the chat's contact masking.
    const escH = (v: any) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const mailText = (v: any) => escH(maskContactDetails(String(v ?? "")));

    if (apiKey && creatorEmail) {
      try {
        const resendClient = new Resend(apiKey);
        const emailHtml = buildEmailHtml({
          title: "New Campaign Invitation Received",
          greeting: `Hi ${escH(creatorName)},`,
          paragraphs: [
            `<strong>${escH(brandName)}</strong> has sent you a campaign collaboration invitation on YBEX!`,
            `<strong>Campaign:</strong> ${mailText(formattedTitle)}`,
            `<strong>Offered Budget:</strong> ${escH(formattedBudget)}`,
            `<strong>Deliverables (${deliverablesCount}):</strong> ${mailText(formattedDeliverables)}`,
            `<strong>Timeline:</strong> ${mailText(formattedTimeline)}`,
            `<strong>Pitch / Notes:</strong> "${mailText(formattedPitch)}"`
          ],
          button: {
            text: isRegistered ? "Review Invitation in Dashboard" : "Claim Profile & Review Invitation",
            url: isRegistered ? `${appUrl}/creator/dashboard` : `${appUrl}/auth/register?ref=pitch&creator_id=${creatorId}&email=${encodeURIComponent(creatorEmail)}`
          }
        });

        await resendClient.emails.send({
          from: getValidFromEmail("YBEX Collaborations <collabs@ybexmedia.in>"),
          to: creatorEmail,
          subject: `Invite from ${String(brandName).replace(/[\r\n]+/g, " ").slice(0, 40)} — reply now`, // v419: short
          html: emailHtml
        });
      } catch (emailErr) {
        console.warn("[send-brief] Failed sending email invitation to creator:", emailErr);
      }
    }

    saveDb(db);

    const io = req.app.get("io");
    if (io) {
      io.to(`user_${creatorId}`).emit("invitation_received", newBrief);
      // The bell and the dashboard listen for this one (session 27) — the invite used to show only
      // after the creator reloaded the page.
      io.to(`user_${creatorId}`).emit("bell_notification", creatorNotif);
    }

    return res.json({
      success: true,
      status: "pending_creator_acceptance",
      note: "Invitation sent to creator! Chat will open once the creator accepts your invitation.",
      message: "Invitation sent to creator! Chat will open once the creator accepts your invitation.",
      brief: newBrief,
      invitation: newBrief,
      thread_id: null,
      is_registered: isRegistered,
    });
  };

  router.post("/creators/:id/send-brief", handleSendBrief);
  router.post("/creators/:id/invite", handleSendBrief);

  // 1. GET pending and all direct campaign invitations for creator
  router.get(["/creators/invitations", "/creators/invitations/pending", "/creator/invitations"], async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const db = getDb();
    const brandProfiles = db.brand_profiles || [];
    const users = db.users || [];

    // Supabase rows first (every server instance sees them), then any local-only copies.
    const byId = new Map<string, any>();
    const myIds = new Set<string>([String(user.user_id), String(user.id || user.user_id)]);
    for (const p of db.creator_profiles || []) if (p?.user_id === user.user_id && p?.id) myIds.add(String(p.id));
    const byId_ = (r: any) => { if (r?.id && !byId.has(r.id)) byId.set(r.id, cacheInvite(r)); };
    if (inviteClient) {
      try {
        // An invite may carry the creator's user id, their profile id (sent from a profile page
        // before the account was linked) or only their email. All three are looked up, in parallel.
        const email = String(user.email || "").trim().toLowerCase();
        if (!profileIdColumnMissing) {
          const { data: profRows, error: profErr } = await inviteClient.from("creator_profiles").select("id").eq("user_id", user.user_id).limit(5);
          if (profErr) noteProfileIdError(profErr);
          for (const p of profRows || []) if (p?.id) myIds.add(String(p.id));
        }
        const ids = Array.from(myIds);
        const [byId, byMail] = await Promise.all([
          inviteClient.from("brief_requests").select("*").in("creator_id", ids).order("created_at", { ascending: true }).limit(200),
          email ? inviteClient.from("brief_requests").select("*").eq("creator_email", email).order("created_at", { ascending: true }).limit(200) : Promise.resolve({ data: [] }),
        ]);
        if ((byId as any)?.error) console.error("[invites] list failed:", (byId as any).error.message || (byId as any).error);
        for (const r of (byId as any)?.data || []) byId_(r);
        for (const r of (byMail as any)?.data || []) byId_(r);
      } catch (e) { logIgnored("creators_routes:invite-list", e); }
    }
    for (const b of db.brief_requests || []) {
      if (!byId.has(b.id)) byId.set(b.id, b);
    }

    // Find invitations targeting this creator
    const creatorInvitations = Array.from(byId.values()).filter((b: any) =>
      isInvitedCreator(b, { ...user, role: "creator" }) || (b?.creator_id && myIds.has(String(b.creator_id))));

    // v416 (C4): company names from Supabase brand_profiles (older invites saved the account name, e.g. "Brand Owner").
    const sbBrands = new Map<string, any>();
    const brandIds = Array.from(new Set(creatorInvitations.map((i: any) => String(i?.brand_id || "")).filter(Boolean))).slice(0, 100);
    if (brandIds.length && (privilegedSupabase || supabase)) {
      try {
        const { data: bpRows } = await (privilegedSupabase || supabase).from("brand_profiles").select("*").in("user_id", brandIds);
        for (const r of bpRows || []) if (r?.user_id) sbBrands.set(String(r.user_id), r);
      } catch (e) { logIgnored("creators_routes:invite-list-brands", e); }
    }

    // Enrich with brand logo and details if missing
    const enriched = creatorInvitations.map((inv: any) => {
      const bp = sbBrands.get(String(inv.brand_id)) || brandProfiles.find((p: any) => p.user_id === inv.brand_id) || {};
      const bu = users.find((u: any) => u.user_id === inv.brand_id) || {};
      return {
        ...inv,
        brand_name: bp.company_name || inv.brand_name || bu.name || "Brand Partner", // v416 (C4): company name first
        brand_logo: inv.brand_logo || bp.logo || bp.profile_photo_url || bu.picture || "",
        // v414: older invites were saved raw — contact details are masked on the way out too.
        message: maskContactDetails(inv.message),
        campaign_title: maskContactDetails(inv.campaign_title) || "Campaign Collaboration",
        campaign_description: maskContactDetails(inv.campaign_description || inv.message || inv.pitch || ""),
        proposed_budget: inv.proposed_budget || inv.budget_range || "Negotiable",
        budget_range: inv.budget_range || inv.proposed_budget || "Negotiable",
        deliverables: maskContactDetails(inv.deliverables) || "Standard Deliverables",
        timeline: inv.timeline || "Flexible",
        pitch: maskContactDetails(inv.pitch || inv.message || ""),
        notes: maskContactDetails(inv.pitch || inv.message || ""),
        // A half-finished accept (crash) counts as still open after a short while.
        // v414: a pending invite older than 14 days shows "expired"; a brand-withdrawn one "withdrawn".
        status: inviteViewStatus(inv)
      };
    });

    const pending = enriched.filter((i: any) => i.status === "pending_creator_acceptance");

    return res.json({
      success: true,
      invitations: enriched.reverse(),
      pending,
      pending_count: pending.length
    });
  });

  // 2. POST /creators/invitations/:id/accept -> creator accepts; a NEW campaign deal + chat opens.
  //
  // A direct invitation is an ordinary campaign deal with a different start (Ravi, session 26):
  // instead of "brand publishes -> creator applies -> brand shortlists", the brand invites and the
  // creator accepts. From here on it is the normal campaign flow — same `deals` row, same
  // `thread_camp_<dealId>` thread, same negotiation / signing / secure payment hold routes.
  //
  //   WHO   only the invited creator.
  //   WHEN  only while the invite is still pending. Accepting twice returns the same chat;
  //         a declined invite cannot be accepted.
  //
  // Every invite gets its OWN deal and chat — never an older thread between the same two people.
  // Re-using one used to rewrite a finished (or paid) deal back to NEGOTIATING.
  //
  // Opening messages, oldest first:
  //   1. creator  — short automatic thank-you (plain text, marked automated)
  //   2. brand    — `brand_invitation_offer` card: the brand's fee, deliverables, timeline and pitch.
  //                 Accept / Negotiate belong to the CREATOR (the mirror of `creator_application_offer`,
  //                 whose buttons belong to the brand). The brand never has to accept its own number.
  router.post(["/creators/invitations/:id/accept", "/creator/invitations/:id/accept"], async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const db = getDb();
    db.brief_requests = db.brief_requests || [];
    db.chat_threads = db.chat_threads || [];
    db.chat_messages = db.chat_messages || [];
    db.notifications = db.notifications || [];

    const invite = await loadInvite(req.params.id);
    if (!invite) {
      return res.status(404).json({ error: "Campaign invitation not found." });
    }
    // The status as stored — the claim below is guarded on exactly this value.
    const storedStatus = String(invite.status || INVITE_PENDING);
    if (isStaleAccepting(invite)) invite.status = INVITE_PENDING;

    // WHO: the invited creator only (not an admin, not the brand).
    if (!(await isMyInvite(invite, user))) {
      return res.status(403).json({ error: "Not authorized to accept this invitation." });
    }

    // WHEN
    const current = String(invite.status || INVITE_PENDING);
    // v414: a withdrawn invite → 409; a pending one older than 14 days → 410.
    if (isInviteWithdrawn(invite)) {
      return res.status(409).json({ error: "The brand withdrew this invitation.", code: "INVITE_WITHDRAWN", status: INVITE_WITHDRAWN });
    }
    if (current === INVITE_PENDING && isInviteExpired(invite)) {
      return res.status(410).json({ error: "This invitation has expired. Ask the brand to send a new one.", code: "INVITE_EXPIRED", status: "expired" });
    }
    if (current === "accepted" && invite.thread_id) {
      return res.json({ success: true, status: "accepted", thread_id: invite.thread_id, message: "Invitation already accepted." });
    }
    if (current === INVITE_ACCEPTING) {
      return res.status(409).json({ error: "This invitation is already being accepted. Please wait a moment.", code: "INVITE_BUSY" });
    }
    if (current !== INVITE_PENDING) {
      return res.status(409).json({ error: "This invitation is no longer open.", code: "INVITE_CLOSED", status: current });
    }

    const amount = inviteAmount(invite);
    if (!amount) {
      return res.status(409).json({ error: "This invitation has no fee. Ask the brand to send a new invitation with a budget.", code: "INVITE_NO_AMOUNT" });
    }

    // Claim the invite so a double tap — or two server instances — cannot open two deals.
    // Locally synchronous; in Supabase a guarded update that only one caller can win.
    invite.status = INVITE_ACCEPTING;
    const nowIso = getIsoNow();
    const originalStatus = current;
    {
      const claim = await writeInvite(invite.id, { status: INVITE_ACCEPTING, updated_at: nowIso }, storedStatus);
      if (!claim.ok) {
        invite.status = originalStatus;
        if (claim.error === "STATUS_CHANGED") {
          const fresh = await loadInvite(invite.id);
          if (fresh?.status === "accepted" && fresh?.thread_id) {
            return res.json({ success: true, status: "accepted", thread_id: fresh.thread_id, message: "Invitation already accepted." });
          }
          return res.status(409).json({ error: "This invitation is already being accepted or is no longer open.", code: "INVITE_BUSY" });
        }
        console.error("[invite accept] claim failed:", claim.error);
        return res.status(500).json({ error: "Could not accept the invitation. Please try again." });
      }
    }
    const releaseClaim = async () => {
      invite.status = INVITE_PENDING;
      await writeInvite(invite.id, { status: INVITE_PENDING, updated_at: getIsoNow() }, INVITE_ACCEPTING);
    };
    // The logged-in creator is the party — an invite matched by email may carry an old
    // unclaimed-profile id.
    const creatorId = user.user_id;
    const brandId = invite.brand_id;
    // v414: masked — this text goes straight into the chat's offer card.
    const title = maskContactDetails(String(invite.campaign_title || "").trim()) || "Campaign Collaboration";
    const timeline = formatInviteTimeline(invite.timeline);
    const deliverables = maskContactDetails(String(invite.deliverables || "").trim()) || null;
    const pitch = maskContactDetails(String(invite.pitch || invite.message || "").trim()) || null;
    const brandName = invite.brand_name || "Brand Partner";
    const creatorName = invite.creator_name || user.name || "Creator";

    // v414: the invite's campaign (brief_requests has no campaign_id: the brand's one campaign with exactly
    // this title) is stored on the deal and thread, so the "already in this campaign" check sees invite deals.
    // If an open deal chat already exists between them for that campaign, that chat is returned instead of a new one.
    const client = privilegedSupabase || supabase;
    let inviteCampaignId: string | null = null;
    try {
      const wantTitle = String(invite.campaign_title || "").trim().toLowerCase();
      if (wantTitle && wantTitle !== "campaign collaboration") {
        let camps: any[] = [];
        if (client) {
          const { data } = await client.from("campaigns").select("campaign_id, title").eq("brand_user_id", brandId).limit(500);
          camps = Array.isArray(data) ? data : [];
        } else {
          camps = (db.campaigns || []).filter((c: any) => String(c.brand_user_id) === String(brandId));
        }
        const hits = camps.filter((c: any) => String(c.title || "").trim().toLowerCase() === wantTitle);
        if (hits.length === 1 && hits[0].campaign_id) inviteCampaignId = String(hits[0].campaign_id);
      }
      if (inviteCampaignId) {
        let thrs: any[] = [];
        if (client) {
          const { data } = await client.from("chat_threads").select("id, deal_id, status, flow_state").eq("campaign_id", inviteCampaignId).eq("creator_id", creatorId).eq("brand_id", brandId).limit(20);
          thrs = Array.isArray(data) ? data : [];
        } else {
          thrs = (db.chat_threads || []).filter((t: any) => String(t.campaign_id) === inviteCampaignId && String(t.creator_id) === String(creatorId) && String(t.brand_id) === String(brandId));
        }
        const clash = campaignInviteConflict([], thrs);
        const open = clash?.thread_id ? thrs.find((t: any) => String(t.id) === clash.thread_id) : null;
        if (open) {
          const at = getIsoNow();
          await writeInvite(invite.id, { status: "accepted", accepted_at: at, updated_at: at, thread_id: open.id, deal_id: open.deal_id || null, accepted_by: creatorId });
          Object.assign(invite, { status: "accepted", accepted_at: at, updated_at: at, thread_id: open.id, deal_id: open.deal_id || null, accepted_by: creatorId });
          cacheInvite(invite);
          saveDb(db);
          return res.json({ success: true, status: "accepted", thread_id: open.id, deal_id: open.deal_id || null, existing: true, message: "You already have a chat with this brand for this campaign." });
        }
      }
    } catch (e) { logIgnored("creators_routes:invite-accept-campaign", e); }

    const dealId = crypto.randomUUID();
    const threadId = `thread_camp_${dealId}`;

    const greetingText = `Thanks for inviting me to "${title}"! Happy to discuss the details here.`;
    const offerText = `Glad to have you on board for "${title}". Our offer: ₹${amount.toLocaleString("en-IN")}.`;
    const greetingMsg: any = {
      message_id: crypto.randomUUID(),
      thread_id: threadId,
      sender_user_id: creatorId,
      receiver_user_id: brandId,
      sender_role: "creator",
      from_name: creatorName,
      text: greetingText,
      content: greetingText,
      message_type: "text",
      metadata: { automated: true, action: "invite_greeting", brief_request_id: invite.id },
      created_at: nowIso,
      read: false,
    };
    const offerMsg: any = {
      message_id: crypto.randomUUID(),
      thread_id: threadId,
      sender_user_id: brandId,
      receiver_user_id: creatorId,
      sender_role: "brand",
      from_name: brandName,
      text: offerText,
      content: offerText,
      message_type: "brand_invitation_offer",
      metadata: {
        action: "brand_invitation_offer",
        is_direct_invite: true,
        automated: true,
        brief_request_id: invite.id,
        thread_id: threadId,
        campaign_title: title,
        brand_name: brandName,
        proposed_fee: amount,
        amount,
        deliverable: deliverables,
        timeline,
        // Only what the brand actually wrote — never filler text.
        pitch,
        invited_at: invite.created_at || nowIso,
      },
      created_at: new Date(Date.now() + 1000).toISOString(),
      read: false,
    };

    const brandNotif: any = {
      notif_id: crypto.randomUUID(),
      user_id: brandId,
      type: "invitation_accepted",
      title: "Invitation accepted",
      message: `${creatorName} accepted your invitation for "${title}". The chat is open — reply to your offer there.`,
      redirect_path: `/chat/${threadId}`,
      read: false,
      created_at: nowIso,
    };

    try {
    if (client) {
      const { error: dealErr } = await client.from("deals").insert({
        id: dealId,
        application_id: null,
        campaign_id: inviteCampaignId, // v414: was always null
        creator_id: creatorId,
        brand_id: brandId,
        agreed_amount: amount,
        revision_count: 5,
        revisions_used: 0,
        status: "NEGOTIATING",
      });
      if (dealErr) {
        await releaseClaim();
        console.error("[invite accept] deals insert failed:", dealErr?.message || dealErr);
        return res.status(500).json({ error: "Could not open the deal. Please try again.", detail: dealErr?.message });
      }
      const { error: threadErr } = await client.from("chat_threads").insert({
        id: threadId,
        campaign_id: inviteCampaignId, // v414
        creator_id: creatorId,
        brand_id: brandId,
        deal_id: dealId,
        agreed_amount: amount,
        revision_count: 5,
        status: "NEGOTIATING",
        flow_state: "NEGOTIATING",
      });
      if (threadErr) {
        await releaseClaim();
        try { await client.from("deals").delete().eq("id", dealId); } catch (e) { logIgnored("creators_routes:invite-deal-rollback", e); }
        console.error("[invite accept] chat_threads insert failed:", threadErr?.message || threadErr);
        return res.status(500).json({ error: "Could not open the chat. Please try again.", detail: threadErr?.message });
      }
      if (insertChatMessageToSupabase) {
        await insertChatMessageToSupabase(greetingMsg);
        await insertChatMessageToSupabase(offerMsg);
      }
      // v416 (C26): an invite for one of the brand's campaigns puts the creator on that campaign's applicants
      // page as hired (ACCEPTED), linked to this deal. Non-fatal: the deal + chat are already open.
      if (inviteCampaignId) {
        try {
          const { data: appRows } = await client.from("campaign_applications").select("application_id, status").eq("campaign_id", inviteCampaignId).eq("creator_id", creatorId).limit(1);
          let appId: string | null = Array.isArray(appRows) && appRows[0]?.application_id ? String(appRows[0].application_id) : null;
          if (appId) {
            await client.from("campaign_applications").update({ status: "ACCEPTED" }).eq("application_id", appId);
          } else {
            appId = crypto.randomUUID();
            const { error: appErr } = await client.from("campaign_applications").insert({
              application_id: appId,
              campaign_id: inviteCampaignId,
              creator_id: creatorId,
              status: "ACCEPTED",
              pitch: null, // the creator wrote no pitch — they were invited
              proposed_amount: amount, // the brand's invite fee
              creator_location: null,
              creator_name: creatorName,
            });
            if (appErr) { appId = null; console.error("[invite accept] application row failed:", appErr?.message || appErr); }
          }
          if (appId) await client.from("deals").update({ application_id: appId }).eq("id", dealId);
        } catch (e) { logIgnored("creators_routes:invite-accept-application", e); }
      }
      try {
        const { notif_id, user_id, type, message, redirect_path } = brandNotif;
        await client.from("notifications").insert({ notif_id, user_id, type, message, redirect_path });
      } catch (e) { logIgnored("creators_routes:invite-accept-notif", e); }
    } else {
      // No Supabase (tests / local dev): the same records in the local store.
      db.deals = db.deals || [];
      db.deals.push({ id: dealId, campaign_id: inviteCampaignId, creator_id: creatorId, brand_id: brandId, agreed_amount: amount, revision_count: 5, revisions_used: 0, status: "NEGOTIATING", created_at: nowIso });
      db.chat_threads.push({
        id: threadId,
        campaign_id: inviteCampaignId, // v414
        creator_id: creatorId,
        brand_id: brandId,
        deal_id: dealId,
        deal_type: "CAMPAIGN",
        agreed_amount: amount,
        revision_count: 5,
        status: "NEGOTIATING",
        flow_state: "NEGOTIATING",
        campaign_title: title,
        brief_request_id: invite.id,
        created_at: nowIso,
        updated_at: nowIso,
      });
      db.chat_messages.push(greetingMsg, offerMsg);
      db.notifications.push(brandNotif);
    }
    } catch (e: any) {
      // Never leave the invite stuck half-accepted.
      await releaseClaim();
      console.error("[invite accept] failed:", e?.message || e);
      return res.status(500).json({ error: "Could not open the chat. Please try again." });
    }

    invite.status = "accepted";
    invite.accepted_at = nowIso;
    invite.updated_at = nowIso;
    invite.thread_id = threadId;
    invite.deal_id = dealId;
    invite.accepted_by = creatorId;
    {
      const done = await writeInvite(invite.id, {
        status: "accepted", accepted_at: nowIso, updated_at: nowIso,
        thread_id: threadId, deal_id: dealId, accepted_by: creatorId,
      });
      // The deal and chat exist now; a failed status write is logged, not undone.
      if (!done.ok) console.error("[invite accept] could not mark the invite accepted:", done.error);
    }
    cacheInvite(invite);
    saveDb(db);

    const io = req.app?.get?.("io");
    if (io) {
      io.to(threadId).emit("new_message", greetingMsg);
      io.to(threadId).emit("new_message", offerMsg);
      emitThreadEvent(io, "thread_updated", { threadId, last_message: offerMsg });
    }

    return res.json({
      success: true,
      status: "accepted",
      thread_id: threadId,
      deal_id: dealId,
      message: "Invitation accepted! The chat is open."
    });
  });

  // 3. POST /creators/invitations/:id/decline -> creator declines invite with reason
  router.post(["/creators/invitations/:id/decline", "/creator/invitations/:id/decline"], async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const db = getDb();
    db.brief_requests = db.brief_requests || [];
    db.notifications = db.notifications || [];

    const invite = await loadInvite(req.params.id);
    if (!invite) {
      return res.status(404).json({ error: "Campaign invitation not found." });
    }

    // WHO: the invited creator (or an admin).
    if (!(await isMyInvite(invite, user)) && user.role !== "admin") {
      return res.status(403).json({ error: "Not authorized to decline this invitation." });
    }
    // WHEN: only a pending invite. An accepted one already has a live deal — declining it
    // used to mark it "declined" while its chat stayed open.
    const currentStatus = String(invite.status || INVITE_PENDING);
    if (isInviteWithdrawn(invite)) { // v414
      return res.status(409).json({ error: "The brand withdrew this invitation.", code: "INVITE_WITHDRAWN", status: INVITE_WITHDRAWN });
    }
    if (currentStatus === "creator_declined") {
      return res.json({ success: true, status: "creator_declined", reason: invite.decline_reason, message: "Invitation already declined." });
    }
    if (currentStatus !== INVITE_PENDING) {
      return res.status(409).json({ error: "This invitation is no longer open.", code: "INVITE_CLOSED", status: currentStatus });
    }

    // v414: the reason goes to the brand — contact details masked; and it can't pose as a brand withdrawal.
    const declineReason = maskContactDetails(String(req.body?.reason || req.body?.decline_reason || req.body?.custom_reason || "Not specified").trim().slice(0, 300)).replace(new RegExp(`^${WITHDRAWN_REASON}`, "i"), "Declined") || "Not specified";
    const nowIso = getIsoNow();

    const declined = await writeInvite(invite.id, {
      status: "creator_declined", decline_reason: declineReason, declined_at: nowIso, updated_at: nowIso,
    }, INVITE_PENDING);
    if (!declined.ok) {
      if (declined.error === "STATUS_CHANGED") {
        return res.status(409).json({ error: "This invitation is no longer open.", code: "INVITE_CLOSED" });
      }
      console.error("[invite decline] write failed:", declined.error);
      return res.status(500).json({ error: "Could not decline the invitation. Please try again." });
    }
    invite.status = "creator_declined";
    invite.decline_reason = declineReason;
    invite.declined_at = nowIso;
    invite.updated_at = nowIso;
    cacheInvite(invite);

    // Notify brand with reason without creating any chat thread
    const brandNotif = {
      notif_id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      user_id: invite.brand_id,
      type: "invitation_declined",
      title: "Campaign Invitation Declined",
      message: `${invite.creator_name || user.name} has declined your invitation for "${invite.campaign_title}". Reason: ${declineReason}`,
      data: { brief_id: invite.id, reason: declineReason },
      read: false,
      created_at: nowIso,
    };
    db.notifications.push(brandNotif);
    const notifClient = privilegedSupabase || supabase;
    if (notifClient) {
      try {
        await notifClient.from("notifications").insert({
          notif_id: crypto.randomUUID(),
          user_id: invite.brand_id,
          type: "invitation_declined",
          message: brandNotif.message,
        });
      } catch (e) { logIgnored("creators_routes:invite-decline-notif", e); }
    }

    saveDb(db);

    return res.json({
      success: true,
      status: "creator_declined",
      reason: declineReason,
      message: "Invitation declined successfully. The brand has been notified."
    });
  });


  // v416 (C5): the brand's own sent invitations (newest first), so the panel can list them with a Withdraw
  // button — the duplicate-invite message says "withdraw that invitation first" and there was no list.
  router.get(["/brands/invitations", "/brand/invitations"], async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    if (!isBrandLike(user.role)) return res.status(403).json({ detail: "Only brand accounts have sent invitations." });
    const myBrand = String(getActingBrandId(user) || "");
    const byId = new Map<string, any>();
    let loadFailed = false;
    if (inviteClient) {
      try {
        const { data, error } = await inviteClient.from("brief_requests").select("*").eq("brand_id", myBrand).order("created_at", { ascending: false }).limit(200);
        if (error) loadFailed = true;
        for (const r of data || []) if (r?.id) byId.set(String(r.id), r);
      } catch (e) { loadFailed = true; logIgnored("creators_routes:brand-invite-list", e); }
    }
    for (const b of getDb().brief_requests || []) if (String(b?.brand_id) === myBrand && b?.id && !byId.has(String(b.id))) byId.set(String(b.id), b);
    if (loadFailed && byId.size === 0) return res.status(503).json({ error: "Couldn't load your invitations. Please try again." });
    const invitations = Array.from(byId.values())
      .sort((a: any, b: any) => String(b?.created_at || "").localeCompare(String(a?.created_at || "")))
      .map((inv: any) => ({
        id: inv.id,
        creator_id: inv.creator_id || null,
        creator_name: inv.creator_name || "Creator",
        campaign_title: maskContactDetails(inv.campaign_title) || "Campaign Collaboration",
        amount: inviteAmount(inv) || null,
        status: inviteViewStatus(inv), // pending_creator_acceptance / accepted / creator_declined / expired / withdrawn
        can_withdraw: inviteViewStatus(inv) === INVITE_PENDING,
        thread_id: inv.thread_id || null,
        created_at: inv.created_at || null,
      }));
    return res.json({ success: true, invitations });
  });

  // v414: a brand (owner or a team member, via parent_brand_id) withdraws its own PENDING invite. Stored as
  // "creator_declined" + reason "Withdrawn by brand" (see directInvites.ts); shown as "withdrawn".
  router.post("/brands/invitations/:id/withdraw", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const invite = await loadInvite(req.params.id);
    if (!invite) return res.status(404).json({ error: "Campaign invitation not found." });
    const myBrand = String(getActingBrandId(user) || "");
    if (!myBrand || (String(invite.brand_id) !== myBrand && String(invite.brand_id) !== String(user.user_id))) {
      return res.status(403).json({ error: "Not authorized to withdraw this invitation." });
    }
    if (isInviteWithdrawn(invite)) return res.json({ success: true, status: INVITE_WITHDRAWN, message: "Invitation already withdrawn." });
    if (String(invite.status || INVITE_PENDING) !== INVITE_PENDING) {
      return res.status(409).json({ error: "Only a pending invitation can be withdrawn.", code: "INVITE_CLOSED", status: inviteViewStatus(invite) });
    }
    const nowIso = getIsoNow();
    const done = await writeInvite(invite.id, { status: INVITE_DECLINED, decline_reason: WITHDRAWN_REASON, declined_at: nowIso, updated_at: nowIso }, INVITE_PENDING);
    if (!done.ok) {
      if (done.error === "STATUS_CHANGED") return res.status(409).json({ error: "This invitation is no longer open.", code: "INVITE_CLOSED" });
      console.error("[invite withdraw] write failed:", done.error);
      return res.status(500).json({ error: "Could not withdraw the invitation. Please try again." });
    }
    Object.assign(invite, { status: INVITE_DECLINED, decline_reason: WITHDRAWN_REASON, declined_at: nowIso, updated_at: nowIso });
    cacheInvite(invite);
    saveDb(getDb());
    return res.json({ success: true, status: INVITE_WITHDRAWN, message: "Invitation withdrawn." });
  });

  router.get("/agency/creators", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const db = getDb();
    const actingId = getActingBrandId(user);
    const list = db.creator_profiles.filter((c) => c.managed_by_agency_id === actingId);
    res.json(list);
  });


  router.post("/agency/creators", async (req, res, next) => {
    // Session 58: not a live feature — any signed-in user could create "verified" creators with made-up numbers
    // (score 92, Flipkart / Nykaa as past brands) that showed publicly. Off.
    return res.status(503).json({ error: "Managing creators from an agency account isn't available yet.", code: "AGENCY_COMING_SOON" });
  });
  // The old handler is kept below for reference only — it is never registered as a route.
  void (async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const userTeamRole = user.team_role || "admin";
    if (userTeamRole === "viewer") {
      return res.status(403).json({ detail: "Viewer role is read-only and cannot add creators to portfolio." });
    }

    const db = getDb();
    const actingId = getActingBrandId(user);
    const body = req.body;

    const cid = `creator_managed_${Math.random().toString(36).substring(2, 11)}`;
    const newProfile = {
      user_id: cid,
      name: body.name || "Managed Talent",
      email: body.email || `managed.${cid}@agency.demo`,
      picture: body.photo || "",
      photo: body.photo || "",
      bio: body.bio || "Professional creator managed under our talent agency portfolio.",
      category: body.category || "Lifestyle",
      sub_categories: [body.category || "Lifestyle"],
      city: body.city || "",
      state: body.state || "",
      languages: body.languages || ["Hindi", "English"],
      gender: body.gender || "female",
      instagram: body.instagram || `@${(body.name || "talent").replace(/\s+/g, "").toLowerCase()}`,
      youtube: body.youtube || `${body.name || "Talent"} Youtube Channel`,
      followers_instagram: parseInt(body.followers_instagram) || 45000,
      followers_youtube: parseInt(body.followers_youtube) || 12000,
      rate_card: body.rate_card || { reel: 8000, story: 15000, yt_video: 15000 },
      barter: body.barter || "barter_ok",
      payment_terms: "within_30_days",
      portfolio: body.photo ? [body.photo] : [],
      past_brands: ["Flipkart", "Nykaa"],
      work_mode: "active",
      engagement_rate: 4.8,
      fake_follower_pct: 0.9,
      avg_views_30d: 15000,
      performance_score: 92,
      managed_by_agency_id: actingId,
      created_at: getIsoNow(),
    };

    db.creator_profiles.push(newProfile);
    
    // If they aren't registered as a full user yet, let's also register a placeholder user profile for routing safety
    db.users.push({
      user_id: cid,
      email: newProfile.email,
      name: newProfile.name,
      role: "creator",
      picture: newProfile.photo,
      onboarded: true,
      verified: true,
      created_at: getIsoNow()
    });

    logTeamActivity(db, user, "Add Portfolio Creator", `Published managed portfolio for creator '${newProfile.name}'`);
    saveDb(db);

    res.json(newProfile);
  });


  router.post("/creators/work-mode", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || user.role !== "creator") {
      return res.status(403).json({ detail: "Only creator profiles can toggle their availability status" });
    }

    const { work_mode } = req.body;
    if (!["active", "away"].includes(work_mode)) {
      return res.status(400).json({ detail: "Invalid work_mode structure. Must be 'active' or 'away'" });
    }

    const db = getDb();
    const cp = db.creator_profiles.find((p) => p.user_id === user.user_id);
    if (cp) {
      cp.work_mode = work_mode;
    }
    
    const usr = db.users.find((u) => u.user_id === user.user_id);
    if (usr) {
      usr.work_mode = work_mode;
    }

    saveDb(db);
    res.json({ ok: true, work_mode });
  });

  // Session 58: how many creator profiles wait for review (the onboarding "review ETA"). The browser used to count
  // this straight from the database, which is no longer readable from the browser. Count only, no data.
  router.get("/creators/review-queue", async (_req, res) => {
    let count = 0;
    try {
      if (supabase) {
        const r = await (privilegedSupabase || supabase).from('creator_profiles').select('user_id', { count: 'exact', head: true }).eq('profile_status', 'under_review');
        count = Number(r?.count) || 0;
      }
    } catch (e) { logIgnored("creators_routes:reviewQueue", e); }
    res.set("Cache-Control", "public, max-age=300");
    return res.json({ count });
  });
  router.get("/creators/:user_id/profile", handleGetCreatorProfile);
  router.get("/creators/:user_id", handleGetCreatorProfile);
  router.get("/creators/me", handleGetCreatorsMe);
  router.get("/creator/me", handleGetCreatorsMe);
  router.get("/creator/profile", handleGetCreatorsMe);
}
