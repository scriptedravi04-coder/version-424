import React from "react";
import { FileText, Copy } from "lucide-react";


// Session 49 (clean-up): moved out of UserEnforcementPanel.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function LegalKycGrid(props) {
  const { handleCopy, kyc, user } = props;
  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
          <h4 className="text-base font-extrabold text-gray-900 mb-4 flex items-center gap-2">
            <FileText size={18} className="text-[#A855F7]" /> Submitted Legal & Tax Information
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">
                {user.role === 'brand' ? 'Registered Business Name' : 'Legal Full Name'}
              </div>
              <div className="font-bold text-gray-900 text-sm break-words">{kyc?.full_name || kyc?.company_name || user.name || '—'}</div>
            </div>

            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">PAN Card Number</div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-extrabold text-gray-900 text-sm">{kyc?.pan_number || '—'}</span>
                {kyc?.pan_number && (
                  <button onClick={() => handleCopy(kyc.pan_number, 'PAN Number')} aria-label="Copy PAN number" /* v332 */ className="p-1.5 -m-1 text-gray-500 hover:text-gray-600">
                    <Copy size={13} />
                  </button>
                )}
              </div>
            </div>

            {user.role === 'brand' ? (
              <div>
                <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">GSTIN Number</div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-extrabold text-gray-900 text-sm">{kyc?.gst_number || kyc?.gstin || '—'}</span>
                  {kyc?.gst_number && (
                    <button onClick={() => handleCopy(kyc.gst_number, 'GSTIN')} aria-label="Copy GSTIN" /* v332 */ className="p-1.5 -m-1 text-gray-500 hover:text-gray-600">
                      <Copy size={13} />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Aadhaar Number / ID</div>
                <div className="font-mono font-bold text-gray-900 text-sm">{kyc?.aadhaar_number || '—'}</div>
              </div>
            )}

            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Date of Birth / Registration</div>
              <div className="font-semibold text-gray-900 text-sm">{kyc?.dob || kyc?.date_of_birth || kyc?.rate_card?.dob || kyc?.rate_card?.date_of_birth || user?.dob || user?.date_of_birth || user?.profile?.dob || user?.profile?.rate_card?.dob || user?.profile?.date_of_birth || '—'}</div>
            </div>

            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Registered Phone</div>
              <div className="font-semibold text-gray-900 text-sm">{kyc?.phone || kyc?.mobile || user.phone || '—'}</div>
            </div>

            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Registered Address</div>
              <div className="font-semibold text-gray-900 text-sm">{kyc?.address || (kyc?.city ? [kyc.city, kyc.state].filter(Boolean).join(', ') : '—')}{/* v332: no trailing comma */}</div>
            </div>

            {kyc?.ocr_extracted_name && (
              <div className="col-span-full p-4 rounded-2xl bg-purple-50/50 border border-purple-100 flex flex-wrap items-center justify-between gap-2">{/* v332 */}
                <div>
                  <div className="text-[11px] font-extrabold text-purple-700 uppercase tracking-wider">AI OCR Document Extraction</div>
                  <div className="text-xs font-semibold text-gray-800 mt-0.5">
                    Extracted Name: <span className="font-bold">{kyc.ocr_extracted_name}</span> | Extracted PAN: <span className="font-mono font-bold">{kyc.ocr_extracted_pan || kyc.pan_number}</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full text-[10px] font-extrabold uppercase">
                  OCR Verified
                </span>
              </div>
            )}
          </div>
        </div>
  );
}
