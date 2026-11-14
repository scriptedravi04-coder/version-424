import React, { useEffect, useState, useMemo } from "react";
import useIsMobile from "../../hooks/useIsMobile";
import DealsMobile from "../../components/deals/mobile/DealsMobile";
import { safeArray } from "../../utils/safeFormat";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "sonner";
import { calmError } from "../../components/chat/calmError"; // v332
import { motion, AnimatePresence } from "framer-motion";
import DealSummaryStats from "../../components/deals/DealSummaryStats";
import DealDetailDrawer from "../../components/deals/DealDetailDrawer";
import TrustBadgeRotator from "../../components/TrustBadgeRotator";
import AgencyBadge from "../../components/common/AgencyBadge";
import { CheckCircle, Ban, Briefcase, FileText, MessageSquare, ArrowRight, History } from "lucide-react";

import { Presence } from "../../components/common/Popup";

// v416 (QA U4 / H3): is this deal's money held? The deals row is not always updated after payment — the chat
// thread (payment_funded / flow_state escrow_funded / ESCROW_HELD) or a held payment from the brand's payments
// overview also count. Pure.
const UP = (v) => String(v ?? "").trim().toUpperCase();
const FUNDED_FLOW = ["ESCROW_FUNDED", "ESCROW_HELD", "FUNDED", "PAYMENT_FUNDED", "PAYMENT_HELD", "PAYMENT_SECURED"];
export function rowLooksFunded(r) {
  if (!r || typeof r !== "object") return false;
  if (r.escrow_hold === false && !r.payment_funded) return false; // a refund sets escrow_hold false
  return Boolean(
    r.payment_funded === true || r.escrow_funded === true || r.escrow_hold === true || r.escrow_hold_at || r.escrow_held_at || r.escrow_funded_at ||
    FUNDED_FLOW.includes(UP(r.flow_state)) || UP(r.status) === "ESCROW_HELD" ||
    ["ESCROW_HELD", "PAID", "RELEASED"].includes(UP(r.payment_status))
  );
}
export function dealIsFunded(item, { threads = {}, heldDealIds = new Set() } = {}) {
  const r = { ...(item?.raw?.raw || {}), ...(item?.raw || {}) };
  const keys = [item?.thread_id, r.thread_id, item?.id, r.id, r.deal_id, item?.collab_id].filter(Boolean).map(String);
  if (keys.some((k) => heldDealIds.has(k))) return true;
  if (rowLooksFunded(r)) return true;
  return keys.some((k) => rowLooksFunded(threads[k]));
}
/** v416 (QA U18): completed UGC rows came through as "Campaign Deal" — name them from the brief / order. */
export function isUgcItem(item) {
  const r = item?.raw || {};
  return Boolean(r.ugc_order_id || r.ugc_brief_id || r.brief_id || /^ugcord_/.test(String(item?.id || r.id || "")) || item?.subtitle === "Completed UGC Order" || String(r.thread_type || r.type || "").toLowerCase().includes("ugc"));
}

export default function Collabs() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [collabsLoaded, setCollabsLoaded] = useState(false);
  const [collabsError, setCollabsError] = useState(false); // v330: a failed load showed "No pending applications"
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTab = searchParams.get("tab");
  
  // 3 Main Top Workspace Tabs: "applications" | "active_deals" | "history"
  const [tab, setTab] = useState(queryTab === "ugc_orders" ? "applications" : (queryTab || "applications"));
  
  // Sub-filter for Active Campaign Deals
  const [dealFilter, setDealFilter] = useState("ALL"); // "ALL" | "ACTION" | "PROGRESS" | "REVIEW" | "COMPLETED"

  const [data, setData] = useState({ 
    sent: [], 
    received: [], 
    waves_sent: [], 
    waves_received: [], 
    campaign_applications: [] 
  });
  
  const [transitioningId, setTransitioningId] = useState(null);
  const [selectedDeal, setSelectedDeal] = useState(null);
  // v415: a brand's deal list showed its OWN name ("Applied to: QA Foods") — brands see the creator instead.
  // The deals list has no creator name, so it is read from the brand's chat threads (same list the inbox uses).
  const isBrand = user?.role === "brand";
  const [creatorNames, setCreatorNames] = useState({});
  const [threadsByKey, setThreadsByKey] = useState({}); // v416 (QA U4): payment state per deal / thread
  const [heldDealIds, setHeldDealIds] = useState(() => new Set()); // v416 (QA U4): deals with a held payment
  const [busyId, setBusyId] = useState(null); // v416 (CR23): one decline at a time
  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    api.get("chat/v2/threads").then(({ data }) => {
      if (!alive) return;
      const map = {};
      const byKey = {};
      (Array.isArray(data) ? data : []).forEach((t) => {
        if (t?.id) byKey[t.id] = t;
        if (t?.deal_id) byKey[t.deal_id] = t;
        if (t?.ugc_order_id) byKey[t.ugc_order_id] = t;
        if (!isBrand) return;
        const c = t?.creator || {};
        const name = c.name || c.full_name || c.profile?.full_name || c.profile?.name || t?.creator_name || "";
        const pic = c.avatar_url || c.picture || c.photo || null;
        if (!name) return;
        if (t.id) map[t.id] = { name, pic };
        if (t.deal_id) map[t.deal_id] = { name, pic };
        if (t.ugc_order_id) map[t.ugc_order_id] = { name, pic };
      });
      setThreadsByKey(byKey);
      if (isBrand) setCreatorNames(map);
    }).catch(() => { /* the card falls back to "Creator" */ });
    if (isBrand) {
      api.get("brand/payments-overview").then(({ data }) => {
        if (!alive || !data?.ok) return;
        setHeldDealIds(new Set((data.items || []).filter((i) => i.kind === "campaign" && i.deal_id && (i.status === "escrow" || i.status === "released")).map((i) => String(i.deal_id))));
      }).catch(() => { /* the deal row / thread still decide */ });
    }
    return () => { alive = false; };
  }, [isBrand, user]);

  useEffect(() => {
    if (queryTab === "ugc_orders") {
      setSearchParams({ tab: "applications" });
      setTab("applications");
    } else if (queryTab) {
      setTab(queryTab);
    }
  }, [queryTab, setSearchParams]);

  const handleTabSelect = (selectedTab) => {
    setTab(selectedTab);
    setSearchParams({ tab: selectedTab });
  };

  const load = () => {
    setCollabsError(false);
    api.get("collabs")
      .then(({data}) => setData(data && typeof data === "object" ? data : { sent: [], received: [], waves_sent: [], waves_received: [], campaign_applications: [] })) // v332: an empty reply crashed the page
      .catch((e) => {
        console.error("Error loading collabs data:", e);
        setCollabsError(true);
      })
      .finally(() => setCollabsLoaded(true));
  };
  
  useEffect(() => {
    load();
  }, [user]);

  // Accept or decline regular handshakes/collabs
  const act = async (cid, action, brandName = "Brand Partner") => {
    if (action === "accept") {
      setTransitioningId(cid);
      try { 
        await api.post(`/collabs/${cid}/action?action=accept`); 
        
        toast.custom((t) => (
          <div className="bg-white border border-emerald-100 rounded-2xl p-4 shadow-xl flex items-center justify-between gap-4 max-w-md">
            <div>
              <p className="text-xs font-bold text-gray-900 leading-snug">🎉 {brandName} accepted!</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Moved to Campaign Deals pipeline</p>
            </div>
            <button 
              onClick={() => {
                toast.dismiss(t);
                handleTabSelect("active_deals");
              }}
              className="px-3.5 py-1.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white rounded-xl text-[10px] font-bold uppercase tracking-wider whitespace-nowrap cursor-pointer"
            >
              View Deals &rarr;
            </button>
          </div>
        ), { duration: 6000 });

        setTimeout(() => {
          setTransitioningId(null);
          load();
        }, 1200);
      } catch (e) { 
        setTransitioningId(null);
        toast.error(calmError(e, "That didn't go through. Please try again.")); // v332: no raw error text
      }
    } else {
      if (busyId) return; // v416 (CR23): no double decline
      setBusyId(cid);
      try { 
        await api.post(`/collabs/${cid}/action?action=${action}`); 
        // v332: read "Collaboration proposal declineed" for a decline
        toast.success(action === "decline" ? "Collaboration proposal declined." : "Collaboration proposal updated."); 
        load(); 
      } catch (e) { 
        toast.error(calmError(e, "That didn't go through. Please try again.")); // v332
      } finally {
        setBusyId(null);
      }
    }
  };

  // Accept or decline campaign applications
  const actOnApplication = async (campaignId, applicationId, action) => {
    if (action === "accept") {
      setTransitioningId(applicationId);
      try {
        await api.post(`/campaigns/${campaignId}/applications/${applicationId}/action`, { action });
        
        toast.custom((t) => (
          <div className="bg-white border border-emerald-100 rounded-2xl p-4 shadow-xl flex items-center justify-between gap-4 max-w-md">
            <div>
              <p className="text-xs font-bold text-gray-900 leading-snug">Application accepted</p>{/* v415: plain wording */}
              <p className="text-[11px] text-gray-500 mt-0.5">The deal is now in Ongoing.</p>
            </div>
            <button 
              onClick={() => {
                toast.dismiss(t);
                handleTabSelect("active_deals");
              }}
              className="px-3.5 py-1.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white rounded-xl text-[10px] font-bold uppercase tracking-wider whitespace-nowrap cursor-pointer"
            >
              View Deals &rarr;
            </button>
          </div>
        ), { duration: 6000 });

        setTimeout(() => {
          setTransitioningId(null);
          load();
        }, 1200);
      } catch (e) {
        setTransitioningId(null);
        toast.error(calmError(e, "Couldn't accept the application. Please try again.")); // v332
      }
    } else {
      if (busyId) return; // v416 (CR23): no double decline
      setBusyId(applicationId);
      try {
        await api.post(`/campaigns/${campaignId}/applications/${applicationId}/action`, { action });
        toast.success("Application declined.");
        load();
      } catch (e) {
        toast.error(calmError(e, "Couldn't decline the application. Please try again.")); // v332
      } finally {
        setBusyId(null);
      }
    }
  };

  // Sign Agreement Action handler for DealDetailDrawer
  const handleSignAgreement = async (dealId, signatureText, type, signToken) => {
    try {
      const threadId = selectedDeal?.thread_id || selectedDeal?.raw?.thread_id;
      if (threadId) {
        await api.post(`/campaign/threads/${threadId}/sign`, { signatureText, sign_token: signToken });
      } else if (type === "ugc_order") {
        await api.post(`/ugc/orders/${dealId}/sign`, { signature: signatureText, sign_token: signToken });
      } else {
        // `/collabs/:id/action?action=sign` never existed on the server (404).
        await api.post(`/deals/${dealId}/sign`, { signature: signatureText, sign_token: signToken });
      }
      toast.success("Agreement signed successfully!");
      if (selectedDeal) {
        setSelectedDeal(prev => prev ? { ...prev, stage: "IN_PROGRESS", status: "ACTIVE" } : null);
      }
      load();
    } catch (e) {
      toast.error(calmError(e, "Couldn't sign the agreement. Please try again.")); // v332
    }
  };

  // Submit Deliverable Action handler for DealDetailDrawer
  const handleSubmitDeliverable = async (dealId, file, videoUrl, notes) => {
    try {
      // v414: submit through the deal chat (same route + body as the chat upload). The legacy
      // /collabs/:id/deliverable 404s for campaign deals — only used when the deal has no chat.
      let threadId = selectedDeal?.thread_id || selectedDeal?.raw?.thread_id;
      if (!threadId) {
        try {
          const { data: t } = await api.get(`/chat/v2/threads/${encodeURIComponent(dealId)}`);
          threadId = t?.id || null;
        } catch (err) {
          if (err?.response?.status !== 404) throw err;
        }
      }
      const cleanNotes = String(notes || "").trim();
      if (threadId) {
        await api.post(`/campaign/threads/${encodeURIComponent(threadId)}/submit-content`, {
          videoUrl, video_url: videoUrl, content_url: videoUrl, notes: cleanNotes, creator_notes: cleanNotes
        });
      } else {
        await api.post(`/collabs/${dealId}/deliverable`, { videoUrl, notes: cleanNotes });
      }
      toast.success("Deliverable submitted for brand review!");
      if (selectedDeal) {
        setSelectedDeal(prev => prev ? { ...prev, stage: "IN_REVIEW", status: "CONTENT_SUBMITTED" } : null);
      }
      load();
    } catch (e) {
      toast.error(calmError(e, "Couldn't submit the deliverable. Please try again.")); // v332
    }
  };

  // Helper to map status to deal stage
  const getStageFromStatus = (status) => {
    const s = String(status || '').toUpperCase();
    if (['COMPLETED', 'PAID', 'DELIVERED', 'CLOSED', 'SUCCESS'].includes(s)) return 'COMPLETED';
    if (['REVISION_REQUESTED'].includes(s)) return 'REVISION_REQUESTED';
    if (['CONTENT_SUBMITTED', 'PENDING_REVIEW', 'CONTENT_APPROVED', 'PROOF_SUBMITTED', 'PAYMENT_PENDING', 'SUBMITTED', 'DELIVERED', 'IN_REVIEW'].includes(s)) return 'IN_REVIEW';
    if (['ACCEPTED', 'IN_PROGRESS', 'NEGOTIATING', 'ACTIVE'].includes(s)) return 'IN_PROGRESS';
    return 'APPLICATION';
  };

  // Process and categorize all live campaign items
  const categorized = useMemo(() => {
    const applications = [];
    const activeDeals = [];
    const history = [];

    const isFinished = (status) => {
      const s = String(status || '').toUpperCase();
      return ['COMPLETED', 'DECLINED', 'REJECTED', 'CANCELLED', 'CANCELED', 'REFUNDED', 'PAID', 'DELIVERED', 'CLOSED', 'SUCCESS'] /* v414: refunded deals go to History */.includes(s);
    };

    // Track application_ids that converted to deals
    const dealAppIds = new Set();
    [...(data.received || []), ...(data.sent || [])].forEach(item => {
      if (item.application_id) dealAppIds.add(item.application_id);
      if (item.raw?.application_id) dealAppIds.add(item.raw.application_id);
    });

    // 1. Regular campaign collabs received & sent
    [...(data.received || []), ...(data.sent || [])].forEach(item => {
      const isReceived = (data.received || []).includes(item); // v332: a reply without "received" crashed the page
      const stage = getStageFromStatus(item.status);
      // v415: for a brand the other side is the creator
      const tid = item.thread_id || item.raw?.thread_id;
      const cr = creatorNames[tid] || creatorNames[item.collab_id || item.id] || null;
      const creatorName = item.creator_name || item.raw?.creator_name || cr?.name || "Creator";
      // v416 (QA U18): a completed UGC order is named after its brief, not "Campaign Deal"
      const th = threadsByKey[tid] || threadsByKey[item.collab_id || item.id] || null;
      const ugc = isUgcItem(item) || th?.is_ugc === true;
      const ugcTitle = ugc ? (th?.ugc_title || th?.ugc_brief?.title || th?.brief?.title || th?.brief_title || item.raw?.brief_title || item.raw?.title || (item.title && !/^(Campaign Deal|UGC Video Order)$/i.test(item.title) ? item.title : "") || "UGC order") : null;
      const formatted = {
        _type: 'collab',
        _direction: isReceived ? 'received' : 'sent',
        id: item.collab_id || item.id,
        brandName: isBrand ? creatorName : (item.brand_name || item.raw?.brand_profiles?.company_name || "Brand Partner"),
        brandLogo: isBrand ? (cr?.pic || null) : (item.brand_logo || item.raw?.brand_profiles?.logo || null),
        title: ugcTitle || item.title || item.deliverable || "Campaign Collaboration",
        is_ugc: ugc, // v416
        isFunded: dealIsFunded(item, { threads: threadsByKey, heldDealIds }), // v416 (QA U4)
        subtitle: isBrand ? null : (isReceived ? `From: ${item.from_name || item.brand_name || 'Brand'}` : `To: ${item.to_user_name || 'Brand Partner'}`), /* v415: no "To: Brand Partner" for brands */
        payout: Number(item.agreed_amount || item.proposed_amount || item.payout || 0),
        status: item.status || 'NEGOTIATING',
        stage: stage,
        date: item.created_at,
        thread_id: item.thread_id || item.raw?.thread_id,
        is_agency: !isBrand && Boolean(item.is_agency || item.raw?.is_agency || item.raw?.brand_profiles?.is_agency),
        raw: item
      };

      if (isFinished(formatted.status)) {
        history.push(formatted);
      } else {
        activeDeals.push(formatted);
      }
    });

    // 2. Campaign applications
    (data.campaign_applications || []).forEach(item => {
      const isIncoming = user?.role === 'brand';
      const stage = getStageFromStatus(item.status);
      const isAcceptedOrHasDeal = item.status === 'ACCEPTED' || item.status === 'accepted' || dealAppIds.has(item.application_id);

      if (isAcceptedOrHasDeal) {
        return;
      }

      const formatted = {
        _type: 'campaign_app',
        _direction: isIncoming ? 'received' : 'sent',
        id: item.application_id,
        brandName: isBrand ? (item.creator_name || "Creator") : (item.brand_name || "Brand Partner"), // v415
        title: item.campaign_title || item.title || "Campaign Pitch",
        subtitle: isIncoming ? (item.pitch ? `Pitch: "${item.pitch}"` : "No pitch added") : `Applied to: ${item.brand_name || 'Brand'}`, // v332: showed Pitch: "undefined"
        creatorName: item.creator_name,
        pitch: item.pitch,
        payout: Number(item.proposed_amount || 0),
        status: String(item.status || 'pending').toLowerCase(), // Session 58: saved as 'PENDING' — Accept/Decline never showed
        stage: stage,
        date: item.applied_at || item.created_at,
        is_agency: Boolean(item.is_agency || item.raw?.is_agency || item.raw?.brand_profiles?.is_agency),
        raw: item
      };

      if (isFinished(formatted.status)) {
        history.push(formatted);
      } else {
        applications.push(formatted);
      }
    });

    // 3. Campaign Waves / Invites
    [...(data.waves_received || []), ...(data.waves_sent || [])].forEach(item => {
      const stage = getStageFromStatus(item.status);
      const formatted = {
        _type: 'wave',
        _direction: (data.waves_received || []).includes(item) ? 'received' : 'sent', // v332
        id: item.wave_id || item.id,
        brandName: item.brand_name || "Brand Partner",
        title: `Campaign Invite: ${item.brief_title || "Sponsorship Offer"}`,
        subtitle: `Pitch: "${item.pitch || 'Campaign Pitch'}"`,
        payout: Number(item.proposed_amount || item.payout || 0),
        status: item.status || 'pending',
        stage: stage,
        date: item.created_at,
        raw: item
      };

      if (isFinished(formatted.status)) {
        history.push(formatted);
      } else {
        applications.push(formatted);
      }
    });

    const dedupeAndSort = (arr) => {
      const seen = new Set();
      const result = [];
      for (const item of arr) {
        if (item?.id && !seen.has(item.id)) {
          seen.add(item.id);
          result.push(item);
        }
      }
      return result.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    };

    return {
      applications: dedupeAndSort(applications),
      activeDeals: dedupeAndSort(activeDeals),
      history: dedupeAndSort(history)
    };
  }, [data, user, isBrand, creatorNames, threadsByKey, heldDealIds]);

  // v414: with no applications but an ongoing deal, the page opened on an empty "Applications" tab
  const autoTabDone = React.useRef(false);
  useEffect(() => {
    if (autoTabDone.current || !collabsLoaded || queryTab) return;
    autoTabDone.current = true;
    if (tab === "applications" && categorized.applications.length === 0 && categorized.activeDeals.length > 0) setTab("active_deals");
  }, [collabsLoaded, categorized, queryTab, tab]);

  // Unified list for DealSummaryStats top cards
  const unifiedDealsForStats = useMemo(() => {
    return [
      ...categorized.activeDeals,
      ...categorized.history.filter(h => h.status === 'COMPLETED' || h.status === 'PAID')
    ];
  }, [categorized]);

  // Session 23: creator mobile design D01 — same `categorized` lists, mobile layout.
  if (isMobile) {
    return (
      <DealsMobile
        role={user?.role} /* v415 */
        categorized={categorized}
        loading={!collabsLoaded}
        error={collabsError}
        onRetry={() => { setCollabsLoaded(false); load(); }}
        tab={tab === "ugc_orders" ? "applications" : tab}
        setTab={handleTabSelect} /* v344: also put the tab in the URL, so Back / reload keep the tab the creator picked */
        onOpenChat={(id) => navigate(id ? `/chat/${id}` : "/chat")}
        onOpenCampaign={(id) => navigate(`/campaigns/${id}`)}
        onBrowse={() => navigate(isBrand ? "/brand/campaigns" : "/campaigns") /* v416 (QA U13): brands go to their own campaigns */}
      />
    );
  }

  return (
    <div className="w-full max-w-none relative" data-testid="collabs-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div>
          {/* v415: brand wording (the creator header said "live campaign SLAs" and "Direct Application to Brands") */}
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight text-[var(--text-primary)] font-black">{isBrand ? "Deals" : "Ongoing Deals & Workspace"}</h1>
          <div className="flex items-center gap-2.5 flex-wrap mt-1">
            <p className="text-[var(--text-tertiary)] text-xs sm:text-sm font-medium">{isBrand ? "Track every creator deal, from agreement to approved content." : "Manage pitches, live campaign SLAs, active contracts, and completed deliverables."}</p>
            {!isBrand && <span className="hidden sm:inline text-gray-500 dark:text-gray-600">•</span>}
            {!isBrand && <TrustBadgeRotator page="applications" />}
          </div>
        </div>
      </div>

      {/* Universal 4 Stat Cards */}
      {/* v414: no 0/0/0/₹0 while loading, and no stats above the error card */}
      {!collabsLoaded ? (
        <div className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mt-3" aria-hidden="true" data-testid="deal-stats-skeleton">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-[76px] rounded-xl bg-[var(--bg-elevated)] animate-pulse" />)}
        </div>
      ) : !collabsError ? (
        <div className="mb-6">
          <DealSummaryStats deals={unifiedDealsForStats} role={user?.role} />
        </div>
      ) : null}

      {/* 3 Workspace Main Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-default)] py-2 mb-8">{/* v416 (QA U14): wraps on a tablet instead of cutting the last tab */}
        {[
          { 
            id: "applications", 
            label: "Applications", 
            badgeIcon: "📌", 
            icon: <FileText size={16} />,
            count: categorized.applications.length 
          },
          { 
            id: "active_deals", 
            label: "Ongoing", 
            badgeIcon: "🤝", 
            icon: <Briefcase size={16} />,
            count: categorized.activeDeals.length 
          },
          { 
            id: "history", 
            label: "Completed & History", 
            badgeIcon: "✅", 
            icon: <History size={16} />,
            count: categorized.history.length 
          }
        ].map(t => {
          const isActive = tab === t.id;
          return (
            <button 
              key={t.id} 
              onClick={() => handleTabSelect(t.id)} 
              className={`relative px-5 py-3 text-xs sm:text-sm font-extrabold whitespace-nowrap transition-all duration-200 flex items-center gap-2 rounded-2xl cursor-pointer z-10 shrink-0 ${
                isActive 
                  ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-md border border-[var(--border-default)]" 
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
              }`}
            >
              <span className="flex items-center gap-2">
                <span>{t.badgeIcon}</span>
                <span>{t.label}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold transition-colors ${
                  isActive ? "bg-[var(--violet)] text-white" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
                }`}>
                  {t.count}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* v332: desktop showed the "No deals / No applications" empty screens while loading and when the load failed */}
      {!collabsLoaded ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading deals">
          {[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-3xl bg-[var(--bg-elevated)] animate-pulse" />)}
        </div>
      ) : collabsError ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl p-10 text-center max-w-xl mx-auto" role="alert">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1.5">Couldn't load your deals</h3>
          <p className="text-[var(--text-tertiary)] text-xs mb-5">Check your connection and try again.</p>
          <button type="button" onClick={() => { setCollabsLoaded(false); load(); }} className="min-h-[40px] px-5 rounded-xl bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white text-sm font-bold cursor-pointer">Try again</button>
        </div>
      ) : null}

      {/* Tab 1: Ongoing Deals View */}
      {collabsLoaded && !collabsError && tab === "active_deals" && (
        <div className="space-y-6">
          {categorized.activeDeals.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-3xl p-12 text-center max-w-xl mx-auto flex flex-col items-center justify-center shadow-xs">
              <div className="w-16 h-16 bg-[var(--violet)]/10 text-[var(--violet)] rounded-full flex items-center justify-center mb-4">
                <Briefcase size={26} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 tracking-tight mb-1.5">{isBrand ? "No active deals yet" : "No active campaign deals"}</h3>
              <p className="text-gray-500 text-xs max-w-md leading-relaxed mb-6">
                {isBrand ? "When you accept a creator's application, the deal appears here." : "Once brand partners accept your pitch for live campaigns, active campaign deals will appear here automatically."}
              </p>
              <Link 
                to={isBrand ? "/brand/campaigns" : "/campaigns"} 
                className="px-5 py-2.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-md active:scale-95"
              >
                <span>{isBrand ? "View my campaigns" : "Browse live campaigns"}</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">{/* v416 (QA U14/M16): one column until there is room — 2 columns squeezed titles to one word per line at 768px */}
              { safeArray(categorized.activeDeals).map((deal, idx) => {
                const brandUserId = deal.raw?.brand_id || deal.raw?.brand_user_id || 'brand';
                
                // Determine exact status and step
                const rawStatus = (deal.status || deal.stage || '').toUpperCase();
                // v414: only the LATEST submission decides "Revision Requested" (an old changes request no longer counts)
                const subTime = (x) => new Date(x?.submitted_at || x?.created_at || 0).getTime() || 0;
                const latestSub = [...safeArray(deal.raw?.content_submissions)].sort((a, b) => subTime(b) - subTime(a))[0] || null;
                const latestAskedChanges = String(latestSub?.status || '').toUpperCase() === 'CHANGES_REQUESTED';
                const isRevisionRequested = rawStatus === 'REVISION_REQUESTED' || latestAskedChanges || (!latestSub && Boolean(deal.raw?.revision_notes));
                // v414: "paid" only with a bank UTR; otherwise it's approved and the payout comes next
                const rr = deal.raw?.raw || {};
                const payoutUtr = deal.raw?.utr_number || deal.raw?.payout_utr || deal.raw?.payout_reference || rr.utr_number || rr.payout_utr || rr.payout_reference || null;
                const isSignedBoth = deal.raw?.agreement_signed_creator && deal.raw?.agreement_signed_brand;
                const isSignedMe = deal.raw?.agreement_signed_creator;

                let currentStep = 1; // Default: In Production
                if (rawStatus === 'COMPLETED' || rawStatus === 'PAID') {
                  currentStep = 4;
                } else if (rawStatus === 'CONTENT_APPROVED' || rawStatus === 'PAYMENT_PENDING' || rawStatus === 'PROOF_SUBMITTED' || rawStatus === 'APPROVED' || rawStatus === 'PAYMENT_CLEARED') {
                  currentStep = 3;
                } else if (rawStatus === 'CONTENT_SUBMITTED' || rawStatus === 'IN_REVIEW' || rawStatus === 'SUBMITTED') {
                  currentStep = 2;
                } else {
                  // NEGOTIATING, ACTIVE, IN_PROGRESS, REVISION_REQUESTED
                  currentStep = 1;
                }

                // v416 (M16): a deal still being negotiated is before step 1 — "In Production" was highlighted
            const isNegotiating = rawStatus === 'NEGOTIATING';
            const isProd = currentStep === 1;
                const isReview = currentStep === 2;
                const isPaid = currentStep === 3;
                const isCompleted = currentStep === 4;

                let badgeText = 'In Production';
                if (currentStep === 4 || rawStatus === 'COMPLETED' || rawStatus === 'PAID') {
                  badgeText = 'Completed';
                } else if (currentStep === 3) {
                  // v414: was "Payment Cleared" even for a draft that was only approved
                  badgeText = rawStatus === 'CONTENT_APPROVED' ? 'Draft approved'
                    : rawStatus === 'PROOF_SUBMITTED' ? 'Live link under review'
                    : (payoutUtr ? (isBrand ? 'Creator paid' : 'Paid to bank') : 'Approved · payout next');
                } else if (rawStatus === 'NEGOTIATING') {
                  badgeText = 'Negotiating';
                } else if (!isSignedBoth && deal.payout > 0) {
                  badgeText = 'Agreement Pending';
                } else if (isRevisionRequested) {
                  badgeText = 'Revision Requested';
                } else if (currentStep === 2) {
                  badgeText = 'Waiting for Approval';
                }

                const stepTitles = {
                  1: isRevisionRequested ? 'Revision Requested' : (rawStatus === 'NEGOTIATING' ? 'Negotiating' : 'In Production'),
                  2: 'Waiting for Approval',
                  3: badgeText, // v414: approved / live link under review / paid only with UTR
                  4: payoutUtr ? (isBrand ? 'Completed · Creator paid' : 'Completed · Paid to bank') : 'Completed' // v414
                };

                const stepDescs = {
                  1: isRevisionRequested 
                    ? `${isBrand ? 'You asked for changes' : 'Brand requested changes'}: "${(latestAskedChanges && latestSub?.brand_feedback) || deal.raw?.revision_notes || 'Please update content'}"` /* v414: latest feedback */
                    : (rawStatus === 'NEGOTIATING' ? 'Exchanging price offers' : (isBrand ? 'The creator is making your content' : 'Filming & editing in progress')),
                  2: isBrand ? 'Content submitted · waiting for your review' : 'Content submitted, pending brand review', // v415
                  // v414: honest wording — no "payment processing"/"wallet" before the bank payout
                  3: rawStatus === 'CONTENT_APPROVED' ? (isBrand ? 'Draft approved · waiting for the live link' : 'Draft approved · post live link')
                    : rawStatus === 'PROOF_SUBMITTED' ? 'Live link under review'
                    : (payoutUtr ? `${isBrand ? 'Creator paid' : 'Paid to bank'} · UTR ${payoutUtr}` : (isBrand ? 'Approved · creator payout in 1–2 working days' : 'Approved · payout in 1–2 working days')),
                  4: payoutUtr ? `${isBrand ? 'Creator paid' : 'Paid to bank'} · UTR ${payoutUtr}` : (isBrand ? 'Approved · creator payout in 1–2 working days' : 'Approved · payout in 1–2 working days')
                };

                return (
                  <div 
                    key={`${deal._type || 'deal'}-${deal.id || 'id'}-${idx}`} 
                    className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-5 relative overflow-hidden"
                  >
                    {/* 1. Campaign Name Prominently at Top & Status Badge (No Order ID) */}
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-base font-extrabold text-gray-900 tracking-tight leading-snug">
                          {deal.title}
                        </h3>
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider shrink-0 ${
                          isCompleted ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                          isPaid ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                          isRevisionRequested ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                          isReview ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                          'bg-[#F5F0FF] text-[var(--violet)] border border-[#DDD6FE]'
                        }`}>
                          {badgeText}
                        </span>
                      </div>

                      {/* 2. Applied to which brand — v415: a brand sees "With: <creator>" */}
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[#F5F0FF] border border-[#DDD6FE] text-[var(--violet)] font-black flex items-center justify-center text-[10px] overflow-hidden shrink-0">
                          {deal.brandLogo ? (
                            <img src={deal.brandLogo} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            deal.brandName?.charAt(0).toUpperCase() || "B"
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-gray-500 font-semibold">{isBrand ? "With:" : "Applied to:"}</span>
                          <span className="text-xs font-extrabold text-gray-900 truncate max-w-[220px]">{deal.brandName}</span>
                          {!isBrand && <CheckCircle size={13} className="text-emerald-500 fill-emerald-50 shrink-0" />}
                          {deal.is_agency && <AgencyBadge size="xs" className="shrink-0" />}
                        </div>
                      </div>

                      {/* 3. Short info / description about campaign */}
                      {deal.subtitle && (
                        <p className="text-xs text-gray-500 font-medium leading-relaxed">
                          {deal.subtitle}
                        </p>
                      )}
                    </div>

                    {/* Stage Details & Stepper */}
                    <div className="space-y-3 pt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-black text-gray-900">
                            {stepTitles[currentStep]}
                          </h4>
                          <p className="text-xs text-gray-500 font-medium">
                            {stepDescs[currentStep]}
                          </p>
                        </div>
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#F5F0FF] text-[var(--violet)] border border-[#DDD6FE]/80 whitespace-nowrap shrink-0">
                          {isNegotiating ? "Not started" : `Step ${currentStep} of 4`}
                        </span>
                      </div>

                      {/* Progress Stepper Bar */}
                      <div className="pt-1 space-y-2">
                        <div className="grid grid-cols-4 gap-2">
                          {[1, 2, 3, 4].map((stepNum) => {
                            const isPast = !isNegotiating && stepNum < currentStep;
                            const isCurrent = !isNegotiating && stepNum === currentStep; // v416 (M16)

                            return (
                              <div 
                                key={stepNum} 
                                className={`h-2.5 rounded-full transition-all duration-300 relative overflow-hidden ${
                                  isPast || isCurrent ? 'bg-emerald-500' : 'bg-gray-100'
                                }`}
                              >
                                {isCurrent && (
                                  <div className="absolute inset-0 bg-white/25 animate-pulse" />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="grid grid-cols-4 text-[10px] font-bold text-gray-500 text-center gap-1">
                          {[
                            { num: 1, label: 'In Production' },
                            { num: 2, label: 'Waiting for Approval' },
                            { num: 3, label: 'Approved' /* v414: was "Payment Cleared" */ },
                            { num: 4, label: 'Completed' },
                          ].map((s) => {
                            const isCurrent = !isNegotiating && s.num === currentStep; // v416 (M16)
                            const isPast = !isNegotiating && s.num < currentStep;

                            return (
                              <span 
                                key={s.num} 
                                className={`transition-colors ${
                                  isCurrent ? 'text-gray-900 font-black' :
                                  isPast ? 'text-emerald-600 font-bold' : 'text-gray-500 font-medium'
                                }`}
                              >
                                {s.label}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Footer Payout & Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-gray-100">{/* v416 (QA U14): wraps instead of clipping View chat */}
                    <div className="min-w-0">
                    <span className="text-[11px] font-extrabold text-gray-500 uppercase tracking-widest block">{isBrand ? "Deal amount" : "PAYOUT"}</span>
                        {(() => {
                          // v333 (Ravi: "ok"): "SECURED IN PAYMENT HOLD" only when the brand has really paid.
                          // The deals row gets escrow_hold / escrow_hold_at when the payment is verified
                          // (payment_routes); signed-but-unpaid deals said the money was safe when it wasn't there.
                          const r = { ...(deal.raw?.raw || {}), ...(deal.raw || {}) }; // v414: escrow fields live on the deal row (raw.raw)
                          const isPaid = Boolean(deal.isFunded || r.escrow_hold || r.escrow_hold_at || r.payment_funded || r.escrow_funded_at) || isCompleted; // v416 (QA U4): thread / held payment count too
                          const isSigned = Boolean(isProd || isReview || r.is_signed || r.signature_text || r.agreement_signed_at
                            || (r.agreement_signed_creator && r.agreement_signed_brand) || deal.status === 'ACCEPTED' || deal.status === 'IN_PROGRESS');
                          if ((isPaid || isSigned) && deal.payout > 0) {
                            return (
                              <div className="flex flex-wrap items-center gap-2">
                              <span className="text-lg font-black font-mono text-[#027A48]">₹{deal.payout?.toLocaleString('en-IN')}</span>
                                {isPaid ? (
                                  <span className="text-[11px] font-black px-2 py-0.5 bg-[#F5F0FF] text-[var(--violet)] rounded-md border border-[#DDD6FE] uppercase tracking-wider">
                                    {isBrand ? "Paid · held until approval" : "SECURED IN PAYMENT HOLD"}
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-black px-2 py-0.5 bg-amber-50 text-amber-700 rounded-md border border-amber-200 uppercase tracking-wider">
                                    {isBrand ? "Payment pending" : "WAITING FOR BRAND PAYMENT"}
                                  </span>
                                )}
                              </div>
                            );
                          }
                          return (
                            <div className="flex items-center gap-1.5 pt-0.5">
                              <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/80">
                                {isBrand ? "Agreement not signed yet" : "Pending Deal Signature"}
                              </span>
                            </div>
                          );
                        })()}
                      </div>

                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            const targetChatId = deal.raw?.thread_id || deal.thread_id || deal.raw?.collab_id || deal.id || (isBrand ? "" : brandUserId);
                            navigate(targetChatId ? `/chat/${targetChatId}` : "/chat"); // v415: a brand never opens a chat with itself
                          }}
                          className="px-3.5 py-2.5 bg-[#F5F0FF]/80 hover:bg-[#EDE9FE]/80 text-[var(--violet)] font-extrabold text-xs uppercase tracking-wider rounded-xl border border-[#DDD6FE] transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center gap-1.5"
                          title="Open deal chat"
                        >
                          <MessageSquare size={14} className="stroke-[2.5]" />
                          <span>VIEW CHAT</span>
                        </button>

                        <button 
                          onClick={() => setSelectedDeal(deal)}
                          className="px-4 py-2.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer flex items-center gap-1"
                        >
                          <span>MANAGE</span>
                          <span>&gt;</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2 & 3: Applications / History List Views */}
      {collabsLoaded && !collabsError && tab !== "active_deals" && (
        <div className="space-y-4">
          {((tab === "applications" ? categorized.applications : categorized.history)).length === 0 ? (
            <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl p-12 text-center max-w-xl mx-auto flex flex-col items-center justify-center shadow-xs">
              <div className="w-16 h-16 bg-[var(--violet)]/10 text-[var(--violet)] rounded-full flex items-center justify-center mb-4">
                {tab === "applications" ? <FileText size={26} /> : <History size={26} />}{/* v332: the icon circle was empty */}
              </div>
              <h3 className="text-lg font-bold text-[var(--text-primary)] tracking-tight mb-1.5">
                {tab === "applications" ? (isBrand ? "No new applications" : "No pending applications or pitches") : (isBrand ? "No completed deals yet" : "No completed deals in history")}
              </h3>
              <p className="text-[var(--text-tertiary)] text-xs max-w-md leading-relaxed mb-6">
                {tab === "applications" 
                  ? (isBrand ? "Creators who apply to your campaigns will appear here." : "Apply to Live Campaigns to submit pitches to brand partners!")
                  : (isBrand ? "Finished deals will be kept here." : "Completed and paid deliverables will be archived here automatically.")
                }
              </p>
              <Link 
                to={isBrand ? "/brand/campaigns" : "/campaigns"} 
                className="px-5 py-2.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-md active:scale-95"
              >
                <span>{isBrand ? "View my campaigns" : "Browse live campaigns"}</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <AnimatePresence>
              {(tab === "applications" ? categorized.applications : categorized.history).map((it, idx) => {
                const isTransitioning = it.id === transitioningId;
                const isCompleted = it.status === "accepted" || it.status === "COMPLETED" || isTransitioning;
                const isDeclined = it.status === "declined" || it.status === "rejected" || it.status === "DECLINED";
                const isPending = it.status === "pending" || it.status === "applied" || it.status === "sent";

                return (
                  <motion.div 
                    layout
                    key={`${it._type || 'item'}-${it.id || 'id'}-${idx}`} 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                    className={`bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-5 hover:border-[var(--violet)]/40 transition-all shadow-xs relative overflow-hidden ${
                      isTransitioning ? "border-emerald-500 bg-emerald-50/10" : ""
                    }`}
                  >
                    {/* Visual bar on left */}
                    <div className={`absolute top-0 bottom-0 left-0 w-1.5 ${
                      isCompleted || isTransitioning ? "bg-emerald-500" :
                      isDeclined ? "bg-rose-500" :
                      it._direction === 'received' && isPending ? "bg-[var(--violet)]" : "bg-gray-300"
                    }`} />

                    <div className="space-y-2 pl-3 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider ${
                          it._type === 'campaign_app' ? 'bg-[#7C3AED]/10 text-[#7C3AED]' :
                          it._type === 'wave' ? 'bg-pink-500/10 text-pink-500' :
                          'bg-sky-500/10 text-sky-500'
                        }`}>
                          {it._type === 'campaign_app' ? (isBrand ? 'Application' : 'Campaign Pitch') :
                           it._type === 'wave' ? 'Campaign Invite' : it.is_ugc ? 'UGC order' /* v416 (QA U18) */ : (isBrand ? 'Deal' : 'Direct Handshake')}
                        </span>
                        {!isBrand && ( /* v415: no raw "sent"/"received" tag for brands */
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold uppercase tracking-wider ${
                          it._direction === 'received' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'
                        }`}>
                          {it._direction}
                        </span>
                        )}
                      </div>

                      <h3 className="font-display text-lg text-[var(--text-primary)] font-bold tracking-tight">
                        {it.title}
                      </h3>

                      {/* v415: brands see who the deal is with; the pitch is shown once (below), not twice */}
                      {isBrand ? (
                        <div className="text-sm text-[var(--text-secondary)] font-medium">With: <span className="font-bold text-[var(--text-primary)]">{it.brandName}</span></div>
                      ) : (
                      <div className="text-sm text-[var(--text-secondary)] font-medium">
                        {it.subtitle}
                      </div>
                      )}

                      {it.pitch && (
                        <p className="text-xs text-[var(--text-tertiary)] max-w-2xl bg-[var(--bg-elevated)] px-4 py-2.5 rounded-xl border border-[var(--border-default)] leading-relaxed italic">
                          &ldquo;{it.pitch}&rdquo;
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-tertiary)] mt-2">
                        {it.payout > 0 && (
                          <div className="font-semibold text-emerald-600 flex items-center gap-1 font-mono">
                            {isBrand ? "Amount" : "Payout"}: ₹{it.payout?.toLocaleString("en-IN")}
                          </div>
                        )}
                        {/* v330: IST, Indian format; nothing instead of "Invalid Date" */}
                        {it.date && !Number.isNaN(new Date(it.date).getTime()) && (
                          <div className="font-mono">{new Date(it.date).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).replace(/\b(am|pm)\b/g, (s) => s.toUpperCase())}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0 pl-3 md:pl-0">
                      <div className="flex items-center gap-3">
                        <span className={`text-[11px] px-3 py-1 rounded-xl font-bold border ${
                          isCompleted || isTransitioning ? "bg-emerald-50 text-emerald-600 border-emerald-200" : 
                          isDeclined ? "bg-rose-50 text-rose-500 border-rose-200" :
                          "bg-[#F5F0FF] text-[var(--violet)] border-[#DDD6FE]"
                        }`}>
                          {isTransitioning ? "Accepting…" : (() => { const t = String(it.status || "").replace(/_/g, " ").toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); })() /* v330: no raw IN_PROGRESS; v415: sentence case */}
                        </span>

                        {/* Direct actions for received proposals */}
                        {it._type === 'collab' && it._direction === 'received' && it.status === 'pending' && !isTransitioning && (
                          <div className="flex items-center gap-2">
                            {/* v330: Decline left, Accept (primary) right */}
                            <button 
                              onClick={() => act(it.id, "decline")} 
                              disabled={Boolean(busyId)} /* v416 (CR23) */
                              className="px-3.5 py-1.5 border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {busyId === it.id ? "Declining…" : "Decline"}
                            </button>
                            <button 
                              onClick={() => act(it.id, "accept", it.brandName)} 
                              className="px-3.5 py-1.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                            >
                              Accept
                            </button>
                          </div>
                        )}

                        {it._type === 'campaign_app' && it._direction === 'received' && it.status === 'pending' && user?.role === 'brand' && !isTransitioning && (
                          <div className="flex items-center gap-2">
                            {/* v330: Decline left, Accept (primary) right */}
                            <button 
                              onClick={() => actOnApplication(it.raw.campaign_id, it.id, "reject")} /* Session 58: the server takes "reject" */ 
                              disabled={Boolean(busyId)} /* v416 (CR23) */
                              className="px-3.5 py-1.5 border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-xl transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <Ban size={13} /> {busyId === it.id ? "Declining…" : "Decline"}
                            </button>
                            <button 
                              onClick={() => actOnApplication(it.raw.campaign_id, it.id, "accept")} 
                              className="px-3.5 py-1.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle size={13} /> Accept
                            </button>
                          </div>
                        )}

                        {/* v415: finished deals had no way to open their chat or details on desktop */}
                        {tab === "history" && (it.thread_id || it.raw?.thread_id) && (
                          <button
                            type="button"
                            onClick={() => navigate(`/chat/${it.thread_id || it.raw?.thread_id}`)}
                            className="px-3.5 py-1.5 bg-[var(--violet)]/10 hover:bg-[var(--violet)]/20 text-[var(--violet)] text-xs font-bold border border-[var(--violet)]/20 rounded-xl transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
                          >
                            <MessageSquare size={13} /> View chat
                          </button>
                        )}
                        {tab === "history" && it._type === 'collab' && (
                          <button
                            type="button"
                            onClick={() => setSelectedDeal(it)}
                            className="px-3.5 py-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--border-default)] text-[var(--text-primary)] text-xs font-bold border border-[var(--border-default)] rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                          >
                            Details
                          </button>
                        )}

                        {!isBrand && (it.status === 'ACCEPTED' || it.status === 'accepted') && (
                          <button 
                            onClick={() => navigate(`/chat/${it.raw?.brand_id || it.raw?.brand_user_id || 'brand'}`)}
                            className="px-3.5 py-1.5 bg-[var(--violet)]/10 hover:bg-[var(--violet)]/20 text-[var(--violet)] text-xs font-bold border border-[var(--violet)]/20 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
                          >
                            <MessageSquare size={13} /> Chat / Negotiate
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      )}

      {/* Deal Detail Drawer Modal for Managing Active Deals */}
      <Presence>{selectedDeal && (
        <DealDetailDrawer key="dealdetaildrawer" 
          deal={selectedDeal}
          onClose={() => setSelectedDeal(null)}
          onSign={handleSignAgreement}
          onSubmitDeliverable={handleSubmitDeliverable}
        />
      )}</Presence>
    </div>
  );
}
