import React from "react";
import { CheckCircle2 } from "lucide-react";
import BrandLogo from "../../../common/BrandLogo";
import CreatorMatchStrip from "../CreatorMatchStrip";


// Session 49 (clean-up): moved out of MobileCampaignCreate.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function ReviewFeedCard(props) {
  const { brandName, brandProfile, campaignTitle, creatorsNeeded, customCreatorsNeeded, deliverablesText, formattedDeadlineDate, previewPayoutDisplay, previewRequirementsString, requirementsText, reviewTab, selectedCategories, selectedLocations, selectedPlatforms, user, isKycApproved = false } = props; // v358: + isKycApproved
  return <>{reviewTab === "card" && (
          <div className="flex-1 px-5 pt-4 pb-[calc(156px+env(safe-area-inset-bottom))] flex flex-col gap-3">{/* v330: room for the two pinned buttons + iPhone home bar */}
            {/* Feed card preview */}
            <div className="p-4 rounded-[18px] bg-white border border-[#E5E5EA]">
              <div className="flex items-start gap-2.5">
                <BrandLogo src={brandProfile?.logo || user?.logo || user?.picture} name={brandName} size={44} radius={14} />
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold leading-[1.25] text-[#0A0A0A] line-clamp-2 [overflow-wrap:anywhere]">{campaignTitle}{/* v415: long titles wrap to 2 lines (was cut to one) */}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-[11.5px] font-medium text-[#6B7280]">by {brandName}</span>
                    {isKycApproved && <CheckCircle2 size={12} className="text-[#059669] stroke-[2.4]" />}{/* v358: tick only for a verified brand */}
                  </div>
                </div>
                <div className="px-2 py-1 rounded-[7px] bg-[#FFF7E8] border border-[#F5E0B8] text-[11px] font-semibold uppercase tracking-[0.5px] text-[#B45309] shrink-0">
                  Preview{/* v358: was "Draft" even while editing a live campaign */}
                </div>
              </div>

              <div className="mt-3.5 text-[10px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
                Looking for
              </div>
              <div className="mt-1.5 text-[12.5px] leading-[1.55] text-[#3F3F46] [overflow-wrap:anywhere]">{previewRequirementsString}</div>

              {/* 4 stats grid */}
              <div className="mt-3.5 grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-[12px] bg-[#F9F9FB] border border-[#E5E5EA]">
                  <div className="text-[11px] font-semibold tracking-[0.6px] uppercase text-[#6B7280]">Payout</div>
                  <div className="mt-1 text-[13px] font-semibold text-[#0A0A0A] truncate">{previewPayoutDisplay}</div>
                </div>
                <div className="p-2.5 rounded-[12px] bg-[#F9F9FB] border border-[#E5E5EA]">
                  <div className="text-[11px] font-semibold tracking-[0.6px] uppercase text-[#6B7280]">Platform</div>
                  <div className="mt-1 text-[13px] font-semibold text-[#0A0A0A] truncate">
                    {selectedPlatforms.join(", ")}
                  </div>
                </div>
                <div className="p-2.5 rounded-[12px] bg-[#F9F9FB] border border-[#E5E5EA]">
                  <div className="text-[11px] font-semibold tracking-[0.6px] uppercase text-[#6B7280]">Location</div>
                  <div className="mt-1 text-[13px] font-semibold text-[#0A0A0A] truncate">
                    {selectedLocations.length > 0 ? selectedLocations.join(", ") : "Pan India"}
                  </div>
                </div>
                <div className="p-2.5 rounded-[12px] bg-[#F9F9FB] border border-[#E5E5EA]">
                  <div className="text-[11px] font-semibold tracking-[0.6px] uppercase text-[#6B7280]">Deliverables</div>
                  <div className="mt-1 text-[13px] font-semibold text-[#0A0A0A] truncate">{deliverablesText}</div>
                </div>
              </div>

              {/* Match box */}
              <div className="mt-3 p-3 rounded-[12px] bg-[#F9F9FB] border border-[#E5E5EA]">
                <div className="text-[12px] font-semibold text-[#0A0A0A]">Creators, it's a match</div>
                <div className="mt-1 text-[12px] leading-[1.5] text-[#6B7280] line-clamp-2 [overflow-wrap:anywhere]">{requirementsText}</div>
              </div>

              {/* Footer */}
              <div className="mt-3.5 pt-3 border-t border-[#E5E5EA] flex items-center justify-between gap-2">
                <div className="text-[11px] font-medium text-[#6B7280] min-w-0 truncate">Applications close {formattedDeadlineDate}</div>
                {/* v332: "Custom creators" / "<5 creators" — now the real number or words */}
                <div className="text-[11px] font-semibold text-[#7C3AED] shrink-0">{creatorsNeeded === "Custom" ? (Number(customCreatorsNeeded) === 1 ? "1 creator" : customCreatorsNeeded ? `${customCreatorsNeeded} creators` : "Creators") : creatorsNeeded === "<5" ? "Under 5 creators" : `${creatorsNeeded} creators`}</div>
              </div>
            </div>

            {/* Match Banner — Session 43: real matching creators (count + faces), never a made-up number */}
            <CreatorMatchStrip categories={selectedCategories} platforms={selectedPlatforms} />
          </div>
        )}</>;
}
