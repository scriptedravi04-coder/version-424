import { ownDb } from "../../lib/ownDb";
import React, { useState, useEffect, useRef } from "react";
import { safeJsonParse, safeUpper } from "../../utils/safeFormat";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, Shield, Loader2, Camera } from "lucide-react";
import TrustAvatars from "../../components/onboarding/mobile/TrustAvatars";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../lib/api";
import { fetchPinCodeDetails } from "../../api/onboarding";
import UniversalTagSearch from "../../components/shared/UniversalTagSearch";
import { VALID_NICHES } from "../../lib/constants";
import MobileOnboardingHeader, { MobilePrimaryButton, MobileChip, MobileFieldLabel, MobileTextInput } from "../../components/onboarding/mobile/MobileOnboardingShell";
import { ignored } from "../../utils/ignored";
import { loadProgress, saveProgress, resumeFor, brandPageFromMobile, userNeedsPhone, isValidIndianMobile } from "../../lib/onboardingProgress";
import { OnboardingSaveProvider } from "../../components/onboarding/FinishLater";
import TermsAgreeBox, { saveRoleConsent } from "../../components/legal/TermsAgreeBox";
import { AGENCY_TYPES } from "../../constants/agencyTypes";
import LogoCropper from "../../components/common/LogoCropper";
import IgHandleField, { fmtIgCount } from "../../components/instagram/IgHandleField"; // v363: brand handle → logo, name, followers
import { igUsername } from "../../components/instagram/InstagramFetchButton";
import { useFunnelSteps } from "../../lib/metaPixel"; // v362
import { initials as initialsOf } from "../../utils/initials";
import SocialLogo from "../../components/common/SocialLogo"; // v364: real platform logos
import { brandIgOutcome, IgFindingCard, IgConfirmCard, IgSlowLine, TextLinkButton } from "../../components/onboarding/mobile/BrandIgSteps"; // v375

const INDUSTRY_OPTIONS = ["Marketing", "Beauty", "Fashion", "Food", "Tech", "Fitness", "Travel", "Gaming"];
const ALL_NICHES = VALID_NICHES;
const CAMPAIGN_TYPES = [
  { id: "paid", label: "Paid collaborations" },
  { id: "barter", label: "Barter / product" },
  { id: "onetime", label: "One-time content" },
  { id: "ambassador", label: "Long-term ambassador" },
];
const BUDGET_RANGES = ["Under \u20b910K", "\u20b910K\u2013\u20b950K", "\u20b950K\u2013\u20b92L", "\u20b92L+"];
const CREATOR_SIZES = ["Nano 1K\u201310K", "Micro 10K\u2013100K", "Macro 100K\u20131M", "Mega 1M+"];
const POSITIONS = ["Founder", "Marketing head", "Brand manager", "Agency lead", "Other"];

function initials(name) {
  return initialsOf(name); // v346: emoji-safe ("Glow 🌿 Cosmetics" → "GC", was "G" + half an emoji)
}

export default function BrandOnboardingMobile({ user, onComplete }) {
  const navigate = useNavigate();
  const userId = user?.user_id || user?.id;
  const [screen, setScreen] = useState(1);
  useFunnelSteps(screen, 8, "brand_mobile"); // v362: Meta / GA funnel
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [industrySearch, setIndustrySearch] = useState("");
  const [linkChannel, setLinkChannel] = useState(null);
  const [isOtherDesignation, setIsOtherDesignation] = useState(false);
  const fileInputRef = useRef(null);
  const exitSheetRef = useRef(null); // v363: Back on the first screen → "Leave setup? / Log out" (was navigate(-1) → stuck)

  const [formData, setFormData] = useState({
    companyName: "", isAgency: false, agencyType: "", logoUrl: "", industry: "", description: "", genderFocus: "All genders",
    representativeName: user?.name || "", representativeDesignation: "", representativeMobile: user?.phone ? user.phone.replace(/\D/g, "").slice(-10) : "", representativeMobileCountryCode: "+91",
    city: "", state: "", pinCode: "",
    campaignTypes: [], budgetRange: "", creatorSize: "", niches: "",
    instagramHandle: "", instagramConnected: false,
    youtubeChannelUrl: "", youtubeConnected: false,
    linkedinUrl: "", linkedinConnected: false,
    twitterHandle: "", twitterConnected: false,
    facebookUrl: "", facebookConnected: false,
    website: "", // v366: filled from the Instagram profile when it has one; editable
  });

  const set = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

  // v363 (Ravi's design "Brand 01 · Instagram handle, auto-filled"): the brand's Instagram username fills the logo
  // (our stored copy — never over a logo the brand uploaded), the company name (if empty) and the follower count, and
  // marks Instagram as linked. Everything stays editable below.
  const [igFetching, setIgFetching] = useState(false);
  const [igNums, setIgNums] = useState(null);
  const onBrandIgFetched = (n) => {
    setIgNums(n);
    setFormData((prev) => {
      const next = { ...prev, instagramHandle: n.username || igUsername(prev.instagramHandle), instagramConnected: true };
      const curLogo = String(prev.logoUrl || "");
      if (n.photo_url && (!curLogo || /\/avatars\/ig\//.test(curLogo))) next.logoUrl = n.photo_url;
      if (n.name && !String(prev.companyName || "").trim()) next.companyName = n.name;
      if (n.website && !String(prev.website || "").trim()) next.website = n.website; // v366: website from Instagram (editable)
      if (n.bio && !String(prev.description || "").trim()) next.description = String(n.bio).replace(/\s+/g, " ").trim().slice(0, 200); // v363: bio → description (editable)
      return next;
    });
  };
  const onBrandIgState = (st) => {
    if (st === "err") { setIgNums(null); setFormData((prev) => (prev.instagramConnected ? { ...prev, instagramConnected: false } : prev)); }
  };

  // v375 (Ravi's design "Brand Onboarding IG Split", then Ravi: "do page ki jagah wahi neeche dikha do"): step 1 is
  //   handle page (1a)  — the Instagram box; the answer shows right under it:
  //       found  → "Is this your brand?" card + Yes, that's us / Not us, change username
  //       busy   → one small line ("we'll add your logo in a few minutes") + Continue; one automatic retry after 12 s
  //       private / missing → a calm line; "No Instagram? Set up manually" always works
  //   details (1d)     — logo, name, agency; pre-filled when Instagram answered, typed by hand otherwise.
  // Ravi: if Instagram doesn't answer, nothing happens in the background — the username is saved
  // (brand_profiles.instagram_handle) and the brand adds logo + name by hand, as before. A logo the brand uploaded is
  // never replaced by the Instagram one.
  const [igStep, setIgStep] = useState("handle");
  const [igResult, setIgResult] = useState(null); // last fetch answer
  const [igSignal, setIgSignal] = useState(0);    // bump → IgHandleField fetches now
  const [igOn, setIgOn] = useState(true);         // false → Instagram fetch switched off on the server
  const [igSlowByTime, setIgSlowByTime] = useState(false); // a fetch running for 4 s+ counts as "busy"
  const [retryIn, setRetryIn] = useState(null);   // seconds to the ONE automatic retry
  const autoRetried = useRef(false);
  const handleNow = igUsername(formData.instagramHandle);
  useEffect(() => {
    if (!igFetching) { setIgSlowByTime(false); return undefined; }
    const t = setTimeout(() => setIgSlowByTime(true), 4000);
    return () => clearTimeout(t);
  }, [igFetching]);
  const resultHere = igResult && igUsername(igResult.username) === handleNow ? igResult : null;
  const igView = !handleNow ? "empty"
    : igFetching ? (igSlowByTime ? "slow" : "finding")
    : ({ found: "found", slow: "slow", not_found: "not_found", off: "off", none: "idle" })[brandIgOutcome(resultHere)];
  const igFound = igView === "found" ? resultHere.nums : null;
  const toDetails = (patch = {}) => { setRetryIn(null); setFormData((prev) => ({ ...prev, ...patch })); setIgStep("details"); };
  const onIgResult = (r) => setIgResult(r);
  const findMyBrand = () => {
    if (!handleNow) { toast.error("Enter your brand's Instagram username."); return; }
    if (!igOn) { toast("Instagram lookup isn't available right now — add your logo and name below.", { id: "brand-ig-off" }); toDetails(); return; } // v416: say why (it skipped silently)
    setIgSignal((n) => n + 1);
  };
  const retryNow = () => { autoRetried.current = true; setRetryIn(null); setIgSignal((n) => n + 1); };
  // one automatic retry when Instagram was busy (repeat retries eat Meta's hourly budget)
  useEffect(() => {
    if (igStep !== "handle" || igView !== "slow" || igFetching || autoRetried.current) { if (retryIn !== null && (igView !== "slow" || igFetching)) setRetryIn(null); return undefined; }
    if (retryIn === null) { setRetryIn(12); return undefined; }
    if (retryIn <= 0) { autoRetried.current = true; setRetryIn(null); setIgSignal((n) => n + 1); return undefined; }
    const t = setTimeout(() => setRetryIn((v) => (v === null ? null : v - 1)), 1000);
    return () => clearTimeout(t);
  }, [igStep, igView, igFetching, retryIn]);
  const notFound = igView === "not_found";

  // Session 34 (Ravi): answers + this screen are saved on the SERVER after every step (not on this
  // device), so the brand continues exactly here on any device. Basic details (company name,
  // designation, mobile) come first: screen order is now 1 → 4 → 2 → 3 → 5 → 6 → 7.
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [basicsDone, setBasicsDone] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;
    loadProgress().then((p) => {
      if (!alive) return;
      if (p) {
        if (p.answers && typeof p.answers === "object") {
          setFormData((prev) => ({ ...prev, ...p.answers }));
          // v375: came back after step 1a — continue on the details, not the empty handle box
          if (String(p.answers.companyName || "").trim() || p.answers.logoUrl || p.answers.instagramConnected) setIgStep("details");
        }
        const r = resumeFor("brand_mobile", p);
        if (r?.screen) setScreen(r.screen);
        if (p.basics_done) setBasicsDone(true);
      } else {
        // One-time move of answers an older build kept on this device.
        try {
          const old = safeJsonParse(localStorage.getItem(`ybex_brand_onboarding_${userId}`), null);
          if (old?.formData) setFormData((prev) => ({ ...prev, ...old.formData }));
        } catch (e) { ignored("BrandOnboardingMobile:legacy", e); }
      }
      setProgressLoaded(true);
    });
    return () => { alive = false; };
  }, [userId]);

  useEffect(() => {
    if (!progressLoaded || screen > 7) return;
    saveProgress({ flow: "brand_mobile", page: brandPageFromMobile(screen), pos: { step: screen }, answers: formData, basicsDone: basicsDone || (screen !== 1 && screen !== 4) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, progressLoaded]);

  const needPhone = userNeedsPhone(user);
  const submitBasics = async () => {
    if (!formData.companyName.trim()) { toast.error("Please enter your company name."); return; }
    if (!formData.representativeDesignation) { toast.error("Please choose your position."); return; }
    if (!isValidIndianMobile(formData.representativeMobile)) { toast.error("Please enter a valid 10-digit mobile number (starting with 6, 7, 8, or 9)"); return; }
    setSaving(true);
    try {
      const res = await saveProgress({
        flow: "brand_mobile", page: "manager", pos: { step: 4 }, answers: formData, basicsDone: true,
        phone: needPhone ? `+91${formData.representativeMobile}` : undefined,
      });
      // Session 43 (Ravi: brand onboarding stopped after the designation step): only a problem with
      // the mobile number stops here. A progress-save hiccup no longer blocks the next screen — the
      // answers are saved again on every following step.
      if (res?.success === false && ["BAD_PHONE", "PHONE_SAVE_FAILED"].includes(res.code)) { toast.error(res.error); return; }
      if (res?.success === false) toast.warning("Couldn't save your progress just now — we'll keep trying as you go.");
      setBasicsDone(true);
      setScreen(2);
    } finally {
      setSaving(false);
    }
  };

  // v283: pick → adjust (LogoCropper) → upload the cropped square.
  const [cropFile, setCropFile] = useState(null);
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (file) setCropFile(file);
  };
  const uploadLogoFile = async (file) => {
    if (!file) return;
    const prevLogo = formData.logoUrl && !String(formData.logoUrl).startsWith("blob:") ? formData.logoUrl : "";
    const previewUrl = URL.createObjectURL(file);
    set("logoUrl", previewUrl);
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("upload?bucket=profile-assets", fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (res.data?.url) {
        set("logoUrl", res.data.url);
        toast.success("Logo uploaded!");
      }
    } catch (err) {
      // v332: calm copy, and the logo goes back to the last uploaded one — the temporary on-phone preview was
      // being saved as the brand logo and showed broken everywhere else.
      set("logoUrl", prevLogo);
      // v363 (reviewer: "logo upload nahi ho raha"): say why — expired login, too big, wrong type — not one generic line.
      const st = err?.response?.status;
      const why = err?.response?.data?.detail || err?.response?.data?.error;
      if (st === 401 || st === 403) toast.error("Your login has expired. Tap Exit → Log out, then sign in again.");
      else if (st === 413) toast.error("This image is too big. Please pick one under 10 MB.");
      else toast.error(why ? `Couldn't upload the logo: ${String(why).slice(0, 120)}` : "Couldn't upload the logo. Check your internet and try again — or skip it for now and add it later.");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handlePinCode = async (val) => {
    set("pinCode", val);
    if (val.length === 6) {
      const details = await fetchPinCodeDetails(val);
      if (details) {
        set("city", details.city);
        set("state", details.state);
      }
    }
  };

  const toggleCampaignType = (id) => {
    setFormData((prev) => ({
      ...prev,
      campaignTypes: prev.campaignTypes.includes(id) ? prev.campaignTypes.filter((t) => t !== id) : [...prev.campaignTypes, id],
    }));
  };


  const goNext = (next) => setScreen(next);

  const publish = async (opts) => {
    const skipNiches = opts?.skipNiches === true; // v344: "Skip niches & publish" publishes with no niches
    // Session 34: the Terms box on the last step is required (legal draft Part E).
    if (!agreedTerms) { toast.error("Please tick the box to agree to the Terms before you publish."); return; }
    setSaving(true);
    try { await saveRoleConsent("brand"); } catch (e) { ignored("BrandOnboardingMobile:consent", e); } // v363: a throw here left Publish spinning
    try {
      const primaryPlatform = formData.instagramConnected ? "instagram" : formData.youtubeConnected ? "youtube" : "instagram";
      const primaryHandle = formData.instagramConnected ? formData.instagramHandle : formData.youtubeConnected ? formData.youtubeChannelUrl : "";

      const payload = {
        company_name: formData.companyName,
        is_agency: Boolean(formData.isAgency),
        industry: formData.industry,
        description: formData.description,
        gender_focus: formData.genderFocus,
        ...(String(formData.website || "").trim() ? { website: String(formData.website).trim().slice(0, 300) } : {}), // v366
        social_handle: primaryHandle,
        social_platform: primaryPlatform,
        instagram_handle: formData.instagramHandle,
        instagram_connected: formData.instagramConnected,
        youtube_channel_url: formData.youtubeChannelUrl,
        youtube_connected: formData.youtubeConnected,
        linkedin_url: formData.linkedinUrl,
        linkedin_connected: formData.linkedinConnected,
        twitter_handle: formData.twitterHandle,
        twitter_connected: formData.twitterConnected,
        facebook_url: formData.facebookUrl,
        facebook_connected: formData.facebookConnected,
        city: formData.city,
        state: formData.state,
        pin_code: formData.pinCode,
        campaign_types: formData.campaignTypes,
        budget_range: formData.budgetRange,
        creator_size: formData.creatorSize,
        preferred_niches: skipNiches ? "" : formData.niches,
        representative_name: formData.representativeName,
        representative_designation: formData.representativeDesignation,
        representative_mobile: (formData.representativeMobileCountryCode || "+91") + " " + formData.representativeMobile,
        // v363: the logo goes with the server save too (it used to come only from the second, browser-side write below)
        logo_url: formData.logoUrl && !String(formData.logoUrl).startsWith("blob:") ? formData.logoUrl : "",
        onboarded_at: new Date().toISOString(),
        onboarding_completed: true,
      };

      // Session 41: keep the onboarding page open for the final preview (see Onboarding.jsx).
      try { sessionStorage.setItem("ybex_onboarding_preview", "1"); } catch (e) { ignored("BrandOnboardingMobile:preview", e); }
      await api.post("auth/onboard", { role: "brand", data: payload });

      // v363: the server above already saved the whole profile; this extra copy must not turn a finished
      // publish into "Couldn't publish".
      try { await ownDb.from("brand_profiles").upsert({
        user_id: userId,
        company_name: formData.companyName,
        is_agency: Boolean(formData.isAgency),
        industry: formData.industry,
        description: formData.description,
        logo: formData.logoUrl,
        city: formData.city,
        state: formData.state,
        representative_name: formData.representativeName,
        representative_designation: formData.representativeDesignation,
        representative_mobile: (formData.representativeMobileCountryCode || "+91") + " " + formData.representativeMobile,
        updated_at: new Date().toISOString(),
      }); } catch (e) { ignored("BrandOnboardingMobile:ownDb", e); }

      // Through the server (session 22): the browser may no longer write `users` directly.
      try { await api.post("/users/me/agency", { is_agency: Boolean(formData.isAgency), agency_type: formData.agencyType || null }); } catch (e) { ignored("BrandOnboardingMobile:agency", e); }

      try {
        localStorage.removeItem(`ybex_brand_onboarding_${userId}`);
      } catch (e) { ignored("BrandOnboardingMobile:174", e); }

      setScreen(8);
    } catch (e) {
      try { sessionStorage.removeItem("ybex_onboarding_preview"); } catch (e2) { ignored("BrandOnboardingMobile:preview", e2); }
      console.error("BRAND ONBOARD ERROR (mobile):", e);
      const st = e?.response?.status;
      if (st === 401 || st === 403) toast.error("Your login has expired. Tap Exit → Log out, then sign in again — your answers are saved.");
      else if (!e?.response) toast.error("No internet right now — your answers are saved. Try Publish again in a moment.");
      else toast.error(e?.response?.data?.detail || e?.response?.data?.error || "Couldn't publish your profile. Please try again."); // v332: no raw tech text
    } finally {
      setSaving(false);
    }
  };

  const handleFinalCTA = async (dest) => {
    try { sessionStorage.removeItem("ybex_onboarding_preview"); } catch (e) { ignored("BrandOnboardingMobile:preview", e); }
    try {
      await onComplete();
    } catch (e) { ignored("BrandOnboardingMobile:188", e); }
    navigate(dest, { replace: true }); // v332: Back from KYC / Explore no longer reopens onboarding (same as creators)
  };

  const industries = INDUSTRY_OPTIONS.concat(ALL_NICHES.filter((n) => !INDUSTRY_OPTIONS.includes(n))).filter((n) =>
    n.toLowerCase().includes(industrySearch.toLowerCase())
  );

  const previewSubtitle = () => {
    const parts = [];
    if (formData.industry) parts.push(formData.industry);
    if (screen >= 4 && formData.genderFocus) parts.push(formData.genderFocus);
    if (screen >= 5 && formData.representativeName) parts.push(formData.representativeName);
    if (screen >= 6 && formData.instagramConnected) parts.push("Instagram linked");
    return parts.join(" \u00b7 ");
  };

  return (
    <OnboardingSaveProvider basicsDone={basicsDone} openRef={exitSheetRef}>
    <div key={screen} className="yb-step-in" style={{ minHeight: "var(--yb-vh, 100vh)" /* v330: visible height, not 100vh */, background: "#F2F2F7", fontFamily: "'DM Sans',sans-serif", display: "flex", flexDirection: "column" }}>
      {screen === 1 && (
        <>
          <MobileOnboardingHeader showStepLabel={false} showTimeline={false} previewLabel={"Creators\nsee this"} stepLabel={"Brand setup \u00b7 1 of 4"} filledSteps={1}
            onBack={() => { if (igStep === "handle") exitSheetRef.current?.(); else { setRetryIn(null); setIgStep("handle"); } }} />
          {/* v375 1a — the brand's Instagram; the answer shows right under the box */}
          {igStep === "handle" && (
          <div data-testid="brand-step-handle" style={{ flex: 1, padding: "8px 20px 0", display: "flex", flexDirection: "column" }}>
            <h2 style={{ margin: 0, font: "700 26px/1.18 'DM Sans',sans-serif", letterSpacing: "-.6px", color: "#0A0A0A" }}>What's your brand's Instagram?</h2>
            <p style={{ margin: "8px 0 0", font: "400 14.5px/1.5 'DM Sans',sans-serif", color: "#6B7280" }}>Start with your Instagram. We'll fill in the rest.</p>
            <div style={{ marginTop: 22 }}>
              <IgHandleField
                value={formData.instagramHandle}
                onChange={(v) => {
                  const next = String(v || "").replace(/^.*instagram\.com\//i, "").replace(/^@+/, "").replace(/[/?#].*$/, "").toLowerCase().replace(/[^a-z0-9_.]/g, "");
                  if (next !== formData.instagramHandle && formData.instagramConnected) { setIgNums(null); setFormData((prev) => ({ ...prev, instagramConnected: false })); }
                  if (next !== formData.instagramHandle) { autoRetried.current = false; setRetryIn(null); }
                  set("instagramHandle", next);
                }}
                onBusyChange={setIgFetching}
                onStateChange={onBrandIgState}
                onResult={onIgResult}
                onConfig={setIgOn}
                fetchSignal={igSignal}
                quiet
                autoFocus={!formData.instagramHandle}
                placeholder="yourbrand"
                showCard={false}
                testId="brand-ig-field"
              />
            </div>
            {igView === "finding" && <IgFindingCard />}
            {igView === "found" && (
              <div data-testid="brand-ig-preview" style={{ marginTop: 18 }}>
                <div style={{ font: "700 17px 'DM Sans',sans-serif", color: "#0A0A0A" }}>Is this your brand?</div>
                <IgConfirmCard nums={igFound} handle={igFound?.username || handleNow} />
              </div>
            )}
            {igView === "slow" && (
              <IgSlowLine handle={handleNow} retryIn={retryIn} retrying={igFetching} onRetry={retryNow} />
            )}
            {notFound && (
              <div role="alert" data-testid="brand-ig-notfound" style={{ marginTop: 10, font: "500 13px/1.45 'DM Sans',sans-serif", color: "#B45309" }}>
                We couldn't find @{handleNow} as a public account. Check the spelling, or switch it to a Business or Creator account in Instagram settings.
              </div>
            )}
            {(igView === "empty" || igView === "idle" || igView === "off") && (
              <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
                <TrustAvatars size={30} />
                <span style={{ font: "500 13.5px/1.4 'DM Sans',sans-serif", color: "#6B7280" }}>Creators check your Instagram before they apply.</span>
              </div>
            )}
            <div style={{ marginTop: "auto", paddingBottom: 18, paddingTop: 20 }}>
              {igView === "found" ? (
                <>
                  <MobilePrimaryButton onClick={() => { onBrandIgFetched(igFound); toDetails(); }}>Yes, that's us</MobilePrimaryButton>
                  <TextLinkButton testId="brand-ig-not-us" onClick={() => { setIgResult(null); setIgNums(null); setFormData((prev) => ({ ...prev, instagramHandle: "", instagramConnected: false })); }}>Not us, change username</TextLinkButton>
                </>
              ) : igView === "slow" ? (
                <>
                  <MobilePrimaryButton onClick={() => toDetails({ instagramConnected: false })}>Continue</MobilePrimaryButton>
                  <TextLinkButton testId="brand-ig-manual" onClick={() => { setIgNums(null); toDetails({ instagramHandle: "", instagramConnected: false }); }}>No Instagram? Set up manually</TextLinkButton>
                </>
              ) : (
                <>
                  <MobilePrimaryButton disabled={!handleNow || igView === "finding"} onClick={igView === "not_found" ? () => toDetails({ instagramHandle: "", instagramConnected: false }) : findMyBrand}>
                    {igView === "finding" ? <><Loader2 size={17} className="animate-spin" /> Finding your brand…</> : igView === "not_found" ? "Continue without Instagram" : "Find my brand"}
                  </MobilePrimaryButton>
                  <TextLinkButton testId="brand-ig-manual" onClick={() => { setIgNums(null); toDetails({ instagramHandle: "", instagramConnected: false }); }}>No Instagram? Set up manually</TextLinkButton>
                </>
              )}
            </div>
          </div>
          )}

          {/* v375 1d — the details (same screen as before, without the Instagram box) */}
          {igStep === "details" && (
          <div style={{ flex: 1, padding: "8px 20px 0", display: "flex", flexDirection: "column" }}>
            <h2 style={{ margin: 0, font: "600 23px/1.28 'DM Sans',sans-serif", letterSpacing: "-.7px", color: "#0A0A0A" }}>Your brand, as creators will see it.</h2>
            {/* v375 (Ravi: "ye mat dikhao"): no second Instagram card here — the brand already saw it on "Is this your brand?" */}
            {/* Session 41 (Ravi): logo box in the middle like the creator photo step, then a trust line. */}
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />
              <LogoCropper file={cropFile} onCancel={() => setCropFile(null)} onDone={(f) => { setCropFile(null); uploadLogoFile(f); }} />
              <div
                onClick={() => fileInputRef.current?.click()}
                data-testid="brand-logo-upload-box"
                style={{
                  width: 168, height: 168, borderRadius: 24, cursor: "pointer", position: "relative", overflow: "hidden",
                  border: formData.logoUrl ? "2px solid #7C3AED" : "2px dashed #C7C7CC", background: formData.logoUrl ? "#F5F0FF" : "#FAFAFC",
                  display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box",
                }}
              >
                {uploadingLogo ? (
                  <Loader2 size={24} className="animate-spin" color="#7C3AED" />
                ) : formData.logoUrl ? (
                  <>
                    <img src={formData.logoUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                    <span style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", padding: "6px 12px", borderRadius: 999, background: "rgba(10,10,10,.6)", color: "#fff", font: "600 12px 'DM Sans',sans-serif", whiteSpace: "nowrap" }}>Change logo</span>
                  </>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 42, padding: "0 16px", borderRadius: 12, background: "#7C3AED", color: "#fff", font: "700 14px 'DM Sans',sans-serif", boxShadow: "0 4px 14px -4px rgba(124,58,237,.5)" }}>
                    <Camera size={17} /> Upload logo
                  </span>
                )}
              </div>
              <div style={{ marginTop: 16, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ font: "600 13.5px/1.45 'DM Sans',sans-serif", color: "#4B5563", maxWidth: 210 }}>
                  Creators trust brands with a clear logo — and apply more
                </div>
                <TrustAvatars />
              </div>
            </div>
            <MobileFieldLabel>Brand / company name</MobileFieldLabel>
            <MobileTextInput value={formData.companyName} onChange={(v) => set("companyName", v)} placeholder="Your company name" />
            <div onClick={() => set("isAgency", !formData.isAgency)} style={{ marginTop: 10, height: 52, borderRadius: 14, background: "#fff", border: "1px solid #E5E5EA", display: "flex", alignItems: "center", gap: 12, padding: "0 15px", cursor: "pointer" }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, border: formData.isAgency ? "none" : "1.5px solid #D6D6DC", background: formData.isAgency ? "#7C3AED" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {formData.isAgency && <Check size={13} color="#fff" strokeWidth={3} />}
              </div>
              <div style={{ flex: 1, font: "500 14px 'DM Sans',sans-serif", color: "#0A0A0A" }}>Registering as an agency</div>
              <div style={{ font: "500 11.5px 'DM Sans',sans-serif", color: "#6B7280" }}>optional</div>
            </div>
            {(igNums || String(formData.website || "").trim()) && (
              <>
                {/* v366/v375: website from the Instagram profile — the brand can fix or clear it */}
                <MobileFieldLabel>Website</MobileFieldLabel>
                <input data-testid="brand-ig-website" value={formData.website || ""} onChange={(e) => set("website", e.target.value.slice(0, 300))} placeholder="https://yourbrand.com" inputMode="url" autoCapitalize="none" autoCorrect="off"
                  style={{ marginTop: 8, width: "100%", height: 48, borderRadius: 12, border: "1px solid #E5E5EA", background: "#fff", padding: "0 14px", font: "500 16px 'DM Sans',sans-serif", color: "#0A0A0A", boxSizing: "border-box", outline: "none" }} />
              </>
            )}
            {formData.isAgency && (
              <div style={{ marginTop: 10, animation: "slideIn 0.2s ease-out" }}>
                <select
                  value={formData.agencyType || ""}
                  onChange={(e) => set("agencyType", e.target.value)}
                  style={{
                    width: "100%", height: 52, borderRadius: 14, border: "1px solid #E5E5EA", background: "#fff",
                    padding: "0 15px", font: "500 16px 'DM Sans',sans-serif" /* v332 */, color: "#0A0A0A", outline: "none"
                  }}
                >
                  <option value="" disabled>Select Agency Type...</option>
                  {AGENCY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
            <div style={{ marginTop: "auto", paddingBottom: 24, paddingTop: 20 }}>
              <MobilePrimaryButton disabled={!formData.companyName.trim()} onClick={() => goNext(4)}>{igNums ? "Looks right, next" : "Next"}</MobilePrimaryButton>
            </div>
          </div>
          )}
        </>
      )}

      {screen === 2 && (
        <>
          <MobileOnboardingHeader showStepLabel={false} showTimeline={false} previewLabel={"Creators\nsee this"} stepLabel={"Brand setup \u00b7 1 of 4"} filledSteps={1} onBack={() => setScreen(4)} preview={{ avatarNode: <BrandAvatar formData={formData} />, title: formData.companyName, subtitle: previewSubtitle() }} />
          <div style={{ flex: 1, padding: "8px 20px 0", display: "flex", flexDirection: "column" }}>
            <h2 style={{ margin: 0, font: "600 23px/1.28 'DM Sans',sans-serif", letterSpacing: "-.7px", color: "#0A0A0A" }}>Which industry do you sell in?</h2>
            <p style={{ margin: "9px 0 0" /* v332: "mb-4" made this margin invalid */, font: "400 13.5px/1.6 'DM Sans',sans-serif", color: "#6B7280" }}>Creators filter by this. Pick one.</p>
            {/* v416: common industries shown straight away (the screen looked empty until the search box was tapped) */}
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {INDUSTRY_OPTIONS.map((ind) => (
                <MobileChip key={ind} label={ind} selected={formData.industry === ind} onClick={() => set("industry", formData.industry === ind ? "" : ind)} />
              ))}
            </div>
            <div style={{ marginTop: 10, animation: "slideIn 0.3s ease-out" }}>
              <UniversalTagSearch
                selectedTags={formData.industry ? [formData.industry] : []}
                onChange={newTags => set("industry", newTags[newTags.length - 1] || "")}
                type="category"
                placeholder="Search or create custom category..."
              />
            </div>
            <div style={{ marginTop: "auto", paddingBottom: 24, paddingTop: 20 }}>
              <MobilePrimaryButton disabled={!formData.industry} onClick={() => goNext(3)}>Next</MobilePrimaryButton>
            </div>
          </div>
        </>
      )}

      {screen === 3 && (
        <>
          <MobileOnboardingHeader showStepLabel={false} showTimeline={false} previewLabel={"Creators\nsee this"} stepLabel={"Brand setup \u00b7 2 of 4"} filledSteps={2} onBack={() => setScreen(2)} preview={{ avatarNode: <BrandAvatar formData={formData} />, title: formData.companyName, subtitle: formData.industry }} />
          <div style={{ flex: 1, padding: "8px 20px 0", display: "flex", flexDirection: "column" }}>
            <h2 style={{ margin: 0, font: "600 23px/1.28 'DM Sans',sans-serif", letterSpacing: "-.7px", color: "#0A0A0A" }}>Tell creators about your brand</h2>
            <p style={{ margin: "9px 0 0", font: "400 13.5px/1.6 'DM Sans',sans-serif", color: "#6B7280" }}>A line about what you sell, and who you sell it to.</p>
            <MobileFieldLabel right={`${formData.description.length} / 200`}>Brand description</MobileFieldLabel>
            <textarea
              value={formData.description}
              onChange={(e) => set("description", e.target.value.slice(0, 200))}
              placeholder={"Tell creators what your brand does\u2026"}
              style={{ marginTop: 9, height: 100, borderRadius: 14, background: "#fff", border: "1px solid #E5E5EA", padding: "13px 15px", font: "400 16px/1.5 'DM Sans',sans-serif" /* v332: 16px stops the iPhone zoom-in */, color: "#0A0A0A", resize: "none", boxSizing: "border-box" }}
            />
            <MobileFieldLabel>Gender focus</MobileFieldLabel>
            <div style={{ marginTop: 9, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {["All genders", "Men", "Women", "Non-binary / others"].map((g) => (
                <MobileChip key={g} label={g} selected={formData.genderFocus === g} onClick={() => set("genderFocus", g)} />
              ))}
            </div>
            <div style={{ marginTop: 16, padding: "13px 15px", borderRadius: 12, background: "#FFFBEB", borderLeft: "3px solid #D97706", display: "flex", gap: 11 }}>
              <div style={{ font: "500 12.5px/1.55 'DM Sans',sans-serif", color: "#92400E" }}>Creators use this to see if your brand fits their audience.{/* v416: plainer copy */}</div>
            </div>
            <div style={{ marginTop: "auto", paddingBottom: 24, paddingTop: 20 }}>
              <MobilePrimaryButton onClick={() => goNext(5)}>Next</MobilePrimaryButton>
            </div>
          </div>
        </>
      )}

      {screen === 4 && (
        <>
          <MobileOnboardingHeader showStepLabel={false} showTimeline={false} previewLabel={"Creators\nsee this"} stepLabel={"Brand setup \u00b7 3 of 4"} filledSteps={1} onBack={() => setScreen(1)} preview={{ avatarNode: <BrandAvatar formData={formData} />, title: formData.companyName, subtitle: formData.representativeDesignation || formData.industry }} />
          <div style={{ flex: 1, padding: "8px 20px 0", display: "flex", flexDirection: "column" }}>
            <h2 style={{ margin: 0, font: "600 23px/1.28 'DM Sans',sans-serif", letterSpacing: "-.7px", color: "#0A0A0A" }}>Who's running this account?</h2>
            <p style={{ margin: "9px 0 0", font: "400 13.5px/1.6 'DM Sans',sans-serif", color: "#6B7280" }}>Keep it private from creators.</p>
            <MobileFieldLabel>Representative name</MobileFieldLabel>
            <MobileTextInput value={formData.representativeName} onChange={(v) => set("representativeName", v)} placeholder="Your name" />
            <MobileFieldLabel>Position</MobileFieldLabel>
            <div style={{ marginTop: 9, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {POSITIONS.map((p) => {
                const isSelected = p === "Other" ? isOtherDesignation : (!isOtherDesignation && formData.representativeDesignation === p);
                return (
                  <MobileChip key={p} label={p} selected={isSelected} onClick={() => {
                    if (p === "Other") {
                      setIsOtherDesignation(true);
                      set("representativeDesignation", "");
                    } else {
                      setIsOtherDesignation(false);
                      set("representativeDesignation", p);
                    }
                  }} />
                );
              })}
            </div>
            {isOtherDesignation && (
              <div style={{ marginTop: 10, animation: "slideIn 0.3s ease-out" }}>
                <MobileTextInput value={formData.representativeDesignation} onChange={(v) => set("representativeDesignation", v)} placeholder="E.g. Content Head, Team Lead" />
              </div>
            )}
            <MobileFieldLabel>Mobile number</MobileFieldLabel>
            <div style={{ marginTop: 9, display: "flex", gap: 8 }}>
              <div style={{ width: 75 }}>
                <MobileTextInput value={formData.representativeMobileCountryCode} onChange={(v) => set("representativeMobileCountryCode", v)} placeholder="+91" />
              </div>
              <div style={{ flex: 1 }}>
                <MobileTextInput value={formData.representativeMobile} onChange={(v) => set("representativeMobile", v.replace(/\D/g, "").slice(0, 10))} placeholder="98765 43210" inputMode="numeric" />
              </div>
            </div>
            {formData.representativeMobile.length > 0 && !isValidIndianMobile(formData.representativeMobile) && ( /* v416: Next was just greyed out with no reason */
              <div role="alert" style={{ marginTop: 8, font: "500 12.5px/1.45 'DM Sans',sans-serif", color: "#B45309" }}>Enter a 10-digit mobile number starting with 6, 7, 8 or 9.</div>
            )}
            <div style={{ marginTop: 10, font: "400 12px/1.5 'DM Sans',sans-serif", color: "#6B7280" }}>Used only for campaign calls. Never shown to creators.</div>
            <div style={{ marginTop: "auto", paddingBottom: 24, paddingTop: 20 }}>
              <MobilePrimaryButton disabled={saving || !formData.representativeName || !formData.representativeDesignation || !isValidIndianMobile(formData.representativeMobile)} onClick={submitBasics}>{saving ? <Loader2 size={16} className="animate-spin" /> : "Next"}</MobilePrimaryButton>
            </div>
          </div>
        </>
      )}

      {screen === 5 && (
        <>
          <MobileOnboardingHeader showStepLabel={false} showTimeline={false} previewLabel={"Creators\nsee this"} stepLabel={"Brand setup \u00b7 3 of 4"} filledSteps={3} onBack={() => setScreen(3)} preview={{ avatarNode: <BrandAvatar formData={formData} />, title: formData.companyName, subtitle: [formData.industry, formData.representativeName].filter(Boolean).join(" \u00b7 ") }} />{/* v332: no dangling " · " */}
          <div style={{ flex: 1, padding: "8px 20px 0", display: "flex", flexDirection: "column" }}>
            <h2 style={{ margin: 0, font: "600 23px/1.28 'DM Sans',sans-serif", letterSpacing: "-.7px", color: "#0A0A0A" }}>Link your brand's channels.</h2>
            <p style={{ margin: "9px 0 0", font: "400 13.5px/1.6 'DM Sans',sans-serif", color: "#6B7280" }}>Link even one — creators trust brands they can look up.{/* v332: removed a made-up "2x more applications" figure */}</p>
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 9 }}>
              <BrandChannelRow platform="instagram" label="Instagram" connected={formData.instagramConnected} onClick={() => setLinkChannel("instagram")} />
              <BrandChannelRow platform="youtube" label="YouTube" connected={formData.youtubeConnected} onClick={() => setLinkChannel("youtube")} />
              <BrandChannelRow platform="x" label="X (Twitter)" connected={formData.twitterConnected} onClick={() => setLinkChannel("x")} />
              <BrandChannelRow platform="linkedin" label="LinkedIn" connected={formData.linkedinConnected} onClick={() => setLinkChannel("linkedin")} />
              <BrandChannelRow platform="facebook" label="Facebook" connected={formData.facebookConnected} onClick={() => setLinkChannel("facebook")} />
            </div>
            {/* v416: "Next" and "Skip for now" did the same thing — one button that says what it does */}
            <div style={{ marginTop: "auto", paddingBottom: 24, paddingTop: 20 }}>
              <MobilePrimaryButton onClick={() => goNext(6)}>{(formData.instagramConnected || formData.youtubeConnected || formData.twitterConnected || formData.linkedinConnected || formData.facebookConnected) ? "Next" : "Skip for now"}</MobilePrimaryButton>
            </div>
          </div>
        </>
      )}

      {screen === 6 && (
        <>
          <MobileOnboardingHeader showStepLabel={false} showTimeline={false} previewLabel={"Creators\nsee this"} stepLabel={"Brand setup \u00b7 4 of 4"} filledSteps={4} onBack={() => setScreen(5)} preview={{ avatarNode: <BrandAvatar formData={formData} />, title: formData.companyName, subtitle: `${formData.industry} \u00b7 ${formData.instagramConnected ? "Instagram linked" : "No channels yet"}` }} />
          <div style={{ flex: 1, padding: "8px 20px 0", display: "flex", flexDirection: "column" }}>
            <h2 style={{ margin: 0, font: "600 23px/1.28 'DM Sans',sans-serif", letterSpacing: "-.7px", color: "#0A0A0A" }}>How will you work with creators?</h2>
            <MobileFieldLabel>Campaign types</MobileFieldLabel>
            <div style={{ marginTop: 9, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {CAMPAIGN_TYPES.map((t) => (
                <MobileChip key={t.id} label={t.label} selected={formData.campaignTypes.includes(t.id)} onClick={() => toggleCampaignType(t.id)} />
              ))}
            </div>
            <MobileFieldLabel>Typical budget per campaign</MobileFieldLabel>
            <div style={{ marginTop: 9, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {BUDGET_RANGES.map((b) => (
                <MobileChip key={b} label={b} selected={formData.budgetRange === b} onClick={() => set("budgetRange", b)} />
              ))}
            </div>
            <div style={{ marginTop: "auto", paddingBottom: 24, paddingTop: 20 }}>
              <MobilePrimaryButton disabled={formData.campaignTypes.length === 0 || !formData.budgetRange} onClick={() => goNext(7)}>Next</MobilePrimaryButton>
            </div>
          </div>
        </>
      )}

      {screen === 7 && (
        <>
          <MobileOnboardingHeader showStepLabel={false} showTimeline={false} previewLabel={"Creators\nsee this"} stepLabel="Last step" filledSteps={4} onBack={() => setScreen(6)} preview={{ avatarNode: <BrandAvatar formData={formData} size={44} />, title: formData.companyName, subtitle: [formData.industry, formData.budgetRange, formData.creatorSize].filter(Boolean).join(" \u00b7 ") }} />{/* v332 */}
          <div style={{ flex: 1, padding: "8px 20px 0", display: "flex", flexDirection: "column" }}>
            <h2 style={{ margin: 0, font: "600 23px/1.28 'DM Sans',sans-serif", letterSpacing: "-.7px", color: "#0A0A0A" }}>Who should we match you with?</h2>
            <MobileFieldLabel>Preferred creator size</MobileFieldLabel>
            <div style={{ marginTop: 9, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {CREATOR_SIZES.map((s) => (
                <MobileChip key={s} label={s} selected={formData.creatorSize === s} onClick={() => set("creatorSize", s)} />
              ))}
            </div>
            <MobileFieldLabel right="optional">Target niches</MobileFieldLabel>
            <div style={{ marginTop: 9 }}>
              <UniversalTagSearch
                selectedTags={formData.niches ? formData.niches.split(",").map((s) => s.trim()).filter(Boolean) : []}
                onChange={newTags => set("niches", newTags.join(", "))}
                type="niche"
                placeholder="Search or create a niche..."
              />
            </div>
            <div style={{ marginTop: 18, padding: 15, borderRadius: 14, background: "#ECFDF5", border: "1px solid #C7EFDD", display: "flex", gap: 12 }}>
              <Shield size={20} color="#059669" strokeWidth={1.9} />
              <div>
                <div style={{ font: "600 12.5px 'DM Sans',sans-serif", color: "#059669" }}>Payment protection on every deal</div>{/* v416: plain words */}
                <div style={{ marginTop: 5, font: "500 12.5px/1.55 'DM Sans',sans-serif", color: "#047857" }}>Ybex holds your payment and releases it to the creator only after you approve the work.</div>
              </div>
            </div>
            <div style={{ marginTop: "auto", paddingBottom: 10, paddingTop: 20 }}>
              <TermsAgreeBox role="brand" checked={agreedTerms} onChange={setAgreedTerms} compact />
              <MobilePrimaryButton disabled={saving || !formData.creatorSize} onClick={publish} style={{ boxShadow: "0 14px 26px -20px rgba(124,58,237,.8)" }}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : "Publish brand profile"}
              </MobilePrimaryButton>
            </div>
            <button onClick={() => { set("niches", ""); publish({ skipNiches: true }); } /* v344: actually skip (clear) the niches */} disabled={saving || !formData.creatorSize} style={{ marginBottom: 20, background: "none", border: "none", textAlign: "center", font: "500 13px 'DM Sans',sans-serif", color: "#6B7280", cursor: "pointer" }}>
              Skip niches & publish
            </button>
          </div>
        </>
      )}

      {screen === 8 && <BrandProfileLiveScreen formData={formData} onFinish={handleFinalCTA} />}

      <AnimatePresence>
        {linkChannel && (
          <BrandLinkChannelSheet
            platform={linkChannel}
            formData={formData}
            set={set}
            onClose={() => setLinkChannel(null)}
          />
        )}
      </AnimatePresence>
    </div>
    </OnboardingSaveProvider>
  );
}

function BrandAvatar({ formData, size = 38 }) {
  if (formData.logoUrl) {
    return <img src={formData.logoUrl} alt="" style={{ width: size, height: size, borderRadius: size * 0.32, objectFit: "cover", flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.32, background: "linear-gradient(135deg,#7C3AED,#9F62FF)", display: "flex", alignItems: "center", justifyContent: "center", font: `700 ${Math.round(size * 0.32)}px 'DM Sans',sans-serif`, color: "#fff", flexShrink: 0 }}>
      {initials(formData.companyName)}
    </div>
  );
}

const PLATFORM_COLORS = {
  instagram: "linear-gradient(135deg,#F9CE34,#EE2A7B,#6228D7)",
  youtube: "#FF0000",
  x: "#0A0A0A",
  linkedin: "#0A66C2",
  facebook: "#1877F2",
};

// v364 (Ravi: real logos): the channel row shows the platform's own mark on its soft tile (was a white glyph on a colour box).
const PLATFORM_GLYPH = {
  instagram: <SocialLogo platform="instagram" size={34} variant="tile" />,
  youtube: <SocialLogo platform="youtube" size={34} variant="tile" />,
  x: <SocialLogo platform="x" size={34} variant="tile" />,
  linkedin: <SocialLogo platform="linkedin" size={34} variant="tile" />,
  facebook: <SocialLogo platform="facebook" size={34} variant="tile" />,
};

function BrandChannelRow({ platform, label, connected, onClick }) {
  const bg = platform === 'instagram' ? 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)' : PLATFORM_COLORS[platform];
  return (
    <div onClick={onClick} style={{ height: 56, borderRadius: 12, background: "#fff", border: "1px solid #E5E5EA", display: "flex", alignItems: "center", gap: 12, padding: "0 15px", cursor: "pointer", transition: "all 0.2s" }}>
      {PLATFORM_GLYPH[platform] || <div style={{ width: 34, height: 34, borderRadius: 10, background: bg, flexShrink: 0 }} />}
      <div style={{ flex: 1, font: "600 14.5px 'DM Sans',sans-serif", color: "#0A0A0A" }}>{label}</div>
      <div style={{ height: 30, padding: "0 13px", borderRadius: 8, background: connected ? "#ECFDF5" : "#F5F0FF", display: "flex", alignItems: "center", font: "600 12px 'DM Sans',sans-serif", color: connected ? "#059669" : "#7C3AED", flexShrink: 0 }}>
        {connected ? "Linked" : "Link"}
      </div>
    </div>
  );
}

const CHANNEL_FIELD_MAP = {
  instagram: { handleField: "instagramHandle", connectedField: "instagramConnected", label: "Instagram handle", placeholder: "@yourbrand" },
  youtube: { handleField: "youtubeChannelUrl", connectedField: "youtubeConnected", label: "Channel URL", placeholder: "youtube.com/@yourbrand" },
  x: { handleField: "twitterHandle", connectedField: "twitterConnected", label: "Handle", placeholder: "@yourbrand" },
  linkedin: { handleField: "linkedinUrl", connectedField: "linkedinConnected", label: "Profile URL", placeholder: "linkedin.com/company/yourbrand" },
  facebook: { handleField: "facebookUrl", connectedField: "facebookConnected", label: "Page URL", placeholder: "facebook.com/yourbrand" },
};

function BrandLinkChannelSheet({ platform, formData, set, onClose }) {
  const cfg = CHANNEL_FIELD_MAP[platform];
  const [value, setValue] = useState(formData[cfg.handleField] || "");
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    try {
      await api.post("auth/social-verify", { platform, handle: value });
    } catch (e) {
      console.warn("[mobile brand onboarding] social-verify soft fallback:", e);
    }
    set(cfg.handleField, value);
    set(cfg.connectedField, Boolean(value.trim()));
    setBusy(false);
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "absolute", inset: 0, background: "rgba(18,18,26,.4)" }} onClick={onClose} />
      <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} data-sheet="1" /* v330: lifts above the phone keyboard so "Save" stays visible */ style={{ position: "relative", background: "#fff", borderRadius: "22px 22px 0 0", padding: "10px 20px 24px", boxShadow: "0 -18px 44px -26px rgba(18,18,26,.4)" }}>
        <div style={{ height: 5, width: 44, borderRadius: 3, background: "#E5E5EA", margin: "0 auto 16px" }} />
        <div style={{ font: "600 17px 'DM Sans',sans-serif", letterSpacing: "-.3px", color: "#0A0A0A" }}>Link {platform === "x" ? "X (Twitter)" : platform[0].toUpperCase() + platform.slice(1)}</div>
        <MobileFieldLabel>{cfg.label}</MobileFieldLabel>
        <MobileTextInput value={value} onChange={setValue} placeholder={cfg.placeholder} />
        <div style={{ marginTop: 16 }}>
          <MobilePrimaryButton disabled={busy || !value.trim()} onClick={handleSave}>{busy ? "Verifying\u2026" : "Save"}</MobilePrimaryButton>
        </div>
      </motion.div>
    </div>
  );
}

function BrandProfileLiveScreen({ formData, onFinish }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, padding: "0 24px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "100%", borderRadius: 22, overflow: "hidden", background: "#fff", border: "1px solid #ECECF0", boxShadow: "0 18px 40px -30px rgba(18,18,26,.3)" }}>
          <div style={{ height: 78, background: "linear-gradient(160deg,#16173A,#241F52)", display: "flex", alignItems: "center", justifyContent: "center", font: "600 15px 'DM Sans',sans-serif", letterSpacing: "2.4px", color: "rgba(255,255,255,.62)" }}>
            {safeUpper(formData.companyName)}
          </div>
          <div style={{ padding: "0 16px 18px" }}>
            <div style={{ marginTop: -31 }}>
              <div style={{ border: "4px solid #fff", borderRadius: 35, display: "inline-block" }}>
                <BrandAvatar formData={formData} size={62} />
              </div>
            </div>
            <div style={{ marginTop: 11, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ font: "700 18px/1.1 'DM Sans',sans-serif", letterSpacing: "-.5px", color: "#0A0A0A" }}>{formData.companyName}</div>
                <div style={{ marginTop: 4, font: "500 12.5px/1.1 'DM Sans',sans-serif", color: "#6B7280" }}>{/* v332: "\u00b7" was showing as raw text */}{[formData.industry, formData.city || "India"].filter(Boolean).join(" · ")}{/* v358: the real city when given */}</div>
              </div>
            </div>
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 7 }}>
              {formData.budgetRange && <div style={{ height: 28, padding: "0 11px", borderRadius: 8, background: "#F5F0FF", display: "flex", alignItems: "center", font: "600 11px 'DM Sans',sans-serif", color: "#7C3AED" }}>{formData.budgetRange}</div>}
              {formData.creatorSize && <div style={{ height: 28, padding: "0 11px", borderRadius: 8, background: "#F2F2F7", display: "flex", alignItems: "center", font: "500 11px 'DM Sans',sans-serif", color: "#6B7280" }}>{formData.creatorSize.split(" ")[0]} creators</div>}
              {formData.campaignTypes.length > 0 && <div style={{ height: 28, padding: "0 11px", borderRadius: 8, background: "#F2F2F7", display: "flex", alignItems: "center", font: "500 11px 'DM Sans',sans-serif", color: "#6B7280" }}>{/* v416 (M15): the brand's real choices (was always "Paid + UGC" / "Barter") */}{CAMPAIGN_TYPES.filter((t) => formData.campaignTypes.includes(t.id)).map((t) => t.label).join(" · ")}</div>}
            </div>
          </div>
        </div>
        <h2 style={{ margin: "30px 0 0", font: "600 24px/1.25 'DM Sans',sans-serif", letterSpacing: "-.8px", color: "#0A0A0A", textAlign: "center" }}>Your profile is live</h2>
        <p style={{ margin: "11px 0 0", maxWidth: 274, font: "400 14px/1.65 'DM Sans',sans-serif", color: "#6B7280", textAlign: "center" }}>
          {/* v416 (M15): matches "Posting is free" — verification is what publishing and paying need */}Verified creators can now discover you. Verify your brand (about 2 minutes) to publish campaigns and pay creators.
        </p>
      </div>
      <div style={{ padding: "0 20px 26px", display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
        <MobilePrimaryButton onClick={() => onFinish("/brand/kyc")}>
          <Shield size={16} color="#fff" /> Verify your brand
        </MobilePrimaryButton>
        <button onClick={() => onFinish("/explore")} style={{ height: 52, borderRadius: 14, background: "#fff", border: "1px solid #E5E5EA", boxSizing: "border-box", font: "600 15px 'DM Sans',sans-serif", color: "#0A0A0A", cursor: "pointer" }}>
          Explore creators
        </button>
      </div>
    </div>
  );
}
