import React, { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import TicketThread from "../../components/help/TicketThread";
import TicketForm from "../../components/help/TicketForm";
import { ChevronLeft, ChevronRight, Plus, MessageSquare, Clock, AlertCircle, ShoppingBag, Wallet, FileText, BadgeCheck, Shield } from "lucide-react";

import { Presence } from "../../components/common/Popup";
// Session 43 (Ravi): the empty page offers the common answers and one-tap ticket topics.
const HELP_TOPICS = [
  { id: "payments", title: "Payments & payouts", hint: "Payout timing, UTR, fees, invoices", icon: Wallet, bg: "bg-[#F5F0FF]", color: "text-[#7C3AED]" },
  { id: "campaigns", title: "Campaigns & deals", hint: "Offers, contracts, drafts, live links", icon: FileText, bg: "bg-blue-50", color: "text-[#7C3AED]" },
  { id: "kyc", title: "Profile & KYC", hint: "Verification, bank details, profile", icon: BadgeCheck, bg: "bg-emerald-50", color: "text-emerald-600" },
  { id: "trust_safety", title: "Trust & safety", hint: "Report a user, account status", icon: Shield, bg: "bg-red-50", color: "text-red-600" },
];
// v415: brand accounts see brand wording (no "payouts / UTR", no "Payment not received")
const BRAND_TOPIC_HINTS = { payments: { title: "Payments & invoices", hint: "Payments, refunds, invoices" }, campaigns: { hint: "Campaigns, applications, approvals" } };
const BRAND_QUICK_TICKETS = [
  { label: "Payment problem", category: "Payments & Earnings" },
  { label: "Problem with a deal", category: "Campaigns & Deals" },
  { label: "UGC order issue", category: "UGC orders" },
  { label: "Can't log in", category: "Account & Login" },
  { label: "Something else", category: "Other" },
];
const shortTicketCode = (v) => String(v || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase(); // v415: no raw ids
const QUICK_TICKETS = [
  { label: "Payment not received", category: "Payments & Earnings" },
  { label: "Problem with a deal", category: "Campaigns & Deals" },
  { label: "UGC order issue", category: "UGC orders" },
  { label: "Can't log in", category: "Account & Login" },
  { label: "Something else", category: "Other" },
];

export default function HelpTickets() {
  const { user } = useAuth();
  const isBrandSide = ["brand", "agency", "talent_manager"].includes(String(user?.role || "")); // v415
  const topics = isBrandSide ? HELP_TOPICS.map((t) => ({ ...t, ...(BRAND_TOPIC_HINTS[t.id] || {}) })) : HELP_TOPICS;
  const quickTickets = isBrandSide ? BRAND_QUICK_TICKETS : QUICK_TICKETS;
  const { ticketId } = useParams();
  const navigate = useNavigate();
  // v425 (T1): opening a ticket goes to /help/tickets/:id, so the phone's Back button returns to the list.
  const openTicket = (t) => { setSelectedTicket(t); if (t?.ticket_id && t.ticket_id !== ticketId) navigate(`/help/tickets/${t.ticket_id}`); };
  const closeTicket = () => { setSelectedTicket(null); if (ticketId) navigate(-1); };
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [isTicketFormOpen, setIsTicketFormOpen] = useState(false);
  const [formCategory, setFormCategory] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticketId) { setSelectedTicket(null); return; }
    if (tickets.length > 0) {
      const found = tickets.find(t => t.ticket_id === ticketId);
      if (found) {
        setSelectedTicket(found);
      }
    }
  }, [ticketId, tickets]);

  useEffect(() => {
    fetchTickets();
    
    if (user?.user_id) {
      // Session 22: polling our API instead of Supabase realtime.
      const ticketsPoll = setInterval(() => { if (!document.hidden) fetchTickets(); }, 30000);

      return () => {
        clearInterval(ticketsPoll);
      };
    }
  }, [user]);

  // v330: the 30-second refresh no longer swaps the list for a skeleton, and a failed load says so
  // (it used to show "No tickets yet").
  const [loadFailed, setLoadFailed] = useState(false);
  const fetchTickets = async () => {
    try {
      // First try API
      const res = await api.get("/support/my-tickets");
      if (res.data?.tickets) {
        setTickets(res.data.tickets);
        setLoadFailed(false);
        setLoading(false);
        return;
      }
    } catch (e) {
      console.warn("API my-tickets fallback to Supabase:", e);
      setLoadFailed(true);
      setLoading(false);
      return; // keep whatever list is already on screen
    }

    // No direct Supabase fallback any more (session 22) — the table is server-only.
    setTickets([]);
    setLoading(false);
  };
  const statusLabel = (st) => String(st || "").replace(/_/g, " ");
  const ticketDate = (v) => { const d = v ? new Date(v) : null; return d && !isNaN(d.getTime()) ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : ""; };

  const getStatusColor = (status) => {
    switch (status) {
      case "OPEN": return "bg-amber-100 text-amber-900 border border-amber-200";
      case "IN PROGRESS":
      case "IN_PROGRESS": return "bg-blue-100 text-blue-900 border border-blue-200";
      case "RESOLVED": return "bg-emerald-100 text-emerald-900 border border-emerald-200";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case "HIGH": return <AlertCircle className="w-4 h-4 text-orange-500 shrink-0" />;
      case "URGENT": return <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />;
      default: return null;
    }
  };

  const openForm = (category = "") => { setFormCategory(category); setIsTicketFormOpen(true); };

  return (
    <div className="w-full max-w-none h-full bg-[#F2F2F7] md:bg-transparent">
      {/* Session 43 (Ravi): a real top bar joined to the status bar, instead of a link floating
          in the middle of the screen. */}
      <div className="sticky top-0 z-20 bg-white border-b border-[#E5E5EA] md:static md:bg-transparent md:border-0">
        <div className="h-14 px-3 md:px-8 md:pt-8 md:h-auto flex items-center gap-2">
          <Link to="/help" aria-label="Back to Help Center" /* v332: 40px tap target */ className="w-10 h-10 rounded-full flex items-center justify-center text-[#0A0A0A] hover:bg-[#F2F2F7] transition-colors shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="flex-1 min-w-0 text-[17px] md:text-2xl font-bold text-gray-900 truncate">My support tickets</h1>
          <button
            onClick={() => openForm()}
            className="h-10 px-3.5 rounded-full bg-[#7C3AED] text-white text-[13px] font-semibold hover:bg-[#6D28D9] transition-colors flex items-center gap-1 shrink-0"
          >
            <Plus className="w-4 h-4" />
            New ticket{/* v415: clearer than "New" */}
          </button>
        </div>
      </div>

      <div className="px-4 md:px-8 pt-4 pb-10">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`lg:col-span-1 space-y-3 ${selectedTicket ? 'hidden lg:block' : 'block'}`}>
          {loading ? (
            // v415: skeleton about as tall as the empty page, so the footer doesn't jump when it loads
            <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading tickets">
              <div className="h-[152px] bg-white/70 rounded-2xl border border-gray-100" />
              <div className="h-[272px] bg-white/70 rounded-2xl border border-gray-100" />
              <div className="h-[150px] bg-white/70 rounded-2xl border border-gray-100" />
            </div>
          ) : tickets.length === 0 && loadFailed ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center" data-testid="tickets-load-failed">
              <p className="text-[15px] font-semibold text-gray-900">Couldn't load your tickets</p>
              <p className="mt-1 text-[13px] text-gray-500">Please check your connection and try again.</p>
              <button type="button" onClick={() => { setLoading(true); fetchTickets(); }} className="mt-3 h-10 px-4 rounded-xl bg-[#7C3AED] text-white text-sm font-semibold">Try again</button>
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col gap-4" data-testid="tickets-empty">
              <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
                <MessageSquare className="w-10 h-10 text-[#C4B5FD] mx-auto mb-2" />
                <p className="text-[15px] font-semibold text-gray-900">No tickets yet</p>
                <p className="mt-1 text-[13px] text-gray-500">Most questions are answered below. Still stuck? Raise a ticket and our team replies here.</p>
              </div>

              <div>
                <div className="px-1 mb-2 text-[13px] font-semibold text-gray-500">What do you need help with?</div>
                <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
                  {topics.map((t) => (
                    <Link key={t.id} to={`/help/category/${t.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${t.bg}`}><t.icon className={`w-[18px] h-[18px] ${t.color}`} /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-semibold text-gray-900">{t.title}</span>
                        <span className="block text-[12px] text-gray-500 truncate">{t.hint}</span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                    </Link>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="text-[14px] font-semibold text-gray-900">Still need help?</div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {quickTickets.map((q) => (
                    <button key={q.label} type="button" onClick={() => openForm(q.category)}
                      className="min-h-[44px] px-3.5 py-2 rounded-full border border-[#DDD6FE] bg-[#FAF7FF] text-[12.5px] font-semibold text-[#6D28D9] active:scale-[0.98] transition-transform">
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            tickets?.map((ticket, ticketIdx) => {
              const meta = ticket.metadata || {};
              const orderId = ticket.order_id || meta.order_id;
              return (
                <button
                  key={ticket.ticket_id || ticketIdx}
                  onClick={() => openTicket(ticket)}
                  className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
                    selectedTicket?.ticket_id === ticket.ticket_id
                      ? "bg-[#F5F0FF]/80 border-[#7C3AED] shadow-sm"
                      : "bg-white border-gray-200 hover:border-[#7C3AED]"
                  }`}
                >
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${getStatusColor(ticket.status)}`}>
                      {statusLabel(ticket.status)}
                    </span>
                    <div className="flex items-center gap-1">
                      {getPriorityIcon(ticket.priority)}
                      <span className="text-[10px] font-mono font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        #{shortTicketCode(ticket.ticket_id)}
                      </span>
                    </div>
                  </div>

                  <h3 className="font-bold text-gray-900 text-sm mb-1 truncate">{ticket.subject}</h3>
                  
                  {orderId && (
                    <div className="flex items-center gap-1 text-[11px] font-medium text-[#6D28D9] bg-[#F5F0FF] border border-[#DDD6FE] px-2 py-0.5 rounded-md mb-2 w-fit">
                      <ShoppingBag size={12} className="shrink-0 text-[#7C3AED]" />
                      <span className="truncate max-w-[200px]">Order #{shortTicketCode(orderId)}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="truncate max-w-[120px] font-medium capitalize">{String(ticket.category || "").replace(/_/g, " ")}</span>
                    <span className="flex items-center">
                      <Clock className="w-3 h-3 mr-1 text-gray-500" />
                      {ticketDate(ticket.created_at)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className={`lg:col-span-2 ${!selectedTicket ? 'hidden lg:flex items-center justify-center bg-gray-50 rounded-xl border border-gray-100 min-h-[400px]' : 'block'}`}>
          {selectedTicket ? (
            <TicketThread ticket={selectedTicket} onBack={closeTicket} />
          ) : (
            <div className="text-center text-gray-500">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{tickets.length === 0 && !loading ? "Your conversations with our support team will appear here." : "Select a ticket to view the conversation"}</p>{/* v415: no "select a ticket" when there are none */}
            </div>
          )}
        </div>
      </div>

      </div>
      <Presence>{isTicketFormOpen && (
        <TicketForm key="ticketform" defaultCategory={formCategory}
          onCreated={() => fetchTickets() /* v425 (T5): only reload when a ticket was really sent */}
          onClose={() => setIsTicketFormOpen(false)} 
        />
      )}</Presence>
    </div>
  );
}
