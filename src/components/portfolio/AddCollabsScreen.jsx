import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { X, Link2, Upload, Check, Trash2 } from "lucide-react";
import ButtonSpinner from "../common/ButtonSpinner";
import TagBrandSheet from "./TagBrandSheet";
import { signupIg } from "../../lib/signupIg"; // v376
import { Bloom, Cover } from "./PortfolioParts";
import { mediaToPending, finalizeItem, tagQueue, linkKey, newId, shortCount, niceBrand } from "./portfolioModel";
import { previewLink, copyCovers, uploadFile, videoCoverBlob } from "./portfolioApi";
import SocialLogo from "../common/SocialLogo"; // v364: real platform logos
import { captionHasTag, STARTS_AT, MAX_RUN_MS, MAX_ENTRIES, TAGS_LINE, RECHARGE_AMOUNT, RECHARGE_SLOTS } from "../../lib/diwaliChallenge"; // v367: Diwali Creator Challenge
import { Marigolds, DiyaTile } from "../challenge/Festive"; // v377: Diwali entry strip
import { getMyChallenge, stampEntries } from "../../lib/challengeApi"; // v367

// v363 (Ravi's design 1d "Add collabs" → 1g "Tag the brand"). Three tabs as one glass segmented control:
//   Select (default) — reels from the creator's Instagram, none ticked; Paste link — instagram.com/reel/ or /p/ (cover +
//   numbers when it's one of their own posts); Upload — a video or image from the phone (views optional, "self-reported").
// Every picked piece needs a brand before it's saved. Instagram covers are copied to our storage first, because
// Instagram's own cover links expire in a few days (that's why previews used to be blank).

const MAX_UPLOAD = 50 * 1024 * 1024;
const looksLikeLink = (t) => /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/|$)/i.test(String(t || "").trim());

// v377 (Ravi, "Diwali Challenge v2: Easy Entry"): `diwali` = the "Add your reel" screen a creator lands on right after
// signing up from the offer page (and from the Home card / offer page). Any reel of their own; no brand question —
// the reels go straight in with "Submit to Diwali Challenge" ON (brand shown as "Diwali Challenge" on the portfolio).
const DIWALI_BRAND = "Diwali Challenge";

export default function AddCollabsScreen({ handle, media = [], mediaLoading = false, existing = [], renderPicker, onClose, onSave, diwali = false }) {
  const hasIg = Boolean(handle);
  const [tab, setTab] = useState(hasIg ? "select" : "link");
  const [diwaliOn, setDiwaliOn] = useState(true); // v377: the toggle, ON from the start
  const [igHandle, setIgHandle] = useState(() => signupIg()); // v371: typed in the toggle when the profile had none (v376: sign-up username)
  const [picked, setPicked] = useState([]); // media ids
  const [extras, setExtras] = useState([]); // pasted / uploaded pending items
  const [queue, setQueue] = useState(null); // groups still to tag
  const [tagged, setTagged] = useState([]); // finished items
  const [saving, setSaving] = useState(false);
  // v367: can I enter the Diwali Challenge right now? (null = unknown / closed)
  const [challenge, setChallenge] = useState(null);
  useEffect(() => {
    // v369: the close date is set in Admin, so the server says whether entries are open (phase === "open")
    if (Date.now() < STARTS_AT || Date.now() > STARTS_AT + MAX_RUN_MS) return undefined;
    let alive = true;
    getMyChallenge().then((d) => { if (alive && d && d.phase === "open" && d.is_creator) setChallenge(d); });
    return () => { alive = false; };
  }, []);

  const have = useMemo(() => new Set(existing.map((i) => linkKey(i.content_url)).filter(Boolean)), [existing]);
  const fresh = useMemo(() => media.filter((m) => m?.permalink && !have.has(linkKey(m.permalink))), [media, have]);
  const collabCount = fresh.filter((m) => m.collab).length;
  const pendingIg = fresh.filter((m) => picked.includes(m.id || m.permalink)).map(mediaToPending);
  const pending = [...pendingIg, ...extras];

  const startTagging = () => {
    if (!pending.length) return;
    if (diwali) { submitDiwali(); return; }
    setTagged([]);
    setQueue(tagQueue(pending));
  };
  // v377: Diwali mode — no brand sheet; checks here, then straight to save (+ the signed entry stamp)
  const [handleInput, setHandleInput] = useState("");
  const diwaliHandle = (igHandle || handleInput.trim().replace(/^@+/, "")).toLowerCase();
  const needHandle = Boolean(diwali && diwaliOn && challenge?.need_handle && !igHandle);
  const submitDiwali = () => {
    const bad = pending.find((p) => !/instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(reel|reels|p)\//i.test(String(p.content_url || "")));
    if (diwaliOn && bad) { toast.error("Only an Instagram reel or post link counts (instagram.com/reel/… or /p/…)."); return; }
    if (diwaliOn && !challenge) { toast.error("Entries are closed right now, or this account can't enter. The reel will be saved to your portfolio only."); }
    if (diwaliOn && challenge && pending.length > (challenge.left ?? MAX_ENTRIES)) { toast.error(challenge.left ? `You can enter ${challenge.left} more reel${challenge.left === 1 ? "" : "s"} (max ${MAX_ENTRIES}).` : `You've used all ${MAX_ENTRIES} entries.`); return; }
    if (needHandle && !/^[a-z0-9._]{1,30}$/.test(diwaliHandle)) { toast.error("Add your Instagram username to enter."); return; }
    const enter = Boolean(diwaliOn && challenge);
    finish(pending.map((p) => ({ ...p, brand: DIWALI_BRAND, enter, ...(enter && diwaliHandle ? { ig_handle: diwaliHandle } : {}) })));
  };

  const finish = async (doneItems) => {
    setQueue(null);
    if (!doneItems.length) { toast("Nothing added — those weren't brand collabs."); return; }
    setSaving(true);
    try {
      const needCover = doneItems.filter((i) => i.source === "ig" && !i.cover && i.thumb).map((i) => ({ id: i.id, url: i.thumb }));
      // our copy when it worked; otherwise Instagram's own link (shows until it expires, then the placeholder)
      // v367: reels tagged with "Submit to Diwali Challenge" ON get a signed stamp from the server first
      // v372 (Ravi's video: "Saving…" ran for many seconds): covers and stamps are fetched at the same time, not one after the other
      const toEnter = doneItems.filter((p) => p.enter);
      const [covers, stampRes] = await Promise.all([
        needCover.length ? copyCovers(needCover) : Promise.resolve({}),
        toEnter.length
          ? stampEntries(toEnter, toEnter.find((p) => p.ig_handle)?.ig_handle || igHandle).then((v) => ({ ok: v }), (e) => ({ err: e }))
          : Promise.resolve({ ok: {} }),
      ]);
      const stamps = stampRes.ok || {};
      if (stampRes.err) toast.error(`Saved to your portfolio, but not entered: ${stampRes.err.message}`);
      const finalItems = doneItems.map((p) => finalizeItem({ ...p, cover: p.cover || covers[p.id] || p.thumb || "", stamp: stamps[p.id] }, p.brand));
      const entered = finalItems.filter((i) => stamps[i.id]).map((i) => i.id);
      const ok = await onSave(finalItems, { entered });
      if (ok === false) return;
      if (!entered.length) toast.success(`${finalItems.length} added to your portfolio`);
      onClose();
    } finally { setSaving(false); }
  };

  const current = queue?.[0] || null;
  const onTag = (brand, enter = false, handle = "") => {
    if (handle) setIgHandle(handle);
    const done = [...tagged, ...current.items.map((p) => ({ ...p, brand, enter: Boolean(enter), ...(handle ? { ig_handle: handle } : {}) }))];
    const rest = queue.slice(1);
    setTagged(done);
    if (rest.length) setQueue(rest); else finish(done);
  };
  // v372 (Ravi's video): closing the brand sheet half-way threw away the reels already tagged — and tapping X on the
  // screen while "Saving…" closed it with the save still running (portfolio showed the old list; "1 added" popped up
  // later on Home). Now: X on the sheet keeps what's tagged and saves it; the screen can't close mid-save.
  const closeSheet = () => {
    if (saving) return;
    if (tagged.length) finish(tagged); else setQueue(null);
  };
  const closeScreen = () => { if (!saving) onClose(); };
  const onNotCollab = () => {
    const ids = new Set(current.items.map((p) => p.id));
    setPicked((ps) => ps.filter((id) => !ids.has(`ig_${id}`)));
    setExtras((xs) => xs.filter((x) => !ids.has(x.id)));
    const rest = queue.slice(1);
    if (rest.length) setQueue(rest); else finish(tagged);
  };

  const selectAll = () => {
    if (tab !== "select") return;
    const all = fresh.map((m) => m.id || m.permalink);
    setPicked(picked.length === all.length ? [] : all);
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden" data-testid="add-collabs">
      <Bloom />
      <header className="relative flex items-center justify-between px-4 pt-[calc(10px+env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-3">
          <button type="button" onClick={closeScreen} disabled={saving} aria-label="Close" className="w-10 h-10 rounded-full bg-white/80 backdrop-blur flex items-center justify-center text-slate-700 shadow-sm disabled:opacity-40"><X size={18} /></button>
          <span className="text-[18px] font-black text-slate-900">{diwali ? "Add your Diwali reel" : "Add collabs"}</span>
        </div>
        {tab === "select" && fresh.length > 0 && (
          <button type="button" onClick={selectAll} className="min-h-10 px-2 text-[14px] font-bold text-[#7C3AED]">{picked.length === fresh.length ? "Clear" : "Select all"}</button>
        )}
      </header>

      <div className="relative flex-1 overflow-y-auto px-4 pb-36">
        <h2 className="mt-2 text-[24px] leading-[1.15] font-black tracking-tight text-slate-900">
          {diwali ? (tab === "select" && hasIg ? <>Pick your reel from @{handle}</> : "Paste your reel link") : tab === "select" && hasIg
            ? (collabCount ? <>We found {collabCount} brand collab{collabCount === 1 ? "" : "s"} on @{handle}</> : <>Your posts on @{handle}</>)
            : tab === "link" ? "Paste a link to your collab" : "Upload a collab video"}
        </h2>
        {diwali ? (
          <p className="mt-1.5 text-[13.5px] leading-snug text-slate-500" data-testid="diwali-rule">Any reel of your own works. Its caption needs <b className="text-slate-800">{TAGS_LINE}</b>. Follow <b className="text-slate-800">@ybex.in</b> too.</p>
        ) : (
          <p className="mt-1.5 text-[13.5px] leading-snug text-slate-500">Only add paid or brand collabs. Brands hire on past brand work, so skip dance, trends and personal posts.</p>
        )}
        {diwali && (
          <div className="relative mt-3 rounded-[20px] overflow-hidden border border-[#F7D9A8]" style={{ background: "linear-gradient(120deg,#FFF6E6,#FFE2B8)" }} data-testid="diwali-toggle">
            <Marigolds />
            <label className="relative flex items-center gap-3 pl-3 pr-3.5 pt-[18px] pb-3 cursor-pointer">
              <DiyaTile />
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] leading-tight font-extrabold text-[#3A0A0E]">Submit to Diwali Challenge</span>
                <span className="block mt-[3px] text-[11px] leading-snug font-semibold text-[#B45309]">{challenge ? `${challenge.left ?? MAX_ENTRIES} of ${MAX_ENTRIES} entries left · ${RECHARGE_AMOUNT} UPI cash for the first ${RECHARGE_SLOTS}` : "Checking…"}</span>
              </span>
              <input type="checkbox" className="sr-only" checked={diwaliOn} onChange={(e) => setDiwaliOn(e.target.checked)} aria-label="Submit to Diwali Challenge" />
              <span aria-hidden="true" className={`relative w-[50px] h-[30px] rounded-full shrink-0 transition ${diwaliOn ? "bg-[#FF7A1A]" : "bg-[#E4D3BC]"}`}>
                <span className={`absolute top-[3px] w-6 h-6 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.2)] transition-all ${diwaliOn ? "left-[23px]" : "left-[3px]"}`} />
              </span>
            </label>
            {needHandle && (
              <label className="relative block px-3.5 pb-3">
                <span className="text-[11px] font-black tracking-[0.1em] text-[#B45309]">YOUR INSTAGRAM USERNAME</span>
                <input value={handleInput} onChange={(e) => setHandleInput(e.target.value.replace(/\s/g, "").slice(0, 31))} placeholder="@yourname" autoCapitalize="none" autoCorrect="off"
                  aria-label="Your Instagram username" className="mt-1 w-full h-11 rounded-xl bg-white border border-[#F7D9A8] px-3 text-[16px] font-semibold outline-none focus:border-[#7C3AED]" />
              </label>
            )}
          </div>
        )}

        {/* segmented control */}
        <div className="mt-4 p-1 rounded-full bg-white/60 backdrop-blur-xl border border-white flex gap-1">
          {[
            hasIg && ["select", <SocialLogo platform="instagram" size={14} key="i" />, `Select${picked.length ? ` · ${picked.length}` : ""}`],
            ["link", <Link2 size={14} key="l" />, "Paste link"],
            !diwali && ["upload", <Upload size={14} key="u" />, "Upload"], // v377: an entry must be an Instagram link
          ].filter(Boolean).map(([id, icon, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id}
              className={`flex-1 h-10 rounded-full text-[13px] font-bold inline-flex items-center justify-center gap-1.5 transition ${tab === id ? "bg-[#7C3AED] text-white shadow-[0_8px_16px_-10px_rgba(124,58,237,1)]" : "text-slate-600"}`}>
              {icon}{label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tab === "select" && renderPicker({ media: fresh, loading: mediaLoading, selectedIds: picked, onChange: setPicked })}
          {tab === "link" && <PasteLinkTab have={have} diwali={diwali} onAdd={(it) => { setExtras((x) => [...x, it]); toast.success(diwali ? "Added — tap Submit entry" : "Added — tag the brand next"); }} />}
          {tab === "upload" && <UploadTab onAdd={(it) => { setExtras((x) => [...x, it]); toast.success("Added — tag the brand next"); }} />}
        </div>

        {extras.length > 0 && (
          <div className="mt-5">
            <div className="text-[11px] font-black tracking-[0.12em] text-slate-500 mb-2">ADDED BY LINK / UPLOAD</div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {extras.map((x) => (
                <div key={x.id} className="relative w-[72px] shrink-0">
                  <Cover src={x.cover} className="w-[72px] h-[96px] rounded-xl" label={x.source === "upload" ? "Upload" : "Link"} />
                  <button type="button" onClick={() => setExtras((xs) => xs.filter((y) => y.id !== x.id))} aria-label="Remove" className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-white shadow flex items-center justify-center text-rose-500"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* bottom glass bar */}
      {/* v372: near-solid (iPhone showed the grid's captions through it: "Re0 selected") */}
      <div className="absolute left-3 right-3 bottom-[calc(12px+env(safe-area-inset-bottom))] h-[66px] rounded-[26px] bg-white/95 backdrop-blur-2xl border border-white shadow-[0_16px_40px_-18px_rgba(76,29,149,0.5)] flex items-center justify-between pl-4 pr-2 gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-black text-slate-900">{pending.length} selected</div>
          <div className="text-[11.5px] text-slate-500 font-medium">{diwali ? (pending.length ? (diwaliOn ? "Goes in as your challenge entry" : "Saved to your portfolio") : "Pick your reel") : pending.length ? "Brand name next" : "Pick at least one"}</div>
        </div>
        <button type="button" onClick={startTagging} disabled={!pending.length || saving}
          className="h-[50px] px-5 rounded-full bg-[#7C3AED] text-white text-[14.5px] font-bold shadow-[0_10px_20px_-10px_rgba(124,58,237,1)] disabled:opacity-40 shrink-0">
          {saving ? <ButtonSpinner label="Saving…" /> : diwali ? (diwaliOn ? "Submit entry" : "Save reel") : `Next · tag ${tagQueue(pending).length > 1 ? "brands" : "brand"}`}
        </button>
      </div>

      {current && (
        <TagBrandSheet group={current} existing={[...existing, ...tagged.map((t) => ({ ...t, brand_name: t.brand }))]} left={queue.length - 1}
          onTag={onTag} onNotCollab={onNotCollab} onClose={closeSheet}
          challenge={challenge && { ...challenge, need_handle: challenge.need_handle && !igHandle, left: Math.max(0, (challenge.left || 0) - tagged.filter((t) => t.enter).length) }} />
      )}
    </div>
  );
}

function PasteLinkTab({ have, onAdd, diwali = false }) {
  const [url, setUrl] = useState("");
  const [state, setState] = useState({ busy: false, item: null, checked: "" });
  const timer = useRef(null);
  const valid = looksLikeLink(url);
  const dup = valid && have.has(linkKey(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`));

  useEffect(() => {
    clearTimeout(timer.current);
    const t = url.trim();
    if (!valid || !/instagram\.com|instagr\.am/i.test(t) || state.checked === t) return undefined;
    timer.current = setTimeout(async () => {
      setState({ busy: true, item: null, checked: t });
      const item = await previewLink(t);
      setState({ busy: false, item, checked: t });
    }, 600);
    return () => clearTimeout(timer.current);
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = () => {
    const full = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    const it = state.item;
    onAdd({
      id: it?.id ? `ig_${it.id}` : newId("link"),
      source: "link", content_url: full, cover: it?.cover || "", thumb: it?.thumb || "",
      views: it?.views || null, likes: it?.likes || null, date: it?.at || "",
      platform: /instagram/i.test(full) ? "instagram" : /youtu/i.test(full) ? "youtube" : "other",
      suggested: niceBrand(it?.brand || ""), caption: it?.caption || "", challenge_hit: captionHasTag(it?.caption), // v367
    });
    setUrl(""); setState({ busy: false, item: null, checked: "" });
  };

  return (
    <div className="rounded-[22px] bg-white/65 backdrop-blur-xl border border-white p-4 space-y-3">
      <input value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoCapitalize="none" autoCorrect="off"
        placeholder="https://instagram.com/reel/…" aria-label={diwali ? "Reel link" : "Collab link"}
        className="w-full h-12 rounded-2xl bg-white border border-slate-200 px-3.5 text-[16px] font-medium text-slate-900 outline-none focus:border-[#7C3AED]" />
      {url.trim() && !valid && <p className="text-[12px] text-rose-500 font-medium">This doesn't look like a link. Paste the full link.</p>}
      {dup && <p className="text-[12px] text-amber-600 font-semibold">This one is already in your portfolio.</p>}
      {state.busy && <p className="text-[12px] text-[#7C3AED] font-semibold">Fetching the cover from Instagram…</p>}
      {valid && !state.busy && (
        <div className="flex items-center gap-3">
          <Cover src={state.item?.cover || state.item?.thumb} className="w-[64px] h-[84px] rounded-xl shrink-0" label="Link" />
          <div className="min-w-0 text-[12.5px] text-slate-600 leading-snug">
            {state.item ? (
              <>
                <div className="font-bold text-slate-900">Found on your Instagram</div>
                {(state.item.views || state.item.likes) ? <div>{state.item.views ? `${shortCount(state.item.views)} views` : `${shortCount(state.item.likes)} likes`}</div> : null}
              </>
            ) : (
              <div>We'll save the link. {/instagram/i.test(url) ? "The cover shows when it's a post from your own Instagram." : ""}</div>
            )}
          </div>
        </div>
      )}
      <button type="button" disabled={!valid || dup || state.busy} onClick={add}
        className="w-full h-12 rounded-2xl bg-[#7C3AED] text-white text-[14px] font-bold disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
        <Check size={15} /> {diwali ? "Add this reel" : "Add this collab"}
      </button>
    </div>
  );
}

function UploadTab({ onAdd }) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null); // { url, cover, isVideo, name }
  const [views, setViews] = useState("");
  const inputRef = useRef(null);

  const pick = async (e) => {
    const f = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!f) return;
    if (f.size > MAX_UPLOAD) { toast.error("This file is over 50 MB. Pick a shorter clip."); return; }
    const isVideo = /^video\//.test(f.type);
    setBusy(true);
    try {
      const url = await uploadFile(f);
      let cover = isVideo ? "" : url;
      if (isVideo) {
        const blob = await videoCoverBlob(f);
        if (blob) { try { cover = await uploadFile(blob, "cover.jpg"); } catch { cover = ""; } }
      }
      setFile({ url, cover, isVideo, name: f.name });
    } catch (err) {
      const st = err?.response?.status;
      toast.error(st === 401 || st === 403 ? "Your login has expired. Log in again and retry." : "Couldn't upload. Check your internet and try again.");
    } finally { setBusy(false); }
  };

  const add = () => {
    const v = Number(String(views).replace(/[^0-9]/g, ""));
    onAdd({ id: newId("up"), source: "upload", content_url: file.url, cover: file.cover, views: v > 0 ? v : null, self_reported: v > 0, platform: "upload", date: new Date().toISOString(), suggested: "" });
    setFile(null); setViews("");
  };

  return (
    <div className="rounded-[22px] bg-white/65 backdrop-blur-xl border border-white p-4 space-y-3">
      <input ref={inputRef} type="file" accept="video/*,image/*" onChange={pick} className="hidden" />
      {!file ? (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
          className="w-full h-36 rounded-2xl border-2 border-dashed border-[#C4B5FD] bg-white/60 flex flex-col items-center justify-center gap-1.5 text-[#7C3AED] disabled:opacity-60">
          {busy ? <ButtonSpinner label="Uploading…" /> : <><Upload size={22} /><span className="text-[14px] font-bold">Pick a video or image</span><span className="text-[11.5px] text-slate-500 font-medium">Up to 50 MB</span></>}
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <Cover src={file.cover} className="w-[64px] h-[84px] rounded-xl shrink-0" label={file.isVideo ? "Video" : "Image"} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-slate-900 truncate">{file.name}</div>
            <button type="button" onClick={() => setFile(null)} className="text-[12px] font-semibold text-rose-500 min-h-8">Remove</button>
          </div>
        </div>
      )}
      {file && (
        <label className="block">
          <span className="text-[11px] font-black tracking-[0.1em] text-slate-500">VIEWS (OPTIONAL · SELF-REPORTED)</span>
          <input value={views} onChange={(e) => setViews(e.target.value)} inputMode="numeric" placeholder="e.g. 12000"
            className="mt-1 w-full h-12 rounded-2xl bg-white border border-slate-200 px-3.5 text-[16px] font-medium outline-none focus:border-[#7C3AED]" />
        </label>
      )}
      <button type="button" disabled={!file || busy} onClick={add}
        className="w-full h-12 rounded-2xl bg-[#7C3AED] text-white text-[14px] font-bold disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
        <Check size={15} /> Add this collab
      </button>
    </div>
  );
}

