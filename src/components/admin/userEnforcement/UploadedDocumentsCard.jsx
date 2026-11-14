import React from "react";
import { FileText, ExternalLink, Eye } from "lucide-react";


// Session 49 (clean-up): moved out of UserEnforcementPanel.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function UploadedDocumentsCard(props) {
  const { aadhaarBackUrl, aadhaarFrontUrl, gstDocUrl, incDocUrl, panDocUrl, setPreviewDoc, upiQrCodeUrl } = props;
  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
          <h4 className="text-base font-extrabold text-gray-900 mb-4 flex items-center gap-2">
            <FileText size={18} className="text-[#A855F7]" /> Submitted Document Files & Proofs
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* PAN Card */}
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 flex flex-col justify-between h-56">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">PAN Card Document</span>
                  {panDocUrl ? (
                    <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 font-bold rounded">Attached</span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 bg-gray-200 text-gray-500 font-bold rounded">Missing</span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">Official government permanent account number proof</p>
              </div>

              {panDocUrl ? (
                <div className="space-y-2">
                  <div 
                    onClick={() => setPreviewDoc({ title: 'PAN Card', url: panDocUrl })}
                    className="h-24 rounded-xl overflow-hidden border border-gray-200 relative group cursor-pointer bg-black/5"
                  >
                    <img src={panDocUrl} alt="PAN Card" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                      <Eye size={14} /> Click to View
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setPreviewDoc({ title: 'PAN Card', url: panDocUrl })}
                      className="flex-1 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-xs font-bold text-gray-700 flex items-center justify-center gap-1"
                    >
                      <Eye size={12} /> Preview
                    </button>
                    <a 
                      href={panDocUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="p-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-gray-700"
                      title="Open in new tab"
                      aria-label="Open in new tab" /* v332 */
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="h-24 rounded-xl border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-500 font-semibold">
                  No document uploaded
                </div>
              )}
            </div>

            {/* Aadhaar Front */}
            {aadhaarFrontUrl && (<>
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 flex flex-col justify-between h-56">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">Aadhaar Card (Front)</span>
                  {aadhaarFrontUrl ? (
                    <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 font-bold rounded">Attached</span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 bg-gray-200 text-gray-500 font-bold rounded">Missing</span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">Front side of Aadhaar / National Identity</p>
              </div>

              {aadhaarFrontUrl ? (
                <div className="space-y-2">
                  <div 
                    onClick={() => setPreviewDoc({ title: 'Aadhaar (Front)', url: aadhaarFrontUrl })}
                    className="h-24 rounded-xl overflow-hidden border border-gray-200 relative group cursor-pointer bg-black/5"
                  >
                    <img src={aadhaarFrontUrl} alt="Aadhaar Front" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                      <Eye size={14} /> Click to View
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setPreviewDoc({ title: 'Aadhaar (Front)', url: aadhaarFrontUrl })}
                      className="flex-1 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-xs font-bold text-gray-700 flex items-center justify-center gap-1"
                    >
                      <Eye size={12} /> Preview
                    </button>
                    <a 
                      href={aadhaarFrontUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="p-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-gray-700"
                      title="Open in new tab"
                      aria-label="Open in new tab" /* v332 */
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="h-24 rounded-xl border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-500 font-semibold">
                  No document uploaded
                </div>
              )}
            </div>

            </>)}
            {/* Aadhaar Back */}
            {aadhaarBackUrl && (<>
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 flex flex-col justify-between h-56">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">Aadhaar Card (Back)</span>
                  {aadhaarBackUrl ? (
                    <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 font-bold rounded">Attached</span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 bg-gray-200 text-gray-500 font-bold rounded">Missing</span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">Back side of Aadhaar showing registered address</p>
              </div>

              {aadhaarBackUrl ? (
                <div className="space-y-2">
                  <div 
                    onClick={() => setPreviewDoc({ title: 'Aadhaar (Back)', url: aadhaarBackUrl })}
                    className="h-24 rounded-xl overflow-hidden border border-gray-200 relative group cursor-pointer bg-black/5"
                  >
                    <img src={aadhaarBackUrl} alt="Aadhaar Back" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                      <Eye size={14} /> Click to View
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setPreviewDoc({ title: 'Aadhaar (Back)', url: aadhaarBackUrl })}
                      className="flex-1 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-xs font-bold text-gray-700 flex items-center justify-center gap-1"
                    >
                      <Eye size={12} /> Preview
                    </button>
                    <a 
                      href={aadhaarBackUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="p-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-gray-700"
                      title="Open in new tab"
                      aria-label="Open in new tab" /* v332 */
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="h-24 rounded-xl border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-500 font-semibold">
                  No document uploaded
                </div>
              )}
            </div>

            </>)}
            {/* UPI QR Code */}
            {upiQrCodeUrl && (<>
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 flex flex-col justify-between h-56">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">UPI QR Code</span>
                  {upiQrCodeUrl ? (
                    <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 font-bold rounded">Attached</span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 bg-gray-200 text-gray-500 font-bold rounded">Missing</span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">QR code for instant direct UPI payouts</p>
              </div>

              {upiQrCodeUrl ? (
                <div className="space-y-2">
                  <div 
                    onClick={() => setPreviewDoc({ title: 'UPI QR Code', url: upiQrCodeUrl })}
                    className="h-24 rounded-xl overflow-hidden border border-gray-200 relative group cursor-pointer bg-white p-1"
                  >
                    <img src={upiQrCodeUrl} alt="UPI QR Code" className="w-full h-full object-contain group-hover:scale-105 transition-transform" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                      <Eye size={14} /> Click to View
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setPreviewDoc({ title: 'UPI QR Code', url: upiQrCodeUrl })}
                      className="flex-1 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-xs font-bold text-gray-700 flex items-center justify-center gap-1"
                    >
                      <Eye size={12} /> Preview
                    </button>
                    <a 
                      href={upiQrCodeUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="p-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-gray-700"
                      title="Open in new tab"
                      aria-label="Open in new tab" /* v332 */
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="h-24 rounded-xl border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-500 font-semibold">
                  No QR code uploaded
                </div>
              )}
            </div>

            </>)}
            {/* GST / Business Proof (If Brand or applicable) */}
            {(gstDocUrl || incDocUrl) && (
              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 flex flex-col justify-between h-56">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">GST / Incorporation Proof</span>
                    <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 font-bold rounded">Attached</span>
                  </div>
                  <p className="text-[11px] text-gray-500">Official business registration certificate</p>
                </div>

                <div className="space-y-2">
                  <div 
                    onClick={() => setPreviewDoc({ title: 'Business Certificate', url: gstDocUrl || incDocUrl })}
                    className="h-24 rounded-xl overflow-hidden border border-gray-200 relative group cursor-pointer bg-black/5"
                  >
                    <img src={gstDocUrl || incDocUrl} alt="Certificate" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                      <Eye size={14} /> Click to View
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setPreviewDoc({ title: 'Business Certificate', url: gstDocUrl || incDocUrl })}
                      className="flex-1 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-xs font-bold text-gray-700 flex items-center justify-center gap-1"
                    >
                      <Eye size={12} /> Preview
                    </button>
                    <a 
                      href={gstDocUrl || incDocUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="p-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-gray-700"
                      title="Open in new tab"
                      aria-label="Open in new tab" /* v332 */
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
  );
}
