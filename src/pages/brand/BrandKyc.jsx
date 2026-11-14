import React, { useState, useEffect, useRef } from "react";
import { prepareUpload, uploadErrorText } from "../../lib/prepareUpload"; // v408
import { safeUpper } from "../../utils/safeFormat";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import KYCStatusBanner from "../../components/kyc/KYCStatusBanner";
import { ShieldCheck, Building, User, UploadCloud, Edit3, Loader2, ArrowLeft, CheckCircle2, Trash2, ExternalLink, Lock, FileText, AlertTriangle, Clock } from "lucide-react";
import { ignored } from "../../utils/ignored";
import useIsMobile from "../../hooks/useIsMobile";
import BrandKycMobile from "./BrandKycMobile";
import { mediaHref } from "../../lib/mediaUrl";
import { saveBrandKycDraft, loadBrandKycDraft, clearBrandKycDraft, shouldRestoreBrandKycDraft } from "../../lib/brandKycDraft"; // v347

function BrandKycDesktop() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [kycStatus, setKycStatus] = useState(null);
  const kycStatusRef = useRef(null); // v416 (CR17): read by the review poll
  kycStatusRef.current = kycStatus;
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(searchParams.get("edit") === "true");
  const [draftRestored, setDraftRestored] = useState(false); // v347
  const [loadFailed, setLoadFailed] = useState(false); // v358: a failed status read looked like "never submitted"
  const [confirmEdit, setConfirmEdit] = useState(false); // v358: approved brands are warned before re-verification
  const loadedOnce = useRef(null); // v358: background user refreshes no longer reload + overwrite typed fields

  useEffect(() => {
    if (searchParams.get("edit") === "true") {
      setIsEditing(true);
    }
  }, [searchParams]);

  // Business Type: "registered" or "solo"
  const [businessType, setBusinessType] = useState("registered");

  // Form Fields
  const [companyName, setCompanyName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  
  // Tax / ID
  const [gstCert, setGstCert] = useState("");
  const [brandPan, setBrandPan] = useState("");
  const [businessProofUrl, setBusinessProofUrl] = useState("");

  // Contact Person
  const [pocName, setPocName] = useState("");
  const [pocEmail, setPocEmail] = useState("");
  const [pocPhone, setPocPhone] = useState("");
  const [pocDesignation, setPocDesignation] = useState("");

  // Upload state
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const docFileInputRef = useRef(null);

  // v347: autosave the text fields while the form can be edited (not the uploaded document).
  useEffect(() => {
    if (loading) return;
    const st = String(kycStatus?.status || "").toUpperCase();
    if (kycStatus && st !== "REJECTED") return; // pending / approved: the server copy is the truth
    saveBrandKycDraft({ businessType, companyName, siteUrl, gst: gstCert, pan: brandPan, pocName, pocEmail, pocPhone, pocDesignation });
  }, [loading, kycStatus, businessType, companyName, siteUrl, gstCert, brandPan, pocName, pocEmail, pocPhone, pocDesignation]);

  // v347: put this account's saved draft (text fields only) back into the form.
  const restoreDraft = (record) => {
    const draft = loadBrandKycDraft();
    if (!shouldRestoreBrandKycDraft(record, draft)) return false;
    const d = draft.fields;
    if (d.businessType) setBusinessType(d.businessType);
    if (d.companyName) setCompanyName(d.companyName);
    if (d.siteUrl) setSiteUrl(d.siteUrl);
    if (d.gst) setGstCert(d.gst);
    if (d.pan) setBrandPan(d.pan);
    if (d.pocName) setPocName(d.pocName);
    if (d.pocEmail) setPocEmail(d.pocEmail);
    if (d.pocPhone) setPocPhone(d.pocPhone);
    if (d.pocDesignation) setPocDesignation(d.pocDesignation);
    setDraftRestored(true);
    return true;
  };

  const loadKyc = async () => {
    try {
      setLoading(true);
      const { data, failed } = await api.get("verifications/me").catch(() => ({ data: null, failed: true }));
      setLoadFailed(Boolean(failed)); // v358
      if (data && data.status !== "NOT_SUBMITTED") {
        setKycStatus(data);
        const docs = data.documents || {};
        setCompanyName(docs.company_name || user?.name || "");
        setGstCert(docs.gstin || docs.gst_cert || "");
        setBrandPan(docs.brand_pan || "");
        setPocName(docs.poc_name || user?.representative_name || ""); // v423: a brand's user.name is the BRAND name, not the contact person
        setPocDesignation(docs.poc_designation || ""); // v332: no invented "Brand Manager" (the form has no field to see/fix it)
        setPocEmail(docs.poc_email || user?.email || "");
        setPocPhone(docs.poc_phone || user?.phone || "");
        setSiteUrl(docs.website || docs.website_url || "");
        setBusinessProofUrl(docs.business_proof_document_url || docs.gst_cert_url || docs.pan_card_url || "");
        
        if (!docs.gstin && !docs.gst_cert && docs.brand_pan) {
          setBusinessType("solo");
        }
        restoreDraft(data); // v347: only a REJECTED KYC being fixed (newer draft); pending/approved stay server
      } else {
        setCompanyName(user?.name || "");
        setPocName(user?.representative_name || ""); // v423: was the brand name
        setPocEmail(user?.email || "");
        setPocPhone(user?.phone || "");
        setPocDesignation(""); // v332: was an invented "Founder / Marketing Lead" sent with the KYC (no field on the form)
        restoreDraft(null); // v347: refresh no longer empties the form
      }
    } catch (e) {
      console.warn("KYC Status empty", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // v358: load once per account — this effect re-ran on every background user refresh, flashing the loader and
    // overwriting what the brand was typing.
    const key = user?.user_id || "anon";
    if (loadedOnce.current !== key) {
      loadedOnce.current = key;
      loadKyc();
    }

    // v416 (CR17): poll only while a submitted KYC waits for review, every 15 s, only while the tab is visible, and
    // stop once it's decided. The user refresh runs outside the state updater (it ran inside it before).
    const interval = setInterval(async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const cur = String(kycStatusRef.current?.status || "").toUpperCase();
      if (!["PENDING", "UNDER_REVIEW", "SUBMITTED", "IN_REVIEW"].includes(cur)) return;
      try {
        const { data } = await api.get("verifications/me", { bypassCache: true }).catch(() => ({ data: null }));
        if (data && data.status !== "NOT_SUBMITTED" && kycStatusRef.current?.status !== data.status) {
          setKycStatus(data);
          if (String(data.status).toUpperCase() === "APPROVED" && refreshUser) refreshUser();
        }
      } catch (e) { ignored("BrandKyc:101", e); }
    }, 15000);

    return () => clearInterval(interval);
  }, [user]);

  const handleFileUpload = async (fileIn) => {
    if (!fileIn) return;
    const file = await prepareUpload(fileIn); // v408
    if (file.size > 10 * 1024 * 1024) {
      toast.error("That file is over 10MB. Please pick a smaller one."); // v332: plain copy
      return;
    }
    const allowedTypes = ["image/jpeg", "image/png", "application/pdf", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Please upload an image (JPG, PNG, WEBP) or PDF file.");
      return;
    }

    const fd = new FormData();
    fd.append("file", file) /* v408: HEIC / big photo → JPEG (already prepared above) · v415: not prepared twice */;

    try {
      setUploadingDoc(true);
      const res = await api.post("upload?bucket=kyc-documents", fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      if (res.data && res.data.url) {
        setBusinessProofUrl(res.data.url);
        toast.success("Document attached");
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Couldn't upload the document. Please try again."); // v332: no raw tech text
      console.error(err);
    } finally {
      setUploadingDoc(false);
    }
  };

  const isPanValid = (pan) => /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test((pan || "").trim().toUpperCase());

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();

    if (!companyName.trim()) {
      toast.error("Please enter your Brand or Company Name.");
      return;
    }

    const cleanGst = (gstCert || "").trim().toUpperCase();
    const cleanPan = (brandPan || "").trim().toUpperCase();

    if (businessType === "registered") {
      if (!cleanGst && !cleanPan) {
        toast.error("Please provide either your GSTIN or Business PAN.");
        return;
      }
      if (cleanGst && cleanGst.length !== 15) {
        toast.error("GSTIN must be 15 characters (e.g. 07AAAAA0000A1Z5).");
        return;
      }
      if (cleanPan && !isPanValid(cleanPan)) {
        toast.error("PAN must be 10 characters, like ABCDE1234F.");
        return;
      }
    } else {
      if (!cleanPan) { // v358: solo brands must give the owner PAN (no tax ID at all went through)
        toast.error("Please add the owner's PAN.");
        return;
      }
      if (cleanPan && !isPanValid(cleanPan)) {
        toast.error("PAN must be 10 characters, like ABCDE1234F.");
        return;
      }
    }

    if (!pocName.trim()) {
      toast.error("Contact person name is required.");
      return;
    }

    if (!pocEmail.trim()) {
      toast.error("Work email address is required.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(pocEmail.trim())) { // v415: same check as the phone form
      toast.error("Please enter a valid work email.");
      return;
    }
    if (uploadingDoc) { // v415: don't submit while the document is still uploading (it would be left out)
      toast.error("Please wait for the document to finish uploading.");
      return;
    }

    try {
      setSubmitting(true);
      await api.post("brand/kyc/submit", {
        companyName: companyName.trim(),
        gstNumber: cleanGst,
        panNumber: cleanPan,
        incorporationType: businessType === "registered" ? "registered_business" : "solo_brand",
        businessProofDocumentUrl: businessProofUrl || "",
        personName: pocName.trim(),
        designation: pocDesignation.trim() || "Brand Representative",
        workEmail: pocEmail.trim(),
        phone: pocPhone.trim(),
        websiteUrl: siteUrl.trim()
      });

      toast.success("Verification submitted. We'll notify you when it's reviewed.");
      clearBrandKycDraft(); // v347
      setDraftRestored(false);
      setIsEditing(false);
      if (refreshUser) await refreshUser();
      await loadKyc();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Couldn't submit your verification. Please try again."); // v332: no raw tech text
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      // v415: same frame as the page (title + cards) instead of a full-screen spinner with mono caps text
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 animate-pulse" aria-busy="true" data-testid="brand-kyc-skeleton">
        <div className="h-3 w-28 bg-slate-200/70 rounded mb-4" />
        <div className="h-8 w-64 bg-slate-200/70 rounded-lg mb-2" />
        <div className="h-4 w-96 max-w-full bg-slate-200/50 rounded mb-8" />
        <div className="h-16 rounded-xl bg-slate-200/50 mb-6" />
        <div className="h-40 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-default)] mb-6" />
        <div className="h-56 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-default)]" />
      </div>
    );
  }

  const isApproved = kycStatus?.status === "approved" || kycStatus?.status === "APPROVED";
  // v332: "submitted" / lower-case "under_review" showed the empty form again instead of "Submitted for review".
  const isPending = ["PENDING", "UNDER_REVIEW", "SUBMITTED"].includes(String(kycStatus?.status || "").toUpperCase());
  const showForm = (!isApproved && !isPending) || isEditing;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 text-left min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-3 group cursor-pointer"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
          Back to Dashboard
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
                Brand Verification
              </h1>
              <span className="px-2 py-0.5 text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-full flex items-center gap-1">
                <ShieldCheck size={12} /> {isApproved ? "Verified Brand" : "Get the Verified Brand badge"}{/* v332: unverified brands saw "Verified Brand Badge" next to the title */}
              </span>
            </div>
            <p className="text-[var(--text-secondary)] text-xs sm:text-sm mt-1">
              Verify your brand once to publish campaigns and pay creators through Ybex escrow.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] bg-[var(--bg-card)] border border-[var(--border-default)] px-3 py-1.5 rounded-full">
            <Lock size={12} className="text-emerald-500" />
            <span>Reviewed by Ybex · usually within a day</span>{/* v358: it's a manual review */}
          </div>
        </div>
      </div>

      {loadFailed && !kycStatus && ( /* v358: don't show the empty form as if nothing was submitted */
        <div className="mb-4 flex items-center gap-3 p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs" data-testid="brand-kyc-load-error">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="flex-1">Couldn't check your verification status. If you already submitted, nothing is lost.</span>
          <button type="button" onClick={() => loadKyc()} className="px-3 py-1.5 rounded-lg bg-white border border-rose-200 font-semibold cursor-pointer">Retry</button>
        </div>
      )}
      {confirmEdit && (
        <div className="mb-4 p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-sm flex flex-wrap items-center gap-3" data-testid="brand-kyc-edit-confirm">
          <span className="flex-1 min-w-[240px]">Changing details sends your verification for review again. You can't publish campaigns until it's approved.</span>
          <button type="button" onClick={() => setConfirmEdit(false)} className="px-3.5 py-1.5 rounded-lg bg-white border border-amber-300 text-xs font-semibold cursor-pointer">Keep as is</button>
          <button type="button" onClick={() => { setConfirmEdit(false); setIsEditing(true); }} className="px-3.5 py-1.5 rounded-lg bg-[var(--violet)] text-white text-xs font-semibold cursor-pointer">Edit details</button>
        </div>
      )}
      <KYCStatusBanner 
        status={kycStatus?.status} 
        rejectReason={kycStatus?.rejection_reason || kycStatus?.admin_note} 
      />

      {isApproved && !isEditing ? (
        // APPROVED STATE - Clean Summary Card
        <div className="bg-[var(--bg-card)] border border-emerald-500/20 p-6 sm:p-8 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="flex flex-wrap justify-between items-center pb-4 mb-6 border-b border-[var(--border-default)] gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <span className="text-[11px] tracking-wider text-emerald-600 font-bold uppercase block">Status</span>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Verified brand</h2>
              </div>
            </div>
            <button
              onClick={() => setConfirmEdit(true) /* v358: warn first — editing sends the KYC back to review */}
              className="flex items-center gap-2 px-3.5 py-1.5 border border-[var(--border-default)] hover:border-[var(--violet)] text-xs font-semibold rounded-xl text-[var(--text-primary)] bg-[var(--bg-elevated)] transition-all cursor-pointer"
            >
              <Edit3 size={14} className="text-[var(--violet)]" /> Edit Brand Details
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3 bg-[var(--bg-elevated)]/40 p-4 rounded-xl border border-[var(--border-default)]">
              <h3 className="text-xs font-bold text-[var(--violet)] uppercase tracking-wider flex items-center gap-1.5">
                <Building size={14} /> Brand Details
              </h3>
              <div className="space-y-2 pt-1">
                <div>
                  <span className="text-[11px] text-[var(--text-secondary)] block">Brand Name</span>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{companyName || user?.name}</span>
                </div>
                {siteUrl && (
                  <div>
                    <span className="text-[11px] text-[var(--text-secondary)] block">Website / Social</span>
                    <a href={siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--violet)] hover:underline block truncate">
                      {siteUrl}
                    </a>
                  </div>
                )}
                {gstCert && (
                  <div>
                    <span className="text-[11px] text-[var(--text-secondary)] block">GSTIN</span>
                    <span className="text-xs font-mono font-bold text-[var(--text-primary)]">{gstCert}</span>
                  </div>
                )}
                {brandPan && (
                  <div>
                    <span className="text-[11px] text-[var(--text-secondary)] block">Business PAN</span>
                    <span className="text-xs font-mono font-bold text-[var(--text-primary)] uppercase">{brandPan}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 bg-[var(--bg-elevated)]/40 p-4 rounded-xl border border-[var(--border-default)]">
              <h3 className="text-xs font-bold text-[var(--violet)] uppercase tracking-wider flex items-center gap-1.5">
                <User size={14} /> Contact Person
              </h3>
              <div className="space-y-2 pt-1">
                <div>
                  <span className="text-[11px] text-[var(--text-secondary)] block">Contact Name</span>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{pocName || user?.name}</span>
                </div>
                <div>
                  <span className="text-[11px] text-[var(--text-secondary)] block">Work Email</span>
                  <span className="text-xs text-[var(--text-primary)]">{pocEmail || user?.email}</span>
                </div>
                {pocPhone && (
                  <div>
                    <span className="text-[11px] text-[var(--text-secondary)] block">Phone</span>
                    <span className="text-xs text-[var(--text-primary)]">{pocPhone}</span>
                  </div>
                )}
                {businessProofUrl && (
                  <a href={mediaHref(businessProofUrl) /* v332: private file → media link */} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-[var(--violet)] hover:underline pt-1">
                    <ExternalLink size={12} /> View Uploaded Business Proof
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : isPending && !isEditing ? (
        // PENDING STATE - Fast Review View
        <div className="bg-[var(--bg-card)] border border-amber-500/20 p-6 sm:p-8 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="flex flex-wrap justify-between items-center pb-4 mb-6 border-b border-[var(--border-default)] gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20">
                <Clock size={20} />{/* v415: a calm clock — the endless spinner looked stuck */}
              </div>
              <div>
                <span className="text-[11px] tracking-wider text-amber-600 font-bold uppercase block">Status</span>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Under review</h2>
              </div>
            </div>
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-3.5 py-1.5 border border-[var(--border-default)] hover:border-[var(--violet)] text-xs font-semibold rounded-xl text-[var(--text-primary)] bg-[var(--bg-elevated)] transition-all cursor-pointer"
            >
              <Edit3 size={14} className="text-[var(--violet)]" /> Edit Details
            </button>
          </div>

          <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4 mb-6 text-xs text-[var(--text-secondary)] flex items-start gap-3">
            
            <div>
              <p className="font-semibold text-[var(--text-primary)] mb-0.5">Reviews usually finish within a day.</p>
              <p>You can draft campaigns and browse creators while the Ybex team checks your details.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-[var(--bg-elevated)]/30 border border-[var(--border-default)]">
              <span className="text-[11px] text-[var(--text-secondary)] block">Brand / Company</span>
              <span className="text-sm font-bold text-[var(--text-primary)]">{companyName || user?.name}</span>
              <span className="text-xs font-mono text-[var(--text-secondary)] block mt-0.5">{gstCert ? `GSTIN: ${gstCert}` : brandPan ? `PAN: ${brandPan}` : "Solo Brand"}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-[var(--bg-elevated)]/30 border border-[var(--border-default)]">
              <span className="text-[11px] text-[var(--text-secondary)] block">Authorized Contact</span>
              <span className="text-sm font-semibold text-[var(--text-primary)]">{pocName || user?.name}</span>
              <span className="text-xs text-[var(--text-secondary)] block mt-0.5">{pocEmail || user?.email}</span>
            </div>
          </div>
        </div>
      ) : (
        // SIMPLE 1-PAGE BRAND KYC FORM
        <form onSubmit={handleSubmit} className="space-y-6">
          {isApproved && isEditing && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 sm:p-5 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-[var(--text-primary)]">You're changing verified details</h4>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                  Submitting new details sends your brand back to <strong className="text-amber-600">Under review</strong> until the Ybex team checks them again.
                </p>
              </div>
            </div>
          )}

          {draftRestored && (
            <p className="text-xs text-[var(--text-secondary)]" data-testid="kyc-draft-restored">Draft restored — we kept what you typed.</p>
          )}

          {/* Card 1: Business Profile (Auto-filled) */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] p-5 sm:p-6 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-[var(--violet)]/10 text-[var(--violet)] flex items-center justify-center font-bold text-xs">
                1
              </div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Business Profile</h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-5 ml-9">
              Your public brand details that creators see when you post campaigns.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Brand Name */}
              <div>
                <label htmlFor="kyc-company" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Brand / Company Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="kyc-company" /* v415: label linked */
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Acme Studio or My Brand"
                    className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] focus:border-[var(--violet)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-tertiary)]"
                  />
                </div>
              </div>

              {/* Website / Instagram Link */}
              <div>
                <label htmlFor="kyc-site" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Website or Instagram Link
                </label>
                <input
                    id="kyc-site" /* v415: label linked */
                  type="text"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  placeholder="e.g. www.yourbrand.com or instagram.com/brand"
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] focus:border-[var(--violet)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-tertiary)]"
                />
              </div>
            </div>
          </div>

          {/* Card 2: Tax / Business ID */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] p-5 sm:p-6 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-[var(--violet)]/10 text-[var(--violet)] flex items-center justify-center font-bold text-xs">
                2
              </div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Tax & Business ID</h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-5 ml-9">
              Your GSTIN or business PAN — used for invoices and tax receipts.
            </p>

            {/* Business type selector */}
            <div className="flex flex-col sm:flex-row gap-2 bg-[var(--bg-elevated)] p-1 rounded-xl mb-5 border border-[var(--border-default)]">
              <button
                type="button"
                onClick={() => setBusinessType("registered")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                  businessType === "registered"
                    ? "bg-[var(--violet)] text-white shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Building size={14} className="shrink-0" />
                <span className="whitespace-normal leading-tight">GST Registered Business</span>
              </button>
              <button
                type="button"
                onClick={() => setBusinessType("solo")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                  businessType === "solo"
                    ? "bg-[var(--violet)] text-white shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <User size={14} className="shrink-0" />
                <span className="whitespace-normal leading-tight">Solo / Unregistered Brand</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {businessType === "registered" && (
                <div>
                  <label htmlFor="kyc-gstin" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center justify-between">
                    <span>GSTIN Number</span>
                    {gstCert && (
                      <span className={`text-[10px] font-mono font-bold ${gstCert.length === 15 ? "text-emerald-500" : "text-amber-500"}`}>
                        {gstCert.length === 15 ? "✓ 15-digit GSTIN" : "15 digits required"}
                      </span>
                    )}
                  </label>
                  <input
                    id="kyc-gstin" /* v415: label linked */
                    type="text"
                    maxLength={15}
                    value={gstCert}
                    onChange={(e) => setGstCert(safeUpper(e.target.value).trim())}
                    placeholder="e.g. 07AAAAA0000A1Z5"
                    className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] focus:border-[var(--violet)] rounded-xl px-3.5 py-2.5 text-sm font-mono uppercase text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-tertiary)]"
                  />
                  <p className="text-[11px] text-[var(--text-tertiary)] mt-1">15-digit Goods & Services Tax Number</p>
                </div>
              )}

              <div>
                <label htmlFor="kyc-pan" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center justify-between">
                  <span>{businessType === "registered" ? "Company / Director PAN" : "Owner PAN"}</span>{/* v358: required for solo brands */}
                  {brandPan && (
                    <span className={`text-[10px] font-mono font-bold ${isPanValid(brandPan) ? "text-emerald-500" : "text-amber-500"}`}>
                      {isPanValid(brandPan) ? "✓ Valid Format" : "10-character format"}
                    </span>
                  )}
                </label>
                <input
                    id="kyc-pan" /* v415: label linked */
                  type="text"
                  maxLength={10}
                  value={brandPan}
                  onChange={(e) => setBrandPan(safeUpper(e.target.value).trim())}
                  placeholder="e.g. ABCDE1234F"
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] focus:border-[var(--violet)] rounded-xl px-3.5 py-2.5 text-sm font-mono uppercase text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-tertiary)]"
                />
                <p className="text-[11px] text-[var(--text-tertiary)] mt-1">Standard 10-character Permanent Account Number</p>
              </div>
            </div>

            {/* Optional Document Upload */}
            <div className="mt-5 pt-4 border-t border-[var(--border-default)]">
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-2 flex items-center justify-between">
                <span>Upload Business Document (Optional)</span>
                <span className="text-[11px] text-[var(--text-tertiary)]">GST Certificate, PAN, or Registration</span>
              </label>

              <input
                type="file"
                ref={docFileInputRef}
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => {
                  // v332: clear the picker so the same file can be chosen again after a failed upload
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) handleFileUpload(file);
                }}
              />

              {businessProofUrl ? (
                <div className="flex items-center justify-between p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                      <FileText size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-[var(--text-primary)]">Document Uploaded</span>
                        <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                      </div>
                      <a href={mediaHref(businessProofUrl) /* v332: private file → media link */} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[var(--violet)] hover:underline block truncate">
                        Click to view uploaded document
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => docFileInputRef.current?.click()}
                      className="text-xs px-2.5 py-1 bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-[var(--violet)] rounded-lg text-[var(--text-secondary)] transition-colors cursor-pointer"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={() => setBusinessProofUrl("")}
                      aria-label="Remove document" // v332: icon-only button had no label
                      className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  aria-disabled={uploadingDoc}
                  // v332: no second file picker while one upload is still running; keyboard reachable
                  onClick={() => { if (!uploadingDoc) docFileInputRef.current?.click(); }}
                  onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !uploadingDoc) { e.preventDefault(); docFileInputRef.current?.click(); } }}
                  className="border border-dashed border-[var(--border-default)] hover:border-[var(--violet)] bg-[var(--bg-elevated)]/20 hover:bg-[var(--bg-elevated)]/40 rounded-xl p-3.5 text-center cursor-pointer transition-all flex items-center justify-center gap-2"
                >
                  {uploadingDoc ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-[var(--violet)] animate-spin" />
                      <span className="text-xs text-[var(--text-secondary)]">Uploading document...</span>
                    </div>
                  ) : (
                    <>
                      <UploadCloud size={16} className="text-[var(--violet)]" />
                      <span className="text-xs text-[var(--text-secondary)]">Click to attach GST/PAN certificate (Optional)</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Contact Person (Auto-filled from auth) */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] p-5 sm:p-6 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-[var(--violet)]/10 text-[var(--violet)] flex items-center justify-center font-bold text-xs">
                3
              </div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Contact Representative</h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-5 ml-9">
              Authorized person managing brand campaigns and creator negotiations.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Contact Name */}
              <div>
                <label htmlFor="kyc-name" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                    id="kyc-name" /* v415: label linked */
                  type="text"
                  required
                  value={pocName}
                  onChange={(e) => setPocName(e.target.value)}
                  placeholder="Your Name"
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] focus:border-[var(--violet)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-tertiary)]"
                />
              </div>

              {/* Work Email */}
              <div>
                <label htmlFor="kyc-email" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Work Email <span className="text-red-500">*</span>
                </label>
                <input
                    id="kyc-email" /* v415: label linked */
                  type="email"
                  required
                  value={pocEmail}
                  onChange={(e) => setPocEmail(e.target.value)}
                  placeholder="name@brand.com"
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] focus:border-[var(--violet)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-tertiary)]"
                />
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="kyc-phone" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Phone Number
                </label>
                <input
                    id="kyc-phone" /* v415: label linked */
                  type="tel"
                  value={pocPhone}
                  onChange={(e) => setPocPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] focus:border-[var(--violet)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-tertiary)]"
                />
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            {isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-5 py-2.5 rounded-xl border border-[var(--border-default)] hover:bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-secondary)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
            )}

            <button
              type="submit"
              disabled={submitting || uploadingDoc} /* v415: wait for the document upload */
              className="ml-auto w-full sm:w-auto px-8 py-3 bg-[var(--violet)] hover:opacity-95 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Submitting…</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  <span>Submit Brand Verification</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// Session 30: phones get the mobile verification flow (same endpoints and payload).
export default function BrandKyc() {
  const isMobile = useIsMobile();
  return isMobile ? <BrandKycMobile /> : <BrandKycDesktop />;
}
