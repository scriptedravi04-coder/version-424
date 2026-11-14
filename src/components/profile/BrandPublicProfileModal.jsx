import React, { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Building, MapPin, Globe, CheckCircle, ShieldCheck, Briefcase, ExternalLink, X, Video, ArrowRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { api } from "../../lib/api";
import { useNavigate } from "react-router-dom";
import AgencyBadge from "../common/AgencyBadge";

import { PopupBackdrop, PopupPanel } from "../common/Popup";
import { initialsAvatarUrl } from "../../utils/initials"; // v423 (S11): no third-party avatar service
export default function BrandPublicProfileModal({ isOpen, onClose, brandUserId, brandName, brandLogo }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);

    async function fetchBrandData() {
      try {
        let bData = null;

        // 1. Fetch from Supabase brand_profiles by user_id if provided
        /* Session 58: profiles are read through the server now (the database no longer lets the browser read them) */
        if (!brandUserId && brandName) {
          const res = await api.get(`brands/${encodeURIComponent(brandName)}`).catch(() => null);
          if (res?.data) bData = res.data;
        }

        // 3. Fallback to API call if available
        if (!bData && brandUserId) {
          const res = await api.get(`/brands/${brandUserId}`).catch(() => null);
          if (res?.data) bData = res.data;
        }

        if (isMounted) {
          if (bData) {
            setProfile(bData);
          } else {
            // Session 31 (Ravi): profile not found → show only what we know (name, logo). No invented
            // city, industry, description, stock cover or "verified" badge.
            setProfile({
              company_name: brandName || "Brand",
              industry: "",
              website: "",
              description: "",
              city: "",
              state: "",
              logo: brandLogo || "",
              cover_image: "",
              verified: false
            });
          }
        }

        // Fetch campaigns by this brand
        const targetUserId = bData?.user_id || brandUserId;
        if (supabase && targetUserId) {
          const { data: camps } = await supabase.from('campaigns').select('*').eq('brand_user_id', targetUserId);
          if (camps && isMounted) setCampaigns(camps);
        } else {
          const campsRes = await api.get(`/campaigns`).catch(() => null);
          if (campsRes?.data && isMounted) {
            const list = Array.isArray(campsRes.data) ? campsRes.data : [];
            const filtered = list.filter(c => c.brand_user_id === targetUserId || (brandName && c.brand_name?.toLowerCase().includes(brandName.toLowerCase())));
            setCampaigns(filtered);
          }
        }

      } catch (err) {
        console.error("Error fetching brand public profile:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchBrandData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, brandUserId, brandName, brandLogo]);

  if (!isOpen) return null;

  const displayLogo = profile?.logo || brandLogo || initialsAvatarUrl(encodeURIComponent(profile?.company_name || brandName || 'Brand'), "6366f1");
  // v332: "Verified" badges / tick / "KYC Approved" showed for every brand, even unverified or unknown ones.
  const isVerifiedBrand = Boolean(profile?.verified || profile?.is_verified || profile?.kyc_verified || String(profile?.kyc_status || "").toLowerCase() === "approved");
  // Session 31: no stock cover photo — a brand without a cover gets the plain grey header.
  const displayCover = profile?.cover_image || "";

  return (
    <AnimatePresence>
      <PopupBackdrop className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md overflow-y-auto">
        <PopupPanel kind="modal"
          className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 my-8 max-h-[90vh] flex flex-col"
        >
          {/* Close Button */}
          <button aria-label="Close" /* v330: icon-only button */
            onClick={onClose}
            className="absolute top-4 right-4 z-20 w-10 h-10 bg-black/40 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-all backdrop-blur-sm"
          >
            <X size={18} />
          </button>

          {/* Banner Header */}
          <div className="relative h-40 md:h-48 w-full bg-slate-100 shrink-0">
            {displayCover && <img
              src={displayCover}
              alt="Brand Banner"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.style.display = "none";
              }}
            />}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
          </div>

          {/* Profile Header Content */}
          <div className="relative px-6 md:px-8 pb-4 shrink-0">
            {(() => {
              const isAgency = Boolean(profile?.is_agency || profile?.isAgency);

              return (
                <div className="flex items-end justify-between -mt-12 md:-mt-14 mb-4">
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl border-4 border-white bg-white overflow-hidden shadow-lg flex items-center justify-center p-1 relative z-10">
                    <img
                      src={displayLogo}
                      alt={profile?.company_name || brandName}
                      className="w-full h-full object-contain rounded-xl"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = initialsAvatarUrl(encodeURIComponent(profile?.company_name || brandName || 'Brand'), "6366f1");
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {isAgency ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[#F5F0FF] text-[#6D28D9] border border-[#DDD6FE] shadow-xs">
                        <Briefcase size={14} className="text-[#7C3AED]" /> Marketing Agency
                      </span>
                    ) : isVerifiedBrand ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
                        <ShieldCheck size={14} className="text-emerald-600" /> Verified Brand Partner
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })()}

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  {profile?.company_name || brandName || "Brand Partner"}
                  {isVerifiedBrand && <CheckCircle size={20} className="text-[var(--violet)] fill-[var(--violet)]/10 shrink-0" />}
                </h2>
                {(profile?.is_agency || profile?.isAgency) && (
                  <AgencyBadge size="md" />
                )}
              </div>
              
              <p className="text-xs font-bold text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                {profile?.industry && <span className="text-slate-700 font-semibold">{profile.industry}</span>}
                {profile?.industry && (profile?.city || profile?.state) && <span>•</span>}
                {(profile?.city || profile?.state) && <span className="inline-flex items-center gap-1"><MapPin size={13} className="text-slate-500" /> {[profile?.city, profile?.state].filter(Boolean).join(", ")}</span>}
                {(profile?.is_agency || profile?.isAgency) && (
                  <>
                    <span>•</span>
                    <span className="text-[#7C3AED] font-bold">Agency Partner</span>
                  </>
                )}
              </p>

              {profile?.website && (
                <a
                  href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-[var(--violet)] hover:underline mt-2"
                >
                  <Globe size={13} /> {profile.website.replace(/^https?:\/\//, '')} <ExternalLink size={11} />
                </a>
              )}
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="px-6 md:px-8 py-4 overflow-y-auto space-y-6 flex-1 divide-y divide-slate-100">
            {/* Trust Indicators */}
            <div className="pt-2">
              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                <div className="text-center">
                  <div className="text-lg font-black text-slate-900 font-mono">100%</div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Payment Hold Secured</div>
                </div>
                <div className="text-center border-x border-slate-200">
                  <div className="text-lg font-black text-slate-900 font-mono">{loading ? "…" : campaigns.length}</div>{/* v332: showed a made-up "1+" when there were none */}
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active Campaigns</div>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-black font-mono ${isVerifiedBrand ? "text-emerald-600" : "text-slate-500"}`}>{isVerifiedBrand ? "Verified" : "Pending"}</div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">KYC</div>
                </div>
              </div>
            </div>

            {/* About / Description */}
            <div className="pt-4 space-y-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Building size={14} /> About {profile?.company_name || brandName}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed font-normal">
                {profile?.description || "This brand hasn't added a description yet."}
              </p>
            </div>

            {/* Live Campaigns Section */}
            <div className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Video size={14} /> Active Brand Campaigns ({campaigns.length})
                </h3>
              </div>

              {loading ? (
                <div className="p-6 text-center text-xs text-slate-500 animate-pulse">Loading campaigns...</div>
              ) : campaigns.length > 0 ? (
                <div className="space-y-2.5">
                  {campaigns.map((camp) => (
                    <div
                      key={camp.id || camp.campaign_id}
                      onClick={() => {
                        onClose();
                        navigate(`/campaigns/${camp.id || camp.campaign_id}`);
                      }}
                      className="p-3.5 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-200/80 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-slate-900 group-hover:text-[var(--violet)] transition-colors truncate">
                          {camp.title}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                          {/* v332: no made-up ₹5,000 – ₹15,000 budget when the campaign has none */}
                          {(Number(camp.budget_min) > 0 || Number(camp.budget_max) > 0) && (<>
                          <span className="font-mono text-emerald-700 font-bold">
                            {Number(camp.budget_min) > 0 && Number(camp.budget_max) > 0
                              ? `₹${Number(camp.budget_min).toLocaleString('en-IN')} – ₹${Number(camp.budget_max).toLocaleString('en-IN')}`
                              : `₹${Number(camp.budget_max || camp.budget_min).toLocaleString('en-IN')}`}
                          </span>
                          <span>•</span>
                          </>)}
                          <span>{camp.category || camp.categories?.[0] || 'Influencer Brief'}</span>
                        </div>
                      </div>
                      <span className="px-3 py-1.5 bg-white border border-slate-200 group-hover:border-[var(--violet)] group-hover:text-[var(--violet)] text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1 shrink-0 transition-colors">
                        View Brief <ArrowRight size={12} />
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center text-xs text-slate-500">
                  No active public campaigns listed right now.
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 md:px-8 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all"
            >
              Close
            </button>
            <button
              onClick={() => {
                onClose();
                navigate('/campaigns');
              }}
              className="px-5 py-2.5 bg-[var(--violet)] hover:bg-[#5b38f2] text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5"
            >
              Explore Campaigns <ArrowRight size={14} />
            </button>
          </div>
        </PopupPanel>
      </PopupBackdrop>
    </AnimatePresence>
  );
}
