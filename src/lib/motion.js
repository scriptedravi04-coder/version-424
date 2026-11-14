// Session 37 — ONE place for every animation setting in the app (Ravi: "simple, sleek,
// bade apps jaisa — app dummy na lage"). Screens import from here instead of inventing
// their own spring / duration, so the whole app moves the same way.
//
// Rules:
//   - opacity + transform only (stays smooth on cheap phones)
//   - open ≈ 0.22 s, close faster ≈ 0.16 s, no bounce, no infinite loops on app screens
//   - phone "reduce motion" setting is honoured globally (MotionConfig in App.jsx)

import { animate, stagger } from "framer-motion";

export const EASE_OUT = [0.22, 1, 0.36, 1];     // quick start, soft landing
export const EASE_IN = [0.4, 0, 1, 1];          // used for leaving

export const DUR = {
  fast: 0.16,   // close / leave
  base: 0.22,   // open / enter
  page: 0.2,    // route change
};

// Phone-like sheet: settles quickly, never wobbles.
export const SHEET_SPRING = { type: "spring", stiffness: 420, damping: 40, mass: 0.9 };

const open = { duration: DUR.base, ease: EASE_OUT };
const close = { duration: DUR.fast, ease: EASE_IN };

// Spread on the dark layer behind a popup: <motion.div {...backdropMotion} />
export const backdropMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: open },
  exit: { opacity: 0, transition: close },
};

// Mobile bottom sheet: slides up, slides down when closed.
// Session 58 (Ravi: "popups jitter maarte hai, laggy lagte hai"): a timed slide instead of a spring — a spring
// is re-solved every frame on the main thread and stutters on a busy phone (the chat behind is re-rendering);
// a fixed 0.28 s curve can run on the compositor and always lands in the same place.
export const SHEET_OPEN = { duration: 0.28, ease: [0.32, 0.72, 0, 1] };
export const sheetMotion = {
  initial: { y: "100%" },
  animate: { y: 0, transition: SHEET_OPEN },
  exit: { y: "100%", transition: { duration: 0.2, ease: EASE_IN } },
};

// Desktop popup: fades in with a very small grow, fades out.
export const modalMotion = {
  initial: { opacity: 0, scale: 0.96, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: open },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: close },
};

// Side drawer (desktop detail panels).
export const drawerMotion = {
  initial: { x: "100%" },
  animate: { x: 0, transition: { duration: 0.26, ease: EASE_OUT } },
  exit: { x: "100%", transition: { duration: 0.2, ease: EASE_IN } },
};

// Small things appearing in place (cards, toasts, inline panels).
export const fadeMotion = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: open },
  exit: { opacity: 0, transition: close },
};

// Button press feedback.
export const press = { whileTap: { scale: 0.97 } };

// Lists: children come in one after another, quickly.
export const listMotion = {
  initial: "hidden",
  animate: "show",
  variants: { hidden: {}, show: { transition: { staggerChildren: 0.04 } } },
};
export const listItemMotion = {
  variants: {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: open },
  },
};

// Sheet on phones, centered popup on bigger screens. `below` = breakpoint in px
// (640 for popups laid out with `items-end sm:items-center`, 768 = app's mobile split).
export function isSheetViewport(below = 768) {
  try {
    return typeof window !== "undefined" && window.innerWidth < below;
  } catch {
    return false;
  }
}

export function panelMotion(kind = "auto", below = 768) {
  if (kind === "sheet") return sheetMotion;
  if (kind === "modal") return modalMotion;
  if (kind === "drawer") return drawerMotion;
  if (kind === "fade") return fadeMotion;
  return isSheetViewport(below) ? sheetMotion : modalMotion;
}

// Route change. Mobile: a page going deeper comes in from the right, going back comes from
// the left; switching tabs / desktop just fades. Exit is instant so navigation never waits.
// Session 41 (Ravi: "animations jitter / laggy"): the page wrapper used to slide (x/y). While a
// transform is on the wrapper, every position:fixed bar inside it (Apply bar, chat input, sheets)
// is positioned against the moving page and jumps. Pages now only fade — no transform at all.
export function pageMotion(direction = "none") {
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: direction === "none" ? 0.14 : DUR.page, ease: EASE_OUT } },
  };
}

// Drag-down-to-close decision for sheets.
export function shouldCloseSheet(info) {
  const dy = info?.offset?.y ?? 0;
  const vy = info?.velocity?.y ?? 0;
  return dy > 90 || vy > 600;
}

// Bottom-nav tabs: switching between them is a fade, not a slide (like big apps).
const TAB_ROOTS = new Set([
  "/dashboard", "/campaigns", "/creator/ugc", "/creator/inbox", "/creator/profile",
  "/brand", "/creators", "/brand/inbox", "/brand/account", "/admin",
]);

const depth = (p) => String(p || "/").split("?")[0].split("/").filter(Boolean).length;
const clean = (p) => String(p || "/").split("?")[0].replace(/\/+$/, "") || "/";

// navType: react-router's "PUSH" | "REPLACE" | "POP". Returns "forward" | "back" | "none".
export function pageDirection(prevPath, nextPath, navType) {
  if (!prevPath || clean(prevPath) === clean(nextPath)) return "none";
  if (TAB_ROOTS.has(clean(prevPath)) && TAB_ROOTS.has(clean(nextPath))) return "none";
  if (navType === "POP") return "back";
  const a = depth(prevPath), b = depth(nextPath);
  if (b > a) return "forward";
  if (b < a) return "back";
  return "none";
}

export function prefersReducedMotion() {
  try {
    return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// Number counting up inside an element (replaces the old GSAP counters). Returns a stop function.
export function countUp(el, to, { from = 0, duration = 0.8, format = (v) => String(Math.round(v)) } = {}) {
  if (!el) return () => {};
  const target = Number(to) || 0;
  if (prefersReducedMotion() || target === from) {
    el.textContent = format(target);
    return () => {};
  }
  const controls = animate(from, target, {
    duration,
    ease: EASE_OUT,
    onUpdate: (v) => { el.textContent = format(v); },
  });
  return () => controls.stop();
}

// Content appearing after it loads (dashboard blocks, timeline rows): quick fade-up, one
// after another. Replaces the old GSAP entrance. Returns a stop function.
export function revealChildren(nodes, { y = 10, x = 0, gap = 0.04 } = {}) {
  const list = Array.from(nodes || []).filter(Boolean);
  if (!list.length || prefersReducedMotion()) return () => {};
  const controls = animate(
    list,
    { opacity: [0, 1], transform: [`translate(${x}px, ${y}px)`, "translate(0px, 0px)"] },
    { duration: DUR.base + 0.06, ease: EASE_OUT, delay: stagger(gap) }
  );
  const done = () => list.forEach((n) => { n.style.removeProperty("opacity"); n.style.removeProperty("transform"); });
  controls.then?.(done);
  return () => { controls.stop(); done(); };
}
