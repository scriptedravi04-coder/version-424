import React from "react";
import { Card, Empty, Note, Figure, Trend } from "./GrowthUi";
import { inr, num, daysText } from "./growthFormat";
import { change } from "./growthMath";

// Session 46 — real money. Deal value (GMV) and platform fees count successful payments that
// were not refunded. "Held" is brand money paid in and not yet paid out or refunded.

// v332: "1 days" → "1 day"
const dd = (d) => `${d} day${Number(d) === 1 ? "" : "s"}`;

export default function MoneyPanel({ report, onNavigate }) {
  const m = report.money;
  const go = (t) => onNavigate && onNavigate(t);
  const pv = m.payouts.velocity;

  return (
    <div className="space-y-6">
      <Card title="Money" hint="Counted from real payments. Refunded payments are left out.">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Figure label="Deal value (GMV)" value={inr(m.gmv)} sub={`${num(m.payments)} payment${m.payments === 1 ? "" : "s"} so far`} />
          <Figure label="Ybex net revenue" value={inr(m.netRevenue)} sub={m.gmv > 0 ? `${m.takeRatePct}% of deal value (platform fee)` : "Platform fee on payments"} tone="text-[#7E22CE]" />
          <Figure label="Money held now" value={inr(m.held.amount)} sub={`${num(m.held.count)} payment${m.held.count === 1 ? "" : "s"} paid in, not yet paid out`} tone="text-[#027A48]" />
          <Figure label="Payouts waiting" value={num(m.payouts.pendingCount)} sub={m.payouts.pendingCount ? `${inr(m.payouts.pendingAmount)} to send` : "Nothing waiting"} tone={m.payouts.pendingCount ? "text-rose-600" : "text-gray-900"} />
        </div>
      </Card>

      <Card title="This week and this month" hint="Deal value against the period before it.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label: "Last 7 days", cur: m.week.gmv, prev: m.week.prevGmv, fee: m.week.fee, prevLabel: "the 7 days before" },
            { label: "Last 30 days", cur: m.month.gmv, prev: m.month.prevGmv, fee: m.month.fee, prevLabel: "the 30 days before" },
          ].map((r) => (
            <div key={r.label} className="rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-700">{r.label}</span>
                <Trend pct={change(r.cur, r.prev)} />
              </div>
              <div className="font-extrabold text-2xl text-gray-900 mt-1">{inr(r.cur)}</div>
              <p className="text-xs text-gray-500 font-medium mt-1">{inr(r.prev)} in {r.prevLabel} · platform fee {inr(r.fee)}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Payout speed"
        hint="Creators come back when they are paid fast."
        right={m.payouts.pendingCount > 0 && (
          <button type="button" onClick={() => go("escrow&view=requests")} className="rounded-xl bg-[#7E22CE] text-white text-xs font-bold px-4 py-2.5 hover:bg-[#6B21A8] min-h-[40px]">
            Open payout requests
          </button>
        )}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Figure label="Waiting now" value={num(m.payouts.pendingCount)} sub={m.payouts.pendingCount ? inr(m.payouts.pendingAmount) : "All clear"} />
          <Figure label="Oldest waiting payment" value={m.payouts.oldestPaymentAgeDays === null ? "—" : daysText(m.payouts.oldestPaymentAgeDays)} sub="Age of the payment, not of the request" />
          <Figure label="Paid out so far" value={num(m.payouts.paidOutCount)} />
          <Figure label="Payment → payout" value={pv.avgDays === null ? "—" : dd(pv.avgDays)} sub={pv.avgDays === null ? "No payout with a time yet" : `Typical ${dd(pv.medianDays)} · ${pv.sample} payout${pv.sample === 1 ? "" : "s"}`} />
        </div>
        <div className="mt-4"><Note>The time a creator pressed "request payout" is not stored, so the speed is measured from the day the brand paid.</Note></div>
        {m.payments === 0 && <div className="mt-4"><Empty>No payment has come in yet, so there is nothing to compare.</Empty></div>}
      </Card>
    </div>
  );
}
