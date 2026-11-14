import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, Play, Star, BadgeCheck, Clock, Package, ChevronRight } from "lucide-react";
import { loadCreator, summarizeCreator } from "./CreatorClaimStats";
import { initials as sharedInitials } from "../../utils/initials";
import SocialLogo from "../common/SocialLogo"; // v364: real platform logos

// Session 24 (design: "Claimed creator card"). Brand side: who claimed the brief.
// variant: "compact" (desktop claims modal) · "mobile" (claims sheet) · "expanded" (order page).
// Real data only: new creator → "New on Ybex" chip (never 0★ / 0%); no portfolio → strip removed;
// partial data → only the stats that exist.

const PALETTE = ["#7C3AED", "#0E9F77", "#D97706", "#2563EB", "#DB2777", "#0891B2"];
const colorFor = (id) => PALETTE[Math.abs(String(id || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % PALETTE.length];
const initialsOf = (name) => sharedInitials(name, { fallback: "C" }); // v346: emoji-safe

export function statusTone(status) {
  const s = String(status || "").toLowerCase();
  if (/paid|complete|approved/.test(s)) return { bg: "#ECFDF3", fg: "#047857" };
  if (/deliver|submit|review/.test(s)) return { bg: "#EFF6FF", fg: "#1D4ED8" };
  if (/revision|change|declin|disput/.test(s)) return { bg: "#FFF7ED", fg: "#C2410C" };
  if (/cancel|expired/.test(s)) return { bg: "#F3F4F6", fg: "#6B7280" };
  return { bg: "#F3EEFF", fg: "#6D28D9" };
}

function Stat({ icon: Icon, main, sub }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-8 h-8 rounded-xl bg-[#F5F3FF] text-[#7C3AED] flex items-center justify-center shrink-0"><Icon size={15} /></span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[13.5px] font-bold text-[#14121A] truncate">{main}</span>
        {sub && <span className="block text-[11.5px] text-[#6B6880] truncate">{sub}</span>}
      </span>
    </div>
  );
}

export default function CreatorCard({ creatorId, name: fallbackName, avatar: fallbackAvatar, status, variant = "compact", chatTo, onChat, onManage, manageLabel = "Manage order", onNavigate }) {
  const [data, setData] = useState(null);
  const [avatarBroken, setAvatarBroken] = useState(false); // v330: broken photo → initials
  useEffect(() => {
    if (!creatorId) return undefined;
    let alive = true;
    loadCreator(String(creatorId)).then((d) => { if (alive) setData(d); }).catch(() => { if (alive) setData({}); });
    return () => { alive = false; };
  }, [creatorId]);

  const v = summarizeCreator(data?.stats, data?.profile);
  const name = v.name || fallbackName || "Creator";
  const avatar = v.avatar || fallbackAvatar;
  useEffect(() => { setAvatarBroken(false); }, [avatar]); // v330: a new photo URL gets a fresh try
  const tone = statusTone(status);
  // v332: callers sometimes pass the raw code ("IN_PROGRESS") — show it as words.
  const statusLabel = status && /^[A-Z0-9_]+$/.test(String(status)) ? String(status).replace(/_/g, " ").toLowerCase().replace(/^./, (m) => m.toUpperCase()) : status;
  const expanded = variant === "expanded";
  const mobile = variant === "mobile";
  const loading = creatorId && !data;

  const stats = [
    v.ratingValue !== null && v.ratingValue !== undefined && { icon: Star, main: `${v.ratingValue} ★`, sub: v.reviewsText },
    v.orders && { icon: Package, main: v.orders, sub: "completed" },
    v.onTime && { icon: Clock, main: v.onTime, sub: "first drafts" },
  ].filter(Boolean);

  const chatBtn = (chatTo || onChat) && (
    chatTo ? (
      <Link to={chatTo} onClick={onNavigate} aria-label="Chat with creator" className="w-11 h-11 rounded-full bg-white border border-[#ECEAF2] flex items-center justify-center text-[#14121A] hover:bg-[#F7F7FA] shrink-0">
        <MessageCircle size={18} />
      </Link>
    ) : (
      <button type="button" onClick={onChat} aria-label="Chat with creator" className="w-11 h-11 rounded-full bg-white border border-[#ECEAF2] flex items-center justify-center text-[#14121A] hover:bg-[#F7F7FA] shrink-0 cursor-pointer">
        <MessageCircle size={18} />
      </button>
    )
  );
  const manageBtn = onManage && (
    <button type="button" onClick={onManage} className={`h-11 px-5 rounded-full bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold text-[14px] whitespace-nowrap cursor-pointer ${mobile ? "flex-1" : ""}`}>
      {manageLabel}
    </button>
  );

  return (
    <div
      className={`bg-white border border-[#ECEAF2] ${expanded ? "rounded-[24px] p-6" : "rounded-[20px] p-4"} shadow-[0_1px_2px_rgba(20,18,26,.04)] font-['DM_Sans',sans-serif] text-[#14121A]`}
      data-testid="creator-card"
      data-variant={variant}
    >
      <div className="flex items-start gap-3.5">
        <div
          className={`${expanded ? "w-16 h-16 text-[20px]" : "w-12 h-12 text-[16px]"} rounded-full shrink-0 overflow-hidden flex items-center justify-center font-bold text-white`}
          style={{ background: avatar && !avatarBroken ? "#EEE" : colorFor(creatorId) }}
        >
          {avatar && !avatarBroken ? <img src={avatar} alt="" onError={() => setAvatarBroken(true)} className="w-full h-full object-cover" /> : initialsOf(name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`${expanded ? "text-[20px]" : "text-[16px]"} font-bold truncate`}>{name}</span>
            {v.kyc && (
              <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[#ECFDF3] text-[#047857] text-[11.5px] font-semibold">
                <BadgeCheck size={13} /> KYC verified
              </span>
            )}
          </div>
          {v.niches.length > 0 && <div className="mt-0.5 text-[13px] text-[#6B6880] truncate">{/* v415: darker grey (#8A8798 was under 4.5:1) */}{v.niches.join(" · ")}</div>}
          {status && (
            <span className="mt-2 inline-flex items-center h-6 px-2.5 rounded-full text-[11.5px] font-semibold" style={{ background: tone.bg, color: tone.fg }}>
              {statusLabel}
            </span>
          )}
        </div>
        {!mobile && !expanded && (
          <div className="flex items-center gap-2 shrink-0">{chatBtn}{manageBtn}</div>
        )}
      </div>

      {loading ? (
        <div className="mt-4 h-9 rounded-xl bg-[#F3F2F8] animate-pulse" aria-hidden="true" />
      ) : (
        <>
          <div className={`mt-4 ${stats.length ? `grid gap-3 ${mobile ? "grid-cols-2" : "grid-cols-3"}` : ""}`}>
            {v.isNew ? (
              <span className="inline-flex items-center h-8 px-3 rounded-full bg-[#F7F6FA] border border-[#ECEAF2] text-[12.5px] font-semibold text-[#6B6880]">
                New on Ybex
              </span>
            ) : (
              stats.map((st) => <Stat key={st.main} {...st} />)
            )}
          </div>

          {v.platformList.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {v.platformList.map((p) => (
                <span key={p.kind} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[#F7F6FA] text-[12.5px] font-semibold text-[#3F3D4A]">
                  <SocialLogo platform={p.kind === "instagram" ? "instagram" : "youtube"} size={13} />
                  {p.count}
                </span>
              ))}
            </div>
          )}

          {v.tiles.length > 0 && (
            <div className="mt-3 flex items-center gap-2">
              {v.tiles.map((t) => (
                <div key={t.url} className={`${expanded ? "w-24 h-32" : "w-14 h-[72px]"} rounded-xl overflow-hidden border border-[#ECEAF2] bg-gradient-to-br from-[#EDE9FE] to-[#C4B5FD] relative shrink-0`}>
                  {t.isVideo ? (
                    <span className="absolute inset-0 flex items-center justify-center"><span className="w-7 h-7 rounded-full bg-white/90 flex items-center justify-center"><Play size={13} className="text-[#7C3AED] ml-0.5" /></span></span>
                  ) : (
                    <img src={t.url} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; } /* v332: dead link → plain tile */} className="w-full h-full object-cover" />
                  )}
                </div>
              ))}
              {v.tilesTotal > v.tiles.length && (
                <span className="text-[12.5px] font-semibold text-[#6B6880]">+{v.tilesTotal - v.tiles.length}</span>
              )}
            </div>
          )}
        </>
      )}

      <div className={`mt-4 flex items-center ${mobile || expanded ? "gap-2" : "justify-between"}`}>
        {creatorId ? (
        <Link to={`/creator/${creatorId}`} onClick={onNavigate} className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#7C3AED] hover:text-[#6D28D9]">
          View full profile <ChevronRight size={14} />
        </Link>
        ) : null /* v415: no "/creator/undefined" link when the id is missing */}
        {(mobile || expanded) && (
          <div className="ml-auto flex items-center gap-2">{chatBtn}{manageBtn}</div>
        )}
      </div>
    </div>
  );
}
