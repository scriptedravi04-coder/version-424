import React, { useState } from "react";
import MobileSheet, { SheetHeader } from "../../chat/mobile/MobileSheet";
import { api } from "../../../lib/api";
import { toast } from "sonner";

// Session 24. "Nudge admin" on mobile opened nothing: Earnings.jsx set requestNoteModalDeal, but
// the modal lived only in the desktop JSX. This sheet does the same POST /creator/payout-request.
// The amount shown is the server's creator_net_amount only — no guessed percentage.
export default function PayoutRequestSheet({ deal, hasPayoutMethod, onAddPayoutMethod, onClose, onDone }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const dealId = deal?.deal_id || deal?.id;
  const net = deal?.creator_net_amount ?? deal?.net_amount;
  const isReminder = Boolean(deal?.payout_requested);

  const send = async () => {
    if (busy || !dealId) return;
    setBusy(true);
    try {
      const { data } = await api.post("creator/payout-request", { deal_id: dealId, note: note.trim() || undefined });
      toast.success(data?.message || "Payout request sent.");
      onDone?.();
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Couldn't send the request. Please try again."); // v332: no raw JS error text
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80 }}>
      <MobileSheet onClose={onClose}>
        <SheetHeader
          title={isReminder ? "Send a payout reminder" : "Request payout"}
          subtitle="The Ybex finance team checks the deal and transfers to your payout account."
          onClose={onClose}
        />
        <div style={{ marginTop: 14, padding: 14, borderRadius: 14, background: "#F7F7FA", border: "1px solid #EDEDF2" }}>
          <div style={{ font: "600 13px 'DM Sans',sans-serif", color: "#0A0A0A" }}>{deal?.deal_title || deal?.campaign_title || "Deal"}</div>
          {deal?.brand_name && <div style={{ marginTop: 2, font: "400 12px 'DM Sans',sans-serif", color: "#6B7280" }}>{deal.brand_name}</div>}
          {net !== null && net !== undefined && Number.isFinite(Number(net)) && (
            <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", font: "500 12px 'DM Sans',sans-serif", color: "#6B7280" }}>
              <span>You receive</span>
              <span style={{ font: "700 15px 'DM Sans',sans-serif", color: "#047857" }}>₹{Number(net).toLocaleString("en-IN")}</span>
            </div>
          )}
        </div>

        {!hasPayoutMethod ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ padding: 12, borderRadius: 12, background: "#FFFBEB", border: "1px solid #FDE68A", font: "500 12.5px/1.5 'DM Sans',sans-serif", color: "#92400E" }}>
              Add a UPI ID or bank account first, so finance knows where to send it.
            </div>
            <button
              type="button"
              onClick={onAddPayoutMethod}
              style={{ marginTop: 12, width: "100%", height: 48, border: "none", borderRadius: 14, background: "#7C3AED", color: "#fff", font: "600 14px 'DM Sans',sans-serif", cursor: "pointer" }}
            >
              Add payout account
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note for finance (optional)"
              maxLength={1000}
              style={{ height: 80, border: "1px solid #E4E4EC", borderRadius: 12, padding: "10px 12px", font: "400 16px/1.5 'DM Sans',sans-serif" /* v332: no iOS zoom */, resize: "none", boxSizing: "border-box" }}
            />
            <button
              type="button"
              onClick={send}
              disabled={busy}
              style={{ height: 48, border: "none", borderRadius: 14, background: busy ? "#A7D8C0" : "#047857", color: "#fff", font: "600 14px 'DM Sans',sans-serif", cursor: busy ? "not-allowed" : "pointer" }}
            >
              {busy ? "Sending…" : isReminder ? "Send reminder" : "Request payout"}
            </button>
          </div>
        )}
      </MobileSheet>
    </div>
  );
}
