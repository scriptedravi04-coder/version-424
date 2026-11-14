import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { AnimatePresence } from "framer-motion";
import { X, ShieldCheck, CheckCircle2, User, Building2, Clock, AlertTriangle, Lock } from "lucide-react";

import { PopupBackdrop, PopupPanel } from "../common/Popup";

// v332: IST date + time, "" for a missing / bad value
const istStamp = (v) => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : ""; };

export default function AdminSignedContractModal({ order, onClose }) {
  if (!order) return null;

  const orderId = String(order.id || order.order_id || "ORD-0000");
  // v332: statuses arrive in UPPERCASE; and no made-up "signed" time (it fell back to created_at / now)
  const stLower = String(order.status || "").toLowerCase();
  const isSigned = Boolean(order.agreement_signed_creator || order.raw?.agreement_signed_creator || stLower === "claimed" || stLower === "delivered" || stLower === "completed");
  const signedAt = order.agreement_signed_at || order.raw?.agreement_signed_at || null;

  const creatorName = typeof order.creator_name === 'string' ? order.creator_name : (order.creator_email || "Assigned Creator");
  const creatorPhone = typeof order.creator_phone === 'string' ? order.creator_phone : (order.phone || "Phone Not Provided");
  const creatorEmail = typeof order.creator_email === 'string' ? order.creator_email : "Not provided";

  const brandName = typeof order.brand_name === 'string' ? order.brand_name : (typeof order.brand_id === 'string' ? order.brand_id : "Brand Partner");
  const productName = typeof order.product_name === 'string' ? order.product_name : (typeof order.title === 'string' ? order.title : (typeof order.brief === 'object' && order.brief?.title ? order.brief.title : "UGC Video Brief"));
  const budget = Number(order.fixed_fee || order.budget || order.payout || (typeof order.brief === 'object' && order.brief?.budget) || 0);

  const getBriefText = (b) => {
    if (typeof b === 'string') return b;
    if (b && typeof b === 'object') {
      return (typeof b.detailed_requirements === 'string' && b.detailed_requirements) || 
             (typeof b.product_description === 'string' && b.product_description) || 
             (typeof b.title === 'string' && b.title) || '';
    }
    return '';
  };

  const description = (typeof order.brief_description === 'string' && order.brief_description) ||
                      (typeof order.description === 'string' && order.description) ||
                      getBriefText(order.brief) ||
                      "The brand did not add a description."; // v332: was made-up brief text

  const dos = order.dos || order.raw?.dos || [];
  const donts = order.donts || order.raw?.donts || [];

  return (
    <AnimatePresence>
      <PopupBackdrop className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
        {/* v330: dvh so the bottom isn't hidden behind the iOS browser bar */}
        <PopupPanel kind="modal"
          className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl w-full max-w-3xl max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden text-xs text-[var(--text-primary)] my-auto"
        >
          {/* Header */}
          <div className="px-4 sm:px-6 py-4 border-b border-[var(--border-default)] bg-[var(--bg-elevated)] flex justify-between items-center gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-black">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[var(--text-primary)] flex flex-wrap items-center gap-2">
                  <span>SLA CONTRACT</span>
                  {/* v332: this badge said "STAMPED & VERIFIED" even for unsigned orders */}
                  {isSigned ? (
                    <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 px-2 py-0.5 rounded font-mono font-bold uppercase">Signed</span>
                  ) : (
                    <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-600 px-2 py-0.5 rounded font-mono font-bold uppercase">Not signed yet</span>
                  )}
                </h3>
                <p className="text-[10px] text-[var(--text-tertiary)] font-mono">
                  AGREEMENT REF: YBEX-SLA-{(orderId).slice(0, 8).toUpperCase()}
                </p>
              </div>
            </div>
            <button 
              onClick={onClose} 
              aria-label="Close" /* v332 */
              className="shrink-0 p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] rounded-xl transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Modal Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Status Stamp Card */}
            {/* v332: the green tick, a made-up timestamp and "SMS OTP Seal Verified" showed even when nothing was signed */}
            <div className={`${isSigned ? "bg-emerald-500/5 border-emerald-500/20" : "bg-amber-500/5 border-amber-500/20"} border p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3`}>
              <div className="flex items-center gap-3">
                {isSigned ? <CheckCircle2 size={24} className="text-emerald-500 shrink-0" /> : <Clock size={24} className="text-amber-500 shrink-0" />}
                <div>
                  <div className={`font-bold ${isSigned ? "text-emerald-700" : "text-amber-700"} text-xs uppercase tracking-wide`}>
                    {isSigned ? "Contract signed with OTP" : "Contract signature pending"}
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)] font-mono">
                    Signed: {istStamp(signedAt) || "time not recorded — see signature records below"}
                  </div>
                </div>
              </div>
            </div>

            {/* Critical SLA Warning Box */}
            <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-700 text-[11px] uppercase tracking-wider">
                <AlertTriangle size={15} /> 24-Hour SLA Delivery & Penalty Terms
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                The creator is bound to deliver the final UGC draft within <strong>24 hours</strong> of agreement signature. Delay past 24 hours triggers automatic account strikes, trust score penalties, and potential forfeiture.
              </p>
            </div>

            {/* Parties */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-[var(--bg-elevated)] p-4 rounded-2xl border border-[var(--border-default)] space-y-2">
                <span className="text-[10px] font-bold text-[var(--violet)] uppercase tracking-wider flex items-center gap-1 border-b border-[var(--border-default)] pb-1.5">
                  <User size={13} /> Creator Party Details
                </span>
                <div className="space-y-1 font-mono text-[11px]">
                  <div><span className="text-[var(--text-tertiary)]">Name:</span> <strong>{creatorName}</strong></div>
                  <div><span className="text-[var(--text-tertiary)]">Phone:</span> <strong>{creatorPhone}</strong></div>
                  <div><span className="text-[var(--text-tertiary)]">Email:</span> <strong>{creatorEmail}</strong></div>
                </div>
              </div>

              <div className="bg-[var(--bg-elevated)] p-4 rounded-2xl border border-[var(--border-default)] space-y-2">
                <span className="text-[10px] font-bold text-[var(--violet)] uppercase tracking-wider flex items-center gap-1 border-b border-[var(--border-default)] pb-1.5">
                  <Building2 size={13} /> Brand & Payment Terms
                </span>
                <div className="space-y-1 text-[11px]">
                  <div><span className="text-[var(--text-tertiary)]">Brand Partner:</span> <strong>{brandName}</strong></div>
                  <div><span className="text-[var(--text-tertiary)]">Campaign / Brief:</span> <strong>{productName}</strong></div>
                  <div><span className="text-[var(--text-tertiary)]">Escrow Amount:</span> <strong className="text-[#027A48] font-mono text-sm">₹{budget.toLocaleString("en-IN")}</strong></div>
                </div>
              </div>
            </div>

            {/* Full Brief Details */}
            <div className="bg-[var(--bg-elevated)] p-4 rounded-2xl border border-[var(--border-default)] space-y-3">
              <span className="text-[10px] font-bold text-[var(--violet)] uppercase tracking-wider block border-b border-[var(--border-default)] pb-1.5">
                UGC Brief Requirements & Guidelines
              </span>
              <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-medium">
                {description}
              </p>

              {(dos.length > 0 || donts.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {dos.length > 0 && (
                    <div className="bg-emerald-500/5 p-3 rounded-xl border border-emerald-500/15">
                      <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">Dos</span>
                      <ul className="space-y-1 text-[10px]">
                        {dos.map((d, i) => <li key={i}>• {d}</li>)}
                      </ul>
                    </div>
                  )}
                  {donts.length > 0 && (
                    <div className="bg-rose-500/5 p-3 rounded-xl border border-rose-500/15">
                      <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider block mb-1">Donts</span>
                      <ul className="space-y-1 text-[10px]">
                        {donts.map((d, i) => <li key={i}>• {d}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Session 28: the permanent signature records saved at signing */}
            <SignedRecords orderId={orderId} />

            {/* Official Legal Seal Footer */}
            <div className="border border-[var(--border-default)] bg-gradient-to-r from-amber-500/5 via-purple-500/5 to-amber-500/5 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--text-tertiary)] font-mono">
              <div className="flex items-center gap-2">
                <Lock size={14} className="text-[var(--violet)]" />
                <span>YBEX MEDIA &bull; SIGNATURE ARCHIVE &bull; JAIPUR JURISDICTION</span>
              </div>
              {isSigned && <span className="font-bold text-emerald-600 uppercase">Signed</span>}{/* v332: was always "ACTIVE LEGAL DEED" */}
            </div>

          </div>

          {/* Modal Footer */}
          <div className="p-4 border-t border-[var(--border-default)] bg-[var(--bg-elevated)] flex justify-end shrink-0">
            <button 
              onClick={onClose} 
              className="bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-bold px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              Close Contract Viewer
            </button>
          </div>

        </PopupPanel>
      </PopupBackdrop>
    </AnimatePresence>
  );
}


// Session 28: records from GET /admin/agreements — the exact text each signer saw, the version,
// time, OTP email and IP. Read-only; the database refuses edits.
function SignedRecords({ orderId }) {
  const [state, setState] = useState({ loading: true, records: [], error: "" });
  const [open, setOpen] = useState(null);
  useEffect(() => {
    let alive = true;
    const id = encodeURIComponent(String(orderId || ""));
    api.get(`/admin/agreements?order_id=${id}&thread_id=${id}&deal_id=${id}`, { bypassCache: true })
      .then(({ data }) => { if (alive) setState({ loading: false, records: data?.records || [], error: "" }); })
      .catch((e) => { if (alive) setState({ loading: false, records: [], error: e?.response?.data?.error || "Could not load signature records." }); });
    return () => { alive = false; };
  }, [orderId]);

  return (
    <div className="border border-[var(--border-default)] rounded-2xl p-4 space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Signature records</div>
      {state.loading && <div className="text-xs text-[var(--text-tertiary)]">Loading…</div>}
      {!state.loading && state.error && <div className="text-xs text-rose-500">{state.error}</div>}
      {!state.loading && !state.error && state.records.length === 0 && (
        <div className="text-xs text-[var(--text-tertiary)]">No signature record saved for this order. (Records exist only for signatures made after this feature went live.)</div>
      )}
      {state.records.map((r) => (
        <div key={r.id} className="text-xs border-t border-[var(--border-default)] pt-2">
          <div className="font-semibold text-[var(--text-primary)]">
            {r.signer_role} · {r.signer_name || r.signer_user_id} · {istStamp(r.signed_at)}{/* v332: IST */}
          </div>
          <div className="text-[var(--text-secondary)] break-words">
            OTP email: {r.signer_email || "—"} · OTP verified: {istStamp(r.otp_verified_at) || "—"} · IP: {r.ip_address || "—"}
          </div>
          <div className="text-[var(--text-tertiary)]">Version: {r.agreement_version} · Fingerprint: {String(r.text_sha256 || "").slice(0, 16)}…</div>
          <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="mt-1 text-[var(--violet)] font-semibold">
            {open === r.id ? "Hide signed text" : "Show signed text"}
          </button>
          {open === r.id && (
            <pre className="mt-1 whitespace-pre-wrap text-[11px] bg-[var(--bg-base)] p-2 rounded-lg max-h-64 overflow-y-auto">{r.agreement_text}</pre>
          )}
        </div>
      ))}
    </div>
  );
}
