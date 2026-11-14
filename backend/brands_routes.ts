import bcrypt from "bcryptjs";
import { STAFF_TEAM_ROLES, newPasswordProblem, isAdminStaff } from "./authSecurity";
import { logIgnored } from "./logIgnored";
import { isBrandLike } from "./roleGuards"; // v416 (CR4): one shared brand-role check
import { emailChangeNeedsProof, takeContactProof, rememberContactProof } from "./contactProof"; // v423 (S1)
import express from "express";

// Brand-facing routes: public single-brand fetch, public brand-profile
// view, brand profile creation, team listing, and adding a team member.
// Plus 5 thin wrappers (brand KYC submit, and the various "my own brand
// profile" shortcut paths) whose real logic still lives in server.ts.

/** v396 (QA S-6): a website is http(s) or a bare domain — never javascript: / data: / any other scheme. Pure. */
export function safeWebsite(v: any): boolean {
  const t = String(v ?? "").trim();
  if (!t) return true;
  if (/^[a-z][a-z0-9+-]*:(?!\d)/i.test(t) && !/^https?:\/\//i.test(t)) return false; // a scheme (not "site.com:8080")
  return /^(https?:\/\/)?[^\s/$.?#].[^\s]*$/i.test(t);
}
export function setupBrandsRoutes(
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
    getActingBrandId,
    logTeamActivity,
    handleBrandKycSubmit: externalHandleBrandKycSubmit,
    handleGetBrandsMe: externalHandleGetBrandsMe,
    sanitizeBrandProfile,
    broadcastAdminNotification,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    syncEntityTags: (entityType: string, entityId: string, tags: any[]) => Promise<any>;
    processBase64Image: (imgUrl: string, bucket: string, user_id: string) => Promise<any>;
    getActingBrandId: (user: any) => any;
    logTeamActivity: (db: any, user: any, action: string, detail: string) => void;
    handleBrandKycSubmit?: (req: express.Request, res: express.Response) => any;
    handleGetBrandsMe?: (req: express.Request, res: express.Response) => any;
    sanitizeBrandProfile: (bp: any) => any;
    broadcastAdminNotification?: (payload: any) => Promise<any>;
  }
) {
  const getIsoNow = () => new Date().toISOString();

  const internalHandleBrandKycSubmit = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    // v423 (S5): same rule as company details — only the brand's admin (not any team member) submits KYC, because a
    // submit puts an approved brand back to "pending" and pauses its campaigns and payments.
    if (!isBrandLike(user.role)) return res.status(403).json({ detail: "Only brand accounts can submit brand KYC." });
    if ((user.team_role || (user.parent_brand_id ? "member" : "admin")) !== "admin") return res.status(403).json({ detail: "Only the brand's admin can submit KYC." }); // a team member with no role is a member

    const db = getDb();
    const actingId = getActingBrandId(user);
    const body = req.body || {};

    const companyName = body.companyName || body.company_name || user.name || "Brand";
    const gstNumber = (body.gstNumber || body.gstin || body.gst_number || body.gst_cert || "").trim().toUpperCase();
    const panNumber = (body.panNumber || body.brand_pan || body.pan_number || "").trim().toUpperCase();
    // v378 (QA L8): PAN / GSTIN format checked before the admin sees it.
    if (panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) return res.status(400).json({ detail: "PAN should look like ABCDE1234F (10 characters)." });
    if (gstNumber && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstNumber)) return res.status(400).json({ detail: "GSTIN should be 15 characters, like 22ABCDE1234F1Z5." });
    const incorporationType = body.incorporationType || body.incorporation_type || (gstNumber ? "registered_business" : "solo_brand");
    const businessProofDoc = body.businessProofDocumentUrl || body.business_proof_document_url || body.incorporation_proof || body.incorporationDocUrl || body.incorporation_doc_url || "";
    const gstCertDoc = body.gstCertificateUrl || body.gst_certificate_url || "";
    const panCardDoc = body.panCardUrl || body.pan_card_url || "";
    // v423 (S4): a KYC document must be a file THIS brand uploaded (/api/files/<id> owned by it, or its own
    // kyc-documents/<id>/… path). Another user's path or an outside link was opened by the admin panel with admin rights.
    {
      const owners = new Set([String(actingId), String(user.user_id)]);
      const docOk = async (ref: any): Promise<boolean> => {
        const r = String(ref || "").trim();
        if (!r) return true;
        const fileId = /^\/?api\/files\/([A-Za-z0-9_-]{4,80})$/.exec(r)?.[1];
        if (fileId) {
          const c = privilegedSupabase || supabase;
          if (!c) return true;
          const { data } = await c.from("files").select("user_id").eq("file_id", fileId).maybeSingle();
          return Boolean(data && owners.has(String(data.user_id)));
        }
        const m = /^(?:kyc-documents\/)?([A-Za-z0-9_-]{4,80})\/[A-Za-z0-9._-]{1,200}$/.exec(r);
        return Boolean(m && owners.has(m[1]));
      };
      for (const ref of [businessProofDoc, gstCertDoc, panCardDoc]) {
        if (!(await docOk(ref).catch(() => false))) return res.status(400).json({ detail: "Please upload your KYC documents again from this account." });
      }
    }
    const personName = body.personName || body.poc_name || body.authorized_person_name || user.name || "";
    const designation = body.designation || body.poc_designation || body.authorized_person_designation || "Brand Manager";
    const workEmail = body.workEmail || body.poc_email || body.work_email || user.email || "";
    const phone = body.phone || body.poc_phone || "";
    const websiteUrl = body.websiteUrl || body.website || body.website_url || "";
    if (websiteUrl && !safeWebsite(websiteUrl)) return res.status(400).json({ detail: "Please enter a valid website address." }); // v396 (QA S-6)

    const documents = {
      company_name: companyName,
      gst_cert: gstNumber,
      gstin: gstNumber,
      brand_pan: panNumber,
      pan_number: panNumber,
      incorporation_type: incorporationType,
      business_proof_document_url: businessProofDoc || null,
      incorporation_proof: businessProofDoc || null,
      incorporation_doc_url: businessProofDoc || null,
      gst_cert_url: gstCertDoc || null,
      gst_certificate_url: gstCertDoc || null,
      pan_card_url: panCardDoc || null,
      brand_pan_url: panCardDoc || null,
      poc_name: personName,
      poc_designation: designation,
      poc_email: workEmail,
      poc_phone: phone,
      website: websiteUrl,
      website_url: websiteUrl,
      uploaded_files: [businessProofDoc, gstCertDoc, panCardDoc].filter(Boolean),
      submitted_at: getIsoNow()
    };

    if (!db.verifications) db.verifications = [];
    const existingIndex = db.verifications.findIndex((v: any) => v.user_id === actingId && v.kind === "brand");
    
    const verificationDoc = {
      verification_id: existingIndex >= 0 ? db.verifications[existingIndex].verification_id : `ver_${Math.random().toString(36).substring(2, 10)}`,
      user_id: actingId,
      name: companyName,
      email: workEmail || user.email,
      photo: user.picture || "",
      kind: "brand",
      type: "Brand",
      category: "Brand",
      handle: websiteUrl,
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

    // Sync brand profile
    if (!db.brand_profiles) db.brand_profiles = [];
    let bp = db.brand_profiles.find((p: any) => p.user_id === actingId);
    if (!bp) {
      bp = { user_id: actingId, company_name: companyName };
      db.brand_profiles.push(bp);
    }
    bp.company_name = companyName;
    bp.verified = false;
    bp.verification_status = "PENDING";
    bp.website = websiteUrl;
    bp.phone = phone;

    // Sync users row
    const u = db.users?.find((u: any) => u.user_id === user.user_id || u.user_id === actingId);
    if (u) {
      u.kyc_status = "pending";
      // Session 58 (bug hunt): users.verified means EMAIL verified — setting it false here locked people out of password login.
    }

    if (supabase) {
      try {
        let mappedIncType = "pvt_ltd";
        if (["pvt_ltd", "llp", "partnership", "proprietorship"].includes(incorporationType)) {
          mappedIncType = incorporationType;
        } else if (incorporationType === "solo_brand") {
          mappedIncType = "proprietorship";
        } else {
          mappedIncType = "pvt_ltd";
        }

        await (privilegedSupabase || supabase).from('verifications').upsert({
          verification_id: verificationDoc.verification_id,
          user_id: verificationDoc.user_id,
          name: verificationDoc.name,
          email: verificationDoc.email,
          photo: verificationDoc.photo,
          kind: 'brand',
          documents: [verificationDoc.documents],
          status: 'pending',
          created_at: verificationDoc.created_at
        }, { onConflict: 'verification_id' });

        const { error: brandKycErr } = await (privilegedSupabase || supabase).from('brand_kyc').upsert({
          brand_id: actingId,
          company_name: companyName,
          gst_number: gstNumber || null,
          pan_number: panNumber || null,
          incorporation_type: mappedIncType,
          incorporation_doc_url: businessProofDoc || null,
          gst_certificate_url: gstCertDoc || null,
          pan_card_url: panCardDoc || null,
          authorized_person_name: personName,
          authorized_person_designation: designation,
          work_email: workEmail,
          phone: phone,
          website_url: websiteUrl || null,
          status: 'PENDING'
        }, { onConflict: 'brand_id' });
        // Session 41: Supabase returns errors instead of throwing — this one used to vanish silently.
        if (brandKycErr) { console.error("brand_kyc upsert failed:", brandKycErr.message || brandKycErr); throw brandKycErr; } // Session 58: don't answer "submitted"

        // Session 58 (bug hunt): users.verified means EMAIL verified — setting it false here locked people out of password login.
      } catch (err: any) {
        console.error("Error inserting Supabase brand KYC:", err);
        return res.status(500).json({ detail: "We couldn't save your KYC right now. Please try again in a minute.", code: "KYC_SAVE_FAILED" });
      }
    }

    if (broadcastAdminNotification) {
      broadcastAdminNotification({
        type: 'kyc_submitted',
        message: `Brand KYC submitted: ${companyName} (${workEmail})`,
        title: 'Pending Brand Verification',
        actor_id: actingId,
        metadata: { userId: actingId, name: companyName, email: workEmail, kind: 'brand' }
      }).catch(e => console.warn("Failed to broadcast KYC notification:", e));
    }

    saveDb(db);
    return res.json({ ok: true, status: "PENDING", verification: verificationDoc });
  };

  const internalHandleGetBrandsMe = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const actingId = getActingBrandId(user);
    const db = getDb();
    
    try {
      let bp = null;
      if (supabase) {
        const { data } = await supabase
          .from('brand_profiles')
          .select('*')
          .eq('user_id', actingId)
          .maybeSingle();
        bp = data;
      }
      if (!bp) {
        bp = db.brand_profiles?.find((p: any) => p.user_id === actingId);
      }

      if (bp) {
        const sanitized = sanitizeBrandProfile(bp);
        res.json({ ...sanitized, team_role: user.team_role || "admin" });
      } else {
        res.json({ team_role: user.team_role || "admin" });
      }
    } catch(err) {
      console.error(err);
      res.status(500).json({ detail: "Server error" });
    }
  };

  const handleBrandKycSubmit = externalHandleBrandKycSubmit || internalHandleBrandKycSubmit;
  const handleGetBrandsMe = externalHandleGetBrandsMe || internalHandleGetBrandsMe;
  router.get("/brand/top-performers", (req, res) => res.json([]));

  // Session 33: this route is public (/brand/:id page, profile modal) but returned the whole
  // brand_profiles row — POC email, phone, GST/PAN, bank — to anyone, logged in or not.
  // Others now get public fields only; the brand itself (and its team) and admins get the row.
  const PUBLIC_BRAND_FIELDS = ["id", "user_id", "company_name", "logo", "cover_image", "industry", "description",
    "website", "city", "state", "location", "team_size", "is_agency", "agency_type", "verified", "kyc_verified",
    "instagram", "instagram_handle", "linkedin", "twitter", "youtube", "created_at"];
  const publicBrand = (bp: any) => {
    const out: any = {};
    for (const k of PUBLIC_BRAND_FIELDS) if (bp && bp[k] !== undefined) out[k] = bp[k];
    return out;
  };
  // Session 40 (Ravi OK): "X campaigns done" on a campaign page. Public, counts only — the number
  // of distinct campaigns where this brand has at least one COMPLETED deal. No money, no names.
  router.get("/brands/:id/track-record", async (req, res) => {
    const id = String(req.params.id || "");
    if (!id) return res.status(400).json({ error: "Missing brand" });
    const doneIds = new Set<string>();
    const add = (rows: any[]) => (rows || []).forEach((d: any) => {
      if (String(d.status || "").toUpperCase() === "COMPLETED" && d.campaign_id) doneIds.add(String(d.campaign_id));
    });
    let fromSupabase = false;
    if (supabase) {
      try {
        const { data, error } = await (privilegedSupabase || supabase)
          .from('deals').select('campaign_id, status').eq('brand_id', id).eq('status', 'COMPLETED');
        if (!error && Array.isArray(data)) { add(data); fromSupabase = true; }
      } catch (e) { logIgnored("brands_routes:track-record", e); }
    }
    if (!fromSupabase) add((getDb().deals || []).filter((d: any) => String(d.brand_id) === id));
    res.json({ campaigns_done: doneIds.size });
  });

  router.get("/brands/:id", async (req, res) => {
    let { id } = req.params;
    const viewer = await parseAuthUser(req).catch(() => null);
    if (id === "me") {
      if (!viewer) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
      id = getActingBrandId(viewer);
    }
    const canSeeAll = (row: any) => Boolean(viewer && (isAdminStaff(viewer) || String(getActingBrandId(viewer)) === String(row?.user_id)));
    const shape = (row: any) => (canSeeAll(row) ? row : publicBrand(row));
    const db = getDb();
    if (supabase) {
      try {
        let { data } = await (privilegedSupabase || supabase)
          .from('brand_profiles')
          .select('*')
          .eq('user_id', id)
          .maybeSingle();
        if (!data) {
          const res = await (privilegedSupabase || supabase)
            .from('brand_profiles')
            .select('*')
            .ilike('company_name', String(id).replace(/[\\%_]/g, (m: string) => "\\" + m))
            .maybeSingle();
          if (res?.data) data = res.data;
        }
        if (data) {
          const sanitized = sanitizeBrandProfile(data);
          return res.json(shape(sanitized));
        }
      } catch (e) { logIgnored("brands_routes:259", e); }
    }
    const local = (db.brand_profiles || []).find((bp: any) => bp.user_id === id || bp.id === id || (bp.company_name && bp.company_name.toLowerCase() === id.toLowerCase()));
    if (local) {
      return res.json(shape(sanitizeBrandProfile(local)));
    }
    res.status(404).json({ error: "Brand profile not found" });
  });


  router.get("/brand-profile", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const actingId = getActingBrandId(user);


    const db = getDb();
    let bp = null;
    if (supabase) {
      const { data } = await (privilegedSupabase || supabase).from('brand_profiles').select('*').eq('user_id', actingId).maybeSingle();
      bp = data;
    }
    if (!bp) bp = db.brand_profiles?.find((p: any) => p.user_id === actingId);
    if (bp) {
      return res.json(sanitizeBrandProfile(bp));
    }
    return res.json({ team_role: user.team_role || "admin", company_name: user.name || "Brand" });
  });


  router.post("/brands/profile", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    // Session 58: only a brand account saves a brand profile (a creator could post here and change their role).
    if (!isBrandLike(user.role)) return res.status(403).json({ detail: "Only brand accounts can edit company details." });

    const body = req.body;
    const userTeamRole = user.team_role || "admin";
    if (userTeamRole !== "admin") {
      return res.status(403).json({ detail: "Only brand administrator (Admin) can modify company details." });
    }

    const actingId = getActingBrandId(user);

    // v378 (QA L9): basic checks on what is saved (empty name, 10,000-character fields, bad website).
    {
      const nm = body.company_name ?? body.companyName;
      if (nm !== undefined && !String(nm || "").trim()) return res.status(400).json({ detail: "Company name can't be empty." });
      for (const [k, max] of [["company_name", 120], ["companyName", 120], ["description", 2000], ["bio", 2000], ["industry", 80], ["website", 300], ["city", 80], ["state", 80]] as const) {
        if (body[k] !== undefined && body[k] !== null && String(body[k]).length > max) return res.status(400).json({ detail: `${k.replace(/_/g, " ")} is too long (max ${max} characters).` });
      }
      if (body.website && !safeWebsite(body.website)) return res.status(400).json({ detail: "Please enter a valid website address." }); // v396 (QA S-6): javascript: etc. refused
    }

    // v423 (S3): the POC email is not a login email, so it is no longer matched against every account's login
    // ("already in use by another account" told anyone whether an address is registered on Ybex).
    if (body.email !== undefined && body.email !== null && String(body.email).trim()) {
      const em = String(body.email).trim();
      if (em.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return res.status(400).json({ detail: "Please enter a valid email address." });
    }

    // v416 (CR1): a save only changes the fields the form sent. A partial save (or a settings screen that failed to
    // load) used to blank industry / website / description / logo / representative details that weren't in the body.
    let existingProfile: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('brand_profiles').select('*').eq('user_id', actingId).maybeSingle();
        existingProfile = data || null;
      } catch (e) { console.warn("[brands/profile] existing profile read failed:", (e as any)?.message || e); }
    } else {
      existingProfile = (getDb().brand_profiles || []).find((p: any) => p.user_id === actingId) || null;
    }
    const sent = (k: string) => body[k] !== undefined;
    const keep = (k: string, fallback: any) => (existingProfile && existingProfile[k] !== undefined && existingProfile[k] !== null ? existingProfile[k] : fallback);


    // v423 (S10): logo / cover must be an upload (data:image → our storage) or a file already in Ybex's own storage —
    // any outside URL was shown on public brand pages (tracking pixel, and the upload type / size checks skipped).
    const ownAsset = (v: any) => {
      const u = String(v || "").trim();
      if (!u || u.startsWith("data:image/") || u.startsWith("/api/files/")) return true;
      const bases = [process.env.SUPABASE_URL, process.env.VITE_SUPABASE_URL, process.env.SITE_URL, process.env.APP_URL, "https://ybexmedia.in"].filter(Boolean).map((x) => String(x).replace(/\/+$/, ""));
      try {
        const url = new URL(u);
        if (url.protocol !== "https:" && url.protocol !== "http:") return false;
        if (/(^|\.)googleusercontent\.com$/i.test(url.hostname)) return true; // the Google sign-in picture used as a first logo
        return bases.some((b) => { try { return new URL(b).host === url.host; } catch { return false; } });
      } catch { return false; }
    };
    const unchanged = (k: string) => String(body[k] || "").trim() === String(existingProfile?.[k] || "").trim(); // v423: an old saved image never blocks other edits
    if ((sent("logo") && !unchanged("logo") && !ownAsset(body.logo)) || (sent("cover_image") && !unchanged("cover_image") && !ownAsset(body.cover_image))) {
      return res.status(400).json({ detail: "Please upload the image from your device." });
    }
    // v423 (S1): a NEW business / POC email is also where contract-signing codes may go, so it must have been verified
    // on the server (a fresh /api/otp/verify by this user) — the browser-only OTP check could be skipped with the API.
    // Taken AFTER the other checks, and put back if the save fails, so a failed save never burns the verified code.
    const emailProofNeeded = sent("email") && emailChangeNeedsProof(body.email, existingProfile?.email, user.email);
    if (emailProofNeeded && !(await takeContactProof(String(user.user_id), String(body.email)))) {
      return res.status(403).json({ code: "EMAIL_NOT_VERIFIED", detail: "Please verify this email with the code we send before saving it." });
    }
    const cover_image = sent("cover_image") ? (body.cover_image || "") : keep("cover_image", "");
    
    let rawLogo = sent("logo") ? (body.logo || "") : keep("logo", user.picture || "");
    if (rawLogo && rawLogo.startsWith("data:image/")) {
      rawLogo = await processBase64Image(rawLogo, "brand-logos", actingId);
    }

    const sentName = body.company_name ?? body.companyName;
    const val = (k: string, fallback: any) => (sent(k) ? (body[k] || fallback) : keep(k, fallback)); // v416 (CR1)
    const raw = (k: string) => (sent(k) ? body[k] : keep(k, undefined)); // v416 (CR1)
    const profileData = {
      user_id: actingId,
      company_name: (sentName !== undefined && String(sentName || "").trim()) ? sentName : keep("company_name", user.name),
      industry: val("industry", ""),
      team_size: val("team_size", ""),
      website: val("website", ""),
      description: val("description", ""),
      logo: rawLogo,
      cover_image: cover_image,
      representative_name: raw("representative_name"),
      representative_designation: raw("representative_designation"),
      representative_mobile: raw("representative_mobile"),
      campaign_types: raw("campaign_types"),
      budget_range: raw("budget_range"),
      preferred_creator_size: raw("preferred_creator_size"),
      preferred_niches: raw("preferred_niches"),
      gender_focus: raw("gender_focus"),
      agency_mode: sent("agency_mode") ? Boolean(body.agency_mode) : Boolean(keep("agency_mode", false)),
      email: val("email", ""),
      // v363: city / state / social links were only written by a second browser-side call; when that failed they
      // were lost (0 of 4 brands have a city). The server saves them too — only when the form sent them.
      ...(body.city !== undefined ? { city: String(body.city || "").slice(0, 80) } : {}),
      ...(body.state !== undefined ? { state: String(body.state || "").slice(0, 80) } : {}),
      ...(body.youtube_url !== undefined ? { youtube_url: body.youtube_url ? String(body.youtube_url).slice(0, 300) : null } : {}),
      ...(body.linkedin_url !== undefined ? { linkedin_url: body.linkedin_url ? String(body.linkedin_url).slice(0, 300) : null } : {}),
      ...(body.twitter_url !== undefined ? { twitter_url: body.twitter_url ? String(body.twitter_url).slice(0, 300) : null } : {}),
      updated_at: getIsoNow(),
    };

    try {
      let profileError = null;
      if (supabase) {
        const supabaseBrandData = { ...profileData };
        delete supabaseBrandData.agency_mode;
        // cover_image is now a real column in Supabase, we do not delete it!
        const { data: existing } = await (privilegedSupabase || supabase).from('brand_profiles').select('user_id').eq('user_id', actingId).maybeSingle();
        // v416 (CR1): never write undefined columns (left out = unchanged)
        for (const k of Object.keys(supabaseBrandData)) if ((supabaseBrandData as any)[k] === undefined) delete (supabaseBrandData as any)[k];
        if (existing) {
          // v416 (CR1): update only what the form sent (even if the read above failed, nothing else is overwritten)
          const patch: any = { updated_at: (supabaseBrandData as any).updated_at };
          for (const k of Object.keys(supabaseBrandData)) {
            const wasSent = k === "company_name" ? sentName !== undefined && String(sentName || "").trim() !== "" : sent(k);
            if (wasSent) patch[k] = (supabaseBrandData as any)[k];
          }
          const { error } = await (privilegedSupabase || supabase).from('brand_profiles').update(patch).eq('user_id', actingId);
          profileError = error;
        } else {
          const { error } = await (privilegedSupabase || supabase).from('brand_profiles').insert(supabaseBrandData);
          profileError = error;
        }
      }
      if (profileError) {
        console.error("Error upserting brand profile in Supabase:", profileError.message || profileError);
        if (emailProofNeeded) await rememberContactProof(String(user.user_id), String(body.email)).catch(() => {}); // v423: the code stays usable for a retry
        return res.status(500).json({ error: "We couldn't save your company details right now. Please try again." }); // v423 (S7): no database detail to the user
      }

      // Update user document
      const isComplete = Boolean(body.onboarding_complete || body.onboarding_completed || user.onboarded);
      const updatePayload: any = {
        name: profileData.company_name,
        picture: profileData.logo,
      };
      if (isComplete) {
        updatePayload.onboarded = true;
      }
      
      // Session 58: the business / POC email and mobile stay on the brand profile only. They used to overwrite the
      // LOGIN email + phone (no OTP here), so an old POC email silently undid an Account → email change.
      // Login email / phone change only through /account (OTP-checked). Role can't be changed from here either.

      if (supabase) {
        console.log(`[BRAND PROFILE UPDATE] Syncing user data. actingId: ${actingId}, user.user_id: ${user.user_id}, logo: ${profileData.logo}`);
        
        const { error: userError } = await (privilegedSupabase || supabase)
          .from('users')
          .update(updatePayload)
          .eq('user_id', user.user_id);
          
        if (userError) {
          console.error("Error updating user onboard status in Supabase:", JSON.stringify(userError));
        }

        if (actingId) {
          const { error: actingUserError } = await (privilegedSupabase || supabase)
            .from('users')
            .update({ name: profileData.company_name, picture: profileData.logo })
            .eq('user_id', actingId);
          if (actingUserError) {
            console.error(`[BRAND PROFILE UPDATE] Error syncing to actingId ${actingId} user record:`, actingUserError);
          } else {
            console.log(`[BRAND PROFILE UPDATE] Successfully synchronized actingId ${actingId} user record`);
          }
        }

        // Cascade/Denormalize to all campaigns table rows for this brand
        const { error: campaignUpdateErr } = await (privilegedSupabase || supabase)
          .from('campaigns')
          .update({
            brand_name: profileData.company_name,
            brand_logo: profileData.logo
          })
          .eq('brand_user_id', actingId);
        if (campaignUpdateErr) {
          console.error("Error updating campaigns with new brand details:", campaignUpdateErr);
        }
      }

      if (supabase) {
         const { data: pendingVer } = await supabase
        .from('verifications')
        .select('verification_id')
        .eq('user_id', actingId)
        .eq('status', 'pending')
        .maybeSingle();

      if (!pendingVer) {
        await (privilegedSupabase || supabase).from('verifications').insert({
          verification_id: `ver_${Math.random().toString(36).substring(2, 10)}`,
          user_id: actingId,
          name: profileData.company_name,
          email: user.email,
          photo: profileData.logo || "",
          kind: "brand",
          category: profileData.industry || "D2C Brand",
          handle: profileData.website || "https://ybexmedia.in",
          followers: 0,
          documents: ["Corporate Registration"],
          note: "Auto-submitted during onboarding",
          status: "pending",
          created_at: getIsoNow(),
        });
      }
      }

      const db = getDb();
      if (!db.brand_profiles) db.brand_profiles = [];
      const bIdx = db.brand_profiles.findIndex((p: any) => p.user_id === actingId);
      if (bIdx > -1) db.brand_profiles[bIdx] = { ...db.brand_profiles[bIdx], ...profileData };
      else db.brand_profiles.push(profileData);

      const usr = db.users?.find((u: any) => u.user_id === user.user_id);
      if (usr) {
        usr.picture = profileData.logo;
        usr.photo = profileData.logo;
        usr.avatar = profileData.logo;
        usr.name = profileData.company_name;
        usr.onboarded = true;
        if (body.email !== undefined) usr.email = body.email;
        if (body.representative_mobile !== undefined) usr.phone = body.representative_mobile;
      }
      saveDb(db);
      // Universal Category & Niche Search Sync
      (async () => {
        try {
          const tagsToSync = [];
          if (profileData.industry) {
            tagsToSync.push({ name: profileData.industry, type: 'industry' as const });
          }
          if (profileData.preferred_niches) {
            const nichesArray = Array.isArray(profileData.preferred_niches)
              ? profileData.preferred_niches
              : typeof profileData.preferred_niches === 'string'
                ? profileData.preferred_niches.split(',').map(s => s.trim())
                : [];
            nichesArray.forEach(n => {
              if (n) tagsToSync.push({ name: n, type: 'niche' as const });
            });
          }
          if (Array.isArray(body.target_categories)) {
            body.target_categories.forEach((tc: string) => {
              if (tc) tagsToSync.push({ name: tc, type: 'target_category' as const });
            });
          }
          const uniqueTags = Array.from(
            new Map(tagsToSync.map(item => [item.name.toLowerCase() + '-' + item.type, item])).values()
          );
          if (uniqueTags.length > 0) {
            await syncEntityTags('brand_profile', actingId, uniqueTags);
          }
        } catch (e) {
          console.error("Error in brand profile tag sync:", e);
        }
      })();

      logTeamActivity(db, user, "Update Profile", `Updated brand company profile detail`);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ detail: "Server error" });
    }
  });


  router.get("/brands/team", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || !isBrandLike(user.role)) return res.status(403).json({ detail: "Not authorized", _status: 403 }); // v416 (CR4)

    const db = getDb();
    const actingId = getActingBrandId(user);
    const parentUser = db.users.find(u => u.user_id === actingId);
    
    // v423 (S15): each member gets only what the team list shows — no phone, login times or other account fields.
    const pick = (u: any) => ({ user_id: u.user_id, name: u.name || "", email: u.email || "", team_role: u.team_role || "member", created_at: u.created_at || null, picture: u.picture || "" });
    // Sub members
    const members: any[] = db.users
      .filter((u) => u.parent_brand_id === actingId)
      .map(pick);

    // Add primary owner/admin to list
    if (parentUser) {
      members.unshift({
        ...pick(parentUser),
        team_role: "admin",
        is_owner: true
      });
    }

    let logs = (db.team_activity_logs || [])
      .filter((l) => l.brand_user_id === actingId)
      .slice()
      .reverse();
    // Session 52: the saved log (team_activity_logs table) survives server restarts; merge it in.
    if (privilegedSupabase) {
      try {
        const { data, error } = await privilegedSupabase.from("team_activity_logs").select("*")
          .eq("brand_user_id", actingId).order("created_at", { ascending: false }).limit(200);
        if (!error && Array.isArray(data)) {
          const seen = new Set(data.map((l: any) => l.log_id));
          logs = [...data, ...logs.filter((l: any) => !seen.has(l.log_id))]
            .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
        }
      } catch { /* keep the in-memory list */ }
    }

    res.json({ members, logs });
  });


  router.post("/brands/team/add", async (req, res, next) => {
    // Session 58: team members aren't ready — members were saved only on one server's local copy (they vanished on the
    // next deploy), every role could spend money / sign, and nobody could be removed. Off until it is built properly.
    return res.status(503).json({ error: "Team members are coming soon. For now, share one brand login with your team.", code: "TEAM_COMING_SOON" });
  });
  // The old handler is kept below for reference only — it is never registered as a route.
  void (async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user || user.role !== "brand") return res.status(403).json({ detail: "Not authorized", _status: 403 });

    const userTeamRole = user.team_role || "admin";
    if (userTeamRole !== "admin") {
      return res.status(403).json({ detail: "Only Administrator (Admin) can add brand team managers." });
    }

    const { name, email, password, team_role } = req.body;
    if (!name || !email || !password || !team_role) {
      return res.status(400).json({ detail: "Name, email, password, and team role are required." });
    }
    // Session 25: a brand team role can never be an admin-staff role (it opened admin routes).
    // Session 43 (Ravi): "admin" is not offered to brand team members any more — it read like a Ybex
    // admin. Only the brand account itself is the brand's administrator.
    if (STAFF_TEAM_ROLES.includes(String(team_role).toLowerCase()) || String(team_role).toLowerCase() === "admin") {
      return res.status(400).json({ detail: "That team role isn't available for brand teams." });
    }
    const weakPw = newPasswordProblem(password);
    if (weakPw) return res.status(400).json({ detail: weakPw });

    const db = getDb();
    const existing = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return res.status(400).json({ detail: "This email address is already in use." });
    }

    const actingId = getActingBrandId(user);
    const newMemberId = `user_member_${Math.random().toString(36).substring(2, 12)}`;
    
    const newMember = {
      user_id: newMemberId,
      email: email.toLowerCase(),
      name,
      password_hash: await bcrypt.hash(String(password), 10), // session 25: was the password in plain text
      role: "brand",
      picture: "", // Session 58: was a stranger's stock photo
      auth_method: "email",
      created_at: getIsoNow(),
      onboarded: true,
      parent_brand_id: actingId,
      team_role,
    };

    db.users.push(newMember);
    
    logTeamActivity(db, user, "Add Team Member", `Added team member '${name}' with role '${team_role}'`);
    saveDb(db);

    res.json({ ok: true, member: { user_id: newMemberId, name, email, team_role } });
  });

  // v396 (summary "no role guard" item + Ravi's agency loophole check): a creator could submit BRAND KYC, which made a
  // brand_profiles row for them. Only brand accounts (and admins) now.
  const brandOnly = async (req: any, res: any, next: any) => {
    const u = await parseAuthUser(req).catch(() => null);
    if (!u) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const r = String(u.role || "").toLowerCase();
    if (!["brand", "agency", "talent_manager", "admin", "sub_admin"].includes(r) && u.team_role !== "sub_admin") return res.status(403).json({ detail: "Only brand accounts can submit brand KYC." });
    next();
  };
  router.post("/brand/kyc/submit", brandOnly, handleBrandKycSubmit);
  router.get("/brands/me", handleGetBrandsMe);
  router.get("/brand/me", handleGetBrandsMe);
  router.get("/brand/profile", handleGetBrandsMe);
}
