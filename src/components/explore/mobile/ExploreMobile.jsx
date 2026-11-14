import { deliverablesLabel } from "../../../utils/safeFormat"; // v415
import React, { useEffect, useMemo, useRef, useState } from "react";
import { visibleCreators } from "../../../lib/visibleCreators";
import useFeaturedCreators, { featuredFirst } from "../../../lib/useFeaturedCreators";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal, MapPin, Check, X, Plus, Send } from "lucide-react";
import { placeFromSearch, cityPoint, distanceKm } from "../../../lib/indiaCities";
import { toast } from "sonner";
import { api, isBrandLike } from "../../../lib/api"; // v416 (CR4): agency / talent manager are brand accounts too
import { inviteFailReason } from "../../campaigns/InviteToCampaignModal"; // v416 (C6): per-creator reason
import { useAuth } from "../../../contexts/AuthContext";
import ModalPortal from "../../common/ModalPortal";
import ButtonSpinner from "../../common/ButtonSpinner";
import { Shimmer } from "../../common/ContentSkeletons";
import useScrollLock from "../../../lib/useScrollLock";
import useBusy from "../../../lib/useBusy";
import { OfflineAware } from "../../common/OfflineState"; // v334

import { Presence, PopupBackdrop, PopupPanel } from "../../common/Popup";
import { motion } from "framer-motion"; // v415: selection bar enter/exit
import { initials as initialsOf } from "../../../utils/initials";
// Session 33 (Ravi: "mobile UI mein desktop ko compress karke mat dikhao"). Explore on mobile used
// to be the desktop page squeezed down. This is Ravi's design: EX-01 browse, EX-02 filters,
// EX-03 filtered results with multi-select, EX-05 invite sheet.
// Same data and calls as desktop Explore.jsx: GET /creators/explore, GET /campaigns?mine=true,
// POST /creators/:id/send-brief (message + fee, ₹3,000 minimum — the server checks both).
// Only real data: no invented rating, reach, "verified" or rate. A creator without a rate card
// shows no rate; "Verified" only when the profile row says verified.

export const wordIn = (text, k) => new RegExp(`(^|[^a-z])${String(k).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(String(text || "").toLowerCase());
export const CATEGORY_CHIPS = [
  { label: "Fashion", keys: ["fashion", "beauty", "makeup", "skincare", "jewellery", "style"] },
  { label: "Health", keys: ["health", "wellness", "yoga", "nutrition", "mental"] },
  { label: "Food", keys: ["food", "cooking", "recipe", "restaurant"] },
  { label: "Tech", keys: ["tech", "gadget", "gaming", "software", "ai"] },
  { label: "Fitness", keys: ["fitness", "gym", "sports"] },
  { label: "Travel", keys: ["travel"] },
  { label: "Lifestyle", keys: ["lifestyle", "vlog", "family", "parenting"] },
  { label: "Finance", keys: ["finance", "money", "business", "education"] },
];

export const FOLLOWER_RANGES = [
  { key: "nano", label: "1K–10K", min: 1000, max: 10000 },
  { key: "micro", label: "10K–100K", min: 10000, max: 100000 },
  { key: "macro", label: "100K–1M", min: 100000, max: 1000000 },
  { key: "mega", label: "1M+", min: 1000000, max: Infinity },
];

const RATE_STEPS = [5000, 10000, 15000, 25000, 50000, 100000, 0]; // 0 = any rate
import { MIN_CAMPAIGN_PAYOUT as MIN_INVITE } from "../../campaigns/mobile/HomeCampaignCard"; // v419: live floor (₹500 for Ybex in-house brands)
import { RATES_PUBLIC } from "../../../utils/rateCardQuote"; // v430

export const parseCount = (raw) => {
  if (raw === null || raw === undefined) return 0;
  const t = String(raw).trim().toLowerCase().replace(/,/g, "");
  if (!t) return 0;
  const n = parseFloat(t);
  if (/^[\d.]+\s*k\+?$/.test(t)) return Math.round(n * 1000);
  if (/^[\d.]+\s*l\+?$/.test(t)) return Math.round(n * 100000);
  if (/^[\d.]+\s*m\+?$/.test(t)) return Math.round(n * 1000000);
  return parseInt(t.replace(/[^0-9]/g, ""), 10) || 0;
};
export const creatorId = (c) => c?.user_id || c?.id;
export const followersOf = (c) => parseCount(c?.followers_count || c?.follower_count || c?.followers_instagram || c?.ig_followers || c?.followers_youtube || 0);
export const rateOf = (c) => Number(c?.rate_reel || c?.reel_rate || c?.rate_card?.reels || c?.rate_card?.reel || c?.base_rate || c?.rate || 0) || 0;
const nicheText = (c) => String(c?.content_niches || c?.category || "").toLowerCase();
const nameOf = (c) => String(c?.full_name || c?.name || "").trim();
export const isVerified = (c) => c?.verified === true || c?.is_verified === true || c?.kyc_verified === true;
const photoOf = (c) => c?.photo || c?.profile_photo_url || c?.picture || c?.avatar_url || "";
const short = (n) => {
  if (!n) return "";
  if (n >= 1000000) return `${(n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(n);
};
const rupees = (n) => `₹${Number(n).toLocaleString("en-IN")}`;
const rupeesShort = (n) => `₹${short(n)}`;
// Session 43 (Ravi): only the creator's PRIMARY niche (category); the niche list only if none.
const firstNiche = (c) => {
  const raw = String(c?.category || "").trim() || (Array.isArray(c?.content_niches) ? c.content_niches[0] : String(c?.content_niches || "").split(",")[0]);
  // v271 (Ravi): "category" itself is sometimes a list ("Entertainment, Lifestyle, Art") — first one only.
  return String(raw || "").split(/\s*[,|/;]\s*/)[0].trim();
};
const initials = (s) => initialsOf(s); // v346: emoji-safe
const GRADIENTS = ["#E4CBB6,#5B4030", "#D9C4E8,#3F2C58", "#C9E4D6,#2C5846", "#F2D2C2,#7A3B2A", "#C8D6F0,#2B3F66", "#EAD9B5,#5E4A22"];
const gradientFor = (id) => GRADIENTS[String(id || "").split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) % GRADIENTS.length];

/** v429 (Ravi: "jitna screen pr hai bas utna load karo", like Amazon / Flipkart): Explore shows 20 creators first and
 *  adds 20 more when the user scrolls near the end — so only the photos on screen are downloaded (photos were the
 *  Supabase egress). Without IntersectionObserver (very old phones) everything shows, as before. */
export const EXPLORE_STEP = 20;
function MoreOnScroll({ onMore }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { onMore(true); return undefined; }
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) onMore(false); }, { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [onMore]);
  return <div ref={ref} aria-hidden="true" className="h-px col-span-2" data-testid="explore-more-sentinel" />;
}

/** The creators Explore may show — shared rule, see src/lib/visibleCreators.js (v286). */
export { visibleCreators };

/** Apply search + filters. `f` = { categories:[], followers:[], maxRate:number(0=any), city:string } */
export function applyFilters(list, search, f) {
  const term = String(search || "").trim().toLowerCase();
  // Session 43 (Ravi): "Jaipur creators" / "Faridabad" is a place search — that city first, then
  // creators nearby (50 km, else 100 km), each with "12 km from Faridabad".
  const place = term ? placeFromSearch(term) : null;
  if (place) {
    const rest = applyFilters(list, "", f);
    const withDist = rest.map((c) => {
      const d = distanceKm(place.point, cityPoint(`${c.city || ""} ${c.state || ""}`) || cityPoint(c.city));
      return d == null ? null : { ...c, __distanceKm: d, __nearCity: place.city };
    }).filter(Boolean);
    const within = (km) => withDist.filter((c) => c.__distanceKm <= km);
    const pick = within(50).length ? within(50) : within(100);
    return pick.sort((a, b) => a.__distanceKm - b.__distanceKm);
  }
  return list.filter((c) => {
    if (term) {
      const hay = `${nameOf(c)} ${c.instagram_handle || c.handle || ""} ${c.city || ""} ${c.state || ""} ${nicheText(c)}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    if (f.categories.length) {
      const nt = nicheText(c);
      // Session 58 (bug hunt): match whole words — "ai" was matching "chai" / "hair", "style" every "lifestyle".
      const ok = f.categories.some((lab) => (CATEGORY_CHIPS.find((x) => x.label === lab)?.keys || [lab.toLowerCase()]).some((k) => wordIn(nt, k)));
      if (!ok) return false;
    }
    if (f.followers.length) {
      const fc = followersOf(c);
      if (!f.followers.some((k) => { const r = FOLLOWER_RANGES.find((x) => x.key === k); return r && fc >= r.min && fc < r.max; })) return false;
    }
    if (f.maxRate && RATES_PUBLIC) { // v430: no rate filter while rates are private
      const r = rateOf(c);
      if (!r || r > f.maxRate) return false;
    }
    if (f.city.trim()) {
      const city = `${c.city || ""} ${c.state || ""}`.toLowerCase();
      if (!city.includes(f.city.trim().toLowerCase())) return false;
    }
    return true;
  });
}

const EMPTY = { categories: [], followers: [], maxRate: 0, city: "" };

// v415: Escape closes an open sheet (keyboard / desktop-width tablets)
function useEscape(active, onClose) {
  const ref = React.useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active || typeof document === "undefined") return undefined;
    const onKey = (e) => { if (e.key === "Escape") ref.current?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active]);
}
const isFiltered = (f) => f.categories.length > 1 || f.followers.length > 0 || f.maxRate > 0 || f.city.trim() !== "";

function Avatar({ c, size = 48, radius = 14 }) {
  const src = photoOf(c);
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="object-cover shrink-0" style={{ width: size, height: size, borderRadius: radius }} />;
  }
  return (
    <div className="shrink-0 flex items-center justify-center text-white font-bold" style={{ width: size, height: size, borderRadius: radius, background: `linear-gradient(160deg,${gradientFor(creatorId(c))})`, fontSize: size / 3.2 }}>
      {initials(nameOf(c))}
    </div>
  );
}

function Pill({ active, onClick, children, testId }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId}
      className={`h-[34px] px-[13px] rounded-[10px] flex items-center text-[12.5px] shrink-0 whitespace-nowrap ${active ? "bg-[#0A0A0A] text-white font-semibold" : "bg-[#F2F2F7] text-[#4B5563] font-medium"}`}>
      {children}
    </button>
  );
}

function SheetChip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className={`h-[34px] px-3 rounded-[10px] flex items-center text-[12.5px] border ${active ? "bg-[#F5F0FF] border-[#E2D6FF] text-[#7C3AED] font-semibold" : "bg-[#F9F9FB] border-[#E5E5EA] text-[#6B7280] font-medium"}`}>
      {children}
    </button>
  );
}

// Place search header: exact city found, or "none in X yet — nearby".
function NearbyNote({ results }) {
  const city = results[0].__nearCity;
  const exact = results.filter((c) => c.__distanceKm < 3).length;
  return (
    <div className="rounded-2xl bg-[#F3EDFF] text-[#5B21B6] px-3.5 py-2.5 text-[12.5px] leading-snug" data-testid="explore-nearby-note">
      {exact ? `${exact} creator${exact === 1 ? "" : "s"} in ${city}${results.length > exact ? ", then nearby" : ""}` : `No creators in ${city} yet — showing creators near ${city}`}
    </div>
  );
}

// "12 km from Faridabad" in a place search; the city otherwise.
const whereText = (c) => (c.__distanceKm != null && c.__distanceKm >= 3 ? `${Math.round(c.__distanceKm)} km from ${c.__nearCity}` : c.city || "");

// EX-01 grid card — Session 43 (Ravi): same details as the desktop card (name, followers, primary
// niche, city, average reach), no verified badge, no rate.
function GridCard({ c, onOpen }) {
  const fc = followersOf(c), niche = firstNiche(c);
  const [photoBroken, setPhotoBroken] = useState(false); // v415: a broken photo now shows the monogram too (was an empty gradient)
  const photo = photoBroken ? "" : photoOf(c);
  const reach = parseCount(c.avg_reach_per_reel || c.avg_reach || c.avg_views_30d || 0);
  return (
    <button type="button" onClick={onOpen} data-testid={`explore-card-${creatorId(c)}`}
      className="w-full aspect-[3/4] rounded-2xl overflow-hidden relative text-left" style={{ background: `linear-gradient(160deg,${gradientFor(creatorId(c))})` }}>
      {photo && <img src={photo} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" onError={() => setPhotoBroken(true)} />}
      {/* v415: no photo → a small monogram in a soft circle (was 34px initials filling the card) */}
      {!photo && <div className="absolute inset-x-0 top-[22%] flex justify-center" data-testid="explore-card-monogram"><span className="w-14 h-14 rounded-full bg-white/90 text-[#334155] text-[18px] font-bold flex items-center justify-center shadow-[0_6px_18px_-8px_rgba(15,23,42,.45)]">{initials(nameOf(c))}</span></div>}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,rgba(0,0,0,0) 44%,rgba(0,0,0,.8) 100%)" }} />
      {/* v397 (Ravi): no niche and no city → name + followers drop down into that empty corner, next to AVG REACH.
          When the creator fills them in, the name goes back up and the niche / city show in that corner. */}
      {!niche && !whereText(c) ? (
        <div className="absolute left-[11px] right-[11px] bottom-[11px] flex items-end justify-between gap-2" data-testid="explore-card-compact">
          <div className="min-w-0">
            <div className="text-[14.5px] leading-[1.15] font-semibold text-white truncate">{nameOf(c)}</div>
            {fc > 0 && <div className="mt-0.5 text-[11.5px] text-white/85 truncate"><b className="font-semibold text-white">{short(fc)}</b> followers</div>}
          </div>
          {reach > 0 && <div className="text-right shrink-0 pl-1"><div className="text-[13px] font-bold text-white leading-none">{short(reach)}</div><div className="text-[11px] tracking-[.5px] text-white/80 mt-0.5 whitespace-nowrap">AVG REACH</div></div>}
        </div>
      ) : (
      <div className="absolute left-[11px] right-[11px] bottom-[11px]">
        <div className="text-[14.5px] leading-[1.15] font-semibold text-white truncate">{nameOf(c)}</div>
        {fc > 0 && <div className="mt-0.5 text-[11.5px] text-white/85 truncate"><b className="font-semibold text-white">{short(fc)}</b> followers</div>}
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="min-w-0 flex flex-col gap-1">
            {niche && <div title={niche} className="self-start max-w-full h-[20px] px-2 rounded-[7px] border border-white/60 text-[10px] font-semibold text-white leading-[18px] truncate">{String(niche).split(" & ")[0]}</div>}{/* v358: "Fashion & Lifest" was cut mid-word in the pill — short name + real ellipsis */}
            {whereText(c) && <div className="flex items-center gap-1 text-[10.5px] text-white/85 min-w-0"><MapPin size={10} className="shrink-0" /><span className="truncate min-w-0">{whereText(c)}</span></div>}
          </div>
          {reach > 0 && <div className="text-right shrink-0 pl-1"><div className="text-[13px] font-bold text-white leading-none">{short(reach)}</div><div className="text-[11px] tracking-[.5px] text-white/80 mt-0.5 whitespace-nowrap">AVG REACH</div></div>}
        </div>
      </div>
      )}
    </button>
  );
}

// EX-03 row with select circle
function ResultRow({ c, selected, selectable, onToggle, onOpen }) {
  const fc = followersOf(c), rate = rateOf(c), niche = firstNiche(c);
  const reach = parseCount(c.avg_reach_per_reel || c.avg_reach || c.avg_views_30d || 0);
  return (
    <div className={`bg-white rounded-[18px] border p-3 flex items-center gap-3 ${selected ? "border-[#7C3AED]" : "border-[#E6E6EE]"}`}>
      {selectable && (
        // v332: 40px tap area around the 24px circle (it was easy to miss and open the profile instead)
        <button type="button" onClick={onToggle} aria-label={selected ? `Unselect ${nameOf(c)}` : `Select ${nameOf(c)}`} aria-pressed={selected} data-testid={`explore-select-${creatorId(c)}`}
          className="w-10 h-10 -m-2 shrink-0 flex items-center justify-center">
          <span className={`w-6 h-6 rounded-full flex items-center justify-center border-2 ${selected ? "bg-[#7C3AED] border-[#7C3AED]" : "border-[#C8C8D2]"}`}>
            {selected && <Check size={14} color="#fff" strokeWidth={3} />}
          </span>
        </button>
      )}
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 flex items-center gap-3 text-left">
        <Avatar c={c} size={48} radius={14} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5"><span className="text-[14.5px] font-semibold text-[#0A0A0A] truncate">{nameOf(c)}</span>{c.is_featured && <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-semibold" data-testid="featured-badge">Featured</span>}</div>
          <div className="mt-0.5 text-xs text-[#6B7280] truncate">{[fc ? short(fc) : "", reach ? `${short(reach)} avg reach` : "", whereText(c)].filter(Boolean).join(" · ")}</div>
          {niche && <div className="mt-1.5 inline-flex h-5 px-2 rounded-md bg-[#F3EDFF] items-center text-[10px] font-bold uppercase tracking-[.5px] text-[#7C3AED]">{niche}</div>}
        </div>
        <div className="text-right shrink-0">
          {!RATES_PUBLIC ? null : rate > 0 ? (<><div className="text-[14.5px] font-bold text-[#0A0A0A]">{rupees(rate)}</div><div className="text-[11px] text-[#6B7280]">/reel</div></>) : <div className="text-[11px] text-[#6B7280]">No rate card</div>}{/* v430: rates hidden from brands for now */}
        </div>
      </button>
    </div>
  );
}

// EX-02
function FilterSheetBody({ open, initial, base, search = "", onCancel, onApply }) {
  const [draft, setDraft] = useState(initial);
  useEffect(() => { if (open) setDraft(initial); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useScrollLock(open);
  useEscape(open, onCancel); // v415: Escape closes the sheet
  const count = useMemo(() => applyFilters(base, search, draft).length, [base, search, draft]); // v358: count includes the typed search (said "Show 12", opened 3)
  if (!open) return null;
  const toggle = (field, v) => setDraft((d) => ({ ...d, [field]: d[field].includes(v) ? d[field].filter((x) => x !== v) : [...d[field], v] }));
  const rateIdx = Math.max(0, RATE_STEPS.indexOf(draft.maxRate));
  return (
    <ModalPortal>
      <PopupBackdrop className="fixed inset-0 z-[80] bg-[rgba(10,10,14,.45)]" onClick={onCancel} />
      <PopupPanel kind="sheet" onClose={onCancel} className="fixed left-0 right-0 bottom-0 z-[81] bg-white rounded-t-[26px] px-[18px] pt-2.5 max-h-[88vh] max-h-[88dvh] overflow-y-auto" /* v332: dvh so iOS toolbars don't hide "Show N creators" */ style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }} data-testid="explore-filter-sheet">
        <div className="w-10 h-[5px] rounded-[3px] bg-[#E0E0E6] mx-auto" />
        <div className="mt-3 flex items-center justify-between">
          <div className="text-lg font-bold text-[#0A0A0A]">Filters</div>
          <button type="button" onClick={() => setDraft(EMPTY)} className="text-[13px] font-semibold text-[#7C3AED] min-h-[40px] px-2 -mr-2">Reset</button>{/* v332: tap target */}
        </div>
        <div className="mt-4 text-[10.5px] font-semibold tracking-[.7px] uppercase text-[#6B7280]">Category</div>
        <div className="mt-[9px] flex flex-wrap gap-2">
          {CATEGORY_CHIPS.map((x) => <SheetChip key={x.label} active={draft.categories.includes(x.label)} onClick={() => toggle("categories", x.label)}>{x.label}</SheetChip>)}
        </div>
        <div className="mt-[18px] text-[10.5px] font-semibold tracking-[.7px] uppercase text-[#6B7280]">Followers</div>
        <div className="mt-[9px] flex flex-wrap gap-2">
          {FOLLOWER_RANGES.map((r) => <SheetChip key={r.key} active={draft.followers.includes(r.key)} onClick={() => toggle("followers", r.key)}>{r.label}</SheetChip>)}
        </div>
        {RATES_PUBLIC && (<>
        <div className="mt-[18px] flex items-baseline justify-between">
          <div className="text-[10.5px] font-semibold tracking-[.7px] uppercase text-[#6B7280]">Rate per reel</div>
          <div className="text-xs font-medium text-[#0A0A0A]">{draft.maxRate ? `Up to ${rupees(draft.maxRate)}` : "Any rate"}</div>
        </div>
        <input type="range" min={0} max={RATE_STEPS.length - 1} step={1} value={rateIdx} aria-label="Rate per reel"
          onChange={(e) => setDraft((d) => ({ ...d, maxRate: RATE_STEPS[Number(e.target.value)] }))}
          className="mt-3 w-full accent-[#7C3AED]" />
        </>)}
        <div className="mt-[18px] text-[10.5px] font-semibold tracking-[.7px] uppercase text-[#6B7280]">City</div>
        <div className="mt-[9px] h-[46px] rounded-[14px] bg-[#F9F9FB] border border-[#E5E5EA] flex items-center gap-2.5 px-3.5">
          <MapPin size={16} color="#9CA3AF" />
          <input value={draft.city} onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))} placeholder="Any city" aria-label="City" /* v332: label + 16px (iOS zoom) */ className="flex-1 min-w-0 bg-transparent outline-none text-base text-[#0A0A0A] placeholder:text-[#ABABAB]" />
        </div>
        <div className="mt-4 flex gap-[9px]">
          <button type="button" onClick={onCancel} className="h-[50px] px-5 rounded-[14px] bg-[#F2F2F7] text-[14.5px] font-semibold text-[#0A0A0A]">Cancel</button>
          <button type="button" onClick={() => onApply(draft)} data-testid="explore-show-results" className="flex-1 h-[50px] rounded-[14px] bg-[#7C3AED] text-white text-[14.5px] font-semibold">
            Show {count.toLocaleString("en-IN")} creator{count === 1 ? "" : "s"}
          </button>
        </div>
      </PopupPanel>
    </ModalPortal>
  );
}

// Session 37: stays mounted for its closing animation.
function FilterSheet(props) {
  return <Presence>{props.open && <FilterSheetBody key="filtersheet" {...props} />}</Presence>;
}


// EX-05 (one or many creators)
// Session 58 (Eva handoff §7.1): from Eva, `hideRate` hides the creator's rate (rates are private for brands)
// and `budget` prefills "Your offer" with the brand's budget per creator.
function InviteSheetBody({ open, creators, onClose, onSent, hideRate = false, budget = 0 }) {
  const navigate = useNavigate();
  const { isBusy, anyBusy, run } = useBusy();
  const [campaigns, setCampaigns] = useState(null);
  const [campaignsError, setCampaignsError] = useState(false); // v344: failed load ≠ "no live campaign"
  const [campaignsTick, setCampaignsTick] = useState(0);
  const [picked, setPicked] = useState("");
  const [fee, setFee] = useState("");
  const [message, setMessage] = useState("");
  useScrollLock(open);
  useEscape(open, () => { if (!anyBusy) onClose(); }); // v415: Escape closes (not while sending)
  const single = creators.length === 1 ? creators[0] : null;
  const cardRate = single && !hideRate && RATES_PUBLIC ? rateOf(single) : 0; // v430

  useEffect(() => {
    if (!open) return;
    setPicked(""); setMessage(""); setFee(budget ? String(budget) : cardRate ? String(cardRate) : "");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setCampaigns(null); setCampaignsError(false); // v344
    // The brand's OWN campaigns (desktop Explore used to list every brand's live campaign).
    api.get("campaigns?mine=true").then(({ data }) => {
      if (!alive) return;
      const list = (Array.isArray(data) ? data : []).filter((c) => {
        const st = String(c.status || "").toLowerCase();
        return (st === "live" || st === "approved") && !c.closed_at;
      });
      setCampaigns(list);
    }).catch(() => { if (alive) { setCampaigns([]); setCampaignsError(true); } }); // v344
    return () => { alive = false; };
  }, [open, campaignsTick]);

  if (!open) return null;
  const pick = (c) => {
    const id = c.campaign_id || c.id;
    setPicked(id);
    if (!message.trim()) setMessage(String(c.description || "").slice(0, 1500));
    if (!fee && c.budget_min) setFee(String(c.budget_min));
  };
  const pickedCampaign = (campaigns || []).find((c) => (c.campaign_id || c.id) === picked);
  const feeNum = Number(String(fee).replace(/[^0-9.]/g, ""));

  const send = () => run("send", async () => {
    if (!message.trim()) { toast.error("Please write a short message for the creator.", { id: "explore-invite" }); return; } // v416: one toast, no stack
    if (!feeNum || feeNum < MIN_INVITE) { toast.error(`Please enter the fee you are offering (${rupees(MIN_INVITE)} or more).`, { id: "explore-invite" }); return; }
    let ok = 0;
    const failed = []; // v416 (C6/CR9): { id, why }
    for (const c of creators) {
      try {
        await api.post(`/creators/${creatorId(c)}/send-brief`, {
          campaign_title: pickedCampaign?.title || undefined,
          campaign_description: message.trim(),
          budget_range: String(feeNum),
          deliverables: pickedCampaign?.deliverables ? (Array.isArray(pickedCampaign.deliverables) ? deliverablesLabel(pickedCampaign.deliverables) /* v415 */ : String(pickedCampaign.deliverables)) : undefined,
          message: message.trim(),
          pitch: message.trim(),
          campaign_id: picked || undefined, // v416 (C7): the invite is linked to the picked campaign (same as desktop)
        });
        ok++;
      } catch (err) {
        failed.push({ id: creatorId(c), why: `${nameOf(c) || "Creator"}: ${inviteFailReason(err)}` });
      }
    }
    const reasons = failed.slice(0, 3).map((f) => f.why).join(" · ") + (failed.length > 3 ? ` · +${failed.length - 3} more` : "");
    if (ok === creators.length) {
      toast.success(ok === 1 ? "Invite sent" : `Invites sent to ${ok} creators`, { position: "top-center", id: "explore-invite" });
      onSent?.();
    } else if (ok > 0) {
      // v416 (C6/CR9): say who and why; the ones that failed stay selected (it cleared the whole selection)
      toast.warning(`Sent to ${ok} of ${creators.length} creators. The rest are still selected.`, { position: "top-center", id: "explore-invite", description: reasons, duration: 8000 });
      onSent?.(failed.map((f) => f.id));
    } else {
      toast.error(creators.length === 1 ? "Couldn't send the invite." : "Couldn't send the invites.", { position: "top-center", id: "explore-invite", description: reasons, duration: 8000 }); // v416: real reason
    }
  });

  const title = single ? `Invite ${nameOf(single).split(" ")[0] || "creator"} to a campaign` : `Invite ${creators.length} creators to a campaign`;
  return (
    <ModalPortal>
      <PopupBackdrop className="fixed inset-0 z-[80] bg-[rgba(10,10,14,.45)]" onClick={() => !anyBusy && onClose()} />
      <PopupPanel kind="sheet" onClose={() => !anyBusy && onClose()} className="fixed left-0 right-0 bottom-0 z-[81] bg-white rounded-t-[26px] px-[18px] pt-2.5 flex flex-col gap-3.5 max-h-[90vh] max-h-[90dvh] overflow-y-auto" /* v332: dvh */ style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }} data-testid="explore-invite-sheet">
        <div className="w-10 h-[5px] rounded-[3px] bg-[#E0E0E6] self-center" />
        <div className="flex items-start justify-between gap-3">
          <div className="text-lg leading-[1.3] font-bold text-[#0A0A0A]">{title}</div>
          <button type="button" onClick={onClose} disabled={anyBusy} aria-label="Close" className="w-10 h-10 -mr-1 rounded-full bg-[#F2F2F7] flex items-center justify-center shrink-0"><X size={16} /></button>{/* v332: 40px */}
        </div>
        <div className="flex flex-col gap-2">
          {campaigns === null && <Shimmer className="h-[58px] rounded-2xl" />}
          {campaignsError && ( /* v344 */
            <div className="flex items-center gap-2 text-[13px] text-[#B91C1C]" role="alert">
              <span className="flex-1">Couldn't load your campaigns</span>
              <button type="button" onClick={() => setCampaignsTick((t) => t + 1)} className="min-h-[36px] px-3 rounded-xl bg-[#F3EDFF] text-[#7C3AED] font-semibold">Retry</button>
            </div>
          )}
          {campaigns && campaigns.length === 0 && !campaignsError && <div className="text-[13px] text-[#6B7280]">You have no live campaign. You can still send an invite with your own message.</div>}
          {(campaigns || []).map((c) => {
            const id = c.campaign_id || c.id; const on = id === picked;
            const min = Number(c.budget_min || 0), max = Number(c.budget_max || 0);
            const budget = min && max && max !== min ? `${rupeesShort(min)}–${short(max)}` : (min || max) ? rupeesShort(min || max) : "";
            return (
              <button type="button" key={id} onClick={() => pick(c)} className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left ${on ? "border-[1.5px] border-[#7C3AED] bg-[#FBF9FF]" : "border border-[#E0E0E8] bg-white"}`}>
                <span className={`w-5 h-5 rounded-full shrink-0 box-border ${on ? "border-[6px] border-[#7C3AED]" : "border-2 border-[#C8C8D2]"}`} />
                <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-[#0A0A0A] truncate">{c.title || "Untitled campaign"}</span>{budget && <span className="block text-xs text-[#6B7280]">{budget}</span>}</span>
              </button>
            );
          })}
          <button type="button" onClick={() => { onClose(); navigate("/brand/campaigns/create"); }} className="self-start text-[13px] font-semibold text-[#7C3AED] px-0.5 pt-0.5 flex items-center gap-1"><Plus size={14} /> Create a new campaign</button>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-[#374151]">{single ? "Offer for 1 Reel" : "Offer per creator"}</span>
          <div className="min-h-[50px] rounded-[14px] border border-[#E0E0E8] px-3.5 flex items-center gap-1">
            <span className="text-[15px] font-medium text-[#6B7280]">₹</span>
            <input inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value.replace(/[^0-9]/g, ""))} placeholder={String(MIN_INVITE)} className="flex-1 min-w-0 outline-none text-base font-medium text-[#0A0A0A]" aria-label="Offer amount" />{/* v332: 16px stops iOS zoom */}
          </div>
          <div className="text-xs leading-[1.4] text-[#6B7280]">{budget ? `Everyone here fits up to ${rupees(budget)} per creator` : cardRate ? `Their rate card says ${rupees(cardRate)} per reel` : `Minimum ${rupees(MIN_INVITE)}`}</div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-[#374151]">Message</span>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="What you'd like them to create, and when." aria-label="Message" className="rounded-[14px] border border-[#E0E0E8] px-3.5 py-3 outline-none text-base text-[#0A0A0A] resize-none" />{/* v332: 16px stops iOS zoom */}
        </div>
        <button type="button" onClick={send} disabled={anyBusy} data-testid="explore-send-invite" className="h-[50px] rounded-2xl bg-[#7C3AED] text-white flex items-center justify-center gap-2 text-[15px] font-semibold disabled:opacity-60" style={{ boxShadow: "0 12px 22px -14px rgba(124,58,237,.9)" }}>
          {isBusy("send") ? <ButtonSpinner /> : <Send size={16} />} Send invite
        </button>
        <div className="-mt-1.5 text-center text-xs text-[#6B7280]">No money moves until you hire {single ? "them" : "a creator"}. Chat opens when they accept.</div>
      </PopupPanel>
    </ModalPortal>
  );
}

// Session 37: stays mounted for its closing animation.
export function InviteSheet(props) {
  return <Presence>{props.open && <InviteSheetBody key="invitesheet" {...props} />}</Presence>;
}


export default function ExploreMobile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const isBrand = isBrandLike(user); // v416 (CR4)
  const [selectMode, setSelectMode] = useState(false); // v416 (C24): pick creators without setting a filter first
  const [all, setAll] = useState(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(() => {
    const niche = params.get("niche") || params.get("category");
    const cat = niche ? CATEGORY_CHIPS.find((x) => x.label.toLowerCase() === niche.toLowerCase() || x.keys.some((k) => wordIn(niche, k))) : null;
    return { ...EMPTY, categories: cat ? [cat.label] : [], city: params.get("city") || "" };
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const [inviteFor, setInviteFor] = useState(null);

  const load = async () => {
    setError(false);
    try {
      const { data } = await api.get("creators/explore", { timeout: 30000 });
      setAll(visibleCreators(Array.isArray(data) ? data : []));
    } catch {
      setAll([]); setError(true);
    }
  };
  useEffect(() => { load(); }, []);

  const base = all || [];
  const featuredSet = useFeaturedCreators();
  const results = useMemo(() => { const r = applyFilters(base, search, filters); return r[0]?.__nearCity ? r : featuredFirst(r, featuredSet); }, [base, search, filters, featuredSet]); // session 36 · 43: place search keeps distance order
  const [shown, setShown] = useState(EXPLORE_STEP);
  useEffect(() => { setShown(EXPLORE_STEP); }, [search, filters]); // new search / filter → start from the top 20
  const more = React.useCallback((all) => setShown((n) => (all ? 100000 : n + EXPLORE_STEP)), []);
  const onScreen = results.slice(0, shown);
  const verifiedCount = useMemo(() => base.filter((c) => isVerified(c)).length, [base]);
  const resultsMode = isFiltered(filters);
  const selectedCreators = base.filter((c) => selected.includes(creatorId(c)));
  const selectedTotal = selectedCreators.reduce((s, c) => s + rateOf(c), 0);
  const toggleSel = (c) => setSelected((s) => (s.includes(creatorId(c)) ? s.filter((x) => x !== creatorId(c)) : [...s, creatorId(c)]));
  const setCategory = (lab) => setFilters((f) => ({ ...f, categories: lab ? [lab] : [] }));
  const open = (c) => navigate(`/creator/${creatorId(c)}`, { state: { preview: { photo: photoOf(c), name: c?.name || "" } } }); // v429: skeleton shows the photo + name at once

  const summary = [
    filters.categories.join(", "),
    filters.followers.map((k) => FOLLOWER_RANGES.find((r) => r.key === k)?.label).filter(Boolean).join(", "),
    filters.maxRate ? `up to ${rupeesShort(filters.maxRate)}` : "",
    filters.city.trim(),
  ].filter(Boolean).join(" · ");
  const activeCount = filters.categories.length + filters.followers.length + (filters.maxRate ? 1 : 0) + (filters.city.trim() ? 1 : 0);

  return (
    <div className="bg-[#F2F2F7] flex flex-col" data-testid="explore-mobile">{/* v360: no min-h-screen — a short list left an empty screen before the footer */}
      <div className="bg-white border-b border-[#E5E5EA] sticky top-0 z-30" style={{ paddingTop: 0 /* Session 43: #root starts below the clock */ }}>
        <div className="pt-3 px-4 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[22px] leading-[1.1] font-semibold tracking-[-.7px] text-[#0A0A0A]">{resultsMode ? `${results.length.toLocaleString("en-IN")} creator${results.length === 1 ? "" : "s"}` : "Explore creators"}</div>{/* v332: "1 creator" */}
            <div className="mt-1.5 flex items-center gap-[7px]">
              {!resultsMode && <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />}
              <div className="text-xs text-[#6B7280] truncate">
                {resultsMode ? summary : all === null ? "Loading…" : `${base.length.toLocaleString("en-IN")} creator${base.length === 1 ? "" : "s"}${verifiedCount ? ` · ${verifiedCount.toLocaleString("en-IN")} verified` : ""}`}
              </div>
            </div>
          </div>
          {/* Session 43 (Ravi): no profile circle here — the account is in the bottom bar. */}
          {!user && (
            <button type="button" onClick={() => navigate("/signup")} className="h-9 px-3.5 rounded-xl bg-[#7C3AED] text-white text-[13px] font-semibold shrink-0">Sign up free</button>
          )}
        </div>
        <div className="pt-3.5 px-4 flex gap-[9px]">
          <div className="flex-1 min-w-0 h-11 rounded-[14px] bg-[#F2F2F7] flex items-center gap-2.5 px-3.5">
            <Search size={16} color="#9CA3AF" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, handle or city" aria-label="Search creators" enterKeyHint="search" /* v332: 16px — iPhone zoomed the page at 14px */ className="flex-1 min-w-0 bg-transparent outline-none text-base text-[#0A0A0A] placeholder:text-[#ABABAB]" />
            {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="w-10 h-10 -mr-3 flex items-center justify-center shrink-0">{/* v330: 32px tap area (was the 15px icon) · v332: 40px */}<X size={15} color="#9CA3AF" /></button>}
          </div>
          {isBrand && (
            <button type="button" onClick={() => { setSelectMode((v) => !v); if (selectMode) setSelected([]); }} aria-pressed={selectMode} data-testid="explore-select-toggle"
              className={`h-11 px-3.5 rounded-[14px] text-[13px] font-semibold shrink-0 border ${selectMode ? "bg-[#7C3AED] border-[#7C3AED] text-white" : "bg-white border-[#E0E0E8] text-[#0A0A0A]"}`}>
              {selectMode ? "Done" : "Select"}{/* v416 (C24) */}
            </button>
          )}
          <button type="button" onClick={() => setFilterOpen(true)} aria-label="Filters" data-testid="explore-filters-button" className="w-11 h-11 rounded-[14px] bg-[#0A0A0A] flex items-center justify-center shrink-0 relative">
            <SlidersHorizontal size={18} color="#fff" />
            {activeCount > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#7C3AED] text-white text-[10px] font-bold flex items-center justify-center">{activeCount}</span>}
          </button>
        </div>
        <div className="py-3 px-4 flex gap-2 overflow-x-auto no-scrollbar">
          {resultsMode ? (
            <>
              <Pill active onClick={() => setFilterOpen(true)}>{activeCount} filter{activeCount === 1 ? "" : "s"}</Pill>
              <button type="button" onClick={() => { setFilters(EMPTY); setSelected([]); }} className="h-[34px] px-[13px] rounded-[10px] bg-[#F2F2F7] text-[#4B5563] text-[12.5px] font-medium shrink-0 flex items-center gap-1"><X size={13} /> Clear</button>
            </>
          ) : (
            <>
              <Pill active={filters.categories.length === 0} onClick={() => setCategory(null)}>All</Pill>
              {CATEGORY_CHIPS.map((x) => <Pill key={x.label} active={filters.categories[0] === x.label} onClick={() => setCategory(x.label)} testId={`explore-chip-${x.label}`}>{x.label}</Pill>)}
            </>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 pt-3.5" style={{ paddingBottom: selected.length ? 96 : 8 /* v360: Layout already clears the bottom bar — 110px here left a big empty gap above the footer */ }}>
        {all === null ? (
          <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <Shimmer key={i} className="aspect-[3/4] rounded-2xl" />)}</div>
        ) : error ? (
          <OfflineAware className="mt-6" onRetry={load}>{/* v334: offline → OfflineState */}
          <div className="mt-10 text-center">
            <div className="text-[15px] font-semibold text-[#0A0A0A]">Couldn't load creators</div>
            <button type="button" onClick={load} className="mt-3 h-10 px-4 rounded-xl bg-[#7C3AED] text-white text-sm font-semibold">Try again</button>
          </div>
          </OfflineAware>
        ) : results.length === 0 ? (
          <div className="mt-10 text-center px-6">
            <div className="text-[15px] font-semibold text-[#0A0A0A]">No creators match</div>
            <div className="mt-1 text-[13px] text-[#6B7280]">Try fewer filters or a different search.</div>
            <button type="button" onClick={() => { setFilters(EMPTY); setSearch(""); }} className="mt-3 h-10 px-4 rounded-xl bg-[#F3EDFF] text-[#7C3AED] text-sm font-semibold">Clear filters</button>
          </div>
        ) : (resultsMode || (isBrand && selectMode)) ? ( /* v416 (C24): Select shows the selectable list */
          <div className="flex flex-col gap-2.5">
            {results[0]?.__nearCity && <NearbyNote results={results} />}
            {onScreen.map((c) => <ResultRow key={creatorId(c)} c={c} selectable={isBrand} selected={selected.includes(creatorId(c))} onToggle={() => toggleSel(c)} onOpen={() => open(c)} />)}
            {shown < results.length && <MoreOnScroll key={shown} onMore={more} />}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {/* v378 (Ravi: "square nahi, side space bekar"): 2 cards per row filling the width, each a 3:4 portrait */}
            {results[0]?.__nearCity && <div className="col-span-2"><NearbyNote results={results} /></div>}
            {onScreen.map((c) => <GridCard key={creatorId(c)} c={c} onOpen={() => open(c)} />)}
            {shown < results.length && <MoreOnScroll key={shown} onMore={more} />}
          </div>
        )}
      </div>

      {/* v415: the selection bar slides in / out (it used to pop in and vanish) */}
      <Presence>{isBrand && selected.length > 0 && (
        <motion.div key="selbar" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: 0.18 }}
          className="fixed left-3 right-3 z-40 bg-[#0A0A0A] rounded-[20px] px-4 py-3 flex items-center gap-3" style={{ bottom: "calc(62px + env(safe-area-inset-bottom, 0px))" /* v348: sits on the shorter bottom bar (was 84px) */ }} data-testid="explore-selection-bar">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white">{selected.length} selected</div>
            {RATES_PUBLIC && selectedTotal > 0 && <div className="text-xs text-white/70">{rupees(selectedTotal)} total at rate card</div>}
          </div>
          <button type="button" onClick={() => setInviteFor(selectedCreators)} className="h-11 px-4 rounded-[14px] bg-[#7C3AED] text-white text-sm font-semibold">Invite to campaign</button>
        </motion.div>
      )}</Presence>

      <FilterSheet open={filterOpen} initial={filters} base={base} search={search} onCancel={() => setFilterOpen(false)} onApply={(f) => { setFilters(f); setFilterOpen(false); setSelected([]); }} />
      <InviteSheet open={Boolean(inviteFor)} creators={inviteFor || []} onClose={() => setInviteFor(null)} onSent={(failedIds) => { setInviteFor(null); setSelected(Array.isArray(failedIds) && failedIds.length ? failedIds : []); /* v416 (CR9): failed ones stay selected */ }} />
    </div>
  );
}
