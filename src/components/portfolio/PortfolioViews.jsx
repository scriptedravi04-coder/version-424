import React, { useEffect, useRef, useState } from "react";
import { Plus, ExternalLink, Trash2, X, Pencil, Play, Heart } from "lucide-react";
import { Cover, BrandInitial, GLASS } from "./PortfolioParts";
import { groupLine, shortDate, cleanBrand, itemStat } from "./portfolioModel";
import { isStamped, MAX_ENTRIES, PRIZE_POOL, dayText, datesFrom, isEntryLink, entryKey, qualifies } from "../../lib/diwaliChallenge"; // v372, v373
import { DiyaTile, useDesignFonts } from "../challenge/Festive"; // v372
import SocialLogo from "../common/SocialLogo"; // v364: real platform logos
import { EntryRibbon } from "../challenge/ChallengeUi"; // v367: "🪔 Entry" ribbon
import { appConfirm } from "../common/Popup"; // v430: app confirm sheet

// v363 (Ravi's design): 1h empty state, 1e frosted brand stacks (+ grid view) and the brand sheet to edit / remove.

export function PortfolioEmpty({ onAdd, collabCount = 0, handle = "" }) {
  return (
    <div className="flex flex-col items-center text-center px-6 pt-16 pb-10" data-testid="portfolio-empty">
      <div className="relative w-[230px] h-[190px]">
        <div className={`absolute left-2 top-8 w-[108px] h-[132px] rounded-[22px] ${GLASS} -rotate-[10deg]`} />
        <div className={`absolute right-2 top-8 w-[108px] h-[132px] rounded-[22px] ${GLASS} rotate-[10deg]`} />
        <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[118px] h-[150px] rounded-[24px] bg-white/85 backdrop-blur-xl border border-white shadow-[0_18px_40px_-18px_rgba(76,29,149,0.45)] flex items-center justify-center">
          <button type="button" onClick={onAdd} aria-label="Add your first collab" className="w-14 h-14 rounded-full bg-[#7C3AED] text-white flex items-center justify-center shadow-[0_10px_22px_-8px_rgba(124,58,237,1)]">
            <Plus size={24} />
          </button>
        </div>
      </div>
      <h3 className="mt-7 text-[22px] font-black tracking-tight text-slate-900">No brand collabs yet</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-slate-500 max-w-[290px]">Add the paid work you've done for brands. It's the first thing brands check before they hire you.</p>
      <button type="button" onClick={onAdd} className="mt-6 h-[52px] px-7 rounded-full bg-[#7C3AED] text-white text-[15px] font-bold shadow-[0_12px_24px_-12px_rgba(124,58,237,1)]">
        Add your first collab
      </button>
      {collabCount > 0 && handle && (
        <span className="mt-4 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-white/80 border border-emerald-100 text-[12.5px] font-semibold text-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {collabCount} collab{collabCount === 1 ? "" : "s"} found on @{handle}
        </span>
      )}
    </div>
  );
}

// v372 (Ravi's "Portfolio Flow" design 4a "Bento wall" + "alag alag size, collage jaisa"): every piece on one wall
// instead of grouped rows. The best collab is pinned big (a Diwali entry first, else the most viewed), the rest fall
// into a mixed-size collage (tall, wide, small, another big one…) packed with CSS grid "dense". Brand chips on top
// filter the wall, the add tile says how many posts were found on Instagram, and a Diwali strip with "Add entry"
// sits at the bottom while entries are open. Tap a tile → that brand's sheet (rename / remove), as before.
const COLLAGE = ["s", "tall", "s", "wide", "s", "s", "big", "s", "tall", "s", "wide", "s"];
const SPAN = { big: "col-span-2 row-span-2", tall: "row-span-2", wide: "col-span-2", s: "" };
const PJS = "'DM Sans',sans-serif"; // v430: app font everywhere (was Plus Jakarta Sans)

function score(it) { return (Number(it?.views) || 0) + (Number(it?.likes) || 0) * 10; }

/** Pure: pinned first, then the newest; each gets a collage size. */
export function bentoLayout(items) {
  const list = [...(items || [])];
  if (!list.length) return [];
  const entries = list.filter(isStamped);
  const pin = (entries.length ? entries : list).reduce((a, b) => (score(b) > score(a) ? b : a));
  const rest = list.filter((x) => x !== pin).sort((a, b) => (Date.parse(b?.date || "") || 0) - (Date.parse(a?.date || "") || 0));
  return [{ item: pin, size: "big", pinned: true }, ...rest.map((item, i) => ({ item, size: COLLAGE[i % COLLAGE.length], pinned: false }))];
}

function Tile({ t, onOpen }) {
  const { item: it, size, pinned } = t;
  const big = size === "big";
  const s = itemStat(it);
  const brand = it.brand_name || "Other work";
  return (
    <button type="button" onClick={onOpen} className={`relative overflow-hidden text-left bg-[#0B0B0F] shadow-[0_8px_18px_rgba(11,11,15,0.14)] ${big ? "rounded-[22px]" : "rounded-2xl"} ${SPAN[size]}`}
      aria-label={`${brand}${s ? `, ${s.text} ${s.kind}` : ""}`} data-size={size}>
      <Cover src={it.cover} className="absolute inset-0 w-full h-full" label={it.platform === "youtube" ? "YouTube" : ""} />
      <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height: big ? 110 : 64, background: "linear-gradient(rgba(11,11,15,0), rgba(11,11,15,.75))" }} />
      {isStamped(it) && <span className="absolute top-2 left-2 h-5 px-[7px] rounded-[10px] bg-[#FF7A1A] flex items-center text-[11px] font-extrabold tracking-[0.4px] text-white whitespace-nowrap" style={{ fontFamily: PJS }} data-testid="challenge-ribbon">DIWALI ENTRY</span>}
      {s && (
        <span className="absolute top-2 right-2 h-5 px-[7px] rounded-[10px] bg-[#0B0B0F]/45 flex items-center gap-[3px] text-[11px] font-bold text-white" style={{ fontFamily: PJS }}>
          {s.kind === "views" ? <Play size={8} fill="currentColor" /> : <Heart size={9} />}{s.text}{it.self_reported ? "*" : ""}
        </span>
      )}
      {pinned && <span className="absolute left-3 right-3 bottom-[46px] text-[11px] font-medium text-white/80 pointer-events-none" style={{ fontFamily: PJS }}>Pinned · top collab</span>}
      <span className={`absolute flex items-center gap-1.5 pointer-events-none ${big ? "left-3 right-2 bottom-3" : "left-2 right-2 bottom-2"}`}>
        <span className="rounded-full bg-[#0B0B0F] border-[1.5px] border-white flex items-center justify-center font-extrabold text-white shrink-0"
          style={{ width: big ? 28 : 20, height: big ? 28 : 20, fontSize: big ? 12 : 8, fontFamily: PJS }}>{it.brand_name ? (cleanBrand(it.brand_name)[0] || "?").toUpperCase() : "?"}</span>
        <span className="font-bold text-white truncate" style={{ fontSize: big ? 14 : 11, fontFamily: PJS }}>{brand}</span>
      </span>
    </button>
  );
}

export function PortfolioStacks({ groups, items, onOpen, onAdd, found = 0, handle = "", challenge = null }) {
  const [filter, setFilter] = useState("all");
  useDesignFonts(); // v372
  const box = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const measure = () => setW(el.clientWidth || 0);
    measure();
    let ro = null;
    try { ro = new ResizeObserver(measure); ro.observe(el); } catch { window.addEventListener("resize", measure); }
    return () => { try { ro?.disconnect(); } catch { /* ignore */ } window.removeEventListener("resize", measure); };
  }, []);
  const shown = filter === "all" ? items : (groups.find((g) => g.key === filter)?.items || items);
  const tiles = bentoLayout(shown);
  const row = Math.max(120, Math.round(((w || 343) - 16) / 3 * 1.5));
  const named = groups.filter((g) => g.key !== "__none");
  const openOf = (it) => onOpen(groups.find((g) => g.items.includes(it)));
  const entries = (challenge?.entries || []).length;
  const showDiwali = Boolean(challenge && challenge.phase === "open" && challenge.is_creator !== false);
  const amount = (/₹[\d,]+/.exec(String(challenge?.pool || PRIZE_POOL)) || ["₹1,00,000"])[0];
  const chip = (on) => `h-[34px] px-[13px] rounded-full shrink-0 whitespace-nowrap flex items-center gap-1.5 text-[12.5px] font-bold ${on ? "bg-[#0B0B0F] text-white" : `${GLASS} text-[#3A3A44]`}`;

  return (
    <div className="relative flex flex-col gap-3" data-testid="portfolio-stacks" style={{ fontFamily: PJS }}>
      {named.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto -mr-4 pr-4 pb-0.5 no-scrollbar" role="tablist" aria-label="Filter by brand">
          <button type="button" role="tab" aria-selected={filter === "all"} onClick={() => setFilter("all")} className={chip(filter === "all")}>
            All<span className={`text-[11px] font-bold ${filter === "all" ? "text-white/60" : "text-[#767680]"}`}>{items.length}</span>
          </button>
          {groups.map((g) => (
            <button key={g.key} type="button" role="tab" aria-selected={filter === g.key} onClick={() => setFilter(filter === g.key ? "all" : g.key)} className={chip(filter === g.key)}>
              {g.brand}<span className={`text-[11px] font-bold ${filter === g.key ? "text-white/60" : "text-[#767680]"}`}>{g.items.length}</span>
            </button>
          ))}
        </div>
      )}

      <div ref={box} className="grid grid-cols-3 gap-2" style={{ gridAutoRows: `${row}px`, gridAutoFlow: "row dense" }} data-testid="bento-wall">
        {tiles.map((t) => <Tile key={t.item.id} t={t} onOpen={() => openOf(t.item)} />)}
        {onAdd && (
          <button type="button" onClick={onAdd} className="col-span-2 rounded-2xl border-[1.5px] border-dashed border-[#C4B5FD] bg-white/40 flex flex-col items-center justify-center gap-2 text-center px-4" data-testid="bento-add">
            <span className="w-9 h-9 rounded-full bg-[#7C3AED] flex items-center justify-center text-white shadow-[0_6px_14px_rgba(124,58,237,0.3)]"><Plus size={18} /></span>
            <span className="text-[13px] font-bold text-[#0B0B0F]">Add a collab</span>
            <span className="text-[11px] leading-snug font-medium text-[#6E6E78]">{found > 0 && handle ? `${found} found on @${handle}` : "Paste a link or upload a video"}</span>
          </button>
        )}
      </div>

      {showDiwali && (
        <div className="rounded-[20px] p-2.5 border border-[#F7D9A8] flex items-center gap-2.5" style={{ background: "linear-gradient(120deg,#FFF6E6,#FFE2B8)" }} data-testid="diwali-strip">
          <DiyaTile size={34} />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] leading-tight font-extrabold text-[#3A0A0E]">Diwali entries · {entries} of {MAX_ENTRIES}</div>
            <div className="text-[11px] font-semibold text-[#B45309] truncate">Ends {dayText(datesFrom(challenge).closesAt)} · win up to {amount}</div>
          </div>
          {onAdd && entries < MAX_ENTRIES && <button type="button" onClick={onAdd} className="h-[34px] px-[13px] rounded-full bg-[#FF7A1A] text-white text-[12px] font-extrabold whitespace-nowrap">Add entry</button>}
        </div>
      )}
    </div>
  );
}

/** Long-press / tap a stack: rename the brand, open or remove single pieces (asks first). */
/** v373: can this saved piece still be entered in the Diwali Challenge? (server decides; this only shows the button) */
export function canEnterExisting(it, challenge) {
  if (!it || !challenge || challenge.phase !== "open" || challenge.is_creator === false) return false;
  if (!(challenge.eligible ?? challenge.onboarded)) return false;
  if ((challenge.left || 0) < 1 || isStamped(it) || !isEntryLink(it.content_url)) return false;
  const done = new Set((challenge.entries || []).map((e) => entryKey(e.content_url)));
  if (done.has(entryKey(it.content_url))) return false;
  return qualifies(it.brand_name, [it.description, it.caption], challenge.sponsor_names || []);
}

export function BrandSheet({ group, onClose, onRename, onRemove, busy, challenge = null, onEnter = null }) {
  const [name, setName] = useState(group?.key === "__none" ? "" : group?.brand || "");
  const [editing, setEditing] = useState(group?.key === "__none"); // v372: no brand yet → ask for it straight away
  // v373 deep test: a reel already in the portfolio (added before the challenge, toggle off, or the entry failed) had
  // no way in — Add collabs hides it as a duplicate. Each such piece now gets "Enter" here.
  const [entering, setEntering] = useState(null); // item id waiting for the Instagram username
  const [igName, setIgName] = useState("");
  const [enterBusy, setEnterBusy] = useState(false);
  if (!group) return null;
  const typed = cleanBrand(name);
  const enteredKeys = new Set((challenge?.entries || []).map((e) => entryKey(e.content_url)));
  const isEntry = (it) => isStamped(it) || enteredKeys.has(entryKey(it.content_url));
  const handleOk = /^@?[A-Za-z0-9._]{1,30}$/.test(igName.trim());
  const enter = async (it, handle = "") => {
    if (!onEnter || enterBusy) return;
    if (challenge?.need_handle && !handle) { setEntering(it.id); return; }
    setEnterBusy(true);
    try { await onEnter(it, handle); setEntering(null); } finally { setEnterBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center" data-testid="brand-sheet">
      <div className="absolute inset-0 bg-[#1B1430]/30 backdrop-blur-sm" onClick={onClose} />
      {/* v372: solid — the stacks showed through on iPhone */}
      <div className="relative w-full max-w-[480px] max-h-[86vh] max-h-[calc(100dvh-16px)] overflow-y-auto overscroll-contain rounded-t-[28px] bg-[#FCFAFF] border border-white px-4 pt-2 pb-[calc(18px+env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" />
        <div className="flex items-center gap-3">
          <BrandInitial name={group.key === "__none" && !typed ? "?" : (typed || group.brand)} size={38} />
          {editing ? (
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} autoFocus placeholder="Brand name" aria-label="Brand name"
              className="flex-1 min-w-0 h-11 rounded-xl border-2 border-[#7C3AED] px-3 text-[16px] font-bold outline-none" />
          ) : (
            <div className="flex-1 min-w-0">
              <div className="text-[18px] font-black text-slate-900 truncate">{group.brand}</div>
              <div className="text-[12px] text-slate-500 font-medium">{groupLine(group)}</div>
            </div>
          )}
          {editing ? (
            <button type="button" disabled={!typed || busy} onClick={async () => { if (await onRename(group, typed)) setEditing(false); }} className="h-11 px-4 rounded-xl bg-[#7C3AED] text-white text-[13px] font-bold disabled:opacity-40">Save</button>
          ) : (
            <button type="button" onClick={() => setEditing(true)} aria-label="Rename brand" className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600"><Pencil size={15} /></button>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600"><X size={16} /></button>
        </div>
        <div className="mt-4 space-y-2.5">
          {group.items.map((it) => {
            const st = itemStat(it);
            return (
              <React.Fragment key={it.id}>
              <div className="flex items-center gap-3 rounded-2xl bg-white border border-slate-100 p-2.5">
                <Cover src={it.cover} className="w-[52px] h-[66px] rounded-xl shrink-0">
                  <EntryRibbon item={it} className="absolute left-0.5 bottom-0.5 !text-[11px] !h-4 !px-1" />
                </Cover>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-slate-900 truncate flex items-center gap-1.5">{(it.platform === "instagram" || it.platform === "youtube") && <SocialLogo platform={it.platform} size={14} />}{/* v364 */}{it.platform === "instagram" ? (/instagram\.com\/(?:[^/]+\/)?p\//i.test(String(it.content_url || "")) ? "Instagram post" : "Instagram reel") /* v372: a /p/ link is a post */ : it.source === "upload" ? "Uploaded video" : it.platform === "youtube" ? "YouTube video" : "Link"}</div>
                  <div className="text-[11.5px] text-slate-500 font-medium">
                    {[st ? `${st.text} ${st.kind}${it.self_reported ? " (self-reported)" : ""}` : "", shortDate(it.date)].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                {canEnterExisting(it, challenge) && onEnter && (
                  <button type="button" disabled={busy || enterBusy} onClick={() => enter(it)} data-testid="enter-existing"
                    className="h-9 px-3 rounded-full bg-[#FF7A1A] text-white text-[12px] font-extrabold whitespace-nowrap disabled:opacity-50">🪔 Enter</button>
                )}
                {it.content_url && (
                  <a href={it.content_url} target="_blank" rel="noopener noreferrer" aria-label="Open" className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-[#7C3AED]"><ExternalLink size={15} /></a>
                )}
                <button type="button" disabled={busy} onClick={async () => { if (await appConfirm(isEntry(it) ? "Remove this from your portfolio? It is also your Diwali Challenge entry — removing it takes it out of the challenge." : "Remove this from your portfolio?", { ok: "Remove", danger: true })) onRemove([it.id]); }} aria-label="Remove" className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 disabled:opacity-40"><Trash2 size={15} /></button>
              </div>
              {entering === it.id && (
                <div className="rounded-2xl border border-[#F7D9A8] bg-[#FFF6E6] p-3" data-testid="enter-handle">
                  <span className="text-[11px] font-black tracking-[0.1em] text-[#B45309]">YOUR INSTAGRAM USERNAME</span>
                  <div className="mt-1 flex gap-2">
                    <input value={igName} onChange={(e) => setIgName(e.target.value.replace(/\s/g, "").slice(0, 31))} placeholder="@yourname" autoCapitalize="none" autoCorrect="off" aria-label="Your Instagram username"
                      className="flex-1 min-w-0 h-11 rounded-xl bg-white border border-[#F7D9A8] px-3 text-[16px] font-semibold outline-none focus:border-[#7C3AED]" />
                    <button type="button" disabled={!handleOk || enterBusy} onClick={() => enter(it, igName.trim().replace(/^@+/, ""))}
                      className="h-11 px-4 rounded-xl bg-[#FF7A1A] text-white text-[13px] font-extrabold disabled:opacity-40">Enter</button>
                  </div>
                </div>
              )}
              </React.Fragment>
            );
          })}
        </div>
        <button type="button" disabled={busy} onClick={async () => { if (await appConfirm(`Remove all ${group.items.length} from ${group.brand}?${group.items.some(isEntry) ? " Your Diwali Challenge entry in it is taken out too." : ""}`, { ok: "Remove all", danger: true })) onRemove(group.items.map((i) => i.id)); }}
          className="mt-4 w-full h-12 rounded-2xl border border-red-200 text-red-600 text-[13.5px] font-bold disabled:opacity-40">Remove {group.brand} from portfolio</button>
      </div>
    </div>
  );
}
