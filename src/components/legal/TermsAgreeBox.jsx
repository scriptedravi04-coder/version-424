import React from "react";
import { api } from "../../lib/api";
import { LEGAL_LINKS } from "../../lib/legal/legalContent";

// Session 34 (legal draft Part E): required box at the LAST onboarding step, creator and brand,
// mobile and desktop. Covers Google sign-ups too (they saw only a line, no box, at signup).
export default function TermsAgreeBox({ role, checked, onChange, compact = false }) {
  const roleLink = role === "brand" ? LEGAL_LINKS.brandTerms : LEGAL_LINKS.creatorTerms;
  const roleName = role === "brand" ? "Brand Terms" : "Creator Terms";
  const a = { color: "#7C3AED", fontWeight: 700, textDecoration: "underline" };
  return (
    <label data-testid="onboarding-terms-box" style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", margin: compact ? "0 0 12px" : "0 0 16px", font: `500 ${compact ? 12.5 : 13}px/1.5 'DM Sans',system-ui,sans-serif`, color: "#5A5A64", textAlign: "left" }}>
      <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} data-testid="onboarding-terms-check" style={{ marginTop: 3, width: 17, height: 17, accentColor: "#7C3AED", flexShrink: 0 }} />
      <span>
        {/* v416 (M14): a brand signs for a business — 18+ and authorised, not "14 or older" */}
        {role === "brand" ? "I am 18 or older, authorised to act for this business, and agree to the" : "I am 14 or older and agree to the"}{" "}
        <a href={LEGAL_LINKS.terms} target="_blank" rel="noopener noreferrer" style={a} onClick={(e) => e.stopPropagation()}>Terms</a>,{" "}
        <a href={LEGAL_LINKS.privacy} target="_blank" rel="noopener noreferrer" style={a} onClick={(e) => e.stopPropagation()}>Privacy Policy</a> and{" "}
        <a href={roleLink} target="_blank" rel="noopener noreferrer" style={a} onClick={(e) => e.stopPropagation()}>{roleName}</a>.
      </span>
    </label>
  );
}

/** Records the onboarding agreement. Never throws — saving the profile must not depend on it. */
export async function saveRoleConsent(role) {
  try {
    await api.post("consents", {
      source: "onboarding",
      items: [
        { kind: "terms", granted: true },
        { kind: "privacy", granted: true },
        { kind: role === "brand" ? "brand_terms" : "creator_terms", granted: true },
      ],
    });
  } catch { /* logged on the server side when it fails */ }
}
