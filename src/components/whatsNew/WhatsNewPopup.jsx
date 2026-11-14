import React, { useCallback, useEffect, useRef, useState } from "react";
import { waitForHomeReady, claimAppOpenPopup, waitForNoPopup } from "../../lib/popupRules";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { Megaphone, Check } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { ignored } from "../../utils/ignored";

// Session 41 (Ravi) — "What's new": like the Terms popup, but it never blocks the app. The admin
// writes it (Admin → What's new) and publishes; each user sees each update once. The Terms popup
// sits above this one (z-index 200), so Terms always comes first.
const HIDE_ON = ["/login", "/signup", "/onboarding", "/verify", "/admin", "/chat"];

export default function WhatsNewPopup() {
  const { user } = useAuth() || {};
  const location = useLocation();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);

  useEffect(() => {
    if (!user?.user_id || (user.role !== "creator" && user.role !== "brand")) return undefined;
    let cancelled = false;
    // A short wait so it doesn't land on top of the page while it is still loading.
    const t = setTimeout(async () => {
      try {
        // v289: one popup per app open — if the promo poster showed, What's New waits for the next open
        // (it is not marked seen, so nothing is lost).
        if (window.__ybPromoShown || sessionStorage.getItem("ybex_promo_open") /* Session 48: holds the shown popup key */) return;
        await waitForHomeReady();
        const { data } = await api.get("whats-new/latest");
        if (!cancelled && !window.__ybPromoShown && (!data?.item || claimAppOpenPopup("whatsnew"))) { if (data?.item) window.__ybWhatsNewShown = true; setItem(data?.item || null); }
      } catch (e) { ignored("WhatsNew:load", e); }
    }, 2500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [user?.user_id, user?.role]);

  const hidden = !item || location.pathname === "/" || HIDE_ON.some((p) => location.pathname.startsWith(p)) || location.pathname.includes("/inbox");

  const close = async (thenGo) => {
    const id = item?.id;
    setItem(null);
    if (id) api.post(`whats-new/${id}/seen`).catch((e) => ignored("WhatsNew:seen", e));
    // v332: a full web address (https://…) opened as a broken in-app page; it now opens in the browser.
    if (thenGo && /^https?:\/\//i.test(String(thenGo))) window.open(thenGo, "_blank", "noopener,noreferrer");
    else if (thenGo) navigate(thenGo);
  };

  const points = Array.isArray(item?.points) ? item.points : [];

  return (
    <AnimatePresence>
      {!hidden && (
        <div key="wn" className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" data-testid="whats-new">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/55" onClick={() => close()} />
          <motion.div
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full sm:max-w-md bg-white rounded-t-[26px] sm:rounded-[24px] px-6 pt-6 max-h-[90vh] max-h-[90dvh] overflow-y-auto" /* v332: a long update scrolls; buttons stay reachable */
            style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))", fontFamily: "'DM Sans', sans-serif", willChange: "transform" }}
          >
            <div className="w-11 h-11 rounded-2xl bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center">
              <Megaphone size={20} />
            </div>
            <div className="mt-3 text-[11px] font-bold tracking-wider uppercase text-[#7C3AED]">What's new</div>
            <h2 className="mt-1 text-[22px] font-bold tracking-tight text-[#0A0A0A]">{item.title}</h2>
            <ul className="mt-4 space-y-3">
              {points.map((p, i) => (
                <li key={i} className="flex gap-3 text-[14.5px] leading-[1.5] text-[#374151]">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-[#ECFDF5] text-[#059669] flex items-center justify-center shrink-0"><Check size={12} strokeWidth={3} /></span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex gap-3">
              {item.cta_url ? (
                <>
                  <button type="button" onClick={() => close()} className="flex-1 h-12 rounded-[14px] border border-[#E5E5EA] text-[14.5px] font-bold text-[#374151]">Later</button>
                  <button type="button" onClick={() => close(item.cta_url)} className="flex-[1.4] h-12 rounded-[14px] bg-[#7C3AED] text-white text-[14.5px] font-bold" data-testid="whats-new-cta">{item.cta_label || "Try it"}</button>
                </>
              ) : (
                <button type="button" onClick={() => close()} className="w-full h-12 rounded-[14px] bg-[#7C3AED] text-white text-[14.5px] font-bold" data-testid="whats-new-ok">Got it</button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ═══ v436: "How it works" videos as set in Admin › Developer › How it works ═══════════════════════════════════════
// loadHiwVideos() → { videos: { B1: { source: "youtube"|"file", url, title, role } }, playlist_url } (only videos that
// are set — a Not set video is simply missing, so whatever shows it must hide). openHiwVideo("B1"): YouTube opens
// the link; an uploaded file plays inside the app (full-screen player). Returns false when the video isn't set.
let hiwCache = null;
export async function loadHiwVideos({ fresh = false } = {}) {
  if (!fresh && hiwCache && Date.now() - hiwCache.at < 5 * 60_000) return hiwCache.data;
  try {
    const { data } = await api.get("hiw-videos");
    const clean = { videos: data?.videos && typeof data.videos === "object" ? data.videos : {}, playlist_url: data?.playlist_url || null };
    hiwCache = { at: Date.now(), data: clean };
    return clean;
  } catch { return hiwCache?.data || { videos: {}, playlist_url: null }; }
}
/** Videos of one role that are set, in order (B1…B5 / C1…C5). Empty → hide the Home "How it works" tile. Pure. */
export function hiwVideosForRole(data, role) {
  const p = role === "brand" ? "B" : "C";
  return [1, 2, 3, 4, 5].map((n) => data?.videos?.[`${p}${n}`]).filter((v) => v && v.url);
}
export async function openHiwVideo(code) {
  const v = (await loadHiwVideos()).videos?.[String(code || "").toUpperCase()];
  if (!v?.url) return false;
  if (v.source === "youtube") { window.open(v.url, "_blank", "noopener,noreferrer"); return true; }
  if (typeof document === "undefined") return false;
  const wrap = document.createElement("div");
  wrap.setAttribute("data-testid", "hiw-player");
  wrap.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;padding:env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0)";
  const video = document.createElement("video");
  video.src = v.url; video.controls = true; video.autoplay = true; video.playsInline = true;
  video.style.cssText = "max-width:100%;max-height:100%;width:100%;";
  const close = document.createElement("button");
  close.type = "button"; close.textContent = "✕"; close.setAttribute("aria-label", "Close video");
  close.style.cssText = "position:absolute;top:calc(env(safe-area-inset-top,0px) + 14px);right:14px;width:40px;height:40px;border-radius:20px;border:none;background:rgba(255,255,255,.18);color:#fff;font-size:18px;cursor:pointer";
  const shut = () => { try { video.pause(); } catch { /* ignore */ } wrap.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") shut(); };
  close.onclick = shut;
  wrap.onclick = (e) => { if (e.target === wrap) shut(); };
  document.addEventListener("keydown", onKey);
  wrap.append(video, close);
  document.body.appendChild(wrap);
  return true;
}

// ═══ v437: "How it works" progress (per user, on this phone) — feeds the tour, the section popup and the reminder ═══
const HIW_KEY = (uid) => `yb_hiw_${uid || "guest"}`;
export function readHiwProgress(uid) { try { return JSON.parse(localStorage.getItem(HIW_KEY(uid)) || "{}") || {}; } catch { return {}; } }
export function writeHiwProgress(uid, patch) {
  const cur = readHiwProgress(uid);
  const next = { ...cur, ...patch, sections: { ...(cur.sections || {}), ...(patch.sections || {}) } };
  try { localStorage.setItem(HIW_KEY(uid), JSON.stringify(next)); } catch { /* storage blocked */ }
  return next;
}
export function updateHiwSection(uid, section, patch) {
  const cur = readHiwProgress(uid);
  return writeHiwProgress(uid, { sections: { [section]: { ...(cur.sections?.[section] || {}), ...patch } } });
}
const sessionFlags = () => { const w = typeof window !== "undefined" ? window : {}; w.__ybHiwSession = w.__ybHiwSession || { overlayShown: false }; return w.__ybHiwSession; };
export const markOverlayShown = () => { sessionFlags().overlayShown = true; };
/** A video was played (any source) → that section never shows its popup / reminder again. */
export function markHiwWatched(uid, code) {
  const sec = HIW_SECTION_OF[String(code || "").toUpperCase()];
  if (sec) updateHiwSection(uid, sec, { videoWatched: true });
}
// code → section, and section+role → code (Eva has no section popup / reminder)
export const HIW_SECTION_OF = { B1: "chat", C1: "chat", B2: "ugc", C2: "ugc", B3: "campaigns", C3: "campaigns", B4: "payments", C4: "payments", B5: "eva", C5: "eva" };
export const hiwCodeFor = (section, role) => ({ chat: 1, ugc: 2, campaigns: 3, payments: 4, eva: 5 }[section] ? `${role === "brand" ? "B" : "C"}${{ chat: 1, ugc: 2, campaigns: 3, payments: 4, eva: 5 }[section]}` : "");

const sameDay = (a, b) => { if (!a || !b) return false; const x = new Date(a), y = new Date(b); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); };
const daysSince = (t, now = Date.now()) => (now - new Date(t).getTime()) / 86400000;
/** REMINDER_TOOLTIP_SPEC §5 — pure (tests). */
export function shouldShowHiwTooltip({ section, p = {}, user = {}, session = {}, videoSet = false, busy = false, now = Date.now() }) {
  if (section === "eva") return false;
  if (!videoSet) return false;
  if (!p.popupDismissed || p.videoWatched || p.dontShowAgain) return false;
  if ((p.visitCount || 0) < 3) return false;
  if (sameDay(now, p.popupSeenAt)) return false;
  if ((p.tooltipCount || 0) >= 2) return false;
  if (p.lastTooltipAt && daysSince(p.lastTooltipAt, now) < 3) return false;
  if (user.lastAnyTooltipAt && sameDay(now, user.lastAnyTooltipAt)) return false;
  if (session.overlayShown) return false;
  if (busy) return false;
  return true;
}
const isTypingOrBusy = () => {
  if (typeof document === "undefined") return false;
  const a = document.activeElement;
  if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) return true;
  return Boolean(document.querySelector('[aria-modal="true"],[role="dialog"]:not([data-hiw])'));
};

/** Play a role's video and remember it was watched. */
export async function playHiw(uid, code) {
  const ok = await openHiwVideo(code);
  if (ok) markHiwWatched(uid, code);
  return ok;
}

// ═══ v437: Home quick-bar "How it works" tile + the list of the role's videos ═══════════════════════════════════════
export function useHiwVideos(role) {
  const [data, setData] = useState(null);
  useEffect(() => { let live = true; loadHiwVideos().then((d) => { if (live) setData(d); }); return () => { live = false; }; }, []);
  return { list: data ? hiwVideosForRole(data, role) : [], playlist: data?.playlist_url || null, ready: Boolean(data) };
}

// ═══ v439 (HIW-Home-Tile-Stories handoff): the quick-bar tile (story ring + tiny looping preview) and full-screen
// Instagram-style stories. Creators see only C1–C5, brands only B1–B5; videos Not set in Admin are skipped. ═══════════
export const HIW_CTA = {
  C1: ["View my deals", "/creator/deals?tab=active_deals"], C2: ["Browse UGC briefs", "/creator/ugc/browse"], C3: ["View campaigns", "/campaigns"],
  C4: ["View payouts", "/earnings"], C5: ["Ask Eva", "eva"],
  B1: ["View my deals", "/brand/inbox"], B2: ["Post a UGC brief", "/brand/ugc/post"], B3: ["Create a campaign", "/brand/campaigns/create"],
  B4: ["View payments", "/brand/payments"], B5: ["Ask Eva", "eva"],
};
const HIW_SECTION_LABEL = { chat: "Chat", ugc: "Instant UGC", campaigns: "Campaigns", payments: "Payments", eva: "Eva" };
/** "https://youtu.be/ID" / watch?v= / shorts → embed URL for the story (autoplay, inline). Pure. */
export function youtubeEmbed(url) {
  const m = String(url || "").match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1&playsinline=1&rel=0&modestbranding=1&controls=0` : "";
}
/** All of the role's videos watched → the tile's ring turns grey. Pure. */
export function hiwAllWatched(list, p) {
  return list.length > 0 && list.every((v) => (p?.storySeen || []).includes(v.code) || p?.sections?.[HIW_SECTION_OF[v.code]]?.videoWatched);
}
const HIW_KF = "@keyframes ybTileLoop{from{transform:translateX(0)}to{transform:translateX(-2944px)}}@keyframes ybTileShine{0%,35%{left:-45%}75%,100%{left:120%}}@keyframes ybTilePulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.7)}70%,100%{box-shadow:0 0 0 9px rgba(255,255,255,0)}}@keyframes ybCubeNext{from{transform:rotateY(0deg)}to{transform:rotateY(-90deg)}}@keyframes ybCubePrev{from{transform:rotateY(0deg)}to{transform:rotateY(90deg)}}@keyframes ybShadeOut{from{opacity:0}to{opacity:.55}}@keyframes ybShadeIn{from{opacity:.55}to{opacity:0}}@keyframes ybCtaUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}@keyframes ybHmIn{from{opacity:0;transform:scale(1.04)}to{opacity:1;transform:none}}@keyframes ybSegFill{from{width:0}to{width:100%}}@media (prefers-reduced-motion: reduce){[data-hiw-tile] *{animation:none!important}}";

export function HiwTile({ role, fallback = null }) {
  const { user } = useAuth() || {};
  const uid = user?.user_id;
  const { list, playlist, ready } = useHiwVideos(role);
  const [open, setOpen] = useState(false);
  const [grey, setGrey] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const loopRef = useRef(null);
  useEffect(() => { setGrey(hiwAllWatched(list, readHiwProgress(uid))); }, [list, uid, open]);
  // the loop pauses while the tile is off screen
  useEffect(() => {
    const el = loopRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver((es) => es.forEach((e) => { el.style.animationPlayState = e.isIntersecting ? "running" : "paused"; }), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, [ready, list.length, imgOk]);
  if (!ready || !list.length) return fallback; // all of the role's videos Not set → the old tile stays
  return (
    <>
      <button type="button" id="quickbar-how-it-works" data-testid="qa-how-it-works" data-hiw-tile="1" onClick={() => setOpen(true)} aria-label="How it works — short videos"
        style={{ minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
        <style>{HIW_KF}</style>
        <span data-testid="hiw-tile-ring" data-grey={grey ? "1" : "0"} style={{ display: "block", margin: "-3.5px 0", padding: 2.5, borderRadius: 19, background: grey ? "#DCDCE4" : "conic-gradient(from 200deg,#7C3AED,#C084FC,#F472B6,#F59E0B,#7C3AED)" }}>
          <span style={{ display: "block", padding: 2, borderRadius: 17, background: "#fff" }}>
            <span style={{ position: "relative", width: 46, height: 46, borderRadius: 15, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ position: "absolute", inset: 0, background: "linear-gradient(150deg,#A78BFA 0%,#7C3AED 55%,#5B21B6 100%)" }} />
              <span style={{ position: "absolute", left: "-30%", top: 0, width: "40%", height: "100%", background: "linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.45),rgba(255,255,255,0))", transform: "skewX(-18deg)", animation: "ybTileShine 2.8s ease-in-out infinite" }} />
              <span style={{ position: "relative", width: 24, height: 24, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", animation: "ybTilePulse 1.8s ease-out infinite" }}>
                <svg width="9" height="9" viewBox="0 0 24 24" aria-hidden><path d="M7 4.5v15l12-7.5z" fill="#7C3AED" /></svg>
              </span>
              {imgOk && (
                <span aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
                  <img ref={loopRef} src="/assets/hiw-tile-loop.webp" alt="" onError={() => setImgOk(false)} draggable={false}
                    style={{ position: "absolute", left: 0, top: 0, width: 2944, height: 46, maxWidth: "none", animation: "ybTileLoop 8s steps(64) infinite" }} />
                </span>
              )}
            </span>
          </span>
        </span>
        <span style={{ font: "700 11px 'DM Sans', sans-serif", color: "#5B21B6", whiteSpace: "nowrap" }}>How it works</span>
      </button>
      {open && <HiwStories list={list} playlist={playlist} uid={uid} onClose={() => setOpen(false)} />}
    </>
  );
}

export function HiwStories({ list, playlist, uid, onClose, start = 0 }) {
  const navigate = useNavigate();
  const [si, setSi] = useState(Math.min(start, list.length - 1));
  const [from, setFrom] = useState(-1);
  const [anim, setAnim] = useState(null);
  const [vp, setVp] = useState(0);
  const [cta, setCta] = useState(false);
  const [w, setW] = useState(() => (typeof window !== "undefined" ? Math.min(window.innerWidth, 480) : 390));
  const down = useRef(null);
  const swiped = useRef(false);
  const cur = list[si];
  useEffect(() => { const r = () => setW(Math.min(window.innerWidth, 480)); window.addEventListener("resize", r); return () => window.removeEventListener("resize", r); }, []);
  useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [onClose]);
  useEffect(() => { const o = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = o; }; }, []);
  // a story shown = watched (ring, popups and reminders all stop for it)
  useEffect(() => {
    if (!cur) return undefined;
    const p = readHiwProgress(uid);
    writeHiwProgress(uid, { storySeen: Array.from(new Set([...(p.storySeen || []), cur.code])) });
    markHiwWatched(uid, cur.code);
    setCta(false); setVp(0);
    // YouTube can't tell us the time → the CTA comes after a few seconds
    const t = cur.source === "youtube" ? setTimeout(() => setCta(true), 4400) : null;
    return () => clearTimeout(t);
  }, [si]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!anim) return undefined; const t = setTimeout(() => { setAnim(null); setFrom(-1); }, 520); return () => clearTimeout(t); }, [anim, si]);
  const step = (d) => {
    const n = si + d;
    if (n >= list.length) { onClose(); return; } // after the last one the viewer closes
    if (n < 0) return;
    setFrom(si); setAnim(d > 0 ? "next" : "prev"); setSi(n);
  };
  const go = () => {
    const [, to] = HIW_CTA[cur.code] || [];
    onClose();
    if (to === "eva") setTimeout(() => { try { window.dispatchEvent(new Event("ybex:open-eva")); } catch { /* ignore */ } }, 200);
    else if (to) navigate(to);
  };
  const face = (i, pos) => {
    const v = list[i];
    const live = pos !== "from";
    const yt = v.source === "youtube" ? youtubeEmbed(v.url) : "";
    const st = pos === "next" ? { left: w, transformOrigin: "0 50%", transform: "rotateY(90deg)" }
      : pos === "prev" ? { left: -w, transformOrigin: "100% 50%", transform: "rotateY(-90deg)" } : { left: 0 };
    return (
      <div key={`${i}-${pos}`} style={{ position: "absolute", top: 0, bottom: 0, width: w, backfaceVisibility: "hidden", ...st }}>
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#0B0714" }}>
          {live && v.source !== "youtube" && (
            <video src={v.url} autoPlay playsInline data-testid={`hiw-story-video-${v.code}`}
              onTimeUpdate={(e) => { const x = e.currentTarget; if (x.duration) { setVp(x.currentTime / x.duration); if (x.duration - x.currentTime <= 3) setCta(true); } }}
              onEnded={() => step(1)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", background: "#000" }} />
          )}
          {live && yt && <iframe title={v.title || v.code} src={yt} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} />}
          <div style={{ position: "absolute", inset: 0, background: "#000", opacity: 0, pointerEvents: "none", animation: pos === "from" ? "ybShadeOut .5s ease-in forwards" : pos === "cur" ? "none" : "ybShadeIn .5s ease-out forwards" }} />
        </div>
      </div>
    );
  };
  if (!cur) return null;
  const faces = anim && from >= 0 ? [face(from, "from"), face(si, anim)] : [face(si, "cur")];
  const showCta = cta || vp >= 0.9;
  const [ctaLabel] = HIW_CTA[cur.code] || [];
  const sec = HIW_SECTION_LABEL[HIW_SECTION_OF[cur.code]] || "";
  return createPortal((
    <div role="dialog" aria-modal="true" aria-label="How it works stories" data-hiw="stories" data-testid="hiw-stories"
      onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={(e) => { const d = down.current; down.current = null; if (!d) return; const dx = e.clientX - d.x; if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(e.clientY - d.y)) { swiped.current = true; step(dx < 0 ? 1 : -1); } }}
      style={{ position: "fixed", inset: 0, zIndex: 9990, background: "#000", overflow: "hidden", touchAction: "pan-y", animation: "ybHmIn .28s ease-out", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{HIW_KF}</style>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: w, marginLeft: -w / 2, perspective: 1000 }}>
        <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transformOrigin: `50% 50% -${w / 2}px`, animation: anim ? `${anim === "next" ? "ybCubeNext" : "ybCubePrev"} .5s cubic-bezier(.45,0,.2,1) forwards` : "none" }}>
          {faces}
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, zIndex: 2, padding: "calc(env(safe-area-inset-top, 0px) + 14px) 12px 0", background: "linear-gradient(180deg,rgba(0,0,0,.45),rgba(0,0,0,0))" }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${list.length},1fr)`, gap: 4 }}>
          {list.map((v, i) => (
            <span key={v.code} style={{ display: "block", height: 3, borderRadius: 2, background: "rgba(255,255,255,.3)", overflow: "hidden" }}>
              {i < si && <span style={{ display: "block", height: "100%", width: "100%", background: "#fff" }} />}
              {i === si && (cur.source === "youtube"
                ? <span key={`yt${si}`} style={{ display: "block", height: "100%", background: "#fff", animation: "ybSegFill 45s linear forwards" }} />
                : <span style={{ display: "block", height: "100%", width: `${Math.round(vp * 100)}%`, background: "#fff" }} />)}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 12, paddingBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 18, background: "linear-gradient(150deg,#A78BFA,#7C3AED)", border: "2px solid rgba(255,255,255,.85)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden><path d="M7 4.5v15l12-7.5z" fill="#fff" /></svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cur.title || "How it works"}</div>
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.75)" }}>{cur.code} · {sec} · {si + 1} of {list.length}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" data-testid="hiw-stories-close" style={{ width: 38, height: 38, borderRadius: 19, border: "none", background: "rgba(255,255,255,.16)", color: "#fff", fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>
      </div>
      <button type="button" aria-label="Previous" data-testid="hiw-stories-prev" onClick={() => { if (swiped.current) { swiped.current = false; return; } step(-1); }}
        style={{ position: "absolute", zIndex: 3, left: 0, top: 130, bottom: 170, width: "32%", border: "none", background: "none", cursor: "pointer" }} />
      <button type="button" aria-label="Next" data-testid="hiw-stories-next" onClick={() => { if (swiped.current) { swiped.current = false; return; } step(1); }}
        style={{ position: "absolute", zIndex: 3, right: 0, top: 130, bottom: 170, width: "40%", border: "none", background: "none", cursor: "pointer" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 4, padding: "0 16px calc(env(safe-area-inset-bottom, 0px) + 24px)", display: "flex", flexDirection: "column", gap: 12, background: "linear-gradient(0deg,rgba(0,0,0,.5),rgba(0,0,0,0))" }}>
        {showCta && ctaLabel && (
          <button type="button" onClick={go} data-testid="hiw-stories-cta" style={{ animation: "ybCtaUp .35s cubic-bezier(.22,1,.36,1)", height: 54, border: "none", borderRadius: 18, background: "#fff", color: "#5B21B6", fontSize: 15.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
            {ctaLabel}<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        )}
        {si === list.length - 1 && playlist && (
          <a href={playlist} target="_blank" rel="noopener noreferrer" data-testid="hiw-stories-playlist" style={{ alignSelf: "center", height: 34, padding: "0 10px", display: "flex", alignItems: "center", gap: 7, color: "#fff", fontSize: 13.5, fontWeight: 600 }}>
            <svg width="18" height="13" viewBox="0 0 24 17" aria-hidden><rect width="24" height="17" rx="4.5" fill="#FF0033" /><path d="M9.5 4.8v7.4l6.3-3.7z" fill="#fff" /></svg>Watch all on YouTube
          </a>
        )}
      </div>
    </div>
  ), document.body);
}

// ═══ v437 (APP_TOUR_SPEC.md): first-time coach-mark tour on Home ═════════════════════════════════════════════════════
export const TOUR_STEPS = {
  brand: [
    { target: "bottom-nav-tab-discover", h: "Looking for creators?", s: "Find them here.", nav: true },
    { target: "bottom-nav-tab-manage", h: "Campaigns and Instant UGC?", s: "Start them from Manage.", nav: true },
    { target: "brand-hub-menu-modal", h: "Two ways to work with creators.", s: "Pick one to start.", menu: true },
    { target: "bottom-nav-tab-inbox", h: "Offers, contracts and chats?", s: "All in your Inbox.", nav: true },
    { target: "quickbar-how-it-works", h: "New to Ybex?", s: "Watch short videos here.", top: true },
  ],
  creator: [
    { target: "bottom-nav-tab-campaigns", h: "Want paid brand collabs?", s: "Find them here.", nav: true },
    { target: "bottom-nav-tab-explore_ugc", h: "Shoot short videos for brands?", s: "Get paid per video here.", nav: true },
    { target: "bottom-nav-tab-inbox", h: "Offers and contracts?", s: "Chat with brands here.", nav: true },
    { target: "quickbar-earnings", h: "Your money.", s: "Track earnings and request payout.", top: true },
    { target: "quickbar-how-it-works", h: "New to Ybex?", s: "Watch short videos here.", top: true },
  ],
};
const TOUR_KEY = (uid) => `yb_tour_done_${uid}`;
// Only accounts made after the tour shipped see it (older users already know the app).
export const TOUR_SINCE = Date.parse("2026-11-13T00:00:00+05:30");
/** v437: quick actions / congrats don't auto-open while a new account's tour is still to come. */
export const tourPending = (user) => typeof window !== "undefined" && !window.__ybTourGaveUp && (window.__ybTourShown || tourWanted(user));
export function tourWanted(user, now = Date.now()) {
  if (!user?.user_id || (user.role !== "brand" && user.role !== "creator") || user.parent_brand_id) return false;
  try { if (localStorage.getItem(TOUR_KEY(user.user_id)) === "1") return false; } catch { return false; }
  const made = Date.parse(String(user.created_at || user.createdAt || ""));
  return Number.isFinite(made) && made >= TOUR_SINCE && made <= now + 60_000;
}

export function AppTour({ role }) {
  const { user } = useAuth() || {};
  if (typeof window !== "undefined" && user?.user_id) window.__ybTourUser = user; // v437: quick actions read this before the tour starts
  const [steps, setSteps] = useState(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const nextBtn = useRef(null);
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!tourWanted(user)) return undefined;
    let live = true;
    window.__ybTourShown = true; // v437: claim the screen early — quick actions / congrats wait for the tour
    const giveUp = () => { window.__ybTourShown = false; window.__ybTourGaveUp = true; };
    (async () => {
      await waitForHomeReady();
      // v444 (Ravi): another app-open screen (e.g. the Diwali entry screen) used to cancel the tour for that visit —
      // the tour now waits (up to a minute) for it to close, then runs right after it. Still never on top of it.
      if (!(await waitForNoPopup(60000)) || !live) return giveUp();
      await new Promise((r) => setTimeout(r, 600));
      if (!live) return giveUp();
      if (!claimAppOpenPopup("tour")) {
        // another screen took this app open — let it appear, wait till it closes, then the tour follows it
        await new Promise((r) => setTimeout(r, 2500));
        if (!live || !(await waitForNoPopup(60000)) || !live) return giveUp();
        await new Promise((r) => setTimeout(r, 600));
        if (!live) return giveUp();
      }
      const all = TOUR_STEPS[role === "brand" ? "brand" : "creator"];
      // a step whose target isn't on this screen (e.g. no How it works videos set yet) is left out
      const have = all.filter((st) => st.menu || document.getElementById(st.target));
      if (!have.length) return giveUp();
      markOverlayShown(); window.__ybTourShown = true;
      setSteps(have);
    })();
    return () => { live = false; if (!document.querySelector('[data-testid="app-tour"]')) giveUp(); };
  }, [user?.user_id, role]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = steps?.[i];
  const finish = useCallback(() => {
    try { localStorage.setItem(TOUR_KEY(user?.user_id), "1"); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent("ybex:tour-menu", { detail: { open: false } }));
    setSteps(null); window.__ybTourShown = false;
  }, [user?.user_id]);
  const next = useCallback(() => { if (!steps) return; if (i >= steps.length - 1) finish(); else setI(i + 1); }, [steps, i, finish]);

  // measure the target (and open / close the real Manage chooser for brand step 3)
  useEffect(() => {
    if (!step) return undefined;
    window.dispatchEvent(new CustomEvent("ybex:tour-menu", { detail: { open: Boolean(step.menu) } }));
    let raf = 0; let tries = 0; let same = 0; let lastKey = "";
    // v439 (Ravi: the light was in the wrong place): measure the target together with everything inside it (the raised
    // Manage button sticks out above its tab), and keep measuring until it stops moving (the Manage chooser slides in).
    const measure = () => {
      const el = document.getElementById(step.target);
      if (el) {
        let r = el.getBoundingClientRect(); let L = r.left, T = r.top, R = r.right, B = r.bottom;
        if (step.nav) el.querySelectorAll("*").forEach((k) => { const q = k.getBoundingClientRect(); if (q.width > 4 && q.height > 4 && q.top > r.top - 60 && q.bottom <= r.bottom + 2 && q.width < 140 && getComputedStyle(k).visibility !== "hidden") { L = Math.min(L, q.left); T = Math.min(T, q.top); R = Math.max(R, q.right); B = Math.max(B, q.bottom); } });
        r = { x: L, y: T, w: R - L, h: B - T, cy: (el.getBoundingClientRect().top + el.getBoundingClientRect().bottom) / 2, rad: parseFloat(getComputedStyle(el).borderRadius) || 16 };
        const key = [r.x, r.y, r.w, r.h].map(Math.round).join(",");
        same = key === lastKey ? same + 1 : 0; lastKey = key;
        setRect(r);
        if (same < 6 && tries++ < 120) raf = requestAnimationFrame(measure);
      } else if (tries++ < 120) raf = requestAnimationFrame(measure);
    };
    const t = setTimeout(measure, step.menu ? 120 : 30);
    const onR = () => measure();
    window.addEventListener("resize", onR);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); window.removeEventListener("resize", onR); };
  }, [step]);
  useEffect(() => { if (rect) nextBtn.current?.focus?.(); }, [rect, i]);
  // Android back / swipe back = Skip
  useEffect(() => {
    if (!steps) return undefined;
    try { window.history.pushState({ ybTour: 1 }, ""); } catch { /* ignore */ }
    const onPop = () => finish();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [Boolean(steps)]); // eslint-disable-line react-hooks/exhaustive-deps
  // tapping the lit target = Next
  useEffect(() => {
    if (!step) return undefined;
    const el = document.getElementById(step.target);
    if (!el) return undefined;
    const onTap = (e) => { e.preventDefault(); e.stopPropagation(); next(); };
    el.addEventListener("click", onTap, true);
    return () => el.removeEventListener("click", onTap, true);
  }, [step, next]);

  if (!steps || !step || !rect) return null;
  const W = window.innerWidth, H = window.innerHeight;
  const pad = step.nav ? 6 : 8;
  // nav tab: a 74×64 plate around the tab — taller when the icon is raised above the bar (Manage / UGC)
  const plate = step.nav ? (() => { const top = Math.min(rect.cy - 32, rect.y - 6); const bot = Math.min(H - 3, Math.max(rect.cy + 32, rect.y + rect.h + 6)); return { x: rect.x + rect.w / 2 - 37, y: top, w: 74, h: bot - top, r: 20 }; })() : null;
  const hole = plate || { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2, r: Math.min(26, rect.rad + pad) };
  const cx = hole.x + hole.w / 2;
  const textW = Math.min(280, W - 40);
  const below = Boolean(step.top);
  const textLeft = Math.max(20, Math.min(W - 20 - textW, cx - textW + 40));
  const textTop = below ? hole.y + hole.h + 64 : undefined;
  const textBottom = below ? undefined : H - hole.y + 64;
  // arrow: from the text side (left of the target), curving into the target, head straight down / up, stops 9px short
  const ax0 = step.menu ? Math.min(W - 30, textLeft + 170) : cx - 26;
  const tipY = below ? hole.y + hole.h + 9 : hole.y - 9;
  const startY = below ? tipY + 40 : tipY - 40;
  const arrowD = step.menu ? `M ${ax0} ${tipY - 34} Q ${cx} ${tipY - 34} ${cx} ${tipY}` : `M ${ax0} ${startY} Q ${cx} ${startY} ${cx} ${tipY}`;
  const head = below ? `M ${cx - 6} ${tipY + 6} L ${cx} ${tipY} L ${cx + 6} ${tipY + 6}` : `M ${cx - 6} ${tipY - 6} L ${cx} ${tipY} L ${cx + 6} ${tipY - 6}`;
  const last = i === steps.length - 1;
  const anim = reduce ? "none" : undefined;
  return (
    <div className="fixed inset-0" style={{ zIndex: 60 }} data-testid="app-tour" data-hiw="tour" data-popup-open="true">
      <style>{"@keyframes ybTourPulse{0%,100%{box-shadow:0 0 0 0 rgba(196,181,253,.55)}50%{box-shadow:0 0 0 10px rgba(196,181,253,0)}}@keyframes ybTourIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}@keyframes ybTourDraw{from{stroke-dashoffset:120}to{stroke-dashoffset:0}}@keyframes ybTourBob{0%,100%{transform:translateY(0)}50%{transform:translateY(3px)}}@keyframes ybTourPop{from{opacity:0}to{opacity:1}}"}</style>
      {/* dim with a cut-out hole (the target stays sharp and tappable); tapping the dim does nothing */}
      <svg width={W} height={H} className="absolute inset-0" style={{ pointerEvents: "none" }} aria-hidden>
        <defs><mask id="ybTourMask"><rect width={W} height={H} fill="#fff" /><rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx={hole.r} fill="#000" style={{ transition: anim || "all .4s ease" }} /></mask></defs>
        <rect width={W} height={H} fill="rgba(10,6,22,.75)" mask="url(#ybTourMask)" />
      </svg>
      <div className="absolute inset-0" style={{ backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 ${hole.y}px,${hole.x}px ${hole.y}px,${hole.x}px ${hole.y + hole.h}px,${hole.x + hole.w}px ${hole.y + hole.h}px,${hole.x + hole.w}px ${hole.y}px,0 ${hole.y}px)` }} onClick={(e) => e.stopPropagation()} />
      <div aria-hidden className="absolute" style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h, borderRadius: hole.r, border: "2px solid #fff", pointerEvents: "none", transition: anim || "all .4s ease", animation: reduce ? "none" : "ybTourPulse 1.8s ease-in-out infinite" }} />
      <svg width={W} height={H} className="absolute inset-0" style={{ pointerEvents: "none", filter: "drop-shadow(0 1px 2px rgba(0,0,0,.35))" }} aria-hidden key={`a${i}`}>
        <g style={{ animation: reduce ? "none" : "ybTourBob 1.6s ease-in-out .7s infinite" }}>
          <path d={arrowD} fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeDasharray="120" style={{ animation: reduce ? "none" : "ybTourDraw .45s ease-out both" }} />
          <path d={head} fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: reduce ? "none" : "ybTourPop .2s ease-out .45s both" }} />
        </g>
      </svg>
      <div role="dialog" aria-label={step.h} key={`t${i}`} className="absolute" style={{ left: textLeft, top: textTop, bottom: textBottom, width: textW, color: "#fff", fontFamily: "'DM Sans', sans-serif", animation: reduce ? "none" : "ybTourIn .3s ease-out both" }}>
        <div style={{ fontSize: 12, letterSpacing: ".12em", fontWeight: 700, color: "rgba(255,255,255,.72)" }}>{i + 1} OF {steps.length}</div>
        <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.15, marginTop: 6 }}>{step.h}</div>
        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, marginTop: 4 }}>{step.s}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 16 }}>
          <button ref={nextBtn} type="button" onClick={next} data-testid="tour-next" style={{ height: 40, padding: "0 20px", borderRadius: 999, border: "none", background: "#fff", color: "#4C1D95", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>{last ? "Done ›" : "Next ›"}</button>
          {!last && <button type="button" onClick={finish} data-testid="tour-skip" style={{ border: "none", background: "none", color: "rgba(255,255,255,.78)", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Skip</button>}
        </div>
      </div>
    </div>
  );
}

// ═══ v437: section "How it works" — header button, first-time popup, and the reminder tooltip (REMINDER_TOOLTIP_SPEC) ═══
export const HIW_COPY = {
  C1: ["How does chat work?", "Accept or counter the offer", "Money stays safe in escrow till you get paid"],
  B1: ["How does chat work?", "Send an offer to the creator", "Pay into escrow, release when you approve"],
  B3: ["How do campaigns work?", "Add the brief, budget and deliverables", "Creators apply once it is approved"],
  C3: ["How to apply to campaigns?", "Open a campaign that fits you", "Send your rate, the brand replies in chat"],
  B2: ["How does UGC work?", "Post a brief and pay upfront", "Creators send videos within the brief's deadline"],
  C2: ["How does UGC work?", "Claim a brief before someone else", "Send the video within the brief's deadline, get paid on approval"],
  C4: ["How do payouts work?", "The brand pays into escrow before you start", "Paid 1–2 days after the brand approves"],
  B4: ["How do payments work?", "When you pay into escrow", "Released on approval, refunded if the deal fails"],
};
// v439 (HIW-Popups-Final handoff): the first-time popup's question headline
export const HIW_LINE1 = {
  C1: "Want to know how chat works?", B1: "Want to know how chat works?", B3: "Want to know how campaigns work?",
  C3: "Want to know how to apply to campaigns?", B2: "Want to know how UGC works?", C2: "Want to know how UGC works?",
  C4: "Want to know how payouts work?", B4: "Want to know how payments work?", B5: "Meet Eva, your AI assistant", C5: "Meet Eva, your AI assistant",
};
const HIW_ILL_H = { C1: 250, B1: 318, B3: 300, C3: 226, B2: 262, C2: 262, C4: 350, B4: 365, C5: 262, B5: 262 };
const EVA_CHIPS = { creator: ["Campaigns", "Bio & captions", "Free invoice", "When is my payout?"], brand: ["Find creators", "Write briefs", "Free invoice", "New campaign"] };
let illMod = null;
const loadIll = () => (illMod ? Promise.resolve(illMod) : import("./hiwIllustrations").then((m) => { illMod = m; return m; }));
/** The animated illustration on top of the popup (static markup from the design handoff). */
function HiwIllustration({ code }) {
  const [m, setM] = useState(illMod);
  useEffect(() => { let live = true; if (!m) loadIll().then((x) => { if (live) setM(x); }).catch(() => {}); return () => { live = false; }; }, [m]);
  const eva = /5$/.test(code);
  let html = "";
  if (m) {
    html = m.HIW_ILL[eva ? "EVA" : code] || "";
    html = html.replace(/%%IMG(\d)%%/g, (_, i) => m.HIW_ILL_IMG[Number(i)] || "");
    const chips = EVA_CHIPS[code[0] === "B" ? "brand" : "creator"];
    html = html.replace(/%%EVA(\d)%%/g, (_, i) => chips[Number(i) - 1] || "");
  }
  return (
    <div data-hiw-ill="1" aria-hidden style={{ position: "relative", height: HIW_ILL_H[code] || 280, borderRadius: "22px 22px 0 0", overflow: "hidden", WebkitMaskImage: "linear-gradient(180deg,#000 0%,#000 80%,transparent 100%)", maskImage: "linear-gradient(180deg,#000 0%,#000 80%,transparent 100%)", background: "radial-gradient(70% 55% at 50% 30%,rgba(167,139,250,.28),rgba(167,139,250,0) 70%),linear-gradient(180deg,#EEE6FF 0%,#F7F3FF 55%,#FFFFFF 100%)" }}>
      {m && <style>{m.HIW_ILL_CSS}</style>}
      {!eva && !/2$/.test(code) && (
        <span style={{ position: "absolute", left: 12, top: 12, zIndex: 4, display: "flex", alignItems: "center", height: 26, padding: "0 10px 0 8px", borderRadius: 13, background: "rgba(255,255,255,.72)", border: "1px solid rgba(255,255,255,.9)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", boxShadow: "0 4px 12px -6px rgba(76,29,149,.35)", gap: 6, fontSize: 11.5, fontWeight: 800, color: "#5B21B6", whiteSpace: "nowrap" }}>
          <svg width="9" height="9" viewBox="0 0 24 24"><path d="M6 3.5v17l14-8.5z" fill="#7C3AED" /></svg>Tutorial video
        </span>
      )}
      {html && (eva
        ? <div style={{ position: "absolute", inset: 0 }} dangerouslySetInnerHTML={{ __html: html }} />
        : <div style={{ position: "absolute", left: 0, right: 0, top: 34, bottom: 0, zoom: 1.06 }} dangerouslySetInnerHTML={{ __html: html }} />)}
    </div>
  );
}
/** Option 1 popup card: animated illustration, NEW HERE?, question, Watch tutorial, Watch on YouTube, Don't show again. */
export function HiwPopupCard({ code, video, onPlay, onClose, onDont, testid, z = 150 }) {
  useEffect(() => { loadIll().catch(() => {}); const k = (e) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [onClose]);
  const yt = video?.source === "youtube";
  return createPortal((
    <div className="fixed inset-0 flex items-center justify-center px-4" data-hiw="popup" data-testid={testid} style={{ zIndex: z, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{"@keyframes ybHiwFade{from{opacity:0}to{opacity:1}}@keyframes ybHiwPop{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:none}}"}</style>
      <div onClick={onClose} className="absolute inset-0" style={{ background: "rgba(16,16,20,.34)", animation: "ybHiwFade .25s ease-out" }} />
      <div role="dialog" aria-modal="true" aria-labelledby="hiw-title" className="relative w-full" style={{ maxWidth: 380, background: "#fff", borderRadius: 28, boxShadow: "0 30px 60px -20px rgba(16,16,20,.35),0 0 0 1px rgba(124,58,237,.06)", padding: "12px 12px 10px", display: "flex", flexDirection: "column", animation: "ybHiwPop .3s cubic-bezier(.22,1,.36,1)", maxHeight: "calc(100dvh - 24px)", overflowY: "auto" }}>
        <HiwIllustration code={code} />
        <button type="button" onClick={onClose} aria-label="Close" data-testid="hiw-popup-close" style={{ position: "absolute", top: 22, right: 22, zIndex: 5, width: 32, height: 32, borderRadius: 16, border: "none", background: "rgba(255,255,255,.92)", boxShadow: "0 2px 8px rgba(16,16,20,.12)", color: "#3A3A44", fontSize: 13, cursor: "pointer" }}>✕</button>
        <div style={{ marginTop: 12, textAlign: "center", fontSize: 11.5, fontWeight: 800, letterSpacing: 1.4, color: "#8A8A99" }}>NEW HERE?</div>
        <div id="hiw-title" style={{ marginTop: 6, padding: "0 8px", textAlign: "center", fontSize: 25, fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.7, color: "#7C3AED", textWrap: "balance" }}>{HIW_LINE1[code] || video?.title || "How it works"}</div>
        <div style={{ marginTop: 8, textAlign: "center", fontSize: 14.5, color: "#6E6E7C" }}>Watch a quick tutorial video</div>
        <button type="button" onClick={onPlay} data-testid="hiw-popup-play" style={{ marginTop: 18, width: "100%", height: 56, border: "none", borderRadius: 18, background: "#7C3AED", color: "#fff", fontSize: 16.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 14px 28px -12px rgba(124,58,237,.8)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden><path d="M6 3.5v17l14-8.5z" fill="#fff" /></svg>Watch tutorial
        </button>
        {yt && (
          <button type="button" onClick={onPlay} data-testid="hiw-popup-youtube" style={{ marginTop: 8, alignSelf: "center", height: 40, padding: "0 12px", border: "none", background: "none", color: "#3A3A44", fontSize: 14.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="20" height="14" viewBox="0 0 24 17" aria-hidden><rect width="24" height="17" rx="4.5" fill="#FF0033" /><path d="M9.5 4.8v7.4l6.3-3.7z" fill="#fff" /></svg>Watch on YouTube
          </button>
        )}
        <button type="button" onClick={onDont} data-testid="hiw-popup-dont" style={{ marginTop: 6, alignSelf: "center", height: 36, padding: "0 12px", border: "none", background: "none", color: "#9A9AA8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Don't show again</button>
      </div>
    </div>
  ), document.body);
}
/** Eva (06): only the "Meet Eva" popup on the first open of Eva — no header button, no tooltip. */
export function EvaHiwPopup({ open, role }) {
  const { user } = useAuth() || {};
  const uid = user?.user_id;
  const code = `${role === "brand" ? "B" : "C"}5`;
  const [video, setVideo] = useState(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!open || !uid) return undefined;
    const p = readHiwProgress(uid).sections?.eva || {};
    if (p.popupSeen || p.videoWatched || p.dontShowAgain) return undefined;
    let live = true;
    loadHiwVideos().then((d) => {
      const v = d.videos?.[code];
      if (!live || !v?.url) return;
      setVideo(v);
      const t = setTimeout(() => { if (!live) return; updateHiwSection(uid, "eva", { popupSeen: true, popupSeenAt: new Date().toISOString() }); markOverlayShown(); setShow(true); }, 700);
      return () => clearTimeout(t);
    });
    return () => { live = false; };
  }, [open, uid, code]);
  if (!show || !video) return null;
  const close = (extra = {}) => { setShow(false); updateHiwSection(uid, "eva", { popupDismissed: true, ...extra }); };
  return <HiwPopupCard code={code} video={video} testid="hiw-popup-eva" z={2200} onPlay={() => { close(); playHiw(uid, code); }} onClose={() => close()} onDont={() => close({ dontShowAgain: true })} />;
}

export function HiwSectionHelp({ section, role: roleProp, className = "", label = "Guide" }) {
  const { user } = useAuth() || {};
  const role = roleProp || (user?.role === "brand" || user?.parent_brand_id ? "brand" : "creator");
  const uid = user?.user_id;
  const code = hiwCodeFor(section, role);
  const [video, setVideo] = useState(null);
  const [popup, setPopup] = useState(false);
  const [tip, setTip] = useState(false);
  const btn = useRef(null);
  const counted = useRef(false);

  useEffect(() => { let live = true; loadHiwVideos().then((d) => { if (live) setVideo(d.videos?.[code] || null); }); return () => { live = false; }; }, [code]);

  // a visit; first-time popup (once); or the reminder tooltip (2 s after the screen settles)
  useEffect(() => {
    if (!video || !uid || counted.current || section === "eva") return undefined;
    counted.current = true;
    const p0 = readHiwProgress(uid).sections?.[section] || {};
    const p = updateHiwSection(uid, section, { visitCount: (p0.visitCount || 0) + 1 }).sections[section];
    const timers = [];
    if (!p.popupSeen && !p.videoWatched && !p.dontShowAgain) {
      // v439: another popup (congrats, Diwali screen…) is open → wait for it to close (never stacked), up to ~30 s
      let tries = 0;
      const attempt = () => {
        if (sessionFlags().overlayShown || window.__ybTourShown) return;
        if (isTypingOrBusy()) { if (++tries < 20) timers.push(setTimeout(attempt, 1500)); return; }
        markOverlayShown();
        updateHiwSection(uid, section, { popupSeen: true, popupSeenAt: new Date().toISOString() });
        setPopup(true);
      };
      timers.push(setTimeout(attempt, 1200));
    } else {
      timers.push(setTimeout(() => {
        const prog = readHiwProgress(uid);
        const ok = shouldShowHiwTooltip({ section, p: prog.sections?.[section] || {}, user: prog, session: sessionFlags(), videoSet: true, busy: isTypingOrBusy() || window.__ybTourShown });
        if (!ok) return;
        const now = new Date().toISOString();
        updateHiwSection(uid, section, { tooltipCount: ((prog.sections?.[section] || {}).tooltipCount || 0) + 1, lastTooltipAt: now });
        writeHiwProgress(uid, { lastAnyTooltipAt: now });
        markOverlayShown();
        setTip(true);
      }, 2000));
    }
    return () => timers.forEach(clearTimeout);
  }, [video, uid, section]);

  // tooltip: auto-hide after 8 s, close on scroll / tap outside
  useEffect(() => {
    if (!tip) return undefined;
    const t = setTimeout(() => setTip(false), 8000);
    const off = () => setTip(false);
    const outside = (e) => { if (!e.target.closest?.('[data-hiw="tip"]')) setTip(false); };
    window.addEventListener("scroll", off, { passive: true, capture: true });
    document.addEventListener("pointerdown", outside, true);
    return () => { clearTimeout(t); window.removeEventListener("scroll", off, { capture: true }); document.removeEventListener("pointerdown", outside, true); };
  }, [tip]);

  if (!video?.url || !code) return null; // Not set in Admin → no header button, popup or tooltip
  const copy = HIW_COPY[code] || [video.title || "How it works", "", ""];
  const play = () => { setPopup(false); setTip(false); playHiw(uid, code); };
  // v441 (Ravi: people won't find the video button): closing the first-time popup without watching shows the tip
  // on the "Guide" button once, so they know where the video lives (not after "Don't show again").
  const closePopup = (extra = {}) => {
    setPopup(false);
    const p0 = readHiwProgress(uid).sections?.[section] || {};
    updateHiwSection(uid, section, { popupDismissed: true, ...extra, ...(!extra.dontShowAgain && !p0.pointerTipShown ? { pointerTipShown: true } : {}) });
    if (!extra.dontShowAgain && !p0.pointerTipShown) setTimeout(() => setTip(true), 350);
  };
  const r = btn.current?.getBoundingClientRect?.();
  return (
    <>
      {/* v440 (Ravi: the "How it works" chip looked messy): a small button that matches the header's own buttons —
          icon-only next to the bell / search, or "Guide" in the same pill as Help. It opens the popup again. */}
      <button ref={btn} type="button" onClick={() => { setTip(false); setPopup(true); }} data-testid={`hiw-btn-${section}`} aria-label={`How it works: ${video.title || section} (video)`} title="How it works"
        className={`${className || (label ? "h-10 px-3 rounded-full border border-[#E6E3EE] bg-white text-[13px] font-semibold text-[#0A0A0A]" : "w-10 h-10 rounded-full bg-[#F2F2F7]")} inline-flex items-center justify-center gap-1.5 shrink-0 active:scale-95 transition-transform`}
        style={{ position: "relative", zIndex: tip ? 142 : "auto", boxShadow: tip ? "0 0 0 4px #FFFFFF,0 0 0 7px rgba(124,58,237,.35)" : "none" }}>
        <svg width="20" height="14" viewBox="0 0 24 17" aria-hidden data-icon="youtube"><rect width="24" height="17" rx="4.5" fill="#FF0033" /><path d="M9.5 4.8v7.4l6.3-3.7z" fill="#fff" /></svg>{/* v442 (Ravi): YouTube mark — reads as "video" at a glance */}
        {label && <span>{label}</span>}
      </button>
      {popup && <HiwPopupCard code={code} video={video} testid={`hiw-popup-${section}`} onPlay={play} onClose={() => closePopup()} onDont={() => closePopup({ dontShowAgain: true })} />}
      {tip && r && (
        <>
          <div aria-hidden className="fixed inset-0 z-[140]" style={{ background: "rgba(16,16,20,.18)", pointerEvents: "none" }} />
          <div role="dialog" aria-label={copy[0]} data-hiw="tip" data-testid={`hiw-tip-${section}`} className="fixed z-[141]"
            style={{ top: r.bottom + 10, left: Math.max(12, Math.min(window.innerWidth - 280, r.left + r.width / 2 - 134)), width: 268, fontFamily: "'DM Sans', sans-serif", animation: "ybTipIn .26s ease-out both" }}>
            <style>{"@keyframes ybTipIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}"}</style>
            <div aria-hidden style={{ position: "absolute", top: -6, left: Math.max(14, Math.min(254, r.left + r.width / 2 - Math.max(12, Math.min(window.innerWidth - 280, r.left + r.width / 2 - 134)) - 6)), width: 12, height: 12, background: "#F1ECFF", transform: "rotate(45deg)", borderRadius: 2 }} />
            <div className="rounded-[18px] overflow-hidden bg-white" style={{ boxShadow: "0 18px 40px rgba(16,16,20,.2)" }}>
              <div className="flex items-start gap-2 px-4 pt-3.5 pb-3" style={{ background: "linear-gradient(180deg,#F1ECFF,#FFFFFF)" }}>
                <div className="flex-1 text-[16px] font-extrabold" style={{ color: "#5B21B6", letterSpacing: "-0.2px" }}>{copy[0]}</div>
                <button type="button" aria-label="Close" onClick={() => setTip(false)} className="text-slate-400 text-[15px] leading-none pt-1">✕</button>
              </div>
              <ul className="px-4 pt-2 space-y-1.5">{copy.slice(1).filter(Boolean).map((b) => <li key={b} className="flex gap-2 text-[14px] text-slate-700"><span style={{ color: "#7C3AED" }}>•</span>{b}</li>)}</ul>
              <div className="flex gap-2 px-3 pb-3 pt-3">
                <button type="button" onClick={play} className="h-11 rounded-xl text-[14px] font-bold flex items-center justify-center gap-1.5" style={{ flex: 1, background: "#F5F2FF", color: "#5B21B6", border: "1px solid #E4DCFF" }} data-testid="hiw-tip-play"><svg width="11" height="11" viewBox="0 0 24 24" aria-hidden><path d="M7 4.5v15l12-7.5z" fill="#5B21B6" /></svg>Play</button>
                <button type="button" onClick={() => setTip(false)} className="h-11 rounded-xl text-[14px] font-bold text-white" style={{ flex: 1.3, background: "#101014" }}>Got it</button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
