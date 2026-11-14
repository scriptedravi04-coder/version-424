// v423 (security S1): a brand's POC / business email is also an address contract-signing codes may go to
// (backend/signingEmail.ts). It used to be checked with an OTP only in the browser — the API saved any email.
// Now a successful /api/otp/verify by a signed-in user leaves a one-time proof here (30 min), and
// POST /brands/profile only accepts a NEW email when it can take that proof.
import { ephemeralSet, ephemeralTake } from "./ephemeralStore";

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
export const CONTACT_PROOF_TTL_MS = 30 * 60 * 1000;
export const contactProofKey = (userId: string, email: string) => `contactok:${String(userId)}:${norm(email)}`;

export async function rememberContactProof(userId: string, email: string): Promise<void> {
  if (!userId || !norm(email).includes("@")) return;
  await ephemeralSet(contactProofKey(userId, email), { at: Date.now() }, CONTACT_PROOF_TTL_MS);
}

/** true once per verified (user, email) pair. */
export async function takeContactProof(userId: string, email: string): Promise<boolean> {
  if (!userId || !norm(email)) return false;
  return Boolean(await ephemeralTake(contactProofKey(userId, email)).catch(() => null));
}

/** Does saving `next` as the brand's email need a proof? Not when it is unchanged or is the login email. Pure. */
export function emailChangeNeedsProof(next: unknown, current: unknown, loginEmail: unknown): boolean {
  const n = norm(next);
  if (!n) return false;
  return n !== norm(current) && n !== norm(loginEmail);
}
