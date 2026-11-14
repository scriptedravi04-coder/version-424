import React, { useState, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { ChevronLeft, Plus, Send, ShieldCheck, Lock, MessageSquare, Shield, Upload, CheckCircle2, FileSignature, Link2, Star, AlertCircle, Loader2, Clock, Video, ExternalLink, Paperclip } from "lucide-react"; // v417: + Paperclip
import { AnimatePresence } from "framer-motion";
import useChatThreadMobile from "./useChatThreadMobile";
import useDealPayoutRow from "../../../hooks/useDealPayoutRow";
import { checkComprehensiveDisallowedContent, splitNumberAcrossMessages } from "../../../utils/contactSecurityFilter";
import { deriveDealState, allowsLegacyTextMatch, cancelledLabel, CHAT_ATTACH_ACCEPT } from "../dealState"; // v414: + legacy text rule, cancelledLabel; v417: + attach types
import { clientMsgIdOf } from "../../../lib/chatSync"; // v414
import NegotiationTable from "../NegotiationTable";
import MobileRespondOfferSheet from "./MobileRespondOfferSheet";
import { getChatStage } from "./chatStageMap";
import MobileMessageRow, { supersededReviewCards } from "./MobileMessageRow";
import MobileRequestChangesSheet, { LIVE_LINK_TAGS } from "./MobileRequestChangesSheet";
import MobileEscrowSheet from "./MobileEscrowSheet";
import MobileRatingSheet from "./MobileRatingSheet";
import MobileLiveLinkSheet from "./MobileLiveLinkSheet";
import MobileUploadSheet from "./MobileUploadSheet";
import { MobileShortlistedCard, MobileBriefCard, MobileClaimedCard } from "./MobileBriefCards";
import MobileContractSheet from "./MobileContractSheet";
import CreatorCodeDealCard from "../../referral/CreatorCodeDealCard";
import BurgerMenuSupport from "../BurgerMenuSupport";
import MobileOrderSupportSheet from "./MobileOrderSupportSheet";

const getPartnerPic = (partner, partnerIsBrand) => {
  if (!partner) return "";
  if (partnerIsBrand) {
    return (
      partner.profile?.logo ||
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
      partner.profile?.avatar ||
      ""
    );
  }
  return (
    // Session 43 (Ravi: creator showed only "B"): creators keep their photo in profile_photo_url.
    partner.profile_photo_url ||
    partner.profile?.profile_photo_url ||
    partner.photo ||
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
    partner.profile?.logo_url ||
    ""
  );
};

const getDealAmount = (t) =>
  t?.agreed_amount ||
  t?.amount_fixed ||
  t?.campaign?.budget ||
  t?.campaign_budget ||
  t?.ugc_order?.amount ||
  t?.ugc_order?.creator_payout ||
  t?.ugc_order?.agreed_amount ||
  0;

export default function ChatBoxMobile({ thread, user, onlineUsers = [], onBack }) {
  const {
    currentThread,
    messages,
    loadError,
    isBrand,
    isUgcOrder: _hookIsUgc,
    isMySignatureSigned: _hookMySigned,
    isOtherPartySigned: _hookOtherSigned,
    isDealCompleted: _hookDealCompleted,
    isEscrowFunded: _hookEscrowFunded,
    sendText,
    retryMessage, // v414: tap a failed bubble to send it again
    sending, // v353: a second Send while the first is still going used to clear the box and lose the text
    acceptCounter,
    sendCounter,
    payIntoEscrow,
    paying,
    loadMessages,
    refreshThread,
    approveDeliverable,
    requestChanges,
    declineRevisions,
    declineLinkResubmission,
    submitLiveLink,
    approveLiveLinks,
    rejectLiveLinks,
    uploadDeliverable,
    sendAttachment, // v417: paperclip
    attaching, // v417
    submitReview,
    sendSignOtp,
    signAgreement,
  } = useChatThreadMobile(thread, user);

  // v283 (Ravi: "You're in 🎉 flashes for a moment before the real chat"): the fallback card used to
  // show while messages were still loading. Now a skeleton shows instead; the card appears only for
  // a brand-new thread, a thread with no messages after the first load window, or a load error.
  // (useChatThreadMobile is a locked file, so this waits here instead of in the hook.)
  const [loadWindowOver, setLoadWindowOver] = useState(false);
  const [loadLongOver, setLoadLongOver] = useState(false);
  useEffect(() => {
    setLoadWindowOver(false);
    setLoadLongOver(false);
    const t = setTimeout(() => setLoadWindowOver(true), 2500);
    const t2 = setTimeout(() => setLoadLongOver(true), 8000); // v426: never a skeleton forever
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [thread?.id]);
  const threadHasHistory = Boolean(thread?.last_message || thread?.last_message_at || currentThread?.last_message);
  // v426 (creator audit): a thread with a last_message but an empty message list kept the three grey bubbles
  // forever. After 8s it shows the "Couldn't load messages · Try again" card instead.
  const loadStuck = loadLongOver && threadHasHistory && messages.length === 0;
  const messagesSettled = messages.length > 0 || Boolean(thread?.isNew) || Boolean(loadError) || loadStuck || (loadWindowOver && !threadHasHistory);
  const showLoadError = (Boolean(loadError) || loadStuck) && messages.length === 0;

  // Session 23: the SAME deal-state flags as desktop ChatBox (src/components/chat/dealState.js).
  // Mobile used to compute its own, and they disagreed: a funded deal still said "Make payment",
  // any old revision kept the chat in "revisions required", and "Sign agreement" showed while
  // the price was still being negotiated.
  const {
    isUgcOrder, isMySignatureSigned, isOtherPartySigned, isDealCompleted,
    isAgreementSigned, isDealFixed, isNegotiationLocked, isPaymentFunded,
    isContentApproved, isRevisionRequested, isRevisionDeclined, isContentSubmitted,
    isLiveLinksRevisionOpen, isLiveLinksSubmitted, isCancelled,
  } = useMemo(() => deriveDealState({ thread: currentThread, messages, isBrand }), [currentThread, messages, isBrand]);
  const isEscrowFunded = isPaymentFunded;
  const [showNegotiation, setShowNegotiation] = useState(false);

  const [text, setText] = useState("");
  const [activeSheet, setActiveSheet] = useState(null);
  // v330: a broken partner photo URL showed a broken-image icon in the header — fall back to the initial.
  const [picFailed, setPicFailed] = useState(false);
  useEffect(() => { setPicFailed(false); }, [thread?.id]);
  const [retryingLoad, setRetryingLoad] = useState(false); // v332: busy state for "Try again" on a failed load
  const listEndRef = useRef(null);
  const inputRef = useRef(null);
  // v418: the message box grows with its text (max ~5 lines), and shrinks back after sending.
  useEffect(() => {
    const el = inputRef.current;
    if (!el || el.tagName !== "TEXTAREA") return;
    el.style.height = "40px";
    el.style.height = `${Math.min(120, Math.max(40, el.scrollHeight))}px`;
  }, [text]);
  const attachRef = useRef(null); // v417: hidden file input for the paperclip

  // v417: follow new messages only on a newly opened chat, after my own send, or when I was near the bottom
  // (reading older messages used to get yanked down by every incoming one). Same rule as desktop ChatBox.
  const nearBottomRef = useRef(true);
  const followThreadRef = useRef(null);
  useEffect(() => {
    const last = messages[messages.length - 1];
    const me = [user?.user_id, user?.id].filter(Boolean).map(String);
    const mine = Boolean(last) && (String(last.id || "").startsWith("temp_") || last.status === "sending" || me.includes(String(last.sender_user_id || last.sender_id || "")));
    const follow = followThreadRef.current !== currentThread?.id || mine || nearBottomRef.current;
    followThreadRef.current = currentThread?.id;
    if (!follow) return undefined;
    const timer = setTimeout(() => {
      listEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 120);
    return () => clearTimeout(timer);
  }, [messages.length, currentThread?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const uniqueMessages = useMemo(() => {
    // v414: a temp bubble is hidden only when a confirmed row carries ITS client_msg_id (was: any row with the same text)
    const confirmedCids = new Set((messages || []).filter((m) => m && !String(m.id).startsWith("temp_")).map(clientMsgIdOf).filter(Boolean));
    const seen = new Set();
    const result = [];
    for (const msg of messages || []) {
      if (!msg) continue;
      const key = msg.id || (msg.created_at ? `${msg.created_at}_${msg.content || msg.text}` : null);
      if (String(msg.id).startsWith("temp_")) {
        const alreadyConfirmed = Boolean(msg.client_msg_id) && confirmedCids.has(String(msg.client_msg_id)); // v414
        if (alreadyConfirmed) continue;
      }

      // Deduplicate pending payment release / live links approved notices in the same thread
      const msgType = (msg.message_type || msg.type || '').toLowerCase();
      const msgAction = (msg.metadata?.action || '').toLowerCase();
      const hasUtr = Boolean(msg.metadata?.utr_number || msg.metadata?.utr || msg.utr_number);
      const isPendingPayoutCard = !hasUtr && (
        msgType === 'live_links_approved' ||
        msgAction === 'live_links_approved' ||
        msgType === 'payout_released' ||
        msgAction === 'payout_released' ||
        msgType === 'payment_released' ||
        msgAction === 'payment_released'
      );

      if (isPendingPayoutCard) {
        const existingIdx = result.findIndex((r) => {
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

      // Session 43 (Ravi: the "Secure payment hold status" card came twice — the payment check and
      // the bank's confirmation each post one). One deal is funded once: keep the first card only.
      const isFundedCard = msgType === 'payment_secured' || msgType === 'payment_funded' ||
        msgAction === 'payment_secured' || msgAction === 'payment_funded' ||
        (allowsLegacyTextMatch(msg) && String(msg.content || msg.text || '').toLowerCase().includes('escrow funded')); // v414: old system rows only
      if (isFundedCard) {
        if (seen.has('__funded_card__')) continue;
        seen.add('__funded_card__');
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
    return result;
  }, [messages]);
  // Old review cards lose their buttons once a newer card or a later step exists.
  const supersededIdx = useMemo(() => supersededReviewCards(uniqueMessages), [uniqueMessages]);
  // Session 24: the one "Brand needs some changes" card that still takes an answer — the latest
  // one, while the deal is actually waiting on that revision (desktop isStateActive).
  const latestChangesIdx = useMemo(() => {
    for (let i = uniqueMessages.length - 1; i >= 0; i--) {
      const t = String(uniqueMessages[i]?.message_type || uniqueMessages[i]?.type || uniqueMessages[i]?.metadata?.action || "").toLowerCase();
      if (t === "changes_requested" || t === "revision_requested") return i;
    }
    return -1;
  }, [uniqueMessages]);

  // Session 31: the latest "send corrected live links" request — the only one that takes an answer.
  const latestLinkFixIdx = useMemo(() => {
    for (let i = uniqueMessages.length - 1; i >= 0; i--) {
      const m = uniqueMessages[i];
      const t = String(m?.message_type || m?.type || "").toLowerCase();
      if (t === "live_links_resubmit_request" || m?.metadata?.action === "live_links_resubmit_requested") return i;
    }
    return -1;
  }, [uniqueMessages]);

  // v333 (Ravi: "chat mein creator ko real amount kyon show kar raha hai"): once the deal is approved / paid the
  // creator's header pill shows what reaches their bank (same row as the payout card and the receipt).
  const { row: creatorPayoutRow } = useDealPayoutRow(currentThread || thread, { skip: isBrand || !isDealCompleted || !(currentThread || thread)?.id });
  const creatorNetAmount = !isBrand && Number(creatorPayoutRow?.creator_net_amount) > 0 ? Number(creatorPayoutRow.creator_net_amount) : null;

  // Session 39: hooks above run on every render; the early return comes after them.
  if (!thread) return null;

  const partner = isBrand ? currentThread?.creator || thread.creator : currentThread?.brand || thread.brand;
  const partnerName = isBrand
    ? partner?.profile?.full_name || partner?.profile?.name || partner?.full_name || partner?.name || "Creator" /* session 40: was a made-up person "Aarav Mehta" */
    : partner?.profile?.company_name || partner?.company_name || partner?.name || "Brand"; // session 40: was a made-up brand "Lumen Skincare"
  const partnerPic = getPartnerPic(partner, !isBrand);
  const partnerId = isBrand ? currentThread?.creator_id : currentThread?.brand_id;
  const isPartnerOnline = partnerId ? onlineUsers.includes(partnerId) : false; // session 40: unknown is not "online"
  const campaignTitle =
    currentThread?.campaign_title || currentThread?.ugc_order?.title || thread?.campaign_title || "Collaboration"; // session 40: was "Winter Glow Reel"
  const isVerified = Boolean(partner?.profile?.is_verified || partner?.is_verified || false);
  const amount = getDealAmount(currentThread);

  const stage = getChatStage({
    thread: currentThread,
    isBrand,
    isUgcOrder,
    isMySignatureSigned,
    isOtherPartySigned,
    isDealCompleted,
    messages,
  });

  const hasReviewed = Boolean(
    currentThread?.rating_submitted ||
      currentThread?.review_submitted ||
      (isBrand ? currentThread?.reviewed_by_brand : currentThread?.reviewed_by_creator)
  );


  const hasSubmission = messages.some((m) =>
    ["content_proof_submitted", "CHANGES_REQUESTED", "revision_requested", "revision_declined"].includes(
      m.message_type || m.type
    )
  );

  const showPinnedBrief = isUgcOrder && !hasSubmission && !isDealCompleted && !isCancelled; // v414: no "Ready to produce / Upload" on a cancelled / expired order
  const brief = currentThread?.ugc_order?.brief || currentThread?.brief || null;

  // Session 43 (Ravi: "Reach me at 931" → "509" → "9117"): checked here against this chat's own
  // history too, so a number sent in pieces is stopped even when the server instances differ.
  const myRecentTexts = () => {
    const ids = [user?.user_id, user?.id, user?._id].filter(Boolean).map(String);
    const cutoff = Date.now() - 15 * 60 * 1000;
    return (messages || [])
      .filter((m) => {
        const type = String(m?.message_type || m?.type || "text").toLowerCase();
        if (type !== "text" && type !== "message") return false;
        if (!ids.includes(String(m?.sender_id || m?.metadata?.sender_id || ""))) return false;
        const at = new Date(m?.created_at || 0).getTime();
        return !at || at >= cutoff;
      })
      .map((m) => String(m.content || m.text || ""))
      .slice(-6);
  };

  const handleSend = async () => {
    if (!text.trim() || isDealCompleted || sending) return; // v353: keep the typed text while the last one is sending
    const single = checkComprehensiveDisallowedContent(text, { threadId: currentThread?.id, senderId: user?.user_id || user?.id });
    if (single.blocked || splitNumberAcrossMessages(text, myRecentTexts())) {
      toast.error(single.message || "For your safety, phone numbers can't be shared in chat — not even in pieces. Keep talks on Ybex so your payment stays protected.");
      return;
    }
    const typed = text;
    setText("");
    const ok = await sendText(typed);
    // v414: the text was lost when the send failed — put it back (unless something new was typed meanwhile)
    if (ok === false) setText((cur) => (cur ? cur : typed));
  };

  // Session 43: the newest price offer in this chat and whether I sent it.
  const latestOffer = (() => {
    const offers = (messages || []).filter((m) => m && (m.message_type === "negotiation_offer" || m.message_type === "offer" || m.message_type === "creator_application_offer" || m.message_type === "brand_invitation_offer" || m.metadata?.is_counter));
    const m = offers[offers.length - 1];
    if (!m) return null;
    const meta = m.metadata || {};
    const role = m.sender_role || meta.sender_role || (m.message_type === "creator_application_offer" ? "creator" : "");
    const ids = [user?.user_id, user?.id, user?._id].filter(Boolean).map(String);
    const sid = String(m.sender_id || meta.sender_id || "");
    const mine = (sid && ids.includes(sid)) || (role && ((isBrand && role === "brand") || (!isBrand && role === "creator")));
    return { mine: Boolean(mine), type: m.message_type || "", /* v353 */ amount: Number(meta.amount || meta.proposed_amount || meta.offer_amount || meta.proposed_fee || meta.proposed_budget || 0), /* Session 58: application offers store proposed_fee — no Accept button before */ note: meta.note || meta.message || "", fromName: partnerName };
  })();

  // Dynamic task option matching desktop color palette & red-dot indicator system
  const getDynamicTaskOption = () => {
    // v419 (Ravi): a paid deal with a cancel request — work is paused while Ybex support reviews it.
    if (thread?.cancel_requested && !isDealCompleted && !isCancelled) {
      return {
        label: "CANCELLATION UNDER REVIEW",
        icon: <Clock size={13} className="text-amber-600" />,
        bg: "#FFFBEB",
        color: "#B45309",
        dotType: "solid-amber",
        onClick: () => toast.info("Ybex support is reviewing the cancellation. Please pause the work — we'll update you in this chat."),
      };
    }
    if (isDealCompleted) {
      return {
        label: "DEAL COMPLETED",
        icon: <CheckCircle2 size={13} className="text-emerald-500" />,
        bg: "#ECFDF5",
        color: "#059669",
        dotType: "solid-emerald",
        onClick: () => (!hasReviewed ? setActiveSheet("rating") : setActiveSheet("escrow")),
      };
    }

    // v359 (Ravi OK): a cancelled deal / closed UGC order said "PAYMENT SECURED" (brand) or asked for work (creator).
    if (isCancelled) {
      const what = cancelledLabel(currentThread).toUpperCase(); // v414: also refunded payment / expired / declined
      return {
        label: isUgcOrder ? (what === "REFUNDED" || what === "EXPIRED" ? `ORDER CLOSED · ${what}` : `ORDER ${what}`) : `DEAL ${what}`,
        icon: <AlertCircle size={13} className="text-slate-500" />,
        bg: "#F3F4F6",
        color: "#4B5563",
        dotType: "none", // no attention dot — nothing to do
        onClick: () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      };
    }

    // Stage 0 (campaign): price not fixed yet.
    // Session 43 (Ravi): like desktop — my offer is the latest → "Waiting for response"; theirs →
    // "Respond to offer", which opens a bottom sheet (Accept / Negotiate), not a whole page.
    if (!isUgcOrder && !isDealFixed) {
      if (latestOffer?.mine) {
        return {
          label: "WAITING FOR RESPONSE",
          icon: <Clock size={13} className="text-amber-500" />,
          bg: "#FFFBEB",
          color: "#D97706",
          dotType: "solid-amber",
          onClick: () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }), // v332: tapping did nothing — now shows the latest offer
        };
      }
      return {
        label: latestOffer ? "RESPOND TO OFFER" : "NEGOTIATE PRICE",
        icon: <FileSignature size={13} className="text-amber-500" />,
        bg: "#FFFBEB",
        color: "#D97706",
        dotType: latestOffer ? "ping-amber" : "solid-amber",
        onClick: () => setActiveSheet("respond"),
      };
    }

    // Stage 1: Agreement Signature Workflow
    if (!isAgreementSigned) {
      if (isMySignatureSigned) {
        return {
          label: isOtherPartySigned ? "AGREEMENT SIGNED" : "WAITING SIGNATURE",
          icon: <CheckCircle2 size={13} className="text-emerald-500" />,
          bg: isOtherPartySigned ? "#ECFDF5" : "#FFFBEB",
          color: isOtherPartySigned ? "#059669" : "#D97706",
          dotType: isOtherPartySigned ? "solid-emerald" : "solid-amber", // v415: waiting on the other side — no pulsing
          // Session 43 (Ravi): I already signed — show that, never the sign + OTP sheet again.
          onClick: () => setActiveSheet("signedInfo"),
        };
      }
      return {
        label: "SIGN AGREEMENT",
        icon: <FileSignature size={13} className="text-rose-500" />,
        bg: "#FFF1F2",
        color: "#F43F5E",
        dotType: "ping-rose",
        onClick: () => setActiveSheet("contract"),
      };
    }

    // Stage 2: Brand Workflow (Desktop Parity)
    if (isBrand) {
      if (!isPaymentFunded) {
        return {
          label: "MAKE PAYMENT",
          icon: <Shield size={13} className="text-rose-500" />,
          bg: "#FFF1F2",
          color: "#F43F5E",
          dotType: "ping-rose",
          onClick: () => setActiveSheet("escrow"),
        };
      }
      if (isDealCompleted) {
        return {
          label: "DEAL COMPLETED",
          icon: <CheckCircle2 size={13} className="text-emerald-500" />,
          bg: "#ECFDF5",
          color: "#059669",
          dotType: "solid-emerald",
          onClick: () => (!hasReviewed ? setActiveSheet("rating") : setActiveSheet("escrow")),
        };
      }
      if (isLiveLinksRevisionOpen) {
        return {
          label: "WAITING FOR LINK CORRECTION",
          icon: <Clock size={13} className="text-amber-500" />,
          bg: "#FFFBEB",
          color: "#B45309",
          dotType: "solid-amber",
          onClick: () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        };
      }
      if (isLiveLinksSubmitted) {
        return {
          label: "REVIEW LIVE LINKS",
          icon: <ExternalLink size={13} className="text-amber-500" />,
          bg: "#FFFBEB",
          color: "#D97706",
          dotType: "ping-amber",
          onClick: () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        };
      }
      if (isContentApproved) {
        return {
          label: "WAITING FOR LIVE LINK",
          icon: <Clock size={13} className="text-amber-500" />,
          bg: "#FFFBEB",
          color: "#B45309",
          dotType: "solid-amber",
          onClick: () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        };
      }
      if (isRevisionDeclined) {
        return {
          label: "CHANGES DECLINED",
          icon: <AlertCircle size={13} className="text-rose-500" />,
          bg: "#FFF1F2",
          color: "#F43F5E",
          dotType: "ping-rose",
          onClick: () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        };
      }
      if (isRevisionRequested) {
        return {
          label: "WAITING FOR CHANGES",
          icon: <Clock size={13} className="text-amber-500" />,
          bg: "#FFFBEB",
          color: "#B45309",
          dotType: "solid-amber",
          onClick: () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        };
      }
      if (isContentSubmitted) {
        return {
          label: "REVIEW CONTENT",
          icon: <Video size={13} className="text-amber-500" />,
          bg: "#FFFBEB",
          color: "#D97706",
          dotType: "ping-amber",
          onClick: () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        };
      }
      return {
        label: "PAYMENT SECURED", // v330: was "SECURE PAYMENT HOLD SECURED"
        icon: <ShieldCheck size={13} className="text-emerald-500" />,
        bg: "#ECFDF5",
        color: "#059669",
        dotType: "solid-emerald",
        onClick: () => setActiveSheet("escrow"),
      };
    }

    // Stage 3: Creator Workflow
    if (isDealCompleted) {
      return {
        label: "COMPLETED",
        icon: <CheckCircle2 size={13} className="text-emerald-500" />,
        bg: "#ECFDF5",
        color: "#059669",
        dotType: "solid-emerald",
        onClick: () => (!hasReviewed ? setActiveSheet("rating") : setActiveSheet("escrow")),
      };
    }

    if (isLiveLinksRevisionOpen) {
      return {
        label: "RESUBMIT LIVE LINK",
        icon: <Link2 size={13} className="text-amber-500" />,
        bg: "#FFFBEB",
        color: "#D97706",
        dotType: "ping-amber",
        onClick: () => setActiveSheet("liveLink"),
      };
    }

    if (isLiveLinksSubmitted) {
      return {
        label: "WAITING FOR APPROVAL",
        icon: <Clock size={13} className="text-amber-500" />, // v415: no endless pulse while waiting
        bg: "#FFFBEB",
        color: "#D97706",
        dotType: "solid-amber", // v415: waiting — no pulsing
        onClick: () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      };
    }

    if (isContentApproved) {
      return {
        label: "SUBMIT LIVE LINK",
        icon: <Link2 size={13} className="text-emerald-500" />,
        bg: "#ECFDF5",
        color: "#059669",
        dotType: "ping-rose",
        onClick: () => setActiveSheet("liveLink"),
      };
    }

    if (isRevisionRequested) {
      return {
        label: "REVISIONS REQUIRED",
        icon: <Upload size={13} className="text-rose-500" />,
        bg: "#FFF1F2",
        color: "#F43F5E",
        dotType: "ping-rose",
        onClick: () => setActiveSheet("upload"),
      };
    }

    if (isRevisionDeclined) {
      // v355 (Ravi OK): nobody uploads here — the creator declined the changes and both wait for the brand's reply.
      // Was a red pulsing bar that opened the Upload sheet.
      return {
        label: isBrand ? "CREATOR DECLINED THE CHANGES" : "CHANGES DECLINED · WAITING FOR BRAND",
        icon: <AlertCircle size={13} className="text-amber-600" />,
        bg: "#FFFBEB",
        color: "#B45309",
        dotType: "solid-amber",
        onClick: () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      };
    }

    if (isContentSubmitted) {
      return {
        label: "AWAITING APPROVAL",
        icon: <Clock size={13} className="text-amber-600" />,
        bg: "#FFFBEB",
        color: "#B45309",
        dotType: "solid-amber", // v415: waiting — no pulsing
        onClick: () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      };
    }

    if (!isPaymentFunded) {
      return {
        label: "WAITING FOR PAYMENT", // v415: plainer wording
        icon: <Loader2 size={13} className="text-amber-500 animate-spin" />,
        bg: "#FFFBEB",
        color: "#D97706",
        dotType: "solid-amber", // v415: waiting — no pulsing
        onClick: () => setActiveSheet("escrow"),
      };
    }

    // Escrow funded and creator needs to upload initial draft
    return {
      label: "UPLOAD CONTENT",
      icon: <Upload size={13} className="text-rose-500" />,
      bg: "#FFF1F2",
      color: "#F43F5E",
      dotType: "ping-rose",
      onClick: () => setActiveSheet("upload"),
    };
  };

  const taskOption = getDynamicTaskOption();
  // What "+" may open: the same upload / live-link sheet the task button offers this user.
  const plusSheet = !isBrand && !isDealCompleted && !isCancelled /* v359 */ && isPaymentFunded && isAgreementSigned
    ? (isLiveLinksRevisionOpen || (isContentApproved && !isLiveLinksSubmitted)
        ? "liveLink"
        : (!isContentSubmitted || isRevisionRequested || isRevisionDeclined) && !isContentApproved
          ? "upload"
          : null)
    : null;
  const closeSheet = () => setActiveSheet(null);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#F7F7FA",
        fontFamily: "'DM Sans', sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Top Header - Redesigned with clean avatar & full collaboration suite */}
      <div
        style={{
          flexShrink: 0,
          background: "#fff",
          padding: "8px 16px",
          borderBottom: "1px solid #EFEFF3",
          zIndex: 10,
        }}
      >
        <div style={{ height: 48, display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={onBack}
            style={{
              width: 40, // v332: 40px tap target (was 34px)
              height: 40,
              borderRadius: 20,
              background: "#F2F2F7",
              border: "none",
              flexShrink: 0,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Go back"
          >
            <ChevronLeft size={18} color="#0A0A0A" strokeWidth={2.2} />
          </button>

          {/* Clean Avatar Container without yellowish gradient artifact */}
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              flexShrink: 0,
              background: "#F3F4F6",
              border: "2px solid #E5E7EB",
              position: "relative",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {partnerPic && !picFailed ? (
              <img src={partnerPic} alt={partnerName} onError={() => setPicFailed(true) /* v330 */} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span
                style={{
                  font: "700 15px 'DM Sans',sans-serif",
                  color: "#6B7280",
                }}
              >
                {(partnerName || "P").charAt(0).toUpperCase()}
              </span>
            )}
            {isPartnerOnline && (
              <span
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  background: "#10B981",
                  border: "2px solid #fff",
                }}
              />
            )}
          </div>

          {/* Partner & Campaign Details */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div
                style={{
                  font: "700 14.5px/1.2 'DM Sans',sans-serif",
                  letterSpacing: "-.3px",
                  color: "#0A0A0A",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {partnerName}
              </div>
              {isVerified && (
                <ShieldCheck size={13} color="#0F9D58" fill="#0F9D58" style={{ flexShrink: 0 }} />
              )}
            </div>
            <div
              style={{
                marginTop: 2,
                font: "500 11.5px/1.2 'DM Sans',sans-serif",
                color: "#6E6E7C",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {campaignTitle}
            </div>
          </div>

          {/* Header Right Actions: Quick Escrow Pill + Full Burger Collaboration Suite */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
            <button
              onClick={() => setActiveSheet("escrow")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 9px",
                minHeight: 36, // v332: easier to tap
                borderRadius: 10,
                background: isPaymentFunded ? "#ECFDF5" : "#FFFBEB",
                border: isPaymentFunded ? "1px solid #A7F3D0" : "1px solid #FDE68A",
                cursor: "pointer",
              }}
              title="Payment status"
              aria-label="Payment status" /* v415 */
            >
              <ShieldCheck size={13} color={isPaymentFunded ? "#059669" : "#D97706"} />
              <span style={{ font: "700 11px 'DM Sans',sans-serif", color: isPaymentFunded ? "#059669" : "#D97706" }}>
                {/* v330: no "₹0" before an amount is agreed */}
                {creatorNetAmount != null
                  ? `₹${creatorNetAmount.toLocaleString("en-IN")}`
                  : Number(amount) > 0 ? `₹${Number(amount).toLocaleString("en-IN")}` : "Payment"}
              </span>
            </button>

            {/* Desktop Collaboration Parity Menu */}
            <BurgerMenuSupport thread={currentThread} user={user} onDealChanged={() => { refreshThread(); loadMessages(); } /* v414: after Cancel deal */} />
          </div>
        </div>
      </div>

      {/* Messages Stream */}
      <div
        onScroll={(e) => { const b = e.currentTarget; nearBottomRef.current = b.scrollHeight - b.scrollTop - b.clientHeight < 160; } /* v417 */}
        style={{
          flex: 1,
          padding: "14px 14px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          overflowY: "auto",
        }}
      >
        {/* v283 (Ravi): skeleton while the messages load — no more "You're in" flash. */}
        {!messagesSettled && (
          <div data-testid="chat-skeleton" aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[["70%", "flex-start", 54], ["55%", "flex-end", 40], ["62%", "flex-start", 46]].map(([w, side, h], i) => (
              <div key={i} className="animate-pulse" style={{ alignSelf: side, width: w, height: h, borderRadius: 16, background: "#ECECF2" }} />
            ))}
          </div>
        )}
        {/* v332: a failed message load showed the "You're in" welcome card as if the chat were empty. */}
        {showLoadError && (
          <div role="alert" data-testid="chat-load-error" style={{ alignSelf: "center", width: 308, maxWidth: "94%", borderRadius: 18, background: "#fff", border: "1px solid #EFEFF3", padding: 16, textAlign: "center" }}>
            <div style={{ font: "700 14px 'DM Sans',sans-serif", color: "#0A0A0A" }}>Couldn't load messages</div>
            <div style={{ marginTop: 4, font: "400 12px/1.4 'DM Sans',sans-serif", color: "#6B7280" }}>Check your connection and try again.</div>
            <button
              type="button"
              disabled={retryingLoad}
              onClick={async () => { setRetryingLoad(true); try { await loadMessages(); } finally { setRetryingLoad(false); } }}
              style={{ marginTop: 12, height: 40, padding: "0 18px", borderRadius: 12, border: "none", background: "#7C3AED", color: "#fff", font: "700 13px 'DM Sans',sans-serif", cursor: "pointer", opacity: retryingLoad ? 0.7 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {retryingLoad && <Loader2 size={14} className="animate-spin" />}
              Try again
            </button>
          </div>
        )}
        {/* Only show fallback shortlisted card if there are zero messages in the thread */}
        {!showLoadError && messagesSettled && messages.length === 0 && !isUgcOrder && (
          <MobileShortlistedCard
            campaignTitle={campaignTitle}
            budget={amount}
            isBrand={isBrand}
          />
        )}

        {showPinnedBrief && (
          isBrand ? (
            <MobileBriefCard brief={brief} timeText="" />
          ) : (
            <MobileClaimedCard
              orderStatus={currentThread?.ugc_order?.status} /* v414: hide upload on closed orders */
              brief={brief}
              deadlineIso={currentThread?.ugc_order?.internal_deadline}
              onOpenUpload={() => setActiveSheet("upload")}
            />
          )
        )}

        {uniqueMessages.map((m, idx) => {
          const effectiveMyId =
            user?.user_id ||
            user?.id ||
            user?._id ||
            user?.uid ||
            (isBrand ? (currentThread?.brand_id || thread?.brand_id) : (currentThread?.creator_id || thread?.creator_id));

          const myUserIds = [
            user?.user_id,
            user?.id,
            user?._id,
            user?.uid,
            isBrand ? (currentThread?.brand_id || thread?.brand_id) : (currentThread?.creator_id || thread?.creator_id)
          ].filter(Boolean).map(String);

          const msgSenderId = String(
            m.sender_user_id ||
            m.sender_id ||
            m.metadata?.sender_id ||
            m.metadata?.creator_id ||
            ""
          );
          const isTemp = String(m.id).startsWith("temp_");
          const isPayoutAction =
            m.message_type === "payment_trigger" ||
            m.message_type === "payment_released" ||
            m.message_type === "payout_released" ||
            m.metadata?.action === "PAYOUT_RELEASED" ||
            m.metadata?.action === "payment_released";

          const msgSenderRole =
            (m.message_type === "creator_signed" || m.message_type === "brand_signed" || m.message_type === "agreement_executed")
              ? "system"
              : (m.sender_role ||
                 m.metadata?.sender_role ||
                 (m.message_type === "campaign_approved"
                   ? "brand"
                   : m.message_type === "creator_application_offer"
                   ? "creator"
                   : m.message_type === "live_links_submitted" ||
                     m.message_type === "content_proof_submitted"
                   ? "creator"
                   : m.message_type === "live_links_approved" ||
                     m.message_type === "revision_requested" ||
                     isPayoutAction
                   ? "brand"
                   : undefined));

          const isMine =
            isTemp ||
            Boolean(
              (msgSenderId && myUserIds.includes(msgSenderId)) ||
              (isPayoutAction && isBrand) ||
              (msgSenderRole &&
                msgSenderRole !== "system" &&
                ((isBrand && msgSenderRole === "brand") ||
                  (!isBrand && msgSenderRole === "creator")))
            );

          return (
            <MobileMessageRow
              key={m.id || m.message_id || idx}
              message={m}
              isMine={isMine}
              isBrand={isBrand}
              isUgcOrder={isUgcOrder}
              thread={currentThread}
              amount={amount}
              campaignTitle={campaignTitle}
              isDealCompleted={isDealCompleted}
              isSuperseded={supersededIdx.has(idx)}
              allMessages={uniqueMessages}
              // v414: accept sends the amount shown on THIS card, so the server can catch a stale offer
              onAcceptOffer={isUgcOrder ? null /* v414: UGC price is fixed by the brief — offer cards are read-only */ : () => acceptCounter(Number(m.metadata?.amount || m.metadata?.proposed_amount || m.metadata?.offer_amount || 0) || undefined)}
              onRetry={m.status === "failed" && !m.fail_reason ? () => retryMessage(m) : null /* v414 */}
              onCounterOffer={isUgcOrder ? null /* v414: no UGC negotiation */ : sendCounter}
              onApproveDeliverable={approveDeliverable}
              onOpenRequestChanges={() => setActiveSheet("requestChanges")}
              onOpenReupload={() => setActiveSheet("upload")}
              isUploadDue={plusSheet === "upload" /* v353 */}
              onApproveLiveLinks={approveLiveLinks}
              onOpenRejectLiveLinks={() => setActiveSheet("rejectLiveLinks")}
              onOpenContract={() => setActiveSheet("contract")}
              onOpenRating={() => setActiveSheet("rating")}
              onDeclineChanges={declineRevisions}
              isChangesActive={idx === latestChangesIdx && isRevisionRequested && !isRevisionDeclined && !isDealCompleted}
              onOpenLiveLink={() => setActiveSheet("liveLink")}
              isLiveLinkDue={!isBrand && isContentApproved && !isLiveLinksSubmitted && !isLiveLinksRevisionOpen && !isDealCompleted}
              onDeclineLinkResubmission={declineLinkResubmission}
              isLinkFixActive={idx === latestLinkFixIdx && isLiveLinksRevisionOpen && !isDealCompleted}
              onOpenOrderSupport={() => setActiveSheet("orderSupport")}
            />
          );
        })}
        {/* Session 58 (Ravi: "sign agreement ka button upar bhi do"): once the price is fixed and I haven't signed,
            a Sign agreement card sits right under the "offer accepted" note — same sheet as the bar below. */}
        {(isUgcOrder || isDealFixed) && !isAgreementSigned && !isMySignatureSigned && !isDealCompleted && !isCancelled /* v414 */ && (
          <div data-testid="inline-sign-agreement" style={{ flexShrink: 0, alignSelf: "center", width: 308, maxWidth: "94%", borderRadius: 18, background: "#fff", border: "1px solid #FFE4E6", boxShadow: "0 10px 24px -20px rgba(16,16,20,.4)", padding: 14, fontFamily: "'DM Sans', sans-serif" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 34, height: 34, borderRadius: 11, background: "#FFF1F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <FileSignature size={16} color="#F43F5E" />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ font: "700 13.5px 'DM Sans',sans-serif", color: "#0A0A0A" }}>Your signature is needed</div>
                <div style={{ marginTop: 2, font: "400 11.5px/1.4 'DM Sans',sans-serif", color: "#6B7280" }}>
                  {isOtherPartySigned ? `${partnerName || (isBrand ? "The creator" : "The brand")} has signed. Sign to start the work.` : "Read the agreement and sign it to start the deal."}
                </div>
              </div>
            </div>
            <button type="button" onClick={() => setActiveSheet("contract")}
              style={{ marginTop: 12, width: "100%", height: 42, borderRadius: 12, border: "none", background: "#7C3AED", color: "#fff", font: "700 13px 'DM Sans',sans-serif", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <FileSignature size={15} color="#fff" /> Review &amp; sign agreement
            </button>
          </div>
        )}
        {/* Session 43 (Ravi): creator code — after both signed, before the brand pays. */}
        {!isBrand && !isUgcOrder && isAgreementSigned && !isPaymentFunded && !isDealCompleted && (
          <CreatorCodeDealCard dealKey={`thread:${currentThread?.id}`} amount={amount} />
        )}
        <div ref={listEndRef} style={{ height: 2, flexShrink: 0 }} />
      </div>

      {/* Bottom Controls (Two Buttons + Message Bar) */}
      {/* v348: chat-composer = drops the home-bar padding while the keyboard is open (src/index.css) */}
      <div
        className="chat-composer"
        style={{
          flexShrink: 0,
          background: "#fff",
          borderTop: "1px solid #EFEFF3",
          padding: "10px 16px max(18px, calc(env(safe-area-inset-bottom, 0px) + 6px))", // v330: clear the iPhone home bar (viewport-fit=cover)
        }}
      >
        {/* The Two Bottom Buttons */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {/* Button 1: Chat Toggle */}
          <button
            onClick={() => {
              listEndRef.current?.scrollIntoView({ behavior: "smooth" });
              inputRef.current?.focus();
            }}
            style={{
              flex: "0 0 30%", // v330: the task button gets the room for its longer label
              height: 40, // v332: 40px tap target (was 36)
              borderRadius: 11,
              background: "#F7F5FF",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              cursor: "pointer",
            }}
          >
            <MessageSquare size={13} color="#5B21B6" strokeWidth={2} />
            <span
              style={{
                font: "700 11px 'DM Sans',sans-serif",
                letterSpacing: ".6px",
                textTransform: "uppercase",
                color: "#5B21B6",
              }}
            >
              Chat
            </span>
          </button>

          {/* Button 2: Dynamic Task Option with Desktop-parity Colors & Red Dot */}
          <button
            onClick={taskOption.onClick}
            style={{
              flex: 1,
              minWidth: 0, // v330: long labels ("WAITING FOR SECURE PAYMENT HOLD") pushed past the screen at 320–360px
              padding: "0 8px",
              height: 40, // v332: 40px tap target (was 36)
              borderRadius: 11,
              background: taskOption.bg,
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              cursor: "pointer",
              transition: "all .15s ease",
            }}
          >
            {taskOption.icon}
            <span
              style={{
                font: "700 10.5px 'DM Sans',sans-serif",
                letterSpacing: ".6px",
                textTransform: "uppercase",
                color: taskOption.color,
                whiteSpace: "nowrap",
                overflow: "hidden", // v330: ellipsis instead of overflowing
                textOverflow: "ellipsis",
                minWidth: 0,
              }}
            >
              {taskOption.label}
            </span>
            {taskOption.dotType === "ping-rose" && (
              <span className="relative flex h-2 w-2 ml-0.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
            )}
            {taskOption.dotType === "ping-amber" && (
              <span className="relative flex h-2 w-2 ml-0.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
            )}
            {taskOption.dotType === "solid-emerald" && (
              <span className="relative flex h-2 w-2 ml-0.5">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
            {taskOption.dotType === "solid-amber" && (
              <span className="relative flex h-2 w-2 ml-0.5">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
            )}
          </button>
        </div>

        {/* Message Input / Deal Lock State */}
        {thread?.isNew ? ( /* v414: this chat doesn't exist on the server yet — sending would 404 */
          <div data-testid="chat-not-started" style={{ minHeight: 42, borderRadius: 14, background: "#F2F2F7", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 14px", font: "600 12px 'DM Sans',sans-serif", color: "#5C5C6B", textAlign: "center" }}>
            Start this chat from the campaign/invite
          </div>
        ) : isCancelled ? ( /* v414: the server refuses messages on a closed chat — closed note instead of the composer */
          <div data-testid="chat-closed-note" style={{ minHeight: 42, borderRadius: 14, background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "0 14px", font: "600 12px 'DM Sans',sans-serif", color: "#4B5563", textAlign: "center" }}>
            <Lock size={14} color="#6B7280" />
            <span>{cancelledLabel(currentThread)} · Chat Closed</span>
          </div>
        ) : (
          <>
          {isDealCompleted && ( /* v415: a completed deal's chat stays open (reposts etc.) — a small note above the composer */
          <div
            data-testid="deal-completed-note"
            style={{
              minHeight: 36,
              borderRadius: 12,
              background: "#ECFDF5",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "4px 6px 4px 12px",
              marginBottom: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
              <CheckCircle2 size={14} color="#059669" style={{ flexShrink: 0 }} />
              <span style={{ font: "600 12px 'DM Sans',sans-serif", color: "#065F46" }}>
                Deal completed · you can still message here
              </span>
            </div>
            {!hasReviewed && (
              <button
                onClick={() => setActiveSheet("rating")}
                style={{
                  border: "none",
                  background: "#059669",
                  color: "#fff",
                  borderRadius: 10,
                  padding: "0 12px",
                  height: 32, // v330: was a ~22px tap target
                  font: "600 11px 'DM Sans',sans-serif",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <Star size={11} fill="#fff" />
                <span>Rate</span>
              </button>
            )}
          </div>
          )}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 9 }}>{/* v418: buttons stay at the bottom as the box grows */}
            {/* "+" used to open the deliverable upload for everyone, in every stage — a brand could
                open "Upload deliverable", and a creator could upload before the escrow was funded.
                Now it offers only what the bottom task button offers this user right now. */}
            {plusSheet && (
            <button
              onClick={() => setActiveSheet(plusSheet)}
              aria-label="Add attachment" /* v330 */
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                background: "#F2F2F7",
                border: "none",
                flexShrink: 0,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Add attachment"
            >
              <Plus size={18} color="#5C5C6B" strokeWidth={2.2} />
            </button>
            )}

            {/* v417: paperclip — photo, MP4/MOV video or PDF (max 50 MB), checked before upload */}
            <input ref={attachRef} type="file" accept={CHAT_ATTACH_ACCEPT} style={{ display: "none" }} tabIndex={-1} aria-hidden="true" data-testid="chat-attach-input"
              onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) await sendAttachment(f); }} />
            <button
              type="button"
              onClick={() => attachRef.current?.click()}
              disabled={attaching}
              aria-label="Attach file"
              title="Attach a photo, video or PDF (max 50 MB)"
              style={{ width: 40, height: 40, borderRadius: 20, background: "transparent", border: "none", flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: attaching ? 0.5 : 1 }}
            >
              {attaching ? <Loader2 size={18} color="#5C5C6B" className="animate-spin" /> : <Paperclip size={18} color="#5C5C6B" strokeWidth={2.1} />}
            </button>

            <textarea rows={1} /* v418: grows to 5 lines so a long message (or an Eva draft) can be read before sending */
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent?.isComposing) { e.preventDefault(); handleSend(); } } /* v330 + v418 */}
              enterKeyHint="send"
              aria-label="Message"
              onFocus={() => setTimeout(() => listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 300) /* v353: keyboard opens → show the newest message */}
              placeholder="Message"
              style={{
                flex: 1,
                height: 40, // v418: grows with the text (see the effect above), up to 120px
                minHeight: 40,
                maxHeight: 120,
                resize: "none",
                overflowY: "auto",
                lineHeight: "20px",
                borderRadius: 20,
                background: "#F2F2F7",
                border: "none",
                padding: "10px 18px",
                font: "400 16px 'DM Sans',sans-serif", // v332: 16px — at 14px iPhones zoomed the whole chat on tap
                color: "#0A0A0A",
                boxSizing: "border-box",
                outline: "none",
              }}
            />

            <button
              disabled={!text.trim() || sending /* v353 */}
              onClick={handleSend}
              style={{
                width: 46,
                height: 40,
                borderRadius: 23,
                background: "#7C3AED",
                border: "none",
                flexShrink: 0,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: !text.trim() ? 0.4 : 1,
                transition: "opacity .15s",
              }}
              aria-label="Send message"
            >
              <Send size={16} color="#fff" strokeWidth={2} style={{ transform: "rotate(45deg) translate(-1px, 1px)" }} />
            </button>
          </div>
          </>
        )}
      </div>

      {/* Mobile Bottom Sheets for Actions with smooth spring & fade animations */}
      <AnimatePresence>
        {activeSheet === "requestChanges" && (
          <MobileRequestChangesSheet key="sheet-changes" onClose={closeSheet} onSubmit={async (fb) => { const r = await requestChanges(fb); if (r === "limit") { setActiveSheet("orderSupport"); return false; } return r; } /* v417: limit reached → Contact support sheet */} />
        )}
        {activeSheet === "rejectLiveLinks" && (
          <MobileRequestChangesSheet
            key="sheet-reject-links"
            onClose={closeSheet}
            onSubmit={rejectLiveLinks}
            title="What's wrong with the link?"
            subtitle="This asks the creator to resubmit their live link."
            placeholder="e.g., The YouTube link is set to private."
            submitLabel="Request resubmission"
            tags={LIVE_LINK_TAGS}
          />
        )}
        {activeSheet === "orderSupport" && (
          <MobileOrderSupportSheet
            key="sheet-order-support"
            thread={currentThread}
            threadId={currentThread?.id || thread?.id}
            isBrand={isBrand}
            onClose={closeSheet}
            onCreated={() => loadMessages()}
          />
        )}
        {activeSheet === "signedInfo" && (
          <div key="sheet-signed" className="fixed inset-0 z-[80] flex flex-col justify-end" data-testid="signed-info-sheet">
            <div className="absolute inset-0 bg-black/40" onClick={closeSheet} />
            <div className="relative bg-white rounded-t-[24px] px-5 pt-4" style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))", fontFamily: "'DM Sans', sans-serif" }}>
              <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-4" />
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-full bg-[#ECFDF5] flex items-center justify-center shrink-0"><CheckCircle2 size={22} color="#059669" /></span>
                <div className="min-w-0">
                  <div className="text-[16px] font-bold text-[#0A0A0A]">You've signed this agreement</div>
                  <div className="text-[13px] text-[#6B7280] mt-0.5">
                    {isOtherPartySigned ? "Both sides have signed. The deal is active." : `Waiting for ${partnerName || (isBrand ? "the creator" : "the brand")} to sign. We'll notify you.`}
                  </div>
                </div>
              </div>
              <button type="button" onClick={closeSheet} className="mt-5 w-full h-12 rounded-[14px] bg-[#7C3AED] text-white font-bold text-[14.5px]">Got it</button>
            </div>
          </div>
        )}

        {activeSheet === "contract" && (
          <MobileContractSheet
            key="sheet-contract"
            thread={currentThread}
            user={user}
            isBrand={isBrand}
            amount={amount}
            campaignTitle={campaignTitle}
            onSendOtp={sendSignOtp}
            onSign={signAgreement}
            onClose={closeSheet}
          />
        )}
        {activeSheet === "escrow" && (
          <MobileEscrowSheet
            key="sheet-escrow"
            onClose={closeSheet}
            amount={amount}
            isBrand={isBrand}
            isFunded={isPaymentFunded}
            isDealCompleted={isDealCompleted}
            paying={paying}
            campaignTitle={campaignTitle}
            partnerName={partnerName}
            dealId={currentThread?.deal_id || null /* v364: Review & pay asks the server for the total (service fee, coupon) */}
            threadId={currentThread?.id || thread?.id || null}
            onPay={(method, couponCode, hooks) => payIntoEscrow(method, couponCode, hooks) /* Session 57: the sheet shows success / try-again itself; Session 58: + the picked method; v364: + coupon; v366: + hooks (Cancel / window opened) */}
          />
        )}
        {activeSheet === "respond" && (
          <MobileRespondOfferSheet key="sheet-respond" onClose={closeSheet} offer={latestOffer && !latestOffer.mine ? latestOffer : null}
            // v353: the brand's first offer / the creator's application price has no "counter" to accept — accepting it
            // means signing the contract at that price (same as the offer card in the chat). It used to answer
            // "There is no counter offer waiting for your answer."
            onAccept={latestOffer && /^(creator_application_offer|brand_invitation_offer)$/.test(latestOffer.type) ? () => { setTimeout(() => setActiveSheet("contract"), 0); } /* after the sheet's own close */ : () => acceptCounter(latestOffer?.amount || undefined) /* v414: + the amount shown */}
            onCounter={sendCounter} />
        )}
        {activeSheet === "rating" && (
          <MobileRatingSheet key="sheet-rating" onClose={closeSheet} onSubmit={submitReview} partnerName={partnerName} partnerPic={partnerPic} />
        )}
        {activeSheet === "liveLink" && (
          <MobileLiveLinkSheet key="sheet-live-link" onClose={closeSheet} onSubmit={submitLiveLink} />
        )}
        {activeSheet === "upload" && (
          <MobileUploadSheet
            key="sheet-upload"
            onClose={closeSheet}
            onSubmit={uploadDeliverable}
            title={isUgcOrder ? "Upload deliverable" : "Upload content draft"}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{/* v415: closing slide plays (it vanished instantly) */}
      {showNegotiation && (
        <NegotiationTable
          key="negotiation"
          thread={currentThread}
          role={isBrand ? "brand" : "creator"}
          locked={isNegotiationLocked}
          onClose={() => setShowNegotiation(false)}
          onActionComplete={() => { loadMessages(); refreshThread(); }}
        />
      )}
      </AnimatePresence>
    </div>
  );
}
