
/**
 * Generates and downloads a beautifully styled, high-fidelity PDF invoice receipt
 * for campaign payouts on Ybex.
 * 
 * @param {Object} transaction 
 * @param {boolean} isBrand 
 * @param {string} partnerName 
 */
// v426: jsPDF (≈390 KB) is fetched only when someone downloads an invoice, not with the screen.
export const downloadInvoicePDF = async (transaction, isBrand, partnerName) => {
  if (!transaction) return;
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  // v333: same rule as InvoiceModal — a stored 0 must not hide the real amount.
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

  const formatPdfInr = (n) => {
    const num = Number(n) || 0;
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  // v416 (QA U3/U17): UGC payments are named as such (was "Campaign Partnership"); IST date, "—" when unknown
  const isUgcTx = Boolean(transaction.ugc_order_id || transaction.order_type === "ugc" || transaction.type === "ugc_order" || transaction.deal_type === "ugc" || transaction.kind === "ugc");
  const campaignName = String(transaction.campaign_title || transaction.title || (transaction.deals && transaction.deals.campaigns ? transaction.deals.campaigns.title : "") || (isUgcTx ? "UGC brief" : "Campaign deal")).slice(0, 60);
  const receiptId = (transaction.id || "direct").toString().toUpperCase().replace('TXN_', '');
  const txnRef = String(transaction.payment_id || transaction.razorpay_payment_id || transaction.order_id || transaction.zaakpay_order_id || "");
  const d0 = transaction.created_at ? new Date(transaction.created_at) : null;
  const dateStr = d0 && !Number.isNaN(d0.getTime())
    ? d0.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).toUpperCase()
    : "-";

  // v419 (Ravi's Checkout.dc.html, screen 05): the PDF looks like the on-screen receipt — white page, "Ybex" wordmark,
  // badge, dashed receipt-no / date box, payer | payee, item list, purple total box. Same numbers as before.
  const brandFee = Math.max(0, Number(transaction?.brand_fee_amount || 0) + Number(transaction?.brand_fee_gst || 0));
  const brandPaid = Number(transaction?.brand_paid_amount || 0) > 0 ? Number(transaction.brand_paid_amount) : amount + brandFee;
  // v416 (QA U3): when only the total paid is known, the difference is the fee + GST
  const unsplitFee = brandFee === 0 && brandPaid > amount ? Math.round((brandPaid - amount) * 100) / 100 : 0;
  const showBrandFee = isBrand && (brandFee > 0 || unsplitFee > 0 || transaction?.brand_fee_pct != null);
  const feeOnly = Math.max(0, Number(transaction?.brand_fee_amount || 0));
  const feeGst = Math.max(0, Number(transaction?.brand_fee_gst || 0));
  const payoutPaid = ["PAID", "COMPLETED"].includes(String(transaction.payout_status || "").toUpperCase()) || Boolean(transaction.utr_number || transaction.payout_reference);
  const badge = isBrand ? "PAYMENT RECEIVED" : payoutPaid ? "TRANSFER RECEIPT" : "PAYOUT STATEMENT";
  const payer = String(transaction.brand_name || "A brand").slice(0, 60);
  const payee = String(partnerName || transaction.payee || "Creator").slice(0, 60);
  const L = 20, R = 190, W = R - L;
  const ink = () => doc.setTextColor(15, 23, 42), muted = () => doc.setTextColor(100, 116, 139), violet = () => doc.setTextColor(124, 92, 230);
  const line = (y, c = [226, 232, 240]) => { doc.setDrawColor(...c); doc.setLineWidth(0.3); doc.line(L, y, R, y); };

  // Header
  ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(24); doc.text("Ybex", L, 30);
  muted(); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text("Ybex Media  |  Official Transaction Statement", L, 36); // built-in PDF font has no middle dot
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
  const bw = doc.getTextWidth(badge) + 8;
  doc.setFillColor(245, 242, 255); doc.setDrawColor(206, 190, 255); doc.setLineWidth(0.3);
  doc.roundedRect(R - bw, 23, bw, 8, 1.5, 1.5, "FD");
  violet(); doc.text(badge, R - bw / 2, 28.2, { align: "center" });

  // Receipt no / date (dashed box)
  doc.setFillColor(250, 248, 255); doc.setDrawColor(190, 170, 255); doc.setLineDashPattern([1.2, 1.2], 0);
  doc.roundedRect(L, 44, W, 20, 3, 3, "FD"); doc.setLineDashPattern([], 0);
  muted(); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
  doc.text("RECEIPT NO", L + 6, 51); doc.text("DATE", R - 6, 51, { align: "right" });
  violet(); doc.setFont("courier", "bold"); doc.setFontSize(10.5);
  doc.text(doc.splitTextToSize(receiptId, W - 60)[0], L + 6, 58);
  ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.text(dateStr, R - 6, 58, { align: "right" });

  // Payer | payee
  doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3); doc.roundedRect(L, 72, W, 30, 3, 3, "S"); doc.line(L + W / 2, 72, L + W / 2, 102);
  const party = (x, label, name, sub1, sub2) => {
    muted(); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.text(label, x, 80);
    ink(); doc.setFontSize(11); doc.text(doc.splitTextToSize(name, W / 2 - 12)[0], x, 87);
    muted(); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    const subs = [sub1, sub2].filter(Boolean);
    subs.forEach((t, i) => doc.text(doc.splitTextToSize(t, W / 2 - 12)[0], x, 93 + i * 5));
  };
  let payerSub1 = "Paid via Ybex escrow", payerSub2 = "";
  if (isBrand && transaction.brand_gstin) { payerSub1 = `GSTIN ${transaction.brand_gstin}`; payerSub2 = "Paid via Ybex escrow"; } // v418: only a business that gave it at KYC
  party(L + 6, "PAYER (BRAND)", payer, payerSub1, payerSub2);
  party(L + W / 2 + 6, "PAYEE (CREATOR)", payee, txnRef ? `Transaction ID: ${txnRef}` : "", isBrand ? "Razorpay (UPI / card / net banking)" : "Bank transfer via Ybex escrow");

  // Items
  let y = 114;
  muted(); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
  doc.text("ITEM DESCRIPTION", L + 1, y); doc.text("AMOUNT", R - 1, y, { align: "right" });
  line(y + 3);
  const row = (title, sub, value, opts = {}) => {
    y += 11;
    ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(title, L + 1, y);
    if (sub) { muted(); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(sub, L + 1, y + 5); }
    if (opts.pill) {
      doc.setFillColor(236, 253, 245); doc.roundedRect(R - 22, y - 4.5, 22, 7, 3.5, 3.5, "F");
      doc.setTextColor(4, 120, 87); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text(value, R - 11, y, { align: "center" });
    } else {
      if (opts.red) doc.setTextColor(225, 29, 72); else ink();
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(value, R - 1, y, { align: "right" });
    }
    y += sub ? 6 : 2;
    if (!opts.last) line(y, [241, 245, 249]);
  };
  row(campaignName, isUgcTx ? "UGC content (agreed rate)" : "Campaign content (agreed rate)", amount > 0 ? `INR ${formatPdfInr(amount)}` : "-");
  if (showBrandFee) {
    const coupon = transaction?.coupon_code ? `Coupon ${String(transaction.coupon_code).slice(0, 20)} applied` : ""; // v419: no fee percent
    row(unsplitFee > 0 ? "Convenience fee + GST" : "Convenience fee", coupon, `INR ${formatPdfInr(unsplitFee > 0 ? unsplitFee : feeGst > 0 ? feeOnly : brandFee)}`);
    if (feeGst > 0 && unsplitFee === 0) row("GST on convenience fee", "", `INR ${formatPdfInr(feeGst)}`);
  }
  if (!isBrand) row("Convenience fee & TDS", "", `${platformFee > 0 ? "-" : ""}INR ${formatPdfInr(platformFee)}`, { red: platformFee > 0 }); // v365: 0% prints plain
  const rowY = y + 11; // the protection row (kept as its own text calls)
  y = rowY;
  ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("Ybex escrow protection", L + 1, rowY);
  muted(); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(isBrand ? "Held safely until you approve the work" : "Paid out through Ybex escrow", L + 1, rowY + 5);
  doc.setFillColor(236, 253, 245); doc.roundedRect(R - 22, rowY - 4.5, 22, 7, 3.5, 3.5, "F");
  doc.setTextColor(4, 120, 87); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
  doc.text("Included", R - 11, rowY, { align: "center" }); // v415 wording; centred in the green pill
  y = rowY + 12;

  // Total box
  doc.setFillColor(245, 242, 255); doc.setDrawColor(206, 190, 255); doc.setLineWidth(0.3);
  doc.roundedRect(L, y, W, 16, 3, 3, "FD");
  doc.setTextColor(71, 85, 105); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(isBrand ? "Total Billed Amount" : "Net payout to creator", L + 6, y + 10);
  if (isBrand) violet(); else doc.setTextColor(2, 122, 72);
  doc.setFontSize(14); doc.text(`INR ${formatPdfInr(isBrand ? brandPaid : netAmount)}`, R - 6, y + 10.5, { align: "right" });
  y += 26;

  // Note + footer
  muted(); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  const note = isBrand
    ? `Ybex holds this payment in escrow and pays ${payee} after you approve the work.`
    : payoutPaid ? "Your payout has been transferred." : "Your payout is approved. It reaches your bank / UPI in 1-2 working days.";
  doc.text(doc.splitTextToSize(note, W), L + W / 2, y, { align: "center" });
  doc.setTextColor(148, 163, 184); doc.setFontSize(8);
  doc.text("This is a computer-generated transaction receipt issued by Ybex Media.", L + W / 2, 276, { align: "center" });
  doc.text("Ybex Media  |  ybexmedia.in  |  support@ybexmedia.in", L + W / 2, 281, { align: "center" });
  void feePercentage;

  // --- Save File ---
  try {
    const blob = doc.output("blob");
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = `ybex_invoice_${receiptId}.pdf`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 100);
  } catch (error) {
    console.error("Robust blob download failed, calling fallback doc.save...", error);
    doc.save(`ybex_invoice_${receiptId}.pdf`);
  }
};
