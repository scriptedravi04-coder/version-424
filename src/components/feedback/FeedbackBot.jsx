import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { EvaHiwPopup } from "../whatsNew/WhatsNewPopup"; // v439
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom"; // v328: ?assist=new must also work while Eva is already mounted
import { api, isBrandLike } from "../../lib/api";
import { ybHaptic } from "../../lib/haptics";
import { applyStatusBarColor, scrolledTopColor } from "../layout/StatusBarSync";
import { plan, chipPlan, capsPlan, budgetChipPlan, initialState, classify, detectLang, FIRST_REPLY, NEXT_REPLY, safetyReply } from "./assistBrain";
import { useAuth } from "../../contexts/AuthContext";
import { EvaFace, moodFor, StreamText, EvaMeta, StarterGrid, BRAND_STARTERS, CREATOR_STARTERS, DISCLAIMER, EVA_KEYFRAMES, peekLines } from "./evaUi";
import { EvaSettingsPanel, AttachSheet } from "./EvaPanels";
import { filterChats, syncEvaSettings, readEvaSettings } from "./evaSettings";
import { useOnline } from "../../lib/offline"; // v334
import { nativeKeyboardHeight } from "../../lib/keyboardAware"; // v396

// Session 43 (v287, Ravi): "Ybex Assist" — the feedback bot from Claude Design "Ybex Feedback Bot"
// (Turn 27, Purple theme). Peeking bot → typing bubble → haptic → circle-reveal chat.
// v293: the bot now talks — assistBrain.js understands hi / thanks / "what can you do" / bug / idea /
// "I'm confused", asks a short follow-up, and only sends real reports to the Ybex team (bug, suggestion,
// confusing and general are kept apart). Chat-only messages (hi, thanks…) are never saved.
// Reports are support_tickets with page_context /feedback-bot (backend/feedback_routes.ts) and show in
// Admin → Help desk → Chatbot, not in the Support list.
// v295 (Ravi): the big "Hi there, is there any issue?" header used to stay and take half the screen. Now, as
// the chat grows, it blurs, fades and folds away by itself (progress follows the height of the messages, so
// it never flickers and never comes back while chatting). Ybex Assist also answers questions about the app
// and plans a budget (assistKnowledge.js).
// v297 (Ravi): the whole bot is GREEN now (the design's "Green" theme) — no purple anywhere. The header sits
// below the phone's status strip (safe-area), the strip colour matches the chat, the typing bar has no lines
// behind it, and the chat can never be left half open or half cut.
// Timings, easings, sizes and colours are the design's own (see the developer notes in the design).
// Session 51 (Ravi): for BRANDS the bot is now an assistant — it finds creators (Explore's own list and
// filters), compares them, ranks applicants, shows what needs the brand, the monthly report, writes
// hooks / scripts, plans a festival budget, checks a brief, and prepares a UGC brief or a campaign that
// opens on the existing screen to pay / publish. All of it lives in components/assist/brand (loaded only
// for brands). Anything it doesn't understand still goes to the old brain below (help, budget, bug, idea).

const BALL = "radial-gradient(circle at 34% 30%,#F7FFD1 0%,#C6F24E 28%,#4CC765 62%,#178A5B 100%)"; // design default "Lime"
const TH = {
  bub: "linear-gradient(135deg,#16A34A 0%,#15803D 55%,#14532D 100%)",
  bubSh: "0 16px 30px -12px rgba(22,101,52,.7),0 0 0 1px rgba(255,255,255,.25) inset,0 0 22px -4px rgba(134,239,172,.8)",
  // Session 53 (Ravi: "theme green hi rakh pura … upar alag, keyboard ke pass alag color aisa mat karna"): ONE green
  // everywhere — the status bar, the top, the middle and the strip by the keyboard are all TH.base. The soft lime
  // and deep-green glows sit inside the screen, away from every edge, so no band of another colour shows.
  chatBg: "radial-gradient(60% 34% at 82% 22%,rgba(198,242,78,.30) 0%,rgba(198,242,78,0) 100%),radial-gradient(70% 40% at 12% 70%,rgba(8,52,22,.45) 0%,rgba(8,52,22,0) 100%),radial-gradient(50% 30% at 70% 88%,rgba(134,239,172,.16) 0%,rgba(134,239,172,0) 100%)",
  // Session 48: the "Any issue..?" bubble — light lime (the ball's own highlight colours), dark-green text.
  bubLight: "linear-gradient(135deg,#F7FFD1 0%,#E4FBB0 45%,#C6F24E 100%)",
  bubLightSh: "0 14px 28px -12px rgba(23,138,91,.55),0 0 0 1px rgba(22,101,52,.18) inset,0 0 20px -6px rgba(134,239,172,.9)",
  bubInk: "#14532D",
  glass: "rgba(255,255,255,.13)", glassSolid: "rgba(10,60,20,.45)", ink: "#0F2A14", arrow: "#1E7F1E", caret: "#D9F99D", base: "#1F7A35",
};
export const CHIPS = {
  bug: ["Report a bug", "Oh no — what happened, and on which screen?"],
  feature: ["Suggest a feature", "Love that. What should Ybex do for you?"],
  confusing: ["Something's confusing", "Tell me where you got stuck — we'll fix it."],
};
export { FIRST_REPLY, NEXT_REPLY };
export const BUBBLE_TEXT = "How can I help?"; // Session 53 (Ravi): was "Any issue..?" — Eva is a helper now
const TYPE_MS = 38;                         // design: 38 ms per letter, text starts at +1650 ms
const SPOTS = [118, 300, 480];
const HOP_MS = 25000;
const MAX_MOVES = 4;
// v378 (Ravi: "Eva baar baar jagah badalta hai, wo nahi chahiye"): Eva stays at her first spot — she still peeks and
// rotates her lines, but never hops up / down the screen.
const EVA_STAYS_PUT = true;
const PEEK_COUNT_KEY = "ybex_eva_peek_lines"; // Session 58: lines shown this session (was a one-time intro)
const PEEK_MAX = 8;
const PEEK_TYPE_MS = 36;
const HIDE_KEY = "ybex_assist_hidden";
// v297 (Ravi): the chat opens with the design's own dark-green top. On iPhone the clock is dark, so the
// strip behind it stays light lime and fades into the chat; Android picks the clock colour itself, so it
// gets the design's dark green.
// Session 53: the same green on iPhone and Android (the lime strip on iPhone was the "different colour on top").
const STATUS_TOP = TH.base;
const REVEAL_CSS = "clip-path .62s cubic-bezier(.65,0,.35,1), -webkit-clip-path .62s cubic-bezier(.65,0,.35,1)";

/** v291: where the chat sits while the keyboard is open (top + height of the visible area), else null.
 *  Measured straight from visualViewport — no stale CSS variables — so the typing bar always sits
 *  right on top of the keyboard and nothing is left empty underneath. */
function useVisibleBox(active) {
  const [box, setBox] = useState(null);
  useEffect(() => {
    if (!active || typeof window === "undefined" || !window.visualViewport) { setBox(null); return undefined; }
    const vv = window.visualViewport;
    let frame = 0;
    // v333 (Ravi: "keyboard aa raha hai lekin screen upar nahi ho rahi"): on the iPhone home-screen app the
    // page height (innerHeight) shrinks together with the keyboard, so "innerHeight − visible height" stayed
    // ~0 and the chat kept its full height under the keyboard. Compare with the tallest height seen instead.
    let fullH = Math.max(window.innerHeight || 0, vv.height || 0);
    const timers = [];
    const read = () => {
      frame = 0;
      const typing = (() => { const a = document.activeElement; return Boolean(a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !["checkbox", "radio", "button", "file"].includes(a.type)))); })();
      if (!typing) fullH = Math.max(fullH, window.innerHeight || 0, vv.height || 0);
      // Only while typing — a browser bar hiding / showing also changes the height.
      const shrunk = typing && (fullH - vv.height > 120 || window.innerHeight - vv.height > 120);
      // v396 (Samsung, Android app): edge-to-edge — the page doesn't shrink, but the app / WebView tells the keyboard height
      const nk = nativeKeyboardHeight();
      const viaNative = typing && !shrunk && nk > 80 && fullH - (window.innerHeight || 0) <= 120;
      setBox((prev) => {
        const next = viaNative ? { top: 0, height: Math.max(160, Math.round((window.innerHeight || 0) - nk)) }
          : shrunk ? { top: Math.round(vv.offsetTop), height: Math.round(vv.height) } : null;
        if (!prev && !next) return prev;
        if (prev && next && prev.top === next.top && prev.height === next.height) return prev;
        return next;
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(read); };
    // iOS reports the keyboard late — read again a few times after focus moves.
    const onFocusMove = () => { [60, 250, 500, 800].forEach((ms) => timers.push(setTimeout(schedule, ms))); };
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    window.addEventListener("focusin", onFocusMove);
    window.addEventListener("focusout", onFocusMove);
    window.addEventListener("ybex:native-kb", schedule); // v396
    read();
    return () => {
      vv.removeEventListener("resize", schedule); vv.removeEventListener("scroll", schedule);
      window.removeEventListener("focusin", onFocusMove); window.removeEventListener("focusout", onFocusMove);
      window.removeEventListener("ybex:native-kb", schedule); // v396
      timers.forEach(clearTimeout); if (frame) cancelAnimationFrame(frame);
    };
  }, [active]);
  return box;
}
const GRAIN = "url('data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27160%27%20height%3D%27160%27%3E%3Cfilter%20id%3D%27n%27%3E%3CfeTurbulence%20type%3D%27fractalNoise%27%20baseFrequency%3D%27.9%27%20numOctaves%3D%272%27%20stitchTiles%3D%27stitch%27%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%27100%25%27%20height%3D%27100%25%27%20filter%3D%27url(%23n)%27%20opacity%3D%27.55%27%2F%3E%3C%2Fsvg%3E')";

/** Phone details the team needs to reproduce a bug (no personal data). */
export function deviceInfo(nav = typeof navigator !== "undefined" ? navigator : {}) {
  const ua = String(nav.userAgent || "");
  let os = "", device_model = "";
  const and = ua.match(/Android\s([\d.]+);\s*([^;)]+)/i);
  if (and) { os = `Android ${and[1]}`; device_model = and[2].replace(/\sBuild.*$/, "").trim(); }
  const ios = ua.match(/(iPhone|iPad).*?OS\s([\d_]+)/i);
  if (ios) { os = `iOS ${ios[2].replace(/_/g, ".")}`; device_model = ios[1]; }
  if (!os) os = /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : "Other";
  return { os, device_model };
}

const sess = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } },
};
// Something full-screen is open (push ask, What's New, Terms, cropper, promo…) → the bot waits.
const busyScreen = () => {
  if (typeof document === "undefined") return false;
  if (window.__ybFullScreenAsk) return true;
  if (document.getElementById("yb-splash")) return true;
  return Boolean(document.querySelector('[aria-modal="true"],[data-testid="logo-cropper"],[data-popup-open="true"]'));
};

// v417 (Eva covered amounts / buttons / sticky bars bottom-right): the height of any bar pinned to the bottom of the
// screen (sticky footer, "Pay" / "Send" action bar, the phone bottom nav). Eva sits above it and her greeting line
// is skipped while such a bar is on screen. Only fixed / sticky elements are checked (cheap; read every 1.2 s).
export function bottomBarHeight(doc = typeof document !== "undefined" ? document : null, win = typeof window !== "undefined" ? window : null) {
  if (!doc || !win) return 0;
  const vh = win.innerHeight || 0;
  if (!vh) return 0;
  let maxH = 0;
  const nodes = doc.querySelectorAll('[class*="fixed"],[class*="sticky"],[style*="fixed"],[style*="sticky"],nav,footer,[data-sticky-footer],[data-bottom-actions]');
  for (const el of nodes) {
    if (el.closest && el.closest("[data-eva-root],[data-sonner-toaster],[aria-modal=\"true\"]")) continue;
    let cs;
    try { cs = win.getComputedStyle(el); } catch { continue; }
    if (!cs || (cs.position !== "fixed" && cs.position !== "sticky")) continue;
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0 || cs.pointerEvents === "none") continue;
    const r = el.getBoundingClientRect();
    if (!r || r.width < 200 || r.height <= 0) continue;
    if (r.height > vh * 0.4) continue; // full-screen layers / side panels aren't bars
    if (r.bottom < vh - 4 || r.top < vh * 0.5) continue; // must sit on the bottom edge
    maxH = Math.max(maxH, Math.round(vh - r.top));
  }
  return maxH;
}
function useBottomBar(active) {
  const [h, setH] = useState(0);
  const { pathname } = useLocation();
  useEffect(() => {
    if (!active || typeof window === "undefined") { setH(0); return undefined; }
    const read = () => setH((prev) => { const next = bottomBarHeight(); return prev === next ? prev : next; });
    read();
    const iv = setInterval(read, 1200);
    window.addEventListener("resize", read);
    return () => { clearInterval(iv); window.removeEventListener("resize", read); };
  }, [active, pathname]);
  return h;
}

// Session 58 (Eva design handoff): the face has 8 moods now (evaUi.jsx). Colour never changes.
function Face({ size = 26, mood = "hello" }) {
  return <EvaFace size={size} mood={mood} />;
}
const Dots = ({ color, gap = 4, pad }) => (
  <div style={{ display: "flex", gap, padding: pad }}>
    {[0, 0.15, 0.3].map((d) => <div key={d} style={{ width: 6, height: 6, borderRadius: 3, background: color, animation: `ybDot 1s ${d}s infinite` }} />)}
  </div>
);

// Session 53 (Ravi): Eva's opening question "How can I help?" shows what she can do as small chips.
const BRAND_CHIPS = [
  // v328: values are English so an English user isn't answered in Hinglish (same intents as before).
  ["Find creators", "Find creators"],
  ["Create campaign", "Create a campaign"],
  ["Create UGC", "I need UGC videos"],
  ["Monthly report", "Show this month's report"],
  ["What needs me?", "What's pending?"],
  ["Write a script", "Write a hook and script"],
];
// Session 54: Eva for creators — what she can do, as the opening chips. "Report a bug" still goes to the team.
const CREATOR_CHIPS = [
  // v328: English values (same intents as the old Hinglish ones).
  ["Find campaigns", "Show campaigns for me"],
  ["Write a script", "Write a hook and script"],
  ["Improve my profile", "Check my profile"],
  ["My earnings", "Show my earnings"],
  ["What brands want", "What's in demand with brands?"],
  ["Growth ideas", "Give me content ideas"],
  ["Report a bug", "__bug__"],
];
const EVA = "Eva"; // Ybex's assistant (Session 53, Ravi: "Ybex ki AI ka name Eva")

// v435: kinds of message the old brain answers itself (never replaced by "I didn't quite get that").
const ANSWERED_TYPES = new Set(["greeting", "how", "who", "caps", "thanks", "bye", "done", "botinfo", "human", "langq", "sorry", "praise", "ack", "train", "otherlang"]);

// v435 (Eva question test #1): a card or Eva herself failing to draw must never turn the whole page into the error screen.
export class EvaBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { try { console.error("[Eva] part of the chat failed to show:", error?.message || error); } catch { /* ignore */ } }
  componentDidUpdate(prev) { if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false }); }
  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return <div data-testid="eva-card-failed" className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] text-slate-500">Couldn't show this here. Ask me again and I'll try once more.</div>;
  }
}

export default function FeedbackBot(props) {
  return <EvaBoundary fallback={null}><FeedbackBotInner {...props} /></EvaBoundary>;
}

function FeedbackBotInner({ role: roleProp = "creator", screen = "dashboard", desktop = false }) {
  // v418: agency users and brand team members get the brand Eva (and their saved chats), not the creator one.
  const role = isBrandLike(roleProp) ? "brand" : roleProp;
  const [hidden, setHidden] = useState(() => sess.get(HIDE_KEY) === "1");
  // Session 51: the brand assistant (loaded on demand, brands only).
  const auth = useAuth() || {};
  const { search: locSearch } = useLocation(); // v328: re-check ?assist=new when the URL changes
  const isBrand = role === "brand";
  // Session 54: creators get Eva too (src/components/assist/creator) — same chat, their own brain and cards.
  const usesEva = role === "brand" || role === "creator";
  const [brandMod, setBrandMod] = useState(null);
  const [evaLoadFailed, setEvaLoadFailed] = useState(false); // v438
  const evaQueueRef = useRef([]); // v438: messages typed before Eva loaded — sent once she is ready
  const brandStateRef = useRef(null);
  const brandOpenedRef = useRef(false);
  // Session 53: Eva keeps several chats (brands). The menu (☰) lists them; "New chat" starts a fresh one.
  const chatIdRef = useRef(null);
  const [menu, setMenu] = useState(false);
  const [chatList, setChatList] = useState(null); // null = loading / not loaded
  const [inviteList, setInviteList] = useState(null);
  // Session 58 (Eva handoff part 4): Eva settings / 📎 sheet over the chat, history search, desktop panel.
  const [panel, setPanel] = useState(null); // null | "settings" | "attach"
  const [chatQuery, setChatQuery] = useState("");
  const [winW, setWinW] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 390));
  useEffect(() => {
    if (!desktop) return undefined;
    const on = () => setWinW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [desktop]);
  const docked = desktop && winW >= 1100; // ≥1100: docked glass panel; 768–1099: full-height drawer
  useEffect(() => {
    if (!usesEva) return undefined;
    let alive = true;
    // v438 (Eva deep test #1): until Eva's brain arrived, every message went to the old feedback bot and became a
    // ticket — and a failed load (old file after a deploy, weak network) did that for the whole visit. Now: one retry,
    // a stale build reloads the app, and messages typed meanwhile wait for Eva (see evaQueueRef).
    const get = () => (role === "brand" ? import("../assist/brand") : import("../assist/creator"));
    const ok = (m) => { if (alive) { brandStateRef.current = m.initialAssistState(); setEvaLoadFailed(false); setBrandMod(m); } };
    get().then(ok).catch(() => new Promise((r) => setTimeout(r, 1500)).then(get).then(ok)).catch((e) => {
      if (!alive) return;
      setEvaLoadFailed(true);
      import("../../lib/staleBuild").then((sb) => { if (sb.isChunkLoadError?.(e)) sb.recoverFromStaleBuild?.(); }).catch(() => {});
    });
    return () => { alive = false; };
  }, [usesEva, role]);
  const [stage, setStage] = useState(0);      // 0 = tucked off-screen, 1 = peeking
  const [bubble, setBubble] = useState(false);
  const [typed, setTyped] = useState(-1);     // -1 = typing dots, 0..n = letters of BUBBLE_TEXT shown
  const [spot, setSpot] = useState(0);
  const [press, setPress] = useState(false);
  const [chat, setChat] = useState(false);
  // v419 (QA): the chat lived only in this component — a home refresh, going back online or opening a link from an
  // answer remounted it and wiped the open chat. Keep the open chat for this tab (sessionStorage, 6 h).
  const sessKey = `yb_eva_sess_${role}_${auth?.user?.user_id || "anon"}`; // v419 (M6): per account
  const [msgs, setMsgs] = useState(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(sessKey) || "null");
      if (s && Date.now() - Number(s.at) < 6 * 3600e3 && Array.isArray(s.msgs)) {
        if (s.chatId) chatIdRef.current = s.chatId;
        return s.msgs.filter((m) => m && m.status !== "sending");
      }
    } catch { /* storage blocked */ }
    return [];
  });
  const msgsNow = useRef(msgs); msgsNow.current = msgs; // v431: tr() reads the latest user line
  useEffect(() => {
    try { sessionStorage.setItem(sessKey, JSON.stringify({ at: Date.now(), chatId: chatIdRef.current, msgs: msgs.slice(-60) })); } catch { /* full / blocked */ }
  }, [msgs, sessKey]);       // { id, user, text, status: "sending"|"sent"|"failed", payload }
  const [botTyping, setBotTyping] = useState(false);
  const [fold, setFold] = useState(0);         // 0 = header fully shown … 1 = folded away (grows with the chat, never shrinks)
  const [headH, setHeadH] = useState(0);
  const foldRef = useRef(0);
  const headRef = useRef(null);
  const [input, setInput] = useState("");
  const [attach, setAttach] = useState(null); // { url, name } | { uploading: true }
  const ticketRef = useRef(null);
  const brainRef = useRef({ ...initialState(), role });   // the conversation state (assistBrain.js)
  const queueRef = useRef(Promise.resolve()); // messages are saved one after another (a follow-up needs the ticket id)
  const movesRef = useRef(0);
  const lastTouch = useRef(0);
  const listRef = useRef(null);
  const fileRef = useRef(null);
  const swipe = useRef(null);
  const timers = useRef([]);
  // v329: a fired timer leaves the list (the peek poll re-schedules every 3 s while the chat is open — the list grew forever).
  const later = (fn, ms) => { const t = setTimeout(() => { timers.current = timers.current.filter((x) => x !== t); fn(); }, ms); timers.current.push(t); return t; };
  // v417: bars pinned to the bottom (sticky footer / action bar) → Eva sits above them, and no greeting line on such pages
  const barH = useBottomBar(!hidden);
  const barRef = useRef(0);
  barRef.current = barH;

  // Session 58 (Eva handoff §3): Eva peeks from the right edge and her bubble ROTATES short lines — about
  // every 5 s the bubble hides, she changes mood (a small squash), types dots, then the next line letter by
  // letter (~36 ms) and holds ~3 s. Every 3rd line she moves to another spot (max 4 moves). At most 8 lines a
  // session; never while a full-screen popup or the chat is open.
  const [peek, setPeek] = useState({ text: BUBBLE_TEXT, mood: "hello", tick: 0 });
  const chatOpenRef = useRef(false);
  // v416: a brand account's "name" is the company ("Chai Point…" → "Hello Chai!") — greet the person (contact name) or just "Hello!".
  const peekName = isBrand
    ? String(auth?.user?.representative_name || auth?.user?.poc_name || auth?.user?.contact_name || "").trim().split(/\s+/)[0] || ""
    : String(auth?.user?.name || auth?.user?.company_name || "").trim().split(/\s+/)[0] || "";
  useEffect(() => {
    if (hidden) return undefined;
    let cancelled = false;
    const lines = peekLines(role, peekName);
    let idx = 0;
    const showLine = (first) => {
      if (cancelled) return;
      if (chatOpenRef.current || busyScreen() || (typeof document !== "undefined" && document.hidden)) { later(() => showLine(first), 3000); return; }
      // v417: a page with bottom actions / a sticky footer gets the launcher only (the line covered amounts and buttons)
      if (desktop ? barRef.current > 0 : barRef.current > 110) { later(() => showLine(first), 4000); return; }
      const count = Number(sess.get(PEEK_COUNT_KEY) || 0);
      if (count >= PEEK_MAX) return;
      sess.set(PEEK_COUNT_KEY, String(count + 1));
      const [text, mood] = lines[idx % lines.length];
      idx += 1;
      const go = () => {
        if (cancelled || chatOpenRef.current) return;
        setPeek((p) => ({ text, mood, tick: p.tick + 1 }));
        setTyped(-1); setBubble(true);
        const startTyping = first ? 1650 : 900;
        const typeLine = () => {
          let i = 0; setTyped(0);
          const iv = setInterval(() => { i += 1; setTyped(i); if (i >= text.length) clearInterval(iv); }, PEEK_TYPE_MS);
          timers.current.push(iv);
        };
        // the first line starts at +1650 ms (dots first, design timing); later lines after ~0.9 s
        if (first) later(() => { typeLine(); }, 1650);
        else later(() => { typeLine(); }, 900);
        // v417: the line shrinks back to the launcher after 4 s (it held ~3 s after typing and covered the page)
        const shownFor = Math.max(4000, startTyping + text.length * PEEK_TYPE_MS + 1000);
        later(() => setBubble(false), shownFor);
        later(() => showLine(false), shownFor + 2000);
      };
      const move = !EVA_STAYS_PUT && !first && idx > 1 && (idx - 1) % 3 === 0 && movesRef.current < MAX_MOVES;
      if (move) {
        movesRef.current += 1;
        setStage(0);
        later(() => setSpot((sp) => (sp + 1) % SPOTS.length), 600);
        later(() => { setStage(1); later(go, 500); }, 750);
      } else go();
    };
    const start = () => {
      if (cancelled) return;
      if (busyScreen()) { later(start, 1000); return; }
      setStage(1);
      later(() => showLine(true), 650);
    };
    later(start, 700);
    return () => { cancelled = true; timers.current.forEach((t) => { clearTimeout(t); clearInterval(t); }); timers.current = []; };
  }, [hidden]); // eslint-disable-line react-hooks/exhaustive-deps

  // v416 (Eva bubble covered the cards being read on the phone): the line hides as soon as the person scrolls.
  useEffect(() => {
    if (!bubble || desktop) return undefined;
    const hide = () => setBubble(false);
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", hide, { capture: true });
  }, [bubble, desktop]);

  // Every ~25 s: tuck in, peek again at the next spot. Never while the person is scrolling /
  // tapping, while the bubble or chat is open, or after 4 moves.
  useEffect(() => {
    const mark = () => { lastTouch.current = Date.now(); };
    window.addEventListener("touchstart", mark, { passive: true });
    window.addEventListener("scroll", mark, { passive: true, capture: true });
    const iv = setInterval(() => {
      if (EVA_STAYS_PUT || hidden || chat || bubble || press || !stage || movesRef.current >= MAX_MOVES) return;
      if (Date.now() - lastTouch.current < 4000 || document.hidden || busyScreen()) return;
      movesRef.current += 1;
      setStage(0);
      later(() => setSpot((s) => (s + 1) % SPOTS.length), 600);
      later(() => setStage(1), 750);
    }, HOP_MS);
    return () => { clearInterval(iv); window.removeEventListener("touchstart", mark); window.removeEventListener("scroll", mark, { capture: true }); };
  }, [hidden, chat, bubble, press, stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // v329: follow new messages only while the user is at the bottom (or just sent something) — scrolling up to
  // read while Eva answers / streams no longer yanks the list back down.
  const atBottomRef = useRef(true);
  const onListScroll = () => { const el = listRef.current; if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; };
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (atBottomRef.current || msgs[msgs.length - 1]?.user) { el.scrollTop = el.scrollHeight; atBottomRef.current = true; }
  }, [msgs, botTyping]);

  // v295: measure the header once, and let it fold away as the messages take more room. The progress only
  // depends on the messages' own height (not on the header), so folding can never feed back into itself.
  useLayoutEffect(() => {
    if (!chat) return;
    if (headRef.current && foldRef.current === 0) { const h = headRef.current.offsetHeight; if (h > 0 && h !== headH) setHeadH(h); }
    const el = listRef.current;
    if (!el || (msgs.length === 0 && !botTyping)) return;
    let h = 0;
    for (let i = 0; i < el.children.length; i += 1) h += el.children[i].offsetHeight;
    h += 12 * Math.max(0, el.children.length - 1);
    // Session 53: folds away sooner — after the first question + answer the header is gone and "Ybex Eva" sits on top.
    const p = Math.max(0, Math.min(1, (h - 10) / 140));
    if (p > foldRef.current + 0.01 || (p >= 0.995 && foldRef.current < 1)) { foldRef.current = p >= 0.995 ? 1 : p; setFold(foldRef.current); }
  }, [msgs, botTyping, chat]); // eslint-disable-line react-hooks/exhaustive-deps

  const [chatAnimDone, setChatAnimDone] = useState(false);
  const chatRef = useRef(null);
  // v329: the greeting + starter boxes mount with the page (hidden), so their blur-in ran unseen before the
  // first open and never on later opens — they re-mount on every open so the design's pop-in is actually seen.
  const [openN, setOpenN] = useState(0);
  const openTok = useRef(0); // bumps on every open / close so a late timer from an old open does nothing
  const box = useVisibleBox(chat && chatAnimDone && !desktop);

  useEffect(() => { chatOpenRef.current = chat; }, [chat]);
  useEffect(() => {
    if (chat && !desktop) { // desktop: the page stays usable beside the panel
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      applyStatusBarColor(STATUS_TOP);
      return () => {
        document.body.style.overflow = prev;
        try {
          const c = scrolledTopColor();
          if (c) applyStatusBarColor(c);
        } catch { /* noop */ }
      };
    }
  }, [chat]);

  // v386 (Ravi 30 Oct: "Eva ko overlap karo, aage ke page ko shrink mat karo"): the docked panel floats OVER the page.
  // v329 used to make room for the panel by squeezing the page (right padding), which squeezed the dashboard cards every time Eva opened.
  // v329: desktop — focus goes to the input when Eva opens (never on phones: it would pop the keyboard) and back
  // to where it was when she closes.
  const inputRef = useRef(null);
  const returnFocusRef = useRef(null);
  useEffect(() => {
    if (!desktop || typeof document === "undefined") return undefined;
    if (chat) {
      returnFocusRef.current = document.activeElement;
      const t = setTimeout(() => { try { inputRef.current?.focus({ preventScroll: true }); } catch { /* noop */ } }, 380);
      return () => clearTimeout(t);
    }
    const el = returnFocusRef.current;
    returnFocusRef.current = null;
    if (el && el !== document.body && el.isConnected && typeof el.focus === "function") { try { el.focus({ preventScroll: true }); } catch { /* noop */ } }
    return undefined;
  }, [chat, desktop]);
  // v329: Escape closes the top layer (settings / 📎 sheet / ☰ drawer), then Eva — like phone Back.
  const escRef = useRef(null);
  useEffect(() => {
    if (!chat || typeof window === "undefined") return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !e.defaultPrevented) escRef.current?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chat]);

  // Session 58: a screen opened from an Eva "Fix" button brings Eva back when you return.
  const openRef = useRef(null);
  useEffect(() => {
    const h = () => { try { openRef.current?.(); } catch (e) { console.warn("[Eva] reopen:", e); } };
    window.addEventListener("ybex:open-eva", h);
    return () => window.removeEventListener("ybex:open-eva", h);
  }, []);
  const open = () => {
    if (chat || press) return;
    ybHaptic("open");
    setPress(true);
    const tok = ++openTok.current;
    later(() => {
      if (openTok.current !== tok) return;
      setChat(true);
      setOpenN((n) => n + 1); // v329
      setPress(false);
      setBubble(false);
      later(() => { if (openTok.current === tok) setChatAnimDone(true); }, 650);
      // v291 (Ravi: "sometimes it stops halfway"): if the phone drops frames while the circle opens,
      // never leave it half open — after 900 ms the chat is forced fully open.
      later(() => {
        if (openTok.current !== tok) return;
        setChatAnimDone(true);
        const el = chatRef.current;
        if (el) { el.style.clipPath = "none"; el.style.webkitClipPath = "none"; }
      }, 900);
    }, 170);
  };
  // Session 51: the first time a brand opens the chat — what needs them now, new creators in their saved
  // searches, and quick buttons.
  // Session 58 (Eva handoff frames 05/06): the chat opens EMPTY — greeting + 2×2 starter boxes. Earlier chats
  // live in ☰ Chats (tap to reopen). Today's updates (what needs you, new creators in saved searches…) wait
  // behind an "N updates for you" button instead of filling the chat; the "new creators" notification
  // (?assist=new) still shows them straight away.
  const [news, setNews] = useState([]);
  const showNewsRef = useRef(false);
  const postNews = (list) => {
    const now = Date.now();
    atBottomRef.current = true; // v329: the user tapped "N updates" — show them
    setMsgs((m) => [...m, ...list.map((x, i) => ({ id: now + i, at: now, user: false, text: x.reply, card: x.card }))]);
    setNews([]);
    for (const x of list) if (x.seen && brandMod?.markSeenServer) brandMod.markSeenServer(x.seen.id, x.seen.ids); // Session 58: seen only when shown
  };
  useEffect(() => {
    if (!chat || !usesEva || !brandMod || brandOpenedRef.current) return;
    brandOpenedRef.current = true;
    let alive = true;
    (async () => {
      await syncEvaSettings(); // Session 58: the user's Eva settings from the server before Eva reads anything
      const list = await brandMod.onOpen().catch(() => []);
      if (!alive) return;
      if (!chatIdRef.current && brandMod.newChatId) chatIdRef.current = brandMod.newChatId();
      const items = Array.isArray(list) ? list.filter((x) => x && x.reply) : [];
      if (showNewsRef.current && items.length) postNews(items);
      else setNews(items);
    })();
    return () => { alive = false; };
  }, [chat, usesEva, brandMod]); // eslint-disable-line react-hooks/exhaustive-deps

  // Session 52: the "new creators" phone notification opens brand home with ?assist=new → open the chat.
  useEffect(() => {
    if (!usesEva || !brandMod || typeof window === "undefined") return undefined;
    let q;
    try { q = new URLSearchParams(window.location.search); } catch { return undefined; }
    if (q.get("assist") !== "new") return undefined;
    try { q.delete("assist"); const rest = q.toString(); window.history.replaceState(window.history.state, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash); } catch { /* noop */ }
    if (hidden) { setHidden(false); sess.set(HIDE_KEY, "0"); }
    showNewsRef.current = true;
    brandOpenedRef.current = false; // v328: load the updates again even if Eva was opened before
    const t = setTimeout(() => open(), 700);
    return () => clearTimeout(t);
  }, [usesEva, brandMod, locSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = (fromPop) => {
    openTok.current += 1;
    setChatAnimDone(false);
    setChat(false);
    setBubble(false);
    setPanel(null); setMenu(false); // v328: reopening starts on the chat, not on settings / 📎 sheet / ☰ drawer
    // v328: drop our Back entry — but later, and only if it is still on top: a card that calls close() and then
    // navigate() has pushed the router's page over it by then, so we must not go back.
    if (fromPop !== true && histRef.current) {
      setTimeout(() => {
        if (!histRef.current) return;
        histRef.current = false;
        try { if (window.history.state?.eva) window.history.back(); } catch { /* noop */ }
      }, 0);
    }
  };
  // v328: phone / browser Back closes Eva's top layer (settings / 📎 sheet / ☰ drawer), then the chat. While the
  // phone chat is open one same-URL entry {eva:1} sits on top of the history; histRef = it is still ours on top.
  const histRef = useRef(false);
  const popRef = useRef(null);
  popRef.current = () => {
    if (panel) { setPanel(null); return true; }
    if (menu) { setMenu(false); return true; }
    close(true);
    return false;
  };
  useEffect(() => {
    if (!chat || desktop || typeof window === "undefined") return undefined; // desktop: the page beside the panel keeps Back
    const push = () => { try { window.history.pushState({ ...(window.history.state || {}), eva: 1 }, ""); histRef.current = true; } catch { /* noop */ } };
    if (!histRef.current) push();
    const onPop = () => {
      if (!histRef.current) return;
      if (window.history.state?.eva) return; // came back onto our entry from a page above it
      histRef.current = false;
      if (popRef.current?.()) push(); // a layer closed and the chat stays open → keep an entry for the next Back
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [chat, desktop]);

  // The bot "types" for a moment (longer for longer answers), then answers.
  // v328: a reply scheduled for one chat never lands in another (new chat / opened an old one meanwhile).
  const chatGenRef = useRef(0);
  // v431 (Eva audit #10): small system lines follow the language the person writes in.
  const tr = (en, hi) => {
    let set = "en"; try { set = readEvaSettings().lang; } catch { /* default */ }
    if (set === "hi" || set === "hinglish") return hi;
    const lastUser = [...(msgsNow.current || [])].reverse().find((m) => m.user && m.text);
    return (lastUser ? detectLang(lastUser.text) : brainRef.current?.lang) === "hi" ? hi : en;
  };
  const reply = (text) => {
    setBotTyping(true);
    const gen = chatGenRef.current, cid = chatIdRef.current;
    later(() => {
      // v328 review: a null id that gets its first id meanwhile (onOpen / first send) is the SAME chat — don't drop
      // the reply then (it also left the typing dots on forever). New chat / old chat / clear all bump the gen.
      if (chatGenRef.current !== gen || (cid && chatIdRef.current !== cid)) return;
      setBotTyping(false); setMsgs((m) => [...m, { id: Date.now() + Math.random(), user: false, text }]);
    }, Math.min(1500, 650 + String(text).length * 6));
  };
  const chip = (k) => {
    setMsgs((m) => [...m, { id: Date.now(), user: true, text: CHIPS[k][0] }]);
    const p = chipPlan(k, brainRef.current);
    brainRef.current = p.next;
    reply(p.reply);
  };
  const budgetChip = () => {
    setMsgs((m) => [...m, { id: Date.now(), user: true, text: "Plan my budget" }]);
    const p = budgetChipPlan(brainRef.current);
    brainRef.current = p.next;
    reply(p.reply);
  };
  const capsChip = () => {
    setMsgs((m) => [...m, { id: Date.now(), user: true, text: "What can you do?" }]);
    const p = capsPlan(brainRef.current);
    brainRef.current = p.next;
    reply(p.reply);
  };

  const post = useCallback((id, payload, fresh) => {
    setMsgs((m) => m.map((x) => (x.id === id ? { ...x, status: "sending" } : x)));
    const job = async () => {
      try {
        // A new kind of report (a bug after an idea…) starts its own ticket so the admin boxes stay clean.
        const { data } = await api.post("feedback", { ...payload, ticket_id: fresh ? null : ticketRef.current });
        if (data?.ticket_id) ticketRef.current = data.ticket_id;
        setMsgs((m) => m.map((x) => (x.id === id ? { ...x, status: "sent" } : x)));
      } catch {
        setMsgs((m) => m.map((x) => (x.id === id ? { ...x, status: "failed" } : x)));
      }
    };
    queueRef.current = queueRef.current.then(job, job);
  }, []);

  // The old brain: help, budget, bug / idea reports (unchanged). `id` = an already shown user message.
  const runOldBrain = (t, id = null, fromEva = false) => {
    let p = plan(t, brainRef.current, { role: isBrand ? "brand" : "creator", askFirst: fromEva && !attach?.url && brainRef.current?.awaiting !== "detail" });
    // Session 58: a message Eva didn't understand is not a report — it used to be filed as a "general" ticket
    // (admin inbox noise). Real bugs / ideas / questions and anything with a screenshot still go to the team.
    // v419 (QA): once a report was open, every unclear 3+ word message (a search, a how-to, even abuse) was "added to
    // your report". From Eva only a clear bug / idea / question (or an answer to Eva's own "tell me more") goes in.
    // v435 (Eva question test #2/#3): the old brain DOES answer greetings, thanks, bye, praise, "who are you", Ybex FAQs —
    // those answers are kept now; only a message it had nothing for gets "I didn't quite get that".
    const answeredHere = ANSWERED_TYPES.has(classify(t).type) || (p.next?.kbN || 0) > (brainRef.current?.kbN || 0) || p.next?.awaiting === "budget" || Boolean(p.next?.pendingTicket) || Boolean(p.next?.handled);
    const evaUnclear = fromEva && !attach?.url && brainRef.current?.awaiting !== "detail" && !answeredHere && !p.send;
    if (evaUnclear || (fromEva && p.send && p.send.category === "general" && !attach?.url)) {
      const hi = detectLang(t) === "hi";
      // v328: creators get their own line (they don't look for creators or make campaigns).
      const msg = isBrand
        ? (hi ? "Ye mujhe samajh nahi aaya. Creators dhoondhna, campaign, UGC ya pending kaam ke baare mein poochho — ya kuch kharab ho to batao, team tak pahuncha dungi."
          : "I didn't quite get that. Ask me about creators, campaigns, UGC or what's pending — or tell me if something is broken and I'll pass it to the team.")
        : (hi ? "Ye mujhe samajh nahi aaya. Tumhare liye campaigns, brand invites, payouts, profile ya script idea ke baare mein poochho — ya kuch kharab ho to batao, team tak pahuncha dungi."
          : "I didn't quite get that. Ask me about campaigns for you, brand invites, your payouts, your profile or a script idea — or tell me if something is broken and I'll pass it to the team.");
      // v438 (Eva deep test #3): the daily AI replies ran out → say so plainly instead of a vague "didn't get that".
      const capped = typeof window !== "undefined" && window.__ybEvaAiLimit && Date.now() - window.__ybEvaAiLimit < 12 * 3600e3;
      const capMsg = hi ? "Aaj ke mere AI jawab khatam ho gaye — kal phir poochna. Tab tak campaigns, payouts, KYC, fees ya profile ke baare mein poochho, ye main abhi bhi bata sakti hoon." : "My AI replies are used up for today — ask again tomorrow. Meanwhile I can still help with campaigns, payouts, KYC, fees and your profile.";
      p = { reply: capped ? capMsg : msg, send: null, next: { ...brainRef.current, lang: hi ? "hi" : "en" } };
    }
    // A screenshot must never be lost: chatting with an attachment counts as a report.
    if (!p.send && attach?.url) {
      const kind = p.next.ticketKind || "general";
      p = { reply: p.next.ticketKind ? NEXT_REPLY : FIRST_REPLY, send: { category: kind, message: t, newTicket: !p.next.ticketKind }, next: { ...p.next, awaiting: "followup", ticketKind: kind, sent: p.next.sent + 1 } };
    }
    brainRef.current = p.next;
    // v419 (QA): answers from this fallback brain were never kept in the chat history (☰ missed whole chats).
    if (fromEva && !p.send && p.reply && brandMod?.saveTurn && chatIdRef.current) { try { brandMod.saveTurn(chatIdRef.current, t, p.reply); } catch { /* best effort */ } }
    const mid = id || Date.now() + Math.random();
    if (p.send) {
      const payload = { category: p.send.category, message: `${p.send.prefix || ""}${p.send.message}`, attachments: attach?.url ? [attach.url] : [], screen, app_version: APP_VERSION, ...deviceInfo() };
      const row = { id: mid, user: true, text: t, image: attach?.url || "", payload, fresh: Boolean(p.send.newTicket), status: "sending" };
      setMsgs((m) => (id ? m.map((x) => (x.id === id ? row : x)) : [...m, row]));
      post(mid, payload, Boolean(p.send.newTicket));
    } else if (!id) {
      setMsgs((m) => [...m, { id: mid, user: true, text: t }]); // just chatting — nothing is saved
    }
    // v328: as Eva's fallback (`id` set) the input was already cleared before the wait — don't wipe what the
    // user typed / attached meanwhile; only an attachment that went into this report is cleared.
    if (!id) { setInput(""); setAttach(null); } else if (p.send && attach?.url) setAttach(null);
    reply(p.reply);
  };

  // Session 51: a brand's message goes to the brand assistant first; null → the old brain.
  // Session 58: `shown` = what the user's bubble says (a button's label); `t` = what Eva hears (its value).
  const busyRef = useRef(0); // v328: Eva is thinking → new sends wait (no two handleAssistMessage runs at once)
  const offlineQueueRef = useRef([]); // v438
  const sendBrand = async (t, shown = t) => {
    // v438 (Eva deep test #8): offline → say so, and answer the moment the phone is back online.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const now = Date.now();
      offlineQueueRef.current.push([t, shown]);
      setInput("");
      setMsgs((m) => [...m, { id: now, user: true, text: shown }, { id: now + 1, user: false, text: tr("You're offline — I'll answer as soon as you're back online.", "Aap offline ho — internet aate hi jawab dungi.") }]);
      return;
    }
    if (busyRef.current) return;
    const tok = Date.now() + Math.random();
    busyRef.current = tok;
    try { await sendBrandNow(t, shown); } finally { if (busyRef.current === tok) busyRef.current = 0; }
  };
  const sendBrandNow = async (t, shown) => {
    const id = Date.now() + Math.random();
    setMsgs((m) => [...m, { id, user: true, text: shown }]);
    setInput("");
    // v419 (Ravi: "ok hatao"): no 30-a-day cap on the phone any more — answers without AI cost nothing, and the
    // server already limits the AI calls itself (askAi gets LIMIT → Eva answers from her own rules instead).
    setBotTyping(true);
    let r = null;
    let startChat = null;
    try {
      const history = msgs.slice(-8).map((x) => ({ user: Boolean(x.user), text: x.text || "" }));
      const brandName = auth?.user?.company_name || auth?.user?.brand_name || auth?.user?.name || "";
      if (!chatIdRef.current && brandMod.newChatId) chatIdRef.current = brandMod.newChatId();
      startChat = chatIdRef.current;
      r = await brandMod.handleAssistMessage(t, brandStateRef.current, { history, brandName, name: brandName, chatId: chatIdRef.current });
    } catch { r = null; }
    // Session 58: the person switched / started another chat while Eva was thinking → drop this late reply
    // (it used to land in, and be saved to, the wrong chat).
    if (startChat && chatIdRef.current !== startChat) return;
    setBotTyping(false);
    if (r && r.reply) {
      brandStateRef.current = r.state || brandStateRef.current;
      const row = { id: Date.now() + Math.random(), user: false, text: r.reply, card: r.card };
      if (r.newChat) { newChat(); setMsgs([row]); return; } // Session 58: "new chat" keeps the old chat in the menu
      if (r.clearScreen) { setMsgs([row]); return; }
      // v435: several requests in one message → one answer each, in order.
      const extra = Array.isArray(r.more) ? r.more.filter((x) => x && x.reply).map((x, i) => ({ id: Date.now() + Math.random() + i + 1, user: false, text: x.reply, card: x.card })) : [];
      setMsgs((m) => [...m, row, ...extra]);
      if (brandMod.saveTurn) brandMod.saveTurn(chatIdRef.current, t, [r.reply, ...extra.map((x) => x.text)].join("\n\n"), extra.length ? extra[extra.length - 1].card : r.card); // Session 52/53: kept in this chat (text + card type only)
      return;
    }
    runOldBrain(t, id, true);
  };
  useEffect(() => {
    const back = async () => {
      const q = offlineQueueRef.current.splice(0);
      for (const [t] of q) { if (brandMod) { setBotTyping(true); try { const r = await brandMod.handleAssistMessage(t, brandStateRef.current, { history: [], chatId: chatIdRef.current }); setBotTyping(false); if (r?.reply) { brandStateRef.current = r.state || brandStateRef.current; setMsgs((m) => [...m, { id: Date.now() + Math.random(), user: false, text: r.reply, card: r.card }]); } } catch { setBotTyping(false); } } }
    };
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, [brandMod]);
  // v438: Eva still loading → the message waits (typing dots) and goes to her the moment she is ready. If she can't
  // load at all, the old brain answers it as Eva's fallback (FAQ / small talk, never a ticket).
  const evaNotReady = (t, shown) => {
    if (evaLoadFailed) { const id = Date.now() + Math.random(); setMsgs((m) => [...m, { id, user: true, text: shown }]); runOldBrain(t, id, true); return; }
    evaQueueRef.current.push([t, shown]);
    setBotTyping(true);
  };
  useEffect(() => {
    if (!evaQueueRef.current.length) return;
    if (brandMod) {
      const q = evaQueueRef.current.splice(0);
      setBotTyping(false);
      (async () => { for (const [t, shown] of q) { await sendBrand(t, shown); } })();
    } else if (evaLoadFailed) {
      const q = evaQueueRef.current.splice(0);
      setBotTyping(false);
      for (const [t, shown] of q) { const id = Date.now() + Math.random(); setMsgs((m) => [...m, { id, user: true, text: shown }]); runOldBrain(t, id, true); }
    }
  }, [brandMod, evaLoadFailed]); // eslint-disable-line react-hooks/exhaustive-deps
  const say = (text, shown) => { const t = String(text || "").trim(); if (!t) return false; if (usesEva && brandMod) { if (busyRef.current) return false; sendBrand(t, String(shown || t)); } else if (usesEva) evaNotReady(t, String(shown || t)); else runOldBrain(t); return true; }; // v328 review: false = ignored (Eva still answering) so a question box stays tappable

  // Session 53: Eva's menu — new chat, earlier chats (brands), delete a chat.
  const resetFold = () => { foldRef.current = 0; setFold(0); setHeadH(0); };
  const newChat = (keepMenu) => {
    if (keepMenu !== true) setMenu(false); // v328: deleting the open chat keeps the drawer open
    setPanel(null);
    chatGenRef.current += 1; busyRef.current = 0; // v328: late replies of the old chat are dropped; you can type again
    setMsgs([]);
    setBotTyping(false);
    resetFold();
    atBottomRef.current = true; // v329
    if (brandMod) brandStateRef.current = brandMod.initialAssistState();
    brainRef.current = { ...initialState(), role };
    ticketRef.current = null;
    chatIdRef.current = brandMod?.newChatId ? brandMod.newChatId() : null;
  };
  const openMenu = async () => {
    setMenu(true);
    setChatQuery("");
    if (!usesEva || !brandMod?.listChats) return;
    setChatList(null);
    const list = await brandMod.listChats().catch(() => null);
    setChatList(Array.isArray(list) ? list : "error"); // v329: a failed load said "No chats yet" — now says it failed + Retry
  };
  const openChat = async (id) => {
    setMenu(false);
    if (!brandMod?.loadHistory || id === chatIdRef.current) return;
    setBotTyping(true);
    const past = await brandMod.loadHistory(id).catch(() => null);
    setBotTyping(false);
    if (!past) { reply(tr("I couldn't open that chat right now. Please try again in a moment.", "Abhi ye chat khul nahi payi. Thodi der mein phir try karo.")); return; }
    resetFold();
    chatGenRef.current += 1; busyRef.current = 0; // v328
    brandStateRef.current = brandMod.initialAssistState();
    brainRef.current = { ...initialState(), role }; // Session 58: an old chat starts clean (no half-finished ticket follow-up)
    ticketRef.current = null;
    chatIdRef.current = past.chat_id || id;
    const now = Date.now();
    const rows = past.messages.map((x, i) => ({ id: now + i, user: Boolean(x.user), text: x.text, old: true }));
    // Session 58 (§8e): the chat ended on a card (results, a draft…) → one tap shows it again with fresh data.
    const lastBot = past.messages.length - 1;
    const endCard = lastBot >= 1 && !past.messages[lastBot].user ? past.messages[lastBot].card_type : "";
    const ask = endCard && !["chips", "question", "caps"].includes(endCard) ? past.messages[lastBot - 1] : null;
    // v345 (tester: "Show it again" answered "Could you tell me a little more?"): a brief card came at the END of a
    // question flow, so the message before it was just the last answer ("Skip", "5000"). Brief cards now come back
    // from the saved draft; other cards re-ask only when that message is a real request, not a one-word answer.
    const saved = ["ugcDraft", "campaignDraft"].includes(endCard) && brandMod?.currentDraft ? brandMod.currentDraft() : null;
    if (saved && ((endCard === "ugcDraft" && saved.kind === "ugc") || (endCard === "campaignDraft" && saved.kind === "campaign"))) {
      rows[lastBot] = { ...rows[lastBot], card: { type: endCard, draft: saved.data } };
    } else if (ask && ask.user && ask.text && !["ugcDraft", "campaignDraft"].includes(endCard) && String(ask.text).trim().split(/\s+/).length >= 2) {
      rows[lastBot] = { ...rows[lastBot], card: { type: "chips", send: "value", chips: [{ label: "Show it again", value: ask.text }] } };
    }
    atBottomRef.current = true; // v329: an opened chat starts at its last message
    setMsgs(rows);
  };
  // Session 58 (Eva settings): clear every chat, then start fresh.
  const clearAllChats = async () => (brandMod?.clearHistory ? brandMod.clearHistory(null) : false);
  const afterClearAll = () => { chatGenRef.current += 1; busyRef.current = 0; /* v328 */ setChatList([]); setMsgs([]); resetFold(); if (brandMod) brandStateRef.current = brandMod.initialAssistState(); chatIdRef.current = brandMod?.newChatId ? brandMod.newChatId() : null; };
  // Back closes the top layer first (settings / 📎 sheet / ☰ drawer), then the chat.
  const goBack = () => { if (panel) { setPanel(null); return; } if (menu) { setMenu(false); return; } close(); };
  escRef.current = goBack; // v329
  // v328: two taps to delete (like "Clear all"): the first shows "Tap again to delete" for ~3 s.
  const [delArm, setDelArm] = useState(null);
  const delTimer = useRef(null);
  useEffect(() => () => clearTimeout(delTimer.current), []);
  const deleteChat = async (id) => {
    if (!brandMod?.clearHistory) return;
    if (delArm !== id) {
      setDelArm(id);
      clearTimeout(delTimer.current);
      delTimer.current = setTimeout(() => setDelArm((d) => (d === id ? null : d)), 3000);
      return;
    }
    clearTimeout(delTimer.current);
    setDelArm(null);
    const ok = await brandMod.clearHistory(id).catch(() => false);
    if (!ok) return;
    setChatList((l) => (Array.isArray(l) ? l : []).filter((c) => c.chat_id !== id)); // v329: list may be "error"
    if (id === chatIdRef.current) newChat(true);
  };
  // Session 58 (Eva handoff): replies stream once; 👍 / 👎 go to the server log (no table yet — PENDING_DB_CHANGES).
  const streamedRef = useRef(new Set());
  const [votes, setVotes] = useState({});
  const pinBottom = () => { const el = listRef.current; if (el && atBottomRef.current) el.scrollTop = el.scrollHeight; }; // v329: only while the user is at the bottom
  const votedRef = useRef(new Set()); // v328: one vote per message — locked after the first, the UI keeps it
  const voteOn = (m, v) => {
    if (!v || votedRef.current.has(m.id)) return;
    votedRef.current.add(m.id);
    setVotes((x) => ({ ...x, [m.id]: v }));
    if (v) { ybHaptic("send"); api.post("assist/feedback", { vote: v, role, text: String(m.text || "").slice(0, 400), card: m.card?.type || null }).catch(() => null); }
  };
  const lastEva = [...msgs].reverse().find((x) => !x.user);
  const headMood = botTyping ? "hmm" : lastEva ? (lastEva.mood || moodFor(lastEva.text)) : "hello";
  const firstName = String(auth?.user?.name || auth?.user?.company_name || "").trim().split(/\s+/)[0] || "";
  const brandTitle = String(auth?.user?.company_name || auth?.user?.brand_name || auth?.user?.name || "").trim().slice(0, 28);

  const send = () => {
    const t = input.trim();
    if (!t || attach?.uploading) return;
    if (busyRef.current && usesEva && brandMod && !attach?.url) return; // v328: Eva is still answering — keep the text
    ybHaptic("send");
    // v419 (QA, safety): self-harm, sexual requests and abuse are answered before anything else — never routed to
    // search, never filed as an "idea" ticket.
    const safe = safetyReply(t);
    if (safe) {
      const now = Date.now();
      setInput("");
      setMsgs((m) => [...m, { id: now, user: true, text: t, status: "sent" }, { id: now + 1, at: now, user: false, text: safe.reply, card: safe.card || null }]);
      return;
    }
    // A screenshot is always a report (old brain); everything else from a brand goes to the assistant.
    if (usesEva && brandMod && !attach?.url) { sendBrand(t); return; }
    if (usesEva && !attach?.url) { setInput(""); evaNotReady(t, t); return; } // v438: never a ticket just because Eva is still loading
    runOldBrain(t);
  };

  const pickFile = async (e, kind = "screenshot") => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setAttach({ uploading: true, name: f.name });
    try {
      const fd = new FormData(); fd.append("file", f);
      const { data } = await api.post("upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      // /upload answers { public_url, url: "/api/files/<id>" } — the public link opens anywhere (admin too).
      const url = data?.public_url || data?.url || data?.fileUrl;
      setAttach(url ? { url, name: f.name, kind } : null);
      if (!url) reply(tr("Couldn't attach that file — try a smaller image or a PDF.", "File attach nahi hui — chhoti image ya PDF try karo.")); // v328: never fail silently
      // Session 58 (§8c 📎): Eva shows the file in the chat and asks what to do with it.
      if (url && usesEva && brandMod) {
        const isDoc = kind === "doc" || !/^image\//.test(f.type || "");
        const now = Date.now();
        setMsgs((m) => [...m,
          { id: now, user: true, text: isDoc ? `📄 ${f.name}` : "", image: isDoc ? "" : url },
          { id: now + 1, at: now, user: false, text: isDoc ? tr("Got your document. What should I do with it?", "Document mil gaya. Iska kya karun?") : tr(`Got your ${kind === "photo" ? "photo" : "screenshot"}. What should I do with it?`, `${kind === "photo" ? "Photo" : "Screenshot"} mil gaya. Iska kya karun?`), card: { type: "attachChoices", doc: isDoc } }]);
      }
    } catch { setAttach(null); reply(tr("Couldn't attach that file — try a smaller image or a PDF.", "File attach nahi hui — chhoti image ya PDF try karo.")); } // v328
  };
  const attachChoice = (k, doc) => {
    if (k === "report") { setMsgs((m) => [...m, { id: Date.now(), user: true, text: "Report a problem" }]); reply(tr("Tell me in one line what went wrong — I'll send it to the Ybex team with your file.", "Ek line mein batao kya galat hua — main aapki file ke saath Ybex team ko bhej dungi.")); return; }
    if (k === "send") { runOldBrain("Please have a look at this file I shared from Eva."); return; }
    if (k === "explain") {
      setMsgs((m) => [...m, { id: Date.now(), user: true, text: "Explain it" }]);
      setAttach(null);
      if (!isBrand && brandStateRef.current) brandStateRef.current = { ...brandStateRef.current, awaiting: "briefText" }; // creators: explained like a brief
      reply(tr("I can't open files yet. Paste the part you want explained here and I'll put it in simple words.", "Main abhi files nahi khol sakti. Jo hissa samajhna hai yahan paste karo, main simple words mein samjha dungi."));
      return;
    }
    setAttach(null);
    setMsgs((m) => [...m, { id: Date.now(), user: true, text: "Remove it" }]);
    reply(doc ? "Okay, I removed the document." : "Okay, I removed it.");
  };
  const photoRef = useRef(null);
  const docRef = useRef(null);
  const onAttachPick = (k) => { setPanel(null); (k === "doc" ? docRef : k === "photo" ? photoRef : fileRef).current?.click(); };

  // Bot: swipe right → hidden for this session.
  const botTouchStart = (e) => { const t = e.touches[0]; swipe.current = { x: t.clientX, y: t.clientY }; };
  const botTouchEnd = (e) => {
    const s = swipe.current; swipe.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    if (t.clientX - s.x > 40 && Math.abs(t.clientY - s.y) < 40) { sess.set(HIDE_KEY, "1"); setStage(0); later(() => setHidden(true), 750); e.preventDefault(); }
  };
  // Chat: swipe down from the top area → close (the draft stays).
  // v328: only from the top bar / greeting, with the messages scrolled to the top and no panel or menu open
  // (it used to close while scrolling messages, settings or the drawer).
  const topBarRef = useRef(null);
  const chatTouchStart = (e) => {
    const t = e.touches[0];
    const onTop = Boolean(topBarRef.current?.contains(e.target) || headRef.current?.contains(e.target));
    const listTop = (listRef.current?.scrollTop || 0) <= 0;
    swipe.current = { x: t.clientX, y: t.clientY, top: onTop && listTop && !panel && !menu };
  };
  const chatTouchEnd = (e) => {
    const s = swipe.current; swipe.current = null;
    if (!s || !s.top || panel || menu) return;
    const t = e.changedTouches[0];
    if (t.clientY - s.y > 90 && Math.abs(t.clientX - s.x) < 60) close();
  };

  const online = useOnline(); // v334: offline → Eva opens, a note says she needs internet to reply
  if (hidden || typeof document === "undefined") return null;
  const vw = window.innerWidth, vh = window.innerHeight;
  // v329: on short screens (iPhone SE 568px, landscape) the 300 / 480px spots put Eva and her bubble under the
  // top bar or off the top — the spot is capped so the bubble always stays on screen.
  const bb = Math.min(SPOTS[spot], Math.max(SPOTS[0], vh - 300));
  // v417: lift Eva above a bar pinned to the bottom (desktop sits 20px up via DESKTOP_EVA_CSS; phones at bb, already
  // above the bottom nav). The bubble hides while such a bar is on screen.
  const lift = Math.max(0, barH > 0 ? barH + 12 - (desktop ? 20 : bb) : 0);
  const barBlocksBubble = desktop ? barH > 0 : barH > 110;
  const showBubble = bubble && !chat && !barBlocksBubble;
  // v426 (creator audit: "Hello Riya!" covered the first Active Deal's amount and status): if the line lands on
  // something marked data-eva-avoid, it folds back at once and tries again later.
  useEffect(() => {
    if (!showBubble || desktop) return undefined;
    const t = setTimeout(() => {
      try {
        const b = document.querySelector('[data-testid="feedback-bubble"]')?.getBoundingClientRect();
        if (!b || !b.width) return;
        const hit = Array.from(document.querySelectorAll("[data-eva-avoid]")).some((el) => {
          const r = el.getBoundingClientRect();
          return r.width && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
        });
        if (hit) setBubble(false);
      } catch { /* ignore */ }
    }, 60);
    return () => clearTimeout(t);
  }, [showBubble, desktop, peek.tick]);
  const at = `at ${vw - 18}px ${vh - bb - 42}px)`;
  const canSend = input.trim().length > 0 && !attach?.uploading && !(botTyping && busyRef.current && usesEva && brandMod && !attach?.url); // v329: dimmed while Eva is answering (taps were silently ignored)
  // v291: blur only after the opening circle is done — a blurred layer under an animated clip-path is
  // what froze the opening on iPhone. Before that the glass is a touch more solid.
  const blur = (px) => (chatAnimDone ? { backdropFilter: `blur(${px}px)`, WebkitBackdropFilter: `blur(${px}px)` } : {});
  const glass = chatAnimDone ? TH.glass : TH.glassSolid;
  const glassBox = { background: glass, border: "1px solid rgba(255,255,255,.42)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.25)", ...blur(20) };

  openRef.current = open;
  return createPortal(
    <>
      <style>{`
        @keyframes ybBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        @keyframes ybBlink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
        @keyframes ybDot{0%,60%,100%{transform:translateY(0);opacity:.35}30%{transform:translateY(-4px);opacity:1}}
        @keyframes ybCaret{0%,49%{opacity:1}50%,100%{opacity:0}}
        @keyframes ybMenuIn{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}
        @keyframes evaSheetUp{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}
        ${EVA_KEYFRAMES}
        @media (prefers-reduced-motion: reduce){[data-eva-root],[data-eva-root] *{animation-duration:.01ms!important;animation-iteration-count:1!important;animation-delay:0s!important;transition-duration:.01ms!important;transition-delay:0s!important}} /* v329: the bob, blink, float, circle reveal and fold all ran for reduced-motion users */
        .ybx-in::placeholder{color:rgba(255,255,255,.82)}
      `}</style>

      {/* Bot */}
      <div onClick={open} onTouchStart={botTouchStart} onTouchEnd={botTouchEnd} role="button" aria-label="Open Ybex Eva — ask anything or report an issue" data-testid="feedback-bot"
        tabIndex={chat ? -1 : 0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }} /* v329: keyboard users can open Eva */
        data-eva-root=""
        // v329: z 60 → 39 — Eva sat ON TOP of the ☰ side drawer / Create menu backdrop (z-40/50) and other z-50
        // sheets. She is still above the page; she never overlaps the bottom nav (lowest spot is 118px up).
        style={{ position: "fixed", right: 0, bottom: `calc(${bb}px + env(safe-area-inset-bottom, 0px))`, marginBottom: lift /* v417 */, width: 84, height: 84, zIndex: 39, cursor: "pointer",
          ...(desktop ? { opacity: chat ? 0 : 1, pointerEvents: chat ? "none" : undefined } : {}), // desktop: the panel sits beside the page, so Eva tucks away while it's open
          transform: stage ? "translateX(30px) rotate(-14deg)" : "translateX(110px) rotate(10deg)", transition: "transform .75s cubic-bezier(.34,1.56,.64,1), bottom 0s", WebkitTapHighlightColor: "transparent" }}>
        <div style={{ position: "absolute", inset: 0, animation: "ybBob 3.2s ease-in-out infinite" }}>
          <div style={{ position: "absolute", inset: 4, borderRadius: "50%", background: BALL, filter: "blur(10px)", opacity: 0.8 }} />
          <div style={{ position: "absolute", inset: 10, borderRadius: "50%", boxShadow: "inset -6px -8px 16px rgba(0,0,0,.12),inset 6px 6px 14px rgba(255,255,255,.55)", transform: press ? "scale(1.14,0.9)" : "scale(1)", transition: "transform .17s ease" }}>
            {/* Session 58: a small squash each time she changes mood for a new line (design §3). */}
            <div key={peek.tick} style={{ position: "absolute", inset: 0, borderRadius: "50%", animation: peek.tick ? "evaSquash .5s ease" : undefined }}>
              <EvaFace size={64} mood={peek.mood} glow={false} style={{ boxShadow: "inset -6px -8px 16px rgba(0,0,0,.12),inset 6px 6px 14px rgba(255,255,255,.55)" }} />
            </div>
          </div>
        </div>
      </div>

      {/* Typing bubble */}
      <div onClick={open} aria-hidden={!showBubble} data-eva-root=""
        style={{ position: "fixed", right: 58, bottom: `calc(${bb + 78}px + env(safe-area-inset-bottom, 0px))`, marginBottom: lift /* v417 */, zIndex: 39, /* v329: was 61 (over sheets / drawers) */ cursor: "pointer", transformOrigin: "100% 100%",
          transform: showBubble ? "scale(1)" : "scale(.4)", opacity: showBubble ? 1 : 0, pointerEvents: showBubble ? "auto" : "none", /* v417: showBubble */
          transition: "transform .42s cubic-bezier(.34,1.56,.64,1),opacity .25s ease" }}>
        {/* Session 48 (Ravi's friend: "the bot is green, so the message bubble AND its text should be green
            too"): a light lime bubble from the bot's own ball colours with dark-green text. */}
        <div style={{ background: TH.bubLight, borderRadius: "18px 18px 4px 18px", padding: "11px 14px", boxShadow: TH.bubLightSh, font: "700 13.5px/1.35 'DM Sans',sans-serif", color: TH.bubInk, maxWidth: "min(300px, calc(100vw - 82px))", boxSizing: "border-box" /* v329: was nowrap — long lines ran off the left edge on small phones */ }} data-testid="feedback-bubble">
          {desktop ? (
            // v415: on a computer the bubble is its final size from the start (a hidden copy of the full line sizes it)
            // and the letters type inside it — it used to grow letter by letter (layout shift at the bottom-right).
            <div style={{ display: "grid" }} data-testid="feedback-bubble-sized">
              <span aria-hidden="true" style={{ gridArea: "1 / 1", visibility: "hidden", paddingRight: 4 }}>{peek.text}</span>
              <div style={{ gridArea: "1 / 1", display: "flex", alignItems: "center", minWidth: 0 }}>
                {typed < 0 ? <Dots color={TH.bubInk} pad="5px 2px" /> : (
                  <div style={{ display: "flex", alignItems: "center" }} data-testid="feedback-bubble-text">
                    <span>{peek.text.slice(0, typed)}</span>
                    <span style={{ display: "inline-block", width: 2, height: 15, marginLeft: 2, background: TH.bubInk, opacity: typed < peek.text.length ? 1 : 0, animation: "ybCaret .8s steps(1) infinite" }} />
                  </div>
                )}
              </div>
            </div>
          ) : typed < 0 ? <Dots color={TH.bubInk} pad="5px 2px" /> : (
            <div style={{ display: "flex", alignItems: "center" }} data-testid="feedback-bubble-text">
              <span>{peek.text.slice(0, typed)}</span>
              <span style={{ display: "inline-block", width: 2, height: 15, marginLeft: 2, background: TH.bubInk, opacity: typed < peek.text.length ? 1 : 0, animation: "ybCaret .8s steps(1) infinite" }} />
            </div>
          )}
        </div>
      </div>

      {/* Session 58 (Ravi: "Eva mai typing krte hai toh niche ka footer bhi dikhta hai"): while the keyboard is up the
          chat is only as tall as the visible area, and the iPhone's see-through keyboard bar showed the page under it.
          A solid green layer now fills the whole screen behind the chat. */}
      {chat && box && (
        <div aria-hidden="true" data-testid="feedback-keyboard-backdrop"
          style={{ position: "fixed", left: 0, right: 0, top: 0, height: "calc(100lvh + 200px)", minHeight: "calc(100vh + 200px)", background: TH.base, zIndex: 2099, pointerEvents: "none" }} />
      )}
      {/* Chat */}
      {usesEva && <EvaHiwPopup open={chat} role={role} />}{/* v439: "Meet Eva" tutorial popup on the first open */}
      <div ref={chatRef} data-eva-root="" data-testid="feedback-chat" data-desktop={desktop ? (docked ? "docked" : "drawer") : undefined} role={chat ? "dialog" : undefined} aria-hidden={chat ? undefined : "true"} /* v416: no empty dialog in the page while closed */ aria-modal={chat && !desktop ? "true" : undefined} aria-label={`Ybex ${EVA}`} data-statusbar={STATUS_TOP}
        onTouchStart={desktop ? undefined : chatTouchStart} onTouchEnd={desktop ? undefined : chatTouchEnd}
        style={desktop ? {
          // Session 58 (§8d): desktop — a docked glass panel (≥1100px) or a full-height drawer (768–1099px);
          // the page stays usable beside it. Opens with Eva's blur-in.
          position: "fixed", zIndex: 2100, display: "flex", flexDirection: "column", overflow: "hidden",
          top: docked ? 16 : 0, right: docked ? 16 : 0, bottom: docked ? 16 : 0, width: docked ? 520 : "min(480px, 100vw)",
          borderRadius: docked ? 28 : "24px 0 0 24px", background: TH.chatBg, backgroundColor: TH.base,
          boxShadow: "0 40px 80px -30px rgba(0,30,10,.65), 0 0 0 1px rgba(255,255,255,.12) inset",
          opacity: chat ? 1 : 0, transform: chat ? "none" : "translateY(14px) scale(.97)", filter: chat ? "none" : "blur(10px)",
          visibility: chat || press ? "visible" : "hidden", pointerEvents: chat ? "auto" : "none",
          transition: "opacity .35s ease, transform .45s cubic-bezier(.22,1,.36,1), filter .45s ease, visibility 0s linear " + (chat ? "0s" : ".45s"),
        } : {
          position: "fixed",
          top: box ? box.top : 0,
          left: 0,
          right: 0,
          bottom: box ? "auto" : 0,
          height: box ? box.height : undefined,
          minHeight: box ? undefined : "100dvh",
          maxWidth: "100vw",
          zIndex: 2100,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: TH.chatBg,
          backgroundColor: TH.base,
          clipPath: !chat ? `circle(0px ${at}` : chatAnimDone ? "none" : `circle(${Math.ceil(Math.hypot(vw, vh)) + 40}px ${at}`,
          WebkitClipPath: !chat ? `circle(0px ${at}` : chatAnimDone ? "none" : `circle(${Math.ceil(Math.hypot(vw, vh)) + 40}px ${at}`,
          pointerEvents: chat ? "auto" : "none",
          // v328: hidden when closed (out of Tab order / screen readers) — after the .62s closing circle.
          visibility: chat || press ? "visible" : "hidden",
          transition: chatAnimDone ? "none" : `${REVEAL_CSS}, visibility 0s linear ${chat || press ? "0s" : ".62s"}`,
          willChange: chatAnimDone ? "auto" : "clip-path",
        }}>
        {/* The design's grain (same noise, .22 overlay) — no page bleed-through, and NO wavy lines behind the typing bar (Ravi removed them). */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: GRAIN, opacity: 0.22, mixBlendMode: "overlay", pointerEvents: "none", zIndex: 1 }} />
        {/* Session 53 (Ravi): top bar — back, "Ybex Eva · BETA" (fades in as the big question folds away, like
            ChatGPT's title), and the ☰ menu for new / earlier chats. */}
        {desktop ? (
        <div style={{ position: "relative", padding: "14px 14px 0 18px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, zIndex: 3 }} data-testid="eva-desktop-head">
          <Face size={30} mood={headMood} />
          <span style={{ font: "700 16px 'DM Sans',sans-serif", color: "#fff", letterSpacing: "-.2px" }}>Ybex {EVA}</span>
          <span style={{ height: 18, padding: "0 7px", borderRadius: 9, background: "rgba(198,242,78,.95)", color: "#14532D", font: "800 9.5px 'DM Sans',sans-serif", letterSpacing: ".6px", display: "flex", alignItems: "center" }}>BETA</span>
          <span style={{ flex: 1 }} />
          {usesEva && <button type="button" onClick={openMenu} aria-label="Chats menu" data-testid="eva-menu" className="eva-press"
            style={{ width: 40, height: 40, borderRadius: 20, border: "1px solid rgba(255,255,255,.28)", background: "rgba(255,255,255,.14)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h10" /></svg>
          </button>}
          <button type="button" onClick={newChat} data-testid="eva-desktop-new" className="eva-press"
            style={{ height: 40, padding: "0 14px", borderRadius: 20, border: "none", background: "#fff", color: "#14532D", font: "800 13px 'DM Sans',sans-serif", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#14532D" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>New chat
          </button>
          <button type="button" onClick={close} aria-label="Close" data-testid="feedback-close" className="eva-press"
            style={{ width: 40, height: 40, borderRadius: 20, border: "1px solid rgba(255,255,255,.28)", background: "rgba(255,255,255,.14)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
          </button>
        </div>
        ) : (
        <div ref={topBarRef} style={{ position: "relative", padding: "calc(env(safe-area-inset-top, 0px) + 10px) 16px 0", display: "flex", alignItems: "center", gap: 10, flexShrink: 0, zIndex: 3 }}>
          <button type="button" onClick={goBack} aria-label="Close" data-testid="feedback-close"
            style={{ width: 50, height: 50, border: "1px solid rgba(255,255,255,.28)", borderRadius: "46% 54% 52% 48% / 50% 44% 56% 50%", background: "rgba(255,255,255,.14)", ...blur(18), display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></svg>
          </button>
          <div data-testid="eva-title" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: Math.max(0.0, Math.min(1, fold * 1.4)), transform: `translateY(${((1 - fold) * 6).toFixed(1)}px)`, transition: "opacity .45s ease, transform .45s ease", pointerEvents: "none" }}>
            <Face size={24} mood={headMood} />
            <span style={{ font: "700 15px 'DM Sans',sans-serif", color: "#fff", whiteSpace: "nowrap", letterSpacing: "-.2px" }}>Ybex {EVA}</span>
            <span style={{ height: 18, padding: "0 7px", borderRadius: 9, background: "rgba(198,242,78,.95)", color: "#14532D", font: "800 9.5px 'DM Sans',sans-serif", letterSpacing: ".6px", display: "flex", alignItems: "center" }}>BETA</span>
          </div>
          <button type="button" onClick={openMenu} aria-label="Chats menu" data-testid="eva-menu"
            style={{ width: 50, height: 50, border: "1px solid rgba(255,255,255,.28)", borderRadius: 25, background: "rgba(255,255,255,.14)", ...blur(18), display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h10" /></svg>
          </button>
        </div>
        )}
        <div ref={headRef} data-testid="feedback-head" aria-hidden={fold >= 1 ? "true" : undefined}
          style={{
            // v329: may shrink (minHeight 0) — with the keyboard up the chat is only the visible height and the tall
            // empty-chat greeting + 2×2 starters pushed the typing bar below the keyboard. The list (flex-basis 0)
            // can't shrink, so the head only gives way when the screen is too short.
            position: "relative", boxSizing: "border-box", padding: "26px 24px 0", flexShrink: 1, minHeight: 0, overflow: "hidden", zIndex: 2,
            opacity: chat ? 1 - fold : 0,
            transform: chat ? `translateY(${(-fold * 16).toFixed(1)}px)` : "translateY(18px)",
            filter: fold > 0 ? `blur(${(fold * 10).toFixed(1)}px)` : "none",
            maxHeight: headH && fold > 0 ? Math.max(0, Math.round(headH * (1 - fold))) : undefined,
            pointerEvents: fold >= 1 ? "none" : undefined,
            // before the chat starts: the design's own reveal; once it grows: a soft fold-away.
            transition: fold > 0 ? "opacity .5s ease, transform .5s ease, filter .5s ease, max-height .5s ease" : "opacity .5s ease .3s,transform .6s cubic-bezier(.2,.8,.2,1) .3s",
          }}>
          {/* Session 58 (Eva handoff frames 05 / 06): brand = Quicksand greeting + 2×2 glass starter boxes;
              creator = big floating orb + "Hi {name}, how can I help?" + 2×2 boxes. No chip row here. */}
          <React.Fragment key={openN}>{/* v329: replays the pop-in on each open */}
          {usesEva && brandMod ? (isBrand ? (
            <div data-testid="eva-empty-brand" style={{ paddingTop: 34 }}>
              <div className="eva-in" style={{ font: "300 36px/1.12 'Quicksand',sans-serif", letterSpacing: "-1.1px", color: "rgba(255,255,255,.92)" }}>Hello {brandTitle || "there"}</div>
              <div className="eva-in" style={{ animationDelay: ".06s", font: "300 38px/1.12 'Quicksand',sans-serif", letterSpacing: "-1.2px", color: "#fff" }}>Can <b style={{ fontWeight: 700 }}>I help you?</b></div>
              <div className="eva-in" style={{ animationDelay: ".1s", marginTop: 14, font: "500 14px/1.5 'DM Sans',sans-serif", color: "#DCFCE7", maxWidth: 300 }}>Find and invite creators, or let me draft your campaign.</div>
              {news.length > 0 && (
                <button type="button" onClick={() => postNews(news)} className="eva-in eva-press" data-testid="eva-updates"
                  style={{ marginTop: 18, height: 40, padding: "0 16px", borderRadius: 20, border: "none", background: "#C6F432", color: "#14532D", font: "800 13px 'DM Sans',sans-serif", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: "#14532D" }} />{news.length} update{news.length > 1 ? "s" : ""} for you
                </button>
              )}
              <div style={{ marginTop: 22 }}><InvoicePromo onPick={() => say(isBrand ? "Create invoice" : "Create invoice")} /></div>
              <div style={{ marginTop: 12 }}><StarterGrid items={BRAND_STARTERS} onPick={(st) => say(st.say)} /></div>
            </div>
          ) : (
            <div data-testid="eva-empty-creator" style={{ paddingTop: 18, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
              <div style={{ position: "relative", width: 110, height: 110, animation: "evaFloat 4s ease-in-out infinite" }}>
                <div style={{ position: "absolute", inset: -14, borderRadius: "50%", background: "radial-gradient(circle, rgba(198,242,78,.45), rgba(198,242,78,0) 70%)" }} />
                <EvaFace size={110} mood="hello" />
              </div>
              <div className="eva-in" style={{ marginTop: 18, font: "700 27px/1.15 'DM Sans',sans-serif", letterSpacing: "-.6px", color: "#fff" }}>Hi{firstName ? ` ${firstName}` : ""},<br />how can I help?</div>
              <div className="eva-in" style={{ animationDelay: ".08s", marginTop: 8, font: "500 13.5px 'DM Sans',sans-serif", color: "#DCFCE7" }}>Ask in English, Hindi or Hinglish.</div>
              {news.length > 0 && (
                <button type="button" onClick={() => postNews(news)} className="eva-in eva-press" data-testid="eva-updates"
                  style={{ marginTop: 18, height: 40, padding: "0 16px", borderRadius: 20, border: "none", background: "#C6F432", color: "#14532D", font: "800 13px 'DM Sans',sans-serif", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: "#14532D" }} />{news.length} update{news.length > 1 ? "s" : ""} for you
                </button>
              )}
              <div style={{ marginTop: 20, width: "100%" }}><InvoicePromo onPick={() => say(isBrand ? "Create invoice" : "Create invoice")} /></div>
              <div style={{ marginTop: 12, width: "100%" }}><StarterGrid items={CREATOR_STARTERS} onPick={(st) => say(st.say)} /></div>
            </div>
          )) : (<>
          {/* Session 53 (Ravi): "is there any issue?" → Eva asks "How can I help?" and shows what she can do. */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <Face size={34} />
            <span style={{ height: 22, padding: "0 9px", borderRadius: 11, background: "rgba(255,255,255,.16)", border: "1px solid rgba(255,255,255,.35)", ...blur(14), color: "#fff", font: "700 10.5px 'DM Sans',sans-serif", letterSpacing: ".6px", display: "flex", alignItems: "center" }}>YBEX {EVA.toUpperCase()} · BETA</span>
          </div>
          <div style={{ font: "300 34px/1.12 'Quicksand',sans-serif", letterSpacing: "-1.1px", color: "rgba(255,255,255,.9)" }}>Hi{firstName ? ` ${firstName}` : " there"},</div>
          <div style={{ font: "700 38px/1.1 'Quicksand',sans-serif", letterSpacing: "-1.3px", color: "#fff" }}>How can I help?</div>
          <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {usesEva && brandMod ? (isBrand ? BRAND_CHIPS : CREATOR_CHIPS).map(([label, value]) => (
              <button key={label} type="button" onClick={() => (value === "__bug__" ? chip("bug") : say(value))} data-testid={`eva-chip-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                style={{ height: 38, padding: "0 15px", borderRadius: 19, ...glassBox, display: "flex", alignItems: "center", font: "600 13.5px 'Quicksand',sans-serif", color: "#fff", cursor: "pointer" }}>{label}</button>
            )) : (
              <>
                {Object.keys(CHIPS).map((k) => (
                  <button key={k} type="button" onClick={() => chip(k)} data-testid={`feedback-chip-${k}`}
                    style={{ height: 38, padding: "0 15px", borderRadius: 19, ...glassBox, display: "flex", alignItems: "center", font: "600 13.5px 'Quicksand',sans-serif", color: "#fff", cursor: "pointer" }}>{CHIPS[k][0]}</button>
                ))}
                <button type="button" onClick={capsChip} data-testid="feedback-chip-caps"
                  style={{ height: 38, padding: "0 15px", borderRadius: 19, ...glassBox, display: "flex", alignItems: "center", font: "600 13.5px 'Quicksand',sans-serif", color: "#fff", cursor: "pointer" }}>What can you do?</button>
                <button type="button" onClick={budgetChip} data-testid="feedback-chip-budget"
                  style={{ height: 38, padding: "0 15px", borderRadius: 19, ...glassBox, display: "flex", alignItems: "center", font: "600 13.5px 'Quicksand',sans-serif", color: "#fff", cursor: "pointer" }}>Plan my budget</button>
              </>
            )}
          </div>
          </>)}
          </React.Fragment>
        </div>
        <div ref={listRef} onScroll={onListScroll} style={{ position: "relative", flex: 1, minHeight: 0, overflowY: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", display: "flex", flexDirection: "column", gap: 12, padding: "20px 20px 10px", zIndex: 2 }}>
          {msgs.map((m) => (m.user ? (
            <div key={m.id} className={m.old ? undefined : "eva-in"} style={{ alignSelf: "flex-end", maxWidth: "80%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
              <div style={{ background: "rgba(255,255,255,.94)", color: "#0F2A14", borderRadius: "20px 20px 6px 20px", padding: "12px 16px", font: "500 15px/1.45 'DM Sans',sans-serif", boxShadow: "0 12px 24px -16px rgba(0,40,0,.6)", wordBreak: "break-word", overflowWrap: "anywhere" /* v329: long URLs no longer push the bubble off-screen */ }}>
                {m.image && <img src={m.image} alt="" style={{ display: "block", maxWidth: 180, maxHeight: 180, borderRadius: 14, marginBottom: 8 }} />}
                {m.text}
              </div>
              {m.status === "sent" && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, font: "600 11px 'DM Sans',sans-serif", color: "#fff" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Sent to Ybex team
                </div>
              )}
              {m.status === "failed" && (
                <button type="button" onClick={() => post(m.id, m.payload, m.fresh)} data-testid="feedback-retry"
                  style={{ display: "flex", alignItems: "center", gap: 4, minHeight: 36, padding: "0 2px", margin: "-8px 0", border: "none", background: "transparent", font: "600 11px 'DM Sans',sans-serif", color: "#FECACA", cursor: "pointer" /* v329: bigger tap area */ }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FECACA" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>Not sent · tap to retry
                </button>
              )}
            </div>
          ) : (
            <div key={m.id} className={m.old ? undefined : "eva-in"} style={{ alignSelf: "flex-start", width: m.card && m.card.type !== "chips" ? "100%" : undefined, maxWidth: m.card ? "100%" : "84%", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ maxWidth: "84%", display: "flex", alignItems: "flex-end", gap: 8 }}>
                {/* Session 58 (§8c): each Eva message keeps the face it was sent with. */}
                <Face mood={m.mood || moodFor(m.text)} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ background: chatAnimDone ? "rgba(255,255,255,.16)" : TH.glassSolid, border: "1px solid rgba(255,255,255,.28)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.22), 0 14px 30px -22px rgba(0,30,10,.8)", ...blur(20), color: "#fff", borderRadius: "20px 20px 20px 6px", padding: "12px 16px", font: "500 15px/1.45 'DM Sans',sans-serif", whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "anywhere" /* v329 */ }}>
                    <StreamText text={m.text} stream={!m.old && !streamedRef.current.has(m.id)} onDone={() => streamedRef.current.add(m.id)} onGrow={pinBottom} />
                  </div>
                  {!m.old && <EvaMeta at={m.at || (typeof m.id === "number" ? Math.floor(m.id) : Date.now())} vote={votes[m.id]} onVote={(v) => voteOn(m, v)} />}
                </div>
              </div>
              {/* Session 58 (§6): an answered question box goes away — only the open question shows its box. */}
              {m.card && m.card.type === "evaSettings" && (
                <div style={{ paddingLeft: 34 }} data-testid="assist-card">
                  <button type="button" className="eva-press" onClick={() => setPanel("settings")} data-testid="eva-open-settings"
                    style={{ height: 38, padding: "0 16px", borderRadius: 19, ...glassBox, color: "#fff", font: "700 13px 'DM Sans',sans-serif", cursor: "pointer" }}>Open Eva settings</button>
                </div>
              )}
              {m.card && m.card.type === "attachChoices" && (
                <div style={{ paddingLeft: 34, display: "flex", flexWrap: "wrap", gap: 8 }} data-testid="eva-attach-choices">
                  {(m.card.doc ? [["explain", "Explain it"], ["report", "Report a problem"], ["send", "Send to Ybex team"], ["remove", "Remove"]] : [["report", "Report a problem"], ["send", "Send to Ybex team"], ["remove", "Remove"]]).map(([k, label]) => (
                    <button key={k} type="button" className="eva-press" onClick={() => attachChoice(k, m.card.doc)} disabled={!attach?.url && k !== "remove" && k !== "explain"}
                      style={{ height: 36, padding: "0 14px", borderRadius: 18, ...glassBox, color: "#fff", font: "700 12.5px 'DM Sans',sans-serif", cursor: "pointer", opacity: !attach?.url && k !== "remove" && k !== "explain" ? 0.5 : 1 }}>{label}</button>
                  ))}
                </div>
              )}
              {m.card && brandMod && !["evaSettings", "attachChoices"].includes(m.card.type) && !(m.card.type === "question" && lastEva && lastEva.id !== m.id) && (
                <div style={{ paddingLeft: 34 }} data-testid="assist-card">
<EvaBoundary resetKey={m.id}>                  <brandMod.AssistCard card={m.card} onSay={(label, value) => (m.card.type === "question" || m.card.send === "value" ? say(value !== undefined ? value : label, label) : say(label))} onInvite={(list, budget) => { close(); setInviteList({ list, budget: Number(budget) || 0 }); }} close={close} /></EvaBoundary>
                </div>
              )}
            </div>
          )))}
          {botTyping && (
            <div className="eva-in" style={{ alignSelf: "flex-start", display: "flex", alignItems: "flex-end", gap: 8 }}>
              <Face mood="hmm" />
              <div style={{ background: "rgba(255,255,255,.16)", border: "1px solid rgba(255,255,255,.28)", ...blur(20), borderRadius: "20px 20px 20px 6px", padding: "15px 18px" }}><Dots color="#fff" gap={5} /></div>
            </div>
          )}
        </div>
        <div style={{ position: "relative", padding: box ? "6px 16px 12px" : "6px 16px max(env(safe-area-inset-bottom, 0px), 14px)", flexShrink: 0, zIndex: 2 }}>
          {attach && (
            <div style={{ position: "relative", marginBottom: 8, display: "inline-flex", alignItems: "center", gap: 8, height: 34, padding: "0 6px 0 12px", borderRadius: 17, ...glassBox, font: "600 12.5px 'DM Sans',sans-serif", color: "#fff", maxWidth: "100%" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{attach.uploading ? "Attaching…" : `📎 ${attach.name}`}</span>
              {!attach.uploading && <button type="button" onClick={() => setAttach(null)} aria-label="Remove attachment" style={{ width: 30, height: 30, borderRadius: 15, /* v329: was 24px */ border: "none", background: "rgba(255,255,255,.2)", color: "#fff", cursor: "pointer" }}>×</button>}
            </div>
          )}
          {!online && (
            <div role="status" data-testid="eva-offline" style={{ marginBottom: 8, textAlign: "center", padding: "7px 12px", borderRadius: 14, ...glassBox, font: "600 12.5px/1.35 'DM Sans',sans-serif", color: "#fff" }}>
              {EVA} needs internet to reply — your chats are still here to read.
            </div>
          )}
          <div style={{ position: "relative", height: 58, padding: "0 7px", borderRadius: 29, background: glass, border: "1px solid rgba(255,255,255,.5)", ...blur(18), display: "flex", alignItems: "center", gap: 8, boxShadow: "0 18px 30px -20px rgba(0,40,0,.7)" }}>
            <button type="button" onClick={() => (usesEva && brandMod ? setPanel("attach") : fileRef.current?.click())} aria-label="Attach a photo, screenshot or document" data-testid="feedback-attach"
              style={{ width: 42, height: 42, borderRadius: 21, border: "none", background: "rgba(255,255,255,.16)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.4 3.4 0 014.8 4.8l-8.6 8.6a1.7 1.7 0 01-2.4-2.4l7.9-7.9" /></svg>
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={(e) => pickFile(e, "screenshot")} style={{ display: "none" }} />
            <input ref={photoRef} type="file" accept="image/*" onChange={(e) => pickFile(e, "photo")} style={{ display: "none" }} data-testid="eva-photo-input" />
            <input ref={docRef} type="file" accept=".pdf,.doc,.docx,.txt,application/pdf,text/plain" onChange={(e) => pickFile(e, "doc")} style={{ display: "none" }} data-testid="eva-doc-input" />
            <input ref={inputRef} className="ybx-in" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent?.isComposing) { e.preventDefault(); send(); } }} /* v329: Enter while a Hindi / IME word is still composing no longer sends half a word */
              onFocus={() => { if (desktop) return; /* v329: desktop — focusing the input jumped the page beside the panel to the top */ later(() => { try { window.scrollTo(0, 0); } catch { /* noop */ } }, 60); later(() => { try { window.scrollTo(0, 0); } catch { /* noop */ } const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, 320); }}
              placeholder={usesEva && brandMod ? `Ask ${EVA} anything…` : `Ask ${EVA} or report an issue…`} data-testid="feedback-input" enterKeyHint="send"
              autoComplete="off" autoCorrect="off" autoCapitalize="sentences" spellCheck="false"
              style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", font: "600 16px 'Quicksand',sans-serif", color: "#fff", WebkitUserSelect: "text", userSelect: "text" }} />
            <button type="button" onClick={send} aria-label="Send" data-testid="feedback-send" disabled={!canSend}
              style={{ width: 44, height: 44, borderRadius: 22, border: "none", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", opacity: canSend ? 1 : 0.55, transition: "opacity .2s" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TH.arrow} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></svg>
            </button>
          </div>
          {/* Session 58 (§8f): the disclaimer under the typing bar. */}
          {!box && <div data-testid="eva-disclaimer" style={{ marginTop: 7, textAlign: "center", font: "500 10.5px/1.3 'DM Sans',sans-serif", color: "rgba(255,255,255,.9)" /* v329: was .6 (~3:1) */ }}>{DISCLAIMER}</div>}
        </div>

        {/* Session 53: Eva's menu — new chat + earlier chats (brands). Frosted glass over the green. */}
        {menu && (
          <div role="presentation" onClick={() => setMenu(false)} data-testid="eva-menu-sheet"
            style={{ position: "absolute", inset: 0, zIndex: 6, background: "rgba(4,30,12,.28)", ...blur(6) }}>
            <div role="dialog" aria-label={`${EVA} chats`} onClick={(e) => e.stopPropagation()}
              style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(320px, 84%)", boxSizing: "border-box", padding: "calc(env(safe-area-inset-top, 0px) + 16px) 16px 16px", background: "linear-gradient(180deg,#1C7136 0%,#145A2A 100%)" /* v333 (Ravi): solid — the chat behind showed through */, borderLeft: "1px solid rgba(255,255,255,.25)", boxShadow: "-20px 0 40px -20px rgba(0,30,10,.7)", display: "flex", flexDirection: "column", gap: 14, color: "#fff", animation: "ybMenuIn .32s cubic-bezier(.2,.8,.2,1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Face size={28} />
                <div style={{ flex: 1, font: "800 16px 'DM Sans',sans-serif" }}>Ybex {EVA} <span style={{ font: "800 9.5px 'DM Sans',sans-serif", padding: "2px 6px", borderRadius: 8, background: "rgba(198,242,78,.95)", color: "#14532D", marginLeft: 4, verticalAlign: "middle" }}>BETA</span></div>
                <button type="button" onClick={() => setMenu(false)} aria-label="Close menu"
                  style={{ width: 40, height: 40, borderRadius: 20, border: "none", background: "rgba(255,255,255,.14)", color: "#fff", fontSize: 20, cursor: "pointer" }}>×</button>
              </div>
              <button type="button" onClick={newChat} data-testid="eva-new-chat"
                style={{ height: 46, borderRadius: 23, border: "none", background: "#fff", color: "#14532D", font: "800 14px 'DM Sans',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#14532D" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
                New chat
              </button>
              {usesEva && (
                <input value={chatQuery} onChange={(e) => setChatQuery(e.target.value)} placeholder="Search chats" data-testid="eva-chat-search" className="ybx-in"
                  style={{ height: 40, borderRadius: 20, border: "1px solid rgba(255,255,255,.25)", background: "rgba(255,255,255,.12)", color: "#fff", padding: "0 14px", font: "600 16px 'DM Sans',sans-serif", outline: "none" }} />
              )}
              <div style={{ font: "700 11px 'DM Sans',sans-serif", letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,.75)", marginTop: 4 }}>{usesEva ? "Earlier chats" : "About"}</div>
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                {!usesEva ? (
                  <div style={{ font: "500 13px/1.5 'DM Sans',sans-serif", color: "rgba(255,255,255,.9)" }}>{EVA} is in beta. Ask about Ybex, plan a budget, or report a problem — reports go straight to the Ybex team.</div>
                ) : chatList === "error" ? (
                  <div style={{ font: "500 13px/1.5 'DM Sans',sans-serif", color: "rgba(255,255,255,.9)" }} data-testid="eva-chats-error">
                    Couldn't load your chats. Check your connection and try again.
                    <button type="button" onClick={openMenu} className="eva-press" style={{ display: "block", marginTop: 10, height: 40, padding: "0 16px", borderRadius: 20, border: "1px solid rgba(255,255,255,.3)", background: "rgba(255,255,255,.14)", color: "#fff", font: "700 13px 'DM Sans',sans-serif", cursor: "pointer" }}>Try again</button>
                  </div>
                ) : chatList === null ? (
                  <div style={{ font: "600 13px 'DM Sans',sans-serif", color: "rgba(255,255,255,.8)" }}>Loading…</div>
                ) : chatList.length === 0 ? (
                  <div style={{ font: "500 13px/1.5 'DM Sans',sans-serif", color: "rgba(255,255,255,.85)" }} data-testid="eva-no-chats">No chats yet — tap New chat to start.</div>
                ) : filterChats(chatList, chatQuery).length === 0 ? (
                  <div style={{ font: "500 13px/1.5 'DM Sans',sans-serif", color: "rgba(255,255,255,.85)", overflowWrap: "anywhere" /* v329: long query */ }}>No chats match "{chatQuery}".</div>
                ) : filterChats(chatList, chatQuery).map((c) => (
                  <div key={c.chat_id} style={{ display: "flex", alignItems: "center", gap: 6, borderRadius: 16, background: c.chat_id === chatIdRef.current ? "rgba(255,255,255,.22)" : "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.18)" }}>
                    <button type="button" onClick={() => openChat(c.chat_id)}
                      style={{ flex: 1, minWidth: 0, textAlign: "left", padding: "10px 12px", border: "none", background: "transparent", color: "#fff", cursor: "pointer" }}>
                      <div style={{ font: "700 13.5px 'DM Sans',sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</div>
                      {c.preview && c.preview !== c.title ? <div style={{ font: "500 11.5px 'DM Sans',sans-serif", color: "rgba(255,255,255,.8)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.preview}</div> : null}
                      <div style={{ font: "500 11px 'DM Sans',sans-serif", color: "rgba(255,255,255,.82)", marginTop: 2 }}>{/* v329: contrast */}{c.last_at ? new Date(c.last_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}</div>
                    </button>
                    {delArm === c.chat_id ? (
                    <button type="button" onClick={() => deleteChat(c.chat_id)} data-testid="eva-delete-confirm"
                      style={{ height: 40, padding: "0 12px", marginRight: 4, /* v329: 40px tap target */ border: "none", borderRadius: 16, background: "rgba(220,38,38,.55)", color: "#fff", font: "700 11.5px 'DM Sans',sans-serif", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>Tap again to delete</button>
                    ) : (
                    <button type="button" onClick={() => deleteChat(c.chat_id)} aria-label="Delete this chat"
                      style={{ width: 40, height: 40, marginRight: 4, border: "none", borderRadius: 20, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12" /><path d="M9 7V4h6v3" /></svg>
                    </button>
                    )}
                  </div>
                ))}
              </div>
              {usesEva && (
                <button type="button" onClick={() => { setMenu(false); setPanel("settings"); }} data-testid="eva-settings-open" className="eva-press"
                  style={{ height: 46, borderRadius: 23, border: "1px solid rgba(255,255,255,.3)", background: "rgba(255,255,255,.12)", color: "#fff", font: "700 14px 'DM Sans',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>
                  Eva settings
                </button>
              )}
            </div>
          </div>
        )}
        {panel === "settings" && <EvaSettingsPanel role={role} onBack={() => setPanel(null)} clearAll={clearAllChats} onCleared={afterClearAll} />}
        {panel === "attach" && <AttachSheet onPick={onAttachPick} onClose={() => setPanel(null)} />}
      </div>
      {isBrand && brandMod?.InviteSheet && inviteList && (
        <brandMod.InviteSheet open creators={inviteList.list || inviteList} budget={inviteList.budget || 0} hideRate onClose={() => setInviteList(null)} onSent={() => setInviteList(null)} />
      )}
    </>,
    document.body
  );
}

// v364: one version label for the whole app (src/lib/appVersion.js) — this said "v293"
import { APP_VERSION } from "../../lib/appVersion";

// v419 (Ravi, design "Eva Invoice"): the free invoice generator, on Eva's first screen.
function InvoicePromo({ onPick }) {
  return (
    <button type="button" onClick={onPick} className="eva-in eva-press" data-testid="eva-invoice-promo"
      style={{ width: "100%", textAlign: "left", padding: "15px 15px 14px", borderRadius: 22, border: "1px solid rgba(255,255,255,.22)", background: "linear-gradient(150deg,rgba(255,255,255,.2),rgba(255,255,255,.06))", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, boxShadow: "inset 0 1px 0 rgba(255,255,255,.2)", fontFamily: "'DM Sans',sans-serif" }}>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><span style={{ fontSize: 15, fontWeight: 600 }}>Free invoice generator</span><span style={{ height: 18, padding: "0 7px", borderRadius: 6, background: "linear-gradient(180deg,#F87171,#DC2626)", color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", display: "inline-flex", alignItems: "center" }}>NEW</span></span>
        <span style={{ fontSize: 12.5, fontWeight: 400, lineHeight: 1.45, color: "rgba(255,255,255,.85)" }}>Tell Eva who it's for and what you charged — she makes the invoice (PDF / JPG).</span>
      </span>
      <span style={{ width: 34, height: 34, borderRadius: 17, background: "#C6F432", color: "#14532D", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>→</span>
    </button>
  );
}
