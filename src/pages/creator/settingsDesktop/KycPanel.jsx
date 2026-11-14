import React from "react";
import { Link } from "react-router-dom";
import { Shield, Edit3, Loader2, ShieldAlert, FileText, QrCode } from "lucide-react";


// Session 49 (clean-up): moved out of CreatorSettings.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function KycPanel(props) {
  const { kycLoading, kycObj, kycFailed, onRetry } = props;
  return <>{kycLoading ? (
                  <div className="flex justify-center items-center py-10">
                    <Loader2 size={24} className="animate-spin text-slate-500" />
                  </div>
                ) : (!kycObj && kycFailed) ? (
                  // v332: a failed load no longer says "Identity Verification Required"
                  <div className="text-center py-10 bg-slate-50 border border-dashed border-slate-200 rounded-3xl p-6">
                    <h4 className="font-extrabold text-slate-700 text-sm">Couldn't load your KYC status</h4>
                    <p className="text-[11px] text-slate-500 font-medium max-w-sm mx-auto mt-1 leading-relaxed">If you already submitted, there's no need to submit again.</p>
                    {onRetry && <button type="button" onClick={onRetry} className="mt-4 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl">Try again</button>}
                  </div>
                ) : (!kycObj || kycObj.status === "NOT_SUBMITTED") ? (
                  <div className="text-center py-10 bg-slate-50 border border-dashed border-slate-200 rounded-3xl p-6">
                    <ShieldAlert className="mx-auto text-slate-500 mb-3" size={32} />
                    <h4 className="font-extrabold text-slate-700 text-sm">Identity Verification Required</h4>
                    <p className="text-[11px] text-slate-500 font-medium max-w-sm mx-auto mt-1 leading-relaxed">
                      {/* v332: plain words; in-app link (the plain <a> reloaded the whole app) */}
                      Add your PAN and payout details once so brands can pay you.
                    </p>
                    <Link 
                      to="/creator/kyc" 
                      className="inline-block mt-4 px-5 py-2.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white text-xs font-bold rounded-xl transition-all shadow-md hover:scale-[1.02] cursor-pointer"
                    >
                      Complete KYC
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Status Card Banner */}
                    <div className={`border rounded-2xl p-6 ${
                      kycObj.status === 'APPROVED' || kycObj.status === 'approved'
                        ? 'bg-emerald-50/50 border-emerald-100'
                        : kycObj.status === 'PENDING' || kycObj.status === 'pending' || kycObj.status === 'UNDER_REVIEW' || kycObj.status === 'under_review'
                        ? 'bg-amber-50/50 border-amber-100'
                        : 'bg-rose-50/50 border-rose-100'
                    }`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-xl mt-0.5 ${
                            kycObj.status === 'APPROVED' || kycObj.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-700'
                              : kycObj.status === 'PENDING' || kycObj.status === 'pending' || kycObj.status === 'UNDER_REVIEW' || kycObj.status === 'under_review'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-rose-100 text-rose-700'
                          }`}>
                            <Shield size={20} />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Identity Compliance Status</span>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase inline-block mt-1 ${
                              kycObj.status === 'APPROVED' || kycObj.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-700'
                                : kycObj.status === 'PENDING' || kycObj.status === 'pending' || kycObj.status === 'UNDER_REVIEW' || kycObj.status === 'under_review'
                                ? 'bg-amber-100 text-[#D97706]'
                                : 'bg-rose-100 text-rose-700'
                            }`}>
                              {kycObj.status === 'PENDING' || kycObj.status === 'pending' || kycObj.status === 'UNDER_REVIEW' || kycObj.status === 'under_review' ? 'UNDER REVIEW' : ({ APPROVED: 'Approved', REJECTED: 'Rejected', MORE_INFO_NEEDED: 'More info needed' }[String(kycObj.status || '').toUpperCase()] || String(kycObj.status || '').replace(/_/g, ' '))}{/* v330: no raw enum like MORE_INFO_NEEDED */}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Status Messages */}
                      {(kycObj.status === 'PENDING' || kycObj.status === 'pending' || kycObj.status === 'UNDER_REVIEW' || kycObj.status === 'under_review') && (
                        <p className="text-xs text-amber-700 font-medium mt-4 bg-amber-50 border border-amber-100/50 rounded-xl p-3 leading-relaxed">
                          We're checking your details. Payouts are enabled as soon as the review finishes (usually within 24 hours).{/* v332: matched the KYC page ("less than 2 hours" here vs "24 hours" there) */}
                        </p>
                      )}

                      {(kycObj.status === 'APPROVED' || kycObj.status === 'approved') && (
                        <p className="text-xs text-emerald-700 font-medium mt-4 bg-emerald-50 border border-emerald-100/50 rounded-xl p-3 leading-relaxed flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <span>✓ Your identity compliance verification is approved. You can edit or update your Bank account details and UPI ID anytime.</span>
                          <Link to="/creator/kyc" className="shrink-0 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 transition-all shadow-sm">
                            <Edit3 size={13} /> Edit Details
                          </Link>
                        </p>
                      )}

                      {(kycObj.status === 'REJECTED' || kycObj.status === 'rejected' || kycObj.status === 'MORE_INFO_NEEDED') && (
                        <div className="mt-4 bg-rose-50 border border-rose-100 rounded-xl p-4 space-y-1">
                          <h5 className="text-xs font-extrabold text-rose-800">Rejection Reason / Admin Note:</h5>
                          <p className="text-[11px] text-rose-700 font-medium leading-relaxed">
                            {kycObj.rejection_reason || kycObj.admin_note || "Your documentation was incomplete or invalid. Please click the button to update your credentials and resubmit for verification."}
                          </p>
                          {/* v330: the note says "click the button" but there was no button */}
                          <Link to="/creator/kyc?edit=true" className="inline-flex mt-2 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs items-center gap-1 transition-all shadow-sm">
                            <Edit3 size={13} /> Update & resubmit
                          </Link>
                        </div>
                      )}
                    </div>

                    {/* Submitted Details Review Grid */}
                    <div className="border border-slate-100 rounded-2xl p-6 bg-slate-50/50 space-y-4">
                      <div className="border-b border-slate-100 pb-2">
                        <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest">Submitted Credentials Overview</h4>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-xs">
                        <div className="py-1 flex flex-col gap-0.5">
                          <span className="text-slate-500 font-bold">Holder Name</span>
                          <span className="text-slate-800 font-extrabold">{kycObj.documents?.creator_name || "N/A"}</span>
                        </div>
                        <div className="py-1 flex flex-col gap-0.5">
                          <span className="text-slate-500 font-bold">PAN Identity Reference</span>
                          <span className="text-slate-800 font-extrabold">{kycObj.documents?.creator_pan || "N/A"}</span>
                        </div>
                        <div className="py-1 flex flex-col gap-0.5">
                          <span className="text-slate-500 font-bold">Bank Transfer Account</span>
                          <span className="text-slate-800 font-extrabold">
                            {kycObj.documents?.bank_account ? `${kycObj.documents?.bank_name || "Bank"} - XXXX${kycObj.documents.bank_account.slice(-4)}` : "N/A"}{/* v330: no "HDFC N/A" */}
                          </span>
                        </div>
                        <div className="py-1 flex flex-col gap-0.5">
                          <span className="text-slate-500 font-bold">Bank IFSC</span>
                          <span className="text-slate-800 font-extrabold">{kycObj.documents?.bank_ifsc || "N/A"}</span>
                        </div>
                        <div className="py-1 flex flex-col gap-0.5">
                          <span className="text-slate-500 font-bold">UPI Virtual Address</span>
                          <span className="text-slate-800 font-extrabold flex items-center gap-2 flex-wrap break-all">
                            {kycObj.documents?.upi_id || "N/A"}
                            {(kycObj.documents?.upi_qr_code_url || kycObj.documents?.uploaded_files?.[3]) && (
                              <a
                                href={kycObj.documents?.upi_qr_code_url || kycObj.documents?.uploaded_files?.[3]}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#7C3AED] hover:text-[#6D28D9] bg-[#F5F0FF] px-2 py-0.5 rounded border border-[#DDD6FE] transition-colors"
                              >
                                <QrCode size={12} /> View QR Code
                              </a>
                            )}
                          </span>
                        </div>
                        <div className="py-1 flex flex-col gap-0.5">
                          <span className="text-slate-500 font-bold">Instagram Handle</span>
                          <span className="text-slate-800 font-extrabold">{kycObj.documents?.social_handle || "N/A"}</span>
                        </div>
                        <div className="py-1 flex flex-col gap-0.5">
                          <span className="text-slate-500 font-bold">Verified Followers</span>
                          <span className="text-slate-800 font-extrabold">
                            {kycObj.documents?.followers ? Number(kycObj.documents.followers).toLocaleString("en-IN") /* v330 */ : "N/A"}
                          </span>
                        </div>

                        {/* Document Download Links */}
                        <div className="py-2 flex flex-col gap-2 md:col-span-2 border-t border-slate-100 pt-4 mt-2">
                          <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Submitted Document Files</span>
                          <div className="flex flex-wrap gap-3">
                            {kycObj.documents?.uploaded_files?.[0] && (
                              <a 
                                href={kycObj.documents.uploaded_files[0]} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold border border-slate-200 transition-colors text-xs"
                              >
                                <FileText size={14} /> PAN Card Document
                              </a>
                            )}
                            {(kycObj.documents?.upi_qr_code_url || kycObj.documents?.uploaded_files?.[3]) && (
                              <a 
                                href={kycObj.documents?.upi_qr_code_url || kycObj.documents?.uploaded_files?.[3]} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F5F0FF] hover:bg-[#EDE9FE] text-[#6D28D9] rounded-lg font-bold border border-[#DDD6FE] transition-colors text-xs"
                              >
                                <QrCode size={14} /> UPI Payment QR Image
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}</>;
}
