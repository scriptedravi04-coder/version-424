import { deliverablesLabel } from "../../utils/safeFormat"; // v415
import { markHomeReady } from "../../lib/popupRules";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { istDateString } from "../../utils/istDate";
import MeetCreatorsGrid from "../../components/dashboard/MeetCreatorsGrid";
import WalletChip from "../../components/referral/WalletChip";
import FeedbackBot from "../../components/feedback/FeedbackBot";
import { HiwTile, AppTour } from "../../components/whatsNew/WhatsNewPopup"; // v437
import { visibleCreators } from "../../lib/visibleCreators";
import { useNavigate } from "react-router-dom";
import { Zap, Send, CreditCard, Gift, Bell, MessageCircle, Clock, FileText, ShieldCheck, User, Package, Video, Tag } from "lucide-react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import PullToRefresh from "../../components/common/PullToRefresh";
import { realAppliedCount, realViewCount } from "../../utils/campaignStatsForViewer";
import { draftGet, draftSet } from "../../lib/userDraft";
import { useLiveRefresh } from "../../lib/liveRefresh";
import { snapshotGet, hasSnapshots } from "../../lib/apiSnapshot";
import ActiveBriefsCarousel from "./brandHome/ActiveBriefsCarousel";
import BrandHomeActions from "./brandHome/BrandHomeActions";
import BrandsGrowingStrip from "./brandHome/BrandsGrowingStrip";
import CampaignManagerCard from "./brandHome/CampaignManagerCard";
import CampaignTemplatesRow from "./brandHome/CampaignTemplatesRow";
import ScheduleCallModal from "./brandHome/ScheduleCallModal";
import { campaignDaysLeft } from "../../components/campaigns/mobile/HomeCampaignCard"; // v416 (CR20): IST calendar days
import { initials as initialsOf } from "../../utils/initials";
import { countUnreadThreads } from "../../lib/threadSeen"; // v348
import { DW, DIWALI_TILES_CSS, BRAND_LINE, diwaliOn, DiwaliHeaderDecor, DhamakaTitle, DiyaArch } from "../../components/challenge/DiwaliHome"; // v372: design 2n
import { appConfirm } from "../../components/common/Popup"; // v430: app confirm sheet

// Session 42: inside the feed loader `api` is either the real client or the saved-answers one.
const liveApi = api;
const SNAPSHOT_API = { get: snapshotGet };

// Session 42: home paints from saved answers when these exist (src/lib/apiSnapshot.js).
const BRAND_HOME_SNAPSHOT_URLS = ["brands/me", "campaigns?mine=true", "ugc/orders/brand"];

// Rotating Trust & Value propositions for Brand (Short, Cute, Centered)
const BRAND_TRUST_ITEMS = [
  { title: "100% KYC-verified creators", text: "payments in a secure payment hold" },
  { title: "Payments released only on your approval", text: "funds released on approval" }, // v415: plain English (was "Secure Payment Hold Protected Deals")
  { title: "Zero Platform Fee for brands", text: "you pay the agreed amount" }, // v333: softened
  { title: "OTP-signed agreements", text: "work, price and dates in writing" }, // v333: softened
  { title: "Tracked delivery time", text: "every UGC brief has a deadline" }, // v333: softened
];

// Default Hero Banners for Brand Home when CMS banners are empty
const DEFAULT_BRAND_BANNERS = [
  {
    id: "brand-banner-1",
    title: "Pre-vetted UGC creators", // Session 58: no invented count
    subtitle: "Source authentic video ads with secure payment protection",
    image: "https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=800&auto=format&fit=crop",
    isDefault: true, cta: "Create a campaign",
    link: "/brand/campaigns/create",
    badge: "PAYMENT PROTECTION", // v415: plain English (was "SECURE PAYMENT HOLD")
  },
  {
    id: "brand-banner-2",
    title: "Instant UGC Video Deliverables",
    subtitle: "Short videos from verified creators — pay safely, approve before release", // v358: no "4K in 48 hours" promise
    image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop",
    isDefault: true, cta: "Post a UGC brief",
    link: "/brand/ugc/post",
    badge: "FAST TURNAROUND",
  },
  {
    id: "brand-banner-3",
    title: "Invite Verified Creators Directly",
    subtitle: "Browse top-performing niches in Fashion, Tech & D2C",
    image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=800&auto=format&fit=crop",
    isDefault: true, cta: "Explore creators",
    link: "/brand/discover",
    badge: "DIRECT PITCH",
  },
];

// High-converting Campaign Templates
const CAMPAIGN_TEMPLATES = [
  {
    id: "unboxing-review",
    title: "Product unboxing & honest review",
    deliverableSummary: "1 Reel + 2 Stories",
    icon: Package,
    iconBg: "#FFF1E6",
    iconColor: "#EA580C",
    deliverablesText: "1 Instagram Reel (30-60s) + 2 Follow-up Stories with sticker link",
    requirementsText:
      "Creator will receive the product sample and produce an authentic unboxing video with honest review, showcasing product packaging, texture, and real application. Clear call-to-action to check link in bio.",
    budget: "6000",
    category: "Lifestyle & D2C",
  },
  {
    id: "festive-discount",
    title: "Festive discount announcement",
    deliverableSummary: "Scripted hook + CTA",
    icon: Tag,
    iconBg: "#FFF0F5",
    iconColor: "#DB2777",
    deliverablesText: "1 High-energy Promo Reel (15-30s) with exclusive coupon code pinned",
    requirementsText:
      "High-energy hook announcing limited-time festive discount and exclusive coupon code. Highlight key product benefits and urge followers to shop before the festive offer ends.",
    budget: "7500",
    category: "Festive & E-Commerce",
  },
  {
    id: "aesthetic-broll",
    title: "Aesthetic UGC B-roll pack",
    deliverableSummary: "Raw 4K footage for ads",
    icon: Video,
    iconBg: "#E0F2FE",
    iconColor: "#0284C7",
    deliverablesText: "5 Raw B-Roll Video Clips (4K 60fps) + 3 Hook variations",
    requirementsText:
      "High aesthetic visual clips in 4K resolution. Clean background, natural lighting, macro product shots, aesthetic handling, and 3 hook variations for Meta performance ads.",
    budget: "8500",
    category: "Performance Ads",
  },
];




export default function BrandHomeMobile({ user }) {
  const navigate = useNavigate();

  // Loading and sync states
  const [loading, setLoading] = useState(true);
  const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Data states
  const [banners, setBanners] = useState(DEFAULT_BRAND_BANNERS);
  const [currentBannerIdx, setCurrentBannerIdx] = useState(0);
  const [brandProfile, setBrandProfile] = useState(null);
  const [kycStatus, setKycStatus] = useState(null); // 'approved', 'pending', null
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadChatMessages, setUnreadChatMessages] = useState(0);
  const [logoFailed, setLogoFailed] = useState(false); // v330: broken logo URL → initials, not a broken image

  // Active brief and campaign data
  const [campaigns, setCampaigns] = useState([]);
  const [ugcOrders, setUgcOrders] = useState([]);
  // v358: last good lists (a failed refresh keeps them) + UGC brief count for the "new brand" check
  const [ugcBriefCount, setUgcBriefCount] = useState(0);
  const campaignsRef = useRef(null);
  const ugcOrdersRef = useRef(null);
  const ugcBriefsRef = useRef(null);
  const feedFailedRef = useRef(false);
  const [feedFailed, setFeedFailed] = useState(false); // v416 (M5): drives the "Couldn't refresh" line + retry
  const [activeBriefs, setActiveBriefs] = useState([]);

  // Stats
  const [stats, setStats] = useState({
    activeCollabs: 0,
    applicantsCount: 0,
    totalSpent: null, // v416: unknown until loaded
    totalCampaigns: 0,
    draftsToReviewCount: 0,
    liveLinksToApproveCount: 0,
    counteredPitchesCount: 0,
    sampleDeliveriesCount: 0,
  });

  // Featured Creators
  const [featuredCreators, setFeaturedCreators] = useState([]);

  // Carousel & Rotator states
  const [onboardingStepIdx, setOnboardingStepIdx] = useState(0);
  const [trustIdx, setTrustIdx] = useState(0);

  // Carousel touch handlers
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const handleTouchStart = (e) => {
    if (e.targetTouches?.[0]) {
      touchStartX.current = e.targetTouches[0].clientX;
    }
  };
  const handleTouchEnd = (e) => {
    if (e.changedTouches?.[0]) {
      touchEndX.current = e.changedTouches[0].clientX;
      const diff = touchStartX.current - touchEndX.current;
      if (diff > 45 && banners.length > 1) {
        setCurrentBannerIdx((prev) => (prev + 1) % banners.length);
      } else if (diff < -45 && banners.length > 1) {
        setCurrentBannerIdx((prev) => (prev - 1 + banners.length) % banners.length);
      }
    }
  };

  // Modals
  const [isScheduleCallModalOpen, setIsScheduleCallModalOpen] = useState(false);
  const [scheduleCallDate, setScheduleCallDate] = useState(() => istDateString(1)); // Session 58: "tomorrow" in IST
  const [scheduleCallTime, setScheduleCallTime] = useState("02:30 PM");
  const [scheduleCallNote, setScheduleCallNote] = useState("");
  const [scheduleCallSubmitting, setScheduleCallSubmitting] = useState(false);

  // Update clock every minute for relative timestamps
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  // Banner rotation interval (every 4s)
  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentBannerIdx((prev) => (prev + 1) % banners.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [banners.length]);


  // Onboarding tasks rotation (every 4s). Session 41: the card now slides; a swipe moves it by hand
  // and pauses the auto-slide for a few seconds so it doesn't jump under the finger.
  const importantPauseUntil = useRef(0);
  const [importantDir, setImportantDir] = useState(1);
  // v332: rotate over the real number of cards (it always counted to 3, so with 2 cards the first one
  // showed twice in a row and the "1/2 · 2/2" counter seemed stuck).
  const onboardingCountRef = useRef(3);
  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() < importantPauseUntil.current) return;
      const n = onboardingCountRef.current;
      if (n <= 1) return;
      setImportantDir(1);
      setOnboardingStepIdx((prev) => (prev + 1) % n);
    }, 4000);
    return () => clearInterval(interval);
  }, []);
  const swipeImportant = (step) => {
    const n = Math.max(1, onboardingCountRef.current);
    importantPauseUntil.current = Date.now() + 7000;
    setImportantDir(step);
    setOnboardingStepIdx((prev) => (prev + step + n) % n);
  };

  // Rotating trust line timer (every 3.5s like CreatorHomeMobile)
  useEffect(() => {
    const timer = setInterval(() => {
      setTrustIdx((prev) => (prev + 1) % BRAND_TRUST_ITEMS.length);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  // Main data loader function
  const fetchBrandFeedData = useCallback(
    async (isBackground = false, mode = "network") => {
      // Session 42: "snapshot" paints the last saved answers at once; "quiet" refreshes behind them.
      const api = mode === "snapshot" ? SNAPSHOT_API : liveApi;
      if (mode === "network") {
        if (!isBackground) setLoading(true);
        else setIsRefreshingFeed(true);
      }

      const brandUserId = user?.parent_brand_id || user?.user_id || user?.id;

      try {
        const results = await Promise.allSettled([
          // 0: Brand Profile
          // Session 41: there is no GET /brands/profile (only POST) — this always failed, so the
          // header showed initials instead of the logo uploaded in onboarding.
          api.get("brands/me").catch(() => null),
          // 1: Brand KYC
          // Through the server (session 22): no direct `brand_kyc` read from the browser.
          api.get("/verifications/me").then((r) => ({ data: r?.data?.status ? { status: r.data.status } : null })).catch(() => ({ data: null, failed: true })), // v358
          // 2: Campaigns
          api.get("campaigns?mine=true").catch(() => null), // v358: a failed load is NOT "no campaigns"
          // 3: UGC Orders
          api.get("ugc/orders/brand").catch(() => null),
          // 4: Banners (Admin Panel Real Banners)
          api.get("banners?audience=brand").catch(() => ({ data: [] })),
          // 5: Chat Threads
          api.get("chat/v2/threads").catch(() => ({ data: [] })),
          // 6: Notifications count
          // Through the server (session 22): no direct `notifications` read from the browser.
          api.get("/notifications?unread=true").then((r) => ({ count: Array.isArray(r?.data) ? r.data.filter((n) => !n.read && !n.is_read).length : 0 })).catch(() => ({ count: 0 })),
          // 7: Transactions / Spent
          api.get("transactions").catch(() => ({ data: null, failed: true })), // v416 (CR21)
          // 8: Creators Explore sample
          api.get("creators/explore").catch(() => ({ data: [] })),
          // 9: UGC Briefs posted by Brand
          api.get("ugc/briefs/my").catch(() => null),
        ]);

        // Process Brand Profile
        if (results[0].status === "fulfilled" && results[0].value?.data) {
          setBrandProfile(results[0].value.data);
        }

        // Process KYC
        if (results[1].status === "fulfilled" && results[1].value?.data) {
          setKycStatus(results[1].value.data.status);
        } else if (results[1].status === "fulfilled" && results[1].value?.failed) {
          // v358: the check failed — keep what we showed, don't flip an approved brand to "KYC pending"
        } else {
          setKycStatus(user?.kyc_verified ? "approved" : null);
        }

        // Process Campaigns
        // v358: a failed read used to save [] → an active brand saw "Welcome to Ybex" + "Post your first brief".
        // Keep what we had and remember the failure.
        let feedFailed = false;
        let fetchedCampaigns = campaignsRef.current || [];
        if (results[2].status === "fulfilled" && results[2].value) {
          const cData = results[2].value?.data;
          fetchedCampaigns = Array.isArray(cData) ? cData : (Array.isArray(cData?.campaigns) ? cData.campaigns : []);
          setCampaigns(fetchedCampaigns);
        } else feedFailed = true;

        // Process UGC Orders
        let fetchedOrders = ugcOrdersRef.current || [];
        if (results[3].status === "fulfilled" && results[3].value) {
          const oData = results[3].value?.data;
          fetchedOrders = oData?.orders || (Array.isArray(oData) ? oData : []);
          setUgcOrders(fetchedOrders);
        } else feedFailed = true;

        // Process UGC Briefs
        let fetchedUgcBriefs = ugcBriefsRef.current || [];
        if (results[9]?.status === "fulfilled" && results[9].value) {
          const ubData = results[9].value?.data;
          fetchedUgcBriefs = ubData?.briefs || (Array.isArray(ubData) ? ubData : []);
          setUgcBriefCount(fetchedUgcBriefs.length); // v358: UGC-only brands are not "new"
          ugcBriefsRef.current = fetchedUgcBriefs;
        } else feedFailed = true;
        if (mode !== "snapshot") feedFailedRef.current = feedFailed;

        // Process Banners (Admin Panel Real Banners)
        if (results[4].status === "fulfilled") {
          const bData = results[4].value?.data;
          const rawBanners = Array.isArray(bData) ? bData : (bData?.banners || []);
          if (rawBanners.length > 0) {
            const mapped = rawBanners
              .map((b) => ({
                id: b.id,
                title: b.title || "Featured Promotion",
                subtitle: b.description || b.subtitle || "",
                image: b.imgUrl || b.image_url || b.image || b.banner_image,
                banner_image: b.imgUrl || b.image_url || b.image || b.banner_image,
                link: b.link || b.link_url || "/brand/campaigns/create",
                badge: b.tag || null, // v358: never the admin's internal placement name ("Dashboard Hero Carousel")
              }))
              .filter((b) => Boolean(b.image));
            if (mapped.length > 0) {
              setBanners(mapped);
            } else {
              setBanners(DEFAULT_BRAND_BANNERS);
            }
          } else {
            setBanners(DEFAULT_BRAND_BANNERS);
          }
        }

        // Process Chat Threads
        if (results[5].status === "fulfilled" && Array.isArray(results[5].value?.data)) {
          // Session 58 (bug hunt): the threads list sends `unread_count` — the old fields never existed, so this was always 0.
          // v348: same count the Inbox shows. The extra "last message not mine and no `read` field" rule was
          // always true for a deal whose last message is a system card (payout released) → "1 unread" for ever.
          const unreadCount = countUnreadThreads(results[5].value.data.filter((t) => Number(t.unread_count) > 0));
          setUnreadChatMessages(unreadCount);
        }

        // Process Notifications
        if (results[6].status === "fulfilled") {
          setUnreadNotifications(results[6].value?.count || 0);
        }

        // Process Transactions / Spent
        // v416 (CR21): a failed read is "not known" (null), never "₹0 spent".
        let totalSpentAmount = null;
        if (results[7].status === "fulfilled" && results[7].value && !results[7].value.failed) {
          const txns = results[7].value?.data;
          if (Array.isArray(txns)) {
            totalSpentAmount = txns
              // v332: refund rows (money back to the brand) are not spending — same rule as desktop.
              .filter((t) => (t.status === "SUCCESS" || t.status === "PAID") && t.is_refund_row !== true && String(t.payout_type || "") !== "refund")
              .reduce((sum, t) => sum + Number(t.gross_amount || t.amount || 0), 0);
          }
        }

        // Process Creators for explore cards
        // v286 (Ravi): only the creators Explore shows (approved from the waitlist). The old direct
        // creator_profiles read showed every registered creator (Ankit Tomar, Developer Bypass…).
        let crList = [];
        if (results[8].status === "fulfilled" && Array.isArray(results[8].value?.data)) {
          crList = visibleCreators(results[8].value.data);
        }

        if (crList.length > 0) {
          const glowPalettes = [
            "#F59E0B",
            "#7C3AED",
            "#22C55E",
            "#64748B",
            "#F43F5E",
            "#EC4899",
            "#B45309",
            "#0EA5E9",
            "#F97316",
          ];
          const mapped = crList.slice(0, 9).map((c, i) => {
            // Session 58 (bug hunt): no data → no number (it used to show an invented "50K").
            const followersNum = Number(c.avg_reach || c.average_reach || c.followers_count || c.reach || 0);
            const reachStr = !followersNum ? "" :
              followersNum >= 1000000
                ? `${(followersNum / 1000000).toFixed(1)}M`
                : followersNum >= 1000
                ? `${Math.round(followersNum / 1000)}K`
                : `${followersNum}`;
            return {
              id: c.user_id || c.id || `cr-${i}`,
              name: c.name || c.full_name || c.displayName || c.username || "Creator",
              reach: reachStr,
              reachNum: followersNum,
              photo:
                c.avatar_url ||
                c.photo ||
                c.profile_image ||
                c.profile_picture_url ||
                null,
              glowColor: c.glowColor || glowPalettes[i % glowPalettes.length],
            };
          });
          setFeaturedCreators(mapped);
        } else {
          setFeaturedCreators([]);
        }

        // Calculate Action Items Counts
        let draftsReviewCount = 0;
        let liveLinksApproveCount = 0;
        let counteredCount = 0;
        let sampleDeliveriesCount = 0;

        // From UGC Orders
        fetchedOrders.forEach((o) => {
          const status = (o.brand_status || o.status || o.stage || "").toUpperCase();
          if (
            status === "SUBMITTED" ||
            status === "CONTENT_SUBMITTED" ||
            status === "DELIVERED" ||
            status === "DRAFT_SUBMITTED" ||
            status === "PENDING_REVIEW"
          ) {
            draftsReviewCount++;
          }
          // Session 58: only links the creator has SUBMITTED wait for the brand. live_link_approved_at doesn't exist,
          // so every order that ever had a link (paid ones too) counted forever.
          if (
            status === "LIVE_LINK_SUBMITTED" ||
            status === "PROOF_SUBMITTED"
          ) {
            liveLinksApproveCount++;
          }
          if (status === "PRICE_COUNTERED" || status === "NEGOTIATING") {
            counteredCount++;
          }
          if (status === "SAMPLE_SHIPPED" || status === "SAMPLE_DELIVERED") {
            sampleDeliveriesCount++;
          }
        });

        // Compute total applicants from campaigns
        let totalApplicants = 0;
        fetchedCampaigns.forEach((c) => {
          totalApplicants += Number(realAppliedCount(c)) || 0; // Session 58: the API sends an applicants list, not a count
        });

        // Compile Stats
        setStats({
          activeCollabs: fetchedOrders.filter(
            (o) =>
              (o.status || "").toUpperCase() !== "COMPLETED" &&
              (o.status || "").toUpperCase() !== "CANCELLED"
          ).length,
          applicantsCount: totalApplicants,
          totalSpent: totalSpentAmount,
          totalCampaigns: fetchedCampaigns.length,
          draftsToReviewCount: draftsReviewCount,
          liveLinksToApproveCount: liveLinksApproveCount,
          counteredPitchesCount: counteredCount,
          sampleDeliveriesCount: sampleDeliveriesCount,
        });

        // Active Briefs for Horizontal Carousel
        const allBrandCampaigns = [...fetchedCampaigns];
        if (Array.isArray(fetchedUgcBriefs)) {
          fetchedUgcBriefs.forEach((b) => {
            const bId = b.id || b.brief_id;
            if (!allBrandCampaigns.some((c) => (c.campaign_id || c.id) === bId)) {
              allBrandCampaigns.push({
                ...b,
                campaign_id: bId,
                id: bId,
                title: b.title || b.product_name || "UGC Video Brief",
                deliverables: b.deliverable_type || b.format || "UGC Video",
                status: b.status || "live",
                isUgc: true,
                deadline: b.deadline,
              });
            }
          });
        }

        const activeList = allBrandCampaigns
          .filter((c) => {
            const st = (c.status || c.stage || "").toLowerCase();
            return st === "live" || st === "shortlisting" || st === "in production" || st === "active" || st === "approved" || (c.isUgc && st === "open"); // v423: UGC briefs are OPEN while live
          })
          .map((c) => {
            let badgeText = "LIVE";
            let badgeBg = "#DCFCE7";
            let badgeColor = "#15803D";
            const s = (c.status || c.stage || "").toLowerCase();
            if (s === "shortlisting") {
              badgeText = "SHORTLISTING";
              badgeBg = "#FEF3C7";
              badgeColor = "#B45309";
            } else if (s === "in production") {
              badgeText = "IN PRODUCTION";
              badgeBg = "#F3EDFF";
              badgeColor = "#7C3AED";
            }

            // Clean format deliverables (prevent text collision like Short1)
            let typeStr = "UGC edited · 30s";
            if (Array.isArray(c.deliverables)) {
              typeStr = deliverablesLabel(c.deliverables, " · "); // v415: no "[object Object]"
            } else if (typeof c.deliverables === "string" && c.deliverables.trim()) {
              typeStr = c.deliverables;
            } else if (c.category) {
              typeStr = `${c.category}${c.platform ? ` · ${c.platform}` : ""}`;
            }

            // Session 38 (Ravi): this is the brand's own home — only real numbers and real
            // applicant photos here. Generated views / applied / faces are for creators only.
            const appliedCount = realAppliedCount(c);
            const viewsCount = realViewCount(c);
            const avatars = (Array.isArray(c.applicants) ? c.applicants : [])
              .map((a) => a.creator_photo || a.photo || a.avatar_url)
              .filter(Boolean)
              .slice(0, 4);

            return {
              id: c.campaign_id || c.id,
              title: c.title || "Collaboration Campaign",
              type: typeStr,
              // v330: "1 days left" / past deadlines read wrong — singular, "Ends today", "Deadline passed".
              // v416 (CR20): counted in IST calendar days (the UTC count was a day off in the evening).
              daysLeft: (() => {
                const d = campaignDaysLeft(c.deadline);
                if (d === null) return "Active";
                if (d < 0) return "Deadline passed";
                if (d === 0) return "Ends today";
                return `${d} day${d === 1 ? "" : "s"} left`;
              })(),
              views: viewsCount,
              appliedCount: appliedCount,
              avatars: avatars,
              isUgc: Boolean(c.isUgc),
              badgeText,
              badgeBg,
              badgeColor,
            };
          });

        setActiveBriefs(activeList);
        // v416 (M5): "Just updated" only after a load that worked.
        if (mode !== "snapshot") {
          setFeedFailed(feedFailed);
          if (!feedFailed) setLastRefreshedAt(new Date());
        }
      } catch (err) {
        console.warn("Brand home feed loading warning:", err);
      } finally {
        setLoading(false);
        markHomeReady(); // v426
        setIsRefreshingFeed(false);
      }
    },
    [user]
  );

  // Session 28: same live refresh as desktop — background reload, no spinner.
  useLiveRefresh(() => fetchBrandFeedData(true), { types: ["application", "deal", "kyc", "verification", "campaign", "payment", "escrow"], intervalMs: 120000 });

  // Initial load — Session 42: saved answers first (instant), then the server.
  useEffect(() => {
    if (user && hasSnapshots(BRAND_HOME_SNAPSHOT_URLS)) {
      fetchBrandFeedData(false, "snapshot").then(() => fetchBrandFeedData(false, "quiet"));
    } else {
      fetchBrandFeedData(false);
    }
  }, [fetchBrandFeedData]);

  // v415: tell the page shell the home has loaded — the city footer is drawn only then (it jumped down under the
  // half-loaded page: CLS 0.51 on the brand home).
  useEffect(() => {
    if (loading || typeof window === "undefined") return;
    window.dispatchEvent(new Event("yb:home-ready"));
  }, [loading]);

  // Pull-to-refresh handler
  const handlePullRefresh = async () => {
    await fetchBrandFeedData(true);
    // v358: the pull view already says "synced" — only speak up when it didn't work
    if (feedFailedRef.current) toast.error("Couldn't refresh everything. Check your internet and pull again.");
  };

  // Brand Name & Initials
  const brandName =
    brandProfile?.company_name ||
    user?.company_name ||
    user?.name ||
    user?.full_name ||
    "Your brand"; // Session 42: was the demo name "Team Nexus" (rule 88)

  // v346: emoji-safe initials ("Glow 🌿 Cosmetics" showed "G" + half an emoji)
  const brandInitials = useMemo(() => initialsOf(brandName, { oneWordLetters: 2, fallback: "B" }), [brandName]);

  // Approval badge details
  const approvalBadge = useMemo(() => {
    // Session 41 (Ravi): "APPROVED" only when the admin approved the KYC. It used to fall back to
    // the account status (approved from the waitlist) and to a default "APPROVED" chip.
    const st = String(kycStatus || "").toLowerCase();
    if (st === "approved" || user?.kyc_verified) {
      return { label: "VERIFIED", bg: "#DCFCE7", color: "#15803D" }; // v416: same words as Settings / desktop
    }
    if (st === "pending" || st === "under_review" || st === "submitted") {
      return { label: "UNDER REVIEW", bg: "#FEF3C7", color: "#B45309" };
    }
    if (st === "rejected") {
      return { label: "NEEDS CHANGES", bg: "#FEE2E2", color: "#B91C1C" };
    }
    if (st === "more_info_needed" || st === "more_info" || st === "needs_info") { // v358: admin asked for more info
      return { label: "MORE INFO NEEDED", bg: "#FEF3C7", color: "#B45309" };
    }
    // v286 (Ravi): grey looked like a feature tag — red so the eye goes to it.
    return { label: "VERIFICATION PENDING", bg: "#FEE2E2", color: "#DC2626", border: "1px solid #FCA5A5" };
  }, [kycStatus, user]);

  // Greeting
  const festive = diwaliOn(); // v372 (Ravi: "brand panel ke liye bhi Diwali theme"): design 2n till Diwali night
  const greeting = useMemo(() => {
    if (festive) return "HAPPY DIWALI";
    // v332: not "Welcome" for an existing brand while the first load is still running; "Ybex" spelling
    const isNew = !loading && campaigns.length === 0 && ugcOrders.length === 0;
    if (isNew) return "Welcome to Ybex";
    const hr = new Date().getHours();
    if (hr < 12) return "Good morning";
    if (hr < 17) return "Good afternoon";
    return "Good evening";
  }, [campaigns.length, ugcOrders.length, loading]);

  // Relative last updated text
  const lastUpdatedText = useMemo(() => {
    if (feedFailed) return "Couldn't refresh"; // v416 (M5)
    if (!lastRefreshedAt) return "Live";
    const diffSec = Math.floor((now - lastRefreshedAt.getTime()) / 1000);
    if (diffSec < 45) return "Just updated";
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins}m ago`;
    return "Synced";
  }, [lastRefreshedAt, now, feedFailed]);

  // Determine if this is a new brand or active brand
  // v332: during the first load every brand looked "new" for a moment (onboarding cards flashed in).
  campaignsRef.current = campaigns; ugcOrdersRef.current = ugcOrders; // v358
  const isNewBrand = !loading && !feedFailedRef.current && campaigns.length === 0 && ugcOrders.length === 0 && ugcBriefCount === 0; // v358: + UGC briefs, never after a failed load

  // Onboarding tasks definition for New Brand
  const onboardingTasks = useMemo(() => {
    const tasks = [];
    // v286 (Ravi: "jo genuinely database mein khaali hai sirf wahi dikhao"): check each field the
    // brand profile has and name only the ones that are really empty. Nothing empty → no card.
    const missing = [];
    if (!String(brandProfile?.logo || user?.photo || user?.picture || "").trim()) missing.push("logo");
    if (!String(brandProfile?.company_name || "").trim()) missing.push("brand name");
    if (!String(brandProfile?.industry || brandProfile?.category || "").trim()) missing.push("category");
    if (!String(brandProfile?.website || "").trim()) missing.push("website");
    const hasProfile = !brandProfile || missing.length === 0; // not loaded yet → don't guess
    const hasKyc = Boolean(String(kycStatus || "").toLowerCase() === "approved" || user?.kyc_verified); // v358: server sends "APPROVED"
    const hasCampaign = campaigns.length > 0 || ugcBriefCount > 0; // v358: a UGC brief counts as a first brief
    const listOf = (a) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} & ${a[a.length - 1]}`);

    if (!hasProfile) {
      tasks.push({
        id: "profile",
        title: "Complete your profile",
        desc: `Add ${listOf(missing)}`,
        btnText: "Complete",
        icon: User,
        iconBg: "#F3EDFF",
        iconColor: "#7C3AED",
        onClick: () => navigate("/brand/profile"),
      });
    }

    if (!hasKyc) {
      tasks.push({
        id: "kyc",
        title: "Complete your KYC",
        desc: "Verify GST / PAN to pay creators",
        btnText: "Verify",
        icon: ShieldCheck,
        iconBg: "#E9F7F0",
        iconColor: "#059669",
        onClick: () => navigate("/brand/kyc"),
      });
    }

    if (!hasCampaign) {
      tasks.push({
        id: "first_brief",
        title: "Post your first brief",
        desc: "Reach verified UGC creators",
        btnText: "Launch",
        icon: Send,
        iconBg: "#FFF1E6",
        iconColor: "#EA580C",
        onClick: () => navigate("/brand/campaigns/create"),
      });
    }

    return tasks;
  }, [brandProfile, kycStatus, user, campaigns.length, ugcBriefCount, navigate]);
  onboardingCountRef.current = onboardingTasks.length; // v332: see the rotation timer above

  // Needs your action items for Active Brand (100% real actions only: UGC orders or Campaign chat/applicants)
  const needsActionItems = useMemo(() => {
    const items = [];

    // 1. UGC Orders: Drafts waiting for review -> Redirects to UGC Manage Orders
    if (stats.draftsToReviewCount > 0) {
      items.push({
        id: "drafts",
        icon: FileText,
        iconBg: "#FFF0F5",
        iconColor: "#DB2777",
        title: `${stats.draftsToReviewCount} UGC draft${stats.draftsToReviewCount > 1 ? "s" : ""} waiting for review`,
        subtitle: "Review deliverable & approve or request edits",
        subColor: "#B45309",
        btnText: "Review",
        btnBg: "#7C3AED",
        btnColor: "#fff",
        onClick: () => navigate("/brand/ugc/orders"),
      });
    }

    // 2. UGC Orders: Live reel link uploaded -> Redirects to UGC Manage Orders
    if (stats.liveLinksToApproveCount > 0) {
      items.push({
        id: "livelinks",
        icon: Clock,
        iconBg: "#FEF3C7",
        iconColor: "#B45309",
        title: `${stats.liveLinksToApproveCount} live reel link${stats.liveLinksToApproveCount > 1 ? "s" : ""} uploaded`,
        subtitle: "Approve link to release creator payout",
        subColor: "#B45309",
        btnText: "Approve",
        btnBg: "#F3EDFF",
        btnColor: "#7C3AED",
        onClick: () => navigate("/brand/ugc/orders"),
      });
    }

    // 3. UGC Orders: Sample shipped / delivery in progress -> Redirects to UGC Manage Orders
    if (stats.sampleDeliveriesCount > 0) {
      items.push({
        id: "sample_deliveries",
        icon: Package,
        iconBg: "#E9F7F0",
        iconColor: "#059669",
        title: `${stats.sampleDeliveriesCount} product sample shipment${stats.sampleDeliveriesCount > 1 ? "s" : ""}`,
        subtitle: "Track courier delivery & dispatch status",
        subColor: "#6B7280",
        btnText: "Track",
        btnBg: "#E9F7F0",
        btnColor: "#059669",
        onClick: () => navigate("/brand/ugc/orders"),
      });
    }

    // 4. Campaign Chat: Unread creator messages -> Redirects to Campaign Chat
    if (unreadChatMessages > 0) {
      items.push({
        id: "unread_chat",
        icon: MessageCircle,
        iconBg: "#F3EDFF",
        iconColor: "#7C3AED",
        title: `${unreadChatMessages} unread message${unreadChatMessages > 1 ? "s" : ""} in Partner Inbox`,
        subtitle: "Creators waiting for reply & script review",
        subColor: "#6B7280",
        btnText: "Open Chat",
        btnBg: "#7C3AED",
        btnColor: "#fff",
        onClick: () => navigate("/brand/inbox"),
      });
    }

    // 5. Campaign: Counter offers received -> Redirects to Campaign Chat
    if (stats.counteredPitchesCount > 0) {
      items.push({
        id: "countered",
        icon: MessageCircle,
        iconBg: "#FFF1E6",
        iconColor: "#EA580C",
        title: `${stats.counteredPitchesCount} creator counter offer${stats.counteredPitchesCount > 1 ? "s" : ""}`,
        subtitle: "Review countered pricing & terms in Chat",
        subColor: "#B45309",
        btnText: "Respond",
        btnBg: "#F3EDFF",
        btnColor: "#7C3AED",
        onClick: () => navigate("/brand/inbox"),
      });
    }

    // v344: the applicants count is a running TOTAL (not "new"), so it is no longer an action item —
    // it is shown as an informational row below the actions ("N applicants so far").

    // If nothing pending, returns empty array (section will be hidden completely)
    return items;
  }, [
    stats.draftsToReviewCount,
    stats.liveLinksToApproveCount,
    stats.sampleDeliveriesCount,
    stats.counteredPitchesCount,
    unreadChatMessages,
    navigate,
  ]);

  // Handle Template Selection
  const handleUseTemplate = async (tmpl) => {
    // v344: a template overwrote the brand's unfinished campaign draft without asking
    let existingDraft = null;
    try { existingDraft = draftGet("campaign_draft"); } catch { existingDraft = null; }
    if (existingDraft && String(existingDraft).trim() && String(existingDraft).trim() !== "{}" &&
        !(await appConfirm("You have an unfinished campaign draft. Replace it with this template?", { ok: "Replace" }))) {
      return;
    }
    try {
      const templateState = {
        currentStep: 2,
        campaignTitle: tmpl.title,
        requirementsText: tmpl.requirementsText,
        deliverablesText: tmpl.deliverablesText,
        budget: tmpl.budget,
        budgetType: "Per Influencer",
        collabMode: "Paid",
        selectedPlatforms: ["Instagram"],
        selectedCategories: [tmpl.category],
        // Session 33: the create screen opens in range mode (₹8,000–18,000) unless told otherwise,
        // so the template's fee was lost.
        isBudgetRange: false,
      };
      draftSet("campaign_draft", JSON.stringify(templateState));
      toast.success(`Template loaded: ${tmpl.title}`);
      navigate("/brand/campaigns/create");
    } catch (e) {
      console.error(e);
      navigate("/brand/campaigns/create");
    }
  };

  // Handle WhatsApp Support Click with Live Official WhatsApp Number (+91 87640 04299)
  const handleOpenWhatsApp = () => {
    const text = encodeURIComponent(
      `Hi Ybex Team, I am ${brandName} (Brand ID: ${user?.user_id || user?.id || ""}). I need assistance shortlisting verified creators for our brand campaign.`
    );
    window.open(`https://wa.me/918764004299?text=${text}`, "_blank", "noopener,noreferrer"); // v423 (S12)
  };

  // Handle Contact Us / Real Email with Auto-fetched Brand Details
  const handleContactEmail = () => {
    const emailTo = "support@ybexmedia.in";
    const subject = encodeURIComponent(`Campaign Manager Assistance Request — ${brandName}`);
    const bodyContent =
`Hi Ybex Team / Campaign Manager,

I am reaching out regarding creator shortlisting & campaign management for ${brandName}.

Brand Details:
• Brand / Company: ${brandName}
• Representative: ${user?.name || user?.full_name || brandName}
• Registered Email: ${user?.email || "N/A"}
• Phone: ${user?.phone || "Not added"}
• Website / Social: ${brandProfile?.website || brandProfile?.instagram || "N/A"}

Requirements:
• Assistance needed for shortlisting 10+ verified creators
• Campaign Category / Niche: ${brandProfile?.category || brandProfile?.industry || "Not added"}
• Preferred Timeline: Immediate / This week

Looking forward to connecting with our dedicated manager.

Best regards,
${user?.name || user?.full_name || brandName}
${brandName}`;

    // v332: the email no longer fills in Ybex's own WhatsApp number as the brand's phone, or a made-up niche.
    const mailtoUrl = `mailto:${emailTo}?subject=${subject}&body=${encodeURIComponent(bodyContent)}`;

    // Background tracking ticket — v358: once per session (every tap made a new high-priority ticket)
    // v416 (CR22): the "sent" mark is per account and only set after the ticket really saved (a failed POST
    // used to block every retry this session, and a second login on the device inherited the mark).
    const ticketKey = `ybex_cm_ticket_${user?.user_id || user?.id || "anon"}`;
    let ticketSent = false;
    try { ticketSent = sessionStorage.getItem(ticketKey) === "1"; } catch (e) { ticketSent = false; }
    if (!ticketSent) api.post("/support/tickets", {
      subject: `Campaign Manager Assistance Request from ${brandName}`,
      category: "campaign_manager_call",
      priority: "high",
      message: bodyContent,
    }).then(() => { try { sessionStorage.setItem(ticketKey, "1"); } catch (e) { /* private mode */ } }).catch(() => {});

    window.location.href = mailtoUrl;
  };

  // Handle Schedule Call Submit
  // v330: failures now show an error (+ WhatsApp fallback); success toast only after the POST succeeds; double-submit guard.
  const handleScheduleCallSubmit = async (e) => {
    e.preventDefault();
    if (scheduleCallSubmitting) return; // v330
    setScheduleCallSubmitting(true);
    // v330: readable en-IN date in the ticket message (e.g. "Sat, 17 Oct 2026"); date string is YYYY-MM-DD (IST calendar day)
    const readableDate = (() => {
      const d = new Date(`${scheduleCallDate}T12:00:00+05:30`);
      return isNaN(d.getTime()) ? scheduleCallDate
        : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
    })();
    try {
      // Call support ticket endpoint to record the booking in backend
      await api.post("/support/tickets", {
        subject: `Campaign Manager Call Request from ${brandName}`,
        category: "campaign_manager_call",
        priority: "high",
        message: `Brand: ${brandName}\nPreferred Date: ${readableDate}\nPreferred Time: ${scheduleCallTime} (IST)\nNotes: ${
          scheduleCallNote || "Assistance needed for 10+ creator shortlisting."
        }\nContact: ${user?.phone || user?.email || "Not specified"}`,
      });

      toast.success("Call request sent — your campaign manager will reach out on WhatsApp or email."); // v330
      setIsScheduleCallModalOpen(false);
      setScheduleCallNote("");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't send the call request. Opening WhatsApp instead."); // v330
      handleOpenWhatsApp();
    } finally {
      setScheduleCallSubmitting(false);
    }
  };


  const activeBanner = banners[currentBannerIdx] || banners[0] || DEFAULT_BRAND_BANNERS[0];

  return (
    <PullToRefresh
      onRefresh={handlePullRefresh}
      isRefreshing={isRefreshingFeed}
      pullingText="Pull down to refresh"
      releaseText="Release to sync collaborations"
      refreshingText="Fetching latest collaboration updates..."
      successText="Collaboration updates synced"
      lastUpdatedText={lastUpdatedText}
      className="w-full min-h-screen bg-[#D6C3FF]"
    >
      <div className={`w-full min-h-screen ${festive ? "bg-[#FFF6E8]" : "bg-[#F4F4F8]"} flex flex-col font-['DM_Sans',sans-serif] text-[#0A0A0A] pb-28 select-none`}>
        {festive && <style>{DIWALI_TILES_CSS}</style>}
        {/* 1 · Header U-Box with Banner */}
        <div
          data-statusbar="#D6C3FF"
          {...(festive ? { "data-statusbar": DW.top } : {})}
          style={{
            position: "relative",
            flexShrink: 0,
            // Session 43 (Ravi): darker at the top (continues behind the clock), light lower down.
            background:
              // v286 (Ravi: "status bar aur Welcome ke beech line ban rahi hai"): the top 28px are the exact
              // strip colour (#D6C3FF) so the clock strip flows into the header with no edge; the light
              // glow now starts lower and never touches the top.
              "radial-gradient(90% 45% at 0% 62%, #F1E8FF 0%, rgba(241,232,255,0) 70%), linear-gradient(180deg, #D6C3FF 0px, #D6C3FF 28px, #E6DAFF 42%, #F6F1FF 100%)",
            borderRadius: "0 0 32px 32px",
            borderBottom: "1px solid #E7DCFF",
            paddingBottom: "36px",
            paddingTop: "14px",
            ...(festive ? { background: DW.headerBg, borderRadius: 0, borderBottom: "none", paddingBottom: 0, paddingTop: "30px", overflow: "hidden" } : {}), // v372
          }}
        >
          {/* Elastic overscroll background extension so pulling down never reveals any cut or blank gap */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "-500px",
              height: "500px",
              background: festive ? DW.top : "#D6C3FF",
              pointerEvents: "none",
            }}
          />
          {festive && <DiwaliHeaderDecor />}
          {/* User Greeting & Header Actions Row */}
          <div
            style={{
              padding: "0 16px",
              display: "flex",
              alignItems: "center",
              gap: "11px",
            }}
          >
            {/* Brand Avatar -> opens profile */}
            <button
              type="button"
              onClick={() => navigate("/brand/profile")}
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "13px",
                background: "#0A0A0A",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                font: "800 14px 'DM Sans', sans-serif",
                color: "#fff",
                overflow: "hidden",
                border: "none",
                cursor: "pointer",
              }}
              aria-label="Brand Profile"
            >
              {(brandProfile?.logo || user?.photo || user?.picture) && !logoFailed ? (
                <img
                  src={brandProfile?.logo || user?.photo || user?.picture}
                  alt={brandName}
                  className="w-full h-full object-cover"
                  onError={() => setLogoFailed(true)} // v330
                />
              ) : (
                <span>{brandInitials}</span>
              )}
            </button>

            {/* Greeting text and Brand status */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={festive ? { font: "700 11.5px 'DM Sans', sans-serif", letterSpacing: "1.2px", color: DW.yellow } : {
                  font: "500 11.5px 'DM Sans', sans-serif",
                  color: "#6B7280",
                }}
              >
                {greeting}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "3px", minWidth: 0 }}>{/* v416: status chip under the name — the full brand name gets the whole row */}
                <span
                  style={{
                    font: festive ? "800 19px 'DM Sans', sans-serif" : "700 17px 'DM Sans', sans-serif",
                    letterSpacing: "-0.4px",
                    color: festive ? "#fff" : "#0A0A0A",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    minWidth: 0,
                    maxWidth: "100%", // v416
                  }}
                >
                  {brandName}
                </span>
                <span
                  style={{
                    display: "flex",
                    height: "18px",
                    padding: "0 6px",
                    borderRadius: "6px",
                    background: approvalBadge.bg,
                    border: approvalBadge.border || "none",
                    flexShrink: 0,
                    alignItems: "center",
                    font: "800 8.5px 'DM Sans', sans-serif",
                    letterSpacing: "0.5px",
                    color: approvalBadge.color,
                    whiteSpace: "nowrap",
                  }}
                >
                  {approvalBadge.label}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            {/* Session 41 (Ravi): header keeps only the bell — Inbox is already a bottom tab. */}
            <WalletChip />
            {/* Notification Bell -> opens notifications */}
            <button
              type="button"
              onClick={() => navigate("/brand/notifications")}
              style={{
                width: "40px", // v332: 40px tap target
                height: "40px",
                borderRadius: "13px",
                background: festive ? "rgba(255,255,255,0.18)" : "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                flexShrink: 0,
                border: "none",
                cursor: "pointer",
                boxShadow: festive ? "inset 0 0 0 1px rgba(255,255,255,0.35)" : "0 2px 6px rgba(0,0,0,0.04)",
              }}
              aria-label={unreadNotifications > 0 ? `Notifications, ${unreadNotifications} unread` : "Notifications"} // v332
            >
              <Bell size={17} strokeWidth={1.9} color={festive ? "#fff" : "#1F2937"} />
              {unreadNotifications > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "-4px",
                    right: "-4px",
                    height: "17px",
                    padding: "0 5px",
                    borderRadius: "9px",
                    background: "#7C3AED",
                    display: "flex",
                    alignItems: "center",
                    font: "700 9.5px 'DM Sans', sans-serif",
                    color: "#fff",
                    border: "1.5px solid #fff",
                  }}
                >
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </div>
              )}
            </button>
            </div>
          </div>

          {festive && <DhamakaTitle line={BRAND_LINE} />}{/* v372; the banner below stays Admin → Banners */}
          {/* Brand Hero Banner with CMS Support (Graphic banner matching 3:1 ratio 1200x400) */}
          {banners.length > 0 && activeBanner && (
            <div
              style={{
                margin: "12px 14px 0",
                borderRadius: "20px",
                overflow: "hidden",
                background: "transparent",
                border: "1px solid #E7DCFF",
                boxShadow: "0 14px 28px -20px rgba(76,29,149,0.45)",
                ...(festive ? { border: `2px solid ${DW.yellow}`, boxShadow: "0 10px 24px rgba(80,0,20,.35)" } : {}), // v372
                position: "relative",
                cursor: "pointer",
              }}
              data-splash-target="hero"
              className="aspect-[3/1] flex items-center justify-center"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onClick={() => {
                if (activeBanner?.link) navigate(activeBanner.link);
              }}
            >
              {/* v358: no admin banner yet → the built-in ones are a text card (they were unrelated stock photos with no
                  words on them, and an empty box when the photo didn't load) */}
              {activeBanner.isDefault ? (
                <div className="absolute inset-0 z-10 flex flex-col justify-center text-left" style={{ padding: "26px 16px 12px", background: "linear-gradient(120deg,#5B21B6 0%,#7C3AED 55%,#A78BFA 100%)" }}>
                  <div style={{ font: "800 16px/1.15 'DM Sans', sans-serif", color: "#fff", letterSpacing: "-0.3px" }} className="line-clamp-1">{activeBanner.title}</div>
                  <div style={{ font: "500 11.5px/1.35 'DM Sans', sans-serif", color: "#EDE4FF", marginTop: 3 }} className="line-clamp-2 pr-10">{activeBanner.subtitle}</div>
                  {activeBanner.cta && <div style={{ font: "700 11.5px 'DM Sans', sans-serif", color: "#fff", marginTop: 6 }}>{activeBanner.cta} →</div>}
                </div>
              ) : (<>
              {/* Ambient blurred backdrop so any aspect ratio blends seamlessly without letterbox bars */}
              <img
                src={activeBanner.image || activeBanner.banner_image || activeBanner.imgUrl || DEFAULT_BRAND_BANNERS[0].image}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover blur-lg scale-110 opacity-75"
                onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} // v330
              />
              {/* Foreground Banner - object-cover ensures 100% edge-to-edge fill without black lines or letterbox */}
              <img
                src={activeBanner.image || activeBanner.banner_image || activeBanner.imgUrl || DEFAULT_BRAND_BANNERS[0].image}
                alt={activeBanner.title || "Banner"}
                className="relative z-10 w-full h-full object-cover"
                // v330: a dead CMS image URL showed a broken-image box — fall back to the default banner.
                onError={(e) => { const fb = DEFAULT_BRAND_BANNERS[0].image; if (e.currentTarget.src !== fb) e.currentTarget.src = fb; }}
              />
              </>)}

              {/* Optional badge */}
              {activeBanner.badge && (
                <div
                  style={{
                    position: "absolute",
                    top: "8px",
                    left: "8px",
                    zIndex: 20,
                    height: "18px",
                    padding: "0 6px",
                    borderRadius: "6px",
                    background: "rgba(0,0,0,0.55)",
                    backdropFilter: "blur(6px)",
                    display: "flex",
                    alignItems: "center",
                    font: "700 8.5px 'DM Sans', sans-serif",
                    color: "#fff",
                    letterSpacing: "0.5px",
                  }}
                >
                  {activeBanner.badge}
                </div>
              )}

              {/* Pagination Dots */}
              {banners.length > 1 && (
                <div
                  style={{
                    position: "absolute",
                    right: "10px",
                    bottom: "10px",
                    display: "flex",
                    gap: "4px",
                    pointerEvents: "none",
                    zIndex: 20,
                  }}
                >
                  {banners.map((_, idx) => (
                    <div
                      key={idx}
                      style={{
                        width: idx === currentBannerIdx ? "12px" : "4px",
                        height: "4px",
                        borderRadius: "2px",
                        background: idx === currentBannerIdx ? "#fff" : "rgba(255,255,255,0.45)",
                        transition: "all 0.3s ease",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cute, Compact, Centered Rotating Trust Line */}
          <div
            style={{
              margin: "9px 14px 0",
              height: "20px",
              display: festive ? "none" : "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={trustIdx}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "5px",
                  whiteSpace: "nowrap",
                  maxWidth: "100%",
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="#16A34A" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" />
                  <path d="M10.6 16.4l-3.8-3.8 1.3-1.3 2.5 2.5 5.3-5.3 1.3 1.3z" fill="#fff" />
                </svg>
                <span style={{ font: "700 11px 'DM Sans', sans-serif", color: "#15803D" }}>
                  {BRAND_TRUST_ITEMS[trustIdx]?.title || "100% KYC-verified creators"}
                </span>
                {/* v286 (Ravi): only the green line, centred — the grey second half was cut off. */}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* 2 · Floating Quick Bar (4 shortcuts - matched Creator spacing) — v372: festive cream tiles */}
        <div
          className={festive ? "ybx-dw-qb" : undefined}
          style={{
            flexShrink: 0,
            margin: "-22px 14px 0",
            background: "#fff",
            borderRadius: "22px",
            border: "1px solid #ECE7F7",
            boxShadow: "0 18px 34px -26px rgba(76,29,149,0.55)",
            padding: "13px 4px 12px",
            display: "grid",
            gridAutoFlow: "column", gridAutoColumns: "minmax(0, 1fr)", // v437: 4 tiles, or 5 with "How it works"
            position: "relative",
            zIndex: 10,
          }}
        >
          {/* Create UGC */}
          <button
            type="button"
            onClick={() => navigate("/brand/ugc/post")}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "7px",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "16px",
                background: "#FFF1E6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <Zap size={21} strokeWidth={1.9} color="#EA580C" />
            </div>
            <span
              style={{
                font: "600 11px 'DM Sans', sans-serif",
                color: "#1F2937",
                whiteSpace: "nowrap",
              }}
            >
              Create UGC
            </span>
          </button>

          {/* Session 43 (Ravi): Refer & Earn · New campaign · Payouts · Create UGC */}
          {/* Campaign */}
          <button
            type="button"
            onClick={() => navigate("/brand/campaigns/create")}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "7px",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "16px",
                background: "#F3EDFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <Send size={20} strokeWidth={1.9} color="#7C3AED" />
            </div>
            <span
              style={{
                font: "600 11px 'DM Sans', sans-serif",
                color: "#1F2937",
                whiteSpace: "nowrap",
              }}
            >
              New campaign
            </span>
          </button>

          {/* Payouts */}
          <button
            type="button"
            onClick={() => navigate("/brand/payments")}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "7px",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "16px",
                background: "#E9F7F0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <CreditCard size={21} strokeWidth={1.9} color="#059669" />
            </div>
            <span
              style={{
                font: "600 11px 'DM Sans', sans-serif",
                color: "#1F2937",
                whiteSpace: "nowrap",
              }}
            >
              Payments{/* v358: brands pay, they don't get payouts */}
            </span>
          </button>

          {/* v439: "How it works" replaces Refer & Earn (it's in Brand profile › Refer & earn); no brand video set → Refer & Earn stays */}
          <HiwTile role="brand" fallback={(
          <button
            type="button"
            onClick={() => navigate("/brand/account?section=refer")}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "7px",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "16px",
                background: "#FFF0F5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <Gift size={21} strokeWidth={1.9} color="#DB2777" />
              <div
                style={{
                  position: "absolute",
                  top: "-6px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  height: "16px",
                  padding: "0 6px",
                  borderRadius: "8px",
                  background: "#0A0A0A",
                  display: "flex",
                  alignItems: "center",
                  font: "800 8.5px 'DM Sans', sans-serif",
                  letterSpacing: "0.5px",
                  color: "#fff",
                }}
              >
                NEW
              </div>
            </div>
            <span
              style={{
                font: "600 11px 'DM Sans', sans-serif",
                color: "#1F2937",
                whiteSpace: "nowrap",
              }}
            >
              Refer & Earn
            </span>
          </button>
          )} />
        </div>
        {festive && <DiyaArch />}
        <AppTour role="brand" />{/* v437: first-time tour (new accounts, once) */}

        {/* v415: first load — one calm placeholder (full screen tall) instead of sections popping in one by one and
            pushing each other down. Everything below the quick bar appears together once the data is in. */}
        {loading ? (
          <div data-testid="brand-home-loading" aria-busy="true" aria-label="Loading your home" style={{ minHeight: "calc(var(--yb-vh, 100vh) - 120px)", padding: "16px 14px 0" }}>
            <div className="animate-pulse" style={{ height: 14, width: 140, borderRadius: 6, background: "#E7E5EE", margin: "0 2px 10px" }} />
            <div className="animate-pulse" style={{ height: 96, borderRadius: 18, background: "#ECEAF2" }} />
            <div className="animate-pulse" style={{ height: 16, width: 160, borderRadius: 6, background: "#E7E5EE", margin: "22px 2px 10px" }} />
            <div style={{ display: "flex", gap: 8, overflow: "hidden" }}>
              {[0, 1].map((k) => <div key={k} className="animate-pulse" style={{ flex: "0 0 70%", height: 150, borderRadius: 18, background: "#ECEAF2" }} />)}
            </div>
          </div>
        ) : (<>
        {feedFailed && ( /* v416 (M5): a failed load says so, with a retry — not an empty / "all caught up" home */
          <div role="alert" className="mx-[14px] mt-3 flex items-center gap-3 rounded-[14px] border border-amber-200 bg-amber-50 px-3.5 py-3">
            <span className="flex-1 text-[13px] font-medium text-amber-900">Couldn't load everything. Some numbers may be out of date.</span>
            <button type="button" onClick={() => fetchBrandFeedData(true)} disabled={isRefreshingFeed}
              className="shrink-0 min-h-[40px] px-3 rounded-xl bg-white border border-amber-300 text-[12.5px] font-bold text-amber-900 disabled:opacity-60">
              {isRefreshingFeed ? "Retrying…" : "Try again"}
            </button>
          </div>
        )}
        {/* 3 · Conditional Action Section: NEW BRAND ONBOARDING vs ACTIVE BRAND ACTIONS */}
        <BrandHomeActions importantDir={importantDir} importantPauseUntil={importantPauseUntil} isNewBrand={isNewBrand} navigate={navigate} needsActionItems={needsActionItems} onboardingStepIdx={onboardingStepIdx} onboardingTasks={onboardingTasks} swipeImportant={swipeImportant} />

        {/* v344: informational only — total applicants across your campaigns (not "new", not an action) */}
        {!isNewBrand && stats.applicantsCount > 0 && (
          <button
            type="button"
            onClick={() => navigate("/brand/campaigns")}
            className="mx-[14px] mt-3 w-[calc(100%-28px)] flex items-center gap-2.5 rounded-[14px] bg-white border border-[#E5E5EA] px-3.5 py-3 text-left"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            <User size={16} color="#6B7280" />
            <span className="flex-1 text-[13px] font-medium text-[#3F3F46]">
              {stats.applicantsCount} applicant{stats.applicantsCount === 1 ? "" : "s"} so far across your campaigns
            </span>
            <span className="text-[12px] font-semibold text-[#7C3AED]">View</span>
          </button>
        )}

        {/* 5 · Active Briefs Carousel (If brand has active briefs) */}
        <ActiveBriefsCarousel activeBriefs={activeBriefs} isNewBrand={isNewBrand} navigate={navigate} />

        {/* 6 · Launch in 2 minutes (Campaign Templates) */}
        <CampaignTemplatesRow CAMPAIGN_TEMPLATES={CAMPAIGN_TEMPLATES} handleUseTemplate={handleUseTemplate} navigate={navigate} />

        {/* Live Social Proof Feed Ticker removed as requested */}

        {/* Session 30: shown only when real creators load — no sample people. */}
        {featuredCreators.length > 0 && (<>
        {/* 8 · Meet the Creators (3-column Masonry Layout with Glowing Blur) */}
        <div
          style={{
            flexShrink: 0,
            padding: "16px 14px 0",
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "10px",
          }}
        >
          <span
            style={{
              font: "700 16px 'DM Sans', sans-serif",
              letterSpacing: "-0.4px",
              color: "#0A0A0A",
              whiteSpace: "nowrap",
            }}
          >
            Meet the Creators
          </span>
          <button
            type="button"
            onClick={() => navigate("/brand/discover")}
            style={{
              minHeight: "40px", // v332: tap target
              padding: "0 4px",
              font: "600 12px 'DM Sans', sans-serif",
              color: "#7C3AED",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            Explore
          </button>
        </div>

        {/* Session 48: shared grid — cards fill row by row, the CTA sits under them (no overlap). */}
        <MeetCreatorsGrid
          creators={featuredCreators}
          onOpen={(cr) => navigate(`/creator/${cr.id}`)}
          ctaTitle="Find more creators"
          ctaSub="Browse by niche, city and reach"
          ctaLabel="Explore more"
          onCta={() => navigate("/brand/discover")}
        />

        </>)}
        {/* 9 · Dedicated Campaign Manager Support Card */}
        <CampaignManagerCard handleContactEmail={handleContactEmail} handleOpenWhatsApp={handleOpenWhatsApp} onScheduleCall={() => setIsScheduleCallModalOpen(true)} />{/* v330: opens the Schedule Call sheet */}

        {/* 10 · Brands growing with YBEX (Connected directly to trustedBrands constant) */}
        <BrandsGrowingStrip />
        </>)}{/* v415: end of the loaded part */}

        {/* Schedule Call Interactive Modal */}
        <ScheduleCallModal handleScheduleCallSubmit={handleScheduleCallSubmit} isScheduleCallModalOpen={isScheduleCallModalOpen} scheduleCallDate={scheduleCallDate} scheduleCallNote={scheduleCallNote} scheduleCallSubmitting={scheduleCallSubmitting} scheduleCallTime={scheduleCallTime} setIsScheduleCallModalOpen={setIsScheduleCallModalOpen} setScheduleCallDate={setScheduleCallDate} setScheduleCallNote={setScheduleCallNote} setScheduleCallTime={setScheduleCallTime} />
      </div>
      {/* v287: "Ybex Assist" feedback bot (Claude Design, Turn 27). */}
      <FeedbackBot role="brand" screen="brand dashboard" />
    </PullToRefresh>
  );
}
