import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ArrowRight, Link2 } from "lucide-react";
import { GATE_COPY, UNVERIFIED_COPY, cleanWorkLink, subLine, currentMin } from "../../lib/followerGate";

const font = "'DM Sans',sans-serif";

/**
 * v397 (Ravi): clean page for creators under 500 Instagram followers — no profile, one hopeful line and a box for
 * one work link. `onSend(link)` saves it (in-app: /creator/follower-gate/work; apply form: the form itself).
 * Props: handle, followers, onSend, sent (start on the "Got it" state), onChangeAccount, onLogout.
 */
export default function FollowerGate({ handle, onSend, sent: sentInitially = false, onChangeAccount, onLogout, min, reason = "low", onRetry, retried = false, askEmail = false }) {
  // v402: on the Join screen there is no account yet — ask for an email so the team can reach them.
  const [email, setEmail] = useState("");
  // v397 (Ravi, 3 Nov): "unverified" = Instagram couldn't be read (private / personal account) — same page, other words.
  const U = reason === "unverified";
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(sentInitially);
  // v397 (Ravi): for "unverified" the work-link box is hidden at first — only "check again". If Instagram still can't be
  // read after that, the box slides down from behind the button. onRetry() → true = fixed (the page goes away).
  const [checking, setChecking] = useState(false);
  const [stillFailed, setStillFailed] = useState(Boolean(retried));
  const [how, setHow] = useState(false); // v408
  const showWork = !U || stillFailed || !onRetry;
  const retry = async () => {
    if (checking) return;
    setChecking(true);
    let ok = false;
    try { ok = Boolean(await onRetry()); } catch { ok = false; }
    setChecking(false);
    if (!ok) setStillFailed(true);
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    const clean = cleanWorkLink(link);
    if (!clean) { setErr("Paste a full link, like a reel, Drive or portfolio link."); return; }
    if (askEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr("Enter your email so the team can reach you."); return; }
    setErr(""); setBusy(true);
    try { await onSend(clean, askEmail ? email.trim().toLowerCase() : undefined); setSent(true); }
    catch (x) { setErr(x?.response?.data?.error || x?.message || "Couldn't send it just now. Please try again."); }
    finally { setBusy(false); }
  };

  const HowSheet = how ? (
    <div role="dialog" aria-modal="true" data-testid="gate-how-sheet" onClick={(e) => { if (e.target === e.currentTarget) setHow(false); }}
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(15,10,30,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 480, background: "#fff", borderRadius: "24px 24px 0 0", padding: "20px 20px calc(22px + env(safe-area-inset-bottom))", font: `400 14px/1.55 ${font}`, color: "#0A0A0A", maxHeight: "90dvh", overflowY: "auto" }}>
        <div style={{ font: `800 18px ${font}` }}>Fix it in 1 minute</div>
        <div style={{ marginTop: 2, fontSize: 13, color: "#5F6672" }}>Do this in the Instagram app. It's free.</div>
        <div style={{ marginTop: 14, fontWeight: 800 }}>1. Make your account public</div>
        <ol style={{ margin: "4px 0 0 18px", padding: 0, fontSize: 13.5 }}>
          <li>Open your profile → tap <b>☰</b> (top right)</li><li>Tap <b>Account privacy</b></li><li>Turn <b>off</b> "Private account"</li>
        </ol>
        <div style={{ marginTop: 12, fontWeight: 800 }}>2. Switch to a Creator account</div>
        <ol style={{ margin: "4px 0 0 18px", padding: 0, fontSize: 13.5 }}>
          <li>Profile → <b>☰</b> → <b>Account type and tools</b></li><li>Tap <b>Switch to professional account</b></li><li>Choose <b>Creator</b> → pick a category → <b>Done</b></li>
        </ol>
        <div style={{ marginTop: 10, fontSize: 12.5, color: "#5F6672" }}>Nothing changes for your followers. You can switch back anytime.</div>
        <button type="button" data-testid="gate-how-done" onClick={() => { setHow(false); if (onRetry) setTimeout(retry, 250); }}
          style={{ marginTop: 14, width: "100%", height: 50, borderRadius: 14, border: 0, background: "#7C3AED", color: "#fff", font: `700 15.5px ${font}`, cursor: "pointer" }}>
          {onRetry ? "Done — check again" : "Got it"}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div data-testid="follower-gate" style={{ minHeight: "var(--yb-vh, 100vh)", width: "100%", background: "linear-gradient(180deg,#F7F2FF 0%,#FFFFFF 46%)", display: "flex", flexDirection: "column", alignItems: "center", boxSizing: "border-box", padding: "56px 20px 28px", fontFamily: font }}>
      <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
        <div aria-hidden="true" style={{ width: 84, height: 84, borderRadius: 999, background: "#fff", boxShadow: "0 10px 30px -12px rgba(124,58,237,.45)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>
          {sent ? GATE_COPY.doneEmoji : U ? UNVERIFIED_COPY.emoji : GATE_COPY.emoji}
        </div>

        {!sent ? (
          <>
            <h1 style={{ margin: "26px 0 0", textAlign: "center", font: `700 26px/1.22 ${font}`, letterSpacing: "-.8px", color: "#0A0A0A" }}>{U ? UNVERIFIED_COPY.title : GATE_COPY.title}</h1>
            <p style={{ margin: "12px 0 0", textAlign: "center", font: `400 15px/1.6 ${font}`, color: "#4B5563", maxWidth: 340 }}>{U ? UNVERIFIED_COPY.sub(handle) : subLine(min ?? currentMin())}</p>
            {U && (
              <>
                <div data-testid="gate-steps" style={{ marginTop: 14, width: "100%", boxSizing: "border-box", padding: "10px 14px", borderRadius: 14, background: "#F5F0FF", border: "1px solid #E9DFFF", font: `500 12.5px/1.55 ${font}`, color: "#5B21B6" }}>{UNVERIFIED_COPY.steps}</div>
                {onRetry && (
                  <button type="button" data-testid="gate-retry" onClick={retry} disabled={checking}
                    style={{ position: "relative", zIndex: 2, marginTop: 12, width: "100%", height: 48, borderRadius: 14, border: "1.5px solid #7C3AED", background: "#fff", color: "#7C3AED", font: `700 15px ${font}`, cursor: checking ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    {checking ? <><Loader2 size={17} className="animate-spin" /> Checking @{String(handle || "").replace(/^@+/, "")}…</> : UNVERIFIED_COPY.retry}
                  </button>
                )}
                {/* v408 (Ravi): "See how" → a sheet from the bottom with the exact Instagram steps */}
                <button type="button" data-testid="gate-see-how" onClick={() => setHow(true)}
                  style={{ marginTop: 10, background: "none", border: 0, padding: "6px 4px", cursor: "pointer", font: `600 13.5px ${font}`, color: "#6B7280" }}>
                  Don't know how? <span style={{ color: "#7C3AED", fontWeight: 800 }}>See how</span>
                </button>
                {stillFailed && onRetry && (
                  <div data-testid="gate-still-failed" role="status" style={{ marginTop: 10, textAlign: "center", font: `600 12.5px/1.45 ${font}`, color: "#B45309" }}>
                    Still can't open @{String(handle || "").replace(/^@+/, "")}. Send us your work instead 👇
                  </div>
                )}
              </>
            )}

            <AnimatePresence initial={false}>
            {showWork && (
            <motion.form key="work" noValidate onSubmit={submit} data-testid="gate-work-box"
              initial={U ? { opacity: 0, y: -56, scaleY: 0.85 } : false} animate={{ opacity: 1, y: 0, scaleY: 1 }} exit={{ opacity: 0, y: -40 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              style={{ transformOrigin: "top center", position: "relative", zIndex: 1, marginTop: U ? 16 : 32, width: "100%", background: "#fff", border: "1px solid #EDE7F6", borderRadius: 20, padding: "20px 18px", boxSizing: "border-box", boxShadow: "0 12px 32px -20px rgba(17,12,46,.25)" }}>
              <div style={{ font: `700 15.5px/1.35 ${font}`, color: "#0A0A0A" }}>{U ? UNVERIFIED_COPY.workTitle : GATE_COPY.workTitle}</div>
              <div style={{ marginTop: 6, font: `400 13.5px/1.55 ${font}`, color: "#6B7280" }}>{U ? UNVERIFIED_COPY.workSub : GATE_COPY.workSub}</div>
              {askEmail && (
                <input data-testid="gate-email" type="email" inputMode="email" autoCapitalize="none" spellCheck={false} autoComplete="email" value={email}
                  onChange={(e) => { setEmail(e.target.value); if (err) setErr(""); }} placeholder="Your email" aria-label="Your email"
                  style={{ marginTop: 16, width: "100%", height: 50, boxSizing: "border-box", borderRadius: 14, border: "1.5px solid #E5E7EB", background: "#FAFAFC", padding: "0 14px", font: `500 16px ${font}`, color: "#0A0A0A", outline: "none" }} />
              )}
              <div style={{ position: "relative", marginTop: askEmail ? 10 : 16 }}>
                <Link2 size={17} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
                <input data-testid="gate-work-link" type="text" inputMode="url" autoCapitalize="none" spellCheck={false} autoComplete="url" value={link}
                  onChange={(e) => { setLink(e.target.value); if (err) setErr(""); }} placeholder={GATE_COPY.placeholder} aria-label="Your work link"
                  style={{ width: "100%", height: 50, boxSizing: "border-box", borderRadius: 14, border: `1.5px solid ${err ? "#F43F5E" : "#E5E7EB"}`, background: "#FAFAFC", padding: "0 14px 0 40px", font: `500 16px ${font}`, color: "#0A0A0A", outline: "none" }} />
              </div>
              {err && <div role="alert" style={{ marginTop: 8, font: `600 12.5px/1.4 ${font}`, color: "#E11D48" }}>{err}</div>}
              <button data-testid="gate-send" type="submit" disabled={busy || !link.trim() || (askEmail && !email.trim())}
                style={{ marginTop: 14, width: "100%", height: 50, borderRadius: 14, border: "none", cursor: busy || !link.trim() ? "default" : "pointer", background: busy || !link.trim() ? "#C4B5FD" : "#7C3AED", color: "#fff", font: `700 15px ${font}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: busy || !link.trim() ? "none" : "0 8px 20px -10px rgba(124,58,237,.7)" }}>
                {busy ? <Loader2 size={18} className="animate-spin" /> : <>{GATE_COPY.button} <ArrowRight size={17} /></>}
              </button>
            </motion.form>
            )}
            </AnimatePresence>
          </>
        ) : (
          <>
            <h1 data-testid="gate-done" style={{ margin: "26px 0 0", textAlign: "center", font: `700 26px/1.22 ${font}`, letterSpacing: "-.8px", color: "#0A0A0A" }}>{GATE_COPY.doneTitle}</h1>
            <p style={{ margin: "12px 0 0", textAlign: "center", font: `400 15px/1.6 ${font}`, color: "#4B5563", maxWidth: 320 }}>{U ? UNVERIFIED_COPY.doneSub : GATE_COPY.doneSub}</p>
          </>
        )}

        <div style={{ marginTop: "auto", paddingTop: 36, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          {handle && onChangeAccount && (
            <button type="button" data-testid="gate-change-account" onClick={onChangeAccount}
              style={{ background: "none", border: "none", padding: "8px 10px", minHeight: 40, cursor: "pointer", font: `500 13px ${font}`, color: "#6B7280" }}>
              Not @{String(handle).replace(/^@+/, "")}? <span style={{ color: "#7C3AED", fontWeight: 700 }}>Use another account</span>
            </button>
          )}
          {onLogout && (
            <button type="button" onClick={onLogout} style={{ background: "none", border: "none", padding: "8px 10px", minHeight: 40, cursor: "pointer", font: `500 13px ${font}`, color: "#9CA3AF" }}>Log out</button>
          )}
        </div>
      </div>
      {HowSheet}
    </div>
  );
}
