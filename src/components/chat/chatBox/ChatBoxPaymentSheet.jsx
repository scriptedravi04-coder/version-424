import BrandFeeSummary, { quoteTotal } from "../../payments/BrandFeeSummary"; // v364
import React from "react";
import { ShieldCheck, Check, X } from "lucide-react";
import CheckoutPicker from "../../payments/checkout/CheckoutPicker"; // v366
import { CheckoutDealCard, CheckoutPayBar } from "../../payments/checkout/CheckoutScreens"; // v366
import { motion, AnimatePresence } from "framer-motion";
import useScrollLock from "../../../lib/useScrollLock"; // v415
import { backdropMotion, sheetMotion } from "../../../lib/motion"; // v415: same motion as every other sheet


// Session 49 (clean-up): moved out of ChatBox.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function ChatBoxPaymentSheet(props) {
  const { currentThread, getDealAmount, handleEscrowPayment, isPaymentFunded, paymentLoading, paymentStep, setShowPaymentSheet, showPaymentSheet } = props;
  const [fee, setFee] = React.useState({ quote: null, couponCode: "" }); // v364
  const [method, setMethod] = React.useState("upi"); // v366: Ravi's checkout — Razorpay opens on the picked app / method
  // v332: "₹ 0" showed while the amount wasn't known — a dash / no amount instead (Razorpay shows the real total)
  const amt = Number(getDealAmount(currentThread)) || 0;
  const amtText = amt > 0 ? `₹${amt.toLocaleString('en-IN')}` : "";
  // v415: page behind doesn't scroll; Escape / backdrop close — but never while a payment is running.
  useScrollLock(Boolean(showPaymentSheet));
  const close = () => { if (!paymentLoading) setShowPaymentSheet(false); };
  React.useEffect(() => {
    if (!showPaymentSheet) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !paymentLoading) setShowPaymentSheet(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showPaymentSheet, paymentLoading, setShowPaymentSheet]);
  return (
    <AnimatePresence>
          {showPaymentSheet && (
            <div className="fixed inset-0 z-[1000] flex flex-col justify-end md:hidden" role="dialog" aria-modal="true" aria-label="Payment">{/* v415: above the bottom nav (was z-50) */}
              <motion.div
                {...backdropMotion}
                onClick={close}
                className="absolute inset-0 bg-black/60"
              />
              <motion.div
                {...sheetMotion}
                className="relative z-10 bg-[var(--bg-card)] rounded-t-3xl border-t border-[var(--border-default)] shadow-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[85dvh] overflow-y-auto" /* v330: dvh + home-bar padding */
              >
                {/* Drag handle */}
                <div className="w-12 h-1.5 bg-gray-300 dark:bg-neutral-700 rounded-full mx-auto mb-4" />

                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 border border-emerald-500/20 shrink-0">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-[var(--text-primary)]">Pay securely with Ybex</h4>{/* v415: plainer wording */}
                      <p className="text-xs text-[var(--text-secondary)]">Ybex holds your payment until you approve the work.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    disabled={paymentLoading}
                    aria-label="Close" /* v330 */
                    className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-500 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="bg-[var(--bg-elevated)] rounded-xl p-4 mb-4 border border-[var(--border-default)] text-left">
                  <div className="flex justify-between items-center">{/* v330: brand payment screens show the total only — the "Platform Security Fee FREE (₹ 0)" row is gone */}
                    <span className="text-xs text-[var(--text-secondary)] font-medium">Agreed amount</span>
                    <span className="text-sm font-bold text-[var(--text-primary)]">{amtText || "—" /* v330: was an invented ₹3,000 fallback */}</span>
                  </div>
                </div>

                {isPaymentFunded ? (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-left">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                      <Check size={16} />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-emerald-600">Payment received</h5>{/* v415: plainer wording */}
                      <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                        {amtText ? amtText : "Your payment" /* v330: was an invented ₹3,000 fallback */} is held safely by Ybex. The creator can start work now.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-left bg-white rounded-2xl">{/* v366: Ravi's checkout design */}
                    <CheckoutDealCard total={quoteTotal(fee.quote, amt)} note="Held safely by Ybex until you approve the work." /* v415: no "escrow" jargon */>
                      <BrandFeeSummary dealId={currentThread?.deal_id || null} threadId={currentThread?.id || null} grossAmount={getDealAmount(currentThread)} onQuote={setFee} disabled={paymentLoading} compact variant="checkout" />{/* v364 */}
                    </CheckoutDealCard>
                    <div className="mt-4"><CheckoutPicker value={method} onChange={setMethod} disabled={paymentLoading} /></div>
                    <CheckoutPayBar sticky={false} total={quoteTotal(fee.quote, amt)} choice={method} paying={paymentLoading} payingText={paymentStep || "Processing..."}
                      onPay={async () => {
                        const paid = await handleEscrowPayment(fee.couponCode || "", method);
                        if (paid) setShowPaymentSheet(false); // v415: stays open after a failed / cancelled payment so they can retry
                      }} testId="sheet-escrow-pay" />
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
  );
}
