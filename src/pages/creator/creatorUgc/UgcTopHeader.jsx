import { HiwSectionHelp } from "../../../components/whatsNew/WhatsNewPopup"; // v437: How it works button / popup / reminder
import React from "react";
import OfferStrip from "../../../components/referral/OfferStrip";
import { motion } from "framer-motion";
import { Search, Check } from "lucide-react";


// Session 49 (clean-up): moved out of CreatorUGCMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function UgcTopHeader(props) {
  const { activeTab, formatFilter, manageFilter, mappedOrders, orderCounts, searchQuery, setActiveTab, setFormatFilter, setManageFilter, setSearchParams, setSearchQuery, setShowSortSheet } = props;
  return (
    <div className="bg-white flex-shrink-0 border-b border-[#E5E5EA]">
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center justify-between gap-2"><div className="font-semibold text-[22px] leading-[1.1] tracking-[-0.7px] text-[#0A0A0A]">
            {activeTab === "explore" ? "Explore UGC" : "Manage UGC orders"}
          </div><HiwSectionHelp section="ugc" role="creator" /></div>
          {activeTab === "explore" && <OfferStrip className="mt-1.5" />}
          <div className="mt-1.5 flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded-full bg-[#059669] flex items-center justify-center text-white shrink-0">
              <Check size={8} strokeWidth={3} />
            </div>
            <div className="font-normal text-[11.5px] text-[#6B7280]">
              {activeTab === "explore"
                ? "Instant UGC marketplace · payment protected" /* v418 */
                : "Upload deliverables, track review, get paid"}
            </div>
          </div>
        </div>

        {/* Segmented Control Pill Toggle (Explore vs Manage Orders) */}
        <div className="px-4 pt-3 pb-1">
          <div className="h-[40px] rounded-[13px] bg-[#F2F2F7] p-[3px] flex gap-[3px] relative">
            <button
              onClick={() => {
                setActiveTab("explore");
                setSearchParams({ tab: "explore" });
              }}
              className={`flex-1 rounded-[11px] font-semibold text-[13px] flex items-center justify-center transition-colors cursor-pointer relative z-10 ${
                activeTab === "explore"
                  ? "text-white"
                  : "text-[#6B7280] hover:text-[#0A0A0A]"
              }`}
            >
              {activeTab === "explore" && (
                <motion.div
                  layoutId="creatorMobileUgcPill"
                  className="absolute inset-0 bg-[#7C3AED] rounded-[11px] shadow-[0_6px_14px_-8px_rgba(124,58,237,0.9)] z-0"
                  transition={{ type: "spring", stiffness: 450, damping: 32 }}
                />
              )}
              <span className="relative z-10">Explore</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("manage");
                setSearchParams({ tab: "manage" });
              }}
              className={`flex-1 rounded-[11px] font-semibold text-[13px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer relative z-10 ${
                activeTab === "manage"
                  ? "text-white"
                  : "text-[#6B7280] hover:text-[#0A0A0A]"
              }`}
            >
              {activeTab === "manage" && (
                <motion.div
                  layoutId="creatorMobileUgcPill"
                  className="absolute inset-0 bg-[#7C3AED] rounded-[11px] shadow-[0_6px_14px_-8px_rgba(124,58,237,0.9)] z-0"
                  transition={{ type: "spring", stiffness: 450, damping: 32 }}
                />
              )}
              <span className="relative z-10">Manage orders</span>
              <div
                className={`relative z-10 min-w-[18px] h-[18px] px-1.5 rounded-[9px] box-border flex items-center justify-center font-bold text-[10px] ${
                  activeTab === "manage"
                    ? "bg-white/30 text-white"
                    : "bg-[#EDE4FF] text-[#7C3AED]"
                }`}
              >
                {mappedOrders.length}
              </div>
            </button>
          </div>
        </div>

        {/* Filters specific to tab */}
        {activeTab === "explore" ? (
          <>
            {/* Search Bar & Sort Button */}
            <div className="px-4 pt-3 flex gap-[9px]">
              <div className="flex-1 h-[42px] rounded-[13px] bg-[#F2F2F7] flex items-center gap-2.5 px-3 focus-within:ring-1 focus-within:ring-[#7C3AED]">
                <Search size={15} className="text-[#ABABAB] shrink-0" />
                <input
                  type="text"
                  placeholder="Title, product or brand"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search UGC briefs"
                  className="w-full bg-transparent border-none outline-none font-normal text-[16px] text-[#0A0A0A] placeholder-[#ABABAB]" /* v332: 16px so iPhone doesn't zoom in */
                />
              </div>

              <button
                onClick={() => setShowSortSheet(true)}
                className="h-[42px] px-3 rounded-[13px] bg-[#F2F2F7] flex items-center gap-1.5 shrink-0 font-semibold text-[12px] text-[#374151] cursor-pointer hover:bg-[#E5E5EA]"
              >
                <span>Sort</span>
              </button>
            </div>

            {/* Format Filter Pills (Spec 01) */}
            <div className="px-4 py-3 flex gap-[7px] overflow-x-auto hide-scrollbar">
              {[
                { id: "all", label: "All formats" },
                { id: "collab", label: "Collaboration" },
                { id: "edited", label: "UGC edited" },
                { id: "raw", label: "Draft / raw" }
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFormatFilter(f.id)}
                  className={`h-[32px] px-3 rounded-[10px] flex items-center font-semibold text-[12px] shrink-0 whitespace-nowrap transition-colors cursor-pointer ${
                    formatFilter === f.id
                      ? "bg-[#7C3AED] text-white shadow-xs"
                      : "bg-[#F2F2F7] text-[#4B5563] hover:bg-[#E5E5EA]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          /* Manage Orders Filter Pills (Spec 02: All · 3, In production · 1, In review · 1, Completed · 1) */
          <div className="px-4 py-3 flex gap-[7px] overflow-x-auto hide-scrollbar">
            {[
              { id: "all", label: `All · ${orderCounts.all}` },
              { id: "production", label: `In production · ${orderCounts.production}` },
              { id: "review", label: `In review · ${orderCounts.review}` },
              { id: "completed", label: `Completed · ${orderCounts.completed}` }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setManageFilter(f.id)}
                className={`h-[32px] px-3 rounded-[10px] flex items-center font-semibold text-[12px] shrink-0 whitespace-nowrap transition-colors cursor-pointer ${
                  manageFilter === f.id
                    ? "bg-[#7C3AED] text-white shadow-xs"
                    : "bg-[#F2F2F7] text-[#4B5563] hover:bg-[#E5E5EA]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>
  );
}
