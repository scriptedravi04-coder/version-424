// v346: avatar initials that never cut an emoji in half ("Glow 🌿 Cosmetics" showed "G�").
// Characters are read with Array.from (whole code points) and words with no letter or digit (an emoji,
// "&", "-") are skipped, so "Glow 🌿 Cosmetics" → "GC".

const LETTER = /[\p{L}\p{N}]/u;

const lettersOf = (word) => Array.from(word).filter((ch) => LETTER.test(ch));

/**
 * initials("Glow 🌿 Cosmetics") → "GC"
 * options: fallback ("?" when there is no letter), lastWord (first + last word instead of first two),
 * oneWordLetters (how many letters a one-word name gives, default 1).
 */
export function initials(name, { fallback = "?", lastWord = false, oneWordLetters = 1 } = {}) {
  const words = String(name ?? "").trim().split(/\s+/).map(lettersOf).filter((w) => w.length > 0);
  if (words.length === 0) return fallback;
  if (words.length === 1) return words[0].slice(0, Math.max(1, oneWordLetters)).join("").toUpperCase();
  const second = lastWord ? words[words.length - 1] : words[1];
  return (words[0][0] + second[0]).toUpperCase();
}

/** First letter only (for one-letter logos). */
export const firstLetter = (name, fallback = "?") => {
  const w = lettersOf(String(name ?? "").trim());
  return w.length ? w[0].toUpperCase() : fallback;
};

export default initials;

/** v423 (security S11): a local initials avatar (SVG data URL) — replaces api.dicebear.com, which received brand names
 *  (unlaunched campaigns included) in its URL and broke offline / under a strict CSP. `seed` may arrive URL-encoded. */
export function initialsAvatarUrl(seed, bg = "6366f1") {
  let name = String(seed ?? "");
  try { name = decodeURIComponent(name); } catch { /* not encoded */ }
  const txt = initials(name, { fallback: "B" }).replace(/[<>&"']/g, "");
  const color = /^[0-9a-f]{3,8}$/i.test(String(bg)) ? `#${bg}` : "#6366f1";
  const fg = /^e5e7eb$/i.test(String(bg)) ? "#4b5563" : "#ffffff";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${color}"/><text x="50" y="50" dy=".35em" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="42" fill="${fg}">${txt}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
