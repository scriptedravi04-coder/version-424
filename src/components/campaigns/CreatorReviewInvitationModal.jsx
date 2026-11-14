import React, { useState } from "react";
import { X, Check, AlertCircle, ShieldCheck, Calendar, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { api } from "../../lib/api";
import useBusy from "../../lib/useBusy";
import ButtonSpinner from "../common/ButtonSpinner";
import ModalPortal from "../common/ModalPortal";
import useScrollLock from "../../lib/useScrollLock";
import { formatBudget, getDeliverablesCount } from "../../utils/invitationUtils";
import useIsMobile from "../../hooks/useIsMobile";

const DECLINE_REASONS = [
  "Budget too low",
  "Deliverables not aligned",
  "Busy / Not available",
  "Other"
];

export default function CreatorReviewInvitationModal({
  isOpen = true,
  onClose,
  invite,
  onAccepted,
  onDeclined,
}) {
  const [isDeclining, setIsDeclining] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false); // v330: dead logo URL → letter tile, not a broken image
  const [selectedReason, setSelectedReason] = useState("Budget too low");
  const [customReason, setCustomReason] = useState("");

  const { isBusy, anyBusy, run } = useBusy();
  const isMobile = useIsMobile();
  // Session 29: page behind must not scroll while this is open.
  useScrollLock(Boolean(isOpen && invite));

  if (!isOpen || !invite) return null;

  const brandName = invite.brand_name || "A brand";
  const brandLogo = invite.brand_logo || "";
  const campaignTitle = invite.campaign_title || "Campaign Collaboration";
  const campaignDesc = invite.campaign_description || invite.message || invite.pitch || "";
  const budget = formatBudget(invite.proposed_budget || invite.budget_range);
  const deliverables = invite.deliverables || "Details in the deal room";
  const deliverablesCount = invite.deliverables_count || getDeliverablesCount(invite.deliverables);
  const timeline = invite.timeline || "Flexible";
  const notes = invite.notes || invite.pitch || invite.message || "";

  // 1. Accept & open deal room (label: Ravi, session 33) — opens a NEW campaign deal chat (backend/creators_routes.ts)
  const handleAccept = () => {
    run("accept", async () => {
      try {
        const res = await api.post(`/creators/invitations/${invite.id}/accept`);
        toast.success("Invitation accepted! Chat thread is now open.");
        if (onAccepted) {
          onAccepted(invite, res.data?.thread_id);
        }
        onClose();
      } catch (err) {
        toast.error(
          err.response?.data?.error ||
          "Couldn't accept the invitation. Please try again." // v332: no raw server "detail" text
        );
      }
    });
  };

  // 2. Decline Flow with Reason Confirmation
  const handleConfirmDecline = () => {
    const finalReason = selectedReason === "Other" && customReason.trim()
      ? customReason.trim()
      : selectedReason;

    run("decline", async () => {
      try {
        await api.post(`/creators/invitations/${invite.id}/decline`, {
          reason: finalReason
        });
        toast.success("Invitation declined. Brand has been notified with your reason.");
        if (onDeclined) {
          onDeclined(invite, finalReason);
        }
        onClose();
      } catch (err) {
        toast.error(
          err.response?.data?.error ||
          "Couldn't decline the invitation. Please try again." // v332: no raw server "detail" text
        );
      }
    });
  };

  // Session 33 — Ravi's invitation popup (Dashboard — new layout). Desktop: centred card.
  // Mobile: bottom sheet. Same two calls as before (accept / decline with reason).
  const initial = (brandName.trim()[0] || "B").toUpperCase();
  const sheet = isMobile;

  return (
    <ModalPortal>
    <AnimatePresence>
      <div
        className={`fixed inset-0 z-[9999] flex justify-center bg-[rgba(15,10,30,.45)] overscroll-contain ${sheet ? "items-end" : "items-center p-6 overflow-y-auto"}`}
        onClick={(e) => {
          if (e.target === e.currentTarget && !anyBusy) onClose();
        }}
        data-testid="invite-review-modal"
      >
        <motion.div
          initial={sheet ? { y: 40, opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
          animate={sheet ? { y: 0, opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={sheet ? { y: 40, opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2 }}
          className={`bg-white w-full box-border flex flex-col gap-3.5 ${sheet ? "rounded-t-[26px] px-[18px] pt-2.5 max-h-[92vh] overflow-y-auto" : "max-w-[480px] rounded-[24px] p-[22px] my-8"}`}
          style={sheet ? { paddingBottom: "calc(22px + env(safe-area-inset-bottom, 0px))" } : { boxShadow: "0 40px 80px -30px rgba(15,10,30,.6)" }}
        >
          {sheet && <div className="w-10 h-[5px] rounded-[3px] bg-[#E0E0E6] self-center" />}
          {/* v332: close button 40px tap target; reason select / input 16px on phones (no iOS zoom) */}

          {!isDeclining ? (
            <>
              {/* Brand + title */}
              <div className="flex items-center gap-3">
                {brandLogo && !logoBroken ? (
                  <img src={brandLogo} alt={brandName} onError={() => setLogoBroken(true)} className="w-11 h-11 rounded-[14px] object-cover shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded-[14px] bg-[#0A0A0A] flex items-center justify-center text-[15px] font-bold text-white shrink-0">{initial}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[#6B7280] truncate"><span>{brandName}</span> invited you</div>
                  <div className="text-lg font-bold tracking-[-.4px] text-[#0A0A0A] leading-snug">{campaignTitle}</div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={anyBusy}
                  aria-label="Close modal"
                  className="w-10 h-10 rounded-[11px] bg-[#F4F4F8] flex items-center justify-center shrink-0 disabled:opacity-50"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Budget + deliverables */}
              <div className="grid grid-cols-2 gap-2">
                <div className="px-[13px] py-[11px] rounded-[13px] bg-[#F2FBF5] min-w-0">
                  <div className="text-[10.5px] font-semibold tracking-[.5px] text-[#6B7280]">OFFERED BUDGET</div>
                  <div className="mt-0.5 text-lg font-bold text-[#15803D] truncate">{budget}</div>
                </div>
                <div className="px-[13px] py-[11px] rounded-[13px] bg-[#F7F7FA] min-w-0">
                  <div className="text-[10.5px] font-semibold tracking-[.5px] text-[#6B7280]">DELIVERABLES</div>
                  <div className="mt-0.5 text-lg font-bold text-[#0A0A0A]">{deliverablesCount} {deliverablesCount === 1 ? "item" : "items"}</div>
                  <div className="text-[11.5px] text-[#6B7280] line-clamp-2">{deliverables}</div>
                </div>
              </div>

              {/* Brief, timeline, brand note (real fields only) */}
              {campaignDesc && campaignDesc !== notes && (
                <p className="m-0 text-[13px] leading-relaxed text-[#374151] whitespace-pre-wrap">{campaignDesc}</p>
              )}
              <div className="flex items-center gap-2 text-[12.5px] text-[#4B5563]">
                <Calendar size={14} className="text-[#6B7280] shrink-0" />
                <span className="font-semibold text-[#374151]">Timeline:</span> {timeline}
              </div>
              {notes && (
                <div className="rounded-xl bg-[#FAFAFC] border border-[#EFEFF4] px-3 py-2.5 text-[12.5px] text-[#374151]">
                  <div className="flex items-center gap-1 text-[10.5px] font-semibold tracking-[.5px] text-[#6B7280] mb-1"><MessageSquare size={11} /> MESSAGE FROM THE BRAND</div>
                  <p className="m-0 leading-relaxed">"{notes}"</p>
                </div>
              )}

              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-[#F7F4FF] text-[12.5px] leading-[1.45] text-[#5B21B6]">
                <ShieldCheck size={15} className="shrink-0 mt-px" />
                <span>Accepting opens a deal room chat with {brandName}. The final fee is agreed there, held in a secure payment hold before you start, and paid only through Ybex.</span>
              </div>

              {/* docs/code/ARCHITECTURE.md: Decline left, Accept right */}
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsDeclining(true)}
                  disabled={anyBusy}
                  className="flex-1 h-[46px] rounded-[14px] border border-[#E5E5EA] bg-white text-sm font-bold text-[#374151] disabled:opacity-50"
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={anyBusy}
                  className="flex-[2] h-[46px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-sm font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  {isBusy("accept") ? <ButtonSpinner label="Accepting..." /> : <><Check size={15} /> Accept & open deal room</>}
                </button>
              </div>
            </>
          ) : (
            /* Decline Confirmation Sub-view */
            <>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-[14px] bg-[#FEF2F2] text-[#DC2626] flex items-center justify-center shrink-0"><AlertCircle size={20} /></div>
                <div className="min-w-0">
                  <h3 className="m-0 text-lg font-bold tracking-[-.4px] text-[#0A0A0A]">Decline Campaign Invitation</h3>
                  <p className="m-0 text-[12.5px] text-[#6B7280] truncate">From {brandName} • {campaignTitle}</p>
                </div>
              </div>

              <div className="px-3 py-2.5 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[12.5px] text-[#92400E] leading-relaxed">
                <strong>Are you sure you want to decline this invitation?</strong>
                <p className="m-0 mt-1 text-[12px]">The brand will be notified with your reason. No chat is created.</p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold tracking-[.5px] text-[#6B7280] mb-1.5">Reason for Declining</label>
                <select
                  value={selectedReason}
                  onChange={(e) => setSelectedReason(e.target.value)}
                  className="w-full h-11 bg-[#F9F9FB] border border-[#E5E5EA] rounded-xl px-3 text-base sm:text-sm text-[#0A0A0A] outline-none focus:border-[#7C3AED]"
                >
                  {DECLINE_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {selectedReason === "Other" && (
                <div>
                  <label className="block text-[11px] font-semibold tracking-[.5px] text-[#6B7280] mb-1.5">Please specify reason (optional)</label>
                  <input
                    type="text"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="e.g. Travelling, conflict with another sponsor…"
                    className="w-full h-11 bg-[#F9F9FB] border border-[#E5E5EA] rounded-xl px-3 text-base sm:text-sm text-[#0A0A0A] outline-none focus:border-[#7C3AED]"
                  />
                </div>
              )}

              {/* docs/code/ARCHITECTURE.md: Back left, Confirm Decline right */}
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsDeclining(false)}
                  disabled={anyBusy}
                  className="flex-1 h-[46px] rounded-[14px] border border-[#E5E5EA] bg-white text-sm font-bold text-[#374151] disabled:opacity-50"
                >
                  Back to Review
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDecline}
                  disabled={anyBusy}
                  className="flex-1 h-[46px] rounded-[14px] bg-[#DC2626] hover:bg-[#B91C1C] text-sm font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isBusy("decline") ? <ButtonSpinner label="Declining..." /> : "Confirm Decline"}
                </button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
    </ModalPortal>
  );
}
