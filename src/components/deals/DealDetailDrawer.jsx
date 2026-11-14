import React, { useState, useEffect, useRef } from "react";
import { safeArray } from "../../utils/safeFormat";
import { motion } from "framer-motion";
import { revealChildren, backdropMotion, drawerMotion } from "../../lib/motion";
import { X, Check, AlertTriangle, Clock, MessageSquare, Upload, Globe, ChevronRight, Lock, Play, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import SlaAgreementOtpModal from "./SlaAgreementOtpModal";
import VideoEmbedPreview from "../shared/VideoEmbedPreview";
import AgencyBadge from "../common/AgencyBadge";
import BrandLogo from "../common/BrandLogo";
import { mediaHref } from "../../lib/mediaUrl";
import { EstimateValue } from "../../components/common/AudienceEstimate";
import { useAuth } from "../../contexts/AuthContext"; // v415: brand wording
import useScrollLock from "../../lib/useScrollLock";

// v415: short readable deal code (the drawer printed the full UUID)
export function shortDealCode(id) {
  const s = String(id || "").replace(/[^a-zA-Z0-9]/g, "");
  return s ? s.slice(0, 8).toUpperCase() : "";
}

export default function DealDetailDrawer({ deal, onClose, onSign, onSubmitDeliverable }) {
  const navigate = useNavigate();
  const { user } = useAuth() || {};
  const isBrand = user?.role === "brand"; // v415: the drawer only had creator wording
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signatureText, setSignatureText] = useState("");
  
  // Deliverable Submission State
  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  useScrollLock(Boolean(deal)); // v415: page behind stays still
  useEffect(() => {
    if (!deal || showOtpModal) return undefined; // the OTP popup handles its own keys
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); }; // v415: Escape closes
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deal, onClose, showOtpModal]);

  const timelineRef = useRef(null);

  useEffect(() => {
    if (!deal) return;
    
    // Reset inputs when switching deals
    setSignatureText("");
    setFile(null);
    setVideoUrl("");
    setNotes("");

    // Session 37: timeline rows fade in one after another (shared motion, GSAP removed)
    return revealChildren(timelineRef.current?.querySelectorAll(".timeline-item"), { x: 12, y: 0 });
  }, [deal]);

  if (!deal) return null;

  // v332: "₹" with no number when payout was missing, and raw stage codes ("IN PROGRESS", "REVISION REQUESTED_").
  const payoutText = Number(deal.payout) > 0 ? `₹${Number(deal.payout).toLocaleString("en-IN")}` : "—";
  const stageLabel = String(deal.stage || "").replace(/_/g, " ").toLowerCase().replace(/^./, (m) => m.toUpperCase());
  const deliverablesText = Array.isArray(deal.deliverables)
    ? deal.deliverables.map((d) => (typeof d === "string" ? d : d?.label || d?.type || "")).filter(Boolean).join(", ")
    : deal.deliverables;

  // Handle Drag & Drop
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  // Sign Action
  const handleExecuteSign = async () => {
    if (!signatureText.trim()) {
      toast.error("Please enter your full name to sign the agreement.");
      return;
    }
    // A typed name is not a signature on its own any more: signing needs the email OTP, so this
    // opens the OTP step (session 21). It used to sign straight away with no verification.
    setShowOtpModal(true);
  };

  // Submit Action
  const handleExecuteSubmit = async () => {
    const isCollab = deal.deliverableType === 'collaboration_reel' || 
                     deal.type === 'collaboration_reel' || 
                     deal.raw?.deliverable_type === 'collaboration_reel' ||
                     deal.raw?.brief?.deliverable_type === 'collaboration_reel';

    if (isCollab) {
      if (!videoUrl.trim()) {
        toast.error("Please paste your live Collaboration Reel URL.");
        return;
      }
      const lower = videoUrl.trim().toLowerCase();
      if (!lower.includes("instagram.com") && !lower.includes("youtube.com") && !lower.includes("youtu.be")) {
        toast.error("Please paste a valid Instagram or YouTube live video link.");
        return;
      }
    } else {
      // UGC Video Raw or Edited -> Google Drive Link Required
      if (!videoUrl.trim()) {
        toast.error("Please paste your Google Drive deliverable link.");
        return;
      }
      const lower = videoUrl.trim().toLowerCase();
      if (!lower.includes("drive.google.com")) {
        toast.error("Please paste a valid Google Drive link (e.g. https://drive.google.com/...)");
        return;
      }
    }

    setSubmitting(true);
    try {
      await onSubmitDeliverable(deal.id, file, videoUrl, notes, deal.type);
      setFile(null);
      setVideoUrl("");
      setNotes("");
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate timeline states
  // v414: real signature / payment state (deal.raw = /collabs item, deal.raw.raw = the deals row)
  const rawRow = { ...(deal.raw?.raw || {}), ...(deal.raw || {}) };
  const statusUpper = String(deal.status || rawRow.status || "").toUpperCase();
  const bothSigned = Boolean(rawRow.agreement_signed_creator && rawRow.agreement_signed_brand);
  // v416 (QA U4): the deals list also knows a deal is paid from its chat thread / held payment (deal.isFunded),
  // and a thread flow_state escrow_funded / status ESCROW_HELD counts — a funded deal said "Payment needed".
  const isFunded = Boolean(
    deal.isFunded === true ||
    rawRow.escrow_hold === true || rawRow.payment_funded === true ||
    ((rawRow.escrow_hold_at || rawRow.escrow_held_at || rawRow.escrow_funded_at) && rawRow.escrow_hold !== false) ||
    ["ESCROW_FUNDED", "ESCROW_HELD", "FUNDED", "PAYMENT_FUNDED"].includes(String(rawRow.flow_state || "").toUpperCase()) ||
    String(rawRow.status || "").toUpperCase() === "ESCROW_HELD"
  );
  const isComp = deal.stage === "COMPLETED";
  const isInRev = deal.stage === "IN_REVIEW";
  const isApprovedDraft = isInRev && statusUpper === "CONTENT_APPROVED"; // v414: own text, not "pending review"
  const isProofSubmitted = isInRev && statusUpper === "PROOF_SUBMITTED"; // v414
  const isAwaitingSig = !bothSigned && !isComp && !isInRev; // v414: was hard-coded false
  const isNegotiating = statusUpper === "NEGOTIATING"; // v416 (M16): price still being agreed — not "in production"
  const isProdStage = !isNegotiating && (deal.stage === "IN_PROGRESS" || deal.stage === "REVISION_REQUESTED");
  // v414: submit form only when both signed, brand has paid and the deal is really in production
  const canSubmit = isProdStage && bothSigned && isFunded &&
    ["ACTIVE", "IN_PROGRESS", "REVISION_REQUESTED", "REVISION_REQ", "CHANGES_REQUESTED"].includes(statusUpper);
  const isInProd = canSubmit;
  const waitingForPayment = isProdStage && bothSigned && !isFunded; // v414
  const payoutUtr = rawRow.utr_number || rawRow.payout_utr || rawRow.payout_reference || null; // v414: "paid" only with a UTR
  const chatTargetId = deal.raw?.thread_id || deal.thread_id || deal.raw?.id || deal.id || deal.brandUserId || deal.raw?.brand_id || deal.raw?.brand_user_id || "brand";

  const isRevision = deal.status === "REVISION_REQUESTED" || deal.status === "REVISION_REQ" || deal.raw?.creator_status === "REVISION_REQUESTED" || deal.raw?.creator_status === "REVISION_REQ" || deal.stage === "REVISION_REQUESTED";

  const steps = isBrand ? [
    // v415: brand-side steps (plain words, no "SLA" / "Milestone Funds Release")
    { label: "Application accepted", desc: "You accepted the creator for this campaign.", completed: true },
    { label: "Agreement signed", desc: "You and the creator both sign the agreement in chat.", completed: !isAwaitingSig, active: isAwaitingSig },
    { label: "Content in production", desc: "The creator makes the content from your brief.", completed: isInRev || isComp, active: isProdStage && !isAwaitingSig },
    { label: "Your review", desc: "Approve the content or ask for changes in chat.", completed: isComp, active: isInRev },
    { label: "Creator payout", desc: payoutUtr ? "The creator has been paid." : "After you approve, Ybex pays the creator in 1–2 working days.", completed: isComp, active: isComp }
  ] : [
    { label: "Sponsorship Offer Accepted", desc: "You accepted the brand's campaign offer.", completed: true },
    { label: "SLA / Electronic Agreement Signature", desc: "Electronically sign terms to begin production.", completed: !isAwaitingSig, active: isAwaitingSig },
    { label: "Content Production & Shooting", desc: "Shoot and upload premium content according to brief.", completed: isInRev || isComp, active: isProdStage && !isAwaitingSig },
    { label: "Brand Editorial Quality Review", desc: "Brand evaluates content for compliance & quality.", completed: isComp, active: isInRev },
    { label: "Milestone Funds Release", desc: payoutUtr ? "Paid to your bank." : "After approval, payout goes to your bank in 1–2 working days." /* v414: no wallet/balance */, completed: isComp, active: isComp }
  ];

  return (
    <>
      {/* Backdrop */}
      <motion.div
        {...backdropMotion}
        onClick={onClose}
        className="fixed inset-0 bg-black/30 backdrop-blur-xs z-50"
      />

      {/* Drawer Panel */}
      <motion.div
        {...drawerMotion}
        role="dialog"
        aria-modal="true"
        aria-label={deal.title || "Deal details"} /* v415 */
        style={{ paddingTop: "var(--yb-sat, 0px)" }} /* Session 43: below the purple clock strip */
              className="fixed top-0 right-0 h-full w-full max-w-xl bg-[#F2F2F7] shadow-2xl z-50 flex flex-col overflow-hidden"
      >
        {/* Drawer Header */}
        <div className="bg-white border-b border-gray-100 p-6 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            {/* v330: BrandLogo falls back to the letter when the logo URL is broken */}
            <BrandLogo src={deal.brandLogo} name={deal.brandName} size={40} radius={12} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-black text-gray-800 tracking-tight leading-tight break-words min-w-0">{deal.brandName}</h2>
                {(deal.is_agency || deal.raw?.is_agency || deal.raw?.brand_profiles?.is_agency) && (
                  <AgencyBadge size="xs" />
                )}
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                  deal.type === "ugc_order" ? "bg-[#F5F0FF] text-[#7C3AED]" : "bg-[#F5F0FF] text-[#7C3AED]"
                }`}>
                  {deal.type === "ugc_order" ? "UGC" : "Campaign"}
                </span>
              </div>
              {shortDealCode(deal.id) && <p className="text-[11px] text-gray-500 font-medium tracking-tight mt-1 truncate">Deal #{shortDealCode(deal.id)}</p>}{/* v415: 8-letter code, not the full UUID */}
            </div>
          </div>

          <button 
            type="button"
            aria-label="Close" /* v330 */
            onClick={onClose} 
            autoFocus
            className="w-10 h-10 flex items-center justify-center shrink-0 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-full transition-colors cursor-pointer" /* v415: 40px tap target */
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6" style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }} /* v330: last card clear of the iPhone home bar */>
          {/* Main Card with Deal info */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 tracking-tight">{deal.title}</h3>
            {isBrand ? (
              <p className="text-xs text-gray-500 font-medium tracking-tight mt-1">With: {deal.brandName}</p>
            ) : deal.subtitle ? (
              <p className="text-xs text-gray-500 font-medium tracking-tight mt-1">{deal.subtitle}</p>
            ) : null}

            <div className="flex items-center justify-between border-t border-gray-100 mt-4 pt-4">
              <div>
                <span className="text-[11px] text-gray-500 font-bold uppercase tracking-widest block">{isBrand ? "Deal amount" : "Payout"}</span>
                <span className="text-xl font-bold font-mono text-[#027A48]">{payoutText}</span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-gray-500 font-bold uppercase tracking-widest block">Status</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-1 ${
                  deal.stage === "AWAITING_SIGNATURE" ? "bg-amber-50 text-amber-600 border border-amber-200" :
                  deal.stage === "IN_PROGRESS" ? "bg-[#F5F0FF] text-[#7C3AED] border border-[#DDD6FE]" :
                  deal.stage === "REVISION_REQUESTED" ? "bg-rose-50 text-rose-500 border border-rose-200" :
                  deal.stage === "IN_REVIEW" ? "bg-blue-50 text-[#7C3AED] border border-blue-200" :
                  "bg-emerald-50 text-emerald-600 border border-emerald-200"
                }`}>
                  {stageLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Timeline Section */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">{isBrand ? "Progress" : "Milestone Tracker"}</h4>
            
            <div ref={timelineRef} className="relative pl-6 border-l border-gray-100 space-y-6">
              {steps.map((step, idx) => (
                <div key={idx} className="timeline-item relative">
                  {/* Indicator Dot */}
                  <div className={`absolute -left-[31px] w-[11px] h-[11px] rounded-full border-2 -translate-y-1/2 top-3 transition-colors duration-300 ${
                    step.completed ? "bg-[var(--violet)] border-[var(--violet)]" : 
                    step.active ? "bg-white border-[var(--violet)] ring-4 ring-[var(--violet)]/15" : "bg-white border-gray-200"
                  }`} />

                  <div>
                    <h5 className={`text-xs font-bold leading-none ${step.completed || step.active ? "text-gray-800" : "text-gray-500"}`}>
                      {step.label}
                    </h5>
                    <p className="text-[10px] text-gray-500 mt-1 font-medium tracking-tight leading-relaxed">
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Deliverables detail card */}
          {(deliverablesText || deal.dos?.length > 0) && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
              <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">Creative Requirements</h4>
              
              {deliverablesText && (
                <div>
                  <span className="text-[11px] text-gray-500 font-bold uppercase tracking-widest block mb-1">Detailed Requirements</span>
                  <p className="text-xs text-gray-600 font-medium leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-100 shadow-inner">
                    {deliverablesText}
                  </p>
                </div>
              )}

              {deal.sampleUrl && (
                <div>
                  <span className="text-[11px] text-gray-500 font-bold uppercase tracking-widest block mb-1">Reference Sample URL</span>
                  <a 
                    href={deal.sampleUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="inline-flex text-xs text-[var(--violet)] hover:underline font-bold items-center gap-1.5"
                  >
                    <Globe size={13} /> View Reference Sample <ChevronRight size={12} />
                  </a>
                </div>
              )}

              {/* Must Do / Must Not Do */}
              {deal.dos && deal.dos.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                  <div>
                    <span className="text-[11px] text-emerald-600 font-bold uppercase tracking-widest block mb-2">Must Do</span>
                    <ul className="text-[11px] text-gray-600 font-medium space-y-1.5">
                      { safeArray(deal.dos).map((d, i) => (
                        <li key={i} className="flex items-start gap-1.5 leading-relaxed">
                          <Check size={12} className="text-emerald-500 shrink-0 mt-0.5 stroke-[3]" />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {deal.donts && deal.donts.length > 0 && (
                    <div>
                      <span className="text-[11px] text-rose-500 font-bold uppercase tracking-widest block mb-2">Must Not Do</span>
                      <ul className="text-[11px] text-gray-600 font-medium space-y-1.5">
                        { safeArray(deal.donts).map((d, i) => (
                          <li key={i} className="flex items-start gap-1.5 leading-relaxed">
                            <X size={12} className="text-rose-400 shrink-0 mt-0.5 stroke-[3]" />
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Interactive forms depending on state */}
          {isAwaitingSig && (
            <div id="sla-signature-box" className="bg-gradient-to-br from-[#7C3AED]/10 via-amber-500/5 to-[#7C3AED]/10 rounded-2xl p-6 border border-[var(--violet)]/20 shadow-sm space-y-4 relative overflow-hidden transition-all duration-300">
              <div className="flex items-center gap-2 border-b border-gray-200/60 pb-3">
                <ShieldCheck size={18} className="text-[var(--violet)]" />
                <h4 className="text-xs font-black text-gray-900 tracking-wide uppercase">{isBrand ? "Agreement needed" : "SLA Agreement Required"}</h4>
              </div>

              {/* v414: signing happens in the deal chat (same OTP + sign flow), so send the user there */}
              <p className="text-xs text-gray-600 font-medium leading-relaxed">
                {isBrand ? "Sign the agreement in chat. You and the creator both need to sign before work starts." : "Sign the agreement in chat. Both you and the brand need to sign before work starts."}
              </p>

              <button 
                onClick={() => { onClose(); navigate(`/chat/${chatTargetId}`); }} 
                className="w-full bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-bold py-3.5 px-4 rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md shadow-[var(--violet)]/20 cursor-pointer active:scale-98"
              >
                <Lock size={14} /> Sign the agreement in chat
              </button>
            </div>
          )}

          {/* v414: signed but brand hasn't paid yet — no submit form */}
          {waitingForPayment && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-2">
              <div className="flex items-center gap-2 text-amber-600">
                <Clock size={16} />
                <h4 className="text-xs font-black uppercase tracking-wide">{isBrand ? "Payment needed" : "Waiting for brand payment"}</h4>
              </div>
              <p className="text-xs text-gray-500 font-medium leading-relaxed">
                {isBrand
                  ? "Complete the payment in the deal chat so the creator can start. Ybex holds the money until you approve the work."
                  : "You can submit your content once the brand pays. Ybex holds the money safely until the work is approved."}
              </p>
            </div>
          )}

          {/* v415: a brand never sees the creator's upload form */}
          {isBrand && isInProd && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-2">
              <div className="flex items-center gap-2 text-[var(--violet)]">
                <Clock size={16} />
                <h4 className="text-xs font-black uppercase tracking-wide">{isRevision ? "Changes in progress" : "Content in production"}</h4>
              </div>
              <p className="text-xs text-gray-500 font-medium leading-relaxed">
                {isRevision ? "The creator is updating the content with your feedback." : "The creator is working on your content. You'll be notified when it's ready to review."}
              </p>
            </div>
          )}

          {/* Submission portal for Progress or Revision Requested */}
          {!isBrand && isInProd && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h4 className="text-xs font-black text-gray-800 uppercase tracking-wide">Submit Deliverables</h4>
                {isRevision && (
                  <span className="bg-rose-50 text-rose-500 font-bold text-[11px] px-2 py-0.5 rounded border border-rose-100 uppercase tracking-wider animate-pulse flex items-center gap-1">
                    <AlertTriangle size={11} /> Revision Active
                  </span>
                )}
              </div>

              {isRevision && deal.raw?.revision_note && (
                <div className="bg-rose-50/50 border border-rose-100 p-4 rounded-xl">
                  <span className="text-[11px] text-rose-500 font-bold uppercase tracking-widest block mb-1">Brand Feedback Note</span>
                  <p className="text-xs text-gray-700 font-medium leading-relaxed italic">
                    &ldquo;{deal.raw.revision_note}&rdquo;
                  </p>
                </div>
              )}

              {/* Link Input tailored to format */}
              {(() => {
                const isCollab = deal.deliverableType === 'collaboration_reel' || 
                                 deal.type === 'collaboration_reel' || 
                                 deal.raw?.deliverable_type === 'collaboration_reel' ||
                                 deal.raw?.brief?.deliverable_type === 'collaboration_reel';

                if (isCollab) {
                  return (
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                        Live Collaboration Reel URL <span className="text-rose-500">*</span>
                      </label>
                      <input 
                        type="url" 
                        value={videoUrl} 
                        onChange={(e) => setVideoUrl(e.target.value)} 
                        placeholder="https://www.instagram.com/reel/... or https://youtube.com/shorts/..." 
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base sm:text-xs text-gray-800 outline-none focus:border-[var(--violet)] focus:bg-white transition-all font-mono" /* v332: 16px on phones (no iOS zoom) */
                      />
                      <p className="text-[10px] text-gray-500">
                        ⚡ Payment is released after the brand approves your live link.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                      Google Drive Link <span className="text-rose-500">*</span>
                    </label>
                    <input 
                      type="url" 
                      value={videoUrl} 
                      onChange={(e) => setVideoUrl(e.target.value)} 
                      placeholder="https://drive.google.com/drive/folders/..." 
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base sm:text-xs text-gray-800 outline-none focus:border-[var(--violet)] focus:bg-white transition-all font-mono" /* v332: 16px on phones (no iOS zoom) */
                    />
                    <p className="text-[10px] text-gray-500">
                      📁 Upload your raw/edited video clips to Google Drive and paste the link. Brand reviews before payment release.
                    </p>
                  </div>
                );
              })()}

              {/* Optional submission notes */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest">Production Notes (Optional)</label>
                <textarea 
                  value={notes} 
                  onChange={(e) => setNotes(e.target.value)} 
                  placeholder="Provide production notes, draft concepts, or captions for the brand..." 
                  rows={3}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base sm:text-xs text-gray-800 outline-none focus:border-[var(--violet)] focus:bg-white transition-all font-medium leading-relaxed resize-none"
                />
              </div>

              <button 
                onClick={handleExecuteSubmit} 
                disabled={submitting || (!file && !videoUrl.trim())}
                className="w-full bg-[var(--violet)] hover:bg-[var(--violet-hover)] disabled:bg-gray-100 disabled:text-gray-400 text-white font-bold py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all active:scale-98 shadow-sm flex items-center justify-center gap-2 mt-4 cursor-pointer"
              >
                {submitting ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Upload size={14} /> Submit for Editorial Review
                  </>
                )}
              </button>
            </div>
          )}

          {/* Under Review visual card */}
          {isInRev && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-3 text-blue-500">
                <Clock size={16} />
                <h4 className="text-xs font-black uppercase tracking-wide">
                  {isApprovedDraft ? "Draft approved" : isProofSubmitted ? "Live link under review" : (isBrand ? "Ready for your review" : "Pending Brand Review") /* v414 */}
                </h4>
              </div>
              <p className="text-xs text-gray-500 font-medium leading-relaxed">
                {isBrand
                  ? (isApprovedDraft
                    ? "You approved the draft. The creator will post it and share the live link in chat."
                    : isProofSubmitted
                      ? "The creator shared the live link. Check it in chat and approve it."
                      : "The creator submitted content. Open the chat to approve it or ask for changes.") /* v415 */
                  : isApprovedDraft
                  ? "Draft approved — post it and add the live link in chat."
                  : isProofSubmitted
                    ? "Live link under brand review. You'll get a notification once it's approved."
                    : "Your deliverable is successfully in the review queue. The Brand Editorial Panel reviews content uploads within 24 hours. You'll receive a notification immediately upon status updates!"}
              </p>
              {deal.videoUrl && (
                <div className="pt-2">
                  <span className="text-[11px] text-gray-500 font-bold uppercase tracking-widest block mb-1">Submitted Content</span>
                  <div className="my-2">
                    <VideoEmbedPreview url={deal.videoUrl} title="Submitted Deliverable" />
                  </div>
                  <a 
                    href={mediaHref(deal.videoUrl)} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="inline-flex text-xs text-blue-500 hover:underline font-bold items-center gap-1 mt-1"
                  >
                    <Play size={12} fill="currentColor" /> Open Original Link
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Completed / Paid Status card */}
          {isComp && (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-3 text-emerald-500">
                <Check size={16} className="stroke-[3]" />
                <h4 className="text-xs font-black uppercase tracking-wide">{isBrand ? "Completed" : payoutUtr ? "Paid to bank" : "Approved · payout next" /* v414 */}</h4>
              </div>
              <p className="text-xs text-gray-500 font-medium leading-relaxed">
                {/* v414: no wallet balance wording — money goes to the bank; "paid" only with a UTR */}
                {isBrand
                  ? (payoutUtr
                    ? <>The creator was paid <strong className="text-[#027A48]">{payoutText}</strong> (UTR {payoutUtr}).</>
                    : <>Work approved. Ybex pays the creator <strong className="text-[#027A48]">{payoutText}</strong> in 1–2 working days.</>)
                  : payoutUtr
                  ? <>Payout of <strong className="text-[#027A48]">{payoutText}</strong> was paid to your bank (UTR {payoutUtr}).</>
                  : <>Work approved. Payout of <strong className="text-[#027A48]">{payoutText}</strong> goes to your bank in 1–2 working days.</>}
              </p>
              {deal.videoUrl && (
                <div className="mb-2">
                  <span className="text-[11px] text-gray-500 font-bold uppercase tracking-widest block mb-1">Delivered Asset</span>
                  <a 
                    href={mediaHref(deal.videoUrl)} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="inline-flex text-xs text-emerald-500 hover:underline font-bold items-center gap-1"
                  >
                    <Play size={12} fill="currentColor" /> Play Completed Deliverable
                  </a>
                </div>
              )}

              {/* Dynamic Performance Rank & Metrics */}
              {(deal.performance_score || deal.raw?.performance_score) && (
                <div className="mt-4 pt-4 border-t border-gray-100 bg-[#F5F0FF]/50 p-4 rounded-xl border border-[var(--violet)]/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[var(--violet)] font-black uppercase tracking-wider flex items-center gap-1">
                       Performance Score Card
                    </span>
                    <span className={`text-[11px] font-black px-2 py-0.5 rounded ${
                      (deal.performance_tier || deal.raw?.performance_tier) === "PLATINUM" ? "bg-[#EDE9FE] text-[#6D28D9]" :
                      (deal.performance_tier || deal.raw?.performance_tier) === "GOLD" ? "bg-amber-100 text-amber-700" :
                      (deal.performance_tier || deal.raw?.performance_tier) === "SILVER" ? "bg-slate-100 text-slate-700" :
                      "bg-gray-100 text-gray-500"
                    }`}>
                      {(deal.performance_tier || deal.raw?.performance_tier)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-xs">
                      <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">Score</p>
                      {/* Session 40: an estimate from the creator's own numbers, labelled as one */}
                      <p className="font-mono text-sm font-black text-[var(--violet)]"><EstimateValue creator={deal.creator || deal.raw?.creator || deal.raw || deal} kind="performance" /></p>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-xs">
                      <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">Delivered Reach</p>
                      <p className="font-mono text-sm font-black text-gray-800">{(deal.delivered_reach || deal.raw?.delivered_reach)?.toLocaleString("en-IN") || "—" /* v330 */}</p>
                    </div>
                  </div>

                  <p className="text-[11px] text-gray-500 font-medium text-center italic">
                    Score is calculated based on delivered reach vs promised target, submission speed, and brand partner rating.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drawer Footer Actions */}
        {/* v332: Close on the left, the action on the right (button rule); footer clears the iPhone home bar */}
        <div className="bg-white border-t border-gray-100 p-5 flex gap-3 shadow-md" style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}>
          <button 
            onClick={onClose}
            className="flex-1 bg-gray-100 hover:bg-gray-200/80 text-gray-800 font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer"
          >
            {isBrand ? "Close" : "Close Details"}
          </button>
          <button 
            onClick={() => {
              // v414: when unsigned this also opens the chat, where signing happens
              onClose();
              navigate(`/chat/${chatTargetId}`); // v414: shared target

            }}
            className={`flex-1 font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer ${
              isAwaitingSig 
                ? "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100" 
                : "bg-white hover:bg-gray-50 text-gray-700 border border-gray-200"
            }`}
          >
            {isAwaitingSig ? (
              <>
                <Lock size={14} className="text-amber-500" /> Sign in chat {/* v414 */}
              </>
            ) : (
              <>
                <MessageSquare size={14} className="text-[var(--violet)]" /> {isBrand ? "Open chat" : "View Campaign Chat"}
              </>
            )}
          </button>
        </div>
      </motion.div>

      {/* SLA Agreement & OTP Modal */}
      {showOtpModal && (
        <SlaAgreementOtpModal
          deal={deal}
          onClose={() => setShowOtpModal(false)}
          onSigned={async (id, sig, type, signToken) => {
            if (onSign) {
              await onSign(id, signatureText.trim() ? `${signatureText.trim()} · ${sig}` : sig, type, signToken);
              setSignatureText("");
            }
            setShowOtpModal(false);
          }}
        />
      )}
    </>
  );
}
