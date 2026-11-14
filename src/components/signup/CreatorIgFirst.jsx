import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import ButtonSpinner from "../common/ButtonSpinner";
import FollowerGate from "../onboarding/FollowerGate";
import SocialLogo from "../common/SocialLogo"; // v407: the real Instagram mark (Ravi)
import { checkInstagram, checkIgAccount, cleanIgUsername, shortCount, IG_USERNAME_RE, rememberPrecheck } from "../../lib/signupPrecheck";

/**
 * v402 → v408 (Ravi 5 Nov, approved prototype "Ybex Join flow — clickable prototype"): the creator Join screen.
 *   • the username is fetched 0.9 s after typing stops (or Enter / leaving the box) — spinner inside the box
 *   • ONE result card under the box, the button label follows it:
 *       ✓ YOU QUALIFY (min+)            → Continue  → onPass(result) — the join form with Google / email
 *       YOU'RE ALREADY ON YBEX          → Log in    → onLogin(account)
 *       UNDER <min> FOLLOWERS           → Share my best work → the "started small" page (email + work link)
 *       CAN'T SEE @… (private / typo)   → Continue anyway → the same page with "check again" + "See how"
 *   • "Continue with Google" under Continue: an existing account logs in; a NEW Google account comes back here with
 *     the Google kept (googlePending) — after the check the account is made with it, no second Google tap.
 *   • eligible creators who leave are kept as "Started" leads (POST /public/ig-lead, server checks the minimum)
 *   • a "Trusted by 3,000+ creators" strip with Explore editor-pick photos + real activity lines (/public/join-proof)
 */
export default function CreatorIgFirst({ onPass, onLogin, onGoogle, googlePending = null, initial = "", footer = null }) {
  const navigate = useNavigate();
  const [ig, setIg] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [gate, setGate] = useState(null); // { reason: "low" | "unverified", username, followers, min, name, photo_url }
  const [res, setRes] = useState(null); // { ...checkInstagram result, account: { exists, email_hint } }
  const [why, setWhy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const inputRef = useRef(null);
  const seq = useRef(0);
  const cache = useRef(new Map());
  const leadSent = useRef(new Set());
  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 250); return () => clearTimeout(t); }, []);

  const username = cleanIgUsername(ig);
  const valid = IG_USERNAME_RE.test(username);
  const fresh = res && res.username === username ? res : null;
  const checking = busy && valid;

  const lookup = async (name) => {
    if (cache.current.has(name)) return cache.current.get(name);
    const [r, account] = await Promise.all([checkInstagram(name), checkIgAccount(name)]);
    const out = { ...r, account };
    if (r.state !== "unknown") cache.current.set(name, out);
    return out;
  };
  const run = async (name) => {
    const my = ++seq.current;
    setBusy(true); setErr("");
    const out = await lookup(name);
    if (my !== seq.current) return null; // typed something else meanwhile
    setBusy(false); setRes(out);
    // v408: eligible + no account yet → keep as a lead (server re-checks the minimum; once per username)
    if (out.state === "ok" && !out.account?.exists && !leadSent.current.has(name)) {
      leadSent.current.add(name);
      api.post("public/ig-lead", { username: name, followers: out.followers, name: out.name || "", photo_url: out.photo_url || "" }).catch(() => {});
    }
    return out;
  };
  useEffect(() => {
    if (!valid) { seq.current++; setBusy(false); return undefined; }
    if (fresh) return undefined;
    const t = setTimeout(() => { run(username); }, 900);
    return () => clearTimeout(t);
  }, [username]); // eslint-disable-line react-hooks/exhaustive-deps

  // v408: a Google account that isn't on Ybex yet — make the account with it once the Instagram check passed
  const finishWithGoogle = async (r) => {
    setFinishing(true); setErr("");
    try {
      const { data } = await api.post("auth/oauth/pending/complete", { pending: googlePending.id, instagram: r.username });
      if (data?.token) { rememberPrecheck(r); navigate(`/app/oauth#${new URLSearchParams({ token: data.token, role: data.role || "creator" }).toString()}`, { replace: true }); return; }
      setErr("Couldn't finish with Google. Please tap Continue with Google again.");
    } catch (x) {
      const code = x?.response?.data?.code;
      if (code === "LOW_FOLLOWERS") { setGate({ ...r, reason: "low" }); return; }
      setErr(x?.response?.data?.error || "Couldn't finish with Google. Please tap Continue with Google again.");
    } finally { setFinishing(false); }
  };

  const go = (r) => {
    if (r.account?.exists) { onLogin?.(r.account); return; }
    if (r.state === "ok" || r.state === "unknown") {
      if (googlePending) { finishWithGoogle(r); return; }
      rememberPrecheck(r); onPass?.(r); return;
    }
    if (r.state === "low") { setGate({ ...r, reason: "low" }); return; }
    if (r.state === "unverified") { setGate({ ...r, reason: "unverified" }); return; }
    setErr("Enter your Instagram username (letters, numbers, . and _).");
  };
  const check = async (e) => {
    e?.preventDefault?.();
    if (!valid) { setErr("Enter your Instagram username (letters, numbers, . and _)."); return; }
    if (fresh) { go(fresh); return; }
    if (busy) return;
    const r = await run(username);
    if (r) go(r);
  };

  if (gate) {
    return (
      <div data-testid="ig-first-gate" style={{ margin: "0 -20px" }}>
        <FollowerGate
          handle={gate.username}
          reason={gate.reason}
          min={gate.min}
          askEmail
          onRetry={gate.reason === "unverified" ? async () => {
            cache.current.delete(gate.username);
            const r = await lookup(gate.username);
            setRes(r);
            if (r.state === "ok" || r.state === "unknown") { setGate(null); go(r); return true; }
            if (r.state === "low") { setGate({ ...r, reason: "low" }); return true; }
            return false;
          } : undefined}
          onSend={async (link, email) => {
            try {
              await api.post("public/follower-gate/work", { handle: gate.username, email, link, followers: gate.followers ?? null, name: gate.name || "", photo_url: gate.photo_url || "", reason: gate.reason });
            } catch (x) {
              throw new Error(x?.response?.data?.error || "Couldn't send it just now. Please try again.");
            }
          }}
          onChangeAccount={() => { setGate(null); setIg(""); setRes(null); setTimeout(() => inputRef.current?.focus(), 200); }}
        />
      </div>
    );
  }

  let label = "Continue", enabled = false;
  if (checking) label = "Checking…";
  else if (fresh?.account?.exists) { label = "Log in"; enabled = true; }
  else if (fresh?.state === "ok" || fresh?.state === "unknown") { label = "Continue"; enabled = true; }
  else if (fresh?.state === "low") { label = "Share my best work"; enabled = true; }
  else if (fresh?.state === "unverified") { label = "Continue anyway"; enabled = true; }
  const showNote = googlePending && !fresh && !checking;

  return (
    <form noValidate onSubmit={check} data-testid="ig-first" className="flex-1 flex flex-col">
      <h1 className="mt-5 text-[28px] font-bold tracking-[-0.02em] leading-tight">Get paid for your reels</h1>
      <p className="mt-2 text-[15px] text-[#5F6672]">Brand deals for your Instagram — paid safely to your bank.</p>

      <div className={`mt-7 flex items-center h-[56px] rounded-2xl bg-white border ${showNote || err ? "border-[#DC2626]" : "border-[#E5E2EE]"} focus-within:border-[#7C3AED] focus-within:ring-4 focus-within:ring-[#7C3AED]/10`}>
        <span className="pl-4 pr-1 flex" data-testid="ig-first-logo"><SocialLogo platform="instagram" size={22} variant="color" /></span>
        <input ref={inputRef} value={ig} onChange={(e) => { setIg(e.target.value.replace(/\s/g, "").slice(0, 60)); setErr(""); }}
          enterKeyHint="go" onBlur={() => { if (valid && !fresh && !busy) run(username); }}
          autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Instagram username" aria-label="Instagram username"
          className="flex-1 min-w-0 h-full bg-transparent pl-2 pr-2 text-[17px] outline-none" data-testid="ig-first-input" />
        <span className="w-10 shrink-0 flex items-center justify-center">
          {checking ? <span className="w-[18px] h-[18px] rounded-full border-[2.5px] border-[#E4D9FF] border-t-[#7C3AED] animate-spin" data-testid="ig-first-spinner" aria-label="Checking" />
            : fresh && (fresh.state === "ok" || fresh.account?.exists) ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.4" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="m8 12 3 3 5-6" /></svg> : null}
        </span>
      </div>

      <div className="mt-2.5 min-h-[22px]" aria-live="polite">
        {checking ? (
          <p className="text-[12.5px] text-[#5F6672]">Looking up @{username}…</p>
        ) : fresh ? <ResultCard r={fresh} /> : showNote ? (
          <div className="rounded-2xl bg-[#FEF2F2] border border-[#FCA5A5] px-3.5 py-3" data-testid="ig-first-google-note" role="alert">
            <div className="text-[12px] font-extrabold text-[#DC2626]">⚠ NO ACCOUNT YET</div>
            <div className="mt-0.5 text-[13px] leading-snug text-[#7F1D1D]"><b>{googlePending.email || "This Google account"}</b> is not on Ybex. Enter your Instagram above to join with this Google.{" "}
              {onGoogle && <button type="button" onClick={onGoogle} className="font-bold text-[#B91C1C] underline">Use another Google</button>}
            </div>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 whitespace-nowrap text-[12.5px] text-[#5F6672]" data-testid="ig-first-hint">
            🔒 <span>We never ask your password.</span>
            <button type="button" onClick={() => setWhy(true)} className="font-bold text-[#7C3AED]" data-testid="ig-first-why">Why?</button>
          </p>
        )}
        {fresh && googlePending && !fresh.account?.exists && !checking && (
          <p className="mt-1.5 text-[12.5px] text-[#1E3A8A]">Signing up with <b>{googlePending.email}</b></p>
        )}
      </div>
      {err && <p role="alert" className="mt-2 text-[13px] font-medium text-[#DC2626]" data-testid="ig-first-error">{err}</p>}

      <button type="submit" disabled={!enabled || finishing} data-testid="ig-first-continue"
        className="mt-4 w-full h-[56px] rounded-2xl bg-[#7C3AED] text-white text-[17px] font-bold flex items-center justify-center gap-2 disabled:bg-[#C4B5FD] active:scale-[0.99] transition-transform">
        {checking || finishing ? <><ButtonSpinner /> {finishing ? "Creating your account…" : "Checking…"}</> : label}
      </button>

      {onGoogle && !googlePending && (
        <>
          <div className="mt-3.5 flex items-center gap-3 text-[12px] font-semibold text-[#9A9AA3]" aria-hidden="true"><span className="flex-1 h-px bg-[#E5E2EE]" />or<span className="flex-1 h-px bg-[#E5E2EE]" /></div>
          <button type="button" onClick={onGoogle} data-testid="ig-first-google"
            className="mt-3 w-full h-[54px] rounded-2xl bg-white border-[1.5px] border-[#E5E2EE] flex items-center justify-center gap-2.5 text-[15.5px] font-bold text-[#0A0A0A] active:scale-[0.99]">
            <GoogleG /> Continue with Google
          </button>
        </>
      )}

      <TrustStrip />

      {onLogin && !fresh?.account?.exists && (
        <button type="button" onClick={() => onLogin()} data-testid="app-have-account"
          className="mt-auto pt-6 w-full min-h-[44px] text-[14px] font-semibold text-[#6B7280]">
          Already on Ybex? <span className="text-[#7C3AED]">Log in</span>
        </button>
      )}
      {footer}

      {why && (
        <div role="dialog" aria-modal="true" data-testid="ig-first-why-sheet" onClick={(e) => { if (e.target === e.currentTarget) setWhy(false); }}
          className="fixed inset-0 z-[300] bg-black/45 flex items-end justify-center">
          <div className="w-full max-w-[480px] bg-white rounded-t-3xl px-5 pt-5" style={{ paddingBottom: "max(22px, env(safe-area-inset-bottom))" }}>
            <div className="text-[18px] font-extrabold">Why we ask for your Instagram</div>
            <ul className="mt-3 space-y-2.5 text-[14px] text-[#3F3F4A]">
              <li>👀 We only read what anyone can see on your <b>public profile</b> — followers, reach, posts.</li>
              <li>🔒 We <b>never</b> ask for your Instagram password. No Instagram login.</li>
              <li>💼 Brands see your real numbers, so they trust you and pay you faster.</li>
              <li>🗑️ Delete your Ybex account anytime — your data goes with it.</li>
            </ul>
            <button type="button" onClick={() => setWhy(false)} className="mt-5 w-full h-[52px] rounded-2xl bg-[#7C3AED] text-white text-[16px] font-bold">Got it</button>
          </div>
        </div>
      )}
    </form>
  );
}

/** v408: the one card under the box — same design for every case, colour by state. */
function ResultCard({ r }) {
  const av = (
    r.photo_url
      ? <img src={r.photo_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 bg-[#EEE]" />
      : <span className="w-10 h-10 rounded-full bg-white/70 text-[#7C3AED] text-[15px] font-bold flex items-center justify-center shrink-0">{String(r.name || r.username || "?").slice(0, 1).toUpperCase()}</span>
  );
  const who = (
    <>
      <div className="text-[14.5px] font-bold text-[#0A0A0A] leading-tight truncate">{r.name || `@${r.username}`}</div>
      <div className="text-[13px] text-[#5F6672] truncate">@{r.username}{r.followers != null ? <> · {shortCount(r.followers)} followers</> : null}</div>
    </>
  );
  const box = "flex items-center gap-3 rounded-2xl border px-3.5 py-3 min-w-0";
  if (r.account?.exists) {
    return (
      <div className={`${box} bg-[#F3EEFF] border-[#DDD0FF]`} data-testid="ig-first-exists" role="status">
        {av}<div className="min-w-0"><div className="text-[12px] font-extrabold text-[#6D28D9]">YOU'RE ALREADY ON YBEX</div>{who}
          {r.account.email_hint && <div className="text-[12.5px] text-[#5F6672]">Account: {r.account.email_hint}</div>}</div>
      </div>
    );
  }
  if (r.state === "ok") {
    return <div className={`${box} bg-[#ECFDF5] border-[#BBF0D6]`} data-testid="ig-first-found" role="status">{av}<div className="min-w-0"><div className="text-[12px] font-extrabold text-[#047857]">✓ YOU QUALIFY</div>{who}</div></div>;
  }
  if (r.state === "low") {
    return (
      <div className={`${box} bg-[#FFF8EB] border-[#FDE3B0]`} data-testid="ig-first-found" role="status">
        {av}<div className="min-w-0"><div className="text-[12px] font-extrabold text-[#B45309]">UNDER {shortCount(r.min)} FOLLOWERS</div>{who}
          <div className="text-[12.5px] text-[#5F6672]">You can still apply with your best reel.</div></div>
      </div>
    );
  }
  if (r.state === "unverified") {
    return (
      <div className={`${box} bg-[#FFF8EB] border-[#FDE3B0]`} data-testid="ig-first-unverified" role="status">
        <div className="min-w-0"><div className="text-[12px] font-extrabold text-[#B45309]">CAN'T SEE @{String(r.username).toUpperCase()}</div>
          <div className="text-[12.5px] leading-snug text-[#5F6672]">Check the spelling. The account must be public and Professional (Creator / Business).</div></div>
      </div>
    );
  }
  return <p className="text-[12.5px] text-[#5F6672]" data-testid="ig-first-unknown" role="status">Couldn't check @{r.username} right now — you can still continue.</p>;
}

/** v408: "Trusted by 3,000+ creators" — Explore editor-pick photos rotate in; one short REAL activity line changes with them. */
function TrustStrip() {
  const [proof, setProof] = useState(null);
  const [i, setI] = useState(0);
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => api.get("public/join-proof")).then((r) => { if (alive) setProof(r?.data || {}); }).catch(() => { if (alive) setProof({}); });
    return () => { alive = false; };
  }, []);
  const faces = Array.isArray(proof?.faces) ? proof.faces : [];
  const lines = Array.isArray(proof?.lines) ? proof.lines : [];
  useEffect(() => {
    if (faces.length < 2 && lines.length < 2) return undefined;
    const t = setInterval(() => setI((n) => n + 1), 2600);
    return () => clearInterval(t);
  }, [faces.length, lines.length]);
  const shown = faces.length ? [0, 1, 2, 3].slice(0, Math.min(4, faces.length)).map((k) => faces[(i + k) % faces.length]) : [];
  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white border border-[#EEEAF6] px-3.5 py-3" data-testid="ig-first-trust">
      {shown.length > 0 && (
        <div className="flex shrink-0">
          {shown.map((f, k) => (
            <img key={`${f.photo}-${i}-${k}`} src={f.photo} alt={f.name} className="w-[30px] h-[30px] rounded-full object-cover border-2 border-white bg-[#EEE]"
              style={{ marginLeft: k ? -10 : 0, animation: k === shown.length - 1 ? "ybRingIn .55s cubic-bezier(.2,.8,.2,1)" : undefined }} />
          ))}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-[13.5px] font-bold text-[#0A0A0A]">Trusted by 3,000+ creators</div>
        {lines.length > 0 && <div key={i} className="text-[12.5px] text-[#5F6672] truncate" style={{ animation: "ybFadeUp .35s ease" }}>{lines[i % lines.length]}</div>}
      </div>
      <style>{"@keyframes ybRingIn{from{transform:scale(.4) rotate(-40deg);opacity:0}}@keyframes ybFadeUp{from{opacity:0;transform:translateY(4px)}}"}</style>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
