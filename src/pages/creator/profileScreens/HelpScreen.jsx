import React from "react";
import { Link } from "react-router-dom";
import { Shield, FileText, Search, HelpCircle, CreditCard, ChevronDown, MessageSquare } from "lucide-react";
import TicketForm from "../../../components/help/TicketForm";
import SupportContactCard from "../../../components/help/SupportContactCard"; // v334: email + WhatsApp + legal in-app
import { Presence } from "../../../components/common/Popup";


// Session 49 (clean-up): moved out of CreatorMobileProfile.jsx word for word — the "help" screen.
// Everything it needs comes in as props from CreatorMobileProfile; no logic or server call changed.
export default function HelpScreen(props) {
  const { expandedFaqId, helpSearchQuery, isHelpTicketOpen, navigate, renderBackHeader, setExpandedFaqId, setHelpSearchQuery, setIsHelpTicketOpen } = props;

    const helpFaqs = [
      {
        id: "payment",
        q: "When will I receive my payment?",
        a: "The brand pays the full agreed amount into a secure payment hold before you start. Once the brand approves your delivery, Ybex sends your payout to your registered bank account or UPI ID — usually within 1–2 working days. You get the UTR (bank reference) in the chat and in Earnings."
      },
      {
        id: "escrow",
        q: "How does the secure payment hold work?",
        a: "It protects both sides. The brand's money is kept safe before you start working, so payment is assured, and it is released to you after the brand approves your work. A Convenience fee & TDS is deducted; you see it and your payout before you sign."
      },
      {
        id: "kyc_reject",
        q: "Why was my KYC rejected?",
        a: "Common reasons include a name mismatch between your PAN and bank account, blurred or unreadable ID photos, or incorrect IFSC codes. Check your details in KYC settings and resubmit."
      },
      {
        id: "suspension",
        q: "How do I avoid account suspension?",
        a: "Ensure you deliver agreed collaboration briefs on time, keep communication on the platform, and avoid submitting artificial engagement or fake insights."
      }
    ];

    const helpCategories = [
      { id: "payments", name: "Payments & Earnings", icon: CreditCard, color: "text-[#7C3AED] bg-[#F5F0FF]" },
      { id: "campaigns", name: "Campaigns & Deals", icon: FileText, color: "text-[#7C3AED] bg-blue-50" },
      { id: "kyc", name: "Profile & KYC", icon: HelpCircle, color: "text-emerald-600 bg-emerald-50" },
      { id: "trust_safety", name: "Trust & Safety", icon: Shield, color: "text-amber-600 bg-amber-50" }
    ];

    return (
      <div className="min-h-screen bg-white flex flex-col pb-28">
        {renderBackHeader("Help & support")}

        <div className="p-5 space-y-6">
          {/* Search Pill */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search help articles..."
              value={helpSearchQuery}
              onChange={(e) => setHelpSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && helpSearchQuery) {
                  navigate(`/help/category/search?q=${encodeURIComponent(helpSearchQuery)}`);
                }
              }}
              aria-label="Search help articles"
              className="w-full h-[50px] pl-11 pr-4 bg-[#F9F9FB] rounded-full border border-[#E5E5EA] text-[16px] font-semibold text-slate-900 focus:outline-none focus:border-[#7C3AED] shadow-2xs" /* v332: 16px so iPhone doesn't zoom */
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          </div>

          {/* Dark Live Chat Card */}
          <div className="bg-[#0B0B0F] text-white rounded-2xl p-5 shadow-xl flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#7C3AED]/20 text-[#A78BFA] flex items-center justify-center">
                  <MessageSquare size={16} />
                </div>
                <h4 className="text-sm font-black font-display">Contact support</h4>{/* v353: it opens a ticket form, not a live chat */}
              </div>
              <p className="text-xs text-slate-500 font-medium">Send us your question — we reply here</p>
            </div>
            <button
              type="button"
              onClick={() => setIsHelpTicketOpen(true)}
              className="px-4 min-h-10 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-extrabold text-xs rounded-xl shadow-xs transition-all shrink-0" /* v332: 40px tap target */
            >
              Write to us
            </button>
          </div>

          {/* v334 (App Store 1.5 / Play): a direct way to reach Ybex, plus legal pages and Delete account */}
          <SupportContactCard />

          {/* Browse by Category (2x2 Grid) */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Browse by Category
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {helpCategories.map((cat) => {
                const Icon = cat.icon;
                return (
                  <Link
                    key={cat.id}
                    to={`/help/category/${cat.id}`}
                    className="bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl p-4 shadow-2xs flex flex-col justify-between space-y-3 hover:border-[#DDD6FE] transition-colors"
                  >
                    <div className={`p-2.5 rounded-xl w-fit ${cat.color}`}>
                      <Icon size={18} />
                    </div>
                    <span className="text-xs font-black text-slate-900 leading-tight">
                      {cat.name}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Most Asked (FAQ Accordion) */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Most Asked
            </h4>
            <div className="space-y-2">
              {helpFaqs.map((faq) => {
                const isExpanded = expandedFaqId === faq.id;
                return (
                  <div
                    key={faq.id}
                    className="bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl p-4 shadow-2xs space-y-2 transition-all"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedFaqId(isExpanded ? null : faq.id)}
                      className="w-full flex items-center justify-between text-left"
                    >
                      <h5 className="text-xs font-extrabold text-slate-900 pr-2">{faq.q}</h5>
                      <ChevronDown
                        size={16}
                        className={`text-slate-500 shrink-0 transition-transform duration-200 ${
                          isExpanded ? "rotate-180 text-[#7C3AED]" : ""
                        }`}
                      />
                    </button>
                    {isExpanded && (
                      <p className="text-xs text-slate-600 font-medium leading-relaxed pt-2 border-t border-slate-200/60">
                        {faq.a}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <Presence>{isHelpTicketOpen && (
          <TicketForm key="ticketform" onClose={() => setIsHelpTicketOpen(false)} />
        )}</Presence>
      </div>
    );
  
}
