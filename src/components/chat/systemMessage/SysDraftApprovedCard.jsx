import React from "react";
import { ExternalLink, CheckCircle } from "lucide-react";
import { toast } from "sonner";


// Session 49 (clean-up): moved out of SystemMessage.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function SysDraftApprovedCard(props) {
  const { cleanText, isUgcDeal, isUserBrand, message, onSelectUploadTab, thread } = props;
  return (
    <div className="w-full max-w-[270px] sm:max-w-[340px] md:max-w-[480px] rounded-xl md:rounded-[24px] bg-white border border-emerald-200 shadow-md md:shadow-2xl shadow-emerald-100/30 text-left relative overflow-hidden transition-all duration-300">
          {/* Top Festive Gradient Bar */}
          <div className="h-1.5 md:h-2.5 bg-gradient-to-r from-emerald-400 via-teal-400 to-[#7C3AED] w-full" />
          
          <div className="p-3 md:p-6">
            {/* Top Badge/Header */}
            <div className="flex justify-between items-center mb-2 md:mb-4">
              <span className="text-[11px] md:text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 md:px-3 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
                <span>🎉</span>
                <span>{isUgcDeal ? "UGC Deliverable Approved" : "Draft Approved"}</span>
              </span>
              <span className="text-[11px] md:text-[10px] text-slate-500 font-bold font-mono">
                {message.created_at && !Number.isNaN(new Date(message.created_at).getTime()) /* v332: no "Invalid Date" */ ? new Date(message.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" /* v330: IST */ }).replace(/\b(am|pm)\b/g, (s) => s.toUpperCase()) : ""}
              </span>
            </div>

            {/* Celebratory Icon & Heading */}
            <div className="flex items-center gap-2.5 md:gap-4 mb-2 md:mb-4">
              <div className="w-10 h-10 md:w-14 md:h-14 bg-emerald-50 rounded-xl md:rounded-2xl border border-emerald-100 flex items-center justify-center text-xl md:text-3xl shadow-xs shrink-0">
                🎬
              </div>
              <div>
                <h3 className="text-xs md:text-lg font-black text-slate-900 tracking-tight leading-snug">
                  {isUgcDeal ? "UGC Draft Video Approved! 🎬" : "Woohoo! Draft Approved! 🥳"}
                </h3>
                <p className="text-[10px] md:text-xs text-slate-500 font-medium">
                  {isUgcDeal ? "The brand approved your video draft. Please publish and submit your live link." : "Your content draft was approved by the brand"}
                </p>
              </div>
            </div>

            {/* Message Body */}
            <div className="p-2.5 md:p-4 bg-emerald-50/40 border border-emerald-100/50 rounded-xl md:rounded-2xl mb-3 md:mb-5">
              <p className="text-[11px] md:text-[13px] font-semibold text-slate-700 leading-snug">
                {cleanText}
              </p>
            </div>

            {/* Operational Action Button */}
            {!isUserBrand ? (
              (Boolean(thread?.live_links_submitted) || Boolean(thread?.live_link) || Boolean(thread?.ugc_order?.live_links_submitted) || ['LINKS_UNDER_REVIEW', 'LIVE_LINKS_SUBMITTED', 'PROOF_SUBMITTED', 'COMPLETED', 'PAID', 'RELEASED'].includes(String(thread?.status || '').toUpperCase()) || ['LINKS_UNDER_REVIEW', 'LIVE_LINKS_SUBMITTED', 'PROOF_SUBMITTED', 'COMPLETED', 'PAID', 'RELEASED'].includes(String(thread?.flow_state || '').toUpperCase())) ? (
                <div className="w-full py-2.5 md:py-3.5 bg-emerald-500/15 border border-emerald-500/30 rounded-lg md:rounded-xl flex items-center justify-center gap-2 text-emerald-700 font-bold text-[10px] md:text-xs">
                  <CheckCircle size={14} className="stroke-[2.5]" />
                  <span>{['COMPLETED', 'PAID', 'RELEASED'].includes(String(thread?.status || '').toUpperCase()) || ['COMPLETED', 'PAID', 'RELEASED'].includes(String(thread?.flow_state || '').toUpperCase()) ? "Deal Completed & Verified ✓" : "Live Link Submitted — Under Brand Review ⏳"}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (onSelectUploadTab) {
                      onSelectUploadTab();
                    }
                    toast.success("Ready to submit live link! 🚀");
                  }}
                  className="w-full py-2.5 md:py-3.5 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.99] transition-all text-slate-950 font-black text-[10px] md:text-xs rounded-lg md:rounded-xl shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink size={13} className="stroke-[3]" />
                  <span>SUBMIT LIVE LINK NOW 🚀</span>
                </button>
              )
            ) : (
              <div className="p-2 md:p-3 bg-slate-50 border border-slate-200/60 rounded-lg md:rounded-xl text-center">
                <span className="text-[10px] md:text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                  {(Boolean(thread?.live_links_submitted) || Boolean(thread?.live_link) || Boolean(thread?.ugc_order?.live_links_submitted) || ['LINKS_UNDER_REVIEW', 'LIVE_LINKS_SUBMITTED', 'PROOF_SUBMITTED', 'COMPLETED', 'PAID', 'RELEASED'].includes(String(thread?.status || '').toUpperCase()) || ['LINKS_UNDER_REVIEW', 'LIVE_LINKS_SUBMITTED', 'PROOF_SUBMITTED', 'COMPLETED', 'PAID', 'RELEASED'].includes(String(thread?.flow_state || '').toUpperCase())) ? "Live link submitted — review and release secure payment hold above" : "Waiting for creator's live link ⏳"}
                </span>
              </div>
            )}
          </div>
        </div>
  );
}
