// Session 28: the signing screens send the agreement text they actually showed, so the server can
// keep it in the permanent signature record (backend/agreementRecord.ts). Same clean-up rules as
// the server's normalizeAgreementText, so the stored text is the visible text.
// Session 30: v1 = the agreement in src/lib/agreementTerms.js (Ybex Media, Jaipur, 90 days live,
// non-exclusive licence, electronic acceptance under Section 10A).
export const AGREEMENT_VERSIONS = {
  campaignDesktop: "campaign-v1-desktop",
  campaignMobile: "campaign-v1-mobile",
  ugcDesktop: "ugc-v1-desktop",
  ugcMobile: "ugc-v1-mobile",
};

export function captureAgreementText(el) {
  if (!el) return "";
  const raw = typeof el.innerText === "string" && el.innerText ? el.innerText : (el.textContent || "");
  return String(raw)
    .replace(/\r\n?/g, "\n")
    .split("\n").map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 60000);
}

/** Body fields for any /sign or /claim call. */
export function agreementFields(el, version) {
  return { agreement_text: captureAgreementText(el), agreement_version: version };
}
