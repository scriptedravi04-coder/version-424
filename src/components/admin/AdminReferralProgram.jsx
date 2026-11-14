import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api";

// Session 36: referral programme — settings, creator numbers (for investors), referrals, withdrawals.
const FIELDS = [
  ["signups_per_reward", "Joins needed per reward"],
  ["free_deals_per_reward", "0% fee deals per reward"],
  ["free_deals_valid_days", "Free deals valid (days)"],
  ["featured_days", "Featured (days)"],
  ["share_pct_of_earnings", "Share of friend's earnings after fee (%)"],
  ["share_cap_per_creator", "Share cap per invited creator (₹)"],
  ["min_withdraw", "Minimum withdrawal (₹)"],
  ["monthly_cap_per_user", "Max joins counted per month"],
  // v290 (Ravi): invite rewards (backend/inviteRewards.ts)
  ["friend_reward", "Friend reward each side (₹) — on 100% profile"],
  ["friend_reward_cap", "Friend rewards max per person (₹)"],
  ["brand_invite_reward", "Brand invite reward (₹ per brand)"],
  ["brand_invite_max_brands", "Brand invites paid (max brands)"],
  ["brand_invite_min_deal", "Brand's first funded deal at least (₹)"],
  ["brand_invite_unlock_deals", "Own deals needed to unlock ₹500"],
  ["brand_invite_featured_days", "Featured days per brand invite"],
];
const NUMBERS = [
  ["creator_accounts", "Creator accounts"], ["creator_accounts_last_30_days", "New in 30 days"],
  ["approved_creator_profiles", "Approved creator profiles"], ["applications_total", "Applications"],
  ["applications_pending", "Applications pending"], ["referral_joins", "Joins via referral"],
  ["referral_joins_last_30_days", "Referral joins (30 days)"], ["creators_from_referral_pct", "% creators from referral"],
];

export default function AdminReferralProgram() {
  const [data, setData] = useState(null);
  const [cfg, setCfg] = useState({});
  const [list, setList] = useState([]);
  const [wd, setWd] = useState([]);
  const [loadError, setLoadError] = useState(false); // v330: a failed load used to spin "Loading…" forever
  const [saving, setSaving] = useState(false); // v330: no double save
  const prettyStatus = (s) => (s ? String(s).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—"); // v330: no raw enum
  const load = async () => {
    setLoadError(false); // v330
    try {
      const [p, l, w] = await Promise.all([api.get("admin/referral-program"), api.get("admin/referral-list"), api.get("admin/referral-withdrawals")]);
      setData(p.data); setCfg(p.data?.config || {}); setList(l.data?.referrals || []); setWd(w.data?.withdrawals || []);
    } catch { toast.error("Could not load the referral programme."); setLoadError(true); /* v330 */ }
  };
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (saving) return; // v330
    setSaving(true);
    try { await api.put("admin/referral-program", cfg); toast.success("Saved."); load(); }
    catch (e) { toast.error(e?.response?.data?.error || "Could not save."); }
    finally { setSaving(false); }
  };
  const [busyId, setBusyId] = useState(""); // Session 58: one action at a time per row (money)
  const act = async (id, action) => {
    if (busyId) return;
    const body = {};
    if (action === "paid") { const utr = window.prompt("UTR / bank reference"); if (!utr) return; body.utr = utr; }
    if (action === "reject" && !window.confirm("Reject this withdrawal request?")) return; // v330: ask before rejecting
    setBusyId(id);
    // v332: say what happened; calm text instead of "Failed"
    try { await api.post(`admin/referral-withdrawals/${id}/${action}`, body); toast.success(action === "paid" ? "Marked as paid." : "Withdrawal rejected."); load(); } catch (e) { toast.error(e?.response?.data?.error || "Couldn't update this withdrawal. Please try again."); }
    finally { setBusyId(""); }
  };
  // v330: a failed "Don't count" used to be silent
  const reject = async (id) => { if (!window.confirm("Do not count this referral?")) return; const ok = await api.post(`admin/referrals/${id}/reject`).then(() => true).catch((e) => { toast.error(e?.response?.data?.error || "Could not update this referral."); return false; }); if (ok) toast.success("Referral will not be counted."); load(); }; // v332: success toast
  if (!data && loadError) return <div className="p-4 text-sm text-red-600">Could not load the referral programme. <button type="button" onClick={load} className="underline font-semibold">Try again</button></div>; // v330
  if (!data) return <div className="p-4 text-sm">Loading…</div>;
  const input = "w-full px-3 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[16px] sm:text-sm"; // v330: no iOS zoom
  return (
    <div className="space-y-6" data-testid="admin-referral-program">
      <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-5">
        <h4 className="font-bold text-sm mb-3">Creator numbers</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {NUMBERS.map(([k, l]) => <div key={k} className="rounded-xl bg-[var(--bg-elevated)] p-3"><div className="text-xl font-bold">{data.numbers?.[k] ?? 0}{k.endsWith("_pct") ? "%" : ""}</div><div className="text-[11px] text-[var(--text-secondary)]">{l}</div></div>)}
        </div>
      </div>
      <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h4 className="font-bold text-sm">Rewards</h4>
          <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={cfg.is_active !== false} onChange={(e) => setCfg({ ...cfg, is_active: e.target.checked })} /> Programme on</label>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {FIELDS.map(([k, l]) => <label key={k} className="text-[11px] font-semibold">{l}<input type="number" className={input} value={cfg[k] ?? ""} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} /></label>)}
        </div>
        <button onClick={save} disabled={saving} className="disabled:opacity-50 mt-4 px-4 py-2 rounded-xl bg-[#9D7CFF] text-white text-sm font-semibold">{saving ? "Saving…" : "Save"}</button>{/* v332 */}
      </div>
      <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-5">
        <h4 className="font-bold text-sm mb-3">Withdrawal requests</h4>
        {wd.length === 0 ? <p className="text-xs text-[var(--text-secondary)]">None yet.</p> : (
          <div className="overflow-x-auto">{/* v330: scrolls inside the card on phones */}
          <table className="w-full min-w-[560px] text-xs"><tbody>{wd.map((w) => (
            <tr key={w.id} className="border-t border-[var(--border-default)]">
              <td className="p-2"><div className="font-semibold">{w.name || w.user_id}</div><div className="text-[10.5px] text-[var(--text-secondary)]">{[w.role, w.email].filter(Boolean).join(" · ")}</div></td>{/* v332: no dangling "·" */}
              <td className="p-2 font-mono">{w.upi_id ? <button type="button" title="Copy UPI" onClick={() => { navigator.clipboard?.writeText(w.upi_id); toast.success("UPI copied"); }} className="underline decoration-dotted">{w.upi_id}</button> : <span className="text-red-600">no UPI</span>}</td>
              <td className="p-2">₹{Number(w.amount || 0).toLocaleString("en-IN")}</td><td className="p-2">{prettyStatus(w.status)}{w.utr ? ` · ${w.utr}` : ""}</td>
              <td className="p-2 text-right">{w.status === "requested" && <><button disabled={busyId === w.id} onClick={() => act(w.id, "paid")} className="px-2 py-1 rounded-lg border mr-1 disabled:opacity-50">{busyId === w.id ? "…" : "Mark paid"}</button><button disabled={busyId === w.id} onClick={() => act(w.id, "reject")} className="px-2 py-1 rounded-lg border border-red-200 bg-red-50 text-red-600 disabled:opacity-50">Reject</button></>}</td>
            </tr>))}</tbody></table>
          </div>
        )}
        <p className="text-[11px] text-[var(--text-secondary)] mt-2">Tap the UPI id to copy it, pay from your UPI app, then "Mark paid" with the UTR — the person sees "Paid · UTR …" in their wallet.</p>
      </div>
      <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-5">
        <h4 className="font-bold text-sm mb-3">Latest referrals</h4>
        <div className="max-h-80 overflow-auto">{/* v330: sideways scroll too */}
          {list.length === 0 && <p className="text-xs text-[var(--text-secondary)]">No referrals yet.</p>}{/* v332: an empty table showed nothing */}
          <table className="w-full min-w-[520px] text-xs"><tbody>{list.map((r) => (
            <tr key={r.id} className="border-t border-[var(--border-default)]">
              <td className="p-2 font-mono">{r.referrer_id}</td><td className="p-2 font-mono">{r.referred_id}</td><td className="p-2">{prettyStatus(r.status)}</td>
              <td className="p-2">{r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—"}</td>
              <td className="p-2 text-right">{r.status !== "rejected" && <button onClick={() => reject(r.id)} className="px-2 py-1 rounded-lg border">Don't count</button>}</td>
            </tr>))}</tbody></table>
        </div>
      </div>
    </div>
  );
}
