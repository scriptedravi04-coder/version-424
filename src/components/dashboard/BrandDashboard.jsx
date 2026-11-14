import { acquireSocket } from "../../lib/sharedSocket";
import { ownDb } from "../../lib/ownDb";
import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Badge } from "../common/Badge";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { motion, AnimatePresence, animate } from "framer-motion";
import { supabase } from "../../lib/supabase";
import { revealChildren } from "../../lib/motion";
import { Bell, X, MessageCircle, AlertTriangle, TrendingUp, TrendingDown, Minus, Clock } from "lucide-react";
import CampaignMiniList from "../campaigns/CampaignMiniList";
import QuickActions from "./QuickActions";
import NotificationBell from "../shared/NotificationBell";
import TrustedBrandsWidget from "./TrustedBrandsWidget";
import TrustBadgeRotator from "../TrustBadgeRotator";
import PullToRefresh from "../common/PullToRefresh";
import { useLiveRefresh } from "../../lib/liveRefresh";
import ImportantForYou from "./ImportantForYou";
import { buildBrandTasks } from "../../lib/brandTasks";
import { EstimateValue } from "../../components/common/AudienceEstimate";
import { initials as initialsOf } from "../../utils/initials"; // v358


const brandHeroBannersList = [
  {
    id: "b1",
    title: "Launch UGC Campaigns",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=600&auto=format&fit=crop",
    link: "/brand/campaigns/create" // Session 53: "/campaigns/create" opened a broken campaign page
  },
  {
    id: "b2",
    title: "Discover Creators",
    image: "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?q=80&w=600&auto=format&fit=crop",
    link: "/explore"
  }
];

// Numeric helper
// v358: Indian units — ₹1,50,000 showed "₹150K" and ₹1 crore "₹10000K"
const formatNumber = (num) => {
  const trim = (x) => x.toFixed(1).replace(/\.0$/, '');
  if (num >= 1e7) return trim(num / 1e7) + 'Cr';
  if (num >= 1e5) return trim(num / 1e5) + 'L';
  if (num >= 1000) return trim(num / 1000) + 'K';
  return Math.round(num);
};

// Animated Number Component exactly matching CreatorDashboard
const AnimatedNumber = ({ value, prefix = "", format = false }) => {
  const [display, setDisplay] = useState(0);
  const missing = value === null || value === undefined || !Number.isFinite(Number(value)); // v416 (M5)
  useEffect(() => {
    if (missing) return undefined;
    const controls = animate(0, value, {
      duration: 1.5,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v)
    });
    return controls.stop;
  }, [value]);
  
  if (missing) return <span title="Couldn't load this number" aria-label="Not available">—</span>;
  const formatted = format ? formatNumber(display) : Math.floor(display);
  return <span>{prefix}{formatted}</span>;
};



export default function BrandDashboard({ user }) {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const [stats, setStats] = useState({
    campaignsCount: null, // v416 (M5): null = not loaded / failed → "—", never a fake 0
    applicantsCount: null,
    dealsCount: null,
    amountSpent: null
  });
  const [campaigns, setCampaigns] = useState([]);
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false); // v416 (M5)
  const hasLoadedOnce = useRef(false);
  const [kycKnown, setKycKnown] = useState(true); // v416 (M5): false when the verification read failed
  const [topPerformers, setTopPerformers] = useState([]);
  
  // KYC and Messaging states
  const [kycVerified, setKycVerified] = useState(false);
  const [kycStatusText, setKycStatusText] = useState("");
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [showKycBanner, setShowKycBanner] = useState(true);

  const [currentStatIndex, setCurrentStatIndex] = useState(0);
  // Session 34: real data for the "Important for you" card (src/lib/brandTasks.js).
  const [taskUgcOrders, setTaskUgcOrders] = useState([]);
  const [taskThreads, setTaskThreads] = useState([]);
  const [taskApplications, setTaskApplications] = useState([]);
  const [brandProfileRow, setBrandProfileRow] = useState(null);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [currentBannerIdx, setCurrentBannerIdx] = useState(0);
  const [brokenBanners, setBrokenBanners] = useState({}); // v416

  // Notification states
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [adminPopup, setAdminPopup] = useState(null);

  const handleDismissPopup = async () => {
    if (!adminPopup) return;
    const notifId = adminPopup.notif_id || adminPopup.id;
    try {
      await api.post(`/notifications/${notifId}/read`);
      setAdminPopup(null);
    } catch (e) {
      console.error(e);
      setAdminPopup(null);
    }
  };

  // v416 (M6): every read starts at once (it was a chain of ~10 awaits, one after another) and the page fills in as
  // the core answers arrive. (M5): a failed read is shown as failed — never as "0 campaigns / ₹0 / KYC unverified".
  const loadSeq = useRef(0);
  const loadData = async ({ silent = false } = {}) => {
    const seq = ++loadSeq.current;
    const live = () => seq === loadSeq.current; // a newer load replaced this one
    const brandUserId = user?.parent_brand_id || user?.user_id || user?.id;
    const nowMs = Date.now();
    const period30Ms = 30 * 24 * 60 * 60 * 1000;
    const period60Ms = 60 * 24 * 60 * 60 * 1000;
    const FAIL = Symbol("fail");
    const settle = (p) => Promise.resolve(p).catch(() => FAIL);
    const opts = silent ? { bypassCache: true } : undefined;
    try {
      const campsP = settle(api.get('campaigns?mine=true', opts).then((r) => (Array.isArray(r?.data) ? r.data : [])));
      const brandMeP = settle(api.get('brands/me', opts).then((r) => r?.data || null));
      const ugcP = settle(api.get('ugc/orders/brand', opts).then((r) => (Array.isArray(r?.data) ? r.data : FAIL)));
      const appsP = settle(api.get('/brands/me/application-stats', opts).then((r) => r?.data?.applications || []));
      const dealsP = settle(api.get('/brands/me/deal-stats', opts).then((r) => r?.data?.deals || []));
      const txnsP = settle(api.get('transactions', opts).then((r) => (Array.isArray(r?.data) ? r.data : [])));
      const kycP = settle(api.get('/verifications/me', opts).then((r) => (r?.data && typeof r.data === "object" ? { status: r.data.status || null } : null)));
      const threadsP = settle(api.get('chat/v2/threads', opts).then((r) => (Array.isArray(r?.data) ? r.data : [])));
      const topP = settle(api.get('brand/top-performers', opts).then((r) => (Array.isArray(r?.data) ? r.data : [])));
      // v415: a slow/blocked direct read must never hold the dashboard — give up after 4 s
      const timeout = (v) => new Promise((r) => setTimeout(() => r(v), 4000));
      const bannersP = settle(Promise.race([supabase.from('banners').select('*').eq('active', true), timeout({ data: null, error: new Error("timeout") })]));
      const campaignsDbP = settle(Promise.race([supabase.from('campaigns').select('campaign_id, created_at').eq('brand_user_id', brandUserId), timeout({ data: null })]));

      // Banners fill in on their own (never hold the page).
      bannersP.then((res) => {
        if (!live()) return;
        const bannersDb = res !== FAIL && !res?.error ? res?.data : null;
        if (!Array.isArray(bannersDb)) { setBanners([]); return; }
        const now = new Date();
        setBanners(bannersDb.filter(b => {
          const target = (b.target_dashboard || '').toLowerCase();
          if (!(target === 'brand' || target === 'all' || target === 'both')) return false;
          if (b.active === false) return false;
          if (b.start_date && new Date(b.start_date) > now) return false;
          if (b.end_date) {
            const endDate = new Date(b.end_date);
            if (typeof b.end_date === 'string' && b.end_date.length === 10) endDate.setHours(23, 59, 59, 999);
            if (endDate < now) return false;
          }
          return true;
        }));
      });

      // Core: campaigns + KYC. When the campaigns read fails on the first load, the page says so (with Retry).
      const [campaignsRes, kycRes, brandRow] = await Promise.all([campsP, kycP, brandMeP]);
      if (!live()) return;
      if (campaignsRes === FAIL) {
        if (!silent && !hasLoadedOnce.current) { setLoadError(true); return; }
        // a background refresh that failed keeps what is on screen
      } else {
        hasLoadedOnce.current = true;
        setLoadError(false);
        setCampaigns(campaignsRes);
      }
      if (kycRes !== FAIL) {
        const status = kycRes?.status || "";
        setKycStatusText(status);
        setKycVerified(String(status).toLowerCase() === "approved");
        setKycKnown(true);
      } else if (!silent) {
        setKycKnown(false); // unknown — no "Verification pending" banner from a failed read
      }
      if (brandRow !== FAIL) setBrandProfileRow(brandRow);
      if (!silent) setLoading(false); // v416 (M6): draw the page now; the rest fills in

      const campaignsList = campaignsRes === FAIL ? campaigns : campaignsRes;
      let brandCreatedAtMs = user?.created_at ? new Date(user.created_at).getTime() : null;
      if (!brandCreatedAtMs && brandRow && brandRow !== FAIL && brandRow.created_at) brandCreatedAtMs = new Date(brandRow.created_at).getTime();
      const hasHistoricalData = brandCreatedAtMs ? (nowMs - brandCreatedAtMs >= period30Ms) : false;

      const [campaignsDbRes, appsRes, dealsRes, txnsRes, threadsRes, ugcRes, topRes] = await Promise.all([campaignsDbP, appsP, dealsP, txnsP, threadsP, ugcP, topP]);
      if (!live()) return;
      const dbCampaignsList = campaignsDbRes !== FAIL && Array.isArray(campaignsDbRes?.data) ? campaignsDbRes.data : [];
      const totalCampaigns = campaignsRes === FAIL ? null : Math.max(campaignsList.length, dbCampaignsList.length);

      const inPeriods = (list, dateOf) => {
        let curr = 0, prev = 0;
        list.forEach((x) => {
          const at = dateOf(x);
          if (!at) return;
          const t = new Date(at).getTime();
          if (t >= nowMs - period30Ms) curr++;
          else if (t >= nowMs - period60Ms) prev++;
        });
        return [curr, prev];
      };
      const [currCampaigns, prevCampaigns] = inPeriods(dbCampaignsList.length > 0 ? dbCampaignsList : campaignsList, (c) => c.created_at);

      const appsList = appsRes === FAIL ? null : appsRes;
      if (appsList) setTaskApplications(appsList);
      const [currApplicants, prevApplicants] = appsList ? inPeriods(appsList, (a) => a.applied_at || a.created_at) : [0, 0];

      const dealsList = dealsRes === FAIL ? null : dealsRes;
      // Session 58: cancelled / expired deals are not "active".
      const ENDED = ['COMPLETED', 'DISPUTED', 'CANCELLED', 'CANCELED', 'EXPIRED', 'PARTIALLY_CANCELLED', 'REJECTED', 'DECLINED'];
      const activeDeals = dealsList ? dealsList.filter(d => !ENDED.includes(String(d.status || '').toUpperCase())).length : null;
      const [currDeals, prevDeals] = dealsList ? inPeriods(dealsList, (d) => d.created_at) : [0, 0];

      let totalSpent = null, currSpent = 0, prevSpent = 0;
      if (txnsRes !== FAIL) {
        totalSpent = 0;
        // Session 58: a UGC cancel writes a refund row with status SUCCESS — it is money BACK, not money spent.
        const isRefundRow = (t) => t.is_refund_row === true || String(t.payout_type || '') === 'refund';
        txnsRes.filter(t => (t.status === 'SUCCESS' || t.status === 'PAID') && !isRefundRow(t)).forEach(t => {
          const amt = Number(t.gross_amount || t.amount || 0);
          totalSpent += amt;
          const tt = t.created_at ? new Date(t.created_at).getTime() : 0;
          if (tt >= nowMs - period30Ms) currSpent += amt;
          else if (tt >= nowMs - period60Ms) prevSpent += amt;
        });
      }

      const calcTrend = (curr, prev, money = false) => {
        if (!hasHistoricalData) return null;
        if (prev > 0) {
          const pct = Math.round(((curr - prev) / prev) * 100);
          if (pct > 0) return { trend: `+${pct}%`, trendValue: "vs prev 30d", isPositive: true, isNegative: false };
          if (pct < 0) return { trend: `${pct}%`, trendValue: "vs prev 30d", isPositive: false, isNegative: true };
          return { trend: "0%", trendValue: "No change", isPositive: false, isNegative: false };
        }
        if (curr > 0) return { trend: money ? `+₹${Number(curr).toLocaleString("en-IN")}` : `+${curr}`, trendValue: "new this period", isPositive: true, isNegative: false }; // v358
        return { trend: "0%", trendValue: "No change", isPositive: false, isNegative: false };
      };

      setStats((old) => {
        // a background refresh that failed keeps the last good number
        const keep = (v, k) => (v === null && silent ? old[k] : v);
        return {
          campaignsCount: keep(totalCampaigns, "campaignsCount"),
          applicantsCount: keep(appsList ? appsList.length : null, "applicantsCount"),
          dealsCount: keep(activeDeals, "dealsCount"),
          amountSpent: keep(totalSpent, "amountSpent"),
          campaignsTrend: totalCampaigns === null ? null : calcTrend(currCampaigns, prevCampaigns),
          applicantsTrend: appsList ? calcTrend(currApplicants, prevApplicants) : null,
          dealsTrend: dealsList ? calcTrend(currDeals, prevDeals) : null,
          spentTrend: totalSpent === null ? null : calcTrend(currSpent, prevSpent, true),
        };
      });

      if (threadsRes !== FAIL) {
        setTaskThreads(threadsRes);
        // v423: the inbox sends unread_count per thread (the old unread_brand / last_message_sender fields aren't sent)
        const unreadThreads = threadsRes.filter(t => Number(t.unread_count) > 0 || t.unread_brand === true || t.unread === true);
        setHasUnreadMessages(unreadThreads.length > 0);
        setChatUnreadCount(unreadThreads.length);
      }
      if (ugcRes !== FAIL) setTaskUgcOrders(ugcRes);
      setTasksLoaded(true);
      if (topRes !== FAIL) setTopPerformers(topRes);
      else if (!silent) setTopPerformers([]);
    } catch (e) {
      console.warn("Failed retrieving brand metrics", e);
      if (live() && !silent && !hasLoadedOnce.current) setLoadError(true);
    } finally {
      if (live() && !silent) setLoading(false);
    }
  };

  const loadNotifications = async () => {
    if (!user) return;
    try {
      // Through the server (session 22): the browser may no longer read `notifications` directly.
      const all = await api.get('/notifications').then((r) => (Array.isArray(r?.data) ? r.data : [])).catch(() => []);
      const notifs = all.slice(0, 20);
      const uCount = all.filter((n) => !n.read && !n.is_read).length;

      if (notifs && notifs.length > 0) {
        setNotifications(notifs);
        setUnreadCount(uCount || 0);
        const adminCustomMsg = notifs.find(n => n.type === 'admin_custom_message' && !n.read);
        if (adminCustomMsg) {
          setAdminPopup(adminCustomMsg);
        }
      } else {
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (err) {
      console.warn("Could not fetch brand notifications", err);
      setNotifications([]);
      setUnreadCount(0);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      if (user) {
        await ownDb
          .from('notifications')
          .update({ read: true })
          .eq('user_id', user.user_id);
      }
    } catch (e) {
      console.warn(e);
    }
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  // Session 34 (Ravi): "Important for you" = real brand tasks only, same card as the creator
  // dashboard. Order + sources: src/lib/brandTasks.js. Desktop only (mobile = BrandHomeMobile).
  const importantTasks = React.useMemo(() => buildBrandTasks({
    ugcOrders: taskUgcOrders,
    threads: taskThreads,
    applications: taskApplications,
    campaigns,
    kycStatus: kycStatusText,
    kycVerified,
    profile: brandProfileRow,
    profileLoaded: tasksLoaded && brandProfileRow !== null,
  }), [taskUgcOrders, taskThreads, taskApplications, campaigns, kycStatusText, kycVerified, brandProfileRow, tasksLoaded]);
  const handleTaskAction = (task) => {
    if (task?.action?.to) navigate(task.action.to);
  };

  useEffect(() => {
    loadData();
    loadNotifications();

    if (!user) return;
    // Live updates over our own authenticated socket (session 22) instead of Supabase realtime,
    // which needed the notifications table to be readable by anyone.
    // Session 31: one shared connection per tab (src/lib/sharedSocket.js).
    const socket = acquireSocket(user.user_id);
    const onNotif = (notif) => {
      if (!notif || notif.user_id !== user.user_id) return;
      const id = notif.notif_id || notif.id;
      setNotifications((n) => (n.some((x) => (x.notif_id || x.id) === id) ? n : [notif, ...n]));
      setUnreadCount((c) => c + 1);
    };
    socket.on("new_notification", onNotif);

    return () => socket.release();
  }, [user?.user_id]);

  // Session 28: new applicants, deals, KYC decisions → counts and tasks update without a refresh.
  useLiveRefresh((o) => loadData({ silent: true, ...(o || {}) }), { types: ["application", "deal", "kyc", "verification", "campaign", "payment", "escrow"], intervalMs: 120000 });

  // Rotators for carousels
  useEffect(() => {
    const statInterval = setInterval(() => {
      setCurrentStatIndex((prev) => (prev + 1) % 4);
    }, 3000);
    return () => clearInterval(statInterval);
  }, []);

  const displayBanners = banners.length > 0 ? banners : brandHeroBannersList;

  useEffect(() => {
    if (displayBanners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentBannerIdx((prev) => (prev + 1) % displayBanners.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [displayBanners.length]);

  // v415: Escape closes the team message popup.
  useEffect(() => {
    if (!adminPopup) return undefined;
    const onKey = (e) => { if (e.key === "Escape") handleDismissPopup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [adminPopup]); // eslint-disable-line react-hooks/exhaustive-deps

  // v415: tell the page shell the home has loaded — the footer is drawn only then (it jumped down under the skeleton).
  useEffect(() => {
    if (loading || typeof window === "undefined") return;
    window.dispatchEvent(new Event("yb:home-ready"));
  }, [loading]);

  // Entrance
  useEffect(() => {
    if (!loading && containerRef.current) {
      // Session 37: blocks fade in once data is ready (shared motion, GSAP removed)
      return revealChildren(containerRef.current.querySelectorAll(".gsap-reveal"));
    }
  }, [loading]);

  if (loading) {
    return (
      <div className="w-full max-w-none animate-pulse pb-8 min-h-[calc(100vh-64px)]" data-dashboard-loading="true" aria-busy="true" /* v415: the tour + footer wait for this to go; full height so nothing below jumps */>
        <div className="h-10 bg-gray-200 dark:bg-zinc-800 rounded-xl w-1/4 mb-6"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[1,2,3,4].map(k => (
            <div key={k} className="h-28 bg-gray-200 dark:bg-zinc-800 rounded-3xl p-5 border border-[var(--border-default)]"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 h-96 bg-gray-200 dark:bg-zinc-800 rounded-3xl"></div>
          <div className="h-96 bg-gray-200 dark:bg-zinc-800 rounded-3xl"></div>
        </div>
      </div>
    );
  }

  // v416 (M5): the first load failed → say so and offer a retry (no fake empty dashboard).
  if (loadError) {
    return (
      <div className="w-full min-h-[60vh] flex items-center justify-center p-6" data-testid="brand-dashboard-error">
        <div role="alert" className="max-w-md w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto text-amber-500" size={28} aria-hidden="true" />
          <h2 className="mt-3 text-lg font-bold text-gray-900">Couldn't load your dashboard</h2>
          <p className="mt-1 text-sm text-gray-600">Something went wrong on our side. Your campaigns and payments are safe.</p>
          <button type="button" onClick={() => { setLoading(true); setLoadError(false); loadData(); }}
            className="mt-5 min-h-[44px] px-6 rounded-xl bg-[var(--violet)] text-white text-sm font-bold cursor-pointer hover:brightness-95">Try again</button>
        </div>
      </div>
    );
  }

  // v332: KYC status can come back lower-case ("under_review", "submitted") — a sent KYC showed "Pending / Complete KYC Now".
  const kycInReview = ["pending", "under_review", "submitted"].includes(String(kycStatusText || "").toLowerCase());
  const localHour = new Date().getHours();
  const timeGreeting = localHour < 12 ? "Good morning" : localHour < 17 ? "Good afternoon" : "Good evening"; // v415: sentence case
  const rawBrandName = user?.name || user?.full_name || user?.company_name || user?.companyName || user?.display_name || user?.displayName || user?.email?.split('@')[0] || "Brand Partner";
  const cleanBrandName = typeof rawBrandName === 'string' ? rawBrandName.trim() : String(rawBrandName || '').trim();
  const brandName = cleanBrandName ? (cleanBrandName.split(/\s+/)[0] || cleanBrandName) : "Brand Partner";



  // 4 Stats list — v358: no invented trend curves
  const customStatsData = [
    { 
      label: "Total Campaigns", 
      value: stats.campaignsCount, 
      trendInfo: stats.campaignsTrend,
      color: "var(--violet)", 
      chartData: [{v: stats.campaignsCount},{v: stats.campaignsCount},{v: stats.campaignsCount},{v: stats.campaignsCount}] /* v358: flat — the rising curve was made up */ 
    },
    { 
      label: "Applicants Pitched", 
      value: stats.applicantsCount, 
      trendInfo: stats.applicantsTrend,
      color: "#EC4899", 
      chartData: [{v: stats.applicantsCount},{v: stats.applicantsCount},{v: stats.applicantsCount},{v: stats.applicantsCount}] /* v358: flat — the rising curve was made up */ 
    },
    { 
      label: "Active Collaborations", 
      value: stats.dealsCount, 
      trendInfo: stats.dealsTrend,
      color: "#10B981", 
      chartData: [{v: stats.dealsCount},{v: stats.dealsCount},{v: stats.dealsCount},{v: stats.dealsCount}] /* v358: flat — the rising curve was made up */ 
    },
    { 
      label: "Amount Spent", 
      value: stats.amountSpent, 
      prefix: "₹", 
      format: true, 
      trendInfo: stats.spentTrend,
      color: "#F59E0B", 
      chartData: [{v: stats.amountSpent},{v: stats.amountSpent},{v: stats.amountSpent},{v: stats.amountSpent}] /* v358: flat — the rising curve was made up */ 
    }
  ];

  return (
    <PullToRefresh
      onRefresh={() => loadData({ silent: true }) /* v416: a pull keeps what's on screen if it fails */}
      pullingText="Pull to refresh feed"
      releaseText="Release to sync campaigns & deals"
      refreshingText="Fetching latest collaboration updates..."
      successText="Brand collaborations & stats synced"
      className="w-full"
    >
      <div ref={containerRef} className="text-[var(--text-primary)] text-left w-full max-w-none relative overflow-x-hidden pb-8" data-testid="brand-dashboard" data-has-campaigns={campaigns.length > 0 ? "true" : "false"} /* v416: the tour skips brands that already have campaigns */>
      {/* Background Decorative Radial Glows */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-[var(--violet)]/4 rounded-full filter blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#7C3AED]/2 rounded-full filter blur-3xl pointer-events-none" />

      {/* Header section with brand greeting */}
      <div id="tour-profile-header" className="hidden md:flex mb-6 justify-between items-center relative z-40 gsap-reveal">{/* v415: tour step 1 anchor */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex w-10 h-10 rounded-full overflow-hidden border border-[var(--border-default)] relative shrink-0 items-center justify-center bg-[var(--bg-elevated)] font-bold text-sm text-[var(--text-secondary)]">
             {/* v332: no broken-image box when there is no logo (or the link is dead) — initial instead */}
             <span aria-hidden="true">{initialsOf(brandName || "Brand", { fallback: "B" })}</span>{/* v358: emoji-safe */}
             {user?.photo && (
               <img 
                 src={user.photo} 
                 alt="Brand Logo" 
                 className="absolute inset-0 w-full h-full object-cover" 
                 onError={(e) => { e.currentTarget.style.display = "none"; }}
               />
             )}
          </div>
          <div>
            <h2 className={"text-lg sm:text-xl font-bold tracking-tight truncate max-w-[52vw]"}>
              {timeGreeting}, {cleanBrandName || brandName}{/* v415: full brand name ("Team QA" for "QA Foods Pvt Ltd" read oddly) */}
            </h2>
            <div className="hidden md:flex text-[11px] text-[var(--text-secondary)] items-center gap-1.5 flex-wrap">
              {/* v416: one wording for verification everywhere; nothing shown when the status couldn't be read */}
              {kycKnown && <>Account status: {kycVerified ? ( /* v415: was "Console status" */
                <Badge variant="success">Verified</Badge>
              ) : kycInReview ? (
                <Badge variant="info">Under review</Badge>
              ) : (
                <Badge variant="warning">Verification pending</Badge>
              )}</>}
  
              <TrustBadgeRotator page="brandDashboard" className="hidden md:block" />
            </div>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button 
            onClick={() => navigate("/brand/inbox")}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-[12px] sm:rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] flex items-center justify-center relative shadow-sm hover:bg-[var(--bg-elevated)] transition-all cursor-pointer"
            title="Brand Inbox"
            aria-label={chatUnreadCount > 0 ? `Inbox, ${chatUnreadCount} unread` : "Inbox"} // v332: icon-only button had no label
          >
            <MessageCircle className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-[var(--text-secondary)]" />
            {chatUnreadCount > 0 && (
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-[var(--violet)] rounded-full text-white text-[11px] sm:text-[10px] font-bold flex items-center justify-center border border-white" /* v415: no endless pulse */>
                {chatUnreadCount > 9 ? "9+" : chatUnreadCount}{/* v332: 2-digit counts spilled out of the dot */}
              </div>
            )}
          </button>
        </div>
      </div>

      {/* KYC Warning / Status Banner */}
      {kycKnown && !kycVerified && showKycBanner && ( /* v416 (M5): not from a failed read */
        <>
          {kycInReview ? (
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-blue-500/5 border border-blue-500/25 rounded-2xl text-[#6D28D9] gap-3 relative z-10 gsap-reveal">
              <div className="flex items-start gap-3">
                <Clock className="text-[#6D28D9] shrink-0 mt-0.5" size={18} />
                <div>
                  {/* v332: text-blue-300 was unreadable on the light card; plainer title */}
                  <p className="font-bold text-xs text-[#6D28D9]">Your verification is under review</p>{/* v416 */}
                  <p className="text-[10px] text-[#6D28D9]/80 mt-1 leading-relaxed">
                    We're reviewing your business details. We'll let you know as soon as it's approved.{/* v415: plainer copy */}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <Link to="/kyc/status" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-xl transition-all shadow-md">
                  Check status
                </Link>
                <button onClick={() => setShowKycBanner(false)} aria-label="Dismiss" className="p-2 hover:bg-blue-500/10 rounded-lg text-[#6D28D9]/70 hover:text-[#6D28D9] cursor-pointer">{/* v332: label + bigger target */}
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-amber-500/5 border border-amber-500/25 rounded-2xl text-amber-600 gap-3 relative z-10 gsap-reveal">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
                <div>
                  <p className="font-bold text-xs text-amber-700">Verification pending</p>{/* v416: same words as everywhere else */}{/* v415: plainer copy, darker amber for contrast */}
                  <p className="text-[11px] text-amber-700 mt-1 leading-relaxed">
                    Add your GSTIN or business PAN to unlock payments and hire verified creators.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <Link to="/brand/kyc" className="px-3 py-1.5 bg-amber-500 text-[var(--bg-base)] text-[10px] font-bold rounded-xl transition-all shadow-md hover:scale-[1.02] cursor-pointer">
                  Verify now
                </Link>
                <button onClick={() => setShowKycBanner(false)} aria-label="Dismiss" className="p-2 hover:bg-amber-500/10 rounded-lg text-amber-600/70 hover:text-amber-600 cursor-pointer">{/* v332 */}
                  <X size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* HERO BANNER SECTION (lg-span-3) + IMPORTANT FOR YOU (lg-span-1) */}
      <div className="flex flex-col lg:grid lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8 relative z-10 gsap-reveal">
        
        {/* Left: Auto-rotating brand marketing carousel (standard 3:1 aspect ratio matching 1200x400 banner spec) */}
        <div className="lg:col-span-3">
          <div className="bg-[var(--bg-card)] rounded-[16px] lg:rounded-[24px] relative overflow-hidden flex flex-col justify-center border border-[var(--border-default)] w-full aspect-[2.8/1] sm:aspect-[3/1] min-h-[120px] max-h-[300px] group shadow-md">
             
               <>
               {(banners.length > 0 ? banners : brandHeroBannersList).map((banner, idx) => {
                 const ctaUrl = banner.cta_url || banner.link_url || banner.link;
                 const hasLink = Boolean(ctaUrl && ctaUrl !== "#");
                 const isCurrent = idx === currentBannerIdx;
                 return (
                   <div 
                     key={banner.id || idx} 
                     onClick={() => {
                       if (hasLink) {
                         if (ctaUrl.startsWith('http')) {
                           window.open(ctaUrl, '_blank', 'noopener,noreferrer'); // v423 (S12)
                         } else {
                           navigate(ctaUrl);
                         }
                       }
                     }}
                     className={`absolute inset-0 transition-all duration-700 ${isCurrent ? 'opacity-100 z-10 scale-100' : 'opacity-0 z-0 pointer-events-none scale-95'} ${hasLink ? 'cursor-pointer' : ''}`}
                   >
                     {brokenBanners[banner.id || idx] ? (
                       /* v416: a banner picture that fails to load shows a branded card with its title (was an empty white box) */
                       <div className="w-full h-full bg-gradient-to-r from-[#2E1A68] via-[#3B1E7E] to-[#7C3AED] flex items-center px-6 md:px-10">
                         <span className="text-white text-lg md:text-2xl font-bold tracking-tight">{banner.title || "Find the right creators on Ybex"}</span>
                       </div>
                     ) : (
                     <img 
                       src={banner.image_url || banner.imgUrl || banner.image} 
                       alt={banner.title || "Banner"} 
                       className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-[4000ms] ease-out" 
                       referrerPolicy="no-referrer"
                       onError={() => setBrokenBanners((b) => ({ ...b, [banner.id || idx]: true }))} // v416 (was: hidden → blank card)
                     />
                     )}
                   </div>
                 );
               })}
               
               {/* Slider Dots */}
               {(banners.length > 0 ? banners : brandHeroBannersList).length > 1 && (
                 <div className="absolute bottom-2 sm:bottom-4 left-4 md:left-10 flex items-center gap-1.5 z-20">
                   {(banners.length > 0 ? banners : brandHeroBannersList).map((_, idx) => (
                     <button 
                       key={idx}
                       onClick={(e) => {
                         e.preventDefault();
                         e.stopPropagation();
                         setCurrentBannerIdx(idx);
                       }}
                       className={`h-1.5 rounded-full transition-all duration-300 shadow-sm ${idx === currentBannerIdx ? "w-5 bg-white" : "w-1.5 bg-white/40 hover:bg-white/80"}`}
                       title={`Slide ${idx + 1}`}
                       aria-label={`Show banner ${idx + 1}`} // v332
                     />
                   ))}
                 </div>
               )}
               </>
 
          </div>
        </div>

        {/* Right: Important for you (session 34 — same card as the creator dashboard) */}
        <div id="tour-brand-tasks" className="hidden sm:block lg:col-span-1 min-w-0 lg:min-h-[300px]" data-testid="brand-important-for-you">{/* v415: tour anchor · v416 (H5): grows to fit — a fixed 260px cut the button off */}
          <ImportantForYou tasks={importantTasks} onAction={handleTaskAction} loading={!tasksLoaded && importantTasks.length === 0} />
        </div>
      </div>

      {/* Mobile 2-Column Compact Stats & Important Row */}
      <div className="sm:hidden grid grid-cols-2 gap-3 mb-6 relative z-10 gsap-reveal">
         {/* Left Box: Stats Auto-Scroller */}
         <div className="bg-[var(--bg-card)] rounded-[16px] p-2.5 sm:p-3 border border-[var(--border-default)] shadow-sm flex flex-col relative aspect-square overflow-hidden">
            <div className="mb-2 shrink-0">
               <h4 className="text-xs font-bold">Stats</h4>
               <p className="text-[11px] font-medium mt-0.5 leading-snug text-gray-500">Your progress</p>
            </div>
            <div className="flex-1 relative flex flex-col justify-center">
               <AnimatePresence mode="wait">
                  {customStatsData[currentStatIndex] && (() => {
                     const s = customStatsData[currentStatIndex];
                     return (
                        <motion.div key={currentStatIndex} initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -15 }} transition={{ duration: 0.35 }} className="flex flex-col items-center text-center">
                           <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{s.label}</span>
                           <div className="font-mono font-bold tracking-tight text-lg my-0.5 text-gray-900">
                              <AnimatedNumber value={s.value} format={s.format} prefix={s.prefix || ""} />
                           </div>
                            {s.trendInfo && (
                               <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                                  s.trendInfo.isPositive 
                                     ? "text-emerald-600 bg-emerald-50" 
                                     : s.trendInfo.isNegative
                                     ? "text-rose-600 bg-rose-50"
                                     : "text-gray-500 bg-gray-100"
                               }`}>
                                  {s.trendInfo.isPositive ? (
                                     <TrendingUp size={8} />
                                  ) : s.trendInfo.isNegative ? (
                                     <TrendingDown size={8} />
                                  ) : (
                                     <Minus size={8} />
                                  )}
                      
                                  <span>{s.trendInfo.trend}</span>
                               </span>
                           )}
                
                        </motion.div>
                     );
                  })()}
               </AnimatePresence>
            </div>
            {/* Slider Dots */}
            <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 z-20">
               {[0, 1, 2, 3].map((idx) => (
                  <div key={idx} className={`h-1.5 rounded-full transition-all duration-300 shadow-sm ${idx === currentStatIndex ? "w-4 bg-[var(--violet)]" : "w-1.5 bg-neutral-200"}`} />
               ))}
            </div>
         </div>

         {/* Session 34: the old small "Important For You" box was here (never shown — phones get
             BrandHomeMobile). The real card is the desktop one above. */}
      </div>

      {/* STATS ROW WITH SPARKLINE CHARTS (Desktop Only) */}
      <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10 relative z-10 gsap-reveal">
         {customStatsData.map((s, i) => (
           <div 
             key={i} 
             className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-[24px] pt-5 px-5 pb-0 shadow-sm relative overflow-hidden group min-h-[145px] flex flex-col justify-between hover:border-[var(--text-tertiary)]/20 hover:shadow-[0_8px_30px_rgba(0,0,0,0.02)] transition-all cursor-default"
           >
             
             <div className="relative z-10 flex flex-col items-start">
               <span className={'text-[10px] font-bold uppercase tracking-wider'}>{s.label}</span>
               <div className={`font-mono font-bold tracking-tight text-lg my-1.5`}>
                 <AnimatedNumber value={s.value} format={s.format} prefix={s.prefix} />
               </div>
               
               {/* Spark trend badge */}
               {s.trendInfo ? (
                 <div className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${
                   s.trendInfo.isPositive 
                     ? "bg-emerald-50 text-emerald-700 border-emerald-200/50" 
                     : s.trendInfo.isNegative
                     ? "bg-rose-50 text-rose-700 border-rose-200/50"
                     : "bg-gray-100/70 text-gray-500 border-gray-200/50"
                 }`}>
                   {s.trendInfo.isPositive ? (
                     <TrendingUp size={10} />
                   ) : s.trendInfo.isNegative ? (
                     <TrendingDown size={10} />
                   ) : (
                     <Minus size={10} />
                   )}
       
                   <span>{s.trendInfo.trend}</span>
                   {s.trendInfo.trendValue && <span className="opacity-75 ml-0.5">({s.trendInfo.trendValue})</span>}
                 </div>
               ) : null}
             </div>
             
             {/* Dynamic Recharts Sparkline at the Bottom */}
             <div aria-hidden="true" /* v416: decorative — no unlabeled focusable chart */ className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none opacity-60 group-hover:opacity-90 mt-auto translate-y-1 group-hover:translate-y-0 transition-all duration-300">
               <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={s.chartData} margin={{ top: 0, left: 0, right: 0, bottom: 0 }} accessibilityLayer={false} tabIndex={-1}>
                   <defs>
                     <linearGradient id={`brand-gradient-${i}`} x1="0" y1="0" x2="0" y2="1">
                       <stop offset="5%" stopColor={s.color} stopOpacity={0.25} />
                       <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                     </linearGradient>
                   </defs>
                   <Area 
                     type="monotone" 
                     dataKey="v" 
                     stroke={s.color} 
                     strokeWidth={2} 
                     fillOpacity={1} 
                     fill={`url(#brand-gradient-${i})`} 
                   />
                 </AreaChart>
               </ResponsiveContainer>
             </div>
           </div>
         ))}
      </div>
      
      <TrustedBrandsWidget userType="brand" />

      {/* QUICK ACTIONS PANEL (Bento Grid) */}
      <div className="mb-10 relative z-10 gsap-reveal">
        <QuickActions />
      </div>

      {/* ACTIVE CAMPAIGNS SLIDER SECTION (Full Width) */}
      <div className="mb-10 relative z-10 gsap-reveal w-full">
        <CampaignMiniList campaigns={campaigns} />
      </div>

      {/* TOP PERFORMING PARTNERS INSIGHTS WIDGET */}
      <div className="mb-10 relative z-10 gsap-reveal">
        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
            <div>
              <h3 className="font-sans font-bold text-xl text-[var(--text-primary)] flex items-center gap-2">
                🏆 Top Performing Partners
                <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  Beta
                </span>
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1 font-normal leading-tight">
                Your highest-scoring creator partners, ranked by verified campaign audience reach, timeliness, and satisfaction.
              </p>
            </div>
            {topPerformers.length > 0 && (
              <span className="text-xs font-bold text-[var(--text-primary)] bg-[var(--violet)]/10 px-3 py-1 rounded-full mt-2 sm:mt-0">
                {topPerformers.length} verified creator{topPerformers.length === 1 ? "" : "s"}{/* v332: "1 creators" */}
              </span>
            )}
          </div>

          {topPerformers.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/50">
              {/* v415: professional empty state (was "still in training/beta") */}
              <p className="text-xs font-semibold text-gray-600">
                No completed collaborations yet
              </p>
              <p className="text-[11px] text-gray-500 mt-1 leading-normal">
                Your best-performing creators will show here after your first campaigns are complete.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {topPerformers.map((item, index) => {
                return (
                  <div 
                    key={item.deal_id || index}
                    className="flex flex-col justify-between p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] hover:border-[var(--violet)]/30 transition-all hover:shadow-xs"
                  >
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        {item.creator_avatar ? (
                          <img 
                            src={item.creator_avatar} 
                            alt={item.creator_name} 
                            className="w-11 h-11 rounded-full object-cover border border-gray-100" 
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-[var(--violet)]/10 text-[var(--text-primary)] flex items-center justify-center font-bold font-sans text-sm shrink-0">
                            {(item.creator_name || "C").charAt(0).toUpperCase()}
                          </div>
                        )}
            
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-[var(--text-primary)] leading-tight">
                              {item.creator_name}
                            </span>
                            {item.performance_tier && <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                              item.performance_tier === "PLATINUM" ? "bg-[#EDE9FE] text-[#6D28D9]" :
                              item.performance_tier === "GOLD" ? "bg-amber-100 text-amber-700" :
                              item.performance_tier === "SILVER" ? "bg-slate-100 text-slate-700" :
                              "bg-gray-100 text-gray-500"
                            }`}>
                              {item.performance_tier}
                            </span>}{/* v332: no empty grey chip when there is no tier */}
                          </div>
                          {item.instagram_handle && (
                            <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                              @{String(item.instagram_handle).replace(/^@/, "")}{/* v332: no "@undefined" / "@@name" */}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2 mb-4 bg-white/50 p-3 rounded-xl border border-gray-100">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-gray-500 font-medium">Performance Score</span>
                          <EstimateValue creator={item} kind="performance" className="font-mono font-bold text-xs text-gray-800" pillClassName="text-[11px]" />
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-gray-500 font-medium">Verified Reach</span>
                          <span className="font-mono font-bold text-xs text-gray-800">{(Number(item.delivered_reach) || 0).toLocaleString("en-IN")}</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-gray-500 font-medium">Delivery Efficiency</span>
                          <span className="font-mono font-bold text-xs text-emerald-600">
                            {/* v332: delivered vs promised as a plain % ("80%"), not "+80%"; "—" when nothing was promised */}
                            {item.promised_reach > 0 ? `${Math.round(((Number(item.delivered_reach) || 0) / item.promised_reach) * 100)}%` : '—'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={() => {
                        navigate(`/chat/${item.creator_id}`);
                      }}
                      className="w-full py-2.5 bg-white border border-[var(--violet)]/20 hover:border-[var(--violet)] hover:bg-[var(--violet)]/5 text-[var(--text-primary)] text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                       Re-Collaborate
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Admin Custom Message Popup */}
      <AnimatePresence>
        {adminPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Message from the Ybex team" /* v415: the tour and other popups wait for it */>
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
                  <Bell size={24} />{/* v415: no endless bounce */}
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[var(--text-primary)] uppercase tracking-widest block mb-1">Official Notification</span>
                  <h4 className="text-lg font-bold text-gray-900 leading-tight">Message from the Ybex team</h4>{/* v332 */}
                </div>
                <button aria-label="Close" /* v330: icon-only button */
                  onClick={handleDismissPopup}
                  className="ml-auto p-2.5 -m-1 text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4 mb-6">
                <p className="text-sm font-semibold text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {adminPopup.message}
                </p>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button 
                  onClick={handleDismissPopup}
                  className="w-full sm:w-auto px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold rounded-xl transition-colors shadow-md"
                >
                  Got it, thanks!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </div>
    </PullToRefresh>
  );
}
