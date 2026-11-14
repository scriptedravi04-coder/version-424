import React, { useState } from "react";
import { Check, Play, Heart, Eye, Sparkles } from "lucide-react";

// v354 (Ravi: "portfolio mein username se hi reels dikha do, wo select kar le — sirf brand promotions wali").
// Grid of the creator's last Instagram posts (from Meta's API via the username). Posts whose caption looks like a
// paid / gifted promotion (#ad, #collab, "paid partnership", "use code"…) are marked "Collab" and shown first.
// Thumbnails are Instagram's own short-lived links — fine here (picked right away); we save only the post link.

const k = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}K`;
  return String(v);
};

export function sortForPicker(media) {
  return [...(Array.isArray(media) ? media : [])].filter((m) => m?.permalink)
    .sort((a, b) => Number(Boolean(b.collab)) - Number(Boolean(a.collab)));
}

/** Picked posts → portfolio items in the shape the profile's portfolio uses. */
export function reelsToPortfolio(picked) {
  return (picked || []).map((m) => ({
    id: `ig_${m.id || Date.now()}`,
    title: m.brand ? `@${m.brand} collab` : "Instagram collab",
    brand_name: m.brand ? `@${m.brand}` : "",
    platform: "instagram",
    content_url: m.permalink,
    description: String(m.caption || "").split("\n")[0].slice(0, 140),
    views: m.views || null,
    // v363: same keys the new portfolio screens read (cover is filled once it's copied to our storage)
    source: "ig",
    likes: m.likes || null,
    date: m.at || "",
    cover: m.cover || "",
  }));
}

// v363 (Ravi's design 1d): the "Select" grid of the new Add collabs screen — 2 across, the caption on a frosted
// plate over the cover, brand + date under it, unticked reels fade back. The old 3-across grid stays the default
// for onboarding.
const shortDate = (iso) => { const t = Date.parse(String(iso || "")); return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : ""; };
function GlassTile({ m, on, anyOn, onToggle }) {
  const [broken, setBroken] = useState(false);
  const stat = k(m.views) ? { icon: Play, v: k(m.views), fill: true } : k(m.likes) ? { icon: Heart, v: k(m.likes) } : null;
  const brand = m.brand ? m.brand.replace(/^@/, "") : "";
  const label = m.collab ? `Paid · @${brand || "brand"}` : brand ? `@${brand}` : m.kind === "reel" ? "Reel" : "Post";
  return (
    <div className={`transition-opacity duration-200 ${anyOn && !on ? "opacity-55" : ""}`}>
      <button type="button" onClick={onToggle} aria-pressed={on} aria-label={on ? "Unselect" : "Select"}
        className={`relative w-full aspect-[4/5] rounded-[18px] overflow-hidden text-left ring-2 transition ${on ? "ring-[#7C3AED]" : "ring-transparent"}`}
        style={{ background: "linear-gradient(160deg,#2A2338,#0A0A0A)" }}>
        {m.thumb && !broken ? (
          <img src={m.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 p-3 pt-9 text-[11px] leading-snug text-white/70 font-medium overflow-hidden">{m.caption || "Instagram post"}</div>
        )}
        <span className="absolute top-2 left-2 w-6 h-6 rounded-md bg-black/25 backdrop-blur flex items-center justify-center"><Play size={11} className="text-white" fill="white" /></span>
        <span className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center border-2 ${on ? "bg-[#7C3AED] border-white" : "bg-black/20 border-white/90"}`}>
          {on && <Check size={14} className="text-white" strokeWidth={3} />}
        </span>
        <div className="absolute left-2 right-2 bottom-2 h-8 px-2.5 rounded-full bg-black/35 backdrop-blur-md border border-white/30 flex items-center justify-between gap-1 text-white">
          <span className="text-[10.5px] font-bold truncate">{label}</span>
          {stat && <span className="flex items-center gap-0.5 text-[10.5px] font-bold shrink-0"><stat.icon size={9} fill={stat.fill ? "white" : "none"} /> {stat.v}</span>}
        </div>
      </button>
      <div className="mt-1.5 px-0.5 flex items-baseline gap-1.5 min-w-0">
        <span className="text-[13px] font-bold text-slate-900 truncate">{brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : (m.kind === "reel" ? "Reel" : "Post")}</span>
        <span className="text-[11px] text-slate-500 font-medium shrink-0">{shortDate(m.at)}</span>
      </div>
    </div>
  );
}

function Tile({ m, on, onToggle }) {
  const [broken, setBroken] = useState(false);
  const stat = k(m.views) ? { icon: Eye, v: k(m.views) } : k(m.likes) ? { icon: Heart, v: k(m.likes) } : null;
  return (
    <button type="button" onClick={onToggle} aria-pressed={on}
      className={`relative w-full aspect-[9/16] rounded-xl overflow-hidden text-left border-2 transition ${on ? "border-[#7C3AED]" : "border-transparent"}`}
      style={{ background: "linear-gradient(160deg,#F5F0FF,#E9E2FB)" }}>
      {m.thumb && !broken ? (
        <img src={m.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 p-2 pt-7 text-[10px] leading-snug text-slate-600 font-medium overflow-hidden">{m.caption || "Instagram post"}</div>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/60" />
      {m.collab ? (
        <span className="absolute top-2 left-1.5 whitespace-nowrap px-1.5 py-0.5 rounded-md bg-amber-300 text-[11px] font-black text-amber-950 uppercase">Collab</span>
      ) : m.kind === "reel" ? <Play size={14} className="absolute top-2 left-2 text-white drop-shadow" fill="white" /> : null}
      <span className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center border-2 ${on ? "bg-[#7C3AED] border-[#7C3AED]" : "bg-black/30 border-white"}`}>
        {on && <Check size={13} className="text-white" strokeWidth={3} />}
      </span>
      <div className="absolute left-2 right-2 bottom-1.5 flex items-center justify-between text-white text-[10px] font-bold">
        <span className="truncate">{m.brand ? `@${m.brand}` : ""}</span>
        {stat && <span className="flex items-center gap-0.5 shrink-0"><stat.icon size={10} /> {stat.v}</span>}
      </div>
    </button>
  );
}

export default function InstagramReelPicker({ media, selectedIds, onChange, loading = false, max = 6, variant = "default" }) {
  const list = sortForPicker(media);
  const sel = new Set(selectedIds || []);
  const toggle = (id) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else { if (next.size >= max) return; next.add(id); }
    onChange?.([...next]);
  };
  if (variant === "glass") {
    if (loading) return <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="aspect-[4/5] rounded-[18px] bg-white/70 animate-pulse" />)}</div>;
    if (!list.length) return <div className="rounded-2xl border border-dashed border-[#C4B5FD] bg-white/50 p-5 text-center text-[13px] text-slate-500">No new posts found on your Instagram. Paste a link or upload instead.</div>;
    return (
      <div data-testid="ig-reel-picker" className="grid grid-cols-2 gap-x-3 gap-y-4">
        {list.map((m) => <GlassTile key={m.id || m.permalink} m={m} on={sel.has(m.id || m.permalink)} anyOn={sel.size > 0} onToggle={() => toggle(m.id || m.permalink)} />)}
      </div>
    );
  }
  if (loading) {
    return <div className="grid grid-cols-3 gap-2">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="aspect-[9/16] rounded-xl bg-slate-100 animate-pulse" />)}</div>;
  }
  if (!list.length) {
    return <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-[13px] text-slate-500">We couldn't find posts on this Instagram yet. Use "Upload manually" instead.</div>;
  }
  return (
    <div data-testid="ig-reel-picker">
      <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 mb-3 text-[12px] leading-snug text-amber-900 font-semibold">
        <Sparkles size={14} className="shrink-0 mt-0.5" />
        <span>Pick only brand collabs — paid or gifted promotions. Skip dance, trend and personal posts. (Up to {max}.)</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {list.map((m) => <Tile key={m.id || m.permalink} m={m} on={sel.has(m.id || m.permalink)} onToggle={() => toggle(m.id || m.permalink)} />)}
      </div>
      <div className="mt-2 text-[12px] text-slate-500 font-medium">{sel.size ? `${sel.size} selected` : "Tap the posts that were brand promotions."}</div>
    </div>
  );
}
