import React from "react";
import { Clock, ArrowRight } from "lucide-react";


// Session 49 (clean-up): moved out of CreatorUGCMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function BriefStickyBar(props) {
  const { briefHours, budget, formatCurrency, kycStatus, navigate, setActiveView, setSelectedBrief } = props;
  return (
    // v332: bottom padding includes the iPhone home-bar area so the buttons aren't under it
    <div className="fixed left-0 right-0 bottom-0 bg-white/95 backdrop-blur-md border-t border-[#E5E5EA] px-4 pt-[10px] pb-[calc(20px+env(safe-area-inset-bottom))] z-40 flex flex-col gap-2">
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#78350F]">
            <Clock size={12} className="text-amber-600 shrink-0" />
            <span>{briefHours}h timer starts when you sign in Step 2. Missing it cancels the order.</span>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Secondary button on Left per AGENTS_md */}
            <button
              onClick={() => {
                setActiveView("main");
                setSelectedBrief(null);
              }}
              className="h-[48px] px-4 rounded-[14px] bg-[#F2F2F7] text-[#4B5563] font-bold text-[13.5px] cursor-pointer hover:bg-[#E5E5EA] transition-colors"
            >
              Cancel
            </button>

            {/* Primary button on Right per AGENTS_md: Advances to Step 2 (NO order created yet!)
                Session 24: only KYC-approved creators can claim — others can read the brief. */}
            {kycStatus === "APPROVED" || kycStatus === null ? (
              <button
                onClick={() => setActiveView("agreement")}
                disabled={kycStatus === null}
                className="flex-1 h-[48px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-[14px] flex items-center justify-center gap-2 shadow-[0_10px_20px_-10px_rgba(124,58,237,0.9)] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
              >
                {/* v344: null = KYC not known yet (still loading or the check failed) — say so instead of a dead button */}
                <span>{kycStatus === null ? "Checking your KYC…" : <>I commit · claim for {formatCurrency(budget)}</>}</span>
                <ArrowRight size={15} strokeWidth={2.4} />
              </button>
            ) : kycStatus === "PENDING" ? (
              <button
                disabled
                className="flex-1 h-[48px] rounded-[14px] bg-[#FEF3C7] text-[#92400E] font-bold text-[12.5px] px-3 cursor-not-allowed"
              >
                KYC under review · you can claim once approved
              </button>
            ) : (
              <button
                onClick={() => navigate("/creator/kyc")}
                className="flex-1 h-[48px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-[13.5px] flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{kycStatus === "REJECTED" ? "Update KYC to claim" : "Complete KYC to claim"}</span>
                <ArrowRight size={15} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>
  );
}
