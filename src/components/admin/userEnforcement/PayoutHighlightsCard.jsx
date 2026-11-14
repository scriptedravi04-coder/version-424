import React from "react";
import { Check, Copy, Eye, EyeOff, Wallet, ChevronRight } from "lucide-react";


// Session 49 (clean-up): moved out of UserEnforcementPanel.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function PayoutHighlightsCard(props) {
  const { copiedField, escrowTransactions, handleCopy, paymentDetails, paymentSummary, setActiveTab, setShowBankAcc, showBankAcc } = props;
  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
           <div className="flex flex-wrap items-center justify-between gap-2 mb-4">{/* v332: wraps on phones */}
              <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                <Wallet size={18} className="text-[#A855F7]" /> Linked Payment & Escrow Payouts
              </h3>
              <button 
                onClick={() => setActiveTab('payouts')}
                className="text-xs font-extrabold text-[#A855F7] hover:text-[#9333EA] hover:underline flex items-center gap-1 cursor-pointer"
              >
                View Payout Ledger ({escrowTransactions.length}) <ChevronRight size={14} />
              </button>
           </div>

           <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-100">
                 <div className="text-[11px] font-extrabold text-purple-700 uppercase tracking-wider">Total Volume / Earned</div>
                 <div className="text-2xl font-black text-gray-900 mt-1">₹{Number(paymentSummary.total_earned || 0).toLocaleString('en-IN')}</div>
                 <div className="text-[11px] font-semibold text-gray-500 mt-0.5">{paymentSummary.completed_deals_count || 0} completed orders</div>
              </div>
              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                 <div className="text-[11px] font-extrabold text-emerald-700 uppercase tracking-wider">Total Paid Out</div>
                 <div className="text-2xl font-black text-emerald-700 mt-1">₹{Number(paymentSummary.total_paid_out || 0).toLocaleString('en-IN')}</div>
                 <div className="text-[11px] font-semibold text-emerald-600 mt-0.5">Direct to Bank / UPI</div>
              </div>
              <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-100">
                 <div className="text-[11px] font-extrabold text-amber-700 uppercase tracking-wider">In Escrow / Pending</div>
                 <div className="text-2xl font-black text-amber-700 mt-1">₹{Number(paymentSummary.pending_payout || 0).toLocaleString('en-IN')}</div>
                 <div className="text-[11px] font-semibold text-amber-600 mt-0.5">Awaiting release</div>
              </div>
           </div>

           {paymentDetails?.upi_id || paymentDetails?.bank_account_no ? (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100">
               {paymentDetails.upi_id && (
                 <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200/80">
                   <div className="min-w-0">
                     <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">UPI ID</div>
                     <div className="font-mono text-sm font-bold text-gray-900 break-all">{paymentDetails.upi_id}</div>
                   </div>
                   <button 
                     onClick={() => handleCopy(paymentDetails.upi_id, 'UPI ID')} 
                     className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                     title="Copy UPI ID"
                     aria-label="Copy UPI ID" /* v332 */
                   >
                     {copiedField === 'UPI ID' ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                   </button>
                 </div>
               )}

               {paymentDetails.bank_account_no && (
                 <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200/80">
                   <div>
                     <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Bank Account ({paymentDetails.bank_ifsc || paymentDetails.ifsc_code || 'IFSC'}){/* v332 */}</div>
                     <div className="font-mono text-sm font-bold text-gray-900">
                       {showBankAcc ? paymentDetails.bank_account_no : `••••••••${String(paymentDetails.bank_account_no).slice(-4)}`}
                     </div>
                   </div>
                   <div className="flex items-center gap-1">
                     <button 
                       onClick={() => setShowBankAcc(!showBankAcc)} 
                       className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                       title={showBankAcc ? "Hide account number" : "Show account number"}
                       aria-label={showBankAcc ? "Hide account number" : "Show account number"} /* v332 */
                     >
                       {showBankAcc ? <EyeOff size={16} /> : <Eye size={16} />}
                     </button>
                     <button 
                       onClick={() => handleCopy(paymentDetails.bank_account_no, 'Bank Account')} 
                       className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                       title="Copy Account Number"
                       aria-label="Copy account number" /* v332 */
                     >
                       {copiedField === 'Bank Account' ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                     </button>
                   </div>
                 </div>
               )}
             </div>
           ) : (
             <div className="p-3 text-xs font-semibold text-gray-500 italic">No payout account linked yet.</div>
           )}
        </div>
  );
}
