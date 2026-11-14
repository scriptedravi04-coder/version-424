import React, { useEffect, useState } from "react";
import { Ban, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import ModalPortal from "../common/ModalPortal";
import ButtonSpinner from "../common/ButtonSpinner";
import useBusy from "../../lib/useBusy";
import { PopupBackdrop, PopupPanel } from "../common/Popup";

// v337 (App Store 1.2): Block / Unblock a person. Server: backend/blockUsers.ts (GET/POST/DELETE /users/:id/block).
// Used next to "Report this profile" on public creator / brand pages and in the chat ☰ menu (variant="menu").
// All API calls live here, so the locked chat screens only render this component.

const errText = (err, fallback) => err?.response?.data?.error || fallback;

export default function BlockUserButton({ targetId, name = "", variant = "link", className = "", onChange }) {
  const { user } = useAuth() || {};
  const [blocked, setBlocked] = useState(null); // null = not known yet
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { isBusy, anyBusy, run } = useBusy();
  const id = targetId ? String(targetId) : "";
  const own = user && id && (String(user.user_id) === id || String(user.parent_brand_id || "") === id);

  useEffect(() => {
    if (!user || !id || own) return undefined;
    let alive = true;
    api.get(`users/${encodeURIComponent(id)}/block`, { bypassCache: true })
      .then(({ data }) => { if (alive) setBlocked(Boolean(data?.blocked)); })
      .catch(() => { if (alive) setBlocked(false); });
    return () => { alive = false; };
  }, [user, id, own]);

  if (!user || !id || own) return null;
  const who = name || "this person";

  const doBlock = (e) => run("block", async () => {
    e?.preventDefault?.();
    try {
      await api.post(`users/${encodeURIComponent(id)}/block`, { reason: reason.trim() || undefined });
      setBlocked(true);
      setOpen(false);
      setReason("");
      toast.success(`${who} is blocked`, { description: "They can't message, invite or apply to you. Our team has been told." });
      onChange?.(true);
    } catch (err) {
      toast.error(errText(err, "Couldn't block right now. Please try again."));
    }
  });

  const doUnblock = () => run("unblock", async () => {
    try {
      await api.delete(`users/${encodeURIComponent(id)}/block`);
      setBlocked(false);
      toast.success(`${who} is unblocked`);
      onChange?.(false);
    } catch (err) {
      toast.error(errText(err, "Couldn't unblock right now. Please try again."));
    }
  });

  const label = blocked ? "Unblock" : "Block";
  const onTap = () => (blocked ? doUnblock() : setOpen(true));

  const trigger = variant === "menu" ? (
    <button type="button" onClick={onTap} disabled={blocked === null || anyBusy} data-testid="block-user-menu"
      className={`w-full text-left px-4 py-3 hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] font-medium text-sm rounded-xl flex items-center gap-3 transition-colors disabled:opacity-60 ${className}`}>
      {isBusy("unblock") ? <ButtonSpinner /> : <Ban size={16} className="text-red-600" />}
      <span>{blocked ? `Unblock ${name || ""}`.trim() : `Block ${name || ""}`.trim()}</span>
    </button>
  ) : (
    <button type="button" onClick={onTap} disabled={blocked === null || anyBusy} data-testid="block-user"
      className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500 hover:text-rose-600 min-h-[40px] disabled:opacity-60 ${className}`}>
      {isBusy("unblock") ? <ButtonSpinner /> : <Ban size={14} />} {label}
    </button>
  );

  return (
    <>
      {trigger}
      {open && (
        <ModalPortal>
          <PopupBackdrop className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={() => !anyBusy && setOpen(false)}>
            <form onSubmit={doBlock} onClick={(e) => e.stopPropagation()} data-testid="block-user-form"
              className="bg-white w-full sm:max-w-md rounded-t-[24px] sm:rounded-2xl p-5 relative max-h-[90vh] overflow-y-auto"
              style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}>
              <PopupPanel kind="auto" below={640} onClose={() => !anyBusy && setOpen(false)} className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Block {who}?</h2>
                  <p className="text-xs text-gray-500 mt-0.5">They won't be told.</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} disabled={anyBusy} aria-label="Close" className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><X size={16} /></button>
              </PopupPanel>
              <ul className="mt-4 space-y-2 text-sm text-gray-800">
                <li className="flex gap-2"><span aria-hidden>•</span>You won't get messages, invites or applications from each other.</li>
                <li className="flex gap-2"><span aria-hidden>•</span>Your chats with them are hidden. A deal that is already paid stays open so it can finish — messages stay off.</li>
                <li className="flex gap-2"><span aria-hidden>•</span>The Ybex team is told, so we can check their account.</li>
                <li className="flex gap-2"><span aria-hidden>•</span>You can unblock any time from their profile or Help → Blocked people.</li>
              </ul>
              <label className="block mt-4 text-xs font-semibold text-gray-700">Why? (optional, only our team sees it)</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} placeholder="e.g. abusive messages" className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-base sm:text-sm resize-none" />
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => setOpen(false)} disabled={anyBusy} className="h-11 px-4 rounded-xl bg-gray-100 text-sm font-semibold text-gray-800">Cancel</button>
                <button type="submit" disabled={anyBusy} className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                  {isBusy("block") && <ButtonSpinner />} Block
                </button>
              </div>
            </form>
          </PopupBackdrop>
        </ModalPortal>
      )}
    </>
  );
}

/** Help → "Blocked people": list + Unblock. */
export function BlockedPeopleList({ className = "" }) {
  const { user } = useAuth() || {};
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  const { isBusy, run } = useBusy();

  const load = () => {
    setFailed(false);
    api.get("blocks", { bypassCache: true })
      .then(({ data }) => setRows(Array.isArray(data?.blocked) ? data.blocked : []))
      .catch(() => { setFailed(true); setRows([]); });
  };
  useEffect(() => { if (user) load(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!user) return null;

  const unblock = (p) => run(`u:${p.user_id}`, async () => {
    try {
      await api.delete(`users/${encodeURIComponent(p.user_id)}/block`);
      setRows((r) => (r || []).filter((x) => x.user_id !== p.user_id));
      toast.success(`${p.name || "They"} unblocked`);
    } catch (err) {
      toast.error(errText(err, "Couldn't unblock right now. Please try again."));
    }
  });

  return (
    <section className={`rounded-2xl border border-gray-200 bg-white p-4 ${className}`} data-testid="blocked-people">
      <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2"><Ban size={15} className="text-rose-500" /> Blocked people</h3>
      {rows === null && <div className="mt-3 h-10 rounded-xl bg-gray-100 animate-pulse" />}
      {failed && (
        <p className="mt-2 text-xs text-gray-500">Couldn't load the list. <button type="button" onClick={load} className="font-semibold text-[#7C3AED] min-h-[40px]">Try again</button></p>
      )}
      {rows && !failed && rows.length === 0 && <p className="mt-2 text-xs text-gray-500">You haven't blocked anyone.</p>}
      {rows && rows.length > 0 && (
        <ul className="mt-2 divide-y divide-gray-100">
          {rows.map((p) => (
            <li key={p.user_id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{p.name || "Ybex user"}</p>
                {p.role && <p className="text-[11px] text-gray-500 capitalize">{p.role}</p>}
              </div>
              <button type="button" onClick={() => unblock(p)} disabled={isBusy(`u:${p.user_id}`)}
                className="h-10 px-3 rounded-xl bg-gray-100 text-xs font-semibold text-gray-800 flex items-center gap-1.5 disabled:opacity-60">
                {isBusy(`u:${p.user_id}`) && <ButtonSpinner />} Unblock
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
