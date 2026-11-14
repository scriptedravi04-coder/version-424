import React, { useState } from "react";

// Session 43 (Ravi): brand cards showed only a "C" / "S" letter even when the brand has a logo.
// Shows the real logo; falls back to the first letter when there is no logo, when the server
// sent only a generated initials picture, or when the picture fails to load.
// v283 (Ravi: "Gutargoo / Skullcandy show the whole screenshot as a tiny picture"): the logo now
// FILLS the tile (centre crop) instead of shrinking to fit; brands can crop it exactly when they
// upload (LogoCropper). `logo` is accepted as another name for `src`.
export function realLogoUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (/dicebear\.com|ui-avatars\.com/i.test(u)) return "";
  return u;
}

export default function BrandLogo({ src, logo, name, size = 34, radius = 11, className = "", testId }) {
  const [broken, setBroken] = useState(false);
  const url = realLogoUrl(src || logo);
  const letter = String(name || "?").trim().charAt(0).toUpperCase() || "?";
  const box = { width: size, height: size, borderRadius: radius, flexShrink: 0 };
  if (url && !broken) {
    return (
      <img
        src={url}
        alt={name ? `${name} logo` : ""}
        onError={() => setBroken(true)}
        loading="lazy"
        data-testid={testId}
        className={`bg-white border border-[#EEF1F5] object-cover ${className}`}
        style={box}
      />
    );
  }
  return (
    <div
      data-testid={testId}
      className={`bg-gradient-to-br from-[#A78BFA] to-[#5B21B6] flex items-center justify-center font-bold text-white ${className}`}
      style={{ ...box, fontSize: Math.round(size * 0.4) }}
    >
      {letter}
    </div>
  );
}
