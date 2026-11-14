// Session 34 (Ravi): public creator application ("Apply as a creator", /apply).
//
// Flow: the form ONLY creates a waitlist row (status Pending). Nothing goes to Explore and no
// creator profile is created or changed here. The admin approves (→ one unclaimed profile on
// Explore + approval email) or rejects (→ email with the reason) in admin_waitlist_routes.ts.
// Only the admin can edit an application. No spam limit on purpose (ads are running; the team
// checks by hand), but every row is validated and the save is real: if the database write fails
// the person sees an error, never a fake "submitted".
import crypto from "crypto";
import { audienceEstimate } from "../src/utils/audienceEstimate";
import { shrinkPhoto } from "./imageResize";
import { publicSiteUrl } from "./siteUrl"; // v388

// Session 35: the real Supabase columns (checked against the live tables, 7 Oct 2026). Supabase
// refuses a whole insert / upsert when one key is not a column, so every write below sends only
// these. The local cache copy may keep extra keys (pricing, handle …) for older screens.
import { getMinFollowers } from "./followerMin";
// v397: same source name as backend/followerGate.ts (kept here so the two files do not import each other)
const LOW_FOLLOWERS_SOURCE = "low_followers_work";

export const WAITLIST_COLUMNS = ["id", "name", "email", "role", "status", "reject_reason", "panel_message", "created_at",
  "social_handle", "followers", "city", "gender", "instagram_link", "mobile", "avg_reach", "charges", "niche",
  "collab_types", "ugc_rating", "sample_links", "notes", "profile_photo_url", "source", "is_registered_user",
  "linked_user_id", "terms_accepted_at",
  // v363: Instagram numbers fetched by Admin → "Fetch Instagram for everyone" (columns added 21 Oct 2026)
  "ig_followers", "instagram_stats", "instagram_synced_at", "instagram_fetch_error"];
export const USERS_COLUMNS = ["user_id", "email", "name", "password_hash", "role", "picture", "auth_method", "onboarded",
  "verified", "parent_brand_id", "team_role", "created_at", "banned", "is_deleted", "phone", "missed_deadlines_count",
  "whatsapp_opt_in"];
export const CREATOR_PROFILE_COLUMNS = ["user_id", "name", "email", "picture", "photo", "bio", "category", "sub_categories",
  "city", "state", "languages", "gender", "instagram", "youtube", "twitter", "linkedin", "followers_instagram",
  "followers_youtube", "rate_card", "barter", "payment_terms", "portfolio", "past_brands", "creator_type", "work_mode",
  "engagement_rate", "fake_follower_pct", "avg_views_30d", "performance_score", "profile_views", "managed_by_agency_id",
  "created_at", "updated_at", "instagram_handle", "follower_count", "primary_niche", "barter_mode", "tier",
  "is_platinum_override", "rate_reel", "rate_story", "rate_yt_video", "verified", "categories", "ig_followers",
  "yt_subscribers", "is_deleted", "avg_likes_30d", "avg_comments_30d", "profile_status", "review_eta_hours", "reviewed_at",
  "is_claimed", "avatar_url", "onboarding_complete", "submitted_at",
  "instagram_stats", "instagram_synced_at"]; // v363
export function onlyColumns<T extends Record<string, any>>(row: T, columns: string[]): Partial<T> {
  const out: any = {};
  for (const k of columns) if (row[k] !== undefined) out[k] = row[k];
  return out;
}

// ---------- numbers ----------
/**
 * "1.5L", "1.5 lakh", "2 cr", "150K", "1.2M", "1,50,000", "150000" → whole number, or null.
 * Same rule on the server and in the form (src/utils/creatorFormValidation.js mirrors it).
 */
export function parseCount(raw: any): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : null;
  const s = String(raw).toLowerCase().replace(/[₹,\s]/g, "").replace(/rs\.?/g, "");
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)(k|thousand|l|lac|lakh|lakhs|m|mn|million|cr|crore|crores)?\+?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const mult: Record<string, number> = {
    k: 1e3, thousand: 1e3, l: 1e5, lac: 1e5, lakh: 1e5, lakhs: 1e5,
    m: 1e6, mn: 1e6, million: 1e6, cr: 1e7, crore: 1e7, crores: 1e7,
  };
  const v = Math.round(n * (m[2] ? mult[m[2]] : 1));
  return Number.isFinite(v) ? v : null;
}

/** 150000 → "1,50,000" (Indian grouping). */
export const formatIndian = (n: number) => Math.round(Number(n) || 0).toLocaleString("en-IN");

/** "+91" + "98765 43210" → "+919876543210"; other codes: 6–12 digits. Null when invalid. */
export function normaliseApplicantMobile(code: any, raw: any): string | null {
  const cc = String(code || "+91").trim().startsWith("+") ? String(code || "+91").trim() : `+${String(code || "91").trim()}`;
  let digits = String(raw || "").replace(/\D/g, "");
  if (cc === "+91") {
    if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
  }
  return digits.length >= 6 && digits.length <= 12 ? `${cc}${digits}` : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HANDLE_RE = /^[a-z0-9._]{1,30}$/;

export type CleanApplication = {
  name: string; gender: string; email: string; mobile: string; handle: string; instagram_link: string;
  city: string; followers: number; avg_reach: number; price: number; niche: string;
  collab_types: string[]; ugc_rating: number | null; sample_links: string[]; notes: string; photo: string;
};

/** Validates and cleans the form body. Returns { errors } (field → message) or { value }. */
export function validateApplication(body: any): { errors: Record<string, string>; value?: CleanApplication } {
  const b = body || {};
  const errors: Record<string, string> = {};
  const name = String(b.name || "").trim().replace(/\s+/g, " ");
  const gender = String(b.gender || "").trim();
  const email = String(b.email || "").trim().toLowerCase();
  const handle = String(b.social_handle || b.handle || "").trim().replace(/^@+/, "").toLowerCase();
  const city = String(b.city || "").trim();
  const niche = String(b.niche || "").trim();
  const photo = String(b.profile_photo_url || b.photo || "").trim();

  if (!photo) errors.photo = "Please add a profile photo.";
  if (name.length < 2 || name.length > 80) errors.name = "Please enter your full name.";
  if (!["Male", "Female", "Other"].includes(gender)) errors.gender = "Please choose your gender.";
  if (!EMAIL_RE.test(email) || email.length > 120) errors.email = "Please enter a valid email address.";
  const mobile = normaliseApplicantMobile(b.country_code, b.mobile);
  if (!mobile) errors.mobile = "Please enter a valid mobile number.";
  if (!HANDLE_RE.test(handle)) errors.social_handle = "Please enter your Instagram handle (letters, numbers, . and _).";
  if (city.length < 2 || city.length > 60) errors.city = "Please enter your city.";
  const followers = parseCount(b.followers);
  if (followers === null) errors.followers = "Please enter your follower count (for example 12,500 or 1.5L)."; // v397: under 500 is saved as a low-follower work share (below)
  const avgReach = parseCount(b.avg_reach);
  if (avgReach === null || avgReach < 1) errors.avg_reach = "Please enter your average reach (for example 8,000 or 1.2L).";
  const price = parseCount(b.charges ?? b.price);
  if (price === null || price < 100) errors.charges = "Please enter your price for 1 UGC video (at least ₹100).";
  else if (price > 1e7) errors.charges = "Please check your price.";
  if (!niche || niche.length > 60) errors.niche = "Please choose your main niche.";

  if (Object.keys(errors).length) return { errors };

  const linkIn = String(b.instagram_link || "").trim();
  const instagram_link = /^https?:\/\/(www\.)?instagram\.com\//i.test(linkIn) ? linkIn : `https://instagram.com/${handle}`;
  const list = (v: any, max: number, len: number) =>
    (Array.isArray(v) ? v : []).map((x: any) => String(x || "").trim()).filter(Boolean).slice(0, max).map((x: string) => x.slice(0, len));
  const rating = Number(b.ugc_rating);

  return {
    errors: {},
    value: {
      name, gender, email, mobile: mobile!, handle, instagram_link, city,
      followers: followers!, avg_reach: avgReach!, price: price!, niche,
      collab_types: list(b.collab_types, 10, 40),
      ugc_rating: Number.isInteger(rating) && rating >= 1 && rating <= 10 ? rating : null,
      sample_links: list(b.sample_links, 10, 300).filter((u: string) => /^https?:\/\//i.test(u)),
      notes: String(b.notes || "").trim().slice(0, 1000),
      photo,
    },
  };
}

// ---------- photo ----------
async function storePhoto(client: any, photo: string, id: string): Promise<{ url?: string; error?: string }> {
  if (/^https:\/\//i.test(photo)) return { url: photo };
  const m = photo.match(/^data:(image\/(?:jpeg|jpg|png|webp|heic|heif));base64,(.+)$/i);
  if (!m) return { error: "Please upload a JPG, PNG or WEBP photo." };
  const raw = Buffer.from(m[2], "base64");
  if (raw.length > 8 * 1024 * 1024) return { error: "Photo is too large (max 8 MB)." };
  if (!client) return { url: photo }; // local dev without Supabase: keep it inline
  try {
    const small = await shrinkPhoto(raw, m[1], "avatars");
    const ext = small.shrunk ? small.ext : (m[1].split("/")[1] || "jpg");
    const path = `applications/${id}.${ext}`;
    const { error } = await client.storage.from("avatars").upload(path, small.buffer, { contentType: small.contentType, upsert: true, cacheControl: "604800" }); // v428: 7 days (egress)
    if (error) return { error: `Photo upload failed: ${error.message || "storage error"}` };
    const { data } = client.storage.from("avatars").getPublicUrl(path);
    return data?.publicUrl ? { url: data.publicUrl } : { error: "Photo upload failed." };
  } catch (e: any) {
    return { error: `Photo upload failed: ${e?.message || "error"}` };
  }
}

// ---------- handler ----------
export function makeCreatorApplicationHandler(deps: {
  getClient: () => any;
  getDb: () => any;
  saveDb: (db: any) => void;
}) {
  return async (req: any, res: any) => {
    const { errors, value } = validateApplication(req.body);
    if (!value) return res.status(400).json({ error: Object.values(errors)[0], fields: errors, code: "INVALID_APPLICATION" });

    const client = deps.getClient();
    // waitlist.id is a uuid column — a "WAITLIST_…" text id was refused (session 35).
    const id = crypto.randomUUID();
    const minFollowers = await getMinFollowers(); // v397: Admin → Platform Settings → Creator sign-up
    const photo = await storePhoto(client, value.photo, id);
    if (photo.error) return res.status(400).json({ error: photo.error, fields: { photo: photo.error }, code: "PHOTO_FAILED" });

    // Read-only: tell the admin if this email already has an account. Never changes that account.
    let linkedUserId: string | null = null;
    if (client) {
      try {
        const { data } = await client.from("users").select("user_id, auth_method").ilike("email", likeExact(value.email)).limit(1);
        const u = Array.isArray(data) ? data[0] : null;
        if (u?.user_id && u.auth_method !== "unclaimed") linkedUserId = u.user_id;
      } catch { /* informational only */ }
    }

    const row: any = {
      id,
      name: value.name,
      gender: value.gender,
      email: value.email,
      mobile: value.mobile,
      phone: value.mobile,
      social_handle: value.handle,
      handle: value.handle,
      instagram_link: value.instagram_link,
      city: value.city,
      followers: value.followers,
      follower_count: value.followers,
      avg_reach: String(value.avg_reach),
      charges: `₹${formatIndian(value.price)}`,
      pricing: { ugc: value.price },
      niche: value.niche,
      category: value.niche,
      collab_types: value.collab_types,
      ugc_rating: value.ugc_rating,
      sample_links: value.sample_links,
      notes: value.notes,
      bio: value.notes,
      profile_photo_url: photo.url,
      photo: photo.url,
      role: "creator",
      status: "Pending",
      // v397: under 500 followers → kept for the team as a work share (Admin → Waitlist "Low followers · work shared")
      source: minFollowers > 0 && value.followers < minFollowers ? LOW_FOLLOWERS_SOURCE : "creator_apply_form",
      is_registered_user: Boolean(linkedUserId),
      linked_user_id: linkedUserId,
      terms_accepted_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    if (client) {
      const { error } = await client.from("waitlist").insert([onlyColumns(row, WAITLIST_COLUMNS)]);
      if (error) {
        console.error("[creator-apply] waitlist insert failed:", error.message || error);
        return res.status(500).json({ error: `We could not save your application: ${error.message || "database error"}. Please try again.`, code: "SAVE_FAILED" });
      }
    }
    const db = deps.getDb();
    if (!db.waitlist) db.waitlist = [];
    db.waitlist.push(row);
    try { deps.saveDb(db); } catch { /* local cache only */ }

    // Session 36: referral — the applicant came through ybexmedia.in/r/<CODE> (the code travels with the
    // form). Counted as a join for the inviter; moved to the account if this person signs up later.
    const refCode = String(req.body?.referral_code || "").trim();
    if (refCode) {
      try {
        const { recordReferral } = await import("./referralProgram");
        await recordReferral({ supabase: client, privilegedSupabase: client, getDb: deps.getDb, saveDb: deps.saveDb },
          refCode, { id: `waitlist:${id}`, email: value.email, phone: value.mobile, type: "creator" });
      } catch (e: any) { console.warn("[creator-apply] referral not recorded:", e?.message || e); }
    }

    return res.json({ ok: true, success: true, id, handle: value.handle, email: value.email, niche: value.niche, low_followers: minFollowers > 0 && value.followers < minFollowers });
  };
}

// ---------- approval (admin) ----------
/**
 * Same formulas the app uses for registered creators (creators_routes.ts profile save): engagement
 * from reach ÷ followers, the authentic-audience estimate and the performance score. So each
 * approved applicant gets numbers from their own followers and reach — never one fixed value.
 */
export function applicantMetrics(followers: number, reach: number) {
  // Session 40: same estimate as a registered creator (src/utils/audienceEstimate.ts) — from the
  // applicant's own followers and reach, null when there is not enough to say anything.
  const f = Math.max(0, Number(followers) || 0);
  const r = Math.max(0, Number(reach) || 0);
  let er = f > 0 && r > 0 ? parseFloat(((r / f) * 100).toFixed(2)) : 0;
  if (er > 100) er = 100;
  const est = audienceEstimate({ followers: f, avgReach: r });
  return {
    engagement_rate: er,
    fake_follower_pct: est.authenticPct === null ? null : 100 - est.authenticPct,
    performance_score: est.performanceScore,
    avg_views_30d: r,
  };
}

/** v365: ilike pattern that matches the text exactly (case-insensitive) — "_" and "%" are wildcards otherwise. */
export const likeExact = (v: string) => String(v || "").replace(/[\\%_]/g, (m) => `\\${m}`);
const unclaimedId = () => `CRTR_UNCLAIMED_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

/**
 * Approve one creator application → exactly ONE unclaimed creator profile on Explore.
 * - Email already belongs to a real account → no shadow profile, that account is never touched.
 * - The same email was approved before → the same unclaimed profile is updated (no duplicates).
 * Returns { ok, status, message, shadowUserId? } or { ok: false, error }.
 */
/** v419 (Ravi: "waitlist se approve kiya par doosri profile pending dikh rahi hai"): approving an application that belongs
 *  to an existing account approves that account's own profile too — only when it is still waiting (never undoes a reject). */
export async function approveAccountProfile(client: any, db: any, userId: string): Promise<boolean> {
  const uid = String(userId || "").trim();
  if (!uid) return false;
  const at = new Date().toISOString();
  let changed = false;
  if (client) {
    try {
      const { data } = await client.from("creator_profiles").select("user_id, profile_status, reviewed_at, is_deleted, created_at, is_claimed, creator_type").eq("user_id", uid).maybeSingle();
      if (data && !data.is_deleted && String(data.profile_status || "").toLowerCase() !== "rejected" && !data.reviewed_at) {
        const { error } = await client.from("creator_profiles").update({ profile_status: "approved", reviewed_at: at }).eq("user_id", uid);
        changed = !error;
      }
    } catch { /* best effort */ }
  }
  const cp = (db?.creator_profiles || []).find((c: any) => String(c.user_id) === uid);
  if (cp && String(cp.profile_status || "").toLowerCase() !== "rejected" && !cp.reviewed_at) { cp.profile_status = "approved"; cp.reviewed_at = at; changed = true; }
  return changed;
}

export async function approveCreatorApplication(entry: any, deps: { client: any; getDb: () => any; saveDb: (db: any) => void }) {
  const { client } = deps;
  const db = deps.getDb();
  for (const k of ["users", "creator_profiles", "waitlist"]) if (!db[k]) db[k] = [];
  const email = String(entry?.email || "").toLowerCase().trim();
  const now = new Date().toISOString();

  const markApproved = async (patch: any) => {
    if (client) {
      const { error } = await client.from("waitlist").update({ status: "Approved", ...patch }).eq("id", entry.id);
      if (error) return error.message || "database error";
    }
    const w = db.waitlist.find((x: any) => String(x.id) === String(entry.id));
    if (w) Object.assign(w, { status: "Approved", ...patch });
    return null;
  };

  // Who owns this email today?
  let real: any = null; let shadow: any = null;
  if (email) {
    let rows: any[] = [];
    if (client) {
      const { data } = await client.from("users").select("user_id, auth_method, role").ilike("email", likeExact(email)).limit(5); // v365: "_" in an email is a wildcard for ilike
      rows = Array.isArray(data) ? data : [];
    } else {
      rows = db.users.filter((u: any) => String(u.email || "").toLowerCase() === email);
    }
    real = rows.find((u) => u.auth_method !== "unclaimed") || null;
    shadow = rows.find((u) => u.auth_method === "unclaimed") || null;
  }
  // v365 (Ravi: CSV rows may have only an Instagram handle): no email → the handle decides. A creator who already
  // has a real (claimed) profile with this handle is that person; an earlier approval of this row (linked_user_id) or an
  // unclaimed profile with this handle is reused, so approving twice never makes a second listing.
  if (!email) {
    const h = String(entry?.social_handle || entry?.handle || "").replace(/^@+/, "").trim().toLowerCase();
    const linked = String(entry?.linked_user_id || "").trim();
    let profs: any[] = [];
    if (h) {
      if (client) {
        try {
          const { data } = await client.from("creator_profiles").select("user_id, is_claimed, creator_type, instagram_handle").ilike("instagram_handle", likeExact(h)).limit(5);
          profs = Array.isArray(data) ? data : [];
        } catch { profs = []; }
      } else {
        profs = db.creator_profiles.filter((p: any) => String(p.instagram_handle || "").replace(/^@+/, "").toLowerCase() === h);
      }
    }
    const isUnclaimed = (p: any) => p?.is_claimed === false || p?.creator_type === "unclaimed" || /^CRTR_UNCLAIMED_/.test(String(p?.user_id || ""));
    const claimed = profs.find((p) => !isUnclaimed(p));
    if (claimed) real = { user_id: claimed.user_id };
    else {
      const reuse = (linked && /^CRTR_UNCLAIMED_/.test(linked) ? linked : "") || profs.find(isUnclaimed)?.user_id || "";
      if (reuse) shadow = { user_id: reuse };
    }
  }
  if (real) {
    const err = await markApproved({ linked_user_id: real.user_id, is_registered_user: true });
    if (err) return { ok: false, error: `Approval failed: ${err}` };
    await approveAccountProfile(client, db, real.user_id); // v419
    try { deps.saveDb(db); } catch { /* cache */ }
    return { ok: true, status: "Approved", message: email ? "This email already has a Ybex account — marked approved, their own profile stays as it is." : "This Instagram handle already has a Ybex account — marked approved, their own profile stays as it is." };
  }

  const shadowUserId = shadow?.user_id || unclaimedId();
  // v363: numbers fetched from Instagram beat what the applicant typed.
  const igStats = entry.instagram_stats && typeof entry.instagram_stats === "object" && !entry.instagram_fetch_error ? entry.instagram_stats : null;
  const followers = Number(entry.ig_followers || igStats?.followers || 0) || Number(entry.followers || entry.follower_count || 0) || 0;
  const reach = Number(igStats?.avg_views || 0) || parseCount(entry.avg_reach) || 0;
  const price = parseCount(entry.pricing?.ugc ?? entry.charges) || 0;
  const handle = String(entry.social_handle || entry.handle || "").replace(/^@+/, "");
  const photo = entry.profile_photo_url || entry.photo || "";
  const m = applicantMetrics(followers, reach);

  const shadowUser = {
    user_id: shadowUserId, email: email || `unclaimed_${shadowUserId}@ybex.io`, name: entry.name || "Creator",
    phone: entry.mobile || entry.phone || "", picture: photo, role: "creator", auth_method: "unclaimed",
    is_claimed: false, is_unclaimed: true, created_at: now,
  };
  const shadowProfile = {
    user_id: shadowUserId, name: entry.name || "Creator", email: email || null /* v365: no email → null, not "" */, photo, picture: photo, avatar_url: photo,
    city: entry.city || "", gender: entry.gender || "",
    instagram: entry.instagram_link || (handle ? `https://instagram.com/${handle}` : ""),
    instagram_handle: handle, handle,
    followers_instagram: followers, follower_count: followers, followers,
    instagram_avg_reach: reach,
    primary_niche: entry.niche || entry.category || "", category: entry.niche || entry.category || "",
    rate_reel: price, rate_story: 0, rate_yt_video: 0,
    rate_card: { ugc: price, reel: price, reels: price },
    charges: price ? `₹${formatIndian(price)}` : "",
    ugc_rating: entry.ugc_rating ?? null,
    ...m,
    ...(igStats ? {
      instagram_stats: igStats, instagram_synced_at: entry.instagram_synced_at || now, ig_followers: followers,
      ...(igStats.engagement_rate != null ? { engagement_rate: igStats.engagement_rate } : {}),
      avg_views_30d: igStats.avg_views ?? null, avg_likes_30d: igStats.avg_likes ?? null, avg_comments_30d: igStats.avg_comments ?? null,
    } : {}),
    collab_types: Array.isArray(entry.collab_types) ? entry.collab_types : [],
    sample_links: Array.isArray(entry.sample_links) ? entry.sample_links : [],
    portfolio: Array.isArray(entry.sample_links) ? entry.sample_links : [],
    bio: entry.notes || "",
    profile_status: "approved", creator_type: "influencer", work_mode: "active",
    is_claimed: false, is_unclaimed: true, reviewed_at: now, created_at: now,
  };

  if (client) {
    const u = await client.from("users").upsert([onlyColumns(shadowUser, USERS_COLUMNS)], { onConflict: "user_id" });
    if (u.error) return { ok: false, error: `Approval failed (account): ${u.error.message}` };
    let p = await client.from("creator_profiles").upsert([onlyColumns(shadowProfile, CREATOR_PROFILE_COLUMNS)], { onConflict: "user_id" });
    // v372 (Ravi's screenshot: "null value in column email of creator_profiles violates not-null constraint"): the live
    // creator_profiles.email is still NOT NULL, so a handle-only approval failed. Retry with the same placeholder login
    // e-mail the account got (…@ybex.io is never e-mailed — sendApplicationDecisionEmail / emailBroadcasts skip it).
    if (p.error && !shadowProfile.email && /null value in column "email"/i.test(String(p.error.message || ""))) {
      (shadowProfile as any).email = shadowUser.email;
      p = await client.from("creator_profiles").upsert([onlyColumns(shadowProfile, CREATOR_PROFILE_COLUMNS)], { onConflict: "user_id" });
    }
    if (p.error) return { ok: false, error: `Approval failed (profile): ${p.error.message}` };
  }
  const ui = db.users.findIndex((x: any) => String(x.user_id) === shadowUserId);
  if (ui >= 0) db.users[ui] = { ...db.users[ui], ...shadowUser }; else db.users.unshift(shadowUser);
  const pi = db.creator_profiles.findIndex((x: any) => String(x.user_id) === shadowUserId);
  if (pi >= 0) db.creator_profiles[pi] = { ...db.creator_profiles[pi], ...shadowProfile }; else db.creator_profiles.unshift(shadowProfile);
  const err = await markApproved({ linked_user_id: shadowUserId });
  if (err) return { ok: false, error: `Approval failed: ${err}` };
  try { deps.saveDb(db); } catch { /* cache */ }
  return { ok: true, status: "Approved", shadowUserId, message: shadow ? "Approved — updated their existing listing." : "Approved and added to Unclaimed Creators" };
}

// ---------- emails ----------
const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Approval / rejection email for an application. Never throws; returns whether it was sent.
 *  v365: a row with no email (CSV, Instagram handle only) never gets the "Claim your profile" email — nothing to send to. */
export async function sendApplicationDecisionEmail(entry: any, decision: "approved" | "rejected", reason?: string): Promise<boolean> {
  const to = String(entry?.email || "").trim();
  if (!to) return false;
  if (!to.includes("@") || to.endsWith("@ybex.io") || to.includes("@example.com")) return false;
  // Session 36: rows from Admin → Upload CSV did not apply themselves — no approve / reject email.
  if (String(entry?.source || "") === "csv_import") return false;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.log(`[creator-apply] email skipped (no RESEND_API_KEY): ${decision} → ${to}`); return false; }
  try {
    const { Resend } = await import("./helpers"); // v399: counted by the email budget
    const { buildEmailHtml, getValidFromEmail, emailFactsHtml } = await import("./helpers");
    const appUrl = publicSiteUrl(); // v388
    const name = String(entry?.name || "there").split(" ")[0];
    const approved = decision === "approved";
    // v373 (Ravi: "claim your profile, brands in your category are waiting"): the creator's own niche in the headline,
    // their numbers, the e-mail filled in on sign-up (the profile is linked to it), and what to do after claiming.
    const niche = String(entry?.niche || entry?.category || "").trim().slice(0, 40);
    const nf = (v: any) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n.toLocaleString("en-IN") : ""; };
    const handle = String(entry?.social_handle || entry?.instagram_handle || "").replace(/^@+/, "").trim();
    const claimLink = `${appUrl}/signup?role=creator&email=${encodeURIComponent(to)}`;
    const steps = [
      ["Set your rate card", "Brands see your price before they message you."],
      ["Add your 3 best brand reels", "Your Portfolio is the first thing brands open."],
      ["Get offers in chat", "The brand pays into the Ybex hold before you start. You get paid when they approve."],
    ].map(([t, d], i) => `<tr><td width="40" valign="top" style="padding:0 0 14px"><div style="width:30px;height:30px;border-radius:15px;background:#7C3AED;color:#FFFFFF;font:800 14px/30px Helvetica,Arial,sans-serif;text-align:center">${i + 1}</div></td><td valign="top" style="padding:3px 0 14px;font-family:Helvetica,Arial,sans-serif"><div style="font-weight:800;font-size:15px;color:#1A1033">${t}</div><div style="font-size:14px;line-height:1.5;color:#6B6780;margin-top:2px">${d}</div></td></tr>`).join("");
    const html = approved
      ? buildEmailHtml({
          eyebrow: "Claim your profile",
          icon: "&#10003;",
          preheader: "Your profile is already built with your Instagram numbers. Claiming it is free and takes 2 minutes.",
          title: niche ? `Brands in ${esc(niche)} are waiting. Claim your profile.` : "Brands are waiting. Claim your profile.",
          greeting: `Hi ${esc(name)},`,
          paragraphs: [
            "Your Ybex creator profile is approved and already built — with your Instagram numbers. Claim it, and brands can message you and send paid offers.",
            `Sign up with <strong>${esc(to)}</strong> — your profile is linked to this email. It's free and takes 2 minutes.`,
          ],
          blocks: emailFactsHtml([["Instagram", handle ? `@${esc(handle)}` : ""], ["Followers", nf(entry?.followers)], ["Avg views", nf(entry?.avg_reach)], ["Status", "Approved · not claimed yet"]]),
          button: { text: "Claim my profile", link: claimLink },
          signatureHtml: `<div style="font:800 11px Helvetica,Arial,sans-serif;letter-spacing:1.6px;color:#7C3AED;margin:26px 0 12px">AFTER YOU CLAIM</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${steps}</table><p style="margin:18px 0 0;font:600 14px Helvetica,Arial,sans-serif;color:#7A7391;text-align:center">— Team Ybex</p>`,
          reason: "You're getting this because you applied to join Ybex.",
        })
      : buildEmailHtml({
          eyebrow: "Your application",
          preheader: "We couldn't list your profile yet. Here is the reason.",
          title: "About your Ybex application",
          greeting: `Hi ${esc(name)},`,
          paragraphs: [
            "Thank you for applying to Ybex. Our team reviewed your application, and we can't list your profile right now.",
            `<strong>Reason:</strong> ${esc(reason || "Your profile did not meet our current listing criteria.")}`,
            "You are welcome to apply again once this is sorted.",
          ],
          button: { text: "Apply again", link: `${appUrl}/apply` },
          reason: "You're getting this because you applied to join Ybex.",
        });
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: getValidFromEmail(),
      to,
      subject: approved
        ? "Profile approved — claim it now" // v419 (Ravi): short, action-first subjects
        : "Application update — apply again",
      html,
    } as any);
    if (error) { console.warn("[creator-apply] email failed:", (error as any).message || error); return false; }
    return true;
  } catch (e: any) {
    console.warn("[creator-apply] email failed:", e?.message || e);
    return false;
  }
}
