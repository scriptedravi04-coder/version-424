import { api } from "./api";
// Session 24. A brand pays for a UGC brief, then the app posts the brief with that paid order.
// If the post fails (network, server error), the money is already taken — pressing "Secure brief
// & pay" again used to open a NEW checkout and charge a second time. Now the paid order is kept
// on this device and the next tap posts the brief with it (the server checks it is paid, covers
// the escrow and funds nothing else).
const KEY = "ugc_paid_order";
// Session 56 (payment audit): the order is also remembered the moment it is CREATED (before paying),
// so if the phone closes the app during the UPI switch, the next tap first asks Razorpay whether that
// order got paid instead of charging again. Both are tied to the logged-in brand, so another account
// on the same phone never picks them up.
const PENDING_KEY = "ugc_pending_order";
const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function currentUserId() {
  try { const u = JSON.parse(localStorage.getItem("ybex_user") || "null"); return String(u?.user_id || u?.id || ""); } catch { return ""; }
}
// v416 (CR7): the keys themselves are per user ("ugc_paid_order:<user id>"), and an entry is only used when it
// carries the same user id. Old shared entries (no user id / another user) are never picked up, so a second
// account on the same device can't post with — or skip paying because of — someone else's order.
const keyFor = (base, uid = currentUserId()) => `${base}:${uid || "anon"}`;
function readOwn(base) {
  const uid = currentUserId();
  if (!uid) return null; // v416: not logged in → never reuse an order
  try {
    const v = JSON.parse(localStorage.getItem(keyFor(base, uid)) || "null");
    if (!v || typeof v.order_id !== "string" || !v.order_id) return null;
    if (String(v.user_id || "") !== uid) return null; // v416: strict owner check
    return v;
  } catch {
    return null;
  }
}
function writeOwn(base, orderId, amount, terms = null) {
  const uid = currentUserId();
  if (!orderId || !uid) return;
  // v423 (P7): the budget / creator count that were PAID are kept with the order — a retry posts exactly those, even if
  // the form was changed afterwards (more → PAYMENT_TOO_LOW and stuck money; less → an unrecorded overpayment).
  const t = terms && Number(terms.budget) > 0 && Number(terms.max_creators) > 0 ? { budget: Number(terms.budget), max_creators: Number(terms.max_creators) } : null;
  localStorage.setItem(keyFor(base, uid), JSON.stringify({ order_id: orderId, amount: Number(amount) || 0, at: Date.now(), user_id: uid, ...(t ? { terms: t } : {}) }));
}
function removeOwn(base) {
  try { localStorage.removeItem(keyFor(base)); localStorage.removeItem(base); } catch { /* storage unavailable */ } // v416: also drops the old shared key
}

export function getPaidBriefOrder() {
  return readOwn(KEY);
}

export function savePaidBriefOrder(orderId, amount, terms = null) {
  try {
    // v423 (P7): + the paid terms — given here, or kept from the pending entry, or from this same order's earlier save
    const same = readOwn(KEY);
    writeOwn(KEY, orderId, amount, terms || readOwn(PENDING_KEY)?.terms || (same && same.order_id === orderId ? same.terms : null) || null);
    removeOwn(PENDING_KEY);
  } catch { /* storage unavailable */ }
}

export function clearPaidBriefOrder() {
  removeOwn(KEY); removeOwn(PENDING_KEY); // v416
}

/** Remember an order as soon as it exists (not paid yet). */
export function savePendingBriefOrder(orderId, amount, terms = null) {
  try { writeOwn(PENDING_KEY, orderId, amount, terms); } catch { /* storage unavailable */ } // v416; v423: + terms
}

/** v423 (P7): the numbers a saved paid order was paid for, or null (older saves). Pure apart from storage. */
export function paidBriefTerms() {
  const v = readOwn(KEY);
  return v?.terms && Number(v.terms.budget) > 0 && Number(v.terms.max_creators) > 0 ? v.terms : null;
}

/**
 * Before opening a new checkout: was the last order made on this phone paid after all?
 * Paid → it becomes the saved paid order and its id is returned (post the brief with it).
 * Not paid / too old → forgotten, null.
 */
export async function recoverPendingBriefOrder(checkStatus = checkBriefOrderPaid, now = Date.now(), fetchServer = fetchServerPaidBriefOrders, expectedAmount = 0) {
  const v = readOwn(PENDING_KEY);
  if (!v) {
    // v423 (P8): nothing on this device — ask the server for a brief order this brand already PAID on another device.
    try {
      const list = Number(expectedAmount) > 0 ? await fetchServer(expectedAmount) : [];
      // only an order for exactly this amount — anything else would be refused (or under-fund the brief) and come back every tap
      const want = Math.round(Number(expectedAmount) || 0);
      const hit = want > 0 && Array.isArray(list) ? list.find((o) => o && typeof o.order_id === "string" && Math.round(Number(o.amount) || 0) === want) : null;
      if (hit) { savePaidBriefOrder(hit.order_id, hit.amount); return hit.order_id; }
    } catch { /* server can't say → normal checkout */ }
    return null;
  }
  if (now - Number(v.at || 0) > PENDING_MAX_AGE_MS) { removeOwn(PENDING_KEY); return null; } // v416
  try {
    if (await checkStatus(v.order_id)) { savePaidBriefOrder(v.order_id, v.amount, v.terms || null); return v.order_id; }
  } catch { return null; } // can't tell right now — keep it for the next tap, open a normal checkout
  removeOwn(PENDING_KEY); // v416
  return null;
}

/** Server codes after which the saved order must not be tried again. */
// v423 (P9): permanent validation errors are final too — retrying the same paid order can never succeed, so the brand
// is sent to support (refund) instead of a "Retry saving brief" button that never works.
export const FINAL_ORDER_CODES = ["PAYMENT_ALREADY_USED", "PAYMENT_TOO_LOW", "PAYMENT_NOT_COMPLETED", "BUDGET_OUT_OF_RANGE"];
/** v423 (P9): true when posting with this paid order can never work — a final code, or any 4xx refusal (the same data
 *  gets the same answer). Network errors, timeouts and 5xx stay retryable. Pure. */
export function isFinalBriefError(err) {
  const code = String(err?.response?.data?.code || "");
  if (FINAL_ORDER_CODES.includes(code)) return true;
  const st = Number(err?.response?.status) || 0;
  return st >= 400 && st < 500 && st !== 401 && st !== 408 && st !== 429;
}

// Session 26. Where the brand lands after a paid brief is posted: My Briefs.
export const BRIEF_POSTED_PATH = "/brand/ugc/briefs?tab=briefs";

// Session 31 (Ravi): after paying, the brand saw an EMPTY "Create brief" form. Razorpay Checkout
// adds a browser-history entry and goes "back" when it closes; that pops My Briefs back to the post
// page, which remounts empty (the draft is already removed). Three guards:
//   1. a flag in sessionStorage says "a brief was just posted" (60 s);
//   2. the post page, if it mounts while that flag is fresh, goes straight to My Briefs (replace);
//   3. a short while after leaving, if the URL is back on the post page, replace it with My Briefs.
const POSTED_FLAG = "ugc_brief_posted_at";
export const RECENT_POST_MS = 60000;

export function markBriefPosted(now = Date.now()) {
  try { sessionStorage.setItem(POSTED_FLAG, String(now)); } catch { /* storage unavailable */ }
}

/** true (once) when a brief was posted in the last `windowMs`; the flag is cleared when read. */
export function takeRecentBriefPost(windowMs = RECENT_POST_MS, now = Date.now()) {
  try {
    const at = Number(sessionStorage.getItem(POSTED_FLAG) || 0);
    if (!at) return false;
    sessionStorage.removeItem(POSTED_FLAG);
    return now - at >= 0 && now - at <= windowMs;
  } catch {
    return false;
  }
}

const onPostPage = () => {
  try { return window.location.pathname.startsWith("/brand/ugc/post"); } catch { return false; }
};

/**
 * Leave the post page for My Briefs. Uses the router first; once the checkout has closed (and may
 * have gone "back"), puts My Briefs in place of the post page; if a lazy page never finished loading
 * (the old "stuck on Processing…" report) it does a full page load instead.
 */
export function goToPostedBriefs(navigate, { fallbackMs = 2500, settleMs = 800 } = {}) {
  markBriefPosted();
  try { navigate(BRIEF_POSTED_PATH); } catch { /* fall through to the hard redirect */ }
  if (typeof window === "undefined") return;
  setTimeout(() => {
    try { if (onPostPage()) navigate(BRIEF_POSTED_PATH, { replace: true }); } catch { /* ignore */ }
  }, settleMs);
  setTimeout(() => {
    try { if (onPostPage()) window.location.replace(BRIEF_POSTED_PATH); } catch { /* ignore */ }
  }, fallbackMs);
}

/**
 * Safety net while the checkout is open: if the payment for `orderId` completes but the normal
 * success callback never arrives, call `onPaid(orderId)` once. Returns a stop function.
 * The brief post is idempotent per order on the server, so a double call is harmless.
 */
export function watchPaidOrder(checkStatus, orderId, onPaid, { startAfterMs = 15000, intervalMs = 5000, maxMs = 300000 } = {}) {
  if (!orderId || typeof checkStatus !== "function") return () => {};
  let stopped = false;
  let timer = null;
  const began = Date.now();
  const tick = async () => {
    if (stopped) return;
    if (Date.now() - began > maxMs) { stopped = true; return; }
    try {
      const paid = await checkStatus(orderId);
      if (!stopped && paid) { stopped = true; onPaid(orderId); return; }
    } catch { /* transient — try again */ }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };
  timer = setTimeout(tick, startAfterMs);
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

/** true when Razorpay / the server say this order is paid. */
/** v423 (P8): the brand's paid-but-unused brief orders from the server (any device). */
export async function fetchServerPaidBriefOrders(amount = 0) {
  const { data } = await api.get(`payments/brief-paid-orders${Number(amount) > 0 ? `?amount=${Math.round(Number(amount))}` : ""}`, { bypassCache: true });
  return Array.isArray(data?.orders) ? data.orders : [];
}

export async function checkBriefOrderPaid(orderId) {
  const { data } = await api.post("payments/razorpay/check-status", { order_id: orderId });
  return Boolean(data?.paid);
}
