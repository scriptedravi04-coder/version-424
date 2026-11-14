import React, { useState, useEffect } from "react";
import { retentionLine } from "../../lib/fileRetention";
import { motion } from "framer-motion";
import { Lock, Video, ExternalLink, Info, CheckCircle, Shield, AlertCircle, CreditCard, Loader2, Download } from "lucide-react";
import { api } from "../../lib/api";
import { processRazorpayPayment } from "../../lib/razorpay";
import { toast } from "sonner";
import { isUgcThread } from "../../utils/dealFlow";
import OrderSupportModal from "./OrderSupportModal";
import SysContractPendingCard from "./systemMessage/SysContractPendingCard";
import SysContractSignedCard from "./systemMessage/SysContractSignedCard";
import SysDraftApprovedCard from "./systemMessage/SysDraftApprovedCard";
import SysGenericCard from "./systemMessage/SysGenericCard";
import SysLiveLinksDeclinedBody from "./systemMessage/SysLiveLinksDeclinedBody";
import SysPaymentFundedBrandCard from "./systemMessage/SysPaymentFundedBrandCard";
import SysPaymentFundedCreatorCard from "./systemMessage/SysPaymentFundedCreatorCard";
import SysPayoutSettlementAlert from "./systemMessage/SysPayoutSettlementAlert";
import { calmError } from "./calmError"; // v332
import { istTime } from "./chatTime"; // v332

export default function SystemMessage({ 
  message, 
  isUserBrand, 
  threadId, 
  campaignTitle, 
  onActionComplete, 
  thread,
  isMine,
  onViewContract,
  onNegotiate,
  onSelectUploadTab,
  onViewInvoice,
  onTriggerReview,
  onDownloadInvoice,
  allMessages
}) {
  const [loadingAction, setLoadingAction] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentStep, setPaymentStep] = useState("");
  const [showResubmitInput, setShowResubmitInput] = useState(false);
  const [resubmitFeedback, setResubmitFeedback] = useState("");
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [showBrandReRequestForm, setShowBrandReRequestForm] = useState(false);
  const [brandReRequestNotes, setBrandReRequestNotes] = useState("");
  const [alertingAdmin, setAlertingAdmin] = useState(false);
  const [alertSent, setAlertSent] = useState(false);
  const [alertCount, setAlertCount] = useState(message?.metadata?.brand_alert_count || thread?.brand_alert_count || message?.metadata?.payout_alert_count || 0);
  const [platformFeeConfig, setPlatformFeeConfig] = useState(null);
  const [showDeclineInput, setShowDeclineInput] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [showApproveDeclinedConfirm, setShowApproveDeclinedConfirm] = useState(false);

  useEffect(() => {
    api.get('platform/fee-config')
      .then(res => {
        if (res.data) setPlatformFeeConfig(res.data);
      })
      .catch(() => {});
  }, []);

  const content = message.content || message.text || "";
  const type = message.message_type || message.type || message.metadata?.action || "system";
  const metadata = message.metadata || {};
  const isUgcDeal = isUgcThread(thread || { id: threadId, deal_id: thread?.deal_id }) || Boolean(metadata?.is_ugc || message?.metadata?.is_ugc);

  // Stale live-link cards (campaign AND UGC collaboration). Every live-link card kept its buttons
  // forever: after a correction and a resubmission the OLD card still offered "Approve & Pay"
  // and "Ask to Resubmit", and an old correction request still offered "Decline", which
  // overwrote a fresh submission. Only the newest card of its kind, at the step it belongs to,
  // is actionable. UGC collaboration threads use the same flow_state names, so the same rule
  // applies (it used to skip UGC entirely).
  const campaignFlowUpper = String(thread?.flow_state || "").toUpperCase();
  const msgKey = (m) => (m && (m.id || m.message_id)) || null;
  const isLatestOfType = (typeName) => {
    if (!Array.isArray(allMessages) || allMessages.length === 0) return true;
    const same = allMessages.filter((m) => (m.message_type || m.type || m.metadata?.action) === typeName);
    if (same.length === 0) return true;
    return msgKey(same[same.length - 1]) === msgKey(message);
  };
  const campaignStepClosed = (openStates) =>
    Boolean(campaignFlowUpper) && !openStates.includes(campaignFlowUpper);

  const handleBrandAlertAdminPayout = async () => {
    try {
      setAlertingAdmin(true);
      const dealId = thread?.deal_id || thread?.id || threadId;
      const targetThreadId = threadId || thread?.id;
      const res = await api.post(`/campaign/threads/${targetThreadId}/alert-admin-payout`, {
        deal_id: dealId,
        note: isUserBrand 
          ? "Brand requested priority fund release for creator" 
          : "Creator requested priority fund release"
      });
      setAlertSent(true);
      setAlertCount(prev => prev + 1);
      toast.success(res.data?.message || "Ybex support has been asked to speed up this payout." /* v415: no "finance desk" jargon */);
    } catch (err) {
      toast.error(calmError(err, "Couldn't alert the admin. Please try again.")); // v332: no raw error text
    } finally {
      setAlertingAdmin(false);
    }
  };

  const handleEscrowPayment = async (couponCode) => {
    setPaymentLoading(true);
    setPaymentStep("Launching Razorpay Gateway...");
    const grossAmt = thread?.agreed_amount || thread?.amount_fixed || metadata.amount || 5000;
    try {
      await processRazorpayPayment({
        dealId: thread?.deal_id || threadId,
        threadId: thread?.id || threadId,
        campaignId: thread?.campaign_id || null,
        creatorId: thread?.creator_id || null,
        grossAmount: grossAmt,
        couponCode: typeof couponCode === "string" ? couponCode : "", // v364
        onSuccess: async () => {
          await api.post(`/campaign/threads/${threadId}/pay`);
          toast.success("Payment received — it's held safely by Ybex. The creator has been notified." /* v415 */);
          if (onActionComplete) {
            onActionComplete();
          } else {
            window.location.reload();
          }
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
  };

  // 1.5. Payment Triggered / Invoice Processed / Payout Released Notice
  if (
    type === "payment_trigger" || 
    type === "payout_released" || 
    type === "payment_released" || 
    type === "live_links_approved" || 
    metadata?.action === "live_links_approved" || 
    metadata?.action === "payout_released" || 
    metadata?.action === "PAYOUT_RELEASED" || 
    (content && (
      content.includes("Invoice generated and payment has been processed") || 
      content.includes("Deliverables Approved & Payment Released") ||
      content.includes("payout is being processed via Escrow") ||
      content.includes("Payout Released") ||
      content.includes("Payout Disbursed") ||
      content.includes("payout released")
    ))
  ) {
    const amount = Number(metadata.gross_amount || metadata.amount || metadata.agreed_amount || thread?.agreed_amount || thread?.amount_fixed || 5000);
    
    // Authoritative fee percent using single source of truth (platformFeeConfig or tiered fallback: 15% below threshold, 5% above)
    const authoritativeTieredRate = amount < (Number(platformFeeConfig?.threshold_amount) || 20000)
      ? (Number(platformFeeConfig?.below_threshold_rate) || 15) // Session 58: `??` let NaN through ("Platform Fee (NaN%)")
      : (Number(platformFeeConfig?.above_threshold_rate) || 5);

    const feePercentage = metadata.platform_fee_percent !== undefined && metadata.platform_fee_percent !== null && Number(metadata.platform_fee_percent) > 0
      ? Number(metadata.platform_fee_percent)
      : (metadata.gross_amount && metadata.platform_fee_amount && Number(metadata.platform_fee_amount) > 0 
          ? Math.round((Number(metadata.platform_fee_amount) / Number(metadata.gross_amount)) * 100)
          : authoritativeTieredRate);

    // Platform fee amount with exact precision (no integer round-down to 0)
    // Session 58 (bug hunt): approve-live-links saves the fee as `platform_fee` — reading only platform_fee_amount
    // recomputed it from today's settings, so fee + net stopped adding up to the gross.
    const savedFee = Number(metadata.platform_fee_amount) > 0 ? Number(metadata.platform_fee_amount) : Number(metadata.platform_fee) > 0 ? Number(metadata.platform_fee) : 0;
    const platformFee = savedFee > 0
      ? savedFee
      : (metadata.gross_amount && metadata.creator_net_amount && Number(metadata.gross_amount) > Number(metadata.creator_net_amount)
          ? Math.round((Number(metadata.gross_amount) - Number(metadata.creator_net_amount)) * 100) / 100
          : Math.round(((amount * feePercentage) / 100) * 100) / 100);

    // Creator net amount: strictly gross amount minus platform fee
    const netAmount = metadata.creator_net_amount !== undefined && metadata.creator_net_amount !== null && Number(metadata.creator_net_amount) > 0
      ? Number(metadata.creator_net_amount)
      : Math.max(0, Math.round((amount - platformFee) * 100) / 100);

    const formatCurrency = (val) => {
      const num = Number(val) || 0;
      return Number.isInteger(num)
        ? num.toLocaleString('en-IN')
        : num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const timeText = istTime(message.created_at); // v330: IST; v332: no "Invalid Date"
    const campaignName = campaignTitle || "Campaign Partnership";
    
    const utrNumber = thread?.utr_number || metadata.utr_number || metadata.utrNumber || null;
    const payoutStatus = thread?.payout_status || metadata.payout_status || "READY_FOR_RELEASE";
    // Payout is only officially marked as disbursed to the bank once a bank UTR / reference number is generated
    const isPayoutReleased = Boolean(utrNumber);

    // Check if current user has already submitted review
    const hasReviewed = isUserBrand ? thread?.reviewed_by_brand : thread?.reviewed_by_creator;

    return (
      <motion.div 
        initial={{ opacity: 0, y: 12, scale: 0.97 }} 
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className={`w-full flex ${isUserBrand ? 'justify-end' : 'justify-start'} my-1 md:my-5 px-0.5 md:px-3`}
      >
        <div className="w-full max-w-[260px] sm:max-w-[340px] md:max-w-[440px] rounded-lg md:rounded-[24px] bg-white border border-slate-100 shadow-sm md:shadow-xl shadow-slate-200/50 text-left relative overflow-hidden transition-all duration-300 hover:shadow-slate-200">
          {/* Header Colored Ribbon */}
          <div className={`h-1.5 md:h-2.5 w-full bg-gradient-to-r ${
            isPayoutReleased 
              ? "from-emerald-400 via-teal-500 to-emerald-600"
              : "from-emerald-500 via-teal-500 to-[#7C3AED]"
          }`} />
          
          <div className="p-2.5 md:p-5">
            {/* Top Status Meta */}
            <div className="flex justify-between items-center mb-1.5 md:mb-4">
              <span className={`text-[7.5px] md:text-[10px] font-black uppercase tracking-wider px-2 md:px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                isPayoutReleased 
                  ? "text-emerald-700 bg-emerald-50 border-emerald-200/80"
                  : isUserBrand 
                    ? "text-emerald-800 bg-emerald-50 border-emerald-300"
                    : "text-emerald-800 bg-emerald-50 border-emerald-300"
              }`}>
                {isPayoutReleased ? (
                  <>
                    <CheckCircle size={10} className="text-emerald-600 shrink-0" />
                    <span>Payout Disbursed to Bank ✓</span>
                  </>
                ) : isUserBrand ? (
                  <>
                    <CheckCircle size={10} className="text-emerald-600 shrink-0" />
                    <span>Approved by Brand 🚀</span>{/* v414: not "released" before Ybex pays */}
                  </>
                ) : (
                  <>
                    <CheckCircle size={10} className="text-emerald-600 shrink-0" />
                    <span>Approved • Payout in 1–2 Days 💸</span>{/* v414 */}
                  </>
                )}
              </span>
              <span className="text-[7.5px] md:text-[10px] text-slate-500 font-bold font-mono">{timeText}</span>
            </div>

            {/* Concentric Circle Animated Indicator */}
            <div className="flex flex-col items-center text-center my-1.5 md:my-3">
              <div className="relative w-8 h-8 md:w-16 md:h-16 flex items-center justify-center mb-1.5 md:mb-3">
                {isPayoutReleased ? (
                  <>
                    <span className="absolute inset-0 bg-emerald-100/50 rounded-full" />{/* v415: no endless ping on a finished payout card */}
                    <span className="absolute w-7 h-7 md:w-12 md:h-12 bg-emerald-100/80 rounded-full" />
                    <div className="relative w-5 h-5 md:w-9 md:h-9 bg-emerald-500 rounded-full flex items-center justify-center shadow-xs">
                      <CheckCircle size={12} className="text-white md:w-4 md:h-4" />
                    </div>
                  </>
                ) : (
                  <>
                    <span className="absolute inset-0 bg-emerald-100/60 rounded-full" />{/* v415: no endless pulse */}
                    <span className="absolute w-7 h-7 md:w-12 md:h-12 bg-emerald-100/90 rounded-full" />
                    <div className="relative w-5 h-5 md:w-9 md:h-9 bg-emerald-600 rounded-full flex items-center justify-center shadow-xs">
                      <CheckCircle size={12} className="text-white md:w-4 md:h-4" />
                    </div>
                  </>
                )}
              </div>
              
              <h3 className="text-xs md:text-lg font-black text-slate-900 tracking-tight leading-tight mb-1">
                {isPayoutReleased 
                  ? (isUserBrand ? "Creator Payout Processed" : "Payout Disbursed to Creator") 
                  : "Deliverables Approved" /* v414 */}
              </h3>
              
              <p className="text-[11px] md:text-[12px] text-slate-600 font-medium leading-normal mt-0.5 max-w-[240px] md:max-w-[340px] mx-auto">
                {isPayoutReleased ? (
                  isUserBrand ? (
                    <>{/* v415 */}<strong>Ybex</strong> has transferred <strong className="text-[#027A48] font-mono font-bold">₹{formatCurrency(amount)}</strong> for this campaign.</>
                  ) : (
                    <>{/* v415 */}<strong>Ybex</strong> has transferred your payout of <strong className="text-[#027A48] font-mono font-bold">₹{formatCurrency(netAmount)}</strong> to your verified bank account.</>
                  )
                ) : isUserBrand ? (
                  <>{/* v414 */}You approved the deliverables for <strong className="text-slate-900 font-mono font-bold">₹{formatCurrency(amount)}</strong>. Ybex sends the creator's payout in <strong className="text-emerald-700 font-bold">1–2 working days</strong>.</>
                ) : (
                  <>{/* v414 */}Brand has approved your deliverables! Ybex sends <strong className="text-emerald-700 font-mono font-bold">₹{formatCurrency(netAmount)}</strong> to your verified Bank/UPI in <strong className="text-slate-900 font-bold">1–2 working days</strong>.</>
                )}
              </p>
            </div>

            {/* Timeline for Pending Creator Payouts */}
            {!isUserBrand && !isPayoutReleased && (
              <div className="bg-amber-50/80 border border-amber-200/70 rounded-lg p-2.5 my-2">
                <div className="text-[11px] md:text-[10px] font-black uppercase text-amber-900 tracking-wider mb-1.5 flex items-center gap-1">
                  <Shield size={11} className="text-amber-600" />
                  <span>Settlement Timeline</span>
                </div>
                <div className="space-y-1 text-[11px] md:text-[11.5px]">
                  <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                    <CheckCircle size={11} className="text-emerald-600 shrink-0" />
                    <span>1. Brand Approved & Funds Cleared ✓</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-900 font-bold">
                    <div className="w-3 h-3 rounded-full bg-amber-500 text-white flex items-center justify-center text-[7.5px] shrink-0 font-mono">2</div>
                    <span>2. Admin Payout Disbursement (1–2 Days)</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                    <div className="w-3 h-3 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[7.5px] shrink-0 font-mono">3</div>
                    <span>3. Bank Credit & UTR Confirmation</span>
                  </div>
                </div>
              </div>
            )}

            {/* Itemized Deduction Breakdown for Creator ONLY (Hidden from Brand) */}
            {!isUserBrand && (
              <div className="bg-slate-50 rounded-lg p-2 md:p-3.5 my-1.5 md:my-3 border border-slate-100">
                <div className="text-[11px] md:text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1">
                  Financial Breakdown
                </div>
                <div className="space-y-0.5 text-[11px] md:text-xs">
                  <div className="flex justify-between font-medium text-slate-600">
                    <span>Deliverable Rate</span>
                    <span className="font-mono text-slate-900 font-bold">₹{formatCurrency(amount)}</span>
                  </div>
                  <div className="flex justify-between font-medium text-rose-600">
                    <span>{(metadata.platform_fee_percent == null && platformFeeConfig?.fee_kind && platformFeeConfig.fee_kind !== "platform") ? platformFeeConfig.fee_label : "Convenience fee & TDS"} ({feePercentage}%)</span>{/* v330: fee label (Ravi) */}
                    <span className="font-mono font-bold">-₹{formatCurrency(platformFee)}</span>
                  </div>
                  <div className="border-t border-slate-200/80 pt-0.5 flex justify-between font-bold text-slate-900">
                    <span>Net Transfer</span>
                    <span className="font-mono text-[#027A48] text-[10px] md:text-sm">₹{formatCurrency(netAmount)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Amount & Summary Detail Box */}
            <div className="bg-slate-50 rounded-lg p-2.5 md:p-3.5 my-1.5 md:my-3 border border-slate-100">
              <div className="text-[11px] md:text-[10px] font-black uppercase text-slate-500 tracking-wider mb-0.5">
                {isPayoutReleased 
                  ? (isUserBrand ? "Total Campaign Value" : "Successfully Transferred")
                  : isUserBrand 
                    ? "Total Released by Brand" 
                    : "Net Payable Amount (In Clearance)"}
              </div>
              <div className="text-lg md:text-3xl font-mono font-black tracking-tight text-slate-900 flex items-baseline">
                <span className="text-xs md:text-lg mr-0.5 text-slate-500 font-bold">₹</span>
                <span>{formatCurrency(isUserBrand ? amount : netAmount)}</span>
              </div>
              
              <div className="border-t border-slate-200/50 mt-1.5 md:mt-3 pt-1.5 md:pt-3 space-y-1 md:space-y-1.5">
                <div className="flex justify-between text-[11px] md:text-xs font-semibold text-slate-500">
                  <span>Campaign</span>
                  <span className="text-slate-800 font-bold truncate max-w-[120px] md:max-w-[170px]">{campaignName}</span>
                </div>
                <div className="flex justify-between text-[11px] md:text-xs font-semibold text-slate-500">
                  <span>Route</span>
                  <span className="text-slate-800 font-bold truncate max-w-[120px] md:max-w-[180px]">
                    {isPayoutReleased ? "Ybex Bank Direct Transfer" : "Ybex → bank payout (1–2 working days)" /* v415 */}
                  </span>
                </div>
              </div>
            </div>

            {/* Prominent UTR Confirmation — shown big and clear once admin has actually
                disbursed the payout with a bank reference. This is the proof-of-payment the
                creator/brand actually care about, so it should not be a small easy-to-miss row. */}
            {utrNumber && (
              <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg md:rounded-xl p-2.5 md:p-3.5 my-1.5 md:my-3 text-center">
                <div className="text-[11px] md:text-[10px] font-black uppercase text-emerald-700 tracking-wider mb-1 flex items-center justify-center gap-1">
                  <CheckCircle size={11} className="text-emerald-600" />
                  <span>Payment Completed · UTR / Bank Reference</span>
                </div>
                <div className="text-base md:text-xl font-mono font-black tracking-wide text-emerald-800 break-all">
                  {utrNumber}
                </div>
              </div>
            )}

            {/* Session 36: 15-day download window for the delivered files */}
            <p className="text-[10px] md:text-xs text-[var(--text-secondary)] text-center my-1.5 md:my-2" data-testid="payout-retention">
              {retentionLine(isUserBrand ? "brand" : "creator", message?.created_at || null)}
            </p>

            {/* Priority Alert Action Box (Shown when Payment released but Admin hasn't disbursed yet) */}
            <SysPayoutSettlementAlert alertCount={alertCount} alertSent={alertSent} alertingAdmin={alertingAdmin} handleBrandAlertAdminPayout={handleBrandAlertAdminPayout} isPayoutReleased={isPayoutReleased} isUserBrand={isUserBrand} />

            {/* Action buttons inside the large box */}
            <div className="flex flex-col gap-1.5 md:gap-2.5 mt-2 md:mt-3 pt-2 border-t border-slate-100">
              <div className="flex gap-1.5 md:gap-2.5">
                <button
                  onClick={onViewInvoice}
                  className="flex-1 flex items-center justify-center gap-1 px-1.5 md:px-3.5 py-1.5 md:py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-[11px] md:text-xs rounded-md md:rounded-xl transition-all cursor-pointer shadow-xs border border-slate-200 active:scale-98"
                >
                  <CreditCard size={11} className="text-slate-500 md:w-3.5 md:h-3.5" />
                  <span>View Receipt</span>
                </button>
                <button
                  onClick={onDownloadInvoice}
                  className="flex-1 flex items-center justify-center gap-1 px-1.5 md:px-3.5 py-1.5 md:py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-[11px] md:text-xs rounded-md md:rounded-xl transition-all cursor-pointer shadow-xs border border-slate-200 active:scale-98"
                >
                  <Download size={11} className="text-slate-500 md:w-3.5 md:h-3.5" />
                  <span>Download PDF</span>
                </button>
              </div>

              {/* Submit / Submitted Review Button */}
              {hasReviewed ? (
                <button
                  disabled
                  className="w-full flex items-center justify-center gap-1 px-1.5 py-1.5 md:py-2.5 bg-slate-100 border border-slate-200 text-slate-500 font-bold text-[11px] md:text-xs rounded-md md:rounded-xl cursor-not-allowed opacity-50"
                >
                  <CheckCircle size={11} className="text-emerald-500 md:w-3.5 md:h-3.5" />
                  <span>Review Submitted! Thanks ❤️</span>
                </button>
              ) : (
                <button
                  onClick={onTriggerReview}
                  className="w-full flex items-center justify-center gap-1 px-2 py-2 md:py-2.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-extrabold text-[10px] md:text-xs rounded-lg md:rounded-xl transition-all cursor-pointer shadow-xs active:scale-99"
                >
                  <CheckCircle size={12} className="md:w-3.5 md:h-3.5" />
                  <span>Submit Partner Review</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // 1. Contract Signing Event Notice
  if (type === "contract_signing") {
    const brandSigned = metadata.brand_signed || false;
    const creatorSigned = metadata.creator_signed || false;
    const bothSigned = brandSigned && creatorSigned;
    const amount = metadata.amount || metadata.agreed_amount || thread?.agreed_amount || thread?.amount_fixed || 15000;
    const timeText = istTime(message.created_at); // v330: IST; v332: no "Invalid Date"
    const campaignName = campaignTitle || "Campaign Partnership";

    if (bothSigned) {
      return (
        <motion.div 
          initial={{ opacity: 0, y: 12, scale: 0.98 }} 
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className={`w-full flex ${isMine ? 'justify-end' : 'justify-start'} my-2 md:my-5 px-1 md:px-3`}
        >
          <SysContractSignedCard amount={amount} campaignName={campaignName} handleEscrowPayment={handleEscrowPayment} isUserBrand={isUserBrand} paymentLoading={paymentLoading} paymentStep={paymentStep} thread={thread} timeText={timeText} />
        </motion.div>
      );
    } else {
      // Pending other party's signature
      const waitingFor = brandSigned ? "Creator" : "Brand";
      const amIWaiting = isUserBrand ? brandSigned : creatorSigned; // true if current user has signed, waiting for the other

      return (
        <motion.div 
          initial={{ opacity: 0, y: 12, scale: 0.98 }} 
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className={`w-full flex ${isMine ? 'justify-end' : 'justify-start'} my-2 md:my-5 px-1 md:px-3`}
        >
          <SysContractPendingCard amIWaiting={amIWaiting} amount={amount} brandSigned={brandSigned} campaignName={campaignName} creatorSigned={creatorSigned} isUserBrand={isUserBrand} onViewContract={onViewContract} thread={thread} threadId={threadId} timeText={timeText} waitingFor={waitingFor} />
        </motion.div>
      );
    }
  }

  // 2. Payment Escrow Notice (legacy payment_funded breakdown card)
  const isPaymentSecuredStr = (content || "").toLowerCase().includes("payment secured") || (content || "").toLowerCase().includes("held safely in escrow");
  if (type === "payment_funded" || metadata?.action === "escrow_funded" || type === "payment_secured" || metadata?.action === "payment_secured" || isPaymentSecuredStr) {
    const amount = metadata?.amount || 15000;
    const timeText = istTime(message.created_at); // v330: IST; v332: no "Invalid Date"
    const campaignName = campaignTitle || "Campaign Partnership";

    if (isUserBrand) {
      // Brand Side: Payment Sent to Escrow
      return (
        <motion.div 
          initial={{ opacity: 0, y: 12, scale: 0.98 }} 
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="w-full flex justify-end my-2 md:my-5 px-1 md:px-3"
        >
          <SysPaymentFundedBrandCard amount={amount} campaignName={campaignName} timeText={timeText} />
        </motion.div>
      );
    } else {
      // Creator Side: Payment Received
      return (
        <motion.div 
          initial={{ opacity: 0, y: 12, scale: 0.98 }} 
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="w-full flex justify-start my-2 md:my-5 px-1 md:px-3"
        >
          <SysPaymentFundedCreatorCard amount={amount} campaignName={campaignName} onSelectUploadTab={onSelectUploadTab} timeText={timeText} />
        </motion.div>
      );
    }
  }

  // 3. Live Links Submitted Event Notice
  if (type === "live_links_submitted") {
    let rawLinks = metadata?.links || metadata?.link || "";
    if (!rawLinks && typeof content === "string") {
      rawLinks = content.replace("🔗 Live post links submitted by Creator: ", "");
    }
    const linksList = Array.isArray(rawLinks)
      ? rawLinks.map(l => String(l).trim()).filter(Boolean)
      : typeof rawLinks === "string"
      ? rawLinks.split(",").map(l => l.trim()).filter(Boolean)
      : rawLinks ? [String(rawLinks).trim()].filter(Boolean) : [];
    const isCompleted = Boolean(
      thread?.status === "COMPLETED" || 
      thread?.flow_state === "COMPLETED" ||
      thread?.payout_status === "RELEASED" ||
      thread?.payout_status === "PAID" ||
      thread?.isDealCompleted ||
      metadata?.status === "COMPLETED" ||
      metadata?.action === "live_links_approved" ||
      metadata?.action === "payout_released" ||
      (thread?.messages || []).some(m => {
        const t = (m.message_type || m.type || '').toLowerCase();
        const c = (m.content || m.text || '').toLowerCase();
        const act = (m.metadata?.action || '').toLowerCase();
        return t === 'payout_released' || t === 'payment_trigger' || t === 'live_links_approved' || act === 'live_links_approved' || act === 'payout_released' || c.includes('payment released') || c.includes('payout released');
      })
    );

    const handleApprove = async () => {
      setLoadingAction(true);
      try {
        const endpoint = isUgcDeal
          ? `/ugc/threads/${threadId}/mark-complete`
          : `/campaign/threads/${threadId}/approve-live-links`;
        await api.post(endpoint);
        toast.success("Live links approved! Ybex sends the creator's payout in 1–2 working days."); // v414
        if (onActionComplete) {
          onActionComplete();
        } else {
          window.location.reload();
        }
      } catch (err) {
        toast.error(calmError(err, "Couldn't approve the links. Please try again.")); // v332
      } finally {
        setLoadingAction(false);
      }
    };

    const handleConfirmResubmit = async () => {
      if (!resubmitFeedback.trim()) {
        toast.error("Please enter a valid reason.");
        return;
      }
      setLoadingAction(true);
      try {
        const endpoint = isUgcDeal
          ? `/ugc/threads/${threadId}/reject-content`
          : `/campaign/threads/${threadId}/reject-live-links`;
        await api.post(endpoint, { feedback: resubmitFeedback });
        toast.success("Resubmit request sent to creator.");
        setShowResubmitInput(false);
        setResubmitFeedback("");
        if (onActionComplete) {
          onActionComplete();
        } else {
          window.location.reload();
        }
      } catch (err) {
        toast.error(calmError(err, "Couldn't send the resubmission request. Please try again.")); // v332
      } finally {
        setLoadingAction(false);
      }
    };

    return (
      <motion.div 
        initial={{ opacity: 0, y: 12, scale: 0.98 }} 
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className={`w-full flex ${isMine ? 'justify-end' : 'justify-start'} my-2 md:my-5 px-1 md:px-3`}
      >
        <div className="w-full max-w-[270px] sm:max-w-[340px] md:max-w-[440px] p-3 md:p-5 shadow-md md:shadow-xl rounded-xl md:rounded-2xl bg-white border border-[#DDD6FE] text-left relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#7C3AED] to-[#7C3AED] rounded-l-xl md:rounded-l-2xl" />
          
          {/* Header */}
          <div className="flex justify-between items-center mb-2 md:mb-4">
            <span className="text-[11px] md:text-[10px] font-bold uppercase tracking-wider text-[#7C3AED] font-mono bg-[#F5F0FF] border border-[#DDD6FE] px-2 py-0.5 rounded-md">
              Live Links Review 🚀
            </span>
            <span className="text-[11px] md:text-[10px] text-slate-500 font-medium font-mono">
              {istTime(message.created_at) /* v330: IST; v332: no "Invalid Date" */}
            </span>
          </div>

          <h4 className="text-sm font-extrabold text-slate-900 mb-2">
            🔗 Submitted Live Campaign Links:
          </h4>

          {/* Links List */}
          <div className="space-y-2 mb-3">
            {linksList.map((url, i) => (
              <a 
                key={i} 
                href={url.startsWith("http") ? url : `https://${url}`} 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center gap-2 p-2.5 bg-slate-50 hover:bg-[#F5F0FF]/50 border border-slate-100 hover:border-[#DDD6FE] rounded-xl text-xs font-bold text-[#7C3AED] hover:text-[#6D28D9] transition-all truncate"
              >
                <ExternalLink size={14} className="shrink-0 text-indigo-400" />
                <span className="truncate">{url}</span>
              </a>
            ))}
          </div>

          {metadata?.notes && (
            <div className="p-2.5 bg-[#F5F0FF]/50 border border-[#DDD6FE]/60 rounded-xl text-xs text-slate-700 mb-3 text-left">
              <span className="font-bold text-indigo-950">Creator Notes:</span> {metadata.notes}
            </div>
          )}

          <div className="border-t border-slate-100 pt-4 mt-4">
            {isCompleted ? (
              <div className="flex items-center gap-2.5 text-emerald-600 text-xs font-bold bg-emerald-50 border border-emerald-100 rounded-xl p-3.5 shadow-sm">
                <CheckCircle size={16} className="shrink-0" />
                <span>Links approved and payment released successfully! 🎉</span>
              </div>
            ) : (!isLatestOfType("live_links_submitted") || campaignStepClosed(["PROOF_SUBMITTED", "LINKS_UNDER_REVIEW", "LIVE_LINKS_SUBMITTED"])) ? (
              <div className="flex items-center gap-2.5 text-slate-500 text-xs font-bold bg-slate-50 border border-slate-100 rounded-xl p-3.5">
                <AlertCircle size={16} className="shrink-0" />
                <span>
                  {!isLatestOfType("live_links_submitted")
                    ? "A newer link was submitted — review the latest card below."
                    : campaignFlowUpper === "REVISION_REQUESTED_LINKS"
                      ? "Correction requested — waiting for the creator's updated link."
                      : campaignFlowUpper === "REVISION_DECLINED_LINKS"
                        ? "The creator declined the correction — see the latest card below."
                        : "No action needed on this card."}
                </span>
              </div>
            ) : isUserBrand ? (
              showResubmitInput ? (
                <div className="space-y-3 bg-slate-50 border border-slate-100 p-4 rounded-xl">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Feedback / Correction Request:
                  </label>
                  <textarea
                    rows={3}
                    className="w-full bg-white border border-slate-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-xl p-3 text-xs text-slate-800 placeholder-slate-400 font-medium font-sans"
                    value={resubmitFeedback}
                    onChange={(e) => setResubmitFeedback(e.target.value)}
                    placeholder="Tell the creator what needs correction before they resubmit..."
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setShowResubmitInput(false);
                        setResubmitFeedback("");
                      }}
                      className="py-2 px-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmResubmit}
                      disabled={loadingAction}
                      className="py-2 px-4 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      {loadingAction ? <Loader2 size={13} className="animate-spin" /> : null}
                      <span>Send Correction Request</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {showApproveConfirm ? (
                    <div className="space-y-3 bg-emerald-50/50 border border-emerald-100 p-4 rounded-xl">
                      <p className="text-[11px] text-emerald-800 font-bold leading-normal">
                        {/* v414: approved wording — Ybex sends the money later */}
                        ⚠️ Are you sure? Approving completes the deal — Ybex sends the creator's payout{Number(thread?.amount_fixed || thread?.agreed_amount) > 0 ? ` for the ₹${Number(thread?.amount_fixed || thread?.agreed_amount).toLocaleString('en-IN')} deal` : ""} in 1–2 working days. This cannot be undone.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowApproveConfirm(false);
                          }}
                          className="py-2 px-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleApprove}
                          disabled={loadingAction}
                          className="flex-1 py-2 px-4 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          {loadingAction ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                          <span>Confirm & Release Payment</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Primary action on the right, the way every other card on this screen
                          is laid out. The sentence follows the buttons rather than the other
                          way round, so the order you read is the order you see. */}
                      <p className="text-[11px] text-slate-500 font-semibold mb-3 leading-relaxed">
                        Review the live URLs above. If something is wrong, click <strong className="text-slate-700">Ask to Resubmit</strong> to send feedback. If they are correct, click <strong className="text-slate-700">Approve & Pay</strong> to release the secure payout.
                      </p>
                      <div className="flex gap-2.5">
                        <button
                          onClick={() => setShowResubmitInput(true)}
                          className="flex-1 py-3 px-4 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 font-black text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <AlertCircle size={14} />
                          <span>Ask to Resubmit</span>
                        </button>
                        <button
                          onClick={() => setShowApproveConfirm(true)}
                          className="flex-1 py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer hover:shadow-emerald-500/10"
                        >
                          <CheckCircle size={14} />
                          <span>Approve & Pay</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )
            ) : (
              <div className="flex items-center gap-2.5 text-amber-600 text-xs font-bold bg-amber-50 border border-amber-100 rounded-xl p-3.5 shadow-sm">
                <Loader2 size={16} className="animate-spin shrink-0 text-amber-500" />
                <span>Waiting for Brand's Approval... ⏳</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  // 3b. Live Links Resubmission Request Notice
  if (type === "live_links_resubmit_request") {
    const feedback = metadata?.feedback || (typeof content === "string" ? content.replace("❌ Resubmission requested by Brand: ", "") : "") || "Please resubmit correct links.";
    const isCompleted = (thread?.status === "COMPLETED" || thread?.flow_state === "COMPLETED");
    const isRevisionDeclined = ((thread?.flow_state || thread?.status) === "REVISION_DECLINED_LINKS");

    const handleDeclineConfirm = async () => {
      if (!declineReason.trim()) {
        toast.error("Please enter a valid reason for declining.");
        return;
      }
      setLoadingAction(true);
      try {
        const endpoint = isUgcDeal
          ? `/ugc/threads/${threadId}/decline-revisions`
          : `/campaign/threads/${threadId}/decline-live-links-resubmission`;
        await api.post(endpoint, { feedback: declineReason });
        toast.success("Resubmission request declined successfully.");
        setShowDeclineInput(false);
        setDeclineReason("");
        if (onActionComplete) {
          onActionComplete();
        } else {
          window.location.reload();
        }
      } catch (err) {
        toast.error(calmError(err, "Couldn't decline the request. Please try again.")); // v332
      } finally {
        setLoadingAction(false);
      }
    };

    return (
      <motion.div 
        initial={{ opacity: 0, y: 12, scale: 0.98 }} 
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className={`w-full flex ${isMine ? 'justify-end' : 'justify-start'} my-6 px-4`}
      >
        <div className="w-full max-w-[440px] p-5 shadow-xl rounded-2xl bg-white border border-rose-200 text-left relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-rose-500 to-rose-600 rounded-l-2xl" />
          
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 font-mono bg-rose-50 border border-rose-100 px-2.5 py-0.5 rounded-md">
              Revision Request: Live Links ⚠️
            </span>
            <span className="text-[10px] text-slate-500 font-medium font-mono">
              {istTime(message.created_at) /* v330: IST; v332: no "Invalid Date" */}
            </span>
          </div>

          <h4 className="text-sm font-extrabold text-slate-900 mb-2">
            ❌ Brand Requested Link Correction:
          </h4>

          {/* Feedback details */}
          <div className="p-3 bg-rose-50/50 border border-rose-100 rounded-xl mb-4 text-xs font-semibold text-rose-700 leading-relaxed font-sans">
            "{feedback}"
          </div>

          <div className="border-t border-slate-100 pt-4 mt-4">
            {isCompleted ? (
              <div className="flex items-center gap-2.5 text-emerald-600 text-xs font-bold bg-emerald-50 border border-emerald-100 rounded-xl p-3.5 shadow-sm">
                <CheckCircle size={16} className="shrink-0" />
                <span>Links approved and payment released successfully! 🎉</span>
              </div>
            ) : isRevisionDeclined ? (
              <div className="flex items-center gap-2.5 text-rose-600 text-xs font-bold bg-rose-50 border border-rose-100 rounded-xl p-3.5 shadow-sm">
                <AlertCircle size={16} className="shrink-0" />
                <span>Creator declined the resubmission request.</span>
              </div>
            ) : (!isLatestOfType("live_links_resubmit_request") || campaignStepClosed(["REVISION_REQUESTED_LINKS", "LIVE_LINK_REVISION_REQ", "LIVE_LINK_REVISION"])) ? (
              <div className="flex items-center gap-2.5 text-slate-500 text-xs font-bold bg-slate-50 border border-slate-100 rounded-xl p-3.5">
                <CheckCircle size={16} className="shrink-0" />
                <span>Resolved — an updated link was submitted.</span>
              </div>
            ) : isUserBrand ? (
              // Brand Side: Waiting for Creator
              <div className="flex items-center gap-2.5 text-amber-600 text-xs font-bold bg-amber-50 border border-amber-100 rounded-xl p-3.5 shadow-sm">
                <Loader2 size={16} className="animate-spin shrink-0 text-amber-500" />
                <span>Waiting for Creator's Reply... ⏳</span>
              </div>
            ) : (
              // Creator Side: Actionable Choices
              showDeclineInput ? (
                <div className="space-y-3 bg-slate-50 border border-slate-100 p-4 rounded-xl">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Reason for declining:
                  </label>
                  <textarea
                    rows={3}
                    className="w-full bg-white border border-slate-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-xl p-3 text-xs text-slate-800 placeholder-slate-400 font-medium font-sans"
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="Tell the brand why you are declining this request..."
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setShowDeclineInput(false);
                        setDeclineReason("");
                      }}
                      className="py-2 px-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDeclineConfirm}
                      disabled={loadingAction}
                      className="py-2 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      {loadingAction ? <Loader2 size={13} className="animate-spin" /> : null}
                      <span>Confirm Decline</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-slate-500 font-semibold mb-3 leading-relaxed">
                    Please upload the correct live post URLs using the button below, or decline the resubmission request.
                  </p>
                  <div className="flex gap-2.5">
                    <button
                      onClick={() => setShowDeclineInput(true)}
                      className="flex-1 py-3 px-4 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-black text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <AlertCircle size={14} />
                      <span>Decline the changes</span>
                    </button>
                    <button
                      onClick={() => {
                        if (onSelectUploadTab) {
                          onSelectUploadTab();
                        }
                        toast.info("Please use the 'SUBMIT LINK' tab below to submit links!");
                      }}
                      className="flex-1 py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer hover:shadow-emerald-500/10"
                    >
                      <CheckCircle size={14} />
                      <span>Submit Links again</span>
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  // 3c. Live Links Resubmit Declined Notice
  if (type === "live_links_resubmit_declined") {
    const feedback = metadata?.feedback || (typeof content === "string" ? content.replace("⚠️ Creator declined live links resubmission: ", "") : "") || "Creator declined the resubmission request.";
    const isCompleted = thread?.status === "COMPLETED";

    const handleApproveLiveLinks = async () => {
      setLoadingAction(true);
      try {
        const endpoint = isUgcDeal
          ? `/ugc/threads/${threadId}/mark-complete`
          : `/campaign/threads/${threadId}/mark-complete`;
        await api.post(endpoint);
        toast.success("Live links approved — the creator's payout is being released." /* v415 */);
        if (onActionComplete) {
          onActionComplete();
        } else {
          window.location.reload();
        }
      } catch (err) {
        toast.error(calmError(err, "Couldn't approve the links. Please try again.")); // v332
      } finally {
        setLoadingAction(false);
      }
    };

    const handleSendReRequestLinks = async () => {
      if (!brandReRequestNotes.trim()) {
        toast.error("Please enter a note explaining what needs revision.");
        return;
      }
      setLoadingAction(true);
      try {
        const endpoint = isUgcDeal
          ? `/ugc/threads/${threadId}/reject-content`
          : `/campaign/threads/${threadId}/reject-live-links`;
        await api.post(endpoint, { feedback: brandReRequestNotes.trim() });
        toast.success("Re-request sent to creator.");
        setShowBrandReRequestForm(false);
        setBrandReRequestNotes("");
        if (onActionComplete) onActionComplete();
      } catch (err) {
        toast.error(calmError(err, "Couldn't send the request again. Please try again.")); // v332
      } finally {
        setLoadingAction(false);
      }
    };

    return (
      <motion.div 
        initial={{ opacity: 0, y: 12, scale: 0.98 }} 
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className={`w-full flex ${isMine ? 'justify-end' : 'justify-start'} my-6 px-4`}
      >
        <div className="w-full max-w-[480px] p-5 shadow-xl rounded-2xl bg-white border border-rose-300 text-left relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-rose-500 to-rose-600 rounded-l-2xl" />
          
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 font-mono bg-rose-50 border border-rose-100 px-2.5 py-0.5 rounded-md">
              Resubmission Declined ⚠️
            </span>
            <span className="text-[10px] text-slate-500 font-medium font-mono">
              {istTime(message.created_at) /* v330: IST; v332: no "Invalid Date" */}
            </span>
          </div>

          <h4 className="text-sm font-extrabold text-slate-900 mb-2">
            🚫 Creator Declined Resubmission Request:
          </h4>

          {/* Decline details */}
          <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl mb-4 text-xs font-semibold text-rose-700 leading-relaxed font-sans">
            "{feedback}"
          </div>

          {/* 3 Action Buttons for Brand */}
          {isUserBrand && !isCompleted && (!isLatestOfType("live_links_resubmit_declined") || campaignStepClosed(["REVISION_DECLINED_LINKS"])) && (
            <div className="pt-3 border-t border-slate-100 text-xs font-bold text-slate-500">
              No action needed on this card — the deal has moved on.
            </div>
          )}
          {isUserBrand && !isCompleted && isLatestOfType("live_links_resubmit_declined") && !campaignStepClosed(["REVISION_DECLINED_LINKS"]) && (
            <div className="pt-3 border-t border-slate-100">
              <SysLiveLinksDeclinedBody brandReRequestNotes={brandReRequestNotes} handleApproveLiveLinks={handleApproveLiveLinks} handleSendReRequestLinks={handleSendReRequestLinks} loadingAction={loadingAction} setBrandReRequestNotes={setBrandReRequestNotes} setIsSupportModalOpen={setIsSupportModalOpen} setShowApproveDeclinedConfirm={setShowApproveDeclinedConfirm} setShowBrandReRequestForm={setShowBrandReRequestForm} showApproveDeclinedConfirm={showApproveDeclinedConfirm} showBrandReRequestForm={showBrandReRequestForm} thread={thread} />
            </div>
          )}

          {/* Modal */}
          <OrderSupportModal
            isOpen={isSupportModalOpen}
            onClose={() => setIsSupportModalOpen(false)}
            thread={thread}
            threadId={threadId}
            isUserBrand={isUserBrand}
            onTicketCreated={() => {
              if (onActionComplete) onActionComplete();
            }}
          />
        </div>
      </motion.div>
    );
  }

  // 4. Fallback System Message Notice (Official high-contrast light-theme slip)
  let actionLabel = "Ybex update"; // v415: plain labels for brands (were caps + emoji)
  let badgeColor = "text-amber-700 bg-amber-50 border-amber-200";
  let accentBorder = "from-amber-500 to-amber-600";
  let iconBg = "bg-amber-50 text-amber-600 border-amber-100";
  let cardBg = "bg-white border-amber-200/60 shadow-md shadow-amber-100/50";
  let parsedIcon = <Info size={16} className="text-amber-500" />;

  const lowerContent = content.toLowerCase();

  if (type === "creator_signed" || (!type?.includes?.('brand') && lowerContent.includes("creator has signed"))) {
    actionLabel = "Creator signed";
    badgeColor = "text-[var(--violet)] bg-[#F5F0FF] border-[#DDD6FE]";
    accentBorder = "from-indigo-400 to-fuchsia-400";
    iconBg = "bg-[#F5F0FF] text-[var(--violet)] border-[#DDD6FE]";
    cardBg = "bg-white border-[#DDD6FE]/60 shadow-md shadow-violet-100/30";
    parsedIcon = <Lock size={16} className="text-[var(--violet)]" />;
  } else if (type === "brand_signed" || lowerContent.includes("brand has signed")) {
    actionLabel = "Brand signed";
    badgeColor = "text-[#6D28D9] bg-blue-50 border-blue-200";
    accentBorder = "from-blue-400 to-[#7C3AED]";
    iconBg = "bg-blue-50 text-[#7C3AED] border-blue-100";
    cardBg = "bg-white border-blue-200/60 shadow-md shadow-blue-100/50";
    parsedIcon = <Lock size={16} className="text-blue-500" />;
  } else if (type === "agreement_executed" || lowerContent.includes("agreement executed")) {
    actionLabel = "Agreement signed";
    badgeColor = "text-emerald-800 bg-emerald-50 border-emerald-200";
    accentBorder = "from-emerald-400 via-teal-500 to-[#7C3AED]";
    iconBg = "bg-emerald-50 text-emerald-600 border-emerald-100";
    cardBg = "bg-white border-emerald-200/60 shadow-md shadow-emerald-100/50";
    parsedIcon = <CheckCircle size={16} className="text-emerald-600" />;
  } else if (type === "payment_secured" || metadata?.action === "payment_secured" || lowerContent.includes("payment secured") || lowerContent.includes("held safely in escrow")) {
    actionLabel = "Payment secured";
    badgeColor = "text-emerald-800 bg-emerald-50 border-emerald-200";
    accentBorder = "from-emerald-500 via-teal-500 to-[#7C3AED]";
    iconBg = "bg-emerald-50 text-emerald-600 border-emerald-100";
    cardBg = "bg-white border-emerald-200/60 shadow-md shadow-emerald-100/50";
    parsedIcon = <Shield size={16} className="text-emerald-600" />;
  } else if (type === "chat_closed") {
    actionLabel = "Collaboration completed";
    badgeColor = "text-amber-800 bg-amber-50 border-amber-200";
    accentBorder = "from-amber-400 to-amber-600";
    iconBg = "bg-amber-50 text-amber-600 border-amber-100";
    cardBg = "bg-white border-amber-200/60 shadow-md shadow-amber-100/50";
    parsedIcon = <Lock size={16} className="text-amber-500" />;
  } else if (lowerContent.includes("brand") || lowerContent.includes("payment") || lowerContent.includes("escrow") || lowerContent.includes("funded") || lowerContent.includes("released") || lowerContent.includes("approve")) {
    actionLabel = "Deal update";
    badgeColor = "text-emerald-700 bg-emerald-50 border-emerald-200";
    accentBorder = "from-emerald-400 to-teal-500";
    iconBg = "bg-emerald-50 text-emerald-600 border-emerald-100";
    cardBg = "bg-white border-emerald-200/60 shadow-md shadow-emerald-100/50";
    parsedIcon = <Shield size={16} className="text-emerald-500" />;
  } else if (lowerContent.includes("creator") || lowerContent.includes("submit") || lowerContent.includes("video") || lowerContent.includes("draft") || lowerContent.includes("link") || lowerContent.includes("upload")) {
    actionLabel = "Creator update";
    badgeColor = "text-[var(--violet)] bg-[#F5F0FF] border-[#DDD6FE]";
    accentBorder = "from-indigo-400 to-fuchsia-400";
    iconBg = "bg-[#F5F0FF] text-[var(--violet)] border-[#DDD6FE]";
    cardBg = "bg-white border-[#DDD6FE]/60 shadow-md shadow-violet-100/30";
    parsedIcon = <Video size={16} className="text-[var(--violet)]" />;
  } else if (lowerContent.includes("violation") || lowerContent.includes("block") || lowerContent.includes("warning")) {
    actionLabel = "Safety notice";
    badgeColor = "text-red-700 bg-red-50 border-red-200";
    accentBorder = "from-red-400 to-rose-500";
    iconBg = "bg-red-50 text-red-600 border-red-100";
    cardBg = "bg-white border-red-200/60 shadow-md shadow-red-100/50";
    parsedIcon = <AlertCircle size={16} className="text-red-500" />;
  } else if (lowerContent.includes("lock") || lowerContent.includes("agreement") || lowerContent.includes("signed")) {
    actionLabel = "Agreement";
    badgeColor = "text-[#6D28D9] bg-blue-50 border-blue-200";
    accentBorder = "from-blue-400 to-[#7C3AED]";
    iconBg = "bg-blue-50 text-[#7C3AED] border-blue-100";
    cardBg = "bg-white border-blue-200/60 shadow-md shadow-blue-100/50";
    parsedIcon = <Lock size={16} className="text-blue-500" />;
  }

  // Remove starting emoji if any
  let cleanText = content
    .replace(/^[🔒💸📋🛠️📢🔔✅✨⚠️]\s*/, "")
    .replace(/^Deal LOCKED\.\s*/i, "")
    .replace(/^Content submitted\.\s*/i, "")
    .trim();

  const isDraftApproved = (
    type === 'content_approved' ||
    metadata?.action === 'draft_approved' ||
    cleanText.toLowerCase().includes("content draft approved") ||
    cleanText.toLowerCase().includes("ugc deliverable approved") ||
    cleanText.toLowerCase().includes("content approved")
  ) && type !== 'live_links_approved' && metadata?.action !== 'live_links_approved';
  if (isDraftApproved) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 12, scale: 0.96 }} 
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className={`w-full flex ${isMine ? 'justify-end' : 'justify-start'} my-2 md:my-5 px-1 md:px-3`}
      >
        <SysDraftApprovedCard cleanText={cleanText} isUgcDeal={isUgcDeal} isUserBrand={isUserBrand} message={message} onSelectUploadTab={onSelectUploadTab} thread={thread} />
      </motion.div>
    );
  }

  const isAnnouncement =
    type === "creator_signed" ||
    type === "brand_signed" ||
    type === "agreement_signed" ||
    type === "system" ||
    lowerContent.includes("brand has signed") ||
    lowerContent.includes("creator has signed") ||
    lowerContent.includes("signed the agreement") ||
    lowerContent.includes("signed the partnership agreement");

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12, scale: 0.98 }} 
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`w-full flex ${isAnnouncement ? 'justify-center' : (isMine ? 'justify-end' : 'justify-start')} my-2 md:my-4 px-1 md:px-4 animate-fadeIn`}
    >
      <SysGenericCard accentBorder={accentBorder} actionLabel={actionLabel} badgeColor={badgeColor} cardBg={cardBg} cleanText={cleanText} iconBg={iconBg} message={message} onTriggerReview={onTriggerReview} onViewInvoice={onViewInvoice} parsedIcon={parsedIcon} type={type} />
    </motion.div>
  );
}
