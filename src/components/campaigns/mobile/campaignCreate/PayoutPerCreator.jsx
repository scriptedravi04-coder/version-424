import React from "react";


// Session 49 (clean-up): moved out of MobileCampaignCreate.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function PayoutPerCreator(props) {
  const { barterDescription, budget, budgetMax, budgetMin, collabMode, isBudgetRange, setBarterDescription, setBudget, setBudgetMax, setBudgetMin, setIsBudgetRange } = props;
  return <>{collabMode === "Paid" ? (
            <div className="p-3.5 rounded-[14px] bg-white border border-[#E5E5EA]">
              <div className="flex items-center justify-between">
                <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
                  Payout per creator
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11.5px] font-medium text-[#6B7280]">Range</span>
                  <button
                    type="button"
                    onClick={() => setIsBudgetRange((prev) => !prev)}
                    role="switch" aria-checked={Boolean(isBudgetRange)} aria-label="Payout range" /* v332: unlabeled toggle */
                    className={`w-[34px] h-[20px] rounded-[10px] p-[2px] transition-colors flex cursor-pointer ${
                      isBudgetRange ? "bg-[#7C3AED] justify-end" : "bg-[#D6D6DC] justify-start"
                    }`}
                  >
                    <div className="w-[16px] h-[16px] rounded-full bg-white shadow-xs" />
                  </button>
                </div>
              </div>

              {isBudgetRange ? (
                <div className="mt-3 flex items-center gap-2.5">
                  <div className="flex-1 h-[48px] rounded-[12px] bg-[#F9F9FB] border border-[#E5E5EA] flex items-center gap-1.5 px-3">
                    <span className="text-[14px] font-medium text-[#6B7280]">₹</span>
                    <input
                      type="number" inputMode="numeric" /* v415: number keypad */
                      min="1" /* v344 */
                      value={budgetMin}
                      onChange={(e) => setBudgetMin(e.target.value)}
                      placeholder="8,000"
                      className="w-full bg-transparent text-[16px] font-semibold text-[#0A0A0A] outline-none" /* v332: 16px stops iOS zoom */
                    />
                  </div>
                  <span className="text-[13px] font-medium text-[#6B7280]">to</span>
                  <div className="flex-1 h-[48px] rounded-[12px] bg-[#F9F9FB] border border-[#E5E5EA] flex items-center gap-1.5 px-3">
                    <span className="text-[14px] font-medium text-[#6B7280]">₹</span>
                    <input
                      type="number" inputMode="numeric" /* v415: number keypad */
                      min="1" /* v344 */
                      value={budgetMax}
                      onChange={(e) => setBudgetMax(e.target.value)}
                      placeholder="18,000"
                      className="w-full bg-transparent text-[16px] font-semibold text-[#0A0A0A] outline-none" /* v332: 16px stops iOS zoom */
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-3 h-[48px] rounded-[12px] bg-[#F9F9FB] border border-[#E5E5EA] flex items-center gap-1.5 px-3">
                  <span className="text-[14px] font-medium text-[#6B7280]">₹</span>
                  <input
                    type="number" inputMode="numeric" /* v415: number keypad */
                    min="1" /* v344 */
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="8,000"
                    className="w-full bg-transparent text-[16px] font-semibold text-[#0A0A0A] outline-none" /* v332: 16px stops iOS zoom */
                  />
                </div>
              )}

              {/* v344: say what's wrong right under the fields (Continue also blocks with a toast) */}
              {isBudgetRange && budgetMin !== "" && budgetMax !== "" && (Number(budgetMin) <= 0 || Number(budgetMax) <= 0 || Number(budgetMin) > Number(budgetMax)) && (
                <div className="mt-2 text-[11.5px] font-medium text-[#B91C1C]">
                  {Number(budgetMin) <= 0 || Number(budgetMax) <= 0 ? "Payout must be above ₹0." : "Min payout can't be more than max payout."}
                </div>
              )}
              {!isBudgetRange && budget !== "" && Number(budget) <= 0 && (
                <div className="mt-2 text-[11.5px] font-medium text-[#B91C1C]">Payout must be above ₹0.</div>
              )}
              <div className="mt-2.5 text-[11.5px] leading-[1.4] text-[#6B7280]">
                You fund the payment only when you hire.
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-[14px] bg-white border border-[#E5E5EA]">
              <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
                Barter product / service description
              </div>
              <textarea
                rows={2}
                value={barterDescription}
                onChange={(e) => setBarterDescription(e.target.value)}
                placeholder="Describe product worth, delivery timeframe, or gift box..."
                className="mt-2 w-full rounded-[12px] bg-[#F9F9FB] border border-[#E5E5EA] p-3 text-[16px] text-[#0A0A0A] outline-none focus:border-[#7C3AED]"
              />
            </div>
          )}</>;
}
