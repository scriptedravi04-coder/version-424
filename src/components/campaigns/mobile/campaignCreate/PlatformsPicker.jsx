import React from "react";
import { Check } from "lucide-react";


// Session 49 (clean-up): moved out of MobileCampaignCreate.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function PlatformsPicker(props) {
  const { handlePlatformToggle, selectedPlatforms } = props;
  return (
    <div>
            <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">Platforms</div>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              {/* Instagram card */}
              <button
                type="button"
                onClick={() => handlePlatformToggle("Instagram")}
                className={`p-3 rounded-[14px] bg-white text-left transition-all cursor-pointer ${
                  selectedPlatforms.includes("Instagram")
                    ? "border-[1.5px] border-[#7C3AED]"
                    : "border border-[#E5E5EA]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-[24px] h-[20px] flex items-center justify-start shrink-0">
                    <img
                      src="/assets/instagram.svg"
                      alt="Instagram"
                      className="w-[20px] h-[20px] object-contain block shrink-0"
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                  </div>
                  <div
                    className={`w-[17px] h-[17px] rounded-full flex items-center justify-center ${
                      selectedPlatforms.includes("Instagram")
                        ? "bg-[#7C3AED] text-white"
                        : "border-[1.5px] border-[#D6D6DC]"
                    }`}
                  >
                    {selectedPlatforms.includes("Instagram") && <Check size={10} className="stroke-[3.4]" />}
                  </div>
                </div>
                <div className="mt-2.5 text-[13.5px] font-semibold text-[#0A0A0A]">Instagram</div>
                <div className="mt-0.5 text-[11px] text-[#6B7280]">Reels, posts, stories</div>
              </button>

              {/* YouTube card */}
              <button
                type="button"
                onClick={() => handlePlatformToggle("YouTube")}
                className={`p-3 rounded-[14px] bg-white text-left transition-all cursor-pointer ${
                  selectedPlatforms.includes("YouTube")
                    ? "border-[1.5px] border-[#7C3AED]"
                    : "border border-[#E5E5EA]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-[24px] h-[20px] flex items-center justify-start shrink-0">
                    <img
                      src="/assets/youtube.svg"
                      alt="YouTube"
                      className={`w-[24px] h-[17px] object-contain block shrink-0 ${
                        !selectedPlatforms.includes("YouTube") ? "grayscale opacity-60" : ""
                      }`}
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                  </div>
                  <div
                    className={`w-[17px] h-[17px] rounded-full flex items-center justify-center ${
                      selectedPlatforms.includes("YouTube")
                        ? "bg-[#7C3AED] text-white"
                        : "border-[1.5px] border-[#D6D6DC]"
                    }`}
                  >
                    {selectedPlatforms.includes("YouTube") && <Check size={10} className="stroke-[3.4]" />}
                  </div>
                </div>
                <div className="mt-2.5 text-[13.5px] font-semibold text-[#0A0A0A]">YouTube</div>
                <div className="mt-0.5 text-[11px] text-[#6B7280]">Shorts, long reviews</div>
              </button>
            </div>
          </div>
  );
}
