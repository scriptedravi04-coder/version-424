import React from "react";
import { toast } from "sonner";
import { checkHttpUrl } from "../../../utils/httpUrl";


// Session 49 (clean-up): moved out of BrandUGCMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
// v330: inputs at 16px (text-base) — at 12px iPhone zoomed the whole page on focus.
export default function BriefStepProduct(props) {
  const { postData, postStep, setPostData, setPostStep, wordCountDesc } = props;
  // v346: the sample / product link must be a real http(s) link or empty (no "javascript:", no plain words)
  const [triedNext, setTriedNext] = React.useState(false);
  const sampleCheck = checkHttpUrl(postData.sample_content_url, { label: "Sample content URL" });
  const showSampleError = !sampleCheck.ok && (triedNext || /^[a-z][a-z0-9+.-]*:/i.test(String(postData.sample_content_url || "").trim()));
  return <>{postStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-[20px] p-5 border border-[#E5E5EA] shadow-xs space-y-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280] mb-1.5">
                    Product Name *
                  </label>
                  <input 
                    type="text"
                    placeholder="e.g. Hydrating Barrier Repair Serum"
                    value={postData.product_name}
                    onChange={(e) => setPostData({ ...postData, product_name: e.target.value })}
                    className="w-full bg-[#F9F9FB] border border-[#E5E5EA] rounded-xl px-4 py-3 text-base text-[#0A0A0A] font-medium outline-none focus:border-[#7C3AED]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280] mb-1.5">
                    Sample Content URL (Optional)
                  </label>
                  <input 
                    type="url"
                    placeholder="https://instagram.com/reel/... (Reference Reel)"
                    value={postData.sample_content_url}
                    onChange={(e) => setPostData({ ...postData, sample_content_url: e.target.value })}
                    aria-invalid={showSampleError}
                    className={`w-full bg-[#F9F9FB] border ${showSampleError ? "border-red-400" : "border-[#E5E5EA]"} rounded-xl px-4 py-3 text-base text-[#0A0A0A] font-medium outline-none focus:border-[#7C3AED]`}
                  />
                  {showSampleError && <p className="mt-1 text-[12px] font-semibold text-red-600" role="alert">{sampleCheck.error}</p>}
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                      Product Description *
                    </label>
                    <span className={`text-[10px] font-bold ${wordCountDesc > 100 ? 'text-rose-500' : 'text-[#6B7280]'}`}>
                      {wordCountDesc} / 100 words
                    </span>
                  </div>
                  <textarea 
                    rows={3}
                    placeholder="Briefly describe what the product does and why buyers love it..."
                    value={postData.product_description}
                    onChange={(e) => setPostData({ ...postData, product_description: e.target.value })}
                    className="w-full bg-[#F9F9FB] border border-[#E5E5EA] rounded-xl p-3.5 text-base text-[#0A0A0A] font-medium outline-none focus:border-[#7C3AED]"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setPostStep(1)} 
                  className="flex-1 py-4 bg-[#F2F2F7] text-[#0A0A0A] rounded-2xl font-bold text-xs"
                >
                  Back
                </button>
                <button 
                  onClick={() => {
                    if (postData.product_name.trim().length < 2) {
                      toast.error("Product name is required");
                      return;
                    }
                    if (postData.product_description.trim().length < 10) {
                      toast.error("Product description must be at least 10 characters");
                      return;
                    }
                    if (wordCountDesc > 100) {
                      toast.error("Product description exceeds 100 words");
                      return;
                    }
                    setTriedNext(true);
                    if (!sampleCheck.ok) { toast.error(sampleCheck.error); return; } // v346
                    if (sampleCheck.url !== (postData.sample_content_url || "")) setPostData({ ...postData, sample_content_url: sampleCheck.url });
                    setPostStep(3);
                  }} 
                  className="flex-[2] py-4 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-2xl font-bold text-xs uppercase tracking-wider shadow-md active:scale-95 transition-all"
                >
                  Next: Deliverables
                </button>
              </div>
            </div>
          )}</>;
}
