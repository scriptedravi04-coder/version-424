import React, { useEffect, useRef, useState } from "react";
import { WifiOff, RotateCw, Check, CloudOff } from "lucide-react";
import ButtonSpinner from "./ButtonSpinner";
import { useOnline } from "../../lib/offline";
import { useServerDown } from "../../lib/serverStatus"; // v364: "Ybex is updating" variant

// v334 (Ravi: "net nahi ho tab bhi app already loaded dikhe"): the one card every screen shows when it has
// nothing saved yet and the phone is offline — instead of a spinner, an empty list or "Couldn't load".
// Screens opened before already show their last saved answer (lib/api.js + apiSnapshot), so this card is only
// for a screen that was never opened on this phone. It reloads by itself when the internet comes back.

const STILL_WORKS = [
  "Screens you've opened before",
  "Your profile and settings menu",
  "Help, Terms, Privacy and Refunds",
];

export default function OfflineState({
  onRetry,
  title = "You're offline",
  message = "This screen hasn't been saved on your phone yet. It will load by itself when you're back online.",
  compact = false,
  showStillWorks = !compact,
  className = "",
}) {
  const phoneOnline = useOnline();
  // v364 (Ravi: server band hone pe pura error): the phone is online but Ybex is updating → same calm card,
  // "Ybex is updating" wording, and it reloads by itself when the server is back.
  const serverDown = useServerDown();
  const updating = phoneOnline && serverDown;
  const online = phoneOnline && !serverDown;
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const wasOffline = useRef(!online);
  useEffect(() => () => { alive.current = false; }, []);

  const retry = async () => {
    if (busy || !onRetry) return;
    setBusy(true);
    try { await onRetry(); } catch { /* the screen keeps this card */ }
    finally { if (alive.current) setBusy(false); }
  };

  // Back online → load once by itself.
  useEffect(() => {
    if (!online) { wasOffline.current = true; return undefined; }
    if (!wasOffline.current || !onRetry) return undefined;
    wasOffline.current = false;
    const t = setTimeout(retry, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-state"
      className={`w-full rounded-3xl border border-[#7E00DC]/15 bg-gradient-to-b from-[#7E00DC]/[0.06] to-transparent text-center ${compact ? "px-4 py-5" : "px-6 py-8"} ${className}`}
    >
      <div className={`mx-auto flex items-center justify-center rounded-full bg-[#7E00DC]/10 text-[#7E00DC] ${compact ? "h-11 w-11 mb-3" : "h-14 w-14 mb-4"}`}>
        {updating ? <CloudOff size={compact ? 20 : 26} aria-hidden="true" /> : <WifiOff size={compact ? 20 : 26} aria-hidden="true" />}
      </div>
      <p className={`font-semibold text-[var(--text-primary,#111)] ${compact ? "text-[15px]" : "text-lg"}`}>{online ? "You're back online" : updating ? "Ybex is updating" : title}</p>
      <p className={`mx-auto mt-1.5 max-w-[340px] leading-relaxed text-[var(--text-secondary,#555)] ${compact ? "text-[13px]" : "text-sm"}`}>
        {online ? "Tap Try again to load this screen." : updating ? "This screen hasn't been saved on your phone yet. It will load by itself when Ybex is back — usually in a few minutes." : message}
      </p>
      {showStillWorks && !online && (
        <div className="mx-auto mt-4 max-w-[300px] rounded-2xl bg-white/70 px-4 py-3 text-left">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#7E00DC]">{updating ? "Still works while Ybex updates" : "Still works offline"}</p>
          <ul className="mt-1.5 space-y-1">
            {STILL_WORKS.map((t) => (
              <li key={t} className="flex items-center gap-2 text-[13px] text-[var(--text-secondary,#555)]">
                <Check size={13} className="shrink-0 text-[#7E00DC]" aria-hidden="true" /> {t}
              </li>
            ))}
          </ul>
        </div>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={retry}
          disabled={busy}
          className="mt-5 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#7E00DC] px-6 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-70"
        >
          {busy ? <ButtonSpinner label="Checking…" /> : (<><RotateCw size={15} aria-hidden="true" /> Try again</>)}
        </button>
      )}
    </div>
  );
}

/**
 * Wrap a screen's existing "Couldn't load / Try again" block: offline → OfflineState (same Retry), online → the
 * screen's own block unchanged. No server call moves — `onRetry` is the screen's own reload. `when` = the screen's
 * own "load failed" flag, for blocks that are also used for a real empty list.
 */
export function OfflineAware({ children, onRetry, compact = false, className = "", message, when = true }) {
  const phoneOnline = useOnline();
  const serverDown = useServerDown(); // v364
  const online = phoneOnline && !serverDown;
  const wasOffline = useRef(!online);
  const retryRef = useRef(onRetry);
  retryRef.current = onRetry;
  // Back online → the screen reloads once by itself (its own block shows only if that fails too).
  useEffect(() => {
    if (!online) { wasOffline.current = true; return undefined; }
    if (!wasOffline.current || !when) return undefined;
    wasOffline.current = false;
    const t = setTimeout(() => { try { const p = retryRef.current?.(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ } }, 800);
    return () => clearTimeout(t);
  }, [online]);
  if (online || !when) return children ?? null;
  const card = <OfflineState onRetry={onRetry} compact={compact} {...(message ? { message } : {})} />;
  return className ? <div className={className}>{card}</div> : card; // className = spacing around the card
}

/** Login / sign-up: shown only while offline — signing in needs the internet. */
export function OfflineSignInNotice({ className = "" }) {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" aria-live="polite" data-testid="offline-signin"
      className={`flex items-start gap-3 rounded-2xl border border-[#7E00DC]/15 bg-[#7E00DC]/[0.06] px-4 py-3 text-left ${className}`}>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#7E00DC]/10 text-[#7E00DC]">
        <WifiOff size={16} aria-hidden="true" />
      </span>
      <span>
        <span className="block text-[14px] font-semibold text-[#0A0A0A]">Connect to the internet to sign in</span>
        <span className="block text-[12.5px] leading-snug text-[#555]">You're offline. Turn on Wi-Fi or mobile data, then continue.</span>
      </span>
    </div>
  );
}
