import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { X, Ticket, BadgePercent, Wallet, ArrowRight, CheckCircle2 } from "lucide-react";
import { api } from "../../lib/api";
import { feeFor } from "./KeepMorePopup";
import PromoHowItWorks from "../payments/PromoHowItWorks";
import ButtonSpinner from "../common/ButtonSpinner";

// Session 43 (Ravi): the creator-code ask moved OUT of the agreement. It now sits in the chat,
// for the creator only, after both sides signed and BEFORE the brand pays — the fee is fixed when
// the brand pays, so this is the last moment a code still helps on this deal. Look: Ravi's
// "Refer & Earn" reference (soft card, banner with a pill + sticker, "How it works", one field).
const DISMISS_KEY = "ybex_codecard_hidden";
const readHidden = () => { try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]"); } catch { return []; } };
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

/** Fee saved on this deal by a coupon (0 when it does not lower the fee). */
export function couponSaving(amount, cfg, coupon) {
  if (!coupon) return 0;
  const base = feeFor(amount, cfg).fee;
  const rate = coupon.type === "zero_fee" ? 0 : coupon.override_fee_rate != null ? Number(coupon.override_fee_rate) : null;
  if (rate == null || !Number.isFinite(rate)) return 0;
  return Math.max(0, base - Math.round(((Number(amount) || 0) * rate) / 100));
}

function Sticker() {
  // Our own shape: a soft four-petal blob with a sparkle, in Ybex purple → pink.
  return (
    <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden="true" className="shrink-0">
      <defs>
        <radialGradient id="ccd-g" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#F9A8D4" />
          <stop offset=".55" stopColor="#C084FC" />
          <stop offset="1" stopColor="#7C3AED" />
        </radialGradient>
      </defs>
      <path d="M46 6c10 0 16 8 16 16 8 0 16 6 16 16 0 6-3 10-6 12 3 2 6 6 6 12 0 10-8 16-16 16 0 8-6 14-16 14S30 86 30 78c-8 0-16-6-16-16 0-6 3-10 6-12-3-2-6-6-6-12 0-10 8-16 16-16 0-8 6-16 16-16z" fill="url(#ccd-g)" />
      <path d="M46 30c1.6 8 3.8 10.4 12 12-8.2 1.6-10.4 3.8-12 12-1.6-8.2-3.8-10.4-12-12 8.2-1.6 10.4-4 12-12z" fill="#fff" />
    </svg>
  );
}

export default function CreatorCodeDealCard({ dealKey, amount }) {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState(null);
  const [coupon, setCoupon] = useState(undefined); // undefined = loading
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const [hidden, setHidden] = useState(() => readHidden().includes(dealKey));

  useEffect(() => {
    if (hidden || !(Number(amount) > 0)) return undefined;
    let alive = true;
    Promise.all([
      api.get("platform/fee-config").catch(() => null),
      api.get("creator/coupon").catch(() => null),
    ]).then(([c, k]) => {
      if (!alive) return;
      setCfg(c?.data || {});
      setCoupon(k?.data?.coupon || null);
    });
    return () => { alive = false; };
  }, [hidden, amount]);

  if (hidden || !(Number(amount) > 0) || !cfg || coupon === undefined) return null;

  const hide = () => {
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...readHidden().slice(-50), dealKey])); } catch { /* ignore */ }
    setHidden(true);
  };
  const { fee } = feeFor(amount, cfg);
  const saved = couponSaving(amount, cfg, coupon);

  const apply = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post("creator/coupon", { code: code.trim() });
      setCoupon(data || { code });
      setCode("");
      toast.success(`🎉 ${data?.code || "Code"} applied`);
    } catch (e) {
      toast.error(e?.response?.data?.error || "That code did not work.");
    } finally {
      setBusy(false);
    }
  };

  // A code (or an automatic offer) already applies: one happy line, nothing to fill in.
  if (coupon) {
    return (
      <div className="self-stretch rounded-[18px] bg-[#ECFDF5] border border-[#A7F3D0] p-3.5 flex items-start gap-2.5" data-testid="creator-code-card-applied">
        <CheckCircle2 size={18} className="text-[#059669] shrink-0 mt-0.5" />
        <div className="text-[12.5px] leading-snug text-[#065F46]">
          <b className="font-bold">{coupon.code ? `${coupon.code} applied` : "Your offer applies"}</b>
          {saved > 0 ? ` — you save ${inr(saved)} on this deal.` : " — it is used when the brand pays."}
        </div>
      </div>
    );
  }

  return (
    <div className="self-stretch rounded-[22px] bg-[#FCFBF8] border border-[#EEEAE2] p-3 shadow-[0_14px_30px_-26px_rgba(16,16,20,.6)]" style={{ fontFamily: "'DM Sans', sans-serif" }} data-testid="creator-code-card">
      <div className="relative rounded-[16px] bg-[#F4F1EA] pl-4 pr-1 py-3.5 flex items-center gap-2 overflow-hidden">
        {/* v332: 36px+ tap target (was 28px) */}
        <button type="button" onClick={hide} aria-label="Hide" className="absolute top-1.5 right-1.5 w-9 h-9 rounded-full bg-white/70 flex items-center justify-center text-[#6B7280]"><X size={14} /></button>
        <div className="flex-1 min-w-0">
          {fee > 0 && <span className="inline-flex h-6 px-2.5 rounded-full bg-white text-[11.5px] font-semibold text-[#1F1F29]">Save up to {inr(fee)} on this deal</span>}
          <div className="mt-2.5 text-[19px] leading-[1.15] font-bold tracking-[-.4px] text-[#0A0A0A]">Have a creator code?</div>
          <div className="mt-1 text-[12.5px] text-[#6B7280]">Apply it before the brand pays</div>
        </div>
        <Sticker />
      </div>

      <div className="px-1.5 pt-3.5">
        <div className="text-[12.5px] text-[#8A8A93]">How it works:</div>
        <ul className="mt-2 flex flex-col gap-2.5">
          <li className="flex items-center gap-3 text-[13px] text-[#1F1F29]"><Ticket size={17} className="shrink-0" /> Type your creator code below</li>
          <li className="flex items-center gap-3 text-[13px] text-[#1F1F29]"><BadgePercent size={17} className="shrink-0" /> The Convenience fee & TDS on <b className="font-semibold">this deal</b> goes down</li>
          <li className="flex items-center gap-3 text-[13px] text-[#1F1F29]"><Wallet size={17} className="shrink-0" /> More money reaches your bank</li>
        </ul>
        <button type="button" onClick={() => setHelp(true)} className="mt-2 text-[11.5px] text-[#6B7280] underline">What is a creator code?</button>
      </div>

      <div className="mt-3 rounded-[14px] bg-[#F4F1EA] p-1.5 flex items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 40))}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          placeholder="Enter creator code"
          aria-label="Creator code"
          className="flex-1 min-w-0 h-10 px-3 bg-transparent outline-none text-[16px] tracking-[.5px] text-[#0A0A0A] placeholder:text-[#A3A3AD]"
        />
        <button type="button" onClick={apply} disabled={busy || !code.trim()} data-testid="creator-code-card-apply"
          className="h-10 px-4 rounded-[10px] bg-[#111114] text-white text-[13px] font-semibold disabled:opacity-40 shrink-0">
          {busy ? <ButtonSpinner label="Applying…" /> : "Apply"}{/* v332: busy spinner; input is 16px so iPhone doesn't zoom */}
        </button>
      </div>

      <button type="button" onClick={() => navigate("/refer")} className="mt-2.5 mb-0.5 w-full flex items-center justify-center gap-1 text-[12.5px] font-semibold text-[#6D28D9]" data-testid="creator-code-card-refer">
        Don't have a code? Refer &amp; earn <ArrowRight size={13} />
      </button>
      <PromoHowItWorks open={help} onClose={() => setHelp(false)} />
    </div>
  );
}
