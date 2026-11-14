import React from "react";
import { CheckCircle, Award, ChevronLeft } from "lucide-react";
import BurgerMenuSupport from "../BurgerMenuSupport";
import AgencyBadge from "../../common/AgencyBadge";
import DeliverableBadge from "../../ugc/DeliverableBadge";
import PersonPhoto from "../../common/PersonPhoto"; // v415: initials fallback (the third-party avatar showed a broken image)


// Session 49 (clean-up): moved out of ChatBox.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function ChatBoxHeader(props) {
  const { onDealChanged /* v414 */, currentThread, isBrand, isCollabOrder, navigate, onBack, partnerId, partnerName, partnerPic, setShowBrandProfileModal, setShowInfoPanel, setShowNegotiationTable, showInfoPanel, thread, user } = props;
  return (
    <div className="h-13 md:h-20 px-3 md:px-6 border-b border-[var(--border-default)] flex items-center justify-between bg-[var(--bg-card)]/90 shrink-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-1.5 md:gap-4 min-w-0">
          {/* Mobile + tablet Back Button — v415: H2 tablet (768–1023) shows list OR thread, so it needs a way back */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onBack) {
                onBack();
              } else {
                navigate(isBrand ? '/brand/inbox' : '/chat');
              }
            }}
            className="lg:hidden -ml-1 mr-0.5 p-1.5 text-gray-700 dark:text-gray-200 hover:text-gray-900 rounded-full hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer shrink-0"
            aria-label="Back to inbox"
          >
            <ChevronLeft size={22} className="stroke-[2.5]" />
          </button>

          <div 
            role="button" /* v332: keyboard / screen-reader access to the profile */
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}
            onClick={() => {
              if (!isBrand) {
                setShowBrandProfileModal(true);
              } else if (partnerId) {
                navigate(`/creator/${partnerId}`);
              }
            }}
            className="flex items-center gap-2 md:gap-4 cursor-pointer group hover:opacity-90 transition-opacity min-w-0"
            title="Click to view public profile"
          >
            <div className="relative w-8 h-8 md:w-11 md:h-11 rounded-full overflow-hidden shrink-0 border border-[var(--border-default)] group-hover:border-[var(--violet)] transition-all p-0.5 bg-slate-100 shadow-xs">
              <PersonPhoto src={partnerPic} name={partnerName || ""} className="w-full h-full object-cover rounded-full" textClassName="text-xs" />{/* v415 */}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1 md:gap-1.5 flex-wrap">
                <h2 className="font-extrabold text-[var(--text-primary)] leading-tight group-hover:text-[var(--violet)] transition-colors text-xs md:text-base truncate">{partnerName}</h2>
                {/* v330 (Ravi): green tick only for a verified partner (it showed for everyone) — same check as the phone chat. */}
                {(() => { const p = isBrand ? currentThread?.creator || thread?.creator : currentThread?.brand || thread?.brand; return Boolean(p?.profile?.is_verified || p?.is_verified); })() && (
                  <CheckCircle size={13} className="text-emerald-500 shrink-0 md:w-3.5 md:h-3.5" aria-label="Verified" />
                )}
                {!isBrand && (thread?.brand?.profile?.is_agency || currentThread?.brand?.profile?.is_agency || currentThread?.is_agency || thread?.is_agency) && (
                  <AgencyBadge size="xs" />
                )}
              </div>
              <div className="text-[10px] md:text-xs text-[var(--text-secondary)] mt-0.5 font-semibold flex items-center gap-1 md:gap-1.5 truncate">
                {(currentThread?.is_ugc || currentThread?.ugc_order_id || currentThread?.ugc_title || currentThread?.ugc_order || currentThread?.ugc_brief) && (
                  <DeliverableBadge 
                    deliverableType={
                      currentThread?.deliverable_type || 
                      currentThread?.ugc_order?.deliverable_type || 
                      currentThread?.ugc_brief?.deliverable_type || 
                      (isCollabOrder ? "collaboration_reel" : "ugc_video_edited")
                    } 
                    size="xs" 
                  />
                )}
                <span className="truncate max-w-[140px] sm:max-w-[280px] font-medium">{currentThread?.ugc_title || currentThread?.ugc_brief?.title || currentThread?.ugc_order?.title || currentThread?.campaigns?.title || currentThread?.campaign_title || 'Direct Deal'}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
          <button 
            type="button"
            aria-label="Deal details" /* v332: icon-only button had no label */
            aria-pressed={showInfoPanel}
            onClick={() => { setShowInfoPanel(!showInfoPanel); setShowNegotiationTable(false); }}
            className="p-1.5 md:p-2.5 bg-[var(--bg-elevated)] hover:bg-[var(--border-strong)] rounded-full text-amber-500 hover:text-amber-400 transition-all flex items-center justify-center border border-[var(--border-default)] cursor-pointer"
            title="Deal details"
          >
            <Award size={16} className="md:w-5 md:h-5" />
          </button>
          <BurgerMenuSupport thread={currentThread} user={user} onDealChanged={onDealChanged /* v414: refresh after Cancel deal */} />
        </div>
      </div>
  );
}
