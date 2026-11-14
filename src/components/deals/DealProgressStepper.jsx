import React, { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

export default function DealProgressStepper({ 
  stage = "IN_PROGRESS",
  // v332: no made-up "#5678" order number. A caller that passes only `stage` (the creator orders list)
  // got a whole header of placeholders ("UGC Video Campaign · by Brand Partner · #5678 · ₹—") — hidden now.
  orderNumber = null,
  brandName,
  brandLogo = null,
  trackingCode = null,
  deadline = null,
  title,
  payout = null,
  // v414: step 3 depends on the order type — collab orders wait for a live link, raw UGC orders are
  // just "Approved". "Payment cleared" only shows when a real UTR / payout reference exists.
  isCollab = null,
  utrNumber = null
}) {
  const showHeader = title != null || brandName != null || payout != null || Boolean(trackingCode || orderNumber);
  const [copied, setCopied] = useState(false);

  // Map backend status/stage to 4 creator panel stages
  const creatorStatus = String(stage || '').toUpperCase();

  const hasUtr = Boolean(utrNumber && String(utrNumber).trim()); // v414
  let activeIdx = 0;
  let statusHeadline = "In Production";
  let subtitleText = deadline ? `Estimated delivery date: ${deadline}` : "Filming & editing in progress";

  if (creatorStatus === "COMPLETED" || creatorStatus === "PAID" || creatorStatus === "RELEASED") {
    activeIdx = 3;
    statusHeadline = "Completed";
    // v416 (QA U25): there is no wallet — the payout goes to the creator's bank (same words as the order card)
    subtitleText = hasUtr ? "Content approved · payout sent to the bank" : "Content approved · payout reaches the bank in 1–2 working days";
  } else if (creatorStatus === "PROOF_SUBMITTED" || creatorStatus === "LIVE_LINK_SUBMITTED") {
    activeIdx = 2;
    statusHeadline = "Live Link Review";
    subtitleText = "Live post link submitted — under review for final payout release";
  } else if (
    creatorStatus === "CONTENT_APPROVED" || 
    creatorStatus === "AWAITING_LIVE_LINK" || 
    creatorStatus === "COMPLETED_APPROVAL"
  ) {
    activeIdx = 2;
    statusHeadline = "Waiting for Live Link";
    subtitleText = "Video draft approved — waiting for creator to post & submit live link";
  } else if (creatorStatus === "APPROVED" || creatorStatus === "PAYMENT_CLEARED") {
    activeIdx = 2;
    // v414: no "Payment Cleared" without a UTR
    statusHeadline = hasUtr ? "Payment Cleared" : "Approved";
    subtitleText = hasUtr ? "Work approved — payout released from the secure payment hold" : "Work approved — payout is being processed";
  } else if (creatorStatus === "PENDING_SIGNATURE") {
    // v414: was falling through to "In Production · Filming & editing in progress"
    activeIdx = -1;
    statusHeadline = "Agreement pending";
    subtitleText = "Sign the agreement to start production";
  } else if (
    creatorStatus === "EXPIRED" ||
    creatorStatus === "CANCELLED" ||
    creatorStatus === "CLOSED" ||
    creatorStatus === "REFUNDED"
  ) {
    // v414: closed orders no longer read "In Production"
    activeIdx = -1;
    statusHeadline = "Order closed";
    subtitleText = "This order is closed — no further work is needed";
  } else if (
    creatorStatus === "IN_REVIEW" || 
    creatorStatus === "SUBMITTED" || 
    creatorStatus === "CONTENT_SUBMITTED" || 
    creatorStatus === "DELIVERED" || 
    creatorStatus === "PENDING_REVIEW" ||
    creatorStatus === "UNDER_REVIEW"
  ) {
    activeIdx = 1;
    statusHeadline = "Waiting for Approval";
    subtitleText = "Deliverable submitted — currently under brand review";
  } else if (
    creatorStatus === "REVISION_DECLINED" || 
    creatorStatus === "DECLINED_REVISION" || 
    creatorStatus === "RESUBMISSION_DECLINED" ||
    creatorStatus.includes("DECLINE")
  ) {
    activeIdx = 1;
    statusHeadline = "Revisions Declined";
    subtitleText = "Creator declined the revision request. Review actions below.";
  } else if (creatorStatus === "REVISION_REQUESTED_LINKS") {
    activeIdx = 2;
    statusHeadline = "Live Link Resubmission";
    subtitleText = "Draft is approved — brand requested a corrected or updated live post link";
  } else if (creatorStatus === "REVISION_DECLINED_LINKS") {
    activeIdx = 2;
    statusHeadline = "Live Link Changes Declined";
    subtitleText = "Creator declined the live link change request";
  } else if (creatorStatus === "REVISION_REQUESTED" || creatorStatus === "REVISION_REQ") {
    activeIdx = 0;
    statusHeadline = "Revision Requested";
    subtitleText = "Brand requested minor tweaks to deliverable";
  } else {
    // IN_PROGRESS, PENDING, ACCEPTED
    activeIdx = 0;
    statusHeadline = "In Production";
    subtitleText = deadline ? `Estimated delivery date: ${deadline}` : "Filming & editing in progress";
  }

  // Exactly 4 Creator Panel Stages
  const steps = [
    { label: "In Production" },
    { label: "Waiting for Approval" },
    // v414: was always "Payment Cleared" (lit under "Waiting for Live Link")
    { label: isCollab === true ? "Live link" : (hasUtr ? "Payment cleared" : "Approved") },
    { label: "Completed" }
  ];

  const codeToCopy = trackingCode || orderNumber;

  const handleCopyCode = async (e) => {
    e.stopPropagation();
    if (!codeToCopy) return;
    // v332: said "copied" even when the browser blocked the clipboard
    try {
      await navigator.clipboard.writeText(codeToCopy);
      setCopied(true);
      toast.success("Order tracking code copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Please note the code down.");
    }
  };

  const displayTitle = (title && String(title).trim() !== "" && String(title).trim() !== "null") ? title : "UGC Video Campaign";

  return (
    <div className="w-full space-y-3.5 font-sans pb-4 border-b border-[var(--border-default)]">
      
      {/* Top Header Row with Brand Logo, Campaign Title and Brand Name */}
      {showHeader && (
      <div className="flex items-center justify-between gap-4 pb-3 border-b border-[var(--border-default)]">
        <div className="flex items-center gap-3 min-w-0">
          {/* Brand Logo from Backend */}
          {brandLogo ? (
            <img 
              src={brandLogo} 
              alt={brandName || "Brand"} 
              className="w-10 h-10 rounded-xl object-cover border border-[var(--border-default)] shrink-0 shadow-xs" 
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                if (e.currentTarget.nextElementSibling) {
                  e.currentTarget.nextElementSibling.style.display = 'flex';
                }
              }}
            />
          ) : null}
          <div 
            className={`w-10 h-10 rounded-xl bg-[var(--violet)]/10 text-[var(--violet)] border border-[var(--violet)]/20 flex items-center justify-center shrink-0 shadow-xs font-bold text-base uppercase ${brandLogo ? 'hidden' : 'flex'}`}
          >
            <span>{brandName ? brandName.charAt(0).toUpperCase() : "B"}</span>
          </div>

          <div className="min-w-0">
            <h4 className="text-base md:text-lg font-bold text-[var(--text-primary)] leading-snug truncate">
              {displayTitle}
            </h4>
            <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] mt-0.5">
              <span className="font-bold text-[var(--text-primary)] opacity-100 truncate">
                by {brandName || "Brand Partner"}
              </span>
              {codeToCopy && (<>
              <span className="text-[var(--text-tertiary)]">•</span>
              <span className="font-mono text-[var(--violet)] font-bold">{codeToCopy}</span>
              <button 
                type="button"
                onClick={handleCopyCode}
                className="text-[var(--violet)] hover:text-[var(--violet-hover)] transition-colors p-0.5 cursor-pointer"
                title="Copy Tracking ID"
                aria-label="Copy tracking ID"
              >
                {copied ? <Check size={13} /> : <Copy size={13} className="rotate-90" />}
              </button>
              </>)}
            </div>
          </div>
        </div>

        <div className="text-right shrink-0">
          <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider block">Payout</span>
          <span className="text-base font-black font-mono text-emerald-600 block">
            {Number(payout) > 0 ? `₹${Number(payout).toLocaleString('en-IN')}` : '—' /* v332: was "₹—" */}
          </span>
        </div>
      </div>
      )}

      {/* Big Status Headline & Subtitle */}
      <div className="space-y-0.5">
        <h2 className="text-xl md:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
          {statusHeadline}
        </h2>
        <p className="text-xs text-[var(--text-secondary)] font-medium">
          {subtitleText}
        </p>
      </div>

      {/* 4 Segmented Stepper Bars */}
      <div className="space-y-2.5 pt-1">
        {/* 4 Progress Bars */}
        <div className="grid grid-cols-4 gap-2 md:gap-3">
          {steps.map((_, idx) => {
            const isCompletedStage = creatorStatus === "COMPLETED" || creatorStatus === "PAID" || creatorStatus === "RELEASED";
            const isPassed = isCompletedStage ? true : idx < activeIdx;
            const isCurrent = !isCompletedStage && idx === activeIdx;

            return (
              <div 
                key={idx} 
                className={`h-2 rounded-full transition-all duration-500 relative overflow-hidden ${
                  isPassed || isCurrent 
                    ? "bg-[#059669]" 
                    : "bg-[var(--border-default)]"
                }`}
              />
            );
          })}
        </div>

        {/* 4 Step Icons & Labels Row */}
        <div className="grid grid-cols-4 gap-1 md:gap-2 text-center sm:text-left items-start sm:items-center">
          {steps.map((step, idx) => {
            const isCompletedStage = creatorStatus === "COMPLETED" || creatorStatus === "PAID" || creatorStatus === "RELEASED";
            const isPassed = isCompletedStage ? true : idx < activeIdx;
            const isCurrent = !isCompletedStage && idx === activeIdx;

            return (
              <div key={idx} className="flex flex-col sm:flex-row items-center gap-1.5 min-w-0">
                {isPassed ? (
                  <div className="w-4 h-4 rounded-full bg-[#059669] text-white flex items-center justify-center shrink-0">
                    <Check size={11} className="stroke-[3]" />
                  </div>
                ) : isCurrent ? (
                  <div className="w-4 h-4 rounded-full border-2 border-[#059669] bg-[var(--bg-surface)] flex items-center justify-center shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#059669]" />{/* v415: steady dot (endless ping looked like a loader) */}
                  </div>
                ) : (
                  <div className="w-4 h-4 rounded-full border border-[var(--border-strong)] bg-transparent shrink-0" />
                )}

                <span className={`text-[11px] sm:text-xs leading-tight sm:truncate max-sm:px-0.5 mt-1 sm:mt-0 ${
                  isPassed || isCurrent 
                    ? "font-bold text-[var(--text-primary)]" 
                    : "font-medium text-[var(--text-tertiary)]"
                }`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
