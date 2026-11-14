// Session 36: signed links for "Stop these reminders" and "Unsubscribe" (no login needed, cannot be
// guessed or changed to another person). HMAC-SHA256 over kind + id with a server secret.
import crypto from "crypto";
import { publicSiteUrl } from "./siteUrl"; // v388

function secret(): string | null {
  return process.env.EMAIL_LINK_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

export function signEmailLink(kind: string, id: string): string | null {
  const s = secret();
  if (!s || !id) return null;
  return crypto.createHmac("sha256", s).update(`${kind}:${id}`).digest("base64url").slice(0, 32);
}

export function verifyEmailLink(kind: string, id: string, token: string): boolean {
  const expected = signEmailLink(kind, String(id || ""));
  if (!expected || typeof token !== "string" || token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

export function appBaseUrl(): string {
  if (process.env.VITEST || process.env.NODE_ENV === "test") return "https://ybexmedia.in";
  return publicSiteUrl(); // v388
}

/** Small HTML page for the result of clicking a link in an email. */
export function simplePage(title: string, body: string): string {
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} · Ybex</title></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f9fafb;margin:0;padding:48px 16px;color:#111827">
<div style="max-width:440px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:28px;text-align:center">
<h1 style="font-size:20px;margin:0 0 10px">${esc(title)}</h1><p style="margin:0 0 18px;color:#4b5563;line-height:1.5">${esc(body)}</p>
<a href="${appBaseUrl()}" style="color:#4f46e5;font-weight:600;text-decoration:none">Go to Ybex</a></div></body></html>`;
}

/** Same constant-time check the UGC deadline cron uses (header x-cron-secret). */
export function cronAuthorized(headerSecret: unknown): boolean {
  const s = process.env.CRON_SECRET;
  if (!s || typeof headerSecret !== "string") return false;
  const a = Buffer.from(headerSecret), b = Buffer.from(s);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
