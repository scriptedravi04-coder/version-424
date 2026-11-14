// Session 36 (Ravi): Admin → Waitlist → Upload CSV. Replaces the old bulk-import route that invented
// numbers. Each good row becomes a PENDING waitlist row (source "csv_import") — the same review queue as
// the public /apply form (rule 72). Nothing is invented: an empty cell stays empty. Approving / rejecting
// an imported row sends NO email (these people did not apply themselves).
import crypto from "crypto";
import { parseCount, normaliseApplicantMobile, onlyColumns, WAITLIST_COLUMNS } from "./creatorApplication";

export const CSV_IMPORT_SOURCE = "csv_import";
export const CSV_MAX_ROWS = 500;
export const CSV_TEMPLATE_HEADERS = ["name", "email", "mobile", "instagram", "city", "gender", "followers", "avg_reach", "price", "niche", "collab_types", "ugc_rating", "sample_links", "notes", "submitted_at"];

export type CsvRowResult = {
  row: number;            // 1-based line in the sheet (header = 0)
  status: "ok" | "error" | "duplicate" | "update";
  reason?: string;
  value?: Record<string, any>;
};

const pick = (r: Record<string, any>, ...keys: string[]) => {
  for (const k of keys) {
    const hit = Object.keys(r).find((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_") === k);
    if (hit && String(r[hit] ?? "").trim() !== "") return String(r[hit]).trim();
  }
  return "";
};

const pad2 = (n: number | string) => String(n).padStart(2, "0");

/** "6/10/2026, 2:45:58 am" (day/month/year, India time) or an ISO date → ISO string. Null when unreadable. */
export function parseSubmittedAt(raw: any, now = Date.now()): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?$/i);
  let t = NaN;
  if (m) {
    const day = +m[1], month = +m[2];
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    let h = +m[4];
    const ap = (m[7] || "").toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    t = Date.parse(`${m[3]}-${pad2(month)}-${pad2(day)}T${pad2(h)}:${m[5]}:${pad2(m[6] || "0")}+05:30`);
  } else {
    t = Date.parse(s);
  }
  if (!Number.isFinite(t) || t < Date.parse("2020-01-01") || t > now + 24 * 3600 * 1000) return null;
  return new Date(t).toISOString();
}

/** A plain count ("70,000", "1.8M", "30000+") becomes a clean number string; a range ("100k-200k") or any
 *  other text is kept exactly as written — never turned into a made-up single number. */
export function readReach(raw: string): string | null {
  const t = String(raw || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const n = parseCount(t);
  return n !== null ? String(n) : t.slice(0, 60);
}

const IG_NOT_A_HANDLE = new Set(["reel", "reels", "p", "tv", "stories", "explore", "accounts"]);
const handleFrom = (x: string) => {
  const h = String(x || "").trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[?#].*$/, "").replace(/\/.*$/, "").replace(/^@/, "").trim();
  return IG_NOT_A_HANDLE.has(h.toLowerCase()) ? "" : h;
};

const splitList = (raw: string, max: number, len: number, onlyUrls = false) =>
  String(raw || "").split(/[\n\r,;|]+|\s{2,}/).map((x) => x.trim()).filter(Boolean)
    .filter((x) => (onlyUrls ? /^https?:\/\//i.test(x) : true)).slice(0, max).map((x) => x.slice(0, len));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Session 58 (Ravi: "CSV me purane creators bhi honge — jo already app pe hain unhe auto detect karke chhod do"):
 *  a person is the same if the email, the mobile number (last 10 digits) or the Instagram handle matches. */
export const mobileKey = (v: any) => { const d = String(v || "").replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : ""; };
export const handleKey = (v: any) => handleFrom(String(v || "")).toLowerCase();

/** Pure: checks rows, never writes. existingEmails = lower-case emails already in waitlist or users.
 *  known.mobiles / known.handles (mobileKey / handleKey form) = people already on Ybex by another field. */
// v365 (Ravi: "email optional kar do — Instagram handle hai to bina email ke row accept ho, duplicate handle se pakdo"):
// a row needs a name and an email OR an Instagram handle. Without an email, the handle is the person's key — same
// handle already on Ybex / twice in the file = duplicate; a handle-only row an earlier import made can be completed
// by uploading again (known.updatableHandles).
export function prepareCsvRows(rows: Record<string, any>[], existingEmails: Set<string>, updatableEmails: Set<string> = new Set(),
  known: { mobiles?: Set<string>; handles?: Set<string>; updatableHandles?: Set<string> } = {}): CsvRowResult[] {
  const seen = new Set<string>();
  const seenMobiles = new Set<string>();
  const seenHandles = new Set<string>();
  const knownMobiles = known.mobiles || new Set<string>();
  const knownHandles = known.handles || new Set<string>();
  const updatableHandles = known.updatableHandles || new Set<string>();
  return (rows || []).slice(0, CSV_MAX_ROWS).map((r, i) => {
    const row = i + 1;
    const name = pick(r, "name", "full_name");
    const email = pick(r, "email", "email_id").toLowerCase().replace(/\s+/g, "").replace(/^@+/, ""); // "@name@gmail.com" typo → name@gmail.com
    if (!name) return { row, status: "error", reason: "Name is missing" };
    const hKey = handleKey(pick(r, "instagram", "instagram_handle", "insta")) || handleKey(pick(r, "instagram_link", "instagram_url"));
    if (!email && !hKey) return { row, status: "error", reason: "Email or Instagram handle is missing (one is needed)" };
    if (email && !EMAIL_RE.test(email)) return { row, status: "error", reason: "Email does not look right" };
    const isUpdate = email ? updatableEmails.has(email) : updatableHandles.has(hKey);
    if (email && existingEmails.has(email) && !isUpdate) return { row, status: "duplicate", reason: "This email is already on Ybex" };
    if (email && seen.has(email)) return { row, status: "duplicate", reason: "Same email twice in this file" };

    const mobileRaw = pick(r, "mobile", "phone", "whatsapp");
    const mobile = mobileRaw ? normaliseApplicantMobile("+91", mobileRaw) : null;
    if (mobileRaw && !mobile) return { row, status: "error", reason: "Mobile number is not valid" };
    const mKey = mobileKey(mobile);
    if (!isUpdate && mKey && knownMobiles.has(mKey)) return { row, status: "duplicate", reason: "This mobile number is already on Ybex" };
    if (!isUpdate && hKey && knownHandles.has(hKey)) return { row, status: "duplicate", reason: "This Instagram handle is already on Ybex" };
    if (mKey && seenMobiles.has(mKey)) return { row, status: "duplicate", reason: "Same mobile number twice in this file" };
    if (hKey && seenHandles.has(hKey)) return { row, status: "duplicate", reason: "Same Instagram handle twice in this file" };

    const followersRaw = pick(r, "followers", "followers_count", "followers_instagram", "follower_count");
    const followers = followersRaw ? parseCount(followersRaw) : null;
    if (followersRaw && followers === null) return { row, status: "error", reason: "Followers is not a number (e.g. 15000 or 1.5L)" };
    const reach = readReach(pick(r, "avg_reach", "avg_reach_per_reel", "reach", "average_reach"));
    const priceRaw = pick(r, "price", "charges", "charges_ugc", "rate", "ugc_price");
    const price = priceRaw ? parseCount(priceRaw) : null;
    if (priceRaw && price === null) return { row, status: "error", reason: "Price is not a number" };

    // The handle can come from the handle column or from the link column (some sheets hold a bare handle there).
    const insta = handleFrom(pick(r, "instagram", "instagram_handle", "insta")) || handleFrom(pick(r, "instagram_link", "instagram_url"));

    const ratingRaw = Number(pick(r, "ugc_rating", "ugc_experience_rating", "rating"));
    const rating = Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 10 ? ratingRaw : null;
    const collab = splitList(pick(r, "collab_types", "collab_type", "collab"), 10, 60);
    const links = splitList(pick(r, "sample_links", "sample_link", "portfolio"), 10, 300, true);
    // Old-form details that have no waitlist column go at the end of the notes, so nothing is lost.
    const extras: string[] = [];
    const brands = pick(r, "brands_applied");
    if (brands) extras.push(`Applied to: ${brands}`);
    if (/^(true|yes|1)$/i.test(pick(r, "is_exclusive"))) extras.push("Marked exclusive on the old form");
    const notes = [pick(r, "notes"), extras.join(" · ")].filter(Boolean).join("\n\n").slice(0, 2000);
    const createdAt = parseSubmittedAt(pick(r, "submitted_at", "created_at", "date"));

    if (email) seen.add(email);
    if (mKey) seenMobiles.add(mKey);
    if (hKey) seenHandles.add(hKey);
    return {
      row, status: isUpdate ? "update" : "ok",
      value: {
        name, email: email || null, mobile, // v365: null (not "") — the waitlist email is unique when present
        social_handle: insta || null,
        instagram_link: insta ? `https://instagram.com/${insta}` : null,
        city: pick(r, "city") || null,
        gender: pick(r, "gender") || null,
        followers,                                   // null when empty — never a default
        avg_reach: reach,
        charges: price !== null ? `₹${Math.round(price).toLocaleString("en-IN")}` : null,
        niche: pick(r, "niche", "content_niches", "category") || null,
        collab_types: collab.length ? collab : null,
        ugc_rating: rating,
        sample_links: links.length ? links : null,
        notes: notes || null,
        created_at: createdAt,
      },
    };
  });
}

/** Row for the waitlist table (real columns only). */
export function toWaitlistRow(value: Record<string, any>, nowIso = new Date().toISOString()) {
  return onlyColumns({
    id: crypto.randomUUID(),
    ...value,
    role: "creator",
    status: "Pending",
    source: CSV_IMPORT_SOURCE,
    is_registered_user: false,
    created_at: value.created_at || nowIso,   // the date the person really applied, when the sheet has it
  }, WAITLIST_COLUMNS);
}

const isEmptyVal = (v: any) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/** Update for a row that an earlier (partial) import already created: fills ONLY cells that are empty
 *  there. Never overwrites something already filled, never touches status / source / created_at. */
export function fillMissing(existing: Record<string, any>, value: Record<string, any>): Record<string, any> {
  const patch: Record<string, any> = {};
  for (const k of Object.keys(value)) {
    if (["email", "name", "created_at"].includes(k)) continue;
    if (!WAITLIST_COLUMNS.includes(k)) continue;
    if (isEmptyVal(value[k])) continue;
    if (isEmptyVal(existing[k])) patch[k] = value[k];
  }
  // notes: when the import only adds the "Applied to" lines after the notes already saved, add them.
  const en = String(existing.notes || "");
  const vn = String(value.notes || "");
  if (en && vn && vn !== en && vn.startsWith(en)) patch.notes = vn;
  return patch;
}
