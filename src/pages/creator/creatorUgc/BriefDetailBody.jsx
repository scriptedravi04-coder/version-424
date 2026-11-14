import React from "react";
import { PlayCircle, Check, ExternalLink, Lock, X } from "lucide-react";
import { UGC_REVISION_LIMIT } from "../../../utils/ugcTerms";
import BrandLogo from "../../../components/common/BrandLogo";


// Session 49 (clean-up): moved out of CreatorUGCMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function BriefDetailBody(props) {
  const { badgeMeta, brandName, briefHours, budget, duration, formatCurrency, selectedBrief } = props;
  return (
    <div className="p-4 flex flex-col gap-3.5">
          {/* Brand Row Card */}
          <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <BrandLogo src={selectedBrief.brand_logo || selectedBrief.brand?.logo} name={brandName} size={44} radius={14} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[14px] text-[#0A0A0A] truncate">{brandName}</span>
                  <div className="h-4 px-1.5 rounded bg-emerald-50 border border-emerald-200 text-[#047857] flex items-center gap-0.5 text-[11px] font-semibold shrink-0">
                    <Check size={8} strokeWidth={3} />
                    <span>Verified brand</span>
                  </div>
                </div>
                <div className="text-[11px] text-[#6B7280] mt-0.5">
                  {selectedBrief.category ? `${selectedBrief.category} · ` : ""}Direct on Ybex{/* v332: "Lifestyle & Apparel" was made up for briefs with no category */}
                </div>
              </div>
            </div>

            <h1 className="mt-3.5 font-bold text-[18px] leading-snug tracking-[-0.4px] text-[#0A0A0A]">
              {selectedBrief.title}
            </h1>

            {/* Chips row */}
            <div className="mt-3 flex items-center gap-1.5 flex-wrap">
              <span
                className="px-2.5 py-1 rounded-[7px] font-semibold text-[10px] whitespace-nowrap border"
                style={{
                  background: badgeMeta.bg,
                  color: badgeMeta.color,
                  borderColor: badgeMeta.border
                }}
              >
                {badgeMeta.cleanLabel || badgeMeta.label}
              </span>
              <span className="px-2.5 py-1 rounded-[7px] font-semibold text-[10px] bg-[#F3F4F6] text-[#374151] border border-[#E5E5EA] whitespace-nowrap">
                {[duration, "9:16 vertical"].filter(Boolean).join(" · ") /* v353: no invented duration */}
              </span>
              <span className="px-2.5 py-1 rounded-[7px] font-medium text-[10px] bg-[#F3F4F6] text-[#374151] border border-[#E5E5EA] whitespace-nowrap">
                {selectedBrief.deliverable_type?.includes("collab") ? "Instagram collab post" : "Brand posts it"}
              </span>
            </div>
          </div>

          {/* Green Guaranteed Payout & Deadline Card */}
          <div className="bg-[#EDFAF1] border border-[#C6F0D3] rounded-[18px] p-4 flex items-center justify-between shadow-2xs">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#047857]">
                Guaranteed Payout
              </div>
              <div className="font-extrabold text-[24px] text-[#059669] tracking-[-0.6px] leading-tight mt-0.5">
                {formatCurrency(budget)}
              </div>
              <div className="text-[10.5px] text-[#047857] flex items-center gap-1 mt-0.5">
                <Lock size={10} className="stroke-[2.5]" />
                <span>In secure payment hold · paid on approval</span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#047857]">
                Delivery SLA
              </div>
              <div className="font-bold text-[18px] text-[#0A0A0A] mt-0.5">
                {briefHours} hours
              </div>
              <div className="text-[10.5px] text-[#6B7280] mt-0.5">
                from signing agreement
              </div>
            </div>
          </div>

          {/* Product Description */}
          {selectedBrief.product_description && (
            <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-4 shadow-xs">
              <div className="font-bold text-[10.5px] tracking-[0.8px] uppercase text-[#6B7280] mb-1.5">
                About the product
              </div>
              <div className="text-[12.5px] leading-relaxed text-[#374151] whitespace-pre-line">
                {selectedBrief.product_description}
              </div>
            </div>
          )}

          {/* What to Create */}
          <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-4 shadow-xs">
            <div className="font-bold text-[10.5px] tracking-[0.8px] uppercase text-[#6B7280] mb-1.5">
              What to create
            </div>
            {/* v332: only the brand's own words — a made-up brief and made-up do's / don'ts were shown as the brand's rules */}
            <div className="text-[12.5px] leading-relaxed text-[#374151] whitespace-pre-line">
              {selectedBrief.detailed_requirements || "The brand hasn't added more details. Follow the product info and format above."}
            </div>

            {/* Do's & Don'ts */}
            {(selectedBrief.dos?.[0] || selectedBrief.donts?.[0]) && (
            <div className="mt-3.5 grid grid-cols-1 gap-2.5">
              <div className="p-3.5 rounded-[14px] bg-[#F7FBF8] border border-[#DDF1E4]">
                <div className="font-bold text-[12px] text-[#047857] mb-2 flex items-center gap-1.5">
                  <Check size={14} className="stroke-[3]" /> Must Do:
                </div>
                <div className="space-y-1.5 text-[11.5px] text-[#374151]">
                  {selectedBrief.dos?.[0] ? (
                    selectedBrief.dos.map((d, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Check size={13} className="text-[#059669] shrink-0 mt-0.5 stroke-[2.5]" />
                        <span>{d}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-[#6B7280]">Nothing specific from the brand.</span>
                  )}
                </div>
              </div>

              <div className="p-3.5 rounded-[14px] bg-[#FEF8F8] border border-[#FEE4E2]">
                <div className="font-bold text-[12px] text-rose-700 mb-2 flex items-center gap-1.5">
                  <X size={14} className="stroke-[3]" /> Must Not Do:
                </div>
                <div className="space-y-1.5 text-[11.5px] text-[#374151]">
                  {selectedBrief.donts?.[0] ? (
                    selectedBrief.donts.map((d, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <X size={13} className="text-rose-500 shrink-0 mt-0.5 stroke-[2.5]" />
                        <span>{d}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-[#6B7280]">Nothing specific from the brand.</span>
                  )}
                </div>
              </div>
            </div>
            )}
          </div>

          {/* Sample Reference - Only shown if brand provided a sample URL */}
          {Boolean(selectedBrief.sample_content_url && selectedBrief.sample_content_url.trim()) && (
            <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-3.5 shadow-xs flex items-center gap-3">
              <div className="w-12 h-14 rounded-[12px] bg-gradient-to-br from-[#D6D3E8] to-[#4C4666] flex items-center justify-center shrink-0 text-white">
                <PlayCircle size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[13px] text-[#0A0A0A]">Sample reference reel</div>
                <div className="text-[11px] text-[#6B7280] mt-0.5">Style and pacing guidance</div>
              </div>
              <a
                href={selectedBrief.sample_content_url}
                target="_blank"
                rel="noreferrer"
                className="h-10 px-3 rounded-[10px] border border-[#E2E4EA] text-[11.5px] font-bold text-[#7C3AED] hover:bg-[#F5F0FF] flex items-center gap-1 transition-colors"
              >
                Watch <ExternalLink size={11} />
              </a>
            </div>
          )}

          {/* Terms summary specs */}
          <div className="bg-white border border-[#E2E8F0] rounded-[18px] divide-y divide-gray-100 overflow-hidden shadow-xs">
            <div className="p-3 flex items-center justify-between text-[11.5px]">
              <span className="text-[#6B7280]">Revisions allowed</span>
              <span className="font-bold text-[#0A0A0A]">Up to {UGC_REVISION_LIMIT}</span>
            </div>
            <div className="p-3 flex items-center justify-between text-[11.5px]">
              <span className="text-[#6B7280]">Payment release</span>
              <span className="font-bold text-[#0A0A0A]">Within 48h of approval</span>
            </div>
          </div>
        </div>
  );
}
