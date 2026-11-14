import React from "react";
import { X, Plus, Calendar } from "lucide-react";
import { INDIAN_LANGUAGES } from "../../../../lib/constants";


// Session 49 (clean-up): moved out of MobileCampaignCreate.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function AdvancedTargetingForm(props) {
  const { creatorsNeeded, customCreatorsNeeded, deadline, deadlineDaysLeft, formattedDeadlineDate, gender, handleCityToggle, handleLanguageToggle, selectedLanguages, selectedLocations, setCalendarViewMonth, setCreatorsNeeded, setCustomCreatorsNeeded, setGender, setShowCitySheet, setShowDatePickerSheet, setShowLanguageSheet } = props;
  return (
    <div className="flex-1 px-5 pt-4.5 pb-[calc(112px+env(safe-area-inset-bottom))] flex flex-col gap-4.5">{/* v330: content clears the pinned button + iPhone home bar */}
          {/* Creator Gender */}
          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">Creator gender</div>
            <div className="mt-2.5 h-[42px] rounded-[12px] bg-[#E9E9EF] p-[3px] flex gap-1">
              {["Any", "Female", "Male"].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setGender(opt)}
                  className={`flex-1 rounded-[9px] text-[13px] flex items-center justify-center transition-all cursor-pointer ${
                    gender === opt
                      ? "bg-white font-semibold text-[#0A0A0A] shadow-[0_1px_3px_rgba(12,12,18,0.08)]"
                      : "font-medium text-[#6B7280]"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Content Languages */}
          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
              Content languages
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {INDIAN_LANGUAGES.slice(0, 6).map((lang) => {
                const isSelected = selectedLanguages.includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => handleLanguageToggle(lang)}
                    className={`px-3 py-2 rounded-[10px] text-[12px] transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#F1E8FF] border border-[#DCC9FB] font-semibold text-[#6D28D9]"
                        : "bg-white border border-[#E5E5EA] font-medium text-[#3F3F46]"
                    }`}
                  >
                    {lang}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setShowLanguageSheet(true)}
                className="px-3 py-2 rounded-[10px] bg-white border border-[#E5E5EA] font-medium text-[12px] text-[#6B7280] cursor-pointer"
              >
                +{INDIAN_LANGUAGES.length - 6} more
              </button>
            </div>
          </div>

          {/* Cities */}
          <div>
            <div className="flex items-baseline justify-between">
              <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">Cities</div>
              <div className="text-[10.5px] font-medium text-[#6B7280]">Empty = Pan India</div>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {selectedLocations.map((city) => (
                <div
                  key={city}
                  className="px-3 py-2 rounded-[11px] bg-[#F1E8FF] border border-[#DCC9FB] flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6D28D9]"
                >
                  {city}
                  <button
                    type="button"
                    onClick={() => handleCityToggle(city)}
                    aria-label={`Remove ${city}`} /* v332: icon-only button, bigger tap area */
                    className="w-8 h-8 -my-1.5 -mr-2 flex items-center justify-center shrink-0 hover:opacity-75 cursor-pointer" /* v358: 32px tap target (was ~23px) */
                  >
                    <X size={11} className="stroke-[2.6]" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setShowCitySheet(true)}
                className="px-3 py-2 rounded-[11px] bg-white border border-dashed border-[#D6D6DC] flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6B7280] cursor-pointer"
              >
                <Plus size={12} className="stroke-[2.2]" /> Add city
              </button>
            </div>
          </div>

          {/* Creators Needed */}
          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
              Creators needed
            </div>
            <div className="mt-2.5 grid grid-cols-4 gap-2">
              {["<5", "5–15", "15–25", "Custom"].map((tier) => {
                const isSelected = creatorsNeeded === tier;
                return (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setCreatorsNeeded(tier)}
                    className={`h-[42px] rounded-[12px] flex items-center justify-center text-[12.5px] transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#F1E8FF] border-[1.5px] border-[#7C3AED] font-semibold text-[#6D28D9]"
                        : "bg-white border border-[#E5E5EA] font-medium text-[#3F3F46]"
                    }`}
                  >
                    {tier}
                  </button>
                );
              })}
            </div>
            {creatorsNeeded === "Custom" && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={customCreatorsNeeded}
                  onChange={(e) => {
                    // v344: digits only (empty allowed while typing; Continue checks 1–500)
                    // v416 (C21): no silent 600 → 500 — the number stays as typed and the message below says the limit
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setCustomCreatorsNeeded(digits);
                  }}
                  placeholder="Number of creators (e.g. 20)"
                  inputMode="numeric" /* v332: number pad + 16px (no iOS zoom) */
                  className="h-[44px] flex-1 rounded-[12px] bg-white border border-[#E5E5EA] px-3 text-[16px] text-[#0A0A0A] outline-none focus:border-[#7C3AED]"
                />
                <span className="text-[12px] text-[#6B7280]">creators</span>
              </div>
            )}
            {creatorsNeeded === "Custom" && !(Number(customCreatorsNeeded) >= 1 && Number(customCreatorsNeeded) <= 500) && ( /* v344 · v416: over 500 too */
              <div className="mt-1.5 text-[11.5px] font-medium text-[#B91C1C]">Enter between 1 and 500 creators.</div>
            )}
          </div>

          {/* Applications Close Date */}
          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
              Applications close
            </div>
            <button
              type="button"
              onClick={() => {
                if (deadline) {
                  const parts = deadline.split("-");
                  if (parts.length === 3) {
                    setCalendarViewMonth(new Date(Number(parts[0]), Number(parts[1]) - 1, 1));
                  }
                }
                setShowDatePickerSheet(true);
              }}
              className="mt-2.5 w-full h-[52px] rounded-[14px] bg-white border border-[#E5E5EA] flex items-center gap-2.5 px-4 text-left cursor-pointer hover:border-[#7C3AED]/40 transition-colors"
            >
              <Calendar size={18} className="text-[#7C3AED] stroke-[1.9] shrink-0" />
              <div className="flex-1 text-[14px] font-semibold text-[#0A0A0A]">{formattedDeadlineDate}</div>
              <div className="text-[11.5px] font-semibold text-[#7C3AED] bg-[#F1E8FF] px-2.5 py-1 rounded-[8px]">
                {deadlineDaysLeft}
              </div>
            </button>
          </div>
        </div>
  );
}
