import React from "react";
import { PlayCircle, Upload, ExternalLink } from "lucide-react";
import { toast } from "sonner"; // v353


// Session 49 (clean-up): moved out of CreatorUGCMobile.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function SubmitDeliverableSection(props) {
  const { creatorNotes, fileInputRef, isCollab, liveLinkUrl, selectedOrder, setCreatorNotes, setLiveLinkUrl, setVideoDriveUrl, setVideoFile, uploadProgress, videoDriveUrl, videoFile } = props;
  return <>{!selectedOrder.linkPhase && (
          <div className="bg-white border border-[#E2E8F0] rounded-[18px] p-3.5 shadow-xs flex flex-col gap-2.5">
            <div className="font-bold text-[10.5px] tracking-[0.8px] uppercase text-[#6B7280]">
              Submit deliverable
            </div>

            {/* Drop MP4/MOV File Picker */}
            <div
              role="button" /* v330: keyboard / screen-reader reachable file picker */
              tabIndex={0}
              aria-label={videoFile ? "Change video file" : "Choose video file"}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
              onClick={() => fileInputRef.current?.click()}
              className="border-[1.5px] border-dashed border-[#DDD0FF] rounded-[14px] bg-[#FBF9FF] p-[11px_12px] flex items-center gap-3 cursor-pointer hover:border-[#7C3AED] transition-colors"
            >
              <div className="w-[38px] h-[38px] rounded-[12px] bg-[#F5F0FF] flex items-center justify-center text-[#7C3AED] shrink-0">
                <Upload size={17} strokeWidth={2.4} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[12.5px] text-[#0A0A0A] truncate">
                  {videoFile ? videoFile.name : "Drop MP4 / MOV"}
                </div>
                <div className="mt-0.5 text-[10.5px] text-[#6B7280]">
                  {videoFile
                    ? `${(videoFile.size / (1024 * 1024)).toFixed(1)} MB · Ready to upload`
                    : "Up to 50MB · 1080p+"}
                </div>
              </div>
              <div className="h-[32px] px-3.5 rounded-[10px] bg-[#7C3AED] flex items-center font-bold text-[12px] text-white shrink-0">
                {videoFile ? "Change" : "Browse"}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  // v353: a bigger file uploaded slowly, then failed with a vague message. Say it up front.
                  if (f.size > 50 * 1024 * 1024) {
                    toast.error(`This video is ${Math.round(f.size / (1024 * 1024))} MB — the limit is 50 MB. Paste a Google Drive link below instead.`, { duration: 7000 });
                    e.target.value = "";
                    return;
                  }
                  setVideoFile(f);
                }}
              />
            </div>

            {/* Paste Drive Link Input */}
            <div className="h-[46px] rounded-[13px] border border-[#E2E8F0] bg-[#FBFBFD] flex items-center gap-2.5 px-3 focus-within:border-[#7C3AED] transition-colors">
              <ExternalLink size={15} className="text-[#ABABAB] shrink-0" />
              <input
                type="url"
                placeholder="Paste Google Drive / Dropbox link"
                value={videoDriveUrl}
                onChange={(e) => setVideoDriveUrl(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-[16px] text-[#0A0A0A] placeholder-[#ABABAB]" /* v332: 16px so iPhone doesn't zoom in */
              />
            </div>

            {/* Paste Live Link (if collaboration) */}
            {isCollab && (
              <div className="h-[46px] rounded-[13px] border border-[#E2E8F0] bg-[#FBFBFD] flex items-center gap-2.5 px-3 focus-within:border-[#7C3AED] transition-colors">
                <PlayCircle size={15} className="text-[#7C3AED] shrink-0" />
                <input
                  type="url"
                  placeholder="Paste live Instagram Reel link (https://...)"
                  value={liveLinkUrl}
                  onChange={(e) => setLiveLinkUrl(e.target.value)}
                  className="w-full bg-transparent border-none outline-none text-[16px] text-[#0A0A0A] placeholder-[#ABABAB]" /* v332: 16px so iPhone doesn't zoom in */
                />
              </div>
            )}

            {/* Creator Notes Input */}
            <div className="h-[46px] rounded-[13px] border border-[#E2E8F0] bg-[#FBFBFD] flex items-center gap-2.5 px-3 focus-within:border-[#7C3AED] transition-colors">
              <span className="text-[#ABABAB] font-bold text-base leading-none shrink-0">+</span>
              <input
                type="text"
                placeholder="Add creator notes (optional)"
                value={creatorNotes}
                onChange={(e) => setCreatorNotes(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-[16px] text-[#0A0A0A] placeholder-[#ABABAB]" /* v332: 16px so iPhone doesn't zoom in */
              />
            </div>

            {uploadProgress > 0 && (
              <div className="mt-1">
                <div className="flex justify-between text-[11px] font-bold text-[#7C3AED] mb-1">
                  <span>Uploading video...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1.5 w-full bg-[#EDE4FF] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#7C3AED] transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          )}</>;
}
