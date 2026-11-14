import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Building, MapPin, Globe, CheckCircle, ShieldCheck, Briefcase, Plus, ExternalLink, Edit2, Camera, Share2 } from "lucide-react";
import AgencyBadge from "../../components/common/AgencyBadge";
import useIsMobile from "../../hooks/useIsMobile";
import BrandProfileMobile from "../../components/profile/mobile/BrandProfileMobile";
import { publicOrigin } from "../../lib/publicUrl";
import { checkHttpUrl } from "../../utils/httpUrl";
import { initialsAvatarUrl } from "../../utils/initials"; // v423 (S11): no third-party avatar service

export default function BrandProfile() {
  const { user } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadBrandProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      let data = null;
      /* Session 58: profiles are read through the server now (the database no longer lets the browser read them) */
      if (!data) {
        const res = await api.get("brands/me").catch(() => null);
        if (res?.data) data = res.data;
      }

      if (data) {
        setProfileData(data);
      } else {
        // v330: the fallback used to be a made-up company ("Global Brand Inc.", globalbrand.com, New Delhi)
        // marked verified — the brand saw a fake APPROVED profile whenever the load failed.
        // v358: no stand-in row — the mobile hub loads itself and knows the load failed (a Save on the empty
        // stand-in used to wipe the real industry / description / preferences).
        if (isMobile) setProfileData(null);
        else setProfileData({
          company_name: user.company_name || user.name || "",
          verified: false
        });
      }

      // v344: the brand's own campaigns through the server (like the other brand screens) — the
      // browser read Supabase directly by brand_user_id (bypassed the server's owner / agency logic).
      const campsRes = await api.get("campaigns?mine=true").catch(() => null);
      if (Array.isArray(campsRes?.data)) setCampaigns(campsRes.data);
    } catch (e) {
      console.error("Error loading brand profile:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBrandProfile();
  }, [user]);

  const isMobile = useIsMobile();

  if (isMobile) {
    return <BrandProfileMobile brandData={profileData} parentLoading={loading} campaigns={campaigns} />;
  }

  if (loading) {
    return (
      // v415: skeleton has the same boxes as the page (cover + logo, header row, two columns) so nothing jumps
      // when the data arrives (desktop CLS was 0.29).
      <div className="w-full max-w-none pb-8 relative animate-pulse" aria-busy="true" data-testid="brand-profile-skeleton">
        {/* v415: same first child as the page (the soft glow) so React keeps every box in the same place */}
        <div aria-hidden="true" className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-[var(--violet)]/5 rounded-full blur-[140px] pointer-events-none z-0 overflow-hidden" />
        <div className="h-4 w-80 max-w-full bg-slate-100 rounded mb-3" />
        <div className="relative mb-14 sm:mb-16">
          <div className="rounded-3xl h-48 md:h-64 bg-slate-200/70 border border-[var(--border-default)]" />
          <div className="absolute -bottom-10 left-4 sm:left-6 md:left-10 w-24 h-24 md:w-32 md:h-32 rounded-3xl border-4 border-white bg-slate-100 shadow-md" />
        </div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 px-2 sm:px-4 md:px-6 mb-8 sm:mb-10">
          <div>{/* v415: title (40px) + 6px gap + industry line (24px) = the real header height */}
            <div className="h-10 w-72 bg-slate-200/70 rounded-lg" />
            <div className="h-6 w-48 mt-1.5 bg-slate-100 rounded-lg" />
          </div>
          <div className="flex gap-3"><div className="h-10 w-32 bg-slate-100 rounded-xl" /><div className="h-10 w-40 bg-slate-100 rounded-xl" /><div className="h-10 w-44 bg-slate-200/70 rounded-xl" /></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 px-0 md:px-4">
          <div className="lg:col-span-4 space-y-6"><div className="h-40 bg-white border border-slate-100 rounded-3xl" /><div className="h-48 bg-white border border-slate-100 rounded-3xl" /></div>
          <div className="lg:col-span-8"><div className="h-[420px] bg-white border border-slate-100 rounded-3xl" /></div>
        </div>
      </div>
    );
  }

  const isVerified = Boolean(profileData?.verified); // Session 58: user.verified = email, not the KYC badge

  return (
    <div className="w-full max-w-none pb-8 relative" data-testid="brand-profile-page">
      <div aria-hidden="true" className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-[var(--violet)]/5 rounded-full blur-[140px] pointer-events-none z-0 overflow-hidden" />{/* v415 */}

      {/* v415: say what this page is — Settings → Company details is where you edit, this is the public view */}
      <p className="relative z-10 text-xs font-semibold text-slate-500 mb-3 h-4 leading-4">
        Public profile — this is how creators see your brand. <Link to="/brand/settings" className="text-[var(--violet)] hover:underline">Edit in Settings</Link>
      </p>

      {/* Cover Banner Wrapper */}
      <div className="relative mb-14 sm:mb-16">
        <div className="relative rounded-3xl overflow-hidden bg-slate-100 h-48 md:h-64 border border-[var(--border-default)] shadow-lg">
          {/* v332: no stock office-building photo as "your" cover — a plain brand gradient until a cover is uploaded */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#2E1A68] via-[#3B1E7E] to-[#582A9C]" />
          {profileData?.cover_image && (
            <img 
              src={profileData.cover_image} 
              className="absolute inset-0 w-full h-full object-cover" /* v415: absolute — the cover can't push anything */
              alt="Brand Banner"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-transparent"></div>
          <Link 
            to="/brand/settings" 
            className="absolute top-4 right-4 bg-white/90 backdrop-blur-md text-slate-800 text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 hover:bg-white transition-all border border-slate-200 shadow-sm"
          >
            <Camera size={14}/> Change cover
          </Link>
        </div>
        
        {/* Profile Picture */}
        <div className="absolute -bottom-10 left-4 sm:left-6 md:left-10 flex items-end gap-5 z-10">
          <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl border-4 border-white bg-white overflow-hidden relative shadow-md flex items-center justify-center p-1.5">
            {profileData?.logo ? (
              <img 
                src={profileData.logo} 
                alt="Brand Logo" 
                className="w-full h-full object-contain rounded-2xl"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = initialsAvatarUrl(encodeURIComponent(profileData?.company_name || 'Brand'), "6366f1");
                }}
              />
            ) : (
              <Building className="text-slate-300 w-12 h-12" />
            )}
          </div>
        </div>
      </div>

      {/* Brand Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 px-2 sm:px-4 md:px-6 mb-8 sm:mb-10 relative z-10">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
 {profileData?.company_name || user?.company_name || user?.name || "Your brand" /* v330 */} 
              {isVerified && <CheckCircle className="text-[var(--violet)] fill-[var(--violet)]/10" size={24} />}
            </h1>
            {(profileData?.is_agency || user?.is_agency) && (
              <AgencyBadge size="md" />
            )}
          </div>
          {/* v330: only real values — no invented "Fashion & Retail · New Delhi, IN" */}
          <p className="text-slate-600 font-semibold mt-1.5 flex items-center gap-2 flex-wrap">
            {profileData?.industry || "Industry not set"}
            {(profileData?.city || profileData?.state) && (<>
            <span className="text-slate-300">|</span> 
            <MapPin size={15} className="text-slate-500" /> {[profileData?.city, profileData?.state].filter(Boolean).join(", ")}
            </>)}
            {(profileData?.is_agency || user?.is_agency) && (
              <>
                <span className="text-slate-300">|</span>
                <span className="text-[#7C3AED] font-bold">Marketing Agency</span>
              </>
            )}
          </p>
          {profileData?.website && checkHttpUrl(profileData.website).ok && (
            <a 
              href={checkHttpUrl(profileData.website).url /* v346: only http(s) links, never "javascript:" */}
              target="_blank" 
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-bold text-[var(--violet)] hover:underline mt-3 break-all max-w-full"
            >{/* v330: long URLs wrap */}
              <Globe size={13} /> {profileData.website} <ExternalLink size={10} />
            </a>
          )}
        </div>

        <div className="flex gap-3 w-full md:w-auto flex-wrap">
          <button 
            onClick={async () => {
              const brandId = profileData?.user_id || profileData?.id || user?.user_id;
              const publicUrl = brandId ? `${publicOrigin()}/brand/${brandId}` : window.location.href;
              try {
                if (navigator.share) {
                  await navigator.share({
                    title: profileData?.company_name || "Brand Profile",
                    url: publicUrl,
                  });
                  return;
                }
                await navigator.clipboard.writeText(publicUrl);
                toast.success("Public profile link copied");
              } catch (e) {
                if (e?.name !== "AbortError") toast.error("Could not copy link");
              }
            }}
            className="flex-1 md:flex-initial text-center bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-4 py-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Share2 size={14} /> Share Profile
          </button>
          <Link 
            to="/brand/settings" 
            className="flex-1 md:flex-initial text-center bg-white border border-slate-200 text-slate-800 text-xs font-bold px-5 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
          >
            <Edit2 size={14} /> Edit company details
          </Link>
          <Link 
            to={isVerified ? "/brand/settings?section=kyc" : "/brand/kyc"} /* v332 · v415: not verified yet → straight to the verification form */
            className="flex-1 md:flex-initial text-center bg-[var(--violet)] hover:bg-[#6c48d4] text-white text-xs font-bold px-5 py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md"
          >
            <ShieldCheck size={14} /> {isVerified ? "Verified brand" : "Verify your brand"}{/* v415: same words as /brand/kyc */}
          </Link>
        </div>
      </div>

      {/* Main Body */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10 px-0 md:px-4">
        
        {/* Left Column: Sidebar-ish information (About & Metrics) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-slate-100 rounded-3xl p-6 md:p-8 shadow-sm">
            <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500 mb-3">About Us</h3>
            <p className="text-slate-600 text-sm leading-relaxed font-medium">
              {profileData?.description 
                ? profileData.description.replace(/\[cover_image\]:.*/g, '').trim()
                : "No description yet. Add one in Settings → Company details so creators can learn about your brand."}
            </p>
          </div>

          <div className="bg-white border border-[var(--violet)]/10 rounded-3xl p-6 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--violet)]/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
            <span className="text-[11px] uppercase font-extrabold tracking-widest text-[var(--violet)] block mb-1">Overview</span>
            <div className="mt-4 space-y-4 text-xs font-bold relative z-10">
              <div className="flex justify-between border-b border-slate-100 pb-3 items-center">
                <span className="text-slate-500">Industry Category</span>
                <span className="text-slate-800 text-right break-words min-w-0">{profileData?.industry || "—" /* v330 */}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-3 items-center">
                <span className="text-slate-500">Campaigns Launched</span>
                <span className="text-slate-800">{campaigns.length}</span>{/* v332: the list holds all your campaigns, not only active ones */}
              </div>
              <div className="flex justify-between pb-1 items-center">
                <span className="text-slate-500">Brand verification</span>
                <span className={isVerified ? "text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md text-[11px]" : "text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md text-[11px]"}>
                  {isVerified ? "Verified" : "Verification pending"}{/* v415: no shouty APPROVED / PENDING codes */}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Active Collabs / Campaigns */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white border border-slate-100 rounded-3xl p-6 md:p-8 shadow-sm h-full">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
              <h3 className="text-lg font-extrabold text-slate-900 font-display">Your campaigns</h3>{/* v415: the list holds all your campaigns */}
              <Link 
                to="/brand/campaigns/create" 
                className="px-4 py-2.5 bg-[var(--violet)] hover:bg-[#6c48d4] text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0"
              >
                <Plus size={14} /> Launch Campaign
              </Link>
            </div>

            {campaigns.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-sm border-2 border-dashed border-slate-100 rounded-2xl p-6 flex flex-col items-center justify-center h-48">
                <Briefcase className="mb-4 text-slate-300" size={40} />
                <span className="font-bold text-slate-600 text-base">No campaigns yet</span>
                <span className="mt-1 font-medium">Launch a campaign to start working with creators.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {campaigns?.map((camp) => (
                  <Link key={camp.campaign_id} to={`/campaigns/${camp.campaign_id}`} className="group p-5 border border-slate-200/80 rounded-2xl hover:border-[var(--violet)]/50 hover:shadow-md transition-all flex flex-col justify-between items-start gap-4 bg-white cursor-pointer relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--violet)]/[0.02] rounded-bl-full pointer-events-none group-hover:bg-[var(--violet)]/[0.04] transition-colors"></div>
                    <div className="w-full relative z-10">
                      <div className="flex justify-between items-start w-full mb-3">
                         <span className="text-[11px] font-extrabold text-[var(--violet)] bg-[var(--violet)]/10 px-2.5 py-1 rounded-md uppercase tracking-wider block">{camp.platforms?.join(" & ") || "Multi-Platform"}</span>
                      </div>
                      <h4 className="font-extrabold text-slate-800 text-base mb-1.5 group-hover:text-[var(--violet)] transition-colors break-words">{camp.title || "Untitled campaign"}</h4>{/* v332 */}
                      <p className="text-xs text-slate-500 line-clamp-2 mb-5 font-medium leading-relaxed">{camp.description}</p>
                      
                      <div className="flex flex-col gap-2.5 text-xs text-slate-500 font-bold bg-slate-50/80 p-3.5 rounded-xl border border-slate-100 w-full">
                        <div className="flex justify-between items-center">
                          <span>Budget:</span>
                          {/* v330: was "₹undefined - ₹undefined" when a range was missing */}
                          <strong className="text-slate-800">{Number(camp.budget_max) > Number(camp.budget_min || 0) ? `₹${Number(camp.budget_min || 0).toLocaleString('en-IN')} - ₹${Number(camp.budget_max).toLocaleString('en-IN')}` : Number(camp.budget_min || camp.budget) > 0 ? `₹${Number(camp.budget_min || camp.budget).toLocaleString('en-IN')}` : "—"}</strong>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Deadline:</span>
                          {/* v330: raw ISO date → "16 Oct 2026" (IST) */}
                          <strong className="text-slate-800">{camp.deadline && !Number.isNaN(new Date(camp.deadline).getTime()) ? new Date(camp.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "Flexible"}</strong>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
