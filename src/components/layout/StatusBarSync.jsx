import { useLocation } from "react-router-dom";
import { useEffect } from "react";

// Session 42 (Ravi: "the strip behind the clock does not match the app — it looks cut").
// On a phone, the strip behind the clock / battery is painted by the phone, not by our page:
//   • iPhone (installed app) fills it with the page's root background colour,
//   • Android Chrome fills it with <meta name="theme-color">.
// After every page change we read the colour at the very top of the screen (the page's header)
// and give it to both, so the strip and the header are one colour.
const FALLBACK = "#F2F2F7";
const SPLASH = "#9B00FF"; // top of the launch splash gradient (index.html)

function parseColor(str) {
  const m = String(str || "").match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/i);
  if (m) {
    let a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (Number.isNaN(a)) a = 1;
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  const h = String(str || "").match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
  if (h) {
    const x = h[1].length === 3 ? h[1].split("").map((c) => c + c).join("") : h[1];
    return { r: parseInt(x.slice(0, 2), 16), g: parseInt(x.slice(2, 4), 16), b: parseInt(x.slice(4, 6), 16), a: 1 };
  }
  return null;
}

// v283: the body now carries the strip colour too (iOS 26 paints the strip from <body>), so the
// page's own base colour comes from the CSS variable, never from the body we just painted.
function baseColor(doc, win) {
  const v = win.getComputedStyle(doc.documentElement).getPropertyValue("--bg-base");
  return parseColor(v) || parseColor(FALLBACK);
}

// v377: on Android with the "moved down" fallback (native.js) the page starts below the strip → read the colour there.
function sampleY(doc, win) {
  try {
    if (!doc.documentElement.classList.contains("yb-sb-fallback")) return 2;
    return 2 + (parseFloat(win.getComputedStyle(doc.documentElement).getPropertyValue("--yb-android-top")) || 0);
  } catch { return 2; }
}

const toHex = ({ r, g, b }) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

// Session 43 (Ravi, v271): things that float above the page for a moment (toasts) never colour
// the strip — a green "Saved!" toast used to turn the bar green and it stayed that way.
const IGNORE = "[data-sonner-toaster],[data-sonner-toast],[data-statusbar-ignore],.Toastify,[role='status'],[role='alert']";

function paintOf(el, win) {
  const named = el.getAttribute && el.getAttribute("data-statusbar");
  if (named) { const c = parseColor(named); if (c) return { ...c, a: 1 }; }
  const cs = win.getComputedStyle(el);
  if (cs.visibility === "hidden" || cs.opacity === "0") return null;
  const img = cs.backgroundImage;
  if (img && img !== "none" && /gradient/i.test(img)) {
    const first = img.match(/rgba?\([^)]*\)|#[0-9a-f]{3,6}\b/i);
    const c = first && parseColor(first[0]);
    if (c && c.a > 0) return c;
  }
  const c = parseColor(cs.backgroundColor);
  return c && c.a > 0 ? c : null;
}

/** Colour the eye sees at the top centre: every layer there, mixed top-down, so a half-clear dark
 *  backdrop over a white page gives the dimmed grey the eye sees — not near-black. */
export function topColor(doc = document, win = window) {
  const x = Math.round(win.innerWidth / 2);
  let stack = [];
  if (typeof doc.elementsFromPoint === "function") stack = doc.elementsFromPoint(x, sampleY(doc, win)) || [];
  else {
    let el = doc.elementFromPoint && doc.elementFromPoint(x, sampleY(doc, win));
    while (el && el !== doc.documentElement) { stack.push(el); el = el.parentElement; }
  }
  let r = 0, g = 0, b = 0, a = 0; // front-to-back "over"
  for (const el of stack) {
    if (!el || el === doc.documentElement || el === doc.body) continue;
    if (el.closest && el.closest(IGNORE)) continue;
    const c = paintOf(el, win);
    if (!c) continue;
    const k = (1 - a) * c.a;
    r += c.r * k; g += c.g * k; b += c.b * k; a += k;
    if (a >= 0.98) break;
  }
  if (a < 0.98) {
    const base = baseColor(doc, win);
    const k = 1 - a;
    r += base.r * k; g += base.g * k; b += base.b * k; a = 1;
  }
  return toHex({ r, g, b });
}

/** Session 43: colour for the strip once the page is scrolled. A pinned (sticky / fixed) header at
 *  the top keeps its own colour; otherwise the strip takes the page background behind the cards —
 *  never the colour of whichever card happens to pass under it (that made it flicker). */
export function scrolledTopColor(doc = document, win = window) {
  const hit = doc.elementFromPoint(Math.round(win.innerWidth / 2), sampleY(doc, win));
  let el = hit;
  let scroller = null;
  while (el && el !== doc.documentElement) {
    const cs = win.getComputedStyle(el);
    if (cs.position === "fixed" || cs.position === "sticky") return topColor(doc, win);
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) { scroller = el; break; }
    el = el.parentElement;
  }
  const scrolled = scroller ? scroller.scrollTop : (win.scrollY || doc.documentElement.scrollTop || 0);
  if (scrolled <= 4) return topColor(doc, win);
  // First full-width, full-height paint behind the point = the page itself (cards are narrower).
  let bg = hit;
  while (bg && bg !== doc.documentElement && bg !== doc.body) {
    const r = bg.getBoundingClientRect();
    if (r.width >= win.innerWidth * 0.95 && r.height >= win.innerHeight * 0.9) {
      const c = parseColor(win.getComputedStyle(bg).backgroundColor);
      if (c && c.a >= 0.5) return toHex(c);
    }
    bg = bg.parentElement;
  }
  return toHex(baseColor(doc, win));
}

export function applyStatusBarColor(color, doc = document) {
  doc.documentElement.style.backgroundColor = color;
  // Session 43 (v283, Ravi: "status bar still white / grey, the app looks cut"): iPhone on iOS 26
  // paints the strip behind the clock from the <body> colour, not <html> or theme-color — every
  // screenshot had the body grey (#F2F2F7) there. The body gets the same colour now.
  if (doc.body) doc.body.style.backgroundColor = color;
  let meta = doc.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = doc.createElement("meta");
    meta.setAttribute("name", "theme-color");
    doc.head.appendChild(meta);
  }
  meta.setAttribute("content", color);
  // v377: Android app — the strip is its own bar now (native.js), so colour it and pick dark / light clock icons.
  try {
    const c = typeof window !== "undefined" ? window.Capacitor : null;
    const SB = c?.Plugins?.StatusBar;
    if (SB && c.isNativePlatform?.() && c.getPlatform?.() === "android") {
      const p = parseColor(color);
      const light = p ? (0.299 * p.r + 0.587 * p.g + 0.114 * p.b) / 255 > 0.6 : true;
      SB.setBackgroundColor?.({ color: p ? toHex(p) : color });
      SB.setStyle?.({ style: light ? "LIGHT" : "DARK" }); // LIGHT = dark icons on a light bar
    }
    // v430: Android 15+ ignores setBackgroundColor (edge-to-edge) — Ybex's own plugin paints the strip (app build v430+)
    const YB = c?.Plugins?.YbexBars;
    if (YB && c.isNativePlatform?.() && c.getPlatform?.() === "android") {
      const p = parseColor(color);
      const light = p ? (0.299 * p.r + 0.587 * p.g + 0.114 * p.b) / 255 > 0.6 : true;
      YB.setColor?.({ color: p ? toHex(p) : color, light })?.catch?.(() => {});
    }
  } catch { /* plugin not in this build */ }
}

// Session 43 (Ravi, after the preview): NOT one fixed purple. Each page's bar takes that page's top
// colour — the dashboard's header gradient continues up behind the clock; Messages / Settings are
// white, so the bar is white. Follows route changes and scrolling (see scrolledTopColor).
export default function StatusBarSync() {
  const location = useLocation();
  useEffect(() => {
    let last = "";
    const sync = () => {
      try {
        // v286 (Ravi: splash pe status bar safed): while the launch splash covers the app, the strip
        // stays splash purple. The splash has role="status", which this file ignores on purpose.
        const splash = document.getElementById("yb-splash");
        if (splash && !splash.hidden) { if (last !== SPLASH) { last = SPLASH; applyStatusBarColor(SPLASH); } return; }
        const c = scrolledTopColor();
        if (c && c !== last) { last = c; applyStatusBarColor(c); }
      } catch { /* old browser */ }
    };
    let frame = 0;
    // Session 43 (Ravi: lag while scrolling): reading the colour under the clock forces the phone to
    // re-measure the page, and this ran on EVERY scroll frame. Now at most every 150 ms while
    // scrolling, plus once when the scroll stops — the bar still follows, the swipe stays smooth.
    let lastRun = 0;
    let settle = 0;
    const run = () => { frame = 0; lastRun = Date.now(); sync(); };
    const onScroll = () => {
      clearTimeout(settle);
      settle = setTimeout(run, 160);
      if (frame || Date.now() - lastRun < 150) return;
      frame = requestAnimationFrame(run);
    };
    const timers = [60, 450, 1200, 2600].map((ms) => setTimeout(sync, ms));
    // Session 43 (v271): pages that load their data late (Manage orders) kept the loading grey.
    // A cheap re-check while the app is on screen; it only writes when the colour changes.
    const poll = setInterval(() => { if (!document.hidden) sync(); }, 700);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("ybex:splash-done", sync);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(poll);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("ybex:splash-done", sync);
      if (frame) cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [location.pathname, location.search]);
  return null;
}
