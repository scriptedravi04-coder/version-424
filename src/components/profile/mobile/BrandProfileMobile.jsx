import React, { useState, useEffect, useCallback, useRef } from "react";
import { initials as initialsOf } from "../../../utils/initials"; // v358
import ProfileBanner from "../../promo/ProfileBanner";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { ChevronRight, Settings, Package, Globe, Shield, ShieldAlert, CreditCard, HelpCircle, Check, Building, User, Edit2, MapPin, Briefcase, Gift, ExternalLink, LogOut, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../lib/api";
import { useAuth } from "../../../contexts/AuthContext";
import ModalPortal from "../../../components/common/ModalPortal";
import useScrollLock from "../../../lib/useScrollLock"; // v415: page behind a sheet must not scroll

import useBrandProfileData, { toList } from "./brand/useBrandProfileData";
import PublicProfileScreen from "./brand/PublicProfileScreen";
import CompanyDetailsScreen from "./brand/CompanyDetailsScreen";
import PreferencesScreen from "./brand/PreferencesScreen";
import ContactScreen from "./brand/ContactScreen";
import KycScreen from "./brand/KycScreen";
import LegalScreen from "./brand/LegalScreen";
import PaymentsScreen from "./brand/PaymentsScreen";
import { paymentsSummary } from "../../payments/BrandPaymentsMobile"; // v423 (P11)
import SessionsScreen from "./brand/SessionsScreen";
import ReferScreen from "./brand/ReferScreen";
import AccountScreen from "./brand/AccountScreen";
import HelpScreen from "./brand/HelpScreen";

import { Presence, PopupBackdrop, PopupPanel } from "../../common/Popup";
import { AGENCY_TYPES } from "../../../constants/agencyTypes";
import { publicOrigin } from "../../../lib/publicUrl";
import { FounderNoteMobile, VersionLine } from "../../footer/FounderNote";
// Brand Profile on mobile — the hub (mockup screen 1a) plus the ten push-route
// sub-screens (1b–1k), driven off a single `section` query param the same way
// CreatorMobileProfile.jsx drives its own sub-views. No desktop component is
// modified; BrandProfile.jsx and BrandSettings.jsx just mount this behind
// useIsMobile().

// Session 48 (Ravi: "Account doesn't open, sometimes the app hangs"): "account" was missing here, so
// tapping Account set ?section=account, this list threw it away and the hub drew again on every tap.
const SECTIONS = [
  "public", "company", "preferences", "contact", "kyc",
  "legal", "payments", "sessions", "refer", "help", "account",
];

// v415: last known verification status, so a repeat visit draws the card in place (no layout jump)
const KYC_CACHE_KEY = "ybex_brand_kyc_status_v1";
function readKycCache(uid) {
  try {
    const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(KYC_CACHE_KEY) : null;
    const c = raw ? JSON.parse(raw) : null;
    return c && uid && c.uid === uid ? c : null;
  } catch { return null; }
}
function writeKycCache(uid, kyc) {
  try {
    if (!uid || typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(KYC_CACHE_KEY, JSON.stringify({ uid, kyc: kyc ? { status: kyc.status || null } : null }));
  } catch { /* storage full / blocked: no cache */ }
}

// v415: same mapping as verificationLabel() in pages/brand/BrandSettings.jsx (copied, not imported: BrandSettings
// imports this file, so importing back would be a circular import).
function verificationLabel(status) {
  const st = String(status || "").toUpperCase();
  if (st === "APPROVED") return "Verified";
  if (["PENDING", "UNDER_REVIEW", "SUBMITTED", "IN_REVIEW"].includes(st)) return "Under review";
  if (st === "REJECTED") return "Needs changes";
  if (st === "MORE_INFO_NEEDED") return "More info needed";
  return "Verification pending";
}

// v415: one vocabulary with desktop — "Verified" / "Under review" / "Needs changes" / "More info needed" / "Verification pending"
export function brandVerificationBadge(status) {
  const st = String(status || "").trim().toUpperCase();
  const norm = ["MORE_INFO", "NEEDS_INFO"].includes(st) ? "MORE_INFO_NEEDED" : st;
  const label = verificationLabel(norm);
  const tone = label === "Verified" ? "bg-emerald-100 text-emerald-700"
    : label === "Needs changes" ? "bg-red-100 text-red-700"
    : label === "Verification pending" ? "bg-slate-100 text-slate-600"
    : "bg-amber-100 text-amber-800";
  return { label, tone };
}



export default function BrandProfileMobile({ brandData = null, parentLoading = false, campaigns: campaignsProp = null }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showAgencySheet, setShowAgencySheet] = useState(false);
  const [selectedAgencyType, setSelectedAgencyType] = useState(AGENCY_TYPES[0]);
  const [savingAgency, setSavingAgency] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false); // v332: no double tap on "Log out"
  const [logoBroken, setLogoBroken] = useState(false); // v332: dead logo link → initial, not a broken image

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      window.location.replace("/login"); // v346: clean /login, not /login?next=<this page> (the signed-out redirect fired first)
    } catch (e) {
      toast.error("Couldn't log out. Please try again."); // v332: calm copy
      setLoggingOut(false);
    }
  };

  // v415: lock the page behind the Log out / Agency sheets, and let Escape close them (not mid-save)
  useScrollLock(showLogoutModal || showAgencySheet);
  useEffect(() => {
    if (!showLogoutModal && !showAgencySheet) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (showAgencySheet && !savingAgency) setShowAgencySheet(false);
      if (showLogoutModal && !loggingOut) setShowLogoutModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showLogoutModal, showAgencySheet, savingAgency, loggingOut]);

  const rawSection = searchParams.get("section") || searchParams.get("subscreen");
  const rawSectionRef = useRef(rawSection); rawSectionRef.current = rawSection; // v358
  const section = SECTIONS.includes(rawSection) ? rawSection : null;

  // v358: the on-screen Back used to PUSH the hub, so the phone's Back reopened the sub-screen (loop).
  // A sub-screen opened from the hub now goes back in history; anything else replaces.
  const pushedFromHubRef = useRef(false);
  const goTo = useCallback((next) => {
    if (next) { pushedFromHubRef.current = !rawSectionRef.current; setSearchParams({ section: next }); }
    else if (pushedFromHubRef.current && typeof window !== "undefined" && window.history.length > 1) { pushedFromHubRef.current = false; window.history.back(); }
    else setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const goHub = useCallback(() => goTo(null), [goTo]);

  // BottomNav fires this when the account tab is tapped, so re-tapping "Brand"
  // comes back to the hub instead of leaving a sub-screen open.
  useEffect(() => {
    const handleReset = () => goHub();
    window.addEventListener("reset-mobile-profile-hub", handleReset);
    return () => window.removeEventListener("reset-mobile-profile-hub", handleReset);
  }, [goHub]);

  // Shared brand profile row + save, mirroring BrandSettings.jsx.
  const { profile, loading: profileLoading, saving, save, uploadImage, loadFailed, reload } = // v415: + failure state
    useBrandProfileData(parentLoading ? null : brandData);

  // Live KYC — GET verifications/me, the same source BrandKyc.jsx uses. There is no
  // kyc_status column on brand_profiles to read instead.
  const kycUid = user?.user_id || user?.id || null;
  const [kycCached] = useState(() => readKycCache(kycUid)); // v415
  const [kyc, setKyc] = useState(() => kycCached?.kyc || null);
  const [kycLoading, setKycLoading] = useState(() => !kycCached); // v415: cached → draw in place, refresh quietly
  const [kycFailed, setKycFailed] = useState(false); // v358: a failed check is not "not verified"
  const [kycReload, setKycReload] = useState(0);
  const [sessionCount, setSessionCount] = useState(null);
  const [escrowAmount, setEscrowAmount] = useState(null);
  const [campaigns, setCampaigns] = useState(campaignsProp || []);

  useEffect(() => {
    if (Array.isArray(campaignsProp)) setCampaigns(campaignsProp);
  }, [campaignsProp]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data } = await api.get("verifications/me").catch(() => ({ data: undefined }));
        if (!cancelled) {
          if (data === undefined) setKycFailed(true); // v358
          else {
            const next = data && data.status !== "NOT_SUBMITTED" ? data : null;
            setKycFailed(false); setKyc(next);
            writeKycCache(kycUid, next); // v415
          }
        }
      } catch (e) {
        console.warn("Error fetching brand KYC status:", e);
      } finally {
        if (!cancelled) setKycLoading(false);
      }
    })();

    (async () => {
      try {
        const { data } = await api.get("sessions", { bypassCache: true }).catch(() => ({ data: null }));
        if (!cancelled && Array.isArray(data)) setSessionCount(data.length);
      } catch (e) {
        console.warn("Error fetching sessions:", e);
      }
    })();

    (async () => {
      try {
        // v423 (P11): the same source as Account → Payments (GET /brand/payments-overview — campaign deals AND UGC
        // briefs), so the hub and the Payments screen never show two different "in escrow" numbers.
        const { data } = await api.get("brand/payments-overview").catch(() => ({ data: null }));
        if (!cancelled) setEscrowAmount(data?.ok && data.summary ? paymentsSummary(data).held : false); // couldn't read → "—"
      } catch (e) {
        console.warn("Error fetching escrow totals:", e);
      }
    })();

    return () => { cancelled = true; };
  }, [kycReload]); // eslint-disable-line react-hooks/exhaustive-deps -- v358: Retry re-checks

  // When mounted from BrandSettings (/brand/account) there's no campaigns prop, so
  // fetch the same list BrandProfile.jsx fetches.
  useEffect(() => {
    if (Array.isArray(campaignsProp) || !user?.user_id) return;
    let cancelled = false;
    (async () => {
      try {
        // Session 33: the brand's own list from the server (team members included), not a
        // browser read of the campaigns table + every brand's public list.
        const res = await api.get("campaigns?mine=true").catch(() => null);
        if (!cancelled && Array.isArray(res?.data)) setCampaigns(res.data);
      } catch (e) {
        console.warn("Error fetching campaigns:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [campaignsProp, user?.user_id]);

  // ---- Sub-screens (1b–1k) ----
  // The editable screens hold their own draft state, so they're keyed on load
  // completion to pick up the fetched row instead of keeping an empty draft.
  const formKey = profileLoading ? "loading" : "ready";

  if (section === "public") {
    return <PublicProfileScreen onBack={goHub} profile={profile} loading={profileLoading} campaigns={campaigns} kyc={kyc} />;
  }
  if (section === "company") {
    return <CompanyDetailsScreen key={formKey} onBack={goHub} profile={profile} saving={saving} onSave={save} uploadImage={uploadImage} loadFailed={loadFailed} onRetry={reload} />;
  }
  if (section === "preferences") {
    return <PreferencesScreen key={formKey} onBack={goHub} profile={profile} saving={saving} onSave={save} loadFailed={loadFailed} />;
  }
  if (section === "contact") {
    return <ContactScreen key={formKey} onBack={goHub} profile={profile} saving={saving} onSave={save} loadFailed={loadFailed} />;
  }
  if (section === "kyc") return <KycScreen onBack={goHub} kyc={kyc} loading={kycLoading || profileLoading} profile={profile} failed={kycFailed} onRetry={() => { setKycLoading(true); setKycReload((n) => n + 1); }} />;
  if (section === "legal") return <LegalScreen onBack={goHub} />;
  if (section === "payments") return <PaymentsScreen onBack={goHub} />;
  if (section === "sessions") return <SessionsScreen onBack={goHub} />;
  if (section === "account") return <AccountScreen onBack={goHub} onOpen={goTo} onDeleted={logout} />;
  if (section === "refer") return <ReferScreen onBack={goHub} />;
  if (section === "help") return <HelpScreen onBack={goHub} />;

  // ---- Hub (1a) ----
  const brand = {
    name: profile.company_name || "Your brand",
    initials: initialsOf(profile.company_name || "Brand", { fallback: "B" }), // v358: emoji-safe
    industry: profile.industry || "—",
    teamSize: profile.teamSize || "—",
    location: profile.location || "Location not added", // v332: was a made-up "India"
    isAgency: Boolean(profile.is_agency),
    isProfileComplete: Boolean(profile.industry && profile.description),
    hasNiches: toList(profile.niches).length > 0,
    hasPoc: Boolean(profile.pocName || profile.pocPhone || profile.pocEmail),
  };

  const kycStatusColor = {
    approved: { bg: "#E9F7EE", text: "#1B7F45", label: "APPROVED" },
    pending: { bg: "#FEF3C7", text: "#92400E", label: "UNDER REVIEW" },
    under_review: { bg: "#FEF3C7", text: "#92400E", label: "UNDER REVIEW" },
    submitted: { bg: "#FEF3C7", text: "#92400E", label: "UNDER REVIEW" },
    rejected: { bg: "#FEE2E2", text: "#DC2626", label: "REJECTED" },
  };
  const normalizedKyc = (kyc?.status || "").toLowerCase();
  const kycBadge = kycStatusColor[normalizedKyc] || { bg: "#F1F5F9", text: "#475569", label: "NOT STARTED" };
  const kycVerified = normalizedKyc === "approved";
  // Session 41 (Ravi): KYC sent and waiting for admin → "Under review", never a "verify" prompt.
  const kycInReview = ["pending", "under_review", "submitted"].includes(normalizedKyc);
  // v358: Admin → "More info needed" used to show the not-started prompt
  const kycMoreInfo = ["more_info_needed", "more_info", "needs_info"].includes(normalizedKyc);
  const kycBadgeV415 = brandVerificationBadge(kycMoreInfo ? "MORE_INFO_NEEDED" : kyc?.status); // v415
  const kycNote = kyc?.rejection_reason || kyc?.admin_note || kyc?.review_note || kyc?.reason || "";

  const escrowDisplay = escrowAmount === null ? "…" : escrowAmount === false ? "—" : `₹${Number(escrowAmount).toLocaleString("en-IN")}`;

  const calculateBrandProfileStrength = () => {
    let score = 0;
    const tips = [];
    if (profile.company_name) score += 15;
    else tips.push("Add company name");
    if (profile.logo) score += 20;
    else tips.push("Upload company logo");
    if (profile.description) score += 15;
    else tips.push("Add company overview");
    if (profile.industry) score += 15;
    else tips.push("Select industry");
    if (brand.hasNiches) score += 15;
    else tips.push("Set campaign preferences");
    if (brand.hasPoc) score += 10;
    else tips.push("Add point of contact");
    if (kycVerified) score += 10;
    else tips.push("Verify your brand"); // v415

    const tip = tips.length > 0 ? `Next: ${tips[0]}` : "Your brand profile is fully completed and verified!";
    return { score: Math.min(100, score), tip };
  };

  const { score: profileStrength, tip: profileStrengthTip } = calculateBrandProfileStrength();

  const handleShareProfile = async () => {
    const shareUrl = `${publicOrigin()}/brand/${user?.parent_brand_id || user?.user_id || user?.id || ''}`; // team members share the brand, not themselves
    if (navigator.share) {
      try {
        await navigator.share({
          title: brand.name,
          text: `Check out ${brand.name} on Ybex`,
          url: shareUrl,
        });
        return;
      } catch (e) {
        // user closed share dialog
      }
    }
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Profile link copied"); // v415: calm copy
      } catch (e) {
        toast.error("Couldn't copy the link. Please try again.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">{/* v356: no pb-32 — the founder note ends the page on the nav */}
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 px-5 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 font-display tracking-tight">Company Profile</h1>
          <p className="text-[11px] font-bold text-slate-500">Settings</p>{/* v415: was "Settings & Brand Hub" (desktop says "Settings") */}
        </div>
      </header>

      <div className="px-5 py-4 space-y-6">
        {/* Open Identity Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative w-18 h-18 rounded-2xl border-2 border-[#DDD6FE] bg-slate-100 overflow-hidden shrink-0 shadow-xs flex items-center justify-center">
              {profile.logo && !logoBroken ? (
                <img
                  src={profile.logo}
                  alt={brand.name}
                  onError={() => setLogoBroken(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="font-black text-2xl text-[#7C3AED] font-display">
                  {brand.initials}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* v415: while the row loads, a same-height grey bar (no "Your brand" → real name flash) */}
                <h2 className={`text-lg font-black truncate font-display ${profileLoading ? "text-transparent bg-slate-100 rounded-md select-none" : "text-slate-900"}`} aria-busy={profileLoading || undefined}>
                  {profileLoading ? "Loading brand" : brand.name}
                </h2>
                {kycLoading ? (
                  <span aria-hidden="true" className="shrink-0 w-16 h-[22px] rounded-md bg-slate-100" data-testid="brand-badge-skeleton" />
                ) : !kycFailed && (
                  <span data-testid="brand-verification-badge" className={`shrink-0 px-1.5 py-0.5 rounded-md text-[11px] font-black tracking-wider uppercase ${kycBadgeV415.tone}`}>
                    {kycBadgeV415.label /* v415: Verified / Under review / Needs changes / More info needed / Verification pending */}
                  </span>
                )}
                {brand.isAgency && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded-md text-[11px] font-black tracking-wider uppercase bg-[#EDE9FE] text-[#6D28D9]">
                    AGENCY
                  </span>
                )}
              </div>
              {profileLoading ? (
                <>{/* v415: same line heights as the loaded text */}
                  <p aria-hidden="true" className="text-xs font-bold mt-0.5"><span className="inline-block w-28 rounded bg-slate-100 text-transparent">.</span></p>
                  <p aria-hidden="true" className="text-[11px] font-medium flex items-center gap-1 mt-1"><span className="inline-block w-20 h-3 my-[1.5px] rounded bg-slate-100" /></p>
                </>
              ) : (
                <>
                  <p className="text-xs text-slate-600 font-bold truncate mt-0.5">
                    {/* v332: no "— · —" when both are empty */}
                    {[profile.industry, profile.teamSize].filter(Boolean).join(" · ") || "Add industry & team size"}
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1 mt-1 truncate">
                    <MapPin size={12} className="shrink-0 text-slate-500" />
                    {brand.location}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => goTo("company")}
              className="min-h-[40px] py-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-black rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] cursor-pointer"
            >
              <Edit2 size={13} /> Edit company details{/* v415: same name as desktop */}
            </button>
            <button
              type="button"
              onClick={() => goTo("public")}
              className="min-h-[40px] py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
            >
              View public profile <ExternalLink size={12} />{/* v415 */}
            </button>
          </div>
        </div>

        {/* v290 (Ravi): admin promo banner right under the profile header (hidden when none is live) */}
        <ProfileBanner style={{ margin: "0 0 14px" }} />
        {/* v415: CLS 0.11 — the verification card used to pop in after load and push the agency card + list down.
            While the status loads, a same-size skeleton holds its place. */}
        {kycLoading && (
          <div aria-hidden="true" data-testid="brand-kyc-skeleton" className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-slate-100 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-[9px] pt-1">
                <div className="h-3 w-32 rounded bg-slate-100" />
                <div className="h-3 w-full rounded bg-slate-100" />
                <div className="h-3 w-full rounded bg-slate-100" />
                <div className="h-3 w-2/3 rounded bg-slate-100" />
              </div>
            </div>
            <div className="h-[40px] rounded-xl bg-slate-100" />
          </div>
        )}

        {/* Verification under review: calm note + see what was sent (no "Finish KYC" — it is done). */}
        {!kycLoading && kycInReview && (
          <button
            type="button"
            onClick={() => goTo("kyc")}
            data-testid="brand-kyc-under-review"
            className="w-full text-left bg-amber-50/60 rounded-2xl p-4 flex items-start gap-3 active:scale-[0.99] transition-transform"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
              <Shield size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-slate-900">Under review</h4>{/* v415: same words as desktop */}
              <p className="text-[12px] text-slate-600 font-medium leading-relaxed mt-0.5">
                We're checking your details, usually within a day. We'll notify you when your brand is verified.
              </p>
              <span className="inline-block mt-2 text-[11px] font-bold text-[#7C3AED]">View submitted details →</span>
            </div>
          </button>
        )}

        {/* v358: status could not be read → say so, never "not verified" */}
        {!kycLoading && kycFailed && (
          <div className="bg-slate-50 rounded-2xl p-4 flex items-center gap-3" data-testid="brand-kyc-check-failed">
            <Shield size={18} className="text-slate-500 shrink-0" />
            <p className="flex-1 text-[12px] text-slate-600 font-medium">Couldn't check your verification status.</p>{/* v415 */}
            <button type="button" onClick={() => { setKycLoading(true); setKycReload((n) => n + 1); }} className="min-h-[40px] px-3 rounded-xl bg-white border border-slate-200 text-xs font-bold text-[#7C3AED]">Retry</button>
          </div>
        )}

        {/* v415: calm "Verify your brand" card (was a loud orange "FINISH KYC FOR VERIFIED BRAND STATUS" block).
            Not sent yet / needs changes / more info needed — one primary button. */}
        {!kycLoading && !kycFailed && !kycVerified && !kycInReview && (
          <div className="bg-[#F5F0FF]/50 border border-[#DDD6FE] rounded-2xl p-4 space-y-3" data-testid="brand-verify-card">
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${(kycMoreInfo || normalizedKyc === "rejected") ? "bg-amber-100 text-amber-700" : "bg-[#EDE9FE] text-[#7C3AED]"}`}>
                {(kycMoreInfo || normalizedKyc === "rejected") ? <ShieldAlert size={18} /> : <Shield size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-slate-900">
                  {kycMoreInfo ? "More info needed" : normalizedKyc === "rejected" ? "Needs changes" : "Verify your brand"}
                </h4>
                <p className="text-[12px] text-slate-600 font-medium leading-relaxed mt-0.5 break-words">
                  {(kycMoreInfo || normalizedKyc === "rejected") && kycNote
                    ? kycNote
                    : "Verify your brand once to publish campaigns, pay creators and get the Verified Brand badge. It takes about 2 minutes."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => goTo("kyc")}
              className="w-full min-h-[40px] py-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-black rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.99]"
            >
              {(kycMoreInfo || normalizedKyc === "rejected") ? "Update details" : "Verify your brand"}
            </button>
          </div>
        )}

        {/* Agency Banner (only when not yet an agency) */}
        {!brand.isAgency && (
          <div className="bg-[#F5F0FF]/60 rounded-2xl p-4 space-y-2">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#EDE9FE] text-[#7C3AED] flex items-center justify-center shrink-0 mt-0.5">
                <Package size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-black text-slate-900">Are you an agency?</h4>
                  <span className="px-1.5 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-black rounded">
                    NEW
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                  Claim an agency badge and manage multiple brand profiles from one login.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowAgencySheet(true)}
              className="min-h-[40px] text-xs font-bold text-[#7C3AED] hover:text-[#6D28D9] flex items-center gap-1 cursor-pointer" /* v415: 40px tap target */
            >
              Claim your agency badge <ChevronRight size={13} />
            </button>
          </div>
        )}

        {/* GROUP 1: COMPANY DETAILS */}
        <div className="space-y-1">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider px-1">
            Company details
          </span>
          <div className="divide-y divide-slate-100">
            <button
              type="button"
              onClick={() => goTo("company")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center shrink-0">
                  <Building size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Company details</span>{/* v415 */}
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-500" />
            </button>

            <button
              type="button"
              onClick={() => goTo("preferences")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center shrink-0">
                  <Globe size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Campaign preferences</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-500" />
            </button>

            <button
              type="button"
              onClick={() => goTo("contact")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <User size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Point of contact</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* GROUP 2: CAMPAIGNS & ESCROW */}
        <div className="space-y-1">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider px-1">
            Campaigns &amp; payments{/* v415: no "payment hold" jargon */}
          </span>
          <div className="divide-y divide-slate-100">
            <Link
              to="/brand/campaigns"
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Briefcase size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Active campaigns</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-500" />
            </Link>

            <button
              type="button"
              onClick={() => goTo("payments")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#7C3AED] flex items-center justify-center shrink-0">
                  <CreditCard size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Payments</span>{/* v358: brands pay, they don't get payouts */}
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* GROUP 3: COMPLIANCE & SECURITY */}
        <div className="space-y-1">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider px-1">
            Verification &amp; security
          </span>
          <div className="divide-y divide-slate-100">
            <button
              type="button"
              onClick={() => goTo("kyc")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <Shield size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Brand verification</span>{/* v415: same name as desktop */}
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-500" />
            </button>

            <button
              type="button"
              onClick={() => goTo("account")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
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
          </div>
        </div>

        {/* GROUP 4: ACCOUNT & SUPPORT */}
        <div className="space-y-1">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider px-1">
            Account &amp; Support
          </span>
          <div className="divide-y divide-slate-100">
            <button
              type="button"
              onClick={() => goTo("refer")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center shrink-0">
                  <Gift size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Refer &amp; earn</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-500" />
            </button>

            <button
              type="button"
              onClick={() => goTo("help")}
              className="w-full py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                  <HelpCircle size={16} />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-slate-900">Help Center</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-500" />
            </button>

          </div>
        </div>

        {/* v356: Ravi's settings design — Log out is its own white card (same confirm sheet), then the version line */}
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setShowLogoutModal(true)}
            className="w-full h-[54px] bg-white border border-[#ECE7F7] hover:bg-rose-50/40 text-[#DC2626] font-bold text-[14.5px] rounded-[20px] transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            <LogOut size={17} /> Log out
          </button>
          <VersionLine />
        </div>

        {/* Session 48 (testing team: "Refer is there twice, and why is it under Log out?"): the purple
            Refer & earn card under Log out is gone — "Refer & earn" stays once, in the list above. */}

        {/* ST-06: Log Out Sheet */}
        <Presence>{showLogoutModal && (
          <ModalPortal>
            <PopupBackdrop
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end justify-center"
              onClick={() => !loggingOut && setShowLogoutModal(false)}
            >
              <PopupPanel kind="sheet" onClose={() => !loggingOut && setShowLogoutModal(false)}
                role="dialog" aria-modal="true" aria-labelledby="brand-logout-title" /* v415 */
                className="w-full max-w-md bg-white rounded-t-[26px] p-5 pb-8 space-y-4 shadow-xl"
                style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto" />
                <div>
                  <h3 id="brand-logout-title" className="text-lg font-bold text-slate-900 font-display">Log out of Ybex?</h3>
                  <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                    You'll need your phone number and an OTP to sign back in.
                  </p>
                </div>
                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    autoFocus /* v415: focus goes into the sheet, on the safe choice */
                    disabled={loggingOut}
                    onClick={() => setShowLogoutModal(false)}
                    className="disabled:opacity-60 flex-1 py-3.5 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-2xl transition-colors flex items-center justify-center cursor-pointer active:scale-[0.99]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="disabled:opacity-60 flex-1 py-3.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-sm rounded-2xl transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                  >
                    <LogOut size={16} /> {loggingOut ? "Logging out…" : "Log out"}
                  </button>
                </div>
              </PopupPanel>
            </PopupBackdrop>
          </ModalPortal>
        )}</Presence>

        {/* PR-01: Agency Claim Sheet */}
        <Presence>{showAgencySheet && (
          <ModalPortal>
            <PopupBackdrop
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end justify-center"
              onClick={() => !savingAgency && setShowAgencySheet(false)}
            >
              <PopupPanel kind="sheet" onClose={() => !savingAgency && setShowAgencySheet(false)}
                role="dialog" aria-modal="true" aria-labelledby="brand-agency-title" /* v415 */
                className="relative w-full max-w-md bg-white rounded-t-[26px] p-5 pb-8 space-y-4 shadow-xl max-h-[85vh] max-h-[85dvh] overflow-y-auto" /* v332: dvh for iOS */
                style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto" />
                {/* v415: a real close button (40px, labelled) */}
                <button
                  type="button"
                  aria-label="Close"
                  disabled={savingAgency}
                  onClick={() => setShowAgencySheet(false)}
                  className="absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-60 cursor-pointer"
                >
                  <X size={18} />
                </button>
                <div className="pr-10">
                  <div className="flex items-center gap-2">
                    <h3 id="brand-agency-title" className="text-lg font-bold text-slate-900 font-display">Claim agency badge</h3>
                    <span className="px-1.5 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-black rounded">
                      AGENCY
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                    Select your agency model. An Agency badge will appear on your profile and campaign briefs.
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  {AGENCY_TYPES.map((type) => {
                    const isSelected = selectedAgencyType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        autoFocus={isSelected} /* v415: focus into the sheet */
                        aria-pressed={isSelected}
                        onClick={() => setSelectedAgencyType(type)}
                        className={`w-full p-3.5 rounded-2xl text-left border text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[#F5F0FF]/70 border-[#7C3AED] text-[#7C3AED]"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span>{type}</span>
                        {isSelected && <Check size={16} className="text-[#7C3AED]" />}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={savingAgency}
                    onClick={() => setShowAgencySheet(false)}
                    className="flex-1 py-3.5 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-2xl transition-colors flex items-center justify-center cursor-pointer active:scale-[0.99] disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingAgency}
                    onClick={async () => {
                      try {
                        setSavingAgency(true);
                        // v332: save() answers false on failure (it already shows the error) — the sheet used to close
                        // with "Agency badge claimed!" even then, plus a second "Changes saved." toast.
                        const ok = await save({ is_agency: true, agency_type: selectedAgencyType }, { silent: true });
                        if (ok) {
                          setShowAgencySheet(false);
                          toast.success("Agency badge claimed!");
                        }
                      } catch (err) {
                        toast.error("Couldn't update your agency status. Please try again.");
                      } finally {
                        setSavingAgency(false);
                      }
                    }}
                    className="flex-1 py-3.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-sm rounded-2xl transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] disabled:opacity-60"
                  >
                    {savingAgency ? "Saving…" : "Claim badge"}
                  </button>
                </div>
              </PopupPanel>
            </PopupBackdrop>
          </ModalPortal>
        )}</Presence>
      </div>

      {/* v356: founder note footer — full width, sits on the bottom nav */}
      <FounderNoteMobile className="-mb-5 bg-white" />
    </div>
  );
}
