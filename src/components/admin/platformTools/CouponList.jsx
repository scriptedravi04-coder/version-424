import React from "react";
import { Trash2 } from "lucide-react";


// Session 49 (clean-up): moved out of PlatformTools.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
// v332: "creators" / "brands" (was "{applies_to}s"), "1 payout" and Indian ₹ grouping
const audience = (a) => (a === 'brand' ? 'Brands' : a === 'creator' ? 'Creators' : a === 'brand_fee' ? 'Brand fee · all brands' /* v364 */ : a ? `${a}s` : 'Everyone');
const payouts = (n) => { const v = Number(n) || 1; return `First ${v} payout${v === 1 ? '' : 's'}`; };
const inr = (n) => (Number(n) || 0).toLocaleString('en-IN');

export default function CouponList(props) {
  const { coupons, handleEditCoupon, handleToggleCouponStatus, handleViewRedemptions, loadingCoupons, setDeleteConfirmCoupon } = props;
  return <>{loadingCoupons ? (
            <div className="py-12 text-center text-xs text-[var(--text-tertiary)]">Loading promotional coupons...</div>
          ) : coupons.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--text-tertiary)] border border-dashed border-[var(--border-default)] rounded-2xl bg-[var(--bg-card)]">
              No active coupons found. Click "Create New Coupon" above to issue one.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {coupons.map((c, idx) => (
                <div key={`coupon-${c.id || c.code || idx}`} className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-5 shadow-sm space-y-4 relative overflow-hidden">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-base font-mono font-black break-all text-[var(--text-primary)] tracking-wider block">
                        {c.code}
                      </span>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                          c.type === 'zero_fee' 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                            : c.type === 'fee_rate_override'
                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        }`}>
                          {String(c.applies_to || '').toLowerCase() === 'brand_fee' /* v364: brand-fee coupons */
                            ? (c.type === 'zero_fee' ? 'Brand fee 0%' : c.type === 'fee_rate_override' ? `Brand fee → ${c.override_fee_rate}%` : `₹${inr(c.discount_amount)} off brand fee`)
                            : c.type === 'zero_fee' 
                            ? 'Zero Platform Fee' 
                            : c.type === 'fee_rate_override'
                            ? `${c.override_fee_rate}% Fee Rate Waiver`
                            : `Flat ₹${inr(c.discount_amount)} Off`}
                        </span>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-foreground/10 text-[var(--text-secondary)]">
                          {audience(c.applies_to)}
                        </span>
                      </div>
                    </div>
                    
                    <span className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-full border ${
                      c.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}>
                      {c.status}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-[var(--text-secondary)] bg-[var(--bg-elevated)] p-3 rounded-xl border border-[var(--border-default)] font-mono">
                    <div className="flex justify-between">
                      <span>Redemptions:</span>
                      <span className="font-bold text-[var(--text-primary)]">{c.used_count || 0} / {c.usage_limit || '∞'} used</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Per User Limit:</span>
                      <span className="font-bold text-[var(--text-primary)]">{Number(c.per_user_limit) > 0 ? c.per_user_limit : 'No limit'}{/* v366 */}</span>
                    </div>
                    {c.type === 'fee_rate_override' && (
                      <>
                        <div className="flex justify-between">
                          <span>Override Fee Rate:</span>
                          <span className="font-bold text-purple-400">{c.override_fee_rate}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Payout Limit:</span>
                          <span className="font-bold text-[var(--text-primary)]">{payouts(c.applies_to_first_n_payouts)}</span>
                        </div>
                      </>
                    )}
                    {c.type === 'zero_fee' && (
                      <div className="flex justify-between">
                        <span>Payout Limit:</span>
                        <span className="font-bold text-[var(--text-primary)]">{payouts(c.applies_to_first_n_payouts)}</span>
                      </div>
                    )}
                    {c.type === 'flat_discount' && Number(c.min_campaign_value) > 0 && ( /* v332: a 0 used to render a stray "0" */
                      <div className="flex justify-between">
                        <span>Min Campaign:</span>
                        <span className="font-bold text-[var(--text-primary)]">₹{inr(c.min_campaign_value)}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[var(--border-default)]">
                    <button 
                      onClick={() => handleViewRedemptions(c)}
                      className="text-xs font-bold text-[#9D7CFF] hover:underline"
                    >
                      Audit Trail
                    </button>
                    
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleEditCoupon(c)}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold border bg-blue-500/10 text-blue-400 border-blue-500/30"
                      >
                        Edit
                      </button>

                      <button 
                        onClick={() => handleToggleCouponStatus(c)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                          c.status === 'active' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        }`}
                      >
                        {c.status === 'active' ? 'Pause' : 'Activate'}
                      </button>
                      
                      <button 
                        onClick={() => setDeleteConfirmCoupon(c)}
                        title="Delete Coupon"
                        aria-label={`Delete coupon ${c.code || ''}`} /* v332 */
                        className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}</>;
}
