import React, { useState, useEffect, useRef } from "react";
import GoodToKnowCard from "../ugc/GoodToKnowCard";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Lock, Mail, ArrowLeft, ShieldCheck, CheckCircle2 } from "lucide-react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { calmError } from "./calmError"; // v332
import { useAuth } from "../../contexts/AuthContext";
import { normalizeKycStatus } from "../../utils/kycStatus";
import { deliveryHoursOf, UGC_REVISION_LIMIT } from "../../utils/ugcTerms";
import { agreementFields, AGREEMENT_VERSIONS } from "../../lib/agreementCapture";
import { ugcAgreement, asCaptureSource } from "../../lib/agreementTerms";
import AgreementTermsPanel from "./AgreementTermsPanel";

export default function UGCContractModal({ brief, orderId, threadId, onClose, onSigned, onStartChat }) {
  const [loading, setLoading] = useState(false);
  const agreementRef = useRef(null); // session 28: the text on screen goes into the signature record
  const { user } = useAuth();
  
  const getRegisteredUserEmail = (u) => { return u?.email || u?.business_email || u?.businessEmail || ""; };
  const [otpEmail, setOtpEmail] = useState(() => getRegisteredUserEmail(user));

  useEffect(() => {
    const e = getRegisteredUserEmail(user);
    if (e) {
      setOtpEmail(e);
    } else {
      api.get("creators/me").then(({ data }) => {
        const ce = data?.email || data?.business_email;
        if (ce) setOtpEmail(ce);
      }).catch(() => {});
    }
  }, [user]);

  // 6 separate digits for OTP
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef([]);
  
  // Agreement checkboxes
  // Session 30 (Ravi): nothing is pre-ticked, and the OTP is sent only after both boxes are ticked.
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedDeadline, setAgreedDeadline] = useState(false);

  // Session 24: a fresh claim needs approved KYC (the server enforces it too). Checked before
  // the OTP is sent, so no code is wasted. Re-signing an existing order is not a new claim.
  const isFreshClaim = !orderId;
  const [kycStatus, setKycStatus] = useState(isFreshClaim ? null : "APPROVED");
  useEffect(() => {
    if (!isFreshClaim) return;
    let alive = true;
    api.get("verifications/me")
      .then(({ data }) => { if (alive) setKycStatus(normalizeKycStatus(data)); })
      .catch(() => { if (alive) setKycStatus("APPROVED"); }); // the server still checks
    return () => { alive = false; };
  }, [isFreshClaim]);

  // OTP cooldown timer
  const [resendCooldown, setResendCooldown] = useState(0); // v415: cooldown starts only after a code is really sent (a failed auto-send locked Resend for 60s)
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  // Full registered email for display (no privacy asterisks)
  const displayEmail = otpEmail || "your registered email";

  // Session 30: send the OTP once, only after the creator has ticked both boxes (was: on open).
  const termsAccepted = agreedTerms && agreedDeadline;
  useEffect(() => {
    if (termsAccepted && otpEmail && !otpSent && !sendingOtp && kycStatus === "APPROVED") {
      handleSendOTP(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termsAccepted, otpEmail, kycStatus]);

  // Cooldown timer interval
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [resendCooldown]);

  const handleSendOTP = async (isAuto = false) => {
    if (!otpEmail || !otpEmail.includes("@")) {
      if (!isAuto) toast.error("Registered email address not found.");
      return;
    }
    setSendingOtp(true);
    try {
      const otpRes = await api.post("/otp/send", { 
        value: otpEmail, 
        target: "email", 
        purpose: "contract_sign",
        recipientName: user?.name || user?.full_name || "Creator Partner",
        brandName: brief?.brand_name || "Brand Partner",
        creatorName: user?.name || "Creator Partner",
        campaignTitle: brief?.title || brief?.campaign_title || "UGC Video Deliverable Agreement",
        dealAmount: brief?.budget || brief?.payout || ""
      });
      setOtpSent(true);
      setResendCooldown(60);
      if (otpRes?.data?.code && String(otpRes?.data?.message || "").startsWith("Test mode")) {
        toast.warning(`${otpRes.data.message} Test code: ${otpRes.data.code}`, { duration: 15000 });
      } else if (!isAuto) {
        toast.success(`Verification code dispatched to ${displayEmail}`);
      }
    } catch (e) {
      if (!isAuto) {
        toast.error(calmError(e, "Couldn't send the code. Please try again.")); // v332
      }
    } finally {
      setSendingOtp(false);
    }
  };

  const handleDigitChange = (index, value) => {
    // If pasted multiple digits
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

  const fullOtpCode = otpDigits.join("");
  const isFormValid = agreedTerms && agreedDeadline && fullOtpCode.length === 6;

  const handleSign = async () => {
    if (!isFormValid) {
      toast.error("Please agree to all terms and enter the 6-digit verification code.");
      return;
    }
    
    setLoading(true);
    try {
      // 1. Verify OTP code
      const verified = await api.post("/otp/verify", { value: otpEmail, code: fullOtpCode });
      const signToken = verified?.data?.sign_token; // required by claim and /sign

      let targetOrderId = orderId;
      let alreadySigned = false; // v415

      if (!targetOrderId) {
        // Fresh claim from Explore UGC: atomically claim & sign with OTP signature
        const briefId = brief?.id || brief?.brief_id;
        if (!briefId) {
          throw new Error("Invalid brief identifier.");
        }
        const { data } = await api.post("ugc/orders/claim", {
          brief_id: briefId,
          signature: `OTP Verified: ${otpEmail}`,
          sign_token: signToken,
          ...agreementFields(asCaptureSource(agreementV1), AGREEMENT_VERSIONS.ugcDesktop)
        });
        targetOrderId = data?.order_id || data?.order?.id;
      } else {
        // Resigning an existing pending order in Manage Orders
        const signRes = await api.post(`/ugc/orders/${targetOrderId}/sign`, { 
          signature: `OTP Verified: ${otpEmail}`,
          thread_id: threadId,
          sign_token: signToken,
          ...agreementFields(asCaptureSource(agreementV1), AGREEMENT_VERSIONS.ugcDesktop)
        });
        alreadySigned = Boolean(signRes?.data?.already_signed); // v415
      }

      if (alreadySigned) {
        toast.success("Already signed — this agreement was signed earlier.", { duration: 4000 }); // v415: no fake "timer has started"
      } else {
        toast.success(`✓ Agreement signed · brief claimed — Your ${briefHours}h timer has started`, {
          duration: 4000
        });
      }

      if (onSigned) {
        onSigned(targetOrderId);
      } else {
        onClose();
      }
    } catch (e) {
      toast.error(calmError(e, "That code didn't work. Please check it and try again.")); // v332: no raw error text
      if (e?.response?.data?.code === "KYC_REQUIRED") setKycStatus(normalizeKycStatus({ status: e.response.data.kyc_status }));
    } finally {
      setLoading(false);
    }
  };

  const brandName = brief?.brand_name || brief?.brand?.name || "Verified Brand";
  const briefTitle = brief?.title || "Collaboration video deliverable";
  const payout = Number(brief?.budget || brief?.payout || 0);
  const briefHours = deliveryHoursOf(brief?.delivery_hours, 24);
  const agreementV1 = ugcAgreement({
    brandName, creatorName: user?.name || user?.full_name, briefTitle, payout, hours: briefHours, revisions: UGC_REVISION_LIMIT,
    deliverableType: brief?.deliverable_type, videoDuration: brief?.video_duration, // v427
  });

  if (isFreshClaim && kycStatus && kycStatus !== "APPROVED") {
    const pending = kycStatus === "PENDING";
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70" onClick={onClose} />
        <div className="relative z-10 w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl text-center" data-testid="ugc-claim-kyc-gate">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center mb-3">
            <ShieldCheck size={22} />
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            {pending ? "Your KYC is under review" : "Complete KYC to claim briefs"}
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            {pending
              ? "You can claim UGC briefs as soon as your KYC is approved."
              : "Only KYC-verified creators can claim UGC briefs. It takes about 2 minutes."}
          </p>
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm">
              Close
            </button>
            {!pending && (
              <button type="button" onClick={() => window.location.assign("/creator/kyc")} className="flex-1 h-11 rounded-xl bg-[#7C3AED] text-white font-bold text-sm">
                {kycStatus === "REJECTED" ? "Update KYC" : "Complete KYC"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }} 
          className="absolute inset-0 bg-black/70 backdrop-blur-sm" 
          onClick={onClose} 
        />

        {/* Modal Window */}
        <motion.div 
          initial={{ scale: 0.96, opacity: 0, y: 16 }} 
          animate={{ scale: 1, opacity: 1, y: 0 }} 
          exit={{ scale: 0.96, opacity: 0, y: 16 }}
          className="bg-white border border-[#E0E0E6] rounded-3xl w-full max-w-[760px] max-h-[92dvh] flex flex-col relative z-10 shadow-2xl overflow-hidden font-['DM_Sans',sans-serif]"
        >
          {/* Top Bar */}
          <div className="shrink-0 px-6 py-4.5 border-b border-[#E5E5EA] flex items-center justify-between bg-white">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-[#F4F4F7] hover:bg-gray-200 text-[#374151] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                title="Back to brief details"
              >
                <ArrowLeft size={16} strokeWidth={2.4} />
              </button>
              <div className="min-w-0">
                <h2 className="font-bold text-[17px] text-[#0A0A0A] leading-tight">Creator agreement</h2>
                <div className="text-xs text-[#6B7280] truncate mt-0.5">
                  {briefTitle} · {brandName}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {/* Step Indicator */}
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-[#6B7280] font-medium mr-1">
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <Check size={13} className="stroke-[3]" /> 1 Brief
                </span>
                <span className="w-4 h-px bg-gray-300"></span>
                <span className="text-[#7C3AED] font-bold">● 2 Agreement</span>
              </div>

              {/* Close Button */}
              <button 
                type="button"
                onClick={onClose} 
                aria-label="Close" /* v332: icon-only button had no label; 40px target */
                className="w-10 h-10 rounded-lg bg-[#F4F4F7] hover:bg-gray-200 text-[#374151] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                title="Close"
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </div>
          </div>

          {/* Modal Scrollable Body */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
            <div ref={agreementRef} className="space-y-5">
            <AgreementTermsPanel agreement={agreementV1} pdfName="ybex-ugc-agreement.pdf" pdfSubtitle={`${briefTitle} · ${brandName}`} />
            </div>

            <GoodToKnowCard />

            {/* Checkboxes */}
            <div className="space-y-2.5 pt-1">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-[#7C3AED] focus:ring-[#7C3AED] cursor-pointer"
                />
                <span className="text-xs text-[#374151] leading-tight font-medium">
                  I've read and agree to the creator agreement and brief requirements.
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreedDeadline}
                  onChange={(e) => setAgreedDeadline(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-[#7C3AED] focus:ring-[#7C3AED] cursor-pointer"
                />
                <span className="text-xs text-[#374151] leading-tight font-medium">
                  I understand missing the {briefHours}h deadline cancels this order.
                </span>
              </label>
            </div>

            {/* Sign with OTP Box */}
            <div className={`rounded-2xl border border-[#D8B4FE]/60 bg-[#FAF7FF] p-4.5 space-y-3.5 transition ${termsAccepted ? "" : "opacity-50 pointer-events-none"}`} aria-disabled={!termsAccepted}>
              {!termsAccepted && <div className="text-xs font-semibold text-[#7C3AED]">Tick both boxes above to get your code.</div>}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 font-bold text-sm text-[#0A0A0A]">
                  <Lock size={15} className="text-[#7C3AED]" />
                  <span>Sign with OTP</span>
                </div>
                <div className="text-xs text-[#6B7280] flex items-center gap-1">
                  <Mail size={12} />
                  <span>{otpSent ? "Sent to" : "Will be sent to"} <strong>{displayEmail}</strong></span>
                </div>
              </div>

              {/* 6 Digit Inputs */}
              <div>
                <div className="flex justify-center sm:justify-start gap-2 sm:gap-3">
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => (inputRefs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={digit}
                      onChange={(e) => handleDigitChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      className="w-11 h-13 text-center text-xl font-bold font-mono bg-white border border-[#DDD0FF] rounded-xl text-[#0A0A0A] focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20 outline-none transition-all shadow-2xs"
                    />
                  ))}
                </div>

                <div className="flex items-center justify-between mt-3 text-xs text-[#6B7280]">
                  <span>Registered email · can’t be changed here</span>
                  {resendCooldown > 0 ? (
                    <span className="font-medium text-[#7C3AED]">
                      Resend in 0:{resendCooldown < 10 ? `0${resendCooldown}` : resendCooldown}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSendOTP(false)}
                      disabled={sendingOtp}
                      className="font-bold text-[#7C3AED] hover:underline cursor-pointer disabled:opacity-50"
                    >
                      {sendingOtp ? "Sending..." : otpSent ? "Resend OTP" : "Send code" /* v415: nothing was sent yet (auto-send failed) */}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Action Footer (Rule AGENTS_md: Cancel on left, Verify on right) */}
          <div className="shrink-0 px-6 py-4 border-t border-[#E5E5EA] bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-[11.5px] text-[#6B7280] leading-tight">
              Once your OTP is verified, the agreement is signed, your {briefHours}h timer starts and you'll go to Manage orders.
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end shrink-0">
              {/* Secondary button on Left per AGENTS_md */}
              <button
                type="button"
                onClick={onClose}
                className="px-4.5 h-11 rounded-xl text-xs font-bold text-[#4B5563] bg-[#F2F2F7] hover:bg-[#E5E5EA] transition-colors cursor-pointer"
              >
                Back
              </button>

              {/* Primary button on Right per AGENTS_md */}
              <button
                type="button"
                onClick={handleSign}
                disabled={loading || !isFormValid}
                className="px-6 h-11 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_10px_20px_-10px_rgba(124,58,237,0.9)] cursor-pointer"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 size={15} />
                    <span>Verify OTP & sign</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
