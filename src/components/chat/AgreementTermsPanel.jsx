import React, { useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { toast } from "sonner";
import { downloadAgreementPdf } from "../../lib/agreementTerms";

// Session 30: one agreement look for campaign + UGC, desktop + mobile (the UGC agreement style).
// Key terms on top, the first clauses visible, "See all terms" for the rest, and a PDF download.
// All clauses are always in the DOM (only visually clipped) so the signature record captures the
// full text the user agreed to — see captureAgreementText.

const tones = {
  green: "bg-[#EDFAF1] border-[#C6F0D3] [&_.lbl]:text-[#047857] [&_.val]:text-[#059669] [&_.hint]:text-[#047857]",
  plain: "bg-[#F8F8FA] border-[#E5E5EA] [&_.lbl]:text-[#6B7280] [&_.val]:text-[#0A0A0A] [&_.hint]:text-[#6B7280]",
};

export default function AgreementTermsPanel({ agreement, compact = false, pdfName = "ybex-agreement.pdf", pdfSubtitle = "" }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  if (!agreement) return null;
  const cols = compact ? "grid-cols-2" : agreement.keyPoints.length > 4 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4";

  const savePdf = async () => {
    setSaving(true);
    try { await downloadAgreementPdf(agreement, { fileName: pdfName, subtitle: pdfSubtitle }); }
    catch { toast.error("Could not create the PDF. Please try again."); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4" data-testid="agreement-terms-panel">
      <div className={`grid ${cols} gap-2.5`}>
        {agreement.keyPoints.map((k) => (
          <div key={k.label} className={`p-3 rounded-2xl border min-w-0 ${tones[k.tone === "green" ? "green" : "plain"]}`}>
            <div className="lbl text-[10.5px] font-bold uppercase tracking-wider truncate">{k.label}</div>
            <div className="val mt-1 font-bold text-base sm:text-lg leading-tight break-words">{k.value}</div>
            {k.hint && <div className="hint text-[11px] mt-0.5 font-medium leading-snug">{k.hint}</div>}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[#E6E8EE] bg-[#FAFAFC] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[#6B7280]">Terms of agreement</span>
          <button type="button" onClick={savePdf} disabled={saving} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7C3AED] hover:underline disabled:opacity-50">
            <Download size={13} /> {saving ? "Preparing…" : "Download PDF"}
          </button>
        </div>
        <div className={`relative border-t border-gray-200/70 pt-3 ${open ? "" : "max-h-48 overflow-hidden"}`}>
          <div className="space-y-2.5 text-xs text-[#374151] leading-relaxed">
            {agreement.clauses.map((c, i) => (
              <p key={c.title}><strong>{i + 1}. {c.title}.</strong> {c.body}</p>
            ))}
          </div>
          {!open && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#FAFAFC] to-transparent" />}
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="w-full h-9 rounded-xl bg-white border border-[#E6E8EE] text-xs font-bold text-[#374151] flex items-center justify-center gap-1.5">
          {open ? "Show less" : `See all ${agreement.clauses.length} terms`} <ChevronDown size={14} className={open ? "rotate-180 transition" : "transition"} />
        </button>
      </div>
    </div>
  );
}
