import React from "react";
import { LEGAL_LINKS } from "../../lib/legal/legalContent";

// Session 34 (legal draft Part E): one line above every Brand "Pay" button. No box.
export default function PayConsentLine({ style, className = "" }) {
  return (
    <p data-testid="pay-consent-line" className={className} style={{ margin: "0 0 8px", font: "500 11.5px/1.5 'DM Sans',system-ui,sans-serif", color: "#6B6B76", textAlign: "center", ...style }}>
      By paying, you agree to the{" "}
      <a href={LEGAL_LINKS.refunds} target="_blank" rel="noopener noreferrer" style={{ color: "#7C3AED", fontWeight: 700, textDecoration: "underline" }}>Refund Policy</a>.
      {" "}The amount is held until you approve the delivery.
    </p>
  );
}
