import React from "react";
import { ChevronRight, Calendar, Video, Trash2 } from "lucide-react"; // v417: + Trash2
import AgencyBadge from "@/components/common/AgencyBadge";
import { campaignBudgetText, campaignDaysLeft } from "./mobile/HomeCampaignCard"; // v415: shared budget + days rules

export default function CampaignCard({ campaign, onManage, onEdit, onSubmit, launching = false, onDelete, deleting = false }) { // v358: + launching · v417: + onDelete/deleting (drafts)
  const c = campaign;
  const statusStr = (c.status || "").toLowerCase().trim();
  const isUnderReview = statusStr === "under_review" || statusStr === "under review" || statusStr === "pending_review" || statusStr === "in_review" || statusStr === "review";
  const isLive = statusStr === "live" || statusStr === "approved";
  const isDraft = statusStr === "draft" || !c.status;
  const isAgency = Boolean(c.is_agency || c.brand_is_agency || c.raw?.is_agency || c.raw?.brand_profiles?.is_agency);
  
  // Format platforms beautifully
  const platformsList = c.platforms || [];
  const platformsStr = platformsList.length > 0 ? platformsList.join(", ") : ""; // v332: no made-up "Instagram" when the brand picked none

  // v415: same IST calendar-day count as the phone list and the campaign page (desktop said "15d", phone "16 days")
  const daysLeft = campaignDaysLeft(c.deadline);
  const expiryDays = daysLeft != null && daysLeft > 0 ? daysLeft : 0;
  const endsToday = daysLeft === 0; // v332: a deadline later today showed "Ended <today>"
  const statusLower = String(c.status || "").toLowerCase();
  const isClosed = statusLower === "completed" || statusLower === "closed" || Boolean(c.closed_at);
  // v415: ONE status pill per card (it showed "DRAFT" + "Draft", "LIVE" + "Running"); unknown codes read as words.
  const statusLabel = isUnderReview ? "Under review" : isDraft ? "Draft" : isClosed ? "Completed" : statusLower === "rejected" ? "Not approved" : statusLower === "cancelled" ? "Cancelled" : isLive ? (c.applications_paused ? "Paused" : "Live") : String(c.status).replace(/_/g, " ");
  const budgetText = campaignBudgetText(c, "–"); // v415: "Up to ₹5,000" when min is 0 (was "Barter" / "₹0 – ₹5,000")

  return (
    <div 
      className="group relative bg-white border border-[#E5E5EA] rounded-2xl p-3.5 sm:p-5 shadow-xs hover:shadow-md hover:border-[#DDD6FE] transition-all cursor-pointer flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 sm:gap-4 lg:gap-6" 
      onClick={() => (isDraft ? onEdit && onEdit(c) : onManage && onManage(c))} /* v415: a draft card looked clickable but did nothing */
    >
       {/* Left: Icon, Title, Tags - Fixed width on lg+ so middle stats line up perfectly */}
       <div className="flex gap-3 sm:gap-4 items-center w-full lg:w-[280px] xl:w-[340px] 2xl:w-[400px] shrink-0 min-w-0 pr-2">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-[#F5F0FF] border border-[#DDD6FE] flex items-center justify-center shrink-0">
             <Video size={18} className="text-[var(--violet)] sm:w-[20px] sm:h-[20px]" />
          </div>
          <div className="flex flex-col gap-0.5 sm:gap-1 min-w-0 flex-1">
             <div className="flex items-center gap-1.5 flex-wrap">
               <h4 className="font-extrabold sm:font-black text-gray-900 text-sm sm:text-base group-hover:text-[var(--violet)] transition-colors line-clamp-2 leading-tight [overflow-wrap:anywhere]" title={c.title || "Untitled campaign"}>
                  {c.title || "Untitled campaign" /* v415 */}
               </h4>
               {isAgency && <AgencyBadge size="xs" className="shrink-0" />}
             </div>
             <p className="text-xs text-gray-500 font-semibold truncate">{c.isUgc ? "UGC Content Campaign" : "Influencer Campaign"}</p>
             <div className="flex flex-wrap gap-1.5 mt-1">
                {/* v415: the status chip lived here AND on the right — now only the right one */}
                {platformsStr && <span className="text-[11px] font-black uppercase tracking-widest text-gray-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-200 truncate max-w-[150px]">
                   {platformsStr}
                </span>}
             </div>
          </div>
       </div>

       {/* Middle: Stats - Fixed width sub-columns for vertical alignment across cards */}
       <div className="flex items-center justify-between lg:justify-start gap-4 sm:gap-6 lg:gap-8 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0 hide-scrollbar flex-1">
          {/* Est. Budget */}
          <div className="flex flex-col items-start w-[130px] sm:w-[160px] shrink-0">{/* v415: room for "₹5,000–₹25,000" */}
             <span className="text-base sm:text-lg font-black text-gray-900 leading-none mb-1 truncate w-full">
                {budgetText || "—" /* Session 58: no made-up ₹10,000 · v415: shared rule */}
             </span>
             <span className="text-[11px] text-gray-500 uppercase font-black tracking-widest truncate">{budgetText === "Barter" ? "Collab type" : "Per creator" /* v415 */}</span>
          </div>

          {/* Applicants */}
          <div className="flex flex-col items-start w-[70px] sm:w-[85px] shrink-0">
             <span className="text-base sm:text-lg font-black text-gray-900 leading-none mb-1">
                {c.applicants?.length || 0}
             </span>
             <span className="text-[11px] text-gray-500 uppercase font-black tracking-widest">Applicants</span>
          </div>

          {/* Session 58 (bug hunt): "Deals" was always 0 — the list never sends deals. Removed. */}

          {/* Timeline & Status */}
          <div className="flex flex-col items-start w-[120px] sm:w-[140px] shrink-0 border-l border-gray-100 pl-4 sm:pl-6">
             <div className="flex items-center gap-1.5 text-xs text-gray-500 font-semibold mb-1 truncate w-full">
                <Calendar size={12} className="text-gray-500 shrink-0" />
                <span className="truncate">{expiryDays > 0 ? `Ends in ${expiryDays} day${expiryDays === 1 ? "" : "s"}` : endsToday ? "Ends today" : c.deadline ? (Number.isNaN(new Date(c.deadline).getTime()) ? String(c.deadline) : `Ended ${new Date(c.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" /* v330: IST */ })}`) : "No end date" /* Session 58: no made-up date */}</span>
             </div>
             {/* v415: one pill, no endless pulse (it isn't "live") */}
             <div className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-widest border flex items-center gap-1.5 shrink-0 ${isUnderReview || isDraft ? "border-amber-200 bg-amber-50 text-amber-800" : isLive && !isClosed && !c.applications_paused ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-600"}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${isUnderReview || isDraft ? "bg-amber-500" : isLive && !isClosed && !c.applications_paused ? "bg-emerald-500" : "bg-gray-400"}`}></div>
                <span>{statusLabel}</span>
             </div>
          </div>
       </div>

       {/* Right: Actions */}
       <div className="flex items-center gap-2 shrink-0 ml-auto lg:ml-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-gray-100 w-full lg:w-auto justify-end">
          {/* v417: delete a draft (styled confirm in BrandCampaigns.jsx) */}
          {isDraft && onDelete && <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(c); }}
            disabled={deleting}
            aria-label="Delete draft"
            title="Delete draft"
            data-testid="campaign-delete-draft"
            className="w-10 h-10 flex items-center justify-center bg-white hover:bg-rose-50 border border-gray-200 hover:border-rose-200 text-gray-600 hover:text-rose-600 rounded-xl transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            <Trash2 size={15} />
          </button>}
          {/* Session 58: a closed campaign can't be edited (the server refuses it) */}
          {!isClosed && <button 
            onClick={(e) => { e.stopPropagation(); onEdit && onEdit(c); }} 
            className="px-4 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-800 font-extrabold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Edit
          </button>}
          {isDraft ? (
            <button 
              onClick={(e) => { e.stopPropagation(); onSubmit && onSubmit(c); }} 
              disabled={launching} /* v358: looked dead for seconds after a tap */
              className="px-4 py-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-extrabold text-xs rounded-xl transition-colors shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-wait"
            >
              {launching ? "Launching…" : "Launch"}
            </button>
          ) : (
            <button 
              onClick={(e) => { e.stopPropagation(); onManage && onManage(c); }} 
              className="px-4 py-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-extrabold text-xs rounded-xl transition-colors shadow-sm flex items-center gap-1 cursor-pointer"
            >
              Manage <ChevronRight size={14}/>
            </button>
          )}
       </div>
    </div>
  );
}
