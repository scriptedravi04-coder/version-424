// v363 (Ravi's "Instagram auto-fetch" design): small number / time helpers shared by the Instagram live card,
// the connect sheet and the profile hub strip. Missing numbers always show "—" (never a made-up 0).

const num = (n) => (n === null || n === undefined || n === "" || !Number.isFinite(Number(n)) ? null : Number(n));

/** 10376 → "10,376" (Indian grouping), missing → "—". */
export const fmtFull = (n) => (num(n) === null ? "—" : num(n).toLocaleString("en-IN"));

/** 10376 → "10.4K", 1250000 → "1.3M", missing → "—". */
export function fmtK(n) {
  const v = num(n);
  if (v === null) return "—";
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(v));
}

/** 11.214 → "11.21%" (or "11.2%" with digits=1), missing → "—". */
export function fmtPct(n, digits = 2) {
  const v = num(n);
  return v === null ? "—" : `${Number(v.toFixed(digits))}%`;
}

/** ISO time → "just now" / "12 min ago" / "10h ago" / "3 days ago". */
export function agoShort(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** "@Elite_Ravi " / "instagram.com/elite_ravi/" → "elite_ravi" (same rule as the server's cleanUsername), else "". */
export function cleanIgHandle(v) {
  let s = String(v ?? "").trim();
  const m = /instagram\.com\/([^/?#\s]+)/i.exec(s);
  if (m) s = m[1];
  s = s.replace(/^@+/, "").replace(/\/+$/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(s) && !/^\.|\.\.|\.$/.test(s) ? s : "";
}

/** The live numbers in one place: avg views falls back to 28-day reach (Instagram Login accounts). */
export function liveNumbers(stats) {
  const s = stats || {};
  return {
    followers: num(s.followers),
    avgViews: num(s.avg_views) ?? num(s.reach_28d),
    avgLikes: num(s.avg_likes),
    engagement: num(s.engagement_rate),
  };
}

/** v372 (Ravi's video: a real, public @elite_ravi got "Couldn't find that account" while the server was unreachable):
 *  the server's own message when it answered; a "can't reach Ybex" line when nothing came back (no internet / Ybex
 *  updating); `notFound` only for a real 404. Pure. */
export function igErrorText(e, fallback = "Couldn't fetch. Try again.", notFound = "") {
  const r = e?.response;
  if (!r) return "Couldn't reach Ybex (your internet, or Ybex is updating). Try again in a minute.";
  if (r.data?.error) return r.data.error;
  if (r.status === 404 && notFound) return notFound;
  return fallback;
}
