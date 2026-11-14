import { AppPagePicker } from "./AdminPromoPopups"; // v378
import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, Send, Clock, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { VALID_NICHES } from "../../lib/constants";
import ButtonSpinner from "../common/ButtonSpinner";
import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";

// Session 41 (Ravi) — promo push notifications (Zomato style). Write any language. Audience:
// everyone / creators / brands / creators of chosen niches (city = Phase 2). Send now or schedule.
// No daily limit on promo pushes (Session 43, Ravi). Deal pushes are automatic.
const EMPTY = { title: "", message: "", url: "", audience: "all", niches: [], when: "now", send_at: "" };
const AUD = { all: "Everyone", creator: "Creators", brand: "Brands", niche: "Creators by niche", guest: "Installed, not signed up" };

export default function PushNotificationsManager() {
  const [state, setState] = useState({ enabled: true, devices: 0, items: [] });
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [itemToCancel, setItemToCancel] = useState(null);
  // Session 43: "Send now" goes to real phones at once — ask first, in-app (the browser confirm box is
  // blocked in some embedded previews, so it silently did nothing there).
  const [confirmSend, setConfirmSend] = useState(false);
  const [loadState, setLoadState] = useState("loading"); // v332: "loading" | "ok" | "error" — a failed load read "Nothing sent yet"

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("admin/push", { bypassCache: true });
      setState({ enabled: data?.enabled !== false, devices: data?.devices || 0, items: Array.isArray(data?.items) ? data.items : [] });
      setLoadState("ok");
    } catch (e) {
      setLoadState((s) => (s === "ok" ? s : "error")); // v332
      toast.error(e?.response?.data?.error || "Couldn't load push notifications.");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggleNiche = (n) => setForm((f) => ({ ...f, niches: f.niches.includes(n) ? f.niches.filter((x) => x !== n) : [...f.niches, n] }));

  const submit = () => {
    if (!form.title.trim()) {
      toast.error("Please add a title.");
      return;
    }
    if (!form.message.trim()) {
      toast.error("Please add a message.");
      return;
    }
    if (form.when === "later" && !form.send_at) {
      toast.error("Please pick a date and time to schedule.");
      return;
    }
    if (form.when === "later" && new Date(form.send_at) <= new Date()) { // v332: a past time "scheduled" fine but never made sense
      toast.error("Please pick a time in the future.");
      return;
    }
    if (form.when === "now") { setConfirmSend(true); return; }
    send();
  };

  const send = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("admin/push", {
        title: form.title.trim(),
        message: form.message.trim(),
        url: form.url.trim(),
        audience: form.audience,
        niches: form.niches,
        send_at: form.when === "later" && form.send_at ? new Date(form.send_at).toISOString() : null,
      });
      const rep = data?.report;
      if (form.when === "later") toast.success("Push notification scheduled.");
      else if (rep && rep.sent === 0) toast.warning(`Sent to 0 phones. ${rep.reason || ""}`.trim(), { duration: 8000 });
      else if (rep) toast.success(`Sent to ${rep.sent} phone${rep.sent === 1 ? "" : "s"} (${rep.audience} people in this audience, ${rep.devices} with notifications on). Browser ${rep.web ?? 0} · Android app ${rep.android ?? 0} · iPhone ${rep.iphone ?? 0}${rep.failed ? ` · ${rep.failed} refused (${rep.last_error || "error"})` : ""}${rep.removed ? ` · ${rep.removed} dead phones removed` : ""}. "Sent" means the phone company accepted it — the phone still needs notifications allowed.`, { duration: 12000 });
      else toast.success("Push notification sent successfully!");
      setForm(EMPTY);
      setConfirmSend(false);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.error || "Could not send push notification.");
    } finally {
      setBusy(false);
    }
  };

  const handleCancelScheduled = async () => {
    if (!itemToCancel) return;
    setBusy(true);
    try {
      await api.delete(`admin/push/${itemToCancel.id}`);
      toast.success("Scheduled push notification cancelled.");
      setItemToCancel(null);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.error || "Could not cancel.");
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2.5 text-[16px] sm:text-sm"; // v332: 16px on phones (no iOS zoom)

  return (
    <div className="p-4 md:p-6 max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center"><BellRing size={18} /></div>
        <div>
          <h1 className="text-xl font-bold">Push notifications</h1>
          <p className="text-xs text-[var(--text-secondary)]">
            Phone notifications, even when the app is closed. {loadState === "ok" ? `${state.devices} phone${state.devices === 1 ? "" : "s"} allowed so far.` : ""}{/* v332: no "0 phones" before / after a failed load */}
          </p>
        </div>
      </div>

      {!state.enabled && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          Push notifications are not switched on for the server yet, so nothing will reach phones. Ask your developer to set up push (VAPID keys).{/* v332: plainer words */}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <div className="rounded-2xl border border-[var(--border-default)] p-4 space-y-3 bg-[var(--bg-card)]">
          <input className={input} placeholder="Title — e.g. your reel deserves a paycheck 💸" value={form.title} onChange={set("title")} maxLength={80} />
          <textarea className={`${input} h-24`} placeholder="Message — any language, emojis welcome" value={form.message} onChange={set("message")} maxLength={240} />
          {/* v378: pick the page instead of typing it (same list as Promo popups / Banners) */}
          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase">Tap opens</label>
            <AppPagePicker value={form.url} onChange={(v) => setForm((f) => ({ ...f, url: v }))} testId="push-page-picker" allowExternal={false} />
          </div>
          <select className={input} value={form.audience} onChange={set("audience")}>
            <option value="all">Everyone (incl. not signed up)</option>
            <option value="creator">Creators only</option>
            <option value="brand">Brands only</option>
            <option value="niche">Creators of these niches…</option>
            <option value="guest">Installed the app, not signed up yet</option>
          </select>
          {form.audience === "niche" && (
            <div className="flex flex-wrap gap-1.5">
              {VALID_NICHES.map((n) => (
                <button key={n} type="button" onClick={() => toggleNiche(n)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${form.niches.includes(n) ? "bg-violet-600 text-white border-violet-600" : "border-[var(--border-default)]"}`}>
                  {n}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5"><input type="radio" checked={form.when === "now"} onChange={() => setForm((f) => ({ ...f, when: "now" }))} /> Send now</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={form.when === "later"} onChange={() => setForm((f) => ({ ...f, when: "later" }))} /> Schedule</label>
            {form.when === "later" && <input type="datetime-local" className={`${input} w-auto`} value={form.send_at} onChange={set("send_at")} />}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy || !form.title.trim() || !form.message.trim() || (form.when === "later" && !form.send_at)}
              onClick={submit}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
            >
              {busy ? (
                <ButtonSpinner label={form.when === "later" ? "Scheduling…" : "Sending…"} />
              ) : (
                <>
                  {form.when === "later" ? <Clock size={15} /> : <Send size={15} />}
                  <span>{form.when === "later" ? "Schedule" : "Send now"}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Phone preview */}
        <div>
          <div className="text-xs font-bold text-[var(--text-secondary)] mb-2">Preview</div>
          <div className="rounded-[22px] bg-[#1C1C1E] p-4">
            <div className="rounded-2xl bg-[#2C2C2E] p-3 flex gap-3">
              <img src="/pwa-192x192.png" alt="" className="w-9 h-9 rounded-lg shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2"><span className="text-[11px] text-white/60">Ybex · now</span></div>
                <div className="text-[13.5px] font-semibold text-white break-words">{form.title || "Your title"}</div>
                <div className="text-[13px] text-white/85 break-words">{form.message || "Your message"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-bold">History</div>
        {/* v332: loading / failed load no longer read "Nothing sent yet." */}
        {loadState === "loading" && state.items.length === 0 && <div className="text-sm text-[var(--text-secondary)]">Loading…</div>}
        {loadState === "error" && state.items.length === 0 && <div className="text-sm text-red-600">Couldn't load the history. <button type="button" onClick={load} className="underline font-semibold">Try again</button></div>}
        {loadState === "ok" && state.items.length === 0 && <div className="text-sm text-[var(--text-secondary)]">Nothing sent yet.</div>}
        {state.items.map((it) => (
          <div key={it.id} className="rounded-2xl border border-[var(--border-default)] p-3 bg-[var(--bg-card)] flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm">{it.title}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  {AUD[it.audience] || "Everyone"}{it.audience === "niche" && Array.isArray(it.niches) ? `: ${it.niches.join(", ")}` : ""}
                </span>
                {it.sent_at
                  ? (Number(it.sent_count || 0) === 0
                    ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800" title="Nobody in this audience had notifications turned on (or the audience was empty).">Sent to 0 phones · nobody had notifications on</span>
                    : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Sent to {it.sent_count} phone{it.sent_count === 1 ? "" : "s"}</span>)
                  : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Scheduled {it.send_at ? new Date(it.send_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) /* v330: IST */ : ""}</span>}
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-1 break-words">{it.message}</div>
            </div>
            {!it.sent_at && (
              <button
                type="button"
                onClick={() => setItemToCancel(it)}
                title="Cancel"
                aria-label="Cancel scheduled push" /* v332 */
                className="p-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors cursor-pointer"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* In-app confirmation before a push goes out now */}
      <Presence>
        {confirmSend && (
          <PopupBackdrop
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
            onClick={() => !busy && setConfirmSend(false)}
          >
            <PopupPanel
              kind="modal"
              className="w-full max-w-sm bg-[var(--bg-card)] rounded-2xl border border-[var(--border-default)] p-5 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                  <Send size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-[var(--text-primary)]">Send now?</h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 break-words">
                    "{form.title.trim()}" goes to {AUD[form.audience] || "Everyone"}{form.audience === "niche" && form.niches.length ? ` (${form.niches.join(", ")})` : ""} right away. It can't be taken back.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmSend(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold border border-[var(--border-default)] hover:bg-[var(--bg-elevated)] transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={send}
                  className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold shadow-md inline-flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {busy ? <ButtonSpinner label="Sending…" /> : <><Send size={15} /><span>Send now</span></>}
                </button>
              </div>
            </PopupPanel>
          </PopupBackdrop>
        )}
      </Presence>

      {/* In-app confirmation modal for cancelling scheduled push */}
      <Presence>
        {Boolean(itemToCancel) && (
          <PopupBackdrop
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
            onClick={() => !busy && setItemToCancel(null)}
          >
            <PopupPanel
              kind="modal"
              className="w-full max-w-sm bg-[var(--bg-card)] rounded-2xl border border-[var(--border-default)] p-5 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                  <Trash2 size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">Cancel Push</h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    Are you sure you want to cancel "{itemToCancel?.title}"?
                  </p>
                </div>
              </div>

              {/* Action buttons adhering to standard: Left = Dismissive, Right = Affirmative Action */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setItemToCancel(null)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold border border-[var(--border-default)] hover:bg-[var(--bg-elevated)] transition-colors"
                >
                  Keep
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCancelScheduled}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold shadow-md inline-flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {busy ? <ButtonSpinner label="Cancelling…" /> : "Cancel Push"}
                </button>
              </div>
            </PopupPanel>
          </PopupBackdrop>
        )}
      </Presence>
    </div>
  );
}
