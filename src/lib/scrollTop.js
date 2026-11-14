// Session 48 (Ravi: "any page I open from Profile / Account opens already scrolled — it should open
// fresh from the top"). One helper every screen change can call. The app scrolls an inner box
// (#app-scroll-container) on phones, the window on some browsers, and a few screens have their own
// [data-page-scroll] box — reset all of them.
export function scrollAppToTop() {
  try { const el = document.getElementById("app-scroll-container"); if (el) el.scrollTop = 0; } catch { /* no DOM */ }
  try { window.scrollTo(0, 0); } catch { /* no window */ }
  try { document.documentElement.scrollTop = 0; document.body.scrollTop = 0; } catch { /* no DOM */ }
  try { document.querySelectorAll("[data-page-scroll]").forEach((el) => { el.scrollTop = 0; }); } catch { /* no DOM */ }
}

/**
 * Reset now, and again a few times while a late-painting screen (lazy file, skeleton → content) settles.
 * Stops as soon as the person touches / scrolls, so it never fights them. Returns a cancel function.
 */
export function scrollAppToTopSettled(delays = [80, 220, 450]) {
  scrollAppToTop();
  let touched = false;
  const onTouch = () => { touched = true; };
  const opts = { passive: true, capture: true };
  try { ["touchstart", "wheel", "keydown", "mousedown"].forEach((e) => window.addEventListener(e, onTouch, opts)); } catch { /* no window */ }
  // A bottom-tab switch restores that tab's own position (BottomNav marks window.__ybScrollRestore) —
  // don't undo it.
  const restoring = () => { try { return Date.now() - Number(window.__ybScrollRestore || 0) < 1500; } catch { return false; } };
  const timers = delays.map((d) => setTimeout(() => { if (!touched && !restoring()) scrollAppToTop(); }, d));
  const last = setTimeout(() => cleanup(), Math.max(0, ...delays) + 20);
  function cleanup() {
    timers.forEach(clearTimeout); clearTimeout(last);
    try { ["touchstart", "wheel", "keydown", "mousedown"].forEach((e) => window.removeEventListener(e, onTouch, opts)); } catch { /* no window */ }
  }
  return cleanup;
}
