import React from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { api } from "../../../lib/api";
import useBusy from "../../../lib/useBusy";
import ButtonSpinner from "../../common/ButtonSpinner";
import { Card, Empty, Note, Figure, Chip, ScrollTable, Th, Td } from "./GrowthUi";
import { inr, inrShort, num, daysText } from "./growthFormat";

// Session 46 — who is on the platform, who is active, who earns / spends the most, and who is
// about to drop off. The two reminder buttons send a real notification (bell + email); the
// server works out the list itself and never sends the same reminder twice in 3 days.

function ActivityFigure({ label, a, sub }) {
  return <Figure label={label} value={num(a.total)} sub={`${num(a.creators)} creators · ${num(a.brands)} brands${sub ? ` · ${sub}` : ""}`} />;
}

export default function PeoplePanel({ report, onReminderSent }) {
  const p = report.people;
  const { isBusy, anyBusy, run } = useBusy();
  const act = p.activity;

  const sendReminder = (kind, count, who) =>
    run(kind, async () => {
      // v332: "1 brands" in the confirm
      if (!window.confirm(`Send a reminder to ${count} ${Number(count) === 1 ? who.replace(/s$/, "") : who}? Each person gets a notification and an email. Nobody gets the same reminder twice in 3 days.`)) return;
      try {
        const res = await api.post("admin/growth/nudge", { kind });
        toast.success(res?.data?.message || "Reminders sent.");
        if (onReminderSent) onReminderSent();
      } catch (e) {
        toast.error(e?.response?.data?.error || "Could not send the reminders.");
      }
    });

  return (
    <div className="space-y-6">
      <Card title="Who is on Ybex" hint="Accounts by type. Creators are counted as KYC-approved only when the admin approved their KYC.">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Figure label="Creators" value={num(p.split.creators)} sub={`${num(p.split.verifiedCreators)} KYC-approved`} />
          <Figure label="Brands" value={num(p.split.brands)} sub="Direct brand accounts" />
          <Figure label="Agencies" value={num(p.split.agencies)} sub="Brand accounts marked as agency" />
          <Figure label="Total accounts" value={num(p.split.creators + p.split.brands + p.split.agencies)} />
        </div>
      </Card>

      <Card title="Who is active" hint="People who logged in within the last day, week and month.">
        {!act.available ? (
          <Empty>Login sessions could not be read, so activity is not shown. The rest of this page is unaffected.</Empty>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <ActivityFigure label="Active today" a={act.dau} />
              <ActivityFigure label="Active this week" a={act.wau} />
              <ActivityFigure label="Active this month" a={act.mau} sub={`${act.mauShare}% of all accounts`} />
              <Figure label="Daily ÷ monthly" value={`${act.stickiness}%`} sub="How many monthly users come back every day" />
            </div>
            <div className="mt-4"><Note>{act.note}</Note></div>
          </>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="Top 10 brands by spend" hint="Brands that paid the most. Keep these close.">
          {p.topBrands.length === 0 ? <Empty>No paid deals yet.</Empty> : (
            <ScrollTable>
              <thead><tr><Th>Brand</Th><Th right>Paid</Th><Th right>Deals</Th></tr></thead>
              <tbody>
                {p.topBrands.map((b, i) => (
                  <tr key={b.user_id}><Td strong>{i + 1}. {b.name}</Td><Td right>{inr(b.total)}</Td><Td right>{b.deals}</Td></tr>
                ))}
              </tbody>
            </ScrollTable>
          )}
        </Card>
        <Card title="Top 10 creators by earnings" hint="Creators who earned the most through Ybex (after the platform fee).">
          {p.topCreators.length === 0 ? <Empty>No paid deals yet.</Empty> : (
            <ScrollTable>
              <thead><tr><Th>Creator</Th><Th>City</Th><Th right>Earned</Th><Th right>Paid out</Th></tr></thead>
              <tbody>
                {p.topCreators.map((c, i) => (
                  <tr key={c.user_id}><Td strong>{i + 1}. {c.name}</Td><Td>{c.city}</Td><Td right>{inr(c.earned)}</Td><Td right>{inr(c.paidOut)}</Td></tr>
                ))}
              </tbody>
            </ScrollTable>
          )}
        </Card>
      </div>

      <Card
        title="Brands that stopped before paying"
        hint="A creator is waiting but the brand has not paid, or a campaign was left as a draft. A call from the team closes these fastest."
        right={p.unpaidTotals.deals > 0 && (
          <button
            type="button"
            disabled={anyBusy}
            onClick={() => sendReminder("brand_payment", p.unpaidTotals.dealBrands, "brands")}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#7E22CE] text-white text-xs font-bold px-4 py-2.5 hover:bg-[#6B21A8] disabled:opacity-60 min-h-[40px]"
          >
            {isBusy("brand_payment") ? <ButtonSpinner label="Sending" /> : <><Send size={14} aria-hidden="true" /> Remind brands to pay</>}
          </button>
        )}
      >
        {p.unpaidBrands.length === 0 ? (
          <Empty>No brand is holding up a deal right now.</Empty>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-5">
              <Figure label="Deals waiting" value={num(p.unpaidTotals.deals)} />
              <Figure label="Agreed, not paid" value={inrShort(p.unpaidTotals.amount)} />
              <Figure label="Draft campaigns left" value={num(p.unpaidTotals.drafts)} />
            </div>
            <ScrollTable>
              <thead><tr><Th>Brand</Th><Th>Contact</Th><Th right>Deals waiting</Th><Th right>Agreed</Th><Th right>Drafts</Th><Th right>Waiting</Th></tr></thead>
              <tbody>
                {p.unpaidBrands.map((b) => (
                  <tr key={b.user_id}>
                    <Td strong>{b.name}</Td>
                    <Td>{b.phone || b.email || "—"}</Td>
                    <Td right>{b.waitingDeals}</Td>
                    <Td right>{b.waitingAmount ? inr(b.waitingAmount) : "—"}</Td>
                    <Td right>{b.draftCampaigns}</Td>
                    <Td right>{daysText(b.waitingDays)}</Td>
                  </tr>
                ))}
              </tbody>
            </ScrollTable>
          </>
        )}
      </Card>

      <Card
        title="Creators who are not bookable yet"
        hint="They made a profile but have no approved KYC or no rate card, so brands cannot book them and they cannot be paid."
        right={p.incompleteCreators.total > 0 && (
          <button
            type="button"
            disabled={anyBusy}
            onClick={() => sendReminder("creator_profile", p.incompleteCreators.total, "creators")}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#7E22CE] text-white text-xs font-bold px-4 py-2.5 hover:bg-[#6B21A8] disabled:opacity-60 min-h-[40px]"
          >
            {isBusy("creator_profile") ? <ButtonSpinner label="Sending" /> : <><Send size={14} aria-hidden="true" /> Remind creators</>}
          </button>
        )}
      >
        {p.incompleteCreators.total === 0 ? (
          <Empty>Every creator with a profile has KYC and a rate card.</Empty>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-5">
              <Figure label="Not bookable" value={num(p.incompleteCreators.total)} />
              <Figure label="Need KYC" value={num(p.incompleteCreators.needKyc)} />
              <Figure label="No rate card" value={num(p.incompleteCreators.needRateCard)} />
            </div>
            <ScrollTable>
              <thead><tr><Th>Creator</Th><Th>City</Th><Th>Missing</Th><Th right>Since signup</Th></tr></thead>
              <tbody>
                {p.incompleteCreators.list.map((c) => (
                  <tr key={c.user_id}>
                    <Td strong>{c.name}</Td>
                    <Td>{c.city}</Td>
                    <Td>
                      <span className="inline-flex gap-1.5">
                        {c.needsKyc && <Chip tone="rose">KYC</Chip>}
                        {c.needsRateCard && <Chip tone="amber">Rate card</Chip>}
                      </span>
                    </Td>
                    <Td right>{daysText(c.daysSinceSignup)}</Td>
                  </tr>
                ))}
              </tbody>
            </ScrollTable>
            {p.incompleteCreators.total > p.incompleteCreators.list.length && (
              <p className="text-xs text-gray-500 font-medium mt-3">Showing the {p.incompleteCreators.list.length} who have waited longest. The reminder goes to all {num(p.incompleteCreators.total)}.</p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
