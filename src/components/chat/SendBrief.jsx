import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, UploadCloud } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import { calmError } from "./calmError"; // v332

import { PopupBackdrop } from "../common/Popup";
export default function SendBrief({ threadId, onClose, onSent }) {
  const [loading, setLoading] = useState(false);
  const [fileUrl, setFileUrl] = useState('');
  
  const handleSend = async () => {
    if (!fileUrl) {
       toast.error("Please provide a brief PDF URL");
       return;
    }
    setLoading(true);
    try {
      await api.post(`/chat/v2/threads/${threadId}/messages`, {
        // v414: the link used to sit in metadata the server never kept, so the creator never got it
        content: `📄 Campaign brief: ${fileUrl.trim()}`,
        text: `📄 Campaign brief: ${fileUrl.trim()}`,
        message_type: "text"
      });
      toast.success("Brief sent to creator");
      onSent();
      onClose();
    } catch (err) {
      toast.error(calmError(err, "Couldn't send the brief. Please try again.")); // v332
    } finally {
      setLoading(false);
    }
  };

  return (
    <PopupBackdrop className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl w-full max-w-md overflow-hidden relative shadow-2xl"
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
             <h3 className="text-xl font-display font-bold text-[var(--text-primary)]">Send Campaign Brief</h3>
             <button type="button" onClick={onClose} aria-label="Close" /* v332 */ className="p-2.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated)] rounded-full transition-colors"><X size={18}/></button>
          </div>

          <div className="space-y-4">
            <div className="border-2 border-dashed border-[var(--border-default)] rounded-2xl p-8 text-center bg-[var(--bg-elevated)]">
              <UploadCloud size={32} className="mx-auto text-[var(--text-tertiary)] mb-3" />
              {/* v332: said "Upload Brief PDF · Max 10MB" but there is only a link box */}
              <p className="text-sm text-[var(--text-secondary)] font-medium mb-1">Link to the brief PDF</p>
              <p className="text-xs text-[var(--text-tertiary)] mb-4">Paste a Google Drive or Dropbox link anyone can view</p>
              <input 
                type="text"
                placeholder="https://drive.google.com/…"
                aria-label="Brief PDF link"
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--violet)]"
              />
            </div>

            <button 
              type="button"
              onClick={handleSend}
              disabled={loading || !fileUrl}
              className="w-full py-3.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] disabled:opacity-50 disabled:hover:bg-[var(--violet)] text-white font-bold rounded-xl flex items-center justify-center transition-colors"
            >
              {loading ? <span className="opacity-70 animate-pulse">Sending...</span> : 'Send Brief'}
            </button>
          </div>
        </div>
      </motion.div>
    </PopupBackdrop>
  );
}
