import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import TicketForm from "../../components/help/TicketForm";
import { Search, HelpCircle, FileText, Shield, CreditCard, ChevronRight } from "lucide-react";

import { Presence } from "../../components/common/Popup";
import SupportContactCard from "../../components/help/SupportContactCard"; // v334
export default function HelpCenter() {
  const { user } = useAuth();
  const navigate = useNavigate();
  // v332: agency / admin accounts had no matching tab (and no articles) — brand-type accounts open "For Brands".
  const [activeTab, setActiveTab] = useState(["brand", "agency", "talent_manager"].includes(String(user?.role || "")) ? "brand" : "creator");
  const [searchQuery, setSearchQuery] = useState("");
  const [topFaqs, setTopFaqs] = useState([]);
  const [isTicketFormOpen, setIsTicketFormOpen] = useState(false);
  const [isSuspensionExpanded, setIsSuspensionExpanded] = useState(false);

  useEffect(() => {
    fetchTopFaqs();
  }, [activeTab]);

  const fetchTopFaqs = async () => {
    const { data } = await supabase
      .from("faq_articles")
      .select("*")
      .eq("is_active", true)
      .in("target_role", [activeTab, "both"])
      .order("view_count", { ascending: false })
      .limit(3);
    // v334 (offline app): the top questions are kept on the phone, so Help opens offline with them.
    const key = `ybex_help_top:${activeTab}`;
    if (data) { try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* storage blocked */ } setTopFaqs(data); return; }
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(key) || "null"); } catch { /* ignore */ }
    setTopFaqs(Array.isArray(saved) ? saved : []);
  };

  // v415: brand tab says "Payments & Billing" (a brand has no earnings)
  const categories = [
    { id: "payments", name: activeTab === "brand" ? "Payments & Billing" : "Payments & Earnings", icon: CreditCard, color: "text-[#7C3AED]", bg: "bg-[#EDE9FE]" },
    { id: "campaigns", name: "Campaigns & Deals", icon: FileText, color: "text-[#7C3AED]", bg: "bg-blue-100" },
    { id: "kyc", name: "Profile & KYC", icon: HelpCircle, color: "text-emerald-600", bg: "bg-emerald-100" },
    { id: "trust_safety", name: "Trust & Safety", icon: Shield, color: "text-red-600", bg: "bg-red-100" },
  ];

  return (
    <div className="w-full max-w-none px-4 md:px-8 py-10">
      {/* Header & Search */}
      <div className="text-center mb-12 mt-4">
        <h1 className="text-3xl font-bold mb-4">How can we help you?</h1>
        {/* v415: a real search form (phone "Go"/"Search" key works, label for screen readers, spaces trimmed) */}
        <form role="search" className="relative max-w-xl mx-auto" onSubmit={(e) => {
          e.preventDefault();
          const q = searchQuery.trim();
          if (q) navigate(`/help/category/search?q=${encodeURIComponent(q)}`, { state: { role: activeTab } });
        }}>
          <input
            type="search"
            enterKeyHint="search"
            aria-label="Search help articles"
            placeholder="Search help articles"
            className="w-full pl-12 pr-4 py-3 rounded-full border border-gray-300 bg-white text-base focus:outline-none focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" aria-hidden="true" />
        </form>
      </div>

      {/* Role Tabs */}
      <div className="flex justify-center mb-8">
        <div className="bg-gray-100 p-1 rounded-full inline-flex relative">
          <button
            type="button"
            onClick={() => setActiveTab("creator")}
            className={`relative px-6 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer z-10 ${
              activeTab === "creator" ? "text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {activeTab === "creator" && (
              <motion.div
                layoutId="helpCenterRoleTabPill"
                className="absolute inset-0 bg-white rounded-full shadow-sm z-0"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">For Creators</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("brand")}
            className={`relative px-6 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer z-10 ${
              activeTab === "brand" ? "text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {activeTab === "brand" && (
              <motion.div
                layoutId="helpCenterRoleTabPill"
                className="absolute inset-0 bg-white rounded-full shadow-sm z-0"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">For Brands</span>
          </button>
        </div>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
        {categories?.map((cat, catIdx) => (
          <Link
            key={cat.id || catIdx}
            to={`/help/category/${cat.id}`}
            state={{ role: activeTab }} /* v415: the category opens for the tab you picked */
            className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between group"
          >
            <div className="flex items-center space-x-4">
              <div className={`p-3 rounded-lg ${cat.bg} ${cat.color}`}>
                <cat.icon className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-gray-900">{cat.name}</h3>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-[#7C3AED] transition-colors" />
          </Link>
        ))}
      </div>

      {/* Top FAQs — v415: always shown (the built-in article is always there), so the page doesn't jump when FAQs load */}
      {(
        <div className="mb-12">
          <h2 className="text-xl font-bold mb-4">Most asked questions</h2>
          <div className="space-y-3">
            {topFaqs?.map((faq, faqIdx) => (
              <Link
                key={faq.id || faqIdx}
                to={`/help/category/${faq.category}`}
                state={{ expandedId: faq.id, role: activeTab }}
                className="block bg-white p-4 rounded-lg border border-gray-100 hover:border-[#7C3AED] transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-800">{faq.title}</span>
                  <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-[#7C3AED]" />
                </div>
              </Link>
            ))}
            {/* Hardcoded Article for Account Suspensions */}
            <button
              type="button"
              aria-expanded={isSuspensionExpanded}
              onClick={() => setIsSuspensionExpanded(!isSuspensionExpanded)}
              className="w-full text-left bg-white p-4 rounded-lg border border-gray-100 hover:border-[#7C3AED] transition-colors group"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-800">How to avoid account suspension or deletion</span>
                <ChevronRight className={`w-4 h-4 text-gray-500 group-hover:text-[#7C3AED] transition-transform ${isSuspensionExpanded ? 'rotate-90' : ''}`} />
              </div>
              {isSuspensionExpanded && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-gray-600 text-sm leading-relaxed mb-4">
                    To ensure a safe and trustworthy environment, accounts that violate our Community Guidelines may face suspension or permanent deletion. 
                    During a suspension, your profile, active campaigns, and messaging will be temporarily disabled and hidden from other users.
                  </p>
                  {/* v415: only the part for the tab you're on */}
                  <div className="grid grid-cols-1 gap-6">
                    {activeTab === "brand" && <div>
                      <h4 className="font-bold text-gray-900 mb-2 text-sm">For brands</h4>
                      <ul className="text-sm text-gray-600 space-y-2 list-disc pl-4">
                        <li><strong>Why it happens:</strong> Fake or misleading campaigns, not paying for approved work, abusive behaviour towards creators, or breaking the platform terms.</li>
                        <li><strong>How to avoid it:</strong> Write clear briefs, communicate professionally, and pay for approved work on time.</li>
                        <li><strong>What to do:</strong> Contact support to resolve the issue or complete any pending verification.</li>
                      </ul>
                    </div>}
                    {activeTab !== "brand" && <div>
                      <h4 className="font-bold text-gray-900 mb-2 text-sm">For creators</h4>
                      <ul className="text-sm text-gray-600 space-y-2 list-disc pl-4">
                        <li><strong>Why it happens:</strong> Providing fraudulent analytics, failing to deliver agreed content, plagiarizing UGC, or using inappropriate language in chat.</li>
                        <li><strong>How to avoid:</strong> Always deliver original, high-quality content on time. Be transparent about delays and adhere to brief guidelines.</li>
                        <li><strong>What to do:</strong> You can appeal the decision by submitting a detailed request through the "Contact Support" button on the suspension page.</li>
                      </ul>
                    </div>}
                  </div>
                </div>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Account Suspensions Information */}
      

      {/* Still need help */}
      <div className="bg-[#F2F2F7] rounded-2xl p-8 text-center border border-gray-100">
        <h2 className="text-xl font-bold mb-2">Still need help?</h2>
        <p className="text-gray-600 mb-6">Our support team is here to assist you.</p>
        {/* v332: wraps on small phones; main action on the right; it opens a ticket form, so it no longer says "Chat" */}
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            to="/help/tickets"
            className="bg-white text-gray-700 border border-gray-200 px-6 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            My tickets
          </Link>
          <button
            type="button"
            onClick={() => setIsTicketFormOpen(true)}
            className="bg-[#7C3AED] text-white px-6 py-2.5 rounded-lg font-medium hover:bg-[#6D28D9] transition-colors"
          >
            Contact support
          </button>
        </div>
      </div>

      {/* v334 (App Store "Support URL" = /help): email + WhatsApp visible without logging in */}
      <SupportContactCard className="mt-6 max-w-xl mx-auto" />

      <Presence>{isTicketFormOpen && (
        <TicketForm key="ticketform" onClose={() => setIsTicketFormOpen(false)} />
      )}</Presence>
    </div>
  );
}
