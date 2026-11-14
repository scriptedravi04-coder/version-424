import React from "react";
import { formatAmount } from "../../../utils/safeFormat";
import { DollarSign, Save } from "lucide-react";


// Session 49 (clean-up): moved out of PlatformTools.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function FeesSettingsCard(props) {
  const { feeConfig, setFeeConfig, setShowFeeModal } = props;
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="font-display text-lg font-bold flex items-center gap-2">
                  <DollarSign size={18} className="text-emerald-400"/> Platform Fee Model & GST Setup
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {feeConfig.fee_model === "split"
                    ? "Split fee: the creator's % is taken from the payout, the brand's % is added on top of the brand's bill (campaigns + UGC)."
                    : "Old tiered fee: brands pay ₹0 platform fee; the fee is taken from the creator's payout by deal size."}
                </p>
              </div>
              <button 
                onClick={() => setShowFeeModal(true)}
                className="px-5 py-2.5 bg-[#9D7CFF] hover:bg-[#8B6BE0] text-white font-bold rounded-xl text-xs flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
              >
                <Save size={14} /> Review & Apply Changes
              </button>
            </div>

            {/* v364 (Ravi: "Creator fee % aur Brand fee % alag alag boxes — Diwali ke baad Admin se badal sakun") */}
            {(() => {
              const split = feeConfig.fee_model === "split";
              const c = Math.max(0, Math.min(30, Number(feeConfig.creator_fee_pct) || 0));
              const b = Math.max(0, Math.min(30, Number(feeConfig.brand_fee_pct) || 0));
              const deal = 10000, creatorFee = Math.round(deal * c / 100), brandFee = Math.round(deal * b / 100);
              const inr = (n) => `₹${Number(n).toLocaleString("en-IN")}`;
              return (
                <div className="mb-8 p-5 rounded-xl border-2 border-[#9D7CFF]/40 bg-[#F7F3FF]" data-testid="split-fee-box">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="text-sm font-black text-[var(--text-primary)]">Fee model</div>
                    <div className="inline-flex rounded-xl border border-[var(--border-default)] bg-white p-1">
                      {[["split", "Split: creator % + brand %"], ["legacy", "Old tiered fee"]].map(([v, l]) => (
                        <button key={v} type="button" onClick={() => setFeeConfig({ ...feeConfig, fee_model: v })}
                          className={`px-3 h-9 rounded-lg text-xs font-bold ${feeConfig.fee_model === v ? "bg-[#7C3AED] text-white" : "text-[var(--text-secondary)]"}`}>{l}</button>
                      ))}
                    </div>
                  </div>
                  {split && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] block mb-1">Creator fee (%)</label>
                          <input type="number" min="0" max="30" step="0.5" value={feeConfig.creator_fee_pct}
                            onChange={(e) => setFeeConfig({ ...feeConfig, creator_fee_pct: e.target.value === "" ? "" : Number(e.target.value) })}
                            className="w-full bg-white border border-[var(--border-default)] rounded-xl px-3 py-2.5 text-[16px] sm:text-sm font-mono font-bold focus:outline-none focus:border-[#9D7CFF]" data-testid="creator-fee-pct" />
                          <span className="text-[10px] text-[var(--text-tertiary)] mt-1 block">Taken from the creator's payout. 0 = "0% platform fee".</span>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] block mb-1">Brand fee (%)</label>
                          <input type="number" min="0" max="30" step="0.5" value={feeConfig.brand_fee_pct}
                            onChange={(e) => setFeeConfig({ ...feeConfig, brand_fee_pct: e.target.value === "" ? "" : Number(e.target.value) })}
                            className="w-full bg-white border border-[var(--border-default)] rounded-xl px-3 py-2.5 text-[16px] sm:text-sm font-mono font-bold focus:outline-none focus:border-[#9D7CFF]" data-testid="brand-fee-pct" />
                          <span className="text-[10px] text-[var(--text-tertiary)] mt-1 block">Added on top of the brand's bill (campaigns + UGC). Brand coupons can lower it.</span>
                        </div>
                      </div>
                      <div className="mt-4 text-[13px] font-semibold text-[#5B21B6]" data-testid="split-fee-example">
                        Deal {inr(deal)} → brand pays {inr(deal + brandFee)} · creator gets {inr(deal - creatorFee)} · Ybex {inr(brandFee + creatorFee)}
                        {feeConfig.platform_gst_registered ? " (+ GST on the fees)" : ""}
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">Deals already paid keep the fee they were paid with. The tiered rates below are used only in "Old tiered fee".</div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* v332: number fields are 16px on phones (no iOS zoom) */}
            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8 ${feeConfig.fee_model === "split" ? "opacity-50" : ""}`}>
              <div>
                <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] block mb-1">Threshold Amount (₹)</label>
                <input 
                  type="number" 
                  value={feeConfig.threshold_amount}
                  onChange={(e) => setFeeConfig({...feeConfig, threshold_amount: e.target.value === "" ? "" : Number(e.target.value)}) /* v396 (QA M-5): empty stays empty → server refuses */}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-3 py-2.5 text-[16px] sm:text-sm font-mono font-bold focus:outline-none focus:border-[#9D7CFF]"
                />
                <span className="text-[10px] text-[var(--text-tertiary)] mt-1 block">Deal size where the rate changes</span>{/* v332: hints had made-up "₹50,000 / 10% / 8%" that did not match the real settings */}
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] block mb-1">Below Threshold Rate (%)</label>
                <input 
                  type="number" step="0.1"
                  value={feeConfig.below_threshold_rate}
                  onChange={(e) => setFeeConfig({...feeConfig, below_threshold_rate: e.target.value === "" ? "" : Number(e.target.value)}) /* v396 (QA M-5): empty stays empty → server refuses */}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-3 py-2.5 text-[16px] sm:text-sm font-mono font-bold focus:outline-none focus:border-[#9D7CFF]"
                />
                <span className="text-[10px] text-[var(--text-tertiary)] mt-1 block">Deals ≤ ₹{formatAmount(feeConfig.threshold_amount)}</span>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] block mb-1">Above Threshold Rate (%)</label>
                <input 
                  type="number" step="0.1"
                  value={feeConfig.above_threshold_rate}
                  onChange={(e) => setFeeConfig({...feeConfig, above_threshold_rate: e.target.value === "" ? "" : Number(e.target.value)}) /* v396 (QA M-5): empty stays empty → server refuses */}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-3 py-2.5 text-[16px] sm:text-sm font-mono font-bold focus:outline-none focus:border-[#9D7CFF]"
                />
                <span className="text-[10px] text-[var(--text-tertiary)] mt-1 block">Deals &gt; ₹{formatAmount(feeConfig.threshold_amount)}</span>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] block mb-1">GST Rate on Fee (%)</label>
                <input 
                  type="number" step="0.1"
                  value={feeConfig.gst_rate}
                  onChange={(e) => setFeeConfig({...feeConfig, gst_rate: e.target.value === "" ? "" : Number(e.target.value)}) /* v396 (QA M-5): empty stays empty → server refuses */}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-3 py-2.5 text-[16px] sm:text-sm font-mono font-bold focus:outline-none focus:border-[#9D7CFF]"
                />
                <span className="text-[10px] text-[var(--text-tertiary)] mt-1 block">GST charged on the platform fee</span>
              </div>
            </div>

            {/* GST Details & UGC Commission */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 p-5 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] mb-8">
              <div className="flex items-center justify-between md:block">
                <div>
                  <label className="text-xs font-bold text-[var(--text-primary)] block">GST Registered Entity</label>
                  <p className="text-[10px] text-[var(--text-secondary)]">Show GST invoices on creator payouts</p>
                </div>
                <button 
                  type="button"
                  onClick={() => setFeeConfig({...feeConfig, platform_gst_registered: !feeConfig.platform_gst_registered})}
                  className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    feeConfig.platform_gst_registered ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-secondary)]'
                  }`}
                >
                  {feeConfig.platform_gst_registered ? 'Registered (Active)' : 'Not Registered'}
                </button>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] block mb-1">Platform GSTIN Number</label>
                <input 
                  type="text" 
                  placeholder="27AAAAA0000A1Z5"
                  value={feeConfig.platform_gstin}
                  onChange={(e) => setFeeConfig({...feeConfig, platform_gstin: e.target.value})}
                  className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl px-3 py-2 text-[16px] sm:text-xs font-mono focus:outline-none focus:border-[#9D7CFF]"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] block mb-1">UGC Order Commission Rate (%)</label>
                <input 
                  type="number" step="0.1"
                  value={feeConfig.ugc_commission_pct}
                  onChange={(e) => setFeeConfig({...feeConfig, ugc_commission_pct: e.target.value === "" ? "" : Number(e.target.value)}) /* v396 (QA M-5): empty stays empty → server refuses */}
                  className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl px-3 py-2 text-[16px] sm:text-xs font-mono font-bold focus:outline-none focus:border-[#9D7CFF]"
                />
              </div>
            </div>

            {/* Session 58 (Ravi, Q11): Risk controls are wired up on the server now —
                freeze blocks creator payout requests and admin releases, min withdrawal is checked on
                "Request payout", campaign budget limits are checked when a campaign is sent for review. */}
            <div className="pt-6 border-t border-[var(--border-default)] space-y-4">
              <h4 className="text-sm font-bold text-[var(--text-primary)]">Risk controls</h4>
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)]">
                <div>
                  <p className="text-xs font-bold text-[var(--text-primary)]">Freeze all payouts (emergency)</p>
                  <p className="text-[10px] text-[var(--text-secondary)]">While on, creators can't request payouts and admins can't release them.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFeeConfig({ ...feeConfig, payout_freeze_all: !feeConfig.payout_freeze_all })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${feeConfig.payout_freeze_all ? 'bg-red-500/15 text-red-500 border border-red-500/30' : 'bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-secondary)]'}`}
                >
                  {feeConfig.payout_freeze_all ? 'Frozen' : 'Normal'}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  ['min_withdrawal_amount', 'Minimum withdrawal (₹)'],
                  ['min_campaign_budget', 'Min campaign budget (₹)'],
                  ['max_campaign_budget', 'Max campaign budget (₹)'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] block mb-1">{label}</label>
                    <input
                      type="number" min="0"
                      value={feeConfig[key] ?? ''}
                      onChange={(e) => setFeeConfig({ ...feeConfig, [key]: e.target.value === "" ? "" : Number(e.target.value) }) /* v396 */}
                      className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl px-3 py-2 text-[16px] sm:text-xs font-mono font-bold focus:outline-none focus:border-[#9D7CFF]"
                    />
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[var(--text-tertiary)]">Barter campaigns (₹0 budget) are not limited. Changes apply after you save.</p>
            </div>
          </div>
  );
}
