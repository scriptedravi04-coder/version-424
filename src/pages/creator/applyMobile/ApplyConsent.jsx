import React from "react";

// Session 34 (Ravi): no separate updates box — the line above Submit covers Terms, Privacy and
// update emails (campaigns, application status, Ybex updates). Links open in a new tab.
export default function ApplyConsent({ compact = false }) {
  const link = { color: "#7C3AED", fontWeight: 700, textDecoration: "underline" };
  return (
    <div data-testid="apply-consent" style={{ marginBottom: compact ? 10 : 14, font: `500 ${compact ? 11.5 : 12.5}px/1.5 'DM Sans',system-ui,sans-serif`, color: "#6B6B76" }}>
      By submitting, you confirm you are 14 or older and agree to the{" "}
      <a href="/info/terms" target="_blank" rel="noopener noreferrer" style={link}>Terms</a> and{" "}
      <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={link}>Privacy Policy</a>, including emails about your application, new campaigns and Ybex updates.
    </div>
  );
}
