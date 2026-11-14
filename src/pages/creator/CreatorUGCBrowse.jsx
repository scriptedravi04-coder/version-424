import React, { useEffect, useState, useMemo } from "react";
import OfferStrip from "../../components/referral/OfferStrip";
import { safeLower } from "../../utils/safeFormat";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useLoading } from "../../contexts/LoadingContext";
import { Zap, Search, Video, PlayCircle, Clock, Check, CheckCircle2, ArrowRight, ChevronDown, X, Lock, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import UGCContractModal from "../../components/chat/UGCContractModal";
import TrustBadgeRotator from "../../components/TrustBadgeRotator";
import ManageUGCOrdersView from "./ManageUGCOrdersView";
import BrandPublicProfileModal from "../../components/profile/BrandPublicProfileModal";
import { getDeliverableConfig } from "../../components/ugc/DeliverableBadge";
import useIsMobile from "../../hooks/useIsMobile";
import CreatorUGCMobile from "./CreatorUGCMobile";
import { OfflineAware } from "../../components/common/OfflineState"; // v334
import { deliveryHoursOf, UGC_REVISION_LIMIT } from "../../utils/ugcTerms";
import { initialsAvatarUrl } from "../../utils/initials"; // v423 (S11): no third-party avatar service

function CreatorUGCBrowseDesktop({ defaultTab = "explore" }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTab = searchParams.get("tab");
  const queryOrderId = searchParams.get("orderId") || searchParams.get("order_id");

  const initialIsManage = queryTab === "manage" || queryTab === "orders" || defaultTab === "orders" || defaultTab === "manage";
  const [activeTab, setActiveTab] = useState(initialIsManage ? "manage" : "explore");
  const [briefs, setBriefs] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [deliverableFilter, setDeliverableFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [selectedBrief, setSelectedBrief] = useState(null);
  const [showUGCContractModal, setShowUGCContractModal] = useState(false);
  const [claimedData, setClaimedData] = useState(null);
  const [selectedBrandForModal, setSelectedBrandForModal] = useState(null);
  const [briefsFailed, setBriefsFailed] = useState(false); // v330: failed load ≠ "no briefs"
  const [briefsLoaded, setBriefsLoaded] = useState(false); // v332: "No open briefs" flashed before the first load finished
  const { startLoading, stopLoading } = useLoading();
  const navigate = useNavigate();

  useEffect(() => {
    if (queryTab === "manage" || queryTab === "orders" || defaultTab === "orders" || defaultTab === "manage") {
      setActiveTab("manage");
    } else if (queryTab === "explore" || defaultTab === "browse" || defaultTab === "explore") {
      setActiveTab("explore");
    }
  }, [queryTab, defaultTab]);

  const loadData = () => {
    startLoading();
    let failed = false; // v330
    Promise.all([
      api.get("ugc/briefs/available").catch(() => { failed = true; return { data: [] }; }),
      api.get("ugc/orders/creator").catch(() => ({ data: [] }))
    ])
      .then(([briefsRes, ordersRes]) => {
        setBriefsFailed(failed);
        setBriefs(Array.isArray(briefsRes.data) ? briefsRes.data : []);
        setMyOrders(Array.isArray(ordersRes.data) ? ordersRes.data : []);
      })
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load available briefs. Please try again.");
      })
      .finally(() => { stopLoading(); setBriefsLoaded(true); });
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeOrders = useMemo(() => {
    return (myOrders || []).filter(o => {
      const st = (o.creator_status || o.status || o.stage || '').toUpperCase();
      return st !== 'CANCELLED' && o.brand_id !== 'archived_deleted_brand';
    });
  }, [myOrders]);

  const getMatchingOrderForBrief = (briefId) => {
    if (!briefId || !activeOrders || activeOrders.length === 0) return null;
    return activeOrders.find(o => 
      (o.brief_id && String(o.brief_id) === String(briefId)) ||
      (o.brief?.id && String(o.brief.id) === String(briefId)) ||
      (o.deal_id && String(o.deal_id) === String(briefId))
    );
  };

  const handleClaim = () => {
    if (!selectedBrief) return;
    setClaimedData({
      brief: selectedBrief
    });
    setSelectedBrief(null);
    setShowUGCContractModal(true);
  };

  const getPayout = (budget) => {
    return budget;
  };

  const resolveBrandLogo = (b) => {
    const directLogo = b.brand_logo || b.brand?.logo || b.brand?.avatar || b.brand_avatar;
    if (directLogo && typeof directLogo === 'string' && directLogo.trim().length > 0) {
      return directLogo;
    }
    const seed = encodeURIComponent(b.brand_name || b.product_name || "Brand");
    return initialsAvatarUrl(seed, "6366f1");
  };

  const getDeliverableBadgeInfo = (b) => {
    const dt = String(b.deliverable_type || b.format || b.format_category || (b.is_collaboration ? "collaboration_reel" : (b.is_raw ? "ugc_video_raw" : "ugc_video_edited"))).toLowerCase();

    if (dt.includes("collab")) {
      return {
        label: "Collaboration",
        badgeClass: "bg-[#F5F0FF] text-[#4F46E5] dark:bg-indigo-950/70 dark:text-indigo-300 border border-[#DDD6FE]/60 dark:border-[#6D28D9]/50"
      };
    }
    if (dt.includes("raw") || dt.includes("draft")) {
      return {
        label: "UGC Raw",
        badgeClass: "bg-amber-50 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/50"
      };
    }
    return {
      label: "UGC Edited",
      badgeClass: "bg-blue-50 text-[#6D28D9] dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/50"
    };
  };

  const allOpenBriefs = useMemo(() => {
    return briefs.filter(b => (b.claimed_count || 0) < (b.max_creators || 1));
  }, [briefs]);

  const collabCount = useMemo(() => {
    return allOpenBriefs.filter(b => {
      const dt = b.deliverable_type || b.format || b.format_category || (b.is_collaboration ? "collaboration_reel" : (b.is_raw ? "ugc_video_raw" : "ugc_video_edited"));
      return getDeliverableConfig(dt).key === "collab";
    }).length;
  }, [allOpenBriefs]);

  const editedCount = useMemo(() => {
    return allOpenBriefs.filter(b => {
      const dt = b.deliverable_type || b.format || b.format_category || (b.is_collaboration ? "collaboration_reel" : (b.is_raw ? "ugc_video_raw" : "ugc_video_edited"));
      return getDeliverableConfig(dt).key === "edited";
    }).length;
  }, [allOpenBriefs]);

  const rawCount = useMemo(() => {
    return allOpenBriefs.filter(b => {
      const dt = b.deliverable_type || b.format || b.format_category || (b.is_collaboration ? "collaboration_reel" : (b.is_raw ? "ugc_video_raw" : "ugc_video_edited"));
      return getDeliverableConfig(dt).key === "raw";
    }).length;
  }, [allOpenBriefs]);

  const filteredBriefs = useMemo(() => {
    let result = allOpenBriefs.filter(b => {
      // Filter by deliverable format
      if (deliverableFilter !== "all") {
        const dt = b.deliverable_type || b.format || b.format_category || (b.is_collaboration ? "collaboration_reel" : (b.is_raw ? "ugc_video_raw" : "ugc_video_edited"));
        const cfg = getDeliverableConfig(dt);
        if (cfg.key !== deliverableFilter) return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (b.title && safeLower(b.title).includes(q)) ||
        (b.product_name && safeLower(b.product_name).includes(q)) ||
        (b.brand_name && safeLower(b.brand_name).includes(q))
      );
    });

    if (sortBy === "payout_high") {
      result.sort((a, b) => (Number(b.budget) || 0) - (Number(a.budget) || 0));
    } else if (sortBy === "payout_low") {
      result.sort((a, b) => (Number(a.budget) || 0) - (Number(b.budget) || 0));
    } else {
      result.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    }

    return result;
  }, [allOpenBriefs, deliverableFilter, searchQuery, sortBy]);

  return (
    <div className="w-full max-w-none">
      
      {/* Top Header matching Screenshot 1 & 5 */}
      <div className="mb-5">
        <h1 className="text-3xl sm:text-4xl font-black text-[var(--text-primary)] tracking-tight">Explore UGC</h1>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap text-sm text-[var(--text-secondary)]">
          <span className="font-medium">Claim a brief, deliver fast, get paid from a secure payment hold.</span>
          <span className="text-gray-300 dark:text-gray-700 font-bold">•</span>
          <TrustBadgeRotator page="exploreUgc" textColor="text-[#027A48] dark:text-emerald-400 font-bold" />
          <OfferStrip className="mt-2" />
        </div>
      </div>

      {/* Animated Pill Toggle matching image.png */}
      <div className="mb-6 flex items-center">
        <div className="inline-flex items-center p-1 bg-white dark:bg-[var(--bg-card)] rounded-full border border-gray-200/80 dark:border-gray-800 shadow-sm relative">
          <button
            type="button"
            onClick={() => {
              setActiveTab("explore");
              setSearchParams({ tab: "explore" });
            }}
            className={`relative px-5 sm:px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer z-10 ${
              activeTab === "explore"
                ? "text-white"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            {activeTab === "explore" && (
              <motion.div
                layoutId="ugcBrowseTabPill"
                className="absolute inset-0 bg-[#7C3AED] rounded-full shadow-sm z-0"
                transition={{ type: "spring", stiffness: 450, damping: 32 }}
              />
            )}
            <span className="relative z-10">EXPLORE</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("manage");
              setSearchParams({ tab: "manage" });
            }}
            className={`relative px-5 sm:px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer z-10 ${
              activeTab === "manage"
                ? "text-white"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            {activeTab === "manage" && (
              <motion.div
                layoutId="ugcBrowseTabPill"
                className="absolute inset-0 bg-[#7C3AED] rounded-full shadow-sm z-0"
                transition={{ type: "spring", stiffness: 450, damping: 32 }}
              />
            )}
            <Clock size={15} className={`relative z-10 ${activeTab === "manage" ? "text-white" : "text-gray-500 dark:text-gray-400"}`} />
            <span className="relative z-10">MANAGE ORDERS</span>
            {activeOrders.length > 0 && (
              <span
                className={`relative z-10 px-2 py-0.5 text-[11px] font-black rounded-full transition-colors ${
                  activeTab === "manage"
                    ? "bg-white/20 text-white"
                    : "bg-[#EDE9FE] dark:bg-purple-950/60 text-[#7C3AED]"
                }`}
              >
                {activeOrders.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* RENDER ACTIVE TAB VIEW */}
      {activeTab === "manage" ? (
        <ManageUGCOrdersView
          initialOrderId={queryOrderId || claimedData?.order_id}
          onSelectBriefToExplore={() => {
            setActiveTab("explore");
            setSearchParams({ tab: "explore" });
          }}
        />
      ) : (
        <>
          {/* Filter Bar Row matching Screenshot 1 */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 mb-6">
            {/* Left: Search input & Format Pills */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
              {/* Search input */}
              <div className="relative w-full sm:w-80 shrink-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={15} />
                <input
                  type="text"
                  placeholder="Search title, product or brand"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full min-h-[40px] pl-9 pr-4 py-2 bg-[var(--bg-card)] rounded-xl text-base sm:text-sm font-medium text-[var(--text-primary)] border border-gray-200 dark:border-gray-800 outline-none focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED] transition-all shadow-2xs placeholder:text-gray-400"
                />
              </div>

              {/* Format Filter Pills with dynamic counts */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 hide-scrollbar">
                <button
                  type="button"
                  onClick={() => setDeliverableFilter("all")}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border flex items-center gap-1.5 ${
                    deliverableFilter === "all"
                      ? "bg-[#7C3AED] text-white border-[#7C3AED] shadow-xs"
                      : "bg-[var(--bg-card)] text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/60"
                  }`}
                >
                  <span>All formats</span>
                  <span className={`text-[11px] font-bold ${deliverableFilter === "all" ? "text-purple-100" : "text-gray-500"}`}>
                    {allOpenBriefs.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setDeliverableFilter("collab")}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border flex items-center gap-1.5 ${
                    deliverableFilter === "collab"
                      ? "bg-[#7C3AED] text-white border-[#7C3AED] shadow-xs"
                      : "bg-[var(--bg-card)] text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/60"
                  }`}
                >
                  <span>Collaboration</span>
                  <span className={`text-[11px] font-bold ${deliverableFilter === "collab" ? "text-purple-100" : "text-gray-500"}`}>
                    {collabCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setDeliverableFilter("edited")}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border flex items-center gap-1.5 ${
                    deliverableFilter === "edited"
                      ? "bg-[#7C3AED] text-white border-[#7C3AED] shadow-xs"
                      : "bg-[var(--bg-card)] text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/60"
                  }`}
                >
                  <span>UGC edited</span>
                  <span className={`text-[11px] font-bold ${deliverableFilter === "edited" ? "text-purple-100" : "text-gray-500"}`}>
                    {editedCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setDeliverableFilter("raw")}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border flex items-center gap-1.5 ${
                    deliverableFilter === "raw"
                      ? "bg-[#7C3AED] text-white border-[#7C3AED] shadow-xs"
                      : "bg-[var(--bg-card)] text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/60"
                  }`}
                >
                  <span>Draft / raw</span>
                  <span className={`text-[11px] font-bold ${deliverableFilter === "raw" ? "text-purple-100" : "text-gray-500"}`}>
                    {rawCount}
                  </span>
                </button>
              </div>
            </div>

            {/* Right: Sort dropdown matching Screenshot 1 */}
            <div className="relative shrink-0 self-end lg:self-center">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-card)] rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xs text-xs">
                <span className="text-gray-500 font-medium">Sort</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-transparent font-bold text-[var(--text-primary)] outline-none cursor-pointer pr-1 text-xs"
                >
                  <option value="newest">Newest</option>
                  <option value="payout_high">Highest Payout</option>
                  <option value="payout_low">Lowest Payout</option>
                </select>
                <ChevronDown size={13} className="text-gray-500 pointer-events-none -ml-1" />
              </div>
            </div>
          </div>

          {/* Grid of Briefs */}
          {filteredBriefs.length === 0 && !briefsLoaded ? (
            // v332: placeholder cards while briefs load
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6" aria-busy="true" aria-label="Loading briefs">
              {[0, 1, 2].map((k) => <div key={k} className="h-[230px] rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] animate-pulse" />)}
            </div>
          ) : filteredBriefs.length === 0 ? (
            <OfflineAware when={briefsFailed} onRetry={loadData}>{/* v334: offline → OfflineState */}
            <div className="text-center py-20 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-3xl">
              {/* v330: separate "couldn't load" / "none open" / "nothing matches" */}
              {briefsFailed ? (
                <>
                  <p className="text-[var(--text-primary)] font-semibold">Couldn't load briefs.</p>
                  <button type="button" onClick={loadData} className="mt-3 px-4 py-2 rounded-xl bg-[#7C3AED] text-white text-xs font-bold cursor-pointer">Try again</button>
                </>
              ) : !searchQuery.trim() && deliverableFilter === "all" ? (
                <p className="text-[var(--text-tertiary)] font-medium">No open briefs right now. Check back soon!</p>
              ) : (
              <p className="text-[var(--text-tertiary)] font-medium">No open briefs matching your search right now. Check back soon!</p>
              )}
            </div>
            </OfflineAware>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 relative z-10">
              {filteredBriefs.map(b => {
                const brandName = b.brand_name || b.brand?.name || b.brand?.company_name || b.company_name || "Brand"; // v332: no made-up "Verified"
                const brandLogo = resolveBrandLogo(b);
                const title = b.title || "UGC Video Brief";
                const payout = getPayout(Number(b.budget) || 0); // Session 53: no invented ₹15,000
                const description = b.product_description || b.detailed_requirements || b.description || b.instructions || b.product_name || "Create authentic UGC video content for brand promotion.";
                const matchingOrder = getMatchingOrderForBrief(b.id);
                const isApplied = Boolean(matchingOrder);
                const formatInfo = getDeliverableBadgeInfo(b);

                return (
                  <div
                    key={b.id}
                    role="button" tabIndex={0} /* v332: keyboard reachable */
                    onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setSelectedBrief(b); } }}
                    onClick={() => setSelectedBrief(b)}
                    className="bg-[var(--bg-card)] rounded-2xl p-5 sm:p-6 border border-[var(--border-default)] hover:border-[var(--violet)] hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col justify-between group relative overflow-hidden"
                  >
                    <div>
                      {/* Top Row: Brand Logo + Title + By Brand */}
                      <div className="flex items-start gap-3 mb-3">
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBrandForModal({
                              userId: b.brand_user_id || b.brand_id || b.brand?.user_id || b.brand?.id,
                              name: brandName,
                              logo: brandLogo
                            });
                          }}
                          className="w-12 h-12 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-[var(--violet)] cursor-pointer overflow-hidden flex items-center justify-center shrink-0 shadow-2xs font-black text-base text-[var(--violet)] transition-all hover:scale-105"
                          title="View Brand Profile"
                        >
                          {brandLogo ? (
                            <img 
                              src={brandLogo} 
                              alt={brandName} 
                              className="w-full h-full object-cover" 
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = initialsAvatarUrl(encodeURIComponent(brandName), "6366f1");
                              }}
                            />
                          ) : (
                            <span>{brandName.charAt(0).toUpperCase()}</span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-extrabold text-[var(--text-primary)] group-hover:text-[var(--violet)] transition-colors line-clamp-2 leading-snug">
                            {title}
                          </h3>
                          <p className="text-xs text-[var(--text-tertiary)] font-medium mt-0.5 truncate">
                            by <span 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBrandForModal({
                                  userId: b.brand_user_id || b.brand_id || b.brand?.user_id || b.brand?.id,
                                  name: brandName,
                                  logo: brandLogo
                                });
                              }}
                              className="text-[var(--text-secondary)] font-bold hover:text-[var(--violet)] hover:underline cursor-pointer"
                              title="View Brand Profile"
                            >{brandName}</span>
                          </p>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-[var(--text-tertiary)] font-medium line-clamp-2 leading-relaxed mb-3.5">
                        {description}
                      </p>

                      {/* Pills Row below description matching reference: [Coloured box] [Duration] [⚡ 24h delivery] */}
                      {/* NO emoji or icon before Collaboration / UGC edited / UGC raw - ONLY coloured box! */}
                      <div className="flex items-center gap-2 flex-wrap mb-4">
                        {b.is_priority && (
                          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 whitespace-nowrap">
                            Urgent · relisted
                          </span>
                        )}
                        {/* 1. Coloured box with video format only (NO emoji) */}
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap ${formatInfo.badgeClass}`}>
                          {formatInfo.label}
                        </span>

                        {/* 2. Duration */}
                        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200/60 dark:border-gray-700/60 whitespace-nowrap">
                          {b.video_duration || "30–60s"}
                        </span>

                        {/* 3. 24h delivery with lightning icon */}
                        <span className="relative px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200/60 dark:border-gray-700/60 inline-flex items-center gap-1.5 whitespace-nowrap">
                          <Zap size={11} className="text-gray-500 fill-gray-500" />
                          <span>{deliveryHoursOf(b.delivery_hours, 24)}h delivery</span>
                          {/* v283 (Ravi): NEW on every 24h delivery chip */}
                          <span className="ybex-shine absolute -top-[7px] -right-[6px] h-[13px] px-[5px] rounded-full bg-gradient-to-r from-[#F59E0B] to-[#EC4899] text-white text-[7.5px] font-extrabold tracking-[0.4px] leading-[13px] shadow-sm" data-testid="ugc-new-badge"><span className="relative z-[2]">NEW</span></span>
                        </span>
                      </div>
                    </div>

                    {/* Bottom Footer: PAYOUT on the left & View Details on the right */}
                    <div className="pt-3 border-t border-[var(--border-default)] flex items-center justify-between">
                      {/* Left: PAYOUT & Applied status */}
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 leading-none mb-1">
                            PAYOUT
                          </span>
                          <span className="text-base sm:text-lg font-black text-[#059669] font-mono leading-none">
                            {payout > 0 ? `₹${payout.toLocaleString('en-IN')}` : "—"}{/* v332: no "₹0" when the budget is missing */}
                          </span>
                        </div>

                        {isApplied && (
                          <div className="relative inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700/60 px-2.5 py-0.5 rounded-full overflow-hidden shadow-xs">
                            <Check size={11} className="text-emerald-600 dark:text-emerald-400 stroke-[3]" />
                            <span>Applied</span>
                          </div>
                        )}
                      </div>

                      {/* Right: View Details */}
                      <span className="text-xs font-bold text-[var(--violet)] group-hover:translate-x-1 transition-transform flex items-center gap-1 ml-auto">
                        <span>View Details</span>
                        <ArrowRight size={13} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Claim Modal */}
      <AnimatePresence>
        {selectedBrief && (() => {
          const selectedBriefMatchingOrder = getMatchingOrderForBrief(selectedBrief.id);
          const isSelectedBriefApplied = Boolean(selectedBriefMatchingOrder);
          const modalBrandName = selectedBrief.brand_name || selectedBrief.brand?.name || selectedBrief.brand?.company_name || selectedBrief.company_name || "Brand";
          const modalBrandLogo = resolveBrandLogo(selectedBrief);
          const briefDeliverableType = selectedBrief.deliverable_type || selectedBrief.format || selectedBrief.format_category || (selectedBrief.is_collaboration ? "collaboration_reel" : (selectedBrief.is_raw ? "ugc_video_raw" : "ugc_video_edited"));
          const modalDeliverableConfig = getDeliverableConfig(briefDeliverableType);

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={()=>setSelectedBrief(null)} />
              <motion.div initial={{scale:0.96, opacity:0, y: 16}} animate={{scale:1, opacity:1, y: 0}} exit={{scale:0.96, opacity:0, y: 16}} className="bg-white border border-[#E0E0E6] rounded-3xl w-full max-w-[1080px] h-[860px] max-h-[90vh] relative z-10 shadow-2xl flex flex-col overflow-hidden font-['DM_Sans',sans-serif]">
                
                {/* Header Row */}
                <div className="shrink-0 px-7 py-5 border-b border-[#E5E5EA] flex items-center gap-3.5 bg-white">
                  <div 
                    onClick={() => {
                      setSelectedBrandForModal({
                        userId: selectedBrief.brand_user_id || selectedBrief.brand_id || selectedBrief.brand?.user_id || selectedBrief.brand?.id,
                        name: modalBrandName,
                        logo: modalBrandLogo
                      });
                    }}
                    className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#A78BFA] to-[#5B21B6] text-white flex items-center justify-center font-bold text-lg shrink-0 cursor-pointer overflow-hidden shadow-xs hover:scale-105 transition-transform"
                    title="View Brand Profile"
                  >
                    {modalBrandLogo ? (
                      <img 
                        src={modalBrandLogo} 
                        alt={modalBrandName} 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = initialsAvatarUrl(encodeURIComponent(modalBrandName), "6366f1");
                        }}
                      />
                    ) : (
                      modalBrandName.charAt(0).toUpperCase()
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span 
                        onClick={() => {
                          setSelectedBrandForModal({
                            userId: selectedBrief.brand_user_id || selectedBrief.brand_id || selectedBrief.brand?.user_id || selectedBrief.brand?.id,
                            name: modalBrandName,
                            logo: modalBrandLogo
                          });
                        }}
                        className="font-bold text-[15px] text-[#0A0A0A] hover:text-[#7C3AED] hover:underline cursor-pointer truncate"
                      >
                        {modalBrandName}
                      </span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold text-[#047857] bg-emerald-50 border border-emerald-200">
                        <Check size={11} className="stroke-[3]" /> Verified brand
                      </span>
                    </div>
                    <div className="text-xs text-[#6B7280] mt-0.5">
                      {selectedBrief.category ? `${selectedBrief.category} · ` : ""}Direct Collaboration on Ybex{/* v332: no "Brand Partner" filler */}
                    </div>
                  </div>

                  {/* Step Indicator */}
                  <div className="hidden sm:flex items-center gap-2 text-xs text-[#6B7280] font-medium mr-2">
                    <span className="text-[#7C3AED] font-bold">1 Brief</span>
                    <span className="w-4.5 h-px bg-gray-300"></span>
                    <span>2 Agreement</span>
                  </div>

                  {/* Separate Close Button */}
                  <button 
                    onClick={() => setSelectedBrief(null)} 
                    aria-label="Close" /* v330 */
                    className="w-9 h-9 rounded-xl bg-[#F4F4F7] hover:bg-gray-200 text-[#374151] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    title="Close"
                  >
                    <X size={17} strokeWidth={2.4} />
                  </button>
                </div>

                {/* 2-Column Body */}
                <div className="flex-1 min-h-0 flex overflow-hidden">
                  {/* Left Column: Scrollable Brief Details */}
                  <div className="flex-1 min-w-0 p-6 md:p-8 overflow-y-auto space-y-6">
                    <div>
                      <h2 className="text-2xl md:text-[26px] font-bold tracking-tight text-[#0A0A0A] leading-snug">
                        {selectedBrief.title}
                      </h2>
                      {/* Format tags row */}
                      <div className="mt-3.5 flex flex-wrap gap-2">
                        <span className="h-7 px-2.5 rounded-lg bg-[#EEF2FF] text-[#4F46E5] font-semibold text-xs inline-flex items-center gap-1.5 border border-[#DDD6FE]/60">
                          <Video size={12} /> {modalDeliverableConfig.label || "Collaboration video"}
                        </span>
                        <span className="h-7 px-2.5 rounded-lg bg-[#F4F4F7] text-[#374151] font-semibold text-xs inline-flex items-center border border-gray-200/60">
                          {selectedBrief.video_duration || "30–60s"}
                        </span>
                        <span className="h-7 px-2.5 rounded-lg bg-[#F4F4F7] text-[#374151] font-semibold text-xs inline-flex items-center border border-gray-200/60">
                          9:16 vertical
                        </span>
                        <span className="h-7 px-2.5 rounded-lg bg-[#F4F4F7] text-[#374151] font-semibold text-xs inline-flex items-center border border-gray-200/60">
                          {modalDeliverableConfig.isPostingRequired ? "Instagram collab post" : "Brand posts it"}
                        </span>
                      </div>
                    </div>

                    {/* About the Product */}
                    {selectedBrief.product_description && (
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                          About the product
                        </div>
                        <p className="mt-2 text-sm text-[#1F2937] leading-relaxed whitespace-pre-line">
                          {selectedBrief.product_description}
                        </p>
                      </div>
                    )}

                    {/* What to Create */}
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                        What to create
                      </div>
                      {/* v332: the brand's own words only — a made-up brief was shown when it wrote none */}
                      {selectedBrief.detailed_requirements ? (
                        <p className="mt-2 text-sm text-[#1F2937] leading-relaxed whitespace-pre-line">
                          {selectedBrief.detailed_requirements}
                        </p>
                      ) : null}

                      {/* 2 Deliverables cards */}
                      <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="p-3.5 rounded-2xl border border-[#E6E8EE] flex items-start gap-3 bg-white">
                          <div className="w-8 h-8 rounded-xl bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center shrink-0">
                            <Zap size={15} />
                          </div>
                          <div>
                            <div className="font-semibold text-sm text-[#0A0A0A]">
                              {modalDeliverableConfig.isPostingRequired ? "Post on your Instagram" : "No need to share on Instagram"}
                            </div>
                            <div className="text-xs text-[#6B7280] mt-0.5">
                              {modalDeliverableConfig.isPostingRequired ? `As a collab with @${modalBrandName.toLowerCase().replace(/\s+/g, '')}` : "Brand posts it · Submit directly in app"}
                            </div>
                          </div>
                        </div>

                        <div className="p-3.5 rounded-2xl border border-[#E6E8EE] flex items-start gap-3 bg-white">
                          <div className="w-8 h-8 rounded-xl bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center shrink-0">
                            <Video size={15} />
                          </div>
                          <div>
                            <div className="font-semibold text-sm text-[#0A0A0A]">
                              {modalDeliverableConfig.key === "raw" ? "Raw, unedited footage" : "Fully edited video"}{/* v332: raw briefs said "Fully edited" */}
                            </div>
                            <div className="text-xs text-[#6B7280] mt-0.5">
                              With natural lighting and audio
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Do & Don't (SVG icons, NO emoji) — v332: only the brand's real lists; the made-up defaults were shown as the brand's rules */}
                    {(selectedBrief.dos?.[0] || selectedBrief.donts?.[0]) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div className="p-4 rounded-2xl bg-[#F7FBF8] border border-[#DDF1E4]">
                        <div className="font-bold text-sm text-[#047857] mb-2.5">Do</div>
                        <div className="space-y-2 text-xs text-[#1F2937]">
                          {selectedBrief.dos?.[0] ? (
                            selectedBrief.dos.map((d, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <Check size={14} className="text-[#059669] shrink-0 mt-0.5 stroke-[2.5]" />
                                <span>{d}</span>
                              </div>
                            ))
                          ) : (
                            <span className="text-[#6B7280]">Nothing specific from the brand.</span>
                          )}
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl bg-[#FEF8F8] border border-[#FEE4E2]">
                        <div className="font-bold text-sm text-rose-700 mb-2.5">Don’t</div>
                        <div className="space-y-2 text-xs text-[#1F2937]">
                          {selectedBrief.donts?.[0] ? (
                            selectedBrief.donts.map((d, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <X size={14} className="text-rose-500 shrink-0 mt-0.5 stroke-[2.5]" />
                                <span>{d}</span>
                              </div>
                            ))
                          ) : (
                            <span className="text-[#6B7280]">Nothing specific from the brand.</span>
                          )}
                        </div>
                      </div>
                    </div>
                    )}

                    {/* Sample reference - Only displayed if brand provided a sample URL */}
                    {Boolean(selectedBrief.sample_content_url && selectedBrief.sample_content_url.trim()) && (
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                          Sample reference
                        </div>
                        <div className="mt-2.5 p-3 rounded-2xl border border-[#E6E8EE] flex items-center gap-3.5 bg-white">
                          <div className="w-12 h-14 rounded-lg bg-gradient-to-br from-[#D6D3E8] to-[#4C4666] flex items-center justify-center shrink-0 text-white shadow-xs">
                            <PlayCircle size={20} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-[#0A0A0A]">Brand’s reference reel</div>
                            <div className="text-xs text-[#6B7280] mt-0.5">For style and pacing guidance only</div>
                          </div>
                          <a 
                            href={selectedBrief.sample_content_url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="h-8 px-3 rounded-lg border border-[#E2E4EA] text-xs font-semibold text-[#7C3AED] hover:bg-[#F5F0FF] flex items-center gap-1 transition-colors"
                          >
                            Watch <ExternalLink size={12} />
                          </a>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Sticky Summary Sidebar */}
                  <div className="w-80 md:w-84 shrink-0 bg-[#FAFAFC] border-l border-[#E5E5EA] p-6 flex flex-col justify-between">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                        Guaranteed payout
                      </div>
                      <div className="mt-2 font-bold text-3xl md:text-4xl text-[#059669] tracking-tight">
                        {Number(selectedBrief.budget) > 0 ? `₹${Number(selectedBrief.budget).toLocaleString('en-IN')}` : "—"}{/* v332: a text budget skipped Indian grouping; none showed ₹0 */}
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-[#047857] font-medium">
                        <Lock size={12} className="stroke-[2.5]" />
                        <span>Held in a secure payment hold · released on approval</span>
                      </div>

                      {/* Specs Table */}
                      <div className="mt-5 rounded-2xl bg-white border border-[#E6E8EE] divide-y divide-gray-100 overflow-hidden shadow-2xs">
                        <div className="p-3 flex items-center justify-between text-xs">
                          <span className="text-[#6B7280]">Delivery</span>
                          <span className="font-semibold text-[#0A0A0A]">{deliveryHoursOf(selectedBrief?.delivery_hours, 24)}h after signing</span>
                        </div>
                        <div className="p-3 flex items-center justify-between text-xs">
                          <span className="text-[#6B7280]">Revisions</span>
                          <span className="font-semibold text-[#0A0A0A]">Up to {UGC_REVISION_LIMIT}</span>
                        </div>
                        <div className="p-3 flex items-center justify-between text-xs">
                          <span className="text-[#6B7280]">Video</span>
                          <span className="font-semibold text-[#0A0A0A]">{selectedBrief.video_duration || "30–60s"} · 1080p</span>
                        </div>
                        <div className="p-3 flex items-center justify-between text-xs">
                          <span className="text-[#6B7280]">Payment</span>
                          <span className="font-semibold text-[#0A0A0A]">Within 48h of approval</span>
                        </div>
                      </div>

                      {/* Amber Timer Warning */}
                      <div className="mt-4 p-3 rounded-xl bg-[#FFFBEB] border border-[#FDECC0] flex items-start gap-2 text-xs text-[#78350F]">
                        <Clock size={14} className="shrink-0 mt-0.5 text-amber-600" />
                        <span className="leading-snug">The {deliveryHoursOf(selectedBrief?.delivery_hours, 24)}h timer starts when you sign. Missing it cancels the order.</span>
                      </div>
                    </div>

                    {/* Bottom CTA Area */}
                    <div className="mt-6 pt-4 border-t border-[#E5E5EA] flex flex-col gap-2.5">
                      {isSelectedBriefApplied ? (
                        <>
                          <div className="h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-sm flex items-center justify-center gap-2">
                            <CheckCircle2 size={16} /> Already Claimed
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const targetOrderId = selectedBriefMatchingOrder?.id || selectedBriefMatchingOrder?.deal_id;
                              setSelectedBrief(null);
                              setActiveTab("manage");
                              setSearchParams(targetOrderId ? { tab: "manage", orderId: targetOrderId } : { tab: "manage" });
                            }}
                            className="h-12 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                          >
                            <span>Go to Manage Orders</span>
                            <ArrowRight size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={handleClaim}
                            className="h-12 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-[14.5px] flex items-center justify-center gap-2 shadow-[0_12px_24px_-12px_rgba(124,58,237,0.95)] active:scale-[0.98] transition-all cursor-pointer"
                          >
                            <span>Claim this brief</span>
                            <ArrowRight size={16} />
                          </button>
                          <div className="text-[11.5px] text-[#6B7280] text-center">
                            Next: review and sign the agreement.
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {showUGCContractModal && claimedData && (
        <UGCContractModal
          brief={claimedData.brief}
          orderId={claimedData.order_id}
          threadId={claimedData.thread_id}
          onClose={() => {
            setShowUGCContractModal(false);
            setClaimedData(null);
            loadData();
          }}
          onSigned={(signedOrderId) => {
            setShowUGCContractModal(false);
            setClaimedData(null);
            setActiveTab("manage");
            setSearchParams({ tab: "manage" });
            loadData();
          }}
          onStartChat={() => {
            setShowUGCContractModal(false);
            setClaimedData(null);
            setActiveTab("manage");
            setSearchParams({ tab: "manage" });
            loadData();
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

export default function CreatorUGCBrowse({ defaultTab = "explore" }) {
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const queryOrderId = searchParams.get("orderId") || searchParams.get("dealId");

  if (isMobile) {
    return <CreatorUGCMobile defaultTab={defaultTab} initialOrderId={queryOrderId} />;
  }

  return <CreatorUGCBrowseDesktop defaultTab={defaultTab} />;
}


