import React from "react";
import { safeLower, safeUpper } from "../../../../utils/safeFormat";


// Session 49 (clean-up): moved out of CreatorMobileProfile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function KycPayoutSection(props) {
  const { handleUploadQrCode, kycForm, qrInputRef, setKycForm, uploadingQr } = props;
  return (
    <div className="bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl p-4 space-y-4 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#7C3AED] text-white text-[10px] font-black flex items-center justify-center">2</span>
              <div>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  Payout Method
                </h4>
                <span className="text-[10px] text-slate-500 font-medium block">
                  Where campaign earnings and brand payments land.
                </span>
              </div>
            </div>

            {/* Segmented Switch: UPI ID vs Bank Transfer */}
            <div className="grid grid-cols-2 p-1 bg-slate-200/60 rounded-xl">
              <button
                type="button"
                onClick={() => setKycForm({ ...kycForm, payoutMethod: "upi" })}
                className={`py-2.5 rounded-lg text-xs font-extrabold transition-all ${
                  kycForm.payoutMethod === "upi"
                    ? "bg-white text-[#7C3AED] shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                UPI ID
              </button>
              <button
                type="button"
                onClick={() => setKycForm({ ...kycForm, payoutMethod: "bank" })}
                className={`py-2.5 rounded-lg text-xs font-extrabold transition-all ${
                  kycForm.payoutMethod === "bank"
                    ? "bg-white text-[#7C3AED] shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Bank Transfer
              </button>
            </div>

            {/* UPI Form Fields — v332: inputs are 16px so iPhone doesn't zoom in */}
            {kycForm.payoutMethod === "upi" ? (
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    UPI VPA / ID <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={kycForm.upiId}
                    onChange={(e) => setKycForm({ ...kycForm, upiId: safeLower(e.target.value).trim() })}
                    placeholder="yourname@okhdfcbank"
                    className="w-full h-[48px] bg-white border border-[#E5E5EA] rounded-xl px-3.5 text-[16px] font-semibold text-slate-900 focus:outline-none focus:border-[#7C3AED]"
                  />
                  <span className="text-[10px] text-slate-500 font-medium">Google Pay, PhonePe, Paytm, BHIM or any UPI ID</span>
                </div>

                {/* Optional QR Code Upload */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    UPI QR Code (Optional)
                  </label>
                  {kycForm.upiQrUrl ? (
                    <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3">
                      <span className="text-xs font-bold text-slate-800">QR Code uploaded</span>
                      <button
                        type="button"
                        onClick={() => setKycForm({ ...kycForm, upiQrUrl: "" })}
                        className="text-xs text-rose-500 font-bold min-h-9 px-2 -mr-2" /* v332: 36px tap target */
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => qrInputRef.current?.click()}
                      disabled={uploadingQr} /* v330: no second upload while one is running */
                      className="w-full py-2.5 disabled:opacity-60 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:border-slate-300"
                    >
                      {uploadingQr ? "Uploading…" : "+ Upload QR screenshot"}
                    </button>
                  )}
                  <input
                    ref={qrInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleUploadQrCode}
                  />
                </div>
              </div>
            ) : (
              /* Bank Transfer Form Fields */
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    Bank Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={kycForm.bankName}
                    onChange={(e) => setKycForm({ ...kycForm, bankName: e.target.value })}
                    placeholder="HDFC Bank, SBI, ICICI..."
                    className="w-full h-[48px] bg-white border border-[#E5E5EA] rounded-xl px-3.5 text-[16px] font-semibold text-slate-900 focus:outline-none focus:border-[#7C3AED]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    Account Holder Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={kycForm.holderName}
                    onChange={(e) => setKycForm({ ...kycForm, holderName: e.target.value })}
                    placeholder="Must match the PAN name above"
                    className="w-full h-[48px] bg-white border border-[#E5E5EA] rounded-xl px-3.5 text-[16px] font-semibold text-slate-900 focus:outline-none focus:border-[#7C3AED]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    Account Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={kycForm.accountNumber}
                    onChange={(e) => setKycForm({ ...kycForm, accountNumber: e.target.value })}
                    placeholder="Enter account number"
                    className="w-full h-[48px] bg-white border border-[#E5E5EA] rounded-xl px-3.5 text-[16px] font-semibold text-slate-900 focus:outline-none focus:border-[#7C3AED]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    IFSC Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={11}
                    value={kycForm.ifscCode}
                    onChange={(e) => setKycForm({ ...kycForm, ifscCode: safeUpper(e.target.value) })}
                    placeholder="HDFC0001234"
                    className="w-full h-[48px] bg-white border border-[#E5E5EA] rounded-xl px-3.5 text-[16px] font-black text-slate-900 uppercase tracking-widest focus:outline-none focus:border-[#7C3AED]"
                  />
                  <span className="text-[10px] text-slate-500 font-medium">Auto-uppercase for IFSC code</span>
                </div>
              </div>
            )}
          </div>
  );
}
