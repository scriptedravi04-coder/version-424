import React from "react";
import { motion } from "framer-motion";
import { Shield, Check } from "lucide-react";
import { Presence, PopupBackdrop, PopupPanel } from "../../../common/Popup"; // v416: leave sheet


// Session 49 (clean-up): moved out of MobileCampaignCreate.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function KycShieldNotice(props) {
  const { handleSaveCampaign, navigate, setShowKycModal, canSaveDraft = true } = props; // v358: + canSaveDraft
  return (
    <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-sm bg-white rounded-[22px] p-6 z-10 shadow-[0_26px_60px_-28px_rgba(12,12,18,0.55)] text-left"
            >
              {/* Shield Icon in amber box */}
              <div className="w-[52px] h-[52px] rounded-[17px] bg-[#FFF7E8] border border-[#F5E0B8] flex items-center justify-center">
                <Shield size={24} className="text-[#B45309] stroke-[1.9]" />
              </div>

              <h3 className="mt-4 text-[20px] font-semibold leading-[1.3] tracking-[-0.5px] text-[#0A0A0A]">
                Verify your business to publish
              </h3>
              <p className="mt-2 text-[13px] leading-[1.6] text-[#6B7280]">
                Creators only see campaigns from verified brands — it keeps payments and payouts safe.{/* v415: plain copy */}{" "/* v416 (C18): "safe.The" ran together */}
                The Ybex team reviews it, usually within a day.{/* v358: it's a manual review */}
              </p>

              {/* Requirement Checklist */}
              <div className="mt-4 p-3 rounded-[12px] bg-[#F9F9FB] border border-[#E5E5EA] flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5">
                  <Check size={14} className="text-[#047857] stroke-[2.6]" />
                  <span className="text-[12.5px] font-medium text-[#3F3F46]">GSTIN or PAN</span>{/* v358: only what the KYC form really asks */}
                </div>
                <div className="flex items-center gap-2.5">
                  <Check size={14} className="text-[#047857] stroke-[2.6]" />
                  <span className="text-[12.5px] font-medium text-[#3F3F46]">Business document (optional)</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check size={14} className="text-[#047857] stroke-[2.6]" />
                  <span className="text-[12.5px] font-medium text-[#3F3F46]">Contact person</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowKycModal(false);
                    navigate("/brand/kyc");
                  }}
                  className="h-[50px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold text-[15px] flex items-center justify-center transition-colors cursor-pointer"
                >
                  Start KYC · 3 min
                </button>
                {canSaveDraft && ( /* v358: never offered while editing a live campaign (it would take it offline) */
                <button
                  type="button"
                  onClick={async () => {
                    setShowKycModal(false);
                    await handleSaveCampaign(true);
                  }}
                  className="h-[46px] rounded-[14px] bg-[#F2F2F7] text-[#3F3F46] font-semibold text-[14px] flex items-center justify-center transition-colors cursor-pointer hover:bg-slate-200"
                >
                  Save draft instead
                </button>
                )}
              </div>
            </motion.div>
  );
}

// v416 (C16): "Leave without saving?" — Back on step 1 with unsaved work (it saved a device-only copy, or dropped a
// live campaign's edits without asking). Save draft (server) · Discard · Keep editing.
export function LeaveDraftSheet({ open, busy = false, canSaveDraft = true, onSave, onDiscard, onClose }) {
  return (
      <Presence>{open && (
      <>
        <PopupBackdrop className="fixed inset-0 z-[70] bg-[rgba(10,10,14,.45)]" onClick={() => !busy && onClose()} />
        <PopupPanel kind="sheet" closeOnEscape={!busy} onClose={() => !busy && onClose()} aria-labelledby="m-campaign-leave-title"
          className="fixed left-0 right-0 bottom-0 z-[71] bg-white rounded-t-[26px] px-[18px] pt-2.5 flex flex-col gap-3"
          style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 -20px 40px -20px rgba(0,0,0,.3)" }}>
          <div className="w-10 h-[5px] rounded-full bg-[#E0E0E6] self-center" />
          <div id="m-campaign-leave-title" className="text-[17px] font-bold text-[#0A0A0A]">Leave without saving?</div>
          <div className="-mt-1 text-[13.5px] leading-normal text-[#6B7280]">
            {canSaveDraft ? "Save it as a draft to finish later, or discard it." : "Your changes to this live campaign haven't been sent. Discard them?"}
          </div>
          {canSaveDraft && (
            <button type="button" disabled={busy} onClick={onSave}
              className="h-[50px] rounded-2xl bg-[#7C3AED] text-white text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden="true" />} Save draft
            </button>
          )}
          <button type="button" disabled={busy} onClick={onDiscard}
            className="h-[50px] rounded-2xl bg-white border border-[#FECACA] text-[#B91C1C] text-[15px] font-semibold disabled:opacity-60">
            Discard
          </button>
          <button type="button" disabled={busy} onClick={onClose}
            className="h-[50px] rounded-2xl bg-white border border-[#E0E0E8] text-[#0A0A0A] text-[15px] font-semibold">
            Keep editing
          </button>
        </PopupPanel>
      </>
    )}</Presence>
  );
}
