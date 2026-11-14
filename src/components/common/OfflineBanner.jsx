import React, { useEffect, useState } from "react";
import { WifiOff, CloudOff } from "lucide-react";
import { isServerDown, probeServer } from "../../lib/serverStatus";
import { outboxCount } from "../../lib/outbox";
import downPageHtml from "./ybexDownPage.html?raw"; // v378: Ravi's "Ybex Offline Page" design, self-contained (works with no server / no net)

/** v378: Ravi's maintenance / offline page (with the Deal Drop / Creator Drop mini game) over the whole app. It is
 *  bundled inside the app code, so it shows even when the Ybex server is down or the phone has no internet.
 *  mode "maintenance" | "offline"; side "creator" | "brand"; back = "by 4:30 PM IST" / "in some time". */
export function YbexDownPage({ mode = "maintenance", side = "creator", back = "in some time", onRetry, onOnline }) {
  const [helpOpen, setHelpOpen] = useState(false); // v424: "Need help?" under the heading (inside the page) opens the sheet
  const cfg = JSON.stringify({ mode, side, back, game: true }).replace(/</g, "\\u003c");
  const doc = String(downPageHtml).replace("<head>", `<head><script>window.__YB=${cfg};</script>`);
  React.useEffect(() => {
    const onMsg = (e) => {
      const t = e?.data?.ybex;
      if (t === "retry" && onRetry) onRetry();
      if ((t === "online" || t === "reload") && onOnline) onOnline(t);
      if (t === "help") setHelpOpen(true);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onRetry, onOnline]);
  return (
    <div data-testid={mode === "offline" ? "no-internet-screen" : "maintenance-screen"} role="alertdialog" aria-modal="true"
      aria-label={mode === "offline" ? "No internet connection" : "Ybex is under maintenance"}
      style={{ position: "fixed", inset: 0, zIndex: 3001, background: "#FFFFFF" }}>
      <iframe title={mode === "offline" ? "You seem to be offline" : "Ybex is under maintenance"} srcDoc={doc}
        sandbox="allow-scripts allow-same-origin" style={{ width: "100%", height: "100%", border: 0, display: "block" }} />
      {mode === "maintenance" && helpOpen && <MaintenanceHelp side={side} onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

// v423 (Ravi: "maintenance mein contact support ka option do — neeche se popup, WhatsApp us aur Mail us"): a "Need help?"
// button on the maintenance page opens a bottom sheet with two big options. Works without the Ybex server.
export const SUPPORT_WHATSAPP = "918764004299";
export const SUPPORT_EMAIL = "support@ybexmedia.in";
export function supportLinks(side = "creator") {
  const who = side === "brand" ? "brand" : "creator";
  const text = `Hi Ybex team, I'm a ${who} and Ybex is under maintenance. I need help with: `;
  return {
    whatsapp: `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`,
    mail: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Help needed — Ybex maintenance")}&body=${encodeURIComponent(text)}`,
  };
}
function MaintenanceHelp({ side, onClose }) {
  const links = supportLinks(side);
  const row = { display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "14px 16px", borderRadius: 16, border: "1px solid #ECEAF3", background: "#FFFFFF", textDecoration: "none", color: "#0A0A0A", fontWeight: 700, fontSize: 15, boxSizing: "border-box" };
  const icon = (bg) => ({ width: 40, height: 40, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 });
  const setOpen = (v) => { if (!v) onClose?.(); };
  return (
    <>
      {(
        <div role="dialog" aria-modal="true" aria-label="Contact Ybex support" onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 3003, background: "rgba(10,10,10,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div data-testid="maintenance-help-sheet" onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 480, background: "#F7F6FB", borderRadius: "22px 22px 0 0", padding: "10px 18px calc(22px + env(safe-area-inset-bottom, 0px))", boxSizing: "border-box", fontFamily: "inherit" }}>
            <div style={{ width: 40, height: 4, borderRadius: 4, background: "#D9D6E3", margin: "4px auto 14px" }} />
            <div style={{ fontWeight: 800, fontSize: 18, color: "#0A0A0A" }}>Need help?</div>
            <div style={{ fontSize: 13, color: "#6B6F76", margin: "4px 0 16px" }}>Your account and money are safe. Message us and we'll reply soon.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <a href={links.whatsapp} target="_blank" rel="noopener noreferrer" style={row} data-testid="maintenance-help-whatsapp">
                <span style={icon("#E8F8EE")}><svg width="22" height="22" viewBox="0 0 24 24" fill="#16A34A" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 2 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.4z"/></svg></span>
                <span style={{ flex: 1 }}>WhatsApp us<span style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6B6F76" }}>Fastest reply</span></span>
              </a>
              <a href={links.mail} style={row} data-testid="maintenance-help-mail">
                <span style={icon("#F1ECFE")}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></span>
                <span style={{ flex: 1 }}>Mail us<span style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6B6F76" }}>{SUPPORT_EMAIL}</span></span>
              </a>
            </div>
            <button type="button" onClick={() => setOpen(false)} style={{ marginTop: 12, width: "100%", padding: 12, border: "none", background: "transparent", color: "#6B6F76", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}

// v333 (Ravi: "net nahi ho tab bhi chale, app already loaded show ho" — App Store 4.2 / Play): a calm pill at
// the top while the phone is offline. Screens keep showing what was loaded last time (lib/api.js offline
// fallback); this says so, and disappears by itself when the internet is back.
// v364 (Ravi: "website band ki update ke liye toh pura error show hone laga"): same pill while the Ybex server is
// updating ("Ybex is updating · showing your last saved screens"), the number of saves waiting on the phone
// (src/lib/outbox.js) and a short "Synced ✓" once they reached Ybex.
// v378 (Ravi: "app kabhi kabhi 'showing offline data' bolta hai — net nahi hai toh saaf UI dikhao 'no network'"):
// a failed request used to turn on "Connection is slow · showing saved data" and it stayed on until the phone went
// offline and back. Now a failed request is CHECKED: Ybex answers → nothing shown (it was a blip); Ybex doesn't
// answer but the internet works → the "Ybex is updating" pill (server side); no internet at all → a clear full screen
// "Connection lost… / Looks like you have no internet connection. / Try again".
async function internetWorks() {
  if (typeof fetch !== "function") return true;
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = setTimeout(() => { try { ctl?.abort(); } catch { /* ignore */ } }, 5000);
  try { await fetch("https://www.gstatic.com/generate_204", { mode: "no-cors", cache: "no-store", signal: ctl?.signal }); return true; }
  catch { return false; } finally { clearTimeout(t); }
}

function PlugArt() {
  return (
    <svg width="260" height="170" viewBox="0 0 260 170" aria-hidden="true" style={{ display: "block", margin: "0 auto" }}>
      <path d="M0 58 C40 58 50 52 70 50" fill="none" stroke="#E5E5EA" strokeWidth="7" strokeLinecap="round" />
      <ellipse cx="108" cy="80" rx="42" ry="5" fill="#F2F2F5" />
      <rect x="70" y="26" width="58" height="50" rx="22" fill="#DCDCE2" />
      <rect x="98" y="26" width="34" height="50" rx="17" fill="#ECECF0" />
      <circle cx="110" cy="50" r="3.6" fill="#B9B9C2" /><circle cx="122" cy="50" r="3.6" fill="#B9B9C2" />
      <ellipse cx="185" cy="150" rx="46" ry="5" fill="#F2F2F5" />
      <rect x="132" y="104" width="22" height="5" rx="2.5" fill="#E2E2E8" /><rect x="132" y="124" width="22" height="5" rx="2.5" fill="#E2E2E8" />
      <rect x="150" y="96" width="14" height="42" rx="6" fill="#D4D4DB" />
      <path d="M160 96 h22 a22 21 0 0 1 0 42 h-22 z" fill="#E4E4EA" />
      <path d="M203 117 C230 117 240 125 238 140 C236 155 222 158 222 166" fill="none" stroke="#E5E5EA" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}

function NoInternetScreen({ onRetry, checking }) {
  return (
    <div role="alertdialog" aria-modal="true" aria-label="No internet connection" data-testid="no-internet-screen"
      style={{ position: "fixed", inset: 0, zIndex: 3001, background: "#FFFFFF", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "24px", paddingTop: "calc(24px + env(safe-area-inset-top, 0px))", textAlign: "center", fontFamily: "'DM Sans', sans-serif" }}>
      <PlugArt />
      <div style={{ marginTop: 28, font: "700 19px/1.3 'DM Sans', sans-serif", color: "#0A0A0A" }}>Connection lost…</div>
      <div style={{ marginTop: 8, font: "500 14.5px/1.5 'DM Sans', sans-serif", color: "#8A8799", maxWidth: 300 }}>Looks like you have no internet connection.</div>
      <button type="button" onClick={onRetry} disabled={checking} data-testid="no-internet-retry"
        style={{ marginTop: 26, minWidth: 140, height: 46, padding: "0 28px", borderRadius: 23, border: "none", background: "#7C3AED", color: "#fff", font: "700 15px 'DM Sans', sans-serif", cursor: "pointer", opacity: checking ? 0.7 : 1 }}>
        {checking ? "Checking…" : "Try again"}
      </button>
    </div>
  );
}

const sideOf = () => { try { return /"role"\s*:\s*"brand"/.test(localStorage.getItem("ybex_user") || "") ? "brand" : "creator"; } catch { return "creator"; } };
const waitingText = (n) => (n > 0 ? ` · ${n} change${n === 1 ? "" : "s"} waiting to sync` : "");

export default function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  const [serverDown, setServerDown] = useState(() => isServerDown());
  const [stale, setStale] = useState(false);
  const [backOnline, setBackOnline] = useState(false);
  const [waiting, setWaiting] = useState(() => outboxCount());
  const [synced, setSynced] = useState(false);
  const [checking, setChecking] = useState(false);
  // v378: one check at a time after a failed request (see the note above).
  const checkingRef = React.useRef(false);
  const shownDownRef = React.useRef(false);
  const checkAfterFailure = async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) { setOffline(true); return; }
      if (await probeServer()) { setStale(false); return; }       // Ybex answers → it was a blip
      if (!(await internetWorks())) setOffline(true);              // no internet at all → full screen
      // else: Ybex is down / updating → probeServer() already turned on the "Ybex is updating" pill
    } finally { checkingRef.current = false; }
  };
  const retry = async () => {
    setChecking(true);
    try {
      const net = (typeof navigator === "undefined" || navigator.onLine !== false) && (await internetWorks());
      if (net) { setOffline(false); setStale(false); try { window.location.reload(); } catch { /* ignore */ } }
    } finally { setChecking(false); }
  };
  useEffect(() => {
    let t = 0, t2 = 0;
    const off = () => { setOffline(true); setBackOnline(false); };
    const on = () => { setOffline(false); setStale(false); setBackOnline(true); clearTimeout(t); t = setTimeout(() => setBackOnline(false), 2500); }; // v378: the "Connection lost" screen closes by itself; screens refetch on their own
    const old = () => { checkAfterFailure(); }; // v378: check instead of a sticky "showing saved data" pill
    const server = (e) => {
      const down = Boolean(e?.detail?.down);
      setServerDown(down);
      if (!down) {
        setStale(false); setBackOnline(true); clearTimeout(t); t = setTimeout(() => setBackOnline(false), 2500);
        // v378: the maintenance page was up while the server was down → load fresh data now that it's back
        if (shownDownRef.current) { shownDownRef.current = false; try { window.location.reload(); } catch { /* ignore */ } }
      }
    };
    const box = (e) => setWaiting(Number(e?.detail?.count ?? outboxCount()) || 0);
    const done = () => { setSynced(true); clearTimeout(t2); t2 = setTimeout(() => setSynced(false), 2500); };
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    window.addEventListener("ybex:offline-data", old);
    window.addEventListener("ybex:server", server);
    window.addEventListener("ybex:outbox", box);
    window.addEventListener("ybex:outbox-synced", done);
    return () => {
      window.removeEventListener("offline", off); window.removeEventListener("online", on); window.removeEventListener("ybex:offline-data", old);
      window.removeEventListener("ybex:server", server); window.removeEventListener("ybex:outbox", box); window.removeEventListener("ybex:outbox-synced", done);
      clearTimeout(t); clearTimeout(t2);
    };
  }, []);
  const syncedNow = synced && !offline && !serverDown && waiting === 0;
  // v378 (Ravi's design): no internet → his offline page with the mini game. Ybex server down (internet fine) → his
  // maintenance page "Back in some time" (shown by MaintenanceWrapper in App.jsx, not here).
  // v378 (Ravi: "server down ho ya website na chale toh bhi maintenance page automatic dikhe, time ki jagah 'some time'"):
  // the phone has internet but Ybex doesn't answer → the maintenance page with the game; it goes away (and the app
  // reloads its data) as soon as the server answers again (serverStatus checks every 20 s).
  const onAdminPage = typeof window !== "undefined" && /^\/admin/.test(window.location.pathname || "");
  if (serverDown && !offline && !onAdminPage) shownDownRef.current = true;
  if (serverDown && !offline && !onAdminPage) return <YbexDownPage mode="maintenance" side={sideOf()} back="in some time" onRetry={() => probeServer()} onOnline={() => probeServer()} />;
  if (offline) return <YbexDownPage mode="offline" side={sideOf()} onRetry={retry} onOnline={() => { setOffline(false); try { window.location.reload(); } catch { /* ignore */ } }} />;
  if (!offline && !serverDown && !stale && !backOnline && !syncedNow && waiting === 0) return null;
  const good = (backOnline || syncedNow) && !offline && !serverDown;
  const text = good
    ? (syncedNow ? "Synced ✓ — your changes are saved on Ybex" : `Back online${waitingText(waiting)}`)
    : offline ? `You're offline · showing your last saved screens${waitingText(waiting)}`
    : serverDown ? `Ybex is updating · showing your last saved screens${waitingText(waiting)}`
    : stale ? "Connection is slow · showing saved data"
    : `Syncing${waitingText(waiting)}`;
  return (
    <div role="status" aria-live="polite" data-testid="offline-banner"
      style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", top: "calc(env(safe-area-inset-top, 0px) + 8px)", zIndex: 3000,
        display: "flex", alignItems: "center", gap: 8, maxWidth: "calc(100vw - 24px)", padding: "8px 14px", borderRadius: 999,
        background: good ? "#ECFDF5" : "#1F1B2E", color: good ? "#047857" : "#FFFFFF", boxShadow: "0 10px 30px -12px rgba(15,11,31,.45)",
        font: "600 12.5px/1.3 'DM Sans', sans-serif", pointerEvents: "none" }}>
      {good ? <span aria-hidden="true">✓</span> : serverDown && !offline ? <CloudOff size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />}
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{text}</span>
    </div>
  );
}
