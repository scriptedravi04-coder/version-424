import { trackServerEvent, trackServerEvents } from "./metaPixel"; // v395
import { toast as sonnerToast } from "sonner"; // v408
import axios from "axios";
import { safeStorage } from "../utils/storage";
import { normalizeApiUrl } from "./apiUrl";
import { apiUrl, nativePlatform } from "./native";
import { rememberResponse, peekApi } from "./apiSnapshot";
import { isOffline, makeOfflineError, userJustActed, showOfflineToast, showCalmToast, setServerDownCheck, SERVER_TOAST_ID } from "./offline";
// v364 (Ravi: "server band ho toh error mat dikhao — local save, server wapas aaye toh DB mein"): server-down mode + outbox.
import { isServerDown, markServerDown, markServerUp, probeServer, makeServerDownError, isServerDownError, isGatewayStatus, looksLikeHtml, isApiUrl } from "./serverStatus";
import { canQueue, enqueue, replayOutbox, outboxCount } from "./outbox";

export const API = "/api";

// v416 (CR4): agency and talent-manager accounts are brand accounts — one shared check for the frontend
// (BrandRoute in App.jsx, Layout; ExploreMobile / NotificationItem can import it too).
export const BRAND_LIKE_ROLES = ["brand", "agency", "talent_manager"];
export function isBrandLike(roleOrUser) {
  const r = roleOrUser && typeof roleOrUser === "object" ? roleOrUser.role : roleOrUser;
  return BRAND_LIKE_ROLES.includes(String(r || "").toLowerCase());
}

// v416: friendly text for server-side (5xx) failures.
export const SERVER_SIDE_ERROR = "Something went wrong on our side. Please try again.";
const RAW_SERVER_TEXT = /(database|supabase|postgres|pgrst|violates|relation |column |null value|syntax|duplicate key|constraint|econn|etimedout|fetch failed|typeerror|referenceerror|cannot read|undefined|is not a function|not initialized|not connected|service key|scripts\/sql|internal server error|^server error$|^error$|jwt|stack|exception|\bat \w+ \(|sql)/i;
/** true when a 5xx message is raw / technical (or too short to mean anything) and must not reach the screen. */
export function isRawServerMessage(msg) {
  if (msg == null) return false;
  const t = String(msg).trim();
  if (t.length < 12) return true; // "x", "Error", "Failed"
  return RAW_SERVER_TEXT.test(t);
}
export function friendlyServerErrorBody(response) {
  if (!response || !(Number(response.status) >= 500)) return response;
  const d = response.data;
  if (d === undefined || d === null || typeof d !== "object") { response.data = { detail: SERVER_SIDE_ERROR, error: SERVER_SIDE_ERROR }; return response; }
  if (d.under_maintenance === true) return response;
  let changed = false;
  for (const k of ["detail", "error", "message"]) {
    if (d[k] == null) continue;
    const v = typeof d[k] === "string" ? d[k] : (typeof d[k] === "object" ? (d[k].message || JSON.stringify(d[k])) : String(d[k]));
    if (isRawServerMessage(v)) { if (!changed) d._raw_detail = v; d[k] = SERVER_SIDE_ERROR; changed = true; }
  }
  if (d.detail == null && d.error == null && d.message == null) d.detail = SERVER_SIDE_ERROR;
  return response;
}

/** v375: running inside the Android app (Capacitor), where navigator.onLine isn't trusted for actions. */
const nativeAndroid = () => {
  try { const c = typeof window !== "undefined" ? window.Capacitor : null; return Boolean(c && c.isNativePlatform?.() && c.getPlatform?.() === "android"); } catch { return false; }
};

export { normalizeApiUrl };

export const api = axios.create({
  baseURL: "",
  withCredentials: true,
  timeout: 30000,
});

const freshInFlight = new Map(); // v426
const getCache = new Map();

export const clearApiCache = () => {
  getCache.clear();
};
// v334: back online → no saved (offline) answer is reused from the 10-second cache; screens read fresh data.
if (typeof window !== "undefined") window.addEventListener("online", () => clearApiCache());

// Session 43 (v284, Supabase quota): a page that is not on screen (another browser tab, the app in
// the background, a laptop left open) kept every timer running — inbox, badges, orders, tickets —
// and each tick made the server read Supabase. That was most of the egress / log usage with no real
// users. Now a GET asked while the page is hidden waits until the page is visible again, and the
// same URL asked many times while hidden becomes ONE request. Nothing is dropped or turned into an
// error, the screen just refreshes when the person comes back. POST / PUT / DELETE are never held.
const isPageHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
let visibleWaiter = null;
const waitUntilVisible = () => {
  if (!visibleWaiter) {
    visibleWaiter = new Promise((resolve) => {
      const onChange = () => {
        if (isPageHidden()) return;
        document.removeEventListener("visibilitychange", onChange);
        visibleWaiter = null;
        resolve();
      };
      document.addEventListener("visibilitychange", onChange);
    });
  }
  return visibleWaiter;
};
const heldWhileHidden = new Map();
export const __heldGetCount = () => heldWhileHidden.size; // tests

// v333 (offline app): with no internet a GET answers with the last saved answer for that screen (same login),
// so the app opens "already loaded" on iPhone and Android instead of an error. Only network failures — a real
// server answer (401, 503 PAYMENTS_UNAVAILABLE, 404…) is never replaced. The OfflineBanner says it is old data.
export const isNetworkFailure = (err) => !err?.response && (
  err?.message === "Network Error" || err?.code === "ERR_NETWORK" || err?.code === "ECONNABORTED" ||
  (typeof navigator !== "undefined" && navigator.onLine === false));
// v364: the server itself not answering (redeploy / AI Studio "unavailable" page / gateway error) counts like offline.
// A real server answer (e.g. 503 PAYMENTS_UNAVAILABLE with a JSON body) is never replaced — only SERVER_DOWN errors.
export const isServerFailure = (err) => isServerDownError(err);
function offlineFallback(url, err) {
  if (!isNetworkFailure(err) && !isServerFailure(err)) throw err;
  const data = peekApi(url);
  if (data === undefined) {
    // An HTML page instead of JSON used to answer [] (no crash) — kept when there is nothing saved.
    if (err?.htmlAnswer) {
      try { window.dispatchEvent(new CustomEvent("ybex:offline-data", { detail: { url } })); } catch { /* old browser */ }
      return { data: [], status: 200, headers: {}, config: err?.config || {}, serverDown: true };
    }
    throw err;
  }
  try { window.dispatchEvent(new CustomEvent("ybex:offline-data", { detail: { url } })); } catch { /* old browser */ }
  return { data, status: 200, headers: {}, config: err?.config || {}, fromSnapshot: true, offline: true };
}

// Override api.get to implement lightweight in-memory caching
const originalGet = api.get;
api.get = async function(url, config) {
  const normalizedUrl = normalizeApiUrl(url);

  if (isPageHidden() && !config?.allowWhileHidden) {
    const holdKey = normalizedUrl + (config ? JSON.stringify(config) : "");
    if (heldWhileHidden.has(holdKey)) return heldWhileHidden.get(holdKey);
    const self = this;
    const held = waitUntilVisible()
      .then(() => api.get.call(self, url, config))
      .finally(() => heldWhileHidden.delete(holdKey));
    heldWhileHidden.set(holdKey, held);
    return held;
  }

  // v334: the phone says it is offline → the saved answer opens at once (no 500 ms retry, no waiting for the
  // request to fail). Nothing saved → the request goes out and fails as before (the screen shows OfflineState).
  if (isOffline()) {
    const saved = peekApi(normalizedUrl);
    if (saved !== undefined) {
      try { window.dispatchEvent(new CustomEvent("ybex:offline-data", { detail: { url: normalizedUrl } })); } catch { /* old browser */ }
      return { data: saved, status: 200, headers: {}, config: config || {}, fromSnapshot: true, offline: true };
    }
  }

  // v364: the server is known to be updating → saved answer at once (the 20 s check flips it back).
  if (isServerDown()) {
    const saved = peekApi(normalizedUrl);
    if (saved !== undefined) {
      try { window.dispatchEvent(new CustomEvent("ybex:offline-data", { detail: { url: normalizedUrl } })); } catch { /* old browser */ }
      return { data: saved, status: 200, headers: {}, config: config || {}, fromSnapshot: true, serverDown: true };
    }
  }

  // Allow bypassing cache if explicitly requested
  if (config?.bypassCache || config?.useCache === false) {
    // v426 (creator audit: Home sent verifications/me, collabs, creators/me twice): a fresh read that is already
    // on its way is shared instead of sent again — both callers still get a fresh answer.
    const flightKey = normalizedUrl + JSON.stringify(config?.params || null);
    const going = freshInFlight.get(flightKey);
    if (going) return going;
    const p = originalGet.call(this, normalizedUrl, config).then((res) => {
      rememberResponse(normalizedUrl, res?.data);
      return res;
    }).catch((err) => offlineFallback(normalizedUrl, err)); // v333
    freshInFlight.set(flightKey, p);
    const done = () => { if (freshInFlight.get(flightKey) === p) freshInFlight.delete(flightKey); };
    p.then(done, done);
    return p;
  }

  const cacheKey = normalizedUrl + (config ? JSON.stringify(config) : '');
  const cached = getCache.get(cacheKey);
  const now = Date.now();

  // Keep cache valid for 10 seconds
  if (cached && (now - cached.timestamp < 10000)) {
    return cached.promise;
  }

  const sharing = freshInFlight.get(normalizedUrl + JSON.stringify(config?.params || null)); // v426: a fresh read already going
  const promise = sharing || originalGet.call(this, normalizedUrl, config).then((res) => {
    // Session 42: keep the last good answer for instant screens (src/lib/apiSnapshot.js).
    rememberResponse(normalizedUrl, res?.data);
    return res;
  }).catch((err) => offlineFallback(normalizedUrl, err));
  getCache.set(cacheKey, {
    promise,
    timestamp: now,
  });

  // If the promise fails, delete it from the cache immediately
  promise.catch(() => {
    getCache.delete(cacheKey);
  });

  return promise;
};

// Interceptor to normalize URL, attach Bearer token & auto-clear cache on mutations
api.interceptors.request.use((config) => {
  if (config.url) {
    config.url = apiUrl(normalizeApiUrl(config.url)); // v335: live server inside the iPhone app (src/lib/native.js)
    config.baseURL = "";
  }

  // If request contains FormData or multipart payload (e.g. large video deliverables), extend timeout to 10 minutes
  const isMultipart = (typeof FormData !== 'undefined' && config.data instanceof FormData) || 
    (config.headers && (
      (config.headers['Content-Type'] && String(config.headers['Content-Type']).includes('multipart')) ||
      (config.headers['content-type'] && String(config.headers['content-type']).includes('multipart'))
    ));
  
  if (isMultipart) {
    // v344: axios already merged the 30000 default, so compare against api.defaults.timeout too
    if (!config.timeout || config.timeout === 15000 || config.timeout === api.defaults.timeout) {
      config.timeout = 600000; // 10 minutes for video & file uploads
    }
  }

  // Extend timeout for AI generation endpoints (Gemini long-form generation can take 20-60s)
  const isAiRoute = config.url && (
    config.url.includes('/admin/blog/generate') ||
    config.url.includes('/ai/') ||
    config.url.includes('generate-ai') ||
    config.url.includes('/ai-') ||
    config.url.includes('predict-roi') ||
    config.url.includes('profile-suggestions')
  );

  if (isAiRoute) {
    // v344: same as above — the merged 30000 default must not block the longer AI timeout
    if (!config.timeout || config.timeout === 15000 || config.timeout === api.defaults.timeout) {
      config.timeout = 120000; // 2 minutes for AI generation
    }
  }

  // v418: the Android app says so — the server sends its Meta Conversions API events as app events (action_source "app")
  try {
    if (nativePlatform() === "android") {
      config.headers["X-Ybex-Platform"] = "android";
      if (typeof window !== "undefined" && window.__ybNativeVersion) config.headers["X-Ybex-App-Version"] = String(window.__ybNativeVersion).slice(0, 20);
    }
  } catch { /* web */ }
  try {
    const t = safeStorage.getItem("ybex_token");
    if (t) config.headers.Authorization = `Bearer ${t}`;
  } catch (e) {
    console.error("Error accessing token in request interceptor:", e);
  }

  // Clear cache on write operations
  const method = config.method?.toLowerCase();
  // v334 (offline app): an action (send message, apply, pay, upload, save) tapped with no internet never leaves the
  // phone — it is refused here with code OFFLINE and the calm line "You're offline — try again when you're back
  // online" (src/lib/offline.js), which the screen's own error toast shows. Payment: the Razorpay order is never
  // created, so the Razorpay window never opens offline. A toast here only when the person just tapped something.
  const isWrite = method && method !== "get" && method !== "head" && method !== "options";
  // v364: own-data saves (profile, brand profile, portfolio, onboarding answers, Eva settings, read marks) tapped
  // offline or while the server is updating wait on the phone (src/lib/outbox.js) and the screen carries on.
  if (isWrite && !config._outboxReplay && (isOffline() || isServerDown()) && canQueue(config)) {
    enqueue(config);
    if (userJustActed()) showCalmToast("Saved on this phone — it will sync when Ybex is back", "ybex-outbox");
    config.adapter = () => Promise.resolve({ data: { ok: true, queued: true }, status: 202, statusText: "Queued", headers: {}, config, request: null });
    return config;
  }
  // v375 (Ravi's screenshot: Play app pay screen said "You're offline" while the phone was online): inside the Android
  // app the WebView's online flag can be wrong (e.g. after coming back from another app). There the request is sent
  // anyway; only a real network failure while the flag says offline becomes the calm offline error (response side).
  if (isWrite && isOffline() && nativeAndroid()) config._offlineFlag = true;
  else if (isWrite && isOffline()) {
    // Logout (works locally), push and signup-source bookkeeping stay quiet — the person isn't waiting on them.
    if (userJustActed() && !/\/(auth\/logout|auth\/signup-source|push\/|db\/own|onboarding\/progress)/.test(config.url || "")) showOfflineToast();
    return Promise.reject(makeOfflineError(config));
  }
  // v364: server updating → anything else (money, deals, chat, apply, KYC, OTP, uploads…) is refused calmly, never
  // half-sent. Logout still goes out (it works locally anyway) so the phone can sign out.
  if (isWrite && isServerDown() && !/\/auth\/logout/.test(config.url || "")) {
    if (userJustActed()) showCalmToast("Ybex is updating right now — try again in a few minutes", SERVER_TOAST_ID);
    return Promise.reject(makeServerDownError(config));
  }
  if (method && ["post", "put", "delete", "patch"].includes(method)) {
    clearApiCache();
    // v363 (Ravi: "Eva mai bio update pending dikha raha hai, kar ke aaya phir bhi"): screens with their own
    // short caches (Eva) drop them when something is saved.
    try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("ybex:data-changed", { detail: { url: config.url || "" } })); } catch { /* old browser */ }
  }

  return config;
});

export default api;

api.interceptors.response.use(
  (response) => {
    // v395: Meta "QualifiedCreator" — the server says this answer made a new creator reach 1,000+ Instagram followers
    if (response?.data && typeof response.data === "object" && Array.isArray(response.data.meta_events)) trackServerEvents(response.data.meta_events); // v418: 1K + 10K
    else if (response?.data && typeof response.data === "object" && response.data.meta_event) trackServerEvent(response.data.meta_event);
    // v364: an HTML page where /api JSON was expected = the app server isn't up (AI Studio "unavailable" page).
    if (looksLikeHtml(response.data) && isApiUrl(response.config?.url) && response.status !== 202) {
      console.warn("Received HTML instead of JSON for API URL:", response.config?.url);
      markServerDown();
      const cfg = response.config || {};
      if (!cfg._outboxReplay && canQueue(cfg)) {
        enqueue(cfg);
        return { ...response, status: 202, data: { ok: true, queued: true } };
      }
      const err = makeServerDownError(cfg);
      err.htmlAnswer = true;
      return Promise.reject(err);
    }
    if (response && response.status !== 202 && response.data !== undefined && typeof response.data !== "string") markServerUp();
    if (typeof response.data === 'string' && response.data.trim().startsWith('<')) {
      console.warn("Received HTML instead of JSON for API URL:", response.config?.url);
      const isGet = (response.config?.method || 'get').toLowerCase() === 'get';
      // If it's a GET request, fallback to empty array/null to prevent UI crash, but for mutations (POST/PUT/DELETE) reject properly
      if (!isGet) {
        const err = new Error("API endpoint returned HTML instead of JSON");
        err.response = {
          ...response,
          status: 404,
          data: { detail: "API endpoint returned an unexpected HTML response", code: "INVALID_RESPONSE" }
        };
        return Promise.reject(err);
      }
      return { ...response, data: [] };
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    // v408 (Ravi's video: a sub-admin saw "You don't have permission…" / "Failed to load…" pop up on pages they CAN open):
    // background reads of sections they don't have are quiet — the screen's toast is skipped (see installQuietPermissionToasts at the end of this file).
    if (error?.response?.status === 403 && error?.response?.data?.code === "ADMIN_PERMISSION_MISSING" && String(originalRequest?.method || "get").toLowerCase() === "get") {
      try { window.__ybQuietPermUntil = Date.now() + 2500; } catch { /* no window */ }
    }
    // v378: Admin switched maintenance on → the API answers 503 { under_maintenance: true }; tell the app right away
    // (App.jsx re-reads /api/system-status and shows the maintenance page) instead of screens spinning forever.
    if (error?.response?.status === 503 && error?.response?.data && error.response.data.under_maintenance === true) {
      try { window.dispatchEvent(new CustomEvent("ybex:maintenance", { detail: error.response.data })); } catch { /* old browser */ }
    }
    if (isServerDownError(error) || error?.isOffline) return Promise.reject(error);
    // v364: gateway error (502/503/504/52x) from /api → server updating. An own-data save waits in the outbox
    // (the server never ran it); a GET falls back to the saved answer in api.get.
    const gwBody = error?.response?.data;
    const notOurJson = gwBody === undefined || gwBody === null || gwBody === "" || typeof gwBody === "string"
      || (gwBody && typeof gwBody === "object" && gwBody.code === "SERVER_DOWN"); // v378: the Cloudflare worker's "server unreachable" answer
    if (isGatewayStatus(error?.response?.status) && notOurJson && isApiUrl(originalRequest?.url)) {
      markServerDown();
      if (originalRequest && !originalRequest._outboxReplay && canQueue(originalRequest)) {
        enqueue(originalRequest);
        return { data: { ok: true, queued: true }, status: 202, statusText: "Queued", headers: {}, config: originalRequest };
      }
      return Promise.reject(Object.assign(makeServerDownError(originalRequest), { cause: error }));
    }
    // v375: Android app, flag said offline and the request really failed → the calm offline error, as before.
    if (originalRequest?._offlineFlag && !error.response && isOffline()) return Promise.reject(makeOfflineError(originalRequest));
    // Retry once on transient network errors if not already retried
    // GET only. Retrying a POST after a network error can double-submit — a second escrow
    // hold, a duplicate message — because the first request may well have reached the
    // server and only the response was lost. GETs are safe to repeat; nothing else is.
    const isIdempotent = String(originalRequest?.method || "get").toLowerCase() === "get";
    const isTransientNetwork =
      error.message === "Network Error" || error.code === "ERR_NETWORK" || error.code === "ECONNABORTED";
    if (isTransientNetwork && isIdempotent && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await new Promise(resolve => setTimeout(resolve, 500));
        return await api(originalRequest);
      } catch (retryErr) {
        console.warn("API Network Error retry failed:", originalRequest.url);
        // v364: the phone is online but the server didn't answer → check whether Ybex is updating (no wait here).
        if (typeof navigator === "undefined" || navigator.onLine !== false) probeServer();
        return Promise.reject(retryErr);
      }
    }
    if (error.response && typeof error.response.data === 'string' && error.response.data.trim().startsWith('<')) {
      console.warn("Received HTML error response instead of JSON for URL:", error.config?.url);
      error.response.data = {
        detail: error.response.status >= 500 ? SERVER_SIDE_ERROR : `Server returned an error (${error.response.status}). Please try again.`, // v416
        error: error.response.status >= 500 ? SERVER_SIDE_ERROR : (error.response.statusText || "Server error"),
        code: "SERVER_ERROR"
      };
    }
    // v416: a 5xx never shows raw server text (DB errors, "x", stack bits) — screens that toast detail/error/message get
    // the calm line instead. Hand-written server messages ("Your payment is safe, but…") and every 4xx detail are kept.
    if (error?.response) friendlyServerErrorBody(error.response);
    return Promise.reject(error);
  }
);

// v364: the outbox is sent once Ybex answers again — when the phone comes online, when the server check says it's
// back, a few seconds after start, and every 30 s while something waits. One item at a time, the real request.
setServerDownCheck(isServerDown);
export function flushOutbox() {
  if (isOffline() || isServerDown() || !outboxCount()) return Promise.resolve({ sent: 0, dropped: 0, left: outboxCount() });
  return replayOutbox({
    send: (item) => api.request({ method: item.method, url: item.url, data: item.data, _outboxReplay: true }),
    onDropped: (msg) => showCalmToast(`One change couldn't be saved: ${msg}`, "ybex-outbox-drop", 6000),
  }).then((r) => {
    if (r.sent) {
      try { window.dispatchEvent(new CustomEvent("ybex:data-changed", { detail: { url: "outbox" } })); } catch { /* old browser */ }
      try { window.dispatchEvent(new CustomEvent("ybex:outbox-synced", { detail: r })); } catch { /* old browser */ }
    }
    return r;
  }).catch(() => ({ sent: 0, dropped: 0, left: outboxCount() }));
}
if (typeof window !== "undefined" && !window.__ybOutboxInstalled) {
  window.__ybOutboxInstalled = true;
  window.addEventListener("online", () => setTimeout(flushOutbox, 1500));
  window.addEventListener("ybex:server", (e) => { if (!e?.detail?.down) setTimeout(flushOutbox, 1000); });
  setTimeout(flushOutbox, 3000);
  setInterval(() => { if (outboxCount() && (typeof document === "undefined" || document.visibilityState !== "hidden")) flushOutbox(); }, 30000);
}

// ── v408: quiet permission toasts for sub-admins (was lib/quietToasts.js; merged here — 1,000-file limit) ──
// v408 (Ravi's admin video): a sub-admin opening a page they DO have saw red toasts from background reads of sections
// they don't have ("You don't have permission for this…", "Failed to load waitlist data."). api.js marks a GET that came
// back 403 ADMIN_PERMISSION_MISSING; for 2.5 s after that, error toasts are not shown. A toast after a click on a real
// action (POST / save) still shows — those requests never set the mark.


export function shouldQuietToast(now = Date.now(), until = (typeof window !== "undefined" ? window.__ybQuietPermUntil : 0)) {
  return Number(until || 0) > now;
}

let patched = false;
export function installQuietPermissionToasts() {
  if (patched || typeof window === "undefined" || !sonnerToast || typeof sonnerToast.error !== "function") return;
  patched = true;
  const original = sonnerToast.error.bind(sonnerToast);
  sonnerToast.error = (...args) => (shouldQuietToast() ? undefined : original(...args));
}
