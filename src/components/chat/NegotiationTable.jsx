import React, { useState, useEffect } from 'react';
import { formatAmount } from "../../utils/safeFormat";
import { motion } from 'framer-motion';
import { X, Check, Save, Plus, Trash2, Flame, ShieldCheck, Lock, Scale } from 'lucide-react';
import { drawerMotion } from "../../lib/motion"; // v415: same slide as other side panels (no springy overshoot)
import { api } from '../../lib/api';
import { toast } from 'sonner';
import { calmError } from "./calmError"; // v332

export default function NegotiationTable({ thread, onClose, role, onActionComplete, locked = false }) {
  const isBrand = role === 'brand';
  // `locked` is set by ChatBox once THIS user has signed the partnership contract on a
  // campaign thread. View-only from that point: no edits, no counter, no accept. The
  // server enforces the same rule (see negotiationLockedFor in deals_chat_routes.ts),
  // so this is purely so the UI does not offer buttons that will be refused.
  // v414: say who signed (the old text always said "You have signed", even when it was the other side).
  const signedBy = thread?.agreement_signed_brand && thread?.agreement_signed_creator ? 'both sides'
    : thread?.agreement_signed_brand ? 'the brand' : thread?.agreement_signed_creator ? 'the creator' : null;
  const lockNotice = signedBy
    ? `The contract has been signed by ${signedBy}, so the price is locked.`
    : "This deal is already funded or in progress, so the price is locked.";
  const [loading, setLoading] = useState(false);
  const [activeOffer, setActiveOffer] = useState(null);
  // v415: Escape closes the panel
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  
  // Local editable state for proposing new rates
  const [items, setItems] = useState([]);
  // v414: same default as the server (campaignGuards revisionAllowance = 5); 0 is a real value.
  const threadRevisions = (thread?.revision_count !== undefined && thread?.revision_count !== null && thread?.revision_count !== '' && Number.isFinite(Number(thread?.revision_count)))
    ? Number(thread.revision_count) : 5;
  const [revisions, setRevisions] = useState(threadRevisions);
  const [deadlineDays, setDeadlineDays] = useState(7);
  // v414: revisions / delivery days are sent only if the user changed them — the 7-day default used to reset the
  // deal deadline to accept + 7 days on every counter.
  const [revisionsTouched, setRevisionsTouched] = useState(false);
  const [deadlineTouched, setDeadlineTouched] = useState(false);

  // Load existing breakdown or seed from thread deliverables
  useEffect(() => {
    if (thread) {
      // Fetch latest pending offer for this thread if any
      loadLatestOffer();
      
      if (thread.breakdown && Array.isArray(thread.breakdown) && thread.breakdown.length > 0) {
        setItems(thread.breakdown.map((item, idx) => ({
          id: item.id || String(idx),
          name: item.name || item.item || 'Deliverable',
          qty: item.qty || 1,
          rate: item.rate || 0
        })));
      } else {
        // Build items dynamically based on thread.amount_fixed and thread.deliverables
        const campaignPrice = thread.amount_fixed || 3000;
        const deliverablesList = (thread.deliverables && thread.deliverables.length > 0)
          ? thread.deliverables
          : ['Campaign Deliverable & Scope Contract'];

        // Distribute campaignPrice across deliverablesList
        const count = deliverablesList.length;
        const baseRate = Math.floor(campaignPrice / count);
        const remainder = campaignPrice - (baseRate * count);

        const seeded = deliverablesList.map((del, idx) => {
          return {
            id: String(idx),
            name: typeof del === 'object' && del ? (del.title || del.type || del.name || 'Deliverable') : String(del), // v332: object items showed "[object Object]"
            qty: 1,
            rate: idx === count - 1 ? (baseRate + remainder) : baseRate
          };
        });
        setItems(seeded);
      }
      
      setRevisions(threadRevisions); // v414: 0 allowed
      setRevisionsTouched(false); // v414: back to the thread's value = not changed
    }
  }, [thread]);

  const loadLatestOffer = async () => {
    try {
      const { data } = await api.get(`/chat/v2/threads/${thread.id}/messages`);
      if (data && Array.isArray(data)) {
        const counterPending = String(thread?.flow_state || '').toUpperCase() === 'NEGOTIATING_COUNTER'; // v414
        // Find latest message of type 'offer' or 'negotiation_offer'
        const offerMsgs = data.filter(m => 
          (m.message_type === 'offer' && m.metadata && m.metadata.status === 'PENDING') ||
          m.message_type === 'negotiation_offer'
        );
        if (offerMsgs.length > 0) {
          const latestMsg = offerMsgs[offerMsgs.length - 1];
          const latestOffer = latestMsg.metadata?.proposed_amount 
            ? {
                id: latestMsg.id || latestMsg.message_id,
                amount: latestMsg.metadata.proposed_amount,
                offered_by: latestMsg.sender_id || latestMsg.sender_user_id || thread?.creator_id,
                status: 'PENDING',
                breakdown: latestMsg.metadata?.breakdown,
                revision_count: latestMsg.metadata?.revision_count, // v414: terms sent with the counter
                delivery_days: latestMsg.metadata?.delivery_days
              }
            : (latestMsg.metadata || {});
          // v414: a counter that was declined on the server is no longer pending.
          const latestAt = new Date(latestMsg.created_at || 0).getTime() || 0;
          const declinedAfter = data.some(m => m?.metadata?.action === 'counter_offer_declined' && (new Date(m.created_at || 0).getTime() || 0) >= latestAt);
          // v414: Accept / Decline only while the server has a counter waiting (an accepted counter answered 409 NO_COUNTER_PENDING).
          setActiveOffer(declinedAfter || !counterPending ? null : latestOffer);
          
          if (latestOffer.breakdown && Array.isArray(latestOffer.breakdown)) {
            setItems(latestOffer.breakdown);
          } else if (latestOffer.amount) {
            setItems([{
              id: 'counter_0',
              name: 'Campaign Deliverables & Scope',
              qty: 1,
              rate: latestOffer.amount
            }]);
          }
        } else if (counterPending && thread?.counter_amount) { // v414: case-insensitive
          setActiveOffer({
            id: 'thread_counter',
            amount: thread.counter_amount,
            offered_by: thread.creator_id,
            status: 'PENDING'
          });
        } else {
          setActiveOffer(null);
        }
      }
    } catch (err) {
      console.error("Error loading offer:", err);
    }
  };

  // Calculations
  const subtotal = items.reduce((acc, curr) => acc + (curr.qty * curr.rate), 0);
  // Session 36: brands pay the agreed amount only (zero platform fee for brands); the Ybex fee is taken
  // from the creator's side and shown exactly on the offer card / agreement before signing. The old
  // hard-coded "+2% platform service charge" here showed brands a total they were never charged.
  const brandTotal = subtotal;

  // Add Row
  const handleAddRow = () => {
    if (locked) { toast.error(lockNotice); return; }
    setItems([...items, {
      id: String(Date.now()),
      name: 'Custom Deliverable',
      qty: 1,
      rate: 3000
    }]);
  };

  // Remove Row
  const handleRemoveRow = (id) => {
    if (locked) { toast.error(lockNotice); return; }
    if (items.length <= 1) {
      toast.error("You must have at least one deliverable in the negotiation table.");
      return;
    }
    setItems(items.filter(item => item.id !== id));
  };

  // Handle Input Changes
  const handleItemChange = (id, field, value) => {
    if (locked) return;
    setItems(items.map(item => {
      if (item.id === id) {
        return {
          ...item,
          [field]: field === 'name' ? value : Math.max(0, parseInt(value) || 0)
        };
      }
      return item;
    }));
  };

  // Submit Propose/Counter Offer
  const handlePropose = async () => {
    if (locked) { toast.error(lockNotice); return; }
    if (subtotal <= 0) {
      toast.error("Subtotal must be greater than zero.");
      return;
    }

    setLoading(true);
    try {
      const response = await api.post(`/campaign/threads/${thread.id}/creator-negotiate`, {
        counter_amount: subtotal,
        ...(revisionsTouched ? { revision_count: revisions } : {}), // v414: only if changed (stored with the counter, written to the deal on accept)
        ...(deadlineTouched ? { delivery_days: deadlineDays } : {}), // v414: only if changed — else the deadline stays as it is
        breakdown: items // v414: line items shown on the counter card (server keeps them only if they add up)
      });

      toast.success("New counter negotiation proposal sent! 🚀", {
        description: `Counter offer of ₹${subtotal.toLocaleString('en-IN')} logged in thread.`
      });
      
      if (onActionComplete) onActionComplete(response.data);
      loadLatestOffer();
      if (onClose) onClose();
    } catch (err) {
      toast.error(calmError(err, "Couldn't send your rates. Please try again.")); // v332: no raw error text
    } finally {
      setLoading(false);
    }
  };

  // Accept pending offer
  const handleAcceptOffer = async () => {
    if (locked) { toast.error(lockNotice); return; }
    setLoading(true);
    try {
      // v414: send the amount on screen so the server can refuse a stale card (409 STALE_OFFER)
      const response = await api.post(`/campaign/threads/${thread.id}/brand-accept-counter`, Number(activeOffer?.amount) > 0 ? { counter_amount: Number(activeOffer.amount) } : {});
      toast.success("Negotiation accepted & fixed successfully! 🤝");
      if (onActionComplete) onActionComplete(response.data);
      onClose();
    } catch (err) {
      toast.error(calmError(err, "Couldn't accept the offer. Please try again.")); // v332
    } finally {
      setLoading(false);
    }
  };

  // Reject pending offer
  // v414: decline on the server (it used to clear only this screen; the counter stayed pending for both sides).
  const handleRejectOffer = async () => {
    if (locked) { toast.error(lockNotice); return; }
    setLoading(true);
    try {
      const response = await api.post(`/chat/v2/threads/${thread.id}/decline-counter`, Number(activeOffer?.amount) > 0 ? { counter_amount: Number(activeOffer.amount) } : {});
      setActiveOffer(null);
      toast.info("Proposal declined. You can propose your counter rates below.");
      if (onActionComplete) onActionComplete(response.data);
    } catch (err) {
      toast.error(calmError(err, "Couldn't decline the offer. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>{/* v415: no own AnimatePresence — the parent's one now plays the closing slide (it vanished instantly) */}
      <motion.div 
        {...drawerMotion}
        role="dialog"
        aria-label="Negotiate terms"
        className="absolute right-0 top-0 bottom-0 w-[420px] max-w-full bg-[var(--bg-card)] border-l border-[var(--border-default)] z-30 flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 flex justify-between items-center border-b border-[var(--border-default)] bg-[var(--bg-elevated)]/20">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center shrink-0"><Scale size={16} /></span>{/* v415: was a 📊 emoji */}
            <div>
              <h3 className="font-bold text-sm text-[var(--text-primary)] leading-tight">Negotiate terms</h3>
              <span className="text-[11px] text-[var(--text-secondary)] block">
                Deliverables, rates and timeline
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" /* v332 */ className="w-10 h-10 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded-full hover:bg-[var(--bg-elevated)] transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 no-scrollbar">
          
          {/* Active Status Display */}
          {activeOffer && (
            <div className={`p-4 rounded-2xl border ${activeOffer.offered_by === thread.creator_id && isBrand || activeOffer.offered_by === thread.brand_id && !isBrand ? 'bg-amber-500/10 border-amber-500/20' : 'bg-[var(--bg-elevated)] border-[var(--border-default)]'}`}>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-500/20 rounded-xl text-amber-400 shrink-0 mt-0.5">
                  <Flame size={16} />
                </div>
                <div className="space-y-2 flex-1">
                  <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                    {activeOffer.offered_by === thread.creator_id ? 'Creator sent a counter offer' : 'Brand sent an offer' /* v415 */}
                  </h4>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    An itemized offer of <strong className="text-[var(--text-primary)]">₹{formatAmount(activeOffer.amount)}</strong> is waiting for a reply. Accepting it updates the contract terms.
                  </p>
                  {/* v414: terms sent with this counter */}
                  {(activeOffer.revision_count !== undefined && activeOffer.revision_count !== null) || activeOffer.delivery_days ? (
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      {activeOffer.revision_count !== undefined && activeOffer.revision_count !== null ? `${activeOffer.revision_count} revision${Number(activeOffer.revision_count) === 1 ? '' : 's'} included` : null}
                      {activeOffer.revision_count !== undefined && activeOffer.revision_count !== null && activeOffer.delivery_days ? ' · ' : null}
                      {activeOffer.delivery_days ? `Delivery within ${activeOffer.delivery_days} day${Number(activeOffer.delivery_days) === 1 ? '' : 's'}` : null}
                    </p>
                  ) : null}
                  
                  {activeOffer.offered_by !== (isBrand ? thread.brand_id : thread.creator_id) ? (
                    <div className="flex gap-2 pt-1">
                      <button 
                        hidden={locked}
                        onClick={handleRejectOffer}
                        disabled={loading}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Decline
                      </button>
                      <button 
                        hidden={locked}
                        onClick={handleAcceptOffer}
                        disabled={loading}
                        className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-[11px] rounded-lg transition-colors flex items-center gap-1 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Check size={12} /> Accept offer
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-amber-700 font-medium">
                      Waiting for the other side to reply{/* v415: was "⏳ Awaiting counter response from partner..." */}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {locked && (
            <div className="p-3.5 bg-[var(--bg-elevated)]/50 border border-[var(--border-default)] rounded-2xl flex items-start gap-2.5">
              <Lock size={15} className="text-[var(--text-tertiary)] shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                <p className="font-bold text-[var(--text-primary)]">Negotiation locked</p>
                <p className="text-[var(--text-secondary)]">
                  {lockNotice} {/* v414: accurate wording */}
                  Contact support if the agreed terms genuinely need to change.
                </p>
              </div>
            </div>
          )}

          {/* Table Container */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-extrabold tracking-widest">
                Deliverables & rates
              </span>
              {!locked && (
                <button 
                  onClick={handleAddRow}
                  className="text-[11px] text-[var(--violet)] hover:text-indigo-400 font-bold flex items-center gap-1"
                >
                  <Plus size={12} /> Add Item
                </button>
              )}
            </div>

            {/* Table Header & Rows */}
            <div className="bg-[var(--bg-elevated)]/40 border border-[var(--border-default)] rounded-2xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-[var(--border-default)] bg-[var(--bg-elevated)]/60 text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
                <div className="col-span-6">Deliverable</div>
                <div className="col-span-2 text-center">Qty</div>
                <div className="col-span-3 text-right">Rate</div>
                <div className="col-span-1"></div>
              </div>

              <div className="divide-y divide-[var(--border-default)]">
                {items.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-[var(--bg-elevated)]/20 transition-all">
                    {/* Item Name */}
                    <div className="col-span-6">
                      <input 
                        type="text" 
                        value={item.name}
                        readOnly={locked}
                        disabled={locked}
                        onChange={(e) => handleItemChange(item.id, 'name', e.target.value)}
                        aria-label="Deliverable"
                        className="w-full bg-transparent border-none text-[16px] md:text-xs text-[var(--text-primary)] font-medium focus:ring-0 focus:outline-none p-0"
                        placeholder="e.g. YouTube Ded. video"
                      />
                    </div>
                    {/* Quantity */}
                    <div className="col-span-2">
                      <input 
                        type="number" 
                        value={item.qty}
                        readOnly={locked}
                        disabled={locked}
                        onChange={(e) => handleItemChange(item.id, 'qty', e.target.value)}
                        aria-label="Quantity"
                        inputMode="numeric"
                        className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded-lg text-center text-[16px] md:text-xs py-1 focus:ring-1 focus:ring-[var(--violet)] focus:outline-none"
                        min="1"
                      />
                    </div>
                    {/* Rate */}
                    <div className="col-span-3 relative">
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-tertiary)]">₹</span>
                      <input 
                        type="number" 
                        value={item.rate}
                        readOnly={locked}
                        disabled={locked}
                        onChange={(e) => handleItemChange(item.id, 'rate', e.target.value)}
                        aria-label="Rate in rupees"
                        inputMode="numeric"
                        className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded-lg pl-4 pr-1 py-1 text-right text-[16px] md:text-xs focus:ring-1 focus:ring-[var(--violet)] focus:outline-none font-mono"
                        min="0"
                      />
                    </div>
                    {/* Trash Action */}
                    <div className="col-span-1 flex justify-end">
                      {!locked && (
                        <button 
                          type="button"
                          onClick={() => handleRemoveRow(item.id)}
                          aria-label="Remove this row" /* v332: icon-only button had no label */
                          className="p-1.5 text-[var(--text-tertiary)] hover:text-rose-500 rounded transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Timeline and Revision Counts */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] text-[var(--text-tertiary)] uppercase font-extrabold tracking-widest block">Revisions included</label>
              <input 
                type="number" 
                aria-label="Revisions included" 
                value={revisions}
                readOnly={locked}
                disabled={locked}
                onChange={e => { setRevisionsTouched(true); /* v414 */ setRevisions(Math.min(20, Math.max(0, parseInt(e.target.value) || 0))); }} /* v414: 0 is valid, server max 20 */
                className="w-full bg-[var(--bg-elevated)]/40 border border-[var(--border-default)] rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--violet)]"
                min="0"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-[var(--text-tertiary)] uppercase font-extrabold tracking-widest block">Delivery within (days)</label>
              <input 
                type="number" 
                aria-label="Delivery within (days)" 
                value={deadlineDays}
                readOnly={locked}
                disabled={locked}
                onChange={e => { setDeadlineTouched(true); /* v414 */ setDeadlineDays(Math.min(365, Math.max(1, parseInt(e.target.value) || 1))); }} /* v414: server range 1-365 */
                className="w-full bg-[var(--bg-elevated)]/40 border border-[var(--border-default)] rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--violet)]"
                min="1"
              />
            </div>
          </div>

          {/* Final Live Breakdown Calculator */}
          <div className="bg-[var(--bg-elevated)]/30 border border-[var(--border-default)] rounded-2xl p-4.5 space-y-3.5">
            <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-extrabold tracking-widest block">
              Summary
            </span>

            <div className="space-y-2 text-xs">{/* v415: was font-serif */}
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>Deliverables subtotal</span>
                <span className="font-mono font-bold text-[var(--text-primary)]">₹{subtotal.toLocaleString('en-IN')}</span>
              </div>
              
              {isBrand ? (
                <>
                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>Platform fee for brands</span>
                    <span className="font-mono text-emerald-500">₹0</span>
                  </div>
                  <div className="pt-2 border-t border-[var(--border-default)] flex justify-between text-sm font-bold">
                    <span className="text-[var(--text-primary)]">Total you pay</span>{/* v332: was "Total Brand Secure Payment Hold Bond" */}
                    <span className="font-mono text-[var(--violet)]">₹{brandTotal.toLocaleString('en-IN')}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>Convenience fee & TDS (taken from this amount):</span>{/* v330: fee label (Ravi) */}
                    <span className="font-mono text-[var(--text-secondary)]">exact amount on the offer card before you sign</span>
                  </div>
                  <div className="pt-2 border-t border-[var(--border-default)] flex justify-between text-sm font-bold">
                    <span className="text-[var(--text-primary)]">Deal amount (before Convenience fee & TDS):</span>
                    <span className="font-mono text-[var(--violet)]">₹{subtotal.toLocaleString('en-IN')}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Indian Judicial System & Udaipur Escrow Guarantee */}
          <div className="p-3.5 bg-indigo-950/20 border border-[#7C3AED]/10 rounded-2xl text-[10px] text-[var(--text-secondary)] leading-relaxed flex items-start gap-2.5 shadow-sm">
            <ShieldCheck size={16} className="text-indigo-400 shrink-0 mt-0.5" />
            <p>
              Sending new terms is a formal offer under the <strong>IT Act, 2000</strong>. Once the other side accepts, these terms replace the earlier ones.{/* v415: plainer wording */}
            </p>
          </div>
        </div>

        {/* Propose Action Footer Button */}
        <div className="p-5 border-t border-[var(--border-default)] bg-[var(--bg-card)] shrink-0 flex items-center justify-between">
          <span />{/* v415: removed the always-spinning live-feed badge (nothing was live) */}
          {locked ? (
            <span className="px-4 py-2.5 rounded-xl font-bold text-[11px] bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-tertiary)] flex items-center gap-1.5">
              <Lock size={12} /> {signedBy ? 'Signed' : 'Locked'} · view only {/* v414 · v415: no all-caps */}
            </span>
          ) : (
            <button 
              onClick={handlePropose}
              disabled={loading || subtotal === 0}
              className="px-5 py-3 rounded-xl font-bold text-xs shadow-lg transition-colors flex items-center gap-1.5 bg-[var(--violet)] text-white hover:bg-[var(--violet-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save size={14} /> {loading ? 'Sending…' : 'Send new terms' /* v415: no all-caps mono */}
            </button>
          )}
        </div>

      </motion.div>
    </>
  );
}
