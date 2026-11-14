import { HiwSectionHelp } from "../whatsNew/WhatsNewPopup"; // v437: How it works button / popup / reminder
import { useAuth } from "../../contexts/AuthContext";
import React, { useState, useMemo, useEffect } from "react";
import BrandRefundsCard, { RefundAccountForm } from "./BrandRefundsCard";
import { api } from "../../lib/api";
import { Check, Copy, ShieldCheck, X, ChevronLeft, Download, Lock, FileText, RotateCcw, HelpCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import InvoiceModal from "./InvoiceModal";
import PaymentsRetryCard from "../common/PaymentsRetryCard";

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
// Session 33: the escrow sheet sent every payment (campaign too) to the UGC page. A UGC payment
// opens Manage UGC orders; a campaign payment opens its deal chat (approve / changes live there).
export function reviewTargetFor(item) {
  const tx = item?.rawObj || item || {};
  if (tx.ugc_order_id || tx.order_id) return "/brand/ugc/orders";
  const thread = tx.thread_id || tx.contract_id || tx.deal_id;
  return thread ? `/brand/inbox?thread=${encodeURIComponent(thread)}` : "/brand/inbox";
}

// v416 (QA U1/U3): numbers + receipt fields from GET /brand/payments-overview — shared by the desktop page and this
// phone screen so both show the same money. Reads B2's new fields (held_now / released_total / refunded_total,
// brand_paid_amount / fee / gst / payee) and falls back to the older ones (in_escrow, amount, who).
const n0 = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const firstDefined = (...v) => v.find((x) => x !== undefined && x !== null && x !== "");
export function paymentsSummary(overview) {
  if (!overview || typeof overview !== "object") return null;
  const s = overview.summary || {};
  const items = Array.isArray(overview.items) ? overview.items : [];
  const refunds = Array.isArray(overview.refunds) ? overview.refunds : [];
  const held = n0(firstDefined(s.held_now, s.in_escrow));
  const released = firstDefined(s.released_total, s.released_to_creators) !== undefined
    ? n0(firstDefined(s.released_total, s.released_to_creators))
    : items.some((i) => typeof i.released === "number")
      ? items.reduce((a, i) => a + n0(i.released), 0) // per-row released (part of a UGC brief can be released)
      : items.filter((i) => i.status === "released").reduce((a, i) => a + n0(firstDefined(i.deal_amount, i.gross_amount, i.amount)), 0);
  const refunded = s.refunded_total !== undefined && s.refunded_total !== null
    ? n0(s.refunded_total)
    : refunds.filter((r) => String(r.status || "").toLowerCase() === "refunded" || String(r.status || "").toUpperCase() === "PROCESSED").reduce((a, r) => a + n0(r.amount), 0);
  const activeCampaign = n0(s.active_campaign), activeUgc = n0(s.active_ugc);
  return {
    held, released, refunded,
    refundWaiting: n0(s.refund_waiting),
    hasRefundAccount: Boolean(s.has_refund_account),
    activeLine: [activeCampaign ? `${activeCampaign} campaign` : null, activeUgc ? `${activeUgc} UGC` : null].filter(Boolean).join(" · ") || "None",
  };
}
// v416: fallback list (no overview) — refunded rows only
const brandFeedRefunded = (txs) => (txs || []).filter((t) => String(t?.status || "").toLowerCase() === "refunded").reduce((a, t) => a + n0(t.gross_amount || t.amount), 0);
/** v416 (QA U3/U17): one overview row → the fields InvoiceModal / the PDF read (deal amount, fee, GST, total paid, payee). */
export function overviewItemToTx(it) {
  if (!it) return null;
  const paid = n0(firstDefined(it.brand_paid_amount, it.total_paid, it.amount));
  const fee = firstDefined(it.brand_fee_amount, it.service_fee, it.fee_amount, it.fee);
  const gst = firstDefined(it.brand_fee_gst, it.fee_gst, it.gst_amount, it.gst);
  const deal = n0(firstDefined(it.deal_amount, it.gross_amount, it.creator_amount))
    || (fee != null || gst != null ? Math.max(0, paid - n0(fee) - n0(gst)) : paid);
  const pct = firstDefined(it.brand_fee_pct, it.service_fee_pct, it.fee_pct);
  return {
    brand_gstin: it.brand_gstin || null, // v418
    id: it.transaction_id || it.id, deal_id: it.deal_id || null, // v416: the payment's own id on the receipt
    ugc_order_id: it.kind === "ugc" ? (it.brief_id || it.id) : null, order_type: it.kind === "ugc" ? "ugc" : "campaign",
    gross_amount: deal, amount: deal,
    brand_paid_amount: paid > deal ? paid : null,
    brand_fee_amount: fee != null ? n0(fee) : (paid > deal ? paid - deal : null),
    brand_fee_gst: gst != null ? n0(gst) : null,
    brand_fee_pct: pct != null ? n0(pct) : null,
    coupon_code: it.coupon_code || null,
    created_at: it.date || it.created_at || null,
    campaign_title: it.title || null,
    creator_name: firstDefined(it.payee, it.payee_name, it.who) || null,
    order_id: it.order_id || null, payment_id: it.payment_id || it.razorpay_payment_id || null,
  };
}

export default function BrandPaymentsMobile({
  activeEscrowAmount = 0,
  settledPayoutsAmount = 0,
  activeProtectionsCount = 0,
  past28DaysFunded = 0,
  growthPercent = null,
  transactions = [],
  companyName = "",
  gstin = "",
  onBack = null,
  listFailed = false, // v332: the page's escrow-transactions read failed
  onRetryList = null,
  listLoading = false, // v415: the page is still reading the older list (fallback when the overview fails)
  overview: overviewProp, // v416 (QA U1): the desktop page passes the same overview it shows (undefined = load here)
  onReloadOverview = null,
}) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'escrow' | 'released' | 'refunded'
  const [selectedEscrowTx, setSelectedEscrowTx] = useState(null);
  const [selectedGstTx, setSelectedGstTx] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(null);
  const [ownOverview, setOwnOverview] = useState(null); // Session 57: GET /brand/payments-overview (backend/brandPayments.ts)
  const [showRefundAccount, setShowRefundAccount] = useState(false);
  const controlled = overviewProp !== undefined; // v416: one read for the whole page
  const overview = controlled ? overviewProp : ownOverview;

  const loadOverview = () => {
    if (controlled) return Promise.resolve(onReloadOverview ? onReloadOverview() : null);
    return api.get("brand/payments-overview", { bypassCache: true })
      .then(({ data }) => setOwnOverview(data?.ok ? data : false))
      .catch(() => setOwnOverview(false));
  };
  useEffect(() => { if (!controlled) loadOverview(); }, [controlled]); // eslint-disable-line react-hooks/exhaustive-deps

  const { isKycApproved: kycOk } = useAuth() || {};
  const hasRealGstin = Boolean(
    gstin && 
    typeof gstin === "string" && 
    gstin.trim().length >= 8 && 
    !gstin.includes("1234F1Z5") && 
    gstin.toUpperCase() !== "N/A"
  );

  // Normalize into one feed. Session 57: the server overview (campaign deals + UGC briefs + refunds) when it
  // loads; otherwise the older escrow-transactions list from the page.
  const brandFeed = useMemo(() => {
    const list = [];
    if (overview && Array.isArray(overview.items)) {
      overview.items.forEach((it) => {
        const tx = overviewItemToTx(it); // v416 (QA U3): fee / GST / total paid for the receipt
        list.push({
          id: it.id,
          kind: it.kind,
          dealId: String(it.deal_id || it.brief_id || it.id || "").slice(-7) || "—",
          title: it.title,
          creatorName: tx.creator_name || it.who,
          amount: Number(it.amount || 0),
          type: it.status,
          heldAmount: typeof it.held === "number" ? it.held : null, // v416 (QA U2): what is still held (part may be released / refunded)
          detail: it.detail || null,
          statusLabel: it.status === "released" ? "Released to creator" : it.status === "cancelled" ? "Cancelled · refunded to you" : "In escrow",
          razorpayId: it.payment_id || it.order_id || "—",
          grossAmount: Number(tx.brand_paid_amount || it.amount || 0), // v416 (QA U3): total paid incl. fee + GST
          feeAmount: it.kind === "campaign" ? Number(it.fee || 0) : null,
          gstAmount: it.kind === "campaign" ? Number(it.gst || 0) : null,
          creatorNet: it.kind === "campaign" ? Number(it.creator_net || 0) : null,
          date: it.date,
          rawObj: tx, // v416 (QA U3): was gross only — the receipt lost the fee + GST the brand paid
        });
      });
      (overview.refunds || []).forEach((r) => {
        list.push({
          id: r.id, kind: r.kind, title: r.title, creatorName: r.reason || "", amount: Number(r.amount || 0),
          type: "refunded", refundStatus: r.status, utr: r.utr, failure: r.failure, date: r.date, rawObj: r,
        });
      });
      return list;
    }

    (transactions || []).forEach((tx) => {
      const isPaid = tx.status === "released" || tx.payout_status === "PAID" || tx.payout_status === "RELEASED" || Boolean(tx.payout_reference || tx.utr_number);
      const isRefunded = tx.status === "refunded" || tx.status === "REFUNDED";
      // v358: failed / cancelled / unpaid rows were all labelled "In escrow"
      const st = String(tx.status || "").toLowerCase();
      const isFailed = /^(fail|cancel|expire)/.test(st);
      const isUnpaid = st === "pending" || st === "created" || st === "initiated";

      list.push({
        id: tx.id || tx.transaction_id || tx.contract_id,
        kind: tx.ugc_order_id ? "ugc" : "campaign",
        dealId: String(tx.contract_id || tx.deal_id || tx.ugc_order_id || tx.id || "").slice(-7) || "—",
        title: tx.campaign_title || tx.deliverable_type || (tx.brief && tx.brief.title) || (tx.ugc_order_id ? "UGC order" : "Campaign payment"),
        creatorName: (tx.creator_name !== "Creator Pro" ? tx.creator_name : "") || (tx.users && tx.users.name) || (tx.creator && tx.creator.name) || "Creator",
        amount: Number(tx.gross_amount || tx.amount || 0),
        type: isPaid ? "released" : isRefunded ? "refunded" : (isFailed || isUnpaid) ? "other" : "escrow",
        refundStatus: isRefunded ? "refunded" : null,
        statusLabel: isPaid ? "Released to creator" : isRefunded ? "Refunded to source" : isFailed ? "Payment not completed" : isUnpaid ? "Awaiting payment" : "In escrow",
        razorpayId: tx.razorpay_payment_id || tx.payout_reference || tx.utr_number || "—",
        // Server numbers for the receipt (session 23: it used to assume a 5% fee).
        grossAmount: Number(tx.gross_amount || tx.amount || 0),
        feeAmount: tx.platform_fee_amount != null ? Number(tx.platform_fee_amount) : null,
        gstAmount: tx.gst_amount != null ? Number(tx.gst_amount) : null,
        creatorNet: tx.creator_net_amount != null ? Number(tx.creator_net_amount) : null,
        date: tx.created_at || null, // v332: a missing date showed as today's date
        rawObj: tx
      });
    });

    return list;
  }, [transactions, overview]);

  // Tab counts
  const countEscrow = brandFeed.filter((i) => i.type === "escrow").length;
  const countReleased = brandFeed.filter((i) => i.type === "released").length;
  const countRefunded = brandFeed.filter((i) => i.type === "refunded").length;

  const filteredFeed = useMemo(() => {
    if (activeTab === "escrow") return brandFeed.filter((i) => i.type === "escrow");
    if (activeTab === "released") return brandFeed.filter((i) => i.type === "released");
    if (activeTab === "refunded") return brandFeed.filter((i) => i.type === "refunded");
    return brandFeed;
  }, [brandFeed, activeTab]);

  // v330: no false "Copied" when the clipboard is missing/blocked (older WebView / iOS PWA).
  const copyToClipboard = (text) => {
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .then(() => toast.success("Copied to clipboard!"))
      .catch(() => toast.error("Couldn't copy. Long-press the ID to copy it."));
  };

  // v416 (QA U1): "Released this year" showed spent_this_year (held money included). Now: in escrow / released to
  // creators / refunded, the same numbers the desktop page shows.
  const sum = overview && overview.summary ? paymentsSummary(overview) : null;
  const inEscrow = sum ? sum.held : Number(activeEscrowAmount || 0);
  const releasedTotal = sum ? sum.released : Number(settledPayoutsAmount || 0);
  const refundedTotal = sum ? sum.refunded : brandFeedRefunded(transactions);
  const activeLine = sum ? sum.activeLine : `${activeProtectionsCount || 0} active`;
  const refundWaiting = sum ? sum.refundWaiting : 0;
  const needsRefundAccount = sum ? !sum.hasRefundAccount : false;
  const isFirstTime = overview !== null && brandFeed.length === 0;
  const inr = (n) => `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;
  const when = (d) => { const x = d ? new Date(d) : null; return x && !Number.isNaN(x.getTime()) ? x.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" /* v330: IST */ }) : ""; };
  // v358: the creator really delivered (same test as the "deliverable submitted" tick)
  const escrowDelivered = (tx) => /(review|approved|delivered)/i.test(String(tx?.detail || "")) && !/^0 of/.test(String(tx?.detail || ""));
  const PILL = {
    escrow: { label: "In escrow", color: "#B45309", bg: "#FFF7E6" },
    released: { label: "Released", color: "#0E7A55", bg: "#E3F7EE" },
    refunded: { label: "Refunded", color: "#1D4ED8", bg: "#EAF1FF" },
    cancelled: { label: "Cancelled", color: "#4B5563", bg: "#F3F4F6" },
    pending: { label: "On hold", color: "#B45309", bg: "#FFF7E6" },
    failed: { label: "Failed", color: "#B91C1C", bg: "#FEECEC" },
    other: { label: "Not paid", color: "#4B5563", bg: "#F3F4F6" }, // v358: failed / unpaid rows (were "In escrow")
  };
  const downloadStatement = () => {
    const rows = [["Date", "Type", "Title", "Creator", "Status", "Amount", "Reference"]];
    [...brandFeed].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0)).forEach((i) => {
      rows.push([when(i.date), i.type === "refunded" ? "Refund" : (i.kind || "").toUpperCase(), i.title, i.creatorName || "", i.type === "refunded" ? (i.refundStatus || "refunded") : i.type, i.amount, i.utr || (i.razorpayId !== "—" ? i.razorpayId : "")]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    try {
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = "ybex-payments-statement.csv"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch { toast.error("Couldn't download the statement."); }
  };
  // v332 (Ravi): both reads failed → calm "Try again" card, not the first-time screen / "No payments here yet".
  const showRetry = overview === false && listFailed && !listLoading;
  // v415: one skeleton until the numbers are known — the hero, refund-account card and list used to appear one
  // after another and push each other down (CLS 0.11–0.2).
  const showSkeleton = !showRetry && (overview === null || (overview === false && listLoading));
  const retryAll = () => Promise.all([loadOverview(), onRetryList ? onRetryList() : null]);
  const tabs = [["all", "All", brandFeed.length], ["escrow", "Escrow", countEscrow], ["released", "Released", countReleased], ["refunded", "Refunds", countRefunded]];

  return (
    <div className="w-full bg-[#F4F4F8] flex flex-col pb-3" data-testid="brand-payments-mobile">
      {/* Session 57 — Ravi's Money screens design (BP-01 / 01b / 02). "Payouts" is now "Payments". */}
      <header data-statusbar="#FFFFFF" className="bg-white border-b border-[#ECEAF1] px-4 pt-2 pb-3 sticky top-0 z-20 flex flex-wrap items-center gap-3">{/* v396 (QA S-1): wraps at large text instead of the title running into Help */}
        {onBack && (
          <button onClick={onBack} type="button" className="w-10 h-10 rounded-full bg-[#F2F0F6] flex items-center justify-center text-[#0A0A0A] shrink-0" aria-label="Back">
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2"><h1 className="text-[20px] font-extrabold tracking-[-0.3px] text-[#0A0A0A] leading-tight break-words">Payments</h1></div>
          {hasRealGstin ? (
            <div className={`text-[11.5px] font-semibold mt-px truncate ${kycOk ? "text-[#0E9F6E]" : "text-[#6B6880]"}`}>{kycOk ? "GSTIN verified" : "GSTIN (KYC in review)"} · {gstin}{/* v419 (QA): said "verified" while KYC was pending */}</div>
          ) : null}
        </div>
        <HiwSectionHelp section="payments" role="brand" label="Guide" />
        <button type="button" onClick={() => navigate("/help/tickets")} className="h-10 px-3 rounded-full border border-[#E6E3EE] bg-white text-[13px] font-semibold text-[#0A0A0A] flex items-center gap-1.5 shrink-0">
          <HelpCircle className="w-4 h-4" />Help
        </button>
      </header>

      {showRetry ? (
        <div className="px-4 pt-6"><PaymentsRetryCard onRetry={retryAll} /></div>
      ) : showSkeleton ? (
        <div className="px-4 pt-4 flex flex-col gap-3 animate-pulse" aria-busy="true" data-testid="brand-payments-mobile-skeleton">
          <div className="h-[214px] rounded-[22px] bg-[#E6DDF7]" />
          <div className="grid grid-cols-2 gap-2.5"><div className="h-11 rounded-[14px] bg-[#E9E6F0]" /><div className="h-11 rounded-[14px] bg-[#EFEDF3]" /></div>
          <div className="h-5 w-24 rounded bg-[#E9E6F0] mt-1" />
          <div className="h-11 rounded-[14px] bg-[#E9E6F0]" />
          {[0, 1, 2].map((i) => <div key={i} className="h-[92px] rounded-[16px] bg-white border border-[#EEEDF3]" />)}
        </div>
      ) : (
      <div className="px-4 pt-4 flex flex-col gap-3">
        {isFirstTime ? (
          /* BP-02 · first time */
          <div className="rounded-[22px] p-5 bg-[#F6F0FF] border border-[#E6D8FF]">
            <div className="w-11 h-11 rounded-[13px] bg-white flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-[#7C3AED]" /></div>
            <div className="text-[21px] font-extrabold text-[#0A0A0A] leading-tight mt-3">Pay creators safely with escrow</div>
            <div className="text-[13.5px] text-[#5E5873] mt-1.5 leading-relaxed">You pay when you hire. The money stays locked with Ybex and goes to the creator only after you approve their work.</div>
            <button type="button" onClick={() => navigate("/brand/ugc/post")} className="mt-4 w-full h-12 rounded-[14px] bg-[#7C3AED] text-white text-[15px] font-bold flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" />Post a UGC brief</button>
            <button type="button" onClick={() => navigate("/brand/campaigns/create")} className="mt-2.5 w-full h-12 rounded-[14px] bg-white border border-[#E2DFEA] text-[#5B16C9] text-[15px] font-bold">Create a campaign</button>
          </div>
        ) : (
          /* BP-01 · hero */
          <div className="rounded-[22px] p-5 text-white shadow-[0_14px_30px_rgba(91,0,200,.22)]" style={{ background: "linear-gradient(160deg,#8B2CF5 0%,#6A1FD8 55%,#4C12A8 100%)" }}>
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#E9DBFF]"><Lock className="w-3.5 h-3.5" />In escrow</div>
            <div className="text-[36px] font-extrabold tracking-[-1px] leading-tight mt-1" data-testid="brand-payments-escrow">{inr(inEscrow)}</div>
            <div className="text-[12.5px] text-[#EBDDFF]">Locked with Ybex. Released to creators only when you approve.</div>
            <div className="grid grid-cols-2 gap-2.5 mt-4">{/* v416 (QA U1): same three numbers as desktop */}
              <div className="rounded-[14px] bg-white/[.14] p-3 min-w-0">
                <div className="text-[11.5px] text-[#E9DBFF]">Released to creators</div>
                <div className="text-[17px] font-extrabold mt-0.5 break-words leading-tight" data-testid="brand-payments-released">{inr(releasedTotal)}</div>
              </div>
              <div className="rounded-[14px] bg-white/[.14] p-3 min-w-0">
                <div className="text-[11.5px] text-[#E9DBFF]">Refunded to you</div>
                <div className="text-[17px] font-extrabold mt-0.5 break-words leading-tight" data-testid="brand-payments-refunded">{inr(refundedTotal)}</div>
              </div>
            </div>
            <div className="text-[12px] text-[#EBDDFF] mt-2.5">Active deals: <span className="font-bold text-white">{activeLine}</span></div>
          </div>
        )}

        {/* Refund account — asked for before a refund gets stuck */}
        {needsRefundAccount && (
          <div className={`rounded-[18px] p-3.5 flex items-center gap-3 border ${refundWaiting > 0 ? "bg-[#FFF8EB] border-[#FBE3B5]" : "bg-white border-[#EEEDF3]"}`}>
            <div className="w-9 h-9 rounded-[11px] bg-[#FDEBC8] flex items-center justify-center shrink-0"><RotateCcw className="w-4 h-4 text-[#B45309]" /></div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold text-[#0A0A0A]">{refundWaiting > 0 ? "Add a refund account" : "Set up refund account"}</div>
              <div className="text-[12px] text-[#6B7280] mt-px">{refundWaiting > 0 ? `${inr(refundWaiting)} refund is waiting. We can't send it without one.` : "Do it now so refunds never get stuck."}</div>
            </div>
            <button type="button" onClick={() => setShowRefundAccount(true)} className={`h-9 px-4 rounded-full text-[13px] font-bold shrink-0 ${refundWaiting > 0 ? "bg-[#B45309] text-white" : "bg-[#7C3AED] text-white"}`}>Add</button>
          </div>
        )}

        {!isFirstTime && (
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={() => navigate("/brand/ugc/post")} className="h-11 rounded-[14px] bg-[#7C3AED] text-white text-[14px] font-bold flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" />Post a brief</button>
            <button type="button" onClick={() => navigate("/brand/campaigns/create")} className="h-11 rounded-[14px] bg-white border border-[#E2DFEA] text-[#5B16C9] text-[14px] font-bold">Create campaign</button>
          </div>
        )}

        {isFirstTime ? (
          <div className="bg-white rounded-[20px] p-5 border border-[#EEEDF3]">
            <div className="text-[15px] font-extrabold text-[#0A0A0A]">What happens to your money</div>
            <div className="mt-3.5 flex flex-col gap-3.5">
              {[["You hire and pay", "Shows here as In escrow, with a GST invoice."], ["You approve the work", "Money is Released to the creator."], ["Deadline missed?", "You get a full Refund to your refund account."]].map(([t, d], i) => (
                <div key={t} className="flex gap-3 items-start">
                  <div className="w-[26px] h-[26px] rounded-full bg-[#F2EAFF] text-[#7C3AED] text-[13px] font-extrabold flex items-center justify-center shrink-0">{i + 1}</div>
                  <div><div className="text-[14px] font-bold text-[#0A0A0A]">{t}</div><div className="text-[12px] text-[#6B7280] mt-px">{d}</div></div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* HISTORY */}
            <div className="flex items-center justify-between px-1 mt-1">
              <div className="text-[16px] font-extrabold text-[#0A0A0A]">History</div>
              <button type="button" onClick={downloadStatement} className="text-[13px] font-bold text-[#7C3AED] flex items-center gap-1 min-h-[36px] px-2 -mx-2" /* v396 (QA S-3): bigger tap area */><Download className="w-3.5 h-3.5" />Statement</button>
            </div>
            <div className="grid grid-cols-4 bg-[#E9E6F0] rounded-[14px] p-1 gap-1" role="tablist">
              {tabs.map(([id, label, n]) => (
                <button key={id} type="button" role="tab" aria-selected={activeTab === id} onClick={() => setActiveTab(id)}
                  className={`h-9 px-1 truncate rounded-[10px] text-[12px] font-bold ${activeTab === id ? "bg-white text-[#0A0A0A] shadow-[0_1px_3px_rgba(20,17,28,.12)]" : "text-[#6B7280]"}`}>
                  {n ? `${label} ${n}` : label}
                </button>
              ))}
            </div>

            {filteredFeed.length === 0 && overview === null ? (
              /* v330: while the overview loads the list said "No payments here yet" for a moment. */
              <div className="bg-white rounded-[16px] border border-[#EEEDF3] p-7 text-center text-[13.5px] text-[#6B7280]">Loading payments…</div>
            ) : filteredFeed.length === 0 ? (
              <div className="bg-white rounded-[16px] border border-[#EEEDF3] p-7 text-center text-[13.5px] text-[#6B7280]">No payments here yet</div>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredFeed.map((item) => {
                  const isRefund = item.type === "refunded";
                  const p = isRefund ? (PILL[item.refundStatus] || PILL.refunded) : PILL[item.type] || PILL.escrow;
                  const detail = isRefund
                    ? (item.refundStatus === "refunded" ? `Refunded ${when(item.date)}${item.utr ? ` · UTR ${item.utr}` : ""}` : item.refundStatus === "failed" ? (item.failure || "Transfer failed — check your refund account") : needsRefundAccount ? "Waiting for refund account" : "Refund on its way")
                    : item.type === "released" ? `Released ${when(item.date)}` : item.type === "cancelled" ? "Cancelled — unused money comes back to you (see Refunds)" : item.type === "other" ? item.statusLabel : (item.detail || "In escrow");
                  const open = () => {
                    if (isRefund) return;
                    if (item.type === "other") return; // v358: nothing was paid — no receipt / escrow sheet
                    if (item.type === "escrow") setSelectedEscrowTx(item); else setSelectedGstTx(item);
                  };
                  return (
                    <div key={`${item.type}-${item.id}`} className="bg-white rounded-[16px] border border-[#EEEDF3] px-3.5 py-3" data-testid={`brand-pay-row-${item.type}`}>
                      <button type="button" onClick={open} className="w-full flex items-center gap-3 text-left">
                        <div className={`w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 text-[15px] font-extrabold ${isRefund ? "bg-[#EAF1FF] text-[#1D4ED8]" : "bg-[#F2EAFF] text-[#7C3AED]"}`}>
                          {isRefund ? <RotateCcw className="w-4 h-4" /> : String(item.title || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-bold text-[#0A0A0A] truncate">{item.title}</div>
                          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                            {item.creatorName ? <span className="text-[12px] text-[#6B7280] truncate">{item.creatorName}</span> : null}
                            {item.kind ? <span className="text-[11px] font-extrabold tracking-[0.6px] px-1.5 py-[1px] rounded-[5px] bg-[#F2F0F6] text-[#6B7280] shrink-0">{item.kind === "ugc" ? "UGC" : "CAMPAIGN"}</span> : null}
                          </div>
                        </div>
                        <div className={`text-[15px] font-extrabold shrink-0 ${isRefund ? "text-[#1D4ED8]" : "text-[#0A0A0A]"}`}>{isRefund ? "+" : ""}{inr(item.amount)}</div>
                      </button>
                      <div className="flex items-center justify-between gap-2 mt-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-2 py-0.5 rounded-[8px] text-[11px] font-bold shrink-0" style={{ color: p.color, background: p.bg }}>{p.label}</span>
                          <span className="text-[11.5px] text-[#6B7280] truncate">{detail}</span>
                        </div>
                        {!isRefund && (
                          <button type="button" onClick={() => setShowInvoiceModal(item.rawObj || item)} className="text-[12px] font-bold text-[#7C3AED] flex items-center gap-1 shrink-0 min-h-[36px] px-2 -mr-2" /* v396 (QA S-3) */><FileText className="w-3.5 h-3.5" />Invoice</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        <button type="button" onClick={() => navigate("/help/tickets")} className="bg-white rounded-[18px] p-3.5 flex items-center gap-3 text-left border border-[#EEEDF3]">
          <div className="w-9 h-9 rounded-full bg-[#F2F0F6] flex items-center justify-center shrink-0"><HelpCircle className="w-4 h-4 text-[#6B7280]" /></div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold text-[#0A0A0A]">{isFirstTime ? "How does escrow work?" : "Problem with a payment or refund?"}</div>
            <div className="text-[12px] text-[#6B7280]">Chat with Ybex finance support</div>
          </div>
          <span className="text-[13px] font-bold text-[#7C3AED] shrink-0">Get help</span>
        </button>

        {/* fallback for the old refunds list when the overview can't load */}
        {overview === false && <BrandRefundsCard />}
      </div>
      )}

      {/* Refund account sheet */}
      <Presence>{showRefundAccount && (
        <PopupBackdrop className="fixed inset-0 z-50 bg-slate-900/50 flex flex-col justify-end">
          {/* v332: the three sheets below clear the iPhone home bar (safe-area padding) */}
          <PopupPanel kind="sheet" onClose={() => setShowRefundAccount(false)} className="bg-white rounded-t-[24px] p-5 max-h-[88vh] overflow-y-auto shadow-2xl" style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}>
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-1">
              <div className="text-[19px] font-extrabold text-[#0A0A0A]">Add refund account</div>
              <button type="button" aria-label="Close" onClick={() => setShowRefundAccount(false)} className="w-10 h-10 rounded-full bg-[#F2F0F6] flex items-center justify-center"><X className="w-4 h-4 text-[#6B7280]" /></button>
            </div>
            <div className="text-[13px] text-[#6B7280] mb-4">Refunds for campaigns and UGC briefs are sent here.</div>
            <RefundAccountForm onSaved={() => { setShowRefundAccount(false); loadOverview(); }} />
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* SCREEN 02: BRAND ESCROW PROTECTION & DECISION SHEET */}
      <Presence>{selectedEscrowTx && (
        <PopupBackdrop className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex flex-col justify-end">
          <PopupPanel kind="sheet" onClose={() => setSelectedEscrowTx(null)} className="bg-white rounded-t-[24px] p-5 max-h-[85vh] overflow-y-auto shadow-2xl" style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}>
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-4" />

            <div className="flex items-center gap-3">
              {/* v332: was an empty gradient block — now the deal's initial, like the list rows */}
              <div className="w-11 h-11 rounded-[13px] bg-[#F2EAFF] text-[#7C3AED] text-[16px] font-extrabold flex items-center justify-center shrink-0">{String(selectedEscrowTx.title || "?").charAt(0).toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[16px] font-bold text-[#0A0A0A] leading-tight truncate">
                  {selectedEscrowTx.title}
                </h3>
                <p className="text-[11.5px] text-[#6B7280] mt-0.5">
                  {selectedEscrowTx.creatorName}
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[18px] font-bold text-[#0A0A0A]">
                  ₹{Number(selectedEscrowTx.heldAmount ?? selectedEscrowTx.amount).toLocaleString("en-IN")}{/* v416 */}
                </div>
                <div className="text-[10px] text-[#6B7280]">locked</div>
              </div>
            </div>

            {/* Stepper */}
            <div className="mt-5 flex flex-col">
              {/* Step 1 */}
              <div className="flex gap-3">
                <div className="w-5 flex flex-col items-center shrink-0">
                  <div className="w-5 h-5 rounded-full bg-[#059669] flex items-center justify-center text-white">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <div className="flex-1 w-[2px] bg-[#A7F3D0] my-1" />
                </div>
                <div className="flex-1 pb-4">
                  <div className="text-[13px] font-semibold text-[#0A0A0A]">Paid into escrow</div>{/* v415: plain words */}
                  <div className="text-[11.5px] text-[#6B7280] mt-0.5">
                    Paid via Razorpay · ₹{selectedEscrowTx.amount.toLocaleString("en-IN")}
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-3">
                <div className="w-5 flex flex-col items-center shrink-0">
                  {/* Session 58 (bug hunt): ticked only when the work really came in — it was always ticked. */}
                  {escrowDelivered(selectedEscrowTx) ? (
                    <div className="w-5 h-5 rounded-full bg-[#059669] flex items-center justify-center text-white">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-[#D1D5DB] bg-white" />
                  )}
                  <div className="flex-1 w-[2px] bg-[#E5E7EB] my-1" />
                </div>
                <div className="flex-1 pb-4">
                  <div className="text-[13px] font-semibold text-[#0A0A0A]">Creator deliverable submitted</div>
                  <div className="text-[11.5px] text-[#6B7280] mt-0.5">{selectedEscrowTx.detail || "Awaiting the creator / your review"}</div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-3">
                <div className="w-5 shrink-0">
                  <div className="w-5 h-5 rounded-full bg-[#F5F0FF] border-2 border-[#7C3AED]" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[#0A0A0A]">Payout release</span>
                    <span className={`h-4 px-1.5 rounded-[4px] text-[11px] font-bold flex items-center ${escrowDelivered(selectedEscrowTx) ? "bg-[#F5F0FF] text-[#7C3AED]" : "bg-[#F3F4F6] text-[#6B7280]"}`}>
                      {escrowDelivered(selectedEscrowTx) ? "YOUR MOVE" : "WAITING FOR CREATOR"}{/* v358: "your move" only once work came in */}
                    </span>
                  </div>
                  <div className="text-[11.5px] text-[#6B7280] mt-0.5">
                    Money stays in escrow until you approve.
                  </div>
                </div>
              </div>
            </div>

            {/* Decision Actions */}
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                onClick={() => {
                  const target = reviewTargetFor(selectedEscrowTx);
                  setSelectedEscrowTx(null);
                  navigate(target);
                }}
                className="h-[52px] rounded-[14px] bg-[#7C3AED] text-white font-semibold text-[15px] flex items-center justify-center gap-2 shadow-lg shadow-[#7C3AED]/30 active:scale-[0.99] transition-all cursor-pointer"
              >
                {escrowDelivered(selectedEscrowTx) ? <>Review content &amp; approve payout</> : "Open chat"}{/* v358 */}
              </button>

              {escrowDelivered(selectedEscrowTx) && ( /* v358: nothing to revise before the creator delivers */
              <button
                onClick={() => {
                  const target = reviewTargetFor(selectedEscrowTx);
                  setSelectedEscrowTx(null);
                  navigate(target);
                }}
                className="h-12 rounded-[14px] border-[1.5px] border-[#DDD0FF] bg-white text-[#7C3AED] font-semibold text-[14px] active:scale-[0.99] transition-all cursor-pointer"
              >
                Request a revision
              </button>
              )}
            </div>

            <div className="mt-3.5 p-3 rounded-[14px] bg-[#ECFDF5] flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#059669] shrink-0 mt-0.5" />
              <p className="text-[11.5px] text-[#047857] leading-relaxed">
                Creator ghosted or work unusable? Raise a dispute — the held amount is refunded to your refund account, usually within 1–2 working days after the team decides.
              </p>
            </div>

            <button
              onClick={() => setSelectedEscrowTx(null)}
              className="mt-2 w-full h-10 text-[#6B7280] text-[12px] font-medium cursor-pointer"
            >
              Close
            </button>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* SCREEN 03: BRAND GST TAX INVOICE & RAZORPAY AUDIT RECEIPT */}
      <Presence>{selectedGstTx && (
        <PopupBackdrop className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex flex-col justify-end">
          <PopupPanel kind="sheet" onClose={() => setSelectedGstTx(null)} className="bg-white rounded-t-[24px] p-5 max-h-[90vh] overflow-y-auto shadow-2xl" style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}>
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3" />

            <div className="flex flex-col items-center text-center">
              {selectedGstTx.type === "cancelled" ? (
                /* v330: a cancelled brief opened this receipt as "completed & settled". */
                <div className="h-6 px-2.5 rounded-[8px] bg-[#F3F4F6] text-[#4B5563] text-[11px] font-semibold flex items-center gap-1.5">
                  Cancelled · unused money comes back to you
                </div>
              ) : (
              <div className="h-6 px-2.5 rounded-[8px] bg-[#ECFDF5] text-[#047857] text-[11px] font-semibold flex items-center gap-1.5">
                <Check className="w-3 h-3 stroke-[3]" />
                Payment completed &amp; settled
              </div>
              )}

              <div className="text-[34px] font-bold tracking-tight text-[#0A0A0A] mt-2 leading-none">
                ₹{selectedGstTx.grossAmount.toLocaleString("en-IN")}
              </div>
              <div className="text-[11.5px] text-[#6B7280] mt-1">
                {selectedGstTx.title} · #{selectedGstTx.dealId}
              </div>
            </div>

            {/* GST Tax Breakdown */}
            <div className="mt-4 rounded-[16px] bg-[#F8F8FB] p-3.5 flex flex-col gap-2 text-[12px]">
              {/* Session 58 (Ravi): no creator payout / Ybex fee / GST lines for brands — only the total paid. */}
              <div className="h-[1px] bg-[#EAEAF0]" />
              <div className="flex justify-between text-[13px]">
                <span className="font-semibold text-[#0A0A0A]">Total paid</span>
                <span className="font-bold text-[#0A0A0A]">
                  ₹{selectedGstTx.grossAmount.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {/* Billed To Box */}
            <div className="mt-3 rounded-[16px] border border-[#E2E8F0] overflow-hidden">
              <div className="p-3 bg-[#FBFBFD] border-b border-[#EEF1F5]">
                <div className="text-[11px] font-medium tracking-wider uppercase text-[#6B7280]">
                  Billed to
                </div>
                <div className="text-[13.5px] font-semibold text-[#0A0A0A] mt-0.5">
                  {companyName || "Your brand"}{/* v358: no "Verified" claim */}
                </div>
                {hasRealGstin ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[11px] font-semibold text-[#4B5563]">GSTIN {gstin}</span>{/* v358: no "ITC eligible" badge — this receipt shows no GST line */}
                  </div>
                ) : (
                  <div className="text-[11px] text-[#6B7280] mt-0.5">
                    Unregistered / Individual Brand
                  </div>
                )}
              </div>

              <div className="p-3 flex flex-col gap-2 text-[12px]">
                <div className="flex justify-between items-center gap-3">
                  <span className="text-[#6B7280] shrink-0">Razorpay ID</span>
                  {/* v330: long IDs no longer push the row off-screen; no copy button for "—"; real tap target. */}
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="font-semibold text-[#0A0A0A] truncate">{selectedGstTx.razorpayId}</span>
                    {selectedGstTx.razorpayId && selectedGstTx.razorpayId !== "—" && (
                      <button type="button" aria-label="Copy Razorpay ID" onClick={() => copyToClipboard(selectedGstTx.razorpayId)} className="w-10 h-10 -my-3 -mr-2 flex items-center justify-center shrink-0 cursor-pointer">{/* v415: 40px */}
                        <Copy className="w-3.5 h-3.5 text-[#7C3AED]" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Escrow status</span>{/* v415 */}
                  <span className="font-semibold text-[#0A0A0A]">{selectedGstTx.type === "cancelled" ? "Cancelled" : <>Settled &amp; Transferred</>}{/* v330 */}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B7280]">Paid with</span>
                  <span className="font-semibold text-[#0A0A0A]">{selectedGstTx.payment_mode || "Razorpay (UPI / Card)"}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <button
              onClick={() => {
                setShowInvoiceModal(selectedGstTx.rawObj || selectedGstTx);
              }}
              className="mt-4 w-full h-[52px] rounded-[14px] bg-[#7C3AED] text-white font-semibold text-[15px] flex items-center justify-center gap-2 shadow-lg shadow-[#7C3AED]/30 active:scale-[0.99] transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download GST tax invoice (PDF)
            </button>

            <button
              onClick={() => {
                navigate("/help/tickets");
              }}
              className="mt-2.5 w-full h-10 rounded-[12px] bg-[#F2F2F7] text-[#4B5563] text-[12px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Need invoice amended? Contact billing support
            </button>

            <button
              onClick={() => setSelectedGstTx(null)}
              className="mt-2 w-full h-9 text-[#6B7280] text-[12px] font-medium cursor-pointer"
            >
              Close
            </button>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* Full PDF invoice modal portal */}
      <Presence>{showInvoiceModal && (
        <InvoiceModal key="invoicemodal"
          transaction={showInvoiceModal}
          isBrand={true}
          creatorName={showInvoiceModal.creatorName || showInvoiceModal.creator_name || "Content Creator"}
          brandName={companyName}
          onClose={() => setShowInvoiceModal(null)}
        />
      )}</Presence>
    </div>
  );
}
