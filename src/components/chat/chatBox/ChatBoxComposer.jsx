import React, { useEffect, useRef } from "react";
import { Loader2, Send, Paperclip } from "lucide-react"; // v417: + Paperclip
import { toast } from "sonner"; // v417
import { chatAttachmentError, CHAT_ATTACH_ACCEPT } from "../dealState"; // v417
import GeminiIcon from "../../common/GeminiIcon";


// Session 49 (clean-up): moved out of ChatBox.jsx word for word (one section of the page).
// Everything it needs comes in as props; no logic, text or server call changed.
export default function ChatBoxComposer(props) {
  const { aiLoading, handleAiAssist, handleSend, loading, sendingRef, setText, text } = props;
  // v417: paperclip — the chat already had an upload (ChatBox handleFileUpload) with no button to reach it.
  const { fileInputRef, onFileChange, attaching = false } = props;
  const canAttach = typeof onFileChange === "function";
  const pickFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = chatAttachmentError(file);
    if (err) { toast.error(err); e.target.value = ""; return; }
    onFileChange(e);
  };
  // v414: chat text is allowed before the contract is signed (negotiation happens in chat) — on desktop too.
  // The box used to lock until I signed, then unlock while sending still failed with "Please sign the SLA Contract first".
  const locked = false;
  const boxRef = useRef(null);
  // v415: desktop — the cursor is in the message box when a chat opens (mouse/keyboard screens only, no phone keyboard pop-up)
  // v417: also when I switch to another chat (ChatBox stays mounted, so this ran only for the first chat)
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.matchMedia?.("(pointer: fine) and (min-width: 1024px)").matches) boxRef.current?.focus({ preventScroll: true });
    } catch { /* old browser */ }
  }, [props.threadId]);
  // v415: the box grows with its text (an AI-help draft was cut off in a one-line box), up to max-h-32, then scrolls
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [text]);
  return (
    <div className={`flex items-center sm:items-end gap-1 md:gap-3 rounded-2xl md:rounded-3xl bg-[var(--bg-base)] border border-[var(--border-default)] p-1 px-1.5 md:p-2 md:px-4 shadow-xs ${
                          locked ? "opacity-60 pointer-events-none" : ""
                        }`}>
                          <button 
                            type="button"
                            onClick={handleAiAssist}
                            disabled={aiLoading || locked}
                            title="AI Negotiation Assistant"
                            aria-label="AI negotiation help" /* v330: icon-only button had no label */
                            className="p-1.5 md:p-2.5 text-[var(--violet)] hover:text-white hover:bg-[var(--violet)] transition-colors rounded-full shrink-0 cursor-pointer"
                          >
                            {aiLoading ? <Loader2 size={16} className="animate-spin md:w-5 md:h-5" /> : <GeminiIcon className="w-4 h-4 md:w-5 md:h-5" />}
                          </button>
                          {canAttach && (
                            <>
                              <input ref={fileInputRef} type="file" accept={CHAT_ATTACH_ACCEPT} className="hidden" onChange={pickFile} data-testid="chat-attach-input" tabIndex={-1} aria-hidden="true" />
                              <button
                                type="button"
                                onClick={() => fileInputRef?.current?.click()}
                                disabled={attaching || locked}
                                title="Attach a photo, video or PDF (max 50 MB)"
                                aria-label="Attach file" /* v417 */
                                className="p-1.5 md:p-2.5 text-[var(--text-secondary)] hover:text-[var(--violet)] hover:bg-[var(--bg-elevated)] transition-colors rounded-full shrink-0 cursor-pointer disabled:opacity-50"
                              >
                                {attaching ? <Loader2 size={16} className="animate-spin md:w-5 md:h-5" /> : <Paperclip size={16} className="md:w-5 md:h-5" />}
                              </button>
                            </>
                          )}
                          <textarea
                            ref={boxRef}
                            value={text}
                            disabled={locked}
                            onChange={e => setText(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (!e.nativeEvent.isComposing && !sendingRef.current && !loading && text.trim()) {
                                  handleSend();
                                }
                              }
                            }}
                            placeholder="Type a message..." /* v414 */
                            className="flex-1 bg-transparent border-none focus:ring-0 text-[var(--text-primary)] placeholder-[var(--text-tertiary)] resize-none max-h-32 overflow-y-auto min-h-[34px] md:min-h-[40px] py-1.5 md:py-2.5 text-xs md:text-sm focus:outline-none"
                            rows={1}
                            aria-label="Message" /* v330 */
                          />
                          <button 
                            type="button"
                            disabled={!text.trim() || loading || locked}
                            aria-label="Send message" /* v330 */
                            onClick={() => {
                              if (!sendingRef.current && !loading && text.trim()) {
                                handleSend();
                              }
                            }}
                            className={`p-1.5 md:p-2.5 shrink-0 rounded-full transition-all flex items-center justify-center cursor-pointer
                              ${(!text.trim() || loading || locked) ? 'bg-[var(--bg-elevated)] text-[var(--text-tertiary)] opacity-60' : 'bg-[var(--violet)] text-white hover:bg-[var(--violet-hover)] shadow-xs'}`}
                          >
                            {loading ? (
                              <Loader2 size={14} className="animate-spin md:w-4 md:h-4 text-white" />
                            ) : (
                              <Send size={14} className={`md:w-4 md:h-4 ${text.trim() ? "ml-0.5" : ""}`} />
                            )}
                          </button>
                        </div>
  );
}
