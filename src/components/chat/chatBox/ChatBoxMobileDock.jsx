import React from "react";
import { Loader2, Send, MessageCircle, CreditCard, Video } from "lucide-react";
import GeminiIcon from "../../common/GeminiIcon";


// Session 49 (clean-up): moved out of ChatBox.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function ChatBoxMobileDock(props) {
  const { isCancelled = false /* v414 */, aiLoading, handleAiAssist, handleSend, isAgreementSigned, isBrand, isContentApproved, isContentSubmitted, isDealCompleted, isDealFixed, isLiveLinksSubmitted, isMySignatureSigned, isPaymentFunded, isRevisionDeclined, isRevisionRequested, loading, sendingRef, setShowPaymentSheet, setShowUploadSheet, setText, showPaymentSheet, showUploadSheet, text } = props;
  return (
    <div className="block md:hidden bg-[var(--bg-card)] border-t border-[var(--border-default)] px-3.5 pt-2 pb-[calc(0.625rem+env(safe-area-inset-bottom))] shrink-0 z-20 w-full shadow-lg">{/* v332: clear the iPhone home bar */}
          {/* Row 1: Mode Chips */}
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              onClick={() => {
                setShowPaymentSheet(false);
                setShowUploadSheet(false);
              }}
              className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                !showPaymentSheet && !showUploadSheet
                  ? "bg-gray-950 text-white dark:bg-white dark:text-gray-950 shadow-xs"
                  : "bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-gray-300"
              }`}
            >
              <MessageCircle size={13} />
              <span>Chat</span>
            </button>

            {isCancelled ? null /* v414: cancelled / expired order — no upload or pay chip */ : isBrand ? (
              <button
                type="button"
                onClick={() => {
                  setShowPaymentSheet(true);
                  setShowUploadSheet(false);
                }}
                className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  showPaymentSheet
                    ? "bg-gray-950 text-white dark:bg-white dark:text-gray-950 shadow-xs"
                    : "bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-gray-300"
                }`}
              >
                <CreditCard size={13} />
                <span>{!isPaymentFunded ? "Make payment" : isDealCompleted ? "Deal Completed" : isLiveLinksSubmitted ? "Review Live Links" : isContentApproved ? "Waiting for Live Link" : isRevisionDeclined ? "Changes Declined" : isRevisionRequested ? "Waiting for changes" : isContentSubmitted ? "Review Content" : "Waiting for Content"}</span>
                {!isPaymentFunded ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setShowUploadSheet(true);
                  setShowPaymentSheet(false);
                }}
                className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  showUploadSheet
                    ? "bg-gray-950 text-white dark:bg-white dark:text-gray-950 shadow-xs"
                    : "bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-gray-300"
                }`}
              >
                <Video size={13} />
                <span>{isDealCompleted ? "Completed" : isLiveLinksSubmitted ? "Links Under Review" : isContentApproved ? "Submit Links" : isContentSubmitted ? "Draft Under Review" : "Upload Content"}</span>
                {!isContentSubmitted && !isDealCompleted && !isLiveLinksSubmitted && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7C3AED] shrink-0" />
                )}
              </button>
            )}
          </div>

          {/* Row 2: Composer */}
          <div className="flex items-center gap-2">
            {/* EXISTING AI-suggestion button (GeminiIcon / aiLoading spinner) */}
            <button
              type="button"
              onClick={handleAiAssist}
              disabled={aiLoading /* v414: chat allowed before signing */}
              title="AI Negotiation Assistant"
              aria-label="AI negotiation help" /* v332: icon-only button had no label */
              className="w-10 h-10 flex items-center justify-center rounded-full bg-[#F5F0FF] dark:bg-purple-950/40 text-[var(--violet)] hover:bg-[var(--violet)] hover:text-white transition-colors shrink-0 cursor-pointer disabled:opacity-50"
            >
              {aiLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <GeminiIcon className="w-4 h-4" />
              )}
            </button>

            {/* Input field */}
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!e.nativeEvent?.isComposing && !sendingRef.current && !loading && text.trim()) { // v332: no half-word send while composing
                    handleSend();
                  }
                }
              }}
              aria-label="Message"
              disabled={false /* v414: chat allowed before signing */}
              placeholder="Type a message..." /* v414: chat allowed before signing (was "Sign the agreement first…") */
              className="flex-1 min-w-0 h-10 bg-gray-100 dark:bg-neutral-800/90 rounded-full px-4 text-base text-[var(--text-primary)] placeholder-gray-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--violet)]/40 border-0"
            />

            {/* Send button */}
            <button
              type="button"
              disabled={!text.trim() || loading /* v414 */}
              aria-label="Send message" /* v332 */
              onClick={() => {
                if (!sendingRef.current && !loading && text.trim()) {
                  handleSend();
                }
              }}
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                text.trim() && !loading /* v414 */
                  ? "bg-gray-950 text-white dark:bg-white dark:text-gray-950 hover:opacity-90 shadow-xs"
                  : "bg-gray-200 dark:bg-neutral-800 text-gray-500 dark:text-neutral-500 cursor-not-allowed"
              }`}
            >
              {loading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Send size={14} className={text.trim() ? "ml-0.5" : ""} />
              )}
            </button>
          </div>
        </div>
  );
}
