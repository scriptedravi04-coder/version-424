import React, { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import ModalPortal from "../common/ModalPortal";
import ButtonSpinner from "../common/ButtonSpinner";
import useBusy from "../../lib/useBusy";
import useScrollLock from "../../lib/useScrollLock"; // v415

import { PopupBackdrop, PopupPanel } from "../common/Popup";
// Session 33: this form was a stub — "Submit" only closed it and no ticket was ever created
// (Help Center, Help category, My tickets, brand + creator mobile help, account status).
// Now it posts to the existing POST /support/tickets (support_routes.ts).
const CATEGORIES = ["Payments & Earnings", "Campaigns & Deals", "UGC orders", "Profile & KYC", "Account & Login", "Trust & Safety", "Other"];

export default function TicketForm({ onClose, onCreated, defaultCategory = "", initialCategory = "", orderId = null }) {
  const [subject, setSubject] = useState("");
  // v332: Help category / Account status pass `initialCategory` (it was ignored), and a topic that is not in
  // the list no longer leaves the box showing one topic while sending another.
  const [category, setCategory] = useState(() => {
    const c = defaultCategory || initialCategory;
    return CATEGORIES.includes(c) ? c : CATEGORIES[0];
  });
  const [message, setMessage] = useState("");
  const { isBusy, anyBusy, run } = useBusy();
  // v415: page behind stays still; Escape closes (not while sending)
  useScrollLock(true);
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !anyBusy) onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyBusy, onClose]);

  const submit = (e) => run("submit", async () => {
    e?.preventDefault?.();
    if (!message.trim()) { toast.error("Please describe the problem."); return; }
    try {
      const { data } = await api.post("/support/tickets", {
        subject: subject.trim() || undefined,
        category,
        issue_category: category,
        message: message.trim(),
        order_id: orderId || undefined,
      });
      toast.success("Ticket sent. Our team will reply here and by notification.");
      onCreated?.(data);
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Could not send the ticket. Please try again.");
    }
  });

  return (
    <ModalPortal>
      <PopupBackdrop className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={() => !anyBusy && onClose?.()}>
        {/* v415: the whole sheet slides in (only its header used to animate while the body popped in) */}
        <PopupPanel as="form" kind="auto" below={640} onClose={() => !anyBusy && onClose?.()}
          onSubmit={submit} onClick={(e) => e.stopPropagation()} data-testid="ticket-form"
          role="dialog" aria-modal="true" aria-labelledby="ticket-form-title"
          className="bg-white w-full sm:max-w-md rounded-t-[24px] sm:rounded-2xl p-5 relative max-h-[90dvh] overflow-y-auto overscroll-contain"
          style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="ticket-form-title" className="text-lg font-bold text-gray-900">Contact support</h2>
              <p className="text-xs text-gray-500 mt-0.5">We usually reply within a few hours.</p>
            </div>
            <button type="button" autoFocus onClick={onClose} disabled={anyBusy} aria-label="Close" className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><X size={16} /></button>{/* v332: 40px tap target */}
          </div>
          <label htmlFor="ticket-topic" className="block mt-4 text-xs font-semibold text-gray-700">Topic</label>
          <select id="ticket-topic" value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1.5 w-full h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-base sm:text-sm">{/* v332: 16px on phones (no iPhone zoom) */}
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label htmlFor="ticket-subject" className="block mt-3 text-xs font-semibold text-gray-700">Subject (optional)</label>
          <input id="ticket-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={140} placeholder="Short summary" className="mt-1.5 w-full h-11 rounded-xl border border-gray-200 bg-gray-50 px-3 text-base sm:text-sm" />
          <label htmlFor="ticket-message" className="block mt-3 text-xs font-semibold text-gray-700">What happened?</label>
          <textarea id="ticket-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={4000} placeholder="Tell us what you were doing and what went wrong." className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-base sm:text-sm resize-none" />
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={onClose} disabled={anyBusy} className="h-11 px-4 rounded-xl bg-gray-100 text-sm font-semibold text-gray-800">Cancel</button>
            <button type="submit" disabled={anyBusy} className="flex-1 h-11 rounded-xl bg-[#7C3AED] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {isBusy("submit") && <ButtonSpinner />} Send ticket
            </button>
          </div>
        </PopupPanel>
      </PopupBackdrop>
    </ModalPortal>
  );
}
