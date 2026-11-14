import React, { useCallback, useEffect, useRef, useState } from "react";
import { prepareUpload, uploadErrorText } from "../../lib/prepareUpload"; // v408
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, ShieldCheck, Zap, Building2, User, UploadCloud, Lock, Check, Clock, AlertTriangle, FileText, X } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../lib/api";
import { useLiveRefresh } from "../../lib/liveRefresh";
import ButtonSpinner from "../../components/common/ButtonSpinner";
import ModalPortal from "../../components/common/ModalPortal";
import useScrollLock from "../../lib/useScrollLock";
import { draftGet } from "../../lib/userDraft";
import { saveBrandKycDraft, loadBrandKycDraft, clearBrandKycDraft, shouldRestoreBrandKycDraft, applyBrandKycDraft } from "../../lib/brandKycDraft"; // v347
import { mediaHref } from "../../lib/mediaUrl";

// Session 30: mobile brand verification from Ravi's "Complete Brand Mobile UI" design
// (ST-02 status, KY-01 / KY-01b business & tax, KY-03 contact, KY-02 submitted).
// Same server contract as the desktop page (BrandKyc.jsx): GET verifications/me,
// POST upload?bucket=kyc-documents, POST brand/kyc/submit — same payload, same checks.
// No sample data: every field starts from the server record or the logged-in account.

const C = { bg: "#F4F4F8", violet: "#7C3AED", text: "#0A0A0A", sub: "#6B7280", line: "#E6E6EE", field: "#E0E0E8" };
const font = { fontFamily: "'DM Sans', sans-serif" };
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

const statusOf = (k) => String(k?.status || "").toUpperCase();
const isApproved = (k) => statusOf(k) === "APPROVED";
const isPending = (k) => ["PENDING", "UNDER_REVIEW", "SUBMITTED"].includes(statusOf(k));
const isRejected = (k) => statusOf(k) === "REJECTED";

function Header({ title, subtitle, onBack, progress, action = null }) {
  return (
    <div className="shrink-0 bg-white" style={{ paddingTop: "var(--yb-sat, 0px)" /* Session 43: full-screen layer, below the clock strip */ }}>
      <div className="h-[54px] px-3 flex items-center gap-2.5">
        <button type="button" onClick={onBack} aria-label="Back" className="w-10 h-10 rounded-[13px] bg-[#F4F4F8] flex items-center justify-center active:scale-95 transition">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-bold tracking-[-0.4px] truncate">{title}</div>
          {subtitle && <div className="text-[11.5px] font-medium text-[#6B7280] mt-px truncate">{subtitle}</div>}
        </div>
        {action || (
          <div className="h-7 px-2.5 rounded-[9px] bg-[#ECFDF5] flex items-center gap-1 text-[11px] font-semibold text-[#047857] shrink-0">
            <Clock size={12} /> Reviewed by Ybex{/* v358: it's a manual review (was "Auto review") */}
          </div>
        )}
      </div>
      {progress != null && (
        <div className="px-4 pb-3 flex gap-1.5 border-b border-[#E5E5EA]">
          {[1, 2].map((n) => (
            <div key={n} className="flex-1 h-1 rounded-full" style={{ background: n <= progress ? C.violet : C.line }} />
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ children, className = "" }) {
  return <div className={`bg-white border border-[#E6E6EE] rounded-[20px] p-3.5 flex flex-col gap-3 ${className}`}>{children}</div>;
}

function StepTitle({ n, title, hint }) {
  return (
    <div className="flex gap-2.5 items-start">
      <div className="w-[26px] h-[26px] rounded-lg bg-[#F3EDFF] flex items-center justify-center text-xs font-bold text-[#7C3AED] shrink-0">{n}</div>
      <div className="min-w-0">
        <div className="text-[15px] font-bold">{title}</div>
        {hint && <div className="mt-0.5 text-xs leading-snug text-[#6B7280]">{hint}</div>}
      </div>
    </div>
  );
}

function Field({ label, required, optional, help, error, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold text-[#374151]">
        {label}
        {required && <span className="text-[#DC2626]"> *</span>}
        {optional && <span className="font-normal text-[#6B7280]"> · optional</span>}
      </span>
      {children}
      {error ? <span className="text-[11.5px] text-[#B91C1C]">{error}</span> : help ? <span className="text-[11.5px] text-[#6B7280]">{help}</span> : null}
    </label>
  );
}

// v330: 16px text — at 15px iPhone zoomed the page every time a field got focus.
function Input({ invalid, ...props }) {
  return (
    <input
      {...props}
      className="h-[50px] rounded-[14px] bg-white px-3.5 text-[16px] font-medium text-[#0A0A0A] placeholder:text-[#9CA3AF] placeholder:font-normal outline-none transition w-full min-w-0 box-border"
      style={{ border: `1px solid ${invalid ? "#DC2626" : C.field}` }}
      onFocus={(e) => { e.target.style.borderColor = invalid ? "#DC2626" : C.violet; props.onFocus?.(e); }}
      onBlur={(e) => { e.target.style.borderColor = invalid ? "#DC2626" : C.field; props.onBlur?.(e); }}
    />
  );
}

function Footer({ children, note }) {
  return (
    <div className="shrink-0 bg-white border-t border-[#E5E5EA] px-4 pt-3 flex flex-col gap-2" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}>
      {children}
      {note && <div className="text-center text-xs text-[#6B7280]">{note}</div>}
    </div>
  );
}

function PrimaryBtn({ children, busy, ...props }) {
  return (
    <button
      type="button"
      {...props}
      disabled={busy || props.disabled}
      className="h-[50px] rounded-2xl bg-[#7C3AED] text-white flex items-center justify-center gap-2 text-[15px] font-semibold active:scale-[0.99] transition disabled:opacity-60"
    >
      {busy && <ButtonSpinner />} {children}
    </button>
  );
}

function SecondaryBtn({ children, ...props }) {
  return (
    <button type="button" {...props} className="h-[50px] rounded-2xl bg-white text-[#0A0A0A] border border-[#E0E0E8] flex items-center justify-center gap-2 text-[15px] font-semibold active:scale-[0.99] transition">
      {children}
    </button>
  );
}

export default function BrandKycMobile() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [kyc, setKyc] = useState(null);
  // Session 33: "Continue campaign draft" only when a campaign draft is saved (create screen, this account).
  const [hasCampaignDraft] = useState(() => { try { return draftGet("campaign_draft") ? "/brand/campaigns/create" : ""; } catch { return ""; } });
  // "status" (ST-02) → "business" (KY-01/01b) → "contact" (KY-03) → "done" (KY-02)
  // v344: "Edit & resubmit" links here with ?edit=true — open straight on the business step
  const [step, setStep] = useState(() => (searchParams.get("edit") === "true" ? "business" : "status"));
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [touched, setTouched] = useState(false);
  const [confirmResubmit, setConfirmResubmit] = useState(false); // v358: approved brands are warned before re-verification
  const [loadFailed, setLoadFailed] = useState(false); // v330: a failed status load read as "KYC not submitted"
  const [draftRestored, setDraftRestored] = useState(false); // v347: typed fields came back from this account's draft
  const fileRef = useRef(null);
  // Full-screen flow above the app (rule 62): portal + page scroll lock.
  useScrollLock(true);

  const [f, setF] = useState({
    businessType: "registered", companyName: "", siteUrl: "", gst: "", pan: "", proofUrl: "",
    pocName: "", pocEmail: "", pocPhone: "", pocDesignation: "",
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e?.target ? e.target.value : e }));

  const load = useCallback(async ({ prefill = false } = {}) => {
    let failed = false;
    const { data } = await api.get("verifications/me", { bypassCache: true }).catch(() => { failed = true; return { data: null }; });
    setLoadFailed(failed);
    const record = data && statusOf(data) !== "NOT_SUBMITTED" ? data : null;
    setKyc(record);
    if (prefill) {
      const d = record?.documents || {};
      // Session 41 (Ravi): the contact person is the one from onboarding (brand profile), not the
      // account name — the account name is the brand ("Skullcandy").
      const { data: bp } = await api.get("brands/me").catch(() => ({ data: null }));
      const rep = bp?.representative_name || bp?.poc_name || "";
      const repRole = bp?.representative_designation || bp?.poc_designation || "";
      const base = {
        businessType: !d.gstin && !d.gst_cert && d.brand_pan ? "solo" : "registered",
        companyName: d.company_name || user?.name || "",
        siteUrl: d.website || d.website_url || "",
        gst: d.gstin || d.gst_cert || "",
        pan: d.brand_pan || "",
        proofUrl: d.business_proof_document_url || d.gst_cert_url || d.pan_card_url || "",
        pocName: d.poc_name || rep || "",
        pocEmail: d.poc_email || bp?.poc_email || user?.email || "",
        pocPhone: d.poc_phone || bp?.poc_phone || bp?.phone || user?.phone || "",
        pocDesignation: (d.poc_designation && d.poc_designation !== "Brand Representative" ? d.poc_designation : "") || repRole || "",
      };
      // v347: what was typed before a refresh comes back — only when the server has no KYC (or a
      // rejected one being fixed). A pending / approved KYC always shows the server's copy.
      const draft = failed ? null : loadBrandKycDraft();
      if (shouldRestoreBrandKycDraft(record, draft)) {
        setF(applyBrandKycDraft(base, draft));
        setDraftRestored(true);
        if (draft.step) setStep((s) => (s === "status" ? draft.step : s));
      } else {
        setF(base);
      }
    }
    if (record && isApproved(record) && refreshUser) refreshUser();
    return record;
  }, [user, refreshUser]);

  // Prefill once. The account object is refreshed in the background (AuthContext), and
  // re-running this would wipe what the brand is typing.
  const didPrefill = useRef(false);
  useEffect(() => {
    if (didPrefill.current) return undefined;
    didPrefill.current = true;
    load({ prefill: true }).finally(() => setLoading(false));
    return undefined;
  }, [load]);

  // v347: autosave the text fields (not the uploaded document, never an OTP) while the form is open.
  useEffect(() => {
    if (loading || (step !== "business" && step !== "contact")) return;
    if (kyc && !isRejected(kyc)) return;
    saveBrandKycDraft(f, step);
  }, [f, step, loading, kyc]);

  // While under review: update when the admin decides (notification), on focus, and every 30 s.
  useLiveRefresh(() => { if (isPending(kyc)) load(); }, { types: ["kyc", "verification"], intervalMs: isPending(kyc) ? 30000 : 0 });

  const goBack = () => {
    if (step === "contact") return setStep("business");
    if (step === "business") return setStep("status");
    if (window.history.length > 1) navigate(-1);
    else navigate("/brand/account");
  };

  const gst = f.gst.trim().toUpperCase();
  const pan = f.pan.trim().toUpperCase();
  const businessErrors = {
    companyName: !f.companyName.trim() ? "Enter your brand or company name." : null,
    gst: f.businessType === "registered" && gst && gst.length !== 15 ? "GSTIN must be 15 characters." : null,
    pan: pan && !PAN_RE.test(pan) ? "PAN must look like ABCDE1234F." : null,
    // v358: solo brands must give the owner PAN — a submission with no tax ID at all went through
    either: f.businessType === "registered" ? (!gst && !pan ? "Add your GSTIN or business PAN." : null) : (!pan ? "Add the owner's PAN." : null),
  };
  const contactErrors = {
    pocName: !f.pocName.trim() ? "Enter the contact person's name." : null,
    pocEmail: !f.pocEmail.trim() ? "Enter a work email." : !/^\S+@\S+\.\S+$/.test(f.pocEmail.trim()) ? "Enter a valid email." : null,
  };
  const hasErrors = (o) => Object.values(o).some(Boolean);

  const uploadProof = async (fileIn) => {
    if (!fileIn) return;
    const file = await prepareUpload(fileIn); // v408
    if (file.size > 10 * 1024 * 1024) return toast.error("That file is over 10MB. Please pick a smaller one."); // v332: plain copy
    if (!["image/jpeg", "image/png", "application/pdf", "image/webp"].includes(file.type)) return toast.error("Upload a JPG, PNG, WEBP or PDF file.");
    const fd = new FormData();
    fd.append("file", file) /* v408: HEIC / big photo → JPEG (prepared above) · v415: not prepared twice */;
    setUploading(true);
    try {
      const res = await api.post("upload?bucket=kyc-documents", fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (res.data?.url) { setF((p) => ({ ...p, proofUrl: res.data.url })); toast.success("Document attached"); }
      else toast.error("Upload did not return a file link. Please try again.");
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Document upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = async () => {
    setTouched(true);
    if (hasErrors(contactErrors)) return;
    if (uploading) { toast.error("Please wait for the document to finish uploading."); return; } // v415
    setSubmitting(true);
    try {
      await api.post("brand/kyc/submit", {
        companyName: f.companyName.trim(),
        gstNumber: f.businessType === "registered" ? gst : "",
        panNumber: pan,
        incorporationType: f.businessType === "registered" ? "registered_business" : "solo_brand",
        businessProofDocumentUrl: f.proofUrl || "",
        personName: f.pocName.trim(),
        designation: f.pocDesignation.trim() || "Brand Representative",
        workEmail: f.pocEmail.trim(),
        phone: f.pocPhone.trim(),
        websiteUrl: f.siteUrl.trim(),
      });
      clearBrandKycDraft(); // v347: submitted — the server copy is the truth now
      setDraftRestored(false);
      if (refreshUser) await refreshUser();
      await load();
      setStep("done");
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Could not submit verification. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (children) => (
    <ModalPortal>
      <div className="fixed inset-0 z-[60] flex flex-col bg-[#F4F4F8] text-[#0A0A0A]" style={{ ...font, height: "100dvh" }}>{children}</div>
    </ModalPortal>
  );

  if (loading) {
    return shell(
      <>
        <Header title="Verification" onBack={goBack} />
        <div className="flex-1 flex items-center justify-center"><ButtonSpinner /></div>
      </>
    );
  }

  // ── KY-02 · submitted ─────────────────────────────────────────────
  if (step === "done") {
    return shell(
      <>
        <div className="shrink-0" style={{ paddingTop: "var(--yb-sat, 0px)" /* Session 43: full-screen layer, below the clock strip */ }} />
        <div className="flex-1 overflow-y-auto flex flex-col justify-center gap-[18px] px-[22px] py-6">
          <div className="flex flex-col items-center text-center gap-2.5">
            <div className="w-[68px] h-[68px] rounded-[21px] bg-[#F3EDFF] flex items-center justify-center"><Clock size={32} color={C.violet} /></div>
            <div className="mt-1 text-[22px] font-bold">Verification submitted</div>
            <div className="text-[13.5px] leading-normal text-[#6B7280] max-w-[290px]">
              We'll notify you as soon as your Verified Brand badge is on.
            </div>
          </div>
          <Card>
            <TimelineRow done title="Submitted" hint="Just now" />
            <TimelineRow active={!isApproved(kyc)} done={isApproved(kyc)} title="Review" hint={isApproved(kyc) ? "Done" : "In progress"} />
            <TimelineRow done={isApproved(kyc)} title="Verified Brand badge" hint="Publish campaigns and pay creators" />
          </Card>
        </div>
        <Footer>
          {/* Session 33: only when a campaign draft really exists on this account/device. */}
          {hasCampaignDraft ? (
            <>
              <PrimaryBtn onClick={() => navigate(hasCampaignDraft)}>Continue campaign draft</PrimaryBtn>
              <SecondaryBtn onClick={() => navigate("/brand")}>Back to dashboard</SecondaryBtn>
            </>
          ) : (
            <PrimaryBtn onClick={() => navigate("/brand")}>Back to dashboard</PrimaryBtn>
          )}
        </Footer>
      </>
    );
  }

  // ── KY-01 / KY-01b · business & tax ───────────────────────────────
  if (step === "business") {
    const err = touched ? businessErrors : {};
    return shell(
      <>
        <Header title="Brand verification" subtitle="Step 1 of 2 · Business & tax" onBack={goBack} progress={1} />
        <div className="flex-1 overflow-y-auto overscroll-contain px-3.5 pt-3.5 pb-5 flex flex-col gap-3">
          {draftRestored && <div className="px-1.5 text-[12px] text-[#6B7280]" data-testid="kyc-draft-restored">Draft restored — we kept what you typed.</div>}
          <Card>
            <StepTitle n={1} title="Business profile" hint="What creators see on your campaigns" />
            <Field label="Brand / company name" required error={err.companyName}>
              <Input value={f.companyName} onChange={set("companyName")} invalid={!!err.companyName} autoComplete="organization" />
            </Field>
            <Field label="Website or Instagram" optional>
              <Input value={f.siteUrl} onChange={set("siteUrl")} placeholder="www.yourbrand.com or instagram.com/brand" inputMode="url" autoCapitalize="none" />
            </Field>
          </Card>
          <Card>
            <StepTitle n={2} title="Tax & business ID" hint="Used for invoices and tax receipts" />
            <div className="h-[46px] rounded-[14px] bg-[#EFEFF4] p-[3px] flex box-border">
              {[["registered", "GST registered", Building2], ["solo", "Solo / unregistered", User]].map(([id, label, Icon]) => {
                const on = f.businessType === id;
                return (
                  <button key={id} type="button" onClick={() => setF((p) => ({ ...p, businessType: id }))}
                    className="flex-1 rounded-[11px] flex items-center justify-center gap-1.5 text-[13px] font-semibold transition"
                    style={{ background: on ? C.violet : "transparent", color: on ? "#fff" : "#4B5563" }}>
                    <Icon size={15} /> {label}
                  </button>
                );
              })}
            </div>
            {f.businessType === "registered" && (
              <Field label="GSTIN" help="15-character GST number" error={err.gst}>
                <Input value={f.gst} onChange={(e) => setF((p) => ({ ...p, gst: e.target.value.toUpperCase() }))} placeholder="07AAAAA0000A1Z5" maxLength={15} autoCapitalize="characters" invalid={!!err.gst} />
              </Field>
            )}
            <Field label={f.businessType === "registered" ? "Company / director PAN" : "Owner PAN"} help="10-character PAN" error={err.pan}>
              <Input value={f.pan} onChange={(e) => setF((p) => ({ ...p, pan: e.target.value.toUpperCase() }))} placeholder="ABCDE1234F" maxLength={10} autoCapitalize="characters" invalid={!!err.pan} />
            </Field>
            {err.either && <div className="text-[11.5px] text-[#B91C1C] -mt-1">{err.either}</div>}
            <Field label="Business document" optional>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => uploadProof(e.target.files?.[0])} />
              {f.proofUrl ? (
                <div className="h-14 rounded-[14px] border border-[#E0E0E8] bg-white flex items-center gap-2.5 px-3.5">
                  <FileText size={17} color={C.violet} />
                  <a href={mediaHref(f.proofUrl) /* v332: private KYC file opens through the media link (raw path was a dead link) */} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-[13px] font-medium text-[#0A0A0A]">Document attached</a>
                  <button type="button" onClick={() => setF((p) => ({ ...p, proofUrl: "" }))} aria-label="Remove document" className="w-10 h-10 -mr-2 rounded-lg flex items-center justify-center text-[#6B7280]"><X size={16} /></button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="h-14 rounded-[14px] border-[1.5px] border-dashed border-[#D4D4DE] bg-[#FAFAFC] flex items-center justify-center gap-2 text-[13px] font-medium text-[#374151] disabled:opacity-60">
                  {uploading ? <ButtonSpinner /> : <UploadCloud size={17} color={C.violet} />} {uploading ? "Uploading…" : "Attach GST or PAN certificate"}
                </button>
              )}
            </Field>
          </Card>
        </div>
        <Footer>
          <PrimaryBtn disabled={uploading} onClick={() => { setTouched(true); if (!hasErrors(businessErrors)) { setTouched(false); setStep("contact"); } }}>{uploading ? "Uploading document…" : "Continue"}</PrimaryBtn>{/* v415: not while the document uploads */}
        </Footer>
      </>
    );
  }

  // ── KY-03 · contact ───────────────────────────────────────────────
  if (step === "contact") {
    const err = touched ? contactErrors : {};
    return shell(
      <>
        <Header title="Brand verification" subtitle="Step 2 of 2 · Contact" onBack={goBack} progress={2} />
        <div className="flex-1 overflow-y-auto overscroll-contain px-3.5 pt-3.5 pb-5 flex flex-col gap-3">
          {draftRestored && <div className="px-1.5 text-[12px] text-[#6B7280]" data-testid="kyc-draft-restored">Draft restored — we kept what you typed.</div>}
          <Card>
            <StepTitle n={3} title="Contact representative" hint="The person who runs campaigns and talks to creators" />
            <Field label="Full name" required error={err.pocName}>
              <Input value={f.pocName} onChange={set("pocName")} autoComplete="name" invalid={!!err.pocName} />
            </Field>
            <Field label="Work email" required error={err.pocEmail}>
              <Input value={f.pocEmail} onChange={set("pocEmail")} type="email" inputMode="email" autoCapitalize="none" autoComplete="email" invalid={!!err.pocEmail} />
            </Field>
            <Field label="Phone" optional>
              <Input value={f.pocPhone} onChange={set("pocPhone")} type="tel" inputMode="tel" autoComplete="tel" />
            </Field>
            <Field label="Role" optional>
              <Input value={f.pocDesignation} onChange={set("pocDesignation")} placeholder="e.g. Marketing Lead" />
            </Field>
          </Card>
          <div className="flex gap-2.5 px-1.5">
            <Lock size={16} color={C.sub} className="shrink-0 mt-0.5" />
            <span className="text-[12.5px] leading-snug text-[#6B7280]">Tax IDs are only used for verification and invoices. Creators see your brand name and website.</span>
          </div>
        </div>
        <Footer note="Pre-filled from your account. Edit if needed.">
          <PrimaryBtn busy={submitting} onClick={submit}><ShieldCheck size={17} /> Submit verification</PrimaryBtn>
        </Footer>
      </>
    );
  }

  // ── ST-02 · status ────────────────────────────────────────────────
  const approved = isApproved(kyc), pending = isPending(kyc), rejected = isRejected(kyc);
  const reason = kyc?.rejection_reason || kyc?.admin_notes || kyc?.documents?.rejection_reason || "";
  const tone = approved ? ["#DCFCE7", "#15803D"] : pending ? ["#F3EDFF", C.violet] : rejected ? ["#FEE2E2", "#B91C1C"] : ["#FEF3C7", "#B45309"];
  // v332: when the status check failed we don't know — don't claim "KYC not submitted" (it may be under review).
  const unknown = loadFailed && !kyc;
  // v415: "Verification pending" (was "KYC not submitted") — the same words as the profile and settings badges
  const headline = approved ? "Verified brand" : pending ? "Under review" : rejected ? "Verification needs changes" : unknown ? "Status not checked yet" : "Verification pending";
  const body = approved
    ? "You can publish campaigns and pay creators through Ybex escrow."
    : pending
    ? "We'll notify you when the review is done. This page updates on its own."
    : rejected
    ? (reason || "Please check your details and submit again.")
    : unknown
    ? "We couldn't check your verification right now. Tap Retry above — if you already submitted, nothing is lost."
    : "Verify once to publish campaigns, pay creators through Ybex escrow and get the Verified Brand badge.";
  const Icon = approved ? Check : pending ? Clock : rejected ? AlertTriangle : ShieldCheck;

  return shell(
    <>
      {/* v283 (Ravi): verified / submitted brands can resubmit their details from the top-right. */}
      <Header title="Verification" subtitle={headline} onBack={goBack} action={(approved || pending) ? (
        <button type="button" onClick={() => { if (approved) { setConfirmResubmit(true); return; } setTouched(false); setStep("business"); }} data-testid="brand-kyc-resubmit"
          className="h-10 px-3.5 rounded-full bg-[#F5F0FF] text-[#7C3AED] text-[12px] font-bold active:scale-95 transition shrink-0">{/* v332: 40px */}
          Resubmit
        </button>
      ) : null} />
      {confirmResubmit && ( /* v358: editing approved details sends the brand back to review */
        <div className="fixed inset-0 z-[10000] bg-black/40 flex items-end justify-center" onClick={() => setConfirmResubmit(false)} data-testid="brand-kyc-resubmit-confirm">
          <div className="w-full max-w-md bg-white rounded-t-[24px] p-5 flex flex-col gap-3" style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }} onClick={(e) => e.stopPropagation()}>
            <div className="text-[17px] font-bold text-[#0A0A0A]">Change verified details?</div>
            <div className="text-[13.5px] leading-snug text-[#4B5563]">Changing details sends your verification for review again. You can't publish campaigns until it's approved.</div>
            <div className="flex gap-2.5 pt-1">
              <button type="button" onClick={() => setConfirmResubmit(false)} className="flex-1 h-12 rounded-[14px] border border-[#E0E0E8] bg-white text-[14px] font-semibold text-[#0A0A0A]">Keep as is</button>
              <button type="button" onClick={() => { setConfirmResubmit(false); setTouched(false); setStep("business"); }} className="flex-1 h-12 rounded-[14px] bg-[#7C3AED] text-white text-[14px] font-semibold">Edit details</button>
            </div>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto overscroll-contain px-3.5 pt-3.5 pb-5 flex flex-col gap-3">
        {loadFailed && (
          // v330: tell the brand the status could not be checked (it may already be under review).
          <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-[16px] px-3.5 py-3 flex items-center gap-3" data-testid="brand-kyc-load-error">
            <AlertTriangle size={18} color="#B91C1C" className="shrink-0" />
            <div className="flex-1 min-w-0 text-[12.5px] leading-snug text-[#991B1B]">Couldn't check your verification status. Check your connection.</div>
            <button type="button" onClick={() => load()} className="h-10 px-3 rounded-[10px] bg-white border border-[#FECACA] text-[12.5px] font-semibold text-[#B91C1C] shrink-0">Retry</button>
          </div>
        )}
        <Card>
          <div className="flex flex-col items-center text-center gap-2 py-1.5 px-1">
            <div className="w-14 h-14 rounded-[17px] flex items-center justify-center" style={{ background: tone[0] }}><Icon size={26} color={tone[1]} /></div>
            <div className="mt-1 text-lg font-bold">{headline}</div>
            <div className="text-[13px] leading-normal text-[#6B7280]">{body}</div>
          </div>
        </Card>
        {!approved && !pending && (
          <>
            <div className="px-1 pt-1.5 text-[11.5px] font-bold tracking-[1px] text-[#6B7280]">YOU'LL NEED</div>
            <div className="bg-white border border-[#E6E6EE] rounded-[20px] overflow-hidden">
              {[["Business profile", "Brand name and website or Instagram"], ["Tax & business ID", "GSTIN + PAN, or owner PAN if unregistered"], ["Contact representative", "Name, work email and phone"]].map(([t, h], i) => (
                <div key={t} className={`flex items-center gap-3 px-3.5 py-3 ${i ? "border-t border-[#F0F0F4]" : ""}`}>
                  <div className="w-[30px] h-[30px] rounded-full bg-[#F1F1F5] flex items-center justify-center text-[13px] font-bold text-[#4B5563] shrink-0">{i + 1}</div>
                  <div className="min-w-0"><div className="text-sm font-semibold">{t}</div><div className="mt-px text-xs text-[#6B7280]">{h}</div></div>
                </div>
              ))}
            </div>
          </>
        )}
        {kyc?.documents?.company_name && (approved || pending) && (
          <div className="bg-white border border-[#E6E6EE] rounded-[20px] px-3.5 py-3">
            <div className="text-xs text-[#6B7280]">Submitted for</div>
            <div className="text-sm font-semibold truncate">{kyc.documents.company_name}</div>
          </div>
        )}
      </div>
      {!approved && !pending && (
        <Footer>
          <PrimaryBtn onClick={() => { setTouched(false); setStep("business"); }}>{rejected ? "Fix and resubmit" : "Start verification"}</PrimaryBtn>
        </Footer>
      )}
    </>
  );
}

function TimelineRow({ done, active, title, hint }) {
  return (
    <div className="flex gap-3 items-center">
      <div className="w-[26px] h-[26px] rounded-full flex items-center justify-center shrink-0" style={{ background: done ? "#DCFCE7" : active ? "#F3EDFF" : "#F1F1F5" }}>
        {done ? <Check size={14} color="#15803D" strokeWidth={2.6} /> : <div className="w-2 h-2 rounded-full" style={{ background: active ? C.violet : "#9CA3AF" }} />}
      </div>
      <div><div className="text-sm font-semibold">{title}</div><div className="text-xs text-[#6B7280]">{hint}</div></div>
    </div>
  );
}
