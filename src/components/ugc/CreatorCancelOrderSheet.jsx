import React, { useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { CREATOR_CANCEL_REASONS, creatorCancelInfo, formatWait } from "../../utils/ugcOrderCancel";

import { PopupBackdrop, PopupPanel } from "../common/Popup";
/**
 * Session 25 (rule 51). "Can't do this order? Cancel" — creator only, before the first draft.
 * Basic layout on purpose: Ravi will get the final design for Manage UGC from Claude Design.
 * `mobile` pins it to the bottom of the screen; desktop shows it centred.
 */
export default function CreatorCancelOrderSheet({ order, onClose, onCancelled, mobile = false }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const info = creatorCancelInfo(order);
  const needsNote = reason === "Other";
  const canSubmit = reason && (!needsNote || note.trim().length >= 3) && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/ugc/orders/${order.id}/cancel`, { reason, note: note.trim() });
      toast.success(data?.message || "Order cancelled.");
      onCancelled?.(data);
    } catch (e) {
      toast.error(e?.response?.data?.error || "Couldn't cancel the order. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PopupBackdrop
      role="dialog"
      aria-modal="true"
      aria-label="Cancel this order"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(16,16,20,.45)", display: "flex", alignItems: mobile ? "flex-end" : "center", justifyContent: "center" }}
    >
      <PopupPanel kind={mobile ? "sheet" : "modal"} onClose={onClose}
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", width: "100%", maxWidth: mobile ? "100%" : 440, borderRadius: mobile ? "20px 20px 0 0" : 16, padding: 20, paddingBottom: mobile ? "calc(20px + env(safe-area-inset-bottom, 0px))" : 20 /* v332: buttons clear the iPhone home bar */, boxSizing: "border-box", font: "400 13px/1.5 'DM Sans',sans-serif", color: "#0A0A0A", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div style={{ font: "700 16px 'DM Sans',sans-serif" }}>Cancel this order?</div>
        <div style={{ marginTop: 4, color: "#6B7280" }}>Tell us why. The brand is not shown your reason.</div>

        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {CREATOR_CANCEL_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              aria-pressed={reason === r}
              style={{ padding: "8px 12px", minHeight: 40 /* v332: tap target */, borderRadius: 999, cursor: "pointer", font: "500 13px 'DM Sans',sans-serif", border: reason === r ? "1.5px solid #7C3AED" : "1px solid #E4E4EC", background: reason === r ? "#F5F0FF" : "#fff", color: "#0A0A0A" }}
            >
              {r}
            </button>
          ))}
        </div>

        {needsNote && (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 300))}
            placeholder="Tell us briefly what happened"
            style={{ marginTop: 10, width: "100%", height: 72, border: "1px solid #E4E4EC", borderRadius: 12, padding: "10px 12px", font: `400 ${mobile ? 16 : 13}px/1.5 'DM Sans',sans-serif` /* v332: no iOS zoom */, resize: "none", boxSizing: "border-box" }}
          />
        )}

        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: info.counts ? "#FEF2F2" : "#FFFBEB", border: `1px solid ${info.counts ? "#FECACA" : "#FDE68A"}`, color: info.counts ? "#991B1B" : "#92400E" }}>
          {info.counts ? (
            <>This counts like a <b>missed deadline</b> on your profile. There is no payment for this order, and you can't claim this brief again.</>
          ) : info.graceLeftMs > 0 ? (
            <>You claimed this less than an hour ago, so it <b>won't count</b> against your profile (for the next {formatWait(info.graceLeftMs)}). You can't claim this brief again.</>
          ) : (
            <>This reservation was never signed, so it <b>won't count</b> against your profile. You can't claim this brief again.</>
          )}
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, height: 44, borderRadius: 12, border: "1px solid #E4E4EC", background: "#fff", font: "600 14px 'DM Sans',sans-serif", cursor: "pointer" }}>
            Keep order
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            style={{ flex: 1, height: 44, borderRadius: 12, border: "none", background: canSubmit ? "#DC2626" : "#F3D4D4", color: "#fff", font: "600 14px 'DM Sans',sans-serif", cursor: canSubmit ? "pointer" : "not-allowed" }}
          >
            {busy ? "Cancelling…" : "Cancel order"}
          </button>
        </div>
      </PopupPanel>
    </PopupBackdrop>
  );
}
