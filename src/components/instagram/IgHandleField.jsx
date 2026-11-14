import React, { useEffect, useRef, useState } from "react";
import { Check, Loader2, RotateCw } from "lucide-react";
import { api } from "../../lib/api";
import { igUsername, igFormNumbers, loadIgFetchConfig } from "./InstagramFetchButton";

// v363 (Ravi's design "Onboarding: one username, everything fetched from Meta", screens 01 / 01b / 01c + Brand 01):
// one Instagram username box that fetches by itself.
//   • on blur, or 600 ms after typing stops, with a valid NEW username → POST /instagram/preview (nothing saved)
//   • while it runs: small spinner inside the box + "Fetching your profile from Meta…" (parent keeps Next disabled
//     through onBusyChange)
//   • success: green border + tick, and a stats card (Followers / Avg views / Engagement) — numbers are never typed
//   • failure (personal / private account, typo): "Make the account public or check the spelling" + Retry
// A username is fetched at most once per screen (the preview is rate-limited); answers are kept for this visit, so
// going back and forth between steps costs no new call. With the Instagram fetch switched off it is a plain box.

const answers = new Map(); // username → { ok, nums } | { ok:false, error } — this app visit only

const fmtK = (v) => {
  const n = Number(v);
  if (v === null || v === undefined || v === "" || !Number.isFinite(n)) return "—";
  if (n >= 1e7) return `${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1e5) return `${(n / 1e3).toFixed(0)}K`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
};
export const fmtIgCount = fmtK;

const PURPLE = "#7C3AED";
const GREEN = "#16A34A";

/** What the person sees for a failed fetch. Pure (exported for tests). */
export function igFetchErrorText(status, data) {
  if (status === 404 || data?.code === "NOT_PROFESSIONAL") return "Make the account public or check the spelling";
  if (status === 429 || data?.code === "RATE_LIMIT") return data?.error || "Too many tries. Try again in a few minutes.";
  if (status === 503 || data?.code === "NOT_CONFIGURED") return "Instagram fetch isn't available right now.";
  return "Couldn't reach Instagram. Check your internet and retry.";
}

export function IgStatsCard({ nums, note = "Fetched from Meta · verified, no need to enter numbers", testId = "ig-stats-card" }) {
  if (!nums) return null;
  const eng = nums.engagement_rate !== null && nums.engagement_rate !== undefined && nums.engagement_rate !== "" ? `${nums.engagement_rate}%` : "—";
  const cells = [["Followers", fmtK(nums.followers), "#0A0A0A"], ["Avg views", fmtK(nums.avg_views), "#0A0A0A"], ["Engagement", eng, PURPLE]];
  return (
    <div data-testid={testId} style={{ marginTop: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", background: "#fff", border: "1px solid #E5E5EA", borderRadius: 14, padding: "12px 4px" }}>
        {cells.map(([label, value, color], i) => (
          <div key={label} style={{ textAlign: "center", borderLeft: i ? "1px solid #EEEEF2" : "none", minWidth: 0 }}>
            <div style={{ font: "700 16px/1.1 'DM Sans',sans-serif", color, letterSpacing: "-.3px" }}>{value}</div>
            <div style={{ marginTop: 4, font: "500 11px/1.1 'DM Sans',sans-serif", color: "#6B7280" }}>{label}</div>
          </div>
        ))}
      </div>
      {note && (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 5, font: "500 12px/1.3 'DM Sans',sans-serif", color: GREEN }}>
          <Check size={13} strokeWidth={3} /> {note}
        </div>
      )}
    </div>
  );
}

/**
 * props: value, onChange(handle), onFetched(nums) (igFormNumbers shape), onBusyChange(bool), onStateChange(state),
 *        initialNums (already fetched earlier — card shows, no new call), placeholder, showCard (default true),
 *        fetchingText, testId, fetchInitial (default true).
 */
export default function IgHandleField({
  value, onChange, onFetched, onBusyChange, onStateChange, initialNums = null, placeholder = "your_handle",
  showCard = true, fetchingText = "Fetching your profile from Meta…", note, testId = "ig-handle-field", fetchInitial = true,
  // v375 (brand onboarding "Instagram first", Ravi's design 1a–1c): the parent screen decides what a failure means.
  // quiet → no red error line / Retry here; onResult({ ok, nums, status, code, error }) after every fetch;
  // fetchSignal → each new number forces a fetch now (the "Find my brand" / "Try again now" buttons); autoFocus.
  quiet = false, onResult, fetchSignal = 0, autoFocus = false, onConfig,
}) {
  const [on, setOn] = useState(null); // null = checking config
  const [state, setState] = useState(initialNums ? "ok" : "idle"); // idle | busy | ok | err
  const [nums, setNums] = useState(initialNums || null);
  const [err, setErr] = useState("");
  const [focus, setFocus] = useState(false);
  // fetchInitial=false: a username already there when the screen opens (numbers typed by hand / Instagram login)
  // isn't fetched again by itself — only after it is edited (Retry still works).
  const lastTried = useRef(initialNums?.username || (initialNums || !fetchInitial ? igUsername(value) : ""));
  const cbs = useRef({});
  cbs.current = { onFetched, onBusyChange, onStateChange, onResult, onConfig };
  const clean = igUsername(value);

  useEffect(() => { let live = true; loadIgFetchConfig().then((v) => { if (live) { setOn(Boolean(v)); cbs.current.onConfig?.(Boolean(v)); } }); return () => { live = false; }; }, []);
  useEffect(() => { cbs.current.onBusyChange?.(state === "busy"); cbs.current.onStateChange?.(state); }, [state]);

  const apply = (u, a) => {
    if (a.ok) { setNums(a.nums); setErr(""); setState("ok"); cbs.current.onFetched?.(a.nums); }
    else { setNums(null); setErr(a.error); setState("err"); }
  };

  const run = async (force = false) => {
    const u = clean;
    if (!u || !on) return;
    if (!force && u === lastTried.current) return;
    lastTried.current = u;
    const cached = answers.get(u);
    if (cached && (cached.ok || !force)) { apply(u, cached); cbs.current.onResult?.({ ...cached, username: u }); return; }
    setState("busy"); setErr("");
    try {
      const { data } = await api.post("instagram/preview", { username: u });
      const a = { ok: true, nums: igFormNumbers(data?.stats, { media: data?.media }) };
      answers.set(u, a);
      if (igUsername(cbs.current.latest ?? u) === u) { apply(u, a); cbs.current.onResult?.({ ...a, username: u }); }
    } catch (e) {
      const status = e?.response?.status || 0;
      const a = { ok: false, error: igFetchErrorText(status, e?.response?.data), status, code: e?.response?.data?.code || "" };
      if (status === 404) answers.set(u, a); // a real "no such public account" — no point asking again
      apply(u, a);
      cbs.current.onResult?.({ ...a, username: u });
    }
  };
  // v375: the parent's button asks for a fetch right now (no 600 ms wait; a failed answer is asked again)
  const lastSignal = useRef(fetchSignal);
  useEffect(() => {
    if (fetchSignal === lastSignal.current || !on) return; // config still loading → asked again once it is on
    lastSignal.current = fetchSignal;
    if (clean && state !== "busy") run(true);
  }, [fetchSignal, on]); // eslint-disable-line react-hooks/exhaustive-deps
  cbs.current.latest = value;

  // a new / edited username: back to neutral, then fetch 600 ms after typing stops
  useEffect(() => {
    if (!on) return undefined;
    if (!clean) { if (state !== "busy") { setState("idle"); setNums(null); setErr(""); } return undefined; }
    if (clean === lastTried.current) return undefined;
    if (state === "ok" || state === "err") { setState("idle"); setNums(null); setErr(""); }
    const t = setTimeout(() => run(false), 600);
    return () => clearTimeout(t);
  }, [clean, on]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = state === "busy";
  const ok = state === "ok" && clean && clean === (nums?.username || lastTried.current);
  const border = ok ? GREEN : state === "err" && !quiet ? "#E11D48" : (busy || focus) ? PURPLE : "#E5E5EA"; // v375: quiet → the parent explains, no red box

  return (
    <div data-testid={testId} data-state={on ? state : "off"}>
      <div style={{ position: "relative", height: 50, borderRadius: 14, background: "#fff", border: `1.5px solid ${border}`, display: "flex", alignItems: "center", padding: "0 12px 0 14px", boxSizing: "border-box", transition: "border-color .15s", boxShadow: ok ? "0 0 0 3px rgba(22,163,74,.10)" : (busy || focus) ? "0 0 0 3px rgba(124,58,237,.10)" : "none" }}>
        <span style={{ font: "500 16px 'DM Sans',sans-serif", color: "#9CA3AF", marginRight: 4 }}>@</span>
        <input
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => { setFocus(false); run(false); }}
          autoFocus={autoFocus}
          placeholder={placeholder}
          autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="text"
          aria-label="Instagram handle"
          style={{ flex: 1, minWidth: 0, height: "100%", border: "none", outline: "none", background: "transparent", font: "500 16px 'DM Sans',sans-serif", color: "#0A0A0A" }}
        />
        {busy && <Loader2 data-testid="ig-field-spinner" size={18} color={PURPLE} className="animate-spin" style={{ flexShrink: 0 }} />}
        {ok && (
          <span data-testid="ig-field-tick" style={{ width: 22, height: 22, borderRadius: 11, background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Check size={13} color="#fff" strokeWidth={3.2} />
          </span>
        )}
      </div>
      {busy && !quiet && (
        <div role="status" aria-live="polite" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, font: "500 12.5px 'DM Sans',sans-serif", color: PURPLE }}>
          <Loader2 size={12} className="animate-spin" /> {fetchingText}
        </div>
      )}
      {state === "err" && err && !quiet && (
        <div role="alert" style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ font: "500 12.5px/1.35 'DM Sans',sans-serif", color: "#E11D48" }}>{err}</span>
          <button type="button" onClick={() => run(true)} style={{ minHeight: 36, padding: "0 12px", borderRadius: 10, border: "1px solid #E5E5EA", background: "#fff", font: "600 12.5px 'DM Sans',sans-serif", color: "#0A0A0A", display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", flexShrink: 0 }}>
            <RotateCw size={12} /> Retry
          </button>
        </div>
      )}
      {ok && showCard && <IgStatsCard nums={nums} note={note} />}
    </div>
  );
}
