import React from "react";
import { toast } from "sonner";
import { Clock, RefreshCw, Upload, FileVideo } from "lucide-react";


// Session 49 (clean-up): moved out of ManageUGCOrdersView.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function StageInReview(props) {
  const { fileInputRef, handleSubmitDeliverables, selectedFile, selectedOrder, setSelectedFile, setShowReuploadForm, showReuploadForm, submitting } = props;
  return <>{selectedOrder.stage === "IN_REVIEW" && (
            <div className="bg-[#F5F0FF] border border-[#DDD6FE] p-6 rounded-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#EDE9FE] text-[#6D28D9] flex items-center justify-center shrink-0">
                  <Clock size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-purple-900">Deliverable Under Brand Review</h4>
                  <p className="text-xs text-[#6D28D9]/90 leading-relaxed mt-0.5">
                    Your video deliverable was submitted! The brand is reviewing your content. You will be notified once approved or if revisions are requested.
                  </p>
                </div>
              </div>

              {/* Option to re-submit if needed */}
              <div className="pt-2 border-t border-[#DDD6FE]/60 flex items-center justify-between gap-2">
                <span className="text-xs text-[#6D28D9] font-medium">Need to update your submission?</span>
                <button
                  type="button"
                  onClick={() => setShowReuploadForm(!showReuploadForm)}
                  className="text-xs font-bold text-[var(--violet)] hover:underline cursor-pointer py-2.5 pl-3 -my-2 shrink-0" /* v332: bigger tap area */
                >
                  {showReuploadForm ? "Hide Upload Form" : "Re-upload / Update Video"}
                </button>
              </div>

              {showReuploadForm && (
                <form onSubmit={handleSubmitDeliverables} className="space-y-3 pt-2">
                  <div
                    role="button" tabIndex={0} /* v332: keyboard reachable, like the other upload box */
                    onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); fileInputRef.current?.click(); } }}
                    onClick={() => fileInputRef.current?.click()}
                    className="border border-dashed border-purple-300 bg-white rounded-xl p-4 text-center cursor-pointer"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/mp4,video/mov,video/webm,video/*"
                      onChange={(e) => {
  const file = e.target.files?.[0];
  if (file && file.size > 50 * 1024 * 1024) {
    toast.error("Please upload the file using a drive link or compress it to under 50 MB.");
    e.target.value = ""; // v332: picking the same (too big) file again did nothing
    return;
  }
  setSelectedFile(file || null);
}}
                      className="hidden"
                    />
                    {selectedFile ? (
                      <div className="flex items-center justify-center gap-2 text-xs font-bold text-purple-900 min-w-0">
                        <FileVideo size={16} className="text-[var(--violet)] shrink-0" />
                        <span className="break-all">{selectedFile.name}</span>{/* v332: long names wrapped off-screen */}
                      </div>
                    ) : (
                      <div className="text-xs text-[#6D28D9] flex items-center justify-center gap-2">
                        <Upload size={14} />
                        <span>Choose updated video file</span>
                      </div>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={submitting || !selectedFile}
                    className="w-full py-2.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {submitting ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
                    <span>Submit Update</span>
                  </button>
                </form>
              )}
            </div>
          )}</>;
}
