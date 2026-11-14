import React, { useEffect, useRef } from 'react';
import { Key, Wallet, UserX, Image as ImageIcon, Users, ShieldCheck, X } from 'lucide-react';
import useScrollLock from "../../lib/useScrollLock"; // v415

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
function SafetyModalBody({ isOpen, onClose, onAccept, user }) {
  // v415: page behind doesn't scroll, Escape closes, focus goes into the popup. Closing = "got it" (these are
  // just tips), so it doesn't come back on the next visit.
  const dismiss = onAccept || onClose;
  const btnRef = useRef(null);
  useScrollLock(Boolean(isOpen));
  useEffect(() => {
    if (!isOpen) return undefined;
    btnRef.current?.focus?.({ preventScroll: true });
    const onKey = (e) => { if (e.key === 'Escape') dismiss?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!isOpen) return null;

  return (
    <PopupBackdrop className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60" onClick={(e) => { if (e.target === e.currentTarget) dismiss?.(); }}>
      {/* v415: one open animation (a spring wrapper + the panel animated twice); no heavy blur behind */}
      <PopupPanel kind="modal" role="dialog" aria-modal="true" aria-labelledby="safety-tips-title"
        className="bg-[var(--bg-card)] text-[var(--text-primary)] rounded-2xl w-full max-w-md max-h-[90dvh] overflow-y-auto shadow-2xl border border-[var(--border-default)] relative p-6 sm:p-8 space-y-6">
          <button type="button" onClick={dismiss} aria-label="Close" className="absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">
            <X size={18} />
          </button>
          {/* Header Icon & Title */}
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center"><ShieldCheck size={24} /></div>{/* v415: was a warning emoji */}
            <h3 id="safety-tips-title" className="text-xl font-bold text-[var(--text-primary)]">
              Tips for a safe deal
            </h3>
          </div>

          {/* Guidelines Body */}
          <div className="space-y-4 text-sm text-[var(--text-secondary)]">
            <div className="flex items-start gap-4 pb-4 border-b border-[var(--border-default)]">
              <Key className="shrink-0 mt-0.5" size={20} />
              <span>Don't enter UPI PIN/OTP, scan unknown QR codes, or click unsafe links.</span>
            </div>

            <div className="flex items-start gap-4 pb-4 border-b border-[var(--border-default)]">
              <Wallet className="shrink-0 mt-0.5" size={20} />
              <span>Never pay or receive money outside Ybex — all payments stay safely with Ybex until the work is approved.</span>{/* v332: marketplace-classifieds wording didn't fit brand deals (brands do send products) */}
            </div>

            <div className="flex items-start gap-4 pb-4 border-b border-[var(--border-default)]">
              <UserX className="shrink-0 mt-0.5" size={20} />
              <span>Report suspicious users to Ybex.</span>
            </div>

            <div className="flex items-start gap-4 pb-4 border-b border-[var(--border-default)]">
              <ImageIcon className="shrink-0 mt-0.5" size={20} />
              <span>Don't share personal details like photos or IDs.</span>
            </div>

            <div className="flex items-start gap-4">{/* v415: no divider under the last tip */}
              <Users className="shrink-0 mt-0.5" size={20} />
              <span>Keep all deal talks, files and agreements inside this chat.</span>{/* v332: was "buyer-seller meetings" */}
            </div>
          </div>

          {/* Action Zone */}
          <div className="pt-2">
            <button
              type="button"
              ref={btnRef}
              onClick={onAccept}
              className="w-full h-11 rounded-xl font-bold text-sm bg-[#7C3AED] text-white hover:bg-[#6D28D9] transition-colors"
            >
              Continue to chat
            </button>
          </div>
      </PopupPanel>
    </PopupBackdrop>
  );
}

// Session 37: stays mounted for its closing animation.
export default function SafetyModal(props) {
  return <Presence>{props.isOpen && <SafetyModalBody key="safetymodal" {...props} />}</Presence>;
}

