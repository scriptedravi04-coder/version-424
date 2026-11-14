import React from "react";


// Session 49 (clean-up): moved out of ChatBox.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function ChatBoxPresetChips(props) {
  const { currentThread, getDealAmount, isBrand, setOfferAmount } = props;
  return (
    <div className="flex flex-wrap gap-2 mb-6">
                      {(() => {
                        // v332: no deal amount yet → no chips (they were built from a made-up ₹5,000)
                        const basePrice = Number(getDealAmount(currentThread)) || 0;
                        if (!basePrice) return [];
                        if (!isBrand) {
                          // Creator side: Suggest higher offers
                          if (basePrice <= 1000) {
                            return [basePrice, basePrice + 100, basePrice + 200, basePrice + 300, basePrice + 500];
                          } else if (basePrice <= 5000) {
                            const step = basePrice >= 15000 ? 1000 : 500;
                            return [basePrice, basePrice + step, basePrice + step * 2, basePrice + step * 3, basePrice + step * 4];
                          } else {
                            const step = Math.round((basePrice * 0.2) / 1000) * 1000 || 1000;
                            return [basePrice, basePrice + step, basePrice + step * 2, basePrice + step * 3, basePrice + step * 4];
                          }
                        } else {
                          // Brand side: Suggest lower offers
                          if (basePrice <= 1000) {
                            return [basePrice, Math.max(100, basePrice - 100), Math.max(100, basePrice - 200), Math.max(100, basePrice - 300), Math.max(100, basePrice - 400)];
                          } else if (basePrice <= 5000) {
                            const step = basePrice >= 15000 ? 1000 : 500;
                            return [basePrice, Math.max(100, basePrice - step), Math.max(100, basePrice - step * 2), Math.max(100, basePrice - step * 3), Math.max(100, basePrice - step * 4)];
                          } else {
                            const step = Math.round((basePrice * 0.2) / 1000) * 1000 || 1000;
                            return [basePrice, Math.max(100, basePrice - step), Math.max(100, basePrice - step * 2), Math.max(100, basePrice - step * 3), Math.max(100, basePrice - step * 4)];
                          }
                        }
                      })().map(amt => (
                        <button 
                          type="button"
                          key={amt} 
                          onClick={() => setOfferAmount(amt)}
                          className="px-4 py-2 rounded-full border border-[var(--border-default)] bg-[var(--bg-card)] text-sm font-bold text-[var(--text-secondary)] hover:border-blue-500 hover:text-blue-500 transition-colors shadow-sm"
                        >
                          ₹ {amt.toLocaleString('en-IN')}
                        </button>
                      ))}
                    </div>
  );
}
