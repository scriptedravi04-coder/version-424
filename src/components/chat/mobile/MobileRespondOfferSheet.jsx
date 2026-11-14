import { openOfferFloor, inr0 } from "./chatStageMap"; // v419
import React, { useState } from "react";
import MobileSheet, { SheetHeader } from "./MobileSheet";

// Session 43 (Ravi: "Respond to offer opens a whole page — show Accept or Negotiate in a sheet from
// the bottom, like the reference"). Same actions as the offer card in the chat.
export default function MobileRespondOfferSheet({ onClose, offer, onAccept, onCounter }) {
  const [counter, setCounter] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(null);
  const amount = Number(offer?.amount) || 0;

  const accept = async () => {
    if (busy) return;
    setBusy("accept");
    try { if ((await onAccept()) !== false) onClose(); } finally { setBusy(null); } // v355: stays open when it failed
  };
  // v332: under ₹3,000 the server says no and the sheet used to close anyway, losing the number.
  const floor = openOfferFloor(); // v419
  const tooLow = Boolean(value) && Number(value) < floor;
  const send = async () => {
    if (busy || !Number(value) || tooLow) return;
    setBusy("counter");
    try { if ((await onCounter(value)) !== false) onClose(); } finally { setBusy(null); } // v355
  };

  return (
    <MobileSheet onClose={onClose}>
      <SheetHeader title={amount ? "Respond to offer" : "Negotiate price"} subtitle={offer?.fromName ? `From ${offer.fromName}` : undefined} onClose={onClose} />
      {amount > 0 && (
        <div style={{ marginTop: 14, padding: 14, borderRadius: 16, background: "#F7F7FA" }} data-testid="respond-offer-amount">
          <div style={{ font: "600 10px 'DM Sans',sans-serif", letterSpacing: 1, textTransform: "uppercase", color: "#B45309" }}>Their offer</div>
          <div style={{ marginTop: 4, font: "700 28px/1 'DM Sans',sans-serif", letterSpacing: "-1px", color: "#0A0A0A" }}>₹{amount.toLocaleString("en-IN")}</div>
          {offer?.note && <div style={{ marginTop: 8, font: "400 13px/1.45 'DM Sans',sans-serif", color: "#4B5563" }}>"{offer.note}"</div>}
        </div>
      )}
      {counter || !amount ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ font: "600 12px 'DM Sans',sans-serif", color: "#6B7280", marginBottom: 6 }}>Your price (₹)</div>
          <input inputMode="numeric" autoFocus value={value} onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))} placeholder="e.g. 6000"
            data-testid="respond-offer-input"
            style={{ width: "100%", height: 50, borderRadius: 14, border: "1px solid #E5E5EA", background: "#fff", padding: "0 14px", font: "600 17px 'DM Sans',sans-serif", boxSizing: "border-box" }} />
          {tooLow && <div role="alert" style={{ marginTop: 6, font: "500 12px 'DM Sans',sans-serif", color: "#B45309" }}>The lowest offer allowed is {inr0(floor)}.</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            {amount > 0 && <button type="button" onClick={() => setCounter(false)} style={btn("#F2F2F7", "#0A0A0A")}>Back</button>}
            <button type="button" onClick={send} disabled={!Number(value) || tooLow || Boolean(busy)} data-testid="respond-offer-send" style={{ ...btn("#7C3AED", "#fff"), flex: 1, opacity: !Number(value) || tooLow || busy ? 0.6 : 1 }}>
              {busy === "counter" ? "Sending…" : "Send counter offer"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button type="button" onClick={() => setCounter(true)} data-testid="respond-offer-negotiate" style={{ ...btn("#F3EDFF", "#7C3AED"), flex: 1 }}>Negotiate</button>
          <button type="button" onClick={accept} disabled={Boolean(busy)} data-testid="respond-offer-accept" style={{ ...btn("#7C3AED", "#fff"), flex: 1, opacity: busy ? 0.6 : 1 }}>
            {busy === "accept" ? "Accepting…" : `Accept ₹${amount.toLocaleString("en-IN")}`}
          </button>
        </div>
      )}
    </MobileSheet>
  );
}

const btn = (bg, color) => ({ height: 50, padding: "0 18px", borderRadius: 14, border: "none", background: bg, color, font: "700 14.5px 'DM Sans',sans-serif" });
