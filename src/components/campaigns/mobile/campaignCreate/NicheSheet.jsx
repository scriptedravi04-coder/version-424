import React from "react";
import { motion } from "framer-motion";
import { X, Plus, Search, Loader2, Check } from "lucide-react";


// Session 49 (clean-up): moved out of MobileCampaignCreate.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function NicheSheet(props) {
  const { filteredNiches, handleCreateCustomNiche, handleNicheToggle, isCategorySearching, nicheSearch, selectedCategories, setNicheSearch, setShowNicheSheet } = props;
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
                  <div className="text-[17px] font-semibold tracking-[-0.3px] text-[#0A0A0A]">Pick your niche</div>
                  <div className="text-[11.5px] font-medium text-[#6B7280]">Select up to 3 core categories</div>
                </div>
                <div className="text-[12px] font-semibold text-[#7C3AED] bg-[#F1E8FF] px-2.5 py-1 rounded-[8px]">
                  {selectedCategories.length} / 3
                </div>
              </div>

              {/* Search Bar */}
              <div className="mt-3.5 h-[52px] min-h-[52px] rounded-[16px] bg-[#F8FAFC] border border-[#E2E8F0] flex items-center gap-3 px-4 focus-within:border-[#7C3AED] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#7C3AED]/10 transition-all shadow-xs">
                <Search size={18} className="text-[#7C3AED] stroke-[2.2] shrink-0" />
                <input
                  type="text"
                  value={nicheSearch}
                  onChange={(e) => setNicheSearch(e.target.value)}
                  placeholder="Search category (e.g. Fashion, Self-care, Tech)..."
                  className="w-full bg-transparent text-[16px] font-medium text-[#0F172A] outline-none placeholder:text-[#94A3B8]" /* v332: 16px stops iOS zoom */
                />
                {isCategorySearching && <Loader2 size={16} className="animate-spin text-[#7C3AED] shrink-0" />}
                {nicheSearch && !isCategorySearching && (
                  <button
                    type="button"
                    onClick={() => setNicheSearch("")}
                    aria-label="Clear search" /* v332: icon-only button */
                    className="w-[28px] h-[28px] rounded-full bg-[#E2E8F0] flex items-center justify-center text-[#64748B] hover:text-[#0F172A] shrink-0 cursor-pointer transition-colors"
                  >
                    <X size={13} className="stroke-[2.5]" />
                  </button>
                )}
              </div>

              {/* Selected Niches */}
              {selectedCategories.length > 0 && (
                <div className="mt-3.5">
                  <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
                    Selected ({selectedCategories.length}/3)
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedCategories.map((cat) => (
                      <div
                        key={cat}
                        className="px-3 py-1.5 rounded-[10px] bg-[#F1E8FF] border border-[#DCC9FB] flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6D28D9] shadow-xs"
                      >
                        <span>{cat}</span>
                        <button
                          type="button"
                          onClick={() => handleNicheToggle(cat)}
                          aria-label={`Remove ${cat}`} /* v332: icon-only button */
                          className="w-8 h-8 -my-1.5 -mr-2 flex items-center justify-center shrink-0 hover:opacity-75 cursor-pointer" /* v358: 32px tap target (was ~23px) */
                        >
                          <X size={11} className="stroke-[2.6]" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Matching Niches */}
              <div className="mt-3.5 flex-1 overflow-y-auto min-h-0 pr-1">
                <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280] mb-2">
                  {nicheSearch.trim() ? "Search results" : "Popular categories"}
                </div>
                <div className="flex flex-col gap-2">
                  {filteredNiches.map((item) => {
                    const isSelected = selectedCategories.includes(item.name);
                    return (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => handleNicheToggle(item.name)}
                        className={`h-[48px] rounded-[13px] border px-3.5 flex items-center justify-between text-left transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[#F1E8FF] border-[#7C3AED] shadow-xs"
                            : "bg-[#F9F9FB] border-[#E5E5EA] hover:bg-slate-100"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`text-[14px] ${
                              isSelected ? "font-bold text-[#6D28D9]" : "font-medium text-[#0A0A0A]"
                            }`}
                          >
                            {item.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* v332: preset counts were made up (and count could be missing → crash); only real counts show */}
                          {!item.preset && Number(item.count) > 0 && <span className="text-[11.5px] font-medium text-[#6B7280]">
                            {Number(item.count).toLocaleString("en-IN")} {Number(item.count) === 1 ? "creator" : "creators"}
                          </span>}
                          <div
                            className={`w-[18px] h-[18px] rounded-full flex items-center justify-center ${
                              isSelected ? "bg-[#7C3AED] text-white" : "border border-[#D1D5DB]"
                            }`}
                          >
                            {isSelected && <Check size={11} className="stroke-[3]" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {/* Create custom niche option if search typed */}
                  {nicheSearch.trim() &&
                    !selectedCategories.map((c) => c.toLowerCase()).includes(nicheSearch.trim().toLowerCase()) && (
                      <button
                        type="button"
                        onClick={() => handleCreateCustomNiche(nicheSearch)}
                        className="h-[48px] rounded-[13px] bg-[#F9F9FB] border border-dashed border-[#7C3AED]/50 flex items-center gap-2 px-3.5 cursor-pointer hover:bg-[#F1E8FF]/40 transition-colors"
                      >
                        <Plus size={14} className="text-[#7C3AED] stroke-[2.2]" />
                        <span className="text-[13.5px] font-semibold text-[#7C3AED]">
                          Add "{nicheSearch.trim().split(/[\s\-_]+/)[0]}" as category
                        </span>
                      </button>
                    )}
                </div>
              </div>

              {/* Done Button */}
              <div className="mt-4 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNicheSheet(false)}
                  className="w-full h-[52px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold text-[15px] flex items-center justify-center transition-colors cursor-pointer shadow-md shadow-[#7C3AED]/20"
                >
                  Done · {selectedCategories.length} selected
                </button>
              </div>
            </motion.div>
  );
}
