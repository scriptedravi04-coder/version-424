import React, { useEffect, useRef, useState } from "react";

// Session 58 — Claude Design handoff "Ybex Eva" (Eva Developer Notes.md), part 1: the chat look.
// One place for Eva's face moods, the blur pop-in, word-by-word replies, "Show more", the message meta
// line with 👍 / 👎, the 2×2 starter boxes and the disclaimer. FeedbackBot.jsx uses these.

export const ORB = "radial-gradient(circle at 34% 30%,#F7FFD1 0%,#C6F24E 28%,#4CC765 62%,#178A5B 100%)";
export const LIME = "#C6F432";
export const MOODS = ["hello", "wink", "excited", "proud", "hmm", "whoa", "missed", "cheeky"];

/** Notes §8c: the face for one Eva message, picked from its words. Colour never changes. */
export function moodFor(text = "") {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return "hello";
  if (/\b(sorry|problem|error|oops|couldn'?t|can'?t|cannot|failed|declined|not able|nahi ho)\b/.test(t)) return "whoa";
  if (/invited you|\bpsst\b|asking for you/.test(t)) return "wink";
  if (/\b(payout|earning|earnings|paid|fair rate|your rate|kamai)\b/.test(t)) return "proud";
  if (/\b(found|ready|done|sent|posted|accepted|claimed|live|saved|great|nice)\b|🎉|✅/.test(t)) return "excited";
  if (/\?\s*$/.test(t.trim())) return "hmm";
  return "hello";
}

/** Notes §3/§4 + design frame 02: the lime orb with one of 8 faces. size = the ball's width in px. */
export function EvaFace({ size = 26, mood = "hello", glow = true, style }) {
  const k = size / 26;
  const eyeW = 4 * k, eyeH = 6 * k, gap = 4.2 * k;
  const ink = "#0A0A0A";
  const open = (anim = "evaBlink 4.2s infinite") => ({ width: eyeW, height: eyeH, borderRadius: "50%", background: ink, animation: anim, transformOrigin: "50% 50%" });
  const happy = { width: eyeW * 1.25, height: eyeH * 0.62, borderTop: `${1.7 * k}px solid ${ink}`, borderRadius: `${eyeW}px ${eyeW}px 0 0` }; // ∩
  const sleepy = { width: eyeW * 1.25, height: eyeH * 0.62, borderBottom: `${1.7 * k}px solid ${ink}`, borderRadius: `0 0 ${eyeW}px ${eyeW}px`, animation: "evaDroop 3.6s ease-in-out infinite" }; // ∪
  const round = { width: eyeW * 1.2, height: eyeW * 1.2, borderRadius: "50%", background: ink, animation: "evaPop 2.4s ease-in-out infinite" };
  const sparkle = { width: eyeW * 1.15, height: eyeH * 1.05, borderRadius: "50%", background: ink, boxShadow: `inset ${1 * k}px ${-1 * k}px 0 ${0.6 * k}px rgba(255,255,255,.9)`, animation: "evaSparkle 1.4s ease-in-out infinite" };
  let L = open(), R = open(), eyesAnim;
  if (mood === "wink") { L = open("evaBlink 3s infinite"); R = happy; }
  if (mood === "excited") { L = sparkle; R = sparkle; }
  if (mood === "proud") { L = happy; R = happy; eyesAnim = "evaHop 2.2s ease-in-out infinite"; }
  if (mood === "hmm") { eyesAnim = "evaLook 3.6s ease-in-out infinite"; }
  if (mood === "whoa") { L = round; R = round; }
  if (mood === "missed") { L = sleepy; R = sleepy; }
  if (mood === "cheeky") { L = happy; R = open(); }
  const mouthTop = 15 * k, mouthLeft = 13 * k;
  const smile = { width: 7 * k, height: 3.6 * k, borderBottom: `${1.6 * k}px solid ${ink}`, borderRadius: `0 0 ${7 * k}px ${7 * k}px` };
  let mouth = smile, mouthAnim;
  if (mood === "wink") mouth = { ...smile, width: 6 * k, transform: "rotate(-10deg)" };
  if (mood === "excited") { mouth = { width: 8 * k, height: 4 * k, background: ink, borderRadius: `0 0 ${8 * k}px ${8 * k}px` }; mouthAnim = "evaHopY 1.2s ease-in-out infinite"; }
  if (mood === "hmm" || mood === "missed") mouth = { width: 6 * k, height: 0, borderTop: `${1.6 * k}px solid ${ink}`, borderRadius: 2 };
  if (mood === "whoa") { mouth = { width: 4 * k, height: 4.6 * k, borderRadius: "50%", background: ink }; mouthAnim = "evaPop 2.4s ease-in-out infinite"; }
  const blush = mood === "proud" ? 0.75 : mood === "excited" || mood === "cheeky" || mood === "wink" ? 0.5 : 0.3;
  return (
    <div data-mood={mood} style={{ width: size, height: size, borderRadius: "50%", background: ORB, position: "relative", flexShrink: 0, boxShadow: glow ? `0 0 ${14 * k}px ${2 * k}px rgba(255,255,255,.35)` : undefined, ...style }}>
      <div style={{ position: "absolute", top: 8 * k, left: mouthLeft, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap, animation: eyesAnim }}>
        <div style={L} /><div style={R} />
      </div>
      <div style={{ position: "absolute", top: 13.3 * k, left: 4.2 * k, width: 3.4 * k, height: 2 * k, borderRadius: "50%", background: `rgba(255,105,140,${blush})` }} />
      <div style={{ position: "absolute", top: 13.3 * k, right: 4.2 * k, width: 3.4 * k, height: 2 * k, borderRadius: "50%", background: `rgba(255,105,140,${blush})` }} />
      <div style={{ position: "absolute", top: mouthTop, left: mouthLeft, transform: "translateX(-50%)" }}>
        <div style={{ ...mouth, animation: mouthAnim }} />
        {mood === "cheeky" && <div style={{ width: 3.4 * k, height: 3.4 * k, margin: `${-0.6 * k}px auto 0`, borderRadius: `0 0 ${3 * k}px ${3 * k}px`, background: "#FF6F91", animation: "evaWiggle 1.1s ease-in-out infinite" }} />}
      </div>
    </div>
  );
}

/** All of Eva's keyframes (design names, prefixed). Put once in the portal. */
export const EVA_KEYFRAMES = `
@keyframes evaBlink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.15)}}
@keyframes evaLook{0%,20%{transform:translateX(-50%)}30%,55%{transform:translate(calc(-50% - 2px),-1px)}65%,90%{transform:translate(calc(-50% + 2px),-1px)}100%{transform:translateX(-50%)}}
@keyframes evaSparkle{0%,100%{transform:scale(1)}50%{transform:scale(1.22)}}
@keyframes evaHop{0%,100%{transform:translate(-50%,0)}50%{transform:translate(-50%,-2px)}}
@keyframes evaHopY{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
@keyframes evaPop{0%,100%{transform:scale(1)}40%{transform:scale(1.2)}}
@keyframes evaDroop{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.55) translateY(1px)}}
@keyframes evaWiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-12deg)}75%{transform:rotate(12deg)}}
@keyframes evaIn{0%{opacity:0;filter:blur(14px);transform:translateY(18px) scale(.94)}60%{opacity:1}100%{opacity:1;filter:blur(0);transform:none}}
@keyframes evaSheen{0%{background-position:-180% 0}100%{background-position:280% 0}}
@keyframes evaCaret{0%,49%{opacity:1}50%,100%{opacity:0}}
@keyframes evaFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes evaSquash{0%{transform:scale(1)}35%{transform:scale(1.12,.88)}70%{transform:scale(.96,1.04)}100%{transform:scale(1)}}
.eva-in{animation:evaIn .6s cubic-bezier(.22,1,.36,1) both}
.eva-press{transition:transform .18s cubic-bezier(.34,1.56,.64,1)}
.eva-press:active{transform:scale(.96)}
@media (prefers-reduced-motion: reduce){.eva-in{animation:none}}
`;

export const LONG_REPLY = 170;
/** Cut a long reply at a word near `n` characters (for "Show more"). */
export function shortPart(text, n = LONG_REPLY) {
  const t = String(text || "");
  if (t.length <= n + 20) return t;
  const cut = t.lastIndexOf(" ", n);
  return `${t.slice(0, cut > 80 ? cut : n).trimEnd()}…`;
}

/** Notes §8f: Eva's text appears word by word (~45 ms a word) with a ▍ cursor, once. Long replies fold. */
// v329: users who ask for less motion get the whole reply at once (no word-by-word streaming).
const reduceMotion = () => { try { return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); } catch { return false; } };
export function StreamText({ text, stream: wantStream = true, onDone, onGrow }) {
  const [stream] = useState(() => Boolean(wantStream) && !reduceMotion()); // v329: decided once — a re-render never restarts / cuts it
  const full = String(text || "");
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? full : shortPart(full);
  const words = useRef(shown.split(/(\s+)/));
  const [n, setN] = useState(stream ? 0 : words.current.length);
  useEffect(() => {
    if (!stream) { if (wantStream) onDone?.(); return undefined; } // v329: reduced motion → counts as streamed
    words.current = shortPart(full).split(/(\s+)/);
    let i = 0;
    const iv = setInterval(() => {
      i += 2; // a word and the space after it
      setN(i);
      onGrow?.();
      if (i >= words.current.length) { clearInterval(iv); onDone?.(); }
    }, 45);
    return () => clearInterval(iv);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const streaming = stream && n < words.current.length && !expanded;
  return (
    <>
      {streaming ? words.current.slice(0, n).join("") : shown}
      {streaming && <span aria-hidden="true" style={{ marginLeft: 1, animation: "evaCaret .8s steps(1) infinite" }}>▍</span>}
      {!streaming && full.length > shown.length && (
        <button type="button" onClick={() => setExpanded(true)} data-testid="eva-show-more" // v329: no pin-to-bottom on expand — the reply stayed put instead of jumping to its end
          style={{ display: "block", marginTop: 0, padding: "8px 0 2px", minHeight: 32, /* v329: bigger tap area */ border: "none", background: "transparent", color: LIME, font: "700 13px 'DM Sans',sans-serif", cursor: "pointer" }}>
          Show more
        </button>
      )}
    </>
  );
}

const ago = (t) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

const META_SUBS = new Set(); // v329 review: EvaMeta lines waiting for the shared tick
let metaTimer = null;
/** "Ybex Eva · just now" + 👍 / 👎 under each Eva bubble. */
export function EvaMeta({ at, vote, onVote }) {
  // v329: "just now" stayed forever (nothing re-rendered the line) — re-check every 30 s while the age shows in
  // minutes / hours, then stop (a date doesn't change).
  // v329 review: ONE shared 30 s timer for every message (was one setInterval per message — a long chat ran
  // dozens), and a line older than a day unsubscribes on its next tick (it kept ticking until unmount).
  const [, tick] = useState(0);
  const when = at || 0;
  const live = Boolean(when) && Date.now() - when <= 86400000;
  useEffect(() => {
    if (!live) return undefined;
    const f = () => tick((n) => n + 1);
    META_SUBS.add(f);
    if (!metaTimer) metaTimer = setInterval(() => { META_SUBS.forEach((g) => g()); }, 30000);
    return () => { META_SUBS.delete(f); if (!META_SUBS.size && metaTimer) { clearInterval(metaTimer); metaTimer = null; } };
  }, [live]);
  const btn = (v, label, path) => (
    // v328: one vote per message — after the first tap the choice stays (no un-vote / re-vote spam).
    <button type="button" onClick={() => { if (!vote) onVote?.(v); }} aria-label={label} aria-pressed={vote === v} aria-disabled={vote ? "true" : undefined}
      style={{ width: 40, height: 40, margin: "-9px 0", border: "none", /* v329: 40px tap target on phones, same row height */ background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: vote ? "default" : "pointer", padding: 0 }}>
      <span style={{ width: 26, height: 22, borderRadius: 8, background: vote === v ? "rgba(198,244,50,.22)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={vote === v ? LIME : "none"} stroke={vote === v ? LIME : "rgba(255,255,255,.7)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{path}</svg>
      </span>
    </button>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 4, font: "500 11px 'DM Sans',sans-serif", color: "rgba(255,255,255,.86)" /* v329: was .62 — ~3:1 on the green, now readable */ }} data-testid="eva-meta">
      <span>Ybex Eva · {ago(at || Date.now())}</span>
      <span style={{ flex: 1 }} />
      {btn("up", "Helpful", <path d="M7 10v11M7 10l4-7a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 17.6 21H7" />)}
      {btn("down", "Not helpful", <path d="M17 14V3M17 14l-4 7a2 2 0 0 1-3-2l1-5H5a2 2 0 0 1-2-2.3l1.4-7A2 2 0 0 1 6.4 3H17" />)}
    </div>
  );
}

/** Starter boxes for the empty chat (design frames 05 / 06). Labels are English; `say` is what Eva hears. */
export const BRAND_STARTERS = [
  { title: "Find creators", sub: "Just tell me who you need", say: "Find creators" },
  { title: "New campaign", sub: "Step-by-step draft", say: "Create a new campaign" },
  { title: "UGC videos", sub: "Brief + payment hold", say: "I need UGC videos" },
  { title: "What can you do?", sub: "Compare, plan, write, check briefs…", say: "What can you do?" },
];
export const CREATOR_STARTERS = [
  { title: "Campaigns for me", sub: "Live, matching your niche", say: "Show campaigns for me" },
  { title: "When is my payout?", sub: "Check pending money", say: "When is my payout?" },
  { title: "Brand invitations", sub: "Offers brands sent you", say: "Show my brand invitations" },
  { title: "What can you do?", sub: "Profile, bio, scripts, earnings…", say: "What can you do?" },
];

export function StarterGrid({ items, onPick }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} data-testid="eva-starters">
      {items.map((s, i) => (
        <button key={s.title} type="button" onClick={() => onPick(s)} className="eva-in eva-press" data-testid={`eva-starter-${i}`}
          style={{ animationDelay: `${0.08 * i + 0.15}s`, textAlign: "left", minHeight: 76, padding: "13px 14px", borderRadius: 20, border: "1px solid rgba(255,255,255,.24)",
            background: "linear-gradient(160deg,rgba(255,255,255,.24),rgba(255,255,255,.12))", backdropFilter: "blur(24px) saturate(160%)", WebkitBackdropFilter: "blur(24px) saturate(160%)",
            color: "#fff", cursor: "pointer", display: "flex", flexDirection: "column", gap: 5, boxShadow: "inset 0 1px 0 rgba(255,255,255,.22)" }}>
          <span style={{ font: "700 14.5px/1.2 'DM Sans',sans-serif" }}>{s.title}</span>
          <span style={{ font: "500 12px/1.35 'DM Sans',sans-serif", color: "#DCFCE7" }}>{s.sub}</span>
        </button>
      ))}
    </div>
  );
}

export const DISCLAIMER = "Ybex Eva can make mistakes. Please double-check important details.";

/** Home peek lines (notes §3): short, warm, rotating. Real-data lines come first when given. */
export function peekLines(role, firstName, extra = []) {
  const hi = firstName ? `Hello ${firstName}!` : "Hello!"; // v416
  const base = role === "brand"
    ? [[hi, "hello"], ["Need creators? Just ask me", "wink"], ["Shall I draft a UGC brief? 30 sec", "excited"], ["I can plan your next campaign", "proud"], ["Anything pending? I can check", "hmm"]]
    // v372 (Ravi's video): "Psst… new campaigns are live" / "Your profile could shine more" showed to everyone, even with
    // no new campaign and a complete profile. Lines now offer help instead of claiming something that may not be true.
    : [[hi, "hello"], ["₹300 cash on a complete profile — want help?", "excited"], ["Want me to find campaigns for you?", "wink"], ["Want a fair rate check?", "hmm"], ["I can write your next script", "excited"], ["I can polish your bio", "cheeky"]];
  return [...extra, ...base].slice(0, 8);
}
