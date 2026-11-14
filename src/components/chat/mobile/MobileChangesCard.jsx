import React, { useState } from "react";

export default function MobileChangesCard({
  message,
  isBrand,
  onOpenReupload,
  onDeclineChanges,
  // Session 24: only the latest request, while the deal is still waiting on it, gets buttons
  // (desktop ContentProofNotice isStateActive). Older cards used to keep "Decline" working.
  isActive = true,
  // Session 31: the same card is used when the brand asks for corrected LIVE LINKS
  // ("live_links_resubmit_request"). Then the actions are "Decline request" / "Send corrected link".
  variant = "draft",
}) {
  const isLinks = variant === "links";
  const meta = message?.metadata || {};
  const rawText = String(message?.content || message?.text || "").replace(/^❌\s*Resubmission requested by Brand:\s*/i, "");
  const feedback =
    meta.feedback ||
    meta.reason ||
    meta.notes ||
    rawText ||
    (isLinks ? "The brand asked for corrected live links." : "The brand asked for changes to the draft.");
  const L = isLinks
    ? { title: "Brand asked for corrected links", badge: "LINK CORRECTION REQUESTED", box: "What to fix", decline: "Decline request", declineBtn: "Decline request", primary: "Send corrected link", waiting: "↻ Waiting for the creator to send corrected links…", placeholder: "The link I submitted is correct and live." }
    : { title: "Brand needs some changes", badge: "CHANGES REQUESTED", box: "Requested changes", decline: "Decline changes", declineBtn: "Decline changes", primary: "Upload revised", waiting: "↻ Waiting for creator to upload revised content…", placeholder: "This revision is outside the agreed scope." };
  const when = message?.created_at ? new Date(message.created_at) : null;
  const timeText = when && !Number.isNaN(when.getTime()) // v332: no "Invalid Date"
    ? when.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" /* v330: IST */ }).replace(/\b(am|pm)\b/g, (s) => s.toUpperCase())
    : "";

  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineText, setDeclineText] = useState("");
  const [busy, setBusy] = useState(false);

  const handleDecline = async () => {
    if (!declineText.trim()) return;
    if (busy || !onDeclineChanges) return;
    setBusy(true);
    try {
      // Close the form only when the server accepted it; on an error the text stays.
      const ok = await onDeclineChanges(declineText);
      if (ok) {
        setDeclineOpen(false);
        setDeclineText("");
      }
    } finally {
      setBusy(false);
    }
  };

  const cardRadius = isBrand ? "20px 20px 8px 20px" : "20px 20px 20px 8px";
  const alignSide = isBrand ? "flex-end" : "flex-start";

  return (
    <div
      style={{
        flexShrink: 0,
        alignSelf: alignSide,
        width: 302,
        maxWidth: "93%",
        boxSizing: "border-box",
        borderRadius: cardRadius,
        background: "#fff",
        border: "1px solid #F3E2BE",
        padding: 14,
        boxShadow: "0 14px 30px -24px rgba(16,16,20,.5)",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        style={{
          height: 3,
          margin: "-14px -14px 12px",
          borderRadius: "20px 20px 0 0",
          background: "linear-gradient(90deg,#F59E0B,#EA580C)",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 11,
            flexShrink: 0,
            background: "#FFF6E6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: "600 14px/30px 'DM Sans',sans-serif",
            color: "#B45309",
          }}
        >
          !
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "600 13px 'DM Sans',sans-serif", color: "#0A0A0A" }}>
            {L.title}
          </div>
          <div
            style={{
              marginTop: 3,
              font: "600 9.5px 'DM Sans',sans-serif",
              letterSpacing: "1px",
              textTransform: "uppercase",
              color: "#B45309",
            }}
          >
            {L.badge}
          </div>
        </div>
        <span style={{ font: "400 10.5px 'DM Sans',sans-serif", color: "#6E6E7C", flexShrink: 0 }}>
          {timeText}
        </span>
      </div>

      <div
        style={{
          marginTop: 11,
          padding: "11px 12px",
          border: "1px solid #F3E2BE",
          borderRadius: 12,
          background: "#FFFCF5",
        }}
      >
        <div
          style={{
            font: "600 9.5px 'DM Sans',sans-serif",
            letterSpacing: "1px",
            textTransform: "uppercase",
            color: "#B45309",
          }}
        >
          {L.box}
        </div>
        <div style={{ marginTop: 6, font: "500 12.5px/1.5 'DM Sans',sans-serif", color: "#0A0A0A", overflowWrap: "anywhere", whiteSpace: "pre-wrap" /* v330: long links overflowed the card */ }}>
          {feedback}
        </div>
      </div>

      {!isActive ? (
        <div
          style={{
            marginTop: 12,
            height: 36,
            borderRadius: 12,
            background: "#ECFDF5",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: "600 11.5px 'DM Sans',sans-serif",
            color: "#047857",
          }}
        >
          Resolved
        </div>
      ) : !isBrand ? (
        declineOpen ? (
          <div style={{ marginTop: 12, padding: 13, borderRadius: 13, background: "#F7F7FA" }}>
            <div
              style={{
                font: "600 9.5px 'DM Sans',sans-serif",
                letterSpacing: "1px",
                textTransform: "uppercase",
                color: "#5C5C6B",
              }}
            >
              Reason for declining
            </div>
            <textarea
              value={declineText}
              onChange={(e) => setDeclineText(e.target.value)}
              placeholder={L.placeholder}
              aria-label="Reason for declining"
              style={{
                marginTop: 9,
                width: "100%",
                height: 72,
                border: "1px solid #E4E4EC",
                borderRadius: 12,
                background: "#fff",
                padding: "10px 12px",
                font: "400 16px/1.4 'DM Sans',sans-serif", // v332: 16px — smaller text made iPhones zoom in
                color: "#0A0A0A",
                resize: "none",
                boxSizing: "border-box",
              }}
            />
            <div style={{ marginTop: 9, display: "flex", gap: 8 }}>
              <button
                onClick={() => setDeclineOpen(false)}
                style={{
                  height: 40,
                  padding: "0 15px",
                  border: "1px solid #E4E4EC",
                  borderRadius: 12,
                  background: "#fff",
                  font: "600 12.5px 'DM Sans',sans-serif",
                  color: "#5C5C6B",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                disabled={busy || !declineText.trim()}
                onClick={handleDecline}
                style={{
                  flex: 1,
                  height: 40,
                  border: "none",
                  borderRadius: 12,
                  background: "#DC2626",
                  font: "600 12.5px 'DM Sans',sans-serif",
                  color: "#fff",
                  cursor: busy || !declineText.trim() ? "not-allowed" : "pointer",
                  opacity: busy || !declineText.trim() ? 0.6 : 1, // v332: looked tappable while empty
                }}
              >
                {busy ? "Sending…" : L.declineBtn}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button
              onClick={() => setDeclineOpen(true)}
              style={{
                flex: 1,
                height: 42,
                border: "1px solid #E4E4EC",
                borderRadius: 13,
                background: "#fff",
                font: "600 12.5px 'DM Sans',sans-serif",
                color: "#DC2626",
                cursor: "pointer",
              }}
            >
              {L.decline}
            </button>
            <button
              onClick={onOpenReupload}
              style={{
                flex: 1,
                height: 42,
                border: "none",
                borderRadius: 13,
                background: "#7C3AED",
                font: "600 12.5px 'DM Sans',sans-serif",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              {L.primary}
            </button>
          </div>
        )
      ) : (
        <div
          style={{
            marginTop: 12,
            height: 40,
            borderRadius: 12,
            background: "#FFF8EB",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: "600 12px 'DM Sans',sans-serif",
            color: "#92400E",
          }}
        >
          {L.waiting}
        </div>
      )}
    </div>
  );
}
