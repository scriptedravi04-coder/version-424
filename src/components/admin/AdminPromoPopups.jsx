import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Upload, Eye, MousePointerClick } from "lucide-react";
import { api } from "../../lib/api";

// Session 43 (v289, Ravi): Admin → Platform tools → Promo popups. Upload the designer's poster, pick a
// layout, where a tap goes, who sees it and how often. The whole poster is the button; users get a ✕.
const LAYOUTS = [
  { id: "fullscreen", label: "Full screen", hint: "Like Hopr's invite poster — the whole phone screen." },
  { id: "card", label: "Centre card", hint: "Like Hopr's \"New on Hopr\" — a rounded card, app dimmed behind." },
  { id: "sheet", label: "Bottom sheet", hint: "Like Swiggy — slides up from the bottom." },
  { id: "banner", label: "Profile banner", hint: "Like Swish — a strip under the photo on My Profile." },
];
const SIZES = {
  fullscreen: "1080 × 2340 px · keep text and faces inside the middle 1080 × 1920",
  card: "960 × 1400 px · keep 40 px clear on every side (rounded corners)",
  sheet: "1080 × 1200 px · keep the top 120 px clear (✕ and rounded top)",
  banner: "1080 × 200 px · keep text 40 px from the left / right edges",
};
// v348 (Ravi: "banner pe link kahan se nikalun? list de de saari pages ki"): pick the page instead of copying
// links from the web app. Every one opens inside the app (installed app, phone web and desktop).
// v363 (Ravi: "redirection mai sare pages chaiye — jaise portfolio ka nahi hai"): every page a person can land on,
// including the profile / settings screens inside (?section=…), with a search box above the list.
export const APP_PAGES = [
  // v368 (Ravi: "banners / popups ke link mein offer wali screens bhi do"): /offer always opens the CURRENT offer
  // (now the Diwali Creator Challenge), so a banner linked to /offer keeps working when the next offer starts.
  { group: "Offers", items: [
    ["Offer page (now: Diwali Creator Challenge)", "/offer"], ["Offer → Add my reel & enter (creators)", "/creator/settings?section=portfolio&add=1&diwali=1"],
  ] },
  { group: "Everyone", items: [
    ["Just close (no page)", ""], ["Home", "/dashboard"], ["Chat with Ybex Eva", "/dashboard?assist=new"], ["Refer & Earn", "/refer"],
    ["Chats / Inbox", "/chat"], ["Notifications", "/notifications"], ["My profile", "/profile"], ["KYC", "/kyc"],
    ["Settings", "/settings"], ["Help & support", "/help"], ["My support tickets", "/help/tickets"], ["Blog", "/blog"],
    ["Invite friends", "/invite"], ["Terms", "/terms"], ["Privacy policy", "/privacy-policy"], ["Refund policy", "/refunds"],
  ] },
  { group: "Creators", items: [
    ["Campaigns to apply", "/campaigns"], ["UGC jobs", "/creator/ugc/browse"], ["My UGC orders", "/creator/ugc/orders"], ["My deals", "/deals"], ["Earnings & payouts", "/earnings"], ["Find brands", "/brand/discover"],
    ["Profile → Creator info", "/settings?section=profile"], ["Profile → Social platforms", "/settings?section=platforms"],
    ["Profile → Connect Instagram", "/settings?section=platform_instagram"], ["Profile → Rate cards", "/settings?section=rates"],
    ["Profile → Portfolio", "/settings?section=portfolio"], ["Profile → KYC verification", "/settings?section=kyc"],
    ["Profile → Refer & earn", "/settings?section=refer"], ["Profile → Account", "/settings?section=account"],
    ["Profile → Login sessions", "/settings?section=sessions"], ["Profile → Help", "/settings?section=help"], ["Profile → Legal", "/settings?section=legal"],
  ] },
  { group: "Brands", items: [
    ["Find creators (Explore)", "/explore"], ["New campaign", "/brand/campaigns/create"], ["My campaigns", "/brand/campaigns"],
    ["Post a UGC brief", "/brand/ugc/post"], ["Instant UGC", "/brand/ugc/instant"], ["UGC briefs", "/brand/ugc/briefs"], ["UGC orders", "/brand/ugc/orders"],
    ["Payments", "/brand/payments"], ["Brand KYC", "/brand/kyc"], ["Brand inbox", "/brand/inbox"],
    ["Brand profile → Public page", "/brand/profile?section=public"], ["Brand profile → Company details", "/brand/profile?section=company"],
    ["Brand profile → Preferences", "/brand/profile?section=preferences"], ["Brand profile → Contact", "/brand/profile?section=contact"],
    ["Brand profile → KYC", "/brand/profile?section=kyc"], ["Brand profile → Payments", "/brand/profile?section=payments"],
    ["Brand profile → Refer & earn", "/brand/profile?section=refer"], ["Brand profile → Account", "/brand/profile?section=account"],
    ["Brand profile → Help", "/brand/profile?section=help"],
  ] },
];
const PAGE_VALUES = new Set(APP_PAGES.flatMap((g) => g.items.map(([, v]) => v)));
/** Same rule as the server (promo_routes.appPath): a link copied from the web app → the app page. */
export const toAppPath = (v) => {
  const m = /^https?:\/\/(?:www\.)?(?:ybexapp\.ai\.studio|ybexmedia\.in)(\/[^\s]*)?$/i.exec(String(v || "").trim());
  return m ? (m[1] && m[1] !== "/" ? m[1] : "/dashboard") : v;
};
/** v378 (Ravi: "popups jaisa link option banners, notifications aur push mein bhi do — haath se link nahi likhna"):
 *  one page picker for every admin screen that opens a page on tap. Search box + grouped page list + "Other link". */
export function AppPagePicker({ value, onChange, testId = "app-page-picker", className = "", allowExternal = true, otherInput = null }) {
  const [q, setQ] = useState("");
  const [custom, setCustom] = useState(false);
  const v = value || "";
  const known = PAGE_VALUES.has(v);
  const box = "w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-[16px] sm:text-sm text-gray-900 outline-none focus:border-[#7C3AED]";
  return (
    <div className={className}>
      <input className={box} data-testid={`${testId}-search`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages — e.g. KYC, portfolio, earnings, offer" />
      <select className={`${box} mt-2`} data-testid={testId} value={known && !custom ? v : "__other"}
        onChange={(e) => { const nv = e.target.value; if (nv === "__other") setCustom(true); else { setCustom(false); onChange(nv); } }}>
        {APP_PAGES.map((g) => {
          const t = q.trim().toLowerCase();
          const items = g.items.filter(([l, pv]) => !t || pv === v || `${l} ${pv}`.toLowerCase().includes(t));
          return items.length ? <optgroup key={g.group} label={g.group}>{items.map(([l, pv]) => <option key={g.group + l} value={pv}>{l}{pv ? `  (${pv})` : ""}</option>)}</optgroup> : null;
        })}
        <option value="__other">Other link (type it)…</option>
      </select>
      {(custom || (!known && v)) && (otherInput ? otherInput(`${box} mt-2`) :
        <input className={`${box} mt-2`} value={v} onChange={(e) => onChange(toAppPath(e.target.value))} placeholder={allowExternal ? "https://…  or an app page like /refer" : "An app page like /refer"} />
      )}
    </div>
  );
}

const RATIO = { fullscreen: "1080 / 2340", card: "960 / 1400", sheet: "1080 / 1200", banner: "1080 / 200" };
const EMPTY = { title: "", layout: "fullscreen", image_url: "", link_url: "", audience: "all", frequency: "once", starts_at: "", ends_at: "", is_active: true /* Session 48: new promos start Live — "off" by default made uploads look late */, priority: 0 };
// v332: readable audience / frequency in the list (was raw "creator", "guest", "every open")
const AUD_LABEL = { all: "Everyone signed in", creator: "Creators", brand: "Brands", guest: "Not signed up yet" };
const FREQ_LABEL = { once: "Once per person", daily: "Once a day", every_open: "Every app open" };
const toLocal = (iso) => { if (!iso) return ""; const d = new Date(iso); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const status = (p) => {
  const now = Date.now();
  if (!p.is_active) return ["Off", "#6B7280", "#F3F4F6"];
  if (p.starts_at && new Date(p.starts_at).getTime() > now) return ["Scheduled", "#B45309", "#FEF3C7"];
  if (p.ends_at && new Date(p.ends_at).getTime() <= now) return ["Ended", "#6B7280", "#F3F4F6"];
  return ["Live", "#15803D", "#DCFCE7"];
};

export default function AdminPromoPopups() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loaded, setLoaded] = useState(false); // v332: "No promo popups yet." flashed before the list loaded
  const [rowBusy, setRowBusy] = useState(null); // v332: no double toggle / delete
  const fileRef = useRef(null);

  const load = async () => {
    setErr("");
    try { const { data } = await api.get("admin/promos", { bypassCache: true }); setItems(data?.items || []); }
    catch (e) { setErr(e?.response?.data?.error || "Could not load promo popups."); }
    finally { setLoaded(true); }
  };
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const upload = async (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", f);
      const { data } = await api.post("upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      set("image_url", data?.public_url || data?.url || "");
    } catch { toast.error("Couldn't upload the poster. Please try again."); } // v332
    setUploading(false);
  };
  const save = async () => {
    setBusy(true);
    try {
      const { _customLink, _pageSearch, ...clean } = form; // v348: UI-only flags (v363: + page search)
      const body = { ...clean, starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null, ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null };
      await api.post("admin/promos", body);
      toast.success(form.is_active ? "Saved — live for users" : "Saved (off)");
      setForm(null); load();
    } catch (e) { toast.error(e?.response?.data?.error || "Couldn't save. Please try again."); }
    setBusy(false);
  };
  const remove = async (p) => {
    if (rowBusy) return;
    if (!window.confirm(`Delete "${p.title || "this promo"}"?`)) return;
    setRowBusy(p.id);
    try { await api.delete(`admin/promos/${p.id}`); toast.success("Deleted."); load(); } catch { toast.error("Couldn't delete. Please try again."); } // v332: success toast
    finally { setRowBusy(null); }
  };
  const toggle = async (p) => {
    if (rowBusy) return; // v332
    setRowBusy(p.id);
    try { await api.post("admin/promos", { ...p, is_active: !p.is_active }); toast.success(p.is_active ? "Turned off." : "Turned on — live for users."); load(); } catch (e) { toast.error(e?.response?.data?.error || "Couldn't change it. Please try again."); }
    finally { setRowBusy(null); }
  };

  const input = "w-full h-11 px-3 rounded-xl border border-gray-200 text-[16px] sm:text-sm font-medium focus:outline-none focus:border-purple-500"; // v332: no iOS zoom
  return (
    <div className="mt-6" style={{ fontFamily: "'DM Sans', sans-serif" }} data-testid="admin-promos">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-extrabold text-gray-900">Promo popups & profile banner</h3>
          <p className="text-sm text-gray-500">Shown once when the app opens on a phone. The whole poster is tappable; users get a ✕. One popup per app open.</p>
        </div>
        {!form && <button type="button" onClick={() => setForm({ ...EMPTY })} className="h-10 px-4 rounded-xl bg-purple-600 text-white text-sm font-bold flex items-center gap-2"><Plus size={16} /> New promo</button>}
      </div>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      {/* Session 48 (Ravi: "explain this screen — what is priority?") */}
      <details className="mt-4 bg-purple-50/60 border border-purple-100 rounded-2xl p-4 text-[13px] text-gray-700" data-testid="promo-help">
        <summary className="font-bold text-purple-800 cursor-pointer">How this works (read once)</summary>
        <ol className="mt-2 space-y-1.5 list-decimal pl-5">
          <li><b>Layout</b> — where the poster shows: full screen, a centre card, a bottom sheet, or the thin <b>Profile banner</b> on My Profile. Use the designer size shown under it.</li>
          <li><b>Poster</b> — upload the image. The whole image is the button.</li>
          <li><b>Tap opens</b> — pick the page from the list (Refer & Earn, Chat with Ybex Eva, …), or "Other link" for any <code>https://</code> address. "Just close" = the tap only closes it.</li>
          <li><b>Who sees it</b> — everyone, only creators, only brands, or people who installed the app but haven't signed up.</li>
          <li><b>How often</b> — once per person, once a day, or every time the app opens.</li>
          <li><b>Starts / Ends</b> — optional. Empty start = live right after you save. Empty end = stays until you turn it off.</li>
          <li><b>Priority</b> — only for <b>popups</b> (full screen / centre card / bottom sheet): one popup per app open. Higher number shows first; popups with the <b>same number take turns</b> (one this open, the other next open). A "once" popup someone already saw no longer blocks the next one. The <b>Profile banner</b> is separate — it always shows on My Profile, whatever popups are live.</li>
          <li><b>Live</b> — tick = users can see it. Untick = saved but hidden.</li>
        </ol>
        <p className="mt-2 text-gray-500">After you save: the popup shows the next time someone opens the app or comes back to it (within about a minute). People who already saw a "once" popup won't see it again — edit it (or make a new one) to show it again.</p>
      </details>

      {form && (
        <div className="mt-5 grid md:grid-cols-[1fr_260px] gap-6 bg-white border border-gray-100 rounded-2xl p-5">
          <div className="space-y-4">
            <div><label className="text-xs font-bold text-gray-500 uppercase">Name (only admins see it)</label><input className={input} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Diwali invite offer" /></div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">Layout</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
                {LAYOUTS.map((l) => (
                  <button key={l.id} type="button" onClick={() => set("layout", l.id)} className={`text-left p-3 rounded-xl border ${form.layout === l.id ? "border-purple-600 bg-purple-50" : "border-gray-200"}`}>
                    <div className="text-sm font-bold text-gray-900">{l.label}</div><div className="text-[11.5px] text-gray-500 mt-0.5">{l.hint}</div>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[12.5px] font-semibold text-purple-700" data-testid="promo-size-hint">Designer size: {SIZES[form.layout]}</p>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">Poster</label>
              <div className="flex items-center gap-2 mt-1">
                <button type="button" onClick={() => fileRef.current?.click()} className="h-11 px-4 rounded-xl border border-gray-200 text-sm font-bold flex items-center gap-2"><Upload size={15} /> {uploading ? "Uploading…" : form.image_url ? "Change poster" : "Upload poster"}</button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={upload} />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">Tap opens</label>
              {/* v363: search the page list (it's long now) */}
              <input className={input} data-testid="promo-link-search" value={form._pageSearch || ""} onChange={(e) => setForm((f) => ({ ...f, _pageSearch: e.target.value }))} placeholder="Search pages — e.g. portfolio, payments, KYC" />
              {/* v348: pick a page from the list; "Other link" = type any https:// address */}
              <select className={`${input} mt-2`} data-testid="promo-link-page"
                value={PAGE_VALUES.has(form.link_url || "") && !form._customLink ? (form.link_url || "") : "__other"}
                onChange={(e) => { const v = e.target.value; if (v === "__other") setForm((f) => ({ ...f, _customLink: true })); else setForm((f) => ({ ...f, link_url: v, _customLink: false })); }}>
                {APP_PAGES.map((g) => {
                  const q = String(form._pageSearch || "").trim().toLowerCase();
                  // the chosen page always stays in the list, so the select never shows a blank value
                  const items = g.items.filter(([l, v]) => !q || v === (form.link_url || "") || `${l} ${v}`.toLowerCase().includes(q));
                  return items.length ? <optgroup key={g.group} label={g.group}>{items.map(([l, v]) => <option key={l} value={v}>{l}{v ? `  (${v})` : ""}</option>)}</optgroup> : null;
                })}
                <option value="__other">Other link (type it)…</option>
              </select>
              {(form._customLink || !PAGE_VALUES.has(form.link_url || "")) && (
                <input className={`${input} mt-2`} value={form.link_url} onChange={(e) => set("link_url", toAppPath(e.target.value))} placeholder="https://…  or an app page like /refer" />
              )}
              <p className="mt-1 text-[11.5px] text-gray-500">Pick the page. A link copied from the web app (https://ybexapp.ai.studio/…) is turned into the app page by itself. Pages under "Creators" / "Brands" only work for that group — set "Who sees it" to match.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-bold text-gray-500 uppercase">Who sees it</label>
                <select className={input} value={form.audience} onChange={(e) => set("audience", e.target.value)}>
                  <option value="all">Everyone signed in</option><option value="creator">Creators</option><option value="brand">Brands</option><option value="guest">Not signed up yet (installed app)</option>
                </select></div>
              <div><label className="text-xs font-bold text-gray-500 uppercase">How often</label>
                <select className={input} value={form.frequency} onChange={(e) => set("frequency", e.target.value)}>
                  <option value="once">Once per person</option><option value="daily">Once a day</option><option value="every_open">Every app open</option>
                </select></div>
              <div><label className="text-xs font-bold text-gray-500 uppercase">Starts (optional)</label><input type="datetime-local" className={input} value={toLocal(form.starts_at)} onChange={(e) => set("starts_at", e.target.value)} /></div>
              <div><label className="text-xs font-bold text-gray-500 uppercase">Ends (optional)</label><input type="datetime-local" className={input} value={toLocal(form.ends_at)} onChange={(e) => set("ends_at", e.target.value)} /></div>
              <div><label className="text-xs font-bold text-gray-500 uppercase">Priority (higher wins)</label><input type="number" className={input} value={form.priority} onChange={(e) => set("priority", e.target.value)} />
                <p className="mt-1 text-[11.5px] text-gray-500">{form.layout === "banner" ? "Profile banner: only matters if 2+ profile banners are live." : "Only between popups. Same number = they take turns. Doesn't affect the Profile banner."}</p></div>
              <label className="flex items-center gap-2 mt-6 text-sm font-bold text-gray-800"><input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Live (users can see it)</label>
            </div>
            {/* v332: Cancel on the left, Save on the right (AGENTS.md button order) */}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setForm(null)} className="h-11 px-5 rounded-xl border border-gray-200 text-sm font-bold">Cancel</button>
              <button type="button" onClick={save} disabled={busy || uploading || !form.image_url} className="h-11 px-5 rounded-xl bg-purple-600 text-white text-sm font-bold disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
            </div>
          </div>
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase mb-2">Preview</div>
            <div className="relative mx-auto rounded-[28px] overflow-hidden border-4 border-gray-900 bg-[#F4F4F8]" style={{ width: 240, aspectRatio: "390 / 844" }}>
              {form.image_url && (form.layout === "fullscreen" ? (
                <img src={form.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
              ) : form.layout === "banner" ? (
                <div className="absolute inset-x-3 top-24"><div className="h-16 rounded-xl bg-white mb-2" /><img src={form.image_url} alt="" className="w-full object-cover rounded-lg" style={{ aspectRatio: RATIO.banner }} /></div>
              ) : form.layout === "card" ? (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><img src={form.image_url} alt="" className="w-[86%] object-cover rounded-2xl" style={{ aspectRatio: RATIO.card }} /></div>
              ) : (
                <div className="absolute inset-0 bg-black/60"><img src={form.image_url} alt="" className="absolute bottom-0 left-0 w-full object-cover rounded-t-2xl" style={{ aspectRatio: RATIO.sheet }} /></div>
              ))}
              {form.image_url && form.layout !== "banner" && <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/90 text-[12px] font-bold flex items-center justify-center">✕</div>}
              {!form.image_url && <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500 px-6 text-center">Upload a poster to see it here</div>}
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-3">
        {items.map((p) => {
          const [label, fg, bg] = status(p);
          return (
            <div key={p.id} className="flex flex-wrap items-center gap-3 sm:gap-4 bg-white border border-gray-100 rounded-2xl p-3" data-testid="promo-row">{/* v332: wraps on phones */}
              {p.image_url ? <img src={p.image_url} alt="" className="w-14 h-20 object-cover rounded-lg bg-gray-100 shrink-0" /> : <div className="w-14 h-20 rounded-lg bg-gray-100 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className="font-bold text-gray-900 truncate">{p.title || "Untitled promo"}</span><span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">{p.layout === "banner" ? "My Profile strip" : "Popup"}</span><span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: fg, background: bg }}>{label}</span></div>
                <div className="text-xs text-gray-500 mt-0.5">{LAYOUTS.find((l) => l.id === p.layout)?.label || "—"} · {AUD_LABEL[p.audience] || p.audience || "—"} · {FREQ_LABEL[p.frequency] || String(p.frequency || "—").replace("_", " ")} · → {p.link_url || "close"}{/* v332 */}</div>
                <div className="text-xs text-gray-500 mt-0.5 flex gap-3"><span className="flex items-center gap-1"><Eye size={12} /> {p.views || 0}</span><span className="flex items-center gap-1"><MousePointerClick size={12} /> {p.clicks || 0}</span></div>
              </div>
              <button type="button" disabled={rowBusy === p.id} onClick={() => toggle(p)} className="h-9 px-3 rounded-xl border border-gray-200 text-xs font-bold disabled:opacity-50">{p.is_active ? "Turn off" : "Turn on"}</button>
              <button type="button" onClick={() => setForm({ ...p })} aria-label="Edit promo" className="p-2 rounded-xl bg-gray-50"><Pencil size={15} /></button>
              <button type="button" disabled={rowBusy === p.id} onClick={() => remove(p)} aria-label="Delete promo" className="p-2 rounded-xl bg-red-50 text-red-600 disabled:opacity-50"><Trash2 size={15} /></button>{/* v332: aria-labels */}
            </div>
          );
        })}
        {!items.length && !err && !form && <p className="text-sm text-gray-500">{loaded ? "No promo popups yet." : "Loading…"}</p>}
      </div>
    </div>
  );
}
