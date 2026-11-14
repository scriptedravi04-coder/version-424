import React, { useState, useEffect, useMemo, useRef } from "react";
import { APPROVE_NOTICE } from "../../lib/fileRetention";
import CreatorCard from "../../components/ugc/CreatorCard";
import { orderWindowHours, deliveryHoursOf } from "../../utils/ugcTerms";
import { compareOrdersForWork } from "../../utils/orderSort";
import { formatAmount, formatINROrDash, safeLower } from "../../utils/safeFormat";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { api } from "../../lib/api";
import { useLoading } from "../../contexts/LoadingContext";
import { Video, CheckCircle2, Clock, PlayCircle, MessageCircle, AlertTriangle, ShieldCheck, RefreshCw, User, X, Search, Plus, RotateCcw, Globe, AlertCircle, Eye, ShieldAlert, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { acquireSocket } from "../../lib/sharedSocket";
import DealProgressStepper from "../../components/deals/DealProgressStepper";
import VideoEmbedPreview from "../../components/shared/VideoEmbedPreview";
import UniversalPreviewModal from "../../components/shared/UniversalPreviewModal";
import OrderSupportModal from "../../components/chat/OrderSupportModal";
import BrandCancelOrderModal, { BrandCancelOrderButton } from "../../components/ugc/BrandCancelOrderModal";
import useIsMobile from "../../hooks/useIsMobile";
import BrandUGCMobile, { UgcConfirmSheet } from "./BrandUGCMobile"; // v416: styled confirm instead of window.confirm
import { DeliverableBadge } from "../../components/ugc/DeliverableBadge";
import { ignored } from "../../utils/ignored";

import { Presence, PopupBackdrop, PopupPanel } from "../../components/common/Popup";
import ApprovedCompletedPanel from "./brandUgcOrders/ApprovedCompletedPanel";
import AwaitingLiveLinkPanel from "./brandUgcOrders/AwaitingLiveLinkPanel";
import LiveLinkCard from "./brandUgcOrders/LiveLinkCard";
import OrderModalPanel from "./brandUgcOrders/OrderModalPanel";
import RevisionRequestedPanel from "./brandUgcOrders/RevisionRequestedPanel";
import SocialLogo from "../../components/common/SocialLogo"; // v364: real platform logos
import useScrollLock from "../../lib/useScrollLock"; // v415

// v415: " (₹3,000)" after an approve label, or nothing when the amount is unknown — never "(₹0)".
export function payoutSuffix(amount) {
  const n = Number(amount);
  return Number.isFinite(n) && n > 0 ? ` (${formatINROrDash(n)})` : "";
}
// v415: first real amount (the old ?? chain stopped at a 0 placeholder and skipped the real one)
export function firstPositiveAmount(...values) {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}
// v415: wide screen = the list + workspace layout (lg), where an order opens on the right, not in a sheet
function isWideScreen() {
  try { return typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches; } catch { return false; }
}
// v415: Escape closes a popup (used by the revision / payout popups on this screen)
function useEscape(active, onEscape) {
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onEscape?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onEscape]);
}
// Local Mini Countdown component for live SLA tracking
/**
 * When the brand is allowed an unwatermarked, downloadable copy of the draft.
 *
 * `isApproved` on VideoEmbedPreview does two things: it drops the watermark AND it exposes a
 * direct download link. Several panels here passed it as soon as the *draft* was approved —
 * one even hardcoded `isApproved={true} watermark={false}` — which handed the brand a clean,
 * downloadable file while the creator had not yet published anything and the escrow was
 * still held. Approve the draft, download, walk away.
 *
 * The chat screen already states the correct rule: the download unlocks after the *live link*
 * is approved. So for a collaboration order nothing unlocks until the order is actually
 * complete; for a raw UGC order, where approval is the final step and releases the payout,
 * approval is the unlock.
 */
function isDeliverableUnlockedForBrand(order) {
  if (!order) return false;
  const stage = String(order.stage || "").toUpperCase();
  if (stage === "COMPLETED" || stage === "APPROVED") return true;
  if (order.isCollabOrder) return false;
  return Boolean(order.content_approved) || stage === "COMPLETED_APPROVAL";
}

/**
 * The live-post card used to render a pink Instagram badge for every link, whatever the host.
 * Paste a YouTube link, a Chrome tab, anything at all, and it still claimed Instagram — which
 * is worse than no icon, because the brand is being asked to verify that this is the right
 * post on the right platform.
 */
// Rows written before the fix carry the brand's feedback inside creator_notes, prefixed
// ("Revision feedback: ...", "Live link revision feedback: ...", "Revision declined: ...").
// The lifecycle no longer does that, but the old rows are still in the table, and showing
// one under a "Creator Notes:" heading puts the brand's own words in the creator's mouth.
// Anything carrying a prefix is not a creator note and is not displayed as one.
const POISONED_CREATOR_NOTE = /^(revision feedback|live link revision feedback|revision declined)\s*:/i;
function creatorNoteOrNull(value) {
  if (typeof value !== "string") return "";
  return POISONED_CREATOR_NOTE.test(value.trim()) ? "" : value;
}

const IgLogo = ({ size = 16 }) => <SocialLogo platform="instagram" size={size} />;
const YtLogo = ({ size = 16 }) => <SocialLogo platform="youtube" size={size} />;
function livePostPlatform(url) {
  let host = "";
  try {
    host = new URL(String(url).startsWith("http") ? url : `https://${url}`).hostname.toLowerCase();
  } catch (e) {
    return { Icon: Globe, tone: "bg-[var(--bg-elevated)] text-[var(--text-secondary)]", label: "Link" };
  }
  if (host.includes("instagram.")) {
    return { Icon: IgLogo, tone: "bg-pink-500/10 text-pink-600", label: "Instagram" }; // v364: real logo
  }
  if (host.includes("youtube.") || host.includes("youtu.be")) {
    return { Icon: YtLogo, tone: "bg-red-500/10 text-red-600", label: "YouTube" };
  }
  return { Icon: Globe, tone: "bg-[var(--bg-elevated)] text-[var(--text-secondary)]", label: host || "Link" };
}

function MiniCountdown({ deadline }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    if (!deadline) return;

    const updateTimer = () => {
      const diff = new Date(deadline).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("Past deadline"); // v332: plain words
        setIsUrgent(true);
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      setTimeLeft(hours >= 48 ? `${Math.floor(hours / 24)}d ${hours % 24}h left` : `${hours}h ${minutes}m left`); // v414: days, not "371h"
      setIsUrgent(diff < 6 * 60 * 60 * 1000); // < 6 hours
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000);
    return () => clearInterval(interval);
  }, [deadline]);

  if (!deadline) return null;

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap ${
      isUrgent ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
    }`}>{/* v415: no endless blinking on a list badge */}
      <span className={`w-1.5 h-1.5 rounded-full ${isUrgent ? "bg-rose-500" : "bg-emerald-500"}`} />
      <span>{timeLeft}</span>
    </div>
  );
}

// v416: "72h delivery countdown" for the real 24/48/72h windows; anything else (an extended deadline) is just
// "Delivery countdown" (it read "528H DELIVERY COUNTDOWN").
export function countdownLabel(totalHours) {
  const h = Number(totalHours);
  return [24, 48, 72].includes(h) ? `${h}h delivery countdown` : "Delivery countdown";
}
// 24H SLA Production Countdown Card
// v332: `doneLabel` — once the draft is in, this card says "Draft delivered" instead of an OVERDUE timer.
function SlaCountdownTimerCard({ deadline, isCompleted, totalHours = 24, doneLabel = "Production Completed" }) {
  const [timeLeft, setTimeLeft] = useState({ formatted: "24h 00m 00s", percent: 100, isOverdue: false });

  useEffect(() => {
    if (isCompleted) return;

    const calculateTimer = () => {
      const now = Date.now();
      const end = deadline ? new Date(deadline).getTime() : now + 24 * 60 * 60 * 1000;
      const diff = end - now;

      if (diff <= 0) {
        setTimeLeft({ formatted: "00h 00m 00s", percent: 0, isOverdue: true }); // v332: "(SLA Expired)" repeated the OVERDUE badge
        return;
      }

      const totalSlaMs = totalHours * 60 * 60 * 1000;
      const percentLeft = Math.max(0, Math.min(100, (diff / totalSlaMs) * 100));

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const formatted = hours >= 48 ? `${Math.floor(hours / 24)}d ${hours % 24}h ${minutes.toString().padStart(2, '0')}m` : `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`; // v415: days, not "360h"

      setTimeLeft({ formatted, percent: percentLeft, isOverdue: false });
    };

    calculateTimer();
    const interval = setInterval(calculateTimer, 1000);
    return () => clearInterval(interval);
  }, [deadline, isCompleted]);

  // v358: with no deadline the card showed a frozen "24h 00m 00s" (it counted from "now" on every tick)
  if (!isCompleted && !deadline) {
    return (
      <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl p-4 flex items-center gap-2.5 text-[var(--text-secondary)]">
        <Clock size={16} className="text-[var(--violet)]" />
        <span className="text-xs font-bold">Deadline pending — it starts when the creator claims the brief.</span>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between text-emerald-700">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 size={18} className="text-emerald-600" />
          <span className="text-xs font-bold uppercase tracking-wider">{doneLabel}</span>
        </div>
        <span className="text-[10px] font-mono font-bold bg-emerald-500/20 px-2.5 py-1 rounded-full text-emerald-800">Done</span>{/* v332: "SLA Fulfilled" claimed on-time even when late */}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl p-5 border transition-all ${
      timeLeft.isOverdue 
        ? "bg-rose-50 border-rose-200 text-rose-800" 
        : "bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-primary)]"
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Clock size={16} className={timeLeft.isOverdue ? "text-rose-500" : "text-[var(--violet)]"} />{/* v332: no spinning clock (looked like a loader) */}
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">{countdownLabel(totalHours)}</span>{/* v332: said "24H" on 48h / 72h orders · v416: no "528H" — only 24/48/72h windows are named */}
        </div>
        <span className={`text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full ${
          timeLeft.isOverdue 
            ? "bg-rose-100 text-rose-700 border border-rose-300" 
            : "bg-[var(--violet)]/10 text-[var(--violet)] border border-[var(--violet)]/20"
        }`}>
          {timeLeft.isOverdue ? "OVERDUE" : "LIVE TIMER"}
        </span>
      </div>

      <div className="flex items-baseline justify-between pt-1">
        <span className={`text-2xl font-black font-mono tracking-tight ${
          timeLeft.isOverdue ? "text-rose-600" : "text-[var(--text-primary)]"
        }`}>
          {timeLeft.formatted}
        </span>
        <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
          {timeLeft.isOverdue ? "Past deadline" : "Time Remaining"}{/* v358: plain words */}
        </span>
      </div>

      <div className="w-full bg-[var(--bg-surface)] h-2 rounded-full overflow-hidden mt-3 border border-[var(--border-default)]">
        <div 
          className={`h-full rounded-full transition-all duration-1000 ${
            timeLeft.isOverdue 
              ? "bg-rose-500" 
              : "bg-gradient-to-r from-[var(--violet)] to-blue-500"
          }`}
          style={{ width: `${Math.max(5, timeLeft.percent)}%` }}
        />
      </div>
    </div>
  );
}

function BrandUGCOrdersDesktop({ embedded = false }) {
  const [confirmSheet, setConfirmSheet] = useState(null); // v416
  const navigate = useNavigate();
  const { startLoading, stopLoading } = useLoading();

  const [orders, setOrders] = useState([]);
  const [briefs, setBriefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all"); // "all" | "in_production" | "pending_review" | "CHANGES_REQUESTED" | "completed"
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [approvingId, setApprovingId] = useState(null);

  // Revision Modal State
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [submittingRevision, setSubmittingRevision] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [cancelOrderTarget, setCancelOrderTarget] = useState(null); // session 25: brand cancels one order
  const [showPayoutModal, setShowPayoutModal] = useState(false);

  // Held in refs so the socket effect can mount once and still see the latest fetcher and the
  // latest order list, instead of the closure it captured on first render.
  const fetchOrdersRef = useRef(null);
  const ordersRef = useRef([]);
  const autoPickedRef = useRef(false); // v415: auto-open the first order only once
  const closeRevision = React.useCallback(() => { if (!submittingRevision) setShowRevisionModal(false); }, [submittingRevision]);
  const closePayout = React.useCallback(() => { if (!approvingId) setShowPayoutModal(false); }, [approvingId]);
  useEscape(showRevisionModal, closeRevision); // v415
  useEscape(showPayoutModal, closePayout); // v415
  useScrollLock(showRevisionModal || showPayoutModal); // v415: page behind must not scroll

  // v332: remembers a failed first load so the page shows "Couldn't load" instead of "No UGC Orders Found".
  const [ordersFailed, setOrdersFailed] = useState(false);

  // v416 (CR24): every load gets a number; an older load that answers late (the 30 s refresh racing an
  // approve) is dropped instead of putting the old order states back on screen.
  const fetchSeqRef = useRef(0);
  // v416 (CR13): ?order=<id> opens that order (notification links), ?brief=<id> shows only that brief's orders.
  const deepLinkRef = useRef((() => {
    try { const q = new URLSearchParams(window.location.search); return { order: q.get("order") || "", brief: q.get("brief") || "" }; } catch { return { order: "", brief: "" }; }
  })());
  const [briefFilter, setBriefFilter] = useState(deepLinkRef.current.brief || ""); // v416 (U27)

  // v416 (CR11): refreshes (timer, socket, Refresh button, after an action) skip the 10 s GET cache
  const fetchOrders = async (fresh = true) => {
    const seq = ++fetchSeqRef.current;
    try {
      const res = await api.get("ugc/orders/brand", fresh ? { bypassCache: true } : undefined);
      if (seq !== fetchSeqRef.current) return true; // v416: a newer load is on its way
      // v332: only ever a list here (an object answer crashed the page on .map)
      const od = res.data?.orders || res.data;
      const fetchedOrders = Array.isArray(od) ? od : [];
      setOrders(fetchedOrders);
      setOrdersFailed(false);

      // v416 (CR13): the order named in the link wins over the auto-pick (once)
      const wanted = deepLinkRef.current.order;
      if (wanted && fetchedOrders.some(o => String(o.id) === String(wanted))) {
        deepLinkRef.current.order = "";
        autoPickedRef.current = true;
        setSelectedOrderId(wanted);
      }

      // v415: pick the order in the same render as the list arrives (it waited for the briefs call, so the
      // page first showed "Pick an order" and then jumped to the open order — layout shift).
      if (fetchedOrders.length > 0) {
        setSelectedOrderId(prev => prev && fetchedOrders.some(o => String(o.id) === String(prev)) ? prev : null);
        // v415: on a wide screen open the first order straight away (the right side was a big empty box).
        // Not on narrow screens, where a selected order opens as a sheet.
        if (!autoPickedRef.current && isWideScreen()) {
          autoPickedRef.current = true;
          const first = [...fetchedOrders].sort((a, b) => compareOrdersForWork(a, b))[0];
          if (first) setSelectedOrderId(prev => prev || first.id);
        }
      } else {
        setSelectedOrderId(null);
      }

      const briefRes = await api.get("ugc/briefs/my", fresh ? { bypassCache: true } : undefined).catch(err => {
        console.error(err); // v332: no "Failed to load your briefs." pop-up — this screen lists orders
        return null; // v416: a failed briefs call keeps the briefs already shown
      });
      if (!briefRes || seq !== fetchSeqRef.current) return true; // v416
      const bd = briefRes.data?.briefs || briefRes.data;
      const fetchedBriefs = Array.isArray(bd) ? bd : [];
      setBriefs(fetchedBriefs);

      return true;
    } catch (e) {
      if (seq !== fetchSeqRef.current) return true; // v416: stale failure — ignore
      console.error("Error fetching brand UGC orders:", e);
      setOrdersFailed(true); // v332: the page shows a calm retry card when nothing is on screen
      return false;
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false); // v416
    }
  };

  useEffect(() => {
    fetchOrdersRef.current = fetchOrders;
  });

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    fetchOrders(false); // v416: first load may use the short cache; every refresh after it is fresh
    // Background refresh only. It ran every 20 s whether or not the tab was visible and even if
    // the previous refresh had not returned. Now: 30 s, skipped while hidden or still running.
    let refreshing = false;
    const interval = setInterval(async () => {
      if (refreshing || (typeof document !== "undefined" && document.hidden)) return;
      refreshing = true;
      try { await fetchOrdersRef.current?.(); } catch (e) { ignored("BrandUGCOrders:279", e); } finally { refreshing = false; }
    }, 30000);

    // The creator's Manage Orders patches its rows straight from the socket payload. This
    // screen refetches instead, on purpose: the payload carries the raw order status
    // ('AWAITING_LIVE_LINK'), not the resolved brand stage, so patching it in would mean a
    // second copy of the stage rules living here. One round trip keeps resolveUgcStage the only
    // thing that decides a stage — which is the whole point of that file existing.
    let socket;
    let debounceId;
    const scheduleRefresh = () => {
      clearTimeout(debounceId);
      debounceId = setTimeout(() => fetchOrdersRef.current?.(), 400);
    };

    // thread_updated is broadcast for every thread on the platform, campaign ones included.
    // Refetching on all of them would hammer the endpoint from a screen that cannot show them.
    const touchesOneOfOurOrders = (payload) => {
      const ids = [payload?.orderId, payload?.threadId, payload?.id, payload?.deal_id]
        .filter(Boolean)
        .map(String);
      if (ids.length === 0) return false;
      return (ordersRef.current || []).some(
        (o) => ids.includes(String(o.id)) || (o.thread_id && ids.includes(String(o.thread_id)))
      );
    };

    const onUgcEvent = (payload) => {
      if (touchesOneOfOurOrders(payload)) scheduleRefresh();
    };

    try {
      // Session 36: shared connection (src/lib/sharedSocket.js) instead of one more socket per screen.
      socket = acquireSocket();
      socket.on("ugc_order_updated", onUgcEvent);
      socket.on("thread_updated", onUgcEvent);
    } catch (e) {
      console.warn("Socket initialization error in BrandUGCOrders:", e);
    }

    return () => {
      clearInterval(interval);
      clearTimeout(debounceId);
      if (socket) socket.release();
    };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    const ok = await fetchOrders();
    setRefreshing(false);
    // v332: the success toast showed even when the refresh failed
    if (ok) toast.success("Orders updated");
    else toast.error("Couldn't refresh your orders. Please try again.");
  };

  // Mapped orders
  const mappedOrders = useMemo(() => {
    return (orders || []).map(o => {
      const rawStatus = (o.brand_status || o.status || o.creator_status || '').toUpperCase();
      const paymentStatus = (o.payment_status || '').toUpperCase();
      const utrNumber = o.utr_number || o.payout_reference || null;
      const thrFlow = (o.flow_state || o.thread_flow_state || o.thread_status || '').toUpperCase();
      const orderStage = (o.stage || '').toUpperCase();
      const deliveryStatus = (o.latestDelivery?.status || (Array.isArray(o.deliverables) && o.deliverables[0]?.status) || '').toUpperCase();
      const isLiveLinkRevision = rawStatus === 'REVISION_REQUESTED_LINKS' || orderStage === 'REVISION_REQUESTED_LINKS' || thrFlow === 'REVISION_REQUESTED_LINKS';
      const isLiveLinkDeclined = rawStatus === 'REVISION_DECLINED_LINKS' || orderStage === 'REVISION_DECLINED_LINKS' || thrFlow === 'REVISION_DECLINED_LINKS';

      const isDeclined = rawStatus === 'REVISION_DECLINED' || 
                         rawStatus === 'DECLINED_REVISION' || 
                         rawStatus === 'RESUBMISSION_DECLINED' || 
                         isLiveLinkDeclined ||
                         rawStatus.includes('DECLINED') || 
                         deliveryStatus.includes('DECLINE');
      let stage = "IN_PROGRESS";

      // Check if deliverable was resubmitted after revision was requested
      const deliveredTime = Date.parse(o.delivered_at || '') || 0;
      const updatedTime = Date.parse(o.updated_at || '') || 0;
      const hasFreshSubmission = (rawStatus === 'SUBMITTED' || rawStatus === 'CONTENT_SUBMITTED' || rawStatus === 'DELIVERED') ||
        (deliveredTime > 0 && deliveredTime >= updatedTime && (o.submission_link || o.video_url || o.delivery_url));

      const liveLink = o.live_link || (Array.isArray(o.live_links) ? o.live_links[0] : o.live_links) || (o.proof && (o.proof.live_link || o.proof.link)) || null;
      const hasLiveLink = Boolean(liveLink || o.live_links_submitted);

      const isContentApproved = 
        Boolean(o.draft_approved_at) ||
        rawStatus === 'CONTENT_APPROVED' || 
        rawStatus === 'COMPLETED_APPROVAL' || 
        rawStatus === 'AWAITING_LIVE_LINK' ||
        thrFlow === 'CONTENT_APPROVED' ||
        thrFlow === 'AWAITING_LIVE_LINK' ||
        orderStage === 'AWAITING_LIVE_LINK' ||
        orderStage === 'COMPLETED_APPROVAL' ||
        o.content_approved === true ||
        o.isApproved === true ||
        isLiveLinkRevision ||
        isLiveLinkDeclined;

      const isLiveLinkSubmitted = !isLiveLinkRevision && !isLiveLinkDeclined && Boolean(
        hasLiveLink || 
        rawStatus === 'PROOF_SUBMITTED' || 
        rawStatus === 'LIVE_LINK_SUBMITTED' ||
        rawStatus === 'LINKS_UNDER_REVIEW' ||
        thrFlow === 'PROOF_SUBMITTED' ||
        orderStage === 'LIVE_LINK_SUBMITTED'
      );
      const isAwaitingLiveLink = isContentApproved && !isLiveLinkSubmitted && !isLiveLinkRevision && !isLiveLinkDeclined;

      if (rawStatus === 'COMPLETED' || rawStatus === 'APPROVED' || paymentStatus === 'RELEASED' || paymentStatus === 'PAID' || utrNumber || thrFlow === 'COMPLETED' || orderStage === 'COMPLETED') {
        stage = "COMPLETED";
      } else if (isDeclined) {
        stage = "REVISION_DECLINED";
      } else if (isLiveLinkRevision) {
        stage = "REVISION_REQUESTED_LINKS";
      } else if (isLiveLinkSubmitted) {
        stage = "LIVE_LINK_SUBMITTED";
      } else if (isAwaitingLiveLink) {
        stage = "AWAITING_LIVE_LINK";
      } else if (rawStatus === 'REVISION_REQUESTED' || rawStatus === 'REVISION_REQ' || rawStatus === 'IN_REVISION') {
        stage = "REVISION_REQUESTED";
      } else if (hasFreshSubmission || rawStatus === 'QUALITY_REVIEW' || rawStatus === 'PENDING_REVIEW' || rawStatus === 'IN_REVIEW' || rawStatus === 'UNDER_REVIEW' || o.submission_link || o.video_url || o.delivery_url) {
        stage = "IN_REVIEW";
      } else {
        stage = "IN_PROGRESS";
      }

      const amount = firstPositiveAmount(o.creator_payout, o.agreed_amount, o.escrow_amount, o.amount, o.brief?.budget, o.brief?.price_per_video); // v358: + o.amount · v415: first real (> 0) value
      const title = o.brief?.title || o.title || "UGC Video Brief";
      const productName = o.brief?.product_name || o.product_name || ""; // v358: no made-up "Product Item"
      
      let creatorName = o.creator?.name || o.creator?.full_name || o.creator_name || "Creator";
      // v358: only the developer-bypass test account is renamed — "dev" also matched real names like "Devendra",
      // and nobody is called "Verified UGC Creator" (the server's placeholder name too).
      if (creatorName.toLowerCase().includes("bypass") || /^verified ugc creator$/i.test(creatorName.trim())) {
        creatorName = "Creator";
      }
      
      const creatorAvatar = o.creator?.avatar || o.creator?.profile_pic || o.creator_avatar;
      const creatorHandle = o.creator?.username ? `@${o.creator.username}` : "";
      const creatorId = o.creator_user_id || o.creator?.id || o.creator_id;

      let deliverableUrl = o.submission_link || o.video_url || o.delivery_url;
      if (!deliverableUrl && o.deliverables) {
        if (Array.isArray(o.deliverables) && o.deliverables[0]) {
          deliverableUrl = o.deliverables[0].video_url || o.deliverables[0].url || o.deliverables[0];
        } else if (typeof o.deliverables === "string") {
          deliverableUrl = o.deliverables;
        }
      }

      const creatorNotes = creatorNoteOrNull(o.creator_notes) || o.notes || (Array.isArray(o.deliverables) ? o.deliverables[0]?.creator_notes : null);

      let extractedRevisionNotes = o.revision_notes || o.revision_feedback || o.brand_feedback || o.notes || "";
      if (!extractedRevisionNotes && typeof o.creator_notes === "string" && o.creator_notes.includes("Revision feedback:")) {
        extractedRevisionNotes = o.creator_notes.replace(/^Revision feedback:\s*/i, "").trim();
      }

      const deliverableType = String(o.deliverable_type || o.brief?.deliverable_type || "collaboration_reel").toLowerCase();
      const isCollabOrder = o.requires_live_link !== undefined
        ? Boolean(o.requires_live_link)
        : (o.is_collaboration !== undefined
          ? Boolean(o.is_collaboration)
          : (!deliverableType.includes('raw') && !deliverableType.includes('edited') && !deliverableType.startsWith('ugc_video')));

      return {
        id: o.id,
        orderNumber: o.order_number || `#ORD-${String(o.id).slice(-6).toUpperCase()}`,
        title,
        productName,
        creatorName,
        creatorAvatar,
        creatorHandle,
        creatorId,
        rawStatus,
        paymentStatus,
        utrNumber,
        stage,
        amount,
        deadline: o.internal_deadline || o.sla_expires_at || o.deadline,
        dos: o.brief?.dos || [],
        donts: o.brief?.donts || [],
        requirements: o.brief?.detailed_requirements || o.brief?.instructions || "",
        productDescription: o.brief?.product_description || o.brief?.description || "",
        sampleUrl: o.brief?.sample_content_url || o.brief?.sample_url || null,
        deliverableUrl,
        driveUrl: o.drive_url || null,
        liveLink,
        deliverableType,
        isCollabOrder,
        creatorNotes,
        revisionNotes: extractedRevisionNotes,
        revisionNotesLinks: o.revision_notes_links || o.raw?.revision_notes_links || "",
        declineNotesLinks: o.decline_notes_links || o.raw?.decline_notes_links || o.thread?.decline_notes_links || "",
        declineReason: (
          (isLiveLinkDeclined ? (o.decline_notes_links || o.raw?.decline_notes_links || o.thread?.decline_notes_links) : null) ||
          o.decline_reason ||
          o.raw?.decline_reason ||
          o.thread?.decline_reason ||
          o.decline_notes_links ||
          o.raw?.decline_notes_links ||
          o.thread?.decline_notes_links ||
          (isDeclined && typeof o.revision_notes === "string" && !POISONED_CREATOR_NOTE.test(o.revision_notes) && !o.revision_notes.toLowerCase().startsWith("revision feedback") ? o.revision_notes : "") ||
          ""
        ),
        isLiveLinkDeclined,
        threadId: o.thread_id || o.chat_thread_id || o.thread?.id || null,
        // Session 25: cancelled / expired before a draft (the stage chain above has no such state).
        closedNoDraft: ['CANCELLED', 'EXPIRED', 'REFUNDED'].includes(String(o.status || '').toUpperCase()) && !(o.video_url || o.submission_link),
        closedReason: o.expiry_reason || null,
        // v414: any cancelled / expired / refunded order that never completed (with or without a draft)
        isClosed: stage !== "COMPLETED" && ['CANCELLED', 'EXPIRED', 'REFUNDED'].includes(String(o.status || '').toUpperCase()),
        raw: o
      };
    }).sort(compareOrdersForWork); // open work on top, finished below (session 23)
  }, [orders]);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return mappedOrders.filter(o => {
      if (briefFilter && String(o.raw?.brief_id || o.raw?.brief?.id || "") !== String(briefFilter)) return false; // v416 (U27)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches = (
          safeLower(o.title).includes(q) ||
          safeLower(o.productName).includes(q) ||
          safeLower(o.creatorName).includes(q) ||
          safeLower(o.orderNumber).includes(q)
        );
        if (!matches) return false;
      }

      if (activeFilter === "all") return true;
      if (activeFilter === "in_production") return !o.closedNoDraft && !o.isClosed && (o.stage === "IN_PROGRESS" || o.stage === "AWAITING_LIVE_LINK" || o.stage === "REVISION_REQUESTED_LINKS"); // v414: closed orders left out
      if (activeFilter === "pending_review") return o.stage === "IN_REVIEW" || o.stage === "AWAITING_LIVE_LINK" || o.stage === "LIVE_LINK_SUBMITTED" || o.stage === "REVISION_DECLINED" || o.stage === "REVISION_REQUESTED_LINKS";
      if (activeFilter === "CHANGES_REQUESTED") return o.stage === "REVISION_REQUESTED" || o.stage === "REVISION_DECLINED" || o.stage === "REVISION_REQUESTED_LINKS";
      if (activeFilter === "completed") return o.stage === "COMPLETED";
      return true;
    });
  }, [mappedOrders, searchQuery, activeFilter, briefFilter]);

  // Currently selected order object
  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    return mappedOrders.find(o => String(o.id) === String(selectedOrderId)) || null;
  }, [mappedOrders, selectedOrderId]);

  // Approve Order Handler (handles draft or live link approval)
  const handleApprove = async (orderId, action = null) => {
    if (approvingId) return; // a second tap while the first is in flight duplicates the request
    setApprovingId(orderId);
    const isDraft = action === 'approve_draft';
    toast.loading(isDraft ? "Approving video draft..." : "Approving & releasing payout...", { id: "brand-approve" });
    try {
      const payload = action ? { action } : {};
      const response = await api.post(`/ugc/orders/${orderId}/approve`, payload);

      if (response.data?.already_approved) {
        toast.success("This order was already approved — payout is in progress.", { id: "brand-approve" });
      } else if (response.data?.message?.includes("Awaiting live links") || isDraft) {
        toast.success("Video draft approved! Creator notified to post & submit live link.", { id: "brand-approve" });
      } else {
        toast.success("Order approved! Payout released to creator.", { id: "brand-approve" });
      }

      if (isDraft) {
        const nowIso = new Date().toISOString();
        setOrders(prev => (prev || []).map(o => {
          if (String(o.id) === String(orderId)) {
            return {
              ...o,
              stage: 'AWAITING_LIVE_LINK',
              brand_status: 'CONTENT_APPROVED',
              status: 'CONTENT_APPROVED',
              flow_state: 'CONTENT_APPROVED',
              content_approved: true,
              isApproved: true,
              draft_approved_at: nowIso
            };
          }
          return o;
        }));
      }

      setShowPayoutModal(false);
      await fetchOrders();
    } catch(e) {
      console.error(e);
      toast.error(e?.response?.data?.error || "Couldn't approve right now. Please try again.", { id: "brand-approve" }); // v332
      fetchOrders();
    } finally {
      setApprovingId(null);
    }
  };

  // Submit Revision Request Handler
  const handleSubmitRevision = async (e) => {
    e.preventDefault();
    if (!selectedOrder) return;
    if (!revisionNotes.trim()) {
      toast.error("Please enter revision feedback for the creator.");
      return;
    }

    setSubmittingRevision(true);
    toast.loading("Sending revision request to creator...", { id: "brand-revision" });
    try {
      // The brand opens this modal from a specific panel, so this screen already knows whether
      // it is asking for a new draft or a corrected live post. It used to send neither, leaving
      // the server to infer it — and when the inference missed, the creator was shown "upload a
      // revised draft" for a live-link problem, with no way to resubmit the link.
      const isLiveLinkStage =
        selectedOrder.stage === "LIVE_LINK_SUBMITTED" ||
        selectedOrder.stage === "AWAITING_LIVE_LINK" ||
        selectedOrder.stage === "REVISION_REQUESTED_LINKS";

      await api.post(`/ugc/orders/${selectedOrder.id}/revision`, {
        notes: revisionNotes.trim(),
        ...(isLiveLinkStage ? { action: "reject_live_links" } : {})
      });
      toast.success(
        isLiveLinkStage
          ? "Live link correction requested! Creator has been notified."
          : "Revision request sent! Creator has been notified.",
        { id: "brand-revision" }
      );
      setShowRevisionModal(false);
      setRevisionNotes("");
      fetchOrders();
    } catch(e) {
      console.error(e);
      toast.error(e?.response?.data?.error || "Couldn't send the change request. Please try again.", { id: "brand-revision" }); // v332
    } finally {
      setSubmittingRevision(false);
    }
  };

  const getStageBadge = (stage) => {
    switch (stage) {
      case "IN_PROGRESS":
        return <span className="bg-blue-50 text-[#6D28D9] border border-blue-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap">In production</span>;
      case "IN_REVIEW":
        return <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap">Draft to review</span>;
      case "AWAITING_LIVE_LINK":
        return <span className="bg-[#F5F0FF] text-[#6D28D9] border border-[#DDD6FE] text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap">Waiting for live link</span>;
      case "LIVE_LINK_SUBMITTED":
        return <span className="bg-[#F5F0FF] text-[#6D28D9] border border-[#DDD6FE] text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap">Live post to review</span>;
      case "REVISION_REQUESTED":
        return <span className="bg-[#F5F0FF] text-[#6D28D9] border border-[#DDD6FE] text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap">Changes asked</span>;
      case "REVISION_REQUESTED_LINKS":
        return <span className="bg-amber-50 text-amber-700 border border-amber-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap">Link change asked</span>;
      case "REVISION_DECLINED":
        return <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap">Creator declined</span>;
      case "COMPLETED":
        return <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap">Completed</span>;
      default:
        // v330: unknown stages showed the raw enum (e.g. "CONTENT_APPROVED")
        return <span className="bg-gray-50 text-gray-600 border border-gray-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full">{String(stage || "In progress").replace(/_/g, " ").toLowerCase().replace(/^\w/, (ch) => ch.toUpperCase())}</span>;
    }
  };

  // v415: the page header is built once and used by both the loading skeleton and the page (CLS fix)
  const firstLoad = loading && orders.length === 0;
  const headerRow = !embedded ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--bg-card)] p-5 rounded-2xl border border-[var(--border-default)] shadow-xs">
          <div>
            <h1 className="text-2xl font-black text-[var(--text-primary)] tracking-tight flex items-center gap-2">
              UGC Orders
              <span className="bg-[var(--violet)]/10 text-[var(--violet)] text-xs font-bold px-2.5 py-0.5 rounded-full border border-[var(--violet)]/20">
                <span className={firstLoad ? "invisible" : ""}>{/* v415: no "0 active" flash while loading */}
                  {mappedOrders.filter((o) => o.stage !== "COMPLETED" && !o.closedNoDraft && !o.isClosed).length} active{/* v332: counted finished orders as "Active" · v415: closed ones too */}
                </span>
              </span>
            </h1>
            <p className="text-xs text-[var(--text-tertiary)] font-medium mt-0.5">
              Track each creator video, approve drafts and release the payment you hold with Ybex.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap self-start sm:self-center">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 bg-[var(--bg-elevated)] hover:bg-[var(--bg-card)] text-[var(--text-secondary)] px-3.5 py-2 rounded-xl border border-[var(--border-default)] text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-xs"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin text-[var(--violet)]" : ""} />
              <span>Refresh</span>
            </button>

            <Link
              to="/brand/ugc/post"
              className="bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-md shadow-[var(--violet)]/20 transition-all active:scale-95 cursor-pointer"
            >
              <Plus size={15} />
              <span>Post Brief</span>
            </Link>
          </div>
        </div>
  ) : null;

  if (loading && orders.length === 0) {
    // v415: page-shaped skeleton (list + workspace) instead of a centred spinner that jumped to the real layout
    return (
      <div className={`w-full space-y-6 ${embedded ? "" : "max-w-none px-4 sm:px-8 pt-6 pb-28 min-h-screen bg-[var(--bg-base)]"}`} aria-busy="true" aria-label="Loading your UGC orders">{/* v415: same wrapper as the page */}
        {headerRow}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 xl:col-span-4 space-y-3">
            {/* v415: search + filter chips, then the cards — same boxes as the real list */}
            <div className="space-y-2">
              <div className="h-10 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] animate-pulse" />
              <div className="h-[30px] w-4/5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-default)] animate-pulse" />
            </div>
            <div className="space-y-3">
              {[0, 1, 2].map((i) => <div key={i} className="h-36 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-default)] animate-pulse" />)}
            </div>
          </div>
          <div className="hidden lg:block lg:col-span-7 xl:col-span-8 h-[520px] rounded-3xl bg-[var(--bg-card)] border border-[var(--border-default)] animate-pulse" />
        </div>
      </div>
    );
  }

  if (orders.length === 0 && ordersFailed) {
    // v332: the load failed — don't claim "No UGC Orders Found"
    return (
      <div className="text-center py-12 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-default)] p-8 max-w-md mx-auto my-6 shadow-xs" data-testid="brand-ugc-orders-error">
        <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">Couldn't load your orders</h3>
        <p className="text-xs text-[var(--text-tertiary)] max-w-xs mx-auto mb-5 leading-relaxed">Your orders and payments are safe. Please try again in a moment.</p>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-60"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Try again
        </button>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-12 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-default)] p-8 max-w-md mx-auto my-6 shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-[var(--violet-soft)] text-[var(--violet)] flex items-center justify-center mx-auto mb-3 border border-[var(--violet-border)]">
          <Video size={24} />
        </div>
        <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">No UGC Orders Found</h3>
        <p className="text-xs text-[var(--text-tertiary)] max-w-xs mx-auto mb-5 leading-relaxed">
          Create your first brief to recruit verified creators and get UGC videos in 24–72 hours.
        </p>
        <Link
          to="/brand/ugc/post"
          className="inline-flex items-center gap-2 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider shadow-xs active:scale-95 transition-all cursor-pointer"
        >
          <Plus size={14} /> Post your first brief
        </Link>
      </div>
    );
  }

  const renderOrderWorkspaceContent = (selectedOrder) => {
    if (!selectedOrder) return null;
    return (
      <div className="space-y-6">
        {/* Stepper Header */}
        <DealProgressStepper 
          stage={(selectedOrder.closedNoDraft || selectedOrder.isClosed) ? "CLOSED" : selectedOrder.stage} /* v414: closed orders show "Order closed" */
          isCollab={selectedOrder.isCollabOrder} /* v414 */
          utrNumber={selectedOrder.utrNumber} /* v414 */
          orderNumber={selectedOrder.orderNumber}
          brandName={selectedOrder.creatorName}
          brandLogo={selectedOrder.creatorAvatar}
          trackingCode={selectedOrder.orderNumber ? selectedOrder.orderNumber.replace('#', '') : `TRK-${selectedOrder.id}`}
          deadline={selectedOrder.deadline ? new Date(selectedOrder.deadline).toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' }) /* v330: IST, en-IN */ : null}
          title={selectedOrder.title}
          payout={selectedOrder.amount}
        />

        {/* Creator card — session 24 design (real stats only) */}
        <CreatorCard
          variant="expanded"
          creatorId={selectedOrder.creatorId || selectedOrder.raw?.creator_id}
          name={selectedOrder.creatorName}
          avatar={selectedOrder.creatorAvatar}
          status={`${selectedOrder.stage === "COMPLETED" ? "Paid out" : selectedOrder.closedNoDraft ? "Order closed" : "Held with Ybex SafePay"} · ${formatINROrDash(selectedOrder.amount > 0 ? selectedOrder.amount : null)}`} /* v358; v414: dash, not ₹0, when amount unknown */
          onChat={() => {
            const targetId = selectedOrder.threadId || selectedOrder.id || selectedOrder.creatorId;
            navigate(`/brand/inbox/${targetId}`);
          }}
        />

        {/* Live 24H SLA Production Countdown Card */}
        {/* v332: the timer only runs while the draft is still due; once a draft is in it reads "Draft delivered"
            (it showed a red OVERDUE timer on orders waiting for the brand's own review). Hidden for closed orders. */}
        {!selectedOrder.closedNoDraft && (
          <SlaCountdownTimerCard 
            deadline={selectedOrder.deadline} 
            isCompleted={selectedOrder.stage !== "IN_PROGRESS" && selectedOrder.stage !== "REVISION_REQUESTED"} 
            doneLabel={selectedOrder.stage === "COMPLETED" ? "Production Completed" : "Draft delivered"}
            totalHours={deliveryHoursOf((selectedOrder.raw || selectedOrder)?.brief?.delivery_hours ?? (selectedOrder.raw || selectedOrder)?.delivery_hours, orderWindowHours(selectedOrder.raw || selectedOrder))} /* v416: the brief's own 24/48/72h first */
          />
        )}

        {/* Deliverables & Actions Workspace */}
        <div className="space-y-4 pt-2 border-t border-[var(--border-default)]">
          <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider flex items-center gap-1.5">
            <Video size={14} className="text-[var(--violet)]" />
            <span>Creator Deliverables & Production Assets</span>
          </h3>

          {/* Session 25: order closed before a draft */}
          {selectedOrder.closedNoDraft && (
            <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl">
              <h4 className="text-xs font-bold text-slate-900">Order closed — no draft</h4>
              <p className="text-xs text-slate-700 leading-relaxed mt-0.5">
                {selectedOrder.closedReason === "BRAND_CANCELLED"
                  ? "You cancelled this order. The refund for this slot is in progress (1–2 working days)."
                  : selectedOrder.closedReason && String(selectedOrder.closedReason).startsWith("CREATOR_CANCELLED")
                    ? "The creator stepped away before sending a draft. Your brief is back at the top for other creators and the payment stays with Ybex SafePay."
                    : "No draft arrived by the deadline, so this order was closed. Your brief is back at the top for other creators and the payment stays with Ybex SafePay."}
              </p>
            </div>
          )}

          {/* CASE 1: IN PROGRESS */}
          {selectedOrder.stage === "IN_PROGRESS" && !selectedOrder.closedNoDraft && (
            <div className="bg-amber-50 border border-amber-200/80 p-5 rounded-2xl flex items-start gap-3">
              <Clock size={20} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-amber-900">Video Production in Progress</h4>
                <p className="text-xs text-amber-800/90 leading-relaxed mt-0.5">
                  The creator is filming and editing your UGC reel. You will receive a notification as soon as the deliverable link is uploaded.
                </p>
                {/* Session 25 (rule 52): cancel one order — only 24h+ after the claim, no draft, no fee. */}
                <BrandCancelOrderButton order={selectedOrder.raw || selectedOrder} onOpen={() => setCancelOrderTarget(selectedOrder)} />
              </div>
            </div>
          )}
          <Presence>{cancelOrderTarget && (
            <BrandCancelOrderModal key="brandcancelordermodal"
              order={{ ...(cancelOrderTarget.raw || {}), id: cancelOrderTarget.id }}
              amount={cancelOrderTarget.raw?.brief?.budget || cancelOrderTarget.amount}
              onClose={() => setCancelOrderTarget(null)}
              onCancelled={() => { setCancelOrderTarget(null); fetchOrders(); }}
            />
          )}</Presence>

          {/* CASE 2: PENDING REVIEW (Deliverable Submitted) */}
          {(selectedOrder.stage === "IN_REVIEW" || selectedOrder.stage === "PENDING_REVIEW") && (
            <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] p-5 rounded-2xl space-y-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-default)]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                    <PlayCircle size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-primary)]">Deliverable Submitted for Review</h4>
                    <span className="text-[10px] text-[var(--text-tertiary)] font-medium">Uploaded by creator</span>
                  </div>
                </div>

                <button
                  onClick={() => setIsPreviewModalOpen(true)}
                  className="bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <Eye size={14} />
                  <span>Preview & Review Video</span>
                </button>
              </div>

              {/* Video Preview Embed Container */}
              {(selectedOrder.deliverableUrl || selectedOrder.driveUrl) && (
                <div className="rounded-2xl overflow-hidden border border-[var(--border-default)] bg-[var(--bg-elevated)] p-1.5">
                  <VideoEmbedPreview 
                    url={selectedOrder.deliverableUrl || selectedOrder.driveUrl} 
                    isApproved={isDeliverableUnlockedForBrand(selectedOrder)}
                    watermark={!isDeliverableUnlockedForBrand(selectedOrder)}
                  />
                </div>
              )}

              {/* Creator Notes */}
              {selectedOrder.creatorNotes && (
                <div className="p-3 bg-[var(--bg-card)] rounded-xl border border-[var(--border-default)] text-xs text-[var(--text-secondary)]">
                  <span className="font-bold text-[var(--text-primary)] block mb-0.5">Creator Notes:</span>
                  <p>{selectedOrder.creatorNotes}</p>
                </div>
              )}

              {/* Previous Revision Feedback (if creator has resubmitted after changes requested) */}
              {selectedOrder.revisionNotes && (
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-bold uppercase tracking-wider text-[10px]">
                    <AlertCircle size={13} className="text-amber-500 shrink-0" />
                    <span>Previous Revision Requested (Need Changes):</span>
                  </div>
                  <p className="text-[var(--text-primary)] font-medium bg-[var(--bg-card)] p-2.5 rounded-lg border border-amber-500/20">
                    {selectedOrder.revisionNotes}
                  </p>
                </div>
              )}

              {/* Approval & Revision Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-[var(--border-default)]">
                <button
                  type="button"
                  onClick={() => setShowRevisionModal(true)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <RotateCcw size={14} />
                  <span>Request Revision</span>
                </button>

                {selectedOrder.isCollabOrder ? (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmSheet({ title: "Approve this draft?", body: `The creator will be notified to publish the post and submit their live link. ${APPROVE_NOTICE}`, confirmLabel: "Approve draft", onConfirm: () => handleApprove(selectedOrder.id, 'approve_draft') });
                    }}
                    disabled={approvingId === selectedOrder.id}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                    title="Approve video draft and notify creator to post & submit live link"
                  >
                    {approvingId === selectedOrder.id ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        <span>Approve Video Draft</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowPayoutModal(true)}
                    disabled={approvingId === selectedOrder.id}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {approvingId === selectedOrder.id ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        <span>Approve & Release Payout{payoutSuffix(selectedOrder.amount) /* v415: no "(₹0)" */}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* CASE 2B: AWAITING LIVE LINK (Draft Approved, Waiting for Creator to Post & Submit Link) */}
          <AwaitingLiveLinkPanel isDeliverableUnlockedForBrand={isDeliverableUnlockedForBrand} navigate={navigate} selectedOrder={selectedOrder} setIsPreviewModalOpen={setIsPreviewModalOpen} />

          {/* CASE 2B: REVISION REQUESTED ON LIVE LINK */}
          {selectedOrder.stage === "REVISION_REQUESTED_LINKS" && (
            <div className="bg-[var(--bg-elevated)] border border-amber-500/30 p-5 rounded-2xl space-y-4 shadow-xs relative overflow-hidden text-left">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-default)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 flex items-center justify-center shrink-0">
                    <RotateCcw size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-[var(--text-primary)]">Live Link Revision Requested</h4>
                      <span className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md uppercase tracking-wider font-extrabold">
                        Draft Approved
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-tertiary)] font-medium mt-0.5">
                      Video draft is approved. You requested an updated or corrected live post link from the creator.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const targetId = selectedOrder.threadId || selectedOrder.id;
                    navigate(`/brand/inbox/${targetId}`);
                  }}
                  className="bg-[var(--bg-card)] hover:bg-[var(--border-default)] text-[var(--text-primary)] border border-[var(--border-default)] font-bold px-3.5 py-2 rounded-xl text-xs uppercase tracking-wider transition-all shadow-xs active:scale-95 cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <MessageCircle size={14} className="text-[var(--violet)]" />
                  <span>Chat with Creator</span>
                </button>
              </div>

              {/* Revision Feedback Note Display */}
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-bold uppercase tracking-wider text-[10px]">
                  <AlertCircle size={13} className="text-amber-500 shrink-0" />
                  <span>Revision Instructions Sent to Creator:</span>
                </div>
                <p className="text-xs text-[var(--text-primary)] font-semibold bg-[var(--bg-card)] p-2.5 rounded-lg border border-amber-500/20 leading-relaxed">
                  {selectedOrder.revisionNotesLinks || selectedOrder.revisionNotes || "No notes were added to this request."}{/* v332: the fallback isn't an instruction you sent */}
                </p>
              </div>

              {/* Previously Submitted Link if available */}
              {selectedOrder.liveLink && (
                <div className="p-3 bg-[var(--bg-card)] rounded-xl border border-[var(--border-default)] flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] text-[var(--text-tertiary)] shrink-0">Previous Link:</span>
                    <span className="font-mono text-xs text-[var(--text-secondary)] truncate">{selectedOrder.liveLink}</span>
                  </div>
                  <a 
                    href={selectedOrder.liveLink} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[var(--violet)] hover:underline text-xs font-semibold shrink-0"
                  >
                    View ↗
                  </a>
                </div>
              )}
            </div>
          )}

          {/* CASE 2C: LIVE LINK SUBMITTED (Review Live Post Proof & Release Escrow) */}
          {selectedOrder.stage === "LIVE_LINK_SUBMITTED" && (
            <div className="bg-[var(--bg-elevated)] border border-[#7C3AED]/30 p-5 rounded-2xl space-y-4 shadow-xs relative overflow-hidden text-left">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#7C3AED] to-[#7C3AED]" />
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-default)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#7C3AED]/15 border border-[#7C3AED]/30 text-[#7C3AED] flex items-center justify-center shrink-0">
                    <LinkIcon size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-[var(--text-primary)]">Live Post Submitted for Verification</h4>
                      <span className="text-[10px] text-[#6D28D9] dark:text-indigo-400 bg-[#7C3AED]/15 border border-[#7C3AED]/30 px-2 py-0.5 rounded-md uppercase tracking-wider font-extrabold">
                        Live Proof Ready
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-tertiary)] font-medium mt-0.5">
                      Verify the live social post before approving and releasing the final payout
                    </p>
                  </div>
                </div>
              </div>

              {/* Live Link Card */}
              <LiveLinkCard livePostPlatform={livePostPlatform} selectedOrder={selectedOrder} />

              {/* A live post link points at a social page, not at a media file, so the video
                  embed cannot render it — it just produced an empty box. Only embed when the
                  link really is a media file; otherwise the card above already gives the brand
                  the URL, a copy button and an Open button. */}
              {selectedOrder.liveLink && /\.(mp4|mov|webm|m4v)(\?|$)/i.test(selectedOrder.liveLink) && (
                <div className="rounded-2xl overflow-hidden border border-[var(--border-default)] bg-[var(--bg-elevated)] p-1.5">
                  <VideoEmbedPreview 
                    url={selectedOrder.liveLink} 
                    isApproved
                    watermark={false}
                  />
                </div>
              )}

              {/* Approval & Revision Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-[var(--border-default)]">
                <button
                  type="button"
                  onClick={() => setShowRevisionModal(true)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <RotateCcw size={14} />
                  <span>Request Revision</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    // This panel only became reachable once REVISION_DECLINED was made a real
                    // phase, and it was the one approve button that never learnt the collab
                    // rule: it opened the payout modal unconditionally, and that modal always
                    // sends 'approve_live_links'. On a collaboration order with no live post
                    // that released the full escrow for something never published.
                    if (selectedOrder.isCollabOrder && !selectedOrder.liveLink) {
                      setConfirmSheet({ title: "Approve this draft?", body: `The creator will be notified to publish the post and submit their live link. The payout stays held by Ybex until you approve that link. ${APPROVE_NOTICE}`, confirmLabel: "Approve draft", onConfirm: () => handleApprove(selectedOrder.id, 'approve_draft') });
                    } else {
                      setShowPayoutModal(true);
                    }
                  }}
                  disabled={approvingId === selectedOrder.id}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {approvingId === selectedOrder.id ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>
                        {selectedOrder.isCollabOrder && !selectedOrder.liveLink
                          ? "Approve Draft"
                          : `Approve & Release Payout${payoutSuffix(selectedOrder.amount) /* v415 */}`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* CASE 3: REVISION REQUESTED */}
          <RevisionRequestedPanel navigate={navigate} selectedOrder={selectedOrder} />

          {/* CASE 3B: REVISION DECLINED BY CREATOR */}
          {selectedOrder.stage === "REVISION_DECLINED" && (
            <div className="bg-[var(--bg-elevated)] border border-rose-500/30 p-5 rounded-2xl space-y-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-red-600" />
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-default)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 flex items-center justify-center shrink-0">
                    <AlertCircle size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-primary)]">
                      {selectedOrder.isLiveLinkDeclined ? "Live Link Correction Declined" : "Revisions Declined"}
                    </h4>
                    <span className="text-[10px] text-rose-500 uppercase tracking-wider font-extrabold">
                      {selectedOrder.isLiveLinkDeclined ? "Creator Declined Link Correction" : "Creator Declined Changes"}
                    </span>
                  </div>
                </div>

                {(selectedOrder.deliverableUrl || selectedOrder.driveUrl) && (
                  <button
                    onClick={() => setIsPreviewModalOpen(true)}
                    className="bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
                  >
                    <Eye size={14} />
                    <span>Preview Video Draft</span>
                  </button>
                )}
              </div>

              {/* Creator Decline Reason Note */}
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-[var(--text-primary)] font-semibold leading-relaxed">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-rose-500 mb-1">
                  {selectedOrder.isLiveLinkDeclined ? "Creator Live Link Decline Reason:" : "Decline Reason:"}
                </span>
                {/* v332: quotes only around the creator's real words, not around our fallback line */}
                <p>{(selectedOrder.declineReason || selectedOrder.declineNotesLinks) ? `"${selectedOrder.declineReason || selectedOrder.declineNotesLinks}"` : "The creator didn't add a reason."}</p>
              </div>

              {/* Submitted Live Link (if present) */}
              {selectedOrder.liveLink && (
                <div className="p-3 bg-[var(--bg-card)] rounded-xl border border-[var(--border-default)] flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] text-[var(--text-tertiary)] shrink-0 font-medium">Submitted Link:</span>
                    <span className="font-mono text-xs text-[var(--text-secondary)] truncate">{selectedOrder.liveLink}</span>
                  </div>
                  <a 
                    href={selectedOrder.liveLink} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[var(--violet)] hover:underline text-xs font-semibold shrink-0"
                  >
                    Open Post ↗
                  </a>
                </div>
              )}

              {/* Creator's original submission notes (if present), clearly separated */}
              {selectedOrder.creatorNotes && (
                <div className="p-3 bg-[var(--bg-card)] rounded-xl border border-[var(--border-default)] text-xs text-[var(--text-secondary)]">
                  <span className="font-bold text-[var(--text-primary)] block mb-0.5">Original Creator Notes (Submission):</span>
                  <p>{selectedOrder.creatorNotes}</p>
                </div>
              )}

              {/* Video Preview Embed Container if deliverable exists */}
              {(selectedOrder.deliverableUrl || selectedOrder.driveUrl) && (
                <div className="rounded-2xl overflow-hidden border border-[var(--border-default)] bg-[var(--bg-elevated)] p-1.5">
                  <VideoEmbedPreview 
                    url={selectedOrder.deliverableUrl || selectedOrder.driveUrl} 
                    isApproved={false}
                    watermark={true}
                  />
                </div>
              )}

              {/* 3 Action Buttons for Brand */}
              <div className="pt-3 border-t border-[var(--border-default)]">
                <div className="flex flex-col gap-2.5 w-full">
                  {/* Top Row: 2 Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                    {/* 1: Contact Support (White background) */}
                    <button
                      type="button"
                      onClick={() => setIsSupportModalOpen(true)}
                      className="w-full py-2.5 px-3 bg-white dark:bg-[var(--bg-elevated)] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-98"
                      title="Contact Ybex Dispute Mediation for support"
                    >
                      <ShieldAlert size={14} className="text-slate-600 dark:text-slate-300 shrink-0" />
                      <span className="truncate">Contact Support</span>
                    </button>

                    {/* 2: Re-request Changes (Yellow background) */}
                    <button
                      type="button"
                      onClick={() => setShowRevisionModal(true)}
                      className="w-full py-2.5 px-3 bg-amber-100 hover:bg-amber-200 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-500/40 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-98"
                      title="Re-request revision with updated details"
                    >
                      <RefreshCw size={14} className="text-amber-700 dark:text-amber-300 shrink-0" />
                      <span className="truncate">Re-request Changes</span>
                    </button>
                  </div>

                  {/* 3: Approve & Release Payout (Large Green Button) */}
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedOrder.isCollabOrder && !selectedOrder.liveLink) {
                        setConfirmSheet({ title: "Approve this draft?", body: `The creator will be notified to publish the post and submit their live link. ${APPROVE_NOTICE}`, confirmLabel: "Approve draft", onConfirm: () => handleApprove(selectedOrder.id, 'approve_draft') });
                      } else {
                        setShowPayoutModal(true);
                      }
                    }}
                    disabled={approvingId === selectedOrder.id}
                    className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-600/15 flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-60 disabled:cursor-not-allowed"
                    title="Accept deliverable draft and release payout"
                  >
                    {approvingId === selectedOrder.id ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        {/* v330: on a collab order with no live post this button only approves the draft — say so */}
                        <span>{selectedOrder.isCollabOrder && !selectedOrder.liveLink ? "Approve Draft" : `Approve & Release Payout${payoutSuffix(selectedOrder.amount) /* v415 */}`}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CASE 4: APPROVED OR COMPLETED */}
          <ApprovedCompletedPanel selectedOrder={selectedOrder} />

        </div>
      </div>
    );
  };

  return (
    <div className={`w-full space-y-6 ${embedded ? "" : "max-w-none px-4 sm:px-8 pt-6 pb-28 min-h-screen bg-[var(--bg-base)]"}`}>
      
      {headerRow /* v415: same header in the loading skeleton, so it never moves · v416 (U33): pb-28 keeps the last card clear of the Eva button */}

      {/* Main Split Grid Layout (Left: Orders List | Right: Workspace & Review Actions) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Orders List (4 Cols) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-3">{/* v415: wider list at 1024–1440px */}
          
          {/* Search & Filters */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={14} />
              <input
                type="text"
                placeholder="Search by title or creator..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full min-h-[40px] pl-9 pr-3 py-2 bg-[var(--bg-card)] rounded-xl text-base md:text-xs font-medium text-[var(--text-primary)] border border-[var(--border-default)] outline-none focus:border-[var(--violet)] transition-all"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filter orders">{/* v415: chips wrap instead of being cut off ("C…") */}
              {[
                { id: "all", label: "All" },
                { id: "pending_review", label: "Review" },
                { id: "in_production", label: "In Production" },
                { id: "CHANGES_REQUESTED", label: "Revision" },
                { id: "completed", label: "Completed" }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  aria-pressed={activeFilter === f.id}
                  className={`px-3 min-h-[30px] rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                    activeFilter === f.id
                      ? "bg-[var(--violet)] text-white shadow-xs"
                      : "bg-[var(--bg-card)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border-default)]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {briefFilter && (
              /* v416 (U27): "Manage Orders" on a brief shows only that brief's orders */
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--violet-soft)] border border-[var(--violet-border)] text-xs" data-testid="ugc-orders-brief-filter">
                <span className="min-w-0 truncate text-[var(--text-secondary)]">Brief: <b className="text-[var(--text-primary)]">{(briefs.find((b) => String(b.id) === String(briefFilter)) || {}).title || "Selected brief"}</b></span>
                <button type="button" onClick={() => setBriefFilter("")} className="shrink-0 min-h-[32px] px-2.5 rounded-lg font-bold text-[var(--violet)] hover:bg-white/60 cursor-pointer">Show all</button>
              </div>
            )}
          </div>

          {/* Cards List */}
          <div className="space-y-3 lg:max-h-[calc(100vh-240px)] lg:overflow-y-auto pr-1">{/* v415: list scrolls with the window height, not a fixed 750px */}
            {filteredOrders.length === 0 ? (
              <div className="p-8 text-center bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl">
                <p className="text-xs text-[var(--text-tertiary)] font-medium">{briefFilter && !searchQuery.trim() && activeFilter === "all" ? "No creator has claimed this brief yet, so it has no orders." : "No orders match this filter."}{/* v416 (U27) */}</p>
              </div>
            ) : (
              filteredOrders.map((o) => {
                const isSelected = selectedOrder && String(selectedOrder.id) === String(o.id);

                return (
                  <div
                    key={o.id}
                    onClick={() => setSelectedOrderId(o.id)}
                    role="button" // v330: keyboard reachable
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedOrderId(o.id); } }}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                      isSelected
                        ? "bg-[var(--bg-card)] border-[var(--violet)] shadow-md ring-2 ring-[var(--violet)]/20"
                        : "bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] border-[var(--border-default)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] overflow-hidden flex items-center justify-center shrink-0">
                          {o.creatorAvatar ? (
                            <img src={o.creatorAvatar} alt={o.creatorName} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} /* v330 */ />
                          ) : (
                            <User size={18} className="text-[var(--text-tertiary)]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-[var(--text-primary)] line-clamp-2 leading-tight">{o.title}</h4>
                          <span className="text-[10px] text-[var(--text-tertiary)] font-medium block truncate">
                            {o.creatorName} • {o.orderNumber}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[var(--border-default)]">
                      <div>
                        <span className="text-[11px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider block">{o.closedNoDraft ? "Order amount" : o.stage === "COMPLETED" ? "Paid" : "Payment Hold Amount"}{/* v358 */}</span>
                        <span className="text-xs font-black font-mono text-[var(--text-primary)]">{formatINROrDash(o.amount > 0 ? o.amount : null) /* v414: dash, not ₹0 */}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <DeliverableBadge deliverableType={o.deliverableType} size="xs" />
                        {o.closedNoDraft ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">Closed</span>
                        ) : getStageBadge(o.stage)}{/* v358: cancelled / expired orders said "In Production" */}
                      </div>
                    </div>

                    {o.stage === "IN_PROGRESS" && !o.closedNoDraft && o.deadline && ( /* v358: no "Past deadline" timer on a closed order */
                      <div className="mt-2.5 pt-2 border-t border-[var(--border-default)] flex justify-between items-center">
                        <span className="text-[11px] text-[var(--text-tertiary)] font-bold uppercase">Draft due:</span>
                        <MiniCountdown deadline={o.deadline} />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Order Workspace & Deliverable Review (Desktop: 8 Cols | Mobile: Slide-Up Drawer Modal) */}
        <div className="hidden lg:block lg:col-span-7 xl:col-span-8">
          {!selectedOrder ? (
            // v415: a helpful empty state (was a lone grey sentence in a big box)
            <div className="bg-[var(--bg-card)] border border-dashed border-[var(--border-default)] rounded-3xl px-10 py-16 text-center flex flex-col items-center">
              <div className="w-12 h-12 rounded-2xl bg-[var(--violet-soft)] text-[var(--violet)] border border-[var(--violet-border)] flex items-center justify-center mb-3">
                <Video size={22} />
              </div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">Pick an order to open it</h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-sm">Watch the creator's draft, ask for changes, or approve it and release the payment — all from here.</p>
              {filteredOrders[0] && (
                <button type="button" onClick={() => setSelectedOrderId(filteredOrders[0].id)} className="mt-5 inline-flex items-center gap-1.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white px-4 min-h-[40px] rounded-xl text-xs font-bold transition-colors cursor-pointer max-w-full">
                  <Eye size={14} className="shrink-0" /> <span className="truncate">Open “{filteredOrders[0].title}”</span>
                </button>
              )}
            </div>
          ) : (
            <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl p-6 md:p-8 space-y-6 shadow-sm">
              {renderOrderWorkspaceContent(selectedOrder)}
            </div>
          )}
        </div>

      </div>

      {/* MOBILE ORDER WORKSPACE SLIDE-UP DRAWER MODAL */}
      {/* v332: approve buttons above now look disabled while an approval is running */}
      <AnimatePresence>
        <Presence>{selectedOrder && (
          <PopupBackdrop className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end bg-black/60 backdrop-blur-xs">
            <PopupPanel kind="sheet"
              className="w-full bg-[var(--bg-card)] border-t border-[var(--border-default)] rounded-t-3xl max-h-[88vh] max-h-[88dvh] overflow-y-auto p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-5 shadow-2xl relative" /* v330 */
            >
              {/* Drawer Header with Drag indicator & Close Button */}
              <div className="sticky top-0 z-20 -mt-2 -mx-2 pt-2 pb-3 bg-[var(--bg-card)] border-b border-[var(--border-default)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-1 bg-[var(--border-default)] rounded-full mx-auto" />
                  <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Order details</span>{/* v415: plain words */}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrderId(null)}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--bg-elevated)] hover:bg-[var(--border-default)] text-[var(--text-primary)] transition-colors cursor-pointer" /* v415: 40px */
                  title="Close workspace"
                  aria-label="Close workspace" // v330
                >
                  <X size={18} />
                </button>
              </div>

              {/* Workspace Content */}
              {renderOrderWorkspaceContent(selectedOrder)}
            </PopupPanel>
          </PopupBackdrop>
        )}</Presence>
      </AnimatePresence>
      {/* REVISION REQUEST MODAL */}
      <Presence>{showRevisionModal && selectedOrder && (() => {
        const isLiveLinkMode = Boolean(
          selectedOrder.isLiveLinkDeclined ||
          selectedOrder.stage === "LIVE_LINK_SUBMITTED" ||
          selectedOrder.stage === "AWAITING_LIVE_LINK" ||
          selectedOrder.stage === "REVISION_REQUESTED_LINKS"
        );

        return (
          <PopupBackdrop key="brand-revision-modal" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) closeRevision(); }}>{/* v415: closes with an animation, on backdrop click and Escape */}
            <OrderModalPanel handleSubmitRevision={handleSubmitRevision} isLiveLinkMode={isLiveLinkMode} revisionNotes={revisionNotes} selectedOrder={selectedOrder} setRevisionNotes={setRevisionNotes} setShowRevisionModal={setShowRevisionModal} submittingRevision={submittingRevision} />
          </PopupBackdrop>
        );
      })()}</Presence>

      {selectedOrder && (
        <UniversalPreviewModal
          isOpen={isPreviewModalOpen}
          onClose={() => setIsPreviewModalOpen(false)}
          url={selectedOrder.deliverableUrl || selectedOrder.driveUrl}
          notes={selectedOrder.creatorNotes}
          title={`${selectedOrder.title} • Video Deliverable`}
          creatorName={selectedOrder.creatorName}
          isBrand={true}
          isApproved={isDeliverableUnlockedForBrand(selectedOrder)}
          onApprove={() => {
            setIsPreviewModalOpen(false);
            if (selectedOrder.isCollabOrder && !selectedOrder.liveLink) {
              setConfirmSheet({ title: "Approve this draft?", body: `The creator will be notified to publish the post and submit their live link. ${APPROVE_NOTICE}`, confirmLabel: "Approve draft", onConfirm: () => handleApprove(selectedOrder.id, 'approve_draft') });
            } else {
              setShowPayoutModal(true);
            }
          }}
          onRequestChanges={() => {
            setIsPreviewModalOpen(false);
            setShowRevisionModal(true);
          }}
        />
      )}

      {/* Dispute / Mediation Support Modal */}
      {selectedOrder && (
        <OrderSupportModal
          isOpen={isSupportModalOpen}
          onClose={() => setIsSupportModalOpen(false)}
          thread={selectedOrder.raw} /* v358: the modal reads `thread` (order= was ignored → "ORD-PENDING") */
          threadId={selectedOrder.threadId}
          isUserBrand={true}
          onTicketCreated={() => {
            fetchOrders();
          }}
        />
      )}

      {/* Payout Release Confirmation Modal */}
      <Presence>{showPayoutModal && selectedOrder && (
        <PopupBackdrop className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <PopupPanel kind="modal" role="dialog" aria-modal="true" aria-label="Approve and release payment" className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-5 text-left relative overflow-y-auto max-h-[90dvh]">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-default)]">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Approve & release payment</h3>
                  <span className="text-[11px] text-[var(--text-tertiary)] font-medium">
                    Order {selectedOrder.orderNumber}
                  </span>
                </div>
              </div>
              <button
                onClick={closePayout}
                disabled={approvingId === selectedOrder.id} /* v415: not while releasing */
                aria-label="Close" // v330 · v332: 40px
                className="w-10 h-10 rounded-full hover:bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-tertiary)] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="bg-[var(--bg-elevated)] p-4 rounded-2xl border border-[var(--border-default)] space-y-2.5 text-xs">
              <div className="flex justify-between items-center text-[var(--text-secondary)]">
                <span>Order amount (held with Ybex SafePay)</span>
                <span className="font-bold text-[var(--text-primary)] font-mono">{formatINROrDash(selectedOrder.amount > 0 ? selectedOrder.amount : null) /* v415: "—", never ₹0 */}</span>
              </div>
              {/* The brand is charged no platform fee — the commission comes out of the
                  creator's side at payout. Showing the brand a "- ₹350 commission" line was
                  simply wrong: it is not deducted from anything they pay. The backend fee
                  calculation is untouched; only this display changed. */}
              <div className="flex justify-between items-center text-emerald-600 font-medium">
                <span>Platform Fee:</span>
                <span className="font-bold font-mono">₹0 (Zero Fee)</span>
              </div>
              <div className="pt-2 border-t border-[var(--border-default)] flex justify-between items-center font-bold">
                <span className="text-[var(--text-primary)]">Released to the creator</span>
                <span className="text-emerald-700 text-sm font-mono">
                  {formatINROrDash(selectedOrder.amount > 0 ? selectedOrder.amount : null) /* v415 */}
                </span>
              </div>
            </div>

            {/* This is the point of no return — money leaves escrow the moment the button is
                pressed. It was previously tertiary grey text and read as boilerplate. */}
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 flex items-start gap-2.5">
              <AlertTriangle size={15} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <p className="text-[11.5px] text-rose-600 dark:text-rose-400 font-semibold leading-relaxed">
                {/* v332: raw / edited UGC orders have no live post */}
                By confirming, you approve the creator's {selectedOrder.isCollabOrder ? "live post submission" : "video"}. The payment
                {selectedOrder.amount > 0 ? <>{" "}of <strong className="font-mono font-black">{formatINROrDash(selectedOrder.amount)}</strong></> : null}{/* v415: no "₹0" */}{" "}
                is released — Ybex pays it to the creator's bank (usually 1–2 working days). This cannot be undone.{/* v358: there is no creator wallet */}
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closePayout}
                disabled={approvingId === selectedOrder.id} /* v415 */
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={approvingId === selectedOrder.id}
                onClick={() => handleApprove(selectedOrder.id, 'approve_live_links')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >{/* v330: visibly disabled while releasing */}
                {approvingId === selectedOrder.id ? (
                  <><RefreshCw size={14} className="animate-spin" /><span>Releasing…</span></> /* v415: say what is happening */
                ) : (
                  <>
                    <CheckCircle2 size={15} />
                    <span>Confirm & release</span>
                  </>
                )}
              </button>
            </div>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      <UgcConfirmSheet sheet={confirmSheet} onClose={() => setConfirmSheet(null)} />{/* v416 */}
    </div>
  );
}

export default function BrandUGCOrders({ embedded = false }) {
  const isMobile = useIsMobile();
  if (!embedded && isMobile) {
    return <BrandUGCMobile initialTab="orders" initialView="main" />;
  }
  return <BrandUGCOrdersDesktop embedded={embedded} />;
}
