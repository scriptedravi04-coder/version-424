import { checkLiveLink } from "../../utils/liveLinkCheck";
import React, { useEffect, useState, useMemo, useRef } from "react";
import { retentionLine } from "../../lib/fileRetention";
import { compareOrdersForWork } from "../../utils/orderSort";
import { formatAmount, safeLower } from "../../utils/safeFormat";
import { useNavigate, useSearchParams } from "react-router-dom";
import { acquireSocket } from "../../lib/sharedSocket";
import { api } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Briefcase, FileText, RefreshCw, Search, Video, Check, X, Upload, ExternalLink, AlertTriangle, CheckCircle2, Lock, Zap, MessageCircle, Maximize2, AlertCircle, RotateCcw, Link as LinkIcon } from "lucide-react";
import DealProgressStepper from "../../components/deals/DealProgressStepper";
import UGCContractModal from "../../components/chat/UGCContractModal";
import VideoEmbedPreview from "../../components/shared/VideoEmbedPreview";
import UniversalPreviewModal from "../../components/shared/UniversalPreviewModal";
import { DeliverableBadge } from "../../components/ugc/DeliverableBadge";
import { mediaHref } from "../../lib/mediaUrl";
import CreatorCancelOrderSheet from "../../components/ugc/CreatorCancelOrderSheet";
import { creatorCancelInfo } from "../../utils/ugcOrderCancel";

import { Presence, PopupBackdrop, PopupPanel, appConfirm } from "../../components/common/Popup";
import BriefProductInfo from "./manageUgc/BriefProductInfo";
import DeclineRevisionsModal from "./manageUgc/DeclineRevisionsModal";
import DropUploadBox from "./manageUgc/DropUploadBox";
import RevisionAlertHeader from "./manageUgc/RevisionAlertHeader";
import StageInProgress from "./manageUgc/StageInProgress";
import StageInReview from "./manageUgc/StageInReview";
import StageLiveLinkSubmitted from "./manageUgc/StageLiveLinkSubmitted";
import StageCompleted from "./manageUgc/StageCompleted";
import { safeExt } from "../../lib/fileExt";
import { initialsAvatarUrl } from "../../utils/initials"; // v423 (S11): no third-party avatar service
// Every stage that has a panel below. Kept next to the panels so adding one without adding a
// panel (or the reverse) shows up as a fallback card instead of an empty screen.
const HANDLED_ORDER_STAGES = [
  "PENDING_SIGNATURE",
  "IN_PROGRESS",
  "IN_REVIEW",
  "REVISION_REQUESTED",
  "REVISION_REQUESTED_LINKS",
  "REVISION_DECLINED",
  "REVISION_DECLINED_LINKS",
  "COMPLETED_APPROVAL",
  "AWAITING_LIVE_LINK",
  "LIVE_LINK_SUBMITTED",
  "COMPLETED",
  "EXPIRED"
];

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

// Local Mini Countdown component
function MiniCountdown({ deadline }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    if (!deadline) return;

    const updateTimer = () => {
      const diff = new Date(deadline).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("Deadline passed"); // v332: plainer wording
        setIsUrgent(true);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h left`);
      } else {
        setTimeLeft(`${hours}h ${minutes}m left`);
      }
      setIsUrgent(diff < 24 * 60 * 60 * 1000);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000);
    return () => clearInterval(interval);
  }, [deadline]);

  if (!deadline) return null;

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
      isUrgent ? "bg-rose-50 text-rose-600 border border-rose-200 animate-pulse" : "bg-emerald-50 text-emerald-600 border border-emerald-200"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isUrgent ? "bg-rose-500 animate-ping" : "bg-emerald-500"}`} />
      <span>{timeLeft}</span>
    </div>
  );
}

export default function ManageUGCOrdersView({ initialOrderId = null, onSelectBriefToExplore = null }) {
  const navigate = useNavigate();
  // Guards the live-link forms against a double click or an impatient second tap. Removing
  // the retry above stops one source of duplicate submissions; this stops the other.
  const [searchParams] = useSearchParams();
  const effectiveInitialOrderId = initialOrderId || searchParams.get("orderId");
  const [submittingLiveLink, setSubmittingLiveLink] = useState(false);
  const [cancellingClaim, setCancellingClaim] = useState(false); // v332: "Cancel Claim" could be tapped twice
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false); // v330: failed load ≠ "No orders yet"
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all"); // "all" | "active" | "in_review" | "completed"
  const [selectedOrderId, setSelectedOrderId] = useState(effectiveInitialOrderId);
  const [appliedOrderId, setAppliedOrderId] = useState(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(Boolean(effectiveInitialOrderId));
  
  // Signature modal state
  const [signingOrder, setSigningOrder] = useState(null);
  const [cancelOrder, setCancelOrder] = useState(null); // session 25: signed-order cancel

  // Decline changes modal state
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [declining, setDeclining] = useState(false);
  const [declineMode, setDeclineMode] = useState("draft"); // "draft" | "links"
  const [showReuploadForm, setShowReuploadForm] = useState(false);
  const [showLiveLinkCorrectionForm, setShowLiveLinkCorrectionForm] = useState(false);

  // Deliverables upload form state
  const [selectedFile, setSelectedFile] = useState(null);
  const [driveUrl, setDriveUrl] = useState("");
  const [creatorNotes, setCreatorNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");

  const fileInputRef = useRef(null);

  const handleDeclineChanges = async (e) => {
    if (e) e.preventDefault();
    if (!selectedOrder) return;
    if (!declineReason.trim()) {
      toast.error("Please provide a reason for declining revisions.");
      return;
    }
    setDeclining(true);
    try {
      const endpoint = (declineMode === "links" || selectedOrder.stage === "REVISION_REQUESTED_LINKS")
        ? `/ugc/orders/${selectedOrder.id}/decline-live-links-resubmission`
        : `/ugc/orders/${selectedOrder.id}/decline-revisions`;

      await api.post(endpoint, { feedback: declineReason.trim() });
      toast.success(declineMode === "links" 
        ? "Live link correction declined. Brand has been notified!" 
        : "Revisions declined successfully. Brand has been notified!");
      setShowDeclineModal(false);
      setDeclineReason("");
      loadOrders();
    } catch (e) {
      toast.error(e.response?.data?.error || "Couldn't send that. Please try again."); // v332: no raw error text
    } finally {
      setDeclining(false);
    }
  };

  // v332: the 30-second background refresh is silent (it showed a "Failed to load" toast every 30 s
  // while offline) and the result is returned so "Refresh" only says "updated" when it worked.
  const loadOrders = async (opts) => {
    const silent = opts?.silent === true;
    try {
      if (!silent) setLoading(true); // v414: silent 30s poll no longer flips the empty state to a spinner
      const res = await api.get("ugc/orders/creator");
      const fetchedOrders = Array.isArray(res.data) ? res.data : [];
      setOrders(fetchedOrders);
      setLoadFailed(false);

      // Auto select first order or initialOrderId
      if (fetchedOrders.length > 0) {
        const match = initialOrderId ? fetchedOrders.find(o => 
          String(o.id) === String(initialOrderId) || 
          String(o.deal_id) === String(initialOrderId) || 
          String(o.brief_id) === String(initialOrderId) ||
          String(o.brief?.id) === String(initialOrderId)
        ) : null;

        if (match) {
          setAppliedOrderId(match.id);
          setSelectedOrderId(match.id);
          setMobileDrawerOpen(true);
        } else {
          setSelectedOrderId(prev => prev && fetchedOrders.some(o => String(o.id) === String(prev)) ? prev : fetchedOrders[0].id);
        }
      } else {
        setSelectedOrderId(null);
      }
      return true;
    } catch (err) {
      console.error("Error loading UGC orders:", err);
      setLoadFailed(true);
      if (!silent) toast.error("Couldn't load your UGC orders. Please try again.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
    const interval = setInterval(() => { if (!document.hidden) loadOrders({ silent: true }); }, 90000); // v422: was 30 s

    // Socket.io real-time listener for instant order/thread status updates
    let socket;
    try {
      // Session 36: shared connection (src/lib/sharedSocket.js) instead of one more socket per screen.
      socket = acquireSocket();
      socket.on("ugc_order_updated", (payload) => {
        if (payload?.orderId) {
          setOrders(prev => prev.map(o => {
            if (String(o.id) === String(payload.orderId)) {
              return {
                ...o,
                ...(payload.order || {}),
                status: payload.status || o.status,
                payment_status: payload.payment_status || o.payment_status,
                stage: payload.stage || o.stage
              };
            }
            return o;
          }));
        }
      });
      socket.on("thread_updated", (payload) => {
        if (payload?.threadId) {
          setOrders(prev => prev.map(o => {
            if (String(o.id) === String(payload.threadId) || String(o.thread_id) === String(payload.threadId)) {
              const isDone = payload.status === 'COMPLETED' || payload.flow_state === 'COMPLETED';
              return {
                ...o,
                thread_status: payload.status,
                thread_flow_state: payload.flow_state,
                status: isDone ? 'COMPLETED' : o.status,
                payment_status: isDone ? 'RELEASED' : o.payment_status,
                stage: isDone ? 'COMPLETED' : o.stage
              };
            }
            return o;
          }));
        }
      });
    } catch (e) {
      console.warn("Socket initialization error in ManageUGCOrdersView:", e);
    }

    return () => {
      clearInterval(interval);
      if (socket) socket.release();
    };
  }, []);

  useEffect(() => {
    if (initialOrderId && orders.length > 0) {
      const match = orders.find(o => 
        String(o.id) === String(initialOrderId) || 
        String(o.deal_id) === String(initialOrderId) || 
        String(o.brief_id) === String(initialOrderId) ||
        String(o.brief?.id) === String(initialOrderId)
      );
      if (match) {
        setSelectedOrderId(match.id);
        setMobileDrawerOpen(true);
      }
    }
  }, [initialOrderId, orders]);

  const handleRefresh = async () => {
    setRefreshing(true);
    const ok = await loadOrders();
    setRefreshing(false);
    if (ok) toast.success("UGC orders updated"); // v332: no "updated" toast when the refresh failed
  };

  // Process & map raw UGC orders
  const mappedOrders = useMemo(() => {
    return (orders || []).map(o => {
      const rawStatus = (o.status || '').toUpperCase();
      const creatorStatus = (o.creator_status || o.status || '').toUpperCase();
      const paymentStatus = (o.payment_status || '').toUpperCase();
      const thrStatus = (o.thread_status || '').toUpperCase();
      const thrFlow = (o.thread_flow_state || '').toUpperCase();
      const orderStage = (o.stage || '').toUpperCase();
      // v419 (QA): same rule as the phone (CreatorUGCMobile) — only an explicit false/null is "not signed"; a missing
      // field used to show "Verify OTP & sign" on desktop while the phone showed the same order as signed.
      const signFlag = o.agreement_signed_creator !== undefined ? o.agreement_signed_creator : o.raw?.agreement_signed_creator;
      const isSigned = signFlag === true || signFlag === undefined || Boolean(o.video_url || o.submission_link || o.drive_url);

      if (creatorStatus === 'CANCELLED') {
        return null;
      }

      const deliverableType = String(
        o.deliverable_type || 
        o.brief?.deliverable_type || 
        o.raw?.deliverable_type || 
        (o.is_collaboration ? "collaboration_reel" : (o.is_raw ? "ugc_video_raw" : "ugc_video_edited"))
      ).toLowerCase();

      const isCollabOrder = o.requires_live_link !== undefined
        ? Boolean(o.requires_live_link)
        : (o.is_collaboration !== undefined
          ? Boolean(o.is_collaboration)
          : (deliverableType.includes('collab') || deliverableType.includes('reel')));

      const isRevisionRequestedLinks = isCollabOrder && (
        creatorStatus === 'REVISION_REQUESTED_LINKS' ||
        rawStatus === 'REVISION_REQUESTED_LINKS' ||
        thrFlow === 'REVISION_REQUESTED_LINKS' ||
        orderStage === 'REVISION_REQUESTED_LINKS'
      );

      const isRevisionDeclined = (
        creatorStatus === 'REVISION_DECLINED' ||
        creatorStatus === 'DISPUTED' ||
        rawStatus === 'REVISION_DECLINED' ||
        rawStatus === 'DISPUTED' ||
        thrFlow === 'REVISION_DECLINED' ||
        orderStage === 'REVISION_DECLINED'
      );

      const isRevisionDeclinedLinks = isCollabOrder && (
        creatorStatus === 'REVISION_DECLINED_LINKS' ||
        rawStatus === 'REVISION_DECLINED_LINKS' ||
        thrFlow === 'REVISION_DECLINED_LINKS' ||
        orderStage === 'REVISION_DECLINED_LINKS'
      );

      const isContentApprovedRaw = Boolean(
        Boolean(o.draft_approved_at) ||
        creatorStatus === 'CONTENT_APPROVED' || 
        creatorStatus === 'COMPLETED_APPROVAL' || 
        creatorStatus === 'AWAITING_LIVE_LINK' ||
        thrFlow === 'CONTENT_APPROVED' ||
        thrFlow === 'AWAITING_LIVE_LINK' ||
        orderStage === 'COMPLETED_APPROVAL' ||
        orderStage === 'AWAITING_LIVE_LINK' ||
        o.content_approved === true ||
        o.isApproved === true
      );

      const isCompleted = Boolean(
        creatorStatus === 'COMPLETED' || 
        creatorStatus === 'APPROVED' || 
        creatorStatus === 'PAID' || 
        creatorStatus === 'RELEASED' || 
        paymentStatus === 'RELEASED' || 
        paymentStatus === 'PAID' ||
        thrStatus === 'COMPLETED' ||
        thrFlow === 'COMPLETED' ||
        orderStage === 'COMPLETED' ||
        (!isCollabOrder && isContentApprovedRaw)
      );

      // Check if deliverable was resubmitted after revision was requested
      const deliveredTime = Date.parse(o.delivered_at || '') || 0;
      const updatedTime = Date.parse(o.updated_at || '') || 0;
      const hasFreshSubmission = (creatorStatus === 'SUBMITTED' || creatorStatus === 'DELIVERED' || creatorStatus === 'CONTENT_SUBMITTED') ||
        (deliveredTime > 0 && deliveredTime >= updatedTime && (o.submission_link || o.video_url || o.drive_url));

      const liveLink = o.live_link || (Array.isArray(o.live_links) ? o.live_links[0] : o.live_links) || (o.proof && (o.proof.live_link || o.proof.link)) || null;
      const hasLiveLink = isCollabOrder && Boolean(liveLink || o.live_links_submitted);

      const isContentApproved = isCollabOrder && (
        isContentApprovedRaw ||
        isRevisionRequestedLinks ||
        isRevisionDeclinedLinks
      );

      const isLiveLinkSubmitted = isCollabOrder && !isRevisionRequestedLinks && !isRevisionDeclinedLinks && Boolean(
        hasLiveLink || 
        creatorStatus === 'PROOF_SUBMITTED' || 
        creatorStatus === 'LIVE_LINK_SUBMITTED' || 
        creatorStatus === 'LINKS_UNDER_REVIEW' ||
        thrFlow === 'PROOF_SUBMITTED' ||
        orderStage === 'LIVE_LINK_SUBMITTED'
      );

      let stage = "IN_PROGRESS";
      // Session 24: the deadline system expires an order with no first draft.
      const isExpired = creatorStatus === 'EXPIRED' || Boolean(o.expired_at);
      if (isCompleted) {
        stage = "COMPLETED";
      } else if (isRevisionRequestedLinks) {
        stage = "REVISION_REQUESTED_LINKS";
      } else if (isRevisionDeclinedLinks) {
        stage = "REVISION_DECLINED_LINKS";
      } else if (isLiveLinkSubmitted) {
        stage = "LIVE_LINK_SUBMITTED";
      } else if (isContentApproved) {
        stage = "COMPLETED_APPROVAL";
      } else if (isRevisionDeclined) {
        // Ahead of REVISION_REQUESTED on purpose: the decline is the creator's answer to
        // that request, so it must not fall back into the state it just closed.
        stage = "REVISION_DECLINED";
      } else if (creatorStatus === 'REVISION_REQUESTED' || creatorStatus === 'REVISION_REQ' || creatorStatus === 'IN_REVISION') {
        stage = "REVISION_REQUESTED";
      } else if (hasFreshSubmission || creatorStatus === 'SUBMITTED' || creatorStatus === 'DELIVERED' || creatorStatus === 'IN_REVIEW' || creatorStatus === 'CONTENT_SUBMITTED' || creatorStatus === 'UNDER_REVIEW') {
        stage = "IN_REVIEW";
      } else if (!isSigned) {
        stage = "PENDING_SIGNATURE";
      } else {
        stage = "IN_PROGRESS";
      }
      if (isExpired) stage = "EXPIRED";

      const payout = o.creator_payout || o.agreed_amount || o.brief?.budget || 0;
      const title = o.brief?.title || o.title || o.brief?.product_name || o.product_name || o.raw?.title || o.raw?.product_name || "UGC Video Campaign";
      const productName = o.brief?.product_name || o.product_name || "Product Item";
      const brandName = o.brief?.brand_name || o.brand_name || "Brand Partner";
      let brandLogo = o.brief?.brand_logo || o.brand_logo || o.brand?.logo || null;
      if (!brandLogo) {
        if (brandName && brandName !== "Brand Partner") brandLogo = initialsAvatarUrl(encodeURIComponent(brandName), "6366f1");
      }

      return {
        id: o.id,
        orderNumber: o.order_number || `#ORD-${String(o.id).slice(-6).toUpperCase()}`,
        title,
        productName,
        brandName,
        brandLogo,
        status: o.status || o.creator_status || "PENDING",
        stage,
        isSigned,
        payout,
        deadline: o.internal_deadline || o.deadline || o.sla_expires_at,
        dos: o.brief?.dos || [],
        donts: o.brief?.donts || [],
        requirements: o.brief?.detailed_requirements || o.requirements || "",
        productDescription: o.brief?.product_description || o.description || "",
        sampleUrl: o.brief?.sample_content_url || null,
        videoUrl: o.video_url || null,
        driveUrl: o.drive_url || null,
        notes: creatorNoteOrNull(o.creator_notes) || o.notes || "",
        liveLink: o.live_link || (Array.isArray(o.live_links) ? o.live_links[0] : o.live_links) || null,
        revisionNotes: o.revision_notes || o.revision_feedback || o.brand_feedback || (typeof o.creator_notes === "string" && o.creator_notes.includes("Revision feedback:") ? o.creator_notes.replace(/^Revision feedback:\s*/i, "").trim() : "") || "",
        revisionNotesLinks: o.revision_notes_links || o.raw?.revision_notes_links || (typeof o.revision_notes === "string" ? o.revision_notes : "") || "",
        declineNotesLinks: o.decline_notes_links || o.raw?.decline_notes_links || "",
        threadId: o.thread_id || o.chat_thread_id || o.thread?.id || null,
        deliverableType,
        isCollabOrder,
        raw: o
      };
    }).filter(Boolean).sort(compareOrdersForWork); // open work on top, finished below (session 23)
  }, [orders]);

  // Filtered orders list for left column
  const filteredOrders = useMemo(() => {
    return mappedOrders.filter(o => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesQuery = (
          safeLower(o.title).includes(q) ||
          safeLower(o.productName).includes(q) ||
          safeLower(o.brandName).includes(q) ||
          safeLower(o.orderNumber).includes(q)
        );
        if (!matchesQuery) return false;
      }

      if (activeFilter === "all") return true;
      if (activeFilter === "active") return (
        o.stage === "IN_PROGRESS" || 
        o.stage === "REVISION_REQUESTED" || 
        o.stage === "REVISION_REQUESTED_LINKS" ||
        o.stage === "COMPLETED_APPROVAL" || 
        o.stage === "AWAITING_LIVE_LINK" || 
        o.stage === "LIVE_LINK_SUBMITTED"
      );
      if (activeFilter === "in_review") return (
        o.stage === "IN_REVIEW" || 
        o.stage === "COMPLETED_APPROVAL" || 
        o.stage === "AWAITING_LIVE_LINK" || 
        o.stage === "LIVE_LINK_SUBMITTED" ||
        o.stage === "REVISION_REQUESTED_LINKS"
      );
      if (activeFilter === "completed") return o.stage === "COMPLETED" || o.stage === "EXPIRED";
      return true;
    });
  }, [mappedOrders, searchQuery, activeFilter]);

  // Active selected order object
  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    return mappedOrders.find(o => String(o.id) === String(selectedOrderId)) || null;
  }, [mappedOrders, selectedOrderId]);

  // Reset form when active order changes
  useEffect(() => {
    if (selectedOrder) {
      setSelectedFile(null);
      setDriveUrl(selectedOrder.driveUrl || "");
      setCreatorNotes(selectedOrder.notes || "");
      setShowReuploadForm(false);
      setShowLiveLinkCorrectionForm(false);
    }
  }, [selectedOrder?.id]);

  // Handle deliverable submit
  const handleSubmitDeliverables = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!selectedOrder) return;

    if (!selectedFile && !driveUrl.trim()) {
      toast.error("Please upload a video file or paste a Google Drive link to submit.");
      return;
    }

    setSubmitting(true);
    toast.loading("Uploading and submitting UGC deliverable...", { id: "ugc-submit" });

    try {
      let finalVideoUrl = driveUrl.trim();

      if (selectedFile) {
        toast.loading("Requesting secure upload link...", { id: "ugc-submit" });
        const fileExt = safeExt(selectedFile);
        const fileName = `${selectedOrder.id}-${Date.now()}.${fileExt}`;
        const filePath = `ugc-videos/${selectedOrder.id}/${fileName}`;

        const { data: signedData } = await api.post("/upload/signed-url", {
          bucket: "content-submissions",
          path: filePath,
          contentType: selectedFile.type
        });

        toast.loading("Uploading UGC video...", { id: "ugc-submit" });

        const { error: uploadError } = await supabase.storage
          .from("content-submissions")
          .uploadToSignedUrl(signedData.path, signedData.token, selectedFile);

        if (uploadError) {
          throw uploadError;
        }

        finalVideoUrl = filePath; // Save relative path so backend can sign it later
      }

      toast.loading("Saving submission...", { id: "ugc-submit" });
      
      const submitPayload = {
        videoUrl: finalVideoUrl,
        notes: creatorNotes.trim()
      };

      await api.post(`/ugc/orders/${selectedOrder.id}/submit`, submitPayload);

      toast.success("Deliverable submitted! Waiting for brand review.", { id: "ugc-submit" });
      setSelectedFile(null);
      await loadOrders();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || err.response?.data?.message || "Couldn't submit your video. Please try again.", { id: "ugc-submit" }); // v332: no raw upload error text
    } finally {
      setSubmitting(false);
    }
  };

  const getStageBadge = (stage) => {
    switch (stage) {
      case "IN_PROGRESS":
        return <span className="bg-blue-50 text-[#7C3AED] border border-blue-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full">In Production</span>;
      case "REVISION_REQUESTED":
        return <span className="bg-rose-50 text-rose-600 border border-rose-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full">Revision Requested</span>;
      case "REVISION_REQUESTED_LINKS":
        return <span className="bg-amber-50 text-amber-700 border border-amber-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full animate-pulse">Live Link Revision Requested ⚠️</span>;
      case "REVISION_DECLINED_LINKS":
        return <span className="bg-rose-50 text-rose-700 border border-rose-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full">Link Revision Declined</span>;
      case "IN_REVIEW":
        return <span className="bg-amber-50 text-amber-600 border border-amber-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full animate-pulse">Under Brand Review</span>;
      case "COMPLETED_APPROVAL":
      case "AWAITING_LIVE_LINK":
      case "CONTENT_APPROVED":
        return <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full">Draft Approved • Waiting for Live Link</span>;
      case "LIVE_LINK_SUBMITTED":
      case "PROOF_SUBMITTED":
        return <span className="bg-[#F5F0FF] text-[#6D28D9] border border-[#DDD6FE] text-[10px] font-bold px-2.5 py-0.5 rounded-full animate-pulse">Live Link Under Review</span>;
      case "COMPLETED":
        return <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full">Completed & Paid</span>;
      case "PENDING_SIGNATURE":
        return <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full">Agreement pending</span>;
      default:
        // v330: never show a raw enum like "REVISION_DECLINED"
        return <span className="bg-gray-50 text-gray-600 border border-gray-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full">{String(stage || "In progress").toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}</span>;
    }
  };

  if (loading && orders.length === 0) {
    return (
      <div className="w-full min-h-[400px] flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="animate-spin text-[var(--violet)]" size={32} />
          <p className="text-sm text-[var(--text-tertiary)] font-semibold">Loading your UGC orders...</p>
        </div>
      </div>
    );
  }

  // v330: a failed load showed "No Claimed UGC Orders Yet"
  if (mappedOrders.length === 0 && loadFailed) {
    return (
      <div className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl p-12 text-center max-w-xl mx-auto shadow-sm my-6">
        <h2 className="text-xl font-black text-[var(--text-primary)] tracking-tight mb-2">Couldn't load your UGC orders</h2>
        <p className="text-xs text-[var(--text-tertiary)] font-medium leading-relaxed max-w-md mx-auto mb-6">Check your connection and try again.</p>
        <button type="button" onClick={loadOrders} className="inline-flex items-center gap-2 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-bold px-6 py-3 rounded-2xl text-xs transition-all shadow-md cursor-pointer">
          <RefreshCw size={15} /> Try again
        </button>
      </div>
    );
  }

  if (mappedOrders.length === 0) {
    return (
      <div className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl p-12 text-center max-w-xl mx-auto shadow-sm my-6">
        <div className="w-14 h-14 bg-[var(--violet)]/10 text-[var(--violet)] rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[var(--violet)]/20">
          <Briefcase size={26} />
        </div>
        <h2 className="text-xl font-black text-[var(--text-primary)] tracking-tight mb-2">No Claimed UGC Orders Yet</h2>
        <p className="text-xs text-[var(--text-tertiary)] font-medium leading-relaxed max-w-md mx-auto mb-6">
          When you claim open briefs from the Explore UGC tab and sign the SLA agreement, your active production orders will appear here automatically.
        </p>
        {onSelectBriefToExplore && (
          <button
            onClick={onSelectBriefToExplore}
            className="inline-flex items-center gap-2 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-bold px-6 py-3 rounded-2xl text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer"
          >
            <Zap size={15} />
            <span>Explore Open UGC Briefs</span>
          </button>
        )}
      </div>
    );
  }

  const renderOrderWorkspaceContent = (selectedOrder) => {
    if (!selectedOrder) return null;
    return (
      <div className="space-y-6">
        {/* Order Header Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--bg-elevated)]/60 border border-[var(--border-default)] p-3.5 rounded-2xl">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--text-secondary)]">UGC Order Deal:</span>
            <span className="text-xs font-mono font-bold text-[var(--text-primary)]">{selectedOrder.orderNumber || selectedOrder.id}</span>
            <DeliverableBadge deliverableType={selectedOrder.deliverableType} size="xs" />
          </div>
          <button
            type="button"
            onClick={() => {
              navigate(`/chat/${selectedOrder.id}`);
            }}
            className="px-3.5 py-1.5 bg-[var(--bg-card)] hover:bg-[var(--border-default)] text-[var(--text-primary)] rounded-xl border border-[var(--border-default)] transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5 font-bold text-xs hover:border-[var(--violet)] active:scale-95"
            title="Open Chat with Brand"
          >
            <MessageCircle size={14} className="text-[var(--violet)]" />
            <span>Chat with Brand</span>
          </button>
        </div>

        {/* Track Order Card Component */}
        <DealProgressStepper 
          stage={selectedOrder.stage} 
          isCollab={selectedOrder.isCollabOrder} /* v414: step 3 reads "Live link" / "Approved" */
          utrNumber={selectedOrder.raw?.utr_number || selectedOrder.raw?.payout_reference || null} /* v414 */
          orderNumber={selectedOrder.orderNumber}
          brandName={selectedOrder.brandName}
          brandLogo={selectedOrder.brandLogo}
          trackingCode={selectedOrder.orderNumber ? selectedOrder.orderNumber.replace('#', '') : `TRK-${selectedOrder.id}`}
          deadline={selectedOrder.deadline ? new Date(selectedOrder.deadline).toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' }) /* v330: en-IN, IST */ : null}
          title={selectedOrder.title}
          payout={selectedOrder.payout}
        />

        {/* Campaign Brief & Product Information */}
        <BriefProductInfo selectedOrder={selectedOrder} />

        {/* ACTION & DELIVERABLES AREA */}
        <div className="pt-6 border-t border-[var(--border-default)] space-y-4">
          {/* STATE 1: PENDING_SIGNATURE */}
          {selectedOrder.stage === "PENDING_SIGNATURE" && (
            <div className="bg-amber-500/10 border border-amber-500/30 p-6 rounded-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
                  <Lock size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-900 dark:text-amber-300">SLA Contract Pending OTP Verification</h4>
                  <p className="text-xs text-amber-800/90 dark:text-amber-400/90 leading-relaxed mt-0.5">
                    You have reserved this brief. To start your production timer and unlock video deliverable upload, please verify your email/phone with OTP and execute the contract.
                  </p>
                </div>
              </div>
              {/* v332: Cancel on the left, Sign (primary) on the right — AGENTS.md button order */}
              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={cancellingClaim}
                  onClick={async () => {
                    if (cancellingClaim) return;
                    if (await appConfirm("Cancel this brief reservation? The brief goes back to other creators.", { ok: "Cancel reservation", cancel: "Keep it", danger: true })) {
                      setCancellingClaim(true);
                      try {
                        await api.post(`/ugc/orders/${selectedOrder.id}/cancel-claim`);
                        toast.success("Brief reservation released.");
                        setSelectedOrderId(null);
                        loadOrders();
                      } catch (e) {
                        toast.error(e?.response?.data?.error || "Couldn't cancel the claim. Please try again.");
                      } finally {
                        setCancellingClaim(false);
                      }
                    }
                  }}
                  className="px-4 py-2.5 bg-[var(--bg-elevated)] hover:bg-[var(--border-default)] text-[var(--text-secondary)] font-bold text-xs rounded-xl border border-[var(--border-default)] transition-colors cursor-pointer disabled:opacity-60"
                >
                  {cancellingClaim ? "Cancelling…" : "Cancel Claim"}
                </button>
                <button
                  type="button"
                  onClick={() => setSigningOrder(selectedOrder)}
                  className="px-5 py-2.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
                >
                  <FileText size={15} />
                  <span>Verify OTP & Sign Agreement</span>
                </button>
              </div>
            </div>
          )}

          {/* Video Deliverable Preview Card (if video/drive exists) */}
          {(selectedOrder.videoUrl || selectedOrder.driveUrl) && (
            <div className="bg-[var(--bg-elevated)] p-4 sm:p-5 rounded-2xl border border-[var(--border-default)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Video size={16} className="text-[var(--violet)]" />
                  <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                    Submitted Video Deliverable
                  </h4>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewUrl(selectedOrder.videoUrl || selectedOrder.driveUrl);
                      setIsPreviewModalOpen(true);
                    }}
                    className="text-[11px] font-bold text-[var(--violet)] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Maximize2 size={12} />
                    <span>Expand</span>
                  </button>
                  <a
                    href={mediaHref(selectedOrder.videoUrl || selectedOrder.driveUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 hover:underline ml-2"
                  >
                    <ExternalLink size={12} />
                    <span>Open in Tab</span>
                  </a>
                </div>
              </div>

              {/* Embedded Player */}
              {/* Three max-heights used to fight over this player: max-h-[420px] here,
                  max-h-[400px] passed in, and the component's own max-h-[58vh] on the same
                  element. Two of them land on one node, where the later rule in the
                  stylesheet wins rather than the later class in the string, and the outer
                  overflow-hidden then clipped whatever was taller — which on a portrait video
                  meant the bottom of the player, taking the native controls with it. The
                  component already sizes itself for both orientations; let it. */}
              <div className="rounded-xl bg-black/5 dark:bg-black/40 border border-[var(--border-default)] flex items-center justify-center">
                <VideoEmbedPreview
                  url={selectedOrder.videoUrl || selectedOrder.driveUrl}
                  title={selectedOrder.title}
                  className="w-full mx-auto"
                  isApproved={selectedOrder.stage === "COMPLETED" || selectedOrder.stage === "APPROVED" || selectedOrder.stage === "COMPLETED_APPROVAL" || selectedOrder.stage === "AWAITING_LIVE_LINK" || selectedOrder.stage === "LIVE_LINK_SUBMITTED" || selectedOrder.content_approved}
                  watermark={!(selectedOrder.stage === "COMPLETED" || selectedOrder.stage === "APPROVED" || selectedOrder.stage === "COMPLETED_APPROVAL" || selectedOrder.stage === "AWAITING_LIVE_LINK" || selectedOrder.stage === "LIVE_LINK_SUBMITTED" || selectedOrder.content_approved)}
                />
              </div>

              {selectedOrder.notes && (
                <div className="p-3 bg-[var(--bg-card)] rounded-xl border border-[var(--border-default)] text-xs text-[var(--text-secondary)]">
                  <span className="font-bold text-[var(--text-primary)] block mb-0.5">Creator Notes:</span>
                  <p>{selectedOrder.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* STATE 2: REVISION_REQUESTED */}
          {selectedOrder.stage === "REVISION_REQUESTED" && (
            <div className="space-y-4">
              {/* Revision Alert Header in Yellow Amber matching chat */}
              <RevisionAlertHeader fileInputRef={fileInputRef} selectedOrder={selectedOrder} setDeclineMode={setDeclineMode} setShowDeclineModal={setShowDeclineModal} setShowReuploadForm={setShowReuploadForm} showReuploadForm={showReuploadForm} />

              {/* Upload Form for Revisions - Accordion Collapsed by default */}
              <AnimatePresence>
                {showReuploadForm && (
                  <motion.form 
                    initial={{ opacity: 0, height: 0, overflow: "hidden" }}
                    animate={{ opacity: 1, height: "auto", overflow: "visible" }}
                    exit={{ opacity: 0, height: 0, overflow: "hidden" }}
                    transition={{ duration: 0.3 }}
                    onSubmit={handleSubmitDeliverables} 
                    className="space-y-4 bg-[var(--bg-elevated)] p-6 rounded-2xl border border-[var(--border-default)]"
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-[var(--border-default)]">
                      <h4 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                        <Upload size={16} className="text-[var(--violet)]" />
                        Submit Revised Video Deliverable
                      </h4>
                      {selectedOrder.deadline && <MiniCountdown deadline={selectedOrder.deadline} />}
                    </div>

                    {/* Drag & Drop File Upload Box */}
                    <DropUploadBox fileInputRef={fileInputRef} selectedFile={selectedFile} setSelectedFile={setSelectedFile} />

                    {/* OR Drive Link Alternative */}
                    <div>
                      <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1.5">
                        OR Paste Google Drive / Frame.io / Dropbox Share Link
                      </label>
                      <input
                        type="url"
                        placeholder="https://drive.google.com/file/d/..."
                        value={driveUrl}
                        onChange={(e) => setDriveUrl(e.target.value)}
                        className="w-full p-3 bg-[var(--bg-card)] rounded-xl text-base md:text-xs font-medium text-[var(--text-primary)] border border-[var(--border-default)] outline-none focus:border-[var(--violet)] transition-all" /* v332: 16px on phones (iOS zoom) */
                      />
                    </div>

                    {/* Creator Notes */}
                    <div>
                      <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1.5">
                        Notes for Brand (Optional)
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Explain what changes were made in this revision..."
                        value={creatorNotes}
                        onChange={(e) => setCreatorNotes(e.target.value)}
                        className="w-full p-3 bg-[var(--bg-card)] rounded-xl text-base md:text-xs font-medium text-[var(--text-primary)] border border-[var(--border-default)] outline-none focus:border-[var(--violet)] transition-all resize-none" /* v332 */
                      />
                    </div>

                    {/* Submit Deliverable Button */}
                    <button
                      type="submit"
                      disabled={submitting || (!selectedFile && !driveUrl.trim())}
                      className="w-full py-3.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] disabled:bg-[var(--border-default)] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                    >
                      {submitting ? (
                        <><RefreshCw size={16} className="animate-spin" /><span>Submitting…</span></> /* v332 */
                      ) : (
                        <>
                          <Check size={16} />
                          <span>Submit Revised Deliverable to Brand</span>
                        </>
                      )}
                    </button>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Session 25 (rule 51): creator cancels a signed order before the first draft. */}
          {selectedOrder.stage === "IN_PROGRESS" && creatorCancelInfo(selectedOrder.raw || selectedOrder).allowed && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => setCancelOrder(selectedOrder)}
                className="text-xs font-semibold text-red-700 underline cursor-pointer"
              >
                Can't do this order? Cancel
              </button>
            </div>
          )}
          <Presence>{cancelOrder && (
            <CreatorCancelOrderSheet key="creatorcancelordersheet"
              order={{ ...(cancelOrder.raw || {}), id: cancelOrder.id }}
              onClose={() => setCancelOrder(null)}
              onCancelled={() => {
                setCancelOrder(null);
                setSelectedOrderId(null);
                loadOrders();
              }}
            />
          )}</Presence>

          {/* STATE 1: IN_PROGRESS (Initial Submission) */}
          <StageInProgress MiniCountdown={MiniCountdown} creatorNotes={creatorNotes} driveUrl={driveUrl} fileInputRef={fileInputRef} handleSubmitDeliverables={handleSubmitDeliverables} selectedFile={selectedFile} selectedOrder={selectedOrder} setCreatorNotes={setCreatorNotes} setDriveUrl={setDriveUrl} setSelectedFile={setSelectedFile} submitting={submitting} />

          {/* STATE 3: IN_REVIEW */}
          <StageInReview fileInputRef={fileInputRef} handleSubmitDeliverables={handleSubmitDeliverables} selectedFile={selectedFile} selectedOrder={selectedOrder} setSelectedFile={setSelectedFile} setShowReuploadForm={setShowReuploadForm} showReuploadForm={showReuploadForm} submitting={submitting} />


          
          {/* STATE 3.4: REVISION_REQUESTED_LINKS (Live Link Revision Requested by Brand) */}
          {selectedOrder.stage === "REVISION_REQUESTED_LINKS" && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 space-y-5 text-left relative overflow-hidden shadow-xs">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-600 shrink-0">
                    <RotateCcw size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-[var(--text-primary)]">Live Link Correction Requested</h4>
                      <span className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md uppercase tracking-wider font-extrabold">
                        Draft Approved
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Your video draft remains approved. The brand requested changes regarding your live post or a new live link.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const targetThreadId = selectedOrder.threadId || selectedOrder.raw?.thread_id || selectedOrder.id;
                    navigate(`/creator/inbox/${targetThreadId}`);
                  }}
                  className="px-3.5 py-2 bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5 self-start sm:self-auto shadow-xs cursor-pointer"
                >
                  <MessageCircle size={14} className="text-[var(--violet)]" />
                  <span>Chat with Brand</span>
                </button>
              </div>

              {/* Brand's Feedback Instructions */}
              <div className="p-4 bg-[var(--bg-base)] border border-amber-500/30 rounded-xl space-y-1.5 shadow-xs">
                <div className="flex items-center gap-1.5">
                  <AlertCircle size={14} className="text-amber-500 shrink-0" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Brand's Feedback on Live Post / Link:
                  </span>
                </div>
                <p className="text-xs md:text-sm text-[var(--text-primary)] font-semibold leading-relaxed bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg">
                  {selectedOrder.revisionNotesLinks || selectedOrder.revisionNotes || "Please verify your live post URL, caption tags, or audio requirements and submit the corrected live link below."}
                </p>
              </div>

              {/* Previous Live Link if present */}
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

              {/* Actions & Collapsible Revised Link Submission Form */}
              <div className="pt-1 space-y-3">
                {/* Two Action Buttons: Left: Decline Changes | Right: Submit Revised Live Link */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setDeclineMode("links");
                      setShowDeclineModal(true);
                    }}
                    className="flex-1 py-2.5 px-4 bg-[var(--bg-card)] hover:bg-red-500/10 text-red-600 dark:text-red-400 font-bold text-xs rounded-xl border border-red-500/30 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <X size={14} />
                    <span>Decline Changes</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLiveLinkCorrectionForm(prev => !prev)}
                    className="flex-1 py-2.5 px-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-orange-500/15 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <LinkIcon size={14} />
                    <span>{showLiveLinkCorrectionForm ? "Hide Form" : "Submit Revised Live Link"}</span>
                  </button>
                </div>

                {/* Collapsible Animated Form */}
                <AnimatePresence>
                  {showLiveLinkCorrectionForm && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, overflow: "hidden" }}
                      animate={{ opacity: 1, height: "auto", overflow: "visible" }}
                      exit={{ opacity: 0, height: 0, overflow: "hidden" }}
                      transition={{ duration: 0.3 }}
                      className="pt-2"
                    >
                      <div className="p-4 bg-[var(--bg-card)] border border-amber-500/30 rounded-2xl space-y-3">
                        <h5 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-1.5">
                          <LinkIcon size={14} className="text-amber-500" />
                          <span>Submit Corrected Live Post Link:</span>
                        </h5>
                        <form onSubmit={async (e) => {
                          e.preventDefault();
                          const formData = new FormData(e.target);
                          const link = formData.get("live_link")?.toString().trim();
                    { const lc = checkLiveLink(link); if (link && !lc.ok) { toast.error(lc.message || "Paste the link to your posted content.", { id: "live-link" }); return; } } // session 40
                          if (!link) {
                            toast.error("Please enter a valid live link.");
                            return;
                          }
                          if (submittingLiveLink) return;
                          setSubmittingLiveLink(true);
                          try {
                            toast.loading("Submitting revised live link...", { id: "live-link" });
                            const targetThreadId = selectedOrder.threadId || selectedOrder.thread_id || selectedOrder.raw?.thread_id || selectedOrder.id;
                            const notes = formData.get("notes")?.toString().trim() || "";
                            const payload = { links: [link], live_link: link, link: link, notes };
                            await api.post(`/ugc/orders/${selectedOrder.id}/submit-live-link`, payload);
                            toast.success("Revised live link submitted! Brand notified to review.", { id: "live-link" });
                            setShowLiveLinkCorrectionForm(false);
                            await loadOrders();
                          } catch(err) {
                            toast.error(err?.response?.data?.error || err?.response?.data?.message || "Failed to submit live link", { id: "live-link" });
                          } finally {
                            setSubmittingLiveLink(false);
                          }
                        }} className="space-y-3">
                          <input 
                            type="url" 
                            name="live_link"
                            placeholder="https://www.instagram.com/reel/..." 
                            className="w-full bg-[var(--bg-elevated)] border border-amber-500/30 focus:border-amber-500 rounded-xl px-4 py-3 text-base md:text-sm outline-none transition-all" /* v332: 16px on phones */
                            required
                          />
                          <div>
                            <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
                              Additional notes for the brand (optional)
                            </label>
                            <textarea
                              name="notes"
                              rows={3}
                              placeholder="Anything the brand should know about this post..."
                              className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] focus:border-emerald-500 rounded-xl px-4 py-3 text-base md:text-xs outline-none transition-all resize-none" /* v332: 16px on phones */
                            />
                          </div>
                          <div className="flex gap-3">
                            <button 
                              type="submit" 
                              disabled={submittingLiveLink} /* v332: busy state */
                              className="flex-1 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-60 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                            >
                              {submittingLiveLink ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
                              <span>{submittingLiveLink ? "Submitting…" : "Submit Corrected Live Link"}</span>
                            </button>
                          </div>
                        </form>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* STATE 3.5: COMPLETED_APPROVAL */}
          {(selectedOrder.stage === "COMPLETED_APPROVAL" || selectedOrder.stage === "AWAITING_LIVE_LINK") && (
            selectedOrder.isCollabOrder ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 text-center space-y-4">
                <h3 className="text-sm font-bold text-emerald-600">Draft Approved! Submit Live Link</h3>
                <p className="text-xs text-[var(--text-primary)]/80 max-w-lg mx-auto leading-relaxed">
                  Your video draft was approved. Please submit the final live link (reels, posts, etc.) to trigger payout.
                </p>
                
                <div className="flex flex-col gap-3 max-w-sm mx-auto pt-2">
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const formData = new FormData(e.target);
                    const link = formData.get("live_link")?.toString().trim();
                    { const lc = checkLiveLink(link); if (link && !lc.ok) { toast.error(lc.message || "Paste the link to your posted content.", { id: "live-link" }); return; } } // session 40
                    if (!link) return;
                    if (submittingLiveLink) return;
                    setSubmittingLiveLink(true);
                    try {
                      toast.loading("Submitting live link...", { id: "live-link" });
                      const targetThreadId = selectedOrder.threadId || selectedOrder.thread_id || selectedOrder.raw?.thread_id || selectedOrder.id;
                      const notes = formData.get("notes")?.toString().trim() || "";
                      const payload = { links: [link], live_link: link, link: link, notes };
                      await api.post(`/ugc/orders/${selectedOrder.id}/submit-live-link`, payload);
                      toast.success("Live link submitted! Brand notified to review live post.", { id: "live-link" });
                      await loadOrders();
                    } catch(err) {
                      toast.error(err?.response?.data?.error || err?.response?.data?.message || "Failed to submit live link", { id: "live-link" });
                    } finally {
                      setSubmittingLiveLink(false);
                    }
                  }} className="space-y-3 text-left">
                    <input 
                      type="url" 
                      name="live_link"
                      placeholder="https://instagram.com/..." 
                      className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-4 py-3 text-base md:text-sm focus:border-emerald-500 outline-none" /* v332: 16px on phones */
                      required
                    />
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
                        Additional notes for the brand (optional)
                      </label>
                      <textarea
                        name="notes"
                        rows={3}
                        placeholder="Anything the brand should know about this post..."
                        className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] focus:border-emerald-500 rounded-xl px-4 py-3 text-base md:text-xs outline-none transition-all resize-none" /* v332: 16px on phones */
                      />
                    </div>
                    <button type="submit" disabled={submittingLiveLink} className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer">
                      {submittingLiveLink && <RefreshCw size={16} className="animate-spin" />}{/* v332: busy state */}
                      <span>{submittingLiveLink ? "Submitting…" : "Submit Live Link"}</span>
                    </button>
                  </form>

                  {selectedOrder.deal_id && (
                    <>
                      <div className="relative flex items-center py-2">
                        <div className="flex-grow border-t border-[var(--border-default)]"></div>
                        <span className="shrink-0 px-3 text-xs text-[var(--text-tertiary)] uppercase font-bold tracking-wider">OR</span>
                        <div className="flex-grow border-t border-[var(--border-default)]"></div>
                      </div>
                      <button 
                        onClick={() => navigate(`/collabs?dealId=${selectedOrder.deal_id}`)}
                        className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold rounded-xl flex items-center justify-center gap-2"
                      >
                        <ExternalLink size={16} />
                        <span>Sync Live Metrics (Collab)</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 text-center space-y-3">
                <CheckCircle2 size={28} className="text-emerald-500 mx-auto" />
                <h3 className="text-sm font-bold text-emerald-600">Video Deliverable Approved! 🎉</h3>
                <p className="text-xs text-[var(--text-primary)]/80 max-w-lg mx-auto leading-relaxed">
                  The brand has approved your UGC video deliverable. Your payout is being processed. No live post link is required for UGC Raw / Edited video assets.
                </p>
                <p className="text-[11px] text-[var(--text-secondary)] max-w-lg mx-auto" data-testid="retention-note">
                  {retentionLine("creator", null)}
                </p>
              </div>
            )
          )}

          {/* STATE 3.6: LIVE_LINK_SUBMITTED
              This stage had no block at all. The creator pressed "Submit Live Link", the order
              moved to LIVE_LINK_SUBMITTED, no condition below matched it, and the entire detail
              pane rendered empty — the screen looked like it had crashed at the exact moment the
              submission succeeded. */}
          <StageLiveLinkSubmitted navigate={navigate} selectedOrder={selectedOrder} />

          {/* STATE 3.6: REVISION_DECLINED — the draft-stage decline. Until now this state
              resolved back to REVISION_REQUESTED, so the request the creator had just
              declined stayed on screen with its Decline and Upload buttons still live. */}
          {selectedOrder.stage === "REVISION_DECLINED" && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-6 space-y-4 text-left">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-[var(--text-primary)]">You Declined the Revision Request</h4>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1">
                    The brand has been told you cannot make the requested changes. They can clarify and ask again, approve the draft as it is, or bring in Ybex support. Talk it through in chat.
                  </p>
                </div>
              </div>

              {selectedOrder.revisionNotes && (
                <div className="p-3.5 bg-[var(--bg-base)] border border-rose-500/25 rounded-xl">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 block mb-1.5">
                    What the brand had asked for:
                  </span>
                  <p className="text-xs md:text-sm text-[var(--text-primary)] font-semibold leading-relaxed">
                    {selectedOrder.revisionNotes}
                  </p>
                </div>
              )}

              {selectedOrder.threadId && (
                <button
                  type="button"
                  onClick={() => navigate(`/messages/${selectedOrder.threadId}`)}
                  className="w-full py-2.5 px-4 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-[#7C3AED]/10 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <MessageCircle size={14} />
                  <span>Discuss in Chat</span>
                </button>
              )}
            </div>
          )}

          {/* STATE 3.7: REVISION_DECLINED_LINKS — also had no block, same blank pane. */}
          {selectedOrder.stage === "REVISION_DECLINED_LINKS" && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-6 space-y-4 text-left">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-[var(--text-primary)]">You Declined the Live Link Correction</h4>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1">
                    The brand has been told you cannot make the requested change. Sort it out in chat — you can still submit a corrected link below if you change your mind.
                  </p>
                </div>
              </div>

              {selectedOrder.declineNotesLinks && (
                <div className="p-3.5 bg-[var(--bg-base)] border border-rose-500/25 rounded-xl">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 block mb-1.5">
                    Your reason:
                  </span>
                  <p className="text-xs md:text-sm text-[var(--text-primary)] font-semibold leading-relaxed">
                    {selectedOrder.declineNotesLinks}
                  </p>
                </div>
              )}

              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const link = formData.get("live_link")?.toString().trim();
                    { const lc = checkLiveLink(link); if (link && !lc.ok) { toast.error(lc.message || "Paste the link to your posted content.", { id: "live-link" }); return; } } // session 40
                if (!link) {
                  toast.error("Please enter a valid live link.");
                  return;
                }
                if (submittingLiveLink) return;
                setSubmittingLiveLink(true);
                try {
                  toast.loading("Submitting live link...", { id: "live-link" });
                  const notes = formData.get("notes")?.toString().trim() || "";
                    const payload = { links: [link], live_link: link, link: link, notes };
                  // Same submission sent twice on any error — see the note on the other
                  // live-link form. Both routes hit one handler.
                  await api.post(`/ugc/orders/${selectedOrder.id}/submit-live-link`, payload);
                  toast.success("Live link submitted! Brand notified to review.", { id: "live-link" });
                  await loadOrders();
                } catch(err) {
                  toast.error(err?.response?.data?.error || err?.response?.data?.message || "Failed to submit live link", { id: "live-link" });
                } finally {
                  setSubmittingLiveLink(false);
                }
              }} className="space-y-3">
                <input
                  type="url"
                  name="live_link"
                  // Empty for the same reason as the other resubmission form.
                  placeholder="https://www.instagram.com/reel/..."
                  className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] focus:border-rose-500 rounded-xl px-4 py-3 text-base md:text-sm outline-none transition-all" /* v332: 16px on phones */
                  required
                />
                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
                    Additional notes for the brand (optional)
                  </label>
                  <textarea
                    name="notes"
                    rows={3}
                    placeholder="Anything the brand should know about this post..."
                    className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] focus:border-rose-500 rounded-xl px-4 py-3 text-base md:text-xs outline-none transition-all resize-none" /* v332: 16px on phones */
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const targetThreadId = selectedOrder.threadId || selectedOrder.raw?.thread_id || selectedOrder.id;
                      navigate(`/creator/inbox/${targetThreadId}`);
                    }}
                    className="flex-1 py-3 bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl text-xs font-bold text-[var(--text-primary)] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <MessageCircle size={14} className="text-[var(--violet)]" />
                    <span>Chat with Brand</span>
                  </button>
                  <button
                    type="submit"
                    disabled={submittingLiveLink} /* v332: busy state */
                    className="flex-1 py-3 bg-[var(--violet)] hover:bg-[var(--violet-hover)] disabled:opacity-60 text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {submittingLiveLink ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
                    <span>{submittingLiveLink ? "Submitting…" : "Submit Live Link Anyway"}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Session 24: order expired (no first draft by the deadline) */}
          {selectedOrder.stage === "EXPIRED" && (
            <div className="p-6 rounded-2xl space-y-2 border bg-slate-50 border-slate-200">
              <h4 className="font-bold text-slate-900">This order expired</h4>
              <p className="text-sm text-slate-600">
                No draft was uploaded by the deadline, so the order was cancelled and the brief went back to other creators.
                You can keep claiming new briefs — please claim only when you can deliver on time.
              </p>
            </div>
          )}

          {/* STATE 4: COMPLETED */}

          <StageCompleted selectedOrder={selectedOrder} />

          {/* Catch-all. Every block above is gated on one exact stage string, so a stage nobody
              wrote a panel for renders nothing at all and the pane looks broken — which is
              exactly what LIVE_LINK_SUBMITTED and REVISION_DECLINED_LINKS did. This makes the
              next missing stage a visible, reportable message instead of a blank screen. */}
          {!HANDLED_ORDER_STAGES.includes(selectedOrder.stage) && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-6 space-y-3 text-left">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] flex items-center justify-center text-[var(--text-tertiary)] shrink-0">
                  <AlertCircle size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-[var(--text-primary)]">This order is between steps</h4>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1">
                    Nothing is needed from you on this screen right now. The chat has the latest
                    update for this order.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const targetThreadId = selectedOrder.threadId || selectedOrder.raw?.thread_id || selectedOrder.id;
                  navigate(`/creator/inbox/${targetThreadId}`);
                }}
                className="w-full py-2.5 px-4 bg-[var(--bg-elevated)] hover:bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl text-xs font-bold text-[var(--text-primary)] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <MessageCircle size={14} className="text-[var(--violet)]" />
                <span>Open chat</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full space-y-6">
      
      {/* Top Header / Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--bg-card)] p-5 rounded-2xl border border-[var(--border-default)] shadow-xs">
        <div>
          <h2 className="text-xl font-black text-[var(--text-primary)] tracking-tight flex items-center gap-2">
            Manage UGC Orders
            <span className="bg-[var(--violet)]/10 text-[var(--violet)] text-xs font-bold px-2.5 py-0.5 rounded-full border border-[var(--violet)]/20">
              {mappedOrders.length} Total
            </span>
          </h2>
          <p className="text-xs text-[var(--text-tertiary)] font-medium mt-0.5">
            Upload deliverables, track review status, and receive direct payments.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 bg-[var(--bg-elevated)] hover:bg-[var(--bg-card)] text-[var(--text-secondary)] px-3.5 py-2 rounded-xl border border-[var(--border-default)] text-xs font-bold transition-all self-start sm:self-center cursor-pointer active:scale-95 shadow-xs"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin text-[var(--violet)]" : ""} />
          <span>Refresh Orders</span>
        </button>
      </div>

      {/* Main Split Grid Layout (Left: Cards List | Right: Order Detail & Actions) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Claimed Orders List (4 Cols) */}
        <div className="lg:col-span-4 space-y-3">
          
          {/* Search & Status Filters */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={14} />
              <input
                type="text"
                placeholder="Search by title or brand..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search orders"
                className="w-full min-h-[40px] pl-9 pr-3 py-2 bg-[var(--bg-card)] rounded-xl text-base md:text-xs font-medium text-[var(--text-primary)] border border-[var(--border-default)] outline-none focus:border-[var(--violet)] transition-all"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {[
                { id: "all", label: "All" },
                { id: "active", label: "In Production" },
                { id: "in_review", label: "In Review" },
                { id: "completed", label: "Completed" }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                    activeFilter === f.id
                      ? "bg-[var(--violet)] text-white shadow-xs"
                      : "bg-[var(--bg-card)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border-default)]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* List of Cards */}
          <div className="space-y-3 max-h-[750px] overflow-y-auto pr-1">
            {filteredOrders.length === 0 ? (
              <div className="p-8 text-center bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl">
                <p className="text-xs text-[var(--text-tertiary)] font-medium">No orders match this filter.</p>
              </div>
            ) : (
              filteredOrders.map((o) => {
                const isSelected = selectedOrder && String(selectedOrder.id) === String(o.id);

                return (
                  <div
                    key={o.id}
                    role="button" tabIndex={0} /* v332: keyboard reachable */
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedOrderId(o.id); setMobileDrawerOpen(true); } }}
                    onClick={() => {
                      setSelectedOrderId(o.id);
                      setMobileDrawerOpen(true);
                    }}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                      isSelected
                        ? "bg-[var(--bg-card)] border-[var(--violet)] shadow-md ring-2 ring-[var(--violet)]/20"
                        : "bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] border-[var(--border-default)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2.5">
                        {o.brandLogo ? (
                          <img src={o.brandLogo} alt={o.brandName} className="w-9 h-9 rounded-xl object-cover border border-[var(--border-default)] shrink-0" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.visibility = "hidden"; } /* v332: no broken-image icon */} />
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-[var(--violet)]/10 text-[var(--violet)] flex items-center justify-center font-bold text-xs uppercase shrink-0">
                            {o.brandName?.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-[var(--text-primary)] line-clamp-2 leading-tight">{o.title}</h4>
                          <span className="text-[10px] text-[var(--text-tertiary)] font-medium block truncate">{o.brandName} • {o.orderNumber}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[var(--border-default)]">
                      <div>
                        <span className="text-[11px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider block">Payout</span>
                        <span className="text-xs font-black font-mono text-[#027A48]">{Number(String(o.payout ?? "").replace(/[^0-9.]/g, "")) > 0 ? `₹${formatAmount(o.payout)}` : "—"}</span>{/* v332: no "₹0" when the amount is missing */}
                      </div>

                      <div className="flex items-center gap-2">
                        <DeliverableBadge deliverableType={o.deliverableType} size="xs" />
                        {getStageBadge(o.stage)}
                      </div>
                    </div>

                    {o.stage === "IN_PROGRESS" && o.deadline && (
                      <div className="mt-2.5 pt-2 border-t border-[var(--border-default)] flex justify-between items-center">
                        <span className="text-[11px] text-[var(--text-tertiary)] font-bold uppercase">Timer:</span>
                        <MiniCountdown deadline={o.deadline} />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Main Order Details & Actions Box (Desktop: 8 Cols | Mobile: Slide-Up Drawer) */}
        <div className="hidden lg:block lg:col-span-8">
          {!selectedOrder ? (
            <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl p-12 text-center">
              <p className="text-sm text-[var(--text-tertiary)] font-medium">Select an order from the list to view brief details and submit content.</p>
            </div>
          ) : (
            <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl p-6 md:p-8 space-y-6 shadow-sm">
              {renderOrderWorkspaceContent(selectedOrder)}
            </div>
          )}
        </div>

      {/* MOBILE ORDER WORKSPACE SLIDE-UP DRAWER MODAL */}
      <AnimatePresence>
        <Presence>{mobileDrawerOpen && selectedOrder && (
          <PopupBackdrop className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end bg-black/60 backdrop-blur-xs">
            <PopupPanel kind="sheet"
              className="w-full bg-[var(--bg-card)] border-t border-[var(--border-default)] rounded-t-3xl max-h-[88vh] overflow-y-auto p-4 sm:p-6 space-y-5 shadow-2xl relative"
            >
              {/* Drawer Header with Drag indicator & Close Button */}
              <div className="sticky top-0 z-20 -mt-2 -mx-2 pt-2 pb-3 bg-[var(--bg-card)] border-b border-[var(--border-default)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-1 bg-[var(--border-default)] rounded-full mx-auto" />
                  <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Order Details & Workspace</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--bg-elevated)] hover:bg-[var(--border-default)] text-[var(--text-primary)] transition-colors cursor-pointer"
                  title="Close workspace"
                  aria-label="Close" /* v332: icon-only button, 40px */
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

      </div>

      {/* Signature SLA Contract Modal */}
      {signingOrder && (
        <UGCContractModal
          brief={signingOrder.raw?.brief || { title: signingOrder.title, budget: signingOrder.payout }}
          orderId={signingOrder.id}
          threadId={signingOrder.raw?.thread_id}
          onClose={() => setSigningOrder(null)}
          onSigned={() => {
            setSigningOrder(null);
            loadOrders();
            toast.success("Agreement signed. You can start on the video now."); // v332: plain words
          }}
        />
      )}

      {/* Universal Preview Modal */}
      <UniversalPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        url={previewUrl || selectedOrder?.videoUrl || selectedOrder?.driveUrl || driveUrl}
        notes={selectedOrder?.creatorNotes || creatorNotes}
        title={selectedOrder?.title ? `${selectedOrder.title} • Live Deliverable` : "Video Deliverable Preview"}
        creatorName={selectedOrder?.creatorName || "Creator"}
        isApproved={selectedOrder?.stage === "COMPLETED" || selectedOrder?.stage === "APPROVED" || selectedOrder?.stage === "COMPLETED_APPROVAL" || selectedOrder?.stage === "AWAITING_LIVE_LINK" || selectedOrder?.stage === "LIVE_LINK_SUBMITTED" || selectedOrder?.content_approved}
      />

      {/* Decline Revisions Modal */}
      <DeclineRevisionsModal declineMode={declineMode} declineReason={declineReason} declining={declining} handleDeclineChanges={handleDeclineChanges} setDeclineReason={setDeclineReason} setShowDeclineModal={setShowDeclineModal} showDeclineModal={showDeclineModal} />

    </div>
  );
}
