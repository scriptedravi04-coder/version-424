import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { brandCancelInfo, formatWait } from "../../utils/ugcOrderCancel";

import { PopupBackdrop, PopupPanel } from "../common/Popup";
import ModalPortal from "../common/ModalPortal"; // v415: drawn on <body>, above sticky bars and the nav
import useScrollLock from "../../lib/useScrollLock"; // v415
/**
 * Session 25 (rule 52). Brand cancels ONE order: only when the creator's timer started 24h+ ago
 * and there is still no draft. No fee. The money goes back through the manual UGC Refunds queue,
 * so a refund account (UPI or bank) must be saved first. Basic layout on purpose.
 */
export function BrandCancelOrderButton({ order, onOpen, className = "" }) {
  const info = brandCancelInfo(order);
  if (!info.show) return null;
  const hint = info.allowed
    ? "No draft by the delivery deadline — you can cancel this order for a full refund." /* v414 */
    : info.why === "DRAFT"
      ? "The creator has delivered, so this order can't be cancelled. Use Raise an issue if something is wrong."
      : info.allowedAtMs
        ? `The creator is working on it. If there's still no draft, you can cancel in ${formatWait(info.allowedAtMs - Date.now())}.`
        : "The creator is working on it. You can cancel once the delivery deadline passes with no draft (at least 24 hours after they claimed it).";
  return (
    <div className={className} style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={info.allowed ? onOpen : undefined}
        disabled={!info.allowed}
        style={{ height: 40 /* v332: 40px tap target */, padding: "0 14px", borderRadius: 10, border: `1px solid ${info.allowed ? "#FCA5A5" : "#E4E4EC"}`, background: "#fff", color: info.allowed ? "#B91C1C" : "#9CA3AF", font: "600 13px 'DM Sans',sans-serif", cursor: info.allowed ? "pointer" : "not-allowed" }}
      >
        Cancel this order
      </button>
      <div style={{ marginTop: 4, font: "400 12px/1.4 'DM Sans',sans-serif", color: "#6B7280" }}>{hint}</div>
    </div>
  );
}

export default function BrandCancelOrderModal({ order, amount, onClose, onCancelled, mobile = false }) {
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState(null);
  const [method, setMethod] = useState("UPI");
  const [upi, setUpi] = useState("");
  const [acc, setAcc] = useState("");
  const [acc2, setAcc2] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [holder, setHolder] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountFailed, setAccountFailed] = useState(false); // v332: a failed read showed the "add account" form as if none was saved
  useScrollLock(true); // v415: page behind must not scroll
  // v415: Escape closes (not while cancelling)
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  useEffect(() => {
    let live = true;
    api.get("/brand/refund-account")
      .then(({ data }) => { if (live) setAccount(data?.refund_account || null); })
      .catch(() => { if (live) setAccountFailed(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!account) {
        const body = method === "UPI"
          ? { method_type: "UPI", upi_id: upi.trim() }
          : { method_type: "BANK", bank_account_number: acc, bank_account_confirm: acc2, bank_ifsc: ifsc.trim().toUpperCase(), account_holder_name: holder.trim() };
        const { data } = await api.post("/brand/refund-account", body);
        setAccount(data?.refund_account || true);
      }
      const { data } = await api.post(`/ugc/orders/${order.id}/cancel`, { reason: reason.trim() });
      toast.success(data?.message || "Order cancelled. Your refund is on the way.");
      onCancelled?.(data);
    } catch (e) {
      toast.error(e?.response?.data?.error || "Couldn't cancel the order. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // v332: 16px fields on phones (iOS zoomed into 13px inputs)
  const input = { width: "100%", height: 40, border: "1px solid #E4E4EC", borderRadius: 10, padding: "0 12px", font: `400 ${mobile ? 16 : 13}px 'DM Sans',sans-serif`, boxSizing: "border-box", marginTop: 8 };
  const accountLabel = account && account !== true
    ? (account.method_type === "UPI" ? `UPI · ${account.upi_id || ""}` : `Bank · ****${account.account_last4 || ""}`)
    : null;

  return (
    <ModalPortal>
    <PopupBackdrop role="dialog" aria-modal="true" aria-label="Cancel this order" onClick={() => { if (!busy) onClose?.(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1000 /* v415: was 80 — under the order's sticky bar layer on some screens */, background: "rgba(16,16,20,.45)", display: "flex", alignItems: mobile ? "flex-end" : "center", justifyContent: "center" }}>
      <PopupPanel kind={mobile ? "sheet" : "modal"} onClose={busy ? undefined : onClose /* v415: no Escape-close mid-cancel */} onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", width: "100%", maxWidth: mobile ? "100%" : 440, borderRadius: mobile ? "20px 20px 0 0" : 16, padding: 20, paddingBottom: mobile ? "calc(20px + env(safe-area-inset-bottom, 0px))" : 20 /* v332: buttons clear the iPhone home bar */, boxSizing: "border-box", font: "400 13px/1.5 'DM Sans',sans-serif", color: "#0A0A0A", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ font: "700 16px 'DM Sans',sans-serif" }}>Cancel this order?</div>
        <div style={{ marginTop: 4, color: "#4B5563" }}>
          No draft arrived by the delivery deadline. There is no cancellation fee{Number(amount) > 0 ? <> — <b>₹{Number(amount).toLocaleString("en-IN")}</b> comes back to you</> : null} within 1–2 working days. This slot will not be relisted.{/* v415: no "₹0" */}
        </div>

        <textarea aria-label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value.slice(0, 200))} placeholder="Reason (optional)"
          style={{ ...input, height: 64, padding: "10px 12px", resize: "none" }} />

        <div style={{ marginTop: 14, font: "600 12px 'DM Sans',sans-serif", color: "#6B7280" }}>REFUND TO</div>
        {loading ? (
          <div style={{ marginTop: 6, color: "#6B7280" }}>Loading…</div>
        ) : accountFailed ? (
          <div style={{ marginTop: 6, color: "#6B7280" }}>Couldn't check your saved refund account right now. Close this and try again in a moment.</div>
        ) : accountLabel ? (
          <div style={{ marginTop: 6 }}>{accountLabel}</div>
        ) : (
          <div>
            <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
              {["UPI", "BANK"].map((m) => (
                <button key={m} type="button" onClick={() => setMethod(m)} aria-pressed={method === m}
                  style={{ flex: 1, height: 36, borderRadius: 10, cursor: "pointer", border: method === m ? "1.5px solid #7C3AED" : "1px solid #E4E4EC", background: method === m ? "#F5F0FF" : "#fff", font: "600 13px 'DM Sans',sans-serif" }}>
                  {m === "UPI" ? "UPI" : "Bank account"}
                </button>
              ))}
            </div>
            {method === "UPI" ? (
              <input style={input} aria-label="UPI ID" autoCapitalize="none" value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="UPI ID (name@bank)" />
            ) : (
              <>
                <input style={input} aria-label="Account holder name" value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Account holder name" />
                <input style={input} aria-label="Account number" value={acc} onChange={(e) => setAcc(e.target.value.replace(/\D/g, ""))} placeholder="Account number" inputMode="numeric" />
                <input style={input} aria-label="Confirm account number" value={acc2} onChange={(e) => setAcc2(e.target.value.replace(/\D/g, ""))} placeholder="Confirm account number" inputMode="numeric" />
                <input style={input} aria-label="IFSC code" value={ifsc} onChange={(e) => setIfsc(e.target.value)} placeholder="IFSC (e.g. HDFC0001234)" />
              </>
            )}
          </div>
        )}

        <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
          <button type="button" onClick={onClose} disabled={busy} style={{ flex: 1, height: 44, borderRadius: 12, border: "1px solid #E4E4EC", background: "#fff", font: "600 14px 'DM Sans',sans-serif", cursor: "pointer" }}>
            Keep order
          </button>
          <button type="button" onClick={submit} disabled={busy || loading || accountFailed}
            style={{ flex: 1, height: 44, borderRadius: 12, border: "none", background: busy || loading || accountFailed ? "#F3D4D4" : "#DC2626", color: "#fff", font: "600 14px 'DM Sans',sans-serif", cursor: busy || loading || accountFailed ? "not-allowed" : "pointer" }}>
            {busy ? "Cancelling…" : "Cancel & refund"}
          </button>
        </div>
      </PopupPanel>
    </PopupBackdrop>
    </ModalPortal>
  );
}
