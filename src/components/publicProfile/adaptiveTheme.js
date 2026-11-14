// v363 (Ravi's design 1f, dev note 6 — "page colour comes from the creator's profile photo"):
// sample the average colour of the photo's bottom 15% (the edge that fades out) and use it as the page
// background + fade colour. Light colour (luminance > 0.6) → light theme (dark text, purple CTA, white glass),
// otherwise dark theme (white text, white CTA). The sampled colour is cached per photo URL on this phone.
import { useEffect, useState } from "react";

export const DARK_FALLBACK = "#0B0B10";
const CACHE_PREFIX = "ybex_photo_tone::";

/** "#rrggbb" → relative luminance 0..1 (WCAG). Pure. */
export function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Average of RGBA pixel data (skips transparent pixels) → "#rrggbb". Pure. */
export function averageHex(data) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i + 3 < (data?.length || 0); i += 4) {
    if (data[i + 3] < 16) continue;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1;
  }
  if (!n) return null;
  const h = (v) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Theme tokens for a page colour. Pure. */
export function themeFor(bg) {
  const light = luminance(bg) > 0.6;
  return light
    ? { mode: "light", bg, text: "#0A0A0A", sub: "rgba(10,10,10,.62)", glass: "rgba(255,255,255,.72)", glassBorder: "rgba(10,10,10,.08)", ctaBg: "#7C3AED", ctaText: "#FFFFFF", chipBg: "rgba(10,10,10,.06)" }
    : { mode: "dark", bg, text: "#FFFFFF", sub: "rgba(255,255,255,.66)", glass: "rgba(255,255,255,.08)", glassBorder: "rgba(255,255,255,.14)", ctaBg: "#FFFFFF", ctaText: "#0A0A0A", chipBg: "rgba(255,255,255,.12)" };
}

function readCache(url) {
  try { const v = window.localStorage.getItem(CACHE_PREFIX + url); return /^#[0-9a-f]{6}$/i.test(v || "") ? v : null; } catch { return null; }
}
function writeCache(url, hex) {
  try { window.localStorage.setItem(CACHE_PREFIX + url, hex); } catch { /* private mode */ }
}

/** Samples the bottom 15% of an image URL. Resolves "#rrggbb", or DARK_FALLBACK when it can't be read. */
export function sampleBottomColour(url) {
  return new Promise((resolve) => {
    if (!url || typeof document === "undefined") { resolve(DARK_FALLBACK); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const w = 48, h = Math.max(8, Math.round((img.naturalHeight / Math.max(1, img.naturalWidth)) * 48));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const band = Math.max(1, Math.round(h * 0.15));
        const hex = averageHex(ctx.getImageData(0, h - band, w, band).data); // throws when the canvas is tainted
        resolve(hex || DARK_FALLBACK);
      } catch { resolve(DARK_FALLBACK); }
    };
    img.onerror = () => resolve(DARK_FALLBACK);
    img.src = url;
  });
}

/** null photo → null (caller keeps its own header). Otherwise the theme, dark until the sample is ready. */
export function usePhotoTheme(photoUrl) {
  const [bg, setBg] = useState(() => (photoUrl ? readCache(photoUrl) || DARK_FALLBACK : null));
  useEffect(() => {
    if (!photoUrl) { setBg(null); return undefined; }
    const cached = readCache(photoUrl);
    if (cached) { setBg(cached); return undefined; }
    let alive = true;
    sampleBottomColour(photoUrl).then((hex) => {
      if (!alive) return;
      setBg(hex);
      if (hex !== DARK_FALLBACK) writeCache(photoUrl, hex);
    });
    return () => { alive = false; };
  }, [photoUrl]);
  return bg ? themeFor(bg) : null;
}
