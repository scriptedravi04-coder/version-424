import { useEffect } from "react";

// Session 29: while a modal / drawer is open the page behind it must not scroll.
// The app scrolls inside #app-scroll-container (Layout.jsx), not only <body>, so both are locked.
// A counter keeps nested overlays working: the page unlocks only when the last one closes.
let locks = 0;
let saved = [];

function targets() {
  const els = [document.body];
  const box = document.getElementById("app-scroll-container");
  if (box) els.push(box);
  return els;
}

export function lockScroll() {
  if (typeof document === "undefined") return;
  if (locks === 0) {
    saved = targets().map((el) => [el, el.style.overflow]);
    saved.forEach(([el]) => { el.style.overflow = "hidden"; });
  }
  locks += 1;
}

export function unlockScroll() {
  if (typeof document === "undefined" || locks === 0) return;
  locks -= 1;
  if (locks === 0) {
    saved.forEach(([el, prev]) => { el.style.overflow = prev; });
    saved = [];
  }
}

export default function useScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    lockScroll();
    return () => unlockScroll();
  }, [active]);
}
