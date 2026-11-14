import React from "react";
// v398 (Ravi 3 Nov: /admin and /ybx-admin showed "This page didn't load — Failed to fetch dynamically imported module
// /assets/Admin-….js"; Reload did not help).
// Why: after a deploy the file names of the app's screens change. The service worker keeps serving the OLD saved page
// (registerType 'prompt': a new version waits), so a plain reload brings the same old page back, which then asks the
// server for an old screen file that no longer exists (admin screens are not in the offline copy, so they always hit
// the server → 404). Fix: on such an error, let the waiting new version take over (or drop the old service worker),
// then reload — the page comes back on the new version. Guarded so it can never loop.

const GUARD_KEY = "ybex_stale_fix_ts";
const GUARD_MS = 20000;

export function isChunkLoadError(err) {
  const msg = String((err && (err.message || err.reason?.message)) || err || "").toLowerCase();
  return (
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("chunkloaderror") ||
    msg.includes("loading chunk") ||
    msg.includes("loading css chunk") ||
    msg.includes("unable to preload css") ||
    msg.includes("invalid hook call") ||
    msg.includes("reading 'usecontext'") ||
    msg.includes("reading 'usestate'") ||
    msg.includes("reading 'useeffect'") ||
    (err && err.name === "ChunkLoadError")
  );
}

const wait = (p, ms, fallback) => Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);

function guardOk(force) {
  try {
    const last = parseInt(window.sessionStorage.getItem(GUARD_KEY) || "0", 10);
    if (!force && Date.now() - last < GUARD_MS) return false;
    window.sessionStorage.setItem(GUARD_KEY, String(Date.now()));
  } catch { /* storage blocked: still try once */ }
  return true;
}

/** Brings the page to the newest version. Returns true when a reload is on its way (callers stop there),
 *  false when it already tried a moment ago (callers show the error screen instead of looping). */
export function recoverFromStaleBuild({ force = false } = {}) {
  if (typeof window === "undefined") return false;
  if (!guardOk(force)) return false;
  (async () => {
    try {
      const sw = navigator.serviceWorker;
      if (sw) {
        const regs = await wait(sw.getRegistrations(), 2000, []);
        await wait(Promise.all(regs.map((r) => r.update().catch(() => {}))), 4000);
        // A new version that is still downloading: give it a few seconds.
        const installing = regs.find((r) => r.installing);
        if (installing && installing.installing) {
          const w = installing.installing;
          await wait(new Promise((res) => w.addEventListener("statechange", () => { if (w.state !== "installing") res(); })), 6000);
        }
        const withWaiting = regs.find((r) => r.waiting);
        let switched = false;
        if (withWaiting && withWaiting.waiting) {
          const changed = new Promise((res) => sw.addEventListener("controllerchange", () => res(true), { once: true }));
          withWaiting.waiting.postMessage({ type: "SKIP_WAITING" });
          switched = await wait(changed, 3000, false);
        }
        // Still on the old saved page: drop the old service worker, the next load comes from the server
        // (it installs itself again 3 s after the page opens).
        if (!switched && sw.controller) await wait(Promise.all(regs.map((r) => r.unregister().catch(() => {}))), 3000);
      }
    } catch { /* fall through to the reload */ }
    window.location.reload();
  })();
  return true;
}

/** v398: React.lazy that tries a screen file twice, then moves an old page to the new version (no error screen). */
export function lazyRetry(load) {
  return React.lazy(async () => {
    const once = async () => {
      const m = await load();
      if (!m || !m.default) throw new Error("Failed to fetch dynamically imported module (empty chunk)");
      return m;
    };
    try { return await once(); } catch { /* one more try below */ }
    await new Promise((r) => setTimeout(r, 400));
    try { return await once(); } catch (err) {
      if (isChunkLoadError(err) && recoverFromStaleBuild()) return new Promise(() => {});
      throw err;
    }
  });
}

// v431 (Ravi: old cached version keeps running after an update): ask the server which version it carries; if this page
// is older, move to the new one — at once on a calm page, or as soon as the person leaves a busy page (payment, OTP,
// form). Checked 8 s after opening and whenever the app comes back to the screen (at most once in 10 minutes).
const BUSY_PATH = /\/(checkout|pay|payment|otp|verify|signup|onboarding|kyc|app\/continue|app\/details|chat|inbox|campaigns\/create|ugc\/create)/i;
const vnum = (v) => Number(String(v || "").replace(/[^0-9]/g, "")) || 0;
export function isOlderVersion(mine, server) { return vnum(server) > vnum(mine); }
export function startVersionWatch(currentVersion, { fetchImpl } = {}) {
  if (typeof window === "undefined" || window.__ybVersionWatch) return;
  window.__ybVersionWatch = true;
  let lastCheck = 0, pending = false;
  const tryMove = () => {
    if (!pending) return;
    if (BUSY_PATH.test(window.location.pathname)) return; // wait — never in the middle of a payment / form
    pending = false;
    recoverFromStaleBuild({ force: true });
  };
  const check = async () => {
    if (Date.now() - lastCheck < 10 * 60 * 1000) return tryMove();
    lastCheck = Date.now();
    try {
      const f = fetchImpl || window.fetch.bind(window);
      const r = await f(`/api/app-version?t=${Date.now()}`, { cache: "no-store" });
      const d = r && r.ok ? await r.json() : null;
      if (d && isOlderVersion(currentVersion, d.version)) {
        // once per new version per 30 min — if the reload still brings the old files, don't loop
        const key = "yb_ver_try_" + vnum(d.version);
        let last = 0; try { last = Number(window.sessionStorage.getItem(key)) || 0; } catch { /* storage off */ }
        if (Date.now() - last < 30 * 60 * 1000) return;
        try { window.sessionStorage.setItem(key, String(Date.now())); } catch { /* storage off */ }
        pending = true; tryMove();
      }
    } catch { /* offline — next time */ }
  };
  setTimeout(check, 8000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
  window.addEventListener("popstate", tryMove);
  const origPush = window.history.pushState;
  try { window.history.pushState = function (...a) { const r = origPush.apply(this, a); setTimeout(tryMove, 0); return r; }; } catch { /* locked */ }
}
