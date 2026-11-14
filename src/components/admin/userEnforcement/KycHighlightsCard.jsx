import React from "react";
import { FileText, CheckCircle2, XCircle, Clock, QrCode, Building2, ChevronRight } from "lucide-react";


// Session 49 (clean-up): moved out of UserEnforcementPanel.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function KycHighlightsCard(props) {
  const { aadhaarBackUrl, aadhaarFrontUrl, gstDocUrl, incDocUrl, isKycApproved, isKycRejected, kyc, panDocUrl, setActiveTab, setPreviewDoc, upiQrCodeUrl, user } = props;
  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
               <div className="flex flex-wrap items-center justify-between gap-2 mb-4">{/* v332: wraps on phones */}
                  <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                    <FileText size={18} className="text-[#A855F7]" /> KYC & Identity Verification
                  </h3>
                  <button 
                    onClick={() => setActiveTab('kyc')}
                    className="text-xs font-extrabold text-[#A855F7] hover:text-[#9333EA] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    View Documents & Details <ChevronRight size={14} />
                  </button>
               </div>
           
           {kyc ? (
             <div className="space-y-4">
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100">
                  <div>
                     <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Status</div>
                     <div className="font-extrabold">
                       {isKycApproved ? (
                         <span className="text-emerald-600 flex items-center gap-1.5"><CheckCircle2 size={15}/> Verified (Approved)</span>
                       ) : isKycRejected ? (
                         <span className="text-red-600 flex items-center gap-1.5"><XCircle size={15}/> Rejected</span>
                       ) : (
                         <span className="text-amber-600 flex items-center gap-1.5"><Clock size={15}/> Pending Verification</span>
                       )}
                     </div>
                  </div>
                  <div>
                     <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Verified Name</div>
                     <div className="font-semibold text-gray-900 truncate">{kyc.full_name || kyc.company_name || user.name || '—'}</div>
                  </div>
                  <div>
                     <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">PAN Number</div>
                     <div className="font-mono font-semibold text-gray-900">{kyc.pan_number || '—'}</div>
                  </div>
                  <div>
                     <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">{user.role === 'brand' ? 'GSTIN' : 'Aadhaar / Tax ID'}</div>
                     <div className="font-mono font-semibold text-gray-900">{kyc.gst_number || kyc.aadhaar_number || '—'}</div>
                  </div>
               </div>

               {/* Quick KYC documents bar */}
               <div className="flex flex-wrap items-center gap-3 pt-1">
                 {panDocUrl && (
                   <button 
                     onClick={() => setPreviewDoc({ title: 'PAN Card Document', url: panDocUrl })}
                     className="px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
                   >
                     <FileText size={14} /> PAN Card Document
                   </button>
                 )}
                 {aadhaarFrontUrl && (
                   <button 
                     onClick={() => setPreviewDoc({ title: 'Aadhaar Card (Front)', url: aadhaarFrontUrl })}
                     className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
                   >
                     <FileText size={14} /> Aadhaar Front
                   </button>
                 )}
                 {aadhaarBackUrl && (
                   <button 
                     onClick={() => setPreviewDoc({ title: 'Aadhaar Card (Back)', url: aadhaarBackUrl })}
                     className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
                   >
                     <FileText size={14} /> Aadhaar Back
                   </button>
                 )}
                 {upiQrCodeUrl && (
                   <button 
                     onClick={() => setPreviewDoc({ title: 'UPI QR Code', url: upiQrCodeUrl })}
                     className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
                   >
                     <QrCode size={14} /> UPI QR Code
                   </button>
                 )}
                 {gstDocUrl && (
                   <button 
                     onClick={() => setPreviewDoc({ title: 'GST Certificate', url: gstDocUrl })}
                     className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
                   >
                     <FileText size={14} /> GST Certificate
                   </button>
                 )}
                 {incDocUrl && (
                   <button 
                     onClick={() => setPreviewDoc({ title: 'Business Proof', url: incDocUrl })}
                     className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
                   >
                     <Building2 size={14} /> Business Proof
                   </button>
                 )}
               </div>
             </div>
           ) : (
             <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 text-gray-500 text-sm font-medium flex flex-wrap items-center justify-between gap-2">{/* v332 */}
               <span>No official KYC documents have been submitted yet.</span>
               <button onClick={() => setActiveTab('kyc')} className="text-xs font-bold text-[#A855F7] hover:underline">
                 Open KYC Tab
               </button>
             </div>
           )}
        </div>
  );
}
