import React from "react";
import { CheckCircle, Loader2, ShieldAlert, BellRing } from "lucide-react";


// Session 49 (clean-up): moved out of SystemMessage.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function SysPayoutSettlementAlert(props) {
  const { alertCount, alertSent, alertingAdmin, handleBrandAlertAdminPayout, isPayoutReleased, isUserBrand } = props;
  return <>{!isPayoutReleased && (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50/60 border border-amber-200/90 rounded-lg md:rounded-xl p-2.5 md:p-3 my-2 md:my-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1 text-[11px] md:text-[10.5px] font-black uppercase text-amber-900 tracking-wider">
                    <ShieldAlert size={12} className="text-amber-600 shrink-0" />
                    <span>Creator Payout Settlement</span>
                  </div>
                  {alertCount > 0 && (
                    <span className="text-[7.5px] md:text-[11px] font-mono font-bold bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded">
                      {alertCount} Alert{alertCount > 1 ? 's' : ''} Sent
                    </span>
                  )}
                </div>
                <p className="text-[11px] md:text-[11px] text-amber-900/80 font-medium leading-tight mb-2">
                  {isUserBrand 
                    ? "Funds are fully cleared from your side. If creator hasn't received payment in 1–2 days, you can alert the Ybex support desk:"
                    : "Payment has been approved by the brand and is held safely by Ybex. If it isn't credited within 1–2 working days, you can ask Ybex support to speed it up:" /* v415 */}
                </p>
                <button
                  type="button"
                  onClick={handleBrandAlertAdminPayout}
                  disabled={alertingAdmin || alertSent}
                  className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-extrabold text-[11px] md:text-xs rounded-md md:rounded-lg transition-all shadow-xs cursor-pointer active:scale-98 disabled:opacity-80 disabled:cursor-not-allowed"
                >
                  {alertingAdmin ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      <span>Sending Priority Alert...</span>
                    </>
                  ) : alertSent ? (
                    <>
                      <CheckCircle size={12} className="text-white" />
                      <span>Priority Alert Sent to Admin Desk ✓</span>
                    </>
                  ) : (
                    <>
                      <BellRing size={12} />
                      <span>{isUserBrand ? "Alert Admin to Release Creator Funds" : "Alert Admin for Priority Payout Disbursal"}</span>
                    </>
                  )}
                </button>
              </div>
            )}</>;
}
