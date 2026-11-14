import React from "react";
import { useLoading } from "../../contexts/LoadingContext";

// Session 23 — Loader design 14b ("route change: 2px top progress bar").
//
// This used to be a fixed full-screen overlay with backdrop blur and a 256px "Ybex" SVG whose
// hollow "e" read as "Yb x" — for every fetch, save, OTP send and logout. Now it is a 2px violet
// bar on the top edge: no overlay, never blocks taps, the page underneath stays usable.
// Same startLoading / stopLoading API, so none of the callers change.
//   loading   → 0 → 68% (ease-out), holds there
//   finishing → 100%, then fades (LoadingContext keeps it mounted 250 ms for this)
// prefers-reduced-motion: a static bar, no animation.
export default function GlobalLoader() {
  const { isLoading, isFinishing } = useLoading();
  if (!isLoading && !isFinishing) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        zIndex: 100,
        pointerEvents: "none",
        paddingTop: "env(safe-area-inset-top, 0px)",
        boxSizing: "content-box",
      }}
    >
      <style>{`
        @keyframes ybBarRun { from { width: 0; } to { width: 68%; } }
        .yb-topbar { height: 2px; background: var(--violet, #7C3AED); border-radius: 0 2px 2px 0;
          box-shadow: 0 0 6px rgba(124, 58, 237, .45); }
        .yb-topbar.run { width: 68%; animation: ybBarRun 1.4s cubic-bezier(.16, 1, .3, 1) both; }
        .yb-topbar.done { width: 100%; opacity: 0; transition: width .2s ease-out, opacity .25s ease-in .05s; }
        @media (prefers-reduced-motion: reduce) {
          .yb-topbar.run { animation: none; width: 68%; }
          .yb-topbar.done { transition: none; }
        }
      `}</style>
      <div className={`yb-topbar ${isFinishing && !isLoading ? "done" : "run"}`} />
    </div>
  );
}
