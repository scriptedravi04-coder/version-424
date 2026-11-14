import { deliverablesLabel } from "../../utils/safeFormat"; // v415
import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Building, MapPin, Globe, CheckCircle, Briefcase, ExternalLink, Edit2, Share2, ArrowLeft, ChevronRight, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import ReportUserLink from "../../components/safety/ReportUserLink"; // v334: App Store 1.2 report a profile
import BlockUserButton from "../../components/safety/BlockUserButton"; // v337: block a user
import useIsMobile from "../../hooks/useIsMobile";
import AgencyBadge from "../../components/common/AgencyBadge";

// v332: drafts / finished campaigns were listed with an "Open" badge on the public page.
// v358: + not yet approved / paused — "Open" campaigns still in review linked creators to a 404
const NOT_OPEN = ["draft", "closed", "completed", "cancelled", "canceled", "rejected", "expired", "under_review", "pending_review", "pending", "in_review", "paused"];
// v415: a request that never answers (blocked / stalled network) used to leave "Loading brand profile…" forever.
export const BRAND_LOAD_TIMEOUT_MS = 15000;
export function withTimeout(promise, ms = BRAND_LOAD_TIMEOUT_MS) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, reject) => { t = setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), ms); }),
  ]).finally(() => clearTimeout(t));
}
/** v415: this brand's open campaigns from the public campaigns list (no direct database read). Pure. */
export function openCampaignsFor(list, brandUserId) {
  if (!brandUserId) return [];
  return (Array.isArray(list) ? list : []).filter((c) => String(c?.brand_user_id || "") === String(brandUserId)
    && !c.closed_at && !NOT_OPEN.includes(String(c.status || "").toLowerCase()));
}
const deliverablesText = (d) => deliverablesLabel(d); // v415: objects showed "[object Object]"

export default function BrandPublicView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [profile, setProfile] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [campsFailed, setCampsFailed] = useState(false); // v358: a failed read is not "0 campaigns"
  const [campsLoading, setCampsLoading] = useState(true); // v415: the profile shows first, campaigns fill in
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false); // v330: network failure ≠ "Brand not found"
  const [reloadKey, setReloadKey] = useState(0);
  const [logoBroken, setLogoBroken] = useState(false); // v330: dead logo URL → initials

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);
    setLoadError(false);
    setCampsFailed(false); // v415: a retry starts clean
    setCampsLoading(true);

    async function fetchBrand() {
      if (!id) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      try {
        let bData = null;

        // 1. Try API /brands/:id
        let reqErr = null;
        const res = await withTimeout(api.get(`brands/${id}`)).catch((e) => { reqErr = e; return null; }); // v415: never spins forever
        if (res?.data && !res.data.error) {
          bData = res.data;
        }

        if (!active) return;

        if (bData) {
          setProfile(bData);
          setLoading(false); // v415: show the profile now; campaigns load below it

          // v415: open campaigns through the server's public list — the old direct Supabase read is blocked
          // for browsers (and could hang), and the name match listed other brands' campaigns.
          const targetUserId = bData.user_id || bData.id;
          const campsRes = await withTimeout(api.get("campaigns")).catch(() => null);
          if (!active) return;
          if (!campsRes || !Array.isArray(campsRes.data)) setCampsFailed(true);
          else setCampaigns(openCampaignsFor(campsRes.data, targetUserId));
          setCampsLoading(false);
        } else if (reqErr && reqErr?.response?.status !== 404) {
          setLoadError(true); // v330
        } else {
          setNotFound(true);
        }
      } catch (err) {
        console.error("Error fetching public brand:", err);
        if (active) setLoadError(true); // v332: an unexpected failure is "Couldn't load", not "Brand not found"
      } finally {
        if (active) { setLoading(false); setCampsLoading(false); }
      }
    }

    fetchBrand();

    return () => {
      active = false;
    };
  }, [id, reloadKey]);

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: profile?.company_name || "Brand Profile",
          text: `Check out ${profile?.company_name || "this brand"} on Ybex`,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Profile link copied!");
    } catch (e) {
      if (e?.name !== "AbortError") toast.error("Could not share the link.");
    }
  };

  const isOwner = Boolean(
    user && (user.user_id === profile?.user_id || user.id === profile?.user_id)
  );

  if (loading) {
    return (
      // v415: on a phone the loading screen is a full screen tall (like the loaded page), so the footer starts
      // below the fold and doesn't jump down when the profile arrives (mobile CLS 0.19).
      <div className={`${isMobile ? "min-h-screen min-h-[100dvh]" : "min-h-[60vh]"} flex flex-col items-center justify-center py-12 px-4`} data-testid="brand-public-loading">
        <div className="w-12 h-12 rounded-2xl bg-[#EDE9FE] flex items-center justify-center animate-pulse">
          <Building className="text-[#7C3AED] w-6 h-6" />
        </div>
        <p className="text-sm font-semibold text-slate-500 mt-4">Loading brand profile…</p>
      </div>
    );
  }

  if (loadError && !profile) {
    // v330: offline / server error — offer a retry instead of claiming the brand doesn't exist.
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
          <Building className="text-slate-500 w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mt-4">Couldn't load this brand</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">Check your connection and try again.</p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="mt-6 px-5 py-2.5 rounded-xl bg-[#7C3AED] text-white font-bold text-sm hover:bg-[#6D28D9] transition cursor-pointer"
        >
          Try again
        </button>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
          <Building className="text-slate-500 w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mt-4">Brand not found</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">
          The brand profile you're looking for doesn't exist or has been removed.
        </p>
        <Link
          to="/explore"
          className="mt-6 px-5 py-2.5 rounded-xl bg-[#7C3AED] text-white font-bold text-sm hover:bg-[#6D28D9] transition"
        >
          Explore creators & brands
        </Link>
      </div>
    );
  }

  const brandName = profile.company_name || "Brand Partner";
  const brandInitials = brandName.charAt(0).toUpperCase();
  const isVerified = Boolean(profile.verified);
  const location = [profile.city, profile.state].filter(Boolean).join(", ") || profile.location || ""; // v332: no made-up "India"
  const metaLine = [profile.industry, location].filter(Boolean).join(" · ");
  const description = profile.description ? profile.description.replace(/\[cover_image\]:.*/g, "").trim() : "";

  // Mobile layout
  if (isMobile) {
    return (
      <div className="min-h-screen bg-[#F4F4F8] flex flex-col pb-24">
        {/* Mobile Header Bar */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => ((window.history.state?.idx > 0) ? navigate(-1) : navigate("/dashboard"))}
            aria-label="Back"
            className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800 active:scale-95 transition shrink-0" /* v332: 40px */
          >
            <ArrowLeft size={18} />
          </button>
          <div className="font-bold text-sm text-slate-900 truncate min-w-0 flex-1 text-center px-2 font-display">{/* v332: name uses the free space instead of a fixed 200px */}
            {brandName}
          </div>
          <button
            type="button"
            onClick={handleShare}
            aria-label="Share"
            className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800 active:scale-95 transition shrink-0" /* v332: 40px */
          >
            <Share2 size={16} />
          </button>
        </header>

        {/* Cover + Avatar Header */}
        <div className="relative">
          <div className="h-28 bg-gradient-to-r from-[#2E1A68] via-[#3B1E7E] to-[#582A9C] overflow-hidden">{/* v415 */}
            {profile.cover_image && (
              <img src={profile.cover_image} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} /* v330 */ />
            )}
          </div>
          <div className="px-5 -mt-8 relative">
            <div className="w-16 h-16 rounded-2xl border-4 border-white bg-white shadow-sm overflow-hidden flex items-center justify-center text-xl font-bold text-slate-900">
              {profile.logo && !logoBroken ? (
                <img src={profile.logo} alt="" className="w-full h-full object-cover" onError={() => setLogoBroken(true)} /* v330 */ />
              ) : (
                <span className="font-black text-xl text-[#7C3AED] font-display">{brandInitials}</span>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 break-words min-w-0">{brandName}</h1>
              {isVerified && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700">
                  <Check size={10} strokeWidth={3} /> Verified
                </span>
              )}
              {profile.is_agency && <AgencyBadge size="sm" />}
            </div>

            {metaLine && <p className="text-xs text-slate-600 mt-1">{metaLine}</p>}

            {profile.website && (
              <a
                href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#7C3AED] mt-1.5 hover:underline break-all max-w-full" /* v330: long URLs wrap */
              >
                <Globe size={12} /> {profile.website.replace(/^https?:\/\//, "")} <ExternalLink size={10} />
              </a>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-5 pt-4 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleShare}
            className="h-11 rounded-xl bg-white border border-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] shadow-2xs"
          >
            <Share2 size={13} /> Share Profile
          </button>
          {isOwner ? (
            <button
              type="button"
              onClick={() => navigate("/brand/settings")}
              className="h-11 rounded-xl bg-[#7C3AED] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] shadow-xs"
            >
              <Edit2 size={13} /> Edit Profile
            </button>
          ) : (
            <Link
              to="/campaigns"
              className="h-11 rounded-xl bg-[#7C3AED] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] shadow-xs"
            >
              <Briefcase size={13} /> View Briefs
            </Link>
          )}
        </div>

        {/* About Section */}
        <div className="px-5 pt-5">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-2 font-display">About us</h3>
            {description ? (
              <p className="text-xs text-slate-600 leading-relaxed">{description}</p>
            ) : (
              <p className="text-xs text-slate-500 italic">No description provided yet.</p>
            )}
          </div>
        </div>

        {/* Active Campaigns */}
        <div className="px-5 pt-4">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-2.5 px-1 font-display">
            Active Campaigns{!campsFailed && !campsLoading && ` (${campaigns.length})`}
          </h3>
          {campsLoading ? (
            <div className="space-y-2.5" aria-busy="true">{[0, 1].map((i) => <div key={i} className="h-[92px] rounded-2xl bg-white border border-slate-200/80 animate-pulse" />)}</div>
          ) : campaigns.length === 0 ? (
            <div className="bg-white rounded-2xl p-5 text-center border border-slate-200/80 shadow-2xs">
              <Briefcase size={24} className="text-slate-300 mx-auto" />
              <p className="text-xs text-slate-500 font-medium mt-2">{campsFailed ? "Couldn't load campaigns right now." : "No active campaigns right now"}</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {campaigns.map((c) => (
                <Link
                  key={c.id || c.campaign_id}
                  to={`/campaigns/${c.id || c.campaign_id}`}
                  className="block bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs hover:border-purple-300 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-bold text-slate-900 leading-snug font-display min-w-0 break-words">{c.title || "Untitled campaign"}</h4>
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 uppercase">
                      Open
                    </span>
                  </div>
                  {c.deliverables && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-1">{deliverablesText(c.deliverables)}</p>
                  )}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="font-bold text-[#7C3AED]">
                      {c.budget_min ? `₹${Number(c.budget_min).toLocaleString("en-IN")}` : "Flexible"}
                      {c.budget_max ? ` – ₹${Number(c.budget_max).toLocaleString("en-IN")}` : ""}
                    </span>
                    <span className="text-slate-500 font-medium flex items-center gap-0.5">
                      View brief <ChevronRight size={13} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
        {/* v334: App Store 1.2 — a way to report a profile (existing POST /reports) */}
        <div className="flex justify-center px-4 pt-2">{!isOwner && <div className="flex items-center gap-4"><ReportUserLink targetId={profile.user_id} kind="brand" name={brandName} /><BlockUserButton targetId={profile.user_id} name={brandName} /></div>}</div>
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="w-full max-w-5xl mx-auto py-6 px-4 md:px-8 space-y-6">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => ((window.history.state?.idx > 0) ? navigate(-1) : navigate("/dashboard"))}
          className="inline-flex items-center gap-2 min-h-[40px] text-xs font-bold text-slate-600 hover:text-slate-900 transition cursor-pointer"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
        >
          <Share2 size={13} /> Share Profile
        </button>
      </div>

      {/* Hero Cover Card */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="h-44 md:h-56 bg-gradient-to-r from-[#2E1A68] via-[#3B1E7E] to-[#582A9C] relative overflow-hidden">{/* v415: brand gradient (same as the owner's profile) instead of a grey block */}
          {profile.cover_image && (
            <img src={profile.cover_image} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} /* v330 */ />
          )}
        </div>
        <div className="px-6 md:px-8 pb-6 pt-0 relative">
          <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 -mt-12 md:-mt-14 mb-4">
            <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl border-4 border-white bg-white shadow-md overflow-hidden flex items-center justify-center">
              {profile.logo && !logoBroken ? (
                <img src={profile.logo} alt="" className="w-full h-full object-contain p-1" onError={() => setLogoBroken(true)} /* v330 */ />
              ) : (
                <span className="font-black text-3xl text-[#7C3AED] font-display">{brandInitials}</span>
              )}
            </div>
            {isOwner && (
              <Link
                to="/brand/settings"
                className="px-4 py-2 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-xs flex items-center gap-2 transition"
              >
                <Edit2 size={13} /> Edit Company Info
              </Link>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 font-display">{brandName}</h1>
            {isVerified && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700">
                <CheckCircle size={13} /> Verified Brand
              </span>
            )}
            {profile.is_agency && <AgencyBadge size="md" />}
          </div>

          <p className="text-sm text-slate-600 font-medium mt-1 flex items-center gap-2 flex-wrap">
            {profile.industry && <span>{profile.industry}</span>}
            {location && (
              <>
                <span className="text-slate-300">•</span>
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <MapPin size={13} /> {location}
                </span>
              </>
            )}
            {profile.team_size && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500">{profile.team_size}</span>{/* v332: was "11-50 Employees team" */}
              </>
            )}
          </p>

          {profile.website && (
            <div className="mt-2.5">
              <a
                href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold text-[#7C3AED] hover:underline break-all max-w-full" /* v332: long URLs wrap */
              >
                <Globe size={13} /> {profile.website} <ExternalLink size={11} />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: About */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-3">
            <h2 className="text-base font-black text-slate-900 font-display">About the Brand</h2>
            {description ? (
              <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
            ) : (
              <p className="text-sm text-slate-500 italic">No description provided yet.</p>
            )}
          </div>

          {/* Active Campaigns */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black text-slate-900 font-display">
                Open Campaigns{!campsFailed && !campsLoading && ` (${campaigns.length})`}{/* v415: same name as the phone page */}
              </h2>
            </div>
            {campsLoading ? (
              <div className="space-y-3" aria-busy="true">{[0, 1].map((i) => <div key={i} className="h-14 rounded-2xl bg-slate-100 animate-pulse" />)}</div>
            ) : campaigns.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">
                {campsFailed ? "Couldn't load campaigns right now." : "No open campaigns right now."}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {campaigns.map((c) => (
                  <Link
                    key={c.id || c.campaign_id}
                    to={`/campaigns/${c.id || c.campaign_id}`}
                    className="py-4 block hover:bg-slate-50/70 -mx-3 px-3 rounded-2xl transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 text-sm font-display break-words">{c.title || "Untitled campaign"}</h3>
                        {c.deliverables && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-1">{deliverablesText(c.deliverables)}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs font-bold text-[#7C3AED]">
                        {c.budget_min ? `₹${Number(c.budget_min).toLocaleString("en-IN")}` : "Flexible"}
                        {c.budget_max ? ` – ₹${Number(c.budget_max).toLocaleString("en-IN")}` : ""}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Fast Overview */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">Company Highlights</h3>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Verification</span>
                <span className={`font-bold ${isVerified ? "text-emerald-600" : "text-amber-600"}`}>
                  {isVerified ? "Verified brand" : "Verification pending"}{/* v415: same words as /brand/kyc */}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Creator payments</span>
                <span className="font-bold text-emerald-600">Held in escrow by Ybex</span>{/* v415: was "Secure Payment Hold Security" */}
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-500">Open campaigns</span>
                <span className="font-bold text-slate-900">{campsLoading || campsFailed ? "—" : `${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}`}</span>{/* v332 */}
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* v334: App Store 1.2 — a way to report a profile (existing POST /reports) */}
      <div className="flex justify-center">{!isOwner && <div className="flex items-center gap-4"><ReportUserLink targetId={profile.user_id} kind="brand" name={brandName} /><BlockUserButton targetId={profile.user_id} name={brandName} /></div>}</div>
    </div>
  );
}
