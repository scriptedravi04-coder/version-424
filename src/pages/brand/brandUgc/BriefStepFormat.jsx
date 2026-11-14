import React from "react";
import { CheckCircle2, Check, X, AlertCircle, Camera, Film } from "lucide-react";


// Session 49 (clean-up): moved out of BrandUGCMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function BriefStepFormat(props) {
  const { SUGGESTED_DONTS, SUGGESTED_DOS, postData, postStep, setPostData, setPostStep } = props;
  return <>{postStep === 3 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-[20px] p-5 border border-[#E5E5EA] shadow-xs space-y-4">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Select Campaign Format
                </label>

                {/* Format selection — Session 41 (Ravi): two boxes side by side, like desktop. */}
                {(() => {
                  const isReel = postData.deliverable_type === "collaboration_reel";
                  const isUgc = String(postData.deliverable_type || "").startsWith("ugc_video");
                  const box = (on) => `relative p-3.5 rounded-2xl border-2 transition-colors cursor-pointer text-left flex flex-col gap-2 min-h-[132px] ${on ? "border-[#7C3AED] bg-[#F8F4FF]" : "border-[#E5E5EA] bg-white"}`;
                  const tick = (
                    <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-[#7C3AED] text-white flex items-center justify-center">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  );
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-2.5" data-testid="ugc-format-grid">
                        <button type="button" className={box(isReel)} onClick={() => setPostData({ ...postData, deliverable_type: "collaboration_reel" })}>
                          {isReel && tick}
                          <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${isReel ? "bg-[#7C3AED] text-white" : "bg-[#F5F0FF] text-[#7C3AED]"}`}>
                            <Film size={20} />
                          </span>
                          <span className="text-[13.5px] font-bold text-[#0A0A0A] leading-tight">Collaboration Reel</span>
                          <span className="text-[11px] text-[#6B7280] leading-snug">Posted on the creator's Instagram with your brand tag.</span>
                        </button>
                        <button type="button" className={box(isUgc)} onClick={() => { if (!isUgc) setPostData({ ...postData, deliverable_type: "ugc_video_edited" }); }}>
                          {isUgc && tick}
                          <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${isUgc ? "bg-[#7C3AED] text-white" : "bg-blue-50 text-[#7C3AED]"}`}>
                            <Camera size={20} />
                          </span>
                          <span className="text-[13.5px] font-bold text-[#0A0A0A] leading-tight">UGC Video</span>
                          <span className="text-[11px] text-[#6B7280] leading-snug">Uploaded in the app. You review before payout.{/* v358: drafts are uploaded in Ybex */}</span>
                        </button>
                      </div>

                      {isUgc && (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setPostData({ ...postData, deliverable_type: "ugc_video_raw" })}
                            className={`py-2 min-h-[40px] rounded-xl text-xs font-bold border transition-colors ${postData.deliverable_type === "ugc_video_raw" ? "bg-[#7C3AED] text-white border-[#7C3AED]" : "bg-white text-[#6B7280] border-[#E5E5EA]"}`}
                          >
                            Completely Raw
                          </button>
                          <button
                            type="button"
                            onClick={() => setPostData({ ...postData, deliverable_type: "ugc_video_edited" })}
                            className={`py-2 min-h-[40px] rounded-xl text-xs font-bold border transition-colors ${postData.deliverable_type === "ugc_video_edited" ? "bg-[#7C3AED] text-white border-[#7C3AED]" : "bg-white text-[#6B7280] border-[#E5E5EA]"}`}
                          >
                            Fully Edited
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* v332: bigger tap targets on the Raw/Edited, suggestion and "+ Add" buttons */}
                {/* Duration Pills */}
                {postData.deliverable_type !== 'ugc_video_raw' && (
                  <div className="pt-2">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[#6B7280] mb-2">
                      Video Duration
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {['15s', '30s', '60s', '90s'].map(dur => (
                        <button 
                          key={dur}
                          type="button"
                          onClick={() => setPostData({ ...postData, video_duration: dur })}
                          className={`py-2.5 rounded-xl border text-xs font-bold transition-all ${
                            postData.video_duration === dur
                              ? 'border-[#7C3AED] bg-[#F1E8FF] text-[#7C3AED]'
                              : 'border-[#E5E5EA] bg-[#F9F9FB] text-[#3F3F46]'
                          }`}
                        >
                          {dur}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rules: Must DO & Must NOT DO */}
                <div className="pt-2 space-y-4">
                  {/* Must Do */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 size={13} /> Must Do
                      </label>
                      <span className="text-[10px] text-gray-500">Creator guidelines</span>
                    </div>

                    {postData.dos?.map((rule, idx) => (
                      <div key={idx} className="flex gap-2 mb-2">
                        <input 
                          type="text"
                          value={rule}
                          placeholder="e.g. Show product texture in natural daylight"
                          onChange={(e) => {
                            const newDos = [...postData.dos];
                            newDos[idx] = e.target.value;
                            setPostData({ ...postData, dos: newDos });
                          }}
                          className="flex-1 bg-[#F9F9FB] border border-[#E5E5EA] rounded-xl px-3 py-2.5 text-base text-[#0A0A0A] focus:border-emerald-500 outline-none min-w-0" /* v330: 16px stops iOS zoom */
                        />
                        <button 
                          type="button"
                          onClick={() => {
                            const newDos = postData.dos.filter((_, i) => i !== idx);
                            setPostData({ ...postData, dos: newDos });
                          }}
                          className="text-gray-500 hover:text-red-500 px-1 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                          title="Remove rule"
                          aria-label="Remove rule"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}

                    <div className="flex items-center justify-between mb-2">
                      <button 
                        type="button"
                        onClick={() => setPostData({ ...postData, dos: [...(postData.dos || []), ""] })}
                        className="text-xs font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer min-h-[40px]"
                      >
                        + Add Custom Rule
                      </button>
                    </div>

                    {/* Suggestions for Must DO */}
                    <div className="bg-[#F9F9FB] border border-[#E5E5EA] rounded-xl p-2.5">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
                        💡 Suggested Do's (tap to add):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {SUGGESTED_DOS.map((sug, idx) => {
                          const isAdded = postData.dos?.includes(sug);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                if (isAdded) {
                                  setPostData({
                                    ...postData,
                                    dos: postData.dos.filter(d => d !== sug)
                                  });
                                } else {
                                  const emptyIdx = postData.dos?.findIndex(d => !d.trim());
                                  if (emptyIdx !== -1 && emptyIdx !== undefined) {
                                    const updated = [...postData.dos];
                                    updated[emptyIdx] = sug;
                                    setPostData({ ...postData, dos: updated });
                                  } else {
                                    setPostData({ ...postData, dos: [...(postData.dos || []), sug] });
                                  }
                                }
                              }}
                              className={`text-[11px] px-2.5 py-1 min-h-[32px] rounded-lg border transition-all text-left ${
                                isAdded
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold'
                                  : 'border-dashed border-gray-300 bg-white text-gray-600 hover:border-emerald-400'
                              }`}
                            >
                              {isAdded ? "✓ " : "+ "} {sug}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Must Not Do */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-rose-600 flex items-center gap-1">
                        <AlertCircle size={13} /> Must Not Do
                      </label>
                      <span className="text-[10px] text-gray-500">Strict restrictions</span>
                    </div>

                    {postData.donts?.map((rule, idx) => (
                      <div key={idx} className="flex gap-2 mb-2">
                        <input 
                          type="text"
                          value={rule}
                          placeholder="e.g. Do not mention competitor brand names"
                          onChange={(e) => {
                            const newDonts = [...postData.donts];
                            newDonts[idx] = e.target.value;
                            setPostData({ ...postData, donts: newDonts });
                          }}
                          className="flex-1 bg-[#F9F9FB] border border-[#E5E5EA] rounded-xl px-3 py-2.5 text-base text-[#0A0A0A] focus:border-rose-500 outline-none min-w-0" /* v330: 16px stops iOS zoom */
                        />
                        <button 
                          type="button"
                          onClick={() => {
                            const newDonts = postData.donts.filter((_, i) => i !== idx);
                            setPostData({ ...postData, donts: newDonts });
                          }}
                          className="text-gray-500 hover:text-red-500 px-1 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                          title="Remove restriction"
                          aria-label="Remove restriction"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}

                    <div className="flex items-center justify-between mb-2">
                      <button 
                        type="button"
                        onClick={() => setPostData({ ...postData, donts: [...(postData.donts || []), ""] })}
                        className="text-xs font-bold text-rose-600 hover:text-rose-700 cursor-pointer min-h-[40px]"
                      >
                        + Add Custom Restriction
                      </button>
                    </div>

                    {/* Suggestions for Must NOT DO */}
                    <div className="bg-[#F9F9FB] border border-[#E5E5EA] rounded-xl p-2.5">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
                        💡 Suggested Don'ts (tap to add):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {SUGGESTED_DONTS.map((sug, idx) => {
                          const isAdded = postData.donts?.includes(sug);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                if (isAdded) {
                                  setPostData({
                                    ...postData,
                                    donts: postData.donts.filter(d => d !== sug)
                                  });
                                } else {
                                  const emptyIdx = postData.donts?.findIndex(d => !d.trim());
                                  if (emptyIdx !== -1 && emptyIdx !== undefined) {
                                    const updated = [...postData.donts];
                                    updated[emptyIdx] = sug;
                                    setPostData({ ...postData, donts: updated });
                                  } else {
                                    setPostData({ ...postData, donts: [...(postData.donts || []), sug] });
                                  }
                                }
                              }}
                              className={`text-[11px] px-2.5 py-1 min-h-[32px] rounded-lg border transition-all text-left ${
                                isAdded
                                  ? 'border-rose-500 bg-rose-50 text-rose-700 font-semibold'
                                  : 'border-dashed border-gray-300 bg-white text-gray-600 hover:border-rose-400'
                              }`}
                            >
                              {isAdded ? "✓ " : "+ "} {sug}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setPostStep(2)} 
                  className="flex-1 py-4 bg-[#F2F2F7] text-[#0A0A0A] rounded-2xl font-bold text-xs"
                >
                  Back
                </button>
                <button 
                  onClick={() => setPostStep(4)} 
                  className="flex-[2] py-4 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-2xl font-bold text-xs uppercase tracking-wider shadow-md active:scale-95 transition-all"
                >
                  Next: Budget
                </button>
              </div>
            </div>
          )}</>;
}
