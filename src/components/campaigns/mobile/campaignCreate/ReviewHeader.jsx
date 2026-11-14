import React from "react";
import { ChevronLeft } from "lucide-react";


// Session 49 (clean-up): moved out of MobileCampaignCreate.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function ReviewHeader(props) {
  const { reviewTab, setCurrentView, setReviewTab } = props;
  return (
    <div className="bg-white shrink-0 border-b border-[#E5E5EA] pb-3.5 sticky top-0 z-20">
          <div className="h-[52px] px-5 flex items-center justify-between">
            <button
              onClick={() => setCurrentView("step2")}
              aria-label="Back" /* v332: icon-only button, 40px tap target */
              className="w-10 h-10 rounded-[11px] bg-white border border-[#E5E5EA] flex items-center justify-center cursor-pointer transition-colors"
            >
              <ChevronLeft size={17} className="text-[#0A0A0A] stroke-[2.2]" />
            </button>
            <div className="text-[10.5px] font-semibold tracking-[0.9px] uppercase text-[#6B7280]">Review & launch</div>
            <button
              onClick={() => setCurrentView("step1")}
              className="min-h-[40px] px-1 text-[12.5px] font-medium text-[#7C3AED] hover:text-[#6D28D9] cursor-pointer"
            >
              Edit
            </button>
          </div>

          {/* Segmented Switch: Feed card vs Full brief */}
          <div className="mx-5 h-[38px] rounded-[11px] bg-[#E9E9EF] p-[3px] flex gap-1">
            <button
              type="button"
              onClick={() => setReviewTab("card")}
              className={`flex-1 rounded-[8px] text-[12.5px] flex items-center justify-center transition-all cursor-pointer ${
                reviewTab === "card"
                  ? "bg-white font-semibold text-[#0A0A0A] shadow-[0_1px_3px_rgba(12,12,18,0.08)]"
                  : "font-medium text-[#6B7280]"
              }`}
            >
              Feed card
            </button>
            <button
              type="button"
              onClick={() => setReviewTab("full")}
              className={`flex-1 rounded-[8px] text-[12.5px] flex items-center justify-center transition-all cursor-pointer ${
                reviewTab === "full"
                  ? "bg-white font-semibold text-[#0A0A0A] shadow-[0_1px_3px_rgba(12,12,18,0.08)]"
                  : "font-medium text-[#6B7280]"
              }`}
            >
              Full brief
            </button>
          </div>
        </div>
  );
}
