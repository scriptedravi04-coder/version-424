import React from "react";
import InstagramFetchButton from "../../../../components/instagram/InstagramFetchButton"; // v352


// Session 49 (clean-up): moved out of CreatorMobileProfile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function InstagramStatsForm(props) {
  const { commentsNum, followersNum, likesNum, liveEngRate, platformForm, setPlatformForm } = props;
  return (
    <div className="flex-1 p-5 space-y-5">
          <p className="text-xs text-slate-600 font-medium leading-relaxed">
            These numbers appear on your public profile and in brand search. Enter them from your Instagram insights.
          </p>{/* v332: inputs are 16px so iPhone doesn't zoom */}

          {/* Handle or Profile URL */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Handle or Profile URL <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={platformForm.url}
              onChange={(e) => setPlatformForm({ ...platformForm, url: e.target.value })}
              placeholder="@username or instagram.com/username"
              className="w-full h-[52px] bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl px-4 text-[16px] font-semibold text-slate-900 focus:outline-none focus:border-[#7C3AED] focus:bg-white transition-all shadow-2xs"
            />
            <p className="text-[11px] text-slate-500 font-medium">Only the handle is needed to save. Add the numbers so brands can see your reach.</p>{/* v353: the numbers were marked * but weren't required */}
            {/* v352: Fetch → saved as live numbers (update every day) + fills the boxes below */}
            <InstagramFetchButton save username={platformForm.url} onFetched={(n) => setPlatformForm((f) => ({
              ...f,
              followers: n.followers ?? f.followers, reach: n.avg_views ?? f.reach,
              likes: n.avg_likes ?? f.likes, comments: n.avg_comments ?? f.comments,
            }))} />
          </div>

          {/* 2x2 Grid of Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                Followers
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={platformForm.followers}
                onChange={(e) => setPlatformForm({ ...platformForm, followers: e.target.value })}
                placeholder="e.g. 145000"
                className="w-full h-[52px] bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl px-4 text-[16px] font-semibold text-slate-900 focus:outline-none focus:border-[#7C3AED] focus:bg-white transition-all shadow-2xs"
              />
              <span className="text-[10px] text-slate-500 font-medium">Total follower count</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                Avg Reach · 30d
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={platformForm.reach}
                onChange={(e) => setPlatformForm({ ...platformForm, reach: e.target.value })}
                placeholder="e.g. 12000"
                className="w-full h-[52px] bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl px-4 text-[16px] font-semibold text-slate-900 focus:outline-none focus:border-[#7C3AED] focus:bg-white transition-all shadow-2xs"
              />
              <span className="text-[10px] text-slate-500 font-medium">Views per Reel</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                Avg Likes
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={platformForm.likes}
                onChange={(e) => setPlatformForm({ ...platformForm, likes: e.target.value })}
                placeholder="e.g. 3500"
                className="w-full h-[52px] bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl px-4 text-[16px] font-semibold text-slate-900 focus:outline-none focus:border-[#7C3AED] focus:bg-white transition-all shadow-2xs"
              />
              <span className="text-[10px] text-slate-500 font-medium">Per post</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                Avg Comments
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={platformForm.comments}
                onChange={(e) => setPlatformForm({ ...platformForm, comments: e.target.value })}
                placeholder="e.g. 120"
                className="w-full h-[52px] bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl px-4 text-[16px] font-semibold text-slate-900 focus:outline-none focus:border-[#7C3AED] focus:bg-white transition-all shadow-2xs"
              />
              <span className="text-[10px] text-slate-500 font-medium">Per post</span>
            </div>
          </div>

          {/* Live Calculated Engagement Card */}
          <div className="bg-[#F9F5FF] border border-[#EDE4FB] rounded-2xl p-4 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-[#7C3AED] uppercase tracking-wider">
                Calculated Engagement Rate
              </span>
              <span className="text-lg font-black text-[#7C3AED]">
                {Number.isFinite(Number(liveEngRate)) ? `${liveEngRate}%` : "—"}{/* v332: never "NaN%" */}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 flex justify-between">
              <span>Likes + comments: {(likesNum + commentsNum).toLocaleString('en-IN')}</span>{/* v330: en-IN like followers */}
              <span>Followers: {followersNum.toLocaleString('en-IN')}</span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium leading-relaxed pt-1 border-t border-[#DDD6FE]">
              Worked out from the numbers above — it updates as you type.{/* v332: plain words */}
            </p>
          </div>
        </div>
  );
}
