import React, { useState } from "react";
import { ExternalLink } from "lucide-react";

export default function MobileLiveLinksCard({
  message,
  isMine,
  isBrand,
  onApprove,
  onReject,
  thread,
  amount,
  isDealCompleted,
  isSuperseded = false,
}) {
  const meta = message.metadata || {};
  const links = meta.links || (meta.live_link ? [{ url: meta.live_link }] : null) || meta.live_links || [];
  const singleUrl = meta.url || meta.link || meta.live_link || thread?.live_link || thread?.ugc_order?.live_link || "";
  let allLinks = links.length > 0 ? links : singleUrl ? [{ url: singleUrl }] : [];
  if (allLinks.length === 0) {
    const text = message.content || message.text || "";
    const match = text.match(/https?:\/\/[^\s]+/i);
    if (match) {
      allLinks = [{ url: match[0] }];
    } else if (thread?.live_link || thread?.ugc_order?.live_link) {
      allLinks = [{ url: thread?.live_link || thread?.ugc_order?.live_link }];
    }
  }

  // Extract creator notes if any
  const rawNotes =
    meta.notes ||
    meta.feedback ||
    meta.creator_notes ||
    (() => {
      const text = message.content || message.text || "";
      const notesMatch = text.match(/Notes?:\s*(.+)$/im);
      return notesMatch ? notesMatch[1].trim() : "";
    })();

  const displayAmt = amount || thread?.agreed_amount || thread?.amount_fixed || 0;
  const when = message.created_at ? new Date(message.created_at) : null;
  const timeText = when && !Number.isNaN(when.getTime()) // v332: no "Invalid Date"
    ? when.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" /* v330: IST */ }).replace(/\b(am|pm)\b/g, (s) => s.toUpperCase())
    : ""; // session 30: no made-up time when the message has none

  const isApproved =
    Boolean(isDealCompleted) ||
    meta.status === "APPROVED" ||
    meta.status === "COMPLETED" ||
    meta.status === "LIVE_LINKS_APPROVED" ||
    thread?.flow_state === "COMPLETED" ||
    thread?.status === "COMPLETED" ||
    thread?.payout_status === "RELEASED" ||
    thread?.ugc_order?.status === "COMPLETED" ||
    thread?.ugc_order?.payment_status === "RELEASED";

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  // A newer link card (or a later step) exists: this one is history, not something to act on.
  const canBrandReview = Boolean(isBrand && !isApproved && !isSuperseded);

  const handleApprove = async () => {
    if (busy) return;
    setBusy(true);
    try { await onApprove?.(); } finally { setBusy(false); } // v330: an error left the button disabled
    setConfirmOpen(false);
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    if (busy) return;
    setBusy(true);
    let ok = true;
    try { ok = await onReject?.(rejectReason); } finally { setBusy(false); } // v330
    if (ok === false) return; // v332: keep the typed reason when the request failed
    setRejectOpen(false);
    setRejectReason("");
  };

  const cardRadius = isMine ? "20px 20px 8px 20px" : "20px 20px 20px 8px";
  const alignSide = isMine ? "flex-end" : "flex-start";

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
        borderLeft: "3px solid #7C3AED",
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
            color: "#5B21B6",
          }}
        >
          Live links review 🚀
        </span>
        <span style={{ font: "400 10.5px 'DM Sans',sans-serif", color: "#6E6E7C" }}>{timeText}</span>
      </div>

      <div style={{ marginTop: 9, font: "600 12.5px 'DM Sans',sans-serif", color: "#0A0A0A" }}>
        🔗 Submitted live campaign links
      </div>

      {/* Link Rows */}
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
        {allLinks.length > 0 ? (
          allLinks.map((item, idx) => {
            const url = typeof item === "string" ? item : item?.url || "";
            const isInsta = url.includes("instagram") || url.includes("reel");
            const cleanDisplay = url.replace(/^https?:\/\/(www\.)?/, "");

            return (
              <a
                key={idx}
                href={url.startsWith("http") ? url : `https://${url}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: "11px 12px",
                  borderRadius: 12,
                  background: "#F7F7FA",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  textDecoration: "none",
                }}
              >
                <PlatformGlyph url={url} />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    font: "500 12px 'DM Sans',sans-serif",
                    color: "#5B21B6",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {cleanDisplay || "Link"}
                </span>
                <ExternalLink size={14} color="#7C3AED" style={{ flexShrink: 0 }} />
              </a>
            );
          })
        ) : (
          <div
            style={{
              padding: "11px 12px",
              borderRadius: 12,
              background: "#F7F7FA",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <PlatformGlyph url="" />
            <span
              style={{
                flex: 1,
                minWidth: 0,
                font: "500 12px 'DM Sans',sans-serif",
                color: "#5B21B6",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              No link added yet
            </span>
            {/* v332: no "open link" arrow when there is nothing to open */}
          </div>
        )}
      </div>

      {/* Creator Notes if present */}
      {Boolean(rawNotes) && (
        <div
          style={{
            marginTop: 10,
            padding: "9px 11px",
            borderRadius: 11,
            background: "#F5F3FF",
            border: "1px solid #EDE9FE",
            font: "400 11.5px/1.45 'DM Sans',sans-serif",
            color: "#4C1D95",
            wordBreak: "break-word",
          }}
        >
          <span style={{ fontWeight: "700" }}>Note: </span>
          {rawNotes}
        </div>
      )}

      {/* Action Sections */}
      {isApproved ? (
        <div
          style={{
            marginTop: 12,
            height: 38,
            borderRadius: 12,
            background: "#ECFDF5",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: "600 12px 'DM Sans',sans-serif",
            color: "#0B7B45",
          }}
        >
          {thread?.utr_number || thread?.payout_utr || thread?.payout_completed ? "✓ Live links approved · Payout released" : "✓ Live links approved · Payout processing" /* v353: "released" only once paid; v414: RELEASED is stamped at approval, so only a UTR counts */}
        </div>
      ) : isSuperseded ? (
        <div style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 12,
            background: "#F4F4F6",
            font: "600 11.5px/1.45 'DM Sans',sans-serif",
            color: "#6B6B76",
          }}>
          A newer link or step is below — act on the latest card.
        </div>
      ) : canBrandReview ? (
        confirmOpen ? (
          <div style={{ marginTop: 12, padding: 13, borderRadius: 13, background: "#ECFDF5" }}>
            <div style={{ font: "600 12.5px/1.5 'DM Sans',sans-serif", color: "#065F46" }}>
              {/* v330: no "release ₹0" when the amount isn't on this card */}
              {/* v414: approval doesn't move money itself — Ybex pays the creator after */}
              Are you sure? Approving completes the deal — Ybex sends the creator's payout{Number(displayAmt) > 0 ? ` for the ₹${Number(displayAmt).toLocaleString("en-IN")} deal` : ""} in 1–2 working days. This cannot be undone.
            </div>
            <div style={{ marginTop: 11, display: "flex", gap: 8 }}>
              <button
                onClick={() => setConfirmOpen(false)}
                style={{
                  height: 40,
                  padding: "0 15px",
                  border: "1px solid #C7EFDD",
                  borderRadius: 12,
                  background: "#fff",
                  font: "600 12.5px 'DM Sans',sans-serif",
                  color: "#0B7B45",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                disabled={busy}
                onClick={handleApprove}
                style={{
                  flex: 1,
                  height: 40,
                  border: "none",
                  borderRadius: 12,
                  background: "#0B7B45",
                  font: "600 12.5px 'DM Sans',sans-serif",
                  color: "#fff",
                  cursor: "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? "Releasing…" : "Confirm & release payment" /* v330: show progress */}
              </button>
            </div>
          </div>
        ) : rejectOpen ? (
          <div style={{ marginTop: 12, padding: 13, borderRadius: 13, background: "#F7F7FA" }}>
            <div
              style={{
                font: "600 9.5px 'DM Sans',sans-serif",
                letterSpacing: "1px",
                textTransform: "uppercase",
                color: "#5C5C6B",
              }}
            >
              What is the issue with the link?
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Brand tag is missing from caption."
              aria-label="What is the issue with the link?"
              style={{
                marginTop: 9,
                width: "100%",
                height: 64,
                border: "1px solid #E4E4EC",
                borderRadius: 12,
                background: "#fff",
                padding: "10px 12px",
                font: "400 16px/1.4 'DM Sans',sans-serif", // v332: 16px stops the iPhone zoom
                color: "#0A0A0A",
                resize: "none",
                boxSizing: "border-box",
              }}
            />
            <div style={{ marginTop: 9, display: "flex", gap: 8 }}>
              <button
                onClick={() => setRejectOpen(false)}
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
                disabled={busy || !rejectReason.trim()}
                onClick={handleReject}
                style={{
                  flex: 1,
                  height: 40,
                  border: "none",
                  borderRadius: 12,
                  background: "#7C3AED",
                  font: "600 12.5px 'DM Sans',sans-serif",
                  color: "#fff",
                  cursor: busy || !rejectReason.trim() ? "not-allowed" : "pointer",
                  opacity: busy || !rejectReason.trim() ? 0.6 : 1,
                }}
              >
                {busy ? "Sending…" : "Request resubmission" /* v332: busy label */}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ marginTop: 10, font: "400 12px/1.5 'DM Sans',sans-serif", color: "#5C5C6B" }}>
              If the links are valid, click <b style={{ color: "#0A0A0A" }}>Approve &amp; pay</b> to release payout, or select <b style={{ color: "#0A0A0A" }}>Ask to resubmit</b>.
            </div>
            <div style={{ marginTop: 11, display: "flex", gap: 8 }}>
              <button
                onClick={() => (onReject ? onReject() : setRejectOpen(true))} /* Session 58: one place to write the reason (the sheet); the inline box text was being thrown away */
                style={{
                  flex: 1,
                  height: 42,
                  border: "none",
                  borderRadius: 13,
                  background: "#FEF2F2",
                  font: "600 12.5px 'DM Sans',sans-serif",
                  color: "#E11D48",
                  cursor: "pointer",
                }}
              >
                Ask to resubmit
              </button>
              <button
                onClick={() => setConfirmOpen(true)}
                style={{
                  flex: 1,
                  height: 42,
                  border: "none",
                  borderRadius: 13,
                  background: "#0B7B45",
                  font: "600 12.5px 'DM Sans',sans-serif",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                ✓ Approve &amp; pay
              </button>
            </div>
          </>
        )
      ) : (
        <div
          style={{
            marginTop: 12,
            height: 40,
            borderRadius: 12,
            background: "#F5F2FF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: "600 12px 'DM Sans',sans-serif",
            color: "#5B21B6",
          }}
        >
          ⏳ Waiting for brand approval…
        </div>
      )}
    </div>
  );
}

// Session 43 (Ravi: "Instagram logo doesn't show; a YouTube link should show YouTube"): the real
// platform mark, picked from the link itself.
function PlatformGlyph({ url }) {
  const u = String(url || "").toLowerCase();
  const kind = /instagram\.com|instagr\.am/.test(u) ? "ig" : /youtube\.com|youtu\.be/.test(u) ? "yt" : /facebook\.com|fb\.watch/.test(u) ? "fb"
    : /linkedin\.com/.test(u) ? "li" : /(^|\/\/|\.)x\.com|twitter\.com/.test(u) ? "x" : "link";
  const bg = { ig: "linear-gradient(135deg,#F9CE34,#EE2A7B,#6228D7)", yt: "#FF0000", fb: "#1877F2", li: "#0A66C2", x: "#0A0A0A", link: "#E9E5F5" }[kind];
  const ink = kind === "link" ? "#7C3AED" : "#fff";
  return (
    <span style={{ width: 28, height: 28, borderRadius: 9, flexShrink: 0, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }} data-testid={`live-link-icon-${kind}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {kind === "ig" && (<><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill={ink} stroke="none" /></>)}
        {kind === "yt" && <path d="M10 8.5v7l6-3.5z" fill={ink} stroke="none" />}
        {kind === "fb" && <path d="M14 8h2V5h-2a3 3 0 00-3 3v2H9v3h2v6h3v-6h2l.5-3H14V8.5a.5.5 0 01.5-.5z" fill={ink} stroke="none" />}
        {kind === "li" && (<><path d="M7 10v7M7 7v.01M11 17v-4a2 2 0 014 0v4M11 10v7" /></>)}
        {kind === "x" && <path d="M5 5l14 14M19 5L5 19" />}
        {kind === "link" && (<><path d="M10 14a4 4 0 005.6 0l3-3a4 4 0 00-5.6-5.6l-1 1" /><path d="M14 10a4 4 0 00-5.6 0l-3 3a4 4 0 005.6 5.6l1-1" /></>)}
      </svg>
    </span>
  );
}
