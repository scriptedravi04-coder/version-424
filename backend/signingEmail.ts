// Session 27. Which email a contract-signing code may go to.
//
// A brand signs with the verified POC business email from Settings (brand_profiles.poc_email /
// email) when there is one, else the login email. A creator signs with the login email, or the
// business email on the creator profile. Supabase is read first because the local store is empty
// after a Cloud Run restart. Signing NEVER changes the login email (it used to).

import { isBrandLike } from "./roleGuards";

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

export type SigningEmails = { preferred: string; allowed: string[] };

export async function resolveSigningEmails(
  user: any,
  { client, getDb }: { client: any; getDb: () => any }
): Promise<SigningEmails> {
  const uid = String(user?.user_id || "");
  const login = norm(user?.email);
  const db = getDb() || {};
  let bp: any = (db.brand_profiles || []).find((b: any) => b.user_id === uid) || null;
  if (client && uid) {
    const b = await client.from("brand_profiles").select("*").eq("user_id", uid).maybeSingle().then((r: any) => r?.data, () => null);
    if (b) bp = { ...(bp || {}), ...b };
  }
  const isBrand = isBrandLike(user?.role); // v423 (E2): agency / talent manager sign with their POC email too, like a brand
  const brandPoc = norm(bp?.poc_email) || norm(bp?.email);
  const preferred = (isBrand ? brandPoc : "") || login || (isBrand ? brandPoc : "");
  // v423 (QA, same hole as S1 on the creator side): a creator's business / profile email is saved WITHOUT a code
  // (mobile contact screen), so it can't receive signing codes — a creator signs with the login email. A brand's POC email
  // can, because saving a new one now needs a server-checked code (backend/contactProof.ts).
  const allowed = Array.from(new Set([
    login, ...(isBrand ? [norm(bp?.poc_email), norm(bp?.email)] : []),
  ].filter((e) => e && e.includes("@"))));
  return { preferred, allowed };
}
