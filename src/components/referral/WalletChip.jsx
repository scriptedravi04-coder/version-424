import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";

// v290 (Ravi): small wallet balance at the top of the creator + brand dashboards → Refer & Earn.
const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
export default function WalletChip() {
  const navigate = useNavigate();
  const [bal, setBal] = useState(null);
  useEffect(() => {
    let off = false;
    // v353: the chip added the LOCKED brand rewards to the balance (₹521 here, ₹21 in the wallet on /refer). Same number now.
    api.get("referrals/me").then((r) => { if (!off) setBal(Number(r.data?.balance || 0)); }).catch(() => {});
    return () => { off = true; };
  }, []);
  if (bal == null) return null;
  return (
    <button type="button" onClick={() => navigate("/refer")} aria-label={`Ybex wallet ${inr(bal)}`} data-testid="wallet-chip"
      style={{ height: 34, padding: "0 11px", borderRadius: 17, border: "1px solid rgba(124,58,237,.18)", background: "rgba(255,255,255,.85)", display: "flex", alignItems: "center", gap: 5,
        font: "700 12.5px 'DM Sans', sans-serif", color: "#4C1D95", alignSelf: "center", cursor: "pointer", whiteSpace: "nowrap" }}>
      <span aria-hidden="true">💰</span>{bal > 0 ? inr(bal) : "Wallet"}{/* v396 (QA S-5): a bare "₹0" chip had no label */}
    </button>
  );
}
