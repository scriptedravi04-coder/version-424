import { isLiveServer } from "./liveServer"; // v376
// Session 43 (Ravi: "the email code is already filled in on the verify screen — app and website").
// The code was echoed to the browser whenever PAYMENT test mode was on, and payment test mode is
// on for every *.run.app deploy — so the live server handed out every signup / login / signing
// code. Anyone could type someone's email on "Continue with OTP" and log in.
// Now: an OTP is returned to the browser (or written to the logs) ONLY on a non-production server
// (local dev, tests, AI Studio preview). Payment test mode, APP_URL and Resend fallbacks no longer
// matter. `OTP_ECHO=off` turns it off even there.
export function resolveOtpEcho(env: Record<string, string | undefined> = process.env): boolean {
  const flag = String(env.OTP_ECHO || "").trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(flag)) return false;
  if (isLiveServer(env)) return false; // v376: never on the live server (local.env says NODE_ENV=development)
  return env.NODE_ENV !== "production";
}
