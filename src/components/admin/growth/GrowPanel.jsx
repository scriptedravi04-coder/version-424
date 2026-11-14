import React from "react";
import { Card, Empty, Note, Figure, Meter, Chip, ScrollTable, Th, Td, Trend } from "./GrowthUi";
import { inr, num, GAP_LABEL } from "./growthFormat";

// Session 46 — what to do to grow: which categories lack creators or campaigns, where new
// accounts get stuck on the way to their first paid deal, who to win back, and where signups
// come from (as far as the database records it).

const gapTone = { creators_needed: "amber", campaigns_needed: "purple", balanced: "green" };

function Steps({ steps, color }) {
  return (
    <ol className="space-y-4">
      {steps.map((s, i) => (
        <li key={s.key}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-bold text-gray-800">{s.label}</span>
            <span className="text-sm font-extrabold text-gray-900 tabular-nums">{num(s.count)}</span>
          </div>
          <Meter value={s.count} max={steps[0].count || 1} color={color} label={`${s.label}: ${s.count}`} />
          {i > 0 && <p className="text-[11px] font-semibold text-gray-500 mt-1">{s.ofPrevPct}% of the step before · {s.ofFirstPct}% of everyone who signed up</p>}
        </li>
      ))}
    </ol>
  );
}

export default function GrowPanel({ report }) {
  const c = report.categories;
  const a = report.activation;
  const acq = report.acquisition;
  const r = a.brandRetention;

  return (
    <div className="space-y-6">
      <Card title="Categories" hint="Campaigns brands posted (demand) against creators who picked that niche (supply). New campaigns compare the last 14 days with the 14 days before.">
        {c.rows.length === 0 ? (
          <Empty>No campaign or creator has a category yet.</Empty>
        ) : (
          <ScrollTable>
            <thead><tr><Th>Category</Th><Th right>Campaigns</Th><Th right>Creators</Th><Th right>Avg budget</Th><Th right>New campaigns (14 days)</Th><Th>Status</Th></tr></thead>
            <tbody>
              {c.rows.map((x) => (
                <tr key={x.category}>
                  <Td strong>{x.category}</Td>
                  <Td right>{num(x.campaigns)}</Td>
                  <Td right>{num(x.creators)}</Td>
                  <Td right>{x.avgBudget ? inr(x.avgBudget) : "—"}</Td>
                  <Td right><span className="inline-flex items-center gap-2 justify-end">{num(x.recent)} <Trend pct={x.growthPct} /></span></Td>
                  <Td><Chip tone={gapTone[x.gap]}>{GAP_LABEL[x.gap]}</Chip></Td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        )}
        {c.creatorsWithoutNiche > 0 && <div className="mt-4"><Note tone="amber">{num(c.creatorsWithoutNiche)} {c.creatorsWithoutNiche === 1 ? "creator has" : "creators have"}{/* v332 */} not picked a category, so they are not counted as supply anywhere above.</Note></div>}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="Creator journey" hint="How far new creators get. The biggest fall is where to help them.">
          <Steps steps={a.creators} color="#A855F7" />
        </Card>
        <Card title="Brand journey" hint="How far new brands get on the way to their first payment.">
          <Steps steps={a.brands} color="#10B981" />
        </Card>
      </div>

      <Card title="Brands that come back" hint="Repeat brands are the cheapest growth. A brand that paid once and went quiet is worth a message.">
        <div className="grid grid-cols-3 gap-4 mb-5">
          <Figure label="Brands that paid" value={num(r.payingBrands)} />
          <Figure label="Paid more than once" value={num(r.repeatBrands)} sub={r.payingBrands ? `${r.repeatPct}% of paying brands` : undefined} />
          <Figure label={`Quiet ${r.winBackDays}+ days`} value={num(r.winBack.length)} sub="Paid before, nothing since" tone={r.winBack.length ? "text-rose-600" : "text-gray-900"} />
        </div>
        {r.winBack.length === 0 ? (
          <Empty>No paying brand has been quiet for {r.winBackDays} days or more.</Empty>
        ) : (
          <ScrollTable>
            <thead><tr><Th>Brand</Th><Th>Email</Th><Th right>Paid in total</Th><Th right>Quiet for</Th></tr></thead>
            <tbody>
              {r.winBack.map((b) => (
                <tr key={b.user_id}><Td strong>{b.name}</Td><Td>{b.email || "—"}</Td><Td right>{inr(b.lifetime)}</Td><Td right>{b.daysQuiet} days</Td></tr>
              ))}
            </tbody>
          </ScrollTable>
        )}
      </Card>

      <Card title="Where signups come from" hint="Creators and brands who signed up, by how they arrived.">
        <ul className="space-y-4">
          {acq.channels.map((ch) => (
            <li key={ch.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-bold text-gray-800">{ch.label}</span>
                <span className="text-sm font-extrabold text-gray-900 tabular-nums">{num(ch.count)} <span className="text-xs font-semibold text-gray-500">· {num(ch.last30)} in the last 30 days</span></span>
              </div>
              <Meter value={ch.count} max={acq.total || 1} color={ch.key === "referral" ? "#A855F7" : ch.key === "other" ? "#CBD5E1" : "#10B981"} label={`${ch.label}: ${ch.count}`} />
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-600 font-medium mt-4">
          {acq.referralPct}% of signups came through Refer &amp; Earn · {num(acq.referralsTotal)} referral{acq.referralsTotal === 1 ? "" : "s"} made, {num(acq.referralsConverted)} rewarded.
        </p>
        {acq.trackingNote && <div className="mt-4"><Note tone={acq.trackingGap ? "amber" : "purple"}>{acq.trackingNote}</Note></div>}
      </Card>
    </div>
  );
}
