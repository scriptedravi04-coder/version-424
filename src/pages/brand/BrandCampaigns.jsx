import React, { useState, useEffect, useRef } from "react";
import { CampaignListSkeleton } from "../../components/common/MobileSkeletons";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import CampaignCard from "../../components/campaigns/CampaignCard";
import { Megaphone, Plus, AlertCircle, Clock, ChevronRight } from "lucide-react";
import KycPromptModal from "../../components/common/KycPromptModal";
import { ignored } from "../../utils/ignored";
import { draftGet, draftRemove } from "../../lib/userDraft";
import { useLiveRefresh } from "../../lib/liveRefresh";
import useIsMobile from "../../hooks/useIsMobile";
import BrandCampaignsMobile, { DeleteDraftConfirm } from "../../components/campaigns/mobile/BrandCampaignsMobile"; // v417: + DeleteDraftConfirm
import { OfflineAware } from "../../components/common/OfflineState"; // v334
import { campaignErrorText } from "../../components/campaigns/mobile/HomeCampaignCard"; // v416: calm 5xx text
import { SentInvitesList } from "../../components/campaigns/InviteToCampaignModal"; // v416 (C5): brand "Sent invites" list with Withdraw
// v417: styled confirm for "Delete draft" (never window.confirm) lives with the mobile list (no new file)

// v417: the confirm copy for deleting a draft (server or device-only)
const DELETE_DRAFT_CONFIRM = { title: "Delete this draft?", body: "This can't be undone.", confirmLabel: "Delete" };

export default function BrandCampaigns() {
  const navigate = useNavigate();
  const { user, isKycApproved } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");

  const [kyc, setKyc] = useState(null);
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  const [localDraftInfo, setLocalDraftInfo] = useState(null);
  const [showKycPrompt, setShowKycPrompt] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [loadError, setLoadError] = useState(false); // v330: a failed load is not "no campaigns yet"
  const isMobile = useIsMobile();

  // v358: no KYC wall here — the create screen saves drafts freely and asks for KYC only when publishing.
  // With a saved browser draft, "New campaign" starts empty (?fresh=1) — "Resume draft" opens the old one.
  const handleCreateClick = () => {
    navigate(hasLocalDraft ? "/brand/campaigns/create?fresh=1" : "/brand/campaigns/create");
  };

  const handleResumeDraft = () => {
    setFabOpen(false);
    navigate("/brand/campaigns/create");
  };

  const [confirmSheet, setConfirmSheet] = useState(null); // v417: delete-draft confirm
  const [deletingId, setDeletingId] = useState(null); // v417: busy state on the draft being deleted

  const removeLocalDraft = () => {
    try {
      draftRemove("campaign_draft");
    } catch (e) { ignored("BrandCampaigns:42", e); }
    setHasLocalDraft(false);
    setLocalDraftInfo(null);
    toast.success("Draft deleted", { id: "campaign-draft" }); // v417
  };

  // v417: device-only draft — same styled confirm, removed on this device only
  const handleDiscardDraft = (e) => {
    if (e) e.stopPropagation();
    setConfirmSheet({ ...DELETE_DRAFT_CONFIRM, onConfirm: removeLocalDraft });
  };

  // v417: server draft — DELETE /api/campaigns/:id (drafts only), then drop it from the list (tab + header counts follow)
  const deleteServerDraft = async (c) => {
    const id = c.campaign_id || c.id;
    if (!id || deletingId) return;
    setDeletingId(id);
    try {
      await api.delete(`/campaigns/${id}`);
      setCampaigns((list) => list.filter((x) => String(x.campaign_id || x.id) !== String(id)));
      toast.success("Draft deleted", { id: "campaign-draft" });
    } catch (err) {
      const st = err?.response?.status;
      if (st === 409) {
        // v417: plain server reason ("Only drafts can be deleted…" / "already has deals…")
        toast.error(err?.response?.data?.error || "Only drafts can be deleted.", { id: "campaign-draft" });
        loadData({ silent: true, fresh: true });
      } else if (st === 404) {
        setCampaigns((list) => list.filter((x) => String(x.campaign_id || x.id) !== String(id))); // already gone
      } else {
        toast.error(st === 403 ? "You can't delete this draft." : campaignErrorText(err, "Couldn't delete the draft. Please try again."), { id: "campaign-draft" });
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteDraft = (c) => {
    setConfirmSheet({ ...DELETE_DRAFT_CONFIRM, onConfirm: () => deleteServerDraft(c) });
  };

  const handleStartNewCampaign = () => {
    setFabOpen(false);
    handleCreateClick();
  };

  useEffect(() => {
    try {
      const draft = draftGet("campaign_draft");
      if (draft) {
        const parsed = JSON.parse(draft);
        const hasContent = Boolean(
          parsed && (
            (parsed.campaignTitle && String(parsed.campaignTitle).trim()) ||
            (parsed.title && String(parsed.title).trim()) ||
            (parsed.requirementsText && String(parsed.requirementsText).trim()) ||
            (parsed.description && String(parsed.description).trim()) ||
            (parsed.brandName && String(parsed.brandName).trim()) ||
            (Array.isArray(parsed.selectedCategories) && parsed.selectedCategories.length > 0)
          )
        );
        if (hasContent) {
          setHasLocalDraft(true);
          setLocalDraftInfo(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (user && user.role === "creator") {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  const loadData = async ({ silent = false, fresh = false } = {}) => {
    const opts = fresh ? { bypassCache: true } : undefined; // v416 (CR11): live refresh reads fresh data
    try {
      if (!silent) setLoading(true);
      let failed = false;
      const { data: camps } = await api.get("campaigns?mine=true", opts).catch(() => { failed = true; return { data: [] }; });
      // v330: a failed (background) reload kept wiping the list to empty — keep what is on screen.
      if (!failed) setCampaigns(Array.isArray(camps) ? camps : []);
      setLoadError(failed);

      const { data: kycData } = await api.get("verifications/me", opts).catch(() => ({ data: null }));
      setKyc(kycData);
    } catch (e) {
      console.error("Failed to load campaigns list", e);
      setLoadError(true); // v330: keep the current list, show the error state if there is nothing to show
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Session 28: new applications, admin review, KYC decisions show up without a page refresh.
  useLiveRefresh(loadData, { types: ["application", "campaign", "kyc", "verification", "deal"] });

  const handleEdit = (c) => {
    navigate(`/brand/campaigns/create?edit=${c.campaign_id || c.id}`);
  };

  const submittingDraftRef = useRef(false); // v330: a double tap on Launch sent the draft twice
  const [launchingId, setLaunchingId] = useState(null); // v358: visible busy state on the tapped Launch
  const handleSubmitDraft = async (c) => {
    if (submittingDraftRef.current) return;
    // v332: also trust the account's KYC flag when the status read failed (approved brands were sent to KYC)
    const kycOk = kyc?.status === "approved" || kyc?.status === "APPROVED" || (!kyc && isKycApproved);
    if (!kycOk) {
      // v416 (C17): the same KYC popup as the create wizard (it toasted and jumped straight to /brand/kyc)
      setShowKycPrompt(true);
      return;
    }

    submittingDraftRef.current = true;
    setLaunchingId(c.campaign_id || c.id); // v358
    try {
      const campaignId = c.campaign_id || c.id;
      const res = await api.post(`/campaigns/${campaignId}/submit-draft`);
      
      if (res?.data && (res.data.success || res.data.status === "live" || res.data.status === "under_review" || res.data.campaign?.status === "live")) {
        // Session 58: launched drafts are checked by the Ybex team first, like new campaigns.
        toast.success(res.data.status === "under_review" ? "Sent for review — the Ybex team checks it (usually within 2–3 hours), then it goes live." : "Campaign is live!", { id: "campaign-launch" });
        loadData({ silent: true, fresh: true }); // v416: no full-page skeleton flash after Launch
      } else {
        const errorMsg = res?.data?.error || res?.data?.detail || "Couldn't launch the campaign. Please try again."; // v332: calm copy
        console.error("Failed to submit campaign draft:", res?.data || res);
        toast.error(errorMsg, { id: "campaign-launch" });
      }
    } catch (err) {
      console.error("Error launching campaign brief draft:", err);
      // v332: no raw tech text (err.message such as "Network Error")
      toast.error(campaignErrorText(err, "Couldn't launch the campaign. Please try again."), { id: "campaign-launch" }); // v416: no raw 5xx detail
    } finally {
      submittingDraftRef.current = false;
      setLaunchingId(null); // v358
    }
  };

  const handleManage = (c) => {
    navigate(`/brand/campaigns/${c.campaign_id || c.id}/applicants`, { state: { campaign: c } });
  };

  const isUnderReview = (status) => {
    const s = (status || "").toLowerCase().trim();
    return s === "under_review" || s === "under review" || s === "pending_review" || s === "in_review" || s === "review";
  };

  const filtered = campaigns?.filter(c => {
    if (activeTab === "all") return true;
    if (activeTab === "review") return isUnderReview(c.status);
    if (activeTab === "live") return (c.status || "").toLowerCase() === "live" || (c.status || "").toLowerCase() === "approved";
    if (activeTab === "draft") return (c.status || "").toLowerCase() === "draft" || !c.status;
    if (activeTab === "completed") return (c.status || "").toLowerCase() === "completed";
    if (activeTab === "rejected") return ["rejected", "cancelled"].includes((c.status || "").toLowerCase()); // v358
    return true;
  });

  if (loading) {
    // v333: a full-width skeleton shaped like the list (it was a small box in the middle of the screen).
    return <CampaignListSkeleton />;
  }

  const reviewCount = campaigns?.filter(c => isUnderReview(c.status)).length || 0;
  const rejectedCount = campaigns?.filter(c => ["rejected", "cancelled"].includes((c.status || "").toLowerCase())).length || 0; // v358

  const tabs = [
    { id: "all", label: "All", count: campaigns.length }, // v415: was "All Briefs"
    ...(reviewCount > 0 ? [{ id: "review", label: "Under Review", count: reviewCount }] : []),
    { id: "live", label: "Live", count: campaigns?.filter(c => (c.status || "").toLowerCase() === "live" || (c.status || "").toLowerCase() === "approved").length },
    { id: "draft", label: "Drafts", count: campaigns?.filter(c => (c.status || "").toLowerCase() === "draft" || !c.status).length },
    { id: "completed", label: "Completed", count: campaigns?.filter(c => (c.status || "").toLowerCase() === "completed").length },
    // v358: rejected campaigns only showed under "All" (the tab counts didn't add up)
    ...(rejectedCount > 0 ? [{ id: "rejected", label: "Not approved", count: rejectedCount }] : []),
  ];

  // v330: first load failed → say so with a retry, instead of "No campaign briefings found".
  if (loadError && campaigns.length === 0) {
    return (
      <OfflineAware className="w-full max-w-md mx-auto px-4 py-10" onRetry={() => loadData()}>{/* v334: offline → OfflineState */}
      <div className="w-full max-w-md mx-auto px-4 py-16 text-center" data-testid="brand-campaigns-error">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-3">
          <AlertCircle size={22} />
        </div>
        <h3 className="text-base font-bold text-[var(--text-primary)]">Couldn't load your campaigns</h3>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Check your connection and try again.</p>
        <button
          type="button"
          onClick={() => loadData()}
          className="mt-5 h-11 px-6 rounded-xl bg-[#7C3AED] text-white text-sm font-bold cursor-pointer active:scale-95 transition-all"
        >
          Try again
        </button>
      </div>
      </OfflineAware>
    );
  }

  // Session 30: phones get Ravi's mobile design (UI only — same data and handlers as below).
  if (isMobile) {
    return (
      <>
        <BrandCampaignsMobile
          campaigns={campaigns}
          filtered={filtered}
          tabs={tabs}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isUnderReview={isUnderReview}
          hasLocalDraft={hasLocalDraft}
          localDraftInfo={localDraftInfo}
          onCreate={handleCreateClick}
          onResumeDraft={handleResumeDraft}
          onDiscardDraft={handleDiscardDraft}
          onEdit={handleEdit}
          onSubmitDraft={handleSubmitDraft}
          onManage={handleManage}
          launchingId={launchingId} /* v358 */
          onDeleteDraft={handleDeleteDraft} /* v417 */
          deletingId={deletingId} /* v417 */
        />
        <div className="px-4 pb-4 bg-[#F2F2F7]"><SentInvitesList /></div>{/* v416 (C5) */}
        <KycPromptModal
          isOpen={showKycPrompt}
          onClose={() => setShowKycPrompt(false)}
          role="brand"
          actionType="create_campaign"
          allowDraft={false} /* v416 (C17): same popup as the create wizard */
        />
        <DeleteDraftConfirm sheet={confirmSheet} onClose={() => setConfirmSheet(null)} />{/* v417 */}
      </>
    );
  }

  return (
    <div className="w-full max-w-none text-left pb-8" data-testid="brand-campaigns-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)] mb-1">
            My Campaigns{/* v415: plain copy */}
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
            Post a brief, review creator pitches and hire the right creators.
          </p>
        </div>

        {/* Desktop Header Actions */}
        <div className="hidden sm:flex items-center gap-3 flex-wrap sm:flex-nowrap">
          {tabs.find(t => t.id === "draft")?.count > 0 && (
            <button 
              onClick={() => setActiveTab("draft")}
              className="px-5 py-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-gray-50 text-xs sm:text-sm font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              Drafts <span className="flex items-center justify-center bg-amber-100 text-amber-700 w-5 h-5 rounded-full text-[10px] font-black">{tabs.find(t => t.id === "draft")?.count}</span>
            </button>
          )}
          {hasLocalDraft && (
            <button 
              onClick={handleResumeDraft}
              className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-xl transition-all hover:scale-[1.02] cursor-pointer"
            >
              <AlertCircle size={16} strokeWidth={3} /> Resume Draft
            </button>
          )}
          <button 
            onClick={handleCreateClick}
            className={`px-5 py-3 rounded-xl bg-[var(--violet)] hover:bg-[#6B4AFF] text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-xl transition-all hover:scale-[1.02] cursor-pointer`}
          >
            <Plus size={16} strokeWidth={3} /> New Campaign{/* v415 */}
          </button>
        </div>

        {/* Mobile Header Quick Actions */}
        <div className="flex sm:hidden items-center gap-2 flex-wrap w-full">
          {tabs.find(t => t.id === "draft")?.count > 0 && (
            <button 
              onClick={() => setActiveTab("draft")}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "draft"
                  ? "bg-amber-500 text-white shadow-sm"
                  : "bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)]"
              }`}
            >
              <Clock size={13} />
              <span>Drafts</span>
              <span className={`w-4 h-4 rounded-full text-[10px] font-black flex items-center justify-center ${
                activeTab === "draft" ? "bg-white text-amber-600" : "bg-amber-100 text-amber-700"
              }`}>
                {tabs.find(t => t.id === "draft")?.count}
              </span>
            </button>
          )}
          {hasLocalDraft && (
            <button 
              onClick={handleResumeDraft}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              <AlertCircle size={13} strokeWidth={2.5} />
              <span>Resume Draft</span>
            </button>
          )}
          <button 
            onClick={handleCreateClick}
            className="px-3.5 py-2 rounded-xl bg-[var(--violet)] hover:bg-[#6B4AFF] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer ml-auto"
          >
            <Plus size={13} strokeWidth={2.5} />
            <span>New Campaign</span>
          </button>
        </div>
      </div>

      {/* Prominent Local Draft In Progress Banner */}
      {hasLocalDraft && (
        <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5 sm:mt-0">
              <Clock size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 rounded-md">
                  Draft Saved
                </span>
                <span className="text-xs text-[var(--text-tertiary)]">
                  {localDraftInfo?.updatedAt && !Number.isNaN(new Date(localDraftInfo.updatedAt).getTime()) ? new Date(localDraftInfo.updatedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).replace(/\b(am|pm)\b/g, (s) => s.toUpperCase()) /* v330: IST · v332: with the date (an old draft showed only a time) */ : "Auto-saved"}
                </span>
              </div>
              <div className="text-[15px] font-bold text-[var(--text-primary)] mt-0.5 break-words">
                {localDraftInfo?.campaignTitle || localDraftInfo?.title || "Untitled campaign"}
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-0.5 flex items-center gap-2 flex-wrap">
                {Array.isArray(localDraftInfo?.selectedCategories) && localDraftInfo.selectedCategories.length > 0 && (
                  <span>Categories: {localDraftInfo.selectedCategories.join(", ")}</span>
                )}
                {Array.isArray(localDraftInfo?.selectedPlatforms) && localDraftInfo.selectedPlatforms.length > 0 && (
                  <span>· Platforms: {localDraftInfo.selectedPlatforms.join(", ")}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center w-full sm:w-auto">
            <button
              onClick={handleResumeDraft}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              <span>Resume Draft</span>
              <ChevronRight size={14} />
            </button>
            <button
              onClick={handleDiscardDraft}
              className="px-3 py-2.5 rounded-xl border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/40 text-xs font-semibold cursor-pointer transition-all"
            >
              Delete{/* v417 */}
            </button>
          </div>
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl p-12 sm:p-16 text-center max-w-2xl mx-auto flex flex-col items-center justify-center mt-8">
          <div className="p-4 bg-[var(--violet)]/10 text-[var(--violet)] rounded-full mb-4">{/* v415: no endless bounce */}
            <Megaphone size={28} />
          </div>
          <h3 className={'text-base font-bold'}>No campaigns yet</h3>
          <p className={`text-sm text-gray-600 mt-2 leading-relaxed max-w-md`}>
            Post a brief and verified creators pitch to you. Posting is free — you only pay when you hire someone.
          </p>
          <button 
            onClick={handleCreateClick}
            className={`mt-6 px-5 py-2.5 rounded-xl bg-[var(--violet)] hover:bg-[#6B4AFF] text-sm font-bold text-white transition-all flex items-center gap-1.5 cursor-pointer`}
          >
            <Plus size={16} strokeWidth={2.5} /> Create your first campaign
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Tabs header */}
          <div className="flex gap-2 border-b border-[var(--border-default)] overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 relative pb-1">
            {tabs?.map((t) => {
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`relative py-2.5 px-4 text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-2 cursor-pointer z-10 ${
                    isActive 
                      ? "text-[var(--text-primary)]" 
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="brandCampaignsTabPill"
                      className="absolute inset-0 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] shadow-xs z-0"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{t.label}</span>
                  <span className={`relative z-10 text-[11px] px-1.5 py-0.5 rounded-full font-mono transition-colors ${
                    isActive ? "bg-[var(--violet)]/20 text-[var(--violet)] font-bold" : "bg-[var(--bg-elevated)] text-[var(--text-tertiary)]"
                  }`}>
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 w-full">
            {filtered.length === 0 ? (
              <div className="py-16 text-center bg-[var(--bg-card)]/50 rounded-2xl border border-[var(--border-default)] text-sm text-[var(--text-secondary)] font-medium flex flex-col items-center gap-3">
                {/* v330: showed the raw tab id ("review", "draft") */}
                <span>No campaigns in &ldquo;{tabs.find((x) => x.id === activeTab)?.label || activeTab}&rdquo;.</span>
                {/* v415: a clear next step */}
                <button type="button" onClick={() => setActiveTab("all")} className="h-9 px-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] text-xs font-bold text-[var(--text-primary)] cursor-pointer">Show all campaigns</button>
              </div>
            ) : (
              filtered?.map((camp, index) => (
                <CampaignCard 
                  key={(camp.campaign_id || camp.id) ? (camp.campaign_id || camp.id) + "-" + index : index} 
                  campaign={camp}
                  onManage={handleManage}
                  onEdit={handleEdit}
                  onSubmit={handleSubmitDraft}
                  launching={String(launchingId) === String(camp.campaign_id || camp.id)} /* v358 */
                  onDelete={handleDeleteDraft} /* v417 */
                  deleting={String(deletingId) === String(camp.campaign_id || camp.id)} /* v417 */
                />
              ))
            )}
          </div>
        </div>
      )}

      <SentInvitesList className="mt-8" />{/* v416 (C5): withdraw a pending invite here */}

      <KycPromptModal
        isOpen={showKycPrompt}
        onClose={() => setShowKycPrompt(false)}
        role="brand"
        actionType="create_campaign"
        allowDraft={false} /* v416 (C17): same popup as the create wizard */
      />
      <DeleteDraftConfirm sheet={confirmSheet} onClose={() => setConfirmSheet(null)} />{/* v417 */}

      {/* Mobile Floating Action Button (FAB) & Menu */}
      <div className="md:hidden">
        {/* FAB Backdrop */}
        <AnimatePresence>
          {fabOpen && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setFabOpen(false)} 
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs" 
            />
          )}
        </AnimatePresence>

        {/* FAB Popup Menu */}
        <AnimatePresence>
          {fabOpen && (
            <motion.div 
              initial={{ scale: 0.8, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.8, opacity: 0, y: 20 }} 
              className="fixed bottom-[164px] right-5 z-50 flex flex-col items-end gap-2.5"
            >
              {hasLocalDraft && (
                <button 
                  onClick={handleResumeDraft}
                  className="bg-white dark:bg-[#1E293B] text-[#0A0A0A] dark:text-white font-bold text-xs px-4 py-3 rounded-2xl shadow-xl border border-amber-300 dark:border-amber-700/80 flex items-center gap-2.5 active:scale-95 transition-all cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center shrink-0">
                    <Clock size={14} />
                  </div>
                  <div className="text-left">
                    <div>Resume draft</div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 font-normal truncate max-w-[130px]">
                      {localDraftInfo?.campaignTitle || localDraftInfo?.title || "Saved brief"}
                    </div>
                  </div>
                </button>
              )}

              {tabs.find(t => t.id === "draft")?.count > 0 && (
                <button 
                  onClick={() => {
                    setFabOpen(false);
                    setActiveTab("draft");
                  }}
                  className="bg-white dark:bg-[#1E293B] text-[#0A0A0A] dark:text-white font-bold text-xs px-4 py-3 rounded-2xl shadow-xl border border-[#E5E5EA] dark:border-slate-700 flex items-center gap-2.5 active:scale-95 transition-all cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Clock size={14} />
                  </div>
                  <span>View drafts ({tabs.find(t => t.id === "draft")?.count})</span>
                </button>
              )}

              <button 
                onClick={handleStartNewCampaign}
                className="bg-white dark:bg-[#1E293B] text-[#0A0A0A] dark:text-white font-bold text-xs px-4 py-3 rounded-2xl shadow-xl border border-[#E5E5EA] dark:border-slate-700 flex items-center gap-2.5 active:scale-95 transition-all cursor-pointer"
              >
                <div className="w-6 h-6 rounded-lg bg-[#F1E8FF] text-[#7C3AED] flex items-center justify-center">
                  <Plus size={14} />
                </div>
                <span>New campaign</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Floating Action Button (Raised cleanly above 84px bottom navbar) */}
        <button 
          onClick={() => setFabOpen(!fabOpen)}
          className="fixed bottom-[96px] right-5 z-40 w-14 h-14 rounded-[19px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white flex items-center justify-center shadow-[0_14px_28px_-12px_rgba(124,58,237,.65)] active:scale-95 transition-all cursor-pointer"
          aria-label={fabOpen ? "Close menu" : "Create campaign"} // v332
          aria-expanded={fabOpen}
        >
          <motion.div animate={{ rotate: fabOpen ? 45 : 0 }} transition={{ duration: 0.2 }}>
            <Plus size={24} strokeWidth={2.5} />
          </motion.div>
        </button>
      </div>
    </div>
  );
}
