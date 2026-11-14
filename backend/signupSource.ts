// Session 58 (Ravi: "han kro") — where a signup came from (Instagram, Google, Meta ads, …).
// The browser remembers the first link a visitor arrived on (src/lib/signupSource.js). Right after any
// sign-in (email, Google or Apple) it sends that once to POST /auth/signup-source; the server saves it
// only for a NEW account (made in the last 2 days) that has no source yet — so it is written once and an
// old account can never be relabelled. Nothing in sign-up / login depends on this; a failure is ignored.
import express from "express";
import { logIgnored } from "./logIgnored";
import crypto from "crypto";
import { ephemeralGet, ephemeralSet } from "./ephemeralStore"; // v418
import { sendRegistration } from "./metaCapi"; // v418: server copy of CompleteRegistration

// v418 (Ravi: "92 signups me utm khaali tha"): people tap an ad inside Instagram / Facebook, but finish signing up in
// another browser (Google blocks sign-in inside those apps; e-mail codes get opened later in Chrome). That browser has no
// UTM, so the account said "direct". The ad's tags are now also kept on the server against the e-mail (typed on the
// sign-up screen, or learnt from Google / Apple sign-in) for 3 days and used when the browser sends none.
const PRE_TTL = 3 * 24 * 60 * 60 * 1000;
const preKey = (email: string) => `presrc:${crypto.createHash("sha256").update(String(email || "").trim().toLowerCase()).digest("hex").slice(0, 40)}`;
export const hasTags = (b: any) => Boolean(b && (b.utm_source || b.gclid || b.fbclid));
const tagsOnly = (b: any) => ({
  utm_source: String(b?.utm_source || "").slice(0, 120), utm_medium: String(b?.utm_medium || "").slice(0, 120),
  utm_campaign: String(b?.utm_campaign || "").slice(0, 120), gclid: b?.gclid ? 1 : 0, fbclid: b?.fbclid ? 1 : 0,
});
/** Remember an ad visit's tags for this e-mail (only when there are tags). Never throws. */
export async function rememberPreSource(email: any, body: any): Promise<boolean> {
  try {
    const e = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || !hasTags(body)) return false;
    await ephemeralSet(preKey(e), tagsOnly(body), PRE_TTL);
    return true;
  } catch (err: any) { logIgnored("signupSource:pre-save", err); return false; }
}
export async function preSourceFor(email: any): Promise<any> {
  try { const e = String(email || "").trim().toLowerCase(); return e ? await ephemeralGet(preKey(e)) : null; }
  catch (err: any) { logIgnored("signupSource:pre-read", err); return null; }
}

const clip = (v: any, n = 80) => {
  const s = String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9 ._\-/:]/g, "").slice(0, n);
  return s || null;
};

const PAID = new Set(["cpc", "ppc", "paid", "paid_social", "paidsocial", "ads", "ad", "display", "sponsored"]);

/** Pure: one channel name from what the browser saw. */
export function channelFrom(input: { utm_source?: any; utm_medium?: any; referrer?: any; gclid?: any; fbclid?: any; app?: any }): string {
  const src = clip(input?.utm_source) || "";
  const med = clip(input?.utm_medium) || "";
  const ref = String(input?.referrer || "").toLowerCase();
  const paid = PAID.has(med) || !!input?.gclid;
  let host = "";
  if (ref.startsWith("android-app://")) return "android_app";
  try { host = ref ? new URL(ref).hostname.replace(/^www\.|^m\.|^l\./, "") : ""; } catch { host = ""; }
  const key = src || host;
  const pick = (k: string) => {
    if (/instagram|^ig$/.test(k)) return paid ? "meta_ads" : "instagram";
    if (/facebook|^fb$|^meta$/.test(k)) return paid ? "meta_ads" : "facebook";
    if (/google/.test(k)) return paid ? "google_ads" : "google";
    if (/youtube|youtu\.be/.test(k)) return "youtube";
    if (/linkedin|lnkd\.in/.test(k)) return "linkedin";
    if (/whatsapp|wa\.me/.test(k)) return "whatsapp";
    if (/twitter|^x$|t\.co|x\.com/.test(k)) return "x";
    if (/bing|yahoo|duckduckgo/.test(k)) return "other_search";
    return "";
  };
  const named = pick(key);
  if (named) return named;
  if (!key && input?.gclid) return "google_ads";
  if (!key && input?.fbclid) return "facebook";
  if (src) return paid ? `${src}_ads`.slice(0, 40) : src.slice(0, 40);
  if (host && !/ybex/.test(host)) return "other_website";
  if (input?.app) return "app";
  return "direct";
}

/** Pure: what to write on the user row. */
export function sourceRow(body: any) {
  const b = body && typeof body === "object" ? body : {};
  return {
    signup_source: channelFrom(b),
    utm_source: clip(b.utm_source),
    utm_medium: clip(b.utm_medium),
    utm_campaign: clip(b.utm_campaign, 120),
  };
}

export const NEW_ACCOUNT_MS = 2 * 24 * 60 * 60 * 1000;

export function setupSignupSourceRoutes(router: express.Router, { supabase, privilegedSupabase, parseAuthUser }: any) {
  // v418: the website's "Get it on Google Play" button shows only once the Play listing is public (server setting).
  router.get("/public/app-links", (_req: any, res: any) => {
    res.set("Cache-Control", "public, max-age=300");
    res.json({ play_live: String(process.env.PLAY_STORE_LIVE || "").trim().toLowerCase() === "true", package: "com.ybex.app" });
  });
  // v418: the sign-up screen sends the ad's tags with the e-mail as soon as it is typed (no login needed; tags only).
  router.post("/auth/pre-source", async (req: any, res: any) => {
    const ok = await rememberPreSource(req.body?.email, req.body);
    res.json({ ok: true, saved: ok });
  });
  router.post("/auth/signup-source", async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user?.user_id) return res.status(401).json({ ok: false });
    const c = privilegedSupabase || supabase;
    if (!c) return res.json({ ok: false });
    try {
      const { data: row, error } = await c.from("users").select("user_id, email, role, created_at, signup_source").eq("user_id", user.user_id).maybeSingle();
      if (error || !row) return res.json({ ok: false });
      // v418: Meta CompleteRegistration through the Conversions API for a new account (once; app sign-ups go in as app events)
      const ageMs = Date.now() - new Date(row.created_at || 0).getTime();
      if (ageMs >= 0 && ageMs <= NEW_ACCOUNT_MS) void sendRegistration({ user: { ...user, ...row }, req });
      if (row.signup_source) return res.json({ ok: true, saved: false, reason: "already set" });
      const age = Date.now() - new Date(row.created_at || 0).getTime();
      if (!(age >= 0 && age <= NEW_ACCOUNT_MS)) return res.json({ ok: true, saved: false, reason: "not a new account" });
      // v418: this browser has no ad tags → use the ones saved against the e-mail on the sign-up screen / Google sign-in
      let body = req.body;
      if (!hasTags(body)) { const pre = await preSourceFor(row.email); if (pre) body = { ...(body || {}), ...pre }; }
      const out = sourceRow(body);
      const { error: upErr } = await c.from("users").update(out).eq("user_id", user.user_id).is("signup_source", null);
      if (upErr) { logIgnored("signupSource:update", upErr); return res.json({ ok: false }); }
      return res.json({ ok: true, saved: true, signup_source: out.signup_source });
    } catch (e: any) {
      logIgnored("signupSource", e);
      return res.json({ ok: false });
    }
  });
}
