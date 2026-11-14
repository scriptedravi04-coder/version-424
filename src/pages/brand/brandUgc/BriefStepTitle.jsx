import React from "react";
import { toast } from "sonner";


// Session 49 (clean-up): moved out of BrandUGCMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
// v330: inputs at 16px (text-base) — at 12px iPhone zoomed the whole page on focus.
export default function BriefStepTitle(props) {
  const { postData, postStep, setPostData, setPostStep, setShowAiAssist, wordCountReq } = props;
  return <>{postStep === 1 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-[20px] p-5 border border-[#E5E5EA] shadow-xs space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                    Campaign Title *
                  </label>
                  <button 
                    type="button" 
                    onClick={() => setShowAiAssist(true)} // v332: bigger tap target
                    className="text-[11px] font-bold text-[#7C3AED] flex items-center gap-1 bg-[#F1E8FF] px-3 min-h-[32px] rounded-lg hover:bg-[#E9D5FF] transition-all cursor-pointer"
                  >
                    AI Assist
                  </button>
                </div>

                <input 
                  type="text"
                  placeholder="e.g. Summer Skincare Unboxing & Routine"
                  value={postData.title}
                  onChange={(e) => setPostData({ ...postData, title: e.target.value })}
                  className="w-full bg-[#F9F9FB] border border-[#E5E5EA] rounded-xl px-4 py-3 text-base text-[#0A0A0A] font-medium outline-none focus:border-[#7C3AED] transition-colors"
                />

                {/* AI Quick preset tags */}
                <div className="pt-1">
                  <p className="text-[10px] text-[#6B7280] mb-1.5 font-bold uppercase tracking-wider">Quick Suggestions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {["Honest 30s Review", "Routine / How-to", "Unboxing & First Look", "Problem vs Solution"].map(preset => (
                      <button
                        key={preset}
                        type="button"
                        // v332: product name comes on the next step — no placeholder "- Product" in the real title
                        onClick={() => setPostData({ ...postData, title: postData.product_name ? `${preset} - ${postData.product_name}` : preset })}
                        className="text-[11px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[#3F3F46] font-medium px-3 min-h-[32px] rounded-lg border border-[#E5E5EA]"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                      Detailed Requirements *
                    </label>
                    <span className={`text-[10px] font-bold ${wordCountReq > 200 ? 'text-rose-500' : 'text-[#6B7280]'}`}>
                      {wordCountReq} / 200 words
                    </span>
                  </div>
                  <textarea 
                    rows={4}
                    placeholder="Describe what you expect from the creator: tone, key product benefits to highlight, call to action (Min 10 chars, Max 200 words)..."
                    value={postData.detailed_requirements}
                    onChange={(e) => setPostData({ ...postData, detailed_requirements: e.target.value })}
                    className="w-full bg-[#F9F9FB] border border-[#E5E5EA] rounded-xl p-3.5 text-base text-[#0A0A0A] font-medium outline-none focus:border-[#7C3AED] transition-colors"
                  />
                </div>
              </div>

              <button 
                onClick={() => {
                  if (postData.title.trim().length < 5) {
                    toast.error("Campaign Title must be at least 5 characters");
                    return;
                  }
                  if (postData.detailed_requirements.trim().length < 10) {
                    toast.error("Requirements must be at least 10 characters");
                    return;
                  }
                  if (wordCountReq > 200) {
                    toast.error("Requirements exceed 200 words");
                    return;
                  }
                  setPostStep(2);
                }}
                className="w-full py-4 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-2xl font-bold text-xs uppercase tracking-wider shadow-md active:scale-95 transition-all cursor-pointer"
              >
                Next: Product Info
              </button>
            </div>
          )}</>;
}
