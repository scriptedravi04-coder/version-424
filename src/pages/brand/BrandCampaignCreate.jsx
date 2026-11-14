import { deliverablesLabel } from "../../utils/safeFormat"; // v415
import React, { useState, useEffect, useRef } from "react";
import { followerRangeFor, tiersForRange, followerRangeText } from "../../utils/followerRange"; // v358: + tiersForRange · v416: + followerRangeText
import { istDateString } from "../../utils/istDate"; // v358
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Check, MapPin, Shield, Loader2, Sliders, IndianRupee, Megaphone, Package, CheckCircle } from "lucide-react";
import { CustomDatePicker } from "../../components/ui/custom-date-picker";
import UniversalTagSearch from "../../components/shared/UniversalTagSearch";
import { useAuth } from "../../contexts/AuthContext";
import KycPromptModal from "../../components/common/KycPromptModal";
import useIsMobile from "../../hooks/useIsMobile";
import MobileCampaignCreate from "../../components/campaigns/mobile/MobileCampaignCreate";
import { ignored } from "../../utils/ignored";
import { draftGet, draftRemove, draftSet } from "../../lib/userDraft";
import { lookingForLine, MIN_CAMPAIGN_PAYOUT, campaignErrorText } from "../../components/campaigns/mobile/HomeCampaignCard"; // v415: shared "Looking for" wording · v416: + ₹3,000 floor, calm 5xx text
import { Presence, PopupBackdrop, PopupPanel } from "../../components/common/Popup"; // v416: "leave without saving?" dialog

/** Session 31: Barter → Phase 2. Flip only when the server stores barter campaigns. */
const BARTER_OPEN = false;
import { initialsAvatarUrl } from "../../utils/initials"; // v423 (S11): no third-party avatar service

// v415: the date picker hands back a full ISO time (local midnight → the previous day in UTC). Store the picked
// calendar day as "YYYY-MM-DD" like the phone does, so the close date never shifts by a day.
export function pickedDateToDay(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function BrandCampaignCreateDesktop() {
  const navigate = useNavigate();
  const { user, isKycApproved } = useAuth();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");

  const [brandProfile, setBrandProfile] = useState(null);
  const brandName = brandProfile?.company_name || user?.company_name || user?.name || 'Brand Partner';
  const brandLogoUrl = brandProfile?.logo || brandProfile?.avatar_url || user?.logo || user?.picture || user?.photo || user?.avatar_url || user?.company_logo || user?.profile_image || initialsAvatarUrl(encodeURIComponent(brandName), "6366f1");

  // Authentication & compliance status
  const [kyc, setKyc] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false); // v415: which button shows "Saving…"
  const [showKycPrompt, setShowKycPrompt] = useState(false);
  const [editStatus, setEditStatus] = useState(""); // v358
  const canSaveDraft = !editId || editStatus === "draft"; // v358: same rule as the phone (v344)

  // Restore from Local Storage
  const getInitialState = (key, defaultVal) => {
    try {
      const search = new URLSearchParams(window.location.search);
      if (search.get("edit")) return defaultVal;
      if (search.get("fresh")) return defaultVal; // v358: "New campaign" starts empty (it used to reopen the old draft)
      
      const draftStr = draftGet("campaign_draft");
      if (draftStr) {
        const draft = JSON.parse(draftStr);
        if (draft[key] !== undefined) return draft[key];
      }
    } catch (e) { ignored("BrandCampaignCreate:81", e); }
    return defaultVal;
  };

  // v358: "?fresh=1" only decides the first load — drop it so a reload resumes the NEW draft being typed
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has("fresh")) { u.searchParams.delete("fresh"); window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash); }
    } catch { /* ignore */ }
  }, []);

  // Active Wizard Step (1 to 4)
  const [currentStep, setCurrentStep] = useState(() => getInitialState('currentStep', 1));

  // --- Campaign State Variables ---
  const [campaignTitle, setCampaignTitle] = useState(() => getInitialState('campaignTitle', ""));
  const [requirementsText, setRequirementsText] = useState(() => getInitialState('requirementsText', ""));
  const [selectedCategories, setSelectedCategories] = useState(() => getInitialState('selectedCategories', []));
  
  // Platform & Creator Preferences
  const [selectedPlatforms, setSelectedPlatforms] = useState(() => getInitialState('selectedPlatforms', ["Instagram"])); // Instagram, YouTube
  const [selectedFollowerRanges, setSelectedFollowerRanges] = useState(() => getInitialState('selectedFollowerRanges', ["Micro"])); // Nano, Micro, Macro, Mega, Celeb
  const [gender, setGender] = useState(() => getInitialState('gender', "Both")); // Both, Female, Male
  const [selectedLanguages, setSelectedLanguages] = useState(() => getInitialState('selectedLanguages', ["Hindi", "English"]));

  // Payout, Scope & Logistics
  // Session 31 (Ravi): Barter is hidden until Phase 2 — the server has no barter columns on campaigns
  // and saves budget 0 as ₹2,000–5,000. Only "Paid" can be chosen; an old Barter draft opens as Paid
  // with an empty budget so the brand has to set one.
  const [draftWasBarter] = useState(() => BARTER_OPEN ? false : getInitialState('collabMode', "Paid") === "Barter");
  const [collabMode, setCollabMode] = useState(() => BARTER_OPEN ? getInitialState('collabMode', "Paid") : "Paid"); // Paid (Barter: Phase 2)
  const [barterDescription, setBarterDescription] = useState(() => getInitialState('barterDescription', ""));
  const [budgetType] = useState(() => getInitialState('budgetType', "Per Influencer")); // v415: kept only in the browser draft; the switch is gone (never saved)
  const [isBudgetRange, setIsBudgetRange] = useState(() => getInitialState('isBudgetRange', false));
  const [budget, setBudget] = useState(() => draftWasBarter ? "" : getInitialState('budget', "")); // v358: no example amount pre-filled as the brand's own (placeholder shows one)
  const [budgetMin, setBudgetMin] = useState(() => draftWasBarter ? "" : getInitialState('budgetMin', "")); // v358
  const [budgetMax, setBudgetMax] = useState(() => draftWasBarter ? "" : getInitialState('budgetMax', "")); // v358
  const [deliverablesText, setDeliverablesText] = useState(() => getInitialState('deliverablesText', "")); // v358: empty — the grey hint shows an example
  
  // Logistics & Locations
  const [creatorsNeeded, setCreatorsNeeded] = useState(() => getInitialState('creatorsNeeded', "5-15")); // Less than 5, 5-15, 15-25, 25-50, Enter Manually
  const [customCreatorsNeeded, setCustomCreatorsNeeded] = useState(() => getInitialState('customCreatorsNeeded', "10"));
  const [selectedLocations, setSelectedLocations] = useState(() => getInitialState('selectedLocations', [])); // Array of cities
  const [deadline, setDeadline] = useState(() => getInitialState('deadline', ""));
  // Session 58 (Ravi, Q14): the brand's own Do's / Don'ts / Hashtags (one point per line).
  const [dosText, setDosText] = useState(() => getInitialState('dosText', ""));
  const [dontsText, setDontsText] = useState(() => getInitialState('dontsText', ""));
  const [hashtagsText, setHashtagsText] = useState(() => getInitialState('hashtagsText', ""));
  const [previewTab, setPreviewTab] = useState("card");
  // v416: Back asks "save draft or discard?" instead of silently saving a server draft / dropping edits
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [editLoadedTick, setEditLoadedTick] = useState(0);
  const editBaseSnap = useRef(null);
  const formSnap = JSON.stringify([campaignTitle, requirementsText, selectedCategories, selectedPlatforms, selectedFollowerRanges, gender,
    selectedLanguages, isBudgetRange, budget, budgetMin, budgetMax, deliverablesText, creatorsNeeded, customCreatorsNeeded,
    selectedLocations, deadline, dosText, dontsText, hashtagsText]);
  useEffect(() => { if (editLoadedTick) editBaseSnap.current = formSnap; }, [editLoadedTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasUnsavedWork = editId ? (editBaseSnap.current != null && editBaseSnap.current !== formSnap) : Boolean(campaignTitle.trim() || requirementsText.trim());

  useEffect(() => {
    if (!editId && (campaignTitle || currentStep > 1)) {
      const stateObj = {
        currentStep, campaignTitle, requirementsText, selectedCategories,
        selectedPlatforms, selectedFollowerRanges, gender, selectedLanguages,
        collabMode, barterDescription, budgetType, isBudgetRange, budget,
        budgetMin, budgetMax, deliverablesText, creatorsNeeded, customCreatorsNeeded,
        selectedLocations, deadline, dosText, dontsText, hashtagsText
      };
      draftSet("campaign_draft", JSON.stringify(stateObj));
    }
  }, [editId, currentStep, campaignTitle, requirementsText, selectedCategories,
      selectedPlatforms, selectedFollowerRanges, gender, selectedLanguages,
      collabMode, barterDescription, budgetType, isBudgetRange, budget,
      budgetMin, budgetMax, deliverablesText, creatorsNeeded, customCreatorsNeeded,
      selectedLocations, deadline, dosText, dontsText, hashtagsText]);

  // Search helpers
  const [categorySearch, setCategorySearch] = useState("");
  const [citySearch, setCitySearch] = useState("");

  // Custom static lists
  const INDIAN_LANGUAGES = [
    "English", "Hindi", "Marathi", "Telugu", "Tamil", "Gujarati", "Urdu", "Bhojpuri", "Kannada", "Odia", "Malayalam", "Punjabi", "Assamese", "Bengali"
  ];

  const followerRangesMap = {
    "Nano": { range: "4k - 10k", label: "Nano Creators" },
    "Micro": { range: "10k - 50k", label: "Micro Creators" },
    "Macro": { range: "50k - 500k", label: "Macro Creators" },
    "Mega": { range: "500k - 1M", label: "Mega Stars" },
    "Celeb": { range: "1M+", label: "Celebrities" }
  };

  const getLivePreviewRequirementsString = () => lookingForLine({ // v415
    categories: selectedCategories,
    platforms: selectedPlatforms,
    reach: selectedFollowerRanges.length > 0 ? `${followerRangeText(selectedFollowerRanges) || selectedFollowerRanges.join(" / ")} followers` : "", // v416: sorted + merged ranges
    gender,
    languages: selectedLanguages,
    locations: selectedLocations,
  });

  // v330: en-IN grouping (₹1,50,000), not the browser default (₹150,000)
  // v415: nothing typed yet → "Not set yet" (the preview showed "₹0" / "₹0 - ₹0" as if the brand offered ₹0)
  const getPreviewPayoutDisplay = () => {
    if (collabMode === "Barter") return "Barter Collab";
    const f = (v) => `₹${Number(v).toLocaleString("en-IN")}`;
    if (isBudgetRange) {
      const lo = Number(budgetMin) || 0, hi = Number(budgetMax) || 0;
      if (lo > 0 && hi > lo) return `${f(lo)} – ${f(hi)}`;
      if (lo > 0) return `From ${f(lo)}`;
      if (hi > 0) return `Up to ${f(hi)}`;
      return "Not set yet";
    }
    return Number(budget) > 0 ? f(budget) : "Not set yet";
  };

  // v415: a new step opens at its top — "Next Step" at the bottom of a long form left the next step scrolled half-way
  const formTopRef = useRef(null);
  const firstStepRender = useRef(true);
  useEffect(() => {
    if (firstStepRender.current) { firstStepRender.current = false; return; }
    const el = formTopRef.current;
    if (!el || typeof el.getBoundingClientRect !== "function") return;
    if (el.getBoundingClientRect().top < 0) {
      try { el.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth", block: "start" }); } catch { /* old browsers */ }
    }
  }, [currentStep]);

  // v415: picking a past close date says so right away (it was only caught on Publish)
  const handleDeadlinePick = (value) => {
    const day = pickedDateToDay(value);
    if (!day) return;
    if (day < istDateString(0)) { toast.error("Pick a close date from today onwards."); return; }
    setDeadline(day);
  };

  useEffect(() => {
    // Get brand profile for logo and company name
    api.get("brand-profile")
      .then(({ data }) => setBrandProfile(data))
      .catch(err => {
        console.error(err); // v332: no error pop-up on open — the preview just shows without your logo
      });

    // Get verification details
    api.get("verifications/me")
      .then(({ data }) => setKyc(data))
      .catch(err => {
        console.error(err);
        toast.error("Couldn't check your KYC status right now. You can still save a draft.", { id: "campaign-kyc-load" }); // v332: calm copy
      });

    // Set default deadline to 14 days from now
    // v358: only when nothing was restored — this used to overwrite the deadline of a resumed draft. IST date.
    const restoredDeadline = pickedDateToDay(deadline); // the value restored on first render (initial state) · v415: older drafts saved a full ISO time
    if (restoredDeadline && restoredDeadline !== deadline) setDeadline(restoredDeadline);
    if (!editId && !(/^\d{4}-\d{2}-\d{2}$/.test(String(restoredDeadline)) && String(restoredDeadline) >= istDateString(0))) {
      setDeadline(istDateString(14));
    }

    if (editId) {
      api.get(`/campaigns?mine=true`).then(({ data }) => {
        const found = data.find(c => String(c.campaign_id || c.id) === String(editId));
        if (found) {
          setEditStatus(String(found.status || "").toLowerCase()); // v358: live campaign → no "Save as Draft" (it took it offline)
          setCampaignTitle(found.title || "");
          setRequirementsText(found.description || "");
          setDosText(Array.isArray(found.dos) ? found.dos.join("\n") : (found.dos || ""));
          setDontsText(Array.isArray(found.donts) ? found.donts.join("\n") : (found.donts || ""));
          setHashtagsText(Array.isArray(found.hashtags) ? found.hashtags.join(" ") : (found.hashtags || ""));
          setSelectedCategories(found.categories || []);
          setSelectedPlatforms(found.platforms || ["Instagram"]);
          setCollabMode(BARTER_OPEN ? (found.collab_mode || "Paid") : "Paid");
          setBarterDescription(found.barter_description || "");
          setGender(found.gender || "Both");
          
          if (found.budget_min) {
            setBudget(String(found.budget_min));
            setBudgetMin(String(found.budget_min));
            // Session 58: a fixed fee is stored as min = max — that is not a range (editing it was blocked by "min < max").
            if (found.budget_max && Number(found.budget_max) > Number(found.budget_min)) {
              setIsBudgetRange(true);
              setBudgetMax(String(found.budget_max));
            }
          }
          if (found.deliverables && found.deliverables.length > 0) {
            setDeliverablesText(deliverablesLabel(found.deliverables) /* v415 */); // v358: all of them (only the first was kept)
          }
          // v358: map the saved number back to an option — String(15) matched none and saved as 50
          if (found.max_creators) {
            const count = Number(found.max_creators);
            // v423: 1–3 creators came back as "Less than 5" and were saved as 4 — only exactly 4 maps to that option
            if (count === 4) setCreatorsNeeded("Less than 5");
            else if (count === 15) setCreatorsNeeded("5-15");
            else if (count === 25) setCreatorsNeeded("15-25");
            else if (count === 50) setCreatorsNeeded("25-50"); // shown as its own option below (v423)
            else { setCreatorsNeeded("Enter Manually"); setCustomCreatorsNeeded(String(count)); }
          }
          { const tiers = tiersForRange(found.follower_min, found.follower_max); if (tiers.length) setSelectedFollowerRanges(tiers); } // v358: keep the saved reach (was reset to Micro)
          setSelectedLocations(found.locations || found.specific_locations || []); // Session 58: saved as campaigns.locations
          setDeadline(pickedDateToDay(found.deadline) || ""); // v415: a stored timestamp reads as its day
          if (found.languages) {
            setSelectedLanguages(found.languages);
          }
          setEditLoadedTick((t) => t + 1); // v416: remember the loaded values (Back asks only when something changed)
        }
      }).catch(err => {
        console.error(err);
        toast.error("Couldn't open this campaign for editing. Please try again."); // v332: calm copy
        navigate("/brand/campaigns");
      });
    }
  }, [editId]);

  const handleCategoryToggle = (category) => {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(prev => prev?.filter(c => c !== category));
    } else {
      if (selectedCategories.length < 3) {
        setSelectedCategories(prev => [...prev, category]);
      } else {
        toast.warning("You can pick up to 3 categories.");
      }
    }
  };

  const handlePlatformToggle = (plat) => {
    if (selectedPlatforms.includes(plat)) {
      if (selectedPlatforms.length > 1) {
        setSelectedPlatforms(prev => prev?.filter(p => p !== plat));
      } else {
        toast.warning("At least one social platform must be selected.");
      }
    } else {
      setSelectedPlatforms(prev => [...prev, plat]);
    }
  };

  const handleFollowerToggle = (tier) => {
    if (selectedFollowerRanges.includes(tier)) {
      if (selectedFollowerRanges.length > 1) {
        setSelectedFollowerRanges(prev => prev?.filter(t => t !== tier));
      } else {
        toast.warning("Keep at least one creator size.", { id: "campaign-step" }); // v416: was silent
      }
    } else {
      setSelectedFollowerRanges(prev => [...prev, tier]);
    }
  };

  const handleLocationToggle = (city) => {
    if (selectedLocations.includes(city)) {
      setSelectedLocations(prev => prev?.filter(c => c !== city));
    } else {
      if (selectedLocations.length < 5) {
        setSelectedLocations(prev => [...prev, city]);
      } else {
        toast.warning("Up to 5 focused target cities allowed.");
      }
    }
  };

  const handleLanguageToggle = (lang) => {
    if (selectedLanguages.includes(lang)) {
      setSelectedLanguages(prev => prev?.filter(l => l !== lang));
    } else {
      setSelectedLanguages(prev => [...prev, lang]);
    }
  };

  const handleSaveCampaign = async (isDraftMode = false) => {
    if (submitting) return; // v332: a double tap on "Save as Draft" saved two drafts
    if (!campaignTitle.trim()) {
      toast.error("Add a campaign title first.", { id: "campaign-step" }); // v415
      return;
    }

    // v358: publishing re-checks every step (a resumed draft could jump to the last step with gaps) and the date
    if (!isDraftMode) {
      for (const st of [1, 2, 3]) {
        if (!validateStep(st)) { setCurrentStep(st); return; }
      }
      if (deadline && pickedDateToDay(deadline) < istDateString(0)) {
        toast.error("Pick a future close date.");
        setCurrentStep(4); // v415: the date is on step 4 (it jumped to step 3)
        return;
      }
      // v415: "Custom" creator count must be 1–500 (a blank box was silently saved as 10) — same rule as the phone
      if (creatorsNeeded === "Enter Manually") {
        const n = Number(customCreatorsNeeded);
        if (!Number.isInteger(n) || n < 1 || n > 500) {
          toast.error("Creators needed must be between 1 and 500.", { id: "campaign-step" });
          setCurrentStep(4);
          return;
        }
      }
    }
    if (isDraftMode && !canSaveDraft) return; // v358: never turn a live campaign into a draft

    // If attempting to launch live without KYC approval, prompt the user clearly
    if (!isDraftMode && !isKycApproved) {
      setShowKycPrompt(true);
      return;
    }

    try {
      setSubmitting(true);
      setSavingDraft(isDraftMode); // v415

      const parsedMaxCreators = creatorsNeeded === "Enter Manually" 
        ? Math.min(500, Math.max(1, parseInt(customCreatorsNeeded, 10) || 1)) // v415: clamp 1–500 like the phone (blank was saved as 10)
        : creatorsNeeded === "Less than 5" ? 4 
        : creatorsNeeded === "5-15" ? 15 
        : creatorsNeeded === "15-25" ? 25 
        : 50;

      const payload = {
        title: campaignTitle.trim(),
        // v423: a DRAFT keeps empty fields empty — the made-up defaults became real campaign data
        description: requirementsText.trim() || (isDraftMode ? "" : "No description provided"), // v416: trimmed
        collab_mode: collabMode,
        // v415: no invented ₹1,000 on a draft without a budget (publish is validated above)
        budget_min: collabMode === "Paid" ? ((isBudgetRange ? Number(budgetMin) : Number(budget)) || null) : 0,
        budget_max: collabMode === "Paid" && isBudgetRange ? (Number(budgetMax) || null) : null,
        deliverables: deliverablesText ? [deliverablesText] : (isDraftMode ? [] : ["1 Promo Reel"]),
        deliverables_detailed: [{ duration: "30-60 seconds", collab_type: "Collaborative", type: "Reel", content_type: "Promotional", script_type: "SLA" }],
        categories: selectedCategories.length > 0 ? selectedCategories : (isDraftMode ? [] : ["Fashion & Style"]),
        platforms: selectedPlatforms.length > 0 ? selectedPlatforms : ["Instagram"],
        deadline: pickedDateToDay(deadline) || istDateString(14), // Session 53: was a past date · v415: IST day
        status: isDraftMode ? "draft" : "live",
        location_type: selectedLocations.length > 0 ? "Specific location" : "Pan India",
        specific_locations: selectedLocations,
        language_type: selectedLanguages.length > 0 ? "Select languages" : "Any language",
        languages: selectedLanguages,
        max_creators: parsedMaxCreators,
        brand_type: "Verified",
        // Session 58: the real range picked; no made-up dos / don'ts / hashtags (they were fixed sample text).
        ...followerRangeFor(selectedFollowerRanges),
        gender: gender,
        dos: dosText, // Session 58 (Q14): what the brand typed; the server cleans it
        donts: dontsText,
        hashtags: hashtagsText,
      };

      if (editId) {
        // No fallback to POST /campaigns: when the update failed (not allowed, validation, a
        // network blip) this silently created a SECOND campaign — a duplicate live listing —
        // and reported "updated". A failed update now shows its error (catch below).
        await api.post(`/campaigns/${editId}/update`, payload);
        toast.success(isDraftMode ? "Draft updated" : "Changes sent for review — usually live again in 2–3 hours.", { id: "campaign-save" }); // v358: the server puts edits back into review
      } else {
        await api.post("campaigns", payload);
        toast.success(isDraftMode ? "Draft saved" : "Campaign sent for review — usually live in 2–3 hours.", { id: "campaign-save" }); // v358: it isn't live yet
      }
      
      // Session 58: any successful server save clears the browser copy (a kept copy re-created the same campaign).
      draftRemove("campaign_draft");

      navigate("/brand/campaigns");
    } catch (e) {
      toast.error(campaignErrorText(e, "Couldn't save the campaign. Please check the details and try again."), { id: "campaign-save" }); // v332: no raw err.message · v416: 5xx shows a calm line, not the raw detail
    } finally {
      setSubmitting(false);
    }
  };

  const validateStep = (step) => {
    if (step === 1) {
      if (!campaignTitle.trim()) {
        toast.error("Add a campaign title.", { id: "campaign-step" }); // v415: plain copy, one toast at a time
        return false;
      }
      // v416: same order as the form (brief, then category); spaces alone don't count as a brief
      if (requirementsText.trim().length < 15) {
        toast.error("Write a short brief for creators (at least 15 characters).", { id: "campaign-step" });
        return false;
      }
      if (selectedCategories.length === 0) {
        toast.error("Pick at least 1 category.", { id: "campaign-step" });
        return false;
      }
    }
    if (step === 2) {
      if (selectedPlatforms.length === 0) {
        toast.error("Pick at least one platform.", { id: "campaign-step" });
        return false;
      }
      if (selectedFollowerRanges.length === 0) {
        toast.error("Pick at least one creator size.", { id: "campaign-step" });
        return false;
      }
    }
    if (step === 3) {
      if (collabMode === "Paid") {
        if (isBudgetRange) {
          if (!budgetMin || !budgetMax || Number(budgetMin) >= Number(budgetMax)) {
            toast.error("Enter a minimum and a maximum payout — the minimum must be lower.", { id: "campaign-step" });
            return false;
          }
          if (Number(budgetMin) < MIN_CAMPAIGN_PAYOUT) { // v416: same ₹3,000 floor as invites (₹1 was accepted)
            toast.error(`The lowest payout per creator is ₹${MIN_CAMPAIGN_PAYOUT.toLocaleString("en-IN")}.`, { id: "campaign-step" });
            return false;
          }
        } else {
          if (!budget || Number(budget) <= 0) {
            toast.error("Enter the payout per creator.", { id: "campaign-step" });
            return false;
          }
          if (Number(budget) < MIN_CAMPAIGN_PAYOUT) { // v416
            toast.error(`The lowest payout per creator is ₹${MIN_CAMPAIGN_PAYOUT.toLocaleString("en-IN")}.`, { id: "campaign-step" });
            return false;
          }
        }
      } else {
        if (!barterDescription.trim()) {
          toast.error("Please outline the products or services you are offering for barter.");
          return false;
        }
      }
      if (!deliverablesText.trim()) {
        toast.error("Add what creators should deliver (e.g. 1 Reel).", { id: "campaign-step" });
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 4));
    }
  };

  const handlePrev = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  // v416: "Custom" count shown only when it is a real 1–500 number (0 showed "0 creators")
  const customCountOk = /^\d+$/.test(String(customCreatorsNeeded).trim()) && Number(customCreatorsNeeded) >= 1 && Number(customCreatorsNeeded) <= 500;
  const creatorsWantedText = creatorsNeeded === "Enter Manually"
    ? (customCountOk ? `${Number(customCreatorsNeeded)} creator${Number(customCreatorsNeeded) === 1 ? "" : "s"}` : "")
    : creatorsNeeded === "Less than 5" ? "Under 5 creators" : `${creatorsNeeded} creators`;

  const stepsList = [
    { num: 1, title: "Brief", subtitle: "Title, brief & category" }, // v415: plain step names
    { num: 2, title: "Creators", subtitle: "Platform, size & language" },
    { num: 3, title: "Payout", subtitle: "Budget & deliverables" },
    { num: 4, title: "Publish", subtitle: "Cities, dates & review" }
  ];

  return (
    <div className="w-full max-w-none px-4 sm:px-6 md:px-10 pt-6 pb-10 text-left min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] font-sans">
      
      {/* KYC Warning Banner if Not Approved */}
      {!isKycApproved && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-left">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
              <Shield size={18} />
            </div>
            <div>
              <p className="text-xs font-bold text-[var(--text-primary)]">Business KYC needed to publish</p>
              <p className="text-[11px] text-[var(--text-secondary)]">You can write and save drafts now. Verify your business to publish campaigns to creators.</p>
            </div>
          </div>
          <button
            onClick={() => setShowKycPrompt(true)}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0 transition-colors shadow-sm cursor-pointer"
          >
            Verify Business KYC
          </button>
        </div>
      )}

      {/* HEADER BAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 mb-8 border-b border-[var(--border-default)]">{/* v416: stacks on tablet (buttons wrapped to 3 lines at 768px) */}
        <div>
          <button 
            onClick={() => {
              // Session 58: on Edit, Back never saves a LIVE campaign as a draft (taking it offline).
              // v416: unsaved work → ask "Save draft / Discard / Keep editing" (it silently saved a server draft, or dropped edits)
              if (submitting) return;
              if (hasUnsavedWork) { setLeaveAsk(true); return; }
              navigate("/brand/campaigns");
            }}
            className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-2 transition-colors cursor-pointer"
          >
            <ChevronLeft size={14} /> Back to campaigns
          </button>
          <h1 className="font-display text-2xl sm:text-3xl font-black num-black tracking-tight text-[var(--text-primary)]">
            {editId ? "Edit campaign" : "Create a campaign"}{/* v415: plain copy */}
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Tell creators what you need. Posting is free — you only pay when you hire.
          </p>
        </div>

        {/* Dynamic Action Buttons */}
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          {canSaveDraft && ( /* v358: hidden while editing a live campaign (it took it offline) */
          <button
            onClick={() => handleSaveCampaign(true)}
            disabled={submitting} // v332: looks busy while saving
            className="px-5 py-3 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] border border-[var(--border-default)] text-xs font-bold text-[var(--text-primary)] whitespace-nowrap transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting && savingDraft ? "Saving…" : "Save as Draft"}{/* v415: visible feedback */}
          </button>
          )}
          {currentStep === 4 ? (
            <button
              onClick={() => handleSaveCampaign(false)}
              disabled={submitting}
              className="px-6 py-3 rounded-xl bg-[var(--violet)] hover:bg-[#6B4AFF] text-white text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-2 shadow-xl hover:scale-[1.02] disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> {savingDraft ? "Saving…" : "Publishing…"}
                </>
              ) : (
                <>
                  <Check size={16} strokeWidth={3} /> {editId && editStatus !== "draft" ? "Send changes for review" : "Publish campaign"}{/* v358 · v415: same words as the footer button */}
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="px-5 py-3 rounded-xl bg-[#7C3AED] hover:bg-[#7C3AED] text-white text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1 cursor-pointer"
            >
              Continue <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>

      {/* HORIZONTAL WIZARD TIMELINE PROGRESS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">{/* v416: 2×2 on tablet (4 squashed tiles at 768px) */}
        {stepsList?.map((st) => {
          const isActive = currentStep === st.num;
          const isCompleted = currentStep > st.num;
          return (
            <button
              type="button" /* v416: a real button — reachable with Tab / Enter */
              key={st.num}
              aria-current={isActive ? "step" : undefined}
              onClick={() => {
                // Allow clicking backwards, or forwards only if validated
                if (st.num < currentStep) {
                  setCurrentStep(st.num);
                } else if (st.num > currentStep) {
                  // Validate sequentially
                  let canGo = true;
                  for (let i = currentStep; i < st.num; i++) {
                    if (!validateStep(i)) {
                      canGo = false;
                      break;
                    }
                  }
                  if (canGo) setCurrentStep(st.num);
                }
              }}
              className={`w-full p-4 rounded-2xl border transition-all text-left cursor-pointer select-none relative overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] ${
                isActive 
                  ? "bg-[#7C3AED]/10 border-[#7C3AED] shadow-md" 
                  : isCompleted 
                    ? "bg-[var(--bg-card)] border-emerald-500/40 text-[var(--text-secondary)]" 
                    : "bg-[var(--bg-card)] border-[var(--border-default)] opacity-60 hover:opacity-100"
              }`}
            >
              {isCompleted && (
                <div className="absolute top-2 right-2 p-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                  <Check size={12} strokeWidth={3} />
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                  isActive 
                    ? "bg-[#7C3AED] text-white" 
                    : isCompleted 
                      ? "bg-emerald-500/20 text-emerald-400" 
                      : "bg-foreground/10 text-[var(--text-tertiary)]"
                }`}>
                  {st.num}
                </span>
                <span className="text-xs font-bold text-[var(--text-primary)]">{st.title}</span>
              </div>
              <p className="text-[10px] text-[var(--text-tertiary)] mt-1.5 font-medium">{st.subtitle}</p>
            </button>
          );
        })}
      </div>

      {/* CORE SPLIT WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: ACTIVE STEP FORM WRAPPER (7 cols) */}
        <div ref={formTopRef} className="lg:col-span-7 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-[2rem] p-6 sm:p-8 space-y-6 shadow-xl min-h-[480px] flex flex-col justify-between scroll-mt-6">
          
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              
              {/* STEP 1: CAMPAIGN DISPLAY & CORE NARRATIVE */}
              {currentStep === 1 && (
                <div className="space-y-6 text-left">
                  <div className="pb-3 border-b border-[var(--border-default)]">
                    <h3 className="text-sm font-black uppercase tracking-wider text-[#7C3AED]">Step 1: The brief</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">What creators will read, and the category they find it under.</p>
                  </div>

                  {/* Campaign Title */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-primary)]">Campaign Title *</label>
                    <input
                      type="text"
                      value={campaignTitle}
                      onChange={(e) => setCampaignTitle(e.target.value)}
                      placeholder="e.g. Summer Launch Video Promo, Wearable Tech Reel Campaign"
                      className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] px-4 py-3 rounded-xl text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[#7C3AED] transition-colors"
                    />
                  </div>

                  {/* Requirements Textbox */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-[var(--text-primary)]">Brief for creators *</label>
                      <span className={`text-[10px] font-mono ${requirementsText.trim().length > 0 && requirementsText.trim().length < 15 ? "text-amber-700" : "text-[var(--text-tertiary)]"}`}>{requirementsText.trim().length > 0 && requirementsText.trim().length < 15 ? `${15 - requirementsText.trim().length} more characters needed` : `${requirementsText.length} characters`}</span>{/* v415: says the minimum before Next is pressed */}
                    </div>
                    <textarea
                      value={requirementsText}
                      onChange={(e) => setRequirementsText(e.target.value)}
                      placeholder="Write a clear, inspiring description of your product and what you are looking for in terms of creator content. e.g. We are launching a new skincare serum. Need creators to post a morning routine reel demonstrating usage and texture."
                      rows={6}
                      className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] p-4 rounded-xl text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] leading-relaxed resize-none outline-none focus:border-[#7C3AED] transition-colors"
                    />
                  </div>

                  {/* Session 58 (Q14): Do's / Don'ts / Hashtags — optional */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-[var(--text-primary)]">Do's <span className="font-normal text-[var(--text-tertiary)]">(optional, one per line)</span></label>
                      <textarea value={dosText} onChange={(e) => setDosText(e.target.value)} rows={3} maxLength={2000}
                        placeholder={"Show the product in the first 3 seconds\nTag our page"}
                        className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] p-3 rounded-xl text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] resize-none outline-none focus:border-[#7C3AED]" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-[var(--text-primary)]">Don'ts <span className="font-normal text-[var(--text-tertiary)]">(optional, one per line)</span></label>
                      <textarea value={dontsText} onChange={(e) => setDontsText(e.target.value)} rows={3} maxLength={2000}
                        placeholder={"Don't show other brands\nNo bad language"}
                        className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] p-3 rounded-xl text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] resize-none outline-none focus:border-[#7C3AED]" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-primary)]">Hashtags <span className="font-normal text-[var(--text-tertiary)]">(optional)</span></label>
                    <input value={hashtagsText} onChange={(e) => setHashtagsText(e.target.value)} maxLength={600}
                      placeholder="#yourbrand #newlaunch"
                      className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] px-4 py-3 rounded-xl text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[#7C3AED]" />
                  </div>

                  {/* Categories List Tag Multi-Select */}
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-bold text-[var(--text-primary)]">Categories (up to 3) *</label>
                      <p className="text-[11px] text-[var(--text-secondary)] mb-1">Creators in these categories see your campaign first.</p>
                    </div>

                    <UniversalTagSearch
                      selectedTags={selectedCategories}
                      onChange={newTags => {
                        if (newTags.length <= 3) {
                          setSelectedCategories(newTags);
                        } else {
                          toast.warning("You can pick up to 3 categories.");
                        }
                      }}
                      type="category"
                      placeholder="Search or add a category…"
                    />
                  </div>

                </div>
              )}

              {/* STEP 2: PLATFORMS, FOLLOWER REACH & CREATOR SPECS */}
              {currentStep === 2 && (
                <div className="space-y-6 text-left">
                  <div className="pb-3 border-b border-[var(--border-default)]">
                    <h3 className="text-sm font-black uppercase tracking-wider text-[#7C3AED]">Step 2: Which creators</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">Platform, creator size, gender and content language.</p>
                  </div>

                  {/* Targeted Platforms Grid */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-primary)]">Target Platforms</label>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { id: "Instagram", label: "Instagram", icon: () => <img src="/assets/instagram.svg" className="w-6 h-6 mr-2" alt="Instagram" />, desc: "Reels, Posts & Stories" },
                        { id: "YouTube", label: "YouTube", icon: () => <img src="/assets/youtube.svg" className="w-6 h-6 mr-2" alt="YouTube" />, desc: "Shorts & Dedicated Video Reviews" }
                      ].map(p => {
                        const isSelected = selectedPlatforms.includes(p.id);
                        return (
                          <div
                            key={p.id}
                            onClick={() => handlePlatformToggle(p.id)}
                            className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                              isSelected 
                                ? "bg-[#7C3AED]/10 border-[#7C3AED] shadow-md" 
                                : "bg-[var(--bg-elevated)] border-[var(--border-default)] opacity-70 hover:opacity-100"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className={`flex items-center justify-center w-5 h-5 ${!isSelected ? 'grayscale opacity-50' : ''}`}><p.icon /></div>
                              <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                isSelected ? "border-[#7C3AED] bg-[#7C3AED] text-white" : "border-[var(--border-default)]"
                              }`}>
                                {isSelected && <Check size={10} strokeWidth={3} />}
                              </div>
                            </div>
                            <h4 className="text-xs font-black text-[var(--text-primary)] mt-3">{p.label}</h4>
                            <p className="text-[10px] text-[var(--text-tertiary)] mt-1">{p.desc}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Follower Reach Tiers */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-primary)]">Creator size (pick one or more)</label>
                    <p className="text-[11px] text-[var(--text-secondary)]">By follower count.</p>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                      {Object.keys(followerRangesMap).map(tier => {
                        const isSelected = selectedFollowerRanges.includes(tier);
                        return (
                          <label 
                            key={tier}
                            className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                              isSelected 
                                ? "bg-[#7C3AED]/10 border-[#7C3AED]" 
                                : "bg-[var(--bg-elevated)] border-[var(--border-default)] hover:bg-foreground/5"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleFollowerToggle(tier)}
                                className="rounded text-[#7C3AED] focus:ring-[#7C3AED] bg-transparent border-[var(--border-default)]"
                              />
                              <div>
                                <h5 className="text-xs font-bold text-[var(--text-primary)]">{followerRangesMap[tier].label}</h5>
                                <p className="text-[10px] text-[var(--text-tertiary)]">{followerRangesMap[tier].range} followers</p>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Creator Gender Preference */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-primary)]">Creator gender</label>
                    <div className="flex gap-2">
                      {["Both", "Female", "Male"].map(g => {
                        const isSelected = gender === g;
                        return (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setGender(g)}
                            className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                              isSelected 
                                ? "bg-[#7C3AED]/10 border-[#7C3AED] text-indigo-400 font-black" 
                                : "bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            }`}
                          >
                            {g === "Both" ? "Any Gender" : g}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Content Language select pills */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-primary)]">Content languages</label>
                    <div className="flex flex-wrap gap-1.5">
                      {INDIAN_LANGUAGES?.map(lang => {
                        const isSelected = selectedLanguages.includes(lang);
                        return (
                          <button
                            key={lang}
                            type="button"
                            onClick={() => handleLanguageToggle(lang)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all border cursor-pointer ${
                              isSelected 
                                ? "bg-[#7C3AED]/15 border-[#7C3AED] text-purple-400 font-extrabold" 
                                : "bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            }`}
                          >
                            {lang}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                </div>
              )}

              {/* STEP 3: COMPENSATION STRUCTURE & DELIVERABLES */}
              {currentStep === 3 && (
                <div className="space-y-6 text-left">
                  <div className="pb-3 border-b border-[var(--border-default)]">
                    <h3 className="text-sm font-black uppercase tracking-wider text-[#7C3AED]">Step 3: Payout & deliverables</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">What each creator is paid, and what they need to deliver.</p>
                  </div>

                  {/* Collaboration Mode Switcher — hidden until Barter ships (Phase 2) */}
                  {draftWasBarter && (
                    <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      Barter campaigns are coming later. This draft is now a paid campaign — please set a budget.
                    </p>
                  )}
                  {BARTER_OPEN && <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-primary)]">Collaboration Mode</label>
                    <div className="flex bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-1">
                      <button
                        type="button"
                        onClick={() => setCollabMode("Paid")}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          collabMode === "Paid" 
                            ? "bg-[var(--violet)] text-white shadow-md" 
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        Paid Campaign (Monetary Payouts)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCollabMode("Barter")}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          collabMode === "Barter" 
                            ? "bg-[var(--violet)] text-white shadow-md" 
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        Barter Collab (Product Exchange)
                      </button>
                    </div>
                  </div>}

                  {/* Conditionally render Paid Budget vs Barter Description */}
                  {collabMode === "Paid" ? (
                    <div className="space-y-4 p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider">Payout per creator</h4>
                        
                        {/* Budget Range Switch */}
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isBudgetRange}
                            onChange={(e) => setIsBudgetRange(e.target.checked)}
                            className="rounded text-[#7C3AED] focus:ring-[#7C3AED] bg-transparent border-[var(--border-default)]"
                          />
                          <span className="text-xs font-bold text-[var(--text-secondary)]">Use a range</span>
                        </label>
                      </div>

                      {/* v415: the "Per Influencer / Total Campaign" switch is gone — it was never saved, and every amount is shown to creators as per creator */}
                      {/* Budget input value */}
                      {!isBudgetRange ? (
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-[var(--text-primary)]">Amount (₹)</label>
                          <div className="flex items-center px-4 py-3 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl">
                            <span className="text-sm font-bold text-[var(--text-tertiary)] mr-2">₹</span>
                            <input
                              type="number"
                              value={budget}
                              min={0} inputMode="numeric" onWheel={(e) => e.currentTarget.blur()} /* v415: no negative / scroll-changed amounts */
                              onChange={(e) => setBudget(e.target.value)}
                              placeholder="e.g. 5000"
                              className="w-full bg-transparent border-none outline-none text-sm font-bold text-[var(--text-primary)]"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-[var(--text-primary)]">Minimum (₹)</label>
                            <div className="flex items-center px-4 py-3 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl">
                              <span className="text-sm font-bold text-[var(--text-tertiary)] mr-2">₹</span>
                              <input
                                type="number"
                                value={budgetMin}
                                min={0} inputMode="numeric" onWheel={(e) => e.currentTarget.blur()} /* v415 */
                                onChange={(e) => setBudgetMin(e.target.value)}
                                placeholder="5000"
                                className="w-full bg-transparent border-none outline-none text-sm font-bold text-[var(--text-primary)]"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-[var(--text-primary)]">Maximum (₹)</label>
                            <div className="flex items-center px-4 py-3 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl">
                              <span className="text-sm font-bold text-[var(--text-tertiary)] mr-2">₹</span>
                              <input
                                type="number"
                                value={budgetMax}
                                min={0} inputMode="numeric" onWheel={(e) => e.currentTarget.blur()} /* v415 */
                                onChange={(e) => setBudgetMax(e.target.value)}
                                placeholder="15000"
                                className="w-full bg-transparent border-none outline-none text-sm font-bold text-[var(--text-primary)]"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2 p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <label className="text-xs font-bold text-[var(--text-primary)]">Provide Barter Compensation Details</label>
                      <textarea
                        value={barterDescription}
                        onChange={(e) => setBarterDescription(e.target.value)}
                        placeholder="e.g. We will send 1 full skincare product hamper containing Serum, Hydrating Cream & Sunscreen worth ₹4,500. Free of cost plus exclusive discount code for your followers."
                        rows={4}
                        className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] p-3 rounded-xl text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] leading-relaxed resize-none outline-none focus:border-[#7C3AED]"
                      />
                    </div>
                  )}

                  {/* Creator Deliverables expectations */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-primary)]">Deliverables *</label>{/* v415: was "SLA Content Deliverables Required" */}
                    <input
                      type="text"
                      value={deliverablesText}
                      onChange={(e) => setDeliverablesText(e.target.value)}
                      placeholder="e.g. 1 Instagram Reel (minimum 30 secs) + 1 Instagram Story with Link"
                      className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] px-4 py-3 rounded-xl text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[#7C3AED]"
                    />
                  </div>

                </div>
              )}

              {/* STEP 4: GEOGRAPHICS, DATES, LOGISTICS & SAFETY REVIEW */}
              {currentStep === 4 && (
                <div className="space-y-6 text-left">
                  <div className="pb-3 border-b border-[var(--border-default)]">
                    <h3 className="text-sm font-black uppercase tracking-wider text-[#7C3AED]">Step 4: Cities, dates & publish</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">Where creators should be, when applications close, and how many you want.</p>
                  </div>

                  {/* Location Selector (Pan India vs Specific) */}
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-bold text-[var(--text-primary)]">Creator cities (up to 5)</label>
                      <p className="text-[11px] text-[var(--text-secondary)] mb-2.5">Leave empty to accept creators from anywhere in India.</p>
                      <UniversalTagSearch
                        selectedTags={selectedLocations}
                        onChange={newTags => {
                          if (newTags.length <= 5) {
                            setSelectedLocations(newTags);
                          } else {
                            toast.warning("You can pick up to 5 cities.");
                          }
                        }}
                        type="location"
                        placeholder="Search or type to add any city or state..."
                      />
                    </div>
                  </div>

                  {/* Deadline Custom Date Picker */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--text-primary)]">Applications close on</label>
                    <CustomDatePicker
                      date={deadline}
                      setDate={handleDeadlinePick} /* v415: stores the IST day, refuses past dates right away */
                      placeholder="Pick a close date"
                      className="w-full"
                      disablePast /* v416: past days can't be picked */
                    />
                  </div>

                  {/* Total Creators needed */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-[var(--text-primary)]">How many creators do you want?</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {["Less than 5", "5-15", "15-25", ...(creatorsNeeded === "25-50" ? ["25-50"] : []), "Enter Manually"].map(countOption => { /* v423: a saved 50 shows as selected */
                        const isSelected = creatorsNeeded === countOption;
                        return (
                          <button
                            key={countOption}
                            type="button"
                            onClick={() => setCreatorsNeeded(countOption)}
                            className={`py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                              isSelected 
                                ? "bg-[#7C3AED]/10 border-[#7C3AED] text-indigo-400 font-black" 
                                : "bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-secondary)]"
                            }`}
                          >
                            {countOption === "Enter Manually" ? "Custom" : countOption}
                          </button>
                        );
                      })}
                    </div>

                    {creatorsNeeded === "Enter Manually" && (
                      <div className="space-y-1 pt-1">
                        <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Number of creators (1–500)</label>
                        <input
                          type="number"
                          min={1} max={500} inputMode="numeric" /* v415 */
                          value={customCreatorsNeeded}
                          onChange={(e) => setCustomCreatorsNeeded(e.target.value)}
                          aria-invalid={!customCountOk}
                          aria-label="Number of creators"
                          className={`w-24 bg-[var(--bg-elevated)] border px-3 py-1.5 rounded-lg text-xs font-bold outline-none ${customCountOk ? "border-[var(--border-default)]" : "border-red-400"}`}
                        />
                        {!customCountOk && <p role="alert" className="text-[11px] font-semibold text-red-700">Enter a number from 1 to 500.</p>}{/* v416: said nothing until Publish */}
                      </div>
                    )}
                  </div>

                  {/* Campaign Brief Budget & Escrow Summary (Free to post brief) */}
                  <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl p-5 text-left space-y-3">
                    <div className="flex justify-between items-center pb-3 border-b border-[var(--border-default)]">
                      <div>
                        <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block">Payout per creator</span>
                        <span className="text-xs text-[var(--text-tertiary)]">Shown to creators on the campaign</span>
                      </div>
                      <span className="font-display font-extrabold text-lg text-[var(--violet)]">
                        {collabMode === "Barter" ? "Barter Collaboration" : getPreviewPayoutDisplay()}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center text-[var(--text-secondary)]">
                        <span>Posting this campaign</span>
                        <span className="font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                          Free (₹0 Upfront)
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[var(--text-secondary)]">
                        <span>Creators wanted</span>
                        <span className="font-semibold text-[var(--text-primary)]">
                          {/* v332: no bare " Creators" before a number is typed; "1 creator" */}
                          {creatorsWantedText || "—"}{/* v416 */}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[var(--text-secondary)]">
                        <span>When you pay</span>
                        <span className="font-semibold text-[var(--text-primary)]">
                          Only when hiring a creator
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Escrow Shield Information Notice */}
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex gap-3 text-left">
                    <Shield className="text-emerald-400 shrink-0 mt-0.5" size={16} />
                    <div>
                      <h5 className="font-extrabold text-emerald-700 text-xs uppercase tracking-wider">Pay only when you hire</h5>
                      <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                        Posting is free. Matching creators see your campaign and pitch to you. You pay only after you pick a creator and agree the deal — Ybex holds the payment until the work is approved.
                      </p>
                    </div>
                  </div>

                </div>
              )}

            </motion.div>
          </AnimatePresence>

          {/* BACK / NEXT IN-CARD FLOW CONTROLS */}
          <div className="flex items-center justify-between pt-6 border-t border-[var(--border-default)] mt-8">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentStep === 1}
              className="px-5 py-2.5 rounded-xl border border-[var(--border-default)] text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-foreground/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              Back
            </button>
            <div className="flex gap-2">
              <span className="text-[10px] font-mono font-bold text-[var(--text-tertiary)] flex items-center bg-foreground/5 px-2.5 py-1 rounded-lg">
                Step {currentStep} of 4
              </span>
            </div>
            {currentStep === 4 ? (
              <div className="flex flex-col items-end gap-1">
              {editId && editStatus && editStatus !== "draft" && (
                <span className="text-[10.5px] text-amber-600 font-semibold max-w-[260px] text-right">Creators won't see this campaign until the Ybex team re-approves it (usually 2–3 hours).</span>
              )}{/* v358: say it before saving, not after */}
              <button
                type="button"
                onClick={() => handleSaveCampaign(false)}
                disabled={submitting}
                className="px-6 py-2.5 rounded-xl bg-[#7C3AED] hover:bg-[#7C3AED] text-white text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md hover:scale-[1.01] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}{/* v332: visible busy state */}
                {submitting ? (savingDraft ? "Saving…" : "Sending…") : (editId && editStatus !== "draft" ? "Send changes for review" : "Publish Campaign")}{/* v358: edits go back into review */}
              </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-2.5 rounded-xl bg-[#7C3AED] hover:bg-[#7C3AED] text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                Next Step <ChevronRight size={14} />
              </button>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: HIGH-END DYNAMIC CREATOR PREVIEW PANEL (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text-tertiary)]">What creators will see</h3>{/* v415: the green "Live" tag read as if it was already published */}
            </div>

            {/* Compact Toggle buttons between Card and Detailed view */}
            <div className="flex bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-1 shadow-sm shrink-0">
              <button
                type="button"
                onClick={() => setPreviewTab("card")}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  previewTab === "card"
                    ? "bg-[var(--violet)] text-white shadow-md font-black"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Card
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab("detail")}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  previewTab === "detail"
                    ? "bg-[var(--violet)] text-white shadow-md font-black"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Full page
              </button>
            </div>
          </div>

          {/* Display Container with matching style */}
          <div className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-[2rem] p-6 shadow-xl relative text-left min-w-0 overflow-hidden [overflow-wrap:anywhere]">{/* v415: a long word / title can't push the card wider */}
            <div className="relative z-10">
              
              {previewTab === "card" ? (
                /* FEED CARD PREVIEW (Exactly like Campaigns.jsx) */
                <div className="space-y-6">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex gap-3 items-center min-w-0">
                      <img 
                        src={brandLogoUrl} 
                        alt={brandName} 
                        className="w-12 h-12 rounded-full object-cover border border-[var(--border-default)] shrink-0" 
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = initialsAvatarUrl(encodeURIComponent(brandName), "6366f1");
                        }}
                      />
                      <div>
                        <h4 className="font-bold text-[var(--text-primary)] text-base line-clamp-2 leading-snug">
                          {campaignTitle.trim() || "Your campaign title"}
                        </h4>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 flex items-center gap-1 font-semibold">
                          by {brandName} {isKycApproved && <CheckCircle size={12} className="text-emerald-500 shrink-0" />}{/* v415: tick only when verified */}
                        </p>
                        <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{editId ? "Your campaign" : "Just now"}</p>{/* v416: editing isn't "Just now" */}
                      </div>
                    </div>
                    <div className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider border text-amber-700 bg-amber-500/10 border-amber-500/20 shrink-0">
                      Preview{/* v415: was "Live Draft" */}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                    <CheckCircle size={14} /> Actively reviewing
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Looking for</p>
                    <div className="text-[var(--text-primary)] font-medium text-xs leading-relaxed">
                      {getLivePreviewRequirementsString()}
                    </div>
                  </div>

                  {/* Grid details */}
                  <div className="grid grid-cols-2 gap-2 text-left">
                    <div className="flex items-start gap-2 p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div className="w-7 h-7 rounded-lg bg-[var(--bg-base)] flex items-center justify-center text-[var(--text-primary)] shrink-0"><IndianRupee size={14}/></div>
                      <div className="min-w-0">
                        <p className="text-[11px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider">Payout</p>
                        <p className="font-extrabold text-[var(--text-primary)] text-[11px] truncate">
                          {getPreviewPayoutDisplay()}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-2 p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div className="w-7 h-7 rounded-lg bg-[var(--bg-base)] flex items-center justify-center text-[var(--text-primary)] shrink-0"><Megaphone size={14}/></div>
                      <div className="min-w-0">
                        <p className="text-[11px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider">Platforms</p>
                        <p className="font-extrabold text-[var(--text-primary)] text-[11px] truncate">
                          {selectedPlatforms.join(", ")}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div className="w-7 h-7 rounded-lg bg-[var(--bg-base)] flex items-center justify-center text-[var(--text-primary)] shrink-0"><MapPin size={14}/></div>
                      <div className="min-w-0">
                        <p className="text-[11px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider">Location</p>
                        <p className="font-extrabold text-[var(--text-primary)] text-[11px] truncate">
                          {selectedLocations.length > 0 ? selectedLocations.join(", ") : "Pan India"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div className="w-7 h-7 rounded-lg bg-[var(--bg-base)] flex items-center justify-center text-[var(--text-primary)] shrink-0"><Package size={14}/></div>
                      <div className="min-w-0">
                        <p className="text-[11px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider">Deliverables</p>
                        <p className="font-extrabold text-[var(--text-primary)] text-[11px] truncate" title={deliverablesText}>
                          {deliverablesText || "Not set yet" /* v415: no made-up "1x Post" */}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Description Body */}
                  <div className="text-xs text-[var(--text-primary)] leading-relaxed space-y-1 bg-[var(--bg-elevated)] p-3 rounded-xl border border-[var(--border-default)]">
                    <p><strong>Creators, it's a match!</strong></p>
                    <p className="line-clamp-2 text-[var(--text-secondary)]">
                      {requirementsText.trim() || "Your brief will show here."}
                    </p>
                  </div>

                  {/* Footer Stats */}
                  <div className="border-t border-[var(--border-default)] pt-3.5 flex items-center justify-between gap-2 text-[10px] font-semibold text-[var(--text-secondary)]">
                    {/* v415: real facts of the draft instead of "0 Views · 0 Active Proposals" with grey dummy faces */}
                    <span className="truncate">{deadline ? `Applications close ${new Date(`${pickedDateToDay(deadline)}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}` : "No close date yet"}</span>
                    <span className="text-[var(--violet)] shrink-0">{creatorsWantedText ? (creatorsNeeded === "Less than 5" ? creatorsWantedText : `${creatorsWantedText} wanted`) : ""}</span>{/* v416 */}
                  </div>
                </div>
              ) : (
                /* DETAIL PAGE PREVIEW (Exactly like CampaignDetail.jsx) */
                <div className="space-y-6">
                  {/* Header info */}
                  <div className="flex gap-3 items-center">
                    <img 
                      src={brandLogoUrl} 
                      alt={brandName} 
                      className="w-12 h-12 rounded-full object-cover border border-[var(--border-default)] shrink-0" 
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = initialsAvatarUrl(encodeURIComponent(brandName), "6366f1");
                      }}
                    />
                    <div>
                      <h4 className="font-bold text-[var(--text-primary)] text-sm flex items-center gap-1">
                        {brandName}{isKycApproved && <CheckCircle size={14} className="text-emerald-500 shrink-0" />}{/* v415: no made-up "Marketing Manager · Influencer Specialist"; tick only when verified */}
                      </h4>
                      <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{editId ? "Your campaign" : "Just now"}</p>{/* v416 */}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-500/10 w-fit px-3 py-1 rounded-xl border border-emerald-500/20">
                    <CheckCircle size={14} /> Actively reviewing
                  </div>

                  <h1 className="font-display font-bold text-xl sm:text-2xl tracking-tight leading-tight text-[var(--text-primary)]">
                    {campaignTitle.trim() || "Your campaign title"}
                  </h1>

                  {/* Looking For with pills */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Looking for</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedCategories.length > 0 ? (
                        selectedCategories?.map((cat, i) => (
                          <span key={i} className="px-2.5 py-1 bg-[var(--violet)]/10 text-[var(--violet)] border border-[var(--violet)]/20 rounded-lg text-[10px] font-bold">
                            {cat}
                          </span>
                        ))
                      ) : (
                        <span className="px-2.5 py-1 bg-[var(--border-default)] text-[var(--text-tertiary)] rounded-lg text-[10px] font-semibold">
                          No niches selected
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-primary)] leading-relaxed mt-1 font-medium">
                      {getLivePreviewRequirementsString()}
                    </p>
                  </div>

                  {/* Grid details (Violet accent box style) */}
                  <div className="grid grid-cols-2 gap-2 text-left">
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div className="w-8 h-8 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] flex items-center justify-center text-[var(--violet)] shrink-0">
                        <IndianRupee size={15}/>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider">Payout</p>
                        <p className="font-bold text-[var(--text-primary)] text-xs truncate">
                          {getPreviewPayoutDisplay()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div className="w-8 h-8 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] flex items-center justify-center text-[var(--violet)] shrink-0">
                        <Megaphone size={15}/>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider">Platforms</p>
                        <p className="font-bold text-[var(--text-primary)] text-xs truncate">{selectedPlatforms.join(", ")}</p>{/* v415: was a made-up "Brand Type: Various" */}
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div className="w-8 h-8 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] flex items-center justify-center text-[var(--violet)] shrink-0">
                        <MapPin size={15}/>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider">Location</p>
                        <p className="font-bold text-[var(--text-primary)] text-xs truncate">
                          {selectedLocations.length > 0 ? selectedLocations.join(", ") : "Pan India"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div className="w-8 h-8 rounded-lg bg-[var(--bg-base)] border border-[var(--border-default)] flex items-center justify-center text-[var(--violet)] shrink-0">
                        <Package size={15}/>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider">Deliverables</p>
                        <p className="font-bold text-[var(--text-primary)] text-xs truncate" title={deliverablesText}>
                          {deliverablesText || "Not set yet" /* v415: no made-up "1x Post" */}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Brief Details Description Section */}
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Brief Details</p>
                    <div className="text-xs text-[var(--text-primary)] leading-relaxed space-y-2 bg-[var(--bg-elevated)] p-4 rounded-xl border border-[var(--border-default)]">
                      <p><strong>Creators, it's a match!</strong></p>
                      <p className="whitespace-pre-wrap text-[var(--text-secondary)]">
                        {requirementsText.trim() || "Your brief will show here."}
                      </p>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Quick Creator Reach Match Score Card */}
          <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-default)] flex items-center gap-4 text-left shadow-sm">
            <div className="p-3 bg-[#7C3AED]/10 text-violet-400 rounded-xl shrink-0">
              <Sliders size={18} />
            </div>
            <div>
              <h4 className="text-xs font-black text-[var(--text-primary)]">Creator matching</h4>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                Based on your categories (<span className="text-[#6D28D9] font-bold">{selectedCategories.length > 0 ? selectedCategories.join(", ") : "none picked yet"}</span>), platforms and languages, matching verified creators see your campaign once it's live.
              </p>
            </div>
          </div>

        </div>

      </div>

      {/* v416: leave the wizard with unsaved work */}
      <Presence>{leaveAsk && (
        <PopupBackdrop className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4" onClick={() => !submitting && setLeaveAsk(false)}>
          <PopupPanel kind="modal" closeOnEscape={!submitting} onClose={() => !submitting && setLeaveAsk(false)} aria-labelledby="campaign-leave-title" onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[400px] bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-6 shadow-2xl text-left">
            <h2 id="campaign-leave-title" className="text-base font-bold text-[var(--text-primary)]">Leave without saving?</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
              {canSaveDraft
                ? "Save this campaign as a draft to finish it later, or discard your changes."
                : "Your changes to this live campaign haven't been sent. Discard them and leave?"}
            </p>
            <div className="flex flex-col sm:flex-row-reverse gap-2 mt-5">
              {canSaveDraft && (
                <button type="button" disabled={submitting}
                  onClick={async () => { await handleSaveCampaign(true); setLeaveAsk(false); }}
                  className="min-h-[40px] px-4 rounded-xl bg-[var(--violet)] hover:bg-[#6B4AFF] text-white text-xs font-bold cursor-pointer disabled:opacity-60 flex items-center justify-center gap-1.5">
                  {submitting && <Loader2 size={14} className="animate-spin" />}{submitting ? "Saving…" : "Save draft"}
                </button>
              )}
              <button type="button" disabled={submitting}
                onClick={() => { if (!editId) draftRemove("campaign_draft"); setLeaveAsk(false); navigate("/brand/campaigns"); }}
                className="min-h-[40px] px-4 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 text-xs font-bold cursor-pointer disabled:opacity-60">
                Discard
              </button>
              <button type="button" disabled={submitting} onClick={() => setLeaveAsk(false)}
                className="min-h-[40px] px-4 rounded-xl border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold cursor-pointer sm:mr-auto">
                Keep editing
              </button>
            </div>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      <KycPromptModal
        isOpen={showKycPrompt}
        onClose={() => setShowKycPrompt(false)}
        role="brand"
        actionType="create_campaign"
        allowDraft={true}
        onContinueDraft={async () => {
          setShowKycPrompt(false);
          await handleSaveCampaign(true);
        }}
      />

    </div>
  );
}

export default function BrandCampaignCreate() {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <MobileCampaignCreate />;
  }
  return <BrandCampaignCreateDesktop />;
}

