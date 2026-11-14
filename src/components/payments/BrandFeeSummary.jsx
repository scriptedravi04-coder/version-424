import React, { useEffect, useRef, useState } from "react";
import { Tag, X, Loader2, ChevronRight } from "lucide-react";
import { api } from "../../lib/api";

// v364 (Ravi: "Brand ke Review & pay mein saaf dikhe: Service fee 8% / Coupon applied: 4%"). The lines come from the
// server (POST /payments/quote) — the same numbers create-order charges — so the screen and Razorpay always match.
// Props: dealId / threadId (campaign deal: server reads the amount from the deal) or grossAmount (UGC brief:
// budget × creators), onQuote({ quote, couponCode }) whenever it changes, compact (smaller text), disabled.
// v366: variant="checkout" — Ravi's Checkout design: the lines only (the big "You pay" sits above them on the deal card),
// "Service fee (8%)" and an "Apply coupon" row. Same server call, same testids.
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
const F = "'DM Sans',sans-serif";

// v419 (Ravi): no fee percent on the brand's payment screens — "Convenience fee" with an (i) that explains it.
export function feeInfoText(withGstLine = false) {
  return `This keeps your payment held safely, private and managed until you approve the work, and covers the work we do to find and manage the right creators for you.${withGstLine ? " GST on it is shown on its own line." : " Government taxes are already included. Nothing extra is charged."}`;
}
// Ravi's design: a purple outlined (i); tapping it opens a dark bubble above it (tap again / outside to close).
// v419 (Ravi's Checkout.dc.html): 16px grey (i) that turns purple while open; dark bubble above with a pop-in.
let feeInfoCss = false;
function ensureFeeInfoCss() {
  if (feeInfoCss || typeof document === "undefined") return;
  feeInfoCss = true;
  const st = document.createElement("style");
  st.textContent = "@keyframes ybxFeeTip{from{opacity:0;transform:translateY(4px) scale(.96)}to{opacity:1;transform:none}}";
  document.head.appendChild(st);
}
export function FeeInfo({ withGstLine = false, label = "Convenience fee", style }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { ensureFeeInfoCss(); }, []);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", off);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const tone = open ? "#7C3AED" : "#A8A3B5";
  const arrowLeft = Math.min(240, 14 + (label ? label.length * 6.4 : 0));
  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 5, ...style }}>
      {label}
      <button type="button" aria-label="What is the convenience fee?" aria-expanded={open} data-testid="fee-info" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        style={{ width: 16, height: 16, borderRadius: 8, border: `1.4px solid ${tone}`, background: "transparent", color: tone, font: `700 10px/1 ${F}`, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, cursor: "pointer", boxSizing: "border-box", transition: "color .15s ease, border-color .15s ease" }}>i</button>
      {open && (
        <span role="tooltip" data-testid="fee-info-text" onClick={() => setOpen(false)}
          style={{ position: "absolute", zIndex: 30, left: -6, bottom: "calc(100% + 10px)", width: "min(260px, 76vw)", padding: "10px 12px", borderRadius: 12, background: "#2A2734", color: "#E9E7EF", font: `500 11.5px/1.5 ${F}`, boxShadow: "0 14px 30px -10px rgba(20,17,28,.45)", textAlign: "left", whiteSpace: "normal", transformOrigin: `${arrowLeft}px 100%`, animation: "ybxFeeTip .16s ease-out" }}>
          {feeInfoText(withGstLine)}
          <span aria-hidden style={{ position: "absolute", left: arrowLeft, bottom: -5, width: 10, height: 10, background: "#2A2734", transform: "rotate(45deg)" }} />
        </span>
      )}
    </span>
  );
}

export function quoteTotal(quote, fallback) {
  if (quote?.inhouse) return 0; // v419: Ybex in-house brand — funded by Ybex
  const t = Number(quote?.total);
  return Number.isFinite(t) && t > 0 ? t : Number(fallback) || 0;
}

export default function BrandFeeSummary({ dealId, threadId, grossAmount, onQuote, disabled = false, compact = false, variant = "default" }) {
  const checkout = variant === "checkout";
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState("");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const cb = useRef(onQuote);
  cb.current = onQuote;

  const reqSeq = useRef(0); // v423 (P12): only the newest request's answer counts (typing a budget fires several)
  const load = async (couponCode, keepErr = false) => {
    const mine = ++reqSeq.current;
    setLoading(true); if (!keepErr) setErr("");
    try {
      const { data } = await api.post("payments/quote", { deal_id: dealId || null, thread_id: threadId || null, gross_amount: grossAmount || null, coupon_code: couponCode || null });
      if (mine !== reqSeq.current) return false; // an older answer arrived late — ignore it
      const q = data?.quote || null;
      if (couponCode && q?.couponError) {
        // v423 (P12): the coupon no longer fits this amount → drop it and show the plain total (the old discounted total
        // stayed on screen and Pay then failed with COUPON_INVALID).
        setErr(q.couponError);
        if (couponCode === applied) { setApplied(""); void load("", true); } // the APPLIED coupon stopped fitting → plain total (message kept)
        return false; // a new code that was refused: the earlier total stays
      }
      setQuote(q);
      setApplied(couponCode && q?.couponCode ? q.couponCode : "");
      cb.current?.({ quote: q, couponCode: couponCode && q?.couponCode ? q.couponCode : "" });
      return true;
    } catch (e) {
      if (mine !== reqSeq.current) return false;
      setErr(e?.response?.data?.detail || e?.response?.data?.error || "Couldn't load the total. You'll see it in the payment window.");
      return false;
    } finally { if (mine === reqSeq.current) setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (dealId || threadId || Number(grossAmount) > 0) load(applied); }, [dealId, threadId, grossAmount]);
  // v375: the total failed (no internet / app just came back) → ask again by itself once the phone is online
  useEffect(() => {
    if (quote || !err) return undefined;
    const again = () => { if (dealId || threadId || Number(grossAmount) > 0) load(applied); };
    window.addEventListener("online", again);
    const t = setTimeout(again, 4000);
    return () => { window.removeEventListener("online", again); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote, err]);

  const fs = compact ? 12.5 : 13;
  const Row = ({ label, value, strong, green, testId }) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }} data-testid={testId}>
      <span style={{ font: `${strong ? 700 : 500} ${fs}px ${F}`, color: green ? "#0E7A55" : strong ? "#0A0A0A" : "#6B7280" }}>{label}</span>
      <span style={{ font: `${strong ? 800 : 600} ${fs}px ${F}`, color: green ? "#0E7A55" : "#0A0A0A", textAlign: "right", whiteSpace: "nowrap", flexShrink: 0 }}>{value}</span>
    </div>
  );
  if (!quote) {
    return loading ? <div style={{ display: "flex", alignItems: "center", gap: 6, font: `500 12px ${F}`, color: "#6B7280" }}><Loader2 size={13} className="animate-spin" /> Working out the total…</div>
      : err ? <div style={{ font: `500 12px ${F}`, color: "#6B7280" }}>{err} <button type="button" data-testid="fee-quote-retry" onClick={() => load(applied)} style={{ padding: 0, background: "none", border: "none", font: `700 12px ${F}`, color: "#7C3AED", cursor: "pointer" }}>Retry</button></div> : null;
  }
  const split = quote.feeModel === "split";
  const showFee = split && (quote.brandFeeBasePercent > 0 || quote.brandFee > 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="brand-fee-summary">
      <Row label={dealId || threadId ? "Deal amount" : "Escrow (creators' pay)"} value={inr(quote.gross)} testId="fee-deal-amount" />
      {showFee && (
        <Row label={<FeeInfo withGstLine={quote.brandFeeGst > 0} />} value={inr(Math.round(quote.gross * quote.brandFeeBasePercent / 100))} testId="fee-service" /* v419: no percent shown */ />
      )}
      {showFee && quote.couponCode && (
        <Row green label={`Coupon ${quote.couponCode} applied`} value={`−${inr(quote.couponDiscount)}`} testId="fee-coupon" />
      )}
      {showFee && quote.brandFeeGst > 0 && <Row label="GST on convenience fee" value={inr(quote.brandFeeGst)} />}
      {!checkout && <div style={{ height: 1, background: "#E7E5EE", margin: "2px 0" }} />}
      {!checkout && <Row strong label="Total you pay" value={inr(quote.total)} testId="fee-total" />}
      {quote.inhouse && <div data-testid="fee-inhouse" style={{ font: `600 12px/1.4 ${F}`, color: "#0E7A55" }}>Ybex in-house brand — this deal is funded by Ybex. Nothing to pay.</div>}
      {split && !checkout && <div style={{ font: `500 11.5px/1.4 ${F}`, color: "#6B7280" }}>The creator gets the full {inr(quote.creatorNet)}{quote.creatorFeePercent > 0 ? ` (after their ${quote.creatorFeePercent}% fee)` : " — 0% platform fee for creators"}.</div>}
      {split && showFee && (
        applied ? (
          <button type="button" disabled={disabled || loading} onClick={() => { setCode(""); load(""); }}
            style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 5, height: 32, padding: "0 10px", borderRadius: 10, border: "1px solid #BBE5D2", background: "#E9F7F0", font: `700 12px ${F}`, color: "#0E7A55", cursor: "pointer" }}>
            <Tag size={13} /> {applied} <X size={13} />
          </button>
        ) : open ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(""); }} placeholder="Coupon code" autoCapitalize="characters" autoCorrect="off" data-testid="fee-coupon-input"
                style={{ flex: 1, minWidth: 0, height: 42, borderRadius: 12, border: "1px solid #E2DFEA", padding: "0 12px", font: `600 16px ${F}`, color: "#0A0A0A", outline: "none" }} />
              <button type="button" disabled={disabled || loading || code.trim().length < 2} onClick={() => load(code.trim())} data-testid="fee-coupon-apply"
                style={{ height: 42, padding: "0 14px", borderRadius: 12, border: "none", background: "#7C3AED", color: "#fff", font: `700 13px ${F}`, cursor: "pointer", opacity: code.trim().length < 2 ? 0.5 : 1 }}>
                {loading ? <Loader2 size={14} className="animate-spin" /> : "Apply"}
              </button>
            </div>
            {err && <div style={{ font: `600 12px ${F}`, color: "#DC2626" }}>{err}</div>}
          </div>
        ) : checkout ? (
          <button type="button" onClick={() => setOpen(true)} disabled={disabled} data-testid="fee-coupon-open"
            style={{ marginTop: 4, width: "100%", display: "flex", alignItems: "center", gap: 8, height: 42, padding: "0 12px", borderRadius: 12, border: "1px dashed #D9CCF7", background: "#FBF9FF", font: `700 13px ${F}`, color: "#6D28D9", cursor: "pointer" }}>
            <Tag size={15} /> <span style={{ flex: 1, textAlign: "left" }}>Apply coupon</span> <ChevronRight size={16} color="#A99BC9" />
          </button>
        ) : (
          <button type="button" onClick={() => setOpen(true)} disabled={disabled} data-testid="fee-coupon-open"
            style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 5, minHeight: 36, padding: 0, border: "none", background: "none", font: `700 12.5px ${F}`, color: "#7C3AED", cursor: "pointer" }}>
            <Tag size={13} /> Have a coupon?
          </button>
        )
      )}
    </div>
  );
}
