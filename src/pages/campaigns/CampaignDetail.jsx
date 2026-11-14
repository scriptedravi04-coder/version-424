import useIsMobile from "../../hooks/useIsMobile";
import CampaignDetailMobile from "../../components/campaigns/mobile/CampaignDetailMobile";
import CampaignBriefExtras from "../../components/campaigns/CampaignBriefExtras";
import { DetailSkeleton } from "../../components/common/ContentSkeletons";
import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { useLoading } from "../../contexts/LoadingContext";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Send, X, Users, MapPin, Clock, CheckCircle, Share2, Check, Eye, IndianRupee, Megaphone, Package, ChevronRight, CheckCircle2, MessageSquare, ArrowRight } from "lucide-react";
import BrandPublicProfileModal from "../../components/profile/BrandPublicProfileModal";
import AgencyBadge from "../../components/common/AgencyBadge";
import KycPromptModal from "../../components/common/KycPromptModal";
import { campaignStatsFor } from "../../utils/campaignStatsForViewer";
import { rateForDeliverables } from "../../utils/rateCardQuote";
import ButtonSpinner from "../../components/common/ButtonSpinner";
import { campaignBudgetText } from "../../components/campaigns/mobile/HomeCampaignCard"; // v415: shared budget rule

const getCreatorRequirementsString = (c) => {
  if (!c) return "";
  if (c.isUgc) {
    return "UGC Content Creators skilled in product demonstration videos.";
  }
  const niches = c.categories && c.categories.length > 0 ? c.categories.join(", ") : "Any Niche";
  const platforms = c.platforms && c.platforms.length > 0 ? c.platforms.join(" & ") : "Instagram";
  
  let reach = "";
  if (c.follower_min || c.follower_max) {
    const minK = c.follower_min ? `${c.follower_min >= 1000000 ? (c.follower_min/1000000) + 'M' : (c.follower_min/1000) + 'k'}` : "Any";
    const maxK = c.follower_max ? `${c.follower_max >= 1000000 ? (c.follower_max/1000000) + 'M' : (c.follower_max/1000) + 'k'}` : "";
    reach = maxK ? `${minK} - ${maxK} followers` : `${minK}+ followers`;
  } else {
    reach = ""; // Session 58 (bug hunt): no made-up "10k+ followers" requirement
  }

  // v416 (C15): "Any" / "All" / "Both" = no preference (it read "Any creators")
  const genderText = c.gender && !["both", "any", "all", "any gender"].includes(String(c.gender).toLowerCase()) ? `${c.gender} creators` : "Creators (Any Gender)";
  const langText = c.languages && c.languages.length > 0 ? `fluent in ${c.languages.join(", ")}` : "";
  const locText = c.location && !/^pan india$/i.test(c.location) ? `based in ${c.location}` : "";

  return `${niches} ${genderText} on ${platforms}${reach ? ` with ${reach}` : ""}${langText ? `, ${langText}` : ""}${locText ? ` ${locText}` : ""}.`.replace(/ ,/g, ',').replace(/\s+/g, ' ').trim();
};

// Session 58 (bug hunt): Apply / "Actively reviewing" showed on closed or paused campaigns (applying then failed).
const campaignClosed = (c) => Boolean(c?.closed_at || c?.applications_paused || ["completed", "closed", "cancelled", "rejected"].includes(String(c?.status || "").toLowerCase())
  || (c?.deadline && Date.parse(c.deadline) + 24 * 3600 * 1000 < Date.now())); // Session 58: past the deadline too (as on the phone)

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isKycApproved } = useAuth();
  const { startLoading, stopLoading } = useLoading();
  
  const [c, setC] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false); // Session 53: a dead link showed a skeleton forever
  // v344: who is looking — only creators get Apply / creator KYC; the owning brand gets "Manage applicants"
  const isCreatorViewer = user?.role === "creator";
  const myUserId = user?.user_id || user?.id;
  const isOwnCampaign = Boolean(user && !isCreatorViewer && myUserId && c && String(c.brand_user_id || c.brand_id || "") === String(myUserId));
  const [pitch, setPitch] = useState("");
  const [amount, setAmount] = useState("");
  // Session 40 (Ravi OK): brand track record + quote from the creator's rate card.
  const [campaignsDone, setCampaignsDone] = useState(null);
  const [quoteFromRateCard, setQuoteFromRateCard] = useState(false);
  const [amountTouched, setAmountTouched] = useState(false);
  const [showBrandProfileModal, setShowBrandProfileModal] = useState(false);
  const [showKycPrompt, setShowKycPrompt] = useState(false);
  
  const [applying, setApplying] = useState(false);
  // Not yet wired to an endpoint — see the Re-Collaborate block below.
  const leaderboard = null;
  // v415: "Predictive AI ROI" removed from the owner's sidebar — it ran with no creators, so every number was a
  // made-up default (5,000 followers each, formula ROI).
  const [logoFailed, setLogoFailed] = useState(false); // v415: broken logo showed the alt text "brand"

  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applicationSent, setApplicationSent] = useState(false);
  const isMobile = useIsMobile();
  const [creatorProfile, setCreatorProfile] = useState(null);
  const [myApplication, setMyApplication] = useState(null);
  const [showApplicationDetailsModal, setShowApplicationDetailsModal] = useState(false);

  // New Contract Workflow States
  const [creatorName, setCreatorName] = useState("");
  // Session 41 (Ravi): no demo values. Location comes from the creator's own profile, the due date
  // from the campaign deadline; when either is missing we send nothing and show nothing.
  const [creatorLocation, setCreatorLocation] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressStep, setProgressStep] = useState(0);

  useEffect(() => {
    if (user && user.role === 'creator') {
      api.get(`/creators/${user.user_id}`)
        .then(({ data }) => {
          setCreatorProfile(data);
          const city = data?.city || data?.location || "";
          setCreatorLocation(typeof city === "string" ? city.trim() : "");
        })
        .catch((e) => console.warn('Failed to load creator profile', e));
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      setCreatorName(user.name || user.full_name || ""); // v353: undefined made "Send application" crash on .trim()
    }
  }, [user]);

  // v353: account with no name (some Google sign-ups) → use the profile name.
  useEffect(() => {
    const pn = creatorProfile?.name || creatorProfile?.full_name;
    if (pn) setCreatorName((n) => (String(n || "").trim() ? n : pn));
  }, [creatorProfile]);

  useEffect(() => {
    if (c) {
      // Only terms the brand actually wrote; no made-up text.
      setTermsAndConditions(c.terms_and_conditions || c.guidelines || "");
      setDueDate(c.deadline || c.content_deadline || "");
    }
  }, [c, id]);

  useEffect(() => {
    if (!c || !creatorProfile || myApplication || amountTouched) return;
    const rate = rateForDeliverables(creatorProfile, c.deliverables, c.platforms);
    if (rate > 0) {
      setAmount(String(rate));
      setQuoteFromRateCard(true);
    }
  }, [c, creatorProfile, myApplication, amountTouched]);

  const isCategoryMatched = () => {
    if (!user || user.role !== "creator" || !creatorProfile || !c) return true;
    
    const subCats = Array.isArray(creatorProfile.sub_categories) ? creatorProfile.sub_categories : [];
    // v353: content_niches can be an array — flatten + String() so "Apply now" never throws.
    const rawNiches = [
      creatorProfile.category,
      creatorProfile.primary_niche,
      creatorProfile.content_niches,
      ...subCats
    ].flat().filter(Boolean).map(n => String(n).toLowerCase().trim()).filter(Boolean);
    // De-duplicate — category/primary_niche can legitimately hold the same
    // value, and we don't want that to show up twice in the match list.
    const creatorNiches = [...new Set(rawNiches)];

    if (creatorNiches.length === 0) return false;

    const campCategories = [].concat(c.categories || []).filter(Boolean).map(cat => String(cat).toLowerCase().trim()); // v353
    if (campCategories.length === 0) return true;

    const getKeywords = (str) => {
      return str
        .replace(/[&,]/g, " ")
        .split(/\s+/)
        .map(w => w.trim())
        .filter(w => w.length > 2 && w !== "and" && w !== "the" && w !== "for" && w !== "with");
    };

    const creatorKeywords = creatorNiches.flatMap(getKeywords);
    const campKeywords = campCategories.flatMap(getKeywords);

    const hasKeywordOverlap = campKeywords.some(campWord => 
      creatorKeywords.some(creatorWord => 
        creatorWord.includes(campWord) || campWord.includes(creatorWord)
      )
    );

    if (hasKeywordOverlap) return true;

    return campCategories.some(campCat => 
      creatorNiches.some(creatorNiche => 
        creatorNiche.includes(campCat) || campCat.includes(creatorNiche)
      )
    );
  };

  const onApplyClick = () => {
    if (!user) {
      toast.error("Please login to apply");
      navigate("/login?role=creator");
      return;
    }
    // v344: brands / agencies / admin never get the creator apply flow or the creator KYC prompt
    if (!isCreatorViewer) {
      if (isOwnCampaign) navigate(`/brand/campaigns/${id}/applicants`);
      else toast.error("Only creators can apply to campaigns.");
      return;
    }
    if (!isKycApproved) {
      setShowKycPrompt(true);
      return;
    }
    if (!isCategoryMatched()) {
      const campCatsStr = [].concat(c.categories || []).join(", ");
      const creatorCatsStr = [...new Set([creatorProfile?.category, creatorProfile?.primary_niche, creatorProfile?.content_niches].flat().filter(Boolean).map((x) => String(x).trim()))].join(", "); // v419: "Comedy & Memes, Comedy & Memes"
      // v353: no niche set → "()" in the message and no way forward. Tell them what to do.
      if (!creatorCatsStr) {
        toast.error("Add your niche in Profile to apply to campaigns.", { action: { label: "Open profile", onClick: () => navigate("/profile") } });
      } else {
        toast.error(`This campaign is for ${campCatsStr} creators. Your niche is ${creatorCatsStr}, so you can't apply to this one.`);
      }
      return;
    }
    setApplyModalOpen(true);
  };

  const loadCampaignData = () => {
    api.get(`/campaigns/${id}`)
      .then(({ data }) => {
        if (!data) {
          setLoadFailed("missing"); // v332: was a toast + a skeleton that never ended
          return;
        }
        const camp = {
          ...data,
          title: data.title || "Campaign",
          brand_name: data.brand_name || "Brand Partner",
          brand_logo: data.brand_logo || "",
          categories: Array.isArray(data.categories) ? data.categories : (data.category ? [data.category] : ["General"]),
          budget_min: data.budget_min !== undefined ? data.budget_min : 0,
          budget_max: data.budget_max !== undefined ? data.budget_max : 0,
          deliverables: Array.isArray(data.deliverables) && data.deliverables.length 
            ? data.deliverables 
            : (data.deliverables ? [data.deliverables] : []), // v332: no made-up "1 Dedicated Reel" — screens say "As per brief"
          brand_type: data.brand_type || (Array.isArray(data.categories) && data.categories[0]) || "Brand Partner",
          location: (Array.isArray(data.locations) && data.locations.length ? data.locations.join(", ") : "") || data.location || data.city || "", // Session 58: the saved locations; empty = anywhere
          description: data.description || "", // v332: no made-up brief text shown as the brand's own
          follower_min: data.follower_min,
          follower_max: data.follower_max,
          gender: data.gender || "Both",
          languages: data.languages || [],
          // Session 38: generated numbers for creators only; brands see real ones.
          views: campaignStatsFor(data, user).views,
          applied: campaignStatsFor(data, user).applied,
          creator_name: data.creator_name || "Marketing Manager",
          time_ago: data.time_ago || "Active"
        };
        setC(camp);
        if (data.my_application) {
          setMyApplication(data.my_application);
        }
        if (user && user.role === 'creator') {
          api.get("campaigns/my-applications").then(({ data: apps }) => {
            const list = Array.isArray(apps) ? apps : [];
            const found = list.find(a => String(a.campaign_id) === String(id) || String(a.id) === String(id));
            if (found) {
              setMyApplication(found);
            }
          }).catch(() => {});
        }
        setAmount(camp.budget_min ? String(camp.budget_min) : "");
        const brandUid = data.brand_user_id || data.brand_id;
        if (brandUid) {
          api.get(`/brands/${encodeURIComponent(brandUid)}/track-record`)
            .then(({ data: tr }) => setCampaignsDone(Number(tr?.campaigns_done) || 0))
            .catch(() => setCampaignsDone(null));
        }
      })
      .catch((err) => {
        console.error("Failed to load campaign:", err);
        // v332: only a real 404 says "isn't available"; a network / server blip gets "Try again" (no scary toast).
        setLoadFailed(err?.response?.status === 404 ? "missing" : "error");
      });
  };

  useEffect(() => {
    loadCampaignData();
  }, [id, user]);

  // v415: the owner saw "0" applied while the campaign had pitches (the detail answer has no applicant list) —
  // read the real count from the owner's applications list.
  useEffect(() => {
    if (!isOwnCampaign || !id) return undefined;
    let alive = true;
    api.get(`/campaigns/${id}/applications`)
      .then(({ data }) => { if (alive && Array.isArray(data)) setC((prev) => (prev ? { ...prev, applied: data.length } : prev)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [isOwnCampaign, id]);

  const isApplied = Boolean(myApplication || c?.has_applied);
  const isAccepted = Boolean(
    myApplication?.is_accepted || 
    String(myApplication?.status).toUpperCase() === 'ACCEPTED' || 
    myApplication?.deal || 
    myApplication?.thread_id
  );
  const chatThreadId = myApplication?.thread_id || (myApplication?.deal?.id ? myApplication.deal.id : null);

  const handleApply = async () => {
    if (!user) { toast.error("Please login to apply"); return; }
    if (!user.onboarded) { 
      toast.error("Please complete your onboarding to apply for campaigns."); 
      window.location.href = "/onboarding";
      return; 
    }
    if (!isCategoryMatched()) {
      toast.error("Your content category does not match this campaign's target categories.");
      return;
    }
    if (user.role !== "creator") { toast.error("Only creators can apply"); return; }
    if (!amount || Number(amount) < 100) { toast.error("Please enter a valid rate estimate"); return; }
    // v417: same ₹3,000 minimum the server uses for a paid campaign quote (barter / open 0-budget exempt)
    if (!(/barter/i.test(String(c?.collab_mode || "")) || c?.is_barter === true || (!Number(c?.budget_min) && !Number(c?.budget_max))) && Number(amount) < 3000) {
      toast.error("The minimum quote is ₹3,000."); return;
    }
    if (pitch.length < 20) { toast.error("Please write a meaningful pitch (min 20 characters)"); return; }
    if (!String(creatorName || "").trim()) { toast.error("Please add your display name"); return; } // v353: never crash on a missing name

    setApplying(true);
    try {
      // 1. Post application to backend
      const { data } = await api.post("campaigns/apply", { 
        campaign_id: id, 
        proposed_amount: Number(amount), 
        pitch,
        creator_name: creatorName,
        creator_location: creatorLocation || null,
        due_date: dueDate || null,
        terms_and_conditions: termsAndConditions || null
      });

      const activeThreadId = data?.thread_id;
      setMyApplication({
        campaign_id: id,
        proposed_amount: Number(amount),
        pitch,
        creator_name: creatorName,
        creator_location: creatorLocation,
        due_date: dueDate,
        terms_and_conditions: termsAndConditions,
        status: "PENDING",
        is_accepted: false,
        thread_id: activeThreadId || null,
        applied_at: new Date().toISOString()
      });
      setApplyModalOpen(false);
      
      // Mobile shows the "Application sent" screen (design C04) — no toast on top of it (v426: it covered the ✓);
      // desktop goes to Applications with the toast.
      if (isMobile) setApplicationSent(true);
      else { toast.success("Application sent! You'll see it under Deals → Applications as Pending."); navigate("/collabs?tab=applications"); }


    } catch (e) { 
      const errData = e.response?.data;
      const errMsg = errData?.error?.message || errData?.error || errData?.detail || "Application failed.";
      const msgStr = typeof errMsg === 'string' ? errMsg : "Application failed.";
      if (msgStr.toLowerCase().includes("kyc") || msgStr.toLowerCase().includes("verification")) {
        setShowKycPrompt(true);
      } else {
        toast.error(msgStr);
      }
    } finally { 
      setApplying(false); 
    }
  };

  if (!c && loadFailed) {
    const blip = loadFailed === "error";
    return (
      <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>{blip ? "Couldn't load this campaign" : "This campaign isn't available"}</div>
        <div style={{ fontSize: 14, opacity: 0.7 }}>{blip ? "Check your connection and try again." : "It may have been closed or removed."}</div>
        {blip && <button type="button" onClick={() => { setLoadFailed(false); loadCampaignData(); }} style={{ height: 44, padding: "0 20px", borderRadius: 22, border: "1px solid #E5E5EA", background: "#fff", color: "#111", fontWeight: 700, cursor: "pointer" }}>Try again</button>}
        <button type="button" onClick={() => ((window.history.state?.idx > 0) ? navigate(-1) : navigate("/campaigns"))} style={{ height: 44, padding: "0 20px", borderRadius: 22, border: "none", background: "#7C3AED", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Go back</button>
      </div>
    );
  }
  if (!c) return <DetailSkeleton label="Loading campaign" />;

  // Session 23: creator mobile design C02–C04. Same state + handlers as desktop.
  if (isMobile) {
    return (
      <>
        <CampaignDetailMobile
          c={c}
          isApplied={isApplied}
          isAccepted={isAccepted}
          chatThreadId={chatThreadId}
          myApplication={myApplication}
          amount={amount}
          setAmount={(v) => { setAmount(v); setAmountTouched(true); setQuoteFromRateCard(false); }}
          quoteFromRateCard={quoteFromRateCard}
          campaignsDone={campaignsDone}
          pitch={pitch}
          setPitch={setPitch}
          applying={applying}
          applyModalOpen={applyModalOpen}
          setApplyModalOpen={setApplyModalOpen}
          onApplyClick={onApplyClick}
          handleApply={handleApply}
          applicationSent={applicationSent}
          onBack={() => ((window.history.state?.idx > 0) ? navigate(-1) : navigate("/campaigns"))}
          onOpenChat={(tid) => navigate(tid ? `/chat/${tid}` : "/chat")}
          onViewApplications={() => navigate("/deals?tab=applications")}
          onBrowseMore={() => navigate("/campaigns", { replace: true })}
        />
        {isCreatorViewer && <KycPromptModal isOpen={showKycPrompt} onClose={() => setShowKycPrompt(false)} role="creator" actionType="apply_campaign" />}{/* v344: creators only */}
      </>
    );
  }

  return (
    <div className="w-full max-w-none bg-[var(--bg-base)] text-[var(--text-primary)] min-h-screen" data-testid="campaign-detail">
      
      {/* Back button */}
      <div className="mb-6 flex items-center justify-between">
        <button onClick={() => (isOwnCampaign ? navigate("/brand/campaigns") : (window.history.state?.idx > 0) ? navigate(-1) : navigate("/campaigns"))} className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 font-semibold transition-colors">
          <ArrowLeft size={16} /> {isOwnCampaign ? "Back to My Campaigns" : "Back to campaigns"}{/* v416 (C15): the owner isn't browsing listings */}
        </button>
        <div className="flex items-center gap-2">
          <button onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); toast.success("Link copied!"); } catch { toast.error("Couldn't copy — copy the address bar link"); } } /* Session 58: it never copied anything */} aria-label="Copy campaign link" /* v330 */ className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:bg-[var(--bg-card)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <Share2 size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Details (Left Col) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl p-6 sm:p-8 shadow-sm">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-[var(--border-default)]">
              <div 
                onClick={() => setShowBrandProfileModal(true)}
                className="flex gap-4 items-center cursor-pointer group"
                title="View Brand Profile"
              >
                  <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white border border-[var(--border-default)] shrink-0 group-hover:border-[var(--violet)] transition-colors p-1 flex items-center justify-center shadow-xs">
                    {c.brand_logo && !logoFailed ? (
                      <img src={c.brand_logo} alt="" onError={() => setLogoFailed(true)} className="w-full h-full object-contain rounded-xl" />
                    ) : (
                      <span className="w-full h-full rounded-xl bg-[var(--violet)]/10 text-[var(--violet)] font-black text-xl flex items-center justify-center" aria-hidden="true">{String(c.brand_name || "B").trim().charAt(0).toUpperCase()}</span>
                    )}{/* v415: initial instead of a broken image / third-party avatar */}
                  </div>
                  <div>
                    <h1 className="font-display font-black text-2xl sm:text-3xl text-[var(--text-primary)] group-hover:text-[var(--violet)] transition-colors tracking-tight leading-snug">
                      {c.title}
                    </h1>
                    <p className="text-sm font-bold text-[var(--text-secondary)] mt-1 flex items-center gap-2 flex-wrap">
                      <span>by <span className="text-[var(--text-primary)] font-extrabold underline underline-offset-2 decoration-[var(--violet)]/40 group-hover:decoration-[var(--violet)]">{c.brand_name || "Brand Partner"}</span></span>
                      <CheckCircle size={15} className="text-emerald-500 shrink-0" />
                      {(c.is_agency || c.brand_is_agency) && (
                        <AgencyBadge size="xs" />
                      )}
                      {campaignsDone > 0 && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="text-xs text-[var(--text-tertiary)] font-semibold">{campaignsDone} {campaignsDone === 1 ? "campaign" : "campaigns"} done</span>
                        </>
                      )}
                      <span className="text-slate-300">•</span>
                      <span className="text-xs text-[var(--text-tertiary)] font-semibold">{c.time_ago || "Active"}</span>
                    </p>
                  </div>
              </div>
            </div>

            {campaignClosed(c) ? (
              <div className="flex items-center gap-2 text-sm font-bold text-gray-500 mb-6 bg-gray-500/10 w-fit px-4 py-2 rounded-xl border border-gray-500/20">
                Applications closed{/* Session 58: closed / paused campaigns said "Actively reviewing" */}
              </div>
            ) : (
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-500 mb-6 bg-emerald-500/10 w-fit px-4 py-2 rounded-xl border border-emerald-500/20">
              <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <CheckCircle size={18} />
              </motion.div>
              Actively reviewing
            </div>
            )}

            <div className="mb-8">
              <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Looking for</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {c.categories?.map((cat, i) => (
                  <span key={i} className="px-4 py-1.5 bg-[var(--violet)]/10 text-[var(--violet)] border border-[var(--violet)]/20 rounded-xl text-sm font-bold">
                    {cat}
                  </span>
                ))}
              </div>
              <p className="text-sm text-[var(--text-primary)] leading-relaxed mt-2 font-medium">
                {getCreatorRequirementsString(c)}
              </p>
            </div>

            {/* Grid details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <motion.div whileHover={{ y: -2 }} className="flex items-start gap-4 p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] transition-colors hover:border-[var(--violet)]/30">
                  <div className="w-10 h-10 rounded-xl bg-[var(--bg-base)] border border-[var(--border-default)] flex items-center justify-center text-[var(--violet)] shrink-0">
                    <IndianRupee size={18}/>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-tertiary)] font-bold uppercase tracking-wider mb-1">Per creator</p>
                    <p className="font-bold text-[var(--text-primary)] text-sm">{!Number(c.budget_min) && !Number(c.budget_max) ? "Open budget" /* v332: was "₹0 +" */ : campaignBudgetText(c) /* v415: "Up to ₹5,000" when min is 0 */}</p>
                  </div>
              </motion.div>
              
              <motion.div whileHover={{ y: -2 }} className="flex items-start gap-4 p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] transition-colors hover:border-[var(--violet)]/30">
                  <div className="w-10 h-10 rounded-xl bg-[var(--bg-base)] border border-[var(--border-default)] flex items-center justify-center text-[var(--violet)] shrink-0">
                    <Megaphone size={18}/>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-tertiary)] font-bold uppercase tracking-wider mb-1">Platforms</p>{/* v416 (C15): was "Brand Type" */}
                    <p className="font-bold text-[var(--text-primary)] text-sm">{Array.isArray(c.platforms) && c.platforms.length ? c.platforms.join(", ") : "Instagram"}</p>
                  </div>
              </motion.div>

              <motion.div whileHover={{ y: -2 }} className="flex items-start gap-4 p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] transition-colors hover:border-[var(--violet)]/30">
                  <div className="w-10 h-10 rounded-xl bg-[var(--bg-base)] border border-[var(--border-default)] flex items-center justify-center text-[var(--violet)] shrink-0">
                    <MapPin size={18}/>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-tertiary)] font-bold uppercase tracking-wider mb-1">Location</p>
                    <p className="font-bold text-[var(--text-primary)] text-sm">{c.location || "Pan India" /* v332: was blank */}</p>
                  </div>
              </motion.div>

              <motion.div whileHover={{ y: -2 }} className="flex items-start gap-4 p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] transition-colors hover:border-[var(--violet)]/30">
                  <div className="w-10 h-10 rounded-xl bg-[var(--bg-base)] border border-[var(--border-default)] flex items-center justify-center text-[var(--violet)] shrink-0">
                    <Package size={18}/>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-tertiary)] font-bold uppercase tracking-wider mb-1">Deliverables</p>
                    <div className="font-bold text-[var(--text-primary)] text-sm">
                        {c.deliverables?.length ? c.deliverables.map((d, i) => (
                          <div key={i} className="mb-2 whitespace-pre-wrap">{typeof d === "string" ? d : d?.label || d?.type || ""}</div>
                        )) : "As per brief" /* v332: empty box / "[object Object]" */}
                    </div>
                  </div>
              </motion.div>

              {c.deadline && !Number.isNaN(Date.parse(c.deadline)) && ( /* v416 (C15): desktop showed no close date */
              <motion.div whileHover={{ y: -2 }} className="flex items-start gap-4 p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)] transition-colors hover:border-[var(--violet)]/30">
                  <div className="w-10 h-10 rounded-xl bg-[var(--bg-base)] border border-[var(--border-default)] flex items-center justify-center text-[var(--violet)] shrink-0">
                    <Clock size={18}/>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-tertiary)] font-bold uppercase tracking-wider mb-1">Applications close</p>
                    <p className="font-bold text-[var(--text-primary)] text-sm">{new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(c.deadline)) ? `${c.deadline}T00:00:00+05:30` : c.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}</p>
                  </div>
              </motion.div>
              )}
            </div>

            {/* Description Body */}
            <div>
              <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-4">Brief Details</p>
              <div className="text-sm text-[var(--text-primary)] leading-relaxed space-y-4 bg-[var(--bg-elevated)] p-6 rounded-2xl border border-[var(--border-default)]">
                  <p><strong>Creators, it's a match!</strong></p>
                  <p className="whitespace-pre-wrap">{c.description}</p>
                  <CampaignBriefExtras campaign={c} />
              </div>
            </div>

            {/* Re-Collaborate Smart Recommendation.
                `leaderboard` was referenced here but never declared anywhere in this file,
                so every brand opening this page threw a ReferenceError and lost the whole
                screen. Declared as null until the data source is actually wired up — the
                block then renders nothing, which is what it was meant to do with no data. */}
            {user?.role === "brand" && leaderboard?.filter(item => item.performance_score > 85).map((topCreator, idx) => {
              const deliveryPercent = Math.round((topCreator.delivered_reach / topCreator.promised_reach) * 100);
              return (
                <div key={idx} className="bg-gradient-to-r from-[#7C3AED]/10 to-[#7C3AED]/10 border border-[var(--violet)]/30 rounded-3xl p-6 relative overflow-hidden mt-6 shadow-sm">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--violet)]/10 blur-3xl rounded-full" />
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-[var(--violet)]/10 text-[var(--violet)] rounded-xl flex items-center justify-center shrink-0">
                      
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-[var(--violet)] uppercase tracking-wider mb-1">
                        AI Re-Collaborate Recommendation
                      </h4>
                      <p className="text-sm font-bold text-gray-800 leading-relaxed">
                        Re-Collaborate Suggestion: <span className="text-[var(--violet)]">{topCreator.creator_name}</span> exceeded expectations by delivering <span className="text-emerald-600 font-extrabold">{deliveryPercent}%</span> of promised reach on-time!
                      </p>
                      <button 
                        onClick={() => {
                          toast.success(`Opening direct chat with ${topCreator.creator_name} to offer a premium contract extension...`);
                          navigate(`/chat/${topCreator.creator_id}`);
                        }}
                        className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--violet)] hover:text-[var(--violet-hover)] font-black uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Extend sponsorship deal <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar (Right Col) */}
        <div className="space-y-6">
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl p-6 shadow-sm sticky top-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-[var(--text-primary)]">
                  {isOwnCampaign ? "Your campaign" : !isCreatorViewer ? "Campaign" : isApplied ? "Already Applied" : "Apply to Campaign"}{/* v358: a brand isn't asked to apply */}
                </h3>
                {isApplied && (
                  <span className="relative inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700/60 px-2.5 py-0.5 rounded-full overflow-hidden shadow-xs">
                    <Check size={11} className="stroke-[3]" /> Applied
                    <span className="absolute top-0 bottom-0 left-0 w-full bg-white opacity-40 animate-shine pointer-events-none"></span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold">
                {c.views != null && (
                <span className="text-[var(--text-secondary)] flex items-center gap-1.5" title="Views">
                  <Eye size={14} className="text-[var(--text-tertiary)] animate-eye-blink" />
                  {Number(c.views).toLocaleString("en-IN") /* v332 */}
                </span>
                )}
                <span className="text-[var(--text-secondary)] flex items-center gap-1.5" title="Applied">
                  <Users size={14} className="text-[var(--text-tertiary)]" />
                  {c.applied}
                </span>
              </div>
            </div>
  
            {/* v415: owner "Predictive AI ROI" card removed (made-up numbers) */}
            {user?.role === 'creator' ? (
              isApplied ? (
                <div className="space-y-4 mb-6">
                  {/* Status Banner */}
                  {isAccepted ? (
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl">
                      <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-sm">
                        <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>Application Accepted!</span>
                      </div>
                      <p className="text-xs text-emerald-600/90 dark:text-emerald-400/90 mt-1 leading-relaxed font-medium">
                        The brand has accepted your proposal. You can now chat directly and coordinate your deliverables.
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl">
                      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-sm">
                        <Clock size={16} className="text-amber-600 dark:text-amber-400 shrink-0 animate-pulse" />
                        <span>Application Under Review</span>
                      </div>
                      <p className="text-xs text-amber-700/90 dark:text-amber-400/90 mt-1 leading-relaxed font-medium">
                        Your pitch has been submitted. The brand is currently reviewing creator applications.
                      </p>
                    </div>
                  )}

                  {/* Two Buttons Row: Left is Already Applied, Right is Go to Chat OR See your Application */}
                  <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full">
                    {/* Left Button / Pill: Already Applied */}
                    <div className="relative flex-1 w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 font-bold uppercase tracking-wider text-xs sm:text-sm overflow-hidden shadow-xs select-none">
                      <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Already Applied</span>
                      <span className="absolute top-0 bottom-0 left-0 w-full bg-white opacity-40 animate-shine pointer-events-none"></span>
                    </div>

                    {/* Right Button */}
                    {isAccepted ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (chatThreadId) {
                            navigate(`/inbox?thread=${chatThreadId}`);
                          } else {
                            navigate("/inbox");
                          }
                        }}
                        className="flex-1 w-full bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-bold uppercase tracking-wider py-3 px-4 rounded-xl active:scale-95 transition-all shadow-[0_4px_15px_rgba(124,58,237,0.3)] text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <MessageSquare size={16} />
                        <span>Go to Chat</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowApplicationDetailsModal(true)}
                        className="flex-1 w-full bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-bold uppercase tracking-wider py-3 px-4 rounded-xl active:scale-95 transition-all shadow-[0_4px_15px_rgba(124,58,237,0.3)] text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Eye size={16} />
                        <span>See your Application</span>
                      </button>
                    )}
                  </div>

                  {/* Secondary Link: Go to Ongoing Deals / Go to Manage Orders */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => navigate("/collabs?tab=applications")}
                      className="w-full py-2.5 px-4 bg-[var(--bg-elevated)] hover:bg-[var(--border-default)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>Go to Ongoing Deals</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {!isCategoryMatched() && (
                    <div className="p-4 mb-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs text-rose-400 font-medium">
                      ⚠️ <strong>Category Mismatch</strong>
                      <p className="mt-1">
                        This campaign targets: <strong>{(c.categories || []).join(", ")}</strong>.
                      </p>
                      <p className="mt-1">
                        Your category is: <strong>{[...new Set([creatorProfile?.category, creatorProfile?.primary_niche, creatorProfile?.content_niches, ...(Array.isArray(creatorProfile?.sub_categories) ? creatorProfile.sub_categories : [])].filter(Boolean))].join(", ") || "None"}</strong>.
                      </p>
                    </div>
                  )}
                  {campaignClosed(c) ? (
                    <div className="w-full py-4 rounded-xl font-bold mb-6 text-center bg-[var(--bg-elevated)] text-[var(--text-tertiary)] border border-[var(--border-default)]">Applications are closed</div>
                  ) : (
                  <button 
                    onClick={onApplyClick}
                    className={`w-full py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 mb-6 ${
                      isCategoryMatched() 
                        ? "bg-[var(--violet)] text-white hover:bg-[#6b4aff]" 
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20 cursor-not-allowed opacity-80"
                    }`}
                  >
                    Apply Now 
                  </button>
                  )}
                </>
              )
            ) : isOwnCampaign ? ( /* v344: the brand's own campaign → manage applicants, not "apply" */
              <Link to={`/brand/campaigns/${id}/applicants`} className="w-full py-4 rounded-xl font-bold mb-6 bg-[var(--violet)] text-white hover:bg-[#6b4aff] transition-all flex items-center justify-center gap-2">
                <Users size={16} /> Manage applicants
              </Link>
            ) : user ? null /* v344: other brands / agencies / admin — no creator apply prompt */ : (
              <div className="p-5 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl mb-6 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
                <p className="text-sm font-medium text-[var(--text-secondary)]">Sign in as a creator to apply for this campaign.</p>
                <Link to="/login?role=creator" className="px-6 py-2.5 bg-[var(--violet)] text-white text-sm font-bold rounded-xl hover:bg-opacity-90 transition-all flex items-center justify-center gap-2">
                  Sign In to Apply
                </Link>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* See Your Application Modal */}
      <AnimatePresence>
        {showApplicationDetailsModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowApplicationDetailsModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[var(--bg-card)] border border-[var(--border-default)] w-full max-w-lg rounded-3xl p-6 sm:p-8 relative z-10 shadow-2xl overflow-y-auto max-h-[90vh] no-scrollbar"
            >
              <button 
                onClick={() => setShowApplicationDetailsModal(false)}
                aria-label="Close" /* v332: icon-only button */
                className="absolute top-6 right-6 p-2 rounded-full hover:bg-[var(--bg-elevated)] transition-colors text-[var(--text-secondary)] cursor-pointer"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700/60 px-2.5 py-0.5 rounded-full">
                  <Check size={12} className="stroke-[3]" /> Application Submitted
                </span>
              </div>

              <h3 className="text-xl font-bold text-[var(--text-primary)] mb-1">
                Your Application Pitch
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mb-6">
                Applied for <strong>{c.title}</strong> by <strong>{c.brand_name}</strong>
              </p>

              <div className="space-y-4">
                <div className="bg-[var(--bg-elevated)] p-4 rounded-2xl border border-[var(--border-default)]">
                  <div className="text-xs text-[var(--text-secondary)] mb-1 font-semibold">Application Status</div>
                  <div className="flex items-center gap-2">
                    {isAccepted ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 size={16} /> Shortlisted & Accepted
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                        <Clock size={16} /> Under Brand Review
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-[var(--bg-elevated)] p-4 rounded-2xl border border-[var(--border-default)]">
                  <div className="text-xs text-[var(--text-secondary)] mb-1 font-semibold">Your Proposed Compensation</div>
                  <div className="text-lg font-bold text-[var(--text-primary)]">
                        {/* v332: fell back to the campaign's budget, as if it were the creator's own quote */}
                    {Number(myApplication?.proposed_amount || amount) > 0 ? `₹${Number(myApplication?.proposed_amount || amount).toLocaleString('en-IN')}` : "—"}
                  </div>
                </div>

                <div className="bg-[var(--bg-elevated)] p-4 rounded-2xl border border-[var(--border-default)]">
                  <div className="text-xs text-[var(--text-secondary)] mb-1 font-semibold">Your Pitch / Proposal</div>
                  <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                    {myApplication?.pitch || pitch || ""}
                  </p>
                </div>

                {(myApplication?.terms_and_conditions || termsAndConditions) && (
                  <div className="bg-[var(--bg-elevated)] p-4 rounded-2xl border border-[var(--border-default)]">
                    <div className="text-xs text-[var(--text-secondary)] mb-1 font-semibold">Deliverables & Terms</div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      {myApplication?.terms_and_conditions || termsAndConditions}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-[var(--border-default)] flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setShowApplicationDetailsModal(false)}
                  className="flex-1 py-3 px-4 bg-[var(--bg-elevated)] hover:bg-[var(--border-default)] text-[var(--text-primary)] font-bold text-xs sm:text-sm rounded-xl transition-all cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowApplicationDetailsModal(false);
                    navigate("/collabs?tab=applications");
                  }}
                  className="flex-1 py-3 px-4 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Go to Ongoing Deals</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Application Modal */}
      <AnimatePresence>
        {applyModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setApplyModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[var(--bg-card)] border border-[var(--border-default)] w-full max-w-xl rounded-3xl p-6 sm:p-8 relative z-10 shadow-2xl overflow-y-auto max-h-[90vh] no-scrollbar"
            >
              <button 
                onClick={() => setApplyModalOpen(false)}
                aria-label="Close" /* v332: icon-only button */
                className="absolute top-6 right-6 p-2 rounded-full hover:bg-[var(--bg-elevated)] transition-colors text-[var(--text-secondary)]"
              >
                <X size={18} />
              </button>
              
              <h2 className="text-2xl font-display font-bold text-[var(--text-primary)] mb-1">Submit Application</h2>
              <p className="text-[var(--text-secondary)] text-xs mb-6">Complete the contract details to launch the ad and notify {c.brand_name}.</p>
              
              <div className="space-y-4">
                

                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] mb-1.5 block uppercase tracking-wider">Display Name *</label>
                    <input 
                      type="text" 
                      value={creatorName} 
                      onChange={(e) => setCreatorName(e.target.value)}
                      placeholder="Your name" /* v332: creators apply here — was "Your brand name" */
                      className="w-full px-4 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl text-xs focus:border-[var(--violet)] outline-none text-[var(--text-primary)] font-bold"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-[var(--text-secondary)] mb-1.5 block uppercase tracking-wider">Rate Estimate (₹) *</label>
                    <input 
                      type="number" 
                      value={amount} 
                      onChange={(e) => { setAmount(e.target.value); setAmountTouched(true); setQuoteFromRateCard(false); }}
                      placeholder="e.g. 5000"
                      className="w-full px-4 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl text-xs focus:border-[var(--violet)] outline-none text-[var(--text-primary)] font-bold"
                    />
                    {quoteFromRateCard && <p className="text-[10px] text-[var(--text-tertiary)] mt-1">From your rate card — change it if you like.</p>}
                  </div>
                </div>

                {/* Pitch fit */}
                <div>
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] mb-1.5 block uppercase tracking-wider">Why are you a fit? *</label>
                  <textarea 
                    rows={2}
                    value={pitch}
                    onChange={(e) => setPitch(e.target.value)}
                    placeholder="Briefly explain your vision and why your audience matches their needs..."
                    className="w-full px-4 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl text-xs focus:border-[var(--violet)] outline-none text-[var(--text-primary)] leading-relaxed resize-none"
                  />
                </div>

                <button 
                  onClick={handleApply}
                  disabled={applying}
                  className="w-full py-3.5 mt-2 rounded-xl font-bold bg-[var(--violet)] text-white hover:bg-[#6b4aff] transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-[#7C3AED]/10 cursor-pointer disabled:opacity-60 disabled:cursor-wait" /* v332: looked tappable while sending */
                >
                  {applying ? <ButtonSpinner label="Submitting application…" /> : <><Send size={16}/> Submit Application & Start Campaign</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Progress / Stepper Modal */}
      <AnimatePresence>
        {false && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 30 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="bg-[var(--bg-surface)] border border-[var(--border-strong)] w-full max-w-lg rounded-3xl p-6 sm:p-8 relative z-10 shadow-2xl text-[var(--text-primary)]"
            >
              <div className="flex flex-col items-center text-center mb-8">
                {/* Large Pulsing Ad Radar */}
                <div className="relative mb-6">
                  <motion.div 
                    animate={{ scale: [1, 1.25, 1], opacity: [0.15, 0.4, 0.15] }} 
                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                    className="absolute -inset-4 bg-[var(--violet)] rounded-full blur-xl"
                  />
                  <div className="relative w-20 h-20 bg-gradient-to-tr from-[var(--violet)] to-[#5B3EE0] rounded-2xl flex items-center justify-center shadow-xl border border-[var(--violet-border)]">
                    
                  </div>
                </div>

                <h3 className="text-xl font-display font-black tracking-tight text-[var(--text-primary)] mb-2">Processing Collaboration</h3>
                <p className="text-xs text-[var(--text-secondary)] max-w-sm">Please hold on while our automated campaign engine registers your ad and prompts the brand.</p>
              </div>

              {/* Progress Line Bar */}
              <div className="w-full bg-[var(--bg-elevated)] h-1.5 rounded-full mb-8 overflow-hidden">
                <motion.div 
                  initial={{ width: "0%" }} 
                  animate={{ width: `${(progressStep / 8) * 100}%` }}
                  transition={{ duration: 0.3 }}
                  className="h-full bg-gradient-to-r from-[var(--violet)] to-[#5B3EE0]"
                />
              </div>

              {/* Steps Checklist */}
              <div className="space-y-3.5 max-w-sm mx-auto">
                {[
                  { step: 0, label: "Bread campaign launched & verified" },
                  { step: 1, label: "Ad campaign saved in workspace" },
                  { step: 2, label: "Ad campaign marked in-progress" },
                  { step: 3, label: "Application submitted and processed" },
                  { step: 4, label: `Routing request to brand: ${c?.brand_name || "the brand"}` },
                  { step: 5, label: "Brand accepted and approved your request!" },
                  { step: 6, label: "Activating creator inbox dashboard" },
                  { step: 7, label: "AI compiled friendly contract using Gemini" }
                ].map((item) => {
                  const isActive = progressStep === item.step;
                  const isCompleted = progressStep > item.step;
                  
                  return (
                    <div 
                      key={item.step} 
                      className={`flex items-center gap-3 transition-all duration-300 ${
                        isCompleted ? "text-emerald-500" : isActive ? "text-[var(--violet)] font-bold scale-[1.02]" : "text-[var(--text-tertiary)]"
                      }`}
                    >
                      <div className="shrink-0">
                        {isCompleted ? (
                          <div className="w-5 h-5 bg-emerald-500/10 rounded-full border border-emerald-500 flex items-center justify-center text-emerald-500">
                            <Check size={12} strokeWidth={3} />
                          </div>
                        ) : isActive ? (
                          <div className="w-5 h-5 bg-[var(--violet-soft)] rounded-full border border-[var(--violet)] flex items-center justify-center text-[var(--violet)] animate-spin border-t-transparent" />
                        ) : (
                          <div className="w-5 h-5 bg-[var(--bg-elevated)] rounded-full border border-[var(--border-default)]" />
                        )}
                      </div>
                      <span className="text-xs">{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <BrandPublicProfileModal 
        isOpen={showBrandProfileModal} 
        onClose={() => setShowBrandProfileModal(false)} 
        brandUserId={c?.brand_user_id || c?.brand_id} 
        brandName={c?.brand_name} 
        brandLogo={c?.brand_logo} 
      />

      <KycPromptModal
        isOpen={showKycPrompt}
        onClose={() => setShowKycPrompt(false)}
        role="creator"
        actionType="apply_campaign"
      />
    </div>
  );
}
