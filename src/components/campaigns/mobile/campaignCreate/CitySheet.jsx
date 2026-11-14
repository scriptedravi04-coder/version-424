import React from "react";
import { motion } from "framer-motion";
import { Lightbulb, X, Search, Loader2, Check, MapPin } from "lucide-react";


// Session 49 (clean-up): moved out of MobileCampaignCreate.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function CitySheet(props) {
  const { citySearch, citySuggestions, handleCityToggle, isCitySearching, selectedLocations, setCitySearch, setSelectedLocations, setShowCitySheet } = props;
  return (
    <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="relative w-full max-h-[85dvh] bg-white rounded-t-[26px] p-5 pb-[calc(28px+env(safe-area-inset-bottom))] flex flex-col z-10 shadow-[0_-18px_44px_-24px_rgba(12,12,18,0.4)] text-left"
            >
              {/* v332: sheet clears the iPhone home bar (safe-area) and uses dvh so it fits with the keyboard */}
              {/* Drag Handle */}
              <div className="w-[38px] h-[4px] rounded-[2px] bg-[#E0E0E6] mx-auto mb-4" />

              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-[17px] font-semibold tracking-[-0.3px] text-[#0A0A0A]">Target locations</div>
                  <div className="text-[11.5px] font-medium text-[#6B7280]">
                    Select specific cities or keep empty for Pan India
                  </div>
                </div>
                <div className="text-[12px] font-semibold text-[#7C3AED] bg-[#F1E8FF] px-2.5 py-1 rounded-[8px]">
                  {selectedLocations.length > 0 ? `${selectedLocations.length}/5` : "Pan India"}
                </div>
              </div>

              {/* Search Bar */}
              <div className="mt-3.5 h-[52px] min-h-[52px] rounded-[16px] bg-[#F8FAFC] border border-[#E2E8F0] flex items-center gap-3 px-4 focus-within:border-[#7C3AED] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#7C3AED]/10 transition-all shadow-xs">
                <Search size={18} className="text-[#7C3AED] stroke-[2.2] shrink-0" />
                <input
                  type="text"
                  value={citySearch}
                  onChange={(e) => setCitySearch(e.target.value)}
                  placeholder="Search city or state (e.g. Mumbai, Bangalore, Delhi)..."
                  className="w-full bg-transparent text-[16px] font-medium text-[#0F172A] outline-none placeholder:text-[#94A3B8]" /* v332: 16px stops iOS zoom */
                />
                {isCitySearching && <Loader2 size={16} className="animate-spin text-[#7C3AED] shrink-0" />}
                {citySearch && !isCitySearching && (
                  <button
                    type="button"
                    onClick={() => setCitySearch("")}
                    aria-label="Clear search" /* v332: icon-only button */
                    className="w-[28px] h-[28px] rounded-full bg-[#E2E8F0] flex items-center justify-center text-[#64748B] hover:text-[#0F172A] shrink-0 cursor-pointer transition-colors"
                  >
                    <X size={13} className="stroke-[2.5]" />
                  </button>
                )}
              </div>

              {/* Selected Cities */}
              {selectedLocations.length > 0 && (
                <div className="mt-3.5">
                  <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
                    Selected cities ({selectedLocations.length}/5)
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedLocations.map((loc) => (
                      <div
                        key={loc}
                        className="px-3 py-1.5 rounded-[10px] bg-[#F1E8FF] border border-[#DCC9FB] flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6D28D9] shadow-xs"
                      >
                        <MapPin size={11} className="stroke-[2.4]" />
                        <span>{loc}</span>
                        <button
                          type="button"
                          onClick={() => handleCityToggle(loc)}
                          aria-label={`Remove ${loc}`} /* v332: icon-only button */
                          className="w-8 h-8 -my-1.5 -mr-2 flex items-center justify-center shrink-0 hover:opacity-75 cursor-pointer ml-0.5" /* v358: 32px tap target (was ~23px) */
                        >
                          <X size={11} className="stroke-[2.6]" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* City List (Spacious / Open layout) */}
              <div className="mt-3.5 flex-1 overflow-y-auto min-h-0 pr-1">
                {/* Pan India Fast Option */}
                {!citySearch.trim() && (
                  <button
                    type="button"
                    onClick={() => setSelectedLocations([])}
                    className={`w-full min-h-[58px] rounded-[16px] p-3.5 mb-2.5 flex items-center justify-between text-left transition-all cursor-pointer ${
                      selectedLocations.length === 0
                        ? "bg-[#F5F0FF] border-[1.5px] border-[#7C3AED] shadow-xs"
                        : "bg-[#F9F9FB] border border-[#E5E5EA] hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-[38px] h-[38px] rounded-[12px] flex items-center justify-center shrink-0 ${
                          selectedLocations.length === 0
                            ? "bg-[#7C3AED] text-white"
                            : "bg-white text-[#7C3AED] border border-[#E5E5EA]"
                        }`}
                      >
                        <Lightbulb size={17} strokeWidth={2.2} />
                      </div>
                      <div>
                        <div
                          className={`text-[14.5px] ${
                            selectedLocations.length === 0
                              ? "font-bold text-[#6D28D9]"
                              : "font-semibold text-[#0A0A0A]"
                          }`}
                        >
                          Pan India (All Cities)
                        </div>
                        <div className="text-[11.5px] text-[#6B7280]">
                          Creators from all across India can apply
                        </div>
                      </div>
                    </div>
                    <div
                      className={`w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 ml-2 ${
                        selectedLocations.length === 0
                          ? "bg-[#7C3AED] text-white"
                          : "border-[1.5px] border-[#D6D6DC]"
                      }`}
                    >
                      {selectedLocations.length === 0 && <Check size={13} className="stroke-[3]" />}
                    </div>
                  </button>
                )}

                <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280] mb-2">
                  {citySearch.trim() ? "Matching locations" : "Popular Indian cities"}
                </div>

                <div className="flex flex-col gap-2.5">
                  {citySuggestions.map((item, idx) => {
                    const isSelected = selectedLocations.includes(item.name);
                    return (
                      <button
                        key={`${item.name}-${idx}`}
                        type="button"
                        onClick={() => handleCityToggle(item.name)}
                        className={`w-full min-h-[58px] rounded-[16px] p-3.5 flex items-center justify-between text-left transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[#F5F0FF] border-[1.5px] border-[#7C3AED] shadow-xs"
                            : "bg-[#F9F9FB] border border-[#E5E5EA] hover:bg-slate-100 hover:border-[#D6D6DC]"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-[38px] h-[38px] rounded-[12px] flex items-center justify-center shrink-0 ${
                              isSelected
                                ? "bg-[#7C3AED] text-white"
                                : "bg-white text-[#7C3AED] border border-[#E5E5EA]"
                            }`}
                          >
                            <MapPin size={17} strokeWidth={2.2} />
                          </div>
                          <div className="min-w-0">
                            <div
                              className={`text-[14.5px] ${
                                isSelected ? "font-bold text-[#6D28D9]" : "font-semibold text-[#0A0A0A]"
                              } truncate`}
                            >
                              {item.name}
                            </div>
                            <div className="text-[11.5px] text-[#6B7280] truncate mt-0.5">
                              {item.state ? `${item.state}, India` : item.country || "India"}
                            </div>
                          </div>
                        </div>
                        <div
                          className={`w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 ml-2 ${
                            isSelected ? "bg-[#7C3AED] text-white" : "border-[1.5px] border-[#D6D6DC]"
                          }`}
                        >
                          {isSelected && <Check size={13} className="stroke-[3]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Done Button */}
              <div className="mt-4 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCitySheet(false)}
                  className="w-full h-[52px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold text-[15px] flex items-center justify-center transition-colors cursor-pointer shadow-md shadow-[#7C3AED]/20"
                >
                  {selectedLocations.length > 0
                    ? `Done · ${selectedLocations.length} selected`
                    : "Done · Pan India selected"}
                </button>
              </div>
            </motion.div>
  );
}
