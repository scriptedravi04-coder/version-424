import React, { useEffect, useState } from "react";
import { X, Share2 } from "lucide-react";
import { api } from "../../lib/api";
import { referralShareText, ReferralHowItWorks } from "./ReferralHub";
import CreatorCodeBox from "../payments/CreatorCodeBox";

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
import { publicOrigin } from "../../lib/publicUrl";
// Session 36 (Ravi): shown to the CREATOR when a deal amount is final (agreement screen), before the
// brand pays. If a code / offer / referral reward already applies → a happy line only. Otherwise:
// (1) add a creator code, (2) invite creators for fee-free deals. Never blocks signing; once per deal,
// at most twice a week, "Don't show again".
const KEY = "ybex_keepmore";
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ } };
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

export function shouldShowKeepMore(dealKey, now = Date.now()) {
  const s = read();
  if (s.never) return false;
  if ((s.deals || []).includes(dealKey)) return false;
  const week = (s.shown || []).filter((t) => now - t < 7 * 24 * 3600 * 1000);
  return week.length < 2;
}
function markShown(dealKey) {
  const s = read();
  write({ ...s, deals: [...(s.deals || []).slice(-50), dealKey], shown: [...(s.shown || []).slice(-10), Date.now()] });
}

export function feeFor(amount, cfg) {
  const a = Number(amount) || 0;
  const rate = a < (Number(cfg?.threshold_amount) || 20000) ? Number(cfg?.below_threshold_rate ?? 15) : Number(cfg?.above_threshold_rate ?? 5);
  return { rate, fee: Math.round((a * rate) / 100) };
}

export default function KeepMorePopup({ dealKey, amount }) {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [ref, setRef] = useState(null);
  const [howto, setHowto] = useState(false);

  useEffect(() => {
    if (!dealKey || !(Number(amount) > 0) || !shouldShowKeepMore(dealKey)) return;
    let alive = true;
    Promise.all([api.get("platform/fee-config").catch(() => null), api.get("referrals/me").catch(() => null)]).then(([c, r]) => {
      if (!alive) return;
      setCfg(c?.data || {}); setRef(r?.data || null); setOpen(true); markShown(dealKey);
    });
    return () => { alive = false; };
  }, [dealKey, amount]);
  if (!cfg) return null;

  const close = () => setOpen(false);
  const never = () => { write({ ...read(), never: true }); setOpen(false); };
  const special = cfg.fee_kind && cfg.fee_kind !== "platform";
  const { rate, fee } = feeFor(amount, cfg);
  const normal = feeFor(amount, { threshold_amount: cfg.threshold_amount, below_threshold_rate: 15, above_threshold_rate: 5 });
  const link = ref?.link_path ? `${publicOrigin()}${ref.link_path}` : "";
  const share = async () => {
    const text = referralShareText(link);
    if (navigator.share) { try { await navigator.share({ title: "Join me on Ybex", text, url: link }); return; } catch { /* cancelled */ } }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  return (
    <Presence>{open && (
    <PopupBackdrop className="fixed inset-0 z-[125] bg-black/50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" data-testid="keep-more-popup">
      <PopupPanel kind="auto" below={640} onClose={close} className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5" style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
        <div className="flex justify-end -mt-1 -mr-1"><button onClick={close} aria-label="Close" className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100"><X size={17} /></button></div>{/* v332: 40px tap target */}
        {special ? (
          <>
            <div className="text-2xl">🎉</div>
            <h3 className="text-lg font-bold text-gray-900 mt-1">{rate === 0 ? "0% fee on this deal" : `Only ${rate}% fee on this deal`}</h3>
            <p className="text-sm text-gray-600 mt-1">{cfg.promo_line || cfg.fee_label} — you keep {inr(Number(amount) - fee)}.</p>
            <button onClick={close} className="mt-5 w-full h-11 rounded-xl bg-[#4f46e5] text-white text-sm font-semibold">Continue</button>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold text-gray-900 leading-snug">Keep more from this deal</h3>
            <div className="mt-3 rounded-xl border border-gray-200 p-3">
              <CreatorCodeBox />
            </div>
            {link && (
              <div className="mt-3 rounded-xl bg-gradient-to-br from-[#4f46e5] to-[#7c3aed] text-white p-3.5">
                <div className="text-[13px] font-bold flex items-center gap-1.5">No code? Save {inr(normal.fee)} on deals like this</div>
                {/* v332: when the free-deals offer is off it read "Invite 0 creators → your next 0 deals", and "up to ₹0" */}
                <div className="text-[12px] text-white/90 mt-0.5">{Number(ref.signups_per_reward) > 0 && Number(ref.free_deals_per_reward) > 0
                  ? `Invite ${ref.signups_per_reward} creators → your next ${ref.free_deals_per_reward} deals at 0% fee. Plus get Featured to brands and a share of what your friends earn.`
                  : "Invite creators and get a share of what your friends earn."}</div>
                {Number(ref.share_cap_per_creator) > 0 && <div className="text-[10.5px] text-white/60 mt-0.5">up to {inr(ref.share_cap_per_creator)}</div>}
                <button onClick={share} className="mt-2.5 w-full h-10 rounded-lg bg-white text-[#4f46e5] text-sm font-bold flex items-center justify-center gap-1.5"><Share2 size={15} /> Share my invite link</button>
                <button onClick={() => setHowto(true)} className="mt-1.5 w-full text-[11.5px] text-white/80 underline">How it works</button>
              </div>
            )}
            <div className="mt-4 flex items-center justify-between">
              <button onClick={never} className="text-[12px] text-gray-500">Don't show again</button>
              <button onClick={close} className="px-4 h-10 rounded-xl bg-gray-100 text-sm font-semibold text-gray-800">Skip</button>
            </div>
          </>
        )}
      </PopupPanel>
      <ReferralHowItWorks open={howto} onClose={() => setHowto(false)} data={ref} />
    </PopupBackdrop>
    )}</Presence>
  );
}
