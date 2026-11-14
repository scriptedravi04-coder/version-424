import React, { useEffect, useLayoutEffect, useState, useRef } from "react";
import { scrollAppToTopSettled } from "../../lib/scrollTop";
import { PLATFORM_SETTINGS_SUBS, adminItemAllowed } from '../../lib/adminPermissions';
import { Link, NavLink, useNavigate, useLocation, useNavigationType } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { api, isBrandLike, clearApiCache } from "../../lib/api";
import { ensureBrandLimits } from "../campaigns/mobile/HomeCampaignCard"; // v419
import { safeStorage } from "../../utils/storage";
import { isFinishLater } from "../../lib/onboardingLater";
import { Lightbulb, HelpCircle, Trophy, Bot, Tag, Receipt, Mail, Sparkles, Wrench, Gauge, ScrollText } from "lucide-react";
import { adminNavFor, adminNavFolded, adminNavTo, adminNavActive } from "../../lib/adminSearch"; // v419: one admin menu
import { Bell, LogOut, Settings as SettingsIcon, Menu, X, ShieldAlert, User, Film, Video, LayoutGrid, Megaphone, FileText, Wallet, Briefcase, MessageCircle, Users, Search, AlertTriangle, ChevronRight, ChevronLeft, Compass, ChevronDown, Gift, ArrowRight, Activity, Zap, BookOpen } from "lucide-react";
import YbexLogo from "./YbexLogo";
import NotificationBell from "../shared/NotificationBell";
import PremiumFooter from "./PremiumFooter";
import HomeCityFooter from "../footer/HomeCityFooter";
import BottomNav from "./BottomNav";
import { useBottomNavHidden, isCreatorNavPage, isBrandNavPage } from "../../lib/bottomNavVisibility";
import UnderReviewBanner from "../common/UnderReviewBanner";
import UnderReviewModal from "../common/UnderReviewModal";
import PWAInstallPrompt from "../common/PWAInstallPrompt";
import QuickActionsMobile from "../quickActions/QuickActionsMobile";
import DesktopEva from "../feedback/DesktopEva"; // Session 58: Ybex Eva on desktop (≥768px only)
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import ModalPortal from "../common/ModalPortal";
import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";

// v416 (M12): browser-tab titles for signed-in app screens (public pages like the blog set their own).
const PAGE_TITLES = [
  [/^\/(dashboard|brand|brand\/dashboard)$/, "Home"],
  [/^\/(creators|explore|brand\/discover)$/, "Explore creators"],
  [/^\/brand\/campaigns\/create/, "Create campaign"],
  [/^\/brand\/campaigns\/[^/]+\/applicants$/, "Applicants"],
  [/^\/brand\/campaigns$/, "Campaigns"],
  [/^\/campaigns(\/|$)/, "Campaigns"],
  [/^\/brand\/ugc\/post/, "Post a UGC brief"],
  [/^\/brand\/ugc\/orders/, "UGC orders"],
  [/^\/brand\/ugc\/payments/, "UGC payments"],
  [/^\/brand\/ugc/, "Instant UGC"],
  [/^\/creator\/ugc/, "UGC"],
  [/^\/(brand\/inbox|creator\/inbox|inbox|chat)(\/|$)/, "Inbox"],
  [/^\/(brand\/notifications|creator\/notifications|notifications)$/, "Notifications"],
  [/^\/brand\/payments$/, "Payments"],
  [/^\/(brand\/kyc|creator\/kyc|kyc)(\/|$)/, "Verification"],
  [/^\/(deals|collabs|creator\/deals)(\/|$)/, "Deals"],
  [/^\/brand\/profile$/, "Brand profile"],
  [/^\/(profile|profile\/overview|creator\/profile)$/, "Profile"],
  [/^\/(settings|brand\/settings|brand\/account|creator\/settings)$/, "Settings"],
  [/^\/earnings$/, "Earnings"],
  [/^\/refer$/, "Refer & earn"],
  [/^\/help(\/|$)/, "Help Center"],
  [/^\/support\//, "Help Center"],
  [/^\/onboarding$/, "Set up your account"],
  [/^\/admin$/, "Admin"],
];
export function pageTitleFor(pathname) {
  const p = String(pathname || "");
  const hit = PAGE_TITLES.find(([re]) => re.test(p));
  return hit ? hit[1] : null;
}

// v419: icons for the admin menu (ADMIN_NAV.icon)
const ADMIN_ICON = {
  overview: <LayoutGrid />, waitlist: <FileText />, kyc: <ShieldAlert />, campaigns: <Megaphone />, money: <Wallet />, help: <HelpCircle />,
  reports: <AlertTriangle />, chat: <MessageCircle />, bot: <Bot />, users: <Users />, coupon: <Tag />, invoice: <Receipt />, ugc: <Film />,
  leads: <Lightbulb />, blog: <BookOpen />, push: <Bell />, mail: <Mail />, promo: <Zap />, trophy: <Trophy />, sparkle: <Sparkles />,
  tools: <Wrench />, speed: <Gauge />, logs: <ScrollText />, settings: <SettingsIcon />,
};

// v426: scroll positions per history entry, so Back returns to the same spot in a list.
const savedScroll = new Map();
function restoreScrollTop(top) {
  let stopped = false; let tries = 0;
  const stop = () => { stopped = true; };
  const opts = { passive: true, capture: true };
  ["touchstart", "wheel", "keydown", "mousedown"].forEach((e) => window.addEventListener(e, stop, opts));
  const tick = () => {
    if (stopped) return;
    const el = document.getElementById("app-scroll-container");
    try { window.__ybScrollRestore = Date.now(); } catch { /* ignore */ }
    if (el) el.scrollTop = top;
    // the list may still be loading — keep trying for ~1.5s until it is tall enough
    if (++tries < 15 && (!el || Math.abs(el.scrollTop - top) > 2)) setTimeout(tick, 100);
  };
  tick();
  return () => { stopped = true; ["touchstart", "wheel", "keydown", "mousedown"].forEach((e) => window.removeEventListener(e, stop, opts)); };
}

export default function Layout({ children }) {
  const { user, logout, isKycApproved, kycStatus } = useAuth();
  useEffect(() => { if (user && isBrandLike(user.role)) ensureBrandLimits(String(user.user_id)); }, [user?.user_id, user?.role]); // v419: ₹500 floor for Ybex in-house brands
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const bottomNavHiddenByScreen = useBottomNavHidden();

  // Session 39 (M19): the app scrolls an inner box (#app-scroll-container), not the window, so a
  // new page kept the old page's scroll and opened half-way down. Every new page starts at the top;
  // a bottom-tab switch still restores that tab's own position afterwards (BottomNav).
  // Session 43 (Ravi: "Refer & Earn, Payouts, Settings open half-way down"): those screens are the
  // same path with a different ?section=, so the reset above never ran for them. Now any change of
  // page OR screen (section / subscreen / tab / view) starts at the top. Filters typed into the
  // page (?q=…) don't count, so the list doesn't jump while you type.
  const screenKey = (() => {
    try {
      const p = new URLSearchParams(location.search);
      return [location.pathname, p.get("section"), p.get("subscreen"), p.get("tab"), p.get("view")].join("|");
    } catch (e) { return location.pathname; }
  })();
  // Session 48: useLayoutEffect (before the first paint, so the old offset never flashes) and a few
  // more checks while the screen settles — stopped the moment the person touches the screen.
  // v426 (creator audit: campaign list 900px → 0 on Back): Back / swipe-back (a POP) returns to where the
  // list was; every other move still starts at the top.
  const navType = useNavigationType();
  const keyRef = useRef(location.key);
  keyRef.current = location.key;
  useEffect(() => {
    // listen on the document (capture) — the scroll box itself is swapped when the phone / desktop layout settles
    let raf = 0;
    const onScroll = (e) => {
      const el = e.target;
      if (!el || el.id !== "app-scroll-container" || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        // only while this page is still the one on screen (the leaving page gets reset to the top — don't save that)
        try { if (window.history.state && window.history.state.key && window.history.state.key !== keyRef.current) return; } catch { /* ignore */ }
        savedScroll.set(keyRef.current, el.scrollTop);
        if (savedScroll.size > 60) savedScroll.delete(savedScroll.keys().next().value);
      });
    };
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => { document.removeEventListener("scroll", onScroll, { capture: true }); if (raf) cancelAnimationFrame(raf); };
  }, []);
  useLayoutEffect(() => {
    const top = navType === "POP" ? savedScroll.get(location.key) : 0;
    if (top > 0) return restoreScrollTop(top);
    const cancel = scrollAppToTopSettled();
    return cancel;
  }, [screenKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // v416 (M12): the browser tab said the landing-page title on every screen — app screens now get their own title.
  useEffect(() => {
    if (typeof document === "undefined" || !user) return;
    const t = pageTitleFor(location.pathname, user.role);
    if (t) document.title = `${t} · Ybex`;
    else if (!location.pathname.startsWith("/blog")) document.title = "Ybex"; // no stale title from the last screen
  }, [location.pathname, user?.role]);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // v330: a dead profile-photo link showed a broken-image icon in the sidebar / drawer; fall back to the initial.
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef(null);
  // v344: two pollers (UGC orders + collabs) used to overwrite one flag — keep one state each, show the OR
  const [ugcPending, setUgcPending] = useState(false);
  const [dealsPending, setDealsPending] = useState(false);
  const hasPendingWork = ugcPending || dealsPending;
  const [activeThreadsCount, setActiveThreadsCount] = useState(0);
  const [underReviewModalOpen, setUnderReviewModalOpen] = useState(false);
  const [adminPendingCounts, setAdminPendingCounts] = useState({ waitlist: 0, kyc: 0, campaigns: 0, reports: 0, escrow: 0, helpdesk: 0, pitches: 0 });

  const isKycSubmittedOrApproved = Boolean(
    isKycApproved || 
    kycStatus?.status === 'pending' || 
    kycStatus?.status === 'PENDING' || 
    kycStatus?.status === 'under_review' || 
    kycStatus?.status === 'UNDER_REVIEW' || 
    kycStatus?.status === 'approved' || 
    kycStatus?.status === 'APPROVED' ||
    user?.kyc_verified ||
    user?.kyc_status === 'pending' ||
    user?.kyc_status === 'under_review' ||
    user?.kyc_status === 'approved'
  );

  const kycSettingsBadge = (!isKycSubmittedOrApproved && user && user.role !== 'admin' && user.team_role !== 'sub_admin') ? (
    <span className="px-1.5 py-0.5 text-[11px] font-bold bg-rose-50 text-rose-600 border border-rose-200/80 rounded-md uppercase tracking-wider leading-none shrink-0 shadow-2xs">
      KYC
    </span>
  ) : null;

  useEffect(() => {
    if (user && user.profile_status === 'under_review') {
      const hasSeenModal = sessionStorage.getItem(`under_review_modal_seen_${user.user_id}`);
      if (!hasSeenModal) {
        setUnderReviewModalOpen(true);
        sessionStorage.setItem(`under_review_modal_seen_${user.user_id}`, "true");
      }
    }
  }, [user]);

  const getFooterProps = () => {
    const path = location.pathname;
    
    const hideFooterRoutes = [
      '/creator-campaign-flow',
      '/creator/kyc',
      '/creator/settings',
      '/chat',
      '/inbox',
      '/creator/inbox',
      '/brand/inbox',
      '/brand/campaigns/create',
      '/brand/kyc',
      '/brand/settings',
      '/brand/ugc',
      '/creator/ugc',
      '/settings',
      '/help',
      '/support',
      '/deals',
      '/login',
      '/signup',
      '/onboarding'
    ];

    if (hideFooterRoutes.some(route => path === route || path.startsWith(route + '/'))) {
      return null;
    }

    const config = {
      // Creator
      "/dashboard": { headline: ["Built For Creators.", "Powered By Opportunities."], subtitle: "Discover campaigns, connect with brands, and grow your creator business.", showInstagram: false },
      // v343: /creators is the BRAND's creator search (creators can't open it) — the old copy spoke to creators.
      "/creators": { headline: ["Find Creators Who", "Fit Your Brand."], subtitle: "Browse by niche, city and reach — then invite the right fit.", showInstagram: true },
      "/campaigns": { headline: ["Apply. Create.", "Get Paid."], subtitle: "Connecting creators and brands through meaningful partnerships.", showInstagram: false },
      "/earnings": { headline: ["Get Paid For", "What You Create."], subtitle: "Track every rupee, transparently.", showInstagram: false },
      "/collabs": { headline: ["Manage Every Deal,", "Effortlessly."], subtitle: "Manage every deal in one place.", showInstagram: false },
      "/creator/profile": { headline: ["Showcase What Makes", "You Different."], subtitle: "Keep it sharp — brands notice.", showInstagram: false },
      "/profile/overview": { headline: ["Showcase What Makes", "You Different."], subtitle: "Keep it sharp — brands notice.", showInstagram: false },
      "/creator/ugc/browse": { headline: ["Unleash Your", "Creativity."], subtitle: "Browse briefs and start creating.", showInstagram: false },

      // Brand
      "/brand/dashboard": { headline: ["Where Brands Meet", "Exceptional Creators."], subtitle: "Discover creators, launch campaigns, and drive meaningful results.", showInstagram: false },
      "/brand/campaigns": { headline: ["Scale Your Brand", "With Trusted Creators."], subtitle: "Launch campaigns that convert.", showInstagram: false },
      "/brand/profile": { headline: ["Tell Creators What", "Makes Your Brand Unique."], subtitle: "This is how creators see you.", showInstagram: false },
      "/brand/payments": { headline: ["Secure Payments.", "Seamless Collaborations."], subtitle: "Every transaction, fully tracked.", showInstagram: false },
      "/brand/ugc/briefs": { headline: ["Authentic Content", "At Scale."], subtitle: "Get creator content that converts.", showInstagram: false },
    };

    // v343 (Ravi's screenshots): /dashboard is the BRAND home too — a brand saw "Built For Creators."
    // behind its popups. And a brand opening a creator's profile saw "This is how brands see you."
    const isBrandUser = isBrandLike(user?.role); // v416 (CR4): agency / talent manager are brands too
    // v356 (Ravi's "Settings & Home" design): both homes end with the colour city footer, phone + desktop.
    // v363: light grey (Hopr style), smaller; creator home → "From local shops to big brands — your next collab is here."
    // · brand home → "From corner shops to big companies — find the right creators for you."
    if (path === "/dashboard" || path === "/brand/dashboard" || (path === "/brand" && isBrandUser) /* v415: the bottom-nav Home (/brand) is the same home */) {
      return { kind: "city", variant: (isBrandUser || path === "/brand/dashboard") ? "brand" : "creator" };
    }
    // v415 (brand QA): the big faint slogans ("Scale Your Brand With Trusted Creators.", "Secure Payments. Seamless
    // Collaborations.") read as filler under a brand's working pages and jumped in on load — brands keep only the home footer.
    if (isBrandUser) return null;
    // v356: on the phone /brand/profile is the brand Settings hub, which now ends with the founder note.
    if (path === "/brand/profile" && typeof window !== "undefined" && window.innerWidth < 768) return null;
    if (path === "/dashboard" && isBrandUser) return config["/brand/dashboard"];
    if (path === "/campaigns" && isBrandUser) return config["/brand/campaigns"];
    if (isBrandUser && /^\/creator\/[^/]+$/.test(path) && !["/creator/profile"].includes(path)) {
      // Phone: the creator profile has its own fixed Save / Invite bar — no big footer under it.
      if (typeof window !== "undefined" && window.innerWidth < 768) return null;
      return { headline: ["Find Creators Who", "Fit Your Brand."], subtitle: "Review the profile, then invite them to a campaign.", showInstagram: false };
    }

    if (config[path]) return config[path];

    // Prefix matches
    if (path.startsWith("/brand/ugc/")) {
      return { headline: ["Authentic Content", "At Scale."], subtitle: "Get creator content that converts.", showInstagram: false };
    }
    if (path.startsWith("/brand/campaigns/") && path.endsWith("/applicants")) {
      return { headline: ["Find Creators Who", "Fit Your Brand."], subtitle: "Review, shortlist, and connect.", showInstagram: false };
    }
    if (path.startsWith("/campaigns/")) {
      return { headline: ["This Could Be", "Your Next Big Deal."], subtitle: "Connecting creators and brands through meaningful partnerships.", showInstagram: false, clearBottomBar: true };
    }
    // v353: only a creator's PUBLIC page (/creator/<id>) — the creator's own screens (/creator/notifications,
    // /creator/deals, …) showed "Showcase What Makes You Different. This is how brands see you." under them.
    const OWN_CREATOR_PAGES = ["notifications", "deals", "inbox", "kyc", "settings", "profile", "ugc", "refer", "dashboard"];
    if (/^\/creator\/[^/]+$/.test(path) && !OWN_CREATOR_PAGES.includes(path.split("/")[2])) { // CreatorPublicView
      // v388 (QA): "Showcase What Makes You Different. This is how brands see you." is a note for the creator themselves — brands and
      // visitors looking at somebody's public profile no longer see it.
      const pid = path.split("/")[2];
      const mine = Boolean(user) && [user.user_id, user.creator_id, user.public_id, user.username, user.handle].filter(Boolean).map(String).includes(pid);
      if (!mine) return null;
      // v432: phones get the one-page themed profile with a pinned button — a light footer under it looked broken
      if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 767px)").matches) return null;
      return { headline: ["Showcase What Makes", "You Different."], subtitle: "This is how brands see you.", showInstagram: false };
    }
    if (path.startsWith("/info/")) {
      return { headline: ["The Best Creators", "Never Stop Growing."], subtitle: "Explore more of what Ybex offers.", showInstagram: false };
    }

    return null; // fallback or empty
  };

  const footerProps = getFooterProps();
  // v415 (brand QA, CLS 0.51 on the brand home): the city footer sat right under the loading skeleton and was pushed
  // down when the home filled in. On the brand home it now waits for the home's "loaded" signal (or 8 s), then fades in.
  const footerWaitsForHome = footerProps?.kind === "city" && footerProps.variant === "brand";
  const [homeReady, setHomeReady] = useState(false);
  useEffect(() => {
    if (!footerWaitsForHome) return undefined;
    setHomeReady(false);
    const ready = () => setHomeReady(true);
    window.addEventListener("yb:home-ready", ready);
    const t = setTimeout(ready, 8000);
    return () => { window.removeEventListener("yb:home-ready", ready); clearTimeout(t); };
  }, [footerWaitsForHome, location.pathname]);
  const renderFooter = () => {
    if (!footerProps) return null;
    if (footerProps.kind !== "city") return <PremiumFooter {...footerProps} />;
    if (footerWaitsForHome && !homeReady) return null;
    return footerWaitsForHome
      ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35, ease: "easeOut" }}><HomeCityFooter variant={footerProps.variant} /></motion.div>
      : <HomeCityFooter variant={footerProps.variant} />;
  };

  useEffect(() => {
    if (!user) return;
    // Only a COUNT is needed here. This used to download the entire populated inbox (every
    // thread, profile, order, deal and message) every 30 seconds on every page — the heaviest
    // request in the app, running in the background for every signed-in user.
    const fetchThreadsCount = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      api.get("chat/v2/threads/count")
        .then(res => {
          // Unread messages (session 23). Two pollers used to fight over this badge: this one set
          // the THREAD count, the other fetched the whole inbox every 30 s to set unread.
          const n = Number(res?.data?.unread ?? res?.data?.count);
          setActiveThreadsCount(Number.isFinite(n) ? n : 0);
        })
        .catch(() => { /* background badge: keep the last value, retry on the next tick */ });
    };
    fetchThreadsCount();
    const interval = setInterval(() => { if (typeof document === "undefined" || !document.hidden) fetchThreadsCount(); }, 120000); // v422 (Supabase egress): was 45 s, also ran in hidden tabs
    // v416: chat fires this ~2 s after a chat is opened — the inbox badge updates straight away.
    const onChatRead = () => { try { clearApiCache(); } catch { /* best-effort */ } fetchThreadsCount(); };
    window.addEventListener("ybex:chat-read", onChatRead);
    return () => { clearInterval(interval); window.removeEventListener("ybex:chat-read", onChatRead); };
  }, [user?.user_id]);

  useEffect(() => {
    if (user?.role === 'creator') {
      const checkPendingWork = () => {
        api.get("ugc/orders/creator")
          .then(res => {
            if (Array.isArray(res.data)) {
              const pending = res.data.some(o => o.creator_status === 'CLAIMED' || o.creator_status === 'REVISION_REQUESTED' || o.creator_status === 'REVISION_REQ' || o.status === 'REVISION_REQ');
              setUgcPending(pending); // v344: own flag
            }
          })
          .catch(err => {
            const msg = err?.message || "";
            const status = err?.response?.status;
            if (msg.includes("Received HTML")) {
              console.warn("Pending work check received HTML response (auth flow / cookie check in progress).");
            } else if (msg === "Network Error" || msg.includes("timeout")) {
              console.warn("Network Error/Timeout checking pending work (server might be booting up or busy).");
            } else if (status !== 401 && status !== 403) {
              console.error("Error checking pending work:", err.message);
            }
          });
      };
      checkPendingWork();
      const interval = setInterval(() => { if (typeof document === "undefined" || !document.hidden) checkPendingWork(); }, 120000); // v422 (Supabase egress): was every 30 s, also in hidden tabs
      return () => clearInterval(interval);
    } else if (user?.role === 'admin' || user?.team_role === 'sub_admin') {
      const fetchAdminPendingCounts = () => {
        // v431 (audit #55): the phone admin shows its own counts — the hidden sidebar badges don't need this call
        if (typeof window !== "undefined" && window.innerWidth < 768 && String(window.location.pathname || "").startsWith("/admin")) return;
        api.get("admin/pending-counts")
          .then(res => {
            if (res.data) setAdminPendingCounts(res.data);
          })
          .catch(err => {
            const msg = err?.message || "";
            const status = err?.response?.status;
            if (!msg.includes("429") && msg !== "Network Error" && !msg.includes("timeout") && status !== 401 && status !== 403) {
              console.error("Error checking admin pending counts:", err);
            }
          });
      };
      fetchAdminPendingCounts();
      // v363 (Ravi's "Slowest APIs": pending-counts 6× in 11 min, ~2 s each): every 60 s and only while the tab is open.
      const interval = setInterval(() => { if (typeof document === "undefined" || !document.hidden) fetchAdminPendingCounts(); }, 60000);
      return () => clearInterval(interval);
    }
  }, [user?.user_id]);

  const [sidebarPosition, setSidebarPosition] = useState(() => {
    return safeStorage.getItem("sidebar_position") || "left";
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    return safeStorage.getItem("sidebar_open") !== "false";
  });

  const toggleSidebarPosition = () => {
    const nextPos = sidebarPosition === "left" ? "right" : "left";
    setSidebarPosition(nextPos);
    safeStorage.setItem("sidebar_position", nextPos);
    toast.success(`Sidebar moved to the ${nextPos === 'left' ? 'left' : 'right'} side! ↔️`);
  };

  const toggleSidebarOpen = () => {
    const nextOpen = !sidebarOpen;
    setSidebarOpen(nextOpen);
    safeStorage.setItem("sidebar_open", String(nextOpen));
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  // Handle click outside to close avatar menu
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ✅ API INTEGRATION: Fetch badge data (active threads count & pending work)
  useEffect(() => {
    const fetchBadgeData = async () => {
      if (!user) return;
      try {
        // (session 23) The inbox badge comes from the light count poller above. This used to
        // download the WHOLE populated inbox every 30 s, cache bypassed, on every page.

        // Fetch pending work for creator deals.
        // NOTE: there is no GET /deals list endpoint on the backend — the list of a
        // user's deals/collabs lives at GET /collabs (see backend/content_submissions_routes.ts),
        // which returns { sent, received, waves_sent, waves_received, campaign_applications }.
        if (user.role === "creator" || user.role === "influencer") {
          const collabsResponse = await api.get("collabs", { bypassCache: true });
          const c = collabsResponse.data || {};

          // Same "finished" definition the Collabs page uses, so the badge agrees with the list.
          const isFinished = (status) => {
            const s = String(status || "").toUpperCase();
            return ["COMPLETED", "DECLINED", "REJECTED", "CANCELLED", "PAID", "DELIVERED", "CLOSED", "SUCCESS"].includes(s);
          };

          const incoming = [
            ...(Array.isArray(c.received) ? c.received : []),
            ...(Array.isArray(c.waves_received) ? c.waves_received : []),
            ...(Array.isArray(c.campaign_applications) ? c.campaign_applications : []),
          ];

          setDealsPending(incoming.some((item) => !isFinished(item?.status))); // v344: own flag
        }
      } catch (err) {
        // This runs every 30s in the background. A dropped wifi packet or a server restart
        // is not an application error, and logging it as one fills the console with red
        // that hides real problems. Genuine failures still surface.
        const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
        const isTransientNetwork =
          isOffline || err?.message === "Network Error" || err?.code === "ERR_NETWORK" || err?.code === "ECONNABORTED";
        const isAuth = err?.response?.status === 401 || err?.response?.status === 403;
        if (!isTransientNetwork && !isAuth) {
          console.error("[Layout] Failed to fetch badge data:", err);
        }
        // Badges keep their last value; they refresh on the next poll.
      }
    };

    fetchBadgeData();

    // Pending-work dot for creators only (collabs). 60 s, and never while the tab is hidden.
    const interval = setInterval(() => { if (!document.hidden) fetchBadgeData(); }, 60000);
    return () => clearInterval(interval);
    // v344: keyed on id/role, not the whole user object (refreshUser runs every 60 s)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_id, user?.role]);

  // v416 (M1): desktop / tablet Log Out asks first, like the phone settings sheet.
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const askLogout = () => setLogoutConfirmOpen(true);
  const renderLogoutConfirm = () => (
    <Presence>{logoutConfirmOpen && (
      <ModalPortal>
        <PopupBackdrop
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => !loggingOut && setLogoutConfirmOpen(false)}
        >
          <PopupPanel kind="auto" below={640} onClose={() => !loggingOut && setLogoutConfirmOpen(false)} closeOnEscape={!loggingOut}
            aria-labelledby="layout-logout-title"
            className="w-full sm:max-w-sm bg-white rounded-t-[26px] sm:rounded-2xl p-5 space-y-4 shadow-xl"
            style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 id="layout-logout-title" className="text-lg font-bold text-slate-900 font-display">Log out of Ybex?</h3>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">You'll need to sign in again to use your account.</p>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" autoFocus disabled={loggingOut} onClick={() => setLogoutConfirmOpen(false)}
                className="flex-1 min-h-[44px] bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-xl disabled:opacity-60 cursor-pointer">Cancel</button>
              <button type="button" disabled={loggingOut} onClick={async () => { setLoggingOut(true); try { await onLogout(); } catch (e) { setLoggingOut(false); toast.error("Couldn't log out. Please try again."); } }}
                className="flex-1 min-h-[44px] bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-sm rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer">
                <LogOut size={16} /> {loggingOut ? "Logging out…" : "Log out"}
              </button>
            </div>
          </PopupPanel>
        </PopupBackdrop>
      </ModalPortal>
    )}</Presence>
  );

  const onLogout = async () => {
    await logout();
    // Do not use React Router navigate here because modifying the user state
    // will trigger ProtectedRoute's <Navigate> to bounce the user automatically.
    // If on an unprotected route, they just stay logged out.
    // To be perfectly safe against DOM caching issues on logout, a hard reload is best:
    window.location.href = "/login";
  };

  const isAdminUser = user && (user.role === 'admin' || user.team_role === 'sub_admin');
  const isFullAdmin = user?.role === 'admin' && user?.team_role !== 'sub_admin';
  const [adminUsersOpen, setAdminUsersOpen] = useState(null); // v419: null = follow the page (open on Users pages)
  const usersMenuOpen = adminUsersOpen ?? (location.pathname.startsWith("/admin") && new URLSearchParams(location.search).get("tab") === "users");
  const isSubAdmin = user?.team_role === 'sub_admin';

  const hasAdminPerm = (permKey) => {
    if (isFullAdmin) return true;
    if (!isSubAdmin) return false;
    if (!permKey) return true;
    if (!user?.permissions || !Array.isArray(user.permissions)) return false;

    // Alias map to support granular and legacy permission keys seamlessly
    const aliases = {
      manage_users: ['manage_users'],
      manage_waitlist: ['manage_waitlist', 'manage_users'],
      manage_kyc: ['manage_kyc'],
      manage_campaigns: ['manage_campaigns'],
      manage_chat: ['manage_chat', 'manage_campaigns'],
      manage_disputes: ['manage_disputes', 'manage_reports'],
      manage_reports: ['manage_reports', 'manage_disputes'],
      manage_escrow: ['manage_escrow'],
      manage_ugc: ['manage_ugc', 'manage_escrow'],
      manage_logs: ['manage_logs', 'manage_activity_logs', 'manage_users'],
      manage_activity_logs: ['manage_activity_logs', 'manage_logs', 'manage_users'],
      manage_blog: ['manage_blog'],
      manage_helpdesk: ['manage_helpdesk'],
      manage_settings: ['manage_settings', 'manage_banners', ...PLATFORM_SETTINGS_SUBS.map((x) => x.key)],
      manage_banners: ['manage_banners', 'manage_settings'],
      view_analytics: ['view_analytics']
    };

    const keysToCheck = aliases[permKey] || [permKey];

    return user.permissions.some((p) => {
      if (typeof p === 'string') return keysToCheck.includes(p);
      if (p && typeof p === 'object') {
        const pKey = p.permission_key || p.key;
        return keysToCheck.includes(pKey) && (p.allowed === true || p.allowed === 1 || p.allowed === 'true');
      }
      return false;
    });
  };

  const fullScreenRoutes = [
    '/onboarding',
    '/creator-campaign-flow',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    // KYC capture
    '/kyc',
    '/creator/kyc',
    '/brand/kyc',
    // Campaign / brief post wizards — each ends in its own pinned publish button
    '/brand/campaigns/create',
    '/brand/ugc/post'
  ];

  const isFullScreenPage = (pathname) => {
    return fullScreenRoutes.some(route => pathname === route || pathname.startsWith(route + '/'));
  };

  const isFullBleedMobilePage = (pathname) => {
    if (isFullScreenPage(pathname)) return true;
    return (
      pathname === '/dashboard' ||
      pathname === '/' ||
      pathname === '/brand' ||
      pathname === '/brand/dashboard' ||
      pathname === '/creator/ugc' ||
      pathname.startsWith('/creator/ugc') ||
      pathname === '/settings' ||
      pathname === '/creator/settings' ||
      pathname === '/brand/settings' ||
      pathname === '/brand/account' ||
      pathname === '/creator/profile' ||
      pathname === '/brand/profile' ||
      pathname === '/profile' ||
      pathname === '/profile/overview' ||
      pathname === '/deals' ||
      pathname === '/collabs' ||
      pathname === '/brand/kyc' ||
      pathname === '/creator/kyc' ||
      pathname === '/kyc' ||
      pathname === '/brand/campaigns/create' ||
      pathname.startsWith('/brand/campaigns/create') ||
      pathname === '/brand/ugc/post' ||
      pathname.startsWith('/brand/ugc/post')
    );
  };

  const isMobileTabRoot = (path, role) => {
    if (role === 'brand') {
      return (
        path === '/brand' ||
        path === '/brand/dashboard' ||
        (path === '/dashboard' && role === 'brand') ||
        path === '/brand/campaigns' ||
        path === '/brand/discover'
      );
    }
    if (role === 'admin' || role === 'sub_admin') {
      return path === '/admin';
    }
    // Creator tab roots:
    return (
      path === '/dashboard' ||
      path === '/' ||
      path === '/deals' ||
      path === '/collabs' ||
      path === '/explore' ||
      path === '/creators' ||
      path === '/campaigns'
    );
  };

  const isChatThreadOpen = Boolean(
    (location.pathname.startsWith('/chat/') && location.pathname.length > 6) ||
    (location.pathname.startsWith('/brand/inbox/') && location.pathname.length > 13) ||
    (location.pathname.startsWith('/creator/inbox/') && location.pathname.length > 15) ||
    (location.pathname.startsWith('/inbox/') && location.pathname.length > 7) ||
    ((location.pathname === '/chat' || location.pathname === '/inbox' || location.pathname === '/brand/inbox' || location.pathname === '/creator/inbox') && (
      location.search?.includes('creator_id=') ||
      location.search?.includes('creator=') ||
      location.search?.includes('thread=') ||
      location.search?.includes('threadId=') ||
      location.search?.includes('dealId=') ||
      location.search?.includes('deal_id=') ||
      location.search?.includes('orderId=') ||
      location.search?.includes('order_id=') ||
      location.search?.includes('id=')
    ))
  );

  const renderMobileTopHeader = () => {
    if (!user) return null;
    if (isChatThreadOpen) return null;
    // Session 39 (M12): creator pages draw their own mobile headers; the old desktop-era
    // "Good afternoon" bar sat on top of them (Campaigns, Explore).
    if ((user.role || 'creator') === 'creator') return null;
    // Session 43 (Ravi): same for brands — the "Good morning carboex" strip sat on top of Campaigns.
    if (isBrandLike(user.role)) return null; // v416
    // v419: the phone admin (AdminMobile) draws its own search + notifications header.
    if (user.role === 'admin' || user.team_role === 'sub_admin' || user.role === 'sub_admin') return null;

    // Never render the generic mobile top header on inbox or chat
    if (
      location.pathname.startsWith('/brand/inbox') ||
      location.pathname.startsWith('/creator/inbox') ||
      location.pathname.startsWith('/inbox') ||
      location.pathname.startsWith('/chat')
    ) {
      return null;
    }

    // Never render generic mobile top header for Creator or Brand homes (they render their own native mobile headers)
    if (
      (user.role === 'creator' && (location.pathname === '/dashboard' || location.pathname === '/')) ||
      (user.role === 'brand' && (location.pathname === '/brand' || location.pathname === '/brand/dashboard' || location.pathname === '/dashboard'))
    ) {
      return null;
    }

    // Only render mobile top header on primary tab roots
    if (!isMobileTabRoot(location.pathname, user.role)) {
      return null;
    }

    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const rawName = user.name || user.full_name || user.fullName || user.firstName || user.first_name || user.display_name || user.displayName || user.email?.split('@')[0] || 'User';
    const cleanName = typeof rawName === 'string' ? rawName.trim() : String(rawName || '').trim();
    const firstName = cleanName ? (cleanName.split(/\s+/)[0] || cleanName) : 'User';

    return (
      <header className="md:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-200/80 h-14 flex items-center justify-between px-4 w-full">
        <div className="flex flex-col">
          <span className="text-[11px] font-medium text-gray-500 tracking-tight">{greeting}</span>
          <span className="text-[14px] font-bold text-gray-900 leading-tight opacity-90">{firstName}</span>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
        </div>
      </header>
    );
  };

  // v416 (M13): on the phone these brand screens had no bottom nav and no way back (iPhone has no back key).
  const MOBILE_DEAD_ENDS = ["/help", "/refer", "/brand/settings", "/brand/account"];
  const renderMobileBackBar = () => {
    if (!user || !isBrandLike(user.role)) return null;
    if (!MOBILE_DEAD_ENDS.includes(location.pathname)) return null;
    if (location.pathname.startsWith("/brand/") && new URLSearchParams(location.search).get("section")) return null; // sub-screens have their own back
    const goBack = () => {
      if (typeof window !== "undefined" && window.history.length > 1 && location.key !== "default") navigate(-1);
      else navigate("/dashboard");
    };
    return (
      <div className="md:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-100 flex items-center px-2"
        style={{ paddingTop: "var(--yb-sat, 0px)", minHeight: "calc(48px + var(--yb-sat, 0px))" }}>
        <button type="button" onClick={goBack} aria-label="Go back"
          className="min-h-[44px] min-w-[44px] px-2 flex items-center gap-1 text-sm font-semibold text-gray-700 rounded-xl active:bg-gray-100 cursor-pointer">
          <ChevronLeft size={20} /> Back
        </button>
      </div>
    );
  };

  const renderMobileBottomNav = () => {
    if (!user) return null;

    // Spec: the bar is hidden on desktop widths, on full-screen flows (KYC capture,
    // the campaign post wizard, an open chat thread) and on any screen carrying its
    // own pinned primary button.
    const fullScreenRoutes = [
      '/onboarding',
      '/creator-campaign-flow',
      '/login',
      '/signup',
      '/forgot-password',
      '/reset-password',
      '/verify-email',
      // KYC capture
      '/kyc',
      '/creator/kyc',
      '/brand/kyc',
      // Campaign / brief post wizards — each ends in its own pinned publish button
      '/brand/campaigns/create',
      '/brand/ugc/post'
    ];

    // Hide mobile bottom nav when viewing a thread on mobile (has threadId in URL)
    if (isChatThreadOpen) {
      return null;
    }

    if (fullScreenRoutes.some(route => location.pathname === route || location.pathname.startsWith(route + '/'))) {
      return null;
    }

    // Session 39 (M13, Ravi): creators see the bar only on the five main pages; every page
    // opened from them (details, Earnings, KYC, settings, workspace…) goes back with the phone's back.
    if ((user.role || 'creator') === 'creator') {
      if (!isCreatorNavPage(location.pathname, location.search) || bottomNavHiddenByScreen) return null;
    }
    if (isBrandLike(user.role)) { // v416
      if (!isBrandNavPage(location.pathname, location.search) || bottomNavHiddenByScreen) return null;
    }
    // v419: the phone admin has its own bottom bar (Overview / Users / KYC / Payments / More) on /admin.
    if ((user.role === 'admin' || user.team_role === 'sub_admin' || user.role === 'sub_admin') && location.pathname.startsWith('/admin')) return null;

    return (
      <BottomNav
        role={user.role || 'creator'}
        hasPendingWork={hasPendingWork}
        activeThreadsCount={activeThreadsCount}
      />
    );
  };

  const renderMobileDrawer = () => (
    <AnimatePresence>
      {menuOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 md:hidden"
          />
          <motion.div
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            style={{ paddingTop: "calc(var(--yb-sat, 0px) + 16px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }} /* Session 43: below the purple clock strip */
              /* v330: full height above the bottom nav (was bottom-16 under the 84px nav, so "Log Out" hid behind it) */
              className="fixed top-0 right-0 bottom-0 w-[82vw] max-w-[320px] z-[60] md:hidden bg-white border-l border-gray-200 shadow-2xl p-4 flex flex-col gap-2 overflow-y-auto"
          >
            {user && (
              <div className="bg-[#F5F0FF] rounded-2xl p-3 flex items-center justify-between gap-2 mb-2 border border-[var(--violet-border)]">
                <div className="flex items-center gap-3 min-w-0">
                  {(user.picture || user.avatar) && !avatarBroken ? (
                    <img src={user.picture || user.avatar} alt="" onError={() => setAvatarBroken(true)} className="w-10 h-10 rounded-full object-cover shrink-0 border border-white shadow-xs" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[var(--violet)] text-white flex items-center justify-center text-sm font-bold shrink-0">
                      {(user.name || "U").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {/* v332: no blank name for an account without one; "talent_manager" shown as words */}
                    <div className="text-sm font-bold truncate text-[var(--text-primary)] leading-tight">{user.name || user.email?.split("@")[0] || "My account"}</div>
                    <div className="text-xs text-gray-500 truncate font-medium capitalize mt-0.5">{String(user.role || "User").replace(/_/g, " ")}</div>
                  </div>
                </div>
                <button
                  onClick={() => setMenuOpen(false)} /* v332: 40px tap target (was ~30px) */
                  className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-[var(--violet)]/10 text-gray-500 hover:text-[var(--violet)] transition-colors shrink-0 cursor-pointer"
                  aria-label="Close menu"
                >
                  <X size={18} />
                </button>
              </div>
            )}

            <div className="space-y-1">
              {isAdminUser ? (
                <>
                  {/* v419: same admin menu as the sidebar (ADMIN_NAV) */}
                  {adminNavFolded(adminNavFor(hasAdminPerm, isFullAdmin, (it) => adminItemAllowed(user, it))).map((g) => (
                    <div key={g.group || "top"}>
                      {g.group && <div className="px-3.5 pt-3 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-gray-400">{g.group}</div>}
                      {g.items.flatMap((it) => (it.children ? [{ ...it, children: null, header: true }, ...it.children.map((ch) => ({ ...ch, sub: true }))] : [it])).map((it) => it.header
                        ? <div key={it.id} className="px-3.5 pt-3 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-gray-400">{it.label}</div>
                        : (
                        <Link key={it.id} onClick={() => setMenuOpen(false)} to={adminNavTo(it)} className={`px-3.5 py-2.5 rounded-xl hover:bg-gray-100 text-gray-800 font-semibold text-xs flex items-center gap-3 ${it.sub ? "pl-6" : ""}`}>{React.cloneElement(ADMIN_ICON[it.icon] || <LayoutGrid />, { size: 16 })}{it.label}</Link>
                      ))}
                    </div>
                  ))}
                </>
              ) : user?.role !== 'creator' ? (
                <>
                  <Link onClick={() => setMenuOpen(false)} to="/dashboard" className="px-3.5 py-2.5 rounded-xl hover:bg-gray-100 text-gray-800 font-semibold text-xs flex items-center gap-3"><LayoutGrid size={16} />Dashboard</Link>
                  <Link onClick={() => setMenuOpen(false)} to="/creators" className="px-3.5 py-2.5 rounded-xl hover:bg-gray-100 text-gray-800 font-semibold text-xs flex items-center gap-3"><Search size={16} />Explore Creators</Link>
                  <Link onClick={() => setMenuOpen(false)} to="/brand/campaigns" className="px-3.5 py-2.5 rounded-xl hover:bg-gray-100 text-gray-800 font-semibold text-xs flex items-center gap-3"><Megaphone size={16} />My Campaigns</Link>
                  <Link onClick={() => setMenuOpen(false)} to="/brand/ugc/briefs" className="px-3.5 py-2.5 rounded-xl hover:bg-gray-100 text-gray-800 font-semibold text-xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Video size={16} className="text-[var(--violet)]" />
                      <span>Instant UGC</span>
                    </div>
                    <span className="px-1.5 py-0.5 text-[11px] font-black bg-[var(--violet)] text-white rounded-md uppercase tracking-wider shadow-xs">BETA</span>
                  </Link>
                  <Link onClick={() => setMenuOpen(false)} to="/brand/inbox" className="px-3.5 py-2.5 rounded-xl hover:bg-gray-100 text-gray-800 font-semibold text-xs flex items-center gap-3"><MessageCircle size={16} />Inbox{activeThreadsCount > 0 && <span className="ml-auto bg-[var(--violet)] text-white text-[11px] font-bold min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full">{activeThreadsCount > 99 ? "99+" : activeThreadsCount}</span>/* v358 */}</Link>
                  <div className="h-px bg-gray-100 my-1.5" />
                  <Link onClick={() => setMenuOpen(false)} to="/brand/payments" className="px-3.5 py-2.5 rounded-xl hover:bg-gray-100 text-gray-800 font-semibold text-xs flex items-center gap-3"><Wallet size={16} />Payments</Link>
                  <Link onClick={() => setMenuOpen(false)} to="/brand/profile" className="px-3.5 py-2.5 rounded-xl hover:bg-gray-100 text-gray-800 font-semibold text-xs flex items-center gap-3"><User size={16} />Public Profile</Link>
                  <Link onClick={() => setMenuOpen(false)} to="/refer" className="px-3.5 py-2.5 rounded-xl hover:bg-gray-100 text-gray-800 font-semibold text-xs flex items-center gap-3"><Gift size={16} />Refer & Earn</Link>
                  <Link onClick={() => setMenuOpen(false)} to="/help" className="px-3.5 py-2.5 rounded-xl hover:bg-gray-100 text-gray-800 font-semibold text-xs flex items-center gap-3"><HelpCircle size={16} />Help Center</Link>
                </>
              ) : (
                <>
                  <Link onClick={() => setMenuOpen(false)} to="/dashboard" className="px-3.5 py-2.5 rounded-xl hover:bg-gray-100 text-gray-800 font-semibold text-xs flex items-center gap-3"><LayoutGrid size={16} />Dashboard</Link>
                  <Link onClick={() => setMenuOpen(false)} to="/campaigns" className="px-3.5 py-2.5 rounded-xl hover:bg-gray-100 text-gray-800 font-semibold text-xs flex items-center gap-3"><Compass size={16} />Live Campaigns</Link>
                  <Link onClick={() => setMenuOpen(false)} to="/creator/ugc" testId="tour-nav-ugc" className="px-3.5 py-2.5 rounded-xl hover:bg-gray-100 text-gray-800 font-semibold text-xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Zap size={16} className="text-[var(--violet)]" />
                      <span>Explore UGC</span>
                    </div>
                    <span className="px-1.5 py-0.5 text-[11px] font-black bg-[var(--violet)] text-white rounded-md uppercase tracking-wider shadow-xs">BETA</span>
                  </Link>
                  <Link onClick={() => setMenuOpen(false)} to="/collabs" className="px-3.5 py-2.5 rounded-xl hover:bg-gray-100 text-gray-800 font-semibold text-xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Briefcase size={16} />Ongoing Deals
                    </div>
                    {hasPendingWork && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />}
                  </Link>
                  <Link onClick={() => setMenuOpen(false)} to="/chat" className="px-3.5 py-2.5 rounded-xl hover:bg-gray-100 text-gray-800 font-semibold text-xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <MessageCircle size={16} />Inbox
                    </div>
                    {activeThreadsCount > 0 && (
                      <div className="bg-[var(--violet)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{activeThreadsCount > 99 ? "99+" : activeThreadsCount}</div>/* v332: capped, valid padding */
                    )}
                  </Link>
                  <Link onClick={() => setMenuOpen(false)} to="/earnings" className="px-3.5 py-2.5 rounded-xl hover:bg-gray-100 text-gray-800 font-semibold text-xs flex items-center gap-3"><Wallet size={16} />Earnings</Link>
                  <div className="h-px bg-gray-100 my-1.5" />
                  <Link onClick={() => setMenuOpen(false)} to="/profile/overview" className="px-3.5 py-2.5 rounded-xl hover:bg-gray-100 text-gray-800 font-semibold text-xs flex items-center gap-3"><User size={16} />Public Profile</Link>
                  <Link onClick={() => setMenuOpen(false)} to="/refer" className="px-3.5 py-2.5 rounded-xl hover:bg-gray-100 text-gray-800 font-semibold text-xs flex items-center gap-3"><Gift size={16} />Refer & Earn</Link>
                  <Link onClick={() => setMenuOpen(false)} to="/help" className="px-3.5 py-2.5 rounded-xl hover:bg-gray-100 text-gray-800 font-semibold text-xs flex items-center gap-3"><HelpCircle size={16} />Help Center</Link>
                </>
              )}
              <div className="h-px bg-gray-100 my-1.5" />
              <Link onClick={() => setMenuOpen(false)} to="/settings" className="px-3.5 py-2.5 rounded-xl hover:bg-gray-100 text-gray-800 font-semibold text-xs flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <SettingsIcon size={16} />
                  <span>Settings</span>
                  {kycSettingsBadge}
                </div>
              </Link>
            </div>

            <div className="mt-auto pt-3 border-t border-gray-100">
              <button
                onClick={() => { setMenuOpen(false); askLogout(); /* v416 (M1) */ }}
                className="w-full px-3.5 py-2.5 rounded-xl text-rose-500 font-bold text-xs text-left flex items-center gap-3 hover:bg-rose-50/80 transition-colors cursor-pointer"
              >
                <LogOut size={16} />Log Out
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  // v346: a creator who tapped "Finish later" uses the app (App.jsx lets them in) — give them the normal
  // layout with the bottom nav, not the bare onboarding shell.
  const finishedLater = user && (user.role || "creator") === "creator" && isFinishLater(user.user_id || user.id);
  const isOnboardingUser = user && !isAdminUser && !finishedLater && !user.onboarded && !user.onboarding_completed && !user.onboarding_complete;
  if (location.pathname === "/onboarding" || isOnboardingUser) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] relative transition-colors duration-200 flex flex-col">
        {/* Main Onboarding Container without unwanted header */}
        <main className="w-full flex-1 min-h-screen flex flex-col">{children}</main>
      </div>
    );
  }

  const isAuthPage = location.pathname === "/login" || location.pathname === "/signup" || location.pathname === "/onboarding";
  const useSidebar = user && !isAuthPage && location.pathname !== "/";

  const SidebarNavItem = ({ to, icon, children, testId, badge, isBold, also = [], isActiveOverride }) => {
    let isExactMatch = location.pathname + location.search === to;
    if (typeof isActiveOverride === "boolean") isExactMatch = isActiveOverride; // v419: admin menu decides by tab/view/role
    // v415: sub-pages light their section too (/brand/dashboard → Dashboard, /brand/ugc/orders → Instant UGC, /brand/settings → Settings)
    if (also.some((p) => location.pathname === p || location.pathname.startsWith(p + "/"))) isExactMatch = true;
    if (to === "/admin?tab=dashboard" && location.pathname === "/admin" && !location.search) {
       isExactMatch = true;
    } else if (!to.includes("?") && (location.pathname === to || (to !== "/dashboard" && location.pathname.startsWith(to)))) {
       isExactMatch = true;
    } else if (to === "/dashboard" && location.pathname === "/dashboard") {
       isExactMatch = true;
    }

    // Clone icon to override size and style
    const clonedIcon = React.isValidElement(icon) 
      ? React.cloneElement(icon, { size: 16, className: "shrink-0" }) 
      : icon;

    return (
      <Link 
        to={to} 
        data-testid={testId} 
        aria-current={isExactMatch ? "page" : undefined}
        // v415: active and idle rows keep the same box (the 2px left border made the label shift right, bold made it wider);
        // idle text is gray-600 (contrast) and turns dark on hover.
        className={`flex items-center justify-between px-3 py-2 border-l-2 rounded-r-[10px] rounded-l-[4px] text-sm transition-colors duration-150 ${isExactMatch ? `bg-[#F5F0FF] text-[var(--violet)] border-[var(--violet)] font-semibold` : `border-transparent hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] ${isBold ? 'font-semibold text-[var(--text-primary)]' : 'text-gray-600'}`}`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {clonedIcon}
          <span className="truncate">{children}</span>
        </div>
        {badge && <div className="shrink-0 ml-1.5 flex items-center">{badge}</div>}
      </Link>
    );
  };


  if (useSidebar) {
    if (user?.role === 'creator') {
      const isExactMatch = (path) => location.pathname === path;
      return (
        <div className={`app-shell flex h-screen bg-[var(--bg-base)] text-[var(--text-primary)] font-sans overflow-hidden ${sidebarPosition === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
          
          {/* Main Sidebar */}
          {sidebarOpen && (
            <aside className={`w-56 flex-shrink-0 bg-white hidden md:flex flex-col z-10 border-[var(--border-default)] ${sidebarPosition === 'left' ? 'border-r' : 'border-l'}`}>
              <div className="p-5 pb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link to="/dashboard">
                    <YbexLogo className="h-8 text-[var(--violet)] w-auto max-w-[120px]" />
                  </Link>
                </div>
              </div>
            
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 custom-scrollbar">
              <SidebarNavItem to="/dashboard" icon={<LayoutGrid />}>Dashboard</SidebarNavItem>
              <SidebarNavItem to="/campaigns" icon={<Compass />} testId="tour-nav-campaigns">Live Campaigns</SidebarNavItem>
              <SidebarNavItem 
                to="/creator/ugc" testId="tour-nav-ugc" 
                icon={<Zap className="text-[var(--violet)]" />}
                badge={<span className="px-1.5 py-0.5 text-[11px] font-black bg-[var(--violet)] text-white rounded-md uppercase tracking-wider leading-none shrink-0 ml-auto shadow-xs">BETA</span>}
              >
                Explore UGC
              </SidebarNavItem>
              <SidebarNavItem to="/collabs" icon={<Briefcase />} testId="tour-nav-deals" badge={hasPendingWork ? <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)] shrink-0" /> : null}>Ongoing Deals</SidebarNavItem>
              
              <div className="relative">
                <SidebarNavItem to="/chat" icon={<MessageCircle />} testId="tour-nav-inbox">Inbox</SidebarNavItem>
                {activeThreadsCount > 0 && (
                  <div className="absolute right-2 top-2 bg-[var(--violet)] text-white text-[11px] font-bold min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full">{activeThreadsCount > 99 ? "99+" : activeThreadsCount}</div>/* v332: big counts no longer burst the circle */
                )}
              </div>

              <SidebarNavItem to="/earnings" icon={<Wallet />} testId="tour-nav-earnings">Earnings</SidebarNavItem>

              <div className="py-2"><div className="h-px bg-[var(--border-default)] w-full"></div></div>

              <SidebarNavItem to="/profile/overview" icon={<User />}>Public Profile</SidebarNavItem>
              <SidebarNavItem to="/refer" icon={<Gift />}>Refer & Earn</SidebarNavItem>
              <SidebarNavItem to="/help" icon={<HelpCircle />}>Help Center</SidebarNavItem>
              <SidebarNavItem to="/settings" icon={<SettingsIcon />} testId="tour-nav-settings" badge={kycSettingsBadge}>Settings</SidebarNavItem>
            </div>

            <div className="p-3 mt-auto bg-white border-t border-[var(--border-default)]">
              <div className="bg-[#F5F0FF] rounded-xl p-2.5 flex items-center gap-2">
                {(user?.picture || user?.avatar) && !avatarBroken ? (
                  <img src={user.picture || user.avatar} alt="" onError={() => setAvatarBroken(true)} className="w-[30px] h-[30px] rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-[30px] h-[30px] rounded-full bg-[var(--violet)] text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {(user?.name || user?.email || "C").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-[var(--text-primary)] truncate leading-tight">{/* v330: no placeholder person's name for an account without one */}{user?.name || user?.email?.split("@")[0] || "Creator"}</h4>
                  <p className="text-[10px] text-[var(--text-secondary)] truncate font-medium capitalize">{user?.role || "Creator"}</p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 mt-2.5 px-1">
                <Link to="/profile/overview" className="text-[11px] font-medium text-[var(--violet)] hover:underline flex items-center gap-1 transition-colors">
                  Public Profile <ArrowRight size={12} />
                </Link>
                <button
                  onClick={askLogout} /* v416 (M1): confirm first; 12px text, 32px tap row */
                  className="text-xs font-medium text-rose-600 hover:text-rose-700 flex items-center gap-1 transition-colors w-full min-h-[32px]"
                >
                  <LogOut size={12} /> Log Out
                </button>
              </div>
            </div>
          </aside>
          )}

          {!sidebarOpen && (
            <button
              onClick={toggleSidebarOpen}
              className={`fixed hidden md:flex top-24 z-40 py-3 px-4 bg-gradient-to-r from-[var(--violet)] to-[#7C3AED] hover:from-[#7C3AED] hover:to-[var(--violet)] text-white shadow-xl hover:scale-105 transition-all duration-200 items-center gap-2 border border-white/10 cursor-pointer ${sidebarPosition === 'left' ? 'left-0 rounded-r-2xl border-l-0' : 'right-0 rounded-l-2xl border-r-0'}`}
              title="Open Sidebar"
            >
              {sidebarPosition === 'left' ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              <span className="text-xs font-black uppercase tracking-widest hidden sm:inline">Sidebar</span>
            </button>
          )}

          {/* Mobile Drawer for Creator */}
          {renderMobileDrawer()}
          {renderLogoutConfirm() /* v416 (M1) */}

          {/* Mobile Bottom Dock Navigation */}
          {renderMobileBottomNav()}
          
          {/* Main Content Area */}
          <div id="app-scroll-container" className={`flex-1 flex flex-col min-w-0 h-full ${location.pathname.startsWith("/chat") || location.pathname.startsWith("/brand/inbox") || location.pathname.startsWith("/creator/inbox") || location.pathname.startsWith("/inbox") ? 'h-dvh overflow-hidden' : 'overflow-y-auto'}`}>
             {/* Session 41: install banner — not inside chat (fixed keyboard box) */}
             {!(location.pathname === "/" || location.pathname.startsWith("/chat") || location.pathname.includes("/inbox")) && <PWAInstallPrompt />}
             <QuickActionsMobile />
             <DesktopEva />
             {/* Mobile Header for Creator */}
             {renderMobileTopHeader()}
             <main className={`flex-1 shrink-0 flex flex-col ${
               location.pathname.startsWith("/chat") || location.pathname.startsWith("/brand/inbox") || location.pathname.startsWith("/creator/inbox") || location.pathname.startsWith("/inbox")
                 ? 'h-full overflow-hidden' 
                 : isFullBleedMobilePage(location.pathname)
                   ? `p-0 md:p-6 lg:p-8 ${isFullScreenPage(location.pathname) ? 'pb-0 md:pb-8' : 'mobile-nav-safe-pad md:pb-8'}`
                   : `p-0 sm:p-6 lg:p-8 ${isFullScreenPage(location.pathname) ? 'pb-0 md:pb-8' : 'mobile-nav-safe-pad md:pb-8'}`
             }`}>
                {children}
                {renderFooter() /* v415 — <HomeCityFooter variant={footerProps.variant} /> once the brand home has loaded */}
             </main>
          </div>
        </div>
      );
    }

    return (
      <div className={`app-shell flex h-screen bg-[var(--bg-base)] text-[var(--text-primary)] relative transition-colors duration-200 overflow-hidden ${sidebarPosition === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
         {/* Desktop Sidebar */}
         {sidebarOpen && (
           <aside className={`w-56 flex-shrink-0 bg-white hidden md:flex flex-col border-[var(--border-default)] ${sidebarPosition === 'left' ? 'border-r' : 'border-l'}`}>
              <div className="p-5 pb-4 flex items-center justify-between">
                <Link to={user?.role === 'admin' || user?.team_role === 'sub_admin' ? "/admin" : "/dashboard"} className="flex flex-col gap-1">
                  <YbexLogo className="h-8 text-[var(--violet)] w-auto max-w-[120px]" />
                </Link>
              </div>
            
            <div className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
               {user?.role === 'admin' || user?.team_role === 'sub_admin' ? (
                 <>
                   {/* v419: one admin menu (src/lib/adminSearch.js ADMIN_NAV) — the same list the phone admin uses */}
                   {adminNavFolded(adminNavFor(hasAdminPerm, isFullAdmin, (it) => adminItemAllowed(user, it))).map((g) => (
                     <div key={g.group || "top"} className={g.group ? "pt-3" : ""}>
                       {g.group && <div className="px-2.5 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-[#9CA3AF]">{g.group}</div>}
                       {g.items.map((it) => it.children ? (
                         /* v419 (Ravi): Users = one row that opens its list (open by itself on any Users page) */
                         <div key={it.id}>
                           <button type="button" onClick={() => setAdminUsersOpen((o) => !o)} aria-expanded={usersMenuOpen} data-testid="nav-users-toggle"
                             className={`w-full flex items-center gap-2.5 px-3 py-2 border-l-2 border-transparent rounded-r-[10px] rounded-l-[4px] text-sm transition-colors duration-150 cursor-pointer hover:bg-[var(--bg-elevated)] ${location.pathname.startsWith("/admin") && new URLSearchParams(location.search).get("tab") === "users" ? "text-[var(--violet)] font-semibold" : "text-gray-600"}`}>
                             {React.cloneElement(ADMIN_ICON[it.icon] || <Users />, { size: 16, className: "shrink-0" })}<span className="flex-1 text-left truncate">{it.label}</span>
                             <ChevronDown size={15} className={`transition-transform ${usersMenuOpen ? "rotate-180" : ""}`} />
                           </button>
                           {usersMenuOpen && (
                             <div className="ml-5 pl-2 border-l border-gray-100 space-y-0.5" data-testid="nav-users-list">
                               {it.children.map((ch) => (
                                 <Link key={ch.id} to={adminNavTo(ch)} className={`block px-3 py-1.5 rounded-lg text-[13px] font-medium ${adminNavActive(ch, location.search) && location.pathname.startsWith("/admin") ? "bg-[#F3EEFF] text-[#7C3AED]" : "text-gray-600 hover:bg-gray-50"}`}>{ch.label}</Link>
                               ))}
                             </div>
                           )}
                         </div>
                       ) : (
                         <SidebarNavItem key={it.id} to={adminNavTo(it)} icon={ADMIN_ICON[it.icon] || <LayoutGrid />} isActiveOverride={adminNavActive(it, location.search) && location.pathname.startsWith("/admin")}
                           badge={(it.badge && adminPendingCounts[it.badge] > 0) || (it.badges || []).some((k) => adminPendingCounts[k] > 0) ? <span className={`w-2 h-2 rounded-full ${it.badge === "pitches" ? "bg-amber-500" : "bg-rose-500"} animate-pulse shrink-0 ml-auto`} /> : null}>{it.label}</SidebarNavItem>
                       ))}
                     </div>
                   ))}
                 </>
                ) : user?.role !== 'creator' ? (
                  <>
                    <SidebarNavItem to="/dashboard" icon={<LayoutGrid />} also={["/brand/dashboard"]}>Dashboard</SidebarNavItem>{/* v415 */}
                    <SidebarNavItem to="/creators" icon={<Search />} testId="nav-explore-creators" also={["/brand/discover"]}>Explore Creators</SidebarNavItem>
                    <SidebarNavItem to="/brand/campaigns" icon={<Megaphone />} testId="nav-campaigns">My Campaigns</SidebarNavItem>
                    <SidebarNavItem 
                      to="/brand/ugc/briefs" 
                      also={["/brand/ugc"]} /* v415 */
                      icon={<Video className="text-[var(--violet)]" />} 
                      badge={<span className="px-1.5 py-0.5 text-[11px] font-black bg-[var(--violet)] text-white rounded-md uppercase tracking-wider leading-none shrink-0 ml-auto shadow-xs">BETA</span>}
                    >
                      Instant UGC
                    </SidebarNavItem>
                    <div className="relative">{/* v358: brands get the unread badge too (creators had it) */}
                      <SidebarNavItem to="/brand/inbox" icon={<MessageCircle />} testId="tour-nav-brand-inbox">Inbox</SidebarNavItem>
                      {activeThreadsCount > 0 && (
                        <div className="absolute right-2 top-2 bg-[var(--violet)] text-white text-[11px] font-bold min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full">{activeThreadsCount > 99 ? "99+" : activeThreadsCount}</div>
                      )}
                    </div>
                    <div className="py-2"><div className="h-px bg-[var(--border-default)] w-full"></div></div>
                    <SidebarNavItem to="/brand/payments" icon={<Wallet />} testId="tour-nav-escrow">Payments</SidebarNavItem>
                    <div className="py-2"><div className="h-px bg-[var(--border-default)] w-full"></div></div>
                    <SidebarNavItem to="/brand/profile" icon={<User />}>Public Profile</SidebarNavItem>
                    <SidebarNavItem to="/refer" icon={<Gift />}>Refer & Earn</SidebarNavItem>
                    <SidebarNavItem to="/help" icon={<HelpCircle />}>Help Center</SidebarNavItem>
                    <SidebarNavItem to="/settings" icon={<SettingsIcon />} testId="tour-nav-settings" badge={kycSettingsBadge} also={["/brand/settings", "/brand/account", "/brand/kyc"]}>Settings</SidebarNavItem>{/* v415 */}
                  </>
               ) : (
                 <>
                   <SidebarNavItem to="/dashboard" icon={<LayoutGrid />}>Dashboard</SidebarNavItem>
                   <SidebarNavItem to="/campaigns" icon={<Megaphone />} testId="tour-nav-campaigns">Live Campaigns</SidebarNavItem>
                   <SidebarNavItem to="/collabs" icon={<FileText />}>My Applications</SidebarNavItem>
                   <SidebarNavItem to="/chat" icon={<MessageCircle />} testId="tour-nav-inbox">Inbox</SidebarNavItem>
                   <div className="py-2"><div className="h-px bg-[var(--border-default)] w-full"></div></div>
                   <div className="text-[10px] font-semibold text-[#BBBBB5] tracking-[0.7px] uppercase px-2.5 pt-3.5 pb-1">🎬 UGC</div>
                   <SidebarNavItem to="/creator/ugc/browse" icon={<Search />}>Browse Briefs</SidebarNavItem>
                   <SidebarNavItem to="/creator/ugc/orders" icon={<FileText />} badge={hasPendingWork ? <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)] shrink-0" /> : null}>Ongoing Deals</SidebarNavItem>
                   <div className="py-2"><div className="h-px bg-[var(--border-default)] w-full"></div></div>
                   <SidebarNavItem to="/earnings" icon={<Wallet />} testId="tour-nav-earnings">Earnings</SidebarNavItem>
                   <div className="py-2"><div className="h-px bg-[var(--border-default)] w-full"></div></div>
                   <SidebarNavItem to="/help" icon={<HelpCircle />}>Help Center</SidebarNavItem>
                   <SidebarNavItem to="/settings" icon={<SettingsIcon />} testId="tour-nav-settings" badge={kycSettingsBadge}>Settings</SidebarNavItem>
                 </>
               )}
            </div>

            <div className="p-3 border-t border-[var(--border-default)] bg-white mt-auto">
               {user && (
                 <>
                     <div className="bg-[#F5F0FF] rounded-xl p-2.5 flex items-center gap-2 mb-2">
                      {user.picture && !avatarBroken ? (
                         <img src={user.picture} alt="" onError={() => setAvatarBroken(true)} className="w-[30px] h-[30px] rounded-full object-cover shrink-0"/>
                       ) : (
                         <div className="w-[30px] h-[30px] rounded-full bg-[var(--violet)] text-white flex items-center justify-center text-xs font-bold shrink-0">
                           {(user.name || "U").charAt(0).toUpperCase()}
                         </div>
                       )}
                       <div className="flex-1 min-w-0">
                         <div className="text-xs font-bold truncate text-[var(--text-primary)] leading-tight">{user.name || user.email?.split("@")[0] || "My account"}</div>
                         {/* v332: the link opens Settings, so it says Settings (it said "View Profile") */}
                         <Link to="/settings" className="text-[10px] text-[var(--violet)] hover:underline font-medium transition-colors">Settings</Link>
                       </div>
                    </div>
                 </>
               )}

               <div className="flex items-center justify-between px-1 mt-2">
                 <button
                    onClick={askLogout} /* v416 (M1): confirm first; text no longer 11px */
                    className="text-xs font-medium text-rose-600 hover:text-rose-700 transition-colors flex items-center gap-1 min-h-[32px]"
                  >
                    <LogOut size={12}/> Log Out
                  </button>
               </div>
            </div>
         </aside>

         )}

          {!sidebarOpen && (
            <button
              onClick={toggleSidebarOpen}
              className={`fixed hidden md:flex top-24 z-40 py-3 px-4 bg-gradient-to-r from-[var(--violet)] to-[#7C3AED] hover:from-[#7C3AED] hover:to-[var(--violet)] text-white shadow-xl hover:scale-105 transition-all duration-200 items-center gap-2 border border-white/10 cursor-pointer ${sidebarPosition === 'left' ? "left-0 rounded-r-2xl border-l-0" : "right-0 rounded-l-2xl border-r-0"}`}
              title="Open Sidebar"
            >
              {sidebarPosition === 'left' ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              <span className="text-xs font-black uppercase tracking-widest hidden sm:inline">Sidebar</span>
            </button>
          )}

          {/* Mobile Drawer for Sidebar Layout */}
          {renderMobileDrawer()}
          {renderLogoutConfirm() /* v416 (M1) */}

          {/* Mobile Bottom Navigation Dock */}
          {renderMobileBottomNav()}

          {/* Main content scroll area */}
          <div id="app-scroll-container" className={`flex-1 flex flex-col min-w-0 h-full ${location.pathname.startsWith("/chat") || location.pathname.startsWith("/brand/inbox") || location.pathname.startsWith("/creator/inbox") || location.pathname.startsWith("/inbox") ? 'h-dvh overflow-hidden' : 'overflow-y-auto'}`}>
              {/* Session 41: install banner — not inside chat (fixed keyboard box) */}
              {!(location.pathname === "/" || location.pathname.startsWith("/chat") || location.pathname.includes("/inbox")) && <PWAInstallPrompt />}
              <QuickActionsMobile />
              <DesktopEva />
              {/* Mobile Header for Sidebar Layout */}
              {renderMobileTopHeader()}
              {renderMobileBackBar() /* v416 (M13) */}
              <UnderReviewBanner user={user} onOpenModal={() => setUnderReviewModalOpen(true)} />
              <main className={`flex-1 shrink-0 flex flex-col ${
                location.pathname.startsWith("/chat") || location.pathname.startsWith("/brand/inbox") || location.pathname.startsWith("/creator/inbox") || location.pathname.startsWith("/inbox")
                  ? 'h-full overflow-hidden' 
                  : isFullBleedMobilePage(location.pathname)
                    ? `p-0 md:p-6 lg:p-8 ${isFullScreenPage(location.pathname) ? 'pb-0 md:pb-8' : 'mobile-nav-safe-pad md:pb-8'}`
                    : `p-0 sm:p-6 lg:p-8 ${isFullScreenPage(location.pathname) ? 'pb-0 md:pb-8' : 'mobile-nav-safe-pad md:pb-8'}`
              }`}>
                 {children}
                 {renderFooter() /* v415 — <HomeCityFooter variant={footerProps.variant} /> once the brand home has loaded */}
              </main>
          </div>

          <UnderReviewModal
            isOpen={underReviewModalOpen}
            onClose={() => setUnderReviewModalOpen(false)}
            user={user}
          />
      </div>
    );
  }

  // STANDARD LAYOUT (Unauthenticated or Landing Page)
  const isBlogRoute = location.pathname.startsWith("/blog");

  return (
    <div className={`min-h-screen ${isBlogRoute ? "bg-white" : "bg-[var(--bg-base)]"} text-[var(--text-primary)] relative transition-colors duration-200 flex flex-col`}>
      {/* Floating Pill Navbar */}
      <header data-testid="main-header" className="fixed top-4 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
        <nav className={`pointer-events-auto bg-[var(--bg-card)]/90 backdrop-blur-xl border border-[var(--border-default)] rounded-2xl transition-all duration-300 ${scrolled ? "shadow-[0_15px_30px_rgba(124,92,255,0.15)] border-[var(--violet-border)] scale-[0.99]" : ""} px-3 sm:px-4 h-14 flex items-center gap-2 sm:gap-5 w-full max-w-5xl`}>{/* v378: 360 px phones — the ☰ was pushed out of the pill */}
          <Link to="/" data-testid="logo-link" className="flex items-center gap-2 pl-1 pr-1 sm:pr-2 shrink-0">
            <YbexLogo className="h-7 sm:h-8 text-[var(--violet)] w-auto max-w-[92px] sm:max-w-[120px]" />
          </Link>

          {/* Clean Navbar */}
          <div className="hidden md:flex items-center gap-2 mx-auto">
            <NavItem to="/campaigns" testId="nav-explore">Live Campaigns</NavItem>
            <NavItem to="/creators" testId="nav-explore-creators">Explore Creators</NavItem>
            {/* v332: a second "Campaigns" tab (same link as Live Campaigns) was shown when signed in — removed */}
            <NavItem to="/ugc-orders" testId="nav-ugc-orders">
              <span className="flex items-center gap-1.5 font-semibold">
                <Film size={14} className="text-[var(--violet)]" />
                Live UGC Orders
              </span>
            </NavItem>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 ml-auto shrink-0">
            {user && <NotificationBell />}
            

            {user ? (
              <div className="flex items-center gap-2">
                <Link to="/dashboard" className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-[var(--violet)] hover:bg-[#6B4AFF] transition-all shadow-md">Dashboard</Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" data-testid="nav-login" className="whitespace-nowrap max-[359px]:hidden inline-flex items-center min-h-[44px] px-2 sm:px-3.5 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all">Sign In</Link>{/* v391: 44px tap; hidden under 360px (Sign In is in the menu) so the menu button never leaves the screen */}
                <Link to="/signup" data-testid="nav-signup" className="whitespace-nowrap inline-flex items-center min-h-[40px] px-3 min-[360px]:px-4 bg-[var(--violet)] text-white font-semibold rounded-xl text-xs hover:bg-[var(--violet-hover)] shadow-[0_4px_15px_rgba(124,58,237,0.3)] transition-all transform hover:scale-105 duration-200">Get Ybex</Link>
              </div>
            )}
            <button className="md:hidden w-10 h-10 flex items-center justify-center text-[var(--text-secondary)]" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen}>{/* v332: label + 40px tap */}
              {menuOpen ? <X size={20}/> : <Menu size={20}/>}
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.98 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed top-20 left-4 right-4 z-40 md:hidden bg-[var(--bg-card)]/95 backdrop-blur-2xl border border-[var(--border-default)] rounded-2xl shadow-2xl p-3 flex flex-col gap-1 origin-top overflow-hidden"
          >
            <Link to="/creators" className="px-4 py-3 rounded-xl hover:bg-foreground/5 text-sm font-medium">Explore Creators</Link>
            <Link to="/campaigns" className="px-4 py-3 rounded-xl hover:bg-foreground/5 text-sm font-medium">Campaigns</Link>
            <Link to="/ugc-orders" className="px-4 py-3 rounded-xl hover:bg-foreground/5 text-sm font-medium flex items-center gap-2">
              <Film size={15} className="text-[var(--violet)]"/> Live UGC Orders
            </Link>
            {!user && (
              <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-[var(--border-default)]">
                <Link to="/login" className="p-2.5 rounded-xl text-center bg-[var(--bg-elevated)] text-sm font-semibold border border-[var(--border-default)]">Sign In</Link>
                <Link to="/signup" className="p-2.5 rounded-xl text-center bg-[var(--violet)] text-white hover:bg-[var(--violet-hover)] text-sm font-semibold">Sign Up</Link>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Container */}
      <main className={`flex-1 ${isAuthPage ? "pt-0" : "pt-20"} min-h-[calc(100vh-280px)]`}>{children}</main>

      {/* Premium Minimal Footer */}
      {!isAuthPage && location.pathname !== "/" && (
        <footer className="border-t border-[var(--border-default)] mt-24 bg-[var(--bg-base)] pt-12 pb-20 overflow-hidden flex flex-col items-center">
          <div className="max-w-6xl w-full mx-auto px-6 md:px-10 flex flex-col items-center justify-between gap-8 md:flex-row text-xs tracking-wider text-[var(--text-primary)]/45">
            <div className="font-display font-medium text-center md:text-left select-none uppercase">
              © 2026 YBEX MEDIA. ALL RIGHTS RESERVED.
            </div>

            <div className="flex items-center gap-2 select-none uppercase text-[var(--text-primary)]/60">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>STATUS: OPERATIONAL</span>
            </div>

            {/* v332: links wrap on small phones (ran off the right edge at 320–390px) */}
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-0 select-none font-bold">
              <Link to="/blog" className="hover:text-[var(--text-primary)] transition-colors uppercase inline-flex items-center min-h-[40px]">
                BLOGS
              </Link>
              <Link to="/privacy-policy" className="hover:text-[var(--text-primary)] transition-colors uppercase inline-flex items-center min-h-[40px]">
                PRIVACY POLICY
              </Link>
              <Link to="/info/terms" className="hover:text-[var(--text-primary)] transition-colors uppercase inline-flex items-center min-h-[40px]">
                TERMS
              </Link>
              <Link to="/info/refunds" className="hover:text-[var(--text-primary)] transition-colors uppercase inline-flex items-center min-h-[40px]">
                REFUNDS
              </Link>
              {/* v334 (App Store / Play): support + account deletion linked from every page footer */}
              <Link to="/help" className="hover:text-[var(--text-primary)] transition-colors uppercase inline-flex items-center min-h-[40px]">
                HELP &amp; SUPPORT
              </Link>
              <a href="https://ybexmedia.in" target="_blank" rel="noreferrer" className="hover:text-[var(--text-primary)] transition-colors uppercase inline-flex items-center min-h-[40px]">
                YBEXMEDIA.IN
              </a>
              {user?.role === "admin" && (
                <Link to="/admin" className="text-[var(--violet)] hover:underline hover:text-[var(--violet-hover)] uppercase flex items-center gap-1">
                  <ShieldAlert size={12}/> ADMIN
                </Link>
              )}
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

const NavItem = ({ to, testId, children }) => (
  <NavLink to={to} data-testid={testId} className={({isActive}) => `px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all ${isActive ? "text-[var(--text-primary)] bg-[var(--text-primary)]/10 shadow-[inner_0_1px_5px_rgba(255,255,255,0.05)] border border-[var(--text-primary)]/5" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5"}`}>{children}</NavLink>
);
