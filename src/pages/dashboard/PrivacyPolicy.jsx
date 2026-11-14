import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, ChevronLeft } from "lucide-react";
import LegalSections from "../../components/legal/LegalSections";
import { PRIVACY_POLICY, LEGAL_LINKS } from "../../lib/legal/legalContent";

// Session 34: text lives in src/lib/legal/legalContent.js (one source for every legal page).
export default function PrivacyPolicy() {
  const navigate = useNavigate();
  return (
    <>
    {/* Session 43: phone top bar with back (the bottom bar is hidden on policy pages). */}
    <div className="md:hidden sticky top-0 z-20 bg-white border-b border-[#E5E5EA] h-14 px-2 flex items-center gap-1">
      <button type="button" aria-label="Back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))} className="w-10 h-10 rounded-full flex items-center justify-center">
        <ChevronLeft size={20} />
      </button>
      <div className="flex-1 min-w-0 text-[16px] font-bold truncate">{PRIVACY_POLICY.title}</div>
    </div>
    <div className="relative overflow-x-hidden min-h-screen py-6 sm:py-16 px-5 max-w-3xl mx-auto">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-[var(--violet)]/10 rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="relative z-10">
        <div className="flex items-center gap-2 text-[var(--violet)] text-xs font-bold uppercase tracking-wider">
          <ShieldCheck size={16} /> Legal
        </div>
        <h1 className="mt-3 font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-primary)]">{PRIVACY_POLICY.title}</h1>
        <div className="mt-6">
          <LegalSections page={PRIVACY_POLICY} />
        </div>
        <div className="mt-10 pt-6 border-t border-[var(--border-default)] flex flex-wrap gap-4 text-sm font-semibold">
          <Link to={LEGAL_LINKS.terms} className="text-[var(--violet)] hover:underline">Terms of Service</Link>
          <Link to={LEGAL_LINKS.refunds} className="text-[var(--violet)] hover:underline">Refund Policy</Link>
        </div>
      </div>
    </div>
    </>
  );
}
