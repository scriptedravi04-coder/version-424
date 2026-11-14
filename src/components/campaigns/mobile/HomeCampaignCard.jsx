import React from "react";
import { ArrowRight, Eye, Clock } from "lucide-react";
import { campaignStatsFor, campaignAvatarsFor } from "../../../utils/campaignStatsForViewer";
import { getCreatorRequirementsString } from "../../../utils/campaignRequirementLine";

// Session 58 (Ravi: "home pe jo campaign aa raha hai, adhi adhuri details … kitne views, kitne applied,
// payout kya hai — campaign page jaisa dikhao", reference: a brand-card with face, posted time, the brief,
// per-influencer payout and the deliverable). Same numbers and rules as the Campaigns list card
// (CampaignsListMobile): views / applied from campaignStatsFor, the auto requirement line, budget range.

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
// v415: one budget rule for every campaign card (brand + creator): min 0 + max → "Up to ₹max";
// "Barter" only when both are 0/empty (and at least one was really sent as 0); full en-IN amounts.
// Returns "" when the campaign has no budget fields at all.
export function campaignBudgetText(c, sep = " – ") {
  if (!c) return "";
  const has = (v) => v !== null && v !== undefined && String(v).trim() !== "";
  const lo = Number(c.budget_min) || 0, hi = Number(c.budget_max) || 0;
  if (lo > 0 && hi > lo) return `${inr(lo)}${sep}${inr(hi)}`;
  if (lo > 0) return inr(lo);
  if (hi > 0) return `Up to ${inr(hi)}`;
  return has(c.budget_min) || has(c.budget_max) ? "Barter" : "";
}
// v415: whole calendar days (IST) until a close date; null = no / bad date, negative = already closed.
// A "YYYY-MM-DD" date is open through that whole IST day. Same answer on the list, detail and cards.
export function campaignDaysLeft(deadline, now = Date.now()) {
  if (!deadline) return null;
  const s = String(deadline);
  const IST = 5.5 * 3600000;
  let day = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  if (!day) {
    const t = Date.parse(s);
    if (Number.isNaN(t)) return null;
    day = new Date(t + IST).toISOString().slice(0, 10);
  }
  const today = new Date(now + IST).toISOString().slice(0, 10);
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}
// v415: one wording for the "Looking for" line (it read "Any Niche Creators (Any Gender) … English Pan India.")
export function lookingForLine({ categories = [], platforms = [], reach = "", gender = "", languages = [], locations = [] } = {}) {
  const who = `${categories.length ? `${categories.join(", ")} creators` : "Creators"}${gender && gender !== "Both" && gender !== "Any" ? ` (${gender.toLowerCase()})` : ""}`;
  const bits = [`${who} on ${platforms.length ? platforms.join(" & ") : "Instagram"}`];
  if (reach) bits.push(`with ${reach}`);
  let line = bits.join(" ");
  if (languages.length) line += `, fluent in ${languages.join(" or ")}`;
  line += locations.length ? `, based in ${locations.join(" or ")}.` : ", anywhere in India.";
  return line;
}

// v416: lowest payout per creator on a campaign — same ₹3,000 floor as direct invites and offers (server checks too).
export let MIN_CAMPAIGN_PAYOUT = 2000; // v420: special offer (usually ₹3,000); the server sends the real floor
// v419: Ybex in-house brands (marked by an admin) start at ₹500 — the server says which. ES module exports are live,
// so every screen that imports MIN_CAMPAIGN_PAYOUT reads the brand's own number once this has loaded.
let limitsLoad = null, limitsFor = null;
export function ensureBrandLimits(uid = "") {
  if (uid !== limitsFor) { limitsFor = uid; limitsLoad = null; MIN_CAMPAIGN_PAYOUT = 2000; } // another account on this phone
  if (!limitsLoad) limitsLoad = import("../../../lib/api").then(({ api }) => api.get("brands/me/limits", { timeout: 15000 })).then((r) => { const n = Number(r?.data?.min_payout); if (n > 0) MIN_CAMPAIGN_PAYOUT = n; return MIN_CAMPAIGN_PAYOUT; }).catch(() => MIN_CAMPAIGN_PAYOUT);
  return limitsLoad;
}

// v416: error text for a toast — a server 5xx (or a long/raw message) never shows its raw detail; 4xx keeps the
// server's own short sentence ("Minimum payout is ₹3,000").
export function campaignErrorText(err, fallback = "Something went wrong on our side. Please try again.") {
  const status = Number(err?.response?.status) || 0;
  if (!err?.response) return fallback;
  if (status >= 500) return "Something went wrong on our side. Please try again.";
  const d = err?.response?.data;
  const m = (d && (typeof d.detail === "string" ? d.detail : typeof d.error === "string" ? d.error : typeof d.message === "string" ? d.message : "")) || "";
  return m && m.length >= 4 && m.length < 200 ? m : fallback;
}

export function budgetLine(c) {
  return campaignBudgetText(c, "–") || "Open budget"; // v415: "Up to ₹X" when only a max is set
}
export function deliverableLine(c) {
  const d = Array.isArray(c?.deliverables) ? c.deliverables.filter(Boolean).map((x) => (typeof x === "string" ? x : x?.label || x?.type || "")).filter(Boolean) : [];
  return d.length ? d.slice(0, 2).join(" + ") : "As per brief";
}
export function postedAgo(iso, now = Date.now()) {
  const t = Date.parse(iso || "");
  if (Number.isNaN(t)) return "";
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 60) return m <= 1 ? "Just now" : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }); // v330: IST
}
function closesIn(deadline) {
  // v416 (CR20): IST calendar days — the same number as the detail page (UTC maths was a day off)
  const days = campaignDaysLeft(deadline);
  if (days == null || days < 0) return "";
  if (days === 0) return "Closes today";
  return days === 1 ? "Closes tomorrow" : `Closes in ${days} days`;
}

// v333 (Ravi: "Eva ke andar campaign ka UI generic rakh — dashboard jaisa, bas color green"): the same card is used
// inside Ybex Eva with tone="green", a custom pay line (UGC budget per video) and an action button underneath.
const TONES = {
  purple: { tint: "#F5F0FF", ink: "#7C3AED", ring: "#E6E6EE" },
  green: { tint: "#ECFDF3", ink: "#15803D", ring: "#DCEFE2" },
};
export default function HomeCampaignCard({ c, user, onOpen, tone = "purple", payLabel = "Per creator", payText = null, tag = null, footer = null, selected = false, style: extraStyle = null }) {
  const T = TONES[tone] || TONES.purple;
  const [logoBroken, setLogoBroken] = React.useState(false); // v330: fall back to the letter when the logo fails
  const brandName = c.brand_name || c.company || c.brand || "Brand";
  const logo = c.brand_logo || c.brand_photo || "";
  const stats = campaignStatsFor(c, user);
  const avatars = campaignAvatarsFor(c, stats.applied || 2, user);
  const req = c.description
    ? String(c.description).replace(/\s+/g, " ").trim()
    : getCreatorRequirementsString({
      isUgc: false, categories: c.categories || (c.category ? [c.category] : []), platforms: c.platforms || [],
      follower_min: c.follower_min, follower_max: c.follower_max, gender: c.gender || "Both",
      languages: c.languages || [], location: c.location_type || c.city || "",
    });
  const closes = closesIn(c.deadline);
  const ago = postedAgo(c.created_at);

  return (
    <Root footer={footer} onOpen={onOpen} selected={selected} T={T}
      style={{ width: "min(300px, 82vw)", scrollSnapAlign: "start", fontFamily: "'DM Sans', sans-serif", ...(extraStyle || {}) }}>
      <div className="flex items-center gap-2.5">
        {logo && !logoBroken && !String(logo).includes("dicebear") ? (
          <img src={logo} alt="" onError={() => setLogoBroken(true)} className="w-11 h-11 rounded-full object-cover bg-white border border-[#E5E5EA] shrink-0" />
        ) : (
          <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-[15px] shrink-0" style={{ background: T.tint, color: T.ink }}>
            {String(brandName).trim().charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold text-[#0A0A0A] truncate">{brandName}</div>
          <div className="text-[11.5px] text-[#6B7280] truncate">{tag ? `${tag} · ` : ""}{ago || (tag === "UGC" ? "New brief" : "New campaign")}{closes ? ` · ${closes}` : ""}</div>
        </div>
        {c.matchScore != null ? (
          <span className="shrink-0 px-2 py-1 rounded-full text-[10.5px] font-bold" style={{ background: T.tint, color: T.ink }}>{c.matchScore}% match</span>
        ) : (
          <span className="shrink-0 w-8 h-8 rounded-full border border-[#E6E6EE] flex items-center justify-center" style={{ color: T.ink }}><ArrowRight size={15} /></span>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-[#F2F2F5]">
        <div className="text-[14px] font-bold text-[#0A0A0A] leading-snug line-clamp-1">{c.title || c.campaign_name || "Campaign"}</div>
        {req ? <p className="mt-1 text-[12.5px] leading-[1.5] text-[#374151] line-clamp-2 min-h-[37px]">{req}</p> : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-[#F9F9FB] px-2.5 py-2 min-w-0">
          <div className="text-[11px] font-bold tracking-wider text-[#8E8E93] uppercase">{payLabel}</div>
          <div className="text-[13.5px] font-bold truncate" style={{ color: tone === "green" ? T.ink : "#0A0A0A" }}>{payText || budgetLine(c)}</div>
        </div>
        <div className="rounded-xl bg-[#F9F9FB] px-2.5 py-2 min-w-0">
          <div className="text-[11px] font-bold tracking-wider text-[#8E8E93] uppercase">Deliverable</div>
          <div className="text-[12.5px] font-semibold text-[#0A0A0A] truncate">{deliverableLine(c)}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-[11.5px] text-[#6B7280]">
        {stats.views != null ? (
          <span className="inline-flex items-center gap-1 font-semibold"><Eye size={12} /> {Number(stats.views).toLocaleString("en-IN")} views</span>
        ) : closes ? (
          <span className="inline-flex items-center gap-1 font-semibold"><Clock size={12} /> {closes}</span>
        ) : <span />}
        <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: T.ink }}>
          {Array.isArray(avatars) && avatars.length > 0 && (
            <span className="flex -space-x-1.5">
              {avatars.slice(0, 3).map((a, i) => <img key={i} src={a} alt="" onError={(e) => { e.currentTarget.style.display = "none"; } /* v330: hide a broken face */} className="w-4 h-4 rounded-full border border-white bg-gray-100 object-cover" />)}
            </span>
          )}
          {stats.applied ? `${stats.applied}+ applied` : "Be the first to apply"}
        </span>
      </div>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </Root>
  );
}

// With an action button inside (Eva), the card can't itself be a <button> — the top part opens the campaign.
function Root({ footer, onOpen, selected, T, style, children }) {
  const cls = "text-left bg-white rounded-[20px] border p-3.5 flex flex-col shrink-0 transition-transform";
  const ring = selected ? { borderColor: T.ink, boxShadow: `0 0 0 3px ${T.tint}` } : { borderColor: T.ring };
  if (!footer) {
    return <button type="button" onClick={onOpen} data-testid="home-campaign-card" className={`${cls} active:scale-[.99]`} style={{ ...style, ...ring }}>{children}</button>;
  }
  return (
    <div data-testid="home-campaign-card" className={cls} style={{ ...style, ...ring }}
      role="button" tabIndex={0} onClick={(e) => { if (e.target.closest("button,a")) return; onOpen?.(); }}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); onOpen?.(); } }}>
      {children}
    </div>
  );
}
