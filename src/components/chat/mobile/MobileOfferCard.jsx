import { offerFloorOf, openOfferFloor, inr0 } from "./chatStageMap"; // v419
import React, { useState } from "react";
import { isThreadCancelled } from "../dealState"; // v414

export default function MobileOfferCard({ message, isMine, isBrand, onAccept, onCounter, allMessages, thread }) {
  const offer = message.metadata || {};
  const amount = offer.amount || offer.proposed_amount || 0;
  const originalAsk = offer.original_amount || offer.base_amount || null; // session 30: no invented ₹15,000
  const isCounter = message.message_type === "negotiation_offer" || offer.is_counter;
  const status = (offer.status || "").toUpperCase();

  const myMsgId = message.id || message.message_id;
  const myCreatedAt = message.created_at ? new Date(message.created_at).getTime() : 0;
  const offerMessages = (allMessages || []).filter(m => 
    m && (m.message_type === 'negotiation_offer' || m.message_type === 'offer')
  );

  let isSuperseded = false;
  if (offerMessages.length > 1) {
    const myIndex = offerMessages.findIndex(m => (m.id || m.message_id) === myMsgId);
    if (myIndex !== -1) {
      if (myIndex < offerMessages.length - 1) isSuperseded = true;
    } else if (myCreatedAt > 0) {
      const hasNewer = offerMessages.some(m => {
        const t = m.created_at ? new Date(m.created_at).getTime() : 0;
        return t > myCreatedAt;
      });
      if (hasNewer) isSuperseded = true;
    }
  }

  const threadFlowUpper = String(thread?.flow_state || '').toUpperCase();
  const threadStatusUpper = String(thread?.status || '').toUpperCase();
  // v414: executed only when BOTH signatures are in (flow ACTIVE is written only then). One signature used to set status ACTIVE.
  const isAgreementExecuted = Boolean(
    (thread?.agreement_signed_creator && thread?.agreement_signed_brand) ||
    threadFlowUpper === 'ACTIVE' ||
    ['ESCROW_PAID', 'ESCROW_FUNDED', 'COMPLETED', 'PAID', 'CONTENT_SUBMITTED', 'IN_REVIEW', 'APPROVED', 'CLOSED'].includes(threadStatusUpper) ||
    ['ESCROW_PAID', 'ESCROW_FUNDED', 'COMPLETED', 'CONTENT_SUBMITTED', 'IN_REVIEW', 'APPROVED', 'CLOSED'].includes(threadFlowUpper)
  );
  const isAgreementReady = Boolean(
    threadFlowUpper === 'AI_AGREEMENT_READY' ||
    threadFlowUpper === 'AGREEMENT_SIGNED' ||
    threadStatusUpper === 'AI_AGREEMENT_READY' ||
    threadStatusUpper === 'AGREEMENT_SIGNED'
  );

  // v414: a counter declined on the server (decline-counter posts a 'counter_offer_declined' system message after it).
  const isDeclined = !isSuperseded && (allMessages || []).some(m => {
    if (m?.metadata?.action !== 'counter_offer_declined') return false;
    const t = m.created_at ? new Date(m.created_at).getTime() : 0;
    return t >= myCreatedAt;
  });
  const dealClosed = isThreadCancelled(thread); // v414: a cancelled deal's offers are read-only
  const isResolved = dealClosed || isDeclined || isSuperseded || isAgreementExecuted || isAgreementReady || ["ACCEPTED", "SIGNED", "REJECTED", "COUNTERED"].includes(status);
  const when = message.created_at ? new Date(message.created_at) : null;
  const timeText = when && !Number.isNaN(when.getTime()) // v332: no "Invalid Date"
    ? when.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" /* v330: IST */ }).replace(/\b(am|pm)\b/g, (s) => s.toUpperCase())
    : ""; // session 30: no made-up time when the message has none
  // v332: a declined / countered offer said "Accepted ✓" (or "Locked at ₹X" on my side).
  const resolvedLabel = dealClosed && !isAgreementExecuted && status !== "ACCEPTED" && status !== "SIGNED" ? "Deal cancelled" : isSuperseded || status === "COUNTERED"
    ? "Countered"
    : status === "REJECTED" || isDeclined /* v414 */
      ? "Declined"
      : isMine ? `Locked at ₹${Number(amount).toLocaleString("en-IN")}` : "Accepted ✓";
  const resolvedMuted = isSuperseded || status === "COUNTERED" || status === "REJECTED" || isDeclined; // v414

  const [showCounterInput, setShowCounterInput] = useState(false);
  const [counterVal, setCounterVal] = useState("");
  const [busy, setBusy] = useState(false);

  const canRespond = !isMine && !isResolved && onAccept && onCounter;

  const handleAccept = async () => {
    if (busy) return;
    setBusy(true);
    try { await onAccept(); } finally { setBusy(false); }
  };

  // v332: the server refuses offers under ₹3,000; the box used to close and lose the number on that error.
  const floor = thread ? offerFloorOf(thread) : openOfferFloor(); // v419
  const counterTooLow = Boolean(counterVal) && Number(counterVal) < floor;
  const handleSendCounter = async () => {
    if (!counterVal || busy || counterTooLow) return;
    setBusy(true);
    try {
      await onCounter(counterVal);
      setShowCounterInput(false);
      setCounterVal("");
    } finally {
      setBusy(false);
    }
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
        borderRadius: cardRadius,
        background: "#fff",
        boxShadow: "0 14px 30px -24px rgba(16,16,20,.5)",
        overflow: "hidden",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div style={{ padding: "14px 14px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            font: "600 9.5px 'DM Sans',sans-serif",
            letterSpacing: "1px",
            textTransform: "uppercase",
            color: isCounter ? "#B45309" : "#0B7B45",
          }}
        >
          {isCounter ? "Counter" : isMine ? "My ask" : "Offer"}
        </span>
        <span style={{ font: "400 11px 'DM Sans',sans-serif", color: "#6E6E7C" }}>{timeText}</span>
      </div>

      <div style={{ padding: "7px 14px 0", display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ font: "700 26px/1 'DM Sans',sans-serif", letterSpacing: "-2px", color: "#0A0A0A" }}>
          ₹{Number(amount).toLocaleString("en-IN")}
        </span>
        {isCounter && originalAsk && Number(originalAsk) !== Number(amount) && (
          <span style={{ font: "500 13px 'DM Sans',sans-serif", color: "#6E6E7C", textDecoration: "line-through" }}>
            ₹{Number(originalAsk).toLocaleString("en-IN")}
          </span>
        )}
      </div>

      <div style={{ padding: "7px 14px 0", font: "400 12.5px/1.5 'DM Sans',sans-serif", color: "#71717F" }}>
        {/* v353: the "my application rate" line is the creator's voice — a brand's offer with no note shows nothing */}
        {offer.note ? `"${offer.note}"` : isCounter ? '"This is my proposed rate for this scope of work."'
          : (String(message.sender_role || offer.sender_role || "").toLowerCase() === "creator" || (!message.sender_role && !offer.sender_role && isMine !== Boolean(isBrand)))
            ? "Thank you for choosing me 🤝 This is my submitted application rate." : null}
      </div>

      <div style={{ padding: "12px 14px 14px" }}>
        {isResolved ? (
          <div
            style={{
              height: 40,
              borderRadius: 12,
              background: resolvedMuted ? "#F5F3FF" : "#ECFDF5",
              border: resolvedMuted ? "1px solid #DDD6FE" : "1px solid #A7F3D0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              font: "600 12px 'DM Sans',sans-serif",
              color: resolvedMuted ? "#7C3AED" : "#0B7B45",
            }}
          >
            {resolvedLabel}
          </div>
        ) : canRespond ? (
          showCounterInput ? (
            <div style={{ padding: 14, borderRadius: 12, background: "#F7F7FA" }}>
              <div style={{ font: "600 9.5px 'DM Sans',sans-serif", letterSpacing: "1px", textTransform: "uppercase", color: "#5C5C6B" }}>
                Your counter
              </div>
              {/* Session 41 (Ravi): the amount box had no min width, so it pushed "Send" out of
                  the card. Amount on its own row, Cancel + Send under it — both always visible. */}
              <div style={{ marginTop: 10, height: 44, display: "flex", alignItems: "center", gap: 6, border: "1.5px solid #7C3AED", borderRadius: 12, background: "#fff", padding: "0 12px", boxSizing: "border-box", minWidth: 0 }}>
                <span style={{ font: "700 15px 'DM Sans',sans-serif", color: "#6E6E7C" }}>₹</span>
                <input
                  value={counterVal}
                  onChange={(e) => setCounterVal(e.target.value.replace(/[^0-9]/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter" && counterVal && !busy && !e.nativeEvent?.isComposing) handleSendCounter(); }}
                  inputMode="numeric"
                  enterKeyHint="send"
                  autoFocus
                  placeholder="Your amount"
                  aria-label="Your counter amount"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    width: "100%",
                    height: 40,
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    font: "600 16px 'DM Sans',sans-serif", // v332: 16px stops the iPhone zoom on tap
                    color: "#0A0A0A",
                  }}
                />
              </div>
              {counterTooLow && (
                <div role="alert" style={{ marginTop: 6, font: "500 11.5px 'DM Sans',sans-serif", color: "#B45309" }}>
                  The lowest offer allowed is {inr0(floor)}.
                </div>
              )}
              <div style={{ marginTop: 9, display: "flex", gap: 9 }}>
                <button
                  type="button"
                  onClick={() => { setShowCounterInput(false); setCounterVal(""); }}
                  style={{
                    flex: 1,
                    height: 40,
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
                  type="button"
                  data-testid="offer-counter-send"
                  disabled={busy || !counterVal || counterTooLow}
                  onClick={handleSendCounter}
                  style={{
                    flex: 1.4,
                    height: 40,
                    border: "none",
                    borderRadius: 12,
                    background: "#7C3AED",
                    font: "600 12.5px 'DM Sans',sans-serif",
                    color: "#fff",
                    cursor: busy || !counterVal || counterTooLow ? "not-allowed" : "pointer",
                    opacity: busy || !counterVal || counterTooLow ? 0.6 : 1,
                  }}
                >
                  {busy ? "Sending…" : counterVal ? `Send ₹${Number(counterVal).toLocaleString("en-IN")}` : "Send"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 9 }}>
              {/* Secondary/Counter button on LEFT */}
              <button
                disabled={busy}
                onClick={() => setShowCounterInput(true)}
                style={{
                  height: 42,
                  padding: "0 18px",
                  border: "1px solid #E4E4EC",
                  borderRadius: 13,
                  background: "#fff",
                  font: "600 12.5px 'DM Sans',sans-serif",
                  color: "#5C5C6B",
                  cursor: "pointer",
                }}
              >
                Counter
              </button>
              {/* Primary/Accept button on RIGHT */}
              <button
                disabled={busy}
                onClick={handleAccept}
                style={{
                  flex: 1,
                  height: 42,
                  border: "none",
                  borderRadius: 13,
                  background: "#7C3AED",
                  font: "600 12.5px 'DM Sans',sans-serif",
                  color: "#fff",
                  cursor: "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                Accept ₹{Number(amount).toLocaleString("en-IN")}
              </button>
            </div>
          )
        ) : (
          <div
            style={{
              height: 40,
              borderRadius: 12,
              background: "#F7F7FA",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              font: "600 12.5px 'DM Sans',sans-serif",
              color: "#5C5C6B",
            }}
          >
            {isMine ? "Waiting for response…" : "Awaiting response…"}
          </div>
        )}
      </div>
    </div>
  );
}
