import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, CheckCircle, Lock, Mail } from "lucide-react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { calmError } from "./calmError"; // v332
import { ignored } from "../../utils/ignored";
import { agreementFields, AGREEMENT_VERSIONS } from "../../lib/agreementCapture";
import { campaignAgreement, asCaptureSource } from "../../lib/agreementTerms";
import AgreementTermsPanel from "./AgreementTermsPanel";
import ModalPortal from "../common/ModalPortal";
import useScrollLock from "../../lib/useScrollLock";
import { backdropMotion, modalMotion } from "../../lib/motion"; // v415

export default function ContractModal({ thread, offer, user, onClose, onSigned, onNegotiateInstead }) {
  const [loading, setLoading] = useState(false);
  const termsRef = React.useRef(null); // session 28: the text on screen goes into the signature record
  
  const getRegisteredUserEmail = (u) => { return u?.email || u?.poc_email || u?.pocEmail || u?.business_email || ''; };
  const getRegisteredUserPhone = (u) => {
    if (!u) return "";
    let raw = u.phone || u.mobile || u.phone_number || u.pocPhone || u.representative_mobile || u.poc_phone || "";
    if (!raw || !String(raw).trim()) {
      try {
        const saved = localStorage.getItem("ybex_user");
        if (saved) {
          const parsed = JSON.parse(saved);
          raw = parsed.phone || parsed.mobile || parsed.phone_number || parsed.pocPhone || parsed.representative_mobile || parsed.poc_phone || "";
        }
      } catch (e) { ignored("ContractModal:21", e); }
    }
    const str = String(raw).trim();
    if (!str) return u?.email ? `+91 (${u.email})` : "Phone Not Linked";
    if (str.startsWith("+")) return str;
    const digits = str.replace(/\D/g, "");
    if (digits.length === 10) return `+91 ${digits}`;
    return str;
  };

  const [otpEmail, setOtpEmail] = useState(() => getRegisteredUserEmail(user));

  // The server decides which email signs: a brand's verified POC business email from Settings
  // when there is one, else the login email (session 27). It used to be the login email always.
  React.useEffect(() => {
    let alive = true;
    api.get("contract/signing-email", { bypassCache: true }).then(({ data }) => {
      if (alive && data?.email) setOtpEmail(data.email);
    }).catch(() => {});
    return () => { alive = false; };
  }, [user?.user_id]);
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  
  const isBrand = user?.role === 'brand' || user?.user_type === 'brand';

  const handleSendOTP = async () => {
    if (!otpEmail || !otpEmail.includes('@')) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setSendingOtp(true);
    try {
      const otpRes = await api.post('/otp/send', { 
        value: otpEmail, 
        target: 'email', 
        purpose: 'contract_sign',
        recipientName: user?.name || user?.full_name || (isBrand ? 'Brand Partner' : 'Creator Partner'),
        brandName: thread?.brand?.name || offer?.brand_name || 'Brand Partner',
        creatorName: thread?.creator?.name || offer?.creator_name || 'Creator Partner',
        campaignTitle: offer?.title || offer?.campaign_title || thread?.campaign_title || 'Influencer Partnership Agreement',
        dealAmount: offer?.amount || thread?.amount_fixed || ''
      });
      setOtpSent(true);
      if (otpRes?.data?.code && String(otpRes?.data?.message || "").startsWith("Test mode")) {
        toast.warning(`${otpRes.data.message} Test code: ${otpRes.data.code}`, { duration: 15000 });
      } else toast.success(`Verification code dispatched to ${otpEmail}`);
    } catch (e) {
      toast.error(calmError(e, "Couldn't send the code. Please try again.")); // v332
    } finally {
      setSendingOtp(false);
    }
  };

  const handleSign = async () => {
    if (!otpSent) {
      toast.error("Please send OTP first.");
      return;
    }
    if (!otpCode || otpCode.trim().length < 4) {
      toast.error("Please enter the verification code.");
      return;
    }
    
    setLoading(true);
    try {
      const verified = await api.post('/otp/verify', { value: otpEmail, code: otpCode.trim() });
      // The server only signs with the one-time token it issues for a verified contract code.
      await api.post(`/campaign/threads/${thread.id}/sign`, { offer_id: offer?.id, amount: agreedAmount || undefined, sign_token: verified?.data?.sign_token, ...agreementFields(asCaptureSource(agreementV1), AGREEMENT_VERSIONS.campaignDesktop) });
      toast.success("Contract legally executed!");
      onSigned();
    } catch (e) {
      toast.error(calmError(e, "Couldn't verify the code. Check it and try again.")); // v332
    } finally {
      setLoading(false);
    }
  };

  // Session 58 (bug hunt): after an accepted counter the card only has proposed_amount, and amount_fixed is not a column —
  // the agreement both sides signed showed ₹0.
  // Session 58: the thread's agreed amount wins (a stale card's own figure could show a different price than the one
  // being locked); the server also refuses a signature whose amount doesn't match.
  const agreedAmount = (Number(thread?.agreed_amount || offer?.amount || offer?.proposed_amount || offer?.proposed_fee || thread?.amount_fixed || 0) || 0);
  const amountText = agreedAmount.toLocaleString('en-IN');
  // v414: same default as the server (campaignGuards revisionAllowance = 5, 0 is real); the thread's agreed count wins over a card's.
  const revisionsCount = [thread?.revision_count, offer?.revision_count].map(v => (v === null || v === undefined || v === '' ? NaN : Number(v))).find(n => Number.isFinite(n) && n >= 0) ?? 5;
  const inviteTerms = thread?.invite_terms || null;
  const toList = (v) => Array.isArray(v)
    ? v.map((x) => String(x || "").trim()).filter(Boolean)
    : String(v || "").split(/\n|,|;/).map((x) => x.trim()).filter(Boolean);
  const deliverableItems = (() => {
    for (const src of [offer?.deliverables, thread?.deliverables, inviteTerms?.deliverables, offer?.metadata?.deliverable]) {
      const list = toList(src);
      if (list.length) return list;
    }
    return []; // session 30: no invented deliverable — the agreement says "as agreed in this chat"
  })();
  // v332: IST / Indian date order, and no "Invalid Date" in the agreement text
  const deadlineText = offer?.deadline && !Number.isNaN(new Date(offer.deadline).getTime())
    ? new Date(offer.deadline).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' })
    : (inviteTerms?.timeline || offer?.metadata?.timeline || thread?.timeline || 'TBD');

  // Session 30 — Agreement v1 in the UGC agreement style. Same calls as before
  // (/otp/send, /otp/verify, /campaign/threads/:id/sign). The OTP is sent only after the box is ticked.
  const [agreed, setAgreed] = useState(false);
  useScrollLock(true);
  // v415: Escape closes (not while signing)
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !loading) onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loading, onClose]);
  const agreementV1 = campaignAgreement({
    brandName: thread?.brand?.name || offer?.brand_name,
    creatorName: thread?.creator?.name || offer?.creator_name,
    amount: agreedAmount,
    deliverables: deliverableItems,
    deadlineText,
    revisions: revisionsCount,
  });
  const campaignTitle = offer?.title || offer?.campaign_title || thread?.campaign_title || "Campaign";
  const partnerName = isBrand ? (thread?.creator?.name || offer?.creator_name || "the creator") : (thread?.brand?.name || offer?.brand_name || "the brand");
  useEffect(() => {
    if (agreed && !otpSent && !sendingOtp && otpEmail && otpEmail.includes("@")) handleSendOTP();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreed, otpEmail]);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" data-testid="campaign-contract-modal" role="dialog" aria-modal="true" aria-label="Campaign agreement">{/* v415: same layer as other popups (was z-80, under the Eva bubble) */}
        <motion.div {...backdropMotion} className="absolute inset-0 bg-black/70" onClick={() => { if (!loading) onClose(); }} />{/* v415: fades in/out */}
        <motion.div
          {...modalMotion /* v415: had no closing animation (vanished instantly) */}
          className="bg-white border border-[#E0E0E6] rounded-3xl w-full max-w-[760px] max-h-[92dvh] flex flex-col relative z-10 shadow-2xl overflow-hidden font-['DM_Sans',sans-serif] text-left"
        >
          <div className="shrink-0 px-6 py-4 border-b border-[#E5E5EA] flex items-center justify-between bg-white gap-3">
            <div className="min-w-0">
              <h2 className="font-bold text-[17px] text-[#0A0A0A] leading-tight">Campaign agreement</h2>
              <div className="text-xs text-[#6B7280] truncate mt-0.5">{campaignTitle} · with {partnerName}</div>
            </div>
            <button type="button" onClick={onClose} title="Close" aria-label="Close" /* v332 */ className="w-10 h-10 rounded-lg bg-[#F4F4F7] hover:bg-gray-200 text-[#374151] flex items-center justify-center shrink-0">
              <X size={16} strokeWidth={2.4} />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
            <div ref={termsRef}>
              <AgreementTermsPanel agreement={agreementV1} pdfName="ybex-campaign-agreement.pdf" pdfSubtitle={`${campaignTitle} · ${thread?.brand?.name || offer?.brand_name || "Brand"} and ${thread?.creator?.name || offer?.creator_name || "Creator"}`} />
            </div>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 w-4 h-4 rounded text-[#7C3AED] focus:ring-[#7C3AED] cursor-pointer" />
              <span className="text-xs text-[#374151] leading-tight font-medium">
                I've read and agree to this campaign agreement, and I'm authorised to sign for my side.
              </span>
            </label>

            <div className={`rounded-2xl border border-[#D8B4FE]/60 bg-[#FAF7FF] p-4 space-y-3 transition ${agreed ? "" : "opacity-50 pointer-events-none"}`} aria-disabled={!agreed}>
              {!agreed && <div className="text-xs font-semibold text-[#7C3AED]">Tick the box above to get your code.</div>}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 font-bold text-sm text-[#0A0A0A]"><Lock size={15} className="text-[#7C3AED]" /> Sign with OTP</div>
                <div className="text-xs text-[#6B7280] flex items-center gap-1 min-w-0"><Mail size={12} /> <span className="truncate">{otpSent ? "Sent to" : "Will be sent to"} <strong>{otpEmail || "your registered email"}</strong></span></div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                  className="w-44 h-12 text-center text-xl font-bold font-mono tracking-[0.3em] bg-white border border-[#DDD0FF] rounded-xl text-[#0A0A0A] focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20 outline-none"
                />
                <button type="button" onClick={handleSendOTP} disabled={sendingOtp} className="text-xs font-bold text-[#7C3AED] hover:underline disabled:opacity-50">
                  {sendingOtp ? "Sending…" : otpSent ? "Resend code" : "Send code"}
                </button>
              </div>
              <div className="text-[11px] text-[#6B7280]">Registered email · can't be changed here</div>
            </div>
          </div>

          <div className="shrink-0 px-6 py-4 border-t border-[#E5E5EA] bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-[11.5px] text-[#6B7280] leading-tight">
              Accepted electronically once your code is verified (Section 10A, IT Act 2000). Both sides get a record.
            </div>
            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end shrink-0">
              {onNegotiateInstead && (
                <button type="button" onClick={onNegotiateInstead} className="px-4 h-11 rounded-xl text-xs font-bold text-[#4B5563] bg-[#F2F2F7] hover:bg-[#E5E5EA]">Negotiate instead</button>
              )}
              <button type="button" onClick={onClose} className="px-4 h-11 rounded-xl text-xs font-bold text-[#4B5563] bg-[#F2F2F7] hover:bg-[#E5E5EA]">Back</button>
              <button
                type="button"
                onClick={handleSign}
                disabled={loading || !agreed || !otpCode || otpCode.length !== 6}
                className="px-6 h-11 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_10px_20px_-10px_rgba(124,58,237,0.9)]"
              >
                {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><CheckCircle size={15} /> Verify OTP & sign</>}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </ModalPortal>
  );
}
