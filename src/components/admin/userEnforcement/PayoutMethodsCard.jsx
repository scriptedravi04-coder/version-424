import React from "react";
import { Check, CheckCircle2, Clock, Copy, CreditCard, Building2, Eye, EyeOff } from "lucide-react";


// Session 49 (clean-up): moved out of UserEnforcementPanel.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function PayoutMethodsCard(props) {
  const { copiedField, handleCopy, isKycApproved, paymentDetails, setPreviewDoc, setShowBankAcc, showBankAcc, upiQrCodeUrl, user } = props;
  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">{/* v332: wraps on phones */}
            <h4 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
              <CreditCard size={18} className="text-[#A855F7]" /> Registered Payout Accounts
            </h4>
            {isKycApproved ? (
              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold flex items-center gap-1">
                <CheckCircle2 size={13} /> Verified for Direct Payouts
              </span>
            ) : (
              <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold flex items-center gap-1">
                <Clock size={13} /> Pending Verification
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* UPI Option */}
            <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200/80 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-black text-xs">
                      UPI
                    </div>
                    <span className="text-sm font-bold text-gray-900">Virtual Payment Address (VPA)</span>
                  </div>
                  {paymentDetails?.upi_id && (
                    <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded">Active</span>
                  )}
                </div>

                {paymentDetails?.upi_id ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200">
                      <span className="font-mono text-sm font-bold text-gray-900 select-all break-all min-w-0">{paymentDetails.upi_id}</span>
                      <button 
                        onClick={() => handleCopy(paymentDetails.upi_id, 'UPI ID')} 
                        aria-label="Copy UPI ID" /* v332 */
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                      >
                        {copiedField === 'UPI ID' ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 font-semibold italic p-3 bg-white rounded-xl border border-dashed border-gray-200">
                    No UPI address linked
                  </div>
                )}
              </div>

              {upiQrCodeUrl && (
                <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-600">Attached UPI QR Code</span>
                  <button 
                    onClick={() => setPreviewDoc({ title: 'UPI QR Code', url: upiQrCodeUrl })}
                    className="text-xs font-bold text-[#A855F7] hover:underline flex items-center gap-1"
                  >
                    <Eye size={13} /> View QR Image
                  </button>
                </div>
              )}
            </div>

            {/* Bank Account Option */}
            <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200/80 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs">
                      <Building2 size={16} />
                    </div>
                    <span className="text-sm font-bold text-gray-900">Direct Bank Account (NEFT / IMPS)</span>
                  </div>
                  {paymentDetails?.bank_account_no && (
                    <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded">Active</span>
                  )}
                </div>

                {paymentDetails?.bank_account_no ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200">
                      <div>
                        <div className="text-[10px] font-bold text-gray-500 uppercase">Account Number</div>
                        <div className="font-mono text-sm font-bold text-gray-900">
                          {showBankAcc ? paymentDetails.bank_account_no : `••••••••${String(paymentDetails.bank_account_no).slice(-4)}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => setShowBankAcc(!showBankAcc)} 
                          aria-label={showBankAcc ? "Hide account number" : "Show account number"} /* v332 */
                          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
                        >
                          {showBankAcc ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                        <button 
                          onClick={() => handleCopy(paymentDetails.bank_account_no, 'Bank Account Number')} 
                          aria-label="Copy account number" /* v332 */
                          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
                        >
                          {copiedField === 'Bank Account Number' ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 bg-white rounded-xl border border-gray-200">
                        <div className="text-[10px] font-bold text-gray-500 uppercase">IFSC Code</div>
                        <div className="font-mono font-bold text-gray-900">{paymentDetails.bank_ifsc || paymentDetails.ifsc_code || '—'}{/* v332 */}</div>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-gray-200">
                        <div className="text-[10px] font-bold text-gray-500 uppercase">Beneficiary Name</div>
                        <div className="font-bold text-gray-900 truncate">{paymentDetails.bank_holder_name || user.name || '—'}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 font-semibold italic p-3 bg-white rounded-xl border border-dashed border-gray-200">
                    No bank account linked
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
  );
}
