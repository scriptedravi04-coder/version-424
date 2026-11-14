import { HiwSectionHelp } from "../../../components/whatsNew/WhatsNewPopup"; // v437: How it works button / popup / reminder
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Search } from "lucide-react";


// Session 49 (clean-up): moved out of BrandUGCMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function UgcHomeHeader(props) {
  const { activeTab, briefSearch, briefs, fetchData, orderSearch, orders, refreshing, searchOpen, setActiveTab, setBriefSearch, setOrderSearch, setSearchOpen } = props;
  // v416 (U29): no "0" next to a tab whose list failed to load or is still loading
  const showBriefCount = !props.loading && !(props.briefsError && briefs.length === 0);
  const showOrderCount = !props.loading && !(props.ordersError && orders.length === 0);
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E5E5EA] px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-lg font-black text-[#0A0A0A] tracking-tight">Instant UGC</h1>
              <span className="bg-[#F1E8FF] text-[#6D28D9] font-bold text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-[#7C3AED]/20">
                BETA
              </span>
            </div>
            <p className="text-[11px] text-[#6B7280] font-medium mt-0.5">
              Recruit verified creators & track UGC orders (24–72h delivery).
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <HiwSectionHelp section="ugc" role="brand" />
            <button 
              onClick={() => setSearchOpen(!searchOpen)}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                searchOpen ? 'bg-[#7C3AED] text-white' : 'bg-[#F2F2F7] text-[#0A0A0A] active:bg-[#E5E5EA]'
              }`}
              title="Search"
              aria-label="Search" // v330
              aria-expanded={searchOpen}
            >
              <Search size={16} />
            </button>
            <button 
              onClick={() => fetchData(true)}
              disabled={refreshing} // v332: no double refresh while one is running; 40px tap targets
              className="w-10 h-10 disabled:opacity-70 rounded-full bg-[#F2F2F7] active:bg-[#E5E5EA] flex items-center justify-center text-[#0A0A0A] transition-all cursor-pointer"
              title="Refresh"
              aria-label="Refresh" // v330
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin text-[#7C3AED]" : ""} />
            </button>
          </div>
        </div>

        {/* Collapsible Search Input */}
        <AnimatePresence>
          {searchOpen && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }} 
              animate={{ height: "auto", opacity: 1 }} 
              exit={{ height: 0, opacity: 0 }} 
              className="overflow-hidden pt-2"
            >
              <input 
                type="search"
                autoFocus
                aria-label={activeTab === 'briefs' ? "Search briefs" : "Search orders"} // v332: input had no label
                placeholder={activeTab === 'briefs' ? "Search by brief or product title..." : "Search by title or creator..."}
                value={activeTab === 'briefs' ? briefSearch : orderSearch}
                onChange={(e) => activeTab === 'briefs' ? setBriefSearch(e.target.value) : setOrderSearch(e.target.value)}
                className="w-full bg-[#F2F2F7] border border-[#E5E5EA] rounded-xl px-3.5 py-2 text-base text-[#0A0A0A] outline-none focus:border-[#7C3AED]" /* v330: 16px — iPhone zoomed the page on focus at 12px */
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Segmented Tabs: My Briefs vs Orders */}
        <div className="mt-3 bg-[#F4F4F7] p-1 rounded-xl flex items-center">
          <button 
            onClick={() => setActiveTab("briefs")}
            className={`flex-1 py-1.5 min-h-[36px] rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "briefs" 
                ? 'bg-[#7C3AED] text-white shadow-xs' 
                : 'text-[#6B7280] hover:text-[#0A0A0A]'
            }`}
          >
            <span>My Briefs</span>
            {showBriefCount && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              activeTab === "briefs" ? 'bg-white/20 text-white' : 'bg-[#E5E5EA] text-[#6B7280]'
            }`}>
              {briefs.length}
            </span>}
          </button>

          <button 
            onClick={() => setActiveTab("orders")}
            className={`flex-1 py-1.5 min-h-[36px] rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === "orders" 
                ? 'bg-[#7C3AED] text-white shadow-xs' 
                : 'text-[#6B7280] hover:text-[#0A0A0A]'
            }`}
          >
            <span>Orders</span>
            {showOrderCount && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              activeTab === "orders" ? 'bg-white/20 text-white' : 'bg-[#E5E5EA] text-[#6B7280]'
            }`}>
              {orders.length}
            </span>}
          </button>
        </div>
      </header>
  );
}
