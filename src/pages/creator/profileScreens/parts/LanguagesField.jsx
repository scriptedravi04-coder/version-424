import React from "react";
import { X, Plus } from "lucide-react";


// Session 49 (clean-up): moved out of CreatorMobileProfile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function LanguagesField(props) {
  const { availableLanguages, editForm, selectedLanguages, setEditForm } = props;
  return (
    <div className="space-y-2">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Languages Spoken
            </label>
            <div className="flex flex-wrap gap-2">
              {/* Selected Solid Purple Chips */}
              {selectedLanguages.map((lang) => (
                <span
                  key={lang}
                  className="inline-flex items-center gap-1.5 px-3.5 min-h-9 rounded-full text-xs font-extrabold bg-[#7C3AED] text-white shadow-xs"
                >
                  {lang}
                  {selectedLanguages.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditForm({
                          ...editForm,
                          languages: selectedLanguages.filter(l => l !== lang)
                        });
                      }}
                      aria-label={`Remove ${lang}`} /* v330: icon-only button */
                      className="w-8 h-8 -my-1 -mr-2.5 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors" /* v353: 32px+ tap area */
                    >
                      <X size={12} />
                    </button>
                  )}
                </span>
              ))}

              {/* Available Unselected Options */}
              {/* v353: every language (was only the first 6 — Tamil, Telugu… could never be added) */}
              {availableLanguages.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => {
                    setEditForm({
                      ...editForm,
                      languages: [...selectedLanguages, lang]
                    });
                  }}
                  className="inline-flex items-center gap-1 px-3 min-h-9 rounded-full text-xs font-bold bg-[#F9F9FB] border border-[#E5E5EA] text-slate-600 hover:border-slate-300 active:scale-95 transition-all"
                >
                  <Plus size={12} /> {lang}
                </button>
              ))}
            </div>
          </div>
  );
}

// v419: the details brands search by on Eva / Explore — gender, date of birth (only an age range is shown), barter.
export function SearchDetailsField({ editForm, setEditForm }) {
  return (
    <div className="space-y-4" data-testid="brand-search-details">
      <div className="space-y-1.5">
        <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Gender</label>
        <div className="flex flex-wrap gap-2">
          {["Female", "Male", "Other"].map((g) => {
            const on = (editForm.gender || "").toLowerCase() === g.toLowerCase();
            return <button key={g} type="button" data-testid={`gender-${g.toLowerCase()}`} onClick={() => setEditForm((f) => ({ ...f, gender: g }))} className={`min-h-[40px] px-4 rounded-xl text-sm font-bold border ${on ? "bg-[#F3EBFF] border-[#7C3AED]/40 text-[#7C3AED]" : "bg-[#F9F9FB] border-[#E5E5EA] text-slate-700"}`}>{g}</button>;
          })}
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Date of birth</label>
        <input type="date" data-testid="dob-input" value={editForm.dob || ""} max={new Date(Date.now() - 13 * 365.25 * 864e5).toISOString().slice(0, 10)} onChange={(e) => setEditForm((f) => ({ ...f, dob: e.target.value }))} className="w-full h-[52px] rounded-2xl bg-[#F9F9FB] border border-[#E5E5EA] px-4 text-base font-semibold text-slate-900" />
        <p className="text-[11px] text-slate-500">Private — brands only see an age range, never your date.</p>
      </div>
      <div className="space-y-1.5">
        <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Barter (products instead of money)</label>
        <div className="flex flex-wrap gap-2">
          {[["Products Only", "Yes, barter OK"], ["Hybrid (Paid + Barter)", "Paid + barter"], ["Paid Campaigns Only", "Paid only"]].map(([v, l]) => {
            const on = editForm.barter === v;
            return <button key={v} type="button" onClick={() => setEditForm((f) => ({ ...f, barter: v }))} className={`min-h-[40px] px-4 rounded-xl text-sm font-bold border ${on ? "bg-[#F3EBFF] border-[#7C3AED]/40 text-[#7C3AED]" : "bg-[#F9F9FB] border-[#E5E5EA] text-slate-700"}`}>{l}</button>;
          })}
        </div>
      </div>
    </div>
  );
}
