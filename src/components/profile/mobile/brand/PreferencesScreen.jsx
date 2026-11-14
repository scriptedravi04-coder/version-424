import React, { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { MobileScreen, Section, Field, Chip, PrimaryButton } from "./brandMobileUi";
import {
  CAMPAIGN_TYPES, BUDGET_RANGES, CREATOR_SIZES, GENDER_FOCUS, ALL_NICHES, toList, aliasPref, CAMPAIGN_TYPE_LABELS,
} from "./useBrandProfileData";

// Screen 1d — campaign preferences. Same brand_profiles columns the desktop
// settings page writes (campaign_types, budget_range, preferred_creator_size,
// preferred_niches, gender_focus).

export default function PreferencesScreen({ onBack, profile, saving, onSave, loadFailed = false }) {
  // v358: saved values from onboarding / desktop are read as the matching chip (see aliasPref)
  const [types, setTypes] = useState(() => toList(profile.campaignTypes).map((t) => aliasPref("type", t)));
  const [budget, setBudget] = useState(aliasPref("budget", profile.budgetRange));
  const [size, setSize] = useState(aliasPref("size", profile.creatorSize));
  // v415: "Target niches" holds several niches (was one chip; "Food, Beauty" from desktop showed as one chip
  // and picking a new one replaced them all). Saved the same way as before: one comma-separated value.
  const [nicheList, setNicheList] = useState(() => toList(profile.niches));
  const niche = nicheList.join(", ");
  const [gender, setGender] = useState(aliasPref("gender", profile.genderFocus));
  const [nicheQuery, setNicheQuery] = useState("");

  const toggle = (list, setList, value) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const nicheMatches = useMemo(() => {
    const q = nicheQuery.trim().toLowerCase();
    if (!q) return [];
    return ALL_NICHES.filter((n) => n.toLowerCase().includes(q) && !nicheList.includes(n)).slice(0, 6);
  }, [nicheQuery, nicheList]);

  const dirty =
    types.join(", ") !== toList(profile.campaignTypes).map((t) => aliasPref("type", t)).join(", ") ||
    budget !== aliasPref("budget", profile.budgetRange) ||
    size !== aliasPref("size", profile.creatorSize) ||
    niche !== toList(profile.niches).join(", ") ||
    gender !== aliasPref("gender", profile.genderFocus);

  const handleSave = () =>
    onSave({
      campaignTypes: types.join(", "),
      budgetRange: budget,
      creatorSize: size,
      niches: niche,
      genderFocus: gender,
    });

  return (
    <MobileScreen
      title="Campaign preferences"
      onBack={onBack}
      footer={
        <PrimaryButton disabled={saving || !dirty || loadFailed} busy={saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save preferences"}
        </PrimaryButton>
      }
    >
      <Section hint="We use these to decide which creators see your briefs first.">
        <Field
          group /* v415: chip group, not a <label> */
          label="Campaign types"
          hint={types.length ? `${types.length} selected` : "Pick everything you'd consider."}
        >
          <div className="flex flex-wrap gap-2">
            {[...CAMPAIGN_TYPES, ...types.filter((t) => !CAMPAIGN_TYPES.includes(t))].map((t) => (
              <Chip key={t} selected={types.includes(t)} onClick={() => toggle(types, setTypes, t)}>
                {CAMPAIGN_TYPE_LABELS[t] || t}
              </Chip>
            ))}
          </div>
        </Field>

        <Field group /* v415 */ label="Typical budget per campaign">
          <div className="flex flex-wrap gap-2">
            {[...BUDGET_RANGES, ...(budget && !BUDGET_RANGES.includes(budget) ? [budget] : [])].map((b) => (
              <Chip key={b} selected={budget === b} onClick={() => setBudget(budget === b ? "" : b)}>
                {b}
              </Chip>
            ))}
          </div>
        </Field>

        <Field group /* v415 */ label="Preferred creator size">
          <div className="flex flex-wrap gap-2">
            {[...CREATOR_SIZES, ...(size && !CREATOR_SIZES.includes(size) ? [size] : [])].map((s) => (
              <Chip key={s} selected={size === s} onClick={() => setSize(size === s ? "" : s)}>
                {s}
              </Chip>
            ))}
          </div>
        </Field>

        <Field group /* v415 */ label="Target niches">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={nicheQuery}
              onChange={(e) => setNicheQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setNicheQuery(""); }} // v415
              placeholder="Search niches to add"
              aria-label="Search niches to add" // v332: label + 16px text (iOS zoom)
              className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3.5 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#7C3AED] focus:bg-white"
            />
          </div>

          {nicheMatches.length > 0 && (
            <div className="mt-2 rounded-xl border border-gray-200 overflow-hidden">
              {nicheMatches.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => { setNicheList((l) => (l.includes(n) ? l : [...l, n])); setNicheQuery(""); }}
                  className="w-full px-3.5 py-2.5 text-left text-sm text-gray-900 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                >
                  {n}
                </button>
              ))}
            </div>
          )}

          {nicheList.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {nicheList.map((n) => (
                <span key={n} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F5F0FF] text-[#6D28D9] text-xs font-semibold max-w-full">
                  <span className="truncate">{n}</span>
                  <button type="button" onClick={() => setNicheList((l) => l.filter((x) => x !== n))} aria-label={`Remove ${n}`} className="-my-2 -mr-2 p-2">{/* v332: bigger tap target for the tiny × */}
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Field>

        <Field group /* v415 */ label="Target audience gender">
          <div className="flex flex-wrap gap-2">
            {[...GENDER_FOCUS, ...(gender && !GENDER_FOCUS.includes(gender) ? [gender] : [])].map((g) => (
              <Chip key={g} selected={gender === g} onClick={() => setGender(gender === g ? "" : g)}>
                {g}
              </Chip>
            ))}
          </div>
        </Field>
      </Section>
    </MobileScreen>
  );
}
