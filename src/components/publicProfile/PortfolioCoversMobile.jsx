import React, { useState } from "react";
import { Play, Eye, Heart } from "lucide-react";
import { shortCount } from "./PhotoLedHeaderMobile";
import SocialLogo from "../common/SocialLogo"; // v364: real platform logos
import { EntryRibbon } from "../challenge/ChallengeUi"; // v367
import { ENTRIES_CLOSE_AT } from "../../lib/diwaliChallenge";

// v415: the Diwali "Entry" ribbon only while the challenge is open — after that a brand viewing the profile
// shouldn't see festive badges on old work. Pure.
export function showChallengeRibbon(now = Date.now()) {
  return now <= ENTRIES_CLOSE_AT;
}

// v363 (Ravi: "portfolio ke pages mein preview nahi dikh raha"): on the phone public profile, portfolio items that
// carry a saved cover (portfolio item JSON {cover, brand_name, views, likes, source}) show as a cover grid, grouped
// under a brand pill. Items without a cover are left to the old link cards (the caller renders them).

/** Items with a cover, grouped by brand (no brand → "Other work"), biggest group first. Pure. */
export function groupCoversByBrand(items = []) {
  const groups = new Map();
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it !== "object" || !it.cover) continue;
    const brand = String(it.brand_name || it.brand || "").replace(/^@/, "").trim();
    const key = brand.toLowerCase() || "__other";
    if (!groups.has(key)) groups.set(key, { brand: brand || "Other work", items: [] });
    groups.get(key).items.push(it);
  }
  return [...groups.values()].sort((a, b) => (a.brand === "Other work") - (b.brand === "Other work") || b.items.length - a.items.length);
}

function Cover({ it, theme }) {
  const [broken, setBroken] = useState(false);
  const url = it.content_url || it.url || it.link || "";
  const stat = Number(it.views) > 0 ? { Icon: Eye, v: shortCount(it.views) } : Number(it.likes) > 0 ? { Icon: Heart, v: shortCount(it.likes) } : null;
  const Tag = url ? "a" : "div";
  return (
    <Tag {...(url ? { href: url, target: "_blank", rel: "noopener noreferrer" } : {})}
      className="relative block aspect-[3/4] rounded-2xl overflow-hidden"
      style={{ background: theme.mode === "dark" ? "rgba(255,255,255,.06)" : "#EDE9FE" }}>
      {!broken && <img src={it.cover} alt={it.title || it.brand_name || "Portfolio"} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="absolute inset-0 w-full h-full object-cover" />}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/55" />
      {/* v364: the platform's real logo on the cover (play icon for uploads / other links) */}
      {(it.platform === "instagram" || it.platform === "youtube" || /instagram\.com|youtu/i.test(url))
        ? <span className="absolute top-2 left-2 drop-shadow"><SocialLogo platform={it.platform === "youtube" || /youtu/i.test(url) ? "youtube" : "instagram"} size={16} /></span>
        : <Play size={13} className="absolute top-2 left-2 text-white drop-shadow" fill="white" />}
      {showChallengeRibbon() && <EntryRibbon item={it} className="absolute top-1.5 right-1.5" />}{/* v367 · v415: date-gated */}
      {stat && (
        <span className="absolute bottom-1.5 right-2 inline-flex items-center gap-0.5 text-[10.5px] font-bold text-white">
          <stat.Icon size={10} /> {stat.v}{it.views && it.source === "upload" ? "*" : ""}
        </span>
      )}
    </Tag>
  );
}

export default function PortfolioCoversMobile({ items, theme }) {
  const groups = groupCoversByBrand(items);
  if (!groups.length) return null;
  const selfReported = (items || []).some((it) => it?.cover && it?.source === "upload" && Number(it?.views) > 0);
  return (
    <div className="space-y-5" data-testid="public-portfolio-covers">
      {groups.map((g) => (
        <div key={g.brand}>
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 h-7 pl-1 pr-3 rounded-full text-[12px] font-bold backdrop-blur-md"
              style={{ background: theme.glass, border: `1px solid ${theme.glassBorder}`, color: theme.text }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black" style={{ background: theme.mode === "dark" ? "#fff" : "#0A0A0A", color: theme.mode === "dark" ? "#0A0A0A" : "#fff" }}>{g.brand.charAt(0).toUpperCase()}</span>
              {g.brand}
            </span>
            <span className="text-[11px] font-semibold" style={{ color: theme.sub }}>{g.items.length} {g.items.length === 1 ? "piece" : "pieces"}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {g.items.map((it, i) => <Cover key={`${it.id || it.content_url || i}-${i}`} it={it} theme={theme} />)}
          </div>
        </div>
      ))}
      {selfReported && <p className="text-[10.5px] font-medium" style={{ color: theme.sub }}>* views on uploaded videos are self-reported</p>}
    </div>
  );
}
