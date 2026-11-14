import React, { useState } from "react";
import { RefreshCw, AlertTriangle, Lightbulb, CheckCircle2, Info } from "lucide-react";
import { Card, Chip, Trend } from "./GrowthUi";
import { inr, inrShort, num } from "./growthFormat";

// Session 46 — the top of the Overview. Three plain answers (where the money comes from, where to
// advertise, where people get stuck), the week against last week, and the alerts the numbers raise.

const LEVEL = {
  action: { Icon: Lightbulb, ring: "border-[#E9D5FF] bg-[#FAF5FF]", icon: "text-[#7E22CE]", label: "Do this" },
  warn: { Icon: AlertTriangle, ring: "border-amber-200 bg-amber-50/70", icon: "text-amber-600", label: "Needs attention" },
  good: { Icon: CheckCircle2, ring: "border-emerald-200 bg-emerald-50/70", icon: "text-emerald-600", label: "Going well" },
  info: { Icon: Info, ring: "border-gray-200 bg-gray-50", icon: "text-gray-500", label: "Good to know" },
};

function Answer({ question, answer, detail, cta, onClick }) {
  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm flex flex-col">
      <div className="text-xs font-bold text-gray-500">{question}</div>
      <div className="font-extrabold text-gray-900 text-lg leading-snug mt-2">{answer}</div>
      {detail && <p className="text-xs text-gray-600 font-medium mt-1.5 leading-relaxed">{detail}</p>}
      {cta && <button type="button" onClick={onClick} className="mt-3 self-start text-xs font-extrabold text-[#7E22CE] hover:underline min-h-[32px]">{cta}</button>}
    </div>
  );
}

// v332: "1 creators" / "1 deals" — say it right for one.
const plural = (n, one, many) => `${num(n)} ${Number(n) === 1 ? one : many}`;

export function Answers({ report, goTab }) {
  const g = report.geography;
  const f = report.funnel;
  const p = report.people;
  const money = g.topMoney[0];
  const ad = [...g.brandShortage, ...g.creatorShortage].sort((a, b) => b.priority - a.priority)[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Answer
        question="Where is the money coming from?"
        answer={money ? `${money.city} — ${inrShort(money.gmv)}` : report.money.gmv > 0 ? `${inrShort(report.money.gmv)} so far` : "No paid deals yet"}
        detail={money
          ? `${money.gmvSharePct}% of all deal value. Net revenue to Ybex: ${inr(report.money.netRevenue)}.`
          : report.money.gmv > 0 ? "Brands have not set a city, so deal value cannot be placed on a city yet." : "Numbers appear here after the first payment."}
        cta="See money" onClick={() => goTab("money")}
      />
      <Answer
        question="Where should we spend on ads?"
        answer={ad ? `${ad.city} — ${ad.zone === "brand_shortage" ? "find brands" : "find creators"}` : "No city is out of balance"}
        detail={ad ? ad.action : "Every city with enough people has both sides. Check back as signups grow."}
        cta="See all cities" onClick={() => goTab("where")}
      />
      <Answer
        question="Where are people getting stuck?"
        answer={f.worst ? `${f.worst.label} — ${f.worst.dropPct}% lost` : p.unpaidTotals.deals > 0 ? `${plural(p.unpaidTotals.deals, "deal", "deals")} waiting for payment` : "Nothing is stuck"}
        detail={f.worst
          ? f.worst.diagnosis
          : p.unpaidTotals.deals > 0
            ? `${inr(p.unpaidTotals.amount)} agreed but not paid. ${plural(p.incompleteCreators.total, "creator is", "creators are")} not bookable yet.`
            : `${plural(p.incompleteCreators.total, "creator is", "creators are")} not bookable yet.`}
        cta="See where" onClick={() => goTab(f.worst ? "funnel" : "people")}
      />
    </div>
  );
}

export function Pulse({ report }) {
  const items = [
    { label: "New signups", v: report.pulse.signups, fmt: num },
    { label: "Campaigns sent", v: report.pulse.campaigns, fmt: num },
    { label: "Applications", v: report.pulse.applications, fmt: num },
    { label: "Deal value", v: report.pulse.gmv, fmt: inrShort },
  ];
  return (
    <Card title="This week" hint="The last 7 days against the 7 days before.">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((i) => (
          <div key={i.label} className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4">
            <div className="text-xs font-bold text-gray-500">{i.label}</div>
            <div className="font-extrabold text-2xl text-gray-900 mt-1">{i.fmt(i.v.cur)}</div>
            <div className="flex items-center gap-2 mt-1">
              <Trend pct={i.v.changePct} />
              <span className="text-[11px] text-gray-500 font-medium">was {i.fmt(i.v.prev)}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function Alerts({ insights, goTab }) {
  const [all, setAll] = useState(false);
  const shown = all ? insights : insights.slice(0, 5);
  if (!insights.length) return null;
  return (
    <Card
      title="What the numbers say"
      hint="Each line comes from your own data, worked out fresh when you open this page."
      right={insights.length > 5 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="text-xs font-extrabold text-[#7E22CE] hover:underline min-h-[32px]">
          {all ? "Show fewer" : `Show all ${insights.length}`}
        </button>
      )}
    >
      <ul className="space-y-3">
        {shown.map((i) => {
          const L = LEVEL[i.level] || LEVEL.info;
          return (
            <li key={i.id} className={`rounded-2xl border p-4 flex gap-3 ${L.ring}`}>
              <L.Icon size={20} className={`shrink-0 mt-0.5 ${L.icon}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-extrabold text-gray-900 text-sm">{i.title}</span>
                  <Chip tone={i.level === "action" ? "purple" : i.level === "warn" ? "amber" : i.level === "good" ? "green" : "gray"}>{L.label}</Chip>
                </div>
                <p className="text-xs text-gray-700 font-medium mt-1 leading-relaxed">{i.body}</p>
                {i.cta && <button type="button" onClick={() => goTab(i.cta.tab)} className="mt-2 text-xs font-extrabold text-[#7E22CE] hover:underline min-h-[32px]">{i.cta.label}</button>}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function RefreshButton({ loading, onClick, updatedAt }) {
  return (
    <div className="flex items-center gap-3">
      {updatedAt && <span className="text-[11px] text-gray-500 font-medium hidden sm:inline">Updated {new Date(updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) /* v332: IST */}</span>}
      <button type="button" onClick={onClick} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs font-bold px-3.5 py-2 hover:bg-gray-50 disabled:opacity-60 min-h-[40px]">
        <RefreshCw size={14} className={loading ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden="true" /> Refresh
      </button>
    </div>
  );
}
