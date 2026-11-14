import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import PromoHowItWorks from "./PromoHowItWorks";

// Session 43 (Ravi's Earnings design): "Have a creator code?" card for the mobile Earnings page.
// Same server calls as CreatorPromoCode / CreatorCodeBox (GET + POST creator/coupon) — only the look
// is new. There is no "remove code" call on the server, so the applied state has no Remove button.
const feeText = (c) =>
  c.type === "zero_fee" ? "0% fee" : c.override_fee_rate != null ? `${c.override_fee_rate}% fee` : "Lower fee";

export function appliedLine(c) {
  if (!c) return "";
  const parts = [feeText(c)];
  if (c.deal_number && c.deals_total) parts.push(`deal ${c.deal_number} of ${c.deals_total}`);
  else if (c.deals_left) parts.push(`next ${c.deals_left} deal${c.deals_left > 1 ? "s" : ""}`);
  if (c.valid_until) {
    const d = new Date(c.valid_until);
    if (!Number.isNaN(d.getTime())) parts.push(`till ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" /* v330: IST */ })}`);
  }
  return parts.join(" · ");
}

export default function CreatorCodeCard() {
  const [cur, setCur] = useState(undefined); // undefined = loading, null = none
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [howto, setHowto] = useState(false);

  const load = () =>
    api.get("creator/coupon").then((r) => setCur(r.data?.coupon || null)).catch(() => setCur(null));
  useEffect(() => { load(); }, []);

  const apply = async () => {
    const c = code.trim();
    if (!c || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post("creator/coupon", { code: c });
      toast.success(`${data?.code || c.toUpperCase()} applied`);
      setCode(""); setOpen(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error || "That code did not work.");
    } finally { setBusy(false); }
  };

  if (cur === undefined) return null;
  const canApply = Boolean(code.trim()) && !busy;

  return (
    <div
      data-testid="creator-code-card"
      className="shrink-0 rounded-[20px] overflow-hidden border-[1.5px] border-[#D9BFFF] shadow-[0_6px_18px_rgba(124,58,237,.12)]"
      style={{ background: "linear-gradient(135deg,#F6EDFF 0%,#EBDDFF 100%)" }}
    >
      {cur ? (
        <div className="p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-[12px] bg-[#E3F7EE] flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0E9F6E" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold text-[#0A0A0A] truncate">
              {cur.auto ? "Launch offer applied" : `Code ${String(cur.code || "").toUpperCase()} applied`}
            </div>
            <div className="text-[12px] text-[#6B7280] mt-px">{appliedLine(cur)}</div>
          </div>
          <button type="button" onClick={() => setHowto(true)} className="text-[12.5px] font-semibold text-[#7C3AED] shrink-0">
            How it works
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="w-full p-3.5 flex items-center gap-3 text-left"
          >
            <div className="w-[42px] h-[42px] rounded-[13px] flex items-center justify-center shrink-0 shadow-[0_4px_10px_rgba(155,0,255,.3)]" style={{ background: "linear-gradient(160deg,#9B00FF,#5A00C8)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-extrabold text-[#2E0066]">Have a creator code?</div>
              <div className="text-[12px] font-semibold text-[#6A2BC4] mt-0.5">Apply it &amp; pay a lower fee on every deal</div>
            </div>
            <span
              className="w-[30px] h-[30px] rounded-full bg-[#7C3AED] flex items-center justify-center shrink-0 transition-transform duration-200"
              style={{ transform: open ? "rotate(180deg)" : "none" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </span>
          </button>
          {open && (
            <div className="px-3.5 pb-3.5 flex flex-col gap-2.5">
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
                  placeholder="Enter code"
                  autoCapitalize="characters"
                  className="flex-1 min-w-0 h-11 rounded-[12px] border-[1.5px] border-[#D9BFFF] focus:border-[#7C3AED] px-3.5 text-[15px] font-semibold text-[#0A0A0A] uppercase outline-none bg-white placeholder:text-[#A19BB0] placeholder:normal-case"
                />
                <button
                  type="button"
                  onClick={apply}
                  disabled={!canApply}
                  className="h-11 px-[18px] rounded-[12px] text-[14px] font-bold shrink-0 transition-colors"
                  style={canApply
                    ? { background: "linear-gradient(135deg,#9B00FF,#5A00C8)", color: "#FFFFFF" }
                    : { background: "#DCCBF5", color: "#8E6CC4" }}
                >
                  {busy ? "Applying…" : "Apply"}
                </button>
              </div>
              <div className="text-[12px] leading-normal text-[#5B4A75]">
                Applies when a brand pays for your deal. The fee you see before signing is final.{" "}
                <button type="button" onClick={() => setHowto(true)} className="font-semibold text-[#7C3AED]">How it works</button>
              </div>
            </div>
          )}
        </>
      )}
      <PromoHowItWorks open={howto} onClose={() => setHowto(false)} />
    </div>
  );
}
