import { deliverablesLabel } from "../../../utils/safeFormat"; // v415
import React, { useState, useEffect, useMemo } from "react";
import { istDateString } from "../../../utils/istDate";
import { followerRangeFor, tiersForRange, followerRangeText } from "../../../utils/followerRange"; // v358: + tiersForRange · v416: + followerRangeText
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../../lib/api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Calendar, CheckCircle2, ArrowRight, SlidersHorizontal } from "lucide-react";
import { searchLocations } from "../../../lib/locations";
import { useAuth } from "../../../contexts/AuthContext";
import useScrollLock from "../../../lib/useScrollLock";
import { ignored } from "../../../utils/ignored";
import { draftGet, draftRemove, draftSet } from "../../../lib/userDraft";
import BriefFormContent from "./campaignCreate/BriefFormContent";
import CitySheet from "./campaignCreate/CitySheet";
import DatePickerSheet from "./campaignCreate/DatePickerSheet";
import KycShieldNotice, { LeaveDraftSheet } from "./campaignCreate/KycShieldNotice"; // v416: + leave sheet
import LanguageSheet from "./campaignCreate/LanguageSheet";
import NicheSheet from "./campaignCreate/NicheSheet";
import PayoutPerCreator from "./campaignCreate/PayoutPerCreator";
import PlatformsPicker from "./campaignCreate/PlatformsPicker";
import PublishedScreen from "./campaignCreate/PublishedScreen";
import ReviewFeedCard from "./campaignCreate/ReviewFeedCard";
import ReviewHeader from "./campaignCreate/ReviewHeader";
import AdvancedTargetingForm from "./campaignCreate/AdvancedTargetingForm";
import ButtonSpinner from "../../common/ButtonSpinner";
import { lookingForLine, MIN_CAMPAIGN_PAYOUT, campaignErrorText } from "./HomeCampaignCard"; // v415: shared "Looking for" wording · v416: ₹3,000 floor + calm 5xx text

/** Session 31: Barter → Phase 2. Flip only when the server stores barter campaigns. */
const BARTER_OPEN = false;
const minPayText = () => `The lowest payout per creator is ₹${MIN_CAMPAIGN_PAYOUT.toLocaleString("en-IN")}.`; // v419: live floor (loaded by Layout for brands) // v416 (C14)

export default function MobileCampaignCreate() {
  const navigate = useNavigate();
  const { user, isKycApproved } = useAuth();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");

  const [brandProfile, setBrandProfile] = useState(null);
  const [publishedStatus, setPublishedStatus] = useState("");
  // v344: status of the campaign being edited — a live campaign must not get "Save draft" (it took it offline)
  const [editStatus, setEditStatus] = useState("");
  const canSaveDraft = !editId || editStatus === "draft";
  const brandName = brandProfile?.company_name || user?.company_name || user?.name || "Brand Partner";

  const [submitting, setSubmitting] = useState(false);
  const [showKycModal, setShowKycModal] = useState(false);
  const [showNicheSheet, setShowNicheSheet] = useState(false);
  const [showCitySheet, setShowCitySheet] = useState(false);
  const [showLanguageSheet, setShowLanguageSheet] = useState(false);
  const [showDatePickerSheet, setShowDatePickerSheet] = useState(false);
  const [calendarViewMonth, setCalendarViewMonth] = useState(() => new Date());
  // v344: the page behind a bottom sheet must not scroll
  useScrollLock(showNicheSheet || showCitySheet || showLanguageSheet || showDatePickerSheet || showKycModal);
  // v415: Escape closes the open sheet / popup (top-most first)
  useEffect(() => {
    if (!(showNicheSheet || showCitySheet || showLanguageSheet || showDatePickerSheet || showKycModal)) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (showKycModal) setShowKycModal(false);
      else if (showDatePickerSheet) setShowDatePickerSheet(false);
      else if (showCitySheet) setShowCitySheet(false);
      else if (showLanguageSheet) setShowLanguageSheet(false);
      else if (showNicheSheet) setShowNicheSheet(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showNicheSheet, showCitySheet, showLanguageSheet, showDatePickerSheet, showKycModal]);
  // v415: while the phone keyboard is open the pinned button bar sat on top of the keyboard and covered the
  // field being typed in — hide it until the keyboard closes.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return undefined;
    const check = () => setKeyboardOpen(window.innerHeight - vv.height > 150);
    vv.addEventListener("resize", check);
    return () => vv.removeEventListener("resize", check);
  }, []);
  const pinnedBarClass = keyboardOpen ? " hidden" : "";

  // Real single-word category tags state
  const [popularCategoryList, setPopularCategoryList] = useState([]);
  const [searchedCategoryList, setSearchedCategoryList] = useState([]);
  const [isCategorySearching, setIsCategorySearching] = useState(false);

  // Real city location search state
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [isCitySearching, setIsCitySearching] = useState(false);

  // Flow views:
  // "step1" -> Step 1: Brief + KYC banner
  // "step2" -> Step 2: Who & how much
  // "advanced" -> Step 2: Advanced targeting expanded
  // "review" -> Preview / Review & launch (Screen 05 / 06)
  // "published" -> Screen 08: Campaign live
  // Session 58 (Eva handoff §7.2): a draft Eva prepared can open straight on Review & launch (or Advanced).
  const [currentView, setCurrentView] = useState(() => {
    try {
      if (editId) return "step1";
      const v = JSON.parse(draftGet("campaign_draft") || "null")?.openView;
      return v === "review" || v === "advanced" ? v : "step1";
    } catch { return "step1"; }
  });
  const [reviewTab, setReviewTab] = useState("card"); // "card" (Screen 05) or "full" (Screen 06)
  // v415: every step opens at its top (Continue at the bottom of step 1 opened step 2 half-scrolled)
  const firstViewRender = React.useRef(true);
  useEffect(() => {
    if (firstViewRender.current) { firstViewRender.current = false; return; }
    try { window.scrollTo({ top: 0, behavior: "auto" }); } catch { /* jsdom / old browsers */ }
  }, [currentView]);

  // Restore draft from localStorage
  const getInitial = (key, fallback) => {
    try {
      if (editId) return fallback;
      if (new URLSearchParams(window.location.search).get("fresh")) return fallback; // v358: "New campaign" starts empty
      const saved = draftGet("campaign_draft");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed[key] !== undefined) return parsed[key];
        if (key === "campaignTitle" && parsed.title) return parsed.title;
        if (key === "requirementsText" && parsed.description) return parsed.description;
      }
    } catch {
      // ignore
    }
    return fallback;
  };

  // v358: "?fresh=1" only decides the first load — drop it so a reload resumes the NEW draft being typed
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has("fresh")) { u.searchParams.delete("fresh"); window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash); }
    } catch { /* ignore */ }
  }, []);

  // Step 1: Brief State
  const [campaignTitle, setCampaignTitle] = useState(() => getInitial("campaignTitle", ""));
  const [requirementsText, setRequirementsText] = useState(() => getInitial("requirementsText", ""));
  const [selectedCategories, setSelectedCategories] = useState(() => getInitial("selectedCategories", []));

  // Step 2: Who & How Much State
  const [selectedPlatforms, setSelectedPlatforms] = useState(() => getInitial("selectedPlatforms", ["Instagram"]));
  const [selectedFollowerRanges, setSelectedFollowerRanges] = useState(() => getInitial("selectedFollowerRanges", ["Micro"]));
  // Session 31 (Ravi): Barter hidden until Phase 2 (server has no barter columns on campaigns and saves
  // budget 0 as ₹2,000–5,000). An old Barter draft opens as Paid with an empty budget.
  const [draftWasBarter] = useState(() => BARTER_OPEN ? false : getInitial("collabMode", "Paid") === "Barter");
  const [collabMode, setCollabMode] = useState(() => BARTER_OPEN ? getInitial("collabMode", "Paid") : "Paid"); // "Paid" (Barter: Phase 2)
  const [barterDescription, setBarterDescription] = useState(() => getInitial("barterDescription", ""));
  const [isBudgetRange, setIsBudgetRange] = useState(() => getInitial("isBudgetRange", true));
  const [budget, setBudget] = useState(() => draftWasBarter ? "" : getInitial("budget", "")); // v358: no example amount pre-filled
  const [budgetMin, setBudgetMin] = useState(() => draftWasBarter ? "" : getInitial("budgetMin", "")); // v358
  const [budgetMax, setBudgetMax] = useState(() => draftWasBarter ? "" : getInitial("budgetMax", "")); // v358
  // Session 48 (testing team: "why is '1 Reel (30s+)' already typed in Deliverables?"): the box starts
  // empty again — the brand writes what they need; the grey hint shows an example. (A template or a
  // saved draft still fills it.)
  const [deliverablesText, setDeliverablesText] = useState(() =>
    getInitial("deliverablesText", "")
  );

  // Advanced Targeting State
  const [gender, setGender] = useState(() => getInitial("gender", "Any")); // "Any", "Female", "Male"
  const [selectedLanguages, setSelectedLanguages] = useState(() =>
    getInitial("selectedLanguages", ["Hindi", "English"])
  );
  const [selectedLocations, setSelectedLocations] = useState(() => getInitial("selectedLocations", [])); // array of cities
  const [creatorsNeeded, setCreatorsNeeded] = useState(() => getInitial("creatorsNeeded", "5–15")); // "<5", "5–15", "15–25", "Custom"
  const [customCreatorsNeeded, setCustomCreatorsNeeded] = useState(() => getInitial("customCreatorsNeeded", "10"));
  // Session 58 (Ravi, Q14): the brand's own Do's / Don'ts / Hashtags.
  const [dosText, setDosText] = useState(() => getInitial("dosText", ""));
  const [dontsText, setDontsText] = useState(() => getInitial("dontsText", ""));
  const [hashtagsText, setHashtagsText] = useState(() => getInitial("hashtagsText", ""));
  // v416 (C16): Back asks "save draft / discard / keep editing" (new: it saved a device-only copy; live edit: it dropped changes)
  const [leaveAsk, setLeaveAsk] = useState(false); const [editLoadedTick, setEditLoadedTick] = useState(0);
  const editBaseSnapRef = React.useRef(null);
  const [deadline, setDeadline] = useState(() => {
    const fromDraft = getInitial("deadline", "");
    // Session 58: a saved draft's deadline that has already passed is not reused (the campaign went live expired).
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(fromDraft)) && String(fromDraft) >= istDateString(0)) return fromDraft;
    return istDateString(14);
  });

  // Search states for sheets
  const [nicheSearch, setNicheSearch] = useState("");
  const [citySearch, setCitySearch] = useState("");

  // Keep draft updated in localStorage
  useEffect(() => {
    // v346: after a publish the draft was removed, then setCurrentView("published") re-ran this effect and wrote
    // it back ("1 draft" in the list; Resume made a second campaign). Never autosave on the Campaign live screen.
    if (currentView === "published") return;
    if (!editId && (campaignTitle || requirementsText || (selectedCategories && selectedCategories.length > 0) || currentView !== "step1")) {
      const stateObj = {
        title: campaignTitle,
        campaignTitle,
        description: requirementsText,
        requirementsText,
        selectedCategories,
        selectedPlatforms,
        selectedFollowerRanges,
        collabMode,
        barterDescription,
        isBudgetRange,
        budget,
        budgetMin,
        budgetMax,
        deliverablesText,
        gender,
        selectedLanguages,
        selectedLocations,
        creatorsNeeded,
        customCreatorsNeeded,
        deadline,
        dosText,
        dontsText,
        hashtagsText,
        updatedAt: Date.now(),
      };
      draftSet("campaign_draft", JSON.stringify(stateObj));
    }
  }, [
    editId,
    dosText,
    dontsText,
    hashtagsText,
    campaignTitle,
    requirementsText,
    selectedCategories,
    selectedPlatforms,
    selectedFollowerRanges,
    collabMode,
    barterDescription,
    isBudgetRange,
    budget,
    budgetMin,
    budgetMax,
    deliverablesText,
    gender,
    selectedLanguages,
    selectedLocations,
    creatorsNeeded,
    customCreatorsNeeded,
    deadline,
    currentView,
  ]);

  // Load brand profile & existing campaign if edit
  useEffect(() => {
    api
      .get("brand-profile")
      .then(({ data }) => setBrandProfile(data))
      .catch((err) => console.warn("[mobile campaign create] profile load error:", err));

    if (editId) {
      api
        .get(`/campaigns?mine=true`)
        .then(({ data }) => {
          const found = data.find((c) => String(c.campaign_id || c.id) === String(editId));
          if (found) {
            setEditStatus(String(found.status || "").toLowerCase()); // v344
            setCampaignTitle(found.title || "");
            setRequirementsText(found.description || "");
            setDosText(Array.isArray(found.dos) ? found.dos.join("\n") : (found.dos || ""));
            setDontsText(Array.isArray(found.donts) ? found.donts.join("\n") : (found.donts || ""));
            setHashtagsText(Array.isArray(found.hashtags) ? found.hashtags.join(" ") : (found.hashtags || ""));
            setSelectedCategories(found.categories || []);
            setSelectedPlatforms(found.platforms || ["Instagram"]);
            setCollabMode(BARTER_OPEN ? (found.collab_mode || "Paid") : "Paid");
            setBarterDescription(found.barter_description || "");
            setGender(found.gender || "Any");

            if (found.budget_min) {
              setBudget(String(found.budget_min));
              setBudgetMin(String(found.budget_min));
              // Session 58: min = max is a fixed fee, not a range (editing it was blocked by "min < max").
              if (found.budget_max && Number(found.budget_max) > Number(found.budget_min)) {
                setIsBudgetRange(true);
                setBudgetMax(String(found.budget_max));
              } else {
                setIsBudgetRange(false);
              }
            }
            if (found.deliverables && found.deliverables.length > 0) {
              setDeliverablesText(deliverablesLabel(found.deliverables) /* v415 */); // v358: all of them
            }
            { const tiers = tiersForRange(found.follower_min, found.follower_max, ["Nano", "Micro", "Macro", "Mega", "Celebrities"]); if (tiers.length) setSelectedFollowerRanges(tiers); } // v358: keep the saved reach (was reset to Micro)
            if (found.max_creators) {
              const count = Number(found.max_creators);
              // v416 (CR15): only the exact numbers the buttons save map back to them (10 became "5–15" and saved as 15)
              if (count === 4) setCreatorsNeeded("<5");
              else if (count === 15) setCreatorsNeeded("5–15");
              else if (count === 25) setCreatorsNeeded("15–25");
              else {
                setCreatorsNeeded("Custom");
                setCustomCreatorsNeeded(String(count));
              }
            }
            setSelectedLocations(found.locations || found.specific_locations || []); // Session 58: saved as campaigns.locations
            if (found.deadline) setDeadline(found.deadline);
            if (found.languages || found.language) setSelectedLanguages(Array.isArray(found.languages) ? found.languages : String(found.languages || found.language).split(",").map((x) => x.trim()).filter(Boolean)); // Session 58: saved as "Hindi, English"
            setEditLoadedTick((t) => t + 1); // v416 (C16): remember the loaded values
          }
        })
        .catch((err) => {
          console.error(err);
          toast.error("Couldn't open this campaign for editing. Please try again."); // v332: calm wording
          navigate("/brand/campaigns");
        });
    }
  }, [editId, navigate]);

  // Creator reach maps & labels
  const followerRangesMap = {
    Nano: { label: "Nano", reach: "4k–10k" },
    Micro: { label: "Micro · 10k–50k", reach: "10k–50k" },
    Macro: { label: "Macro · 50k–500k", reach: "50k–500k" },
    Mega: { label: "Mega", reach: "500k–1M" },
    Celebrities: { label: "Celebrities", reach: "1M+" },
  };

  // Live preview requirement string (desktop parity)
  // v415: shared wording with desktop (it read "Any Niche creators … , , Pan India." with no languages)
  const previewRequirementsString = useMemo(() => lookingForLine({
    categories: selectedCategories,
    platforms: selectedPlatforms,
    reach: selectedFollowerRanges.length > 0 ? `${followerRangeText(selectedFollowerRanges) || selectedFollowerRanges.map((r) => followerRangesMap[r]?.reach || r).join(" / ")} followers` : "", // v416 (C21): sorted + merged
    gender,
    languages: selectedLanguages,
    locations: selectedLocations,
  }), [selectedCategories, selectedPlatforms, selectedFollowerRanges, gender, selectedLanguages, selectedLocations]); // eslint-disable-line react-hooks/exhaustive-deps

  // Payout display string
  const previewPayoutDisplay = useMemo(() => {
    if (collabMode === "Barter") return "Barter Collab";
    // v415: nothing typed → "Not set yet" (was "₹0 – ₹0")
    const f = (v) => `₹${Number(v).toLocaleString("en-IN")}`;
    if (isBudgetRange) {
      const lo = Number(budgetMin) || 0, hi = Number(budgetMax) || 0;
      if (lo > 0 && hi > lo) return `${f(lo)} – ${f(hi)}`;
      if (lo > 0) return `From ${f(lo)}`;
      if (hi > 0) return `Up to ${f(hi)}`;
      return "Not set yet";
    }
    return Number(budget) > 0 ? f(budget) : "Not set yet";
  }, [collabMode, isBudgetRange, budget, budgetMin, budgetMax]);

  // Days remaining calculation
  const deadlineDaysLeft = useMemo(() => {
    if (!deadline) return "in 14 days";
    try {
      const target = new Date(deadline);
      const now = new Date();
      const diffMs = target.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays <= 0) return "today";
      if (diffDays === 1) return "tomorrow";
      return `in ${diffDays} days`;
    } catch {
      return "in 14 days";
    }
  }, [deadline]);

  // Formatted deadline date string (e.g. "29 Sep 2026")
  const formattedDeadlineDate = useMemo(() => {
    if (!deadline) return new Date(Date.now() + 14 * 864e5).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    try {
      const parts = deadline.split("-");
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      }
      return deadline;
    } catch {
      return deadline;
    }
  }, [deadline]);

  // Helper to preserve full category names (e.g. "Self-care", "Mental Health", "Real Estate")
  // while cleaning out parenthesized subcategories (e.g. "Fashion (Apparel, Shoes)" -> "Fashion")
  const cleanCategoryName = (raw) => {
    if (!raw || typeof raw !== "string") return "";
    let s = raw.trim();
    // Remove parenthesized subcategories
    s = s.replace(/\s*\([^)]*\)/g, "");
    // Remove subcategory lists following colons or dashes
    s = s.replace(/:\s*[^,]+(?:,[^,]+)*$/i, "");
    s = s.trim();
    if (!s) return "";
    // Preserve hyphens (e.g., Self-care, E-commerce) and capitalize words properly
    return s
      .split(" ")
      .map((word) => {
        if (word.includes("-")) {
          return word
            .split("-")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join("-");
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ");
  };

  // Base category presets (with full names like Self-care preserved)
  // v332: these counts are not real — NicheSheet hides them (preset: true); only server counts are shown.
  const SINGLE_WORD_PRESETS = useMemo(() => [
    { name: "Fashion", count: 1420 },
    { name: "Beauty", count: 1240 },
    { name: "Skincare", count: 1180 },
    { name: "Self-care", count: 760 },
    { name: "Makeup", count: 960 },
    { name: "Lifestyle", count: 980 },
    { name: "Travel", count: 690 },
    { name: "Food", count: 750 },
    { name: "Fitness", count: 820 },
    { name: "Finance", count: 460 },
    { name: "Gaming", count: 410 },
    { name: "Tech", count: 540 },
    { name: "Education", count: 380 },
    { name: "Entertainment", count: 890 },
    { name: "Health", count: 620 },
    { name: "Wellness", count: 570 },
    { name: "Parenting", count: 320 },
    { name: "Comedy", count: 640 },
    { name: "Music", count: 290 },
    { name: "Art", count: 210 },
    { name: "Automotive", count: 350 },
    { name: "Photography", count: 270 },
    { name: "Videography", count: 240 },
    { name: "Sports", count: 480 },
    { name: "Crypto", count: 310 },
    { name: "Yoga", count: 260 },
    { name: "Home Decor", count: 330 },
    { name: "Books", count: 190 },
    { name: "Dance", count: 340 },
    { name: "DIY & Crafts", count: 280 },
  ].map((x) => ({ ...x, preset: true })), []);

  // Fetch popular categories on mount from real API
  useEffect(() => {
    let isMounted = true;
    fetch("/api/tags/popular?type=niche")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : (data?.tags || data?.data || []);
        if (list.length > 0) {
          const formatted = list
            .map((t) => {
              const str = typeof t === "string" ? t : (t?.name || "");
              const cleanWord = cleanCategoryName(str);
              if (!cleanWord) return null;
              return {
                name: cleanWord,
                count: t?.count || null, // v332: no made-up creator count when the server has none
              };
            })
            .filter(Boolean);

          const seen = new Set();
          const unique = formatted.filter((item) => {
            const key = item.name.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          if (unique.length > 0) setPopularCategoryList(unique);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Search categories with debounce
  useEffect(() => {
    const q = nicheSearch.trim().toLowerCase();
    if (!q) {
      setSearchedCategoryList([]);
      setIsCategorySearching(false);
      return;
    }

    setIsCategorySearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tags/search?q=${encodeURIComponent(q)}&type=niche`);
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data?.suggestions || data?.tags || data?.data || []);
          if (list.length > 0) {
            const formatted = list
              .map((t) => {
                const str = typeof t === "string" ? t : (t?.name || "");
                const cleanWord = cleanCategoryName(str);
                if (!cleanWord) return null;
                return {
                  name: cleanWord,
                  count: t?.count || null, // v332: no made-up creator count
                };
              })
              .filter(Boolean);

            const seen = new Set();
            const unique = formatted.filter((item) => {
              const key = item.name.toLowerCase();
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            setSearchedCategoryList(unique);
          } else {
            setSearchedCategoryList([]);
          }
        }
      } catch {
        setSearchedCategoryList([]);
      } finally {
        setIsCategorySearching(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [nicheSearch]);

  const filteredNiches = useMemo(() => {
    const query = nicheSearch.trim().toLowerCase();
    if (query) {
      if (searchedCategoryList.length > 0) return searchedCategoryList;
      const pool = popularCategoryList.length > 0 ? popularCategoryList : SINGLE_WORD_PRESETS;
      return pool.filter((item) => item.name.toLowerCase().includes(query)).slice(0, 30);
    }
    const pool = popularCategoryList.length > 0 ? popularCategoryList : SINGLE_WORD_PRESETS;
    return pool;
  }, [nicheSearch, searchedCategoryList, popularCategoryList, SINGLE_WORD_PRESETS]);

  // Real City search: instant local indexing + debounced /api/locations/search
  useEffect(() => {
    const q = citySearch.trim().toLowerCase();
    if (!q) {
      const defaultMetros = [
        { name: "Mumbai", state: "Maharashtra", country: "India" },
        { name: "Delhi", state: "Delhi", country: "India" },
        { name: "Bengaluru", state: "Karnataka", country: "India" },
        { name: "Hyderabad", state: "Telangana", country: "India" },
        { name: "Ahmedabad", state: "Gujarat", country: "India" },
        { name: "Chennai", state: "Tamil Nadu", country: "India" },
        { name: "Kolkata", state: "West Bengal", country: "India" },
        { name: "Pune", state: "Maharashtra", country: "India" },
        { name: "Jaipur", state: "Rajasthan", country: "India" },
        { name: "Surat", state: "Gujarat", country: "India" },
        { name: "Lucknow", state: "Uttar Pradesh", country: "India" },
        { name: "Chandigarh", state: "Punjab", country: "India" },
        { name: "Indore", state: "Madhya Pradesh", country: "India" },
        { name: "Goa", state: "Goa", country: "India" },
        { name: "Kochi", state: "Kerala", country: "India" },
      ];
      setCitySuggestions(defaultMetros);
      return;
    }

    let localMatches = [];
    try {
      localMatches = searchLocations(q, 15) || [];
    } catch {
      localMatches = [];
    }
    setCitySuggestions(localMatches);

    let alive = true; // v416 (CR14): an older, slower answer can't overwrite the newer search; api helper reaches the live server in the app
    const timer = setTimeout(async () => {
      try {
        setIsCitySearching(true);
        const data = (await api.get(`locations/search?q=${encodeURIComponent(q)}&limit=15`))?.data;
        if (alive && Array.isArray(data) && data.length > 0) {
          const combined = [...localMatches];
          data.forEach((item) => { if (item && item.name && !combined.some((c) => c.name.toLowerCase() === item.name.toLowerCase())) combined.push(item); });
          setCitySuggestions(combined.slice(0, 20));
        }
      } catch { /* keep localMatches */ } finally { if (alive) setIsCitySearching(false); }
    }, 150);

    return () => { alive = false; clearTimeout(timer); };
  }, [citySearch]);

  // Actions & Toggles
  const handleNicheToggle = (nicheName) => {
    if (selectedCategories.includes(nicheName)) {
      setSelectedCategories((prev) => prev.filter((n) => n !== nicheName));
    } else {
      if (selectedCategories.length >= 3) {
        toast.warning("You can pick up to 3 niches.");
        return;
      }
      setSelectedCategories((prev) => [...prev, nicheName]);
    }
  };

  const handleCreateCustomNiche = (name) => {
    let clean = name.trim();
    if (!clean) return;
    clean = clean.split(/[\s\-_]+/)[0];
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    if (!clean) return;
    if (selectedCategories.length >= 3) {
      toast.warning("You can pick up to 3 niches.");
      return;
    }
    if (!selectedCategories.includes(clean)) {
      setSelectedCategories((prev) => [...prev, clean]);
    }
    setNicheSearch("");
  };

  const handlePlatformToggle = (platform) => {
    if (selectedPlatforms.includes(platform)) {
      if (selectedPlatforms.length <= 1) {
        toast.warning("At least one platform must remain selected.");
        return;
      }
      setSelectedPlatforms((prev) => prev.filter((p) => p !== platform));
    } else {
      setSelectedPlatforms((prev) => [...prev, platform]);
    }
  };

  const handleReachToggle = (tier) => {
    if (selectedFollowerRanges.includes(tier)) {
      if (selectedFollowerRanges.length <= 1) {
        toast.warning("At least one reach tier must remain selected.");
        return;
      }
      setSelectedFollowerRanges((prev) => prev.filter((t) => t !== tier));
    } else {
      setSelectedFollowerRanges((prev) => [...prev, tier]);
    }
  };

  const handleCityToggle = (city) => {
    if (selectedLocations.includes(city)) {
      setSelectedLocations((prev) => prev.filter((c) => c !== city));
    } else {
      if (selectedLocations.length >= 5) {
        toast.warning("Up to 5 focused cities allowed.");
        return;
      }
      setSelectedLocations((prev) => [...prev, city]);
    }
  };

  const handleLanguageToggle = (lang) => {
    if (selectedLanguages.includes(lang)) {
      if (selectedLanguages.length <= 1) {
        toast.warning("Please keep at least one content language.");
        return;
      }
      setSelectedLanguages((prev) => prev.filter((l) => l !== lang));
    } else {
      setSelectedLanguages((prev) => [...prev, lang]);
    }
  };

  const handleResetAdvanced = () => {
    setGender("Any");
    setSelectedLanguages(["Hindi", "English"]);
    setSelectedLocations([]);
    setCreatorsNeeded("5–15");
    setCustomCreatorsNeeded("10");
    setDeadline(istDateString(14)); // Session 58: IST date
    toast.success("Advanced targeting reset to defaults.");
  };

  // Step 1 Validation
  const handleContinueStep1 = () => {
    if (!campaignTitle.trim()) {
      toast.error("Please enter a campaign title.", { id: "campaign-step" });
      return;
    }
    if (requirementsText.trim().length < 15) {
      toast.error("Please enter a creative brief (minimum 15 characters).", { id: "campaign-step" });
      return;
    }
    if (selectedCategories.length === 0) {
      toast.error("Please select at least 1 niche.", { id: "campaign-step" });
      return;
    }
    setCurrentView("step2");
  };

  // Step 2 Validation -> Preview
  const handleContinueStep2 = () => {
    if (selectedPlatforms.length === 0) {
      toast.error("Please select at least one platform.", { id: "campaign-step" });
      return;
    }
    if (selectedFollowerRanges.length === 0) {
      toast.error("Please select creator reach.", { id: "campaign-step" });
      return;
    }
    if (collabMode === "Paid") {
      if (isBudgetRange) {
        // v344: min > 0, max > 0, min <= max — each with its own clear message
        if (!(Number(budgetMin) > 0)) {
          toast.error("Please enter a minimum payout above ₹0.", { id: "campaign-step" });
          return;
        }
        if (!(Number(budgetMax) > 0)) {
          toast.error("Please enter a maximum payout above ₹0.", { id: "campaign-step" });
          return;
        }
        if (Number(budgetMin) > Number(budgetMax)) {
          toast.error("Min payout can't be more than max payout.", { id: "campaign-step" });
          return;
        }
        if (Number(budgetMin) < MIN_CAMPAIGN_PAYOUT) { toast.error(minPayText(), { id: "campaign-step" }); return; } // v416 (C14): same ₹3,000 floor as invites
      } else {
        if (!(Number(budget) > 0)) { // v344
          toast.error("Please enter a payout above ₹0.", { id: "campaign-step" });
          return;
        }
        if (Number(budget) < MIN_CAMPAIGN_PAYOUT) { toast.error(minPayText(), { id: "campaign-step" }); return; } // v416 (C14)
      }
    } else {
      if (!barterDescription.trim()) {
        toast.error("Please describe what product/service you offer for barter.");
        return;
      }
    }
    if (!deliverablesText.trim()) {
      toast.error("Please specify creator deliverables.", { id: "campaign-step" });
      return;
    }
    // v344: creators needed must be 1–500 (was silently turned 0 into 10)
    if (creatorsNeeded === "Custom") {
      const n = Number(customCreatorsNeeded);
      if (!Number.isInteger(n) || n < 1 || n > 500) {
        toast.error("Creators needed must be between 1 and 500.", { id: "campaign-step" });
        return;
      }
    }
    setCurrentView("review");
  };

  // Save / Publish logic connected directly to desktop endpoints
  const handleSaveCampaign = async (isDraftMode = false) => {
    if (submitting) return; // v415: a double tap on Publish / Save draft sent it twice
    if (!campaignTitle.trim()) {
      toast.error("Add a campaign title first.", { id: "campaign-step" }); // v415: one toast at a time
      return;
    }

    // If publishing live without KYC approval, show the mobile KYC modal (Screen 07)
    if (!isDraftMode && !isKycApproved) {
      setShowKycModal(true);
      return;
    }

    // v358: publish re-checks the brief too (an Eva draft can open straight on Review) and the close date
    if (!isDraftMode) {
      if (requirementsText.trim().length < 15) { toast.error("Please enter a creative brief (minimum 15 characters).", { id: "campaign-step" }); setCurrentView("step1"); return; }
      if (selectedCategories.length === 0) { toast.error("Please select at least 1 niche.", { id: "campaign-step" }); setCurrentView("step1"); return; }
      if (deadline && String(deadline) < istDateString(0)) { toast.error("Pick a future close date."); return; }
    }
    if (isDraftMode && !canSaveDraft) return; // v358: never turn a live campaign into a draft

    try {
      // v344: re-check payout + creator count here too (publish can be reached without step 2's Continue)
      if (!isDraftMode && collabMode === "Paid") {
        const lo = Number(isBudgetRange ? budgetMin : budget);
        const hi = isBudgetRange ? Number(budgetMax) : lo;
        if (!(lo > 0) || !(hi > 0) || lo > hi) {
          toast.error(!(lo > 0) || !(hi > 0) ? "Please enter a payout above ₹0." : "Min payout can't be more than max payout.", { id: "campaign-step" });
          return;
        }
        if (lo < MIN_CAMPAIGN_PAYOUT) { toast.error(minPayText(), { id: "campaign-step" }); setCurrentView("step2"); return; } // v416 (C14)
      }
      const customCount = Number(customCreatorsNeeded);
      if (!isDraftMode && creatorsNeeded === "Custom" && (!Number.isInteger(customCount) || customCount < 1 || customCount > 500)) {
        toast.error("Creators needed must be between 1 and 500.", { id: "campaign-step" });
        return;
      }

      setSubmitting(true);

      const parsedMaxCreators =
        creatorsNeeded === "Custom"
          ? Math.min(500, Math.max(1, parseInt(customCreatorsNeeded, 10) || 1)) // v344: clamp 1–500, no silent 0→10
          : creatorsNeeded === "<5"
          ? 4
          : creatorsNeeded === "5–15"
          ? 15
          : creatorsNeeded === "15–25"
          ? 25
          : 50;

      const payload = {
        title: campaignTitle.trim(),
        description: requirementsText.trim() || "No description provided",
        collab_mode: collabMode,
        budget_min:
          collabMode === "Paid"
            ? isBudgetRange
              ? Number(budgetMin) // v344: no 1000 fallback (it silently changed 0) — validated above
              : Number(budget)
            : 0,
        budget_max: collabMode === "Paid" && isBudgetRange ? Number(budgetMax) || null : null,
        deliverables: [deliverablesText.trim() || "1 Promo Reel"],
        deliverables_detailed: [
          {
            duration: "30-60 seconds",
            collab_type: "Collaborative",
            type: "Reel",
            content_type: "Promotional",
            script_type: "SLA",
          },
        ],
        categories: selectedCategories.length > 0 ? selectedCategories : ["Beauty & skincare"],
        platforms: selectedPlatforms.length > 0 ? selectedPlatforms : ["Instagram"],
        deadline: deadline || istDateString(14), // Session 53: was a past date; Session 58: IST date
        status: isDraftMode ? "draft" : "live",
        location_type: selectedLocations.length > 0 ? "Specific location" : "Pan India",
        specific_locations: selectedLocations,
        language_type: selectedLanguages.length > 0 ? "Select languages" : "Any language",
        languages: selectedLanguages,
        max_creators: parsedMaxCreators,
        brand_type: "Verified",
        // Session 58: the real range picked; no made-up dos / don'ts / hashtags (they were fixed sample text).
        dos: dosText, // Session 58 (Q14): what the brand typed; the server cleans it
        donts: dontsText,
        hashtags: hashtagsText,
        ...followerRangeFor(selectedFollowerRanges),
        gender: gender === "Any" ? "Both" : gender,
      };

      if (editId) {
        // No fallback to POST /campaigns: when the update failed (not allowed, validation, a
        // network blip) this silently created a SECOND campaign — a duplicate live listing —
        // and reported "updated". A failed update now shows its error (catch below).
        await api.post(`/campaigns/${editId}/update`, payload);
        // v344: the server puts an edited campaign under review — say so (was "updated and launched")
        if (!isDraftMode) setPublishedStatus("under_review");
        toast.success(isDraftMode ? "Draft updated" : "Changes sent for review", { id: "campaign-save" });
      } else {
        const created = await api.post("campaigns", payload);
        const st = String(created?.data?.status || created?.data?.campaign?.status || created?.data?.data?.status || "").toLowerCase();
        setPublishedStatus(st);
        toast.success(isDraftMode ? "Draft saved" : st.includes("review") || st.includes("pending") ? "Campaign sent for review" : "Campaign published", { id: "campaign-save" });
      }

      if (!editId) { // Session 58: a saved draft lives on the server now — the browser copy would make a second one
        draftRemove("campaign_draft");
      }

      if (!isDraftMode) {
        // Show Screen 08 (Campaign Live)
        setCurrentView("published");
      } else {
        navigate("/brand/campaigns");
      }
    } catch (e) {
      toast.error(campaignErrorText(e, "Couldn't save the campaign. Please try again."), { id: "campaign-save" }); // v332 · v416: 5xx never shows the raw detail
    } finally {
      setSubmitting(false);
    }
  };

  // Header back navigation handler
  const formSnap = JSON.stringify([campaignTitle, requirementsText, selectedCategories, selectedPlatforms, selectedFollowerRanges, collabMode, isBudgetRange, budget, budgetMin, budgetMax, deliverablesText, gender, selectedLanguages, selectedLocations, creatorsNeeded, customCreatorsNeeded, deadline, dosText, dontsText, hashtagsText]);
  useEffect(() => { if (editLoadedTick) editBaseSnapRef.current = formSnap; }, [editLoadedTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasUnsavedWork = editId ? (editBaseSnapRef.current != null && editBaseSnapRef.current !== formSnap) : Boolean(campaignTitle.trim() || requirementsText.trim() || selectedCategories.length > 0);
  // v416 (C16): leaving step 1 with unsaved work asks first
  const handleHeaderBack = () => {
    if (currentView === "step1" && hasUnsavedWork && !submitting) { setLeaveAsk(true); return; }
    if (currentView === "step1") {
      // Session 58: never keep an EDIT of an existing campaign as a new-campaign draft (resuming it made a copy).
      if (!editId && (campaignTitle.trim() || requirementsText.trim() || selectedCategories.length > 0)) {
        const stateObj = {
          title: campaignTitle,
          campaignTitle,
          description: requirementsText,
          requirementsText,
          selectedCategories,
          selectedPlatforms,
          selectedFollowerRanges,
          collabMode,
          barterDescription,
          isBudgetRange,
          budget,
          budgetMin,
          budgetMax,
          deliverablesText,
          gender,
          selectedLanguages,
          selectedLocations,
          creatorsNeeded,
          customCreatorsNeeded,
          deadline,
          dosText,
          dontsText,
          hashtagsText,
          updatedAt: Date.now(),
        };
        try {
          draftSet("campaign_draft", JSON.stringify(stateObj));
        } catch (e) { ignored("MobileCampaignCreate:786", e); }
        toast.info("Draft saved on this device.", { id: "campaign-save" }); // v415: says where it is
      }
      navigate("/brand/campaigns");
    } else if (currentView === "step2") {
      setCurrentView("step1");
    } else if (currentView === "advanced") {
      setCurrentView("step2");
    } else if (currentView === "review") {
      setCurrentView("step2");
    } else if (currentView === "published") {
      navigate("/brand/campaigns");
    }
  };

  // -------------------------------------------------------------
  // RENDER: Screen 08 · Campaign Live
  // -------------------------------------------------------------
  if (currentView === "published") {
    const inReview = !publishedStatus || /review|pending|submitted/.test(publishedStatus);
    return (
      <div className="w-full min-h-screen bg-[#F2F2F7] flex flex-col font-['DM_Sans',sans-serif] text-left pb-8">
        <PublishedScreen isEdit={!!editId} brandName={brandName} brandProfile={brandProfile} campaignTitle={campaignTitle} formattedDeadlineDate={formattedDeadlineDate} inReview={inReview} navigate={navigate} previewPayoutDisplay={previewPayoutDisplay} selectedPlatforms={selectedPlatforms} user={user} />
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: Screen 04 · Advanced Targeting Expanded
  // -------------------------------------------------------------
  if (currentView === "advanced") {
    return (
      <div className="w-full min-h-screen bg-[#F2F2F7] flex flex-col font-['DM_Sans',sans-serif] text-left">
        {/* Sticky Header */}
        <div className="bg-white shrink-0 border-b border-[#E5E5EA] pb-4 sticky top-0 z-20">
          <div className="h-[52px] px-5 flex items-center justify-between">
            <button
              onClick={() => setCurrentView("step2")}
              aria-label="Back" /* v332: icon-only button, 40px tap target */
              className="w-10 h-10 rounded-[11px] bg-white border border-[#E5E5EA] flex items-center justify-center cursor-pointer transition-colors"
            >
              <ChevronLeft size={17} className="text-[#0A0A0A] stroke-[2.2]" />
            </button>
            <div className="text-[10.5px] font-semibold tracking-[0.9px] uppercase text-[#6B7280]">
              Advanced targeting
            </div>
            <button
              onClick={handleResetAdvanced}
              className="text-[12.5px] font-medium text-[#7C3AED] hover:text-[#6D28D9] cursor-pointer"
            >
              Reset
            </button>
          </div>
          <div className="px-5 flex gap-1.5">
            <div className="flex-1 h-[3px] rounded-[2px] bg-[#7C3AED]" />
            <div className="flex-1 h-[3px] rounded-[2px] bg-[#7C3AED]" />
          </div>
        </div>

        {/* Form Body */}
        <AdvancedTargetingForm creatorsNeeded={creatorsNeeded} customCreatorsNeeded={customCreatorsNeeded} deadline={deadline} deadlineDaysLeft={deadlineDaysLeft} formattedDeadlineDate={formattedDeadlineDate} gender={gender} handleCityToggle={handleCityToggle} handleLanguageToggle={handleLanguageToggle} selectedLanguages={selectedLanguages} selectedLocations={selectedLocations} setCalendarViewMonth={setCalendarViewMonth} setCreatorsNeeded={setCreatorsNeeded} setCustomCreatorsNeeded={setCustomCreatorsNeeded} setGender={setGender} setShowCitySheet={setShowCitySheet} setShowDatePickerSheet={setShowDatePickerSheet} setShowLanguageSheet={setShowLanguageSheet} />

        {/* Bottom Pinned Button */}
        <div className={`fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-[#E5E5EA] z-20${pinnedBarClass}`} /* v415: hidden while typing */ style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }} /* v330: clear the iPhone home bar */>
          <button
            onClick={() => setCurrentView("step2")}
            className="w-full h-[52px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold text-[15px] flex items-center justify-center transition-colors cursor-pointer"
          >
            Apply targeting
          </button>
        </div>

        {/* City Sheet */}
        {renderCitySheet()}
        {/* Language Sheet */}
        {renderLanguageSheet()}
        {/* Date Picker Calendar Sheet */}
        {renderDatePickerSheet()}
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: Screen 05 & 06 · Review & Launch
  // -------------------------------------------------------------
  if (currentView === "review") {
    return (
      <div className="w-full min-h-screen bg-[#F2F2F7] flex flex-col font-['DM_Sans',sans-serif] text-left">
        {/* Header */}
        <ReviewHeader reviewTab={reviewTab} setCurrentView={setCurrentView} setReviewTab={setReviewTab} />

        {/* Tab 1: Screen 05 Feed Card */}
        <ReviewFeedCard brandName={brandName} brandProfile={brandProfile} campaignTitle={campaignTitle} creatorsNeeded={creatorsNeeded} customCreatorsNeeded={customCreatorsNeeded} deliverablesText={deliverablesText} formattedDeadlineDate={formattedDeadlineDate} previewPayoutDisplay={previewPayoutDisplay} previewRequirementsString={previewRequirementsString} requirementsText={requirementsText} reviewTab={reviewTab} selectedCategories={selectedCategories} selectedLocations={selectedLocations} selectedPlatforms={selectedPlatforms} user={user} isKycApproved={isKycApproved} /* v358 */ />

        {/* Tab 2: Screen 06 Full Brief */}
        {reviewTab === "full" && (
          <div className="flex-1 px-5 pt-4 pb-[calc(112px+env(safe-area-inset-bottom))] flex flex-col gap-3.5">{/* v332: last card hid under the pinned button + home bar */}
            {/* Actively reviewing status badge */}
            <div className="px-3 py-1.5 rounded-[9px] bg-[#E9F9F1] border border-[#C3EBD7] flex items-center gap-1.5 self-start">
              <CheckCircle2 size={12} className="text-[#047857] stroke-[2.4]" />
              <span className="text-[11.5px] font-semibold text-[#047857]">Preview · how creators see it</span>{/* v332: was "Actively reviewing" on an unpublished draft */}
            </div>

            <h2 className="text-[22px] font-semibold leading-[1.28] tracking-[-0.6px] text-[#0A0A0A]">
              {campaignTitle}
            </h2>
            <div className="text-[12.5px] font-medium text-[#6B7280]">{brandName}</div>{/* v332: no made-up "Marketing Manager" job title */}

            {/* The brief */}
            <div>
              <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">The brief</div>
              <div className="mt-2 p-3.5 rounded-[14px] bg-white border border-[#E5E5EA] text-[13px] leading-[1.6] text-[#3F3F46]">
                {requirementsText}
              </div>
            </div>

            {/* Specs rows */}
            <div className="flex flex-col gap-2">
              <div className="p-3 px-3.5 rounded-[13px] bg-white border border-[#E5E5EA] flex items-center justify-between gap-3">
                <span className="text-[12.5px] font-medium text-[#6B7280] shrink-0">Deliverables</span>
                <span className="text-[13px] font-semibold text-[#0A0A0A] text-right break-words min-w-0">{deliverablesText}</span>
              </div>
              <div className="p-3 px-3.5 rounded-[13px] bg-white border border-[#E5E5EA] flex items-center justify-between gap-3">
                <span className="text-[12.5px] font-medium text-[#6B7280] shrink-0">Reach tiers</span>
                <span className="text-[13px] font-semibold text-[#0A0A0A] text-right break-words min-w-0">{selectedFollowerRanges.join(", ")}</span>
              </div>
              <div className="p-3 px-3.5 rounded-[13px] bg-white border border-[#E5E5EA] flex items-center justify-between gap-3">
                <span className="text-[12.5px] font-medium text-[#6B7280] shrink-0">Languages</span>
                <span className="text-[13px] font-semibold text-[#0A0A0A] text-right break-words min-w-0">{selectedLanguages.join(", ")}</span>
              </div>
            </div>

            {/* Budget shown to creators card */}
            <div className="p-3.5 rounded-[14px] bg-white border border-[#E5E5EA]">
              <div className="flex items-baseline justify-between pb-2.5 border-b border-[#E5E5EA]">
                <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
                  Budget shown to creators
                </div>
                <div className="text-[15px] font-semibold text-[#7C3AED]">{previewPayoutDisplay}</div>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <div className="text-[12.5px] font-medium text-[#6B7280]">Publishing this brief</div>
                <div className="px-2 py-0.5 rounded-[7px] bg-[#E9F9F1] border border-[#C3EBD7] text-[11px] font-semibold text-[#047857]">
                  Free · ₹0
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-[12.5px] font-medium text-[#6B7280]">Secure payment hold funded</div>
                <div className="text-[12.5px] font-semibold text-[#0A0A0A]">Only on hiring</div>
              </div>
            </div>
          </div>
        )}

        {/* Pinned Bottom Actions */}
        <div className={`fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-[#E5E5EA] z-20 flex flex-col gap-2${pinnedBarClass}`} /* v415 */ style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }} /* v330: clear the iPhone home bar */>
          {editId && editStatus && editStatus !== "draft" && (
            <div className="text-[12px] leading-snug text-[#B45309] font-medium text-center">Creators won't see this campaign until the Ybex team re-approves it (usually 2–3 hours).</div>
          )}{/* v358: say it before saving */}
          <button
            onClick={() => handleSaveCampaign(false)}
            disabled={submitting}
            className="w-full h-[52px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold text-[15px] flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
          >
            {submitting ? (
              <ButtonSpinner label="Publishing brief…" size={16} /> /* v332: standard button spinner */
            ) : (
              editId && editStatus && editStatus !== "draft" ? "Send changes for review" : "Publish campaign" // v358: edits go back into review
            )}
          </button>
          {reviewTab === "card" && canSaveDraft && ( /* v344: no "Save as draft" on a live campaign */
            <button
              onClick={() => handleSaveCampaign(true)}
              disabled={submitting}
              className="w-full h-[46px] rounded-[14px] bg-white border border-[#E5E5EA] text-[#3F3F46] font-semibold text-[14px] flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50" /* v330: looked tappable while publishing */
            >
              Save as draft
            </button>
          )}
        </div>

        {/* Screen 07: KYC Blocks Publish Modal */}
        {renderKycModal()}
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: Screen 03 · Step 2 · Who & How Much
  // -------------------------------------------------------------
  if (currentView === "step2") {
    return (
      <div className="w-full min-h-screen bg-[#F2F2F7] flex flex-col font-['DM_Sans',sans-serif] text-left">
        {/* Sticky Header */}
        <div className="bg-white shrink-0 border-b border-[#E5E5EA] pb-4 sticky top-0 z-20">
          <div className="h-[52px] px-5 flex items-center justify-between">
            <button
              onClick={handleHeaderBack}
              aria-label="Back" /* v332: icon-only button, 40px tap target */
              className="w-10 h-10 rounded-[11px] bg-white border border-[#E5E5EA] flex items-center justify-center cursor-pointer transition-colors"
            >
              <ChevronLeft size={17} className="text-[#0A0A0A] stroke-[2.2]" />
            </button>
            <div className="text-[10.5px] font-semibold tracking-[0.9px] uppercase text-[#6B7280]">
              {editId ? "Edit campaign" : "New campaign"} · 2 of 2{/* v344 */}
            </div>
            {canSaveDraft ? ( /* v344: hidden while editing a live campaign */
            <button
              onClick={() => handleSaveCampaign(true)}
              disabled={submitting} /* v332: a second tap saved a second draft */
              className="min-h-[40px] text-[12.5px] font-medium text-[#7C3AED] hover:text-[#6D28D9] cursor-pointer disabled:opacity-50"
            >
              Save draft
            </button>
            ) : <span className="w-10" />}
          </div>
          <div className="px-5 flex gap-1.5">
            <div className="flex-1 h-[3px] rounded-[2px] bg-[#7C3AED]" />
            <div className="flex-1 h-[3px] rounded-[2px] bg-[#7C3AED]" />
          </div>
        </div>

        {/* Form Body */}
        <div className="flex-1 px-5 pt-4 pb-[calc(112px+env(safe-area-inset-bottom))] flex flex-col gap-4">
          {/* Platforms */}
          <PlatformsPicker handlePlatformToggle={handlePlatformToggle} selectedPlatforms={selectedPlatforms} />

          {/* Creator Reach */}
          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">Creator reach</div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {["Nano", "Micro", "Macro", "Mega", "Celebrities"].map((tierKey) => {
                const isSelected = selectedFollowerRanges.includes(tierKey);
                const item = followerRangesMap[tierKey];
                return (
                  <button
                    key={tierKey}
                    type="button"
                    onClick={() => handleReachToggle(tierKey)}
                    className={`px-3 py-2 rounded-[11px] text-[12.5px] transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#F1E8FF] border border-[#DCC9FB] font-semibold text-[#6D28D9]"
                        : "bg-white border border-[#E5E5EA] font-medium text-[#3F3F46]"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Paid / Barter Toggle — hidden until Barter ships (Phase 2) */}
          {draftWasBarter && (
            <div className="p-3 rounded-[12px] bg-[#FFFBEB] border border-[#FDE68A] text-[12px] leading-[1.4] font-medium text-[#92400E]">
              Barter campaigns are coming later. This draft is now a paid campaign — please set a budget.
            </div>
          )}
          {BARTER_OPEN && <div className="h-[40px] rounded-[12px] bg-[#E9E9EF] p-[3px] flex gap-1">
            <button
              type="button"
              onClick={() => setCollabMode("Paid")}
              className={`flex-1 rounded-[9px] text-[13px] flex items-center justify-center transition-all cursor-pointer ${
                collabMode === "Paid" ? "bg-[#7C3AED] font-semibold text-white" : "font-semibold text-[#6B7280]"
              }`}
            >
              Paid
            </button>
            <button
              type="button"
              onClick={() => setCollabMode("Barter")}
              className={`flex-1 rounded-[9px] text-[13px] flex items-center justify-center transition-all cursor-pointer ${
                collabMode === "Barter" ? "bg-[#7C3AED] font-semibold text-white" : "font-semibold text-[#6B7280]"
              }`}
            >
              Barter
            </button>
          </div>}

          {/* Payout Per Creator (if Paid) */}
          <PayoutPerCreator barterDescription={barterDescription} budget={budget} budgetMax={budgetMax} budgetMin={budgetMin} collabMode={collabMode} isBudgetRange={isBudgetRange} setBarterDescription={setBarterDescription} setBudget={setBudget} setBudgetMax={setBudgetMax} setBudgetMin={setBudgetMin} setIsBudgetRange={setIsBudgetRange} />

          {/* Deliverables */}
          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">Deliverables</div>
            <div className="mt-2.5 h-[48px] rounded-[14px] bg-white border border-[#E5E5EA] flex items-center px-4">
              <input
                type="text"
                value={deliverablesText}
                onChange={(e) => setDeliverablesText(e.target.value)}
                placeholder="e.g. 1 Reel + 2 Stories with link"
                className="w-full bg-transparent text-[16px] font-medium text-[#0A0A0A] outline-none" /* v332: 16px stops iOS zoom */
              />
            </div>
          </div>

          {/* Applications Close Date */}
          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
              Applications close
            </div>
            <button
              type="button"
              onClick={() => {
                if (deadline) {
                  const parts = deadline.split("-");
                  if (parts.length === 3) {
                    setCalendarViewMonth(new Date(Number(parts[0]), Number(parts[1]) - 1, 1));
                  }
                }
                setShowDatePickerSheet(true);
              }}
              className="mt-2.5 w-full h-[52px] rounded-[14px] bg-white border border-[#E5E5EA] flex items-center gap-2.5 px-4 text-left cursor-pointer hover:border-[#7C3AED]/40 transition-colors"
            >
              <Calendar size={18} className="text-[#7C3AED] stroke-[1.9] shrink-0" />
              <div className="flex-1 text-[14px] font-semibold text-[#0A0A0A]">{formattedDeadlineDate}</div>
              <div className="text-[11.5px] font-semibold text-[#7C3AED] bg-[#F1E8FF] px-2.5 py-1 rounded-[8px]">
                {deadlineDaysLeft}
              </div>
            </button>
          </div>

          {/* Advanced Targeting Trigger Row */}
          <button
            type="button"
            onClick={() => setCurrentView("advanced")}
            className="h-[54px] rounded-[14px] bg-white border border-[#E5E5EA] flex items-center gap-3 px-4 text-left transition-colors cursor-pointer hover:border-[#7C3AED]/40"
          >
            <SlidersHorizontal size={17} className="text-[#7C3AED] stroke-[1.9] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-semibold text-[#0A0A0A]">Advanced targeting</div>
              <div className="mt-0.5 text-[11px] text-[#6B7280] truncate">
                {gender} gender · {selectedLanguages.slice(0, 2).join(", ")} ·{" "}
                {selectedLocations.length > 0 ? selectedLocations.slice(0, 2).join(", ") : "Pan India"} ·{" "}
                {/* v332: showed a bare "5–15" / "Custom" */}
                {creatorsNeeded === "Custom" ? (Number(customCreatorsNeeded) >= 1 && Number(customCreatorsNeeded) <= 500 ? `${Number(customCreatorsNeeded)} creator${Number(customCreatorsNeeded) === 1 ? "" : "s"}` : "Custom creators") : creatorsNeeded === "<5" ? "Under 5 creators" : `${creatorsNeeded} creators`}{/* v416: no "0 creators" */}
              </div>
            </div>
            <ChevronLeft size={15} className="text-[#6B7280] stroke-[2.2] rotate-180 shrink-0" />
          </button>
        </div>

        {/* Pinned Bottom Button */}
        <div className={`fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-[#E5E5EA] z-20${pinnedBarClass}`} /* v415: hidden while typing */ style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }} /* v330: clear the iPhone home bar */>
          <button
            onClick={handleContinueStep2}
            className="w-full h-[52px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>Preview brief</span>
            <ArrowRight size={15} className="stroke-[2.2]" />
          </button>
        </div>

        {/* Date Picker Calendar Sheet */}
        {renderDatePickerSheet()}
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: Screen 01 · Step 1 · Brief + KYC Banner
  // -------------------------------------------------------------
  return (
    <div className="w-full min-h-screen bg-[#F2F2F7] flex flex-col font-['DM_Sans',sans-serif] text-left">
      {/* Sticky Header */}
      <div className="bg-white shrink-0 border-b border-[#E5E5EA] pb-4 sticky top-0 z-20">
        <div className="h-[52px] px-5 flex items-center justify-between">
          <button
            onClick={handleHeaderBack}
            aria-label="Back" /* v332: icon-only button, 40px tap target */
            className="w-10 h-10 rounded-[11px] bg-white border border-[#E5E5EA] flex items-center justify-center cursor-pointer transition-colors"
          >
            <ChevronLeft size={17} className="text-[#0A0A0A] stroke-[2.2]" />
          </button>
          <div className="text-[10.5px] font-semibold tracking-[0.9px] uppercase text-[#6B7280]">
            {editId ? "Edit campaign" : "New campaign"} · 1 of 2{/* v344 */}
          </div>
          {canSaveDraft ? ( /* v344: hidden while editing a live campaign */
          <button
            onClick={() => handleSaveCampaign(true)}
            disabled={submitting} /* v332: a second tap saved a second draft */
            className="min-h-[40px] text-[12.5px] font-medium text-[#7C3AED] hover:text-[#6D28D9] cursor-pointer disabled:opacity-50"
          >
            Save draft
          </button>
          ) : <span className="w-10" />}
        </div>
        <div className="px-5 flex gap-1.5">
          <div className="flex-1 h-[3px] rounded-[2px] bg-[#7C3AED]" />
          <div className="flex-1 h-[3px] rounded-[2px] bg-[#E5E5EA]" />
        </div>
      </div>

      {/* Form Content */}
      <BriefFormContent campaignTitle={campaignTitle} handleNicheToggle={handleNicheToggle} isKycApproved={isKycApproved} requirementsText={requirementsText} selectedCategories={selectedCategories} setCampaignTitle={setCampaignTitle} setRequirementsText={setRequirementsText} setShowKycModal={setShowKycModal} setShowNicheSheet={setShowNicheSheet} dosText={dosText} setDosText={setDosText} dontsText={dontsText} setDontsText={setDontsText} hashtagsText={hashtagsText} setHashtagsText={setHashtagsText} />

      {/* Pinned Bottom Button */}
      <div className={`fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-[#E5E5EA] z-20${pinnedBarClass}`} /* v415: hidden while typing */ style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }} /* v330: clear the iPhone home bar */>
        <button
          onClick={handleContinueStep1}
          className="w-full h-[52px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <span>Continue</span>
          <ArrowRight size={15} className="stroke-[2.2]" />
        </button>
      </div>

      {/* Screen 02: Niche Picker Sheet */}
      {renderNicheSheet()}

      {/* Screen 07: KYC Blocks Publish Modal */}
      {renderKycModal()}

      <LeaveDraftSheet open={leaveAsk} busy={submitting} canSaveDraft={canSaveDraft} onClose={() => setLeaveAsk(false)} /* v416 (C16) */
        onSave={async () => { await handleSaveCampaign(true); setLeaveAsk(false); }}
        onDiscard={() => { if (!editId) draftRemove("campaign_draft"); setLeaveAsk(false); navigate("/brand/campaigns"); }} />
    </div>
  );

  // -------------------------------------------------------------
  // HELPER MODALS & BOTTOM SHEETS
  // -------------------------------------------------------------

  // Screen 02: Niche Picker Sheet (Bottom Sheet - Single-Word Categories)
  function renderNicheSheet() {
    return (
      <AnimatePresence>
        {showNicheSheet && (
          <div className="fixed inset-0 z-[70] flex items-end">{/* v415: above the bottom nav / sticky header (z-50) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNicheSheet(false)}
              className="fixed inset-0 bg-[#0C0C12]/40 backdrop-blur-xs"
            />
            <NicheSheet filteredNiches={filteredNiches} handleCreateCustomNiche={handleCreateCustomNiche} handleNicheToggle={handleNicheToggle} isCategorySearching={isCategorySearching} nicheSearch={nicheSearch} selectedCategories={selectedCategories} setNicheSearch={setNicheSearch} setShowNicheSheet={setShowNicheSheet} />
          </div>
        )}
      </AnimatePresence>
    );
  }

  // City Picker Bottom Sheet (Roomy, Airy & Connected to Real Search API)
  function renderCitySheet() {
    return (
      <AnimatePresence>
        {showCitySheet && (
          <div className="fixed inset-0 z-[70] flex items-end">{/* v415: above the bottom nav / sticky header (z-50) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCitySheet(false)}
              className="fixed inset-0 bg-[#0C0C12]/40 backdrop-blur-xs"
            />
            <CitySheet citySearch={citySearch} citySuggestions={citySuggestions} handleCityToggle={handleCityToggle} isCitySearching={isCitySearching} selectedLocations={selectedLocations} setCitySearch={setCitySearch} setSelectedLocations={setSelectedLocations} setShowCitySheet={setShowCitySheet} />
          </div>
        )}
      </AnimatePresence>
    );
  }

  // Applications Close Date: Desktop-like Calendar Bottom Sheet
  function renderDatePickerSheet() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const year = calendarViewMonth.getFullYear();
    const month = calendarViewMonth.getMonth();

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const currentMonthLabel = `${monthNames[month]} ${year}`;

    // Days in current month
    const totalDays = new Date(year, month + 1, 0).getDate();
    // Starting day of week (0: Sun, 1: Mon, etc.)
    const firstDayIndex = new Date(year, month, 1).getDay();

    const isPrevDisabled =
      year < today.getFullYear() || (year === today.getFullYear() && month <= today.getMonth());

    const handlePrevMonth = () => {
      if (isPrevDisabled) return;
      setCalendarViewMonth(new Date(year, month - 1, 1));
    };

    const handleNextMonth = () => {
      setCalendarViewMonth(new Date(year, month + 1, 1));
    };

    const handleSelectDay = (day) => {
      const targetDate = new Date(year, month, day);
      if (targetDate < today) return;
      const yStr = targetDate.getFullYear();
      const mStr = String(targetDate.getMonth() + 1).padStart(2, "0");
      const dStr = String(targetDate.getDate()).padStart(2, "0");
      setDeadline(`${yStr}-${mStr}-${dStr}`);
    };

    const handlePreset = (daysToAdd) => {
      const target = new Date();
      target.setDate(target.getDate() + daysToAdd);
      const yStr = target.getFullYear();
      const mStr = String(target.getMonth() + 1).padStart(2, "0");
      const dStr = String(target.getDate()).padStart(2, "0");
      setDeadline(`${yStr}-${mStr}-${dStr}`);
      setCalendarViewMonth(new Date(yStr, target.getMonth(), 1));
    };

    // Parse current deadline
    let selectedYear = null;
    let selectedMonth = null;
    let selectedDay = null;
    if (deadline) {
      const parts = deadline.split("-");
      if (parts.length === 3) {
        selectedYear = Number(parts[0]);
        selectedMonth = Number(parts[1]) - 1;
        selectedDay = Number(parts[2]);
      }
    }

    return (
      <AnimatePresence>
        {showDatePickerSheet && (
          <div className="fixed inset-0 z-[70] flex items-end">{/* v415: above the bottom nav / sticky header (z-50) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDatePickerSheet(false)}
              className="fixed inset-0 bg-[#0C0C12]/40 backdrop-blur-xs"
            />
            <DatePickerSheet currentMonthLabel={currentMonthLabel} deadlineDaysLeft={deadlineDaysLeft} firstDayIndex={firstDayIndex} formattedDeadlineDate={formattedDeadlineDate} handleNextMonth={handleNextMonth} handlePreset={handlePreset} handlePrevMonth={handlePrevMonth} handleSelectDay={handleSelectDay} isPrevDisabled={isPrevDisabled} month={month} selectedDay={selectedDay} selectedMonth={selectedMonth} selectedYear={selectedYear} setShowDatePickerSheet={setShowDatePickerSheet} today={today} totalDays={totalDays} year={year} />
          </div>
        )}
      </AnimatePresence>
    );
  }

  // Language Sheet
  function renderLanguageSheet() {
    return (
      <AnimatePresence>
        {showLanguageSheet && (
          <div className="fixed inset-0 z-[70] flex items-end">{/* v415: above the bottom nav / sticky header (z-50) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLanguageSheet(false)}
              className="fixed inset-0 bg-[#0C0C12]/40 backdrop-blur-xs"
            />
            <LanguageSheet handleLanguageToggle={handleLanguageToggle} selectedLanguages={selectedLanguages} setShowLanguageSheet={setShowLanguageSheet} />
          </div>
        )}
      </AnimatePresence>
    );
  }

  // Screen 07: KYC Blocks Publish Modal
  function renderKycModal() {
    return (
      <AnimatePresence>
        {showKycModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-5" role="dialog" aria-modal="true" aria-label="Verify your business to publish">{/* v415 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowKycModal(false)}
              className="fixed inset-0 bg-[#0C0C12]/45 backdrop-blur-xs"
            />
            <KycShieldNotice handleSaveCampaign={handleSaveCampaign} navigate={navigate} setShowKycModal={setShowKycModal} canSaveDraft={canSaveDraft} /* v358 */ />
          </div>
        )}
      </AnimatePresence>
    );
  }
}
