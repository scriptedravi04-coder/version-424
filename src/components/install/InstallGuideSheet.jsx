import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X, Copy, Check, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { detectPlatform, installSteps } from "../../lib/installGuide";
import { publicOrigin } from "../../lib/publicUrl";

// Session 42: one install guide for every place that offers "Install app" (top banner, landing hero,
// landing sticky bar, desktop QR). Steps depend on the phone and the browser (src/lib/installGuide.js).
export default function InstallGuideSheet({ open, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!open || typeof document === "undefined") return null;
  const guide = installSteps(detectPlatform());
  const link = `${publicOrigin()}/app`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the link is shown on screen */ }
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/50" onClick={onClose} role="dialog" aria-modal="true" aria-label={guide.title} data-testid="install-guide">
      <div
        className="w-full sm:max-w-sm bg-white rounded-t-[28px] sm:rounded-[28px] p-6 relative max-h-[92vh] max-h-[92dvh] overflow-y-auto overscroll-contain" /* v330: scrolls on short phones instead of cutting "Got it" */
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 24px)", fontFamily: "'DM Sans', sans-serif" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} aria-label="Close" /* v332: 40px tap target */ className="absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center text-[#6B7280] active:bg-black/5">
          <X size={18} />
        </button>
        <div className="w-12 h-12 rounded-2xl bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center mb-4">
          <Smartphone size={22} />
        </div>
        <h3 className="text-[19px] font-bold text-[#0A0A0A] pr-8">{guide.title}</h3>

        {guide.kind === "steps" && (
          <ol className="mt-4 space-y-3">
            {guide.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-[14px] leading-snug text-[#33303F]">
                <span className="w-6 h-6 shrink-0 rounded-full bg-[#F5F0FF] text-[#7C3AED] text-[12px] font-bold flex items-center justify-center">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        )}

        {guide.kind === "switch" && (
          <>
            {guide.lines.map((l, i) => <p key={i} className="mt-3 text-[14px] leading-snug text-[#33303F]">{l}</p>)}
            <button type="button" onClick={copy} className="mt-4 w-full h-12 rounded-2xl border border-[#E5E2EE] flex items-center justify-between px-4 text-[14px]">
              <span className="truncate text-[#6B7280]">{link}</span>
              <span className="inline-flex items-center gap-1 font-semibold text-[#7C3AED] shrink-0">{copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy</>}</span>
            </button>
          </>
        )}

        {guide.kind === "qr" && (
          <div className="mt-4 flex flex-col items-center">
            <div className="p-3 rounded-2xl border border-[#ECE9F5] bg-white"><QRCodeSVG value={link} size={168} /></div>
            <p className="mt-3 text-[13px] text-[#6B7280] text-center">{guide.lines[0]}</p>
          </div>
        )}

        <button type="button" onClick={onClose} className="mt-6 w-full h-12 rounded-2xl bg-[#7C3AED] text-white font-semibold text-[15px]">
          Got it
        </button>
      </div>
    </div>,
    document.body
  );
}
