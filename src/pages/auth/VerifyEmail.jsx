import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LogOut, ChevronLeft } from "lucide-react";
import useIsMobile from "../../hooks/useIsMobile";
import { useAuth } from "../../contexts/AuthContext";
import LivePreviewCard from "../../components/onboarding/LivePreviewCard";
import BrandLivePreview from "../../components/Onboarding/BrandLivePreview";
import PreStep_EmailVerify from "../../components/onboarding/PreStep_EmailVerify";
import YbexLogo from "../../components/layout/YbexLogo";
import { useOnboardingStore } from "../../store/useOnboardingStore";

export default function VerifyEmail() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setStep } = useOnboardingStore();

  const roleParam = searchParams.get("role") || user?.role || "creator";
  const isBrand = roleParam.toLowerCase() === "brand";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isMobile = useIsMobile();
  const [confirmLeave, setConfirmLeave] = useState(false); // v425 (A4): Back asks before ending the sign-up

  // Session 41 (Ravi): on phones this page looks like the creator onboarding — one back button,
  // no logo bar and no "Log Out". Back leaves this sign-up (same as Log Out did) and returns to
  // the sign-up page for the same role.
  if (isMobile) {
    const goBack = () => {
      logout();
      navigate(isBrand ? "/signup?role=brand" : "/signup");
    };
    return (
      <div className="min-h-screen flex flex-col bg-[#F2F2F7] text-[var(--text-primary)]" style={{ fontFamily: "'DM Sans', sans-serif", paddingTop: 0 /* Session 43: #root starts below the clock */ }}>
        <div className="px-4 pt-3">
          <button
            type="button"
            onClick={() => setConfirmLeave(true)}
            aria-label="Back"
            data-testid="verify-email-back"
            className="w-10 h-10 rounded-xl bg-white border border-[#E5E5EA] flex items-center justify-center active:scale-95 transition-transform"
          >
            <ChevronLeft size={20} />
          </button>
        </div>
        <div className="flex-1 flex flex-col px-5 pt-6 pb-8">
          <div className="w-full max-w-md mx-auto">
            <PreStep_EmailVerify user={user} />
          </div>
        </div>
        {confirmLeave && (
          <div role="dialog" aria-modal="true" aria-label="Leave sign-up?" onClick={() => setConfirmLeave(false)}
            className="fixed inset-0 z-[90] bg-black/40 flex items-end justify-center">
            <div onClick={(e) => e.stopPropagation()} className="w-full bg-white rounded-t-3xl p-6 pb-[calc(24px+env(safe-area-inset-bottom))]" data-testid="verify-leave-sheet">
              <h2 className="text-lg font-bold text-[#0A0A0A]">Leave sign-up?</h2>
              <p className="mt-1.5 text-sm text-[#6B6B78]">You'll need to log in again to finish.</p>
              <div className="mt-5 flex gap-3">
                <button type="button" onClick={() => setConfirmLeave(false)} data-testid="verify-leave-stay" className="flex-1 h-12 rounded-xl bg-[#7C3AED] text-white font-bold">Stay</button>
                <button type="button" onClick={goBack} data-testid="verify-leave-confirm" className="flex-1 h-12 rounded-xl bg-[#F2F2F7] text-[#0A0A0A] font-bold">Leave</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)] font-sans relative overflow-hidden">
      {/* Header Bar */}
      <header className="w-full px-6 py-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-800 bg-background/50 backdrop-blur-md z-20">
        <Link to="/" className="flex items-center gap-2">
          <YbexLogo size="md" />
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 hover:text-red-600 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-red-200 hover:bg-red-50 transition-all cursor-pointer bg-white shadow-sm"
        >
          <LogOut size={14} /> Log Out
        </button>
      </header>

      {/* Main Split Content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 bg-[var(--bg-base)]">
        {/* Left Panel: Live Preview Card */}
        <div className="hidden lg:flex lg:col-span-7 p-8 flex-col items-center justify-center relative overflow-hidden order-2 lg:order-1 border-r border-gray-100 dark:border-gray-800">
          <div className="w-full max-w-[340px] 2xl:max-w-[380px] relative z-10 -translate-y-2">
            <div className="absolute top-1/4 -left-24 sm:-left-32 xl:-left-44 z-20 flex flex-col items-center transform -rotate-12 pointer-events-none">
              <span 
                className="text-slate-800 dark:text-white font-extrabold text-lg xl:text-xl tracking-wide text-center leading-tight whitespace-nowrap drop-shadow-md"
                style={{ fontFamily: "'Caveat', cursive" }}
              >
                {isBrand ? (
                  <>This is how creators<br/>will see your brand!</>
                ) : (
                  <>This is how brands<br/>will see your profile!</>
                )}
              </span>
              <svg width="50" height="50" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[var(--violet)] mt-2 xl:w-[60px] xl:h-[60px]">
                <path d="M10,20 Q50,90 90,50" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M70,35 L90,50 L75,70" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            {isBrand ? (
              <BrandLivePreview formData={{ companyName: user?.company_name || user?.name || '', logoUrl: user?.picture || user?.logo_url, website: user?.website || '' }} />
            ) : (
              <LivePreviewCard />
            )}
          </div>
        </div>

        {/* Right Panel: Email Verification Form */}
        <div className="lg:col-span-5 flex flex-col justify-center py-12 px-6 lg:px-12 h-full overflow-y-auto order-1 lg:order-2">
          <div className="w-full max-w-sm sm:max-w-md mx-auto">
            <PreStep_EmailVerify user={user} />
          </div>
        </div>

      </div>
    </div>
  );
}

