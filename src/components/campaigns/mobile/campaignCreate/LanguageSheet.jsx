import React from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { INDIAN_LANGUAGES } from "../../../../lib/constants";


// Session 49 (clean-up): moved out of MobileCampaignCreate.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function LanguageSheet(props) {
  const { handleLanguageToggle, selectedLanguages, setShowLanguageSheet } = props;
  return (
    <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="relative w-full max-h-[75dvh] bg-white rounded-t-[26px] p-5 pb-[calc(28px+env(safe-area-inset-bottom))] flex flex-col z-10 shadow-[0_-18px_44px_-24px_rgba(12,12,18,0.4)] text-left"
            >
              {/* v332: Done button cleared the iPhone home bar only by luck — safe-area padding added */}
              <div className="w-[38px] h-[4px] rounded-[2px] bg-[#E0E0E6] mx-auto mb-4" />
              <div className="text-[17px] font-semibold tracking-[-0.3px] text-[#0A0A0A]">Select content languages</div>

              <div className="mt-4 flex-1 overflow-y-auto min-h-0 pr-1 flex flex-col gap-2">
                {INDIAN_LANGUAGES.map((lang) => {
                  const isSelected = selectedLanguages.includes(lang);
                  return (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => handleLanguageToggle(lang)}
                      className={`h-[44px] rounded-[12px] border px-3.5 flex items-center justify-between text-left transition-colors cursor-pointer ${
                        isSelected ? "bg-[#F1E8FF] border-[#DCC9FB]" : "bg-[#F9F9FB] border-[#E5E5EA]"
                      }`}
                    >
                      <span
                        className={`text-[14px] ${isSelected ? "font-semibold text-[#6D28D9]" : "font-medium text-[#0A0A0A]"}`}
                      >
                        {lang}
                      </span>
                      {isSelected && <Check size={14} className="text-[#6D28D9] stroke-[2.5]" />}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLanguageSheet(false)}
                  className="w-full h-[50px] rounded-[14px] bg-[#7C3AED] text-white font-semibold text-[15px] flex items-center justify-center cursor-pointer"
                >
                  Done · {selectedLanguages.length} selected
                </button>
              </div>
            </motion.div>
  );
}
