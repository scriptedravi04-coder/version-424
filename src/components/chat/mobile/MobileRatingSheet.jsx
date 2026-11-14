import React, { useState } from "react";
import MobileSheet, { SheetHeader } from "./MobileSheet";

const LABELS = ["", "Not great", "Could be better", "Good to work with", "Really good", "Great to work with"];

// Session 43 (Ravi: "stars don't look right"): rounded star, the usual gold, a real button with a
// bigger tap area; the partner's real logo instead of a beige circle.
function Star({ filled, onClick, n }) {
  return (
    <button type="button" onClick={onClick} aria-label={`${n} star${n === 1 ? "" : "s"}`} aria-pressed={filled} /* v332 */
      style={{ width: 46, height: 46, border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
      <svg width="36" height="36" viewBox="0 0 24 24" fill={filled ? "#F5B301" : "none"} stroke={filled ? "#F5B301" : "#D4D4DC"} strokeWidth="1.6" strokeLinejoin="round">
        <path d="M12 3.2l2.6 5.3 5.8.85-4.2 4.1 1 5.8L12 16.5l-5.2 2.75 1-5.8-4.2-4.1 5.8-.85z" />
      </svg>
    </button>
  );
}

export default function MobileRatingSheet({ onClose, onSubmit, partnerName, partnerPic }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const [picFailed, setPicFailed] = useState(false);
  const handleSubmit = async () => {
    if (busy) return;
    setBusy(true);
    // v330: an error used to leave the button stuck disabled
    let ok = false;
    try { ok = await onSubmit({ rating, comment }); } finally { setBusy(false); }
    if (ok) onClose();
  };

  // v330: once the photo fails to load, show the initial instead
  if (picFailed) partnerPic = "";
  return (
    <MobileSheet onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {partnerPic ? (
          <img src={partnerPic} alt="" onError={() => setPicFailed(true) /* v330: broken photo → initial */} style={{ width: 44, height: 44, borderRadius: 22, objectFit: "cover", flexShrink: 0, border: "1px solid #ECECF0", background: "#fff" }} />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 22, background: "#F3EDFF", color: "#7C3AED", display: "flex", alignItems: "center", justifyContent: "center", font: "700 17px 'DM Sans',sans-serif", flexShrink: 0 }}>
            {String(partnerName || "?").trim()[0]?.toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>{/* v330: long names no longer push the X off-screen */}
          <SheetHeader title={`Rate ${partnerName}`} subtitle="Private — never shown on their profile" onClose={onClose} />
        </div>
      </div>

      <div style={{ marginTop: 18, display: "flex", justifyContent: "center", gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} n={n} filled={n <= rating} onClick={() => setRating(n)} />
        ))}
      </div>
      <div style={{ marginTop: 8, textAlign: "center", font: "500 12.5px 'DM Sans',sans-serif", color: "#6B7280" }}>
        {LABELS[rating]}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a note (optional)"
        aria-label="Add a note (optional)"
        style={{
          marginTop: 16, width: "100%", height: 70, borderRadius: 14, background: "#F9F9FB", border: "1px solid #E5E5EA",
          padding: "12px 14px", font: "400 16px/1.45 'DM Sans',sans-serif" /* v332: 16px stops the iPhone zoom */, color: "#0A0A0A", resize: "none", boxSizing: "border-box",
        }}
      />

      <div style={{ marginTop: 14, display: "flex", gap: 9 }}>
        <button type="button" onClick={onClose} style={{ height: 50, padding: "0 18px", borderRadius: 14, background: "#F2F2F7", border: "none", font: "600 14.5px 'DM Sans',sans-serif", color: "#0A0A0A", cursor: "pointer" }}>
          Later
        </button>
        <button
          disabled={busy}
          onClick={handleSubmit}
          style={{ flex: 1, height: 50, borderRadius: 14, background: "#7C3AED", border: "none", font: "600 14.5px 'DM Sans',sans-serif", color: "#fff", opacity: busy ? 0.6 : 1, cursor: "pointer" }}
        >
          {busy ? "Submitting…" : "Submit review" /* v330: show progress */}
        </button>
      </div>
    </MobileSheet>
  );
}
