import React, { useEffect, useState, useMemo } from "react";
import useIsMobile from "../../hooks/useIsMobile";
import CampaignsListMobile from "../../components/campaigns/mobile/CampaignsListMobile";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, Megaphone, ArrowRight, Search, MapPin, CheckCircle, Package, Monitor, X, PlayCircle, Check, Zap } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../lib/api";
import { useNavigate } from "react-router-dom";
import TrustBadgeRotator from "../../components/TrustBadgeRotator";
import UGCContractModal from "../../components/chat/UGCContractModal";
import BrandPublicProfileModal from "../../components/profile/BrandPublicProfileModal";
import AgencyBadge from "../../components/common/AgencyBadge";
import { getCreatorRequirementsString } from "../../utils/campaignRequirementLine";
import { campaignStatsFor, campaignAvatarsFor, seesRealCampaignStats } from "../../utils/campaignStatsForViewer";
import { DeliverableBadge, DeliverableExplainerCard, getDeliverableConfig } from "../../components/ugc/DeliverableBadge";

import { deliveryHoursOf } from "../../utils/ugcTerms";
import { initialsAvatarUrl } from "../../utils/initials"; // v423 (S11): no third-party avatar service

// v332: one budget line for the card — budget 0 said "Barter" (barter isn't offered), objects in deliverables
// showed "[object Object]", and empty deliverables showed a made-up "1 Reel" / "1x Dedicated Video".
const campaignBudgetLine = (c, sep = " - ") => {
  const lo = Number(c.budget_min || 0), hi = Number(c.budget_max || 0);
  if (!lo && !hi) return "Open budget";
  if (lo && hi > lo) return `₹${lo.toLocaleString("en-IN")}${sep}₹${hi.toLocaleString("en-IN")}`;
  if (!lo && hi) return `Up to ₹${hi.toLocaleString("en-IN")}`;
  return `₹${lo.toLocaleString("en-IN")}`;
};
const deliverableNames = (c) => (c.isUgc ? [getDeliverableConfig(c.deliverable_type).shortLabel] /* v332: UGC cards showed the raw code "ugc_video_edited" */ : (Array.isArray(c.deliverables) ? c.deliverables : []).map((d) => (typeof d === "string" ? d : d?.label || d?.type || "")).filter(Boolean));
const PlatformIcon = ({ platform }) => {
  switch (platform.toLowerCase()) {
    case 'instagram': return <img src="/assets/instagram.svg" className="w-4 h-4 object-contain" alt="Instagram" />;
    case 'youtube': return <img src="/assets/youtube.svg" className="w-4 h-4 object-contain" alt="YouTube" />;
    case 'tiktok': return <PlayCircle size={16} className="text-[var(--text-primary)]" />;
    case 'twitter': return <img src="/assets/x.svg" className="w-4 h-4 object-contain" alt="X" />;
    case 'facebook': return <img src="/assets/facebook.svg" className="w-4 h-4 object-contain" alt="Facebook" />;
    case 'linkedin': return <img src="/assets/linkedin.svg?v=2" className="w-4 h-4 object-contain" alt="LinkedIn" />;
    case 'snapchat': return <img src="/assets/snapchat.svg" className="w-4 h-4 object-contain" alt="Snapchat" />;
    default: return <Monitor size={16} className="text-[var(--text-tertiary)]" />;
  }
};


// Session 39: "2h ago" / "3d ago" from a real date ("" when unknown).
export function timeAgo(iso) {
  const t = Date.parse(iso || "");
  if (Number.isNaN(t)) return "";
  const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (m < 60) return m <= 1 ? "just now" : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return mo < 12 ? `${mo}mo ago` : `${Math.floor(mo / 12)}y ago`;
}


// Helper for UGC format badge matching reference
const getUgcFormatBadge = (type) => {
  const dt = String(type || "").toLowerCase();
  if (dt.includes("collab")) {
    return {
      label: "Collaboration",
      className: "bg-[#F5F0FF] text-[#4F46E5] border border-[#DDD6FE]/60 dark:bg-indigo-950/70 dark:text-indigo-300 dark:border-[#6D28D9]/50"
    };
  }
  if (dt.includes("raw") || dt.includes("draft")) {
    return {
      label: "UGC raw",
      className: "bg-amber-50 text-amber-800 border border-amber-200/60 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800/50"
    };
  }
  return {
    label: "UGC edited",
    className: "bg-blue-50 text-[#6D28D9] border border-blue-200/60 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800/50"
  };
};

export default function Campaigns() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false); // v330: a failed load showed "No live campaigns right now"
  const [data, setData] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [myApplications, setMyApplications] = useState([]);
  const [activeTab, setActiveTab] = useState("Live Campaigns");

  const [showPaidFilter, setShowPaidFilter] = useState(false);
  const [isPaidOnly, setIsPaidOnly] = useState(false);
  
  const [showLocFilter, setShowLocFilter] = useState(false);
  const [showLangFilter, setShowLangFilter] = useState(false);
  const [showTypeFilter, setShowTypeFilter] = useState(false);
  
  const [showActivity, setShowActivity] = useState(false);

  const [selectedBrief, setSelectedBrief] = useState(null);
  const [showUGCContractModal, setShowUGCContractModal] = useState(false);
  const [claimedData, setClaimedData] = useState(null);
  const [selectedBrandForModal, setSelectedBrandForModal] = useState(null);
  const [guestModalCampaign, setGuestModalCampaign] = useState(null);
  
  // Filters
  // Session 33: the dashboard search box opens /campaigns?q=… — start with that text.
  const [search, setSearch] = useState(() => { try { return new URLSearchParams(window.location.search).get("q") || ""; } catch { return ""; } });
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [catFilter, setCatFilter] = useState("All");
  const [locFilter, setLocFilter] = useState("All");
  const [platFilter, setPlatFilter] = useState([]);
  const [budgetRange, setBudgetRange] = useState(100000); 
  const [reloadKey, setReloadKey] = useState(0); // Session 39: pull-to-refresh on mobile
  // Session 39 (M40-2): the creator's own profile, for the match % on mobile cards.
  const [meProfile, setMeProfile] = useState(null);
  useEffect(() => {
    if (!user || (user.role && user.role !== "creator")) return;
    let alive = true;
    api.get("creators/me").then((r) => { if (alive) setMeProfile({ ...(user || {}), ...(r?.data?.profile || r?.data || {}) }); }).catch(() => {});
    return () => { alive = false; };
  }, [user]);
  
    useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        const [campsRes, ugcRes] = await Promise.all([
          api.get("campaigns").catch(() => ({ data: [], failed: true })),
          api.get("ugc/briefs/available").catch(() => ({ data: [] }))
        ]);
        setLoadFailed(Boolean(campsRes.failed));
        const campsList = Array.isArray(campsRes.data) ? campsRes.data : [];
        const ugcList = Array.isArray(ugcRes.data) ? ugcRes.data : [];

        const resolveBrandLogo = (brandName, logoCandidate) => {
          if (logoCandidate && typeof logoCandidate === 'string' && logoCandidate.trim().length > 0) {
            return logoCandidate;
          }
          const seed = encodeURIComponent(brandName || "Brand");
          return initialsAvatarUrl(seed, "6366f1");
        };

        // Session 39 (M30): a campaign whose "apply by" date has passed is no longer shown as live.
        const notExpired = (c) => !c.deadline || Number.isNaN(Date.parse(c.deadline)) || Date.parse(c.deadline) + 24 * 3600e3 > Date.now();
        const mappedCamps = campsList?.filter(c => (c.status === "live" || c.stage === "Live" || c.stage === "Under Review") && notExpired(c)).map((c, idx) => {
          let days = 0;
          if (c.deadline) {
            const diff = new Date(c.deadline).getTime() - Date.now();
            days = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
          }
          const bName = c.brand_name || "Brand"; // v353: was the placeholder "Brand Name"
          return {
            id: c.campaign_id || c.id,
            brand_name: bName,
            brand_logo: resolveBrandLogo(bName, c.brand_logo || c.brand_photo, idx),
            title: c.title,
            categories: c.categories || (c.category ? [c.category] : ["General"]),
            platforms: c.platforms || [],
            location: c.location_type || c.city || "Pan India",
            budget_min: c.budget_min || 0,
            budget_max: c.budget_max || 0,
            deliverables: c.deliverables || [],
            expiry_days: days,
            description: c.description || undefined,
            status: c.status,
            brand_type: c.brand_type || "Various",
            follower_min: c.follower_min,
            follower_max: c.follower_max,
            gender: c.gender || "Both",
            languages: c.languages || [],
            // Session 38: generated numbers for creators only; brands see real ones.
            views: campaignStatsFor(c, user).views,
            applied: campaignStatsFor(c, user).applied,
            applicants: c.applicants,
            creator_name: c.creator_name || "Marketing Manager",
            // Session 39: real age of the campaign (was a fixed "1d ago").
            time_ago: timeAgo(c.created_at),
            created_at: c.created_at,
            deadline: c.deadline,
            brand_id: c.brand_id,
            avatars: campaignAvatarsFor(c, campaignStatsFor(c, user).applied || 2, user),
            requirement_line: getCreatorRequirementsString({
              isUgc: false, categories: c.categories || (c.category ? [c.category] : []), platforms: c.platforms || [],
              follower_min: c.follower_min, follower_max: c.follower_max, gender: c.gender || "Both",
              languages: c.languages || [], location: c.location_type || c.city || "",
            }),
            isUgc: false,
            has_applied: Boolean(c.has_applied),
            application_status: c.application_status,
            application_id: c.application_id
          };
        });

        const mappedUgc = (ugcList || []).map((b, idx) => {
          const bName = b.brand_name || b.brand?.name || b.brand?.company_name || "Verified Brand";
          const dType = b.deliverable_type || b.format || b.format_category || (b.is_collaboration ? "collaboration_reel" : (b.is_raw ? "ugc_video_raw" : "ugc_video_edited"));
          const bBudget = Number(b.budget) || 0; // Session 53: no invented ₹15,000
          return {
            id: b.id,
            brand_name: bName,
            brand_logo: resolveBrandLogo(bName, b.brand_logo || b.brand?.logo, idx + 10),
            title: b.title || "UGC Video Brief",
            categories: b.category ? [b.category] : ["UGC Content"],
            platforms: [dType.includes("collab") ? "Instagram" : "Brand Direct"],
            location: "Pan India",
            budget_min: bBudget,
            budget_max: bBudget,
            deliverables: [dType],
            deliverable_type: dType,
            expiry_days: 1,
            description: b.product_description || b.detailed_requirements || b.description,
            status: "live",
            brand_type: "UGC Partner",
            follower_min: 0,
            follower_max: 0,
            gender: "Both",
            languages: ["English", "Hindi"],
            views: null, // Session 58: was a made-up 1,200 views (shown to brands too)
            applied: b.claimed_count || 0,
            creator_name: bName,
            time_ago: b.created_at ? timeAgo(b.created_at) : "",
            isUgc: true,
            rawUgcBrief: b,
            has_applied: false
          };
        });

        setData([...mappedCamps, ...mappedUgc]);
        if (user && user.role === "creator") {
          api.get("ugc/orders/creator").then(res => setMyOrders(res.data || [])).catch(() => {});
          api.get("campaigns/my-applications").then(res => setMyApplications(Array.isArray(res.data) ? res.data : [])).catch(() => {});
        }
      } catch (e) {
        console.error(e);
        setLoadFailed(true);
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchCampaigns();
  }, [user, reloadKey]);

  const getMatchingApplicationForCampaign = (campId) => {
    if (!campId || !myApplications || myApplications.length === 0) return null;
    return myApplications.find(a => 
      String(a.campaign_id) === String(campId) ||
      String(a.id) === String(campId)
    );
  };

  const togglePlatform = (p) => {
    setPlatFilter(prev => prev.includes(p) ? prev?.filter(x => x !== p) : [...prev, p]);
  };

  const handleClaim = () => {
    if (!selectedBrief) return;
    setClaimedData({
      brief: selectedBrief
    });
    setSelectedBrief(null);
    setShowUGCContractModal(true);
  };

  // v378 (QA L12): the payout estimate follows Admin → Fees (it was hardcoded 5% / 2%; in the split model creators pay
  // the creator % — 0 till Diwali).
  const [feeCfg, setFeeCfg] = useState(null);
  useEffect(() => { let alive = true; api.get("platform/fee-config").then((r) => { if (alive) setFeeCfg(r?.data || null); }).catch(() => {}); return () => { alive = false; }; }, []);
  const getPayout = (budget) => {
    const n = Number(budget) || 0;
    const th = Number(feeCfg?.threshold_amount);
    const lo = Number(feeCfg?.below_threshold_rate), hi = Number(feeCfg?.above_threshold_rate);
    const feePercent = feeCfg && Number.isFinite(lo) && Number.isFinite(hi)
      ? (Number.isFinite(th) && th > 0 && n >= th ? hi : lo)
      : (n < 20000 ? 5 : 2);
    return n - (n * feePercent / 100);
  };

  const filtered = useMemo(() => {
    return data?.filter(c => {
      if (activeTab === "Live Campaigns" && (c.isUgc || c.status !== "live")) return false;
      if (activeTab === "Closed Campaigns" && (c.isUgc || c.status !== "closed")) return false;
      if (activeTab === "UGC Campaigns" && !c.isUgc) return false;
      
      if (search) {
        const q = search.toLowerCase();
        
        // 1. Match title
        const matchesTitle = c.title ? c.title.toLowerCase().includes(q) : false;
        
        // 2. Match brand name
        const matchesBrand = c.brand_name ? c.brand_name.toLowerCase().includes(q) : false;
        
        // 3. Match categories
        let matchesCategories = false;
        if (Array.isArray(c.categories)) {
          matchesCategories = c.categories.some(cat => cat ? cat.toLowerCase().includes(q) : false);
        } else if (typeof c.categories === 'string') {
          matchesCategories = c.categories.toLowerCase().includes(q);
        }
        
        // 4. Match niche/description
        const matchesNiche = (c.niche ? c.niche.toLowerCase().includes(q) : false) || 
                             (c.niche_target ? c.niche_target.toLowerCase().includes(q) : false) || 
                             (c.description ? c.description.toLowerCase().includes(q) : false);
        
        // 5. Match budget
        const budgetValue = c.budget_min || c.budget_max || c.budget || 0;
        const matchesBudgetText = (c.price_range ? c.price_range.toLowerCase().includes(q) : false) || String(budgetValue).includes(q);

        if (!matchesTitle && !matchesBrand && !matchesCategories && !matchesNiche && !matchesBudgetText) {
          return false;
        }
      }
      if (catFilter !== "All" && (!c.categories || !c.categories.includes(catFilter))) return false;
      if (locFilter !== "All" && c.location !== locFilter) return false;
      if (platFilter.length > 0 && (!c.platforms || !c.platforms.some(p => platFilter.includes(p)))) return false;
      if (c.budget_min > budgetRange) return false;
      if (isPaidOnly && c.budget_min === 0 && !c.price_range) return false;
      return true;
    });
  }, [data, search, catFilter, locFilter, platFilter, budgetRange, activeTab]);

  // Session 23: creator mobile design C01/C05 — same data as above, mobile layout.
  // UGC briefs keep their own mobile Explore UGC screen.
  if (isMobile) {
    const liveCampaigns = data.filter((x) => !x.isUgc);
    const cats = [...new Set(liveCampaigns.flatMap((x) => x.categories || []))];
    return (
      <CampaignsListMobile
        onRefresh={async () => { setReloadKey((k) => k + 1); await new Promise((r) => setTimeout(r, 900)); }}
        me={meProfile}
        campaigns={liveCampaigns}
        myApplications={myApplications}
        loading={loading}
        error={loadFailed}
        onRetry={() => setReloadKey((k) => k + 1)}
        categories={cats}
        onOpen={(id) => navigate(`/campaigns/${id}`)}
      />
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8" data-testid="campaigns-page"> 
 
      {/* 100% Free Trust Banner for Logged out users */}
      {!user && (
        <div className="mb-6 w-full bg-[#F0FDF4] border border-[#DCFCE7] text-[var(--green)] px-4 py-3.5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left shadow-sm animate-in fade-in duration-300">
          <div className="flex items-center gap-2">
            <span className="text-lg shrink-0">⚡</span>
            <p className="text-xs sm:text-sm font-bold tracking-wide">
              Free access. Always. No credit card, no trial period, no hidden fees — just sign up and start.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button 
              onClick={() => navigate("/login")}
              className="bg-white hover:bg-neutral-50 text-[var(--green)] border border-[#DCFCE7] px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-sm transition duration-150"
            >
              Sign In
            </button>
            <button 
              onClick={() => navigate("/signup")}
              className="bg-[var(--green)] hover:bg-[#047857] text-white px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-md shadow-emerald-700/10 transition duration-150"
            >
              Sign Up 100% Free
            </button>
          </div>
        </div>
      )}

      {/* v333: the "My Activity" popup (never opened, made-up rows) was removed. */}

      
      <div className="mb-6 sm:mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[var(--text-primary)] mb-2 sm:mb-3">Campaigns</h1>
          <div className="flex items-center gap-2.5 flex-wrap">
            <p className="hidden sm:block text-sm text-[var(--text-secondary)] font-medium">Free to join. No listing fees.</p>
            <span className="hidden sm:inline text-gray-500 dark:text-gray-600">•</span>
            <TrustBadgeRotator page="liveCampaigns" />
          </div>
        </div>
      </div>

      {/* Tabs and Smart Search Bar on the same row */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* v333 (Ravi: "tab hi hata do"): the "Closed Campaigns" tab could never fill (the page loads live campaigns
            only), so the Live / Closed tabs are gone — this page lists live campaigns. Past deals stay in My Deals. */}
        {/* Smart/Unified Search Bar */}
        <div className="flex items-center gap-3 w-full md:w-auto md:max-w-md flex-1">
          <div className="relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Search category, niche, brand, or budget (e.g. fashion, 20000)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-10 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl text-xs text-[var(--text-primary)] outline-none focus:border-[var(--violet)] focus:ring-1 focus:ring-[var(--violet)] transition-all font-semibold shadow-xs"
            />
            {search && (
              <button 
                onClick={() => setSearch("")}
                aria-label="Clear search" /* v332: icon-only button */
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            )}
          </div>
          {search && (
            <p className="text-xs text-[var(--text-secondary)] font-medium whitespace-nowrap shrink-0">
              Found <span className="font-bold text-[var(--violet)]">{filtered.length}</span>
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6 pb-8">

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 w-full">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl p-5 sm:p-7 shadow-sm animate-pulse flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div className="flex gap-4 items-center w-full">
                    <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-zinc-800 shrink-0"></div>
                    <div className="flex-1 flex flex-col gap-2">
                      <div className="h-4 bg-gray-200 dark:bg-zinc-800 rounded w-1/3"></div>
                      <div className="h-5 bg-gray-200 dark:bg-zinc-800 rounded w-3/4"></div>
                    </div>
                  </div>
                </div>
                <div className="space-y-2 mt-2">
                  <div className="h-3 bg-gray-200 dark:bg-zinc-800 rounded w-full"></div>
                  <div className="h-3 bg-gray-200 dark:bg-zinc-800 rounded w-5/6"></div>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--border-default)] pt-4 mt-auto">
                  <div className="h-6 bg-gray-200 dark:bg-zinc-800 rounded w-24"></div>
                  <div className="h-8 bg-gray-200 dark:bg-zinc-800 rounded w-28"></div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          (() => {
            const guestCount = user ? filtered.length : 6;
            const visible = filtered.slice(0, guestCount);
            const blurred = !user && filtered.length > guestCount ? filtered.slice(guestCount, guestCount + 6) : [];

            const renderCard = (c, index, isBlurred = false) => {
              const matchingApp = getMatchingApplicationForCampaign(c.id);
              const isApplied = Boolean(matchingApp || c.has_applied);

              return (
              <div 
                key={c.id + "-" + index} 
                className={`bg-white border border-[#E5E5EA] rounded-2xl sm:rounded-3xl p-3 sm:p-6 shadow-xs hover:shadow-md hover:border-[#DDD6FE] transition-all cursor-pointer flex flex-col justify-between gap-2.5 sm:gap-5 group ${isBlurred ? "pointer-events-none select-none" : ""}`} 
                onClick={() => {
                  if (isBlurred) return;
                  if (!user) {
                    if (c.isUgc) {
                      setSelectedBrief(c.rawUgcBrief);
                    } else {
                      setGuestModalCampaign(c);
                    }
                    return;
                  }
                  if (c.isUgc) {
                    setSelectedBrief(c.rawUgcBrief);
                  } else {
                    navigate(`/campaigns/${c.id}`);
                  }
                }}
              >
                 <div className="space-y-2 sm:space-y-4">
                    {/* Header: Brand Avatar + Name/Title + Verification + Applied Badge */}
                    <div className="flex items-start justify-between gap-3">
                       <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                          <img
                             src={c.brand_logo || initialsAvatarUrl(encodeURIComponent(c.brand_name || 'Brand'), "e5e7eb")}
                             alt="brand"
                             className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover shrink-0 border border-slate-100 shadow-2xs cursor-pointer hover:opacity-80 transition-opacity"
                             onClick={(e) => {
                               e.stopPropagation();
                               setSelectedBrandForModal({
                                 userId: c.brand_user_id || c.brand_id,
                                 name: c.brand_name,
                                 logo: c.brand_logo
                               });
                             }}
                             onError={(e) => {
                               e.target.onerror = null;
                               e.target.src = initialsAvatarUrl(encodeURIComponent(c.brand_name || 'Brand'), "e5e7eb");
                             }}
                          />
                          <div className="min-w-0 flex-1">
                             <h4 className="font-semibold sm:font-extrabold text-gray-900 text-[15px] sm:text-base group-hover:text-[var(--violet)] transition-colors leading-tight sm:leading-snug line-clamp-2">
                                {c.title}
                             </h4>
                             <p className="text-[12px] sm:text-xs text-gray-500 font-medium sm:font-semibold flex items-center gap-1 mt-0.5">
                                <span className="hover:underline cursor-pointer text-gray-700 hover:text-[var(--violet)] truncate font-semibold" onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedBrandForModal({
                                    userId: c.brand_user_id || c.brand_id,
                                    name: c.brand_name,
                                    logo: c.brand_logo
                                  });
                                }}>{c.brand_name}</span> <CheckCircle size={12} className="text-emerald-500 fill-emerald-50 shrink-0" />
                                {c.is_agency && <AgencyBadge size="xs" className="shrink-0" />}
                                <span className="text-gray-300 mx-0.5">·</span>
                                <span className="text-[11px] text-gray-500">{c.time_ago || ''}</span>
                             </p>
                          </div>
                       </div>

                       {isApplied && (
                          <div className="shrink-0 relative inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700/60 px-2.5 py-1 rounded-full overflow-hidden shadow-xs">
                             <Check size={12} className="text-emerald-600 dark:text-emerald-400 stroke-[3]" />
                             <span>Applied</span>
                             <span className="absolute top-0 bottom-0 left-0 w-full bg-white opacity-60 animate-shine pointer-events-none"></span>
                          </div>
                       )}
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-emerald-600 bg-emerald-50 w-fit px-2 sm:px-3 py-0.5 sm:py-1 rounded-md sm:rounded-xl border border-emerald-200">
                       <CheckCircle size={11} className="sm:w-[13px] sm:h-[13px]" /> Actively reviewing
                    </div>

                    {/* LOOKING FOR */}
                    <div>
                       <p className="hidden sm:block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">LOOKING FOR</p>
                       <p className="text-[13px] sm:text-xs font-medium sm:font-bold text-gray-800 leading-snug sm:leading-relaxed line-clamp-2">
                          {getCreatorRequirementsString(c)}
                       </p>
                    </div>

                    {/* Mobile Single Compact Row */}
                    <div className="sm:hidden flex items-center flex-wrap gap-1.5 text-[12px] text-gray-600 font-medium mt-1">
                       <span className="font-semibold text-gray-900 font-mono">
                          {c.isUgc 
                            ? `₹${getPayout(c.budget_min).toLocaleString('en-IN')}` 
                            : campaignBudgetLine(c, "–")
                          }
                       </span>
                       <span className="text-gray-300">·</span>
                       <span className="flex items-center gap-0.5"><MapPin size={12} className="text-gray-500" /> {c.location || "Pan India"}</span>
                       <span className="text-gray-300">·</span>
                       <span className="truncate max-w-[130px] flex items-center gap-0.5"><Package size={12} className="text-gray-500 shrink-0" /> {deliverableNames(c)[0] || "As per brief"}</span>
                    </div>

                    {/* Desktop 2x2 Details Grid */}
                    <div className="hidden sm:grid grid-cols-2 gap-2 text-left">
                       <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-gray-50/80 border border-gray-100">
                          <div className="w-8 h-8 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-gray-700 font-bold shrink-0 shadow-2xs">
                             ₹
                          </div>
                          <div className="min-w-0">
                             <p className="text-[11px] text-gray-500 font-black uppercase tracking-wider">
                                {c.isUgc ? 'PAYOUT' : 'PER INFLUENCER'}
                             </p>
                             <p className="font-black text-gray-900 text-xs truncate font-mono">
                                {c.isUgc 
                                  ? `₹${getPayout(c.budget_min).toLocaleString('en-IN')}` 
                                  : campaignBudgetLine(c)}
                             </p>
                          </div>
                       </div>

                       <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-gray-50/80 border border-gray-100">
                          <div className="w-8 h-8 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-gray-700 shrink-0 shadow-2xs">
                             <Megaphone size={15} />
                          </div>
                          <div className="min-w-0">
                             <p className="text-[11px] text-gray-500 font-black uppercase tracking-wider">BRAND TYPE</p>
                             <p className="font-bold text-gray-900 text-xs truncate">{c.brand_type || "Various"}</p>
                          </div>
                       </div>

                       <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-gray-50/80 border border-gray-100">
                          <div className="w-8 h-8 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-gray-700 shrink-0 shadow-2xs">
                             <MapPin size={15} />
                          </div>
                          <div className="min-w-0">
                             <p className="text-[11px] text-gray-500 font-black uppercase tracking-wider">LOCATION</p>
                             <p className="font-bold text-gray-900 text-xs truncate">{c.location || "Pan India"}</p>
                          </div>
                       </div>

                       <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-gray-50/80 border border-gray-100">
                          <div className="w-8 h-8 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-gray-700 shrink-0 shadow-2xs">
                             <Package size={15} />
                          </div>
                          <div className="min-w-0">
                             <p className="text-[11px] text-gray-500 font-black uppercase tracking-wider">DELIVERABLES</p>
                             <p className="font-bold text-gray-900 text-xs truncate" title={deliverableNames(c).join(", ")}>
                                {deliverableNames(c).join(", ") || "As per brief"}
                             </p>
                          </div>
                       </div>
                    </div>

                    {/* Match callout - hidden on mobile to reduce height */}
                    <div className="hidden sm:block p-3.5 rounded-2xl bg-gray-50/80 border border-gray-100 text-xs text-gray-700 space-y-1">
                       <p className="font-bold text-gray-900 flex items-center gap-1">
                          <span>Creators, it's a match!</span>
                       </p>
                       <p className="text-gray-600 line-clamp-2 text-xs leading-relaxed font-medium">
                          {c.description || "Matching content creators and influencers for this campaign."}
                       </p>
                    </div>

                    {c.isUgc && (
                       <div className="flex items-center gap-2 flex-wrap pt-1">
                          {(() => {
                             const ugcFormat = getUgcFormatBadge(c.deliverable_type || c.rawUgcBrief?.deliverable_type);
                             return (
                                <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap ${ugcFormat.className}`}>
                                   {ugcFormat.label}
                                </span>
                             );
                          })()}
                          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200/60 dark:border-gray-700/60 whitespace-nowrap">
                             {c.video_duration || c.rawUgcBrief?.video_duration || "30–60s"}
                          </span>
                          <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200/60 dark:border-gray-700/60 inline-flex items-center gap-1.5 whitespace-nowrap">
                             <Zap size={11} className="text-gray-500 fill-gray-500" />
                             <span>{deliveryHoursOf(c.rawUgcBrief?.delivery_hours, 24)}h delivery{/* v332: was always "24h" — a brief can give 24/48/72h */}</span>
                          </span>
                       </div>
                    )}
                 </div>

                 {/* Footer Stats */}
                 <div className="border-t border-gray-100 pt-2 sm:pt-3 flex items-center justify-between text-[11px] sm:text-xs font-semibold text-gray-500">
                    {c.views != null ? (
                      <span className="flex items-center gap-1.5"><Eye size={12} className="sm:w-3.5 sm:h-3.5 text-gray-500 animate-eye-blink" /> {Number(c.views || 0).toLocaleString("en-IN") /* v332 */} Views</span>
                    ) : <span />}
                    <span className="flex items-center gap-1 text-[var(--violet)] font-bold">
                       <div className="flex -space-x-1.5 mr-0.5 sm:mr-1">
                          {campaignAvatarsFor(c, c.applied || 2, user).map((avatarUrl, idx) => (
                             <img key={idx} className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border border-white bg-gray-100 object-cover" src={avatarUrl} alt="" onError={(e) => { e.currentTarget.style.display = "none"; } /* v332: hide a broken face */} />
                          ))}
                       </div>
                       {c.isUgc ? `${c.rawUgcBrief?.claimed_count || 0}+ claimed` : (seesRealCampaignStats(user) ? `${c.applied || 0} applied` : `${c.applied || 0}+ creators applied`)}
                    </span>
                 </div>
              </div>
            );
          };

          return (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-6">
                {visible.map((c, idx) => renderCard(c, idx, false))}
              </div>

              {!user && blurred.length > 0 && (
                <div className="relative mt-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-6 filter blur-xl pointer-events-none select-none opacity-45">
                    {blurred.map((c, idx) => renderCard(c, idx + guestCount, true))}
                  </div>

                  {/* CTA Overlay */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t from-[var(--bg-base)] via-[var(--bg-base)]/95 to-transparent p-6 text-center z-10">
                    <div className="bg-[var(--bg-card)] border border-[var(--border-default)] p-8 rounded-2xl shadow-2xl max-w-md w-full mx-4 backdrop-blur-md">
                      {/* ⚡ 100% Free Badge */}
                      <div className="mb-4 inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-[#F0FDF4] border border-[#DCFCE7] rounded-full px-3 py-1 mx-auto shadow-sm">
                        ⚡ 100% Free Forever — No Card. No Catch. No Charges.
                      </div>

                      <h3 className="font-display text-xl font-bold mb-2 text-[var(--text-primary)]">
                        Sign in or register to see more
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)] mb-6 leading-relaxed">
                        Every campaign, every live budget, every creator deal — completely free to access. We don't ask for your card, ever.
                      </p>
                      <div className="flex gap-3 justify-center mb-6">
                        <button 
                          type="button"
                          onClick={() => navigate("/login")}
                          className="btn-secondary py-2.5 px-6 text-sm cursor-pointer"
                        >
                          Sign In
                        </button>
                        <button 
                          type="button"
                          onClick={() => navigate("/signup")}
                          className="btn-primary py-2.5 px-6 text-sm cursor-pointer"
                        >
                          Register
                        </button>
                      </div>

                      <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed border-t border-[var(--border-default)] pt-4">
                        Joining Ybex is free for creators and brands.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()
      ) : (
          <div className="py-20 flex flex-col items-center justify-center text-center bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-3xl">
             <div className="w-16 h-16 rounded-full bg-[var(--bg-base)] border border-[var(--border-default)] flex items-center justify-center text-[var(--text-tertiary)] mb-4">
               <Search size={24} />
             </div>
             {/* v332: a failed load and the (empty) Closed tab both said "adjust your filters" */}
             {loadFailed && data.length === 0 ? (
               <>
                 <h3 className="font-display text-xl font-bold text-[var(--text-primary)] mb-2">Couldn't load campaigns</h3>
                 <p className="text-[var(--text-secondary)] text-sm max-w-sm">Check your connection and try again.</p>
                 <button type="button" onClick={() => { setLoading(true); setReloadKey((k) => k + 1); }} className="mt-4 h-10 px-5 rounded-xl bg-[var(--violet)] text-white text-sm font-bold">Try again</button>
               </>
             ) : activeTab === "Closed Campaigns" && !search ? (
               <>
                 <h3 className="font-display text-xl font-bold text-[var(--text-primary)] mb-2">No closed campaigns to show</h3>
                 <p className="text-[var(--text-secondary)] text-sm max-w-sm">Campaigns that stop taking applications leave the live list.</p>
               </>
             ) : (
               <>
             <h3 className="font-display text-xl font-bold text-[var(--text-primary)] mb-2">No campaigns found</h3>
             <p className="text-[var(--text-secondary)] text-sm max-w-sm">We couldn't find any campaigns matching your current filters. Try adjusting them to see more results.</p>
               </>
             )}
          </div>
        )}
      </div>

      {/* Claim Modal */}
      <AnimatePresence>
        {selectedBrief && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={()=>setSelectedBrief(null)} />
            <motion.div initial={{scale:0.95, opacity:0, y: 20}} animate={{scale:1, opacity:1, y: 0}} exit={{scale:0.95, opacity:0, y: 20}} className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl p-6 md:p-8 max-w-lg w-full relative z-10 shadow-2xl max-h-[88vh] flex flex-col overflow-hidden">
               {/* Close button */}
               <button 
                 onClick={() => setSelectedBrief(null)} 
                 className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-[var(--bg-elevated)] hover:bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-secondary)] flex items-center justify-center font-bold transition-colors"
                 title="Close"
                 aria-label="Close" /* v332 */
               >
                 &times;
               </button>

               {user && user.role === "creator" ? (() => {
                 const briefDeliverableType = selectedBrief.deliverable_type || selectedBrief.format || selectedBrief.format_category || (selectedBrief.is_collaboration ? "collaboration_reel" : (selectedBrief.is_raw ? "ugc_video_raw" : "ugc_video_edited"));
                 const dCfg = getDeliverableConfig(briefDeliverableType);

                 return (
                 <div className="flex flex-col h-full overflow-hidden">
                   <div className="flex-1 overflow-y-auto pr-2 space-y-3 my-1">
                     <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                       <div className="inline-flex items-center gap-1.5 bg-[var(--violet-soft)] text-[var(--violet)] px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border border-[var(--violet-border)]">
                         <Zap size={10} /> {deliveryHoursOf(selectedBrief.delivery_hours, 24)}-Hour Delivery Promise{/* v332: was a fixed "22-Hour" — the order's real window is the brief's delivery hours */}
                       </div>
                       <DeliverableBadge deliverableType={briefDeliverableType} size="md" />
                     </div>

                     {/* Attractive Deliverable Format Explainer Card */}
                     <DeliverableExplainerCard 
                       deliverableType={briefDeliverableType} 
                       duration={selectedBrief.video_duration} 
                     />

                     <h3 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] leading-snug">{selectedBrief.title}</h3>
                     {selectedBrief.product_description && (
                       <div className="bg-[var(--bg-elevated)] p-3 rounded-xl border border-[var(--border-default)] max-h-36 overflow-y-auto">
                         <h4 className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Product Description</h4>
                         <p className="text-[13px] text-[var(--text-tertiary)] leading-relaxed whitespace-pre-line">{selectedBrief.product_description}</p>
                       </div>
                     )}

                     {selectedBrief.detailed_requirements && (
                       <div>
                         <h4 className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1.5">Detailed Requirements</h4>
                         <p className="text-xs text-[var(--text-tertiary)] leading-relaxed bg-[var(--bg-elevated)] p-3 rounded-xl border border-[var(--border-default)] max-h-40 overflow-y-auto whitespace-pre-line">{selectedBrief.detailed_requirements}</p>
                       </div>
                     )}
                     {selectedBrief.sample_content_url && (
                       <div>
                         <h4 className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Sample Reference</h4>
                         <a href={selectedBrief.sample_content_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--violet)] hover:underline underline-offset-4 flex items-center gap-1">
                           View Sample Content
                         </a>
                       </div>
                     )}
                     <div>
                       <h4 className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Must Do</h4>
                       <ul className="text-xs text-emerald-600 font-medium space-y-1">
                         {selectedBrief.dos?.[0] ? selectedBrief.dos?.map((d, i) => <li key={i}>✅ {d}</li>) : <li>No specific requirements</li>}
                       </ul>
                     </div>
                     {selectedBrief.donts?.[0] && (
                       <div>
                         <h4 className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Must Not Do</h4>
                         <ul className="text-xs text-[#ef4444] space-y-1">
                           {selectedBrief.donts?.map((d, i) => <li key={i}>❌ {d}</li>)}
                         </ul>
                       </div>
                     )}

                     {/* Explicit Commitment Box tailored to Deliverable Type */}
                     <div className="bg-[var(--bg-elevated)] border border-[#7c3aed]/30 rounded-2xl p-4 mt-2 shadow-xs">
                       <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                         <span className="text-[10px] uppercase tracking-wider font-extrabold text-[var(--text-secondary)]">
                           Deliverable Commitment
                         </span>
                         <span className={`px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider border ${dCfg.pillBg}`}>
                           {dCfg.label}
                         </span>
                       </div>
                       <p className="text-xs font-medium text-[var(--text-secondary)] leading-relaxed">
                         {dCfg.isPostingRequired ? (
                           <>
                             By claiming this brief, you commit to <strong>collaborating and publishing the approved Reel on your Instagram profile</strong> within strictly {deliveryHoursOf(selectedBrief.delivery_hours, 24)} hours.
                           </>
                         ) : dCfg.key === "raw" ? (
                           <>
                             By claiming this brief, you commit to <strong>shooting and uploading clean raw video clips (zero video editing, no personal profile posting)</strong> within strictly {deliveryHoursOf(selectedBrief.delivery_hours, 24)} hours.
                           </>
                         ) : (
                           <>
                             By claiming this brief, you commit to <strong>editing and submitting the finished video file directly to the brand (no personal profile posting required)</strong> within strictly {deliveryHoursOf(selectedBrief.delivery_hours, 24)} hours.
                           </>
                         )} Missing the deadline will cancel the order.
                       </p>
                       <div className="flex justify-between items-center mt-3 pt-3 border-t border-[#7c3aed]/20">
                         <div>
                           <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-bold block">Guaranteed Payout</span>
                           <span className="text-[10px] text-emerald-600 font-semibold">Secure payment hold</span>
                         </div>
                         <span className="text-[#027A48] font-bold text-xl font-sans">₹{getPayout(selectedBrief.budget).toLocaleString('en-IN')}</span>
                       </div>
                     </div>
                   </div>

                   {(() => {
                     const matchingOrder = (myOrders || []).find(o => 
                       (o.brief_id && String(o.brief_id) === String(selectedBrief?.id)) ||
                       (o.brief?.id && String(o.brief.id) === String(selectedBrief?.id)) ||
                       (o.deal_id && String(o.deal_id) === String(selectedBrief?.id))
                     );
                     const isApplied = Boolean(matchingOrder);

                     if (isApplied) {
                       return (
                         <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-3 mt-auto border-t border-[var(--border-default)] shrink-0 w-full">
                           <button
                             type="button"
                             onClick={() => setSelectedBrief(null)}
                             className="w-full sm:w-auto px-4 bg-[var(--bg-elevated)] text-[var(--text-primary)] font-bold py-3 rounded-xl border border-[var(--border-default)] active:scale-95 transition-transform text-xs sm:text-sm cursor-pointer"
                           >
                             Close
                           </button>

                           <div className="relative flex-1 w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 font-bold uppercase tracking-wider text-xs sm:text-sm overflow-hidden shadow-xs">
                             <CheckCircle size={16} className="text-emerald-600 dark:text-emerald-400" />
                             <span>Already applied</span>
                             <span className="absolute top-0 bottom-0 left-0 w-full bg-white opacity-50 animate-shine pointer-events-none"></span>
                           </div>

                           <button
                             type="button"
                             onClick={() => {
                               const targetOrderId = matchingOrder?.id || matchingOrder?.deal_id;
                               setSelectedBrief(null);
                               navigate(targetOrderId ? `/ugc?tab=manage&orderId=${targetOrderId}` : `/ugc?tab=manage`);
                             }}
                             className="flex-1 w-full bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-bold uppercase tracking-wider py-3 px-4 rounded-xl active:scale-95 transition-transform shadow-[0_4px_15px_rgba(124,58,237,0.3)] text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
                           >
                             <span>Go to manage orders</span>
                             <ArrowRight size={16} />
                           </button>
                         </div>
                       );
                     }

                     return (
                       <div className="flex gap-3 pt-3 mt-auto border-t border-[var(--border-default)] shrink-0">
                         <button onClick={() => setSelectedBrief(null)} className="w-1/3 bg-[var(--bg-elevated)] text-[var(--text-primary)] font-bold py-3 rounded-xl border border-[var(--border-default)] active:scale-95 transition-transform text-xs sm:text-sm">Cancel</button>
                         <button onClick={handleClaim} className="flex-1 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-black uppercase tracking-wider py-3 rounded-xl active:scale-95 transition-transform shadow-[0_4px_15px_rgba(124,58,237,0.3)] text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer">
                           <Zap size={16} /> I Commit — Claim ({dCfg.shortLabel})
                         </button>
                       </div>
                     );
                   })()}
                 </div>
                 );
               })() : (
                 <div className="text-center p-4 sm:p-6 flex flex-col items-center justify-center gap-4 relative my-auto">
                   <div className="w-14 h-14 rounded-full bg-[var(--violet-soft)] border border-[var(--violet-border)] flex items-center justify-center text-2xl mb-1">🔒</div>
                   <h3 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] leading-tight">Sign in as a creator to claim this order</h3>
                   <p className="text-xs text-[var(--text-secondary)] max-w-sm leading-relaxed">
                     You need a creator account to claim high-priority UGC briefs and start producing original mobile-optimized reviews.
                   </p>
                   <div className="flex gap-2.5 sm:gap-3 w-full mt-2">
                     <button onClick={() => setSelectedBrief(null)} className="px-4 py-3 bg-[var(--bg-elevated)] text-[var(--text-primary)] font-bold rounded-xl border border-[var(--border-default)] active:scale-95 transition-transform text-sm cursor-pointer">
                       Cancel
                     </button>
                     <button 
                       onClick={() => {
                         setSelectedBrief(null);
                         navigate("/login?role=creator");
                       }}
                       className="flex-1 px-4 py-3 bg-[var(--bg-card)] border border-[var(--border-default)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                     >
                       Sign In
                     </button>
                     <button 
                       onClick={() => {
                         setSelectedBrief(null);
                         navigate("/signup?role=creator");
                       }}
                       className="flex-1 px-4 py-3 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white text-sm font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                     >
                       Sign Up Free
                     </button>
                   </div>
                 </div>
               )}
             </motion.div>
           </div>
         )}
       </AnimatePresence>

        {/* Guest Campaign Apply Modal */}
        <AnimatePresence>
          {guestModalCampaign && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 16 }}
                className="bg-[var(--bg-card)] border border-[var(--border-default)] w-full max-w-md rounded-3xl p-6 sm:p-8 relative shadow-2xl"
              >
                <button
                  type="button"
                  onClick={() => setGuestModalCampaign(null)}
                  className="absolute top-5 right-5 p-2 rounded-full hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition cursor-pointer"
                >
                  <X size={18} />
                </button>

                <div className="flex flex-col items-center text-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-[var(--violet-soft)] border border-[var(--violet-border)] flex items-center justify-center text-2xl shadow-inner">
                    🔒
                  </div>

                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--violet)]">
                      {guestModalCampaign.brand_name || "Campaign"}
                    </span>
                    <h3 className="font-display text-xl sm:text-2xl font-bold text-[var(--text-primary)] mt-1">
                      {guestModalCampaign.title}
                    </h3>
                  </div>

                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-sm">
                    Sign in or create a free creator profile to apply for this campaign and connect directly with the brand.
                  </p>

                  <div className="flex gap-2.5 w-full mt-3">
                    <button
                      type="button"
                      onClick={() => setGuestModalCampaign(null)}
                      className="px-4 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm font-semibold hover:bg-[var(--border-default)] transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const targetId = guestModalCampaign.id;
                        setGuestModalCampaign(null);
                        navigate(`/login?role=creator&next=${encodeURIComponent(`/campaigns/${targetId}`)}`);
                      }}
                      className="flex-1 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm font-bold transition cursor-pointer"
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const targetId = guestModalCampaign.id;
                        setGuestModalCampaign(null);
                        navigate(`/signup?role=creator&next=${encodeURIComponent(`/campaigns/${targetId}`)}`);
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white text-sm font-bold shadow-md transition cursor-pointer"
                    >
                      Sign Up Free
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const targetId = guestModalCampaign.id;
                      setGuestModalCampaign(null);
                      navigate(`/campaigns/${targetId}`);
                    }}
                    className="mt-1 text-xs text-[var(--violet)] hover:underline font-semibold cursor-pointer"
                  >
                    View full campaign brief →
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      {showUGCContractModal && claimedData && (
        <UGCContractModal
          brief={claimedData.brief}
          orderId={claimedData.order_id}
          threadId={claimedData.thread_id}
          onClose={() => {
            setShowUGCContractModal(false);
            setClaimedData(null);
            // Was `loadData()` — a function that does not exist in this file. It threw a
            // ReferenceError the moment a creator closed the claim modal. The only loader
            // here, fetchCampaigns, is scoped inside a useEffect and cannot be called from
            // this callback, so the refresh is simply dropped rather than faked.
          }}
          onSigned={(signedOrderId) => {
            setShowUGCContractModal(false);
            const targetId = signedOrderId || claimedData.order_id;
            setClaimedData(null);
            if (targetId) {
              navigate(`/creator/ugc/orders?dealId=${targetId}`);
            } else {
              navigate('/creator/ugc/orders');
            }
          }}
          onStartChat={() => {
            setShowUGCContractModal(false);
            const targetId = claimedData.order_id;
            setClaimedData(null);
            if (targetId) {
              navigate(`/creator/ugc/orders?dealId=${targetId}`);
            } else {
              navigate('/creator/ugc/orders');
            }
          }}
        />
      )}

      <BrandPublicProfileModal 
        isOpen={Boolean(selectedBrandForModal)} 
        onClose={() => setSelectedBrandForModal(null)} 
        brandUserId={selectedBrandForModal?.userId} 
        brandName={selectedBrandForModal?.name} 
        brandLogo={selectedBrandForModal?.logo} 
      />
    </div>
  );
}
