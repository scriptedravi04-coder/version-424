import { InhouseBrandToggle } from "./mobile/AdminMobileScreens"; // v419: Ybex in-house brand switch
import { AppPagePicker } from "./AdminPromoPopups"; // v378
import React, { useState, useEffect, useRef } from 'react';
import DeleteAccountPanel from "./DeleteAccountPanel";
import { AlertTriangle, AlertOctagon, RotateCcw, ArrowLeft, Send, Shield, FileText, CheckCircle2, XCircle, Briefcase, Clock, ExternalLink, ShieldCheck, DollarSign, Wallet, RefreshCw, AlertCircle, X, Home, Trash2, Sparkles } from 'lucide-react';
import ExploreHideControl, { InstagramRefreshControl, SupportModeControl } from './ExploreHideControl'; // v349 · v429 support mode
import { api } from '../../lib/api';
import { mediaHref } from '../../lib/mediaUrl';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import SubAdminPermissionPicker from './SubAdminPermissionPicker';
import { SUB_ADMIN_MODULES, PLATFORM_SETTINGS_SUBS, emptyPermissions, permissionsToMap, FULL_SETTINGS_KEY } from '../../lib/adminPermissions';

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
import ActivityTimelineCard from "./userEnforcement/ActivityTimelineCard";
import BasicDetailsCard from "./userEnforcement/BasicDetailsCard";
import EscrowLedgerCard from "./userEnforcement/EscrowLedgerCard";
import KycHighlightsCard from "./userEnforcement/KycHighlightsCard";
import LegalKycGrid from "./userEnforcement/LegalKycGrid";
import PayoutHighlightsCard from "./userEnforcement/PayoutHighlightsCard";
import PayoutMethodsCard from "./userEnforcement/PayoutMethodsCard";
import UploadedDocumentsCard from "./userEnforcement/UploadedDocumentsCard";
export { SUB_ADMIN_MODULES } from '../../lib/adminPermissions';

// v332: calm error text (never raw "Request failed with status code 500") and readable status codes.
const calmError = (err, fallback) => {
  const m = err?.response?.data?.error || err?.response?.data?.detail;
  return typeof m === "string" && m && m.length < 160 ? m : fallback;
};
const humanize = (v) => String(v || '').replace(/_/g, ' ').trim();

/** v434: true only when an ID number (PAN / Aadhaar / GST) or a proof file was actually sent. Pure (tests). */
export const KYC_PROOF_KEY = /(^|_)(pan|aadhaar|aadhar|gst|gstin|upi_qr|qr_code|doc|proof|certificate|cert|identity_num|incorporation)(_|$)|uploaded_files|doc_url/i;
export function kycHasRealData(kyc) {
  if (!kyc || typeof kyc !== 'object') return false;
  const filled = (v) => Array.isArray(v) ? v.some(filled) : Boolean(String(v ?? '').trim()) && v !== false;
  const top = ['pan_number', 'pan_doc_url', 'pan_card_url', 'aadhaar_number', 'aadhaar_front_url', 'aadhaar_back_url', 'gst_number', 'gstin', 'gst_certificate_url', 'incorporation_doc_url', 'business_proof_document_url', 'doc_url'];
  if (top.some((k) => filled(kyc[k]))) return true;
  const docs = kyc.documents && typeof kyc.documents === 'object' ? kyc.documents : {};
  return Object.entries(docs).some(([k, v]) => KYC_PROOF_KEY.test(k) && filled(v));
}

export default function UserEnforcementPanel({ user: initialUser, onBack, onUserUpdate, homePicks, toggleHomePick, homePickBusy }) {
  const { user: currentUser, refreshUser } = useAuth();
  const isFullAdmin = currentUser?.role === 'admin' && currentUser?.team_role !== 'sub_admin';
  
  // Navigation tabs: 'profile' | 'kyc' | 'payouts' | 'enforcement' | 'message' | 'permissions'
  const [activeTab, setActiveTab] = useState('profile');
  const [activeEnforcementStage, setActiveEnforcementStage] = useState('warning');
  
  const [warningTemplate, setWarningTemplate] = useState('');
  const [warningNote, setWarningNote] = useState('');
  const [warningTemplates, setWarningTemplates] = useState([]);
  const [suspendDuration, setSuspendDuration] = useState('7');
  const [suspendReason, setSuspendReason] = useState('');
  const [banConfirmText, setBanConfirmText] = useState('');
  const [deleteOtp, setDeleteOtp] = useState('');
  
  const [violations, setViolations] = useState([]);
  const [fullData, setFullData] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);

  // Hidden 5-click Password Reveal States
  const [revealedPassword, setRevealedPassword] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);
  const secretClickCountRef = useRef(0);
  const secretClickTimerRef = useRef(null);

  // Document Viewer & KYC Quick Actions
  const [previewDoc, setPreviewDoc] = useState(null);
  const [showBankAcc, setShowBankAcc] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [submittingKycAction, setSubmittingKycAction] = useState(false);
  const [actionBusy, setActionBusy] = useState(false); // v330: one enforcement action at a time (no double suspend / warning)
  const [profileError, setProfileError] = useState(false); // v332: failed load is not a blank screen
  const [resetBusy, setResetBusy] = useState(false); // v332: no double password reset

  const handleResetPassword = async () => {
    if (!isFullAdmin) return;
    // Session 24: strong random temporary password (was 6 chars from Math.random). Shown to the
    // admin once, here, right after the reset — the server never stores or returns passwords.
    const bytes = (window.crypto || window.msCrypto).getRandomValues(new window.Uint8Array(12));
    const newPassword = `Ybex@${Array.from(bytes, (b) => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"[b % 56]).join("")}`;
    if (resetBusy) return; // v332
    if (!window.confirm(`Are you sure you want to reset this admin's password?`)) return;
    setResetBusy(true);
    try {
      const res = await api.post(`/admin/users/${user.user_id || user.id}/set-password`, { password: newPassword });
      toast.success("Password reset successfully!");
      setRevealedPassword(true);
      
      const updatedUser = { ...user, plain_password: newPassword };
      setFullData(prev => ({
        ...prev,
        user: updatedUser
      }));
    } catch (e) {
      toast.error(calmError(e, "Couldn't reset the password. Please try again.")); // v332
    } finally {
      setResetBusy(false);
    }
  };

  const handleSecretPasswordTrigger = () => {
    if (!isFullAdmin) return;
    secretClickCountRef.current += 1;
    
    if (secretClickCountRef.current >= 5) {
      secretClickCountRef.current = 0;
      setRevealedPassword(true);
      const targetPass = user.plain_password || null; // only a password you just reset
      if (targetPass) {
        toast.success(`Password: ${targetPass}`, {
          duration: 8000,
          action: {
            label: 'Copy',
            onClick: () => {
              navigator.clipboard.writeText(targetPass);
              toast.success("Password copied!");
            }
          }
        });
      } else if (user.password_hash) {
        toast.info("Password is encrypted with Bcrypt", { duration: 5000 });
      } else {
        toast.info("No password set for this user", { duration: 5000 });
      }
      return;
    }

    if (secretClickTimerRef.current) clearTimeout(secretClickTimerRef.current);
    secretClickTimerRef.current = setTimeout(() => {
      secretClickCountRef.current = 0;
    }, 2500);
  };

  const handleCopy = (textToCopy, fieldName) => {
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopiedField(fieldName);
    toast.success(`${fieldName} copied to clipboard!`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Custom Message tab states
  const [customMsg, setCustomMsg] = useState(''); const [customLink, setCustomLink] = useState(''); // v378: page that opens on tap
  const [selectedChannels, setSelectedChannels] = useState({
     in_app: true,
     whatsapp: false,
     sms: false,
     email: false
  });
  const [sendingMsg, setSendingMsg] = useState(false);

  const handleSendCustomMessage = async () => {
     if (!customMsg.trim()) {
        toast.error("Please enter a message to send");
        return;
     }
     
     const activeChannels = Object.keys(selectedChannels).filter(k => selectedChannels[k]);
     if (activeChannels.length === 0) {
        toast.error("Please select at least one delivery channel");
        return;
     }

     setSendingMsg(true);
     try {
        await api.post("/admin/notifications/send", {
           subtype: "general",
           message: customMsg,
           redirect_path: customLink || undefined, // v378
           target_type: "user",
           target_user_id: user.user_id,
           channels: activeChannels
        });
        
        toast.success(activeChannels.includes("email") ? "Sent — in the app and by email." : "Sent — in the app (and phone push).");
        setCustomMsg("");
     } catch (e) {
        console.error(e);
        toast.error(calmError(e, "Couldn't send the message. Please try again.")); // v332
     } finally {
        setSendingMsg(false);
     }
  };

  // For Permissions
  const [teamRole, setTeamRole] = useState('');
  const [permissions, setPermissions] = useState(emptyPermissions());
  
  const user = fullData?.user || initialUser;
  const [localHomePickBusy, setLocalHomePickBusy] = useState(false);
  const [localHomePick, setLocalHomePick] = useState(undefined);

  const targetUid = user.user_id || user.id;
  const isOnCreatorHome = localHomePick !== undefined
    ? localHomePick
    : (homePicks && homePicks[targetUid] !== undefined
        ? homePicks[targetUid]
        : Boolean(fullData?.profile?.show_on_creator_home || user?.creator_profile?.show_on_creator_home));

  const handleToggleHome = async () => {
    const nextVal = !isOnCreatorHome;
    setLocalHomePickBusy(true);
    try {
      if (toggleHomePick) {
        await toggleHomePick(targetUid, nextVal);
      } else {
        await api.post(`admin/creators/${targetUid}/home-pick`, { on: nextVal });
        toast.success(nextVal ? "Shown on the creator home" : "Removed from the creator home");
      }
      setLocalHomePick(nextVal);
      if (onUserUpdate) onUserUpdate();
    } catch (e) {
      toast.error(calmError(e, "Couldn't save. Please try again.")); // v332
    } finally {
      setLocalHomePickBusy(false);
    }
  };

  useEffect(() => {
    fetchViolations();
    fetchFullProfile();
    fetchTimeline();
  }, [initialUser.user_id]);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await api.get("/admin/templates?subtype=warning");
        setWarningTemplates(res.data || []);
      } catch (err) {
        console.error("Failed to load warning templates:", err);
      }
    };
    fetchTemplates();
  }, []);

  const handleSendWarning = async () => {
    if (!warningTemplate && !warningNote.trim()) {
       toast.error("Please select a template or enter a custom note");
       return;
    }
    if (actionBusy) return; // v330
    setActionBusy(true);
    try {
       await api.post("/admin/enforcement/warning", {
          target_user_id: user.user_id,
          template_id: warningTemplate || undefined,
          custom_note: warningNote || undefined,
          channels: ["in_app", "email"]
       });
       toast.success("Warning sent"); // v332: say what happened
       setWarningTemplate('');
       setWarningNote('');
       fetchViolations();
       fetchFullProfile();
       if (onUserUpdate) onUserUpdate();
    } catch (e) {
       console.error(e);
       toast.error(calmError(e, "Couldn't send the warning. Please try again.")); // v332
    } finally { setActionBusy(false); }
  };

  const fetchTimeline = async () => {
    try {
      const res = await api.get(`/admin/users/${initialUser.user_id}/timeline`);
      setTimeline(Array.isArray(res.data) ? res.data : []); // v332: never a non-list
    } catch (e) { console.error(e); }
  };

  const fetchViolations = async () => {
    try {
      const res = await api.get(`/admin/users/${initialUser.user_id}/violations`);
      setViolations(Array.isArray(res.data) ? res.data : []); // v332: a non-list reply crashed violations.map
    } catch (e) { console.error(e); }
  };

  const fetchFullProfile = async () => {
    try {
      const res = await api.get(`/admin/users/${initialUser.user_id}/full_profile`);
      setProfileError(false); // v332
      setFullData(res.data);
      
      const loadedUser = res.data.user || initialUser;
      setTeamRole(loadedUser.team_role || (loadedUser.role === 'admin' ? 'admin' : ''));
      
      if (loadedUser.permissions && loadedUser.permissions.length > 0) {
         setPermissions(permissionsToMap(loadedUser.permissions));
      }
    } catch (e) {
      console.error(e);
      setProfileError(true); // v332
      toast.error(calmError(e, "Couldn't load this account. Please try again.")); // v332
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (endpoint, payload) => {
     if (actionBusy) return; // v330
     // v330: suspending locks the user out — ask first
     // v332: reinstating a banned / suspended account, or wiping its violation history, is also asked first
     if (endpoint === 'reinstate' && !window.confirm(`Restore ${user.name || user.email || 'this account'} to full standing? This clears its violations.`)) return;
     if (endpoint === 'unrestrict' && !window.confirm(`Clear violations and give ${user.name || user.email || 'this account'} chat access again?`)) return;
     if (endpoint === 'suspend' && !window.confirm(`Suspend ${user.name || user.email || 'this account'} (${payload?.duration === 'indefinite' ? 'indefinitely' : `${payload?.duration} days`})?`)) return;
     setActionBusy(true);
     try {
        await api.post(`/admin/users/${user.user_id}/${endpoint}`, payload);
        toast.success(endpoint === 'suspend' ? 'Account suspended' : endpoint === 'reinstate' ? 'Account restored' : endpoint === 'unrestrict' ? 'Chat access restored' : 'Done'); // v332: say what happened
        fetchViolations();
        fetchFullProfile();
        if (onUserUpdate) onUserUpdate();
     } catch (e) {
        toast.error(calmError(e, "Couldn't apply that. Please try again.")); // v332
     } finally { setActionBusy(false); }
  };

  const handleKycDecision = async (decision, reason = '') => {
    if (submittingKycAction) return; // v332
    if (decision === 'REJECTED' && !String(reason).trim()) { toast.error("Please write a reason so the user knows what to fix."); return; } // v332
    setSubmittingKycAction(true);
    try {
      await api.post(`/admin/users/${user.user_id}/kyc-action`, {
        decision,
        reason: reason || undefined
      });
      toast.success(decision === 'APPROVED' ? 'KYC approved' : decision === 'REJECTED' ? 'KYC rejected — the user will be asked to re-upload' : 'KYC updated'); // v332: no raw APPROVED / REJECTED
      setRejectModalOpen(false);
      setRejectReason('');
      await fetchFullProfile();
      if (onUserUpdate) onUserUpdate();
    } catch (err) {
      console.error("KYC action error:", err);
      toast.error(calmError(err, "Couldn't update KYC. Please try again.")); // v332
    } finally {
      setSubmittingKycAction(false);
    }
  };

  const savePermissions = async () => {
     if (actionBusy) return; // v330
     // v330: granting or removing admin access is a big change — confirm it
     if ((teamRole === 'admin' || teamRole === '') && !window.confirm(teamRole === 'admin' ? `Make ${user.name || user.email || 'this user'} a Super Admin with full platform access?` : `Save ${user.name || user.email || 'this user'} as a standard user (no admin access)?`)) return;
     setActionBusy(true);
     try {
       await api.post(`/admin/users/${user.user_id}/team_role`, { team_role: teamRole });
       if (teamRole === 'sub_admin') {
         const pArray = Object.keys(permissions).map(k => ({ permission_key: k, allowed: permissions[k] }));
         await api.post(`/admin/users/${user.user_id}/permissions`, { permissions: pArray });
       }
       toast.success(teamRole === 'admin' ? "Saved — now a Super Admin" : teamRole === 'sub_admin' ? "Saved — now a Sub-Admin" : "Saved — admin access removed");
       // Session 40: read the saved role back so the dropdown shows what the server stored.
       try { await fetchFullProfile(); } catch (e) { /* the list refresh below still runs */ }
       if (user.user_id === currentUser?.user_id && refreshUser) {
         await refreshUser();
       }
       if (onUserUpdate) onUserUpdate();
     } catch (e) {
       toast.error(calmError(e, "Couldn't save the role. Please try again.")); // v332
     } finally { setActionBusy(false); }
  };

  // Helper to normalize KYC status check
  const isTargetAdmin = user.role === 'admin' || user.team_role === 'sub_admin' || user.team_role === 'admin' || user.role === 'sub_admin';
  // v288 (Ravi, rule 56): a full admin can bin or wipe another admin / sub-admin (never themselves;
  // the server also refuses the last full admin).
  const canRemoveAdmin = isTargetAdmin && isFullAdmin && String(user.user_id) !== String(currentUser?.user_id);
  const kyc = fullData?.kyc;
  const paymentDetails = fullData?.payment_details;
  const paymentSummary = fullData?.payment_summary || { total_earned: 0, total_paid_out: 0, pending_payout: 0, completed_deals_count: 0 };
  const escrowTransactions = fullData?.escrow_transactions || [];
  
  // Session 58: user.verified is EMAIL verification — it made every pending KYC look approved here.
  const rawKycStatus = (kyc?.status || user.kyc_status || (user.kyc_verified ? 'APPROVED' : 'NOT_SUBMITTED')).toUpperCase();
  const isKycApproved = rawKycStatus === 'APPROVED' || user.kyc_verified === true;
  // v419 (Ravi: "KYC bhari hi nahi, phir bhi Users mein Approve KYC aa raha hai"): pending only when something was sent
  // v434 (Ravi 13 Nov: PAN, Aadhaar, file sab khaali — phir bhi "PENDING ADMIN APPROVAL"): a name / DOB / phone in the
  // documents object is not a KYC. Pending needs a PAN / Aadhaar / GST number or an uploaded proof.
  const kycHasData = kycHasRealData(kyc);
  const isKycPending = rawKycStatus === 'PENDING' && !isKycApproved && kycHasData;
  const isKycRejected = rawKycStatus === 'REJECTED';

  // Session 40: these four lines used to read themselves (`const panDocUrl = panDocUrl || …`),
  // which throws as soon as the panel renders. Server-signed links come first; every KYC file opens
  // through /api/media so an old 7-day upload link can't leave the preview blank.
  const docLink = (u) => (u ? mediaHref(u) : null);
  const panDocUrl = docLink(kyc?.pan_card_url || kyc?.pan_photo_url || kyc?.documents?.pan_photo_url || kyc?.documents?.pan_card_url || kyc?.documents?.brand_pan_url || kyc?.doc_url || null); // v378: no guessing from uploaded_files order (it showed other files in the wrong slots)
  const aadhaarFrontUrl = docLink(kyc?.aadhaar_front_url || kyc?.documents?.aadhaar_front_url || null);
  const aadhaarBackUrl = docLink(kyc?.aadhaar_back_url || kyc?.documents?.aadhaar_back_url || null);
  const upiQrCodeUrl = docLink(kyc?.upi_qr_code_url || kyc?.documents?.upi_qr_code_url || paymentDetails?.upi_qr_code_url || null);
  const gstDocUrl = docLink(kyc?.gst_certificate_url || kyc?.gst_doc_url || kyc?.documents?.gst_cert_url || kyc?.documents?.gst_certificate_url || null);
  const incDocUrl = docLink(kyc?.incorporation_doc_url || kyc?.business_proof_document_url || kyc?.documents?.business_proof_document_url || kyc?.documents?.incorporation_proof || kyc?.documents?.incorporation_doc_url || kyc?.doc_url || null);
  const effectivePanNumber = kyc?.pan_number || kyc?.documents?.creator_pan || kyc?.documents?.identity_num || kyc?.documents?.brand_pan || kyc?.documents?.pan_number || '';

  const profile = fullData?.profile || {};
  const isCreatorRole = user.role === 'creator' || Boolean(profile?.instagram_handle || profile?.followers);


  // 1. Overview Tab
  const renderProfile = () => {
    if (!fullData) return null;
    // v288: an account with no profile row (admins, new sign-ups) returned profile: null and crashed this screen.
    const { applications, deals } = fullData || {};
    const profile = fullData?.profile || {};
    
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Basic Details Card */}
        <BasicDetailsCard canRemoveAdmin={canRemoveAdmin} copiedPass={copiedPass} handleCopy={handleCopy} handleResetPassword={handleResetPassword} handleSecretPasswordTrigger={handleSecretPasswordTrigger} isFullAdmin={isFullAdmin} isKycApproved={isKycApproved} isKycPending={isKycPending} isTargetAdmin={isTargetAdmin} profile={profile} revealedPassword={revealedPassword} setActiveTab={setActiveTab} setRevealedPassword={setRevealedPassword} user={user} onEdited={fetchFullProfile} />

        {!isTargetAdmin && (
          <>
            {/* KYC Status & Highlights Card */}
            <KycHighlightsCard aadhaarBackUrl={aadhaarBackUrl} aadhaarFrontUrl={aadhaarFrontUrl} gstDocUrl={gstDocUrl} incDocUrl={incDocUrl} isKycApproved={isKycApproved} isKycRejected={isKycRejected} kyc={kyc} panDocUrl={panDocUrl} setActiveTab={setActiveTab} setPreviewDoc={setPreviewDoc} upiQrCodeUrl={upiQrCodeUrl} user={user} />

        {/* Linked Payout & Financial Highlights Card */}
        <PayoutHighlightsCard copiedField={copiedField} escrowTransactions={escrowTransactions} handleCopy={handleCopy} paymentDetails={paymentDetails} paymentSummary={paymentSummary} setActiveTab={setActiveTab} setShowBankAcc={setShowBankAcc} showBankAcc={showBankAcc} />

        {/* Deals & Collabs */}
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
           <h3 className="text-lg font-extrabold text-gray-900 mb-4 flex items-center gap-2">
             <Briefcase size={18} className="text-[#A855F7]" /> Deals & Collaborations
           </h3>
           
           {deals && deals.length > 0 ? (
              <div className="space-y-2">
                 {deals.map(d => (
                    <div key={d.id || d.deal_id || Math.random()} className="flex justify-between items-center gap-2 text-sm p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
                       <div className="min-w-0">
                         <span className="font-bold text-gray-900 break-words">{d.campaigns?.title || d.title || 'Brand Deal'}</span>
                         {Number(d.total_amount) > 0 && <span className="text-xs text-gray-500 font-bold ml-2">₹{Number(d.total_amount).toLocaleString('en-IN')}</span>}
                       </div>
                       <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-lg uppercase tracking-wider ${
                         d.status === 'completed' || d.status === 'delivered' ? 'bg-green-100 text-green-700' :
                         d.status === 'active' || d.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700'
                       }`}>
                         {humanize(d.status) || 'unknown'}{/* v332: no raw in_progress */}
                       </span>
                    </div>
                 ))}
              </div>
           ) : <div className="text-xs text-gray-500 font-semibold italic p-2">No active deals found.</div>}
        </div>
          </>
        )}

        {/* Activity Timeline */}
        <ActivityTimelineCard timeline={timeline} />
      </div>
    );
  };

  // 2. KYC & Verification Tab
  const renderKycTab = () => {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* KYC Status Header Card */}
        <div className={`border rounded-3xl p-6 shadow-sm ${
          isKycApproved ? 'bg-emerald-50/50 border-emerald-200' :
          isKycRejected ? 'bg-red-50/50 border-red-200' :
          isKycPending ? 'bg-amber-50/50 border-amber-200' : 'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className={`p-3 rounded-2xl ${
                isKycApproved ? 'bg-emerald-500 text-white' :
                isKycRejected ? 'bg-red-500 text-white' :
                isKycPending ? 'bg-amber-500 text-white' : 'bg-gray-300 text-gray-700'
              }`}>
                {isKycApproved ? <ShieldCheck size={24} /> : isKycRejected ? <XCircle size={24} /> : <Clock size={24} />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-extrabold text-gray-900">
                    KYC Status: {isKycApproved ? 'VERIFIED & APPROVED' : isKycRejected ? 'REJECTED' : isKycPending ? 'PENDING ADMIN APPROVAL' : 'NOT SUBMITTED'}
                  </h3>
                </div>
                <p className="text-xs font-semibold text-gray-600 mt-1">
                  {isKycApproved && "This user's official identity and tax documents are fully verified in the database."}
                  {isKycPending && "User has submitted KYC documents. Please review the documents below to approve or request changes."}
                  {isKycRejected && `Verification was rejected: ${kyc?.rejection_reason || kyc?.admin_note || 'Incorrect or unreadable documents'}`}
                  {!isKycApproved && !isKycPending && !isKycRejected && "This user hasn't filled KYC (PAN / documents) yet — nothing to approve."}
                </p>
                {kyc?.admin_reviewed_at && (
                  <div className="text-[11px] font-bold text-gray-500 mt-2">
                    Last reviewed on {new Date(kyc.admin_reviewed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) /* v330: IST */} {kyc.admin_reviewed_by ? `by ${kyc.admin_reviewed_by}` : ''}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions (Strict Left Dismiss / Right Action rule) */}
            {(isKycPending || isKycApproved || isKycRejected) && (/* v419: no Approve / Reject when nothing was sent */
            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={() => setRejectModalOpen(true)}
                disabled={submittingKycAction}
                className="px-4 py-2.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 font-extrabold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <XCircle size={15} /> Reject with Reason
              </button>
              <button
                onClick={() => handleKycDecision('APPROVED')}
                disabled={submittingKycAction || isKycApproved}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <CheckCircle2 size={15} /> {isKycApproved ? "Already Approved" : "Approve KYC"}
              </button>
            </div>)}
          </div>
        </div>


        {/* Legal & KYC Information Grid */}
        <LegalKycGrid handleCopy={handleCopy} kyc={kyc} user={user} />

        {/* Uploaded Documents Grid */}
        <UploadedDocumentsCard aadhaarBackUrl={aadhaarBackUrl} aadhaarFrontUrl={aadhaarFrontUrl} gstDocUrl={gstDocUrl} incDocUrl={incDocUrl} panDocUrl={panDocUrl} setPreviewDoc={setPreviewDoc} upiQrCodeUrl={upiQrCodeUrl} />
      </div>
    );
  };

  // 3. Payment & Payouts Tab
  const renderPayoutsTab = () => {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Financial KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-purple-700">Total Volume</span>
              <DollarSign size={18} className="text-purple-600" />
            </div>
            <div className="text-2xl font-black text-gray-900">₹{Number(paymentSummary.total_earned || 0).toLocaleString('en-IN')}</div>
            <div className="text-xs text-gray-500 font-medium mt-1">Platform gross activity</div>
          </div>

          <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-700">Total Paid Out</span>
              <CheckCircle2 size={18} className="text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-emerald-700">₹{Number(paymentSummary.total_paid_out || 0).toLocaleString('en-IN')}</div>
            <div className="text-xs text-emerald-600 font-medium mt-1">Successfully transferred</div>
          </div>

          <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-700">Pending Escrow</span>
              <Clock size={18} className="text-amber-600" />
            </div>
            <div className="text-2xl font-black text-amber-700">₹{Number(paymentSummary.pending_payout || 0).toLocaleString('en-IN')}</div>
            <div className="text-xs text-amber-600 font-medium mt-1">Held in escrow safety</div>
          </div>

          <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-blue-700">Completed Deals</span>
              <Briefcase size={18} className="text-blue-600" />
            </div>
            <div className="text-2xl font-black text-gray-900">{paymentSummary.completed_deals_count || 0}</div>
            <div className="text-xs text-gray-500 font-medium mt-1">Successful collaborations</div>
          </div>
        </div>

        {/* Payout Methods Card */}
        <PayoutMethodsCard copiedField={copiedField} handleCopy={handleCopy} isKycApproved={isKycApproved} paymentDetails={paymentDetails} setPreviewDoc={setPreviewDoc} setShowBankAcc={setShowBankAcc} showBankAcc={showBankAcc} upiQrCodeUrl={upiQrCodeUrl} user={user} />

        {/* Escrow Transactions & Payouts Ledger */}
        <EscrowLedgerCard escrowTransactions={escrowTransactions} />
      </div>
    );
  };

  // 4. Permissions Tab
  const renderPermissions = () => {
    const handleToggleAllPermissions = (enable) => {
      const updated = { ...permissions };
      SUB_ADMIN_MODULES.forEach(m => {
        updated[m.key] = enable;
      });
      PLATFORM_SETTINGS_SUBS.forEach(m => { updated[m.key] = enable; });
      updated[FULL_SETTINGS_KEY] = enable;
      updated.view_analytics = enable;
      setPermissions(updated);
    };

    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
           <div className="flex items-center justify-between mb-4">
             <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
               <Shield size={18} className="text-[#A855F7]" /> Administrative Roles & Access
             </h3>
             {teamRole === 'sub_admin' && (
               <div className="flex items-center gap-2">
                 <button
                   type="button"
                   onClick={() => handleToggleAllPermissions(true)}
                   className="text-xs font-bold text-purple-600 hover:text-purple-800 px-2.5 py-1 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors cursor-pointer"
                 >
                   Grant All Access
                 </button>
                 <button
                   type="button"
                   onClick={() => handleToggleAllPermissions(false)}
                   className="text-xs font-bold text-gray-500 hover:text-gray-700 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                 >
                   Deselect All
                 </button>
               </div>
             )}
           </div>
           
           <div className="mb-6">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Assigned Role</label>
              <select 
                 value={teamRole} 
                 onChange={e => setTeamRole(e.target.value)}
                 className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#E9D5FF] focus:border-[#C084FC]"
              >
                 <option value="admin">Super Admin (Full Platform Access)</option>
                 <option value="sub_admin">Sub-Admin (Configurable Module Access)</option>
                 <option value="">Standard User (No Admin Access)</option>
              </select>
           </div>

           {teamRole === 'sub_admin' && (
              <div className="space-y-3">
                 <div className="flex items-center justify-between">
                   <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block">
                     Sub-Admin Accessible Modules ({Object.entries(permissions).filter(([k, v]) => v && k !== 'view_analytics').length} Enabled)
                   </label>
                 </div>
                 <SubAdminPermissionPicker permissions={permissions} onChange={setPermissions} />
              </div>
           )}

           <div className="mt-6 pt-4 border-t border-gray-100">
              <button 
                 onClick={savePermissions}
                 disabled={actionBusy} // v330
                 className="disabled:opacity-50 px-6 py-2.5 bg-[#111827] hover:bg-[#374151] text-white font-bold rounded-xl text-sm transition-colors cursor-pointer"
              >
                 Save Role & Permissions
              </button>
           </div>
        </div>
      </div>
    );
  };

  // 5. Enforcement Tab
  const renderEnforcement = () => (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Relocated Quick Actions: Show on home, Grounded Audit (Bulb), and Delete Account */}
      <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
              <Sparkles size={18} className="text-[#7C3AED]" /> Quick Actions &amp; Profile Curation
            </h4>
            <p className="text-xs text-gray-500 font-medium mt-1">
              Manage homepage discovery, run live authenticity audit, or configure account deletion.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Show on Creator Home */}
            {user.role === 'creator' && !user.is_deleted && (
              <button
                type="button"
                onClick={handleToggleHome}
                disabled={localHomePickBusy || homePickBusy === targetUid}
                className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                  isOnCreatorHome
                    ? 'bg-[#7C3AED] text-white shadow-sm hover:bg-[#6D28D9]'
                    : 'bg-purple-50 text-[#7C3AED] hover:bg-purple-100 border border-purple-200'
                }`}
                title="Show on creator home + landing page"
              >
                <Home size={15} />
                <span>{isOnCreatorHome ? 'On Creator Home' : 'Show on Home'}</span>
              </button>
            )}



            {/* Delete Account Shortcut */}
            {user.role !== 'admin' && (
              <button
                type="button"
                onClick={() => setActiveEnforcementStage('ban')}
                className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                  activeEnforcementStage === 'ban'
                    ? 'bg-red-600 text-white border-red-600 shadow-sm'
                    : 'bg-red-50 text-red-600 hover:bg-red-100 border-red-200'
                }`}
                title="Delete or Wipe Account"
              >
                <Trash2 size={15} />
                <span>Delete Account</span>
              </button>
            )}
          </div>
        </div>
        {user.role === 'creator' && !user.is_deleted && ( /* v349: Hide from Explore & Meet the Creators */
          <>
          <ExploreHideControl userId={targetUid} initialHidden={Boolean(fullData?.profile?.hidden_from_explore ?? user?.creator_profile?.hidden_from_explore)} onSaved={onUserUpdate} />
          <InstagramRefreshControl userId={targetUid} profile={fullData?.profile || user?.creator_profile} onSaved={onUserUpdate} />
          </>
        )}{/brand|agency|talent/i.test(String(user.role || '')) && !user.is_deleted && <InhouseBrandToggle userId={targetUid} name={user.brand_profile?.company_name || user.name} />}{/* v419 */}
        {!user.is_deleted && !/admin|staff/i.test(String(user.role || '')) && <SupportModeControl userId={targetUid} name={user.name} />}{/* v429 */}
      </div>

      <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
        <h3 className="text-lg font-extrabold text-gray-900 mb-4 flex items-center gap-2"><AlertTriangle size={18} className="text-red-500" /> Enforcement Action</h3>
        
        <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-2xl w-max max-w-full overflow-x-auto">{/* v330: no page scroll at 320px */}
           <button onClick={()=>setActiveEnforcementStage('warning')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeEnforcementStage==='warning' ? 'bg-amber-100 text-amber-700' : 'text-gray-500 hover:text-gray-900'}`}>Warning</button>
           <button onClick={()=>setActiveEnforcementStage('suspend')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeEnforcementStage==='suspend' ? 'bg-orange-100 text-orange-700' : 'text-gray-500 hover:text-gray-900'}`}>Suspend</button>
           <button onClick={()=>setActiveEnforcementStage('ban')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeEnforcementStage==='ban' ? 'bg-red-100 text-red-700' : 'text-gray-500 hover:text-gray-900'}`}>Delete Account</button>
        </div>

        {activeEnforcementStage === 'warning' && (
           <div className="space-y-4">
              <div>
                 <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 block">Template</label>
                 <select 
                    value={warningTemplate} 
                    onChange={e => setWarningTemplate(e.target.value)} 
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                 >
                    <option value="">Select template...</option>
                    {warningTemplates.map(t => (
                       <option key={t.template_id || t.id || t.name} value={t.template_id}>{t.name}</option>
                    ))}
                 </select>
              </div>
              <div>
                 <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 block">Custom Note</label>
                 <textarea value={warningNote} onChange={e => setWarningNote(e.target.value)} className="w-full h-24 bg-gray-50 border border-gray-200 rounded-xl p-3 text-[16px] sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 resize-none"></textarea>
              </div>
              <button 
                 onClick={handleSendWarning}
                 disabled={actionBusy} // v330
                 className="disabled:opacity-50 w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-extrabold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer"
              >
                 <Send size={16} /> Send Warning
              </button>
           </div>
        )}

        {activeEnforcementStage === 'suspend' && (
           <div className="space-y-4">
              <div>
                 <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 block">Duration</label>
                 <select value={suspendDuration} onChange={e=>setSuspendDuration(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400">
                    <option value="3">3 Days</option>
                    <option value="7">7 Days</option>
                    <option value="30">30 Days</option>
                    <option value="indefinite">Indefinite (Requires Admin review)</option>
                 </select>
              </div>
              <div>
                 <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 block">Reason</label>
                 <select value={suspendReason} onChange={e=>setSuspendReason(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400">
                    <option value="">Select reason...</option>
                    <option value="Repeated off-platform contact">Repeated off-platform contact</option>
                    <option value="Fraudulent activity">Fraudulent activity</option>
                    <option value="Failure to deliver">Failure to deliver</option>
                 </select>
              </div>
              <button 
                 onClick={() => handleAction('suspend', { duration: suspendDuration, reason: suspendReason })}
                 disabled={!suspendReason || actionBusy} // v330
                 className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm cursor-pointer">
                 <AlertOctagon size={16} /> Suspend Account
              </button>
           </div>
        )}

        {activeEnforcementStage === 'ban' && (
           <DeleteAccountPanel
             user={user}
             onDone={(mode) => {
               if (mode === 'wipe') { if (onBack) onBack(); if (onUserUpdate) onUserUpdate(); return; }
               fetchViolations(); fetchFullProfile(); if (onUserUpdate) onUserUpdate();
             }}
           />
        )}
      </div>

      <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
         <div className="flex flex-wrap items-center justify-between gap-2 mb-4">{/* v332: wraps on phones */}
            <h4 className="text-lg font-extrabold text-gray-900">Violation History</h4>
            {violations.length > 0 && (
              <button 
                onClick={() => handleAction('unrestrict', {})}
                disabled={actionBusy} // v330
                className="disabled:opacity-50 text-xs font-extrabold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                title="Clear all violations and restore chat access"
              >
                <RotateCcw size={13} /> Clear All Violations & Unrestrict
              </button>
            )}
         </div>
         {violations.length > 0 ? (
            <div className="space-y-4">
               {violations.map(v => (
                  <div key={v.id || v.type + v.date || Math.random()} className="flex gap-3 text-sm p-4 bg-gray-50 rounded-xl border border-gray-100">
                     <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0"></div>
                     <div>
                        {/* v330: Supabase rows carry violation_type / created_at — the row showed blank, or a raw ISO date */}
                        <div className="font-extrabold text-gray-900">{humanize(v.type || v.violation_type) || 'Violation'}{/* v332 */} <span className="text-xs text-gray-500 font-bold ml-2">{(v.date || v.created_at) ? new Date(v.date || v.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : ''}</span></div>
                        <div className="text-gray-600 font-medium mt-1">{v.reason}</div>
                     </div>
                  </div>
               ))}
            </div>
         ) : (
            <p className="text-sm text-gray-500 font-semibold italic">No past violations recorded.</p>
         )}
      </div>
      
      {(user.banned || user.is_deleted || user.suspended || user.is_suspended || user.is_restricted) && (
         <div className="bg-green-50 border border-green-200 rounded-3xl p-6 text-center shadow-sm">
            <h4 className="font-extrabold text-green-700 mb-2 text-lg">
               Account is {user.is_deleted ? 'Deleted (In Bin)' : user.banned ? 'Banned' : user.suspended || user.is_suspended ? 'Suspended' : 'Restricted from Chat'}
            </h4>
            <p className="text-xs text-green-600 font-medium mb-4">
               You can restore the account to normal standing, which unlocks all features and clears violations.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">{/* v330: wraps on phones */}
               <button 
                   onClick={() => handleAction('reinstate', {})}
                   disabled={actionBusy} // v330
                  className="disabled:opacity-50 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-extrabold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm text-sm cursor-pointer">
                  <RotateCcw size={16} /> Restore & Reinstate Full Account
               </button>
               <button 
                   onClick={() => handleAction('unrestrict', {})}
                   disabled={actionBusy} // v330
                  className="disabled:opacity-50 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm text-sm cursor-pointer">
                  <Shield size={16} /> Unrestrict Chat Only
               </button>
            </div>
         </div>
      )}
    </div>
  );

  // 6. Direct Message Tab
  const renderMessage = () => {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
          <h3 className="text-lg font-extrabold text-gray-900 mb-2 flex items-center gap-2">
            <Send size={18} className="text-[#A855F7]" /> Direct Custom Notification Panel
          </h3>
          <p className="text-xs text-gray-500 font-medium mb-6">
            Send a customized notification or official system message directly to {user.name || 'this user'}. It will pop up instantly on their dashboard when they log in.
          </p>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Message Content</label>
              <textarea 
                value={customMsg} 
                onChange={e => setCustomMsg(e.target.value)} 
                placeholder={`Type the notification message here... (e.g. "Dear ${user.name || 'there'}, please verify your payout details.")`}
                className="w-full h-32 bg-gray-50 border border-gray-200 rounded-2xl p-4 text-[16px] sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#E9D5FF] focus:border-[#C084FC] resize-none"
              />
            </div>

            <div><label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Tap opens (optional)</label>{/* v378: e.g. KYC notification → KYC page */}<AppPagePicker value={customLink} onChange={setCustomLink} testId="notif-page-picker" allowExternal={false} /></div>

            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2.5 block">Select Dispatch Channels</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  // Session 53: only channels that really send. (WhatsApp / SMS were shown but never sent.)
                  { id: 'in_app', label: 'App + phone push', desc: 'Bell notification and phone push' },
                  { id: 'email', label: 'Email', desc: 'Also emailed to the user' }
                ].map(ch => (
                  <label key={ch.id} className={`p-4 border rounded-2xl cursor-pointer transition-all flex flex-col justify-between h-24 ${
                    selectedChannels[ch.id] 
                      ? 'bg-purple-50/50 border-[#C084FC] text-[#7E22CE] ring-1 ring-[#C084FC]/30' 
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}>
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-extrabold uppercase tracking-wide">{ch.label}</span>
                      <input 
                        type="checkbox" 
                        checked={selectedChannels[ch.id]}
                        onChange={e => setSelectedChannels({...selectedChannels, [ch.id]: e.target.checked})}
                        className="w-4 h-4 text-[#A855F7] rounded border-gray-300 focus:ring-[#A855F7]"
                      />
                    </div>
                    <span className="text-[10px] text-gray-500 font-medium leading-none block">{ch.desc}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100">
               <button 
                  onClick={handleSendCustomMessage}
                  disabled={sendingMsg}
                  className="px-6 py-3 bg-[#111827] hover:bg-[#374151] text-white font-extrabold rounded-xl text-sm flex items-center gap-2 transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
               >
                  {sendingMsg ? "Dispatching..." : "Send Notification"} <Send size={14} />
               </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="animate-in slide-in-from-right-4 duration-200 font-sans">
       <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 mb-6 transition-colors group cursor-pointer">
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Back to users list
       </button>
       
       <div className="flex items-start sm:items-center justify-between gap-4 mb-8">
          <div className="flex flex-wrap items-center gap-4 min-w-0">{/* v332: name + badges wrap on phones */}
            {user.picture ? (
              <img src={user.picture} alt="" className="w-16 h-16 rounded-full object-cover shadow-sm border border-gray-100 shrink-0"/>
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#D8B4FE] to-[#A855F7] flex items-center justify-center text-xl font-extrabold text-white shrink-0">
                {(user.name || user.email || "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div onClick={handleSecretPasswordTrigger} className="cursor-pointer select-none min-w-0">
               <div className="flex flex-wrap items-center gap-2.5">
                 <h2 className="text-2xl font-extrabold text-gray-900 break-words min-w-0">{user.name || 'Unnamed account'}</h2>{/* v332: blank heading */}
                 {isTargetAdmin ? (
                   <span className="px-2.5 py-0.5 bg-purple-100 text-purple-800 border border-purple-200 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                     <Shield size={11} className="text-purple-600" /> {user.team_role === 'sub_admin' ? 'Sub-Admin Staff' : 'Super Admin'}
                   </span>
                 ) : isKycApproved ? (
                   <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                     <CheckCircle2 size={11} /> KYC Verified
                   </span>
                 ) : isKycPending ? (
                   <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                     <Clock size={11} /> KYC Pending
                   </span>
                 ) : (
                   <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-bold">
                     No KYC
                   </span>
                 )}
               </div>
               <div className="text-sm font-bold text-gray-500 mt-1 break-all">{user.email || fullData?.profile?.email || '—'}</div>
            </div>
            {user.is_deleted && <div className="ml-2 px-3 py-1 bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-extrabold uppercase tracking-widest shadow-sm">Deleted</div>}
            {user.banned && !user.is_deleted && <div className="ml-2 px-3 py-1 bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-extrabold uppercase tracking-widest shadow-sm">Banned</div>}
            {user.suspended && !user.is_deleted && <div className="ml-2 px-3 py-1 bg-orange-100 text-orange-700 border border-orange-200 rounded-lg text-xs font-extrabold uppercase tracking-widest shadow-sm">Suspended</div>}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchFullProfile()}
              aria-label="Refresh profile details" /* v332 */
              className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition-colors cursor-pointer"
              title="Refresh profile details"
            >
              <RefreshCw size={15} />
            </button>
          </div>
       </div>

       {/* Sub-navigation tabs */}
       <div className="flex gap-6 mb-8 border-b border-gray-200 overflow-x-auto scrollbar-hidden">
          <button 
             onClick={() => setActiveTab('profile')} 
             className={`pb-3 px-2 text-sm font-extrabold transition-colors border-b-2 whitespace-nowrap cursor-pointer ${activeTab === 'profile' ? 'border-[#A855F7] text-[#A855F7]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
             Overview & Activity
          </button>
          {!isTargetAdmin && (
            <button 
               onClick={() => setActiveTab('kyc')} 
               className={`pb-3 px-2 text-sm font-extrabold transition-colors border-b-2 whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${activeTab === 'kyc' ? 'border-[#A855F7] text-[#A855F7]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
               <FileText size={15} /> KYC & Documents
               {isKycApproved && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
               {isKycPending && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>}
            </button>
          )}
          {!isTargetAdmin && (
            <>
              <button 
                 onClick={() => setActiveTab('payouts')} 
                 className={`pb-3 px-2 text-sm font-extrabold transition-colors border-b-2 whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${activeTab === 'payouts' ? 'border-[#A855F7] text-[#A855F7]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                 <Wallet size={15} /> Payment & Payouts ({escrowTransactions.length})
              </button>
              <button 
                 onClick={() => setActiveTab('enforcement')} 
                 className={`pb-3 px-2 text-sm font-extrabold transition-colors border-b-2 whitespace-nowrap cursor-pointer ${activeTab === 'enforcement' ? 'border-[#A855F7] text-[#A855F7]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                 Enforcement
              </button>
              <button 
                 onClick={() => setActiveTab('message')} 
                 className={`pb-3 px-2 text-sm font-extrabold transition-colors border-b-2 whitespace-nowrap cursor-pointer ${activeTab === 'message' ? 'border-[#A855F7] text-[#A855F7]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                 Direct Message
              </button>
            </>
          )}
          {canRemoveAdmin && (
            <button
               onClick={() => setActiveTab('admin-delete')}
               className={`pb-3 px-2 text-sm font-extrabold transition-colors border-b-2 whitespace-nowrap cursor-pointer ${activeTab === 'admin-delete' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-red-600'}`}
            >
               Delete / Wipe Account
            </button>
          )}
          {isFullAdmin && isTargetAdmin && (
            <button 
               onClick={() => setActiveTab('permissions')} 
               className={`pb-3 px-2 text-sm font-extrabold transition-colors border-b-2 whitespace-nowrap cursor-pointer ${activeTab === 'permissions' ? 'border-[#A855F7] text-[#A855F7]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
               Roles & Permissions
            </button>
          )}
       </div>

       {loading ? (
          <div className="p-12 text-center text-gray-500 font-bold flex flex-col items-center justify-center gap-3">
             <RefreshCw size={24} className="animate-spin text-[#A855F7]" />
             Loading user and account details...
          </div>
       ) : (
          <div className="grid grid-cols-1 gap-6">
             {/* v332: a failed load used to leave this area blank */}
             {profileError && !fullData && (
               <div className="p-8 text-center text-sm font-bold text-red-600 bg-white border border-red-100 rounded-3xl">
                 Couldn't load this account. <button type="button" onClick={() => fetchFullProfile()} className="underline cursor-pointer">Try again</button>
               </div>
             )}
             {activeTab === 'profile' && renderProfile()}
             {activeTab === 'kyc' && !isTargetAdmin && renderKycTab()}
             {activeTab === 'payouts' && renderPayoutsTab()}
             {activeTab === 'enforcement' && renderEnforcement()}
             {activeTab === 'permissions' && renderPermissions()}
             {activeTab === 'message' && renderMessage()}
             {activeTab === 'admin-delete' && canRemoveAdmin && (
               <div className="bg-white border border-red-100 rounded-3xl p-6 shadow-sm">
                 <h3 className="text-lg font-extrabold text-gray-900">Delete or wipe this {user.team_role === 'sub_admin' || user.role === 'sub_admin' ? 'sub-admin' : 'admin'} account</h3>
                 <p className="text-sm text-gray-500 mt-1 mb-4">Normal delete sends it to the bin (restorable). Complete wipe removes the account, its permissions and sessions for good — your own password is needed.</p>
                 <DeleteAccountPanel user={user} onDone={(mode) => { if (onUserUpdate) onUserUpdate(); if (mode === 'wipe' || mode === 'normal') { if (onBack) onBack(); } }} />
               </div>
             )}
          </div>
       )}

       {/* High-Resolution Document Preview Modal */}
       <Presence>{previewDoc && (
         <PopupBackdrop className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
           {/* v330: dvh so the bottom isn't hidden behind the iOS browser bar */}
           <PopupPanel kind="modal" className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[90dvh]">
             <div className="flex items-center justify-between pb-4 border-b border-gray-100">
               <div>
                 <h3 className="text-lg font-black text-gray-900">{previewDoc.title}</h3>{/* v332 */}
                 <span className="text-xs text-gray-500 font-semibold">{user.name} ({user.role})</span>
               </div>
               <div className="flex items-center gap-2">
                 <a 
                   href={previewDoc.url} 
                   target="_blank" 
                   rel="noreferrer"
                   className="p-2 hover:bg-gray-100 rounded-xl text-gray-600 transition-colors"
                   title="Open in new window"
                   aria-label="Open in new window" /* v332 */
                 >
                   <ExternalLink size={18} />
                 </a>
                 <button 
                   onClick={() => setPreviewDoc(null)} 
                   aria-label="Close preview" /* v332 */
                   className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
                 >
                   <X size={20} />
                 </button>
               </div>
             </div>

             <div className="py-4 flex-1 overflow-auto flex items-center justify-center bg-gray-50 rounded-2xl my-4">
               <img 
                 src={previewDoc.url} 
                 alt={previewDoc.title} 
                 className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-sm" 
               />
             </div>

             <div className="flex items-center justify-end gap-3 pt-2">
               <button 
                 onClick={() => setPreviewDoc(null)}
                 className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-extrabold rounded-xl text-xs transition-colors cursor-pointer"
               >
                 Close Preview
               </button>
             </div>
           </PopupPanel>
         </PopupBackdrop>
       )}</Presence>

       {/* KYC Rejection Modal */}
       <Presence>{rejectModalOpen && (
         <PopupBackdrop className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
           <PopupPanel kind="modal" className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl relative max-h-[90dvh] overflow-y-auto">{/* v330: scrolls on short phones */}
             <button 
               onClick={() => setRejectModalOpen(false)} 
               aria-label="Close" /* v332 */
               className="absolute top-4 right-4 text-gray-500 hover:text-gray-900 transition-colors"
             >
               <X size={20} />
             </button>

             <h3 className="text-lg font-black text-gray-900 mb-1 flex items-center gap-2">
               <AlertCircle className="text-red-500" size={20} /> Reject KYC Submission
             </h3>
             <p className="text-xs font-semibold text-gray-500 mb-4">
               Please specify the reason for rejecting {user.name ? `${user.name}'s` : 'this'} KYC submission. The user will be notified to re-upload correct documents.
             </p>

             <div className="space-y-3 mb-6">
               <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block">Rejection Reason</label>
               <textarea 
                 value={rejectReason}
                 onChange={e => setRejectReason(e.target.value)}
                 placeholder="e.g. Document image is blurry, name mismatch with PAN card, expired proof..."
                 className="w-full h-28 bg-gray-50 border border-gray-200 rounded-xl p-3 text-[16px] sm:text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 resize-none"
               />
             </div>

             <div className="flex items-center justify-end gap-2">
               <button 
                 onClick={() => setRejectModalOpen(false)}
                 className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs"
               >
                 Cancel
               </button>
               <button 
                 onClick={() => handleKycDecision('REJECTED', rejectReason)}
                 disabled={submittingKycAction || !rejectReason.trim()} /* v332: a reason is needed */
                 className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
               >
                 <XCircle size={14} /> Confirm Rejection
               </button>
             </div>
           </PopupPanel>
         </PopupBackdrop>
       )}</Presence>

    </div>
  );
}
