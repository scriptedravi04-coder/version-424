// v364 (Ravi: "database local mai save hota rahe aur server wapas aaye toh real database mai save ho jaye"):
// saves of the person's OWN data, tapped while the phone is offline or the Ybex server is updating, wait here on the
// phone and are sent once Ybex answers again. Only a short allowlist — never money, deals, chat, campaigns, UGC,
// KYC, OTP, sign-in, uploads or push (those are refused with a calm message instead, see src/lib/api.js).
//
// Storage: localStorage, one queue per signed-in user (key has the user_id), max 50 items. Whole-object saves
// (creators/profile, brands/profile, creators/me) keep only the newest copy. Wiped on logout.
// Replay: oldest first, one at a time, through the real request (src/lib/api.js wires `send`).
//   2xx → removed · 4xx → removed + one toast "One change couldn't be saved: …" · network / 5xx → stop, try later.
import { normalizeApiUrl } from "./apiUrl";
import { safeStorage } from "../utils/storage";

const PREFIX = "ybex_outbox:";
const MAX_ITEMS = 50;
const OWN_TABLES = ["brand_profiles", "creator_profiles", "creator_portfolio_items", "creator_social_channels"];

/** Path without /api and query: "/api/creators/profile?x=1" → "creators/profile". */
function pathOf(url) {
  let u = String(url || "");
  const abs = /^https?:\/\/[^/]+(\/.*)?$/i.exec(u);
  if (abs) u = abs[1] || "/";
  u = normalizeApiUrl(u) || "";
  return u.replace(/^\/api\//, "").split("?")[0].split("#")[0];
}

function parseBody(data) {
  if (data && typeof data === "string") { try { return JSON.parse(data); } catch { return null; } }
  return data && typeof data === "object" ? data : null;
}

const RULES = [
  { method: "post", re: /^creators\/profile$/, whole: true },
  { method: "patch", re: /^creators\/me$/, whole: true },
  { method: "post", re: /^brands\/profile$/, whole: true },
  { method: "post", re: /^db\/own$/, check: (b) => OWN_TABLES.includes(String(b?.table || "")) },
  { method: "post", re: /^onboarding\/progress$/, whole: true },
  { method: "post", re: /^assist\/settings$/, whole: true },
  { method: "put", re: /^assist\/settings$/, whole: true },
  { method: "post", re: /^notifications\/read-all$/, whole: true },
  { method: "post", re: /^notifications\/[\w-]+\/read$/ },
];

/** The allowlist rule for this request, or null (never queued). Multipart (uploads) is never queued. */
export function outboxRule(config) {
  const method = String(config?.method || "get").toLowerCase();
  if (typeof FormData !== "undefined" && config?.data instanceof FormData) return null;
  const path = pathOf(config?.url);
  const body = parseBody(config?.data);
  for (const r of RULES) {
    if (r.method !== method || !r.re.test(path)) continue;
    if (r.check && !r.check(body)) return null;
    return { ...r, path };
  }
  return null;
}
export const canQueue = (config) => Boolean(outboxRule(config));

function ownerId() {
  try {
    const u = JSON.parse(safeStorage.getItem("ybex_user") || "null");
    return String(u?.user_id || u?.id || "");
  } catch { return ""; }
}
const keyFor = (uid) => PREFIX + (uid || ownerId() || "anon");

export function readOutbox(uid) {
  try {
    const v = JSON.parse(safeStorage.getItem(keyFor(uid)) || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function writeOutbox(list, uid) {
  try {
    if (list.length) safeStorage.setItem(keyFor(uid), JSON.stringify(list.slice(-MAX_ITEMS)));
    else safeStorage.removeItem(keyFor(uid));
  } catch { /* storage full / blocked — the item stays in memory only for this send */ }
  emitCount();
}

export const outboxCount = (uid) => readOutbox(uid).length;

function emitCount() {
  try { window.dispatchEvent(new CustomEvent("ybex:outbox", { detail: { count: outboxCount() } })); } catch { /* tests */ }
}

/** Puts a request in the queue. Returns the stored item, or null when it isn't allowed. */
export function enqueue(config) {
  const rule = outboxRule(config);
  if (!rule) return null;
  const method = String(config.method).toLowerCase();
  const item = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    method, url: normalizeApiUrl(rule.path), data: parseBody(config.data) ?? config.data ?? null, at: Date.now(),
  };
  let list = readOutbox();
  if (rule.whole) list = list.filter((x) => !(x.method === method && x.url === item.url));
  list.push(item);
  if (list.length > MAX_ITEMS) list = list.slice(-MAX_ITEMS);
  writeOutbox(list);
  return item;
}

export function clearOutbox(uid) {
  try {
    if (uid) { safeStorage.removeItem(keyFor(uid)); emitCount(); return; }
    const ls = typeof window !== "undefined" ? window.localStorage : null;
    if (ls) {
      const keys = [];
      for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(PREFIX)) keys.push(k); }
      keys.forEach((k) => ls.removeItem(k));
    }
    safeStorage.removeItem(keyFor());
  } catch { /* ignore */ }
  emitCount();
}

const isNetworkish = (err) => !err?.response || err?.response?.status === 0 || err?.isOffline || err?.isServerDown;

let replaying = null;
/**
 * Sends waiting items, oldest first. send(item) must make the real request (not through the queue).
 * onDropped(message) is called once per item the server refused (4xx). Resolves { sent, dropped, left }.
 */
export function replayOutbox({ send, onDropped } = {}) {
  if (replaying) return replaying;
  replaying = (async () => {
    let sent = 0, dropped = 0;
    for (;;) {
      const list = readOutbox();
      const item = list[0];
      if (!item || typeof send !== "function") break;
      try {
        await send(item);
        sent += 1;
        writeOutbox(readOutbox().filter((x) => x.id !== item.id));
      } catch (err) {
        const st = Number(err?.response?.status || 0);
        if (!isNetworkish(err) && st >= 400 && st < 500) {
          dropped += 1;
          writeOutbox(readOutbox().filter((x) => x.id !== item.id));
          const d = err?.response?.data || {};
          try { onDropped?.(String(d.detail || d.error || d.message || err.message || "Server refused it").slice(0, 140)); } catch { /* ignore */ }
          continue;
        }
        break; // network / 5xx / still down → try later
      }
    }
    return { sent, dropped, left: outboxCount() };
  })().finally(() => { replaying = null; });
  return replaying;
}
