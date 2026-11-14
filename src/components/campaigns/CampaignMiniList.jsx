import { deliverableItemLabel } from "../../utils/safeFormat"; // v415
import React, { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, ArrowRight, Eye, ChevronLeft, ChevronRight, Video, Target, Users } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import { realViewCount } from "../../utils/campaignStatsForViewer";
import { campaignBudgetText } from "./mobile/HomeCampaignCard"; // v415: shared budget rule

// Helper to format raw dates / ISO strings beautifully
const formatCampaignDate = (dateStr) => {
  if (!dateStr) return "No deadline"; // Session 58: no invented date
  if (dateStr.includes("T")) {
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); // v330: Indian format, IST
      }
    } catch (e) {
      // fallback
    }
  }
  return dateStr;
};

export default function CampaignMiniList({ campaigns = [] }) {
  const navigate = useNavigate();
  const sliderRef = useRef(null);

  // Session 58: the unused sample campaigns (made-up budgets / dates) are removed.

  // Map real database briefs
  const realCampaigns = campaigns.map((c, i) => {
    const isTech = (c.category || "").toLowerCase().includes("tech") || (c.category || "").toLowerCase().includes("gaming");
    const isFood = (c.category || "").toLowerCase().includes("food") || (c.category || "").toLowerCase().includes("travel");
    
    // Session 58 (brands see only real numbers): no ₹15K–25K / made-up deadline / guessed platform or deliverable,
    // and the real view count (not the creator-side display number).
    const plat = Array.isArray(c.platforms) ? c.platforms.filter(Boolean).join(", ") : (c.platforms || "");
    const deliv = deliverableItemLabel(Array.isArray(c.deliverables) ? c.deliverables.filter(Boolean)[0] : c.deliverables); // v415: an object here crashed the whole desktop dashboard
    const rv = realViewCount(c);
    return {
      campaign_id: c.campaign_id || c.id,
      title: c.title,
      category: c.category || (Array.isArray(c.categories) ? c.categories[0] : "") || "Campaign",
      status: c.status || "LIVE",
      budget_min: Number(c.budget_min) || 0,
      budget_max: Number(c.budget_max || c.budget) || 0,
      applicantsLength: c.applicants?.length || 0,
      dealsLength: c.deals?.length || 0,
      deadline: c.deadline || "",
      platform: plat,
      deliverable: deliv,
      views: rv,
      description: c.description || "",
    };
  });

  const items = realCampaigns;

  const getStatusBadgeStyle = (status) => {
    const s = (status || "").toUpperCase();
    switch (s) {
      case "LIVE":
      case "APPROVED":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "IN REVIEW":
      case "PENDING":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "DRAFT":
        return "bg-zinc-100 text-zinc-600 border-zinc-200";
      default:
        return "bg-[#F5F0FF] text-[#6D28D9] border-[#DDD6FE]";
    }
  };

  const scrollLeft = () => {
    if (sliderRef.current) {
      sliderRef.current.scrollBy({ left: -360, behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    if (sliderRef.current) {
      sliderRef.current.scrollBy({ left: 360, behavior: "smooth" });
    }
  };

  return (
    <div className="w-full mt-6" data-testid="campaign-mini-list">
      {/* CSS style block to hide scrollbars elegantly across devices */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {/* List Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-zinc-100 pb-4">
        <div className="flex items-center gap-2">
          
          <h3 className="text-sm font-black text-zinc-800 uppercase tracking-wider">
            Your Active Briefs
          </h3>
          <span className="text-xs text-zinc-400 font-medium hidden md:inline">• Swipe to manage live campaigns</span>
        </div>
        
        {/* Actions & Navigation Controls */}
        <div className="flex items-center justify-between sm:justify-end gap-3 self-stretch sm:self-auto">
          {/* Slider Left/Right Arrows */}
          <div className="flex items-center gap-1 bg-zinc-100/80 p-1 rounded-xl border border-zinc-200/50">
            <button 
              onClick={scrollLeft}
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-white border border-zinc-200/60 text-zinc-600 hover:text-[var(--violet)] hover:border-[var(--violet)]/30 active:scale-95 transition-all cursor-pointer shadow-sm"
              title="Previous Brief"
              aria-label="Previous brief" /* v332: icon-only button */
            >
              <ChevronLeft size={14} strokeWidth={2.5} />
            </button>
            <button 
              onClick={scrollRight}
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-white border border-zinc-200/60 text-zinc-600 hover:text-[var(--violet)] hover:border-[var(--violet)]/30 active:scale-95 transition-all cursor-pointer shadow-sm"
              title="Next Brief"
              aria-label="Next brief"
            >
              <ChevronRight size={14} strokeWidth={2.5} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => navigate("/brand/campaigns/create")}
              className="p-2 px-3.5 rounded-xl bg-[var(--violet)] hover:bg-[#6b4aff] text-white hover:scale-[1.02] text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Plus size={13} strokeWidth={3} /> Post Brief
            </button>
            <Link 
              to="/brand/campaigns" 
              className="text-xs font-extrabold text-[var(--violet)] hover:text-[#6b4aff] transition-all flex items-center gap-1 hover:underline ml-1"
            >
              View All <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      </div>

      {/* HORIZONTAL SCROLLABLE SLIDER CONTAINER */}
      {items.length === 0 ? (
        <div className="w-full bg-white border border-dashed border-zinc-200 rounded-[24px] p-8 text-center flex flex-col items-center justify-center my-2">
          <div className="w-12 h-12 rounded-2xl bg-[#F5F0FF] border border-[#DDD6FE] flex items-center justify-center text-[var(--violet)] mb-3">
            <Target size={22} />
          </div>
          <h4 className="text-base font-bold text-zinc-800">No Active Briefs Yet</h4>
          <p className="text-xs text-zinc-500 max-w-md mt-1 mb-4">
            Post your first campaign brief to start receiving high-converting pitches and UGC video proposals from verified creators.
          </p>
          <button
            onClick={() => navigate("/brand/campaigns/create")}
            className="px-5 py-2.5 rounded-xl bg-[var(--violet)] hover:bg-[#6b4aff] text-white text-xs font-bold flex items-center gap-2 shadow-md transition-all cursor-pointer"
          >
            <Plus size={15} strokeWidth={2.5} /> Post your first brief {/* v332: was "Briefing" */}
          </button>
        </div>
      ) : (
        <div 
          ref={sliderRef}
          className="no-scrollbar flex gap-5 overflow-x-auto pb-4 scroll-smooth snap-x snap-mandatory w-full"
        >
          {items.map((camp, idx) => {
          const isLive = ["LIVE", "APPROVED"].includes((camp.status || "").toUpperCase());
          return (
            <div 
              key={camp.campaign_id || idx} 
              onClick={() => navigate(`/brand/campaigns`)}
              className="group relative flex flex-col justify-between bg-white border border-zinc-150 hover:border-[var(--violet)]/30 rounded-[24px] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.01)] transition-all duration-300 hover:shadow-[0_12px_28px_rgba(124,92,255,0.04)] cursor-pointer overflow-hidden w-[290px] sm:w-[325px] shrink-0 snap-start min-h-[290px] hover:bg-[var(--violet)]/[0.005]"
            >
              {/* Dynamic Status Tag absolute top right corner */}
              <div className="absolute top-3 right-3">
                <Badge variant={camp.status || "LIVE"}>{String(camp.status || "LIVE").replace(/_/g, " ") /* v332: no raw under_review */}</Badge>
              </div>

              {/* Main Card Body */}
              <div>
                {/* Header Profile Info Row */}
                <div className="flex items-start gap-3.5">
                  {/* Category Rounded Avatar Placeholder */}
                  <div className="w-10 h-10 rounded-xl bg-[#F5F0FF] border border-[#DDD6FE] flex items-center justify-center shrink-0 shadow-sm text-[var(--violet)]">
                    <Target size={18} strokeWidth={2.2} />
                  </div>
                  
                  {/* Title & Category Info */}
                  <div className="flex-1 pr-14 text-left min-w-0">
                    <h4 className="text-[14px] font-black text-zinc-800 tracking-tight leading-snug group-hover:text-[var(--violet)] transition-colors line-clamp-2">
                      {camp.title}
                    </h4>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className="text-[11px] font-extrabold text-zinc-400 bg-zinc-50 border border-zinc-100 px-1.5 py-0.5 rounded-md truncate max-w-[110px]">
                        {camp.category}
                      </span>
                      {camp.platform && <span className="text-[11px] font-bold text-zinc-500">
                        • {camp.platform}
                      </span>}
                    </div>
                  </div>
                </div>

                {/* Looking For / Deliverable Description Section */}
                <div className="mt-4 text-left">
                  <span className="block text-[11px] font-black tracking-wider text-zinc-400 uppercase">
                    Briefing Objective
                  </span>
                  <p className="text-xs text-zinc-500 font-medium leading-relaxed mt-1 line-clamp-2 min-h-[36px]">
                    {camp.description}
                  </p>
                </div>

                {/* Highlights Container Grid - Premium 100% Brand-Focused Design */}
                <div className="grid grid-cols-2 gap-3 mt-4">
                  {/* Highlight Box 1: Budget Range */}
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-[#FAFAFA] rounded-xl border border-zinc-100 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-white border border-zinc-150 flex items-center justify-center shadow-[0_1px_4px_rgba(0,0,0,0.02)] text-zinc-700 font-black text-[12px] shrink-0">
                      ₹
                    </div>
                    <div className="text-left min-w-0">
                      <span className="block text-[7px] font-black tracking-widest text-zinc-400 uppercase leading-none">
                        Budget{/* v415: was "Budget Block" */}
                      </span>
                      <span className="block text-[10px] font-black text-zinc-800 mt-1 truncate">
                        {campaignBudgetText(camp) || "Barter" /* v415: "Up to ₹5,000" when min is 0 (was "₹0 – ₹5,000") */}
                      </span>
                    </div>
                  </div>

                  {/* Highlight Box 2: Deliverable Required */}
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-[#FAFAFA] rounded-xl border border-zinc-100 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-white border border-zinc-150 flex items-center justify-center shadow-[0_1px_4px_rgba(0,0,0,0.02)] text-[var(--violet)] shrink-0">
                      <Video size={12} strokeWidth={2.5} />
                    </div>
                    <div className="text-left min-w-0">
                      <span className="block text-[7px] font-black tracking-widest text-zinc-400 uppercase leading-none">
                        Deliverable
                      </span>
                      <span className="block text-[10px] font-black text-zinc-800 mt-1 truncate">
                        {camp.deliverable || "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Footer Divider & Info */}
              <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between">
                {/* Views and info */}
                <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-400">
                  <Eye size={11} strokeWidth={2.2} />
                  {camp.views != null && <><span>{Number(camp.views).toLocaleString("en-IN") /* v332: Indian format */} views</span><span>•</span></>}
                  <span className="truncate">🗓️ {formatCampaignDate(camp.deadline)}</span>
                </div>

                {/* Applied Applicants Avatar / Status Badge */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Applied pill */}
                  <span className="bg-[#F5F0FF] text-[var(--violet)] text-[11px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Users size={9} />
                    <span>{camp.applicantsLength} {camp.applicantsLength === 1 ? 'pitch' : 'pitches'}</span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
