import React from "react";
import { ExternalLink } from "lucide-react";
import { resolveMediaUrl } from "../../shared/VideoEmbedPreview";


// Session 49 (clean-up): moved out of ChatBox.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function ChatBoxSubmissionRecord(props) {
  const { currentThread, isUgcOrder } = props;
  // v332: with no file link the row was an <a href="#"> that just jumped the page to the top
  const hasLink = Boolean(currentThread?.content_url || currentThread?.submitted_video_url ||
    (isUgcOrder ? currentThread?.ugc_order?.video_url || currentThread?.ugc_order?.submission_link : null) || currentThread?.video_url);
  return (
    <div className="flex flex-col gap-2 text-left bg-[var(--bg-card)] p-3.5 rounded-xl border border-[var(--border-default)] text-xs shadow-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-[var(--text-secondary)] font-bold text-[11px] uppercase tracking-wider">Submission on record:</span>
                            <span className="text-[10px] text-amber-800 dark:text-amber-300 font-bold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Active Submission
                            </span>
                          </div>
                          <a
                            href={resolveMediaUrl(
                              currentThread?.content_url || 
                              currentThread?.submitted_video_url || 
                              (isUgcOrder ? currentThread?.ugc_order?.video_url || currentThread?.ugc_order?.submission_link : null) || 
                              currentThread?.video_url || 
                              "#"
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => { if (!hasLink) e.preventDefault(); }}
                            aria-disabled={!hasLink}
                            className="text-amber-800 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-100 font-semibold select-all break-all block font-mono text-xs tracking-tight hover:underline flex items-center gap-1.5 py-1.5 px-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg transition-colors"
                          >
                            <ExternalLink size={12} className="shrink-0 text-amber-700 dark:text-amber-400" />
                            <span className="truncate">
                              {(() => {
                                const raw = currentThread?.content_url || 
                                  currentThread?.submitted_video_url || 
                                  (isUgcOrder ? currentThread?.ugc_order?.video_url || currentThread?.ugc_order?.submission_link : null) || 
                                  currentThread?.video_url || "";
                                if (!raw) return isUgcOrder ? "UGC video draft uploaded" : "Campaign deliverable draft uploaded";
                                if (raw.startsWith("http://") || raw.startsWith("https://")) {
                                  return raw;
                                }
                                const cleanName = raw.split('/').pop() || raw;
                                return cleanName;
                              })()}
                            </span>
                          </a>
                        </div>
  );
}
