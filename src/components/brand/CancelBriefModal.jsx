import React, { useState, useEffect } from "react";
import { X, AlertCircle, Building2, Smartphone, ShieldCheck } from "lucide-react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import ButtonSpinner from "../common/ButtonSpinner";

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
import ModalPortal from "../common/ModalPortal"; // v360
import useScrollLock from "../../lib/useScrollLock"; // v415

// v416 (U7): what the cancel refund covers, from the server quote. Reads the new breakdown fields when the server sends
// them (fee_refunded / fee_kept, flat or under `breakdown`) and otherwise states the policy: the creator budget of the
// open slots comes back, the service fee + GST does not.
const firstNum = (...vals) => { for (const v of vals) { const n = Number(v); if (v !== null && v !== undefined && v !== "" && Number.isFinite(n)) return n; } return null; };
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
export function refundCoverText(quote) {
  if (!quote) return "";
  const b = quote.refund_breakdown || quote.breakdown || {}; // v416: B2 sends `refund_breakdown`
  const open = Number(quote.open_slots) || 0;
  const slots = open === 1 ? "the 1 open slot" : `the ${open} open slots`;
  const feeRefunded = firstNum(quote.fee_refunded, quote.service_fee_refunded, b.fee_refunded, b.service_fee_refunded);
  const feePaid = firstNum(b.service_fee_paid, quote.service_fee_paid);
  const feeKept = firstNum(quote.fee_kept, quote.service_fee_kept, b.fee_kept, b.service_fee_kept,
    feePaid !== null ? Math.max(0, feePaid - (feeRefunded || 0)) : null);
  const base = `The full creator budget for ${slots} comes back to you.`;
  if (feeRefunded !== null && feeRefunded > 0) return `${base} It includes ${inr(feeRefunded)} of service fee + GST.`;
  if (feeKept !== null && feeKept > 0) return `${base} The service fee + GST (${inr(feeKept)}) is not refunded.`;
  if (feeKept === 0) return base; // no fee was paid (or it all comes back) — nothing to explain
  return `${base} Any service fee + GST paid is not part of this refund.`;
}

function CancelBriefModalBody({ isOpen, onClose, brief, onSuccess }) {
  const [methodType, setMethodType] = useState("UPI"); // "UPI" | "BANK"
  const [upiId, setUpiId] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankAccountConfirm, setBankAccountConfirm] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [savedAccount, setSavedAccount] = useState(null);
  const [useSaved, setUseSaved] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Session 24: amount and slots come from the server (same calculation as the cancel itself).
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  useScrollLock(Boolean(isOpen && brief)); // v415: page behind must not scroll
  // v415: Escape closes (not while the cancel is being sent)
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !submitting) onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, submitting, onClose]);

  useEffect(() => {
    if (!isOpen || !brief) return;

    // Fetch saved brand refund account
    const loadSaved = async () => {
      try {
        setLoadingSaved(true);
        const res = await api.get("/brand/refund-account");
        if (res.data?.refund_account) {
          setSavedAccount(res.data.refund_account);
          setUseSaved(true);
        }
      } catch (err) {
        // Ignored, brand will type details
      } finally {
        setLoadingSaved(false);
      }
    };
    loadSaved();
    setQuote(null);
    setQuoteError(null);
    api.get(`/ugc/briefs/${brief.id}/cancel-quote`)
      .then((r) => setQuote(r.data))
      .catch((e) => setQuoteError(e?.response?.data?.error || "Couldn't load the refund amount."));
  }, [isOpen, brief]);

  if (!isOpen || !brief) return null;

  const openSlots = Number(quote?.open_slots) || 0;
  const perCreatorBudget = Number(quote?.per_slot) || 0;
  const refundAmount = Number(quote?.amount) || 0;
  const workingSlots = Number(quote?.working_slots) || 0;

  const cancelAtMs = quote?.can_cancel_at ? Date.parse(quote.can_cancel_at) : Date.parse(brief.created_at || 0) + 24 * 3600 * 1000;
  const isWithin24h = Date.now() < cancelAtMs;
  const hoursLeft = Math.max(1, Math.ceil((cancelAtMs - Date.now()) / (3600 * 1000)));

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!quote) {
      toast.error(quoteError || "Loading the refund amount…");
      return;
    }
    if (isWithin24h) {
      toast.error(`Brief can be cancelled 24 hours after posting. (${hoursLeft}h remaining)`);
      return;
    }

    if (openSlots <= 0) {
      toast.error("No open slots available to cancel on this brief.");
      return;
    }

    let payload = {};
    if (useSaved && savedAccount) {
      // Server will use saved brand refund account
      payload = {};
    } else if (methodType === "UPI") {
      const trimmedUpi = upiId.trim();
      if (!trimmedUpi || !trimmedUpi.includes("@")) {
        toast.error("Please enter a valid UPI ID (e.g. name@okhdfcbank)");
        return;
      }
      payload = {
        method_type: "UPI",
        upi_id: trimmedUpi
      };
    } else {
      const cleanAcc = bankAccount.replace(/\s+/g, "");
      const cleanConfirm = bankAccountConfirm.replace(/\s+/g, "");
      const cleanIfsc = bankIfsc.trim().toUpperCase();
      const cleanHolder = accountHolder.trim();

      if (!cleanAcc || cleanAcc.length < 9 || cleanAcc.length > 18) {
        toast.error("Account number should be 9 to 18 digits");
        return;
      }
      if (cleanAcc !== cleanConfirm) {
        toast.error("Bank account numbers do not match");
        return;
      }
      if (!cleanIfsc || cleanIfsc.length !== 11) {
        toast.error("Enter a valid 11-character IFSC code");
        return;
      }
      if (!cleanHolder || cleanHolder.length < 2) {
        toast.error("Enter the account holder name");
        return;
      }

      payload = {
        method_type: "BANK",
        bank_account_number: cleanAcc,
        bank_account_confirm: cleanConfirm,
        bank_ifsc: cleanIfsc,
        account_holder_name: cleanHolder
      };
    }

    try {
      setSubmitting(true);
      const res = await api.post(`/ugc/briefs/${brief.id}/cancel`, payload);
      // v416 (U6): our own words — the server text said "account ending bank" for UPI and "₹12000"
      const amt = Number(res.data?.amount) > 0 ? Number(res.data.amount) : refundAmount;
      toast.success(`Brief cancelled. Your refund of ${inr(amt)} will reach your refund account within 1–2 working days.`, { id: "ugc-brief-cancel" });
      if (onSuccess) onSuccess(res.data);
      onClose();
    } catch (err) {
      console.error("Cancel brief error:", err);
      // v332: no raw tech text (err.message like "Network Error") — calm plain English fallback
      const msg = err?.response?.data?.error || err?.response?.data?.detail || "Couldn't cancel the brief. Please try again.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // v360 (Ravi's screenshot: the buttons were hidden under the bottom bar): drawn on <body> above the nav (z 1000);
    // on a phone it is a bottom sheet with the buttons pinned at the bottom (safe area), centred card on desktop.
    <ModalPortal>
    <PopupBackdrop className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs" onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>{/* v415: tap outside to close */}
      <PopupPanel kind="auto" below={640} onClose={submitting ? undefined : onClose} role="dialog" aria-modal="true" aria-label="Cancel brief and refund" className="bg-[var(--bg-card,#ffffff)] border border-[var(--border-default,#e5e7eb)] rounded-t-[24px] sm:rounded-2xl w-full max-w-lg px-5 pt-5 pb-0 sm:px-6 sm:pt-6 shadow-2xl relative flex flex-col max-h-[90vh] max-h-[90dvh] overflow-y-auto overscroll-contain">{/* v332: dvh so iOS toolbars don't hide the buttons */}
        {/* Header — v332: refund-account inputs are 16px on phones (stops iOS zoom) */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-default,#e5e7eb)] mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 text-red-600 flex items-center justify-center">
              <AlertCircle size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary,#111827)]">
                Cancel open slots & get a refund
              </h3>
              <p className="text-xs text-[var(--text-secondary,#6b7280)]">
                {brief.title || "UGC Brief"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting} /* v415 */
            aria-label="Close" // v332: icon-only button had no label; 40px tap target
            className="w-10 h-10 shrink-0 flex items-center justify-center -m-1.5 rounded-lg disabled:opacity-50 text-[var(--text-tertiary,#9ca3af)] hover:text-[var(--text-primary,#111827)] hover:bg-[var(--bg-elevated,#f3f4f6)] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* 24-hour rule warning if not eligible */}
        {isWithin24h ? (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs mb-4 flex items-start gap-2.5">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Cancellation window opens 24 hours after posting</p>
              <p className="mt-1 leading-relaxed">
                Creators get the first 24 hours to find and claim your brief. You can cancel the open slots and get their budget back in about <strong>{hoursLeft} {hoursLeft === 1 ? "hour" : "hours"}</strong>.{/* v332: "1 hours" · v415: plainer */}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs mb-4 flex items-center gap-2">
            <ShieldCheck size={18} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <span className="font-bold">Refund for open slots: </span>
              {/* v332: no "all 0 open slots" while the amount is still loading / when it failed; "1 open slot" · v416: accurate (no "100%") */}
              <span>{quote ? refundCoverText(quote) : quoteError ? "We couldn't load the refund amount right now. Please close and try again." : "Checking open slots…"}</span>
            </div>
          </div>
        )}

        {/* Slot & Amount Summary */}
        <div className="bg-[var(--bg-elevated,#f9fafb)] rounded-xl p-4 border border-[var(--border-default,#e5e7eb)] mb-5">
          <div className="flex justify-between items-center text-xs mb-2">
            <span className="text-[var(--text-secondary,#6b7280)] font-medium">Open slots</span>
            <span className="font-bold text-[var(--text-primary,#111827)]">{quote ? `${openSlots} of ${openSlots + workingSlots}` : "—"}</span>
          </div>
          {workingSlots > 0 && (
            <div className="flex justify-between items-center text-xs mb-2 text-amber-700 dark:text-amber-400">
              <span>Claimed slots</span>{/* v416: also counts finished orders — "creators working" was wrong for a completed one */}
              <span className="font-bold">{workingSlots} (already claimed — not refunded)</span>
            </div>
          )}
          <div className="flex justify-between items-center text-sm pt-2 border-t border-[var(--border-default,#e5e7eb)]">
            <span className="font-bold text-[var(--text-primary,#111827)]">Refund</span>
            <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-base">
              {quote ? `₹${refundAmount.toLocaleString("en-IN")}` : "—"}{/* v332: no ₹0 before the server amount arrives */}
            </span>
          </div>
        </div>

        {/* Refund Account Selection */}
        {!isWithin24h && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {savedAccount && (
              <div className="p-3.5 rounded-xl border border-[var(--border-default,#e5e7eb)] bg-[var(--bg-base,#ffffff)]">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useSaved}
                    onChange={(e) => setUseSaved(e.target.checked)}
                    className="w-4 h-4 rounded text-[#7C3AED] focus:ring-[#7C3AED]"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-[var(--text-primary,#111827)]">Use Saved Refund Account</span>
                    <p className="text-[var(--text-secondary,#6b7280)]">
                      {savedAccount.method_type === "UPI" 
                        ? `UPI: ${savedAccount.upi_id}`
                        : `Bank: •••• ${savedAccount.account_last4} (${savedAccount.bank_ifsc || ""})`}
                    </p>
                  </div>
                </label>
              </div>
            )}

            {(!useSaved || !savedAccount) && (
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary,#6b7280)] uppercase tracking-wider mb-2">
                  Refund Destination
                </label>
                
                {/* Method selector */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setMethodType("UPI")}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      methodType === "UPI"
                        ? "border-[var(--violet,#7c3aed)] bg-[var(--violet,#7c3aed)]/10 text-[var(--violet,#7c3aed)]"
                        : "border-[var(--border-default,#e5e7eb)] text-[var(--text-secondary,#6b7280)] hover:bg-[var(--bg-elevated,#f9fafb)]"
                    }`}
                  >
                    <Smartphone size={14} /> UPI ID
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethodType("BANK")}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      methodType === "BANK"
                        ? "border-[var(--violet,#7c3aed)] bg-[var(--violet,#7c3aed)]/10 text-[var(--violet,#7c3aed)]"
                        : "border-[var(--border-default,#e5e7eb)] text-[var(--text-secondary,#6b7280)] hover:bg-[var(--bg-elevated,#f9fafb)]"
                    }`}
                  >
                    <Building2 size={14} /> Bank Account
                  </button>
                </div>

                {methodType === "UPI" ? (
                  <div>
                    <input
                      type="text"
                      aria-label="UPI ID" /* v415: inputs had no label */
                      autoCapitalize="none"
                      placeholder="e.g. yourname@okhdfcbank"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default,#e5e7eb)] bg-[var(--bg-base,#ffffff)] text-base sm:text-xs text-[var(--text-primary,#111827)] focus:outline-hidden focus:border-[var(--violet,#7c3aed)]"
                    />
                    <p className="text-[10px] text-[var(--text-tertiary,#9ca3af)] mt-1">
                      Refunded to this UPI ID by the Ybex team, usually within 1–2 working days. Make sure it is active.{/* v358: refunds are sent by hand, not instantly */}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <input
                      type="text"
                      aria-label="Account holder name"
                      placeholder="Account Holder Name (as in bank records)"
                      value={accountHolder}
                      onChange={(e) => setAccountHolder(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default,#e5e7eb)] bg-[var(--bg-base,#ffffff)] text-base sm:text-xs text-[var(--text-primary,#111827)] focus:outline-hidden focus:border-[var(--violet,#7c3aed)]"
                    />
                    <input
                      type="password"
                      aria-label="Bank account number"
                      placeholder="Bank Account Number"
                      inputMode="numeric" autoComplete="off" /* v358: number keypad */
                      value={bankAccount}
                      onChange={(e) => setBankAccount(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default,#e5e7eb)] bg-[var(--bg-base,#ffffff)] text-base sm:text-xs text-[var(--text-primary,#111827)] focus:outline-hidden focus:border-[var(--violet,#7c3aed)]"
                    />
                    <input
                      type="text"
                      aria-label="Confirm bank account number"
                      placeholder="Confirm Bank Account Number"
                      inputMode="numeric" autoComplete="off" /* v358 */
                      value={bankAccountConfirm}
                      onChange={(e) => setBankAccountConfirm(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default,#e5e7eb)] bg-[var(--bg-base,#ffffff)] text-base sm:text-xs text-[var(--text-primary,#111827)] focus:outline-hidden focus:border-[var(--violet,#7c3aed)]"
                    />
                    <input
                      type="text"
                      aria-label="IFSC code"
                      placeholder="IFSC Code (e.g. HDFC0001234)"
                      value={bankIfsc}
                      onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-default,#e5e7eb)] bg-[var(--bg-base,#ffffff)] text-base sm:text-xs text-[var(--text-primary,#111827)] uppercase focus:outline-hidden focus:border-[var(--violet,#7c3aed)]"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Modal Actions - Following AGENTS.md button placement: Secondary on Left, Primary on Right */}
            <div className="sticky bottom-0 z-10 -mx-5 sm:-mx-6 px-5 sm:px-6 mt-1 flex items-stretch gap-3 pt-3 border-t border-[var(--border-default,#e5e7eb)] bg-[var(--bg-card,#ffffff)]" style={{ paddingBottom: "calc(14px + env(safe-area-inset-bottom, 0px))" }}>{/* v360: always visible, equal buttons */}
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 min-h-[48px] px-3 rounded-xl border border-[var(--border-default,#e5e7eb)] text-[13px] font-bold text-[var(--text-secondary,#6b7280)] hover:bg-[var(--bg-elevated,#f9fafb)] transition-colors cursor-pointer"
              >
                Keep brief
              </button>

              <button
                type="submit"
                disabled={submitting || !quote || isWithin24h || openSlots <= 0}
                className="flex-[1.4] min-h-[48px] px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[13px] font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <ButtonSpinner />
                    <span>Cancelling…</span>
                  </>
                ) : (
                  <span>{quote ? `Cancel & refund ₹${refundAmount.toLocaleString("en-IN")}` : "Cancel & refund"}</span>
                )}
              </button>
            </div>
          </form>
        )}

        {isWithin24h && (
          <div className="flex items-center justify-end pt-4 border-t border-[var(--border-default,#e5e7eb)]" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-[var(--bg-elevated,#f3f4f6)] text-xs font-bold text-[var(--text-primary,#111827)] hover:bg-[var(--border-default,#e5e7eb)] transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        )}
      </PopupPanel>
    </PopupBackdrop>
    </ModalPortal>
  );
}

// Session 37: stays mounted for its closing animation.
export default function CancelBriefModal(props) {
  return <Presence>{props.isOpen && props.brief && <CancelBriefModalBody key="cancelbriefmodal" {...props} />}</Presence>;
}

