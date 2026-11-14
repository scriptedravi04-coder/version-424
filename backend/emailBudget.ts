// v399 (Ravi 4 Nov: Resend free plan = 100 emails a day; the quota ran out and login codes would stop.
// "login OTP vagairah sab priority pe, baaki sab queue mein rahe, aur raat ko jab limit reset ho tab dekhe agar limit
// bachi hui hai toh bhej de, warna pending mein rahe").
//
//   • HIGH (default): codes, password reset, contract signing, refunds / payments, support replies, deadline mails,
//     anything an admin sends by hand. Always sent right away.
//   • LOW (the sender passes `priority: "low"`): welcome note, activity e-mails (the in-app notification is instant
//     anyway), onboarding reminders, admin alerts, application replies. NOT sent during the day: they wait in a
//     queue (ybex_ephemeral, keys "emailq:…", kept 14 days) and go out in the last hours before Resend's daily reset
//     (00:00 UTC = 5:30 am IST), only as many as today's 100 still allows. What doesn't fit waits for the next night.
//   • Broadcasts (emailBroadcasts.ts) follow the same rule with lowPriorityBudget().
//
// Settings (hosting env): RESEND_DAILY_LIMIT (default 100; 0 = paid plan, no daily limit → low mails go at once),
// EMAIL_LOW_WINDOW_UTC (default "21-24" = 2:30–5:30 am IST).
import crypto from "crypto";
import { ephemeralGet, ephemeralSet, ephemeralDelete, ephemeralList } from "./ephemeralStore";

export const QUEUE_PREFIX = "emailq:";
const QUEUE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const SAFETY = 3; // never plan to use the very last mails of the day

export function dailyLimit(): number {
  const raw = process.env.RESEND_DAILY_LIMIT;
  if (raw === undefined || raw === "") return 100;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 100;
}

export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function lowWindow(): [number, number] {
  const m = String(process.env.EMAIL_LOW_WINDOW_UTC || "21-24").match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  const a = m ? Math.min(23, Number(m[1])) : 21;
  const b = m ? Math.min(24, Number(m[2])) : 24;
  return b > a ? [a, b] : [21, 24];
}

export function inLowWindow(now = new Date()): boolean {
  const [a, b] = lowWindow();
  const h = now.getUTCHours();
  return h >= a && h < b;
}

const countKey = (day: string) => `email:count:${day}`;
const DAY_MS = 36 * 60 * 60 * 1000;

export async function sentToday(now = new Date()): Promise<number> {
  const v = await ephemeralGet(countKey(utcDay(now))).catch(() => null);
  return Number(v?.n ?? v ?? 0) || 0;
}

export async function addSent(n: number, now = new Date()): Promise<void> {
  if (!(n > 0)) return;
  const day = utcDay(now);
  const cur = await sentToday(now);
  await ephemeralSet(countKey(day), { n: cur + n }, DAY_MS).catch(() => {});
}

/** Resend said the daily quota is used up: count today as full, so low mails stop trying. */
export async function markQuotaFull(now = new Date()): Promise<void> {
  const lim = dailyLimit();
  if (!lim) return;
  const cur = await sentToday(now);
  if (cur < lim) await ephemeralSet(countKey(utcDay(now)), { n: lim }, DAY_MS).catch(() => {});
}

export function isQuotaError(err: any): boolean {
  const s = `${err?.name || ""} ${err?.message || ""} ${err?.statusCode || err?.status || ""}`;
  return /daily_quota_exceeded|quota|monthly_limit|429|rate.?limit/i.test(s);
}

/** How many LOW mails may go right now (Infinity on a paid plan). */
export async function lowPriorityBudget(now = new Date()): Promise<number> {
  const lim = dailyLimit();
  if (!lim) return Infinity;
  if (!inLowWindow(now)) return 0;
  return Math.max(0, lim - SAFETY - (await sentToday(now)));
}

export async function queueLowEmail(options: any, now = new Date()): Promise<string> {
  const id = `${QUEUE_PREFIX}${now.getTime().toString().padStart(14, "0")}_${crypto.randomUUID().slice(0, 8)}`;
  const { priority: _p, ...rest } = options || {};
  await ephemeralSet(id, { options: rest, queued_at: now.toISOString(), tries: 0 }, QUEUE_TTL_MS);
  return id;
}

export async function queuedLowEmails(limit = 200) {
  return ephemeralList(QUEUE_PREFIX, limit);
}

/** Sends waiting LOW mails while today's budget lasts. `send` is the real Resend send (no gate). */
export async function flushLowEmails(send: (opts: any) => Promise<any>, now = new Date(), max = 60, opts: { force?: boolean } = {}) {
  const result = { sent: 0, failed: 0, left_waiting: 0, budget: 0 as number };
  // v419 (Ravi: "Send now" in Admin → Email broadcast): the admin picks how many go now, any time of day.
  const budget = opts.force ? Math.max(0, Math.floor(max)) : await lowPriorityBudget(now);
  result.budget = Number.isFinite(budget) ? budget : -1;
  if (budget <= 0) { result.left_waiting = (await queuedLowEmails(500)).length; return result; }
  const items = await queuedLowEmails(Math.min(max, Number.isFinite(budget) ? budget : max));
  for (const it of items) {
    const opts = it.value?.options;
    if (!opts) { await ephemeralDelete(it.key); continue; }
    try {
      const out: any = await send(opts);
      if (out?.error) {
        if (isQuotaError(out.error)) { await markQuotaFull(now); break; }
        const tries = Number(it.value?.tries || 0) + 1;
        if (tries >= 3) await ephemeralDelete(it.key);
        else await ephemeralSet(it.key, { ...it.value, tries }, QUEUE_TTL_MS);
        result.failed++;
      } else {
        await ephemeralDelete(it.key);
        await addSent((Array.isArray(opts.to) ? opts.to.length : 1) || 1, now);
        result.sent++;
      }
    } catch (e: any) {
      if (isQuotaError(e)) { await markQuotaFull(now); break; }
      result.failed++;
    }
  }
  result.left_waiting = (await queuedLowEmails(500)).length;
  return result;
}

let lastTick = 0;
/** Cheap to call often (every request / timer): at most one flush per 5 minutes per server, only in the window. */
export function maybeFlush(send: (opts: any) => Promise<any>, now = new Date()) {
  if (now.getTime() - lastTick < 5 * 60 * 1000) return;
  if (dailyLimit() && !inLowWindow(now)) return;
  lastTick = now.getTime();
  flushLowEmails(send, now).then((r) => { if (r.sent || r.failed) console.log("[email-budget] night send:", r); }).catch(() => {});
}
export function _resetFlushTick() { lastTick = 0; }

/** v419: what is waiting, for Admin → Email broadcast → "Waiting emails" (no addresses in full). */
export async function emailQueueSummary(limit = 500) {
  const items = await queuedLowEmails(limit);
  const mask = (e: string) => { const [u, d] = String(e || "").split("@"); return d ? `${u.slice(0, 2)}***@${d}` : "***"; };
  const bySubject = new Map<string, number>();
  for (const it of items) { const sub = String(it.value?.options?.subject || "(no subject)").slice(0, 120); bySubject.set(sub, (bySubject.get(sub) || 0) + 1); }
  return {
    waiting: items.length,
    oldest: items[0]?.value?.queued_at || null,
    by_subject: Array.from(bySubject.entries()).map(([subject, n]) => ({ subject, n })).sort((a, b) => b.n - a.n).slice(0, 20),
    preview: items.slice(0, 15).map((it) => ({ subject: String(it.value?.options?.subject || ""), to: (Array.isArray(it.value?.options?.to) ? it.value.options.to : [it.value?.options?.to]).map(mask).join(", "), queued_at: it.value?.queued_at || null })),
  };
}
