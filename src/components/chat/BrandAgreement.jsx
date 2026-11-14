import { deliverablesLabel } from "../../utils/safeFormat"; // v415
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileSignature, ShieldCheck, Lock, AlertCircle, Award } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import { calmError } from "./calmError"; // v332

import { PopupBackdrop, PopupPanel } from "../common/Popup";
export default function BrandAgreement({ thread, onClose, onSigned }) {
  const [loading, setLoading] = useState(false);
  const step = 'agreement';
  const [signerMobile, setSignerMobile] = useState('');
  const [isSignScrollCompleted, setIsSignScrollCompleted] = useState(false);
  
  // Extract info
  const agreementId = (thread?.id || "FAFDC8BD").replace("thread_", "").substring(0, 8).toUpperCase();
  // v332: Indian date order in IST ("16 October 2026"), and today's date instead of "Invalid Date"
  const effectiveDate = new Date(thread?.created_at && !Number.isNaN(new Date(thread.created_at).getTime()) ? thread.created_at : Date.now())
    .toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' });

  const creatorName = thread?.creator?.name || "Creator";
  const creatorIg = thread?.creator?.profile?.instagram || thread?.creator?.instagram || "";
  const brandName = thread?.brand?.name || "Brand";
  const brandAddress = thread?.brand?.profile?.address || "As per the brand's registered profile";

  const campaignName = thread?.campaigns?.title || "Sponsorship Campaign";
  const deliverablesText = deliverablesLabel(thread?.deliverables) /* v415 */ || "1 High-definition Instagram Reel Post, 1 Story Post with Link stickers";
  // No invented amount in a contract.
  const budgetAmount = Number(thread?.agreed_amount || thread?.amount_fixed) || 0;

  const handleSign = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const mobile = String(signerMobile || '').replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      toast.error("Please enter the representative's valid 10-digit mobile number.");
      return;
    }
    if (loading) return;
    setLoading(true);
    try {
      await api.post((thread?.is_ugc || thread?.deal_type === 'UGC')
        ? `/ugc/threads/${thread.id}/sign`
        : `/campaign/threads/${thread.id}/sign`, { signer_mobile: mobile, signer_side: 'brand' });
      toast.success("Contract signed! Next, make the payment to start the deal." /* v415: plainer wording */, {
        description: budgetAmount > 0
          ? `Your contract of ₹${budgetAmount.toLocaleString('en-IN')} will be held safely by Ybex until you approve the work.` /* v415 */
          : "Your contract is recorded. Ybex holds the payment safely until you approve the work.", // v415
        duration: 8000
      });
      onSigned();
      onClose();
    } catch (err) {
      toast.error(calmError(err, "Couldn't sign the agreement. Please try again.")); // v332: no raw error text
    } finally {
      setLoading(false);
    }
  };

  return (
    <PopupBackdrop className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <PopupPanel kind="modal"
        className="bg-[#faf9f6] text-slate-900 rounded-3xl w-full max-w-3xl overflow-hidden relative shadow-2xl flex flex-col max-h-[92dvh] border-2 border-amber-900/10"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-amber-900/10 flex justify-between items-center bg-[var(--bg-elevated)] text-[var(--text-primary)]">
           <h3 className="text-sm font-mono tracking-widest uppercase flex items-center gap-2">
             <ShieldCheck className="text-amber-400" size={18} /> YBEX SECURE SIGNING &bull; DEED EXECUTION
           </h3>
           <button type="button" onClick={onClose} aria-label="Close" /* v332 */ className="p-2.5 text-amber-200/60 hover:text-white hover:bg-white/10 rounded-full transition-colors">
             <X size={18}/>
           </button>
        </div>

        <AnimatePresence mode="wait">
          {step === 'agreement' ? (
            <motion.div 
              key="agreement"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="flex-1 overflow-y-auto p-8 sm:p-12 space-y-8 no-scrollbar"
              onScroll={(e) => {
                const target = e.target;
                if (target.scrollHeight - target.scrollTop <= target.clientHeight + 80) {
                  setIsSignScrollCompleted(true);
                }
              }}
            >
              {/* Gold Filigree & Coat of Arms Header */}
              <div className="text-center space-y-4 border-b-2 border-double border-amber-900/20 pb-8 relative">
                <div className="absolute top-0 left-0 right-0 flex justify-center -mt-4 opacity-10">
                  <Award size={100} className="text-amber-900" />
                </div>
                
                <h1 className="text-2xl sm:text-3xl font-serif font-semibold tracking-tight text-amber-950">
                  DEED OF COLABORATION AND SPONSORSHIP
                </h1>
                
                <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-xs font-mono text-amber-900/80">
                  <div>
                    <span>AGREEMENT REF:</span> <span className="font-bold bg-amber-900/5 px-2 py-0.5 rounded">INF-{agreementId}</span>
                  </div>
                  <div className="hidden sm:block text-amber-900/30">|</div>
                  <div>
                    <span>EFFECTIVE DATE:</span> <span className="font-bold">{effectiveDate}</span>
                  </div>
                </div>

                <div className="mx-auto w-32 h-0.5 bg-gradient-to-r from-transparent via-amber-900/30 to-transparent" />
              </div>

              {/* Recital */}
              <p className="text-sm font-serif leading-relaxed text-slate-700 italic text-justify indent-8">
                This Sponsorship and Media Services Agreement (the "Agreement") is entered into and made effective as of the Effective Date, by and between the brand advertiser specified below and the independent media content creator specified herein.
              </p>

              {/* 1. Parties */}
              <div className="space-y-4">
                <h3 className="text-sm font-mono font-bold text-amber-950 border-b border-amber-900/20 pb-1 uppercase tracking-wider">
                  I. THE CONTRACTING PARTIES
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-amber-900/[0.02] border border-amber-900/10 rounded-2xl p-6 space-y-2 relative overflow-hidden">
                    <div className="absolute top-2 right-2 w-16 h-16 bg-amber-900/[0.03] rounded-full flex items-center justify-center font-serif text-3xl font-black text-amber-900/10 pointer-events-none">C</div>
                    <span className="text-[10px] font-mono font-bold text-amber-900 uppercase tracking-wider block">First Party (Creator)</span>
                    <div className="space-y-1.5 text-sm font-serif">
                      <p className="text-slate-900 font-bold">{creatorName}</p>
                      <p className="text-slate-600">Digital Media Publisher & Influencer</p>
                      <p className="text-xs font-mono text-slate-500">Instagram Handle: @{creatorIg}</p>
                    </div>
                  </div>

                  <div className="bg-amber-900/[0.02] border border-amber-900/10 rounded-2xl p-6 space-y-2 relative overflow-hidden">
                    <div className="absolute top-2 right-2 w-16 h-16 bg-amber-900/[0.03] rounded-full flex items-center justify-center font-serif text-3xl font-black text-amber-900/10 pointer-events-none">B</div>
                    <span className="text-[10px] font-mono font-bold text-amber-900 uppercase tracking-wider block">Second Party (Brand Sponsor)</span>
                    <div className="space-y-1.5 text-sm font-serif">
                      <p className="text-slate-900 font-bold">{brandName}</p>
                      <p className="text-slate-600 line-clamp-1">{brandAddress}</p>
                      <p className="text-xs font-mono text-slate-500">Corporate Registered Advertiser</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Scope & Campaign */}
              <div className="space-y-4">
                <h3 className="text-sm font-mono font-bold text-amber-950 border-b border-amber-900/20 pb-1 uppercase tracking-wider">
                  II. CAMPAIGN BRIEF & SCOPE OF SERVICES
                </h3>
                <div className="space-y-3 font-serif text-sm text-slate-700 leading-relaxed text-justify">
                  <p>
                    1.1 The Brand hereby commissions the Creator to produce original media content assets to support the promotion of the digital marketing campaign officially titled <strong className="text-amber-950">"{campaignName}"</strong>.
                  </p>
                  <p>
                    1.2 The Creator agrees to produce, submit for pre-approval, and publish the following media deliverables (the "Deliverables"):
                  </p>
                  <div className="bg-amber-900/[0.03] border-l-2 border-amber-700 rounded-r-2xl p-5 italic font-medium text-slate-800">
                    "{deliverablesText}"
                  </div>

                  <div className="space-y-2 pt-2">
                    <span className="font-bold text-slate-800 block">Strict Creative Guidelines & Deliveries:</span>
                    <ul className="space-y-1 text-xs list-disc pl-5 text-slate-600">
                      <li>Deliverables must feature the sponsor's designated brand messaging with clear lighting, high-definition (HD) resolution, and professional audio.</li>
                      <li>Tag/Collab with the Second Party's official social account in the final post description.</li>
                      <li>The Creator must maintain the published posts active and publicly visible for a minimum duration of 365 calendar days post-upload, with no archiving.</li>
                      <li>Any competitive sponsorships featuring direct commercial rivals of the Sponsor are strictly barred for 15 days pre and post this publishing window.</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* 3. Escrow and Payments */}
              <div className="space-y-4">
                <h3 className="text-sm font-mono font-bold text-amber-950 border-b border-amber-900/20 pb-1 uppercase tracking-wider">
                  III. PAYMENT HOLD PROTECTION & COMPENSATION TERMS
                </h3>
                <div className="space-y-3 font-serif text-sm text-slate-700 leading-relaxed text-justify">
                  <p>
                    2.1 In full consideration of the satisfactory execution of the Deliverables, the Second Party agrees to compensate the First Party the sum of <strong className="text-amber-950">₹{budgetAmount.toLocaleString('en-IN')} INR</strong>.
                  </p>
                  <p>
                    2.2 **Secure Payment Hold Security Mandate**: To qualify for platform payment protection, 100% of the agreed contract volume is pre-deposited into the secure Ybex Secure Payment Hold Vault. This capital is bonded under platform arbitration guidelines and is fully protected from unilateral cancellation.
                  </p>
                  <p>
                    2.3 **Payment Release**: The agreed fee is kept in a secure payment hold. After the Brand approves the delivery (and the live content link, where one is required), Ybex sends the Creator's payout, less the Convenience fee & TDS shown before signing, to the Creator's registered bank account or UPI ID, usually within 1–2 working days.
                  </p>
                </div>
              </div>

              {/* 4. Intellectual Property & Rights */}
              <div className="space-y-4">
                <h3 className="text-sm font-mono font-bold text-amber-950 border-b border-amber-900/20 pb-1 uppercase tracking-wider">
                  IV. CONTENT LICENSING & USAGE RIGHT ASSIGNMENTS
                </h3>
                <div className="space-y-3 font-serif text-sm text-slate-700 leading-relaxed text-justify">
                  <p>
                    3.1 **Ownership**: The Creator retains moral and primary authorship of all original raw video, image, and graphic assets created during this campaign.
                  </p>
                  <p>
                    3.2 **Usage License**: Upon payment release, the Second Party receives a worldwide, royalty-free, non-exclusive license to repost, share, embed, and utilize the live deliverables for organic social media amplification and website embedding for 12 months.
                  </p>
                  <p>
                    3.3 **Restrictions**: The Sponsor is strictly barred from altering, clipping, editing, or utilizing the Creator's likeness and raw footage in paid social media ads (paid whitelist campaigns) without prior written consent and separate commercial licensing discussions.
                  </p>
                </div>
              </div>

              {/* 5. Legal Jurisdiction & Udaipur Court */}
              <div className="space-y-4">
                <h3 className="text-sm font-mono font-bold text-amber-950 border-b border-amber-900/20 pb-1 uppercase tracking-wider">
                  V. LEGAL COVENANTS & UDAIPUR ARBITRATION
                </h3>
                <div className="space-y-3 font-serif text-sm text-slate-700 leading-relaxed text-justify">
                  <p>
                    4.1 **Legal Standing**: This Agreement constitutes a legally binding commercial contract executed electronically under **Section 10A of the Information Technology Act, 2000**.
                  </p>
                  <p>
                    4.2 **Mediation & Jurisdiction**: In the event of an unresolved dispute, the parties agree to first submit to formal mediation under the Ybex Compliance Team. If mediation fails to yield a resolution, the dispute shall be resolved through binding legal arbitration, governed exclusively under the courts of **Udaipur Jurisdiction, Rajasthan, India**.
                  </p>
                  <p>
                    4.3 **Platform Commitment**: Both parties acknowledge that soliciting, requesting, or making external payments ("out-of-chat payments") violates Ybex anti-circumspection regulations. The influencer holds zero liability or responsibility for arrangements initiated outside of Ybex secure payment hold vaults.
                  </p>
                </div>
              </div>

              {/* Signature section */}
              <div className="space-y-6 border-t border-amber-900/20 pt-8">
                <h3 className="text-sm font-mono font-bold text-amber-950 uppercase tracking-wider">
                  VI. EXECUTION & ELECTRONIC SIGN-OFF
                </h3>

                {/* Only the representative's mobile number is taken. The signer name/title fields, the
                    handwritten-signature preview and the browser-generated "OTP" (no SMS was ever sent;
                    the code was made and checked in the browser) have been removed. */}
                <div className="bg-amber-900/[0.02] border border-amber-900/10 rounded-2xl p-6">
                  <label className="text-xs font-bold text-slate-600 block mb-1 font-mono">Authorized Representative — Mobile Number</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    required
                    maxLength={10}
                    value={signerMobile}
                    onChange={e => setSignerMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10-digit mobile number"
                    className="w-full max-w-sm bg-white border border-amber-900/15 text-sm rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 font-mono"
                  />
                </div>

                <div className="bg-amber-100/40 border border-amber-900/10 text-amber-950 text-xs p-4 rounded-xl flex items-start gap-3">
                  <AlertCircle className="shrink-0 text-amber-800" size={16} />
                  <p className="leading-relaxed">
                    By signing, the brand covenants that ₹{budgetAmount.toLocaleString('en-IN')} INR is fully bonded under Udaipur Court Jurisdictions. Once executed, unilateral cancellations cannot be processed without compliance mediation.
                  </p>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Footer actions */}
        {step === 'agreement' && (
          <div className="p-6 border-t border-amber-900/10 bg-slate-100 flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
              <Lock size={12} /> VERIFIED ELECTRONIC BOND DEED
            </span>
            <button 
              onClick={handleSign}
              disabled={thread.agreement_signed_brand || loading}
              className="px-6 py-3 bg-[var(--violet)] hover:bg-[var(--violet-hover)] disabled:bg-slate-200 disabled:text-slate-400 font-bold rounded-xl text-white transition-all flex items-center gap-2 text-xs font-mono shadow-md"
            >
              <FileSignature size={16} />
              {thread.agreement_signed_brand ? 'DEED EXECUTED' : (loading ? 'EXECUTING...' : 'EXECUTE COLLABORATION AGREEMENT')}
            </button>
          </div>
        )}
      </PopupPanel>
    </PopupBackdrop>
  );
}
