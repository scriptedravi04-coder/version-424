import React from "react";
import { CheckCircle, CreditCard } from "lucide-react";
import { Badge } from "@/components/common/Badge";


// Session 49 (clean-up): moved out of SystemMessage.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function SysGenericCard(props) {
  const { accentBorder, actionLabel, badgeColor, cardBg, cleanText, iconBg, message, onTriggerReview, onViewInvoice, parsedIcon, type } = props;
  return (
    <div className={`w-full max-w-[270px] sm:max-w-[340px] md:max-w-xl ${cardBg} border rounded-xl md:rounded-2xl p-3 md:p-5 flex gap-2.5 md:gap-4 text-left relative overflow-hidden`}>
        <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${accentBorder} rounded-l-xl md:rounded-l-2xl`} />

        <div className="flex-shrink-0">
          <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl ${iconBg} border flex items-center justify-center shadow-xs`}>
            {parsedIcon}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5 mb-1 md:mb-2">
            <Badge variant="info" className={badgeColor}>
              {actionLabel}
            </Badge>
            <span className="text-[11px] md:text-[10px] text-slate-500 font-semibold font-mono">
              {message.created_at && !Number.isNaN(new Date(message.created_at).getTime()) /* v332: no "Invalid Date" */ ? new Date(message.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" /* v330: IST */ }).replace(/\b(am|pm)\b/g, (s) => s.toUpperCase()) : ""}
            </span>
          </div>
          <p className="text-[11px] md:text-sm leading-snug font-semibold text-slate-800 break-words">
            {cleanText}
          </p>
          {type === "payment_trigger" && (
            <div className="mt-2.5 md:mt-4 flex flex-wrap gap-1.5 md:gap-2.5 pt-2 md:pt-3 border-t border-slate-100 font-sans">
              <button
                type="button"
                onClick={onViewInvoice}
                className="flex items-center gap-1 px-2.5 py-1.5 md:px-3.5 md:py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[10px] md:text-[11px] rounded-lg md:rounded-xl transition-all cursor-pointer shadow-xs border border-slate-200/60"
              >
                <CreditCard size={11} className="text-slate-500 md:w-3 md:h-3" />
                <span>View Invoice</span>
              </button>
              <button
                type="button"
                onClick={onTriggerReview}
                className="flex items-center gap-1 px-2.5 py-1.5 md:px-3.5 md:py-2 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-extrabold text-[10px] md:text-[11px] rounded-lg md:rounded-xl transition-all cursor-pointer shadow-xs"
              >
                <CheckCircle size={11} className="md:w-3 md:h-3" />
                <span>Submit Review</span>
              </button>
            </div>
          )}
        </div>
      </div>
  );
}
