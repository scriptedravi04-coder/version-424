import { ownDb } from "../../lib/ownDb";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { Badge } from "../common/Badge";
import { motion, AnimatePresence, animate } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { revealChildren } from "../../lib/motion";
import PullToRefresh from "../common/PullToRefresh";
import { Eye, Megaphone, ArrowRight, X, Bell, MessageCircle, IndianRupee, CheckCircle, Zap } from "lucide-react";
import { useLoading } from "../../contexts/LoadingContext";
import { useAuth } from "../../contexts/AuthContext";
import NotificationBell from "../shared/NotificationBell";
import TrustedBrandsWidget from "./TrustedBrandsWidget";
import TrustBadgeRotator from "../TrustBadgeRotator";
import { getCampaignStats, getCampaignAvatars } from "../../utils/campaignStats";
import CreatorReviewInvitationModal from "../campaigns/CreatorReviewInvitationModal";
import { useLiveRefresh } from "../../lib/liveRefresh";
import { buildCreatorTasks } from "../../lib/creatorTasks";
import ImportantForYou from "./ImportantForYou";
import PersonPhoto from "../common/PersonPhoto"; // v330
import BrandLogo from "../common/BrandLogo"; // v330


import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
const formatNumber = (num) => {
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return Math.round(num);
};

const AnimatedNumber = ({ value, prefix = "", format = false }) => {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(0, value, {
      duration: 1.5,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v)
    });
    return controls.stop;
  }, [value]);
  
  const formatted = format ? formatNumber(display) : Math.floor(display);
  return <span>{prefix}{formatted}</span>;
};

// Shown only when the admin has published no banner. It used to be four made-up campaigns from
// real brands (boAt, Nike, Mamaearth, mCaffeine) with stock photos (session 27).
const heroBannersList = [
  {
    id: "default_browse",
    title: "Browse live campaigns",
    link: "/campaigns",
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='400' viewBox='0 0 1200 400'><defs><linearGradient id='g' x1='0' x2='1'><stop offset='0' stop-color='%236d3aec'/><stop offset='1' stop-color='%23a855f7'/></linearGradient></defs><rect width='1200' height='400' fill='url(%23g)'/><text x='60' y='190' font-family='Arial' font-size='56' font-weight='700' fill='white'>Browse live campaigns</text><text x='60' y='250' font-family='Arial' font-size='28' fill='white' opacity='0.85'>Apply to brands looking for creators like you</text></svg>",
  },
];

// Session 29: real values only on campaign cards (was a fixed "₹10,000", "1d ago" and a made-up match %).
function campaignBudgetText(c) {
  if (c?.price_range) return c.price_range;
  if (c?.budget_min === 0) return "Barter";
  const min = Number(c?.budget_min || 0), max = Number(c?.budget_max || 0), one = Number(c?.budget || 0);
  const f = (n) => `₹${n.toLocaleString("en-IN")}`;
  if (min && max && max !== min) return `${f(min)} – ${f(max)}`;
  if (min || one) return f(min || one);
  return "Budget not set";
}
function postedAgo(c) {
  const t = new Date(c?.created_at || c?.published_at || "");
  if (Number.isNaN(t.getTime())) return "";
  const days = Math.floor((Date.now() - t.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return t.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }); // v332: IST
}

export default function CreatorDashboard({ user: propUser }) {
  const [kycStatus, setKycStatus] = useState(null);
  const navigate = useNavigate();
  const { startLoading, stopLoading } = useLoading();
  const { user: authUser, logout } = useAuth();
  const user = propUser || authUser;
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [hasPendingDeliveries, setHasPendingDeliveries] = useState(false);
  const [hasApprovedDeals, setHasApprovedDeals] = useState(false);
  const [creatorProfile, setCreatorProfile] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [showKycBanner, setShowKycBanner] = useState(true);
  const [activeDealsTab, setActiveDealsTab] = useState("All");
  const containerRef = useRef(null);
  const [adminPopup, setAdminPopup] = useState(null);

  const [loading, setLoading] = useState(false);
  const [portfolioCount, setPortfolioCount] = useState(null);
  const [showPortfolioModal, setShowPortfolioModal] = useState(false);
  
  const [profile, setProfile] = useState({ profile_views: 0, profile_reach: 0, portfolio: "" });
  const [collabCount, setCollabCount] = useState(0);
  // Session 29: real numbers from GET /dashboard/creator (backend/creatorDashboard.ts).
  const [inEscrow, setInEscrow] = useState(0);
  const [needsAction, setNeedsAction] = useState(0);
  const [monthlyEarnings, setMonthlyEarnings] = useState(0);
  const [openDeals, setOpenDeals] = useState(0);
  const [campaigns, setCampaigns] = useState([]);
  const [realDeals, setRealDeals] = useState([]);
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [reviewingInvite, setReviewingInvite] = useState(null);
  // v332: "loading" | "ok" | "error" — stat cards showed 0 and the lists said "Nothing here" / "No campaigns"
  // before the data arrived and when the request failed.
  const [dashState, setDashState] = useState("loading");
  const [campaignsState, setCampaignsState] = useState("loading");



  const handleDismissPopup = async () => {
    if (!adminPopup) return;
    const notifId = adminPopup.notif_id || adminPopup.id;
    try {
      await api.post(`/notifications/${notifId}/read`);
      setAdminPopup(null);
      toast.success("Notification acknowledged");
    } catch (e) {
      console.error(e);
      setAdminPopup(null);
    }
  };

  // Session 33 (Ravi's "Dashboard — new layout"): every task — deadlines, direct invites, KYC,
  // profile — rotates in ONE "Important for you" card (src/lib/creatorTasks.js, shared with mobile).
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNowTick(Date.now()), 60000); return () => clearInterval(t); }, []);
  const importantTasks = React.useMemo(() => buildCreatorTasks({
    invitations: pendingInvitations,
    work: realDeals,
    kycStatus,
    kycVerified: Boolean(user?.kyc_verified),
    profile: creatorProfile ? { picture: user?.picture || user?.photo, ...creatorProfile } : null,
    profileLoaded,
    portfolioCount,
    now: nowTick,
    workRoute: (w) => (w.kind === "ugc"
      ? `/creator/ugc/orders?tab=manage&orderId=${encodeURIComponent(w.id)}`
      : (w.thread_id ? `/chat/${encodeURIComponent(w.thread_id)}` : "/collabs")),
  }), [pendingInvitations, realDeals, kycStatus, user?.kyc_verified, creatorProfile, profileLoaded, portfolioCount, nowTick, user?.picture, user?.photo]);
  const handleTaskAction = (task) => {
    if (task?.action?.type === "invite") setReviewingInvite(task.action.invite);
    else if (task?.action?.to) navigate(task.action.to);
  };


  
  const handleCampaignTap = (campaignId, index) => {
     // v332: a campaign without an id opened /campaigns/0 (the list index) — a dead page
     if (campaignId == null || campaignId === "") return;
     // Tracking click
     api.post(`/campaigns/${campaignId}/track-view`).catch(e => console.warn('Failed to track view'));
     navigate(`/campaigns/${campaignId}`);
  };
  
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  
  const [widgetIndex, setWidgetIndex] = useState(0);

  const [banners, setBanners] = useState([]);
  const [currentBannerIdx, setCurrentBannerIdx] = useState(0);

  // Direct invitations load on their own, first — they used to wait behind seven other requests,
  // so an invite could take a long time to show in "Important for you" (session 27).
  const loadInvitations = useCallback(async () => {
    if (!user) return;
    try {
      const { data: invRes } = await api.get('creators/invitations', { bypassCache: true });
      const list = invRes?.invitations || (Array.isArray(invRes) ? invRes : []);
      setPendingInvitations(list.filter((i) => i.status === "pending_creator_acceptance"));
    } catch (err) {
      console.warn("Failed to load creator invitations:", err);
    }
  }, [user]);

  useEffect(() => {
    loadInvitations();
    const onFocus = () => { if (!document.hidden) loadInvitations(); };
    const onInvite = () => loadInvitations();
    window.addEventListener("focus", onFocus);
    window.addEventListener("ybex:invitation", onInvite);
    const t = setInterval(onFocus, 60000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("ybex:invitation", onInvite);
      clearInterval(t);
    };
  }, [loadInvitations]);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      // Session 29: one honest summary instead of the public profile route (that route adds +1
      // profile view on every call — the dashboard was counting the creator's own reloads),
      // /collabs (read a field that does not exist → ₹0 on every card) and /transactions
      // ("Monthly Earnings" was every payment held in escrow). Numbers are NOT reset to 0 before
      // the call, so a silent live refresh no longer flashes ₹0.
      const { data: dash } = await api.get('dashboard/creator', { bypassCache: true }).catch(() => ({ data: null }));
      setDashState((prev) => (dash ? "ok" : prev === "ok" ? "ok" : "error")); // v332: keep old numbers on a silent refresh failure
      if (dash) {
        const c = dash.counts || {};
        const e = dash.earnings || {};
        setProfile((p) => ({ ...p, profile_views: c.profile_views ?? 0 }));
        setOpenDeals(c.open_work || 0);
        setNeedsAction(c.needs_your_action || 0);
        setMonthlyEarnings(e.released_this_month || 0);
        setInEscrow(e.in_escrow || 0);
        const work = [...(dash.open_work || []), ...(dash.recent_completed || [])];
        setRealDeals(work);
        setHasPendingDeliveries(work.some((w) => w.stage_group !== "ended" && w.creator_action));
        setHasApprovedDeals((c.accepted_applications || 0) > 0);
      }

      // Session 33: real profile fields for the "Complete your profile" task (% + what's missing).
      const { data: me } = await api.get('creators/me').catch(() => ({ data: undefined }));
      if (me !== undefined) { setCreatorProfile(me?.profile || me || null); setProfileLoaded(true); }

      const { data: bannersData } = await api.get('banners').catch(() => ({ data: [] }));
      if (Array.isArray(bannersData)) setBanners(bannersData);
      
      const { data: camps, failed: campsFailed } = await api.get('campaigns').catch(() => ({ data: null, failed: true }));
      setCampaignsState((prev) => (campsFailed ? (prev === "ok" ? "ok" : "error") : "ok")); // v332
      if (camps) {
        const arr = Array.isArray(camps) ? camps : [];
        const filtered = arr.filter(c => c.status === "live" || c.stage === "Live" || c.stage === "Under Review");
        setCampaigns(filtered.reverse().slice(0, 5));
      }

      // Fetch operational tasks data
      const { data: threadsData } = await api.get('chat/v2/threads').catch(() => ({ data: [] }));
      if (Array.isArray(threadsData)) {
        const unreadThreads = threadsData.filter(t => t.unread_creator || t.unread === true || (t.last_message_sender && t.last_message_sender !== user.user_id && !t.read));
        setHasUnreadMessages(unreadThreads.length > 0);
        setUnreadCount(unreadThreads.length);
      }

      const { data: notifData } = await api.get('notifications').catch(() => ({ data: [] }));
      if (Array.isArray(notifData)) {
        const unreadNotifs = notifData.filter(n => !n.read);
        const adminCustomMsg = unreadNotifs.find(n => n.type === 'admin_custom_message');
        if (adminCustomMsg) {
          setAdminPopup(adminCustomMsg);
        }
        if (unreadNotifs.length > 0) {
          const hasChatNotif = unreadNotifs.some(n => n.type === 'message' || n.type === 'chat' || n.message?.toLowerCase().includes('message'));
          if (hasChatNotif) {
            setHasUnreadMessages(true);
          }
        }
      }

      if (supabase && user) {
        const { count, error: countErr } = await supabase
          .from('creator_portfolio_items')
          .select('*', { count: 'exact', head: true })
          .eq('creator_id', user.user_id);
        if (!countErr && count !== null) {
          setPortfolioCount(count);
        } else {
          setPortfolioCount(0);
        }
      }

      const { data: kycRes } = await api.get('verifications/me').catch(() => ({ data: null }));
      if (kycRes) {
        setKycStatus(kycRes.status);
      }
    } catch (e) {
      console.warn('Silent fail Dashboard shell', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Session 31 (speed): the 60 s poll that downloaded ALL campaigns is gone. New campaigns already
  // reach this page through useLiveRefresh("campaign") below and on every load.
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Session 28: KYC decision, shortlist, new deal, offer → the dashboard updates without a refresh.
  useLiveRefresh(() => loadData(), { types: ["kyc", "verification", "application", "shortlist", "deal", "offer", "chat_unlocked", "campaign"], intervalMs: 0 });

  const isNewUser = !user?.kyc_verified || !user?.bank_details_added || !user?.profile_completed;
  const heroBanners = banners.filter(b => 
    b.placement === "Dashboard Hero Carousel" && 
    b.status === "Live" && 
    (b.type === "Common" || b.type === "Influencer")
  ).slice(0, 5);
  const displayBanners = heroBanners.length > 0 ? heroBanners : heroBannersList;

  useEffect(() => {
    if (displayBanners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentBannerIdx(prev => (prev + 1) % displayBanners.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [displayBanners.length]);

  useEffect(() => {
    const timer = setInterval(() => {
      setWidgetIndex((prev) => (prev + 1) % 3);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const generateChartData = () => {
    const totalViews = Number(profile?.profile_views) || 0;
    const totalInterest = Number(openDeals) || 0;
    if (totalViews === 0 && totalInterest === 0) {
      return [
        { name: 'Week 1', profile_views: 0, collab_interest: 0 },
        { name: 'Week 2', profile_views: 0, collab_interest: 0 },
        { name: 'Week 3', profile_views: 0, collab_interest: 0 },
        { name: 'Week 4', profile_views: 0, collab_interest: 0 }
      ];
    }
    return [
      { name: 'Week 1', profile_views: Math.round(totalViews * 0.15), collab_interest: Math.round(totalInterest * 0.15) },
      { name: 'Week 2', profile_views: Math.round(totalViews * 0.25), collab_interest: Math.round(totalInterest * 0.25) },
      { name: 'Week 3', profile_views: Math.round(totalViews * 0.30), collab_interest: Math.round(totalInterest * 0.30) },
      { name: 'Week 4', profile_views: Math.round(totalViews * 0.30), collab_interest: Math.round(totalInterest * 0.30) }
    ];
  };

  const CHART_DATA = generateChartData();

  useEffect(() => {
    if (!loading && containerRef.current) {
      // Session 37: blocks fade in once data is ready (shared motion, GSAP removed)
      return revealChildren(containerRef.current.querySelectorAll(".gsap-reveal"));
    }
  }, [loading]);

  if (loading) {
    return (
      <div className="w-full max-w-none animate-pulse bg-[var(--bg-base)] min-h-screen">
        {/* Header skeleton */}
        <div className="flex justify-between items-center mb-8 pt-6">
          <div className="flex items-center gap-3 w-full">
            <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-zinc-800 shrink-0"></div>
            <div className="h-6 bg-gray-200 dark:bg-zinc-800 rounded w-1/4"></div>
          </div>
          <div className="h-10 bg-gray-200 dark:bg-zinc-800 rounded-xl w-32"></div>
        </div>
        {/* Main grid skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left / center column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="h-44 bg-gray-200 dark:bg-zinc-800 rounded-3xl"></div>
            <div className="grid grid-cols-2 gap-4">
              {[1, 2].map(i => (
                <div key={i} className="h-28 bg-gray-200 dark:bg-zinc-800 rounded-3xl"></div>
              ))}
            </div>
            <div className="h-6 bg-gray-200 dark:bg-zinc-800 rounded w-1/3 mt-8"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2].map(i => (
                <div key={i} className="h-48 bg-gray-200 dark:bg-zinc-800 rounded-3xl"></div>
              ))}
            </div>
          </div>
          {/* Right column */}
          <div className="space-y-6">
            <div className="h-80 bg-gray-200 dark:bg-zinc-800 rounded-3xl"></div>
            <div className="h-44 bg-gray-200 dark:bg-zinc-800 rounded-3xl"></div>
          </div>
        </div>
      </div>
    );
  }

  const rawName = user?.name || user?.full_name || user?.fullName || user?.firstName || user?.first_name || user?.display_name || user?.displayName || authUser?.name || authUser?.full_name || user?.email?.split('@')[0] || "Creator";
  const cleanName = typeof rawName === 'string' ? rawName.trim() : String(rawName || '').trim();
  const firstName = cleanName ? (cleanName.split(/\s+/)[0] || cleanName) : "Creator";
  // v330: no random stranger's photo (pravatar) when the creator has none — PersonPhoto shows initials.
  const userPhoto = user?.photo || user?.picture || user?.avatar || authUser?.photo || authUser?.picture || authUser?.avatar || "";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <PullToRefresh
      onRefresh={() => Promise.all([loadData(), loadInvitations()])}
      pullingText="Pull to refresh feed"
      releaseText="Release to sync collaborations"
      refreshingText="Fetching latest collaboration updates..."
      successText="Collaborations & deals synced"
      className="w-full"
    >
      <div ref={containerRef} className="w-full max-w-none flex flex-col pb-8" data-testid="creator-dashboard">
      {/* Header Area */}
      <div className="hidden md:flex mb-6 justify-between items-center relative z-40 gsap-reveal">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden border border-[var(--border-default)] relative shrink-0">
             <PersonPhoto src={userPhoto} name={user?.name || authUser?.name} alt="Avatar" className="w-full h-full object-cover" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight">
              {greeting}, {firstName}
            </h2>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <p className="text-sm text-gray-500">
                Ready to find your next collaboration today?
              </p>
              <span className="hidden sm:inline text-gray-500 font-bold">•</span>
              <TrustBadgeRotator page="creatorDashboard" className="hidden md:block" />
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button 
            onClick={() => navigate("/chat")}
            className="w-10 h-10 rounded-full bg-[var(--bg-card)] border border-[var(--border-default)] flex items-center justify-center relative shadow-sm hover:bg-[var(--bg-elevated)] transition-all cursor-pointer"
            title="Go to Inbox"
            aria-label={unreadCount > 0 ? `Inbox, ${unreadCount} unread` : "Inbox"}
          >
            <MessageCircle className="w-[18px] h-[18px] text-[var(--text-tertiary)]" />
            {unreadCount > 0 && (
              <div className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 bg-[var(--violet)] rounded-full text-white text-[10px] font-bold flex items-center justify-center border border-white animate-pulse">
                {unreadCount > 9 ? "9+" : unreadCount}{/* v332: 2-digit counts spilled out of the dot */}
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Session 34: header back to the pre-v237 one (Ravi). Banner + "Important for you" stay. */}
      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-5 mb-6 lg:h-[300px]" data-testid="creator-dash-hero">
        <div className="relative min-w-0 rounded-[24px] overflow-hidden bg-white border border-[#ECECF2] aspect-[1600/560] lg:aspect-auto lg:h-full group">
          {displayBanners.map((banner, idx) => (
            <Link
              key={banner.id || idx}
              to={banner.link || "/campaigns"}
              className={`absolute inset-0 bg-white transition-opacity duration-700 ${idx === currentBannerIdx ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"}`} /* v402: solid back — transparent banner art showed the other slide's text through it */
            >
              <img
                src={banner.image_url || banner.imgUrl || banner.image}
                alt={banner.title || "Banner"}
                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
                referrerPolicy="no-referrer"
              />
            </Link>
          ))}
          {displayBanners.length > 1 && (
            <div className="absolute bottom-3 left-4 flex items-center gap-1.5 z-20">
              {displayBanners.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCurrentBannerIdx(idx); }}
                  className={`h-1.5 rounded-full transition-all duration-300 shadow-sm ${idx === currentBannerIdx ? "w-5 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"}`}
                  aria-label={`Banner ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
        <div className="min-w-0 h-[300px] lg:h-full">
          <ImportantForYou tasks={importantTasks} onAction={handleTaskAction} paused={Boolean(reviewingInvite)} loading={!profileLoaded && importantTasks.length === 0} />
        </div>
      </section>

      {/* Desktop Stats Row: exactly 3 cards */}
      <div className="hidden sm:grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 gsap-reveal">
         {[
           // Session 29: no invented trends or sparklines — only what the server returns.
           { label: "Profile Views", value: profile.profile_views || 0, format: true, note: null },
           { label: "Open Deals", value: openDeals, note: needsAction > 0 ? `${needsAction} need your action` : null },
           { label: "Earned This Month", value: monthlyEarnings, prefix: "₹", format: true, note: inEscrow > 0 ? `₹${Number(inEscrow).toLocaleString("en-IN")} in a secure payment hold` : null },
         ].map((s, i) => (
           <div key={i} className="bg-white border border-[var(--border-default)] rounded-[20px] pt-4.5 px-5 pb-4 shadow-sm relative overflow-hidden group min-h-[120px] flex flex-col justify-between hover:border-[var(--border-strong)] transition-all">
             
             <div className="relative z-10 flex flex-col items-start">
               <span className={'text-[10px] font-bold uppercase tracking-wider'}>{s.label}</span>
               <div className={`font-mono font-bold tracking-tight text-lg my-1`}>
                 {/* v332: a dash while loading / if it failed, not a flash of 0 / ₹0 */}
                 {dashState === "ok" ? <AnimatedNumber value={s.value} format={s.format} prefix={s.prefix} /> : <span className={dashState === "loading" ? "inline-block w-12 h-5 rounded bg-gray-100 animate-pulse align-middle" : ""}>{dashState === "loading" ? "" : "—"}</span>}
               </div>
               
               {s.note && (
                 <div className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-50 border border-[var(--border-default)] text-gray-600 text-[10px] font-semibold">
                   {s.note}
                 </div>
               )}
             </div>
             
           </div>
         ))}
      </div>
      
      <TrustedBrandsWidget userType="creator" />

      {/* Main Content Area */}
      <div className="flex flex-col gap-8 gsap-reveal">
        
        {/* Left Column (Recommended Campaigns) */}
        <div className="w-full flex flex-col gap-6">
          <div className="flex justify-between items-center mb-2">
             <div className="flex flex-col">
               <h3 className={'text-lg font-bold tracking-tight'}>Recommended Campaigns</h3>
               <span className={'hidden md:block text-sm text-gray-500'}>by Brands & Agencies</span>
             </div>
             <Link to="/campaigns" className={`font-bold text-sm text-[var(--violet)] hover:underline flex items-center gap-1 bg-[var(--bg-elevated)] px-4 py-2 rounded-full transition-colors border border-[var(--border-default)]`}>View all <ArrowRight size={14} className="opacity-80"/></Link>
          </div>
          
          <div className="flex overflow-x-auto gap-4 pb-4 pr-6 snap-x snap-mandatory hide-scrollbar">
             {campaigns.length === 0 && campaignsState === "loading" ? (
                // v332: placeholder cards while campaigns load (was "No Recommended Campaigns Yet")
                [0, 1].map((k) => <div key={k} className="snap-start shrink-0 w-[80vw] max-w-[320px] md:max-w-none md:w-[400px] h-[180px] md:h-[260px] rounded-2xl md:rounded-[1.5rem] bg-[var(--bg-elevated)] animate-pulse" />)
             ) : campaigns.length === 0 && campaignsState === "error" ? (
                <div className="py-10 text-center bg-[var(--bg-elevated)]/50 rounded-[1.5rem] border border-dashed border-[var(--border-default)] flex flex-col items-center justify-center p-6 gap-2 w-full">
                   <p className="font-bold text-sm">Couldn't load campaigns right now</p>
                   <button type="button" onClick={() => { setCampaignsState("loading"); loadData(); }} className="mt-1 h-10 px-5 rounded-full border border-[var(--border-default)] bg-white text-sm font-semibold">Try again</button>
                </div>
             ) : campaigns.length === 0 ? (
                <div className={`py-12 text-center text-[11px] font-medium bg-[var(--bg-elevated)]/50 rounded-[1.5rem] border border-dashed border-[var(--border-default)] flex flex-col items-center justify-center p-6 gap-2 w-full`}>
                   <span className="text-2xl">⚡</span>
                   <p className={'font-bold text-sm'}>No Recommended Campaigns Yet</p>
                   <p className={'hidden md:block text-sm text-gray-500'}>
                      We don't have any active campaigns matching your profile right now. Check back soon for new brand collaborations!
                   </p>
                </div>
             ) : (campaigns).map((c, i) => (
                 <div key={c.campaign_id || c.id || i} onClick={() => handleCampaignTap(c.campaign_id || c.id, i)} className="snap-start shrink-0 w-[80vw] max-w-[320px] md:max-w-none md:w-[400px] max-md:h-[180px] bg-[var(--bg-card)] rounded-2xl md:rounded-[1.5rem] border border-[var(--border-default)] p-4 md:p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col justify-between cursor-pointer hover:border-[var(--violet)]/50 transition-colors relative overflow-hidden">
                    
                    {c.match_score != null && (
                    <div className={`absolute top-0 right-0 bg-[var(--violet)]/10 text-[10px] font-bold uppercase tracking-wider text-[var(--text-primary)] px-2 md:px-3 py-1 md:py-1.5 rounded-bl-xl border-b border-l border-[var(--violet)]/20 flex items-center gap-1 z-10`}>
                       <Zap size={12} className="fill-[var(--violet)] opacity-80" /> {c.match_score}% Match
                    </div>
                    )}
                    <div className="flex justify-between items-start mb-2 md:mb-4">
                       <div className="flex gap-2.5 md:gap-3">
                          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden shrink-0 border border-[var(--border-default)]">
                             {/* v330: real logo or the brand's initial — was a stock photo of a stranger */}
                             <BrandLogo src={c.brand_logo} name={c.brand_name || c.company || "Brand"} size={48} radius={9999} className="!w-full !h-full" />
                          </div>
                          <div>
                             <h4 className={`font-semibold md:font-bold text-[15px] md:text-sm line-clamp-2 leading-tight pr-16`}>{c.title}</h4>
                             <p className={`text-[12px] md:text-xs text-gray-500 md:mt-0.5 flex items-center gap-1`}>
                               by {c.brand_name || c.company || 'Brand'} <CheckCircle size={10} className="md:w-3 md:h-3 text-emerald-600 opacity-80" />
                             </p>
                             <p className={`hidden md:block text-[11px] font-medium mt-1`}>{postedAgo(c)}</p>
                          </div>
                       </div>
                    </div>
                    
                    {/* Mobile stat row */}
                    <div className="md:hidden flex items-center gap-2 text-[12px] font-medium text-gray-600 bg-gray-50/80 px-2 py-1.5 rounded-lg border border-gray-100">
                       <span className="font-semibold text-gray-900 font-mono">
                          {campaignBudgetText(c)}
                       </span>
                       <span className="text-gray-300">·</span>
                       <span className="truncate flex items-center gap-1">
                          <Megaphone size={12} className="text-gray-500" /> {c.brand_type || c.company || c.brand_name || 'Brand'}
                       </span>
                    </div>

                    {/* v332: no made-up "Looking for" text when the brand wrote nothing */}
                    <div className="hidden md:block mb-4 flex-1">
                       {(c.description || c.targetAudience || (Array.isArray(c.categories) && c.categories.length > 0)) ? (
                         <>
                           <p className={`text-[10px] font-bold uppercase tracking-wider mb-1`}>Looking for</p>
                           <p className={`text-sm text-gray-500 line-clamp-2 leading-relaxed`}>
                              {c.description || c.targetAudience || c.categories.join(", ")}
                           </p>
                         </>
                       ) : null}
                    </div>
                   
                   <div className="hidden md:flex flex-wrap items-center gap-6 text-xs mb-5">
                      <div className="flex items-center gap-3">
                         <span className="flex items-center justify-center w-[42px] h-[42px] text-[var(--text-primary)] bg-[var(--bg-card)] border-[2.5px] border-[var(--text-primary)] shadow-sm rounded-t-[20px] rounded-bl-[20px] rounded-br-sm"><IndianRupee size={18} strokeWidth={2.5}/></span>
                         <div>
                            <div className={`text-[10px] font-bold uppercase tracking-wider mb-0.5`}>Per Influencer</div>
                            <div className={'font-mono tracking-tight text-sm'}>{campaignBudgetText(c)}</div>
                         </div>
                      </div>
                      <div className="flex items-center gap-3">
                         <span className="flex items-center justify-center w-[42px] h-[42px] text-[var(--text-primary)] bg-[var(--bg-card)] border-[2.5px] border-[var(--text-primary)] shadow-sm rounded-t-[20px] rounded-bl-sm rounded-br-[20px]"><Megaphone size={18} strokeWidth={2.5}/></span>
                         <div>
                            <div className={`text-[10px] font-bold uppercase tracking-wider mb-0.5`}>Brand collab with</div>
                            <div className={`font-bold text-sm line-clamp-1`}>{c.company || c.brand_name || 'Brand'}</div>
                         </div>
                      </div>
                   </div>

                   <div className={`border-t border-[var(--border-default)] pt-2 md:pt-3 flex items-center gap-2 text-[11px] font-medium`}>
                      {(() => {
                         const stats = getCampaignStats(c);
                         const count = stats.applied;
                         let displayAvatars = [];
                         if (c.applicants && c.applicants.length > 0) {
                            displayAvatars = c.applicants.slice(0, Math.min(count, 4)).map(a => a.creator_photo || a.photo);
                         } else {
                            displayAvatars = getCampaignAvatars(c, count, 4);
                         }
                         return (
                           <>
                             <span className="flex items-center gap-1.5"><Eye size={14} className="animate-eye-blink"/> {stats.views} Views</span>
                             <span className="w-1 h-1 bg-[var(--border-default)] rounded-full"></span>
                             <div className="flex items-center gap-1.5 text-[var(--violet)] bg-[var(--violet)]/10 px-2 py-1 rounded-md">
                                <div className="hidden md:flex -space-x-1.5 mr-0.5">
                                   {displayAvatars.map((avatarUrl, idx) => (
                                        <img key={idx} className="w-4 h-4 rounded-full border border-[var(--bg-card)] shadow-sm object-cover" src={avatarUrl} alt="avatar" />
                                   ))}
                                </div>
                                <span>{count}+ creators applied</span>
                             </div>
                           </>
                         );
                      })()}
                      <span className="md:hidden ml-auto text-[var(--violet)] font-bold text-[10px] uppercase">View Details</span>
                   </div>
                </div>
             ))}
          </div>

          <div className="mt-8 flex justify-between items-center mb-2">
             <h3 className={'text-base font-bold'}>Your Active Deals</h3>
             <Link to="/collabs" className={`font-bold text-sm text-sm hover:underline`}>View All</Link>
          </div>
          <div className="flex gap-1.5">
            {[
              // Session 29 (Ravi): Active = only open work. Completed is its own tab, never mixed in.
              { id: "All", label: "All active" },
              { id: "Needs You", label: "Needs you" },
              { id: "Pending Review", label: "With brand" },
              { id: "Completed", label: "Completed" }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveDealsTab(tab.id)}
                className={`text-[12px] font-medium px-3 py-1.5 min-h-[34px] rounded-lg transition-all ${
                  activeDealsTab === tab.id
                    ? "bg-[var(--violet)] text-white shadow-sm"
                    : "bg-white text-[var(--text-tertiary)] border border-[var(--border-default)] hover:bg-[var(--bg-elevated)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Active Deals Cards Grid */}
          {(() => {
            // Session 29: cards come from GET /dashboard/creator. Real amount + real stage, no stock photo.
            const mappedDeals = realDeals.map(d => ({
              id: `${d.kind}_${d.id}`,
              thread_id: d.thread_id,
              brand: d.brand_name || "Brand",
              campaign: d.title || (d.kind === "ugc" ? "UGC order" : "Campaign"),
              status: d.stage_group === "ended" ? "Completed" : d.stage_group === "brand_review" ? "Pending Review" : "In Progress",
              stageLabel: d.stage_label,
              action: d.creator_action,
              amount: d.amount != null && d.amount !== "" && Number.isFinite(Number(d.amount)) ? `₹${Number(d.amount).toLocaleString("en-IN")}` : "—", // v332: no ₹NaN
              amountLabel: d.amount_kind === "your_payout" ? "Your payout" : "Agreed fee",
              logo: d.brand_logo || null,
            }));

            const filteredDeals = mappedDeals.filter(deal => {
              if (activeDealsTab === "Completed") return deal.status === "Completed";
              if (deal.status === "Completed") return false;
              if (activeDealsTab === "All") return true;
              if (activeDealsTab === "Needs You") return Boolean(deal.action);
              return deal.status === activeDealsTab;
            });

            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                {filteredDeals.length > 0 ? (
                  filteredDeals.map((deal) => (
                    <div
                      key={deal.id}
                      onClick={() => deal.thread_id && navigate(`/chat/${deal.thread_id}`)}
                      className={`p-3.5 bg-white border border-[var(--border-default)] rounded-xl flex items-center justify-between hover:border-[var(--border-strong)] transition-all shadow-sm ${deal.thread_id ? "cursor-pointer" : ""}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg overflow-hidden border border-[var(--border-default)] shrink-0 bg-gray-50 flex items-center justify-center text-xs font-bold text-gray-500">
                          <BrandLogo src={deal.logo} name={deal.brand} size={36} radius={8} className="!w-full !h-full" />{/* v330: broken logo falls back to the initial */}
                        </div>
                        <div className="min-w-0">
                          <h4 className={`font-bold text-sm text-xs truncate`}>{deal.brand}</h4>
                          <p className={`text-[11px] font-medium mt-0.5 truncate`}>{deal.campaign}</p>
                          <p className="text-[10px] mt-0.5 truncate text-gray-500">{deal.action || deal.stageLabel}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 pl-2">
                        <p className={`font-mono tracking-tight text-sm text-xs`} title={deal.amountLabel}>{deal.amount}</p>
                        <p className="text-[11px] text-gray-500 mb-0.5">{deal.amountLabel}</p>
                        <Badge variant={deal.status}>{deal.status}</Badge>
                      </div>
                    </div>
                  ))
                ) : dashState === "loading" ? (
                  // v332: skeleton while deals load (was "Nothing here right now.")
                  [0, 1, 2].map((k) => <div key={k} className="h-[78px] rounded-xl bg-[var(--bg-elevated)] animate-pulse" />)
                ) : dashState === "error" ? (
                  <div className="col-span-1 md:col-span-3 py-8 text-center text-[12px] text-[var(--text-tertiary)] bg-[var(--bg-elevated)] rounded-xl border border-dashed border-[var(--border-default)]">
                    Couldn't load your deals right now.
                    <button type="button" onClick={() => { setDashState("loading"); loadData(); }} className="mt-3 mx-auto block h-10 px-5 rounded-full border border-[var(--border-default)] bg-white text-sm font-semibold text-[var(--text-primary)]">Try again</button>
                  </div>
                ) : (
                  <div className="col-span-1 md:col-span-3 py-8 text-center text-[12px] text-[var(--text-tertiary)] bg-[var(--bg-elevated)] rounded-xl border border-dashed border-[var(--border-default)]">
                    {activeDealsTab === "Completed" ? "No completed deals yet." : "Nothing here right now."}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Dashboard Footer Logout Block REMOVED */}
        </div>


      


      {/* Admin Custom Message Popup */}
      <AnimatePresence>
        {adminPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleDismissPopup}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-lg bg-white border border-gray-100 rounded-3xl p-6 shadow-2xl z-10 font-sans overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#A855F7] to-[#C084FC]" />
              
              <div className="flex items-start gap-4 mb-4">
                <div className="p-3 bg-[#F5F0FF] rounded-2xl text-[var(--text-primary)] shrink-0">
                  <Bell size={24} className="animate-bounce" />
                </div>
                <div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider block mb-1`}>Official Notification</span>
                  <h4 className={'text-xl font-bold tracking-tight'}>Message from YBEX Admin</h4>
                </div>
                <button aria-label="Close" /* v330: icon-only button */
                  onClick={handleDismissPopup}
                  className="ml-auto p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4 mb-6">
                <p className={`text-sm text-gray-700 leading-relaxed whitespace-pre-wrap`}>
                  {adminPopup.message}
                </p>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button 
                  onClick={handleDismissPopup}
                  className={`w-full sm:w-auto px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-bold text-sm rounded-xl transition-colors shadow-md`}
                >
                  Got it, thanks!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Portfolio Add Modal */}
      <AnimatePresence>
        <Presence>{showPortfolioModal && (
          <PopupBackdrop className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
            <PopupPanel kind="modal"
              className="bg-white rounded-2xl border border-[var(--border-default)] max-w-md w-full p-6 shadow-2xl relative"
            >
              <button
                onClick={() => setShowPortfolioModal(false)}
                className="absolute top-4 right-4 text-gray-500 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>

              <h3 className={`text-base font-bold mb-1 flex items-center gap-1.5`}>
                 Add a sample of past work
              </h3>
              <p className={`text-[11px] font-medium mb-4`}>
                Provide a link to any previous work or brand promotion you have successfully delivered.
              </p>

              <form onSubmit={async (e) => {
                e.preventDefault();
                const url = e.currentTarget.elements.contentUrl.value.trim();
                const brand = e.currentTarget.elements.brandName.value.trim();
                const desc = e.currentTarget.elements.description.value.trim();

                if (!url) {
                  toast.error("Please provide a valid content URL.");
                  return;
                }

                setLoading(true);
                try {
                  let platform = "other";
                  if (url.toLowerCase().includes("instagram.com") || url.toLowerCase().includes("instagram.in")) {
                    platform = "instagram";
                  } else if (url.toLowerCase().includes("youtube.com") || url.toLowerCase().includes("youtu.be")) {
                    platform = "youtube";
                  }

                  const { error } = await ownDb.from("creator_portfolio_items").insert({
                    creator_id: user.user_id,
                    content_url: url,
                    brand_name: brand || null,
                    description: desc || null,
                    platform,
                    views: 0,
                    engagement_rate: 0
                  });

                  if (error) {
                    toast.error("Error saving past work: " + error.message);
                  } else {
                    toast.success("Past work sample saved! 🚀");
                    setPortfolioCount(1); // Hide nudge
                    setShowPortfolioModal(false);
                  }
                } catch (err) {
                  toast.error(err?.response?.data?.error || err?.response?.data?.detail || err?.message || "An unexpected error occurred.");
                } finally {
                  setLoading(false);
                }
              }} className="space-y-4">
                <div className="font-sans">
                  <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1`}>
                    Content URL (Required)
                  </label>
                  <input
                    name="contentUrl"
                    type="url"
                    required
                    className={`w-full bg-[var(--bg-elevated)] border border-[#DDD6FE] rounded-xl p-3 text-sm focus:border-[var(--violet)] outline-none`}
                    placeholder="https://instagram.com/reel/... or YouTube link"
                  />
                </div>

                <div className="font-sans">
                  <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1`}>
                    Brand Name (Optional)
                  </label>
                  <input
                    name="brandName"
                    type="text"
                    className={`w-full bg-[var(--bg-elevated)] border border-[#DDD6FE] rounded-xl p-3 text-sm focus:border-[var(--violet)] outline-none`}
                    placeholder="e.g. Nike, boAt"
                  />
                </div>

                <div className="font-sans">
                  <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1`}>
                    Description (Optional)
                  </label>
                  <textarea
                    name="description"
                    rows={2}
                    maxLength={200}
                    className={`w-full bg-[var(--bg-elevated)] border border-[#DDD6FE] rounded-xl p-3 text-sm focus:border-[var(--violet)] outline-none`}
                    placeholder="Brief description of work done (max 200 chars)"
                  />
                </div>

                <div className="flex gap-2 pt-2 justify-end font-sans">
                  <button
                    type="button"
                    onClick={() => setShowPortfolioModal(false)}
                    className={`px-4 py-2 text-[11px] font-medium hover:bg-[#F2F2F7] rounded-lg transition-colors cursor-pointer`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={`px-4 py-2 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer`}
                  >
                    Save Work
                  </button>
                </div>
              </form>
            </PopupPanel>
          </PopupBackdrop>
        )}</Presence>
      </AnimatePresence>

      {/* Creator Review Campaign Invitation Modal */}
      {reviewingInvite && (
        <CreatorReviewInvitationModal
          isOpen={!!reviewingInvite}
          invite={reviewingInvite}
          onClose={() => setReviewingInvite(null)}
          onAccepted={(_inv, threadId) => {
            setReviewingInvite(null);
            loadInvitations();
            if (threadId) {
              navigate(`/chat/${threadId}`);
            } else {
              navigate("/inbox");
            }
          }}
          onDeclined={(_inv) => {
            setReviewingInvite(null);
            loadInvitations();
          }}
        />
      )}

      </div>
    </div>
  </PullToRefresh>
  );
}