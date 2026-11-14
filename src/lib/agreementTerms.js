// Session 30 — Agreement v1 (Ravi's decisions, session 28): company "Ybex Media", Jaipur
// (arbitration + courts), a campaign post stays live at least 90 days, the content licence is
// NON-exclusive, and OTP signing is "accepted electronically" (Section 10A, IT Act 2000) — not a
// Section 3A e-signature. One source for every signing screen (desktop + mobile, campaign + UGC),
// so what the screen shows is exactly what is stored in the signature record.

export const POST_LIVE_DAYS = 90;
export const CAMPAIGN_LICENCE_MONTHS = 12;
export const UGC_LICENCE_MONTHS = 6;

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const ACCEPTANCE =
  "You accept this agreement electronically by entering the one-time code sent to your registered email " +
  "(Section 10A, Information Technology Act, 2000). Ybex keeps a record of the text you accepted, the time and " +
  "the verified email, and both sides can see it.";

const DISPUTES =
  "Raise any problem with Ybex support first; we will try to resolve it with both sides. If it is not resolved " +
  "within 30 days, it goes to arbitration by a sole arbitrator seated in Jaipur, Rajasthan, under the Arbitration " +
  "and Conciliation Act, 1996. Indian law applies and the courts at Jaipur have jurisdiction.";

/** Campaign (sponsored post) agreement between a brand and a creator. */
export function campaignAgreement({ brandName, creatorName, amount, deliverables = [], deadlineText, revisions = 1 } = {}) {
  const brand = brandName || "the Brand";
  const creator = creatorName || "the Creator";
  const items = deliverables.length ? deliverables : ["The deliverables agreed in this chat"];
  const rev = Math.max(0, Number(revisions) || 0);
  const keyPoints = [
    { label: "Agreed fee", value: inr(amount), hint: "Held in secure payment hold", tone: "green" },
    { label: "Delivery by", value: deadlineText || "As agreed", hint: "First draft" },
    { label: "Revisions", value: rev ? `Up to ${rev}` : "None", hint: "Within the brief" },
    { label: "Stays live", value: `${POST_LIVE_DAYS} days`, hint: "Minimum, after posting" },
    { label: "Usage rights", value: `${CAMPAIGN_LICENCE_MONTHS} months`, hint: "Non-exclusive" },
    { label: "Disclosure", value: "#ad", hint: "Paid partnership label" },
  ];
  const clauses = [
    { title: "Parties", body: `This agreement is between ${brand} ("Brand") and ${creator} ("Creator"). Ybex Media, Jaipur ("Ybex") runs the platform and holds the payment in a secure payment hold. Ybex is not a party to the content work itself.` },
    { title: "Scope of work", body: "The Creator will make and publish: " + items.join("; ") + "." },
    { title: "Timeline and revisions", body: `The first draft is due by ${deadlineText || "the date agreed in this chat"}. The Brand may ask for ${rev ? plural(rev, "revision", "revisions") : "no revisions"} within the agreed brief; requests outside the brief can be declined.` },
    { title: "Payment and secure payment hold", body: `The Brand pays ${inr(amount)} into a secure payment hold before work starts. It is released to the Creator after the Brand approves the final content and the live link. The Convenience fee & TDS (as required by law) are deducted as shown on the platform. Payments made outside Ybex are not protected.` },
    { title: "Posting and disclosure", body: `The Creator posts only the approved content, keeps it live for at least ${POST_LIVE_DAYS} days, and labels it clearly as a paid partnership (for example #ad or the platform's "Paid partnership" tag), following ASCI guidelines.` },
    { title: "Content licence", body: `The Creator keeps ownership of the content. On payment release the Brand gets a non-exclusive licence for ${CAMPAIGN_LICENCE_MONTHS} months to repost and boost the delivered content on its own channels, with credit to the Creator.` },
    { title: "Cancellation and refunds", body: "Either side can cancel before the first draft is submitted; the secure payment hold is then refunded to the Brand under the Ybex refund policy. After a draft is submitted, a cancellation or refund is decided through Ybex support." },
    { title: "Conduct", body: "The Brand is responsible for the accuracy of its product claims. The Creator will not make claims the Brand has not approved, and neither side will share the other's private information." },
    { title: "Disputes and law", body: DISPUTES },
    { title: "Electronic acceptance", body: ACCEPTANCE },
  ];
  return { title: "Campaign agreement", keyPoints, clauses };
}

/** UGC (video-only, no posting) agreement between a creator and the brand behind a brief. */
// v427 (Ravi approved: "haan kr do"): the Deliverable clause follows the brief's format. It used to say
// "edited video … does not need to post it" for every brief — wrong for raw briefs and the opposite of a collab reel.
export function ugcDeliverableText(deliverableType = "", videoDuration = "") {
  const t = String(deliverableType || "").toLowerCase();
  const len = String(videoDuration || "").trim();
  if (t.includes("collab")) {
    return `One ${len ? len + ", " : ""}9:16 reel made to the brief. The Creator will post it on their own Instagram as a Collab post with the Brand and keep it live.`;
  }
  if (t.includes("raw") || t.includes("draft")) {
    return `Raw, unedited ${len ? len + " " : ""}9:16 video clips with clear audio, made to the brief. No editing or subtitles needed. The Creator does not need to post them.`;
  }
  return `One ${len || "30–60 second"}, 9:16 edited video with clear audio and subtitles, made to the brief. The Creator does not need to post it.`;
}

export function ugcAgreement({ brandName, creatorName, briefTitle, payout, hours = 24, revisions = 2, deliverableType = "", videoDuration = "" } = {}) {
  const brand = brandName || "the Brand";
  const creator = creatorName || "the Creator";
  const rev = Math.max(0, Number(revisions) || 0);
  const keyPoints = [
    { label: "Payout", value: inr(payout), hint: "In secure payment hold", tone: "green" },
    { label: "Deadline", value: `${hours} hours`, hint: "From signing" },
    { label: "Revisions", value: `Up to ${rev}`, hint: "Brand requests" },
    { label: "Usage rights", value: `${UGC_LICENCE_MONTHS} months`, hint: "Non-exclusive · organic + ads" },
  ];
  const clauses = [
    { title: "Parties", body: `This agreement is between ${creator} ("Creator") and ${brand} ("Brand") for the brief "${briefTitle || "UGC video"}". Ybex Media, Jaipur ("Ybex") runs the platform and holds the payment in a secure payment hold. Ybex is not a party to the content work itself.` },
    { title: "Deliverable", body: ugcDeliverableText(deliverableType, videoDuration) },
    { title: "Timeline", body: `The first draft is due within ${hours} hours of signing. If it is not submitted in time, the order is cancelled and the secure payment hold goes back to the Brand.` },
    { title: "Revisions", body: `The Brand may ask for up to ${plural(rev, "revision", "revisions")}. Requests outside the agreed brief can be declined.` },
    { title: "Payment", body: `${inr(payout)} is held in a secure payment hold and released to the Creator's bank or UPI within 1–2 working days of final approval. The Convenience fee (platform fee + GST) & TDS (as required by law) are deducted from this payout as shown on the platform.` }, // v347 (Ravi approved): disclose the fee, same wording as the campaign clause
    { title: "Content licence", body: `The Creator keeps ownership. On approval the Brand gets a non-exclusive licence for ${UGC_LICENCE_MONTHS} months to use the video on its own channels and in paid ads.` },
    { title: "Disputes and law", body: DISPUTES },
    { title: "Electronic acceptance", body: ACCEPTANCE },
  ];
  return { title: "Creator agreement", keyPoints, clauses };
}

/** Plain-text PDF of an agreement (jsPDF, loaded only when the user asks for it). */
export async function downloadAgreementPdf(agreement, { fileName = "ybex-agreement.pdf", subtitle = "" } = {}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  let y = M;
  const line = (text, { size = 10, bold = false, gap = 4 } = {}) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    // jsPDF's standard font has no ₹ glyph → write "Rs." in the PDF only.
    const rows = doc.splitTextToSize(String(text).replace(/₹/g, "Rs. "), W - M * 2);
    for (const r of rows) {
      if (y > H - M) { doc.addPage(); y = M; }
      doc.text(r, M, y);
      y += size * 1.35;
    }
    y += gap;
  };
  line(agreement.title, { size: 16, bold: true });
  if (subtitle) line(subtitle, { size: 10 });
  line("Key terms", { size: 12, bold: true, gap: 2 });
  agreement.keyPoints.forEach((k) => line(`${k.label}: ${k.value}${k.hint ? ` (${k.hint})` : ""}`, { gap: 0 }));
  y += 8;
  agreement.clauses.forEach((c, i) => {
    line(`${i + 1}. ${c.title}`, { size: 11, bold: true, gap: 0 });
    line(c.body, { gap: 6 });
  });
  line(`Generated by Ybex on ${new Date().toLocaleString("en-IN")}.`, { size: 8 });
  doc.save(fileName);
}

/** The exact text shown on screen, for the signature record (same source as the screen). */
export function agreementPlainText(agreement) {
  if (!agreement) return "";
  const keys = agreement.keyPoints.map((k) => `${k.label}: ${k.value}${k.hint ? ` (${k.hint})` : ""}`).join("\n");
  const body = agreement.clauses.map((c, i) => `${i + 1}. ${c.title}. ${c.body}`).join("\n\n");
  return `${agreement.title}\n\n${keys}\n\n${body}`;
}

/** Element-like object for agreementFields(), so the stored text is the agreement text itself. */
export const asCaptureSource = (agreement) => ({ innerText: agreementPlainText(agreement) });
