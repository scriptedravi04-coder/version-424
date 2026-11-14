import React from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ArrowUpRight } from "lucide-react";

// Session 34 — design "1a" success: summary + timeline + WhatsApp + Explore. Ravi: emails go only on
// approve / reject, so the timeline says that (no "a copy is on its way").
const FONT = "'DM Sans', system-ui, sans-serif";

export default function ApplyMobileSuccess({ name, handle, email, niche, waLink }) {
  const first = String(name || "").trim().split(" ")[0] || "there";
  const rows = [
    ["Handle", handle ? `@${String(handle).replace(/^@+/, "")}` : ""],
    ["Email", email],
    ["Niche", niche],
  ].filter(([, v]) => v);
  const steps = [
    { t: "Received", d: "Your application is saved with our team.", done: true },
    { t: "Curation review · 24–48 hrs", d: "The team checks your handle, reach and sample work." },
    { t: "Listed on Explore Creators", d: "You get an email when it is approved — or why it was not." },
  ];
  return (
    <div style={{ minHeight: "100dvh", background: "#fff", fontFamily: FONT, padding: "calc(40px + env(safe-area-inset-top)) 20px calc(32px + env(safe-area-inset-bottom))", boxSizing: "border-box" }} data-testid="apply-mobile-success">
      <div style={{ width: 64, height: 64, borderRadius: 32, background: "#E9F7F0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
        <CheckCircle2 size={32} color="#15803D" />
      </div>
      <h1 style={{ margin: "18px 0 0", textAlign: "center", font: `800 24px/1.2 ${FONT}`, letterSpacing: -0.6, color: "#0B0B0F" }}>Application Received!</h1>
      <p style={{ margin: "8px 0 0", textAlign: "center", font: `500 14px/1.6 ${FONT}`, color: "#5A5A64" }}>
        Thank you, <strong style={{ color: "#0B0B0F" }}>{first}</strong>! Your profile has been sent to our curation team.
      </p>

      {rows.length > 0 && (
        <div style={{ marginTop: 22, borderRadius: 16, background: "#F7F7FA", padding: "14px 16px" }}>
          <div style={{ font: `700 10.5px/1 ${FONT}`, letterSpacing: 1.1, textTransform: "uppercase", color: "#A0A0AA", marginBottom: 10 }}>What you submitted</div>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", font: `500 14px ${FONT}` }}>
              <span style={{ color: "#8A8A94" }}>{k}</span>
              <span style={{ color: "#0B0B0F", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "65%" }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      <p style={{ margin: "16px 0 0", font: `500 13px/1.6 ${FONT}`, color: "#5A5A64" }}>
        Once approved, your profile goes live on <strong style={{ color: "#0B0B0F" }}>Explore Creators</strong> for top brands to discover and hire you.
      </p>

      <div style={{ marginTop: 18 }}>
        {steps.map((s, i) => (
          <div key={s.t} style={{ display: "flex", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: 22, height: 22, borderRadius: 11, background: s.done ? "#7C3AED" : "#fff", border: `2px solid ${s.done ? "#7C3AED" : "#DCDCE4"}`, boxSizing: "border-box" }} />
              {i < steps.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 26, background: "#EDEDF2" }} />}
            </div>
            <div style={{ paddingBottom: 14 }}>
              <div style={{ font: `700 14px ${FONT}`, color: "#0B0B0F" }}>{s.t}</div>
              <div style={{ marginTop: 3, font: `500 12.5px/1.5 ${FONT}`, color: "#8A8A94" }}>{s.d}</div>
            </div>
          </div>
        ))}
      </div>

      {/* v332: hidden if there's no WhatsApp link (it opened ".../undefined") */}
      {waLink && <a href={waLink} target="_blank" rel="noopener noreferrer" style={{ marginTop: 10, height: 54, borderRadius: 16, background: "#25D366", color: "#fff", font: `800 15px ${FONT}`, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
        Get Priority Review — Message Us
      </a>}
      {waLink && <div style={{ marginTop: 7, textAlign: "center", font: `500 11px ${FONT}`, color: "#A0A0AA" }}>Opens WhatsApp with your details already typed</div>}
      <Link to="/creators" style={{ marginTop: 12, height: 54, borderRadius: 16, border: "1px solid #E5E5E2", color: "#0B0B0F", font: `800 15px ${FONT}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, textDecoration: "none" }}>
        Explore Public Creators <ArrowUpRight size={16} />
      </Link>
    </div>
  );
}
