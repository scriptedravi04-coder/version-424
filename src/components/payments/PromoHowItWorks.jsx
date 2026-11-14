import React from "react";
import { Link } from "react-router-dom";
import { Tag, Lock, Wallet, Gift, X, CalendarClock } from "lucide-react";

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
// Session 36 (Ravi): "What is a creator code & how it works" — same style as the UGC and referral
// explainers. Opened from the small link under the code box (deal popup and Earnings).
export const PROMO_HOWTO_KEY = "ybex_promo_howto_seen";
const Step = ({ icon: Icon, title, text }) => (
  <div className="flex gap-3">
    <div className="w-9 h-9 shrink-0 rounded-xl bg-[#EEF2FF] text-[#4f46e5] flex items-center justify-center"><Icon size={17} /></div>
    <div>
      <div className="text-[13px] font-bold text-gray-900">{title}</div>
      <div className="text-[12px] text-gray-600 leading-relaxed mt-0.5">{text}</div>
    </div>
  </div>
);

function PromoHowItWorksBody({ open, onClose }) {
  if (!open) return null;
  const close = () => { try { localStorage.setItem(PROMO_HOWTO_KEY, "1"); } catch { /* private mode */ } onClose?.(); };
  return (
    <PopupBackdrop className="fixed inset-0 z-[135] bg-black/50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" data-testid="promo-howto">
      <PopupPanel kind="auto" below={640} onClose={onClose} className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto" style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">What is a creator code?</h3>
          <button onClick={close} aria-label="Close" className="w-10 h-10 -mr-2 flex items-center justify-center rounded-lg hover:bg-gray-100"><X size={17} /></button>{/* v332: 40px tap target */}
        </div>
        <p className="text-[12.5px] text-gray-600 mt-1 leading-relaxed">
          A creator code is a short code from Ybex that lowers the Convenience fee & TDS taken from your payout. You don't pay anything — you just keep more of what you earn.
        </p>

        <div className="mt-4 space-y-4">
          <Step icon={Gift} title="Where you get one"
            text="Ybex shares codes in promotional banners, on our social media handles, in giveaways and contests, in reels, or through someone promoting Ybex." />
          <Step icon={Tag} title="Apply it once"
            text="Type the code and tap Apply. It is saved to your account — no need to enter it again for every deal." />
          <Step icon={Lock} title="Used on your next deals automatically"
            text="When a brand pays for your next deal, the lower fee is fixed on that deal. You see it in the offer, the contract and Earnings." />
          <Step icon={CalendarClock} title="How long it lasts"
            text="Each code has its own limit — until a date (for example till the 31st) or for your next few deals (for example the next 2). The app shows which, and stops it on its own." />
          <Step icon={Wallet} title="Example"
            text="₹12,000 deal. Normal fee ₹1,800 (15%). With a 0% code: fee ₹0 — you get the full ₹12,000." />
        </div>

        <p className="mt-4 text-[11.5px] text-gray-500">Apply the code before the brand pays. Deals already paid keep their fee.</p>
        <button onClick={close} className="mt-4 w-full h-11 rounded-xl bg-[#4f46e5] text-white text-sm font-semibold">Got it</button>
        <Link to="/refer" onClick={close} className="block mt-3 text-center text-[11.5px] text-gray-500 underline" data-testid="promo-howto-referral">
          Want to earn more like this? Check out our referral programme
        </Link>
      </PopupPanel>
    </PopupBackdrop>
  );
}

// Session 37: stays mounted for its closing animation.
export default function PromoHowItWorks(props) {
  return <Presence>{props.open && <PromoHowItWorksBody key="promohowitworks" {...props} />}</Presence>;
}

