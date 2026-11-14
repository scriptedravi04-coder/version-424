import express from "express";
import { SESSION_MS } from "./authSecurity";
import crypto from "crypto";
import axios from "axios";
import { newSessionToken, escapeLike, pickLoginUser, sessionCookieOptions } from "./authSecurity";
import { fallbackSecret } from "./fallbackSecret"; // v396
import { cleanEnvVal } from "./envBundle"; // v385
import { ephemeralSet, ephemeralTake, ephemeralGet } from "./ephemeralStore"; // v378: iPhone Home Screen app sign-in hand-off
import { signupFollowerBlock } from "./followerGate";
import { kickInstagramRefresh } from "./instagramConnect";
import { rememberPreSource, hasTags } from "./signupSource"; // v418: ad tags survive the Google / Apple hop // v410 // v408: pending Google sign-up checks followers too

// Session 43 (v286, Ravi): "Continue with Google" (iPhone + Android) and "Continue with Apple"
// (iPhone) on the app's login screen.
//
// Same-window redirect flow (works inside the installed app, where pop-ups don't come back):
//   1. GET  /auth/oauth/url?provider=google|apple&role=creator|brand → { url }
//   2. the app opens that url; Google / Apple send the person back to
//        GET  /api/auth/oauth/google/callback   (code)
//        POST /api/auth/oauth/apple/callback    (form_post: code + id_token + user)
//   3. we find the account by e-mail (or make one, already verified), start a normal session
//      (Supabase user_sessions, same as e-mail login) and redirect to /app/oauth#token=… —
//      the token is in the #fragment, so it never reaches any server log.
//
// Settings (env):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   (already used by the old pop-up flow)
//   APPLE_CLIENT_ID = the Apple "Services ID" (e.g. in.ybexmedia.signin)
// Redirect URLs to register:  https://<host>/api/auth/oauth/google/callback  (Google Cloud)
//                             https://<host>/api/auth/oauth/apple/callback   (Apple Services ID)
// Apple's id_token is checked against Apple's public keys (no Apple private key needed).

const PROVIDERS = new Set(["google", "apple"]);
const ROLES = new Set(["creator", "brand"]);
const STATE_TTL_MS = 15 * 60 * 1000;

function stateSecret() {
  return process.env.OAUTH_STATE_SECRET || process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || fallbackSecret(); // v396 (QA S-11)
}
const b64u = (buf: Buffer | string) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const fromB64u = (s: string) => Buffer.from(String(s || "").replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** Signed, short-lived state: which role the person tapped, and a nonce. */
export const HANDOFF_RE = /^[a-f0-9]{32}$/;
/** v378: Google tokeninfo answer → our app, real Google, not expired, verified e-mail. Pure. */
export function googleIdTokenOk(info: any, allowedAud: string[], now = Date.now()) {
  if (!info || !allowedAud.includes(String(info.aud || ""))) return false;
  if (!["accounts.google.com", "https://accounts.google.com"].includes(String(info.iss || ""))) return false;
  if (!(Number(info.exp) * 1000 > now)) return false;
  return Boolean(info.email) && (info.email_verified === true || info.email_verified === "true");
}
export function makeState(role: string | null, now = Date.now(), secret = stateSecret(), native = false, handoff = "", redirectUri = "", join = false) {
  // v335: a = 1 → started inside the iPhone app (Capacitor); the callback sends the person back into the app.
  const body = b64u(JSON.stringify({ r: ROLES.has(String(role)) ? role : null, n: crypto.randomBytes(9).toString("hex"), t: now, ...(native ? { a: 1 } : {}), ...(HANDOFF_RE.test(handoff) ? { h: handoff } : {}), ...(/^https:\/\/[^\s]{1,300}$/.test(redirectUri) ? { u: redirectUri } : {}), ...(join ? { j: 1 } : {}) }));
  const sig = b64u(crypto.createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}
/** v418: move the ad tags saved at sign-in start onto the e-mail Google / Apple returned. Never throws. */
async function carryOauthSource(state: string, email: any) {
  try {
    if (!state || !email) return;
    const src = await ephemeralGet(`oasrc:${crypto.createHash("sha256").update(state).digest("hex").slice(0, 40)}`);
    if (src) await rememberPreSource(email, src);
  } catch { /* tags are optional */ }
}

export function readState(state: string, now = Date.now(), secret = stateSecret()): { r: string | null; n: string; native?: boolean; h?: string; u?: string; j?: boolean } | null {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return null;
  const want = b64u(crypto.createHmac("sha256", secret).update(body).digest());
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(fromB64u(body).toString("utf8"));
    if (!p || typeof p.t !== "number" || now - p.t > STATE_TTL_MS || p.t - now > 60000) return null;
    return { r: ROLES.has(p.r) ? p.r : null, n: String(p.n || ""), ...(p.a === 1 ? { native: true } : {}), ...(HANDOFF_RE.test(String(p.h || "")) ? { h: String(p.h) } : {}), ...(/^https:\/\/[^\s]{1,300}$/.test(String(p.u || "")) ? { u: String(p.u) } : {}), ...(p.j === 1 ? { j: true } : {}) };
  } catch {
    return null;
  }
}

/** Checks an Apple id_token (RS256) against Apple's keys. Returns its claims or throws. */
export async function verifyAppleIdToken(idToken: string, clientId: string, getKeys: () => Promise<any[]>, now = Date.now()) {
  const [h, p, s] = String(idToken || "").split(".");
  if (!h || !p || !s) throw new Error("bad token");
  const header = JSON.parse(fromB64u(h).toString("utf8"));
  const claims = JSON.parse(fromB64u(p).toString("utf8"));
  if (header.alg !== "RS256") throw new Error("bad alg");
  const jwk = (await getKeys()).find((k: any) => k.kid === header.kid);
  if (!jwk) throw new Error("unknown key");
  const key = crypto.createPublicKey({ key: jwk, format: "jwk" } as any);
  const ok = crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), key, fromB64u(s));
  if (!ok) throw new Error("bad signature");
  if (claims.iss !== "https://appleid.apple.com") throw new Error("bad issuer");
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(clientId)) throw new Error("bad audience");
  if (!claims.exp || claims.exp * 1000 < now) throw new Error("expired");
  return claims;
}

let appleKeys: { at: number; keys: any[] } | null = null;
async function getAppleKeys() {
  if (appleKeys && Date.now() - appleKeys.at < 6 * 3600e3) return appleKeys.keys;
  const { data } = await axios.get("https://appleid.apple.com/auth/keys", { timeout: 8000 });
  appleKeys = { at: Date.now(), keys: Array.isArray(data?.keys) ? data.keys : [] };
  return appleKeys.keys;
}

export type OAuthDeps = { supabase: any; privilegedSupabase: any; getDb: () => any; saveDb: (db: any) => void };
export type OAuthProfile = { email: string; name: string; picture: string; provider: string; role: string | null };

/**
 * v291 (Ravi: "I am logged in on my phone with this Google account, but on the website 'Continue with
 * Google' offered to create a new account"): ONE place that turns a verified Google / Apple e-mail into
 * a session — used by the app's redirect flow AND the website's pop-up flow. The account is looked up
 * by e-mail in Supabase (the real user table), never only in the local JSON store, so an account made
 * on the phone is the same account on the website.
 */
export async function oauthSignInCore(
  { supabase, privilegedSupabase, getDb, saveDb }: OAuthDeps,
  p: OAuthProfile,
  opts: { noCreate?: boolean } = {}
): Promise<{ ok: boolean; token?: string; user?: any; created?: boolean; error?: string }> { // v295: type only — this project's tsc is not strict, so the old ok:true|false union did not narrow (4 tsc errors)
  const c = privilegedSupabase || supabase;
  const email = String(p.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { ok: false, error: "no_email" };
  let user: any = null;
  let created = false;
  if (c) {
    const { data, error } = await c.from("users").select("*").ilike("email", escapeLike(email)).limit(5);
    if (error) return { ok: false, error: "lookup" };
    user = pickLoginUser(Array.isArray(data) ? data : [], email);
  } else {
    user = (getDb().users || []).find((u: any) => String(u.email || "").toLowerCase() === email) || null;
  }
  if (user) {
    if (user.is_deleted) return { ok: false, error: "deleted" };
    if (user.banned) return { ok: false, error: "banned" };
    if (user.role === "admin" || user.is_admin === true) return { ok: false, error: "admin" };
    const patch: any = {};
    if (!user.role && p.role) patch.role = p.role;
    if (!user.verified) {
      patch.verified = true; // Google / Apple already proved the e-mail
      // Session 58 (security): a password set before the email was ever verified may not be the owner's — clear it.
      if (user.password_hash) patch.password_hash = null;
    }
    if (!user.name && p.name) patch.name = p.name;
    if (Object.keys(patch).length) {
      if (c) await c.from("users").update(patch).eq("user_id", user.user_id);
      user = { ...user, ...patch };
    }
  } else if (opts.noCreate) {
    return { ok: false, error: "not_registered" }; // v408: Google on the Join screen never makes an account by itself
  } else {
    created = true;
    user = {
      user_id: crypto.randomUUID(), email, name: p.name || email.split("@")[0], picture: p.picture || "",
      role: p.role || null, phone: "", auth_method: p.provider, created_at: new Date().toISOString(),
      onboarded: false, verified: true,
    };
    if (c) {
      const { error } = await c.from("users").insert(user);
      if (error) { console.error("[oauth] create user:", error.message); return { ok: false, error: "create" }; }
    }
    const db = getDb(); if (!db.users) db.users = []; db.users.push(user); saveDb(db);
  }
  const session = {
    user_id: user.user_id, session_token: newSessionToken(),
    expires_at: new Date(Date.now() + SESSION_MS).toISOString(), created_at: new Date().toISOString(), // Session 58: 30 days, renewed while the app is used
  };
  if (c) {
    const { error } = await c.from("user_sessions").insert(session);
    if (error) { console.error("[oauth] session:", error.message); return { ok: false, error: "session" }; }
  }
  const db = getDb(); if (!db.user_sessions) db.user_sessions = []; db.user_sessions.push(session); saveDb(db);
  return { ok: true, token: session.session_token, user, created };
}

/** v405 (Ravi 5 Nov, iPhone: Google "redirect_uri_mismatch … redirect_uri=http://localhost:3000/…"): the hosting's
 *  own front proxy now reaches the app as Host = localhost:3000, so Google got a localhost address. Rules:
 *  - came through the Cloudflare Worker (x-forwarded-host = ybexmedia.in) → that;
 *  - the hosting address (ai.studio / run.app) in Host or x-forwarded-host → https://ybexmedia.in (v378);
 *  - localhost / 127.0.0.1 on the live server (NODE_ENV=production, not QA) → https://ybexmedia.in;
 *  - otherwise the real Host (local dev keeps http://localhost:3000). */
export function oauthOrigin(hostRaw: string, fwdRaw: string, env: Record<string, string | undefined> = process.env): string {
  const PUBLIC = new Set(["ybexmedia.in", "www.ybexmedia.in"]);
  const fwd = String(fwdRaw || "").split(",")[0].trim().toLowerCase();
  const host = String(hostRaw || "").trim().toLowerCase();
  if (PUBLIC.has(fwd)) return `https://${fwd}`;
  const hosted = (h: string) => /(\.|^)ai\.studio$|\.run\.app$/i.test(h.split(":")[0]);
  if (hosted(host) || hosted(fwd)) return "https://ybexmedia.in";
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  if (local && env.NODE_ENV === "production" && env.OAUTH_ALLOW_LOCALHOST !== "true") return "https://ybexmedia.in";
  if (!host) return "https://ybexmedia.in";
  return `${local ? "http" : "https"}://${host}`;
}

export const isIosUserAgent = (ua: string) => /iPhone|iPad|iPod/i.test(String(ua || "")) || (/Macintosh/i.test(String(ua || "")) && /Mobile/i.test(String(ua || "")));

export function setupOAuthRoutes(
  router: express.Router,
  { supabase, privilegedSupabase, getDb, saveDb }: { supabase: any; privilegedSupabase: any; getDb: () => any; saveDb: (db: any) => void }
) {
  // v377 (Ravi: "Google login: redirect_uri still ybexapp.ai.studio"): ybexmedia.in reaches the app through the Cloudflare
  // Worker, which sends Host = the AI Studio address and x-forwarded-host = ybexmedia.in. A request that came in on the
  // public site now gets ybexmedia.in for Google's redirect_uri and the return page, so sign-in stays on ybexmedia.in.
  // Only the known public hosts are taken from that header (anything else → the real Host, as before).
  const origin = (req: express.Request) => oauthOrigin(String(req.get("host") || ""), String(req.get("x-forwarded-host") || ""));
  // v335: native = the sign-in started inside the iPhone app → back through the app's own link (com.ybex.app://).
  const back = (req: express.Request, res: express.Response, params: Record<string, string>, native = false) =>
    res.redirect(302, native
      ? `com.ybex.app://oauth#${new URLSearchParams(params).toString()}`
      : `${origin(req)}/app/oauth#${new URLSearchParams(params).toString()}`);

  router.get("/auth/oauth/url", (req, res) => {
    const provider = String(req.query.provider || "");
    if (!PROVIDERS.has(provider)) return res.status(400).json({ error: "Unknown sign-in option." });
    // v385: the redirect URI used here is signed into the state and reused for the token exchange (must be identical).
    const redirectUri = `${origin(req)}/api/auth/oauth/${provider}/callback`;
    const state = makeState(String(req.query.role || ""), Date.now(), stateSecret(), String(req.query.app || "") === "native", String(req.query.handoff || ""), redirectUri, String(req.query.join || "") === "1");
    // v418: the ad tags of the browser that started sign-in, kept for the callback (which may land in another browser)
    try {
      const src = JSON.parse(String(req.query.src || "null"));
      if (hasTags(src)) void ephemeralSet(`oasrc:${crypto.createHash("sha256").update(state).digest("hex").slice(0, 40)}`, src, 30 * 60 * 1000);
    } catch { /* no tags */ }
    if (provider === "google") {
      const client_id = cleanEnvVal(process.env.GOOGLE_CLIENT_ID);
      if (!client_id) return res.status(503).json({ error: "Google sign-in is not set up yet. Please use your email for now." });
      // v291 (Ravi: iPhone asks to type the Google ID, no account list): the installed iPhone app has
      // no Google cookies, so Google cannot list accounts. If the app knows an e-mail (last login, or the
      // one the person typed) it goes in as login_hint and Google opens straight on that account.
      const hint = String(req.query.hint || "").trim().toLowerCase();
      const validHint = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hint) && hint.length <= 254;
      const q = new URLSearchParams({
        client_id, redirect_uri: redirectUri, response_type: "code",
        scope: "openid email profile", state,
        ...(validHint ? { login_hint: hint } : { prompt: "select_account" }),
      });
      return res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}` });
    }
    const client_id = cleanEnvVal(process.env.APPLE_CLIENT_ID);
    if (!client_id) return res.status(503).json({ error: "Apple sign-in is not set up yet. Please use your email for now." });
    const q = new URLSearchParams({
      client_id, redirect_uri: redirectUri, response_type: "code id_token",
      response_mode: "form_post", scope: "name email", state,
    });
    return res.json({ url: `https://appleid.apple.com/auth/authorize?${q.toString()}` });
  });

  /** Finds the account by e-mail or makes a new verified one, then starts a session. */
  // v408 (Ravi 5 Nov, Join screen "Continue with Google"): an existing account logs in; a NEW Google account makes no
  // account yet — the verified Google profile is parked for 30 min and the app asks for the Instagram username first.
  // POST /auth/oauth/pending/complete then makes the account with that Google (no second Google tap).
  const parkPending = async (p: { email: string; name: string; picture: string; provider: string }) => {
    const id = crypto.randomBytes(16).toString("hex");
    await ephemeralSet(`oauth:pending:${id}`, { email: String(p.email).toLowerCase(), name: p.name || "", picture: p.picture || "", provider: p.provider }, 30 * 60 * 1000);
    return id;
  };
  async function signIn(req: express.Request, res: express.Response, p: { email: string; name: string; picture: string; provider: string; role: string | null; native?: boolean; handoff?: string; join?: boolean }) {
    const r = await oauthSignInCore({ supabase, privilegedSupabase, getDb, saveDb }, p, { noCreate: Boolean(p.join) });
    if (!r.ok && r.error === "not_registered") {
      let id = "";
      try { id = await parkPending(p); } catch { return back(req, res, { error: "pending" }, Boolean(p.native)); }
      if (p.handoff && HANDOFF_RE.test(p.handoff)) {
        try { await ephemeralSet(`oauth:handoff:${p.handoff}`, { pending: id, email: String(p.email).toLowerCase() }, 10 * 60 * 1000); } catch { /* the sheet still carries it */ }
      }
      return back(req, res, { pending: id, email: String(p.email).toLowerCase(), ...(p.handoff ? { handoff: "1" } : {}) }, Boolean(p.native));
    }
    if (!r.ok) return back(req, res, { error: r.error }, Boolean(p.native));
    // v378 (Ravi: "Google sign-in app ke andar website chala deta hai"): an iPhone Home Screen app opens Google in a
    // separate browser sheet, and the sign-in came back inside that sheet (the website ran there, the app stayed logged
    // out). The app waits for this one-time hand-off and signs itself in; the sheet just says "go back to the app".
    if (p.handoff && HANDOFF_RE.test(p.handoff)) {
      try { await ephemeralSet(`oauth:handoff:${p.handoff}`, { token: r.token, role: r.user.role || p.role || "" }, 10 * 60 * 1000); } catch { /* the sheet still signs in */ }
    }
    res.cookie("session_token", r.token, sessionCookieOptions());
    res.cookie("has_session", "true", { ...sessionCookieOptions(), httpOnly: false });
    return back(req, res, { token: r.token, role: r.user.role || p.role || "", ...(p.handoff ? { handoff: "1" } : {}) }, Boolean(p.native));
  }

  // v378 (Ravi: "dusre apps ki tarah phone ke Google accounts dikhao, naya account mat maango"): inside the Android /
  // iPhone app the phone's own Google account picker (@capgo/capacitor-social-login) gives an ID token; we check it with
  // Google and start the same session as the browser flow. Older app builds without the plugin keep the browser flow.
  router.get("/auth/oauth/google/native-config", (_req, res) => {
    res.json({ web: cleanEnvVal(process.env.GOOGLE_CLIENT_ID), ios: cleanEnvVal(process.env.GOOGLE_IOS_CLIENT_ID) });
  });
  router.post("/auth/oauth/google/native", express.json({ limit: "16kb" }), async (req, res) => {
    const idToken = String(req.body?.idToken || "");
    const role = ROLES.has(String(req.body?.role)) ? String(req.body.role) : null;
    if (!idToken || idToken.length > 4096) return res.status(400).json({ error: "google" });
    try {
      const info = (await axios.get("https://oauth2.googleapis.com/tokeninfo", { params: { id_token: idToken }, timeout: 10000 })).data || {};
      const allowed = [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_IOS_CLIENT_ID, process.env.GOOGLE_ANDROID_CLIENT_ID].map(cleanEnvVal).filter(Boolean);
      if (!googleIdTokenOk(info, allowed)) return res.status(401).json({ error: "google" });
      const prof = { email: String(info.email), name: String(info.name || ""), picture: String(info.picture || ""), provider: "google", role };
      const r = await oauthSignInCore({ supabase, privilegedSupabase, getDb, saveDb }, prof, { noCreate: req.body?.join === true });
      if (!r.ok && r.error === "not_registered") return res.json({ pending: await parkPending(prof), email: prof.email.toLowerCase() }); // v408
      if (!r.ok) return res.status(r.error === "banned" || r.error === "deleted" || r.error === "admin" ? 403 : 500).json({ error: r.error });
      return res.json({ token: r.token, role: r.user.role || role || "" });
    } catch (e: any) {
      console.error("[oauth] google native:", e?.response?.data || e?.message || e);
      return res.status(401).json({ error: "google" });
    }
  });

  // v378: the iPhone Home Screen app asks here (every 2 s) for the sign-in that finished in the browser sheet. One-time.
  router.get("/auth/oauth/handoff", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const h = String(req.query.h || "");
    if (!HANDOFF_RE.test(h)) return res.status(400).json({ error: "bad" });
    const v = await ephemeralTake(`oauth:handoff:${h}`).catch(() => null);
    if (v?.pending) return res.json({ pending_signup: v.pending, email: v.email || "" }); // v408
    if (!v?.token) return res.status(404).json({ pending: true });
    return res.json({ token: v.token, role: v.role || "" });
  });

  // v408: finish a parked Google sign-up once the Instagram username passed the Join screen. The server checks the
  // follower minimum again (signupFollowerBlock) before any account is made; the Instagram username is saved on the profile.
  router.post("/auth/oauth/pending/complete", express.json({ limit: "8kb" }), async (req, res) => {
    const id = String(req.body?.pending || "");
    if (!/^[a-f0-9]{32}$/.test(id)) return res.status(400).json({ error: "bad", code: "BAD_PENDING" });
    const ig = String(req.body?.instagram || "").trim().replace(/^@+/, "").toLowerCase().slice(0, 60);
    if (!/^[a-z0-9._]{1,30}$/.test(ig)) return res.status(400).json({ error: "Enter your Instagram username.", code: "BAD_HANDLE", field: "instagram" });
    const p = await ephemeralGet(`oauth:pending:${id}`).catch(() => null);
    if (!p?.email) return res.status(410).json({ error: "This Google sign-in expired. Please tap Continue with Google again.", code: "PENDING_EXPIRED" });
    const c = privilegedSupabase || supabase;
    const block = await signupFollowerBlock(c, { instagram: ig, email: p.email });
    if (block) return res.status(block.status).json({ ...block.body, field: "instagram" });
    const r = await oauthSignInCore({ supabase, privilegedSupabase, getDb, saveDb }, { email: p.email, name: p.name, picture: p.picture, provider: p.provider || "google", role: "creator" });
    if (!r.ok) return res.status(r.error === "banned" || r.error === "deleted" || r.error === "admin" ? 403 : 500).json({ error: r.error });
    await ephemeralTake(`oauth:pending:${id}`).catch(() => null);
    if (c && r.user?.user_id) {
      try {
        const { data: row } = await c.from("creator_profiles").select("user_id, instagram, instagram_handle").eq("user_id", r.user.user_id).maybeSingle();
        if (!row) await c.from("creator_profiles").insert({ user_id: r.user.user_id, name: r.user.name || `@${ig}`, email: r.user.email, instagram: ig, instagram_handle: ig, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        else if (!row.instagram && !row.instagram_handle) await c.from("creator_profiles").update({ instagram: ig, instagram_handle: ig, updated_at: new Date().toISOString() }).eq("user_id", r.user.user_id);
      } catch (e: any) { console.warn("[oauth] pending ig:", e?.message || e); }
      kickInstagramRefresh(r.user.user_id); // v410
    }
    res.cookie("session_token", r.token, sessionCookieOptions());
    res.cookie("has_session", "true", { ...sessionCookieOptions(), httpOnly: false });
    return res.json({ token: r.token, role: r.user.role || "creator", created: Boolean(r.created) });
  });

  router.get("/auth/oauth/google/callback", async (req, res) => {
    const st = readState(String(req.query.state || ""));
    if (!st || !req.query.code) return back(req, res, { error: req.query.error ? "cancelled" : "state" }, Boolean(st?.native));
    try {
      const tok = await axios.post("https://oauth2.googleapis.com/token", {
        client_id: cleanEnvVal(process.env.GOOGLE_CLIENT_ID), client_secret: cleanEnvVal(process.env.GOOGLE_CLIENT_SECRET), code: String(req.query.code),
        redirect_uri: st.u || `${origin(req)}/api/auth/oauth/google/callback`, grant_type: "authorization_code",
      }, { timeout: 10000 });
      const info = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${tok.data.access_token}` }, timeout: 10000 });
      const pr = info.data || {};
      if (!pr.email || pr.email_verified === false) return back(req, res, { error: "no_email" }, Boolean(st.native));
      await carryOauthSource(String(req.query.state || ""), pr.email); // v418
      return await signIn(req, res, { email: pr.email, name: pr.name || "", picture: pr.picture || "", provider: "google", role: st.r, native: Boolean(st.native), handoff: st.h, join: Boolean(st.j) });
    } catch (e: any) {
      const gErr = e?.response?.data || {};
      console.error("[oauth] google:", gErr || e?.message || e);
      // v385: Google's reason (invalid_client / redirect_uri_mismatch / invalid_grant) travels to the error page as a short code.
      const reason = String(gErr.error || "").replace(/[^a-z_]/g, "").slice(0, 40);
      return back(req, res, { error: "google", ...(reason ? { reason } : {}) }, Boolean(st.native));
    }
  });

  router.post("/auth/oauth/apple/callback", express.urlencoded({ extended: false }), async (req, res) => {
    const body: any = req.body || {};
    const st = readState(String(body.state || ""));
    if (!st || !body.id_token) return back(req, res, { error: body.error ? "cancelled" : "state" }, Boolean(st?.native));
    try {
      const claims = await verifyAppleIdToken(String(body.id_token), String(process.env.APPLE_CLIENT_ID || ""), getAppleKeys);
      let name = "";
      try { const u = JSON.parse(String(body.user || "{}")); name = [u?.name?.firstName, u?.name?.lastName].filter(Boolean).join(" "); } catch { /* only sent the first time */ }
      await carryOauthSource(String(body.state || ""), claims.email); // v418
      return await signIn(req, res, { email: String(claims.email || ""), name, picture: "", provider: "apple", role: st.r, native: Boolean(st.native), handoff: st.h, join: Boolean(st.j) });
    } catch (e: any) {
      console.error("[oauth] apple:", e?.message || e);
      return back(req, res, { error: "apple" }, Boolean(st.native));
    }
  });
}
