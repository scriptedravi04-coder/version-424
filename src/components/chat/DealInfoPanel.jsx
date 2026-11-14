import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { drawerMotion } from "../../lib/motion"; // v415
import { X, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import { deliverableItemLabel } from '../../utils/safeFormat'; // v415
import { deriveDealState } from './dealState'; // v415: M9 funded = "Creator working" step

// v415: M9 plain step names (were enum caps like "CONTENT SUBMITTED") and every server state mapped to a step.
const STEPS = [
  { id: 'NEGOTIATING', label: 'Agreeing terms' },
  { id: 'ACTIVE', label: 'Payment & work' },
  { id: 'CONTENT_SUBMITTED', label: 'Draft in review' },
  { id: 'APPROVED', label: 'Draft approved & posted' },
  { id: 'COMPLETED', label: 'Completed' },
];
const STEP_OF = { SUBMITTED: 'CONTENT_SUBMITTED', IN_REVIEW: 'CONTENT_SUBMITTED', REVISION_REQUESTED: 'ACTIVE', REVISION_REQ: 'ACTIVE', CHANGES_REQUESTED: 'ACTIVE', REVISION_DECLINED: 'CONTENT_SUBMITTED', CONTENT_APPROVED: 'APPROVED', AWAITING_LIVE_LINK: 'APPROVED', PROOF_SUBMITTED: 'APPROVED', LIVE_LINK_SUBMITTED: 'APPROVED', LIVE_LINKS_SUBMITTED: 'APPROVED', LINKS_UNDER_REVIEW: 'APPROVED', REVISION_REQUESTED_LINKS: 'APPROVED', REVISION_DECLINED_LINKS: 'APPROVED', AI_AGREEMENT_READY: 'NEGOTIATING', NEGOTIATING_COUNTER: 'NEGOTIATING', AGREEMENT_SIGNED: 'NEGOTIATING', AWAITING_SIGNATURE: 'NEGOTIATING', PAYMENT_PENDING: 'ACTIVE', AWAITING_PAYMENT: 'ACTIVE', SIGNED: 'ACTIVE', CONTRACT_SIGNED: 'ACTIVE', IN_PROGRESS: 'ACTIVE', ESCROW_FUNDED: 'ACTIVE', ESCROW_HELD: 'ACTIVE', ESCROW_PAID: 'ACTIVE', FUNDED: 'ACTIVE', PAYMENT_HELD: 'ACTIVE', PAYMENT_SECURED: 'ACTIVE', RELEASED: 'COMPLETED', PAID: 'COMPLETED', CLOSED: 'COMPLETED' };
export function dealInfoStep(thread) {
  const raw = String(thread?.flow_state || thread?.status || 'NEGOTIATING').toUpperCase();
  let step = STEP_OF[raw] || raw;
  if (!STEPS.some((x) => x.id === step)) step = String(thread?.status || '').toUpperCase(); // unknown flow → table status
  step = STEP_OF[step] || step;
  if (!STEPS.some((x) => x.id === step)) step = null;
  try {
    const f = deriveDealState({ thread, messages: [], isBrand: false });
    if (f.isCancelled) return 'CANCELLED'; // no step is current
    if (f.isDealCompleted) return 'COMPLETED';
    if (f.isPaymentFunded && (!step || step === 'NEGOTIATING')) return 'ACTIVE';
  } catch { /* keep the mapped step */ }
  return step || 'NEGOTIATING';
}
const STATUS_TEXT = { CANCELLED: 'Closed', NEGOTIATING: 'Agreeing terms', ACTIVE: 'Deal active', CONTENT_SUBMITTED: 'Draft in review', APPROVED: 'Draft approved', COMPLETED: 'Completed' };

export default function DealInfoPanel({ thread, onClose, role }) {
  // v415: M9 Escape closes the panel (it ignored the keyboard)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof onClose !== 'function') return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!thread) return null;
  const currentStage = dealInfoStep(thread); // v415

  return (
    <>{/* v415: the parent's AnimatePresence plays the closing slide (an own one here made it vanish instantly) */}
      <motion.div 
        {...drawerMotion}
        role="dialog"
        aria-label="Deal information"
        className="absolute right-0 top-0 bottom-0 w-full md:w-80 bg-[var(--bg-card)] border-l border-[var(--border-default)] z-50 md:z-20 flex flex-col"
      >
        <div className="p-3 md:p-5 flex justify-between items-center border-b border-[var(--border-default)]">
          <h3 className={'text-sm md:text-base font-bold'}>Deal Information</h3>
          <button type="button" onClick={onClose} aria-label="Close deal information" /* v332 */ className="w-10 h-10 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded-full hover:bg-[var(--bg-elevated)] transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 md:p-5 space-y-4 md:space-y-6">
          <div className="text-center bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl md:rounded-2xl p-4 md:p-5">
             <div className={`text-[10px] font-bold uppercase tracking-wider mb-2`}>Agreed Amount</div>
             <div className={`font-mono font-bold tracking-tight text-lg text-[var(--violet)]`}>
               {/* v332: "₹0" before an amount was agreed (and the fixed amount was ignored) */}
               {Number(thread.agreed_amount || thread.amount_fixed) > 0 ? `₹${Number(thread.agreed_amount || thread.amount_fixed).toLocaleString("en-IN")}` : "Not agreed yet"}
             </div>
             <div className="mt-3 inline-block">
               <Badge variant={currentStage === 'COMPLETED' ? 'COMPLETED' : (thread.flow_state || thread.status || "review")}>{STATUS_TEXT[currentStage] || 'In progress' /* v415: M9 plain words (showed "ESCROW FUNDED") */}</Badge>
             </div>
          </div>

          <div>
             <h4 className={`text-base font-bold mb-3`}>Timeline</h4>
             <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-[var(--border-strong)] before:to-transparent">
                {STEPS.map(({ id: step, label }, idx) => {
                  const isActive = currentStage === step;
                  const isPast = STEPS.findIndex((x) => x.id === currentStage) > idx;

                  return (
                    <div key={step} className="relative flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 ${isPast || isActive ? 'bg-[var(--violet)] border-[var(--violet)]' : 'bg-[var(--bg-elevated)] border-[var(--border-default)]'} z-10 shrink-0 shadow max-md:ml-[2px]`}>
                         {(isPast || isActive) && <CheckCircle size={12} className="text-white" />}
                      </div>
                      <div aria-current={isActive ? 'step' : undefined} className={isActive ? 'font-bold text-sm text-[var(--text-primary)]' : (isPast ? 'text-sm text-[var(--text-secondary)]' : 'text-sm text-[var(--text-secondary)]')}>
                        {label}
                      </div>
                    </div>
                  );
                })}
             </div>
          </div>

          <div className="bg-[var(--bg-elevated)] rounded-xl md:rounded-2xl p-3 md:p-4 border border-[var(--border-default)]">
             <div className="flex justify-between items-center mb-2 md:mb-3">
               <span className={'text-sm text-gray-500'}>Deadline</span>
               <span className={'font-mono tracking-tight text-sm'}>{thread.deadline && !Number.isNaN(new Date(thread.deadline).getTime()) ? new Date(thread.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" /* v332: IST */ }) : 'TBD'}</span>
             </div>
             <div className="flex justify-between items-center mb-3">
               <span className={'text-sm text-gray-500'}>Revisions</span>
               {/* Session 58 (bug hunt): revision_count is the ALLOWANCE (never goes down) — it said "Revisions Left: 5" for ever. */}
               <span className={'font-mono tracking-tight text-sm'}>{thread.revision_count != null ? `${thread.revisions_used != null ? `${Math.max(0, Number(thread.revision_count) - Number(thread.revisions_used))} left of ` : ""}${thread.revision_count}` : 'N/A'}</span>
             </div>
             <div className="pt-3 border-t border-[var(--border-default)]">
               <span className={`text-[10px] font-bold uppercase tracking-wider block mb-2`}>Deliverables</span>
               <ul className="space-y-2">
                 {/* v332: an empty list showed nothing at all, and object items crashed / showed [object Object] */}
                 {Array.isArray(thread.deliverables) && thread.deliverables.length > 0 ? thread.deliverables.map((d, i) => (
                   <li key={i} className={`text-sm text-gray-500 flex items-start gap-2`}>
                     <CheckCircle size={14} className="text-[var(--violet)] opacity-80 shrink-0 mt-0.5" />
                     <span className="min-w-0 break-words">{deliverableItemLabel(d) || (d && typeof d === "object" ? String(d.title || "") : "") /* v415: shared label (count × type) */}</span>
                   </li>
                 )) : <li className={'text-[11px] font-medium'}>As agreed in the chat</li>}
               </ul>
             </div>
          </div>

        </div>
      </motion.div>
    </>
  );
}
