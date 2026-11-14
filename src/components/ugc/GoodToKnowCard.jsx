import React from "react";
import { Info } from "lucide-react";

// Session 24. Shown on the creator's agreement / OTP step, between the terms and the checkboxes.
// Final styling comes from Claude Design; the copy is approved (English).
export default function GoodToKnowCard() {
  return (
    <div className="rounded-2xl border border-[#DDD6FE] bg-[#F5F0FF]/60 p-3.5 flex gap-2.5" data-testid="good-to-know-card">
      <Info size={16} className="text-[#7C3AED] shrink-0 mt-0.5" />
      <div className="text-[12px] leading-relaxed text-slate-700 space-y-1">
        <div className="font-bold text-slate-900">Good to know</div>
        <p>The brand's payment is already held safely with Ybex SafePay. It's released to you after the brand approves your video.</p>
        <p>If the brand asks for changes outside this brief, you can decline them and raise it with Ybex support.</p>
      </div>
    </div>
  );
}
