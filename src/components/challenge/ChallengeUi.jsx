import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { X, Share2, Eye, Heart, ChevronRight, Volume2, VolumeX, Check } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext"; // v372: "You're in, <name>!"
import { Marigolds, Sparkle, useDesignFonts } from "./Festive"; // v372
import {
  CHALLENGE_ID, CHALLENGE_NAME, HASHTAG, MENTION, MAX_ENTRIES, PAGE_PATH, ENTRIES_CLOSE_AT, RESULTS_AT, STARTS_AT, MAX_RUN_MS,
  countdown, daysLeftText, entriesOpen, challengeOn, datesFrom, dayText, shareText, RANK_LABEL, PRIZE_POOL,
  TAGS_LINE, RECHARGE_AMOUNT, RECHARGE_SLOTS,
} from "../../lib/diwaliChallenge";
import { getMyChallenge } from "../../lib/challengeApi";

/** v377: the "Add your Diwali reel" screen (kept here as well, so this file doesn't import the sign-in pages). */
export const DIWALI_ADD = "/creator/settings?section=portfolio&add=1&diwali=1";
/** v377: "Share on WhatsApp" — opens WhatsApp with the challenge link. */
export function shareOnWhatsApp() {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://ybexmedia.in";
  const url = `https://wa.me/?text=${encodeURIComponent(shareText(origin))}`;
  try { window.open(url, "_blank", "noopener"); } catch { window.location.href = url; }
}

// v367 (Ravi's design, Diwali Creator Challenge): the small pieces used inside the app — light Ybex glass with
// Diwali accents only (lights, diya, saffron). The loud look lives on /challenge (src/pages/ChallengePage.jsx).

export const SAFFRON = "#FF7A1A";
export const MARIGOLD = "#FFB627";
export const DEEP = "#B8141F";

/** Ticks every second; returns ms now. */
export function useNow(stepMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), stepMs); return () => clearInterval(t); }, [stepMs]);
  return now;
}

/** "🪔 Entry" ribbon on a portfolio cover (own portfolio + public profile). */
export function EntryRibbon({ item, className = "" }) {
  if (!item || item.challenge !== CHALLENGE_ID || !item.challenge_at || !item.challenge_sig) return null;
  // v367 deep test: never show a prize here — the browser can't check the server's signature, so a typed-in
  // "1st prize" would show on a public profile. Prizes show on /challenge and the Home card (server-checked).
  return (
    <span className={`inline-flex items-center gap-0.5 h-[20px] px-1.5 rounded-full text-[11px] font-black text-white shadow ${className}`}
      style={{ background: `linear-gradient(135deg, ${SAFFRON}, ${DEEP})` }} data-testid="challenge-ribbon">
      🪔 Entry
    </span>
  );
}

/** Coloured string lights along the top of a header. Decorative only. */
export function StringLights({ count = 14, className = "" }) {
  const colors = [MARIGOLD, "#E8455B", "#3BB4E5", "#7C3AED", "#2FBF71", SAFFRON];
  return (
    <svg className={`pointer-events-none ${className}`} viewBox="0 0 400 34" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 4 Q100 30 200 8 T400 6" fill="none" stroke="#8B6A3E" strokeWidth="1.2" opacity=".55" />
      {Array.from({ length: count }).map((_, i) => {
        const x = 12 + (i * 376) / (count - 1);
        const y = 4 + Math.abs(Math.sin((x / 400) * Math.PI * 2)) * 15 + 4;
        return <circle key={i} cx={x} cy={y} r="3.6" fill={colors[i % colors.length]} opacity=".95" />;
      })}
    </svg>
  );
}

function Countdown({ now, compact = false, target = ENTRIES_CLOSE_AT }) {
  const { d, h, m, s } = countdown(target - now);
  if (compact) return <>{d}d {h}h {m}m</>;
  return (
    <div className="flex gap-2 justify-center">
      {[[d, "days"], [h, "hrs"], [m, "min"], [s, "sec"]].map(([v, l]) => (
        <div key={l} className="w-[62px] rounded-2xl bg-white/90 border border-amber-100 py-1.5 text-center">
          <div className="text-[22px] font-black tabular-nums text-slate-900 leading-none">{String(v).padStart(2, "0")}</div>
          <div className="text-[11px] font-bold text-slate-500 mt-0.5">{l}</div>
        </div>
      ))}
    </div>
  );
}
export { Countdown };

/** Share the challenge link (native share sheet, else copy). */
export async function shareChallenge() {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://ybexapp.ai.studio";
  const text = shareText(origin);
  try {
    if (navigator.share) { await navigator.share({ title: `Ybex ${CHALLENGE_NAME}`, text, url: `${origin}${PAGE_PATH}` }); return; }
  } catch { /* cancelled → fall back to copy */ }
  try { await navigator.clipboard.writeText(text); toast.success("Link copied. Paste it to your friends."); }
  catch { toast(text); }
}

/** After a save with the toggle ON: "Entry #N is in 🎉" + the reel + share.
 *  v372 (Ravi's "Portfolio Flow" design 3c): festive header with the reel cover and an "ENTRY #N" badge, "You're in,
 *  <name>!", three slots (used vs. left) and the rules as a short checklist. `all` = every entry of mine (slots). */
export function EntryDoneSheet({ entries = [], all = null, left = 0, onClose, resultsAt = RESULTS_AT }) {
  const navigate = useNavigate();
  const { user } = useAuth() || {};
  useDesignFonts(); // v372
  if (!entries.length) return null;
  const top = entries[entries.length - 1];
  const mine = (Array.isArray(all) && all.length ? all : entries).slice(0, MAX_ENTRIES);
  const first = String(user?.name || "").trim().split(/\s+/)[0];
  const free = Math.max(0, Math.min(left, MAX_ENTRIES - mine.length));
  const PJS = "'Plus Jakarta Sans','DM Sans',sans-serif";
  return (
    <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center" role="dialog" aria-modal="true" data-testid="entry-done-sheet">
      <div className="absolute inset-0 bg-[#0B0B0F]/40 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-[calc(100%-20px)] max-w-[460px] mb-[calc(12px+env(safe-area-inset-bottom))] md:mb-0 rounded-[34px] bg-white overflow-hidden shadow-[0_30px_60px_rgba(11,11,15,0.3)] max-h-[calc(100dvh-24px)] overflow-y-auto" style={{ fontFamily: PJS }}>
        {/* festive header */}
        <div className="relative h-[200px] overflow-hidden" style={{ background: "radial-gradient(circle at 50% 115%, #FFF6D6 0, #FFB547 30%, #F0501E 68%, #C81A22 100%)" }}>
          <div aria-hidden="true" className="absolute inset-0" style={{ background: "repeating-radial-gradient(circle at 50% 115%, rgba(255,255,255,0) 0, rgba(255,255,255,0) 22px, rgba(255,255,255,.13) 22px, rgba(255,255,255,.13) 24px)" }} />
          <Marigolds size={16} top={-5} center />
          <Sparkle x="10%" y={60} size={16} /><Sparkle x="80%" y={52} size={20} /><Sparkle x="20%" y={140} size={12} color="#fff" />
          <Sparkle x="74%" y={130} size={14} color="#fff" /><Sparkle x="63%" y={40} size={10} color="#fff" />
          <button type="button" onClick={onClose} aria-label="Close" className="absolute top-[22px] right-3.5 w-8 h-8 rounded-full bg-[#3A0A0E]/30 flex items-center justify-center text-white z-10"><X size={16} /></button>
          <div className="absolute left-1/2 top-[34px] -ml-12 w-24 h-32 rounded-2xl overflow-hidden border-[3px] border-white bg-[#0B0B0F] shadow-[0_14px_28px_rgba(60,5,10,0.4)] -rotate-[4deg]">
            {top.cover ? <img src={top.cover} alt="Your reel" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <div className="w-full h-full flex items-center justify-center text-[34px]">🪔</div>}
          </div>
          <div className="absolute left-1/2 top-[146px] -translate-x-1/2 h-[30px] px-3.5 rounded-full bg-[#2346C9] shadow-[0_4px_0_#1A2A80] flex items-center text-[12px] font-extrabold tracking-[1.6px] text-[#FFE14D] whitespace-nowrap">
            {entries.length === 1 ? `ENTRY #${top.no}` : `ENTRIES #${entries.map((e) => e.no).join(", #")}`}
          </div>
        </div>

        <div className="px-5 pt-5 pb-[18px] flex flex-col items-center text-center">
          <h3 className="text-[26px] leading-[1.15] font-extrabold tracking-[-0.8px] text-[#0B0B0F]">{first && !first.startsWith("@") ? `Entry done, ${first}! 🎉` : "Entry done! 🎉"}</h3>
          {/* v377 (Ravi): "Entry done! Results 18 Nov. ₹50 recharge if you're in the first 300 (after approval)." */}
          <p className="mt-1.5 text-[13px] leading-normal font-medium text-[#6E6E78]" data-testid="entry-done-text">
            {entries.length === 1 ? `Entry #${top.no}` : `Entries #${entries.map((e) => e.no).join(", #")}`} is in for review. Results on {dayText(resultsAt)}. {RECHARGE_AMOUNT} on UPI if you're among the first {RECHARGE_SLOTS} creators (after approval, with a complete profile).
          </p>

          {/* slots: used vs. left */}
          <div className="mt-4 w-full flex gap-2" data-testid="entry-slots">
            {Array.from({ length: MAX_ENTRIES }, (_, i) => {
              const e = mine[i];
              if (e) return (
                <div key={i} className="flex-1 min-w-0 h-[62px] rounded-[14px] bg-[#FFF6E6] border border-[#F7D9A8] flex items-center gap-2 px-2">
                  <div className="w-8 h-11 rounded-[10px] overflow-hidden bg-[#0B0B0F] shrink-0 shadow-[0_6px_14px_rgba(11,11,15,0.14)]">
                    {e.cover ? <img src={e.cover} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : null}
                  </div>
                  <div className="min-w-0 text-left">
                    <div className="text-[11.5px] font-extrabold text-[#3A0A0E] truncate">Entry {i + 1}</div>
                    <div className="flex items-center gap-[3px] text-[11px] font-bold text-[#0E9F6E]"><Check size={10} strokeWidth={3} /> In</div>
                  </div>
                </div>
              );
              return (
                <div key={i} className="flex-1 min-w-0 h-[62px] rounded-[14px] border-[1.5px] border-dashed border-[#F2B77A] flex flex-col items-center justify-center gap-0.5">
                  <span className="text-[11.5px] font-extrabold text-[#C2410C]">+ Entry {i + 1}</span>
                  {/* v373: the count once (on the first open slot) — every open slot said "2 left" */}
                  <span className="text-[11px] font-semibold text-[#B45309]">{i - mine.length < free ? (i === mine.length ? `${free} left` : "Open") : "—"}</span>
                </div>
              );
            })}
          </div>
          {left > 0 && <p className="mt-2 text-[11.5px] font-semibold text-[#B45309]">You can enter {left} more reel{left === 1 ? "" : "s"} (max {MAX_ENTRIES}).</p>}

          {/* rules as a checklist */}
          <div className="mt-3.5 w-full rounded-2xl bg-[#F9F9FB] px-3.5 py-3 flex flex-col gap-2.5 text-left">
            {[<>Follow <b className="text-[#0B0B0F]">{MENTION}</b> on Instagram</>, <>Keep <b className="text-[#0B0B0F]">{TAGS_LINE}</b> in the caption</>, <>Keep the reel public till results</>] /* v396: + follow */.map((t, i) => (
              <div key={i} className="flex gap-2.5 items-start">
                <span className="w-5 h-5 rounded-full bg-[#E7F7F0] flex items-center justify-center text-[#0E9F6E] shrink-0"><Check size={12} strokeWidth={3} /></span>
                <span className="text-[12.5px] leading-[1.45] font-semibold text-[#3A3A44]">{t}</span>
              </div>
            ))}
          </div>

          <button type="button" onClick={shareOnWhatsApp} data-testid="share-whatsapp"
            className="mt-4 w-full h-[54px] rounded-full bg-[#25D366] text-white text-[15px] font-bold inline-flex items-center justify-center gap-2 shadow-[0_10px_24px_rgba(37,211,102,0.3)]">
            <Share2 size={17} /> Share on WhatsApp
          </button>
          <button type="button" onClick={() => { onClose(); navigate("/dashboard"); }} data-testid="go-dashboard" className="mt-2 w-full h-12 rounded-full bg-[#F3F3F6] text-[14.5px] font-bold text-[#0B0B0F]">Go to dashboard</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Creator Home card: my entry (thumbnail, views, likes, days left) or "Join the Diwali Challenge" → /challenge.
 * Shows from the start till Diwali night; hidden for everyone else.
 */
export function ChallengeHomeCard({ hideJoin = false }) {
  const navigate = useNavigate();
  const now = useNow(60_000);
  const [me, setMe] = useState(undefined);
  // v369: dates come from the server (Admin sets them); only ask while a challenge could be running
  const maybe = now >= STARTS_AT && now <= STARTS_AT + MAX_RUN_MS + 70 * 86400_000;
  useEffect(() => {
    if (!maybe) return undefined;
    let alive = true;
    getMyChallenge().then((d) => { if (alive) setMe(d); });
    return () => { alive = false; };
  }, [maybe]);
  const dates = datesFrom(me);
  // v426: no server answer (me === null) → no card. It used to fall back to built-in dates and could say
  // "4 days left" after Admin had moved the dates.
  if (!maybe || !me || me.is_creator === false || !challengeOn(now, dates)) return null;
  const entries = me?.entries || [];
  const open = entriesOpen(now, dates);
  const left = daysLeftText(now, dates);

  if (!entries.length) {
    if (!open || hideJoin) return null; // v372: the festive header already shows the "Win ₹1,00,000" banner
    return (
      <button type="button" onClick={() => navigate(DIWALI_ADD)} data-testid="challenge-join-card"
        className="relative w-full text-left rounded-[22px] overflow-hidden border border-amber-200 p-4 flex items-center gap-3"
        style={{ background: `linear-gradient(120deg, #FFF4E0 0%, #FFE2C2 55%, #FFD0D6 100%)` }}>
        <StringLights className="absolute left-0 right-0 top-0 w-full h-6 opacity-90" />
        <span className="mt-2 text-[34px] leading-none" aria-hidden="true">🪔</span>
        <span className="mt-2 flex-1 min-w-0">
          <span className="block text-[11px] font-black text-[#B8141F]">{CHALLENGE_NAME}</span>
          <span className="block text-[16px] font-black text-slate-900 leading-tight">Add your Diwali reel to enter</span>
          <span className="block text-[12px] font-semibold text-slate-600">Any reel · {TAGS_LINE} · {left || "Entries open"}</span>
          <span className="block text-[11.5px] font-bold text-[#B45309]">{me?.pool || PRIZE_POOL} · {RECHARGE_AMOUNT} UPI cash for the first {RECHARGE_SLOTS}</span>
          {me?.sponsor_names?.length > 0 && <span className="block text-[11px] font-bold text-slate-500 truncate" data-testid="home-powered-by">Powered by {me.sponsor_names.join(" · ")}</span>}
        </span>
        <ChevronRight size={20} className="mt-2 text-slate-500 shrink-0" />
      </button>
    );
  }

  const e = entries[entries.length - 1];
  return (
    <button type="button" onClick={() => navigate(PAGE_PATH)} data-testid="challenge-entry-card"
      className="relative w-full text-left rounded-[22px] overflow-hidden bg-white border border-amber-200 p-3 flex items-center gap-3 shadow-[0_14px_28px_-22px_rgba(184,20,31,0.6)]">
      <div className="relative w-[64px] h-[84px] rounded-2xl overflow-hidden bg-amber-50 shrink-0">
        {e.cover ? <img src={e.cover} alt="My challenge reel" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <div className="w-full h-full flex items-center justify-center text-[28px]">🪔</div>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-black text-[#B8141F]">MY CHALLENGE ENTRY{entries.length > 1 ? ` · ${entries.length} REELS` : ""}</div>
        <div className="text-[17px] font-black text-slate-900 leading-tight">Entry #{e.no}{e.rank ? ` · ${RANK_LABEL[e.rank]} 🏆` : ""}</div>
        <div className="mt-1 flex items-center gap-3 text-[12px] font-semibold text-slate-600">
          {/* v372: a number Instagram didn't give is left out (was a lone "—" next to the heart) */}
          {e.views ? <span className="inline-flex items-center gap-1"><Eye size={13} /> {e.views.toLocaleString("en-IN")}</span> : null}
          {e.likes ? <span className="inline-flex items-center gap-1"><Heart size={13} /> {e.likes.toLocaleString("en-IN")}</span> : null}
          {!e.views && !e.likes ? <span className="text-slate-500">Views are checked before judging</span> : null}{/* v373: nothing updated them daily */}
        </div>
        <div className="mt-0.5 text-[11.5px] font-bold text-amber-700">{open ? left : `Entries closed · winners on ${dayText(dates.resultsAt)}`}</div>
      </div>
      <ChevronRight size={20} className="text-slate-500 shrink-0" />
    </button>
  );
}

/**
 * v371: one example reel on /offer. Plays muted on a loop only while on screen (saves data), shows the cover first,
 * tap = sound on / off. Videos come from Admin → Sponsors & prizes → Example reels.
 */
export function ExampleReel({ reel, index = 0 }) {
  const ref = useRef(null);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && e.intersectionRatio > 0.6) { v.play?.().catch(() => {}); } else { v.pause?.(); }
    }, { threshold: [0, 0.6, 1] });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  if (failed) return null;
  return (
    <div className="relative snap-start shrink-0 w-[62%] max-w-[230px] aspect-[9/16] rounded-[22px] overflow-hidden bg-[#2B0806] shadow-[0_14px_30px_-16px_rgba(80,0,0,.8)]" data-testid="example-reel">
      <video ref={ref} src={reel.url} poster={reel.poster || undefined} muted={muted} loop playsInline preload="none"
        className="absolute inset-0 w-full h-full object-cover" onError={() => setFailed(true)} aria-label={reel.caption || `Example reel ${index + 1}`}
        onClick={() => { const v = ref.current; setMuted((m) => !m); try { v?.play?.(); } catch { /* ignore */ } }} />
      <button type="button" onClick={() => { setMuted((m) => !m); try { ref.current?.play?.(); } catch { /* ignore */ } }} aria-label={muted ? "Sound on" : "Sound off"}
        className="absolute right-2 top-2 w-9 h-9 rounded-full bg-black/45 text-white flex items-center justify-center backdrop-blur">
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
      {reel.caption && <div className="absolute left-0 right-0 bottom-0 p-3 pt-8 bg-gradient-to-t from-black/70 to-transparent text-white text-[12.5px] font-bold leading-snug">{reel.caption}</div>}
    </div>
  );
}

// v377 (Diwali Challenge v3 design): notes and coins falling behind a spinning ₹ coin, on the ₹50 card
const RAIN = [["n", 4, 0, "200deg", 2.6], ["c", 46, 0.5, "-260deg", 2.2], ["n", 58, 1.2, "-180deg", 2.8], ["c", 14, 1.7, "300deg", 2.4], ["n", 30, 2.2, "160deg", 2.7], ["c", 64, 2.6, "-220deg", 2.3]];
export function CashRain() {
  return (
    <div className="relative w-20 h-[84px] shrink-0" aria-hidden="true">
      <style>{"@keyframes ybFall{0%{transform:translateY(-40px) rotate(0deg);opacity:0}12%{opacity:1}85%{opacity:1}100%{transform:translateY(120px) rotate(var(--r));opacity:0}}@keyframes ybCoin{0%,100%{transform:translateY(0) rotateY(0deg)}50%{transform:translateY(-4px) rotateY(180deg)}}@media (prefers-reduced-motion: reduce){.yb-rain *{animation:none!important}}"}</style>
      <div className="yb-rain absolute overflow-hidden rounded-xl" style={{ inset: "-8px -6px -14px -10px" }}>
        {RAIN.map(([kind, left, delay, rot, dur], i) => (
          <div key={i} className="absolute top-0" style={{ left, "--r": rot, animation: `ybFall ${dur}s linear ${delay}s infinite`, opacity: 0 }}>
            {kind === "n"
              ? <div className="w-[26px] h-[14px] rounded-[3px] flex items-center justify-center text-[11px] font-extrabold text-[#0B4D30]" style={{ background: "linear-gradient(135deg,#7ED6A5,#2FA36B)", border: "1px solid #1E7A4E", boxShadow: "0 2px 4px rgba(0,0,0,.15)" }}>₹</div>
              : <div className="w-[14px] h-[14px] rounded-full flex items-center justify-center text-[11px] font-extrabold text-[#8A5A00]" style={{ background: "radial-gradient(circle at 35% 30%,#FFF3B0,#FFD23F 40%,#C98A00)", boxShadow: "inset 0 -1.5px 0 rgba(120,70,0,.35)" }}>₹</div>}
          </div>
        ))}
        <div className="absolute left-1/2 top-1/2 -ml-[30px] -mt-[30px] w-[60px] h-[60px] rounded-full flex items-center justify-center text-[28px] font-extrabold text-[#A86E00]"
          style={{ background: "radial-gradient(circle at 35% 30%,#FFF3B0 0,#FFD23F 35%,#E0A100 75%,#A86E00 100%)", boxShadow: "inset 0 -3px 0 rgba(120,70,0,.35),0 4px 10px rgba(160,100,0,.35)", animation: "ybCoin 2.4s ease-in-out infinite" }}>₹</div>
      </div>
    </div>
  );
}

