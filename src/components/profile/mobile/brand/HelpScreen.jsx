import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, CreditCard, FileText, Shield, HelpCircle, ChevronRight, MessageSquare, Ticket } from "lucide-react";
import { supabase } from "../../../../lib/supabase";
import { api } from "../../../../lib/api";
import TicketForm from "../../../help/TicketForm";
import SupportContactCard from "../../../help/SupportContactCard"; // v334: email + WhatsApp + legal in-app
import { MobileScreen, Section, Card, Pill } from "./brandMobileUi";

import { Presence } from "../../../common/Popup";
// Screen 1k — help centre. FAQs come from the same Supabase faq_articles table
// HelpCenter.jsx reads (filtered to brand + shared articles), and the ticket count
// comes from GET support/my-tickets. Categories route into the existing
// /help/category pages.

const CATEGORIES = [
  { id: "payments", name: "Payments & refunds", icon: CreditCard }, // v415: no "secure payment hold" jargon
  { id: "campaigns", name: "Briefs & orders", icon: FileText },
  { id: "kyc", name: "Profile & verification", icon: HelpCircle }, // v415: no "KYC" on brand screens
  { id: "trust_safety", name: "Trust & safety", icon: Shield },
];

export default function HelpScreen({ onBack }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [faqs, setFaqs] = useState([]);
  const [faqsLoading, setFaqsLoading] = useState(Boolean(supabase)); // v415: hold the list's place while it loads
  const [ticketCount, setTicketCount] = useState(null);
  const [ticketFormOpen, setTicketFormOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!supabase) return;
      try {
        // v415: a request that never answers must not keep the skeleton forever
        const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000));
        const { data } = await Promise.race([timeout, supabase
          .from("faq_articles")
          .select("*")
          .eq("is_active", true)
          .in("target_role", ["brand", "both"])
          .order("view_count", { ascending: false })
          .limit(5)]);
        if (!cancelled && Array.isArray(data)) setFaqs(data);
      } catch (e) {
        console.warn("Failed to load FAQs:", e);
      } finally {
        if (!cancelled) setFaqsLoading(false);
      }
    })();

    (async () => {
      try {
        const { data } = await api.get("support/my-tickets").catch(() => ({ data: null }));
        if (!cancelled && Array.isArray(data)) setTicketCount(data.length);
      } catch (e) {
        console.warn("Failed to load tickets:", e);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const runSearch = () => {
    if (query.trim()) navigate(`/help/category/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <MobileScreen title="Help Center" onBack={onBack}>
      <Section>
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Search for articles"
            aria-label="Search help articles" // v332: label + 16px text (iPhone zoomed at 14px)
            enterKeyHint="search"
            className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3.5 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#7C3AED] focus:bg-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          {CATEGORIES.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => navigate(`/help/category/${c.id}`)}
              className="rounded-2xl border border-gray-200 p-4 text-left hover:bg-gray-50"
            >
              <c.icon size={18} className="text-[#7C3AED]" />
              <div className="text-sm font-semibold text-gray-900 mt-2.5 leading-snug">{c.name}</div>
            </button>
          ))}
        </div>
      </Section>

      {faqsLoading && faqs.length === 0 && (
        <Section title="Most asked" className="pt-0">
          <div aria-busy="true" aria-label="Loading articles" className="rounded-2xl bg-white border border-slate-100 overflow-hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`px-4 py-3.5 ${i < 2 ? "border-b border-gray-100" : ""}`}>
                <div className="h-3.5 w-3/4 rounded bg-gray-100 animate-pulse" />
              </div>
            ))}
          </div>
        </Section>
      )}
      {faqs.length > 0 && (
        <Section title="Most asked" className="pt-0">
          <Card>
            {faqs.map((f, idx) => (
              <button
                type="button"
                key={f.id || idx}
                onClick={() => navigate(`/help/category/${f.category || "payments"}?article=${f.id}`)}
                className={`w-full px-4 py-3.5 flex items-center gap-2 text-left hover:bg-gray-50 ${
                  idx !== faqs.length - 1 ? "border-b border-gray-100" : ""
                }`}
              >
                <span className="flex-1 text-sm text-gray-900">{f.title || f.question}</span>
                <ChevronRight size={14} className="text-gray-500 flex-shrink-0" aria-hidden="true" />
              </button>
            ))}
          </Card>
        </Section>
      )}

      <Section title="Still need help?" hint="Support replies within a few hours." className="pt-0 pb-8">
        <button
          type="button"
          onClick={() => setTicketFormOpen(true)}
          className="w-full h-12 rounded-xl bg-[#7C3AED] text-white font-bold text-sm flex items-center justify-center gap-2"
        >
          <MessageSquare size={15} /> Contact support{/* v415: it opens a ticket form, not a live chat */}
        </button>
        <button
          type="button"
          onClick={() => navigate("/help/tickets")}
          className="w-full h-12 mt-2 rounded-xl border border-gray-200 text-gray-900 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-gray-50"
        >
          <Ticket size={15} /> My tickets
          {ticketCount !== null && ticketCount > 0 && <Pill tone="violet">{ticketCount}</Pill>}
        </button>
      </Section>

      {/* v334 (App Store 1.5 / Play): a direct way to reach Ybex, plus legal pages and Delete account */}
      <Section className="pt-0 pb-10">
        <SupportContactCard />
      </Section>

      <Presence>{ticketFormOpen && <TicketForm key="ticketform" onClose={() => setTicketFormOpen(false)} />}</Presence>
    </MobileScreen>
  );
}
