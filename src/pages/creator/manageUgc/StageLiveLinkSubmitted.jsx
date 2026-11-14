import React from "react";
import { Clock, MessageCircle, Link as LinkIcon } from "lucide-react";


// Session 49 (clean-up): moved out of ManageUGCOrdersView.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function StageLiveLinkSubmitted(props) {
  const { navigate, selectedOrder } = props;
  return <>{selectedOrder.stage === "LIVE_LINK_SUBMITTED" && (
            <div className="bg-[var(--violet)]/5 border border-[var(--violet)]/25 rounded-2xl p-6 space-y-4 text-left">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--violet)]/15 border border-[var(--violet)]/30 flex items-center justify-center text-[var(--violet)] shrink-0">
                  <Clock size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-[var(--text-primary)]">Live Link Submitted — Awaiting Brand Review</h4>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1">
                    Your live post link is with the brand. Once they approve it, the payout is released to you.
                  </p>
                </div>
              </div>

              {selectedOrder.liveLink && (
                <div className="p-3 bg-[var(--bg-card)] rounded-xl border border-[var(--border-default)] flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <LinkIcon size={14} className="text-[var(--violet)] shrink-0" />
                    <span className="font-mono text-xs text-[var(--text-secondary)] truncate">{selectedOrder.liveLink}</span>
                  </div>
                  <a
                    href={selectedOrder.liveLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--violet)] hover:underline text-xs font-semibold shrink-0"
                  >
                    View ↗
                  </a>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  const targetThreadId = selectedOrder.threadId || selectedOrder.raw?.thread_id || selectedOrder.id;
                  navigate(`/creator/inbox/${targetThreadId}`);
                }}
                className="w-full py-2.5 px-4 bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl text-xs font-bold text-[var(--text-primary)] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <MessageCircle size={14} className="text-[var(--violet)]" />
                <span>Chat with Brand</span>
              </button>
            </div>
          )}</>;
}
