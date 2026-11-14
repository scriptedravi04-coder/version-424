import { useEffect, useRef } from "react";

// v426 (creator audit: "Back button sheet band nahi karta, page chhod deta hai"):
// while a sheet / overlay is open it adds one history entry. The phone's Back (or the browser's)
// then closes the sheet instead of leaving the page. Closing it any other way (X, backdrop, drag,
// Save) removes that entry again, unless the app already moved to a new page.
// Each open overlay is listed in history.state.ybexSheets, so stacked sheets close one at a time.
let seq = 0;
const KEY = "ybexSheets";

export function sheetsInHistory() {
  try { return (window.history.state && window.history.state[KEY]) || []; } catch { return []; }
}

export default function useBackToClose(open, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open || typeof window === "undefined" || !window.history?.pushState) return undefined;
    const id = `s${++seq}`;
    let poppedByBack = false;
    try {
      const st = window.history.state || {};
      window.history.pushState({ ...st, [KEY]: [...(st[KEY] || []), id] }, "");
    } catch { return undefined; }
    const onPop = () => {
      if (sheetsInHistory().includes(id)) return; // a sheet above this one closed
      poppedByBack = true;
      window.removeEventListener("popstate", onPop);
      closeRef.current?.();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (poppedByBack) return;
      // Closed with X / Save etc. Only step back if we are still on our own entry (no navigation since).
      const list = sheetsInHistory();
      if (list[list.length - 1] === id) { try { window.history.back(); } catch { /* ignore */ } }
    };
  }, [open]);
}

// v426 (creator audit: popups lag because they open exactly while the app is busiest, and several queue up
// one after another on every open). Shared rules for the "app open" popups — Diwali poster, quick actions,
// promo, What's New, push ask:
//   1. none opens until Home has its data (or 4 s have passed on another page);
//   2. ONE of them per app open — the first to claim it; the rest wait for the next open;
//   3. tab pre-loading (TabWarmup) waits while any of them is on screen.

const w = () => (typeof window !== "undefined" ? window : {});

export function markHomeReady() {
  const win = w();
  if (win.__ybHomeReady) return;
  win.__ybHomeReady = true;
  try { win.dispatchEvent(new Event("ybex:home-ready")); } catch { /* ignore */ }
}

/** Resolves once Home has loaded, or after `maxMs` (another landing page, slow network). */
export function waitForHomeReady(maxMs = 4000) {
  const win = w();
  if (win.__ybHomeReady || !win.addEventListener) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; win.removeEventListener("ybex:home-ready", finish); clearTimeout(t); setTimeout(resolve, 350); };
    const t = setTimeout(finish, maxMs);
    win.addEventListener("ybex:home-ready", finish);
  });
}

/** True if `name` may show as this open's popup (first caller wins; the same caller may ask again). */
export function claimAppOpenPopup(name) {
  const win = w();
  if (win.__ybOpenPopupUsed && win.__ybOpenPopupUsed !== name) return false;
  win.__ybOpenPopupUsed = name;
  return true;
}

export function appOpenPopupTakenBy() {
  return w().__ybOpenPopupUsed || null;
}

/** Any popup / sheet on screen right now? (TabWarmup waits for this to be false.) */
export function anyPopupOnScreen(doc = typeof document !== "undefined" ? document : null) {
  const win = w();
  if (win.__ybFullScreenAsk || win.__ybPromoShown) return true;
  if (!doc) return false;
  return Boolean(doc.getElementById("yb-splash") || doc.querySelector('[aria-modal="true"],[data-testid="quick-actions"]'));
}

/** Resolves when no other popup (Terms, KYC ask, splash…) is on screen — checked every 0.5 s, at most `maxMs`.
 *  Resolves false if one is still up at the end, so the caller can skip this open. */
export function waitForNoPopup(maxMs = 20000) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (!anyPopupOnScreen()) return resolve(true);
      if (Date.now() - started > maxMs) return resolve(false);
      setTimeout(tick, 500);
    };
    tick();
  });
}
