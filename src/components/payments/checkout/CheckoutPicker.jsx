import React from "react";
import { Check, QrCode, CreditCard, Landmark, ChevronRight } from "lucide-react";
import PaymentLogo from "../../common/PaymentLogo";
import { UPI_APPS, OTHER_METHODS, parseMethodChoice } from "./checkoutMethods";

// v366 — Ravi's Checkout.dc.html, screen 01 "Review & pay": PAY WITH UPI · INSTANT (app tiles + Enter UPI ID) and
// OTHER WAYS (card, net banking). value / onChange carry the choice string (see checkoutMethods.js): "upi" = any UPI
// app (nothing picked yet — Razorpay lists them all), "upi:phonepe", "upi:collect", "card", "netbanking".
const F = "'DM Sans',sans-serif";
const INK = "#0A0A0A";
const MUTED = "#6B7280";
const PURPLE = "#7C3AED";

function Tick() {
  return (
    <span aria-hidden="true" style={{ position: "absolute", top: 6, right: 6, width: 18, height: 18, borderRadius: 9, background: PURPLE, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Check size={11} color="#fff" strokeWidth={3.2} />
    </span>
  );
}

function Tile({ on, disabled, onClick, label, testId, children }) {
  return (
    <button type="button" role="radio" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick} data-testid={testId}
      style={{ position: "relative", minWidth: 0, height: 78, borderRadius: 14, padding: "10px 6px 8px", cursor: disabled ? "default" : "pointer",
        border: on ? `2px solid ${PURPLE}` : "1px solid #E7E5EE", background: on ? "#FAF7FF" : "#fff",
        boxShadow: on ? "0 8px 20px -12px rgba(124,58,237,.6)" : "0 1px 2px rgba(20,17,28,.04)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", transition: "border-color .15s ease, background .15s ease" }}>
      <span style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>{children}</span>
      <span style={{ font: `600 11.5px ${F}`, color: on ? "#5B16C9" : "#3E3950", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{label}</span>
      {on && <Tick />}
    </button>
  );
}

export default function CheckoutPicker({ value = "upi", onChange, disabled = false }) {
  const c = parseMethodChoice(value);
  const pick = (v) => { if (!disabled) onChange?.(v); };
  return (
    <div data-testid="checkout-picker">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <PaymentLogo name="upi" height={13} />
        <span style={{ font: `800 11px ${F}`, letterSpacing: "1px", color: MUTED }}>PAY WITH UPI · INSTANT</span>
      </div>
      <div role="radiogroup" aria-label="UPI app" style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        {UPI_APPS.map((a) => (
          <Tile key={a.id} on={c.method === "upi" && c.app === a.id} disabled={disabled} onClick={() => pick(`upi:${a.id}`)} label={a.label} testId={`pay-app-${a.id}`}>
            <PaymentLogo name={a.id} height={a.logoH} maxWidth={64} />
          </Tile>
        ))}
        {/* v419: "Enter UPI ID" (UPI Collect) was switched off by NPCI on 28 Feb 2026 — this tile opens every UPI app on the
            phone (super.money, POP, CRED, bank apps…) or a QR code on a computer. */}
        <Tile on={c.method === "upi" && c.flow === "any"} disabled={disabled} onClick={() => pick("upi:any")} label="Other UPI app" testId="pay-app-any">
          <span style={{ width: 30, height: 30, borderRadius: 10, background: "#F2EAFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <QrCode size={16} color={PURPLE} strokeWidth={2.4} />
          </span>
        </Tile>
      </div>
      {c.method === "upi" && !c.app && c.flow !== "any" && (
        <div style={{ marginTop: 8, font: `500 11.5px/1.4 ${F}`, color: MUTED }}>Tap your app — or just pay and pick any UPI app or QR in Razorpay.</div>
      )}

      <div style={{ marginTop: 18, font: `800 11px ${F}`, letterSpacing: "1px", color: MUTED }}>OTHER WAYS</div>
      <div role="radiogroup" aria-label="Payment method" style={{ marginTop: 8, borderRadius: 14, border: "1px solid #E7E5EE", overflow: "hidden", background: "#fff" }}>
        {OTHER_METHODS.map((m, i) => {
          const on = c.method === m.id;
          const Icon = m.id === "card" ? CreditCard : Landmark;
          return (
            <button key={m.id} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => pick(m.id)} data-testid={`pay-method-${m.id}`}
              style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "12px 12px", border: "none",
                borderTop: i ? "1px solid #EEEDF3" : "none", background: on ? "#FAF7FF" : "#fff", boxShadow: on ? `inset 3px 0 0 ${PURPLE}` : "none", cursor: disabled ? "default" : "pointer" }}>
              <span style={{ width: 38, height: 38, borderRadius: 11, background: on ? PURPLE : "#F4F2F8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={18} color={on ? "#fff" : "#4B4560"} strokeWidth={2} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", font: `700 14px ${F}`, color: INK }}>{m.title}</span>
                {m.marks.length > 0 ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                    {m.marks.map((k) => (
                      <span key={k} style={{ height: 20, padding: "0 5px", borderRadius: 5, border: "1px solid #ECEAF2", background: "#fff", display: "inline-flex", alignItems: "center" }}>
                        <PaymentLogo name={k} height={k === "amex" ? 15 : k === "mastercard" ? 12 : 10} maxWidth={36} />
                      </span>
                    ))}
                  </span>
                ) : (
                  <span style={{ display: "block", font: `500 11.5px ${F}`, color: MUTED, marginTop: 1 }}>{m.sub}</span>
                )}
              </span>
              {on ? (
                <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 10, background: PURPLE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Check size={12} color="#fff" strokeWidth={3} />
                </span>
              ) : <ChevronRight size={17} color="#B9B4C6" style={{ flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
