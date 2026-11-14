import React from "react";
import { APP_VERSION } from "../../lib/appVersion";

// v356 (Ravi's "Settings & Home" design): the end of Settings — version line, then the founder note
// ("Why I built Ybex", signature, @ybex.in, "Crafted with ♥ in Jaipur") with Ravi's 3D illustration.
// Phone = the design 1:1. Desktop = the same note as a wide soft card under the settings panels.
export const FOUNDER = {
  title: "Why I built Ybex",
  body: "So creators get paid on time and brands get work they can trust.",
  name: "Ravi Sharma",
  role: "Founder, Ybex",
  instagram: "https://www.instagram.com/ybex.in/",
  handle: "@ybex.in",
  photo: "/img/footer/founder-ravi.webp",
  signature: "/img/footer/founder-signature.webp",
};

export function VersionLine({ className = "", style }) {
  return (
    <div
      data-testid="app-version-line"
      className={className}
      style={{ textAlign: "center", font: "500 11.5px 'DM Sans', sans-serif", color: "#9CA3AF", ...style }}
    >
      Ybex {APP_VERSION} · © {new Date().getFullYear()} Ybex Media. All rights reserved.
    </div>
  );
}

function InstagramIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function NoteText({ big = false }) {
  const k = big ? 1.25 : 1;
  return (
    <>
      <span style={{ font: `700 ${17 * k}px 'DM Sans', sans-serif`, color: "#475569" }}>{FOUNDER.title}</span>
      <span style={{ font: `400 ${13 * k}px/1.5 'DM Sans', sans-serif`, color: "#94A3B8", textWrap: "pretty" }}>{FOUNDER.body}</span>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 2 }}>
        <img
          src={FOUNDER.signature} alt="Ravi Sharma's signature" loading="lazy" decoding="async" draggable="false"
          style={{ width: 64 * k, height: "auto", margin: "0 0 3px -1px", opacity: 0.9, maxWidth: "none" }}
        />
        <span style={{ font: `700 ${13 * k}px/1.3 'DM Sans', sans-serif`, color: "#334155", whiteSpace: "nowrap" }}>{FOUNDER.name}</span>
        <span style={{ font: `500 ${11.5 * k}px/1.3 'DM Sans', sans-serif`, color: "#94A3B8", whiteSpace: "nowrap" }}>{FOUNDER.role}</span>
      </div>
      <div aria-hidden="true" style={{ height: 0, borderTop: "1px dashed #D9D3E8", margin: "6px 0 2px" }} />
      <a
        href={FOUNDER.instagram} target="_blank" rel="noopener noreferrer"
        className="hover:!text-[#7C3AED] transition-colors"
        style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, font: `600 ${13 * k}px 'DM Sans', sans-serif`, color: "#475569", textDecoration: "none" }}
      >
        <InstagramIcon size={14 * k} />{FOUNDER.handle}
      </a>
      <span style={{ font: `500 ${11 * k}px 'DM Sans', sans-serif`, color: "#A3ADBD", whiteSpace: "nowrap", marginTop: -2 }}>
        Crafted with <span style={{ color: "#E11D48" }}>♥</span> in Jaipur
      </span>
    </>
  );
}

// Phone: full-bleed block (parent gives no side padding), sits right on top of the bottom nav.
export function FounderNoteMobile({ className = "" }) {
  return (
    <div data-testid="founder-note" className={`relative overflow-hidden select-none ${className}`} style={{ marginTop: 24, minHeight: 272 }}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute", right: -40, bottom: -30, width: 260, height: 260, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(183,156,242,0.55) 0%, rgba(183,156,242,0) 70%)",
        }}
      />
      <img
        src={FOUNDER.photo} alt="Ravi working on his laptop" loading="lazy" decoding="async" draggable="false"
        style={{ position: "absolute", right: 10, bottom: 0, width: 150, height: 258, objectFit: "contain", objectPosition: "center bottom", maxWidth: "none" }}
      />
      <div style={{ position: "relative", padding: "4px 20px 18px", maxWidth: 190, display: "flex", flexDirection: "column", gap: 8 }}>
        <NoteText />
      </div>
    </div>
  );
}

// Desktop: a wide soft card under the settings panels, version line under it.
export function FounderNoteDesktop({ className = "" }) {
  return (
    <div data-testid="founder-note-desktop" className={`hidden md:block select-none ${className}`}>
      <div
        className="relative overflow-hidden"
        style={{
          borderRadius: 28, border: "1px solid #EEE9F8", minHeight: 300,
          background: "linear-gradient(115deg, #FFFFFF 0%, #FBF9FF 55%, #F3EDFE 100%)",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute", right: -60, bottom: -90, width: 420, height: 420, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(183,156,242,0.55) 0%, rgba(183,156,242,0) 70%)",
          }}
        />
        <img
          src={FOUNDER.photo} alt="Ravi working on his laptop" loading="lazy" decoding="async" draggable="false"
          style={{ position: "absolute", right: 56, bottom: 0, width: 168, height: 288, objectFit: "contain", objectPosition: "center bottom", maxWidth: "none" }}
        />
        <div style={{ position: "relative", padding: "36px 44px 30px", maxWidth: 420, display: "flex", flexDirection: "column", gap: 10 }}>
          <NoteText big />
        </div>
      </div>
      <VersionLine style={{ marginTop: 16 }} />
    </div>
  );
}
