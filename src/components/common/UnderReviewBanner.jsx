import React from "react";
import { Clock, ArrowRight } from "lucide-react";

export default function UnderReviewBanner({ user, onOpenModal }) {
  if (!user || user.profile_status !== "under_review") return null;

  const etaHoursStored = user.review_eta_hours || 20;
  const createdAtMs = user.created_at ? new Date(user.created_at).getTime() : Date.now();
  const elapsedHours = (Date.now() - createdAtMs) / (1000 * 60 * 60);
  const hoursLeft = Math.max(1, Math.ceil(etaHoursStored - elapsedHours));

  return (
    <div className="w-full bg-gradient-to-r from-amber-950/90 via-slate-900 to-amber-950/90 border-b border-amber-500/30 text-amber-200 px-4 py-2.5 shadow-md">
      <div className="max-w-none flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <span className="p-1 rounded-md bg-amber-500/20 text-amber-400 shrink-0">
            <Clock size={16} />{/* v415: no endless pulse */}
          </span>
          <span className="font-semibold">
            {/* v330: "1 hr" (not "1 hrs"), and no frozen "~1 hrs" once the estimate has passed */}
            Profile Under Review: {elapsedHours >= etaHoursStored
              ? <span className="text-white font-bold">finishing up</span>
              : <><span className="text-white font-mono font-bold">~{hoursLeft} {hoursLeft === 1 ? "hr" : "hrs"}</span> remaining</>}. {user.role === "brand"
                ? "You can complete KYC and explore creators while we review." /* v415: brand wording (applications are a creator thing) */
                : "You can submit KYC and explore, but campaign applications are paused until approval."}
          </span>
        </div>

        <button
          onClick={onOpenModal}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-[11px] transition-all cursor-pointer shrink-0"
        >
          View details <ArrowRight size={13} />{/* v415 */}
        </button>
      </div>
    </div>
  );
}
