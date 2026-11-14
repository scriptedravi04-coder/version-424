import { HiwSectionHelp } from "../../whatsNew/WhatsNewPopup"; // v437: How it works button / popup / reminder
import React, { useMemo, useState } from "react";
import { Search, X, CheckCircle2, Megaphone, ChevronRight, MapPin, SlidersHorizontal, Eye, CheckCircle, Clock } from "lucide-react";
import { Shimmer } from "../../common/ContentSkeletons";
import PullToRefresh from "../../common/PullToRefresh";
import { OfflineAware } from "../../common/OfflineState"; // v334
import { computeCreatorMatch } from "../../../lib/creatorMatch";
import { Presence, PopupBackdrop, PopupPanel } from "../../common/Popup";
import SocialLogo from "../../common/SocialLogo"; // v364: real platform logos
import { campaignDaysLeft } from "./HomeCampaignCard"; // v416 (CR20): shared IST days-left rule

// Session 23 — design "Creator Complete Mobile UI" C01 (Live campaigns) + C05 (Closed / empty).
// Session 39 (Ravi): card shows what desktop shows — "Actively reviewing", the auto requirement line
// ("…creators on Instagram with 10k+ followers…"), views · applied with faces (generated numbers only
// for creators, session 38), plus the real "2d ago", "Closes in N days" and the match % (same rules
// as Home's Best matches). Filter sheet = desktop filters (niche, platform, budget, location).
// Presentation only: data comes from the desktop Campaigns page (same calls).

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const budgetText = (c) => {
  const lo = Number(c.budget_min || 0), hi = Number(c.budget_max || 0);
  if (lo && hi && hi !== lo) return `${inr(lo)}–${inr(hi)}`;
  return lo || hi ? inr(lo || hi) : "Open budget";
};
const deliverableText = (c) => {
  // v332: deliverables can be objects ({ type, label }) — showed "[object Object]".
  const d = Array.isArray(c.deliverables) ? c.deliverables.map((x) => (typeof x === "string" ? x : x?.label || x?.type || "")).filter(Boolean) : [];
  return d.length ? d.slice(0, 2).join(" + ") : "As per brief";
};
export function closesIn(deadline) {
  // v416 (CR20): IST calendar days — the same number as the detail page (UTC maths was a day off)
  const days = campaignDaysLeft(deadline);
  if (days == null || days < 0) return "";
  if (days === 0) return "Closes today";
  return days === 1 ? "Closes tomorrow" : `Closes in ${days} days`;
}
const PLATFORMS = ["Instagram", "YouTube", "Facebook", "Snapchat", "X", "LinkedIn"];
const BUDGETS = [[0, "Any budget"], [5000, "₹5,000+"], [10000, "₹10,000+"], [25000, "₹25,000+"], [50000, "₹50,000+"]];

function Initial({ name, logo }) {
  const [broken, setBroken] = useState(false); // v330: a dead logo URL showed a broken-image box
  if (logo && !broken && !String(logo).includes("dicebear")) {
    return <img src={logo} alt="" onError={() => setBroken(true)} className="w-10 h-10 shrink-0 rounded-xl object-cover bg-white border border-[#E5E5EA]" />;
  }
  return (
    <div className="w-10 h-10 shrink-0 rounded-xl bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center font-bold text-[15px]">
      {String(name || "B").trim().charAt(0).toUpperCase()}
    </div>
  );
}

function CampaignCard({ c, applied, match, onOpen, closed = false }) {
  const closes = closesIn(c.deadline);
  return (
    <button
      onClick={() => onOpen(c.id)}
      data-testid="campaign-card"
      className="w-full text-left bg-white rounded-[20px] border border-[#E5E5EA] p-4 active:scale-[.99] transition-transform"
    >
      <div className="flex items-start gap-3">
        <Initial name={c.brand_name} logo={c.brand_logo} />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-[#0A0A0A] leading-snug line-clamp-2">{c.title}</div>
          <div className="mt-0.5 text-[12px] text-[#6B7280] truncate">{c.brand_name}{c.time_ago ? ` · ${c.time_ago}` : ""}</div>
        </div>
        {applied ? (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#ECFDF5] text-[#059669] text-[11px] font-bold">
            <CheckCircle2 size={12} /> Applied
          </span>
        ) : match != null ? (
          <span className="shrink-0 px-2 py-1 rounded-full bg-[#F5F0FF] text-[#7C3AED] text-[11px] font-bold">{match}% match</span>
        ) : null}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {/* v332: closed campaigns also said "Actively reviewing" */}
        {closed ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6B7280] bg-[#F3F4F6] border border-[#E5E5EA] px-2 py-0.5 rounded-md">Closed</span>
        ) : (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#059669] bg-[#ECFDF5] border border-[#A7F3D0] px-2 py-0.5 rounded-md">
          <CheckCircle size={11} /> Actively reviewing
        </span>
        )}
        {closes && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#B45309]">
            <Clock size={11} /> {closes}
          </span>
        )}
      </div>

      {c.requirement_line && (
        <p className="mt-2 text-[12.5px] leading-[1.5] text-[#374151] line-clamp-2">{c.requirement_line}</p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-[#F9F9FB] px-3 py-2">
          {/* v344: on the Closed tab the amount is the creator's own quote (proposed_amount), not the campaign budget */}
          <div className="text-[10px] font-bold tracking-wider text-[#8E8E93] uppercase">{closed ? "Your quote" : "Per creator"}</div>
          <div className="text-[14px] font-bold text-[#0A0A0A]">{budgetText(c)}</div>
        </div>
        <div className="rounded-xl bg-[#F9F9FB] px-3 py-2 min-w-0">
          <div className="text-[10px] font-bold tracking-wider text-[#8E8E93] uppercase">Deliverable</div>
          <div className="text-[13px] font-semibold text-[#0A0A0A] truncate">{deliverableText(c)}</div>
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-[#F2F2F5] flex items-center justify-between gap-2 text-[11.5px] text-[#6B7280]">
        {c.views != null ? (
          <span className="inline-flex items-center gap-1 font-semibold"><Eye size={12} /> {Number(c.views).toLocaleString("en-IN") /* v332: Indian format */} views</span>
        ) : (
          <span className="inline-flex items-center gap-1 min-w-0 truncate"><MapPin size={12} /> {c.location || "Pan India"}</span>
        )}
        <span className="inline-flex items-center gap-1.5 font-bold text-[#7C3AED]">
          {Array.isArray(c.avatars) && c.avatars.length > 0 && (
            <span className="flex -space-x-1.5">
              {c.avatars.slice(0, 3).map((a, i) => (
                <img key={i} src={a} alt="" onError={(e) => { e.currentTarget.style.display = "none"; } /* v330: hide a broken face */} className="w-4 h-4 rounded-full border border-white bg-gray-100 object-cover" />
              ))}
            </span>
          )}
          {c.applied ? `${c.applied}+ applied` : (applied ? "View application" : "View details")}
          <ChevronRight size={14} />
        </span>
      </div>
    </button>
  );
}

function EmptyState({ title, body, cta, onCta }) {
  return (
    <div className="mt-10 flex flex-col items-center text-center px-8">
      <div className="w-14 h-14 rounded-2xl bg-white border border-[#E5E5EA] flex items-center justify-center">
        <Megaphone size={22} className="text-[#7C3AED]" />
      </div>
      <div className="mt-4 text-[16px] font-bold text-[#0A0A0A]">{title}</div>
      <div className="mt-1 text-[13px] leading-[1.5] text-[#6B7280]">{body}</div>
      {cta && (
        <button onClick={onCta} className="mt-4 h-11 px-5 rounded-xl bg-[#7C3AED] text-white text-[13.5px] font-bold">
          {cta}
        </button>
      )}
    </div>
  );
}

function Chip({ on, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 px-3.5 rounded-full text-[12.5px] font-semibold border ${on ? "bg-[#7C3AED] border-[#7C3AED] text-white" : "bg-white border-[#E5E5EA] text-[#4B5563]"}`}
    >
      {children}
    </button>
  );
}

function FilterSheet({ open, onClose, categories, locations, value, onApply }) {
  const [draft, setDraft] = useState(value);
  React.useEffect(() => { if (open) setDraft(value); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const togglePlat = (p) => setDraft((d) => ({ ...d, platforms: d.platforms.includes(p) ? d.platforms.filter((x) => x !== p) : [...d.platforms, p] }));
  return (
    <Presence>
      {open && (
        <PopupBackdrop key="campfilter" className="fixed inset-0 z-[90] bg-black/40 flex items-end" onClick={onClose}>
          <PopupPanel kind="sheet" onClose={onClose} onClick={(e) => e.stopPropagation()}
            className="w-full bg-white rounded-t-[24px] px-5 pt-5 pb-[calc(20px+env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto"
            style={{ fontFamily: "'DM Sans', sans-serif" }}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#E5E5EA]" />
            <div className="flex items-center justify-between">
              <div className="text-[18px] font-bold text-[#0A0A0A]">Filters</div>
              <button type="button" onClick={() => setDraft({ cat: "All", platforms: [], minBudget: 0, location: "All" })} className="text-[13px] font-semibold text-[#7C3AED]">Clear all</button>
            </div>
            <div className="mt-5 text-[11px] font-bold tracking-wider uppercase text-[#8E8E93]">Niche</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {["All", ...categories].map((x) => <Chip key={x} on={draft.cat === x} onClick={() => set("cat", x)}>{x}</Chip>)}
            </div>
            <div className="mt-5 text-[11px] font-bold tracking-wider uppercase text-[#8E8E93]">Platform</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {PLATFORMS.map((p) => <Chip key={p} on={draft.platforms.includes(p)} onClick={() => togglePlat(p)}><span className="inline-flex items-center gap-1.5"><SocialLogo platform={p} size={14} />{p}</span></Chip>)}{/* v364: real logos */}
            </div>
            <div className="mt-5 text-[11px] font-bold tracking-wider uppercase text-[#8E8E93]">Budget per creator</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {BUDGETS.map(([v, l]) => <Chip key={v} on={draft.minBudget === v} onClick={() => set("minBudget", v)}>{l}</Chip>)}
            </div>
            {locations.length > 0 && (
              <>
                <div className="mt-5 text-[11px] font-bold tracking-wider uppercase text-[#8E8E93]">Location</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["All", ...locations].map((x) => <Chip key={x} on={draft.location === x} onClick={() => set("location", x)}>{x}</Chip>)}
                </div>
              </>
            )}
            <div className="mt-6 flex gap-2.5">
              <button type="button" onClick={onClose} className="flex-1 h-12 rounded-[14px] border border-[#E5E5EA] text-[14px] font-bold text-[#374151]">Cancel</button>
              <button type="button" onClick={() => { onApply(draft); onClose(); }} className="flex-1 h-12 rounded-[14px] bg-[#7C3AED] text-white text-[14px] font-bold">Show campaigns</button>
            </div>
          </PopupPanel>
        </PopupBackdrop>
      )}
    </Presence>
  );
}

const platKey = (p) => String(p || "").toLowerCase().replace("twitter", "x").replace(/\s+/g, "");

export default function CampaignsListMobile({ campaigns = [], myApplications = [], loading = false, error = false, onRetry, categories = [], onOpen, onRefresh, me = null }) {
  const [tab, setTab] = useState("live");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState({ cat: "All", platforms: [], minBudget: 0, location: "All" });
  const [showFilters, setShowFilters] = useState(false);

  const appliedIds = useMemo(
    () => new Set((myApplications || []).map((a) => String(a.campaign_id || a.id))),
    [myApplications]
  );
  const locations = useMemo(
    () => [...new Set((campaigns || []).map((c) => c.location).filter((l) => l && l !== "Pan India"))].slice(0, 12),
    [campaigns]
  );
  const activeFilterCount = (filters.cat !== "All" ? 1 : 0) + (filters.platforms.length ? 1 : 0) + (filters.minBudget ? 1 : 0) + (filters.location !== "All" ? 1 : 0);

  const live = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (campaigns || []).filter((c) => {
      if (filters.cat !== "All" && !(c.categories || []).some((x) => String(x).toLowerCase() === filters.cat.toLowerCase())) return false;
      if (filters.platforms.length && !(c.platforms || []).some((p) => filters.platforms.map(platKey).includes(platKey(p)))) return false;
      if (filters.minBudget && Math.max(Number(c.budget_max || 0), Number(c.budget_min || 0)) < filters.minBudget) return false;
      if (filters.location !== "All" && c.location !== filters.location) return false;
      if (!needle) return true;
      return [c.title, c.brand_name, ...(c.categories || []), String(c.budget_min || ""), String(c.budget_max || "")]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [campaigns, q, filters]);

  const liveIds = useMemo(() => new Set((campaigns || []).map((c) => String(c.id))), [campaigns]);
  const closed = useMemo(
    () => (myApplications || [])
      .filter((a) => a.campaign_id && !liveIds.has(String(a.campaign_id)))
      .map((a) => ({
        id: a.campaign_id,
        title: a.campaign_title || a.title || "Campaign",
        brand_name: a.brand_name || "Brand",
        brand_logo: a.brand_logo,
        budget_min: a.proposed_amount,
        budget_max: a.proposed_amount,
        deliverables: a.deliverables || [],
        location: a.location,
      })),
    [myApplications, liveIds]
  );

  const matchFor = (c) => {
    if (!me) return null;
    // v344: with only one part known (usually just the category) the score is always 100 — a fake match.
    // Show a % only when 2+ parts could be compared (same rule as CreatorHomeMobile).
    try { const m = computeCreatorMatch({ creator: me, campaigns: [c] }); return m && Array.isArray(m.parts) && m.parts.length >= 2 ? m.score : null; } catch { return null; }
  };

  const list = tab === "live" ? live : closed;
  const clearAll = () => { setQ(""); setFilters({ cat: "All", platforms: [], minBudget: 0, location: "All" }); };

  const body = (
    <div className="bg-[#F2F2F7] pb-3" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="bg-white px-4 pt-4 pb-3 border-b border-[#E5E5EA]">
        <div className="flex items-center justify-between gap-2"><div className="text-[24px] font-bold tracking-[-.6px] text-[#0A0A0A]">Campaigns</div><HiwSectionHelp section="campaigns" role="creator" /></div>
        <div className="text-[12.5px] text-[#6B7280]">Verified brands · transparent rates</div>

        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8E8E93]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search niche, brand or budget"
              className="w-full h-11 rounded-[14px] bg-[#F2F2F7] pl-10 pr-9 text-[16px] outline-none placeholder:text-[#8E8E93]" /* v332: 16px stops iOS zoom */
            />
            {q && (
              <button onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1">
                <X size={15} className="text-[#8E8E93]" />
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label="Filters"
            onClick={() => setShowFilters(true)}
            className={`relative w-11 h-11 shrink-0 rounded-[14px] flex items-center justify-center ${activeFilterCount ? "bg-[#7C3AED] text-white" : "bg-[#0A0A0A] text-white"}`}
          >
            <SlidersHorizontal size={17} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-[#7C3AED] text-[10.5px] font-bold border border-[#7C3AED] flex items-center justify-center">{activeFilterCount}</span>
            )}
          </button>
        </div>

        <div className="mt-3 flex gap-1 p-1 rounded-[13px] bg-[#F2F2F7]">
          {[["live", loading ? "Live" : `Live · ${campaigns.length}` /* v332: no "Live · 0" flash while loading */], ["closed", "Closed"]].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 h-9 rounded-[10px] text-[13px] font-bold ${tab === id ? "bg-white text-[#7C3AED] shadow-sm" : "text-[#6B7280]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-[20px] border border-[#E5E5EA] p-4">
              <div className="flex gap-3"><Shimmer className="w-10 h-10 !rounded-xl" /><div className="flex-1 space-y-2"><Shimmer className="h-4 w-4/5" /><Shimmer className="h-3 w-1/3" /></div></div>
              <Shimmer className="mt-3 h-3 w-full" /><Shimmer className="mt-2 h-3 w-2/3" />
              <div className="mt-3 grid grid-cols-2 gap-2"><Shimmer className="h-12" /><Shimmer className="h-12" /></div>
            </div>
          ))
        ) : list.length === 0 ? (
          tab === "live" ? (
            error && campaigns.length === 0 ? (
              /* v330: a failed load is not "no campaigns" */
              <OfflineAware onRetry={onRetry}>{/* v334: offline → OfflineState */}
                <EmptyState title="Couldn't load campaigns" body="Check your connection and try again." cta={onRetry ? "Try again" : null} onCta={onRetry} />
              </OfflineAware>
            ) : q || activeFilterCount ? (
              <EmptyState title="No matching campaigns" body="Try another niche, brand or budget." cta="Clear filters" onCta={clearAll} />
            ) : (
              <EmptyState title="No live campaigns right now" body="New campaigns from verified brands show up here. Meanwhile, try Instant UGC briefs." />
            )
          ) : (
            <EmptyState title="No closed campaigns yet" body="Campaigns you applied to appear here once the brand stops accepting." cta="See live campaigns" onCta={() => setTab("live")} />
          )
        ) : (
          list.map((c) => {
            const isApplied = appliedIds.has(String(c.id)) || c.has_applied;
            return <CampaignCard key={c.id} c={c} applied={isApplied} closed={tab === "closed"} match={tab === "live" && !isApplied ? matchFor(c) : null} onOpen={onOpen} />;
          })
        )}
      </div>

      <FilterSheet open={showFilters} onClose={() => setShowFilters(false)} categories={categories.filter((x) => x && x !== "All").slice(0, 16)} locations={locations} value={filters} onApply={setFilters} />
    </div>
  );

  if (typeof onRefresh !== "function") return body;
  return (
    <PullToRefresh onRefresh={onRefresh} pullingText="Pull down to refresh" releaseText="Release to refresh" refreshingText="Refreshing campaigns…" successText="Up to date">
      {body}
    </PullToRefresh>
  );
}
