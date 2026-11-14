import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, Share2, Heart, BadgeCheck, Star, Send, Pencil, Sparkles, ExternalLink, Lock } from "lucide-react";
import PortfolioCoversMobile from "./PortfolioCoversMobile";

// v363 (Ravi's design 1f "Public profile — photo-led, live stats"): on phones the creator's face is the cover
// and fades into the page colour (sampled from the photo — see adaptiveTheme.js), then chips, name, one CTA and one
// glass panel with the four numbers. Numbers are never invented: "—" when we don't have them.

/** 10376 → "10.4K", 1250000 → "12.5L" style short counts (Indian). null → "—". Pure. */
export function shortCount(v) {
  const n = Number(v);
  if (v === null || v === undefined || v === "" || !Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e7) return `${(n / 1e7).toFixed(n >= 1e8 ? 0 : 1).replace(/\.0$/, "")}Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1).replace(/\.0$/, "")}L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
}
const fullCount = (v) => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) || n <= 0 ? "—" : Math.round(n).toLocaleString("en-IN");
};

/** The four numbers of the stats panel + whether they're live from Instagram. Pure. */
export function profileNumbers(c = {}) {
  const st = c.instagram_stats && typeof c.instagram_stats === "object" ? c.instagram_stats : {};
  const pick = (...xs) => xs.find((x) => x !== null && x !== undefined && x !== "" && Number(x) > 0);
  const er = [st.engagement_rate, c.engagement_rate].find((x) => x !== null && x !== undefined && x !== "" && Number.isFinite(Number(x)) && Number(x) > 0);
  return {
    followers: pick(c.ig_followers, c.followers_instagram, c.follower_count, st.followers),
    views: pick(c.avg_views_30d, st.avg_views, st.reach_28d),
    likes: pick(c.avg_likes_30d, st.avg_likes),
    er: er === undefined ? null : Number(er),
    live: Boolean(c.instagram_synced_at) && !st.error,
  };
}

/** v430: the creator's Instagram page, from whatever field has the handle. "" when unknown. Pure. */
export function instagramUrlOf(c = {}) {
  const st = c.instagram_stats && typeof c.instagram_stats === "object" ? c.instagram_stats : {};
  const raw = String(c.instagram_handle || c.instagram || st.username || c.social_handle || "").trim();
  if (!raw) return "";
  const m = raw.match(/instagram\.com\/([A-Za-z0-9._]{1,30})/i);
  const h = (m ? m[1] : raw).replace(/^@+/, "").replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? `https://www.instagram.com/${h}/` : "";
}
function IgGlyph({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs><linearGradient id="ybIgG" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#FEDA75" /><stop offset=".35" stopColor="#FA7E1E" /><stop offset=".6" stopColor="#D62976" /><stop offset=".85" stopColor="#962FBF" /><stop offset="1" stopColor="#4F5BD5" /></linearGradient></defs>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#ybIgG)" />
      <circle cx="12" cy="12" r="4.3" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="17.4" cy="6.6" r="1.3" fill="#fff" />
    </svg>
  );
}


// ═══ v432 (Ravi's redesign 2b "one page, tap-to-Instagram, rates coming soon") ═══════════════════════════════
// The phone creator profile is ONE scroll: the face fades into the page colour (adaptiveTheme.js), name + verified
// tick, the Instagram handle (shine, opens Instagram), the four numbers sit on the page (no box), one info line,
// jump chips (Work · Reviews · About · Rates) that stick to the top with the name once you scroll, and the
// "Send collab request" bar stays at the bottom. Every card uses the page colour — no white desktop cards.

export const PROFILE_SECTIONS = [["work", "Work"], ["reviews", "Reviews"], ["about", "About"], ["rates", "Rates"]];
export const LIGHT_PAGE = { mode: "light", bg: "#F2F2F7", text: "#0A0A0A", sub: "rgba(10,10,10,.6)", glass: "#FFFFFF", glassBorder: "#E5E7EB", ctaBg: "#7C3AED", ctaText: "#FFFFFF", chipBg: "rgba(10,10,10,.06)" };
const SHINE_CSS = "@keyframes ybShine{0%{background-position:120% 0}45%,100%{background-position:-60% 0}}"
  + ".yb-shine{text-decoration:underline;text-decoration-color:var(--yb-b);text-underline-offset:3px;text-decoration-thickness:1.5px;background-image:linear-gradient(100deg,var(--yb-b) 0%,var(--yb-b) 40%,var(--yb-g) 50%,var(--yb-b) 60%,var(--yb-b) 100%);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;animation:ybShine 3.6s ease-in-out infinite}"
  + "@media (prefers-reduced-motion:reduce){.yb-shine{animation:none}}";

/** "barter_friendly" → "Open to barter". "" when unknown. Pure. */
export function barterLabel(v) {
  return ({ barter_ok: "Open to barter", barter_friendly: "Open to barter", barter_only: "Barter only", no_barter: "Paid only", cash_only: "Paid only", partial_barter: "Paid + product" })[String(v || "")] || "";
}
/** About rows that have a value — empty fields are left out (no "Not specified"). Pure. */
export function aboutRows(c = {}) {
  const langs = (Array.isArray(c.languages) ? c.languages : String(c.languages || "").split(",")).map((x) => String(x).trim()).filter(Boolean);
  return [
    ["Niche", [c.category || c.primary_niche, ...(Array.isArray(c.sub_categories) ? c.sub_categories : [])].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(", ")],
    ["Based in", c.city || ""],
    ["Languages", langs.join(", ")],
    ["Collab type", barterLabel(c.barter || c.barter_mode)],
  ].filter(([, v]) => v);
}
/** Which section is under the sticky bar right now. Pure: tops = {id: px from viewport top}. */
export function activeSectionAt(tops = {}, offset = 140) {
  let cur = PROFILE_SECTIONS[0][0];
  for (const [id] of PROFILE_SECTIONS) if (tops[id] != null && tops[id] - offset <= 0) cur = id;
  return cur;
}

function ShineHandle({ handle, href, t }) {
  const base = t.mode === "dark" ? "#FFFFFF" : "#0A0A0A";
  const glow = t.mode === "dark" ? "#C4B5FD" : "#A78BFA";
  const Tag = href ? "a" : "span";
  return (
    <Tag {...(href ? { href, target: "_blank", rel: "noopener noreferrer", "aria-label": `Open @${handle} on Instagram` } : {})}
      className="inline-flex items-center gap-1.5 font-extrabold shrink-0" style={{ color: base, textDecoration: "none" }} data-testid="public-profile-ig-link">
      <IgGlyph size={15} />
      <span>@<span className="yb-shine" style={{ "--yb-b": base, "--yb-g": glow }}>{handle}</span></span>
    </Tag>
  );
}

function Chip({ active, t, onClick, children }) {
  const on = t.mode === "dark" ? { background: "#FFFFFF", color: "#0A0A0A" } : { background: "#0A0A0A", color: "#FFFFFF" };
  const off = { background: t.chipBg, color: t.text, border: `1px solid ${t.glassBorder}` };
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="h-9 px-4 rounded-full text-[13px] font-bold whitespace-nowrap transition-colors" style={active ? on : off}>{children}</button>
  );
}
function Card({ t, className = "", children, ...rest }) {
  return <div className={`rounded-[20px] p-4 ${className}`} style={{ background: t.glass, border: `1px solid ${t.glassBorder}` }} {...rest}>{children}</div>;
}
function SectionHead({ t, title, badge, right }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[17px] font-black tracking-[-0.01em] flex items-center gap-2">{title}{badge}</h2>
      {right}
    </div>
  );
}
function Stars({ n = 0, size = 12 }) {
  return <span className="inline-flex gap-0.5">{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} className={i <= Math.round(n) ? "fill-amber-400 text-amber-400" : "text-amber-400/30"} />)}</span>;
}
function BrandDot({ t, name, src }) {
  const [bad, setBad] = useState(false);
  return src && !bad
    ? <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBad(true)} className="w-8 h-8 rounded-full object-cover shrink-0" />
    : <span className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-black shrink-0" style={{ background: t.mode === "dark" ? "#fff" : "#0A0A0A", color: t.mode === "dark" ? "#0A0A0A" : "#fff" }}>{String(name || "B").charAt(0).toUpperCase()}</span>;
}

/**
 * The whole phone profile. Data and actions come from CreatorPublicView (same API calls as before).
 * viewer: { isOwner, isBrand, loggedIn } · cta: { label, icon, onClick } | null · saved: { active, onClick } | null
 * reviewForm: { can, open, setOpen, rating, setRating, comment, setComment, onSubmit, submitting }
 */
export default function PhotoLedHeaderMobile({
  c, theme, photoUrl, onBack, onShare,
  verified = false, match = null, portfolioItems = [], reviews = [], loadingReviews = false,
  scores = { overall: "New", quality: "—", time: "—", comm: "—" },
  viewer = { isOwner: false, isBrand: false, loggedIn: false },
  cta = null, saved = null, onAskQuote = null, onNotifyRates = null, reviewForm = null, footer = null,
}) {
  const [photoBroken, setPhotoBroken] = useState(false);
  const [active, setActive] = useState("work");
  const [stuck, setStuck] = useState(false);
  const [allReviews, setAllReviews] = useState(false);
  const chipsRef = useRef(null);
  const jumpUntil = useRef(0);
  const refs = { work: useRef(null), reviews: useRef(null), about: useRef(null), rates: useRef(null) };
  const hasPhoto = Boolean(photoUrl) && !photoBroken && theme;
  const t = hasPhoto ? theme : LIGHT_PAGE;
  const nums = profileNumbers(c);
  const igUrl = instagramUrlOf(c || {});
  const handle = igUrl ? igUrl.replace(/^https:\/\/www\.instagram\.com\//, "").replace(/\/$/, "") : "";
  const place = [c.category || c.primary_niche || "", c.city || ""].filter(Boolean).join(" · ");
  const roundBtn = t.mode === "dark" ? "bg-black/35 text-white border border-white/15" : "bg-white/85 text-slate-800 border border-black/5";
  const first = String(c.name || "the creator").trim().split(/\s+/)[0];
  const nReviews = reviews.length;
  const reviewsLabel = nReviews ? `★ ${scores.overall} (${nReviews} review${nReviews === 1 ? "" : "s"})` : "New on Ybex";
  const otherWork = (portfolioItems || []).filter((it) => it && !it.cover && (it.content_url || it.url || it.link || it.title));
  const hasCovers = (portfolioItems || []).some((it) => it?.cover);
  const pastBrands = (Array.isArray(c.past_brands) ? c.past_brands : []).filter(Boolean);
  const about = aboutRows(c);
  const rates = { reel: Number(c.rate_reel || c.reel_rate || c.rate_card?.reels || c.rate_card?.reel) || 0, story: Number(c.rate_story || c.story_rate || c.rate_card?.stories || c.rate_card?.story) || 0, yt: Number(c.rate_yt_video || c.youtube_video_rate || c.rate_card?.yt_video || c.rate_card?.youtube_integration) || 0 };
  const accent = t.mode === "dark" ? "#C4B5FD" : "#7C3AED";
  const topInset = viewer.loggedIn ? 0 : 84; // logged-out visitors have the site header (Ybex · Sign in) fixed on top

  // the chip row sticks (with the name) once it scrolls under the top; the chip of the section on screen lights up
  useEffect(() => {
    const onScroll = (e) => {
      const cr = chipsRef.current?.getBoundingClientRect();
      if (cr) setStuck(cr.top < 8 + topInset);
      if (Date.now() < jumpUntil.current) return; // a chip tap is still scrolling to its section
      const el = e?.target && e.target.nodeType === 1 ? e.target : document.scrollingElement;
      if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 6 && el.scrollTop > 0) { setActive(PROFILE_SECTIONS[PROFILE_SECTIONS.length - 1][0]); return; } // the end: Rates can't reach the top
      const tops = {};
      for (const [id] of PROFILE_SECTIONS) { const r = refs[id].current?.getBoundingClientRect(); if (r) tops[id] = r.top; }
      setActive(activeSectionAt(tops, 140 + topInset));
    };
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll, { capture: true });
  }, [topInset]); // eslint-disable-line react-hooks/exhaustive-deps
  const jump = (id) => { jumpUntil.current = Date.now() + 900; setActive(id); refs[id].current?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  const chipRow = (
    <div className="flex gap-2 overflow-x-auto no-scrollbar" role="tablist" aria-label="Profile sections">
      {PROFILE_SECTIONS.map(([id, label]) => <Chip key={id} t={t} active={active === id} onClick={() => jump(id)}>{label}</Chip>)}
    </div>
  );

  return (
    <div data-testid="public-profile-photo-led" data-theme={t.mode} style={{ "--yb-sm": `${118 + topInset}px`, background: t.bg, color: t.text, minHeight: "100vh", paddingBottom: cta ? "calc(env(safe-area-inset-bottom, 0px) + 118px)" : 32 }}>
      <style>{SHINE_CSS}</style>

      {/* sticky bar: back · photo · name, then the jump chips */}
      <div className={`fixed inset-x-0 z-40 transition-all duration-200 ${stuck ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"}`}
        style={{ top: topInset, background: t.bg, borderBottom: `1px solid ${t.glassBorder}`, paddingTop: topInset ? 8 : "calc(env(safe-area-inset-top, 0px) + 8px)" }} data-testid="public-profile-sticky" aria-hidden={!stuck}>
        <div className="flex items-center gap-2.5 px-4 pb-2">
          <button type="button" onClick={onBack} aria-label="Back" className="w-9 h-9 -ml-1 flex items-center justify-center"><ChevronLeft size={21} /></button>
          {hasPhoto ? <img src={photoUrl} alt="" className="w-8 h-8 rounded-full object-cover" /> : <span className="w-8 h-8 rounded-full bg-[#7C3AED] text-white flex items-center justify-center text-[13px] font-black">{String(c.name || "C").charAt(0).toUpperCase()}</span>}
          <span className="text-[15px] font-extrabold truncate">{c.name || "Creator"}</span>
        </div>
        <div className="px-4 pb-2.5">{chipRow}</div>
      </div>

      {/* cover: the face fading into the page colour, name on top of it */}
      <div className="relative w-full" style={{ height: hasPhoto ? "min(56vh, 470px)" : 200 }}>
        {hasPhoto ? (
          <img src={photoUrl} alt={c.name || "Creator"} referrerPolicy="no-referrer" onError={() => setPhotoBroken(true)}
            className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: "center 25%" }} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "linear-gradient(160deg,#8B5CF6 0%,#7C3AED 55%,#6D28D9 100%)" }}>
            <span className="text-white/95 text-6xl font-black">{String(c.name || "C").trim().charAt(0).toUpperCase()}</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0" style={{ height: hasPhoto ? "55%" : "45%", background: `linear-gradient(to bottom, ${t.bg}00 0%, ${t.bg}BF 55%, ${t.bg} 92%)` }} />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
          <button type="button" onClick={onBack} aria-label="Back" className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center ${roundBtn}`}><ChevronLeft size={20} /></button>
          <button type="button" onClick={onShare} aria-label="Share profile" className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center ${roundBtn}`}><Share2 size={16} /></button>
        </div>
        <div className="absolute inset-x-0 bottom-3 px-5">
          <h1 className="text-[28px] leading-[1.08] font-black tracking-[-0.02em] break-words flex items-center gap-1.5">
            <span>{c.name || "Creator"}</span>{verified && <BadgeCheck size={22} className="shrink-0 text-emerald-400" aria-label="KYC verified" />}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]">
            {handle && <ShineHandle handle={handle} href={igUrl} t={t} />}
            {place && <span className="font-semibold" style={{ color: t.sub }}>{handle ? "· " : ""}{place}</span>}
          </div>
        </div>
      </div>

      <div className="px-5">
        {/* the four numbers, on the page (tap → Instagram) */}
        <a href={igUrl || undefined} target={igUrl ? "_blank" : undefined} rel="noopener noreferrer" onClick={(e) => { if (!igUrl) e.preventDefault(); }}
          className="grid grid-cols-4 gap-1 pt-2" style={{ color: "inherit", textDecoration: "none" }} aria-label={igUrl ? "Open Instagram profile" : undefined} data-testid="public-profile-stats">
          {[["Followers", shortCount(nums.followers)], ["Avg views", shortCount(nums.views)], ["Avg likes", fullCount(nums.likes)], ["Engagement", nums.er != null ? `${Number(nums.er).toFixed(1).replace(/\.0$/, "")}%` : "—"]].map(([label, value]) => (
            <div key={label}>
              <div className="text-[18px] font-black tracking-[-0.01em]" style={label === "Engagement" && value !== "—" ? { color: accent } : undefined}>{value}</div>
              <div className="text-[11px] font-semibold mt-0.5" style={{ color: t.sub }}>{label}</div>
            </div>
          ))}
        </a>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] font-semibold" style={{ color: t.sub }} data-testid="public-profile-ig-line">
          {nums.live ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Live from Instagram</> : <>Numbers by the creator</>}
          <span>· {reviewsLabel}</span>
          {match && <span>· <b style={{ color: accent }}>{match.score}% match</b></span>}
        </div>
        <div className="mt-4 h-px" style={{ background: t.glassBorder }} />

        {/* jump chips (the same row sticks to the top once scrolled) */}
        <div ref={chipsRef} className="mt-4">{chipRow}</div>

        {/* ── Work ── */}
        <section ref={refs.work} id="work" className="pt-5 scroll-mt-[var(--yb-sm)]" data-testid="profile-section-work">
          {pastBrands.length > 0 && (
            <div className="mb-4">
              <div className="text-[11.5px] font-bold mb-2" style={{ color: t.sub }}>Worked with</div>
              <div className="flex flex-wrap gap-1.5">{pastBrands.map((b, i) => <span key={`${b}-${i}`} className="h-7 px-3 rounded-full text-[12px] font-bold inline-flex items-center" style={{ background: t.chipBg, border: `1px solid ${t.glassBorder}` }}>{b}</span>)}</div>
            </div>
          )}
          <PortfolioCoversMobile items={portfolioItems} theme={t} />
          {otherWork.length > 0 && (
            <div className={`${hasCovers ? "mt-5" : ""} space-y-2`}>
              {hasCovers && <div className="text-[11.5px] font-bold" style={{ color: t.sub }}>More work</div>}
              {otherWork.map((it, i) => {
                const url = it.content_url || it.url || it.link || "";
                return (
                  <a key={`${it.id || url}-${i}`} href={url || undefined} target="_blank" rel="noopener noreferrer" onClick={(e) => { if (!url) e.preventDefault(); }}
                    className="flex items-center gap-3 rounded-2xl px-3.5 py-3" style={{ background: t.glass, border: `1px solid ${t.glassBorder}`, color: "inherit", textDecoration: "none" }}>
                    <BrandDot t={t} name={it.brand_name || it.brand || it.title} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13.5px] font-bold truncate">{it.title || it.brand_name || it.brand || "Sample work"}</span>
                      {(it.brand_name || it.brand) && it.title && <span className="block text-[11.5px] truncate" style={{ color: t.sub }}>{it.brand_name || it.brand}</span>}
                    </span>
                    {url && <ExternalLink size={15} style={{ color: t.sub }} />}
                  </a>
                );
              })}
            </div>
          )}
          {!hasCovers && !otherWork.length && (
            <Card t={t} className="text-center py-7"><p className="text-[13.5px] font-bold">No work added yet</p><p className="text-[12px] mt-1" style={{ color: t.sub }}>{viewer.isOwner ? "Add your best reels so brands can see your style." : `You can still send ${first} a collab request.`}</p></Card>
          )}
        </section>

        {/* ── Reviews ── */}
        <section ref={refs.reviews} id="reviews" className="pt-8 scroll-mt-[var(--yb-sm)]" data-testid="profile-section-reviews">
          <SectionHead t={t} title="Reviews" right={nReviews > 2 && <button type="button" onClick={() => setAllReviews((v) => !v)} className="text-[12.5px] font-bold" style={{ color: accent }}>{allReviews ? "Show less" : `See all ${nReviews}`}</button>} />
          {loadingReviews ? <Card t={t}><p className="text-[12.5px]" style={{ color: t.sub }}>Loading reviews…</p></Card> : nReviews > 0 ? (
            <div className="space-y-2.5">
              <Card t={t} className="flex items-center gap-4">
                <div className="shrink-0 text-center w-16"><div className="text-[34px] leading-none font-black">{scores.overall}</div><div className="text-[11px] mt-1.5" style={{ color: t.sub }}>{nReviews} brand{nReviews === 1 ? "" : "s"}</div></div>
                <div className="flex-1 space-y-1.5">
                  {[["Quality", scores.quality], ["On time", scores.time], ["Communication", scores.comm]].map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-[11.5px] font-semibold">
                      <span className="w-[92px] shrink-0" style={{ color: t.sub }}>{k}</span>
                      <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: t.chipBg }}><span className="block h-full rounded-full bg-amber-400" style={{ width: `${(Number(v) || 0) * 20}%` }} /></span>
                      <span className="w-6 text-right font-bold">{v}</span>
                    </div>
                  ))}
                </div>
              </Card>
              {(allReviews ? reviews : reviews.slice(0, 2)).map((r, i) => (
                <Card t={t} key={`${r.review_id || r.id || "rev"}-${i}`}>
                  <div className="flex items-center gap-2.5">
                    <BrandDot t={t} name={r.brand_name} src={r.brand_picture || r.brand_logo || r.logo || r.company_logo} />
                    <span className="flex-1 min-w-0 text-[13.5px] font-bold truncate">{r.brand_name || "Brand"}</span>
                    <Stars n={Number(r.rating || r.overall_rating) || 0} />
                  </div>
                  {(r.comment || r.review_text) && <p className="mt-2 text-[13px] leading-relaxed break-words" style={{ color: t.sub }}>{r.comment || r.review_text}</p>}
                </Card>
              ))}
            </div>
          ) : (
            <Card t={t} className="text-center py-6"><p className="text-[13.5px] font-bold">No reviews yet</p><p className="text-[12px] mt-1" style={{ color: t.sub }}>Brands review {first} after a finished collab.</p></Card>
          )}
          {reviewForm?.can && !reviewForm.open && (
            <button type="button" onClick={() => reviewForm.setOpen(true)} className="mt-2.5 w-full h-11 rounded-full text-[13px] font-bold" style={{ background: t.chipBg, border: `1px solid ${t.glassBorder}` }}>Write a review</button>
          )}
          {reviewForm?.can && reviewForm.open && (
            <form onSubmit={reviewForm.onSubmit} className="mt-2.5"><Card t={t} className="space-y-3">
              <div className="text-[13.5px] font-bold">Your review</div>
              <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${n} star${n > 1 ? "s" : ""}`} aria-pressed={n <= reviewForm.rating} onClick={() => reviewForm.setRating(n)} className="p-1"><Star size={24} className={n <= reviewForm.rating ? "fill-amber-400 text-amber-400" : "text-amber-400/30"} /></button>)}</div>
              <textarea value={reviewForm.comment} onChange={(e) => reviewForm.setComment(e.target.value)} rows={3} required placeholder={`How was working with ${first}?`}
                className="w-full rounded-2xl p-3 text-base outline-none" style={{ background: t.chipBg, border: `1px solid ${t.glassBorder}`, color: t.text }} />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => reviewForm.setOpen(false)} className="h-10 px-4 rounded-full text-[13px] font-bold" style={{ color: t.sub }}>Cancel</button>
                <button type="submit" disabled={reviewForm.submitting} className="h-10 px-5 rounded-full text-[13px] font-bold disabled:opacity-60" style={{ background: t.ctaBg, color: t.ctaText }}>{reviewForm.submitting ? "Sending…" : "Post review"}</button>
              </div>
            </Card></form>
          )}
        </section>

        {/* ── About ── */}
        <section ref={refs.about} id="about" className="pt-8 scroll-mt-[var(--yb-sm)]" data-testid="profile-section-about">
          <SectionHead t={t} title="About" />
          <Card t={t} className="space-y-3">
            {c.bio ? <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">{c.bio}</p> : <p className="text-[13px]" style={{ color: t.sub }}>{viewer.isOwner ? "Add a short bio — brands read this first." : `${first} hasn't added a bio yet.`}</p>}
            {about.length > 0 && (
              <div className="pt-1 space-y-2">
                {about.map(([k, v]) => <div key={k} className="flex gap-3 text-[12.5px]"><span className="w-[88px] shrink-0 font-semibold" style={{ color: t.sub }}>{k}</span><span className="font-bold break-words">{v}</span></div>)}
              </div>
            )}
          </Card>
          {match?.reason && (
            <Card t={t} className="mt-2.5 flex items-start gap-3" data-testid="profile-match">
              <span className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-[12px] font-black" style={{ background: t.chipBg, color: accent }}>{match.score}%</span>
              <span className="text-[12.5px] leading-snug"><b>Match with your brand.</b> <span style={{ color: t.sub }}>{match.reason}</span></span>
            </Card>
          )}
        </section>

        {/* ── Rates ── brands see "coming soon"; the creator sees her own (saved, private) */}
        <section ref={refs.rates} id="rates" className="pt-8 scroll-mt-[var(--yb-sm)]" data-testid="profile-section-rates">
          {viewer.isOwner ? (
            <>
              <SectionHead t={t} title="Rates" badge={<span className="inline-flex items-center gap-1 h-5 px-2 rounded-md text-[10px] font-black uppercase" style={{ background: t.chipBg, color: t.sub }}><Lock size={10} /> Only you</span>} />
              <Card t={t} className="space-y-2.5" data-testid="rates-owner-note">
                {[["Instagram Reel", rates.reel], ["Instagram Story", rates.story], ["YouTube video", rates.yt]].filter(([, v], i) => v || i < 2).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-[13.5px]"><span className="font-semibold">{k}</span><span className="font-black">{v ? `₹${v.toLocaleString("en-IN")}` : <span style={{ color: t.sub }}>Not set</span>}</span></div>
                ))}
                <p className="text-[11.5px] pt-1" style={{ color: t.sub }}>Brands see your rates later with Ybex Pro. For now they ask you for a quote.</p>
              </Card>
            </>
          ) : (
            <>
              <SectionHead t={t} title="Rates" badge={<span className="h-5 px-2 rounded-md text-[10px] font-black uppercase inline-flex items-center bg-amber-400 text-[#1A1206]">Coming soon</span>} />
              <div className="relative overflow-hidden rounded-[20px] p-4" style={{ background: t.mode === "dark" ? "linear-gradient(145deg, rgba(167,139,250,.16), rgba(255,255,255,.05))" : "linear-gradient(145deg, #F5F0FF, #FFFFFF)", border: `1px solid ${t.mode === "dark" ? "rgba(196,181,253,.28)" : "#DDD6FE"}` }} data-testid="rates-coming-soon-mobile">
                <div className="absolute right-3 top-4 space-y-2 opacity-60 blur-[2px] pointer-events-none" aria-hidden="true">
                  {["Reel ₹ • • • •", "Story ₹ • • •"].map((x) => <div key={x} className="text-[12px] font-bold">{x}</div>)}
                </div>
                <div className="relative flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: t.mode === "dark" ? "rgba(196,181,253,.2)" : "#EDE9FE", color: accent }}><Sparkles size={16} /></span>
                  <span className="text-[15px] font-extrabold">Creator rates · with Ybex Pro</span>
                </div>
                <p className="relative mt-3 text-[12.5px] leading-relaxed" style={{ color: t.sub }}>We're checking every creator's rates so the prices you see are real. Until then, ask {first} for a quote in the collab request.</p>
                <div className="relative mt-3.5 flex gap-2">
                  {onNotifyRates && <button type="button" onClick={onNotifyRates} className="h-9 px-4 rounded-full text-[12.5px] font-bold" style={{ background: t.mode === "dark" ? "#FFFFFF" : "#0A0A0A", color: t.mode === "dark" ? "#0A0A0A" : "#FFFFFF" }}>Notify me</button>}
                  {onAskQuote && <button type="button" onClick={onAskQuote} className="h-9 px-4 rounded-full text-[12.5px] font-bold" style={{ background: t.chipBg, border: `1px solid ${t.glassBorder}` }}>Ask for a quote</button>}
                </div>
              </div>
            </>
          )}
        </section>

        {footer && <div className="pt-8 flex justify-center">{footer}</div>}
      </div>

      {/* the action stays at the bottom */}
      {cta && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pt-3" style={{ background: t.bg, borderTop: `1px solid ${t.glassBorder}`, paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)" }} data-testid="public-profile-cta-bar">
          <div className="flex items-center gap-2.5">
            {saved && (
              <button type="button" onClick={saved.onClick} aria-label={saved.active ? "Remove from saved" : "Save profile"} aria-pressed={Boolean(saved.active)}
                className="w-[52px] h-[52px] rounded-full flex items-center justify-center shrink-0"
                style={{ background: saved.active ? "#F43F5E" : t.glass, border: `1px solid ${saved.active ? "#F43F5E" : t.glassBorder}`, color: saved.active ? "#fff" : t.text }}>
                <Heart size={20} className={saved.active ? "fill-white" : ""} />
              </button>
            )}
            <button type="button" onClick={cta.onClick} data-testid="public-profile-cta"
              className="flex-1 h-[52px] rounded-full text-[15px] font-bold inline-flex items-center justify-center gap-2 active:scale-[.99] transition"
              style={{ background: t.ctaBg, color: t.ctaText }}>
              {cta.icon === "edit" ? <Pencil size={15} /> : <Send size={15} />} {cta.label}
            </button>
          </div>
          {viewer.isBrand && <p className="mt-1.5 text-center text-[11px] font-medium" style={{ color: t.sub }}>You pay into escrow · released only when you approve</p>}
        </div>
      )}
    </div>
  );
}
