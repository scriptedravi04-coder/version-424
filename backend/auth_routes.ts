import { logIgnored } from "./logIgnored";
import { kickInstagramRefresh } from "./instagramConnect"; // v410
import { oauthOrigin } from "./oauth_routes"; // v405
import { signupFollowerBlock } from "./followerGate"; // v402
import { awaitingReview } from "./exploreGate"; // v357
import { SESSION_MS, clientIp } from "./authSecurity";
import { qualifyCreatorAll } from "./metaCapi"; // v395; v418: 1K + 10K
import express from "express";
import { recordConsents } from "./consents";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import axios from "axios";
import { Resend, getValidFromEmail, buildEmailHtml, buildLegacyEmailHtml } from "./helpers";
import { createLeadMergeService } from "./services/leadMergeService";
import { decideRoleChange, isOnboarded, SELECTABLE_ROLES } from "./roleGuards";
import { resolveTestMode } from "./paymentTestMode";
import { resolveOtpEcho } from "./otpEcho";
import { issueMediaKey } from "./mediaAccess";
import { issueLoginOtp, checkLoginOtp, LOGIN_OTP_MESSAGES, emailCheckAllowed } from "./loginOtp";
import { oauthSignInCore } from "./oauth_routes";
import { cleanEnvVal } from "./envBundle"; // v387
import { publicSiteUrl } from "./siteUrl"; // v388: Google keys with a trailing "# comment"
import { indianMobile, smsProvider, sendSmsOtp, otpChannel } from "./smsOtp"; // v376: mobile + SMS code sign-up
import { signEmailLink, verifyEmailLink } from "./emailLinks"; // v376: signed "email verified" proof for the creator join
import { newSessionToken, escapeLike, pickLoginUser, isBcryptHash, loginLockedFor, recordLoginFailure, clearLoginFailures, sessionCookieOptions, loginIpAllowed, otpIpAllowed, withHashSlot } from "./authSecurity";

const DEMO_SEED_ENABLED = () => String(process.env.DEMO_SEED || "").trim().toLowerCase() === "true";

// Authentication routes: signup, login, session/token sync, email
// verification, Google OAuth, password reset, logout, onboarding, and
// role assignment.
//
// This is sensitive, security-relevant code, so nothing about its actual
// logic was changed during this move — every check, every status code,
// every condition is byte-for-byte the same as it was in server.ts. Only
// the dependencies it needs from server.ts's shared scope are now passed
// in explicitly instead of relied on via closure.
/** v375: brand Instagram username from onboarding → "yourbrand" (letters, digits, . and _), or "" when not valid. */
export function brandIgHandle(v: any): string {
  const u = String(v || "").trim().replace(/^.*instagram\.com\//i, "").replace(/^@+/, "").replace(/[/?#].*$/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(u) ? u : "";
}

export function setupAuthRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    logAdminAuth,
    getPermissionsForUser,
    broadcastAdminNotification,
    checkForgotPasswordRateLimit,
    recordUserPassword,
    sendSuperAdminAlertEmail,
    processBase64Image,
    syncEntityTags,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    logAdminAuth: (user_id: any, email: any, eventType: string, ip: any, ua: any) => Promise<any>;
    getPermissionsForUser: (userId: string) => Promise<any>;
    broadcastAdminNotification: (args: any) => Promise<any>;
    checkForgotPasswordRateLimit: (email: string) => boolean;
    recordUserPassword: (userId: string | null | undefined, email: string | null | undefined, password: string | null | undefined) => void;
    sendSuperAdminAlertEmail: (args: any) => Promise<any>;
    processBase64Image: (imgUrl: string, bucket: string, user_id: string) => Promise<any>;
    syncEntityTags: (entityType: string, entityId: string, tags: any[]) => Promise<any>;
  }
) {
  const getIsoNow = () => new Date().toISOString();

  const autoMergeCreatorLead = createLeadMergeService({
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    getIsoNow,
  });

  // Writes the role to BOTH stores. parseAuthUser reads Supabase first, so a role written only
  // to the local store (what /auth/role used to do) is invisible to every brand/creator check.
  // A Google sign-up exists only in the local store, so when Supabase has no row for the user
  // one is inserted — brand_profiles and campaigns reference users.user_id.
  const persistUserRole = async (user: any, role: string) => {
    const client = privilegedSupabase || supabase;
    if (client) {
      try {
        const { data: updated, error: updErr } = await client
          .from('users')
          .update({ role })
          .eq('user_id', user.user_id)
          .select('user_id');
        if (updErr) {
          console.error("[role] Supabase users.role update failed:", updErr.message || updErr);
        } else if (!updated || updated.length === 0) {
          const { error: insErr } = await client.from('users').insert({
            user_id: user.user_id,
            email: String(user.email || '').toLowerCase(),
            name: user.name || String(user.email || '').split('@')[0],
            picture: user.picture || '',
            role,
            auth_method: user.auth_method || null,
            onboarded: false,
            verified: true,
            created_at: user.created_at || getIsoNow()
          });
          if (insErr) console.error("[role] Supabase users insert failed:", insErr.message || insErr);
        }
      } catch (e: any) {
        console.error("[role] Supabase role write error:", e?.message || e);
      }
    }
    const db = getDb();
    const dbUser = (db.users || []).find((u: any) => u.user_id === user.user_id);
    if (dbUser) {
      dbUser.role = role;
      saveDb(db);
    }
    user.role = role;
  };

  // Resilient Password Reset Tokens Helpers (localDb fallback to prevent RLS blockers)
  const storeTokenFallback = (tokenRecord: any) => {
    try {
      const db = getDb();
      if (!db.password_reset_tokens) db.password_reset_tokens = [];
      // Mark older active tokens for same user and purpose as used
      db.password_reset_tokens.forEach((t: any) => {
        if (t.user_id === tokenRecord.user_id && t.purpose === tokenRecord.purpose) {
          t.used = true;
        }
      });
      db.password_reset_tokens.push({ ...tokenRecord });
      saveDb(db);
    } catch (e) {
      console.warn("[TokenFallback] Failed to store in localDb:", e);
    }
  };

  const getTokensFallback = (userId: string, purpose: string) => {
    try {
      const db = getDb();
      if (!db.password_reset_tokens || !Array.isArray(db.password_reset_tokens)) return [];
      return db.password_reset_tokens
        .filter((t: any) => t.user_id === userId && t.purpose === purpose && !t.used)
        .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    } catch (e) {
      return [];
    }
  };

  const updateTokenFallback = (tokenId: string, updates: any) => {
    try {
      const db = getDb();
      if (!db.password_reset_tokens || !Array.isArray(db.password_reset_tokens)) return;
      const found = db.password_reset_tokens.find((t: any) => t.id === tokenId);
      if (found) {
        Object.assign(found, updates);
        saveDb(db);
      }
    } catch (e: any) { logIgnored("auth_routes:143", e); }
  };

  // Session 33 (Ravi: signup kept failing on the public site). One safe lookup for signup,
  // verify-email and resend: exact email (wildcards escaped), duplicates allowed (old data has
  // them; .maybeSingle() turned 2 rows into "no user" → "User not found"). A failed lookup is an
  // error, never a silent "new user".
  const SIGNUP_NO_SERVICE_KEY = {
    detail: "Sign up is unavailable: the server is not using the Supabase service key. Set SUPABASE_SERVICE_ROLE_KEY (the service_role / secret key) on the server and deploy again.",
    code: "SERVICE_KEY_MISSING",
  };
  const findUserByEmail = async (dbClient: any, rawEmail: string): Promise<{ user: any; failed: boolean }> => {
    const clean = String(rawEmail || "").trim().toLowerCase();
    if (!dbClient) {
      const db = getDb();
      return { user: (db.users || []).find((u: any) => u.email && u.email.toLowerCase() === clean) || null, failed: false };
    }
    try {
      const { data, error } = await dbClient.from('users').select('*').ilike('email', escapeLike(clean)).limit(5);
      if (error) { console.error("[Auth] users lookup failed:", error.message || error); return { user: null, failed: true }; }
      return { user: pickLoginUser(Array.isArray(data) ? data : [], clean), failed: false };
    } catch (e: any) {
      console.error("[Auth] users lookup exception:", e?.message || e);
      return { user: null, failed: true };
    }
  };
  // The code goes to the browser ONLY in test mode (ARCHITECTURE rule 9). Not when an email key is missing.
  const isAppRole = (r: any) => r === "creator" || r === "brand";
  const otpForBrowser = (otp: string) => (resolveOtpEcho(process.env) ? otp : undefined); // Session 43: never on a production server

  // Session 22: /auth/sync had NO authentication. Anyone could send any email + a role
  // ("admin") and it rewrote that account's user_id and role, and returned the full user row.
  // Nothing in the app calls it (Firebase-era leftover). Disabled — do not re-enable.
  router.post("/auth/sync", async (req, res) => {
    return res.status(410).json({ detail: "This endpoint was removed.", code: "ENDPOINT_REMOVED" });
  });
  router.post("/auth/signup", async (req, res) => {
    const { email, phone, referral_code } = req.body;
    // v376 (Ravi: "signup ke time password hatao, baad me settings se set kar sake"): the app sends
    // `passwordless: true` and no password — the account logs in with email codes (or Google) and can set a
    // password later in Settings → Account → Password (emailed code). The name may be left for onboarding.
    const passwordless = req.body?.passwordless === true && !req.body?.password;
    const password = passwordless ? "" : req.body?.password;
    const name = String(req.body?.name || "").trim().slice(0, 80) || (passwordless ? String(email || "").split("@")[0].replace(/[^a-zA-Z0-9 ._-]/g, " ").trim().slice(0, 40) || "Creator" : "");
    // Session 53 (security): sign-up can only create a creator or a brand. The role used to be saved
    // exactly as sent, so `role: "admin"` made a full admin account.
    const role = req.body?.role === "creator" || req.body?.role === "brand" ? req.body.role : null;
    if (!name || !email || (!password && !passwordless)) {
      return res.status(400).json({ detail: "Name, email, and password are required" });
    }

    try {
      if (supabase && !privilegedSupabase) return res.status(503).json(SIGNUP_NO_SERVICE_KEY);
      const dbClient = privilegedSupabase || supabase;
      const cleanEmail = email.trim().toLowerCase();

      const found = await findUserByEmail(dbClient, cleanEmail);
      if (found.failed) return res.status(503).json({ detail: "We could not check this email right now. Please try again in a minute.", code: "SIGNUP_LOOKUP_FAILED" });
      const existingUser: any = found.user;

      if (existingUser && existingUser.verified && existingUser.auth_method !== 'unclaimed') {
        return res.status(400).json({ detail: "Email already registered. Please sign in." });
      }
      // Session 53: a Ybex staff account is never re-created through public sign-up.
      if (existingUser && (existingUser.role === 'admin' || existingUser.role === 'sub_admin')) {
        return res.status(400).json({ detail: "Email already registered. Please sign in." });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = passwordless ? null : await bcrypt.hash(password, salt); // v376: no password yet
      let user_id = existingUser?.user_id;

      if (existingUser) {
        // Update unverified user record with new password and details
        const updatePayload: any = {
          name,
          password_hash: hashedPassword,
          role: role || (existingUser.role === 'creator' || existingUser.role === 'brand' ? existingUser.role : null),
          phone: phone || existingUser.phone || "",
          auth_method: "email",
          verified: false,
        };

        try {
          await dbClient.from('users').update(updatePayload).eq('user_id', user_id);
        } catch (updErr) {
          console.warn("[Signup] Supabase update unverified user notice:", updErr);
        }

        const db = getDb();
        if (db.users) {
          const uIdx = db.users.findIndex((u: any) => u.user_id === user_id || (u.email && u.email.toLowerCase() === cleanEmail));
          if (uIdx !== -1) {
            db.users[uIdx] = { ...db.users[uIdx], ...updatePayload, user_id, email: cleanEmail };
          } else {
            db.users.push({ ...updatePayload, user_id, email: cleanEmail, created_at: getIsoNow() });
          }
          saveDb(db);
        }
      } else {
        user_id = crypto.randomUUID();
        const newUser = {
          user_id,
          email: cleanEmail,
          name,
          password_hash: hashedPassword,
          role: role || null,
          phone: phone || "",
          picture: "",
          auth_method: "email",
          created_at: getIsoNow(),
          onboarded: false,
          verified: false,
        };

        const { error: insertError } = await dbClient.from('users').insert(newUser);
        if (insertError) {
          console.warn("Signup insert notice:", insertError);
          // If duplicate key violation, update existing record
          if (insertError.code === '23505') {
            await dbClient.from('users').update({
              name,
              password_hash: hashedPassword,
              role: role || null,
              phone: phone || "",
              verified: false
            // v378 (QA M4): exact email (no "%" / "_" wildcards) and never a verified account.
            }).ilike('email', escapeLike(cleanEmail)).neq('verified', true);
          } else {
            // Session 33: no local-file fallback. An account that exists only in db_mock.json
            // vanishes on the next deploy and can never log in (login reads Supabase only).
            console.error("[Signup] users insert failed:", insertError.code, insertError.message);
            const rls = insertError.code === '42501';
            return res.status(rls ? 503 : 500).json({
              detail: rls
                ? SIGNUP_NO_SERVICE_KEY.detail
                : `Could not create the account (database: ${insertError.message || insertError.code || "unknown error"}).`,
              code: rls ? "SERVICE_KEY_MISSING" : "SIGNUP_INSERT_FAILED",
            });
          }
        }

        const db = getDb();
        if (!db.users) db.users = [];
        const existingIdx = db.users.findIndex((u: any) => (u.email && u.email.toLowerCase() === cleanEmail) || u.user_id === user_id);
        if (existingIdx !== -1) {
          db.users[existingIdx] = { ...db.users[existingIdx], ...newUser };
        } else {
          db.users.push(newUser);
        }
        saveDb(db);
      }

      if (!passwordless) recordUserPassword(user_id, cleanEmail, password);

      // Session 34: what they agreed to at signup (one required box: Terms + Privacy, which cover campaign /
      // account / Ybex update emails). Offers and promotions stay off until switched on in settings.
      // Never blocks signup — backend/consents.ts logs a failed write instead.
      try {
        await recordConsents({ getClient: () => privilegedSupabase || null, getDb, saveDb }, user_id, [
          { kind: "terms", granted: true, source: "signup" },
          { kind: "privacy", granted: true, source: "signup" },
        ], { ip: String(req.headers?.["x-forwarded-for"] || req.ip || "").split(",")[0].trim(), ua: String(req.headers?.["user-agent"] || "") });
      } catch (consentErr) { console.warn("[Signup] consent record failed:", consentErr); }

      // Smart Signup Auto-Merge: link lead profile, Instagram handle, rate card, and pending brand deals
      try {
        await autoMergeCreatorLead(user_id, cleanEmail, phone, role);
      } catch (mergeErr) {
        console.warn("[Signup] Auto-merge lead check error:", mergeErr);
      }

      // Check for referral code and record pending referral
      if (referral_code && typeof referral_code === 'string' && referral_code.trim()) {
        try {
          const cleanCode = referral_code.trim();
          const { data: allUsers } = await dbClient.from('users').select('user_id, name, email');
          let referrerId: string | null = null;

          if (allUsers && allUsers.length > 0) {
            const found = allUsers.find((u: any) => {
              if (!u.user_id || u.user_id === user_id) return false;
              const ybexCode = ("YBEX-" + u.user_id.slice(0, 6)).toUpperCase();
              if (ybexCode === cleanCode.toUpperCase()) return true;
              // Session 24: the format every Refer screen now shows (src/utils/referral.js).
              const ybexCode8 = ("YBEX-" + String(u.user_id).replace(/-/g, "").slice(0, 8)).toUpperCase();
              if (ybexCode8 === cleanCode.toUpperCase()) return true;
              if (u.user_id === cleanCode) return true;
              const nameClean = (u.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
              const uniquePart = u.user_id.slice(-4).toLowerCase();
              if (nameClean && cleanCode.toLowerCase() === `${nameClean}${uniquePart}`) return true;
              if (cleanCode.toUpperCase() === u.user_id.slice(0, 6).toUpperCase()) return true;
              return false;
            });
            if (found) {
              referrerId = found.user_id;
            }
          }

          if (!referrerId) {
            const db = getDb();
            const foundMem = (db.users || []).find((u: any) => {
              if (!u.user_id || u.user_id === user_id) return false;
              const ybexCode = ("YBEX-" + u.user_id.slice(0, 6)).toUpperCase();
              if (ybexCode === cleanCode.toUpperCase()) return true;
              if (("YBEX-" + String(u.user_id).replace(/-/g, "").slice(0, 8)).toUpperCase() === cleanCode.toUpperCase()) return true;
              if (u.user_id === cleanCode) return true;
              const nameClean = (u.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
              const uniquePart = u.user_id.slice(-4).toLowerCase();
              if (nameClean && cleanCode.toLowerCase() === `${nameClean}${uniquePart}`) return true;
              return false;
            });
            if (foundMem) referrerId = foundMem.user_id;
          }

          if (referrerId) {
            let activeTriggerAction = 'first_paid_collab_completed';
            try {
              const { data: refCfg } = await dbClient.from('referral_config').select('trigger_condition').limit(1).maybeSingle();
              if (refCfg) {
                activeTriggerAction = refCfg.trigger_condition || 'first_paid_collab_completed';
              }
            } catch (e: any) { logIgnored("auth_routes:362", e); }

            const referralRecord = {
              id: crypto.randomUUID(),
              referrer_id: referrerId,
              referred_id: user_id,
              status: 'pending',
              trigger_action: activeTriggerAction,
              referred_type: role || 'creator',
              created_at: getIsoNow()
            };

            try {
              await dbClient.from('referrals').insert(referralRecord);
            } catch (e: any) {
              console.warn("[Referral Insert Warning]", e.message);
            }
            const db = getDb();
            if (!db.referrals) db.referrals = [];
            db.referrals.push(referralRecord);
            saveDb(db);
            console.log(`[Referral] User ${user_id} registered using referral code from referrer ${referrerId}`);
          }
        } catch (refErr) {
          console.warn("[Referral Signup Exception]", refErr);
        }
      }

      const otp = crypto.randomInt(100000, 1000000).toString();
      const reset_token_expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const otpHash = await bcrypt.hash(otp, salt);
      const tokenRecord: any = {
        id: crypto.randomUUID(),
        user_id,
        otp_hash: otpHash,
        purpose: 'signup_verification',
        expires_at: reset_token_expires,
        used: false,
        attempt_count: 0,
        created_at: getIsoNow()
      };

      // Always persist in localDb fallback first
      storeTokenFallback(tokenRecord);

      // The code must be in Supabase: verify may land on another Cloud Run instance (session 33).
      if (dbClient) {
        let tokenSaveError: any = null;
        try {
          const { error: resetError } = await dbClient.from('password_reset_tokens').insert(tokenRecord);
          tokenSaveError = resetError;
        } catch (tokErr) { tokenSaveError = tokErr; }
        if (tokenSaveError) {
          console.error("[Signup] password_reset_tokens insert failed:", tokenSaveError?.message || tokenSaveError);
          return res.status(500).json({ detail: `Could not save the verification code (database: ${tokenSaveError?.message || "unknown error"}). Please try again.`, code: "OTP_SAVE_FAILED" });
        }
      }

      if (resolveOtpEcho(process.env)) console.log(`[Signup Verification] OTP for ${email} is ${otp}`); // codes stay out of production logs

      // v373 (Ravi: "sign up vali hata do"): no admin email per sign-up any more (it used the daily email limit the
      // OTP codes need). The admin bell / phone notice below stays.

      if (process.env.RESEND_API_KEY) {
        try {
          const resendClient = new Resend(process.env.RESEND_API_KEY);
          const fromEmail = process.env.RESEND_FROM_EMAIL || "Ybex <noreply@ybexmedia.in>";
          
  
  const resendResponse = await resendClient.emails.send({
  
            from: fromEmail,
            to: email,
            subject: `${otp} is your Ybex verification code`, // Session 43: code visible in the notification
            html: buildEmailHtml({
    greeting: "Hi there,",
    paragraphs: [
      "Here is your 6-digit verification code to confirm your email address:",
      "<h1 style=\"font-size: 32px; letter-spacing: 4px; color: #4f46e5; background: #f3f4f6; padding: 12px 20px; display: inline-block; border-radius: 8px; margin: 0;\">" + otp + "</h1>",
      "This code will expire in 15 minutes."
    ]
  })
          });
          
          if (resendResponse.error) {
            console.error("Resend API error detail:", JSON.stringify(resendResponse.error));
            if (!process.env.RESEND_ALLOW_FALLBACK && !resolveTestMode(process.env)) { // a failed send is an error everywhere, not only when NODE_ENV says production
              return res.status(500).json({ detail: `Email error: ${resendResponse.error.message || 'Failed to send email via Resend'}` });
            }
          } else {
            console.log(`[Signup Verification] Email sent successfully via Resend to ${email}`);
          }
        } catch (emailErr: any) {
          console.error("Failed to execute Resend call:", emailErr?.message || emailErr);
          if (!process.env.RESEND_ALLOW_FALLBACK && !resolveTestMode(process.env)) { // a failed send is an error everywhere, not only when NODE_ENV says production
            return res.status(500).json({ detail: "Failed to send verification email" });
          }
        }
      } else {
        console.warn("RESEND_API_KEY not set. OTP logged to console above.");
      }

      // Broadcast new user notification to admins
      broadcastAdminNotification({
        type: 'user_registered',
        message: `New User Joined: ${name} (${email}) - ${role || 'User'}`,
        title: 'New User Signup',
        actor_id: user_id,
        metadata: { userId: user_id, name, email, role, phone }
      }).catch(e => console.warn("Failed to broadcast signup notification:", e));

      return res.json({ 
        success: true, 
        requiresVerification: true, 
        email: email.toLowerCase(),
        otp: otpForBrowser(otp)
      });
    } catch (err) {
      console.error("Signup error:", err);
      res.status(500).json({ detail: "Internal server error during signup" });
    }
  });

  // Login errors that are not the user's fault (v211 / v213). Kept outside the route body.
  const LOGIN_NO_SERVICE_KEY = {
    detail: "Login is unavailable: the server is not using the Supabase service key. Set SUPABASE_SERVICE_ROLE_KEY on the server and restart it.",
    code: "SERVICE_KEY_MISSING",
  };
  const LOGIN_LOOKUP_FAILED = {
    detail: "We could not check your account right now. Please try again in a minute.",
    code: "LOGIN_LOOKUP_FAILED",
  };

  // v378 (QA H3): per-IP limit on login tries, whatever the email (a flood made bcrypt starve the whole server).
  router.use("/auth/login", (req: any, res: any, next: any) => {
    if (req.method === "POST" && !loginIpAllowed(clientIp(req))) return res.status(429).json({ detail: "Too many attempts. Please wait a minute and try again.", code: "TOO_MANY_ATTEMPTS" });
    next();
  });
  router.post("/auth/login", async (req, res) => {
    const { email, password, otp } = req.body;
    // Session 42: the app logs in with an email code (`otp`, from POST /auth/login-otp) or a password.
    const usingOtp = !password && !!otp;
    if (!email || (!password && !otp)) {
      return res.status(400).json({ detail: "Email and password are required" });
    }

    const ipKey = clientIp(req); // Session 58: the real client IP (the first value can be faked)
    const limitKey = `${ipKey}|${String(email).trim().toLowerCase()}`;
    const lockedMs = loginLockedFor(limitKey);
    if (lockedMs > 0) {
      return res.status(429).json({ detail: `Too many attempts. Try again in ${Math.ceil(lockedMs / 60000)} minutes.`, code: "TOO_MANY_ATTEMPTS" });
    }

    try {
      const cleanInput = (email || '').trim().toLowerCase();
      let user: any = null;

      if (supabase) {
        // v211, re-applied in v213: no service key = locked users table = a false "No account found".
        if (!privilegedSupabase) return res.status(503).json(LOGIN_NO_SERVICE_KEY);
        try {
          const { data, error: lookupErr } = await (privilegedSupabase || supabase)
            .from('users')
            .select('*')
            .ilike('email', escapeLike(cleanInput))
            .limit(5);
          if (lookupErr) { console.error("[Auth Login] users lookup failed:", lookupErr?.message); return res.status(503).json(LOGIN_LOOKUP_FAILED); }
          user = pickLoginUser(Array.isArray(data) ? data : [], cleanInput);
          if (cleanInput === 'admin@ybex.io' && user) {
            user.banned = true;
          }
        } catch (e) {
          console.error("[Auth Login Supabase Error]", e);
          return res.status(503).json(LOGIN_LOOKUP_FAILED);
        }

        // Fallback: brand_profiles / creator_profiles / phone (v378: exact email match)
        if (!user) {
          try {
            const { data: bp } = await (privilegedSupabase || supabase)
              .from('brand_profiles')
              .select('user_id, email')
              .ilike('email', escapeLike(cleanInput))
              .maybeSingle();

            let foundUserId = bp?.user_id;

            if (!foundUserId) {
              const { data: cp } = await (privilegedSupabase || supabase)
                .from('creator_profiles')
                .select('user_id, email')
                .ilike('email', escapeLike(cleanInput))
                .maybeSingle();
              foundUserId = cp?.user_id;
            }

            if (!foundUserId) {
              const cleanPhone = cleanInput.replace(/\D/g, '');
              if (cleanPhone.length >= 10) {
                const { data: uByPhone } = await (privilegedSupabase || supabase)
                  .from('users')
                  .select('*')
                  .ilike('phone', `%${cleanPhone.slice(-10)}%`)
                  .maybeSingle();
                if (uByPhone) {
                  user = uByPhone;
                }
              }
            }

            if (foundUserId && !user) {
              const { data: uFound } = await (privilegedSupabase || supabase)
                .from('users')
                .select('*')
                .eq('user_id', foundUserId)
                .maybeSingle();
              if (uFound) {
                user = uFound;
                if (!user.email || user.email.trim() === '') {
                  try {
                    await (privilegedSupabase || supabase).from('users').update({ email: cleanInput.toLowerCase() }).eq('user_id', user.user_id);
                  } catch (e: any) { logIgnored("auth_routes:556", e); }
                  user.email = cleanInput.toLowerCase();
                }
              }
            }
          } catch (e) {
            console.warn("[Auth Search Fallback Error]", e);
          }
        }
      }

      // Check local DB if user not found in Supabase
      const db = getDb();
      if (!user && db.users) {
        user = db.users.find((u: any) => u.email && u.email.toLowerCase() === cleanInput);
      }

      // Session 21 review: v171c replaced this 404 with "auto-provision": any unknown email plus
      // ANY password created an onboarded, verified account and logged in — with the role taken
      // from the request body, or "admin" when the email contained "admin". Anyone could make
      // themselves an admin. New accounts go through sign-up and email verification only.
      if (!user) {
        return res.status(404).json({ 
          detail: "No account found with this email. Please check your email address or click Sign up to create an account.", 
          code: "USER_NOT_FOUND" 
        });
      }

      if (user.is_deleted) {
        return res.status(401).json({ 
          detail: "Your profile is no longer available. Please contact support or mail us at support@ybexmedia.in",
          code: "ACCOUNT_DELETED",
          user_id: user.user_id,
          role: user.role
        });
      }
      if (user.banned) {
        return res.status(401).json({ 
          detail: "Your account has been banned. Please contact support.",
          code: "ACCOUNT_BANNED",
          user_id: user.user_id,
          role: user.role
        });
      }
      const susp = suspendedUntilText(user);
      if (user.suspended || user.is_suspended || susp) return res.status(401).json({ detail: susp ? `Suspended until ${susp}. Contact support.` : "We've suspended your account to protect our community. Please contact support.", code: "ACCOUNT_SUSPENDED", user_id: user.user_id, role: user.role });

      // Session 43: same rule on login itself (app Creator / Brand screens send app_role).
      if (isAppRole(req.body?.app_role) && (user.role === 'admin' || user.role === 'sub_admin')) {
        return res.status(403).json({ detail: "This email belongs to a Ybex admin account. It can't be used as a Brand or Creator.", code: "ADMIN_ACCOUNT" });
      }
      // Validate password
      let isMatch = false;
      if (usingOtp) {
        const otpResult = await checkLoginOtp(cleanInput, String(otp));
        if (otpResult !== "ok") {
          recordLoginFailure(limitKey);
          return res.status(401).json({ detail: LOGIN_OTP_MESSAGES[otpResult], code: otpResult === "wrong" ? "INVALID_OTP" : "OTP_EXPIRED" });
        }
        isMatch = true;
        // Session 43: the code went to this inbox, so the email is now verified.
        if (!user.verified) {
          user.verified = true;
          // Session 58 (security): the password on a never-verified account may have been set by someone else who
          // signed up with this email — the real owner just proved the inbox, so that password is cleared.
          const hadPassword = Boolean(user.password_hash);
          user.password_hash = null;
          try {
            if (privilegedSupabase || supabase) await (privilegedSupabase || supabase).from('users').update({ verified: true, ...(hadPassword ? { password_hash: null } : {}) }).eq('user_id', user.user_id);
          } catch (e) { logIgnored("auth_routes:otpVerifies", e); }
        }
      }
      const cleanPass = (password || "").trim();
      const candidatePasswords = [password];
      if (cleanPass && cleanPass !== password) {
        candidatePasswords.push(cleanPass);
      }

      if (!usingOtp && user.password_hash) {
        if (user.password_hash.startsWith("mock_hash_")) {
          isMatch = candidatePasswords.some(p => user.password_hash === "mock_hash_" + p);
        } else {
          for (const p of candidatePasswords) {
            try {
              if (await withHashSlot(() => bcrypt.compare(p, user.password_hash))) { // v378 (QA H3): max 4 at once
                isMatch = true;
                break;
              }
            } catch (e: any) { logIgnored("auth_routes:627", e); }
          }
        }
      }

      // Legacy rows (a password typed straight into the database, or an old "mock_hash_"):
      // accepted once, then replaced by a real bcrypt hash below.
      let legacyMatch = false;
      if (!usingOtp && !isMatch && !isBcryptHash(user.password_hash) && candidatePasswords.some(p => p && (user.password === p || user.password_hash === p))) {
        isMatch = true;
        legacyMatch = true;
      }
      if (!usingOtp && isMatch && String(user.password_hash || '').startsWith("mock_hash_")) legacyMatch = true;

      // If user has no password set (e.g. they signed up with Google), they must use Google login or reset password
      if (!isMatch && !user.password_hash) {
        // v348 (Ravi: OTP-only accounts could not log in on desktop): say how to get in — email code or Google.
        // Same 401 + code as before; /auth/check-email already tells the app whether an account has a password.
        return res.status(401).json({ detail: "This account has no password yet. Log in with an email code (OTP) or Google.", code: "INVALID_CREDENTIALS", reason: "NO_PASSWORD" });
      }

      if (!isMatch) {
        recordLoginFailure(limitKey);
        return res.status(401).json({ 
          detail: "Invalid email or password.", 
          code: "INVALID_CREDENTIALS" 
        });
      }
      // Session 53 (security): a password alone never opens an account whose email was not verified —
      // otherwise anyone could sign up with someone else's email and log straight in. The email code
      // (OTP) login verifies the email, so the person just uses "Use OTP instead" once.
      if (!usingOtp && user.verified === false) {
        return res.status(403).json({
          detail: "Please verify your email first — tap \"Use OTP instead\" and enter the code we send to your inbox.",
          code: "EMAIL_NOT_VERIFIED",
        });
      }
      clearLoginFailures(limitKey);

      if (legacyMatch) {
        try {
          const upgraded = await bcrypt.hash(String(password), 10);
          if (supabase) await (privilegedSupabase || supabase).from('users').update({ password_hash: upgraded }).eq('user_id', user.user_id);
          const lu = (db.users || []).find((u: any) => u.user_id === user.user_id);
          if (lu) { lu.password_hash = upgraded; delete lu.password; }
          user.password_hash = upgraded;
        } catch (e: any) { logIgnored("auth_routes:rehash", e); }
      }

      // Smart Signup Auto-Merge: link lead profile, Instagram handle, rate card, and pending brand deals
      try {
        await autoMergeCreatorLead(user.user_id, user.email, user.phone, user.role);
      } catch (mErr) {
        console.warn("[Login] Auto-merge lead check error:", mErr);
      }

      const session_token = newSessionToken();
      const sessionData = {
        user_id: user.user_id,
        session_token,
        expires_at: new Date(Date.now() + SESSION_MS).toISOString(), // Session 58: 30 days, renewed while the app is used
        created_at: getIsoNow(),
      };
      
      if (supabase) {
        try {
          await (privilegedSupabase || supabase).from('user_sessions').insert(sessionData);
        } catch (e: any) {
          console.warn("[Session insert warning]:", e);
        }
      }

      // Save in local DB session store as well
      if (!db.user_sessions) db.user_sessions = [];
      db.user_sessions.push(sessionData);
      saveDb(db);

      res.cookie("session_token", session_token, sessionCookieOptions());
      res.cookie("has_session", "true", { ...sessionCookieOptions(), httpOnly: false });
      
      if (user.role === 'admin' || user.team_role === 'sub_admin') {
        await logAdminAuth(user.user_id, user.email, "login", req.headers['x-forwarded-for'] || req.connection?.remoteAddress, req.headers['user-agent']).catch(() => null);
      }
      const { password_hash, password: _plain, ...safeUser } = user;
      
      safeUser.profile_completed = safeUser.profile_completed || false;
      safeUser.bank_details_added = safeUser.bank_details_added || false;
      safeUser.bank_name = safeUser.bank_name || "";
      safeUser.bank_account = safeUser.bank_account || "";
      safeUser.bank_ifsc = safeUser.bank_ifsc || "";
      safeUser.kyc_verified = safeUser.kyc_verified || false;
      
      const currentPic = safeUser.picture || safeUser.photo || safeUser.avatar || "";
      safeUser.picture = currentPic;
      safeUser.photo = currentPic;
      safeUser.avatar = currentPic;
      
      if (safeUser.onboarding_completed || safeUser.onboarding_complete) {
        safeUser.onboarded = true;
      }
      if (safeUser.onboarded) {
        safeUser.onboarding_completed = true;
        safeUser.onboarding_complete = true;
      }
      
      if (safeUser.role === "creator") {
        let cp: any = null;
        if (supabase) {
          try {
            const { data } = await (privilegedSupabase || supabase).from('creator_profiles').select('*').eq('user_id', safeUser.user_id).maybeSingle();
            if (data) cp = data;
          } catch (e: any) { logIgnored("auth_routes:722", e); }
        }
        if (!cp && db.creator_profiles) {
          cp = db.creator_profiles.find((p: any) => p.user_id === safeUser.user_id);
        }
        if (cp) {
          safeUser.category = cp.category || "";
          // v357: "approved" only by the DB default (no admin review yet) → the creator sees "under review"
          safeUser.profile_status = awaitingReview(cp) ? "under_review" : (cp.profile_status || "approved");
          safeUser.review_eta_hours = cp.review_eta_hours || 20;
          safeUser.created_at = cp.created_at || safeUser.created_at;
          if (cp.verified) safeUser.kyc_verified = true;
          const isCreatorOnboarded = Boolean(user.onboarded || user.onboarding_completed || user.onboarding_complete || cp.onboarding_complete || cp.onboarding_completed);
          safeUser.onboarded = isCreatorOnboarded;
          safeUser.onboarding_completed = isCreatorOnboarded;
          safeUser.onboarding_complete = isCreatorOnboarded;
        } else {
          safeUser.profile_status = "approved";
          safeUser.onboarded = Boolean(user.onboarded || user.onboarding_completed || user.onboarding_complete);
          safeUser.onboarding_completed = safeUser.onboarded;
          safeUser.onboarding_complete = safeUser.onboarded;
        }
      } else if (safeUser.role === "brand") {
        let bp: any = null;
        if (supabase) {
          try {
            const { data } = await (privilegedSupabase || supabase).from('brand_profiles').select('*').eq('user_id', safeUser.user_id).maybeSingle();
            if (data) bp = data;
          } catch (e: any) { logIgnored("auth_routes:749", e); }
        }
        if (!bp && db.brand_profiles) {
          bp = db.brand_profiles.find((p: any) => p.user_id === safeUser.user_id);
        }
        if (bp) {
          safeUser.industry = bp.industry || "";
          safeUser.profile_status = bp.profile_status || "approved";
          safeUser.review_eta_hours = bp.review_eta_hours || 20;
          safeUser.created_at = bp.created_at || safeUser.created_at;
          if (bp.verified) safeUser.kyc_verified = true;
          const isBrandOnboarded = Boolean(user.onboarded || user.onboarding_completed || user.onboarding_complete || bp.onboarding_completed || bp.onboarding_complete);
          safeUser.onboarded = isBrandOnboarded;
          safeUser.onboarding_completed = isBrandOnboarded;
          safeUser.onboarding_complete = isBrandOnboarded;
        } else {
          safeUser.profile_status = "approved";
          safeUser.onboarded = Boolean(user.onboarded || user.onboarding_completed || user.onboarding_complete);
          safeUser.onboarding_completed = safeUser.onboarded;
          safeUser.onboarding_complete = safeUser.onboarded;
        }
      }

      if (safeUser.role === 'admin' || safeUser.role === 'sub_admin' || safeUser.team_role === 'sub_admin') {
        safeUser.onboarded = true;
        safeUser.onboarding_completed = true;
        safeUser.onboarding_complete = true;
        safeUser.email_verified = true;
        try {
          safeUser.permissions = await getPermissionsForUser(safeUser.user_id);
        } catch (e) {
          safeUser.permissions = ["all"];
        }
      }

      return res.json({ token: session_token, user: safeUser });
    } catch (err: any) {
      console.error("Login error details:", err?.stack || err?.message || err);
      return res.status(500).json({ detail: err?.message || "Internal server error during login" });
    }
  });

  // ── v376 (Ravi: "111 log signup page pe aaye, sirf 3 ne account banaya — signup easy karo") ────────────────────
  // Sign up / log in with an Indian mobile number + SMS code (no email, no password). Creators can add their
  // Instagram username in the same step. The account gets a never-mailed placeholder email
  // (phone-91XXXXXXXXXX@ybex.io — every mail sender skips @ybex.io) until they add a real one in Settings.
  // users.phone has no unique index, so the number is looked up first; an "unclaimed" waitlist profile with the
  // same number is claimed (the SMS code proves the number). Codes: backend/loginOtp.ts (ybex_ephemeral, hashed,
  // 10 min, 3 sends / 15 min per number, 5 wrong tries). Plus 10 sends per IP per 10 min.
  const phoneKey = (m10: string) => `phone:+91${m10}`;
  const phoneSendsByIp = new Map<string, number[]>();
  const phoneSendAllowed = (ip: string, now = Date.now()) => {
    const k = ip || "unknown";
    const recent = (phoneSendsByIp.get(k) || []).filter((t) => now - t < 10 * 60 * 1000);
    if (recent.length >= 10) { phoneSendsByIp.set(k, recent); return false; }
    recent.push(now); phoneSendsByIp.set(k, recent);
    if (phoneSendsByIp.size > 5000) phoneSendsByIp.delete(phoneSendsByIp.keys().next().value as string);
    return true;
  };
  const findUsersByPhone = async (m10: string): Promise<{ users: any[]; failed: boolean }> => {
    const variants = [`+91${m10}`, `91${m10}`, m10, `+91 ${m10}`];
    const client = privilegedSupabase || supabase;
    if (!client) {
      const db = getDb();
      return { users: (db.users || []).filter((u: any) => indianMobile(u.phone) === m10), failed: false };
    }
    try {
      const { data, error } = await client.from('users').select('*').in('phone', variants).limit(10);
      if (error) { console.error("[Auth phone] lookup failed:", error.message || error); return { users: [], failed: true }; }
      return { users: Array.isArray(data) ? data : [], failed: false };
    } catch (e: any) {
      console.error("[Auth phone] lookup exception:", e?.message || e);
      return { users: [], failed: true };
    }
  };
  // a real (claimed) account first, newest first; unclaimed waitlist rows only when nothing else has the number
  const pickPhoneUser = (rows: any[]) => {
    const live = rows.filter((u) => !u.is_deleted && u.auth_method !== 'deleted');
    const sorted = (list: any[]) => [...list].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    return sorted(live.filter((u) => u.auth_method !== 'unclaimed'))[0] || sorted(live.filter((u) => u.auth_method === 'unclaimed'))[0] || null;
  };
  const issueSession = async (req: any, res: any, userId: string) => {
    const dbClient = privilegedSupabase || supabase;
    const session_token = newSessionToken();
    const sessionData = { user_id: userId, session_token, expires_at: new Date(Date.now() + SESSION_MS).toISOString(), created_at: getIsoNow() };
    if (dbClient) {
      const { error } = await dbClient.from('user_sessions').insert(sessionData);
      if (error) console.warn("[Auth phone] session insert notice:", error.message || error);
    }
    const db = getDb();
    if (!db.user_sessions) db.user_sessions = [];
    db.user_sessions.push(sessionData);
    saveDb(db);
    res.cookie("session_token", session_token, sessionCookieOptions());
    res.cookie("has_session", "true", { ...sessionCookieOptions(), httpOnly: false });
    return session_token;
  };

  router.get("/auth/phone/config", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ enabled: Boolean(smsProvider(process.env)), channel: otpChannel(process.env) });
  });

  router.post("/auth/phone/send", async (req, res) => {
    const m10 = indianMobile(req.body?.phone);
    if (!m10) return res.status(400).json({ detail: "Please enter a valid 10-digit Indian mobile number.", code: "BAD_PHONE" });
    if (!smsProvider(process.env)) return res.status(503).json({ detail: "Mobile sign-in is not available right now. Please use Google or email.", code: "SMS_OFF" });
    if (!phoneSendAllowed(clientIp(req))) return res.status(429).json({ detail: "Too many codes asked. Please wait a few minutes.", code: "TOO_MANY_CODES" });
    try {
      const issued = await issueLoginOtp(phoneKey(m10));
      if (!issued.ok) return res.status(429).json({ detail: "Too many codes asked for this number. Please wait 15 minutes.", code: "TOO_MANY_CODES" });
      const sent = await sendSmsOtp(m10, issued.code);
      if (!sent.ok) {
        console.error("[Auth phone] SMS failed:", sent.error);
        return res.status(502).json({ detail: `We couldn't send the ${otpChannel(process.env) === "whatsapp" ? "WhatsApp code" : "SMS"}. Please try again, or use Google / email.`, code: "SMS_FAILED" });
      }
      return res.json({ success: true, otp: otpForBrowser(issued.code) });
    } catch (e: any) {
      console.error("[Auth phone send]", e?.message || e);
      return res.status(500).json({ detail: "We couldn't send the code. Please try again." });
    }
  });

  router.post("/auth/phone/verify", async (req, res) => {
    const m10 = indianMobile(req.body?.phone);
    const code = String(req.body?.otp || "").replace(/\D/g, "");
    const role = req.body?.role === "brand" ? "brand" : req.body?.role === "creator" ? "creator" : null;
    if (!m10 || code.length !== 6) return res.status(400).json({ detail: `Enter the 6-digit code we sent ${otpChannel(process.env) === "whatsapp" ? "on WhatsApp" : "by SMS"}.`, code: "BAD_INPUT" });
    const limitKey = `${clientIp(req)}|phone:${m10}`;
    const lockedMs = loginLockedFor(limitKey);
    if (lockedMs > 0) return res.status(429).json({ detail: `Too many attempts. Try again in ${Math.ceil(lockedMs / 60000)} minutes.`, code: "TOO_MANY_ATTEMPTS" });
    try {
      if (supabase && !privilegedSupabase) return res.status(503).json(LOGIN_NO_SERVICE_KEY);
      const chk = await checkLoginOtp(phoneKey(m10), code);
      if (chk !== "ok") {
        recordLoginFailure(limitKey);
        const msg = chk === "wrong" ? `That code is not right. Please check the ${otpChannel(process.env) === "whatsapp" ? "WhatsApp message" : "SMS"} and try again.` : LOGIN_OTP_MESSAGES[chk];
        return res.status(401).json({ detail: msg, code: chk === "wrong" ? "INVALID_OTP" : "OTP_EXPIRED" });
      }
      clearLoginFailures(limitKey);
      const dbClient = privilegedSupabase || supabase;
      const found = await findUsersByPhone(m10);
      if (found.failed) return res.status(503).json(LOGIN_LOOKUP_FAILED);
      let user: any = pickPhoneUser(found.users);
      let isNew = false;

      if (user && user.auth_method !== 'unclaimed') {
        // Existing account → log in (same account checks as POST /auth/login)
        if (user.role === 'admin' || user.role === 'sub_admin') return res.status(403).json({ detail: "This number belongs to a Ybex admin account. It can't be used as a Brand or Creator.", code: "ADMIN_ACCOUNT" });
        if (user.banned) return res.status(401).json({ detail: "Your account has been banned. Please contact support.", code: "ACCOUNT_BANNED", user_id: user.user_id, role: user.role });
        const susp = suspendedUntilText(user);
        if (user.suspended || user.is_suspended || susp) return res.status(401).json({ detail: susp ? `Suspended until ${susp}. Contact support.` : "We've suspended your account to protect our community. Please contact support.", code: "ACCOUNT_SUSPENDED", user_id: user.user_id, role: user.role });
        if (role && user.role && user.role !== role) {
          return res.status(409).json({ detail: `This number is already a ${user.role === 'brand' ? 'Brand' : 'Creator'} account. Continue as a ${user.role === 'brand' ? 'Brand' : 'Creator'}, or use another number.`, code: "ROLE_MISMATCH", role: user.role });
        }
      } else {
        if (!role) return res.status(400).json({ detail: "Choose Creator or Brand first.", code: "NO_ROLE" });
        const ig = brandIgHandle(req.body?.instagram);
        const name = String(req.body?.name || "").trim().slice(0, 80) || (ig ? `@${ig}` : (role === 'brand' ? "Brand" : "Creator"));
        if (user && user.auth_method === 'unclaimed') {
          // waitlist profile with this number → it becomes theirs (keeps its email, profile, numbers)
          const upd: any = { auth_method: "phone", verified: true, role: user.role === 'creator' || user.role === 'brand' ? user.role : role, phone: `+91${m10}` };
          if (dbClient) {
            const { error } = await dbClient.from('users').update(upd).eq('user_id', user.user_id);
            if (error) return res.status(500).json({ detail: `Could not open your account (database: ${error.message || error.code}).`, code: "CLAIM_FAILED" });
          }
          user = { ...user, ...upd };
          if (user.role !== role) return res.status(409).json({ detail: `This number is already a ${user.role === 'brand' ? 'Brand' : 'Creator'} account. Continue as a ${user.role === 'brand' ? 'Brand' : 'Creator'}.`, code: "ROLE_MISMATCH", role: user.role });
        } else {
          // v402: a new creator under the follower minimum → no account
          if (role === "creator") { const block = await signupFollowerBlock(dbClient, { instagram: ig }); if (block) return res.status(block.status).json({ ...block.body, field: "instagram" }); }
          const newUser: any = {
            user_id: crypto.randomUUID(),
            email: `phone-91${m10}@ybex.io`,
            name,
            password_hash: null,
            role,
            phone: `+91${m10}`,
            picture: "",
            auth_method: "phone",
            created_at: getIsoNow(),
            onboarded: false,
            verified: true,
          };
          if (dbClient) {
            const { error } = await dbClient.from('users').insert(newUser);
            if (error) {
              console.error("[Auth phone] users insert failed:", error.code, error.message);
              if (error.code === '23505') return res.status(409).json({ detail: "An account with this number already exists. Please try logging in again.", code: "ALREADY_EXISTS" });
              return res.status(error.code === '42501' ? 503 : 500).json({ detail: error.code === '42501' ? SIGNUP_NO_SERVICE_KEY.detail : `Could not create the account (database: ${error.message || error.code}).`, code: "SIGNUP_INSERT_FAILED" });
            }
          }
          const db = getDb();
          if (!db.users) db.users = [];
          db.users.push(newUser);
          saveDb(db);
          user = newUser;
          isNew = true;
          try {
            await recordConsents({ getClient: () => privilegedSupabase || null, getDb, saveDb }, user.user_id, [
              { kind: "terms", granted: true, source: "signup" },
              { kind: "privacy", granted: true, source: "signup" },
            ], { ip: clientIp(req), ua: String(req.headers?.["user-agent"] || "") });
          } catch (consentErr) { console.warn("[Auth phone] consent record failed:", consentErr); }
          broadcastAdminNotification({
            type: 'user_registered',
            message: `New User Joined: ${name} (+91${m10}) - ${role}`,
            title: 'New User Signup',
            actor_id: user.user_id,
            metadata: { userId: user.user_id, name, phone: `+91${m10}`, role, instagram: ig || undefined, method: "phone" },
          }).catch((e: any) => console.warn("[Auth phone] admin notice failed:", e?.message || e));
        }
        try { await autoMergeCreatorLead(user.user_id, user.email, `+91${m10}`, user.role); } catch (mergeErr) { console.warn("[Auth phone] lead merge notice:", mergeErr); }
      }

      const token = await issueSession(req, res, user.user_id);
      let fullUser: any = user;
      if (dbClient) {
        try { const { data } = await dbClient.from('users').select('*').eq('user_id', user.user_id).maybeSingle(); if (data) fullUser = data; } catch (e) { logIgnored("auth_routes:phoneFull", e); }
      }
      const { password_hash, ...safeUser } = fullUser || {};
      return res.json({ success: true, token, user: { ...safeUser, has_password: Boolean(password_hash) }, is_new: isNew });
    } catch (e: any) {
      console.error("[Auth phone verify]", e?.message || e);
      return res.status(500).json({ detail: "Internal server error" });
    }
  });

  // ── v376 (Ravi: "Join Now pe sirf ek screen … sirf Diwali offer se aaye logon ke liye") ─────────────────────────
  // Ravi (v376, final): "account bina email verify ke mat banao". Creators join on ONE screen in three steps that open
  // under each other: email → 6-digit code (POST /auth/join/send-code, /auth/join/verify-code — the code proves the
  // inbox and gives a 30-minute signed "proof") → Instagram username + WhatsApp → POST /auth/quick-join (needs the
  // proof) makes the account, verified, and logs in. No password. An email that already has an account never joins:
  // the app opens the normal login (password / email code). A waitlist ("unclaimed") row with that email is claimed.
  // Google sign-ups give Instagram + WhatsApp with POST /auth/quick-profile (required screen after Google).
  const quickByIp = new Map<string, number[]>();
  const quickAllowed = (ip: string, now = Date.now()) => {
    const k = ip || "unknown";
    const recent = (quickByIp.get(k) || []).filter((t) => now - t < 60 * 60 * 1000);
    if (recent.length >= 8) { quickByIp.set(k, recent); return false; }
    recent.push(now); quickByIp.set(k, recent);
    if (quickByIp.size > 5000) quickByIp.delete(quickByIp.keys().next().value as string);
    return true;
  };
  const publicSite = () => publicSiteUrl(); // v388: one shared helper (backend/siteUrl.ts)
  /** Makes (or fills) the creator's profile row with the Instagram username — the app then fetches the numbers. */
  const ensureCreatorRow = async (u: any, ig: string) => {
    const client = privilegedSupabase || supabase;
    if (!client || !ig) return;
    try {
      const { data: row } = await client.from('creator_profiles').select('user_id, instagram, instagram_handle').eq('user_id', u.user_id).maybeSingle();
      if (row) {
        if (!row.instagram && !row.instagram_handle) await client.from('creator_profiles').update({ instagram: ig, instagram_handle: ig, updated_at: getIsoNow() }).eq('user_id', u.user_id);
      } else {
        const { error } = await client.from('creator_profiles').insert({ user_id: u.user_id, name: u.name || `@${ig}`, email: u.email, instagram: ig, instagram_handle: ig, created_at: getIsoNow(), updated_at: getIsoNow() });
        if (error) console.warn("[quick-join] profile row notice:", error.message || error);
      }
      kickInstagramRefresh(u.user_id); // v410: fetch the numbers a few seconds after sign-up
    } catch (e: any) { console.warn("[quick-join] profile row failed:", e?.message || e); }
  };
  const JOIN_PROOF_MS = 30 * 60 * 1000;
  const joinKey = (email: string) => `join:${email}`;
  const joinProof = (email: string, exp: number) => { const sig = signEmailLink("join_proof", `${email}|${exp}`); return sig ? `${exp}.${sig}` : null; };
  const joinProofOk = (email: string, proof: any) => {
    const [expS, sig] = String(proof || "").split(".");
    const exp = Number(expS);
    if (!exp || exp < Date.now() || exp > Date.now() + JOIN_PROOF_MS + 60000 || !sig) return false;
    return verifyEmailLink("join_proof", `${email}|${exp}`, sig);
  };
  const existingAnswer = (existing: any) => ({
    detail: "You already have a Ybex account with this email. Log in instead.",
    code: "ACCOUNT_EXISTS", role: existing.role === 'creator' || existing.role === 'brand' ? existing.role : null, has_password: !!existing.password_hash,
  });

  // Step 1: email → code (no account is made yet)
  router.post("/auth/join/send-code", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /@ybex\.io$|\.demo$/i.test(email)) return res.status(400).json({ detail: "Please enter a valid email address.", code: "BAD_EMAIL", field: "email" });
    if (!emailCheckAllowed(clientIp(req))) return res.status(429).json({ detail: "Too many tries. Please wait a few minutes.", code: "TOO_MANY_ATTEMPTS" });
    try {
      if (supabase && !privilegedSupabase) return res.status(503).json(SIGNUP_NO_SERVICE_KEY);
      const found = await findUserByEmail(privilegedSupabase || supabase, email);
      if (found.failed) return res.status(503).json({ detail: "We could not check this email right now. Please try again in a minute.", code: "SIGNUP_LOOKUP_FAILED" });
      const ex: any = found.user;
      if (ex && (ex.role === 'admin' || ex.role === 'sub_admin')) return res.status(403).json({ detail: "This email belongs to a Ybex admin account. It can't be used as a Creator.", code: "ADMIN_ACCOUNT" });
      if (ex && ex.auth_method !== 'unclaimed') return res.status(409).json(existingAnswer(ex));
      const issued = await issueLoginOtp(joinKey(email));
      if (!issued.ok) return res.status(429).json({ detail: "Too many codes asked. Please wait 15 minutes.", code: "TOO_MANY_CODES" });
      if (resolveOtpEcho(process.env)) console.log(`[Join] code for ${email} is ${issued.code}`);
      if (process.env.RESEND_API_KEY) {
        try {
          const sent = await new Resend(process.env.RESEND_API_KEY).emails.send({
            from: process.env.RESEND_FROM_EMAIL || "Ybex <noreply@ybexmedia.in>",
            to: email,
            subject: `${issued.code} is your Ybex code`,
            html: buildEmailHtml({ greeting: "Hi there,", paragraphs: [
              "Use this code to confirm your email and join Ybex:",
              "<h1 style=\"font-size: 32px; letter-spacing: 4px; color: #4f46e5; background: #f3f4f6; padding: 12px 20px; display: inline-block; border-radius: 8px; margin: 0;\">" + issued.code + "</h1>",
              "It works for 10 minutes. If you didn't try to join Ybex, you can ignore this email.",
            ] }),
          });
          if (sent?.error && !process.env.RESEND_ALLOW_FALLBACK && !resolveTestMode(process.env)) {
            console.error("[Join] Resend error:", JSON.stringify(sent.error));
            return res.status(500).json({ detail: "We couldn't send the code. Please check the email and try again.", code: "OTP_SEND_FAILED" });
          }
        } catch (mailErr: any) {
          console.error("[Join] send failed:", mailErr?.message || mailErr);
          if (!process.env.RESEND_ALLOW_FALLBACK && !resolveTestMode(process.env)) return res.status(500).json({ detail: "We couldn't send the code. Please try again.", code: "OTP_SEND_FAILED" });
        }
      }
      return res.json({ success: true, otp: otpForBrowser(issued.code) });
    } catch (e: any) {
      console.error("[Join send-code]", e?.message || e);
      return res.status(500).json({ detail: "Internal server error" });
    }
  });

  // Step 2: code → 30-minute proof that this person owns the inbox
  router.post("/auth/join/verify-code", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const code = String(req.body?.otp || "").replace(/\D/g, "");
    if (!email || code.length !== 6) return res.status(400).json({ detail: "Enter the 6-digit code from your email.", code: "BAD_INPUT" });
    const limitKey = `${clientIp(req)}|join:${email}`;
    const lockedMs = loginLockedFor(limitKey);
    if (lockedMs > 0) return res.status(429).json({ detail: `Too many attempts. Try again in ${Math.ceil(lockedMs / 60000)} minutes.`, code: "TOO_MANY_ATTEMPTS" });
    const chk = await checkLoginOtp(joinKey(email), code);
    if (chk !== "ok") {
      recordLoginFailure(limitKey);
      return res.status(401).json({ detail: LOGIN_OTP_MESSAGES[chk], code: chk === "wrong" ? "INVALID_OTP" : "OTP_EXPIRED" });
    }
    clearLoginFailures(limitKey);
    const proof = joinProof(email, Date.now() + JOIN_PROOF_MS);
    if (!proof) return res.status(503).json({ detail: "Sign-up is not set up on the server (EMAIL_LINK_SECRET).", code: "NO_SECRET" });
    return res.json({ success: true, proof });
  });

  router.post("/auth/quick-join", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const ig = brandIgHandle(req.body?.instagram);
    const m10 = indianMobile(req.body?.whatsapp ?? req.body?.phone);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ detail: "Please enter a valid email address.", code: "BAD_EMAIL", field: "email" });
    if (!ig) return res.status(400).json({ detail: "Enter your Instagram username (letters, numbers, . and _).", code: "BAD_INSTAGRAM", field: "instagram" });
    if (!m10) return res.status(400).json({ detail: "Enter your 10-digit WhatsApp number.", code: "BAD_PHONE", field: "whatsapp" });
    if (/@ybex\.io$|\.demo$/i.test(email)) return res.status(400).json({ detail: "Please use your own email address.", code: "BAD_EMAIL", field: "email" });
    if (!joinProofOk(email, req.body?.proof)) return res.status(401).json({ detail: "Please verify your email first — we'll send you a 6-digit code.", code: "EMAIL_NOT_VERIFIED", field: "email" });
    if (!quickAllowed(clientIp(req))) return res.status(429).json({ detail: "Too many sign-ups from this network. Please try again later.", code: "TOO_MANY_ATTEMPTS" });
    try {
      if (supabase && !privilegedSupabase) return res.status(503).json(SIGNUP_NO_SERVICE_KEY);
      const dbClient = privilegedSupabase || supabase;
      const found = await findUserByEmail(dbClient, email);
      if (found.failed) return res.status(503).json({ detail: "We could not check this email right now. Please try again in a minute.", code: "SIGNUP_LOOKUP_FAILED" });
      const existing: any = found.user;
      if (existing) {
        if (existing.role === 'admin' || existing.role === 'sub_admin') return res.status(403).json({ detail: "This email belongs to a Ybex admin account. It can't be used as a Creator.", code: "ADMIN_ACCOUNT" });
        if (existing.auth_method !== 'unclaimed') return res.status(409).json(existingAnswer(existing));
      }
      if (existing) {
        // waitlist profile with this email → it becomes theirs (the code proved the inbox)
        const upd: any = { auth_method: "email", verified: true, role: existing.role === 'brand' ? 'brand' : 'creator', phone: String(existing.phone || "").replace(/\D/g, "") ? existing.phone : `+91${m10}`, password_hash: null };
        if (dbClient) {
          const { error } = await dbClient.from('users').update(upd).eq('user_id', existing.user_id);
          if (error) return res.status(500).json({ detail: `Could not open your account (database: ${error.message || error.code}).`, code: "CLAIM_FAILED" });
        }
        const claimed = { ...existing, ...upd };
        const db0 = getDb();
        const lu0 = (db0.users || []).find((x: any) => x.user_id === existing.user_id);
        if (lu0) { Object.assign(lu0, upd); saveDb(db0); }
        await ensureCreatorRow(claimed, ig);
        try { await autoMergeCreatorLead(claimed.user_id, email, claimed.phone, claimed.role); } catch (mergeErr) { console.warn("[quick-join] lead merge notice:", mergeErr); }
        const token0 = await issueSession(req, res, claimed.user_id);
        const { password_hash: _ph, ...safe0 } = claimed;
        return res.json({ success: true, token: token0, user: safe0, is_new: true, claimed: true });
      }
      // v402: under the follower minimum → no account (the Join screen already checked; this stops old apps / direct calls)
      { const block = await signupFollowerBlock(dbClient, { instagram: ig, email }); if (block) return res.status(block.status).json({ ...block.body, field: "instagram" }); }
      const newUser: any = {
        user_id: crypto.randomUUID(), email, name: `@${ig}`, password_hash: null, role: "creator",
        phone: `+91${m10}`, picture: "", auth_method: "email", created_at: getIsoNow(), onboarded: false, verified: true,
      };
      if (dbClient) {
        const { error } = await dbClient.from('users').insert(newUser);
        if (error) {
          console.error("[quick-join] users insert failed:", error.code, error.message);
          if (error.code === '23505') return res.status(409).json({ detail: "You already have a Ybex account with this email. We'll email you a code to log in.", code: "ACCOUNT_EXISTS" });
          return res.status(error.code === '42501' ? 503 : 500).json({ detail: error.code === '42501' ? SIGNUP_NO_SERVICE_KEY.detail : `Could not create the account (database: ${error.message || error.code}).`, code: "SIGNUP_INSERT_FAILED" });
        }
      }
      const db = getDb();
      if (!db.users) db.users = [];
      db.users.push(newUser);
      saveDb(db);
      try {
        await recordConsents({ getClient: () => privilegedSupabase || null, getDb, saveDb }, newUser.user_id, [
          { kind: "terms", granted: true, source: "signup" },
          { kind: "privacy", granted: true, source: "signup" },
        ], { ip: clientIp(req), ua: String(req.headers?.["user-agent"] || "") });
      } catch (consentErr) { console.warn("[quick-join] consent record failed:", consentErr); }
      try { await autoMergeCreatorLead(newUser.user_id, email, `+91${m10}`, "creator"); } catch (mergeErr) { console.warn("[quick-join] lead merge notice:", mergeErr); }
      await ensureCreatorRow(newUser, ig);
      broadcastAdminNotification({
        type: 'user_registered', title: 'New User Signup', actor_id: newUser.user_id,
        message: `New User Joined: @${ig} (${email}) - creator · Diwali offer`,
        metadata: { userId: newUser.user_id, name: newUser.name, email, phone: `+91${m10}`, role: "creator", instagram: ig, method: "quick_join" },
      }).catch((e: any) => console.warn("[quick-join] admin notice failed:", e?.message || e));
      const token = await issueSession(req, res, newUser.user_id);
      const { password_hash, ...safeUser } = newUser;
      return res.json({ success: true, token, user: safeUser, is_new: true });
    } catch (e: any) {
      console.error("[quick-join]", e?.message || e);
      return res.status(500).json({ detail: "Internal server error" });
    }
  });

  // Google / Apple sign-up from the offer page: the one extra screen (Instagram + WhatsApp).
  router.post("/auth/quick-profile", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ detail: "Not authenticated" });
    if (user.role !== 'creator') return res.status(403).json({ detail: "Creators only" });
    const ig = brandIgHandle(req.body?.instagram);
    const m10 = indianMobile(req.body?.whatsapp ?? req.body?.phone);
    if (!ig) return res.status(400).json({ detail: "Enter your Instagram username (letters, numbers, . and _).", code: "BAD_INSTAGRAM", field: "instagram" });
    if (!m10) return res.status(400).json({ detail: "Enter your 10-digit WhatsApp number.", code: "BAD_PHONE", field: "whatsapp" });
    const client = privilegedSupabase || supabase;
    // v402: a new Google / Apple creator under the follower minimum stops here (the screen shows the work-link page)
    { const block = await signupFollowerBlock(client, { instagram: ig, email: user.email }); if (block) return res.status(block.status).json({ ...block.body, field: "instagram" }); }
    try {
      const patch: any = {};
      if (!String(user.phone || "").replace(/\D/g, "")) patch.phone = `+91${m10}`;
      if (!user.name || /^[^@\s]+@[^@\s]+$/.test(String(user.name))) patch.name = `@${ig}`;
      if (client && Object.keys(patch).length) {
        const { error } = await client.from('users').update(patch).eq('user_id', user.user_id);
        if (error) console.warn("[quick-profile] users update notice:", error.message || error);
      }
      const db = getDb();
      const lu = (db.users || []).find((x: any) => x.user_id === user.user_id);
      if (lu) { Object.assign(lu, patch); saveDb(db); }
      await ensureCreatorRow({ ...user, ...patch }, ig);
      return res.json({ success: true, phone: patch.phone || user.phone || null, instagram: ig });
    } catch (e: any) {
      console.error("[quick-profile]", e?.message || e);
      return res.status(500).json({ detail: "Couldn't save. Please try again." });
    }
  });

  // ── Session 42: the app's single email box ──────────────────────────────────────────────
  // "Does this email have an account, and how does it sign in?" Only what the screen needs:
  // whether a verified account exists, its role, and whether it has a password / Google.
  router.post("/auth/check-email", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ detail: "Please enter a valid email address.", code: "BAD_EMAIL" });
    }
    const ip = clientIp(req); // Session 58
    if (!emailCheckAllowed(ip)) {
      return res.status(429).json({ detail: "Too many tries. Please wait a few minutes.", code: "TOO_MANY_ATTEMPTS" });
    }
    try {
      if (supabase && !privilegedSupabase) return res.status(503).json(LOGIN_NO_SERVICE_KEY);
      const found = await findUserByEmail(privilegedSupabase || supabase, email);
      if (found.failed) return res.status(503).json(LOGIN_LOOKUP_FAILED);
      const user: any = found.user;
      // Session 43 (Ravi: an existing account showed "Create your new account"): an account whose
      // email was never verified is still an account — the website logs it in, so the app must too.
      // Logging in with the email code verifies it. Only "unclaimed" placeholders count as new.
      if (!user || user.auth_method === 'unclaimed') {
        return res.json({ exists: false });
      }
      const staff = user.role === 'admin' || user.role === 'sub_admin';
      return res.json({
        exists: true,
        // Session 43: an admin email entered on the Creator / Brand card is told so (no silent admin login).
        role: user.role === 'creator' || user.role === 'brand' ? user.role : staff ? 'admin' : null,
        has_password: !!user.password_hash,
        google: user.auth_method === 'google',
      });
    } catch (err: any) {
      console.error("[Auth check-email]", err?.message || err);
      return res.status(500).json({ detail: "We could not check this email right now. Please try again." });
    }
  });

  // Mails a 6-digit login code. The code is used in POST /auth/login as { email, otp }.
  router.post("/auth/login-otp", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ detail: "Email is required" });
    if (!otpIpAllowed(clientIp(req))) return res.status(429).json({ detail: "Too many codes asked. Please wait a few minutes and try again.", code: "TOO_MANY_CODES" }); // v388
    try {
      if (supabase && !privilegedSupabase) return res.status(503).json(LOGIN_NO_SERVICE_KEY);
      const found = await findUserByEmail(privilegedSupabase || supabase, email);
      if (found.failed) return res.status(503).json(LOGIN_LOOKUP_FAILED);
      const user: any = found.user;
      // Session 43: unverified accounts can get a code too — typing it proves the email (see /auth/login).
      if (!user || user.auth_method === 'unclaimed') {
        return res.status(404).json({ detail: "No account found with this email.", code: "USER_NOT_FOUND" });
      }
      // Session 43: the app's Creator / Brand screens never log into an admin account.
      if (isAppRole(req.body?.app_role) && (user.role === 'admin' || user.role === 'sub_admin')) {
        return res.status(403).json({ detail: "This email belongs to a Ybex admin account. It can't be used as a Brand or Creator.", code: "ADMIN_ACCOUNT" });
      }
      const issued = await issueLoginOtp(email);
      if (!issued.ok) {
        return res.status(429).json({ detail: "Too many codes asked. Please wait 15 minutes, or use your password.", code: "TOO_MANY_CODES" });
      }
      const otp = issued.code;
      if (resolveOtpEcho(process.env)) console.log(`[Login OTP] code for ${email} is ${otp}`); // never in production logs
      if (process.env.RESEND_API_KEY) {
        try {
          const resendClient = new Resend(process.env.RESEND_API_KEY);
          const fromEmail = process.env.RESEND_FROM_EMAIL || "Ybex <noreply@ybexmedia.in>";
          const sent = await resendClient.emails.send({
            from: fromEmail,
            to: email,
            subject: `${otp} is your Ybex login code`,
            html: buildEmailHtml({
              greeting: "Hi there,",
              paragraphs: [
                "Use this code to log in to Ybex:",
                "<h1 style=\"font-size: 32px; letter-spacing: 4px; color: #4f46e5; background: #f3f4f6; padding: 12px 20px; display: inline-block; border-radius: 8px; margin: 0;\">" + otp + "</h1>",
                "It works for 10 minutes. If you did not try to log in, you can ignore this email.",
              ],
            }),
          });
          if (sent.error && !process.env.RESEND_ALLOW_FALLBACK && !resolveTestMode(process.env)) {
            console.error("[Login OTP] Resend error:", JSON.stringify(sent.error));
            return res.status(500).json({ detail: "We could not send the code. Please try again or use your password.", code: "OTP_SEND_FAILED" });
          }
        } catch (mailErr: any) {
          console.error("[Login OTP] send failed:", mailErr?.message || mailErr);
          if (!process.env.RESEND_ALLOW_FALLBACK && !resolveTestMode(process.env)) {
            return res.status(500).json({ detail: "We could not send the code. Please try again or use your password.", code: "OTP_SEND_FAILED" });
          }
        }
      } else {
        console.warn("[Login OTP] RESEND_API_KEY not set — code only in test-mode log.");
      }
      return res.json({ success: true, otp: otpForBrowser(otp) });
    } catch (err: any) {
      console.error("[Auth login-otp]", err?.message || err);
      return res.status(500).json({ detail: "Internal server error" });
    }
  });

  router.post("/auth/verify-email", async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ detail: "Email and OTP are required" });
    }
    
    try {
      if (supabase && !privilegedSupabase) return res.status(503).json(SIGNUP_NO_SERVICE_KEY);
      const dbClient = privilegedSupabase || supabase;
      const found = await findUserByEmail(dbClient, email);
      if (found.failed) return res.status(503).json({ detail: "We could not check this email right now. Please try again in a minute.", code: "VERIFY_LOOKUP_FAILED" });
      const user: any = found.user;

      if (!user) {
        return res.status(404).json({ detail: "No account found for this email. Please sign up again.", code: "USER_NOT_FOUND" });
      }

      // Session 57 (security): an already-verified account used to get a LOGIN SESSION here without any
      // code being checked — sending anyone's email with any 6 digits opened their account. Verifying
      // again never logs in; the user signs in normally (password / login code / Google).
      if (user.verified) {
        return res.status(409).json({ detail: "This email is already verified. Please log in.", code: "ALREADY_VERIFIED" });
      }

      let tokens: any[] = [];
      try {
        const { data: sbTokens, error: tokErr } = await dbClient
          .from('password_reset_tokens')
          .select('*')
          .eq('user_id', user.user_id)
          .eq('purpose', 'signup_verification')
          .eq('used', false)
          .order('created_at', { ascending: false })
          .limit(5);
        if (!tokErr && Array.isArray(sbTokens) && sbTokens.length > 0) {
          tokens = sbTokens;
        }
      } catch (e: any) { logIgnored("auth_routes:840", e); }

      if (tokens.length === 0) {
        tokens = getTokensFallback(user.user_id, 'signup_verification');
      }

      if (!tokens || tokens.length === 0) {
        return res.status(400).json({ detail: "No valid code found. Please click 'Resend' to get a new code." });
      }

      const token = tokens[0];

      if (new Date(token.expires_at).getTime() < Date.now()) {
        return res.status(400).json({ detail: "Verification code has expired. Please click 'Resend'." });
      }

      if (token.attempt_count >= 5) {
        try { await dbClient.from('password_reset_tokens').update({ used: true }).eq('id', token.id); } catch (e) { logIgnored("auth_routes:859", e); }
        updateTokenFallback(token.id, { used: true });
        return res.status(400).json({ detail: "Too many failed attempts. Please request a new code." });
      }

      const isMatch = await bcrypt.compare(String(otp).trim(), token.otp_hash || "").catch(() => false);

      if (!isMatch) {
        const newCount = (token.attempt_count || 0) + 1;
        try { await dbClient.from('password_reset_tokens').update({ attempt_count: newCount }).eq('id', token.id); } catch (e) { logIgnored("auth_routes:869", e); }
        updateTokenFallback(token.id, { attempt_count: newCount });
        return res.status(400).json({ detail: "Invalid 6-digit code. Please check and try again." });
      }

      try { await dbClient.from('password_reset_tokens').update({ used: true }).eq('id', token.id); } catch (e) { logIgnored("auth_routes:874", e); }
      updateTokenFallback(token.id, { used: true });

      try { await dbClient.from('users').update({ verified: true }).eq('user_id', user.user_id); } catch (e) { logIgnored("auth_routes:877", e); }
      const db = getDb();
      if (db.users) {
        const u = db.users.find((x: any) => x.user_id === user.user_id || (x.email && x.email.toLowerCase() === (user.email || '').toLowerCase()));
        if (u) {
          u.verified = true;
          saveDb(db);
        }
      }

      // Smart Signup Auto-Merge: link lead profile, Instagram handle, rate card, and pending brand deals
      try {
        await autoMergeCreatorLead(user.user_id, user.email, user.phone, user.role);
      } catch (mergeErr) {
        console.warn("[VerifyEmail] Auto-merge lead check error:", mergeErr);
      }

      // Now issue the session
      let fullUser: any = null;
      try {
        const { data: sbFull } = await dbClient.from('users').select('*').eq('user_id', user.user_id).maybeSingle();
        fullUser = sbFull;
      } catch (e) {
        console.warn("[VerifyEmail] Supabase fullUser lookup notice:", e);
      }
      if (!fullUser) {
        const db = getDb();
        if (db.users) {
          fullUser = db.users.find((u: any) => u.user_id === user.user_id || (u.email && u.email.toLowerCase() === email.trim().toLowerCase()));
        }
      }
      if (!fullUser) fullUser = { ...user };
            try {
        const role = fullUser.role || 'creator';
        
        let paragraphs = [];
        
        if (role.toLowerCase() === 'brand') {
          paragraphs.push(`I built Ybex with one simple thought: to make influencer marketing simpler, more transparent, and genuinely valuable for brands.`);
          paragraphs.push(`My promise to you is simple: access to the right creators, transparent collaborations, and a platform that helps you build campaigns without unnecessary middlemen or complications.`);
          paragraphs.push(`If you ever have an issue, an idea, or simply want to share something with me, just reply to this email. I personally read every message.`);
          paragraphs.push(`Ybex is just getting started, and I'm really glad to have you here.`);
        } else if (role.toLowerCase() === 'agency') {
          paragraphs.push(`I started Ybex with one simple thought: to make influencer marketing easier for agencies and more valuable for their clients.`);
          paragraphs.push(`Whether you're managing multiple campaigns, looking for the right creators, or simply trying to get things done without the usual back-and-forth, Ybex is built to make that process smoother.`);
          paragraphs.push(`And if you ever have an idea, an issue, or simply want to share something with me, just reply to this email. I personally read every message.`);
          paragraphs.push(`Ybex is just getting started, and I'm genuinely glad to have you with us.`);
        } else {
          // Creator
          paragraphs.push(`I built Ybex with one simple thought: to create a space where your work is valued, your opportunities are genuine, and you always feel secure while working with brands.`);
          paragraphs.push(`My promise to you is simple: direct access to premium brands, zero middlemen eating into your hard-earned money, and a platform that truly respects your creative journey.`);
          paragraphs.push(`And if you ever have an issue, an idea, or simply want to share something with me, just reply to this email. I personally read these messages and will always try my best to get back to you.`);
          paragraphs.push(`Ybex is just getting started, and I'm really glad you're a part of it.`);
        }

        const signatureHtml = `
          <div style="margin-top: 32px; padding-top: 0;">
            <div style="display: flex; align-items: center;">
              <img src="${publicSiteUrl()}/img/footer/founder-ravi-email.jpg" alt="Ravi" width="50" height="50" style="width: 50px; height: 50px; border-radius: 50%; margin-right: 14px; object-fit: cover;" />
              <div>
                <p style="margin: 0; font-size: 15px; font-weight: 600; color: #111827;">Ravi</p>
                <p style="margin: 0; margin-top: 2px; font-size: 14px; color: #6b7280;">Founder, Ybex</p>
              </div>
            </div>
          </div>
        `;
        const welcomeHtml = buildLegacyEmailHtml({ // v373: the personal note keeps its old look (Ravi)
          greeting: `Hey,`,
          paragraphs,
          signatureHtml,
          button: null
        });

        const subject = `Wanted to personally reach out`;
        const resendWelcome = new Resend(process.env.RESEND_API_KEY);
        await resendWelcome.emails.send({ priority: "low", // v399 email budget: waits for the night window
          from: getValidFromEmail(),
          to: fullUser.email,
          subject: subject,
          html: welcomeHtml
        });
        console.log(`[Welcome Email] Sent to ${fullUser.email}`);
      } catch (err) {
        console.error("Failed to send welcome email:", err);
      }

      const session_token = newSessionToken();
      const sessionData = {
        user_id: user.user_id,
        session_token,
        expires_at: new Date(Date.now() + SESSION_MS).toISOString(), // Session 58: 30 days, renewed while the app is used
        created_at: getIsoNow(),
      };
      try {
        await dbClient.from('user_sessions').insert(sessionData);
      } catch (sessErr) {
        console.warn("[VerifyEmail] Supabase session insert notice:", sessErr);
      }

      const dbAfter = getDb();
      if (!dbAfter.user_sessions) dbAfter.user_sessions = [];
      dbAfter.user_sessions.push(sessionData);
      saveDb(dbAfter);

      res.cookie("session_token", session_token, sessionCookieOptions());
      res.cookie("has_session", "true", { ...sessionCookieOptions(), httpOnly: false });

      const { password_hash, ...safeUser } = fullUser || {};
      (safeUser as any).verified = true;
      return res.json({ success: true, token: session_token, user: safeUser });
    } catch (err) {
      console.error("Verify email error:", err);
      return res.status(500).json({ detail: "Internal server error" });
    }
  });

  router.post("/auth/resend-verification-otp", async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ detail: "Email is required" });
    }

    try {
      if (supabase && !privilegedSupabase) return res.status(503).json(SIGNUP_NO_SERVICE_KEY);
      const dbClient = privilegedSupabase || supabase;
      const found = await findUserByEmail(dbClient, email);
      if (found.failed) return res.status(503).json({ detail: "We could not check this email right now. Please try again in a minute.", code: "RESEND_LOOKUP_FAILED" });
      const user: any = found.user;

      if (!user) {
        return res.json({ success: true, message: "If this email is registered, we've sent a code." });
      }

      if (user.verified) {
        return res.status(400).json({ detail: "Email is already verified" });
      }

      // Check rate limit: max 3 requests in the last 15 minutes
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data: recentTokens } = await dbClient
        .from('password_reset_tokens')
        .select('id')
        .eq('user_id', user.user_id)
        .eq('purpose', 'signup_verification')
        .gte('created_at', fifteenMinsAgo);

      if (recentTokens && recentTokens.length >= 3) {
        return res.status(429).json({ detail: "Too many requests. Please try again later." });
      }

      try {
        await dbClient
          .from('password_reset_tokens')
          .update({ used: true })
          .eq('user_id', user.user_id)
          .eq('purpose', 'signup_verification')
          .eq('used', false);
      } catch (e: any) { logIgnored("auth_routes:1011", e); }

      const otp = crypto.randomInt(100000, 1000000).toString();
      const salt = await bcrypt.genSalt(10);
      const otpHash = await bcrypt.hash(otp, salt);
      const expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const tokenRecord: any = {
        id: crypto.randomUUID(),
        user_id: user.user_id,
        otp_hash: otpHash,
        purpose: 'signup_verification',
        expires_at: expires_at,
        used: false,
        attempt_count: 0,
        created_at: getIsoNow()
      };

      // Always save to localDb fallback
      storeTokenFallback(tokenRecord);

      if (dbClient) {
        let tokenSaveError: any = null;
        try {
          const { error: insertError } = await dbClient.from('password_reset_tokens').insert(tokenRecord);
          tokenSaveError = insertError;
        } catch (tokErr) { tokenSaveError = tokErr; }
        if (tokenSaveError) {
          console.error("[Resend] password_reset_tokens insert failed:", tokenSaveError?.message || tokenSaveError);
          return res.status(500).json({ detail: `Could not save the verification code (database: ${tokenSaveError?.message || "unknown error"}). Please try again.`, code: "OTP_SAVE_FAILED" });
        }
      }

      if (resolveOtpEcho(process.env)) console.log(`[Resend Verification] OTP for ${email} is ${otp}`); // codes stay out of production logs

      if (process.env.RESEND_API_KEY) {
        try {
          const resendClient = new Resend(process.env.RESEND_API_KEY);
          const fromEmail = process.env.RESEND_FROM_EMAIL || "Ybex <noreply@ybexmedia.in>";
          const resendResponse = await resendClient.emails.send({
            from: fromEmail,
            to: email,
            subject: `${otp} is your Ybex verification code`, // Session 43: code visible in the notification
            html: buildEmailHtml({
    greeting: "Hi there,",
    paragraphs: [
      "Here is your new 6-digit verification code to confirm your email address:",
      "<h1 style=\"font-size: 32px; letter-spacing: 4px; color: #4f46e5; background: #f3f4f6; padding: 12px 20px; display: inline-block; border-radius: 8px; margin: 0;\">" + otp + "</h1>",
      "This code will expire in 15 minutes."
    ]
  })
          });
          
          if (resendResponse.error) {
            console.error("Resend API error detail:", JSON.stringify(resendResponse.error));
            if (!process.env.RESEND_ALLOW_FALLBACK && !resolveTestMode(process.env)) { // a failed send is an error everywhere, not only when NODE_ENV says production
              return res.status(500).json({ detail: `Email error: ${resendResponse.error.message || 'Failed to send verification email'}` });
            }
          } else {
            console.log(`[Resend Verification] Email sent successfully via Resend to ${email}`);
          }
        } catch (emailErr: any) {
          console.error("Failed to send verification OTP:", emailErr?.message || emailErr);
          if (!process.env.RESEND_ALLOW_FALLBACK && !resolveTestMode(process.env)) { // a failed send is an error everywhere, not only when NODE_ENV says production
            return res.status(500).json({ detail: "Failed to send verification email" });
          }
        }
      } else {
        console.warn("RESEND_API_KEY not set. OTP logged to console above.");
      }

      return res.json({ 
        success: true, 
        message: "Code sent successfully",
        otp: otpForBrowser(otp)
      });
    } catch (err) {
      console.error("Resend OTP error:", err);
      return res.status(500).json({ detail: "Internal server error" });
    }
  });

  router.get("/auth/google/url", async (req, res) => {
    const client_id = cleanEnvVal(process.env.GOOGLE_CLIENT_ID);
    if (!client_id) {
      return res.status(400).json({
        error: "Google OAuth Client ID is not configured on the server. Please configure GOOGLE_CLIENT_ID in the settings panel."
      });
    }

    // v405: same public address rule as the new sign-in (oauthOrigin) — never localhost on the live server
    const default_redirect = `${oauthOrigin(String(req.get("host") || ""), String(req.get("x-forwarded-host") || ""))}/api/auth/google/callback`;

    const redirect_uri = (req.query.redirect_uri as string) || default_redirect;
    const params = new URLSearchParams({
      client_id,
      redirect_uri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      // v348: "select_account" first → Google shows the "Choose an account" list (when the browser has Google
      // accounts signed in) instead of silently using one; "consent" kept so the offline grant is unchanged.
      prompt: "select_account consent"
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    res.json({ url, is_fallback: false });
  });

  router.get("/auth/google/callback", async (req, res) => {
    const { code, error } = req.query;

    if (error || !code) {
      console.error("Google Auth error returned to callback:", error);
      return res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: "OAUTH_FAILURE" }, window.location.origin); // Session 53: only our own page may receive this
                window.close();
              } else {
                window.location.href = "/login";
              }
            </script>
            <p>Authorization failed or was cancelled. Closing window...</p>
          </body>
        </html>
      `);
    }

    const client_id = cleanEnvVal(process.env.GOOGLE_CLIENT_ID);
    const client_secret = cleanEnvVal(process.env.GOOGLE_CLIENT_SECRET);

    if (!client_id || !client_secret) {
      return res.status(400).send("Google OAuth Client ID & Secret are not configured on the server.");
    }

    try {
      const redirect_uri = `${oauthOrigin(String(req.get("host") || ""), String(req.get("x-forwarded-host") || ""))}/api/auth/google/callback`; // v405

      // 1. Exchange authorization code for token
      const tokenResponse = await axios.post("https://oauth2.googleapis.com/token", {
        client_id,
        client_secret,
        code,
        redirect_uri,
        grant_type: "authorization_code"
      });

      const { access_token, id_token } = tokenResponse.data;

      // 2. Fetch user profile info from Google API
      const userinfoResponse = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      });

      const profile = userinfoResponse.data;
      const { sub, email, name, picture } = profile;

      if (!email || profile.email_verified === false) {
        throw new Error("No verified email returned from Google profile scope.");
      }

      // v291 (Ravi): look the account up by e-mail in Supabase (same as the app's Google / Apple
      // sign-in) — the old code only looked in the local JSON store, so an account made on the phone
      // looked "new" on the website and offered to create another one.
      const result = await oauthSignInCore({ supabase, privilegedSupabase, getDb, saveDb }, {
        email, name: name || "", picture: picture || "", provider: "google", role: null,
      });
      if (!result.ok) {
        const msg = result.error === "admin" ? "This is a Ybex admin account. Please use the admin login."
          : result.error === "deleted" ? "This account was deleted. Please contact support."
          : result.error === "banned" ? "This account is not available. Please contact support."
          : "Google sign-in failed. Please try again.";
        return res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: "OAUTH_FAILURE", message: ${JSON.stringify(msg)} }, window.location.origin); // Session 53: only our own page may receive this
                window.close();
              } else {
                window.location.href = "/login";
              }
            </script>
            <p>${msg}</p>
          </body>
        </html>
      `);
      }
      const session_token = result.token;
      const supabaseSession: any = null;

      res.cookie("session_token", session_token, sessionCookieOptions());
      res.cookie("has_session", "true", { ...sessionCookieOptions(), httpOnly: false });

      return res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({
                  type: "OAUTH_SUCCESS",
                  token: "${session_token}",
                  supabaseSession: ${JSON.stringify(supabaseSession || null)}
                }, window.location.origin); // Session 53: only our own page may receive this
                window.close();
              } else {
                // Session 58 (Q17): no popup link back (popup blocked / Google cut it) — finish the sign-in here
                // instead of landing on /dashboard without the app knowing the session (looked logged out).
                window.location.replace("/app/oauth#token=" + encodeURIComponent("${session_token}"));
              }
            </script>
            <p>Google signing in successful! Closing window...</p>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error("Google Auth Token Exchange/Userinfo Error:", err?.response?.data || err?.message || err);
      return res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: "OAUTH_FAILURE" }, window.location.origin); // Session 53: only our own page may receive this
                window.close();
              } else {
                window.location.href = "/login";
              }
            </script>
            <p>Google authentication failed. Please try again.</p>
          </body>
        </html>
      `);
    }
  });

  router.get("/auth/me", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) {
      // v378 (live 28 Oct: "update diya toh sabke phone se logout ho gaya"): without the service key the server cannot
      // read saved logins, so every phone was told "not logged in" and signed out. That is a server problem, not a
      // logged-out user — answer SERVER_DOWN so the app keeps the login and just waits.
      // v388: same answer when Supabase itself failed / timed out while reading the session (QA: one hiccup logged everyone out).
      if ((!privilegedSupabase || (req as any)._authDbError) && /^Bearer\s+\S+/i.test(String(req.headers.authorization || ""))) {
        return res.status(503).json({ detail: "Ybex is updating right now — try again in a few minutes", code: "SERVER_DOWN" });
      }
      return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    }

    if (user.is_deleted) {
      return res.status(401).json({ 
        detail: "Your profile is no longer available. Please contact support or mail us at support@ybexmedia.in",
        code: "ACCOUNT_DELETED"
      });
    }
    if (user.banned) {
      return res.status(401).json({ 
        detail: "Your account has been banned. Please contact support.",
        code: "ACCOUNT_BANNED" 
      });
    }
    if (user.suspended || user.is_suspended) {
      return res.status(401).json({ 
        detail: "We've suspended your account to protect our community. Please contact support.",
        code: "ACCOUNT_SUSPENDED" 
      });
    }

    const db = getDb();
    let dbUser = db.users.find(u => u.user_id === user.user_id);
    if (!dbUser && supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('users').select('*').eq('user_id', user.user_id).maybeSingle();
        if (data) dbUser = data;
      } catch (err) {
        console.error("Error fetching dbUser from Supabase in /auth/me:", err);
      }
    }
    if (dbUser) {
      user.profile_completed = dbUser.profile_completed || false;
      user.bank_details_added = dbUser.bank_details_added || false;
      user.bank_name = dbUser.bank_name || "";
      user.bank_account = dbUser.bank_account || "";
      user.bank_ifsc = dbUser.bank_ifsc || "";
      user.kyc_verified = dbUser.kyc_verified || false;
      user.phone = dbUser.phone || dbUser.mobile || dbUser.phone_number || user.phone || "";
      if (dbUser.email) user.email = dbUser.email;
      
      const cpRow = db.creator_profiles?.find((c: any) => c.user_id === user.user_id);
      if (cpRow?.business_email) user.business_email = cpRow.business_email;
      const bpRow = db.brand_profiles?.find((b: any) => b.user_id === user.user_id);
      if (bpRow?.poc_email) user.poc_email = bpRow.poc_email;
      
      // Ensure absolute compatibility across all frontend components (avatar vs picture vs photo)
      const currentPic = dbUser.picture || dbUser.photo || dbUser.avatar || user.picture || "";
      user.picture = currentPic;
      user.photo = currentPic;
      user.avatar = currentPic;
      user.onboarded = dbUser.onboarded !== undefined ? dbUser.onboarded : user.onboarded;
      if (dbUser.onboarding_completed || dbUser.onboarding_complete) {
        user.onboarded = true;
      }
    }

    if (user.onboarded) {
      user.onboarding_completed = true;
      user.onboarding_complete = true;
    }

    
    // Accounts created before the onboarding fix finished onboarding with no role saved. If
    // exactly one kind of profile exists, that is the role they onboarded as — save it once.
    if (!user.role) {
      try {
        const client = privilegedSupabase || supabase;
        let hasBrand = Boolean(db.brand_profiles?.some((p: any) => p.user_id === user.user_id));
        let hasCreator = Boolean(db.creator_profiles?.some((p: any) => p.user_id === user.user_id));
        if (client) {
          const [{ data: bRow }, { data: cRow }] = await Promise.all([
            client.from('brand_profiles').select('user_id').eq('user_id', user.user_id).maybeSingle(),
            client.from('creator_profiles').select('user_id').eq('user_id', user.user_id).maybeSingle()
          ]);
          hasBrand = hasBrand || Boolean(bRow);
          hasCreator = hasCreator || Boolean(cRow);
        }
        if (hasBrand !== hasCreator) {
          await persistUserRole(user, hasBrand ? 'brand' : 'creator');
        }
      } catch (e: any) {
        console.warn("[auth/me] role heal skipped:", e?.message || e);
      }
    }

    if (user.role === "creator") {
      let cp = null;
      if (supabase) {
        const { data } = await (privilegedSupabase || supabase).from('creator_profiles').select('*').eq('user_id', user.user_id).maybeSingle();
        if (data) cp = data;
      } else {
        cp = db.creator_profiles?.find(p => p.user_id === user.user_id);
      }
      if (cp) {
        user.category = cp.category || "";
        if (cp.phone || cp.mobile) user.phone = cp.phone || cp.mobile || user.phone;
        if (cp.verified) user.kyc_verified = true;
        if (cp.name || cp.full_name) {
          user.name = cp.name || cp.full_name;
        }
        const pic = cp.picture || cp.photo || cp.avatar_url || cp.profile_picture_url;
        if (pic) {
          user.picture = pic;
          user.photo = pic;
          user.avatar = pic;
        }
        const isCreatorOnboarded = Boolean(dbUser?.onboarded || user.onboarded || cp.onboarding_complete || cp.onboarding_completed);
        user.onboarded = isCreatorOnboarded;
        user.onboarding_completed = isCreatorOnboarded;
        user.onboarding_complete = isCreatorOnboarded;
      } else {
        const isCreatorOnboarded = Boolean(dbUser?.onboarded || user.onboarded);
        user.onboarded = isCreatorOnboarded;
        user.onboarding_completed = isCreatorOnboarded;
        user.onboarding_complete = isCreatorOnboarded;
      }
    } else if (user.role === "brand") {
      let bp = null;
      if (supabase) {
        const { data } = await (privilegedSupabase || supabase).from('brand_profiles').select('*').eq('user_id', user.user_id).maybeSingle();
        if (data) bp = data;
      } else {
        bp = db.brand_profiles?.find(p => p.user_id === user.user_id);
      }
      if (bp) {
        user.industry = bp.industry || "";
        if (bp.representative_mobile || bp.poc_phone || bp.phone) {
          user.phone = bp.representative_mobile || bp.poc_phone || bp.phone || user.phone;
        }
        if (bp.verified) user.kyc_verified = true;
        if (bp.company_name) {
          user.name = bp.company_name;
        }
        if (bp.logo) {
          user.picture = bp.logo;
          user.photo = bp.logo;
          user.avatar = bp.logo;
        }
        const isBrandOnboarded = Boolean(dbUser?.onboarded || user.onboarded || bp.onboarding_completed || bp.onboarding_complete);
        user.onboarded = isBrandOnboarded;
        user.onboarding_completed = isBrandOnboarded;
        user.onboarding_complete = isBrandOnboarded;
      } else {
        const isBrandOnboarded = Boolean(dbUser?.onboarded || user.onboarded);
        user.onboarded = isBrandOnboarded;
        user.onboarding_completed = isBrandOnboarded;
        user.onboarding_complete = isBrandOnboarded;
      }
    }


    // Fake demo data (Nexus Brands / Alice Creator collabs, invoices, earnings, orders — and the
    // real creator added as an applicant to someone's real campaign) used to be written for EVERY
    // new real user on their first /auth/me. Only with DEMO_SEED=true now. See docs/code/ARCHITECTURE.md.
    if (DEMO_SEED_ENABLED() && user.role === "creator") {
      const db = getDb();
      db.collabs = db.collabs || [];
      db.chat_threads = db.chat_threads || [];
      db.chat_messages = db.chat_messages || [];
      db.invoices = db.invoices || [];
      db.ugc_briefs = db.ugc_briefs || [];
      db.ugc_orders = db.ugc_orders || [];
      db.earnings = db.earnings || [];
      db.banners = db.banners || [];

      const hasCollabs = db.collabs.some(c => c.creator_id === user.user_id || c.to_user_id === user.user_id || c.from_user_id === user.user_id);
      if (!hasCollabs) {
        const c1_id = `collab_demo_${user.user_id}_1`;
        const c2_id = `collab_demo_${user.user_id}_2`;
        const brand_id = "demo_brand";
        const thread1_id = `thread_demo_${user.user_id}`;
        
        if (!db.users.find(u => u.user_id === brand_id)) {
           db.users.push({ user_id: brand_id, name: "Nexus Brands", email: "nexus@example.com", role: "brand" });
        }
        if (!db.brand_profiles) db.brand_profiles = [];
        if (!db.brand_profiles.find(b => b.user_id === brand_id)) {
           db.brand_profiles.push({ user_id: brand_id, company_name: "Nexus Brands Inc.", industry: "Lifestyle" });
        }
        
        const d = new Date();
        db.collabs.push({
          collab_id: c1_id, to_user_id: user.user_id, from_user_id: brand_id, campaign_id: "c1", status: "active",
          rate: 15000, message: "Looking forward to this!", created_at: new Date(d.getTime() - 86400000*3).toISOString(),
          brand_name: "Nexus Brands Inc."
        });
        db.collabs.push({
          collab_id: c2_id, to_user_id: brand_id, from_user_id: user.user_id, campaign_id: "c2", status: "completed",
          rate: 25000, message: "Loved working on this.", created_at: new Date(d.getTime() - 86400000*10).toISOString(),
          brand_name: "Nexus Brands Inc."
        });

        if (db.campaigns && db.campaigns[0]) {
           db.campaigns[0].applicants = db.campaigns[0].applicants || [];
           db.campaigns[0].applicants.push({
               application_id: `app_seed_${user.user_id}_1`, creator_user_id: user.user_id, 
               pitch: "I'd love to work with you!", proposed_amount: 15000, status: "pending", applied_at: new Date().toISOString()
           });
        }
        if (db.campaigns && db.campaigns[1]) {
           db.campaigns[1].applicants = db.campaigns[1].applicants || [];
           db.campaigns[1].applicants.push({
               application_id: `app_seed_${user.user_id}_2`, creator_user_id: user.user_id, 
               pitch: "Here's my pitch for this campaign.", proposed_amount: 20000, status: "accepted", applied_at: new Date().toISOString()
           });
        }

        db.chat_threads.push({
          id: thread1_id, collab_id: c1_id, creator_id: user.user_id, brand_id,
          status: "active", created_at: new Date(d.getTime() - 86400000*3).toISOString(), updated_at: new Date().toISOString()
        });
        db.chat_messages.push({
          id: `m_d_${user.user_id}_1`, thread_id: thread1_id, sender_id: brand_id, content: "Hey! We accepted your application. Please send the draft link.", created_at: new Date(d.getTime() - 86400000).toISOString()
        });
        db.chat_messages.push({
          id: `m_d_${user.user_id}_2`, thread_id: thread1_id, sender_id: user.user_id, content: "Great! Working on it now.", created_at: new Date().toISOString()
        });

        db.invoices.push({
          id: "inv1", invoice_number: "INV-8001", creator_id: user.user_id, client_id: brand_id,
          client_name: "Nexus Brands Inc.", total_amount: 25000, status: "PAID",
          issue_date: new Date(d.getTime() - 86400000*10).toISOString(), due_date: new Date(d.getTime() + 86400000*10).toISOString(),
          items: [{description: "Instagram Reel", amount: 25000}]
        });
        db.invoices.push({
          id: "inv2", invoice_number: "INV-8002", creator_id: user.user_id, client_id: brand_id,
          client_name: "Nexus Brands Inc.", total_amount: 15000, status: "PENDING",
          issue_date: new Date().toISOString(), due_date: new Date(d.getTime() + 86400000*30).toISOString(),
          items: [{description: "YouTube Integration", amount: 15000}]
        });

        const brief_id = "brief_demo_1";
        const order_id = "ugc_ord_demo_1";
        if(!db.ugc_briefs.find(b => b.id === brief_id)) {
            db.ugc_briefs.push({
            id: brief_id, brand_id, title: "Quick Unboxing for Activewear", product_name: "Aura Leggings",
            product_description: "Premium high-waisted seamless leggings with side pockets.",
            detailed_requirements: "We are looking for a highly engaging, well-lit unboxing video showing the premium packaging and the stretchability of the leggings. Please highlight the side pockets and the seamless design.",
            sample_content_url: "https://example.com/sample-ugc-unboxing",
            budget: 15000, deliverable_type: "instagram_reel", dos: ["Show fabric stretch", "Mention 24h shipping"], donts: ["Mention price", "Show other brands"], status: "IN_PROGRESS",
            claimed_count: 1, max_creators: 1
            });
        }
        db.ugc_orders.push({
          id: order_id, brief_id, creator_id: user.user_id, brief: db.ugc_briefs.find(b => b.id === brief_id),
          brand_status: "IN_PROGRESS", creator_status: "CLAIMED", creator_payout: 3300, agreed_amount: 15000,
          internal_deadline: new Date(d.getTime() + 86400000).toISOString(), created_at: new Date().toISOString()
        });
        db.earnings.push({
          id: "earn_1", creator_id: user.user_id, brief: db.ugc_briefs.find(b => b.id === brief_id),
          creator_payout: 4200, created_at: new Date(d.getTime() - 86400000*5).toISOString()
        });

        // Add some available brief
        if(!db.ugc_briefs.find(b=>b.id==="brief_open_1")){
          db.ugc_briefs.push({
            id: "brief_open_1", brand_id, title: "Protein Powder review", product_name: "Pro Whey",
            product_description: "High-quality whey protein powder for muscle recovery.",
            detailed_requirements: "Show yourself mixing the powder with water or milk in a shaker. Take a sip and talk about the taste and how it helps you recover after a workout.",
            sample_content_url: "https://example.com/sample-ugc-review",
            budget: 5000, deliverable_type: "youtube_short", dos: ["Show mixing"], donts: [], status: "OPEN",
            claimed_count: 0, max_creators: 3
          });
        }

        saveDb(db);
      }
    } else if (DEMO_SEED_ENABLED() && user.role === "brand") {
      const db = getDb();
      db.ugc_briefs = db.ugc_briefs || [];
      db.ugc_orders = db.ugc_orders || [];
      db.collabs = db.collabs || [];

      const hasBrandData = db.ugc_briefs.some(b => b.brand_id === user.user_id);
      if (!hasBrandData) {
        const creator_id = "creator_demo_1";
        if (!db.users.find(u => u.user_id === creator_id)) {
           db.users.push({ user_id: creator_id, name: "Alice Creator", email: "alice@example.com", role: "creator" });
        }

        const brief_id = "brief_demo_brand_1";
        const order_id = "ugc_ord_demo_brand_1";
        db.ugc_briefs.push({
          id: brief_id, brand_id: user.user_id, title: "Quick Unboxing for Activewear", product_name: "Aura Leggings",
          detailed_requirements: "We are looking for a highly engaging, well-lit unboxing video showing the premium packaging and the stretchability of the leggings. Please highlight the side pockets and the seamless design.",
          sample_content_url: "https://example.com/sample-ugc-unboxing",
          product_description: "Premium high-waisted seamless leggings with side pockets.",
          budget: 15000, deliverable_type: "instagram_reel", dos: ["Show fabric stretch", "Mention 24h shipping"], donts: ["Mention price", "Show other brands"], status: "IN_PROGRESS",
          claimed_count: 1, max_creators: 1
        });
        
        const d = new Date();
        db.ugc_orders.push({
          id: order_id, brief_id, creator_id: creator_id, brief: db.ugc_briefs.find(b => b.id === brief_id),
          brand_status: "IN_PROGRESS", creator_status: "CLAIMED", creator_payout: 3300, agreed_amount: 15000,
          internal_deadline: new Date(d.getTime() + 86400000).toISOString(), created_at: new Date().toISOString()
        });

        db.collabs.push({
          collab_id: "collab_brand_1", to_user_id: creator_id, from_user_id: user.user_id, campaign_id: "c1", status: "active",
          rate: 15000, message: "Let's do this!", created_at: new Date(d.getTime() - 86400000*3).toISOString(),
          brand_name: "Nexus Brands Inc.", creator_name: "Alice Creator"
        });

        saveDb(db);
      }
    }

    if (user.role === 'admin' || user.role === 'sub_admin' || user.team_role === 'sub_admin') {
      user.permissions = await getPermissionsForUser(user.user_id);
    }

    // Lets <video>/<img> open deliverables through /api/media (they cannot send the Bearer header).
    res.json({ ...user, media_key: issueMediaKey(user.user_id) });
  });

  router.post("/auth/forgot-password", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase(); // v388: trimmed — " user@x.com" used to get its own limit bucket
    if (!email) {
      return res.status(400).json({ detail: "Email is required" });
    }
    if (!otpIpAllowed(clientIp(req))) return res.status(429).json({ detail: "Too many requests. Please try again in a few minutes." }); // v388
    
    if (!checkForgotPasswordRateLimit(email)) {
      return res.status(429).json({ detail: "Too many requests. Please try again in 15 minutes." });
    }

    try {
      const activeClient = privilegedSupabase || supabase;

      if (!activeClient) {
         return res.status(500).json({ detail: "Database connection unavailable" });
      }

      // Session 58: same lookup as login (trimmed, lower-case, wildcards escaped, duplicate old rows handled).
      const { user } = await findUserByEmail(activeClient, email);

      if (!user) {
        return res.status(404).json({ detail: "No account found with this email address." });
      }

      // Generate a 6-digit OTP using crypto
      const otp = crypto.randomInt(100000, 1000000).toString();
      const reset_token_expires = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins

      const salt = await bcrypt.genSalt(10);
      const otpHash = await bcrypt.hash(otp, salt);
      const tokenRecord = {
        id: crypto.randomUUID(),
        user_id: user.user_id,
        otp_hash: otpHash,
        purpose: 'password_reset',
        expires_at: reset_token_expires,
        used: false,
        attempt_count: 0,
        created_at: getIsoNow()
      };

      // Always save to localDb fallback first
      storeTokenFallback(tokenRecord);

      try {
        const { error } = await activeClient.from('password_reset_tokens').insert([tokenRecord]);
        if (error) {
          console.warn("[ForgotPassword] Supabase token insert notice (fallback stored):", error.message || error);
        }
      } catch (tokErr) {
        console.warn("[ForgotPassword] Supabase token insert exception:", tokErr);
      }

      if (resolveOtpEcho(process.env)) console.log(`[Forgot Password] OTP for ${email} is ${otp}`); // codes stay out of production logs

      if (process.env.RESEND_API_KEY) {
        try {
          const resendClient = new Resend(process.env.RESEND_API_KEY);
          const fromEmail = process.env.RESEND_FROM_EMAIL || "Ybex <noreply@ybexmedia.in>";
          const resendResponse = await resendClient.emails.send({
            from: fromEmail,
            to: email,
            subject: `${otp} is your Ybex password reset code`,
            html: buildEmailHtml({
    greeting: "Hi there,",
    paragraphs: [
      "You recently requested to reset your password. Here is your 6-digit password reset code:",
      "<h1 style=\"font-size: 32px; letter-spacing: 4px; color: #4f46e5; background: #f3f4f6; padding: 12px 20px; display: inline-block; border-radius: 8px; margin: 0;\">" + otp + "</h1>",
      "This code will expire in 15 minutes. If you did not request this, please ignore this email."
    ]
  })
          });
          
          if (resendResponse.error) {
            console.error("Resend API error detail:", JSON.stringify(resendResponse.error));
            if (!process.env.RESEND_ALLOW_FALLBACK) { // a failed send is an error everywhere, not only when NODE_ENV says production
              return res.status(500).json({ detail: `Email error: ${resendResponse.error.message || 'Failed to send reset email'}` });
            }
          } else {
            console.log(`[Forgot Password] Email sent to ${email}. Resend response:`, resendResponse.data);
          }
        } catch (emailErr: any) {
          console.error("Failed to execute Resend call:", emailErr?.message || emailErr);
          if (!process.env.RESEND_ALLOW_FALLBACK) { // a failed send is an error everywhere, not only when NODE_ENV says production
            return res.status(500).json({ detail: "Failed to send reset email" });
          }
        }
      } else {
        console.warn("RESEND_API_KEY not set. OTP logged to console above.");
      }

      return res.json({ success: true, message: "If that email is in our database, we will send a password reset link." });
    } catch (err) {
      console.error("Forgot password error:", err);
      return res.status(500).json({ detail: "Internal server error" });
    }
  });

  router.post("/auth/reset-password", async (req, res) => {
    const email = (req.body.email || "").trim();
    const otp = (req.body.otp || req.body.code || "").trim();
    const newPassword = req.body.newPassword || req.body.password || req.body.new_password;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ detail: "Email, OTP, and new password are required" });
    }

    try {
      const activeClient = privilegedSupabase || supabase;
      const { user } = await findUserByEmail(activeClient, email); // Session 58: same lookup as login

      if (!user || !activeClient) {
        return res.status(400).json({ detail: "Invalid or expired OTP" });
      }

      let tokens: any[] = [];
      try {
        const { data: sbTokens, error } = await activeClient
          .from('password_reset_tokens')
          .select('*')
          .eq('user_id', user.user_id)
          .eq('purpose', 'password_reset')
          .gte('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(5);
        if (!error && Array.isArray(sbTokens) && sbTokens.length > 0) {
          tokens = sbTokens;
        }
      } catch (e: any) { logIgnored("auth_routes:1728", e); }

      if (tokens.length === 0) {
        tokens = getTokensFallback(user.user_id, 'password_reset');
      }

      if (!tokens || tokens.length === 0) {
        return res.status(400).json({ detail: "Invalid or expired OTP" });
      }

      const resetData = tokens[0];
      
      if (resetData.attempt_count >= 5) {
        if (!resetData.used) {
          try { await activeClient.from('password_reset_tokens').update({ used: true }).eq('id', resetData.id); } catch (e: any) { logIgnored("auth_routes:1742", e); }
          updateTokenFallback(resetData.id, { used: true });
        }
        return res.status(400).json({ detail: "Too many failed attempts. This OTP has been invalidated, please request a new code." });
      }

      if (resetData.used) {
        return res.status(400).json({ detail: "Invalid or expired OTP" });
      }

      const isValid = await bcrypt.compare(otp, resetData.otp_hash);
      if (!isValid) {
        const newAttemptCount = (resetData.attempt_count || 0) + 1;
        if (newAttemptCount >= 5) {
          try { await activeClient.from('password_reset_tokens').update({ attempt_count: newAttemptCount, used: true }).eq('id', resetData.id); } catch (e) { logIgnored("auth_routes:1759", e); }
          updateTokenFallback(resetData.id, { attempt_count: newAttemptCount, used: true });
          return res.status(400).json({ detail: "Too many failed attempts. This OTP has been invalidated, please request a new code." });
        } else {
          try { await activeClient.from('password_reset_tokens').update({ attempt_count: newAttemptCount }).eq('id', resetData.id); } catch (e) { logIgnored("auth_routes:1763", e); }
          updateTokenFallback(resetData.id, { attempt_count: newAttemptCount });
          return res.status(400).json({ detail: "Invalid or expired OTP" });
        }
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      try {
        // Session 58 (bug hunt): the reset code proved the inbox → the email counts as verified (an unverified user
        // could reset and still not log in), and every old login on other devices is signed out.
        await activeClient.from('users').update({ password_hash: hashedPassword, verified: true }).eq('user_id', user.user_id);
      } catch (e: any) { logIgnored("auth_routes:1770", e); }
      try { await activeClient.from('user_sessions').delete().eq('user_id', user.user_id); } catch (e: any) { logIgnored("auth_routes:reset-sessions", e); }
      try {
        await activeClient.from('password_reset_tokens').update({ used: true }).eq('id', resetData.id);
      } catch (e: any) { logIgnored("auth_routes:1773", e); }
      updateTokenFallback(resetData.id, { used: true });

      const db = getDb();
      if (db.users) {
        const u = db.users.find((x: any) => x.user_id === user.user_id || (x.email && x.email.toLowerCase() === email.toLowerCase()));
        if (u) {
          u.password_hash = hashedPassword;
          saveDb(db);
        }
      }
      
      // v396 (QA S-4): every other login of this account ends too — this server's copies and the token cache
      try {
        const dbS = getDb();
        if (Array.isArray(dbS.user_sessions)) {
          const gone = dbS.user_sessions.filter((x: any) => x?.user_id === user.user_id);
          if (gone.length) {
            dbS.user_sessions = dbS.user_sessions.filter((x: any) => x?.user_id !== user.user_id);
            saveDb(dbS);
            for (const g of gone) { try { req.app.get("authLookup")?.forgetToken(g.session_token); } catch { /* cache off */ } }
          }
        }
      } catch (e) { logIgnored("auth_routes:reset-local-sessions", e); }

      recordUserPassword(user.user_id, user.email, newPassword);

      return res.json({ success: true, message: "Password has been reset successfully." });
    } catch (err) {
      console.error("Reset password error:", err);
      return res.status(500).json({ detail: "Internal server error" });
    }
  });

  router.post("/auth/logout", async (req, res) => {
    const authHeader = req.headers.authorization;
    let token = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
    const user = await parseAuthUser(req);
    if (user && (user.role === 'admin' || user.team_role === 'sub_admin')) {
      await logAdminAuth(user.user_id, user.email, "logout", req.headers['x-forwarded-for'] || req.connection?.remoteAddress, req.headers['user-agent']);
    }
    if (!token && req.headers.cookie) {
      const m = String(req.headers.cookie).match(/session_token=([^;]+)/);
      if (m) token = decodeURIComponent(m[1]);
    }
    const db = getDb();
    if (token) {
      if (!db.user_sessions) db.user_sessions = [];
      db.user_sessions = db.user_sessions.filter((s) => s.session_token !== token);
      // Session 23: logout used to remove the session only from the local store — the Supabase
      // row stayed, so the token kept working after "logout" (on every instance).
      const client = privilegedSupabase || supabase;
      if (client) {
        try { await client.from('user_sessions').delete().eq('session_token', token); }
        catch (e) { logIgnored("auth_routes:logout", e); }
      }
      try { req.app.get("authLookup")?.forgetToken(token); } catch (e) { logIgnored("auth_routes:logout-cache", e); }
    }
    saveDb(db);
    res.clearCookie("session_token");
    res.clearCookie("has_session");
    res.json({ ok: true });
  });

  router.post("/auth/onboard", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    
    const { role: requestedRole, data: rawData } = req.body || {};
    const data = rawData || {};

    // The role has to be saved here — sign-up does not always save it (Google sign-up creates
    // the user with no role), and without it the server treats a finished brand as nobody.
    const decision = decideRoleChange(user.role, requestedRole, isOnboarded(user));
    if (!decision.ok) {
      return res.status(decision.status).json({ error: decision.code, code: decision.code, detail: decision.message });
    }
    if (decision.setRole) await persistUserRole(user, decision.setRole);
    const role = String(user.role || requestedRole).toLowerCase();
    
    if (supabase) {
      // Session 58: onboarded=true is written only AFTER the profile row is saved (a failed profile save used to
      // leave a user marked onboarded with no profile).
      let updatePayload: any = {};
      let rawPicture = "";
      let rawLogo = "";

      if (role === 'creator') {
        rawPicture = data.avatar_url || data.photo || user.picture || "";
        rawPicture = await processBase64Image(rawPicture, "profile-assets", user.user_id);
        updatePayload.name = data.full_name || data.name || user.name;
        updatePayload.picture = rawPicture;
      } else if (role === 'brand') {
        rawLogo = data.logo_url || data.logo || "";
        if (rawLogo && rawLogo.startsWith("data:image/")) {
          rawLogo = await processBase64Image(rawLogo, "brand-logos", user.user_id);
        }
        updatePayload.name = data.company_name || user.name;
        updatePayload.picture = rawLogo;
      }

      const { error: userUpdateErr } = Object.keys(updatePayload).length ? await (privilegedSupabase || supabase).from('users').update(updatePayload).eq('user_id', user.user_id) : { error: null };
      if (userUpdateErr) {
        console.error("Onboard user update error:", userUpdateErr);
        return res.status(500).json({ error: userUpdateErr.message });
      }

      if (role === 'creator') {
        const payload = {
          user_id: user.user_id,
          name: updatePayload.name,
          email: user.email,
          photo: rawPicture,
          picture: rawPicture,
          bio: data.bio,
          primary_niche: data.primary_niche || data.category,
          category: data.primary_niche || data.category,
          gender: data.gender,
          city: data.city,
          state: data.state,
          languages: data.languages,
          instagram_handle: data.instagram_handle,
          follower_count: Number(data.follower_count || data.ig_followers || 0),
          ig_followers: Number(data.follower_count || data.ig_followers || 0),
          followers_instagram: Number(data.follower_count || data.ig_followers || 0),
          avg_views_30d: Number(data.avg_views_30d || data.average_reach || 0),
          avg_likes_30d: Number(data.avg_likes_30d || 0),
          avg_comments_30d: Number(data.avg_comments_30d || 0),
          engagement_rate: (Number(data.follower_count || data.ig_followers || 0) > 0 && (Number(data.avg_likes_30d || 0) > 0 || Number(data.avg_comments_30d || 0) > 0))
            ? parseFloat((((Number(data.avg_likes_30d || 0) + Number(data.avg_comments_30d || 0)) / Number(data.follower_count || data.ig_followers || 1)) * 100).toFixed(2))
            : (data.engagement_rate || 0),
          barter_mode: data.barter_mode,
          rate_card: { reels: Number(data.rate_reel || 0), stories: Number(data.rate_story || 0) },
          rate_reel: Number(data.rate_reel) || 0,
          rate_story: Number(data.rate_story) || 0,
          rate_yt_video: Number(data.youtube_video_rate) || 0
        };
        // v357: a brand-new creator row goes to the admin's waitlist (the DB default would make it "approved").
        try {
          const { data: hadRow } = await (privilegedSupabase || supabase).from('creator_profiles').select('user_id').eq('user_id', user.user_id).maybeSingle();
          if (!hadRow) (payload as any).profile_status = "under_review";
        } catch (e) { logIgnored("auth_routes:onboard-status", e); }
        const { error } = await (privilegedSupabase || supabase).from('creator_profiles').upsert(payload);
        if (error) {
          console.error("Onboard creator profile error:", error);
          return res.status(500).json({ error: error.message });
        }
        
        // Universal Category Sync
        const tagsToSync = [];
        if (payload.primary_niche) {
          tagsToSync.push({ name: payload.primary_niche, type: 'niche' as const });
        }
        if (tagsToSync.length > 0) {
          await syncEntityTags('creator_profile', user.user_id, tagsToSync);
        }
      } else if (role === 'brand') {
        const payload = {
          user_id: user.user_id,
          company_name: updatePayload.name || '', // DO NOT fallback to user.name
          is_agency: data.is_agency === true || data.isAgency === true,
          // agency_type removed from db schema
          representative_name: data.representative_name || '',
          representative_designation: data.representative_designation || '',
          representative_mobile: data.representative_mobile || '',
          email: user.email,
          industry: data.industry,
          description: data.description,
          gender_focus: data.gender_focus,
          website: data.website_url || data.website,
          team_size: data.team_size,
          campaign_types: data.campaign_types,
          budget_range: data.budget_range,
          preferred_creator_size: data.creator_size || data.preferred_creator_size,
          preferred_niches: data.preferred_niches,
          logo: rawLogo,
          // v363: city / state from onboarding were never saved (0 of 4 brands had them)
          ...(data.city ? { city: String(data.city).slice(0, 80) } : {}),
          ...(data.state ? { state: String(data.state).slice(0, 80) } : {}),
          // Session 58: social links from onboarding were dropped (real columns: linkedin_url / youtube_url / twitter_url).
          ...(data.linkedin_url ? { linkedin_url: String(data.linkedin_url).slice(0, 300) } : {}),
          ...(data.youtube_channel_url || data.youtube_url ? { youtube_url: String(data.youtube_channel_url || data.youtube_url).slice(0, 300) } : {}),
          ...(data.twitter_handle || data.twitter_url ? { twitter_url: String(data.twitter_handle || data.twitter_url).slice(0, 300) } : {}),
          // v375 (Ravi): the brand's Instagram username is kept (column brand_profiles.instagram_handle, added 23 Oct).
          ...(brandIgHandle(data.instagram_handle) ? { instagram_handle: brandIgHandle(data.instagram_handle) } : {}),
        };
        let { error } = await (privilegedSupabase || supabase).from('brand_profiles').upsert(payload);
        // a database without the new column (local / not migrated) must not break onboarding
        if (error && /instagram_handle/i.test(String(error.message || "")) && (payload as any).instagram_handle) {
          delete (payload as any).instagram_handle;
          ({ error } = await (privilegedSupabase || supabase).from('brand_profiles').upsert(payload));
        }
        if (error) {
          console.error("Onboard brand profile error:", error);
          return res.status(500).json({ error: error.message });
        }
        
        // (users has no is_agency column — it lives on brand_profiles; that extra write always failed)
        
        // Universal Category Sync
        const tagsToSync = [];
        if (payload.industry) {
          tagsToSync.push({ name: payload.industry, type: 'industry' as const });
        }
        if (payload.preferred_niches) {
          const nichesArray = Array.isArray(payload.preferred_niches)
            ? payload.preferred_niches
            : typeof payload.preferred_niches === 'string'
              ? payload.preferred_niches.split(',').map(s => s.trim())
              : [];
          nichesArray.forEach(n => {
            if (n) tagsToSync.push({ name: n, type: 'niche' as const });
          });
        }
        if (tagsToSync.length > 0) {
          await syncEntityTags('brand_profile', user.user_id, tagsToSync);
        }
      }
      const { error: doneErr } = await (privilegedSupabase || supabase).from('users').update({ onboarded: true }).eq('user_id', user.user_id);
      if (doneErr) {
        console.error("Onboard user update error:", doneErr);
        return res.status(500).json({ error: doneErr.message });
      }
    }

    const db = getDb();
    const dbUser = db.users.find(u => u.user_id === user.user_id);
    if (dbUser) {
      dbUser.onboarded = true;
      dbUser.onboarding_completed = true;
      if (role === 'creator') {
        dbUser.name = data.full_name || data.name || user.name;
        dbUser.picture = data.avatar_url || data.photo || user.picture || "";
        dbUser.photo = dbUser.picture;
        dbUser.avatar = dbUser.picture;
      } else if (role === 'brand') {
        dbUser.name = data.company_name || user.name;
        dbUser.picture = data.logo_url || data.logo || "";
        dbUser.photo = dbUser.picture;
        dbUser.avatar = dbUser.picture;
      }
      if (role === "creator") {
        if (!db.creator_profiles) db.creator_profiles = [];
        let profile = db.creator_profiles.find(p => p.user_id === user.user_id);
        if (!profile) {
          profile = { user_id: user.user_id };
          db.creator_profiles.push(profile);
        }
        Object.assign(profile, data || {});
      } else if (role === "brand") {
        if (!db.brand_profiles) db.brand_profiles = [];
        let profile = db.brand_profiles.find(p => p.user_id === user.user_id);
        if (!profile) {
          profile = { user_id: user.user_id };
          db.brand_profiles.push(profile);
        }
        Object.assign(profile, data || {});
      }
      saveDb(db);
    }
    // v395: onboarding finished → Meta "QualifiedCreator" when the creator's Instagram has 1,000+ followers (first time only)
    const meta_events = role === "creator" ? await qualifyCreatorAll({ user: { ...user, ...(dbUser || {}), role }, followers: data.follower_count || data.ig_followers, req }) : [];
    res.json({ ok: true, user: { ...(dbUser || user), role }, ...(meta_events.length ? { meta_event: meta_events[0], meta_events } : {}) });
  });

  router.post("/auth/role", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) {
      return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    }
    const decision = decideRoleChange(user.role, req.body?.role, isOnboarded(user), SELECTABLE_ROLES);
    if (!decision.ok) {
      return res.status(decision.status).json({ error: decision.code, code: decision.code, detail: decision.message });
    }
    if (decision.setRole) await persistUserRole(user, decision.setRole);
    res.json({ ok: true, role: user.role });
  });

  // Used to answer ANY session_id with the user whose user_id matched it (full row, including
  // bank fields), or invent a "creator" when none did, and hand the id back as a token. Now it
  // only accepts a real session token and returns what /auth/me would.
  router.post("/auth/session", async (req, res) => {
    const sessionId = String(req.body?.session_id || "").trim();
    if (!sessionId) return res.status(400).json({ detail: "session_id is required" });
    const user = await parseAuthUser({ headers: { authorization: `Bearer ${sessionId}` } } as any);
    if (!user) return res.status(401).json({ detail: "Invalid or expired session. Please log in again." });
    const { password_hash, ...safeUser } = user;
    res.json({ ok: true, user: safeUser, token: sessionId });
  });


}

/** Session 58: "16 Oct 2026" while a suspension (users.suspended_until) is still running, else "". */
function suspendedUntilText(u: any): string {
  const t = u?.suspended_until ? Date.parse(u.suspended_until) : NaN;
  return Number.isFinite(t) && t > Date.now() ? new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "";
}
