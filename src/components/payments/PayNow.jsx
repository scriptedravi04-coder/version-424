import React, { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { processRazorpayPayment } from "../../lib/razorpay";
import BrandFeeSummary, { quoteTotal } from "./BrandFeeSummary"; // v364
import CheckoutPicker from "./checkout/CheckoutPicker"; // v366
import { CheckoutDealCard, CheckoutPayBar } from "./checkout/CheckoutScreens"; // v366
import { toast } from 'sonner';

export default function PayNow({ dealId, creatorId, grossAmount }) {
  const [loading, setLoading] = useState(false);
  const [fee, setFee] = useState({ quote: null, couponCode: "" }); // v364
  const [method, setMethod] = useState("upi"); // v366: Ravi's checkout — Razorpay opens on the picked app / method

  const handlePay = async () => {
    if (loading) return; // one payment at a time
    if (!(Number(grossAmount) > 0)) { toast.error("The deal amount isn't set yet, so payment can't start."); return; }
    setLoading(true);
    await processRazorpayPayment({
      dealId,
      creatorId,
      grossAmount,
      couponCode: fee.couponCode || "", // v364
      method, // v366
      onSuccess: () => {
        setLoading(false);
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      },
      onError: () => {
        setLoading(false);
      }
    });
    setLoading(false); // the window was closed without paying
  };

  return (
    <div className="bg-[var(--bg-elevated)]/60 border border-[var(--border-default)] rounded-2xl p-6 md:p-8 max-w-lg mx-auto backdrop-blur-xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-[var(--violet)]/20 flex items-center justify-center text-[var(--violet)]">
          <CreditCard size={24} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Campaign Payment</h2>
          <p className="text-sm text-[var(--text-secondary)] relative top-0.5">Secure payment via platform</p>
        </div>
      </div>

      {/* v366: Ravi's checkout design — You pay + lines, UPI apps / other ways, Pay ₹X | via … */}
      <div className="bg-white rounded-2xl p-3">
        <CheckoutDealCard testId="paynow-card" total={quoteTotal(fee.quote, grossAmount)} note="Kept in Ybex escrow. The creator is paid only after you approve the deliverables." /* v415: plain words */>
          {/* v364: deal amount · service fee · coupon (server quote) */}
          <BrandFeeSummary dealId={dealId} grossAmount={grossAmount} onQuote={setFee} disabled={loading} compact variant="checkout" />
        </CheckoutDealCard>
        <div className="mt-4"><CheckoutPicker value={method} onChange={setMethod} disabled={loading} /></div>
        <CheckoutPayBar sticky={false} total={quoteTotal(fee.quote, grossAmount)} choice={method} paying={loading} onPay={handlePay} testId="paynow-pay" />
      </div>
    </div>
  );
}
