import React, { useState } from "react";
import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import { initials as initialsOf } from "../../utils/initials";

const CREATOR_GLOW_PALETTE = [
  'rgba(56,132,255,0.65)',   // blue
  'rgba(46,200,140,0.65)',   // green
  'rgba(168,85,247,0.65)',   // purple
  'rgba(20,184,166,0.65)',   // teal
  'rgba(244,114,182,0.65)',  // pink
  'rgba(251,146,60,0.65)',   // orange
  'rgba(234,179,8,0.65)'     // amber
];

const NICHE_GLOW = {
  fashion: 'rgba(244,114,182,0.65)',
  fitness: 'rgba(46,200,140,0.65)',
  health: 'rgba(46,200,140,0.65)',
  lifestyle: 'rgba(168,85,247,0.65)',
  travel: 'rgba(56,132,255,0.65)',
  tech: 'rgba(20,184,166,0.65)',
  food: 'rgba(251,146,60,0.65)',
  comedy: 'rgba(234,179,8,0.65)',
  entertainment: 'rgba(234,179,8,0.65)'
};

function pickCreatorGlow(id, niche) {
  const n = (niche || '').toLowerCase();
  for (const k in NICHE_GLOW) {
    if (n.includes(k)) return NICHE_GLOW[k];
  }
  const s = (id || '').toString();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CREATOR_GLOW_PALETTE[Math.abs(h % CREATOR_GLOW_PALETTE.length)];
}

// v415: "rgba(r,g,b,0.65)" → same colour at a softer alpha (for the no-photo card background)
export function softTint(rgba, alpha) {
  const m = String(rgba || "").match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  return m ? `rgba(${m[1]},${m[2]},${m[3]},${alpha})` : `rgba(124,58,237,${alpha})`;
}

const formatNum = (v) => {
  if (!v && v !== 0) return "0";
  if (typeof v === 'string' && /[a-zA-Z]/.test(v)) return v;
  let n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : v;
  if (isNaN(n)) return String(v);
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + "M";
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + "K";
  return String(n);
};

export default function CreatorCard({ c, index = 0, onInvite }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const totalFollowers = (c.followers_count) || ((c.followers_instagram || 0) + (c.followers_youtube || 0));
  const reach = c.avg_reach_per_reel || c.avg_views_30d || c.avg_reach || 0;
  
  const name = c.name || c.full_name || "Creator";
  const initials = initialsOf(name, { fallback: "C" }); // v346: emoji-safe
  const photoUrl = c.photo || c.profile_photo_url || c.picture;
  
  const niche = c.category || c.content_niches || "";
  const primaryNiche = niche.split(',')[0].trim();
  // Session 43: in a place search the card says how far the creator is ("18 km from Faridabad").
  const city = c.__distanceKm != null && c.__distanceKm >= 3 && c.__nearCity
    ? `${Math.round(c.__distanceKm)} km from ${c.__nearCity}`
    : (c.city ? c.city.split(',')[0].trim() : "");
  
  const glow = pickCreatorGlow(c.user_id || c.id, primaryNiche || niche);

  return (
    <Link 
      to={`/creator/${c.user_id || c.id}`} 
      data-testid={`creator-card-${c.user_id || c.id}`}
      className="creator-card block"
      style={{ '--card-glow': glow }}
    >
      {photoUrl ? (
        <>
          {!imgLoaded && (
            <div className="absolute inset-0 bg-[var(--bg-elevated)] animate-pulse z-0 rounded-[20px]" />
          )}
          <img 
            className={`creator-bg ${imgLoaded ? "opacity-100" : "opacity-0"} transition-opacity duration-500`}
            src={photoUrl} 
            alt={name}
            loading="lazy" decoding="async" /* v429: only cards on screen download their photo */
            onLoad={() => setImgLoaded(true)}
            onError={(e) => {
              e.currentTarget.style.display = "none";
              e.currentTarget.nextElementSibling.style.display = "flex";
              setImgLoaded(true);
            }}
          />
        </>
      ) : null}
      {/* v415: no photo → a small monogram on a soft niche-tinted background (was 72px "U0" letters filling the card) */}
      <div
        className="creator-bg-fallback"
        data-testid="creator-card-monogram"
        style={{
          display: photoUrl ? 'none' : 'flex',
          alignItems: 'flex-start',
          paddingTop: '26%',
          fontSize: 'inherit',
          background: `radial-gradient(120% 80% at 50% 28%, ${softTint(glow, 0.28)} 0%, ${softTint(glow, 0.1)} 55%, var(--bg-elevated) 100%)`,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 68, height: 68, borderRadius: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.92)', color: '#334155',
            fontSize: 22, fontWeight: 700, letterSpacing: '0.02em',
            boxShadow: '0 6px 18px -8px rgba(15,23,42,0.35)',
          }}
        >
          {initials}
        </span>
      </div>

      <div className="creator-reach-block">
        {/* v332: no reach data showed a made-up looking "0 Average Reach" — show a dash instead */}
        <span className={`font-mono font-bold tracking-tight text-lg text-white drop-shadow-md leading-none`}>{Number(String(reach).replace(/,/g, "")) > 0 || /[a-zA-Z]/.test(String(reach)) ? formatNum(reach) : "—"}</span>
        <span className={`text-[10px] font-bold uppercase tracking-wider text-white/90 drop-shadow-md`}>Avg Reach</span>{/* v378: shorter, so it never touches "Followers" */}
      </div>

      <div className="creator-overlay">
        <div className="creator-overlay-top">
          <h3 className={`text-lg font-bold tracking-tight text-white drop-shadow-md truncate pr-14`}>{name}</h3>
          {c?.is_featured && <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-amber-400 text-amber-950 text-[10px] font-bold" data-testid="featured-badge">Featured</span>}
        </div>
        <div className="creator-overlay-bottom">
          <div className="creator-stats">
            <div className={`text-sm text-gray-500 text-white/90`}><strong className={`font-mono tracking-tight text-sm text-white mr-1`}>{formatNum(totalFollowers)}</strong> Followers</div>
            <div className="creator-location-row">
              {primaryNiche && (
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap bg-white/20 backdrop-blur-md text-white border border-white/10`}>{primaryNiche}</span>
              )}
              {city && (
                <div className={`text-[11px] font-medium flex gap-1 items-center text-white/90 drop-shadow-md min-w-0`}>
                  <MapPin size={11} className="shrink-0" />
                  <span className="truncate whitespace-nowrap">{city}</span>
                  {typeof c._distance === 'number' && (
                    <span className="opacity-75">
                      ({c._distance} km away)
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
