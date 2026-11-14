import React from "react";


// Session 49 (clean-up): moved out of ChatBox.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function ChatBoxDealStrip(props) {
  const { currentThread, flowState, getDealAmount, isAgreementSigned, isDealCompleted, isDealFixed, isEscrowFunded, rawStatus, isCancelled } = props;
  // v332: an unknown amount showed a made-up "₹3,000" — now the line simply leaves the amount out.
  const amt = Number(getDealAmount(currentThread)) || 0;
  const amtText = amt > 0 ? `₹${amt.toLocaleString('en-IN')} ` : "";
  // v415: a cancelled deal is neutral grey with a still dot (was amber + pulsing, or green if it had been paid)
  const tone = isCancelled ? "grey" : (isDealCompleted || isEscrowFunded) ? "green" : "amber";
  return <>{(isAgreementSigned || rawStatus === 'ACTIVE' || flowState === 'ACTIVE' || isDealFixed) && (
        <div className={`w-full shrink-0 z-10 px-3.5 py-2 md:px-6 md:py-2.5 border-b flex items-center justify-between text-xs backdrop-blur-xs transition-colors ${
          tone === "grey"
            ? "bg-slate-50/95 dark:bg-slate-900/50 border-slate-200/80 dark:border-slate-700/50"
            : tone === "green"
            ? "bg-emerald-50/95 dark:bg-emerald-950/50 border-emerald-200/80 dark:border-emerald-800/50"
            : "bg-amber-50/95 dark:bg-amber-950/50 border-amber-200/80 dark:border-amber-800/50"
        }`}>
          <div className={`flex items-center gap-2 font-semibold min-w-0 ${
            tone === "grey"
              ? "text-slate-600 dark:text-slate-300"
              : tone === "green"
              ? "text-emerald-800 dark:text-emerald-300"
              : "text-amber-800 dark:text-amber-300"
          }`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${
              tone === "grey"
                ? "bg-slate-400"
                : tone === "green"
                ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                : "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)] animate-pulse"
            }`} />
            <span className="truncate text-xs md:text-sm">
              {isCancelled
                ? "Deal cancelled" /* v414 */
                : isDealCompleted
                ? `Deal completed · ${amtText}${currentThread?.utr_number || currentThread?.payout_utr ? "paid to creator" : "payout processing"}` /* v414: "released" only after Ybex pays */
                : isEscrowFunded
                  ? `Deal active · ${amt > 0 ? amtText : "payment "}held safely by Ybex` /* v415: plainer wording */
                  : "Deal active · Payment pending"
              }
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {isCancelled ? null /* v415: no "Completed" / payment chip on a cancelled deal */ : isDealCompleted ? (
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-bold text-[10px] uppercase tracking-wider border border-emerald-300/50 dark:border-emerald-700/50">
                Completed
              </span>
            ) : isEscrowFunded ? (
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-bold text-[10px] uppercase tracking-wider border border-emerald-300/50 dark:border-emerald-700/50">
                Payment held {/* v415: was "Secure Payment Hold" */}
              </span>
            ) : null}
          </div>
        </div>
      )}</>;
}
