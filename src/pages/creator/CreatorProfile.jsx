import { motion } from "framer-motion";
import { ProfileSkeleton } from "../../components/common/ContentSkeletons";
import { formatAmount, safeLower } from "../../utils/safeFormat";
import React, { useEffect, useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import VideoEmbedPreview from "../../components/shared/VideoEmbedPreview";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { useLoading } from "../../contexts/LoadingContext";
import { toast } from "sonner";
import useIsMobile from "../../hooks/useIsMobile";
import { CheckCircle2, MapPin, Share2, Video, ExternalLink, Activity, Edit3, Plus, AlertCircle } from "lucide-react";
import { ignored } from "../../utils/ignored";
import { EstimateValue, EstimateNote } from "../../components/common/AudienceEstimate";
import { publicOrigin } from "../../lib/publicUrl";

const safeParseItem = (p) => {
  if (typeof p === 'object' && p !== null) return p;
  if (typeof p === 'string') {
    try {
      const parsed = JSON.parse(p);
      if (typeof parsed === 'string') {
         try { return JSON.parse(parsed); } catch (e) { ignored("CreatorProfile:22", e); }
      }
      return parsed;
    } catch(e) {
      return p;
    }
  }
  return p;
};

export default function CreatorProfile() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { startLoading, stopLoading } = useLoading();
  const [c, setC] = useState(null);
  const [loadingError, setLoadingError] = useState(false);
  const [activeTab, setActiveTab] = useState("Home");
  const [reloadKey, setReloadKey] = useState(0); // v332: "Try again" on the error screen

  // Load Creator Detail
  useEffect(() => {
    if (!user) return;
    setLoadingError(false);
    api.get(`/creators/${user.user_id}`)
      .then((resCreator) => {
        
        const data = resCreator.data || {};
        // v332: a portfolio / past_brands that arrives as a non-list no longer crashes the page
        data.portfolio = Array.isArray(data.portfolio) ? data.portfolio.map(safeParseItem) : [];
        if (!Array.isArray(data.past_brands)) data.past_brands = typeof data.past_brands === "string" && data.past_brands.trim() ? data.past_brands.split(",").map((s) => s.trim()).filter(Boolean) : [];
        setC(data);

        
      })
      .catch((err) => {
        console.error(err);
        setLoadingError(true);
      });
  }, [user, startLoading, stopLoading, reloadKey]);

  const getRatesList = () => {
    if (!c) return [];
    const list = [];
    
    const reelRate = Number(c.rate_reel || c.reel_rate || (c.rate_card && (c.rate_card.reels || c.rate_card.reel))) || 0;
    if (reelRate > 0) list.push({ label: "Instagram Reel", rate: reelRate });

    const storyRate = Number(c.rate_story || c.story_rate || (c.rate_card && (c.rate_card.stories || c.rate_card.story))) || 0;
    if (storyRate > 0) list.push({ label: "Instagram Story", rate: storyRate });

    const ytRate = Number(c.rate_yt_video || c.youtube_video_rate || (c.rate_card && (c.rate_card.yt_video || c.rate_card.youtube_integration))) || 0;
    if (ytRate > 0) list.push({ label: "Dedicated YouTube Video", rate: ytRate });
    
    if (c.rate_card && typeof c.rate_card === "object") {
      Object.entries(c.rate_card).forEach(([key, val]) => {
        const rateVal = Number(val);
        if (typeof rateVal === "number" && rateVal > 0) {
          const lowerKey = key.toLowerCase();
          if (lowerKey === "other_platforms" || lowerKey === "extras") return;
          if (typeof val === 'object') return;

          if (lowerKey.includes("reel")) {
            if (!list.some(item => item.label.includes("Reel"))) {
              list.push({ label: "Instagram Reel", rate: rateVal });
            }
          } else if (lowerKey.includes("story") || lowerKey.includes("stories")) {
            if (!list.some(item => item.label.includes("Story"))) {
              list.push({ label: "Instagram Story", rate: rateVal });
            }
          } else if (lowerKey.includes("yt") || lowerKey.includes("youtube") || lowerKey.includes("video")) {
            if (!list.some(item => item.label.includes("YouTube"))) {
              list.push({ label: "Dedicated YouTube Video", rate: rateVal });
            }
          } else {
            const formattedLabel = key.split(/[-_]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            if (!list.some(item => safeLower(item.label) === formattedLabel.toLowerCase())) {
              list.push({ label: formattedLabel, rate: rateVal });
            }
          }
        }
      });
    }
    return list;
  };

  // Mobile has its own dedicated profile hub (Creator info / Social platforms /
  // Rate cards / Portfolio / KYC / etc.) built at /creator/settings — desktop's
  // tabbed self-view below doesn't fit the mobile viewport, so send mobile
  // users there instead of squeezing the desktop layout.
  if (isMobile) {
    return <Navigate to="/creator/settings" replace />;
  }

  if (loadingError) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-24 text-center">
        {/* v332: calm wording + a Try again button (was "Error loading profile" with only a way out) */}
        <h2 className="text-2xl font-bold mb-2">Couldn't load your profile</h2>
        <p className="text-[var(--text-secondary)] mb-6">Please check your connection and try again.</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/dashboard" className="border border-[var(--border-default)] px-6 py-2 rounded-xl font-bold">Go to Dashboard</Link>
          <button type="button" onClick={() => { setC(null); setReloadKey((k) => k + 1); }} className="bg-[var(--violet)] text-white px-6 py-2 rounded-xl font-bold">Try again</button>
        </div>
      </div>
    );
  }

  if (!c) return <ProfileSkeleton />;

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans pb-24" data-testid="creator-profile">
      {/* Banner */}
      <div className="w-full px-4 md:px-8 mt-4">
        <div className="w-full h-32 md:h-52 relative group rounded-3xl overflow-hidden shadow-sm">
          {/* v332: no stock-photo cover when the creator has none — a plain brand gradient instead */}
          {c.cover_image ? (
            <img src={c.cover_image} alt="Banner" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#7C3AED] via-[#7C3AED] to-[#7C3AED]" aria-hidden="true" />
          )}
          {/* Nav actions overlay */}
          <div className="absolute top-4 right-4 flex gap-2">
            <Link to="/creator/settings" className="px-4 py-2 rounded-full bg-white/90 shadow-sm flex items-center justify-center text-gray-700 hover:text-black transition text-sm font-bold gap-2">
              <Edit3 size={16} /> Edit Page
            </Link>
            {/* v330: the copied link used /creators/:id, a route that does not exist (404) — the public profile is /creator/:id */}
            <button onClick={async () => {
              try {
                await navigator.clipboard.writeText(publicOrigin() + "/creator/" + user.user_id);
                toast.success("Profile link copied!");
              } catch (e) {
                toast.error("Could not copy the link.");
              }
            }} aria-label="Copy profile link" className="w-10 h-10 rounded-full bg-white/90 shadow-sm flex items-center justify-center text-gray-700 hover:text-black transition">
              <Share2 size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Header Info */}
      <div className="w-full px-4 md:px-8 relative flex flex-col items-center -mt-12 md:-mt-16">
        <div className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-white bg-white overflow-hidden shadow-lg relative z-10 group">
          {/* v330: initial fallback when there is no photo or it fails to load */}
          {(c.photo || c.picture) ? (
            <img src={c.photo || c.picture} alt={c.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          ) : null}
          <div className="absolute inset-0 -z-10 flex items-center justify-center bg-gradient-to-br from-[#7C3AED] to-[#7C3AED] text-white text-3xl font-black">{String(c.name || "C").trim().charAt(0).toUpperCase()}</div>
          <Link to="/creator/settings" className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
            <Edit3 size={20} />
            <span className="text-[10px] font-bold mt-1">Change</span>
          </Link>
        </div>
        
        <h1 className={`text-xl font-bold tracking-tight text-gray-900 mt-3 flex items-center gap-1.5`}>
          {c.name} {c.verified && <CheckCircle2 size={18} className="text-blue-500 fill-blue-100" />}
        </h1>
        <p className={`text-sm text-gray-500 mt-1`}>{c.category || "Content Creator"}</p>{/* v330: read "is Fashion" */}
        
        <div className="flex items-center gap-4 mt-2 text-xs font-semibold text-gray-500">
          {/* v330: no invented "New Delhi, IN" / "GOLD Tier" — only what the profile has */}
          {(c.city || c.state) && <span className={`text-[11px] font-medium flex items-center gap-1`}><MapPin size={12}/> {[c.city, c.state].filter(Boolean).join(", ")}</span>}
          {c.aggregate_tier && <span className={`text-[11px] font-medium flex items-center gap-1`}><Activity size={12}/> {c.aggregate_tier} Tier</span>}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-3 md:gap-6 mt-6 border-b border-gray-200 w-full justify-center text-sm font-bold text-gray-500 relative py-1">
          {["Home", "Rate Card", "Portfolio", "Stats"].map(tab => {
            const isActive = activeTab === tab;
            return (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative px-4 py-2 rounded-xl transition-colors whitespace-nowrap cursor-pointer z-10 ${
                  isActive ? "text-[var(--violet)] font-bold" : "hover:text-gray-900"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="creatorProfileTabPill"
                    className="absolute inset-0 bg-[var(--violet)]/10 rounded-xl border border-[var(--violet)]/20 z-0"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{tab}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="w-full px-4 md:px-8 mt-8 space-y-6">
        
        {activeTab === "Home" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              {/* v332: the creator's real bio — it used to show the same made-up paragraph for everyone */}
              <h3 className={`font-bold text-sm text-gray-900 mb-2 flex items-center gap-2`}>About</h3>
              {(c.bio || c.about) ? (
                <p className={`text-sm text-gray-500 leading-relaxed whitespace-pre-line break-words`}>{c.bio || c.about}</p>
              ) : (
                <p className={`text-sm text-gray-500 leading-relaxed`}>
                  You haven't written a bio yet. <Link to="/creator/settings" className="font-bold text-[var(--violet)] hover:underline">Add one in Settings</Link> so brands know what you do.
                </p>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === "Rate Card" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {getRatesList().length > 0 ? (
              getRatesList().map((item) => (
                <div key={item.label} className="bg-white border border-gray-100 rounded-2xl p-6 flex justify-between items-center">
                  <h4 className={`font-bold text-sm text-gray-900`}>{item.label}</h4>
                  <div className={'font-mono font-bold tracking-tight text-lg'}>₹{formatAmount(item.rate)}</div>
                </div>
              ))
            ) : (
              <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center">
                <p className={'text-[11px] font-medium'}>No rate card details available.</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "Portfolio" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <h3 className={`text-base font-bold mb-2`}>Past Brands</h3>
            {c.past_brands && c.past_brands.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {c.past_brands?.map((brand, idx) => (
                  <span key={idx} className={`px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-[11px] font-medium`}>
                    {brand}
                  </span>
                ))}
              </div>
            ) : (
              <p className={'text-[11px] font-medium'}>No past brands listed.</p>
            )}

            <h3 className={`text-base font-bold mb-2 mt-8`}>Portfolio Highlights</h3>
            {c.portfolio && c.portfolio.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {c.portfolio?.map((item, idx) => {
                  const itemUrl = typeof item === 'object' ? (item.content_url || item.url || item.link || "") : item;
                  const itemTitle = typeof item === 'object' ? (item.title || item.brand_name || "Campaign Deliverable") : "Deliverable";
                  const brandName = typeof item === 'object' ? (item.brand_name || item.brand) : null;
                  const desc = typeof item === 'object' ? item.description : null;
                  
                  return (
                    <div key={idx} className="bg-white border border-[#E5E5EA] rounded-3xl p-5 shadow-xs flex flex-col justify-between hover:shadow-md hover:border-[#DDD6FE] transition-all">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[10px] font-black uppercase bg-[#F5F0FF] text-[var(--violet)] px-2.5 py-1 rounded-md">
                            {brandName || "Sample work"}{/* v332: no invented "Brand Partner" */}
                          </span>
                          <Video size={16} className="text-[var(--violet)]" />
                        </div>
                        {itemTitle && (
                          <h4 className="font-extrabold text-sm text-[var(--text-primary)] mb-2.5 line-clamp-2">{itemTitle}</h4>
                        )}
                        <div className="mb-3">
                          <VideoEmbedPreview url={itemUrl} title={itemTitle} watermark={false} isApproved={true} />
                        </div>
                        {desc && (
                          <p className="text-xs text-gray-600 leading-relaxed font-medium mb-3 line-clamp-2 px-4 max-w-full overflow-hidden break-words">
                            "{desc}"
                          </p>
                        )}
                      </div>
                      {itemUrl && (
                        <a 
                          href={itemUrl} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="inline-flex items-center justify-center gap-1.5 py-2 w-full bg-[var(--bg-elevated)] hover:bg-[#F5F0FF] text-xs font-bold rounded-xl border border-gray-200 text-gray-800 hover:text-[var(--violet)] transition-all mt-2"
                        >
                          <ExternalLink size={12} /> Open Link in New Tab
                        </a>
                      )}
                    </div>
                  );
                })}

              </div>
            ) : (
              <p className="text-gray-500 text-sm">No portfolio items available.</p>
            )}

            {(!c.portfolio || c.portfolio.length === 0 || !c.past_brands || c.past_brands.length === 0) && (
              <div className="mt-8 bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-4">
                <p className="text-slate-500 text-sm font-medium">Build a robust portfolio showing past brand deals to attract high-ticket brands.</p>
                <Link 
                  to="/creator/settings" 
                  className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md shadow-[#7C3AED]/10 flex items-center gap-2 transition-all"
                >
                  <Plus size={16} /> Add Portfolio & Sample Work
                </Link>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "Stats" && (() => {
          const rawFollowers = c.ig_followers ?? c.instagram_followers ?? c.followers_instagram ?? c.follower_count;
          const rawReach = c.avg_views_30d ?? c.instagram_avg_reach ?? c.average_reach;
          const rawLikes = c.avg_likes_30d ?? c.instagram_avg_likes;
          const rawComments = c.avg_comments_30d ?? c.instagram_avg_comments;

          const igFollowers = rawFollowers != null ? Number(rawFollowers) : null;
          const igReach = rawReach != null ? Number(rawReach) : null;
          const igLikes = rawLikes != null ? Number(rawLikes) : null;
          const igComments = rawComments != null ? Number(rawComments) : null;

          const hasCompleteIgStats = igFollowers != null && igFollowers > 0 && igReach != null && (igLikes != null || c.engagement_rate != null);

          let calcEr = null;
          if (igFollowers != null && igFollowers > 0) {
            if (igLikes != null || igComments != null) {
              calcEr = (((Number(igLikes || 0) + Number(igComments || 0)) / igFollowers) * 100).toFixed(2);
            } else if (c.engagement_rate != null) {
              calcEr = Number(c.engagement_rate).toFixed(2);
            }
            if (!Number.isFinite(Number(calcEr))) calcEr = null; // v332: never "NaN%"
          }

          return (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              {!hasCompleteIgStats && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center text-amber-900 flex flex-col items-center justify-center gap-2">
                  <AlertCircle className="text-amber-600" size={24} />
                  <p className="font-bold text-sm">Add your Instagram details in Settings</p>
                  <p className="text-xs text-amber-700 max-w-md">Provide your Instagram followers, reach, likes, and comments in Settings to unlock live engagement metrics and brand visibility.</p>
                  <Link to="/creator/settings" className="mt-1 px-4 py-2 bg-amber-600 text-white rounded-xl font-bold text-xs hover:bg-amber-700 transition shadow-sm">
                    Add Instagram Details in Settings →
                  </Link>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Followers</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {igFollowers != null && igFollowers > 0 ? igFollowers.toLocaleString("en-IN") : "—"}
                  </div>
                  {(!igFollowers || igFollowers === 0) && (
                    <span className="text-[10px] text-amber-600 font-medium block mt-1">Add details in Settings</span>
                  )}
                </div>

                <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Engagement</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {calcEr != null ? `${calcEr}%` : "—"}
                  </div>
                  {calcEr == null && (
                    <span className="text-[10px] text-amber-600 font-medium block mt-1">Add details in Settings</span>
                  )}
                </div>

                <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Avg Views (30d)</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {igReach != null && igReach > 0 ? igReach.toLocaleString("en-IN") : "—"}
                  </div>
                  {(!igReach || igReach === 0) && (
                    <span className="text-[10px] text-amber-600 font-medium block mt-1">Add details in Settings</span>
                  )}
                </div>

                <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Performance</div>
                  <div className="text-2xl font-bold text-gray-900">
                    <EstimateValue creator={c} kind="performance" />
                  </div>
                </div>

                <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Authentic Audience</div>
                  <div className="text-2xl font-bold text-gray-900">
                    <EstimateValue creator={c} kind="authentic" />
                  </div>
                  <EstimateNote />
                </div>
              </div>
            </motion.div>
          );
        })()}

      </div>
      
      <p className="text-[10px] text-center text-gray-500 mt-12 font-semibold pb-8">This is how your profile appears to brands.</p>
    </div>
  );
}
