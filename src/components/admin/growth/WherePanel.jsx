import React from "react";
import { Card, Empty, Note, Meter, Chip, ScrollTable, Th, Td } from "./GrowthUi";
import { inrShort, num, ZONE_LABEL } from "./growthFormat";

// Session 46 — "Where should we advertise?" Every row is counted from real accounts, campaigns,
// applications and payments, grouped by the city the person or brand set on their profile.

// v332: "1 creators" / "1 campaigns" — say it right for one.
const pl = (n, one, many) => `${num(n)} ${Number(n) === 1 ? one : many}`;

const zoneTone = { brand_shortage: "purple", creator_shortage: "amber", balanced: "green", too_small: "gray" };

function ShortageList({ title, hint, rows, emptyText, kind }) {
  return (
    <div className="rounded-2xl border border-gray-100 p-4 md:p-5">
      <h4 className="font-extrabold text-gray-900 text-sm">{title}</h4>
      <p className="text-xs text-gray-500 font-medium mt-1 mb-4 leading-relaxed">{hint}</p>
      {rows.length === 0 ? (
        <Empty>{emptyText}</Empty>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li key={r.city}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-extrabold text-gray-900">{r.city}</span>
                <span className="text-xs font-bold text-gray-500 whitespace-nowrap">Priority {r.priority}/100</span>
              </div>
              <Meter value={r.priority} color={kind === "brands" ? "#A855F7" : "#F59E0B"} label={`${r.city} ad priority ${r.priority} of 100`} />
              <p className="text-xs text-gray-600 font-medium mt-1.5">
                {kind === "brands"
                  ? `${pl(r.creators, "creator", "creators")} · ${pl(r.brands, "brand", "brands")} · ${pl(r.campaigns, "campaign", "campaigns")}`
                  : `${pl(r.campaigns, "campaign", "campaigns")} · ${pl(r.applications, "application", "applications")} (${r.appsPerCampaign ?? 0} each) · ${pl(r.creators, "creator", "creators")}`}
              </p>
              <p className="text-xs text-gray-900 font-semibold mt-1">{r.action}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function WherePanel({ report }) {
  const g = report.geography;
  const rules = report.rules;
  const noCity = g.unsetCity.creators + g.unsetCity.brands;

  return (
    <div className="space-y-6">
      <Card
        title="Where to run ads"
        hint="Cities where one side of the marketplace is missing. Ads here bring the missing side, so each rupee balances the city instead of adding more of what is already there."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ShortageList
            kind="brands"
            title="Brand shortage — advertise to brands"
            hint={`Creators have signed up here but few brands have. Meta and LinkedIn ads for local D2C brands and agencies. Counted when there are ${rules.creatorsPerBrandLimit}+ creators for every brand.`}
            rows={g.brandShortage}
            emptyText="No city has far more creators than brands right now."
          />
          <ShortageList
            kind="creators"
            title="Creator shortage — advertise to creators"
            hint={`Brands here post campaigns but get few applicants. Instagram and Reels ads: "Get brand deals in your city". Counted when a city has ${rules.minCampaigns}+ campaigns and fewer than ${rules.applicantsPerCampaignLimit} applicants per campaign.`}
            rows={g.creatorShortage}
            emptyText="Every city with campaigns is getting enough applicants."
          />
        </div>
        <div className="mt-4">
          <Note tone="purple">
            Priority = how lopsided the city is × how big it is (full weight at {rules.fullWeightVolume}+ creators, brands and campaigns together). 0 means balanced.
            Cities with fewer than {rules.minCityVolume} of these are not judged.
          </Note>
        </div>
      </Card>

      <Card title="Money by city" hint="Where deal value comes from — each payment counts for the city of the brand that paid.">
        {g.topMoney.length === 0 ? (
          <Empty>No paid deals yet, so there is no money to place on a map.</Empty>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {g.topMoney.map((c, i) => (
              <li key={c.city} className="rounded-2xl border border-gray-100 p-4">
                <div className="text-xs font-bold text-gray-500">#{i + 1} source of money</div>
                <div className="font-extrabold text-xl text-gray-900 mt-1">{c.city}</div>
                <div className="text-sm font-bold text-[#7E22CE]">{inrShort(c.gmv)} <span className="text-gray-500 font-semibold">· {c.gmvSharePct}% of all deal value</span></div>
              </li>
            ))}
          </ul>
        )}
        {g.gmvUnknownCity > 0 && <p className="text-xs text-gray-500 font-medium mt-3">{inrShort(g.gmvUnknownCity)} of deal value is from brands that have not set a city.</p>}
      </Card>

      <Card
        title="All cities"
        hint="Creators and brands per city, how many have really earned or paid, and how many applicants each campaign gets."
      >
        {g.cities.length === 0 ? (
          <Empty>No account has set a city yet. Cities come from the profile — ask people to add theirs.</Empty>
        ) : (
          <ScrollTable>
            <thead>
              <tr>
                <Th>City</Th><Th right>Creators</Th><Th right>Brands</Th><Th right>Campaigns</Th><Th right>Applicants / campaign</Th>
                <Th right>Deal value</Th><Th right>Creators earning</Th><Th right>Brands paying</Th><Th>Status</Th><Th right>Ad priority</Th>
              </tr>
            </thead>
            <tbody>
              {g.cities.map((c) => (
                <tr key={c.city}>
                  <Td strong>{c.city}</Td>
                  <Td right>{num(c.creators)}</Td>
                  <Td right>{num(c.brands)}</Td>
                  <Td right>{num(c.campaigns)}</Td>
                  <Td right>{c.appsPerCampaign ?? "—"}</Td>
                  <Td right>{c.gmv ? inrShort(c.gmv) : "—"}</Td>
                  <Td right>{c.creators ? `${c.creatorConversion}%` : "—"}</Td>
                  <Td right>{c.brands ? `${c.brandConversion}%` : "—"}</Td>
                  <Td><Chip tone={zoneTone[c.zone]}>{ZONE_LABEL[c.zone]}</Chip></Td>
                  <Td right strong>{c.priority || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        )}
        {g.totalCities > g.cities.length && <p className="text-xs text-gray-500 font-medium mt-3">Showing the top {g.cities.length} of {g.totalCities} cities.</p>}
        {noCity > 0 && (
          <div className="mt-4">
            <Note tone="amber">{pl(g.unsetCity.creators, "creator", "creators")} and {pl(g.unsetCity.brands, "brand", "brands")} have no city, so they are not in this table.</Note>
          </div>
        )}
      </Card>

      <Card title="States" hint="Creators and brands by state, for a wider view than a single city.">
        {g.states.length === 0 ? (
          <Empty>No account has set a state yet.</Empty>
        ) : (
          <ul className="space-y-3">
            {(() => {
              const max = Math.max(...g.states.map((s) => s.creators + s.brands), 1);
              return g.states.map((s) => (
                <li key={s.state}>
                  <div className="flex flex-wrap items-center justify-between gap-x-2 text-sm">
                    <span className="font-bold text-gray-800">{s.state}</span>
                    <span className="text-xs font-semibold text-gray-500">{pl(s.creators, "creator", "creators")} · {pl(s.brands, "brand", "brands")}</span>
                  </div>
                  <Meter value={s.creators + s.brands} max={max} label={`${s.state}: ${s.creators + s.brands} accounts`} />
                </li>
              ));
            })()}
          </ul>
        )}
      </Card>
    </div>
  );
}
