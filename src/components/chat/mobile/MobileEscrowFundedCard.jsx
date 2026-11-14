import React from "react";

export default function MobileEscrowFundedCard({
  message,
  amount,
  campaignTitle,
  isBrand,
  onOpenUpload,
}) {
  const meta = message?.metadata || {};
  const displayAmt = amount || meta.amount || 0;
  const title = campaignTitle || meta.campaign_title || "Collaboration";
  const when = message?.created_at ? new Date(message.created_at) : null;
  const timeText = when && !Number.isNaN(when.getTime()) // v332: no "Invalid Date"
    ? when.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" /* v330: IST */ }).replace(/\b(am|pm)\b/g, (s) => s.toUpperCase())
    : ""; // session 30: no made-up time when the message has none

  return (
    <div
      style={{
        flexShrink: 0,
        alignSelf: isBrand ? "flex-end" : "flex-start",
        width: 302,
        maxWidth: "93%",
        boxSizing: "border-box",
        borderRadius: isBrand ? "20px 20px 8px 20px" : "20px 20px 20px 8px",
        background: "#fff",
        padding: 14,
        boxShadow: "0 14px 30px -24px rgba(16,16,20,.5)",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifySelf: "stretch", justifyContent: "space-between" }}>
        <span
          style={{
            font: "600 9.5px 'DM Sans',sans-serif",
            letterSpacing: "1px",
            textTransform: "uppercase",
            color: "#5C5C6B",
          }}
        >
          Secure payment hold status 🔒
        </span>
        <span style={{ font: "400 10.5px 'DM Sans',sans-serif", color: "#6E6E7C" }}>{timeText}</span>
      </div>

      <div
        style={{
          marginTop: 8,
          font: "700 26px/1 'DM Sans',sans-serif",
          letterSpacing: "-1.4px",
          color: "#0A0A0A",
        }}
      >
        {Number(displayAmt) > 0 ? `₹${Number(displayAmt).toLocaleString("en-IN")}` : "Funded" /* v332: no "₹0" when the amount isn't on this card */}
      </div>

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <span style={{ font: "400 12px 'DM Sans',sans-serif", color: "#5C5C6B" }}>Campaign</span>
          <span
            style={{
              font: "600 12px 'DM Sans',sans-serif",
              color: "#0A0A0A",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 160,
            }}
          >
            {title}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <span style={{ font: "400 12px 'DM Sans',sans-serif", color: "#5C5C6B" }}>Status</span>
          <span style={{ font: "600 12px 'DM Sans',sans-serif", color: "#0B7B45" }}>Payment funded ✓</span>
        </div>
      </div>

      <div style={{ marginTop: 12, padding: "11px 12px", borderRadius: 12, background: "#F5F2FF" }}>
        <div style={{ font: "600 12.5px 'DM Sans',sans-serif", color: "#5B21B6" }}>Payment secured! 🎉</div>
        <div style={{ marginTop: 4, font: "400 12px/1.5 'DM Sans',sans-serif", color: "#5C5C6B" }}>
          Funds are held in a secure payment hold — payment will be released upon live link approval.
        </div>
      </div>

      {!isBrand && onOpenUpload && (
        <button
          onClick={onOpenUpload}
          style={{
            marginTop: 13,
            width: "100%",
            height: 42,
            border: "none",
            borderRadius: 13,
            background: "#7C3AED",
            font: "600 13px 'DM Sans',sans-serif",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Upload content draft
        </button>
      )}
    </div>
  );
}
