import React from "react";
import { toast } from "sonner";


// Session 49 (clean-up): moved out of CreatorMobileProfile.jsx word for word — the "rates" screen.
// Everything it needs comes in as props from CreatorMobileProfile; no logic or server call changed.
export default function RatesScreen(props) {
  const { rateCard, renderBackHeader, saveProfileChanges, setMobileScreen, setRateCard, profileState = "ready" } = props;
  // Session 58 (Ravi: "save pe click karta hu toh saving ka animation tak nahi"): the button shows it is saving.
  const [saving, setSaving] = React.useState(false);
  // v344: edit a local copy. Typing used to change the real rate card straight away, so backing out without
  // Save still saved those numbers later (with the next profile save). Now only "Save rate cards" keeps them.
  const [draft, setDraftRaw] = React.useState(() => ({ ...(rateCard || {}) }));
  // v426: opened straight from a link (/creator/settings?section=rates), this screen was built before the
  // profile arrived, so the draft stayed empty and Save wrote ₹0 over every saved rate. Now: until the person
  // types, the draft follows the loaded rate card; Save waits for the profile; and only the edited rates change.
  const touched = React.useRef(new Set());
  const setDraft = (next) => {
    Object.keys(next || {}).forEach((k) => { if (next[k] !== draft?.[k]) touched.current.add(k); });
    setDraftRaw(next);
  };
  React.useEffect(() => {
    setDraftRaw((d) => {
      const merged = { ...(rateCard || {}) };
      touched.current.forEach((k) => { merged[k] = d?.[k]; });
      return merged;
    });
  }, [rateCard]);
  const profileReady = profileState === "ready";
  // v346: rates are whole rupees from 0 to 10,00,000 (0 = "not offered"). Negative, decimal or huge values
  // show an inline error and block Save.
  const RATE_MAX = 1000000;
  const rateError = (v) => {
    if (v === undefined || v === null || v === "") return "";
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return "Enter an amount of ₹0 or more.";
    if (!Number.isInteger(n)) return "Use whole rupees, no paise.";
    if (n > RATE_MAX) return "Maximum is ₹10,00,000.";
    return "";
  };
  const rateIds = ["reels", "youtube_integration", "stories", "ugc"];
  const hasRateError = rateIds.some((id) => rateError(draft?.[id]));

    return (
      <div className="min-h-screen bg-white flex flex-col">
        {renderBackHeader("Rate cards")}

        <div className="flex-1 p-5 space-y-6">
          <p className="text-xs text-slate-600 font-medium leading-relaxed">
            Set default collaboration pricing. Brands can book these deliverables directly or make custom offers.
          </p>

          <div className="space-y-4">
            {[
              // Session 58: ids = the keys the profile actually loads and saves (story / YouTube / UGC used
              // other names before, so what was typed there was never saved and the saved rate never showed).
              { id: "reels", label: "Instagram Reel", hint: "Standard 30-60s vertical video" },
              { id: "youtube_integration", label: "YouTube Dedicated Video", hint: "Complete video integration" },
              { id: "stories", label: "Instagram Story (with link)", hint: "24-hour story with swipe-up / sticker" },
              { id: "ugc", label: "UGC Raw Video", hint: "Brand-usable ad creative" }
            ].map((deliv) => (
              <div key={deliv.id} className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                  {deliv.label}
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">₹</span>
                  <input
                    type="number"
                    value={draft?.[deliv.id] || ""}
                    onChange={(e) => setDraft({ ...draft, [deliv.id]: Number(e.target.value) || 0 })}
                    placeholder="0 = not offered"
                    inputMode="numeric"
                    min={0}
                    max={RATE_MAX}
                    step={1}
                    aria-invalid={Boolean(rateError(draft?.[deliv.id]))}
                    className={`w-full h-[52px] bg-[#F9F9FB] border ${rateError(draft?.[deliv.id]) ? "border-red-400" : "border-[#E5E5EA]"} rounded-2xl pl-8 pr-4 text-[16px] font-bold text-slate-900 focus:outline-none focus:border-[#7C3AED]`} /* v332: 16px so iPhone doesn't zoom; number keypad */
                  />
                </div>
                {rateError(draft?.[deliv.id]) && (
                  <p className="text-[11px] font-semibold text-red-600" role="alert">{rateError(draft?.[deliv.id])}</p>
                )}
                <span className="text-[10px] text-slate-500 font-medium">{deliv.hint}</span>
                {/* Session 40: quick picks — plain amounts, not a suggestion of what you should charge */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[2000, 5000, 10000, 25000, 50000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setDraft({ ...draft, [deliv.id]: amt })}
                      className={`px-3 min-h-9 rounded-full text-[12px] font-bold border transition-colors ${
                        Number(draft?.[deliv.id]) === amt
                          ? "bg-[#7C3AED] border-[#7C3AED] text-white"
                          : "bg-white border-[#E5E5EA] text-slate-600"
                      }`}
                    >
                      ₹{amt.toLocaleString("en-IN")}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pinned Save Bar */}
        <div className="sticky bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E5E5EA] px-4 pt-4 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">{/* v332: iPhone home-bar space */}
          <button
            type="button"
            disabled={saving || hasRateError || !profileReady}
            aria-busy={saving}
            data-testid="save-rate-cards"
            onClick={async () => {
              if (saving || hasRateError || !profileReady) return; // v346: never save a negative / huge rate
              setSaving(true);
              const toSave = { ...(rateCard || {}) };
              touched.current.forEach((k) => { toSave[k] = draft?.[k]; }); // v426: untouched rates keep their saved value
              let ok = true;
              try {
                if (saveProfileChanges && (await saveProfileChanges({ rateCard: toSave }, { silent: true })) === false) ok = false; // Session 53
              } finally {
                setSaving(false);
              }
              if (!ok) return;
              setRateCard(toSave); // v344: only now does the edited copy become the real rate card
              toast.success("Rate card saved");
              setMobileScreen(null);
            }}
            className="w-full h-[52px] bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-60 text-white text-sm font-extrabold rounded-2xl shadow-lg cursor-pointer inline-flex items-center justify-center gap-2"
          >
            {saving && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden="true" />}
            {saving ? "Saving…" : !profileReady ? (profileState === "failed" ? "Couldn't load your rates" : "Loading your rates…") : "Save rate cards"}
          </button>
        </div>
      </div>
    );
  
}
