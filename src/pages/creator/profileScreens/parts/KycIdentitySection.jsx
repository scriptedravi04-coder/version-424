import React from "react";
import { safeUpper } from "../../../../utils/safeFormat";
import { Loader2, CheckCircle2, UploadCloud } from "lucide-react";


// Session 49 (clean-up): moved out of CreatorMobileProfile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function KycIdentitySection(props) {
  const { handleUploadPanPhoto, isSection1Collapsed, kycForm, panInputRef, setIsSection1Collapsed, setKycForm, uploadingPan } = props;
  return (
    <div className="bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl p-4 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[#7C3AED] text-white text-[10px] font-black flex items-center justify-center">1</span>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  Identity & Tax Information
                </h4>
              </div>
              {kycForm.panPhotoUrl && (
                <button
                  type="button"
                  onClick={() => setIsSection1Collapsed(!isSection1Collapsed)}
                  className="text-xs font-bold text-[#7C3AED] min-h-9 px-2 -mr-2" /* v332: 36px tap target */
                >
                  {isSection1Collapsed ? "Expand" : "Collapse"}
                </button>
              )}
            </div>

            {!isSection1Collapsed ? (
              <div className="space-y-4 pt-1">
                {/* Legal Name — v332: inputs are 16px so iPhone doesn't zoom in */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    Full Legal Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={kycForm.legalName}
                    onChange={(e) => setKycForm({ ...kycForm, legalName: e.target.value })}
                    placeholder="Must match your PAN card name"
                    className="w-full h-[48px] bg-white border border-[#E5E5EA] rounded-xl px-3.5 text-[16px] font-semibold text-slate-900 focus:outline-none focus:border-[#7C3AED]"
                  />
                </div>

                {/* PAN Number */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    PAN Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    value={kycForm.panNumber}
                    onChange={(e) => setKycForm({ ...kycForm, panNumber: safeUpper(e.target.value) })}
                    placeholder="ABCDE1234F"
                    className="w-full h-[48px] bg-white border border-[#E5E5EA] rounded-xl px-3.5 text-[16px] font-black text-slate-900 uppercase tracking-widest focus:outline-none focus:border-[#7C3AED]"
                  />
                  <span className="text-[10px] text-slate-500 font-medium">10 characters, auto-uppercase</span>
                </div>

                {/* PAN Card Photo Upload */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    PAN Card Photo <span className="text-rose-500">*</span>
                  </label>

                  {kycForm.panPhotoUrl ? (
                    <div className="relative rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 size={18} className="text-emerald-600" />
                        <div>
                          {/* v330: the two lines ran together ("…UploadedReady for review") */}
                          <span className="block text-[15px] font-semibold text-slate-900">PAN Document Uploaded</span>
                          <span className="block text-[10px] text-emerald-700 font-medium">Ready for review</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setKycForm({ ...kycForm, panPhotoUrl: "" })}
                        className="shrink-0 min-h-9 px-2 text-rose-500 hover:bg-rose-50 rounded-lg text-xs font-bold" /* v330: 36px tap target */
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div
                      role="button" /* v330: keyboard reachable; no second picker while uploading */
                      tabIndex={0}
                      aria-busy={uploadingPan}
                      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !uploadingPan) { e.preventDefault(); panInputRef.current?.click(); } }}
                      onClick={() => { if (!uploadingPan) panInputRef.current?.click(); }}
                      className="border-2 border-dashed border-slate-200 hover:border-[#7C3AED] rounded-2xl p-4 text-center cursor-pointer bg-white transition-all space-y-1"
                    >
                      {uploadingPan ? (
                        <div className="flex items-center justify-center gap-2 py-2">
                          <Loader2 size={16} className="animate-spin text-[#7C3AED]" />
                          <span className="text-xs font-bold text-slate-600">Uploading document...</span>
                        </div>
                      ) : (
                        <>
                          <UploadCloud size={22} className="mx-auto text-slate-500" />
                          <span className="text-xs font-bold text-[#7C3AED] block">Take a photo or choose a file</span>
                          <span className="text-[10px] text-slate-500 font-medium block">Text must be clearly readable</span>
                        </>
                      )}
                    </div>
                  )}
                  <input
                    ref={panInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={handleUploadPanPhoto}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 size={15} /> Section 1 complete · PAN uploaded
                </span>
              </div>
            )}
          </div>
  );
}
