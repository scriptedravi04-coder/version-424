import React from "react";
import { AlertCircle, Clock, CheckCircle2, ShieldAlert } from "lucide-react";

// v415: plain, calm wording shared by the brand and creator verification pages — no all-caps "KYC VERIFICATION
// MISSING", no emoji, no jargon ("secure payout escrows", "verification queue phase"), no endless pulse.
// Title words match the profile / settings badges: Verification pending · Under review · Verified · Needs changes.
export default function KYCStatusBanner({ status, rejectReason }) {
  if (status === "approved" || status === "APPROVED") {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4.5 flex items-start gap-3.5 mb-6" role="status">
        <div className="p-2 bg-emerald-500/15 text-emerald-600 rounded-lg shrink-0">
          <CheckCircle2 size={20} />
        </div>
        <div>
          <h4 className="text-sm font-bold text-[var(--text-primary)]">Verified</h4>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Your details have been checked by the Ybex team. Payments and all campaign features are fully enabled.
          </p>
        </div>
      </div>
    );
  }

  // v332: "submitted" / "in_review" fell through to "KYC Verification Missing"
  if (["PENDING", "UNDER_REVIEW", "IN_REVIEW", "SUBMITTED"].includes(String(status || "").toUpperCase())) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4.5 flex flex-col md:flex-row items-start justify-between gap-4 mb-6" role="status">
        <div className="flex items-start gap-3.5">
          <div className="p-2 bg-amber-500/15 text-amber-600 rounded-lg shrink-0">
            <Clock size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-[var(--text-primary)]">Under review</h4>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              We've received your details and the Ybex team is checking them — usually within a day. We'll notify you when it's done.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "rejected" || status === "REJECTED") {
    return (
      <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-4.5 flex items-start gap-3.5 mb-6" role="alert">
        <div className="p-2 bg-red-500/15 text-red-600 rounded-lg shrink-0">
          <ShieldAlert size={20} />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-bold text-[var(--text-primary)]">Verification needs changes</h4>
          {/* v332: pale red-100 text was unreadable on the light card; no made-up rejection reason */}
          <p className="text-xs text-red-700 dark:text-red-100 font-bold mt-1.5 bg-red-500/10 border border-red-500/15 p-3 rounded-lg">
            Reason: {rejectReason || "The team couldn't verify these details. Please check them and resubmit."}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-2">
            Please check the details and document images below, then submit again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4.5 flex items-start gap-3.5 mb-6" role="status">
      <div className="p-2 bg-blue-500/15 text-[#7C3AED] rounded-lg shrink-0">
        <AlertCircle size={20} />
      </div>
      <div>
        <h4 className="text-sm font-bold text-[var(--text-primary)]">Verification pending</h4>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          Complete the form below once to unlock payments and the Verified badge. It takes about 2 minutes.
        </p>
      </div>
    </div>
  );
}
