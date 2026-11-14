import React from "react";
import { PlayCircle, ChevronDown, ChevronUp } from "lucide-react";


// Session 49 (clean-up): moved out of CreatorUGCMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function BriefSpecsAccordion(props) {
  const { brief, briefSpecsOpen, selectedOrder, setBriefSpecsOpen } = props;
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-3.5 shadow-xs">
            <button
              onClick={() => setBriefSpecsOpen(!briefSpecsOpen)}
              aria-expanded={briefSpecsOpen} /* v330 */
              className="w-full flex items-center justify-between cursor-pointer"
            >
              <div className="font-bold text-[10.5px] tracking-[0.8px] uppercase text-[#6B7280]">
                Brief specifications
              </div>
              {briefSpecsOpen ? (
                <ChevronUp size={16} className="text-[#6B7280]" />
              ) : (
                <ChevronDown size={16} className="text-[#6B7280]" />
              )}
            </button>

            <div className="mt-2 text-[12px] leading-relaxed text-[#4B5563]">
              {brief.product_description || brief.detailed_requirements || selectedOrder.title}
            </div>

            {/* Specs Pills */}
            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              {/* v330: counts were invented ("2 do’s") when the brand gave none */}
              {(brief.dos || []).length > 0 && (
              <span className="h-[22px] px-2 rounded-[7px] bg-[#ECFDF5] text-[#047857] font-bold text-[10.5px] flex items-center">
                {brief.dos.length} do’s
              </span>
              )}
              {(brief.donts || []).length > 0 && (
              <span className="h-[22px] px-2 rounded-[7px] bg-[#FEF2F2] text-[#B91C1C] font-bold text-[10.5px] flex items-center">
                {brief.donts.length} don’ts
              </span>
              )}
              {/* v332: only the brand's real duration — "30-60s · 1080p" was made up */}
              {brief.video_duration && (
                <span className="h-[22px] px-2 rounded-[7px] bg-[#F2F2F7] text-[#4B5563] font-bold text-[10.5px] flex items-center">
                  {brief.video_duration}
                </span>
              )}
            </div>

            {briefSpecsOpen && (
              <div className="mt-3 pt-3 border-t border-[#F1F1F5] flex flex-col gap-2.5 text-[11.5px]">
                {/* v330: opening the section showed nothing when the brief had no lists */}
                {!(brief.dos || []).length && !(brief.donts || []).length && (
                  <div className="text-[#6B7280]">No extra do’s or don’ts from the brand — follow the brief above.</div>
                )}
                {brief.dos && brief.dos.length > 0 && (
                  <div>
                    <div className="font-bold text-[#047857] mb-1">Must Do:</div>
                    <ul className="list-disc pl-4 text-[#374151] space-y-1">
                      {brief.dos.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {brief.donts && brief.donts.length > 0 && (
                  <div>
                    <div className="font-bold text-[#B91C1C] mb-1">Must Not Do:</div>
                    <ul className="list-disc pl-4 text-[#374151] space-y-1">
                      {brief.donts.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {brief.sample_content_url && (
              <a
                href={brief.sample_content_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex items-center gap-1.5 text-[#7C3AED] font-bold text-[12px] hover:underline"
              >
                <PlayCircle size={14} />
                <span>View sample reference video</span>
              </a>
            )}
          </div>
  );
}
