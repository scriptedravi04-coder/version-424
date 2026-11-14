import { logIgnored } from "./logIgnored";

// v357 (Ravi: "jo register karte hain wo pehle waitlist mein jaayein, approve ke baad hi Explore pe"):
// creator_profiles.profile_status defaults to "approved" in the database, and the (locked) POST /creators/profile
// creates a new creator's row without a status — so every sign-up looked approved. This guard runs in front of
// that route: when the creator has NO profile row yet, the row it creates is set to "under_review" right after the
// save. Nothing else of that route changes. Reading side: backend/exploreGate.ts approvedByAdmin.
export function setupCreatorReviewGate(router: any, deps: { supabase: any; privilegedSupabase: any; getDb: () => any; parseAuthUser: (req: any) => Promise<any> }) {
  const db = () => deps.privilegedSupabase || deps.supabase;

  // v378 (Ravi: "PAN card mangta hai" — QA L8 for creators): creator KYC checks the PAN / IFSC / GSTIN format before
  // the (locked) KYC submit route saves it. Runs in front of both KYC submit paths.
  const kycFormatGuard = (req: any, res: any, next: any) => {
    const b = req.body || {};
    const pan = String(b.panNumber || b.creator_pan || b.identity_num || "").trim().toUpperCase();
    if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return res.status(400).json({ detail: "PAN should look like ABCDE1234F (10 characters).", error: "PAN should look like ABCDE1234F (10 characters).", code: "BAD_PAN" });
    const ifsc = String(b.ifsc || b.bankIfsc || b.bank_ifsc || b.ifscCode || "").trim().toUpperCase();
    if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return res.status(400).json({ detail: "IFSC should be 11 characters, like SBIN0001234.", error: "IFSC should be 11 characters, like SBIN0001234.", code: "BAD_IFSC" });
    const gst = String(b.gstin || "").trim().toUpperCase();
    if (gst && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gst)) return res.status(400).json({ detail: "GSTIN should be 15 characters, like 22ABCDE1234F1Z5.", error: "GSTIN should be 15 characters, like 22ABCDE1234F1Z5.", code: "BAD_GSTIN" });
    return next();
  };
  router.post("/creator/kyc/submit", kycFormatGuard);
  router.post("/verifications/creator", kycFormatGuard);

  router.post("/creators/profile", async (req: any, res: any, next: any) => {
    try {
      const user = await deps.parseAuthUser(req).catch(() => null);
      if (!user || String(user.role || "").toLowerCase() !== "creator" || !db()) return next();
      const { data: existing } = await db().from("creator_profiles").select("user_id").eq("user_id", user.user_id).maybeSingle();
      if (existing) return next();
      res.on("finish", () => {
        if (res.statusCode >= 400) return;
        markUnderReview(db(), deps.getDb, user.user_id).catch((e: any) => logIgnored("creatorReviewGate:finish", e));
      });
    } catch (e) { logIgnored("creatorReviewGate", e); }
    return next();
  });
}

/** A brand-new self-registered profile → "under_review" (never touches a profile an admin already reviewed). */
export async function markUnderReview(client: any, getDb: () => any, userId: string) {
  if (client) {
    await client.from("creator_profiles").update({ profile_status: "under_review" })
      .eq("user_id", userId).eq("profile_status", "approved").is("reviewed_at", null);
  }
  const local = getDb?.()?.creator_profiles;
  if (Array.isArray(local)) {
    const row = local.find((c: any) => String(c.user_id) === String(userId));
    if (row && row.profile_status === "approved" && !row.reviewed_at) row.profile_status = "under_review";
  }
}
