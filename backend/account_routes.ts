import express from "express";
import bcrypt from "bcryptjs";
import { Resend, buildEmailHtml, getValidFromEmail } from "./helpers";
import { issueLoginOtp, checkLoginOtp, LOGIN_OTP_MESSAGES } from "./loginOtp";
import { activeMoney, heldDealIds } from "./accountWipe";

// Session 43 (Ravi): Settings → Account. Login details (phone change instant, email change via OTP),
// and self-serve account deletion (Play Store requirement). Payment / invoice records are kept
// (the `transactions` table is never touched here); deletion is a soft-delete (is_deleted) that hides
// the account and blocks login, exactly like the admin "bin". The 30-day auto-purge + self-serve
// recovery need a `users.deletion_requested_at` column + a scheduled job — see docs/database/PENDING_DB_CHANGES.md.
// This endpoint best-effort stamps that column so it is ready the moment it exists.

const PHONE_OK = (p: string) => /^[6-9]\d{9}$/.test(String(p || "").replace(/\D/g, ""));
const EMAIL_OK = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());

export function setupAccountRoutes(
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
  const db = () => privilegedSupabase || supabase;

  const me = async (req: express.Request, res: express.Response) => {
    const user = await parseAuthUser(req);
    if (!user) { res.status(403).json({ detail: "Not authenticated" }); return null; }
    return user;
  };

  // Session 58 (bug hunt): returns false when the database refused the change (it used to be ignored, so a failed
  // email change still said "Email updated").
  const updateUserEverywhere = async (uid: string, patch: Record<string, any>): Promise<boolean> => {
    const client = db();
    let ok = true;
    if (client) {
      try {
        const { error } = await client.from("users").update(patch).eq("user_id", uid);
        if (error) { ok = false; console.warn("[account] users update failed", error.message || error); }
      } catch (e) { ok = false; console.warn("[account] users update notice", e); }
    }
    const local = getDb();
    if (ok && local?.users) {
      const u = local.users.find((x: any) => x.user_id === uid);
      if (u) { Object.assign(u, patch); saveDb(local); }
    }
    return ok;
  };

  // v388 (QA: WhatsApp-only accounts have a made-up address `phone-91XXXXXXXXXX@ybex.io`; password / delete codes were "sent" to it and the
  // person was stuck for ever): such an account must add a real email first (Settings → Email, which does not need a code to the old one).
  const PLACEHOLDER_EMAIL = /^phone-\d{6,15}@ybex\.io$/i;
  const NEEDS_EMAIL = { detail: "Add your email first (Settings → Email) — we send this code by email.", code: "ADD_EMAIL_FIRST" };
  // Returns false when the mail could not be sent (v388: the screen used to say "code sent" anyway).
  const sendOtpEmail = async (to: string, code: string, subject: string, line: string): Promise<boolean> => {
    if (!process.env.RESEND_API_KEY) { console.warn("[account] RESEND_API_KEY not set — OTP only in logs"); return true; }
    try {
      const resendClient = new Resend(process.env.RESEND_API_KEY);
      await resendClient.emails.send({
        from: getValidFromEmail(process.env.RESEND_FROM_EMAIL || "Ybex <noreply@ybexmedia.in>"),
        to,
        subject,
        html: buildEmailHtml({
          greeting: "Hi there,",
          paragraphs: [
            line,
            '<h1 style="font-size:32px;letter-spacing:4px;color:#7C3AED;background:#f3f4f6;padding:12px 20px;display:inline-block;border-radius:8px;margin:0;">' + code + "</h1>",
            "It works for 10 minutes. If this wasn't you, you can ignore this email.",
          ],
        }),
      });
      return true;
    } catch (e: any) {
      console.error("[account] OTP email failed:", e?.message || e);
      return false;
    }
  };
  const OTP_SEND_FAILED = { detail: "We couldn't send the code right now. Please try again in a minute.", code: "OTP_SEND_FAILED" };

  // Session 58: sign out the user's other devices (the token of this request stays valid).
  const endOtherSessions = async (req: express.Request, uid: string) => {
    const h = String(req.headers.authorization || "");
    const current = h.startsWith("Bearer ") ? h.slice(7) : ((String(req.headers.cookie || "").match(/session_token=([^;]+)/) || [])[1] || "");
    const client = db();
    try {
      if (client) {
        let q = client.from("user_sessions").delete().eq("user_id", uid);
        if (current) q = q.neq("session_token", current);
        await q;
      }
      const local = getDb();
      if (local?.user_sessions) { local.user_sessions = local.user_sessions.filter((x: any) => x.user_id !== uid || (current && x.session_token === current)); saveDb(local); }
    } catch (e) { console.warn("[account] end other sessions notice", e); }
    (req.app as any)?.get?.("authLookup")?.forgetAll();
  };

  // Money still in flight (held / paid-but-unfinished) that must be settled before deleting.
  const activeMoneyFor = async (uid: string): Promise<string[]> => {
    const client = db();
    if (!client) return [];
    try {
      // Session 58: deals has no brand_user_id / creator_user_id / payment_status columns — the old filter errored,
      // so every deal was skipped and an account with money on hold could be deleted. The deal's payment state now
      // comes from heldDealIds (read-only).
      const [{ data: deals, error: dErr }, { data: orders, error: oErr }] = await Promise.all([
        client.from("deals").select("id, status, escrow_hold, escrow_hold_at").or(`creator_id.eq.${uid},brand_id.eq.${uid}`),
        client.from("ugc_orders").select("*").or(`creator_id.eq.${uid},brand_id.eq.${uid}`),
      ]);
      if (dErr || oErr) return ["We couldn't check your payments right now — please try again in a minute."];
      const ids = (deals || []).map((d: any) => d.id).filter(Boolean);
      const paidDeals = await heldDealIds(client, ids);
      if (!paidDeals) return ["We couldn't check your payments right now — please try again in a minute."];
      const withPay = (deals || []).map((d: any) => (paidDeals.has(String(d.id)) ? { ...d, payment_status: "PAID" } : d));
      return activeMoney(withPay, orders || []);
    } catch (e) {
      console.warn("[account] active-money check notice", e);
      return []; // cannot check → do not hard-block (Play requires deletion to be possible)
    }
  };

  // ---- Login details -------------------------------------------------------
  router.get("/account/overview", async (req, res) => {
    const user = await me(req, res); if (!user) return;
    res.json({
      email: user.email || "",
      phone: user.phone || "",
      email_verified: Boolean(user.verified || user.email_verified),
      role: user.role || "",
    });
  });

  // Phone — instant, no OTP (phone is not used for login or sign-in codes).
  router.post("/account/phone", async (req, res) => {
    const user = await me(req, res); if (!user) return;
    const phone = String(req.body?.phone || "").replace(/\D/g, "");
    if (!PHONE_OK(phone)) return res.status(400).json({ detail: "Enter a valid 10-digit mobile number." });
    if (!(await updateUserEverywhere(user.user_id, { phone }))) return res.status(502).json({ detail: "Couldn't save your number right now. Please try again." });
    res.json({ success: true, phone });
  });

  // Email change — prove the NEW address with an OTP sent to it.
  router.post("/account/email/send-otp", async (req, res) => {
    const user = await me(req, res); if (!user) return;
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!EMAIL_OK(email)) return res.status(400).json({ detail: "Enter a valid email address." });
    if (email === String(user.email || "").trim().toLowerCase()) return res.status(400).json({ detail: "That is already your email." });
    try {
      const { data: taken } = await db().from("users").select("user_id").ilike("email", String(email).replace(/[\\%_]/g, (m: string) => "\\" + m)).neq("user_id", user.user_id).limit(1);
      if (taken && taken.length) return res.status(409).json({ detail: "That email is already used by another account." });
    } catch (e) { console.warn("[account] email-taken check notice", e); }
    const issued = await issueLoginOtp(email);
    if (!issued.ok) return res.status(429).json({ detail: "Too many codes asked. Please wait 15 minutes." });
    if (!(await sendOtpEmail(email, issued.code, `${issued.code} is your Ybex email-change code`, "Use this code to confirm your new Ybex email:"))) return res.status(502).json(OTP_SEND_FAILED);
    res.json({ success: true });
  });

  router.post("/account/email/verify", async (req, res) => {
    const user = await me(req, res); if (!user) return;
    const email = String(req.body?.email || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();
    if (!EMAIL_OK(email) || !otp) return res.status(400).json({ detail: "Email and code are required." });
    const chk = await checkLoginOtp(email, otp);
    if (chk !== "ok") return res.status(400).json({ detail: LOGIN_OTP_MESSAGES[chk] || "That code didn't work." });
    try {
      const { data: taken } = await db().from("users").select("user_id").ilike("email", String(email).replace(/[\\%_]/g, (m: string) => "\\" + m)).neq("user_id", user.user_id).limit(1);
      if (taken && taken.length) return res.status(409).json({ detail: "That email is already used by another account." });
    } catch (e) { console.warn("[account] email-taken check notice", e); }
    // Session 58: `email_verified` is not a column — it made the whole update fail. `verified` is the email flag.
    const saved = await updateUserEverywhere(user.user_id, { email, verified: true });
    if (!saved) return res.status(502).json({ detail: "Couldn't change your email right now. Please try again." });
    res.json({ success: true, email });
  });

  // ---- Delete account ------------------------------------------------------
  router.get("/account/delete/preflight", async (req, res) => {
    const user = await me(req, res); if (!user) return;
    const reasons = await activeMoneyFor(user.user_id);
    res.json({ blocked: reasons.length > 0, reasons });
  });

  // v291 (Ravi): set or change the password from Settings. People who signed in with codes / Google never
  // made one. An emailed code proves it is them, so this works even when no old password is known.
  router.post("/account/password/send-otp", async (req, res) => {
    const user = await me(req, res); if (!user) return;
    const email = String(user.email || "").trim().toLowerCase();
    if (PLACEHOLDER_EMAIL.test(email)) return res.status(400).json(NEEDS_EMAIL);
    if (!EMAIL_OK(email)) return res.status(400).json({ detail: "Your account has no email to send a code to. Please contact support." });
    const issued = await issueLoginOtp(email);
    if (!issued.ok) return res.status(429).json({ detail: "Too many codes asked. Please wait 15 minutes." });
    if (!(await sendOtpEmail(email, issued.code, `${issued.code} is your Ybex password code`, "Use this code to set a new password for your Ybex account:"))) return res.status(502).json(OTP_SEND_FAILED);
    res.json({ success: true });
  });

  router.post("/account/password/set", async (req, res) => {
    const user = await me(req, res); if (!user) return;
    const otp = String(req.body?.otp || "").trim();
    const pw = String(req.body?.new_password || "");
    const email = String(user.email || "").trim().toLowerCase();
    if (!otp) return res.status(400).json({ detail: "Enter the code we emailed you." });
    if (pw.length < 8 || pw.length > 128) return res.status(400).json({ detail: "Password needs 8 to 128 characters." });
    if (pw.toLowerCase() === email) return res.status(400).json({ detail: "Password can't be your email." });
    const chk = await checkLoginOtp(email, otp);
    if (chk !== "ok") return res.status(400).json({ detail: LOGIN_OTP_MESSAGES[chk] || "That code didn't work." });
    const hash = await bcrypt.hash(pw, await bcrypt.genSalt(10));
    if (!(await updateUserEverywhere(user.user_id, { password_hash: hash }))) return res.status(502).json({ detail: "Couldn't save your password right now. Please try again." });
    // Session 58: a new password signs out every OTHER device (like reset-password does) — this one stays in.
    await endOtherSessions(req, user.user_id);
    res.json({ success: true });
  });

  router.post("/account/delete/send-otp", async (req, res) => {
    const user = await me(req, res); if (!user) return;
    const email = String(user.email || "").trim().toLowerCase();
    if (PLACEHOLDER_EMAIL.test(email)) return res.status(400).json(NEEDS_EMAIL);
    if (!EMAIL_OK(email)) return res.status(400).json({ detail: "Your account has no email to send a code to. Please contact support." });
    const issued = await issueLoginOtp(email);
    if (!issued.ok) return res.status(429).json({ detail: "Too many codes asked. Please wait 15 minutes." });
    if (!(await sendOtpEmail(email, issued.code, `${issued.code} is your Ybex account-deletion code`, "Use this code to confirm deleting your Ybex account:"))) return res.status(502).json(OTP_SEND_FAILED);
    res.json({ success: true });
  });

  router.post("/account/delete/confirm", async (req, res) => {
    const user = await me(req, res); if (!user) return;
    const otp = String(req.body?.otp || "").trim();
    const email = String(user.email || "").trim().toLowerCase();
    if (!otp) return res.status(400).json({ detail: "Enter the code we emailed you." });
    const chk = await checkLoginOtp(email, otp);
    if (chk !== "ok") return res.status(400).json({ detail: LOGIN_OTP_MESSAGES[chk] || "That code didn't work." });

    const reasons = await activeMoneyFor(user.user_id);
    if (reasons.length) return res.status(409).json({ detail: "Finish or cancel these first, then delete.", code: "ACTIVE_MONEY", reasons });

    const uid = user.user_id;
    const client = db();
    // Soft-delete: hide the account and block login (same flag the admin bin uses). Records kept.
    // Session 58: if the account wasn't actually marked deleted, say so (it used to report success and log out).
    if (!(await updateUserEverywhere(uid, { is_deleted: true }))) return res.status(502).json({ detail: "Couldn't delete your account right now. Please try again." });
    if (client) {
      for (const tbl of ["creator_profiles", "brand_profiles"]) {
        try { await client.from(tbl).update({ is_deleted: true }).eq("user_id", uid); } catch { /* table/column may not exist */ }
      }
      // Best-effort: stamp the deletion time so the future 30-day purge job + countdown can use it.
      try { await client.from("users").update({ deletion_requested_at: new Date().toISOString(), deletion_reason: "self_serve" }).eq("user_id", uid); } catch { /* column not added yet */ }
      // End every active session for this user.
      try { await client.from("user_sessions").delete().eq("user_id", uid); } catch { /* ignore */ }
    }
    const local = getDb();
    if (local?.user_sessions) { local.user_sessions = local.user_sessions.filter((s: any) => s.user_id !== uid); saveDb(local); }

    res.clearCookie?.("session_token");
    res.clearCookie?.("has_session");
    res.json({ success: true, grace_days: 30 });
  });
}
