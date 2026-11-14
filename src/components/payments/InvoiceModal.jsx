import { FeeInfo } from "./BrandFeeSummary"; // v419
import React, { useEffect } from 'react';
import useScrollLock from "../../lib/useScrollLock"; // v415
import usePlatformTax from "../../lib/usePlatformTax";
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Download } from 'lucide-react';
import { downloadInvoicePDF } from '../../utils/invoicePdf';

import { Presence, PopupBackdrop } from "../common/Popup";
function InvoiceModalBody({ transaction, isBrand, creatorName, brandName, onClose }) {
  const tax = usePlatformTax(); // session 34: real GSTIN only when the admin switched GST on
  // v415: page behind doesn't scroll; Escape closes
  useScrollLock(Boolean(transaction));
  useEffect(() => {
    if (!transaction) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [transaction, onClose]);
  if (!transaction) return null;

  // v333: `gross_amount ?? amount` kept a stored 0 and the receipt read ₹0.00 although ₹11,700 was paid.
  const firstPositive = (...v) => { for (const x of v) { const n = Number(x); if (Number.isFinite(n) && n > 0) return n; } return 0; };
  const amount = firstPositive(transaction.gross_amount, transaction.amount, transaction.agreed_amount, transaction.deal_amount,
    Number(transaction.creator_net_amount || 0) + Number(transaction.platform_fee_amount || 0));
  // Session 58: the fee is what was stored (0 on a zero-fee deal) — never an assumed 10% / 15%, which lowered the
  // "net payout" on receipts below what the creator was actually paid.
  const storedFee = transaction.platform_fee_amount !== undefined && transaction.platform_fee_amount !== null && transaction.platform_fee_amount !== "" ? Number(transaction.platform_fee_amount) : null;
  const storedNet = transaction.creator_net_amount !== undefined && transaction.creator_net_amount !== null && transaction.creator_net_amount !== "" ? Number(transaction.creator_net_amount) : null;
  const platformFee = storedFee !== null && storedFee > 0 ? storedFee
    : (storedNet !== null && storedNet > 0 && amount > storedNet ? Math.round((amount - storedNet) * 100) / 100 : 0);
  const feePercentage = amount > 0 && platformFee > 0 ? Math.round((platformFee / amount) * 1000) / 10 : 0;
  const netAmount = Number.isFinite(storedNet) && storedNet !== null && storedNet > 0 ? storedNet : Math.round((amount - platformFee) * 100) / 100;
  // v365 (Ravi: "invoice mai convenience fee ki line"): the brand's convenience fee (split model) + coupon, and the total
  // the brand really paid. Not a GST invoice — Ybex is under the GST limit (GSTIN shows only when switched on).
  const brandFee = Math.max(0, Number(transaction.brand_fee_amount || 0) + Number(transaction.brand_fee_gst || 0));
  const brandPaid = Number(transaction.brand_paid_amount || 0) > 0 ? Number(transaction.brand_paid_amount) : amount + brandFee;
  // v416 (QA U3): fee and GST on their own lines; when only the total paid is known, the difference is the fee + GST
  const feeOnly = Math.max(0, Number(transaction.brand_fee_amount || 0));
  const feeGst = Math.max(0, Number(transaction.brand_fee_gst || 0));
  const unsplitFee = brandFee === 0 && brandPaid > amount ? Math.round((brandPaid - amount) * 100) / 100 : 0;
  const showBrandFee = isBrand && (brandFee > 0 || unsplitFee > 0 || transaction.brand_fee_pct != null);

  const formatMoney = (n) => {
    const num = Number(n) || 0;
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const receiptId = (transaction.id || "direct").toString().toUpperCase().replace('TXN_', '');
  
  const txDate = transaction.payout_completed_at || transaction.payout_released_at || transaction.updated_at || transaction.created_at;
  // v332: a receipt with no date showed today's date as if that were the payment date — and "Invalid Date" for a bad one.
  const dateStr = txDate && !Number.isNaN(new Date(txDate).getTime())
    ? new Date(txDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) // v330: IST
    : "—";
  // v332: campaign receipts said "UGC Content Deliverables"
  const isUgcTx = Boolean(transaction.ugc_order_id || transaction.order_type === "ugc" || transaction.type === "ugc_order" || transaction.deal_type === "ugc" || transaction.kind === "ugc");
  // v416 (QA U17): no "Campaign Partnership" placeholder title; a UGC payment is named as one
  const campaignName = transaction.campaign_title || transaction.title || (transaction.deals && transaction.deals.campaigns ? transaction.deals.campaigns.title : "") || (isUgcTx ? "UGC brief" : "Campaign deal");
  // v416 (QA U3): receipt no / transaction id were cut to 8–10 characters — show them in full (they wrap)
  const txnRef = String(transaction.payment_id || transaction.razorpay_payment_id || transaction.order_id || transaction.zaakpay_order_id || receiptId);

  const payer = brandName || transaction.brand_name || "A brand"; // v353: real brand name (was always "Brand Partner" on phone)
  // v353: a creator's payout that has no UTR / PAID status yet is not "transferred" — say "statement", not "receipt".
  const payoutPaid = isBrand || ["PAID", "COMPLETED"].includes(String(transaction.payout_status || "").toUpperCase()) || Boolean(transaction.utr_number || transaction.payout_reference);
  // v416 (QA U3): a UGC brief paid for several creators reads "Creators (2)", not "2 creators"
  const payeeRaw = String(transaction.payee || transaction.payee_name || creatorName || "").trim();
  const many = payeeRaw.match(/^(\d+)\s+creators?$/i);
  const payee = many ? (Number(many[1]) > 1 ? `Creators (${many[1]})` : "Creator") : (payeeRaw || "Content Creator");

  const handleDownload = () => {
    downloadInvoicePDF({ ...transaction, brand_name: payer }, isBrand, payee)?.catch?.(() => {}); // v419: same payer name as on screen
  };

  return createPortal(
    <PopupBackdrop className="fixed inset-0 z-[99999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4" onClick={onClose /* v415: click outside closes */}>
      <motion.div 
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Payment receipt"
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: "spring", duration: 0.4, bounce: 0 }}
        className="bg-white rounded-[20px] shadow-xl w-full max-w-[460px] overflow-x-hidden overflow-y-auto overscroll-contain relative font-sans max-h-[calc(100dvh-24px)]" /* Session 43 (Ravi): Android cut it off — it now fits the screen and scrolls */
      >
        {/* v419 (Ravi's Checkout.dc.html, screen 05): the receipt redesigned — same numbers and logic as before. */}
        <div className="p-5 sm:p-7 flex flex-col gap-4" style={{ fontFamily: "'DM Sans', ui-sans-serif, system-ui, sans-serif" }}>
          <div className="flex justify-between items-start gap-3">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-extrabold text-[22px] leading-[1.1] tracking-[-0.5px] text-slate-900">Ybex</span>
              <span className="text-xs font-medium text-slate-500">Ybex Media{tax.gstRegistered ? ` · GSTIN ${tax.gstin}` : ""} · Official Transaction Statement</span>
            </div>
            <span className="shrink-0 px-2 py-1 rounded-md text-[9px] font-bold tracking-[.6px]" style={{ background: "rgba(157,124,255,.1)", color: "#7C5CE6", border: "1px solid rgba(157,124,255,.3)" }}>
              {isBrand ? "PAYMENT RECEIPT" : payoutPaid ? "TRANSFER RECEIPT" : "PAYOUT STATEMENT"}
            </span>
          </div>

          <div className="grid gap-3 px-3.5 py-3 rounded-xl" style={{ gridTemplateColumns: "minmax(0,1fr) auto", background: "rgba(157,124,255,.06)", border: "1px dashed rgba(157,124,255,.4)" }}>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold tracking-[.6px] text-slate-500">RECEIPT NO</div>
              <div className="font-mono text-[13px] font-bold mt-0.5 break-all" style={{ color: "#7C5CE6" }}>{receiptId}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-semibold tracking-[.6px] text-slate-500">DATE</div>
              <div className="text-[13px] font-semibold text-slate-900 mt-0.5 whitespace-nowrap">{dateStr}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3.5 py-3 border-r border-slate-200 min-w-0">
              <div className="text-[10px] font-semibold tracking-[.6px] text-slate-500">PAYER (BRAND)</div>
              <div className="text-sm font-bold text-slate-900 mt-1 break-words">{payer}</div>
              {isBrand && transaction.brand_gstin && <div className="text-slate-600 mt-0.5 font-mono text-[11px]" data-testid="invoice-brand-gstin">GSTIN {transaction.brand_gstin}</div>}
              <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">Paid via Ybex escrow</div>
            </div>
            <div className="px-3.5 py-3 min-w-0">
              <div className="text-[10px] font-semibold tracking-[.6px] text-slate-500">{many && Number(many[1]) > 1 ? "PAYEES (CREATORS)" : "PAYEE (CREATOR)"}</div>
              <div className="text-sm font-bold text-slate-900 mt-1 break-words">{payee}</div>
              <div className="text-[11px] text-slate-500 mt-0.5 leading-snug break-all">Transaction ID: {txnRef}</div>
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex justify-between px-0.5 pb-2 border-b border-slate-200 text-[10px] font-semibold tracking-[.6px] text-slate-500"><span>ITEM DESCRIPTION</span><span>AMOUNT</span></div>
            <div className="flex justify-between items-start gap-3 px-0.5 py-3 border-b border-slate-100">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-slate-900">{campaignName}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{isUgcTx ? "UGC Content Deliverables & Production Rate" : "Campaign Content Deliverables"}</div>
              </div>
              <span className="text-[13px] font-semibold text-slate-900 tabular-nums whitespace-nowrap">{amount > 0 ? `₹${formatMoney(amount)}` : "—"}</span>
            </div>
            {showBrandFee && (
              <div className="flex justify-between items-center gap-3 px-0.5 py-3 border-b border-slate-100" data-testid="invoice-brand-fee">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-slate-900"><FeeInfo label={unsplitFee > 0 ? "Convenience fee & GST" : "Convenience fee"} withGstLine={feeGst > 0 && unsplitFee === 0} /></div>
                  {transaction.coupon_code && <div className="text-[11px] text-emerald-600 mt-0.5">Coupon {transaction.coupon_code} applied</div>}
                </div>
                <span className="text-[13px] font-semibold text-slate-900 tabular-nums whitespace-nowrap">₹{formatMoney(unsplitFee > 0 ? unsplitFee : feeGst > 0 ? feeOnly : brandFee)}</span>
              </div>
            )}
            {showBrandFee && feeGst > 0 && unsplitFee === 0 && (
              <div className="flex justify-between items-center gap-3 px-0.5 py-3 border-b border-slate-100" data-testid="invoice-brand-fee-gst">
                <div className="text-[13px] font-semibold text-slate-900">GST on convenience fee</div>
                <span className="text-[13px] font-semibold text-slate-900 tabular-nums whitespace-nowrap">₹{formatMoney(feeGst)}</span>
              </div>
            )}
            {!isBrand && (
              <div className="flex justify-between items-center gap-3 px-0.5 py-3 border-b border-slate-100">
                <div className="text-[13px] font-semibold text-slate-900">Convenience fee &amp; TDS</div>
                <span className={`text-[13px] font-semibold tabular-nums whitespace-nowrap ${platformFee > 0 ? "text-rose-500" : "text-slate-900"}`} data-testid="invoice-creator-fee">{platformFee > 0 ? "-" : ""}₹{formatMoney(platformFee)}</span>
              </div>
            )}
            <div className="flex justify-between items-center gap-3 px-0.5 py-3">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-slate-900">Ybex escrow protection</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{isBrand ? "Held safely until you approve the work" : "Paid out through Ybex escrow"}</div>
              </div>
              <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold">Included</span>
            </div>
          </div>

          <div className="flex justify-between items-center gap-3 px-4 py-3.5 rounded-xl" style={{ background: "rgba(157,124,255,.08)", border: "1px solid rgba(157,124,255,.3)" }}>
            <span className="text-[13px] font-semibold text-slate-600">{isBrand ? "Total Billed Amount" : "Net payout to creator"}</span>
            <span className="text-lg font-extrabold tabular-nums whitespace-nowrap" style={{ color: isBrand ? "#7C5CE6" : "#027A48" }}>₹{formatMoney(isBrand ? (showBrandFee ? brandPaid : amount) : netAmount)}</span>
          </div>

          <div className="text-[11px] text-slate-400 text-center" style={{ textWrap: "pretty" }}>This is a computer-generated transaction receipt issued by Ybex Media.</div>
        </div>

        <div className="no-print sticky bottom-0 grid gap-2.5 px-5 py-3.5 bg-white border-t border-slate-200" style={{ gridTemplateColumns: "1fr 1.6fr" }}>
          <button type="button" onClick={onClose} className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[13px] font-semibold transition-colors">Close</button>
          <button type="button" onClick={handleDownload} style={{ background: "#9D7CFF" }} className="h-11 rounded-xl hover:opacity-90 text-white text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors">
            <Download size={15} /> Download PDF{/* v416 (QA U31): it downloads a PDF — not "Print" */}
          </button>
        </div>
      </motion.div>
    </PopupBackdrop>,
    document.body
  );
}

// Session 37: stays mounted for its closing animation.
export default function InvoiceModal(props) {
  return <Presence>{props.transaction && <InvoiceModalBody key="invoicemodal" {...props} />}</Presence>;
}

