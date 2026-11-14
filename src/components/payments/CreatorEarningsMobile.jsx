import { HiwSectionHelp } from "../whatsNew/WhatsNewPopup"; // v437: How it works button / popup / reminder
import React, { useState, useMemo, useEffect } from "react";
import usePlatformTax from "../../lib/usePlatformTax";
import { api } from "../../lib/api";
import { payoutMethodLabel } from "../../lib/payoutMethods"; // v347
import CreatorCodeCard from "./CreatorCodeCard";
import { Check, Copy, Clock, ShieldCheck, X, Download, MessageSquare, Lock, Eye, HelpCircle, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import InvoiceModal from "./InvoiceModal";
import { normalizeKycStatus } from "../../utils/kycStatus"; // v353
import { useAuth } from "../../contexts/AuthContext"; // v353: creator's real name on the receipt
import BrandLogo from "../common/BrandLogo";
import { CreatorEarningsSkeleton } from "../common/MobileSkeletons";

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
import MobileBackButton from "../common/MobileBackButton";
import ButtonSpinner from "../common/ButtonSpinner";
// Session 43: real dates only (the sheet showed made-up "Sep 18 / Sep 19 / 18h 32m").
const shortDate = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" /* v330: IST */ }) : "";
};
const timeLeftText = (v) => {
  const ms = v ? new Date(v).getTime() - Date.now() : NaN;
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
  return `${h}h ${m}m`;
};

export default function CreatorEarningsMobile({
  totalEarned = 0,
  inEscrow = 0,
  transactions = [],
  eligibleDeals = [],
  paymentMethods = [],
  kycObj = null,
  growthPercent = null,
  past28DaysEarned = 0,
  onNudgeAdmin = null,
  onOpenPayoutSettings = null,
  onPayoutRequested = null,
  loading = false,
}) {
  const platformTax = usePlatformTax();
  const navigate = useNavigate();
  const { user } = useAuth() || {}; // v353
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'escrow' (in hold) | 'queue' (ready) | 'disbursed' (paid)
  const [selectedActiveDeal, setSelectedActiveDeal] = useState(null);
  const [selectedReceiptTx, setSelectedReceiptTx] = useState(null);
  const [selectedReadyTx, setSelectedReadyTx] = useState(null);
  const [showRequestAll, setShowRequestAll] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(null);
  const [showProofModal, setShowProofModal] = useState(null);
  const [wallet, setWallet] = useState(null);

  // Session 57: referral wallet line (Ravi's Money screens, ER-01). Only shown when the server answers.
  useEffect(() => {
    let alive = true;
    api.get("referrals/me").then(({ data }) => {
      if (alive && data && Number.isFinite(Number(data.balance))) setWallet({ balance: Number(data.balance), min: Number(data.min_withdraw) || 0 });
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Derive default payment destination
  const primaryMethod = paymentMethods && paymentMethods.length > 0 ? paymentMethods[0] : null;
  // v347: a KYC UPI / bank (source "kyc", from GET creator/payment-methods/kyc) is a real payout account too.
  const disbursingText = primaryMethod ? payoutMethodLabel(primaryMethod) : "No payout account added";

  // Normalize transactions into unified feed
  const feedItems = useMemo(() => {
    const list = [];

    // Eligible deals in payout queue
    (eligibleDeals || []).forEach((deal) => {
      list.push({
        id: deal.id || deal.deal_id,
        type: "queue",
        title: deal.deal_title || deal.campaign_title || deal.deliverable_type || "Brand Collaboration",
        brandName: deal.brand_name || deal.brand?.company_name || "A brand", // v353: was "Brand partner"
        brandLogo: deal.brand_logo || deal.brand?.logo || "",
        threadId: deal.thread_id || deal.id || deal.deal_id || null,
        // null = the server has no net figure yet; the row then shows no amount (never a guess).
        amount: deal.creator_net_amount ?? deal.net_amount ?? null,
        grossAmount: Number(deal.gross_amount || deal.amount || 0),
        status: "queue",
        statusLabel: "Approved · in payout queue",
        timeAgo: "Approved recently",
        requested: Boolean(deal.payout_requested),
        dealObj: deal,
        date: deal.approved_at || deal.updated_at || deal.created_at || null, // v332: no date → no made-up "Approved <today>"
        monthLabel: new Date(deal.approved_at || deal.updated_at || deal.created_at || Date.now())
          .toLocaleString("en-US", { month: "long", year: "numeric" }).toUpperCase()
      });
    });

    // Transactions (in escrow, ready or paid). Session 43: a held transaction whose deal is already in
    // the payout queue above was listed twice (once "in hold", once "ready") — it now shows once, as Ready.
    // Session 57: RELEASED means the brand approved — the money is READY, not yet in the bank. Paid to
    // bank = PAID / a UTR (the same rule as the admin payout desk, backend/adminMoney.ts isPaidOut).
    const queuedDealIds = new Set((eligibleDeals || []).map((d) => String(d.deal_id || d.id || "")).filter(Boolean));
    (transactions || []).forEach((tx) => {
      const ps = String(tx.payout_status || "").toUpperCase();
      // Session 58: a failed / unfinished / voided payment is not money for the creator — not listed.
      // v344: a CANCELLED payment is skipped too (same rule as the "In hold" total on the Earnings page).
      if (["FAILED", "INITIATED", "CANCELLED"].includes(String(tx.status || "").toUpperCase()) || ps === "CANCELLED") return;
      const isPaid = ps === "PAID" || ps === "COMPLETED" || Boolean(tx.utr_number || tx.payout_reference);
      const isReady = !isPaid && ps === "RELEASED";
      if (!isPaid && tx.deal_id && queuedDealIds.has(String(tx.deal_id))) return;
      const amount = Number(tx.creator_net_amount || tx.net_amount || tx.amount || tx.gross_amount || 0);
      const txDate = new Date(tx.created_at || tx.payout_completed_at || Date.now());
      const monthStr = txDate.toLocaleString("en-US", { month: "long", year: "numeric" }).toUpperCase();
      const type = isPaid ? "disbursed" : isReady ? "queue" : "escrow";

      list.push({
        id: tx.id || tx.transaction_id,
        type,
        fromTx: true,
        title: tx.campaign_title || tx.deliverable_type || tx.deal_title || (tx.deal_id ? "Campaign deal" : "UGC Deliverable"),
        // Session 43 (Ravi): tx.users is the CREATOR — "B Cool" showed as the brand. Brand only.
        brandName: tx.brand_name || tx.brand?.company_name || tx.brand?.name || "A brand", // v353: was "Brand partner"
        brandLogo: tx.brand_logo || tx.brand?.logo || tx.brand?.logo_url || "",
        fundedAt: tx.paid_at || tx.escrow_funded_at || tx.created_at || null,
        submittedAt: tx.content_submitted_at || tx.submitted_at || null,
        approvedAt: isReady ? (tx.payout_completed_at || tx.updated_at || null) : null,
        autoApproveAt: tx.auto_approve_at || null,
        threadId: tx.thread_id || tx.deal_id || tx.ugc_order_id || null,
        amount: amount,
        grossAmount: Number(tx.gross_amount || tx.amount || amount),
        platformFee: Number(tx.platform_fee_amount || tx.fee_amount || 0),
        gstAmount: Number(tx.gst_amount || 0),
        feeAmount: Number(tx.platform_fee_amount || tx.fee_amount || 0) + Number(tx.gst_amount || 0), // fee + GST, both deducted from gross
        status: type,
        statusLabel: isPaid ? "Disbursed to bank" : isReady ? "Approved · ready to pay out" : "In secure payment hold · brand reviewing",
        requested: isReady && Boolean(tx.payout_requested),
        utr: tx.utr_number || tx.payout_reference || null,
        disbursedAt: tx.payout_completed_at || tx.payout_released_at || tx.updated_at,
        txObj: tx,
        date: tx.created_at || tx.updated_at || null, // v332: no made-up today's date
        monthLabel: monthStr
      });
    });

    return list;
  }, [transactions, eligibleDeals]);

  // Counts + totals (Session 57 design: All · In hold · Ready · Paid)
  const countEscrow = feedItems.filter((i) => i.type === "escrow").length;
  const countQueue = feedItems.filter((i) => i.type === "queue").length;
  const countPaid = feedItems.filter((i) => i.type === "disbursed").length;
  const readyItems = feedItems.filter((i) => i.type === "queue");
  const readyTotal = readyItems.reduce((a, i) => a + (Number(i.amount) || 0), 0);
  const allRequested = readyItems.length > 0 && readyItems.every((i) => i.requested);
  // inEscrow is every unpaid deal (Earnings-page rule); the ready ones are shown in their own tile.
  const holdTotal = Math.max(0, Number(inEscrow || 0) - readyTotal);

  const filteredFeed = useMemo(() => {
    const list = activeTab === "all" ? feedItems : feedItems.filter((i) => i.type === activeTab);
    return [...list].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [feedItems, activeTab]);

  // v330: the clipboard can be missing or blocked (older Android WebView / iOS PWA) — the success toast
  // used to show even when nothing was copied (and a missing clipboard threw).
  const copyToClipboard = (text, label = "UTR") => {
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .then(() => toast.success(`${label} copied to clipboard!`))
      .catch(() => toast.error(`Couldn't copy. Long-press the ${label} to copy it.`));
  };

  // v353: one shared rule (utils/kycStatus) — a REJECTED KYC showed "KYC not submitted · Start", and any other
  // review status (UNDER_REVIEW, MORE_INFO_NEEDED…) showed "not submitted" too.
  const kycNorm = normalizeKycStatus(kycObj);
  const isKycVerified = kycNorm === "APPROVED";
  const isKycPending = kycNorm === "PENDING";
  const isKycRejected = kycNorm === "REJECTED";

  // Session 39: the loading screen comes after every hook (hooks must run in the same order).
  if (loading) {
    return <CreatorEarningsSkeleton />;
  }

  const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
  const openPayoutSettings = () => (onOpenPayoutSettings ? onOpenPayoutSettings() : navigate("/earnings"));
  const BADGE = {
    escrow: { label: "In hold", color: "#B45309", bg: "#FFF7E6" },
    queue: { label: "Ready", color: "#0E7A55", bg: "#E3F7EE" },
    requested: { label: "Requested", color: "#7C3AED", bg: "#F2EAFF" },
    disbursed: { label: "Paid", color: "#1D4ED8", bg: "#EAF1FF" },
  };
  const openRow = (item) => {
    if (item.type === "escrow") return setSelectedActiveDeal(item);
    if (item.type === "disbursed") return setSelectedReceiptTx(item);
    // Ready, approved by the brand (RELEASED payment row) → the deal breakdown (ER-03).
    if (item.fromTx) return setSelectedReadyTx(item);
    // Ready from the server's payout queue: the same per-deal payout request as before (PayoutRequestSheet).
    return onNudgeAdmin
      ? onNudgeAdmin(item.id)
      : toast.error("Couldn't reach the admin desk from here. Please use Help → Tickets.");
  };
  const tabs = [
    ["all", "All", feedItems.length],
    ["escrow", "In hold", countEscrow],
    ["queue", "Ready", countQueue],
    ["disbursed", "Paid", countPaid],
  ];
  const emptyTitle = activeTab === "all" ? "No deal payments yet" : activeTab === "escrow" ? "Nothing in secure hold" : activeTab === "queue" ? "Nothing ready to disburse" : "No payouts yet";
  const rowDetail = (item) => {
    if (item.type === "disbursed") {
      const d = shortDate(item.disbursedAt || item.date);
      return item.utr ? `${d ? `${d} · ` : ""}UTR ${item.utr}` : "Transfer on its way";
    }
    if (item.type === "queue") {
      if (item.requested) return "Payout requested";
      const d = shortDate(item.approvedAt || item.date);
      return d ? `Approved ${d}` : "Approved";
    }
    return item.submittedAt ? "Draft in review" : "Brand has paid · deliver to unlock";
  };
  const downloadStatement = () => {
    // A simple statement of every deal payment shown here (CSV opens in Sheets / Excel).
    const rows = [["Date", "Deal", "Brand", "Status", "Deal amount", "You get", "UTR"]];
    [...feedItems].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0)).forEach((i) => {
      rows.push([shortDate(i.date), i.title, i.brandName, BADGE[i.type]?.label || i.type, i.grossAmount || "", i.amount ?? "", i.utr || ""]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    try {
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = "ybex-earnings-statement.csv"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch { toast.error("Couldn't download the statement."); }
  };
  const isFirstTime = feedItems.length === 0;
  const walletNeed = wallet ? Math.max(0, (wallet.min || 0) - wallet.balance) : 0;

  return (
    <div className="w-full bg-[#F4F4F8] flex flex-col pb-3" data-testid="creator-earnings-mobile">
      {/* Session 57 — Ravi's Money screens design (Ybex_Money_Mobile_UI, ER-01/02). Numbers are the same server figures. */}
      <header data-statusbar="#FFFFFF" className="bg-white border-b border-[#ECEAF1] px-4 pt-2 pb-3 sticky top-0 z-20 flex items-center gap-3">
        <MobileBackButton className="!w-10 !h-10 !bg-[#F2F0F6]" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2"><h1 className="text-[20px] font-extrabold tracking-[-0.3px] text-[#0A0A0A] leading-tight">Earnings</h1></div>
          {isKycVerified ? (
            <div className="flex items-center gap-1 text-[12px] font-semibold text-[#0E9F6E] mt-px">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#0E9F6E" className="shrink-0"><path d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-1 2.8 1 2.8-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.5-1.7 1-2.8-1-2.8 2.5-1.7.9-2.9 3 .2z" /><path d="M8.5 12l2.3 2.3 4.7-4.7" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
              KYC verified
            </div>
          ) : null /* v353: the KYC card below already says it — two KYC prompts stacked one above the other */}
        </div>
        <HiwSectionHelp section="payments" role="creator" label="Guide" />
        <button
          type="button"
          onClick={() => navigate("/help/tickets")}
          className="h-10 px-3 rounded-full border border-[#E6E3EE] bg-white text-[13px] font-semibold text-[#0A0A0A] flex items-center gap-1.5 shrink-0 active:scale-95 transition-transform"
        >
          <HelpCircle className="w-4 h-4" />Help
        </button>
      </header>

      <div className="flex-1 px-4 pt-4 pb-8 flex flex-col gap-3">
        {/* KYC — payouts unlock after it (ER-01 / ER-02) */}
        {!isKycVerified && (
          <button type="button" onClick={() => navigate("/creator/kyc")} className="shrink-0 rounded-[18px] p-3.5 flex items-center gap-3 text-left bg-[#FFF8EB] border border-[#FBE3B5]">
            <div className="w-9 h-9 rounded-[11px] bg-[#FDEBC8] flex items-center justify-center shrink-0"><Clock className="w-[18px] h-[18px] text-[#B45309]" /></div>
            <div className="flex-1 min-w-0">
              {/* v353: rejected KYC has its own words (was "Finish your KYC") */}
              <div className="text-[14px] font-bold text-[#7A4A06]">{isKycPending ? "KYC in review" : isKycRejected ? "KYC needs a fix" : "Finish your KYC"}</div>
              <div className="text-[12px] text-[#92612A] mt-px">{isKycPending ? "Payouts unlock once it's approved." : isKycRejected ? "Your details were not approved. Check the reason and send them again." : "Needed before any money can be sent to you."}</div>
            </div>
            <span className="text-[13px] font-bold text-[#B45309] shrink-0">{isKycPending ? "View" : isKycRejected ? "Fix" : "Start"}</span>
          </button>
        )}

        {isFirstTime ? (
          /* ER-02 · first time */
          <div className="shrink-0 rounded-[22px] p-5 text-white" style={{ background: "linear-gradient(160deg,#8B2CF5 0%,#6A1FD8 55%,#4C12A8 100%)" }}>
            <div className="text-[12px] font-bold uppercase tracking-[1px] text-[#E4D4FF]">Getting started</div>
            <div className="text-[21px] font-extrabold leading-tight mt-1.5">Your first deal payment will show up here</div>
            <div className="text-[13px] text-[#EBDDFF] mt-1.5">Finish these steps now so money can reach you the day a brand approves.</div>
            {/* keep the three server figures visible (all ₹0 for now) */}
            <div className="hidden" data-testid="earnings-total">{inr(totalEarned)}</div>
            <div className="hidden" data-testid="earnings-hold">{inr(holdTotal)}</div>
            <div className="hidden" data-testid="earnings-ready">{inr(readyTotal)}</div>
          </div>
        ) : (
          <>
            {/* ER-01 · HERO: ready money first */}
            <div className="shrink-0 rounded-[22px] p-5 text-white flex flex-col gap-3 shadow-[0_14px_30px_rgba(91,0,200,.25)]" style={{ background: "linear-gradient(160deg,#8B2CF5 0%,#6A1FD8 55%,#4C12A8 100%)" }}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[13px] font-semibold text-[#E9DBFF] shrink-0">Ready to withdraw</div>
                {primaryMethod && (
                  <button type="button" onClick={openPayoutSettings} className="min-w-0 max-w-[55%] truncate px-2.5 py-1 rounded-full bg-white/[.16] text-[11px] font-semibold text-[#F3EAFF]" data-testid="earnings-payout-dest">
                    → {primaryMethod.upi_id ? primaryMethod.upi_id : `Bank •••• ${primaryMethod.account_last4 || ""}`}
                  </button>
                )}
              </div>
              <div className="text-[38px] font-extrabold tracking-[-1px] leading-none" data-testid="earnings-ready">{inr(readyTotal)}</div>
              <div className="text-[13px] text-[#EBDDFF] -mt-1">
                {countQueue > 0
                  ? (allRequested ? "Payout requested — you'll get the UTR once it's sent." : `From ${countQueue} approved deal${countQueue > 1 ? "s" : ""}. Request it to your bank anytime.`)
                  : "Money shows here when a brand approves your work."}
              </div>
              {countQueue > 0 && (
                <>
                  <button
                    type="button"
                    data-testid="earnings-request-payout"
                    onClick={() => (primaryMethod ? setShowRequestAll(true) : openPayoutSettings())}
                    className="h-12 rounded-[14px] bg-white text-[#5B16C9] text-[15px] font-extrabold active:scale-[0.99] transition-transform"
                  >
                    {!primaryMethod ? "Add payout account to withdraw" : allRequested ? "Send a reminder" : "Request payout"}
                  </button>
                  <div className="text-[11.5px] text-[#E4D4FF] text-center -mt-1">Reaches your bank in 1–2 working days</div>
                </>
              )}
            </div>

            {/* In hold · Paid to bank */}
            <div className="grid grid-cols-2 gap-2.5 shrink-0">
              <div className="bg-white rounded-[18px] p-3.5 min-w-0 border border-[#EEEDF3]">
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#6B7280]"><Lock className="w-[13px] h-[13px] stroke-[2.2]" />In hold</div>
                <div className="text-[20px] font-extrabold text-[#0A0A0A] mt-1 truncate" data-testid="earnings-hold">{inr(holdTotal)}</div>
                <div className="text-[11.5px] text-[#6B7280] mt-0.5 leading-snug">Brand has paid. Unlocks when they approve.</div>
              </div>
              <div className="bg-white rounded-[18px] p-3.5 min-w-0 border border-[#EEEDF3]">
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#047857]">
                  {/* v333 (Ravi): verified-style green tick with a soft glow — "Paid" must be noticed */}
                  <BadgeCheck className="w-[16px] h-[16px] shrink-0" fill="#16A34A" color="#FFFFFF" strokeWidth={2.4} style={{ filter: "drop-shadow(0 0 5px rgba(22,163,74,.55))" }} aria-hidden="true" />
                  Paid to bank
                </div>
                <div className="text-[20px] font-extrabold text-[#0A0A0A] mt-1 truncate" data-testid="earnings-total">{inr(totalEarned)}</div>
                <div className="text-[11.5px] text-[#6B7280] mt-0.5 leading-snug">
                  {countPaid ? `${countPaid} payout${countPaid > 1 ? "s" : ""}` : "No payouts yet"}{past28DaysEarned ? ` · ${inr(past28DaysEarned)} in 28 days` : ""}{growthPercent ? ` · ${growthPercent}` : ""}
                </div>
              </div>
            </div>
          </>
        )}

        {/* PAYOUT DESTINATION — only when none is set */}
        {!primaryMethod && (
          <button type="button" onClick={openPayoutSettings} className="shrink-0 bg-white rounded-[18px] p-3.5 flex items-center gap-3 text-left border-[1.5px] border-dashed border-[#D9BFFF]">
            <div className="w-10 h-10 rounded-[12px] bg-[#F2EAFF] flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10l9-6 9 6M5 10v8M19 10v8M9 10v8M15 10v8M3 20h18" /></svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold text-[#0A0A0A]">Add a payout account</div>
              <div className="text-[12px] text-[#6B7280] mt-px">UPI or bank — where your money is sent</div>
            </div>
            <span className="h-9 px-4 rounded-full bg-[#7C3AED] text-white text-[13px] font-bold shrink-0 flex items-center">Add</span>
          </button>
        )}

        {/* REFERRAL WALLET */}
        {wallet && (wallet.balance > 0 || walletNeed > 0) && (
          <button type="button" onClick={() => navigate("/refer")} className="shrink-0 bg-white rounded-[18px] p-3.5 flex items-center gap-3 text-left border border-[#EEEDF3]" data-testid="earnings-wallet">
            <div className="w-10 h-10 rounded-[12px] bg-[#F2EAFF] flex items-center justify-center shrink-0 text-[18px]">🎁</div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold text-[#0A0A0A]">Referral wallet · {inr(wallet.balance)}</div>
              <div className="text-[12px] text-[#6B7280] mt-px">{walletNeed > 0 ? `Add ${inr(walletNeed)} more to withdraw (min ${inr(wallet.min)})` : "Ready to withdraw to your UPI"}</div>
            </div>
            <span className="text-[13px] font-bold text-[#7C3AED] shrink-0">Open</span>
          </button>
        )}

        {/* CREATOR CODE */}
        <CreatorCodeCard />

        {/* DEAL PAYMENTS */}
        <div className="shrink-0 flex flex-col gap-2.5 mt-1.5">
          <div className="flex items-center justify-between px-1">
            <div className="text-[16px] font-extrabold text-[#0A0A0A]">{isFirstTime ? "How you get paid" : "Deal payments"}</div>
            {!isFirstTime && (
              <button type="button" onClick={downloadStatement} className="text-[13px] font-bold text-[#7C3AED] flex items-center gap-1">
                <Download className="w-3.5 h-3.5" />Statement
              </button>
            )}
          </div>
          {!isFirstTime && (
            <div className="grid grid-cols-4 bg-[#E9E6F0] rounded-[14px] p-1 gap-1" role="tablist">
              {tabs.map(([id, label, n]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === id}
                  onClick={() => setActiveTab(id)}
                  className={`h-9 min-w-0 px-1 truncate rounded-[10px] text-[12.5px] font-bold transition-colors ${ /* v332: "In hold · 12" spilled out at 320px */
                    activeTab === id ? "bg-white text-[#0A0A0A] shadow-[0_1px_3px_rgba(20,17,28,.12)]" : "bg-transparent text-[#6B7280]"
                  }`}
                >
                  {n ? `${label} · ${n}` : label}
                </button>
              ))}
            </div>
          )}

          {filteredFeed.length === 0 ? (
            <div className="bg-white rounded-[20px] px-5 py-6 flex flex-col gap-[18px] border border-[#EEEDF3]">
              {!isFirstTime && (
                <div className="text-center">
                  <div className="text-[15px] font-bold text-[#0A0A0A]">{emptyTitle}</div>
                  <div className="text-[13px] text-[#6B7280] mt-1">Here's how you get paid for a deal</div>
                </div>
              )}
              <div className="flex flex-col gap-3.5">
                {[
                  ["Brand pays upfront", "Money is locked in Ybex secure hold. Shows as In hold."],
                  ["You deliver, brand approves", "The amount moves to Ready."],
                  ["Request payout", "In your bank in 1–2 working days, with a UTR number. Shows as Paid."],
                ].map(([t, d], i) => (
                  <div key={t} className="flex gap-3 items-start">
                    <div className="w-[26px] h-[26px] rounded-full bg-[#F2EAFF] text-[#7C3AED] text-[13px] font-extrabold flex items-center justify-center shrink-0">{i + 1}</div>
                    <div>
                      <div className="text-[14px] font-bold text-[#0A0A0A]">{t}</div>
                      <div className="text-[12px] text-[#6B7280] mt-px">{d}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => navigate("/campaigns")}
                className="h-[46px] rounded-[14px] bg-[#0A0A0A] text-white text-[15px] font-bold active:scale-[0.99] transition-transform"
              >
                Find deals
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredFeed.map((item) => {
                const b = item.type === "queue" && (item.requested || item.dealObj?.payout_requested) ? BADGE.requested : BADGE[item.type];
                const hasAmount = item.amount !== null && item.amount !== undefined;
                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    type="button"
                    onClick={() => openRow(item)}
                    data-testid={`earnings-row-${item.type}`}
                    className="w-full bg-white rounded-[16px] border border-[#EEEDF3] px-3.5 py-3 text-left active:scale-[0.995] transition-transform"
                  >
                    <div className="flex items-center gap-3">
                      <BrandLogo src={item.brandLogo} name={item.brandName} size={40} radius={12} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-bold text-[#0A0A0A] truncate">{item.title}</div>
                        <div className="text-[12px] text-[#6B7280] mt-px truncate">{item.brandName}</div>
                      </div>
                      <div className="text-right shrink-0">
                        {hasAmount && <div className="text-[15px] font-extrabold text-[#0A0A0A]">{inr(item.amount)}</div>}
                        {item.grossAmount > 0 && hasAmount && Number(item.grossAmount) !== Number(item.amount) && (
                          <div className="text-[11px] text-[#9A95A8]">of {inr(item.grossAmount)}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-2.5">
                      <span className="inline-block px-2 py-0.5 rounded-[8px] text-[11px] font-bold" style={{ color: b.color, background: b.bg }}>{b.label}</span>
                      <span className="text-[11.5px] text-[#6B7280] truncate">{rowDetail(item)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* HELP */}
        <button type="button" onClick={() => navigate("/help/tickets")} className="shrink-0 bg-white rounded-[18px] p-3.5 flex items-center gap-3 text-left border border-[#EEEDF3]">
          <div className="w-9 h-9 rounded-full bg-[#F2F0F6] flex items-center justify-center shrink-0"><MessageSquare className="w-4 h-4 text-[#6B7280]" /></div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold text-[#0A0A0A]">Problem with a payment?</div>
            <div className="text-[12px] text-[#6B7280]">Chat with Ybex finance support</div>
          </div>
          <span className="text-[13px] font-bold text-[#7C3AED] shrink-0">Get help</span>
        </button>
      </div>

      {/* ER-03 · DEAL BREAKDOWN (approved, ready to pay out) */}
      <Presence>{selectedReadyTx && (
        <PopupBackdrop className="fixed inset-0 z-50 bg-slate-900/50 flex flex-col justify-end">
          {/* v332: every sheet on this page now clears the iPhone home bar (safe-area padding) */}
          <PopupPanel kind="sheet" onClose={() => setSelectedReadyTx(null)} className="bg-white rounded-t-[24px] p-5 max-h-[88vh] overflow-y-auto shadow-2xl" style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }} data-testid="earnings-breakdown">
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-4" />
            <div className="flex items-center gap-3">
              <BrandLogo src={selectedReadyTx.brandLogo} name={selectedReadyTx.brandName} size={44} radius={13} />
              <div className="flex-1 min-w-0">
                <div className="text-[16px] font-bold text-[#0A0A0A] truncate">{selectedReadyTx.title}</div>
                <div className="text-[12px] text-[#6B7280]">{selectedReadyTx.brandName}</div>
              </div>
              <span className="px-2 py-0.5 rounded-[8px] text-[11px] font-bold" style={{ color: (selectedReadyTx.requested ? BADGE.requested : BADGE.queue).color, background: (selectedReadyTx.requested ? BADGE.requested : BADGE.queue).bg }}>
                {selectedReadyTx.requested ? "Requested" : "Ready"}
              </span>
            </div>
            <div className="mt-4 rounded-[16px] bg-[#F7F6FA] p-3.5 flex flex-col gap-2 text-[13px]">
              <div className="flex justify-between"><span className="text-[#6B7280]">Deal amount</span><span className="font-semibold text-[#0A0A0A]">{inr(selectedReadyTx.grossAmount)}</span></div>
              <div className="flex justify-between"><span className="text-[#6B7280]">Convenience fee & TDS</span><span className="font-semibold text-[#0A0A0A]">−{inr(selectedReadyTx.platformFee)}</span></div>
              {selectedReadyTx.gstAmount > 0 && <div className="flex justify-between"><span className="text-[#6B7280]">GST on fee</span><span className="font-semibold text-[#0A0A0A]">−{inr(selectedReadyTx.gstAmount)}</span></div>}
              <div className="h-px bg-[#E8E6EE]" />
              <div className="flex justify-between text-[15px]"><span className="font-bold text-[#0A0A0A]">You get</span><span className="font-extrabold text-[#0E7A55]">{inr(selectedReadyTx.amount)}</span></div>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {[
                ["Brand paid into secure hold", shortDate(selectedReadyTx.fundedAt), true],
                ["Brand approved your work", shortDate(selectedReadyTx.approvedAt), true],
                ["Paid to your bank", selectedReadyTx.requested ? "Requested · reaches you in 1–2 working days" : "Request payout · reaches you in 1–2 working days", false],
              ].map(([t, d, done]) => (
                <div key={t} className="flex gap-3 items-start">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-[#0E9F6E] text-white" : "bg-[#F2EAFF] border border-[#D9BFFF]"}`}>{done ? <Check className="w-3 h-3 stroke-[3]" /> : null}</span>
                  <div className="min-w-0">
                    <div className={`text-[13.5px] font-semibold ${done ? "text-[#0A0A0A]" : "text-[#7C3AED]"}`}>{t}</div>
                    {d ? <div className="text-[12px] text-[#6B7280]">{d}</div> : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex gap-2.5">
              <button type="button" onClick={() => setShowInvoiceModal(selectedReadyTx.txObj || selectedReadyTx)} className="flex-1 h-12 rounded-[14px] border border-[#E2DFEA] bg-white text-[#0A0A0A] font-semibold text-[14px] flex items-center justify-center gap-1.5">
                <Download className="w-4 h-4" />Invoice
              </button>
              <button type="button" onClick={() => { setSelectedReadyTx(null); primaryMethod ? setShowRequestAll(true) : openPayoutSettings(); }} className="flex-1 h-12 rounded-[14px] bg-[#7C3AED] text-white font-bold text-[14px]">
                {selectedReadyTx.requested ? "Send a reminder" : "Request payout"}
              </button>
            </div>
            <button type="button" onClick={() => navigate("/help/tickets")} className="mt-3 w-full text-[12.5px] text-[#6B7280]">Something wrong with this payment? <span className="font-bold text-[#7C3AED]">Get help</span></button>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* ER-04 · REQUEST PAYOUT (all ready money) */}
      <Presence>{showRequestAll && (
        <RequestAllSheet
          amount={readyTotal}
          items={readyItems}
          destination={primaryMethod ? (primaryMethod.upi_id || `Bank •••• ${primaryMethod.account_last4 || ""}`) : ""}
          reminder={allRequested}
          onChange={() => { setShowRequestAll(false); openPayoutSettings(); }}
          onClose={() => setShowRequestAll(false)}
          onDone={() => { setActiveTab("queue"); onPayoutRequested?.(); }}
        />
      )}</Presence>

      {/* SCREEN 02: ACTIVE DEAL · ESCROW MILESTONES BOTTOM SHEET */}
      <Presence>{selectedActiveDeal && (
        <PopupBackdrop className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex flex-col justify-end">
          <PopupPanel kind="sheet" onClose={() => setSelectedActiveDeal(null)} className="bg-white rounded-t-[24px] p-5 max-h-[85vh] overflow-y-auto shadow-2xl" style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}>
            {/* Grab Handle */}
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-4" />

            {/* Deal Header */}
            <div className="flex items-center gap-3">
              <BrandLogo src={selectedActiveDeal.brandLogo} name={selectedActiveDeal.brandName} size={44} radius={13} />
              <div className="flex-1 min-w-0">
                <h3 className="text-[16px] font-bold text-[#0A0A0A] leading-tight truncate">
                  {selectedActiveDeal.title}
                </h3>
                <p className="text-[11.5px] text-[#6B7280] mt-0.5">
                  {selectedActiveDeal.brandName}{/* v353: "Deal #<payment id>" was a payment id, not the deal */}
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[18px] font-bold text-[#0A0A0A]">
                  ₹{selectedActiveDeal.amount.toLocaleString("en-IN")}
                </div>
                <div className="text-[10px] text-[#6B7280]">you get</div>{/* v353: this is the creator's net amount, not the deal value */}
              </div>
            </div>

            {/* Stepper Milestones */}
            <div className="mt-5 flex flex-col">
              {/* Step 1: Funded */}
              <div className="flex gap-3">
                <div className="w-5 flex flex-col items-center shrink-0">
                  <div className="w-5 h-5 rounded-full bg-[#059669] flex items-center justify-center text-white">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <div className="flex-1 w-[2px] bg-[#A7F3D0] my-1" />
                </div>
                <div className="flex-1 pb-4">
                  <div className="text-[13px] font-semibold text-[#0A0A0A]">Secure payment hold funded by brand</div>
                  <div className="text-[11.5px] text-[#6B7280] mt-0.5">
                    {shortDate(selectedActiveDeal.fundedAt) ? `${shortDate(selectedActiveDeal.fundedAt)} · ` : ""}₹{selectedActiveDeal.amount.toLocaleString("en-IN")} held safely
                  </div>
                </div>
              </div>

              {/* Step 2: Content Submitted.
                  v330: was always ticked (and step 3 always "NOW") even before the creator delivered —
                  the row itself says "deliver to unlock". The ticks now follow submittedAt. */}
              <div className="flex gap-3">
                <div className="w-5 flex flex-col items-center shrink-0">
                  {selectedActiveDeal.submittedAt ? (
                    <div className="w-5 h-5 rounded-full bg-[#059669] flex items-center justify-center text-white">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-[#FFFBEB] border-2 border-[#F59E0B]" />
                  )}
                  <div className="flex-1 w-[2px] bg-[#E5E7EB] my-1" />
                </div>
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[#0A0A0A]">{selectedActiveDeal.submittedAt ? "Content submitted by you" : "Submit your content"}</span>
                    {!selectedActiveDeal.submittedAt && (
                      <span className="h-4 px-1.5 rounded-[4px] bg-[#FFFBEB] text-[#B45309] text-[11px] font-bold flex items-center">NOW</span>
                    )}
                  </div>
                  {selectedActiveDeal.submittedAt
                    ? (shortDate(selectedActiveDeal.submittedAt) && <div className="text-[11.5px] text-[#6B7280] mt-0.5">{shortDate(selectedActiveDeal.submittedAt)}</div>)
                    : <div className="text-[11.5px] text-[#B45309] mt-0.5">Upload it in the deal chat to unlock the payment</div>}
                </div>
              </div>

              {/* Step 3: Brand Review */}
              <div className="flex gap-3">
                <div className="w-5 flex flex-col items-center shrink-0">
                  {selectedActiveDeal.submittedAt
                    ? <div className="w-5 h-5 rounded-full bg-[#FFFBEB] border-2 border-[#F59E0B]" />
                    : <div className="w-5 h-5 rounded-full bg-[#F2F2F7]" />}
                  <div className="flex-1 w-[2px] bg-[#E5E7EB] my-1" />
                </div>
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2">
                    <span className={`text-[13px] font-semibold ${selectedActiveDeal.submittedAt ? "text-[#0A0A0A]" : "text-[#6B7280]"}`}>Brand QC &amp; approval</span>
                    {selectedActiveDeal.submittedAt && (
                      <span className="h-4 px-1.5 rounded-[4px] bg-[#FFFBEB] text-[#B45309] text-[11px] font-bold flex items-center">
                        NOW
                      </span>
                    )}
                  </div>
                  {selectedActiveDeal.submittedAt && (
                    <div className="text-[11.5px] text-[#B45309] mt-0.5">
                      {timeLeftText(selectedActiveDeal.autoApproveAt) ? `Auto-approves in ${timeLeftText(selectedActiveDeal.autoApproveAt)} if no changes are asked` : "The brand is reviewing your content"}
                    </div>
                  )}
                </div>
              </div>

              {/* Step 4: Disbursal */}
              <div className="flex gap-3">
                <div className="w-5 shrink-0">
                  <div className="w-5 h-5 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[#6B7280]">
                    <Lock className="w-2.5 h-2.5" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold text-[#6B7280]">Direct disbursal to bank / UPI</div>
                  {primaryMethod ? (
                    <div className="text-[11.5px] text-[#6B7280] mt-0.5">Ybex sends it to {disbursingText} and posts the UTR here</div>
                  ) : (
                    <button type="button" onClick={() => { setSelectedActiveDeal(null); onOpenPayoutSettings ? onOpenPayoutSettings() : navigate("/earnings"); }}
                      className="mt-1 text-[12px] font-semibold text-[#7C3AED] underline">Add a payout account to receive this money</button>
                  )}
                </div>
              </div>
            </div>

            {/* Escrow Guarantee Banner */}
            <div className="mt-3 p-3 rounded-[14px] bg-[#ECFDF5] flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#059669] shrink-0 mt-0.5" />
              <p className="text-[11.5px] text-[#047857] leading-relaxed">
                <strong className="font-semibold">Payment protected.</strong>{/* v418 */} The brand cannot cancel this brief without admin mediation.
              </p>
            </div>

            {/* Actions: View Proof & Chat With Brand */}
            <div className="mt-4 flex gap-2.5">
              <button
                onClick={() => {
                  setShowProofModal(selectedActiveDeal);
                }}
                className="flex-1 h-12 rounded-[14px] border border-[#E2E8F0] bg-[#F8F8FB] text-[#0A0A0A] font-semibold text-[13px] flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <Eye className="w-4 h-4 text-[#4B5563]" />
                View proof
              </button>
              <button
                onClick={() => {
                  const tid = selectedActiveDeal.threadId;
                  setSelectedActiveDeal(null);
                  navigate(tid ? `/chat/${tid}` : "/chat");
                }}
                className="flex-1 h-12 rounded-[14px] bg-[#7C3AED] text-white font-semibold text-[13px] flex items-center justify-center gap-2 shadow-lg shadow-[#7C3AED]/30 active:scale-95 transition-all cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                Chat with brand
              </button>
            </div>

            <button
              onClick={() => setSelectedActiveDeal(null)}
              className="mt-2.5 w-full h-10 text-[#6B7280] text-[12px] font-medium cursor-pointer"
            >
              Close
            </button>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* SCREEN 03: DISBURSAL RECEIPT & UTR PROOF BOTTOM SHEET */}
      <Presence>{selectedReceiptTx && (
        <PopupBackdrop className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex flex-col justify-end">
          <PopupPanel kind="sheet" onClose={() => setSelectedReceiptTx(null)} className="bg-white rounded-t-[24px] p-5 max-h-[90vh] overflow-y-auto shadow-2xl" style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}>
            {/* Grab handle */}
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3" />

            {(() => {
              // Session 43 (Ravi): until finance posts the UTR the payout is still on its way, so the
              // whole receipt says "pending" in yellow and the bank details stay hidden.
              const tx = selectedReceiptTx;
              const hasUtr = Boolean(tx.utr);
              const raw = tx.txObj || {};
              const upi = raw.payout_upi_id || primaryMethod?.upi_id || null;
              const last4 = raw.payout_account_last4 || primaryMethod?.account_last4 || (primaryMethod?.bank_account_number ? String(primaryMethod.bank_account_number).slice(-4) : null);
              const ifsc = String(raw.payout_ifsc || raw.ifsc || primaryMethod?.bank_ifsc || primaryMethod?.ifsc || primaryMethod?.ifsc_code || "").trim().toUpperCase();
              const destination = upi ? `UPI · ${upi}` : last4 ? `Bank ••${last4}` : null;
              const channel = upi ? "UPI transfer" : "IMPS · direct bank transfer";
              return (
                <>
                  <div className="flex flex-col items-center text-center">
                    {hasUtr ? (
                      <div className="w-12 h-12 rounded-full bg-[#ECFDF5] flex items-center justify-center text-[#059669]">
                        <Check className="w-6 h-6 stroke-[3]" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[#FEF3C7] flex items-center justify-center text-[#B45309]" data-testid="receipt-pending-icon">
                        <Clock className="w-6 h-6 stroke-[2.5]" />
                      </div>
                    )}
                    <div className={`text-[13px] font-semibold mt-2 ${hasUtr ? "text-[#047857]" : "text-[#B45309]"}`}>
                      {hasUtr ? "Disbursed to bank account" : "Transfer pending"}
                    </div>
                    <div className="text-[34px] font-bold tracking-tight text-[#0A0A0A] mt-1 leading-none">
                      ₹{tx.amount.toLocaleString("en-IN")}
                    </div>
                    <div className="text-[11.5px] text-[#6B7280] mt-1">
                      {tx.title} · {tx.brandName}
                    </div>
                    {!hasUtr && (
                      <div className="mt-2.5 px-3 py-2 rounded-[10px] bg-[#FFFBEB] border border-[#FDE68A] text-[11.5px] leading-snug text-[#92400E]">
                        The amount will reach your bank account in 1–2 working days.
                      </div>
                    )}
                  </div>

                  <div className="mt-4 rounded-[16px] bg-[#F8F8FB] p-3.5 flex flex-col gap-2">
                    <div className="flex justify-between text-[12px]">
                      <span className="text-[#6B7280]">Gross deal value</span>
                      <span className="font-semibold text-[#0A0A0A]">
                        ₹{(tx.grossAmount || tx.amount).toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="flex justify-between text-[12px]">
                      <span className="text-[#6B7280]">Convenience fee &amp; TDS</span>
                      <span className="font-semibold text-[#0A0A0A]">
                        −₹{(tx.feeAmount || 0).toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="h-[1px] bg-[#EAEAF0]" />
                    <div className="flex justify-between text-[13px]">
                      <span className="font-semibold text-[#0A0A0A]">{hasUtr ? "Final amount disbursed" : "Amount you will receive"}</span>
                      <span className={`font-bold ${hasUtr ? "text-[#059669]" : "text-[#B45309]"}`}>
                        ₹{tx.amount.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>

                  <div className={`mt-3 rounded-[16px] border overflow-hidden ${hasUtr ? "border-[#E2E8F0]" : "border-[#FDE68A]"}`}>
                    <div className={`p-3 flex items-center justify-between gap-3 ${hasUtr ? "bg-[#FBFBFD] border-b border-[#EEF1F5]" : "bg-[#FFFBEB]"}`}>
                      <div className="min-w-0">
                        <div className={`text-[11px] font-medium tracking-wider uppercase ${hasUtr ? "text-[#6B7280]" : "text-[#B45309]"}`}>
                          UTR / Reference no.
                        </div>
                        {hasUtr ? (
                          <div className="text-[14px] font-bold text-[#0A0A0A] mt-0.5 break-all">{tx.utr}</div>
                        ) : (
                          <div className="text-[12px] font-medium text-[#92400E] mt-1 leading-snug" data-testid="receipt-utr-pending">
                            Your UTR number will show here once the amount reaches your account.
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={!hasUtr}
                        onClick={() => hasUtr && copyToClipboard(tx.utr)}
                        className={`h-8 px-3 rounded-[8px] text-[11.5px] font-bold flex items-center gap-1.5 shrink-0 transition-all ${
                          hasUtr ? "bg-[#7C3AED] text-white active:scale-95 cursor-pointer" : "bg-[#FDE68A]/60 text-[#B45309]/60 cursor-not-allowed"
                        }`}
                      >
                        <Copy className="w-3 h-3" />
                        Copy
                      </button>
                    </div>

                    {hasUtr && (
                      <div className="p-3 flex flex-col gap-2 text-[12px]">
                        {destination && (
                          <div className="flex justify-between gap-3">
                            <span className="text-[#6B7280]">Destination</span>
                            <span className="font-semibold text-[#0A0A0A] text-right">{destination}</span>
                          </div>
                        )}
                        {!upi && ifsc && (
                          <div className="flex justify-between gap-3">
                            <span className="text-[#6B7280]">IFSC</span>
                            <span className="font-semibold text-[#0A0A0A]">{ifsc}</span>
                          </div>
                        )}
                        <div className="flex justify-between gap-3">
                          <span className="text-[#6B7280]">Channel</span>
                          <span className="font-semibold text-[#0A0A0A]">{channel}</span>
                        </div>
                        {tx.disbursedAt && !Number.isNaN(new Date(tx.disbursedAt).getTime()) && ( /* v332: no "Invalid Date" */
                          <div className="flex justify-between gap-3">
                            <span className="text-[#6B7280]">Disbursed at</span>
                            <span className="font-semibold text-[#0A0A0A] text-right">
                              {new Date(tx.disbursedAt).toLocaleDateString("en-IN", {
                                day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata", /* v330: IST */
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}

            {/* Actions: Download GST invoice & Discrepancy Support */}
            <button
              onClick={() => {
                setShowInvoiceModal(selectedReceiptTx.txObj || selectedReceiptTx);
              }}
              className="mt-4 w-full h-12 rounded-[14px] border-[1.5px] border-[#DDD0FF] bg-white text-[#7C3AED] font-semibold text-[13.5px] flex items-center justify-center gap-2 active:scale-[0.99] transition-all cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              {platformTax.gstRegistered ? "Download GST invoice / voucher" : "Download receipt"}{/* Session 58: "GST invoice" only once GST is switched on */}
            </button>

            <button
              onClick={() => {
                navigate("/help/tickets");
              }}
              className="mt-2.5 w-full h-10 rounded-[12px] bg-[#F2F2F7] text-[#4B5563] text-[12px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Discrepancy? Contact finance support
            </button>

            <button
              onClick={() => setSelectedReceiptTx(null)}
              className="mt-2 w-full h-9 text-[#6B7280] text-[12px] font-medium cursor-pointer"
            >
              Close receipt
            </button>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* Deliverable Proof Preview Modal */}
      <Presence>{showProofModal && (
        <PopupBackdrop className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <PopupPanel kind="modal" className="bg-white rounded-[20px] p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E5EA]">
              <div className="flex items-center gap-2">
                                <h4 className="text-[14px] font-bold text-[#0A0A0A]">Deliverable Proof</h4>
              </div>
              <button
                type="button"
                aria-label="Close" /* v330 */
                onClick={() => setShowProofModal(null)}
                className="w-10 h-10 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[#6B7280]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-col items-center">
              {/* v353: the black "video preview" box showed nothing (no real thumbnail) — just the title now */}
              <div className="w-full text-[14px] font-semibold text-[#0A0A0A] truncate">{showProofModal.title}</div>
              <div className="mt-3 w-full p-3 rounded-[12px] bg-[#F8F8FB] text-[12px] text-[#4B5563] flex flex-col gap-1">
                <div className="flex justify-between">
                  <span>Uploaded:</span>
                  <span className="font-semibold text-[#0A0A0A]">{shortDate(showProofModal.submittedAt) || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className="font-semibold text-[#059669]">{showProofModal.submittedAt ? "Brand reviewing" : "Not submitted yet"}{/* v330 */}</span>
                </div>
              </div>

              <button
                onClick={() => {
                  // v330: this button only showed a "opened" toast and opened nothing. The content lives
                  // in the deal's chat, so it now opens that chat.
                  const tid = showProofModal.threadId;
                  setShowProofModal(null);
                  setSelectedActiveDeal(null);
                  navigate(tid ? `/chat/${tid}` : "/chat");
                }}
                className="mt-4 w-full h-11 rounded-[12px] bg-[#7C3AED] text-white font-semibold text-[13px] active:scale-95 transition-all cursor-pointer"
              >
                Open in deal chat
              </button>
            </div>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* Tax Invoice Modal */}
      <Presence>{showInvoiceModal && (
        <InvoiceModal key="invoicemodal"
          transaction={showInvoiceModal}
          isBrand={false}
          creatorName={user?.name || user?.full_name || "You"} /* v353: was always "You" (also in the PDF) */
          brandName={showInvoiceModal.brand_name || showInvoiceModal.brandName || showInvoiceModal.brand?.company_name || "A brand"} /* v353: raw tx has brand_name */
          onClose={() => setShowInvoiceModal(null)}
        />
      )}</Presence>
    </div>
  );
}

// ER-04 / ER-04b · one request for all ready money (POST /creator/payout-request-ready, backend/creatorPayoutRequests.ts).
function RequestAllSheet({ amount, items, destination, reminder, onChange, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
  const names = (items || []).map((i) => i.title).filter(Boolean);
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await api.post("creator/payout-request-ready", {});
      setDone(data || { ok: true });
      onDone?.();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Couldn't send the request. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <PopupBackdrop className="fixed inset-0 z-50 bg-slate-900/50 flex flex-col justify-end">
      <PopupPanel kind="sheet" onClose={onClose} className="bg-white rounded-t-[24px] p-5 max-h-[88vh] overflow-y-auto shadow-2xl" style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" /* v332 */ }} data-testid="earnings-request-sheet">
        <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-4" />
        {done ? (
          <div className="flex flex-col items-center text-center py-2">
            <div className="w-14 h-14 rounded-full bg-[#E3F7EE] flex items-center justify-center"><Check className="w-7 h-7 text-[#0E9F6E] stroke-[3]" /></div>
            <div className="text-[20px] font-extrabold text-[#0A0A0A] mt-3">Payout requested</div>
            <div className="text-[13.5px] text-[#6B7280] mt-1.5 leading-relaxed">
              {inr(done.amount ?? amount)} is on its way{destination ? ` to ${destination}` : ""}. Expect it in 1–2 working days. You'll get the UTR number in the Paid tab.
            </div>
            <button type="button" onClick={onClose} className="mt-5 w-full h-12 rounded-[14px] bg-[#7C3AED] text-white font-bold text-[15px]">Back to Earnings</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="text-[19px] font-extrabold text-[#0A0A0A]">{reminder ? "Send a payout reminder" : "Request payout"}</div>
              <button type="button" aria-label="Close" onClick={onClose} className="w-10 h-10 rounded-full bg-[#F2F0F6] flex items-center justify-center"><X className="w-4 h-4 text-[#6B7280]" /></button>
            </div>
            <div className="mt-4 rounded-[16px] bg-[#F7F6FA] p-4">
              <div className="text-[12px] font-semibold text-[#6B7280]">Amount</div>
              <div className="text-[30px] font-extrabold text-[#0A0A0A] leading-tight">{inr(amount)}</div>
              <div className="text-[12px] text-[#6B7280] mt-1 line-clamp-2">All ready money{names.length ? ` · ${names.join(" + ")}` : ""}</div>
            </div>
            <div className="mt-3 rounded-[16px] border border-[#EEEDF3] divide-y divide-[#F0EEF4] text-[13.5px]">
              <div className="flex items-center justify-between gap-3 p-3.5">
                <span className="text-[#6B7280]">To</span>
                <span className="flex items-center gap-2 min-w-0"><span className="font-semibold text-[#0A0A0A] truncate">{destination}</span><button type="button" onClick={onChange} className="text-[#7C3AED] font-bold shrink-0">Change</button></span>
              </div>
              <div className="flex justify-between p-3.5"><span className="text-[#6B7280]">Arrives</span><span className="font-semibold text-[#0A0A0A]">In 1–2 working days</span></div>
              <div className="flex justify-between p-3.5"><span className="text-[#6B7280]">Payout charge</span><span className="font-semibold text-[#0E7A55]">₹0</span></div>
            </div>
            <button type="button" onClick={confirm} disabled={busy} className="mt-4 w-full h-12 rounded-[14px] bg-[#7C3AED] text-white font-bold text-[15px] disabled:opacity-60">
              {busy ? <ButtonSpinner label="Sending…" /> /* v332: standard spinner */ : reminder ? "Send reminder" : `Confirm payout · ${inr(amount)}`}
            </button>
            <div className="text-[12px] text-[#6B7280] text-center mt-2.5">You'll get a notification with the UTR number once it's sent.</div>
          </>
        )}
      </PopupPanel>
    </PopupBackdrop>
  );
}
