import React from "react";

export default function MobileContractCard({
  message,
  thread,
  isBrand,
  onOpenContract,
}) {
  const isCreatorSigned =
    Boolean(thread?.creator_signed_at) ||
    Boolean(thread?.is_creator_signed) ||
    Boolean(message?.metadata?.creator_signed);
  const isBrandSigned =
    Boolean(thread?.brand_signed_at) ||
    Boolean(thread?.is_brand_signed) ||
    Boolean(message?.metadata?.brand_signed);

  const mySigned = isBrand ? isBrandSigned : isCreatorSigned;
  const when = message?.created_at ? new Date(message.created_at) : null;
  const timeText = when && !Number.isNaN(when.getTime()) // v332: no "Invalid Date"
    ? when.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" /* v330: IST */ }).replace(/\b(am|pm)\b/g, (s) => s.toUpperCase())
    : ""; // session 30: no made-up time when the message has none

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
        padding: 14,
        boxShadow: "0 14px 30px -24px rgba(16,16,20,.5)",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            font: "600 9.5px 'DM Sans',sans-serif",
            letterSpacing: "1px",
            textTransform: "uppercase",
            color: "#7C3AED",
          }}
        >
          Contract
        </span>
        <span style={{ font: "400 11px 'DM Sans',sans-serif", color: "#6E6E7C" }}>{timeText}</span>
      </div>

      <div
        style={{
          marginTop: 10,
          font: "600 15.5px/1.35 'DM Sans',sans-serif",
          letterSpacing: "-.5px",
          color: "#0A0A0A",
        }}
      >
        Sign contract to lock deal
      </div>
      <div style={{ marginTop: 7, font: "400 12.5px/1.5 'DM Sans',sans-serif", color: "#71717F" }}>
        Terms finalized — negotiation is now closed.
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 9 }}>
        <div style={{ flex: 1, padding: "12px 13px", borderRadius: 13, background: "#F7F7FA" }}>
          <div style={{ font: "400 11px 'DM Sans',sans-serif", color: "#5C5C6B" }}>Creator</div>
          <div
            style={{
              marginTop: 4,
              font: "600 13px 'DM Sans',sans-serif",
              color: isCreatorSigned ? "#0B7B45" : "#B45309",
            }}
          >
            {isCreatorSigned ? "Signed" : "Pending"}
          </div>
        </div>

        <div style={{ flex: 1, padding: "12px 13px", borderRadius: 13, background: "#F7F7FA" }}>
          <div style={{ font: "400 11px 'DM Sans',sans-serif", color: "#5C5C6B" }}>Brand</div>
          <div
            style={{
              marginTop: 4,
              font: "600 13px 'DM Sans',sans-serif",
              color: isBrandSigned ? "#0B7B45" : "#B45309",
            }}
          >
            {isBrandSigned ? "Signed" : "Pending"}
          </div>
        </div>
      </div>

      {!mySigned ? (
        <button
          onClick={onOpenContract}
          style={{
            marginTop: 14,
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
          Review &amp; sign
        </button>
      ) : (
        <div
          style={{
            marginTop: 14,
            height: 40,
            borderRadius: 12,
            background: "#F3EEFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: "600 12.5px 'DM Sans',sans-serif",
            color: "#6D28D9",
          }}
        >
          {isBrandSigned && isCreatorSigned ? "Both sides have signed ✓" : "Waiting for the other side to sign" /* v332: kept saying "Awaiting…" after both had signed */}
        </div>
      )}
    </div>
  );
}
