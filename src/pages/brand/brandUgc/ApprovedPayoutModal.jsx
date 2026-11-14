import React from "react";
import { CheckCircle2, Download } from "lucide-react";
import { mediaHref } from "../../../lib/mediaUrl"; // v358
import { formatINROrDash } from "../../../utils/safeFormat"; // v415
import { Presence, PopupBackdrop, PopupPanel } from "../../../components/common/Popup"; // v415
import useScrollLock from "../../../lib/useScrollLock";
import { retentionLine } from "../../../lib/fileRetention"; // v416: one retention wording everywhere

// v415: Escape closes the sheet, and the page behind does not scroll while it is open.
function useSheetBehaviour(open, onClose) {
  useScrollLock(open);
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}


// Session 49 (clean-up): moved out of BrandUGCMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function ApprovedPayoutModal(props) {
  const { amount, deliverableUrl, selectedOrder, setActiveTab, setSelectedOrderId, setShowApprovedModal, setView, showApprovedModal } = props;
  const hasAmount = Number(amount) > 0; // v415: never "₹0 is released"
  const backToOrders = React.useCallback(() => {
    setShowApprovedModal(false);
    setSelectedOrderId(null);
    setView("main");
    setActiveTab("orders");
  }, [setShowApprovedModal, setSelectedOrderId, setView, setActiveTab]);
  useSheetBehaviour(showApprovedModal, backToOrders); // v415: Escape + scroll lock
  return (
    <Presence>
          {showApprovedModal && (
            <div key="approved-payout" className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
              <PopupBackdrop 
                onClick={backToOrders}
                className="fixed inset-0 bg-black/60 backdrop-blur-xs" 
              />
              <PopupPanel kind="modal"
                role="dialog" aria-modal="true" aria-label="Payment released"
                className="relative bg-white w-full max-w-md rounded-[28px] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] z-10 text-center space-y-4 shadow-2xl max-h-[90vh] max-h-[90dvh] overflow-y-auto" /* v330: scrolls on short phones */
              >
                <div className="w-16 h-16 rounded-full bg-[#E9F9EF] text-[#16A34A] flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 size={36} strokeWidth={2.5} />
                </div>
                
                <div>
                  <h3 className="text-xl font-black text-[#0A0A0A]">Payment released</h3>
                  <p className="text-xs text-[#6B7280] mt-1.5 leading-relaxed">
                    {hasAmount ? `${formatINROrDash(amount)} is` : "The payment is"} released to {selectedOrder?.creator_name || "the creator"} — Ybex sends it to their bank next (usually 1–2 working days).{" "}
                    {/* v416 (U8): "download any time" contradicted the 15-day rule */}
                    {retentionLine("brand", selectedOrder?.draft_approved_at || selectedOrder?.approved_at || new Date().toISOString())}
                  </p>
                </div>

                <div className="bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl p-4 text-left space-y-2.5 text-xs">
                  <div className="flex justify-between gap-3">{/* v332: gap so label and value never touch */}
                    <span className="text-[#6B7280]">Deliverable</span>
                    <span className="font-bold text-[#0A0A0A] text-right">{({ collaboration_reel: "Collab reel", ugc_video_edited: "Edited video", ugc_video_raw: "Raw clips" })[selectedOrder?.deliverable_type || selectedOrder?.brief?.deliverable_type] || "UGC video"}{(selectedOrder?.brief?.video_duration || selectedOrder?.video_duration) ? ` · ${selectedOrder?.brief?.video_duration || selectedOrder?.video_duration}` : ""}</span>
                  </div>
                  {hasAmount && (
                  <div className="flex justify-between gap-3">
                    <span className="text-[#6B7280]">Released from Ybex SafePay</span>
                    <span className="font-bold text-[#15803D]">{formatINROrDash(amount)}</span>
                  </div>
                  )}
                  {/* v332: removed a made-up "Usage Rights: Paid Ads & Social · 6 Months" row — no brief stores usage rights */}
                </div>

                <div className="space-y-2.5 pt-2">
                  {deliverableUrl && (
                    <a 
                      href={mediaHref(deliverableUrl) /* v358: uploaded files are private — open through the media link */}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md cursor-pointer"
                    >
                      <Download size={14} /> Download video
                    </a>
                  )}
                  <button 
                    type="button"
                    onClick={backToOrders}
                    className="w-full py-3 bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[#0A0A0A] rounded-xl font-bold text-xs"
                  >
                    Back to orders
                  </button>
                </div>
              </PopupPanel>
            </div>
          )}
        </Presence>
  );
}
