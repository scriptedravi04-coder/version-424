// v396 (QA S-11): when none of the real secrets is set, signing used a fixed word that anyone can read in the code
// ("ybex-oauth-state" …), so anyone could forge a signed value. Now a random secret made once per server start.
// (Live always has SUPABASE_SERVICE_ROLE_KEY / SESSION_SECRET, so this only matters on a half-set-up server.)
import crypto from "crypto";
let made = "";
export function fallbackSecret(): string {
  if (!made) {
    made = crypto.randomBytes(32).toString("hex");
    console.warn("[secrets] No OAUTH_STATE_SECRET / SESSION_SECRET / SUPABASE_SERVICE_ROLE_KEY — using a random one for this server start.");
  }
  return made;
}
