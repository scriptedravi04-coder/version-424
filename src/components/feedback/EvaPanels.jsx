import React, { useEffect, useRef, useState } from "react";
import { EVA_LANGS, readEvaSettings, saveEvaSettings, syncEvaSettings, toggleLabel, evaAlertsOn, setEvaAlerts, exportEvaChats } from "./evaSettings";

// Session 58 (Eva handoff part 4): the Eva settings screen and the 📎 attach sheet. Frosted glass on the
// green chat, the same look as the ☰ Chats drawer. Nothing here pays, publishes, invites or applies.

const blur = (n) => ({ backdropFilter: `blur(${n}px) saturate(150%)`, WebkitBackdropFilter: `blur(${n}px) saturate(150%)` });
const font = (w, s) => `${w} ${s}px 'DM Sans',sans-serif`;
const section = { font: font(700, 11), letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,.75)", margin: "18px 2px 8px" };
const box = { borderRadius: 18, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.18)", overflow: "hidden" };
const rowSt = { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" };

function Switch({ on, busy, onChange, label, testId }) {
  return (
    <button type="button" role="switch" aria-checked={Boolean(on)} aria-label={label} disabled={busy} onClick={() => onChange(!on)} data-testid={testId} className="eva-press"
      style={{ width: 48, height: 28, borderRadius: 14, border: "none", padding: 3, flexShrink: 0, cursor: busy ? "default" : "pointer", background: on ? "#C6F432" : "rgba(255,255,255,.22)", opacity: busy ? 0.55 : 1, transition: "background .2s ease" }}>
      <span style={{ display: "block", width: 22, height: 22, borderRadius: 11, background: on ? "#14532D" : "#fff", transform: on ? "translateX(20px)" : "none", transition: "transform .22s cubic-bezier(.34,1.56,.64,1)" }} />
    </button>
  );
}

/** Eva settings: what Eva can read, Notify me, Reply language, Download my chats, Clear all chat history. */
export function EvaSettingsPanel({ role = "creator", onBack, clearAll, onCleared }) {
  const [s, setS] = useState(() => readEvaSettings());
  const [notify, setNotify] = useState(null); // null = loading / unknown
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [exp, setExp] = useState("idle");      // idle | busy | sent | failed
  const [clear, setClear] = useState("idle");  // idle | confirm | busy | done | failed
  const confirmTimer = useRef(null);
  const touched = useRef(false); // v328: the user changed a switch → a late server sync must not flip it back
  // v328: evaAlertsOn() is null when the check fails → treat as on, so the switch isn't disabled forever.
  useEffect(() => { let alive = true; evaAlertsOn().then((v) => { if (alive) setNotify(v === null ? true : v); }); syncEvaSettings().then((v) => { if (alive && !touched.current) setS(v); }); return () => { alive = false; clearTimeout(confirmTimer.current); }; }, []);

  const set = (patch) => { touched.current = true; setS(saveEvaSettings(patch)); }; // v328
  const toggleNotify = async (on) => {
    setNotifyBusy(true);
    const ok = await setEvaAlerts(on);
    setNotifyBusy(false);
    if (ok) setNotify(on);
  };
  const doExport = async () => {
    if (exp === "busy") return;
    setExp("busy");
    const r = await exportEvaChats();
    setExp(r.ok ? "sent" : r.empty ? "empty" : r.limit ? "limit" : "failed"); // v396: no chats → nothing sent
  };
  const doClear = async () => {
    if (clear === "busy") return;
    if (clear !== "confirm") {
      setClear("confirm");
      clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setClear((c) => (c === "confirm" ? "idle" : c)), 4000);
      return;
    }
    clearTimeout(confirmTimer.current);
    setClear("busy");
    const ok = await clearAll().catch(() => false);
    setClear(ok ? "done" : "failed");
    if (ok) onCleared?.();
  };
  const readRows = [
    ["deals", role === "brand" ? "Applicants, pending work, deals and live links" : "Invitations, due work, revisions and live links"],
    ["money", role === "brand" ? "Spend, payment hold and monthly report" : "Earnings, payouts and KYC status"],
  ];

  return (
    <div data-testid="eva-settings" role="dialog" aria-label="Eva settings"
      style={{ position: "absolute", inset: 0, zIndex: 7, display: "flex", flexDirection: "column", background: "linear-gradient(180deg,#1E7A38 0%,#125226 100%)" /* v333 (Ravi): solid — "Hi Babu / boxes" showed through settings */, color: "#fff", animation: "ybMenuIn .32s cubic-bezier(.2,.8,.2,1)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(env(safe-area-inset-top, 0px) + 12px) 16px 6px", flexShrink: 0 }}>
        <button type="button" onClick={onBack} aria-label="Back" data-testid="eva-settings-back"
          style={{ width: 44, height: 44, borderRadius: 22, border: "1px solid rgba(255,255,255,.28)", background: "rgba(255,255,255,.14)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></svg>
        </button>
        <div style={{ font: font(800, 18), letterSpacing: "-.3px" }}>Eva settings</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px calc(env(safe-area-inset-bottom, 0px) + 20px)", scrollbarWidth: "none" }}>
        <div style={section}>What Eva can read</div>
        <div style={box}>
          {readRows.map(([k, desc], i) => (
            <div key={k} style={{ ...rowSt, borderTop: i ? "1px solid rgba(255,255,255,.12)" : "none" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: font(700, 14) }}>{toggleLabel(k, role)}</div>
                <div style={{ font: font(500, 12), color: "rgba(255,255,255,.72)", marginTop: 2 }}>{desc}</div>
              </div>
              <Switch on={s[k] !== false} onChange={(v) => set({ [k]: v })} label={toggleLabel(k, role)} testId={`eva-perm-${k}`} />
            </div>
          ))}
          <div style={{ ...rowSt, borderTop: "1px solid rgba(255,255,255,.12)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: font(700, 14) }}>Notify me from Eva</div>
              <div style={{ font: font(500, 12), color: "rgba(255,255,255,.72)", marginTop: 2 }}>{role === "brand" ? "Phone alerts when new creators match your saved searches" : "Phone alerts when new campaigns match you"}</div>
            </div>
            <Switch on={notify !== false} busy={notify === null || notifyBusy} onChange={toggleNotify} label="Notify me from Eva" testId="eva-perm-notify" />
          </div>
        </div>

        <div style={section}>Reply language</div>
        <div style={{ ...box, display: "flex", padding: 4, gap: 4 }} role="radiogroup" aria-label="Reply language">
          {EVA_LANGS.map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={s.lang === k} onClick={() => set({ lang: k })} data-testid={`eva-lang-${k}`} className="eva-press"
              style={{ flex: 1, height: 38, borderRadius: 14, border: "none", cursor: "pointer", background: s.lang === k ? "#fff" : "transparent", color: s.lang === k ? "#14532D" : "#fff", font: font(800, 13) }}>{label}</button>
          ))}
        </div>
        <div style={{ font: font(500, 12), color: "rgba(255,255,255,.72)", margin: "6px 4px 0" }}>If you write in another language, Eva replies in yours.</div>

        <div style={section}>Your chats</div>
        <div style={box}>
          <button type="button" onClick={doExport} data-testid="eva-export" disabled={exp === "busy"}
            style={{ ...rowSt, width: "100%", border: "none", background: "transparent", color: "#fff", cursor: "pointer", textAlign: "left" }}>
            <span style={{ flex: 1, font: font(700, 14) }}>Download my Eva chats</span>
            <span style={{ font: font(700, 12.5), color: exp === "sent" ? "#C6F432" : exp === "failed" || exp === "limit" ? "#FECACA" : "rgba(255,255,255,.75)" }}>
              {exp === "busy" ? "Sending…" : exp === "sent" ? "✓ Sent to your email" : exp === "failed" ? "Couldn't send — try again" : exp === "limit" ? "Already sent 3 today — try tomorrow" : exp === "empty" ? "No chats to send yet" : "Email me"}
            </span>
          </button>
          <button type="button" onClick={doClear} data-testid="eva-clear-all" disabled={clear === "busy"}
            style={{ ...rowSt, width: "100%", border: "none", borderTop: "1px solid rgba(255,255,255,.12)", background: clear === "confirm" ? "rgba(220,38,38,.35)" : "transparent", color: "#fff", cursor: "pointer", textAlign: "left", transition: "background .2s ease" }}>
            <span style={{ flex: 1, font: font(700, 14), color: clear === "confirm" ? "#fff" : "#FECACA" }}>
              {clear === "confirm" ? "Tap again to clear everything" : clear === "busy" ? "Clearing…" : clear === "done" ? "✓ All chats cleared" : clear === "failed" ? "Couldn't clear — try again" : "Clear all chat history"}
            </span>
          </button>
        </div>
        <div style={{ font: font(500, 12), color: "rgba(255,255,255,.65)", margin: "10px 4px 0", lineHeight: 1.5 }}>Eva never pays, publishes, invites or applies on her own — you always tap the final button.</div>
      </div>
    </div>
  );
}

/** 📎 — Photo / Screenshot / Document. */
export function AttachSheet({ onPick, onClose }) {
  const items = [
    ["photo", "Photo", "From your gallery", "M4 7h3l2-2h6l2 2h3v12H4z M12 17a4 4 0 100-8 4 4 0 000 8z"],
    ["screenshot", "Screenshot", "Show Eva or the team what you see", "M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z M11 18h2"],
    ["doc", "Document", "PDF, Word or text file", "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z M14 3v5h5 M9 13h6 M9 17h4"],
  ];
  return (
    <div role="presentation" onClick={onClose} data-testid="eva-attach-sheet" style={{ position: "absolute", inset: 0, zIndex: 7, background: "rgba(4,30,12,.3)", ...blur(4), display: "flex", alignItems: "flex-end" }}>
      <div role="dialog" aria-label="Add to chat" onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", boxSizing: "border-box", padding: "10px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)", borderRadius: "26px 26px 0 0", background: "#165F2E" /* v333: solid */, borderTop: "1px solid rgba(255,255,255,.28)", color: "#fff", animation: "evaSheetUp .3s cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ width: 40, height: 5, borderRadius: 3, background: "rgba(255,255,255,.4)", margin: "0 auto 12px" }} />
        <div style={{ font: font(800, 16), margin: "0 4px 10px" }}>Add to chat</div>
        {items.map(([k, label, desc, d]) => (
          <button key={k} type="button" onClick={() => onPick(k)} data-testid={`eva-attach-${k}`} className="eva-press"
            style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 12px", marginBottom: 8, borderRadius: 18, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.1)", color: "#fff", cursor: "pointer", textAlign: "left" }}>
            <span style={{ width: 40, height: 40, borderRadius: 13, background: "rgba(198,244,50,.95)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#14532D" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
            </span>
            <span style={{ flex: 1 }}><span style={{ display: "block", font: font(700, 14) }}>{label}</span><span style={{ display: "block", font: font(500, 12), color: "rgba(255,255,255,.72)" }}>{desc}</span></span>
          </button>
        ))}
        <button type="button" onClick={onClose} style={{ width: "100%", height: 44, borderRadius: 22, border: "1px solid rgba(255,255,255,.3)", background: "transparent", color: "#fff", font: font(700, 14), cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}
