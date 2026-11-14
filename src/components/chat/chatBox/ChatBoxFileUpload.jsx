import React from "react";
import { Upload, Video, X } from "lucide-react";
import { toast } from "sonner";


// Session 49 (clean-up): moved out of ChatBox.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function ChatBoxFileUpload(props) {
  const { isDraggingFile, selectedUploadFile, setIsDraggingFile, setSelectedUploadFile, videoUploadInputRef } = props;
  return (
    <div>
                          <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
                            Upload Video Deliverable (MP4, MOV, WEBM)
                          </label>
                          <input
                            type="file"
                            ref={videoUploadInputRef}
                            accept="video/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.size > 50 * 1024 * 1024) {
                                  toast.error("Please upload the file using a drive link or compress it to under 50 MB.", { id: "ugc-chat-submit" });
                                  return;
                                }
                                setSelectedUploadFile(file);
                              }
                            }}
                            className="hidden"
                          />
                          
                          {selectedUploadFile ? (
                            <div className="p-4 bg-[var(--bg-card)] border border-[#7C3AED]/30 rounded-xl flex items-center justify-between">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/10 text-indigo-400 flex items-center justify-center shrink-0">
                                  <Video size={20} />
                                </div>
                                <div className="truncate">
                                  <p className="text-xs font-bold text-[var(--text-primary)] truncate">{selectedUploadFile.name}</p>
                                  <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{(selectedUploadFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSelectedUploadFile(null)}
                                className="p-1.5 hover:bg-rose-500/10 text-rose-400 rounded-lg transition-colors cursor-pointer shrink-0 ml-2"
                                title="Remove file"
                                aria-label="Remove file" /* v332 */
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ) : (
                            <div
                              role="button" /* v332: keyboard access to the file picker */
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); videoUploadInputRef.current?.click(); } }}
                              onClick={() => videoUploadInputRef.current?.click()}
                              onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
                              onDragLeave={() => setIsDraggingFile(false)}
                              onDrop={(e) => {
                                e.preventDefault();
                                setIsDraggingFile(false);
                                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                  // v332: a dropped file skipped the 50 MB / video checks the file picker does
                                  const dropped = e.dataTransfer.files[0];
                                  if (dropped.type && !dropped.type.startsWith("video/")) {
                                    toast.error("Please drop a video file (MP4, MOV or WEBM).", { id: "ugc-chat-submit" });
                                    return;
                                  }
                                  if (dropped.size > 50 * 1024 * 1024) {
                                    toast.error("Please upload the file using a drive link or compress it to under 50 MB.", { id: "ugc-chat-submit" });
                                    return;
                                  }
                                  setSelectedUploadFile(dropped);
                                }
                              }}
                              className={`p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                                isDraggingFile ? "border-[#7C3AED] bg-[#7C3AED]/5" : "border-[var(--border-default)] hover:border-[#7C3AED]/50 bg-[var(--bg-card)]"
                              }`}
                            >
                              <div className="w-10 h-10 rounded-full bg-[#7C3AED]/10 text-indigo-400 flex items-center justify-center">
                                <Upload size={18} />
                              </div>
                              <div className="text-center">
                                <p className="text-xs font-bold text-[var(--text-primary)]">Click or drag video file here to upload</p>
                                <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Max file size: 50MB (Use Drive link for larger files)</p>
                              </div>
                            </div>
                          )}
                        </div>
  );
}
