import React from "react";
import { Mail, Trash2 } from "lucide-react";
import { LEGAL, LEGAL_LINKS } from "../../lib/legal/legalContent";
import { BlockedPeopleList } from "../safety/BlockUserButton"; // v337: Blocked people (unblock)
import SocialLogo from "../common/SocialLogo"; // v364: real platform logos

// v334 (App Store 1.5 / Play "contact details"): a real way to reach a person, inside the app, for creators and
// brands. Email + WhatsApp, plus the legal pages and how to delete the account. No server call (layout only).
export const SUPPORT_EMAIL = LEGAL.emails.support;
export const SUPPORT_WHATSAPP = "918764004299"; // same number as the website footer (App.jsx)

export default function SupportContactCard({ className = "", showLegal = true }) {
  const row = "flex items-center gap-3 py-3 min-h-[48px] text-left";
  const link = "text-[13px] font-semibold text-[#7C3AED] hover:underline";
  return (
    <>
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 ${className}`} data-testid="support-contact-card">
      <div className="text-[15px] font-bold text-slate-900">Help &amp; support</div>
      <p className="text-[12.5px] text-slate-500 mt-0.5">Write to us any time — a real person replies, usually within a few hours.</p>
      <div className="mt-2 divide-y divide-slate-100">
        <a href={`mailto:${SUPPORT_EMAIL}`} className={row}>
          <span className="w-9 h-9 rounded-xl bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center shrink-0"><Mail size={17} /></span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold text-slate-900">Email</span>
            <span className="block text-[12.5px] text-slate-500 truncate">{SUPPORT_EMAIL}</span>
          </span>
        </a>
        <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer" className={row}>
          <SocialLogo platform="whatsapp" size={36} variant="tile" />
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold text-slate-900">WhatsApp</span>
            <span className="block text-[12.5px] text-slate-500">+91 87640 04299</span>
          </span>
        </a>
      </div>
      {showLegal && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-2">
          <a href={LEGAL_LINKS.privacy} target="_blank" rel="noopener noreferrer" className={link}>Privacy Policy</a>
          <a href={LEGAL_LINKS.terms} target="_blank" rel="noopener noreferrer" className={link}>Terms</a>
          <a href={LEGAL_LINKS.refunds} target="_blank" rel="noopener noreferrer" className={link}>Refund Policy</a>
          <a href="/delete-account" className={`${link} inline-flex items-center gap-1`}><Trash2 size={13} /> Delete account</a>
        </div>
      )}
    </div>
    <BlockedPeopleList className={`mt-3 ${className.includes("max-w") ? "max-w-xl mx-auto" : ""}`} />
    </>
  );
}
