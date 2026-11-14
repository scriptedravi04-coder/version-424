import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { markHomeReady } from "../../lib/popupRules";
import MeetCreatorsGrid from "../../components/dashboard/MeetCreatorsGrid";
import WalletChip from "../../components/referral/WalletChip";
import FeedbackBot from "../../components/feedback/FeedbackBot";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { snapshotGet, hasSnapshots } from "../../lib/apiSnapshot";

// Session 42: inside the feed loader `api` is either the real client or the saved-answers one.
const liveApi = api;
const SNAPSHOT_API = { get: snapshotGet };

import { useAuth } from "../../contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import PullToRefresh from "../../components/common/PullToRefresh";
import MobileCreatorInvites from "../../components/campaigns/MobileCreatorInvites";
import { shareCreatorProfile } from "../../lib/shareProfile";
import { Bell } from "lucide-react";
import { CreatorHomeSkeleton } from "../../components/common/MobileSkeletons";
import { computeCreatorMatch } from "../../lib/creatorMatch";
import { normalizeKycStatus } from "../../utils/kycStatus";
import { creatorProfileStrength } from "../../lib/creatorTasks";
import MobileSheet from "../../components/chat/mobile/MobileSheet";
import UgcLiveTimerCard from "./creatorHome/UgcLiveTimerCard";
import HomeCampaignCard from "../../components/campaigns/mobile/HomeCampaignCard";
import { OfflineAware } from "../../components/common/OfflineState"; // v334
import { useBackOnline } from "../../lib/offline";
import { initials as initialsOf } from "../../utils/initials";
import { countUnreadThreads } from "../../lib/threadSeen"; // v348
import { ChallengeHomeCard } from "../../components/challenge/ChallengeUi"; // v367: Diwali Creator Challenge
import { festiveOn } from "../../lib/diwaliChallenge"; // v367
import { HiwTile, AppTour } from "../../components/whatsNew/WhatsNewPopup"; // v437
import { DW, DW_BANNER_FRAME, DIWALI_TILES_CSS, DiwaliHeaderDecor, DhamakaTitle, DiwaliPoweredBy, DiyaArch } from "../../components/challenge/DiwaliHome"; // v372: design 2b

// Session 42: home paints from saved answers when these exist (src/lib/apiSnapshot.js).
const HOME_SNAPSHOT_URLS = ["collabs", "ugc/orders/creator", "campaigns"];

// v346: the sample promo banners (boAt / Nike / Mamaearth) are gone — real brand names on made-up offers.
// With no admin banner the banner section is simply not shown.

// Rotating Trust & Value propositions (Zero Commission Line Rotation - Short, Cute, Perfectly Centered)
const TRUST_ITEMS = [
  { title: "Free to join", text: "no listing fees" },
  { title: "Guaranteed secure payment hold", text: "100% safe & secured" }, // v332: stray capital
  { title: "Fast Milestone Approval", text: "direct bank payouts" },
  { title: "Direct Legal Contracts", text: "verified brands" },
  { title: "Instant UGC Payouts", text: "deliver & earn fast" },
];

// Fallback Featured Winning Creators matching design specs & Explore Creators aesthetics
const FEATURED_CREATORS = [
  {
    id: "c-bb",
    name: "Babu bhaiya",
    initials: "BB",
    photo: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=300&auto=format&fit=crop",
    gradient: "linear-gradient(135deg, #22C55E, #0EA5E9)",
    followers: "890K",
    niche: "Beauty",
    avgReach: "2.3M",
    verified: true,
  },
  {
    id: "c-db",
    name: "Devika Sharma",
    initials: "DS",
    photo: "https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=300&auto=format&fit=crop",
    gradient: "linear-gradient(135deg, #6366F1, #A78BFA)",
    followers: "195K",
    niche: "Health",
    avgReach: "412K",
    verified: true,
  },
  {
    id: "c-rv",
    name: "Rishi & Vini",
    initials: "RV",
    photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=300&auto=format&fit=crop",
    gradient: "linear-gradient(135deg, #F59E0B, #F43F5E)",
    followers: "7.7M",
    niche: "Fashion",
    avgReach: "389K",
    verified: true,
  },
  {
    id: "c-ankit",
    name: "Ankit Roy",
    initials: "AR",
    photo: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=300&auto=format&fit=crop",
    gradient: "linear-gradient(135deg, #7C3AED, #C084FC)",
    followers: "250K",
    niche: "Travel",
    avgReach: "5.6M",
    verified: true,
  },
];

// Session 31 (Ravi): the 3 typed-in "best match" campaigns (three made-up brand cards, ids
// m1–m3) are gone. With no matching live campaign the card shows an empty state instead.

export default function CreatorHomeMobile({ user: propUser }) {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const user = propUser || authUser;

  // Real backend states
  const [banners, setBanners] = useState([]);
  const [currentBannerIdx, setCurrentBannerIdx] = useState(0);
  const [ugcOrders, setUgcOrders] = useState([]);
  const [realDeals, setRealDeals] = useState([]);
  const [recommendedCampaigns, setRecommendedCampaigns] = useState([]);
  const [campaignsFailed, setCampaignsFailed] = useState(false); // v332: failed load said "No campaigns in your category"
  const [campaignsMatchNiche, setCampaignsMatchNiche] = useState(null);
  const [featuredCreators, setFeaturedCreators] = useState([]);
  const [kycStatus, setKycStatus] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [avatarBroken, setAvatarBroken] = useState(false); // v330
  const isMountedRef = useRef(true);

  // Carousel touch handlers
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  // Marquee pause on touch

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);


  // Keep live time ticking every 15s for countdowns
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Fetch all operational collaboration updates
  // Session 42: `mode` "snapshot" paints the last saved answers at once (no network, no skeleton);
  // "background" refreshes them quietly right after. Pull-to-refresh still passes `true`.
  const fetchHomeFeedData = useCallback(async (isSilent = false, mode = "network") => {
    if (!user) return;
    const fromSnapshot = mode === "snapshot";
    const api = fromSnapshot ? SNAPSHOT_API : liveApi;
    if (mode === "network") {
      if (!isSilent) {
        setLoading(true);
      } else {
        setIsRefreshingFeed(true);
      }
    }

    try {
      // Parallel fetch for ultra-fast response
      const [
        bannersRes,
        ordersRes,
        collabsRes,
        campsRes,
        kycRes,
        notifsRes,
        chatRes,
        meRes,
      ] = await Promise.all([
        api.get("banners?audience=creator").catch(() => ({ data: [] })),
        api.get("ugc/orders/creator").catch(() => ({ data: [] })),
        api.get("collabs").catch(() => ({ data: { sent: [], received: [], campaign_applications: [] } })),
        api.get("campaigns").catch(() => ({ data: [], failed: true })),
        api.get("verifications/me").catch(() => ({ data: null })),
        api.get("notifications").catch(() => ({ data: [] })),
        api.get("chat/v2/threads").catch(() => ({ data: [] })),
        // Session 31: the creator's own profile (category, platforms, rates) for real match %.
        api.get("creators/me").catch(() => ({ data: null })),
      ]);

      if (!isMountedRef.current) return;

      // 1. Live banners
      const bannersData = bannersRes?.data;
      if (Array.isArray(bannersData) && bannersData.length > 0) {
        const liveBanners = bannersData.filter(
          (b) =>
            (b.status === "Live" || b.active === true || !b.status) &&
            (b.type === "Common" || b.type === "Influencer" || b.type === "both" || b.type === "all" || !b.type)
        );
        setBanners(liveBanners.length > 0 ? liveBanners : []);
      } else {
        setBanners([]);
      }

      // 2. Creator UGC Orders (in-progress, deliverables, deadlines)
      const ordersData = ordersRes?.data;
      if (Array.isArray(ordersData)) {
        setUgcOrders(ordersData);
      }

      // 3. Deals / Collabs (sent, received, brand collaborations)
      const collabsData = collabsRes?.data;
      if (collabsData) {
        const sent = collabsData.sent || [];
        const received = collabsData.received || [];
        const allDeals = [...sent, ...received];
        setRealDeals(allDeals);
      }

      // 4. Campaigns for "Best matches" (Category based matching + Fallback to recent)
      const campsData = campsRes?.data;
      // v332: remember a failed campaigns load (a later good load clears it)
      if (campsRes?.failed) setCampaignsFailed((prev) => prev || !fromSnapshot);
      else setCampaignsFailed(false);
      // v344: the profile checklist needs this even when there are no campaigns (it was only set inside the block below)
      if (meRes?.data) setMyProfile(meRes.data.profile || meRes.data);
      // v344: an empty campaigns list clears the old "Best matches" (they stayed on screen before)
      if (Array.isArray(campsData) && campsData.length === 0) setRecommendedCampaigns([]);
      if (Array.isArray(campsData) && campsData.length > 0) {
        // v344: a campaign whose "apply by" date (+1 day) has passed is not live any more (same as Campaigns.jsx)
        const notExpired = (c) => !c.deadline || Number.isNaN(Date.parse(c.deadline)) || Date.parse(c.deadline) + 24 * 3600e3 > Date.now();
        const activeCamps = campsData.filter(
          (c) => (c.status === "live" || c.stage === "Live" || c.stage === "Under Review" || c.status === "published") && notExpired(c)
        );

        // Session 31 (Ravi): "Best matches" use the real match score (src/lib/creatorMatch.js —
        // the same rules as the brand's match on a creator profile): category 40, platform 20,
        // budget 25 (this creator's lowest rate vs the campaign budget); a part without data is
        // left out. Campaigns are sorted by score; one with no data shows no %.
        const me = { ...(user || {}), ...(meRes?.data?.profile || meRes?.data || {}) };
        const scored = activeCamps
          .map((c, order) => ({ c, order, m: computeCreatorMatch({ creator: me, campaigns: [c] }) }))
          .sort((a, b) => (b.m?.score ?? -1) - (a.m?.score ?? -1) || a.order - b.order)
          .slice(0, 4)
          // Session 43 (Ravi: "every card says 100% match"): with only one part known (usually just the
          // category) the score was always 100. A % is shown only when 2+ parts could be compared.
          .map(({ c, m }) => {
            const solid = m && Array.isArray(m.parts) && m.parts.length >= 2;
            return { ...c, matchScore: solid ? m.score : null, matchReason: solid ? m.reason : "" };
          });
        const anyScore = scored.some((c) => c.matchScore != null);
        const myCat = String(me.category || "").trim();
        setCampaignsMatchNiche(anyScore && myCat ? myCat.charAt(0).toUpperCase() + myCat.slice(1) : null);
        setRecommendedCampaigns(scored);
      }

      // 5. KYC Status
      if (kycRes?.data) {
        setKycStatus(kycRes.data.status);
      }

      // 6. Notifications unread count
      const notifs = notifsRes?.data;
      if (Array.isArray(notifs)) {
        const unread = notifs.filter((n) => !n.read).length;
        setUnreadNotifications(unread);
      }

      // 7. Chat unread count
      const threads = chatRes?.data;
      if (Array.isArray(threads)) {
        // v348: same count the Inbox shows (src/lib/threadSeen.js). The old fields never existed and the
        // "last message not mine" rule stayed true for ever on completed deals.
        const unread = countUnreadThreads(threads);
        setUnreadChatCount(unread);
      }

      // 8. "Creators like you, winning on YBEX" — Session 39 (Ravi, M35): only the 3–4 creators the
      // admin ticked ("Show on creator home"). No tick → the section hides. No invented numbers.
      try {
        const { data: picksRes } = await api.get("creators/home-picks").catch(() => ({ data: { picks: [] } }));
        const picks = Array.isArray(picksRes?.picks) ? picksRes.picks : [];
        const short = (n) => (n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`);
        const gradients = [
          "linear-gradient(135deg, #22C55E, #0EA5E9)",
          "linear-gradient(135deg, #6366F1, #A78BFA)",
          "linear-gradient(135deg, #F59E0B, #F43F5E)",
          "linear-gradient(135deg, #7C3AED, #C084FC)",
        ];
        const formatted = picks
          .filter((c) => c.id && c.id !== user?.user_id)
          .map((c, i) => {
            const name = c.name || "Creator";
            const initials = initialsOf(name, { fallback: "C" }); // v346: emoji-safe
            return {
              id: c.id,
              name,
              initials: initials || "CR",
              photo: c.picture || null,
              gradient: gradients[i % gradients.length],
              followers: c.followers ? short(Number(c.followers)) : "",
              niche: c.category || "Creator",
              avgReach: c.avg_reach ? short(Number(c.avg_reach)) : "",
              verified: false,
            };
          });
        if (isMountedRef.current) setFeaturedCreators(formatted);
      } catch (e) {
        if (isMountedRef.current) setFeaturedCreators([]);
      }

      setNow(Date.now());
      setLastRefreshedAt(new Date());

    } catch (err) {
      console.warn("Silent failure loading mobile home data", err);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        markHomeReady(); // v426: popups wait for this, so they don't open while Home is still busy loading
        setIsRefreshingFeed(false);
      }
    }
  }, [user]);

  // Initial load — Session 42: saved answers first (instant), then the server.
  useEffect(() => {
    if (user && hasSnapshots(HOME_SNAPSHOT_URLS)) {
      fetchHomeFeedData(false, "snapshot").then(() => fetchHomeFeedData(false, "background"));
    } else {
      fetchHomeFeedData(false);
    }
  }, [fetchHomeFeedData]);

  // Explicit pull to refresh trigger handler
  // Session 26: bumps so the invitations card reloads on pull-to-refresh.
  const [invitesRefreshKey, setInvitesRefreshKey] = useState(0);
  const handlePullRefresh = useCallback(async () => {
    setInvitesRefreshKey((k) => k + 1);
    await fetchHomeFeedData(true);
  }, [fetchHomeFeedData]);
  // v334: back online → the saved (offline) home is refreshed once, quietly — same calls as pull-to-refresh.
  useBackOnline(handlePullRefresh);

  // Banner Auto-slider (every 4 seconds)
  useEffect(() => {
    if (!banners || banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentBannerIdx((prev) => (prev + 1) % banners.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [banners.length]);

  // Handle banner swipe
  const handleTouchStart = (e) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };
  const handleTouchEnd = (e) => {
    touchEndX.current = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX.current;
    if (diff > 50) {
      // swipe left -> next
      setCurrentBannerIdx((prev) => (prev + 1) % banners.length);
    } else if (diff < -50) {
      // swipe right -> prev
      setCurrentBannerIdx((prev) => (prev - 1 + banners.length) % banners.length);
    }
  };

  // Profile completion status
  // v344: read the KYC status the shared way (normalizeKycStatus) — "SUBMITTED", "IN_REVIEW", "verified" etc.
  // were missed by the old pending/PENDING/UNDER_REVIEW check, so the checklist said KYC was not started.
  const kycNorm = kycStatus ? normalizeKycStatus({ status: kycStatus }) : null;
  const isKycApproved = user?.kyc_verified || kycNorm === "APPROVED";
  const isKycPending = kycNorm === "PENDING";
  const isProfileComplete = Boolean(user?.profile_completed);

  // Session 43 (v283, Ravi: "Finish just opens the profile — tell me what is pending"): one checklist
  // from the real profile (same five parts as desktop's profile strength) + KYC. The ring's % and
  // the "Finish" sheet both come from it; every pending row opens the exact place to fix it.
  const profileChecklist = useMemo(() => {
    const base = { ...(user || {}), ...(myProfile || {}) };
    const strength = creatorProfileStrength(base, Array.isArray(base.portfolio) ? base.portfolio.length : null);
    const missing = new Set(strength.missing);
    const go = {
      Photo: "/creator/settings?section=profile",
      "Niche & bio": "/creator/settings?section=profile",
      "Instagram / YouTube": "/creator/settings?section=platforms",
      "Rate card": "/creator/settings?section=rates",
      "Past work": "/creator/settings?section=portfolio",
    };
    const rows = ["Photo", "Niche & bio", "Instagram / YouTube", "Rate card", "Past work"].map((label) => ({ label, done: !missing.has(label), to: go[label] }));
    rows.push({
      label: "KYC (PAN + bank / UPI)",
      done: Boolean(isKycApproved),
      note: isKycPending ? "Under review" : (!isKycApproved ? "Brands can't pay you yet" : ""),
      to: isKycPending ? "/kyc/status" : "/creator/kyc",
      waiting: Boolean(isKycPending),
    });
    return rows;
  }, [user, myProfile, isKycApproved, isKycPending]);
  const profileCompletionPercentage = Math.round((profileChecklist.filter((r) => r.done).length / profileChecklist.length) * 100);
  const showCompleteProfile = profileCompletionPercentage < 100 || (!isProfileComplete && !myProfile);

  // Active UGC Orders: filter orders that are claimed and actively in progress / revision requested
  const activeUgcOrders = useMemo(() => {
    return ugcOrders.filter((order) => {
      const stage = (order.stage || order.status || "").toUpperCase();
      const creatorStatus = (order.creator_status || "").toUpperCase();
      // Only show if claimed / in progress / revision requested
      const isClaimedOrInProgress =
        stage === "IN_PROGRESS" ||
        stage === "CLAIMED" ||
        stage === "REVISION_REQUESTED" ||
        creatorStatus === "IN_PROGRESS" ||
        creatorStatus === "CLAIMED" ||
        creatorStatus === "REVISION_REQUESTED";

      const isFinished =
        stage === "COMPLETED" ||
        stage === "DELIVERED" ||
        stage === "IN_REVIEW" ||
        stage === "SUBMITTED" ||
        creatorStatus === "SUBMITTED" ||
        creatorStatus === "COMPLETED";

      return isClaimedOrInProgress && !isFinished;
    });
  }, [ugcOrders]);

  // Earliest deadline UGC order for the Live Timer
  const nearestUgcOrder = useMemo(() => {
    if (activeUgcOrders.length === 0) return null;
    return [...activeUgcOrders].sort((a, b) => {
      const timeA = new Date(a.sla_expires_at || a.deadline || a.internal_deadline || Date.now() + 86400000).getTime();
      const timeB = new Date(b.sla_expires_at || b.deadline || b.internal_deadline || Date.now() + 86400000).getTime();
      return timeA - timeB;
    })[0];
  }, [activeUgcOrders]);

  // Calculate UGC Countdown and Urgency Styling
  const ugcCountdown = useMemo(() => {
    if (!nearestUgcOrder) return null;
    // v330: the ternary swallowed the whole `||` chain, so a real sla_expires_at was ignored (and with
    // no created_at the card read "NaNh NaNm"). Real deadline first, created_at + 24h only as fallback.
    const rawDeadline =
      nearestUgcOrder.sla_expires_at ||
      nearestUgcOrder.deadline ||
      nearestUgcOrder.internal_deadline ||
      (nearestUgcOrder.created_at
        ? new Date(nearestUgcOrder.created_at).getTime() + 86400000
        : null);
    const parsedDeadline = rawDeadline != null ? new Date(rawDeadline).getTime() : NaN;
    // v332: no deadline known → no made-up "14h 22m" countdown; the card just says the order is in progress.
    if (!Number.isFinite(parsedDeadline)) {
      return { formatted: "In progress", formattedDeadline: "the deadline in your order", color: "#16A34A", fillPercent: 100, hoursLeft: null };
    }
    const deadlineMs = parsedDeadline;

    const diff = deadlineMs - now;
    if (diff <= 0) {
      return {
        formatted: "0h 00m",
        formattedDeadline: "Overdue",
        color: "#DC2626", // Red
        fillPercent: 100,
        hoursLeft: 0,
      };
    }

    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const totalHours = diff / 3600000;

    // Color: >6h green (#16A34A), 2–6h amber (#D97706), <2h red (#DC2626)
    let color = "#16A34A";
    if (totalHours < 2) color = "#DC2626";
    else if (totalHours < 6) color = "#D97706";

    // Format deadline date / time e.g. "4:00 PM tomorrow"
    // v330: shown in IST; a deadline 2+ days away said "tomorrow" — now it shows the date.
    const istDay = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const timeStr = new Date(deadlineMs).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
    const dayLabel = istDay(deadlineMs) === istDay(Date.now())
      ? "today"
      : istDay(deadlineMs) === istDay(Date.now() + 86400000)
      ? "tomorrow"
      : new Date(deadlineMs).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
    const formattedDeadline = `${timeStr} ${dayLabel}`;

    // Fill percent for the ring (out of 24h)
    const fillPercent = Math.min(100, Math.max(10, Math.round((diff / (24 * 3600000)) * 100)));

    return {
      formatted: `${hours}h ${mins}m`,
      formattedDeadline,
      color,
      fillPercent,
      hoursLeft: totalHours,
    };
  }, [nearestUgcOrder, now]);

  // Active Deals
  // Session 58: cancelled / expired / rejected deals are not "active" (they showed as IN PROGRESS and hid the
  // campaign suggestions); newest first.
  const liveDeals = useMemo(() => {
    // v353: finished deals (completed / paid / delivered) are not "active" either — a creator whose deals were all
    // done never saw "Best matches" again.
    const ENDED = ["cancel", "expire", "reject", "decline", "withdraw", "complete", "paid", "delivered"];
    return realDeals
      .filter((d) => !ENDED.some((w) => String(d.status || d.stage || "").toLowerCase().includes(w)))
      .slice()
      .sort((a, b) => (Date.parse(b.updated_at || b.created_at || 0) || 0) - (Date.parse(a.updated_at || a.created_at || 0) || 0));
  }, [realDeals]);
  const hasAnyDeals = liveDeals.length > 0;
  const activeDealsList = useMemo(() => {
    if (!hasAnyDeals) return [];
    return liveDeals.slice(0, 3).map((d) => {
      let friendlyStatus = "IN PROGRESS";
      let statusColor = "bg-[#FEF3C7] text-[#B45309]"; // amber
      const s = (d.status || d.stage || "").toLowerCase();

      // v353: every status with "pending" in it (pending_payment, pending acceptance…) said "PENDING REVIEW".
      if (s.includes("submitted") || s.includes("review")) {
        friendlyStatus = "IN REVIEW";
        statusColor = "bg-[#E9F7F0] text-[#047857]"; // emerald
      } else if (s.includes("payment") || s.includes("signed") || s.includes("fund")) {
        friendlyStatus = "AWAITING PAYMENT";
        statusColor = "bg-[#EEF2FF] text-[#4338CA]";
      } else if (s.includes("offer") || s.includes("negotiat") || s.includes("counter") || s.includes("invit")) {
        friendlyStatus = "OFFER";
        statusColor = "bg-[#F5F0FF] text-[#6D28D9]";
      } else if (s.includes("pending") || s.includes("applied")) {
        friendlyStatus = "PENDING";
        statusColor = "bg-[#F3F4F6] text-[#4B5563]";
      } else if (s.includes("complete") || s.includes("paid") || s.includes("delivered")) {
        friendlyStatus = "COMPLETED";
        statusColor = "bg-[#ECFDF5] text-[#065F46]"; // green
      }

      const brandName = d.brand_name || d.company || "A brand"; // v353: was "Brand Partner"
      const initials = brandName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

      // Session 31: the server sends agreed_amount / payout / proposed_amount (never agreed_rate).
      // No amount yet → show "Amount not set", never an invented ₹10,000.
      const amount = [d.agreed_amount, d.payout, d.proposed_amount].map(Number).find((n) => Number.isFinite(n) && n > 0) ?? null;

      return {
        id: d.id,
        chatId: d.thread_id || d.collab_id || d.id, // v344: the row opens this deal's chat (same as the Deals screen)
        brand: brandName,
        initials: initials || "BP",
        // v330: deliverables can arrive as an array/object — render text, never "[object Object]" or a crash.
        deliverable: (() => {
          const v = d.deliverables || d.deliverable || d.campaign_name || d.title || "Campaign Sponsorship";
          if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : x?.name || x?.type || x?.title || "")).filter(Boolean).join(", ") || "Campaign Sponsorship";
          return typeof v === "string" ? v : v?.name || v?.title || "Campaign Sponsorship";
        })(),
        amount: amount != null ? `₹${amount.toLocaleString("en-IN")}` : "Amount not set",
        status: friendlyStatus,
        statusColor,
      };
    });
  }, [liveDeals, hasAnyDeals]);

  // Greeting based on time of day or welcome for new creator
  const festive = festiveOn(Date.now()); // v367: Diwali accents on the header till Diwali night
  const greeting = useMemo(() => {
    if (festive) return "HAPPY DIWALI"; // v367; v372 design 2b: small yellow capitals
    if (!hasAnyDeals && activeUgcOrders.length === 0) {
      return "Welcome to Ybex"; // v332: brand name spelled the same as everywhere else
    }
    const hr = new Date().getHours();
    if (hr < 12) return "Good morning";
    if (hr < 17) return "Good afternoon";
    return "Good evening";
  }, [hasAnyDeals, activeUgcOrders.length, festive]);

  const userName = user?.name || user?.full_name || user?.username || "Creator";
  // Session 39 (M10): Home greets with the first name only.
  const firstName = String(userName).trim().split(/\s+/)[0] || "Creator";
  const userPhoto = user?.picture || user?.photo || user?.profile_image || user?.avatar || "";
  const userInitial = (userName[0] || "C").toUpperCase();

  const lastUpdatedText = useMemo(() => {
    if (!lastRefreshedAt) return "Live";
    const diffSec = Math.floor((now - lastRefreshedAt.getTime()) / 1000);
    if (diffSec < 45) return "Just updated";
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins}m ago`;
    return "Synced";
  }, [lastRefreshedAt, now]);

  // Active banner
  const activeBanner = banners[currentBannerIdx] || banners[0] || null; // v346: no sample banner fallback

  if (loading) {
    return <CreatorHomeSkeleton />;
  }

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
      <div className={`w-full min-h-screen ${festive ? "bg-[#FFF6E8]" : "bg-[#F4F4F8]"} flex flex-col font-['DM_Sans',sans-serif] text-[#0A0A0A] pb-4 select-none`}>{/* v353: pb-28 on top of Layout's bottom-nav padding left ~190px empty */}
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
            paddingBottom: "32px",
            paddingTop: festive ? "30px" : "14px", // v367: room for the Diwali lights
            // v372 (Ravi's design 2b): saffron → magenta festive header till Diwali night
            ...(festive ? { background: DW.headerBg, borderRadius: 0, borderBottom: "none", paddingBottom: 0, overflow: "hidden" } : {}),
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
          {festive && <DiwaliHeaderDecor />}{/* v367 lights; v372 rays + sparkles (design 2b) */}
          {/* User Greeting & Header Actions Row */}
          <div
            style={{
              padding: "0 16px",
              display: "flex",
              alignItems: "center",
              gap: "11px",
            }}
          >
            {/* Creator Avatar -> opens profile */}
            <button
              type="button"
              onClick={() => navigate("/creator/settings")}
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "20px",
                background: "linear-gradient(135deg, #7C3AED, #C084FC)",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                font: "700 14px 'DM Sans', sans-serif",
                color: "#fff",
                overflow: "hidden",
                border: "none",
                cursor: "pointer",
              }}
              aria-label="View Profile"
            >
              {userPhoto && !avatarBroken ? (
                <img
                  src={userPhoto}
                  alt={userName}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarBroken(true)} /* v330: broken photo → initial, not a broken-image icon */
                />
              ) : (
                <span>{userInitial}</span>
              )}
            </button>

            {/* Greeting text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={festive ? { font: "700 11.5px 'DM Sans', sans-serif", letterSpacing: "1.2px", color: DW.yellow } : { font: "500 11.5px 'DM Sans', sans-serif", color: "#6B7280", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>{greeting}</span>
              </div>
              <div
                style={{
                  font: festive ? "800 19px 'DM Sans', sans-serif" : "700 17px 'DM Sans', sans-serif",
                  letterSpacing: "-0.4px",
                  color: festive ? "#fff" : "#0A0A0A",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {firstName}
              </div>
            </div>

            {/* Notification Bell -> opens notifications */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <WalletChip />
          <button
            type="button"
            onClick={() => navigate("/creator/notifications")}
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "13px",
              background: festive ? "rgba(255,255,255,0.18)" : "#fff",
              ...(festive ? { boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.35)" } : {}),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              flexShrink: 0,
              border: "none",
              cursor: "pointer",
            }}
            aria-label="Notifications"
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
                  background: festive ? DW.yellow : "#7C3AED",
                  display: "flex",
                  alignItems: "center",
                  font: "700 9.5px 'DM Sans', sans-serif",
                  color: festive ? DW.deep : "#fff",
                  border: festive ? "1.5px solid #D81F5E" : "1.5px solid #fff",
                }}
              >
                {unreadNotifications > 9 ? "9+" : unreadNotifications}
              </div>
            )}
          </button>
          </div>
        </div>

        {/* v372 (design 2b): "Diwali Dhamaka" above the banner. The banner stays Admin → Banners (Ravi: no hardcoded banner) */}
        {festive && <DhamakaTitle />}
        {/* 7 · Banner Carousel Inside U-Box (Clean Graphic Banner with Automatic Rotation & Zero-Cutoff 3:1 matching 1200x400) */}
        {banners.length > 0 && activeBanner && (
          <div
            style={{
              margin: "12px 14px 0",
              borderRadius: "20px",
              overflow: "hidden",
              background: "transparent",
              border: "1px solid #E7DCFF",
              boxShadow: "0 14px 28px -20px rgba(76,29,149,0.45)",
              ...(festive ? DW_BANNER_FRAME : {}), // v372
              position: "relative",
              cursor: "pointer",
            }}
            data-splash-target="hero"
            className="aspect-[3/1] flex items-center justify-center"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onClick={() => { const l = activeBanner.link || "/creator/ugc?tab=explore"; if (/^https?:\/\//i.test(l)) window.open(l, "_blank", "noopener"); else navigate(l); } /* Session 58: external banner links opened the 404 page */}
          >
            {/* Ambient blurred backdrop so any aspect ratio blends seamlessly without letterbox bars */}
            <img
              src={activeBanner.image || activeBanner.banner_image || activeBanner.cover_image}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover blur-lg scale-110 opacity-75"
            />
            {/* Foreground Banner - object-cover ensures 100% edge-to-edge fill without black lines or letterbox */}
            <img
              src={activeBanner.image || activeBanner.banner_image || activeBanner.cover_image}
              alt={activeBanner.title || "Banner"}
              className="relative z-10 w-full h-full object-cover"
            />
          </div>
        )}

        {festive && <DiwaliPoweredBy />}{/* v372: sponsors from Admin → Challenge entries → Sponsors & prizes */}
        {/* Cute, Compact, Centered Rotating Trust Line */}
        <div
          style={{
            margin: "9px 14px 0",
            height: "20px",
            display: festive ? "none" : "flex", // v372: the festive header has "Powered by" there
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <TrustLineRotator />{/* v426: its own little component — the 3.5s tick no longer re-renders all of Home */}
        </div>
      </div>

      {/* 2 · Quick Bar (Compact margin, balanced spacing) — v372: cream festive tiles on the Diwali stage (DIWALI_TILES_CSS) */}
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
        {/* Session 43 (Ravi): Campaigns and Insta UGC are already in the bottom bar — these two
            slots are now Refer & Earn and Share my profile.
            v283 (Ravi): order My orders · Refer & Earn · Earnings · Media kit ("Share profile" renamed —
            it shares the creator's profile link with brands). */}
        {/* Shortcut 3: My orders (with active orders count badge) */}
        <button
          type="button"
          // v344: the red badge counts UGC orders, so with active UGC orders the tap opens those orders
          // (it opened campaign deals, where the counted orders weren't). No UGC orders → ongoing deals as before.
          onClick={() => navigate(activeUgcOrders.length > 0 ? "/creator/ugc/orders" : "/creator/deals?tab=active_deals")} /* Session 39 (M11, Ravi): My orders → ongoing deals */
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "7px",
            background: "transparent",
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
            <svg
              width="21"
              height="21"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#059669"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="7" width="18" height="13" rx="2.5" />
              <path d="M8 7V5.5A2.5 2.5 0 0110.5 3h3A2.5 2.5 0 0116 5.5V7" />
            </svg>
            {activeUgcOrders.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "-5px",
                  right: "-5px",
                  minWidth: "18px",
                  height: "18px",
                  padding: "0 4px",
                  boxSizing: "border-box",
                  borderRadius: "9px",
                  background: "#F43F5E",
                  border: "2px solid #fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  font: "700 9.5px 'DM Sans', sans-serif",
                  color: "#fff",
                }}
              >
                {activeUgcOrders.length}
              </div>
            )}
          </div>
          <span style={{ font: "600 11px 'DM Sans', sans-serif", color: "#1F2937" }}>
            My orders
          </span>
        </button>

        <button
          type="button"
          onClick={() => navigate("/refer")}
          data-testid="qa-refer"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "7px",
            background: "transparent",
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
            }}
          >
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="8" width="18" height="4" rx="1" />
              <path d="M12 8v13" />
              <path d="M19 12v7a2 2 0 01-2 2H7a2 2 0 01-2-2v-7" />
              <path d="M7.5 8a2.5 2.5 0 010-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 010 5" />
            </svg>
          </div>
          <span style={{ font: "600 11px 'DM Sans', sans-serif", color: "#1F2937" }}>
            Refer & Earn
          </span>
        </button>

        {/* Shortcut 4: Earnings */}
        <button
          type="button"
          id="quickbar-earnings"
          onClick={() => navigate("/earnings")}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "7px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "16px",
              background: "#EEF2FF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="21"
              height="21"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#4F46E5"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2.5" y="6" width="19" height="13" rx="3" />
              <path d="M2.5 10h19" />
              <path d="M16 14.5h2.5" />
            </svg>
          </div>
          <span style={{ font: "600 11px 'DM Sans', sans-serif", color: "#1F2937" }}>
            Earnings
          </span>
        </button>

        {/* v439 (HIW tile handoff): "How it works" replaces Media kit (the media kit stays shareable from Profile).
            No creator video set in Admin → Media kit stays. */}
        <HiwTile role="creator" fallback={(
        <button
          type="button"
          onClick={() => shareCreatorProfile(authUser)}
          data-testid="qa-share-profile"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "7px",
            background: "transparent",
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
            }}
          >
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
            </svg>
          </div>
          <span style={{ font: "600 11px 'DM Sans', sans-serif", color: "#1F2937" }}>
            Media kit
          </span>
        </button>
        )} />
      </div>
      {festive && <DiyaArch />}{/* v372: arch + three diyas into the cream page */}
      <AppTour role="creator" />{/* v437: first-time tour (new accounts, once) */}

      {/* v367: Diwali Creator Challenge — my entry, or "join the challenge" (shows only in the challenge days).
          v372 (Ravi's video: "24 days left" was cut off): it sat above the Quick Bar, whose -22px top margin (made to
          overlap the hero) slid over the card's last line. It now sits below the Quick Bar. */}
      <div style={{ margin: "12px 14px 0" }} className="empty:hidden"><ChallengeHomeCard /></div>

      {/* 2b · Direct campaign invitations (session 26) — shown only when one is pending */}
      <MobileCreatorInvites refreshKey={invitesRefreshKey} />

      {/* 3 · UGC Live Timer (Spec 3: padding: 14px 14px 0, ONLY FOR UGC IN PROGRESS) */}
      <UgcLiveTimerCard activeUgcOrders={activeUgcOrders} navigate={navigate} nearestUgcOrder={nearestUgcOrder} ugcCountdown={ugcCountdown} />

      {/* 4 · Complete Your Profile (Spec 4: padding: 14px 14px 0, CONDITIONAL) */}
      {showCompleteProfile && (
        <div style={{ flexShrink: 0, padding: "14px 14px 0" }}>
          <div
            style={{
              background: "#fff",
              border: "1px solid #E6E6EE",
              borderRadius: "18px",
              padding: "11px 12px",
              display: "flex",
              alignItems: "center",
              gap: "11px",
            }}
          >
            {/* Completion Percentage Ring */}
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "20px",
                background: `conic-gradient(#7C3AED 0% ${profileCompletionPercentage}%, #EDE4FF ${profileCompletionPercentage}% 100%)`,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "16px",
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  font: "700 10px 'DM Sans', sans-serif",
                  color: "#7C3AED",
                }}
              >
                {profileCompletionPercentage}%
              </div>
            </div>

            {/* Description */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "600 13.5px 'DM Sans', sans-serif", color: "#0A0A0A" }}>
                Complete your profile
              </div>
              <div
                style={{
                  marginTop: "2px",
                  font: !isKycPending && !isKycApproved ? "700 11px 'DM Sans', sans-serif" : "400 11px 'DM Sans', sans-serif",
                  color: !isKycPending && !isKycApproved ? "#DC2626" : "#6B7280", // v286: KYC pending in red
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {isKycPending
                  ? "KYC under review · verification in progress"
                  : kycNorm === "REJECTED"
                  ? "KYC needs a fix · tap Finish to resend" /* v353: rejected said "KYC pending" */
                  : !isKycApproved
                  ? "Complete KYC · brands can't pay you yet" /* v353: never-submitted said "KYC pending" */
                  : "Finish profile details to attract top brand deals"}
              </div>
            </div>

            {/* Finish CTA Button (Right Aligned per Architecture Rule) */}
            <button
              type="button"
              data-testid="profile-finish"
              onClick={() => {
                // Session 39 (M8): onboarding left with "Finish later" → back to the same step.
                if (!(user?.onboarded || user?.onboarding_completed || user?.onboarding_complete)) navigate("/onboarding");
                else setPendingOpen(true); // v283: show what is pending first
              }}
              style={{
                height: "38px", // v332: was 32px — hard to hit
                padding: "0 14px",
                borderRadius: "11px",
                background: "#7C3AED",
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
                font: "600 11.5px 'DM Sans', sans-serif",
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              Finish
            </button>
          </div>
        </div>
      )}

      {/* v283: what is still pending on the profile — each row goes straight to its fix. */}
      {pendingOpen && (
        <MobileSheet fixed onClose={() => setPendingOpen(false)}>
          <div data-testid="profile-pending-sheet" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            <div style={{ font: "700 17px 'DM Sans', sans-serif", color: "#0A0A0A" }}>Finish your profile</div>
            <div style={{ marginTop: 2, font: "400 12.5px 'DM Sans', sans-serif", color: "#6B7280" }}>
              {profileChecklist.filter((r) => !r.done).length} of {profileChecklist.length} left · brands pick complete profiles first
            </div>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {profileChecklist.map((r) => (
                <button key={r.label} type="button" data-testid={`pending-${r.done ? "done" : "todo"}`}
                  disabled={r.done}
                  onClick={() => { setPendingOpen(false); navigate(r.to); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, border: "1px solid #ECECF0", background: r.done ? "#FAFAFC" : "#fff", textAlign: "left", cursor: r.done ? "default" : "pointer" }}>
                  <span style={{ width: 24, height: 24, borderRadius: 12, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: r.done ? "#DCFCE7" : r.waiting ? "#FEF3C7" : "#F5F0FF", color: r.done ? "#16A34A" : r.waiting ? "#B45309" : "#7C3AED", font: "700 12px 'DM Sans', sans-serif" }}>
                    {r.done ? "✓" : r.waiting ? "…" : "!"}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", font: "600 13.5px 'DM Sans', sans-serif", color: r.done ? "#9CA3AF" : "#0A0A0A" }}>{r.label}</span>
                    {!r.done && r.note && <span style={{ display: "block", font: "400 11.5px 'DM Sans', sans-serif", color: "#6B7280" }}>{r.note}</span>}
                  </span>
                  <span style={{ font: "600 12px 'DM Sans', sans-serif", color: r.done ? "#16A34A" : "#7C3AED" }}>{r.done ? "Done" : r.waiting ? "Check" : "Add"}</span>
                </button>
              ))}
            </div>
          </div>
        </MobileSheet>
      )}

      {/* 5 · Active Deals vs Best Matches (Spec 5: Existing creator vs New creator) */}
      {hasAnyDeals ? (
        /* Scenario A: Existing creator — Your Active Deals */
        <div style={{ flexShrink: 0, paddingTop: "16px" }}>
          <div
            style={{
              padding: "0 14px",
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                font: "700 16px 'DM Sans', sans-serif",
                letterSpacing: "-0.4px",
                color: "#0A0A0A",
              }}
            >
              Your Active Deals
            </span>
            <button
              type="button"
              onClick={() => navigate("/creator/deals")}
              style={{
                font: "600 12px 'DM Sans', sans-serif",
                color: "#7C3AED",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "12px 0 12px 16px", // v332: bigger tap area (the text alone was ~16px tall)
                margin: "-12px 0",
              }}
            >
              View All
            </button>
          </div>

          <div
            style={{
              padding: "9px 14px 0",
              display: "flex",
              flexDirection: "column",
              gap: "7px",
            }}
          >
            {activeDealsList.map((deal) => (
              <div
                key={deal.id}
                data-eva-avoid="true" /* v426: Eva's greeting never sits on a deal's amount / status */
                role="button" /* v330: tappable row reachable by keyboard / screen reader */
                tabIndex={0}
                // v344: open this deal's chat (it opened the whole Deals list, so the tap felt broken)
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(deal.chatId ? `/chat/${deal.chatId}` : `/creator/deals`); } }}
                onClick={() => navigate(deal.chatId ? `/chat/${deal.chatId}` : `/creator/deals`)}
                style={{
                  background: "#fff",
                  border: "1px solid #E6E6EE",
                  borderRadius: "18px",
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "11px",
                  cursor: "pointer",
                }}
              >
                {/* Brand Monogram */}
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "18px",
                    background: "#F2F2F7",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    font: "700 11px 'DM Sans', sans-serif",
                    color: "#4B5563",
                  }}
                >
                  {deal.initials}
                </div>

                {/* Brand name + Deliverable */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* v330: long brand names / deliverables ellipsize instead of pushing the amount off a 320px screen */}
                  <div style={{ font: "600 13.5px 'DM Sans', sans-serif", color: "#0A0A0A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {deal.brand}
                  </div>
                  <div
                    style={{
                      marginTop: "2px",
                      font: "400 11.5px 'DM Sans', sans-serif",
                      color: "#6B7280",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {deal.deliverable}
                  </div>
                </div>

                {/* Payout & Status Badge */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ font: "700 14px 'DM Sans', sans-serif", color: "#0A0A0A" }}>
                    {deal.amount}
                  </div>
                  <div
                    className={`mt-1 h-5 px-2 rounded-[6px] flex items-center font-bold text-[11px] tracking-[0.4px] uppercase ${deal.statusColor}`}
                  >
                    {deal.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Scenario B: New creator — Best matches for your profile */
        <div style={{ flexShrink: 0, paddingTop: "16px" }}>
          <div
            style={{
              padding: "0 14px",
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                font: "700 16px 'DM Sans', sans-serif",
                letterSpacing: "-0.4px",
                color: "#0A0A0A",
              }}
            >
              {/* Session 43 (Ravi): short heading — the niche list made it wrap to 2 lines */}
              Best matches for your profile
            </span>
            <button
              type="button"
              onClick={() => navigate("/campaigns")}
              style={{
                font: "600 12px 'DM Sans', sans-serif",
                color: "#7C3AED",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "12px 0 12px 16px", // v332: bigger tap area
                margin: "-12px 0",
              }}
            >
              View all
            </button>
          </div>

          {/* Session 43 (Ravi): boxes in a row you swipe yourself (no auto-slide), like the brand's
              campaign templates — not a table. */}
          <div
            style={{
              padding: "9px 14px 2px",
              display: recommendedCampaigns.length === 0 ? "block" : "flex",
              gap: "10px",
              overflowX: "auto",
              scrollSnapType: "x mandatory",
              scrollPaddingLeft: "14px",
              WebkitOverflowScrolling: "touch",
            }}
            className="no-scrollbar"
            data-testid="best-matches-row"
          >
            {recommendedCampaigns.length === 0 && (
              <OfflineAware compact when={campaignsFailed} onRetry={handlePullRefresh}>{/* v334: offline → OfflineState */}
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #E6E6EE",
                  borderRadius: "18px",
                  padding: "16px 14px",
                  textAlign: "center",
                }}
              >
                {/* v332: a failed load no longer pretends there are no campaigns */}
                <div style={{ font: "600 13px 'DM Sans', sans-serif", color: "#0A0A0A" }}>
                  {campaignsFailed ? "Couldn't load campaigns right now" : "No campaigns in your category right now"}
                </div>
                <div style={{ marginTop: 4, font: "400 12px 'DM Sans', sans-serif", color: "#6B7280" }}>
                  {campaignsFailed ? "Pull down to try again, or open all campaigns." : "New campaigns appear here as brands post them."}
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/campaigns")}
                  style={{
                    marginTop: 12,
                    height: 40, // v332: 40px tap target
                    padding: "0 16px",
                    borderRadius: 11,
                    border: "none",
                    background: "#7C3AED",
                    color: "#fff",
                    font: "600 12.5px 'DM Sans', sans-serif",
                    cursor: "pointer",
                  }}
                >
                  Browse all campaigns
                </button>
              </div>
              </OfflineAware>
            )}
            {/* Session 58 (Ravi): full card like the Campaigns page — brand, posted time, brief, per-creator
                payout, deliverable, views and applied (components/campaigns/mobile/HomeCampaignCard.jsx). */}
            {recommendedCampaigns.map((camp, idx) => (
              <HomeCampaignCard
                key={camp.id || camp.campaign_id || idx}
                c={camp}
                user={user}
                onOpen={() => navigate(camp.id || camp.campaign_id ? `/campaigns/${camp.id || camp.campaign_id}` : "/campaigns")}
              />
            ))}
            {recommendedCampaigns.length > 0 && <div aria-hidden="true" style={{ flex: "0 0 6px" }} />}
          </div>
        </div>
      )}

      {/* 6 · Meet our top creators — Session 48 (Ravi): the same card grid as the brand's "Meet the
          Creators" (photo cards, row by row), and instead of "Explore more" it cheers the creator on.
          Only the creators the admin ticked ("Show on creator home"); none ticked → section hides. */}
      {featuredCreators.length > 0 && (
        <div style={{ flexShrink: 0, paddingTop: "18px" }} data-testid="creator-top-creators">
          <div
            style={{
              padding: "0 14px",
              font: "700 16px 'DM Sans', sans-serif",
              letterSpacing: "-0.4px",
              color: "#0A0A0A",
            }}
          >
            Meet our top creators
          </div>
          <MeetCreatorsGrid
            testId="creator-top-creators-grid"
            creators={featuredCreators.map((c) => ({
              id: c.id,
              name: c.name,
              photo: c.photo,
              reach: c.avgReach || "",
              sub: c.followers ? `${c.followers} followers` : c.niche,
            }))}
            onOpen={(cr) => navigate(`/creator/${cr.id}`)}
            ctaTitle="You could be our next top creator ✨"
            ctaSub="Finish your profile and land your first campaigns"
            ctaLabel="Find campaigns"
            onCta={() => navigate("/campaigns")}
          />
        </div>
      )}
      </div>
      {/* v287: "Ybex Assist" feedback bot (Claude Design, Turn 27). */}
      <FeedbackBot role="creator" screen="creator dashboard" />
    </PullToRefresh>
  );
}

// v426: the rotating green trust line. It used to tick a state at the top of CreatorHomeMobile, so the whole
// 1,400-line Home re-rendered every 3.5 s and stuttered any popup or scroll running at the time.
function TrustLineRotator() {
  const [trustIdx, setTrustIdx] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTrustIdx((prev) => (prev + 1) % TRUST_ITEMS.length), 3500);
    return () => clearInterval(timer);
  }, []);
  return (
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
                {TRUST_ITEMS[trustIdx]?.title || "Free to join"}
              </span>
                {/* v286 (Ravi): only the green line, centred — the grey second half was cut off. */}
            </motion.div>
          </AnimatePresence>
  );
}
