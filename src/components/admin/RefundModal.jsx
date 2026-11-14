import React, { useState, useEffect } from 'react';
import { X, RotateCcw, AlertCircle, CheckCircle2, Copy, User, Building2, ShieldAlert } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from 'sonner';

import { PopupBackdrop, PopupPanel } from "../common/Popup";
export default function RefundModal({ transaction, onClose, onSuccess }) {
  // Session 36: the brand's refund account (same one UGC uses), so the money can be sent by hand.
  const [refundAccount, setRefundAccount] = useState(undefined); // undefined = loading, null = none
  const [asking, setAsking] = useState(false);
  const refundBrandId = transaction?.brand_id || null;
  useEffect(() => {
    if (!refundBrandId) { setRefundAccount(null); return; }
    api.get(`admin/refund-account/${encodeURIComponent(refundBrandId)}`)
      .then((r) => setRefundAccount(r.data?.refund_account || null))
      .catch(() => setRefundAccount(null));
  }, [refundBrandId]);
  const askBrandForAccount = async () => {
    setAsking(true);
    try {
      await api.post("admin/refunds/notify", { brand_id: refundBrandId, kind: "needs_account", amount: Number(transaction?.refund_amount || transaction?.gross_amount || 0) });
      toast.success("Brand asked to add a refund account.");
    } catch { toast.error("Could not notify the brand."); } finally { setAsking(false); }
  };
  const isPending = transaction?.refund_status === 'PENDING';
  const isProcessed = transaction?.refund_status === 'PROCESSED';

  // v366 (Ravi: "baaki jo pending hai unhe bhi work karo"): after a refund was already paid (e.g. only the service fee),
  // the admin can add another one — up to what the brand paid minus what was already refunded. Same rule as the server
  // (backend/adminMoney.ts refundableLeft / feeRefundedSoFar).
  const paidTotal = Number(transaction?.brand_paid_amount) > 0 ? Number(transaction.brand_paid_amount) : Number(transaction?.gross_amount || 0);
  const alreadyRefunded = isProcessed ? Math.max(0, Number(transaction?.refund_amount) || 0) : 0;
  const feeTag = /^\[service-fee refund\](?:\s*fee ₹(\d+(?:\.\d+)?))?/.exec(String(transaction?.fee_correction_note || ''));
  const feeAlreadyRefunded = feeTag ? Math.min(alreadyRefunded, feeTag[1] ? Number(feeTag[1]) : alreadyRefunded) : 0;
  const leftToRefund = Math.max(0, Math.round((paidTotal - alreadyRefunded) * 100) / 100);
  const addingAnother = isProcessed && alreadyRefunded > 0;
  const fullyRefunded = addingAnother && leftToRefund <= 0.5;

  const defaultAmount = addingAnother
    ? leftToRefund
    : transaction?.refund_amount
      ? Number(transaction?.refund_amount)
      : Number(transaction?.gross_amount || transaction?.creator_net_amount || transaction?.platform_fee_amount || 0);

  // v366: a new refund on top of an earlier one starts with an empty reason / UTR (the old ones stay on the record).
  const defaultReason = addingAnother ? '' : (transaction?.refund_reason || transaction?.fee_correction_note || '');
  const defaultReference = addingAnother ? '' : (transaction?.refund_reference || '');

  const [refundAmount, setRefundAmount] = useState(defaultAmount);
  // v365: what the refund comes out of — "deal" (escrow, the creator's pay goes down) or "fee" (the brand's service fee,
  // Ybex's share — the creator still gets the full amount). Only split-fee payments have a fee to refund.
  const [refundFrom, setRefundFrom] = useState("deal");
  const [refundReason, setRefundReason] = useState(defaultReason);
  const [refundReference, setRefundReference] = useState(defaultReference);
  const [targetStatus, setTargetStatus] = useState(isPending || !isProcessed ? 'PROCESSED' : 'PROCESSED');
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Session 39: hooks above run on every render; the early return comes after them.
  if (!transaction) return null;

  const copyToClipboard = (text, label) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`${label || 'Text'} copied to clipboard!`);
  };

  const validateForm = () => {
    const amount = Number(refundAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid refund amount greater than 0.");
      return false;
    }
    if (addingAnother && amount > leftToRefund + 0.005) {
      toast.error(`Already refunded ₹${alreadyRefunded.toLocaleString('en-IN')} · only ₹${leftToRefund.toLocaleString('en-IN')} can still be refunded.`);
      return false;
    }
    if (targetStatus === 'PROCESSED' && !refundReference.trim()) {
      toast.error("Please enter the UTR / reference number of the refund you sent."); // v332: plain words
      return false;
    }
    return true;
  };

  const handleInitialSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    if (targetStatus === 'PROCESSED') {
      setShowConfirmation(true);
    } else {
      executeRefund();
    }
  };

  const executeRefund = async () => {
    setSubmitting(true);
    try {
      const txId = transaction.id || transaction.transaction_id;
      const res = await api.post(`admin/transactions/${txId}/refund`, {
        refund_amount: Number(refundAmount),
        refund_reason: refundReason,
        refund_from: refundFrom, // v365
        refund_reference: refundReference.trim(),
        refund_status: targetStatus,
        fee_correction_note: transaction.fee_correction_note || null
      });

      if (res.data && (res.data.success || res.data.transaction)) {
        toast.success(
          targetStatus === 'PROCESSED'
            ? `Refund of ₹${Number(refundAmount).toLocaleString('en-IN')} recorded as paid (UTR ${refundReference.trim()}).` // v332: no raw PROCESSED / PENDING
            : `Refund saved as pending.`
        );
        if (targetStatus === 'PROCESSED' && refundBrandId) {
          api.post("admin/refunds/notify", { brand_id: refundBrandId, kind: "processed", amount: Number(refundAmount), reference: refundReference.trim() }).catch(() => {});
        }
        if (onSuccess) onSuccess(res.data.transaction);
        onClose();
      } else {
        toast.error("Couldn't save the refund. Please try again."); // v332
      }
    } catch (err) {
      console.error("Error processing refund:", err);
      // v332: calm text, never raw "Request failed with status code 500"
      const m = err?.response?.data?.error || err?.response?.data?.detail;
      toast.error(typeof m === "string" && m && m.length < 160 ? m : "Couldn't save the refund. Nothing was changed — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PopupBackdrop className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <PopupPanel kind="modal" className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative text-[var(--text-primary)] max-h-[90dvh] overflow-y-auto">{/* v330: scrolls on short phones */}
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-default)] pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#9D7CFF]/15 text-[#9D7CFF] flex items-center justify-center font-bold shrink-0 border border-[#9D7CFF]/30">
              <RotateCcw size={20} />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-[var(--text-primary)]">
                {isPending ? 'Process Pending Refund / Fee Adjustment' : addingAnother ? 'Add another refund' : isProcessed ? 'Update Refund Record' : 'Issue Manual Refund'}
              </h3>
              <p className="text-xs text-[var(--text-tertiary)]">
                Manual ledger adjustment & UTR transfer tracking (No gateway API call)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close" /* v332 */
            className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-1.5 rounded-lg bg-[var(--bg-elevated)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Transaction Meta Card */}
        <div className="bg-[var(--bg-elevated)]/60 border border-[var(--border-default)] rounded-xl p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-default)]">
            <span className="text-[var(--text-tertiary)] font-medium">Transaction ID</span>
            <div className="flex items-center gap-1.5 font-mono font-semibold text-[var(--text-primary)] min-w-0">
              <span className="break-all">{transaction.id || transaction.transaction_id}</span>{/* v332: long ids wrap on phones */}
              <button
                onClick={() => copyToClipboard(transaction.id || transaction.transaction_id, 'Transaction ID')}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                title="Copy Tx ID"
                aria-label="Copy transaction ID" /* v332 */
              >
                <Copy size={12} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[var(--text-tertiary)] block mb-0.5">Creator</span>
              <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1">
                <User size={12} className="text-emerald-500" />
                <span>{transaction.creator_name || 'Creator'}</span>
              </div>
              <div className="text-[10px] font-mono text-[var(--text-tertiary)] truncate mt-0.5" title={transaction.creator_id}>
                ID: {transaction.creator_id || 'N/A'}
              </div>
            </div>

            <div>
              <span className="text-[var(--text-tertiary)] block mb-0.5">Brand / Campaign</span>
              <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1">
                <Building2 size={12} className="text-blue-500" />
                <span>{transaction.brand_name || 'Brand'}</span>
              </div>
              <div className="text-[10px] text-[var(--text-tertiary)] truncate mt-0.5" title={transaction.campaign_title}>
                {transaction.campaign_title || 'Deal'}
              </div>
            </div>
          </div>

          {/* Session 36: where to send the refund */}
          <div className="pt-2 border-t border-[var(--border-default)]" data-testid="admin-refund-account">
            <span className="text-[var(--text-tertiary)] block mb-1">Brand refund account</span>
            {refundAccount === undefined ? (
              <span className="text-[var(--text-secondary)]">Loading…</span>
            ) : refundAccount ? (
              <div className="font-mono text-[var(--text-primary)] space-y-0.5 select-all">
                {refundAccount.method_type === "UPI" ? (
                  <div>UPI: {refundAccount.upi_id}</div>
                ) : (
                  <>
                    <div>{refundAccount.account_holder_name}</div>
                    <div>A/c {refundAccount.bank_account_number} · IFSC {refundAccount.bank_ifsc}</div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="text-amber-600 font-semibold">Brand has not added a refund account yet.</span>
                {refundBrandId && (
                  <button type="button" disabled={asking} onClick={askBrandForAccount} className="px-2.5 py-1 rounded-lg border border-[var(--border-default)] text-[11px] font-semibold disabled:opacity-50">
                    {asking ? "Sending…" : "Ask brand to add it"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* v365 (Ravi: "admin mai dikhe brand se kitna aaya, kitni fees thi, refund kyu — amount main manually bharunga"):
              what the brand actually paid (deal + service fee − coupon), before the old GMV / fee / creator split. */}
          {Number(transaction.brand_paid_amount || 0) > 0 && (
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border-default)] text-center font-mono" data-testid="refund-brand-paid">
              <div className="bg-[var(--bg-card)] p-2 rounded-lg border border-[var(--border-default)]">
                <span className="text-[10px] text-[var(--text-tertiary)] block font-sans uppercase">Brand paid</span>
                <span className="font-bold">₹{Number(transaction.brand_paid_amount).toLocaleString('en-IN')}</span>
              </div>
              <div className="bg-[var(--bg-card)] p-2 rounded-lg border border-[var(--border-default)]">
                <span className="text-[10px] text-[#9D7CFF] block font-sans uppercase">Service fee{transaction.brand_fee_pct != null ? ` ${Number(transaction.brand_fee_pct)}%` : ""}</span>
                <span className="font-bold text-[#9D7CFF]">₹{Number(transaction.brand_fee_amount || 0).toLocaleString('en-IN')}</span>
              </div>
              <div className="bg-[var(--bg-card)] p-2 rounded-lg border border-[var(--border-default)]">
                <span className="text-[10px] text-[var(--text-tertiary)] block font-sans uppercase">Coupon</span>
                <span className="font-bold">{transaction.coupon_code || "—"}</span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border-default)] text-center font-mono">
            <div className="bg-[var(--bg-card)] p-2 rounded-lg border border-[var(--border-default)]">
              <span className="text-[10px] text-[var(--text-tertiary)] block font-sans uppercase">Agreed GMV</span>
              <span className="font-bold">₹{Number(transaction.gross_amount || 0).toLocaleString('en-IN')}</span>
            </div>
            <div className="bg-[var(--bg-card)] p-2 rounded-lg border border-[var(--border-default)]">
              <span className="text-[10px] text-[#9D7CFF] block font-sans uppercase">Fee Charged</span>
              <span className="font-bold text-[#9D7CFF]">₹{Number(transaction.platform_fee_amount || 0).toLocaleString('en-IN')}</span>
            </div>
            <div className="bg-[var(--bg-card)] p-2 rounded-lg border border-[var(--border-default)]">
              <span className="text-[10px] text-emerald-500 block font-sans uppercase">Creator Net</span>
              <span className="font-bold text-[#027A48]">₹{Number(transaction.creator_net_amount || 0).toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        {/* Fee Correction Warning / Info Banner */}
        {transaction.fee_correction_note && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <span className="font-bold text-amber-500 block uppercase tracking-wide">
                Fee Correction Note (Overcharge Audit)
              </span>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                {transaction.fee_correction_note}
              </p>
              {transaction.correct_fee_amount !== null && transaction.correct_fee_amount !== undefined && (
                <div className="text-[11px] font-mono text-amber-400/90 font-medium pt-0.5">
                  Recalculated Correct Fee: ₹{Number(transaction.correct_fee_amount).toLocaleString('en-IN')} | Overcharge Refund: ₹{Number(transaction.refund_amount || 0).toLocaleString('en-IN')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* v366: earlier refunds on this payment */}
        {addingAnother && (
          <div className={`rounded-xl p-3 text-xs font-semibold border ${fullyRefunded ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600' : 'bg-[#9D7CFF]/10 border-[#9D7CFF]/30 text-[var(--text-primary)]'}`} data-testid="refund-left">
            {fullyRefunded
              ? `Fully refunded · ₹${alreadyRefunded.toLocaleString('en-IN')} of ₹${paidTotal.toLocaleString('en-IN')} already sent back. Nothing left to refund.`
              : `Already refunded ₹${alreadyRefunded.toLocaleString('en-IN')} · can still refund ₹${leftToRefund.toLocaleString('en-IN')}`}
            {feeAlreadyRefunded > 0 && !fullyRefunded && (
              <span className="block font-normal text-[11px] text-[var(--text-tertiary)] mt-0.5">₹{feeAlreadyRefunded.toLocaleString('en-IN')} of that was the service fee.</span>
            )}
          </div>
        )}

        {/* Confirmation State View */}
        {showConfirmation ? (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
              <ShieldAlert size={20} />
              <span>Confirm Financial Action (No Undo)</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {/* v332: said the refund went "to creator" — refunds go back to the brand */}
              You are about to record a manual refund of <strong className="text-[#027A48] font-mono text-sm">₹{Number(refundAmount).toLocaleString('en-IN')}</strong> to the brand <strong className="text-[var(--text-primary)]">{transaction.brand_name || 'Brand'}</strong> as <strong className="text-[#027A48]">paid</strong> with reference UTR <strong className="font-mono text-[var(--text-primary)] bg-black/30 px-1.5 py-0.5 rounded">{refundReference}</strong>.
            </p>
            <p className="text-[11px] text-[var(--text-tertiary)] italic">
              Note: The money must be sent manually via UPI or net banking to the brand outside the application. This action records the transaction permanently in the platform audit log with your admin ID.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmation(false)}
                className="px-4 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl text-xs font-semibold hover:bg-[var(--bg-card)] transition-colors"
                disabled={submitting}
              >
                Back to Edit
              </button>
              <button
                type="button"
                onClick={executeRefund}
                disabled={submitting}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
              >
                {submitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} />
                    <span>Confirm &amp; mark as paid</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Form Controls */
          <form onSubmit={handleInitialSubmit} className="space-y-4 text-xs">
            {/* Refund Amount — v332: fields are 16px on phones (no iOS zoom) */}
            <div className="space-y-1.5">
              <label className="font-semibold text-[var(--text-primary)] flex items-center justify-between">
                <span>Refund Amount (₹) <span className="text-red-400">*</span></span>
                <span className="text-[11px] text-[var(--text-tertiary)] font-normal">
                  (Pre-filled from calculated overcharge / fee)
                </span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] font-bold">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-2.5 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl font-mono text-[16px] sm:text-sm font-bold text-[var(--text-primary)] focus:border-[#9D7CFF] focus:outline-none"
                />
              </div>
              {/* v365: where the money comes from */}
              {Number(transaction.brand_fee_amount || 0) > 0 && (
                <div className="flex gap-1.5 pt-1" data-testid="refund-from">
                  {[["deal", "From the deal (creator gets less)"], ["fee", "From the service fee (creator gets full pay)"]].map(([v, label]) => (
                    <button key={v} type="button" onClick={() => setRefundFrom(v)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${refundFrom === v ? "border-[#9D7CFF] text-[#9D7CFF] bg-[#9D7CFF]/10" : "border-[var(--border-default)] text-[var(--text-secondary)]"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {/* v365: quick fills — the admin still decides; any amount can be typed */}
              {Number(transaction.brand_paid_amount || 0) > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1" data-testid="refund-quick-fill">
                  {[
                    [addingAnother ? "Everything still left" : "Everything the brand paid", addingAnother ? leftToRefund : Number(transaction.brand_paid_amount)],
                    ["Deal amount only", Math.min(Math.max(0, Number(transaction.gross_amount || 0) - (alreadyRefunded - feeAlreadyRefunded)), addingAnother ? leftToRefund : Infinity)],
                    ["Service fee only", Math.min(Math.max(0, Number(transaction.brand_fee_amount || 0) + Number(transaction.brand_fee_gst || 0) - feeAlreadyRefunded), addingAnother ? leftToRefund : Infinity)],
                  ].filter(([, v]) => v > 0).map(([label, v]) => (
                    <button key={label} type="button" onClick={() => { setRefundAmount(String(v)); setRefundFrom(label === "Service fee only" ? "fee" : "deal"); }}
                      className="px-2.5 py-1 rounded-lg border border-[var(--border-default)] text-[11px] font-semibold text-[var(--text-secondary)] hover:border-[#9D7CFF]">
                      {label} · ₹{v.toLocaleString('en-IN')}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Refund Reason */}
            <div className="space-y-1.5">
              <label className="font-semibold text-[var(--text-primary)]">
                Refund Reason / Audit Note
              </label>
              <textarea
                rows={2}
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Enter reason for refund or fee adjustment..."
                className="w-full p-3 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl text-[16px] sm:text-xs text-[var(--text-primary)] focus:border-[#9D7CFF] focus:outline-none resize-none"
              />
            </div>

            {/* Reference / UTR Number */}
            <div className="space-y-1.5">
              <label className="font-semibold text-[var(--text-primary)] flex items-center justify-between">
                <span>Payment Reference / UTR Number <span className="text-red-400">*</span></span>
                <span className="text-[10px] text-[var(--text-tertiary)] font-normal">
                  (Bank/UPI transfer reference id)
                </span>
              </label>
              <input
                type="text"
                required={targetStatus === 'PROCESSED'}
                value={refundReference}
                onChange={(e) => setRefundReference(e.target.value)}
                placeholder="e.g. UPI/602910481234 or BANK/REF98765"
                className="w-full px-3.5 py-2.5 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl font-mono text-[16px] sm:text-xs text-[var(--text-primary)] focus:border-[#9D7CFF] focus:outline-none"
              />
            </div>

            {/* Target Status Selection */}
            <div className="space-y-2 pt-1">
              <label className="font-semibold text-[var(--text-primary)] block">
                Refund Action Status
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label
                  onClick={() => setTargetStatus('PROCESSED')}
                  className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                    targetStatus === 'PROCESSED'
                      ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400 font-semibold'
                      : 'bg-[var(--bg-card)] border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="refund_status"
                    checked={targetStatus === 'PROCESSED'}
                    onChange={() => setTargetStatus('PROCESSED')}
                    className="accent-emerald-500"
                  />
                  <div>
                    <span className="block text-xs text-[var(--text-primary)] font-bold">Mark as paid</span>{/* v332 */}
                    <span className="text-[10px] opacity-80 block">Money paid manually</span>
                  </div>
                </label>

                <label
                  onClick={() => setTargetStatus('PENDING')}
                  className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                    targetStatus === 'PENDING'
                      ? 'bg-amber-500/10 border-amber-500/50 text-amber-500 font-semibold'
                      : 'bg-[var(--bg-card)] border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="refund_status"
                    checked={targetStatus === 'PENDING'}
                    onChange={() => setTargetStatus('PENDING')}
                    className="accent-amber-500"
                  />
                  <div>
                    <span className="block text-xs text-[var(--text-primary)] font-bold">Save as pending</span>
                    <span className="text-[10px] opacity-80 block">Queue for review</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Existing Refund Audit Info if already processed */}
            {isProcessed && transaction.refunded_at && (
              <div className="p-3 bg-foreground/5 rounded-xl border border-[var(--border-default)] text-[11px] text-[var(--text-tertiary)] space-y-1 font-mono">
                <div>Processed Date: {new Date(transaction.refunded_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</div>{/* v332: IST */}
                <div>Processed By Admin: {transaction.refunded_by || 'Admin'}</div>
                <div>Existing UTR: {transaction.refund_reference || 'N/A'}</div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-default)]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl text-xs font-semibold hover:bg-[var(--bg-card)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || fullyRefunded}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  targetStatus === 'PROCESSED'
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-black shadow-md shadow-emerald-500/20'
                    : 'bg-amber-500 hover:bg-amber-600 text-black shadow-md shadow-amber-500/20'
                }`}
              >
                <RotateCcw size={14} />
                <span>{targetStatus === 'PROCESSED' ? 'Review & Process Refund' : 'Save Pending Refund'}</span>
              </button>
            </div>
          </form>
        )}
      </PopupPanel>
    </PopupBackdrop>
  );
}
