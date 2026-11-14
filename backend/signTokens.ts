// Session 21. Signing a contract requires a verified email OTP — on the server.
//
// Before: /sign accepted any logged-in party. The chat screens asked for an email OTP but the
// server never checked it had been verified; the /collabs signing modal generated its "OTP" in
// the browser and showed it in a toast; other screens signed with a typed name only.
//
// Now: /otp/verify, for a contract_sign code, issues a one-time sign token bound to the user.
// Every /sign route requires it (consumed on use, 10 minutes).
// Session 22: tokens live in the shared store (backend/ephemeralStore.ts), so a token issued by
// one Cloud Run instance works on another, exactly once.

import crypto from "crypto";
import { ephemeralSet, ephemeralTake, _resetEphemeral } from "./ephemeralStore";

const TTL_MS = 10 * 60 * 1000;
const k = (token: string) => `sign:${crypto.createHash("sha256").update(token).digest("hex")}`;

// Session 28: a token also remembers WHICH email was verified and WHEN (agreement record,
// backend/agreementRecord.ts). /otp/verify notes the email just before issuing; a sign route
// reads the details right after consuming the token (takeLastSignMeta).
const pendingEmail = new Map<string, string>();
const lastMeta = new Map<string, { email: string | null; verifiedAt: string | null; at: number }>();

export function noteSignEmail(userId: string, email: string) {
  if (userId && email) pendingEmail.set(String(userId), String(email).trim().toLowerCase());
}

export async function issueSignToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(24).toString("hex");
  const email = pendingEmail.get(String(userId)) || null;
  pendingEmail.delete(String(userId));
  await ephemeralSet(k(token), { userId: String(userId), email, verifiedAt: new Date().toISOString() }, TTL_MS);
  return token;
}

/** True once for a valid, unexpired token issued to this user; the token is then gone. */
export async function consumeSignToken(userId: string, token: any): Promise<boolean> {
  const t = String(token || "");
  if (!t) return false;
  const rec = await ephemeralTake(k(t));
  const ok = !!rec && rec.userId === String(userId);
  if (ok) lastMeta.set(String(userId), { email: rec.email || null, verifiedAt: rec.verifiedAt || new Date().toISOString(), at: Date.now() });
  return ok;
}

/** Email + verified time of the token this user consumed just now (then forgotten). */
export function takeLastSignMeta(userId: string): { email: string | null; verifiedAt: string | null } | null {
  const m = lastMeta.get(String(userId));
  lastMeta.delete(String(userId));
  if (!m || Date.now() - m.at > 60_000) return null;
  return { email: m.email, verifiedAt: m.verifiedAt };
}

/** The 403 every /sign route returns without a valid token. */
export function signOtpRequired(res: any) {
  return res.status(403).json({
    error: "SIGN_OTP_REQUIRED",
    code: "SIGN_OTP_REQUIRED",
    detail: "Verify the code sent to your registered email before signing."
  });
}

/** Test hook. */
export function _resetSignTokens() {
  _resetEphemeral();
}
