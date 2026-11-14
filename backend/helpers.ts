import { checkComprehensiveDisallowedContent, FilterOptions, FilterResult } from "./contactSecurityFilter";
// Pure, standalone helper functions extracted from server.ts.
// These functions have no dependency on the app's internal state
// (database, Supabase client, in-memory db, etc.) — they only depend
// on their own arguments and process.env, so they're safe to import
// from anywhere without needing to pass in extra context.

import Razorpay from "razorpay";

/**
 * Resolves the "from" email address to use for outgoing emails,
 * falling back to the configured env var, then a hardcoded default.
 */
import { Resend as OriginalResend } from "resend";
import { lowPriorityBudget, queueLowEmail, isQuotaError, markQuotaFull, addSent, maybeFlush, flushLowEmails } from "./emailBudget";

// v399: the first real Resend client made on this server sends the night queue.
const rawSenders: Array<(opts: any) => Promise<any>> = [];
/** Call often (request middleware / timer): sends waiting low-priority mails in the night window. */
export function tickEmailQueue() {
  if (!rawSenders.length) {
    const key = getCleanResendApiKey(process.env.RESEND_API_KEY);
    if (!key) return;
    new Resend(key); // registers a raw sender
  }
  if (rawSenders[0]) maybeFlush(rawSenders[0]);
}
/** v419 (Ravi): Admin → Email broadcast → "Send now": send up to `n` waiting mails right away (any hour). */
export async function sendQueuedEmailsNow(n: number) {
  if (!rawSenders.length) {
    const key = getCleanResendApiKey(process.env.RESEND_API_KEY);
    if (!key) return { sent: 0, failed: 0, left_waiting: 0, budget: 0, error: "RESEND_API_KEY is not set on the server." };
    new Resend(key);
  }
  return flushLowEmails(rawSenders[0], new Date(), Math.max(0, Math.min(500, Math.floor(n))), { force: true });
}
import { publicSiteUrl } from "./siteUrl"; // v388

/**
 * Sanitizes and cleans Resend API keys, removing accidental concatenation
 * with email addresses, sender names, or whitespace.
 */
export function getCleanResendApiKey(key?: string): string | undefined {
  const raw = key || process.env.RESEND_API_KEY;
  if (!raw || typeof raw !== 'string') return undefined;
  let cleaned = raw.trim();
  if (cleaned.includes(" ")) {
    cleaned = cleaned.split(/\s+/)[0];
  }
  if (cleaned.includes("<")) {
    cleaned = cleaned.split("<")[0];
  }
  // Standard Resend API keys are 're_' followed by token (usually 36 characters)
  if (cleaned.startsWith("re_") && cleaned.length > 36) {
    cleaned = cleaned.slice(0, 36);
  }
  return cleaned;
}

// Auto-clean process.env.RESEND_API_KEY at startup if set
if (process.env.RESEND_API_KEY) {
  const cleanedKey = getCleanResendApiKey(process.env.RESEND_API_KEY);
  if (cleanedKey) {
    process.env.RESEND_API_KEY = cleanedKey;
  }
}

/**
 * A thin wrapper around the real Resend email client that automatically
 * filters out mock/test email addresses (example.com, .demo, @ybex.io)
 * before actually sending, so test data never triggers a real email send.
 */
/** v399: `priority: "low"` = may wait for the night window (backend/emailBudget.ts). Default is high (sent now). */
type YbexSend = (options: Parameters<OriginalResend["emails"]["send"]>[0] & { priority?: "low" | "high" }) => ReturnType<OriginalResend["emails"]["send"]>;
export class Resend extends OriginalResend {
  declare emails: OriginalResend["emails"] & { send: YbexSend };
  constructor(key?: string) {
    const cleanKey = getCleanResendApiKey(key) || key || "";
    super(cleanKey);
    const originalSend = this.emails.send.bind(this.emails);
    this.emails.send = async (options: any) => {
      let toEmails = Array.isArray(options.to) ? options.to : [options.to];
      toEmails = toEmails.filter((e: string) => e && !e.includes('@example.com') && !e.endsWith('.demo') && !e.endsWith('@ybex.io'));
      if (toEmails.length === 0) {
        console.log("[Resend Intercept] Skipped sending to mock emails:", options.to);
        return { data: { id: 'mocked_id' }, error: null };
      }
      options.to = toEmails;
      options.from = getValidFromEmail(options.from);
      // v399 (email budget, backend/emailBudget.ts): low-priority mails wait for the night window; every send is counted.
      const priority = options.priority === "low" ? "low" : "high";
      delete options.priority;
      if (priority === "low" && (await lowPriorityBudget()) <= 0) {
        const id = await queueLowEmail(options);
        return { data: { id: "queued:" + id }, error: null, queued: true } as any;
      }
      const out: any = await originalSend(options);
      if (out?.error) {
        if (isQuotaError(out.error)) {
          await markQuotaFull();
          if (priority === "low") { const id = await queueLowEmail(options); return { data: { id: "queued:" + id }, error: null, queued: true } as any; }
        }
      } else {
        await addSent(toEmails.length);
      }
      return out;
    };
    // Night sender for the queue: the real send, counted inside flushLowEmails.
    if (!rawSenders.length && cleanKey) rawSenders.push(async (opts: any) => originalSend({ ...opts, from: getValidFromEmail(opts.from) }));
  }
}

/**
 * Builds the standard branded HTML email template used across all
 * transactional emails (welcome, verification, password reset, etc.).
 */
// footerHtml (session 36): extra line under the copyright, e.g. an unsubscribe / stop-reminders link.
/** v373: the pre-v373 look, kept only for the personal "Wanted to personally reach out" welcome (Ravi: keep it as it is). */
export function buildLegacyEmailHtml({ title, greeting, paragraphs, button, signatureHtml, footerHtml }: any) {
  // v396 (QA E-4): viewport tag so phones don't show it scaled down; slimmer padding on small screens
  return `<meta name="viewport" content="width=device-width, initial-scale=1"><style>@media (max-width:480px){.ybx-legacy-card{padding:24px 18px !important}.ybx-legacy-wrap{padding:20px 10px !important}}</style>
<div class="ybx-legacy-wrap" style="background-color: #f4f5f7; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';">
  <div style="max-width: 600px; margin: 0 auto;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h2 style="margin: 0; color: #374151; font-weight: 700; font-size: 22px; letter-spacing: -0.5px;">Ybex</h2>
    </div>
    
    <div class="ybx-legacy-card" style="background: #ffffff; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05); border: 1px solid #e5e7eb; color: #4b5563; font-size: 15px; line-height: 1.6;">
      ${title ? `<h3 style="color: #111827; margin-top: 0; margin-bottom: 24px; font-size: 18px; font-weight: 600;">${title}</h3>` : ''}
      
      ${greeting ? `<p style="margin-top: 0; margin-bottom: 20px;">${greeting}</p>` : ''}
      
      ${paragraphs.map((p) => `<p style="margin-top: 0; margin-bottom: 20px;">${p}</p>`).join('')}

      ${button ? `<div style="margin-top: 30px; margin-bottom: 30px;"><a href="${button.link}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">${button.text}</a></div>` : ''}

      ${signatureHtml ? signatureHtml : `
        <div style="margin-top: 30px; padding-top: 20px;">
          <p style="margin: 0;">Cheers,</p>
          <p style="margin: 0; margin-top: 4px; font-weight: 600; color: #111827;">Team Ybex</p>
        </div>
      `}
    </div>
    
    <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #9ca3af;">
      <p style="margin: 0;">&copy; ${new Date().getFullYear()} Ybex. All rights reserved.</p>
      ${footerHtml ? `<p style="margin: 8px 0 0 0;">${footerHtml}</p>` : ''}
    </div>
  </div>
</div>
`;
}

// v373 (Ravi: "automatic emails redesign karo"): round-3 email look — deep-purple header band the card sits on, big
// heading, one dark button, a footer with Help / Privacy and why the person got it, and the inbox preview line.
// Same arguments as before, so every email that calls it gets the new look; extra (all optional):
//   preheader — the grey line next to the subject in the inbox · eyebrow — small label top right of the band
//   icon — one emoji in a tile above the heading · reason — "You're getting this because …" · blocks — raw HTML after the text
const EMAIL_FONT = "'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif";
export function emailSiteUrl() { return publicSiteUrl(); } // v388: never the AI Studio / Cloud Run address
export function emailButtonHtml(text: string, link: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px auto 8px"><tr><td align="center" style="border-radius:16px;background:#1A1033">` +
    `<a href="${link}" style="display:inline-block;padding:16px 34px;font:800 15px ${EMAIL_FONT};color:#FFFFFF;text-decoration:none;border-radius:16px;letter-spacing:.2px">${text}</a></td></tr></table>`; // text right before </a> (a test reads it)
}
/** Label / value rows in a dashed box (amounts, handles, dates). Values are used as given — escape user text first. */
export function emailFactsHtml(rows: Array<[string, string]>) {
  const r = rows.filter(([, v]) => v !== undefined && v !== null && String(v) !== "").map(([k, v]) =>
    `<tr><td style="padding:10px 0;font:500 13.5px ${EMAIL_FONT};color:#7A7391">${k}</td><td align="right" style="padding:10px 0;font:700 14px ${EMAIL_FONT};color:#1A1033">${v}</td></tr>`).join("");
  return r ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 10px;border-top:2px dashed #E4DDF5;border-bottom:2px dashed #E4DDF5">${r}</table>` : "";
}
// button.url is read too: the campaign-invite email (locked file) passes `url`, so its button opened "undefined".
export function buildEmailHtml({ title, greeting, paragraphs, button, signatureHtml, footerHtml, preheader, eyebrow, icon, reason, blocks }: any) {
  const site = emailSiteUrl();
  const p = (t: string) => `<p style="margin:0 0 14px;font:400 16px/1.65 ${EMAIL_FONT};color:#3D3851">${t}</p>`;
  const pre = preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${title || "Ybex"}</title></head>
<body style="margin:0;padding:0;background:#EEEAF8">${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEEAF8">
<tr><td align="center" style="background:#1A1033;background-image:linear-gradient(160deg,#1A1033 0%,#3B1A7A 100%);padding:26px 14px 0">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
 <tr><td style="padding:0 6px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td style="font:800 28px ${EMAIL_FONT};letter-spacing:-1.3px;color:#FFFFFF">Ybex<span style="color:#A78BFA">.</span></td>
  <td align="right" style="font:800 11px ${EMAIL_FONT};letter-spacing:1.8px;color:#C4B5FD">${eyebrow ? String(eyebrow).toUpperCase() : ""}</td></tr></table></td></tr>
 <tr><td style="padding:${icon ? "30px 28px 0" : "18px 28px 0"};border-radius:28px 28px 0 0;background:#FFFFFF">${icon ? `<div style="width:58px;height:58px;border-radius:20px;background:#F3EEFF;font:400 28px/58px ${EMAIL_FONT};text-align:center;margin:0 auto">${icon}</div>` : ""}</td></tr>
 </table></td></tr>
<tr><td align="center" style="padding:0 14px">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:0 0 28px 28px">
 <tr><td style="padding:22px 30px 32px">
  ${title ? `<h1 style="margin:0 0 16px;font:800 28px/1.18 ${EMAIL_FONT};letter-spacing:-1px;color:#1A1033;text-align:center">${title}</h1>` : ""}
  ${greeting ? `<p style="margin:0 0 12px;font:700 16px ${EMAIL_FONT};color:#1A1033">${greeting}</p>` : ""}
  ${(paragraphs || []).map(p).join("")}
  ${blocks || ""}
  ${button && (button.link || button.url) ? emailButtonHtml(button.text, button.link || button.url) : ""}
  ${signatureHtml ? signatureHtml : `<p style="margin:24px 0 0;font:600 14px ${EMAIL_FONT};color:#7A7391;text-align:center">— Team Ybex</p>`}
 </td></tr></table>
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td align="center" style="padding:26px 20px 40px;font:500 12px/1.75 ${EMAIL_FONT};color:#8A8599">
  <div style="font:800 18px ${EMAIL_FONT};letter-spacing:-.8px;color:#1A1033">Ybex<span style="color:#7C3AED">.</span></div>
  <div style="margin:2px 0 10px">Influence, without the middleman.</div>
  ${reason ? `${reason}<br>` : ""}
  <a href="${site}/help" style="color:#5B5570;text-decoration:none;font-weight:700">Help</a> &nbsp;·&nbsp; <a href="${site}/privacy" style="color:#5B5570;text-decoration:none;font-weight:700">Privacy</a><br>
  ${footerHtml ? `<div style="margin:6px 0 0">${footerHtml}</div>` : ""}
  <span style="color:#A9A3BC">support@ybexmedia.in · © ${new Date().getFullYear()} Ybex Media, India</span>
 </td></tr></table>
</td></tr></table></body></html>`;
}

/**
 * Deterministically generates plausible "applied"/"views" display numbers
 * for a campaign, seeded from its id/title so the same campaign always
 * shows the same numbers (used where real applicant/view counts aren't
 * tracked yet).
 */
export function calculateCampaignStats(c: any) {
  const idStr = String(c.campaign_id || c.id || c.title || "campaign");
  let hash = 0;
  for (let i = 0; i < idStr.length; i++) {
    hash = (hash << 5) - hash + idStr.charCodeAt(i);
    hash |= 0;
  }
  const posHash = Math.abs(hash);

  // Natural varied applied count: 2, 3, 4, 5
  const baseApplied = 2 + (posHash % 4);
  let applied = baseApplied;
  if (Array.isArray(c.applicants) && c.applicants.length > 1) {
    applied = Math.min(8, Math.max(baseApplied, c.applicants.length));
  } else if (typeof c.applied === 'number' && c.applied > 1 && c.applied <= 15) {
    applied = c.applied;
  }

  // Views strictly 10 to 15 (always greater than applied)
  let views = Math.min(15, Math.max(10, 10 + (posHash % 6)));
  if (views <= applied) {
    views = applied + 5;
  }

  return { views, applied };
}

export function getValidFromEmail(from?: string): string {
  const defaultFrom = process.env.RESEND_FROM_EMAIL || "Ybex Media <noreply@ybexmedia.in>";
  if (from && typeof from === 'string' && from.includes('@') && !from.startsWith('re_')) {
    // ybex.club is not a verified domain on Resend (only ybexmedia.in is verified)
    if (from.includes('@ybex.club')) {
      return defaultFrom;
    }
    return from.trim();
  }
  const envFrom = process.env.RESEND_FROM_EMAIL;
  if (envFrom && typeof envFrom === 'string' && envFrom.includes('@') && !envFrom.startsWith('re_')) {
    if (envFrom.includes('@ybex.club')) {
      return "Ybex Media <noreply@ybexmedia.in>";
    }
    return envFrom.trim();
  }
  return defaultFrom;
}

// Lazy Razorpay SDK Initialization — module-scoped singleton, same
// behavior as before (only created once, on first real use).
let razorpay: Razorpay | null = null;

export function getRazorpay(): Razorpay {
  if (!razorpay) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new Error("Razorpay is not configured on the server. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment variables.");
    }
    razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }
  return razorpay;
}

/**
 * Robust helper to call Gemini with a backup/fallback model in case of
 * temporary 503 UNAVAILABLE or high demand spikes on the primary model.
 */
export async function generateContentResilient(ai: any, params: { model?: string; contents: any; systemInstruction?: string; config?: any }) {
  const primaryModel = params.model || "gemini-3.5-flash";
  const backupModel = primaryModel === "gemini-3.5-flash" ? "gemini-3.1-flash-lite" : "gemini-3.5-flash";

  try {
    return await ai.models.generateContent({
      ...params,
      model: primaryModel
    });
  } catch (err: any) {
    console.warn(`Primary Gemini model ${primaryModel} failed, trying backup ${backupModel}:`, err);
    try {
      return await ai.models.generateContent({
        ...params,
        model: backupModel
      });
    } catch (backupErr) {
      console.error(`Backup Gemini model ${backupModel} also failed:`, backupErr);
      throw err; // propagate the original error so that the route's try-catch can run its fallback
    }
  }
}

/**
 * Resilient Promise timeout wrapper to prevent long hanging queries
 * (e.g. Supabase cold-starts/network drops) from hanging a request forever.
 */
/**
 * Applies a percentage adjustment to a numeric value, either upward
 * (direction 1) or downward (direction -1). Used for role-based markup/
 * deduction on rate cards.
 */
export function applyPct(value: number, pct: number, direction: number): number {
  if (!value || !pct) return value;
  const factor = 1 + (direction * pct) / 100.0;
  return Math.round(value * factor);
}

/**
 * Applies a percentage markup to every numeric field of a rate-card
 * object, leaving non-numeric fields untouched.
 */
export function transformRateCard(rc: any, pct: number): any {
  if (!rc || !pct) return rc || {};
  const out: any = {};
  for (const k in rc) {
    if (typeof rc[k] === "number") {
      out[k] = applyPct(rc[k], pct, 1);
    } else {
      out[k] = rc[k];
    }
  }
  return out;
}

/**
 * Detects whether a chat message likely contains a phone number or other
 * attempt to move communication off-platform (WhatsApp, direct call, etc.).
 * This is a heuristic filter, not a perfect one — it's meant to catch the
 * common, straightforward cases (a 10-digit Indian mobile number, with or
 * without spaces/dashes/dots as separators, optionally with a +91/91/0
 * prefix), plus obvious "contact me directly" phrasing paired with any long
 * digit run.
 */
// Kept as the entry point every existing call site already uses. The detection itself now
// lives in contactSecurityFilter.ts, which handles what this regex pair could not: numbers
// split across separate messages, numbers spelled in words (English and Hindi), leetspeak
// digits, @handles, and messaging-app links. See that file for the keyword policy.
export function containsPhoneNumberOrContactBypass(
  text: string,
  opts: FilterOptions = {}
): boolean {
  return checkComprehensiveDisallowedContent(text, opts).blocked;
}

/** Same check, but returns the reason so callers can show a useful message. */
export function inspectContactLeakage(text: string, opts: FilterOptions = {}): FilterResult {
  return checkComprehensiveDisallowedContent(text, opts);
}

export function safePromiseTimeout<T>(promise: any, timeoutMs = 15000, fallback: T): Promise<T> {
  if (!promise || typeof promise.then !== 'function') {
    return Promise.resolve(promise || fallback);
  }
  let timeoutHandle: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutHandle = setTimeout(() => resolve(fallback), timeoutMs);
  });
  return Promise.race([
    promise.then((res: any) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      return res;
    }).catch((err: any) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      console.warn(`[safePromiseTimeout error fallback]`, err?.message || err);
      return fallback;
    }),
    timeoutPromise
  ]);
}
export function buildContractSignEmailHtml({
  code,
  recipientName,
  brandName,
  creatorName,
  campaignTitle,
  dealAmount
}: {
  code: string;
  recipientName?: string;
  brandName?: string;
  creatorName?: string;
  campaignTitle?: string;
  dealAmount?: string | number;
}) {
  // Every one of these comes from the request body and lands in HTML. Escape them, or the
  // email becomes a vehicle for arbitrary markup sent from Ybex's own address.
  const esc = (v: any) => String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;")
    .slice(0, 120);
  const brand = esc(brandName || "Brand Partner");
  const creator = esc(creatorName || "Creator Partner");
  const campaign = esc(campaignTitle || "Influencer Collaboration Agreement");
  const name = esc(recipientName || "there");
  const amountNum = Number(dealAmount);
  const amountStr = dealAmount
    ? (Number.isFinite(amountNum) && amountNum > 0 ? `₹${amountNum.toLocaleString('en-IN')}` : esc(dealAmount))
    : null;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Signature - Ybex Secure Contract</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F2F2F7; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #0A0A0A;">

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #F2F2F7; padding: 36px 12px;">
    <tr>
      <td align="center">
        
        <!-- MAIN CARD -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 540px; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #E5E5E2; box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05);">
          
          <!-- BRAND HEADER -->
          <tr>
            <td style="padding: 24px 28px 20px 28px; border-bottom: 1px solid #F0F0F0;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="left" style="vertical-align: middle;">
                    <div style="font-size: 22px; font-weight: 800; color: #0A0A0A; letter-spacing: -0.5px;">
                      Ybex<span style="color: #7C3AED;">.</span>
                    </div>
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    <span style="display: inline-block; background-color: #F5F0FF; color: #7C3AED; border: 1px solid #DDD6FE; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; padding: 4px 10px; border-radius: 20px;">
                      Contract E-Sign
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- GREETING & CONTEXT -->
          <tr>
            <td style="padding: 28px 28px 12px 28px;">
              <h2 style="margin: 0 0 10px 0; font-size: 20px; font-weight: 700; color: #0A0A0A; letter-spacing: -0.3px;">
                Verify Your Signature
              </h2>
              <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #4B5563;">
                Hello ${name},<br/>
                Please use the verification code below to digitally sign your partnership contract for <strong style="color: #0A0A0A;">${campaign}</strong>.
              </p>
            </td>
          </tr>

          <!-- CONTRACT DETAILS SUMMARY -->
          <tr>
            <td style="padding: 12px 28px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F9F9FB; border: 1px solid #F0F0F0; border-radius: 12px; padding: 14px 18px;">
                <tr>
                  <td style="padding-bottom: 8px;">
                    <div style="font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px;">Agreement</div>
                    <div style="font-size: 14px; font-weight: 700; color: #0A0A0A; margin-top: 2px;">
                      ${campaign}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="border-top: 1px solid #EFEFEF; padding-top: 8px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td align="left" style="vertical-align: middle;">
                          <div style="font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px;">Parties</div>
                          <div style="font-size: 13px; font-weight: 600; color: #374151; margin-top: 2px;">
                            ${brand} ⟷ ${creator}
                          </div>
                        </td>
                        ${amountStr ? `
                        <td align="right" style="vertical-align: middle;">
                          <div style="font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px;">Contract Payout</div>
                          <div style="font-size: 14px; font-weight: 800; color: #059669; margin-top: 2px;">
                            ${amountStr}
                          </div>
                        </td>
                        ` : `
                        <td align="right" style="vertical-align: middle;">
                          <div style="font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px;">Secure payment hold</div>
                          <div style="font-size: 12px; font-weight: 700; color: #7C3AED; margin-top: 2px;">
                            Protected
                          </div>
                        </td>
                        `}
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- OTP CODE BOX -->
          <tr>
            <td style="padding: 16px 28px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F5F0FF; border: 1px solid #DDD6FE; border-radius: 12px; text-align: center; padding: 22px 16px;">
                <tr>
                  <td>
                    <div style="font-size: 11px; font-weight: 700; color: #6D28D9; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
                      Your Electronic Signature Code
                    </div>
                    
                    <div style="background-color: #FFFFFF; border: 1px solid #DDD6FE; border-radius: 8px; padding: 10px 24px; display: inline-block; box-shadow: 0 2px 6px rgba(124, 58, 237, 0.08); margin-bottom: 8px;">
                      <span style="font-family: 'DM Sans', -apple-system, sans-serif; font-size: 34px; font-weight: 800; letter-spacing: 6px; color: #7C3AED; line-height: 1;">
                        ${code}
                      </span>
                    </div>

                    <div style="font-size: 12px; font-weight: 600; color: #6D28D9;">
                      This code expires in 5 minutes
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- INSTRUCTION & SECURITY -->
          <tr>
            <td style="padding: 6px 28px 24px 28px;">
              <p style="margin: 0 0 14px 0; font-size: 13px; line-height: 1.5; color: #6B7280;">
                Enter this code in the Ybex agreement popup to sign and bind this agreement. Payouts are protected in Ybex Secure payment hold until deliverables are completed and approved.
              </p>
              
              <div style="border-top: 1px solid #F0F0F0; padding-top: 12px; font-size: 11px; line-height: 1.5; color: #9CA3AF;">
                Never share this code with anyone. If you did not request this verification, please contact <a href="mailto:support@ybexmedia.in" style="color: #7C3AED; text-decoration: none;">support@ybexmedia.in</a>.
              </div>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color: #F9F9FB; border-top: 1px solid #F0F0F0; padding: 18px 28px; text-align: center;">
              <div style="font-size: 12px; font-weight: 700; color: #374151;">
                Ybex Media
              </div>
              <div style="font-size: 11px; color: #9CA3AF; margin-top: 2px;">
                &copy; ${new Date().getFullYear()} Ybex. All rights reserved.
              </div>
            </td>
          </tr>

        </table>
        <!-- /MAIN CARD -->

      </td>
    </tr>
  </table>

</body>
</html>
`;
}

/**
 * Strips out fields that do not exist on the Supabase `chat_threads` table
 * to prevent Postgres error 42703 (undefined column) from aborting thread updates.
 */
export function sanitizeChatThreadSupabasePayload(payload: Record<string, any>): Record<string, any> {
  const allowed = new Set([
    'id',
    'deal_id',
    'campaign_id',
    'creator_id',
    'brand_id',
    'status',
    'agreed_amount',
    'deliverables',
    'deadline',
    'revision_count',
    'agreement_signed_creator',
    'agreement_signed_brand',
    'agreement_signed_at',
    'created_at',
    'updated_at',
    'flow_state',
    'campaign_deal_id',
    'ugc_order_id_text',
    'is_ugc'
  ]);
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (allowed.has(k) && v !== undefined) {
      clean[k] = v;
    }
  }
  return clean;
}

/**
 * Strips out fields that do not exist on the Supabase `deals` table
 * to prevent Postgres error 42703 (undefined column) from aborting deal updates.
 */
export function sanitizeDealSupabasePayload(payload: Record<string, any>): Record<string, any> {
  const allowed = new Set([
    'id',
    'application_id',
    'campaign_id',
    'creator_id',
    'brand_id',
    'agreed_amount',
    'is_barter',
    'barter_details',
    'deliverables',
    'content_deadline',
    'go_live_date',
    'revision_count',
    'revisions_used',
    'posting_requirements',
    'agreement_signed_creator',
    'agreement_signed_brand',
    'agreement_signed_at',
    'status',
    'created_at',
    'updated_at',
    'escrow_hold',
    'escrow_hold_reason',
    'escrow_hold_by_admin_id',
    'escrow_hold_at',
    'promised_reach',
    'delivered_reach',
    'delivered_reach_source',
    'delivered_reach_updated_at',
    'performance_score',
    'performance_tier',
    'on_time_submission',
    'brand_rating'
  ]);
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (allowed.has(k) && v !== undefined) {
      clean[k] = v;
    }
  }
  return clean;
}
