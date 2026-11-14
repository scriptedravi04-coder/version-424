import React, { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";

// Session 23 — Loader design 14a ("cold-start splash").
// Shown ONLY on the first app open, while the session is still unknown (AuthContext.loading).
// Solid background (no blur), a 28px wordmark on every screen size, and a 64×3px track with a
// violet segment sliding across. Fades out in 200 ms once the session is known, then unmounts
// for good — later loads use the top bar (GlobalLoader) or skeletons, never this.
export default function ColdStartSplash() {
  const { loading } = useAuth();
  // v297 (Ravi: the logo/animation showed more than once): when the installed app's own launch intro is playing
  // (index.html sets window.__ybSplash), that intro already covers the loading — no second "Ybex" screen after it.
  const introPlaying = typeof window !== "undefined" && Boolean(window.__ybSplash);
  const [phase, setPhase] = useState(loading && !introPlaying ? "show" : "gone");

  useEffect(() => {
    if (!loading && phase === "show") {
      setPhase("fade");
    }
  }, [loading, phase]);

  useEffect(() => {
    if (phase === "fade") {
      const t = setTimeout(() => setPhase("gone"), 220);
      return () => clearTimeout(t);
    }
  }, [phase]);

  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      setPhase("gone");
    }, 2500);
    return () => clearTimeout(safetyTimer);
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      role="status"
      aria-label="Loading Ybex"
      onTransitionEnd={() => setPhase("gone")}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 110,
        background: "var(--bg-base, #F7F7FA)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        opacity: phase === "fade" ? 0 : 1,
        pointerEvents: phase === "show" ? "auto" : "none",
        transition: "opacity .2s ease-out",
      }}
    >
      <style>{`
        @keyframes ybSlide { 0% { transform: translateX(-100%); } 100% { transform: translateX(260%); } }
        .yb-splash-seg { width: 40%; height: 100%; border-radius: 3px; background: var(--violet, #7C3AED);
          animation: ybSlide 1.1s cubic-bezier(.45, 0, .55, 1) infinite; }
        @media (prefers-reduced-motion: reduce) { .yb-splash-seg { animation: none; transform: translateX(75%); } }
      `}</style>
      <span
        style={{
          font: "900 28px/1 'DM Sans', system-ui, -apple-system, sans-serif", // v430: app font
          letterSpacing: "-0.04em",
          color: "var(--text-primary, #0A0A0A)",
          userSelect: "none",
        }}
      >
        Ybex
      </span>
      <div style={{ width: 64, height: 3, borderRadius: 3, background: "var(--border-default, #E5E5EA)", overflow: "hidden" }}>
        <div className="yb-splash-seg" />
      </div>
    </div>
  );
}
