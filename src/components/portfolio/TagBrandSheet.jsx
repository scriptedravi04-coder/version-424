import React, { useEffect, useRef, useState } from "react";
import { X, Search, Check, Plus } from "lucide-react";
import { Cover, BrandInitial } from "./PortfolioParts";
import { cleanBrand, brandKey, shortCount, shortDate, suggestBrands, groupByBrand } from "./portfolioModel";
import SocialLogo from "../common/SocialLogo"; // v364: real platform logos
import { signupIg } from "../../lib/signupIg"; // v376
import { qualifies, isEntryLink, MAX_ENTRIES, CHALLENGE_NAME, PRIZE_POOL } from "../../lib/diwaliChallenge"; // v367
import { Marigolds, DiyaTile } from "../challenge/Festive"; // v372

// v363 (Ravi's design 1g "Tag the brand"): a frosted sheet over the blurred grid. The preview at the top stacks the
// reels being tagged the way the portfolio will show them, and the name updates as you type. Brand is required;
// "Not a brand collab" drops these reels (no dance / trend / personal posts get in).
// v372 (Ravi's "Portfolio Flow" design 3b): compact — a small thumbnail row instead of the big preview, so the brand
// question comes first; matches as a pick list ("1 reel already"), "Create new brand", the Diwali toggle on a marigold
// strip that says which entry this is, and "Not a brand collab" next to the main button.

export default function TagBrandSheet({ group, existing = [], left = 0, onTag, onNotCollab, onClose, challenge = null }) {
  const [brand, setBrand] = useState(group?.suggested || "");
  const [enter, setEnter] = useState(true); // v367: "Submit to Diwali Challenge" — default ON
  const [igName, setIgName] = useState(() => signupIg()); // v376: username typed at sign-up // v371: only when the profile has no Instagram username yet
  const inputRef = useRef(null);
  // v430: app font (DM Sans) — no extra font download
  useEffect(() => { setBrand(group?.suggested || ""); setEnter(true); }, [group?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!group) return null;
  const items = group.items || [];
  const n = items.length;
  const views = items.reduce((a, i) => a + (Number(i.views) || 0), 0);
  const likes = items.reduce((a, i) => a + (Number(i.likes) || 0), 0);
  const typed = cleanBrand(brand);
  const already = groupByBrand(existing).find((g) => g.key === brandKey(typed));
  const sugg = suggestBrands(typed, existing, 3);
  const thumbs = items.slice(0, 3);
  const when = shortDate(items[0]?.date);
  const stat = views ? `${shortCount(views)} views` : likes ? `${shortCount(likes)} likes` : "";
  // v372 (Ravi's video: a photo post said "1 selected reel"): reel / post by the link — /p/ is a post, /reel/ a reel
  const posts = items.filter((i) => /instagram\.com\/(?:[^/]+\/)?p\//i.test(String(i.content_url || ""))).length;
  const kind = posts === n ? "post" : posts === 0 ? "reel" : "post";
  const word = n === 1 ? kind : `${kind}s`;
  // v367: Diwali Challenge toggle — brand "Ybex", or #YbexDiwaliChallenge / @ybex.in in the caption, while entries are open
  const showChallenge = Boolean(challenge) && qualifies(typed, items.map((i) => (i.challenge_hit ? "#YbexDiwaliChallenge" : i.caption)), challenge?.sponsor_names || []);
  const linksOk = items.every((i) => isEntryLink(i.content_url));
  // v371: a name + email / phone is enough (no full onboarding); the Instagram username is asked here when missing
  const okToEnter = challenge ? (challenge.eligible ?? challenge.onboarded) : false;
  const handleOk = !challenge?.need_handle || /^@?[A-Za-z0-9._]{1,30}$/.test(igName.trim());
  const blocked = !showChallenge ? "" : !okToEnter ? "Add your name and an email or phone number to your profile first."
    : !linksOk ? "Only an Instagram reel or post link counts (instagram.com/reel/… or /p/…)."
      : (challenge.left || 0) < n ? ((challenge.left || 0) ? `You can enter ${challenge.left} more (max ${MAX_ENTRIES} per creator). Tag fewer reels.` : `You've used all ${MAX_ENTRIES} entries.`) : "";
  const willEnter = showChallenge && !blocked && enter && handleOk;
  // v373 deep test: toggle ON + no Instagram username saves WITHOUT entering (v371 rule, kept) — only the button text
  // changed, so creators thought they were in. Now the sheet says it plainly under the username box.
  const needName = showChallenge && !blocked && enter && !handleOk;

  const nextNo = Math.max(1, MAX_ENTRIES - (challenge?.left ?? MAX_ENTRIES) + 1);
  const amount = (/₹[\d,]+/.exec(String(challenge?.pool || PRIZE_POOL)) || ["₹1,00,000"])[0];
  const pick = (name) => { setBrand(name); inputRef.current?.blur(); };
  const row = "w-full min-h-[52px] px-3.5 flex items-center gap-2.5 text-left border-b border-[#EFEFF3] last:border-b-0";
  const showList = Boolean(typed || sugg.length || (group.suggested && brandKey(group.suggested) !== brandKey(typed)));

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center" data-testid="tag-brand-sheet">
      <div className="absolute inset-0 bg-[#0B0B0F]/35 backdrop-blur-md" onClick={onClose} />
      {/* v372: solid card (iPhone can't blur inside a blurred layer), height follows the visible screen so the keyboard
          never pushes the top away */}
      <div className="relative w-[calc(100%-20px)] max-w-[460px] mb-[calc(12px+env(safe-area-inset-bottom))] md:mb-0 rounded-[34px] bg-white border border-white px-[18px] pt-2 pb-[18px] shadow-[0_30px_60px_rgba(11,11,15,0.25)] max-h-[calc(100dvh-24px)] overflow-y-auto overscroll-contain font-['DM_Sans',sans-serif]">
        <div className="mx-auto h-1 w-[38px] rounded-full bg-[#0B0B0F]/15" />

        {/* reel row */}
        <div className="mt-3.5 flex items-center gap-3" aria-label="How brands will see it">
          <div className="relative h-[68px] shrink-0" style={{ width: 52 + (thumbs.length - 1) * 14 }}>
            {thumbs.map((it, i) => (
              <div key={it.id} className="absolute top-0 w-[52px] h-[68px] rounded-[14px] overflow-hidden ring-2 ring-white shadow-[0_6px_14px_rgba(11,11,15,0.14)]" style={{ left: i * 14, zIndex: thumbs.length - i }}>
                <Cover src={it.cover || it.thumb} className="w-full h-full" />
              </div>
            ))}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14.5px] font-extrabold leading-tight text-[#0B0B0F]">{n} {word} selected</div>
            <div className="mt-[3px] text-[11.5px] font-medium text-[#6E6E78] truncate">{[stat, when && n === 1 ? `posted ${when}` : ""].filter(Boolean).join(" · ") || (items.every((i) => i.source === "upload") ? "Uploaded from your phone" : items.every((i) => i.source === "link") ? "Pasted link" : "From your Instagram") /* v373: a pasted link isn't "from your Instagram" */}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-[34px] h-[34px] rounded-full bg-[#F3F3F6] flex items-center justify-center text-[#3A3A44] shrink-0"><X size={16} /></button>
        </div>
        <div className="mt-4 border-b border-[#EFEFF3]" />

        <div className="mt-4 text-[10.5px] font-extrabold tracking-[0.14em] text-[#767680]">TAG THE BRAND{left > 0 ? ` · ${left} more after this` : ""}</div>
        <h3 className="mt-1 text-[21px] leading-[1.2] font-extrabold tracking-[-0.6px] text-[#0B0B0F]">Which <span className="text-[#7C3AED]">brand</span> {n === 1 ? `is this ${kind}` : `are these ${kind}s`} for?</h3>
        <p className="mt-1 text-[12.5px] leading-normal font-medium text-[#6E6E78]">They'll be grouped under this name on your profile.</p>

        <div className="mt-3.5 h-[50px] rounded-2xl bg-white border-[1.5px] border-[#7C3AED] shadow-[0_0_0_4px_rgba(124,58,237,0.1)] flex items-center gap-2.5 px-3.5" onClick={() => inputRef.current?.focus()}>
          <Search size={17} className="text-[#767680] shrink-0" />
          <input ref={inputRef} value={brand} onChange={(e) => setBrand(e.target.value.slice(0, 60))} placeholder="Brand name, e.g. Lenskart" autoCapitalize="words" enterKeyHint="done"
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            className="flex-1 min-w-0 bg-transparent text-[16px] font-bold text-[#0B0B0F] outline-none placeholder:text-[#C4C4CC] placeholder:font-medium" aria-label="Brand name" />
        </div>

        {showList && (
          <div className="mt-2 rounded-2xl border border-[#E5E5EA] bg-white overflow-hidden" data-testid="brand-pick-list">
            {group.suggested && brandKey(group.suggested) !== brandKey(typed) && (
              <button type="button" onClick={() => pick(group.suggested)} className={row}>
                <SocialLogo platform="instagram" size={30} variant="tile" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-bold text-[#0B0B0F] truncate">{group.suggested}</span>
                  <span className="block text-[11px] font-medium text-[#6E6E78]">@{group.suggested.toLowerCase()} in caption</span>
                </span>
              </button>
            )}
            {already && (
              <div className={`${row} bg-[#F8F4FF]`}>
                <BrandInitial name={already.brand} size={30} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-bold text-[#0B0B0F] truncate">{already.brand}</span>
                  <span className="block text-[11px] font-medium text-[#6E6E78]">{already.items.length} already in your portfolio</span>
                </span>
                <span className="w-[22px] h-[22px] rounded-full bg-[#7C3AED] flex items-center justify-center text-white shrink-0"><Check size={13} strokeWidth={3} /></span>
              </div>
            )}
            {sugg.map((s) => (
              <button key={s.brand} type="button" onClick={() => pick(s.brand)} className={row}>
                <BrandInitial name={s.brand} size={30} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-bold text-[#0B0B0F] truncate">{s.brand}</span>
                  <span className="block text-[11px] font-medium text-[#6E6E78]">{s.count} already in your portfolio</span>
                </span>
              </button>
            ))}
            {typed && !already && (
              <div className={row}>
                <span className="w-[30px] h-[30px] rounded-full border-[1.5px] border-dashed border-[#C4B5FD] flex items-center justify-center text-[#7C3AED] shrink-0"><Plus size={14} /></span>
                <span className="flex-1 text-[13.5px] font-semibold text-[#6E6E78] truncate">Create new brand “{typed}”</span>
              </div>
            )}
          </div>
        )}

        {showChallenge && (
          <div className="relative mt-3.5 rounded-[20px] overflow-hidden border border-[#F7D9A8]" style={{ background: "linear-gradient(120deg,#FFF6E6,#FFE2B8)" }} data-testid="challenge-toggle">
            <Marigolds />
            <label className={`relative flex items-center gap-3 pl-3 pr-3.5 pt-[18px] pb-3 ${blocked ? "opacity-70" : "cursor-pointer"}`}>
              <DiyaTile />
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] leading-tight font-extrabold text-[#3A0A0E]">Submit as Diwali entry</span>
                <span className="block mt-[3px] text-[11px] leading-snug font-semibold text-[#B45309]">{blocked || (n === 1 ? `Entry ${nextNo} of ${MAX_ENTRIES} · win up to ${amount}` : `Entries ${nextNo}–${nextNo + n - 1} of ${MAX_ENTRIES} · win up to ${amount}`)}</span>
              </span>
              <input type="checkbox" className="sr-only peer" checked={!blocked && enter} disabled={Boolean(blocked)} onChange={(e) => setEnter(e.target.checked)} aria-label={`Submit to ${CHALLENGE_NAME}`} />
              <span aria-hidden="true" className={`relative w-[50px] h-[30px] rounded-full shrink-0 transition ${!blocked && enter ? "bg-[#FF7A1A]" : "bg-[#E4D3BC]"}`}>
                <span className={`absolute top-[3px] w-6 h-6 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.2)] transition-all ${!blocked && enter ? "left-[23px]" : "left-[3px]"}`} />
              </span>
            </label>
            {!blocked && enter && challenge?.need_handle && (
              <label className="relative block px-3.5 pb-3">
                <span className="text-[11px] font-black tracking-[0.1em] text-[#B45309]">YOUR INSTAGRAM USERNAME</span>
                <input value={igName} onChange={(e) => setIgName(e.target.value.replace(/\s/g, "").slice(0, 31))} placeholder="@yourname" autoCapitalize="none" autoCorrect="off"
                  aria-label="Your Instagram username" className="mt-1 w-full h-11 rounded-xl bg-white border border-[#F7D9A8] px-3 text-[16px] font-semibold outline-none focus:border-[#7C3AED]" />
                {igName && !handleOk && <span className="text-[11.5px] text-rose-500 font-semibold">Letters, numbers, dots and underscores only.</span>}
                {needName && <span className="block mt-1 text-[11.5px] text-[#B45309] font-semibold" data-testid="need-handle-note">Without your username the reel is saved but not entered.</span>}
              </label>
            )}
          </div>
        )}

        {/* dismissive left, primary right (AGENTS.md button rule) */}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onNotCollab} className="flex-1 h-[54px] rounded-full border-[1.5px] border-[#E5E5EA] px-2.5 text-[12.5px] leading-tight font-bold text-[#6E6E78]">Not a brand collab</button>
          <button type="button" disabled={!typed} onClick={() => onTag(typed, willEnter, willEnter ? igName.trim().replace(/^@+/, "") : "")} data-testid="tag-primary"
            className="flex-[1.7] min-w-0 h-[54px] rounded-full bg-[#7C3AED] px-3 text-white text-[14.5px] leading-tight font-bold shadow-[0_10px_24px_rgba(124,58,237,0.28)] disabled:opacity-40">
            {!typed ? "Type the brand name" : willEnter ? `Tag as ${typed} & enter` : `Tag ${n} ${word} as ${typed}`}
          </button>
        </div>
      </div>
    </div>
  );
}
