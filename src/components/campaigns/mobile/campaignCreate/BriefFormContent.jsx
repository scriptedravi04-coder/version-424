import React from "react";
import { X, Plus, Shield } from "lucide-react";


// Session 49 (clean-up): moved out of MobileCampaignCreate.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function BriefFormContent(props) {
  const { campaignTitle, handleNicheToggle, isKycApproved, requirementsText, selectedCategories, setCampaignTitle, setRequirementsText, setShowKycModal, setShowNicheSheet } = props;
  const { dosText = "", setDosText, dontsText = "", setDontsText, hashtagsText = "", setHashtagsText } = props; // Session 58 (Q14)
  return (
    <div className="flex-1 px-5 pt-4 pb-[calc(112px+env(safe-area-inset-bottom))] flex flex-col">{/* v330: content clears the pinned button + iPhone home bar */}
        {/* KYC Pending Banner */}
        {!isKycApproved && (
          <div className="p-3 rounded-[12px] bg-[#FFF7E8] border border-[#F5E0B8] flex gap-3 items-start">
            <Shield size={17} className="text-[#B45309] stroke-[1.9] shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-[12.5px] font-semibold leading-[1.3] text-[#7C2D12]">Verify your brand to publish</div>{/* v416 (C18): said "KYC pending" before anything was submitted */}
              <div className="mt-1 text-[11.5px] leading-[1.45] text-[#92400E]">
                Write and save drafts freely. You'll need KYC only to publish.
              </div>
              <button
                type="button"
                onClick={() => setShowKycModal(true)}
                className="mt-2 text-[11.5px] font-semibold text-[#B45309] underline hover:opacity-80 cursor-pointer block"
              >
                Verify business KYC
              </button>
            </div>
          </div>
        )}

        <h2 className="mt-5 text-[23px] font-semibold leading-[1.28] tracking-[-0.7px] text-[#0A0A0A]">
          What are you hiring creators for?
        </h2>

        {/* Campaign Title */}
        <div className="mt-5.5 text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
          Campaign title
        </div>
        <div className="mt-2.5 h-[52px] rounded-[14px] bg-white border-[1.5px] border-[#7C3AED] flex items-center px-4">
          <input
            type="text"
            value={campaignTitle}
            onChange={(e) => setCampaignTitle(e.target.value)}
            placeholder="Monsoon serum reel push"
            className="w-full bg-transparent text-[16px] font-medium text-[#0A0A0A] outline-none placeholder:text-[#9CA3AF]" /* v332: 16px stops iOS zoom (all fields here) */
          />
        </div>

        {/* Creative Brief */}
        <div className="mt-4.5 flex items-baseline justify-between">
          <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">Creative brief</div>
          <div className="text-[10.5px] font-medium text-[#6B7280]">{requirementsText.length} / 800</div>
        </div>
        <div className="mt-2.5 p-3.5 rounded-[14px] bg-white border border-[#E5E5EA]">
          <textarea
            rows={4}
            maxLength={800}
            value={requirementsText}
            onChange={(e) => setRequirementsText(e.target.value)}
            placeholder="Launching a niacinamide serum for humid weather. Need a morning-routine reel showing texture and the no-stickiness claim, ending with the discount code."
            className="w-full bg-transparent text-[16px] leading-[1.55] text-[#3F3F46] outline-none resize-none placeholder:text-[#9CA3AF]"
          />
        </div>

        {/* Session 58 (Q14): Do's / Don'ts / Hashtags — optional */}
        {setDosText && (
          <>
            <div className="mt-4.5 text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">Do's <span className="normal-case font-medium text-[#6B7280]">· optional, one per line</span></div>
            <div className="mt-2.5 p-3.5 rounded-[14px] bg-white border border-[#E5E5EA]">
              <textarea rows={3} maxLength={2000} value={dosText} onChange={(e) => setDosText(e.target.value)}
                placeholder={"Show the product in the first 3 seconds\nTag our page"}
                className="w-full bg-transparent text-[16px] leading-[1.55] text-[#3F3F46] outline-none resize-none placeholder:text-[#9CA3AF]" />
            </div>
            <div className="mt-4.5 text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">Don'ts <span className="normal-case font-medium text-[#6B7280]">· optional, one per line</span></div>
            <div className="mt-2.5 p-3.5 rounded-[14px] bg-white border border-[#E5E5EA]">
              <textarea rows={3} maxLength={2000} value={dontsText} onChange={(e) => setDontsText(e.target.value)}
                placeholder={"Don't show other brands\nNo bad language"}
                className="w-full bg-transparent text-[16px] leading-[1.55] text-[#3F3F46] outline-none resize-none placeholder:text-[#9CA3AF]" />
            </div>
            <div className="mt-4.5 text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">Hashtags <span className="normal-case font-medium text-[#6B7280]">· optional</span></div>
            <div className="mt-2.5 px-3.5 py-3 rounded-[14px] bg-white border border-[#E5E5EA]">
              <input type="text" maxLength={600} value={hashtagsText} onChange={(e) => setHashtagsText(e.target.value)}
                placeholder="#yourbrand #newlaunch"
                className="w-full bg-transparent text-[16px] text-[#0A0A0A] outline-none placeholder:text-[#9CA3AF]" />
            </div>
          </>
        )}

        {/* Niche */}
        <div className="mt-4.5 flex items-baseline justify-between">
          <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">Niche</div>
          <div className="text-[10.5px] font-medium text-[#6B7280]">{selectedCategories.length} of 3</div>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {selectedCategories.map((cat) => (
            <div
              key={cat}
              className="px-3 py-2 rounded-[11px] bg-[#F1E8FF] border border-[#DCC9FB] flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6D28D9]"
            >
              {cat}
              <button
                type="button"
                onClick={() => handleNicheToggle(cat)}
                aria-label={`Remove ${cat}`} /* v332: icon-only button, bigger tap area */
                className="w-8 h-8 -my-1.5 -mr-2 flex items-center justify-center shrink-0 hover:opacity-75 cursor-pointer" /* v358: 32px tap target (was ~23px) */
              >
                <X size={11} className="stroke-[2.6]" />
              </button>
            </div>
          ))}
          {selectedCategories.length < 3 && (
            <button
              type="button"
              onClick={() => setShowNicheSheet(true)}
              className="px-3 py-2 rounded-[11px] bg-white border border-dashed border-[#D6D6DC] flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6B7280] cursor-pointer"
            >
              <Plus size={12} className="stroke-[2.2]" /> Add niche
            </button>
          )}
        </div>
      </div>
  );
}
