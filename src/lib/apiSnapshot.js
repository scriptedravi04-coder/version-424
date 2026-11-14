// Session 42 (Ravi: "the app is slow like a website — every screen loads again").
//
// The last good answer of a few read-only GET calls is kept on the phone. A screen that opens
// again (or the app after a restart) shows that answer at once and refreshes quietly behind it —
// like WhatsApp / Swiggy. Nothing here decides money, deal or chat state: screens always replace the
// snapshot with the fresh server answer a moment later, and every action still goes to the server.
//
// Privacy: snapshots belong to one login. They are tied to the current token and wiped on logout
// or when another account signs in on the same phone.
import { normalizeApiUrl } from "./apiUrl";

const PREFIX = "ybex_snap:";
const OWNER_KEY = "ybex_snap_owner";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // a week-old screen is still better than a skeleton
const MAX_BYTES = 250 * 1024; // one big list must not fill the phone's storage

// Only these screens' reads are kept across app restarts (home feeds, inbox, bell). Anything else
// lives in memory only, for this app session.
const PERSIST = [
  /^\/api\/banners(\?|$)/,
  /^\/api\/ugc\/orders\/(creator|brand)$/,
  /^\/api\/collabs$/,
  /^\/api\/campaigns(\?mine=true)?$/,
  /^\/api\/verifications\/me$/,
  /^\/api\/notifications(\?unread=true)?$/,
  /^\/api\/notifications\/unread$/,
  /^\/api\/chat\/v2\/threads$/,
  /^\/api\/creators\/me$/,
  /^\/api\/creators\/home-picks$/,
  /^\/api\/brands\/me$/,
  /^\/api\/transactions$/,
  /^\/api\/creators\/explore$/,
  /^\/api\/ugc\/briefs\/my$/,
  // v333 (offline app — App Store 4.2): the money, refer and payout screens open offline with the last answer.
  /^\/api\/creator\/payout-eligible-deals$/,
  /^\/api\/creator\/payment-methods$/,
  /^\/api\/referrals\/me$/,
  /^\/api\/escrow-transactions$/,
  /^\/api\/ugc\/briefs(\?.*)?$/,
  /^\/api\/campaigns\/[\w-]+$/,
  // v334 (offline app): the creator's own profile (Profile / Settings menu) opens offline after an app restart too.
  /^\/api\/creators\/[\w-]+$/,
];

const memory = new Map(); // url -> { data, at }

function store() {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

// Small, stable fingerprint of the login token (the token itself is never copied).
function ownerOf(token) {
  if (!token) return "";
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) { h ^= token.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

function currentOwner() {
  const ls = store();
  try { return ownerOf(ls?.getItem("ybex_token") || ""); } catch { return ""; }
}

export function isPersisted(url) {
  const u = normalizeApiUrl(url);
  return PERSIST.some((re) => re.test(u));
}

/** Remove every snapshot (logout, account switch). */
export function clearSnapshots() {
  memory.clear();
  const ls = store();
  if (!ls) return;
  try {
    const keys = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => ls.removeItem(k));
    ls.removeItem(OWNER_KEY);
  } catch { /* storage blocked: memory copy is already gone */ }
}

function ensureOwner() {
  const ls = store();
  if (!ls) return "";
  const owner = currentOwner();
  try {
    const saved = ls.getItem(OWNER_KEY) || "";
    if (saved && saved !== owner) clearSnapshots(); // another account on this phone
    if (owner) ls.setItem(OWNER_KEY, owner);
  } catch { /* ignore */ }
  return owner;
}

/** Called by api.get for every successful GET. */
export function rememberResponse(url, data) {
  if (data === undefined || data === null) return;
  if (typeof data === "string") return; // HTML fallbacks etc. are never a real answer
  const u = normalizeApiUrl(url);
  const entry = { data, at: Date.now() };
  memory.set(u, entry);
  if (memory.size > 200) memory.delete(memory.keys().next().value);
  if (!isPersisted(u)) return;
  const ls = store();
  const owner = ensureOwner();
  if (!ls || !owner) return;
  try {
    const text = JSON.stringify(entry);
    if (text.length > MAX_BYTES) return;
    ls.setItem(PREFIX + u, text);
  } catch { /* storage full: memory copy still works */ }
}

/** Last good answer for this GET url, or undefined. Never makes a network call. */
export function peekApi(url) {
  const u = normalizeApiUrl(url);
  const hit = memory.get(u);
  if (hit && Date.now() - hit.at < MAX_AGE_MS) return hit.data;
  if (!isPersisted(u)) return undefined;
  const ls = store();
  if (!ls) return undefined;
  const owner = currentOwner();
  try {
    if (!owner || ls.getItem(OWNER_KEY) !== owner) return undefined;
    const raw = ls.getItem(PREFIX + u);
    if (!raw) return undefined;
    const entry = JSON.parse(raw);
    if (!entry || Date.now() - Number(entry.at || 0) > MAX_AGE_MS) return undefined;
    memory.set(u, entry);
    return entry.data;
  } catch {
    return undefined;
  }
}

/**
 * Drop-in for `api.get` that answers from the snapshot only: resolves `{ data }` or rejects when
 * there is nothing saved (so the caller's `.catch(() => fallback)` runs, exactly like offline).
 */
export function snapshotGet(url) {
  const data = peekApi(url);
  if (data === undefined) return Promise.reject(new Error("no-snapshot"));
  return Promise.resolve({ data, fromSnapshot: true });
}

/** true when every url has a saved answer. */
export function hasSnapshots(urls) {
  return urls.every((u) => peekApi(u) !== undefined);
}
