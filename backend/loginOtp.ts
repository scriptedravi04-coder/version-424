// Session 42 (Ravi): the app login — "Continue with OTP", password only as the second choice.
//
// A 6-digit code is mailed to the account's email. It lives in the shared ephemeral store
// (backend/ephemeralStore.ts → table ybex_ephemeral, already in Supabase), hashed, for 10 minutes.
// No new table. Limits: 3 codes per email per 15 minutes, 5 wrong tries kill the code.
// The code is checked inside POST /auth/login, so every account check that route makes
// (deleted / banned / suspended, team seats, session cookie) runs for OTP logins too.
import crypto from "crypto";
import { ephemeralGet, ephemeralSet, ephemeralDelete, hashCode } from "./ephemeralStore";

export const LOGIN_OTP_TTL_MS = 10 * 60 * 1000;
const SEND_WINDOW_MS = 15 * 60 * 1000;
const MAX_SENDS = 3;
const MAX_TRIES = 5;

const codeKey = (email: string) => `login_otp:${email}`;
const sendKey = (email: string) => `login_otp_sends:${email}`;
const clean = (email: string) => String(email || "").trim().toLowerCase();

export type IssueResult = { ok: true; code: string } | { ok: false; reason: "too_many" };

/** New code for this email (an older unused one stops working). */
export async function issueLoginOtp(emailIn: string): Promise<IssueResult> {
  const email = clean(emailIn);
  const now = Date.now();
  const sends: number[] = ((await ephemeralGet(sendKey(email))) || []).filter((t: number) => now - t < SEND_WINDOW_MS);
  if (sends.length >= MAX_SENDS) return { ok: false, reason: "too_many" };
  const code = crypto.randomInt(100000, 1000000).toString();
  await ephemeralSet(codeKey(email), { hash: hashCode("login_otp", code), tries: 0 }, LOGIN_OTP_TTL_MS);
  await ephemeralSet(sendKey(email), [...sends, now], SEND_WINDOW_MS);
  return { ok: true, code };
}

export type CheckResult = "ok" | "expired" | "wrong" | "locked";

/** One try at the code. "ok" uses it up. */
export async function checkLoginOtp(emailIn: string, codeIn: string): Promise<CheckResult> {
  const email = clean(emailIn);
  const entry = await ephemeralGet(codeKey(email));
  if (!entry || !entry.hash) return "expired";
  const given = hashCode("login_otp", String(codeIn || "").replace(/\D/g, ""));
  const a = Buffer.from(String(entry.hash));
  const b = Buffer.from(given);
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (match) {
    await ephemeralDelete(codeKey(email));
    return "ok";
  }
  const tries = Number(entry.tries || 0) + 1;
  if (tries >= MAX_TRIES) {
    await ephemeralDelete(codeKey(email));
    return "locked";
  }
  await ephemeralSet(codeKey(email), { ...entry, tries }, LOGIN_OTP_TTL_MS);
  return "wrong";
}

export const LOGIN_OTP_MESSAGES: Record<Exclude<CheckResult, "ok">, string> = {
  expired: "This code has expired. Tap \"Resend code\" to get a new one.",
  wrong: "That code is not right. Please check the email and try again.",
  locked: "Too many wrong tries. Tap \"Resend code\" to get a new one.",
};

// "Does this email have an account?" — asked by the app's single email box. Limited per IP so the
// box cannot be used to test thousands of emails.
const checks = new Map<string, number[]>();
export function emailCheckAllowed(ip: string, now = Date.now()): boolean {
  const key = ip || "unknown";
  const recent = (checks.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (recent.length >= 30) { checks.set(key, recent); return false; }
  recent.push(now);
  checks.set(key, recent);
  if (checks.size > 5000) checks.delete(checks.keys().next().value as string);
  return true;
}
