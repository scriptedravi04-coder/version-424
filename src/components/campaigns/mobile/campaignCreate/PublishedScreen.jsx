import React from "react";
import { Check } from "lucide-react";
import BrandLogo from "../../../common/BrandLogo";


// Session 49 (clean-up): moved out of MobileCampaignCreate.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function PublishedScreen(props) {
  const { isEdit, brandName, brandProfile, campaignTitle, formattedDeadlineDate, inReview, navigate, previewPayoutDisplay, selectedPlatforms, user } = props;
  return (
    <div className="flex-1 px-5 pt-12 pb-[calc(24px+env(safe-area-inset-bottom))] flex flex-col">{/* v332: buttons clear the iPhone home bar */}
          {/* Green checkmark circle */}
          <div className="w-[72px] h-[72px] rounded-[24px] bg-[#E9F9F1] border border-[#C3EBD7] flex items-center justify-center shrink-0">
            <Check size={34} className="text-[#047857] stroke-[2.4]" />
          </div>

          {/* Session 43 (Ravi): no made-up "142 creators reached" — the real state of the brief. */}
          <h2 className="mt-6 text-[26px] font-semibold leading-[1.25] tracking-[-0.9px] text-[#0A0A0A]">
            {inReview ? "Your brief is in review." : "Your brief is live."}
          </h2>
          <p className="mt-3 text-[14px] leading-[1.6] text-[#6B7280]">
            {inReview
              ? "Our team checks every brief before creators see it — usually within 2–3 hours. We'll notify you when it's live."
              : "Matching creators can see it in their feed now."}{" "}
            New pitches show up in Campaigns — shortlist one to open a chat, then agree and fund the payment there.{/* v358: they don't land in the inbox */}
          </p>

          {/* Published summary card */}
          <div className="mt-7 p-4 rounded-[16px] bg-white border border-[#E5E5EA] flex items-center gap-3">
            <BrandLogo src={brandProfile?.logo || user?.logo || user?.picture} name={brandName} size={42} radius={13} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[14px] text-[#0A0A0A] truncate">{campaignTitle}</div>
              <div className="mt-1 text-[11.5px] font-medium text-[#6B7280]">
                {[previewPayoutDisplay, selectedPlatforms.join(", "), `closes ${formattedDeadlineDate}`].filter(Boolean).join(" · ") /* v332: no empty " ·  · " */}
              </div>
            </div>
            <div className={`px-2.5 py-1 rounded-[7px] border text-[11px] font-bold uppercase tracking-[0.5px] shrink-0 ${inReview ? "bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]" : "bg-[#E9F9F1] border-[#C3EBD7] text-[#047857]"}`}>
              {inReview ? "In review" : "Live"}
            </div>
          </div>

          {/* Stats grid */}
          <div className={`mt-3 grid gap-2.5 ${isEdit ? "grid-cols-1" : "grid-cols-2"}`}>
            {!isEdit && ( /* v344: an edited campaign may already have applications — no hardcoded 0 */
            <div className="p-3.5 rounded-[14px] bg-white border border-[#E5E5EA]">
              <div className="text-[22px] font-semibold tracking-[-0.5px] text-[#0A0A0A]">0</div>
              <div className="mt-1 text-[11.5px] font-medium text-[#6B7280]">Applications</div>
            </div>
            )}
            <div className="p-3.5 rounded-[14px] bg-white border border-[#E5E5EA]">
              <div className={`text-[16px] font-semibold tracking-[-0.3px] ${inReview ? "text-[#B45309]" : "text-[#047857]"}`}>{inReview ? "In review" : "Live"}</div>
              <div className="mt-1 text-[11.5px] font-medium text-[#6B7280]">{inReview ? "Goes live in ~2–3 hours" : "Visible to creators"}</div>
            </div>
          </div>

          {/* Bottom Action buttons */}
          <div className="mt-auto pt-8 flex flex-col gap-2.5">
            <button
              onClick={() => navigate("/creators")}
              className="h-[52px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold text-[15px] flex items-center justify-center transition-colors cursor-pointer"
            >
              Invite creators to apply
            </button>
            <button
              onClick={() => navigate("/brand/campaigns")}
              className="h-[46px] rounded-[14px] bg-white border border-[#E5E5EA] text-[#3F3F46] font-semibold text-[14px] flex items-center justify-center transition-colors cursor-pointer"
            >
              Back to campaigns
            </button>
          </div>
        </div>
  );
}
