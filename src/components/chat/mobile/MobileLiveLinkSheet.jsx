import React, { useState } from "react";
import MobileSheet, { SheetHeader } from "./MobileSheet";
import { checkLiveLink } from "../../../utils/liveLinkCheck";

export default function MobileLiveLinkSheet({ onClose, onSubmit }) {
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // Session 40: only a post / reel / video link can be sent (see src/utils/liveLinkCheck.js).
  const check = checkLiveLink(link);
  const handleSend = async () => {
    if (!check.ok) return;
    if (busy) return;
    setBusy(true);
    // v330: an error used to leave the button stuck disabled
    let ok = false;
    try { ok = await onSubmit(check.url, notes); } finally { setBusy(false); }
    if (ok) onClose();
  };

  return (
    <MobileSheet onClose={onClose}>
      <SheetHeader title="Add your live link" subtitle="Paste the link to your posted content." onClose={onClose} />
      <input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="https://instagram.com/reel/..."
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        aria-label="Live post link" /* v330: no auto-capitalised "Https://" on phones */
        style={{
          marginTop: 14, width: "100%", height: 48, borderRadius: 14, background: "#F9F9FB", border: "1px solid #E5E5EA",
          padding: "0 14px", font: "400 16px 'DM Sans',sans-serif" /* v332: 16px stops the iPhone zoom */, color: "#0A0A0A", boxSizing: "border-box",
        }}
      />
      {link.trim() && !check.ok && check.message && (
        <div style={{ marginTop: 6, font: "500 12px/1.4 'DM Sans',sans-serif", color: "#DC2626" }}>{check.message}</div>
      )}
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        aria-label="Notes (optional)"
        style={{
          marginTop: 10, width: "100%", height: 70, borderRadius: 14, background: "#F9F9FB", border: "1px solid #E5E5EA",
          padding: "12px 14px", font: "400 16px/1.45 'DM Sans',sans-serif" /* v332: 16px */, color: "#0A0A0A", resize: "none", boxSizing: "border-box",
        }}
      />
      <div style={{ marginTop: 14, display: "flex", gap: 9 }}>
        <button type="button" onClick={onClose} style={{ height: 50, padding: "0 20px", borderRadius: 14, background: "#F2F2F7", border: "none", font: "600 14.5px 'DM Sans',sans-serif", color: "#0A0A0A", cursor: "pointer" }}>
          Cancel
        </button>
        <button
          disabled={busy || !check.ok}
          onClick={handleSend}
          style={{ flex: 1, height: 50, borderRadius: 14, background: "#7C3AED", border: "none", font: "600 14.5px 'DM Sans',sans-serif", color: "#fff", opacity: busy || !check.ok ? 0.6 : 1, cursor: "pointer" }}
        >
          {busy ? "Submitting…" : "Submit link" /* v330: show progress */}
        </button>
      </div>
    </MobileSheet>
  );
}
