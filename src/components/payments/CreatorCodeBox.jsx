import React, { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { api } from "../../lib/api";
import PromoHowItWorks from "./PromoHowItWorks";

// Session 36 (Ravi): one code box everywhere (deal popup, Earnings):
//   "If you have a creator code, apply it" → [ code ] → [ Apply ] → small "What is a creator code & how it works".
// After Apply the code is saved to the account and used automatically (fee previews, contract, payment),
// until its end date or its number of deals.
const describe = (r) => {
  const fee = r.type === "zero_fee" ? "0% fee" : r.override_fee_rate != null ? `${r.override_fee_rate}% fee` : "lower fee";
  const parts = [];
  if (r.deals_left) parts.push(`next ${r.deals_left} deal${r.deals_left > 1 ? "s" : ""}`);
  if (r.valid_until) parts.push(`till ${new Date(r.valid_until).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" /* v330: IST */ })}`);
  return `${fee}${parts.length ? ` · ${parts.join(", ")}` : ""}`;
};

export default function CreatorCodeBox({ onApplied, dark = false }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [help, setHelp] = useState(false);
  const apply = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("creator/coupon", { code });
      setDone(data); setCode("");
      toast.success(`🎉 ${data.code} applied`);
      onApplied?.(data);
    } catch (e) { toast.error(e?.response?.data?.error || "That code did not work."); }
    finally { setBusy(false); }
  };
  if (done) {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3" data-testid="creator-code-applied">
        <div className="text-[13px] font-bold text-emerald-800 flex items-center gap-1.5"><CheckCircle2 size={15} /> {done.code} applied</div>
        <div className="text-[12px] text-emerald-800 mt-0.5">{describe(done)}. It will be used automatically on your next deals.</div>
      </div>
    );
  }
  return (
    <div data-testid="creator-code-box">
      <div className={`text-[13px] font-bold ${dark ? "text-white" : "text-gray-900"}`}>If you have a creator code, apply it</div>
      <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter creator code"
        className="mt-2 w-full px-3 py-2.5 rounded-xl border border-gray-300 text-base sm:text-sm bg-white text-gray-900" /* v332: 16px on phones (no iOS zoom) */ />
      <button type="button" onClick={apply} disabled={busy || !code.trim()}
        className="mt-2 w-full h-10 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-40">{busy ? "Applying…" : "Apply"}</button>
      <button type="button" onClick={() => setHelp(true)} className={`mt-1.5 text-[11px] underline ${dark ? "text-white/70" : "text-gray-500"}`} data-testid="what-is-creator-code">
        What is a creator code & how it works
      </button>
      <PromoHowItWorks open={help} onClose={() => setHelp(false)} />
    </div>
  );
}
