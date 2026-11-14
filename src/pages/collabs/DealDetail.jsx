import React, { useEffect, useState } from "react";
import { DetailSkeleton } from "../../components/common/ContentSkeletons";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { sendContractOtp, verifyContractOtp } from "../../lib/contractOtp";
import { useAuth } from "../../contexts/AuthContext";
import { useLoading } from "../../contexts/LoadingContext";
import { toast } from "sonner";
import { calmError } from "../../components/chat/calmError"; // v332
import PayNow from "../../components/payments/PayNow";
import FeeBreakup from "../../components/payments/FeeBreakup";
import PromoCodeInput from "../../components/payments/PromoCodeInput";
import { ArrowLeft, CheckCircle, Clock, Send, ShieldAlert, Check, ArrowRight, MessageSquare, Video, Clipboard } from "lucide-react";
import D3PerformanceVisualizer from "../../components/analytics/D3PerformanceVisualizer";
import { mediaHref } from "../../lib/mediaUrl";

export default function DealDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { startLoading, stopLoading } = useLoading();

  const [deal, setDeal] = useState(null);
  const [signatureText, setSignatureText] = useState("");
  const [signing, setSigning] = useState(false);

  // Draft Submission state
  const [draftVideo, setDraftVideo] = useState("");
  const [draftCaption, setDraftCaption] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [submittingDraft, setSubmittingDraft] = useState(false);

  // Revision state
  const [revisionFeedback, setRevisionFeedback] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState(null);

  // v332: a failed load left the loading skeleton on screen for ever — now it says so with Try again / Back.
  const [loadFailed, setLoadFailed] = useState(false);
  const loadDeal = () => {
    setLoadFailed(false);
    api.get(`/deals/${id}`)
      .then(({ data }) => {
        setDeal(data);
      })
      .catch((err) => {
        console.error(err);
        setLoadFailed(true);
      });
  };

  useEffect(() => {
    loadDeal();
  }, [id]);

  // v416 (QA U19): the page was titled just "Reel" — the deal's chat thread knows the campaign, the creator and
  // whether the money is held (same data the inbox and the deals list use). Optional: the page works without it.
  const [threadInfo, setThreadInfo] = useState(null);
  useEffect(() => {
    let alive = true;
    api.get(`/chat/v2/threads/${encodeURIComponent(id)}`)
      .then(({ data }) => { if (alive && data && typeof data === "object") setThreadInfo(data); })
      .catch(() => {});
    return () => { alive = false; };
  }, [id]);

  // Signing needs the email OTP verified on the server (session 21). This used to sign with a
  // typed name only. Step 1 sends the code; step 2 verifies it and signs with the sign token.
  const [signOtpSent, setSignOtpSent] = useState(false);
  const [signOtp, setSignOtp] = useState("");
  const handleSign = async () => {
    if (!signatureText.trim()) {
      toast.error("Type your full name to sign."); // v416
      return;
    }
    if (!user?.email) {
      toast.error("Your account has no registered email for the signing code.");
      return;
    }
    setSigning(true);
    try {
      if (!signOtpSent) {
        const data = await sendContractOtp(user.email, { dealAmount: deal?.amount || undefined });
        setSignOtpSent(true);
        if (data?.code && String(data?.message || "").startsWith("Test mode")) {
          toast.warning(`${data.message} Test code: ${data.code}`, { duration: 15000 });
        } else {
          toast.success(`Code sent to ${user.email}. Enter it and press Sign again.`);
        }
        return;
      }
      const signToken = await verifyContractOtp(user.email, signOtp);
      await api.post(`/deals/${id}/sign`, { signature: signatureText.trim(), sign_token: signToken });
      toast.success("Agreement signed."); // v416 (QA U32): plain words
      setSignatureText("");
      setSignOtp("");
      setSignOtpSent(false);
      loadDeal();
    } catch (e) {
      toast.error(calmError(e, "Couldn't sign. Check the code and try again.")); // v332: no raw error text
    } finally {
      setSigning(false);
    }
  };

  const handleSubmitDraft = async (e) => {
    e.preventDefault();
    if (!draftVideo.trim()) {
      toast.error("Please include a draft video URL or drive content link");
      return;
    }
    setSubmittingDraft(true);
    try {
      await api.post(`/deals/${id}/submit-draft`, {
        video_url: draftVideo,
        caption: draftCaption,
        notes: draftNotes
      });
      toast.success("Draft sent to the brand for review."); // v416
      setDraftVideo("");
      setDraftCaption("");
      setDraftNotes("");
      loadDeal();
    } catch (err) {
      toast.error(calmError(err, "Couldn't submit the draft. Please try again.")); // v332
    } finally {
      setSubmittingDraft(false);
    }
  };

  // v414: the deal's chat thread (GET by deal id resolves it)
  const chatThreadId = async () => {
    const { data } = await api.get(`/chat/v2/threads/${encodeURIComponent(id)}`);
    if (!data?.id) throw new Error("Chat not found for this deal");
    return data.id;
  };

  const handleApproveDraft = async () => {
    setApproving(true);
    try {
      // v414: approve through the deal chat, so chat stage, card and creator notification stay in sync
      const tid = await chatThreadId();
      await api.post(`/campaign/threads/${encodeURIComponent(tid)}/approve-content`, { notes: "Approved from the deal page" });
      toast.success("Draft approved. The creator has been told to post it."); // v416
      loadDeal();
    } catch (e) {
      toast.error(calmError(e, "Couldn't approve the draft. Please try again.")); // v332: was "Critical: Review system error"
    } finally {
      setApproving(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!revisionFeedback.trim()) {
      toast.error("Write what you'd like the creator to change."); // v416
      return;
    }
    setRejecting(true);
    try {
      const tid = await chatThreadId(); // v414: same flow as the chat (revision count, card, notification)
      await api.post(`/chat/v2/threads/${encodeURIComponent(tid)}/request-revision`, { feedback: revisionFeedback });
      toast.success("Changes requested. The creator has been notified."); // v416 (QA U32)
      setRevisionFeedback("");
      loadDeal();
    } catch (e) {
      toast.error(calmError(e, "Couldn't send the changes request. Please try again.")); // v332
    } finally {
      setRejecting(false);
    }
  };

  if (!deal && loadFailed) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 text-center bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl" role="alert">
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1.5">Couldn't load this deal</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-5">Check your connection and try again. If it keeps happening, the deal may no longer be available to you.</p>
        <div className="flex items-center justify-center gap-2.5">
          <button type="button" onClick={() => navigate(-1)} className="min-h-[40px] px-4 rounded-xl border border-[var(--border-default)] text-sm font-bold text-[var(--text-secondary)] cursor-pointer">Back</button>
          <button type="button" onClick={loadDeal} className="min-h-[40px] px-5 rounded-xl bg-[var(--violet)] text-white text-sm font-bold cursor-pointer">Try again</button>
        </div>
      </div>
    );
  }
  if (!deal) return <DetailSkeleton label="Loading deal" />;

  // v414: deliverables came through as raw JSON text ([{"type":"Reel","count":1}])
  const deliverableLabel = (() => {
    let v = deal.deliverables ?? deal.deliverable;
    if (typeof v === "string") { try { v = JSON.parse(v); } catch { return v.trim() || "Campaign Deliverables"; } }
    if (Array.isArray(v) && v.length) return v.map((d) => typeof d === "string" ? d : `${Number(d?.count) > 1 ? d.count + " × " : ""}${d?.type || d?.name || "Deliverable"}`).join(", ");
    return "Campaign Deliverables";
  })();
  const bothSigned = Boolean(deal.agreement_signed_creator && deal.agreement_signed_brand);
  // v414: after payment the server keeps status ACTIVE and sets escrow_hold / escrow_hold_at — count those as paid too
  const stageUpper = String(deal.stage || "").toUpperCase();
  const statusUpper = String(deal.status || "").toUpperCase();
  const isPastActiveStage = ["CONTENT_SUBMITTED", "CONTENT_APPROVED", "PROOF_SUBMITTED", "COMPLETED"].includes(stageUpper);
  const threadFunded = Boolean(threadInfo && (threadInfo.payment_funded === true ||
    ["ESCROW_FUNDED", "ESCROW_HELD", "FUNDED"].includes(String(threadInfo.flow_state || "").toUpperCase()) ||
    String(threadInfo.status || "").toUpperCase() === "ESCROW_HELD")); // v416 (QA U4): paid deals showed "Pay"
  const isFundedDeal = Boolean(
    deal.escrow_hold === true || deal.payment_funded === true ||
    ((deal.escrow_hold_at || deal.escrow_held_at) && deal.escrow_hold !== false) ||
    isPastActiveStage || threadFunded
  );
  // v416 (QA U19): the same deal amount the deals list shows (agreed first), and a real title
  const dealAmount = Number(deal.agreed_amount || deal.final_amount || deal.proposed_amount || deal.amount || 0);
  const campaignTitle = String(threadInfo?.campaign_title || threadInfo?.campaign?.title || deal.campaign_title || deal.title || "").trim();
  const counterpartName = String((user?.role === "brand" ? (threadInfo?.creator?.name || threadInfo?.creator_name) : (threadInfo?.brand?.company_name || threadInfo?.brand?.name || threadInfo?.brand_name)) || "").trim();
  const pageTitle = campaignTitle && !/^(Campaign Deal|UGC Order)$/i.test(campaignTitle) ? campaignTitle : deliverableLabel;
  // v414: a cancelled / refunded deal falls back to stage ACTIVE on the server — treat it as closed
  const isCancelledDeal = ["CANCELLED", "CANCELED", "REFUNDED"].includes(statusUpper);
  const cancelReason = String(deal.cancel_reason || deal.cancellation_reason || deal.refund_reason || "").trim();
  // v414: Pay only while the deal is signed, not paid, not closed and not past the active stage
  const showPayCard = !isFundedDeal && !isCancelledDeal && !isPastActiveStage &&
    !["FUNDED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "CANCELED", "REFUNDED", "CONTENT_SUBMITTED", "CONTENT_APPROVED", "PROOF_SUBMITTED"].includes(statusUpper);

  const isCreator = user?.role === "creator";
  const isBrand = user?.role === "brand";

  // v416 (QA U19): the same 4 steps as the deals list (was a different 6-step timeline with jargon names)
  const getStageIndex = (stage) => {
    const s = stage?.toUpperCase() || "SIGNING";
    if (s === "SIGNING" || !deal.agreement_signed_creator || !deal.agreement_signed_brand) return -1; // before step 1
    if (s === "CONTENT_SUBMITTED") return 1;
    if (s === "CONTENT_APPROVED" || s === "PROOF_SUBMITTED") return 2;
    if (s === "COMPLETED") return 3;
    return 0;
  };

  const currentStageIdx = getStageIndex(deal.stage);
  const stagesList = ["In Production", "Waiting for Approval", "Approved", "Completed"];
  const stageText = isCancelledDeal ? "Cancelled" : currentStageIdx < 0 ? "Agreement pending" : `Step ${currentStageIdx + 1} of 4 · ${stagesList[currentStageIdx]}`;

  return (
    <div className="w-full max-w-none px-4 sm:px-6 md:px-12 py-8 bg-[var(--bg-base)] text-[var(--text-primary)] select-none">
      
      {/* Upper Navigation Row */}
      <div className="max-w-4xl mx-auto mb-6 flex items-center justify-between">
        <Link to="/deals" className="text-sm text-[var(--text-secondary)] hover:text-[var(--violet)] flex items-center gap-1.5 font-medium transition-colors">
          <ArrowLeft size={14} /> Back to Deals{/* v416 (QA U32) */}
        </Link>
        <Link to={`/chat/${encodeURIComponent(id)}` /* v414: open this deal's chat, not the inbox */} className="text-xs bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated)] px-4 py-2 rounded-xl text-[var(--text-primary)]/85 flex items-center gap-1.5 font-bold transition-all">
          <MessageSquare size={13} className="text-[var(--violet)]" /> Open chat
        </Link>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Workspace Title Card Header */}
        <div className="bg-[var(--bg-card)]/50 border border-[var(--border-default)] rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--violet)] bg-[var(--violet-soft)] border border-[var(--violet-border)] px-2.5 py-1 rounded inline-block mb-3">
              {bothSigned ? "CONTRACT SIGNED" : "CONTRACT PENDING" /* v414: was always "secured" */}
            </span>
            <h1 className="font-display font-black text-2xl sm:text-3xl text-[var(--text-primary)] leading-tight break-words">
              {pageTitle /* v416 (QA U19): campaign name, not just "Reel" */}
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {[pageTitle !== deliverableLabel ? deliverableLabel : null, counterpartName ? `${isBrand ? "with" : "for"} ${counterpartName}` : null].filter(Boolean).join(" · ")}
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-1.5">
              {/* v414: no raw user ids on screen */}
              Deal ID: <span className="font-semibold text-[var(--text-primary)]/85">{String(deal.collab_id || id).slice(0, 8).toUpperCase()}</span>
            </p>
          </div>
          <div className="text-left md:text-right bg-[var(--bg-elevated)] p-4 rounded-2xl border border-[var(--border-default)] shrink-0">
            <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] block">{isFundedDeal && !isCancelledDeal ? "Deal amount · held by Ybex" : "Deal amount" /* v414 */}</span>
            <span className="text-2xl font-black font-display text-[var(--text-primary)] mt-1 block">
              {dealAmount > 0 ? `₹${dealAmount.toLocaleString("en-IN")}` : "—" /* v416 (QA U19): agreed amount, same as the deals list */}
            </span>
            {isBrand && <span className="text-[11px] text-[var(--text-secondary)] block mt-0.5">Fee and GST are shown below</span>}
          </div>
        </div>

        {/* Promo Code & Fee Calculation Breakdown */}
        <div className="bg-[var(--bg-card)]/30 border border-[var(--border-default)] rounded-3xl p-6 space-y-4">
          {/* Session 58: brand promo codes aren't applied at payment yet — the box showed a discount the brand never got. */}
          {/* v414: a creator code only works before the brand pays — hide it after */}
          {user?.role !== 'brand' && !isFundedDeal && !isCancelledDeal /* v414 */ && <PromoCodeInput
            amount={dealAmount || 0}
            role={user?.role || 'creator'}
            onCouponApplied={(coupon) => setAppliedCoupon(coupon)}
            onCouponRemoved={() => setAppliedCoupon(null)}
          />}
          <FeeBreakup
            grossAmount={dealAmount || 0}
            appliedCoupon={appliedCoupon}
            role={user?.role || 'creator'}
            totalLabel={isFundedDeal ? "Total paid (deal + fee)" : "Total you pay (deal + fee)" /* v416 (QA U19) */}
            paid={isFundedDeal ? deal.paid || null : null /* v419: real charged amounts */}
          />
        </div>

        {/* linear Stepper progress tracker widget */}
        <div className="bg-[var(--bg-card)]/20 border border-[var(--border-default)] rounded-2xl p-6">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <span className="text-xs font-bold uppercase text-[var(--text-tertiary)] tracking-wider">Deal progress</span>
            <span className="text-xs font-medium text-[var(--violet)]">{stageText /* v416 */}</span>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            {stagesList?.map((stepName, idx) => {
              const done = idx < currentStageIdx;
              const active = idx === currentStageIdx;
              return (
                <div key={idx} className="relative group text-left">
                  <div className={`h-1 rounded-full ${done ? "bg-emerald-400" : active ? "bg-[var(--violet)]" : "bg-[var(--bg-elevated)]"}`} />
                  <span className={`block text-[10px] mt-2 font-bold leading-tight ${done ? "text-emerald-600" : active ? "text-[var(--violet)]" : "text-[var(--text-tertiary)]"}`}>
                    {idx + 1}. {stepName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* --- D3.JS CAMPAIGN METRICS & AUDIENCE VELOCITY --- */}
        <D3PerformanceVisualizer 
          entityId={id} 
          title={`Performance: ${deliverableLabel}` /* v414 */} 
        />

        {/* v414: one clear card for a cancelled / refunded deal; all actions below are hidden */}
        {isCancelledDeal && (
          <div className="bg-rose-500/5 border border-rose-500/20 rounded-3xl p-6 text-left" role="status">
            <h3 className="text-base font-bold text-[var(--text-primary)]">{statusUpper === "REFUNDED" ? "Deal cancelled · refunded" : "Deal cancelled"}</h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1">
              {cancelReason ? `Reason: ${cancelReason}` : "This deal was cancelled. No more steps are needed here."}
            </p>
          </div>
        )}

        {/* --- STEP 0: CONTRACT AGREEMENT ELECTRONIC SIGNING --- */}
        {!isCancelledDeal /* v414 */ && (!deal.agreement_signed_creator || !deal.agreement_signed_brand) && (
          <div className="bg-amber-500/5 border border-amber-500/15 rounded-3xl p-6 text-left space-y-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="text-amber-400 shrink-0 mt-0.5" size={20} />
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">Agreement not signed yet</h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1 font-normal">
                  {/* v416 (QA U32): plain words (old copy was legal jargon) */}
                  You and the {isBrand ? "creator" : "brand"} both sign the agreement below before work starts. {isFundedDeal ? "The payment is held by Ybex." : "Once the brand pays, Ybex holds the money safely until the work is approved."}
                </p>
              </div>
            </div>

            <div className="bg-[var(--bg-card)]/80 p-4 rounded-xl text-[11px] text-[var(--text-secondary)] max-h-40 overflow-y-auto scroll-thin leading-relaxed space-y-2 border border-[var(--border-default)]">
              <p><strong>1. Deliverable Verification:</strong> The Creator commits to supply {deliverableLabel /* v414 */} conforming to brand brief guidelines.</p>
              <p><strong>2. Payment:</strong> {isFundedDeal ? "The held amount" : "The deal amount" /* v414: not "secured" before payment */} of ₹{dealAmount.toLocaleString("en-IN") /* v416 */} is paid to the creator after the brand approves the work.</p>
              <p><strong>3. Exclusivity Guidelines:</strong> Creator agrees to refrain from active rival business mentions for 7 clear delivery days following publication launch.</p>
            </div>

            <div className="pt-2 flex items-center gap-4 flex-wrap text-xs">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border-default)] font-bold">
                {deal.agreement_signed_brand ? <Check className="text-emerald-600" size={13} /> : <Clock className="text-amber-400" size={13} />}
                <span>Brand: {deal.agreement_signed_brand ? "Signed" : "Not signed yet"}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border-default)] font-bold">
                {deal.agreement_signed_creator ? <Check className="text-emerald-600" size={13} /> : <Clock className="text-amber-400" size={13} />}
                <span>Creator: {deal.agreement_signed_creator ? "Signed" : "Not signed yet"}</span>
              </div>
            </div>

            {/* Electronic signature typing box */}
            {((isCreator && !deal.agreement_signed_creator) || (isBrand && !deal.agreement_signed_brand)) && (
              <div className="pt-2 flex gap-3 max-w-md">
                <input 
                  type="text" 
                  value={signatureText} 
                  onChange={(e) => setSignatureText(e.target.value)} 
                  className="flex-grow bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-4 py-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--violet)] text-xs font-bold leading-normal" 
                  placeholder="Your full name"
                />
                {signOtpSent && (
                  <input
                    type="text"
                    inputMode="numeric"
                    value={signOtp}
                    onChange={(e) => setSignOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-28 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-3 py-2.5 text-center font-mono text-xs font-bold focus:outline-none focus:border-[var(--violet)]"
                    placeholder="Email code"
                  />
                )}
                <button 
                  onClick={handleSign} 
                  disabled={signing}
                  className="bg-[var(--violet)] hover:bg-[#6D3FFF] px-6 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-md shrink-0 cursor-pointer disabled:opacity-60" /* v332: dark text on violet in light mode */
                >
                  {signing ? "Please wait…" : signOtpSent ? "Verify & sign" : "Send code"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* --- STEP 0.5: ESCROW FUNDING (Brand Payment) --- */}
        {isBrand && deal.agreement_signed_creator && deal.agreement_signed_brand && showPayCard /* v414: hidden once paid, cancelled or past active */ && (
          <div className="my-6">
            <PayNow dealId={deal.id} creatorId={deal.creator_id} grossAmount={Number(deal.agreed_amount || deal.final_amount || deal.amount || deal.proposed_amount || 0)} /* Session 58: the AGREED amount, not the first proposal */ />
          </div>
        )}

        {/* --- STEP 1: ACTIVE STAGE SUBMIT DRAFT (Creator) or WAITING SUBMISSION (Brand) --- */}
        {!isCancelledDeal /* v414 */ && deal.agreement_signed_creator && deal.agreement_signed_brand && (deal.stage?.toUpperCase() === "ACTIVE" || deal.stage?.toUpperCase() === "NEGOTIATING") && (
          <div className="bg-[var(--bg-card)]/30 border border-[var(--border-default)] rounded-3xl p-6 sm:p-8 text-left space-y-4">
            <h3 className="text-lg font-display font-extrabold text-[var(--text-primary)] flex items-center gap-2">
              <Video size={18} className="text-[var(--violet)]" /> {isBrand ? "Waiting for the draft" : "Submit your draft"}
            </h3>
            
            {isCreator ? (
              <form onSubmit={handleSubmitDraft} className="space-y-4 max-w-2xl">
                <p className="text-xs text-[var(--text-secondary)]">Upload video preview drafts (YouTube live previews, Loom links, Drive, or Dropbox file storage) to receive brand draft approval.</p>
                
                {deal.feedback && (
                  <div className="bg-rose-500/10 border border-rose-500/25 p-4 rounded-xl text-xs text-rose-300">
                    <strong>Previous Brand Change Request Feedback:</strong>
                    <p className="mt-1 font-normal italic">&ldquo;{deal.feedback}&rdquo;</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1.5">Draft Link URL</label>
                    <input 
                      type="url" 
                      value={draftVideo} 
                      onChange={(e) => setDraftVideo(e.target.value)} 
                      name="draft_video_url"
                      className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-[var(--violet)]" 
                      placeholder="e.g. https://drive.google.com/..."
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1.5">Draft Caption Copy Proposal</label>
                    <input 
                      type="text" 
                      value={draftCaption} 
                      onChange={(e) => setDraftCaption(e.target.value)} 
                      name="draft_caption"
                      className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-4 py-3 text-xs focus:outline-none" 
                      placeholder="Enter captions, hashtags copy, mentions description"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1.5">Notes to reviewers</label>
                  <textarea 
                    rows={3} 
                    value={draftNotes} 
                    onChange={(e) => setDraftNotes(e.target.value)} 
                    className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-4 py-3 text-xs focus:outline-none filter-none"
                    placeholder="Provide notes or styling highlights..."
                  />
                </div>

                <button 
                  type="submit" 
                  disabled={submittingDraft}
                  className="bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white text-xs font-extrabold px-6 py-3 rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Send size={14} /> {submittingDraft ? "Sending…" : "Send draft"}
                </button>
              </form>
            ) : (
              <div className="text-center py-6 text-[var(--text-tertiary)]">
                <Clock size={28} className="mx-auto mb-2 text-[var(--text-tertiary)]" />
                <p className="text-xs font-semibold">The creator is making the content. You'll be notified when the draft is ready to review.</p>{/* v416 (QA U32): plain words */}
                <p className="text-[11px] text-[var(--text-tertiary)] mt-1 font-normal">{isFundedDeal ? "Your payment is held by Ybex until you approve the work." : "Once you pay, Ybex holds the money safely until you approve the work." /* v416 */}</p>
              </div>
            )}
          </div>
        )}

        {/* --- STEP 2: CONTENT REVIEW AND FEEDBACK DISPATCH PANEL (Brand) --- */}
        {!isCancelledDeal /* v414 */ && deal.stage?.toUpperCase() === "CONTENT_SUBMITTED" && (
          <div className="bg-[var(--bg-card)]/30 border border-[var(--border-default)] rounded-3xl p-6 sm:p-8 text-left space-y-4">
            <h3 className="text-lg font-display font-extrabold text-[var(--text-primary)] flex items-center gap-2">
              <Clipboard size={18} className="text-[var(--violet)]" /> Draft ready for review
            </h3>

            {deal.submission && (
              <div className="bg-[var(--bg-card)]/80 p-5 rounded-2xl border border-[var(--border-default)] space-y-3">
                <div>
                  <span className="text-[10px] font-bold text-[var(--violet)] uppercase block tracking-wider">Draft link</span>
                  <a 
                    href={mediaHref(deal.submission.video_url)} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-xs text-[var(--text-primary)] underline font-semibold flex items-center gap-1.5 mt-1 hover:text-[var(--violet)] transition-colors"
                  >
                    <span className="break-all">{deal.submission.video_url}</span> &rarr; Open
                  </a>
                </div>
                {deal.submission.caption && (
                  <div>
                    <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase block tracking-wider">Caption</span>
                    <p className="text-xs text-[var(--text-primary)]/90 mt-1 font-normal select-text">&ldquo;{deal.submission.caption}&rdquo;</p>
                  </div>
                )}
                {deal.submission.notes && (
                  <div>
                    <span className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase block tracking-wider">Creator notes</span>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 italic font-normal">&ldquo;{deal.submission.notes}&rdquo;</p>
                  </div>
                )}
              </div>
            )}

            {isBrand ? (
              <div className="pt-2 space-y-4">
                <div className="flex gap-3">
                  <button 
                    onClick={handleApproveDraft} 
                    disabled={approving} 
                    className="bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs px-6 py-3 rounded-xl transition-all shadow-md flex items-center gap-1 cursor-pointer disabled:opacity-60"
                  >
                    <CheckCircle size={14} /> {approving ? "Approving…" : "Approve draft" /* v332: busy label; plain words */}
                  </button>
                </div>
                
                <div className="border-t border-[var(--border-default)] pt-4 max-w-md">
                  <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest block mb-1.5">Ask for changes</span>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={revisionFeedback} 
                      onChange={(e) => setRevisionFeedback(e.target.value)} 
                      className="flex-grow bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-4 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none" 
                      placeholder="e.g. Please trim first 5 seconds of footage..."
                    />
                    <button 
                      onClick={handleRequestChanges} 
                      disabled={rejecting} 
                      className="bg-[var(--violet)]/10 hover:bg-[var(--violet)]/20 text-[var(--text-primary)] border border-[var(--violet)]/20 px-4 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-60"
                    >
                      {rejecting ? "Sending…" : "Request changes" /* v332: busy label */}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-amber-500/5 border border-amber-500/15 p-5 rounded-xl text-center">
                <p className="text-xs text-amber-700 font-bold">Your draft is with the brand</p>{/* v416 */}
                <p className="text-[11px] text-[var(--text-secondary)] mt-1">The brand has been notified. You'll hear back here or in chat.</p>
              </div>
            )}
          </div>
        )}

        {/* --- STEP 3: CONTENT APPROVED - REDIRECT TO LIVE LINK DISPATCH (ADD COLLAB) --- */}
        {!isCancelledDeal /* v414 */ && deal.stage?.toUpperCase() === "CONTENT_APPROVED" && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-6 sm:p-8 text-center space-y-4">
            <h3 className="text-lg font-display font-black text-emerald-600">Draft approved</h3>
            <p className="text-xs text-[var(--text-primary)]/80 max-w-lg mx-auto leading-relaxed">
              {isCreator ? "Post the approved content on Instagram, then add the live link below." : "The creator will post the content and share the live link."}{/* v416 (QA U32): the brand saw "Your video draft looks stunning" */}
            </p>
            
            <div className="pt-2">
              {isCreator ? (
                <button 
                  onClick={() => navigate(`/deals/${id}/add-collab`)} 
                  className="bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-extrabold text-xs px-8 py-4 rounded-xl transition-all shadow-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                   Paste Live Instagram Post Link <ArrowRight size={13} />
                </button>
              ) : (
                <div className="text-xs text-[var(--text-secondary)]">
                  We've asked the creator to post it. You'll see the live link here once it's added.
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- STEP 4: PROOF SUBMITTED / COMPLETED - MATCH METRICS REAL-TIME (UPLOADED COLLAB) --- */}
        {!isCancelledDeal /* v414 */ && (deal.stage?.toUpperCase() === "PROOF_SUBMITTED" || deal.stage?.toUpperCase() === "COMPLETED") && (
          <div className="bg-[#7C3AED]/10 border border-[#7C3AED]/20 rounded-3xl p-6 sm:p-8 text-center space-y-4">
            <h3 className="text-lg font-display font-black text-[#6D28D9]">{deal.stage?.toUpperCase() === "COMPLETED" ? "Deal completed" : "Live link added"}</h3>
            <p className="text-xs text-[var(--text-primary)]/80 max-w-lg mx-auto leading-relaxed font-normal">
              See the live post and how it is performing.
            </p>
            
            <div className="pt-2">
              <button 
                onClick={() => navigate(`/deals/${id}/uploaded-collab`)} 
                className="bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-extrabold text-xs px-8 py-4 rounded-xl transition-all shadow-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                View live post &amp; performance <ArrowRight size={13} />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
