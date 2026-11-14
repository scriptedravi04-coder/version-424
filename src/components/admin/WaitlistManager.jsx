import { motion, AnimatePresence } from "framer-motion";
import { safeArray } from "../../utils/safeFormat";
import React, { useState, useEffect } from 'react';
import { Search, CheckCircle2, XCircle, Users, CheckSquare, Square, ChevronDown, Building2, Mail, Phone, Calendar, ArrowLeft, ExternalLink, ShieldAlert, AlertTriangle, Trash2, RotateCcw, RefreshCw, MessageSquare, UserX, Link2, Pencil, MapPin, SlidersHorizontal } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import WaitlistEditModal from './WaitlistEditModal';
import WaitlistCsvImportModal from './WaitlistCsvImportModal';

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
import AdminInstagramBulkFetch from "./AdminInstagramBulkFetch"; // v354
import SocialLogo from "../common/SocialLogo"; // v364: real platform logos
import { KYCReviewPanel } from "./KYCManager"; // v419: View KYC opens right here

// v332: calm error text (never raw "Request failed with status code 500").
const calmError = (err, fallback) => {
  const m = err?.response?.data?.error || err?.response?.data?.detail;
  return typeof m === "string" && m && m.length < 160 ? m : fallback;
};
// v332: no photo used to render a broken-image icon with the name spilling out — show the initial instead.
function WlAvatar({ src, name, square, size = "w-10 h-10", text = "text-sm" }) {
  const [bad, setBad] = useState(false);
  const shape = square ? "rounded-xl" : "rounded-full";
  if (!src || bad) {
    return <div className={`${size} ${shape} shrink-0 border border-[var(--border-default)] bg-[var(--violet-soft)] text-[var(--violet)] font-bold ${text} flex items-center justify-center`} aria-hidden="true">{String(name || "?").trim().charAt(0).toUpperCase() || "?"}</div>;
  }
  return <img src={src} alt="" onError={() => setBad(true)} className={`${size} ${shape} shrink-0 border border-[var(--border-default)] object-cover bg-[var(--bg-elevated)]`} />;
}
const fmtFollowers = (n) => { const v = Number(n) || 0; return v >= 1000000 ? `${(v / 1000000).toFixed(1).replace(/\.0$/, '')}M` : v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(v); };

// v419 (Ravi): the handle under "Instagram" opens their profile straight from the list (new tab; the row's own click
// doesn't fire). YouTube-only applicants open their channel link when one is saved.
export function wlProfileUrl(item) {
  const raw = String(item?.handle || item?.social_handle || "").trim();
  const ig = String(item?.instagram_link || "").trim();
  const yt = String(item?.youtube_link || item?.youtube || "").trim();
  const isYtOnly = /youtube/i.test(String(item?.platform || "")) && !/instagram/i.test(String(item?.platform || ""));
  if (isYtOnly) return yt ? (/^https?:/i.test(yt) ? yt : `https://${yt}`) : "";
  if (/^https?:\/\//i.test(ig)) return ig;
  const h = raw.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "").trim();
  return h && /^[A-Za-z0-9._]{1,30}$/.test(h) ? `https://www.instagram.com/${h}/` : "";
}
/** v419 (Ravi): yellow tick = waiting, green = approved, red = rejected (replaces the "Pending" pill + red dot). */
function WlStatusTick({ status }) {
  const st = String(status || "Pending");
  const color = st === "Approved" ? "#16A34A" : st === "Rejected" ? "#DC2626" : "#F59E0B";
  return (
    <span title={st} aria-label={st} data-testid="wl-status-tick" className="inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0" style={{ background: color }}>
      {st === "Rejected" ? <XCircle size={11} color="#fff" strokeWidth={3} /> : <CheckCircle2 size={11} color="#fff" strokeWidth={3} />}
    </span>
  );
}
/** v419: each platform = its logo + the username as a link (Instagram profile / YouTube channel). */
function ytHandleOf(item) {
  const raw = String(item?.youtube_link || item?.youtube || "").trim();
  if (!raw) return null;
  const url = /^https?:/i.test(raw) ? raw : `https://${raw.replace(/^\/+/, "")}`;
  const m = raw.match(/youtube\.com\/(@[\w.-]+|c\/[\w.-]+|channel\/[\w-]+|user\/[\w.-]+)/i);
  const label = m ? m[1].replace(/^(c|user|channel)\//i, "") : raw.replace(/^https?:\/\/(www\.)?/i, "").slice(0, 28);
  return { url, label };
}
function WlPlatformLinks({ item }) {
  const plats = String(item?.platform || "").toLowerCase();
  const igUrl = wlProfileUrl({ ...item, platform: "Instagram" });
  const ig = /instagram/.test(plats) || igUrl ? igUrl : "";
  const yt = /youtube/.test(plats) || item?.youtube_link ? ytHandleOf(item) : null;
  const igName = String(item?.handle || "").replace(/^@/, "");
  const link = "text-xs text-[var(--violet)] font-mono hover:underline inline-flex items-center gap-1 min-w-0";
  return (
    <div className="flex flex-col gap-1 min-w-0" data-testid="wl-platforms">
      {(ig || igName) && (
        <div className="flex items-center gap-1.5 min-w-0">
          <SocialLogo platform="instagram" size={15} />
          {ig ? <a href={ig} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={link} data-testid="wl-handle-link"><span className="truncate">{igName || "profile"}</span><ExternalLink size={10} className="shrink-0" /></a>
            : <span className="text-xs font-mono text-[var(--text-secondary)] truncate">{igName}</span>}
        </div>
      )}
      {yt && (
        <div className="flex items-center gap-1.5 min-w-0">
          <SocialLogo platform="youtube" size={15} />
          <a href={yt.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={link} data-testid="wl-yt-link"><span className="truncate">{yt.label}</span><ExternalLink size={10} className="shrink-0" /></a>
        </div>
      )}
      {!ig && !igName && !yt && <span className="text-xs text-[var(--text-tertiary)]">{item?.platform || "—"}</span>}
    </div>
  );
}
/** v419: "female" | "male" | "" from whatever the form / profile saved (F, Female, woman, girl…). */
export const wlGender = (w) => { const g = String(w?.gender || "").trim().toLowerCase(); return /^(f|female|woman|girl)/.test(g) ? "female" : /^(m|male|man|boy)/.test(g) ? "male" : ""; };
export const kycWaiting = (w) => ["pending", "under_review", "submitted"].includes(String(w?.kyc_status || "").toLowerCase()); // v419
function WlHandleLink({ item }) {
  const url = wlProfileUrl(item);
  if (!url) return <div className="text-xs text-[var(--violet)] font-mono">{item.handle}</div>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} data-testid="wl-handle-link"
      className="text-xs text-[var(--violet)] font-mono hover:underline inline-flex items-center gap-1" title="Open profile">
      {item.handle || url}<ExternalLink size={10} />
    </a>
  );
}

// v373: what the waitlist knows about a row's Instagram and contact details (exported for tests)
export function waitlistIgState(w) {
  if (Number(w?.ig_followers) > 0) return "live";
  if (w?.ig_error || w?.instagram_fetch_error) return "failed";
  return "none";
}
const realEmail = (e) => { const v = String(e || "").trim().toLowerCase(); return v.includes("@") && !/@ybex\.io$|@placeholder|@example\.com$/.test(v) && !/^(unclaimed|noemail)_/.test(v); };
export function waitlistContacts(w) {
  const email = realEmail(w?.email);
  const mobile = String(w?.phone || w?.mobile || "").replace(/\D/g, "").length >= 10;
  const handle = Boolean(String(w?.handle || w?.social_handle || "").trim());
  return { email, mobile, username: handle && !email && !mobile };
}
export function waitlistOrder(a, b) {
  const rank = (w) => {
    const st = String(w?.status || "").toLowerCase();
    if (st === "pending") return { live: 0, none: 1, failed: 2 }[waitlistIgState(w)];
    return st === "approved" ? 3 : 4;
  };
  return rank(a) - rank(b) || (Number(b?.ig_followers) || 0) - (Number(a?.ig_followers) || 0);
}

/** v396: one group / chip of the Filters box. */
function WlGroup({ title, children, testId }) {
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-tertiary)]">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
function WlChip({ on, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer ${on ? 'bg-[var(--violet)] text-white border-[var(--violet)]' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-default)] hover:border-[var(--violet-border)]'}`}>
      {children}
    </button>
  );
}

/** v396 (Ravi: "kam followers wale bahut aa gaye, kisko rakhu confuse ho jata hu"): quick chips. Pure. */
export const WAITLIST_CHIPS = [
  ["all", "All"], ["1k", "1K+ followers"], ["10k", "10K+"], ["1l", "1 Lakh+"], ["under1k", "Under 1K"], ["nophoto", "No photo"],
  ["lowwork", "Below min · work shared"], // v397: creators below the follower minimum who sent a work link to the team
  ["app", "App sign-ups (ads)"], ["csv", "CSV import"], // v402 (Ravi): today's ad leads vs the 720 CSV leads
];
export const LOW_FOLLOWERS_SOURCE = "low_followers_work";
export const isLowFollowerWork = (w) => String(w?.source || "") === LOW_FOLLOWERS_SOURCE;
export const waitlistFollowers = (w) => Number(w?.ig_followers) || Number(w?.followers) || Number(w?.follower_count) || 0;
/** v402: where a row came from — "csv" (CSV import), "work" (under the follower minimum, shared a work link) or "app" (signed up). */
export const waitlistSourceKind = (w) => {
  const src = String(w?.source || "");
  if (src === "csv_import") return "csv";
  if (src === LOW_FOLLOWERS_SOURCE) return "work";
  if (src === "join_started") return "started"; // v408
  return "app";
};
/** v402 (Ravi: "CSV wale upar hi upar aa rahe hain, ads se aaye recent wale upar dikhao"): waiting first, newest first. */
export function waitlistNewestOrder(a, b) {
  const rank = (w) => ({ pending: 0, approved: 1 }[String(w?.status || "").toLowerCase()] ?? 2);
  return rank(a) - rank(b) || (new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime());
}
export const WAITLIST_SORTS = [["newest", "Newest first"], ["followers", "Most followers"]];

export function waitlistChipMatch(w, chip) {
  const f = waitlistFollowers(w);
  if (chip === "1k") return f >= 1000;
  if (chip === "10k") return f >= 10000;
  if (chip === "1l") return f >= 100000;
  if (chip === "under1k") return f < 1000;
  if (chip === "lowwork") return isLowFollowerWork(w);
  if (chip === "app") return waitlistSourceKind(w) === "app";
  if (chip === "csv") return waitlistSourceKind(w) === "csv";
  if (chip === "started") return waitlistSourceKind(w) === "started";
  if (chip === "nophoto") return !String(w?.profile_photo_url || w?.photo || w?.picture || w?.avatar_url || "").trim();
  return true;
}

/** v396: where an approved applicant went (server answer of /admin/waitlist/:id/approve). */
export function approvedWhere(ap) {
  if (ap?.shadowUserId) return "Approved — moved out of the waitlist to Users → Unclaimed Creators.";
  if (ap?.message && /already has a Ybex account/i.test(ap.message)) return "Approved — already registered, so they are in Users → Creators.";
  if (ap?.message === "Creator approved successfully") return "Approved — they are in Users → Creators and live on Explore.";
  if (ap?.message === "Brand approved successfully") return "Brand approved — they are in Users → Brands.";
  return "Application approved — moved out of the waitlist.";
}

export default function WaitlistManager({ onUpdate }) {
  const [csvOpen, setCsvOpen] = useState(false);
  const [waitlist, setWaitlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('creator'); // 'creator' | 'started' (v419) | 'brand' | 'rejected_bin'
  const isCreatorTab = activeTab === 'creator' || activeTab === 'started'; // v419: "Left sign-up" uses the creator table
  // v396: /admin?tab=waitlist&q=… (admin search / "Review in Waitlist") opens with that person searched
  const [searchTerm, setSearchTerm] = useState(() => { try { return new URLSearchParams(window.location.search).get("q") || ""; } catch { return ""; } });
  // v396 (Ravi): approved people leave the waitlist — they live in Users → Creators / Unclaimed Creators.
  // The list opens on Pending; "Approved" / "All" are still there to look back.
  const [statusFilter, setStatusFilter] = useState(() => { try { return new URLSearchParams(window.location.search).get("q") ? "All" : "Pending"; } catch { return "Pending"; } }); // "All", "Pending", "Approved", "Rejected"
  // v373 (Ravi: "700 mein se live wale dhoondhne padte hain"): Instagram + contact filters
  const [igFilter, setIgFilter] = useState("All"); // All | live | failed | none
  const [quickChip, setQuickChip] = useState("all"); // v396 (Ravi): followers / photo quick chips
  const [sortBy, setSortBy] = useState("newest"); // v402: newest sign-ups (ads) on top by default
  const [photoAskBusy, setPhotoAskBusy] = useState(false);
  // v402: "Ask for photo" → bell + phone notice to these creators (POST /admin/waitlist/photo-nudge)
  const askForPhoto = async (ids) => {
    const list = Array.from(new Set((ids || []).filter(Boolean)));
    if (!list.length || photoAskBusy) return;
    setPhotoAskBusy(true);
    try {
      const { data } = await api.post('admin/waitlist/photo-nudge', { ids: list });
      const n = Number(data?.sent || 0);
      if (n) toast.success(`Asked ${n} creator${n === 1 ? '' : 's'} to add a photo.`);
      else toast.message("None of them has an account yet, so there's no one to notify.");
    } catch (e) {
      toast.error(e?.response?.data?.error || "Couldn't send just now. Please try again.");
    } finally { setPhotoAskBusy(false); }
  };
  const [filtersOpen, setFiltersOpen] = useState(false); // v396: one Filters box
  const [showHelp, setShowHelp] = useState(false);
  const [genderFilter, setGenderFilter] = useState("All"); // v419 (Ravi): All | female | male
  const [kycFilter, setKycFilter] = useState("All"); // v419 (Ravi): All | submitted — "KYC submitted" view approves both at once
  const [contactFilter, setContactFilter] = useState("All"); // All | username | email | mobile
  const [platformFilter, setPlatformFilter] = useState("All"); // For creators: "All", "Instagram", "YouTube"
  const [categoryFilter, setCategoryFilter] = useState("All"); // For brands/creators category
  
  const [selectedIds, setSelectedIds] = useState([]);
  const [rejectModalId, setRejectModalId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [customRejectReason, setCustomRejectReason] = useState("");
  const [selectedItemDetails, setSelectedItemDetails] = useState(null);
  // v419 (Ravi: "naya tab mat khol, maza nahi aaya"): the KYC review opens on top of the waitlist page, same screen.
  const [kycView, setKycView] = useState(null); // { loading } | { record } | { missing }
  const [kycBusy, setKycBusy] = useState(false);
  const [editingWaitlistItem, setEditingWaitlistItem] = useState(null);

  // States for animations and dashboard messages
  const [actionAnimType, setActionAnimType] = useState(null); // 'approved' or 'rejected'
  const [isAnimActive, setIsAnimActive] = useState(false);
  const [messageModalItem, setMessageModalItem] = useState(null);
  const [panelMessageText, setPanelMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [actionBusy, setActionBusy] = useState(false); // v330: no double approve (each approve sends an email)
  const [loadError, setLoadError] = useState(false); // v330: failed load is not an empty waitlist
  const [batchRejectProgress, setBatchRejectProgress] = useState(null); // v330: { done, total } while batch reject runs

  useEffect(() => {
    fetchWaitlist();
  }, []);

  const fetchWaitlist = async () => {
    try {
      setLoadError(false); // v330
      const res = await api.get('admin/waitlist');
      setWaitlist(res.data || []);
      return true; // v330
    } catch (err) {
      console.error("Error loading waitlist:", err);
      setLoadError(true); // v330
      toast.error(calmError(err, "Couldn't load the waitlist. Please try again.")); // v332
      return false; // v330
    } finally {
      setLoading(false);
    }
  };

  // Helper to normalize items
  const normalizedWaitlist = waitlist.map(w => {
    const isBrand = w.role === 'brand' || !!w.company_name;
    return {
      ...w,
      role: isBrand ? 'brand' : 'creator'
    };
  });

  // KPI Calculations
  // v419 (Ravi: "same naam ke do creator dikh rahe hain"): people who checked their Instagram on Join and left without
  // making an account have their own "Left sign-up" list — they never sit in Creators next to a real account.
  const isStartedRow = (w) => waitlistSourceKind(w) === 'started';
  const pendingCreatorsCount = normalizedWaitlist.filter(w => w.role === 'creator' && w.status === 'Pending' && !isStartedRow(w)).length;
  const startedCount = normalizedWaitlist.filter(w => isStartedRow(w) && w.status === 'Pending').length;
  const pendingBrandsCount = normalizedWaitlist.filter(w => w.role === 'brand' && w.status === 'Pending').length;
  
  const approvedCount = normalizedWaitlist.filter(w => w.status === 'Approved').length;
  const rejectedCount = normalizedWaitlist.filter(w => w.status === 'Rejected').length;

  // v419 (Ravi: "waitlist se hi KYC bhi approve ho jaye"): approve the KYC from the same place (the KYC screen stays too).
  const openKycOf = async (item) => {
    const uid = String(item?.user_id || "");
    if (!uid) return;
    setKycView({ loading: true });
    try {
      const { data } = await api.get("admin/verifications", { bypassCache: true });
      const rec = (Array.isArray(data) ? data : []).find((r) => [r?.creator_id, r?.user_id, r?.brand_id].map(String).includes(uid));
      setKycView(rec ? { record: rec } : { missing: true });
    } catch (e) { setKycView(null); toast.error(calmError(e, "Couldn't open the KYC. Please try again.")); }
  };
  const reviewKyc = async (id, _type, status, reason = "") => {
    if (kycBusy) return;
    setKycBusy(true);
    try {
      await api.post(`/admin/verifications/${encodeURIComponent(id)}/${String(status).toUpperCase() === "APPROVED" ? "approve" : "reject"}`, { note: reason });
      const uid = String(kycView?.record?.creator_id || kycView?.record?.user_id || "");
      const st = String(status).toUpperCase() === "APPROVED" ? "approved" : "rejected";
      setWaitlist(prev => prev.map(w => String(w.user_id) === uid ? { ...w, kyc_status: st } : w));
      setSelectedItemDetails(prev => (prev && String(prev.user_id) === uid ? { ...prev, kyc_status: st } : prev));
      toast.success(st === "approved" ? "KYC approved" : "KYC rejected");
      setKycView(null);
    } catch (e) { toast.error(calmError(e, "Couldn't save the KYC decision. Please try again.")); }
    finally { setKycBusy(false); }
  };
  const approveKycOf = async (item) => {
    const uid = String(item?.user_id || "");
    if (!uid) return false;
    try {
      await api.post(`/admin/verifications/${encodeURIComponent(uid)}/approve`, { note: "Approved from Waitlist" });
      setWaitlist(prev => prev.map(w => String(w.user_id) === uid ? { ...w, kyc_status: "approved" } : w));
      setSelectedItemDetails(prev => (prev && String(prev.user_id) === uid ? { ...prev, kyc_status: "approved" } : prev));
      toast.success("KYC approved");
      return true;
    } catch (err) {
      toast.error(calmError(err, "Couldn't approve the KYC. Please try again from KYC checks."));
      return false;
    }
  };
  // v419 (Ravi: "KYC submitted" filter → one Approve does the waitlist and the KYC together)
  const approveBoth = async (item) => { await handleApprove(item.id); await approveKycOf(item); };
  const handleApprove = async (id) => {
    if (actionBusy) return; // v330
    setActionBusy(true);
    try {
      const { data: ap } = await api.post(`/admin/waitlist/${id}/approve`);
      // v330: celebrate only after the server saved it (confetti used to fire before, even on failure)
      setActionAnimType('approved');
      setIsAnimActive(true);
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.4 } });
      setWaitlist(prev => prev.map(w => w.id === id ? { ...w, status: "Approved" } : w));
      setSelectedIds(prev => prev.filter(i => i !== id));
      if (selectedItemDetails && selectedItemDetails.id === id) {
        setSelectedItemDetails(prev => ({ ...prev, status: "Approved" }));
      }
      onUpdate?.();
      toast.success(approvedWhere(ap)); // v396: says where the creator went

      setTimeout(() => {
        setIsAnimActive(false);
        setActionAnimType(null);
      }, 1500);
    } catch (err) {
      console.error(err);
      toast.error(calmError(err, "Couldn't approve. Please try again.")); // v332
      setIsAnimActive(false);
      setActionAnimType(null);
    } finally {
      setActionBusy(false); // v330
    }
  };

  const handleReject = async (id, finalReason) => {
    if (actionBusy) return; // v330
    setActionBusy(true);
    try {
      setActionAnimType('rejected');
      setIsAnimActive(true);

      const { data: rej } = await api.post(`/admin/waitlist/${id}/reject`, { reason: finalReason });
      setWaitlist(prev => prev.map(w => w.id === id ? { ...w, status: "Rejected", rejectReason: finalReason } : w));
      setSelectedIds(prev => prev.filter(i => i !== id));
      if (selectedItemDetails && selectedItemDetails.id === id) {
        setSelectedItemDetails(prev => ({ ...prev, status: "Rejected", rejectReason: finalReason }));
      }
      setRejectModalId(null);
      setRejectReason("");
      setCustomRejectReason("");
      const hasEmail = Boolean(String(waitlist.find((w) => w.id === id)?.email || "").trim()); // v365: CSV rows may have no email
      toast.success(rej?.emailed ? "Application rejected. Email with the reason sent." : !hasEmail ? "Application rejected. This row has no email, so no message was sent." : "Application rejected. The email could not be sent (email service is not set up)." /* v332: plain words */);

      setTimeout(() => {
        setIsAnimActive(false);
        setActionAnimType(null);
      }, 1500);
    } catch (err) {
      console.error(err);
      toast.error(calmError(err, "Couldn't reject. Please try again.")); // v332
      setIsAnimActive(false);
      setActionAnimType(null);
    } finally {
      setActionBusy(false); // v330
    }
  };

  const handleRestoreApprove = async (id) => {
    if (actionBusy) return; // v330
    if (!window.confirm("Approve this applicant from the Rejected Bin? They get an approval email.")) return; // v332: one tap used to approve + email
    setActionBusy(true);
    try {
      const { data: ap } = await api.post(`/admin/waitlist/${id}/approve`);
      setWaitlist(prev => prev.map(w => w.id === id ? { ...w, status: "Approved" } : w));
      setSelectedIds(prev => prev.filter(i => i !== id));
      onUpdate?.();
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      toast.success(approvedWhere(ap)); // v396
    } catch (err) {
      console.error(err);
      toast.error(calmError(err, "Couldn't re-approve. Please try again.")); // v332
    } finally {
      setActionBusy(false); // v330
    }
  };

  const batchApprove = async () => {
    if (!selectedIds.length || actionBusy) return;
    // v330: approving sends an email to every selected applicant — ask first
    if (!window.confirm(`Approve ${selectedIds.length} selected application${selectedIds.length === 1 ? "" : "s"} and send approval emails?`)) return;
    setActionBusy(true);
    try {
      // Session 34: the server answers per row — only the ones that really saved are marked approved.
      const { data } = await api.post('admin/waitlist/batch-approve', { ids: selectedIds });
      const okIds = (data?.results || []).filter(r => r.ok).map(r => r.id);
      setWaitlist(prev => prev.map(w => okIds.includes(w.id) ? { ...w, status: "Approved" } : w));
      setSelectedIds(prev => prev.filter(i => !okIds.includes(i)));
      onUpdate?.();
      if (data?.failed) {
        const firstErr = (data.results || []).find(r => !r.ok)?.error;
        toast.error(`Approved ${data.approved}, failed ${data.failed}${firstErr ? ` — ${firstErr}` : ""}`);
      } else {
        { const n = data?.approved ?? okIds.length; const ok = (data?.results || []).filter(r => r.ok); const unclaimed = ok.filter(r => r.shadowUserId).length; toast.success(`Approved ${n} application${n === 1 ? "" : "s"} — moved out of the waitlist: ${unclaimed} to Users → Unclaimed Creators, ${ok.length - unclaimed} already registered (Users → Creators).`); } // v332: "1 profiles"
      }
    } catch (err) {
      console.error(err);
      toast.error(calmError(err, "Couldn't approve the selected applications. Please try again.")); // v332
    } finally {
      setActionBusy(false); // v330
    }
  };

  // v330: batch reject, for real — each selected applicant goes through the same single-reject call
  // (same route, same body), one at a time so emails don't go out in a burst.
  const batchRejectTargets = () => {
    const rejectedIds = new Set(waitlist.filter(w => w.status === 'Rejected').map(w => w.id));
    return selectedIds.filter(id => !rejectedIds.has(id)); // skip rows already rejected
  };

  const openBatchReject = () => {
    if (actionBusy) return;
    const ids = batchRejectTargets();
    if (!ids.length) { toast.error("All selected applicants are already rejected."); return; }
    if (!window.confirm(`Reject ${ids.length} applicant${ids.length === 1 ? "" : "s"}? Each one gets a rejection email.`)) return;
    setRejectModalId("batch");
    setRejectReason("");
    setCustomRejectReason("");
  };

  const batchReject = async (finalReason) => {
    if (actionBusy) return;
    const ids = batchRejectTargets();
    setRejectModalId(null);
    setRejectReason("");
    setCustomRejectReason("");
    if (!ids.length) return;
    setActionBusy(true);
    let ok = 0, notEmailed = 0;
    const failed = [];
    try {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        setBatchRejectProgress({ done: i + 1, total: ids.length });
        try {
          const { data: rej } = await api.post(`/admin/waitlist/${id}/reject`, { reason: finalReason });
          ok++;
          if (!rej?.emailed) notEmailed++;
          setWaitlist(prev => prev.map(w => w.id === id ? { ...w, status: "Rejected", rejectReason: finalReason } : w));
          setSelectedIds(prev => prev.filter(x => x !== id)); // failed ones stay selected for a retry
          setSelectedItemDetails(prev => (prev && prev.id === id ? { ...prev, status: "Rejected", rejectReason: finalReason } : prev));
        } catch (err) {
          console.error(err);
          failed.push(calmError(err, "Couldn't reject")); // v332
        }
      }
    } finally {
      setBatchRejectProgress(null);
      setActionBusy(false);
    }
    if (ok) onUpdate?.();
    const emailNote = notEmailed ? ` (${notEmailed} email${notEmailed === 1 ? "" : "s"} not sent — email service is not set up)` /* v332 */ : "";
    if (failed.length) {
      toast.error(`Rejected ${ok} · ${failed.length} failed${failed[0] ? ` — ${failed[0]}` : ""}${emailNote}`);
    } else {
      toast.success(`Rejected ${ok}${emailNote}`);
    }
  };

  const toggleSelect = (e, id) => {
    e.stopPropagation();
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = (itemsOnPage) => {
    const pendingOnPage = itemsOnPage.filter(w => w.status === 'Pending').map(w => w.id);
    const allSelected = pendingOnPage.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !pendingOnPage.includes(id)));
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...pendingOnPage])]);
    }
  };

  // Filtering waitlist based on tab, search, and filters
  const filteredItems = normalizedWaitlist.filter(w => {
    if (activeTab === 'rejected_bin') {
      if (w.status !== 'Rejected') return false;
      const searchString = searchTerm.toLowerCase();
      return (
        (w.name || '').toLowerCase().includes(searchString) ||
        (w.email || '').toLowerCase().includes(searchString) ||
        (w.handle || '').toLowerCase().includes(searchString) ||
        (w.company_name || '').toLowerCase().includes(searchString) ||
        (w.phone || w.mobile || '').toLowerCase().includes(searchString)
      );
    }

    if (w.role !== (activeTab === 'started' ? 'creator' : activeTab)) return false;
    if ((activeTab === 'started') !== isStartedRow(w)) return false; // v419

    // Search filter
    const searchString = searchTerm.toLowerCase();
    const matchesSearch = 
      (w.name || '').toLowerCase().includes(searchString) ||
      (w.email || '').toLowerCase().includes(searchString) ||
      (w.handle || '').toLowerCase().includes(searchString) ||
      (w.company_name || '').toLowerCase().includes(searchString) ||
      (w.phone || w.mobile || '').toLowerCase().includes(searchString);

    // Status filter
    const matchesStatus = statusFilter === "All" || w.status === statusFilter;

    // Platform filter (Creators only)
    // Session 40: a creator can be "Instagram · YouTube" — both filters show them.
    const matchesPlatform = activeTab === 'brand' || platformFilter === "All" || String(w.platform || "").split("·").map(p => p.trim()).includes(platformFilter);

    // Category filter
    const matchesCategory = categoryFilter === "All" || (w.category || '').toLowerCase().includes(categoryFilter.toLowerCase());

    const matchesIg = activeTab !== 'creator' || igFilter === "All" || waitlistIgState(w) === igFilter;
    const matchesContact = contactFilter === "All" || waitlistContacts(w)[contactFilter];
    if (kycFilter === "submitted" && !kycWaiting(w)) return false; // v419
    if (genderFilter !== "All" && wlGender(w) !== genderFilter) return false; // v419
    const matchesChip = activeTab !== 'creator' || waitlistChipMatch(w, quickChip); // v396

    return matchesSearch && matchesStatus && matchesPlatform && matchesCategory && matchesIg && matchesContact && matchesChip;
  });
  // v373: pending + Instagram live on top (most followers first) → pending not fetched → pending private / failed →
  // approved → rejected. Approving one moves it down at once.
  if (isCreatorTab) filteredItems.sort(sortBy === 'followers' ? waitlistOrder : waitlistNewestOrder); // v402
  const tabRows = normalizedWaitlist.filter((w) => (activeTab === 'started' ? isStartedRow(w) : w.role === activeTab && !isStartedRow(w)));
  // v396: the filters that are on (for the badge and the removable chips)
  const chipLabel = Object.fromEntries(WAITLIST_CHIPS);
  const activeFilterChips = [
    statusFilter !== 'Pending' && { key: 'status', label: statusFilter === 'All' ? 'All statuses' : statusFilter, clear: () => setStatusFilter('Pending') },
    quickChip !== 'all' && { key: 'chip', label: chipLabel[quickChip] || quickChip, clear: () => setQuickChip('all') },
    igFilter !== 'All' && { key: 'ig', label: ({ live: 'Instagram live', failed: 'Private / failed', none: 'Not fetched' })[igFilter] || igFilter, clear: () => setIgFilter('All') },
    genderFilter !== 'All' && { key: 'gender', label: genderFilter === 'female' ? 'Female' : 'Male', clear: () => setGenderFilter('All') },
    kycFilter !== 'All' && { key: 'kyc', label: 'KYC submitted', clear: () => setKycFilter('All') },
    contactFilter !== 'All' && { key: 'contact', label: ({ email: 'Has email', mobile: 'Has mobile', username: 'Username only' })[contactFilter] || contactFilter, clear: () => setContactFilter('All') },
    platformFilter !== 'All' && { key: 'platform', label: platformFilter, clear: () => setPlatformFilter('All') },
    categoryFilter !== 'All' && { key: 'cat', label: categoryFilter, clear: () => setCategoryFilter('All') },
  ].filter(Boolean);
  const activeFilterCount = activeFilterChips.length;
  const clearWaitlistFilters = () => { setGenderFilter('All'); setKycFilter('All'); setStatusFilter('Pending'); setQuickChip('all'); setIgFilter('All'); setContactFilter('All'); setPlatformFilter('All'); setCategoryFilter('All'); };
  const igCounts = { live: 0, failed: 0, none: 0 };
  const contactCounts = { username: 0, email: 0, mobile: 0 };
  for (const w of tabRows) { igCounts[waitlistIgState(w)]++; const c = waitlistContacts(w); for (const k of Object.keys(contactCounts)) if (c[k]) contactCounts[k]++; }

  // Get unique categories for filters based on active tab
  const categoriesList = Array.from(
    new Set(
      normalizedWaitlist
        .filter(w => w.role === activeTab && w.category)
        .map(w => w.category)
    )
  );

  return (
    <div className="space-y-6 w-full animate-in fade-in duration-200">
      {kycView && ( /* v419: KYC review on top of the waitlist — Back returns to the same creator */
        <div className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-[2px] flex items-stretch sm:items-center justify-center sm:p-6" data-testid="wl-kyc-overlay" onClick={() => !kycBusy && setKycView(null)}>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} onClick={(e) => e.stopPropagation()}
            className="bg-[var(--bg-primary,#F7F7FA)] w-full sm:max-w-5xl sm:rounded-2xl overflow-y-auto max-h-full sm:max-h-[92vh] p-4 sm:p-6 shadow-2xl">
            {kycView.loading ? <div className="py-20 text-center text-sm text-[var(--text-tertiary)]">Loading KYC…</div>
              : kycView.missing ? (
                <div className="py-16 text-center space-y-3">
                  <p className="text-sm text-[var(--text-secondary)]">No KYC found for this creator yet.</p>
                  <button type="button" onClick={() => setKycView(null)} className="px-4 py-2 rounded-xl border border-[var(--border-default)] text-sm font-semibold cursor-pointer">Back</button>
                </div>
              ) : <KYCReviewPanel record={kycView.record} onBack={() => setKycView(null)} onReview={reviewKyc} reviewing={kycBusy} />}
          </motion.div>
        </div>
      )}
      {!selectedItemDetails ? (
        <>
          {/* Page Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
            <div>
              <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Waitlist Manager</h2>
              <p className="text-sm text-gray-500 font-medium mt-1">Review and approve creators and brands.</p>
            </div>
            <div className="flex items-start gap-2">{/* v419: small Fetch IG + tick next to Upload CSV */}
              <AdminInstagramBulkFetch onProgress={() => fetchWaitlist()} />
              <button
                onClick={() => setCsvOpen(true)}
                className="h-9 px-4 rounded-xl bg-[var(--violet)] text-white text-sm font-semibold"
                data-testid="waitlist-upload-csv"
              >
                Upload CSV
              </button>
            </div>
          </div>
          <WaitlistCsvImportModal open={csvOpen} onClose={() => setCsvOpen(false)} onImported={() => { fetchWaitlist(); onUpdate?.(); }} />

          {/* v396 (Ravi: "UX theek kar — ek hi Filters box, aur upar ke bade boxes"): one compact strip — the three lists
              with their counts (was 4 big KPI boxes + a separate tab row), one search + one Filters button that opens every
              filter, active filters shown as removable chips. Same filters and logic as before. */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-3 sm:p-4 flex flex-col gap-3" data-testid="waitlist-toolbar">
            <div className="flex items-center gap-2 overflow-x-auto sm:flex-wrap -mx-1 px-1 pb-0.5">
              {[
                ['creator', 'Creators', pendingCreatorsCount, 'waiting', 'violet'],
                ['brand', 'Brands', pendingBrandsCount, 'waiting', 'violet'],
                ['started', 'Left sign-up', startedCount, '', 'violet'],
                ['rejected_bin', 'Rejected bin', rejectedCount, '', 'red'],
              ].map(([id, label, n, word, tone]) => {
                const on = activeTab === id;
                return (
                  <button key={id} type="button" data-testid={`wl-tab-${id}`}
                    onClick={() => { setActiveTab(id); setSelectedIds([]); setCategoryFilter("All"); setQuickChip("all"); }}
                    className={`h-10 px-4 rounded-xl text-sm font-bold flex items-center gap-2 cursor-pointer whitespace-nowrap border transition-colors ${on
                      ? (tone === 'red' ? 'bg-red-50 text-[var(--red)] border-red-200' : 'bg-[var(--violet-soft)] text-[var(--violet)] border-[var(--violet-border)]')
                      : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-default)] hover:text-[var(--text-primary)]'}`}>
                    {id === 'brand' ? <Building2 size={15} /> : id === 'started' ? <UserX size={15} /> : id === 'rejected_bin' ? <Trash2 size={15} /> : <Users size={15} />}
                    {label}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${tone === 'red' ? 'bg-[var(--red)] text-white' : on ? 'bg-[var(--violet)] text-white' : 'bg-[var(--border-default)] text-[var(--text-primary)]'}`}>
                      {loading && !waitlist.length ? '…' : n}{word ? ` ${word}` : ''}
                    </span>
                  </button>
                );
              })}
              <span className="ml-auto text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5 whitespace-nowrap shrink-0">
                <CheckCircle2 size={14} className="text-[var(--green)]" />{loading && !waitlist.length ? '…' : approvedCount} approved so far
                <button type="button" onClick={() => setShowHelp((v) => !v)} aria-expanded={showHelp} className="ml-2 underline decoration-dotted cursor-pointer text-[var(--violet)]">How approval works</button>
              </span>
            </div>

            {showHelp && (
              <div className="text-xs font-semibold text-[var(--text-secondary)] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl px-3 py-2 leading-relaxed" data-testid="wl-help">
                <b className="text-[var(--green)]">Approve</b> = live on Explore with a public profile. <b className="text-[var(--red)]">Reject</b> = they keep their account and can use the app, but never show on Explore (approve later from Rejected bin). This is the only place to decide — Users → Creators just shows each creator's status.
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={16} />
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={isCreatorTab ? "Search name, @handle, email or phone…" : activeTab === 'brand' ? "Search brand or company…" : "Search rejected applicants…"}
                  className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl focus:border-[var(--violet)] focus:outline-none text-[16px] sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]" />
              </div>
              {activeTab !== 'rejected_bin' && (
                <button type="button" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen} data-testid="wl-filters-btn"
                  className={`h-[42px] px-4 rounded-xl border text-sm font-bold flex items-center gap-2 cursor-pointer ${filtersOpen || activeFilterCount ? 'bg-[var(--violet-soft)] border-[var(--violet-border)] text-[var(--violet)]' : 'bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-secondary)]'}`}>
                  <SlidersHorizontal size={15} />Filters
                  {activeFilterCount > 0 && <span className="w-5 h-5 rounded-full bg-[var(--violet)] text-white text-[11px] font-black flex items-center justify-center">{activeFilterCount}</span>}
                  <ChevronDown size={14} className={`transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
                </button>
              )}
              <button type="button" title="Refresh waitlist" aria-label="Refresh waitlist" disabled={loading}
                onClick={async () => { setLoading(true); if (await fetchWaitlist()) toast.success("Waitlist data refreshed!"); }}
                className="h-[42px] w-[42px] rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--violet)] cursor-pointer disabled:opacity-50">
                <RefreshCw size={15} className={loading ? "animate-spin text-[var(--violet)]" : ""} />
              </button>
            </div>

            {filtersOpen && activeTab !== 'rejected_bin' && (
              <div className="border border-[var(--border-default)] rounded-2xl p-4 flex flex-col gap-4 bg-white" data-testid="wl-filter-panel">
                <WlGroup title="Status">
                  {[['Pending', 'Waiting'], ['Approved', 'Approved (moved to Users)'], ['Rejected', 'Rejected'], ['All', 'All']].map(([v, l]) => (
                    <WlChip key={v} on={statusFilter === v} onClick={() => setStatusFilter(v)}>{l}</WlChip>
                  ))}
                </WlGroup>
                {isCreatorTab && (
                  <WlGroup title="Sort" testId="wl-sort">
                    {WAITLIST_SORTS.map(([k, label]) => <WlChip key={k} on={sortBy === k} onClick={() => setSortBy(k)}>{label}</WlChip>)}
                  </WlGroup>
                )}
                {isCreatorTab && (
                  <WlGroup title="Followers & photo">
                    {WAITLIST_CHIPS.map(([k, label]) => {
                      const n = k === 'all' ? null : tabRows.filter((w) => w.status === 'Pending' && waitlistChipMatch(w, k)).length;
                      return <WlChip key={k} on={quickChip === k} onClick={() => setQuickChip(k)}>{label}{n != null ? ` · ${n}` : ''}</WlChip>;
                    })}
                  </WlGroup>
                )}
                {isCreatorTab && (
                  <div data-testid="wl-ig-filter"><WlGroup title="Instagram">
                    {[['All', 'Any'], ['live', `Live numbers · ${igCounts.live}`], ['failed', `Private / failed · ${igCounts.failed}`], ['none', `Not fetched yet · ${igCounts.none}`]].map(([v, l]) => (
                      <WlChip key={v} on={igFilter === v} onClick={() => setIgFilter(v)}>{l}</WlChip>
                    ))}
                  </WlGroup></div>
                )}
                {isCreatorTab && (
                  <div data-testid="wl-gender-filter"><WlGroup title="Gender">
                    {[['All', 'Any'], ['female', `Female · ${tabRows.filter((w) => wlGender(w) === 'female').length}`], ['male', `Male · ${tabRows.filter((w) => wlGender(w) === 'male').length}`]].map(([v, l]) => (
                      <WlChip key={v} on={genderFilter === v} onClick={() => setGenderFilter(v)}>{l}</WlChip>
                    ))}
                  </WlGroup></div>
                )}
                {isCreatorTab && (
                  <div data-testid="wl-kyc-filter"><WlGroup title="KYC">
                    {[['All', 'Any'], ['submitted', `KYC submitted · ${tabRows.filter(kycWaiting).length}`]].map(([v, l]) => (
                      <WlChip key={v} on={kycFilter === v} onClick={() => setKycFilter(v)}>{l}</WlChip>
                    ))}
                  </WlGroup></div>
                )}
                <div data-testid="wl-contact-filter"><WlGroup title="Contact">
                  {[['All', 'Any'], ['email', `Has email · ${contactCounts.email}`], ['mobile', `Has mobile · ${contactCounts.mobile}`], ['username', `Username only · ${contactCounts.username}`]].map(([v, l]) => (
                    <WlChip key={v} on={contactFilter === v} onClick={() => setContactFilter(v)}>{l}</WlChip>
                  ))}
                </WlGroup></div>
                {isCreatorTab && (
                  <WlGroup title="Platform">
                    {[['All', 'Any'], ['Instagram', 'Instagram'], ['YouTube', 'YouTube']].map(([v, l]) => (
                      <WlChip key={v} on={platformFilter === v} onClick={() => setPlatformFilter(v)}>{l}</WlChip>
                    ))}
                  </WlGroup>
                )}
                {categoriesList.length > 0 && (
                  <WlGroup title="Category">
                    <WlChip on={categoryFilter === 'All'} onClick={() => setCategoryFilter('All')}>Any</WlChip>
                    {categoriesList.slice(0, 30).map((cat) => <WlChip key={cat} on={categoryFilter === cat} onClick={() => setCategoryFilter(cat)}>{cat}</WlChip>)}
                  </WlGroup>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-[var(--border-default)]">
                  <button type="button" onClick={clearWaitlistFilters} className="text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--red)] cursor-pointer">Clear all</button>
                  <button type="button" onClick={() => setFiltersOpen(false)} data-testid="wl-filters-done" className="px-5 py-2 rounded-xl text-sm font-extrabold text-white bg-[var(--violet)] cursor-pointer">Show {filteredItems.length} {filteredItems.length === 1 ? 'person' : 'people'}</button>
                </div>
              </div>
            )}

            {!filtersOpen && activeFilterCount > 0 && activeTab !== 'rejected_bin' && (
              <div className="flex flex-wrap items-center gap-2" data-testid="wl-active-filters">
                {activeFilterChips.map((c) => (
                  <button key={c.key} type="button" onClick={c.clear} className="px-2.5 py-1 rounded-full text-xs font-bold bg-[var(--violet-soft)] text-[var(--violet)] border border-[var(--violet-border)] flex items-center gap-1 cursor-pointer" aria-label={`Remove filter ${c.label}`}>
                    {c.label}<XCircle size={12} />
                  </button>
                ))}
                <button type="button" onClick={clearWaitlistFilters} className="text-xs font-bold text-[var(--text-secondary)] underline cursor-pointer">Clear all</button>
              </div>
            )}

            {/* v402 (Ravi): photo matters — approved creators show on Explore. Bell + phone notice, no e-mail. */}
            {isCreatorTab && quickChip === 'nophoto' && filteredItems.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--violet-border)] bg-[var(--violet-soft)] px-4 py-3" data-testid="wl-ask-photo-bar">
                <span className="text-sm font-semibold text-[var(--text-primary)] mr-auto">{filteredItems.length} creator{filteredItems.length === 1 ? '' : 's'} without a photo</span>
                <button type="button" disabled={photoAskBusy} onClick={() => askForPhoto(filteredItems.map((w) => w.user_id || w.id))} data-testid="wl-ask-photo-all"
                  className="disabled:opacity-50 px-4 py-2 bg-[var(--violet)] text-white rounded-xl text-sm font-bold cursor-pointer">
                  {photoAskBusy ? 'Sending…' : '📸 Ask them to add a photo'}
                </button>
              </div>
            )}

            {selectedIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 justify-end border-t border-[var(--border-default)] pt-3">
                <span className="text-sm text-[var(--text-secondary)] font-medium mr-auto">{selectedIds.length} selected</span>
                {isCreatorTab && (
                  <button type="button" disabled={photoAskBusy} onClick={() => askForPhoto(selectedIds)} data-testid="wl-ask-photo-selected"
                    className="disabled:opacity-50 px-4 py-2 border border-[var(--violet)]/30 text-[var(--violet)] hover:bg-[var(--violet-soft)] rounded-xl text-sm font-semibold cursor-pointer">
                    📸 Ask for photo
                  </button>
                )}
                <button onClick={openBatchReject} disabled={actionBusy}
                  className="disabled:opacity-50 px-4 py-2 border border-[var(--red)]/30 text-[var(--red)] hover:bg-red-50 rounded-xl text-sm font-semibold transition-colors cursor-pointer">
                  {batchRejectProgress ? `Rejecting ${batchRejectProgress.done} of ${batchRejectProgress.total}…` : "Reject Selected"}
                </button>
                <button onClick={batchApprove} disabled={actionBusy}
                  className="disabled:opacity-50 px-4 py-2 bg-[var(--green)] hover:opacity-90 text-white font-semibold rounded-xl text-sm transition-colors cursor-pointer">
                  Approve Selected
                </button>
              </div>
            )}
          </div>

          {/* Main Waitlist Data Table Grid */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              {/* v330: min width so the table scrolls inside its box on phones */}
              <table className="w-full min-w-[820px] text-left border-collapse">
                <thead>
                  {activeTab === 'rejected_bin' ? (
                    <tr className="bg-foreground/5 border-b border-[var(--border-default)] text-xs text-[var(--text-secondary)] uppercase tracking-wider">
                      <th className="px-5 py-4 font-medium">Type</th>
                      <th className="px-5 py-4 font-medium">Applicant Name & Email</th>
                      <th className="px-5 py-4 font-medium">Platform / Website</th>
                      <th className="px-5 py-4 font-medium">Rejection Reason</th>
                      <th className="px-5 py-4 font-medium text-right">Actions</th>
                    </tr>
                  ) : (
                    <tr className="bg-foreground/5 border-b border-[var(--border-default)] text-xs text-[var(--text-secondary)] uppercase tracking-wider">
                      <th className="px-5 py-4 font-medium w-10">
                        <button 
                          onClick={() => toggleSelectAll(filteredItems)} 
                          aria-label="Select all pending" /* v332 */
                          className="p-1 hover:text-white transition-colors flex items-center justify-center cursor-pointer"
                        >
                          {filteredItems.filter(w => w.status === 'Pending').length > 0 &&
                           filteredItems.filter(w => w.status === 'Pending').every(id => selectedIds.includes(id.id)) 
                           ? <CheckSquare size={16} className="text-[#9D7CFF]"/> 
                           : <Square size={16} />}
                        </button>
                      </th>
                      <th className="px-5 py-4 font-medium">Pos / Date</th>
                      
                      {/* Dynamic Columns based on Tab */}
                      {isCreatorTab ? (
                        <>
                          <th className="px-5 py-4 font-medium">Creator</th>
                          <th className="px-5 py-4 font-medium">Platform & Handle</th>
                          <th className="px-5 py-4 font-medium">Category / Niche</th>
                          <th className="px-5 py-4 font-medium text-right">Followers</th>
                        </>
                      ) : (
                        <>
                          <th className="px-5 py-4 font-medium">Company & Contact</th>
                          <th className="px-5 py-4 font-medium">Website</th>
                          <th className="px-5 py-4 font-medium">Niche & Size</th>
                          <th className="px-5 py-4 font-medium text-right">Est. Budget</th>
                        </>
                      )}
                      
                      <th className="px-5 py-4 font-medium text-right">Actions</th>
                    </tr>
                  )}
                </thead>
                <tbody className="text-sm divide-y divide-foreground/5">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-12 text-center text-[var(--text-tertiary)]">
                        Loading application roster...
                      </td>
                    </tr>
                  ) : loadError && waitlist.length === 0 ? (
                    <tr>{/* v330: a failed load read "No waitlist applications found" */}
                      <td colSpan={8} className="px-5 py-12 text-center text-red-600">
                        Could not load the waitlist. <button type="button" onClick={() => { setLoading(true); fetchWaitlist(); }} className="underline font-bold cursor-pointer">Try again</button>
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-12 text-center text-[var(--text-secondary)]">
                        {activeTab === 'rejected_bin' ? "No rejected applications in the bin." : "No waitlist applications found in this section."}
                      </td>
                    </tr>
                  ) : activeTab === 'rejected_bin' ? (
                    filteredItems.map((item, idx) => (
                      <tr 
                        key={item.id ? `rej-${item.id}` : `rej-${idx}`} 
                        onClick={() => setSelectedItemDetails(item)}
                        className="hover:bg-[var(--bg-elevated)] transition-all duration-150 cursor-pointer group"
                      >
                        <td className="px-5 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                            item.role === 'brand' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-[var(--violet-soft)] text-[var(--violet)] border border-[var(--violet-border)]'
                          }`}>
                            {item.role}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <WlAvatar src={item.photo} name={item.role === 'brand' ? item.company_name : item.name} square={item.role === 'brand'} />{/* v332 */}
                            <div>
                              <div className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--violet)] transition-colors flex items-center gap-1.5">
                                {item.role === 'brand' ? item.company_name : item.name}
                                {(item.status === 'Pending' || item.is_registered_user === false || (item.kyc_status && item.kyc_status !== 'APPROVED')) && (
                                  <span className="relative flex h-2 w-2 shrink-0" title="Pending / Unverified">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-[var(--text-tertiary)]">{item.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {item.role === 'creator' ? (
                            <div>
                              <WlPlatformLinks item={item} />{/* v419 (Ravi): logo + username link per platform, no "Instagram" word */}{item.same_handle_accounts > 1 && <div className="text-[10px] font-bold text-amber-700">2 accounts · same Instagram</div>}{kycWaiting(item) && <div className="text-[10px] font-bold text-amber-600">KYC waiting</div>}
                            </div>
                          ) : (
                            <div>
                              {item.website ? (
                                <a 
                                  href={item.website} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[var(--violet)] hover:underline flex items-center gap-1 font-medium text-xs cursor-pointer"
                                >
                                  Visit Website <ExternalLink size={12} />
                                </a>
                              ) : (
                                <span className="text-[var(--text-tertiary)]">—</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 max-w-xs" onClick={(e) => e.stopPropagation()}>
                          <div className="text-xs text-[var(--text-secondary)] font-medium bg-red-50/50 border border-red-100/40 text-[var(--red)] px-2.5 py-1 rounded-lg inline-block break-words max-w-full">
                            {item.rejectReason || "Unspecified reason"}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setMessageModalItem(item);
                                // v332: the prefilled text told a still-rejected applicant they were "approved"
                                setPanelMessageText(`Dear ${(item.role === 'brand' ? item.company_name : item.name) || 'there'},\n\nWe are taking another look at your Ybex waitlist application. We will let you know as soon as there is an update.\n\nBest regards,\nYbex Team`);
                              }}
                              className="px-3 py-1.5 border border-[var(--border-default)] hover:border-[var(--violet-border)] text-[var(--text-secondary)] hover:text-[var(--violet)] rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                            >
                              <MessageSquare size={12} /> Message
                            </button>
                            <button 
                              onClick={() => handleRestoreApprove(item.id)} 
                              disabled={actionBusy} // v330
                              className="disabled:opacity-50 px-3 py-1.5 bg-[var(--green)] text-white hover:opacity-90 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                            >
                              <RotateCcw size={12} /> Re-Approve
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    filteredItems.map((item, idx) => (
                      <tr 
                        key={item.id ? `wl-${item.id}` : `wl-${idx}`} 
                        onClick={() => setSelectedItemDetails(item)}
                        className="hover:bg-[var(--bg-elevated)] transition-all duration-150 cursor-pointer group"
                      >
                        {/* Checkbox Column */}
                        <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                          {item.status === 'Pending' ? (
                            <button 
                              onClick={(e) => toggleSelect(e, item.id)} 
                              aria-label={selectedIds.includes(item.id) ? "Unselect" : "Select"} /* v332 */
                              className="p-1 hover:text-[var(--violet)] text-[var(--text-tertiary)] transition-colors flex items-center justify-center cursor-pointer"
                            >
                              {selectedIds.includes(item.id) ? <CheckSquare size={16} className="text-[var(--violet)]"/> : <Square size={16}/>}
                            </button>
                          ) : (
                            <div className="w-4"></div>
                          )}
                        </td>

                        {/* Position & Date */}
                        <td className="px-5 py-4">
                          <div className="font-mono text-[var(--text-primary)]/80 text-xs font-semibold">#{item.position || 0}</div>
                          <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{item.date}</div>
                        </td>

                        {/* Creator Tab Specifics */}
                        {isCreatorTab && (
                          <>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <WlAvatar src={item.photo} name={item.name} />{/* v332 */}
                                <div>
                                  <div className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--violet)] transition-colors flex items-center gap-1.5">
                                    {item.name}
                                    <WlStatusTick status={item.status} />
                                    {item.is_registered_user === false && (
                                      <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-bold shrink-0">
                                        Not Registered
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-[var(--text-tertiary)]">{item.email}</div>
                                  {isLowFollowerWork(item) && (
                                    <span data-testid="wl-low-work" className="mt-1 inline-block px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded text-[10px] font-bold whitespace-nowrap" title="Below the follower minimum — sent a work link. Reach out personally if the work fits.">
                                      Low followers · work shared
                                    </span>
                                  )}{/* v397 */}
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <WlPlatformLinks item={item} />{/* v419 (Ravi): logo + username link per platform, no "Instagram" word */}{item.same_handle_accounts > 1 && <div className="text-[10px] font-bold text-amber-700">2 accounts · same Instagram</div>}{kycWaiting(item) && <div className="text-[10px] font-bold text-amber-600">KYC waiting</div>}
                            </td>
                            <td className="px-5 py-4">
                              <div className="text-[var(--text-secondary)] font-medium">{item.category || "—"}</div>{/* v332: no made-up "General" / "India" */}
                              <div className="text-xs text-[var(--text-tertiary)]">{item.location || ""}</div>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <div className="font-semibold text-[var(--text-primary)]">
                                {fmtFollowers(item.followers)}{/* v332: blank when missing, "12.0k" */}
                              </div>
                              {/* v363: where the number came from */}
                              <div className={`text-xs ${item.ig_followers ? "text-emerald-600 font-semibold" : item.ig_error ? "text-amber-600 font-semibold" : "text-[var(--text-tertiary)]"}`} title={item.ig_error || ""}>
                                {item.ig_followers ? "✓ Instagram" : item.ig_error
                                  // v372: say WHY (phone has no hover) — a dead Ybex token isn't the creator's fault
                                  ? (/token|on behalf of user|cannot call api/i.test(item.ig_error) ? "Ybex token expired" : /personal|private|business/i.test(item.ig_error) ? "Private / personal acct" : "Fetch failed")
                                  : "Followers · form"}
                              </div>
                            </td>
                          </>
                        )}

                        {/* Brand Tab Specifics */}
                        {activeTab === 'brand' && (
                          <>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <WlAvatar src={item.photo} name={item.company_name} square />{/* v332 */}
                                <div>
                                  <div className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--violet)] transition-colors flex items-center gap-1.5">
                                    {item.company_name}
                                    <WlStatusTick status={item.status} />
                                  </div>
                                  <div className="text-xs text-[var(--text-tertiary)]">Rep: {item.name}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              {item.website ? (
                                <a 
                                  href={item.website} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[var(--violet)] hover:underline flex items-center gap-1 font-medium text-xs cursor-pointer"
                                >
                                  Visit Website <ExternalLink size={12} />
                                </a>
                              ) : (
                                <span className="text-[var(--text-tertiary)]">—</span>
                              )}
                              <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{item.email}</div>
                            </td>
                            <td className="px-5 py-4">
                              <div className="text-[var(--text-secondary)] font-medium">{item.category || "—"}</div>{/* v332: no made-up "Retail" / "1-10 employees" */}
                              <div className="text-xs text-[var(--text-tertiary)]">{item.company_size || ""}</div>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <div className="font-semibold text-[var(--text-primary)]">{item.monthly_budget || "—"}</div>
                              <div className="text-xs text-[var(--text-tertiary)]">Budget/mo</div>
                            </td>
                          </>
                        )}

                        {/* Row Action Panel */}
                        <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            {/* v419 (Ravi): only Approve / Reject here — the whole row opens the details (Edit is there) */}
                            {item.status === 'Pending' && (
                              <>
                                <motion.button 
                                  whileTap={{ scale: 0.93 }}
                                  onClick={() => (kycFilter === 'submitted' && kycWaiting(item) ? approveBoth(item) : handleApprove(item.id))} 
                                  disabled={actionBusy} // v330
                                  data-testid="wl-row-approve"
                                  className="disabled:opacity-50 px-3 py-1.5 bg-[var(--green)] text-white hover:opacity-90 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
                                >
                                  {kycFilter === 'submitted' && kycWaiting(item) ? 'Approve + KYC' : 'Approve'}{/* v419 */}
                                </motion.button>
                                <motion.button 
                                  whileTap={{ scale: 0.93 }}
                                  onClick={() => { setRejectModalId(item.id); setRejectReason(""); }} 
                                  className="px-3 py-1.5 border border-[var(--border-default)] hover:border-[var(--red)]/40 hover:bg-red-50 text-[var(--text-secondary)] hover:text-[var(--red)] rounded-lg text-xs font-bold transition-all cursor-pointer"
                                >
                                  Reject
                                </motion.button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* FULL-PAGE REVIEW DETAILS VIEW */
        <div className="space-y-6 animate-fade-in pb-12">
          
          {/* Top Back Action Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
            <button 
              onClick={() => setSelectedItemDetails(null)} 
              className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-bold text-sm transition-colors cursor-pointer"
            >
              <ArrowLeft size={16} /> Back to waitlist list
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-tertiary)] font-mono bg-[var(--bg-elevated)] border border-[var(--border-default)] px-3 py-1.5 rounded-xl">Position #{selectedItemDetails.position || 0}</span>
              <span className="text-xs text-[var(--text-tertiary)] bg-[var(--bg-elevated)] border border-[var(--border-default)] px-3 py-1.5 rounded-xl">Signed up: {selectedItemDetails.date}</span>
            </div>
          </div>

          {/* Profile Main Header Card */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center md:items-start justify-between gap-6 shadow-sm">
            <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
              <WlAvatar src={selectedItemDetails.photo} name={selectedItemDetails.role === 'brand' ? selectedItemDetails.company_name : selectedItemDetails.name} square={selectedItemDetails.role === 'brand'} size="w-20 h-20" text="text-2xl" />{/* v332 */}
              <div className="space-y-1.5">
                <div className="flex items-center flex-wrap justify-center sm:justify-start gap-3">
                  <h2 className="text-2xl font-bold font-display text-[var(--text-primary)]">
                    {selectedItemDetails.role === 'brand' ? selectedItemDetails.company_name : selectedItemDetails.name}
                  </h2>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${
                    selectedItemDetails.role === 'brand' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-[var(--violet-soft)] text-[var(--violet)] border border-[var(--violet-border)]'
                  }`}>
                    {selectedItemDetails.role}
                  </span>
                  {selectedItemDetails.is_registered_user === false && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                      <UserX size={12}/> Not Registered User (Public Form)
                    </span>
                  )}
                </div>
                {selectedItemDetails.role === 'creator' ? (
                  <>
                  <div className="text-[var(--violet)] font-mono text-sm font-semibold"><WlHandleLink item={selectedItemDetails} /></div>
                  {selectedItemDetails.same_handle_accounts > 1 && (
                    <div className="mt-1 text-[11px] font-semibold text-amber-700" data-testid="wl-same-handle">This Instagram has {selectedItemDetails.same_handle_accounts} Ybex accounts — approve the one to keep, reject the other. Explore shows only one.</div>
                  )}
                  {selectedItemDetails.role === 'creator' && (
                    <div className="mt-1 flex items-center gap-2 text-[11px] font-semibold" data-testid="wl-kyc-line">
                      <span className="text-[var(--text-secondary)]">KYC:</span>
                      <span className={kycWaiting(selectedItemDetails) ? "text-amber-600" : selectedItemDetails.kyc_status === 'approved' || selectedItemDetails.kyc_status === 'verified' ? "text-[var(--green)]" : "text-[var(--text-tertiary)]"}>
                        {kycWaiting(selectedItemDetails) ? "Submitted — waiting" : selectedItemDetails.kyc_status ? String(selectedItemDetails.kyc_status).replace(/_/g, " ") : "Not submitted"}
                      </span>
                      {kycWaiting(selectedItemDetails) && ( /* v419 (Ravi): its own button — Approve (waitlist) and Approve KYC are separate decisions */
                        <>
                          <button type="button" onClick={() => openKycOf(selectedItemDetails)} data-testid="wl-view-kyc" className="px-2 py-0.5 rounded-md border border-[var(--violet-border)] text-[var(--violet)] cursor-pointer hover:underline">View KYC</button>
                          <button type="button" onClick={() => approveKycOf(selectedItemDetails)} data-testid="wl-approve-kyc" className="px-2 py-0.5 rounded-md bg-[var(--violet)] text-white cursor-pointer">Approve KYC</button>
                        </>
                      )}
                    </div>
                  )}
                  </>
                ) : (
                  <div className="text-[var(--text-secondary)] text-sm">Primary Contact: <span className="text-[var(--text-primary)] font-semibold">{selectedItemDetails.name}</span></div>
                )}
                <div className="text-xs text-[var(--text-secondary)]">{selectedItemDetails.location || ""}</div>{/* v332 */}
              </div>
            </div>

            {/* Application Status Widget */}
            <div className="flex flex-col items-center md:items-end justify-center gap-2 border-t sm:border-t-0 pt-4 sm:pt-0 w-full sm:w-auto">
              <div className="text-xs text-[var(--text-tertiary)] uppercase font-semibold">Application Actions & Status</div>
              <AnimatePresence mode="wait">
                {isAnimActive ? (
                  <motion.div 
                    key="animating"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="flex flex-col items-center justify-center py-2"
                  >
                    {actionAnimType === 'approved' ? (
                      <div className="flex flex-col items-center gap-1.5">
                        <motion.div 
                          initial={{ rotate: -90, scale: 0 }}
                          animate={{ rotate: 0, scale: 1 }}
                          transition={{ type: "spring", stiffness: 200, damping: 15 }}
                          className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center border-2 border-emerald-500 text-[var(--green)]"
                        >
                          <CheckCircle2 size={24} className="stroke-[3px]" />
                        </motion.div>
                        <span className="text-xs font-bold text-[var(--green)] animate-pulse">Approved! Done</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1.5">
                        <motion.div 
                          initial={{ rotate: 90, scale: 0 }}
                          animate={{ rotate: 0, scale: 1 }}
                          transition={{ type: "spring", stiffness: 200, damping: 15 }}
                          className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center border-2 border-red-500 text-[var(--red)]"
                        >
                          <XCircle size={24} className="stroke-[3px]" />
                        </motion.div>
                        <span className="text-xs font-bold text-[var(--red)] animate-pulse">Rejected! Done</span>
                      </div>
                    )}
                  </motion.div>
                ) : selectedItemDetails.status === 'Pending' ? (
                  <motion.div 
                    key="pending-actions"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="flex items-center gap-3 mt-1"
                  >
                    <button 
                      onClick={() => setEditingWaitlistItem(selectedItemDetails)} 
                      className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                      title="Edit application questionnaire fields"
                    >
                      <Pencil size={14} /> Edit Application
                    </button>
                    <button 
                      onClick={() => { setRejectModalId(selectedItemDetails.id); setRejectReason(""); }} 
                      className="px-4 py-2 border border-[var(--red)]/40 text-[var(--red)] hover:bg-red-50 font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <XCircle size={14} /> Reject
                    </button>
                    <button 
                      onClick={() => handleApprove(selectedItemDetails.id)} 
                      disabled={actionBusy} // v330
                      className="disabled:opacity-50 px-5 py-2 bg-[var(--green)] hover:opacity-95 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <CheckCircle2 size={14} /> Approve
                    </button>

                  </motion.div>
                ) : (
                  <motion.div 
                    key="status-badge"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mt-1"
                  >
                    {selectedItemDetails.status === 'Approved' ? (
                      <span className="px-3.5 py-1.5 bg-[var(--green-bg)] text-[var(--green)] border border-[var(--green)]/20 rounded-full text-xs font-extrabold flex items-center gap-1.5">
                        <CheckCircle2 size={14} /> Approved Application
                      </span>
                    ) : (
                      <div className="flex flex-col items-center md:items-end gap-1">
                        <span className="px-3.5 py-1.5 bg-red-50 text-[var(--red)] border border-red-100 rounded-full text-xs font-extrabold flex items-center gap-1.5">
                          <XCircle size={14} /> Rejected
                        </span>
                        {selectedItemDetails.rejectReason && (
                          <div className="text-center sm:text-right mt-1 max-w-[280px]">
                            <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">Reason</div>
                            <div className="text-xs font-bold text-[var(--red)] break-words">{selectedItemDetails.rejectReason}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Grid Questionnaire Answers (THE IMPORTANT CHOTI SE CHOTI DETAILS) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <div className="lg:col-span-2 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-bold font-display text-[var(--text-primary)] mb-6 flex items-center gap-2 border-b border-[var(--border-default)] pb-4">
                <ShieldAlert size={18} className="text-[var(--violet)]" /> Submitted Questionnaire Details
              </h3>

              {selectedItemDetails.role === 'creator' ? (
                /* CREATOR QUESTIONNAIRE */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl">
                    <span className="text-xs text-[var(--text-tertiary)] block">Primary Handle / Platform</span>
                    <strong className="text-sm text-[var(--violet)] mt-1 block font-mono">
                      {selectedItemDetails.handle || selectedItemDetails.social_handle || "Not provided"}{/* v332: no fake "@creator" */}
                      <span className="text-xs text-[var(--text-tertiary)] font-sans ml-1.5 font-bold">
                        {selectedItemDetails.platform ? `(${selectedItemDetails.platform})` : ""}
                      </span>
                    </strong>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5">
                      {selectedItemDetails.instagram_link && (
                        <a 
                          href={selectedItemDetails.instagram_link} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-[11px] text-[var(--violet)] hover:underline flex items-center gap-1 font-semibold"
                        >
                          Instagram Profile <ExternalLink size={10} />
                        </a>
                      )}
                      {(() => {
                        const ytVal = selectedItemDetails.youtube || selectedItemDetails.youtube_link;
                        if (!ytVal) return null;
                        const isIg = String(ytVal).toLowerCase().includes("instagram.com") || String(ytVal).toLowerCase().includes("instagr.am");
                        if (isIg && selectedItemDetails.instagram_link) return null; // already shown
                        const href = ytVal.startsWith('http') ? ytVal : `https://${ytVal}`;
                        return (
                          <a 
                            href={href} 
                            target="_blank" 
                            rel="noreferrer" 
                            className={`text-[11px] ${isIg ? 'text-[var(--violet)]' : 'text-red-500'} hover:underline flex items-center gap-1 font-semibold`}
                          >
                            {isIg ? "Instagram Profile" : "YouTube Channel"} <ExternalLink size={10} />
                          </a>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl">
                    <span className="text-xs text-[var(--text-tertiary)] block">Follower Count &amp; Reach</span>
                    <strong className="text-sm text-[var(--text-primary)] mt-1 block">{(Number(selectedItemDetails.followers) || 0).toLocaleString('en-IN') /* v330 */} followers</strong>
                    {/* v363: live Instagram numbers next to what the form said */}
                    {selectedItemDetails.ig_followers ? (
                      <span className="text-xs text-emerald-700 font-semibold mt-0.5 block">
                        ✓ Live from Instagram{selectedItemDetails.ig_stats?.avg_views ? ` · ${Number(selectedItemDetails.ig_stats.avg_views).toLocaleString('en-IN')} avg views` : ""}{selectedItemDetails.ig_stats?.engagement_rate != null ? ` · ${selectedItemDetails.ig_stats.engagement_rate}% eng.` : ""}
                        {selectedItemDetails.form_followers && selectedItemDetails.form_followers !== selectedItemDetails.ig_followers ? <span className="text-[var(--text-tertiary)] font-medium"> · form said {Number(selectedItemDetails.form_followers).toLocaleString('en-IN')}</span> : null}
                      </span>
                    ) : selectedItemDetails.ig_error ? (
                      <span className="text-xs text-amber-700 font-semibold mt-0.5 block">Instagram fetch failed: {selectedItemDetails.ig_error}</span>
                    ) : (
                      <span className="text-xs text-[var(--text-tertiary)] font-medium mt-0.5 block">Typed in the form · not fetched from Instagram yet</span>
                    )}
                    {(selectedItemDetails.avg_reach || selectedItemDetails.avg_views_30d) && (
                      <span className="text-xs text-[var(--text-secondary)] font-medium mt-0.5 block">
                        Avg Reach / Views (form): {selectedItemDetails.avg_reach || selectedItemDetails.avg_views_30d}
                      </span>
                    )}
                  </div>
                  <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl">
                    <span className="text-xs text-[var(--text-tertiary)] block">Date of Birth &amp; Age</span>
                    <strong className="text-sm text-[var(--text-primary)] mt-1 block flex items-center gap-1.5">
                      <Calendar size={14} className="text-blue-400" />
                      {selectedItemDetails.dob || selectedItemDetails.date_of_birth || selectedItemDetails.rate_card?.dob || selectedItemDetails.rate_card?.date_of_birth || selectedItemDetails.profile?.dob || selectedItemDetails.profile?.date_of_birth || selectedItemDetails.profile?.rate_card?.dob || "Not provided"}
                    </strong>
                  </div>
                  <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl">
                    <span className="text-xs text-[var(--text-tertiary)] block">Gender &amp; Location</span>
                    <strong className="text-sm text-[var(--text-primary)] mt-1 block flex items-center gap-1.5">
                      <MapPin size={14} className="text-emerald-400" />
                      {(() => { /* v363: "PunjabPunjab" — city and location were both printed; each part once now */
                        const parts = [];
                        for (const v of [selectedItemDetails.gender, selectedItemDetails.city, selectedItemDetails.state || (!selectedItemDetails.city ? selectedItemDetails.location : "")]) {
                          const t = String(v || "").trim();
                          if (t && !parts.some((p) => p.toLowerCase() === t.toLowerCase())) parts.push(t);
                        }
                        return parts.length ? parts.join(", ") : "Not provided";
                      })()}
                    </strong>
                  </div>
                  <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl">
                    <span className="text-xs text-[var(--text-tertiary)] block">Content Niche / Category</span>
                    <strong className="text-sm text-[var(--text-primary)] mt-1 block">
                      {selectedItemDetails.niche || selectedItemDetails.category || "Not provided"}{/* v332: no made-up niche */}
                    </strong>
                  </div>
                  <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl">
                    <span className="text-xs text-[var(--text-tertiary)] block">Languages Spoken</span>
                    <strong className="text-sm text-[var(--text-primary)] mt-1 block">
                      {Array.isArray(selectedItemDetails.languages) && selectedItemDetails.languages.length > 0
                        ? selectedItemDetails.languages.join(", ")
                        : (typeof selectedItemDetails.languages === 'string' && selectedItemDetails.languages.trim() ? selectedItemDetails.languages : "Not provided")}{/* v332 */}
                    </strong>
                  </div>
                  <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl">
                    <span className="text-xs text-[var(--text-tertiary)] block">Creator Email Address</span>
                    <strong className="text-sm text-[var(--violet)] mt-1 block flex items-center gap-1.5 select-all">
                      <Mail size={14} className="shrink-0"/> <span className="break-all">{selectedItemDetails.email || "Not provided"}</span>{/* v332: long emails wrap */}
                    </strong>
                  </div>
                  <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl">
                    <span className="text-xs text-[var(--text-tertiary)] block">Contact Mobile Number</span>
                    <strong className="text-sm text-[var(--text-primary)] mt-1 block flex items-center gap-1.5 select-all">
                      <Phone size={14} className="text-green-500" /> {selectedItemDetails.mobile || selectedItemDetails.phone || "Not provided"}
                    </strong>
                  </div>

                  {/* Rates & Experience */}
                  <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl sm:col-span-2">
                    <span className="text-xs text-[var(--text-tertiary)] block mb-3 font-semibold text-[var(--violet)] uppercase tracking-wider">
                      Rates &amp; Experience
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center mt-1">
                      <div className="bg-[var(--bg-card)] p-3 rounded-xl border border-[var(--border-default)]">
                        <div className="text-xs text-[var(--text-secondary)]">Instagram Reel</div>
                        <div className="font-mono text-sm font-extrabold text-[var(--green)] mt-1">
                          {selectedItemDetails.rate_reel || selectedItemDetails.pricing?.reel || selectedItemDetails.rate_card?.reels
                            ? `₹${Number(selectedItemDetails.rate_reel || selectedItemDetails.pricing?.reel || selectedItemDetails.rate_card?.reels).toLocaleString('en-IN')}`
                            : (selectedItemDetails.charges || "—")}
                        </div>
                      </div>
                      <div className="bg-[var(--bg-card)] p-3 rounded-xl border border-[var(--border-default)]">
                        <div className="text-xs text-[var(--text-secondary)]">Story Shoutout</div>
                        <div className="font-mono text-sm font-extrabold text-[var(--green)] mt-1">
                          {selectedItemDetails.rate_story || selectedItemDetails.pricing?.story || selectedItemDetails.rate_card?.stories
                            ? `₹${Number(selectedItemDetails.rate_story || selectedItemDetails.pricing?.story || selectedItemDetails.rate_card?.stories).toLocaleString('en-IN')}`
                            : "—"}
                        </div>
                      </div>
                      <div className="bg-[var(--bg-card)] p-3 rounded-xl border border-[var(--border-default)]">
                        <div className="text-xs text-[var(--text-secondary)]">Main / UGC Charge</div>
                        <div className="font-mono text-sm font-extrabold text-blue-400 mt-1">
                          {selectedItemDetails.charges 
                            ? (String(selectedItemDetails.charges).startsWith('₹') ? selectedItemDetails.charges : `₹${selectedItemDetails.charges}`)
                            : (selectedItemDetails.pricing?.ugc ? `₹${Number(selectedItemDetails.pricing.ugc).toLocaleString('en-IN')}` : "—")}
                        </div>
                      </div>
                      <div className="bg-[var(--bg-card)] p-3 rounded-xl border border-[var(--border-default)]">
                        <div className="text-xs text-[var(--text-secondary)]">Rating &amp; Mode</div>
                        <div className="font-mono text-xs font-bold text-[var(--violet)] mt-1">
                          {selectedItemDetails.ugc_rating ? `${selectedItemDetails.ugc_rating}/10` : "No rating"}{/* v332: was a made-up 8/10 */} • {selectedItemDetails.barter_mode === 'cash_and_barter' ? 'Barter+Cash' : (selectedItemDetails.barter_mode === 'barter_only' ? 'Barter' : 'Cash')}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Preferred Collab Types */}
                  {Array.isArray(selectedItemDetails.collab_types) && selectedItemDetails.collab_types.length > 0 && (
                    <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl sm:col-span-2">
                      <span className="text-xs text-[var(--text-tertiary)] block mb-2 font-semibold uppercase tracking-wider">Preferred Collaboration Types</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        { safeArray(selectedItemDetails.collab_types).map((type, idx) => (
                          <span key={idx} className="px-2.5 py-1 bg-[var(--violet-soft)] text-[var(--violet)] border border-[var(--violet-border)] rounded-lg text-xs font-semibold">
                            {type}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sample Work Links */}
                  {Array.isArray(selectedItemDetails.sample_links) && selectedItemDetails.sample_links.length > 0 && (
                    <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl sm:col-span-2">
                      <span className="text-xs text-[var(--text-tertiary)] block mb-2 font-semibold uppercase tracking-wider">Submitted Sample Content Links</span>
                      <div className="space-y-1.5 mt-2">
                        { safeArray(selectedItemDetails.sample_links).map((link, idx) => (
                          <a 
                            key={idx}
                            href={link}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 text-xs text-[var(--violet)] hover:underline font-mono bg-[var(--bg-card)] p-2.5 rounded-lg border border-[var(--border-default)] truncate"
                          >
                            <Link2 size={13} className="shrink-0" />
                            <span className="truncate">{link}</span>
                            <ExternalLink size={12} className="shrink-0 ml-auto text-slate-500" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              ) : (
                /* BRAND QUESTIONNAIRE */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl">
                    <span className="text-xs text-[var(--text-tertiary)] block">Company Name</span>
                    <strong className="text-sm text-[var(--text-primary)] mt-1 block break-words">{selectedItemDetails.company_name || "Not provided"}</strong>
                  </div>
                  <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl">
                    <span className="text-xs text-[var(--text-tertiary)] block">Official Brand Website</span>
                    {selectedItemDetails.website ? (
                      <a 
                        href={selectedItemDetails.website} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-[var(--violet)] hover:underline mt-1 block flex items-center gap-1 text-sm font-semibold cursor-pointer"
                      >
                        <span className="break-all">{selectedItemDetails.website}</span> <ExternalLink size={12} className="shrink-0" />
                      </a>
                    ) : (
                      <strong className="text-sm text-[var(--text-tertiary)] mt-1 block">Not provided</strong>
                    )}
                  </div>
                  <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl">
                    <span className="text-xs text-[var(--text-tertiary)] block">Brand Category / Niche</span>
                    <strong className="text-sm text-[var(--text-primary)] mt-1 block">{selectedItemDetails.category || "Not provided"}{/* v332 */}</strong>
                  </div>
                  <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl">
                    <span className="text-xs text-[var(--text-tertiary)] block">Company Size</span>
                    <strong className="text-sm text-[var(--text-primary)] mt-1 block">{selectedItemDetails.company_size || "Not provided"}{/* v332: was a made-up "11-50 employees" */}</strong>
                  </div>
                  <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl">
                    <span className="text-xs text-[var(--text-tertiary)] block">Partner Email Address</span>
                    <strong className="text-sm text-[var(--violet)] mt-1 block flex items-center gap-1.5 select-all">
                      <Mail size={14} className="shrink-0"/> <span className="break-all">{selectedItemDetails.email || "Not provided"}</span>
                    </strong>
                  </div>
                  <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl">
                    <span className="text-xs text-[var(--text-tertiary)] block">Contact Number</span>
                    <strong className="text-sm text-[var(--text-primary)] mt-1 block flex items-center gap-1.5 select-all">
                      <Phone size={14}/> {selectedItemDetails.phone || "Not provided"}
                    </strong>
                  </div>
                  <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl">
                    <span className="text-xs text-[var(--text-tertiary)] block">Corporate HQ Location</span>
                    <strong className="text-sm text-[var(--text-primary)] mt-1 block">{selectedItemDetails.location || "Not provided"}</strong>
                  </div>
                  <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl">
                    <span className="text-xs text-[var(--text-tertiary)] block font-semibold text-[var(--violet)] uppercase tracking-wider">Estimated Monthly Budget</span>
                    <strong className="text-base text-[var(--green)] mt-1 block font-mono font-extrabold">{selectedItemDetails.monthly_budget || "—"}</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Live KYC & Authenticity Grounded Audit & Biography column */}
            <div className="space-y-6">

              <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold font-display text-[var(--text-primary)] mb-6 flex items-center gap-2 border-b border-[var(--border-default)] pb-4">
                    Biography & Goals
                  </h3>
                  <div className="p-5 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl min-h-[160px]">
                    <span className="text-xs text-[var(--text-tertiary)] block mb-2 font-semibold uppercase tracking-wider">
                      {selectedItemDetails.role === 'brand' ? 'About Brand Goals & Philosophy' : 'Creator Biography & Goals'}
                    </span>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed italic">
                      "{selectedItemDetails.about || selectedItemDetails.notes || "No additional bio or brand details were provided during waitlist submission."}"
                    </p>
                  </div>
                </div>
              </div>
            </div>

          </div>


        </div>
      )}

      {/* REJECTION OVERLAY DIALOG */}
      <Presence>{rejectModalId && (
        <PopupBackdrop className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <PopupPanel kind="modal" className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl w-full max-w-md max-h-[90dvh] overflow-y-auto shadow-2xl relative animate-scale-in">{/* v330: scrolls on short phones */}
            <div className="p-5 border-b border-[var(--border-default)] flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-[var(--text-primary)] flex items-center gap-2">
                <AlertTriangle className="text-[var(--red)]" size={20} /> Reject Waitlist Application
              </h3>
              <button onClick={() => { setRejectModalId(null); setRejectReason(""); setCustomRejectReason(""); }} aria-label="Close" /* v332 */ className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">
                <XCircle size={20} />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs uppercase font-bold text-[var(--text-secondary)] mb-2">Primary Rejection Reason *</label>
                <div className="relative">
                  <select 
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="w-full appearance-none pl-4 pr-10 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl focus:border-[var(--red)] focus:outline-none text-[var(--text-primary)] text-[16px] sm:text-sm cursor-pointer"
                  >
                    <option value="" disabled className="text-[var(--text-secondary)]">Choose a predefined reason...</option>
                    <option value="Fake / Suspicious Engagement" className="text-[var(--text-primary)]">Fake / Suspicious Engagement</option>
                    <option value="Incomplete questionnaire fields" className="text-[var(--text-primary)]">Incomplete questionnaire fields</option>
                    <option value="Out of target geographical region" className="text-[var(--text-primary)]">Out of target geographical region</option>
                    <option value="Business website is not operational" className="text-[var(--text-primary)]">Business website is not operational</option>
                    <option value="Unsuitable niche or category alignment" className="text-[var(--text-primary)]">Unsuitable niche or category alignment</option>
                    <option value="Content against policy guidelines" className="text-[var(--text-primary)]">Content against policy guidelines</option>
                    <option value="Other" className="text-[var(--text-primary)]">Other (Write custom reason)</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" size={16} />
                </div>
              </div>

              {/* Custom reason textbox (Only if "Other" is chosen or any rejection) */}
              {(rejectReason === 'Other' || rejectReason) && (
                <div>
                  <label className="block text-xs uppercase font-bold text-[var(--text-secondary)] mb-2">
                    {rejectReason === 'Other' ? 'Custom Rejection Reason *' : 'Detailed feedback (Optional)'}
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Provide explanatory feedback for this application rejection..."
                    value={customRejectReason}
                    onChange={(e) => setCustomRejectReason(e.target.value)}
                    className="w-full p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl focus:border-[var(--red)] focus:outline-none text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-[16px] sm:text-sm"
                  />
                </div>
              )}
            </div>

            <div className="p-5 bg-[var(--bg-elevated)] border-t border-[var(--border-default)] flex gap-3 justify-end items-center">
              <button 
                onClick={() => { setRejectModalId(null); setRejectReason(""); setCustomRejectReason(""); }} 
                className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button 
                disabled={actionBusy || !rejectReason || (rejectReason === 'Other' && !customRejectReason.trim())} // v330: busy
                onClick={() => {
                  const finalReason = rejectReason === 'Other' ? customRejectReason.trim() : rejectReason + (customRejectReason ? ` - ${customRejectReason.trim()}` : '');
                  if (rejectModalId === 'batch') {
                    batchReject(finalReason); // v330: real batch reject — one single-reject call per applicant
                  } else {
                    handleReject(rejectModalId, finalReason);
                  }
                }} 
                className="px-5 py-2.5 bg-[var(--red)] hover:opacity-90 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                Confirm Rejection
              </button>
            </div>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {/* PANEL MESSAGE OVERLAY DIALOG */}
      <Presence>{messageModalItem && (
        <PopupBackdrop className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <PopupPanel kind="modal" className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl w-full max-w-lg max-h-[90dvh] overflow-y-auto shadow-2xl relative animate-scale-in">{/* v330: scrolls on short phones */}
            <div className="p-5 border-b border-[var(--border-default)] flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-[var(--text-primary)] flex items-center gap-2">
                <MessageSquare className="text-[var(--violet)]" size={20} /> Send Action Message
              </h3>
              <button onClick={() => setMessageModalItem(null)} aria-label="Close" /* v332 */ className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">
                <XCircle size={20} />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-xs text-[var(--text-secondary)]">
                The message below will be dispatched to the applicant's user dashboard notification panel. You can customize the text to explain their action steps, re-evaluation reason, or instructions.
              </p>
              <div>
                <label className="block text-xs uppercase font-bold text-[var(--text-secondary)] mb-2">Recipient</label>
                <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl text-xs text-[var(--text-primary)] font-semibold">
                  {messageModalItem.role === 'brand' ? messageModalItem.company_name : messageModalItem.name} ({messageModalItem.email})
                </div>
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-[var(--text-secondary)] mb-2">Message Body</label>
                <textarea
                  rows={6}
                  value={panelMessageText}
                  onChange={(e) => setPanelMessageText(e.target.value)}
                  className="w-full p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl focus:border-[var(--violet)] focus:outline-none text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-[16px] sm:text-sm font-mono leading-relaxed"
                />
              </div>
            </div>

            <div className="p-5 bg-[var(--bg-elevated)] border-t border-[var(--border-default)] flex gap-3 justify-end items-center">
              <button 
                onClick={() => setMessageModalItem(null)} 
                className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button 
                disabled={sendingMessage || !panelMessageText.trim()}
                onClick={async () => {
                  setSendingMessage(true);
                  try {
                    const { data: sent } = await api.post(`/admin/waitlist/${messageModalItem.id}/message`, { message: panelMessageText });
                    // Session 58: say "sent" only when the applicant has an account to receive it.
                    toast.success(sent?.delivered ? "Message sent to the applicant's account." : "Message saved — this applicant has no Ybex account yet, so nobody was notified.");
                    setMessageModalItem(null);
                  } catch (e) {
                    console.error(e);
                    toast.error(calmError(e, "Couldn't send the message. Please try again.")); // v332
                  } finally {
                    setSendingMessage(false);
                  }
                }} 
                className="px-5 py-2.5 bg-[var(--violet)] hover:bg-[var(--violet-hover)] text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {sendingMessage ? "Sending..." : "Dispatch Message"}
              </button>
            </div>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>

      {editingWaitlistItem && (
        <WaitlistEditModal
          item={editingWaitlistItem}
          onClose={() => setEditingWaitlistItem(null)}
          onSaveSuccess={(updatedItem) => {
            setWaitlist(prev => prev.map(w => (w.id === updatedItem.id || w.user_id === updatedItem.user_id) ? { ...w, ...updatedItem } : w));
            if (selectedItemDetails && (selectedItemDetails.id === updatedItem.id || selectedItemDetails.user_id === updatedItem.user_id)) {
              setSelectedItemDetails(prev => ({ ...prev, ...updatedItem }));
            }
          }}
        />
      )}

    </div>
  );
}
