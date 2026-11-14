import React from "react";
import { ExternalLink, Globe, Copy } from "lucide-react";
import { toast } from "sonner";


// Session 49 (clean-up): moved out of BrandUGCOrders.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function LiveLinkCard(props) {
  const { livePostPlatform, selectedOrder } = props;
  return (
    <div className="p-4 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-default)] space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5">
                    <Globe size={13} className="text-[#7C3AED]" />
                    <span>Live Post URL:</span>
                  </span>
                  {selectedOrder.liveLink && (
                    <button
                      type="button"
                      onClick={() => {
                        // v330: "copied" only when the copy really worked
                        (navigator.clipboard ? navigator.clipboard.writeText(selectedOrder.liveLink) : Promise.reject(new Error("no clipboard")))
                          .then(() => toast.success("Live post link copied!"))
                          .catch(() => toast.error("Couldn't copy — long-press the link to copy it."));
                      }}
                      className="text-[11px] text-[var(--violet)] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <Copy size={12} />
                      <span>Copy Link</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-[var(--bg-base)] rounded-xl border border-[var(--border-default)]">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {(() => {
                      const { Icon, tone, label } = livePostPlatform(selectedOrder.liveLink);
                      return (
                        <div className={`w-8 h-8 rounded-lg ${tone} flex items-center justify-center shrink-0`} title={label}>
                          <Icon size={18} />
                        </div>
                      );
                    })()}
                    <span className="text-xs font-semibold text-[var(--text-primary)] truncate font-mono">
                      {selectedOrder.liveLink || "No link recorded — ask the creator to resubmit"}
                    </span>
                  </div>

                  {selectedOrder.liveLink && (
                    <a
                      href={selectedOrder.liveLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
                    >
                      <ExternalLink size={14} />
                      <span>Open Live Post ↗</span>
                    </a>
                  )}
                </div>
              </div>
  );
}
