// Session 39 (M9, Ravi: "keyboard khulta hai toh overlap kr deta hai ... screen automatic upr ho jani
// chaiye"): when a phone keyboard opens, the field being typed in (and the button right under it)
// must stay visible. Installed once for the whole app:
//  1. --kb = how much of the page bottom the keyboard covers. Scroll areas add it as bottom padding,
//     so even a short page has room to move its last field above the keyboard.
//  2. On focus (and when the keyboard finishes opening) the focused field scrolls to the middle of
//     what is still visible.
//
// Session 40 (Ravi's iPhone screenshots: tab bar riding on top of the keyboard, chat composer not
// docking): iPhone scrolls the page up when a field is focused, and the old sum
// (innerHeight - visible height - scroll offset) then dropped under the 80px threshold, so the app
// thought the keyboard was closed. Now:
//  - "kb-open" = a typing field is focused AND the visible area is clearly shorter than the full
//    screen (we remember the tallest screen seen, so Android, where the page itself shrinks, works).
//  - --vvh / --vvtop = the visible area's height and top. A full-screen box (the open chat) uses them
//    to sit exactly between the top of the screen and the keyboard.
const TYPING = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="file"]):not([type="range"]), textarea, select, [contenteditable="true"]';

let installed = false;

// v396 (Ravi: Samsung, Android app, Eva — "keyboard khul gaya but screen upar nahi hui"): the Android app targets SDK 36,
// so it is edge-to-edge and Android no longer shrinks the WebView for the keyboard; visualViewport doesn't change
// either, so nothing above could see the keyboard. Two other sources tell us its height:
//  - the Capacitor Keyboard plugin (app build with @capacitor/keyboard): window "keyboardWillShow" { keyboardHeight }
//  - the VirtualKeyboard API (Chromium WebView): navigator.virtualKeyboard "geometrychange"
// Only used when the page itself did NOT shrink (else the old way already works).
let nativeKb = 0;
/** Keyboard height reported by the app / WebView (CSS px), 0 when closed or unknown. */
export function nativeKeyboardHeight() { return nativeKb; }
function setNativeKb(h) {
  const v = Math.max(0, Math.round(Number(h) || 0));
  if (v === nativeKb) return;
  nativeKb = v;
  try { window.dispatchEvent(new CustomEvent("ybex:native-kb", { detail: v })); } catch { /* old WebView */ }
}
function isAndroidApp() {
  try { const c = window.Capacitor; return Boolean(c && (c.isNativePlatform ? c.isNativePlatform() : c.isNative) && c.getPlatform?.() === "android"); } catch { return false; }
}
/** Is the keyboard covering the page although the page didn't shrink? Pure, for tests. */
function nativeKbOpen({ focused, nativeH, layoutShrunk }) {
  return Boolean(focused && !layoutShrunk && nativeH > 80);
}
let tallest = 0;
let lastWidth = 0;

/** Part of the page bottom covered by the keyboard (used for padding and lifting sheets). */
function keyboardHeight() {
  const vv = window.visualViewport;
  if (!vv) return 0;
  const h = Math.round(window.innerHeight - vv.height - vv.offsetTop);
  return h > 80 ? h : 0; // ignore browser-bar wobble
}

function typingFocused() {
  const el = typeof document !== "undefined" ? document.activeElement : null;
  return Boolean(el && el.matches && el.matches(TYPING));
}

/**
 * Is the keyboard open? Pure, for tests.
 * screenH = tallest layout height seen at this width; visibleH = visualViewport.height;
 * scale = visualViewport.scale (pinch zoom also shrinks visibleH — that is not a keyboard).
 */
function isKeyboardOpen({ focused, screenH, visibleH, scale = 1 }) {
  if (!focused) return false;
  if (scale && scale > 1.05) return false;
  return screenH - visibleH > 120;
}

function revealFocused() {
  const el = document.activeElement;
  if (!el || !el.matches || !el.matches(TYPING)) return;
  try {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  } catch (e) {
    try { el.scrollIntoView(); } catch (e2) { /* ignore */ }
  }
}

export function installKeyboardAware() {
  if (installed || typeof window === "undefined" || typeof document === "undefined") return;
  installed = true;
  const root = document.documentElement;
  // Session 43 (Ravi: Motorola / Android — "screen goes up and down fast while typing"): every
  // visual-viewport scroll called update(), which scrolled the field into view again (smooth),
  // which moved the viewport, which called update()… a loop that shook the screen. Now: the field is
  // brought into view ONCE per focus (when the keyboard opens), updates are batched per frame, and
  // CSS values are written only when they change.
  let revealedFor = null;
  let wasOpen = false;
  const last = {};
  const setVar = (k, v) => { if (last[k] !== v) { last[k] = v; root.style.setProperty(k, v); } };
  let frame = 0;
  const schedule = () => { if (frame) return; frame = requestAnimationFrame(() => { frame = 0; update(); }); };
  const update = () => {
    const vv = window.visualViewport;
    if (window.innerWidth !== lastWidth) { lastWidth = window.innerWidth; tallest = 0; } // rotation
    tallest = Math.max(tallest, window.innerHeight);
    const layoutShrunk = tallest - window.innerHeight > 120;
    const viaNative = nativeKbOpen({ focused: typingFocused(), nativeH: nativeKb, layoutShrunk }); // v396
    const visibleH = viaNative ? Math.max(120, window.innerHeight - nativeKb) : (vv ? vv.height : window.innerHeight);
    const open = viaNative || isKeyboardOpen({ focused: typingFocused(), screenH: tallest, visibleH, scale: vv ? vv.scale : 1 });
    // Same measure as session 39 for padding / lifting sheets: the part of the page bottom the
    // keyboard covers right now (0 when iPhone already scrolled the bottom into view).
    // Session 43 (v271, Ravi's Android video — contract OTP sheet shaking): Android Chrome used to
    // only shrink the *visible* area; a lifted sheet moved the field, Chrome scrolled the visible
    // area to it, offsetTop changed, --kb changed, the sheet moved again — dozens of times a second.
    // index.html now asks Android to shrink the page itself (interactive-widget=resizes-content),
    // so the page already ends at the keyboard and nothing needs lifting (kb = 0). Small changes
    // (< 24px) are ignored so a wobble can never start a loop.
    const rawKb = viaNative ? nativeKb : open && !layoutShrunk ? keyboardHeight() : 0;
    const prevKb = parseInt(last["--kb"] || "0", 10) || 0;
    const kb = rawKb === 0 || Math.abs(rawKb - prevKb) >= 24 ? rawKb : prevKb;
    setVar("--kb", `${kb}px`);
    setVar("--vvh", `${Math.round(visibleH)}px`);
    setVar("--vvtop", `${Math.round(viaNative ? 0 : (vv ? vv.offsetTop : 0))}px`);
    if (open !== wasOpen) root.classList.toggle("kb-open", open);
    const el = document.activeElement;
    if (open && (!wasOpen || revealedFor !== el)) { revealedFor = el; revealFocused(); }
    if (!open) revealedFor = null;
    wasOpen = open;
  };
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", schedule);
    window.visualViewport.addEventListener("scroll", schedule);
  }
  window.addEventListener("resize", schedule);
  // v396: keyboard height from the Android app (Capacitor Keyboard plugin events)
  const fromPlugin = (e) => { setNativeKb(e?.keyboardHeight ?? e?.detail?.keyboardHeight ?? 0); schedule(); };
  window.addEventListener("keyboardWillShow", fromPlugin);
  window.addEventListener("keyboardDidShow", fromPlugin);
  window.addEventListener("keyboardWillHide", () => { setNativeKb(0); schedule(); });
  window.addEventListener("keyboardDidHide", () => { setNativeKb(0); schedule(); });
  // v396: …and from the WebView itself (Android app only — on the website the page shrinks normally)
  try {
    const vk = navigator.virtualKeyboard;
    if (vk && isAndroidApp()) {
      vk.overlaysContent = true;
      vk.addEventListener("geometrychange", (e) => { setNativeKb(e?.target?.boundingRect?.height ?? vk.boundingRect?.height ?? 0); schedule(); });
    }
  } catch { /* not supported */ }
  document.addEventListener("focusin", (e) => {
    if (!e.target || !e.target.matches || !e.target.matches(TYPING)) return;
    // Wait for the keyboard to finish sliding up, then bring the field into view.
    setTimeout(schedule, 360);
  });
  document.addEventListener("focusout", () => setTimeout(schedule, 120));
  update();
}

export const __test = { keyboardHeight, isKeyboardOpen, nativeKbOpen, TYPING, setNativeKb };
