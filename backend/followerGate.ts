import crypto from "crypto";
import { logIgnored } from "./logIgnored";
import { onlyColumns, WAITLIST_COLUMNS, likeExact } from "./creatorApplication";
import { getMinFollowers, setMinFollowers, cleanMinFollowers, DEFAULT_MIN_FOLLOWERS, MAX_MIN_FOLLOWERS } from "./followerMin";
import { isAdminStaff } from "./authSecurity";

// v397 (Ravi, 2 Nov 2026: "500 se neeche wale bahut kachra aa raha hai, ads ka budget kharab ho raha hai"):
// new creators need 500+ Instagram followers (admin can change it: Admin → Waitlist; 0 = off) to finish sign-up. Below that they see a clean page
// (src/components/onboarding/FollowerGate.jsx) where they can drop one work link; it lands in Admin → Waitlist
// as source "low_followers_work" so the team can reach out personally. No new table or column — it uses waitlist.
//   GET  /api/creator/follower-gate        → { min, exempt, submitted, link }
//   POST /api/creator/follower-gate/work   → { ok } (body: { link, handle, followers })
//   POST /api/creators/profile             → guard: onboarding_complete with 1–499 followers → 403 LOW_FOLLOWERS
// Already-onboarded creators are never touched. A creator the team approved (their low-follower waitlist row, or
// their profile reviewed + approved) is let through.

export const MIN_FOLLOWERS = DEFAULT_MIN_FOLLOWERS; // default; the live value is set in Admin → Waitlist (followerMin.ts)
export const LOW_FOLLOWERS_SOURCE = "low_followers_work";
export const JOIN_STARTED_SOURCE = "join_started"; // v408

/** A follower count the creator gave or Meta returned: true only for a known number below the minimum. Pure. */
export function belowMinFollowers(n: any, zeroCounts = false, min: number = MIN_FOLLOWERS): boolean {
  if (!(min > 0)) return false; // 0 = no limit
  if (n === null || n === undefined || n === "") return false;
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return false;
  if (v === 0 && !zeroCounts) return false; // 0 is often "not filled in yet" on a profile row
  return v < min;
}

/** The highest follower number a creator profile row carries (columns differ between old and new rows). Pure. */
export function profileFollowers(p: any): number | null {
  if (!p) return null;
  const vals = [p.followers_instagram, p.follower_count, p.ig_followers, p.instagram_followers, p.followers, p?.instagram_stats?.followers]
    .map((x: any) => Number(x)).filter((x: number) => Number.isFinite(x) && x > 0);
  return vals.length ? Math.max(...vals) : null;
}

/** "https://…" link, trimmed; null when it isn't one. Pure. */
export function cleanWorkLink(raw: any): string | null {
  let s = String(raw || "").trim();
  if (!s || s.length > 500) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s.replace(/^\/+/, "");
  try {
    const u = new URL(s);
    if (!["http:", "https:"].includes(u.protocol) || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch { return null; }
}

// v402 (Ravi 4 Nov: "sabse pehle Instagram username maang ke wahin fetch kar lo; 500 nahi hai to wahin mana kar do, account
// hi mat banao"): the app's Join screen asks the Instagram username FIRST and checks it (src/lib/signupPrecheck.js). The
// server checks again before it makes a new creator account (auth/quick-join, auth/phone/verify), so an old app version
// or a direct call can't skip it. Unknown numbers (private account, Meta busy, fetch off) are let through — the
// onboarding gate above still stops them.
let followerLookup: ((username: string) => Promise<number | null>) | null = null;
export function setSignupFollowerLookup(fn: ((username: string) => Promise<number | null>) | null) { followerLookup = fn; }

const cleanHandle = (v: any) => String(v || "").trim().replace(/^@+/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").split(/[/?#]/)[0].toLowerCase().slice(0, 60);

/** Waitlist said yes to this person (by email or Instagram handle) → they may join whatever their followers. */
export async function waitlistApprovedFor(client: any, email: any, handle: any): Promise<boolean> {
  if (!client) return false;
  const em = String(email || "").trim().toLowerCase();
  const h = cleanHandle(handle);
  try {
    if (em) {
      const { data } = await client.from("waitlist").select("status").ilike("email", likeExact(em)).limit(5);
      if ((data || []).some((r: any) => String(r?.status || "").toLowerCase() === "approved")) return true;
    }
    if (h) {
      const { data } = await client.from("waitlist").select("status").ilike("social_handle", likeExact(h)).limit(5);
      if ((data || []).some((r: any) => String(r?.status || "").toLowerCase() === "approved")) return true;
      const { data: d2 } = await client.from("waitlist").select("status").ilike("social_handle", likeExact("@" + h)).limit(5);
      if ((d2 || []).some((r: any) => String(r?.status || "").toLowerCase() === "approved")) return true;
    }
  } catch (e) { logIgnored("followerGate:waitlist-approved", e); }
  return false;
}

/** Before a NEW creator account is made: null = go ahead; otherwise the 403 answer. */
export async function signupFollowerBlock(client: any, opts: { instagram?: any; email?: any; timeoutMs?: number }) {
  const handle = cleanHandle(opts.instagram);
  if (!handle || !followerLookup) return null;
  const min = await getMinFollowers();
  if (!(min > 0)) return null;
  let followers: number | null = null;
  try {
    followers = await Promise.race([
      followerLookup(handle),
      new Promise<null>((ok) => setTimeout(() => ok(null), opts.timeoutMs ?? 6000)),
    ]);
  } catch { followers = null; }
  if (followers === null || followers === undefined || !belowMinFollowers(followers, true, min)) return null;
  if (await waitlistApprovedFor(client, opts.email, handle)) return null;
  return {
    status: 403,
    body: {
      code: "LOW_FOLLOWERS", min, followers, handle,
      detail: `Brands on Ybex look for ${min.toLocaleString("en-IN")}+ followers. You're closer than you think — drop your best work link and the Ybex team will personally message you if it's a fit.`,
    },
  };
}

/** v407: "ravi.sharma@gmail.com" → "r•••@gmail.com"; placeholder / phone-only emails → null. Pure. */
export function maskEmail(raw: any): string | null {
  const e = String(raw || "").trim().toLowerCase();
  const m = /^([^\s@]+)@([^\s@]+\.[^\s@]+)$/.exec(e);
  if (!m || /^phone-\d{6,15}@ybex\.io$/.test(e)) return null; // WhatsApp-only accounts have a placeholder email
  return `${m[1].slice(0, 1)}•••@${m[2]}`;
}

export function setupFollowerGate(router: any, deps: { supabase: any; privilegedSupabase: any; parseAuthUser: (req: any) => Promise<any> }) {
  const db = () => deps.privilegedSupabase || deps.supabase;
  const recent = new Map<string, number[]>();

  const creatorOf = async (req: any) => {
    const user = await deps.parseAuthUser(req).catch(() => null);
    return user && String(user.role || "").toLowerCase() === "creator" ? user : null;
  };

  const findRow = async (user: any) => {
    const c = db(); if (!c) return null;
    const { data } = await c.from("waitlist").select("*").eq("linked_user_id", user.user_id).eq("source", LOW_FOLLOWERS_SOURCE).limit(1);
    if (Array.isArray(data) && data[0]) return data[0];
    return null;
  };

  const isExempt = async (user: any, profile?: any) => {
    const p = profile ?? (db() ? (await db().from("creator_profiles").select("*").eq("user_id", user.user_id).maybeSingle()).data : null);
    if (p && p.reviewed_at && String(p.profile_status || "").toLowerCase() === "approved") return true;
    const row = await findRow(user).catch(() => null);
    return String(row?.status || "").toLowerCase() === "approved";
  };

  router.get("/creator/follower-gate", async (req: any, res: any) => {
    const user = await creatorOf(req);
    const min = await getMinFollowers();
    if (!user) return res.json({ min, exempt: false, submitted: false });
    try {
      const row = await findRow(user);
      const exempt = await isExempt(user);
      const links = Array.isArray(row?.sample_links) ? row.sample_links : [];
      return res.json({ min, exempt, submitted: Boolean(row), link: links[links.length - 1] || null });
    } catch (e) {
      logIgnored("followerGate:get", e);
      return res.json({ min, exempt: false, submitted: false });
    }
  });

  // Logged-out pages (apply form) need the number too.
  router.get("/public/follower-gate", async (_req: any, res: any) => res.json({ min: await getMinFollowers() }));

  // v402: the app's Join screen, before any account exists — under the minimum (or Instagram unreadable) → one work
  // link + email → Admin → Waitlist ("Below min · work shared"). No account, no code e-mail.
  const publicHits = new Map<string, number[]>();
  // v407 (Ravi 5 Nov: "account bana hua hai toh login kaise karunga — wo phir se username maangega"): the Join screen
  // asks this right after the username is typed. If a creator account already uses that Instagram username, the screen
  // says so and sends them to Log in (email shown masked, e.g. r•••@gmail.com). 30 / hour per visitor.
  const igAccountHits = new Map<string, number[]>();
  router.post("/public/ig-account", async (req: any, res: any) => {
    const handle = cleanHandle(req.body?.username);
    if (!handle) return res.status(400).json({ error: "Enter your Instagram username.", code: "BAD_HANDLE" });
    const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim() || "ip";
    const now = Date.now();
    const hits = (igAccountHits.get(ip) || []).filter((t) => now - t < 3600000);
    if (hits.length >= 30) return res.status(429).json({ error: "Too many tries.", code: "RATE_LIMIT" });
    hits.push(now); igAccountHits.set(ip, hits);
    if (igAccountHits.size > 5000) igAccountHits.delete(igAccountHits.keys().next().value as string);
    const c = db();
    if (!c) return res.json({ exists: false });
    try {
      const found = new Set<string>();
      for (const col of ["instagram_handle", "instagram"]) {
        const { data } = await c.from("creator_profiles").select("user_id").ilike(col, likeExact(handle)).limit(3);
        (data || []).forEach((r: any) => r?.user_id && found.add(String(r.user_id)));
        if (found.size) break;
      }
      if (!found.size) return res.json({ exists: false });
      const { data: users } = await c.from("users").select("user_id, email, is_deleted, role").in("user_id", Array.from(found)).limit(3);
      const live = (users || []).find((u: any) => !u?.is_deleted && String(u?.role || "") === "creator");
      if (!live) return res.json({ exists: false });
      return res.json({ exists: true, email_hint: maskEmail(live.email) });
    } catch (e) {
      logIgnored("ig-account:lookup", e);
      return res.json({ exists: false });
    }
  });

  // v408 (Ravi 5 Nov): the "Trusted by 3,000+ creators" strip on the Join screen — real Explore editor-pick photos
  // (creator_profiles.show_on_creator_home) and short REAL activity lines (first name only, no money): joined / applied /
  // signed a deal. Cached 10 minutes; empty lists are fine (the strip then shows only the headline).
  let proofCache: { at: number; body: any } | null = null;
  router.get("/public/join-proof", async (_req: any, res: any) => {
    res.set("Cache-Control", "public, max-age=300");
    if (proofCache && Date.now() - proofCache.at < 10 * 60 * 1000) return res.json(proofCache.body);
    const c = db();
    const body: any = { faces: [], lines: [] };
    if (c) {
      const first = (n: any) => { const f = String(n || "").trim().split(/\s+/)[0] || ""; return /^[A-Za-z][A-Za-z.'-]{1,20}$/.test(f) ? f[0].toUpperCase() + f.slice(1).toLowerCase() : ""; };
      const city = (v: any) => { const t = String(v || "").trim(); return /^[A-Za-z .-]{2,24}$/.test(t) && !/pan india|india/i.test(t) ? t : ""; };
      try {
        const { data: picks } = await c.from("creator_profiles").select("user_id, name, photo").eq("show_on_creator_home", true).limit(12);
        body.faces = (picks || []).filter((p: any) => /^(https?:\/\/|\/)/.test(String(p.photo || "")) && first(p.name)).slice(0, 8).map((p: any) => ({ name: first(p.name), photo: String(p.photo) }));
      } catch (e) { logIgnored("join-proof:faces", e); }
      try {
        const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
        const [joined, apps, deals] = await Promise.all([
          c.from("creator_profiles").select("user_id, name, city, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(12),
          c.from("campaign_applications").select("creator_id, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(60),
          c.from("deals").select("creator_id, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(10),
        ]);
        const names = new Map<string, { n: string; c: string }>();
        for (const r of joined?.data || []) names.set(String(r.user_id), { n: first(r.name), c: city(r.city) });
        const need = Array.from(new Set([...(apps?.data || []).map((a: any) => String(a.creator_id)), ...(deals?.data || []).map((d: any) => String(d.creator_id))])).filter((id) => !names.has(id)).slice(0, 60);
        if (need.length) {
          const { data: more } = await c.from("creator_profiles").select("user_id, name, city").in("user_id", need);
          for (const r of more || []) names.set(String(r.user_id), { n: first(r.name), c: city(r.city) });
        }
        const lines: string[] = [];
        for (const r of joined?.data || []) { const x = names.get(String(r.user_id)); if (x?.n) lines.push(x.c ? `${x.n} from ${x.c} just joined` : `${x.n} just joined Ybex`); }
        const perCreator = new Map<string, number>();
        for (const a of apps?.data || []) perCreator.set(String(a.creator_id), (perCreator.get(String(a.creator_id)) || 0) + 1);
        for (const [id, n] of perCreator) { const x = names.get(id); if (x?.n) lines.push(n > 1 ? `${x.n} applied to ${n} campaigns` : `${x.n} applied to a campaign`); }
        for (const d of deals?.data || []) { const x = names.get(String(d.creator_id)); if (x?.n) lines.push(`${x.n} signed a brand deal`); }
        // mix the kinds, no repeats, max 10
        body.lines = Array.from(new Set(lines)).sort((a, b) => (a.length % 3) - (b.length % 3)).slice(0, 10);
      } catch (e) { logIgnored("join-proof:lines", e); }
    }
    proofCache = { at: Date.now(), body };
    return res.json(body);
  });

  // v408 (Ravi 5 Nov QA #4: "username daala aur chala gaya — lead gayi"): every Instagram username that the Join screen
  // fetched is kept in the Waitlist as status "Started" (source join_started) — name, followers, photo — so the team can DM
  // people who left before making an account. One row per handle; a finished sign-up / work link updates its own rows.
  const leadHits = new Map<string, number[]>();
  router.post("/public/ig-lead", async (req: any, res: any) => {
    const handle = cleanHandle(req.body?.username);
    if (!handle || !/^[a-z0-9._]{1,30}$/.test(handle)) return res.status(400).json({ error: "bad", code: "BAD_HANDLE" });
    const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim() || "ip";
    const now = Date.now();
    const hits = (leadHits.get(ip) || []).filter((t) => now - t < 3600000);
    if (hits.length >= 20) return res.json({ ok: true, skipped: true });
    hits.push(now); leadHits.set(ip, hits);
    if (leadHits.size > 5000) leadHits.delete(leadHits.keys().next().value as string);
    const c = db();
    if (!c) return res.json({ ok: true });
    const fRaw = Number(req.body?.followers);
    const followers = Number.isFinite(fRaw) && fRaw >= 0 ? Math.round(fRaw) : null;
    // v408 (Ravi: "0 followers / private wale se kachra bharega — sirf eligible wale save karo"): only creators at or above
    // the follower minimum are kept; under-minimum, private and unreadable profiles are not saved.
    if (followers === null || followers < (await getMinFollowers())) return res.json({ ok: true, skipped: "not_eligible" });
    const photo = String(req.body?.photo_url || "");
    try {
      const { data } = await c.from("waitlist").select("id, source").ilike("social_handle", likeExact(handle)).limit(1);
      if (Array.isArray(data) && data[0]) {
        if (String(data[0].source || "") === JOIN_STARTED_SOURCE && followers !== null) await c.from("waitlist").update({ followers, ig_followers: followers }).eq("id", data[0].id);
        return res.json({ ok: true, known: true });
      }
      const row: any = {
        id: crypto.randomUUID(), name: String(req.body?.name || "").trim().slice(0, 80) || handle, email: null, role: "creator", status: "Started",
        social_handle: handle, instagram_link: `https://instagram.com/${handle}`, followers, ig_followers: followers,
        profile_photo_url: /^(https?:\/\/|\/)/.test(photo) ? photo.slice(0, 500) : null,
        notes: `Eligible (${followers} followers) — checked @${handle} on the Join screen and left before making an account. DM them on Instagram.`,
        source: JOIN_STARTED_SOURCE, is_registered_user: false, created_at: new Date().toISOString(),
      };
      const { error } = await c.from("waitlist").insert([onlyColumns(row, WAITLIST_COLUMNS)]);
      if (error) console.warn("[ig-lead] insert:", error.message || error);
      return res.json({ ok: true });
    } catch (e) {
      logIgnored("ig-lead", e);
      return res.json({ ok: true });
    }
  });

  router.post("/public/follower-gate/work", async (req: any, res: any) => {
    const link = cleanWorkLink(req.body?.link);
    if (!link) return res.status(400).json({ error: "Paste a full link, like a reel, Drive or portfolio link.", code: "BAD_LINK" });
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return res.status(400).json({ error: "Enter your email so the team can reach you.", code: "BAD_EMAIL" });
    const handle = cleanHandle(req.body?.handle);
    if (!handle) return res.status(400).json({ error: "Enter your Instagram username.", code: "BAD_HANDLE" });
    const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim() || "ip";
    const now = Date.now();
    const hits = (publicHits.get(ip) || []).filter((t) => now - t < 3600000);
    if (hits.length >= 6) return res.status(429).json({ error: "Too many tries. Please try again in a while.", code: "RATE_LIMIT" });
    hits.push(now); publicHits.set(ip, hits);
    if (publicHits.size > 5000) publicHits.delete(publicHits.keys().next().value as string);
    const c = db();
    if (!c) return res.json({ ok: true });
    const fRaw = req.body?.followers == null || req.body?.followers === "" ? NaN : Number(req.body.followers);
    const followers = Number.isFinite(fRaw) && fRaw >= 0 ? Math.round(fRaw) : null;
    const note = String(req.body?.reason || "") === "unverified"
      ? "Instagram couldn't be read (private / personal / not a Professional account) — shared a work link on the Join screen (no account yet)."
      : `Below ${await getMinFollowers()} followers — shared a work link on the Join screen (no account yet). Reach out personally if the work fits.`;
    try {
      let row: any = null;
      const { data } = await c.from("waitlist").select("*").ilike("email", likeExact(email)).limit(1);
      if (Array.isArray(data) && data[0]) row = data[0];
      if (row) {
        const links = Array.from(new Set([...(Array.isArray(row.sample_links) ? row.sample_links : []), link])).slice(-10);
        const patch: any = { sample_links: links, notes: note, social_handle: handle };
        if (String(row.source || "") !== "csv_import") patch.source = LOW_FOLLOWERS_SOURCE;
        if (followers !== null) { patch.followers = followers; patch.ig_followers = followers; }
        if (String(row.status || "").toLowerCase() === "rejected") patch.status = "Pending";
        const { error } = await c.from("waitlist").update(onlyColumns(patch, WAITLIST_COLUMNS)).eq("id", row.id);
        if (error) throw error;
      } else {
        const ins: any = {
          id: crypto.randomUUID(), name: String(req.body?.name || "").trim().slice(0, 80) || handle, email, role: "creator", status: "Pending",
          social_handle: handle, instagram_link: `https://instagram.com/${handle}`, followers, ig_followers: followers,
          sample_links: [link], notes: note, source: LOW_FOLLOWERS_SOURCE,
          profile_photo_url: String(req.body?.photo_url || "").startsWith("http") || String(req.body?.photo_url || "").startsWith("/") ? String(req.body.photo_url).slice(0, 500) : null,
          is_registered_user: false, created_at: new Date().toISOString(),
        };
        const { error } = await c.from("waitlist").insert([onlyColumns(ins, WAITLIST_COLUMNS)]);
        if (error) throw error;
      }
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("[follower-gate public] save failed:", e?.message || e);
      return res.status(500).json({ error: "Couldn't send it just now. Please try again.", code: "SAVE_FAILED" });
    }
  });

  // Admin → Platform Settings → Creator sign-up → "Minimum followers to join"
  router.get("/admin/follower-gate", async (req: any, res: any) => {
    const user = await deps.parseAuthUser(req).catch(() => null);
    if (!isAdminStaff(user)) return res.status(403).json({ error: "Admins only" });
    return res.json({ min: await getMinFollowers(), default: DEFAULT_MIN_FOLLOWERS, max: MAX_MIN_FOLLOWERS });
  });
  router.post("/admin/follower-gate", async (req: any, res: any) => {
    const user = await deps.parseAuthUser(req).catch(() => null);
    if (!isAdminStaff(user)) return res.status(403).json({ error: "Admins only" });
    const min = cleanMinFollowers(req.body?.min);
    if (min === null) return res.status(400).json({ error: `Enter a number from 0 to ${MAX_MIN_FOLLOWERS.toLocaleString("en-IN")} (0 = no limit).`, code: "BAD_MIN" });
    try { await setMinFollowers(min, String(user.email || user.user_id || "admin")); }
    catch (e: any) { return res.status(500).json({ error: "Couldn't save. Please try again.", code: "SAVE_FAILED" }); }
    return res.json({ ok: true, min });
  });

  router.post("/creator/follower-gate/work", async (req: any, res: any) => {
    const user = await creatorOf(req);
    if (!user) return res.status(403).json({ error: "Please log in as a creator first.", code: "NOT_CREATOR" });
    const link = cleanWorkLink(req.body?.link);
    if (!link) return res.status(400).json({ error: "Paste a full link, like a reel, Drive or portfolio link.", code: "BAD_LINK" });
    const now = Date.now();
    const hits = (recent.get(user.user_id) || []).filter((t) => now - t < 3600000);
    if (hits.length >= 10) return res.status(429).json({ error: "Too many tries. Please try again in a while.", code: "RATE_LIMIT" });
    hits.push(now); recent.set(user.user_id, hits);
    const c = db();
    if (!c) return res.json({ ok: true });
    const handle = String(req.body?.handle || "").trim().replace(/^@+/, "").slice(0, 60);
    const fRaw = req.body?.followers == null || req.body?.followers === "" ? NaN : Number(req.body.followers);
    const followers = Number.isFinite(fRaw) && fRaw >= 0 ? Math.round(fRaw) : null;
    // v397: "unverified" = Instagram couldn't be read (private / personal / not Professional)
    const note = String(req.body?.reason || "") === "unverified"
      ? "Instagram couldn't be read (private / personal / not a Professional account) — shared a work link from sign-up. Reach out personally if the work fits."
      : `Below ${await getMinFollowers()} followers — shared a work link from sign-up. Reach out personally if the work fits.`;
    try {
      let row = await findRow(user);
      const email = String(user.email || "").toLowerCase().trim();
      if (!row && email) {
        const { data } = await c.from("waitlist").select("*").ilike("email", likeExact(email)).limit(1);
        if (Array.isArray(data) && data[0]) row = data[0];
      }
      if (row) {
        const links = Array.from(new Set([...(Array.isArray(row.sample_links) ? row.sample_links : []), link])).slice(-10);
        const patch: any = { sample_links: links, source: LOW_FOLLOWERS_SOURCE, notes: note, linked_user_id: user.user_id, is_registered_user: true };
        if (handle) patch.social_handle = handle;
        if (followers !== null) { patch.followers = followers; patch.ig_followers = followers; }
        if (String(row.status || "").toLowerCase() === "rejected") patch.status = "Pending";
        const { error } = await c.from("waitlist").update(onlyColumns(patch, WAITLIST_COLUMNS)).eq("id", row.id);
        if (error) throw error;
      } else {
        const ins: any = {
          id: crypto.randomUUID(), name: user.name || handle || "Creator", email: email || null, role: "creator", status: "Pending",
          social_handle: handle || null, instagram_link: handle ? `https://instagram.com/${handle}` : null,
          followers, ig_followers: followers, sample_links: [link], notes: note, source: LOW_FOLLOWERS_SOURCE,
          profile_photo_url: user.picture || null, is_registered_user: true, linked_user_id: user.user_id,
          created_at: new Date().toISOString(),
        };
        const { error } = await c.from("waitlist").insert([onlyColumns(ins, WAITLIST_COLUMNS)]);
        if (error) throw error;
      }
      return res.json({ ok: true });
    } catch (e: any) {
      console.error("[follower-gate] save failed:", e?.message || e);
      return res.status(500).json({ error: "Couldn't send it just now. Please try again.", code: "SAVE_FAILED" });
    }
  });

  // Guard in front of the (locked) profile save: finishing sign-up needs 500+ followers.
  router.post("/creators/profile", async (req: any, res: any, next: any) => {
    try {
      const b = req.body || {};
      if (b.onboarding_complete !== true && String(b.profile_status || "") !== "under_review") return next();
      const user = await creatorOf(req);
      if (!user || !db()) return next();
      const { data: p } = await db().from("creator_profiles").select("*").eq("user_id", user.user_id).maybeSingle();
      if (p?.onboarding_complete === true) return next(); // already finished before — never block an existing creator
      const f = profileFollowers({ ...(p || {}), follower_count: b.follower_count ?? p?.follower_count });
      const min = await getMinFollowers();
      // v397 (Ravi, 3 Nov): no follower number at all = Instagram was never read (private / personal account) → not in.
      if (f === null && min > 0 && !(await isExempt(user, p))) {
        return res.status(403).json({ code: "IG_NOT_VERIFIED", min, error: "We couldn't read your Instagram. Make it a public Professional (Creator) account and try again.", detail: "We couldn't read your Instagram. Make it a public Professional (Creator) account and try again." });
      }
      if (!belowMinFollowers(f, false, min)) return next();
      if (await isExempt(user, p)) return next();
      return res.status(403).json({
        code: "LOW_FOLLOWERS", min, followers: f,
        error: `Brands on Ybex look for ${min}+ followers.`, detail: `Brands on Ybex look for ${min}+ followers.`,
      });
    } catch (e) { logIgnored("followerGate:guard", e); }
    return next();
  });
}
