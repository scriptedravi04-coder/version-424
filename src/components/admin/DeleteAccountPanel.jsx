import React, { useState } from "react";
import { toast } from "sonner";
import { Trash2, AlertOctagon } from "lucide-react";
import { api } from "../../lib/api";

// Session 27 (rule 56). Two ways to delete an account, for every kind of user (brand, agency,
// creator, unclaimed creator):
//   - Normal delete: sent to the bin, can be restored. For accounts closed for a user's mistakes.
//   - Complete wipe out: the user and all their campaigns, chats, deals, invites, UGC work,
//     notifications and KYC are removed for good; the same email can sign up fresh.
//     Needs the admin's own password. Blocked while the account has money in escrow.
// Basic UI only — the design comes later from Claude Design.
export default function DeleteAccountPanel({ user, onDone }) {
  const [mode, setMode] = useState("normal");
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [moneyItems, setMoneyItems] = useState(null);
  const [force, setForce] = useState(false);

  const userId = user?.user_id || user?.id;
  const name = user?.name || user?.creator_profile?.name || user?.brand_profile?.company_name || user?.email || "this user";
  const canSubmit = !busy && (mode === "normal" ? confirmText.trim() === "DELETE" : Boolean(password) && (!moneyItems || force));

  const submit = async () => {
    if (!userId || !canSubmit) return;
    setBusy(true);
    setResult(null);
    try {
      if (mode === "normal") {
        await api.post(`/admin/users/${userId}/delete`, {});
        toast.success(`${name} moved to the bin.`);
      } else {
        const { data } = await api.post(`/admin/users/${userId}/wipe`, { password, force: Boolean(moneyItems && force) });
        setResult(data);
        setMoneyItems(null);
        setForce(false);
        toast.success(`${name} was wiped completely.`);
      }
      setConfirmText("");
      setPassword("");
      if (onDone) onDone(mode);
    } catch (e) {
      const d = e?.response?.data || {};
      if (d.code === "WIPE_HAS_ACTIVE_MONEY") {
        setMoneyItems(d.items || []);
        toast.warning("This account has money in escrow. Confirm below to wipe anyway.");
      } else {
        // v332: never show raw tech text ("Request failed with status code 500")
        const m = d.error || d.detail;
        toast.error(typeof m === "string" && m && m.length < 160 ? m : "Couldn't delete the account. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const option = (value, title, text) => (
    <label className={`block p-3 rounded-xl border cursor-pointer ${mode === value ? "border-red-400 bg-red-50" : "border-gray-200 bg-white"}`}>
      <div className="flex items-center gap-2">
        <input type="radio" name="delete-mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
        <span className="text-sm font-bold text-gray-900">{title}</span>
      </div>
      <p className="text-xs text-gray-600 mt-1 ml-6">{text}</p>
    </label>
  );

  return (
    <div className="space-y-4" data-testid="delete-account-panel">
      <div className="grid gap-2">
        {option("normal", "Normal delete (send to bin)", "For an account closed because of the user's mistakes. They cannot log in. Can be restored later.")}
        {option("wipe", "Complete wipe out", "Removes the user and all their campaigns, chats, deals, invites, UGC orders, notifications and KYC for good. The same email can sign up fresh. Payment records are kept for accounting, without name or email. Meant for test accounts.")}
      </div>

      {mode === "normal" ? (
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 block">Type DELETE to confirm</label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className="w-full bg-gray-50 border border-red-200 rounded-xl p-3 text-[16px] sm:text-sm font-semibold" /* v330: no iOS zoom */
          />
        </div>
      ) : (
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 block">Your admin password</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            className="w-full bg-gray-50 border border-red-200 rounded-xl p-3 text-[16px] sm:text-sm font-semibold" /* v330: no iOS zoom */
          />
          <p className="text-xs text-red-600 mt-1 font-semibold">This cannot be undone.</p>
        </div>
      )}

      <button
        type="button"
        disabled={!canSubmit}
        onClick={submit}
        className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
      >
        {mode === "normal" ? <Trash2 size={16} /> : <AlertOctagon size={16} />}
        {busy ? "Working…" : mode === "normal" ? "Send to Bin" : "Wipe Account Completely"}
      </button>

      {mode === "wipe" && moneyItems && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
          <div>Money is still held for: {moneyItems.join(", ") || "this account"}. Wiping deletes these deals too.</div>
          <label className="flex items-center gap-2 font-bold cursor-pointer">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            Wipe anyway
          </label>
        </div>
      )}
      {result?.ok && (
        <div className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-xl p-3">
          Removed: {Object.entries(result.supabase || {}).filter(([, n]) => n).map(([t, n]) => `${String(t).replace(/_/g, " ")} ${n}`).join(", ") || "nothing in the database"}{/* v332: readable table names */}
          {result.errors?.length ? <div className="mt-1 text-amber-700">Skipped: {result.errors.join("; ")}</div> : null}
        </div>
      )}
    </div>
  );
}
