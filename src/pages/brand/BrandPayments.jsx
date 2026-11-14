import React, { useState, useEffect } from "react";
import BrandRefundsCard from "../../components/payments/BrandRefundsCard";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import StatsCard from "../../components/dashboard/StatsCard";
import { Wallet, Coins, RotateCcw, ShieldCheck, FileText } from "lucide-react";
import useIsMobile from "../../hooks/useIsMobile";
import BrandPaymentsMobile, { paymentsSummary, overviewItemToTx } from "../../components/payments/BrandPaymentsMobile";
import PaymentsRetryCard from "../../components/common/PaymentsRetryCard";
import InvoiceModal from "../../components/payments/InvoiceModal";
import { Presence } from "../../components/common/Popup";

// v415: a stalled request can't keep the page on the skeleton forever
const timeout = (p, ms = 12000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

// v416 (QA U1): desktop and phone read ONE source — GET /brand/payments-overview (campaign deals + UGC briefs +
// every refund). Desktop used to read the old escrow list only (no UGC, "Released ₹0") while the phone read the
// overview, so the two screens showed different money.
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
const when = (d) => { const x = d ? new Date(d) : null; return x && !Number.isNaN(x.getTime()) ? x.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—"; };
const STATUS = {
  escrow: ["In escrow", "bg-amber-50 text-amber-700 border-amber-200"],
  released: ["Released", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  cancelled: ["Cancelled · refund to you", "bg-slate-100 text-slate-600 border-slate-200"],
};

export function PaymentsOverviewList({ items = [], onReceipt }) {
  if (!items.length) {
    return (
      <div className="bg-[var(--bg-card)] border border-dashed border-[var(--border-default)] rounded-[12px] p-12 text-center text-[var(--text-secondary)] text-sm">
        No payments yet. When you pay for a deal or a UGC brief, it shows here with its status and receipt.
      </div>
    );
  }
  return (
    <ul className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-[12px] divide-y divide-[var(--border-default)]" data-testid="brand-payments-list">
      {items.map((it) => {
        const [label, cls] = STATUS[it.status] || STATUS.escrow;
        return (
          <li key={it.id} className="p-4 flex flex-wrap items-center gap-x-4 gap-y-2" data-testid={`brand-pay-desk-row-${it.status}`}>
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-bold text-sm text-[var(--text-primary)] truncate" title={it.title}>{it.title || (it.kind === "ugc" ? "UGC brief" : "Campaign deal")}</span>
                <span className="text-[10px] font-bold tracking-wide px-1.5 py-[1px] rounded bg-[var(--bg-elevated)] text-[var(--text-secondary)] shrink-0">{it.kind === "ugc" ? "UGC" : "CAMPAIGN"}</span>
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                {[it.who, when(it.date), it.status === "escrow" ? it.detail : null].filter(Boolean).join(" · ")}
              </div>
            </div>
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${cls}`}>{label}</span>
            <span className="font-extrabold text-[var(--text-primary)] text-base w-[110px] text-right shrink-0">{inr(it.amount)}</span>
            <button type="button" onClick={() => onReceipt?.(it)} className="min-h-[40px] px-3 rounded-lg text-xs font-bold text-[var(--violet)] hover:bg-[var(--violet)]/10 flex items-center gap-1 shrink-0">
              <FileText size={14} /> Receipt
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function BrandPayments() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null); // null = loading, false = failed, object = loaded
  const [brandGstin, setBrandGstin] = useState("");
  const [brandCompanyName, setBrandCompanyName] = useState("");
  const [receipt, setReceipt] = useState(null);
  const isMobile = useIsMobile();

  const loadOverview = () => timeout(api.get("brand/payments-overview", { bypassCache: true }))
    .then(({ data }) => setOverview(data?.ok ? data : false))
    .catch(() => setOverview(false));

  useEffect(() => {
    loadOverview();
    // v415: KYC / GST and brand name are read side by side
    Promise.all([
      timeout(api.get("verifications/me")).then((r) => r?.data).catch(() => null),
      timeout(api.get("brand-profile")).then((r) => r?.data).catch(() => null),
    ]).then(([kycRes, bProfile]) => {
      if (kycRes?.documents) {
        const g = (kycRes.documents.gstin || kycRes.documents.gst_cert || "").trim();
        if (g) setBrandGstin(g);
        if (kycRes.documents.company_name) setBrandCompanyName(kycRes.documents.company_name);
      }
      if (bProfile) {
        if (bProfile.company_name || bProfile.name) setBrandCompanyName((prev) => prev || bProfile.company_name || bProfile.name);
        if (bProfile.gstin || bProfile.gst_number) setBrandGstin((prev) => prev || String(bProfile.gstin || bProfile.gst_number).trim());
      }
    });
  }, []);

  // v415: phones get their own screen straight away (it shows its own skeleton)
  if (isMobile) {
    return (
      <BrandPaymentsMobile
        overview={overview}
        onReloadOverview={loadOverview}
        listFailed={overview === false}
        companyName={brandCompanyName}
        gstin={brandGstin}
        onBack={() => navigate(-1)}
      />
    );
  }

  if (overview === null) {
    // v415: same boxes as the loaded page (title row, 3 cards, list) so nothing jumps when data arrives
    return (
      <div className="w-full max-w-none text-left font-sans pb-8 animate-pulse" aria-busy="true" data-testid="brand-payments-skeleton">
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2"><div className="h-8 w-40 bg-slate-200/70 rounded-lg" /><div className="h-4 w-80 max-w-full bg-slate-200/50 rounded" /></div>
          <div className="h-8 w-56 bg-slate-200/50 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-8">
          {[0, 1, 2].map((i) => <div key={i} className="h-[92px] bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl" />)}
        </div>
        <div className="h-3 w-28 bg-slate-200/60 rounded mb-4" />
        <div className="h-[240px] bg-[var(--bg-card)] border border-[var(--border-default)] rounded-[12px]" />
      </div>
    );
  }

  if (overview === false) {
    return (
      <div className="w-full max-w-xl mx-auto pt-10 pb-8" data-testid="brand-payments-page">
        <h1 className="font-sans text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)] mb-6">Payments</h1>
        <PaymentsRetryCard onRetry={loadOverview} />
      </div>
    );
  }

  const sum = paymentsSummary(overview) || { held: 0, released: 0, refunded: 0, hasRefundAccount: false };
  const items = Array.isArray(overview.items) ? overview.items : [];

  return (
    <div className="w-full max-w-none text-left font-sans pb-8" data-testid="brand-payments-page">
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-sans text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            Payments
          </h1>{/* v415: plain title (was the old "ledger" title) */}
          <p className="text-[var(--text-secondary)] text-xs sm:text-sm mt-1">
            Money you pay for a deal stays in escrow with Ybex and is released to the creator only after you approve the work.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold bg-[var(--green)]/10 text-[var(--green)] border border-[var(--green)]/20 p-2 px-3 rounded-xl self-start sm:self-auto whitespace-nowrap shrink-0">
          <ShieldCheck size={14} /> <span className="whitespace-nowrap">Payment protected</span>{/* v418 */}
        </div>
      </div>

      {/* v416 (QA U1): In escrow / Released to creators / Refunded — same numbers as the phone screen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-8">
        <StatsCard label="In escrow" value={sum.held} prefix="₹" icon={Coins} />
        <StatsCard label="Released to creators" value={sum.released} prefix="₹" icon={Wallet} />
        <StatsCard label="Refunded to you" value={sum.refunded} prefix="₹" icon={RotateCcw} />
      </div>

      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2 font-sans">
          Transactions
        </h3>
        <PaymentsOverviewList items={items} onReceipt={(it) => setReceipt(overviewItemToTx(it))} />
      </div>

      {/* Session 36: refunds (status, UTR, refund account) — v416: campaign + UGC, from the same overview */}
      <BrandRefundsCard className="mt-6" refunds={overview.refunds || []} hasRefundAccount={sum.hasRefundAccount} onChanged={loadOverview} />

      <Presence>{receipt && (
        <InvoiceModal key="invoicemodal"
          transaction={receipt}
          isBrand
          creatorName={receipt.creator_name || "Creator"}
          brandName={brandCompanyName}
          onClose={() => setReceipt(null)}
        />
      )}</Presence>
    </div>
  );
}
