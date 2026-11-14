import React, { useState, useEffect } from "react";
import { Badge } from "@/components/common/Badge";
import { Search, ShieldCheck, CheckCircle2, XCircle, AlertTriangle, ArrowLeft, FileText, Fingerprint, Building2, UserCircle2, Clock, X, Eye, RefreshCw, User, Calendar, MapPin, Users, CreditCard, Mail, Phone, ExternalLink, Tag, Languages } from "lucide-react";
import { api } from "../../lib/api";
import { mediaHref } from "../../lib/mediaUrl";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import SocialLogo from "../common/SocialLogo"; // v364: real platform logos

// v332: calm error text (never raw "Request failed with status code 500").
const calmError = (err, fallback) => {
  const m = err?.response?.data?.error || err?.response?.data?.detail;
  return typeof m === "string" && m && m.length < 160 ? m : fallback;
};

export default function KYCManager() {
  const [kycData, setKycData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("creator");
  const [search, setSearch] = useState("");
  const [statusBox, setStatusBox] = useState("waiting"); // v419 (Ravi): Waiting / Approved / Rejected / All
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [loadError, setLoadError] = useState(false); // v330: failed load is not "No applications"
  const [reviewing, setReviewing] = useState(false); // v330: no double approve / reject

  useEffect(() => {
    fetchKycData();
  }, []);

  const fetchKycData = async () => {
    try {
      setLoadError(false); // v330
      const { data } = await api.get("admin/verifications");
      if (data) setKycData(data);
      // v419: /admin?tab=verifications&open=<user id> (the Waitlist's "View KYC") opens that person's review
      try {
        const q = new URLSearchParams(window.location.search); const want = q.get("open");
        if (want && Array.isArray(data)) {
          const rec = data.find((r) => [r?.creator_id, r?.user_id, r?.brand_id, r?.verification_id, r?.id].map(String).includes(String(want)));
          if (rec) { setActiveTab(String(rec.type || rec.kind || "creator").toLowerCase() === "brand" ? "brand" : "creator"); setSelectedRecord(rec); }
          q.delete("open"); window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
        }
      } catch { /* deep link is optional */ }
      return true; // v330
    } catch (e) {
      console.error(e);
      setLoadError(true); // v330
      toast.error(calmError(e, "Couldn't load KYC applications. Please try again.")); // v332
      return false; // v330
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (id, type, status, reason = "") => {
    if (reviewing) return; // v330
    setReviewing(true);
    try {
      const upperStatus = status.toUpperCase();
      const endpoint = upperStatus === 'APPROVED' 
        ? `/admin/verifications/${id}/approve`
        : `/admin/verifications/${id}/reject`;
      await api.post(endpoint, { note: reason });
      toast.success(`Application ${status.toLowerCase()}`);
      setSelectedRecord(null);
      // Immediately update local state so the table reflects the new status instantly
      setKycData(prev => Array.isArray(prev) ? prev.map(item => {
        const matches = item.verification_id === id || item.id === id || item.user_id === id || item.brand_id === id || item.creator_id === id;
        if (matches) {
          return {
            ...item,
            status: upperStatus,
            rejection_reason: reason,
            admin_note: reason
          };
        }
        return item;
      }) : prev);
      await fetchKycData();
    } catch (e) {
      console.error(e);
      toast.error(calmError(e, "Couldn't save the decision. Please try again.")); // v332
    } finally {
      setReviewing(false); // v330
    }
  };

  const filteredData = Array.isArray(kycData) ? kycData.filter((record) => {
    if (!record) return false;
    const recType = (record.type || record.kind || "").toLowerCase();
    if (recType !== activeTab) return false;
    
    // Ensure we don't show empty/bogus submissions with no details 
    const hasDocs = record.documents && Object.keys(record.documents).length > 0;
    const hasOldDocUrl = !!record.doc_url;
    if (!hasDocs && !hasOldDocUrl && record.status === 'PENDING') return false;

    const name = record.name || record.user?.name || "";
    const email = record.user?.email || "";
    const searchString = `${name} ${email}`.toLowerCase();
    return searchString.includes(search.toLowerCase());
  }) : [];
  // v419 (Ravi: "approved neeche shift ho jaye, ya alag box"): each row falls in one box; waiting ones first.
  const kycBox = (r) => { const st = String(r?.status || "").toUpperCase(); return st === "APPROVED" || st === "VERIFIED" ? "approved" : st === "REJECTED" ? "rejected" : "waiting"; };
  const boxCounts = filteredData.reduce((m, r) => { m[kycBox(r)] += 1; return m; }, { waiting: 0, approved: 0, rejected: 0 });
  const BOX_ORDER = { waiting: 0, rejected: 1, approved: 2 };
  const shownData = filteredData.filter((r) => statusBox === "all" || kycBox(r) === statusBox).sort((a, b) => BOX_ORDER[kycBox(a)] - BOX_ORDER[kycBox(b)]);

  const getStatusBadge = (status) => {
    switch (status) {
      case "PENDING":
        return <Badge variant="warning">Pending Review</Badge>;
      case "APPROVED":
        return <Badge variant="success">Approved</Badge>;
      case "REJECTED":
        return <Badge variant="neutral">Rejected</Badge>;
      default:
        // v330: no raw enum ("under_review", "SUBMITTED") on screen
        return <Badge variant={status}>{["under_review", "pending", "SUBMITTED"].includes(status) ? "Pending Review" : status ? String(status).replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : "Not submitted"}</Badge>;
    }
  };

  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      // v330: only say "synced" when the reload worked (it said so after a failed load too)
      if (await fetchKycData()) toast.success("KYC data synced successfully!");
    } catch (err) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  if (selectedRecord) {
    return (
      <KYCReviewPanel 
        record={selectedRecord} 
        onBack={() => setSelectedRecord(null)} 
        onReview={handleReview}
        reviewing={reviewing}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold tracking-tight">KYC & Verifications</h2>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Review identity and compliance documents.</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing || loading}
          className="flex items-center justify-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--violet)] transition-colors border border-[var(--border-default)] rounded-xl px-4 py-2 bg-[var(--bg-card)] disabled:opacity-50"
        >
          <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing..." : "Sync Live Data"}
        </button>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between p-1 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl">
        <div className="flex w-full sm:w-auto p-1 bg-[var(--bg-elevated)] rounded-lg">
          <button
            onClick={() => setActiveTab("creator")}
            className={`flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'creator' ? 'bg-[#9D7CFF] text-white shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
          >
            Creators
          </button>
          <button
            onClick={() => setActiveTab("brand")}
            className={`flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'brand' ? 'bg-[#9D7CFF] text-white shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
          >
            Brands
          </button>
        </div>
        <div className="relative w-full sm:w-64 px-2 sm:px-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] w-4 h-4" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            // v330: 16px on phones so iOS doesn't zoom
            className="w-full pl-10 pr-4 py-2 bg-transparent border-none text-[16px] sm:text-sm focus:outline-none focus:ring-0 placeholder-[var(--text-tertiary)]"
          />
        </div>
      </div>

      {/* v419: status boxes */}
      <div className="flex flex-wrap gap-2" data-testid="kyc-status-boxes">
        {[["waiting", "Waiting"], ["approved", "Approved"], ["rejected", "Rejected"], ["all", "All"]].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setStatusBox(id)} data-testid={`kyc-box-${id}`}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${statusBox === id ? "bg-[#9D7CFF] text-white border-[#9D7CFF]" : "bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-default)] hover:text-[var(--text-primary)]"}`}>
            {label}{id !== "all" ? ` (${boxCounts[id]})` : ` (${filteredData.length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-default)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-[var(--text-tertiary)]">
            Loading applications...
          </div>
        ) : loadError && kycData.length === 0 ? (
          /* v330: a failed load used to read "No creator applications found." */
          <div className="flex flex-col items-center justify-center py-20 text-red-600 gap-3">
            <p>Could not load KYC applications.</p>
            <button type="button" onClick={handleSync} className="px-4 py-2 rounded-xl border border-[var(--border-default)] text-xs font-bold">Try again</button>
          </div>
        ) : shownData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[var(--text-tertiary)] gap-3">
            <ShieldCheck className="w-10 h-10 opacity-20" />
            <p>No {statusBox === "all" ? "" : statusBox + " "}{activeTab} applications found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[var(--bg-elevated)] text-[var(--text-secondary)] font-medium">
                <tr>
                  <th className="px-6 py-4">Applicant</th>
                  <th className="px-6 py-4">Submitted Date</th>
                  <th className="px-6 py-4">Documents</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {shownData.map((record) => (
                  <tr key={record.verification_id || record.id} onClick={() => setSelectedRecord(record)} data-testid="kyc-row" className="hover:bg-foreground/5 transition-colors group cursor-pointer">{/* v419 (Ravi): the whole row opens the review */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[var(--bg-elevated)] overflow-hidden shrink-0">
                          {record.user?.picture || record.profile?.photo || record.profile?.picture || record.profile?.logo ? (
                            <img src={record.user?.picture || record.profile?.photo || record.profile?.picture || record.profile?.logo} alt="" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} className="w-full h-full object-cover" />
                          ) : (
                            <UserCircle2 className="w-full h-full text-[var(--text-tertiary)]" />
                          )}
                        </div>
                        <div>
                          <div className="font-semibold flex items-center gap-1.5">
                            {record.name || record.user?.name}
                            {kycSubmitted(record) && kycBox(record) === "waiting" && ( /* v419: no red dot on approved / rejected rows */ /* v402: no red dot when nothing was submitted */
                              <span className="relative flex h-2 w-2 shrink-0" title="Pending KYC Verification">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                              </span>
                            )}
                          </div>
                          <div className="text-[var(--text-secondary)] text-xs">{record.user?.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-[var(--text-secondary)]">
                      {/* v330: en-IN + IST, and no "Invalid Date" */}
                      {record.created_at ? new Date(record.created_at).toLocaleDateString("en-IN", { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' }) : "—"}
                    </td>
                    <td className="px-6 py-4">
                      {activeTab === 'creator' ? (
                        // v396 (Ravi): creators only give PAN — show "PAN" when they did, "Not submitted" when not (the
                        // "ID Doc" chip was the same PAN photo again)
                        (String(record.pan_number || '').trim() || record.pan_doc_url || record.data?.pan_card_url)
                          ? <span className="px-2 py-0.5 bg-foreground/10 rounded text-xs font-semibold">PAN</span>
                          : <span className="px-2 py-0.5 rounded text-xs text-[var(--text-tertiary)] border border-dashed border-[var(--border-default)]">Not submitted</span>
                      ) : (
                      <div className="flex items-center gap-2">
                        {record.pan_number && <span className="px-2 py-0.5 bg-foreground/10 rounded text-xs">PAN</span>}
                        {record.aadhaar_number && <span className="px-2 py-0.5 bg-foreground/10 rounded text-xs">Aadhaar</span>}
                        {record.gst_number && <span className="px-2 py-0.5 bg-foreground/10 rounded text-xs">GST</span>}
                        {record.doc_url && <span className="px-2 py-0.5 bg-foreground/10 rounded text-xs">ID Doc</span>}
                      </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(record.status)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedRecord(record); }}
                        className="px-4 py-2 bg-[var(--bg-elevated)] hover:bg-foreground/10 text-[var(--text-primary)] rounded-lg text-xs font-semibold transition-colors"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function KYCReviewPanel({ record, onBack, onReview, reviewing = false }) { // v419: also opened inside the Waitlist
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [zoomedImage, setZoomedImage] = useState(null);
  
  const isCreator = (record.type || record.kind || "").toLowerCase() === "creator";

  // Safely resolve nested attributes
  const creator_name = record.full_name || record.documents?.creator_name || record.name || record.user?.name || "N/A";
  // rate_card is the one place DOB is guaranteed to land (it is a JSON column that always
  // exists), so it has to be in this chain — without it a creator who filled in their DOB
  // at onboarding still showed "N/A" here.
  const creator_dob = record.dob || record.date_of_birth || record.creator_dob || record.documents?.creator_dob || record.user?.dob || record.user?.date_of_birth || record.profile?.dob || record.profile?.date_of_birth || record.rate_card?.dob || record.rate_card?.date_of_birth || record.profile?.rate_card?.dob || record.profile?.rate_card?.date_of_birth || "N/A";
  const creator_state = record.address || record.documents?.creator_state || (record.city || record.state ? `${record.city ? record.city + ', ' : ''}${record.state || ''}` : "N/A");
  const creator_phone = record.phone || record.mobile || record.user?.phone || record.user?.mobile || record.profile?.phone || record.profile?.mobile || record.documents?.poc_phone || "Not provided";
  const creator_gender = record.gender || record.user?.gender || record.profile?.gender || "N/A";
  const niche_category = (Array.isArray(record.niche) ? record.niche.join(', ') : record.niche) || record.category || record.primary_niche || record.profile?.primary_niche || record.profile?.category || record.documents?.category || "Fashion & Lifestyle";
  const social_handle = record.instagram_handle || record.documents?.social_handle || record.handle || record.profile?.instagram_handle || "N/A";
  const follower_count = record.follower_count || record.documents?.followers || record.followers || record.profile?.followers_instagram || "0";
  const avg_reach = record.avg_reach || record.profile?.avg_views_30d || record.profile?.average_reach || "N/A";
  const bio_text = record.bio || record.profile?.bio || record.user?.bio || "";
  const languages_val = (Array.isArray(record.languages) && record.languages.length > 0)
    ? record.languages.join(", ")
    : (Array.isArray(record.profile?.languages) && record.profile.languages.length > 0)
      ? record.profile.languages.join(", ")
      : (typeof record.languages === 'string' && record.languages ? record.languages : "Not provided"); // v332: no made-up "Hindi, English"

  const rate_reel_val = Number(record.rate_reel || record.profile?.rate_reel || record.profile?.rate_card?.reels || record.rate_card?.reels || 0);
  const rate_story_val = Number(record.rate_story || record.profile?.rate_story || record.profile?.rate_card?.stories || record.rate_card?.stories || 0);
  const rate_yt_val = Number(record.rate_yt_video || record.profile?.rate_yt_video || record.profile?.rate_card?.yt_video || record.rate_card?.yt_video || 0);
  const main_charges = record.charges || record.profile?.charges || (rate_reel_val > 0 ? `₹${rate_reel_val.toLocaleString('en-IN')}` : "N/A");
  const barter_mode = record.barter_mode || record.profile?.barter_mode || record.profile?.barter || record.barter || "Cash Only";
  const experience_val = record.experience || record.experience_years || record.ugc_experience || record.profile?.experience || record.profile?.experience_years || record.rate_card?.experience || record.profile?.rate_card?.experience || "";

  const pan_number = record.pan_number || record.documents?.creator_pan || record.documents?.brand_pan || "N/A";
  const aadhaar_number = record.aadhaar_number || record.documents?.creator_aadhaar || "N/A";
  const gstin_number = record.gstin || record.gst_number || record.documents?.gst_cert || record.documents?.gstin || "N/A";

  const bank_holder = record.bank_holder_name || record.documents?.bank_name || record.documents?.creator_name || "N/A";
  const bank_acc = record.bank_account_no || record.bank_account_number || record.bank_account || record.documents?.bank_account || "N/A";
  const bank_ifsc = record.bank_ifsc || record.documents?.bank_ifsc || "N/A";
  const upi_id = record.upi_id || record.documents?.upi_id || "N/A";

  // Brand details
  const company_name = record.company_name || record.documents?.company_name || record.name || record.user?.name || "N/A";
  const website_url = record.website_url || record.website || record.documents?.website || "N/A";
  const poc_name = record.authorized_person_name || record.poc_name || record.documents?.poc_name || "N/A";
  const poc_designation = record.authorized_person_designation || record.poc_designation || record.documents?.poc_designation || "N/A";
  const poc_email = record.work_email || record.poc_email || record.documents?.poc_email || record.user?.email || "N/A";
  const poc_phone = record.phone || record.poc_phone || record.documents?.poc_phone || "N/A";
  const incorporation_type = record.incorporation_type || record.documents?.incorporation_type || "N/A";

  // Build document files array
  // v332: shown on screen as "Not provided" instead of a made-up "Fashion & Lifestyle" (the audit still gets the old value)
  const niche_display = niche_category === "Fashion & Lifestyle" && !((Array.isArray(record.niche) ? record.niche.join(', ') : record.niche) || record.category || record.primary_niche || record.profile?.primary_niche || record.profile?.category || record.documents?.category) ? "Not provided" : niche_category;
  const filesList = [];
  if (isCreator) {
    const pan_img = record.pan_card_url || record.pan_photo_url || record.pan_doc_url || record.doc_url || record.documents?.pan_photo_url || record.documents?.pan_card_url || record.documents?.creator_pan_url || record.user?.pan_card_url || record.profile?.pan_card_url;
    const aadhaar_front_img = record.aadhaar_front_url || record.aadhaar_front || record.documents?.aadhaar_front_url; // v378: no uploaded_files[n] guessing
    const aadhaar_back_img = record.aadhaar_back_url || record.aadhaar_back || record.documents?.aadhaar_back_url;
    const upi_qr_img = record.upi_qr_code_url || record.documents?.upi_qr_code_url || record.payment_details?.upi_qr_code_url;

    if (pan_img) {
      filesList.push({ label: "PAN Card Copy", url: pan_img });
    }
    if (aadhaar_front_img) {
      filesList.push({ label: "Aadhaar Card Front", url: aadhaar_front_img });
    }
    if (aadhaar_back_img) {
      filesList.push({ label: "Aadhaar Card Back", url: aadhaar_back_img });
    }
    if (upi_qr_img) {
      filesList.push({ label: "UPI Payment QR Code", url: upi_qr_img });
    }
  } else {
    const inc_img = record.incorporation_doc_url || record.documents?.business_proof_document_url || record.documents?.incorporation_proof || record.documents?.incorporation_doc_url;
    const gst_img = record.gst_certificate_url || record.documents?.gst_cert_url || record.documents?.gst_certificate_url;
    const brand_pan_img = record.pan_card_url || record.documents?.brand_pan_url || record.documents?.pan_card_url;

    // Track seen URLs to ensure cards are only rendered for actually uploaded, distinct documents
    const seenUrls = new Set();

    if (inc_img && typeof inc_img === 'string' && inc_img.trim() && !seenUrls.has(inc_img)) {
      seenUrls.add(inc_img);
      filesList.push({ label: "Business Registration / Incorporation Proof", url: inc_img });
    }
    if (gst_img && typeof gst_img === 'string' && gst_img.trim() && !seenUrls.has(gst_img)) {
      seenUrls.add(gst_img);
      filesList.push({ label: "GST Registry Certificate", url: gst_img });
    }
    if (brand_pan_img && typeof brand_pan_img === 'string' && brand_pan_img.trim() && !seenUrls.has(brand_pan_img)) {
      seenUrls.add(brand_pan_img);
      filesList.push({ label: "Company PAN Card", url: brand_pan_img });
    }

    // Fallback only if no named documents matched and uploaded_files array has distinct files
    if (filesList.length === 0 && Array.isArray(record.documents?.uploaded_files)) {
      record.documents.uploaded_files.forEach((u, idx) => {
        if (u && typeof u === 'string' && u.trim() && !seenUrls.has(u)) {
          seenUrls.add(u);
          filesList.push({ label: `Uploaded Document ${idx + 1}`, url: u });
        }
      });
    }
  }

  // Fallback if no files populated, but record has doc_url
  if (filesList.length === 0 && record.doc_url) {
    filesList.push({ label: "Submitted KYC Document", url: record.doc_url });
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={onBack} className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm font-medium transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to List
        </button>
        <div className="flex items-center gap-2">
          {record.status === "PENDING" && <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full text-xs font-bold uppercase"><Clock className="w-3.5 h-3.5" /> Pending Review</span>}
          {record.status === "APPROVED" && <span className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 text-green-500 border border-green-500/20 rounded-full text-xs font-bold uppercase"><CheckCircle2 className="w-3.5 h-3.5" /> Approved</span>}
          {record.status === "REJECTED" && <span className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 text-red-500 border border-red-500/20 rounded-full text-xs font-bold uppercase"><XCircle className="w-3.5 h-3.5" /> Rejected</span>}
          {/* v332: under_review / pending / SUBMITTED showed no status at all here */}
          {["under_review", "pending", "SUBMITTED"].includes(record.status) && <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full text-xs font-bold uppercase"><Clock className="w-3.5 h-3.5" /> Pending Review</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Applicant Info & Documents */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main User Card */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[var(--bg-elevated)] overflow-hidden shrink-0 border border-[var(--border-default)]">
                {record.user?.picture || record.profile?.photo || record.profile?.picture || record.profile?.logo ? (
                  <img src={record.user?.picture || record.profile?.photo || record.profile?.picture || record.profile?.logo} alt="" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} className="w-full h-full object-cover" />
                ) : (
                  <UserCircle2 className="w-full h-full text-[var(--text-tertiary)]" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="font-display font-bold text-xl break-words">{isCreator ? creator_name : company_name}</h3>
                <p className="text-[var(--text-secondary)] text-sm break-all">{record.user?.email}</p>
                {record.user_id && <div className="mt-2 text-xs font-mono text-[var(--text-tertiary)] bg-[var(--bg-elevated)] px-2 py-0.5 rounded inline-block break-all">ID: {record.user_id}</div>}{/* v332: no "ID: undefined" */}
              </div>
              {(record.user_id || record.user?.user_id) && (
                // v402 (Ravi): straight to the same full profile as Users → Creators (reach, engagement, everything)
                <a href={`/admin?tab=users&role=all&open=${encodeURIComponent(record.user_id || record.user?.user_id)}`} data-testid="kyc-view-profile"
                  className="ml-auto shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[var(--violet)]/30 text-[var(--violet)] hover:bg-[var(--violet-soft)] text-sm font-bold">
                  <Eye className="w-4 h-4" /> View complete profile
                </a>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {/* Profile Details Section */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-6">
              <h4 className="font-semibold text-xs text-blue-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <UserCircle2 className="w-4 h-4" /> Personal &amp; Profile Details
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isCreator ? (
                  <>
                    <DataRow icon={<User />} label="Full Name" value={creator_name} />
                    <DataRow icon={<Calendar />} label="Date of Birth" value={creator_dob} />
                    <DataRow icon={<Phone />} label="Contact Phone Number" value={creator_phone} />
                    <DataRow icon={<MapPin />} label="State / Address" value={creator_state} />
                    <DataRow icon={<Tag />} label="Niche / Category" value={niche_display} />
                    <DataRow icon={<Languages />} label="Languages" value={languages_val} />
                    <DataRow icon={<SocialLogo platform={social_handle && /youtu/i.test(String(social_handle)) ? "youtube" : "instagram"} size={16} />} label="Social Handle" value={social_handle} href={socialProfileUrl(social_handle)} />
                    <DataRow icon={<Users />} label="Followers & Reach" value={`${!isNaN(Number(follower_count)) && follower_count !== null && follower_count !== undefined ? Number(follower_count).toLocaleString("en-IN") : "0"} followers ${avg_reach && avg_reach !== "N/A" ? `• Avg Reach: ${avg_reach}` : ""}`} />
                  </>
                ) : (
                  <>
                    <DataRow icon={<Building2 />} label="Company Name" value={company_name} />
                    <DataRow icon={<ExternalLink />} label="Website URL" value={website_url} />
                    <DataRow icon={<User />} label="Authorized Contact" value={poc_name} />
                    <DataRow icon={<Tag />} label="Designation" value={poc_designation} />
                    <DataRow icon={<Mail />} label="Work Email" value={poc_email} />
                    <DataRow icon={<Phone />} label="Work Phone" value={poc_phone} />
                  </>
                )}
              </div>
            </div>

            {/* Rates & Experience Section (For Creators) */}
            {isCreator && (
              <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-6">
                <h4 className="font-semibold text-xs text-amber-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Tag className="w-4 h-4" /> Rates &amp; Experience
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="bg-[var(--bg-elevated)] p-3 rounded-xl border border-[var(--border-default)]">
                    <div className="text-xs text-[var(--text-secondary)]">Instagram Reel</div>
                    <div className="font-mono text-sm font-extrabold text-[var(--green)] mt-1">
                      {rate_reel_val > 0 ? `₹${rate_reel_val.toLocaleString('en-IN')}` : (main_charges !== "N/A" ? main_charges : "—")}
                    </div>
                  </div>
                  <div className="bg-[var(--bg-elevated)] p-3 rounded-xl border border-[var(--border-default)]">
                    <div className="text-xs text-[var(--text-secondary)]">Story Shoutout</div>
                    <div className="font-mono text-sm font-extrabold text-[var(--green)] mt-1">
                      {rate_story_val > 0 ? `₹${rate_story_val.toLocaleString('en-IN')}` : "—"}
                    </div>
                  </div>
                  <div className="bg-[var(--bg-elevated)] p-3 rounded-xl border border-[var(--border-default)]">
                    <div className="text-xs text-[var(--text-secondary)]">Main / UGC Charge</div>
                    <div className="font-mono text-sm font-extrabold text-blue-400 mt-1">
                      {main_charges !== "N/A" ? main_charges : (rate_reel_val > 0 ? `₹${rate_reel_val.toLocaleString('en-IN')}` : "—")}
                    </div>
                  </div>
                  <div className="bg-[var(--bg-elevated)] p-3 rounded-xl border border-[var(--border-default)]">
                    <div className="text-xs text-[var(--text-secondary)]">Commercial Mode</div>
                    <div className="font-mono text-xs font-bold text-[var(--violet)] mt-1">
                      {barter_mode === 'cash_and_barter' ? 'Barter + Cash' : (barter_mode === 'barter_only' ? 'Barter Only' : 'Cash Only')}
                    </div>
                  </div>
                </div>
                {(experience_val || rate_yt_val > 0) && (
                  <div className="grid grid-cols-2 gap-3 text-center mt-3">
                    <div className="bg-[var(--bg-elevated)] p-3 rounded-xl border border-[var(--border-default)]">
                      <div className="text-xs text-[var(--text-secondary)]">YouTube Video</div>
                      <div className="font-mono text-sm font-extrabold text-[var(--green)] mt-1">
                        {rate_yt_val > 0 ? `₹${rate_yt_val.toLocaleString('en-IN')}` : "—"}
                      </div>
                    </div>
                    <div className="bg-[var(--bg-elevated)] p-3 rounded-xl border border-[var(--border-default)]">
                      <div className="text-xs text-[var(--text-secondary)]">Experience</div>
                      <div className="font-mono text-xs font-bold text-[var(--violet)] mt-1">
                        {experience_val || "—"}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Biography Section */}
            {bio_text && (
              <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-6">
                <h4 className="font-semibold text-xs text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Creator Biography &amp; About
                </h4>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed italic bg-[var(--bg-elevated)] p-4 rounded-xl border border-[var(--border-default)]">
                  "{bio_text}"
                </p>
              </div>
            )}

            {/* Tax & Identity Details Section */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-6">
              <h4 className="font-semibold text-xs text-purple-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Fingerprint className="w-4 h-4" /> Identity &amp; Taxation Details
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DataRow icon={<FileText />} label="PAN Number" value={pan_number} />
                {isCreator ? (
                  <DataRow icon={<Fingerprint />} label="Aadhaar Number" value={aadhaar_number} />
                ) : (
                  <DataRow icon={<Tag />} label="Incorporation Type" value={incorporation_type} />
                )}
                {gstin_number && gstin_number !== "N/A" && (
                  <DataRow icon={<Building2 />} label="GSTIN Number" value={gstin_number} />
                )}
              </div>
            </div>

            {/* Payout & Settlement Details Section */}
            {isCreator && (
              <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-6">
                <h4 className="font-semibold text-xs text-emerald-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" /> Payout &amp; Settlement Details
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <DataRow icon={<User />} label="Bank Account Holder" value={bank_holder} />
                  <DataRow icon={<Building2 />} label="Account Number" value={bank_acc} />
                  <DataRow icon={<FileText />} label="Bank IFSC Code" value={bank_ifsc} />
                  <DataRow icon={<CreditCard />} label="UPI ID / VPA Address" value={upi_id} />
                </div>
              </div>
            )}
          </div>

          {/* Document Previews Grid */}
          {filesList.length > 0 && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-6">
              <h4 className="font-semibold text-xs text-pink-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Submitted Identity Documents ({filesList.length})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filesList.map((file, idx) => {
                  // Session 40: KYC files live in a private bucket and the link saved at upload dies
                  // after 7 days, so the preview went blank. Open them through /api/media, which makes
                  // a fresh short link each time (staff only for KYC files).
                  const src = mediaHref(file.url);
                  const isExplicitPdf = String(file.url || "").toLowerCase().split("?")[0].endsWith('.pdf') || String(file.url || "").toLowerCase().includes('.pdf?');
                  return (
                  <div key={idx} className="border border-[var(--border-default)] rounded-xl overflow-hidden bg-[var(--bg-elevated)] flex flex-col h-64">
                    <div className="px-4 py-2 border-b border-[var(--border-default)] bg-[var(--bg-surface)] flex items-center justify-between">
                      <span className="text-xs font-bold text-[var(--text-primary)] truncate">{file.label}</span>
                      <a href={src} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-[10px] hover:underline flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                        Open <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                    <div 
                      className="flex-1 cursor-pointer group relative overflow-hidden flex items-center justify-center bg-black/40"
                      onClick={() => !isExplicitPdf ? setZoomedImage(src) : window.open(src, '_blank', 'noopener,noreferrer')}
                    >
                      {!isExplicitPdf ? (
                        <>
                          <img 
                            src={src} 
                            alt={file.label} 
                            className="max-w-full max-h-full object-contain opacity-80 group-hover:opacity-100 transition-opacity duration-300"
                            onError={(e) => {
                              // If it fails to load, it might be a PDF without extension.
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'none'; // hide zoom overlay
                              e.target.parentElement.insertAdjacentHTML('beforeend', '<div class="flex flex-col items-center justify-center text-[var(--text-secondary)] h-full w-full absolute inset-0"><svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mb-1 opacity-50 text-blue-400"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg><p class="text-[11px] font-semibold">Preview not available</p><span class="text-[10px] text-blue-400 mt-0.5 hover:underline">File missing or not an image. Click Open above</span></div>');
                            }} 
                          />
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <span className="bg-black/80 text-white px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1"><Eye className="w-3 h-3" /> Zoom</span>
                          </div>
                        </>
                      ) : (
                        // Session 40: show the PDF itself, not just an icon.
                        <iframe title={file.label} src={src} className="w-full h-full bg-white pointer-events-none" />
                      )}
                    </div>
                  </div>
                );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Actions */}
        <div className="space-y-6">
          {/* v419 (Ravi): the "Google search audit" was removed — it didn't really check anything */}

          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-6 lg:sticky lg:top-24">{/* v332: on phones it no longer sticks over the cards below */}
            <h3 className="font-display font-bold text-lg mb-6">Review Decision</h3>
            {!kycSubmitted(record) && record.status !== "APPROVED" ? (
              <div data-testid="kyc-not-submitted" className="rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-secondary)] leading-relaxed">
                <div className="font-bold text-[var(--text-primary)] mb-1">KYC not submitted yet</div>
                This {isCreator ? "creator" : "brand"} hasn't sent their {isCreator ? "PAN" : "documents"}, so there is nothing to approve. They'll show here again once they submit.
              </div>
            ) : (
            <div className="space-y-4">
              <button
                onClick={() => onReview(record.verification_id || record.id, record.type, "APPROVED")}
                disabled={record.status === "APPROVED" || reviewing} // v330
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${
                  record.status === "APPROVED" ? "bg-green-500/10 text-green-500 cursor-default" : "bg-green-500 hover:bg-green-600 text-black shadow-lg shadow-green-500/20"
                }`}
              >
                <CheckCircle2 className="w-5 h-5" />
                {record.status === "APPROVED" ? "Already Approved" : "Approve Application"}
              </button>

              <button
                onClick={() => setShowRejectBox(true)}
                disabled={record.status === "REJECTED"}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${
                  record.status === "REJECTED" ? "bg-red-500/10 text-red-500 cursor-default" : "bg-red-500/10 hover:bg-red-500/20 text-red-500"
                }`}
              >
                <XCircle className="w-5 h-5" />
                {record.status === "REJECTED" ? "Already Rejected" : "Reject Application"}
              </button>
            </div>
            )}

            <AnimatePresence>
              {showRejectBox && record.status !== "REJECTED" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-6 mt-6 border-t border-[var(--border-default)]">
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Rejection Reason</label>
                    <textarea
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      placeholder="Explain why this application is being rejected..."
                      className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-3 text-[16px] sm:text-sm focus:border-red-500 focus:outline-none min-h-[100px] resize-none"
                    />
                    <div className="flex gap-2 mt-3">
                      <button 
                        onClick={() => setShowRejectBox(false)}
                        className="flex-1 py-2 bg-[var(--bg-elevated)] hover:bg-foreground/5 text-sm font-medium rounded-lg"
                      >
                        Cancel
                      </button>
                      <button 
                        disabled={!rejectReason.trim() || reviewing} // v330
                        onClick={() => onReview(record.verification_id || record.id, record.type, "REJECTED", rejectReason)}
                        className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg disabled:opacity-50"
                      >
                        Confirm Rejection
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Full Onboarding Master Details Card on the Side */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-5 space-y-4">
            <h4 className="font-bold text-sm text-[var(--text-primary)] border-b border-[var(--border-default)] pb-2 flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-400" /> Full Onboarding Master Summary
            </h4>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-[var(--text-secondary)]">User Role</span>
                <span className="font-bold uppercase text-[var(--violet)]">{record.type}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-[var(--text-secondary)]">Contact Phone</span>
                <span className="font-bold text-[var(--text-primary)] select-all">{creator_phone}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-[var(--text-secondary)]">Date of Birth</span>
                <span className="font-bold text-[var(--text-primary)]">{creator_dob}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-[var(--text-secondary)]">Category / Niche</span>
                <span className="font-bold text-emerald-400">{niche_display}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-[var(--text-secondary)]">Social / Handle</span>
                <span className="font-bold text-blue-400">{social_handle}</span>
              </div>
              {isCreator && (
                <>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-[var(--text-secondary)]">Reel Rate</span>
                    <span className="font-bold text-[var(--green)]">
                      {rate_reel_val > 0 ? `₹${rate_reel_val.toLocaleString('en-IN')}` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-[var(--text-secondary)]">Story Rate</span>
                    <span className="font-bold text-[var(--green)]">
                      {rate_story_val > 0 ? `₹${rate_story_val.toLocaleString('en-IN')}` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-[var(--text-secondary)]">Main / UGC Rate</span>
                    <span className="font-bold text-blue-400">
                      {main_charges !== "N/A" ? main_charges : "—"}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-[var(--text-secondary)]">Location</span>
                <span className="font-bold text-[var(--text-primary)] truncate max-w-[140px]">{creator_state}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[var(--text-secondary)]">Submission Date</span>
                <span className="font-mono text-[var(--text-tertiary)] text-[11px]">{record.created_at ? new Date(record.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—"}{/* v330 */}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Image Zoom Modal */}
      <AnimatePresence>
        {zoomedImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
            onClick={() => setZoomedImage(null)}
          >
            <button onClick={() => setZoomedImage(null)} aria-label="Close" /* v332 */ className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors">
              <X className="w-6 h-6" />
            </button>
            <img src={zoomedImage} alt="KYC Document Zoom" className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" onError={(e) => {
              e.target.style.display = 'none';
              window.open(zoomedImage, '_blank', 'noopener,noreferrer');
              setZoomedImage(null);
            }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DataRow({ icon, label, value, href }) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-xl hover:bg-foreground/5 transition-colors">
      <div className="w-10 h-10 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-tertiary)] mb-0.5">{label}</div>
        {href ? (
          // v402 (Ravi): the Instagram handle opens the profile
          <a href={href} target="_blank" rel="noopener noreferrer" data-testid="kyc-social-link"
            className="font-mono text-sm break-all text-[var(--violet)] underline underline-offset-2 inline-flex items-center gap-1">{value}<ExternalLink className="w-3.5 h-3.5 shrink-0" /></a>
        ) : (
          <div className="font-mono text-sm break-all">{value}</div>
        )}{/* v332: long emails / links wrap on phones */}
      </div>
    </div>
  );
}

/** v402: a handle or link → the profile URL (Instagram by default, YouTube links as they are). Pure. */
export function socialProfileUrl(raw) {
  const s = String(raw || "").trim();
  if (!s || s === "—" || s === "-") return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^(www\.)?(instagram\.com|youtube\.com|youtu\.be)\//i.test(s)) return "https://" + s.replace(/^www\./i, "www.");
  const h = s.replace(/^@+/, "").split(/[/?#\s]/)[0];
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? `https://instagram.com/${h}` : "";
}

/** v402 (Ravi: "jinhone KYC apply hi nahi kiya unpe bhi Approve aa raha hai"): something was actually submitted. Pure. */
export function kycSubmitted(record) {
  const r = record || {};
  const docs = r.documents && typeof r.documents === "object" ? Object.values(r.documents).filter(Boolean) : [];
  return Boolean(String(r.pan_number || "").trim() || r.pan_doc_url || r.data?.pan_card_url || r.data?.pan_number
    || String(r.aadhaar_number || "").trim() || String(r.gst_number || "").trim() || r.doc_url || docs.length);
}
