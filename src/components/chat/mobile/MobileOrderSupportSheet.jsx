import React, { useState } from "react";
import MobileSheet, { SheetHeader } from "./MobileSheet";
import { api } from "../../../lib/api";
import { toast } from "sonner";
import { ORDER_TICKET_CATEGORIES, raiseOrderTicket } from "../orderTicket";

/**
 * Session 24. Mobile version of the desktop OrderSupportModal: raises a ticket linked to THIS
 * order (POST /support/order-ticket, same payload via orderTicket.js). Mobile used to send the
 * user to the general /help/tickets page, so the ticket had no order, amount or parties.
 *
 * `fixed` renders it over the whole screen (for pages that scroll, like the UGC workspace);
 * inside the chat it sits in the chat's own container like the other sheets.
 */
export default function MobileOrderSupportSheet({ thread, threadId, isBrand, onClose, onCreated, fixed = false }) {
  const options = ORDER_TICKET_CATEGORIES[isBrand ? "brand" : "creator"];
  const [category, setCategory] = useState(options[0][0]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneId, setDoneId] = useState(null);

  const submit = async () => {
    if (busy) return;
    if (!text.trim()) {
      toast.error("Please describe the issue.");
      return;
    }
    setBusy(true);
    try {
      const id = await raiseOrderTicket(api, { thread, threadId, category, message: text });
      setDoneId(id || "raised");
      toast.success(id ? `Support ticket #${String(id).slice(0, 8)} raised.` : "Support ticket raised.");
      onCreated?.(id);
    } catch (err) {
      console.error("[order ticket]", err);
      toast.error("Couldn't raise the ticket. Please try again."); // v332: was the raw error text ("Network Error", "Request failed with status code 500")
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <MobileSheet onClose={onClose}>
      <SheetHeader
        title="Raise an issue on this order"
        subtitle="The Ybex team sees the order, the amount and both parties with your message."
        onClose={onClose}
      />
      {doneId ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ padding: 14, borderRadius: 14, background: "#ECFDF5", border: "1px solid #A7F3D0", font: "500 13px/1.5 'DM Sans',sans-serif", color: "#065F46" }}>
            Ticket raised{doneId !== "raised" ? ` · #${String(doneId).slice(0, 8)}` : ""}. You'll get replies by email and in Help → Tickets.
          </div>
          <button
            onClick={onClose}
            style={{ marginTop: 12, width: "100%", height: 46, border: "none", borderRadius: 14, background: "#7C3AED", color: "#fff", font: "600 14px 'DM Sans',sans-serif", cursor: "pointer" }}
          >
            Done
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ font: "600 10px 'DM Sans',sans-serif", letterSpacing: "1px", textTransform: "uppercase", color: "#6B7280" }}>
            What's wrong?
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {options.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  minHeight: 42, // v332: comfortable tap height
                  borderRadius: 12,
                  border: category === value ? "1.5px solid #7C3AED" : "1px solid #E4E4EC",
                  background: category === value ? "#F5F0FF" : "#fff",
                  font: "500 13px 'DM Sans',sans-serif",
                  color: "#0A0A0A",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tell us what happened"
            aria-label="Tell us what happened"
            style={{ height: 90, border: "1px solid #E4E4EC", borderRadius: 12, padding: "10px 12px", font: "400 16px/1.45 'DM Sans',sans-serif" /* v332: 16px stops the iPhone zoom */, resize: "none", boxSizing: "border-box" }}
          />
          <button
            onClick={submit}
            disabled={busy || !text.trim()}
            style={{
              height: 48,
              border: "none",
              borderRadius: 14,
              background: busy || !text.trim() ? "#E9E3F8" : "#7C3AED",
              color: busy || !text.trim() ? "#A89BCB" : "#fff",
              font: "600 14px 'DM Sans',sans-serif",
              cursor: busy || !text.trim() ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Raising ticket…" : "Raise ticket"}
          </button>
        </div>
      )}
    </MobileSheet>
  );

  if (!fixed) return body;
  return <div style={{ position: "fixed", inset: 0, zIndex: 70 }}>{body}</div>;
}
