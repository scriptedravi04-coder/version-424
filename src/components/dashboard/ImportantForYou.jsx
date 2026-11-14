import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Session 33 — Ravi's "Important for you" (Dashboard — new layout): ONE card that rotates every
// task (deadlines, direct campaign invites, KYC, profile). Auto-scrolls every `intervalMs`, pauses on
// hover / touch / while a popup is open, arrows + dots. `variant="mobile"` = full width, swipe.
// Tasks come from src/lib/creatorTasks.js (real data only).

function TaskSlide({ t, onAction, compact }) {
  const th = t.theme || {};
  // v330: a dead brand-logo link shows the coloured initial tile instead of a broken image.
  const [logoBroken, setLogoBroken] = useState(false);
  return (
    <div className="h-full flex-[0_0_100%] box-border rounded-[18px] p-[13px] flex flex-col gap-[9px]" style={{ border: `1.5px solid ${th.border}`, background: th.bg }} data-testid={`task-${t.id}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        {t.logo && !logoBroken ? (
          <img src={t.logo} alt="" onError={() => setLogoBroken(true)} className="w-[34px] h-[34px] rounded-[11px] object-cover shrink-0" />
        ) : (
          <div className="w-[34px] h-[34px] rounded-[11px] flex items-center justify-center text-white font-bold shrink-0" style={{ background: th.iconBg, fontSize: String(t.initial).length > 2 ? 10.5 : 13 }}>{t.initial}</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-extrabold tracking-[.9px] truncate" style={{ color: th.kColor }}>{t.kicker}</div>
          <div className="text-[12.5px] font-medium text-[#6B7280] truncate">{t.brand}</div>
        </div>
      </div>
      <div className="shrink-0 text-[15px] leading-[1.3] font-bold tracking-[-.3px] text-[#0A0A0A] truncate" title={t.title}>{t.title}</div>
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0 px-2.5 py-[7px] rounded-[11px] bg-white border border-[#F1EDE3]">
          <div className="text-[10px] font-semibold tracking-[.4px] text-[#6B7280]">{t.m1l}</div>
          <div className="mt-px text-sm font-bold truncate" style={{ color: th.m1c || "#0A0A0A" }}>{t.m1v}</div>
        </div>
        <div className="min-w-0 px-2.5 py-[7px] rounded-[11px] bg-white border border-[#F1EDE3]">
          <div className="text-[10px] font-semibold tracking-[.4px] text-[#6B7280]">{t.m2l}</div>
          <div className="mt-px text-sm font-bold text-[#0A0A0A] leading-tight line-clamp-2 break-words" title={t.m2v}>{t.m2v}{/* v416 (H5): wraps instead of "Not verifi…" */}</div>
        </div>
      </div>
      <button type="button" onClick={() => onAction?.(t)} className={`mt-auto ${compact ? "h-10" : "h-[38px]"} w-full px-2 truncate rounded-xl text-white text-[13.5px] font-bold cursor-pointer hover:brightness-95 shrink-0`} style={{ background: th.btn }}>
        {t.cta}
      </button>
    </div>
  );
}

export default function ImportantForYou({ tasks = [], onAction, paused: pausedProp = false, intervalMs = 4000, variant = "desktop", loading = false }) {
  const [idx, setIdx] = useState(0);
  const [hover, setHover] = useState(false);
  const touch = useRef(null);
  const n = tasks.length;
  const cur = n ? ((idx % n) + n) % n : 0;
  const paused = pausedProp || hover;

  useEffect(() => {
    if (n <= 1 || paused) return undefined;
    const t = setInterval(() => setIdx((i) => i + 1), intervalMs);
    return () => clearInterval(t);
  }, [n, paused, intervalMs]);

  // Keep the same task in view when the list changes (e.g. an invite was accepted).
  useEffect(() => { if (n && idx >= n * 50) setIdx(cur); }, [n]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (d) => setIdx((i) => (((i + d) % n) + n) % n);
  const mobile = variant === "mobile";

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`min-w-0 bg-white border border-[#ECECF2] ${mobile ? "rounded-[22px] p-3.5" : "rounded-[24px] p-[18px]"} box-border flex flex-col gap-3 overflow-hidden`}
      style={mobile ? undefined : { height: "100%" }}
      data-testid="important-for-you"
    >
      <div className="flex items-center gap-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[17px] font-bold tracking-[-.4px] text-[#0A0A0A]">Important for you</span>
            {n > 0 && (
              <span className="h-[22px] px-2 rounded-[11px] bg-[#FFF7E6] flex items-center gap-[5px] text-[11px] font-bold text-[#B45309]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />{/* v415: no endless pulse */}{n} task{n === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs font-medium text-[#6B7280]">{loading ? "Loading…" : n > 1 ? `${cur + 1} of ${n}${paused ? " · paused" : ""}` /* v415: no "auto-scrolling" label */ : n === 1 ? "1 of 1" : ""}</div>
        </div>
        {n > 1 && (
          <div className="flex gap-1 shrink-0">
            <button type="button" onClick={() => go(-1)} aria-label="Previous task" className="w-8 h-8 rounded-[10px] border border-[#ECECF2] flex items-center justify-center hover:bg-[#F7F7FA]"><ChevronLeft size={16} /></button>
            <button type="button" onClick={() => go(1)} aria-label="Next task" className="w-8 h-8 rounded-[10px] border border-[#ECECF2] flex items-center justify-center hover:bg-[#F7F7FA]"><ChevronRight size={16} /></button>
          </div>
        )}
      </div>

      <div
        className={`${mobile ? "min-h-[208px]" : "flex-1 min-h-[220px]"} overflow-hidden rounded-[18px]`} /* v416 (H5): never shorter than one task, so the button isn't cut off */
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; setHover(true); }}
        onTouchEnd={(e) => {
          const start = touch.current; touch.current = null; setHover(false);
          if (start == null || n <= 1) return;
          const dx = e.changedTouches[0].clientX - start;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        }}
      >
        {loading && !n ? (
          <div className={`h-full ${mobile ? "min-h-[208px]" : "min-h-[220px]"} rounded-[18px] bg-[#F4F4F8] animate-pulse`} />
        ) : (
          <div className={`flex h-full ${mobile ? "min-h-[208px]" : "min-h-[220px]"}`} style={{ transform: `translateX(-${cur * 100}%)`, transition: "transform .55s cubic-bezier(.2,.8,.2,1)" }}>
            {tasks.map((t) => <TaskSlide key={t.id} t={t} onAction={onAction} compact={mobile} />)}
          </div>
        )}
      </div>

      {n > 1 && (
        <div className="flex gap-1 justify-center">
          {tasks.map((t, i) => (
            <button type="button" key={t.id} onClick={() => setIdx(i)} aria-label={`Task ${i + 1}`} className="h-[5px] rounded-[3px] transition-all duration-300" style={{ width: i === cur ? 18 : 5, background: i === cur ? "#7C3AED" : "#DDD6F3" }} />
          ))}
        </div>
      )}
    </div>
  );
}
