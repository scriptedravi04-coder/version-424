import React from "react";
import { retentionLine } from "../../../lib/fileRetention";
import { formatINROrDash } from "../../../utils/safeFormat";
import { Video, CheckCircle2 } from "lucide-react";
import { mediaHref } from "../../../lib/mediaUrl"; // v358


// Session 49 (clean-up): moved out of BrandUGCOrders.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function ApprovedCompletedPanel(props) {
  const { selectedOrder } = props;
  // v358: "transferred" only once Ybex has a bank reference (UTR). COMPLETED happens right at approval, while the
  // bank transfer follows in 1–2 working days — the panel used to say "Payment Transferred!" straight away.
  const paid = Boolean(selectedOrder.utrNumber);
  return <>{(selectedOrder.stage === "COMPLETED" || selectedOrder.stage === "APPROVED") && (
            <div className={`p-6 rounded-2xl space-y-4 border ${
              paid
                ? "bg-emerald-50 border-emerald-200"
                : "bg-amber-50 border-amber-200"
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  paid
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}>
                  <CheckCircle2 size={22} />
                </div>
                <div className="min-w-0">{/* v332: no "to undefined" when the creator name is missing; long names wrap */}
                  <h4 className={`text-sm font-bold ${
                    paid
                      ? "text-emerald-900"
                      : "text-amber-900"
                  }`}>
                    {paid
                      ? "Order Completed & Paid"
                      : "Approved — payout in 1–2 working days"}
                  </h4>
                  <p className={`text-xs leading-relaxed ${
                    paid
                      ? "text-emerald-800/90"
                      : "text-amber-800/90"
                  }`}>
                    {paid
                      ? `${selectedOrder.amount > 0 ? formatINROrDash(selectedOrder.amount) : "The payment"} was paid to ${selectedOrder.creatorName || "the creator"}'s bank.${selectedOrder.utrNumber ? ` (UTR: ${selectedOrder.utrNumber})` : ''}`
                      : `You approved the video. Ybex is sending the payment${selectedOrder.amount > 0 ? ` of ${formatINROrDash(selectedOrder.amount)}` : ""} to ${selectedOrder.creatorName || "the creator"}'s bank.`}{/* v415: no ₹0, plainer words */}
                  </p>
                  <p className="text-[11px] mt-1.5 text-[var(--text-secondary)]" data-testid="retention-note">
                    {retentionLine("brand", selectedOrder.draft_approved_at || selectedOrder.raw?.draft_approved_at || selectedOrder.delivered_at || null)}
                  </p>
                </div>
              </div>

              {selectedOrder.deliverableUrl && (
                <div className="pt-2">
                  <a
                    href={mediaHref(selectedOrder.deliverableUrl) /* v358: private upload — open through the media link */}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-all shadow-sm"
                  >
                    <Video size={14} />
                    <span>View Approved Video Asset</span>
                  </a>
                </div>
              )}
            </div>
          )}</>;
}
