// v396 (Ravi): "Filters" button on Admin → Users → Creators / Unclaimed that opens the same kind of
// panel as Explore Creators (followers range, city, state, niche, …). Pure logic: src/lib/adminCreatorFilters.js.
import React, { useMemo, useState } from "react";
import { SlidersHorizontal, X, Search, Check } from "lucide-react";
import {
  NICHE_GROUPS, CITY_OPTIONS, STATE_OPTIONS, LANGUAGES, PLATFORMS, GENDERS, FOLLOWER_TIERS, RATE_TIERS,
  PROFILE_STATUSES, KYC_STATUSES, IG_STATES, SORTS, EMPTY_CREATOR_FILTERS, countCreatorFilters,
} from "../../lib/adminCreatorFilters";

const chip = (on) => `px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer select-none inline-flex items-center gap-1 ${on ? "bg-[#F3E8FF] text-[#7E22CE] border-[#C084FC]" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"}`;

function Group({ title, children }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-extrabold uppercase tracking-widest text-gray-500">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chips({ options, values, onToggle }) {
  return options.map((o) => {
    const key = typeof o === "string" ? o : o.key;
    const label = typeof o === "string" ? o : o.label;
    const on = values.includes(key);
    return (
      <button key={key} type="button" className={chip(on)} onClick={() => onToggle(key)} aria-pressed={on}>
        {on && <Check size={12} />}{label}
      </button>
    );
  });
}

/** Searchable multi-pick for long lists (cities / states). Shows picked ones + up to 40 matches. */
function SearchPick({ placeholder, options, values, onToggle }) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t ? options.filter((o) => o.toLowerCase().includes(t)) : options;
    return list.filter((o) => !values.includes(o)).slice(0, t ? 40 : 16);
  }, [q, options, values]);
  return (
    <div className="w-full space-y-2">
      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
          className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[16px] sm:text-xs font-semibold focus:outline-none focus:border-[#C084FC]" />
      </div>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <button key={v} type="button" className={chip(true)} onClick={() => onToggle(v)}><Check size={12} />{v}<X size={12} /></button>
        ))}
        {matches.map((v) => (
          <button key={v} type="button" className={chip(false)} onClick={() => onToggle(v)}>{v}</button>
        ))}
      </div>
    </div>
  );
}

export default function AdminCreatorFilters({ value, onChange, shown = 0, total = 0, extraCities = [] }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value || EMPTY_CREATOR_FILTERS);
  const count = countCreatorFilters(value);
  const cities = useMemo(() => Array.from(new Set([...extraCities.filter(Boolean), ...CITY_OPTIONS])), [extraCities]);

  const toggle = (k, v) => setDraft((d) => ({ ...d, [k]: (d[k] || []).includes(v) ? d[k].filter((x) => x !== v) : [...(d[k] || []), v] }));
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const openPanel = () => { setDraft(value || EMPTY_CREATOR_FILTERS); setOpen((o) => !o); };
  const apply = () => { onChange(draft); setOpen(false); };
  const clearAll = () => { setDraft(EMPTY_CREATOR_FILTERS); onChange(EMPTY_CREATOR_FILTERS); };

  // v421 (Ravi): sits next to the search box now; the panel drops down over the list instead of pushing it.
  return (
    <div>{/* v421: the panel anchors to the nearest positioned parent (the search row on the Users page) */}
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={openPanel} data-testid="admin-creator-filters"
          className={`px-4 py-2.5 rounded-xl border text-sm flex items-center gap-2 cursor-pointer transition-all select-none font-semibold ${open || count ? "bg-[#F3E8FF] border-[#C084FC] text-[#7E22CE]" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
          <SlidersHorizontal size={16} />
          <span>Filters</span>
          {count > 0 && <span className="w-5 h-5 rounded-full bg-[#A855F7] text-white text-[11px] font-black flex items-center justify-center">{count}</span>}
        </button>
        {count > 0 && (
          <>
            <span className="text-xs font-semibold text-gray-500">Showing {shown.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}</span>
            <button type="button" onClick={clearAll} className="text-xs font-bold text-red-500 hover:text-red-700 cursor-pointer">Clear filters</button>
          </>
        )}
      </div>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-30 w-[min(760px,90vw)] max-h-[70vh] overflow-y-auto p-4 sm:p-5 bg-white border border-gray-200 rounded-2xl space-y-5 shadow-xl" data-testid="admin-creator-filter-panel">
          <Group title="Followers">
            <Chips options={FOLLOWER_TIERS} values={draft.followerRanges} onToggle={(v) => toggle("followerRanges", v)} />
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input inputMode="numeric" value={draft.minFollowers} onChange={(e) => set("minFollowers", e.target.value)} placeholder="Min (e.g. 5000 or 5k)"
                className="w-36 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[16px] sm:text-xs font-semibold focus:outline-none focus:border-[#C084FC]" />
              <span className="text-xs text-gray-500">to</span>
              <input inputMode="numeric" value={draft.maxFollowers} onChange={(e) => set("maxFollowers", e.target.value)} placeholder="Max (e.g. 1L)"
                className="w-36 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[16px] sm:text-xs font-semibold focus:outline-none focus:border-[#C084FC]" />
            </div>
          </Group>
          <Group title="City"><SearchPick placeholder="Search city…" options={cities} values={draft.cities} onToggle={(v) => toggle("cities", v)} /></Group>
          <Group title="State"><SearchPick placeholder="Search state…" options={STATE_OPTIONS} values={draft.states} onToggle={(v) => toggle("states", v)} /></Group>
          <div className="space-y-3">
            <div className="text-[11px] font-extrabold uppercase tracking-widest text-gray-500">Niche</div>
            {NICHE_GROUPS.map((g) => (
              <div key={g.group} className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-gray-500 w-full sm:w-40 shrink-0">{g.group}</span>
                <Chips options={g.items} values={draft.niches} onToggle={(v) => toggle("niches", v)} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Group title="Platform"><Chips options={PLATFORMS} values={draft.platforms} onToggle={(v) => toggle("platforms", v)} /></Group>
            <Group title="Language"><Chips options={LANGUAGES} values={draft.languages} onToggle={(v) => toggle("languages", v)} /></Group>
            <Group title="Gender">
              {GENDERS.map((g) => <button key={g} type="button" className={chip(draft.gender === g)} onClick={() => set("gender", g)}>{g}</button>)}
            </Group>
            <Group title="Paid / barter">
              {["Both", "Paid", "Barter"].map((m) => <button key={m} type="button" className={chip(draft.collabMode === m)} onClick={() => set("collabMode", m)}>{m}</button>)}
            </Group>
            <Group title="Rate per reel"><Chips options={RATE_TIERS} values={draft.rateRanges} onToggle={(v) => toggle("rateRanges", v)} /></Group>
            <Group title="Profile status"><Chips options={PROFILE_STATUSES} values={draft.profileStatus} onToggle={(v) => toggle("profileStatus", v)} /></Group>
            <Group title="KYC"><Chips options={KYC_STATUSES} values={draft.kyc} onToggle={(v) => toggle("kyc", v)} /></Group>
            <Group title="Instagram"><Chips options={IG_STATES} values={draft.ig} onToggle={(v) => toggle("ig", v)} /></Group>
          </div>
          <Group title="Sort by">
            {SORTS.map((s) => <button key={s.key} type="button" className={chip(draft.sortBy === s.key)} onClick={() => set("sortBy", s.key)}>{s.label}</button>)}
          </Group>
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => setDraft(EMPTY_CREATOR_FILTERS)} className="px-4 py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50 cursor-pointer">Reset</button>
            <button type="button" onClick={apply} data-testid="admin-creator-filters-apply" className="px-5 py-2 rounded-xl text-sm font-extrabold text-white bg-[#A855F7] hover:bg-[#9333EA] cursor-pointer">Show creators</button>
          </div>
        </div>
      )}
    </div>
  );
}
