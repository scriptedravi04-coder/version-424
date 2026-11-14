import React from "react";
import PayConsentLine from "../../legal/PayConsentLine";
import { CreditCard, Loader2 } from "lucide-react";
import BrandFeeSummary, { quoteTotal } from "../../payments/BrandFeeSummary"; // v364


// Session 49 (clean-up): moved out of SystemMessage.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function SysContractSignedCard(props) {
  const { amount, campaignName, handleEscrowPayment, isUserBrand, paymentLoading, paymentStep, thread, timeText } = props;
  // v364: service fee + coupon from the server; the coupon goes to the payment
  const [fee, setFee] = React.useState({ quote: null, couponCode: "" });
  const payTotal = quoteTotal(fee.quote, amount);
  return (
    <div className="w-full max-w-[270px] sm:max-w-[340px] md:max-w-[380px] p-3 md:p-5 shadow-md md:shadow-xl rounded-xl md:rounded-2xl bg-white border border-emerald-200 text-left relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-500 to-emerald-600 rounded-l-xl md:rounded-l-2xl" />
            
            {/* Header */}
            <div className="flex justify-between items-center mb-2 md:mb-4">
              <span className="text-[11px] md:text-[10px] font-bold uppercase tracking-wider text-emerald-600 font-mono bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">
                Contract Sealed 🤝
              </span>
              <span className="text-[11px] md:text-[10px] text-slate-500 font-medium font-mono">{timeText}</span>
            </div>

            {/* Amount */}
            <div className="text-xl md:text-3xl font-mono font-black tracking-tight mb-2 md:mb-4 flex items-baseline text-slate-900">
              {/* v332: no "₹0" when the amount isn't known yet */}
              {Number(amount) > 0 ? (<><span className="text-sm md:text-lg mr-1 text-slate-500 font-bold">₹</span>
              <span>{Number(amount).toLocaleString('en-IN')}</span></>) : <span className="text-base md:text-xl text-slate-500">—</span>}
            </div>

            {/* Details */}
            <div className="space-y-1.5 md:space-y-3 pt-2 md:pt-3 border-t border-slate-100">
              <div className="flex justify-between text-[10px] md:text-xs">
                <span className="text-slate-500">Campaign</span>
                <span className="font-semibold text-slate-800 truncate max-w-[120px] md:max-w-[160px]">{campaignName}</span>
              </div>
              
              <div className="flex justify-between text-[10px] md:text-xs">
                <span className="text-slate-500">Creator Signature</span>
                <span className="font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.2 rounded text-[11px] md:text-[10px]">
                  Signed ✓
                </span>
              </div>

              <div className="flex justify-between text-[10px] md:text-xs">
                <span className="text-slate-500">Brand Signature</span>
                <span className="font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.2 rounded text-[11px] md:text-[10px]">
                  Signed ✓
                </span>
              </div>
            </div>

            <div className="border-t border-slate-100 my-2.5 md:my-4" />

            <div className="text-xs md:text-sm font-extrabold text-emerald-600 mb-0.5">
              Deal locked successfully! 🎉{/* v332: no shouting caps */}
            </div>
            <div className="text-[10px] md:text-xs font-semibold text-slate-700 leading-snug mb-1">
              Partnership agreement has been digitally signed and legally executed.
            </div>

            {isUserBrand && !thread?.payment_funded && (
              <>
              <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <BrandFeeSummary dealId={thread?.deal_id || null} threadId={thread?.id || null} grossAmount={amount} onQuote={setFee} disabled={paymentLoading} compact />
              </div>
              <PayConsentLine style={{ marginTop: 10 }} />
              <button
                type="button"
                onClick={() => handleEscrowPayment(fee.couponCode || "")}
                disabled={paymentLoading}
                className="w-full mt-2.5 md:mt-4 py-2 md:py-3 px-3 md:px-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/40 text-slate-950 font-extrabold text-[10px] md:text-xs rounded-lg md:rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {paymentLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={13} />
                    <span>{paymentStep || "Processing…" /* v332: spinner had no text */}</span>
                  </>
                ) : (
                  <>
                    <CreditCard size={13} />
                    <span>Pay {Number(payTotal) > 0 ? `₹${Number(payTotal).toLocaleString('en-IN')} ` : ""}via Razorpay{/* v332: no "Pay ₹0"; v364: total incl. service fee */}</span>
                  </>
                )}
              </button>
              </>
            )}
          </div>
  );
}
