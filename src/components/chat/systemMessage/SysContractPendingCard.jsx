import React from "react";
import { CheckCircle } from "lucide-react";


// Session 49 (clean-up): moved out of SystemMessage.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function SysContractPendingCard(props) {
  const { amIWaiting, amount, brandSigned, campaignName, creatorSigned, isUserBrand, onViewContract, thread, threadId, timeText, waitingFor } = props;
  return (
    <div className="w-full max-w-[270px] sm:max-w-[340px] md:max-w-[380px] p-3 md:p-5 shadow-md md:shadow-xl rounded-xl md:rounded-2xl bg-white border border-amber-200 text-left relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-500 to-amber-600 rounded-l-xl md:rounded-l-2xl" />
            
            {/* Header */}
            <div className="flex justify-between items-center mb-2 md:mb-4">
              <span className="text-[11px] md:text-[10px] font-bold uppercase tracking-wider text-amber-700 font-mono bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-md">
                Signature Pending ⏳
              </span>
              <span className="text-[11px] md:text-[10px] text-slate-500 font-medium font-mono">{timeText}</span>
            </div>

            {/* Amount */}
            <div className="text-xl md:text-3xl font-mono font-black tracking-tight mb-2 md:mb-4 flex items-baseline text-slate-900">
              {/* v332: no "₹0" when the amount isn't known yet */}
              {Number(amount) > 0 ? (<><span className="text-sm md:text-lg mr-1 text-slate-500 font-bold">₹</span>
              <span>{Number(amount).toLocaleString('en-IN')}</span></>) : <span className="text-base md:text-xl text-slate-500">—</span>}
            </div>

            {/* Details */}
            <div className="space-y-1.5 md:space-y-3 pt-2 md:pt-3 border-t border-slate-100">
              <div className="flex justify-between text-[10px] md:text-xs">
                <span className="text-slate-500">Campaign</span>
                <span className="font-semibold text-slate-800 truncate max-w-[120px] md:max-w-[160px]">{campaignName}</span>
              </div>
              
              <div className="flex justify-between text-[10px] md:text-xs">
                <span className="text-slate-500">Creator Signature</span>
                {creatorSigned ? (
                  <span className="font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.2 rounded text-[11px] md:text-[10px]">
                    Signed ✓
                  </span>
                ) : (
                  <span className="font-bold text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.2 rounded text-[11px] md:text-[10px]">
                    Pending ⏳
                  </span>
                )}
              </div>

              <div className="flex justify-between text-[10px] md:text-xs">
                <span className="text-slate-500">Brand Signature</span>
                {brandSigned ? (
                  <span className="font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.2 rounded text-[11px] md:text-[10px]">
                    Signed ✓
                  </span>
                ) : (
                  <span className="font-bold text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.2 rounded text-[11px] md:text-[10px]">
                    Pending ⏳
                  </span>
                )}
              </div>
            </div>

            <div className="border-t border-slate-100 my-2.5 md:my-4" />

            <div className="text-xs md:text-sm font-extrabold text-amber-600 mb-0.5">
              {amIWaiting 
                ? "You signed the contract ✓" 
                : isUserBrand 
                  ? "Creator signed agreement ✓" 
                  : "Brand signed agreement ✓"
              }
            </div>
            <div className="text-[10px] md:text-xs font-semibold text-slate-700 leading-snug">
              {amIWaiting 
                ? `Signed! Waiting for ${waitingFor}.` 
                : "Contract signed! Please review and sign below to execute."
              }
            </div>

            {!amIWaiting && (
              <div className="mt-2.5 md:mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (onViewContract) {
                      onViewContract({
                        id: threadId,
                        amount: amount,
                        revision_count: thread?.revision_count || 1,
                        deadline: thread?.deadline,
                      });
                    }
                  }}
                  className="w-full py-2 md:py-3 px-3 md:px-4 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-extrabold text-[10px] md:text-xs rounded-lg md:rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle size={13} />
                  <span>Sign Partnership Contract</span>
                </button>
              </div>
            )}
          </div>
  );
}
