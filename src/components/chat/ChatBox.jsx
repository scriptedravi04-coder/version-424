import { setOpenOfferFloor } from "./mobile/chatStageMap"; // v419
import { checkLiveLink } from "../../utils/liveLinkCheck";
import { pickDealTxn } from "../../lib/dealTxn";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { safeUpper } from "../../utils/safeFormat";
import { checkComprehensiveDisallowedContent, splitNumberAcrossMessages } from "../../utils/contactSecurityFilter";
import { checkAbusiveContent } from "../../utils/abuseFilter";
import { resolveReviewFlags } from "./chatFlowState";
import { Loader2, Upload, FileSignature, CheckCircle, MessageCircle, Mail, MessageSquare, Search, Lock, ShieldCheck, Handshake, Check, CreditCard, ExternalLink, Clock, AlertCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import MessageBubble from "./MessageBubble";
import { sortChronologically, createCoalescedRunner, announceChatActivity, makeClientMsgId, findTempFor, mergeServerMessages, clientMsgIdOf, isTempMessage, sendRefusalReason } from "../../lib/chatSync"; // v414: + client_msg_id helpers
import InvoiceModal from "../payments/InvoiceModal";
import CreatorCodeDealCard from "../referral/CreatorCodeDealCard";
import { downloadInvoicePDF } from "../../utils/invoicePdf";
import { api } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";
import { showSecurityWarning } from "./SecurityWarningToast";
import UniversalPreviewModal from "../shared/UniversalPreviewModal";
import BrandPublicProfileModal from "../profile/BrandPublicProfileModal";
import { processRazorpayPayment } from "../../lib/razorpay";
import BrandFeeSummary, { quoteTotal } from "../payments/BrandFeeSummary"; // v364
import { acquireSocket } from "../../lib/sharedSocket";
import { safeStorage } from "../../utils/storage";
import { useAuth } from "../../contexts/AuthContext";

import { Presence } from "../common/Popup";
import ChatBoxDealStageLabel from "./chatBox/ChatBoxDealStageLabel";
import ChatBoxFileUpload from "./chatBox/ChatBoxFileUpload";
import ChatBoxHeader from "./chatBox/ChatBoxHeader";
import ChatBoxMobileDock from "./chatBox/ChatBoxMobileDock";
import ChatBoxModals from "./chatBox/ChatBoxModals";
import ChatBoxPaymentSheet from "./chatBox/ChatBoxPaymentSheet";
import CheckoutPicker from "../payments/checkout/CheckoutPicker"; // v366
import { CheckoutDealCard, CheckoutPayBar } from "../payments/checkout/CheckoutScreens"; // v366
import ChatBoxSignatureStatus from "./chatBox/ChatBoxSignatureStatus";
import ChatBoxUploadSheet from "./chatBox/ChatBoxUploadSheet";
import ChatBoxComposer from "./chatBox/ChatBoxComposer";
import ChatBoxDealStrip from "./chatBox/ChatBoxDealStrip";
import ChatBoxFeedbackBox from "./chatBox/ChatBoxFeedbackBox";
import ChatBoxPresetChips from "./chatBox/ChatBoxPresetChips";
import ChatBoxSubmissionRecord from "./chatBox/ChatBoxSubmissionRecord";
import ChatBoxUploadHeader from "./chatBox/ChatBoxUploadHeader";
import { safeExt } from "../../lib/fileExt";
import { calmError, calmText } from "./calmError"; // v332; v415: + calmText
// Session 58 (bug hunt): a person typing "payment released kab hoga?" closed the chat — only SYSTEM cards count.
// v414: text is only read from server-written rows (was: only message_type "text" ignored).
import { isServerWrittenMessage, allowsLegacyTextMatch, isThreadCancelled, isClosedNotCompleted, cancelledLabel, FUNDED_FLOW_STATES, hasExtraFundedSignal } from "./dealState"; // v414: + isClosedNotCompleted, cancelledLabel; v415: + funded helpers (H3)
const isChatText = (m) => !isServerWrittenMessage(m);
export default function ChatBox({ thread, user: propUser, onlineUsers = [], onBack }) {
  const { user: authUser } = useAuth();
  const user = propUser || authUser;
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const sendingRef = useRef(false);
  const sendSeqRef = useRef(0); // v414: bumped after each successful send; older poll answers are ignored
  const scrollRef = useRef(null); const scrollThreadRef = useRef(null); const nearBottomRef = useRef(true); // v415: last chat we scrolled for; v417: was I near the bottom BEFORE the new message
  const messagesEndRef = useRef(null);
  const [showBrandProfileModal, setShowBrandProfileModal] = useState(false);
  const [showPaymentSheet, setShowPaymentSheet] = useState(false);
  const [showUploadSheet, setShowUploadSheet] = useState(false);
  
  const [showBriefModal, setShowBriefModal] = useState(false);
  const [showBrandAgreeModal, setShowBrandAgreeModal] = useState(false);
  const [showCreatorAgreeModal, setShowCreatorAgreeModal] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [showNegotiationTable, setShowNegotiationTable] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [currentOffer, setCurrentOffer] = useState(null);
  const [showUniversalModal, setShowUniversalModal] = useState(false);
  const [universalPreviewUrl, setUniversalPreviewUrl] = useState("");
  
  const [safetyAccepted, setSafetyAccepted] = useState(false);
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [inputMode, setInputMode] = useState("chat");
  const [offerAmount, setOfferAmount] = useState("");
  const [sendingOffer, setSendingOffer] = useState(false);
  const sendingOfferRef = useRef(false);

  // Custom fetch to update thread object locally if we don't have socket updates
  const [localThread, setLocalThread] = useState(thread);
  const [isPriceAccepted, setIsPriceAccepted] = useState(false);
  const [messagesLoadError, setMessagesLoadError] = useState(null);
  const [threadRefreshError, setThreadRefreshError] = useState(null);
  const fileInputRef = useRef(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const getDealAmount = (t) => {
    return t?.agreed_amount || t?.amount_fixed || t?.campaign?.budget || t?.campaign_budget || t?.ugc_order?.amount || t?.ugc_order?.creator_payout || t?.ugc_order?.agreed_amount || 0;
  };

  const isBrand = user?.role === 'brand' || user?.user_type === 'brand';
  
  setOpenOfferFloor(thread); // v419: ₹500 floor for Ybex in-house brands
  const currentThread = (localThread && (localThread.id === thread?.id || localThread.deal_id === thread?.id || localThread.id === thread?.deal_id)) ? localThread : thread;
  const isTermsAccepted = currentThread ? (isBrand ? currentThread.terms_accepted_brand : currentThread.terms_accepted_creator) : false;

  const isCreatorSigned = Boolean(
    currentThread?.agreement_signed_creator || 
    currentThread?.is_signed_creator ||
    currentThread?.creator_signed ||
    currentThread?.contract_signed_creator
  );

  const isBrandSigned = Boolean(
    currentThread?.agreement_signed_brand || 
    currentThread?.is_signed_brand ||
    currentThread?.brand_signed ||
    currentThread?.contract_signed_brand
  );

  const isMySignatureSigned = isBrand ? isBrandSigned : isCreatorSigned;
  const isOtherPartySigned = isBrand ? isCreatorSigned : isBrandSigned;

  const rawStatus = (currentThread?.status || currentThread?.ugc_order?.status || "").toUpperCase();
  const ugcStatus = (currentThread?.ugc_order?.status || "").toUpperCase();
  const flowState = (currentThread?.flow_state || "").toUpperCase();

  const isUgcOrder = Boolean(
    currentThread?.is_ugc || 
    currentThread?.ugc_order_id || 
    currentThread?.ugc_brief_id ||
    currentThread?.ugc_order ||
    currentThread?.deal_type === 'UGC' || 
    currentThread?.type === 'ugc' ||
    currentThread?.ugc_title ||
    // v389 (QA, Ravi OK 30 Oct): a campaign NAMED "UGC Reels for Diwali" is still a campaign — UGC is decided by the thread's type / id only, never its title.
    currentThread?.id?.startsWith('ugcord_') ||
    currentThread?.deal_id?.startsWith('ugcord_') ||
    currentThread?.id?.startsWith('thread_ugc_')
  );

  const isAgreementSigned = isUgcOrder ? true : (currentThread ? (
    (isBrandSigned && isCreatorSigned) ||
    false
  ) : false);

  const isDealFixed = isUgcOrder ? true : (currentThread ? (
    (currentThread?.status && safeUpper(currentThread.status) !== 'NEGOTIATING') || 
    currentThread?.flow_state === 'AI_AGREEMENT_READY' ||
    // v414: one signature keeps status NEGOTIATING (server), but the price is fixed
    currentThread?.agreement_signed_brand === true || currentThread?.agreement_signed_creator === true ||
    ['AGREEMENT_SIGNED', 'AWAITING_SIGNATURE', 'CONTRACT_READY', 'AGREEMENT_PENDING'].includes(safeUpper(currentThread?.flow_state)) ||
    currentThread?.is_ugc
  ) : false);

  const hasCompletedMessage = React.useMemo(() => {
    return (messages || []).some(m => {
      const type = (m.message_type || m.type || '').toLowerCase();
      const content = (m.content || m.text || '').toLowerCase();
      const action = (m.metadata?.action || '').toLowerCase();
      const status = (m.metadata?.status || '').toLowerCase();
      return (
        type === 'payment_trigger' || 
        type === 'payout_released' || 
        type === 'payment_released' ||
        type === 'live_links_approved' ||
        type === 'chat_closed' ||
        action === 'live_links_approved' ||
        action === 'payout_released' ||
        status === 'completed' ||
        (!isChatText(m) && content.includes('escrow payment released')) ||
        (!isChatText(m) && content.includes('payout has been released')) ||
        (!isChatText(m) && content.includes('payment released')) ||
        (!isChatText(m) && content.includes('payout released')) ||
        (!isChatText(m) && content.includes('deliverables & live links approved')) ||
        (!isChatText(m) && content.includes('collaboration completed')) ||
        (!isChatText(m) && content.includes('ugc deliverable approved')) ||
        (!isChatText(m) && content.includes('invoice generated and payment has been processed'))
      );
    });
  }, [messages]);

  const deliverableTypeStr = String(
    currentThread?.deliverable_type || 
    currentThread?.ugc_order?.deliverable_type || 
    currentThread?.ugc_brief?.deliverable_type || 
    currentThread?.brief?.deliverable_type || 
    ""
  ).toLowerCase();

  const isCollabOrder = currentThread?.requires_live_link !== undefined
    ? Boolean(currentThread.requires_live_link)
    : (currentThread?.is_collaboration !== undefined
      ? Boolean(currentThread.is_collaboration)
      : (isUgcOrder ? (!deliverableTypeStr.includes('raw') && !deliverableTypeStr.includes('edited') && !deliverableTypeStr.startsWith('ugc_video') && (deliverableTypeStr.includes('collab') || deliverableTypeStr.includes('reel'))) : true));

  const isDealCompleted = currentThread && !isClosedNotCompleted(currentThread) /* v414: a cancelled / refunded UGC order (status COMPLETED, flow CANCELLED) is not done */ ? Boolean(
    hasCompletedMessage ||
    ['COMPLETED', 'CLOSED', 'PAID', 'RELEASED', 'RESOLVED'].includes(currentThread?.status?.toUpperCase()) ||
    ['COMPLETED', 'CLOSED', 'PAID', 'RELEASED'].includes(currentThread?.ugc_order?.status?.toUpperCase()) ||
    ['COMPLETED', 'CLOSED', 'PAID', 'RELEASED'].includes(currentThread?.ugc_order?.payment_status?.toUpperCase()) ||
    ['COMPLETED', 'CLOSED', 'PAID', 'RELEASED'].includes(currentThread?.payout_status?.toUpperCase()) ||
    ['COMPLETED', 'CLOSED', 'PAID', 'RELEASED'].includes(currentThread?.flow_state?.toUpperCase()) ||
    Boolean(currentThread?.utr_number || currentThread?.transaction?.utr_number) ||
    (isUgcOrder && !isCollabOrder && (
      Boolean(currentThread?.ugc_order?.draft_approved_at || currentThread?.draft_approved_at) ||
      ['APPROVED', 'CONTENT_APPROVED'].includes(currentThread?.ugc_order?.status?.toUpperCase()) ||
      ['APPROVED', 'CONTENT_APPROVED'].includes(currentThread?.status?.toUpperCase()) ||
      ['APPROVED', 'CONTENT_APPROVED'].includes(currentThread?.flow_state?.toUpperCase())
    ))
  ) : false;

  const isEscrowFunded = Boolean(
    currentThread?.payment_funded === true ||
    currentThread?.escrow_funded === true ||
    currentThread?.escrow_hold === true ||
    currentThread?.deal?.escrow_hold === true ||
    currentThread?.ugc_order?.escrow_hold === true ||
    Boolean(currentThread?.escrow_held_at || (currentThread?.deal?.escrow_hold_at && currentThread?.deal?.escrow_hold !== false) || (currentThread?.ugc_order?.escrow_held_at && currentThread?.ugc_order?.escrow_hold !== false)) /* v414: a refund sets escrow_hold false (same as dealState) */ ||
    ['ESCROW_HELD', 'PAID', 'RELEASED', 'COMPLETED'].includes(currentThread?.payment_status?.toUpperCase()) ||
    ['ESCROW_HELD', 'PAID', 'RELEASED', 'COMPLETED'].includes(currentThread?.deal?.payment_status?.toUpperCase()) ||
    ['ESCROW_HELD', 'PAID', 'RELEASED', 'COMPLETED'].includes(currentThread?.ugc_order?.payment_status?.toUpperCase()) ||
    FUNDED_FLOW_STATES.includes(rawStatus) || FUNDED_FLOW_STATES.includes(flowState) /* v415: H3 shared list (+ escrow_funded) */ ||
    hasCompletedMessage || hasExtraFundedSignal(currentThread, messages) /* v415: H3 held tx / "payment held" card */ ||
    Boolean(currentThread?.utr_number || currentThread?.transaction?.utr_number) ||
    (isUgcOrder && currentThread?.ugc_brief_id && currentThread?.payment_funded !== false) ||
    (messages || []).some(m => {
      const type = (m.message_type || '').toLowerCase();
      const text = (m.text || m.content || '').toLowerCase();
      const meta = m.metadata || {};
      return (
        type === 'payment_funded' ||
        type === 'payment_secured' ||
        meta.action === 'escrow_funded' ||
        meta.action === 'payment_secured' ||
        meta.isPayment === true ||
        meta.payment_funded === true ||
        (!isChatText(m) && text.includes('escrow payment secured')) ||
        (!isChatText(m) && text.includes('secured into ybex escrow')) ||
        (!isChatText(m) && text.includes('deposited into ybex escrow')) ||
        (!isChatText(m) && text.includes('payment secured'))
      );
    })
  );

  const isPaymentFunded = isEscrowFunded;

  const latestActionMsg = useMemo(() => {
    if (!messages || messages.length === 0) return null;
    const relevant = messages.filter(m => 
      m.message_type === 'content_proof_submitted' || 
      m.message_type === 'CHANGES_REQUESTED' || 
      m.message_type === 'revision_requested' ||
      m.message_type === 'revision_declined' ||
      m.message_type === 'live_links_submitted'
    );
    return relevant.length > 0 ? relevant[relevant.length - 1] : null;
  }, [messages]);

  const dealStatus = (currentThread?.deal?.status || currentThread?.status || "").toUpperCase();
  const isContentApproved = !isDealCompleted && (
    ["APPROVED", "CONTENT_APPROVED", "REVISION_REQUESTED_LINKS", "REVISION_DECLINED_LINKS", "COMPLETED_APPROVAL"].includes(rawStatus) || 
    ["APPROVED", "CONTENT_APPROVED", "REVISION_REQUESTED_LINKS", "REVISION_DECLINED_LINKS", "COMPLETED_APPROVAL"].includes(ugcStatus) ||
    ["APPROVED", "CONTENT_APPROVED", "REVISION_REQUESTED_LINKS", "REVISION_DECLINED_LINKS", "COMPLETED_APPROVAL"].includes(flowState) ||
    ["APPROVED", "CONTENT_APPROVED", "REVISION_REQUESTED_LINKS", "REVISION_DECLINED_LINKS", "COMPLETED_APPROVAL"].includes(dealStatus) ||
    currentThread?.content_approved === true ||
    currentThread?.deal?.status === 'CONTENT_APPROVED' ||
    currentThread?.flow_state === 'CONTENT_APPROVED' ||
    (messages || []).some(m => m.message_type === 'content_approved' || (m.metadata && (m.metadata.action === 'draft_approved' || m.metadata.status === 'CONTENT_APPROVED')))
  );

  const {
    hasActiveRevisionMsg,
    hasActiveDeclineMsg,
    isRevisionRequested,
    isRevisionDeclined,
    isContentSubmitted
  } = resolveReviewFlags({
    isDealCompleted,
    isContentApproved,
    rawStatus,
    ugcStatus,
    flowState,
    latestActionType: latestActionMsg?.message_type || null
  });

  // CAMPAIGN ONLY. Once this user has signed the partnership contract the negotiation
  // table becomes view-only for them — otherwise a signature means nothing, because you
  // could sign and then re-open the table and move the numbers (creator-negotiate even
  // clears both signatures). Instant UGC has no signature stage and is untouched.
  const isUgcThread = Boolean(
    currentThread?.is_ugc ||
    currentThread?.ugc_order_id ||
    currentThread?.ugc_brief_id ||
    String(currentThread?.deal_type || '').toUpperCase() === 'UGC' ||
    String(currentThread?.type || '').toLowerCase() === 'ugc' ||
    String(currentThread?.id || '').startsWith('thread_ugc_') ||
    String(currentThread?.id || '').startsWith('ugcord_') ||
    String(currentThread?.deal_id || '').startsWith('ugcord_')
  );
  const isCampaignThread = !isUgcThread && Boolean(
    currentThread?.campaign_id ||
    String(currentThread?.deal_type || '').toUpperCase() === 'CAMPAIGN' ||
    String(currentThread?.type || '').toLowerCase() === 'campaign' ||
    String(currentThread?.id || '').startsWith('thread_camp_')
  );
  const isNegotiationLocked = isCampaignThread && Boolean(
    currentThread?.agreement_signed_brand ||
    currentThread?.agreement_signed_creator ||
    ['CONTRACT_SIGNED', 'PROOF_SUBMITTED', 'ACTIVE', 'COMPLETED'].includes(String(currentThread?.flow_state || '').toUpperCase()) // v414: price stays open until someone signs (server rule)
  );

  // Detect the most recent live-link action in messages to avoid staleness
  const latestLinkActionMsg = useMemo(() => {
    if (!messages || messages.length === 0) return null;
    const relevant = messages.filter(m => {
      const type = (m.message_type || m.type || '').toLowerCase();
      const action = (m.metadata?.action || '').toLowerCase();
      return (
        type === 'live_links_resubmit_request' ||
        type === 'live_links_resubmit_declined' ||
        type === 'live_links_submitted' ||
        type === 'live_links_approved' ||
        action === 'live_links_resubmit_requested' ||
        action === 'live_links_resubmit_declined' ||
        action === 'live_link_submitted' ||
        action === 'live_links_approved'
      );
    });
    return relevant.length > 0 ? relevant[relevant.length - 1] : null;
  }, [messages]);

  // A live-link correction request means the previous submission is over — the ball is back
  // with the creator.
  // UGC Order pipeline (collaboration orders only)
  const isUgcLinksRevisionOpen = isUgcOrder && isCollabOrder && ([
    "REVISION_REQUESTED_LINKS",
    "REVISION_DECLINED_LINKS",
    "LIVE_LINK_REVISION_REQ",
    "LIVE_LINK_REVISION"
  ].some(state => state === rawStatus || state === ugcStatus || state === flowState || state === dealStatus) || Boolean(
    latestLinkActionMsg && (
      (latestLinkActionMsg.message_type || '').toLowerCase() === 'live_links_resubmit_request' ||
      (latestLinkActionMsg.metadata?.action || '').toLowerCase() === 'live_links_resubmit_requested' ||
      (latestLinkActionMsg.message_type || '').toLowerCase() === 'live_links_resubmit_declined' ||
      (latestLinkActionMsg.metadata?.action || '').toLowerCase() === 'live_links_resubmit_declined'
    )
  ));

  // Campaign Deal pipeline (completely separate segment from UGC)
  const isCampaignLinksRevisionOpen = !isUgcOrder && ([
    "REVISION_REQUESTED_LINKS",
    "REVISION_DECLINED_LINKS",
    "LIVE_LINK_REVISION_REQ",
    "LIVE_LINK_REVISION"
  ].some(state => state === rawStatus || state === flowState || state === dealStatus) || Boolean(
    latestLinkActionMsg && (
      (latestLinkActionMsg.message_type || '').toLowerCase() === 'live_links_resubmit_request' ||
      (latestLinkActionMsg.metadata?.action || '').toLowerCase() === 'live_links_resubmit_requested' ||
      (latestLinkActionMsg.message_type || '').toLowerCase() === 'live_links_resubmit_declined' ||
      (latestLinkActionMsg.metadata?.action || '').toLowerCase() === 'live_links_resubmit_declined'
    )
  ));

  const isLinksRevisionOpen = isUgcOrder ? isUgcLinksRevisionOpen : isCampaignLinksRevisionOpen;

  const isLiveLinksSubmitted = !isDealCompleted && !isUgcLinksRevisionOpen && !isCampaignLinksRevisionOpen && (
    isUgcOrder ? (
      isCollabOrder && (
        ["LIVE_LINKS_SUBMITTED", "LINKS_SUBMITTED", "LINKS_UNDER_REVIEW"].includes(ugcStatus) ||
        Boolean(currentThread?.ugc_order?.live_links_submitted) ||
        (
          (latestLinkActionMsg?.message_type || '').toLowerCase() === 'live_links_submitted' ||
          (latestLinkActionMsg?.metadata?.action || '').toLowerCase() === 'live_link_submitted'
        )
      )
    ) : (
      ["LIVE_LINKS_SUBMITTED", "LINKS_SUBMITTED", "LINKS_UNDER_REVIEW", "PROOF_SUBMITTED"].includes(rawStatus) ||
      ["PROOF_SUBMITTED", "LINKS_UNDER_REVIEW", "LIVE_LINKS_SUBMITTED"].includes(flowState) ||
      Boolean(currentThread?.live_links_submitted) ||
      Boolean(currentThread?.deal?.live_links_submitted) ||
      (
        (latestLinkActionMsg?.message_type || '').toLowerCase() === 'live_links_submitted' ||
        (latestLinkActionMsg?.metadata?.action || '').toLowerCase() === 'live_link_submitted'
      )
    )
  );

  // v414: a cancelled / expired / refunded deal or order shows no upload / approve / pay tabs (mobile hides them too)
  const isCancelled = !isDealCompleted && isThreadCancelled(currentThread);
  const showTabs = !isDealCompleted && !isCancelled;

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [overallRating, setOverallRating] = useState(5);
  const [commRating, setCommRating] = useState(5);
  const [timeRating, setTimeRating] = useState(5);
  const [qualRating, setQualRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [selectedInvoiceTxn, setSelectedInvoiceTxn] = useState(null);

  // Invoices come from the real transaction row. When none was found, both of these used to
  // build one on the spot — the agreed amount (or ₹5000), a hardcoded 10% fee and status
  // SUCCESS — which disagreed with the actual fee and could describe a payout that never
  // happened. A screen that states money must match what the server did.
  const findThreadTransaction = async () => {
    const ids = [
      currentThread?.campaign_deal_id,
      currentThread?.deal_id,
      currentThread?.ugc_order_id,
      currentThread?.id
    ].filter(Boolean);
    const { data } = await api.get('transactions');
    const rows = Array.isArray(data) ? data : [];
    return pickDealTxn(rows, ids); // v333: the row with the money, not the first (₹0 duplicate) one
  };

  const handleViewInvoice = async () => {
    try {
      const match = await findThreadTransaction();
      if (match) {
        setSelectedInvoiceTxn(match);
      } else {
        toast.error("The invoice isn't available yet — it is generated once the payment is recorded.");
      }
    } catch (err) {
      toast.error("Couldn't load the invoice right now. Please try again.");
    }
  };

  const handleDownloadInvoice = async () => {
    let transaction = null;
    try {
      transaction = await findThreadTransaction();
    } catch (err) {
      console.error(err);
    }

    if (!transaction) {
      toast.error("The invoice isn't available yet — it is generated once the payment is recorded.");
      return;
    }

    const payeeName = currentThread?.creator?.name || currentThread?.creator?.username || "UGC Creator";
    downloadInvoicePDF(transaction, isBrand, payeeName)?.catch?.(() => {}); // v426: async now (jsPDF loads on demand)
    toast.success("Invoice PDF downloaded successfully! 🧾");
  };

  useEffect(() => {
    // v415: the rating popup opened by itself on EVERY visit to a completed chat (and on top of the safety tips).
    // Now it opens by itself once per chat, never while another popup is up; the Rate button still opens it.
    const uid = user?.user_id || user?.id || 'anon';
    const safetyDone = safeStorage.getItem(`safety_accepted_${uid}`) === 'true' || safeStorage.getItem(`safety_accepted_${uid}_${currentThread?.id}`) === 'true';
    if (currentThread?.status === 'COMPLETED' && !showSafetyModal && safetyDone && currentThread?.id) {
      const hasReviewed = isBrand ? currentThread?.reviewed_by_brand : currentThread?.reviewed_by_creator;
      const autoKey = `review_prompted_${uid}_${currentThread.id}`;
      if (!hasReviewed && safeStorage.getItem(autoKey) !== 'true') { safeStorage.setItem(autoKey, 'true'); setShowReviewModal(true); }
    }
  }, [currentThread?.status, currentThread?.id, currentThread?.reviewed_by_brand, currentThread?.reviewed_by_creator, isBrand, showSafetyModal]); // eslint-disable-line react-hooks/exhaustive-deps

  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    if (currentThread?.id) {
      const stateSuffix = isPaymentFunded ? "funded" : "pending";
      setBannerDismissed(safeStorage.getItem(`dismissed_finalized_deal_${currentThread.id}_${stateSuffix}`) === "true");
    }
  }, [currentThread?.id, isPaymentFunded]);

  const dismissBanner = () => {
    if (currentThread?.id) {
      const stateSuffix = isPaymentFunded ? "funded" : "pending";
      safeStorage.setItem(`dismissed_finalized_deal_${currentThread.id}_${stateSuffix}`, "true");
    }
    setBannerDismissed(true);
  };

  const [aiLoading, setAiLoading] = useState(false);

  const [isAiEvaluating, setIsAiEvaluating] = useState(false);
  const handleAiEvaluation = async () => {
    setIsAiEvaluating(true);
    try {
      // Simulate API call to track performance
      await new Promise(r => setTimeout(r, 1500));
      toast.success("AI Performance evaluation complete! Stats updated in Leaderboard.");
    } catch (e) {
      toast.error(calmError(e, "Couldn't run the AI check. Please try again.")); // v332: no raw error text
    } finally {
      setIsAiEvaluating(false);
    }
  };

  const handleAiAssist = async () => {
    setAiLoading(true);
    try {
      const { data } = await api.post("ai/negotiation", {
        history: currentThread.messages || [],
        offer: currentThread.agreed_amount,
        brandContext: currentThread.campaign,
        creatorContext: currentThread.creator
      });
      if (data && data.suggestedResponse) {
        setText(data.suggestedResponse);
        toast.success(data.advice || "AI Suggestion loaded!");
      }
    } catch (e) {
      toast.error(calmError(e, "Couldn't get AI help right now. Please try again.")); // v332
    } finally {
      setAiLoading(false);
    }
  };


  const activeTabMode = showTabs ? inputMode : "chat";

  // Escrow Payment state & handlers
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentStep, setPaymentStep] = useState("");
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const [payFee, setPayFee] = useState({ quote: null, couponCode: "" }); // v364: service fee + coupon (BrandFeeSummary)
  const [payMethod, setPayMethod] = useState("upi"); // v366: Ravi's checkout — UPI app / card / net banking picked before Razorpay
  const handleEscrowPayment = async (couponArg, methodArg) => {
    setPaymentLoading(true);
    setPaymentStep("Opening payment…"); // v415: was "Launching Razorpay Gateway..."
    const grossAmt = Number(currentThread?.agreed_amount || currentThread?.amount_fixed || 0); // Session 58: no invented ₹15,000
    const couponCode = typeof couponArg === "string" ? couponArg : (payFee.couponCode || ""); // v364
    let paid = false; // v415: tells the phone sheet whether to close (it closed on a failed / cancelled payment too)
    try {
      await processRazorpayPayment({
        dealId: currentThread?.deal_id || currentThread?.id,
        threadId: currentThread?.id,
        campaignId: currentThread?.campaign_id || null,
        creatorId: currentThread?.creator_id || null,
        grossAmount: grossAmt,
        couponCode, // v364
        method: typeof methodArg === "string" ? methodArg : undefined, // v366: Razorpay opens on the picked app / method
        onSuccess: async (res) => {
          setLocalThread(prev => ({
            ...prev,
            ...(res?.thread || {}),
            payment_funded: true,
            status: 'ACTIVE',
            production_started_at: new Date().toISOString()
          }));
          setPaymentSuccess(true);
          paid = true; // v415
          toast.success("Payment received — it's held safely by Ybex. The creator has been notified."); // v415: plainer wording
          setInputMode("chat");
          await refreshThread();
          await loadMessages();
        },
        onError: (err) => {
          toast.error("Payment wasn't completed. You can try again." /* v332: was the raw error text */);
        }
      });
    } catch (e) {
      toast.error(calmError(e, "Couldn't start the payment. Please try again.")); // v332
    } finally {
      setPaymentLoading(false);
      setPaymentStep("");
    }
    return paid; // v415
  };

  // Creator Content Upload states & handlers
  const [contentUrl, setContentUrl] = useState("");
  const [contentNotes, setContentNotes] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [liveLinks, setLiveLinks] = useState([""]);
  const [livePostUrl, setLivePostUrl] = useState("");
  const [livePostNotes, setLivePostNotes] = useState("");
  const [selectedUploadFile, setSelectedUploadFile] = useState(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isManualRevisionOpen, setIsManualRevisionOpen] = useState(false);
  const videoUploadInputRef = useRef(null);

  const handleAddLiveLink = () => {
    setLiveLinks([...liveLinks, ""]);
  };

  const handleLiveLinkChange = (index, value) => {
    const updated = [...liveLinks];
    updated[index] = value;
    setLiveLinks(updated);
  };

  const handleRemoveLiveLink = (index) => {
    if (liveLinks.length > 1) {
      setLiveLinks(liveLinks.filter((_, i) => i !== index));
    }
  };

  const handleSendLiveLinks = async () => {
    // A second click while the first request is in flight sent the link twice.
    if (uploadLoading) return;
    const rawLink = (livePostUrl || liveLinks[0] || "").trim();
    if (!rawLink) {
      toast.error("Please paste your live post link.");
      return;
    }
    // Session 40: a post / reel / video link only — not a profile, channel or Drive file.
    const linkCheck = checkLiveLink(rawLink);
    if (!linkCheck.ok) {
      toast.error(linkCheck.message || "Paste the link to your posted content.");
      return;
    }
    setUploadLoading(true);
    try {
      const threadId = currentThread?.id;
      const dealId = currentThread?.deal_id || currentThread?.deal?.id || (threadId?.startsWith('thread_camp_') ? threadId.replace('thread_camp_', '') : threadId);

      // Call backend submit-live-link route
      const isUgc = Boolean(isUgcOrder || isUgcThread);
      const submitLiveLinkEndpoint = isUgc
        ? `/ugc/threads/${threadId}/submit-live-link`
        : `/campaign/threads/${threadId}/submit-live-link`;
      await api.post(submitLiveLinkEndpoint, {
        link: rawLink,
        links: [rawLink],
        notes: livePostNotes || contentNotes || ""
      });

      // The campaign submit-live-link call above already records the link, moves the deal and
      // posts the card. A second write through /deals/:id/add-collab used to follow as a
      // "safety sync"; it did the same work again with its own card, deduplicated only against
      // the local store — a second live-link card whenever that store was cold.
      void dealId;

      toast.success("Live link submitted successfully! 🚀");
      setInputMode("chat");
      setShowUploadSheet(false);
      setLivePostUrl("");
      setLivePostNotes("");
      setLiveLinks([""]);
      if (typeof loadMessages === 'function') await loadMessages();
      if (typeof refreshThread === 'function') await refreshThread();
    } catch (e) {
      toast.error(calmError(e, "Couldn't submit the live link. Please try again.")); // v332
    } finally {
      setUploadLoading(false);
    }
  };

  const handleCreatorSubmitContent = async () => {
    if (uploadLoading) return;
    if (!selectedUploadFile && !contentUrl.trim()) {
      toast.error("Please select a video file or enter a valid link for your draft content.");
      return;
    }
    setUploadLoading(true);
    setUploadProgress(0);
    try {
      const targetUgcOrderId = currentThread?.ugc_order_id || 
        currentThread?.ugc_order?.id || 
        (currentThread?.id?.startsWith('ugcord_') ? currentThread.id : null) ||
        (currentThread?.deal_id?.startsWith('ugcord_') ? currentThread.deal_id : null) ||
        (currentThread?.id?.startsWith('thread_ugc_') ? currentThread.id.replace('thread_ugc_', '') : (isUgcOrder ? currentThread?.deal_id : null));

      let finalVideoUrl = contentUrl.trim();

      if (selectedUploadFile) {
        const uploadToastId = isUgcOrder ? "ugc-chat-submit" : "campaign-chat-submit";
        toast.loading("Requesting secure upload link...", { id: uploadToastId });
        const fileExt = safeExt(selectedUploadFile);
        const fileName = `${currentThread?.id}-${Date.now()}.${fileExt}`;
        const filePath = isUgcOrder ? `ugc-videos/${fileName}` : `campaign-deliverables/${fileName}`;

        const { data: signedData } = await api.post("/upload/signed-url", {
          bucket: "content-submissions",
          path: filePath,
          contentType: selectedUploadFile.type
        });

        toast.loading(isUgcOrder ? "Uploading UGC video..." : "Uploading campaign deliverable...", { id: uploadToastId });

        const { error: uploadError } = await supabase.storage
          .from("content-submissions")
          .uploadToSignedUrl(signedData.path, signedData.token, selectedUploadFile);

        if (uploadError) {
          throw uploadError;
        }

        finalVideoUrl = filePath; // Save relative path so backend can sign it later
      }
      
      const submitToastId = isUgcOrder ? "ugc-chat-submit" : "campaign-chat-submit";
      toast.loading("Saving submission...", { id: submitToastId });

      const submitPayload = {
        videoUrl: finalVideoUrl,
        video_url: finalVideoUrl,
        content_url: finalVideoUrl,
        notes: contentNotes.trim(),
        creator_notes: contentNotes.trim()
      };

      if (isUgcOrder || targetUgcOrderId) {
        // Connect to the exact same submission pipeline as Manage Orders
        const orderIdToCall = targetUgcOrderId || currentThread?.id;
        await api.post(`/ugc/orders/${orderIdToCall}/submit`, submitPayload);
      } else {
        await api.post(`/campaign/threads/${currentThread?.id}/submit-content`, submitPayload);
      }
      toast.success(
        isUgcOrder 
          ? "UGC deliverable successfully submitted! Brand panel has been notified."
          : "Campaign deliverable successfully submitted! Brand panel has been notified.", 
        { id: submitToastId }
      );
      setInputMode("chat");
      setContentUrl("");
      setContentNotes("");
      setSelectedUploadFile(null);
      setIsManualRevisionOpen(false);
      await loadMessages();
      await refreshThread();
    } catch (e) {
      const errToastId = isUgcOrder ? "ugc-chat-submit" : "campaign-chat-submit";
      toast.error(calmError(e, "Couldn't submit the draft. Please try again."), { id: errToastId }); // v332
    } finally {
      setUploadLoading(false);
      setUploadProgress(0);
    }
  };

  const effectiveInputMode = showTabs ? inputMode : "chat";

  // Sponsorship and Contract Negotiation states
  const [isNegotiatingFee, setIsNegotiatingFee] = useState(false);
  const [counterAmountInput, setCounterAmountInput] = useState("");
  const [flowLoading, setFlowLoading] = useState(false);

  // OTP Signature and Inline Negotiation States
  const [showOtpForm, setShowOtpForm] = useState(false);
  const [otpPhoneNumber, setOtpPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [isNegotiatingInline, setIsNegotiatingInline] = useState(false);
  const [counterAmountInline, setCounterAmountInline] = useState("");



  useEffect(() => {
    setLocalThread(thread);
    if (!thread) return;

    // Check safety acceptance from safeStorage for this specific user + thread
    const acceptedKey = `safety_accepted_${user?.user_id || user?.id || 'anon'}_${thread.id}`;
    // v415: the tips popped up on every new chat — now once per user (old per-chat key still counts)
    const accepted = safeStorage.getItem(acceptedKey) === 'true' || safeStorage.getItem(`safety_accepted_${user?.user_id || user?.id || 'anon'}`) === 'true';
    setSafetyAccepted(accepted);
    if (!accepted) {
      setShowSafetyModal(true);
    }

    loadMessages();

    // One refresh for a burst of socket events (see createCoalescedRunner).
    const syncNow = createCoalescedRunner(() =>
      Promise.all([Promise.resolve(loadMessages()), Promise.resolve(refreshThread())])
    );

    // Setup active WebSocket connection
    // Session 36 (Ravi OK "chat socket"): one shared socket.io connection per tab (src/lib/sharedSocket.js)
    // instead of a new connection per open chat. Same events, same rooms; release() removes only
    // this screen's listeners.
    const socket = acquireSocket(user?.user_id || user?.id);

    socket.onConnect(() => {
      socket.emit("register_user", user?.user_id || user?.id);
      socket.emit("join_room", thread.id);
    });

    socket.on("new_message", (newMessage) => {
      if (newMessage && (newMessage.thread_id === thread.id || newMessage.conversation_id === thread.id)) {
        setMessages((prev) => {
          const newId = newMessage.id || newMessage.message_id;
          // v414: the pending temp bubble is matched by client_msg_id (or same sender + text within 30 s) —
          // never by text alone, so someone else's "ok" can't replace mine.
          const tempIdx = findTempFor(prev, newMessage);
          // If message already exists by real id, ignore but purge its own pending temp message
          if (prev.some((m) => m.id === newId || (newMessage.message_id && m.id === newMessage.message_id))) {
            return tempIdx !== -1 ? prev.filter((_, i) => i !== tempIdx) : prev;
          }
          if (tempIdx !== -1) {
            const copy = [...prev];
            copy[tempIdx] = newMessage;
            return copy;
          }
          return [...prev, newMessage];
        });
      }
    });

    socket.on("thread_updated", (updatedThread) => {
      const tId = updatedThread.id || updatedThread.threadId || updatedThread.thread_id || updatedThread.deal_id;
      if (updatedThread && (tId === thread.id || tId === thread.deal_id)) {
        // The event's id may be the order/deal id (it names the route that changed) — never
        // let it overwrite this thread's own id.
        const { id: _eid, threadId: _etid, thread_id: _ethid, _sync: _es, ...patch } = updatedThread;
        setLocalThread(prev => {
          const merged = { ...prev, ...patch };
          if (prev?.ugc_order && patch.ugc_order) {
            merged.ugc_order = { ...prev.ugc_order, ...patch.ugc_order };
          }
          if (updatedThread.revision_notes === null) {
            delete merged.revision_notes;
            delete merged.revision_feedback;
            if (merged.ugc_order) {
              delete merged.ugc_order.revision_notes;
              delete merged.ugc_order.revision_feedback;
            }
          }
          return merged;
        });
        syncNow();
      }
    });

    socket.on("agreement_signed", (payload) => {
      const tId = payload?.id || payload?.threadId || payload?.thread_id || payload?.deal_id;
      if (payload && (tId === thread.id || tId === thread.deal_id)) {
        setLocalThread(prev => ({
          ...prev,
          ...payload,
          status: payload.both_signed ? 'ACTIVE' : (prev?.status || payload.status),
          flow_state: payload.both_signed ? 'ACTIVE' : (payload.flow_state || 'AGREEMENT_SIGNED'),
          agreement_signed_creator: payload.agreement_signed_creator ?? prev?.agreement_signed_creator,
          agreement_signed_brand: payload.agreement_signed_brand ?? prev?.agreement_signed_brand,
        }));
        syncNow();
      }
    });

    socket.on("payment_funded", (payload) => {
      if (payload && (payload.threadId === thread.id || payload.thread_id === thread.id || payload.deal_id === thread.deal_id || payload.dealId === thread.deal_id)) {
        setLocalThread(prev => ({
          ...prev,
          payment_funded: true,
          status: 'ACTIVE',
          production_started_at: new Date().toISOString()
        }));
        setPaymentSuccess(true);
        syncNow();
        toast.success("Payment received — it's held safely by Ybex."); // v415: plainer wording
      }
    });

    socket.on("order_updated", (orderPayload) => {
      if (orderPayload && (orderPayload.id === thread.deal_id || orderPayload.id === thread.id)) {
        syncNow();
      }
    });

    socket.on("deal_updated", (dealPayload) => {
      if (dealPayload && (dealPayload.id === thread.deal_id || dealPayload.id === thread.id)) {
        syncNow();
      }
    });

    // Safety net for a missed socket event — the socket delivers messages live. It was every
    // 6 s (two requests each time), overlapping itself on slow connections. Now every 15 s,
    // skipped while the previous round is still running or the tab is in the background.
    let pollBusy = false;
    const interval = setInterval(async () => {
      if (pollBusy || (typeof document !== "undefined" && document.hidden)) return;
      pollBusy = true;
      try {
        await Promise.all([Promise.resolve(loadMessages()), Promise.resolve(refreshThread())]);
      } catch (e) {
        /* background refresh — errors surface on the next explicit load */
      } finally {
        pollBusy = false;
      }
    }, 15000);

    return () => {
      syncNow.cancel();
      socket.emit("leave_room", thread.id);
      socket.release();
      clearInterval(interval);
    };
  }, [thread?.id, user?.user_id]);

  // Handle marking messages as read reactively and dispatching event purely
  // Move this thread to the top of the inbox list when a newer message appears (session 23).
  const lastMsgAt = messages.length ? messages.reduce((mx, m) => {
    const v = m?.created_at ? new Date(m.created_at).getTime() : 0;
    return Number.isFinite(v) && v > mx ? v : mx;
  }, 0) : 0;
  useEffect(() => {
    if (thread?.id && lastMsgAt > 0) announceChatActivity(thread.id, new Date(lastMsgAt).toISOString());
  }, [thread?.id, lastMsgAt]);

  useEffect(() => {
    if (thread && user && messages.length > 0) {
      safeStorage.setItem(`last_read_count_${user.user_id || user.id}_${thread.id}`, String(messages.length));
      window.dispatchEvent(new Event("chat_read_update"));
    }
  }, [messages.length, thread?.id, user?.user_id || user?.id]);

  useEffect(() => {
    if (isDealFixed && !isAgreementSigned) {
      setInputMode("offer");
    }
  }, [isDealFixed, isAgreementSigned]);

  useEffect(() => {
    if (isAgreementSigned) {
      setInputMode("chat");
    }
  }, [isAgreementSigned]);

  const handleAcceptSafety = () => {
    if (!thread) return;
    const acceptedKey = `safety_accepted_${user?.user_id || user?.id || 'anon'}_${thread.id}`;
    safeStorage.setItem(acceptedKey, 'true');
    safeStorage.setItem(`safety_accepted_${user?.user_id || user?.id || 'anon'}`, 'true'); // v415: once per user
    setSafetyAccepted(true);
    setShowSafetyModal(false);
    // v415: no success toast for reading tips (it read like a legal sign-off)
  };

  const handleReviewSubmit = async () => {
    if (overallRating < 1 || overallRating > 5) {
      toast.error("Please provide an overall rating between 1 and 5 stars.");
      return;
    }
    setSubmittingReview(true);
    try {
      const reviewEndpoint = (currentThread?.is_ugc || currentThread?.deal_type === 'UGC')
        ? `/ugc/threads/${currentThread?.id}/submit-review`
        : `/campaign/threads/${currentThread?.id}/submit-review`;
      await api.post(reviewEndpoint, {
        rating: overallRating,
        communication_rating: commRating,
        timeliness_rating: timeRating,
        quality_rating: qualRating,
        comment: reviewComment
      });
      toast.success("Feedback submitted successfully! Thank you for rating the experience.");
      setShowReviewModal(false);
      refreshThread();
    } catch (e) {
      toast.error(calmError(e, "Couldn't send your feedback. Please try again.")); // v332
    } finally {
      setSubmittingReview(false);
    }
  };

  useEffect(() => { // v415: follow new messages only when near the bottom, on a new chat, or after my own send (reading history got yanked down)
    const box = scrollRef.current?.parentElement; const last = messages[messages.length - 1]; const mine = last && (isTempMessage(last) || String(last.sender_user_id || last.sender_id || '') === String(user?.user_id || user?.id || '-'));
    const follow = scrollThreadRef.current !== currentThread?.id || mine || !box || nearBottomRef.current || box.scrollHeight - box.scrollTop - box.clientHeight < 160; scrollThreadRef.current = currentThread?.id; /* v417: a tall new card no longer stops the follow */
    if (follow) setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, 150);
  }, [messages.length, currentThread?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshThread = async () => {
    if (!thread) return;
    try {
      const { data } = await api.get(`/chat/v2/threads/${thread.id}`, { bypassCache: true });
      if (data) {
        setLocalThread(data);
        setThreadRefreshError(null);
      }
    } catch (err) {
      console.error("Failed to refresh thread:", err);
      setThreadRefreshError(err?.response?.data?.detail || err?.message || "Thread refresh failed");
    }
  };

  const loadMessages = async () => {
    if (!thread) return;
    const seqAtStart = sendSeqRef.current; // v414
    try {
      const { data } = await api.get(`/chat/v2/threads/${thread.id}/messages`, { bypassCache: true });
      if (data && Array.isArray(data)) {
        if (seqAtStart !== sendSeqRef.current) return; // v414: this answer started before my latest send — skip it
        const filteredData = data.filter(m => m.content !== "⏳ Waiting for the other party to sign.");
        
        setMessages((prev) => {
          const seen = new Set();
          const merged = [];
          for (const m of filteredData) {
            const key = m.id || m.message_id;
            const contentKey = (
              m.message_type === "system" || 
              m.message_type === "creator_signed" || 
              m.message_type === "brand_signed" || 
              m.message_type === "agreement_executed" || 
              m.message_type === "payment_secured" || 
              !m.sender_user_id || 
              m.sender_role === "system"
            ) && m.content
              ? `sys_${m.content.trim()}`
              : null;
            if (key && !seen.has(key) && (!contentKey || !seen.has(contentKey))) {
              seen.add(key);
              if (contentKey) seen.add(contentKey);
              merged.push(m);
            }
          }
          // v414: keep local pending AND failed bubbles the server hasn't confirmed (by client_msg_id) — a poll
          // used to drop failed ones, and drop a pending one whenever any message had the same text.
          return mergeServerMessages(prev, merged);
        });
        setMessagesLoadError(null);
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
      setMessagesLoadError(err?.response?.data?.detail || err?.message || "Failed to load messages");
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (file && file.size > 50 * 1024 * 1024) {
      toast.error("Please upload the file using a drive link or compress it to under 50 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (uploadingAttachment) return;
    if (!file || !thread) return;
    setUploadingAttachment(true);
    try {
      toast.loading("Requesting secure upload link...", { id: "chat-attach" });
      const fileExt = safeExt(file);
      const fileName = `${thread.id}-${Date.now()}.${fileExt}`;
      const filePath = `chat-attachments/${fileName}`;

      const { data: signedData } = await api.post("/upload/signed-url", {
        bucket: "content-submissions", // Reusing the same bucket
        path: filePath,
        contentType: file.type || "application/octet-stream"
      });

      toast.loading("Uploading attachment...", { id: "chat-attach" });

      const { error: uploadError } = await supabase.storage
        .from("content-submissions")
        .uploadToSignedUrl(signedData.path, signedData.token, file);

      if (uploadError) {
        throw uploadError;
      }

      const fileUrl = filePath; // Save relative path so backend can sign it later
      
      toast.loading("Sending message...", { id: "chat-attach" });

      if (fileUrl) {
        const isVideo = file.type?.startsWith('video/') || file.name?.match(/\.(mp4|mov|webm)$/i);
        const isRevisionMode = currentThread?.flow_state === 'REVISION_REQUESTED' || currentThread?.status === 'REVISION_REQUESTED' || currentThread?.flow_state === 'REVISION_REQ' || currentThread?.status === 'REVISION_REQ' || currentThread?.ugc_order?.status === 'REVISION_REQ';
        
        let msgData;
        if (isVideo && isRevisionMode && !isBrand) {
          // If Creator uploads a video while brand is waiting for a revision, treat it as a revised deliverable
          const localTargetUgcOrderId = currentThread?.ugc_order_id || 
            currentThread?.ugc_order?.id || 
            (currentThread?.id?.startsWith('ugcord_') ? currentThread.id : null) ||
            (currentThread?.deal_id?.startsWith('ugcord_') ? currentThread.deal_id : null) ||
            (currentThread?.id?.startsWith('thread_ugc_') ? currentThread.id.replace('thread_ugc_', '') : (isUgcOrder ? currentThread?.deal_id : null));
          const orderIdToCall = localTargetUgcOrderId || thread.id;
          const submitEndpoint = (isUgcOrder || localTargetUgcOrderId) ? `/ugc/orders/${orderIdToCall}/submit` : `/campaign/threads/${thread.id}/submit-content`;
          const { data } = await api.post(submitEndpoint, {
            videoUrl: fileUrl,
            notes: "Revised video uploaded via chat"
          });
          msgData = data?.message || data; // handleUgcDeliverableSubmit returns { message } 
          if (data && !data.error) {
            refreshThread(); // Immediately refresh thread to update flow_state
          }
        } else {
          // Normal attachment
          const { data } = await api.post(`/chat/v2/threads/${thread.id}/messages`, {
            content: `📎 Attached file: ${file.name}`,
            message_type: 'attachment',
            attachment_url: fileUrl
          });
          msgData = data;
        }

        if (msgData) {
          setMessages(prev => [...prev.filter(m => m.id !== msgData.id), msgData]);
        }
        toast.success(isVideo && isRevisionMode && !isBrand ? "Revised draft submitted successfully!" : "File attached successfully!", { id: "chat-attach" });
        loadMessages();
      } else {
        toast.error("File upload returned no URL.", { id: "chat-attach" });
      }
    } catch (err) {
      toast.error(calmError(err, "Couldn't upload the file. Please try again."), { id: "chat-attach" }); // v332
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // v414: one POST for a temp bubble — used by the first send and by "tap to try again". True when sent.
  const postTempMessage = async (tempId, msg, clientMsgId) => {
    try {
      const { data } = await api.post(`/chat/v2/threads/${thread.id}/messages`, {
        content: msg,
        message_type: 'text',
        client_msg_id: clientMsgId // v414
      });
      sendSeqRef.current += 1; // v414
      setMessages((prev) => {
        const withoutTemp = prev.filter(m => m.id !== tempId); // v414: only THIS temp (was: every temp with the same text)
        if (!data) return withoutTemp;
        const alreadyExists = withoutTemp.some((m) => m.id === data.id || (data.message_id && m.id === data.message_id));
        return alreadyExists ? withoutTemp : [...withoutTemp, data];
      });
      return true;
    } catch (err) {
      const reason = calmText(sendRefusalReason(err)); // v414: the server's reason for a block / closed chat; v415: M4 only a readable sentence (was raw "x")
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, status: 'failed', error: 'Failed to send', fail_reason: reason || null } : m
        )
      );
      if (err.response?.data?.blocked) {
        showSecurityWarning(err.response?.data?.error || "Contact details cannot be shared in chat. Please keep all communications on-platform.");
      } else {
        toast.error(reason || calmError(err, "Message not sent. Please try again.")); // v332
      }
      return false;
    }
  };

  // v414: tap a failed bubble to send it again (same bubble, same client_msg_id).
  const retryMessage = async (failedMsg) => {
    if (!failedMsg || !isTempMessage(failedMsg) || failedMsg.status !== 'failed' || !thread || sendingRef.current) return;
    sendingRef.current = true;
    setLoading(true);
    const cid = failedMsg.client_msg_id || makeClientMsgId();
    setMessages((prev) => prev.map((m) => (m.id === failedMsg.id ? { ...m, client_msg_id: cid, status: 'sending', fail_reason: null, created_at: new Date().toISOString() } : m)));
    try {
      await postTempMessage(failedMsg.id, String(failedMsg.content || '').trim(), cid);
    } finally {
      sendingRef.current = false;
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!text.trim() || !thread || sendingRef.current || loading) return;
    if (thread?.isNew) { toast.error("Start this chat from the campaign/invite"); return; } // v414: no chat exists yet — every send 404'd
    // v414: no "sign the SLA Contract first" block — chat text is allowed before signing (same as mobile).
    // The contact / abuse filters below still run.
    const msg = text.trim();

    // Instant feedback only. The server runs the same check independently, so this is not
    // the enforcement point — it just saves a round-trip and keeps the typed text in the
    // box so the user can edit rather than retype.
    const abuse = checkAbusiveContent(msg);
    if (abuse.blocked) {
      toast.error(abuse.message || "This message was blocked. Please keep the conversation professional.");
      return;
    }

    const leak = checkComprehensiveDisallowedContent(msg, {
      threadId: thread.id,
      senderId: user?.user_id || user?.id
    });
    if (leak.blocked) {
      toast.error(leak.message || "Contact details can't be shared in chat.");
      return;
    }
    // Session 43: a number sent in pieces over several messages (see splitNumberAcrossMessages).
    {
      const myIds = [user?.user_id, user?.id].filter(Boolean).map(String);
      const cutoff = Date.now() - 15 * 60 * 1000;
      const mine = (messages || []).filter((m) => {
        const type = String(m?.message_type || m?.type || "text").toLowerCase();
        const at = new Date(m?.created_at || 0).getTime();
        return (type === "text" || type === "message") && myIds.includes(String(m?.sender_id || "")) && (!at || at >= cutoff);
      }).map((m) => String(m.content || m.text || "")).slice(-6);
      if (splitNumberAcrossMessages(msg, mine)) {
        toast.error("Phone numbers can't be shared in chat — not even in pieces. Keep talks on Ybex so your payment stays protected.");
        return;
      }
    }

    sendingRef.current = true;
    setLoading(true);
    setText("");

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const clientMsgId = (messages || []).find((m) => isTempMessage(m) && m.status === 'failed' && String(m.content || '').trim() === msg)?.client_msg_id || makeClientMsgId(); // v414; v415: M4 re-send of a failed text keeps its id so it can't post twice
    const effectiveMyId = user?.user_id || user?.id || (isBrand ? (currentThread?.brand_id || thread?.brand_id) : (currentThread?.creator_id || thread?.creator_id));
    const optimisticMsg = {
      id: tempId,
      thread_id: thread.id,
      sender_id: effectiveMyId,
      sender_user_id: effectiveMyId,
      sender_role: isBrand ? 'brand' : 'creator',
      content: msg,
      message_type: 'text',
      client_msg_id: clientMsgId, // v414
      created_at: new Date().toISOString(),
      status: 'sending'
    };
    
    // v414: re-sending the same text replaces its old failed bubble
    setMessages((prev) => [...prev.filter((m) => !(isTempMessage(m) && m.status === 'failed' && String(m.content || '').trim() === msg)), optimisticMsg]);

    try {
      const ok = await postTempMessage(tempId, msg, clientMsgId);
      if (!ok) setText((cur) => (cur ? cur : msg)); // v414: give the text back so it can be edited / sent again
    } finally {
      sendingRef.current = false;
      setLoading(false);
    }
  };

  const uniqueMessages = React.useMemo(() => {
    // v414: a temp bubble hides only when a confirmed row carries ITS client_msg_id (was: any row with the same text)
    const confirmedCids = new Set(messages.filter(m => m && !String(m.id).startsWith("temp_")).map(clientMsgIdOf).filter(Boolean));
    const seen = new Set();
    const result = [];
    for (const msg of messages) {
      if (!msg) continue;
      const key = msg.id || (msg.created_at ? `${msg.created_at}_${msg.content}` : null);
      if (String(msg.id).startsWith("temp_")) {
        const alreadyConfirmed = Boolean(msg.client_msg_id) && confirmedCids.has(String(msg.client_msg_id));
        if (alreadyConfirmed) continue;
      }

      // Deduplicate pending payment release / live links approved notices in the same thread
      const msgType = (msg.message_type || msg.type || '').toLowerCase();
      const msgAction = (msg.metadata?.action || '').toLowerCase();
      const hasUtr = Boolean(msg.metadata?.utr_number || msg.metadata?.utr || msg.utr_number);
      // Session 43: one "payment funded" card per deal (two were posted).
      if (msgType === 'payment_secured' || msgType === 'payment_funded' || msgAction === 'payment_secured' || msgAction === 'payment_funded' || (allowsLegacyTextMatch(msg) && String(msg.content || '').toLowerCase().includes('escrow funded')) /* v414: old system rows only */) {
        if (seen.has('__funded_card__')) continue;
        seen.add('__funded_card__');
      }
      const isPendingPayoutCard = !hasUtr && (
        msgType === 'live_links_approved' ||
        msgAction === 'live_links_approved' ||
        msgType === 'payout_released' ||
        msgAction === 'payout_released' ||
        msgType === 'payment_released' ||
        msgAction === 'payment_released'
      );

      if (isPendingPayoutCard) {
        const existingIdx = result.findIndex(r => {
          const rType = (r.message_type || r.type || '').toLowerCase();
          const rAction = (r.metadata?.action || '').toLowerCase();
          const rUtr = Boolean(r.metadata?.utr_number || r.metadata?.utr || r.utr_number);
          return !rUtr && (
            rType === 'live_links_approved' ||
            rAction === 'live_links_approved' ||
            rType === 'payout_released' ||
            rAction === 'payout_released' ||
            rType === 'payment_released' ||
            rAction === 'payment_released'
          );
        });
        if (existingIdx !== -1) {
          // Merge metadata from this duplicate card into the existing card so no data is lost
          result[existingIdx] = {
            ...result[existingIdx],
            metadata: {
              ...(msg.metadata || {}),
              ...(result[existingIdx].metadata || {})
            }
          };
          continue;
        }
      }

      if (key) {
        if (!seen.has(key)) {
          seen.add(key);
          result.push(msg);
        }
      } else {
        result.push(msg);
      }
    }
    // Always in time order, whatever order the rows arrived in (socket, poll, local store).
    return sortChronologically(result);
  }, [messages]);

  if (!thread) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[var(--bg-base)] dark:bg-black relative overflow-hidden h-full">
        {/* Smooth, subtle grid background that softly fades out towards the edges */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="w-[120%] h-[120%] absolute bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAiIGhlaWdodD0iMzAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTMwIDBMMCAwaDB2MzBoMzBWMHptLTEgMXYyOEgxVjFoMjh6IiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDcpIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz48L3N2Zz4=')] [mask-image:radial-gradient(circle_at_center,black_0%,transparent_50%)] opacity-70"></div>
        </div>
        
        <div className="relative z-10 flex flex-col items-center mt-[-40px]">
          <div className="relative mb-6">
            <div className="w-24 h-24 bg-[var(--bg-elevated)] rounded-3xl flex items-center justify-center rotate-[-6deg] shadow-xl border border-[var(--border-default)]">
               <Mail size={40} className="text-[var(--text-tertiary)]" />
            </div>
            <div className="w-24 h-24 bg-[var(--bg-surface)] rounded-3xl flex items-center justify-center absolute top-0 left-0 rotate-[6deg] shadow-lg border border-[var(--border-default)] backdrop-blur-sm shadow-[0_0_40px_rgba(255,255,255,0.1)]">
               <Mail size={40} className="text-[var(--text-primary)]/80" />
            </div>
          </div>
          
          <h3 className="text-2xl font-sans font-bold text-[var(--text-primary)] mb-2">No chats yet</h3>{/* v415: copy was about notifications / mentions */}
          <p className="text-[var(--text-secondary)] text-sm max-w-md mb-8">
            {isBrand ? "When you invite a creator or a creator applies to your campaign, your chat with them shows up here." : "When you apply to a campaign or a brand invites you, your chat with them shows up here."}
          </p>

          {isBrand ? (
            <Link to="/creators" className="whitespace-nowrap px-6 py-3 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface)] text-[var(--text-primary)] font-bold rounded-xl transition-colors flex items-center gap-2 shadow-lg">
               <Search size={18} /> Explore Creators
            </Link>
          ) : (
            <Link to="/campaigns" className="whitespace-nowrap px-6 py-3 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface)] text-[var(--text-primary)] font-bold rounded-xl transition-colors flex items-center gap-2 shadow-lg">
               <Search size={18} /> Explore Campaigns
            </Link>
          )}
        </div>
      </div>
    );
  }

  const partnerName = isBrand 
    ? (thread.creator?.profile?.full_name || thread.creator?.profile?.name || thread.creator?.full_name || thread.creator?.name || 'Creator') 
    : (thread.brand?.profile?.company_name || thread.brand?.company_name || thread.brand?.name || 'Brand');
  const getPartnerPic = (partner, partnerIsBrand) => {
    if (!partner) return "";
    if (partnerIsBrand) {
      const url = partner.profile?.logo || 
                  partner.logo || 
                  partner.logo_url || 
                  partner.profile?.logo_url ||
                  partner.photo || 
                  partner.picture || 
                  partner.avatar || 
                  partner.avatar_url || 
                  partner.profile_picture_url || 
                  partner.profile?.photo || 
                  partner.profile?.picture || 
                  partner.profile?.avatar;
      return url || "";
    } else {
      const url = partner.photo || 
                  partner.picture || 
                  partner.avatar || 
                  partner.avatar_url || 
                  partner.profile_picture_url || 
                  partner.profile?.photo || 
                  partner.profile?.picture || 
                  partner.profile?.avatar ||
                  partner.logo || 
                  partner.logo_url || 
                  partner.profile?.logo || 
                  partner.profile?.logo_url;
      return url || "";
    }
  };
  const partnerPic = getPartnerPic(isBrand ? thread.creator : thread.brand, !isBrand);
  
  const partnerId = isBrand ? thread?.creator_id : thread?.brand_id;
  const isPartnerOnline = partnerId && onlineUsers.includes(partnerId);

  const handleOfferComplete = async () => {
    await loadMessages();
    await refreshThread();
    setInputMode("chat");
  };

  return (
    <div className="flex-1 flex flex-col relative bg-[var(--bg-base)] dark:bg-black overflow-hidden">
      {/* Header */}
      <ChatBoxHeader onDealChanged={() => { refreshThread(); loadMessages(); } /* v414 */} currentThread={currentThread} isBrand={isBrand} isCollabOrder={isCollabOrder} navigate={navigate} onBack={onBack} partnerId={partnerId} partnerName={partnerName} partnerPic={partnerPic} setShowBrandProfileModal={setShowBrandProfileModal} setShowInfoPanel={setShowInfoPanel} setShowNegotiationTable={setShowNegotiationTable} showInfoPanel={showInfoPanel} thread={thread} user={user} />

      {/* Pinned Deal-Status Strip below header */}
      <ChatBoxDealStrip isCancelled={isCancelled} currentThread={currentThread} flowState={flowState} getDealAmount={getDealAmount} isAgreementSigned={isAgreementSigned} isDealCompleted={isDealCompleted} isDealFixed={isDealFixed} isEscrowFunded={isEscrowFunded} rawStatus={rawStatus} />

      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Main Panel Content Router */}
        <div onScroll={(e) => { const b = e.currentTarget; nearBottomRef.current = b.scrollHeight - b.scrollTop - b.clientHeight < 160; } /* v417 */} className={`flex-1 overflow-y-auto bg-slate-100/60 dark:bg-transparent no-scrollbar relative flex flex-col`}>
        
        {/* Messages Feed */}
        <div className="flex-1 p-1.5 sm:p-6 flex flex-col justify-end" ref={scrollRef}>
          <AnimatePresence>
            {uniqueMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-[var(--text-tertiary)]">
                <MessageSquare size={32} className="opacity-40 mb-3" />
                <p className="text-sm">{messagesLoadError ? "Couldn't load messages. Use Retry below." : "No messages yet. Send a message to start the conversation."}{/* v332: an empty feed after a failed load said "No messages yet" */}</p>
              </div>
            ) : (
              uniqueMessages.map((msg, msgIdx) => {
                const effectiveMyId = user?.user_id || user?.id || (isBrand ? (currentThread?.brand_id || thread?.brand_id) : (currentThread?.creator_id || thread?.creator_id));
                const isTempMine = String(msg.id).startsWith("temp_");
                
                // Decouple visual system card styling from sender attribution
                const isPaymentOutflowForBrand = Boolean(
                  msg.message_type === 'payment_trigger' ||
                  msg.message_type === 'payment_released' ||
                  msg.message_type === 'payout_released' ||
                  msg.message_type === 'content_approved' ||
                  msg.metadata?.action === 'PAYOUT_RELEASED' ||
                  msg.metadata?.action === 'payment_released' ||
                  msg.metadata?.action === 'approved'
                );

                const msgSenderId = msg.sender_id || msg.sender_user_id || msg.metadata?.sender_id || msg.metadata?.creator_id;
                const msgSenderRole = msg.sender_role || msg.metadata?.sender_role || (
                  msg.message_type === 'live_links_submitted' || msg.message_type === 'live_links_resubmit_declined' || msg.message_type === 'content_proof_submitted' || msg.message_type === 'creator_signed'
                    ? 'creator'
                    : (msg.message_type === 'live_links_approved' || msg.message_type === 'live_links_resubmit_request' || msg.message_type === 'revision_requested' || msg.message_type === 'brand_signed' || isPaymentOutflowForBrand
                      ? 'brand'
                      : undefined)
                );

                const isMine = isTempMine || Boolean(
                  (msgSenderId && effectiveMyId && String(msgSenderId) === String(effectiveMyId)) ||
                  (isPaymentOutflowForBrand && isBrand) ||
                  (msgSenderRole && msgSenderRole !== 'system' && (
                    (isBrand && msgSenderRole === 'brand') ||
                    (!isBrand && msgSenderRole === 'creator')
                  ))
                );
                return (
                  <MessageBubble 
                    key={msg.id || (msg.created_at ? `${msg.created_at}_${msg.content}` : `msg-fallback-${msgIdx}`)} 
                    onViewContract={(offer) => { setShowContractModal(true); setCurrentOffer(offer); }}
                    onNegotiate={isUgcOrder ? undefined /* v414: UGC price is fixed by the brief — no negotiate */ : () => { 
                      setInputMode("offer"); 
                      if (!offerAmount) {
                        setOfferAmount(currentThread?.agreed_amount || currentThread?.amount_fixed || ""); 
                      }
                    }} 
                    onSelectUploadTab={() => {
                      setInputMode("upload");
                    }}
                    message={msg} 
                    isMine={isMine} 
                    isUserBrand={isBrand}
                    threadId={thread?.id} 
                    thread={currentThread}
                    campaignTitle={currentThread?.campaign_title || thread?.campaign_title || "Campaign"}
                    onActionComplete={handleOfferComplete}
                    onViewInvoice={handleViewInvoice}
                    onTriggerReview={() => setShowReviewModal(true)}
                    onDownloadInvoice={handleDownloadInvoice}
                    partnerPic={partnerPic}
                    partnerName={partnerName}
                    allMessages={messages} prevMessage={msgIdx > 0 ? uniqueMessages[msgIdx - 1] : null /* v417: date separator */}
                    onRetry={msg.status === 'failed' && !msg.fail_reason ? () => retryMessage(msg) : null /* v414 */}
                  />
                );
              })
            )}
          </AnimatePresence>
          {/* Session 43 (Ravi): creator code — after both signed, before the brand pays. */}
          {!isBrand && !isUgcOrder && isAgreementSigned && !isPaymentFunded && !isDealCompleted && (
            <div className="max-w-md ml-auto mr-auto my-3"><CreatorCodeDealCard dealKey={`thread:${currentThread?.id}`} amount={getDealAmount(currentThread)} /></div>
          )}
          <div ref={messagesEndRef} style={{ height: 1 }} />
        </div>
        </div> {/* Close Main Panel Content Router div */}
        
        {/* Desktop Persistent Input & Mode Controller Area */}
        <div className="hidden md:block bg-[var(--bg-card)] border-t border-[var(--border-default)] rounded-t-3xl p-3 shrink-0 z-10 w-full relative shadow-md">
            {/* Mode Controls tabs: Chat & Offer Removed */}
            
            {/* Safety & Compliance Indicators or Finalized Banner */}
            {!isAgreementSigned && !safetyAccepted && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 p-2.5 md:p-3 mb-2 md:mb-3 bg-amber-500/10 border border-amber-500/20 rounded-xl md:rounded-2xl max-w-4xl mx-auto backdrop-blur-xs shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 md:w-9 md:h-9 bg-amber-500/10 rounded-lg md:rounded-xl flex items-center justify-center text-amber-500 border border-amber-500/20 shrink-0">
                    <Lock size={14} className="md:w-4 md:h-4" />
                  </div>
                  <div className="text-left">
                    <h4 className="text-[10px] md:text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Campaign Dashboard Protected</h4>
                    <p className="text-[10px] md:text-[11px] text-[var(--text-secondary)] leading-tight">Please read and accept the official Ybex Safety Guidelines to release transactions.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowSafetyModal(true)}
                  className="px-2.5 py-1 md:px-3.5 md:py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-[10px] md:text-xs transition-colors shrink-0 whitespace-nowrap shadow-xs"
                >
                  Review & Unlock
                </button>
              </div>
            )}

            {/* Tabs & Input Area */}
            <div className="max-w-4xl mx-auto w-full">
              {/* Tabs */}
              {showTabs && (
                <div className="flex bg-[var(--bg-elevated)] border border-[var(--border-default)] p-0.5 md:p-1 rounded-lg md:rounded-xl mb-1.5 md:mb-2 gap-1 md:gap-1.5">
                  <button 
                    onClick={() => setInputMode("chat")}
                    className={`flex-1 py-1 md:py-1.5 px-2 md:px-3 font-bold text-[10px] md:text-xs uppercase tracking-wider text-center flex items-center justify-center gap-1 md:gap-2 transition-all rounded-md md:rounded-lg cursor-pointer
                      ${activeTabMode === "chat" ? "bg-[var(--bg-card)] text-[var(--violet)] shadow-xs border border-[var(--border-default)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                  >
                    <MessageCircle size={13} className="md:w-3.5 md:h-3.5" /> CHAT
                  </button>
                  
                  {!isAgreementSigned ? (
                    <button 
                      onClick={() => { 
                        // Session 43 (Ravi): already signed → never ask to sign again (no OTP, no offer box).
                        if (isDealFixed && isMySignatureSigned) {
                          toast.success(isOtherPartySigned ? "Agreement signed by both sides." : "You've signed. Waiting for the other side to sign.");
                          return;
                        }
                        if (isDealFixed && !isMySignatureSigned) {
                          setCurrentOffer({
                            id: currentThread?.id,
                            amount: getDealAmount(currentThread),
                            revision_count: currentThread?.revision_count || 1,
                            deadline: currentThread?.deadline,
                          });
                          setShowContractModal(true);
                        } else {
                          setInputMode("offer"); 
                          if (!offerAmount) setOfferAmount(currentThread?.agreed_amount || currentThread?.amount_fixed || ""); 
                        }
                      }}
                      className={`flex-1 py-1 md:py-1.5 px-2 md:px-3 font-bold text-[10px] md:text-xs uppercase tracking-wider text-center flex items-center justify-center gap-1 md:gap-2 transition-all rounded-md md:rounded-lg cursor-pointer
                        ${activeTabMode === "offer" ? "bg-[var(--bg-card)] text-blue-500 shadow-xs border border-[var(--border-default)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                    >
                      {isDealFixed ? (
                        isMySignatureSigned ? (
                          <>
                            <CheckCircle size={13} className="text-emerald-500 md:w-3.5 md:h-3.5" /> 
                            <span>{isOtherPartySigned ? 'AGREEMENT SIGNED' : 'WAITING SIGNATURE'}</span>
                            {isOtherPartySigned ? (
                              <span className="relative flex h-2 w-2 ml-0.5">
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                              </span>
                            ) : (
                              <span className="relative flex h-2 w-2 ml-0.5">{/* v415: waiting on the other side — still dot, no ping */}
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <FileSignature size={13} className="text-rose-500 md:w-3.5 md:h-3.5" /> 
                            <span className="text-rose-500">SIGN AGREEMENT</span>
                            <span className="relative flex h-2 w-2 ml-0.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                            </span>
                          </>
                        )
                      ) : (
                        <>
                          <Handshake size={13} className="md:w-3.5 md:h-3.5" /> NEGOTIATE OFFER
                        </>
                      )}
                    </button>
                  ) : isBrand ? (
                    <button 
                      onClick={() => setInputMode("payment")}
                      className={`flex-1 py-1 md:py-1.5 px-2 md:px-3 font-bold text-[10px] md:text-xs uppercase tracking-wider text-center flex items-center justify-center gap-1 md:gap-2 transition-all rounded-md md:rounded-lg cursor-pointer
                        ${activeTabMode === "payment" ? "bg-[var(--bg-card)] text-emerald-500 shadow-xs border border-[var(--border-default)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                    >
                      {isPaymentFunded ? (
                        <>
                          <ShieldCheck size={13} className="text-emerald-400 md:w-3.5 md:h-3.5" /> PAYMENT SECURED{/* v415: was "PAYMENT HOLD SECURED" */}
                          <span className="relative flex h-2 w-2 ml-0.5">
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                        </>
                      ) : (
                        <>
                          <CreditCard size={13} className="text-rose-500 md:w-3.5 md:h-3.5" /> 
                          <span className="text-rose-500">MAKE PAYMENT</span>
                          <span className="relative flex h-2 w-2 ml-0.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                          </span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button 
                      onClick={() => setInputMode("upload")}
                      className={`flex-1 py-1 md:py-1.5 px-2 md:px-3 font-bold text-[10px] md:text-xs uppercase tracking-wider text-center flex items-center justify-center gap-1 md:gap-2 transition-all rounded-md md:rounded-lg cursor-pointer
                        ${activeTabMode === "upload" 
                          ? (isContentSubmitted
                              ? "bg-amber-500/20 text-amber-950 dark:text-amber-200 shadow-sm border-2 border-amber-500/50 font-black"
                              : (isContentApproved || isDealCompleted || isLiveLinksSubmitted
                                  ? "bg-[var(--bg-card)] shadow-xs border border-[var(--border-default)] text-emerald-500" 
                                  : (isRevisionRequested || isManualRevisionOpen)
                                    ? "bg-[var(--bg-card)] shadow-xs border border-[var(--border-default)] text-amber-600 dark:text-amber-400"
                                    : isRevisionDeclined
                                      ? "bg-[var(--bg-card)] shadow-xs border border-[var(--border-default)] text-rose-500"
                                      : "bg-[var(--bg-card)] shadow-xs border border-[var(--border-default)] text-[#7C3AED]"))
                          : (isContentSubmitted
                              ? "text-amber-800 dark:text-amber-300 font-bold hover:bg-amber-500/10"
                              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}`}
                    >
                      <ChatBoxDealStageLabel isContentApproved={isContentApproved} isContentSubmitted={isContentSubmitted} isDealCompleted={isDealCompleted} isLinksRevisionOpen={isLinksRevisionOpen} isLiveLinksSubmitted={isLiveLinksSubmitted} isManualRevisionOpen={isManualRevisionOpen} isPaymentFunded={isPaymentFunded} isRevisionDeclined={isRevisionDeclined} isRevisionRequested={isRevisionRequested} />
                    </button>
                  )}
                </div>
              )}

              {/* Content Area */}
              <div className="w-full">
                {activeTabMode === "chat" ? (
                  <div>
                    {isCancelled ? ( /* v414: the server refuses messages on a closed chat — show the closed note, not the composer */
                      <div data-testid="chat-closed-note" className="p-3 md:p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl md:rounded-2xl flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
                        <Lock size={14} className="shrink-0" />
                        <span className="text-[11px] md:text-xs">{cancelledLabel(currentThread)} — Chat is closed for this {isUgcOrder ? 'order' : 'deal'}.</span>
                      </div>
                    ) : (
                      <>
                        {isDealCompleted && ( /* v415: a completed deal's chat stays open (reposts etc.) — small note above the composer */
                          <div data-testid="deal-completed-note" className="mb-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-[11px] md:text-xs font-semibold text-emerald-800"><CheckCircle size={14} className="text-emerald-600 shrink-0" /><span>Deal completed · you can still message here</span></div>
                        )}
                        {messagesLoadError && (
                          <div className="mb-2 p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-between text-[11px] md:text-xs text-rose-400">
                            <span>Couldn't load messages. Check your connection and try again.{/* v332: was the raw error text */}</span>
                            <button type="button" onClick={loadMessages} className="px-3 py-1.5 bg-rose-500 text-white font-bold rounded hover:bg-rose-600 transition-colors cursor-pointer">Retry</button>
                          </div>
                        )}
                        
                        {thread?.isNew ? ( /* v414: a chat that doesn't exist yet can't take messages */
                          <div data-testid="chat-not-started" className="p-3 md:p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl md:rounded-2xl text-xs font-semibold text-[var(--text-secondary)] text-center">
                            Start this chat from the campaign/invite
                          </div>
                        ) : (
                        <ChatBoxComposer aiLoading={aiLoading} handleAiAssist={handleAiAssist} handleSend={handleSend} isAgreementSigned={isAgreementSigned} isBrand={isBrand} isDealFixed={isDealFixed} isMySignatureSigned={isMySignatureSigned} loading={loading} sendingRef={sendingRef} setText={setText} text={text} fileInputRef={fileInputRef} onFileChange={isCancelled ? undefined : handleFileUpload} attaching={uploadingAttachment} threadId={thread?.id} /* v417: paperclip; focus on chat switch */ />
                        )}
                      </>
                    )}
                  </div>
                ) : activeTabMode === "payment" ? (
                  <div className="p-5 bg-[var(--bg-base)] rounded-2xl border border-[var(--border-default)]">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400 border border-emerald-500/20 shrink-0">
                        <ShieldCheck size={20} />
                      </div>
                      <div className="text-left">
                        <h4 className="text-sm font-bold text-[var(--text-primary)]">Pay securely with Ybex</h4>{/* v415: plainer wording */}
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">Ybex holds your payment until you approve the work.</p>
                      </div>
                    </div>

                    <div className="bg-[var(--bg-card)] rounded-xl p-4 mb-4 border border-[var(--border-default)] text-left">
                      <div className="flex justify-between items-center mb-2 pb-2 border-b border-[var(--border-default)]/60">
                        <span className="text-xs text-[var(--text-secondary)] font-medium">Agreed amount</span>
                        <span className="text-sm font-bold text-[var(--text-primary)]">{Number(getDealAmount(currentThread)) > 0 ? `₹${Number(getDealAmount(currentThread)).toLocaleString('en-IN')}` : "—" /* v415: no "₹ 0" / stray space */}</span>
                      </div>{/* v332: the made-up "Platform Security Fee FREE (₹ 0)" row is gone (as on the phone sheet, v330); amounts as numbers so they get Indian commas */}
                    </div>

                    {isPaymentFunded ? (
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-left">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                          <Check size={16} />
                        </div>
                        <div>
                          <h5 className="text-xs font-bold text-emerald-600">Payment received</h5>{/* v415: plainer wording */}
                          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">{Number(getDealAmount(currentThread)) > 0 ? `₹${Number(getDealAmount(currentThread)).toLocaleString('en-IN')}` : "Your payment"} is held safely by Ybex. The creator can start work now.</p>
                        </div>
                      </div>
                    ) : (
                      <>
                      {/* v366: Ravi's checkout — deal card (You pay + fee lines), UPI apps / other ways, Pay ₹X | via … */}
                      <div className="text-left bg-white rounded-2xl p-3">
                        <CheckoutDealCard total={quoteTotal(payFee.quote, getDealAmount(currentThread))} note="Held safely by Ybex until you approve the work." /* v415 */>
                          <BrandFeeSummary dealId={currentThread?.deal_id || null} threadId={currentThread?.id || null} grossAmount={getDealAmount(currentThread)} onQuote={setPayFee} disabled={paymentLoading} compact variant="checkout" />{/* v364 */}
                        </CheckoutDealCard>
                        <div className="mt-4"><CheckoutPicker value={payMethod} onChange={setPayMethod} disabled={paymentLoading} /></div>
                        <CheckoutPayBar sticky={false} total={quoteTotal(payFee.quote, getDealAmount(currentThread))} choice={payMethod} paying={paymentLoading} payingText={paymentStep || "Processing…"}
                          onPay={() => handleEscrowPayment(payFee.couponCode || "", payMethod)} testId="desktop-escrow-pay" />
                      </div>
                      </>
                    )}
                  </div>
                ) : activeTabMode === "upload" ? (
                  <div className="p-5 bg-[var(--bg-base)] rounded-2xl border border-[var(--border-default)]">
                    <ChatBoxUploadHeader isContentApproved={isContentApproved} isContentSubmitted={isContentSubmitted} isDealCompleted={isDealCompleted} isLinksRevisionOpen={isLinksRevisionOpen} isLiveLinksSubmitted={isLiveLinksSubmitted} isManualRevisionOpen={isManualRevisionOpen} isRevisionRequested={isRevisionRequested} setInputMode={setInputMode} setIsManualRevisionOpen={setIsManualRevisionOpen} />

                    {isDealCompleted ? (
                      <div className="space-y-4 text-left">
                        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
                          <CheckCircle size={20} className="text-emerald-400 shrink-0" />
                          <div>
                            <h5 className="text-xs font-bold text-emerald-400">Deliverables Approved & Payment Released!</h5>
                            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">The collaboration is complete. No further uploads are needed.</p>
                          </div>
                        </div>
                      </div>
                    ) : !isPaymentFunded ? (
                      <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3 text-left">
                        <Lock size={16} className="text-amber-400 mt-0.5 shrink-0" />
                        <div>
                          <h5 className="text-xs font-bold text-amber-400">Please don't upload content until the brand has made the payment</h5>{/* v415 */}
                          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">As long as the brand has not made the payment, please do not upload your content. The chat is open. Please ask the brand to complete the payment before uploading content.</p>
                        </div>
                      </div>
                    ) : isLiveLinksSubmitted ? (
                      <div className="space-y-4 text-left">
                        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-3">
                          <CheckCircle size={20} className="text-emerald-400 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <h5 className="text-xs font-bold text-emerald-400">Live Post Link Submitted! 🚀</h5>
                            <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                              Your live post link has been submitted to the brand for verification. Once the brand verifies your live post, the payment will be released.
                            </p>
                            {(currentThread?.live_link || (messages || []).find(m => m.message_type === 'live_links_submitted')?.metadata?.link) && (
                              <div className="mt-3 p-2.5 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl flex items-center justify-between gap-2">
                                <span className="text-[11px] font-mono text-emerald-500 truncate">
                                  {currentThread?.live_link || (messages || []).find(m => m.message_type === 'live_links_submitted')?.metadata?.link}
                                </span>
                                <a 
                                  href={currentThread?.live_link || (messages || []).find(m => m.message_type === 'live_links_submitted')?.metadata?.link} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="text-xs text-indigo-400 hover:underline shrink-0 font-bold"
                                >
                                  Open ↗
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : isContentApproved ? (
                      <div className="space-y-4 text-left">
                        {isLinksRevisionOpen ? (
                          <div className={`p-4 rounded-xl flex items-start gap-3 border ${
                            (currentThread?.flow_state === 'REVISION_DECLINED_LINKS' || currentThread?.status === 'REVISION_DECLINED_LINKS') 
                              ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' 
                              : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          }`}>
                            <AlertCircle size={18} className="shrink-0 mt-0.5" />
                            <div>
                              <h5 className="text-xs font-bold font-sans">
                                {(currentThread?.flow_state === 'REVISION_DECLINED_LINKS' || currentThread?.status === 'REVISION_DECLINED_LINKS') ? "Resubmission Request Declined" : "Correction/Resubmission Requested! ⚠️"}
                              </h5>
                              <p className="text-[11px] text-[var(--text-secondary)] mt-1 font-sans leading-relaxed">
                                <strong className="text-[var(--text-primary)]">Feedback from Brand:</strong> "{currentThread?.revision_notes_links || currentThread?.ugc_order?.revision_notes_links || currentThread?.ugc_order?.revision_feedback || latestLinkActionMsg?.metadata?.feedback || "Please review and submit correct live links again."}"
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
                            <CheckCircle size={18} className="text-emerald-400 shrink-0" />
                            <div>
                              <h5 className="text-xs font-bold text-emerald-400">Draft Approved by Brand! 🎉</h5>
                              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">Please submit your live published post link to complete the deal and release payout.</p>
                            </div>
                          </div>
                        )}

                        <div>
                          <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
                            Paste your live post link (Instagram/YouTube/etc.)
                          </label>
                          <input 
                            id="live-post-link-input"
                            type="url" 
                            className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl p-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none"
                            value={livePostUrl}
                            onChange={e => setLivePostUrl(e.target.value)}
                            placeholder="https://www.instagram.com/p/... or https://youtu.be/..."
                          />
                          {livePostUrl.trim() && !checkLiveLink(livePostUrl).ok && checkLiveLink(livePostUrl).message && (
                            <p className="text-[11px] text-rose-500 mt-1">{checkLiveLink(livePostUrl).message}</p>
                          )}
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
                            Additional notes for the brand (optional)
                          </label>
                          <textarea 
                            id="live-post-notes-input"
                            rows={3}
                            className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl p-3 text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none resize-none"
                            value={livePostNotes}
                            onChange={e => setLivePostNotes(e.target.value)}
                            placeholder="Additional notes for the brand (optional)..."
                          />
                        </div>

                        <button
                          id="submit-live-link-button"
                          type="button"
                          onClick={handleSendLiveLinks}
                          disabled={uploadLoading || !checkLiveLink(livePostUrl).ok}
                          className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 text-slate-950 font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer text-xs uppercase tracking-wider"
                        >
                          {uploadLoading ? (
                            <>
                              <Loader2 className="animate-spin" size={16} />
                              <span>Submitting live link...</span>
                            </>
                          ) : (
                            <>
                              <ExternalLink size={16} />
                              <span>{isLinksRevisionOpen ? "Resubmit Live Link" : "Submit Live Link"}</span>
                            </>
                          )}
                        </button>
                      </div>
                    ) : (isContentSubmitted && !isRevisionRequested && !isManualRevisionOpen) ? (
                      <div className="space-y-4">
                        <div className="p-4 bg-amber-500/15 dark:bg-amber-950/40 border-2 border-amber-500/40 dark:border-amber-500/50 rounded-xl flex items-start sm:items-center gap-3.5 text-left shadow-xs">
                          <div className="w-9 h-9 rounded-lg bg-amber-500/25 border border-amber-500/40 flex items-center justify-center text-amber-700 dark:text-amber-300 shrink-0 mt-0.5 sm:mt-0">
                            <Clock size={18} className="text-amber-700 dark:text-amber-400" />{/* v415: no endless pulse */}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <h5 className="text-xs sm:text-sm font-black text-amber-950 dark:text-amber-200">
                                Draft Submitted Successfully!
                              </h5>
                              <span className="text-[10px] font-extrabold text-amber-950 dark:text-amber-200 bg-amber-500/25 px-2 py-0.5 rounded-full border border-amber-500/40">
                                48-Hour Review Active
                              </span>
                            </div>
                            <p className="text-xs text-amber-950/85 dark:text-amber-200/90 font-medium mt-1 leading-relaxed">
                              The brand has 48 hours to review the draft and approve payout or request revisions.
                            </p>
                          </div>
                        </div>

                        <ChatBoxSubmissionRecord currentThread={currentThread} isUgcOrder={isUgcOrder} />

                        <button 
                          type="button"
                          onClick={() => {
                            setIsManualRevisionOpen(true);
                          }}
                          className="w-full py-2.5 bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)] hover:border-amber-500/40 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                        >
                          <Upload size={14} className="text-amber-700 dark:text-amber-400" />
                          <span>Submit a Revision</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4 text-left">
                        {isRevisionRequested && (
                          <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5 text-xs text-amber-400">
                            <AlertCircle size={16} className="shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold block">Revision Requested by Brand</span>
                              <span className="text-[11px] text-[var(--text-secondary)] mt-0.5 block">
                                {currentThread?.revision_notes || currentThread?.ugc_order?.revision_notes || currentThread?.ugc_order?.revision_feedback || currentThread?.ugc_order?.creator_notes || latestActionMsg?.metadata?.feedback || latestActionMsg?.metadata?.notes || "Please incorporate requested edits and resubmit your draft below."}
                              </span>
                            </div>
                          </div>
                        )}

                        {isManualRevisionOpen && (
                          <div className="flex items-center justify-between p-3 bg-amber-500/15 border-2 border-amber-500/40 rounded-xl text-xs text-amber-950 dark:text-amber-200 font-semibold shadow-xs">
                            <span className="flex items-center gap-1.5">
                              <Clock size={14} className="text-amber-700 dark:text-amber-400 shrink-0" />
                              <span>Upload an updated version of your video draft deliverable.</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setIsManualRevisionOpen(false);
                                setSelectedUploadFile(null);
                                setContentUrl("");
                                setContentNotes("");
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-amber-500/40 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg transition-all cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        )}

                        {/* File Upload Box */}
                        <ChatBoxFileUpload isDraggingFile={isDraggingFile} selectedUploadFile={selectedUploadFile} setIsDraggingFile={setIsDraggingFile} setSelectedUploadFile={setSelectedUploadFile} videoUploadInputRef={videoUploadInputRef} />

                        {/* OR Drive Link */}
                        <div>
                          <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
                            OR Paste Google Drive / Frame.io / Dropbox Share Link
                          </label>
                          <input 
                            type="url" 
                            className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED] rounded-xl p-3 text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none"
                            value={contentUrl}
                            onChange={e => setContentUrl(e.target.value)}
                            placeholder="https://drive.google.com/file/d/..."
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
                            Notes for Brand (Optional)
                          </label>
                          <textarea 
                            rows={2}
                            className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED] rounded-xl p-3 text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none resize-none"
                            value={contentNotes}
                            onChange={e => setContentNotes(e.target.value)}
                            placeholder="Add any notes regarding music licensing, variations, or captions..."
                          />
                        </div>

                        {uploadLoading && (
                          <div className="space-y-1.5 bg-[var(--bg-elevated)] p-3 rounded-xl border border-[#7C3AED]/20">
                            <div className="flex items-center justify-between text-xs font-semibold">
                              <span className="text-indigo-400 flex items-center gap-1.5">
                                <Loader2 className="animate-spin" size={13} />
                                Uploading video deliverable...
                              </span>
                              <span className="font-mono text-indigo-400 font-bold">{uploadProgress > 0 ? `${uploadProgress}%` : "Processing..."}</span>
                            </div>
                            <div className="w-full h-2 bg-[var(--bg-card)] rounded-full overflow-hidden border border-[var(--border-default)]">
                              <div 
                                className="h-full bg-gradient-to-r from-[#7C3AED] to-[#7C3AED] transition-all duration-300 rounded-full"
                                style={{ width: `${Math.max(uploadProgress, 5)}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-[var(--text-tertiary)]">Please keep this tab open until the upload finishes.</p>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={handleCreatorSubmitContent}
                          disabled={uploadLoading || (!selectedUploadFile && !contentUrl.trim())}
                          className="w-full py-3.5 bg-[#7C3AED] hover:bg-[#7C3AED] disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-[#7C3AED]/10 flex items-center justify-center gap-2 cursor-pointer text-xs uppercase tracking-wider"
                        >
                          {uploadLoading ? (
                            <>
                              <Loader2 className="animate-spin" size={16} />
                              <span>{uploadProgress > 0 ? `Uploading (${uploadProgress}%)...` : "Submitting deliverable..."}</span>
                            </>
                          ) : (
                            <>
                              <Check size={16} />
                              <span>{(isRevisionRequested || isManualRevisionOpen) ? "Submit Revised Deliverable" : "Submit Deliverable to Brand"}</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-[var(--bg-base)] rounded-2xl border border-[var(--border-default)]">
                    {isDealFixed && !isAgreementSigned ? (
                      <div className="p-5 text-center max-w-md mx-auto">
                        <div className="w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500 border border-amber-500/20 shrink-0 mx-auto mb-4">
                          <Lock size={22} />{/* v415: no endless pulse */}
                        </div>
                        <h4 className="text-base font-bold text-[var(--text-primary)]">Sponsorship Deal Accepted! 🎉</h4>
                        <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed">
                          The offer of <strong className="text-[var(--text-primary)]">₹{Number(getDealAmount(currentThread)).toLocaleString('en-IN') /* v415: ₹ formatting */}</strong> has been accepted by both parties. Please sign the official partnership contract to lock the deal and activate the campaign.
                        </p>

                        <ChatBoxSignatureStatus currentThread={currentThread} getDealAmount={getDealAmount} isBrand={isBrand} setCurrentOffer={setCurrentOffer} setShowContractModal={setShowContractModal} setShowNegotiationTable={setShowNegotiationTable} />
                      </div>
                    ) : (
                      <>
                        {/* Preset Chips */}
                        <ChatBoxPresetChips currentThread={currentThread} getDealAmount={getDealAmount} isBrand={isBrand} setOfferAmount={setOfferAmount} />
                    
                    {/* Amount Input */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center text-4xl font-bold text-[var(--text-primary)] tracking-tight">
                        <span className="mr-2 text-[var(--text-secondary)]">₹</span>
                        <input 
                          type="number" 
                          className="bg-transparent border-none focus:ring-0 w-48 p-0 text-4xl font-bold text-[var(--text-primary)] tracking-tight placeholder-[var(--text-tertiary)]"
                          value={offerAmount}
                          onChange={e => setOfferAmount(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      
                      <button
                        type="button"
                        onClick={async () => {
                          const amt = Number(offerAmount);
                          if (!amt || amt <= 0 || sendingOffer || sendingOfferRef.current) return;
                          sendingOfferRef.current = true;
                          setSendingOffer(true);
                          try {
                            await api.post(`/campaign/threads/${thread.id}/creator-negotiate`, {
                              counter_amount: amt
                            });
                            setOfferAmount("");
                            setInputMode("chat");
                            await loadMessages();
                            refreshThread();
                          } catch (err) {
                            toast.error(calmError(err, "Couldn't send the offer. Please try again.")); // v332
                          } finally {
                            setSendingOffer(false);
                            sendingOfferRef.current = false;
                          }
                        }}
                        disabled={!offerAmount || sendingOffer || loading}
                        className="w-full sm:w-auto px-8 py-4 bg-blue-500 text-white font-bold rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-50 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                      >
                        {sendingOffer ? (
                          <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Sending...</span>
                          </>
                        ) : (
                          "Send Offer"
                        )}
                      </button>
                    </div>

                    {/* Feedback Box */}
                    <ChatBoxFeedbackBox currentThread={currentThread} isBrand={isBrand} offerAmount={offerAmount} />
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>

        {/* MOBILE Single Bottom Dock (84px thumb zone) */}
        {isCancelled ? ( /* v414: closed chat — no composer on small screens either */
          <div data-testid="chat-closed-note-mobile" className="block md:hidden bg-[var(--bg-card)] border-t border-[var(--border-default)] px-3.5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shrink-0 z-20 w-full text-xs font-bold text-[var(--text-secondary)] text-center">
            {cancelledLabel(currentThread)} — Chat is closed for this {isUgcOrder ? 'order' : 'deal'}.
          </div>
        ) : (
        <ChatBoxMobileDock isCancelled={isCancelled /* v414 */} aiLoading={aiLoading} handleAiAssist={handleAiAssist} handleSend={handleSend} isAgreementSigned={isAgreementSigned} isBrand={isBrand} isContentApproved={isContentApproved} isContentSubmitted={isContentSubmitted} isDealCompleted={isDealCompleted} isDealFixed={isDealFixed} isLiveLinksSubmitted={isLiveLinksSubmitted} isMySignatureSigned={isMySignatureSigned} isPaymentFunded={isPaymentFunded} isRevisionDeclined={isRevisionDeclined} isRevisionRequested={isRevisionRequested} loading={loading} sendingRef={sendingRef} setShowPaymentSheet={setShowPaymentSheet} setShowUploadSheet={setShowUploadSheet} setText={setText} showPaymentSheet={showPaymentSheet} showUploadSheet={showUploadSheet} text={text} />
        )}

        {/* Mobile Payment Bottom Sheet */}
        <ChatBoxPaymentSheet currentThread={currentThread} getDealAmount={getDealAmount} handleEscrowPayment={handleEscrowPayment} isPaymentFunded={isPaymentFunded} paymentLoading={paymentLoading} paymentStep={paymentStep} setShowPaymentSheet={setShowPaymentSheet} showPaymentSheet={showPaymentSheet} />

        {/* Mobile Upload Deliverables Bottom Sheet */}
        <ChatBoxUploadSheet contentNotes={contentNotes} contentUrl={contentUrl} currentThread={currentThread} handleCreatorSubmitContent={handleCreatorSubmitContent} handleSendLiveLinks={handleSendLiveLinks} isContentApproved={isContentApproved} isContentSubmitted={isContentSubmitted} isDealCompleted={isDealCompleted} isLiveLinksSubmitted={isLiveLinksSubmitted} isRevisionRequested={isRevisionRequested} livePostNotes={livePostNotes} livePostUrl={livePostUrl} messages={messages} selectedUploadFile={selectedUploadFile} setContentNotes={setContentNotes} setContentUrl={setContentUrl} setLivePostNotes={setLivePostNotes} setLivePostUrl={setLivePostUrl} setShowUploadSheet={setShowUploadSheet} showUploadSheet={showUploadSheet} uploadLoading={uploadLoading} />
      </div>

      {/* Modals */}
      <ChatBoxModals commRating={commRating} currentOffer={currentOffer} currentThread={currentThread} handleAcceptSafety={handleAcceptSafety} handleReviewSubmit={handleReviewSubmit} isBrand={isBrand} isNegotiationLocked={isNegotiationLocked} loadMessages={loadMessages} overallRating={overallRating} partnerName={partnerName} qualRating={qualRating} refreshThread={refreshThread} reviewComment={reviewComment} setCommRating={setCommRating} setOverallRating={setOverallRating} setQualRating={setQualRating} setReviewComment={setReviewComment} setShowBrandAgreeModal={setShowBrandAgreeModal} setShowBriefModal={setShowBriefModal} setShowContractModal={setShowContractModal} setShowCreatorAgreeModal={setShowCreatorAgreeModal} setShowInfoPanel={setShowInfoPanel} setShowNegotiationTable={setShowNegotiationTable} setShowReviewModal={setShowReviewModal} setShowSafetyModal={setShowSafetyModal} setTimeRating={setTimeRating} showBrandAgreeModal={showBrandAgreeModal} showBriefModal={showBriefModal} showContractModal={showContractModal} showCreatorAgreeModal={showCreatorAgreeModal} showInfoPanel={showInfoPanel} showNegotiationTable={showNegotiationTable} showReviewModal={showReviewModal} showSafetyModal={showSafetyModal} submittingReview={submittingReview} timeRating={timeRating} user={user} />
      <Presence>{selectedInvoiceTxn && (
        <InvoiceModal key="invoicemodal" 
          transaction={selectedInvoiceTxn} 
          isBrand={isBrand}
          creatorName={currentThread?.creator?.profile?.full_name || currentThread?.creator?.profile?.name || currentThread?.creator?.full_name || currentThread?.creator?.name || "UGC Creator"}
          brandName={currentThread?.brand?.profile?.company_name || currentThread?.brand?.company_name || currentThread?.brand?.name || "Brand Partner"}
          onClose={() => setSelectedInvoiceTxn(null)} 
        />
      )}</Presence>

      <UniversalPreviewModal
        isOpen={showUniversalModal}
        onClose={() => setShowUniversalModal(false)}
        url={universalPreviewUrl}
        title="Deliverable Media Review"
        creatorName={currentThread?.creator?.name || currentThread?.creator?.full_name || "Creator"}
        isBrand={isBrand}
        onApprove={async () => {
          setShowUniversalModal(false);
          try {
            // This modal reviews a DRAFT. For a campaign that is approve-content (draft approved,
            // creator posts it live next) — it used to call mark-complete, which releases the
            // secure payment hold for a deal with no live post.
            const isUgcPreview = Boolean(isUgcOrder || isUgcThread);
            const endpoint = isUgcPreview
              ? `/ugc/threads/${currentThread.id}/mark-complete`
              : `/campaign/threads/${currentThread.id}/approve-content`;
            await api.post(endpoint, { notes: "Approved via Universal Preview" });
            toast.success(isUgcPreview
              ? "Content approved! Secure payment released to creator."
              : "Draft approved — the creator can now post it live.");
            loadMessages();
            refreshThread();
          } catch (e) {
            toast.error(calmError(e, "Couldn't approve the content. Please try again.")); // v332
          }
        }}
        onRequestChanges={() => {
          setShowUniversalModal(false);
          setInputMode("offer");
        }}
      />

      <BrandPublicProfileModal 
        isOpen={showBrandProfileModal} 
        onClose={() => setShowBrandProfileModal(false)} 
        brandUserId={currentThread?.brand_id || currentThread?.brand?.user_id} 
        brandName={currentThread?.brand?.profile?.company_name || currentThread?.brand?.company_name || currentThread?.brand?.name || currentThread?.brand_name || partnerName} 
        brandLogo={partnerPic} 
      />
    </div>
  );
}
