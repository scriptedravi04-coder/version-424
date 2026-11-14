import AccountPanel from "../../components/account/AccountPanel";
import { prepareUpload, uploadErrorText } from "../../lib/prepareUpload"; // v408
import ProfileBanner from "../../components/promo/ProfileBanner";
import LogoCropper from "../../components/common/LogoCropper";
import React, { useState, useEffect, useMemo, useRef } from "react";
import ReferralHub from "../../components/referral/ReferralHub";
import { referralCodeFor, referralRewardText } from "../../utils/referral";
import { safeLower } from "../../utils/safeFormat";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { User, Shield, Briefcase, ChevronRight, Share2, ArrowLeft, Camera, Edit2, CheckCircle, MapPin, LogOut, X, Loader2, ShieldAlert, FolderKanban, HeartHandshake, ExternalLink, Search, HelpCircle, CreditCard, ChevronDown, Check, Copy, Clock, Settings } from "lucide-react";
import { toast } from "sonner";
import { VALID_NICHES } from "../../lib/constants";
import { LocationAutocomplete } from "../../components/ui/autocomplete";
import UniversalTagSearch from "../../components/shared/UniversalTagSearch";
import { api } from "../../lib/api";

import { useHideBottomNav } from "../../lib/bottomNavVisibility";
import { normalizeKycStatus } from "../../utils/kycStatus";
import { publicOrigin } from "../../lib/publicUrl";
import HelpScreen from "./profileScreens/HelpScreen";
import LegalScreen from "./profileScreens/LegalScreen";
import PlatformsScreen from "./profileScreens/PlatformsScreen";
import HubInstagramStrip, { HubIgHandle, HubChip, igLive } from "../../components/instagram/HubInstagramStrip"; // v363
import PortfolioScreen from "./profileScreens/PortfolioScreen";
import { ProfileLoadFailed, ProfileLinesLoading } from "./profileScreens/parts/ProfileLoadState"; // v372
import RatesScreen from "./profileScreens/RatesScreen";
import SessionsScreen from "./profileScreens/SessionsScreen";
import ContactVerificationSection from "./profileScreens/parts/ContactVerificationSection";
import InstagramStatsForm from "./profileScreens/parts/InstagramStatsForm";
import KycIdentitySection from "./profileScreens/parts/KycIdentitySection";
import KycPayoutSection from "./profileScreens/parts/KycPayoutSection";
import LanguagesField, { SearchDetailsField } from "./profileScreens/parts/LanguagesField";
import { useOnline } from "../../lib/offline"; // v334
import { initialsAvatar } from "../../lib/initialsAvatar"; // v353
const ALL_PROFESSIONS = [
  "Content Creator",
  "Video Creator",
  "Influencer",
  "Model",
  "Artist",
  "Photographer",
  "Streamer",
  "Blogger",
  "Writer",
  "Podcaster",
  "Educator",
  "Musician",
  "Fashion Stylist",
  "Fitness Coach",
  "Chef / Foodie",
  "Tech Reviewer",
  "Gamer",
  "Actor / Performer"
];
import { FounderNoteMobile, VersionLine } from "../../components/footer/FounderNote";
import { logoIcon } from "../../components/common/SocialLogo"; // v364
import { appConfirm } from "../../components/common/Popup"; // v430: app confirm sheet

const SUGGESTED_SUB_CATEGORIES = [
  "Unboxing",
  "Tech Reviews",
  "Street Style",
  "Tutorials",
  "Vlogs",
  "Budget Travel",
  "Skincare",
  "Home Workouts",
  "Quick Recipes",
  "Daily Routines",
  "Gaming Highlights",
  "Hauls"
];

const ALL_LANGUAGES = [
  "English",
  "Hindi",
  "Hinglish",
  "Punjabi",
  "Bengali",
  "Marathi",
  "Gujarati",
  "Tamil",
  "Telugu",
  "Kannada",
  "Malayalam",
  "Odia",
  "Assamese"
];

const PLATFORM_CONFIG = {
  instagram: {
    id: "instagram",
    name: "Instagram",
    icon: logoIcon("instagram"), // v364: real logo
    color: "#E1306C",
    bg: "bg-pink-50",
    text: "text-pink-600",
    pitch: "Add Reel views, followers & reach",
    hasMetrics: true
  },
  youtube: {
    id: "youtube",
    name: "YouTube",
    icon: logoIcon("youtube"),
    color: "#FF0000",
    bg: "bg-red-50",
    text: "text-red-600",
    pitch: "Add channel link for video collabs",
    hasMetrics: false
  },
  snapchat: {
    id: "snapchat",
    name: "Snapchat",
    icon: logoIcon("snapchat"),
    color: "#EAB308",
    bg: "bg-yellow-50",
    text: "text-yellow-600",
    pitch: "Add Public Story & Spotlight profile",
    hasMetrics: false
  },
  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    icon: logoIcon("linkedin"),
    color: "#0A66C2",
    bg: "bg-blue-50",
    text: "text-[#7C3AED]",
    pitch: "Add professional thought leadership profile",
    hasMetrics: false
  },
  facebook: {
    id: "facebook",
    name: "Facebook",
    icon: logoIcon("facebook"),
    color: "#1877F2",
    bg: "bg-[#F5F0FF]",
    text: "text-[#7C3AED]",
    pitch: "Add Facebook Creator page URL",
    hasMetrics: false
  }
};

// v344: the profile keeps languages as text ("English, Hindi") — split it into one chip per language
// instead of treating the whole text as a single language (which lost every language but the first on save).
const langListOf = (p) => {
  const list = Array.isArray(p?.languages) ? p.languages : String(p?.language || "").split(",").map(s => s.trim()).filter(Boolean);
  return list.length ? list : ["English"];
};

export default function CreatorMobileProfile({
  user,
  logout,
  refreshUser,
  profile,
  setProfile,
  rateCard,
  setRateCard,
  creatorMetrics,
  kycObj,
  kycLoading,
  kycFailed = false, // v332: true when the KYC status could not be loaded
  fetchKycStatus,
  sessionsList = [],
  loadingSessions = false,
  handleLogoutSession,
  handleLogoutAllOtherSessions,
  activePlatform,
  setActivePlatform,
  otpSent,
  setOtpSent,
  otpTargetType,
  otpTargetValue,
  otpValue,
  setOtpValue,
  verifyingOtp,
  handleRequestOtp,
  handleVerifyOtp,
  isPortfolioModalOpen,
  setIsPortfolioModalOpen,
  portfolioForm,
  setPortfolioForm,
  editingPortfolioIndex,
  handleOpenAddPortfolioModal,
  handleOpenEditPortfolioModal,
  handleDeletePortfolioItem,
  handleSavePortfolioItem,
  handleAddPastBrand,
  handleRemovePastBrand,
  pastBrandInput,
  setPastBrandInput,
  handleImageUpload,
  uploadingImage,
  saveProfileChanges,
  mobileScreen = null,
  setMobileScreen,
  profileState = "ready", // v372: loading | ready | failed (CreatorSettings)
  reloadProfile,
}) {
  const online = useOnline(); // v334: offline → the KYC row says why it has no status yet
  // v366 (Ravi: hub strip stale after connect / refresh / disconnect): re-read the profile's Instagram fields from the
  // server right after the Social platforms card changes them, so "@handle • Live", the numbers and the IG LIVE chip
  // update at once (same fields CreatorSettings loads: instagram_handle / instagram_synced_at / instagram_stats).
  const reloadInstagramOnHub = async () => {
    const uid = user?.user_id || user?.id;
    if (!uid || typeof setProfile !== "function") return;
    try {
      const { data } = await api.get(`/creators/${uid}`, { bypassCache: true });
      const d = data?.profile || data || {};
      setProfile((prev) => ({
        ...(prev || {}),
        instagram_handle: d.instagram_handle || d.instagram || "",
        instagram_synced_at: d.instagram_synced_at || null,
        instagram_stats: d.instagram_stats || null,
      }));
    } catch { /* the next profile load shows it */ }
  };
  const navigate = useNavigate();
  // Session 39 (M13): an open sub-screen (edit, platforms, KYC, refer…) is a page of its own — no bottom bar.
  useHideBottomNav(Boolean(mobileScreen));
  const avatarInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const panInputRef = useRef(null);
  const qrInputRef = useRef(null);

  // Local state for creator info form
  const [editForm, setEditForm] = useState({
    name: profile?.name || "",
    profession: profile?.profession || "Content Creator",
    bio: profile?.bio || "",
    niche: profile?.niche || "",
    subCategories: profile?.subCategories || [],
    languages: langListOf(profile),
    gender: profile?.gender || "", dob: profile?.dob || "", barter: profile?.barterPrefs?.[0] || "",
    location: profile?.location || "",
    phone: profile?.phone || "",
    businessEmail: profile?.businessEmail || "",
    coverImage: profile?.coverImage || "",
    photo: profile?.photo || ""
  });

  // Keep editForm synced with incoming profile.
  // v353: only fields the creator has NOT changed are refreshed — an inline save (phone / email / photo / cover)
  // updates `profile`, which used to reset a half-typed bio or name back to the old text.
  const formFromProfile = (p) => ({
    name: p.name || "",
    profession: p.profession || "Content Creator",
    bio: p.bio || "",
    niche: p.niche || "",
    subCategories: p.subCategories || [],
    languages: langListOf(p),
    gender: p.gender || "", dob: p.dob || "", barter: p.barterPrefs?.[0] || "",
    location: p.location || "",
    phone: p.phone || "",
    businessEmail: p.businessEmail || "",
    coverImage: p.coverImage || "",
    photo: p.photo || ""
  });
  const lastSyncedRef = useRef(null);
  useEffect(() => {
    if (!profile) return;
    const fresh = formFromProfile(profile);
    const prev = lastSyncedRef.current;
    lastSyncedRef.current = fresh;
    if (!prev) { setEditForm(fresh); return; }
    setEditForm((cur) => {
      const next = { ...cur };
      for (const k of Object.keys(fresh)) {
        if (JSON.stringify(cur[k]) === JSON.stringify(prev[k])) next[k] = fresh[k]; // untouched → take the saved value
      }
      return next;
    });
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dirty check for Creator Info form
  const isCreatorInfoDirty = useMemo(() => {
    if (!profile) return false;
    const initialLanguages = langListOf(profile);
    const initialSubCats = profile.subCategories || [];

    const isNameDiff = (editForm.name || "") !== (profile.name || "");
    const isProfDiff = (editForm.profession || "") !== (profile.profession || "Content Creator");
    const isBioDiff = (editForm.bio || "") !== (profile.bio || "");
    const isNicheDiff = (editForm.niche || "") !== (profile.niche || "");
    const isLocDiff = (editForm.location || "") !== (profile.location || "");
    const isPhoneDiff = (editForm.phone || "") !== (profile.phone || "");
    const isEmailDiff = (editForm.businessEmail || "") !== (profile.businessEmail || "");
    const isCoverDiff = (editForm.coverImage || "") !== (profile.coverImage || "");
    const isPhotoDiff = (editForm.photo || "") !== (profile.photo || "");

    const isSubCatsDiff = JSON.stringify(editForm.subCategories.slice().sort()) !== JSON.stringify(initialSubCats.slice().sort());
    const isLangDiff = JSON.stringify(editForm.languages.slice().sort()) !== JSON.stringify(initialLanguages.slice().sort());

    const isSearchDiff /* v419 */ = (editForm.gender || "") !== (profile.gender || "") || (editForm.dob || "") !== (profile.dob || "") || (editForm.barter || "") !== (profile.barterPrefs?.[0] || "");
    return isSearchDiff || isNameDiff || isProfDiff || isBioDiff || isNicheDiff || isLocDiff || isPhoneDiff || isEmailDiff || isCoverDiff || isPhotoDiff || isSubCatsDiff || isLangDiff;
  }, [editForm, profile]);

  const [savingCreatorInfo, setSavingCreatorInfo] = useState(false);
  const [showProfessionSheet, setShowProfessionSheet] = useState(false);
  const [showNicheModal, setShowNicheModal] = useState(false);

  // Type-ahead category search
  const [categorySearch, setCategorySearch] = useState("");
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);

  const categorySuggestions = useMemo(() => {
    const list = VALID_NICHES || [
      "Technology & Gadgets", "Fashion & Lifestyle", "Beauty & Skincare", "Fitness & Wellness",
      "Food & Cooking", "Travel & Adventure", "Gaming & Esports", "Finance & Crypto",
      "Education & Career", "Entertainment & Comedy", "Music & Dance", "Parenting & Family",
      "Automobile & Bikes", "Business & Startups"
    ];
    if (!categorySearch.trim()) return list;
    return list.filter(item => item.toLowerCase().includes(categorySearch.toLowerCase().trim()));
  }, [categorySearch]);

  // Session 43 (v283, Ravi): the platform list reads and writes the REAL profile fields (the same ones
  // the desktop "Add Platforms" tab uses: socials[] + Instagram / YouTube numbers). It used to read a
  // socialLinks object nobody saves, so every platform showed "Not added yet" and saving did nothing.
  const PLATFORM_NAMES = { instagram: "Instagram", youtube: "YouTube", snapchat: "Snapchat", linkedin: "LinkedIn", facebook: "Facebook" };
  const socialLinks = useMemo(() => {
    const out = {};
    const socials = Array.isArray(profile?.socials) ? profile.socials : [];
    Object.entries(PLATFORM_NAMES).forEach(([id, name]) => {
      const url = String(socials.find((x) => x?.platform === name)?.url || "").trim();
      if (!url) return;
      const handle = url.replace(/^https?:\/\/(www\.)?(instagram|youtube|linkedin|facebook|snapchat)\.com\//i, "").replace(/^@/, "");
      if (id === "instagram") {
        out[id] = { url, handle, followers: Number(profile?.instagramFollowers) || 0, reach: Number(profile?.instagramAvgReach) || 0,
          likes: Number(profile?.instagramAvgLikes) || 0, comments: Number(profile?.instagramAvgComments) || 0 };
      } else if (id === "youtube") {
        out[id] = { url, handle, followers: Number(profile?.youtubeSubscribers) || 0, reach: Number(profile?.youtubeAvgViews) || 0 };
      } else out[id] = { url, handle };
    });
    return out;
  }, [profile]);

  // Social Platform edit form state
  const [editingPlatformId, setEditingPlatformId] = useState(null);
  const [platformForm, setPlatformForm] = useState({
    url: "",
    followers: "",
    reach: "",
    likes: "",
    comments: ""
  });
  const [savingPlatform, setSavingPlatform] = useState(false);

  // Referral stats
  const [referralStats, setReferralStats] = useState({ total_referred: 0, rewards_earned: 0, reward_amount: null });
  // Session 24: this screen never loaded the real numbers (always 0 / ₹500).
  useEffect(() => {
    if (mobileScreen !== "refer") return undefined;
    let alive = true;
    api.get("referral/stats")
      .then(({ data }) => { if (alive && data) setReferralStats((p) => ({ ...p, ...data })); })
      .catch(() => {});
    return () => { alive = false; };
  }, [mobileScreen]);
  const [copiedLink, setCopiedLink] = useState(false);
  // Session 40 (M40): portfolio = paste a link (platform found from the link), no views field.
  const [pasteLink, setPasteLink] = useState("");
  const [pasteBrand, setPasteBrand] = useState("");
  const [savingPaste, setSavingPaste] = useState(false);

  // Legal Accordion state
  const [expandedLegal, setExpandedLegal] = useState({ privacy: true, escrow: false, dispute: false });

  // Help search & FAQ accordion
  const [helpSearchQuery, setHelpSearchQuery] = useState("");
  const [isHelpTicketOpen, setIsHelpTicketOpen] = useState(false);
  const [expandedFaqId, setExpandedFaqId] = useState(null);

  // Local KYC Form state (Frames 5 & 6)
  const [kycForm, setKycForm] = useState({
    legalName: "",
    panNumber: "",
    panPhotoUrl: "",
    payoutMethod: "upi", // 'upi' | 'bank'
    upiId: "",
    upiQrUrl: "",
    bankName: "",
    holderName: "",
    accountNumber: "",
    ifscCode: ""
  });
  const [isSection1Collapsed, setIsSection1Collapsed] = useState(false);
  const [submittingKyc, setSubmittingKyc] = useState(false);
  const [uploadingPan, setUploadingPan] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [isEditingKyc, setIsEditingKyc] = useState(false);

  // Sync KYC form with kycObj
  useEffect(() => {
    if (kycObj && kycObj.documents) {
      const docs = kycObj.documents;
      setKycForm({
        legalName: docs.creator_name || docs.legal_name || profile?.name || "",
        panNumber: (docs.creator_pan || docs.identity_num || "").toUpperCase(),
        panPhotoUrl: docs.uploaded_files?.[0] || docs.pan_photo_url || "",
        payoutMethod: docs.bank_account && !docs.upi_id ? "bank" : "upi",
        upiId: docs.upi_id || "",
        upiQrUrl: docs.upi_qr_code_url || docs.uploaded_files?.[3] || "",
        bankName: docs.bank_name || "",
        holderName: docs.bank_holder_name || docs.creator_name || profile?.name || "",
        accountNumber: docs.bank_account || "",
        ifscCode: (docs.bank_ifsc || "").toUpperCase()
      });
      if (docs.creator_pan && docs.uploaded_files?.[0]) {
        setIsSection1Collapsed(true);
      }
    } else if (profile) {
      setKycForm(prev => ({
        ...prev,
        legalName: prev.legalName || profile.name || "",
        holderName: prev.holderName || profile.name || ""
      }));
    }
  }, [kycObj, profile]);

  // Handle Share
  const handleShareProfile = async () => {
    const shareUrl = `${publicOrigin()}/creator/${user?.user_id || user?.id || ""}`;
    const copyLink = () => Promise.resolve().then(() => navigator.clipboard.writeText(shareUrl)).then(() => toast.success("Profile link copied to clipboard! 📋")).catch(() => toast.error("Couldn't copy the link.")); // v332: no unhandled error when copy is blocked
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${profile?.name || "Creator"} Profile on Ybex`,
          text: `Check out my verified creator media kit and collaborate with zero middlemen fees!`,
          url: shareUrl
        });
      } catch (err) {
        if (err.name !== "AbortError") copyLink();
      }
    } else {
      copyLink();
    }
  };

  // Back button helper
  const renderBackHeader = (title, right = null) => (
    <header data-statusbar="#FFFFFF" className="sticky top-0 z-30 bg-white border-b border-[#E5E5EA] px-4 py-3 flex items-center justify-between w-full shadow-2xs">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (editingPlatformId) {
              leavePlatformScreen();
            } else {
              setMobileScreen(null);
            }
          }}
          className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 flex items-center justify-center text-slate-700 transition-all cursor-pointer"
          aria-label="Go back"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-extrabold text-slate-900 tracking-tight font-display">
          {title}
        </h1>
      </div>
      {right}
    </header>
  );

  // -------------------------------------------------------------
  // HANDLERS: CREATOR INFO SAVE
  // -------------------------------------------------------------
  const handleSaveCreatorInfo = async () => {
    if (!editForm.name.trim()) {
      toast.error("Full name is required");
      return;
    }
    if (!editForm.niche.trim()) {
      toast.error("Primary category is required");
      return;
    }

    try {
      setSavingCreatorInfo(true);
      const updated = {
        name: editForm.name.trim(),
        profession: editForm.profession,
        bio: editForm.bio.trim(),
        niche: editForm.niche.trim(),
        subCategories: editForm.subCategories,
        languages: editForm.languages,
        // v344: save every language ("English, Hindi"), not just the first one
        language: editForm.languages.join(", ") || "English",
        gender: editForm.gender || "", dob: editForm.dob || "", ...(editForm.barter ? { barterPrefs: [editForm.barter] } : {}),
        location: editForm.location.trim(),
        phone: editForm.phone.trim(),
        businessEmail: editForm.businessEmail.trim(),
        coverImage: editForm.coverImage,
        cover: editForm.coverImage, // Session 43: the settings save reads "cover"
        photo: editForm.photo
      };

      if (saveProfileChanges) {
        if ((await saveProfileChanges(updated, { silent: true })) === false) return; // v353: silent — own toast below. v332: a failed save closed the screen and lost the edits
      } else {
        await api.patch("creators/me", updated);
        setProfile(prev => ({ ...prev, ...updated }));
        toast.success("Creator info saved successfully!");
      }
      setMobileScreen(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save changes. Please try again.");
    } finally {
      setSavingCreatorInfo(false);
    }
  };

  // Avatar and Cover upload
  // v286 (Ravi): a new profile photo opens the adjust / crop / zoom screen first (like a brand logo).
  const [avatarCrop, setAvatarCrop] = useState(null);
  const onUploadPhoto = async (e, type) => {
    const file = e?.target?.files?.[0] || e?.file;
    if (e?.target) e.target.value = "";
    if (!file) return;
    if (type === 'avatar' && !e?.cropped) { setAvatarCrop(file); return; }
    try {
      toast.loading(`Uploading ${type === 'avatar' ? 'profile photo' : 'cover image'}...`, { id: "upload" });
      const formData = new FormData();
      formData.append("file", await prepareUpload(file)) /* v408: HEIC / big photo → JPEG */;
      const res = await api.post("upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      const url = res.data?.url || res.data?.fileUrl;
      if (url) {
        // Session 43 (Ravi: "photo shows for a moment, then goes back; Save stays off"): the upload
        // only changed the screen. It is now saved to the profile straight away (no Save needed).
        const patch = type === 'avatar' ? { photo: url } : { cover: url, coverImage: url };
        // v353: a failed save said "Profile photo saved" next to the error and showed a photo that wasn't kept
        if (saveProfileChanges) { if ((await saveProfileChanges(patch, { silent: true })) === false) { toast.dismiss("upload"); return; } }
        else await api.patch("creators/me", type === 'avatar' ? { photo: url } : { cover_image: url });
        if (type === 'avatar') {
          setEditForm(prev => ({ ...prev, photo: url }));
          setProfile(prev => ({ ...prev, photo: url }));
        } else {
          setEditForm(prev => ({ ...prev, coverImage: url }));
          setProfile(prev => ({ ...prev, coverImage: url }));
        }
        toast.success(`${type === 'avatar' ? 'Profile photo' : 'Cover image'} saved`, { id: "upload" });
      } else toast.error("Image upload failed", { id: "upload" }); // v330: no URL back left "Uploading…" spinning forever
    } catch (err) {
      toast.error("Image upload failed", { id: "upload" });
    }
  };

  // -------------------------------------------------------------
  // HANDLERS: PLATFORMS
  // -------------------------------------------------------------
  // v344: opening a platform pushed a new page and closing it pushed "platforms" again, so Back from
  // Platforms re-opened Instagram (a loop). Now closing a platform we opened just goes back one step.
  const platformPushedRef = useRef(false);
  const leavePlatformScreen = () => {
    setEditingPlatformId(null);
    const canGoBack = typeof window !== "undefined" && Number(window.history.state?.idx) > 0;
    if (platformPushedRef.current && canGoBack) {
      platformPushedRef.current = false;
      navigate(-1);
      return;
    }
    setMobileScreen("platforms");
  };

  const handleOpenPlatformEdit = (platformId) => {
    platformPushedRef.current = true; // v344: see leavePlatformScreen
    setEditingPlatformId(platformId);
    const existing = socialLinks[platformId] || {};
    const metrics = creatorMetrics?.[platformId] || {};
    setPlatformForm({
      url: existing.url || existing.handle || "",
      followers: existing.followers || metrics.followers || "",
      reach: existing.reach || metrics.reach || "",
      likes: existing.likes || metrics.likes || "",
      comments: existing.comments || metrics.comments || ""
    });
    setMobileScreen(`platform_${platformId}`);
  };

  const handleSavePlatform = async (platformId) => {
    if (!platformForm.url.trim()) {
      toast.error("Please enter a handle or profile URL");
      return;
    }

    try {
      setSavingPlatform(true);
      const name = PLATFORM_NAMES[platformId] || platformId;
      const rest = (Array.isArray(profile?.socials) ? profile.socials : []).filter((x) => x?.platform !== name && String(x?.url || "").trim());
      const payload = { socials: [...rest, { id: Date.now(), platform: name, url: platformForm.url.trim() }] };
      if (platformId === "instagram") {
        payload.instagramFollowers = Number(platformForm.followers) || 0;
        payload.instagramAvgReach = Number(platformForm.reach) || 0;
        payload.instagramAvgLikes = Number(platformForm.likes) || 0;
        payload.instagramAvgComments = Number(platformForm.comments) || 0;
      } else if (platformId === "youtube") {
        payload.youtubeSubscribers = Number(platformForm.followers) || 0;
        payload.youtubeAvgViews = Number(platformForm.reach) || 0;
      }

      if (saveProfileChanges) {
        if ((await saveProfileChanges(payload, { silent: true })) === false) return; // Session 53 / v353 silent
      } else {
        await api.patch("creators/me", payload);
        setProfile(prev => ({ ...prev, ...payload }));
      }

      toast.success(`${PLATFORM_CONFIG[platformId]?.name || "Platform"} updated!`);
      leavePlatformScreen(); // v344: go back instead of pushing "platforms" again (Back loop)
    } catch (err) {
      console.error(err);
      toast.error("Couldn't save your platform details. Please try again."); // v332: calm wording
    } finally {
      setSavingPlatform(false);
    }
  };

  const handleRemovePlatform = async (platformId) => {
    if (!(await appConfirm(`Remove ${PLATFORM_CONFIG[platformId]?.name || "this platform"} from your profile?`, { ok: "Remove", danger: true }))) {
      return;
    }
    try {
      const name = PLATFORM_NAMES[platformId] || platformId;
      const payload = { socials: (Array.isArray(profile?.socials) ? profile.socials : []).filter((x) => x?.platform !== name) };
      if (platformId === "instagram") Object.assign(payload, { instagramFollowers: 0, instagramAvgReach: 0, instagramAvgLikes: 0, instagramAvgComments: 0 });
      if (platformId === "youtube") Object.assign(payload, { youtubeSubscribers: 0, youtubeAvgViews: 0 });
      if (saveProfileChanges) {
        if ((await saveProfileChanges(payload, { silent: true })) === false) return; // Session 53: no "updated!" after a failed save
      } else {
        await api.patch("creators/me", payload);
        setProfile(prev => ({ ...prev, ...payload }));
      }
      toast.success("Platform removed");
    } catch (err) {
      toast.error("Couldn't remove the platform. Please try again.");
    }
  };

  // -------------------------------------------------------------
  // HANDLERS: KYC VERIFICATION (Frames 5 & 6)
  // -------------------------------------------------------------
  // Session 35: KYC files go to the PRIVATE kyc-documents bucket (like desktop CreatorKyc.jsx).
  // Without ?bucket= the server used the public "cover-images" bucket, so PAN / UPI QR images were
  // open to anyone with the link.
  const handleUploadPanPhoto = async (e) => {
    const picked = e.target.files?.[0];
    if (e.target) e.target.value = ""; // v332: picking the same file again (after Remove) did nothing
    if (!picked) return;
    const file = await prepareUpload(picked); // v408 (Ravi: KYC stuck): HEIC / no type / big camera photo → JPEG
    if (file.size > 10 * 1024 * 1024) { toast.error("That file is over 10 MB. Please pick a smaller photo."); return; }
    try {
      setUploadingPan(true);
      const formData = new FormData();
      formData.append("file", await prepareUpload(file)) /* v408: HEIC / big photo → JPEG */;
      const res = await api.post("upload?bucket=kyc-documents", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      const url = res.data?.url || res.data?.fileUrl;
      if (url) {
        setKycForm(prev => ({ ...prev, panPhotoUrl: url }));
        toast.success("PAN document uploaded!");
      }
    } catch (err) {
      toast.error(uploadErrorText(err)); // v408: say why (type / size / network)
    } finally {
      setUploadingPan(false);
    }
  };

  const handleUploadQrCode = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = ""; // v332
    if (!file) return;
    try {
      setUploadingQr(true);
      const formData = new FormData();
      formData.append("file", await prepareUpload(file)) /* v408: HEIC / big photo → JPEG */;
      const res = await api.post("upload?bucket=kyc-documents", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      const url = res.data?.url || res.data?.fileUrl;
      if (url) {
        setKycForm(prev => ({ ...prev, upiQrUrl: url }));
        toast.success("UPI QR Code uploaded!");
      }
    } catch (err) {
      toast.error("Couldn't upload the QR code. Please try again.");
    } finally {
      setUploadingQr(false);
    }
  };

  const isKycFormValid = useMemo(() => {
    if (!kycForm.legalName.trim()) return false;
    if (!kycForm.panNumber.trim() || kycForm.panNumber.trim().length !== 10) return false;
    if (!kycForm.panPhotoUrl) return false;

    if (kycForm.payoutMethod === "upi") {
      if (!kycForm.upiId.trim() || !kycForm.upiId.includes("@")) return false;
    } else {
      if (!kycForm.bankName.trim()) return false;
      if (!kycForm.holderName.trim()) return false;
      if (!kycForm.accountNumber.trim()) return false;
      if (!kycForm.ifscCode.trim() || kycForm.ifscCode.trim().length !== 11) return false;
    }
    return true;
  }, [kycForm]);

  // v346: the Submit button was greyed out with no hint why — say what is still missing (same checks as above).
  const kycBlockReason = useMemo(() => {
    if (!kycForm.legalName.trim()) return "Enter your full legal name.";
    if (!kycForm.panNumber.trim() || kycForm.panNumber.trim().length !== 10) return "PAN must be 10 characters, like ABCDE1234F.";
    if (!kycForm.panPhotoUrl) return "Upload a photo of your PAN card.";
    if (kycForm.payoutMethod === "upi") {
      if (!kycForm.upiId.trim() || !kycForm.upiId.includes("@")) return "Enter a valid UPI ID, like name@okbank.";
    } else {
      if (!kycForm.bankName.trim()) return "Enter your bank name.";
      if (!kycForm.holderName.trim()) return "Enter the account holder name.";
      if (!kycForm.accountNumber.trim()) return "Enter your account number.";
      if (!kycForm.ifscCode.trim() || kycForm.ifscCode.trim().length !== 11) return "IFSC must be 11 characters.";
    }
    return "";
  }, [kycForm]);

  const handleSubmitKyc = async () => {
    if (!isKycFormValid) {
      toast.error("Please complete all required fields with valid details.");
      return;
    }

    try {
      setSubmittingKyc(true);
      const payload = {
        creator_name: kycForm.legalName.trim(),
        creator_pan: kycForm.panNumber.trim().toUpperCase(),
        identity_num: kycForm.panNumber.trim().toUpperCase(),
        payout_method: kycForm.payoutMethod,
        upi_id: kycForm.payoutMethod === "upi" ? kycForm.upiId.trim() : null,
        upi_qr_code_url: kycForm.payoutMethod === "upi" ? kycForm.upiQrUrl : null,
        bank_name: kycForm.payoutMethod === "bank" ? kycForm.bankName.trim() : null,
        bank_holder_name: kycForm.payoutMethod === "bank" ? kycForm.holderName.trim() : null,
        bank_account: kycForm.payoutMethod === "bank" ? kycForm.accountNumber.trim() : null,
        bank_ifsc: kycForm.payoutMethod === "bank" ? kycForm.ifscCode.trim().toUpperCase() : null,
        uploaded_files: [kycForm.panPhotoUrl, null, null, kycForm.upiQrUrl].filter(Boolean)
      };

      await api.post("verifications/creator", payload);
      toast.success("KYC submitted for review. We will notify you once it is verified.");
      if (refreshUser) await refreshUser();
      if (typeof fetchKycStatus === 'function') await fetchKycStatus();
      setMobileScreen(null);
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.error || "Couldn't submit your KYC. Please check your details and try again."); // v332
    } finally {
      setSubmittingKyc(false);
    }
  };

  // Connected Socials Count
  const connectedSocials = useMemo(() => {
    const list = [];
    Object.keys(PLATFORM_CONFIG).forEach(key => {
      if (socialLinks[key]) list.push({ ...PLATFORM_CONFIG[key], data: socialLinks[key] });
    });
    return list;
  }, [socialLinks]);

  const notConnectedSocials = useMemo(() => {
    const connectedKeys = new Set(connectedSocials.map(s => s.id));
    return Object.values(PLATFORM_CONFIG).filter(p => !connectedKeys.has(p.id));
  }, [connectedSocials]);

  const kycIsApproved = kycObj?.status === 'APPROVED' || kycObj?.status === 'approved';
  // Session 39 (M24): "submitted, waiting for admin" and "rejected" are their own states.
  const kycNorm = normalizeKycStatus(kycObj);
  // v353: admin "More info needed" counted as PENDING ("we're checking", no button) — the creator could never act.
  const kycRaw = String(kycObj?.status || kycObj?.kyc_status || "").toUpperCase();
  const kycNeedsInfo = !kycIsApproved && /MORE_INFO|INFO_NEEDED|NEEDS_INFO|ACTION_REQUIRED|RESUBMIT/.test(kycRaw);
  const kycUnderReview = !kycIsApproved && kycNorm === 'PENDING' && !kycNeedsInfo;
  const kycRejected = !kycIsApproved && (kycNorm === 'REJECTED' || kycNeedsInfo);
  const kycReason = String(kycObj?.rejection_reason || kycObj?.admin_note || kycObj?.reason || kycObj?.notes || kycObj?.note || "").trim();


  // -------------------------------------------------------------
  // SCREEN 1: CREATOR INFO (FRAME 1)
  // -------------------------------------------------------------
  if (mobileScreen === "profile") {
    const selectedLanguages = editForm.languages || ["English"];
    const availableLanguages = ALL_LANGUAGES.filter(l => !selectedLanguages.includes(l));

    return (
      <div className="min-h-screen bg-white flex flex-col">
        {renderBackHeader("Creator info")}

        {/* Form Body with 20px gutters — v332: inputs 16px (no iPhone zoom); save bars clear the home bar */}
        <div className="flex-1 px-5 py-5 space-y-6">
          {/* Photos Header: Cover & Avatar */}
          <div className="space-y-3">
            <div className="relative pb-10">
              {/* Cover Photo Box */}
              <div className="relative w-full h-[130px] rounded-2xl bg-gradient-to-r from-purple-100 via-indigo-50 to-pink-50 border border-slate-200/80 overflow-hidden group">
                {editForm.coverImage ? (
                  <img src={editForm.coverImage} alt="Cover" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} /* v330: broken cover → plain gradient */ />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs font-bold">
                    Cover Photo
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="absolute top-3 right-3 px-3 min-h-9 bg-white/90 backdrop-blur-xs text-slate-800 text-[12px] font-bold rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-1.5 active:scale-95 transition-all z-10"
                >
                  <Camera size={13} />
                  <span>{editForm.coverImage ? "Change Cover" : "Add Cover"}</span>
                </button>
              </div>

              {/* Avatar pinned bottom left - outside overflow for full visibility */}
              <div className="absolute bottom-0 left-4 z-20">
                <div className="relative w-[76px] h-[76px] rounded-full border-4 border-white bg-slate-100 shadow-md overflow-hidden group">
                  <img
                    src={editForm.photo || profile?.photo || profile?.picture || user?.picture || user?.photo || user?.profile_photo_url || initialsAvatar(editForm.name || "Creator")}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                    onError={(e) => { const f = initialsAvatar(editForm.name || "Creator"); if (e.currentTarget.src !== f) e.currentTarget.src = f; }} /* v330 */
                  />
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity"
                    aria-label="Change avatar"
                  >
                    <Camera size={16} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute bottom-0 right-0 w-6 h-6 bg-[#7C3AED] text-white rounded-full flex items-center justify-center border-2 border-white shadow-sm active:scale-95"
                  aria-label="Upload photo"
                >
                  <Camera size={11} />
                </button>
              </div>
            </div>

            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onUploadPhoto(e, 'cover')}
            />
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onUploadPhoto(e, 'avatar')}
            />
            <LogoCropper file={avatarCrop} shape="circle" title="Adjust your photo" useLabel="Use photo" suffix="-photo"
              onCancel={() => setAvatarCrop(null)}
              onDone={(f) => { setAvatarCrop(null); onUploadPhoto({ file: f, cropped: true }, 'avatar'); }} />

            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
              Both show on your public profile.
            </p>
          </div>

          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              placeholder="e.g. Devansh Sharma"
              className="w-full h-[52px] bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl px-4 text-[16px] font-semibold text-slate-900 focus:outline-none focus:border-[#7C3AED] focus:bg-white transition-all shadow-2xs"
            />
          </div>

          {/* Profession (Reusable Select with Bottom Sheet) */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Profession <span className="text-rose-500">*</span>
            </label>
            <button
              type="button"
              onClick={() => setShowProfessionSheet(true)}
              className="w-full h-[52px] bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl px-4 flex items-center justify-between text-left text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#7C3AED] active:scale-[0.99] transition-all shadow-2xs"
            >
              <span>{editForm.profession || "Select Profession"}</span>
              <ChevronDown size={18} className="text-slate-500" />
            </button>
          </div>

          {/* Bio */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Bio / Creator Summary
            </label>
            <textarea
              rows={3}
              value={editForm.bio}
              onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
              placeholder="Tell brands what you create, your niche highlights, and recent achievements..."
              className="w-full bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl p-4 text-[16px] font-medium text-slate-900 focus:outline-none focus:border-[#7C3AED] focus:bg-white transition-all resize-none shadow-2xs leading-relaxed" /* v332: 16px so iPhone doesn't zoom */
            />
            {/* v363: same 40-character rule Eva uses for "profile complete" */}
            {(() => { const n = String(editForm.bio || "").trim().length; return (
              <div className={`text-[11px] font-semibold ${n >= 40 ? "text-emerald-600" : "text-slate-500"}`}>
                {n >= 40 ? `✓ ${n} characters` : `${n}/40 characters — brands skip empty bios`}
              </div>
            ); })()}
          </div>

          {/* Primary Category (Interactive Search Field with UniversalTagSearch modal) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                Primary Category <span className="text-rose-500">*</span>
              </label>
              {editForm.niche && (
                <button
                  type="button"
                  onClick={() => setShowNicheModal(true)}
                  className="text-[12px] font-extrabold text-[#7C3AED] hover:underline min-h-9 px-1 inline-flex items-center" /* v353: 36px tap area */
                >
                  Change Category
                </button>
              )}
            </div>
            <div
              role="button" tabIndex={0} /* v330 */
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowNicheModal(true); } }}
              onClick={() => setShowNicheModal(true)}
              className="w-full min-h-[52px] bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl px-4 py-2.5 flex items-center justify-between cursor-pointer active:scale-[0.99] transition-all shadow-2xs group hover:border-[#7C3AED]/40"
            >
              <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-2">
                <Search size={18} className="text-slate-500 shrink-0 group-hover:text-[#7C3AED] transition-colors" />
                {editForm.niche ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-[#F3EBFF] border border-[#7C3AED]/30 text-[#7C3AED] truncate">
                    {editForm.niche}
                  </span>
                ) : (
                  <span className="text-sm font-medium text-slate-500 truncate">
                    Search or pick primary niche...
                  </span>
                )}
              </div>
              <ChevronDown size={18} className="text-slate-500 shrink-0" />
            </div>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Location
            </label>
            {/* Session 43 (v283, Ravi): same location search as desktop — type "Jaip", pick "Jaipur". */}
            <div data-testid="mobile-location-search">
              <LocationAutocomplete
                value={editForm.location}
                withState /* v353: keep the state when a city is picked */
                onChange={(val) => setEditForm((f) => ({ ...f, location: val }))}
                placeholder="Search your city, e.g. Jaipur"
                // v344: no text-sm here — under 16px makes iPhone zoom in when the field is tapped
                className="h-[52px] !rounded-2xl !bg-[#F9F9FB] border-[#E5E5EA] font-semibold text-slate-900 focus:!bg-white"
              />
            </div>
          </div>

          {/* Languages Spoken (Selected First, Followed by Options) */}
          <LanguagesField availableLanguages={availableLanguages} editForm={editForm} selectedLanguages={selectedLanguages} setEditForm={setEditForm} />

          <SearchDetailsField editForm={editForm} setEditForm={setEditForm} />{/* v419: gender, age, barter — brands search by these */}
          {/* Contact Verification Section */}
          <ContactVerificationSection editForm={editForm} saveProfileChanges={saveProfileChanges} setEditForm={setEditForm} setProfile={setProfile} />
        </div>

        {/* Pinned Bottom Save Bar */}
        <div className="sticky bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E5E5EA] px-4 pt-4 pb-[calc(16px+env(safe-area-inset-bottom))] space-y-1.5 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <button
            type="button"
            disabled={!isCreatorInfoDirty || savingCreatorInfo}
            onClick={handleSaveCreatorInfo}
            className={`w-full h-[52px] rounded-2xl text-sm font-extrabold flex items-center justify-center gap-2 transition-all ${
              isCreatorInfoDirty && !savingCreatorInfo
                ? "bg-[#7C3AED] hover:bg-[#6D28D9] text-white shadow-lg active:scale-[0.99] cursor-pointer"
                : "bg-[#EDEDF2] text-[#767680] cursor-not-allowed"
            }`}
          >
            {savingCreatorInfo ? (
              <Loader2 size={18} className="animate-spin text-white" />
            ) : (
              <span>Save changes</span>
            )}
          </button>
        </div>

        {/* Modal: Update NICHE with UniversalTagSearch (Desktop-parity category search) */}
        <AnimatePresence>
          {showNicheModal && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowNicheModal(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 30 }}
                className="fixed inset-x-4 top-[max(16px,10dvh)] max-w-md mx-auto z-50 bg-white rounded-3xl p-5 shadow-2xl border border-slate-100 flex flex-col min-h-[min(500px,80dvh)]" /* v330: 500px from 15% cut "Done" off on short phones */
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                                        <h3 className="text-base font-extrabold text-slate-900 font-display">
                      Update niche
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNicheModal(false)}
                    aria-label="Close" /* v330 */
                    className="p-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-600 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="py-4 overflow-visible flex-1">
                  <UniversalTagSearch
                    selectedTags={editForm.niche ? [editForm.niche] : []}
                    onChange={(newTags) => {
                      const chosen = newTags[newTags.length - 1] || "";
                      setEditForm({ ...editForm, niche: chosen });
                      if (chosen) {
                        toast.success(`Selected category: ${chosen}`);
                        setTimeout(() => setShowNicheModal(false), 250);
                      }
                    }}
                    type="category"
                    placeholder="Search or create primary niche..."
                  />
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowNicheModal(false)}
                    className="px-5 py-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold rounded-xl active:scale-95 transition-all shadow-xs"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Reusable Select Bottom Sheet: Profession */}
        <AnimatePresence>
          {showProfessionSheet && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowProfessionSheet(false)}
                className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50"
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl p-5 max-h-[75vh] flex flex-col shadow-2xl border-t border-slate-100"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="text-base font-extrabold text-slate-900 font-display">
                    Select Profession
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowProfessionSheet(false)}
                    aria-label="Close" /* v330 */
                    className="p-2 rounded-full hover:bg-slate-100 text-slate-500"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="overflow-y-auto py-2 divide-y divide-slate-50">
                  {ALL_PROFESSIONS.map((prof) => {
                    const isSelected = editForm.profession === prof;
                    return (
                      <button
                        key={prof}
                        type="button"
                        onClick={() => {
                          setEditForm({ ...editForm, profession: prof });
                          setShowProfessionSheet(false);
                        }}
                        className="w-full py-3.5 px-3 flex items-center justify-between hover:bg-[#F5F0FF] rounded-xl transition-colors text-left"
                      >
                        <span className={`text-sm ${isSelected ? "font-black text-[#7C3AED]" : "font-semibold text-slate-800"}`}>
                          {prof}
                        </span>
                        {isSelected && <Check size={18} className="text-[#7C3AED]" />}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // -------------------------------------------------------------
  // SCREEN 2: SOCIAL PLATFORMS LIST (FRAME 2)
  // -------------------------------------------------------------
  if (mobileScreen === "platforms") return <PlatformsScreen connectedSocials={connectedSocials} handleOpenPlatformEdit={handleOpenPlatformEdit} handleRemovePlatform={handleRemovePlatform} notConnectedSocials={notConnectedSocials} profile={profile} renderBackHeader={renderBackHeader} onInstagramChanged={reloadInstagramOnHub} />;

  // -------------------------------------------------------------
  // SCREEN 3: INSTAGRAM DETAILS (FRAME 3)
  // -------------------------------------------------------------
  if (mobileScreen === "platform_instagram") {
    const followersNum = Number(platformForm.followers) || 0;
    const likesNum = Number(platformForm.likes) || 0;
    const commentsNum = Number(platformForm.comments) || 0;
    const liveEngRate = followersNum > 0
      ? (((likesNum + commentsNum) / followersNum) * 100).toFixed(2)
      : "0.00";

    const isInstagramValid = !!platformForm.url.trim() && followersNum > 0;

    return (
      <div className="min-h-screen bg-white flex flex-col">
        {renderBackHeader("Instagram")}

        <InstagramStatsForm commentsNum={commentsNum} followersNum={followersNum} likesNum={likesNum} liveEngRate={liveEngRate} platformForm={platformForm} setPlatformForm={setPlatformForm} />

        {/* Pinned Save Bar */}
        <div className="sticky bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E5E5EA] px-4 pt-4 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <button
            type="button"
            disabled={!isInstagramValid || savingPlatform}
            onClick={() => handleSavePlatform("instagram")}
            className={`w-full h-[52px] rounded-2xl text-sm font-extrabold flex items-center justify-center gap-2 transition-all ${
              isInstagramValid && !savingPlatform
                ? "bg-[#7C3AED] hover:bg-[#6D28D9] text-white shadow-lg cursor-pointer"
                : "bg-[#EDEDF2] text-[#767680] cursor-not-allowed"
            }`}
          >
            {savingPlatform ? <Loader2 size={18} className="animate-spin" /> : "Save Instagram details"}
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // SCREEN 4: OTHER PLATFORMS (FRAME 4 - YouTube, LinkedIn, Snapchat, Facebook)
  // -------------------------------------------------------------
  if (mobileScreen && mobileScreen.startsWith("platform_")) {
    const platformId = mobileScreen.replace("platform_", "");
    const config = PLATFORM_CONFIG[platformId] || { name: "Platform" };

    return (
      <div className="min-h-screen bg-white flex flex-col">
        {renderBackHeader(config.name)}

        <div className="flex-1 p-5 space-y-6">
          <p className="text-xs text-slate-600 font-medium leading-relaxed">
            {platformId === "youtube"
              ? "Add your channel link and its numbers. Brands use them to pick creators for video collabs."
              : "Add the link brands should open."}
          </p>

          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Profile URL or Handle <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={platformForm.url}
              onChange={(e) => setPlatformForm({ ...platformForm, url: e.target.value })}
              placeholder={`e.g. ${safeLower(config.name)}.com/yourhandle`}
              className="w-full h-[52px] bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl px-4 text-[16px] font-semibold text-slate-900 focus:outline-none focus:border-[#7C3AED] focus:bg-white transition-all shadow-2xs"
            />
          </div>

          {/* Session 43 (v283, Ravi): YouTube asks for a little more than the link — subscribers and
              average views, the same numbers desktop and onboarding ask for. */}
          {platformId === "youtube" && (
            <div className="grid grid-cols-2 gap-3">
              {[["followers", "Subscribers", "e.g. 25000"], ["reach", "Avg views / video", "e.g. 8000"]].map(([key, label, ph]) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">{label}</label>
                  <input type="number" inputMode="numeric" min="0" value={platformForm[key]}
                    onChange={(e) => setPlatformForm({ ...platformForm, [key]: e.target.value })} placeholder={ph}
                    data-testid={`yt-${key}`}
                    className="w-full h-[52px] bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl px-4 text-[16px] font-semibold text-slate-900 focus:outline-none focus:border-[#7C3AED] focus:bg-white transition-all shadow-2xs" />
                </div>
              ))}
            </div>
          )}

          <div className="bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl p-4 shadow-2xs">
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
              You enter these yourself — keep them accurate. Ybex never logs into your account.
            </p>
          </div>
        </div>

        {/* Pinned Save Bar */}
        <div className="sticky bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E5E5EA] px-4 pt-4 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <button
            type="button"
            disabled={!platformForm.url.trim() || savingPlatform}
            onClick={() => handleSavePlatform(platformId)}
            className={`w-full h-[52px] rounded-2xl text-sm font-extrabold flex items-center justify-center gap-2 transition-all ${
              platformForm.url.trim() && !savingPlatform
                ? "bg-[#7C3AED] hover:bg-[#6D28D9] text-white shadow-lg cursor-pointer"
                : "bg-[#EDEDF2] text-[#767680] cursor-not-allowed"
            }`}
          >
            {savingPlatform ? <Loader2 size={18} className="animate-spin" /> : `Save ${config.name} details`}
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // SCREEN 5 & 6: KYC VERIFICATION (FRAMES 5 & 6)
  // -------------------------------------------------------------
  if (mobileScreen === "kyc") {
    const isApproved = kycObj?.status === 'APPROVED' || kycObj?.status === 'approved';
    const isPending = kycUnderReview; // v332: "UNDER_REVIEW" showed as "KYC verification missing" here

    return (
      <div className="min-h-screen bg-white flex flex-col">
        {/* v283 (Ravi): approved / submitted KYC can be resubmitted from the top-right. */}
        {renderBackHeader("Creator verification", (isApproved || isPending) && !isEditingKyc ? (
          <button type="button" onClick={() => setIsEditingKyc(true)} data-testid="kyc-resubmit"
            className="h-9 px-3 rounded-full bg-[#F5F0FF] text-[#7C3AED] text-[12px] font-bold active:scale-95 transition">
            Resubmit
          </button>
        ) : null)}

        <div className="flex-1 p-5 space-y-6">
          {/* Status Banner */}
          <div className={`rounded-2xl p-4 border space-y-2 shadow-2xs ${
            isApproved 
              ? "bg-emerald-50 border-emerald-200 text-emerald-900" 
              : isPending 
                ? "bg-amber-50 border-amber-200 text-amber-900"
                : "bg-[#FEF2EE] border-[#F7D9CE] text-slate-900"
          }`}>
            <div className="flex items-center justify-between flex-wrap gap-2">{/* v330: badges wrapped under the title instead of squeezing it at 320px */}
              <div className="flex items-center gap-2">
                <Shield size={18} className={isApproved ? "text-emerald-600" : isPending ? "text-amber-600" : "text-[#E8552F]"} />
                <span className="text-xs font-black uppercase tracking-wider">
                  {isApproved ? "KYC Approved ✓" : isPending ? "KYC Under Review" : kycNeedsInfo ? "More details needed" : kycRejected ? "KYC needs another look" : kycFailed && !kycObj ? (online ? "Couldn't load KYC status" : "KYC status shows when you're online") : "KYC verification missing"}
                </span>
              </div>
              <div className="flex gap-1.5">
                {/* v332: removed a "2-MIN FAST" badge — review takes up to 24–48 hours */}
                <span className="text-[11px] font-extrabold bg-white/80 px-2 py-0.5 rounded-full uppercase">
                  256-BIT ENCRYPTED
                </span>
              </div>
            </div>
            <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
              {isApproved 
                ? "Your identity is verified. Payouts are released directly to your account upon deal completion."
                : isPending
                  ? "Your details are being reviewed by our team. We will notify you once it is verified."
                  : kycRejected
                    ? "Please fix the details below and submit again." /* v353 */
                    : "Verify your identity so payouts can be sent to your bank or UPI."}
            </p>
            {kycRejected && kycReason && (
              <p className="text-[12px] font-semibold text-[#B42318] bg-white/70 rounded-xl px-3 py-2">Reason: {kycReason}</p>
            )}
          </div>
          {/* Read Only View if Pending or Approved */}
          {((isApproved || isPending) && !isEditingKyc) ? (
            <div className="bg-[#F9F9FB] border border-[#E5E5EA] rounded-2xl p-4 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#E5E5EA] pb-3">
                 <h3 className="text-sm font-bold text-slate-900">Submitted Details</h3>
                 {/* v353: removed a second "Edit" button — "Resubmit" (top right) does the same */}
              </div>
              <div className="space-y-3">
                 <div>
                   <span className="text-[10px] text-slate-500 uppercase font-black block">Applicant</span>
                   <span className="text-sm font-bold text-slate-900 block">{kycForm.legalName || "—"}</span>
                   <span className="text-xs font-mono text-slate-500">PAN: {kycForm.panNumber || "—"}</span>
                 </div>
                 <div>
                   <span className="text-[10px] text-slate-500 uppercase font-black block">Payout Method</span>
                   {kycForm.payoutMethod === 'upi' ? (
                     <span className="text-sm font-mono font-bold text-emerald-600 block">{kycForm.upiId || "—"}</span>
                   ) : (
                     <div>
                       <span className="text-sm font-bold text-slate-900 block">Bank Account</span>
                       <span className="text-xs font-mono text-slate-500">A/C: {kycForm.accountNumber ? "••••" + kycForm.accountNumber.slice(-4) : "—"}</span>
                     </div>
                   )}
                 </div>
              </div>
            </div>
          ) : (
            <>

              {/* Section 1: Identity & Tax Information */}
          <KycIdentitySection handleUploadPanPhoto={handleUploadPanPhoto} isSection1Collapsed={isSection1Collapsed} kycForm={kycForm} panInputRef={panInputRef} setIsSection1Collapsed={setIsSection1Collapsed} setKycForm={setKycForm} uploadingPan={uploadingPan} />

          {/* Section 2: Payout Method */}
          <KycPayoutSection handleUploadQrCode={handleUploadQrCode} kycForm={kycForm} qrInputRef={qrInputRef} setKycForm={setKycForm} uploadingQr={uploadingQr} />
            </>
          )}
        </div>

        {/* Pinned Bottom Submit Bar */}
        { !((isApproved || isPending) && !isEditingKyc) && (
          <div className="sticky bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E5E5EA] px-4 pt-4 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <button
            type="button"
            disabled={!isKycFormValid || submittingKyc}
            onClick={handleSubmitKyc}
            className={`w-full h-[52px] rounded-2xl text-sm font-extrabold flex items-center justify-center gap-2 transition-all ${
              isKycFormValid && !submittingKyc
                ? "bg-[#7C3AED] hover:bg-[#6D28D9] text-white shadow-lg cursor-pointer"
                : "bg-[#EDEDF2] text-[#767680] cursor-not-allowed"
            }`}
          >
            {submittingKyc ? <Loader2 size={18} className="animate-spin text-white" /> : "Submit KYC for verification"}
          </button>
          {!isKycFormValid && kycBlockReason && (
            <p className="mt-2 text-center text-[12px] font-semibold text-[#B45309]" role="status" data-testid="kyc-block-reason">{kycBlockReason}{/* v346 */}</p>
          )}
        </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // SCREEN 7: HELP & SUPPORT (FRAME 7)
  // -------------------------------------------------------------
  if (mobileScreen === "help") return <HelpScreen expandedFaqId={expandedFaqId} helpSearchQuery={helpSearchQuery} isHelpTicketOpen={isHelpTicketOpen} navigate={navigate} renderBackHeader={renderBackHeader} setExpandedFaqId={setExpandedFaqId} setHelpSearchQuery={setHelpSearchQuery} setIsHelpTicketOpen={setIsHelpTicketOpen} />;

  // -------------------------------------------------------------
  // SCREEN 1d: RATE CARDS
  // -------------------------------------------------------------
  if (mobileScreen === "rates") return <RatesScreen rateCard={rateCard} profileState={profileState} renderBackHeader={renderBackHeader} saveProfileChanges={saveProfileChanges} setMobileScreen={setMobileScreen} setRateCard={setRateCard} />;

  // -------------------------------------------------------------
  // SCREEN 1e: PORTFOLIO
  // -------------------------------------------------------------
  if (mobileScreen === "portfolio") return <PortfolioScreen loadIgMedia={(h) => api.post("instagram/preview", { username: h }).then((r) => r?.data?.media || [])} /* v354 */ handleDeletePortfolioItem={handleDeletePortfolioItem} handleOpenEditPortfolioModal={handleOpenEditPortfolioModal} pasteBrand={pasteBrand} pasteLink={pasteLink} profile={profile} profileState={profileState} renderBackHeader={renderBackHeader} saveProfileChanges={saveProfileChanges} savingPaste={savingPaste} setPasteBrand={setPasteBrand} setPasteLink={setPasteLink} setSavingPaste={setSavingPaste} />;

  // -------------------------------------------------------------
  // SCREEN 1h: DEVICE SESSIONS
  // -------------------------------------------------------------
  if (mobileScreen === "account") {
    return (
      <div className="w-full min-h-screen bg-white">
        {renderBackHeader("Account")}
        <AccountPanel onOpen={setMobileScreen} onDeleted={logout} />
      </div>
    );
  }

  if (mobileScreen === "sessions") return <SessionsScreen handleLogoutAllOtherSessions={handleLogoutAllOtherSessions} handleLogoutSession={handleLogoutSession} renderBackHeader={renderBackHeader} sessionsList={sessionsList} />;

  // -------------------------------------------------------------
  // SCREEN 1i: PRIVACY & TERMS
  // -------------------------------------------------------------
  if (mobileScreen === "legal") return <LegalScreen renderBackHeader={renderBackHeader} />;

  // -------------------------------------------------------------
  // SCREEN 1j: REFER & EARN
  // -------------------------------------------------------------
  if (mobileScreen === "refer") {
    // Session 36: the referral programme hub (same as desktop /refer)
    return (
      <div className="min-h-screen bg-[#F4F4F8] flex flex-col">
        {renderBackHeader("Invite & earn")}
        <div className="p-4"><ReferralHub compact /></div>
      </div>
    );
  }
  if (mobileScreen === "refer_legacy_unused") {
    const rewardFormatted = referralRewardText(referralStats);
    const referralCode = referralCodeFor(user);
    const referralLink = `${publicOrigin()}/signup?ref=${referralCode}`;

    return (
      <div className="min-h-screen bg-white flex flex-col pb-28">
        {renderBackHeader("Refer & earn")}

        <div className="p-5 space-y-6">
          <div className="bg-gradient-to-br from-indigo-950 via-[#7C3AED] to-purple-900 text-white rounded-3xl p-6 shadow-xl space-y-3">
            <span className="inline-flex items-center gap-1 bg-white/10 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
              Exclusive Reward
            </span>
            <h3 className="text-2xl font-black font-display tracking-tight">
              {rewardFormatted ? `Refer & get ${rewardFormatted} cash` : "Refer & earn"}
            </h3>
            <p className="text-xs text-indigo-100 font-medium leading-relaxed">
              Paid straight to your bank once your referred creator or brand completes their first deal.
            </p>
          </div>

          <div className="bg-[#F9F9FB] rounded-2xl border border-[#E5E5EA] p-4 shadow-2xs space-y-3">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Your Referral Link
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={referralLink}
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 truncate select-all"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(referralLink);
                  setCopiedLink(true);
                  toast.success("Referral link copied! 📋");
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="px-3.5 py-2 bg-[#7C3AED] text-white text-xs font-bold rounded-xl flex items-center gap-1"
              >
                {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                {copiedLink ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // SCREEN 1a: MAIN MOBILE PROFILE HUB (ROOT)
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-white flex flex-col">{/* v356: no pb-32 — the founder note ends the page on the nav */}
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 px-5 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 font-display tracking-tight">My Profile</h1>
          <p className="text-[11px] font-bold text-slate-500">Settings & Creator Hub</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleShareProfile}
            className="w-9 h-9 flex items-center justify-center text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors active:scale-95"
            aria-label="Share Profile"
          >
            <Share2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => setMobileScreen("profile")}
            className="w-9 h-9 flex items-center justify-center text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors active:scale-95"
            aria-label="Edit Profile"
          >
            <Edit2 size={16} />
          </button>
        </div>
      </header>

      <div className="px-5 py-4 space-y-6">
        <ProfileLoadFailed state={profileState} onRetry={reloadProfile} />{/* v372 */}
        {/* Open Identity Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative w-18 h-18 rounded-full border-2 border-[#DDD6FE] bg-slate-100 overflow-hidden shrink-0 shadow-xs">
              <img
                src={profile?.photo || profile?.picture || user?.picture || user?.photo || initialsAvatar(profile?.name || user?.name || "Creator")}
                alt="Avatar"
                className="w-full h-full object-cover"
                onError={(e) => { const f = initialsAvatar(profile?.name || user?.name || "Creator"); if (e.currentTarget.src !== f) e.currentTarget.src = f; }} /* v330: broken photo → initials */
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-lg font-black text-slate-900 truncate font-display">
                  {profile?.name || user?.name || "Creator"}
                </h2>
                {profile?.tier && (
                  <span
                    className={`shrink-0 px-1.5 py-0.5 rounded-md text-[11px] font-black tracking-wider uppercase ${
                      profile.tier === "PLATINUM"
                        ? "bg-slate-800 text-slate-100"
                        : profile.tier === "GOLD"
                        ? "bg-amber-100 text-amber-700"
                        : profile.tier === "SILVER"
                        ? "bg-slate-200 text-slate-600"
                        : "bg-orange-100 text-orange-700"
                    }`}
                  >
                    {profile.tier}
                  </span>
                )}
                {kycIsApproved && (
                  <CheckCircle size={16} className="text-[#7C3AED] shrink-0" />
                )}
              </div>
              {profileState !== "ready" ? <ProfileLinesLoading /> : (<>
              <p className="text-xs text-slate-600 font-bold truncate mt-0.5">
                {profile?.profession || "Content Creator"} · {profile?.niche || "Category not set"}{/* v332 */}
              </p>
              <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1 mt-1 truncate">
                <MapPin size={12} className="shrink-0 text-slate-500" />
                {profile?.location || "Add your city"}{/* v332: no made-up "India" */}
              </p>
              </>)}
              <HubIgHandle profile={profile} />{/* v363 design 1a */}
            </div>
          </div>

          <HubInstagramStrip profile={profile} />{/* v363 (Ravi's design 1a): live Instagram numbers on the hub */}
          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setMobileScreen("profile")}
              className="py-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-black rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <Edit2 size={13} /> Edit Profile
            </button>
            <Link
              to={`/creator/${user?.user_id || user?.id || ''}`}
              className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
            >
              Public Profile <ExternalLink size={12} />
            </Link>
          </div>
        </div>

        {/* v290 (Ravi): admin promo banner right under the profile header (hidden when none is live) */}
        <ProfileBanner style={{ margin: "0 0 14px" }} />
        {/* KYC card — Session 39 (M24, M25): shows the real KYC state. Under review → no button;
            approved → no card. "Start verification" opens the full KYC page, not a half sheet. */}
        {/* v332: hidden when the KYC status couldn't load (it said "Finish KYC" to people who had) */}
        {/* v353: not while the status is still loading (verified creators saw "Finish KYC" flash) */}
        {!kycIsApproved && !(kycFailed && !kycObj) && !(kycLoading && !kycObj) && (kycUnderReview ? (
          <button
            type="button"
            onClick={() => navigate("/kyc/status")}
            className="w-full text-left bg-[#FFFBEB] rounded-2xl p-4 flex items-start gap-3 active:scale-[0.99] transition-transform"
            data-testid="kyc-under-review-card"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-[#B45309] flex items-center justify-center shrink-0 mt-0.5">
              <Clock size={17} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">KYC under review</h4>
              <p className="text-[11px] text-slate-600 font-medium leading-relaxed mt-0.5">
                We're checking your details. Payouts start as soon as it's approved — usually within 24–48 hours.
              </p>
            </div>
          </button>
        ) : (
          <div className="bg-amber-50/60 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-[#E8552F] flex items-center justify-center shrink-0 mt-0.5">
                <ShieldAlert size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  {kycNeedsInfo ? "More details needed" : kycRejected ? "KYC needs another look" : "Finish KYC to get paid"}
                </h4>
                <p className="text-[11px] text-slate-600 font-medium leading-relaxed mt-0.5">
                  {kycRejected
                    ? (kycReason ? `Reason: ${kycReason}. Please fix it and submit again.` : "Your last submission couldn't be approved. Please check your details and submit again.")
                    : "Campaign earnings stay in a secure payment hold; verify your identity so payouts can reach your bank or UPI."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate("/creator/kyc")}
              className="w-full py-2.5 bg-[#E8552F] hover:bg-[#D44723] text-white text-xs font-black rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.99]"
            >
              <Shield size={13} /> {kycRejected ? "Submit again" : "Start verification"}
            </button>
          </div>
        ))}

        {/* GROUP 1: PROFILE */}
        <div className="space-y-1">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider px-1">
            Profile Details
          </span>
          <div className="divide-y divide-slate-100">
            <button
              type="button"
              onClick={() => setMobileScreen("profile")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center shrink-0">
                  <User size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Creator info</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-500" />
            </button>

            <button
              type="button"
              onClick={() => setMobileScreen("platforms")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center shrink-0">
                  <Share2 size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Social platforms</span>
                </div>
              </div>
              <span className="flex items-center gap-2"><HubChip tone="live">{igLive(profile) ? "IG live" : ""}</HubChip><ChevronRight size={16} className="text-slate-500" /></span>
            </button>

            <button
              type="button"
              onClick={() => setMobileScreen("rates")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Briefcase size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Rate cards</span>
                </div>
              </div>
              <span className="flex items-center gap-2"><HubChip tone="warn">{profileState === "ready" && rateCard && !Number(rateCard.reels) ? "Not set" : ""}</HubChip><ChevronRight size={16} className="text-slate-500" /></span>
            </button>

            <button
              type="button"
              onClick={() => setMobileScreen("portfolio")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <FolderKanban size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Portfolio</span>
                </div>
              </div>
              <span className="flex items-center gap-2"><HubChip>{(profile?.portfolio || []).length ? `${(profile.portfolio || []).length} collab${(profile.portfolio || []).length === 1 ? "" : "s"}` : ""}</HubChip><ChevronRight size={16} className="text-slate-500" /></span>
            </button>
          </div>
        </div>

        {/* GROUP 2: MONEY & VERIFICATION */}
        <div className="space-y-1">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider px-1">
            Money & Verification
          </span>
          <div className="divide-y divide-slate-100">
            <Link
              to="/earnings"
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#7C3AED] flex items-center justify-center shrink-0">
                  <CreditCard size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Earnings & payouts</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-500" />
            </Link>

            <button
              type="button"
              onClick={() => navigate(kycIsApproved || kycUnderReview ? "/kyc/status" : "/creator/kyc")} /* Session 39 (M25): full KYC page */
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <Shield size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">KYC verification</span>{/* v353: was "KYC compliance" (jargon) */}
                </div>
              </div>
              <span className="flex items-center gap-2"><HubChip tone="ok">{kycIsApproved ? "Verified" : ""}</HubChip><ChevronRight size={16} className="text-slate-500" /></span>
            </button>

            <button
              type="button"
              onClick={() => setMobileScreen("refer")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center shrink-0">
                  <HeartHandshake size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Invite creators</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* GROUP 3: ACCOUNT & SUPPORT */}
        <div className="space-y-1">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider px-1">
            Account & Support
          </span>
          <div className="divide-y divide-slate-100">
            <button
              type="button"
              onClick={() => setMobileScreen("account")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                  <Settings size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Account</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-500" />
            </button>

            <button
              type="button"
              onClick={() => setMobileScreen("help")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                  <HelpCircle size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Help center</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* Log Out Button — v356: Ravi's settings design (white card, red text), same action */}
        <div className="pt-3">
          <button
            type="button"
            onClick={logout}
            className="w-full h-[54px] bg-white border border-[#ECE7F7] hover:bg-rose-50/40 text-[#DC2626] font-bold text-[14.5px] rounded-[20px] transition-colors flex items-center justify-center gap-2 active:scale-[0.99]"
          >
            <LogOut size={17} /> Log out
          </button>
        </div>

        {/* v356: version line (was "Ybex Media") */}
        <VersionLine className="pt-1" />
      </div>

      {/* v356: founder note footer — full width, sits on the bottom nav */}
      <FounderNoteMobile className="-mb-5 bg-white" />
    </div>
  );
}
