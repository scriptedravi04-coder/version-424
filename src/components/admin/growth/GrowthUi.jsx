import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { trendText } from "./growthFormat";

// Session 46: the few building blocks the growth screens share. Same look as the rest of the
// admin (white cards, purple accent) so the Overview still feels like one page.

export function Card({ title, hint, right, children, className = "" }) {
  return (
    <section className={`bg-white border border-gray-100 rounded-3xl p-5 md:p-7 shadow-sm ${className}`}>
      {(title || right) && (
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            {title && <h3 className="font-extrabold text-gray-900 text-lg tracking-tight">{title}</h3>}
            {hint && <p className="text-xs text-gray-500 font-medium mt-1 max-w-2xl leading-relaxed">{hint}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/** Change against the period before. `bad="down"` (default) paints a fall red. */
export function Trend({ pct, className = "" }) {
  if (pct === null || pct === undefined) {
    return <span className={`text-[11px] font-bold text-gray-500 ${className}`}>{trendText(pct)}</span>;
  }
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-extrabold ${up ? "text-emerald-600" : "text-rose-600"} ${className}`}>
      <Icon size={12} aria-hidden="true" /> {trendText(pct)}
    </span>
  );
}

export function Empty({ children }) {
  return <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-5 text-sm text-gray-500 font-medium leading-relaxed">{children}</div>;
}

export function Note({ children, tone = "gray" }) {
  const tones = {
    gray: "bg-gray-50 border-gray-100 text-gray-600",
    amber: "bg-amber-50 border-amber-100 text-amber-800",
    purple: "bg-[#FAF5FF] border-[#F3E8FF] text-[#6B21A8]",
  };
  return <p className={`text-xs font-medium leading-relaxed rounded-xl border px-3.5 py-2.5 ${tones[tone] || tones.gray}`}>{children}</p>;
}

export function Meter({ value, max = 100, color = "#A855F7", label }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-2" role="img" aria-label={label || `${Math.round(w)} percent`}>
      <div className="h-2 rounded-full" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

export function Chip({ children, tone = "gray" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-600",
    purple: "bg-[#F3E8FF] text-[#7E22CE]",
    amber: "bg-amber-100 text-amber-800",
    rose: "bg-rose-100 text-rose-700",
    green: "bg-emerald-100 text-emerald-700",
    blue: "bg-sky-100 text-sky-700",
  };
  return <span className={`inline-block text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${tones[tone] || tones.gray}`}>{children}</span>;
}

/** A small number with a label — used in rows of 3-4. */
export function Figure({ label, value, sub, tone = "text-gray-900" }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4 min-w-0">
      <div className="text-xs font-bold text-gray-500">{label}</div>
      <div className={`font-extrabold text-2xl mt-1 break-words ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500 font-medium mt-1 leading-snug">{sub}</div>}
    </div>
  );
}

/** Table that scrolls sideways inside its own box on small screens. */
export function ScrollTable({ children }) {
  return <div className="overflow-x-auto -mx-1 px-1"><table className="w-full text-sm min-w-[560px]">{children}</table></div>;
}
export const Th = ({ children, right }) => <th className={`py-2.5 pr-3 text-xs font-bold text-gray-500 border-b border-gray-100 ${right ? "text-right" : "text-left"}`}>{children}</th>;
export const Td = ({ children, right, strong }) => <td className={`py-3 pr-3 border-b border-gray-50 align-middle ${right ? "text-right tabular-nums" : ""} ${strong ? "font-bold text-gray-900" : "text-gray-700"}`}>{children}</td>;
