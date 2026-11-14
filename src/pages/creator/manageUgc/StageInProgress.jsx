import React from "react";
import { toast } from "sonner";
import { RefreshCw, Check, X, Upload, FileVideo } from "lucide-react";


// Session 49 (clean-up): moved out of ManageUGCOrdersView.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function StageInProgress(props) {
  const { MiniCountdown, creatorNotes, driveUrl, fileInputRef, handleSubmitDeliverables, selectedFile, selectedOrder, setCreatorNotes, setDriveUrl, setSelectedFile, submitting } = props;
  return <>{selectedOrder.stage === "IN_PROGRESS" && (
            <form onSubmit={handleSubmitDeliverables} className="space-y-4 bg-[var(--bg-elevated)] p-6 rounded-2xl border border-[var(--border-default)]">
              <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-[var(--border-default)]">
              {/* v332: the title + countdown wrap on a narrow phone instead of squashing */}
                <h4 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2 min-w-0">
                  <Upload size={16} className="text-[var(--violet)] shrink-0" />
                  Upload & Submit Video Deliverables
                </h4>
                {selectedOrder.deadline && <MiniCountdown deadline={selectedOrder.deadline} />}
              </div>

              {/* Drag & Drop File Upload Box */}
              <div>
                <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1.5">
                  Video File (MP4 / MOV / WebM)
                </label>

                <div
                  role="button" tabIndex={0} /* v330: keyboard reachable */
                        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); fileInputRef.current?.click(); } }}
                        onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[var(--border-default)] hover:border-[var(--violet)] bg-[var(--bg-card)] rounded-2xl p-6 text-center cursor-pointer transition-all hover:bg-[var(--bg-card)]/80 group"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/mov,video/webm,video/*"
                    onChange={(e) => {
  const file = e.target.files?.[0];
  if (file && file.size > 50 * 1024 * 1024) {
    toast.error("Please upload the file using a drive link or compress it to under 50 MB."); e.target.value = ""; // v330: picking the same file again did nothing
    return;
  }
  setSelectedFile(file || null);
}}
                    className="hidden"
                  />

                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <FileVideo size={28} className="text-[var(--violet)]" />
                      <div className="text-left min-w-0">{/* v330: long file names wrap instead of overflowing */}
                        <p className="text-xs font-bold text-[var(--text-primary)] break-all">{selectedFile.name}</p>
                        <p className="text-[10px] text-[var(--text-tertiary)] font-medium">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                              aria-label="Remove file" /* v330 */
                        className="w-9 h-9 flex items-center justify-center shrink-0 hover:bg-rose-50 text-rose-500 rounded-lg ml-2" /* v332: bigger tap target */
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="w-10 h-10 rounded-full bg-[var(--violet)]/10 text-[var(--violet)] flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                        <Upload size={18} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[var(--text-primary)]">Click or drag video file here to attach</p>
                        <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Max file size: 50MB (Use Drive link for larger files)</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* OR Drive Link Alternative */}
              <div>
                <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1.5">
                  OR Paste Google Drive / Frame.io / Dropbox Share Link
                </label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/file/d/..."
                  value={driveUrl}
                  onChange={(e) => setDriveUrl(e.target.value)}
                  className="w-full p-3 bg-[var(--bg-card)] rounded-xl text-base md:text-xs font-medium text-[var(--text-primary)] border border-[var(--border-default)] outline-none focus:border-[var(--violet)] transition-all" /* v332: 16px on phones (iOS zoom) */
                />
              </div>

              {/* Creator Notes */}
              <div>
                <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1.5">
                  Notes for Brand (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Add any notes regarding edits, music licensing, or hook variations..."
                  value={creatorNotes}
                  onChange={(e) => setCreatorNotes(e.target.value)}
                  className="w-full p-3 bg-[var(--bg-card)] rounded-xl text-base md:text-xs font-medium text-[var(--text-primary)] border border-[var(--border-default)] outline-none focus:border-[var(--violet)] transition-all resize-none" /* v332: 16px on phones */
                />
              </div>

              {/* Submit Deliverable Button */}
              <button
                type="submit"
                disabled={submitting || (!selectedFile && !driveUrl.trim())}
                className="w-full py-3.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] disabled:bg-[var(--border-default)] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <><RefreshCw size={16} className="animate-spin" /><span>Submitting…</span></> /* v332: say what it's doing */
                ) : (
                  <>
                    <Check size={16} />
                    <span>Submit Deliverable to Brand</span>
                  </>
                )}
              </button>
            </form>
          )}</>;
}
