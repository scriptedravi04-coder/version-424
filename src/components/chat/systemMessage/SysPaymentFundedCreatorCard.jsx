import React from "react";
import { Video } from "lucide-react";


// Session 49 (clean-up): moved out of SystemMessage.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function SysPaymentFundedCreatorCard(props) {
  const { amount, campaignName, onSelectUploadTab, timeText } = props;
  return (
    <div className="w-full max-w-[270px] sm:max-w-[340px] md:max-w-[380px] p-3 md:p-5 shadow-md md:shadow-xl rounded-xl md:rounded-2xl bg-white border border-slate-200/80 text-left relative overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-center mb-2 md:mb-4">
              <span className="text-[11px] md:text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Secure Payment Hold 🔒
              </span>
              <span className="text-[11px] md:text-[10px] text-slate-500 font-medium font-mono">{timeText}</span>
            </div>

            {/* Amount */}
            <div className="text-xl md:text-3xl font-mono font-black tracking-tight mb-2 md:mb-4 flex items-baseline justify-center text-slate-900 w-full">
              {/* v332: no "₹0" when the amount isn't known yet */}
              {Number(amount) > 0 ? (<><span className="text-sm md:text-lg mr-1 text-slate-500 font-bold">₹</span>
              <span>{Number(amount).toLocaleString('en-IN')}</span></>) : <span className="text-base md:text-xl text-slate-500">—</span>}
            </div>

            {/* Breakdown */}
            <div className="space-y-1.5 md:space-y-3 pt-2 md:pt-3 border-t border-slate-100">
              <div className="flex justify-between text-[10px] md:text-xs">
                <span className="text-slate-500">Campaign</span>
                <span className="font-semibold text-slate-800 truncate max-w-[120px] md:max-w-[160px]">{campaignName}</span>
              </div>
              
              <div className="flex justify-between text-[10px] md:text-xs">
                <span className="text-slate-500">Status</span>
                <span className="font-bold text-emerald-600 px-1.5 py-0.2 rounded bg-emerald-50 border border-emerald-100 text-[11px] md:text-[11px]">
                  Payment Received ✓
                </span>
              </div>
            </div>

            <div className="border-t border-slate-100 my-2.5 md:my-4" />

            {/* Action/Explanation area */}
            <div className="text-xs md:text-sm font-extrabold text-emerald-600 mb-0.5">
              Your payment has been safely secured with us.
            </div>
            <div className="text-[10px] md:text-xs font-semibold text-slate-700 leading-snug">
              You can now start creating the content.{/* v332: typo ("start our content") */}
            </div>

            {onSelectUploadTab && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={onSelectUploadTab}
                  className="w-full py-2.5 px-3 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-extrabold text-[10px] md:text-xs rounded-lg md:rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Video size={13} />
                  <span>Upload Deliverable to Brand</span>
                </button>
              </div>
            )}
          </div>
  );
}
