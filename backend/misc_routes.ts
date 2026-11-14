import { forcedMaintenance, forcedMaintenanceMessage } from "./forcedMaintenance"; // v421
import { verifyMediaKey } from "./mediaAccess";
import { logIgnored } from "./logIgnored";
import { APP_VERSION } from "../src/lib/appVersion"; // v431: newest version this server carries
import { resolveCreatorCoupon } from "./creatorCoupons";
import express from "express";
import { makeCreatorApplicationHandler } from "./creatorApplication";
import crypto from "crypto";
import sharp from "sharp";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { searchLocations } from "./locations";
import { PRIVATE_MEDIA_BUCKETS, isPrivateBucket } from "./mediaAccess";
import { shouldShrink, shrinkPhoto } from "./imageResize";
import { fileLooksLike, CHAT_ATTACHMENT_EXTS as CHAT_EXTS, CHAT_ATTACHMENT_TYPE_ERROR, chatAttachmentProblem } from "./fileMagic"; // v396 (QA S-5) · v417: one chat-attachment rule

// Session 48: helpers for the brand KYC page (GET /verifications/me).
const blank = (v: any) => v === null || v === undefined || String(v).trim() === "" || String(v).trim() === "—";
/** The newest brand KYC form copy kept in `verifications.documents` ({...} or [{...}]). */
export function pickBrandFormDocs(rows: any[]): any {
  for (const r of rows || []) {
    const d = r?.documents;
    const obj = Array.isArray(d) ? d.find((x: any) => x && typeof x === "object") : (d && typeof d === "object" ? d : null);
    if (obj && (obj.company_name || obj.gstin || obj.gst_cert || obj.brand_pan || obj.poc_name)) return obj;
  }
  return {};
}
/** Fill only the EMPTY fields of the brand_kyc answer: first from the form copy, then from the profile. */
export function fillBrandKycDocs(docs: any, form: any = {}, bp: any = null): any {
  const out: any = { ...(docs || {}) };
  const f = form || {};
  const p = bp || {};
  const want: Record<string, any[]> = {
    company_name: [f.company_name, p.company_name],
    gstin: [f.gstin, f.gst_cert, f.gst_number, p.gst_number, p.gstin],
    gst_cert: [f.gst_cert, f.gstin, f.gst_number, p.gst_number, p.gstin],
    brand_pan: [f.brand_pan, f.pan_number, p.pan_number],
    incorporation_proof: [f.incorporation_proof, f.business_proof_document_url, f.incorporation_doc_url],
    gst_certificate: [f.gst_certificate_url, f.gst_cert_url],
    pan_card: [f.pan_card_url, f.brand_pan_url],
    poc_name: [f.poc_name, p.representative_name, p.poc_name],
    poc_designation: [f.poc_designation, p.representative_designation, p.poc_designation],
    poc_email: [f.poc_email, f.work_email, p.email],
    poc_phone: [f.poc_phone, f.phone, p.representative_mobile, p.phone],
    website: [f.website, f.website_url, p.website],
  };
  for (const [k, list] of Object.entries(want)) {
    if (!blank(out[k])) continue;
    const v = list.find((x) => !blank(x));
    if (v !== undefined) out[k] = v;
  }
  return out;
}


// Miscellaneous small utility routes that didn't fit a bigger domain:
// public banners, user onboarding/profile-field updates, the public
// leaderboard, a system-status health summary, public creator-apply/
// waitlist signup (thin wrapper), platform fee-config (public read),
// support-style "reports" submission, a creator's own verification
// status, file upload (signed-url + direct multipart), file fetch by id,
// a cost-request quote action, the AI predict-ROI endpoint, and a
// location-search autocomplete.
// The only places the app asks for a signed upload URL (ChatBox, ContentProofNotice, mobile
// chat, UGC order screens). Anything else is refused.
export const SIGNED_UPLOAD_BUCKETS = ["content-submissions"];
export const SIGNED_UPLOAD_FOLDERS = ["ugc-videos/", "campaign-deliverables/", "chat-attachments/"];

export function checkSignedUploadTarget(bucket: any, filePath: any): { ok: boolean; error?: string } {
  const b = String(bucket || "");
  const p = String(filePath || "");
  if (!SIGNED_UPLOAD_BUCKETS.includes(b)) return { ok: false, error: "Uploads to this bucket are not allowed." };
  if (!SIGNED_UPLOAD_FOLDERS.some((f) => p.startsWith(f))) return { ok: false, error: "Uploads to this folder are not allowed." };
  if (p.length > 300 || p.includes("..") || p.includes("//") || p.includes("\\") || !/^[A-Za-z0-9._\/-]+$/.test(p)) {
    return { ok: false, error: "Invalid file path." };
  }
  // v396 (QA S-10): never a file a browser or phone would run (page, script, app installer)
  if (/\.(html?|svg|xml|xhtml|js|mjs|cjs|exe|bat|cmd|sh|php|jar|apk|msi|dll|scr|ps1|vbs)$/i.test(p)) return { ok: false, error: "This file type can't be uploaded." };
  return { ok: true };
}

// v414: chat attachments may only be allowed types. v417: images (jpg/png/webp/heic/heif/gif), MP4/MOV video and PDF
// only (backend/fileMagic.ts), max 50 MB — the same rule as the app.
export const CHAT_ATTACHMENT_EXTS = CHAT_EXTS;
export function checkChatAttachmentType(filePath: any, contentType?: any, size?: any): { ok: boolean; error?: string } {
  const p = String(filePath || "");
  if (!p.startsWith("chat-attachments/")) return { ok: true };
  const ext = (p.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] || "").toLowerCase();
  if (!CHAT_ATTACHMENT_EXTS.includes(ext)) return { ok: false, error: CHAT_ATTACHMENT_TYPE_ERROR };
  const problem = chatAttachmentProblem({ path: p, contentType, size }); // v417: claimed type + size too
  return problem ? { ok: false, error: problem } : { ok: true };
}
/** v414: the thread id in `chat-attachments/<threadId>-<timestamp>.<ext>`, or null for another shape. */
export function chatAttachmentThreadId(filePath: any): string | null {
  const m = String(filePath || "").match(/^chat-attachments\/([A-Za-z0-9_-]+)-\d{10,}\.[A-Za-z0-9]{1,8}$/);
  return m ? m[1] : null;
}

export function setupMiscRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    ensureBucketExists,
    getFullFeeAndReferralConfig,
    handlePublicCreatorApply: externalHandlePublicCreatorApply,
    upload,
    getSettings,
    getActingBrandId,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    ensureBucketExists: (bucketName: string, client: any) => Promise<any>;
    getFullFeeAndReferralConfig: () => Promise<any>;
    handlePublicCreatorApply?: (req: express.Request, res: express.Response) => any;
    upload: any;
    getSettings: (db: any) => any;
    getActingBrandId: (user: any) => any;
  }
) {
  const getIsoNow = () => new Date().toISOString();

  // Session 34 (Ravi): the public form only creates a waitlist row — never a creator profile, never
  // a change to an existing account. Approve / reject live in admin_waitlist_routes.ts.
  const internalHandlePublicCreatorApply = makeCreatorApplicationHandler({
    getClient: () => privilegedSupabase || null,
    getDb,
    saveDb,
  });

  const handlePublicCreatorApply = externalHandlePublicCreatorApply || internalHandlePublicCreatorApply;
  app.post("/api/public/creator-apply", handlePublicCreatorApply);
  app.post("/api/public/creators/apply", handlePublicCreatorApply);
  app.post("/api/waitlist", handlePublicCreatorApply);

  router.get("/banners", async (req, res) => {
    const user = await parseAuthUser(req).catch(() => null);
    const db = getDb();
    let allBanners = db.banners || [];

    if (privilegedSupabase || supabase) {
      try {
        const { data, error } = await (privilegedSupabase || supabase)
          .from('banners')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error && data && data.length > 0) {
          const mapped = data.map((b: any) => ({
            id: b.id,
            title: b.title || "Featured Promotion",
            description: b.description || "",
            tag: b.tag || "FEATURED",
            link: b.link_url || b.link || "/campaigns",
            imgUrl: b.image_url || b.imgUrl || b.image,
            image: b.image_url || b.imgUrl || b.image,
            status: b.active !== false && b.status !== "Paused" ? "Live" : (b.status || "Draft"),
            type: b.target_dashboard === "all" ? "Common" : (b.target_dashboard === "brand" ? "Brand" : "Influencer"),
            placement: b.placement || "Dashboard Hero Carousel",
            start_date: b.start_date || null,
            end_date: b.end_date || null,
            created_at: b.created_at
          }));
          allBanners = [...mapped, ...allBanners.filter(b => !mapped.some(m => m.id === b.id))];
        }
      } catch (e) {
        console.error("Error fetching Supabase banners in /banners:", e);
      }
    }

    const reqAudience = (req.query.audience as string || req.query.type as string || "").toLowerCase();
    const audienceType = reqAudience
      ? (reqAudience.includes("brand") ? "Brand" : "Influencer")
      : (user?.role === "brand" ? "Brand" : "Influencer");
    const now = new Date();

    const visible = allBanners.filter((b: any) => {
      const isLive = b.status === "Live" || b.status === "active" || b.active === true;
      if (!isLive) return false;
      const bType = (b.type || "").toLowerCase();
      const bTarget = (b.target_dashboard || "").toLowerCase();
      const isCommon = bType === "common" || bType === "both" || bType === "all" || bTarget === "all" || bTarget === "both";
      const isBrandMatch = audienceType === "Brand" && (bType === "brand" || bTarget === "brand");
      const isCreatorMatch = audienceType === "Influencer" && (bType === "influencer" || bType === "creator" || bTarget === "creator" || bTarget === "influencer");
      const isAudienceMatch = isCommon || isBrandMatch || isCreatorMatch;
      if (!isAudienceMatch) return false;
      if (b.start_date && new Date(b.start_date) > now) return false;
      if (b.end_date && new Date(b.end_date) < now) return false;
      return true;
    });

    res.json(visible);
  });


  router.put("/users/onboarding-update", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const db = getDb();
    const tUser = db.users.find(u => u.user_id === user.user_id);
    if (!tUser) return res.status(404).json({ detail: "User not found" });

    const { profile_completed, bank_details_added, kyc_verified, bank_name, bank_account, bank_ifsc } = req.body;

    if (profile_completed !== undefined) {
      tUser.profile_completed = profile_completed;
    }
    if (bank_details_added !== undefined) {
      tUser.bank_details_added = bank_details_added;
      if (bank_name) tUser.bank_name = bank_name;
      if (bank_account) tUser.bank_account = bank_account;
      if (bank_ifsc) tUser.bank_ifsc = bank_ifsc;
    }
    // v378 (QA M9): KYC "verified" is set only by an admin's KYC decision — a user can't mark themselves verified here.
    if (kyc_verified !== undefined && user.role === "admin") {
      tUser.kyc_verified = kyc_verified;
      if (user.role === "creator") {
        let cp = db.creator_profiles?.find(p => p.user_id === user.user_id);
        if (cp) {
          cp.verified = kyc_verified;
        } else {
          if (!db.creator_profiles) db.creator_profiles = [];
          db.creator_profiles.push({
            user_id: user.user_id,
            verified: kyc_verified,
            onboarding_complete: true,
            created_at: getIsoNow(),
            updated_at: getIsoNow()
          });
        }
      } else if (user.role === "brand") {
        let bp = db.brand_profiles?.find(p => p.user_id === user.user_id);
        if (bp) {
          bp.verified = kyc_verified;
        } else {
          if (!db.brand_profiles) db.brand_profiles = [];
          db.brand_profiles.push({
            user_id: user.user_id,
            verified: kyc_verified,
            created_at: getIsoNow(),
            updated_at: getIsoNow()
          });
        }
      }
    }

    saveDb(db);
    res.json({ success: true, user: tUser });
  });


  router.post("/users/profile/update", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const { name, picture } = req.body;
    const db = getDb();
    const tUser = db.users.find(u => u.user_id === user.user_id);

    if (tUser) {
      if (name) tUser.name = name;
      if (picture) tUser.picture = picture;
    }

    if (supabase) {
      try {
        const updateData: any = {};
        if (name) updateData.name = name;
        if (picture !== undefined) updateData.picture = picture;
        // Session 58: a failed save used to answer "success" (Settings showed "Profile updated").
        if (Object.keys(updateData).length) {
          const { error } = await (privilegedSupabase || supabase).from('users').update(updateData).eq('user_id', user.user_id);
          if (error) return res.status(502).json({ detail: "Couldn't save your profile right now. Please try again." });
        }
      } catch (err) {
        console.error("Error updating user profile in Supabase:", err);
        return res.status(502).json({ detail: "Couldn't save your profile right now. Please try again." });
      }
    }

    saveDb(db);
    res.json({ success: true });
  });


  // v445 (Ravi, unused-code report): /leaderboard + /leaderboard/me removed — the page had no menu link and the list
  // read every creator profile. Old app copies get a 404 and the route now redirects to Home.

  // v407 (Supabase logs: every app open / poll read maintenance_mode + 2 ephemeral rows, ~9,000 reads a day):
  // the live answer is reused for 10 s on this server copy. A maintenance switch shows within 10 s.
  let statusCache: { at: number; body: any } | null = null;
  // v431 (Ravi: "update diya, par kuch logo ke phone pe cache ki wajah se purana broken version hi chalta rehta hai"):
  // the page asks which version the server has; an older page moves itself to the new one (lib/staleBuild).
  // No database read — costs nothing on Supabase.
  router.get("/app-version", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ version: APP_VERSION });
  });

  router.get("/system-status", async (req, res) => {
    // v421 (Ravi, 10 Nov — Supabase blocked the free project): FORCE_MAINTENANCE=1 in the server env turns the
    // maintenance page on for everyone WITHOUT reading the database (works even when Supabase is down / blocked).
    if (forcedMaintenance()) {
      res.set("Cache-Control", "no-store");
      return res.json({ id: "singleton", creator_side_enabled: true, brand_side_enabled: true, maintenance_mode_creator: true, maintenance_mode_brand: true, message: forcedMaintenanceMessage(), forced: true });
    }
    if (statusCache && Date.now() - statusCache.at < 10000) { res.set("Cache-Control", "no-store"); return res.json(statusCache.body); }
    const db = getDb();
    const settings = getSettings(db);
    
    // Check if auto-off time has passed
    const now = new Date().getTime();
    if (settings.maintenance_mode_creator && settings.maintenance_creator_until) {
       if (now >= new Date(settings.maintenance_creator_until).getTime()) {
          settings.maintenance_mode_creator = false;
          settings.maintenance_creator_until = null;
          saveDb(db);
       }
    }
    if (settings.maintenance_mode_brand && settings.maintenance_brand_until) {
       if (now >= new Date(settings.maintenance_brand_until).getTime()) {
          settings.maintenance_mode_brand = false;
          settings.maintenance_brand_until = null;
          saveDb(db);
       }
    }

    let creatorEnabled = !!settings.maintenance_mode_creator;
    let brandEnabled = !!settings.maintenance_mode_brand;
    let message = settings.maintenance_message || "";
    let enabled_by = settings.maintenance_enabled_by || null;
    let enabled_at = settings.maintenance_enabled_at || null;

    const client = privilegedSupabase || supabase;
    if (client) {
      try {
        const { data, error } = await client
          .from('maintenance_mode')
          .select('*')
          .eq('id', 'singleton')
          .maybeSingle();
          if (!error && data) {
            // v378 (QA M12): Supabase is the one source of truth; auto-off is applied here too.
            const { applyMaintenanceAutoOff } = await import("./admin_system_maintenance_routes");
            const row = await applyMaintenanceAutoOff(client, data);
            // v378: the auto-off times too, so the maintenance page can say "Back by 4:30 PM IST"
            const { ephemeralGet } = await import("./ephemeralStore");
            const until = async (side: string) => { try { const v = await ephemeralGet(`maintenance:until:${side}`); return v?.until || null; } catch { return null; } };
            const [creator_until, brand_until] = await Promise.all([until("creator"), until("brand")]);
            res.set("Cache-Control", "no-store");
            const body = { ...row, maintenance_mode_creator: !!row.creator_side_enabled, maintenance_mode_brand: !!row.brand_side_enabled, creator_until, brand_until };
            statusCache = { at: Date.now(), body };
            return res.json(body);
          }
      } catch (err) {
        // ignore and fallback
      }
    }

    res.json({ 
      maintenance_mode_creator: creatorEnabled,
      maintenance_mode_brand: brandEnabled,
      message: message,
      enabled_by: enabled_by,
      enabled_at: enabled_at
    });
  });


  router.get("/platform/fee-config", async (req, res) => {
    const full: any = await getFullFeeAndReferralConfig();
    // v364 (Ravi: "creator ko poora paisa, 0% platform fee — ads mein jo bol rahe hain wo sach rahe"): in the split model
    // every creator-side preview (agreements, earnings, offer cards) shows the creator's own % (0 till Diwali); the brand
    // % is shown only on the brand's Review & pay (from POST /payments/quote).
    if (full?.fee_model === 'split') {
      const c = Number(full.creator_fee_pct ?? 0);
      return res.json({ ...full, below_threshold_rate: c, above_threshold_rate: c, offer_mode: false, fee_kind: "split", fee_label: c > 0 ? "Platform fee" : "0% platform fee", brand_fee_pct: Number(full.brand_fee_pct ?? 0) });
    }
    // Session 36: while the offer is on, every fee preview in the app (offer cards, agreements, earnings)
    // must show the convenience fee the deal will really get — so the public copy carries the offer rate.
    // The admin form reads /admin/fee-config, which keeps the normal rates.
    if (full?.offer_mode) {
      const pct = Number(full.offer_fee_pct ?? 2);
      const lineLive = full.offer_promo_line && (!full.offer_line_until || Date.parse(full.offer_line_until) > Date.now());
      return res.json({
        ...full, below_threshold_rate: pct, above_threshold_rate: pct, fee_kind: "convenience", fee_label: "Convenience fee & TDS", // v330: fee label (Ravi)
        // what users see: the admin's line + the real fee, joined by the app
        promo_line: lineLive ? `${full.offer_promo_line} · ₹0 platform fee, ${pct}% convenience fee` : `${full.offer_label || "Offer"}: ₹0 platform fee, ${pct}% convenience fee`,
      });
    }
    // Session 36: a signed-in creator with a coupon (auto launch offer or saved code) sees the fee the
    // coupon will give on their next funded deal — same numbers the payment will stamp.
    try {
      const viewer = await parseAuthUser(req);
      if (viewer && String(viewer.role || "").toLowerCase() === "creator") {
        const c: any = await resolveCreatorCoupon(privilegedSupabase || supabase, viewer.user_id);
        if (c && (c.type === "zero_fee" || c.type === "fee_rate_override" || c.type === "override_fee_rate")) {
          const pct = c.type === "zero_fee" ? 0 : Math.max(0, Number(c.override_fee_rate ?? 0));
          const name = c.referral ? "referral reward" : c.auto_apply ? "launch offer" : `creator code ${c.code}`;
          return res.json({
            ...full, below_threshold_rate: pct, above_threshold_rate: pct, fee_kind: "coupon",
            fee_label: `Convenience fee & TDS (${name} · deal ${c._dealNumber} of ${c._dealsTotal})`,
            coupon: { code: c.auto_apply ? null : c.code, auto: c.auto_apply === true, deal_number: c._dealNumber, deals_total: c._dealsTotal, valid_until: c.valid_until || null },
          });
        }
      }
    } catch { /* fall back to the normal fee */ }
    res.json({ ...full, fee_kind: "platform", fee_label: "Convenience fee & TDS" }); // v330: fee label (Ravi)
  });


  router.post("/reports", async (req, res) => {
    const user = await parseAuthUser(req);
    // Session 58: sign-in needed (anyone could flood the admin reports as "System Auto-detect"), sizes capped.
    if (!user) return res.status(401).json({ error: "Please sign in to send a report." });
    const db = getDb();
    const body = req.body || {};
    const type = String(body.type || "other").slice(0, 60);
    const severity = ["low", "medium", "high", "critical"].includes(String(body.severity)) ? String(body.severity) : undefined;
    const target = body.target == null ? null : String(body.target).slice(0, 120);
    const description = String(body.description || "").slice(0, 2000);

    const doc = {
      // Session 53: reports.report_id is a uuid column — "rep_xxx" made every insert fail, so no user
      // report ever reached the admin panel.
      report_id: crypto.randomUUID(),
      type,
      severity: severity || "medium",
      target,
      description: description || "",
      status: "open",
      reported_by: user ? user.user_id : "system",
      reported_by_name: user ? user.name : "System Auto-detect",
      created_at: getIsoNow(),
    };

    if (supabase) {
       try {
         let targetUserId = null;
         if (target && target.length > 5) {
            const { data: maybeUser } = await (privilegedSupabase || supabase).from('users').select('user_id').eq('user_id', target).maybeSingle();
            if (maybeUser) {
              targetUserId = maybeUser.user_id;
            }
         }
         // Session 35: the real reports columns (the old names — reporter_user_id, type, severity,
         // description … — do not exist, so no report was ever saved to the database).
         const { error } = await (privilegedSupabase || supabase).from('reports').insert({
           report_id: doc.report_id,
           reported_by: doc.reported_by,
           reported_by_name: doc.reported_by_name,
           target_type: type ? String(type) : null,
           target_id: targetUserId || (target ? String(target) : null),
           reason: [doc.severity && doc.severity !== "medium" ? `[${doc.severity}]` : "", description || ""].filter(Boolean).join(" ") || null,
           status: "open",
           created_at: doc.created_at
         });
         if (error) {
           console.error("Supabase reports insert error:", error);
         }
       } catch (e) {
         console.error("Supabase reports insert exception:", e);
       }
    }

    db.reports.push(doc);
    saveDb(db);
    res.json(doc);
  });


  router.get("/verifications/me", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const actingId = user.role === "brand" ? getActingBrandId(user) : user.user_id;

    if (supabase) {
      try {
        // For brands, brand_kyc is the authoritative compliance table
        if (user.role === "brand") {
          const { data: brandKycRow, error: bErr } = await (privilegedSupabase || supabase)
            .from('brand_kyc')
            .select('*')
            .eq('brand_id', actingId)
            .maybeSingle();

          if (bErr) {
            console.error("Error fetching brand_kyc in /verifications/me:", bErr);
          }

          if (brandKycRow) {
            // Session 48 (Ravi: "KYC page shows Not provided everywhere even though I filled it"): a
            // brand_kyc row can exist with empty fields (approved by an admin, or an older save that
            // only wrote the status). Fill every empty field from the brand's own KYC form copy in
            // `verifications` (and the profile for name / contact / website). Read-only; nothing saved.
            let formDocs: any = {};
            try {
              const { data: vb } = await (privilegedSupabase || supabase)
                .from('verifications').select('documents, created_at').eq('user_id', actingId)
                .order('created_at', { ascending: false }).limit(10);
              formDocs = pickBrandFormDocs(vb || []);
            } catch { /* optional */ }
            let bp: any = null;
            try {
              const { data } = await (privilegedSupabase || supabase).from('brand_profiles').select('*').eq('user_id', actingId).maybeSingle();
              bp = data;
            } catch { /* optional */ }
            return res.json({
              id: brandKycRow.id || `v_brand_${brandKycRow.brand_id}`,
              user_id: brandKycRow.brand_id,
              status: brandKycRow.status || 'PENDING',
              kind: 'brand',
              type: 'Brand',
              rejection_reason: brandKycRow.rejection_reason || brandKycRow.admin_note || "",
              admin_note: brandKycRow.admin_note || brandKycRow.rejection_reason || "",
              created_at: brandKycRow.submitted_at || brandKycRow.created_at,
              documents: fillBrandKycDocs({
                company_name: brandKycRow.company_name,
                gst_cert: brandKycRow.gst_number,
                gstin: brandKycRow.gst_number,
                brand_pan: brandKycRow.pan_number,
                incorporation_proof: brandKycRow.incorporation_doc_url,
                gst_certificate: brandKycRow.gst_certificate_url,
                pan_card: brandKycRow.pan_card_url,
                poc_name: brandKycRow.authorized_person_name,
                poc_designation: brandKycRow.authorized_person_designation,
                poc_email: brandKycRow.work_email,
                poc_phone: brandKycRow.phone,
                website: brandKycRow.website_url,
                social_url: brandKycRow.social_url
              }, formDocs, bp)
            });
          }
        }

        // Retrieve all rows for this user ordered by most recent first
        const { data: vRows, error: vErr } = await supabase
          .from('verifications')
          .select('*')
          .eq('user_id', actingId)
          .order('created_at', { ascending: false });

        if (vErr) {
          console.error("Error fetching from verifications table:", vErr);
        }

        // Fetch creator_kyc if creator, to ensure latest payout credentials take priority
        let creatorKycRow: any = null;
        if (user.role !== "brand") {
          const { data: cKyc } = await (privilegedSupabase || supabase)
            .from('creator_kyc')
            .select('*')
            .eq('creator_id', actingId)
            .maybeSingle();
          creatorKycRow = cKyc;
        }

        const realRow = vRows?.find((r: any) => {
          if (!r) return false;
          if (r.note === "Auto-submitted during onboarding") return false;
          if (!r.documents) return true;
          if (Array.isArray(r.documents)) {
            return !r.documents.includes("Onboarding Profile") && !r.documents.includes("Corporate Registration");
          }
          if (typeof r.documents === "string") {
            return !r.documents.includes("Onboarding Profile") && !r.documents.includes("Corporate Registration");
          }
          return true;
        });

        if (realRow || creatorKycRow) {
          // Session 41: brand KYC rows store documents as [ { ...fields } ] (an array with one
          // object). Reading it as an object gave every field "Not provided" on the phone KYC page.
          const rawDocs = realRow?.documents;
          const baseDocs = Array.isArray(rawDocs)
            ? (rawDocs.find((x: any) => x && typeof x === "object") || {})
            : (rawDocs && typeof rawDocs === "object" ? rawDocs : {});
          const mergedDocs = {
            ...baseDocs,
            ...(creatorKycRow ? {
              creator_name: creatorKycRow.full_name || baseDocs.creator_name,
              creator_dob: creatorKycRow.dob || baseDocs.creator_dob || '',
              creator_state: creatorKycRow.address || baseDocs.creator_state,
              creator_pan: creatorKycRow.pan_number || baseDocs.creator_pan,
              identity_num: creatorKycRow.pan_number || baseDocs.identity_num,
              creator_aadhaar: creatorKycRow.aadhaar_number || baseDocs.creator_aadhaar || '',
              bank_name: creatorKycRow.bank_name || baseDocs.bank_name || '',
              bank_account: creatorKycRow.bank_account_no || baseDocs.bank_account,
              bank_ifsc: creatorKycRow.bank_ifsc || baseDocs.bank_ifsc,
              bank_holder_name: creatorKycRow.bank_holder_name || baseDocs.bank_holder_name,
              upi_id: creatorKycRow.upi_id || baseDocs.upi_id,
              upi_qr_code_url: creatorKycRow.upi_qr_code_url || baseDocs.upi_qr_code_url,
              social_handle: creatorKycRow.instagram_handle || baseDocs.social_handle,
              followers: creatorKycRow.follower_count || baseDocs.followers,
              uploaded_files: [
                creatorKycRow.pan_card_url || baseDocs.uploaded_files?.[0],
                creatorKycRow.aadhaar_front_url || baseDocs.uploaded_files?.[1],
                creatorKycRow.aadhaar_back_url || baseDocs.uploaded_files?.[2],
                creatorKycRow.upi_qr_code_url || baseDocs.upi_qr_code_url || baseDocs.uploaded_files?.[3]
              ].filter(Boolean)
            } : {
              upi_qr_code_url: baseDocs.upi_qr_code_url || baseDocs.uploaded_files?.[3] || ""
            })
          };

          return res.json({
            id: realRow ? realRow.verification_id : `v_creator_${creatorKycRow.creator_id}`,
            user_id: actingId,
            status: creatorKycRow?.status || realRow?.status || 'PENDING',
            kind: realRow?.kind || (user.role === 'brand' ? 'brand' : 'creator'),
            type: realRow?.type || (user.role === 'brand' ? 'Brand' : 'Creator'),
            rejection_reason: creatorKycRow?.rejection_reason || realRow?.rejection_reason || realRow?.admin_note,
            admin_note: creatorKycRow?.admin_note || realRow?.admin_note,
            created_at: creatorKycRow?.submitted_at || realRow?.created_at,
            // Session 48: a brand's row with empty documents → take the newest filled form copy.
            documents: user.role === "brand" ? fillBrandKycDocs(mergedDocs, pickBrandFormDocs(vRows || [])) : mergedDocs
          });
        }

        // Fallback to role-specific tables if verifications row does not exist
        if (user.role === "brand") {
          const { data: brandKycRow, error } = await supabase
            .from('brand_kyc')
            .select('*')
            .eq('brand_id', actingId)
            .maybeSingle();

          if (error) {
            console.error("Error fetching brand_kyc:", error);
          }

          if (brandKycRow) {
            return res.json({
              id: `v_brand_${brandKycRow.brand_id}`,
              user_id: brandKycRow.brand_id,
              status: brandKycRow.status || 'PENDING',
              kind: 'brand',
              type: 'Brand',
              rejection_reason: brandKycRow.rejection_reason,
              admin_note: brandKycRow.admin_note,
              created_at: brandKycRow.created_at,
              documents: {
                company_name: brandKycRow.company_name,
                gst_cert: brandKycRow.gst_number,
                gstin: brandKycRow.gst_number,
                brand_pan: brandKycRow.pan_number,
                incorporation_proof: brandKycRow.incorporation_doc_url,
                poc_name: brandKycRow.authorized_person_name,
                poc_designation: brandKycRow.authorized_person_designation,
                poc_email: brandKycRow.work_email,
                poc_phone: brandKycRow.phone,
                website: brandKycRow.website_url,
                social_url: brandKycRow.social_url
              }
            });
          }
        } else {
          const { data: creatorKycRow, error } = await supabase
            .from('creator_kyc')
            .select('*')
            .eq('creator_id', actingId)
            .maybeSingle();

          if (error) {
            console.error("Error fetching creator_kyc:", error);
          }

          if (creatorKycRow) {
            return res.json({
              id: `v_creator_${creatorKycRow.creator_id}`,
              user_id: creatorKycRow.creator_id,
              status: creatorKycRow.status || 'PENDING',
              kind: 'creator',
              type: 'Creator',
              rejection_reason: creatorKycRow.rejection_reason,
              admin_note: creatorKycRow.admin_note,
              created_at: creatorKycRow.created_at,
              documents: {
                creator_name: creatorKycRow.full_name,
                creator_dob: creatorKycRow.dob || '',
                creator_state: creatorKycRow.address,
                creator_pan: creatorKycRow.pan_number,
                identity_num: creatorKycRow.pan_number,
                creator_aadhaar: creatorKycRow.aadhaar_number || '',
                bank_name: creatorKycRow.bank_holder_name || '',
                bank_account: creatorKycRow.bank_account_no,
                bank_ifsc: creatorKycRow.bank_ifsc,
                upi_id: creatorKycRow.upi_id,
                social_handle: creatorKycRow.instagram_handle,
                followers: creatorKycRow.follower_count,
                uploaded_files: [
                  creatorKycRow.pan_card_url,
                  creatorKycRow.aadhaar_front_url,
                  creatorKycRow.aadhaar_back_url
                ]
              }
            });
          }
        }
      } catch (err) {
        console.error("Critical error in /verifications/me:", err);
      }
    }

    // Fallback to local db if no supabase or not found
    const db = getDb();
    if (db) {
      if (user.role === "brand" && db.brand_kyc) {
        const brandKycRow = db.brand_kyc.find((b: any) => b.brand_id === actingId || b.id === actingId);
        if (brandKycRow) {
          return res.json({
            id: brandKycRow.id || `v_brand_${brandKycRow.brand_id}`,
            user_id: brandKycRow.brand_id,
            status: brandKycRow.status || 'PENDING',
            kind: 'brand',
            type: 'Brand',
            rejection_reason: brandKycRow.rejection_reason || brandKycRow.admin_note || "",
            admin_note: brandKycRow.admin_note || brandKycRow.rejection_reason || "",
            created_at: brandKycRow.submitted_at || brandKycRow.created_at,
            documents: {
              company_name: brandKycRow.company_name,
              gst_cert: brandKycRow.gst_number,
              gstin: brandKycRow.gst_number,
              brand_pan: brandKycRow.pan_number,
              incorporation_proof: brandKycRow.incorporation_doc_url,
              gst_certificate: brandKycRow.gst_certificate_url,
              pan_card: brandKycRow.pan_card_url,
              poc_name: brandKycRow.authorized_person_name,
              poc_designation: brandKycRow.authorized_person_designation,
              poc_email: brandKycRow.work_email,
              poc_phone: brandKycRow.phone,
              website: brandKycRow.website_url,
              social_url: brandKycRow.social_url
            }
          });
        }
      }

      if (db.verifications) {
        // Find latest verification for this user
        const vRows = db.verifications.filter(v => v.user_id === actingId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      let creatorKycRow = null;
      // @ts-ignore
      if (user.role !== "brand" && db.creator_kyc) {
         // @ts-ignore
         creatorKycRow = db.creator_kyc.find(c => c.creator_id === actingId);
      }

      const realRow = vRows.find((r) => {
        if (!r) return false;
        if (r.note === "Auto-submitted during onboarding") return false;
        if (!r.documents) return true;
        if (Array.isArray(r.documents)) {
          return !r.documents.includes("Onboarding Profile") && !r.documents.includes("Corporate Registration");
        }
        if (typeof r.documents === "string") {
          return !r.documents.includes("Onboarding Profile") && !r.documents.includes("Corporate Registration");
        }
        return true;
      });

      if (realRow || creatorKycRow) {
        const baseDocs = realRow?.documents || {};
        const mergedDocs = {
          ...baseDocs,
          ...(creatorKycRow ? {
            creator_name: creatorKycRow.full_name || baseDocs.creator_name,
            creator_dob: creatorKycRow.dob || baseDocs.creator_dob || '',
            creator_state: creatorKycRow.address || baseDocs.creator_state,
            creator_pan: creatorKycRow.pan_number || baseDocs.creator_pan,
            identity_num: creatorKycRow.pan_number || baseDocs.identity_num,
            creator_aadhaar: creatorKycRow.aadhaar_number || baseDocs.creator_aadhaar || '',
            bank_name: creatorKycRow.bank_name || baseDocs.bank_name || '',
            bank_account: creatorKycRow.bank_account_no || baseDocs.bank_account,
            bank_ifsc: creatorKycRow.bank_ifsc || baseDocs.bank_ifsc,
            bank_holder_name: creatorKycRow.bank_holder_name || baseDocs.bank_holder_name,
            upi_id: creatorKycRow.upi_id || baseDocs.upi_id,
            upi_qr_code_url: creatorKycRow.upi_qr_code_url || baseDocs.upi_qr_code_url,
            social_handle: creatorKycRow.instagram_handle || baseDocs.social_handle,
            followers: creatorKycRow.follower_count || baseDocs.followers,
            uploaded_files: [
              creatorKycRow.pan_card_url || baseDocs.uploaded_files?.[0],
              creatorKycRow.aadhaar_front_url || baseDocs.uploaded_files?.[1],
              creatorKycRow.aadhaar_back_url || baseDocs.uploaded_files?.[2],
              creatorKycRow.upi_qr_code_url || baseDocs.upi_qr_code_url || baseDocs.uploaded_files?.[3]
            ].filter(Boolean)
          } : {
            upi_qr_code_url: baseDocs.upi_qr_code_url || baseDocs.uploaded_files?.[3] || ""
          })
        };

        return res.json({
          status: realRow ? realRow.status : "pending",
          admin_note: realRow?.note || "",
          rejection_reason: realRow?.note || "",
          documents: mergedDocs
        });
      }
    }
  }

    // Default fallback is NOT_SUBMITTED when no record is found in live DB
    return res.json({
      status: "NOT_SUBMITTED",
      documents: {}
    });
  });


  router.post("/upload/signed-url", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const { bucket, path: filePath } = req.body || {};
    if (!bucket || !filePath) return res.status(400).json({ error: "bucket and path are required" });
    // This signs with the service-role key, which ignores storage policies. It used to sign an
    // upload to ANY bucket and ANY path the caller named (brand logos, KYC documents, other
    // users' files). Only the deliverable/attachment folders the app actually uploads to.
    const uploadCheck = checkSignedUploadTarget(bucket, filePath);
    if (!uploadCheck.ok) return res.status(400).json({ error: uploadCheck.error, code: "UPLOAD_TARGET_NOT_ALLOWED" });
    // v414: chat attachments — allowed file types only, and only into a chat the caller is part of.
    const typeCheck = checkChatAttachmentType(filePath, req.body?.contentType ?? req.body?.content_type, req.body?.size ?? req.body?.file_size); // v417: + type / 50 MB
    if (!typeCheck.ok) return res.status(400).json({ error: typeCheck.error, code: "UPLOAD_TYPE_NOT_ALLOWED" });
    const attThreadId = chatAttachmentThreadId(filePath);
    const isStaffUploader = ["admin", "sub_admin"].includes(String(user.role || "")) || user.team_role === "sub_admin";
    if (attThreadId && !isStaffUploader) {
      const me = new Set([String(user.user_id), String(user.parent_brand_id || user.user_id)]);
      let party: any = null;
      const pc = privilegedSupabase || supabase;
      try {
        if (pc) {
          const { data } = await pc.from("chat_threads").select("id, creator_id, brand_id").or(`id.eq.${attThreadId},deal_id.eq.${attThreadId}`).limit(1);
          party = (Array.isArray(data) ? data[0] : data) || null;
          if (!party && attThreadId.startsWith("ugcord_")) {
            const { data: o } = await pc.from("ugc_orders").select("creator_id, brand_id").eq("id", attThreadId).maybeSingle();
            party = o || null;
          }
        }
      } catch { party = null; }
      if (!party) {
        const db = getDb();
        party = (db.chat_threads || []).find((t: any) => t.id === attThreadId || t.deal_id === attThreadId)
          || (db.ugc_orders || []).find((o: any) => o.id === attThreadId) || null;
      }
      if (!party || (!me.has(String(party.creator_id)) && !me.has(String(party.brand_id)))) {
        return res.status(403).json({ error: "You can only attach files to your own chats.", code: "NOT_A_PARTICIPANT" });
      }
    }

    try {
      const activeSupabase = privilegedSupabase || supabase;
      if (!activeSupabase) throw new Error("Supabase is not configured on the server.");

      const { data, error } = await activeSupabase.storage
        .from(bucket)
        .createSignedUploadUrl(filePath, { upsert: false }); // never overwrite an existing file

      if (error) {
        throw new Error(error.message);
      }
      
      // content-submissions is private: the only way to open the file is the access-checked proxy.
      res.json({
        signedUrl: data.signedUrl,
        token: data.token,
        path: data.path,
        publicUrl: `/api/media?src=${encodeURIComponent(`${bucket}/${filePath}`)}`
      });
    } catch (e: any) {
      console.error("[Storage] createSignedUploadUrl error:", e);
      res.status(500).json({ error: e.message || "Failed to generate signed upload URL" });
    }
  });


  // Session 58: sign-in is checked BEFORE the file is read into memory (anyone could push big uploads into RAM),
  // and this route takes files up to 100 MB (videos go through signed upload links).
  const uploadGate = async (req: any, res: any, next: any) => {
    const u = await parseAuthUser(req).catch(() => null);
    if (!u) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    if (Number(req.headers["content-length"] || 0) > 100 * 1024 * 1024) return res.status(413).json({ detail: "This file is too large (max 100 MB)." });
    return next();
  };
  router.post("/upload", uploadGate, upload.single("file"), async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    let content_type = "";
    let original_filename = "";
    let size = 0;
    let buffer: Buffer | null = null;

    if (req.file) {
      content_type = req.file.mimetype;
      buffer = req.file.buffer;
      original_filename = req.file.originalname;
      size = req.file.size;
    } else if (req.body && req.body.base64Data) {
      const matches = req.body.base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        content_type = matches[1];
        const data_base64 = matches[2];
        buffer = Buffer.from(data_base64, 'base64');
        original_filename = req.body.filename || `upload-${Date.now()}`;
        size = buffer.length;
        // v396 (QA S-5): same rules as a normal upload — allowed type, real bytes of that type, max 100 MB
        if (size > 100 * 1024 * 1024) return res.status(413).json({ detail: "This file is too large (max 100 MB)." });
        if (!fileLooksLike({ buffer, mimetype: content_type })) {
          return res.status(400).json({ detail: "This file doesn't look like the type it claims to be. Please upload a real image, video or PDF.", code: "BAD_FILE" });
        }
        // the stored name follows the real type, never a typed ".exe"
        const typeExt: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "application/pdf": "pdf", "video/mp4": "mp4", "video/quicktime": "mov", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/webm": "webm", "application/msword": "doc", "image/heic": "heic", "image/heif": "heif" }; // v417: + HEIC/HEIF
        if (typeExt[content_type]) original_filename = `${String(original_filename).replace(/\.[^.]*$/, "").slice(0, 80) || "upload"}.${typeExt[content_type]}`;
      } else {
        return res.status(400).json({ detail: "Invalid base64 data" });
      }
    } else {
      return res.status(400).json({ detail: "No file uploaded" });
    }

    const file_id = `file_${Math.random().toString(36).substring(2, 15)}`;
    let ext = "bin";
    if (original_filename.includes('.')) {
      ext = path.extname(original_filename).toLowerCase().replace(".", "");
    } else if (content_type) {
      ext = content_type.split('/')[1] || "bin";
    }

    // Attempt Supabase Storage Upload
    const targetBucket = (req.query.bucket as string) || (req.body && req.body.bucket as string) || "cover-images";
    // Session 53 (security): only the app's own buckets (no new public buckets from the outside), and
    // never a file a browser would run as a page (HTML / SVG / XML / scripts).
    const UPLOAD_BUCKETS = ["avatars", "banners", "brand-logos", "content-submissions", "cover-images", "kyc-documents", "live-proofs", "profile-assets", "ugc-assets"];
    if (!UPLOAD_BUCKETS.includes(targetBucket)) {
      return res.status(400).json({ detail: "Unknown upload folder." });
    }
    const lowerType = String(content_type || "").toLowerCase();
    if (/html|svg|xml|javascript|ecmascript|x-sh|php/.test(lowerType) || /^(html?|svg|xml|js|mjs|php|sh)$/.test(ext)) {
      return res.status(400).json({ detail: "This file type can't be uploaded. Please use an image, video or PDF." });
    }

    if (!supabase || !buffer) {
      return res.status(500).json({ error: "Storage service configuration is missing or no file buffer." });
    }

    // Session 31: profile photos, logos and covers are made small before they are stored.
    if (buffer && shouldShrink(targetBucket, content_type)) {
      const small = await shrinkPhoto(buffer, content_type, targetBucket);
      if (small.shrunk) {
        buffer = small.buffer;
        size = buffer.length;
        content_type = small.contentType;
        ext = small.ext;
      }
    }

    // --- PART 1: KYC Document Compression ---
    if (targetBucket === "kyc-documents" && buffer) {
      if (content_type.startsWith("image/")) {
        try {
          console.log(`[KYC Storage] Compressing image upload (original size: ${buffer.length} bytes)`);
          buffer = await sharp(buffer)
            .resize({ width: 15000, withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
          size = buffer.length;
          content_type = "image/jpeg";
          ext = "jpg";
          console.log(`[KYC Storage] Compression successful (new size: ${size} bytes)`);
        } catch (compressErr: any) {
          console.error(`[KYC Storage] Image compression failed: ${compressErr.message}`);
        }
      } else if (content_type === "application/pdf") {
        console.log(`[KYC Storage] Uploading PDF document (original size: ${buffer.length} bytes). Skipping compression due to complex embedded image extraction constraints.`);
      }
    }
    // -----------------------------------------


    const filePath = `${user.user_id}/${file_id}.${ext}`;
    const activeSupabase = privilegedSupabase || supabase;

    let uploadSuccess = false;
    let finalPublicUrl = null;
    let uploadErrorMsg = "Unknown error";
    
    try {
      // Ensure the bucket exists (creating it as a public bucket if it's missing)
      await ensureBucketExists(targetBucket, activeSupabase);
    } catch (e: any) {
      console.error("[upload] storage bucket setup failed:", e?.message || e); // v423 (S7): detail in the server log only
      return res.status(500).json({ error: "Upload isn't available right now. Please try again in a minute." });
    }

    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES && !uploadSuccess) {
      attempt++;
      try {
        console.log(`[Storage] Attempting upload of ${file_id} to '${targetBucket}' (Attempt ${attempt}/${MAX_RETRIES}) using ${privilegedSupabase ? 'service_role' : 'anon'} key...`);
        
        const { error: uploadErr } = await activeSupabase.storage
          .from(targetBucket)
          .upload(filePath, buffer, {
            contentType: content_type,
            upsert: true,
            cacheControl: "31536000", // v428: each file has its own name — cache it (egress)
          });

        if (uploadErr) {
          uploadErrorMsg = uploadErr.message;
          throw new Error(uploadErr.message); // throw to catch and retry
        }

        // Generate URL
        const privateBuckets = ['kyc-documents', 'content-submissions', 'live-proofs', 'ugc-assets'];
        if (PRIVATE_MEDIA_BUCKETS.includes(targetBucket)) {
          // Deliverables: a link that goes through the access check, never a 7-day storage URL.
          finalPublicUrl = `/api/media?src=${encodeURIComponent(`${targetBucket}/${filePath}`)}`;
        } else if (privateBuckets.includes(targetBucket)) {
          const { data: signedData, error: signErr } = await activeSupabase.storage
            .from(targetBucket)
            .createSignedUrl(filePath, 60 * 60 * 24 * 7);
          if (signErr || !signedData || !signedData.signedUrl) {
            uploadErrorMsg = signErr?.message || "Failed to generate signed URL";
            throw new Error(uploadErrorMsg);
          }
          finalPublicUrl = signedData.signedUrl;
        } else {
          const { data: urlData } = activeSupabase.storage
            .from(targetBucket)
            .getPublicUrl(filePath);
          if (!urlData || !urlData.publicUrl) {
            uploadErrorMsg = "Failed to generate public URL";
            throw new Error(uploadErrorMsg);
          }
          finalPublicUrl = urlData.publicUrl;
        }
        
        // Track in public.files table consistently
        const { error: dbErr } = await (privilegedSupabase || supabase).from('files').insert({
          file_id: file_id,
          user_id: user.user_id,
          storage_path: `${targetBucket}/${filePath}`,
          original_filename: original_filename,
          content_type: content_type,
          size: size
        });

        if (dbErr) {
          uploadErrorMsg = dbErr.message;
          throw new Error(uploadErrorMsg);
        }

        uploadSuccess = true;
      } catch (err: any) {
        console.warn(`[Storage] Upload attempt ${attempt} failed:`, err.message);
        if (attempt < MAX_RETRIES) {
          const backoffMs = Math.pow(2, attempt) * 500; // 1s, 2s
          await new Promise(r => setTimeout(r, backoffMs));
        } else {
          uploadErrorMsg = err.message || uploadErrorMsg;
        }
      }
    }

    if (!uploadSuccess) {
      console.error(`[Storage] All ${MAX_RETRIES} attempts failed for ${file_id}. Last error: ${uploadErrorMsg}`);
      return res.status(500).json({ error: "Upload failed. Please try again." }); // v423 (S7): the detail stays in the log above
    }

    console.log(`[Storage] Tracked upload in files table successfully (bucket: ${targetBucket})!`);
    return res.json({
      file_id,
      url: `/api/files/${file_id}`,
      path: filePath,
      public_url: finalPublicUrl
    });
  });


  router.get("/files/:file_id", async (req, res) => {
    if (!supabase) {
      return res.status(500).json({ error: "Storage service not configured" });
    }
    
    try {
      const { data: fileRecord, error: fileErr } = await supabase
        .from('files')
        .select('*')
        .eq('file_id', req.params.file_id)
        .maybeSingle();

      if (fileErr) {
        console.error("Error querying file record:", fileErr);
        return res.status(500).json({ error: "Database error querying file" });
      }

      if (fileRecord && !fileRecord.is_deleted) {
        const storagePath = fileRecord.storage_path;
        
        if (storagePath) {
          const slashIdx = storagePath.indexOf('/');
          if (slashIdx !== -1) {
            const bucketName = storagePath.substring(0, slashIdx);
            const remainingPath = storagePath.substring(slashIdx + 1);

            // Session 22: this served ANY file by id with no login — KYC documents included.
            // Private buckets: the owner or staff only (deal partners use /api/media).
            if (isPrivateBucket(bucketName)) {
              // Session 58: an <img> can't send the login header — accept the short-lived media key too (as /api/media does).
              let viewer: any = await parseAuthUser(req);
              if (!viewer) {
                const kUid = verifyMediaKey(req.query?.k);
                if (kUid) {
                  const { data: ku } = await (privilegedSupabase || supabase).from('users').select('user_id, role, team_role, parent_brand_id, is_deleted, banned').eq('user_id', kUid).maybeSingle();
                  if (ku && !ku.is_deleted && !ku.banned) viewer = ku;
                }
              }
              const staff = viewer && (["admin", "sub_admin"].includes(String(viewer.role)) || viewer.team_role === "sub_admin");
              const mine = viewer ? [viewer.user_id, viewer.parent_brand_id].filter(Boolean).map(String) : [];
              if (!viewer) return res.status(401).json({ error: "Please log in to view this file." });
              if (!staff && !mine.includes(String(fileRecord.user_id))) return res.status(403).json({ error: "You don't have access to this file." });
            }

            const { data, error } = await supabase.storage
              .from(bucketName)
              .download(remainingPath);

            if (!error && data) {
              const arrayBuffer = await data.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              const contentType = fileRecord.content_type || 'image/jpeg';
              res.setHeader('Content-Type', contentType);
              res.setHeader('Content-Length', buffer.length.toString());
              // Session 58: private files (KYC, PAN, UPI QR) are never cached publicly — only this browser, not stored.
              res.setHeader('Cache-Control', isPrivateBucket(bucketName) ? 'private, no-store' : 'public, max-age=31536000, immutable');
              return res.send(buffer);
            }
            console.error(`[Storage] Error downloading '${remainingPath}' from bucket '${bucketName}':`, error);
            return res.status(404).json({ error: `Could not download file: ${error?.message || "Not found"}` });
          }
        }
      }
      
      return res.status(404).json({ detail: "File not found or deleted" });
    } catch (err: any) {
      console.error("Error fetching file from Supabase files table/storage:", err);
      return res.status(500).json({ error: err.message || "Internal server error" });
    }
  });


  router.post("/cost-requests/:id/quote", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    if (user.role !== "creator") return res.status(403).json({ detail: "Only creators can quote" });

    const db = getDb();
    db.collab_cost_requests = db.collab_cost_requests || [];
    const request = db.collab_cost_requests.find((r) => r.id === req.params.id);
    if (!request) return res.status(404).json({ detail: "Cost request not found" });

    const { quoted_amount } = req.body;
    request.quoted_amount = quoted_amount;
    request.status = "QUOTED";
    request.responded_at = getIsoNow();

    db.notifications = db.notifications || [];
    db.notifications.push({
      notif_id: `notif_${Math.random().toString(36).substring(2, 10)}`,
      user_id: request.brand_id,
      type: "collab_cost_quoted",
      message: `Creator quoted ₹${quoted_amount} for your cost request`,
      read: false,
      created_at: getIsoNow(),
    });

    saveDb(db);
    res.json(request);
  });


  router.post("/ai/predict-roi", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });

    const { campaign, creators } = req.body || {};
    const creatorList = Array.isArray(creators) ? creators : [];

    const fallbackEstimate = () => {
      const avgFollowers = creatorList.length
        ? creatorList.reduce((sum: number, c: any) => sum + (Number(c.followers_count || c.followers || c.instagram_followers) || 5000), 0) / creatorList.length
        : 5000;
      const estimatedReach = Math.round(avgFollowers * Math.max(creatorList.length, 1) * 0.35);
      const estimatedEngagement = Math.round(estimatedReach * 0.06);
      const roiMultiplier = Number((1.5 + Math.min(creatorList.length, 10) * 0.15).toFixed(1));
      return {
        estimatedReach,
        estimatedEngagement,
        roiMultiplier,
        analysis: `Based on ${creatorList.length} creator(s), this campaign is projected to reach a meaningful audience with solid engagement. This is an approximate estimate.`
      };
    };

    if (!process.env.GEMINI_API_KEY || creatorList.length === 0) {
      return res.json(fallbackEstimate());
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const promptString = `You are a marketing analytics expert. Given this campaign and shortlist of creator applicants, estimate the campaign's potential performance.

Campaign: ${JSON.stringify(campaign || {}).slice(0, 2000)}
Creators (${creatorList.length}): ${JSON.stringify(creatorList).slice(0, 3000)}

Respond with ONLY a raw JSON object (no markdown, no code fences) in exactly this shape:
{"estimatedReach": <integer>, "estimatedEngagement": <integer>, "roiMultiplier": <number, one decimal place>, "analysis": "<one short sentence>"}`;

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("AI prediction timeout")), 4000)
      );

      const aiCallPromise = ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: promptString,
      });

      const response: any = await Promise.race([aiCallPromise, timeoutPromise]);

      const text = (response.text || "").trim().replace(/^```json\s*|```$/g, "");
      const parsed = JSON.parse(text);

      if (
        typeof parsed.estimatedReach === "number" &&
        typeof parsed.estimatedEngagement === "number" &&
        typeof parsed.roiMultiplier === "number"
      ) {
        return res.json(parsed);
      }
      return res.json(fallbackEstimate());
    } catch (err) {
      console.warn("[/ai/predict-roi] AI call failed, using fallback estimate:", err);
      return res.json(fallbackEstimate());
    }
  });


  router.get("/locations/search", (req, res) => {
    const q = (req.query.q || "") as string;
    const limit = parseInt((req.query.limit || "15") as string);
    const results = searchLocations(q, limit);
    return res.json(results);
  });

  // v416 (C3): the city picker's "Add" called POST /api/locations/save, which didn't exist (404, the add failed
  // silently). Nothing is stored server-side (no table for custom places): the campaign / profile saves the
  // picked place itself. This checks the name and returns the known spelling when it matches a listed place.
  router.post("/locations/save", async (req, res) => {
    const user = await parseAuthUser(req).catch(() => null);
    if (!user) return res.status(401).json({ error: "Please log in again.", detail: "Please log in again." });
    const clean = cleanLocationName(req.body?.name);
    if (!clean) return res.status(400).json({ error: "Please enter a valid city or place name.", detail: "Please enter a valid city or place name." });
    const known = searchLocations(clean, 5).find((l) => l.name.toLowerCase() === clean.toLowerCase());
    return res.json({ success: true, status: "approved", location: known ? known.name : clean });
  });

  router.post("/public/creator-apply", handlePublicCreatorApply);
  router.post("/waitlist", handlePublicCreatorApply);
}

/** v416 (C3): a custom city / place name — letters, spaces, . ' - ( ) and commas, 2–60 characters. null if not valid. */
export function cleanLocationName(raw: unknown): string | null {
  const t = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (t.length < 2 || t.length > 60) return null;
  if (!/^[\p{L}][\p{L}\p{M} .,'()-]*$/u.test(t)) return null;
  return t;
}
