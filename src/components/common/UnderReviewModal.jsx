import React from "react";
import { AnimatePresence } from "framer-motion";
import { Clock, ShieldCheck, Megaphone, User, CheckCircle2, AlertTriangle, ArrowRight, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import useScrollLock from "../../lib/useScrollLock"; // v415

import { PopupBackdrop, PopupPanel } from "../common/Popup";
export default function UnderReviewModal({ isOpen, onClose, user }) {
  const navigate = useNavigate();
  const show = Boolean(isOpen && user && user.profile_status === "under_review");
  // v415: page behind stays still, Escape closes, and the popup fades out (the early return skipped the exit).
  useScrollLock(show);
  React.useEffect(() => {
    if (!show) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, onClose]);

  if (!user) return <AnimatePresence />;

  // Calculate remaining ETA hours based on created_at and stored review_eta_hours
  const etaHoursStored = user.review_eta_hours || 20;
  const createdAtMs = user.created_at ? new Date(user.created_at).getTime() : Date.now();
  const elapsedMs = Date.now() - createdAtMs;
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  const hoursLeft = Math.max(1, Math.ceil(etaHoursStored - elapsedHours));
  // v332: "1 hour" (not "1 hours"), and no frozen "within 1 hours" once the estimate has passed (same as the banner).
  const pastEta = elapsedHours >= etaHoursStored;
  const hoursWord = hoursLeft === 1 ? "hour" : "hours";

  const isBrand = user.role === "brand";

  const handleKycRedirect = () => {
    onClose();
    navigate(isBrand ? "/brand/kyc" : "/creator/kyc");
  };

  const handleCampaignsRedirect = () => {
    onClose();
    navigate(isBrand ? "/brand/campaigns" : "/campaigns");
  };

  const handleSettingsRedirect = () => {
    onClose();
    navigate(isBrand ? "/brand/settings" : "/creator/settings");
  };

  return (
    <AnimatePresence>
      {/* v330: above the bottom nav (both were z-50) and scrolls on short phones so the buttons stay reachable */}
      {show && (
      <PopupBackdrop key="under-review" role="dialog" aria-modal="true" aria-label="Your profile is under review" onClick={onClose} /* v415 */ className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <PopupPanel kind="modal" onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl text-white relative overflow-x-hidden overflow-y-auto max-h-[calc(100vh-32px)] max-h-[calc(100dvh-32px)]"
        >
          {/* Subtle Ambient Background Glow */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-[#7C3AED]/10 rounded-full blur-3xl pointer-events-none" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-10 h-10 flex items-center justify-center text-slate-500 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
            title="Dismiss"
            aria-label="Dismiss"
          >
            <X size={18} />
          </button>

          {/* Top Status Header */}
          <div className="flex items-center gap-3 mb-4 pr-10">{/* v330: clear of the close button */}
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <Clock size={24} />{/* v415: no endless pulse */}
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-bold font-mono tracking-wider uppercase mb-0.5">
                <AlertTriangle size={12} /> Under Review Queue
              </div>
              <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
                Your profile is under review
              </h2>
            </div>
          </div>

          {/* Time Remaining Card */}
          <div className="bg-slate-950/80 border border-amber-500/20 rounded-2xl p-4 mb-6 relative overflow-hidden">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                  Estimated Approval Window
                </p>
                <div className="flex items-baseline gap-2">
                  {pastEta ? (
                    <span className="text-amber-300 font-bold text-lg">Finishing up</span>
                  ) : (<>
                  <span className="font-mono text-3xl md:text-4xl font-black text-amber-400 tracking-tight">
                    {hoursLeft}
                  </span>
                  <span className="text-amber-300 font-bold text-lg">{hoursWord}</span>
                  </>)}
                </div>
              </div>
              {/* v332: removed a made-up "Fast-Track Active" badge (no such feature) */}
            </div>
            <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">
              Our compliance team is verifying your profile registration. {pastEta ? "It should be live very soon." : <>Your profile will be live within <strong className="text-amber-300 font-mono">{hoursLeft} {hoursWord}</strong>.</>}
            </p>
          </div>

          {/* Allowed Actions Section */}
          <div className="space-y-3 mb-6">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-emerald-400" /> What you can do meanwhile
            </h3>

            <div className="grid grid-cols-1 gap-2.5">
              {/* Option 1: KYC */}
              <button
                onClick={handleKycRedirect}
                className="w-full p-3 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-[#7C3AED]/50 rounded-xl flex items-center justify-between transition-all group text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#7C3AED]/10 text-violet-400 flex items-center justify-center shrink-0">
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white group-hover:text-violet-300 transition-colors">
                      Submit KYC Documents
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Upload identity/business documents to remove payout locks
                    </div>
                  </div>
                </div>
                <ArrowRight size={16} className="text-slate-500 group-hover:text-violet-400 group-hover:translate-x-1 transition-all shrink-0" />
              </button>

              {/* Option 2: Explore Campaigns */}
              <button
                onClick={handleCampaignsRedirect}
                className="w-full p-3 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-amber-500/50 rounded-xl flex items-center justify-between transition-all group text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                    <Megaphone size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
                      {isBrand ? "View Campaign Briefs" : "Explore & Save Campaigns"}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {/* v332: brands were told to "browse opportunities & bookmark favorites" (creator copy) */}
                      {isBrand ? "See your campaigns and get them ready" : "Browse live campaign opportunities & bookmark your favorites"}
                    </div>
                  </div>
                </div>
                <ArrowRight size={16} className="text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1 transition-all shrink-0" />
              </button>

              {/* Option 3: Update Profile */}
              <button
                onClick={handleSettingsRedirect}
                className="w-full p-3 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-emerald-500/50 rounded-xl flex items-center justify-between transition-all group text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                    <User size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
                      Refine Profile Details
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Add portfolio links, bio information & rate cards
                    </div>
                  </div>
                </div>
                <ArrowRight size={16} className="text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all shrink-0" />
              </button>
            </div>
          </div>

          {/* Footer Action Buttons */}
          {/* v330: primary (KYC) on the right on wider screens */}
          <div className="flex flex-col sm:flex-row-reverse items-center gap-3 pt-2">
            <button
              onClick={handleKycRedirect}
              className="w-full sm:flex-1 py-3 px-5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#7C3AED] hover:from-[#7C3AED] hover:to-[#7C3AED] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-[#7C3AED]/25 cursor-pointer"
            >
              <ShieldCheck size={16} /> Complete KYC Setup
            </button>
            <button
              onClick={onClose}
              className="w-full sm:w-auto py-3 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-colors cursor-pointer"
            >
              Explore Platform
            </button>
          </div>
        </PopupPanel>
      </PopupBackdrop>
      )}
    </AnimatePresence>
  );
}
