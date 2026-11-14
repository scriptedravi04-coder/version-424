import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, ChevronDown, ChevronUp, Inbox, Send } from "lucide-react";
import { api } from "../../lib/api";

// Session 36: who got each broadcast email and who did not (sent / failed / skipped / queued).
const AUDIENCE_LABEL = { creators: "Creators", brands: "Brands", agencies: "Agencies", unclaimed_creators: "Unclaimed creators", all: "Everyone" };
// v332: IST date + time
const ist = (v) => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : ""; };
const STATUS_STYLE = { sent: "text-emerald-700 bg-emerald-50", failed: "text-red-700 bg-red-50", skipped: "text-gray-600 bg-gray-100", queued: "text-amber-700 bg-amber-50" };

export default function BroadcastReport({ refreshKey }) {
  const [list, setList] = useState([]);
  const [cap, setCap] = useState(null);
  const [open, setOpen] = useState(null);
  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(false); // v332: empty table flash while loading
  const load = () => api.get("admin/broadcasts").then((r) => { setList(r.data?.broadcasts || []); setCap(r.data?.daily_cap); }).catch(() => {});
  useEffect(() => { load(); }, [refreshKey]);
  const toggle = async (id) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id); setRows([]);
    await loadRows(id);
  };
  const loadRows = async (id) => {
    setRowsLoading(true);
    try { const r = await api.get(`admin/broadcasts/${id}`); setRows(r.data?.recipients || []); } catch { toast.error("Could not load the report."); }
    finally { setRowsLoading(false); }
  };
  const retry = async (id) => {
    // v332: refresh the open list instead of collapsing it (toggle() closed an open report)
    try { await api.post(`admin/broadcasts/${id}/retry-failed`); toast.success("Failed emails queued again."); load(); if (open === id) loadRows(id); }
    catch { toast.error("Couldn't queue the failed emails again. Please try again."); }
  };
  if (list.length === 0) return null;
  return (
    <div className="mt-6 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-5" data-testid="broadcast-report">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-bold text-sm">Sent broadcasts</h4>
        <button onClick={load} className="text-xs flex items-center gap-1 text-[var(--text-secondary)]"><RefreshCw size={13} /> Refresh</button>
      </div>
      {cap && <p className="text-[11px] text-[var(--text-secondary)] mb-3">Up to {cap} emails go out per day (email provider limit). The rest are sent the next day automatically.</p>}
      <ul className="divide-y divide-[var(--border-default)]">
        {list.map((b) => (
          <li key={b.id} className="py-3">
            <div className="flex items-start justify-between gap-3">
              <button onClick={() => toggle(b.id)} className="text-left min-w-0 flex-1">
                <div className="font-semibold text-sm truncate">{b.subject}</div>
                <div className="text-[11px] text-[var(--text-secondary)]">
                  {AUDIENCE_LABEL[b.audience] || b.audience} · {ist(b.created_at)}{/* v332: IST */}
                </div>
                <div className="text-xs mt-1 flex flex-wrap gap-2">
                  <span className="text-emerald-700">{b.sent || 0} sent</span>
                  <span className="text-amber-700">{b.queued || 0} waiting</span>
                  <span className="text-red-700">{b.failed || 0} failed</span>
                  <span className="text-gray-500">{b.skipped || 0} skipped</span>
                  <span className="text-[var(--text-secondary)]">of {b.total}</span>
                </div>
              </button>
              <div className="flex items-center gap-2 shrink-0">
                {(b.failed || 0) > 0 && <button onClick={() => retry(b.id)} className="px-2.5 py-1 rounded-lg border border-[var(--border-default)] text-[11px] font-semibold">Retry failed</button>}
                {open === b.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </div>
            {open === b.id && (
              <div className="mt-3 max-h-72 overflow-auto border border-[var(--border-default)] rounded-xl">
                <table className="w-full min-w-[480px] text-xs">
                  <thead className="bg-[var(--bg-elevated)] text-left"><tr><th className="p-2">Email</th><th className="p-2">Status</th><th className="p-2">Note</th></tr></thead>
                  <tbody>
                    {rowsLoading && rows.length === 0 && <tr><td colSpan={3} className="p-3 text-[var(--text-secondary)]">Loading…</td></tr>}
                    {!rowsLoading && rows.length === 0 && <tr><td colSpan={3} className="p-3 text-[var(--text-secondary)]">No recipients listed.</td></tr>}
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-[var(--border-default)]">
                        <td className="p-2 font-mono">{r.email}</td>
                        <td className="p-2"><span className={`px-2 py-0.5 rounded-md ${STATUS_STYLE[r.status] || ""}`}>{r.status}</span></td>
                        <td className="p-2 text-[var(--text-secondary)]">{r.error || ist(r.sent_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// v419 (Ravi: "queue wali emails ja nahi rahi — Send now ka button do, number main type karunga"): mails that wait for
// the night (welcome, approvals, activity mails, broadcasts) — see how many, and send as many as you choose right now.
export function EmailQueueCard() {
  const [q, setQ] = useState(null);
  const [n, setN] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api.get("admin/email-queue", { bypassCache: true }).then((r) => setQ(r.data || {})).catch(() => setQ({ error: true }));
  useEffect(() => { load(); }, []);
  const total = (Number(q?.waiting) || 0) + (Number(q?.broadcast_waiting) || 0);
  const send = async () => {
    const count = Math.floor(Number(n));
    if (!(count >= 1 && count <= 500)) return toast.error("Type how many emails to send (1 to 500).");
    if (!window.confirm(`Send ${count} waiting email${count === 1 ? "" : "s"} now? Check that much is left in today's Resend limit.`)) return;
    setBusy(true);
    try {
      const { data } = await api.post("admin/email-queue/send", { count });
      if (data?.sent) toast.success(`${data.sent} sent${data.failed ? ` · ${data.failed} failed` : ""}.`);
      else toast.error(data?.failed ? `${data.failed} failed — check the Resend dashboard.` : "Nothing was sent (queue empty or Resend limit reached).");
      if (data?.quota_full) toast.error("Resend's daily limit was reached — the rest waits.");
      setN(""); load();
    } catch (e) { toast.error(e?.response?.data?.error || "Couldn't send now. Please try again."); }
    finally { setBusy(false); }
  };
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-6 shadow-sm" data-testid="email-queue-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold flex items-center gap-2"><Inbox size={20} className="text-[#9D7CFF]" /> Waiting emails</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-xl">Welcome, approval, activity and broadcast emails wait here so login codes and payment emails never run out of the daily limit. They also go out by themselves at night when the limit has room.</p>
        </div>
        <button type="button" onClick={load} className="p-2 rounded-lg border border-[var(--border-default)] cursor-pointer" aria-label="Refresh"><RefreshCw size={16} /></button>
      </div>
      {q?.error ? <p className="text-sm text-red-600 mt-4">Couldn't load the queue.</p> : (
        <>
          <div className="grid grid-cols-3 gap-3 mt-4">
            {[["Waiting", q ? total : "…"], ["Sent today", q ? (q.sent_today ?? 0) : "…"], ["Daily limit", q ? (q.daily_limit ? q.daily_limit : "No limit") : "…"]].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-[var(--bg-elevated)] p-3"><div className="text-[11px] font-semibold text-[var(--text-secondary)]">{l}</div><div className="text-xl font-bold mt-0.5" data-testid={`eq-${l.toLowerCase().replace(/\s/g, "-")}`}>{v}</div></div>
            ))}
          </div>
          {q?.by_subject?.length > 0 && (
            <div className="mt-4 text-xs">
              <div className="font-bold text-[var(--text-secondary)] mb-1.5">What's waiting</div>
              <ul className="space-y-1">{q.by_subject.slice(0, 6).map((r) => <li key={r.subject} className="flex justify-between gap-3"><span className="truncate">{r.subject}</span><b className="shrink-0">{r.n}</b></li>)}
                {q.broadcast_waiting > 0 && <li className="flex justify-between gap-3"><span>Broadcast emails</span><b>{q.broadcast_waiting}</b></li>}
              </ul>
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <label className="text-xs font-bold text-[var(--text-secondary)]">How many to send now
              <input type="number" inputMode="numeric" min={1} max={500} value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="e.g. 40" data-testid="eq-count"
                className="mt-1.5 block w-36 h-11 px-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[16px] sm:text-sm" />
            </label>
            <button type="button" onClick={send} disabled={busy || !total} data-testid="eq-send"
              className="h-11 px-5 bg-[#9D7CFF] hover:bg-[#8B6BE0] text-white font-bold rounded-xl text-sm flex items-center gap-2 cursor-pointer disabled:opacity-50">
              <Send size={16} /> {busy ? "Sending…" : "Send now"}
            </button>
            <span className="text-[11px] text-[var(--text-secondary)]">Oldest first. Check today's room on the Resend dashboard before you send.</span>
          </div>
        </>
      )}
    </div>
  );
}


