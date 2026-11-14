import React, { useEffect, useMemo, useState } from "react";
import { computeCreatorMatch } from "../../lib/creatorMatch";
import { ProfileSkeleton, ProfileSkeletonMobile } from "../../components/common/ContentSkeletons";
import { formatAmount } from "../../utils/safeFormat";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import ReportUserLink from "../../components/safety/ReportUserLink"; // v334: App Store 1.2 report a profile
import BlockUserButton from "../../components/safety/BlockUserButton"; // v337: block a user
import { useLoading } from "../../contexts/LoadingContext";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, MapPin, Share2, Star, Video, ExternalLink, Activity, Shield, Award, Send, Heart, Eye, PlusCircle, BookOpen, HeartHandshake, X, Lock } from "lucide-react";
import VideoEmbedPreview from "../../components/shared/VideoEmbedPreview";
import { ignored } from "../../utils/ignored";
import InviteToCampaignModal from "../../components/campaigns/InviteToCampaignModal";
import useIsMobile from "../../hooks/useIsMobile";
import PhotoLedHeaderMobile from "../../components/publicProfile/PhotoLedHeaderMobile"; // v363 design 1f
import PortfolioCoversMobile from "../../components/publicProfile/PortfolioCoversMobile"; // v363
import { usePhotoTheme } from "../../components/publicProfile/adaptiveTheme"; // v363 adaptive page colour

import { Presence } from "../../components/common/Popup";
import ButtonSpinner from "../../components/common/ButtonSpinner";
// v332: a typed handle can be a full link ("https://instagram.com/x") — don't glue it onto another URL.
const socialHref = (raw, base) => {
  const v = String(raw || "").trim();
  if (/^https?:\/\//i.test(v)) return v;
  return `${base}${v.replace(/^@/, "")}`;
};
import { EstimateValue, EstimateNote, estimateForCreator } from "../../components/common/AudienceEstimate";
import SocialLogo from "../../components/common/SocialLogo"; // v364: real platform logos
import { RATES_PUBLIC } from "../../utils/rateCardQuote"; // v430
// v330: profile photo with an initial fallback (no photo or a broken link).
function ProfileAvatar({ src, name }) {
  const [err, setErr] = useState(false);
  if (src && !err) {
    return <img src={src} alt={name || "Creator"} className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={() => setErr(true)} />;
  }
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#7C3AED] to-[#7C3AED] text-white text-4xl font-black">
      {String(name || "C").trim().charAt(0).toUpperCase()}
    </div>
  );
}

function ReviewBrandAvatar({ src, name }) {
  const [imgErr, setImgErr] = useState(false);
  const logoUrl = src && typeof src === 'string' && src.trim() !== '' ? src : null;
  const initial = (name || "B").trim().charAt(0).toUpperCase();

  if (logoUrl && !imgErr) {
    return (
      <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 shrink-0 border border-gray-200">
        <img 
          src={logoUrl} 
          alt={name || "Brand"} 
          className="w-full h-full object-cover" 
          onError={() => setImgErr(true)}
        />
      </div>
    );
  }

  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#6D28D9] text-white font-black text-xs flex items-center justify-center shrink-0 border border-violet-300 shadow-xs">
      {initial}
    </div>
  );
}

const safeParseItem = (p) => {
  if (typeof p === 'object' && p !== null) return p;
  // v363: an old portfolio entry can be a plain link string — treat it as { content_url }
  if (typeof p === 'string' && /^https?:\/\//i.test(p.trim())) return { content_url: p.trim() };
  if (typeof p === 'string') {
    try {
      const parsed = JSON.parse(p);
      if (typeof parsed === 'string') {
         try { return JSON.parse(parsed); } catch (e) { ignored("CreatorPublicView:48", e); }
      }
      return parsed;
    } catch(e) {
      return p;
    }
  }
  return p;
};

export default function CreatorPublicView() {
  const { id } = useParams();
  const preview = useLocation()?.state?.preview || null; // v429: photo + name from the Explore card (shown while the full profile loads)
  const { user } = useAuth();
  const { startLoading, stopLoading } = useLoading();
  const navigate = useNavigate();
  
  const [c, setC] = useState(null);
  const [loadingError, setLoadingError] = useState(false);
  const [notFound, setNotFound] = useState(false); // v332: "not found" only for a real 404, not for a network blip
  const [reloadKey, setReloadKey] = useState(0);
  const [savingProfile, setSavingProfile] = useState(false);
  const [activeTab, setActiveTab] = useState("Home");
  const [isSaved, setIsSaved] = useState(false);
  
  // Real database-backed states
  const [portfolioItems, setPortfolioItems] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  
  // Interactive Brand Review Form State (Single star rating & comment as per schema)
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  // Invite Brief Form State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCampaignTitle, setInviteCampaignTitle] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteBudget, setInviteBudget] = useState("");
  const [inviteDeliverables, setInviteDeliverables] = useState("");
  const [inviteTimeline, setInviteTimeline] = useState("");
  const [submittingInvite, setSubmittingInvite] = useState(false);

  // Session 31: real match % (src/lib/creatorMatch.js) from the viewing brand's own profile and
  // campaigns. Replaces the old random score. null = not enough data → no % is shown.
  const [brandMatchData, setBrandMatchData] = useState(null);

  // Session 30 (EX-04/05): brands on a phone get the mobile creator profile. The invite sheet can
  // prefill from one of the brand's own live campaigns, so load them once when it first opens.
  const isMobile = useIsMobile();
  const isBrandViewer = String(user?.role || "").toLowerCase() === "brand";
  const [myCampaigns, setMyCampaigns] = useState(null);
  const [myCampaignsError, setMyCampaignsError] = useState(false); // v344: failed load ≠ "no live campaigns"
  const loadMyCampaigns = async () => {
    setMyCampaignsError(false);
    setMyCampaigns(null);
    try {
      const { data } = await api.get("campaigns?mine=true");
      const live = (Array.isArray(data) ? data : []).filter((x) => ["live", "approved"].includes(String(x.status || "").toLowerCase()) && !x.closed_at);
      setMyCampaigns(live);
    } catch {
      setMyCampaignsError(true); // v344: keep null so a later open / Retry loads again
    }
  };
  const openInvite = async () => {
    setShowInviteModal(true);
    if ((myCampaigns !== null && !myCampaignsError) || !isBrandViewer) return;
    await loadMyCampaigns();
  };
  // v432: "Notify me" on the Rates card — one note to the Ybex team per viewer (counts demand for Ybex Pro rates)
  const notifyRates = async () => {
    const key = `yb_rates_notify_${user?.user_id || user?.id || "guest"}`;
    let done = false; try { done = localStorage.getItem(key) === "1"; } catch { /* storage blocked */ }
    if (!user) { navigate(`/login?role=brand&next=${encodeURIComponent(`/creator/${id}`)}`); return; }
    if (done) { toast.success("You're on the list — we'll tell you when rates go live."); return; }
    try {
      await api.post("feedback", { category: "feature", message: `Notify me when creator rates (Ybex Pro) go live — asked on ${c?.name || "a creator"}'s profile`, screen: "creator-profile" });
      try { localStorage.setItem(key, "1"); } catch { /* storage blocked */ }
      toast.success("Done — we'll tell you when creator rates go live.");
    } catch { toast.error("Couldn't save that. Try again in a bit."); }
  };
  const shareProfile = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: c?.name || "Creator on Ybex", url });
      else { await navigator.clipboard.writeText(url); toast.success("Profile link copied"); }
    } catch (e) { if (e?.name !== "AbortError") toast.error("Could not share the link."); }
  };

  useEffect(() => {
    if (!isBrandViewer) { setBrandMatchData(null); return; }
    let alive = true;
    (async () => {
      const [profileRes, campaignsRes] = await Promise.all([
        api.get("brands/me").catch(() => null),
        api.get("campaigns?mine=true").catch(() => null),
      ]);
      if (!alive) return;
      const bp = profileRes?.data?.profile || profileRes?.data?.brand_profile || profileRes?.data || {};
      const campaigns = Array.isArray(campaignsRes?.data) ? campaignsRes.data : [];
      setBrandMatchData({ brand: bp, campaigns });
    })();
    return () => { alive = false; };
  }, [isBrandViewer, user?.id, user?.user_id]);

  const match = useMemo(
    () => (c && brandMatchData ? computeCreatorMatch({ creator: c, brand: brandMatchData.brand, campaigns: brandMatchData.campaigns }) : null),
    [c, brandMatchData],
  );

  // v363 (Ravi's design 1f): phones get the photo-led profile for every viewer (brand, the creator, visitors).
  // The page colour is sampled from the photo; no photo → the purple header + light page as before.
  const photoLed = isMobile;
  const photoUrl = c ? (c.photo || c.picture || c.avatar_url || "") : "";
  const photoTheme = usePhotoTheme(photoLed && photoUrl ? photoUrl : null);
  const [mobileTabSet, setMobileTabSet] = useState(false);
  useEffect(() => {
    if (!photoLed || mobileTabSet || !c) return;
    setMobileTabSet(true);
    if (user && activeTab === "Home") setActiveTab("Portfolio"); // logged-out visitors keep "About" (the rest is behind sign-in)
  }, [photoLed, mobileTabSet, c, user, activeTab]);

  useEffect(() => { setC(null); }, [id]); // v429: another creator → skeleton, never the previous creator's page
  useEffect(() => {
    if (!id) return;
    setLoadingReviews(true);
    
    const loadData = async () => {
      try {
        let res;
        try {
          res = await api.get(`/creators/${id}/profile`);
        } catch (initialErr) {
          // Fallback to /creators/:id
          res = await api.get(`/creators/${id}`);
        }
        const profileData = res.data;
        setC(profileData);
        setIsSaved(!!profileData.isSaved);
        if (profileData.portfolio) {
          const parsed = profileData.portfolio.map(safeParseItem);
          setPortfolioItems(parsed);
        }
        if (profileData.reviews) setReviews(profileData.reviews);
        setLoadingReviews(false);
        setLoadingError(false);
        
      } catch (err) {
        console.error("Error loading creator profile details:", err);
        setNotFound(err?.response?.status === 404);
        setLoadingError(true);
        setLoadingReviews(false);
      }
    };

    loadData();
  }, [id, user, reloadKey]);

  const handleSaveProfile = async () => {
    if (!user) {
      toast.error("Please sign in to save creator profiles.");
      return;
    }
    if (savingProfile) return; // v332: a double tap saved and un-saved in one go
    setSavingProfile(true);
    try {
      await api.post(`/creators/${c.user_id}/save`);
      setIsSaved(!isSaved);
      toast.success(isSaved ? "Removed from your saved creators" : "Saved to your creators");
    } catch (err) {
      // v332: plain words instead of a raw error message
      toast.error(err?.response?.data?.error || "Couldn't update saved creators. Please try again.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!user) {
      toast.error("Please log in to submit a review.");
      return;
    }
    if (!rating || rating < 1 || rating > 5) {
      toast.error("Rating is required.");
      return;
    }
    if (!comment || !comment.trim()) {
      toast.error("Comment is required and cannot be empty.");
      return;
    }

    setSubmittingReview(true);
    try {
      const res = await api.post(`/creators/${c.user_id}/review`, {
        rating,
        comment: comment.trim()
      });

      if (res.data.success) {
        toast.success("Review submitted. Thank you!");
        setComment("");
        setRating(5);
        setShowReviewForm(false);
        
        // Refresh profile data to get updated reviews list
        const refreshed = await api.get(`/creators/${id}/profile`);
        setC(refreshed.data);
        if (refreshed.data.portfolio) {
          const parsed = refreshed.data.portfolio.map(safeParseItem);
          setPortfolioItems(parsed);
        }
        if (refreshed.data.reviews) setReviews(refreshed.data.reviews);
      } else {
        toast.error("Failed to submit review.");
      }
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to submit review.");
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleSendInvite = async (e) => {
    e.preventDefault();
    if (!inviteMessage.trim()) {
      toast.error("Please add invitation details.");
      return;
    }

    setSubmittingInvite(true);
    try {
      const res = await api.post(`/creators/${c.user_id}/send-brief`, {
        campaign_title: inviteCampaignTitle.trim() || undefined,
        message: inviteMessage.trim(),
        budget_range: inviteBudget || "Barter Friendly",
        deliverables: inviteDeliverables.trim() || undefined,
        timeline: inviteTimeline.trim() || undefined,
      });
      toast.success(res?.data?.note || "Campaign invitation sent successfully! 🚀");
      setShowInviteModal(false);
      setInviteCampaignTitle("");
      setInviteMessage("");
      setInviteBudget("");
      setInviteDeliverables("");
      setInviteTimeline("");

      // No chat yet: it opens only when the creator accepts (session 26).
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || err?.message || "Failed to send campaign invitation.");
    } finally {
      setSubmittingInvite(false);
    }
  };

  if (loadingError) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-24 text-center">
        {/* v332: a failed load (network / server) no longer says the creator doesn't exist */}
        <h2 className="text-2xl font-bold mb-2 font-sans text-[var(--text-primary)]">{notFound ? "Creator not found" : "Couldn't load this profile"}</h2>
        <p className="text-[var(--text-secondary)] mb-6 font-sans">{notFound ? "This creator profile may be private or deleted." : "Please check your connection and try again."}</p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link to="/creators" className={`${notFound ? "bg-[var(--violet)] text-white" : "border border-[var(--border-default)] text-[var(--text-primary)]"} px-6 py-2.5 rounded-xl font-bold font-sans`}>Go to Explore</Link>
          {!notFound && (
            <button type="button" onClick={() => { setC(null); setLoadingError(false); setReloadKey((k) => k + 1); }} className="bg-[var(--violet)] text-white px-6 py-2.5 rounded-xl font-bold font-sans">Try again</button>
          )}
        </div>
      </div>
    );
  }

  if (!c) return isMobile
    ? <ProfileSkeletonMobile photo={preview?.photo || ""} name={preview?.name || ""} />
    : <ProfileSkeleton />; // v429: phones get the photo-led shape

  // v363: brands on phones used to get CreatorProfileBrandMobile here; every phone viewer now gets the
  // photo-led page below (same invite sheet with the brand's live campaigns).

  // Session 53 (Ravi: "creator profile pe reviews/rating jab koi review nahi … ye sab hata do"): only real
  // reviews and real profile views are shown. A creator with no reviews used to get a made-up count
  // (10–25), rating (4.5–5.0), sub-scores and views from a hash of their id.
  const totalReviewsCount = reviews.length; // v358: only reviews we can show ("New (3 reviews)" with an empty list)
  const avgOf = (pick) => (reviews.reduce((acc, r) => acc + Number(pick(r) || 0), 0) / reviews.length).toFixed(1);
  const avgOverall = reviews.length > 0 ? avgOf((r) => r.rating || r.overall_rating) : "New";
  const displayProfileViews = Number(c.profile_views) || 0;
  const avgComm = reviews.length > 0 ? avgOf((r) => r.communication_rating || r.rating || r.overall_rating) : "—";
  const avgTime = reviews.length > 0 ? avgOf((r) => r.timeliness_rating || r.rating || r.overall_rating) : "—";
  const avgQual = reviews.length > 0 ? avgOf((r) => r.quality_rating || r.rating || r.overall_rating) : "—";

  const getDynamicTier = () => {
    if (reviews.length > 0) {
      const score = Number(avgOverall);
      if (score >= 4.7) return "PLATINUM";
      if (score >= 4.0) return "GOLD";
      if (score >= 3.0) return "SILVER";
      return "BRONZE";
    }
    return (c.aggregate_tier || c.tier || "BRONZE").toUpperCase();
  };
  const dynamicTier = getDynamicTier();

  const getTierGradient = (tier) => {
    switch (tier?.toUpperCase()) {
      case "PLATINUM":
        return "from-[#8B5CF6] via-[#6366F1] to-[#4F46E5] text-white";
      case "GOLD":
        return "from-[#F59E0B] via-[#D97706] to-[#B45309] text-white";
      case "SILVER":
        return "from-[var(--text-secondary)] via-[#4B5563] to-[#374151] text-white";
      case "BRONZE":
      default:
        return "from-[#B45309] via-[#92400E] to-[#78350F] text-white";
    }
  };

  // v363: phone page colours (photo-led). Desktop keeps the light page.
  const pt = photoLed && photoTheme && photoUrl ? photoTheme : null;
  const isOwner = Boolean(user && c && String(user.user_id || user.id || "") === String(c.user_id || ""));
  const mobileTabs = ["Portfolio", "Rate Card", "Stats", "Reviews", "AI Match", "Home"];
  const tabLabel = (tab) => (tab === "AI Match" ? `Match${isBrandViewer && match ? ` ${match.score}%` : ""}` : photoLed && tab === "Home" ? "About" : photoLed && tab === "Rate Card" ? "Rate card" : tab);
  const backOrExplore = () => ((window.history.state?.idx > 0) ? navigate(-1) : navigate(isOwner ? "/profile" : "/creators"));
  const mobileCta = isOwner ? { label: "Edit profile", icon: "edit", onClick: () => navigate("/profile") }
    : isBrandViewer ? { label: "Send collab request", icon: "send", onClick: openInvite }
    : !user ? { label: "Sign in to collaborate", icon: "send", onClick: () => navigate(`/login?role=brand&next=${encodeURIComponent(`/creator/${id}`)}`) } // v376: back to this creator after sign-in

    : null; // another creator viewing: no collab action

  return (
    <div className={`min-h-screen font-sans ${photoLed ? "" : "pb-24"} ${pt ? "" : "bg-[#F2F2F7]"}`} style={pt ? { background: pt.bg } : undefined} data-testid="creator-profile">
      {photoLed && (
        // v432 (Ravi's redesign 2b): the whole phone profile is one themed scroll — see PhotoLedHeaderMobile.jsx
        <PhotoLedHeaderMobile
          c={c}
          theme={photoTheme}
          photoUrl={photoUrl}
          onBack={backOrExplore}
          onShare={shareProfile}
          verified={Boolean(c.verified)}
          match={isBrandViewer && match ? match : null}
          portfolioItems={portfolioItems}
          reviews={reviews}
          loadingReviews={loadingReviews}
          scores={{ overall: avgOverall, quality: avgQual, time: avgTime, comm: avgComm }}
          viewer={{ isOwner, isBrand: isBrandViewer, loggedIn: Boolean(user) }}
          cta={mobileCta}
          saved={(!user || isBrandViewer) ? { active: isSaved, onClick: handleSaveProfile } : null}
          onAskQuote={isOwner ? null : (isBrandViewer ? openInvite : () => navigate(`/login?role=brand&next=${encodeURIComponent(`/creator/${id}`)}`))}
          onNotifyRates={isOwner ? null : notifyRates}
          reviewForm={{ can: isBrandViewer, open: showReviewForm, setOpen: setShowReviewForm, rating, setRating, comment, setComment, onSubmit: handleSubmitReview, submitting: submittingReview }}
          footer={<div className="flex items-center gap-4"><ReportUserLink targetId={c.user_id} kind="creator" name={c.name} /><BlockUserButton targetId={c.user_id} name={c.name} /></div>}
        />
      )}
      {!photoLed && (<>
      {/* Banner Card */}
      {/* Banner Card */}
      <div className="w-full px-4 md:px-8 mt-4">
        <div className="w-full h-44 md:h-64 relative rounded-3xl overflow-hidden shadow-sm border border-white/40">
          {/* v332: no stock-photo cover when the creator has none — a plain brand gradient instead */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#7C3AED] via-[#7C3AED] to-[#7C3AED]" aria-hidden="true" />
          {c.cover_image && (
            <img 
              src={c.cover_image} 
              alt="Banner" 
              className="relative w-full h-full object-cover"
              onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} /* v330: broken cover → plain card */
            />
          )}
          <div className="absolute top-4 right-4 flex gap-2">
            <button 
              onClick={shareProfile} /* v330: clipboard-only copy threw on phones without clipboard access; same share as mobile */
              aria-label="Share profile"
              className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center text-gray-700 hover:text-black hover:scale-105 transition cursor-pointer"
            >
              <Share2 size={16} />
            </button>
            {/* v353: creators (even on their own page) saw a heart that only said "Only brands can save creators" */}
            {(!user || isBrandViewer) && (
            <button 
              onClick={handleSaveProfile} 
              disabled={savingProfile}
              aria-label={isSaved ? "Remove from saved" : "Save profile"} /* v330 */
              aria-pressed={isSaved}
              className={`w-10 h-10 rounded-full backdrop-blur-sm shadow-md flex items-center justify-center transition hover:scale-105 cursor-pointer ${
                isSaved ? "bg-rose-500 text-white" : "bg-white/90 text-gray-700 hover:text-rose-500"
              }`}
            >
              <Heart size={16} className={isSaved ? "fill-white" : ""} />
            </button>
            )}
          </div>
        </div>
      </div>

      {/* Header Profile Badge */}
      <div className="w-full px-4 md:px-8 relative flex flex-col items-center -mt-16 md:-mt-20">
        <div className="w-32 h-32 md:w-36 md:h-36 rounded-full border-[6px] border-white bg-white overflow-hidden shadow-xl relative z-10">
          {/* v330: no photo / broken photo showed an empty white circle — show the initial instead */}
          <ProfileAvatar src={c.photo || c.picture} name={c.name} />
        </div>
        
        <div className="text-center mt-3 space-y-1">
          <h1 className="text-2xl md:text-3xl font-black text-[var(--text-primary)] flex items-center justify-center gap-2 flex-wrap">
            {c.name}
            {c.verified && (
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 text-xs font-bold px-2.5 py-1 rounded-full border border-emerald-100 shadow-sm shrink-0">
                <CheckCircle2 size={13} className="text-emerald-500 fill-emerald-50" /> KYC Verified
              </span>
            )}
          </h1>
          <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">{c.category || c.primary_niche || "Creator"}</p>
          
          <div className="flex flex-wrap items-center justify-center gap-3 mt-2.5 text-xs font-bold text-[var(--text-secondary)]">
            {/* Session 31 (Ravi): no invented city — the pill shows only what the creator filled in. */}
            {(c.city || c.state) && (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-white border border-[#E5E5EA] rounded-full">
                <MapPin size={13} className="text-[var(--violet)]" /> {[c.city, c.state].filter(Boolean).join(", ")}
              </span>
            )}
            <span className="flex items-center gap-1.5 px-3 py-1 bg-white border border-[#E5E5EA] rounded-full">
              <Eye size={13} className="text-[var(--violet)]" />{/* v415: no endless blink */} {displayProfileViews.toLocaleString("en-IN")} Profile Views
            </span>
            {/* v332: a brand-new creator got a made-up "BRONZE" rank — shown only when there are reviews or a real tier */}
            {(reviews.length > 0 || c.aggregate_tier || c.tier) && (
              <span className={`flex items-center gap-1 px-3 py-1 bg-gradient-to-r rounded-full font-black text-[10px] uppercase shadow-sm ${getTierGradient(dynamicTier)}`}>
                <Award size={12} /> Ybex {dynamicTier} Rank
              </span>
            )}
            <span className="flex items-center gap-1 px-3 py-1 bg-white border border-[#E5E5EA] rounded-full font-black text-amber-600">
              <Star size={12} className="fill-amber-500 text-amber-500" />{/* v415: no endless pulse */} {totalReviewsCount > 0 ? `${avgOverall} (${totalReviewsCount} review${totalReviewsCount === 1 ? "" : "s"})` /* v344: "(1 reviews)" */ : "New on Ybex"}
            </span>
            {isBrandViewer && match && (
              <button type="button" onClick={() => setActiveTab("AI Match")} title={match.reason} className="flex items-center gap-1 px-3 py-1 bg-[#F5F0FF] border border-[var(--violet)]/20 rounded-full font-black text-[var(--violet)]">
                {match.score}% match
              </button>
            )}
          </div>

          {/* v415: the invite button stays in the header — it used to be only on the Home tab */}
          {isBrandViewer && !isOwner && (
            <div className="mt-4 flex justify-center">
              <button type="button" onClick={() => setShowInviteModal(true)} data-testid="creator-header-invite"
                className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white text-sm font-bold shadow-md shadow-[var(--violet)]/15 transition cursor-pointer">
                <Send size={15} /> Invite to campaign
              </button>
            </div>
          )}

          {/* Searchable Category/Vertical tag display */}
          <div className="flex items-center justify-center gap-2 mt-3 bg-white px-4 py-1.5 border border-[#E5E5EA] rounded-full text-xs font-bold text-gray-700 shadow-sm max-w-sm mx-auto">
            <svg className="w-3.5 h-3.5 text-gray-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            <span className="text-[var(--text-secondary)]">Category:</span>{/* v415 */}
            <span className="text-[var(--violet)] font-black">{c.category || c.primary_niche || "Creator"}</span>
          </div>
          </div>
        {/* Social Connectivity & Handles */}
        <div className={`grid grid-cols-1 ${(c.instagram || c.instagram_handle || c.ig_handle) && (c.youtube || c.youtube_handle || c.yt_handle) ? 'sm:grid-cols-2 max-w-xl' : 'max-w-xs'} gap-3 w-full mt-6 mx-auto`}>
          {(c.instagram || c.instagram_handle || c.ig_handle) && (
            <a 
              href={socialHref(c.instagram || c.instagram_handle || c.ig_handle, "https://instagram.com/")}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between shadow-xs hover:shadow-md transition-all cursor-pointer hover:-translate-y-0.5"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-white shadow-xs border border-slate-200 flex items-center justify-center p-1.5">
                  <img src="/assets/instagram.svg" className="w-full h-full object-contain" alt="Instagram" />
                </div>
                <div>
                  <p className="text-xs font-black text-emerald-950 break-all">{/^https?:/i.test(String(c.instagram || c.instagram_handle || c.ig_handle)) ? "Instagram profile" : `@${String(c.instagram || c.instagram_handle || c.ig_handle).replace(/^@/, "")}`}</p>
                  {/* v332: the handle is typed in, not connected — and "@@name" when it already had an @ */}
                  <p className="text-[10px] text-emerald-700 font-bold">Instagram</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-emerald-950">{c.followers_instagram ? formatAmount(c.followers_instagram) : c.follower_count ? formatAmount(c.follower_count) : "—"}</p>
                <p className="text-[11px] text-emerald-700 uppercase tracking-widest font-bold">Followers</p>
              </div>
            </a>
          )}
          {(c.youtube || c.youtube_handle || c.yt_handle) && (
            <a 
              href={socialHref(c.youtube || c.youtube_handle || c.yt_handle, "https://youtube.com/@")}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between shadow-xs hover:shadow-md transition-all cursor-pointer hover:-translate-y-0.5"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-white shadow-xs border border-slate-200 flex items-center justify-center p-1.5">
                  <img src="/assets/youtube.svg" className="w-full h-full object-contain" alt="YouTube" />
                </div>
                <div>
                  <p className="text-xs font-black text-emerald-950 break-all">{/^https?:/i.test(String(c.youtube || c.youtube_handle || c.yt_handle)) ? "YouTube channel" : c.youtube || c.youtube_handle || c.yt_handle}</p>
                  <p className="text-[10px] text-emerald-700 font-bold">YouTube</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-emerald-950">{c.followers_youtube ? formatAmount(c.followers_youtube) : "—"}</p>
                <p className="text-[11px] text-emerald-700 uppercase tracking-widest font-bold">Subscribers</p>
              </div>
            </a>
          )}
        </div></div>

      </>)}{/* v363: end of the desktop header (phones use PhotoLedHeaderMobile) */}

      {!photoLed && (<>{/* v432: phones get the one-page profile above */}
        {/* Navigation Tabs */}
        {/* v332: justify-center on a scrolling row hid the first tabs on narrow phones — start-aligned there */}
        <div className={`flex items-center gap-2 md:gap-4 ${photoLed ? "mt-5" : "mt-8"} border-b w-full justify-start md:justify-center text-xs md:text-sm font-bold overflow-x-auto px-4 relative py-1 ${pt && pt.mode === "dark" ? "border-white/10 text-white/60" : "border-gray-200 text-gray-500"}`}>
          {(photoLed ? mobileTabs : ["Home", "Rate Card", "Portfolio", "Stats", "Reviews", "AI Match"]).map(tab => {
            const isActive = activeTab === tab;
            return (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap cursor-pointer z-10 ${
                  isActive ? "text-[var(--violet)] font-black" : (pt && pt.mode === "dark" ? "hover:text-white" : "hover:text-gray-900")
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="publicViewTabPill"
                    className={`absolute inset-0 rounded-xl z-0 ${pt && pt.mode === "dark" ? "bg-white/15 border border-white/20" : "bg-[var(--violet)]/10 border border-[var(--violet)]/20"}`}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className={`relative z-10 flex items-center gap-1 ${isActive && pt && pt.mode === "dark" ? "text-white" : ""}`}>
                  {tabLabel(tab)}
                </span>
              </button>
            );
          })}
        </div>

      {/* Main Content Area */}
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 mt-8">
        {!user && activeTab !== "Home" ? (
          <div className="relative min-h-[350px] w-full flex items-center justify-center py-6 bg-white border border-[#E5E5EA] rounded-3xl">
            {/* Blurred Mock Background */}
            <div className="filter blur-xl pointer-events-none select-none opacity-15 w-full p-6">
              <div className="space-y-4">
                <div className="h-12 bg-gray-200 rounded-xl" />
                <div className="h-24 bg-gray-200 rounded-xl" />
                <div className="h-12 bg-gray-200 rounded-xl" />
              </div>
            </div>
            <GateOverlay />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              
              {/* Home Tab */}
              {activeTab === "Home" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Bio & Details Box */}
                  <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white border border-[#E5E5EA] rounded-3xl p-6 shadow-xs">
                      <h3 className="text-xs font-black text-[var(--text-secondary)] tracking-widest uppercase mb-3 flex items-center gap-1.5">
                        <BookOpen size={14} className="text-[var(--violet)]" /> About Creator
                      </h3>
                      <p className="text-sm text-gray-700 leading-relaxed font-semibold whitespace-pre-wrap">
                        {c.bio || "This creator hasn't added a bio yet." /* Session 58: no made-up first-person bio */}
                      </p>
                    </div>

                    <div className="bg-white border border-[#E5E5EA] rounded-3xl p-6 shadow-xs">
                      <h3 className="text-xs font-black text-[var(--text-secondary)] tracking-widest uppercase mb-3.5">
                        Commercial Preferences & Languages
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-bold text-gray-700">
                        <div className="p-3 bg-[var(--bg-elevated)] rounded-2xl">
                          <p className="text-[var(--text-secondary)] uppercase tracking-wider text-[11px] mb-1">Barter Friendly?</p>
                          <p className="text-[var(--text-primary)] font-black">{/* v353: onboarding saves cash_only / partial_barter / barter_friendly — brands saw those raw codes */}{({ barter_ok: "Yes, Open to Barter", barter_friendly: "Yes, Open to Barter", barter_only: "Barter Only", no_barter: "Paid Only (No Barter)", cash_only: "Paid Only (No Barter)", partial_barter: "Cash + Product" })[c.barter] || c.barter || "Not specified"}</p>
                        </div>
                        {/* v388 (QA): an empty field is hidden instead of showing "Not specified" */}
                        {(Array.isArray(c.languages) ? c.languages.filter(Boolean).length > 0 : Boolean(c.languages)) && (
                        <div className="p-3 bg-[var(--bg-elevated)] rounded-2xl">
                          <p className="text-[var(--text-secondary)] uppercase tracking-wider text-[11px] mb-1">Languages Spoken</p>
                          <p className="text-[var(--text-primary)] font-black">{Array.isArray(c.languages) ? c.languages.filter(Boolean).join(", ") : c.languages /* Session 58: the array printed as "EnglishHindi" */}</p>
                        </div>
                        )}
                        <div className="p-3 bg-[var(--bg-elevated)] rounded-2xl">
                          <p className="text-[var(--text-secondary)] uppercase tracking-wider text-[11px] mb-1">Gender</p>
                          <p className="text-[var(--text-primary)] font-black capitalize">{c.gender || "Not Specified"}</p>
                        </div>
                        <div className="p-3 bg-[var(--bg-elevated)] rounded-2xl">
                          <p className="text-[var(--text-secondary)] uppercase tracking-wider text-[11px] mb-1">Payment Terms</p>
                          <p className="text-[var(--text-primary)] font-black">{c.payment_terms === "within_30_days" ? "Within 30 Days" : c.payment_terms === "advance" ? "Full Advance" : c.payment_terms === "50_advance" ? "50% Advance" : c.payment_terms || "Not specified"}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Brand Action CTA Panel */}
                  <div className="space-y-6">
                    {user?.role === "brand" && (
                    <div className="bg-white border border-[#E5E5EA] rounded-3xl p-6 shadow-xs flex flex-col justify-between">
                      <div>
                        <h4 className="text-xs font-black text-[var(--text-secondary)] uppercase tracking-widest mb-1.5">Work together</h4>
                        <h3 className="text-lg font-extrabold text-[var(--text-primary)] mb-1 leading-tight break-words">Collaborate with {c.name}</h3>
                        <p className="text-xs text-[var(--text-secondary)] mb-5">
                          Invite {String(c.name || "this creator").split(" ")[0]} to a campaign. Chat opens when they accept, and your payment stays in escrow until you approve the work.
                        </p>{/* v415: plain words (was "direct contract briefs … secure payment hold") */}
                      </div>

                      <div className="space-y-3">
                        <button
                          onClick={() => {
                            if (!user) {
                              toast.error("Please sign in to pitch campaign briefs.");
                              return;
                            }
                            setShowInviteModal(true);
                          }}
                          className="w-full py-3.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-black rounded-xl text-xs transition duration-200 cursor-pointer shadow-md shadow-[var(--violet)]/10 flex items-center justify-center gap-1.5"
                        >
                          <Send size={14} /> Invite to Campaign
                        </button>
                      </div>
                    </div>
                    )}

                    <div className="bg-white border border-[#E5E5EA] rounded-3xl p-6 shadow-xs">
                      <h4 className="text-xs font-black text-[var(--text-secondary)] uppercase tracking-widest mb-2 flex items-center gap-1">
                        <Activity size={13} className="text-[var(--violet)]" /> Live Performance
                      </h4>
                      <div className="space-y-2.5">
                        <div className="flex justify-between items-center text-xs font-bold text-gray-700">
                          <span>Engagement Index</span>
                          {/* Session 40: no invented 5.4% when the creator gave no numbers */}
                          <span className="text-[var(--violet)] font-extrabold">{estimateForCreator(c).engagementRate != null ? estimateForCreator(c).engagementRate + "%" : (c.engagement_rate ? c.engagement_rate + "%" : "Not enough data")}</span>
                        </div>
                        <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-[var(--violet)] h-full rounded-full" style={{ width: `${Math.min(100, estimateForCreator(c).engagementRate ?? c.engagement_rate ?? 0)}%` }} />
                        </div>
                        {estimateForCreator(c).authenticPct != null && (
                          <>
                            <div className="flex justify-between items-center text-xs font-bold text-gray-700 pt-1">
                              <span>Audience Authenticity</span>
                              <EstimateValue creator={c} kind="authentic" className="text-emerald-600 font-extrabold" />
                            </div>
                            <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                              <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${estimateForCreator(c).authenticPct}%` }} />
                            </div>
                            <EstimateNote />
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Rate Card Tab */}
              {/* v430 (Ravi): rates are kept, not shown to brands yet — they come with the premium plan for brands */}
              {activeTab === "Rate Card" && !RATES_PUBLIC && !isOwner && (
                <div className="max-w-2xl mx-auto" data-testid="rates-coming-soon">
                  <div className="relative overflow-hidden rounded-3xl border border-[#DDD6FE] bg-white p-6 shadow-xs">
                    <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-[#F5F0FF]" aria-hidden="true" />
                    <span className="relative inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-[#F5F0FF] text-[#7C3AED] text-[11px] font-bold uppercase tracking-wider">
                      <Lock size={12} /> Coming soon · Ybex Premium
                    </span>
                    <h3 className="relative mt-3 text-[20px] leading-tight font-extrabold text-[#0A0A0A]">Creator rate cards are on the way</h3>
                    <p className="relative mt-2 text-[13.5px] leading-relaxed text-[#6B7280]">
                      We're checking rates against real campaign results so the numbers you see are fair and accurate. Premium brands will see them first.
                    </p>
                    <div className="relative mt-4 space-y-2" aria-hidden="true">
                      {["Instagram Reel", "Instagram Story", "YouTube Video"].map((t) => (
                        <div key={t} className="flex items-center justify-between rounded-2xl bg-[#F9F9FB] border border-[#E5E5EA] px-4 py-3">
                          <span className="text-[13px] font-bold text-[#0A0A0A]">{t}</span>
                          <span className="h-4 w-16 rounded-md bg-[#E5E5EA] blur-[1px]" />
                        </div>
                      ))}
                    </div>
                    <p className="relative mt-4 text-[12.5px] text-[#0A0A0A] font-semibold">Till then: send a collab request and agree the fee in chat — your money stays safe with Ybex.</p>
                  </div>
                </div>
              )}
              {activeTab === "Rate Card" && (RATES_PUBLIC || isOwner) && (
                <div className="max-w-2xl mx-auto space-y-4">
                  {isOwner && !RATES_PUBLIC && <div className="rounded-2xl bg-[#F5F0FF] border border-[#DDD6FE] px-4 py-3 text-[12.5px] text-[#0A0A0A]" data-testid="rates-owner-note"><b>Only you can see your rates.</b> Brands see them later with Ybex Premium.</div>}
                  <div className="bg-white border border-[#E5E5EA] rounded-3xl p-6 shadow-xs">
                    <h3 className="text-xs font-black text-[var(--text-secondary)] uppercase tracking-widest mb-4">Official Rate Card</h3>
                    
                    <div className="divide-y divide-gray-100 space-y-3.5">
                      <div className="flex justify-between items-center pt-2">
                        <div>
                          <h4 className="font-extrabold text-sm text-gray-900">Instagram Reel</h4>
                          <p className="text-[10px] text-gray-500">One Reel on Instagram{/* v332: no invented usage terms */}</p>
                        </div>
                        <div className="text-base font-black text-[var(--violet)]">
                          {/* v330: an unset rate read "₹0" */}
                          {c.rate_reel || c.reel_rate ? `₹${Number(c.rate_reel || c.reel_rate).toLocaleString("en-IN")}` : (c.rate_card?.reels || c.rate_card?.reel || 0) ? `₹${Number(c.rate_card.reels || c.rate_card.reel).toLocaleString("en-IN")}` : "Not set"}
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-3.5">
                        <div>
                          <h4 className="font-extrabold text-sm text-gray-900">Instagram Story</h4>
                          <p className="text-[10px] text-gray-500">One Instagram story</p>
                        </div>
                        <div className="text-base font-black text-[var(--violet)]">
                          {c.rate_story || c.story_rate ? `₹${Number(c.rate_story || c.story_rate).toLocaleString("en-IN")}` : (c.rate_card?.stories || c.rate_card?.story || 0) ? `₹${Number(c.rate_card.stories || c.rate_card.story).toLocaleString("en-IN")}` : "Not set"}
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-3.5">
                        <div>
                          <h4 className="font-extrabold text-sm text-gray-900">Dedicated YouTube Video</h4>
                          <p className="text-[10px] text-gray-500">One dedicated video on YouTube</p>
                        </div>
                        <div className="text-base font-black text-[var(--violet)]">
                          {c.rate_yt_video || c.youtube_video_rate || c.rate_card?.yt_video || c.rate_card?.youtube_integration ? (
                            `₹${Number(c.rate_yt_video || c.youtube_video_rate || c.rate_card?.yt_video || c.rate_card?.youtube_integration).toLocaleString("en-IN")}`
                          ) : (
                            "Not set"
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#F5F0FF] border border-[#DDD6FE] p-4 rounded-2xl flex items-start gap-3.5 text-xs text-gray-700 leading-normal">
                    <Shield className="text-[var(--violet)] shrink-0" size={18} />
                    <div>
                      <p className="text-[var(--violet)] font-black uppercase tracking-wider text-[11px] mb-0.5">Escrow protection</p>
                      {/* v332: plain, correct wording — money is released after the brand approves, not on submission · v415: "escrow" */}
                      Rates are set by the creator. The brand pays into Ybex escrow before work starts, and the money is released after the content is approved.
                    </div>
                  </div>
                </div>
              )}

              {/* Portfolio Tab */}
              {activeTab === "Portfolio" && (
                <div className="space-y-6">
                  {/* Past Brands Bento Row */}
                  <div className="bg-white border border-[#E5E5EA] rounded-3xl p-6 shadow-xs">
                    <h3 className="text-xs font-black text-[var(--text-secondary)] uppercase tracking-widest mb-3 flex items-center gap-1">
                      <HeartHandshake size={14} className="text-[var(--violet)]" /> Trusted Brand Collaborations
                    </h3>
                    {c.past_brands && c.past_brands.length > 0 ? (
                      <div className="flex flex-wrap gap-2.5 pt-1">
                        {c.past_brands?.map((brand, idx) => (
                          <span key={idx} className="px-3.5 py-1.5 bg-[var(--bg-elevated)] border border-[#E5E5EA] text-gray-800 rounded-full text-xs font-black">
                            {brand}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-xs py-1">No past brand collaborations listed yet.</p>
                    )}
                  </div>

                  {/* v363: phones — saved covers as a grid, grouped by brand (items without a cover stay link cards below) */}
                  {photoLed && <PortfolioCoversMobile items={portfolioItems} theme={pt || { mode: "light", text: "#0A0A0A", sub: "rgba(10,10,10,.6)", glass: "#FFFFFF", glassBorder: "#E5E7EB" }} />}

                  {/* Portfolio Items List */}
                  {!(photoLed && portfolioItems.length > 0 && portfolioItems.every((it) => it?.cover)) && (
                  <div>
                    <h3 className={`text-xs font-black uppercase tracking-widest mb-4 ${pt && pt.mode === "dark" ? "text-white/60" : "text-[var(--text-secondary)]"}`}>{photoLed && portfolioItems.some((it) => it?.cover) ? "More work" : "Portfolio Highlights & Deliverables"}</h3>
                    
                    {portfolioItems.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {portfolioItems.filter((it) => !(photoLed && it?.cover)).map((item, idx) => {
                          const itemUrl = item.content_url || item.url || item.link || "";
                          const itemTitle = item.title || item.brand_name || "Campaign Deliverable";
                          return (
                            <div key={`${item.id || "item"}-${idx}`} className="bg-white border border-[#E5E5EA] rounded-3xl p-5 shadow-xs flex flex-col justify-between hover:shadow-md hover:border-[#DDD6FE] transition-all">
                              <div>
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-[10px] font-black uppercase bg-[#F5F0FF] text-[var(--violet)] px-2.5 py-1 rounded-md">
                                    {item.brand_name || item.brand || "Sample work"}{/* v332 */}
                                  </span>
                                  {item.platform === "instagram" || item.platform === "youtube" ? (
                                    <SocialLogo platform={item.platform} size={16} />
                                  ) : (
                                    <Video size={16} className="text-[var(--violet)]" />
                                  )}
                                </div>

                                {item.title && (
                                  <h4 className="font-extrabold text-sm text-[var(--text-primary)] mb-2.5 line-clamp-2">{item.title}</h4>
                                )}

                                {/* Embedded Video Preview */}
                                <div className="mb-3">
                                  <VideoEmbedPreview url={itemUrl} title={itemTitle} watermark={false} isApproved={true} />
                                </div>

                                {item.description && (
                                  <p className="text-xs text-gray-600 leading-relaxed font-medium mb-3 line-clamp-2 px-4 max-w-full overflow-hidden break-words">
                                    "{item.description}"
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
                      <div className="bg-white border border-[#E5E5EA] rounded-3xl p-10 text-center space-y-2">
                        <Video size={28} className="text-gray-300 mx-auto" />
                        <h4 className="font-bold text-sm text-[var(--text-primary)]">No portfolio items uploaded yet</h4>
                        <p className="text-xs text-gray-500">This creator hasn't added past work yet. You can still invite them to a campaign.</p>
                      </div>
                    )}
                  </div>
                  )}
                </div>
              )}

              {/* Stats Tab */}
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
                  <div className="space-y-6">
                    {!hasCompleteIgStats && (
                      <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 text-center text-amber-900 space-y-1">
                        <p className="font-bold text-sm">Instagram stats not complete</p>
                        <p className="text-xs text-amber-700">This creator hasn't connected all their Instagram numbers yet. Missing numbers show as "—".</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="bg-white border border-[#E5E5EA] rounded-3xl p-6 text-center shadow-xs">
                        <div className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest mb-1">Followers</div>
                        <div className="text-2xl font-black num-black text-[var(--text-primary)]">
                          {igFollowers != null && igFollowers > 0 ? igFollowers.toLocaleString("en-IN") : "—"}
                        </div>
                      </div>

                      <div className="bg-white border border-[#E5E5EA] rounded-3xl p-6 text-center shadow-xs">
                        <div className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest mb-1">Engagement Rate</div>
                        <div className="text-2xl font-black num-black text-[var(--violet)]">
                          {calcEr != null ? `${calcEr}%` : "—"}
                        </div>
                      </div>

                      <div className="bg-white border border-[#E5E5EA] rounded-3xl p-6 text-center shadow-xs">
                        <div className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest mb-1">Avg Views (30D)</div>
                        <div className="text-2xl font-black num-black text-[var(--text-primary)]">
                          {igReach != null && igReach > 0 ? igReach.toLocaleString("en-IN") : "—"}
                        </div>
                      </div>

                      <div className="bg-white border border-[#E5E5EA] rounded-3xl p-6 text-center shadow-xs">
                        <div className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest mb-1">Performance Score</div>
                        <div className="text-2xl font-black num-black text-[var(--text-primary)]">
                          <EstimateValue creator={c} kind="performance" />
                        </div>
                      </div>

                      <div className="bg-white border border-[#E5E5EA] rounded-3xl p-6 text-center shadow-xs">
                        <div className="text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest mb-1">Authentic Audience</div>
                        <div className="text-2xl font-black num-black text-[var(--text-primary)]">
                          <EstimateValue creator={c} kind="authentic" />
                        </div>
                        <EstimateNote />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Reviews Tab */}
              {activeTab === "Reviews" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Ratings Breakdown Card */}
                  <div className="space-y-4">
                    <div className="bg-white border border-[#E5E5EA] rounded-3xl p-6 shadow-xs">
                      <h3 className="text-xs font-black text-[var(--text-secondary)] uppercase tracking-widest mb-4">Ybex Performance Rating</h3>
                      
                      <div className="text-center py-4">
                        <div className="text-4xl font-black num-black text-[var(--text-primary)] tracking-tight">{avgOverall}</div>
                        <div className="flex items-center justify-center gap-0.5 mt-1 text-amber-500">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} size={15} className={i < Math.round(Number(avgOverall) || 0) ? "fill-amber-500 text-amber-500" : "text-gray-200"} />
                          ))}
                        </div>
                        <p className="text-[10px] text-gray-500 mt-1.5 font-bold">{totalReviewsCount > 0 ? `Based on ${totalReviewsCount} brand review${totalReviewsCount === 1 ? "" : "s"}` : "No brand reviews yet"}</p>{/* v332 */}
                      </div>

                      <div className="space-y-3.5 mt-4 border-t border-gray-100 pt-4">
                        <div>
                          <div className="flex justify-between text-xs font-bold text-gray-700 mb-1">
                            <span>Communication</span>
                            <span className="font-black text-[var(--violet)]">{avgComm === "—" ? "—" : `${avgComm}/5`}</span>
                          </div>
                          <div className="w-full bg-gray-100 h-1 rounded-full overflow-hidden">
                            <div className="bg-[var(--violet)] h-full" style={{ width: `${(Number(avgComm) || 0) * 20}%` }} />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-xs font-bold text-gray-700 mb-1">
                            <span>Timeliness</span>
                            <span className="font-black text-[var(--violet)]">{avgTime === "—" ? "—" : `${avgTime}/5`}</span>
                          </div>
                          <div className="w-full bg-gray-100 h-1 rounded-full overflow-hidden">
                            <div className="bg-[var(--violet)] h-full" style={{ width: `${(Number(avgTime) || 0) * 20}%` }} />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-xs font-bold text-gray-700 mb-1">
                            <span>Quality of Content</span>
                            <span className="font-black text-[var(--violet)]">{avgQual === "—" ? "—" : `${avgQual}/5`}</span>
                          </div>
                          <div className="w-full bg-gray-100 h-1 rounded-full overflow-hidden">
                            <div className="bg-[var(--violet)] h-full" style={{ width: `${(Number(avgQual) || 0) * 20}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Left Review Panel Trigger */}
                    {user?.role === "brand" && !showReviewForm && (
                      <button
                        onClick={() => setShowReviewForm(true)}
                        className="w-full py-3 bg-[#F5F0FF] hover:bg-[#DDD6FE] text-[var(--violet)] font-black border border-[#DDD6FE] rounded-2xl text-xs transition duration-200 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <PlusCircle size={14} /> Submit a review
                      </button>
                    )}
                  </div>

                  {/* Reviews List / Submission Form */}
                  <div className="lg:col-span-2 space-y-4">
                    {showReviewForm ? (
                      <form onSubmit={handleSubmitReview} className="bg-white border border-[#E5E5EA] rounded-3xl p-6 shadow-xs space-y-4 animate-in fade-in duration-200">
                        <div className="flex justify-between items-center mb-1">
                          <h3 className="text-xs font-black text-[var(--text-secondary)] uppercase tracking-widest">Write a partner review</h3>
                          <button type="button" onClick={() => setShowReviewForm(false)} aria-label="Close review form" /* v330 */ className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 rounded-lg text-gray-500 hover:text-black">
                            <X size={16} />
                          </button>
                        </div>

                        {/* Interactive Star Selection */}
                        <div>
                          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5">
                            Campaign Rating (1 to 5 Stars)
                          </label>
                          <div className="flex items-center gap-1.5 py-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setRating(star)}
                                aria-label={`${star} star${star > 1 ? "s" : ""}`} /* v330 */
                                aria-pressed={star <= rating}
                                className="p-1.5 hover:scale-110 transition duration-150 cursor-pointer"
                              >
                                <Star
                                  size={24}
                                  className={star <= rating ? "fill-amber-500 text-amber-500" : "text-gray-300"}
                                />
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">
                            Review Comment / Feedback
                          </label>
                          <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            rows={3}
                            required
                            className="w-full bg-[var(--bg-elevated)] border border-gray-200 rounded-xl p-3 text-base md:text-xs text-[var(--text-primary)] focus:border-[var(--violet)] outline-none" /* v332: 16px on phones so iOS doesn't zoom */
                            placeholder="Share your experience working with this creator..."
                          />
                        </div>

                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => setShowReviewForm(false)}
                            className="px-4 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 rounded-lg transition"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={submittingReview}
                            className="disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white text-xs font-bold rounded-lg transition"
                          >
                            {submittingReview ? <ButtonSpinner label="Submitting…" /> : "Submit Review"}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        {loadingReviews ? (
                          <div className="bg-white border border-[#E5E5EA] rounded-3xl p-10 text-center text-xs text-gray-500">
                            Loading reviews…
                          </div>
                        ) : reviews.length > 0 ? (
                          reviews?.map((r, idx) => (
                            <div key={`${r.review_id || r.id || "rev"}-${idx}`} className="bg-white border border-[#E5E5EA] rounded-3xl p-5 shadow-xs space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                  <ReviewBrandAvatar 
                                    src={r.brand_picture || r.brand_logo || r.logo || r.company_logo} 
                                    name={r.brand_name || "Brand Partner"} 
                                  />
                                  <div>
                                    <h4 className="font-extrabold text-xs text-gray-900">{r.brand_name || "Brand Partner"}</h4>
                                    {/* v332: no date at all rather than today's date when the review has none */}
                                    {r.created_at && !Number.isNaN(new Date(r.created_at).getTime()) && <p className="text-[11px] text-gray-500">{new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) /* v330: en-IN, IST */}</p>}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-full text-[10px] font-black text-amber-700 shadow-xs">
                                  <Star size={11} className="fill-amber-500 text-amber-500" /> {r.rating || r.overall_rating || "—"}
                                </div>
                              </div>

                              {/* Session 58: no made-up quote when the brand left no comment */}
                              {(r.comment || r.review_text) && <p className="text-xs text-gray-700 leading-relaxed font-semibold px-4 max-w-full overflow-hidden break-words">
                                "{r.comment || r.review_text}"
                              </p>}
                            </div>
                          ))
                        ) : (
                          <div className="bg-white border border-[#E5E5EA] rounded-3xl p-10 text-center space-y-2">
                            <Star size={28} className="text-gray-300 mx-auto" />
                            <h4 className="font-bold text-sm text-[var(--text-primary)]">No reviews yet</h4>
                            <p className="text-xs text-gray-500">Reviews appear here after brands complete a collaboration with this creator.</p>
                            {user?.role === "brand" && (
                              <button
                                onClick={() => setShowReviewForm(true)}
                                className="px-4 py-2 bg-[#F5F0FF] hover:bg-[#DDD6FE] text-[var(--violet)] border border-[#DDD6FE] rounded-xl text-xs font-bold transition mx-auto mt-2"
                              >
                                Write a review
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Match tab — session 31: real score from the brand's own data (src/lib/creatorMatch.js) */}
              {activeTab === "AI Match" && (
                <div className="max-w-2xl mx-auto space-y-6">
                  <div className="bg-white border border-[#E5E5EA] rounded-3xl p-8 shadow-xs font-sans">
                    {!isBrandViewer ? (
                      <p className="text-sm text-gray-500 font-semibold text-center">The match score is shown to brands. It compares this creator with the brand's own campaigns.</p>
                    ) : !brandMatchData ? (
                      <p className="text-sm text-gray-500 font-semibold text-center">Checking your campaigns…</p>
                    ) : !match ? (
                      <div className="text-center space-y-2">
                        <h3 className="font-extrabold text-lg text-[var(--text-primary)]">Not enough data for a match score</h3>
                        <p className="text-sm text-gray-500 font-semibold max-w-md mx-auto">Add your industry in your brand profile, or create a campaign with categories, platforms and a budget. The score is built from those.</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="flex items-center gap-5">
                          <div className="w-20 h-20 rounded-full bg-[#F5F0FF] flex items-center justify-center shrink-0">
                            <span className="text-2xl font-black text-[var(--violet)]" data-testid="match-score">{match.score}%</span>
                          </div>
                          <div>
                            <h3 className="font-extrabold text-lg text-[var(--text-primary)]">Match with your brand</h3>
                            <p className="text-sm text-gray-600 font-semibold mt-0.5" data-testid="match-reason">{match.reason}</p>
                          </div>
                        </div>
                        <ul className="space-y-3">
                          {match.parts.map((p) => (
                            <li key={p.key}>
                              <div className="flex justify-between text-xs font-bold text-gray-600 mb-1">
                                <span>{({ category: "Category", platform: "Platform", budget: "Budget", location: "Location" })[p.key]} · {p.label}</span>
                                <span>{Math.round(p.value * 100)}%</span>
                              </div>
                              <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-[var(--violet)] h-full rounded-full" style={{ width: `${Math.round(p.value * 100)}%` }} />
                              </div>
                            </li>
                          ))}
                        </ul>
                        {match.parts.length < 4 && (
                          <p className="text-[11px] text-gray-500 font-semibold">
                            Not counted (no data): {["category", "platform", "budget", "location"].filter((k) => !match.parts.some((p) => p.key === k)).join(", ")}.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* v334: App Store 1.2 — a way to report a profile (existing POST /reports) */}
      <div className="flex justify-center mt-8 px-4"><div className="flex items-center gap-4"><ReportUserLink targetId={c.user_id} kind="creator" name={c.name} /><BlockUserButton targetId={c.user_id} name={c.name} /></div></div>
      </>)}

      {/* v363: phones (photo-led) — invite sheet prefilled from the brand's own live campaigns, as the old phone page did */}
      <Presence>{photoLed && showInviteModal && c && (
        <InviteToCampaignModal key="invitetocampaignmodal"
          isOpen={showInviteModal}
          creator={c}
          campaigns={myCampaigns}
          campaignsError={myCampaignsError} /* v344 */
          onRetryCampaigns={loadMyCampaigns}
          onCreateCampaign={() => navigate("/brand/campaigns/create")}
          onClose={() => setShowInviteModal(false)}
        />
      )}</Presence>

      {/* Campaign Invite Modal */}
      <Presence>{!photoLed && showInviteModal && c && (
        <InviteToCampaignModal key="invitetocampaignmodal2"
          isOpen={showInviteModal}
          creator={c}
          campaigns={myCampaigns} /* v416 (C7): desktop can link the invite to a campaign too */
          campaignsError={myCampaignsError}
          onRetryCampaigns={loadMyCampaigns}
          onClose={() => setShowInviteModal(false)}
        />
      )}</Presence>

    </div>
  );
}

function GateOverlay() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t from-[#FAFAFA] via-[#FAFAFA]/95 to-transparent p-6 text-center z-20">
      <div className="bg-white border border-[#E5E5EA] p-8 rounded-3xl shadow-2xl max-w-md w-full mx-4 backdrop-blur-md">
        {/* ⚡ 100% Free Badge */}
        <div className="mb-4 inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3.5 py-1.5 mx-auto shadow-sm">
          ⚡ 100% Free Forever — No Card Required
        </div>
        
        <h3 className="font-sans text-xl font-extrabold mb-2 text-gray-900 leading-tight">
          Sign in or register to see full details
        </h3>
        
        <p className="text-xs text-gray-500 mb-6 leading-relaxed">
          Every creator detail, every campaign, every deal — completely free to access. We don't ask for your card, ever.
        </p>

        <div className="flex gap-3 justify-center mb-6">
          <Link 
            to="/login"
            className="bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-black py-2.5 px-6 rounded-xl text-xs font-bold transition duration-200"
          >
            Sign In
          </Link>
          <Link 
            to="/signup"
            className="bg-[var(--violet)] text-white hover:bg-[var(--violet-hover)] py-2.5 px-6 rounded-xl text-xs font-bold shadow-lg shadow-[var(--violet)]/20 transition duration-200"
          >
            Register
          </Link>
        </div>

        <p className="text-[11px] text-gray-500 leading-relaxed border-t border-gray-100 pt-4 font-semibold">
          {/* v332: no hard-coded "80+ creators" number */}
          Creators across India already find brand deals on Ybex — for free.
        </p>
      </div>
    </div>
  );
}
