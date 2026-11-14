import React from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X, Calendar } from "lucide-react";


// Session 49 (clean-up): moved out of MobileCampaignCreate.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function DatePickerSheet(props) {
  const { currentMonthLabel, deadlineDaysLeft, firstDayIndex, formattedDeadlineDate, handleNextMonth, handlePreset, handlePrevMonth, handleSelectDay, isPrevDisabled, month, selectedDay, selectedMonth, selectedYear, setShowDatePickerSheet, today, totalDays, year } = props;
  return (
    <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="relative w-full max-h-[90dvh] overflow-y-auto bg-white rounded-t-[26px] p-5 pb-[calc(32px+env(safe-area-inset-bottom))] flex flex-col z-10 shadow-[0_-18px_44px_-24px_rgba(12,12,18,0.4)] text-left"
            >
              {/* v332: sheet scrolls on short phones and clears the iPhone home bar; icon buttons labelled */}
              {/* Drag Handle */}
              <div className="w-[38px] h-[4px] rounded-[2px] bg-[#E0E0E6] mx-auto mb-3.5" />

              <div className="flex items-center justify-between pb-3 border-b border-[#E5E5EA]">
                <div>
                  <div className="text-[17px] font-semibold tracking-[-0.3px] text-[#0A0A0A]">
                    Applications close date
                  </div>
                  <div className="text-[12px] font-medium text-[#6B7280]">
                    Select the deadline for creators to apply
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDatePickerSheet(false)}
                  aria-label="Close"
                  className="w-10 h-10 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[#6B7280] hover:text-[#0A0A0A] cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div className="mt-3.5 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {[
                  { label: "1 Week", days: 7 },
                  { label: "2 Weeks", days: 14 },
                  { label: "3 Weeks", days: 21 },
                  { label: "1 Month", days: 30 },
                  { label: "45 Days", days: 45 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handlePreset(preset.days)}
                    className="px-3 py-1.5 rounded-[10px] bg-[#F2F2F7] hover:bg-[#E9E9EF] text-[12px] font-semibold text-[#3F3F46] shrink-0 cursor-pointer active:scale-95 transition-all"
                  >
                    +{preset.label}
                  </button>
                ))}
              </div>

              {/* Month Navigation */}
              <div className="mt-3.5 flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  disabled={isPrevDisabled}
                  aria-label="Previous month"
                  className="w-10 h-10 rounded-[11px] bg-[#F9F9FB] border border-[#E5E5EA] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  <ChevronLeft size={18} className="text-[#0A0A0A]" />
                </button>
                <div className="text-[15px] font-bold text-[#0A0A0A]">{currentMonthLabel}</div>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  aria-label="Next month"
                  className="w-10 h-10 rounded-[11px] bg-[#F9F9FB] border border-[#E5E5EA] flex items-center justify-center cursor-pointer transition-colors"
                >
                  <ChevronRight size={18} className="text-[#0A0A0A]" />
                </button>
              </div>

              {/* Weekdays Header */}
              <div className="mt-3 grid grid-cols-7 gap-1 text-center">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((dayName) => (
                  <div key={dayName} className="text-[11px] font-bold text-[#6B7280] uppercase py-1">
                    {dayName}
                  </div>
                ))}
              </div>

              {/* Day Grid */}
              <div className="mt-1 grid grid-cols-7 gap-1 text-center">
                {Array.from({ length: firstDayIndex }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-[40px]" />
                ))}

                {Array.from({ length: totalDays }).map((_, i) => {
                  const day = i + 1;
                  const dateObj = new Date(year, month, day);
                  const isPast = dateObj < today;
                  const isToday =
                    dateObj.getFullYear() === today.getFullYear() &&
                    dateObj.getMonth() === today.getMonth() &&
                    dateObj.getDate() === today.getDate();
                  const isSelected =
                    selectedYear === year && selectedMonth === month && selectedDay === day;

                  return (
                    <button
                      key={`day-${day}`}
                      type="button"
                      disabled={isPast}
                      onClick={() => handleSelectDay(day)}
                      className={`h-[40px] rounded-[12px] text-[13.5px] flex items-center justify-center transition-all cursor-pointer ${
                        isSelected
                          ? "bg-[#7C3AED] text-white font-bold shadow-md shadow-[#7C3AED]/30 scale-105"
                          : isToday
                          ? "border border-[#7C3AED] text-[#7C3AED] font-bold bg-[#F5F0FF]"
                          : isPast
                          ? "text-[#D1D5DB] cursor-not-allowed"
                          : "text-[#0A0A0A] font-medium hover:bg-[#F2F2F7] active:scale-95"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>

              {/* Selected date preview */}
              <div className="mt-4 p-3 rounded-[13px] bg-[#F9F9FB] border border-[#E5E5EA] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-[#7C3AED]" />
                  <span className="text-[13px] font-semibold text-[#0A0A0A]">
                    {formattedDeadlineDate}
                  </span>
                </div>
                <span className="text-[11.5px] font-semibold text-[#7C3AED] bg-[#F1E8FF] px-2.5 py-1 rounded-[7px]">
                  {deadlineDaysLeft}
                </span>
              </div>

              {/* Confirm Button */}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowDatePickerSheet(false)}
                  className="w-full h-[50px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold text-[15px] flex items-center justify-center transition-colors cursor-pointer shadow-md shadow-[#7C3AED]/20"
                >
                  Set close date
                </button>
              </div>
            </motion.div>
  );
}
