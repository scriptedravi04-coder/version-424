import React, { useState } from "react";
import { initials } from "../../utils/initials";

// Session 38 (Ravi): a person without a photo used to get the same stock photo of a stranger
// (unsplash), which looked like a real creator. Now: their photo, or their initials.
export function initialsOf(name) {
  return initials(name, { lastWord: true }); // v346: emoji-safe (first + last word, whole characters)
}

export default function PersonPhoto({ src, name, className = "", textClassName = "text-sm", alt }) {
  const [broken, setBroken] = useState(false);
  const url = typeof src === "string" ? src.trim() : "";
  if (url && !broken) {
    return <img src={url} alt={alt ?? name ?? ""} loading="lazy" decoding="async" className={className} onError={() => setBroken(true)} />;
  }
  return (
    <div
      role="img"
      aria-label={name || "Creator"}
      className={`${className} flex items-center justify-center bg-[var(--violet)]/15 text-[var(--violet)] font-bold select-none ${textClassName}`}
    >
      {initialsOf(name)}
    </div>
  );
}
