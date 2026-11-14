import { logIgnored } from "./logIgnored";
import { issueSignToken, noteSignEmail } from "./signTokens";
import { ephemeralGet, ephemeralSet, ephemeralDelete, hashCode } from "./ephemeralStore";
import express from "express";
import crypto from "crypto";
import { Resend, buildEmailHtml, buildContractSignEmailHtml } from "./helpers";
import { resolveOtpEcho } from "./otpEcho";
import { resolveSigningEmails } from "./signingEmail";
import { rememberContactProof } from "./contactProof"; // v423 (S1)
import { clientIp as authClientIp } from "./authSecurity"; // v423 (S2): trusted last-hop IP

// Device-session management: listing a user's active login sessions,
// logging out a specific session, and logging out all OTHER sessions
// (keeping the current one). parseDeviceName/getSessionToken are small,
// self-contained helpers used only by these routes, so they moved here
// together rather than being passed in as dependencies.
export function setupSessionRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
  }
) {

  function parseDeviceName(ua: string = ""): string {
    if (!ua || typeof ua !== "string") return "Web Device";

    let os = "Web Device";
    if (/iphone/i.test(ua)) {
      os = "iPhone";
    } else if (/ipad/i.test(ua)) {
      os = "iPad";
    } else if (/android/i.test(ua)) {
      if (/mobile/i.test(ua)) {
        os = "Android Phone";
      } else {
        os = "Android Tablet";
      }
    } else if (/macintosh|mac os x/i.test(ua)) {
      os = "MacBook / Mac";
    } else if (/windows/i.test(ua)) {
      os = "Windows PC";
    } else if (/linux/i.test(ua)) {
      os = "Linux PC";
    }

    let browser = "";
    if (/edg/i.test(ua)) {
      browser = "Edge";
    } else if (/chrome|crios/i.test(ua)) {
      browser = "Chrome";
    } else if (/firefox|fxios/i.test(ua)) {
      browser = "Firefox";
    } else if (/safari/i.test(ua) && !/chrome|crios|android/i.test(ua)) {
      browser = "Safari";
    } else if (/opera|opr/i.test(ua)) {
      browser = "Opera";
    }

    return browser ? `${os} (${browser})` : os;
  }

  function getSessionToken(req: any) {
    let token = "";
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else if (req.headers.cookie) {
      const match = req.headers.cookie.match(/session_token=([^;]+)/);
      if (match) token = match[1];
    }
    return token;
  }

  // OTP records live in the shared store (backend/ephemeralStore.ts) so send and verify may hit
  // different server instances. The code is stored hashed. The send rate limit is shared
  // the same way (below).
  const OTP_TTL_MS = 5 * 60 * 1000;
  // prevHashes (session 23): the last two codes sent to this address stay valid until THEIR own
  // expiry. A re-send (auto-send on screen open, then Resend / coming back) used to kill the
  // earlier code at once, so typing the code from the email the user opened first said
  // "Incorrect". The attempt limit still covers all of them together.
  type OtpRecord = { codeHash: string; expiresAt: number; attempts?: number; signUserId?: string; prevHashes?: { h: string; exp: number }[] };
  const otpKey = (k: string) => `otp:${String(k).trim().toLowerCase()}`;
  const otpStore = {
    get: async (k: string): Promise<OtpRecord | null> => ephemeralGet(otpKey(k)),
    set: async (k: string, r: OtpRecord) => ephemeralSet(otpKey(k), r, Math.max(1000, r.expiresAt - Date.now())),
    delete: async (k: string) => ephemeralDelete(otpKey(k)),
  };
  // Send rate limit, shared across instances too (session 22): 30 s between codes, 5 per 10 min.
  const SEND_WINDOW_MS = 10 * 60 * 1000;
  const otpSendLog = {
    get: async (k: string): Promise<number[]> => (await ephemeralGet(`otpsend:${String(k).trim().toLowerCase()}`)) || [],
    set: async (k: string, v: number[]) => ephemeralSet(`otpsend:${String(k).trim().toLowerCase()}`, v, SEND_WINDOW_MS),
  };

  // Social Verification Endpoint (Fix 9)
  app.post("/api/auth/social-verify", async (req, res) => {
    try {
      const { platform, authCode, handle } = req.body || {};
      if (!platform) {
        return res.status(400).json({ success: false, message: "Platform parameter is required." });
      }
      // v423 (S16): nothing is checked here (no OAuth), so the answer never says "verified" — the link is only saved.
      return res.json({
        success: true,
        verified: false,
        message: `${platform} link saved`,
        platform
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message || "Social verification failed" });
    }
  });

  app.delete("/api/auth/social-verify", async (req, res) => {
    try {
      const { platform } = req.body || {};
      return res.json({
        success: true,
        message: `${platform || 'Social account'} disconnected successfully`,
        platform
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message || "Social disconnect failed" });
    }
  });

  // Pincode Lookup Proxy Endpoint (Fix 10)
  app.get("/api/utils/pincode/:pin", async (req, res) => {
    try {
      const { pin } = req.params;
      if (!pin || pin.length !== 6) {
        return res.status(400).json({ success: false, message: "Invalid pincode" });
      }
      const response = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
      const data: any = await response.json();
      if (Array.isArray(data) && data[0]?.Status === "Success" && data[0]?.PostOffice?.length > 0) {
        const postOffice = data[0].PostOffice[0];
        return res.json({
          success: true,
          city: postOffice.District,
          state: postOffice.State
        });
      }
      return res.status(404).json({ success: false, message: "Invalid pincode" });
    } catch (err: any) {
      console.error("Pincode lookup error:", err);
      return res.status(500).json({ success: false, message: "Pincode lookup failed" });
    }
  });

  const normalizeOtpKey = (val: string): string => {
    const s = String(val || "").trim();
    if (s.includes("@")) return s.toLowerCase();
    const digits = s.replace(/\D/g, "");
    if (digits.length >= 10) return digits.slice(-10); // match last 10 digits for phone
    return s;
  };

  // Which email the contract modal should use for the signing code (session 27).
  app.get("/api/contract/signing-email", async (req, res) => {
    const user = await parseAuthUser(req).catch(() => null);
    if (!user) return res.status(401).json({ detail: "Not authenticated" });
    const r = await resolveSigningEmails(user, { client: privilegedSupabase || supabase, getDb });
    return res.json({ email: r.preferred, allowed: r.allowed });
  });

  // v423 (S2): per-IP and whole-server limits on sending codes (the per-address limit alone let a script mail thousands
  // of different addresses from Ybex's domain). Memory only, per server copy — enough to stop a flood.
  const otpIpHits: Map<string, Array<number>> = new Map(); // per IP (memory, per server copy) — the per-address limit below is shared
  let otpGlobalHits: number[] = [];
  // the trusted IP: the LAST X-Forwarded-For hop (Google's front end / our Cloudflare Worker append it — a client can't fake it)
  const clientIp = (req: any) => String(authClientIp(req) || req.ip || "").trim() || "unknown";
  const maskContact = (v: any) => { const t = String(v || ""); const at = t.indexOf("@"); return at > 0 ? `${t.slice(0, 2)}***${t.slice(at)}` : t.replace(/\d(?=\d{2})/g, "*"); };
  const otpFlood = (req: any): string | null => {
    const now = Date.now();
    otpGlobalHits = otpGlobalHits.filter((t) => now - t < 10 * 60 * 1000);
    // whole-server volume is only LOGGED (a hard cap would let one script lock every real user out of login codes)
    if (otpGlobalHits.length === 300) console.warn("[OTP] 300 codes in 10 minutes on this server copy — check for abuse");
    const ip = clientIp(req);
    const hits = (otpIpHits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
    if (hits.filter((t) => now - t < 10 * 60 * 1000).length >= 8 || hits.length >= 20) return "Too many codes requested from this network. Please try again later.";
    hits.push(now); otpIpHits.set(ip, hits); otpGlobalHits.push(now);
    if (otpIpHits.size > 20000) otpIpHits.clear();
    return null;
  };

  // Send OTP
  app.post("/api/otp/send", async (req, res) => {
    try {
      const { target, type, value, purpose, brandName, creatorName, campaignTitle, dealAmount, amount, recipientName } = req.body;
      const actualTarget = target || type;
      if (!value) {
        return res.status(400).json({ detail: "Phone or email value is required." });
      }

      // A contract-signing code goes to the signer's OWN registered email and nowhere else.
      // This endpoint needs no login (signup uses it too), so it could previously send a
      // Ybex-branded "sign your contract" email, with brand name and amount taken from the
      // request, to any address.
      let contractSigner: any = null;
      if (purpose === 'contract_sign') {
        const signer = await parseAuthUser(req).catch(() => null);
        contractSigner = signer;
        if (!signer) return res.status(401).json({ detail: "Sign in to request a signing code." });
        const inputEmail = String(value).trim().toLowerCase();
        const { allowed } = await resolveSigningEmails(signer, { client: privilegedSupabase || supabase, getDb });
        if (!allowed.includes(inputEmail)) {
          return res.status(403).json({ detail: "The signing code can only be sent to your registered email address." });
        }
        // The login email is never changed here (before session 27 it was overwritten).
      }

      // Flood control: one code per destination every 30 seconds, five per ten minutes.
      const key = normalizeOtpKey(value);
      const nowMs = Date.now();
      const sends = (await otpSendLog.get(key)).filter((t: number) => nowMs - t < SEND_WINDOW_MS);
      if (sends.length > 0 && nowMs - sends[sends.length - 1] < 30 * 1000) {
        return res.status(429).json({ detail: "Please wait a few seconds before requesting another code." });
      }
      if (sends.length >= 5) {
        return res.status(429).json({ detail: "Too many codes requested. Please try again in a few minutes." });
      }
      // v423 (S2): per-IP limit, counted only for a request that would really send a code
      const flood = otpFlood(req);
      if (flood) return res.status(429).json({ detail: flood });
      sends.push(nowMs);
      await otpSendLog.set(key, sends);

      const code = crypto.randomInt(100000, 1000000).toString();
      const expiresAt = Date.now() + 5 * 60 * 1000;
      // A contract_sign code remembers WHO asked for it, so verifying it can mint a sign token
      // for that user only.
      const signUserId = purpose === 'contract_sign' && contractSigner ? String(contractSigner.user_id) : undefined;
      const previous = await otpStore.get(key).catch(() => null);
      const prevHashes = previous && Date.now() < previous.expiresAt && (previous.signUserId || undefined) === signUserId
        ? [...(previous.prevHashes || []), { h: previous.codeHash, exp: previous.expiresAt }]
            .filter((p) => Date.now() < p.exp)
            .slice(-2)
        : [];
      const otpRecord: OtpRecord = { codeHash: hashCode(key, code), expiresAt, attempts: previous?.attempts && prevHashes.length ? previous.attempts : 0, signUserId, prevHashes };
      await otpStore.set(key, otpRecord);
      
      // The code itself is only ever logged or returned in test mode.
      const exposeCode = resolveOtpEcho(process.env); // Session 43: not tied to payment test mode any more
      console.log(`[OTP] Generated and dispatched OTP for ${maskContact(value)}${exposeCode ? `: ${code}` : ''}`); // v423 (S2): no full email / phone in logs

      // The response used to say "OTP successfully sent" whether or not an email went out — no
      // API key, an unverified sender domain, a Resend error: the screen said "sent" and nothing
      // arrived. Now a failed send is reported as a failure (outside test mode, where the code
      // is returned so testing still works without email).
      let deliveryError = "";
      if (actualTarget === "email") {
        if (process.env.RESEND_API_KEY) {
          const resendClient = new Resend(process.env.RESEND_API_KEY);
          const fromEmail = process.env.RESEND_FROM_EMAIL || "Ybex <noreply@ybexmedia.in>";
          
          // Session 43 (Ravi): the code is first in the subject so it shows in the phone's email notification.
          let emailSubject = `${code} is your Ybex verification code`;
          let emailHtml = buildEmailHtml({
            greeting: "Hi there,",
            paragraphs: [
              "Here is your 6-digit verification code to confirm your contact details:",
              "<h1 style=\"font-size: 32px; letter-spacing: 4px; color: #4f46e5; background: #f3f4f6; padding: 12px 20px; display: inline-block; border-radius: 8px; margin: 0;\">" + code + "</h1>",
              "This code will expire in 5 minutes."
            ]
          });

          if (purpose === 'contract_sign') {
            emailSubject = `${code} is your Ybex contract signing code`;
            emailHtml = buildContractSignEmailHtml({
              code,
              recipientName: recipientName || req.body?.name,
              brandName: brandName || req.body?.brand_name,
              creatorName: creatorName || req.body?.creator_name,
              campaignTitle: campaignTitle || req.body?.title || req.body?.campaign_title,
              dealAmount: dealAmount || amount || req.body?.budget
            });
          }

          try {
            const sendResult = await resendClient.emails.send({
              from: fromEmail,
              to: value.trim(),
              subject: emailSubject,
              html: emailHtml
            });
            if (sendResult?.error) {
              console.error("[OTP Send Error via Resend]:", JSON.stringify(sendResult.error), "from:", fromEmail);
              deliveryError = "We couldn't send the email right now. Please try again in a minute.";
            } else {
              console.log(`[OTP Send Success via Resend]: Dispatched to ${maskContact(value)}`);
            }
          } catch (emailErr: any) {
            console.error("Failed to send OTP email via Resend:", emailErr?.message || emailErr);
            deliveryError = "We couldn't send the email right now. Please try again in a minute.";
          }
        } else {
          console.error("[OTP] RESEND_API_KEY is not set on this server — no email can be sent.");
          deliveryError = "Email service is not configured. Please contact support.";
        }
      } else if (actualTarget === "phone") {
        console.warn("No SMS provider integrated yet. OTP will not be delivered to phone.");
        deliveryError = "Phone verification is not available yet. Please use your email instead.";
      } else {
        deliveryError = "Choose email or phone for the code.";
      }

      if (deliveryError && !exposeCode) {
        // Nothing reached the user, so the code is useless — drop it and let them retry now.
        await otpStore.delete(key);
        await otpSendLog.set(key, sends.slice(0, -1));
        try { const ip = clientIp(req); const h = otpIpHits.get(ip); if (h && h.length) h.pop(); otpGlobalHits.pop(); } catch { /* best effort */ } // v423: a code that never went out doesn't count
        return res.status(502).json({ detail: deliveryError, error: "OTP_NOT_DELIVERED" }); // not `code`: that field carries the OTP in test mode
      }

      return res.json({
        ok: true,
        message: deliveryError ? `Test mode: ${deliveryError}` : `OTP successfully sent to ${value}`,
        // Returned to the caller only in test mode. It used to be returned whenever NODE_ENV was
        // not literally "production" or RESEND_API_KEY was missing — which made the code visible
        // to whoever requested it, i.e. no verification at all.
        code: exposeCode ? code : undefined
      });
    } catch (err: any) {
      console.error("Error in sending OTP:", err);
      return res.status(500).json({ detail: "Failed to send OTP securely." });
    }
  });

  // Verify OTP
  app.post("/api/otp/verify", async (req, res) => {
    try {
      const { value, code } = req.body;
      if (!value || !code) {
        return res.status(400).json({ detail: "Both value and code are required." });
      }
      const key = normalizeOtpKey(value);
      const record = await otpStore.get(key);
      if (!record) {
        return res.status(400).json({ detail: "No active verification request found. Please request a new OTP." });
      }
      if (Date.now() > record.expiresAt) {
        await otpStore.delete(key);
        return res.status(400).json({ detail: "OTP has expired. Please request a new OTP." });
      }
      const given = hashCode(key, String(code));
      const matchesEarlier = (record.prevHashes || []).some((p) => p.h === given && Date.now() < p.exp);
      if (record.codeHash !== hashCode(key, String(code)) && !matchesEarlier) {
        // Five wrong guesses and the code is dead. There was no limit before.
        record.attempts = (record.attempts || 0) + 1;
        if (record.attempts >= 5) {
          await otpStore.delete(key);
          return res.status(400).json({ detail: "Too many incorrect attempts. Please request a new OTP." });
        }
        await otpStore.set(key, record);
        return res.status(400).json({ detail: "Incorrect OTP code. Please try again." });
      }
      await otpStore.delete(key);
      // A verified contract code → a one-time sign token for the user who requested it. The
      // /sign routes require it; before, they never checked that any OTP had been verified.
      if (record.signUserId) {
        const verifier = await parseAuthUser(req).catch(() => null);
        if (verifier && String(verifier.user_id) === record.signUserId) {
          noteSignEmail(record.signUserId, String(value || "")); // session 28: kept with the signature record
          return res.json({ ok: true, message: "Verification successful!", sign_token: await issueSignToken(record.signUserId) });
        }
      }
      // v423 (S1): a signed-in user who just proved this email may now save it as their business / POC email (once, 30 min).
      try {
        const verifier = await parseAuthUser(req).catch(() => null);
        if (verifier?.user_id && String(value).includes("@")) await rememberContactProof(String(verifier.user_id), String(value));
      } catch (e: any) { logIgnored("session_routes:contact-proof", e); }
      return res.json({ ok: true, message: "Verification successful!" });
    } catch (err: any) {
      console.error("Error in verifying OTP:", err);
      return res.status(500).json({ detail: "Failed to verify OTP securely." });
    }
  });

  // Retrieve user sessions handler
  const getSessionsHandler = async (req: any, res: any) => {
    try {
      const user = await parseAuthUser(req);
      if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
      const currentToken = getSessionToken(req);
      const currentUA = (req.headers["user-agent"] as string) || "";
      const currentDeviceName = parseDeviceName(currentUA);
      const clientIp = (req.headers["x-forwarded-for"] as string) || req.socket?.remoteAddress || "127.0.0.1";

      const db = getDb();
      if (!db.user_sessions) db.user_sessions = [];

      let supabaseSessions: any[] = [];
      if (supabase) {
        // Session 58: the raw rows used to be returned as-is (every device's real login token, expired ones too, and
        // no "current" flag — so the phone in use showed under "Other sessions"). Now shaped below; expired skipped.
        const { data, error } = await supabase
          .from("user_sessions")
          .select("session_id, session_token, created_at, expires_at")
          .eq("user_id", user.user_id);
        if (!error && data) supabaseSessions = data.filter((r: any) => !r.expires_at || Date.parse(r.expires_at) > Date.now());
      }

      const userDbSessions = db.user_sessions.filter((s: any) => s.user_id === user.user_id);
      const combined = [...supabaseSessions, ...userDbSessions];

      const sessionMap = new Map<string, any>();
      for (const s of combined) {
        const tok = s.session_token;
        if (!tok) continue;
        const devName = s.device_name || s.device || parseDeviceName(s.user_agent) || "Web Device";
        sessionMap.set(tok, {
          session_token: tok,
          device: devName,
          device_name: devName,
          ip_address: s.ip_address || clientIp,
          location: s.location || "India",
          last_active: s.last_active || s.last_active_at || s.created_at || new Date().toISOString(),
          created_at: s.created_at || new Date().toISOString(),
          isCurrent: tok === currentToken || Boolean(currentToken && tok === currentToken)
        });
      }

      // If current session is not in map, add it dynamically
      if (currentToken && !sessionMap.has(currentToken)) {
        const newCurrSess = {
          user_id: user.user_id,
          session_token: currentToken,
          device: currentDeviceName,
          device_name: currentDeviceName,
          user_agent: currentUA,
          ip_address: clientIp,
          location: "India",
          last_active: new Date().toISOString(),
          created_at: new Date().toISOString(),
          isCurrent: true
        };
        db.user_sessions.push(newCurrSess);
        saveDb(db);
        if (supabase) {
          try {
            await (privilegedSupabase || supabase).from("user_sessions").insert(newCurrSess);
          } catch (e: any) { logIgnored("session_routes:387", e); }
        }
        sessionMap.set(currentToken, newCurrSess);
      }

      // If map is still empty, fallback to current user agent
      if (sessionMap.size === 0) {
        const dummyToken = currentToken || "curr_token";
        sessionMap.set(dummyToken, {
          session_token: dummyToken,
          device: currentDeviceName,
          device_name: currentDeviceName,
          ip_address: clientIp,
          location: "India",
          last_active: new Date().toISOString(),
          created_at: new Date().toISOString(),
          isCurrent: true
        });
      }

      // Session 58: other devices' tokens never leave the server — they are addressed by "sid:<session_id>".
      const result = Array.from(sessionMap.values()).map((x: any) => {
        if (x.isCurrent) return { ...x, session_token: "current" };
        const sid = combined.find((r: any) => r.session_token === x.session_token)?.session_id;
        return { ...x, session_token: sid ? `sid:${sid}` : "", user_agent: undefined, user_id: undefined };
      });
      result.sort((a, b) => {
        if (a.isCurrent) return -1;
        if (b.isCurrent) return 1;
        return new Date(b.last_active).getTime() - new Date(a.last_active).getTime();
      });

      return res.json(result);
    } catch (err: any) {
      console.error("Error in sessions list:", err);
      return res.status(500).json({ detail: "Server error" });
    }
  };

  router.get("/sessions", getSessionsHandler);

  // Logout session
  const logoutSessionHandler = async (req: any, res: any) => {
    try {
      const user = await parseAuthUser(req);
      if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
      let tokenToTerminate = String(req.params.token || "");
      // Session 58: the list sends "sid:<session_id>" instead of real tokens; "current" = this device.
      if (tokenToTerminate === "current") tokenToTerminate = getSessionToken(req);
      if (tokenToTerminate.startsWith("sid:") && supabase) {
        const { data: row } = await supabase.from("user_sessions").select("session_token").eq("session_id", tokenToTerminate.slice(4)).eq("user_id", user.user_id).maybeSingle();
        tokenToTerminate = row?.session_token || "";
      }
      if (!tokenToTerminate) return res.status(404).json({ detail: "That session has already ended." });
      // v423 (S8): only THIS user's sessions are touched — the local store and the auth cache too (before, any token
      // given here was dropped from them, so someone holding another person's token could log that person out).
      let owned = tokenToTerminate === getSessionToken(req);
      if (supabase) {
        const { data: gone } = await supabase
          .from("user_sessions")
          .delete()
          .eq("session_token", tokenToTerminate)
          .eq("user_id", user.user_id)
          .select("session_token");
        if (Array.isArray(gone) && gone.length) owned = true;
      }
      const db = getDb();
      if (db.user_sessions) {
        const before = db.user_sessions.length;
        db.user_sessions = db.user_sessions.filter((s: any) => !(s.session_token === tokenToTerminate && s.user_id === user.user_id));
        if (db.user_sessions.length !== before) { owned = true; saveDb(db); }
      }
      if (owned) req.app?.get?.("authLookup")?.forgetToken(tokenToTerminate); // session 23: no cached reuse
      return res.json({ ok: true, message: "Device session logged out successfully." });
    } catch (err: any) {
      console.error("Error terminating session:", err);
      return res.status(500).json({ detail: "Server error" });
    }
  };

  router.post("/sessions/logout/:token", logoutSessionHandler);

  // Logout other sessions
  const logoutOthersHandler = async (req: any, res: any) => {
    try {
      const user = await parseAuthUser(req);
      if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
      const currentToken = getSessionToken(req);
      if (supabase && currentToken) {
        await supabase
          .from("user_sessions")
          .delete()
          .eq("user_id", user.user_id)
          .neq("session_token", currentToken);
      }
      const db = getDb();
      if (db.user_sessions) {
        db.user_sessions = db.user_sessions.filter((s: any) => s.user_id !== user.user_id || s.session_token === currentToken);
        saveDb(db);
      }
      req.app?.get?.("authLookup")?.forgetAll(); // session 23: other devices' tokens stop at once here
      return res.json({ ok: true, message: "Logged out of all other sessions." });
    } catch (err: any) {
      console.error("Error terminating other sessions:", err);
      return res.status(500).json({ detail: "Server error" });
    }
  };

  router.post("/sessions/logout-others", logoutOthersHandler);

}
