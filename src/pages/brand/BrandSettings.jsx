import LegalPanel from "../../components/legal/LegalPanel";
// v334 (App Store 5.1.1(v) / Play): Account (incl. Delete account) + Help & support on desktop settings too
import AccountPanel from "../../components/account/AccountPanel";
import SupportContactCard from "../../components/help/SupportContactCard";
import { UserCog as AccountTabIcon, LifeBuoy as SupportTabIcon } from "lucide-react";
import useBusy from "../../lib/useBusy";
import ButtonSpinner from "../../components/common/ButtonSpinner";
import React, { useState, useEffect } from "react";
import { safeLower } from "../../utils/safeFormat";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Building, Shield, MonitorSmartphone, X, LogOut, Edit2, Mail, Loader2, ShieldAlert, FileText, Briefcase, Camera, AlertCircle, Check } from "lucide-react";
import AgencyBadge from "../../components/common/AgencyBadge";
import { useLoading } from "../../contexts/LoadingContext";
import { LocationAutocomplete } from "../../components/ui/autocomplete";
import UniversalTagSearch from "../../components/shared/UniversalTagSearch";
import useIsMobile from "../../hooks/useIsMobile";
import BrandProfileMobile from "../../components/profile/mobile/BrandProfileMobile";
import { FounderNoteDesktop } from "../../components/footer/FounderNote";
import { mediaHref } from "../../lib/mediaUrl";
import { checkHttpUrl } from "../../utils/httpUrl";
import { prepareUpload } from "../../lib/prepareUpload"; // v416 (CR10)

import { Presence, PopupBackdrop, PopupPanel } from "../../components/common/Popup";
import useScrollLock from "../../lib/useScrollLock"; // v415: popups lock the page behind them
import { Link } from "react-router-dom";

// v415: friendly words for the verification status (no raw "MORE_INFO_NEEDED" / "APPROVED" codes). Pure.
export function verificationLabel(status) {
  const st = String(status || "").toUpperCase();
  if (st === "APPROVED") return "Verified";
  if (["PENDING", "UNDER_REVIEW", "SUBMITTED", "IN_REVIEW"].includes(st)) return "Under review";
  if (st === "REJECTED") return "Needs changes";
  if (st === "MORE_INFO_NEEDED") return "More info needed";
  return "Verification pending";
}
export default function BrandSettings() {
  const { user, refreshUser, logout } = useAuth(); // v334: logout after Delete account
  const { startLoading, stopLoading } = useLoading();
  // Button actions show a spinner in the tapped button, not the global bar (ARCHITECTURE "Loading states").
  const { isBusy, anyBusy, begin, end } = useBusy();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const VALID_TABS = ["profile", "kyc", "sessions", "legal", "account", "help"]; // v334: + account, help
  const [activeTab, setActiveTab] = useState(() => {
    const section = searchParams.get("section") || searchParams.get("tab");
    return VALID_TABS.includes(section) ? section : "profile";
  });

  useEffect(() => {
    const section = searchParams.get("section") || searchParams.get("tab");
    if (VALID_TABS.includes(section)) {
      setActiveTab(section);
    }
  }, [searchParams]);

  // Brand profile fields state
  const [profile, setProfile] = useState({
    company_name: user?.name || "",
    // v330: no invented "Fashion & Retail" / "New Delhi" — they were shown as real and saved back on the next edit.
    industry: "",
    website: "",
    description: "",
    location: "",
    pocName: "",
    pocDesignation: "",
    pocEmail: user?.email || "",
    pocPhone: "",
    logo: user?.picture || user?.photo || "",
    cover: "",
    is_agency: Boolean(user?.is_agency),
    agency_type: user?.agency_type || ""
  });

  // KYC compliance status
  const [kycObj, setKycObj] = useState(null);
  const [kycLoading, setKycLoading] = useState(true);
  const [kycFailed, setKycFailed] = useState(false); // v415: a failed read is not "not submitted"
  const [profileLoading, setProfileLoading] = useState(true); // v415: no "Not provided" flash before the data
  const [profileLoadFailed, setProfileLoadFailed] = useState(false); // v416 (CR1)
  const [previewBroken, setPreviewBroken] = useState(""); // v415: broken preview URL (was an external placeholder image)

  // Device sessions list
  const [sessionsList, setSessionsList] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessionsFailed, setSessionsFailed] = useState(false); // v332: show "Couldn't load", not a made-up device

  // OTP states
  const [otpModalField, setOtpModalField] = useState(null); // 'pocPhone' or 'pocEmail'
  const [otpSent, setOtpSent] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [otpTargetValue, setOtpTargetValue] = useState("");
  
  // Custom prompt state for phone/email
  const [contactPrompt, setContactPrompt] = useState({ isOpen: false, field: "", label: "", value: "" });
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // Edit popups
  const [editModalField, setEditModalField] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [logoBroken, setLogoBroken] = useState(""); // v330: URL of a logo that failed to load

  const handleImageUpload = async (picked) => {
    if (!picked) return;
    if (picked.type && !/^image\//i.test(picked.type)) { toast.error("Please pick an image (JPG, PNG or WebP)."); return; } // v416
    const file = await prepareUpload(picked); // v416 (CR10): HEIC / big camera photo → JPEG
    if (file.size > 5 * 1024 * 1024) { toast.error("That image is over 5MB. Pick a smaller one."); return; }
    setUploadingImage(true);
    const toastId = toast.loading("Uploading image…"); // v415: plain words
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("upload?bucket=profile-assets", formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });
      if (res.data?.url) {
        setEditValue(res.data.url);
        toast.success("Image uploaded", { id: toastId });
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

  const loadBrandData = async () => {
    if (!user) return;
    startLoading();
    setProfileLoading(true);
    setProfileLoadFailed(false);
    try {
      let data = null;
      /* Session 58: profiles are read through the server now (the database no longer lets the browser read them) */
      if (!data) {
        const res = await api.get("brands/me", { bypassCache: true }).catch(() => null);
        if (res?.data && typeof res.data === "object" && !Array.isArray(res.data)) data = res.data; // v416: an HTML/[] answer is not a profile
      }
      if (!data) setProfileLoadFailed(true); // v416 (CR1)

      if (data) {
        let extractedCover = data.cover_image || "";
        let originalDesc = data.description || "";

        setProfile({
          company_name: data.company_name || user.name || "",
          industry: data.industry || "", // v330
          website: data.website || "",
          description: originalDesc,
          location: (data.city || data.state) ? `${data.city || ""}, ${data.state || ""}`.replace(/^, |, $/g, "") : "", // v330
          pocName: data.representative_name || data.poc_name || "",
          pocDesignation: data.representative_designation || data.poc_designation || "",
          pocEmail: data.email || user.email || "",
          pocPhone: data.representative_mobile || data.phone || "",
          campaignTypes: data.campaign_types ? (Array.isArray(data.campaign_types) ? data.campaign_types.join(", ") : data.campaign_types) : "",
          budgetRange: data.budget_range || "",
          creatorSize: data.preferred_creator_size || "",
          niches: data.preferred_niches || "",
          genderFocus: data.gender_focus || "",
          teamSize: data.team_size || "",
          logo: data.logo || user.picture || user.photo || "",
          cover: extractedCover,
          youtubeUrl: data.youtube_url || "",
          linkedinUrl: data.linkedin_url || "",
          twitterUrl: data.twitter_url || "",
          is_agency: Boolean(data.is_agency || user?.is_agency),
          agency_type: data.agency_type || user?.agency_type || "" // v416 (CR1): was never loaded → saved back as null
        });
      }
    } catch (e) {
      console.error("Error loading brand profile settings:", e);
      setProfileLoadFailed(true); // v416
    } finally {
      stopLoading();
      setProfileLoading(false); // v415
    }
  };

  const fetchKycStatus = async () => {
    setKycLoading(true);
    try {
      let failed = false;
      const res = await api.get("verifications/me").catch(() => { failed = true; return null; });
      setKycFailed(failed); // v415
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
        setSessionsFailed(false);
      } else {
        // v332: this used to invent a "current device · India" row with a fake token — the brand could
        // "log out" a session that didn't exist. Now the tab says it couldn't load and offers a retry.
        setSessionsList([]);
        setSessionsFailed(true);
      }
    } catch (e) {
      console.warn("Error fetching sessions", e);
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    // On mobile this page renders BrandProfileMobile, which loads the same three
    // things itself — skip these so a mobile visit doesn't fire them twice.
    if (isMobile) return;
    if (user && !hasLoaded) {
      loadBrandData();
      fetchKycStatus();
      fetchSessions();
      setHasLoaded(true);
    }
  }, [user, hasLoaded, isMobile]); // v423: a page opened at phone width and then widened now loads (it said "Still loading" for ever)

  const saveProfileChanges = async (updatedFields) => {
    // v346: no all-spaces company name; website only as an http(s) link (no "javascript:")
    // v416 (CR1): if the profile never loaded, saving would overwrite the real details with blanks — refuse.
    if (profileLoadFailed || profileLoading) {
      toast.error(profileLoadFailed ? "Couldn't load your current details, so nothing was saved. Please reload and try again." : "Still loading your details — try again in a moment.");
      return false;
    }
    const pre = { ...profile, ...updatedFields };
    if (!String(pre.company_name || "").trim()) { toast.error("Please enter your company name."); return false; }
    const web = checkHttpUrl(pre.website, { label: "Website" });
    if (!web.ok) { toast.error(web.error); return false; }
    begin("save");
    try {
      const mergedProfile = { ...profile, ...updatedFields, company_name: String(pre.company_name).trim(), website: web.url };
      const locParts = (mergedProfile.location || "").split(",");
      const city = locParts[0]?.trim() || "";
      const state = locParts[1]?.trim() || "";

      const payload = {
        company_name: mergedProfile.company_name,
        industry: mergedProfile.industry,
        website: mergedProfile.website,
        description: mergedProfile.description,
        city: city,
        state: state,
        email: mergedProfile.pocEmail,
        poc_email: mergedProfile.pocEmail,
        phone: mergedProfile.pocPhone,
        representative_name: mergedProfile.pocName,
        representative_designation: mergedProfile.pocDesignation,
        representative_mobile: mergedProfile.pocPhone,
        youtube_url: mergedProfile.youtubeUrl || mergedProfile.youtube_url || null,
        linkedin_url: mergedProfile.linkedinUrl || mergedProfile.linkedin_url || null,
        twitter_url: mergedProfile.twitterUrl || mergedProfile.twitter_url || null,
        campaign_types: mergedProfile.campaignTypes ? mergedProfile.campaignTypes.split(",").map(s => s.trim()) : [],
        budget_range: mergedProfile.budgetRange,
        preferred_creator_size: mergedProfile.creatorSize,
        preferred_niches: mergedProfile.niches,
        gender_focus: mergedProfile.genderFocus,
        team_size: mergedProfile.teamSize,
        logo: mergedProfile.logo,
        cover_image: mergedProfile.cover,
        is_agency: Boolean(mergedProfile.is_agency),
        agency_type: mergedProfile.agency_type || null
      };

      // v416 (CR16): the server save is the only write (no browser upsert before the server's permission check).
      await api.post('brands/profile', payload);
      await refreshUser();
      setProfile(mergedProfile);
      toast.success("Changes saved");
      return true; // v330: callers only close / confirm on a real save
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Couldn't save your changes. Please try again." /* v332: no raw err.message */);
      return false;
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
      const res = await api.post("/otp/send", { target: field === "pocPhone" ? "phone" : "email", value });
      if (res.data?.ok) {
        setOtpSent(true);
        setOtpModalField(field);
        setOtpTargetValue(value);
        toast.success("Code sent. Please check your inbox.");
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Couldn't send the code. Please try again." /* v332: no raw err.message */);
    } finally {
      end("otp");
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpValue) {
      toast.error("Please enter the 6-digit code.");
      return;
    }
    setVerifyingOtp(true);
    try {
      const target = otpModalField === "pocPhone" ? "phone" : "email";
      const res = await api.post("/otp/verify", { target, value: otpTargetValue, code: otpValue });
      if (res.data?.ok) {
        toast.success("Verification successful!");
        const updatedFields = { [otpModalField]: otpTargetValue };
        const saved = await saveProfileChanges(updatedFields);
        if (!saved) return; // v330: keep the OTP popup open if saving failed
        setOtpSent(false);
        setOtpModalField(null);
        setOtpValue("");
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "That code didn't work. Please check it and try again." /* v332: no raw err.message */);
    } finally {
      setVerifyingOtp(false);
    }
  };

  // Logout Specific Session
  const handleLogoutSession = async (token) => {
    begin(`session:${token}`);
    try {
      await api.post(`sessions/logout/${token}`);
      toast.success("That device is logged out.");
      await fetchSessions();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Couldn't log out that device. Please try again." /* v332: no raw err.message */);
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
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Couldn't log out the other devices. Please try again." /* v332: no raw err.message */);
    } finally {
      end("logout-others");
    }
  };

  // v415: popups — page behind doesn't scroll; Escape closes the top one (not while saving)
  const anyPopupOpen = Boolean(editModalField || contactPrompt.isOpen || otpSent);
  useScrollLock(anyPopupOpen);
  useEffect(() => {
    if (!anyPopupOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape" || anyBusy || verifyingOtp) return;
      if (otpSent) setOtpSent(false);
      else if (contactPrompt.isOpen) setContactPrompt((p) => ({ ...p, isOpen: false }));
      else setEditModalField(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [anyPopupOpen, otpSent, contactPrompt.isOpen, anyBusy, verifyingOtp]);

  const openEditModal = (field) => {
    setEditModalField(field);
    setEditValue(profile[field] || "");
  };

  const saveEditValue = async () => {
    const saved = await saveProfileChanges({ [editModalField]: editValue });
    if (saved) setEditModalField(null); // v330: a failed save no longer closes the popup and loses the typed value
  };

  // Mobile gets the native Brand Profile hub and its sub-screens (mockup 1a-1k).
  // The bottom nav's "Brand" tab points at /brand/account, which mounts this page,
  // so without this branch the mobile hub was only reachable via /brand/profile.
  // Desktop rendering below is untouched.
  if (isMobile) {
    return <BrandProfileMobile />;
  }

  return (
    <div className="w-full max-w-none px-4 md:px-8 pt-6 pb-20 relative" data-testid="settings-page">
      {/* v416 (H4): side-by-side only from 1024px — at tablet width (768 + app sidebar) the card ran off the screen */}
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        
        {/* Navigation Sidebar */}
        <div className="w-full lg:w-64 flex-shrink-0">
          <h2 className="text-xl font-extrabold text-slate-900 px-4 mb-4 font-display">Settings</h2>{/* v415: was "Settings Hub" */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2">{/* v416 (H4) */}
          {[
            // v415: plain, consistent tab names (sentence case)
            { id: "profile", label: "Company details", icon: <Building size={16} /> },
            { id: "kyc", label: "Brand verification", icon: <Shield size={16} /> },
            { id: "sessions", label: "Signed-in devices", icon: <MonitorSmartphone size={16} /> },
            { id: "legal", label: "Privacy & terms", icon: <FileText size={16} /> },
            { id: "account", label: "Login & account", icon: <AccountTabIcon size={16} /> }, // v334
            { id: "help", label: "Help & support", icon: <SupportTabIcon size={16} /> } // v334
          ].map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? "page" : undefined} /* v415 */
                className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-colors text-left cursor-pointer z-10 ${
                  isActive 
                    ? "text-white" 
                    : "bg-white border border-slate-100 hover:bg-slate-50 text-slate-700"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="brandSettingsTabPill"
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
        </div>

        {/* Settings Area */}
        <div className="flex-1 min-w-0 bg-white border border-slate-100 rounded-3xl p-5 md:p-8 shadow-sm">{/* v416 (H4): min-w-0 so it can shrink */}
          <AnimatePresence mode="wait">
            {activeTab === "profile" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-900 font-display">Company details</h3>{/* v415: was "Company Profile" (same name as the public page) */}
                    <p className="text-xs text-slate-500 font-medium">Edit what creators see on your public profile and campaigns.</p>
                  </div>
                  <Link to="/brand/profile" className="text-xs font-bold text-[var(--violet)] hover:underline min-h-[40px] inline-flex items-center">View public profile →</Link>
                </div>

                {profileLoadFailed && ( /* v416 (CR1): say it, offer a retry — editing is blocked until it loads */
                  <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-sm text-amber-900 font-medium">Couldn't load your company details. Editing is paused so nothing gets overwritten.</p>
                    <button type="button" onClick={loadBrandData} className="min-h-[40px] px-4 rounded-xl bg-white border border-amber-300 text-amber-900 text-xs font-bold cursor-pointer">Try again</button>
                  </div>
                )}
                {/* Profile Header Visual Editor */}
                <div className="relative mb-14">
                  {/* Banner Wrapper with rounded corners and overflow-hidden */}
                  <div className="rounded-2xl overflow-hidden bg-slate-100 h-36 md:h-44 border border-slate-150 shadow-sm relative">
                    {/* v332: no stock photo as "your" cover — brand gradient until one is uploaded */}
                    <div className="absolute inset-0 bg-gradient-to-r from-[#2E1A68] via-[#3B1E7E] to-[#582A9C]" />
                    {profile.cover && (
                      <img 
                        src={profile.cover} 
                        className="absolute inset-0 w-full h-full object-cover" /* v415: can't push layout */
                        alt="Cover Banner"
                        onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} // v330
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent"></div>
                    <button 
                      onClick={() => openEditModal('cover')} 
                      className="absolute top-4 right-4 bg-white/90 backdrop-blur-md hover:bg-white text-slate-800 text-[10px] font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm transition-all border border-slate-200 cursor-pointer"
                    >
                      <Camera size={12}/> Change cover
                    </button>
                  </div>
                  
                  {/* Logo - positioned outside the banner container so it is NEVER clipped */}
                  <div className="absolute -bottom-10 left-6 z-20 flex items-end gap-3">
                    <div className="w-20 h-20 md:w-24 md:h-24 rounded-full border-4 border-white bg-slate-50 overflow-hidden relative group shadow-lg">
                      {/* v330: with no logo the src was a broken relative URL ("Acme&background=…") — show initials */}
                      {profile.logo && logoBroken !== profile.logo ? (
                        <img 
                          src={profile.logo} 
                          className="w-full h-full object-cover" 
                          alt="Profile Logo"
                          onError={() => setLogoBroken(profile.logo)}
                        />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center bg-[var(--violet)] text-white text-xl font-extrabold">
                          {String(profile.company_name || "B").trim().slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <button 
                        onClick={() => openEditModal('logo')} 
                        aria-label="Change company logo" /* v415: icon-only button had no label */
                        className="absolute inset-0 bg-black/55 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer border-none"
                      >
                        <Camera className="text-white" size={18} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { field: 'company_name', label: 'Company Name' },
                    { field: 'industry', label: 'Industry Category' },
                    { field: 'website', label: 'Corporate Website URL' },
                    { field: 'location', label: 'Headquarters Location' },
                    { field: 'teamSize', label: 'Team Size' },
                    { field: 'description', label: 'Company Description' }
                  ].map(p => (
                    <div key={p.field} className={`p-4 border border-slate-100 rounded-xl flex justify-between items-center bg-slate-50/50 ${p.field === 'description' ? 'col-span-1 md:col-span-2' : ''}`}>
                      <div className="flex-1 min-w-0 pr-4">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">{p.label}</span>
                        <span className="text-xs font-extrabold text-slate-800 block truncate leading-relaxed">
                          {profileLoading ? <span className="inline-block h-3 w-32 bg-slate-200/80 rounded animate-pulse align-middle" aria-label="Loading" /> : (profile[p.field] || "Not provided")}{/* v415 */}
                          {p.field === 'company_name' && (
                            <>
                              {kycObj?.status === 'APPROVED' && (
                                <span className="ml-2 inline-flex items-center justify-center bg-blue-100 text-[#7C3AED] rounded-full w-4 h-4" title="Verified Brand">
                                   <Shield size={10} className="fill-current" />
                                </span>
                              )}
                              {profile.is_agency && (
                                <AgencyBadge size="xs" className="ml-2 align-middle" />
                              )}
                            </>
                          )}
                        </span>
                      </div>
                      <button onClick={() => openEditModal(p.field)} aria-label={`Edit ${p.label}`} className="text-[var(--violet)] hover:bg-[var(--violet)]/5 p-2 rounded-lg transition-colors flex-shrink-0">
                        <Edit2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                                                {/* Agency Status Designation */}
                <div className="p-4 border border-[#DDD6FE] bg-[#F5F0FF]/40 rounded-2xl flex flex-col justify-between gap-4 relative">
                  {!profile.is_agency && <span className="absolute -top-2.5 -right-2 bg-[var(--violet)] text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm z-10">New</span>}{/* v415: no endless pulse */}
                  <div className="flex items-start justify-between w-full">
                    <div className="flex gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#EDE9FE] text-[#6D28D9] flex items-center justify-center shrink-0 mt-0.5">
                        <Briefcase size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-800">Are you an agency? Show the Agency badge</span>
                          {profile.is_agency && <AgencyBadge size="xs" />}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">
                          Creators see an "Agency" badge on your campaigns, chats and profile.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <select
                      aria-label="Agency type" /* v415 */
                      value={profile.agency_type || ""}
                      onChange={(e) => setProfile(prev => ({ ...prev, agency_type: e.target.value }))}
                      className="px-3 py-2 rounded-xl text-xs font-medium border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED] flex-1"
                    >
                      <option value="" disabled>Select agency type…</option>
                      <option value="Marketing Agency">Marketing Agency</option>
                      <option value="Branding Agency">Branding Agency</option>
                      <option value="PR Agency">PR Agency</option>
                      <option value="Influencer Agency">Influencer Agency</option>
                      <option value="Talent Management">Talent Management</option>
                      <option value="Creative Agency">Creative Agency</option>
                      <option value="Other">Other</option>
                    </select>

                    <button
                      type="button"
                      disabled={!profile.agency_type && !profile.is_agency}
                      onClick={async () => {
                        if (!profile.agency_type) {
                          toast.error("Please select an agency type first.");
                          return;
                        }
                        const nextState = !profile.is_agency;
                        const saved = await saveProfileChanges({ is_agency: nextState, agency_type: profile.agency_type });
                        if (saved) toast.success(nextState ? "Agency badge is on." : "Agency badge removed.");
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer ${
                        profile.is_agency
                          ? "bg-[#7C3AED] text-white shadow-xs hover:bg-[#6D28D9]"
                          : "bg-slate-900 text-white shadow-xs hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      }`}
                    >
                      {profile.is_agency ? (
                        <>
                          <Check size={14} className="stroke-[3]" /> Remove Agency badge
                        </>
                      ) : (
                        "Show Agency badge"
                      )}
                    </button>
                  </div>
                </div>

                {/* Campaign Strategy Details */}
                <div className="border-t border-slate-100 pt-6 space-y-4">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Campaign preferences</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { field: 'campaignTypes', label: 'Campaign Types' },
                      { field: 'budgetRange', label: 'Typical Budget' },
                      { field: 'creatorSize', label: 'Preferred Creator Size' },
                      { field: 'niches', label: 'Target Niches' },
                      { field: 'genderFocus', label: 'Target Audience Gender' }
                    ].map(p => (
                      <div key={p.field} className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 flex justify-between items-center">
                        <div className="flex-1 min-w-0 pr-4">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">{p.label}</span>
                          <span className="text-xs font-extrabold text-slate-800 block truncate leading-relaxed">
                            {profileLoading ? <span className="inline-block h-3 w-28 bg-slate-200/80 rounded animate-pulse align-middle" aria-label="Loading" /> : (profile[p.field] || "Not specified")}{/* v415 */}
                          </span>
                        </div>
                        <button onClick={() => openEditModal(p.field)} aria-label={`Edit ${p.label}`} className="text-[var(--violet)] hover:bg-[var(--violet)]/5 p-2 rounded-lg transition-colors flex-shrink-0">
                          <Edit2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Secure Contacts / POC details */}
                <div className="border-t border-slate-100 pt-6 space-y-4">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Point of contact</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { field: 'pocName', label: 'Contact name' },
                      { field: 'pocDesignation', label: 'Designation' }
                    ].map(poc => (
                      <div key={poc.field} className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 flex justify-between items-center">
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">{poc.label}</span>
                          <span className="text-xs font-extrabold text-slate-800">{profileLoading ? <span className="inline-block h-3 w-28 bg-slate-200/80 rounded animate-pulse align-middle" aria-label="Loading" /> : (profile[poc.field] || "Not provided")}</span>
                        </div>
                        <button onClick={() => openEditModal(poc.field)} aria-label={`Edit ${poc.label}`} className="text-[var(--violet)] hover:bg-[var(--violet)]/5 p-2 rounded-lg transition-colors">
                          <Edit2 size={14} />
                        </button>
                      </div>
                    ))}

                    <div className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
                      <div className="flex-1 w-full">
                        <label htmlFor="poc-phone" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Mobile number</label>
                        <input 
                          id="poc-phone" /* v415: label linked */
                          type="tel"
                          value={profile.pocPhone || ""}
                          onChange={(e) => setProfile({ ...profile, pocPhone: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-[var(--violet)]"
                          placeholder="Enter mobile number"
                        />
                      </div>
                      <button 
                        onClick={() => saveProfileChanges({ pocPhone: profile.pocPhone })}
                        className="disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2 bg-[var(--violet)] hover:bg-[#6c48d4] text-white text-[10px] font-bold rounded-lg transition-all flex-shrink-0 self-stretch sm:self-end h-[36px] flex items-center justify-center cursor-pointer"
                       disabled={anyBusy}>{isBusy("save") && <ButtonSpinner className="mr-1.5" />}
                        Update
                      </button>
                    </div>

                    <div className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 flex justify-between items-end gap-3">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Business email</span>
                        <span className="text-xs font-extrabold text-slate-800 block pt-1">{profile.pocEmail || "Not linked"}</span>
                      </div>
                      <button 
                        onClick={() => {
                          setContactPrompt({ isOpen: true, field: 'pocEmail', label: 'Business Email', value: profile.pocEmail || '' });
                        }} 
                        className="px-3.5 py-2 bg-[var(--violet)]/10 hover:bg-[var(--violet)]/15 text-[var(--violet)] text-[10px] font-bold rounded-lg transition-all shrink-0 self-end h-[36px] flex items-center justify-center cursor-pointer"
                      >
                        Verify & Link
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "kyc" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 font-display">Brand verification</h3>{/* v415: same name as /brand/kyc */}
                  <p className="text-xs text-slate-500 font-medium">Ybex checks your GSTIN or PAN and business details before you pay creators.</p>
                </div>

                {kycLoading ? (
                  <div className="flex justify-center items-center pt-6 pb-10">
                    <Loader2 size={24} className="animate-spin text-slate-500" />
                  </div>
                ) : (kycFailed && !kycObj) ? (
                  /* v415: a failed read is not "not submitted" */
                  <div className="text-center pt-6 pb-8 bg-slate-50 border border-dashed border-slate-200 rounded-3xl p-6" data-testid="settings-kyc-load-error">
                    <h4 className="font-extrabold text-slate-700 text-sm">Couldn't check your verification</h4>
                    <p className="text-[11px] text-slate-500 font-medium mt-1">If you already submitted, nothing is lost.</p>
                    <button type="button" onClick={fetchKycStatus} className="mt-4 px-5 py-2.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white text-xs font-bold rounded-xl cursor-pointer">Try again</button>
                  </div>
                ) : (!kycObj || kycObj.status === "NOT_SUBMITTED") ? (
                  <div className="text-center pt-6 pb-10 bg-slate-50 border border-dashed border-slate-200 rounded-3xl p-6">
                    <ShieldAlert className="mx-auto text-slate-500 mb-3" size={32} />
                    <h4 className="font-extrabold text-slate-700 text-sm">Verification pending</h4>
                    <p className="text-[11px] text-slate-500 font-medium max-w-sm mx-auto mt-1 leading-relaxed">
                      Verify your brand once to publish campaigns, pay creators and get the Verified Brand badge. It takes about 2 minutes.
                    </p>
                    <a 
                      href="/brand/kyc" 
                      className="inline-block mt-4 px-5 py-2.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white text-xs font-bold rounded-xl transition-all shadow-md hover:scale-[1.02] cursor-pointer"
                    >
                      Verify your brand
                    </a>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Status Card Banner */}
                    <div className={`border rounded-2xl p-6 ${
                      kycObj.status === 'APPROVED' || kycObj.status === 'approved'
                        ? 'bg-emerald-50/50 border-emerald-100'
                        : ["PENDING", "UNDER_REVIEW", "SUBMITTED"].includes(String(kycObj.status || "").toUpperCase())
                        ? 'bg-amber-50/50 border-amber-100'
                        : 'bg-rose-50/50 border-rose-100'
                    }`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-xl mt-0.5 ${
                            kycObj.status === 'APPROVED' || kycObj.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-700'
                              : ["PENDING", "UNDER_REVIEW", "SUBMITTED"].includes(String(kycObj.status || "").toUpperCase())
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-rose-100 text-rose-700'
                          }`}>
                            <Shield size={20} />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Status</span>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase inline-block mt-1 ${
                              kycObj.status === 'APPROVED' || kycObj.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-700'
                                : ["PENDING", "UNDER_REVIEW", "SUBMITTED"].includes(String(kycObj.status || "").toUpperCase())
                                ? 'bg-amber-100 text-[#D97706]'
                                : 'bg-rose-100 text-rose-700'
                            }`}>
                              {verificationLabel(kycObj.status) /* v330 · v415: friendly words, no raw codes */}
                            </span>
                          </div>
                        </div>

                        {/* CTAs */}
                        {(kycObj.status === 'REJECTED' || kycObj.status === 'rejected' || kycObj.status === 'MORE_INFO_NEEDED') && (
                          <a 
                            href="/brand/kyc" 
                            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-all shadow-md text-center hover:scale-[1.02]"
                          >
                            Update & resubmit
                          </a>
                        )}
                      </div>

                      {/* Status Messages */}
                      {(["PENDING", "UNDER_REVIEW", "SUBMITTED"].includes(String(kycObj.status || "").toUpperCase())) && (
                        <p className="text-xs text-amber-700 font-medium mt-4 bg-amber-50 border border-amber-100/50 rounded-xl p-3 leading-relaxed">
                          We're reviewing your details — usually within a day. You can draft campaigns meanwhile; publishing unlocks once you're verified.
                        </p>
                      )}

                      {(kycObj.status === 'APPROVED' || kycObj.status === 'approved') && (
                        <p className="text-xs text-emerald-700 font-medium mt-4 bg-emerald-50 border border-emerald-100/50 rounded-xl p-3 leading-relaxed">
                          Your brand is verified. Changing these details later sends them for review again.
                        </p>
                      )}

                      {(kycObj.status === 'REJECTED' || kycObj.status === 'rejected' || kycObj.status === 'MORE_INFO_NEEDED') && (
                        <div className="mt-4 bg-rose-50 border border-rose-100 rounded-xl p-4 space-y-1">
                          <h5 className="text-xs font-extrabold text-rose-800">What needs to change</h5>
                          <p className="text-[11px] text-rose-700 font-medium leading-relaxed">
                            {kycObj.rejection_reason || kycObj.admin_note || "Some details couldn't be verified. Please check them and resubmit."}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Submitted Details Review Grid — v332: empty fields read "Not provided" instead of "N/A" */}
                    <div className="border border-slate-100 rounded-2xl p-6 bg-slate-50/50 space-y-4">
                      <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest border-b border-slate-100 pb-2">Submitted details</h4>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-xs">
                        <div className="py-1 flex flex-col gap-0.5">
                          <span className="text-slate-500 font-bold">Company Name</span>
                          <span className="text-slate-800 font-extrabold">{kycObj.documents?.company_name || "Not provided"}</span>
                        </div>
                        <div className="py-1 flex flex-col gap-0.5">
                          <span className="text-slate-500 font-bold">GSTIN</span>
                          <span className="text-slate-800 font-extrabold">{kycObj.documents?.gstin || kycObj.documents?.gst_cert || "Not provided"}</span>{/* v332: GSTIN is saved as "gstin" by the KYC form */}
                        </div>
                        <div className="py-1 flex flex-col gap-0.5">
                          <span className="text-slate-500 font-bold">PAN</span>
                          <span className="text-slate-800 font-extrabold">{kycObj.documents?.brand_pan || "Not provided"}</span>
                        </div>
                        <div className="py-1 flex flex-col gap-0.5">
                          <span className="text-slate-500 font-bold">Contact name</span>
                          <span className="text-slate-800 font-extrabold">{kycObj.documents?.poc_name || "Not provided"}</span>
                        </div>
                        <div className="py-1 flex flex-col gap-0.5">
                          <span className="text-slate-500 font-bold">Designation</span>
                          <span className="text-slate-800 font-extrabold">{kycObj.documents?.poc_designation || "Not provided"}</span>
                        </div>
                        <div className="py-1 flex flex-col gap-0.5">
                          <span className="text-slate-500 font-bold">Work email</span>
                          <span className="text-slate-800 font-extrabold">{kycObj.documents?.poc_email || "Not provided"}</span>
                        </div>
                        <div className="py-1 flex flex-col gap-0.5">
                          <span className="text-slate-500 font-bold">Phone</span>
                          <span className="text-slate-800 font-extrabold">{kycObj.documents?.poc_phone || "Not provided"}</span>
                        </div>
                        <div className="py-1 flex flex-col gap-0.5">
                          <span className="text-slate-500 font-bold">Website</span>
                          <span className="text-slate-800 font-extrabold">
                            {kycObj.documents?.website ? (
                              <a href={/^https?:\/\//i.test(kycObj.documents.website) ? kycObj.documents.website : `https://${kycObj.documents.website}` /* v332: "www.brand.com" opened as a page inside the app */} target="_blank" rel="noreferrer" className="text-[#7C3AED] hover:underline font-extrabold flex items-center gap-1 break-all">
                                {kycObj.documents.website}
                              </a>
                            ) : "Not provided"}
                          </span>
                        </div>
                        {/* v332: also the document the KYC form uploads; private files open through the media link */}
                        {(kycObj.documents?.incorporation_proof || kycObj.documents?.business_proof_document_url) && (
                          <div className="py-1 flex flex-col gap-0.5 md:col-span-2">
                            <span className="text-slate-500 font-bold">Business document</span>
                            <span className="text-slate-800 font-extrabold">
                              <a 
                                href={mediaHref(kycObj.documents.incorporation_proof || kycObj.documents.business_proof_document_url)} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold border border-slate-200 mt-1 transition-colors"
                              >
                                <FileText size={14} /> View document
                              </a>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "sessions" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-900 font-display">Signed-in devices</h3>
                    <p className="text-xs text-slate-500 font-medium">Devices where your account is signed in.</p>
                  </div>
                  <button 
                    onClick={handleLogoutAllOtherSessions}
                    className="disabled:opacity-60 disabled:cursor-not-allowed px-3.5 py-2 border border-rose-200 hover:bg-rose-50 text-rose-600 text-xs font-bold rounded-xl transition-all"
                   disabled={anyBusy}>{isBusy("logout-others") && <ButtonSpinner className="mr-1.5" />}
                    Log out other devices
                  </button>
                </div>

                {loadingSessions ? (
                  <div className="flex justify-center items-center pt-6 pb-10">
                    <Loader2 size={24} className="animate-spin text-slate-500" />
                  </div>
                ) : sessionsFailed ? (
                  <div className="text-center pt-6 pb-8 bg-slate-50 border border-dashed border-slate-200 rounded-3xl p-6">
                    <h4 className="font-extrabold text-slate-700 text-sm">Couldn't load your devices</h4>
                    <p className="text-[11px] text-slate-500 font-medium mt-1">Please try again in a moment.</p>
                    <button type="button" onClick={fetchSessions} className="mt-4 px-5 py-2.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white text-xs font-bold rounded-xl cursor-pointer">Try again</button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sessionsList?.map(sess => (
                      <div key={sess.session_token} className="p-4 border border-slate-100 rounded-2xl flex items-center justify-between bg-slate-50/50">
                        <div className="flex items-center gap-3">
                          <MonitorSmartphone className="text-slate-500" size={20} />
                          <div>
                            <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-2">
                              {sess.device || sess.device_name || "Unknown device"} 
                              {sess.isCurrent && <span className="bg-emerald-50 text-emerald-600 text-[11px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-100">Current</span>}
                            </h4>
                            <span className="text-[10px] text-slate-500 font-bold block mt-0.5">{sess.location || "Location unknown"}</span>
                          </div>
                        </div>
                        {!sess.isCurrent && (
                          <button 
                            onClick={() => handleLogoutSession(sess.session_token)}
                            aria-label="Log out this device"
                            className="disabled:opacity-60 disabled:cursor-not-allowed w-10 h-10 flex items-center justify-center hover:bg-rose-50 text-rose-500 hover:text-rose-600 rounded-lg transition-colors" /* v415: 40px */
                           disabled={anyBusy}>{isBusy(`session:${sess.session_token}`) ? <ButtonSpinner /> : <LogOut size={14} />}{/* v415: spinner replaces the icon */}
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
                <LegalPanel role="brand" />
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
      <FounderNoteDesktop className="mt-12" />

      {/* Edit fields Modal */}
      <Presence>{editModalField && (
        <PopupBackdrop className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => { if (!anyBusy && !uploadingImage) setEditModalField(null); } /* v415: click outside closes */}>
          <PopupPanel kind="modal" role="dialog" aria-modal="true" aria-labelledby="settings-edit-title" onClick={(e) => e.stopPropagation()} className="bg-white border border-slate-100 rounded-3xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto overscroll-contain shadow-2xl relative">
            <button onClick={() => setEditModalField(null)} aria-label="Close" className="absolute top-3 right-3 w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100">{/* v415: 40px */}
              <X size={18} />
            </button>
            <h3 id="settings-edit-title" className="text-base font-extrabold text-slate-800 mb-4 pr-10 font-display">
              Update {
                {
                  company_name: "Company Name",
                  industry: "Industry Category",
                  website: "Corporate Website URL",
                  location: "Headquarters Location",
                  teamSize: "Team Size",
                  description: "Company Description",
                  campaignTypes: "Campaign Types & Scope",
                  budgetRange: "Typical Budget",
                  creatorSize: "Preferred Creator Size",
                  niches: "Target Niches",
                  genderFocus: "Target Audience Gender",
                  logo: "Company Logo",
                  cover: "Cover Banner",
                }[editModalField] || editModalField
              }
            </h3>
            
            {editModalField === 'location' ? (
              <LocationAutocomplete 
                value={editValue} 
                onChange={val => setEditValue(val)} 
                className="mb-4"
              />
            ) : editModalField === 'description' ? (
              <textarea 
                aria-label="Company description" /* v415 */
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                rows={4}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-800 focus:outline-none mb-4 resize-none leading-relaxed"
              />
            ) : editModalField === 'industry' ? (
              <div className="mb-4">
                <UniversalTagSearch
                  selectedTags={editValue ? [editValue] : []}
                  onChange={newTags => setEditValue(newTags[newTags.length - 1] || "")}
                  type="category"
                  placeholder="Search or create custom category..."
                />
              </div>
            ) : (editModalField === 'logo' || editModalField === 'cover') ? (
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
                      e.target.value = ""; // v332: picking the same file again after a failed upload works
                      if (file) handleImageUpload(file);
                    }}
                  />
                  {uploadingImage ? (
                    <div className="flex flex-col items-center justify-center py-2">
                      <Loader2 className="animate-spin text-[var(--violet)] mb-3" size={28} />
                      <p className="text-xs font-bold text-slate-700 animate-pulse">Uploading image…</p>{/* v332: no tech wording */}
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

                {/* v423 (S10): "Or paste image URL" removed — images are uploaded from the device (outside links are refused) */}

                {editValue && (
                  <div className="rounded-xl border border-slate-100 overflow-hidden bg-slate-50 p-2 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-bold text-slate-500 mb-2 uppercase self-start pl-1">Live Preview:</span>
                    {/* v415: a bad link says so (it used to load an external placeholder picture) */}
                    {previewBroken === editValue ? (
                      <p className="text-[11px] font-semibold text-rose-600 py-3">This link isn't an image we can show. Please check it.</p>
                    ) : (
                    <img 
                      src={editValue} 
                      alt="Preview" 
                      className={`object-cover border border-slate-100 bg-white ${editModalField === 'logo' ? 'w-20 h-20 rounded-full' : 'w-full h-24 rounded-lg'}`}
                      onError={() => setPreviewBroken(editValue)}
                    />
                    )}
                  </div>
                )}
              </div>
            ) : editModalField === 'teamSize' ? (
              <div className="space-y-3 mb-4">
                <p className="text-xs text-slate-500 font-medium">Select your company's team size or enter custom value:</p>
                <div className="flex flex-wrap gap-2">
                  {["1-10 Employees", "11-50 Employees", "51-200 Employees", "500+ Employees"].map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setEditValue(opt)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                        editValue === opt
                          ? 'bg-[var(--violet)] text-white border-[var(--violet)] shadow-sm'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <input 
                  type="text"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  placeholder="Or enter custom team size..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-800 focus:outline-none focus:border-[var(--violet)] mt-2"
                />
              </div>
            ) : editModalField === 'campaignTypes' ? (
              <div className="space-y-4 mb-4">
                <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3.5 text-xs leading-relaxed space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-900">
                    <AlertCircle size={15} className="text-amber-600 flex-shrink-0" />
                    <span>Campaign Strategy & Budget Frequency Note</span>
                  </div>
                  <p className="text-[11px] text-amber-800 font-medium">
                    Please specify your campaign types and state whether your budget strategy is <strong>Monthly</strong>, <strong>Annual</strong>, or <strong>Per Campaign basis</strong>.
                  </p>
                  <p className="text-[10px] text-amber-700">
                    Based on these details, our review team will evaluate and approve campaign allocations.
                  </p>
                </div>

                <p className="text-xs text-slate-500 font-medium">Select campaign type options:</p>
                <div className="flex flex-wrap gap-2">
                  {["UGC & Product Reviews", "Sponsored Posts", "Brand Ambassador", "Affiliate Marketing", "Event Coverage"].map(opt => {
                    const currentArr = editValue ? editValue.split(",").map(s => s.trim()).filter(Boolean) : [];
                    const isSelected = currentArr.includes(opt);
                    const toggleOpt = () => {
                      let updated = isSelected ? currentArr.filter(x => x !== opt) : [...currentArr, opt];
                      setEditValue(updated.join(", "));
                    };
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={toggleOpt}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                          isSelected
                            ? 'bg-[var(--violet)] text-white border-[var(--violet)] shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected ? `✓ ${opt}` : `+ ${opt}`}
                      </button>
                    );
                  })}
                </div>

                <input 
                  type="text"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  placeholder="e.g. Sponsored posts, UGC reviews — ₹50,000 per month"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-800 focus:outline-none focus:border-[var(--violet)]"
                />
              </div>
            ) : editModalField === 'budgetRange' ? (
              <div className="space-y-3 mb-4">
                <p className="text-xs text-slate-500 font-medium">Enter your typical campaign budget amount or frequency:</p>
                <input 
                  type="text"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  placeholder="e.g. ₹50,000 per month or ₹20,000 per campaign"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-800 focus:outline-none focus:border-[var(--violet)]"
                />
              </div>
            ) : editModalField === 'creatorSize' ? (
              <div className="space-y-3 mb-4">
                <p className="text-xs text-slate-500 font-medium">Select preferred creator tier options:</p>
                <div className="flex flex-wrap gap-2">
                  {["Nano (1K - 10K)", "Micro (10K - 100K)", "Macro (100K - 1M)", "Mega (1M+)"].map(opt => {
                    const currentArr = editValue ? editValue.split(",").map(s => s.trim()).filter(Boolean) : [];
                    const isSelected = currentArr.includes(opt);
                    const toggleOpt = () => {
                      let updated = isSelected ? currentArr.filter(x => x !== opt) : [...currentArr, opt];
                      setEditValue(updated.join(", "));
                    };
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={toggleOpt}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                          isSelected
                            ? 'bg-[var(--violet)] text-white border-[var(--violet)] shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected ? `✓ ${opt}` : `+ ${opt}`}
                      </button>
                    );
                  })}
                </div>
                <input 
                  type="text"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  placeholder="Or enter custom creator criteria..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-800 focus:outline-none focus:border-[var(--violet)] mt-2"
                />
              </div>
            ) : editModalField === 'niches' ? (
              <div className="space-y-3 mb-4">
                <p className="text-xs text-slate-500 font-medium">Select target niches (allows multi-selection of 5+ options):</p>
                <UniversalTagSearch
                  selectedTags={editValue ? editValue.split(",").map(s => s.trim()).filter(Boolean) : []}
                  onChange={newTags => setEditValue(newTags.join(", "))}
                  type="category"
                  placeholder="Search or create custom category..."
                />
              </div>
            ) : editModalField === 'genderFocus' ? (
              <div className="space-y-4 mb-4">
                <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3.5 text-xs leading-relaxed space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-900">
                    <AlertCircle size={15} className="text-amber-600 flex-shrink-0" />
                    <span>Target Audience Demographics Guideline</span>
                  </div>
                  <p className="text-[11px] text-amber-800 font-medium">
                    Please fill in the gender demographic of your target audience as decided by your target audience research and campaign strategy.
                  </p>
                  <p className="text-[10px] text-amber-700">
                    You can select multiple options (such as Men, Women, All Genders, or Others) based on your target audience profile.
                  </p>
                </div>

                <p className="text-xs text-slate-500 font-medium">Select target audience gender(s):</p>
                <div className="flex flex-wrap gap-2">
                  {["All Genders", "Men", "Women", "Non-Binary / Others"].map(opt => {
                    const currentArr = editValue ? editValue.split(",").map(s => s.trim()).filter(Boolean) : [];
                    const isSelected = currentArr.includes(opt);
                    const toggleOpt = () => {
                      let updated = isSelected ? currentArr.filter(x => x !== opt) : [...currentArr, opt];
                      setEditValue(updated.join(", "));
                    };
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={toggleOpt}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                          isSelected
                            ? 'bg-[var(--violet)] text-white border-[var(--violet)] shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected ? `✓ ${opt}` : `+ ${opt}`}
                      </button>
                    );
                  })}
                </div>

                <input 
                  type="text"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  placeholder="Or enter custom gender focus description..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-800 focus:outline-none focus:border-[var(--violet)]"
                />
              </div>
            ) : (
              <input 
                type="text"
                aria-labelledby="settings-edit-title" /* v415 */
                autoFocus
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !anyBusy) saveEditValue(); } /* v415: Enter saves */}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-800 focus:outline-none focus:border-[var(--violet)] mb-4"
              />
            )}

            <div className="flex gap-3 justify-end">
              <button onClick={() => setEditModalField(null)} disabled={anyBusy} className="px-4 py-2 min-h-[40px] border border-slate-200 text-xs font-bold rounded-xl hover:bg-slate-50 disabled:opacity-60">
                Cancel
              </button>
              <button onClick={saveEditValue} disabled={anyBusy || uploadingImage} className="disabled:opacity-60 px-5 py-2 min-h-[40px] inline-flex items-center bg-[var(--violet)] hover:bg-[#6c48d4] text-white text-xs font-bold rounded-xl shadow-md">{isBusy("save") && <ButtonSpinner className="mr-1.5" />}
                {isBusy("save") ? "Saving…" : "Save"}{/* v415: no save while an image is still uploading */}
              </button>
            </div>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* Custom prompt popup for contacts */}
      <Presence>{contactPrompt.isOpen && (
        <PopupBackdrop className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setContactPrompt((p) => ({ ...p, isOpen: false })) /* v415 */}>
          <PopupPanel kind="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="bg-white border border-slate-100 rounded-3xl p-6 w-full max-w-sm shadow-2xl relative">
            <button onClick={() => setContactPrompt({ ...contactPrompt, isOpen: false })} aria-label="Close" className="absolute top-3 right-3 w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100">
              <X size={18} />
            </button>
            <h3 className="text-base font-extrabold text-slate-800 font-display mb-1">Verify {contactPrompt.label}</h3>
            <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
              Enter your {safeLower(contactPrompt.label)} to receive a verification code.
            </p>
            <input 
              aria-label={contactPrompt.label} /* v415 */
              autoFocus
              type={contactPrompt.field === 'pocEmail' ? 'email' : 'tel'}
              value={contactPrompt.value}
              onChange={e => setContactPrompt({ ...contactPrompt, value: e.target.value })}
              placeholder={`Enter new ${safeLower(contactPrompt.label)}`}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-800 focus:outline-none focus:border-[var(--violet)] mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => setContactPrompt({ ...contactPrompt, isOpen: false })} className="flex-1 px-4 py-2.5 border border-slate-100 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button 
                onClick={() => {
                  setContactPrompt({ ...contactPrompt, isOpen: false });
                  // v423 (E1): there is no SMS provider — a phone is saved directly (same rule as the phone app);
                  // only an email needs the code (it can receive contract-signing codes).
                  if (contactPrompt.field === 'pocPhone') { saveProfileChanges({ pocPhone: contactPrompt.value.trim() }); return; }
                  handleRequestOtp(contactPrompt.field, contactPrompt.value);
                }} 
                disabled={!contactPrompt.value.trim()}
                className="flex-1 px-5 py-2.5 bg-[var(--violet)] hover:bg-[#6c48d4] disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md transition-colors"
              >
                Send OTP
              </button>
            </div>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* OTP verification popup */}
      <Presence>{otpSent && (
        <PopupBackdrop className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <PopupPanel kind="modal" role="dialog" aria-modal="true" className="bg-white border border-slate-100 rounded-3xl p-6 w-full max-w-sm shadow-2xl relative text-center">
            <button onClick={() => setOtpSent(false)} aria-label="Close" className="absolute top-3 right-3 w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100">{/* v415: 40px */}
              <X size={18} />
            </button>
            <Mail className="mx-auto text-[var(--violet)] mb-3" size={32} />
            <h3 className="text-base font-extrabold text-slate-800 font-display">Enter the verification code</h3>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              We have sent a verification code to <strong>{otpTargetValue}</strong>. Enter code below:
            </p>

            <input 
              type="text"
              maxLength={6}
              value={otpValue}
              placeholder="6-digit code"
              aria-label="Verification code" /* v415 */
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              onChange={e => setOtpValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-center text-sm font-bold tracking-[0.5em] focus:outline-none focus:border-[var(--violet)] my-5"
            />

            <div className="flex gap-3 mt-4">
              <button onClick={() => setOtpSent(false)} className="flex-1 py-2.5 border border-slate-100 text-xs font-bold rounded-xl hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleVerifyOtp} disabled={anyBusy || (verifyingOtp)} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md">{isBusy("save") && <ButtonSpinner className="mr-1.5" />}
                {verifyingOtp ? "Verifying..." : "Confirm & Save"}
              </button>
            </div>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>
    </div>
  );
}
