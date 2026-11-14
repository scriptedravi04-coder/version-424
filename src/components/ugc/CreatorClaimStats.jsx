import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";

// Session 24. What the brand sees about a creator who claimed their brief: KYC badge, rating,
// completed orders, on-time %, followers and up to 3 portfolio thumbnails. Only real data — a new
// creator gets "New on Ybex", never 0 stars / 0%. A missing portfolio hides that row.
// (The full designed card comes from Claude Design later; this is the working data layer.)

const cache = new Map();

export async function loadCreator(id) {
  if (cache.has(id)) return cache.get(id);
  const p = Promise.all([
    api.get(`/creators/${id}/ugc-stats`).then((r) => r.data).catch(() => null),
    api.get(`/creators/${id}/profile`).then((r) => r.data).catch(() => null),
  ]).then(([stats, profile]) => ({ stats, profile }));
  cache.set(id, p);
  p.catch(() => cache.delete(id));
  return p;
}

const fmt = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(v));
};

function parseItem(p) {
  if (p && typeof p === "object") return p;
  if (typeof p === "string") {
    try { const x = JSON.parse(p); return typeof x === "object" && x ? x : { url: p }; } catch { return { url: p }; }
  }
  return null;
}

const isImage = (u) => /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(String(u || ""));
const isVideo = (u) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(String(u || ""));

export function summarizeCreator(stats, profile) {
  const s = stats || {};
  const hasRating = Number(s.rating_count) > 0 && s.rating_avg !== null && s.rating_avg !== undefined;
  const hasOrders = Number(s.completed_orders) > 0;
  const hasOnTime = s.on_time_pct !== null && s.on_time_pct !== undefined && Number(s.on_time_sample) > 0;
  const c = profile || {};
  const ratingShown = hasRating ? Math.round(Number(s.rating_avg) * 10) / 10 : null; // v332: "4.6666667 ★" → "4.7 ★"
  const ig = fmt(c.ig_followers ?? c.instagram_followers ?? c.followers_instagram ?? c.follower_count);
  const yt = fmt(c.followers_youtube ?? c.youtube_subscribers);
  const items = (Array.isArray(c.portfolio) ? c.portfolio : []).map(parseItem).filter(Boolean);
  const thumbs = items
    .map((it) => it.thumbnail || it.image || it.url || it.content_url || it.link)
    .filter(isImage)
    .slice(0, 3);
  // Tiles for the designed card: images show as images, our own uploaded videos as a play tile.
  const tiles = items
    .map((it) => {
      const url = it.thumbnail || it.image || it.url || it.content_url || it.link;
      if (!url) return null;
      if (isImage(url)) return { url, isVideo: false };
      if (isVideo(url)) return { url, isVideo: true };
      return null;
    })
    .filter(Boolean);
  const nicheRaw = c.niche || c.primary_niche || c.category || c.niches;
  const niches = (Array.isArray(nicheRaw) ? nicheRaw : String(nicheRaw || "").split(/[,·|]/))
    .map((x) => String(x).trim())
    .filter((x) => x && !/select category/i.test(x))
    .slice(0, 3);
  return {
    kyc: Boolean(s.kyc_verified),
    isNew: !hasRating && !hasOrders,
    rating: hasRating ? `⭐ ${ratingShown} (${s.rating_count})` : null,
    orders: hasOrders ? `${s.completed_orders} order${s.completed_orders === 1 ? "" : "s"}` : null,
    onTime: hasOnTime ? `${s.on_time_pct}% on time` : null,
    platforms: [ig && `Instagram ${ig}`, yt && `YouTube ${yt}`].filter(Boolean),
    platformList: [ig && { kind: "instagram", count: ig }, yt && { kind: "youtube", count: yt }].filter(Boolean),
    thumbs,
    tiles: tiles.slice(0, 3),
    tilesTotal: tiles.length,
    niches,
    name: c.name || c.full_name || c.display_name || null,
    avatar: c.picture || c.photo || c.avatar_url || c.avatar || null,
    ratingValue: hasRating ? ratingShown : null,
    reviewsText: hasRating ? `${s.rating_count} review${s.rating_count === 1 ? "" : "s"}` : null,
  };
}

export default function CreatorClaimStats({ creatorId, onNavigate }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!creatorId) return undefined;
    let alive = true;
    loadCreator(String(creatorId)).then((d) => { if (alive) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, [creatorId]);

  if (!creatorId) return null;
  if (!data) return <div className="mt-1.5 h-3 w-40 rounded bg-[var(--border-default)] animate-pulse" aria-hidden="true" />;

  const v = summarizeCreator(data.stats, data.profile);
  const chips = [v.rating, v.orders, v.onTime].filter(Boolean);
  return (
    <div className="mt-1.5 space-y-1.5" data-testid="creator-claim-stats">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {v.kyc && <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold">✓ KYC verified</span>}
        {v.isNew ? (
          <span className="px-1.5 py-0.5 rounded-md bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-secondary)] font-semibold">New on Ybex</span>
        ) : (
          chips.map((t) => (
            <span key={t} className="px-1.5 py-0.5 rounded-md bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] font-semibold">{t}</span>
          ))
        )}
      </div>
      {v.platforms.length > 0 && (
        <p className="text-[11px] text-[var(--text-tertiary)]">{v.platforms.join(" · ")}</p>
      )}
      {v.thumbs.length > 0 && (
        <div className="flex gap-1.5">
          {v.thumbs.map((u) => (
            <img key={u} src={u} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; } /* v332: hide a dead thumbnail */} className="w-10 h-10 rounded-lg object-cover border border-[var(--border-default)]" />
          ))}
        </div>
      )}
      <Link to={`/creator/${creatorId}`} onClick={onNavigate} className="inline-block text-[11px] font-bold text-[var(--violet)] hover:underline">
        View full profile →
      </Link>
    </div>
  );
}
