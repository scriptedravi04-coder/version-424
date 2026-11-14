import React, { useState } from "react";
import { Lock, ShieldCheck, Check, Download, ArrowRight, Loader2 } from "lucide-react";
import PaymentLogo from "../../common/PaymentLogo";
import InvoiceModal from "../InvoiceModal";
import { choiceLabel, parseMethodChoice } from "./checkoutMethods";

// v366 — Ravi's Checkout.dc.html, the parts every Review & pay screen shares:
//   CheckoutDealCard   01 · "You pay ₹X" + the fee lines (BrandFeeSummary variant="checkout" goes in as children)
//   CheckoutPayBar     01 · sticky "Pay ₹X | via PhonePe" + "Payments secured by Razorpay · PCI DSS"
//   CheckoutHandoff    02 · "Opening secure checkout" while the order is made and Razorpay's window comes up
//   CheckoutSuccess    04 · "Escrow funded" with the real Razorpay payment id and the receipt (InvoiceModal)
// Screen 03 of the design ("Approve in your UPI app" with our own timer) is NOT built: with Razorpay Standard Checkout
// the approve-in-app step runs inside Razorpay's own window, so a Ybex copy of it would show a state we can't see.
const F = "'DM Sans',sans-serif";
const INK = "#0A0A0A";
const MUTED = "#6B7280";
const PURPLE = "#7C3AED";
export const inr = (n) => (Number(n) > 0 ? `₹${Math.round(Number(n)).toLocaleString("en-IN")}` : "—");

export function CheckoutDealCard({ total, title, subtitle, initial, note, children, testId = "escrow-review" }) {
  return (
    <div data-testid={testId} style={{ borderRadius: 18, border: "1px solid #ECE8F6", background: "linear-gradient(180deg,#FBF9FF 0%,#fff 62%)", padding: 16, boxShadow: "0 10px 28px -22px rgba(91,22,201,.55)" }}>
      {(title || subtitle) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "#F2EAFF", color: PURPLE, font: `800 15px ${F}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {String(initial || title || subtitle || "?").charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            {title && <div style={{ font: `700 14px ${F}`, color: INK, overflowWrap: "anywhere" }}>{title}</div>}
            {subtitle && <div style={{ font: `500 12px ${F}`, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</div>}
          </div>
        </div>
      )}
      <div style={{ font: `600 12px ${F}`, color: MUTED }}>You pay</div>
      <div data-testid="checkout-total" style={{ font: `800 32px ${F}`, color: INK, letterSpacing: "-0.8px", lineHeight: 1.15 }}>{inr(total)}</div>
      {children && <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed #E4DFF0" }}>{children}</div>}
      {note && (
        <div style={{ marginTop: 12, display: "flex", gap: 9, alignItems: "flex-start", padding: "10px 11px", borderRadius: 12, background: "#F3EEFF" }}>
          <Lock size={14} color="#6D28D9" strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ font: `500 12px/1.45 ${F}`, color: "#4C1D95" }}>{note}</span>
        </div>
      )}
    </div>
  );
}

export function RazorpayTrust({ style }) {
  return (
    <div data-testid="checkout-trust" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, font: `500 11.5px ${F}`, color: "#8E8A99", ...style }}>
      <ShieldCheck size={13} color="#0E9F6E" style={{ flexShrink: 0 }} />
      <span>Payments secured by</span>
      <PaymentLogo name="razorpay" height={12} />
      <span>· PCI DSS</span>
    </div>
  );
}

/** Sticky pay bar. `sticky` pins it to the bottom of a scrolling sheet (MobileSheet pads 24px + safe area under it). */
export function CheckoutPayBar({ total, choice, paying = false, disabled = false, onPay, testId = "escrow-pay", sticky = true, payingText = "Waiting for payment…", children }) {
  const label = choiceLabel(choice);
  const off = paying || disabled;
  return (
    <div data-testid="checkout-paybar" style={sticky ? { position: "sticky", bottom: "calc(-24px - env(safe-area-inset-bottom, 0px))", zIndex: 2, margin: "16px -20px calc(-24px - env(safe-area-inset-bottom, 0px))", padding: "12px 20px calc(14px + env(safe-area-inset-bottom, 0px))", background: "rgba(255,255,255,.97)", borderTop: "1px solid #EEEDF3", boxShadow: "0 -10px 24px -18px rgba(20,17,28,.35)" } : { marginTop: 16 }}>
      {children}
      <button type="button" disabled={off} onClick={onPay} data-testid={testId}
        style={{ width: "100%", height: 54, borderRadius: 15, border: "none", background: PURPLE, color: "#fff", cursor: off ? "default" : "pointer", opacity: disabled && !paying ? 0.55 : paying ? 0.8 : 1,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 12px 26px -14px rgba(124,58,237,.9)" }}>
        {paying ? (
          <><Loader2 size={17} className="animate-spin" /><span style={{ font: `700 15px ${F}` }}>{payingText}</span></>
        ) : (
          <>
            <Lock size={15} strokeWidth={2.4} />
            <span style={{ font: `800 16px ${F}` }}>{`Pay ${Number(total) > 0 ? inr(total) : ""}`.trim()}</span>
            <span aria-hidden="true" style={{ width: 1, height: 18, background: "rgba(255,255,255,.35)" }} />
            <span style={{ font: `600 13.5px ${F}`, color: "rgba(255,255,255,.9)" }}> via {label}</span>
          </>
        )}
      </button>
      <RazorpayTrust style={{ marginTop: 9 }} />
    </div>
  );
}

function KV({ k, v, testId, mono }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "9px 0" }} data-testid={testId}>
      <span style={{ font: `500 13px ${F}`, color: MUTED }}>{k}</span>
      <span style={{ font: `${mono ? "600 12.5px ui-monospace,Menlo,monospace" : `700 13px ${F}`}`, color: INK, textAlign: "right", overflowWrap: "anywhere", minWidth: 0 }}>{v}</span>
    </div>
  );
}

function MethodValue({ choice }) {
  const c = parseMethodChoice(choice);
  const logo = c.app || (c.method === "upi" ? "upi" : null);
  const text = c.method === "card" ? "Debit / credit card" : c.method === "netbanking" ? "Net banking" : choiceLabel(choice);
  if (c.app) { // the app's own mark already spells its name — the text stays for screen readers
    return (
      <span style={{ display: "inline-flex", alignItems: "center" }}>
        <PaymentLogo name={c.app} height={18} maxWidth={96} alt="" />
        <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{text}</span>
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {logo && <PaymentLogo name={logo} height={13} maxWidth={48} />}
      <span>{text}</span>
    </span>
  );
}

const HANDOFF_CSS = "@keyframes ybexCheckoutBar{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}";

/** 02 · Handoff to Razorpay. Shown while the order is created and Razorpay's window opens over it. */
export function CheckoutHandoff({ total, choice, payee, onCancel, opened = false }) {
  return (
    <div data-testid="checkout-handoff" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 8 }}>
      <style>{HANDOFF_CSS}</style>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: "#F3EEFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Lock size={28} color={PURPLE} strokeWidth={2.2} />
      </div>
      <div style={{ marginTop: 14, font: `800 20px ${F}`, color: INK }}>{opened ? "Finish in Razorpay" : "Opening secure checkout"}</div>
      <div style={{ marginTop: 6, font: `500 13px/1.5 ${F}`, color: MUTED, maxWidth: 300 }}>
        {opened ? "Complete the payment in Razorpay's window. Approving in a UPI app? Come back here after — we'll confirm it." : "Handing you to Razorpay. Don't close the app."}
      </div>
      <div role="progressbar" aria-label="Opening checkout" style={{ marginTop: 18, width: "100%", height: 6, borderRadius: 3, background: "#EFEAFB", overflow: "hidden" }}>
        <div style={{ width: "40%", height: "100%", borderRadius: 3, background: "linear-gradient(90deg,#A78BFA,#7C3AED)", animation: "ybexCheckoutBar 1.1s ease-in-out infinite" }} />
      </div>
      <div style={{ marginTop: 18, width: "100%", borderRadius: 16, border: "1px solid #EEEDF3", padding: "4px 14px", textAlign: "left" }}>
        <KV k="Paying to" v={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Ybex escrow{payee ? ` · for ${payee}` : ""}</span>} testId="handoff-payee" />
        <div style={{ height: 1, background: "#F1EFF5" }} />
        <KV k="Method" v={<MethodValue choice={choice} />} testId="handoff-method" />
        <div style={{ height: 1, background: "#F1EFF5" }} />
        <KV k="Amount" v={inr(total)} testId="handoff-amount" />
      </div>
      <RazorpayTrust style={{ marginTop: 14 }} />
      <button type="button" onClick={onCancel} data-testid="checkout-cancel"
        style={{ marginTop: 14, width: "100%", height: 48, borderRadius: 14, background: "#fff", border: "1px solid #E2DFEA", font: `700 14px ${F}`, color: INK, cursor: "pointer" }}>
        Cancel
      </button>
    </div>
  );
}

const fmtDate = (d) => {
  const t = d ? new Date(d) : null;
  if (!t || Number.isNaN(t.getTime())) return "—";
  return t.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).replace(/\b(am|pm)\b/g, (s) => s.toUpperCase());
};

/** The brand's receipt for InvoiceModal, from what the server quoted and Razorpay confirmed (no extra call). Pure. */
export function receiptFromPayment({ payment, quote, total, gross, campaignTitle, paidAt }) {
  const q = quote || {};
  const g = Number(payment?.gross_amount) > 0 ? Number(payment.gross_amount) : Number(q.gross) > 0 ? Number(q.gross) : Number(gross) || 0;
  const split = q.feeModel === "split";
  return {
    id: payment?.payment_id || payment?.order_id || "direct",
    razorpay_payment_id: payment?.payment_id || null,
    gross_amount: g,
    ...(Number(q.creatorNet) > 0 ? { creator_net_amount: Number(q.creatorNet), platform_fee_amount: Math.max(0, g - Number(q.creatorNet)) } : {}),
    ...(split ? { brand_fee_pct: Number(q.brandFeePercent) || 0, brand_fee_amount: Number(q.brandFee) || 0, brand_fee_gst: Number(q.brandFeeGst) || 0, coupon_code: q.couponCode || null } : {}),
    brand_paid_amount: Number(total) > 0 ? Number(total) : g,
    campaign_title: campaignTitle || undefined,
    status: "ESCROW_HELD",
    created_at: paidAt || new Date().toISOString(),
  };
}

/** 04 · Escrow funded. */
export function CheckoutSuccess({ total, choice, payment, paidAt, payee, campaignTitle, quote, gross, onDone, doneLabel = "Go to deal", onSecondary, secondaryLabel, steps, brandName, testId = "checkout-success" }) {
  const [receipt, setReceipt] = useState(false);
  const who = payee || "The creator";
  const next = steps || [
    `${who} gets notified and starts on the brief.`,
    "You review the work in the chat.",
    `Escrow releases to ${payee || "the creator"} only after you approve.`,
  ];
  const payId = payment?.payment_id || null;
  return (
    <div data-testid={testId}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 6 }}>
        <div style={{ width: 66, height: 66, borderRadius: 33, background: "#E3F7EE", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 8px #F1FBF6" }}>
          <span style={{ width: 46, height: 46, borderRadius: 23, background: "#0E9F6E", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Check size={26} color="#fff" strokeWidth={3.2} />
          </span>
        </div>
        <div style={{ marginTop: 14, font: `800 20px ${F}`, color: INK }}>Escrow funded</div>
        <div data-testid="success-amount" style={{ marginTop: 2, font: `800 30px ${F}`, color: INK, letterSpacing: "-0.6px" }}>{inr(total)}</div>
        <div style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 5, font: `600 12.5px ${F}`, color: "#0E7A55" }}>
          <Lock size={13} strokeWidth={2.4} /> Locked in Ybex escrow{payee ? ` · ${payee} is hired` : ""}
        </div>
      </div>
      <div style={{ marginTop: 16, borderRadius: 16, border: "1px solid #EEEDF3", padding: "4px 14px" }}>
        <KV k="Paid with" v={<MethodValue choice={choice} />} testId="success-method" />
        <div style={{ height: 1, background: "#F1EFF5" }} />
        <KV k="Date" v={fmtDate(paidAt)} testId="success-date" />
        <div style={{ height: 1, background: "#F1EFF5" }} />
        <KV k="Razorpay ID" v={payId || "Shown in Payments shortly"} mono={Boolean(payId)} testId="success-payment-id" />
      </div>
      <div style={{ marginTop: 14, borderRadius: 16, background: "#F7F6FA", padding: 14 }}>
        <div style={{ font: `800 11px ${F}`, letterSpacing: "1px", color: MUTED }}>WHAT HAPPENS NEXT</div>
        {next.map((t, i) => (
          <div key={t} style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <span style={{ width: 22, height: 22, borderRadius: 11, background: "#F2EAFF", color: PURPLE, font: `800 12px ${F}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
            <span style={{ font: `500 13px/1.45 ${F}`, color: INK }}>{t}</span>
          </div>
        ))}
      </div>
      <button type="button" onClick={onDone} data-testid="success-done"
        style={{ marginTop: 16, width: "100%", height: 52, borderRadius: 14, background: PURPLE, border: "none", font: `700 15px ${F}`, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {doneLabel} <ArrowRight size={16} />
      </button>
      <button type="button" onClick={() => setReceipt(true)} data-testid="success-receipt"
        style={{ marginTop: 8, width: "100%", height: 46, borderRadius: 14, background: "#fff", border: "1px solid #E2DFEA", font: `700 14px ${F}`, color: "#5B16C9", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
        <Download size={15} /> Download receipt
      </button>
      {onSecondary && secondaryLabel && (
        <button type="button" onClick={onSecondary} style={{ marginTop: 4, width: "100%", height: 40, background: "none", border: "none", font: `700 13px ${F}`, color: MUTED, cursor: "pointer" }}>{secondaryLabel}</button>
      )}
      <InvoiceModal transaction={receipt ? receiptFromPayment({ payment, quote, total, gross, campaignTitle, paidAt }) : null} isBrand brandName={brandName} creatorName={payee} onClose={() => setReceipt(false)} />
    </div>
  );
}
