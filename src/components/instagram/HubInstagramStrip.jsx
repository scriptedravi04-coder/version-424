import React from "react";
import {  } from "lucide-react";
import { fmtK, fmtPct, liveNumbers } from "./igFormat";
import SocialLogo from "../common/SocialLogo"; // v364: real platform logos

// v363 (Ravi's design 1a "My Profile — Instagram is live on the hub"): the fetched numbers right under the creator's
// name on the profile hub, so the creator sees what brands see — "@handle • Live" and "10.4K followers · 19.4K avg
// views · 11.2% eng.". Only when Instagram is really synced (never made-up numbers). Plus the small state chips the
// hub rows carry ("IG LIVE", "Not set", "8 collabs", "Verified").

/** Is this profile's Instagram live (synced, same account, no error)? */
export function igLive(profile) {
  const st = profile?.instagram_stats;
  return Boolean(profile?.instagram_synced_at && st && !st.error);
}

export function HubIgHandle({ profile }) {
  if (!igLive(profile)) return null;
  const h = String(profile?.instagram_stats?.username || profile?.instagram_handle || "").replace(/^@/, "");
  if (!h) return null;
  return (
    <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mt-1 truncate" data-testid="hub-ig-handle">
      <SocialLogo platform="instagram" size={16} />
      <span className="truncate">@{h}</span>
      <span className="inline-flex items-center gap-1 text-emerald-600 font-bold shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Live</span>
    </p>
  );
}

export default function HubInstagramStrip({ profile }) {
  if (!igLive(profile)) return null;
  const n = liveNumbers(profile.instagram_stats);
  const item = (v, label, accent) => (
    <span className="flex items-baseline gap-1 min-w-0">
      <b className={`text-[17px] font-black tracking-[-0.02em] ${accent ? "text-[#7C3AED]" : "text-slate-900"}`}>{v}</b>
      <span className="text-[11px] text-slate-500 font-medium truncate">{label}</span>
    </span>
  );
  return (
    <div className="flex items-center justify-between gap-3 px-1" data-testid="hub-ig-strip">
      {item(fmtK(n.followers), "followers")}
      {item(fmtK(n.avgViews), "avg views")}
      {item(fmtPct(n.engagement, 1), "eng.", true)}
    </div>
  );
}

const TONES = {
  live: "bg-emerald-50 text-emerald-700",
  warn: "bg-rose-50 text-rose-600",
  info: "text-[#7C3AED]",
  ok: "text-emerald-600",
};
/** Small state chip on a hub row (right side, before the chevron). */
export function HubChip({ tone = "info", children }) {
  if (!children) return null;
  return <span className={`text-[11px] font-bold rounded-full ${tone === "live" || tone === "warn" ? "px-2 py-0.5 uppercase tracking-wide text-[10px]" : ""} ${TONES[tone] || TONES.info}`}>{children}</span>;
}
