// v349 (Ravi): "Explore Creators se kisi creator ko hatana ho to sirf delete ya ban hai — sirf hide ka option do."
// Admin → Users → creator → "Hide from Explore & Meet the Creators" (on = hidden, creator_profiles.hidden_from_explore).
// Hidden ≠ banned: the creator's profile link, deals and chats keep working. Saved by
// POST /admin/creators/:userId/explore-hide (backend/creatorHomePicks.ts).
import React, { useState } from "react";
import { EyeOff } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import ButtonSpinner from "../common/ButtonSpinner";
import SocialLogo from "../common/SocialLogo"; // v364: real platform logos

const calmError = (err, fallback) => {
  const m = err?.response?.data?.error || err?.response?.data?.detail;
  return typeof m === "string" && m && m.length < 160 ? m : fallback;
};

export default function ExploreHideControl({ userId, initialHidden = false, onSaved }) {
  const [local, setLocal] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const hidden = local !== undefined ? local : Boolean(initialHidden);

  const toggle = async () => {
    if (busy || !userId) return;
    const next = !hidden;
    setBusy(true);
    try {
      await api.post(`admin/creators/${userId}/explore-hide`, { hidden: next });
      setLocal(next);
      toast.success(next ? "Hidden from Explore & Meet the Creators" : "Shown on Explore & Meet the Creators again");
      if (onSaved) onSaved();
    } catch (e) {
      toast.error(calmError(e, "Couldn't save. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3" data-testid="admin-explore-hide">
      <p className="text-[11px] text-gray-500 font-medium sm:max-w-md" data-testid="admin-explore-hide-help">
        {hidden
          ? "Hidden: brands and visitors don't see this creator on Explore, Meet the Creators, top creators or the landing page. Their profile link, deals and chats still work."
          : "Removes this creator from the lists brands and visitors browse (Explore, Meet the Creators, top creators, landing page) — without banning or deleting the account."}
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={hidden}
        onClick={toggle}
        disabled={busy}
        data-testid="admin-explore-hide-toggle"
        className={`shrink-0 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 border ${
          hidden ? "bg-gray-800 text-white border-gray-800 shadow-sm hover:bg-gray-900" : "bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200"
        }`}
        title="Hide from Explore Creators and Meet the Creators (not a ban)"
      >
        {busy ? <ButtonSpinner /> : <EyeOff size={15} />}
        <span>{hidden ? "Hidden from Explore — Unhide" : "Hide from Explore & Meet the Creators"}</span>
      </button>
    </div>
  );
}


// v349: Admin → Users → creator → "Refresh from Instagram" (backend/instagramConnect.ts). Live numbers via Meta's API.
export function InstagramRefreshControl({ userId, profile, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState(null);
  const p = profile || {};
  const shown = stats || (p.instagram_stats && !p.instagram_stats.error ? p.instagram_stats : null);
  const refresh = async () => {
    if (busy || !userId) return;
    setBusy(true);
    try {
      const { data } = await api.post(`admin/creators/${userId}/instagram-refresh`, {});
      setStats(data?.stats || null);
      toast.success("Updated from Instagram");
      if (onSaved) onSaved();
    } catch (e) {
      toast.error(calmError(e, "Couldn't refresh from Instagram."));
    } finally { setBusy(false); }
  };
  return (
    <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3" data-testid="admin-ig-refresh">
      <p className="text-[11px] text-gray-500 font-medium">
        {shown ? `Instagram @${shown.username}: ${Number(shown.followers || 0).toLocaleString("en-IN")} followers · avg views ${Number(shown.avg_views || shown.reach_28d || 0).toLocaleString("en-IN")} · ER ${shown.engagement_rate ?? "—"}%` : "Instagram numbers are typed by the creator (not synced yet)."}
        {p.instagram_verified_at ? ` · Verified (${p.instagram_verify_method === "oauth" ? "Instagram login" : "DM code"})` : ""}
      </p>
      <button type="button" onClick={refresh} disabled={busy} className="shrink-0 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 disabled:opacity-50">
        {busy ? <ButtonSpinner /> : <SocialLogo platform="instagram" size={15} />}<span>Refresh from Instagram</span>
      </button>
    </div>
  );
}

// ── v429 Support mode (Ravi: "user call kare to uske account mein changes khud karo, code nahi lena") ─────────
// Admin → Users → a user → "Open account (support)". A reason is required; the account opens for 30 minutes in this
// tab; the user gets a notification; every change is logged. Money, bank, KYC, signing, approvals, chat and login
// details stay locked (backend/authSecurity.ts supportBlocked). "Exit" brings the admin login back.
const SUPPORT_KEY = "ybex_support_session";
export function supportSession() {
  try { const s = JSON.parse(window.sessionStorage.getItem(SUPPORT_KEY) || "null"); return s && s.token ? s : null; } catch { return null; }
}
export async function exitSupportMode({ silent = false } = {}) {
  const s = supportSession();
  if (!s) return;
  try { await api.post("/admin/support/end"); } catch { /* it expires by itself */ }
  try {
    window.localStorage.setItem("ybex_token", s.adminToken || "");
    window.sessionStorage.removeItem(SUPPORT_KEY);
  } catch { /* storage blocked */ }
  if (!silent) toast.success("Support mode closed");
  window.location.assign(s.backTo || "/admin");
}

export function SupportModeControl({ userId, name }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const start = async () => {
    if (reason.trim().length < 5) { toast.error("Write what the user asked for"); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/support/${encodeURIComponent(userId)}/start`, { reason: reason.trim() });
      const adminToken = window.localStorage.getItem("ybex_token") || "";
      window.sessionStorage.setItem(SUPPORT_KEY, JSON.stringify({ token: data.token, adminToken, expires_at: data.expires_at, name: data.user?.name || name || "User", backTo: window.location.pathname }));
      window.localStorage.setItem("ybex_token", data.token);
      window.location.assign("/");
    } catch (e) {
      toast.error(e?.response?.data?.error || "Couldn't open the account");
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-3" data-testid="support-mode-control">
      <div className="text-sm font-bold text-gray-900">Support mode</div>
      <div className="text-xs text-gray-600 mt-0.5">Open this account for 30 minutes to fix what the user asked for. They get a notification and every change is logged. Payments, bank, KYC, signing, approvals and chat stay locked.</div>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-2 h-9 px-3 rounded-xl bg-violet-600 text-white text-xs font-bold">Open account (support)</button>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2} placeholder="Reason — what the user asked for (they will see this)" className="w-full rounded-xl border border-gray-200 p-2 text-sm" data-testid="support-reason" />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={start} className="h-9 px-3 rounded-xl bg-violet-600 text-white text-xs font-bold disabled:opacity-60">{busy ? "Opening…" : "Open account"}</button>
            <button type="button" onClick={() => setOpen(false)} className="h-9 px-3 rounded-xl bg-white border border-gray-200 text-xs font-bold">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Purple bar on every page while an admin is inside a user's account. Closes by itself when the 30 minutes end. */
export function SupportModeBanner() {
  const [s] = useState(() => (typeof window === "undefined" ? null : supportSession()));
  const [left, setLeft] = useState(() => (s ? Date.parse(s.expires_at) - Date.now() : 0));
  React.useEffect(() => {
    if (!s) return undefined;
    const t = setInterval(() => {
      const ms = Date.parse(s.expires_at) - Date.now();
      setLeft(ms);
      if (ms <= 0) { clearInterval(t); exitSupportMode({ silent: true }); }
    }, 1000);
    return () => clearInterval(t);
  }, [s]);
  if (!s) return null;
  const mm = Math.max(0, Math.floor(left / 60000)); const ss = Math.max(0, Math.floor((left % 60000) / 1000));
  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-violet-700 text-white text-xs font-semibold flex items-center gap-2 px-3" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 6px)", paddingBottom: 6 }} data-testid="support-mode-banner" data-eva-avoid="">
      <span className="flex-1 truncate">Support mode · {s.name} · {mm}:{String(ss).padStart(2, "0")} left · money, bank, KYC & signing locked</span>
      <button type="button" onClick={() => exitSupportMode()} className="h-7 px-3 rounded-lg bg-white text-violet-700 font-bold">Exit</button>
    </div>
  );
}
