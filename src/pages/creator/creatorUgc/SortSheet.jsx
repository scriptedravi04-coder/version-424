import React from "react";
import { Check } from "lucide-react";
import { Presence, PopupBackdrop, PopupPanel } from "../../../components/common/Popup";


// Session 49 (clean-up): moved out of CreatorUGCMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function SortSheet(props) {
  const { setShowSortSheet, setSortOption, showSortSheet, sortOption } = props;
  return (
    <Presence>{showSortSheet && (
        // v330: z-50 tied with the bottom nav, which covered the lower option — z-60 like MobileSheet
        <PopupBackdrop className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-xs">
          <PopupPanel kind="sheet" onClose={() => setShowSortSheet(false)} className="w-full max-w-md bg-white rounded-t-[24px] p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#F1F1F5]">
              <span className="font-bold text-[15px] text-[#0A0A0A]">Sort UGC Briefs</span>
              <button
                onClick={() => setShowSortSheet(false)}
                className="text-xs font-bold text-[#6B7280] min-h-9 px-2 cursor-pointer" /* v330: 36px tap target */
              >
                Close
              </button>
            </div>

            {[
              { id: "payout", label: "Highest payout" },
              { id: "newest", label: "Newest briefs" }
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSortOption(s.id);
                  setShowSortSheet(false);
                }}
                className={`w-full h-11 px-4 rounded-[12px] flex items-center justify-between text-[13.5px] font-semibold transition-colors cursor-pointer ${
                  sortOption === s.id
                    ? "bg-[#F5F0FF] text-[#7C3AED]"
                    : "bg-[#FBFBFD] text-[#374151] hover:bg-[#F2F2F7]"
                }`}
              >
                <span>{s.label}</span>
                {sortOption === s.id && <Check size={16} strokeWidth={2.5} />}
              </button>
            ))}
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>
  );
}
