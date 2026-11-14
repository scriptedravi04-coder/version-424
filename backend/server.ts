import { forcedMaintenance, forcedMaintenanceMessage } from "./forcedMaintenance"; // v421
import { isBrandLike as isBrandLikeRole } from "./roleGuards"; // v423
import { visibleOnExplore, dedupeByInstagram } from "./exploreGate";
import { isLiveServer } from "./liveServer"; // v376
import { setupCreatorReviewGate } from "./creatorReviewGate"; // v357
import { setupFollowerGate } from "./followerGate"; // v397: 500+ followers to finish creator sign-up
import { SESSION_MS, isSupportToken, supportAdminOf, supportBlocked, requestToken } from "./authSecurity";
import { neutralizeStaffTeamRole } from "./authSecurity";
import { createPlatformSettingsStore } from "./platformSettings";
import { adminPermissionGate } from "./adminPermissions";
import { logIgnored } from "./logIgnored";
import { getCreatorKycStatus } from "./creatorKyc";
import { scrubSecrets, serviceKeyProblem } from "./authSecurity";
import { UGC_REVISION_LIMIT } from "./ugcTerms";
import { setupCreatorStatsRoutes } from "./creatorStats";
import { attachSocketServer } from "./socketServer";
import { createStorageHelpers, startSubmissionCleanup } from "./storageHelpers";
import { createNotificationService } from "./notificationService";
import { ADMIN_ROOM, emitThreadEvent } from "./socketAccess";
import "express-async-errors";
import { isUgcThread } from "./dealFlow";
declare global { var passwordResets: any; }
import express from "express";
import { createServer } from "http";
import compression from "compression";

import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import crypto from "crypto";
import dotenv from "dotenv";
import { idGuard } from "./idGuard"; // v396
import { fileLooksLike, sniffType, GENERIC_TYPES } from "./fileMagic"; // v396 · v408
import { applyCreatorNetAfterRefund, idsMissingRefund } from "./adminMoney"; // v396 (QA M-1)
import { startEscrowNotify } from "./escrowNotify"; // v396 (QA E-7)
import { createClient } from "@supabase/supabase-js";
import { setupBlogRoutes } from "./blog_routes";
import { setupBlogSeoRoutes } from "./blogSeo";
import { setupPaymentRoutes } from "./payment_routes";
import { resolveTestMode } from "./paymentTestMode";
import { setupChatCoreRoutes, clearInboxCache } from "./chat_routes";
import { fetchInboxProfiles, fetchLeanMessageWindows, mySideHas } from "./inboxLean"; // v417: mySideHas
import { threadSyncMiddleware } from "./threadSync";
import { createAuthLookupCache } from "./authLookupCache";
import { setupUgcOrderRoutes, setupUgcBrowseRoutes, isCollaborationDeliverable, createUgcLifecycleHandlers } from "./ugc_routes";
import { setupSupportRoutes } from "./support_routes";
import { setupCreatorsRoutes } from "./creators_routes";
import { setupDealsRoutes } from "./deals_routes";
import { setupTagsAndNotificationsRoutes } from "./tags_notifications_routes";
import { setupMissingRoutes } from "./missing_routes";
import { setupCampaignsRoutes, setupCampaignThreadRoutes, createCampaignLifecycleHandlers, createCampaignDraftSubmitGuard } from "./campaigns_routes";
import { setupBrandsRoutes } from "./brands_routes";
import { setupContentSubmissionsRoutes } from "./content_submissions_routes";
import { setupMiscRoutes } from "./misc_routes";
import { setupMediaRoutes } from "./media_routes";
import { setupBrowserDbRoutes } from "./browserDbRoutes";
import { setupOnboardingProgressRoutes } from "./onboardingProgress";
import { setupConsentRoutes } from "./consents";
import { isPrivateBucket } from "./mediaAccess";
import { configureEphemeralStore } from "./ephemeralStore";
import { setupDealsChatRoutes } from "./deals_chat_routes";
import { setupSessionRoutes } from "./session_routes";
import { setupAccountRoutes } from "./account_routes";
import { setupAuthRoutes } from "./auth_routes";
import { setupAdminContentRoutes } from "./admin_content_routes";
import { setupWhatsNewRoutes, setupHiwVideoRoutes } from "./whats_new_routes";
import { setupOAuthRoutes } from "./oauth_routes";
import { setupFeedbackRoutes } from "./feedback_routes";
import { setupPromoRoutes } from "./promo_routes";
import { setupChallengeRoutes } from "./challenge_routes"; // v367: Diwali Creator Challenge
import { fetchCreatorReviewsFromTable, mergeReviews } from "./persistedLists"; // Session 52
import { setupAssistRoutes, setupAssistDataRoutes, setAssistBrandMarkup, setupInvoiceRoutes } from "./assist_routes"; // Session 51/52: Ybex Assist for brands
import { setupPushRoutes, kickPushLoop } from "./push_routes";
import { setupAppUpdateRoutes } from "./appUpdate"; // v336: iPhone app live update
import { recordRequest } from "./speedStats";
import { setupAdminSpeedRoutes } from "./admin_speed_routes";
import { setupAdminVersionsCouponsRoutes } from "./admin_versions_coupons_routes";
import { setupAdminKycVerificationRoutes } from "./admin_kyc_verification_routes";
import { setupAdminLogsCreatorsRoutes } from "./admin_logs_creators_routes";
import { setupAdminWaitlistRoutes } from "./admin_waitlist_routes";
import { setupAdminCampaignsSettingsRoutes } from "./admin_campaigns_settings_routes";
import { setupAdminWipeRoutes, setupAccountPurge } from "./admin_wipe_routes"; // v404: + 30-day purge (QA P-1)
import { setupAdminAgreementRoutes } from "./admin_agreements_routes";
import { setupCreatorDashboardRoutes } from "./creatorDashboard";
import { setupCampaignManageRoutes } from "./campaignManage";
import { setupAdminSystemMaintenanceRoutes, applyMaintenanceAutoOff } from "./admin_system_maintenance_routes";
import { setupAdminGrowthRoutes } from "./admin_growth_routes";
import { setupAdminUsersEnforcementRoutes } from "./admin_users_enforcement_routes";
import { setupAdminPitchLeadsRoutes } from "./admin_pitch_leads_routes";
import { setupPublicCreatorRoutes } from "./public_creator_routes";
import { setupOnboardingReminderRoutes } from "./onboardingReminders";
import { startProfileNudges } from "./profileNudges"; // v378
import { ENV_BUNDLE_COUNT } from "./envBundle"; // v378
import { setupCampaignRefundRoutes } from "./campaignRefunds";
import { setupEmailBroadcastRoutes, processEmailQueue } from "./emailBroadcasts";
import { inLowWindow } from "./emailBudget";
import { setupFeeOfferRoutes } from "./feeOffer";
import { setupCreatorCouponRoutes } from "./creatorCoupons";
import { setupReferralRoutes } from "./referralProgram";
import { setupCreatorPayoutRequestRoutes } from "./creatorPayoutRequests";
import { setupKycPayoutMethodRoutes } from "./kycPayoutMethod"; // v347
import { setupManualSettlementRoutes } from "./manualSettlement"; // v348
import { setupInstagramRoutes } from "./instagramConnect"; // v349
import { setupBrandPaymentsRoutes } from "./brandPayments";
import { setupSignupSourceRoutes } from "./signupSource";
import { setupCreatorHomePicks } from "./creatorHomePicks";
import { setupMarketIntelligenceRoutes } from "./market_intelligence_routes";

import { getCleanResendApiKey, safePromiseTimeout, tickEmailQueue } from "./helpers";

import { Server as SocketIOServer } from "socket.io";
import { createEscrowTransaction as createEscrowTransactionService, CreateEscrowTransactionParams } from "./services/escrowService";
import { createUgcLifecycleService } from "./services/ugcLifecycleService";
import { calculateFee as calculatePlatformFee } from "../src/utils/feeCalculator";
import { loadFeeConfig, splitFeeOn } from "./brandFee"; // v364
import { domainProxyMiddleware } from "./domainProxy";
import { setupBlockRoutes } from "./blockUsers";

dotenv.config();

export function sanitizeSupabaseUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let url = rawUrl.trim();
  // Strip off accidental JWT token appended to .supabase.co (e.g. https://<ref>.supabase.coeyJ...)
  const supabaseMatch = url.match(/^(https?:\/\/[a-zA-Z0-9-]+\.supabase\.co)/i);
  if (supabaseMatch) {
    return supabaseMatch[1];
  }
  if (url.endsWith('/rest/v1/')) url = url.replace('/rest/v1/', '');
  if (url.endsWith('/rest/v1')) url = url.replace('/rest/v1', '');
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return 'https://mzcovvzkwzjvzskjqwwy.supabase.co';
  }
}

if (process.env.SUPABASE_URL) {
  const cleaned = sanitizeSupabaseUrl(process.env.SUPABASE_URL);
  if (cleaned) process.env.SUPABASE_URL = cleaned;
}
if (process.env.VITE_SUPABASE_URL) {
  const cleaned = sanitizeSupabaseUrl(process.env.VITE_SUPABASE_URL);
  if (cleaned) process.env.VITE_SUPABASE_URL = cleaned;
}

if (process.env.RESEND_API_KEY) {
  const cleaned = getCleanResendApiKey(process.env.RESEND_API_KEY);
  if (cleaned) {
    process.env.RESEND_API_KEY = cleaned;
  }
}

// Global safety net: without these, a single unexpected error anywhere outside
// a normal Express request (e.g. a background task or stray callback) would
// crash the entire Node process and take the whole app down. Now such errors
// are logged instead, and the server keeps running for everyone else.
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught Exception (server kept running):", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled Promise Rejection (server kept running):", reason);
});

// Programmatically load env.json into process.env to ensure secrets like SUPABASE_SERVICE_ROLE_KEY are loaded.
// IMPORTANT: only fill in variables that aren't already set in the real environment — a hosting
// platform's actual env vars (e.g. a dynamically-assigned PORT) must always win over this static file.
try {
  const envJsonPath = path.join(process.cwd(), "env.json");
  if (fs.existsSync(envJsonPath)) {
    const envData = JSON.parse(fs.readFileSync(envJsonPath, 'utf8'));
    let dotenvContent = '';
    for (const [key, value] of Object.entries(envData)) {
      if (typeof value === 'string') {
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
        dotenvContent += `${key}=${process.env[key]}\n`;
      }
    }
    // Sync with .env file as well
    fs.writeFileSync(path.join(process.cwd(), ".env"), dotenvContent, 'utf8');
    console.log("Loaded environment variables from env.json and synced .env file");
  }
} catch (err: any) {
  console.warn("Failed to load env.json / sync .env file:", err.message);
}



async function startServer() {
  




  const app = express();
  let emailNightTick: () => void = () => {};
  app.use(domainProxyMiddleware); // v337: real visitor IP through the ybexmedia.in Cloudflare proxy
  // v378 (QA H2): security headers on every answer. No other site may frame Ybex on the live server (clickjacking on
  // "Approve & Pay"); test servers still allow AI Studio's preview frame. No script CSP (Razorpay / Pixel / GA load
  // from many hosts) — only the safe headers.
  app.disable("x-powered-by");
  app.use((req: any, res: any, next: any) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (isLiveServer(process.env)) {
      // v429 (Ravi: "deploy karte waqt ais-dev-….run.app refused to connect"): AI Studio's editor shows its preview server
      // (ais-dev-…) in a frame; the live keys made it count as live, so the frame was refused. Only AI Studio may frame it.
      const host = String(req.headers?.host || "");
      if (/^ais-dev-/i.test(host)) {
        res.setHeader("Content-Security-Policy", "frame-ancestors 'self' https://aistudio.google.com https://*.aistudio.google.com https://ai.studio https://*.ai.studio");
      } else {
        res.setHeader("X-Frame-Options", "SAMEORIGIN");
        res.setHeader("Content-Security-Policy", "frame-ancestors 'self'");
      }
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });
  const PORT = Number(process.env.PORT) || 3000;
  console.log(`[Startup] Using port ${PORT}`);

  // Create the real HTTP server and attach a real Socket.IO instance to it.
  // Socket.IO was imported at the top of this file but was never actually
  // instantiated — every app.get("io") call elsewhere in this file was
  // silently getting `undefined`, and the frontend's socket.io-client was
  // retrying a connection forever with nothing on the other end.
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    // Session 58: same allowlist as the API (any website could open a socket before).
    cors: { origin: (origin: any, cb: any) => cb(null, !origin || corsOriginAllowed(String(origin), "")), methods: ["GET", "POST"] }
  });
  app.set("io", io);

  attachSocketServer(io, {
    parseAuthUser: (req: any) => parseAuthUser(req),
    getDb: () => getDb(),
    getClient: () => privilegedSupabase || supabase
  });

  // Compress all responses for fast network delivery
  app.use(compression() as any);

  // Add healthcheck endpoint for preview ping
app.use((req, res, next) => {
  // Session 58 (Ravi): only our own sites may call the API from a browser (it echoed ANY website before, with
  // credentials). Same-site requests don't need this header at all.
  const origin = String(req.headers.origin || "");
  if (origin && corsOriginAllowed(origin, String(req.headers.host || ""))) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Ybex-Platform, X-Ybex-App-Version"); // v418: the Android app sends these (Meta app events)
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
  app.get("/api/health", (req, res) => { 
    // Session 25: says whether the server writes as the service role (true/false only, no key).
    // false = every protected write fails with "violates row-level security policy".
    res.json({ status: "ok", supabase_service_role: Boolean(privilegedSupabase), ybex_env_settings: ENV_BUNDLE_COUNT }); // v378: number only, never names/values
  });

  // Middleware for parsing JSON and URL-encoded bodies
  // Session 53 (security): 25 MB is plenty for JSON / form posts (videos go straight to storage with a
  // signed URL, files through multer below). 500 MB let one request fill the server's memory.
  // Session 56: the Razorpay webhook needs the exact raw body to check Razorpay's signature, so that
  // one path is read raw first (express.json below then leaves it alone).
  app.use("/api/payments/razorpay/webhook", express.raw({ type: "*/*", limit: "1mb" }), (req: any, _res, next) => {
    req.rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    try { req.body = JSON.parse(req.rawBody.toString("utf8") || "{}"); } catch { req.body = {}; }
    next();
  });
  // v349: Meta's Instagram webhook is signed over the raw body too (X-Hub-Signature-256).
  app.use("/api/webhooks/instagram", express.raw({ type: "*/*", limit: "1mb" }), (req: any, _res, next) => {
    if (!Buffer.isBuffer(req.body)) return next();
    req.rawBody = req.body;
    try { req.body = JSON.parse(req.rawBody.toString("utf8") || "{}"); } catch { req.body = {}; }
    next();
  });
  // v399: wakes the night e-mail queue on any request (the tick itself is set up next to the broadcast routes).
  app.use((_req, _res, next) => { try { emailNightTick(); } catch { /* never blocks a request */ } next(); });
  // v419 (Eva security review M5): Eva and feedback bodies are small — a chunked upload skipped the Content-Length
  // check and was parsed up to 25 MB. Parse them first with a 64 KB cap (the global parser then skips them).
  app.use(["/api/assist", "/api/feedback"], express.json({ limit: "64kb" }));
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));
  // v396 (QA S-1, critical): ids with filter characters ( , ( ) ) never reach a route — see backend/idGuard.ts
  app.use("/api", idGuard);
  // v429 Support mode: an admin inside a user's account can't touch money, bank, KYC, signing, approvals, chat or
  // login details (list: authSecurity.ts supportBlocked); every change it does make goes to the admin activity log.
  app.use("/api", (req: any, res: any, next: any) => {
    const tok = requestToken(req);
    if (!isSupportToken(tok)) return next();
    if (supportBlocked(req.method, req.path, req.body)) {
      return res.status(403).json({ error: "Support mode can't do this — only the user can (money, bank, KYC, signing, approvals, chat and login details are locked).", code: "SUPPORT_MODE_BLOCKED" });
    }
    const m = String(req.method).toUpperCase();
    if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
      res.on("finish", () => {
        if (res.statusCode >= 400) return;
        const adminId = supportAdminOf(tok);
        const asUser = req._supportUserId || null;
        logAdminAction({ user_id: adminId }, "support_mode_change", "user", asUser || "unknown", { method: m, path: req.path }).catch(() => {});
      });
    }
    next();
  });

  // Configure multer memory storage for uploads (up to 500MB for video deliverables)
  // v378 (QA L5): 100 MB (Cloud Run refuses bigger requests anyway; 500 MB in memory could exhaust the server), and
  // the file's first bytes must match the type the browser claimed (a renamed .exe / HTML is refused).
  const uploadMulter = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowedMimeTypes = [
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'image/heic', 'image/heif', // v416 (CR10): iPhone photos for brand logo / cover were refused outright
        'video/mp4', 'video/quicktime', 'video/x-msvideo',
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'audio/mpeg', 'audio/wav', 'audio/webm'
      ];
      // v408: a generic / empty type is let in here and decided by the file's first bytes in magicCheck
      if (allowedMimeTypes.includes(file.mimetype) || GENERIC_TYPES.has(String(file.mimetype || "").toLowerCase())) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type uploaded.'));
      }
    }
  });
  // v416 (CR10): HEIC / HEIF = ISO box "ftyp" + a heic-family brand in the first bytes (fileMagic.ts doesn't know HEIC)
  const isRealHeic = (f: any): boolean => {
    const t = String(f?.mimetype || "").toLowerCase();
    if (t !== "image/heic" && t !== "image/heif") return false;
    const b: Buffer | undefined = f?.buffer;
    if (!b || b.length < 12) return false;
    const a = b.subarray(0, 12).toString("latin1");
    return a.slice(4, 8) === "ftyp" && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(a.slice(8, 12));
  };
  // v396: moved to backend/fileMagic.ts (the base64 upload path uses it too — QA S-5)
  const magicCheck = (req: any, res: any, next: any) => {
    const files: any[] = [req.file, ...(Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat())].filter(Boolean);
    // v408: generic type → the real one from the bytes (jpeg / png / gif / webp / pdf), else refused as before
    for (const f of files) if (GENERIC_TYPES.has(String(f.mimetype || "").toLowerCase())) { const t = sniffType(f.buffer); if (t) f.mimetype = t; }
    if (files.some((f) => !fileLooksLike(f) && !isRealHeic(f))) return res.status(400).json({ detail: "This file doesn't look like the type it claims to be. Please upload a real image, video or PDF.", code: "BAD_FILE" });
    next();
  };
  // v396 (QA S-10): a refused type / too-big file answered 500 — now a clear 400 / 413
  const multerSafe = (mw: any) => (req: any, res: any, next: any) => mw(req, res, (err: any) => {
    if (!err) return next();
    if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ detail: "This file is too large (max 100 MB)." });
    return res.status(400).json({ detail: "This file type can't be uploaded. Please use an image, video or PDF.", code: "BAD_FILE" });
  });
  const upload: any = {
    single: (name: string) => [multerSafe(uploadMulter.single(name)), magicCheck],
    array: (name: string, n?: number) => [multerSafe(uploadMulter.array(name, n)), magicCheck],
    fields: (f: any) => [multerSafe(uploadMulter.fields(f)), magicCheck],
    any: () => [multerSafe(uploadMulter.any()), magicCheck],
    none: () => uploadMulter.none(),
  };

  const DB_PATH = path.join(process.cwd(), "db_mock.json");

  let supabaseUrl = sanitizeSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) || 'https://mzcovvzkwzjvzskjqwwy.supabase.co';

  let supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseKey || typeof supabaseKey !== 'string' || !supabaseKey.trim()) {
    supabaseKey = 'sb_publishable_Vbd74GKG1eYP7NYp4qtFbg_kuQuDPKv';
  }

  let supabase: any = null;
  let privilegedSupabase: any = null;

  const rawServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  // Session 33: an anon/publishable key pasted here looked "set" but every write was refused (42501).
  const serviceKeyIssue = rawServiceKey ? serviceKeyProblem(rawServiceKey) : null;
  if (serviceKeyIssue) console.error(`[FATAL] ${serviceKeyIssue} Sign up and login stay off until it is fixed.`);
  const serviceRoleKey = serviceKeyIssue ? undefined : rawServiceKey;

  if (!serviceRoleKey) {
    console.error("[FATAL] SUPABASE_SERVICE_ROLE_KEY is not set. Privileged Supabase operations will not work until this environment variable is configured.");
  }

  if (supabaseUrl && supabaseKey) {
    console.log(`Supabase credentials detected! Initializing secure cloud sync (Using anon/publishable key).`);
    
    const wrapSupabaseClient = (client: any) => {
      if (!client) return null;
      const originalFrom = client.from;
      client.from = function (table: string) {
        const queryBuilder = originalFrom.apply(this, [table]);
        if (table === 'notifications') {
          const originalInsert = queryBuilder.insert;
          queryBuilder.insert = function (values: any, options: any) {
            const valuesArray = Array.isArray(values) ? values : [values];
            for (const notif of valuesArray) {
              if (!notif.notif_id) {
                notif.notif_id = crypto.randomUUID();
              }
              if (!notif.created_at) {
                notif.created_at = new Date().toISOString();
              }
              if (notif.read === undefined) {
                notif.read = false;
              }
            }
            const postgrestBuilder = originalInsert.apply(this, [values, options]);
            const originalThen = postgrestBuilder.then.bind(postgrestBuilder);
            postgrestBuilder.then = function (onfulfilled?: any, onrejected?: any) {
              return originalThen((res: any) => {
                if (res && res.error) {
                  if (res.error.code === '23505') {
                    console.log(`[Supabase Proxy] Suppressing duplicate key violation (23505) for notifications insert. Skipping gracefully.`);
                    return { data: [], error: null };
                  }
                  return res;
                }
                kickPushLoop(); // v284: phone push for this notification without waiting for the 60 s loop
                try {
                  const ioInstance = app.get("io");
                  if (ioInstance) {
                    for (const notif of valuesArray) {
                      if (notif.user_id) {
                        console.log(`[Supabase Proxy] Emitting real-time events to user room ${notif.user_id} for notification ${notif.notif_id}`);
                        // Sockets join `user_<id>` (socketServer.ts); the bare id room had no members,
                        // so live bell notifications never arrived. Session 22.
                        ioInstance.to(`user_${notif.user_id}`).emit("bell_notification", notif);
                        ioInstance.to(`user_${notif.user_id}`).emit("new_notification", notif);
                      }
                      // Broadcast all notifications and system alerts to connected admin room
                      ioInstance.to(ADMIN_ROOM).emit("admin_notification", notif);
                      ioInstance.to(ADMIN_ROOM).emit("new_notification", notif);
                    }
                  }
                } catch (err) {
                  console.error(`[Supabase Proxy] Error in post-insert real-time emission:`, err);
                }
                return res;
              }, (err: any) => {
                if (err && err.code === '23505') {
                  console.log(`[Supabase Proxy] Caught duplicate key violation in catch block. Skipping gracefully.`);
                  return { data: [], error: null };
                }
                throw err;
              }).then(onfulfilled, onrejected);
            };
            return postgrestBuilder;
          };
        }
        return queryBuilder;
      };
      return client;
    };

    const tempSupabase = createClient(supabaseUrl, supabaseKey);
    supabase = wrapSupabaseClient(tempSupabase);

    if (serviceRoleKey) {
      console.log(`[Supabase] Initializing separate privileged client with service_role key...`);
      const tempPrivileged = createClient(supabaseUrl, serviceRoleKey);
      privilegedSupabase = wrapSupabaseClient(tempPrivileged);
      // Session 22: the SERVER always talks to the database as the service role. ~45 server calls
      // used the anon client (payments, KYC, sessions, deals) and only worked because the tables
      // had "anyone may do anything" RLS policies — which also let any browser read/write them.
      // With this, those policies can be dropped without breaking the server. Do not undo.
      supabase = privilegedSupabase;
      configureEphemeralStore(tempPrivileged); // OTP codes + sign tokens shared across instances
    } else {
      console.warn(`[Supabase] SUPABASE_SERVICE_ROLE_KEY is not defined. Admin writes on RLS-protected tables like 'banners' will fail unless configured.`);
    }

    // Run connection test and sync asynchronously in the background so it doesn't block server startup
    (async () => {
      try {
        const { error } = await (privilegedSupabase || tempSupabase).from('users').select('user_id').limit(1);
        if (error && error.code !== 'PGRST116') {
          console.warn("Supabase configured but tables missing or inaccessible, keeping cloud sync enabled for potential recovery:", error.message);
        }
        {
          
          

          // Run UGC briefs consistency sync
          try {
            console.log("Running lightweight consistency check on UGC Briefs in background...");
            const { data: briefs, error: bErr } = await (privilegedSupabase || tempSupabase).from('ugc_briefs').select('id, claimed_count');
            if (!bErr && briefs) {
              // Session 43 (v284): this ran one count request PER BRIEF on every server start (and
              // the server starts many times a day) — hundreds of Supabase requests + log lines.
              // Now the brief_id column of ugc_orders is read once, in pages of 1000 (PostgREST's
              // row cap), and counted here. Same numbers; if the read fails nothing is changed.
              const orderCounts: Record<string, number> = {};
              let countsOk = true;
              for (let from = 0; ; from += 1000) {
                const { data: page, error: pageErr } = await (privilegedSupabase || tempSupabase)
                  .from('ugc_orders').select('brief_id').order('id', { ascending: true }).range(from, from + 999)
                  // Session 56 (payment audit): only orders that still hold a slot. Cancelled / expired orders
                  // gave their slot back; counting them closed paid slots after every restart.
                  .not('status', 'in', '(CANCELLED,EXPIRED)');
                if (pageErr) { countsOk = false; break; }
                for (const o of page || []) { if (o?.brief_id) orderCounts[o.brief_id] = (orderCounts[o.brief_id] || 0) + 1; }
                if (!page || page.length < 1000) break;
              }
              for (const b of countsOk ? briefs : []) {
                {
                  const actualCount = orderCounts[b.id] || 0;
                  if (b.claimed_count !== actualCount) {
                    console.log(`[Sync] Updating claimed_count for brief ${b.id}: ${b.claimed_count} -> ${actualCount}`);
                    await (privilegedSupabase || tempSupabase).from('ugc_briefs').update({ claimed_count: actualCount }).eq('id', b.id);
                  }
                }
              }
            }
            console.log("UGC Briefs consistency check completed.");
          } catch (syncErr) {
            console.error("Failed to run UGC Briefs consistency check:", syncErr);
          }

          
          // Programmatically ensure storage buckets exist
          try {
            console.log("[Storage] Verifying Supabase storage buckets...");
            const { data: buckets, error: getErr } = await (privilegedSupabase || tempSupabase).storage.listBuckets();
            if (getErr) {
               console.warn("[Storage] Error listing buckets. Buckets will not be auto-created:", getErr.message);
            } else if (buckets) {
               const requiredBuckets = ['kyc-documents', 'content-submissions', 'live-proofs', 'ugc-assets', 'brand-logos', 'profile-assets', 'banners', 'avatars', 'cover-images']; // session 31: the old always-empty banner bucket is replaced by 'banners'
               for (const bucketName of requiredBuckets) {
                 const exists = buckets.find(b => b.name === bucketName || b.id === bucketName);
                 const isPublic = !isPrivateBucket(bucketName); // deliverable buckets stay private — see mediaAccess.ts
                 if (!exists) {
                   console.log(`[Storage] Auto-creating bucket '${bucketName}' (public: ${isPublic})...`);
                   let allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
                   if (bucketName === 'kyc-documents') allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf', 'image/webp'];
                   else if (['content-submissions', 'live-proofs', 'ugc-assets'].includes(bucketName)) allowedMimeTypes = ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime', 'application/pdf', 'image/webp'];
                   
                   const { error: createErr } = await (privilegedSupabase || tempSupabase).storage.createBucket(bucketName, {
                     public: isPublic,
                     fileSizeLimit: 524288000, // 500MB
                     allowedMimeTypes
                   });
                   if (createErr) {
                     console.warn(`[Storage] Could not create bucket '${bucketName}':`, createErr.message);
                   } else {
                     console.log(`[Storage] Bucket '${bucketName}' successfully created.`);
                   }
                 } else if (isPublic) {
                   try {
                     await (privilegedSupabase || tempSupabase).storage.updateBucket(bucketName, { public: true });
                   } catch (updateErr) { logIgnored("server:439", updateErr); }
                 }
               }
            }
          } catch (storageErr: any) {
            console.error("[Storage] Auto-setup failed:", storageErr.message);
          }

        }
      } catch (err) {
        console.warn("Supabase connection failed, keeping cloud sync enabled for auto-recovery");
      }
    })();
  }


  // Helper to get raw ISO date string
  const getIsoNow = () => new Date().toISOString();

  // Payment test mode. The decision now lives in backend/paymentTestMode.ts so
  // it can be unit tested. PAYMENTS_TEST_MODE is the explicit switch and always
  // wins; set it to "false" in production. With the variable unset the previous
  // heuristics apply unchanged, and one of those (APP_URL containing "run.app")
  // would leave a real Cloud Run deploy silently in test mode.
  const getIsTestMode = (): boolean => resolveTestMode(process.env);

  // DEMO LOGINS (the "Creator / Brand / Admin Demo" buttons and their dev_bypass* tokens).
  // Kept for testing by Ravi's decision, but they must never work on a real launch: a public
  // button that makes anyone Super Admin. They follow payment test mode — on while
  // PAYMENTS_TEST_MODE is on, off the moment it is set to "false" at launch. DEMO_LOGIN=true/false
  // overrides explicitly if the two ever need to differ.
  const isDemoLoginEnabled = (): boolean => {
    if (isLiveServer(process.env)) return false; // v376: never on the live server, even with DEMO_LOGIN=true in the secrets
    // Explicit only (session 22) — it used to follow payment test mode, i.e. ON on run.app.
    const explicit = String(process.env.DEMO_LOGIN || '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(explicit);
  };
  // Session 43 (v280): lets the login screens show the demo buttons only when this server has
  // DEMO_LOGIN=true (test server). Says nothing else; the bypass tokens are still checked above.
  app.get("/api/auth/demo-enabled", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ enabled: isDemoLoginEnabled() });
  });

  // Helper to reliably insert chat messages to Supabase with schema filtering, foreign-key protection and self-healing
  const knownChatThreadIds = new Set<string>();
  async function insertChatMessageToSupabase(payload: any) {
    if (!supabase) return { data: null, error: null };
    try {
      const client = privilegedSupabase || supabase;
      if (!payload || typeof payload !== 'object') return { data: null, error: null };

      // 1. Whitelist valid Supabase columns to avoid PGRST204 errors
      const validCols = new Set([
        'message_id',
        'thread_id',
        'sender_user_id',
        'receiver_user_id',
        'sender_role',
        'text',
        'from_name',
        'read',
        'message_type',
        'metadata',
        'created_at'
      ]);

      const cleanPayload: any = {};
      for (const [k, v] of Object.entries(payload)) {
        if (validCols.has(k) && v !== undefined) {
          cleanPayload[k] = v;
        }
      }

      // Map alias / common fields if missing
      if (!cleanPayload.sender_role && payload.sender_role) {
        cleanPayload.sender_role = payload.sender_role;
      }
      if (!cleanPayload.sender_role && payload.role) {
        cleanPayload.sender_role = payload.role;
      }
      if (!cleanPayload.sender_role) {
        if (payload.message_type === 'admin_injection' || payload.from_name === 'Platform Admin') {
          cleanPayload.sender_role = 'admin';
        } else if (payload.message_type === 'system') {
          cleanPayload.sender_role = 'system';
        }
      }
      if (cleanPayload.metadata && typeof cleanPayload.metadata === 'object' && cleanPayload.sender_role && !cleanPayload.metadata.sender_role) {
        cleanPayload.metadata = { ...cleanPayload.metadata, sender_role: cleanPayload.sender_role };
      }
      if (!cleanPayload.text && (payload.content || payload.message)) {
        cleanPayload.text = String(payload.content || payload.message);
      }
      if (!cleanPayload.message_id && payload.id) {
        cleanPayload.message_id = String(payload.id);
      }
      if (!cleanPayload.message_id) {
        cleanPayload.message_id = crypto.randomUUID();
      }
      if (!cleanPayload.sender_user_id && payload.sender_id) {
        cleanPayload.sender_user_id = payload.sender_id;
      }
      if (!cleanPayload.receiver_user_id && payload.receiver_id) {
        cleanPayload.receiver_user_id = payload.receiver_id;
      }
      if (!cleanPayload.created_at) {
        cleanPayload.created_at = new Date().toISOString();
      }
      if (cleanPayload.read === undefined) {
        cleanPayload.read = false;
      }

      // Nullify placeholder / non-UUID values that violate user_id FK
      const isUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (cleanPayload.sender_user_id === '' || cleanPayload.sender_user_id === 'system' || cleanPayload.sender_user_id === 'admin' || (cleanPayload.sender_user_id && !isUuidRegex.test(cleanPayload.sender_user_id))) {
        cleanPayload.sender_user_id = null;
      }
      if (cleanPayload.receiver_user_id === '' || cleanPayload.receiver_user_id === 'system' || cleanPayload.receiver_user_id === 'admin' || (cleanPayload.receiver_user_id && !isUuidRegex.test(cleanPayload.receiver_user_id))) {
        cleanPayload.receiver_user_id = null;
      }

      // If thread_id is missing entirely, we cannot insert to Supabase
      if (!cleanPayload.thread_id) {
        return { data: null, error: null };
      }

      // 2. Ensure thread exists in chat_threads to avoid fk_chat_messages_thread violation
      if (!knownChatThreadIds.has(cleanPayload.thread_id)) {
        try {
          const { data: thrRow } = await client.from('chat_threads').select('id').eq('id', cleanPayload.thread_id).maybeSingle();
          if (thrRow) {
            knownChatThreadIds.add(thrRow.id);
          } else {
            // Attempt to auto-heal / backfill thread in chat_threads
            const db = getDb();
            const localThr = (db.chat_threads || []).find((t: any) => t.id === cleanPayload.thread_id || t.deal_id === cleanPayload.thread_id);
            const localOrder = (db.ugc_orders || []).find((o: any) => o.id === cleanPayload.thread_id);
            const localDeal = (db.deals || []).find((d: any) => d.id === cleanPayload.thread_id);

            let cId = localThr?.creator_id || localOrder?.creator_id || localDeal?.creator_id;
            let bId = localThr?.brand_id || localOrder?.brand_id || localDeal?.brand_id;

            if (cId && bId) {
              await client.from('chat_threads').upsert({
                id: cleanPayload.thread_id,
                deal_id: localThr?.deal_id || cleanPayload.thread_id,
                creator_id: cId,
                brand_id: bId,
                status: localThr?.status || 'ACTIVE',
                flow_state: localThr?.flow_state || localThr?.status || 'ACTIVE',
                agreed_amount: localThr?.agreed_amount || 0,
                revision_count: localThr?.revision_count || 5,
                created_at: localThr?.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString()
              }, { onConflict: 'id' });
              knownChatThreadIds.add(cleanPayload.thread_id);
            }
          }
        } catch (thrHealErr) {
          // Non-blocking
        }
      }

      // 3. Attempt insert
      let { data, error } = await client.from('chat_messages').insert(cleanPayload);

      if (error) {
        // Fallback A: Schema columns missing (message_type / metadata / sender_role)
        if (error.code === '42703' || (error.message && (error.message.includes('message_type') || error.message.includes('metadata') || error.message.includes('sender_role')))) {
          let retryPayload = { ...cleanPayload };
          if (error.message && error.message.includes('sender_role')) {
            delete retryPayload.sender_role;
          } else {
            const { message_type, metadata, sender_role, ...legacyPayload } = cleanPayload;
            retryPayload = legacyPayload;
          }
          const retry = await client.from('chat_messages').insert(retryPayload);
          data = retry.data;
          error = retry.error;
        }

        // Fallback B: Foreign key constraint violation on sender/receiver user ID (23503)
        if (error && error.code === '23503' && error.message && (error.message.includes('user_id') || error.message.includes('users'))) {
          const userSafePayload = { ...cleanPayload, sender_user_id: null, receiver_user_id: null };
          const retry = await client.from('chat_messages').insert(userSafePayload);
          data = retry.data;
          error = retry.error;
        }

        // Fallback C: Thread is local-only or mock-only
        if (error && error.code === '23503' && error.message && error.message.includes('fk_chat_messages_thread')) {
          // Thread only exists in local mock storage; gracefully acknowledge without error
          return { data: null, error: null };
        }

        if (error) {
          console.warn("[chat_messages] Insert notice in Supabase:", error.message || error);
          return { data, error };
        }
      }
      return { data, error: null };
    } catch (err: any) {
      console.warn("[chat_messages] Insert handled exception:", err?.message || err);
      return { data: null, error: err };
    }
  }

  const { getSignedUgcUrl, ensureBucketExists, processBase64Image } = createStorageHelpers(() => ({ supabase, privilegedSupabase }));

  // Hardcoded initial creators seeds
  const SEED_CREATORS = [];

  const SEED_CAMPAIGNS = [];

  interface DbState {
    users: any[];
    user_sessions: any[];
    user_plain_passwords?: Record<string, string>;
    creator_profiles: any[];
    brand_profiles: any[];
    campaigns: any[];
    waves: any[];
    collabs: any[];
    verifications: any[];
    creator_kyc?: any[];
    brand_kyc?: any[];
    reports: any[];
    notifications: any[];
    platform_settings: {
      brand_markup_pct: number;
      creator_deduction_pct: number;
      agency_markup_pct: number;
      agency_deduction_pct: number;
      ai_review_enabled?: boolean;
      maintenance_mode_creator?: boolean;
      maintenance_creator_until?: string | null;
      maintenance_mode_brand?: boolean;
      maintenance_brand_until?: string | null;
      maintenance_message?: string;
      maintenance_enabled_by?: string | null;
      maintenance_enabled_at?: string | null;
    };
    chat_messages: any[];
    campaign_performance: any[];
    files: any[];
    team_activity_logs?: any[];
    creator_payment_methods?: any[];
    transactions?: any[];
    escrow_transactions?: any[];
    fee_configs?: any[];
    chat_threads?: any[];
    deal_offers?: any[];
    message_flags?: any[];
    user_violations?: any[];
    waitlist?: any[];
    saved_creators?: any[];
    collab_cost_requests?: any[];
    brief_requests?: any[];
    creator_portfolio?: any[];
    collab_proof_submissions?: any[];
    invoice_clients?: any[];
    invoice_billing_profile?: any[];
    creator_reviews?: any[];
    brand_reviews?: any[];
    invoices?: any[];
    ugc_briefs?: any[];
    ugc_orders?: any[];
    ugc_deliveries?: any[];
    ugc_showcase?: any[];
    ugc_reviews?: any[];
    deals?: any[];
    content_submissions?: any[];
    admin_permissions?: any[];
    earnings?: any[];
    banners?: any[];
    admin_auth_logs?: any[];
    admin_activity_logs?: any[];
    blocked_message_attempts?: any[];
    chat_violations?: any[];
    master_tags?: any[];
    entity_tags?: any[];
    platform_fee_config?: any;
    coupons?: any[];
    coupon_redemptions?: any[];
    referrals?: any[];
    app_versions?: any[];
    warning_templates?: any[];
    templates?: any[];
    support_tickets?: any[];
    ticket_messages?: any[];
    referral_config?: any;
    analytics_reports?: any[];
  }

  const DEFAULT_WARNING_TEMPLATES = [
    {
      template_id: "warn_off_platform",
      name: "Off-Platform Communication / Payment Attempt",
      subtype: "warning",
      text: "Attempting to take communication or payments outside of the platform is a violation of Ybex Terms of Service."
    },
    {
      template_id: "warn_missed_deadline",
      name: "Repeated Missed Deliverable Deadlines",
      subtype: "warning",
      text: "You have failed to submit deliverables within the agreed-upon timeline without prior communication."
    },
    {
      template_id: "warn_inappropriate_conduct",
      name: "Unprofessional or Inappropriate Conduct",
      subtype: "warning",
      text: "Your recent messages or behavior violate our community guidelines regarding professional conduct."
    },
    {
      template_id: "warn_content_guidelines",
      name: "Deliverable Quality / Policy Non-Compliance",
      subtype: "warning",
      text: "Content submitted does not adhere to platform quality benchmarks or brand brief guidelines."
    },
    {
      template_id: "warn_spam_unsolicited",
      name: "Spam or Unsolicited Promotional Outreach",
      subtype: "warning",
      text: "Sending unsolicited spam or excessive direct solicitations to users is strictly prohibited."
    }
  ];

  function getInitialDbState(): DbState {
    const db: DbState = {
      users: [],
      user_sessions: [],
      user_plain_passwords: {},
      creator_profiles: [],
      brand_profiles: [],
      campaigns: [],
      waves: [],
      collabs: [],
      verifications: [],
      waitlist: [],
      reports: [],
      notifications: [],
      platform_settings: {
        brand_markup_pct: 2.0,
        creator_deduction_pct: 2.0,
        agency_markup_pct: 5.0,
        agency_deduction_pct: 5.0,
        ai_review_enabled: false,
      },
      chat_messages: [],
      campaign_performance: [],
      files: [],
      ugc_orders: [],
      team_activity_logs: [],
      creator_payment_methods: [],
      transactions: [],
      fee_configs: [{ id: 1, threshold_amount: 20000, below_threshold_rate: 15.0, above_threshold_rate: 5.0, gst_rate: 18.0 }],
      chat_threads: [],
      deal_offers: [],
      message_flags: [],
      user_violations: [],
      saved_creators: [],
      collab_cost_requests: [],
      brief_requests: [],
      creator_portfolio: [],
      collab_proof_submissions: [],
      invoice_clients: [],
      invoice_billing_profile: [],
      creator_reviews: [],
      invoices: [],
      ugc_briefs: [],
      ugc_deliveries: [],
      ugc_showcase: [],
      ugc_reviews: [],
      earnings: [],
      // v346: no sample promo banners with real brand names (boAt / Nike) — with no admin banners
      // the /banners list is simply empty and the dashboard hides the carousel.
      banners: [],
      admin_auth_logs: [],
      admin_activity_logs: [],
      blocked_message_attempts: [],
      chat_violations: [],
      master_tags: [],
      entity_tags: [],
      support_tickets: [],
      ticket_messages: [],
      app_versions: [],
      warning_templates: [...DEFAULT_WARNING_TEMPLATES],
      referral_config: {
        creator_referral_reward: 500,
        brand_referral_reward: 1000,
        referral_trigger_action: 'first_completed_collab',
        referral_monthly_cap: 10,
        referral_enabled: true
      }
    };

    // Session 38 (Ravi): no demo data. This used to add four "seed" users (a demo admin and two
    // made-up chat violators with phone numbers) and four fake chat violations to every fresh
    // store — on Cloud Run that is every new instance — and the admin Chat / Reports tabs showed
    // them as real. Admin accounts live in Supabase only (rule 48). Defaults above stay
    // (platform settings, warning templates, default banners, referral config).
    return db;
  }

  let cloudDbLoaded = false;
  let syncEnabled = false;
  async function loadDbFromSupabase() {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from("ybex_sync")
        .select("state")
        .eq("id", 1)
        .maybeSingle();

      if (error) {
        console.log("Could not load state from Supabase table 'ybex_sync':", error.message);
        return;
      }

      syncEnabled = true;
      cloudDbLoaded = true;

      const localFileAlreadyExists = fs.existsSync(DB_PATH);

      if (data && data.state) {
        if (!localFileAlreadyExists) {
          fs.writeFileSync(DB_PATH, JSON.stringify(data.state, null, 2), "utf8");
          // The file changed underneath the in-memory copy — re-read it on next access.
          dbCache = null;
          console.log("No local database found. Seeded local state from Supabase cloud backup.");
        } else {
          console.log("Local database file already exists — skipping cloud overwrite to avoid clobbering local data.");
        }
      } else {
        console.log("Supabase connected. Dedicated tables will be used for state.");
      }
      
    } catch (err: any) {
      console.log("Supabase load error:", err.message);
    }
  }

  // Auto trigger load if supabase is ready
  if (supabase) {
    loadDbFromSupabase();
  }

  // In-memory copy of the local store.
  //
  // getDb() used to read and JSON.parse the WHOLE db_mock.json synchronously on every call — 267
  // call sites, often several per request. Sync file I/O blocks Node's event loop, so every other
  // user's request waited behind it, and the cost grew with the file. The store is now parsed
  // once and kept in memory; saveDb() keeps that copy current and writes the file in the
  // background (debounced), flushing on shutdown. The file is still the persistence — it is just
  // no longer re-read on every access.
  let dbCache: DbState | null = null;
  function getDb(): DbState {
    if (dbCache) return dbCache;
    dbCache = readDbFromDisk();
    return dbCache;
  }
  function readDbFromDisk(): DbState {
    if (!fs.existsSync(DB_PATH)) {
      const dbState = getInitialDbState();
      fs.writeFileSync(DB_PATH, JSON.stringify(dbState, null, 2), "utf8");
      return dbState;
    }
    try {
      const data = fs.readFileSync(DB_PATH, "utf8");
      // An empty file (as shipped in v171c, which drops the seed users and their plain-text
      // passwords) is a fresh store, not a corrupted one: no CRITICAL log, no .bak per start.
      if (!data.trim()) {
        const fresh = getInitialDbState();
        fs.writeFileSync(DB_PATH, JSON.stringify(fresh, null, 2), "utf8");
        return fresh as any;
      }
      const parsed = JSON.parse(data);
      if (!parsed.ugc_orders) parsed.ugc_orders = [];
      if (!parsed.team_activity_logs) parsed.team_activity_logs = [];
      if (!parsed.creator_payment_methods) parsed.creator_payment_methods = [];
      if (!parsed.transactions) parsed.transactions = [];
      if (!parsed.fee_configs) parsed.fee_configs = [{ id: 1, threshold_amount: 20000, below_threshold_rate: 15.0, above_threshold_rate: 5.0, gst_rate: 18.0 }];
      if (!parsed.chat_threads) parsed.chat_threads = [];
      if (!parsed.deal_offers) parsed.deal_offers = [];
      if (!parsed.message_flags) parsed.message_flags = [];
      if (!parsed.user_violations) parsed.user_violations = [];
      if (!parsed.verifications) parsed.verifications = [];
      if (!parsed.saved_creators) parsed.saved_creators = [];
      if (!parsed.collab_cost_requests) parsed.collab_cost_requests = [];
      if (!parsed.brief_requests) parsed.brief_requests = [];
      if (!parsed.creator_portfolio) parsed.creator_portfolio = [];
      if (!parsed.collab_proof_submissions) parsed.collab_proof_submissions = [];
      if (!parsed.invoice_clients) parsed.invoice_clients = [];
      if (!parsed.invoice_billing_profile) parsed.invoice_billing_profile = [];
      if (!parsed.creator_reviews) parsed.creator_reviews = [];
      if (!parsed.invoices) parsed.invoices = [];
      if (!parsed.ugc_briefs) parsed.ugc_briefs = [];
      if (!parsed.ugc_deliveries) parsed.ugc_deliveries = [];
      if (!parsed.ugc_showcase) parsed.ugc_showcase = [];
      if (!parsed.ugc_reviews) parsed.ugc_reviews = [];
      // v346: never refill sample banners; also drop the old boAt / Nike samples saved by earlier versions.
      if (!Array.isArray(parsed.banners)) parsed.banners = [];
      parsed.banners = parsed.banners.filter((b: any) => !["banner-ugc-boat", "banner-nike-pegasus"].includes(String(b?.id || "")));
      if (!parsed.notifications) parsed.notifications = [];
      if (!parsed.admin_activity_logs) parsed.admin_activity_logs = [];
      if (!parsed.blocked_message_attempts) parsed.blocked_message_attempts = [];
      if (!parsed.chat_violations) parsed.chat_violations = [];
      if (!parsed.master_tags) parsed.master_tags = [];
      if (!parsed.entity_tags) parsed.entity_tags = [];
      if (!parsed.app_versions) parsed.app_versions = [];
      if (!parsed.warning_templates || parsed.warning_templates.length === 0) parsed.warning_templates = [...DEFAULT_WARNING_TEMPLATES];
      // Session 24: wipe any plain-text passwords saved by older versions.
      parsed.user_plain_passwords = {};
      if ((parsed as any).plain_passwords) (parsed as any).plain_passwords = {};

      // Ensure essential arrays exist
      if (!parsed.users) parsed.users = [];
      if (!parsed.campaigns) parsed.campaigns = [];
      if (!parsed.user_sessions) parsed.user_sessions = [];

      return parsed;
    } catch (e: any) {
      console.error("[getDb] CRITICAL: db_mock.json failed to parse — the file may be corrupted:", e?.message || e);
      try {
        if (fs.existsSync(DB_PATH)) {
          const backupPath = `${DB_PATH}.corrupted-${Date.now()}.bak`;
          fs.copyFileSync(DB_PATH, backupPath);
          console.error(`[getDb] Backed up the corrupted file to ${backupPath} before falling back to a blank state. Restore from this backup if needed.`);
        }
      } catch (backupErr) {
        console.error("[getDb] Failed to back up corrupted db file:", backupErr);
      }
      const dbState = getInitialDbState();
      return dbState;
    }
  }

  // Session 24 security: passwords are NEVER stored or shown in plain text. These used to write
  // every typed password into db_mock.json (user_plain_passwords) and hand it to admin screens.
  // Kept as no-ops so existing callers compile; the stored map is wiped on load (see below).
  function recordUserPassword(_userId: string | null | undefined, _email: string | null | undefined, _password: string | null | undefined) {
    return;
  }

  function getUserPassword(_userId: string | null | undefined, _email?: string | null | undefined): string | null {
    return null;
  }

  let dbSaveQueue: Promise<void> = Promise.resolve();

  function writeDbFileAtomic(db: DbState) {
    const tmpPath = `${DB_PATH}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), "utf8");
    fs.renameSync(tmpPath, DB_PATH);
  }

  function saveDb(db: DbState) {
    // Keep the in-memory copy authoritative (callers may pass a freshly built object).
    dbCache = db;
    scheduleDbFlush();
  }

  let dbFlushTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleDbFlush() {
    if (dbFlushTimer) return;
    // Many handlers call saveDb() several times per request; one write covers them all.
    dbFlushTimer = setTimeout(() => {
      dbFlushTimer = null;
      flushDbNow();
    }, 300);
  }
  function flushDbNow() {
    const db = dbCache;
    if (!db) return;
    if (dbFlushTimer) { clearTimeout(dbFlushTimer); dbFlushTimer = null; }
    persistDb(db);
  }
  // Never lose the last write on a deploy/restart.
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.once(sig, () => { try { flushDbNow(); } catch (e) { logIgnored("server:1223", e); } process.exit(0); });
  }
  process.once("beforeExit", () => { try { flushDbNow(); } catch (e) { logIgnored("server:1225", e); } });

  function persistDb(db: DbState) {
    try {
      writeDbFileAtomic(db);
    } catch (e) {
      console.error("Error writing to local DB_PATH:", e);
    }

    // Session 52 (Ravi: "sara data ek hi jagah blob mein toh nahi ja raha?"): the whole-app backup into
    // the single `ybex_sync` row is OFF. Every real record has its own table; this upload had been
    // failing on every save (the table has no updated_at column) and only cost bandwidth.
    // YBEX_SYNC_BLOB=true turns the old behaviour back on.
    if (supabase && syncEnabled && process.env.YBEX_SYNC_BLOB === "true") {
      (async () => {
        try {
          const { error }: any = await (privilegedSupabase || supabase).from("ybex_sync").upsert({ 
            id: 1, 
            state: db,
            updated_at: new Date().toISOString()
          });
          if (error) {
            if (error.message && error.message.includes("row-level security policy")) {
              console.log("[Supabase Sync] Read-only mode active: 'ybex_sync' table is protected by Row Level Security (RLS) policies.");
              syncEnabled = false;
            } else {
              console.log("[Supabase Sync] Backup write status:", error.message);
            }
          } else {
            console.log("App state successfully backed up to Supabase Cloud.");
          }
        } catch (err: any) {
          console.log("Supabase write catch:", err);
        }
      })();
    }
  }

  function getActingBrandId(user: any) {
    if (!user) return null;
    return user.parent_brand_id || user.user_id;
  }


  function logTeamActivity(db: any, user: any, action: string, detail: string) {
    if (!db.team_activity_logs) db.team_activity_logs = [];
    const actingBrandId = user.parent_brand_id || user.user_id;
    const row = {
      log_id: `log_${Math.random().toString(36).substring(2, 11)}`,
      brand_user_id: actingBrandId,
      user_id: user.user_id,
      user_name: user.name,
      user_email: user.email,
      team_role: user.team_role || "admin",
      action,
      detail,
      created_at: getIsoNow()
    };
    db.team_activity_logs.push(row);
    // Session 52: also kept in its own table (it used to live only in this server's memory and was
    // lost on every restart). Fire and forget — the action itself never waits for the log.
    if (privilegedSupabase) {
      Promise.resolve(privilegedSupabase.from("team_activity_logs").insert(row))
        .then((r: any) => { if (r?.error) console.warn("[team log] insert:", r.error.message); })
        .catch((e: any) => logIgnored("server:teamLog", e));
    }
  }

  const { broadcastAdminNotification, sendActivityNotificationEmail, sendSuperAdminAlertEmail, sendNotification } = createNotificationService({ clients: () => ({ supabase, privilegedSupabase }), getDb: () => getDb(), saveDb: (d: any) => saveDb(d), getIsoNow: () => getIsoNow(), app });
  // v396 (QA E-7): tell the creator (bell + e-mail) once a brand's campaign payment is held — backend/escrowNotify.ts
  if (process.env.NODE_ENV !== "test" && !process.env.VITEST) startEscrowNotify({ client: () => privilegedSupabase || null, sendNotification });

  // Session 38: markup %s come from Supabase (platform_fee_config, see backend/platformSettings.ts),
  // cached in memory and refreshed every minute; the local file is only the fallback.
  const platformSettingsStore = createPlatformSettingsStore({ getClient: () => privilegedSupabase || null });
  setTimeout(() => { platformSettingsStore.refresh(); }, 0);
  const platformSettingsTimer: any = setInterval(() => { platformSettingsStore.refresh(); loadFeeConfig(privilegedSupabase || supabase, 0).catch(() => {}); }, 30 * 60 * 1000); // v429 (Supabase log limit): every 30 min (v422: 5 min); admin saves update the copy at once
  setTimeout(() => { loadFeeConfig(privilegedSupabase || supabase, 0).catch(() => {}); }, 0); // v364: split-fee flag for markupForRole
  if (platformSettingsTimer && typeof platformSettingsTimer.unref === "function") platformSettingsTimer.unref();
  function getSettings(db: DbState) {
    return platformSettingsStore.get(db.platform_settings);
  }

  function markupForRole(role: string | null | undefined, settings: any): number {
    // v364 (Ravi: "brand_markup_pct aur nayi 8% fee double na lagein"): in the split model the brand fee is added at
    // payment, so rate cards are shown at the creator's own price (no 2% / agency markup).
    if (splitFeeOn()) return 0;
    if (role === "brand") return settings.brand_markup_pct;
    if (role === "talent_manager") return settings.agency_markup_pct;
    return 0;
  }


  
  async function logAdminAuth(user_id, email, eventType, ip, ua) {
    const logItem = {
      user_id: user_id,
      email: email,
      event_type: eventType,
      ip_address: ip || 'unknown',
      user_agent: ua || 'unknown',
      created_at: new Date().toISOString()
    };

    const db = getDb();
    if (!db.admin_auth_logs) db.admin_auth_logs = [];
    db.admin_auth_logs.push(logItem);
    saveDb(db);

    const activeClient = privilegedSupabase;
    if (!activeClient) {
      console.log("No privileged Supabase client available; skipping Supabase auth log write (saved to local fallback).");
      return;
    }

    // Check if the user actually exists in the users table to prevent foreign key constraint violations
    if (user_id) {
      const { data: userExists, error: checkErr } = await activeClient.from('users').select('user_id').eq('user_id', user_id).maybeSingle();
      if (!userExists || checkErr) {
        console.log(`Skipping Supabase write for admin auth log because user_id ${user_id} does not exist in the users table.`);
        return;
      }
    } else {
      console.log(`Skipping Supabase write for admin auth log because user_id is null/empty.`);
      return;
    }

    const { error } = await activeClient.from('admin_auth_logs').insert(logItem);
    if (error) {
      console.warn("Failed to write admin auth log to Supabase (using local fallback):", error.message);
    }
  }

  async function getPermissionsForUser(userId: string) {
    if (!userId) return [];
    let perms: any[] = [];
    const activeClient = privilegedSupabase || supabase;
    if (activeClient) {
      try {
        const { data, error } = await activeClient.from('admin_permissions').select('*').eq('user_id', userId);
        if (!error && data && data.length > 0) perms = data;
      } catch (e) { logIgnored("server:1427", e); }
    }
    if (perms.length === 0) {
      const db = getDb();
      if (db.admin_permissions) {
        perms = db.admin_permissions.filter((p: any) => p.user_id === userId);
      }
    }
    return perms;
  }

  async function checkAdminPerm(user: any, perm: string) {
    if (!user) return false;
    if (user.role === 'admin' && user.team_role !== 'sub_admin' && user.role !== 'sub_admin') return true;
    if (user.team_role === 'sub_admin' || user.role === 'sub_admin') {
       if (user.permissions && Array.isArray(user.permissions) && user.permissions.length > 0) {
         const hasIt = user.permissions.some((p: any) => {
           if (typeof p === 'string') return p === perm;
           if (p && typeof p === 'object') return (p.permission_key === perm || p.key === perm) && (p.allowed === true || p.allowed === 1 || p.allowed === 'true');
           return false;
         });
         if (hasIt) return true;
       }
       const perms = await getPermissionsForUser(user.user_id);
       if (perms && perms.length > 0) {
         return perms.some((p: any) => {
           if (typeof p === 'string') return p === perm;
           if (p && typeof p === 'object') return (p.permission_key === perm || p.key === perm) && (p.allowed === true || p.allowed === 1 || p.allowed === 'true');
           return false;
         });
       }
    }
    return false;
  }
  
  async function logAdminAction(user, action, targetType, targetId, detail) {
    const logItem = {
      admin_id: user?.user_id,
      user_id: user?.user_id || null, // Session 58: the log screen shows who did it (every row said "System")
      email: user?.email || null,
      action: action,
      target_id: String(targetId),
      target_type: targetType || null,
      details: JSON.stringify(detail || {}),
      created_at: new Date().toISOString()
    };

    const db = getDb();
    if (!db.admin_activity_logs) db.admin_activity_logs = [];
    db.admin_activity_logs.push(logItem);
    saveDb(db);

    const activeClient = privilegedSupabase;
    if (!activeClient) {
      console.log("No privileged Supabase client available; skipping Supabase activity log write (saved to local fallback).");
      return;
    }

    // Check if the admin user actually exists in the users table to prevent foreign key constraint violations
    const adminId = user?.user_id;
    if (adminId) {
      const { data: adminExists, error: checkErr } = await activeClient.from('users').select('user_id').eq('user_id', adminId).maybeSingle();
      if (!adminExists || checkErr) {
        console.log(`Skipping Supabase write for admin activity log because admin_id ${adminId} does not exist in the users table.`);
        return;
      }
    } else {
      console.log(`Skipping Supabase write for admin activity log because admin_id is null/empty.`);
      return;
    }

    const { error } = await activeClient.from('admin_activity_logs').insert(logItem);
    if (error) {
      console.warn("Failed to write admin activity log to Supabase (using local fallback):", error.message || error);
    }
  }

  function sanitizeBrandProfile(bp: any) {
    if (!bp) return bp;
    try {
      const db = getDb();
      const localBp = db.brand_profiles?.find((p: any) => p.user_id === bp.user_id);
      if (localBp) {
        bp = { ...localBp, ...bp };
      }
    } catch (e) {
      console.error("Error merging brand profile with local db:", e);
    }
    let cover_image = bp.cover_image || "";
    let description = bp.description || "";
    if (bp.description && typeof bp.description === "string") {
      const match = bp.description.match(/\n\[cover_image\]:(.+)$/);
      if (match) {
        cover_image = match[1];
        description = bp.description.replace(/\n\[cover_image\]:(.+)$/, "");
      }
    }
    return {
      ...bp,
      cover_image,
      description
    };
  }

  function sanitizeCreatorProfile(cp: any, localProfile?: any) {
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
      niche = niche.filter(n => n !== "Go to Settings & select category first");
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
  }

  const authLookup = createAuthLookupCache();
  app.set("authLookup", authLookup);

  // Session 53 (security): a banned or deleted account's old login stops working at once. Before, a
  // ban only blocked NEW logins; a phone that was already signed in kept full access.
  // Session 58 (security): brute-force lock for the hidden quick-admin PIN (per server copy).
  async function parseAuthUserRaw(req: any) {
    const u: any = await parseAuthUserFromToken(req);
    if (u && isSupportToken(requestToken(req))) { req._supportUserId = u.user_id; u.support_mode = true; u.support_admin_id = supportAdminOf(requestToken(req)); } // v429
    if (u && (u.banned === true || u.is_deleted === true)) return null;
    // Session 58 (Ravi: suspended users shouldn't use the dashboard): a suspension now really blocks the account until
    // users.suspended_until (column added), on every device at once.
    if (u && u.suspended_until && Date.parse(u.suspended_until) > Date.now()) return null;
    return u;
  }
  async function parseAuthUserFromToken(req: any) {
    let token = "";
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else if (req.headers.cookie) {
      const match = req.headers.cookie.match(/session_token=([^;]+)/);
      if (match) token = match[1];
    }

    if (!token) return null;

    if (isDemoLoginEnabled() && (token === "dev_bypass" || token === "dev_bypass_2")) { // brackets: `a && b || c` let dev_bypass_2 in with demo logins OFF
      let uid = token === "dev_bypass_2" ? "dev-user-id-999" : "dev-user-id-12345";
      let devUser: any = {
        user_id: uid,
        name: "Developer Bypass",
        email: "dev@ybex.io",
        role: "creator",
        onboarded: true,
        onboarding_completed: true,
        onboarding_complete: true,
        email_verified: true,
        verified: true,
        is_deleted: false,
        banned: false,
        suspended: false,
        picture: "https://api.dicebear.com/7.x/avataaars/svg?seed=Dev"
      };
      if (supabase) {
        try {
          const { data: existing } = await (privilegedSupabase || supabase).from('users').select('*').eq('user_id', devUser.user_id).maybeSingle();
          if (existing) {
            devUser = { 
              ...devUser, 
              ...existing, 
              role: "creator", 
              onboarded: true, 
              onboarding_completed: true, 
              onboarding_complete: true,
              email_verified: true,
              verified: true,
              is_deleted: false, 
              banned: false, 
              suspended: false 
            };
            if (!existing.onboarded || !existing.verified) {
              await (privilegedSupabase || supabase).from('users').update({ 
                onboarded: true,
                verified: true
              }).eq('user_id', devUser.user_id);
            }
          } else {
            const safeUser = {
              user_id: devUser.user_id,
              email: devUser.email,
              name: devUser.name,
              role: devUser.role,
              picture: devUser.picture,
              onboarded: true,
              verified: true,
              is_deleted: false,
              banned: false,
              created_at: new Date().toISOString()
            };
            await (privilegedSupabase || supabase).from('users').upsert(safeUser);
          }

          // Ensure a matching profile in creator_profiles
          const { data: existingProfile } = await (privilegedSupabase || supabase).from('creator_profiles').select('user_id').eq('user_id', devUser.user_id).maybeSingle();
          if (!existingProfile) {
            const seed_num = devUser.user_id.split("").reduce((accum: number, char: string) => accum + char.charCodeAt(0), 0);
            const er = parseFloat((3.5 + (seed_num % 70) / 10).toFixed(2));
            const fake = parseFloat(((seed_num % 15) + 2).toFixed(1));
            const avg_views = 12000;
            const perf = 85;
            const defaultProfile = {
              user_id: devUser.user_id,
              name: devUser.name,
              email: devUser.email,
              picture: devUser.picture,
              photo: devUser.picture,
              bio: "Bypass creator profile for development and testing.",
              category: "Fashion & Lifestyle",
              sub_categories: ["Reels", "Stories"],
              city: "Mumbai",
              state: "Maharashtra",
              languages: ["English", "Hindi"],
              gender: "Female",
              followers_instagram: 145000,
              followers_youtube: 50000,
              rate_card: { reels: 15000, stories: 5000, youtube_integration: 25000, cover_image: "" },
              barter: "cash_only",
              payment_terms: "within_30_days",
              creator_type: "influencer",
              work_mode: "active",
              engagement_rate: er,
              fake_follower_pct: fake,
              avg_views_30d: avg_views,
              performance_score: perf,
              profile_views: 120,
              onboarding_complete: true,
              updated_at: new Date().toISOString()
            };
            await (privilegedSupabase || supabase).from('creator_profiles').upsert(defaultProfile);
          }
        } catch (e) {
          console.error("Bypass sync error for creator:", e);
        }
      }
      return devUser;
    }

    if (isDemoLoginEnabled() && token === "dev_bypass_brand") {
      let devUser: any = {
        user_id: "dev-brand-id-12345",
        name: "Nexus Brands",
        email: "nexus_brand@ybex.io",
        role: "brand",
        onboarded: true,
        onboarding_completed: true,
        onboarding_complete: true,
        email_verified: true,
        verified: true,
        is_deleted: false,
        banned: false,
        suspended: false,
        picture: "https://api.dicebear.com/7.x/avataaars/svg?seed=Brand"
      };
      if (supabase) {
        try {
          const { data: existing } = await (privilegedSupabase || supabase).from('users').select('*').eq('user_id', devUser.user_id).maybeSingle();
          if (existing) {
            devUser = { 
              ...devUser, 
              ...existing, 
              role: "brand", 
              onboarded: true, 
              onboarding_completed: true, 
              onboarding_complete: true,
              email_verified: true,
              verified: true,
              is_deleted: false, 
              banned: false, 
              suspended: false 
            };
            if (!existing.onboarded || !existing.verified) {
              await (privilegedSupabase || supabase).from('users').update({ 
                onboarded: true,
                verified: true
              }).eq('user_id', devUser.user_id);
            }
          } else {
            const safeUser = {
              user_id: devUser.user_id,
              email: devUser.email,
              name: devUser.name,
              role: devUser.role,
              picture: devUser.picture,
              onboarded: true,
              verified: true,
              is_deleted: false,
              banned: false,
              created_at: new Date().toISOString()
            };
            await (privilegedSupabase || supabase).from('users').upsert(safeUser);
          }

          // Ensure a matching profile in brand_profiles
          const { data: existingProfile } = await (privilegedSupabase || supabase).from('brand_profiles').select('user_id').eq('user_id', devUser.user_id).maybeSingle();
          if (!existingProfile) {
            const defaultProfile = {
              user_id: devUser.user_id,
              company_name: devUser.name,
              industry: "Smart Tech & E-Commerce",
              website: "https://nexus-brands.example.com",
              description: "Nexus Brands is a premium brand storytelling ecosystem.\n[cover_image]:https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&auto=format&fit=crop",
              logo: devUser.picture,
              onboarding_complete: true,
              created_at: new Date().toISOString()
            };
            await (privilegedSupabase || supabase).from('brand_profiles').upsert(defaultProfile);
          }
        } catch (e) {
          console.error("Bypass sync error for brand:", e);
        }
      }
      return devUser;
    }

    // v378 (Ravi: "quick login ka option complete hata dena hai, app ab public hai"): the hidden /admin/ybx PIN entry
    // (ADMIN_QUICK_PIN, token "dev_bypass_admin|<pin>") is removed. Admins log in with their normal account only.
    if (isDemoLoginEnabled() && token === "dev_bypass_admin") {
      let devUser: any = {
        user_id: "dev-admin-id-12345",
        name: "System Admin (Super Admin)",
        email: "admin@ybex.io",
        role: "admin",
        team_role: "owner",
        onboarded: true,
        onboarding_completed: true,
        onboarding_complete: true,
        email_verified: true,
        verified: true,
        is_deleted: false,
        banned: false,
        suspended: false,
        picture: "https://api.dicebear.com/7.x/avataaars/svg?seed=Admin"
      };
      if (supabase) {
        try {
          const { data: existing } = await (privilegedSupabase || supabase).from('users').select('*').eq('user_id', devUser.user_id).maybeSingle();
          if (existing) {
            devUser = { 
              ...devUser, 
              ...existing, 
              role: "admin", 
              team_role: "owner", 
              onboarded: true, 
              onboarding_completed: true, 
              onboarding_complete: true,
              email_verified: true,
              verified: true,
              is_deleted: false, 
              banned: false, 
              suspended: false 
            };
            if (!existing.onboarded || !existing.verified) {
              await (privilegedSupabase || supabase).from('users').update({ 
                onboarded: true,
                verified: true
              }).eq('user_id', devUser.user_id);
            }
          } else {
            const safeUser = {
              user_id: devUser.user_id,
              email: devUser.email,
              name: devUser.name,
              role: devUser.role,
              picture: devUser.picture,
              onboarded: true,
              verified: true,
              is_deleted: false,
              banned: false,
              created_at: new Date().toISOString()
            };
            await (privilegedSupabase || supabase).from('users').upsert(safeUser);
          }
        } catch (e) {
          console.error("Bypass sync error:", e);
        }
      }
      return devUser;
    }

    // v396 (QA S-3, high): when the database ANSWERED "no such session" (logged out elsewhere, deleted, expired), the
    // copy in this server's memory must not log the person in again — it did, until the instance restarted.
    let dbSaidNoSession = false;
    if (supabase) {
      try {
        // The session and user lookups use the privileged client. With the anon key, RLS can
        // hide these rows, the lookup comes back empty, and the request silently falls back to
        // the local in-memory store — which only knows sessions created on THIS server instance.
        // That is how a brand could open the Create Campaign page (one instance) and then get
        // "Only brands can post campaigns" on submit (another instance, or after a restart).
        const authDb = privilegedSupabase || supabase;
        // Session 23: parallel requests with the same token share one lookup, and token → user_id
        // is remembered for a few seconds (authLookupCache.ts). The user row is always fresh.
        const user = await authLookup.resolve(token, {
          sessionUserId: async () => {
            // v388 (QA: "Supabase ka ek transient error / 15 s timeout bhi sabko logout kar deta hai"): an error or a timeout used to
            // look exactly like "no such session" → 403 → the app wiped the login. Now it is told apart: throw → req._authDbError → /auth/me says 503.
            const { data: sess, error: sessErr } = await safePromiseTimeout(
              authDb
                .from('user_sessions')
                .select('user_id, expires_at')
                .eq('session_token', token)
                .maybeSingle(),
              15000,
              { data: null, error: { message: 'timeout' } as any }
            );
            if (sessErr) throw new Error('AUTH_DB_UNAVAILABLE');
            if (!sess?.user_id) return null;
            // Session 58 (Ravi): logins expire after 30 days without use; each day of use renews it.
            const exp = sess.expires_at ? Date.parse(sess.expires_at) : NaN;
            if (Number.isFinite(exp) && exp < Date.now()) {
              authDb.from('user_sessions').delete().eq('session_token', token).then(() => {}, () => {});
              return null;
            }
            if (!isSupportToken(token) && (!Number.isFinite(exp) || exp - Date.now() < SESSION_MS - 24 * 3600 * 1000)) { // v429: a support login is never renewed
              authDb.from('user_sessions').update({ expires_at: new Date(Date.now() + SESSION_MS).toISOString() }).eq('session_token', token).then(() => {}, () => {});
            }
            return sess.user_id;
          },
          userRow: async (sess) => {
            const { data: user, error: userErr } = await safePromiseTimeout(
              authDb
                .from('users')
                .select('*')
                .eq('user_id', sess.user_id)
                .maybeSingle(),
              15000,
              { data: null, error: { message: 'timeout' } as any }
            );
            if (userErr) throw new Error('AUTH_DB_UNAVAILABLE'); // v388: see above
            return user || null;
          },
        });
          if (user) {
            const { password_hash, ...safeUser } = user;
            if (safeUser.role === 'admin' || safeUser.role === 'sub_admin' || safeUser.team_role === 'sub_admin') {
              safeUser.onboarded = true;
              safeUser.onboarding_completed = true;
              safeUser.email_verified = true;
              safeUser.permissions = await safePromiseTimeout(getPermissionsForUser(safeUser.user_id), 15000, []);
            }
            return safeUser;
          }
          if (privilegedSupabase) dbSaidNoSession = true; // v396: answered without an error → trust it (anon key + RLS can hide rows)

        // There used to be a "direct user_id fallback" here: a bearer token equal to any
        // user_id logged in as that user. User ids appear in API responses, so anyone could
        // act as anyone, admins included. Only real session tokens are accepted now.
      } catch (err: any) {
        console.error("parseAuthUser Supabase error:", err);
        if (String(err?.message || "").includes('AUTH_DB_UNAVAILABLE')) { try { req._authDbError = true; } catch { /* frozen req */ } } // v388
      }
    }

    if (dbSaidNoSession) return null; // v396 (QA S-3)
    const db = getDb();

    if (db.user_sessions) {
      const sess = db.user_sessions.find((s: any) => s.session_token === token);
      const expired = sess?.expires_at && Number.isFinite(Date.parse(sess.expires_at)) && Date.parse(sess.expires_at) < Date.now(); // v396
      if (sess && !expired && db.users) {
        const user = db.users.find((u: any) => u.user_id === sess.user_id);
        if (user) {
          const { password_hash, ...safeUser } = user;
          if (safeUser.role === 'admin' || safeUser.role === 'sub_admin' || safeUser.team_role === 'sub_admin') {
            safeUser.onboarded = true;
            safeUser.onboarding_completed = true;
            safeUser.email_verified = true;
            safeUser.permissions = await getPermissionsForUser(safeUser.user_id);
          }
          return safeUser;
        }
      }
    }
    
    return null;
  }

  // Session 25 security: a "sub_admin" team role only means something on an admin account.
  // ~57 checks treat `team_role === 'sub_admin'` as admin staff, and a brand could give a team
  // member any team_role — so a brand member named "sub_admin" could open admin routes (even
  // create a Super Admin). Neutralised here, once, for every route.
  async function parseAuthUser(req: any) {
    return neutralizeStaffTeamRole(await parseAuthUserRaw(req));
  }




  const router = express.Router();
  // Session 28 (Ravi: "the app got slow"): every API call slower than 1.5 s is logged with its
  // path, time and status. Cloud Run → Logs → search "[slow-api]" shows which calls are slow.
  router.use((req: any, res: any, next: any) => {
    const started = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - started;
      // Session 31: every call also feeds the admin Speed report (backend/speedStats.ts, memory only).
      try { recordRequest(req.method, String(req.originalUrl || req.url || ""), ms, res.statusCode); } catch { /* never block a response */ }
      if (ms >= 1500) {
        const path = String(req.originalUrl || req.url || "").split("?")[0];
        console.warn(`[slow-api] ${req.method} ${path} ${ms}ms status=${res.statusCode}`);
      }
    });
    next();
  });
  // Session 24 security: no API answer ever carries a password or password hash.
  router.use((req: any, res: any, next: any) => {
    const json = res.json.bind(res);
    res.json = (body: any) => json(scrubSecrets(body));
    next();
  });
  // v396 (QA M-1): after a part refund, the creator's screens (Earnings, escrow list, chat chip, payout card) showed the
  // full net (e.g. ₹23,525) while the payout and its e-mail were the real ₹18,525. Answers that go to a CREATOR get the
  // after-refund net (backend/adminMoney.ts creatorShownNet). Admin screens keep the raw row (they subtract themselves).
  router.use(async (req: any, res: any, next: any) => {
    if (req.method !== "GET" || /^\/(admin|files|media|blog|ota)(\/|$)/.test(req.path)) return next();
    let role = "";
    try { const u: any = await parseAuthUser(req); role = u ? String(u.role || "") : ""; if (u && (u.team_role === "sub_admin")) role = "admin"; } catch { role = ""; }
    if (role !== "creator") return next();
    const json = res.json.bind(res);
    res.json = (body: any) => {
      let missing: Set<string> | null = null;
      try { missing = idsMissingRefund(body); } catch { missing = null; }
      const c = privilegedSupabase || supabase;
      if (!missing || !missing.size || !c) { try { applyCreatorNetAfterRefund(body); } catch { /* never block */ } return json(body); }
      // trimmed rows (locked routes): read just the refund fields of those transactions, then answer
      Promise.resolve(c.from("transactions").select("id, gross_amount, platform_fee_amount, gst_amount, creator_net_amount, refund_amount, refund_status, fee_correction_note").in("id", Array.from(missing).slice(0, 500)).eq("refund_status", "PROCESSED"))
        .then((r: any) => new Map<string, any>((r?.data || []).map((x: any) => [String(x.id), x])))
        .catch(() => new Map<string, any>())
        .then((rows) => { try { applyCreatorNetAfterRefund(body, 0, rows); } catch { /* never block */ } json(body); });
      return res;
    };
    next();
  });
  // Session 38: sub-admins only reach the admin areas the super admin enabled for them
  // (backend/adminPermissions.ts). Full admins and everyone else are unaffected here.
  router.use(adminPermissionGate({ parseAuthUser, checkAdminPerm }));
  // Session 23: every successful deal/order action pushes a live thread_updated to both sides.
  router.use(threadSyncMiddleware((req: any) => req.app.get("io")));
  const INBOX_NEUTRAL_WRITES = [/^\/notifications(\/|$)/, /^\/upload(\/|$|\?)/, /^\/auth\/(login|logout|refresh|session|otp)/, /^\/(track|analytics|events|page-?views?)(\/|$)/, /^\/admin\/(speed-report|maintenance\/shrink-photos|banners)/, /^\/creators\/[^/]+\/(save|view)$/];
  const inboxNeutralWrite = (p: string) => INBOX_NEUTRAL_WRITES.some((re) => re.test(p.split("?")[0]));
  // Session 23: any write (message, offer, sign, upload, status…) invalidates the short inbox
  // cache, so the next inbox read is fresh.
  router.use((req: any, res: any, next: any) => {
    const m = String(req.method || "").toUpperCase();
    // Session 31 (speed): writes that can never change a chat list (marking notifications read,
    // file uploads, login/session calls, page-view tracking, admin tools) no longer throw away every
    // user's inbox cache. Everything else still clears it — a message from A changes B's inbox too,
    // so a per-user clear would show B a stale list. (The cache itself is in locked chat_routes.ts.)
    if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS" && !inboxNeutralWrite(String(req.path || req.url || ""))) {
      res.on("finish", () => { if (res.statusCode < 400) clearInboxCache(); });
    }
    next();
  });

  


  // Supabase checking helper endpoint
  app.get('/api/supabase-status', async (req, res) => {
    let url = sanitizeSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) || 'https://mzcovvzkwzjvzskjqwwy.supabase.co';
    let key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!key || typeof key !== 'string' || !key.trim()) {
      key = 'sb_publishable_Vbd74GKG1eYP7NYp4qtFbg_kuQuDPKv';
    }
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(url, key);
      const { data, error } = await sb.from('ybex_sync').select('*').limit(1);
      if (error) {
        console.error("Supabase status check db error:", error);
        if (error.code === 'PGRST205' || (error.message && error.message.includes("Could not find the table"))) {
          // If PGRST205, it means the API keys and URL are fully functional and connected to the project, but the ybex_sync table has not been created yet in their database.
          return res.json({ 
            connected: true, 
            has_url: true, 
            has_key: true, 
            table_missing: true, 
            message: "Connected successfully to Supabase! The 'ybex_sync' table hasn't been created yet, but the local JSON database fallback is active and fully functional." 
          });
        }
        return res.json({ connected: false, error: JSON.stringify(error), details: error.message });
      }
      res.json({ connected: true, has_url: true, has_key: true, table_missing: false });
    } catch(e: any) {
      console.error("Supabase status-check exception:", e);
      res.json({ connected: false, error: JSON.stringify(e), details: e?.message || String(e) });
    }
  });

  // `/api/admin/run-sql` was removed: it answered ANY caller, logged in or not, with the whole
  // process.env — the Supabase service-role key, Razorpay secret, Resend key. Rotate those.

  // Maintenance Mode MiddleWare to block non-admins
  let maintenanceCache: { at: number; creatorEnabled: boolean; brandEnabled: boolean; message: string; fromCloud: boolean } | null = null;
  router.use(async (req, res, next) => {
    // 1. Skip check for static/public or basic authentication/health endpoints
    const bypassPaths = [
      "/system-status",
      "/auth/login", // also /auth/login-otp (session 42)
      "/auth/check-email",
      "/auth/signup",
      "/auth/sync",
      "/auth/onboard",
      "/auth/me",
      "/api/health",
      "/health",
      // v423 (Ravi: the Android app showed its old login screen in maintenance): the app's live-update check must work
      // during maintenance — it is how the phone app gets the build that SHOWS the maintenance page.
      "/app/android-update",
      "/app/ios-update"
    ];
    const shouldBypass = bypassPaths.some(p => req.path === p || req.path.startsWith(p));
    if (shouldBypass) {
      return next();
    }

    // Skip check for any admin paths
    if (req.path.startsWith("/admin")) {
      return next();
    }

    // v421: FORCE_MAINTENANCE=1 (server env) — everyone except /admin gets the maintenance answer, no database read.
    if (forcedMaintenance()) {
      return res.status(503).json({ under_maintenance: true, side: "all", message: forcedMaintenanceMessage() });
    }

    let creatorEnabled = false;
    let brandEnabled = false;
    let message = "";

    // Load from Supabase first — at most once every 15 s. This ran a Supabase round trip on
    // EVERY API request (every poll, every page), before the request's own work even began.
    let loadedFromCloud = false;
    const nowMs = Date.now();
    if (maintenanceCache && nowMs - maintenanceCache.at < 60000) { // v422 (Supabase egress): was 15 s
      ({ creatorEnabled, brandEnabled, message } = maintenanceCache);
      loadedFromCloud = maintenanceCache.fromCloud;
    } else if (supabase) {
      try {
        const { data, error } = await supabase
          .from("maintenance_mode")
          .select("*")
          .eq("id", "singleton")
          .maybeSingle();
        if (!error && data) {
          const row = await applyMaintenanceAutoOff(privilegedSupabase || supabase, data); // v378 (QA M12)
          creatorEnabled = !!row.creator_side_enabled;
          brandEnabled = !!row.brand_side_enabled;
          message = row.message || "";
          loadedFromCloud = true;
        }
      } catch (err) {
        // Fallback to local
      }
      maintenanceCache = { at: nowMs, creatorEnabled, brandEnabled, message, fromCloud: loadedFromCloud };
    }

    if (!loadedFromCloud) {
      const db = getDb();
      if (db.platform_settings) {
        creatorEnabled = !!db.platform_settings.maintenance_mode_creator;
        brandEnabled = !!db.platform_settings.maintenance_mode_brand;
        message = db.platform_settings.maintenance_message || "";
      }
    }

    // If neither side is undergoing maintenance, let the request through
    if (!creatorEnabled && !brandEnabled) {
      return next();
    }

    // Parse the authenticated user
    const user = await parseAuthUser(req);

    // If user is admin, allow them to bypass completely
    if (user && user.role === "admin") {
      return next();
    }

    const isCreatorPath = req.path.startsWith("/creator") || req.path.startsWith("/creators");
    const isBrandPath = req.path.startsWith("/brand") || req.path.startsWith("/brands") || req.path.startsWith("/campaigns");

    // v378: a signed-in brand browsing /creators/* (Explore) is not a creator — only the visitor's own side is paused.
    // Enforce creator maintenance
    if (creatorEnabled && (user ? user.role === "creator" : isCreatorPath)) {
      return res.status(503).json({
        under_maintenance: true,
        side: "creator",
        message: message || "Creator platform is currently undergoing scheduled maintenance. Please check back later."
      });
    }

    // Enforce brand maintenance
    if (brandEnabled && (user ? isBrandLikeRole(user.role) : isBrandPath)) { // v423: agency / talent manager are brand-side
      return res.status(503).json({
        under_maintenance: true,
        side: "brand",
        message: message || "Brand platform is currently undergoing scheduled maintenance. Please check back later."
      });
    }

    next();
  });

  // AUTH API endpoints





  // Standard Google OAuth: Get authorization URL

  // Standard Google OAuth: Callback code exchange and user info fetching

  async function fetchUserScopedTransactions(userId: string, role?: string) {
    if (!supabase) {
      const db = getDb();
      return (db.transactions || []).filter((t: any) => t.creator_id === userId || t.brand_id === userId);
    }

    try {
      // 1. Fetch deal IDs and UGC order IDs associated with this user
      const [dealsRes, ugcRes] = await Promise.all([
        (privilegedSupabase || supabase)
          .from('deals')
          .select('id, brand_id, creator_id')
          .or(`brand_id.eq.${userId},creator_id.eq.${userId}`),
        (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('id, brand_id, creator_id')
          .or(`brand_id.eq.${userId},creator_id.eq.${userId}`)
      ]);

      // v332 (Ravi "hn"): a failed read must not look like "no payments" — callers show a "couldn't load" screen.
      if (dealsRes?.error || ugcRes?.error) throw Object.assign(new Error("transactions read failed"), { code: "TX_READ_FAILED" });
      const userDeals = dealsRes?.data || [];
      const userUgcOrders = ugcRes?.data || [];

      const dealIds = userDeals.map((d: any) => d.id).filter(Boolean);
      const ugcOrderIds = userUgcOrders.map((u: any) => u.id).filter(Boolean);

      // Create lookup maps for brand_id
      const dealBrandMap = new Map(userDeals.map((d: any) => [d.id, d.brand_id]));
      const ugcBrandMap = new Map(userUgcOrders.map((u: any) => [u.id, u.brand_id]));

      let query = (privilegedSupabase || supabase)
        .from('transactions')
        .select('*, deals!deal_id(id, brand_id, creator_id, status), users!creator_id(name)');

      const orConditions: string[] = [`creator_id.eq.${userId}`];
      if (dealIds.length > 0) {
        orConditions.push(`deal_id.in.(${dealIds.join(',')})`);
      }
      if (ugcOrderIds.length > 0) {
        orConditions.push(`ugc_order_id.in.(${ugcOrderIds.join(',')})`);
      }

      query = query.or(orConditions.join(','));

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error("[fetchUserScopedTransactions] Error querying with relations:", error);
        const fallback = await (privilegedSupabase || supabase)
          .from('transactions')
          .select('*')
          .eq('creator_id', userId)
          .order('created_at', { ascending: false });
        if (!fallback.error && fallback.data) {
          return fallback.data.map((t: any) => ({
            ...t,
            amount: Number(t.gross_amount ?? t.amount ?? 0),
            gross_amount: Number(t.gross_amount ?? t.amount ?? 0),
            fee_amount: Number(t.platform_fee_amount ?? t.fee_amount ?? 0),
            platform_fee_amount: Number(t.platform_fee_amount ?? t.fee_amount ?? 0),
            creator_net_amount: Number(t.creator_net_amount ?? t.net_amount ?? (Number(t.gross_amount || 0) - Number(t.platform_fee_amount || 0))),
            net_amount: Number(t.creator_net_amount ?? t.net_amount ?? (Number(t.gross_amount || 0) - Number(t.platform_fee_amount || 0))),
            is_brand_approved: t.payout_status === 'RELEASED' || t.payout_status === 'READY_FOR_RELEASE' || t.payout_status === 'PAID'
          }));
        }
        throw Object.assign(new Error("transactions read failed"), { code: "TX_READ_FAILED" });
      }

      // Session 58 (Ravi: a Dell campaign payment showed as "UGC Deliverable · Brand partner"): name each
      // row — the campaign / brief title and the brand's name. Read-only; a failure just leaves the old labels.
      const labels = new Map<string, { title?: string; brand?: string }>();
      try {
        const c = privilegedSupabase || supabase;
        const dIds = [...new Set((data || []).map((t: any) => t.deal_id).filter(Boolean))];
        const oIds = [...new Set((data || []).map((t: any) => t.ugc_order_id).filter(Boolean))];
        const [dR, oR] = await Promise.all([
          dIds.length ? c.from('deals').select('id, campaign_id, brand_id').in('id', dIds) : { data: [] },
          oIds.length ? c.from('ugc_orders').select('id, brief_id, brand_id').in('id', oIds) : { data: [] },
        ]);
        const deals: any[] = dR?.data || [], orders: any[] = oR?.data || [];
        const campIds = [...new Set(deals.map((d) => d.campaign_id).filter(Boolean))];
        const briefIds = [...new Set(orders.map((o) => o.brief_id).filter(Boolean))];
        const brandIds = [...new Set([...deals.map((d) => d.brand_id), ...orders.map((o) => o.brand_id)].filter(Boolean))];
        const [cR, bR, pR, uR] = await Promise.all([
          campIds.length ? c.from('campaigns').select('campaign_id, title, brand_name').in('campaign_id', campIds) : { data: [] },
          briefIds.length ? c.from('ugc_briefs').select('id, title, product_name').in('id', briefIds) : { data: [] },
          brandIds.length ? c.from('brand_profiles').select('user_id, company_name').in('user_id', brandIds) : { data: [] },
          brandIds.length ? c.from('users').select('user_id, name').in('user_id', brandIds) : { data: [] },
        ]);
        const camp = new Map((cR?.data || []).map((x: any) => [String(x.campaign_id), x]));
        const brief = new Map((bR?.data || []).map((x: any) => [String(x.id), x]));
        const bName = new Map<string, string>();
        (uR?.data || []).forEach((x: any) => { if (x.name) bName.set(String(x.user_id), x.name); });
        (pR?.data || []).forEach((x: any) => { if (x.company_name) bName.set(String(x.user_id), x.company_name); });
        deals.forEach((d) => { const cp: any = camp.get(String(d.campaign_id)); labels.set(`d:${d.id}`, { title: cp?.title, brand: bName.get(String(d.brand_id)) || cp?.brand_name }); });
        orders.forEach((o) => { const br: any = brief.get(String(o.brief_id)); labels.set(`u:${o.id}`, { title: br?.title || br?.product_name, brand: bName.get(String(o.brand_id)) }); });
      } catch (e: any) {
        console.warn("[fetchUserScopedTransactions] labels skipped:", e?.message || e);
      }

      return (data || []).map((t: any) => {
        const lab = (t.deal_id && labels.get(`d:${t.deal_id}`)) || (t.ugc_order_id && labels.get(`u:${t.ugc_order_id}`)) || {};
        const brandId = t.brand_id || t.deals?.brand_id || (t.deal_id ? dealBrandMap.get(t.deal_id) : null) || (t.ugc_order_id ? ugcBrandMap.get(t.ugc_order_id) : null) || null;
        const grossAmount = Number(t.gross_amount ?? t.amount ?? 0);
        const feeAmount = Number(t.platform_fee_amount ?? t.fee_amount ?? 0);
        const netAmount = Number(t.creator_net_amount ?? t.net_amount ?? (grossAmount - feeAmount));
        const dealStatus = t.deals?.status || null;
        const isBrandApproved = t.payout_status === 'RELEASED' || t.payout_status === 'READY_FOR_RELEASE' || t.payout_status === 'PAID' || dealStatus === 'COMPLETED' || dealStatus === 'APPROVED';

        return {
          ...t,
          brand_id: brandId,
          amount: grossAmount,
          gross_amount: grossAmount,
          fee_amount: feeAmount,
          platform_fee_amount: feeAmount,
          creator_net_amount: netAmount,
          net_amount: netAmount,
          deal_status: dealStatus,
          is_brand_approved: isBrandApproved,
          campaign_title: t.campaign_title || lab.title || null,
          brand_name: t.brand_name || lab.brand || null,
          kind: t.ugc_order_id ? "ugc" : t.deal_id ? "campaign" : (t.brief_id ? "brief" : null),
        };
      });
    } catch (err: any) {
      console.error("[fetchUserScopedTransactions] Exception:", err);
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), { code: "TX_READ_FAILED" });
    }
  }


  // Scoped, authenticated escrow-transactions feed for Brand/Creator payments pages.

  // Creator Payout Eligible Deals: completed deals waiting or eligible for disbursement

  // Creator Payout Request: raises a withdrawal or payout request for a deal


  // Public: banners shown on dashboards, filtered by audience type + Live status + date window

  // Admin: full banner management (backs BannerManager.jsx, which previously had no backend at all)
  // → moved to admin_content_routes.ts (setupAdminContentRoutes)

  // ---------------------------------------------------------------------------
  // Notifications Endpoints
  // ---------------------------------------------------------------------------







  const forgotPasswordRateLimits = new Map<string, { count: number, resetAt: number }>();

  function checkForgotPasswordRateLimit(email: string): boolean {
    const normalizedEmail = email.toLowerCase();
    const now = Date.now();
    const record = forgotPasswordRateLimits.get(normalizedEmail);

    if (!record || now > record.resetAt) {
      forgotPasswordRateLimits.set(normalizedEmail, { count: 1, resetAt: now + 15 * 60 * 1000 });
      return true;
    }

    if (record.count >= 3) {
      return false;
    }

    record.count += 1;
    return true;
  }







  // Admin capabilities

  // --- Missing API Endpoints ---
  // → landing-brands / landing-reviews (public GET + admin POST/DELETE) moved to
  //   admin_content_routes.ts (setupAdminContentRoutes)








  // Admin bypass/maintenance/system-collabs/dashboard-stats → moved to admin_system_maintenance_routes.ts (setupAdminSystemMaintenanceRoutes)

  // Admin users/enforcement (warn/suspend/ban/reinstate, custom-message, violations, templates, timeline, create-admin, broadcast-email, users-list, team_role, permissions) → moved to admin_users_enforcement_routes.ts (setupAdminUsersEnforcementRoutes)

  // Admin logs (auth, activity), creator-profile admin edit, full_profile, kyc-action, set-password → moved to admin_logs_creators_routes.ts (setupAdminLogsCreatorsRoutes)


  // Public Creator Apply Form Submission (No Auth Required) - moved to misc_routes.ts (setupMiscRoutes)

  // Admin waitlist queue: list/update/approve/reject/batch-approve/message → moved to admin_waitlist_routes.ts (setupAdminWaitlistRoutes)



  // Admin Escrow Payout Release Route (Issue 4)


  
    async function syncEntityTags(entityType: string, entityId: string, tags: any[]) {
    return;
  }
  async function fetchCreatorReviews(creatorId: string, limit?: any) {
    const db = getDb();
    const local = (db.creator_reviews || [])
      .filter((r: any) => r.creator_id === creatorId || r.creator_user_id === creatorId)
      .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    // Session 52: reviews are kept in the creator_reviews table (they used to vanish on restart).
    const reviews = mergeReviews(await fetchCreatorReviewsFromTable(privilegedSupabase, creatorId), local);
    return limit ? reviews.slice(0, limit) : reviews;
  }
  
  function serializeChatMessage(a?: any, b?: any, c?: any, d?: any) {
    return a;
  }
  function enrichThread(thread: any, a?: any, b?: any, c?: any) {
    return (thread && thread.from ? a : thread) || {};
  }
  function mapFlowStateToStatus(flowState?: string): 'NEGOTIATING' | 'ACTIVE' | 'COMPLETED' {
    const upper = (flowState || '').toUpperCase();
    // v414: AGREEMENT_SIGNED = only ONE side has signed — still negotiating, not ACTIVE.
    if (['NEGOTIATING', 'NEGOTIATING_COUNTER', 'AI_AGREEMENT_READY', 'AGREEMENT_SIGNED'].includes(upper)) {
      return 'NEGOTIATING';
    }
    if (['COMPLETED', 'CANCELLED', 'CLOSED'].includes(upper)) {
      return 'COMPLETED';
    }
    return 'ACTIVE';
  }

  async function updateThreadState(clientOrThread: any, threadIdOrA?: any, updates?: any) {
    if (clientOrThread && clientOrThread.from && threadIdOrA && updates) {
      try {
        const dbUpdates: any = { updated_at: new Date().toISOString() };
        // A counter offer is a PROPOSAL. It used to be written straight into agreed_amount the
        // moment it was sent — before the other side accepted — so the contract amount became
        // whatever the creator typed. The proposal lives in the negotiation_offer message;
        // agreed_amount changes only when brand-accept-counter accepts it.
        if (updates.amount_fixed !== undefined && updates.amount_fixed !== null) {
          dbUpdates.agreed_amount = Number(updates.amount_fixed);
        }
        if (updates.flow_state) {
          dbUpdates.flow_state = updates.flow_state;
        }
        if (updates.status && ['NEGOTIATING', 'ACTIVE', 'COMPLETED'].includes(updates.status)) {
          dbUpdates.status = updates.status;
        } else if (updates.flow_state) {
          dbUpdates.status = mapFlowStateToStatus(updates.flow_state);
        }
        if (updates.agreement_signed_creator !== undefined) {
          dbUpdates.agreement_signed_creator = Boolean(updates.agreement_signed_creator);
        }
        if (updates.agreement_signed_brand !== undefined) {
          dbUpdates.agreement_signed_brand = Boolean(updates.agreement_signed_brand);
        }
        if (updates.agreement_signed_at !== undefined) {
          dbUpdates.agreement_signed_at = updates.agreement_signed_at;
        }
        await clientOrThread.from('chat_threads').update(dbUpdates).eq('id', threadIdOrA);
      } catch (e) { logIgnored("server:2638", e); }
    }
    return clientOrThread;
  }
  function parseThreadState(thread: any) {
    if (typeof thread?.state === 'string') {
      try { return JSON.parse(thread.state); } catch(e) { return {}; }
    }
    return thread?.state || {};
  }
  // ---------------------------------------------------------------------------
  // These three were hollow stubs. Each returned a success-shaped value without doing
  // anything, and each is live, so nothing ever looked broken:
  //
  //   calculateFee              returned a zero fee on every amount
  //   createEscrowTransaction   returned immediately; NO escrow row was ever written for a
  //                             campaign, which is why Payments, the admin escrow panel and
  //                             creator Earnings showed nothing on the campaign side
  //   isCreatorKycVerified      returned true always, so the server-side KYC gate on
  //                             campaign applications let unverified creators straight through
  //
  // They are now wired to the real implementations, which already existed and were complete.
  // If you find these reverted to stubs again, the escrow tests in backend/escrowService.test.ts
  // will fail — that is what they are for.
  // ---------------------------------------------------------------------------

  /** Real platform fee. Reads platform_fee_config via Supabase; falls back to defaults. */
  async function calculateFee(amount: number, other?: any) {
    try {
      const result: any = await calculatePlatformFee(Number(amount) || 0, supabase as any, other);
      // The real calculator returns grossAmount/feePercent/platformFee/gstAmount/creatorNet/
      // discountApplied/appliedCoupon. Mapped here to the shape the callers already expect,
      // so nothing downstream has to change.
      return {
        fee: Number(result?.platformFee || 0),
        total: Number(result?.grossAmount ?? amount) || 0,
        appliedRedemptionId: result?.appliedCoupon?.id ?? null,
        appliedCoupon: result?.appliedCoupon ?? null,
        feePercent: Number(result?.feePercent || 0),
        discountApplied: Number(result?.discountApplied || 0),
        platformFee: Number(result?.platformFee || 0),
        creatorNet: Number(result?.creatorNet ?? amount) || 0,
        gstAmount: Number(result?.gstAmount || 0)
      };
    } catch (e: any) {
      // Never let a fee lookup take down a payment path. A zero fee is wrong but recoverable;
      // a thrown error here would abort escrow creation entirely.
      console.error("[calculateFee] falling back to zero fee:", e?.message || e);
      return { fee: 0, total: amount, appliedRedemptionId: null, platformFee: 0, creatorNet: amount, gstAmount: 0 };
    }
  }

  /** Writes the real escrow transaction row. Implementation: backend/services/escrowService.ts */
  async function createEscrowTransaction(params?: any, _b?: any, _c?: any) {
    if (!params || typeof params !== 'object') {
      console.warn("[createEscrowTransaction] called without params — skipped");
      return null;
    }
    try {
      return await createEscrowTransactionService(
        {
          supabase: privilegedSupabase || supabase,
          getDb,
          saveDb,
          getIsoNow: () => new Date().toISOString(),
          calculateFee
        },
        params as CreateEscrowTransactionParams
      );
    } catch (e: any) {
      console.error("[createEscrowTransaction] failed:", e?.message || e);
      return null;
    }
  }

  /**
   * Real server-side KYC gate for campaign applications.
   *
   * Fails CLOSED on a genuine "not verified" answer, but OPEN if the lookup itself errors —
   * a Supabase blip must not lock every creator out of applying. The distinction matters:
   * an absent record means unverified; a failed query means unknown.
   */
  async function isCreatorKycVerified(id: string) {
    // Session 24: one source of truth (backend/creatorKyc.ts). The old version queried
    // creator_kyc by user_id (the table uses creator_id), errored, and let everyone through.
    const status = await getCreatorKycStatus(privilegedSupabase || supabase, getDb(), id);
    // A failed lookup still lets the creator apply (the old "outage must not lock people out"
    // rule for campaign applications); a real "not approved" answer blocks.
    return status === "APPROVED" || status === "UNKNOWN";
  }


// =========================================================================
  // RAZORPAY ESCROW & PAYMENT INTEGRATION (CORE ROUTES)
  // =========================================================================

  // 1. Create Razorpay Order

  // 2. Verify Razorpay Payment Signature & Record Escrow Transaction

  // 3. Polling Status for QR / UPI Payments

  // 4. Test Complete Simulator (Dev & Preview Environments Only)

  // Admin campaigns list/status, and legacy user delete/restore/ban/unban + campaign delete → moved to admin_campaigns_settings_routes.ts (setupAdminCampaignsSettingsRoutes)

  // Settings (get/put) → moved to admin_campaigns_settings_routes.ts (setupAdminCampaignsSettingsRoutes)

  // Helper to get active fee & referral config
  async function getFullFeeAndReferralConfig() {
    const db = getDb();
    if (!db.fee_configs || !Array.isArray(db.fee_configs) || db.fee_configs.length === 0) {
      db.fee_configs = [{
        id: 1,
        threshold_amount: 20000,
        below_threshold_rate: 15.0,
        above_threshold_rate: 5.0,
        gst_rate: 18.0,
        platform_gst_registered: false,
        platform_gstin: '',
        ugc_commission_pct: 10.0,
        min_withdrawal_amount: 1000,
        withdrawal_fee_rate: 0,
        payout_freeze_all: false,
        dispute_refund_window_days: 7,
        min_campaign_budget: 500,
        max_campaign_budget: 1000000
      }];
    }

    // Platform fee config (try Supabase first, fallback to db.fee_configs)
    let supabaseFeeConfig: any = null;
    if (supabase) {
      try {
        const { data: sFee } = await safePromiseTimeout(
          (privilegedSupabase || supabase)
            .from('platform_fee_config')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          5000,
          { data: null, error: null }
        );
        if (sFee) supabaseFeeConfig = sFee;
      } catch (e) {
        console.warn("Could not fetch Supabase platform_fee_config:", e);
      }
    }

    const fee = supabaseFeeConfig || db.fee_configs[0];

    // Referral config (try Supabase first, fallback to db.referral_config)
    let refData: any = null;
    if (supabase) {
      try {
        const { data: sRef } = await safePromiseTimeout(
          (privilegedSupabase || supabase)
            .from('referral_config')
            .select('*')
            .eq('id', 'singleton')
            .maybeSingle(),
          5000,
          { data: null, error: null }
        );
        if (sRef) refData = sRef;
      } catch (e) {
        console.warn("Could not fetch Supabase referral_config:", e);
      }
    }

    const localRef = db.referral_config || {};
    const creator_referral_reward = Number(refData?.creator_referral_reward ?? localRef.creator_referral_reward ?? 500);
    const brand_referral_reward = Number(refData?.brand_referral_reward ?? localRef.brand_referral_reward ?? 1000);
    const referral_trigger_action = String(localRef.referral_trigger_action ?? refData?.trigger_condition ?? 'first_completed_collab');
    const referral_monthly_cap = refData?.monthly_cap_per_user != null ? Number(refData.monthly_cap_per_user) : (localRef.referral_monthly_cap ?? 10);
    const referral_enabled = refData?.is_active != null ? Boolean(refData.is_active) : (localRef.referral_enabled !== false);

    const feeConfigCombined = {
      id: fee.id || 1,
      threshold_amount: Number(fee.threshold_amount ?? 20000),
      below_threshold_rate: Number(fee.below_threshold_rate ?? 15.0),
      above_threshold_rate: Number(fee.above_threshold_rate ?? 5.0),
      gst_rate: Number(fee.gst_rate ?? 18.0),
      platform_gst_registered: Boolean(fee.platform_gst_registered),
      platform_gstin: String(fee.platform_gstin || ''),
      ugc_commission_pct: Number(fee.ugc_commission_pct ?? 10.0),
      // Session 36: offer mode (₹0 platform fee + convenience fee), set only through POST /admin/fee-offer
      offer_mode: fee.offer_mode === true,
      offer_fee_pct: fee.offer_fee_pct != null ? Number(fee.offer_fee_pct) : 2,
      offer_label: String(fee.offer_label || 'Festive offer'),
      offer_promo_line: fee.offer_promo_line || null,
      offer_line_until: fee.offer_line_until || null,
      // v364: split fee (creator % taken from the creator, brand % added on the brand's bill)
      fee_model: String(fee.fee_model || 'legacy').toLowerCase() === 'split' ? 'split' : 'legacy',
      creator_fee_pct: fee.creator_fee_pct != null ? Number(fee.creator_fee_pct) : 0,
      brand_fee_pct: fee.brand_fee_pct != null ? Number(fee.brand_fee_pct) : 0,
      min_withdrawal_amount: Number(fee.min_withdrawal_amount ?? fee.withdrawal_min_limit ?? 1000), // Session 58: live column is withdrawal_min_limit
      withdrawal_fee_rate: Number(fee.withdrawal_fee_rate ?? 0),
      payout_freeze_all: Boolean(fee.payout_freeze_all),
      dispute_refund_window_days: Number(fee.dispute_refund_window_days ?? 7),
      min_campaign_budget: Number(fee.min_campaign_budget ?? 500),
      max_campaign_budget: Number(fee.max_campaign_budget ?? 1000000),
      updated_at: fee.updated_at || getIsoNow(),

      // Referral fields at top level for direct access
      creator_referral_reward,
      brand_referral_reward,
      referral_trigger_action,
      referral_monthly_cap,
      referral_enabled,

      // Nested config object for loadReferrals
      config: {
        creator_referral_reward,
        brand_referral_reward,
        referral_trigger_action,
        referral_monthly_cap,
        referral_enabled
      }
    };

    return feeConfigCombined;
  }

  // Fee-config (get/put/post) + referrals → moved to admin_campaigns_settings_routes.ts (setupAdminCampaignsSettingsRoutes)


  // FEATURE 2: App Versions (PlatformTools.jsx) → moved to admin_versions_coupons_routes.ts (setupAdminVersionsCouponsRoutes)

  // ─── ADMIN COUPON MANAGEMENT ROUTES (PlatformTools.jsx) ─── → moved to admin_versions_coupons_routes.ts (setupAdminVersionsCouponsRoutes)

  // FEATURE 2: Support Ticket Reply & Notification Route




  // Verification reviews & submissions helper, KYC approve/reject/escalate, and reports moderation → moved to admin_kyc_verification_routes.ts (setupAdminKycVerificationRoutes)

  // Submission verification request




  // Brand KYC and Brands Me handlers moved to brands_routes.ts (setupBrandsRoutes)
  // Creator KYC, Creator Profile, and Creators Me handlers moved to creators_routes.ts (setupCreatorsRoutes)

  // Helper to enrich UGC briefs with brand profiles and logos
  const enrichBriefsWithBrandProfiles = async (briefList: any[]) => {
    if (!briefList || briefList.length === 0) return briefList;
    const db = getDb();
    let supabaseBrandProfiles: any[] = [];
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase)
          .from('brand_profiles')
          .select('user_id, company_name, logo, cover_image, verified, website, industry, description');
        if (data) supabaseBrandProfiles = data;
      } catch (e) {
        console.warn("[UGC] Error fetching brand_profiles from Supabase for enrichment:", e);
      }
    }
    const localBrandProfiles = db.brand_profiles || [];
    const landingBrands = (db as any).landing_brands || [];

    const byUserId = new Map<string, any>();
    const byName = new Map<string, any>();

    localBrandProfiles.forEach((bp: any) => {
      if (bp.user_id) byUserId.set(String(bp.user_id), bp);
      if (bp.company_name) byName.set(bp.company_name.toLowerCase().trim(), bp);
    });

    supabaseBrandProfiles.forEach((bp: any) => {
      if (bp.user_id) byUserId.set(String(bp.user_id), bp);
      if (bp.company_name) byName.set(bp.company_name.toLowerCase().trim(), bp);
    });

    const landingByName = new Map<string, any>();
    landingBrands.forEach((lb: any) => {
      if (lb.name) landingByName.set(lb.name.toLowerCase().trim(), lb);
    });

    const getFallbackBrandLogo = (brandName: string): string => {
      return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(brandName || 'Brand')}&backgroundColor=6366f1&fontFamily=Arial&fontWeight=800`;
    };

    return briefList.map((brief: any) => {
      const brandId = brief.brand_id ? String(brief.brand_id) : "";
      const rawBrandName = brief.brand_name || brief.company_name || "";
      const lowerName = rawBrandName.toLowerCase().trim();

      let matchedProfile = (brandId && byUserId.get(brandId)) || (lowerName && byName.get(lowerName)) || null;

      const resolvedBrandName = brief.brand_name || matchedProfile?.company_name || (brief.product_name ? `${brief.product_name.split(' ')[0]} Brand` : "Verified Brand");
      
      let resolvedLogo = brief.brand_logo || brief.brand_avatar || matchedProfile?.logo || "";
      
      if (!resolvedLogo || resolvedLogo.trim().length === 0) {
        resolvedLogo = getFallbackBrandLogo(resolvedBrandName);
      }

      return {
        ...brief,
        brand_name: resolvedBrandName,
        brand_logo: resolvedLogo,
        brand_avatar: resolvedLogo,
        brand: {
          id: brief.brand_id,
          user_id: brief.brand_id,
          name: resolvedBrandName,
          company_name: resolvedBrandName,
          logo: resolvedLogo,
          avatar: resolvedLogo,
          verified: matchedProfile?.verified ?? true,
          website: matchedProfile?.website || "",
          industry: matchedProfile?.industry || ""
        }
      };
    });
  };

  // 2. Get My UGC Briefs (Brand)

  // 3. Get Available UGC Briefs (Creator Browse)

  // 4. Get Single UGC Brief

  // 5. Get Brand UGC Orders

  // 6. Get Creator UGC Orders

  // 6b. Get single UGC order by ID

  // Dedicated helper to ensure a real chat thread exists for a UGC order
  const ensureUGCChatThread = async (order: any, briefInput?: any, actorUser?: any, ioInstance?: any) => {
    if (!order || !order.id) return null;
    const orderId = order.id;
    const brandId = order.brand_id || briefInput?.brand_id || null;
    const creatorId = order.creator_id || null;
    const nowIso = getIsoNow();

    // 1. Fetch brief if needed
    let brief = briefInput;
    if (!brief && order.brief_id) {
      if (supabase) {
        try {
          const { data: b } = await (privilegedSupabase || supabase).from('ugc_briefs').select('*').eq('id', order.brief_id).maybeSingle();
          if (b) brief = b;
        } catch (e) { logIgnored("server:3007", e); }
      }
      if (!brief) {
        const db = getDb();
        brief = (db.ugc_briefs || []).find((b: any) => b.id === order.brief_id);
      }
    }
    // No placeholder parties. The brand id was fixed BEFORE the brief was loaded, so a real
    // brand could be replaced by the demo brand's id; a thread between a fake brand and a
    // creator shows up in nobody's inbox, or in the demo account's.
    const finalBrandId = brandId || brief?.brand_id || null;
    if (!finalBrandId || !creatorId) {
      console.error(`[ensureUGCChatThread] order ${orderId} has no ${!finalBrandId ? 'brand' : 'creator'} — thread not created.`);
      return null;
    }

    // 2. Check if thread already exists in Supabase
    let existingThread: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('chat_threads')
          .select('*')
          .or(`id.eq.${orderId},deal_id.eq.${orderId}`)
          .maybeSingle();
        if (data) existingThread = data;
      } catch (e) { logIgnored("server:3032", e); }
    }
    const db = getDb();
    if (!existingThread) {
      existingThread = (db.chat_threads || []).find((t: any) => t.id === orderId || t.deal_id === orderId);
    }

    const threadStatus = order.status === 'COMPLETED' ? 'COMPLETED' : 'ACTIVE';
    const payout = Number(order.creator_payout || order.agreed_amount || brief?.budget || 0);

    const deliverableType = String(
      order.deliverable_type ||
      brief?.deliverable_type ||
      'collaboration_reel'
    ).toLowerCase();

    const isCollab = order.is_collaboration !== undefined
      ? Boolean(order.is_collaboration)
      : (order.requires_live_link !== undefined
        ? Boolean(order.requires_live_link)
        : (brief?.is_collaboration !== undefined
          ? Boolean(brief.is_collaboration)
          : isCollaborationDeliverable(deliverableType)));

    const requiresLiveLink = order.requires_live_link !== undefined
      ? Boolean(order.requires_live_link)
      : isCollab;

    if (!existingThread) {
      const newThread = {
        id: orderId,
        deal_id: orderId,
        brand_id: finalBrandId,
        creator_id: creatorId,
        status: threadStatus,
        flow_state: threadStatus,
        agreed_amount: payout,
        revision_count: UGC_REVISION_LIMIT,
        agreement_signed_creator: true,
        agreement_signed_brand: true,
        created_at: order.created_at || nowIso,
        updated_at: nowIso
      };

      if (supabase) {
        try {
          const { error: thrErr } = await (privilegedSupabase || supabase).from('chat_threads').upsert(newThread, { onConflict: 'id' });
          if (!thrErr) {
            knownChatThreadIds.add(orderId);
          }
        } catch (err) {
          console.warn("[ensureUGCChatThread] Upsert notice:", err);
        }
      }

      if (!db.chat_threads) db.chat_threads = [];
      const dbThr = {
        ...newThread,
        is_ugc: true,
        type: 'ugc',
        deal_type: 'UGC',
        ugc_order_id: orderId,
        ugc_title: brief?.title || 'UGC Order',
        deliverable_type: deliverableType,
        is_collaboration: isCollab,
        requires_live_link: requiresLiveLink,
        format_category: isCollab ? 'collaboration' : 'ugc_video'
      };
      db.chat_threads.push(dbThr);
      saveDb(db);

      // Welcome message in chat_messages
      const welcomeMsgId = crypto.randomUUID();
      const briefTitle = brief?.title || 'UGC Deliverable';
      const welcomeText = isCollab
        ? `🎉 UGC Collaboration Order Confirmed!\n\nDeliverable: ${briefTitle} (Collaboration Reel)\nPayout: ₹${payout}\nAgreement signed. Submit your draft video for brand review. Once approved, publish on your handle and submit the live link to release payout.`
        : `🎉 UGC Video Order Confirmed!\n\nDeliverable: ${briefTitle} (Raw/Edited Video Deliverable)\nPayout: ₹${payout}\nAgreement signed. Upload your high-res video/drive link for brand review. Once approved, your secure payment hold payout will be released immediately.`;
      
      const welcomeDbMsg = {
        message_id: welcomeMsgId,
        thread_id: orderId,
        sender_user_id: creatorId,
        receiver_user_id: finalBrandId,
        text: welcomeText,
        from_name: actorUser?.name || 'Creator',
        message_type: 'system',
        metadata: { action: 'ugc_order_claimed', order_id: orderId },
        created_at: nowIso,
        read: false
      };

      if (supabase) {
        try {
          await insertChatMessageToSupabase(welcomeDbMsg);
        } catch (e) {
          console.error("[ensureUGCChatThread] Message insert error:", e);
        }
      }

      if (!db.chat_messages) db.chat_messages = [];
      db.chat_messages.push({
        ...welcomeDbMsg,
        id: welcomeMsgId,
        content: welcomeText
      });
      saveDb(db);

      if (ioInstance) {
        ioInstance.to(orderId).emit("new_message", { ...welcomeDbMsg, id: welcomeMsgId, content: welcomeText });
        emitThreadEvent(ioInstance, "thread_updated", { threadId: orderId });
      }

      return newThread;
    } else {
      if (order.status === 'COMPLETED' && existingThread.status !== 'COMPLETED') {
        if (supabase) {
          try {
            await (privilegedSupabase || supabase).from('chat_threads').update({ status: 'COMPLETED', flow_state: 'COMPLETED', updated_at: nowIso }).eq('id', existingThread.id);
          } catch (e) { logIgnored("server:3150", e); }
        }
        existingThread.status = 'COMPLETED';
        existingThread.flow_state = 'COMPLETED';
        existingThread.updated_at = nowIso;
        saveDb(db);
        if (ioInstance) {
          emitThreadEvent(ioInstance, "thread_updated", { threadId: existingThread.id, status: 'COMPLETED', flow_state: 'COMPLETED' });
        }
      }
      return existingThread;
    }
  };

  // 7. Claim a UGC Brief (Creator)

  // 8. Sign UGC Order Agreement

  // 8. Sign UGC Order Agreement

  // Unified UGC Lifecycle Synchronizer (Extracted to services/ugcLifecycleService.ts)
  const syncUgcLifecycleEvent = createUgcLifecycleService({
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    getIsoNow,
    ensureUGCChatThread,
    insertChatMessageToSupabase,
    broadcastAdminNotification,
  });

  const campaignLifecycleHandlers = createCampaignLifecycleHandlers({
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    insertChatMessageToSupabase,
    getIsoNow,
    syncUgcLifecycleEvent,
    broadcastAdminNotification,
  });

  const {
    handleThreadApproveLiveLinks,
    handleThreadApproveContent,
    handleThreadSubmitLiveLink,
    handleThreadRejectLiveLinks,
    handleThreadDeclineLiveLinksResubmission,
    handleCampaignRevision,
    handleCampaignDeclineDraftRevision,
    handleCampaignCancel,
  } = campaignLifecycleHandlers;

  const ugcLifecycleHandlers = createUgcLifecycleHandlers({
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    syncUgcLifecycleEvent,
    handleThreadApproveLiveLinks,
    handleThreadApproveContent,
    handleCampaignRevision,
  });

  const {
    handleUgcDeliverableSubmit,
    handleUgcLiveLinkSubmit,
    handleUgcOrderApprove,
    handleUgcOrderRevision,
    handleUgcOrderDeclineRevisions,
    handleUgcOrderCancel,
  } = ugcLifecycleHandlers;



  // 13. Creator UGC Earnings

  // 14. UGC Showcase (Public)

  // 15. Admin UGC Orders


  // Get all UGC Orders (Legacy endpoint compatibility & Ops page)

  // Accept / Claim UGC order for in-house ops team handling

  // Submit deliverable video for UGC order / brief

  // Helper to populate comprehensive thread data (profiles, avatars, UGC brief info, unread counts)
  // Latest-message window per thread + exact counts + unread rows. See populateThreadData §5.
  const MESSAGE_WINDOW = 60;
  const fetchThreadMessageWindows = async (client: any, threadIds: string[], currentUserId: string | string[]) => { // v417: my side's ids
    const windows: Record<string, any[]> = {};
    const totals: Record<string, number> = {};
    const unread: Record<string, number> = {};
    const allIds = new Set<string>();
    // Session 43 (v284): lean reads (see backend/inboxLean.ts). The code below is the old path,
    // kept as the fallback when the lean one can't run.
    try {
      const lean = await fetchLeanMessageWindows(client, threadIds, currentUserId, MESSAGE_WINDOW);
      if (lean) return lean;
    } catch (e: any) {
      console.warn("[inbox] lean message read failed, using full read:", e?.message || e);
    }
    let next = 0;
    const worker = async () => {
      while (next < threadIds.length) {
        const tid = threadIds[next++];
        const [w, c]: any = await Promise.all([
          client.from('chat_messages').select('*').eq('thread_id', tid).order('created_at', { ascending: false }).limit(MESSAGE_WINDOW),
          client.from('chat_messages').select('*', { count: 'exact', head: true }).eq('thread_id', tid)
        ]);
        const list = (w?.data || []).slice().reverse();
        windows[tid] = list;
        totals[tid] = typeof c?.count === 'number' ? c.count : list.length;
      }
    };
    const unreadP = client
      .from('chat_messages')
      .select('thread_id, sender_user_id, message_id')
      .in('thread_id', threadIds)
      .eq('read', false); // v348: null-read rows (admin "Payout Disbursed" card) never get marked read → stuck unread badge
    await Promise.all(Array.from({ length: Math.min(8, threadIds.length) }, worker));
    const { data: unreadRows } = await unreadP;
    (unreadRows || []).forEach((m: any) => {
      if (m.message_id) allIds.add(String(m.message_id));
      // v348: same rule as "open chat → mark read" (chat_routes: sender_user_id <> me, which never matches a
    // NULL sender in SQL). Cards saved with no sender (admin "Payout Disbursed") could never be cleared → stuck "1".
    if (m.sender_user_id && !mySideHas(currentUserId, m.sender_user_id)) unread[m.thread_id] = (unread[m.thread_id] || 0) + 1; // v417: whole brand side
    });
    return { windows, totals, unread, allIds };
  };

  const slimImage = (v: any) => {
    const str = typeof v === 'string' ? v : '';
    return str.startsWith('data:') && str.length > 4096 ? '' : str;
  };
  // v417: currentUserId may be a list — every id on my side (brand owner + team). Their messages are never unread for me.
  const populateThreadData = async (threads: any[], currentUserId: string | string[]) => {
    if (!threads || threads.length === 0) return [];
    const db = getDb();

    // 1. Gather all participant user IDs
    const userIds = [...new Set(threads.flatMap(t => [t.creator_id, t.brand_id]).filter(Boolean))];

    // Every lookup below is independent of the others (briefs aside, which need the orders), so
    // they all start NOW and run in parallel. They used to run as five sequential round trips.
    const pClient = privilegedSupabase || supabase;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const potentialOrderIds = [...new Set(threads.map(t => t.deal_id || t.id).filter(Boolean))];
    // deals.id is a UUID column. Handing it `ugcord_…` / `thread_…` strings fails the WHOLE query
    // (22P02) — so any inbox holding one UGC thread silently lost every campaign deal record
    // (escrow flag, status) from this lookup.
    const uuidOrderIds = potentialOrderIds.filter((id: any) => UUID_RE.test(String(id)));
    const nonUuidOrderIds = potentialOrderIds.filter((id: any) => !UUID_RE.test(String(id)));
    const campaignIds = [...new Set(threads.map(t => t.campaign_id).filter(Boolean))];
    const threadIds = threads.map(t => t.id).filter(Boolean);
    const emptyRes = Promise.resolve({ data: [] as any[] });

    const profilesP = (supabase && userIds.length > 0)
      ? fetchInboxProfiles(pClient, userIds) // v284: only name + picture columns (inboxLean.ts)
      : Promise.resolve(null as any);
    const ordersP = (supabase && potentialOrderIds.length > 0)
      ? Promise.all([
          pClient.from('ugc_orders').select('*').in('id', potentialOrderIds),
          uuidOrderIds.length ? pClient.from('deals').select('*').in('id', uuidOrderIds) : emptyRes,
          uuidOrderIds.length ? pClient.from('content_submissions').select('*').in('deal_id', uuidOrderIds) : emptyRes,
          nonUuidOrderIds.length ? pClient.from('content_submissions').select('*').in('deal_id', nonUuidOrderIds) : emptyRes
        ]).catch(() => null)
      : Promise.resolve(null as any);
    const campaignsP = (supabase && campaignIds.length > 0)
      ? Promise.resolve(pClient.from('campaigns').select('*').in('campaign_id', campaignIds)).catch(() => null)
      : Promise.resolve(null as any);
    const messagesP = (supabase && threadIds.length > 0)
      ? fetchThreadMessageWindows(pClient, threadIds, currentUserId).catch((e: any) => {
          console.error("[populateThreadData] message fetch error:", e?.message || e);
          return null;
        })
      : Promise.resolve(null as any);

    // 2. Fetch users, brand_profiles, creator_profiles
    let usersList: any[] = [];
    let brandProfilesList: any[] = [];
    let creatorProfilesList: any[] = [];

    if (supabase && userIds.length > 0) {
      try {
        const [uRes, bpRes, cpRes] = await profilesP;
        if (uRes.data) usersList = uRes.data;
        if (bpRes.data) brandProfilesList = bpRes.data;
        if (cpRes.data) creatorProfilesList = cpRes.data;
      } catch (e) {
        console.error("[populateThreadData] Profile fetch error:", e);
      }
    }

    const userMap: Record<string, any> = {};
    (db.users || []).forEach((u: any) => {
      const uid = u.user_id || u.id;
      if (uid) userMap[uid] = u;
    });
    usersList.forEach((u: any) => {
      const uid = u.user_id || u.id;
      if (uid) userMap[uid] = { ...userMap[uid], ...u };
    });

    const brandProfileMap: Record<string, any> = {};
    (db.brand_profiles || []).forEach((bp: any) => {
      const uid = bp.user_id || bp.id;
      if (uid) brandProfileMap[uid] = bp;
    });
    brandProfilesList.forEach((bp: any) => {
      const uid = bp.user_id || bp.id;
      if (uid) brandProfileMap[uid] = { ...brandProfileMap[uid], ...bp };
    });

    const creatorProfileMap: Record<string, any> = {};
    (db.creator_profiles || []).forEach((cp: any) => {
      const uid = cp.user_id || cp.id;
      if (uid) creatorProfileMap[uid] = cp;
    });
    creatorProfilesList.forEach((cp: any) => {
      const uid = cp.user_id || cp.id;
      if (uid) creatorProfileMap[uid] = { ...creatorProfileMap[uid], ...cp };
    });

    // 3. UGC Orders, Deals, and Briefs mapping
    let ugcOrdersList: any[] = [];
    let dealsList: any[] = [];
    let supabaseSubmissionsList: any[] = [];
    if (supabase && potentialOrderIds.length > 0) {
      try {
        const orderResults: any = await ordersP;
        if (orderResults) {
          const [oRes, dRes, csUuidRes, csTextRes] = orderResults;
          if (oRes?.data) ugcOrdersList = oRes.data;
          if (dRes?.data) dealsList = dRes.data;
          supabaseSubmissionsList = [...(csUuidRes?.data || []), ...(csTextRes?.data || [])];
        }
      } catch (e) { logIgnored("server:3380", e); }
    }
    const orderMap: Record<string, any> = {};
    (db.ugc_orders || []).forEach((o: any) => { if (o.id) orderMap[o.id] = o; });
    ugcOrdersList.forEach((o: any) => { if (o.id) orderMap[o.id] = { ...orderMap[o.id], ...o }; });

    const dealMap: Record<string, any> = {};
    (db.deals || []).forEach((d: any) => { if (d.id) dealMap[d.id] = d; });
    dealsList.forEach((d: any) => { if (d.id) dealMap[d.id] = { ...dealMap[d.id], ...d }; });

    const briefIds = [...new Set(Object.values(orderMap).map((o: any) => o.brief_id).filter(Boolean))];
    let briefsList: any[] = [];
    if (supabase && briefIds.length > 0) {
      try {
        const { data: bData } = await (privilegedSupabase || supabase).from('ugc_briefs').select('*').in('id', briefIds);
        if (bData) briefsList = bData;
      } catch (e) { logIgnored("server:3396", e); }
    }
    const briefMap: Record<string, any> = {};
    (db.ugc_briefs || []).forEach((b: any) => { if (b.id) briefMap[b.id] = b; });
    briefsList.forEach((b: any) => { if (b.id) briefMap[b.id] = { ...briefMap[b.id], ...b }; });

    // 4. Campaign mapping
    let campaignsList: any[] = [];
    if (supabase && campaignIds.length > 0) {
      try {
        const cRes: any = await campaignsP;
        if (cRes?.data) campaignsList = cRes.data;
      } catch (e) { logIgnored("server:3408", e); }
    }
    const campaignMap: Record<string, any> = {};
    (db.campaigns || []).forEach((c: any) => { if (c.campaign_id) campaignMap[c.campaign_id] = c; });
    campaignsList.forEach((c: any) => { if (c.campaign_id) campaignMap[c.campaign_id] = { ...campaignMap[c.campaign_id], ...c }; });

    // 5. Messages mapping for last_message, total count, unread count
    //
    // This used to download EVERY message of EVERY thread (select *, oldest first) on each inbox
    // load. Besides the transfer size, PostgREST caps a response at 1000 rows — and with the
    // oldest first, the rows that got cut were the NEWEST ones, i.e. exactly the last message
    // and the latest live-link action this function reads. Now: the latest window per thread,
    // an exact per-thread count, and the unread rows only.
    const msgWindows: any = await messagesP;
    const localMsgs = (db.chat_messages || []).filter((m: any) => threadIds.includes(m.thread_id));
    const messagesByThread: Record<string, any[]> = {};
    const totalByThread: Record<string, number> = {};
    const unreadByThread: Record<string, number> = {};

    if (msgWindows) {
      const seen = new Set<string>();
      Object.entries(msgWindows.windows as Record<string, any[]>).forEach(([tid, list]) => {
        messagesByThread[tid] = [...list];
        list.forEach((m: any) => { const k = m.message_id || m.id; if (k) seen.add(String(k)); });
        totalByThread[tid] = msgWindows.totals[tid] ?? list.length;
        unreadByThread[tid] = msgWindows.unread[tid] || 0;
      });
      // Messages that exist only in the local store (never reached Supabase).
      localMsgs.forEach((lm: any) => {
        const k = String(lm.message_id || lm.id || '');
        if (k && (seen.has(k) || msgWindows.allIds.has(k))) return;
        // Older than the window we fetched: it is almost certainly in Supabase already, just not
        // in the window. Counting it again would inflate total_messages_count (unread tracking).
        const win = msgWindows.windows[lm.thread_id] || [];
        if (win.length >= MESSAGE_WINDOW && win[0]?.created_at &&
            new Date(lm.created_at || 0).getTime() < new Date(win[0].created_at).getTime()) return;
        if (!messagesByThread[lm.thread_id]) messagesByThread[lm.thread_id] = [];
        messagesByThread[lm.thread_id].push(lm);
        totalByThread[lm.thread_id] = (totalByThread[lm.thread_id] || 0) + 1;
        if (!lm.read && lm.sender_user_id && !mySideHas(currentUserId, lm.sender_user_id)) { // v348: no-sender cards never count
          unreadByThread[lm.thread_id] = (unreadByThread[lm.thread_id] || 0) + 1;
        }
      });
      Object.values(messagesByThread).forEach((list) =>
        list.sort((x: any, y: any) => new Date(x.created_at || 0).getTime() - new Date(y.created_at || 0).getTime())
      );
    } else {
      // No Supabase (or its lookup failed): the local store is everything.
      localMsgs.forEach((m: any) => {
        if (!messagesByThread[m.thread_id]) messagesByThread[m.thread_id] = [];
        messagesByThread[m.thread_id].push(m);
      });
      Object.entries(messagesByThread).forEach(([tid, list]) => {
        totalByThread[tid] = list.length;
        unreadByThread[tid] = list.filter((m: any) => !m.read && m.sender_user_id && !mySideHas(currentUserId, m.sender_user_id)).length; // v348
      });
    }

    // Direct-invite deals have no campaigns row; their title lives on the invite (session 26).
    // brief_requests is server-only, so this read uses the service-role client.
    const inviteByThread: Record<string, any> = {};
    for (const inv of (db.brief_requests || [])) {
      if (inv?.thread_id) inviteByThread[inv.thread_id] = inv;
    }
    const inviteThreadIds = threads
      .filter((t: any) => !t.campaign_id && String(t.id || '').startsWith('thread_camp_') && !inviteByThread[t.id])
      .map((t: any) => t.id);
    if (privilegedSupabase && inviteThreadIds.length > 0) {
      try {
        const { data: invRows } = await privilegedSupabase
          .from('brief_requests').select('id, thread_id, campaign_title, deliverables, timeline').in('thread_id', inviteThreadIds.slice(0, 200));
        for (const r of invRows || []) if (r?.thread_id) inviteByThread[r.thread_id] = r;
      } catch (e) { logIgnored("server:invite-titles", e); }
    }

    // 6. Build populated threads
    return threads.map(t => {
      const order = orderMap[t.id] || orderMap[t.deal_id] || (t.id?.startsWith('ugcord_') ? orderMap[t.id] : null);
      const isUgc = Boolean(
        order || 
        t.is_ugc || 
        t.type === 'ugc' || 
        t.deal_type === 'UGC' || 
        t.id?.startsWith('ugcord_') || 
        t.deal_id?.startsWith('ugcord_') ||
        t.ugc_order_id
      );

      const brief = order?.brief_id ? briefMap[order.brief_id] : null;
      const campaign = t.campaign_id ? campaignMap[t.campaign_id] : null;

      const brandUser = userMap[t.brand_id] || {};
      const brandProf = brandProfileMap[t.brand_id] || {};
      const creatorUser = userMap[t.creator_id] || {};
      const creatorProf = creatorProfileMap[t.creator_id] || {};

      const brandName = brandProf.company_name || brandUser.name || brief?.brand_name || 'Brand Partner';
      // A photo whose upload failed can sit in the row as a multi-MB `data:` string; it made every
      // inbox response huge (session 27). Only real URLs go out.
      const brandLogo = slimImage(brandProf.logo || brandUser.picture || brief?.brand_logo || '');
      const creatorName = creatorProf.name || creatorProf.full_name || creatorUser.name || 'Creator';
      const creatorPic = slimImage(creatorProf.picture || creatorProf.photo || creatorProf.avatar_url || creatorProf.profile_picture_url || creatorUser.picture || '');

      const tMsgs = messagesByThread[t.id] || [];
      const lastMsg = tMsgs.length > 0 ? {
        ...tMsgs[tMsgs.length - 1],
        content: tMsgs[tMsgs.length - 1].text || tMsgs[tMsgs.length - 1].content
      } : (t.last_message || null);

      const unreadCount = unreadByThread[t.id] ?? tMsgs.filter((m: any) => !m.read && m.sender_user_id && !mySideHas(currentUserId, m.sender_user_id)).length; // v348

      const title = brief?.title || order?.title || campaign?.title || t.campaign_title || inviteByThread[t.id]?.campaign_title || t.ugc_title || (isUgc ? 'UGC Order' : 'Campaign Deal');
      const deal = dealMap[t.deal_id] || (t.deal_id ? (db.deals || []).find((d: any) => d.id === t.deal_id) : null) || null;
      const isPaidOrReleased = ['PAID', 'RELEASED'].includes(order?.payment_status?.toUpperCase()) ||
        ['PAID', 'RELEASED', 'COMPLETED'].includes(t?.status?.toUpperCase()) ||
        ['PAID', 'RELEASED', 'COMPLETED'].includes(t?.flow_state?.toUpperCase()) ||
        ['PAID', 'RELEASED'].includes(t?.payment_status?.toUpperCase()) ||
        order?.status === 'COMPLETED';

      const isFunded = Boolean(
        isPaidOrReleased ||
        t.payment_funded ||
        deal?.escrow_hold ||
        (Boolean(deal?.escrow_hold_at) && deal?.escrow_hold !== false) || // v414: a refund sets escrow_hold false; the old timestamp alone isn't "funded"
        order?.escrow_hold ||
        (Boolean(order?.escrow_held_at) && order?.escrow_hold !== false) || // v414: same for UGC orders
        ['ESCROW_HELD', 'PAID', 'RELEASED', 'COMPLETED'].includes(order?.payment_status?.toUpperCase())
      );

      const effectivePaymentStatus = isPaidOrReleased
        ? 'RELEASED'
        : (isFunded ? 'ESCROW_HELD' : (order?.payment_status || t.payment_status || 'PENDING'));

      const allSubs = [
        ...(supabaseSubmissionsList || []),
        ...(db.content_submissions || []),
        ...(deal?.content_submissions || [])
      ];
      const latestSub = allSubs.filter((s: any) =>
        s.deal_id === t.deal_id || s.deal_id === t.id || s.deal_id === order?.id
      ).sort((a: any, b: any) => new Date(b.submitted_at || 0).getTime() - new Date(a.submitted_at || 0).getTime())[0];

      const submittedVideo = t.submitted_video_url || latestSub?.video_url || order?.video_url || deal?.video_url || null;

      const deliverableTypeStr = String(order?.deliverable_type || brief?.deliverable_type || t.deliverable_type || (isUgc ? 'collaboration_reel' : 'campaign_collaboration')).toLowerCase();
      const isRawVideoUgc = Boolean(
        isUgc && (
          deliverableTypeStr === 'ugc_video_raw' ||
          deliverableTypeStr === 'ugc_video_edited' ||
          deliverableTypeStr === 'ugc_raw_video' ||
          deliverableTypeStr.includes('raw') ||
          deliverableTypeStr.includes('edited') ||
          deliverableTypeStr.includes('ugc_video')
        )
      );

      // Campaign and UGC both travelled under the single name `deal_id`, which is how
      // ugcord_... ids ended up in a column meant for campaign deal UUIDs and why the two
      // flows kept bleeding into each other. `campaign_deal_id` is populated ONLY for
      // campaign threads, so downstream code can tell the two apart without guessing from
      // the shape of a string. `deal_id` is left exactly as it was — hundreds of call sites
      // still read it, and renaming it is a separate job.
      const campaignDealId = !isUgc ? (t.campaign_deal_id || t.deal_id || null) : null;

      // Campaign and UGC pipelines are completely separated.
      // Do not allow an old submitted live_link URL to report live_links_submitted: true
      // when a revision has been requested!
      let liveLinkSubmitted = false;
      let effectiveFlowState = t.flow_state || t.status;

      if (isUgc) {
        // UGC Order pipeline
        const isUgcRevision = [
          'REVISION_REQUESTED_LINKS',
          'REVISION_DECLINED_LINKS',
          'LIVE_LINK_REVISION_REQ',
          'LIVE_LINK_REVISION'
        ].includes(String(order?.status || t.flow_state || t.status || '').toUpperCase());

        if (!isUgcRevision && t.live_links_submitted !== false) {
          liveLinkSubmitted = Boolean(
            order?.live_links_submitted ||
            t.live_links_submitted ||
            (order?.live_link && order?.status === 'LIVE_LINKS_SUBMITTED') ||
            (t.live_link && ['PROOF_SUBMITTED', 'LIVE_LINKS_SUBMITTED', 'LINKS_UNDER_REVIEW'].includes(String(t.flow_state || t.status || '').toUpperCase()))
          );
        }
      } else {
        // Campaign Deal pipeline (completely separate segment from UGC)
        const isCampaignRevision = [
          'REVISION_REQUESTED_LINKS',
          'REVISION_DECLINED_LINKS',
          'LIVE_LINK_REVISION_REQ',
          'LIVE_LINK_REVISION'
        ].includes(String(deal?.flow_state || deal?.status || t.flow_state || t.status || '').toUpperCase());

        // Inspect latest link action message in thread to prevent stale database state
        const threadMsgs = messagesByThread[t.id] || [];
        const latestLinkMsg = [...threadMsgs].reverse().find(m => {
          const type = (m.message_type || m.type || '').toLowerCase();
          const act = (m.metadata?.action || '').toLowerCase();
          return type === 'live_links_resubmit_request' || type === 'live_links_submitted' || type === 'live_links_approved' ||
                 act === 'live_links_resubmit_requested' || act === 'live_link_submitted' || act === 'live_links_approved';
        });
        const isLatestMsgResubmitReq = latestLinkMsg && (
          (latestLinkMsg.message_type || '').toLowerCase() === 'live_links_resubmit_request' ||
          (latestLinkMsg.metadata?.action || '').toLowerCase() === 'live_links_resubmit_requested'
        );

        if (isLatestMsgResubmitReq && effectiveFlowState !== 'REVISION_DECLINED_LINKS') {
          effectiveFlowState = 'REVISION_REQUESTED_LINKS';
        }

        if (!isCampaignRevision && !isLatestMsgResubmitReq && t.live_links_submitted !== false) {
          liveLinkSubmitted = Boolean(
            t.live_links_submitted === true ||
            (deal?.live_links_submitted && t.live_links_submitted !== false) ||
            (['PROOF_SUBMITTED', 'LIVE_LINKS_SUBMITTED', 'LINKS_UNDER_REVIEW'].includes(String(effectiveFlowState || '').toUpperCase()) && (t.live_link || deal?.live_link))
          );
        }
      }

      const effectiveLiveLink = isUgc
        ? (order?.live_link || t.live_link || order?.instagram_post_url || null)
        : (t.live_link || deal?.live_link || deal?.instagram_post_url || null);

      return {
        ...t,
        campaign_deal_id: campaignDealId,
        deal: deal,
        escrow_hold: isFunded,
        payment_funded: isFunded,
        payment_status: effectivePaymentStatus,
        escrow_held_at: isFunded ? (deal?.escrow_hold_at || order?.escrow_held_at || t.updated_at) : null, // v414: a refunded deal's old hold time no longer reads as funded
        flow_state: effectiveFlowState,
        submitted_video_url: submittedVideo,
        content_url: submittedVideo,
        video_url: submittedVideo,
        latest_submission: latestSub || null,
        live_links_submitted: liveLinkSubmitted,
        live_link: effectiveLiveLink,
        is_ugc: isUgc,
        deliverable_type: deliverableTypeStr,
        is_raw_video_ugc: isRawVideoUgc,
        requires_live_link: !isRawVideoUgc,
        type: isUgc ? 'ugc' : (t.type || 'campaign'),
        deal_type: isUgc ? 'UGC' : 'CAMPAIGN',
        ugc_order_id: isUgc ? (order?.id || t.deal_id || t.id) : null,
        ugc_order: order || null,
        ugc_brief_id: brief?.id || null,
        ugc_brief: brief || null,
        ugc_title: isUgc ? title : null,
        campaigns: campaign || null,
        campaign_title: title,
        // Direct-invite deals have no campaigns row: the agreement reads the invite's terms.
        invite_terms: inviteByThread[t.id] ? {
          title: inviteByThread[t.id].campaign_title || null,
          deliverables: inviteByThread[t.id].deliverables || null,
          timeline: inviteByThread[t.id].timeline || null,
        } : null,
        creator: {
          id: t.creator_id,
          user_id: t.creator_id,
          name: creatorName,
          full_name: creatorName,
          picture: creatorPic,
          photo: creatorPic,
          avatar: creatorPic,
          avatar_url: creatorPic,
          profile_picture_url: creatorPic,
          profile: {
            id: t.creator_id,
            user_id: t.creator_id,
            name: creatorName,
            full_name: creatorName,
            photo: creatorPic,
            picture: creatorPic,
            avatar: creatorPic,
            avatar_url: creatorPic,
            profile_picture_url: creatorPic
          }
        },
        brand: {
          id: t.brand_id,
          user_id: t.brand_id,
          name: brandName,
          company_name: brandName,
          picture: brandLogo,
          photo: brandLogo,
          logo: brandLogo,
          logo_url: brandLogo,
          avatar: brandLogo,
          profile: {
            id: t.brand_id,
            user_id: t.brand_id,
            company_name: brandName,
            name: brandName,
            logo: brandLogo,
            logo_url: brandLogo,
            photo: brandLogo,
            picture: brandLogo
          }
        },
        last_message: lastMsg,
        total_messages_count: totalByThread[t.id] ?? tMsgs.length,
        unread_count: unreadCount
      };
    });
  };

  // Re-add missing chat routes






  



  // --- Admin Chat Monitoring Routes ---






  // Reinstate user (unrestrict) → moved to admin_kyc_verification_routes.ts (setupAdminKycVerificationRoutes)

  // Setup Blog routes
  setupBlogRoutes(app, router, { privilegedSupabase, supabase, getDb, saveDb, parseAuthUser, logAdminAction, upload });
  // Session 57: one "Request payout" for all approved, unpaid money (creator Earnings design).
  setupCreatorPayoutRequestRoutes(router, { supabase, privilegedSupabase, parseAuthUser, sendNotification });
  setupKycPayoutMethodRoutes(router, { supabase, privilegedSupabase, getDb, parseAuthUser }); // v347: KYC UPI counts as the payout account
  setupBrandPaymentsRoutes(router, { supabase, privilegedSupabase, parseAuthUser }); // Session 57: brand Payments screen
  setupSignupSourceRoutes(router, { supabase, privilegedSupabase, parseAuthUser }); // Session 58: where a signup came from (Growth page)
  setupPaymentRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAction, sendNotification, fetchUserScopedTransactions, serializeChatMessage, insertChatMessageToSupabase, parseThreadState, getIsTestMode });
  // v337: block a user — registered BEFORE the chat / invite / apply routes (guards + list filters only).
  setupBlockRoutes(router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, getActingBrandId });
  setupChatCoreRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, ensureUGCChatThread, populateThreadData, insertChatMessageToSupabase });
  setupUgcOrderRoutes(app, router, { handleThreadApproveContent, handleUgcDeliverableSubmit, handleUgcLiveLinkSubmit, handleUgcOrderApprove, handleUgcOrderRevision, handleUgcOrderDeclineRevisions, handleUgcOrderCancel });
  setupCampaignThreadRoutes(app, router, {
    handleCampaignApprove: handleThreadApproveLiveLinks,
    handleCampaignApproveContent: handleThreadApproveContent,
    handleCampaignSubmitLiveLink: handleThreadSubmitLiveLink,
    handleCampaignSubmitContent: createCampaignDraftSubmitGuard(
      { supabase, privilegedSupabase, getDb, parseAuthUser },
      handleUgcDeliverableSubmit
    ),
    handleCampaignRevision,
    handleCampaignDeclineRevisions: handleCampaignDeclineDraftRevision,
    handleCampaignDeclineLiveLinks: handleThreadDeclineLiveLinksResubmission,
    handleCampaignCancel
  });

  const resolveThreadForDispatch = async (rawId: string) => {
    const db = getDb();
    let thread = (db.chat_threads || []).find((t: any) => t.id === rawId || t.deal_id === rawId);
    if (!thread && supabase) {
      try {
        const { data: thr } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(`id.eq.${rawId},deal_id.eq.${rawId}`)
          .maybeSingle();
        if (thr) thread = thr;
      } catch (e) { logIgnored("server:3743", e); }
    }
    if (!thread && (db.ugc_orders || []).some((o: any) => o.id === rawId || o.brief_id === rawId)) {
      return { id: rawId, is_ugc: true };
    }
    return thread || { id: rawId };
  };

  // Thin forwarders on old /chat/v2/... routes dispatching on isUgcThread
  router.post(["/chat/v2/threads/:id/reject-content", "/chat/v2/threads/:id/request-revision", "/chat/v2/threads/:threadId/reject-content", "/chat/v2/threads/:threadId/request-revision"], async (req, res) => {
    const thread = await resolveThreadForDispatch(req.params.id || req.params.threadId);
    if (isUgcThread(thread)) {
      return handleUgcOrderRevision(req, res);
    }
    return handleCampaignRevision(req, res);
  });

  router.post(["/chat/v2/threads/:id/mark-complete", "/chat/v2/threads/:threadId/mark-complete"], async (req, res) => {
    const thread = await resolveThreadForDispatch(req.params.id || req.params.threadId);
    if (isUgcThread(thread)) {
      return handleUgcOrderApprove(req, res);
    }
    return handleThreadApproveLiveLinks(req, res);
  });

  router.post(["/chat/v2/threads/:id/decline-revisions", "/chat/v2/threads/:threadId/decline-revisions"], async (req, res) => {
    const thread = await resolveThreadForDispatch(req.params.id || req.params.threadId);
    if (isUgcThread(thread)) {
      return handleUgcOrderDeclineRevisions(req, res);
    }
    // A campaign DRAFT decline. It used to go to the live-link decline handler.
    return handleCampaignDeclineDraftRevision(req, res);
  });

  router.post(["/chat/v2/threads/:id/cancel-order", "/chat/v2/threads/:id/cancel-claim", "/chat/v2/threads/:threadId/cancel-order", "/chat/v2/threads/:threadId/cancel-claim"], async (req, res) => {
    const thread = await resolveThreadForDispatch(req.params.id || req.params.threadId);
    if (isUgcThread(thread)) {
      return handleUgcOrderCancel(req, res);
    }
    return handleCampaignCancel(req, res);
  });

  router.post(["/chat/v2/threads/:id/approve-content", "/chat/v2/threads/:threadId/approve-content", "/chat/v2/threads/:id/content/approve", "/chat/v2/threads/:threadId/content/approve"], async (req, res) => {
    return handleThreadApproveContent(req, res);
  });

  router.post(["/chat/v2/threads/:id/submit-live-link", "/chat/v2/threads/:threadId/submit-live-link", "/chat/v2/threads/:id/submit-live-links", "/chat/v2/threads/:threadId/submit-live-links"], async (req, res) => {
    const thread = await resolveThreadForDispatch(req.params.id || req.params.threadId);
    if (isUgcThread(thread)) {
      return handleUgcLiveLinkSubmit(req, res);
    }
    return handleThreadSubmitLiveLink(req, res);
  });
  setupAdminContentRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, processBase64Image });
  // Session 41: "What's new" popup (admin writes, users see once).
  setupWhatsNewRoutes(router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser });
  setupHiwVideoRoutes(router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser }); // v436: How it works videos
  // Session 41: push notifications (deal pushes + admin promo pushes).
  setupPushRoutes(router, { supabase, privilegedSupabase, parseAuthUser });
  startProfileNudges(privilegedSupabase, kickPushLoop); // v378: incomplete-profile reminders (off until Ravi approves the texts)
  setupAppUpdateRoutes(router); // v336: POST /api/app/ios-update (iPhone app live update, scripts/ota-bundle.mjs)
  setupAdminSpeedRoutes(router, { supabase, privilegedSupabase, parseAuthUser });
  setupAdminVersionsCouponsRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAction });
  setupAdminKycVerificationRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAction, sendNotification, getSignedUgcUrl });
  setupAdminLogsCreatorsRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAction, sendNotification, checkAdminPerm, fetchUserScopedTransactions, getSignedUgcUrl, getUserPassword, recordUserPassword });
  setupAdminWaitlistRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, sendNotification, checkAdminPerm });
  // Session 36: campaign / deal refunds work like UGC refunds (refund account, admin UTR, brand status)
  setupCampaignRefundRoutes(router, { supabase, privilegedSupabase, getDb, parseAuthUser, sendNotification });
  // v348: admin decides the whole split of a deal payment (brand / creator / Ybex fee) + UTRs
  setupManualSettlementRoutes(router, { supabase, privilegedSupabase, getDb, parseAuthUser, sendNotification, logAdminAction });
  // Session 36: admin bulk email — strict audiences, unsubscribe, daily-capped queue, report, retry
  setupEmailBroadcastRoutes(router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAction });
  // v399 (email budget, backend/emailBudget.ts): in the night window (2:30–5:30 am IST) the waiting low-priority mails and
  // queued broadcasts go out with what is left of today's Resend quota. Runs on a timer and on incoming requests
  // (Cloud Run may pause timers when idle; any visit wakes it). Each check is cheap and at most once per 5 minutes.
  {
    const deps = { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAction };
    let lastBroadcastTick = 0;
    const nightTick = () => {
      try {
        tickEmailQueue();
        const now = Date.now();
        if (inLowWindow() && now - lastBroadcastTick > 10 * 60 * 1000) {
          lastBroadcastTick = now;
          processEmailQueue(deps as any, 40).catch(() => {});
        }
      } catch (e) { logIgnored("email-budget:tick", e); }
    };
    const t = setInterval(nightTick, 5 * 60 * 1000);
    (t as any).unref?.();
    emailNightTick = nightTick;
  }
  // Session 36: password-protected fee offer toggle (₹0 platform fee + convenience fee)
  setupFeeOfferRoutes(router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAction });
  // Session 36: creator promo codes (saved once in Earnings) + auto-apply launch offers
  setupCreatorCouponRoutes(router, { supabase, privilegedSupabase, parseAuthUser });
  // Session 36: creator referral programme (fee-free deals, Featured, share of Ybex fee, wallet)
  setupReferralRoutes(router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAction });
  // Session 39: admin-picked creators for the creator Home / onboarding (M35, M41)
  setupCreatorHomePicks(router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAction });
  setupAdminCampaignsSettingsRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAction, sendNotification, getSettings, getFullFeeAndReferralConfig, savePlatformSettings: (patch: any) => platformSettingsStore.save(patch) });
  // Complete wipe out of one account (session 27, rule 56).
  setupAdminWipeRoutes(router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAction });
  // v404 (QA P-1): self-deleted accounts are wiped after 30 days (needs users.deletion_requested_at)
  setupAccountPurge(router, { privilegedSupabase, getDb, saveDb, logAdminAction });
  setupAdminAgreementRoutes(router, { supabase, privilegedSupabase, getDb, parseAuthUser });
  // Session 29: honest numbers for the creator dashboard (read-only).
  setupCreatorDashboardRoutes(router, { supabase, privilegedSupabase, getDb, parseAuthUser, fetchUserScopedTransactions, getFullFeeAndReferralConfig });
  setupAdminSystemMaintenanceRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAction, insertChatMessageToSupabase });
  // Session 46: Admin Overview growth report (read-only numbers + a reminder button).
  setupAdminGrowthRoutes(router, { supabase, privilegedSupabase, getDb, parseAuthUser, logAdminAction, sendNotification, checkAdminPerm });
  setupAdminUsersEnforcementRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAction, sendNotification, sendActivityNotificationEmail, sendSuperAdminAlertEmail, checkAdminPerm, getUserPassword, recordUserPassword, DEFAULT_WARNING_TEMPLATES });
  setupAdminPitchLeadsRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAction, insertChatMessageToSupabase });
  setupCreatorStatsRoutes(router, { supabase, privilegedSupabase, getDb, parseAuthUser });
  setupUgcBrowseRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, ensureUGCChatThread, enrichBriefsWithBrandProfiles });
  setupSupportRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, sendNotification, logAdminAction });
  // v349: real Instagram numbers (username fetch, DM code, Instagram Login, daily refresh). Before the creators
  // routes on purpose: its guard on POST /creators/profile runs first.
  setupFollowerGate(router, { supabase, privilegedSupabase, parseAuthUser }); // v397 — before every /creators/profile handler
  setupInstagramRoutes(router, { supabase, privilegedSupabase, getDb, parseAuthUser, sendNotification, logAdminAction });
  // v357: a new creator's first profile save → "under_review" (DB default is "approved"). Before the locked creators routes.
  setupCreatorReviewGate(router, { supabase, privilegedSupabase, getDb, parseAuthUser });
  setupCreatorsRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, syncEntityTags, processBase64Image, getSettings, markupForRole, getActingBrandId, logTeamActivity, sanitizeCreatorProfile, fetchCreatorReviews, broadcastAdminNotification, insertChatMessageToSupabase });
  setupDealsRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, insertChatMessageToSupabase, handleThreadApproveLiveLinks });
  setupTagsAndNotificationsRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, getActingBrandId, sendActivityNotificationEmail });
  // Session 30: pause / close / matching creators + apply guard. Registered BEFORE the locked
  // campaign routes so the guard runs first; it only ever adds a refusal.
  setupCampaignManageRoutes(router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, getActingBrandId });
  setupCampaignsRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, sendNotification, serializeChatMessage, insertChatMessageToSupabase, syncEntityTags, getActingBrandId, createEscrowTransaction, isCreatorKycVerified });
  setupBrandsRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, syncEntityTags, processBase64Image, getActingBrandId, logTeamActivity, sanitizeBrandProfile, broadcastAdminNotification });
  setupContentSubmissionsRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, insertChatMessageToSupabase });
  setupBrowserDbRoutes(router, { parseAuthUser, getClient: () => privilegedSupabase || supabase, getDb: () => getDb(), saveDb: (db: any) => saveDb(db) });
  // Session 34: onboarding progress saved on the server (resume on any device).
  setupOnboardingProgressRoutes(router, { parseAuthUser, getClient: () => privilegedSupabase || null, getDb: () => getDb(), saveDb: (db: any) => saveDb(db) });
  // Session 34: consent records (Terms / Privacy / marketing / Creator & Brand Terms).
  setupConsentRoutes(router, { parseAuthUser, getClient: () => privilegedSupabase || null, getDb: () => getDb(), saveDb: (db: any) => saveDb(db) });
  setupMediaRoutes(router, { parseAuthUser, getDb: () => getDb(), getClient: () => privilegedSupabase || supabase });
  setupMiscRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, ensureBucketExists, getFullFeeAndReferralConfig, upload, getSettings, getActingBrandId });
  setupDealsChatRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, sendNotification, serializeChatMessage, insertChatMessageToSupabase, parseThreadState, updateThreadState, enrichThread, handleThreadApproveLiveLinks, handleThreadApproveContent, handleThreadSubmitLiveLink, handleThreadRejectLiveLinks, handleThreadDeclineLiveLinksResubmission, getIsTestMode });
  setupSessionRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser });
  setupAccountRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser });
  setupMissingRoutes(app, router, { supabase, privilegedSupabase, getDb, parseAuthUser });
  setupAuthRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser, logAdminAuth, getPermissionsForUser, broadcastAdminNotification, checkForgotPasswordRateLimit, recordUserPassword, sendSuperAdminAlertEmail, processBase64Image, syncEntityTags });
  // v286: Google / Apple sign-in for the app (redirect flow, see oauth_routes.ts).
  setupOAuthRoutes(router, { supabase, privilegedSupabase, getDb, saveDb });
  // v287: "Ybex Assist" feedback bot → support tickets (see feedback_routes.ts).
  setupFeedbackRoutes(router, { supabase, privilegedSupabase, parseAuthUser, getDb, saveDb });
  // v289: promo popup when the app opens (table promo_popups — scripts/sql/session43_promos.sql).
  setupPromoRoutes(router, { supabase, privilegedSupabase, parseAuthUser });
  setupChallengeRoutes(router, { supabase, privilegedSupabase, parseAuthUser }); // v367: /challenge/* + /admin/challenge/*
  setupAssistRoutes(router, { parseAuthUser }); // Session 51: POST /assist/ai (brands, daily limit)
  setAssistBrandMarkup(() => Number(markupForRole("brand", getSettings(getDb()))) || 0); // v329: saved-search budget = the marked-up rate brands see
  setupAssistDataRoutes(router, { parseAuthUser, privilegedSupabase }); // Session 52: chat history, shared daily limit, saved searches + push
  setupInvoiceRoutes(router, { parseAuthUser, privilegedSupabase }); // v419: Eva free invoices (saved on the server)
  setupPublicCreatorRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser });
  // Session 36: onboarding reminder emails (cron) + "Stop these reminders" link
  setupOnboardingReminderRoutes(router, { supabase, privilegedSupabase, getDb, saveDb });
  setupMarketIntelligenceRoutes(app, router, { supabase, privilegedSupabase, getDb, saveDb, parseAuthUser });

  // Support direct calls to admin API routes either with or without /api prefix
  app.use((req, res, next) => {
    if (req.path.startsWith('/admin/transactions') || req.path.startsWith('/admin/system-collabs') || req.path.startsWith('/ugc-orders/')) {
      req.url = `/api${req.url}`;
    }
    next();
  });

  // Session 43 (Ravi): new creators show on Explore only after waitlist approval. Applied to the
  // answer here because creators_routes.ts is a locked file (backend/exploreGate.ts has the rule).
  app.get("/api/creators/explore", (_req, res, next) => {
    const send = res.json.bind(res);
    (res as any).json = (body: any) => send(Array.isArray(body) ? dedupeByInstagram(body.filter((r: any) => visibleOnExplore(r))) : body); // v419: one card per Instagram
    next();
  });
  app.use("/api", router);

  // Catch unhandled /api routes and return 404 JSON instead of falling through to Vite HTML
  app.all("/api/*", (req, res) => {
    res.status(404).json({ detail: `API endpoint ${req.method} ${req.path} not found`, code: "NOT_FOUND" });
  });
  
  // v378 (QA M13 / L3): keep the real status of client errors (bad JSON 400, too large 413 …) instead of 500 for
  // everything; one log line instead of a full stack per error; no internal error text to the browser on a 500.
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    const status = Number(err?.status || err?.statusCode) || 500;
    if (status >= 500) console.error(`[error] ${req.method} ${req.path}:`, err?.message || err);
    if (res.headersSent) return next(err);
    res.status(status).json({ detail: status >= 500 ? "Something went wrong. Please try again." : (err?.expose && err?.message ? err.message : (status === 413 ? "That is too large." : "Bad request.")) });
  });

  app.use('/assets', express.static(path.join(process.cwd(), 'public', 'assets')));
  // Session 41 — installable app: Android app link check + web app manifest.
  app.use('/.well-known', express.static(path.join(process.cwd(), 'public', '.well-known')));
  app.get('/manifest.json', (req, res) => res.sendFile(path.join(process.cwd(), 'public', 'manifest.json')));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.join(process.cwd(), 'dist', 'client', 'index.html'))
      ? path.join(process.cwd(), 'dist', 'client')
      : path.join(process.cwd(), 'dist');
    // v388 (QA): the hashed build files under /assets never change, so browsers and the edge may keep them for a year
    // (the SW / index.html / manifest are outside /assets and stay fresh).
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (/[\\/]assets[\\/]/.test(filePath) && /\.(js|css|woff2?|png|jpe?g|webp|svg|ico)$/i.test(filePath)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        // v398 (Ravi: admin "Failed to fetch dynamically imported module" after a deploy): the app page and the
        // service-worker files are always checked with the server, so a reload gets the new version's file names.
        else if (/\.html$/i.test(filePath) || /[\\/](sw\.js|registerSW\.js|push-sw\.js|workbox-[\w-]+\.js)$/i.test(filePath)) res.setHeader("Cache-Control", "no-cache");
      },
    }));
    // v295: robots.txt, sitemap.xml and per-article SEO tags for /blog and /blog/:slug (backend/blogSeo.ts)
    setupBlogSeoRoutes(app, { getClient: () => privilegedSupabase || supabase, distPath });
    // v388 (QA: after a deploy a phone with the OLD page asked for an old hashed chunk, got index.html with status 200, the import failed in a
    // loop): a missing /assets file is a real 404, so the app's "new version" recovery can kick in.
    app.get(/^\/assets\//, (_req, res) => { res.status(404).type('text/plain').send('Not found'); });
    app.get('*', (req, res) => {
      res.setHeader("Cache-Control", "no-cache"); // v398: never an old app page from the browser cache
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }


  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  startSubmissionCleanup(() => privilegedSupabase); // v429: 15-day delete of reviewed videos (service role only)
}
startServer();

/** Session 58 (Ravi): websites allowed to call the API from a browser: ybexmedia.in, the app (ybexapp.ai.studio),
 *  local development, the page's own host, plus anything in CORS_ORIGINS / APP_URL. */
function corsOriginAllowed(origin: string, host: string): boolean {
  let u: URL;
  try { u = new URL(origin); } catch { return false; }
  const h = u.hostname.toLowerCase();
  if (["ybexmedia.in", "www.ybexmedia.in", "ybexapp.ai.studio", "localhost", "127.0.0.1"].includes(h)) return true;
  if (h.endsWith(".ybexmedia.in")) return true;
  if (host && u.host.toLowerCase() === host.toLowerCase()) return true;
  const extra = [process.env.APP_URL, ...(String(process.env.CORS_ORIGINS || "").split(","))].map((x) => String(x || "").trim()).filter(Boolean);
  return extra.some((x) => { try { return new URL(x).host.toLowerCase() === u.host.toLowerCase(); } catch { return false; } });
}
