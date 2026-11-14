import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ShieldAlert, X, Send, CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import { calmError } from "./calmError"; // v332
import { raiseOrderTicket, ORDER_TICKET_CATEGORIES } from './orderTicket';

import { PopupBackdrop, PopupPanel } from "../common/Popup";
export default function OrderSupportModal({
  isOpen,
  onClose,
  thread,
  threadId,
  isUserBrand,
  onTicketCreated
}) {
  // v332: a creator was offered only the brand's reasons ("Creator declined changes"…) — same lists as the phone sheet now
  const categoryOptions = ORDER_TICKET_CATEGORIES[isUserBrand ? "brand" : "creator"];
  const [category, setCategory] = useState(categoryOptions[0][0]);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [successTicketId, setSuccessTicketId] = useState(null);

  if (!isOpen) return null;

  const orderId = thread?.deal_id || thread?.id || threadId || "ORD-PENDING";
  const campaignTitle = thread?.campaign_title || thread?.campaign?.title || thread?.ugc_order?.title || "Campaign Collaboration";
  const dealAmount = thread?.amount_fixed || thread?.agreed_amount || thread?.deal_amount || 0;
  
  const creatorName = thread?.creator?.name || thread?.creator_name || "Creator";
  const brandName = thread?.brand?.name || thread?.brand_name || "Brand";

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      toast.error("Please provide details about the issue.");
      return;
    }

    setLoading(true);
    try {
      // Same payload as the mobile sheet (orderTicket.js).
      const ticketId = await raiseOrderTicket(api, { thread, threadId, category, message: description });
      // No invented "TKT-ORD-…" id when the server does not return one.
      const createdId = ticketId || "raised";
      setSuccessTicketId(createdId);
      toast.success(ticketId ? `Support ticket #${ticketId} raised.` : "Support ticket raised.");
      if (onTicketCreated) onTicketCreated(createdId);
    } catch (err) {
      console.error("Failed to raise order support ticket:", err);
      toast.error(calmError(err, "Couldn't raise the ticket. Please try again.")); // v332: no raw error text
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <PopupBackdrop className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs overflow-y-auto">
        <PopupPanel kind="modal"
          className="relative w-full max-w-md bg-[var(--bg-card)] rounded-2xl shadow-2xl border border-[var(--border-default)] overflow-hidden my-6 text-left"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-[var(--border-default)] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[var(--violet-soft)] text-[var(--violet)] flex items-center justify-center shrink-0">
                <ShieldAlert size={16} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[var(--text-primary)]">
                  Help & Support
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Raise a ticket for order assistance
                </p>
              </div>
            </div>
            <button 
              type="button"
              onClick={onClose}
              aria-label="Close" /* v332: icon-only button had no label; 36px target */
              className="w-9 h-9 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--border-default)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>

          {successTicketId ? (
            <div className="p-6 text-center space-y-4">
              <div className="w-12 h-12 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h4 className="text-base font-bold text-[var(--text-primary)]">Support Ticket Raised</h4>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  {/* v332: showed "#raised" when the server sent no ticket number */}
                  {successTicketId !== "raised" ? <>Ticket Reference: <span className="font-mono font-bold text-[var(--violet)]">#{successTicketId}</span></> : "Your ticket is with the support team."}
                </p>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Our support team has received your ticket and will assist you shortly via email or notification.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-bold rounded-xl text-xs transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Order Info */}
              <div className="p-3 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] flex items-center justify-between text-xs">
                <div className="truncate pr-2">
                  <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold block">Collaboration</span>
                  <span className="font-semibold text-[var(--text-primary)] truncate block">{campaignTitle}</span>
                </div>
                <span className="text-[11px] font-mono font-bold text-[var(--violet)] shrink-0">
                  {Number(dealAmount) > 0 ? `₹${Number(dealAmount).toLocaleString('en-IN')}` : "" /* v332: no "₹0", Indian commas for text amounts */}
                </span>
              </div>

              {/* Category selector */}
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1 uppercase tracking-wider">
                  Issue Reason
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full text-xs bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-xl p-2.5 outline-none focus:border-[var(--violet)] transition-all cursor-pointer"
                >
                  {categoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1 uppercase tracking-wider">
                  Describe Issue <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide details about what needs resolution..."
                  className="w-full text-xs bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-xl p-2.5 outline-none focus:border-[var(--violet)] resize-none transition-all placeholder:text-[var(--text-tertiary)]"
                />
              </div>

              {/* Actions */}
              <div className="pt-1 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2 px-3 rounded-xl border border-[var(--border-default)] text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !description.trim()}
                  className="flex-1 py-2 px-3 rounded-xl bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Send size={13} />
                      <span>Submit Ticket</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </PopupPanel>
      </PopupBackdrop>
    </AnimatePresence>
  );
}
