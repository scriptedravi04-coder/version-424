// v396 (Ravi): one search box at the top of every admin page. Type a name → creators / brands / waitlist people /
// campaigns; type "waitlist" or "popup" → that section or setting. Each result says what it is (right side), and a
// tap opens it. Ctrl/⌘ + K jumps to the box. Data is read once when you start typing (and kept for 2 minutes).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, LayoutGrid, Settings, User, Building2, ClipboardList, Megaphone, Users, Shield, X } from "lucide-react";
import { api } from "../../lib/api";
import { ADMIN_SECTIONS, ADMIN_SETTINGS, searchAdmin } from "../../lib/adminSearch";

const KIND = {
  section: { label: "Section", Icon: LayoutGrid, cls: "bg-slate-100 text-slate-700 border-slate-200" },
  setting: { label: "Setting", Icon: Settings, cls: "bg-amber-50 text-amber-800 border-amber-200" },
  creator: { label: "Creator", Icon: User, cls: "bg-violet-50 text-violet-700 border-violet-200" },
  unclaimed: { label: "Unclaimed", Icon: User, cls: "bg-orange-50 text-orange-700 border-orange-200" },
  brand: { label: "Brand", Icon: Building2, cls: "bg-sky-50 text-sky-700 border-sky-200" },
  agency: { label: "Agency", Icon: Building2, cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  admin: { label: "Admin", Icon: Shield, cls: "bg-rose-50 text-rose-700 border-rose-200" },
  waitlist: { label: "Waitlist", Icon: ClipboardList, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  campaign: { label: "Campaign", Icon: Megaphone, cls: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
};

let cache = null; // { at, users, waitlist, campaigns }
async function loadData() {
  if (cache && Date.now() - cache.at < 120000) return cache;
  const pick = (p) => p.then((r) => r?.data).catch(() => null);
  const [users, waitlist, campaigns] = await Promise.all([pick(api.get("/admin/users")), pick(api.get("admin/waitlist")), pick(api.get("admin/campaigns"))]);
  cache = {
    at: Date.now(),
    users: Array.isArray(users) ? users : Array.isArray(users?.users) ? users.users : [],
    waitlist: Array.isArray(waitlist) ? waitlist : [],
    campaigns: Array.isArray(campaigns) ? campaigns : Array.isArray(campaigns?.campaigns) ? campaigns.campaigns : [],
  };
  return cache;
}

export default function AdminUniversalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "k") { e.preventDefault(); inputRef.current?.focus(); setOpen(true); } };
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, []);

  useEffect(() => {
    if (q.trim().length < 2 || data || loading) return;
    setLoading(true);
    loadData().then(setData).finally(() => setLoading(false));
  }, [q, data, loading]);

  const results = useMemo(() => searchAdmin(q, data), [q, data]);
  useEffect(() => { setActive(0); }, [q]);

  const go = (r) => {
    if (!r) return;
    setOpen(false); setQ("");
    navigate(r.to);
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); go(results[active]); }
    else if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
  };

  return (
    <div ref={boxRef} className="relative w-full mb-5 z-30" data-testid="admin-universal-search">
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
        <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
          placeholder="Search admin — creators, brands, campaigns, waitlist, settings, sections…"
          aria-label="Search the admin panel" role="combobox" aria-expanded={open && Boolean(q.trim())}
          className="w-full pl-11 pr-20 py-3 bg-white border border-gray-200 rounded-2xl text-[16px] sm:text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-[#E9D5FF] focus:border-[#C084FC]" />
        {q ? (
          <button type="button" onClick={() => { setQ(""); inputRef.current?.focus(); }} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 cursor-pointer"><X size={16} /></button>
        ) : (
          <span className="hidden sm:block absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-500 border border-gray-200 rounded-md px-1.5 py-0.5">Ctrl K</span>
        )}
      </div>

      {open && q.trim() && (
        <div className="absolute left-0 right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-2xl max-h-[min(70vh,560px)] overflow-y-auto py-2" role="listbox" data-testid="admin-search-results">
          {results.length === 0 && !loading && (
            <div className="px-4 py-6 text-center text-sm font-semibold text-gray-500">Nothing found for “{q.trim()}”.</div>
          )}
          {results.map((r, i) => {
            const k = KIND[r.kind] || KIND.section;
            const Icon = k.Icon;
            return (
              <button key={`${r.kind}-${r.id}-${i}`} type="button" role="option" aria-selected={i === active}
                onMouseEnter={() => setActive(i)} onClick={() => go(r)} data-testid="admin-search-result"
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 cursor-pointer ${i === active ? "bg-violet-50/70" : "hover:bg-gray-50"}`}>
                {r.photo ? <img src={r.photo} alt="" className="w-8 h-8 rounded-full object-cover bg-gray-100 shrink-0" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                  : <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 shrink-0"><Icon size={15} /></span>}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-gray-900 truncate">{r.title}</span>
                  {r.sub && <span className="block text-xs text-gray-500 truncate">{r.sub}</span>}
                </span>
                <span className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide border rounded-lg px-2 py-1 ${k.cls}`}>
                  <Icon size={12} />{k.label}
                </span>
              </button>
            );
          })}
          {loading && <div className="px-4 py-3 text-xs font-semibold text-gray-500 flex items-center gap-2"><Users size={13} /> Looking through creators, brands and campaigns…</div>}
        </div>
      )}
    </div>
  );
}

export { ADMIN_SECTIONS, ADMIN_SETTINGS };
