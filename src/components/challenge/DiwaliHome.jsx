import React, { useEffect, useState } from "react";
import { useNow } from "./ChallengeUi";
import { useDesignFonts } from "./Festive";
import { getChallengePublic } from "../../lib/challengeApi";
import { datesFrom, challengeOn, sponsorsFrom, festiveOn } from "../../lib/diwaliChallenge";

// v372 (Ravi: "design mein dashboard Diwali theme mein hai, app mein kyu nahi lagi" + "brand panel ke liye bhi"):
// Ravi's design 2b (Creator Home) / 2n (Brand Home) — the header becomes a saffron → magenta festive stage with light
// rays, sparkles and string lights, a big "Diwali Dhamaka" title, the Admin banner in a yellow frame, quick actions as cream
// tiles, and an arch with three diyas into a warm cream page. Only till Diwali night (festiveOn); after that the
// normal Ybex header comes back by itself. Everything below the arch stays the normal Home.
//
// Brand side: the design said "Zero commission · every collab", but brands pay the 8% fee till Diwali (v364), so the
// brand screens say what is true. If Admin → Fees sets the brand fee to 0, change BRAND_LINE.

export const diwaliOn = (now = Date.now()) => festiveOn(now);

export const DW = {
  top: "#FF7A1A",
  headerBg: "linear-gradient(180deg, #FF7A1A 0%, #F2452A 52%, #E0294F 100%)",
  tilesBg: "linear-gradient(180deg, #E0294F 0%, #CC1A5E 100%)",
  archBg: "linear-gradient(180deg, #CC1A5E 0%, #B8146A 100%)",
  cream: "#FFF6E8",
  yellow: "#FFE14D",
  deep: "#8E0E12",
  ink: "#5A1A0A",
};
export const BRAND_LINE = "FESTIVE COLLABS · VERIFIED CREATORS";
export const CREATOR_LINE = "ZERO COMMISSION · KEEP 100%"; // true till Diwali: creators pay 0% (v364)

/** Rye (the design's display font) — loaded only while the Diwali skin shows. */
const useRye = useDesignFonts; // v372: same font link as the other Diwali screens
const RYE = "'Rye', Georgia, serif";

/** Quick-action tiles → cream festive tiles (the tiles keep their own buttons, links and badges). */
export const DIWALI_TILES_CSS = `
.ybx-dw-qb{margin:0!important;border-radius:0!important;border:0!important;box-shadow:none!important;background:${DW.tilesBg}!important;padding:14px 12px 4px!important;gap:8px!important;z-index:1!important}
.ybx-dw-qb>button{background:linear-gradient(180deg,#FFF7E8,#FFE9C9)!important;border:1.5px solid #FFD48A!important;border-radius:20px!important;box-shadow:0 6px 0 rgba(140,30,20,.25)!important;padding:10px 2px 9px!important;min-width:0}
.ybx-dw-qb>button>div:first-child{background:#fff!important;width:40px!important;height:40px!important;border-radius:14px!important;box-shadow:0 3px 8px rgba(194,65,12,.15)}
.ybx-dw-qb>button>span{color:${DW.ink}!important;font-weight:700!important;max-width:100%;overflow:hidden;text-overflow:ellipsis}
`;

/** Light rays + sparkles + string lights behind the header content. */
export function DiwaliHeaderDecor() {
  const dots = [[40, 70], [110, 120], [200, 64], [300, 110], [360, 80], [70, 200], [330, 190], [160, 170], [250, 150], [20, 140], [380, 150]];
  return (
    <div aria-hidden="true" className="pointer-events-none">
      <div style={{ position: "absolute", left: "50%", top: -140, width: 520, height: 420, marginLeft: -260, pointerEvents: "none",
        background: "conic-gradient(from 160deg at 50% 0%, rgba(255,240,190,0) 0deg, rgba(255,240,190,.28) 8deg, rgba(255,240,190,0) 16deg, rgba(255,240,190,0) 30deg, rgba(255,240,190,.22) 38deg, rgba(255,240,190,0) 46deg)" }} />
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {dots.map(([x, y], i) => (
          <span key={i} style={{ position: "absolute", left: `${(x / 400) * 100}%`, top: y, width: 3, height: 3, borderRadius: 2, background: "#FFF3C4", boxShadow: "0 0 6px 2px rgba(255,230,150,.8)" }} />
        ))}
      </div>
      {/* v377 (Ravi): the string of lights on the Home header looked squeezed under the clock, removed */}
    </div>
  );
}

/** "Diwali Dhamaka" + the line under it. */
export function DhamakaTitle({ line = CREATOR_LINE }) {
  useRye();
  return (
    <div style={{ position: "relative", padding: "16px 16px 0", textAlign: "center" }} data-testid="diwali-dhamaka">
      <div style={{ font: `400 38px/1 ${RYE}`, color: DW.yellow, textShadow: `0 3px 0 ${DW.deep}, 0 6px 14px rgba(80,0,20,.35)`, whiteSpace: "nowrap" }}>Diwali Dhamaka</div>
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <span style={{ height: 1.5, width: 28, background: "rgba(255,225,77,.7)" }} />
        <span style={{ font: "800 10px 'DM Sans', sans-serif", letterSpacing: "1.8px", color: "#fff", whiteSpace: "nowrap" }}>{line}</span>
        <span style={{ height: 1.5, width: 28, background: "rgba(255,225,77,.7)" }} />
      </div>
    </div>
  );
}

/** Creator: "Powered by" under the Admin banner — same sponsor list as /challenge (Admin → Challenge entries →
 *  Sponsors & prizes): logo in white, or the name when there's no logo. Nothing when the challenge isn't running.
 *  v372 (Ravi: "banner wale section mein hardcoded mat daalna, banner admin se control hote hai"): the banner slot
 *  keeps the Admin → Banners carousel; this file adds nothing there. */
export function DiwaliPoweredBy() {
  const now = useNow(60_000);
  const [pub, setPub] = useState(undefined);
  useEffect(() => {
    let alive = true;
    getChallengePublic().then((d) => { if (alive) setPub(d || null); }).catch(() => { if (alive) setPub(null); });
    return () => { alive = false; };
  }, []);
  if (!pub || !challengeOn(now, datesFrom(pub))) return null;
  const sponsors = sponsorsFrom(pub?.config);
  if (!sponsors.length) return null;
  return (
    <div data-testid="diwali-powered-by" style={{ position: "relative", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "0 14px", flexWrap: "wrap" }}>
      <span style={{ font: "800 8.5px 'DM Sans', sans-serif", letterSpacing: "1.4px", color: "rgba(255,255,255,.85)" }}>POWERED BY</span>
      {sponsors.slice(0, 4).map((s) => (s.logo
        ? <img key={s.name} src={s.logo} alt={s.name} title={s.name} style={{ height: 18, maxWidth: 80, objectFit: "contain", filter: "brightness(0) invert(1)" }} />
        : <span key={s.name} style={{ font: "800 11px 'DM Sans', sans-serif", color: "#fff" }}>{s.name}</span>))}
    </div>
  );
}

/** The Admin banner gets a yellow festive frame on the Diwali header (the image itself comes from Admin → Banners). */
export const DW_BANNER_FRAME = { border: `2px solid ${DW.yellow}`, boxShadow: "0 10px 24px rgba(80,0,20,.35)" };

function Diya({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: "block", overflow: "visible" }} aria-hidden="true">
      <defs><linearGradient id={`ybxdiya${size}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFF6C2" /><stop offset=".45" stopColor="#FFB000" /><stop offset="1" stopColor="#FF5A00" /></linearGradient></defs>
      <circle cx="32" cy="19" r="20" fill="#FFB347" opacity=".22" /><circle cx="32" cy="20" r="11" fill="#FFD37A" opacity=".35" />
      <path d="M32 3C39.5 13 41.5 21 32 30.5 22.5 21 24.5 13 32 3Z" fill={`url(#ybxdiya${size})`} />
      <path d="M32 14c3 4.5 3.3 8.5 0 12.5-3.3-4-3-8 0-12.5Z" fill="#FFF8DC" />
      <path d="M6 34h52c-2 15-12 24-26 24S8 49 6 34Z" fill="#D9480F" />
      <path d="M8.6 41h46.8c-.6 2-1.4 3.6-2.3 5H10.9c-.9-1.4-1.7-3-2.3-5Z" fill="#F5B83D" />
      <circle cx="22" cy="51" r="2" fill="#FFE27A" /><circle cx="32" cy="52.5" r="2" fill="#FFE27A" /><circle cx="42" cy="51" r="2" fill="#FFE27A" />
      <ellipse cx="32" cy="34" rx="26" ry="4.6" fill="#FFD37A" /><ellipse cx="32" cy="34" rx="19" ry="2.4" fill="#7A2E0B" />
      <path d="M32 34v-4" stroke="#3B1A08" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** The arch with three diyas that ends the festive header in the cream page. */
export function DiyaArch() {
  return (
    <div aria-hidden="true" style={{ position: "relative", height: 58, flexShrink: 0, background: DW.archBg }}>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 41, background: DW.cream, borderRadius: "50% 50% 0 0 / 100% 100% 0 0" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 6, display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 34 }}>
        <Diya size={40} /><Diya size={52} /><Diya size={40} />
      </div>
    </div>
  );
}
