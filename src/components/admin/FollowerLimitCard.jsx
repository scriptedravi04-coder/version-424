import React, { useEffect, useState } from "react";
import { Users, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";

/**
 * v397 (Ravi: "admin panel ke andar bhi option de de limit lagane ki"): the minimum Instagram followers a NEW creator
 * needs to finish sign-up. Below it they see the "Every big creator started small" page and can send a work link
 * (Admin → Waitlist filter "Below min · work shared"). 0 = no limit. Already-joined creators are never affected.
 */
export default function FollowerLimitCard() {
  const [min, setMin] = useState(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get("admin/follower-gate").then((r) => { const n = Number(r.data?.min); setMin(n); setValue(String(n)); }).catch(() => setMin(500));
  }, []);
  const dirty = min !== null && value.trim() !== "" && Number(value) !== min;
  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const { data } = await api.post("admin/follower-gate", { min: value });
      setMin(Number(data.min)); setValue(String(data.min));
      toast.success(Number(data.min) === 0 ? "Follower limit turned off — anyone can join." : `Saved — new creators need ${Number(data.min).toLocaleString("en-IN")}+ followers.`);
    } catch (e) {
      toast.error(e?.response?.data?.error || "Couldn't save. Please try again.");
    } finally { setSaving(false); }
  };
  return (
    <div data-testid="follower-limit-card" className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0"><Users size={17} /></div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-[var(--text-primary)]">Minimum followers to join</div>
          <div className="text-xs text-[var(--text-secondary)] mt-0.5">
            New creators below this see the "Every big creator started small" page and can send a work link. 0 = no limit. Already-joined creators are not affected.
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input data-testid="follower-limit-input" type="text" inputMode="numeric" aria-label="Minimum followers to join"
          value={min === null ? "" : value} disabled={min === null}
          onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          className="w-28 h-10 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 text-[16px] sm:text-sm font-bold text-[var(--text-primary)] text-right focus:outline-none focus:border-[var(--violet)]" />
        <button type="button" data-testid="follower-limit-save" onClick={save} disabled={!dirty || saving}
          className={`h-10 px-4 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 ${dirty ? "bg-[#7C3AED] text-white cursor-pointer" : "bg-[var(--bg-elevated)] text-[var(--text-tertiary)] border border-[var(--border-default)]"}`}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : dirty ? "Save" : <><Check size={15} /> Saved</>}
        </button>
      </div>
    </div>
  );
}
