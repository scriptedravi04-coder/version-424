import React, { useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, AlertCircle, Plus, CheckCircle2 } from "lucide-react";
import { FormattedNumberInput } from "../../../components/ui/FormattedNumberInput";
import InstagramFetchButton from "../../../components/instagram/InstagramFetchButton"; // v352


// Session 49 (clean-up): moved out of CreatorSettings.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function PlatformsPanel(props) {
  const { activePlatform, profile, saveProfileChanges, setActivePlatform, setProfile } = props;
  const [saving, setSaving] = useState(false); // v332: the Save button had no busy state and closed even when the save failed
  return (
    <div className="relative min-h-[400px]">
                  <AnimatePresence mode="wait">
                    {!activePlatform ? (
                      <motion.div
                        key="grid"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                      >
                        {[
                          { 
                            id: "Instagram", 
                            name: "Instagram", 
                            icon: <img src="/assets/instagram.svg" className="w-11 h-11 object-contain rounded-[10px]" alt="Instagram" />, 
                            isComplete: !!profile.socials?.find(s => s.platform === 'Instagram')?.url, 
                            stat: profile.socials?.find(s => s.platform === 'Instagram')?.url ? "Added" : "Add Instagram" 
                          },
                          { 
                            id: "YouTube", 
                            name: "YouTube", 
                            icon: <img src="/assets/youtube.svg" className="w-11 h-11 object-contain rounded-[10px]" alt="YouTube" />, 
                            isComplete: !!profile.socials?.find(s => s.platform === 'YouTube')?.url, 
                            stat: profile.socials?.find(s => s.platform === 'YouTube')?.url ? "Added" : "Add YouTube" 
                          },
                          { 
                            id: "Snapchat", 
                            name: "Snapchat", 
                            icon: <img src="/assets/snapchat.svg" className="w-11 h-11 object-contain rounded-[10px]" alt="Snapchat" />, 
                            isComplete: !!profile.socials?.find(s => s.platform === 'Snapchat')?.url, 
                            stat: profile.socials?.find(s => s.platform === 'Snapchat')?.url ? "Added" : "Add Snapchat" 
                          },
                          { 
                            id: "LinkedIn", 
                            name: "LinkedIn", 
                            icon: <img src="/assets/linkedin.svg?v=2" className="w-11 h-11 object-contain rounded-[10px]" alt="LinkedIn" />, 
                            isComplete: !!profile.socials?.find(s => s.platform === 'LinkedIn')?.url, 
                            stat: profile.socials?.find(s => s.platform === 'LinkedIn')?.url ? "Added" : "Add LinkedIn" 
                          },
                          { 
                            id: "Facebook", 
                            name: "Facebook", 
                            icon: <img src="/assets/facebook.svg" className="w-11 h-11 object-contain rounded-[10px]" alt="Facebook" />, 
                            isComplete: !!profile.socials?.find(s => s.platform === 'Facebook')?.url, 
                            stat: profile.socials?.find(s => s.platform === 'Facebook')?.url ? "Added" : "Add Facebook" 
                          }
                        ].map((p) => (
                          <button
                            key={p.id}
                            onClick={() => setActivePlatform(p.id)}
                            className={`relative flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                              p.isComplete 
                                ? 'bg-white border-slate-200 shadow-sm' 
                                : 'bg-slate-50 border-dashed border-slate-200 hover:border-[var(--violet)] hover:bg-[var(--violet)]/5'
                            } ${p.id === 'Instagram' ? 'sm:col-span-2' : ''}`}
                          >
                            <div className="flex-shrink-0 flex items-center justify-center w-11 h-11">
                              {p.icon}
                            </div>
                            <div className="flex-grow text-left flex flex-col justify-center">
                              <span className="font-semibold text-slate-800">{p.name}</span>
                              <div className="flex items-center gap-1 text-xs text-slate-500 font-medium mt-0.5">
                                {p.isComplete ? <CheckCircle2 size={12} className="text-emerald-500" /> : <Plus size={12} className="text-slate-500" />}
                                {p.stat}{/* v332: a typed handle said "Connected" though nothing is connected */}
                              </div>
                            </div>
                          </button>
                        ))}
                      </motion.div>
                    ) : (
                      <motion.div
                        key="form"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                        className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-center"
                      >
                        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                          <button
                            onClick={() => setActivePlatform(null)}
                            aria-label="Back to platforms" /* v330: icon-only */
                            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
                          >
                            <ArrowLeft size={20} />
                          </button>
                          <h3 className="text-lg font-bold text-slate-800 capitalize">
                            {activePlatform} Details
                          </h3>
                        </div>

                        <div className="space-y-6">
                          {activePlatform === "Instagram" ? (
                            <>
                              <div>
                                <label className="text-xs font-bold text-slate-500 mb-2 block uppercase tracking-wider">
                                  Instagram Handle / Profile URL <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={profile.socials?.find(s => s.platform === "Instagram")?.url || ""}
                                  onChange={(e) => {
                                    const newSocials = profile.socials ? [...profile.socials] : [];
                                    const existingIndex = newSocials.findIndex(s => s.platform === "Instagram");
                                    if (existingIndex >= 0) {
                                      newSocials[existingIndex].url = e.target.value;
                                    } else {
                                      newSocials.push({ id: Date.now(), platform: "Instagram", url: e.target.value });
                                    }
                                    setProfile({ ...profile, socials: newSocials });
                                  }}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-slate-800 focus:border-[var(--violet)] outline-none font-medium text-sm"
                                  placeholder="@username or instagram.com/username"
                                />
                                {/* v352: Fetch → saved as live numbers (update every day) + fills the boxes below */}
                                <InstagramFetchButton save username={profile.socials?.find(s => s.platform === "Instagram")?.url || ""} onFetched={(n) => setProfile(p => ({
                                  ...p,
                                  instagramFollowers: n.followers ?? p.instagramFollowers,
                                  instagramAvgReach: n.avg_views ?? p.instagramAvgReach,
                                  instagramAvgLikes: n.avg_likes ?? p.instagramAvgLikes,
                                  instagramAvgComments: n.avg_comments ?? p.instagramAvgComments,
                                }))} />
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <label className="text-xs font-bold text-slate-500 mb-2 block uppercase tracking-wider">
                                    Instagram Followers <span className="text-red-500">*</span>
                                  </label>
                                  <FormattedNumberInput
                                    value={profile.instagramFollowers || 0}
                                    onChange={(val) => setProfile(p => ({ ...p, instagramFollowers: val || 0 }))}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-slate-800 focus:border-[var(--violet)] outline-none font-medium text-sm"
                                    placeholder="e.g. 15,000"
                                  />
                                  <p className="text-[10px] text-slate-500 mt-1">Total follower count</p>
                                </div>

                                <div>
                                  <label className="text-xs font-bold text-slate-500 mb-2 block uppercase tracking-wider">
                                    Average Reach (30 Days) <span className="text-red-500">*</span>
                                  </label>
                                  <FormattedNumberInput
                                    value={profile.instagramAvgReach || 0}
                                    onChange={(val) => setProfile(p => ({ ...p, instagramAvgReach: val || 0 }))}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-slate-800 focus:border-[var(--violet)] outline-none font-medium text-sm"
                                    placeholder="e.g. 8,500"
                                  />
                                  <p className="text-[10px] text-slate-500 mt-1">Average views/reach per Reel</p>
                                </div>

                                <div>
                                  <label className="text-xs font-bold text-slate-500 mb-2 block uppercase tracking-wider">
                                    Average Likes (per Post) <span className="text-red-500">*</span>
                                  </label>
                                  <FormattedNumberInput
                                    value={profile.instagramAvgLikes || 0}
                                    onChange={(val) => setProfile(p => ({ ...p, instagramAvgLikes: val || 0 }))}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-slate-800 focus:border-[var(--violet)] outline-none font-medium text-sm"
                                    placeholder="e.g. 1,200"
                                  />
                                  <p className="text-[10px] text-slate-500 mt-1">Avg likes per post</p>
                                </div>

                                <div>
                                  <label className="text-xs font-bold text-slate-500 mb-2 block uppercase tracking-wider">
                                    Average Comments (per Post) <span className="text-red-500">*</span>
                                  </label>
                                  <FormattedNumberInput
                                    value={profile.instagramAvgComments || 0}
                                    onChange={(val) => setProfile(p => ({ ...p, instagramAvgComments: val || 0 }))}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-slate-800 focus:border-[var(--violet)] outline-none font-medium text-sm"
                                    placeholder="e.g. 85"
                                  />
                                  <p className="text-[10px] text-slate-500 mt-1">Avg comments per post</p>
                                </div>
                              </div>

                              {profile.instagramFollowers > 0 && (() => {
                                const likes = Number(profile.instagramAvgLikes || 0);
                                const comments = Number(profile.instagramAvgComments || 0);
                                const followers = Number(profile.instagramFollowers || 0);
                                const er = ((likes + comments) / followers) * 100;
                                const isUnusuallyHigh = er > 50;

                                return (
                                  <div className="space-y-3">
                                    <div className="p-4 bg-[#F5F0FF] border border-[#DDD6FE] rounded-2xl flex items-center justify-between text-xs">
                                      <div>
                                        <span className="text-[#7C3AED] font-extrabold uppercase tracking-wider text-[10px]">Live Calculated Engagement</span>
                                        <p className="text-purple-950 font-black text-lg">
                                          {er.toFixed(2)}%
                                        </p>
                                      </div>
                                      <div className="text-right text-slate-500 font-medium text-[11px]">
                                        <p>Likes + Comments: <strong className="text-slate-800">{(likes + comments).toLocaleString("en-IN") /* v330 */}</strong></p>
                                        <p>Followers: <strong className="text-slate-800">{followers.toLocaleString("en-IN")}</strong></p>
                                      </div>
                                    </div>

                                    {isUnusuallyHigh && (
                                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 p-3.5 rounded-xl text-xs text-amber-900 font-medium">
                                        <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                                        <p>This seems unusually high — please recheck your numbers.</p>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </>
                          ) : (
                            <div>
                              <label className="text-xs font-bold text-slate-500 mb-2 block uppercase tracking-wider">
                                {activePlatform} Profile URL / Handle
                              </label>
                              <input
                                type="text"
                                value={profile.socials?.find(s => s.platform === activePlatform)?.url || ""}
                                onChange={(e) => {
                                  const newSocials = profile.socials ? [...profile.socials] : [];
                                  const existingIndex = newSocials.findIndex(s => s.platform === activePlatform);
                                  if (existingIndex >= 0) {
                                    newSocials[existingIndex].url = e.target.value;
                                  } else {
                                    newSocials.push({ id: Date.now(), platform: activePlatform, url: e.target.value });
                                  }
                                  setProfile({ ...profile, socials: newSocials });
                                }}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-800 focus:border-[var(--violet)] outline-none font-medium text-sm"
                                placeholder="@handle or Profile URL"
                              />
                            </div>
                          )}
                          
                          <button 
                            onClick={() => {
                              const handle = profile.socials?.find(s => s.platform === activePlatform)?.url;
                              if (activePlatform === "Instagram") {
                                if (!handle) {
                                  toast.error("Please enter your Instagram handle or profile link.");
                                  return;
                                }
                                if (!profile.instagramFollowers || profile.instagramFollowers <= 0) {
                                  toast.error("Please enter a valid Instagram follower count greater than 0.");
                                  return;
                                }
                                if (!profile.instagramAvgReach || profile.instagramAvgReach <= 0) {
                                  toast.error("Please enter a valid Average Reach greater than 0.");
                                  return;
                                }
                              }
                              if (saving) return;
                              setSaving(true);
                              Promise.resolve(saveProfileChanges({}))
                                .then((ok) => { if (ok !== false) setActivePlatform(null); })
                                .finally(() => setSaving(false));
                            }} 
                            disabled={saving}
                            className="disabled:opacity-60 disabled:cursor-not-allowed w-full bg-[var(--violet)] hover:bg-[var(--violet-dark)] text-white font-bold py-3.5 rounded-xl transition-colors shadow-sm text-sm"
                          >
                            {saving ? "Saving…" : `Save ${activePlatform} Details`}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
  );
}
