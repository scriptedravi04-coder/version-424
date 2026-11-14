import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, CheckCircle2, Clock } from "lucide-react";
import { api } from "../../lib/api";

// Session 36 (Ravi): campaign / deal refunds, like UGC. Shows every refund with its status and UTR, and
// asks once for a refund account (UPI or bank — the same one UGC uses) when a refund is waiting.
// Renders nothing when the brand has no refunds.
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : ""); // v330: IST

export function RefundAccountForm({ onSaved, compact = false }) {
  const [type, setType] = useState("UPI");
  const [f, setF] = useState({ upi_id: "", account_no: "", confirm_account_no: "", ifsc: "", holder_name: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    try {
      await api.post("/brand/refund-account", { method_type: type, account_details: f, upi_id: type === "UPI" ? f.upi_id : undefined });
      toast.success("Refund account saved.");
      onSaved?.();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Could not save the refund account.");
    } finally { setBusy(false); }
  };
  const input = "w-full px-3 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] text-base sm:text-sm"; // v332: 16px on phones (no iOS zoom)
  return (
    <div className={compact ? "space-y-2" : "space-y-3"} data-testid="refund-account-form">
      <div className="flex gap-2">
        {["UPI", "BANK"].map((t) => (
          <button key={t} type="button" onClick={() => setType(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${type === t ? "bg-[var(--violet)] text-white border-transparent" : "border-[var(--border-default)]"}`}>
            {t === "UPI" ? "UPI ID" : "Bank account"}
          </button>
        ))}
      </div>
      {type === "UPI" ? (
        <input className={input} placeholder="name@bank" value={f.upi_id} onChange={set("upi_id")} />
      ) : (
        <>
          <input className={input} placeholder="Account holder name" value={f.holder_name} onChange={set("holder_name")} />
          <input className={input} placeholder="Account number" inputMode="numeric" value={f.account_no} onChange={set("account_no")} />
          <input className={input} placeholder="Confirm account number" inputMode="numeric" value={f.confirm_account_no} onChange={set("confirm_account_no")} />
          <input className={input} placeholder="IFSC" value={f.ifsc} onChange={set("ifsc")} />
        </>
      )}
      <button type="button" disabled={busy} onClick={save} className="px-4 py-2 rounded-xl bg-[var(--violet)] text-white text-sm font-semibold disabled:opacity-50">
        {busy ? "Saving…" : "Save refund account"}
      </button>
      <p className="text-[11px] text-[var(--text-secondary)]">Used only to send you refunds. The same account is used for UGC refunds.</p>
    </div>
  );
}

// v416 (QA U2): refunds come in two shapes — GET /brand/refunds (status PENDING / PROCESSED / FAILED, reference,
// refunded_at) and the payments overview (status pending / refunded / failed, utr, date). One normaliser for both.
export function normaliseRefund(r) {
  const st = String(r?.status || "").toUpperCase();
  const status = st === "PROCESSED" || st === "REFUNDED" ? "refunded" : st === "FAILED" ? "failed" : "pending";
  return {
    id: r?.id,
    title: r?.title || r?.brief_title || r?.campaign_title || null,
    kind: r?.kind || (r?.brief_id ? "ugc" : "campaign"),
    amount: Number(r?.amount) || 0,
    status,
    utr: status === "refunded" ? (r?.utr || r?.reference || null) : null,
    reason: r?.reason || null,
    failure: r?.failure || r?.failure_reason || null,
    date: status === "refunded" ? (r?.refunded_at || r?.processed_at || r?.date || null) : (r?.date || r?.requested_at || r?.created_at || null),
  };
}

export default function BrandRefundsCard({ className = "", refunds: refundsProp, hasRefundAccount, onChanged }) {
  const controlled = Array.isArray(refundsProp); // v416 (QA U1/U2): the payments page passes the overview's refunds
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false); // v416 (CR21): a failed load is not "no refunds"
  const load = () => {
    if (controlled) { onChanged?.(); return Promise.resolve(); }
    setFailed(false);
    return api.get("/brand/refunds", { bypassCache: true })
      .then((r) => setData(r.data && typeof r.data === "object" ? r.data : { refunds: [] }))
      .catch(() => { setFailed(true); setData(null); });
  };
  useEffect(() => { if (!controlled) load(); }, [controlled]); // eslint-disable-line react-hooks/exhaustive-deps
  const refunds = (controlled ? refundsProp : (data?.refunds || [])).map(normaliseRefund);
  const hasAccount = controlled ? Boolean(hasRefundAccount) : Boolean(data?.has_refund_account);

  if (!controlled && failed) {
    return (
      <div className={`rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4 flex items-center justify-between gap-3 ${className}`} data-testid="brand-refunds-error" role="status">
        <div className="flex items-center gap-2 min-w-0">
          <RotateCcw size={16} className="text-[var(--violet)] shrink-0" />
          <span className="text-sm text-[var(--text-secondary)]">Refunds couldn't be loaded right now.</span>
        </div>
        <button type="button" onClick={load} className="min-h-[40px] px-4 rounded-xl border border-[var(--border-default)] text-sm font-semibold text-[var(--text-primary)] shrink-0">Try again</button>
      </div>
    );
  }
  if (refunds.length === 0) return null;
  const waiting = refunds.some((r) => r.status !== "refunded");

  return (
    <div className={`rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4 ${className}`} data-testid="brand-refunds">
      <div className="flex items-center gap-2 mb-3">
        <RotateCcw size={16} className="text-[var(--violet)]" />
        <h3 className="font-bold text-[var(--text-primary)] text-sm">Refunds</h3>
      </div>
      {waiting && !hasAccount && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-xs font-semibold text-amber-800 mb-2">A refund is waiting. Add where we should send it:</p>
          <RefundAccountForm compact onSaved={load} />
        </div>
      )}
      <ul className="divide-y divide-[var(--border-default)]">
        {refunds.map((r) => (
          <li key={r.id} className="py-2.5 flex items-start justify-between gap-3 text-sm">
            <div className="min-w-0">
              <div className="font-semibold text-[var(--text-primary)]">{inr(r.amount)}{r.title ? <span className="font-normal text-[var(--text-secondary)]"> · {r.title}</span> : null}{r.kind === "ugc" ? <span className="ml-1.5 text-[10px] font-bold px-1.5 py-[1px] rounded bg-[var(--bg-elevated)] text-[var(--text-secondary)]">UGC</span> : null}</div>
              {r.reason && <div className="text-xs text-[var(--text-secondary)] truncate">{r.reason}</div>}
              {r.utr && <div className="text-xs font-mono text-emerald-700 mt-0.5">UTR {r.utr}</div>}
              {r.status === "failed" && <div className="text-xs text-rose-700 mt-0.5">{r.failure || "The transfer failed. Check your refund account."}</div>}
            </div>
            <div className="text-right shrink-0">
              {r.status === "refunded" ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={13} /> Sent {fmt(r.date)}</span>
              ) : r.status === "failed" ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700"><Clock size={13} /> Failed</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><Clock size={13} /> {hasAccount ? "Processing" : "Waiting for refund account"}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
