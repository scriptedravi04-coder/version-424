import React, { useState } from "react";
import MobileSheet, { SheetHeader } from "./MobileSheet";

const QUICK_TAGS = ["Add product close-up", "Fix caption", "Change hook"];
// Session 43 (Ravi): asking for live-link changes showed the draft tips. Live-link tips instead.
export const LIVE_LINK_TAGS = ["Post is private", "Wrong post linked", "Tag the brand", "Add the brand link / code", "Fix caption", "Add the right hashtags"];

export default function MobileRequestChangesSheet({ onClose, onSubmit, title = "What should change?", subtitle = "Be specific — this counts as the revision included in your deal.", placeholder = "Please show the bottle label in the first 3 seconds.", submitLabel = "Send request", tags = QUICK_TAGS }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const addTag = (tag) => setText((prev) => (prev ? `${prev} ${tag}.` : `${tag}.`));

  const handleSend = async () => {
    if (busy || !text.trim()) return;
    setBusy(true);
    // v330: an error used to leave the button stuck disabled
    let ok = false;
    try { ok = await onSubmit(text); } finally { setBusy(false); }
    if (ok) onClose();
  };

  return (
    <MobileSheet onClose={onClose}>
      <SheetHeader title={title} onClose={onClose} />
      <div style={{ marginTop: 6, font: "400 13px/1.55 'DM Sans',sans-serif", color: "#6B7280" }}>
        {subtitle}
      </div>
      <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
        {tags.map((tag) => (
          <button
            type="button"
            key={tag}
            onClick={() => addTag(tag)}
            style={{ minHeight: 36 /* v332: was 34px */, padding: "0 12px", borderRadius: 10, background: "#F9F9FB", border: "1px solid #E5E5EA", font: "500 12.5px 'DM Sans',sans-serif", color: "#6B7280", cursor: "pointer" }}
          >
            {tag}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={title}
        style={{
          marginTop: 12, width: "100%", height: 96, borderRadius: 14, background: "#F9F9FB", border: "1px solid #E5E5EA",
          padding: "12px 14px", font: "400 16px/1.45 'DM Sans',sans-serif" /* v332: 16px stops the iPhone zoom */, color: "#0A0A0A", resize: "none", boxSizing: "border-box",
        }}
      />
      <div style={{ marginTop: 14, display: "flex", gap: 9 }}>
        <button onClick={onClose} style={{ height: 50, padding: "0 20px", borderRadius: 14, background: "#F2F2F7", border: "none", font: "600 14.5px 'DM Sans',sans-serif", color: "#0A0A0A", cursor: "pointer" }}>
          Cancel
        </button>
        <button
          disabled={busy || !text.trim()}
          onClick={handleSend}
          style={{ flex: 1, height: 50, borderRadius: 14, background: "#7C3AED", border: "none", font: "600 14.5px 'DM Sans',sans-serif", color: "#fff", opacity: busy || !text.trim() ? 0.6 : 1, cursor: "pointer" }}
        >
          {busy ? "Sending…" : submitLabel /* v330: show progress */}
        </button>
      </div>
    </MobileSheet>
  );
}
