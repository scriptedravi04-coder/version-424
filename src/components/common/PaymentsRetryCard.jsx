import React, { useEffect, useRef, useState } from "react";
import { ShieldCheck, RotateCw } from "lucide-react";
import ButtonSpinner from "./ButtonSpinner";
import { useOnline } from "../../lib/offline";

// v332 (Ravi: "ek ui bna do, khali mt dikhao, errors ya oops esa kuch nahi"): shown when the server answers
// 503 PAYMENTS_UNAVAILABLE (database couldn't be read). Never an empty list ("no payments" / "add a payout
// method") and never an "Oops / error" box — a calm card that says the money is safe, with Try again.
// It also retries by itself once after a few seconds (most of these are a short blip).

/** True when a payments call failed for a server / network reason (not "not logged in"). */
export const isPaymentsUnavailable = (err) => {
  const r = err?.response;
  if (!r) return true; // network / timeout
  if (r.data?.code === "PAYMENTS_UNAVAILABLE") return true;
  return r.status >= 500;
};

// v332: (review) shared across mounts — a parent that swaps this card for a spinner while retrying re-mounts it,
// and a per-mount flag then auto-retried every few seconds forever. At most one automatic retry per minute.
let lastAutoRetryAt = 0;

export default function PaymentsRetryCard({
  onRetry,
  title = "Your payments are safe",
  message = "We can't show them right this moment. Nothing has changed with your money — give it a few seconds.",
  compact = false,
  autoRetryMs = 6000,
  className = "",
}) {
  const [busy, setBusy] = useState(false);
  const autoDone = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  // v334 (offline app): no internet → say so plainly (the money is still safe), and load by itself once the
  // phone is back online.
  const online = useOnline();
  const wasOffline = useRef(!online);

  const retry = async () => {
    if (busy || !onRetry) return;
    setBusy(true);
    try { await onRetry(); } catch { /* the parent keeps this card on screen */ }
    finally { if (alive.current) setBusy(false); }
  };

  useEffect(() => {
    if (!autoRetryMs || autoDone.current || !onRetry) return undefined;
    if (Date.now() - lastAutoRetryAt < 60000) return undefined;
    const t = setTimeout(() => { autoDone.current = true; lastAutoRetryAt = Date.now(); retry(); }, autoRetryMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!online) { wasOffline.current = true; return undefined; }
    if (!wasOffline.current) return undefined;
    wasOffline.current = false;
    const t = setTimeout(retry, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);
  const shownTitle = online ? title : "You're offline";
  const shownMessage = online ? message : "Your payments are safe. They'll show here as soon as you're back online.";

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="payments-retry-card"
      className={`w-full rounded-3xl border border-[#7E00DC]/15 bg-gradient-to-b from-[#7E00DC]/[0.06] to-transparent text-center ${compact ? "px-4 py-5" : "px-6 py-9"} ${className}`}
    >
      <div className={`mx-auto flex items-center justify-center rounded-full bg-[#7E00DC]/10 text-[#7E00DC] ${compact ? "h-11 w-11 mb-3" : "h-14 w-14 mb-4"}`}>
        <ShieldCheck size={compact ? 22 : 28} aria-hidden="true" />
      </div>
      <p className={`font-semibold text-[var(--text-primary,#111)] ${compact ? "text-[15px]" : "text-lg"}`}>{shownTitle}</p>
      <p className={`mx-auto mt-1.5 max-w-[340px] leading-relaxed text-[var(--text-secondary,#555)] ${compact ? "text-[13px]" : "text-sm"}`}>{shownMessage}</p>
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
