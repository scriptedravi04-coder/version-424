import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { IN_APP_CARDS, LEGAL, LEGAL_LINKS } from "../../lib/legal/legalContent";

// Session 34 (Ravi): in the app, only short cards — creator panel = creator + common, brand panel =
// brand + common. Full text stays on the public pages ("Read full …" links). Shows when the Terms
// were accepted and lets the user turn offers and promotions on/off (saved as a consent record).
// Session 43 (v283, Ravi): offers are ON by default — no saved choice means on; switching off is saved.
// Campaign / account / Ybex update emails are part of the Terms (Ravi, session 34) — no separate switch.
export default function LegalPanel({ role, compact = false }) {
  const [consents, setConsents] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    api.get("consents/me").then((r) => { if (alive) setConsents(r?.data?.consents || {}); }).catch(() => { if (alive) setConsents({}); });
    return () => { alive = false; };
  }, []);

  const cards = IN_APP_CARDS.filter((c) => c.role === role || c.role === "common");
  const accepted = consents?.terms?.granted ? consents.terms : null;
  const marketingOn = consents?.marketing ? Boolean(consents.marketing.granted) : true;

  const toggleMarketing = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await api.post("consents", { source: "settings", items: [{ kind: "marketing", granted: !marketingOn }] });
      setConsents(data?.consents || consents);
      toast.success(!marketingOn ? "Offers and promotions turned on." : "Offers and promotions turned off.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const link = "text-[var(--violet)] font-semibold hover:underline";
  return (
    <div className="space-y-4" data-testid="legal-panel">
      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface,#fff)] p-4">
        <div className="text-sm font-bold text-[var(--text-primary)]">Your agreement</div>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {/* v332: no "Invalid Date" when the record has no date; dates in IST */}
          {accepted && accepted.at && !Number.isNaN(new Date(accepted.at).getTime())
            ? `You accepted the Terms (v${accepted.version || LEGAL.termsVersion}) on ${new Date(accepted.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}.`
            : accepted
              ? `You accepted the Terms (v${accepted.version || LEGAL.termsVersion}).`
              : "You accepted the Terms when you created your account."}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
          <a href={LEGAL_LINKS.terms} target="_blank" rel="noopener noreferrer" className={link}>Read full Terms</a>
          <a href={LEGAL_LINKS.privacy} target="_blank" rel="noopener noreferrer" className={link}>Privacy Policy</a>
          <a href={LEGAL_LINKS.refunds} target="_blank" rel="noopener noreferrer" className={link}>Refund Policy</a>
          <a href={role === "brand" ? LEGAL_LINKS.brandTerms : LEGAL_LINKS.creatorTerms} target="_blank" rel="noopener noreferrer" className={link}>
            {role === "brand" ? "Brand Terms" : "Creator Terms"}
          </a>
        </div>
        <div className="mt-4 pt-3 border-t border-[var(--border-default)] flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-[var(--text-primary)]">Offers and promotions</div>
            <div className="text-[11px] text-[var(--text-tertiary)]">Discounts and special offers. Account, deal, campaign and Ybex update messages always come.</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={marketingOn}
            onClick={toggleMarketing}
            disabled={busy || consents === null}
            data-testid="legal-marketing-toggle"
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${marketingOn ? "bg-[var(--violet)]" : "bg-slate-300"}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${marketingOn ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
      </div>

      <div className={compact ? "space-y-2.5" : "grid grid-cols-1 md:grid-cols-2 gap-3"}>
        {cards.map((c) => (
          <div key={c.h} className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface,#fff)] p-4">
            <div className="text-[13px] font-bold text-[var(--text-primary)]">{c.h}</div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{c.p}</p>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-[var(--text-tertiary)]">
        Questions or complaints: Grievance Officer {LEGAL.grievanceOfficer}, <a href={`mailto:${LEGAL.emails.grievance}`} className={link}>{LEGAL.emails.grievance}</a>
      </p>
    </div>
  );
}
