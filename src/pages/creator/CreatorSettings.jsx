import React, { useState, useEffect } from "react";
import LegalPanel from "../../components/legal/LegalPanel";
// v334 (App Store 5.1.1(v) / Play): Account (incl. Delete account) + Help & support on desktop settings too
import AccountPanel from "../../components/account/AccountPanel";
import SupportContactCard from "../../components/help/SupportContactCard";
import { UserCog as AccountTabIcon, LifeBuoy as SupportTabIcon } from "lucide-react";
import useBusy from "../../lib/useBusy";
import ButtonSpinner from "../../components/common/ButtonSpinner";
import InstagramConnectCard from "../../components/instagram/InstagramConnectCard"; // v349
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../lib/api";
import { INDIAN_LANGUAGES, POPULAR_PROFESSIONS } from "../../lib/constants";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { User, Shield, Briefcase, Share2, Camera, Edit2, CheckCircle, LogOut, X, Mail, MonitorSmartphone, Loader2, FileText, FolderKanban, Video } from "lucide-react";
import VideoEmbedPreview from "../../components/shared/VideoEmbedPreview";
import { useLoading } from "../../contexts/LoadingContext";
import { LocationAutocomplete } from "../../components/ui/autocomplete";
import { FormattedNumberInput } from "../../components/ui/FormattedNumberInput";
import UniversalTagSearch from "../../components/shared/UniversalTagSearch";
import { parseDeviceName } from "../../utils/deviceParser";
import CreatorMobileProfile from "./CreatorMobileProfile";
import { FounderNoteDesktop } from "../../components/footer/FounderNote";
import { ignored } from "../../utils/ignored";

import { Presence, PopupBackdrop, PopupPanel } from "../../components/common/Popup";
import KycPanel from "./settingsDesktop/KycPanel";
import PastBrandsCard from "./settingsDesktop/PastBrandsCard";
import PlatformsPanel from "./settingsDesktop/PlatformsPanel";
import PortfolioList from "./settingsDesktop/PortfolioList";
import PortfolioScreen from "./profileScreens/PortfolioScreen"; // v367: phone-style portfolio on desktop (Diwali Challenge Join)
import { initialsAvatar } from "../../lib/initialsAvatar"; // v353
const safeParseItem = (p) => {
  if (typeof p === 'object' && p !== null) return p;
  if (typeof p === 'string') {
    try {
      const parsed = JSON.parse(p);
      if (typeof parsed === 'string') {
         try { return JSON.parse(parsed); } catch (e) { ignored("CreatorSettings:31", e); }
      }
      return parsed;
    } catch(e) {
      return p;
    }
  }
  return p;
};

const validateRate = (rate, reach, minRate) => {
  if (rate === "" || rate === 0) return null;
  if (rate < minRate) return { status: "error", message: `Minimum rate is ₹${minRate}` };
  if (reach > 0) {
    const suggested_rate = Math.round(reach * 0.30);
    if (rate <= suggested_rate * 1.10) {
      return { status: "success", message: "✅ Your charges look justified for your reach. Brands will find this competitive." };
    } else {
      return { status: "warning", message: `⚠️ Heads up! Based on your avg reach of ${reach.toLocaleString('en-IN')}, a competitive rate would be around ₹${suggested_rate.toLocaleString('en-IN')} (₹0.30/view). Your quoted charges are higher — you can still submit, brands may negotiate.` };
    }
  }
  return null;
};

// Session 43 (v283, Ravi: "+ Add on Social platforms throws me back to the profile page"): the add /
// edit screen of one platform is "platform_<id>". It was missing from this list, so the URL sync
// below reset the screen to the hub straight after the tap.
// Session 48 (Ravi: "Account doesn't open, sometimes the app hangs"): "account" was missing, so the URL sync
// threw the screen straight back to the hub on every tap.
const MOBILE_SCREENS = ["profile", "platforms", "rates", "portfolio", "kyc", "sessions", "legal", "refer", "help", "account"];
export const isMobileScreen = (section) =>
  Boolean(section) && (MOBILE_SCREENS.includes(section) || /^platform_(instagram|youtube|snapchat|linkedin|facebook)$/.test(section));

export default function CreatorSettings() {
  const { user, logout, refreshUser } = useAuth();
  const { startLoading, stopLoading } = useLoading();
  // Button actions show a spinner in the tapped button, not the global bar (ARCHITECTURE "Loading states").
  const { isBusy, anyBusy, begin, end } = useBusy();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const section = searchParams.get("section") || searchParams.get("tab");
    if (section === "kyc") return "kyc";
    if (section === "account" || section === "help" || section === "legal" || section === "sessions") return section; // v334
    if (section === "portfolio") return "portfolio"; // v367: /challenge → Join on a computer lands on Portfolio
    return "profile";
  });
  // v367 deep test: on a computer "Join Challenge" opened the Profile tab and the old editor (no Instagram picker, no
  // challenge toggle). The phone Portfolio screen now opens in a phone-sized panel instead.
  const [phonePortfolio, setPhonePortfolio] = useState(() => searchParams.get("section") === "portfolio" && searchParams.get("add") === "1"
    && typeof window !== "undefined" && window.matchMedia?.("(min-width: 768px)")?.matches === true);
  const [mobileScreen, setMobileScreen] = useState(() => {
    const section = searchParams.get("section") || searchParams.get("subscreen");
    if (section && isMobileScreen(section)) {
      return section;
    }
    return null;
  });
  const [activePlatform, setActivePlatform] = useState(null);

  // Sync mobileScreen when searchParams change (handles hardware back, browser back, links)
  useEffect(() => {
    const section = searchParams.get("section") || searchParams.get("subscreen");
    if (section && isMobileScreen(section)) {
      setMobileScreen(section);
    } else {
      setMobileScreen(null);
    }
    if (section === "kyc") {
      setActiveTab("kyc");
    }
  }, [searchParams]);

  // Listen for reset events from BottomNav re-tap
  useEffect(() => {
    const handleReset = () => {
      setMobileScreen(null);
      setSearchParams({}, { replace: true });
    };
    window.addEventListener("reset-mobile-profile-hub", handleReset);
    return () => window.removeEventListener("reset-mobile-profile-hub", handleReset);
  }, [setSearchParams]);

  // Session 58 (Ravi: "back karte hi app glitch karta hai … Eva se aaya tha toh Eva pe hi wapas jaana chahiye"):
  // closing a screen used to PUSH a new page, so Back re-opened the screen you just left. Now closing goes
  // back one step when the screen was opened by a push (or from Eva), and Eva opens again when you came from it.
  const navigate = useNavigate();
  const openedByPushRef = React.useRef(false);
  const handleSetMobileScreen = (screen) => {
    if (screen) {
      openedByPushRef.current = true;
      setSearchParams({ section: screen });
      setMobileScreen(screen);
      return;
    }
    const fromEva = searchParams.get("from") === "eva";
    const canGoBack = typeof window !== "undefined" && Number(window.history.state?.idx) > 0;
    setMobileScreen(null);
    if ((fromEva || openedByPushRef.current) && canGoBack) {
      openedByPushRef.current = false;
      navigate(-1);
      if (fromEva) setTimeout(() => { try { window.dispatchEvent(new Event("ybex:open-eva")); } catch (e) { console.warn(e); } }, 250);
      return;
    }
    setSearchParams({}, { replace: true });
  };

  // Profile fields state
  const [profile, setProfile] = useState({
    name: user?.name || "",
    profession: "Content Creator",
    niche: "",
    subCategories: ["Reels", "Stories"],
    language: "English",
    location: "",
    socials: [
      { id: 1, platform: 'Instagram', url: '' },
      { id: 2, platform: 'YouTube', url: '' }
    ],
    barterPrefs: [],
    paymentTimeline: "Within 30 Days",
    phone: "",
    businessEmail: user?.email || "",
    photo: user?.picture || user?.photo || "",
    cover: ""
  });

  const [rateCard, setRateCard] = useState({
    reels: 0,
    stories: 0,
    youtube_integration: 0
  });
  // Session 58: rates are only sent once they were loaded (or the Rates screen sends them), so a save
  // of another field can never overwrite real rates with the empty defaults.
  const rateCardLoadedRef = React.useRef(false);
  // v372 (Ravi's video: Profile showed "Category not set", "Add your city", no Instagram while the profile was still
  // loading / the load failed): until the real profile is here the screens show a loading state, and a save is
  // refused — every save sends the WHOLE profile, so saving the empty defaults would wipe category, city, Instagram.
  const profileReadyRef = React.useRef(false);
  const [profileState, setProfileState] = useState("loading"); // loading | ready | failed

  const [creatorMetrics, setCreatorMetrics] = useState({
    instagramAvgReach: 0,
    youtubeAvgViews: 0
  });

  // Portfolio management states
  const [isPortfolioModalOpen, setIsPortfolioModalOpen] = useState(false);
  const [editingPortfolioIndex, setEditingPortfolioIndex] = useState(null);
  const [portfolioForm, setPortfolioForm] = useState({
    title: "",
    brand_name: "",
    platform: "instagram",
    content_url: "",
    description: ""
  });
  const [newBrandInput, setNewBrandInput] = useState("");

  const handleOpenAddPortfolioModal = () => {
    setEditingPortfolioIndex(null);
    setPortfolioForm({
      title: "",
      brand_name: "",
      platform: "instagram",
      content_url: "",
      description: ""
    });
    setIsPortfolioModalOpen(true);
  };

  const handleOpenEditPortfolioModal = (index) => {
    const item = (profile.portfolio || [])[index] || {};
    setEditingPortfolioIndex(index);
    setPortfolioForm({
      title: item.title || "",
      brand_name: item.brand_name || item.brand || "",
      platform: item.platform || "instagram",
      content_url: item.content_url || item.url || item.link || "",
      description: item.description || ""
    });
    setIsPortfolioModalOpen(true);
  };

  const handleSavePortfolioItem = async () => {
    if (!portfolioForm.content_url) {
      toast.error("Please provide a video or content URL.");
      return;
    }

    // v367 deep test: editing on desktop rebuilt the item from the form and dropped its cover, numbers and the Diwali
    // Challenge stamp. Keep everything the item already had; the form only overrides what it shows.
    const prev = editingPortfolioIndex !== null && profile.portfolio[editingPortfolioIndex] && typeof profile.portfolio[editingPortfolioIndex] === "object" ? profile.portfolio[editingPortfolioIndex] : {};
    const newItem = {
      ...prev,
      id: editingPortfolioIndex !== null ? (profile.portfolio[editingPortfolioIndex]?.id || Date.now().toString()) : Date.now().toString(),
      title: portfolioForm.title || portfolioForm.brand_name || "Campaign Deliverable",
      brand_name: portfolioForm.brand_name || "", // v332: don't save a made-up "Brand Partner"
      platform: portfolioForm.platform || "instagram",
      content_url: portfolioForm.content_url.trim(),
      description: portfolioForm.description || ""
    };

    let updatedList = [...(profile.portfolio || [])];
    if (editingPortfolioIndex !== null) {
      updatedList[editingPortfolioIndex] = newItem;
    } else {
      updatedList.unshift(newItem);
    }

    const ok = await saveProfileChanges({ portfolio: updatedList });
    if (ok) setIsPortfolioModalOpen(false); // v332: a failed save closed the form and lost what was typed
  };

  const handleDeletePortfolioItem = async (index) => {
    const updatedList = (profile.portfolio || []).filter((_, i) => i !== index);
    await saveProfileChanges({ portfolio: updatedList });
  };

  const handleAddPastBrand = async () => {
    if (!newBrandInput.trim()) return;
    const brandName = newBrandInput.trim();
    if ((profile.pastBrands || []).includes(brandName)) {
      toast.info(`Brand "${brandName}" is already in your past brands.`);
      setNewBrandInput("");
      return;
    }
    const updatedBrands = [...(profile.pastBrands || []), brandName];
    setNewBrandInput("");
    await saveProfileChanges({ pastBrands: updatedBrands });
  };

  const handleRemovePastBrand = async (brandToRemove) => {
    const updatedBrands = (profile.pastBrands || []).filter(b => b !== brandToRemove);
    await saveProfileChanges({ pastBrands: updatedBrands });
  };

  // KYC States
  const [kycObj, setKycObj] = useState(null);
  const [kycLoading, setKycLoading] = useState(true);
  const [kycFailed, setKycFailed] = useState(false); // v332: a failed KYC load said "Identity Verification Required"

  // Active Sessions
  const [sessionsList, setSessionsList] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  // OTP modal state
  const [otpModalField, setOtpModalField] = useState(null); // 'phone' or 'businessEmail'
  const [otpSent, setOtpSent] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [otpTargetValue, setOtpTargetValue] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // Edit profile field modal
  const [editModalField, setEditModalField] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [subCategoriesInput, setSubCategoriesInput] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const handleImageUpload = async (file) => {
    if (!file) return;
    setUploadingImage(true);
    const toastId = toast.loading("Uploading image to storage...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const targetBucket = editModalField === "cover" ? "cover-images" : "profile-assets";
      const res = await api.post(`/upload?bucket=${targetBucket}`, formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });
      if (res.data?.url) {
        setEditValue(res.data.url);
        toast.success("Image uploaded successfully!", { id: toastId });
      } else {
        throw new Error("Invalid upload response");
      }
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Failed to upload image. Please try again.", { id: toastId });
    } finally {
      setUploadingImage(false);
    }
  };

  // Load Creator Settings Data
  const loadCreatorData = async () => {
    if (!user) return;
    startLoading();
    try {
      let data = null;
      /* Session 58: profiles are read through the server now (the database no longer lets the browser read them) */
      if (!data) {
        const res = await api.get(`/creators/${user.user_id}`).catch((e) => ({ failed: e }));
        if (res?.data) data = res.data;
        else if (res?.failed?.response?.status === 404) { profileReadyRef.current = true; setProfileState("ready"); } // no profile row yet → nothing to wipe
        // v330: a failed load left an empty form with no word why
        else { setProfileState((st) => (st === "ready" ? st : "failed")); toast.error("Couldn't load your profile. Check your internet and try again.", { id: "creator-settings-load" }); }
      }

      if (data) {
        let rateCardObj = data.rate_card;
        if (typeof rateCardObj === 'string') {
          try {
            rateCardObj = JSON.parse(rateCardObj);
          } catch (e) {
            rateCardObj = {};
          }
        }
        if (!rateCardObj) rateCardObj = {};

        const extras = rateCardObj.extras || {};
        const otherPlats = rateCardObj.other_platforms || {};
        const parsedSocials = [];
        if (data.instagram_handle || data.instagram) {
          parsedSocials.push({ id: 1, platform: 'Instagram', url: data.instagram_handle || data.instagram });
        }
        if (data.youtube) {
          parsedSocials.push({ id: 2, platform: 'YouTube', url: data.youtube });
        }
        // Load Snapchat, LinkedIn, Facebook
        const snapchatUrl = otherPlats.snapchat || "";
        if (snapchatUrl) {
          parsedSocials.push({ id: 3, platform: 'Snapchat', url: snapchatUrl });
        }
        const linkedinUrl = data.linkedin || otherPlats.linkedin || "";
        if (linkedinUrl) {
          parsedSocials.push({ id: 4, platform: 'LinkedIn', url: linkedinUrl });
        }
        const facebookUrl = otherPlats.facebook || "";
        if (facebookUrl) {
          parsedSocials.push({ id: 5, platform: 'Facebook', url: facebookUrl });
        }

        if (parsedSocials.length === 0) {
          parsedSocials.push({ id: 1, platform: 'Instagram', url: '' });
        }

        setProfile({
          name: user.name || data.name || "",
          tier: data.aggregate_tier || data.performance_tier || null,
          profession: extras.profession || "Content Creator",
          niche: data.category || data.primary_niche || "",
          // v344: no made-up "Reels, Stories" sub-categories when the creator never picked any
          subCategories: data.sub_categories || [],
          // v332: no made-up "English, Hindi" when the creator never chose languages (it was then saved on the next edit)
          language: data.languages ? (Array.isArray(data.languages) ? data.languages.join(", ") : data.languages) : (data.language || ""),
          // v344: also keep the languages as a list, so the mobile Creator info screen shows every language as a chip
          // (it used to read the whole "English, Hindi" text as one language and save only the first one)
          languages: Array.isArray(data.languages) ? data.languages : String(data.languages || data.language || "").split(",").map(s => s.trim()).filter(Boolean),
          location: (data.city || data.state) ? `${data.city || ""}, ${data.state || ""}`.replace(/^, |, $/g, "") : "",
          socials: parsedSocials,
          // v419: no made-up "Products Only" — it was saved for every creator who never chose, and brands filter by it now.
          barterPrefs: data.barter_mode || data.barter ? [data.barter_mode || data.barter] : [],
          gender: data.gender || "",
          dob: data.dob || data.date_of_birth || "",
          paymentTimeline: data.payment_terms || "Within 30 Days",
          phone: extras.phone || user.phone || "",
          businessEmail: data.email || user.email || "",
          photo: data.photo || data.picture || user.picture || user.photo || "",
          cover: data.cover_image || rateCardObj?.cover_image || "",
          // v346: the mobile Edit Profile form reads `bio` and `coverImage`; both were never loaded, so Save sent
          // bio "" and cover "" and wiped them. Load them here so a save keeps what is already on the profile.
          bio: data.bio || data.about || "",
          coverImage: data.cover_image || rateCardObj?.cover_image || "",
          portfolio: (data.portfolio || []).map(safeParseItem),
          pastBrands: data.past_brands || [],
          instagramFollowers: Number(data.ig_followers ?? data.instagram_followers ?? data.followers_instagram ?? data.follower_count ?? 0),
          instagramAvgReach: Number(data.avg_views_30d ?? data.instagram_avg_reach ?? data.average_reach ?? 0),
          instagramAvgLikes: Number(data.avg_likes_30d ?? data.instagram_avg_likes ?? 0),
          instagramAvgComments: Number(data.avg_comments_30d ?? data.instagram_avg_comments ?? 0),
          youtubeSubscribers: Number(data.followers_youtube ?? data.youtube_subscribers ?? 0),
          youtubeAvgViews: Number(data.youtube_avg_views ?? 0),
          // v353: the Platforms screen reads these for "Verified by Ybex" / "Live from Instagram" — they were never
          // loaded, so every card said "Pending · not synced" forever.
          profile_status: data.profile_status || data.status || null,
          instagram_handle: data.instagram_handle || data.instagram || "",
          instagram_synced_at: data.instagram_synced_at || null,
          instagram_stats: data.instagram_stats || null,
        });
        profileReadyRef.current = true; setProfileState("ready"); // v372

        if (!rateCardObj || typeof rateCardObj !== 'object') {
          rateCardObj = {};
        }
        
        setRateCard({
          reels: Number(rateCardObj.reel || rateCardObj.reels || data.rate_reel || data.reel_rate) || 0,
          stories: Number(rateCardObj.story || rateCardObj.stories || data.rate_story || data.story_rate) || 0,
          youtube_integration: Number(rateCardObj.yt_video || rateCardObj.youtube_integration || data.rate_yt_video || data.youtube_video_rate) || 0,
          ugc: Number(rateCardObj.ugc || rateCardObj.ugc_video || data.rate_ugc) || 0,
        });
        rateCardLoadedRef.current = true;
        
        setCreatorMetrics({
          instagramAvgReach: Number(data.average_reach) || 0,
          youtubeAvgViews: Number(data.youtube_avg_views) || 0 // v426: avg_views_30d is Instagram's — never shown as YouTube
        });
      }
    } catch (e) {
      console.error("Error loading creator profile settings:", e);
    } finally {
      stopLoading();
    }
  };

  const fetchKycStatus = async () => {
    try {
      const res = await api.get("verifications/me").catch(() => null);
      setKycFailed(!res);
      if (res?.data) {
        setKycObj(res.data);
      }
    } catch (e) {
      console.warn("Error fetching KYC", e);
    } finally {
      setKycLoading(false);
    }
  };

  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await api.get("sessions", { bypassCache: true }).catch(() => null);
      if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
        setSessionsList(res.data);
      } else {
        const currentDev = parseDeviceName(navigator.userAgent);
        setSessionsList([
          { session_token: "curr_token", device: currentDev, device_name: currentDev, location: "This device", isCurrent: true, created_at: new Date().toISOString() } /* v332: no made-up "India" location */
        ]);
      }
    } catch (e) {
      console.warn("Error fetching sessions", e);
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    if (user && !hasLoaded) {
      loadCreatorData();
      fetchKycStatus();
      fetchSessions();
      setHasLoaded(true);
    }
  }, [user, hasLoaded]);

  // v346: logging out from the phone profile left the person on /login?next=/creator/... (the signed-out page
  // redirect fired first). Go to a clean /login instead.
  const logoutToLogin = async () => {
    try { await logout(); } finally { window.location.replace("/login"); }
  };

  // Profile Save Action
  // v353: opts.silent — the caller shows its own "saved" toast (no two toasts for one save)
  const saveProfileChanges = async (updatedFields, opts = {}) => {
    // v372: never save over a profile that hasn't loaded (the payload is the whole profile — it would wipe it)
    if (!profileReadyRef.current) {
      toast.error("Your profile is still loading. Wait a moment and try again.", { id: "creator-settings-not-ready" });
      if (profileState === "failed") loadCreatorData();
      return false;
    }
    begin("save");
    try {
      const { rateCard: rateCardOverride, ...profileFields } = updatedFields || {};
      const rc = rateCardOverride || rateCard;
      const sendRates = Boolean(rateCardOverride) || rateCardLoadedRef.current;
      const mergedProfile = { ...profile, ...profileFields };
      const locParts = (mergedProfile.location || "").split(",");
      const city = locParts[0]?.trim() || "";
      const state = locParts[1]?.trim() || "";
      // v344: prefer the languages list (mobile sends it); fall back to the "English, Hindi" text (desktop edit sends that)
      const languages = Array.isArray(profileFields.languages) ? profileFields.languages
        : (profileFields.language !== undefined || !Array.isArray(mergedProfile.languages))
          ? (mergedProfile.language || "").split(",").map(s => s.trim()).filter(Boolean)
          : mergedProfile.languages;
      mergedProfile.languages = languages;
      mergedProfile.language = languages.join(", ");

      const insta = mergedProfile.socials?.find(s => s.platform === 'Instagram')?.url || "";
      const yt = mergedProfile.socials?.find(s => s.platform === 'YouTube')?.url || "";
      const snap = mergedProfile.socials?.find(s => s.platform === 'Snapchat')?.url || "";
      const link = mergedProfile.socials?.find(s => s.platform === 'LinkedIn')?.url || "";
      const fb = mergedProfile.socials?.find(s => s.platform === 'Facebook')?.url || "";

      const payload = {
        name: mergedProfile.name,
        category: mergedProfile.niche,
        niche: mergedProfile.niche,
        bio: mergedProfile.bio,
        profession: mergedProfile.profession,
        sub_categories: mergedProfile.subCategories,
        languages: languages,
        city: city,
        state: state,
        email: mergedProfile.businessEmail,
        business_email: mergedProfile.businessEmail,
        businessEmail: mergedProfile.businessEmail,
        phone: mergedProfile.phone,
        instagram: insta,
        instagram_handle: insta,
        follower_count: Number(mergedProfile.instagramFollowers) || 0,
        ig_followers: Number(mergedProfile.instagramFollowers) || 0,
        followers_instagram: Number(mergedProfile.instagramFollowers) || 0,
        instagram_followers: Number(mergedProfile.instagramFollowers) || 0,
        average_reach: Number(mergedProfile.instagramAvgReach) || 0,
        avg_views_30d: Number(mergedProfile.instagramAvgReach) || 0,
        instagram_avg_reach: Number(mergedProfile.instagramAvgReach) || 0,
        avg_likes_30d: Number(mergedProfile.instagramAvgLikes) || 0,
        instagram_avg_likes: Number(mergedProfile.instagramAvgLikes) || 0,
        avg_comments_30d: Number(mergedProfile.instagramAvgComments) || 0,
        instagram_avg_comments: Number(mergedProfile.instagramAvgComments) || 0,
        stats_last_updated_at: new Date().toISOString(),
        youtube: yt,
        // v283: YouTube numbers from the mobile "Social platforms" screen (sent only when known).
        ...(mergedProfile.youtubeSubscribers !== undefined ? { youtube_subscribers: Number(mergedProfile.youtubeSubscribers) || 0 } : {}),
        ...(mergedProfile.youtubeAvgViews !== undefined ? { youtube_avg_views: Number(mergedProfile.youtubeAvgViews) || 0 } : {}),
        linkedin: link,
        ...(mergedProfile.barterPrefs?.[0] ? { barter: mergedProfile.barterPrefs[0] } : {}),
        ...(mergedProfile.gender ? { gender: mergedProfile.gender } : {}),
        ...(mergedProfile.dob ? { dob: mergedProfile.dob } : {}),
        payment_terms: mergedProfile.paymentTimeline,
        photo: mergedProfile.photo,
        cover_image: mergedProfile.cover,
        portfolio: mergedProfile.portfolio || [],
        past_brands: mergedProfile.pastBrands || [],
        // Session 58 (Ravi: "rate card daal raha hu, phir bhi pending"): the server kept the OLD `reels` key from
        // the saved card and ignored the new `reel`, so a new rate never stuck. Every key is sent now, plus the
        // top-level rate fields the server reads first.
        ...(sendRates ? {
          reel_rate: Number(rc.reels) || 0,
          story_rate: Number(rc.stories) || 0,
          youtube_video_rate: Number(rc.youtube_integration) || 0,
        } : {}),
        rate_card: {
          ...(sendRates ? {
            reel: Number(rc.reels) || 0,
            reels: Number(rc.reels) || 0,
            story: Number(rc.stories) || 0,
            stories: Number(rc.stories) || 0,
            yt_video: Number(rc.youtube_integration) || 0,
            youtube_integration: Number(rc.youtube_integration) || 0,
            ugc: Number(rc.ugc) || 0,
            ugc_video: Number(rc.ugc) || 0,
          } : {}),
          other_platforms: {
            snapchat: snap,
            facebook: fb,
            linkedin: link
          },
          extras: {
            profession: mergedProfile.profession,
            phone: mergedProfile.phone
          }
        }
      };

      await api.post('creators/profile', payload);
      await refreshUser();
      setProfile(mergedProfile);
      if (!opts?.silent) toast.success("Profile settings updated!");
      return true;
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Couldn't save your changes. Please try again."); // v332: no raw error text
      return false; // Session 53: callers no longer show "updated!" after a failed save
    } finally {
      end("save");
    }
  };

  // OTP Handling
  const handleRequestOtp = async (field, value) => {
    if (!value || !value.trim()) {
      toast.error("Please provide a valid value.");
      return;
    }
    begin("otp");
    try {
      const res = await api.post("/otp/send", { target: field === "phone" ? "phone" : "email", value });
      if (res.data?.ok) {
        setOtpSent(true);
        setOtpModalField(field);
        setOtpTargetValue(value);
        toast.success("Verification OTP code sent! Please check your email/phone.");
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Couldn't send the code. Please try again."); // v332
    } finally {
      end("otp");
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpValue) {
      toast.error("Please enter the 6-digit OTP code.");
      return;
    }
    setVerifyingOtp(true);
    try {
      const target = otpModalField === "phone" ? "phone" : "email";
      const res = await api.post("/otp/verify", { target, value: otpTargetValue, code: otpValue });
      if (res.data?.ok) {
        toast.success("Verification successful!");
        const updatedFields = { [otpModalField]: otpTargetValue };
        await saveProfileChanges(updatedFields);
        setOtpSent(false);
        setOtpModalField(null);
        setOtpValue("");
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "That code didn't work. Please check it or ask for a new one."); // v332
    } finally {
      setVerifyingOtp(false);
    }
  };

  // Invalidate Session
  const handleLogoutSession = async (token) => {
    begin(`session:${token}`);
    try {
      await api.post(`sessions/logout/${token}`);
      toast.success("Device session logged out successfully.");
      await fetchSessions();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Couldn't log out that device. Please try again."); // v332
    } finally {
      end(`session:${token}`);
    }
  };

  const handleLogoutAllOtherSessions = async () => {
    begin("logout-others");
    try {
      await api.post("sessions/logout-others");
      toast.success("Logged out of all other sessions.");
      await fetchSessions();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Couldn't log out the other devices. Please try again."); // v332
    } finally {
      end("logout-others");
    }
  };

  const openEditModal = (field) => {
    setEditModalField(field);
    if (field === 'subCategories') {
      setSubCategoriesInput(profile.subCategories.join(", "));
    } else if (field === 'pastBrands') {
      setEditValue((profile.pastBrands || []).join(", "));
    } else if (field === 'portfolio') {
      setEditValue((profile.portfolio || []).join(", "));
    } else {
      setEditValue(profile[field] || "");
    }
  };

  const saveEditValue = async () => {
    let updatedVal;
    if (editModalField === 'subCategories') {
      updatedVal = subCategoriesInput.split(",").map(s => s.trim()).filter(Boolean);
    } else if (editModalField === 'pastBrands' || editModalField === 'portfolio') {
      updatedVal = editValue.split(",").map(s => s.trim()).filter(Boolean);
    } else {
      updatedVal = editValue;
    }
    const ok = await saveProfileChanges({ [editModalField]: updatedVal });
    if (ok) setEditModalField(null); // v332: keep the popup open if the save failed
  };

  return (
    <div className="w-full max-w-none relative" data-testid="settings-page">
      {phonePortfolio && (
        <div className="hidden md:flex fixed inset-0 z-[80] bg-[#1B1430]/50 backdrop-blur-sm items-center justify-center p-4" data-testid="desktop-phone-portfolio"
          onClick={(e) => { if (e.target === e.currentTarget) setPhonePortfolio(false); }}>
          {/* transform makes the screen's full-screen sheets stay inside this phone-sized panel */}
          <div className="relative w-[420px] h-[min(880px,94vh)] rounded-[28px] overflow-hidden bg-white shadow-2xl" style={{ transform: "translateZ(0)" }}>
            <div className="h-full overflow-y-auto">
              <PortfolioScreen loadIgMedia={(h) => api.post("instagram/preview", { username: h }).then((r) => r?.data?.media || [])}
                handleDeletePortfolioItem={handleDeletePortfolioItem} handleOpenEditPortfolioModal={handleOpenEditPortfolioModal}
                profile={profile} saveProfileChanges={saveProfileChanges}
                renderBackHeader={(title, right = null) => (
                  <header className="sticky top-0 z-30 bg-white border-b border-[#E5E5EA] px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setPhonePortfolio(false)} aria-label="Close" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-700"><X size={16} /></button>
                      <span className="text-[17px] font-black text-slate-900">{title}</span>
                    </div>
                    {right}
                  </header>
                )} />
            </div>
          </div>
        </div>
      )}
      {/* Mobile Push-Route Profile Hub & Subpages (Canvas-2 Screens 1a-1j) */}
      <div className="md:hidden">
        <CreatorMobileProfile
          user={user}
          logout={logoutToLogin}
          refreshUser={refreshUser}
          profile={profile}
          setProfile={setProfile}
          profileState={profileState}
          reloadProfile={loadCreatorData}
          rateCard={rateCard}
          setRateCard={setRateCard}
          creatorMetrics={creatorMetrics}
          kycObj={kycObj}
          kycLoading={kycLoading}
          kycFailed={kycFailed}
          fetchKycStatus={fetchKycStatus}
          sessionsList={sessionsList}
          loadingSessions={loadingSessions}
          handleLogoutSession={handleLogoutSession}
          handleLogoutAllOtherSessions={handleLogoutAllOtherSessions}
          activePlatform={activePlatform}
          setActivePlatform={setActivePlatform}
          otpSent={otpSent}
          setOtpSent={setOtpSent}
          otpTargetType={otpModalField}
          otpTargetValue={otpTargetValue}
          otpValue={otpValue}
          setOtpValue={setOtpValue}
          verifyingOtp={verifyingOtp}
          handleRequestOtp={handleRequestOtp}
          handleVerifyOtp={handleVerifyOtp}
          isPortfolioModalOpen={isPortfolioModalOpen}
          setIsPortfolioModalOpen={setIsPortfolioModalOpen}
          portfolioForm={portfolioForm}
          setPortfolioForm={setPortfolioForm}
          editingPortfolioIndex={editingPortfolioIndex}
          handleOpenAddPortfolioModal={handleOpenAddPortfolioModal}
          handleOpenEditPortfolioModal={handleOpenEditPortfolioModal}
          handleDeletePortfolioItem={handleDeletePortfolioItem}
          handleSavePortfolioItem={handleSavePortfolioItem}
          handleAddPastBrand={handleAddPastBrand}
          handleRemovePastBrand={handleRemovePastBrand}
          pastBrandInput={newBrandInput}
          setPastBrandInput={setNewBrandInput}
          handleImageUpload={handleImageUpload}
          uploadingImage={uploadingImage}
          saveProfileChanges={saveProfileChanges}
          mobileScreen={mobileScreen}
          setMobileScreen={handleSetMobileScreen}
        />
      </div>

      {/* Desktop Layout - ZERO CHANGES */}
      <div className="hidden md:flex flex-col md:flex-row gap-8 px-4 md:px-8 py-10 pb-20">
        
        {/* Navigation Sidebar */}
        <div className="w-full md:w-64 flex-shrink-0 space-y-2">
          <h2 className="text-xl font-extrabold text-slate-900 px-4 mb-4 font-display">Settings Hub</h2>
          {[
            { id: "profile", label: "Creator Profile", icon: <User size={16} /> },
            { id: "platforms", label: "Add Platforms", icon: <Share2 size={16} /> },
            { id: "rates", label: "Rate Cards", icon: <Briefcase size={16} /> },
            { id: "portfolio", label: "Portfolio", icon: <FolderKanban size={16} /> },
            { id: "kyc", label: "KYC Compliance", icon: <Shield size={16} /> },
            { id: "sessions", label: "Device Sessions", icon: <MonitorSmartphone size={16} /> },
            { id: "legal", label: "Privacy & Terms", icon: <FileText size={16} /> },
            { id: "account", label: "Account & delete", icon: <AccountTabIcon size={16} /> }, // v334
            { id: "help", label: "Help & Support", icon: <SupportTabIcon size={16} /> } // v334
          ].map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-colors text-left cursor-pointer z-10 ${
                  isActive 
                    ? "text-white" 
                    : "bg-white border border-slate-100 hover:bg-slate-50 text-slate-700"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="creatorSettingsTabPill"
                    className="absolute inset-0 bg-[var(--violet)] rounded-xl shadow-md shadow-[var(--violet)]/20 z-0"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-3">
                  {tab.icon} {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Settings Area */}
        <div className="flex-1 bg-white border border-slate-100 rounded-3xl p-6 md:p-8 shadow-sm">
          <AnimatePresence mode="wait">
            {activeTab === "profile" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 font-display">Creator Info</h3>
                  <p className="text-xs text-slate-500 font-medium">Keep your public profile up-to-date to attract brands.</p>
                </div>

                {/* Profile Header Visual Editor */}
                <div className="relative mb-14">
                  {/* Banner Wrapper with rounded corners and overflow-hidden */}
                  <div className="rounded-2xl overflow-hidden bg-slate-100 h-36 md:h-44 border border-slate-150 shadow-sm relative">
                    {/* v332: no stock-photo cover when the creator has none */}
                    {profile.cover ? (
                      <img src={profile.cover} className="w-full h-full object-cover" alt="Cover Banner" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#7C3AED] via-[#7C3AED] to-[#7C3AED]" aria-hidden="true" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent"></div>
                    <button 
                      onClick={() => openEditModal('cover')} 
                      className="absolute top-4 right-4 bg-white/90 backdrop-blur-md hover:bg-white text-slate-800 text-[10px] font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm transition-all border border-slate-200 cursor-pointer"
                    >
                      <Camera size={12}/> Change Cover Banner
                    </button>
                  </div>
                  
                  {/* Avatar - positioned outside the banner container so it is NEVER clipped */}
                  <div className="absolute -bottom-10 left-6 z-20 flex items-end gap-3">
                    <div className="w-20 h-20 md:w-24 md:h-24 rounded-full border-4 border-white bg-slate-50 overflow-hidden relative group shadow-lg">
                      <img 
                        /* v330: the fallback had lost its ui-avatars base URL, so no-photo creators saw a broken image */
                        src={profile.photo || initialsAvatar(profile.name || "Creator")} 
                        className="w-full h-full object-cover" 
                        alt="Profile Avatar"
                        onError={(e) => { const f = initialsAvatar(profile.name || "Creator"); if (e.currentTarget.src !== f) e.currentTarget.src = f; }}
                      />
                      <button 
                        onClick={() => openEditModal('photo')} 
                        className="absolute inset-0 bg-black/55 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border-none"
                      >
                        <Camera className="text-white" size={18} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { field: 'name', label: 'Full Name' },
                    { field: 'profession', label: 'Profession' },
                    { field: 'niche', label: 'Primary Category' },
                    { field: 'language', label: 'Languages Spoken' },
                    { field: 'location', label: 'Location' },
                    { field: 'subCategories', label: 'Sub-Categories' }
                  ].map(p => (
                    <div key={p.field} className="p-4 border border-slate-100 rounded-xl flex justify-between items-center bg-slate-50/50">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">{p.label}</span>
                        <span className="text-xs font-extrabold text-slate-800 break-all">
                          {p.field === 'subCategories' 
                            ? (profile.subCategories || []).join(", ") 
                            : p.field === 'pastBrands'
                              ? (profile.pastBrands || []).join(", ")
                              : p.field === 'portfolio'
                                ? (profile.portfolio || []).join(", ")
                                : (p.field === 'niche' && !profile[p.field])
                                  ? "Not set yet — tap edit to choose"
                                  : (profile[p.field] || <span className="text-slate-500 font-semibold">Not set</span>)}{/* v332: empty fields were blank; the hint pointed to Settings while on Settings */}
                        </span>
                      </div>
                      <button onClick={() => openEditModal(p.field)} aria-label={`Edit ${p.label}`} className="text-[var(--violet)] hover:bg-[var(--violet)]/5 p-2 rounded-lg transition-colors shrink-0">
                        <Edit2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Contact Information with Secure OTP */}
                <div className="border-t border-slate-100 pt-6">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-3">Secure Verification Contacts</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="flex-1 w-full">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Mobile Phone</span>
                        <input 
                          type="tel"
                          value={profile.phone || ""}
                          onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-[var(--violet)]"
                          placeholder="Enter mobile number"
                        />
                      </div>
                      <button 
                        onClick={() => saveProfileChanges({ phone: profile.phone })}
                        className="disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2 bg-[var(--violet)] hover:bg-[#6c48d4] text-white text-[10px] font-bold rounded-lg transition-all flex-shrink-0"
                       disabled={anyBusy}>{isBusy("save") && <ButtonSpinner className="mr-1.5" />}
                        Update
                      </button>
                    </div>

                    <div className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 flex justify-between items-center">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Business Email</span>
                        <span className="text-xs font-extrabold text-slate-800">{profile.businessEmail || "Not linked"}</span>
                      </div>
                      <button 
                        onClick={() => {
                          const val = prompt("Enter new business email to verify:", profile.businessEmail);
                          if (val) handleRequestOtp("businessEmail", val);
                        }} 
                        disabled={anyBusy}
                        className="disabled:opacity-60 px-3 py-1.5 bg-[var(--violet)]/10 hover:bg-[var(--violet)]/15 text-[var(--violet)] text-[10px] font-bold rounded-lg transition-all"
                      >{isBusy("otp") && <ButtonSpinner className="mr-1" size={11} />}
                        Verify & Link
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "platforms" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 font-display">Social Platforms</h3>
                  <p className="text-xs text-slate-500 font-medium">Connect your profiles to verify metrics and establish secure connections.</p>
                </div>

                <InstagramConnectCard initialHandle={profile?.socials?.find((x) => x.platform === "Instagram")?.url || ""} />{/* v349 */}
                <PlatformsPanel activePlatform={activePlatform} profile={profile} saveProfileChanges={saveProfileChanges} setActivePlatform={setActivePlatform} setProfile={setProfile} />
              </motion.div>
            )}

            {activeTab === "rates" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 font-display">Rate Cards</h3>
                  <p className="text-xs text-slate-500 font-medium">Define your standard delivery rates so brands can initiate direct handshake deals.</p>
                </div>

                <div className="space-y-4">
                  {[
                    { key: 'reels', label: 'Instagram Reel Rate (INR)', reach: creatorMetrics.instagramAvgReach, min: 1000 },
                    { key: 'stories', label: 'Instagram Story Rate (INR)', reach: creatorMetrics.instagramAvgReach, min: 200 },
                    { key: 'youtube_integration', label: 'YouTube Video Rate (INR)', reach: creatorMetrics.youtubeAvgViews, min: 1000 }
                  ].map(rc => {
                    const validation = validateRate(rateCard[rc.key], rc.reach, rc.min);
                    return (
                      <div key={rc.key} className="flex flex-col gap-2">
                        <div className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 flex justify-between items-center">
                          <span className="text-xs font-extrabold text-slate-800">{rc.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-500">₹</span>
                            <FormattedNumberInput 
                              value={rateCard[rc.key] || ""}
                              onChange={val => setRateCard(prev => ({ ...prev, [rc.key]: Number(val) || 0 }))}
                              onBlur={() => saveProfileChanges({})}
                              className="w-32 bg-white border border-slate-100 rounded-xl px-3 py-1.5 text-xs font-black text-slate-800 focus:outline-none focus:border-[var(--violet)] text-right"
                            />
                          </div>
                        </div>
                        {validation && (
                          // v332: pale green / yellow / pink text on white was hard to read
                          <div className={`text-xs p-3 rounded-xl border ${validation.status === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : validation.status === "warning" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-rose-50 border-rose-200 text-rose-700"}`}>
                            {validation.message}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Barter and Payment Preferences */}
                <div className="border-t border-slate-100 pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Barter Mode Preference</label>
                    <select 
                      value={profile.barterPrefs?.[0] || ""}
                      onChange={e => saveProfileChanges({ barterPrefs: [e.target.value] })}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-extrabold text-slate-800 focus:outline-none focus:border-[var(--violet)]"
                    >
                      <option value="" disabled>Choose…</option>
                      <option value="Products Only">Products Only (Barter Ok)</option>
                      <option value="Paid Campaigns Only">Paid Campaigns Only</option>
                      <option value="Hybrid (Paid + Barter)">Hybrid (Paid + Barter)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Payment Settlement Timeline</label>
                    <select 
                      value={profile.paymentTimeline}
                      onChange={e => saveProfileChanges({ paymentTimeline: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-extrabold text-slate-800 focus:outline-none focus:border-[var(--violet)]"
                    >
                      <option value="Within 30 Days">Within 30 Days (Standard)</option>
                      <option value="Within 15 Days">Within 15 Days (Express)</option>
                      <option value="Advance Payment">Advance Payment Required</option>
                    </select>
                  </div>
                </div>
                
                <div className="flex justify-end pt-4">
                  <button onClick={() => saveProfileChanges({})} className="bg-[var(--violet)] hover:bg-[var(--violet-dark)] text-white text-xs font-bold px-6 py-2.5 rounded-xl transition-colors shadow-sm flex items-center gap-2" disabled={anyBusy}>{isBusy("save") && <ButtonSpinner className="mr-1.5" />}
                    <CheckCircle size={14} /> Save Rate Cards
                  </button>
                </div>
              </motion.div>
            )}

            {activeTab === "portfolio" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
                <button type="button" onClick={() => setPhonePortfolio(true)} data-testid="desktop-add-collabs"
                  className="w-full rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-rose-50 px-4 py-3 text-left text-sm font-bold text-slate-800 hover:border-amber-300">
                  🪔 Add reels from Instagram (and enter the Diwali Creator Challenge) →
                </button>
                <div className="pb-4 border-b border-slate-100">
                  <h3 className="text-lg font-extrabold text-slate-900 font-display flex items-center gap-2">
                    <FolderKanban className="text-[var(--violet)]" size={20} /> Creator Portfolio & Past Work
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Showcase past brand work, delivered reels, YouTube videos, and Google Drive links. These appear live on your Public Profile.
                  </p>
                </div>

                {/* Past Brand Collaborations Card */}
                <PastBrandsCard handleAddPastBrand={handleAddPastBrand} handleRemovePastBrand={handleRemovePastBrand} newBrandInput={newBrandInput} profile={profile} setNewBrandInput={setNewBrandInput} />

                {/* Portfolio Deliverables List & Player Grid */}
                <PortfolioList handleDeletePortfolioItem={handleDeletePortfolioItem} handleOpenAddPortfolioModal={handleOpenAddPortfolioModal} handleOpenEditPortfolioModal={handleOpenEditPortfolioModal} profile={profile} />
              </motion.div>
            )}

            {activeTab === "kyc" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 font-display">KYC Compliance</h3>
                  <p className="text-xs text-slate-500 font-medium">Verification documents are processed securely to ensure prompt compliance clearance.</p>
                </div>

                <KycPanel kycLoading={kycLoading} kycObj={kycObj} kycFailed={kycFailed} onRetry={() => { setKycLoading(true); fetchKycStatus(); }} />
              </motion.div>
            )}

            {activeTab === "sessions" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-900 font-display">Device Sessions</h3>
                    <p className="text-xs text-slate-500 font-medium">Keep track of other active logins across your registered devices.</p>
                  </div>
                  <button 
                    onClick={handleLogoutAllOtherSessions}
                    className="disabled:opacity-60 disabled:cursor-not-allowed px-3.5 py-2 border border-rose-200 hover:bg-rose-50 text-rose-600 text-xs font-bold rounded-xl transition-all"
                   disabled={anyBusy}>{isBusy("logout-others") && <ButtonSpinner className="mr-1.5" />}
                    Logout All Other Devices
                  </button>
                </div>

                {loadingSessions ? (
                  <div className="flex justify-center items-center py-10">
                    <Loader2 size={24} className="animate-spin text-slate-500" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sessionsList?.map(sess => (
                      <div key={sess.session_token} className="p-4 border border-slate-100 rounded-2xl flex items-center justify-between bg-slate-50/50">
                        <div className="flex items-center gap-3">
                          <MonitorSmartphone className="text-slate-500" size={20} />
                          <div>
                            <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-2">
                              {sess.device || sess.device_name || "Unknown Web Device"} 
                              {sess.isCurrent && <span className="bg-emerald-50 text-emerald-600 text-[11px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-100">Current</span>}
                            </h4>
                            <span className="text-[10px] text-slate-500 font-bold block mt-0.5">{sess.location || "Location unknown"}</span>
                          </div>
                        </div>
                        {!sess.isCurrent && (
                          <button 
                            onClick={() => handleLogoutSession(sess.session_token)}
                            aria-label={`Log out ${sess.device || sess.device_name || "this device"}`}
                            className="disabled:opacity-60 disabled:cursor-not-allowed p-2 hover:bg-rose-50 text-rose-500 hover:text-rose-600 rounded-lg transition-colors"
                           disabled={anyBusy}>{isBusy(`session:${sess.session_token}`) && <ButtonSpinner className="mr-1.5" />}
                            <LogOut size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "legal" && (
              <div className="space-y-4" data-testid="settings-legal-tab">
                {/* Session 34: short cards for this panel + full pages on the public site (src/lib/legal). */}
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">Privacy &amp; Terms</h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">The rules that matter for your account, in short.</p>
                </div>
                <LegalPanel role="creator" />
              </div>
            )}

            {/* v334: Account — login details, devices, Delete account (same panel as the phone's Profile → Account) */}
            {activeTab === "account" && (
              <div className="space-y-2" data-testid="settings-account-tab">
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">Account</h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">Login details, devices, and Delete account.</p>
                </div>
                <div className="max-w-xl -mx-4">
                  <AccountPanel onOpen={(screen) => setActiveTab(screen)} onDeleted={() => logout?.()} />
                </div>
              </div>
            )}

            {/* v334: Help & support — email, WhatsApp, legal pages */}
            {activeTab === "help" && (
              <div className="space-y-4 max-w-xl" data-testid="settings-help-tab">
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">Help &amp; Support</h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">Questions about a deal, payment or your account? We're here.</p>
                </div>
                <SupportContactCard />
                <a href="/help" className="inline-flex text-sm font-semibold text-[var(--violet)] hover:underline">Open the Help Center →</a>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* v356: founder note footer (desktop) — Ravi's settings design */}
      <FounderNoteDesktop className="px-4 md:px-8 -mt-6 pb-12" />

      {/* Edit fields Modal */}
      <Presence>{editModalField && (
        <PopupBackdrop className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <PopupPanel kind="modal" className="bg-white border border-slate-100 rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
            <button onClick={() => setEditModalField(null)} aria-label="Close" /* v330 */ className="absolute top-4 right-4 text-slate-500 hover:text-slate-600">
              <X size={18} />
            </button>
            {/* v332: the title showed the raw field key ("UPDATE SUBCATEGORIES", "UPDATE NICHE") */}
            <h3 className="text-base font-extrabold text-slate-800 mb-4 font-display">Update {({ name: "full name", profession: "profession", niche: "primary category", language: "languages", location: "location", subCategories: "sub-categories", photo: "profile photo", cover: "cover banner", pastBrands: "past brands", portfolio: "portfolio" })[editModalField] || "details"}</h3>
            
            {editModalField === 'location' ? (
              <LocationAutocomplete 
                value={editValue} 
                withState /* v353 */
                onChange={val => setEditValue(val)} 
                className="mb-4"
              />
            ) : editModalField === 'subCategories' ? (
              <div className="mb-4">
                {!profile.niche ? (
                  <div className="p-4 bg-amber-50 text-amber-700 text-sm rounded-xl border border-amber-100 font-medium">
                    Please select a Primary Category first before adding Sub-Categories.
                  </div>
                ) : (
                  <UniversalTagSearch
                    selectedTags={subCategoriesInput ? subCategoriesInput.split(",").map(s => s.trim()).filter(Boolean) : []}
                    onChange={newTags => setSubCategoriesInput(newTags.join(", "))}
                    type="skill"
                    context={profile.niche}
                    placeholder={`Search skills for ${profile.niche}...`}
                  />
                )}
              </div>
            ) : editModalField === 'niche' ? (
              <div className="mb-4">
                <UniversalTagSearch
                  selectedTags={editValue ? [editValue] : []}
                  onChange={newTags => setEditValue(newTags[newTags.length - 1] || "")}
                  type="category"
                  placeholder="Search or create primary niche..."
                />
              </div>
            ) : editModalField === 'profession' ? (
              <div className="space-y-4 mb-4">
                <input 
                  type="text"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  placeholder="e.g. Content Creator, Fitness Coach, YouTuber..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-800 focus:outline-none focus:border-[var(--violet)]"
                />
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Suggested Professions:</p>
                  <div className="flex flex-wrap gap-2">
                    {POPULAR_PROFESSIONS.map((prof) => (
                      <button
                        key={prof}
                        type="button"
                        onClick={() => setEditValue(prof)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                          editValue === prof
                            ? "bg-[var(--violet)] text-white border-[var(--violet)] shadow-sm"
                            : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300"
                        }`}
                      >
                        {prof}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : editModalField === 'language' ? (
              <div className="space-y-4 mb-4">
                {/* Current Selected Languages */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                    Selected Languages ({editValue ? editValue.split(",").map(s => s.trim()).filter(Boolean).length : 0})
                  </label>
                  <div className="flex flex-wrap gap-1.5 min-h-10 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                    {editValue && editValue.split(",").map(s => s.trim()).filter(Boolean).length > 0 ? (
                      editValue.split(",").map(s => s.trim()).filter(Boolean).map((lang) => (
                        <span 
                          key={lang} 
                          className="inline-flex items-center gap-1.5 bg-[var(--violet)] text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow-sm"
                        >
                          {lang}
                          <button
                            type="button"
                            onClick={() => {
                              const curr = editValue.split(",").map(s => s.trim()).filter(Boolean);
                              const updated = curr.filter(l => l.toLowerCase() !== lang.toLowerCase());
                              setEditValue(updated.join(", "));
                            }}
                            className="hover:opacity-75 focus:outline-none"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500 italic py-1">No languages selected yet.</span>
                    )}
                  </div>
                </div>

                {/* Popular Indian & Global Languages */}
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Languages:</p>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                    {INDIAN_LANGUAGES.map((lang) => {
                      const currentArr = editValue ? editValue.split(",").map(s => s.trim()).filter(Boolean) : [];
                      const isSelected = currentArr.some(l => l.toLowerCase() === lang.toLowerCase());
                      return (
                        <button
                          key={lang}
                          type="button"
                          onClick={() => {
                            let updated;
                            if (isSelected) {
                              updated = currentArr.filter(l => l.toLowerCase() !== lang.toLowerCase());
                            } else {
                              updated = [...currentArr, lang];
                            }
                            setEditValue(updated.join(", "));
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                            isSelected
                              ? "bg-[var(--violet)] text-white border-[var(--violet)] shadow-sm"
                              : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300"
                          }`}
                        >
                          {isSelected ? `✓ ${lang}` : `+ ${lang}`}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Add Custom Language */}
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Add Custom Language:</p>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      id="custom-lang-input"
                      placeholder="e.g. French, Spanish, German..."
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-[var(--violet)]"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const val = e.currentTarget.value.trim();
                          if (val) {
                            const currentArr = editValue ? editValue.split(",").map(s => s.trim()).filter(Boolean) : [];
                            if (!currentArr.some(l => l.toLowerCase() === val.toLowerCase())) {
                              setEditValue([...currentArr, val].join(", "));
                            }
                            e.currentTarget.value = "";
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById("custom-lang-input");
                        if (input && input.value.trim()) {
                          const val = input.value.trim();
                          const currentArr = editValue ? editValue.split(",").map(s => s.trim()).filter(Boolean) : [];
                          if (!currentArr.some(l => l.toLowerCase() === val.toLowerCase())) {
                            setEditValue([...currentArr, val].join(", "));
                          }
                          input.value = "";
                        }
                      }}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              </div>
            ) : (editModalField === 'photo' || editModalField === 'cover') ? (
              <div className="space-y-4 mb-4">
                <div 
                  className={`border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-[var(--violet)] transition-all bg-slate-50/50 flex flex-col items-center justify-center relative min-h-36 ${uploadingImage ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (uploadingImage) return;
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleImageUpload(file);
                  }}
                  onClick={() => !uploadingImage && document.getElementById('modal-file-upload').click()}
                >
                  <input 
                    id="modal-file-upload"
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    disabled={uploadingImage}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file);
                    }}
                  />
                  {uploadingImage ? (
                    <div className="flex flex-col items-center justify-center py-2">
                      <Loader2 className="animate-spin text-[var(--violet)] mb-3" size={28} />
                      <p className="text-xs font-bold text-slate-700 animate-pulse">Uploading image to cloud bucket...</p>
                      <p className="text-[10px] text-slate-500 mt-1">Please wait a moment</p>
                    </div>
                  ) : (
                    <>
                      <Camera className="text-slate-500 mb-2" size={24} />
                      <p className="text-xs font-bold text-slate-700">Drag & drop your file here, or click to browse</p>
                      <p className="text-[10px] text-slate-500 mt-1">Supports PNG, JPG, GIF (Max 5MB)</p>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="h-[1px] bg-slate-100 flex-1"></div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Or Paste Image URL</span>
                  <div className="h-[1px] bg-slate-100 flex-1"></div>
                </div>

                <input 
                  type="text"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  placeholder="e.g., https://images.unsplash.com/photo-..."
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-800 focus:outline-none"
                />

                {editValue && (
                  <div className="rounded-xl border border-slate-100 overflow-hidden bg-slate-50 p-2 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-bold text-slate-500 mb-2 uppercase self-start pl-1">Live Preview:</span>
                    <img 
                      src={editValue} 
                      alt="Preview" 
                      className={`object-cover border border-slate-100 bg-white ${editModalField === 'photo' ? 'w-20 h-20 rounded-full' : 'w-full h-24 rounded-lg'}`}
                      onError={(e) => {
                        e.target.src = "https://placehold.co/400x150?text=Invalid+Image+URL";
                      }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <input 
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-800 focus:outline-none mb-4"
              />
            )}

            <div className="flex gap-3 justify-end">
              <button onClick={() => setEditModalField(null)} className="disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2 border border-slate-100 text-xs font-bold rounded-xl hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={saveEditValue} className="px-8 py-3 bg-[var(--violet)] hover:bg-[#6c48d4] text-white text-sm font-bold rounded-xl shadow-md w-full sm:w-auto" disabled={anyBusy}>{isBusy("save") && <ButtonSpinner className="mr-1.5" />}
                Save
              </button>
            </div>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* OTP verification popup */}
      <Presence>{otpSent && (
        <PopupBackdrop className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <PopupPanel kind="modal" className="bg-white border border-slate-100 rounded-3xl p-6 w-full max-w-sm shadow-2xl relative text-center">
            <button onClick={() => setOtpSent(false)} aria-label="Close" /* v330 */ className="absolute top-4 right-4 text-slate-500 hover:text-slate-600">
              <X size={18} />
            </button>
            <Mail className="mx-auto text-[var(--violet)] mb-3" size={32} />
            <h3 className="text-base font-extrabold text-slate-800 font-display">Verify contact credentials</h3>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              We have sent a verification code to <strong>{otpTargetValue}</strong>. Enter code below:
            </p>

            <input 
              type="text"
              maxLength={6}
              value={otpValue}
              placeholder="Enter 6-digit OTP code"
              onChange={e => setOtpValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-center text-sm font-bold tracking-[0.5em] focus:outline-none focus:border-[var(--violet)] my-5"
            />

            <div className="flex gap-3 mt-4">
              <button onClick={() => setOtpSent(false)} className="flex-1 py-2.5 border border-slate-100 text-xs font-bold rounded-xl hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleVerifyOtp} disabled={verifyingOtp} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md">
                {verifyingOtp ? "Verifying..." : "Confirm & Save"}
              </button>
            </div>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>
      {/* Portfolio Add/Edit Modal */}
      <AnimatePresence>
        <Presence>{isPortfolioModalOpen && (
          <PopupBackdrop className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
            <PopupPanel kind="modal"
              className="bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-lg p-6 space-y-5 my-8 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-base font-extrabold text-slate-900 font-display flex items-center gap-2">
                  <Video size={18} className="text-[var(--violet)]" />
                  {editingPortfolioIndex !== null ? "Edit Portfolio Work" : "Add Portfolio Video / Link"}
                </h3>
                <button
                  onClick={() => setIsPortfolioModalOpen(false)}
                  aria-label="Close" /* v330 */
                  className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-600 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* v344: fields below use 16px text on phones (text-base) — smaller text makes iPhone zoom in on tap */}
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                    Campaign / Deliverable Title
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Summer Collection Unboxing Reel"
                    value={portfolioForm.title}
                    onChange={(e) => setPortfolioForm({ ...portfolioForm, title: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-base md:text-xs font-extrabold text-slate-800 focus:outline-none focus:border-[var(--violet)]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                      Brand Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Nykaa, Mamaearth"
                      value={portfolioForm.brand_name}
                      onChange={(e) => setPortfolioForm({ ...portfolioForm, brand_name: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-base md:text-xs font-extrabold text-slate-800 focus:outline-none focus:border-[var(--violet)]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                      Platform / Type
                    </label>
                    <select
                      value={portfolioForm.platform}
                      onChange={(e) => setPortfolioForm({ ...portfolioForm, platform: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-base md:text-xs font-extrabold text-slate-800 focus:outline-none focus:border-[var(--violet)]"
                    >
                      <option value="instagram">Instagram Reel / Post</option>
                      <option value="youtube">YouTube Video / Shorts</option>
                      <option value="gdrive">Google Drive Video</option>
                      <option value="direct_video">Direct Video / MP4</option>
                      <option value="other">Other Link</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                    Video / Content URL (YouTube, Instagram Reel, Drive, MP4)
                  </label>
                  <input
                    type="text"
                    placeholder="Paste link: https://www.youtube.com/watch?v=... or Reel / Drive link"
                    value={portfolioForm.content_url}
                    onChange={(e) => setPortfolioForm({ ...portfolioForm, content_url: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-base md:text-xs font-extrabold text-slate-800 focus:outline-none focus:border-[var(--violet)]"
                  />
                  <p className="text-[10px] text-slate-500 font-medium mt-1">
                    Supports YouTube, Shorts, Instagram Reels, Google Drive videos, and MP4 direct links.
                  </p>
                </div>

                {/* Real-time embedded player preview inside the modal */}
                {portfolioForm.content_url && (
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">
                      Live Video Preview:
                    </label>
                    <VideoEmbedPreview 
                      url={portfolioForm.content_url} 
                      title={portfolioForm.title || "Video Preview"} 
                      watermark={false}
                      isApproved={true}
                    />
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                    Description / Deliverable Details (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. 1 Reel + 2 Stories for the summer launch"
                    value={portfolioForm.description}
                    onChange={(e) => setPortfolioForm({ ...portfolioForm, description: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-base md:text-xs font-medium text-slate-800 focus:outline-none focus:border-[var(--violet)] resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPortfolioModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePortfolioItem}
                  disabled={anyBusy} /* v332: busy state, no double save */
                  className="px-5 py-2 bg-[var(--violet)] hover:bg-[var(--violet-dark)] disabled:opacity-60 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                >
                  {isBusy("save") ? <ButtonSpinner size={13} /> : <CheckCircle size={14} />} Save Portfolio Work
                </button>
              </div>
            </PopupPanel>
          </PopupBackdrop>
        )}</Presence>
      </AnimatePresence>
    </div>
  );
}
