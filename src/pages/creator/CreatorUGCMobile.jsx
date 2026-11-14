import React, { useState, useEffect, useMemo, useRef } from "react";
import CreatorCancelOrderSheet from "../../components/ugc/CreatorCancelOrderSheet";
import { creatorCancelInfo } from "../../utils/ugcOrderCancel";
import GoodToKnowCard from "../../components/ugc/GoodToKnowCard";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "sonner";
import { Zap, Clock, Check, CheckCircle2, ArrowRight, ArrowLeft, MessageCircle, Upload, AlertTriangle, ExternalLink, Lock, ChevronRight, Film } from "lucide-react";
import { UGCCardsListSkeleton, UGCOrderListSkeleton } from "../../components/common/MobileSkeletons";
import MobileOrderSupportSheet from "../../components/chat/mobile/MobileOrderSupportSheet";
import { normalizeKycStatus } from "../../utils/kycStatus";
import { deliveryHoursOf, orderWindowHours, UGC_REVISION_LIMIT } from "../../utils/ugcTerms";
import { agreementFields, AGREEMENT_VERSIONS } from "../../lib/agreementCapture";
import { ugcAgreement, asCaptureSource } from "../../lib/agreementTerms";
import AgreementTermsPanel from "../../components/chat/AgreementTermsPanel";

import { Presence, appConfirm } from "../../components/common/Popup";
import { useHideBottomNav } from "../../lib/bottomNavVisibility";
import BrandLogo from "../../components/common/BrandLogo";
import { useLiveRefresh } from "../../lib/liveRefresh";
import BriefDetailBody from "./creatorUgc/BriefDetailBody";
import BriefSpecsAccordion from "./creatorUgc/BriefSpecsAccordion";
import BriefStickyBar from "./creatorUgc/BriefStickyBar";
import RevisionNoticeCard from "./creatorUgc/RevisionNoticeCard";
import SignWithOtpBox from "./creatorUgc/SignWithOtpBox";
import SubmitDeliverableSection from "./creatorUgc/SubmitDeliverableSection";
import UgcTopHeader from "./creatorUgc/UgcTopHeader";
import SortSheet from "./creatorUgc/SortSheet";
import { safeExt } from "../../lib/fileExt";
import { OfflineAware } from "../../components/common/OfflineState"; // v334
import UGCContractModal from "../../components/chat/UGCContractModal"; // v414: same sign flow the desktop workspace uses
import { formatINROrDash, toNumber } from "../../utils/safeFormat"; // v414
import useBackToClose from "../../lib/popupRules";
// Format helper
// v414: unknown / missing amount shows "—" (was "₹0", which reads as "unpaid / free")
const formatCurrency = (amount) => {
  return toNumber(amount, 0) > 0 ? formatINROrDash(amount) : "—";
};

// Compute SLA urgency & remaining time
function computeTimeRemaining(deadlineStr, totalHours = 24) {
  if (!deadlineStr) {
    // v332: no deadline yet → say so, instead of a made-up "24h left · ON TRACK · Tomorrow"
    return {
      hoursLeft: totalHours,
      minutesLeft: 0,
      text: `${totalHours}h to deliver`,
      pct: 100,
      urgency: "green",
      badgeText: "NOT STARTED",
      badgeBg: "#F3F4F6",
      badgeColor: "#4B5563",
      cardBg: "#F0FDF4",
      accentColor: "#059669",
      subtext: "Timer starts when the agreement is signed",
      deadlineFormatted: "after signing"
    };
  }

  const deadline = new Date(deadlineStr).getTime();
  // v330: an unparseable deadline read "NaNh NaNm left" — treat it like no deadline.
  if (!Number.isFinite(deadline)) return computeTimeRemaining(null, totalHours);
  const now = Date.now();
  const diffMs = deadline - now;

  if (diffMs <= 0) {
    return {
      hoursLeft: 0,
      minutesLeft: 0,
      text: "Deadline passed", // v332: was "0h 0m left"
      pct: 0,
      urgency: "red",
      badgeText: "OVERDUE",
      badgeBg: "#FEE2E2",
      badgeColor: "#B91C1C",
      cardBg: "#FEF2F2",
      accentColor: "#DC2626",
      subtext: "Upload as soon as you can",
      deadlineFormatted: "Overdue"
    };
  }

  const totalMs = totalHours * 3600 * 1000;
  const pct = Math.max(0, Math.min(100, Math.round((diffMs / totalMs) * 100)));
  const hoursLeft = Math.floor(diffMs / (3600 * 1000));
  const minutesLeft = Math.floor((diffMs % (3600 * 1000)) / (60 * 1000));
  const text = hoursLeft >= 48 ? `${Math.floor(hoursLeft / 24)}d ${hoursLeft % 24}h left` : `${hoursLeft}h ${minutesLeft}m left`; // v414: days, not "371h"

  // v330: IST clock time; a deadline 2+ days away said "tomorrow" — it now shows the date.
  const timeStr = new Date(deadline).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
  const istDay = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const dayStr = istDay(deadline) === istDay(now)
    ? "today"
    : istDay(deadline) === istDay(now + 86400000)
    ? "tomorrow"
    : new Date(deadline).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

  if (hoursLeft > 6) {
    return {
      hoursLeft,
      minutesLeft,
      text,
      pct,
      urgency: "green",
      badgeText: "ON TRACK",
      badgeBg: "#DCFCE7",
      badgeColor: "#047857",
      cardBg: "#F0FDF4",
      accentColor: "#059669",
      subtext: `Submit before ${timeStr} ${dayStr} · of ${totalHours}h`,
      timerStateDesc: "More than 6h · keep filming",
      deadlineFormatted: `${timeStr} ${dayStr}`
    };
  } else if (hoursLeft >= 2) {
    return {
      hoursLeft,
      minutesLeft,
      text,
      pct,
      urgency: "amber",
      badgeText: "GETTING TIGHT",
      badgeBg: "#FEF3C7",
      badgeColor: "#B45309",
      cardBg: "#FFFBEB",
      accentColor: "#D97706",
      subtext: `Upload before ${timeStr} ${dayStr}`, // v353: was "Re-upload" even on a first upload
      timerStateDesc: "2–6h left · start editing now",
      deadlineFormatted: `${timeStr} ${dayStr}`
    };
  } else {
    return {
      hoursLeft,
      minutesLeft,
      text,
      pct,
      urgency: "red",
      badgeText: "FINAL HOURS",
      badgeBg: "#FEE2E2",
      badgeColor: "#B91C1C",
      cardBg: "#FEF2F2",
      accentColor: "#DC2626",
      subtext: `Under 2h · miss it and secure payment hold returns`,
      timerStateDesc: "Under 2h · miss it and secure payment hold returns",
      deadlineFormatted: `${timeStr} ${dayStr}`
    };
  }
}

// Compact Ring Timer Component (Spec: 04 · Timer states)
/** Session 43: live-link step of a UGC collaboration order, from the stage the server resolved
 *  (same resolver the chat agrees with). null = no live-link step right now. */
export function ugcLinkPhase(o, isCompleted = false) {
  if (!o || isCompleted) return null;
  const st = String(o.stage || "").toUpperCase();
  const status = String(o.status || "").toUpperCase();
  if (st === "REVISION_REQUESTED_LINKS") return "FIX";
  if (st === "REVISION_DECLINED_LINKS") return "FIX_DECLINED";
  if (st === "LIVE_LINK_SUBMITTED" || status === "LINKS_UNDER_REVIEW" || status === "LIVE_LINK_SUBMITTED") return "SUBMITTED";
  if (st === "COMPLETED_APPROVAL" || st === "AWAITING_LIVE_LINK" || status === "AWAITING_LIVE_LINK") return "DUE";
  return null;
}

const LINK_PHASE_COPY = {
  DUE: { tone: "#047857", bg: "#ECFDF5", border: "#A7F3D0", title: "Draft approved 🎉", text: "Post the video and submit your live post link.", cta: "Submit live link" },
  FIX: { tone: "#B45309", bg: "#FFFBEB", border: "#FDE68A", title: "Brand asked for corrected links", text: "Fix the post and send the corrected live link.", cta: "Resubmit live link" },
  SUBMITTED: { tone: "#6D28D9", bg: "#F5F0FF", border: "#DDD6FE", title: "Live link sent", text: "Waiting for the brand to approve your live link.", cta: "Open chat" },
  FIX_DECLINED: { tone: "#B91C1C", bg: "#FEF2F2", border: "#FECACA", title: "You declined the link changes", text: "Waiting for the brand to respond.", cta: "Open chat" },
};

/** Card shown instead of "Submit deliverable" once the order is past the draft. The live link
 *  itself is sent from the chat (its Submit live link sheet) — no second way to send it. */
export function UGCLinkPhaseCard({ phase, onOpenChat }) {
  const c = LINK_PHASE_COPY[phase];
  if (!c) return null;
  return (
    <div className="rounded-[18px] p-3.5 border" style={{ background: c.bg, borderColor: c.border }} data-testid={`ugc-link-phase-${phase.toLowerCase()}`}>
      <div className="font-bold text-[14px]" style={{ color: c.tone }}>{c.title}</div>
      <div className="mt-1 text-[12.5px] leading-[1.5] text-[#374151]">{c.text}</div>
      <button
        type="button"
        onClick={onOpenChat}
        className="mt-3 w-full h-[46px] rounded-[13px] text-white font-bold text-[13.5px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
        style={{ background: c.tone }}
      >
        {phase === "DUE" || phase === "FIX" ? <ExternalLink size={15} /> : <MessageCircle size={15} />}
        <span>{c.cta}</span>
      </button>
    </div>
  );
}

// Session 43 (Ravi): clock face whose hands keep turning, so the deadline feels live.
export function TickingClock({ color = "#059669", size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" data-testid="ugc-ticking-clock">
      <circle cx="12" cy="12" r="9.5" fill="#fff" stroke={color} strokeWidth="2" />
      <g className="ybex-clock-hour"><line x1="12" y1="12" x2="12" y2="7.5" stroke={color} strokeWidth="2.2" strokeLinecap="round" /></g>
      <g className="ybex-clock-min"><line x1="12" y1="12" x2="12" y2="5" stroke={color} strokeWidth="1.6" strokeLinecap="round" /></g>
      <circle cx="12" cy="12" r="1.5" fill={color} />
    </svg>
  );
}

export function UGCTimerRing({ deadline, totalHours = 24, variant = "card", customSubtext = null, customBadge = null }) {
  const [ticker, setTicker] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTicker((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const info = useMemo(() => computeTimeRemaining(deadline, totalHours), [deadline, totalHours, ticker]);

  if (variant === "ring-only") {
    return (
      <div className="relative w-[38px] h-[38px] shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 36 36" className="w-[38px] h-[38px] -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="#F1F1F5" strokeWidth="4" />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke={info.accentColor}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="94"
            strokeDashoffset={94 - (94 * info.pct) / 100}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <TickingClock color={info.accentColor} size={20} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-[14px] p-[10px_11px] transition-colors"
      style={{ background: info.cardBg }}
    >
      <div className="flex items-center gap-[10px]">
        {/* Ring gauge with conic-gradient & pulse dot */}
        <div
          className="w-[38px] h-[38px] rounded-[19px] shrink-0 flex items-center justify-center relative shadow-xs"
          style={{
            background: `conic-gradient(${info.accentColor} 0% ${info.pct}%, #ffffff ${info.pct}% 100%)`
          }}
        >
          <div
            className="w-[30px] h-[30px] rounded-[15px] flex items-center justify-center"
            style={{ background: info.cardBg }}
          >
            {/* Session 43 (Ravi): a small running clock instead of a still dot. */}
            <TickingClock color={info.accentColor} />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-[17px] leading-none tracking-[-0.5px] text-[#0A0A0A]">
            {info.text}
          </div>
          <div className="mt-1 font-normal text-[10.5px] text-[#6B7280] whitespace-nowrap overflow-hidden text-ellipsis">
            {customSubtext || info.subtext}
          </div>
        </div>

        <div
          className="h-[21px] px-2 rounded-[7px] flex items-center font-bold text-[11px] tracking-[0.4px] shrink-0 whitespace-nowrap uppercase"
          style={{
            background: customBadge?.bg || info.badgeBg,
            color: customBadge?.color || info.badgeColor
          }}
        >
          {customBadge?.text || info.badgeText}
        </div>
      </div>
    </div>
  );
}

// Status Stepper Component (Signed -> Filming -> Brand review -> Paid)
export function UGCStatusStepper({ stage = "IN_PROGRESS" }) {
  // Determine active step index
  // 0: Signed, 1: Filming, 2: Brand review, 3: Paid
  let activeIndex = 1; // Default is Filming

  if (stage === "PENDING_SIGNATURE") {
    activeIndex = 0;
  } else if (stage === "IN_PROGRESS" || stage === "REVISION_REQUESTED") {
    activeIndex = 1;
  } else if (stage === "IN_REVIEW" || stage === "LIVE_LINK_SUBMITTED") {
    activeIndex = 2;
  } else if (stage === "COMPLETED" || stage === "COMPLETED_APPROVAL") {
    activeIndex = 3;
  }

  const steps = [
    { label: "Signed", id: 0 },
    { label: "Filming", id: 1 },
    { label: "Brand review", id: 2 },
    { label: "Paid", id: 3 }
  ];

  return (
    <div className="flex items-center justify-between mt-3 px-1">
      {steps.map((s, idx) => {
        const isDone = idx < activeIndex || (activeIndex === 3 && idx === 3);
        const isCurrent = idx === activeIndex && activeIndex !== 3;

        return (
          <React.Fragment key={s.id}>
            <div className="flex flex-col items-center gap-1.5 min-w-[55px]">
              {isDone ? (
                <div className="w-4 h-4 rounded-full bg-[#059669] flex items-center justify-center text-white shadow-xs">
                  <Check size={10} strokeWidth={3.5} />
                </div>
              ) : isCurrent ? (
                <div className="w-4 h-4 rounded-full bg-white border-[3.5px] border-[#7C3AED] box-border shadow-xs animate-pulse" />
              ) : (
                <div className="w-4 h-4 rounded-full bg-white border-2 border-[#E5E5EA] box-border" />
              )}
              <span
                className={`text-[10px] font-medium whitespace-nowrap ${
                  isDone
                    ? "text-[#047857] font-semibold"
                    : isCurrent
                    ? "text-[#7C3AED] font-bold"
                    : "text-[#6B7280]"
                }`}
              >
                {s.label}
              </span>
            </div>

            {idx < steps.length - 1 && (
              <div
                className={`flex-1 h-[2px] -mt-5 rounded-full transition-colors ${
                  idx < activeIndex ? "bg-[#059669]" : "bg-[#E5E7EB]"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Deliverable Format Config Helper
export function getDeliverableBadgeMeta(type = "") {
  const t = String(type || "").toLowerCase();
  if (t.includes("collab")) {
    return {
      label: "Collaboration",
      cleanLabel: "Collaboration",
      bg: "#EEF2FF",
      color: "#4F46E5",
      border: "#C7D2FE",
      icon: null,
      tag: "collab"
    };
  }
  if (t.includes("raw") || t.includes("draft")) {
    return {
      label: "UGC Raw",
      cleanLabel: "UGC Raw",
      bg: "#FFFBEB",
      color: "#D97706",
      border: "#FDE68A",
      icon: null,
      tag: "raw"
    };
  }
  return {
    label: "UGC Edited",
    cleanLabel: "UGC Edited",
    bg: "#EFF6FF",
    color: "#2563EB",
    border: "#BFDBFE",
    icon: null,
    tag: "edited"
  };
}

// MAIN MOBILE CREATOR UGC VIEW
export default function CreatorUGCMobile({ defaultTab = "explore", initialOrderId = null }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  // Primary tab: 'explore' | 'manage'
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "orders" || tabParam === "manage" || defaultTab === "orders" || defaultTab === "manage") {
      return "manage";
    }
    return "explore";
  });

  // Active view: 'main' | 'claim' | 'workspace'
  const [activeView, setActiveView] = useState("main");
  // Session 39 (M13): brief details, agreement and the order workspace are pages of their own — no bottom bar.
  useHideBottomNav(activeView !== "main");
  const [selectedBrief, setSelectedBrief] = useState(null);
  // v426: phone Back from "Brief details" returns to the brief list (it left the UGC tab); from the sign step, to the details.
  useBackToClose(activeView === "brief_details" || activeView === "agreement", () => { setActiveView("main"); setSelectedBrief(null); });
  useBackToClose(activeView === "agreement", () => setActiveView("brief_details"));
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Data states
  const [briefs, setBriefs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState({ briefs: false, orders: false }); // v330: failed ≠ empty
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState("payout"); // 'payout' | 'newest' | 'duration'
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [formatFilter, setFormatFilter] = useState("all"); // 'all' | 'collab' | 'edited' | 'raw'
  const [manageFilter, setManageFilter] = useState("all"); // 'all' | 'production' | 'review' | 'completed'

  // Workspace upload form states
  const [videoFile, setVideoFile] = useState(null);
  const [videoDriveUrl, setVideoDriveUrl] = useState("");
  const [creatorNotes, setCreatorNotes] = useState("");
  const [liveLinkUrl, setLiveLinkUrl] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [briefSpecsOpen, setBriefSpecsOpen] = useState(false);
  const fileInputRef = useRef(null);

  // Tracking just claimed order to pin at the top with badge
  const [justClaimedOrderId, setJustClaimedOrderId] = useState(null);
  // v414: unsigned reservation picked for signing from the orders list
  const [signingReservation, setSigningReservation] = useState(null);

  // OTP & Agreement states for M02 Sign Agreement (Step 2 of 2)
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef([]);
  const agreementRef = useRef(null); // session 28: the text on screen goes into the signature record
  // Session 30 (Ravi): nothing pre-ticked; the OTP goes out only after both boxes are ticked.
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedDeadline, setAgreedDeadline] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [signingOrder, setSigningOrder] = useState(false);
  // Session 24: decline changes / cancel claim / order ticket (desktop ManageUGCOrdersView parity).
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [declining, setDeclining] = useState(false);
  const [cancellingClaim, setCancellingClaim] = useState(false);
  const [showCancelOrder, setShowCancelOrder] = useState(false); // session 25: signed-order cancel
  const [supportOpen, setSupportOpen] = useState(false);
  // Session 24: only KYC-approved creators can claim (the server enforces it too).
  // "APPROVED" | "PENDING" | "REJECTED" | "NONE" | null (not loaded yet)
  const [kycStatus, setKycStatus] = useState(null);
  // Deep link (?orderId=): open the MAPPED order once the list is mapped. It used to open the
  // raw order, so stage, payout and flags were missing in the workspace.
  const [pendingOpenOrderId, setPendingOpenOrderId] = useState(null);
  const selectedOrderKey = selectedOrder?.id;
  useEffect(() => {
    setDeclineOpen(false);
    setDeclineReason("");
    setSupportOpen(false);
  }, [selectedOrderKey]);

  const userEmail = user?.email || "";
  // Session 30: the v1 agreement for a brief — the same object the screen shows and the record stores.
  const buildUgcAgreement = (b) => ugcAgreement({
    brandName: b?.brand_name || "Verified Brand", creatorName: user?.name || user?.full_name, briefTitle: b?.title,
    payout: Number(b?.budget) || 0, hours: deliveryHoursOf(b?.delivery_hours, 24), revisions: UGC_REVISION_LIMIT,
    deliverableType: b?.deliverable_type, videoDuration: b?.video_duration, // v427: clause matches the brief's format
  });
  // The user's OWN registered email, shown in full so they know which inbox to check
  // (session 23: it used to be masked to "ra***@gmail.com").
  const maskedEmail = userEmail || "your registered email";

  // Session 30: send the OTP once, only after both boxes are ticked on M02 (was: on opening M02).
  const termsAccepted = agreedTerms && agreedDeadline;
  useEffect(() => {
    if (activeView === "agreement" && termsAccepted && userEmail && !otpSent && !sendingOtp) {
      handleSendMobileOTP(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, termsAccepted, userEmail]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [resendCooldown]);

  const handleSendMobileOTP = async (isAuto = false) => {
    if (!userEmail || !userEmail.includes("@")) {
      if (!isAuto) toast.error("Registered account email not found.");
      return;
    }
    setSendingOtp(true);
    try {
      const res = await api.post("/otp/send", {
        value: userEmail,
        target: "email",
        purpose: "contract_sign",
        recipientName: user?.name || "Creator Partner",
        brandName: selectedBrief?.brand_name || "Brand Partner",
        creatorName: user?.name || "Creator Partner",
        campaignTitle: selectedBrief?.title || "UGC Video Deliverable Agreement",
        dealAmount: selectedBrief?.budget || ""
      });
      setOtpSent(true);
      setResendCooldown(60);
      // Never show the code on screen — it's in the email (session 23). Only when test mode
      // could NOT deliver the email is it shown, like every other signing screen does.
      if (res.data?.code && String(res.data?.message || "").startsWith("Test mode")) {
        toast.warning(`${res.data.message} Test code: ${res.data.code}`, { duration: 15000 });
      } else {
        toast.success(`Code sent to ${maskedEmail}. Use the code from the latest email.`);
      }
    } catch (e) {
      if (!isAuto) toast.error("Failed to send OTP. Please try again.");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleDigitChange = (index, value) => {
    if (value.length > 1) {
      const clean = value.replace(/\D/g, "").slice(0, 6);
      if (clean) {
        const newDigits = [...otpDigits];
        clean.split("").forEach((char, i) => {
          if (index + i < 6) newDigits[index + i] = char;
        });
        setOtpDigits(newDigits);
        const nextFocus = Math.min(5, index + clean.length);
        inputRefs.current[nextFocus]?.focus();
      }
      return;
    }

    const cleanChar = value.replace(/\D/g, "");
    const newDigits = [...otpDigits];
    newDigits[index] = cleanChar;
    setOtpDigits(newDigits);

    if (cleanChar && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyAndSignMobile = async () => {
    const fullOtp = otpDigits.join("");
    if (!agreedTerms || !agreedDeadline) {
      toast.error("Please agree to all agreement terms.");
      return;
    }
    if (fullOtp.length < 6) {
      toast.error("Please enter the complete 6-digit verification code.");
      return;
    }
    if (!selectedBrief) return;

    setSigningOrder(true);
    toast.loading("Verifying OTP & creating order...", { id: "mobile-sign" });

    try {
      // 1. Verify OTP code
      const verified = await api.post("/otp/verify", { value: userEmail, code: fullOtp });

      // 2. Claim brief and execute agreement (starts 24h timer in backend)
      const { data } = await api.post("ugc/orders/claim", {
        brief_id: selectedBrief.id,
        signature: `OTP Verified: ${userEmail}`,
        sign_token: verified?.data?.sign_token,
        ...agreementFields(asCaptureSource(buildUgcAgreement(selectedBrief)), AGREEMENT_VERSIONS.ugcMobile)
      });

      const newOrderId = data?.order_id || data?.order?.id;
      setJustClaimedOrderId(newOrderId);

      toast.success(`✓ Agreement signed · brief claimed — Your ${deliveryHoursOf(selectedBrief?.delivery_hours, 24)}h timer has started`, {
        id: "mobile-sign",
        duration: 4000
      });

      // Reload fresh data from backend
      await loadData();

      // Reset state and transition to Manage Orders list
      setSelectedBrief(null);
      setOtpDigits(["", "", "", "", "", ""]);
      setActiveTab("manage");
      setActiveView("main");
      setSearchParams({ tab: "manage" });
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.detail || e?.response?.data?.error || "Failed to verify OTP or sign agreement.", {
        id: "mobile-sign"
      });
      if (e?.response?.data?.code === "KYC_REQUIRED") {
        setKycStatus(normalizeKycStatus({ status: e.response.data.kyc_status }));
        setActiveView("main");
      }
    } finally {
      setSigningOrder(false);
    }
  };

  // Fetch briefs & orders from backend APIs
  const loadData = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const failed = { briefs: false, orders: false, kyc: false }; // v330
    try {
      const [briefsRes, ordersRes, kycRes] = await Promise.all([
        api.get("ugc/briefs/available").catch(() => { failed.briefs = true; return { data: [] }; }),
        api.get("ugc/orders/creator").catch(() => { failed.orders = true; return { data: [] }; }),
        api.get("verifications/me").catch(() => { failed.kyc = true; return { data: null }; })
      ]);
      // v344: a failed KYC load is not "no KYC" — it showed "Complete KYC to claim" to verified creators.
      // Keep what we knew (null = claim button waits), or trust the account's own kyc_verified flag.
      if (failed.kyc) setKycStatus((prev) => prev ?? (user?.kyc_verified ? "APPROVED" : null));
      else setKycStatus(normalizeKycStatus(kycRes?.data));

      const availableBriefs = Array.isArray(briefsRes.data) ? briefsRes.data : []; // v330: non-array answer crashed the list
      const creatorOrders = Array.isArray(ordersRes.data) ? ordersRes.data : [];

      // v330: a quiet background refresh that fails keeps the lists already on screen.
      if (!(silent && failed.briefs)) setBriefs(availableBriefs);
      if (!(silent && failed.orders)) setOrders(creatorOrders);
      setLoadFailed((prev) => ({ briefs: silent ? prev.briefs && failed.briefs : failed.briefs, orders: silent ? prev.orders && failed.orders : failed.orders }));

      // If initialOrderId was passed, open its workspace
      if (initialOrderId) setPendingOpenOrderId(String(initialOrderId));
    } catch (e) {
      console.error("[CreatorUGCMobile] loadData error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Session 43 (Ravi): the order page kept asking for the video after the draft was approved in
  // chat — it only loaded once. Same GET calls, re-run quietly on deal events, on return to the
  // tab and every 30 s.
  useLiveRefresh(() => loadData({ silent: true }), { types: ["ugc", "deal", "chat"], intervalMs: 30000 });

  // Map & resolve orders into operational stages
  const mappedOrders = useMemo(() => {
    return (orders || []).map((o) => {
      const rawStatus = (o.status || "").toUpperCase();
      const creatorStatus = (o.creator_status || o.status || "").toUpperCase();
      const paymentStatus = (o.payment_status || "").toUpperCase();
      const thrStatus = (o.thread_status || "").toUpperCase();
      const thrFlow = (o.thread_flow_state || "").toUpperCase();
      const orderStage = (o.stage || "").toUpperCase();

      // Session 24: an order the deadline system EXPIRED leaves the creator's active list
      // (they're told by notification/email; desktop shows it under completed with a note).
      if (creatorStatus === "CANCELLED" || rawStatus === "CANCELLED" || creatorStatus === "EXPIRED" || rawStatus === "EXPIRED" || o.expired_at || o.brand_id === "archived_deleted_brand") {
        return null;
      }

      const isCompleted =
        creatorStatus === "COMPLETED" ||
        creatorStatus === "APPROVED" ||
        creatorStatus === "PAID" ||
        creatorStatus === "RELEASED" ||
        rawStatus === "COMPLETED" ||
        rawStatus === "APPROVED" ||
        paymentStatus === "RELEASED" ||
        paymentStatus === "PAID" ||
        thrStatus === "COMPLETED" ||
        thrFlow === "COMPLETED" ||
        orderStage === "COMPLETED";

      const isRevision =
        creatorStatus === "REVISION_REQUESTED" ||
        creatorStatus === "REVISION_REQ" ||
        creatorStatus === "IN_REVISION" ||
        rawStatus === "REVISION_REQUESTED" ||
        thrFlow === "REVISION_REQUESTED";

      const isUnderReview =
        !isCompleted &&
        !isRevision &&
        (creatorStatus === "SUBMITTED" ||
          creatorStatus === "DELIVERED" ||
          creatorStatus === "IN_REVIEW" ||
          creatorStatus === "CONTENT_SUBMITTED" ||
          rawStatus === "SUBMITTED" ||
          o.video_url ||
          o.submission_link);

      // Session 24. Declining the brand's changes (or a dispute) is the creator's answer to the
      // request; it must not look like a fresh revision to do.
      const revisionDeclined =
        !isCompleted &&
        (creatorStatus === "REVISION_DECLINED" || creatorStatus === "DISPUTED" ||
          rawStatus === "REVISION_DECLINED" || rawStatus === "DISPUTED" ||
          thrFlow === "REVISION_DECLINED" || orderStage === "REVISION_DECLINED");
      // A reservation whose agreement was never signed (claimed on desktop, where claim and sign
      // are two steps). Only an explicit false/null counts — a missing field is not "unsigned".
      const isUnsigned =
        !isCompleted &&
        (o.agreement_signed_creator === false || o.agreement_signed_creator === null) &&
        !(o.video_url || o.submission_link || o.drive_url);

      // Session 43 (Ravi): after the draft is approved the chat asks for the live link, but this
      // page still asked for the video. The server already resolves the same stage the chat uses
      // (o.stage: COMPLETED_APPROVAL = live link due, LIVE_LINK_SUBMITTED, …) — read it.
      const linkPhase = ugcLinkPhase(o, isCompleted);

      let stage = "IN_PROGRESS";
      if (isCompleted) stage = "COMPLETED";
      else if (linkPhase === "DUE" || linkPhase === "FIX") stage = "IN_PROGRESS";
      else if (linkPhase) stage = "IN_REVIEW";
      else if (isRevision && !revisionDeclined) stage = "REVISION_REQUESTED";
      else if (isUnderReview) stage = "IN_REVIEW";

      const deadline = o.internal_deadline || o.deadline || o.sla_expires_at;
      const orderNumber = o.order_number || `#ORD-${String(o.id).slice(-4).toUpperCase()}`;
      const title = o.brief?.title || o.title || o.brief?.product_name || "UGC Video Deliverable";
      const brandName = o.brief?.brand_name || o.brand_name || "Brand"; // v332: no made-up "Verified"
      const brandLetter = (brandName || "B").charAt(0).toUpperCase();
      const brandLogo = o.brief?.brand_logo || o.brand_logo || o.brand?.logo || o.brief?.brand?.logo || "";
      // No invented ₹5,000 when the order carries no amount (a money claim must match the server).
      const payout = o.creator_payout || o.agreed_amount || o.brief?.budget || 0;
      const revisionCount = o.revision_count || UGC_REVISION_LIMIT; // v332: same limit the brief shows (was a fixed 3)
      const revisionsUsed = o.revisions_used || 0;
      const revisionsLeft = Math.max(0, revisionCount - revisionsUsed);
      const revisionNotes =
        o.revision_notes ||
        o.revision_feedback ||
        o.brand_feedback ||
        "";
      const realUtr =
        o.utr_number ||
        o.payout_utr ||
        o.payout_reference ||
        o.utr ||
        o.transaction?.utr_number ||
        o.payment_reference ||
        "";

      return {
        ...o,
        stage,
        orderNumber,
        title,
        brandName,
        brandLetter,
        brandLogo,
        payout,
        deadline,
        revisionsLeft,
        revisionNotes,
        realUtr,
        revisionDeclined,
        isUnsigned,
        linkPhase
      };
    }).filter(Boolean);
  }, [orders]);

  // An open order follows fresh data (stage, links) instead of the copy taken when it was opened.
  useEffect(() => {
    if (!selectedOrder) return;
    const fresh = mappedOrders.find((o) => String(o.id) === String(selectedOrder.id));
    if (fresh && (fresh.stage !== selectedOrder.stage || fresh.linkPhase !== selectedOrder.linkPhase)) setSelectedOrder(fresh);
  }, [mappedOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pendingOpenOrderId) return;
    const found = mappedOrders.find(
      (o) => String(o.id) === pendingOpenOrderId || String(o.brief_id) === pendingOpenOrderId
    );
    if (found) {
      setSelectedOrder(found);
      setActiveView("workspace");
      setActiveTab("manage");
      setPendingOpenOrderId(null);
    }
  }, [pendingOpenOrderId, mappedOrders]);

  // Manage orders filter count metrics
  const orderCounts = useMemo(() => {
    return {
      all: mappedOrders.length,
      production: mappedOrders.filter((o) => o.stage === "IN_PROGRESS" || o.stage === "REVISION_REQUESTED").length, // v353: same as the list
      review: mappedOrders.filter((o) => o.stage === "IN_REVIEW").length,
      completed: mappedOrders.filter((o) => o.stage === "COMPLETED").length
    };
  }, [mappedOrders]);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    let list = mappedOrders.filter((o) => {
      if (manageFilter === "production") return o.stage === "IN_PROGRESS" || o.stage === "REVISION_REQUESTED";
      if (manageFilter === "review") return o.stage === "IN_REVIEW";
      if (manageFilter === "completed") return o.stage === "COMPLETED";
      return true;
    });

    if (justClaimedOrderId) {
      list = [...list].sort((a, b) => {
        if (a.id === justClaimedOrderId) return -1;
        if (b.id === justClaimedOrderId) return 1;
        return 0;
      });
    }

    return list;
  }, [mappedOrders, manageFilter, justClaimedOrderId]);

  // Filtered briefs list
  const filteredBriefs = useMemo(() => {
    let list = (briefs || []).filter((b) => {
      // Filter out fully claimed briefs
      if ((b.claimed_count || 0) >= (b.max_creators || 1)) return false;

      // Format filter
      if (formatFilter !== "all") {
        const dt = (b.deliverable_type || "").toLowerCase();
        if (formatFilter === "collab" && !dt.includes("collab")) return false;
        // v353: "ugc_video_raw" contains "ugc_video" → raw briefs showed under "UGC edited" too.
        if (formatFilter === "edited" && ((!dt.includes("edited") && !dt.includes("ugc_video")) || dt.includes("raw") || dt.includes("draft") || dt.includes("collab"))) return false;
        if (formatFilter === "raw" && !dt.includes("raw")) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (b.title || "").toLowerCase().includes(q);
        const matchBrand = (b.brand_name || "").toLowerCase().includes(q);
        const matchProduct = (b.product_name || "").toLowerCase().includes(q);
        if (!matchTitle && !matchBrand && !matchProduct) return false;
      }

      return true;
    });

    // Sorting
    if (sortOption === "payout") {
      list.sort((a, b) => (b.budget || 0) - (a.budget || 0));
    } else if (sortOption === "newest") {
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }

    return list;
  }, [briefs, formatFilter, searchQuery, sortOption]);

  // (session 23) A second, token-less claim handler lived here. Unused, and the server rejects
  // claims without the email-OTP sign token — claims go through handleVerifyAndSignMobile only.

  // Same endpoint and body as desktop ManageUGCOrdersView.handleDeclineChanges.
  const handleDeclineChanges = async () => {
    if (!selectedOrder || declining) return;
    if (!declineReason.trim()) {
      toast.error("Please give a reason for declining.");
      return;
    }
    setDeclining(true);
    try {
      await api.post(`/ugc/orders/${selectedOrder.id}/decline-revisions`, { feedback: declineReason.trim() });
      toast.success("Changes declined. The brand has been told.");
      setDeclineOpen(false);
      setDeclineReason("");
      setSelectedOrder((prev) => (prev ? { ...prev, stage: "IN_REVIEW", revisionDeclined: true } : prev));
      await loadData();
    } catch (e) {
      toast.error(e?.response?.data?.error || "Couldn't send that. Please try again."); // v332: no raw error text
    } finally {
      setDeclining(false);
    }
  };

  // Desktop offers "Cancel Claim" only on an unsigned reservation — same here.
  const handleCancelClaim = async () => {
    if (!selectedOrder || cancellingClaim) return;
    if (!(await appConfirm("Cancel this brief reservation? The brief goes back to other creators.", { ok: "Cancel reservation", cancel: "Keep it", danger: true }))) return;
    setCancellingClaim(true);
    try {
      await api.post(`/ugc/orders/${selectedOrder.id}/cancel-claim`);
      toast.success("Brief reservation released.");
      setActiveView("main");
      setSelectedOrder(null);
      await loadData();
    } catch (e) {
      toast.error(e?.response?.data?.error || "Failed to cancel the claim.");
    } finally {
      setCancellingClaim(false);
    }
  };

  const handleSubmitDeliverable = async () => {
    if (!selectedOrder) return;
    if (!videoFile && !videoDriveUrl.trim() && !liveLinkUrl.trim()) {
      toast.error("Please select a video file or paste a drive/cloud link first.");
      return;
    }

    setSubmitting(true);
    toast.loading("Submitting deliverable for brand review...", { id: "ugc-submit" });

    try {
      let finalVideoUrl = videoDriveUrl.trim();

      // Handle direct file upload if selected
      if (videoFile) {
        setUploadProgress(20);
        const fileExt = safeExt(videoFile, "mp4");
        const fileName = `${selectedOrder.id}-${Date.now()}.${fileExt}`;
        const filePath = `ugc-videos/${selectedOrder.id}/${fileName}`;

        try {
          const { data: signedData } = await api.post("/upload/signed-url", {
            bucket: "content-submissions",
            path: filePath,
            contentType: videoFile.type || "video/mp4"
          });

          setUploadProgress(60);
          const { error: uploadError } = await supabase.storage
            .from("content-submissions")
            .uploadToSignedUrl(signedData.path, signedData.token, videoFile);

          if (uploadError) {
            throw new Error(uploadError.message || "Failed to upload video to storage bucket");
          }
          finalVideoUrl = filePath;
        } catch (uploadErr) {
          console.error("Storage upload error:", uploadErr);
          toast.error(uploadErr?.response?.data?.error || "The video didn't upload. Please try again, or paste a Google Drive / Dropbox link.", { id: "ugc-submit" }); // v332: no raw storage error text
          setSubmitting(false);
          setUploadProgress(0);
          return;
        }
      }

      // Validate that at least one valid video URL or live link is present
      if (!finalVideoUrl && !videoDriveUrl.trim() && !liveLinkUrl.trim()) {
        toast.error("Please upload a video file or paste a valid link.", { id: "ugc-submit" });
        setSubmitting(false);
        setUploadProgress(0);
        return;
      }

      setUploadProgress(90);

      // If this is a live link submission for collaboration.
      // Session 58: only once the draft is approved — at the draft stage the video goes for review (the link was
      // sent instead and the uploaded draft thrown away).
      const draftStage = !selectedOrder.draft_approved_at && ["ACCEPTED", "CLAIMED", "IN_PROGRESS", "ACTIVE", "PENDING", "SUBMITTED", "REVISION_REQUESTED", "REVISION_REQ", "REVISION_DECLINED"].includes(String(selectedOrder.status || "").toUpperCase());
      if (liveLinkUrl.trim() && !draftStage) {
        await api.post(`/ugc/orders/${selectedOrder.id}/submit-live-link`, {
          // The server reads link / links / live_link (ugc_routes handleUgcLiveLinkSubmit). The
          // old liveLink / liveLinks keys were ignored, so every mobile submission failed.
          link: liveLinkUrl.trim(),
          links: [liveLinkUrl.trim()],
          live_link: liveLinkUrl.trim()
        });
      } else {
        // Standard video deliverable submit with real url (no mock fallback)
        await api.post(`/ugc/orders/${selectedOrder.id}/submit`, {
          videoUrl: finalVideoUrl || videoDriveUrl.trim(),
          driveUrl: videoDriveUrl.trim() || undefined,
          notes: creatorNotes.trim() || undefined
        });
      }

      setUploadProgress(100);
      toast.success("Deliverable submitted! Brand notified for review.", { id: "ugc-submit" });

      // Refresh orders
      await loadData();

      // Update selected order view state
      setSelectedOrder((prev) => ({
        ...prev,
        stage: "IN_REVIEW",
        status: "SUBMITTED"
      }));

      setVideoFile(null);
      setVideoDriveUrl("");
      setCreatorNotes("");
      setLiveLinkUrl("");
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || "Failed to submit deliverable. Please try again.", {
        id: "ugc-submit"
      });
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
    }
  };

  // =========================================================================
  // VIEW: 03 · PRODUCTION WORKSPACE · UPLOAD
  // =========================================================================
  if (activeView === "workspace" && selectedOrder) {
    const brief = selectedOrder.brief || {};
    const badgeMeta = getDeliverableBadgeMeta(selectedOrder.deliverable_type || brief.deliverable_type);
    const hasVideoInput = Boolean(videoFile || videoDriveUrl.trim() || liveLinkUrl.trim());
    const isCollab = Boolean(selectedOrder.is_collaboration || brief.is_collaboration);
    // v353: the upload box + "Submit" bar showed on orders already in review / completed. Only while filming or fixing.
    const canSubmit = !selectedOrder.isUnsigned && !selectedOrder.linkPhase && (selectedOrder.stage === "IN_PROGRESS" || selectedOrder.stage === "REVISION_REQUESTED");
    const isDelivered = selectedOrder.stage === "IN_REVIEW" || selectedOrder.stage === "COMPLETED";

    // v344: bottom space = sticky bar + iPhone home bar (pb-32 hid the last card under the bar); same on the brief and agreement pages
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[#F2F2F7] flex flex-col font-['DM_Sans',sans-serif] text-[#0A0A0A] pb-[calc(150px+env(safe-area-inset-bottom))]">
        {/* Top App Bar */}
        <div className="bg-white border-b border-[#E5E5EA] sticky top-0 z-30">
          <div className="h-11 px-4 flex items-center gap-3">
            <button
              onClick={() => {
                setActiveView("main");
                setSelectedOrder(null);
              }}
              aria-label="Back" /* v330: icon-only button */
              className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-[#0A0A0A] hover:bg-[#F2F2F7] transition-colors cursor-pointer"
            >
              <ArrowLeft size={19} strokeWidth={2.2} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[14.5px] leading-tight tracking-[-0.3px] text-[#0A0A0A] truncate">
                {selectedOrder.title || "Deliverable Workspace"}
              </div>
              <div className="text-[11px] text-[#6B7280] truncate mt-0.5">
                {selectedOrder.orderNumber} · {selectedOrder.brandName}
              </div>
            </div>

            {/* Chat Action Button */}
            <div className="relative shrink-0">
              <button
                onClick={() => {
                  const targetThreadId = selectedOrder.thread_id || selectedOrder.id;
                  navigate(`/chat/${targetThreadId}`);
                }}
                className="h-[34px] px-3 rounded-[11px] bg-[#F5F0FF] flex items-center gap-1.5 text-[#7C3AED] font-bold text-[12px] hover:bg-[#EDE4FF] transition-colors cursor-pointer"
              >
                <MessageCircle size={14} strokeWidth={2.2} />
                <span>Chat</span>
              </button>
              {Boolean(selectedOrder.unread_count && selectedOrder.unread_count > 0) && (
                <div className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#DC2626] border-2 border-white text-white font-extrabold text-[11px] flex items-center justify-center">
                  {selectedOrder.unread_count > 9 ? "9+" : selectedOrder.unread_count}{/* v332 */}
                </div>
              )}
            </div>
          </div>

          {/* Subheader Bar: Secure payment hold & Signed Date */}
          <div className="px-4 py-2.5 flex items-center justify-between border-t border-[#F1F1F5] bg-[#FAFAFC]">
            <div className="h-7 px-2.5 rounded-[8px] bg-[#ECFDF5] border border-[#A7F3D0]/60 flex items-center gap-1.5 text-[#047857] font-bold text-[11.5px]">
              <Lock size={12} strokeWidth={2.4} />
              <span>{formatCurrency(selectedOrder.payout)} in a secure payment hold</span>
            </div>
            <div className={`text-[11px] font-medium text-right ${selectedOrder.isUnsigned ? "text-[#B45309]" : "text-[#6B7280]"}`}>
              {selectedOrder.isUnsigned ? "Agreement not signed" : "Agreement signed"}
            </div>
          </div>
        </div>

        {/* Workspace Body */}
        <div className="p-4 flex flex-col gap-3">
          {/* 1. Timer & Stepper Card */}
          <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-3.5 shadow-xs">
            {/* v353: a delivered / paid order showed a red "OVERDUE" timer — no timer once the video is in. */}
            {isDelivered ? (
              <div className="rounded-[14px] p-[10px_11px] bg-[#F0FDF4] flex items-center gap-2.5">
                <CheckCircle2 size={20} className="text-[#059669] shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold text-[13.5px] text-[#065F46]">{selectedOrder.stage === "COMPLETED" ? "Delivered · completed" : "Delivered · with the brand"}</div>
                  <div className="text-[11.5px] text-[#047857]">{selectedOrder.stage === "COMPLETED" ? "Your payout shows in Earnings." : "No deadline now. We'll tell you when the brand replies."}</div>
                </div>
              </div>
            ) : (
              <>
                <UGCTimerRing deadline={selectedOrder.deadline} totalHours={orderWindowHours(selectedOrder)} />

                {/* Progress bar line */}
                <div className="mt-3 h-[3px] rounded-[2px] bg-[#F1F1F5] relative overflow-hidden">
                  <div
                    className="absolute left-0 top-0 bottom-0 rounded-[2px] transition-all duration-500"
                    style={{
                      width: `${computeTimeRemaining(selectedOrder.deadline).pct}%`,
                      background: computeTimeRemaining(selectedOrder.deadline).accentColor
                    }}
                  />
                </div>
              </>
            )}

            {/* Status Stepper */}
            <div className="mt-2">
              <UGCStatusStepper stage={selectedOrder.linkPhase ? "LIVE_LINK_SUBMITTED" : selectedOrder.stage} />
            </div>
          </div>

          {/* 2. Revision Notice Card (if Revision Requested) */}
          <RevisionNoticeCard declineOpen={declineOpen} declineReason={declineReason} declining={declining} handleDeclineChanges={handleDeclineChanges} selectedOrder={selectedOrder} setDeclineOpen={setDeclineOpen} setDeclineReason={setDeclineReason} />

          {/* Session 24: the creator declined the changes — waiting on the brand or support. */}
          {selectedOrder.revisionDeclined && (
            <div className="bg-[#FFF1F2] border border-[#FECDD3] rounded-[18px] p-3.5">
              <div className="font-bold text-[13px] text-[#9F1239]">You declined the requested changes</div>
              <div className="mt-1 text-[11.5px] leading-relaxed text-[#9F1239]">
                The brand can approve your last submission or ask support to step in.
              </div>
              <button
                type="button"
                onClick={() => setSupportOpen(true)}
                className="mt-2.5 w-full h-10 rounded-[12px] border border-[#E4E4EC] bg-white text-[#374151] font-bold text-[12px] cursor-pointer"
              >
                🛡 Raise with support
              </button>
            </div>
          )}

          {/* Session 24: unsigned reservation — desktop "Cancel Claim". */}
          {selectedOrder.isUnsigned && (
            <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[18px] p-3.5">
              <div className="font-bold text-[13px] text-[#92400E]">Agreement not signed yet</div>
              <div className="mt-1 text-[11.5px] leading-relaxed text-[#92400E]">
                {/* v344: telling them to sign on desktop left phone-only creators stuck — the brief's own page has the sign step */}
                This brief is reserved for you but the agreement was never signed. Open the brief and sign it there — your timer starts the moment you sign — or release it.
              </div>
              <button
                type="button"
                onClick={handleCancelClaim}
                disabled={cancellingClaim}
                className="mt-2.5 w-full h-10 rounded-[12px] border border-[#E4E4EC] bg-white text-[#374151] font-bold text-[12px] cursor-pointer disabled:opacity-60"
              >
                {cancellingClaim ? "Releasing…" : "Cancel claim"}
              </button>
            </div>
          )}

          {/* Session 25 (rule 51): creator cancels a signed order before the first draft. */}
          {!selectedOrder.isUnsigned && selectedOrder.stage === "IN_PROGRESS" && creatorCancelInfo(selectedOrder).allowed && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowCancelOrder(true)}
                className="text-[12px] font-semibold text-[#B91C1C] underline cursor-pointer bg-transparent border-0"
              >
                Can't do this order? Cancel
              </button>
            </div>
          )}
          <Presence>{showCancelOrder && (
            <CreatorCancelOrderSheet key="creatorcancelordersheet"
              mobile
              order={selectedOrder}
              onClose={() => setShowCancelOrder(false)}
              onCancelled={async () => {
                setShowCancelOrder(false);
                setActiveView("main");
                setSelectedOrder(null);
                await loadData();
              }}
            />
          )}</Presence>

          {/* 3. Brief Specifications Accordion */}
          <BriefSpecsAccordion brief={brief} briefSpecsOpen={briefSpecsOpen} selectedOrder={selectedOrder} setBriefSpecsOpen={setBriefSpecsOpen} />

          {selectedOrder.linkPhase && (
            <UGCLinkPhaseCard
              phase={selectedOrder.linkPhase}
              onOpenChat={() => navigate(`/chat/${selectedOrder.thread_id || selectedOrder.id}`)}
            />
          )}

          {/* 4. Submit Deliverable Section */}
          {canSubmit && <SubmitDeliverableSection creatorNotes={creatorNotes} fileInputRef={fileInputRef} isCollab={isCollab} liveLinkUrl={liveLinkUrl} selectedOrder={selectedOrder} setCreatorNotes={setCreatorNotes} setLiveLinkUrl={setLiveLinkUrl} setVideoDriveUrl={setVideoDriveUrl} setVideoFile={setVideoFile} uploadProgress={uploadProgress} videoDriveUrl={videoDriveUrl} videoFile={videoFile} />}
        </div>

        {supportOpen && (
          <MobileOrderSupportSheet
            fixed
            isBrand={false}
            threadId={selectedOrder.thread_id || selectedOrder.id}
            thread={{
              id: selectedOrder.thread_id || selectedOrder.id,
              deal_id: selectedOrder.id,
              title: selectedOrder.title,
              amount_fixed: selectedOrder.payout,
              brand_id: selectedOrder.brand_id,
              brand_name: selectedOrder.brandName,
              creator_id: selectedOrder.creator_id,
            }}
            onClose={() => setSupportOpen(false)}
          />
        )}

        {/* Sticky Submit Bar at Bottom (Spec 03 / Dev Note 1) — not on an unsigned reservation */}
        {canSubmit && ( /* v353: only while filming / fixing */
        // v332: bottom padding includes the iPhone home-bar area
        <div className="fixed left-0 right-0 bottom-0 bg-white/95 backdrop-blur-md border-t border-[#E5E5EA] px-4 pt-3 pb-[calc(22px+env(safe-area-inset-bottom))] z-40">
          <div className="mb-2 font-medium text-[11px] text-[#6B7280] text-center">
            {hasVideoInput
              ? "Ready to submit · protected by a secure payment hold"
              : "Add a video file or link to submit"}
          </div>

          <button
            onClick={handleSubmitDeliverable}
            disabled={!hasVideoInput || submitting}
            className={`w-full h-[52px] rounded-[15px] flex items-center justify-center gap-2 font-bold text-[15px] transition-all cursor-pointer ${
              hasVideoInput && !submitting
                ? "bg-[#7C3AED] text-white shadow-[0_10px_20px_-10px_rgba(124,58,237,0.9)] active:scale-[0.98]"
                : "bg-[#E9E3F8] text-[#A89BCB] cursor-not-allowed"
            }`}
          >
            {submitting ? (
              <><span className="w-4 h-4 border-2 border-[#A89BCB] border-t-transparent rounded-full animate-spin" aria-hidden="true" /><span>Submitting…</span></>
            ) : (
              <>
                <span>Submit video for brand review</span>
                <ArrowRight size={17} strokeWidth={2.2} />
              </>
            )}
          </button>
        </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW: M01 · BRIEF DETAILS (Step 1 of 2)
  // =========================================================================
  if (activeView === "brief_details" && selectedBrief) {
    const badgeMeta = getDeliverableBadgeMeta(selectedBrief.deliverable_type);
    const brandName = selectedBrief.brand_name || "Brand"; // v332
    const brandLetter = brandName.charAt(0).toUpperCase();
    const budget = Number(selectedBrief.budget) || 0; // no invented ₹5,000
    const briefHours = deliveryHoursOf(selectedBrief.delivery_hours, 24);
    const duration = selectedBrief.video_duration || ""; // v353: no made-up "30–60s" when the brand set none

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[#F2F2F7] flex flex-col font-['DM_Sans',sans-serif] text-[#0A0A0A] pb-[calc(150px+env(safe-area-inset-bottom))]">
        {/* Top Header */}
        <div className="bg-white border-b border-[#E5E5EA] sticky top-0 z-30">
          <div className="h-12 px-4 flex items-center justify-between">
            <button
              onClick={() => {
                setActiveView("main");
                setSelectedBrief(null);
              }}
              aria-label="Back" /* v330: icon-only button */
              className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-[#0A0A0A] hover:bg-[#F2F2F7] transition-colors cursor-pointer"
            >
              <ArrowLeft size={19} strokeWidth={2.2} />
            </button>
            <div className="font-bold text-[15px] tracking-[-0.3px] text-[#0A0A0A]">
              Brief details
            </div>
            <span className="text-[11px] font-semibold text-[#6B7280]">Step 1 of 2</span>
          </div>
        </div>

        {/* Content Body */}
        <BriefDetailBody badgeMeta={badgeMeta} brandName={brandName} briefHours={briefHours} budget={budget} duration={duration} formatCurrency={formatCurrency} selectedBrief={selectedBrief} />

        {/* Sticky Bottom Bar for M01 */}
        <BriefStickyBar briefHours={briefHours} budget={budget} formatCurrency={formatCurrency} kycStatus={kycStatus} navigate={navigate} setActiveView={setActiveView} setSelectedBrief={setSelectedBrief} />
      </div>
    );
  }

  // =========================================================================
  // VIEW: M02 · SIGN AGREEMENT (Step 2 of 2)
  // =========================================================================
  if (activeView === "agreement" && selectedBrief) {
    const brandName = selectedBrief.brand_name || "Brand"; // v332
    const budget = Number(selectedBrief.budget) || 0; // no invented ₹5,000
    const briefHours = deliveryHoursOf(selectedBrief.delivery_hours, 24);
    const agreementV1 = buildUgcAgreement(selectedBrief);
    const fullOtpCode = otpDigits.join("");
    const isFormValid = agreedTerms && agreedDeadline && fullOtpCode.length === 6;

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[#F2F2F7] flex flex-col font-['DM_Sans',sans-serif] text-[#0A0A0A] pb-[calc(150px+env(safe-area-inset-bottom))]">
        {/* Top Header */}
        <div className="bg-white border-b border-[#E5E5EA] sticky top-0 z-30">
          <div className="h-12 px-4 flex items-center justify-between">
            <button
              onClick={() => setActiveView("brief_details")}
              aria-label="Back" /* v330: icon-only button */
              className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-[#0A0A0A] hover:bg-[#F2F2F7] transition-colors cursor-pointer"
            >
              <ArrowLeft size={19} strokeWidth={2.2} />
            </button>
            <div className="font-bold text-[15px] tracking-[-0.3px] text-[#0A0A0A]">
              Sign agreement
            </div>
            <span className="text-[11px] font-bold text-[#7C3AED]">Step 2 of 2</span>
          </div>

          {/* Full purple progress line */}
          <div className="w-full h-[2.5px] bg-[#7C3AED]" />
        </div>

        {/* Content Body */}
        <div className="p-4 flex flex-col gap-3.5">
          {/* Subtitle card */}
          <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-3.5 shadow-xs">
            <div className="font-bold text-[14px] text-[#0A0A0A] truncate">
              {selectedBrief.title}
            </div>
            <div className="text-[11px] text-[#6B7280] mt-0.5">
              Brand: <strong>{brandName}</strong>
            </div>
          </div>

          <div ref={agreementRef} className="flex flex-col gap-3.5">
          <AgreementTermsPanel agreement={agreementV1} compact pdfName="ybex-ugc-agreement.pdf" pdfSubtitle={`${selectedBrief.title || "UGC brief"} · ${brandName}`} />
          </div>
          <GoodToKnowCard />

          {/* 2 Agreement Checkboxes */}
          <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-3.5 shadow-xs space-y-2.5">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreedTerms}
                onChange={(e) => setAgreedTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-[#7C3AED] focus:ring-[#7C3AED] cursor-pointer"
              />
              <span className="text-[11.5px] text-[#374151] leading-tight font-medium">
                I agree to the creator agreement and brief requirements.
              </span>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreedDeadline}
                onChange={(e) => setAgreedDeadline(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-[#7C3AED] focus:ring-[#7C3AED] cursor-pointer"
              />
              <span className="text-[11.5px] text-[#374151] leading-tight font-medium">
                I understand missing the {briefHours}h deadline cancels this order.
              </span>
            </label>
          </div>

          {/* Sign with OTP Box */}
          <SignWithOtpBox handleDigitChange={handleDigitChange} handleKeyDown={handleKeyDown} handleSendMobileOTP={handleSendMobileOTP} inputRefs={inputRefs} maskedEmail={maskedEmail} otpDigits={otpDigits} resendCooldown={resendCooldown} sendingOtp={sendingOtp} termsAccepted={termsAccepted} />
        </div>

        {/* Sticky Bottom Bar for M02 */}
        <div className="fixed left-0 right-0 bottom-0 bg-white/95 backdrop-blur-md border-t border-[#E5E5EA] px-4 pt-[10px] pb-[calc(20px+env(safe-area-inset-bottom))] z-40">{/* v332: iPhone home-bar space */}
          <div className="flex items-center gap-2.5">
            {/* Secondary button on Left per AGENTS_md */}
            <button
              type="button"
              onClick={() => setActiveView("brief_details")}
              className="h-[48px] px-4 rounded-[14px] bg-[#F2F2F7] text-[#4B5563] font-bold text-[13.5px] cursor-pointer hover:bg-[#E5E5EA] transition-colors"
            >
              Back
            </button>

            {/* Primary button on Right per AGENTS_md */}
            <button
              type="button"
              onClick={handleVerifyAndSignMobile}
              disabled={signingOrder || !isFormValid}
              className="flex-1 h-[48px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-[14px] flex items-center justify-center gap-2 shadow-[0_10px_20px_-10px_rgba(124,58,237,0.9)] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {signingOrder ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>Verify OTP & sign</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: 01 · EXPLORE UGC & 02 · MANAGE ORDERS
  // =========================================================================
  return (
    <div className="w-full min-h-screen bg-[#F2F2F7] flex flex-col font-['DM_Sans',sans-serif] text-[#0A0A0A] pb-24">
      {/* Top Header Section */}
      <UgcTopHeader activeTab={activeTab} formatFilter={formatFilter} manageFilter={manageFilter} mappedOrders={mappedOrders} orderCounts={orderCounts} searchQuery={searchQuery} setActiveTab={setActiveTab} setFormatFilter={setFormatFilter} setManageFilter={setManageFilter} setSearchParams={setSearchParams} setSearchQuery={setSearchQuery} setShowSortSheet={setShowSortSheet} />

      {/* Main List Container */}
      <div className="flex-1 px-4 pt-3.5 flex flex-col gap-[11px]">
        {/* ======================= TAB: EXPLORE UGC ======================= */}
        {activeTab === "explore" && (
          <>
            {loading ? (
              <UGCCardsListSkeleton count={4} />
            ) : filteredBriefs.length === 0 ? (
              <OfflineAware when={loadFailed.briefs} onRetry={() => loadData()}>{/* v334: offline → OfflineState */}
              <div className="py-16 text-center bg-white rounded-[18px] border border-[#E2E8F0] p-6">
                <div className="w-12 h-12 rounded-full bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center mx-auto mb-3">
                  <Film size={22} />
                </div>
                {/* v330: a failed load / no briefs at all no longer says "matching search" */}
                {loadFailed.briefs ? (
                  <>
                    <div className="font-bold text-[15px] text-[#0A0A0A]">Couldn't load briefs</div>
                    <div className="text-[12px] text-[#6B7280] mt-1 max-w-xs mx-auto">Check your connection and try again.</div>
                    <button type="button" onClick={() => loadData()} className="mt-4 h-10 px-4 rounded-[12px] bg-[#7C3AED] text-white font-bold text-[13px] cursor-pointer">Try again</button>
                  </>
                ) : !searchQuery.trim() && formatFilter === "all" ? (
                  <>
                    <div className="font-bold text-[15px] text-[#0A0A0A]">No open briefs right now</div>
                    <div className="text-[12px] text-[#6B7280] mt-1 max-w-xs mx-auto">New brand briefs show up here as soon as they go live.</div>
                  </>
                ) : (
                  <>
                <div className="font-bold text-[15px] text-[#0A0A0A]">No briefs matching search</div>
                <div className="text-[12px] text-[#6B7280] mt-1 max-w-xs mx-auto">
                  Try switching filters or search terms to discover active brand UGC campaigns.
                </div>
                  </>
                )}
              </div>
              </OfflineAware>
            ) : (
              filteredBriefs.map((b) => {
                const badgeMeta = getDeliverableBadgeMeta(b.deliverable_type);
                const brandName = b.brand_name || "Brand"; // v332
                // v283 (Ravi): "24h delivery" itself is the new feature — NEW sits on every delivery chip.
                const isNew = true;

                return (
                  <div
                    key={b.id}
                    className="bg-white border border-[#E2E8F0] rounded-[18px] p-[13px] shadow-xs flex flex-col"
                  >
                    {/* Brand Row + NEW tag */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <BrandLogo src={b.brand_logo || b.brand?.logo} name={brandName} size={34} radius={11} testId="ugc-brief-logo" />
                        <div className="min-w-0 flex items-center gap-1.5">
                          <span className="font-semibold text-[12.5px] text-[#0A0A0A] truncate">
                            {brandName}
                          </span>
                          <div className="w-3 h-3 rounded-full bg-[#059669] flex items-center justify-center text-white shrink-0">
                            <Check size={7} strokeWidth={3} />
                          </div>
                        </div>
                      </div>

                      {b.is_priority ? (
                        <div className="h-[18px] px-2 rounded-[9px] bg-amber-100 text-amber-800 border border-amber-300 flex items-center font-bold text-[11px] tracking-tight shrink-0">
                          Urgent · relisted
                        </div>
                      ) : null}
                    </div>

                    {/* Brief Title & Description */}
                    <div className="mt-2.5 font-semibold text-[15px] leading-[1.3] tracking-[-0.3px] text-[#0A0A0A]">
                      {b.title}
                    </div>
                    {(b.product_description || b.detailed_requirements) && ( /* v353: no filler line when the brand wrote none */
                    <div className="mt-1.5 font-normal text-[12px] leading-[1.5] text-[#6B7280] line-clamp-2">
                      {b.product_description || b.detailed_requirements}
                    </div>
                    )}

                    {/* Pills Row below description matching reference: [Coloured box: Format only] [Duration] [⚡ 24h delivery] */}
                    <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                      {/* 1. Coloured box with video format only - NO emoji or icon! */}
                      <span
                        className="px-2.5 py-1 rounded-[7px] font-semibold text-[10px] whitespace-nowrap border"
                        style={{
                          background: badgeMeta.bg,
                          color: badgeMeta.color,
                          borderColor: badgeMeta.border
                        }}
                      >
                        {badgeMeta.cleanLabel || badgeMeta.label}
                      </span>

                      {/* 2. Duration */}
                      {b.video_duration && ( /* v353: hidden when the brand set no duration (was a made-up "30–60s") */
                      <span className="px-2.5 py-1 rounded-[7px] font-semibold text-[10px] bg-[#F3F4F6] text-[#374151] border border-[#E5E5EA] whitespace-nowrap">
                        {b.video_duration}
                      </span>
                      )}

                      {/* 3. 24h delivery */}
                      {/* Session 43 (Ravi): the small shining "NEW" sits on the delivery chip now. */}
                      <span className="relative px-2.5 py-1 rounded-[7px] font-medium text-[10px] bg-[#F3F4F6] text-[#374151] border border-[#E5E5EA] inline-flex items-center gap-1 whitespace-nowrap">
                        <Zap size={10} className="text-gray-500 fill-gray-500" />
                        <span>{deliveryHoursOf(b.delivery_hours, 24)}h delivery</span>
                        {isNew && (
                          <span className="ybex-shine absolute -top-[7px] -right-[6px] h-[13px] px-[5px] rounded-full bg-gradient-to-r from-[#F59E0B] to-[#EC4899] text-white text-[7.5px] font-extrabold tracking-[0.4px] leading-[13px] shadow-sm" data-testid="ugc-new-badge">
                            <span className="relative z-[2]">NEW</span>
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Divider */}
                    <div className="mt-3 h-[1px] bg-[#EEF1F5]" />

                    {/* Payout & escrow row */}
                    <div className="mt-3 flex items-end justify-between gap-2.5">
                      <div className="min-w-0">
                        <div className="font-bold text-[19px] leading-none tracking-[-0.5px] text-[#059669]">
                          {formatCurrency(b.budget)}
                        </div>
                        <div className="mt-1 font-normal text-[10.5px] text-[#6B7280]">
                          Guaranteed in secure payment hold
                        </div>
                      </div>
                    </div>

                    {/* Action Button: View brief & claim -> (Step 1 of 2: M01 Brief Details) */}
                    <button
                      onClick={() => {
                        setSelectedBrief(b);
                        setActiveView("brief_details");
                      }}
                      className="mt-3 h-[48px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] flex items-center justify-center gap-2 shadow-[0_10px_20px_-12px_rgba(124,58,237,0.95)] active:scale-[0.98] transition-all cursor-pointer"
                    >
                      <span className="font-semibold text-[14px] text-white">View brief &amp; claim</span>
                      <ArrowRight size={15} strokeWidth={2.2} className="text-white" />
                    </button>
                  </div>
                );
              })
            )}
          </>
        )}

        {/* ======================= TAB: MANAGE UGC ORDERS ======================= */}
        {activeTab === "manage" && (
          <>
            {loading ? (
              <UGCOrderListSkeleton count={3} />
            ) : filteredOrders.length === 0 && loadFailed.orders ? (
              /* v330: failed load ≠ "No orders" */
              <OfflineAware onRetry={() => loadData()}>{/* v334: offline → OfflineState */}
              <div className="py-16 text-center bg-white rounded-[18px] border border-[#E2E8F0] p-6">
                <div className="font-bold text-[15px] text-[#0A0A0A]">Couldn't load your orders</div>
                <div className="text-[12px] text-[#6B7280] mt-1 max-w-xs mx-auto">Check your connection and try again.</div>
                <button type="button" onClick={() => loadData()} className="mt-4 h-10 px-4 rounded-[12px] bg-[#7C3AED] text-white font-bold text-[13px] cursor-pointer">Try again</button>
              </div>
              </OfflineAware>
            ) : filteredOrders.length === 0 ? (
              <div className="py-16 text-center bg-white rounded-[18px] border border-[#E2E8F0] p-6">
                <div className="w-12 h-12 rounded-full bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center mx-auto mb-3">
                  <Film size={22} />
                </div>
                <div className="font-bold text-[15px] text-[#0A0A0A]">No orders in this tab</div>
                <div className="text-[12px] text-[#6B7280] mt-1 max-w-xs mx-auto">
                  Claim active briefs from the Explore tab to start earning with fast 24h delivery!
                </div>
                <button
                  onClick={() => setActiveTab("explore")}
                  className="mt-4 h-10 px-4 rounded-[12px] bg-[#7C3AED] text-white font-bold text-[13px] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Explore open briefs</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            ) : (
              filteredOrders.map((order) => {
                const isJustClaimed = order.id === justClaimedOrderId;

                if (order.linkPhase) {
                  return (
                    <div key={order.id} className="bg-white border border-[#E2E8F0] rounded-[18px] p-[13px] shadow-xs flex flex-col gap-3">
                      <div className="flex items-center gap-[11px]">
                        <BrandLogo src={order.brandLogo} name={order.brandName} size={40} radius={12} />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[14px] leading-[1.15] text-[#0A0A0A] truncate">{order.title}</div>
                          <div className="mt-1 font-normal text-[11px] text-[#6B7280] truncate">{order.brandName} · {order.orderNumber}</div>
                        </div>
                        <div className="font-bold text-[15px] tracking-[-0.3px] text-[#0A0A0A] shrink-0">{formatCurrency(order.payout)}</div>
                      </div>
                      <UGCLinkPhaseCard phase={order.linkPhase} onOpenChat={() => navigate(`/chat/${order.thread_id || order.id}`)} />
                    </div>
                  );
                }

                // Card A: In Production / Filming (Spec 02)
                if (order.stage === "IN_PROGRESS") {
                  return (
                    <div
                      key={order.id}
                      className={`bg-white rounded-[18px] p-[13px] flex flex-col transition-all ${
                        isJustClaimed
                          ? "border-[2px] border-[#7C3AED] shadow-[0_10px_25px_-10px_rgba(124,58,237,0.45)]"
                          : "border-[1.5px] border-[#FDE2B8] shadow-[0_16px_34px_-30px_rgba(180,83,9,0.9)]"
                      }`}
                    >
                      {isJustClaimed && (
                        <div className="mb-2 flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-[#7C3AED] text-white">
                            JUST CLAIMED
                          </span>
                          <span className="text-[10px] text-[#7C3AED] font-bold">
                            {orderWindowHours(order)}h Timer Active
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-[11px]">
                        <BrandLogo src={order.brandLogo} name={order.brandName} size={40} radius={12} />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[14px] leading-[1.15] text-[#0A0A0A] truncate">
                            {order.title}
                          </div>
                          <div className="mt-1 font-normal text-[11px] text-[#6B7280] truncate">{/* v330 */}
                            {order.brandName} · {order.orderNumber}
                          </div>
                        </div>
                        <div className="font-bold text-[15px] tracking-[-0.3px] text-[#0A0A0A] shrink-0">
                          {formatCurrency(order.payout)}
                        </div>
                      </div>

                      {/* Timer box */}
                      <div className="mt-3">
                        <UGCTimerRing deadline={order.deadline} totalHours={orderWindowHours(order)} />
                      </div>

                      {/* Upload deliverable button — v414: unsigned orders can't upload, so this asks them to sign */}
                      <button
                        onClick={() => {
                          if (order.isUnsigned) { setSigningReservation(order); return; } // v414
                          setSelectedOrder(order);
                          setActiveView("workspace");
                        }}
                        className="mt-3 h-[46px] rounded-[13px] bg-[#7C3AED] flex items-center justify-center gap-2 shadow-[0_10px_20px_-12px_rgba(124,58,237,0.95)] active:scale-[0.98] transition-all cursor-pointer"
                      >
                        {order.isUnsigned ? <Lock size={15} strokeWidth={2.2} className="text-white" /> : <Upload size={15} strokeWidth={2.2} className="text-white" />}
                        <span className="font-semibold text-[13.5px] text-white">
                          {order.isUnsigned ? "Sign agreement" : "Upload video deliverable"}
                        </span>
                      </button>
                    </div>
                  );
                }

                // Card B: Revision Requested by Brand (Spec 02)
                if (order.stage === "REVISION_REQUESTED") {
                  return (
                    <div
                      key={order.id}
                      className="bg-white border-[1.5px] border-[#FCA5A5] rounded-[18px] p-[13px] shadow-xs flex flex-col"
                    >
                      <div className="flex items-center gap-[11px]">
                        <BrandLogo src={order.brandLogo} name={order.brandName} size={40} radius={12} />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[14px] leading-[1.15] text-[#0A0A0A] truncate">
                            {order.title}
                          </div>
                          <div className="mt-1 font-normal text-[11px] text-[#6B7280] truncate">{/* v330 */}
                            {order.brandName} · {order.orderNumber}
                          </div>
                        </div>
                        <div className="font-bold text-[15px] tracking-[-0.3px] text-[#0A0A0A] shrink-0">
                          {formatCurrency(order.payout)}
                        </div>
                      </div>

                      {/* Brand revision quote box */}
                      {order.revisionNotes ? (
                        <div className="mt-2.5 flex items-start gap-2 p-[11px_12px] rounded-[13px] bg-[#FEF2F2]">
                          <AlertTriangle size={15} strokeWidth={2.1} className="text-[#DC2626] shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-[12px] text-[#B91C1C]">
                              Revision requested by brand
                            </div>
                            <div className="mt-1 font-normal text-[11px] leading-[1.45] text-[#991B1B]">
                              “{order.revisionNotes}”
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {/* Revision Timer Box */}
                      <div className="mt-2.5">
                        <UGCTimerRing deadline={order.deadline} totalHours={orderWindowHours(order)} />
                      </div>

                      {/* Re-upload revision button */}
                      <button
                        onClick={() => {
                          setSelectedOrder(order);
                          setActiveView("workspace");
                        }}
                        className="mt-2.5 h-[44px] rounded-[13px] bg-[#7C3AED] flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
                      >
                        <span className="font-semibold text-[13px] text-white">Re-upload revision</span>
                        <span className="h-[20px] px-2 rounded-[7px] bg-white/20 flex items-center font-semibold text-[10.5px] text-white">
                          {order.revisionsLeft} revision{order.revisionsLeft === 1 ? "" : "s"} left
                        </span>
                      </button>
                    </div>
                  );
                }

                // Card C: In Review / Delivered (Brand Review)
                if (order.stage === "IN_REVIEW") {
                  return (
                    <div
                      key={order.id}
                      role="button" tabIndex={0} /* v330: keyboard / screen-reader reachable */
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedOrder(order); setActiveView("workspace"); } }}
                      onClick={() => {
                        setSelectedOrder(order);
                        setActiveView("workspace");
                      }}
                      className="bg-white border border-[#E2E8F0] rounded-[18px] p-[13px] shadow-xs flex flex-col cursor-pointer hover:border-[#7C3AED] transition-colors"
                    >
                      <div className="flex items-center gap-[11px]">
                        <BrandLogo src={order.brandLogo} name={order.brandName} size={40} radius={12} />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[14px] leading-[1.15] text-[#0A0A0A] truncate">
                            {order.title}
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="h-[20px] px-2 rounded-[6px] bg-[#EEF2FF] flex items-center gap-1 text-[#4F46E5] font-semibold text-[10px]">
                              <Clock size={10} strokeWidth={2.4} />
                              <span>Brand review in progress</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="font-bold text-[15px] tracking-[-0.3px] text-[#0A0A0A]">
                            {formatCurrency(order.payout)}
                          </div>
                          <ChevronRight size={16} className="text-[#C4C4CC]" />
                        </div>
                      </div>
                    </div>
                  );
                }

                // Card D: Completed & Payment Cleared (Spec 02)
                return (
                  <div
                    key={order.id}
                    role="button" tabIndex={0} /* v330: keyboard / screen-reader reachable */
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedOrder(order); setActiveView("workspace"); } }}
                    onClick={() => {
                      setSelectedOrder(order);
                      setActiveView("workspace");
                    }}
                    className="bg-white border border-[#E2E8F0] rounded-[18px] p-[13px] flex items-center gap-[11px] shadow-xs cursor-pointer hover:border-[#059669] transition-colors"
                  >
                    <BrandLogo src={order.brandLogo} name={order.brandName} size={40} radius={12} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[14px] leading-[1.15] text-[#0A0A0A] truncate">
                        {order.title}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 min-w-0">{/* v330: long UTR truncates instead of pushing the amount off-screen */}
                        <div className="h-[20px] px-2 rounded-[6px] bg-[#ECFDF5] flex items-center gap-1 text-[#059669] font-semibold text-[10px] shrink-0 whitespace-nowrap">
                          <Check size={10} strokeWidth={3} />
                          {/* Session 58 (bug hunt): "cleared / disbursed" only once the payout really went to the bank (UTR). */}
                          <span>{order.realUtr ? "Paid to bank" : "Approved"}</span>
                        </div>
                        {order.realUtr ? (
                          <span className="font-mono font-medium text-[10px] text-[#059669] bg-[#ECFDF5] px-1.5 py-0.5 rounded truncate min-w-0">
                            UTR: {order.realUtr}
                          </span>
                        ) : (
                          <span className="font-normal text-[10px] text-[#6B7280] truncate min-w-0">
                            Payout next — see Earnings
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="font-bold text-[15px] tracking-[-0.3px] text-[#059669]">
                        {formatCurrency(order.payout)}
                      </div>
                      <ChevronRight size={16} className="text-[#C4C4CC]" />
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      {/* Sort Sheet Modal */}
      <SortSheet setShowSortSheet={setShowSortSheet} setSortOption={setSortOption} showSortSheet={showSortSheet} sortOption={sortOption} />

      {/* v414: sign an unsigned reservation (OTP + /ugc/orders/:id/sign), same modal as the desktop workspace */}
      {signingReservation && (
        <UGCContractModal
          brief={signingReservation.brief || { title: signingReservation.title, budget: signingReservation.payout }}
          orderId={signingReservation.id}
          threadId={signingReservation.thread_id}
          onClose={() => setSigningReservation(null)}
          onSigned={() => {
            setSigningReservation(null);
            loadData({ silent: true }); // the modal shows its own "signed" toast
          }}
        />
      )}
    </div>
  );
}
