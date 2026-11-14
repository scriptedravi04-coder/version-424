import React from "react";
import { formatAmount } from "../../../utils/safeFormat";
import { CheckCircle2 } from "lucide-react";


// Session 49 (clean-up): moved out of ManageUGCOrdersView.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function StageCompleted(props) {
  const { selectedOrder } = props;
  // v332: a missing payout read "₹0 has been transferred" — say "Your payout" instead
  const amt = Number(String(selectedOrder?.payout ?? "").replace(/[^0-9.]/g, "")) > 0 ? `₹${formatAmount(selectedOrder.payout)}` : "Your payout";
  return <>{selectedOrder.stage === "COMPLETED" && (
            <div className={`p-6 rounded-2xl space-y-3 border ${
              selectedOrder.payout_status === 'RELEASED' || selectedOrder.utr_number 
                ? "bg-emerald-50 border-emerald-200" 
                : "bg-amber-50 border-amber-200"
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  selectedOrder.payout_status === 'RELEASED' || selectedOrder.utr_number
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}>
                  <CheckCircle2 size={22} />
                </div>
                <div>
                  <h4 className={`text-sm font-bold ${
                    selectedOrder.payout_status === 'RELEASED' || selectedOrder.utr_number
                      ? "text-emerald-900"
                      : "text-amber-900"
                  }`}>
                    {selectedOrder.payout_status === 'RELEASED' || selectedOrder.utr_number
                      ? "Order Completed & Payment Transferred!"
                      : "Order Completed & Payout Approved!"}
                  </h4>
                  <p className={`text-xs leading-relaxed ${
                    selectedOrder.payout_status === 'RELEASED' || selectedOrder.utr_number
                      ? "text-emerald-800/90"
                      : "text-amber-800/90"
                  }`}>
                    {selectedOrder.payout_status === 'RELEASED' || selectedOrder.utr_number
                      ? `${amt} has been transferred to your bank account. ${selectedOrder.utr_number ? `UTR: ${selectedOrder.utr_number}` : ''}`
                      : `${amt} ${amt === "Your payout" ? "is" : "payout is"} approved! Funds will be credited to your bank account within 1–2 working days.`}
                  </p>
                </div>
              </div>
            </div>
          )}</>;
}
