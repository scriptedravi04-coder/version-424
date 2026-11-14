import React, { useRef, useState } from "react";
import PayConsentLine from "../../legal/PayConsentLine";
import { Check, Clock, Lock, X, RotateCcw, HelpCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import MobileSheet, { SheetHeader } from "./MobileSheet";
import BrandFeeSummary, { quoteTotal } from "../../payments/BrandFeeSummary"; // v364
import CheckoutPicker from "../../payments/checkout/CheckoutPicker"; // v366
import { CheckoutDealCard, CheckoutPayBar, CheckoutHandoff, CheckoutSuccess } from "../../payments/checkout/CheckoutScreens"; // v366

// Session 23. This sheet used to say "Payment secured · ₹X is held in a secure payment hold" and
// a "free" platform fee for EVERY deal — before any payment, with a fee the server does not
// charge. "Make payment" opened it and nothing was paid. Now:
//   - funded      → the real status (held in escrow until approval);
//   - brand, not funded → a real "Pay into a secure payment hold" button (same Razorpay flow as desktop);
//   - creator, not funded → "waiting for the brand to fund".
// Session 57 — Ravi's Money screens design (PY-10 review · PY-12 success · PY-13 not completed).
// v332: "₹0" / "Pay ₹0" showed when the amount wasn't loaded yet — a dash instead (Razorpay shows the real total).
// v366 — Ravi's Checkout.dc.html ("ye review & pay bekar hai"): 01 Review & pay (deal card, UPI app tiles, other ways,
// sticky "Pay ₹X | via PhonePe") → 02 "Opening secure checkout" (Cancel) → Razorpay's own window, opened on the app the
// brand tapped → 04 "Escrow funded" with the Razorpay ID + receipt. The design's 03 ("approve in your UPI app") is
// Razorpay's own step inside its window, so it isn't copied here. The payment-app marks are the real ones from
// Ravi's logo file (common/PaymentLogo) — the old public pay-logos drop-in folder is no longer needed.
const inr = (n) => (Number(n) > 0 ? `₹${Number(n).toLocaleString("en-IN")}` : "—");
const F = "'DM Sans',sans-serif";

export default function MobileEscrowSheet({ onClose, amount, isBrand, isFunded, isDealCompleted, onPay, paying, campaignTitle = "", partnerName = "", dealId = null, threadId = null }) {
  const navigate = useNavigate();
  const [result, setResult] = useState(null); // null | "ok" | "failed"
  const [method, setMethod] = useState("upi"); // v366: a choice string — "upi" | "upi:phonepe" | "upi:collect" | "card" | "netbanking"
  const [fee, setFee] = useState({ quote: null, couponCode: "" }); // v364: server total (deal + service fee − coupon)
  const [handoff, setHandoff] = useState(false); // v366: 02 · Opening secure checkout
  const [opened, setOpened] = useState(false); // Razorpay's window is up
  const [payment, setPayment] = useState(null); // v366: verified payment (payment_id) for 04
  const [paidAt, setPaidAt] = useState(null);
  const cancelRef = useRef({ cancelled: false });
  const payTotal = quoteTotal(fee.quote, amount);
  const Row = ({ label, value, strong }) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ font: `500 13px ${F}`, color: "#6B7280" }}>{label}</span>
      <span style={{ font: `${strong ? 800 : 600} 13px ${F}`, color: "#0A0A0A", textAlign: "right" }}>{value}</span>
    </div>
  );

  const pay = async () => {
    if (paying || handoff) return;
    const cancel = { cancelled: false };
    cancelRef.current = cancel;
    setOpened(false);
    setHandoff(true);
    const ok = await onPay?.(method, fee.couponCode || "", { cancel, onOpen: () => setOpened(true) });
    setHandoff(false);
    if (!ok && cancel.cancelled) return; // Cancel on 02 → back on Review & pay, nothing was charged
    if (ok) { setPayment(typeof ok === "object" ? ok : null); setPaidAt(new Date().toISOString()); }
    setResult(ok ? "ok" : "failed"); // a payment that still went through after Cancel shows as paid
  };
  const cancelHandoff = () => { cancelRef.current.cancelled = true; setHandoff(false); };

  // 04 · Escrow funded (v366; was PY-12)
  if (result === "ok") {
    return (
      <MobileSheet onClose={onClose}>
        <div data-testid="escrow-paid">
        <CheckoutSuccess total={payTotal} choice={method} payment={payment} paidAt={paidAt} payee={partnerName} campaignTitle={campaignTitle}
          quote={fee.quote} gross={amount} onDone={onClose} doneLabel="Go to deal"
          onSecondary={() => navigate("/brand/payments")} secondaryLabel="View in Payments" />
        </div>
      </MobileSheet>
    );
  }

  // 02 · Handoff to Razorpay (v366)
  if (handoff) {
    return (
      <MobileSheet onClose={null}>
        <CheckoutHandoff total={payTotal} choice={method} payee={partnerName} opened={opened} onCancel={cancelHandoff} />
      </MobileSheet>
    );
  }

  // PY-13 · not completed
  if (result === "failed") {
    return (
      <MobileSheet onClose={onClose}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 6 }} data-testid="escrow-failed">
          <div style={{ width: 60, height: 60, borderRadius: 30, background: "#FEECEC", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={28} color="#DC2626" strokeWidth={3} />
          </div>
          <div style={{ marginTop: 12, font: `800 20px ${F}`, color: "#0A0A0A" }}>Payment didn't go through</div>
          <div style={{ marginTop: 6, font: `500 13.5px/1.5 ${F}`, color: "#6B7280" }}>
            It was cancelled, declined or timed out. {partnerName ? `${partnerName} isn't hired yet` : "Nothing changed on this deal"} — you can try again.
          </div>
        </div>
        <div style={{ marginTop: 16, borderRadius: 16, background: "#FFF8EB", border: "1px solid #FBE3B5", padding: 14 }}>
          <div style={{ font: `700 13.5px ${F}`, color: "#7A4A06" }}>Money debited from your bank?</div>
          <div style={{ marginTop: 4, font: `500 12.5px/1.5 ${F}`, color: "#92612A" }}>
            If it was taken and this deal still shows unpaid, it is recorded automatically within a few minutes, or returned to the same account by Razorpay. You will never be charged twice for this deal.
          </div>
        </div>
        <button onClick={() => { setResult(null); }} style={{ marginTop: 16, width: "100%", height: 50, borderRadius: 14, background: "#7C3AED", border: "none", font: `700 15px ${F}`, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <RotateCcw size={16} /> Try again{Number(payTotal) > 0 ? ` · ${inr(payTotal)}` : ""}
        </button>
        <button onClick={() => navigate("/help/tickets")} style={{ marginTop: 8, width: "100%", height: 46, borderRadius: 14, background: "#fff", border: "1px solid #E2DFEA", font: `700 14px ${F}`, color: "#0A0A0A", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <HelpCircle size={15} /> Need help? Contact Ybex support
        </button>
      </MobileSheet>
    );
  }

  const state = isDealCompleted ? "released" : isFunded ? "held" : isBrand ? "pay" : "waiting";
  const note = {
    released: { icon: <Check size={17} color="#0E9F6E" strokeWidth={2.3} />, bg: "#E3F7EE", title: "Payment released", body: "The deal is complete and secure payment hold has been released.", c1: "#0E7A55", c2: "#0E7A55" },
    // v332: the brand was told "…after the brand approves" about itself; no "— is held" without an amount
    held: { icon: <Check size={17} color="#0E9F6E" strokeWidth={2.3} />, bg: "#E3F7EE", title: "Payment secured", body: `${Number(amount) > 0 ? inr(amount) : "The payment"} is held in a secure payment hold and is released only after ${isBrand ? "you approve" : "the brand approves"} the delivery.`, c1: "#0E7A55", c2: "#0E7A55" },
    pay: { icon: <Lock size={16} color="#7C3AED" strokeWidth={2.2} />, bg: "#F5F0FF", title: "Money stays locked in Ybex escrow", body: `It moves to ${partnerName || "the creator"} only after you approve the work. If the deal falls through, Ybex support handles the refund.` /* v358: there is no automatic deadline refund */, c1: "#5B16C9", c2: "#6D28D9" },
    waiting: { icon: <Clock size={17} color="#D97706" strokeWidth={2.1} />, bg: "#FFFBEB", title: "Waiting for the brand", body: "Start work only after the brand funds the secure payment hold — you'll be notified here.", c1: "#92400E", c2: "#B45309" },
  }[state];

  if (state === "pay") {
    // 01 · Review & pay (v366)
    return (
      <MobileSheet onClose={onClose}>
        <SheetHeader title="Review & pay" subtitle="Fund escrow to hire · secure checkout" onClose={onClose} />
        <div style={{ marginTop: 14 }}>
          <CheckoutDealCard total={payTotal} title={partnerName ? `Hiring ${partnerName}` : campaignTitle} subtitle={partnerName ? campaignTitle : ""} initial={partnerName || campaignTitle}
            note={`Held in Ybex escrow. It moves to ${partnerName || "the creator"} only after you approve the work; if the deal falls through, Ybex support handles the refund.` /* v358: no automatic deadline refund */}>
            {/* v364: Deal amount · Service fee (8%) · Coupon — from the server (POST payments/quote), same as Razorpay */}
            <BrandFeeSummary dealId={dealId} threadId={threadId} grossAmount={amount} onQuote={setFee} disabled={paying} compact variant="checkout" />
          </CheckoutDealCard>
        </div>
        <div style={{ marginTop: 18 }}>
          <CheckoutPicker value={method} onChange={setMethod} disabled={paying} />
        </div>
        <div style={{ marginTop: 12, font: `500 11.5px/1.45 ${F}`, color: "#6B7280", textAlign: "center" }}>
          <Lock size={12} color="#0E9F6E" style={{ display: "inline", verticalAlign: "-2px", marginRight: 5 }} />
          Razorpay opens on your choice — you can still switch there. Card details never reach Ybex.
        </div>
        <CheckoutPayBar total={payTotal} choice={method} paying={paying} onPay={pay} testId="escrow-pay">
          <PayConsentLine style={{ margin: "0 0 8px", fontSize: 11 }} />
        </CheckoutPayBar>
      </MobileSheet>
    );
  }

  return (
    <MobileSheet onClose={onClose}>
      <SheetHeader title="Secure payment hold" subtitle="Funds stay protected until delivery is approved." onClose={onClose} />

      <div style={{ marginTop: 14, borderRadius: 16, background: "#F7F6FA", border: "1px solid #EEEDF3", padding: 14 }} data-testid="escrow-review">
        {(partnerName || campaignTitle) && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "#F2EAFF", color: "#7C3AED", font: `800 15px ${F}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {String(partnerName || campaignTitle || "?").charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              {partnerName && <div style={{ font: `700 14px ${F}`, color: "#0A0A0A", overflowWrap: "anywhere" }}>{isBrand ? `Hiring ${partnerName}` : partnerName}</div>}
              {campaignTitle && <div style={{ font: `500 12px ${F}`, color: "#6B7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{campaignTitle}</div>}
            </div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Row label="Deal amount" value={inr(amount)} />
          <Row label="Status" value={state === "released" ? "Released" : state === "held" ? "Held in a secure payment hold" : "Not funded"} />
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 11, padding: "13px 14px", borderRadius: 14, background: note.bg }}>
        <div style={{ flexShrink: 0, marginTop: 1 }}>{note.icon}</div>
        <div>
          <div style={{ font: `700 13px ${F}`, color: note.c1 }}>{note.title}</div>
          <div style={{ marginTop: 3, font: `500 12.5px/1.5 ${F}`, color: note.c2 }}>{note.body}</div>
        </div>
      </div>

      <button
        onClick={onClose}
        style={{ marginTop: 16, width: "100%", height: 52, borderRadius: 14, background: "#7C3AED", border: "none", font: `700 15px ${F}`, color: "#fff", cursor: "pointer" }}
      >
        Back to chat
      </button>
    </MobileSheet>
  );
}
