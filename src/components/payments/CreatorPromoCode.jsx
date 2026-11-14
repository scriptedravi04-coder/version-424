import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Tag } from "lucide-react";
import { api } from "../../lib/api";
import PromoHowItWorks from "./PromoHowItWorks";
import CreatorCodeBox from "./CreatorCodeBox";

// Session 36: creator promo code (saved once) or the automatic launch offer, with how many deals are left.
// Applied when the brand pays for the deal; the fee then stays fixed for that deal.
const describe = (c) => c.type === "zero_fee" ? "0% fee" : c.override_fee_rate != null ? `${c.override_fee_rate}% fee` : "fee discount";
export default function CreatorPromoCode({ className = "" }) {
  const [cur, setCur] = useState(undefined);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [howto, setHowto] = useState(false);

  const load = () => api.get("creator/coupon").then((r) => setCur(r.data?.coupon || null)).catch(() => setCur(null));
  useEffect(() => { load(); }, []);
  const save = async () => {
    setBusy(true);
    try { await api.post("creator/coupon", { code }); toast.success("Promo code saved."); setCode(""); load(); }
    catch (e) { toast.error(e?.response?.data?.error || "Could not save the code."); }
    finally { setBusy(false); }
  };
  if (cur === undefined) return null;
  return (
    <div className={`rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4 ${className}`} data-testid="creator-promo">
      <div className="flex items-center gap-2 mb-2">
        <Tag size={15} className="text-[var(--violet)]" /><span className="font-bold text-sm">Keep more of what you earn</span>
        <button type="button" onClick={() => setHowto(true)} className="ml-auto text-[11px] font-semibold text-[var(--violet)] underline">What is a creator code?</button>
      </div>
      {cur ? (
        <p className="text-sm text-emerald-700 font-semibold">
          {/* v332: unlimited / date-only codes showed "deal 1 of null" */}
          {cur.auto ? "Launch offer" : `Creator code ${cur.code}`}: {describe(cur)}{Number(cur.deals_total) > 0 && Number.isFinite(Number(cur.deals_total)) && cur.deal_number ? ` — deal ${cur.deal_number} of ${cur.deals_total}` : ""}
          {cur.valid_until ? `, valid till ${new Date(cur.valid_until).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" /* v330: IST */ })}` : ""}.
        </p>
      ) : (
        <CreatorCodeBox onApplied={load} />
      )}
      <p className="text-[11px] text-[var(--text-secondary)] mt-2">Applied when a brand pays for your deal. The fee shown before you sign is the fee you get.</p>
      <PromoHowItWorks open={howto} onClose={() => setHowto(false)} />
    </div>
  );
}
