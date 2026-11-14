import React from "react";
import { festiveOn } from "../../lib/diwaliChallenge"; // v372

// v356 (Ravi's "Settings & Home" design): the city footer at the end of the creator and brand home.
// Creator home talks about brands ("From the corner shop…"), brand home about creators ("Every kind of creator…").
// Phone = the design 1:1 (300px tall, text top-left, city on the right, road touching the bottom nav).
// Desktop = same art, bigger text, road running the full width of the page.
// v363 (Ravi: "colourful footer achha nahi lag raha — Hopr jaisa light grey, illustration chhota, aur line sahi karo"):
// same city art, but light grey and faded like Hopr's footer, about a third smaller; the headline is grey too, and
// each side gets a line that speaks to it (creators hear about brands, brands about creators) + two small lines
// under it ("Made for…" / "Crafted in India"). The Eva bot floating on top keeps its colour (it's a button).
export const CITY_FOOTERS = {
  creator: {
    img: "/img/footer/city-brands.svg",
    lead: "From local shops to big brands — ",
    accent: "your next collab is here.",
    sub: "",
    madeFor: "Made for Indian creators",
  },
  brand: {
    img: "/img/footer/city-creators.svg",
    lead: "From corner shops to big companies — ",
    accent: "find the right creators for you.",
    sub: "",
    madeFor: "Made for Indian brands",
  },
};

const ROAD = "#E6DDF4"; // same as the art's road; greyed by the same filter below so there is no seam
// v372 (Ravi: "isko bhi theme ke saath sync karo"): till Diwali night the footer is warm like the festive Home —
// cream-to-peach ground, the city in soft saffron, warm text and a diya line. After Diwali the grey Hopr look returns.
// v415: recomputed on every render, so an app left open across the festival end switches back without a reload
let FESTIVE, ART_FILTER, ART_OPACITY, INK, GROUND;
function refreshFestive() {
  FESTIVE = festiveOn(Date.now());
  ART_FILTER = FESTIVE ? "sepia(1) saturate(2.2) hue-rotate(-14deg) contrast(0.62) brightness(1.08)" : "grayscale(1) contrast(0.55) brightness(1.18)";
  ART_OPACITY = FESTIVE ? 0.42 : 0.5;
  INK = FESTIVE ? { lead: "#E2A982", accent: "#C9733F", sub: "#C99577" } : { lead: "#B8BEC8", accent: "#9AA1AD", sub: "#A3A9B4" };
  GROUND = FESTIVE ? { background: "linear-gradient(180deg, #FFF6E8 0%, #FFE9D2 100%)" } : null;
}
refreshFestive();

function Road({ h }) {
  const u = h / 600;
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: 0, right: h * 1.3 - 1 /* v363: stops where the art's own road starts (faded layers would double up) */, bottom: 0, height: 44 * u, background: ROAD, filter: ART_FILTER, opacity: ART_OPACITY }}>
      <div
        style={{
          position: "absolute", left: 0, right: 0, top: 20 * u, height: Math.max(2, 4 * u),
          backgroundImage: `repeating-linear-gradient(to right, #fff 0 ${26 * u}px, transparent ${26 * u}px ${56 * u}px)`,
          backgroundSize: `${56 * u}px 100%`,
          backgroundPosition: `right ${-18 * u}px top 0`,
          borderRadius: 2,
        }}
      />
    </div>
  );
}

function Headline({ v, size, sub }) {
  // size can be a number (px) or a CSS length like clamp(…)
  const fs = typeof size === "number" ? `${size}px` : size;
  return (
    <>
      <div
        style={{
          font: `800 ${fs}/1.12 'DM Sans', sans-serif`, letterSpacing: "-0.03em",
          color: INK.lead, textWrap: "balance",
        }}
      >
        {v.lead}<span style={{ color: INK.accent }}>{v.accent}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4, font: `600 ${sub}px/1.5 'DM Sans', sans-serif`, color: INK.sub }}>
        <span>🇮🇳 {v.madeFor}</span>
        <span>{FESTIVE ? "🪔 Happy Diwali from Ybex" : "💜 Crafted in India"}</span>
      </div>
    </>
  );
}

export default function HomeCityFooter({ variant = "creator" }) {
  refreshFestive();
  const v = CITY_FOOTERS[variant] || CITY_FOOTERS.creator;
  return (
    <footer data-testid="home-city-footer" data-variant={variant} className="w-full select-none">
      {/* Phone */}
      <div
        className="md:hidden relative overflow-hidden -mb-5"
        style={GROUND ? { height: 224, paddingTop: 24, ...GROUND } : { height: 200, marginTop: 24 }}
      >
        <Road h={200} />
        <img
          src={v.img} alt="" aria-hidden="true" loading="lazy" decoding="async" draggable="false"
          style={{ position: "absolute", right: 0, bottom: 0, width: 260, height: 200, maxWidth: "none", filter: ART_FILTER, opacity: ART_OPACITY }}
        />
        <div style={{ position: "relative", padding: "6px 20px 0", maxWidth: 210, display: "flex", flexDirection: "column", gap: 6 }}>
          <Headline v={v} size={19} sub={11.5} />
        </div>
      </div>

      {/* Desktop */}
      <div
        className="hidden md:block relative overflow-hidden md:-mx-6 lg:-mx-8 md:-mb-8 mt-12"
        style={{ height: 260, ...(GROUND || {}) }}
      >
        <Road h={260} />
        <img
          src={v.img} alt="" aria-hidden="true" loading="lazy" decoding="async" draggable="false"
          style={{ position: "absolute", right: 0, bottom: 0, width: 338, height: 260, maxWidth: "none", filter: ART_FILTER, opacity: ART_OPACITY }}
        />
        <div
          className="relative px-10 lg:px-14"
          style={{ paddingTop: 40, maxWidth: "max(320px, min(560px, calc(100% - 360px)))", display: "flex", flexDirection: "column", gap: 10 }}
        >
          <Headline v={v} size="clamp(24px, 2.4vw, 34px)" sub={14} />
        </div>
      </div>
    </footer>
  );
}
