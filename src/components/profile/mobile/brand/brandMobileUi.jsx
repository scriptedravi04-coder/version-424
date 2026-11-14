import React from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useHideBottomNav } from "../../../../lib/bottomNavVisibility";

// Shared chrome for the Brand Profile mobile sub-screens (mockup screens 1b–1k).
// Kept in the mobile tree so no desktop component is touched.

// v415: a soft opacity-only fade when a sub-screen opens (no instant flash). Opacity only — a transform here
// would make the screen's fixed popups (logo cropper, ticket form) position against it while it animates.
const SCREEN_FADE = { initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } } };

export function MobileScreen({ title, subtitle, onBack, children, footer }) {
  useHideBottomNav(true); // v415: the bottom bar never covers a sub-screen's Save button
  return (
    <motion.div {...SCREEN_FADE} className={`min-h-screen bg-white flex flex-col ${footer ? "" : "pb-[calc(2rem+env(safe-area-inset-bottom))]"}`}>{/* v415: no 80px blank strip under the sticky Save bar */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-3.5 z-20 flex items-center gap-2">
        <button
          onClick={onBack}
          type="button"
          aria-label="Back" // v332: 40px tap target
          className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors flex-shrink-0 cursor-pointer active:scale-95"
        >
          <ChevronLeft size={20} className="text-slate-800" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base font-black text-slate-900 tracking-tight truncate font-display">{title}</h1>
          {subtitle && <p className="text-[11px] font-bold text-slate-500 truncate">{subtitle}</p>}
        </div>
      </div>

      <div className="flex-1">{children}</div>

      {footer && (
        <div className="border-t border-slate-100 bg-white/95 backdrop-blur-md px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex-shrink-0 sticky bottom-0 z-20">{footer}</div>/* v332: footer button clears the iPhone home bar */
      )}
    </motion.div>
  );
}

export function Section({ title, hint, children, className = "" }) {
  return (
    <div className={`px-5 py-4 ${className}`}>
      {title && <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-1">{title}</h2>}
      {hint && <p className="text-xs text-slate-500 mb-3 leading-relaxed font-medium">{hint}</p>}
      {children}
    </div>
  );
}

export function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl bg-white border border-slate-100 shadow-xs overflow-hidden ${className}`}>{children}</div>
  );
}

// A read-only label/value row, optionally tappable.
export function InfoRow({ label, value, placeholder = "Not provided", onClick, last = false }) {
  const shown = value === null || value === undefined || value === "" ? null : value;
  const body = (
    <>
      <div className="flex-1 min-w-0 text-left">
        <div className="text-xs text-slate-500 font-medium">{label}</div>
        <div className={`text-sm mt-0.5 break-words ${shown ? "font-bold text-slate-900" : "text-slate-500 font-medium"}`}>
          {shown ?? placeholder}
        </div>
      </div>
      {onClick && <ChevronRight size={16} className="text-slate-500 flex-shrink-0 ml-2" />}
    </>
  );

  const cls = `w-full px-4 py-3 flex items-center ${last ? "" : "border-b border-slate-100"}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} hover:bg-slate-50/80 transition-colors cursor-pointer`}>{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// v415: the label wraps a single input (so tapping it focuses the field and screen readers read it);
// chip groups pass group, which renders a plain heading + role="group".
export function Field({ label, hint, children, group = false }) {
  if (group) {
    return (
      <div className="mb-4" role="group" aria-label={label}>
        <div className="block text-xs font-bold text-slate-700 mb-1.5">{label}</div>
        {children}
        {hint && <p className="text-xs text-slate-500 mt-1.5 leading-relaxed font-medium">{hint}</p>}
      </div>
    );
  }
  return (
    <div className="mb-4">
      <label className="block">
        <span className="block text-xs font-bold text-slate-700 mb-1.5">{label}</span>
        {children}
      </label>
      {hint && <p className="text-xs text-slate-500 mt-1.5 leading-relaxed font-medium">{hint}</p>}
    </div>
  );
}

// v332: 16px text (text-base) — at 14px iPhone zoomed the whole screen when an input was tapped.
const inputCls =
  "w-full h-11 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#7C3AED] focus:bg-white transition-all";

export function TextInput(props) {
  return <input {...props} className={inputCls} />;
}

export function TextArea(props) {
  return (
    <textarea
      {...props}
      className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-base text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#7C3AED] focus:bg-white resize-none transition-all"
    />
  );
}

export function Chip({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!selected} // v332: screen readers hear which chips are picked; 36px min height
      className={`px-3 py-2 min-h-[36px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
        selected
          ? "bg-[#7C3AED] text-white shadow-xs"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

export function PrimaryButton({ children, disabled, onClick, type = "button", busy = false }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined} // v415
      className="w-full h-12 rounded-xl bg-[#7C3AED] text-white font-black text-sm disabled:opacity-50 hover:bg-[#6D28D9] disabled:hover:bg-[#7C3AED] shadow-xs active:scale-[0.99] transition-all cursor-pointer"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold text-sm disabled:opacity-50 hover:bg-slate-50 transition-colors cursor-pointer"
    >
      {children}
    </button>
  );
}

const PILL_TONES = {
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  violet: "bg-[#F5F0FF] text-[#6D28D9]",
  gray: "bg-gray-100 text-gray-600",
};

export function Pill({ tone = "gray", children }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${PILL_TONES[tone] || PILL_TONES.gray}`}>
      {children}
    </span>
  );
}

// v333 (Ravi: "loading likha aata hai … skeleton screen properly designed ho"): brand profile screens show
// a form-shaped skeleton (cards with label + field rows), not a spinner with "Loading…".
export function Loader({ label = "Loading…" }) {
  return (
    <div className="px-4 py-4 space-y-3 pointer-events-none select-none" aria-busy="true" aria-label={label}>
      {[3, 2, 3].map((rows, c) => (
        <div key={c} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <div className="h-3 w-28 bg-gray-200 rounded animate-pulse" />
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} className="space-y-1.5">
              <div className="h-2.5 w-20 bg-gray-100 rounded animate-pulse" />
              <div className="h-11 w-full bg-gray-50 border border-gray-100 rounded-xl" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-8 py-16">
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <Icon size={22} className="text-gray-500" />
        </div>
      )}
      <h3 className="font-bold text-gray-900 text-sm">{title}</h3>
      {body && <p className="text-xs text-gray-500 mt-1.5 leading-relaxed max-w-xs">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Normalises the verification row from GET verifications/me into a badge.
// v415: one vocabulary with the hub and desktop — Verified / Under review / Needs changes / More info needed /
// Verification pending (was Approved / Rejected / Action needed / Not started).
export function kycBadgeFor(status) {
  const s = String(status || "").toLowerCase();
  if (s === "approved" || s === "verified") return { tone: "green", label: "Verified" };
  if (s === "rejected") return { tone: "red", label: "Needs changes" };
  // Session 41 (Ravi): submitted KYC waiting for admin = "Under review", not "Pending".
  if (s === "pending" || s === "under_review" || s === "submitted" || s === "in_review") return { tone: "amber", label: "Under review" };
  if (s === "more_info_needed" || s === "more_info" || s === "needs_info") return { tone: "amber", label: "More info needed" }; // v358
  return { tone: "gray", label: "Verification pending" };
}
