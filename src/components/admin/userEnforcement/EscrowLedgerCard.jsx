import React from "react";
import { formatAmount } from "../../../utils/safeFormat";
import { Activity, CheckCircle2, Clock } from "lucide-react";


// Session 49 (clean-up): moved out of UserEnforcementPanel.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function EscrowLedgerCard(props) {
  const { escrowTransactions } = props;
  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">{/* v332: wraps on phones */}
            <h4 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
              <Activity size={18} className="text-[#A855F7]" /> Escrow Transactions & Payout History
            </h4>
            <span className="text-xs font-bold text-gray-500">{escrowTransactions.length} recorded transaction{escrowTransactions.length === 1 ? '' : 's'}</span>{/* v332: "1 transactions" */}
          </div>

          {escrowTransactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs border-collapse">{/* v332: scrolls on phones instead of squashing */}
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 uppercase tracking-wider font-extrabold text-[10px]">
                    <th className="pb-3 px-3">Transaction / Order</th>
                    <th className="pb-3 px-3">Gross Amount</th>
                    <th className="pb-3 px-3">Platform Fee</th>
                    <th className="pb-3 px-3">Net Payout</th>
                    <th className="pb-3 px-3">Payout Status</th>
                    <th className="pb-3 px-3">UTR / Reference</th>
                    <th className="pb-3 px-3 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {escrowTransactions.map((tx) => {
                    const isPaid = tx.payout_status === 'PAID';
                    const isPending = tx.payout_status === 'PENDING' || tx.payout_status === 'PROCESSING';

                    return (
                      <tr key={tx.id || Math.random()} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-3 px-3 font-semibold text-gray-900">
                          <div>{tx.ugc_order_id ? `UGC Order #${String(tx.ugc_order_id).slice(0, 8)}` : (tx.deal_id ? `Deal #${String(tx.deal_id).slice(0, 8)}` : (tx.id ? `Tx #${String(tx.id).slice(0, 8)}` : 'Transaction'))}{/* v332: no crash on numeric ids, no "Tx #undefined" */}</div>
                          {tx.zaakpay_order_id && <div className="text-[10px] text-gray-500 font-mono">{tx.zaakpay_order_id}</div>}
                        </td>
                        <td className="py-3 px-3 font-bold text-gray-700">₹{formatAmount(tx.gross_amount)}</td>
                        <td className="py-3 px-3 text-gray-500 font-medium">₹{formatAmount(tx.platform_fee_amount)}</td>
                        <td className="py-3 px-3 font-extrabold text-emerald-700">₹{formatAmount(tx.creator_net_amount)}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider inline-flex items-center gap-1 ${
                            isPaid ? 'bg-emerald-100 text-emerald-800' :
                            isPending ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {isPaid ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                            {String(tx.payout_status || 'PENDING').replace(/_/g, ' ')}{/* v332 */}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-gray-600">
                          {tx.payout_reference ? (
                            <span className="font-bold text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">{tx.payout_reference}</span>
                          ) : '—'}
                        </td>
                        <td className="py-3 px-3 text-right text-gray-500 font-medium">
                          {tx.created_at ? new Date(tx.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) /* v330 */ : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500 text-sm font-semibold italic bg-gray-50 rounded-2xl">
              No escrow transactions or payout requests recorded for this account.
            </div>
          )}
        </div>
  );
}
