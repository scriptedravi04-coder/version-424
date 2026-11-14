import { deliverablesLabel } from "../../../utils/safeFormat"; // v415
import React from "react";
import { useNavigate } from "react-router-dom";
import CampaignBriefExtras from "../CampaignBriefExtras";
import { ChevronLeft, Share2, ShieldCheck, CheckCircle2, MessageCircle, X, Clock, CheckCircle, Eye } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { campaignStatsFor, campaignAvatarsFor } from "../../../utils/campaignStatsForViewer";
import { getCreatorRequirementsString } from "../../../utils/campaignRequirementLine";
import { computeCreatorMatch } from "../../../lib/creatorMatch";
import { closesIn } from "./CampaignsListMobile";
import { campaignBudgetText } from "./HomeCampaignCard";
import MobileSheet from "../../chat/mobile/MobileSheet";
import ButtonSpinner from "../../common/ButtonSpinner";
import { toast } from "sonner";
import BrandLogo from "../../common/BrandLogo";

import { Presence } from "../../common/Popup";
import SocialLogo from "../../common/SocialLogo"; // v364: real platform logos
// Session 23 — design C02 (details), C03 (apply sheet), C04 (application sent).
// Presentation only: every check and the POST campaigns/apply live in the desktop
// CampaignDetail page (onApplyClick / handleApply), exactly as on desktop.
//
// CTA state machine (design C02):
//   accepted → "Open deal" (the deal's chat) · applied → "View application" (Deals · Applications)
//   closed   → disabled "Campaign closed"      · otherwise → "Apply now" → sheet

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

function Fact({ label, value }) {
  return (
    <div className="rounded-xl bg-[#F9F9FB] px-3 py-2.5 min-w-0">
      <div className="text-[10px] font-bold tracking-wider text-[#8E8E93] uppercase">{label}</div>
      <div className="text-[13px] font-semibold text-[#0A0A0A] truncate">{value}</div>
    </div>
  );
}

export default function CampaignDetailMobile({
  c, isApplied, isAccepted, chatThreadId, myApplication,
  amount, setAmount, pitch, setPitch, applying,
  applyModalOpen, setApplyModalOpen, onApplyClick, handleApply,
  applicationSent, onBack, onOpenChat, onViewApplications, onBrowseMore,
  quoteFromRateCard = false, campaignsDone = null,
}) {
  const { user } = useAuth() || {};
  const navigate = useNavigate();
  // v344: brands / agencies / admins opening a campaign page saw the creator's "Apply now" button.
  const viewerRole = String(user?.role || "").toLowerCase();
  const isBrandSide = ["brand", "agency", "talent_manager", "admin"].includes(viewerRole); // v416: + talent manager
  const ownsCampaign = Boolean(isBrandSide && c?.brand_user_id && user && [user.user_id, user.id, user.parent_brand_id].filter(Boolean).map(String).includes(String(c.brand_user_id)));
  // Session 39 (M30): past the "apply by" date = closed, even if the brand left it live.
  const expired = Boolean(c?.deadline) && !Number.isNaN(Date.parse(c.deadline)) && Date.parse(c.deadline) + 24 * 3600e3 < Date.now();
  const closed = expired || (c && c.status && String(c.status).toLowerCase() !== "live" && c.stage !== "Live" && c.stage !== "Under Review");
  const stats = c ? campaignStatsFor(c, user) : { views: null, applied: 0 };
  const faces = c ? campaignAvatarsFor(c, stats.applied || 2, user) : [];
  const requirement = c ? getCreatorRequirementsString({
    isUgc: false, categories: c.categories || (c.category ? [c.category] : []), platforms: c.platforms || [],
    follower_min: c.follower_min, follower_max: c.follower_max, gender: c.gender || "Both",
    languages: c.languages || [], location: c.location_type || c.city || c.location || "",
  }) : "";
  let match = null;
  // v344: only show a % when 2+ parts could be compared — with one part (just the category) it was always a fake 100%.
  try { const m = user && user.role === "creator" ? computeCreatorMatch({ creator: user, campaigns: [c] }) : null; match = m && Array.isArray(m.parts) && m.parts.length >= 2 ? m.score : null; } catch { match = null; }
  const closesText = closesIn(c?.deadline);
  const budget = Number(c?.budget_max || c?.budget_min || 0);
  const detailBudget = campaignBudgetText(c, "–");
  const quote = Number(amount || 0);
  const overBudget = budget > 0 && quote > budget * 1.5;
  const aboveBudget = budget > 0 && quote > budget && !overBudget; // v426: a gentle note as soon as the quote passes the budget
  const followers = c?.follower_min ? `${c.follower_min >= 1000 ? Math.round(c.follower_min / 1000) + "K" : c.follower_min}+` : "Any";
  // v332: deliverables can be objects ({ type, label }) — showed "[object Object]".
  const deliverables = (Array.isArray(c?.deliverables) ? c.deliverables : []).map((d) => (typeof d === "string" ? d : d?.label || d?.type || "")).filter(Boolean);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: c?.title, url });
      else { await navigator.clipboard.writeText(url); toast.success("Link copied"); /* v330: the tap gave no feedback */ }
    } catch (e) {
      // v330: user cancelling the share sheet stays silent; a real failure says so.
      if (e?.name !== "AbortError") toast.error("Couldn't share. Copy the link from your browser.");
    }
  };

  // C04 — after a successful application (the desktop handler flips applicationSent on mobile).
  if (applicationSent) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] px-5 pt-16 pb-28 flex flex-col items-center text-center" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="w-16 h-16 rounded-2xl bg-[#ECFDF5] flex items-center justify-center"><CheckCircle2 size={30} className="text-[#059669]" /></div>
        <div className="mt-4 text-[22px] font-bold tracking-[-.5px] text-[#0A0A0A]">Application sent</div>
        <div className="mt-1.5 text-[13.5px] leading-[1.55] text-[#6B7280] max-w-[300px]">
          {c?.brand_name || "The brand"} will review your pitch. You'll get a notification when they respond.
        </div>
        <div className="mt-6 w-full bg-white rounded-[18px] border border-[#E5E5EA] p-4 space-y-2.5 text-left">
          <div className="flex justify-between text-[13px]"><span className="text-[#6B7280] shrink-0">Campaign</span><span className="font-semibold text-[#0A0A0A] truncate ml-3 min-w-0">{c?.title}</span></div>
          <div className="flex justify-between text-[13px]"><span className="text-[#6B7280]">Your quote</span><span className="font-semibold text-[#0A0A0A]">{inr(amount)}</span></div>
          <div className="flex justify-between text-[13px]"><span className="text-[#6B7280]">Status</span><span className="font-semibold text-[#D97706]">Pending{/* v353: same word as the Deals list */}</span></div>
        </div>
        <button onClick={onViewApplications} className="mt-6 w-full h-12 rounded-[14px] bg-[#7C3AED] text-white text-[14.5px] font-bold">Track application</button>
        <button onClick={onBrowseMore} className="mt-2.5 w-full h-12 rounded-[14px] bg-white border border-[#E5E5EA] text-[#0A0A0A] text-[14.5px] font-bold">Browse more campaigns</button>
      </div>
    );
  }

  let cta = null;
  if (isBrandSide) {
    // v344: brand side never gets "Apply". The owner gets a shortcut to their applicants; others get no button.
    const cid = c?.campaign_id || c?.id; // v358: database rows carry campaign_id (no id) → the owner bar never showed
    if (ownsCampaign && cid) cta = <button onClick={() => navigate(`/brand/campaigns/${cid}/applicants`)} className="flex-1 h-12 rounded-[14px] bg-[#7C3AED] text-white text-[14.5px] font-bold">Manage applicants</button>;
  } else if (isAccepted) {
    cta = <button onClick={() => onOpenChat(chatThreadId)} className="flex-1 h-12 rounded-[14px] bg-[#059669] text-white text-[14.5px] font-bold inline-flex items-center justify-center gap-2"><MessageCircle size={16} /> Open deal</button>;
  } else if (isApplied) {
    cta = <button onClick={onViewApplications} className="flex-1 h-12 rounded-[14px] bg-[#F5F0FF] text-[#7C3AED] text-[14.5px] font-bold">View application</button>;
  } else if (closed) {
    cta = <button disabled className="flex-1 h-12 rounded-[14px] bg-[#E5E5EA] text-[#8E8E93] text-[14.5px] font-bold">Campaign closed</button>;
  } else {
    cta = <button onClick={onApplyClick} className="flex-1 h-12 rounded-[14px] bg-[#7C3AED] text-white text-[14.5px] font-bold">Apply now</button>;
  }

  return (
    <div className="bg-[#F2F2F7] pb-3" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur px-3 h-14 flex items-center justify-between border-b border-[#E5E5EA]" style={{ top: 0 /* Session 43 */ }}>
        <button onClick={onBack} aria-label="Back" className="w-10 h-10 rounded-full bg-[#F2F2F7] flex items-center justify-center"><ChevronLeft size={20} /></button>
        <div className="text-[15px] font-bold text-[#0A0A0A]">Campaign details</div>
        <button onClick={share} aria-label="Share" className="w-10 h-10 rounded-full bg-[#F2F2F7] flex items-center justify-center"><Share2 size={17} /></button>
      </div>

      <div className="px-4 pt-4 space-y-3">
        <div className="bg-white rounded-[20px] border border-[#E5E5EA] p-4">
          <div className="flex items-center gap-3">
            <BrandLogo name={c?.brand_name} logo={c?.brand_logo} size={44} /* v283: real brand logo (Ravi) */ />
            <div className="min-w-0">
              <div className="text-[14px] font-bold text-[#0A0A0A] truncate">{c?.brand_name}</div>
              <div className="text-[12px] text-[#6B7280] truncate">
                {(c?.categories || []).slice(0, 2).join(" · ")}
                {campaignsDone > 0 && <> · {campaignsDone} {campaignsDone === 1 ? "campaign" : "campaigns"} done</>}
              </div>
            </div>
          </div>
          <div className="mt-3 text-[19px] font-bold leading-snug tracking-[-.3px] text-[#0A0A0A]">{c?.title}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!closed && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#059669] bg-[#ECFDF5] border border-[#A7F3D0] px-2 py-0.5 rounded-md"><CheckCircle size={11} /> Actively reviewing</span>
            )}
            {match != null && !closed && (
              <span className="px-2 py-0.5 rounded-md bg-[#F5F0FF] text-[#7C3AED] text-[11px] font-bold">{match}% match</span>
            )}
            {c?.deadline && (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#D97706]"><Clock size={13} /> {closed ? "Applications closed" : (closesText || `Apply by ${new Date(c.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" /* v330: IST */ })}`)}</span>
            )}
          </div>

          <div className="mt-3 rounded-2xl bg-[#ECFDF5] px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-[20px] font-bold text-[#047857]">{detailBudget || "Open budget" /* v426: same words as the list ("Up to ₹5,000", never "₹0–₹5,000") */}</div>
              <div className="text-[11.5px] text-[#059669]">{detailBudget === "Barter" ? "per creator · product / service, no cash" : "per creator · paid safely through Ybex"}</div>
            </div>
            <ShieldCheck size={22} className="text-[#059669]" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Fact label="Deliverables" value={deliverablesLabel(deliverables, " + ") || "As per brief" /* v415 */} />
            {/* v344: no made-up "Instagram" when the campaign has no platform — the row is hidden instead */}
            {(c?.platforms || []).length > 0 && <Fact label="Platform" value={<span className="inline-flex items-center gap-1.5 max-w-full">{c.platforms.map((p) => <SocialLogo key={p} platform={p} size={14} />)}<span className="truncate">{c.platforms.join(", ")}</span></span>} />}{/* v364: real logos */}
            <Fact label="Followers" value={followers} />
            <Fact label="Location" value={c?.location || "Pan India"} />
          </div>
        </div>

        <div className="bg-white rounded-[20px] border border-[#E5E5EA] p-4">
          <div className="text-[11px] font-bold tracking-wider text-[#8E8E93] uppercase">Looking for</div>
          {requirement && <p className="mt-1.5 text-[13.5px] leading-[1.55] font-semibold text-[#0A0A0A]">{requirement}</p>}
          {c?.description && <p className="mt-2 text-[13.5px] leading-[1.6] text-[#374151] whitespace-pre-line">{c.description}</p>}
          <CampaignBriefExtras campaign={c} compact />
        </div>

        {!isBrandSide && ( /* v416 (C15): creator steps ("Apply with your quote") aren't shown to brands */
        <div className="bg-white rounded-[20px] border border-[#E5E5EA] p-4">
          <div className="text-[11px] font-bold tracking-wider text-[#8E8E93] uppercase">How it works</div>
          {["Apply with your quote", "Brand accepts → sign the contract with OTP", "Post, submit the link → paid after approval"].map((s, i) => (
            <div key={i} className="mt-2.5 flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-[#F5F0FF] text-[#7C3AED] text-[12px] font-bold flex items-center justify-center shrink-0">{i + 1}</div>
              <div className="text-[13px] text-[#374151]">{s}</div>
            </div>
          ))}
        </div>
        )}

        {isApplied && myApplication && (
          <div className="bg-white rounded-[20px] border border-[#E5E5EA] p-4">
            <div className="text-[11px] font-bold tracking-wider text-[#8E8E93] uppercase">Your application</div>
            <div className="mt-1.5 flex justify-between text-[13px]"><span className="text-[#6B7280]">Quote</span><span className="font-semibold">{Number(myApplication.proposed_amount) > 0 ? inr(myApplication.proposed_amount) : "—" /* v332: no "₹0" */}</span></div>
            <div className="mt-1 flex justify-between text-[13px]"><span className="text-[#6B7280]">Status</span><span className="font-semibold">{String(myApplication.status || "Pending").replace(/_/g, " ").toLowerCase().replace(/^./, (m) => m.toUpperCase())}</span></div>
          </div>
        )}
      </div>

      {/* Session 41: while the apply sheet is open, its own "Send application" is the only button —
          the bar's "Apply now" used to stay visible under the sheet (two apply buttons). */}
      {!applyModalOpen && cta && ( /* v344: no bar at all when there is no button (brand viewing someone else's campaign) */
      <div 
        data-testid="campaign-apply-bar"
        className="fixed left-0 right-0 bottom-0 z-30 bg-white border-t border-[#E5E5EA] px-4 pt-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
        // Session 40 (Ravi): on iPhone the page showed through under this bar. The second shadow paints
        // solid white below the bar, so nothing can peek out whatever the browser bars do.
        style={{
          paddingBottom: "max(14px, calc(env(safe-area-inset-bottom, 0px) + 12px))",
          boxShadow: "0 -4px 20px rgba(0,0,0,0.06), 0 240px 0 0 #ffffff",
        }}
      >
        {(stats.views != null || stats.applied > 0) && (
          <div className="flex items-center justify-between pb-2.5 text-[12px] text-[#6B7280]">
            {stats.views != null ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-gray-600">
                <Eye size={13} /> {Number(stats.views).toLocaleString("en-IN") /* v332: Indian format */} views
              </span>
            ) : <span />}
            {stats.applied ? (
              <span className="inline-flex items-center gap-1.5 font-bold text-[#7C3AED]">
                {faces.length > 0 && (
                  <span className="flex -space-x-1.5">
                    {faces.slice(0, 3).map((a, i) => (
                      <img key={i} src={a} alt="" onError={(e) => { e.currentTarget.style.display = "none"; } /* v330: hide a broken face */} className="w-4 h-4 rounded-full border border-white bg-gray-100 object-cover" />
                    ))}
                  </span>
                )}
                {stats.applied}+ applied
              </span>
            ) : null}
          </div>
        )}
        <div className="flex gap-2">
          {cta}
        </div>
      </div>
      )}

      <Presence>{applyModalOpen && (
        <MobileSheet key="mobilesheet" fixed onClose={() => setApplyModalOpen(false)}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[18px] font-bold text-[#0A0A0A]">Apply to campaign</div>
              <div className="text-[12.5px] text-[#6B7280] truncate">{c?.title} · {c?.brand_name}</div>
            </div>
            <button onClick={() => setApplyModalOpen(false)} aria-label="Close" className="w-10 h-10 rounded-full bg-[#F2F2F7] flex items-center justify-center shrink-0"><X size={16} /></button>
          </div>

          <div className="mt-4 flex items-baseline justify-between">
            <label className="text-[12.5px] font-bold text-[#0A0A0A]">Your quote</label>
            {budget > 0 && <span className="text-[11.5px] text-[#6B7280]">Brand budget {inr(budget)}</span>}
          </div>
          <div className="mt-1.5 h-12 rounded-[14px] bg-[#F9F9FB] border border-[#E5E5EA] flex items-center px-3.5">
            <span className="text-[15px] font-bold text-[#6B7280] mr-1">₹</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              className="flex-1 bg-transparent outline-none text-[16px] font-bold text-[#0A0A0A]"
              placeholder="0"
            />
          </div>
          {quoteFromRateCard && <div className="mt-1 text-[11px] text-[#8E8E93]">From your rate card — change it if you like.</div>}
          {overBudget && <div className="mt-1 text-[11.5px] text-[#D97706]">That's well above the brand's budget — they may not accept it.</div>}
          {aboveBudget && <div className="mt-1 text-[11.5px] text-[#D97706]" data-testid="quote-above-budget">This is above the brand's budget of {inr(budget)}.</div>}

          {deliverables.length > 0 && (
            <>
              <div className="mt-3 text-[12.5px] font-bold text-[#0A0A0A]">Deliverables you'll post</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {deliverables.map((d, i) => <span key={i} className="px-2.5 py-1 rounded-full bg-[#F5F0FF] text-[#7C3AED] text-[12px] font-semibold">{d}</span>)}
              </div>
            </>
          )}

          <div className="mt-3 flex items-baseline justify-between">
            <label className="text-[12.5px] font-bold text-[#0A0A0A]">Pitch to brand</label>
            <span className={`text-[11.5px] ${pitch.length < 20 ? "text-[#D97706]" : "text-[#8E8E93]"}`}>{pitch.length}/500 · min 20</span>
          </div>
          <textarea
            value={pitch}
            onChange={(e) => setPitch(e.target.value.slice(0, 500))}
            placeholder="Why you're a great fit — your idea, audience and timeline."
            className="mt-1.5 w-full h-28 rounded-[14px] bg-[#F9F9FB] border border-[#E5E5EA] p-3 text-[16px] leading-[1.5] outline-none resize-none" /* v332: 16px stops iOS zoom */
          />

          <button
            disabled={applying || !amount || pitch.length < 20}
            onClick={handleApply}
            className="mt-4 w-full h-12 rounded-[14px] bg-[#7C3AED] text-white text-[14.5px] font-bold disabled:opacity-50 inline-flex items-center justify-center"
          >
            {applying ? <ButtonSpinner label="Sending…" /> : "Send application"}
          </button>
        </MobileSheet>
      )}</Presence>
    </div>
  );
}
