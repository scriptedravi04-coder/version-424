// v376 (live test, 24 Oct 2026): the live server answered /api/auth/demo-enabled → true, i.e. DEMO_LOGIN=true had been
// pasted into the live secrets (the Mac's local.env carries DEMO_LOGIN="true", PAYMENTS_TEST_MODE="true",
// NODE_ENV="development"). With demo logins on, the token "dev_bypass_admin" is a Super Admin with no password.
//
// Test-only switches now fail closed on the LIVE server, whatever the secrets say:
//   - demo / bypass logins (DEMO_LOGIN)
//   - showing OTP codes to the browser / logs (OTP_ECHO / NODE_ENV)
// "Live" = a live Razorpay key, or the app's address is the public site (ybexmedia.in) or its AI Studio host
// (ybexapp.ai.studio). YBEX_LIVE=true forces it on, YBEX_LIVE=false is ignored (it can't turn the guard off).

const LIVE_HOSTS = /(^|\/\/|\.)(ybexmedia\.in|ybexapp\.ai\.studio)(:\d+)?(\/|$)/i;

export function isLiveServer(env: Record<string, string | undefined> = process.env): boolean {
  if (["1", "true", "yes", "on"].includes(String(env.YBEX_LIVE || "").trim().toLowerCase())) return true;
  if (String(env.RAZORPAY_KEY_ID || "").trim().startsWith("rzp_live_")) return true;
  // v383 (Ravi 30 Oct: "Demo access (test server)" still showed on the live app): Cloud Run sets K_SERVICE. Our only
  // Cloud Run deploy is the live site (the Mac / local test server never has it), so treat it as live too.
  if (String(env.K_SERVICE || "").trim()) return true;
  return [env.APP_URL, env.SITE_URL, env.PUBLIC_SITE_URL, env.VITE_PUBLIC_SITE_URL].some((u) => LIVE_HOSTS.test(String(u || "").trim()));
}
