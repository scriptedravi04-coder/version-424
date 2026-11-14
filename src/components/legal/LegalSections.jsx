import React from "react";
import { LEGAL } from "../../lib/legal/legalContent";

// Session 34: renders one page from src/lib/legal/legalContent.js (the only place legal text lives).
export default function LegalSections({ page }) {
  if (!page) return null;
  return (
    <div className="space-y-5 text-sm text-[var(--text-secondary)] leading-relaxed" data-testid="legal-sections">
      <p className="text-xs font-mono text-[var(--text-tertiary)]">Last updated: {LEGAL.lastUpdated} · {LEGAL.company}</p>
      {page.intro && <p>{page.intro}</p>}
      {page.sections.map((s) => (
        <section key={s.h}>
          <h3 className="text-base font-bold text-[var(--text-primary)] mt-5 mb-2">{s.h}</h3>
          {(s.p || []).map((t, i) => <p key={i} className="mb-2">{t}</p>)}
          {s.list && (
            <ul className="list-disc pl-5 space-y-1.5">
              {s.list.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
