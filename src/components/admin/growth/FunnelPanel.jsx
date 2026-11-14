import React from "react";
import { Card, Empty, Note, Figure, Meter, Chip } from "./GrowthUi";
import { inr, num, daysText, hoursText } from "./growthFormat";

// Session 46 — where deals stall. Stages are counted from each deal's current status and its
// payment (a deal can only have reached "payment held" if a real payment exists for it).

// v332: "1 days" → "1 day"
const dd = (d) => `${d} day${Number(d) === 1 ? "" : "s"}`;

export default function FunnelPanel({ report }) {
  const f = report.funnel;
  const v = f.velocity;
  const top = Math.max(...f.steps.map((s) => s.count), 1);
  const slow = v.avgDays !== null && v.avgDays > v.targetDays;

  return (
    <div className="space-y-6">
      <Card title="Deal pipeline" hint="Campaign → applications → chat → payment → draft → approved and paid out. The biggest drop shows where deals get stuck.">
        {f.worst && (
          <div className="mb-5 rounded-2xl border border-rose-100 bg-rose-50/60 p-4">
            <div className="text-sm font-extrabold text-rose-700">Biggest drop: {f.worst.label} — {f.worst.dropPct}% of deals did not get past it</div>
            <p className="text-xs text-rose-800/80 font-medium mt-1 leading-relaxed">{f.worst.diagnosis}</p>
          </div>
        )}
        <ol className="space-y-4">
          {f.steps.map((s) => {
            const isWorst = f.worst && f.worst.key === s.key;
            return (
              <li key={s.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-bold text-gray-800">{s.label}</span>
                  <span className="text-sm font-extrabold text-gray-900 tabular-nums">
                    {num(s.count)} <span className="text-xs font-semibold text-gray-500">{s.unit}</span>
                  </span>
                </div>
                <Meter value={s.count} max={top} color={isWorst ? "#F43F5E" : "#A855F7"} label={`${s.label}: ${s.count} ${s.unit}`} />
                {s.keepPct !== null && (
                  <p className="text-[11px] font-semibold text-gray-500 mt-1">
                    {s.keepPct}% of the stage before kept going · {s.dropPct}% dropped
                  </p>
                )}
              </li>
            );
          })}
        </ol>
        <div className="mt-5"><Note>
          Applications → chat is not a strict drop: a deal can also start from a direct invite, with no application.
          {f.cancelled > 0 ? ` ${num(f.cancelled)} deal${f.cancelled === 1 ? " was" : "s were"} cancelled; they count only up to the stage they reached.` : ""}
        </Note></div>
      </Card>

      <Card title="Deal speed" hint="How long it takes. Faster deals mean creators get paid sooner and brands come back.">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Figure
            label="Campaign → deal completed"
            value={v.avgDays === null ? "—" : dd(v.avgDays)}
            tone={slow ? "text-rose-600" : "text-gray-900"}
            sub={v.avgDays === null ? "No completed deal yet" : `Target ${dd(v.targetDays)} · typical ${dd(v.medianDays)} · ${v.completedSample} deal${v.completedSample === 1 ? "" : "s"}`}
          />
          <Figure label="Application → accepted" value={hoursText(v.avgHoursToAccept)} sub="How fast brands respond to applicants" />
          <Figure label="Accepted → payment held" value={hoursText(v.avgHoursToPay)} sub="How long brands take to pay" />
          <Figure
            label="Payment → payout sent"
            value={report.money.payouts.velocity.avgDays === null ? "—" : dd(report.money.payouts.velocity.avgDays)}
            sub={report.money.payouts.velocity.avgDays === null ? "No payout with a time yet" : `${report.money.payouts.velocity.sample} payout${report.money.payouts.velocity.sample === 1 ? "" : "s"}`}
          />
        </div>
        {v.completedSample > 0 && v.completedSample < 5 && (
          <div className="mt-4"><Note tone="amber">Only {v.completedSample} completed deal{v.completedSample === 1 ? "" : "s"} so far — treat the average as a hint, not a result.</Note></div>
        )}
        <div className="mt-4"><Note>{v.note}</Note></div>
      </Card>

      <Card title="Live campaigns nobody applied to" hint={`Live for ${report.rules.emptyCampaignDays}+ days with no applicant. Push them to creators or help the brand improve the brief.`}>
        {f.emptyCampaigns.length === 0 ? (
          <Empty>Every live campaign older than {report.rules.emptyCampaignDays} days has at least one applicant.</Empty>
        ) : (
          <ul className="divide-y divide-gray-100">
            {f.emptyCampaigns.map((c) => (
              <li key={c.campaign_id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div className="min-w-0">
                  <div className="font-bold text-gray-900 truncate">{c.title}</div>
                  <div className="text-xs text-gray-500 font-medium">{c.brand}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.budget > 0 && <Chip tone="purple">{inr(c.budget)}</Chip>}
                  <Chip tone="amber">{daysText(c.days)} live, 0 applicants</Chip>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
