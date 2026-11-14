import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Flag, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import ModalPortal from "../common/ModalPortal";
import ButtonSpinner from "../common/ButtonSpinner";
import useBusy from "../../lib/useBusy";
import { PopupBackdrop, PopupPanel } from "../common/Popup";

// v334 (App Store 1.2 — user-generated content): "Report this profile" on public creator / brand profiles.
// Uses the existing POST /reports (backend/misc_routes.ts → `reports` table → Admin → System reports).
// No new server route, no database change. Hidden on your own profile; logged-out people are sent to login.
const REASONS = [
  "Fake profile or scam",
  "Abusive, hateful or harassing",
  "Sexual or inappropriate content",
  "Spam or asking to pay outside Ybex",
  "Something else",
];

export default function ReportUserLink({ targetId, kind = "user", name = "", className = "" }) {
  const { user } = useAuth() || {};
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const { isBusy, anyBusy, run } = useBusy();

  if (!targetId) return null;
  const own = user && (user.user_id === targetId || user.id === targetId);
  if (own) return null;

  const linkCls = `inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500 hover:text-rose-600 min-h-[40px] ${className}`;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return (
      <Link to={`/login?next=${next}`} className={linkCls} data-testid="report-profile-login">
        <Flag size={14} /> Report this profile
      </Link>
    );
  }

  const send = (e) => run("report", async () => {
    e?.preventDefault?.();
    try {
      await api.post("reports", {
        type: `${kind}_profile`,
        target: String(targetId),
        severity: reason === REASONS[0] || reason === REASONS[2] ? "high" : "medium",
        description: [`Reason: ${reason}`, name ? `Profile: ${name}` : "", note.trim() ? `Details: ${note.trim()}` : "", `Page: ${location.pathname}`].filter(Boolean).join("\n"),
      });
      toast.success("Thanks — our team will review this profile, usually within 24 hours.");
      setOpen(false);
      setNote("");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Couldn't send the report. Please try again or email support@ybexmedia.in.");
    }
  });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={linkCls} data-testid="report-profile">
        <Flag size={14} /> Report this profile
      </button>
      {open && (
        <ModalPortal>
          <PopupBackdrop className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={() => !anyBusy && setOpen(false)}>
            <form onSubmit={send} onClick={(e) => e.stopPropagation()} data-testid="report-profile-form"
              className="bg-white w-full sm:max-w-md rounded-t-[24px] sm:rounded-2xl p-5 relative max-h-[90vh] overflow-y-auto"
              style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}>
              <PopupPanel kind="auto" below={640} onClose={() => !anyBusy && setOpen(false)} className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Report {name || "this profile"}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">They won't know you reported them. Our team checks every report.</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} disabled={anyBusy} aria-label="Close" className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><X size={16} /></button>
              </PopupPanel>
              <fieldset className="mt-4 space-y-2">
                <legend className="text-xs font-semibold text-gray-700 mb-1">What's wrong?</legend>
                {REASONS.map((r) => (
                  <label key={r} className={`flex items-center gap-3 rounded-xl border px-3 min-h-[44px] cursor-pointer ${reason === r ? "border-[#7C3AED] bg-[#F5F0FF]" : "border-gray-200"}`}>
                    <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-[#7C3AED]" />
                    <span className="text-sm text-gray-900">{r}</span>
                  </label>
                ))}
              </fieldset>
              <label className="block mt-3 text-xs font-semibold text-gray-700">More details (optional)</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1500} placeholder="What happened?" className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-base sm:text-sm resize-none" />
              <p className="mt-2 text-[11.5px] text-gray-500">Want them to stop contacting you? Tap Block on their profile or in the chat menu.</p>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => setOpen(false)} disabled={anyBusy} className="h-11 px-4 rounded-xl bg-gray-100 text-sm font-semibold text-gray-800">Cancel</button>
                <button type="submit" disabled={anyBusy} className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                  {isBusy("report") && <ButtonSpinner />} Send report
                </button>
              </div>
            </form>
          </PopupBackdrop>
        </ModalPortal>
      )}
    </>
  );
}
