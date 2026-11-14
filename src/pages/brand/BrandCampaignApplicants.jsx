import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { api } from "../../lib/api";
import { toast } from "sonner";
import ApplicantCard from "../../components/campaigns/ApplicantCard";
import RejectApplicantSheet from "../../components/campaigns/RejectApplicantSheet";
import { campaignBudgetText, campaignErrorText } from "../../components/campaigns/mobile/HomeCampaignCard"; // v415: shared budget rule · v416: calm 5xx text
import { Presence, PopupBackdrop, PopupPanel } from "../../components/common/Popup"; // v416: desktop close-campaign confirm
import { ArrowLeft, Megaphone, Users, HelpCircle, Pause, Play, X, Loader2, PlayCircle } from "lucide-react"; // v417: + PlayCircle
import { useLiveRefresh } from "../../lib/liveRefresh";
import useIsMobile from "../../hooks/useIsMobile";
import BrandCampaignDetailMobile, { PitchPlayer } from "../../components/campaigns/mobile/BrandCampaignDetailMobile"; // v417: + shared pitch player
import { hiredCreatorIds } from "../../lib/hiredCreators";
import { maskContact } from "../../utils/maskContact";
import { publicOrigin } from "../../lib/publicUrl";

export default function BrandCampaignApplicants() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [campaign, setCampaign] = useState(location.state?.campaign || null);
  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(true);
  // v415: "Predict ROI" removed — the server estimate used made-up numbers (default followers, formula ROI).
  const [appsError, setAppsError] = useState(false); // v330: failed load ≠ "No applicant entries yet"
  const actionBusy = useRef(false); // v330: double tap on Shortlist/Decline sent the action twice
  const isMobile = useIsMobile();

  const [campError, setCampError] = useState(false); // v416: campaign itself failed to load → no made-up "Live · Budget not set"
  const loadData = async ({ silent = false, fresh = false } = {}) => {
    const opts = fresh ? { bypassCache: true } : undefined; // v416 (CR11): live refresh reads fresh data
    try {
      if (!silent) setLoading(true);
      
      // Fetch campaign details
      try {
        const { data: campDetail } = await api.get(`/campaigns/${id}`, opts);
        if (campDetail) {
          setCampaign(campDetail);
          setCampError(false);
        }
      } catch (e) {
        let listFailed = false;
        const { data: camps } = await api.get("campaigns?mine=true", opts).catch(() => { listFailed = true; return { data: [] }; });
        const found = Array.isArray(camps) ? camps.find(c => String(c.campaign_id || c.id) === String(id)) : null;
        if (found) {
          setCampaign(found);
          setCampError(false);
        } else if (listFailed) {
          setCampError(true); // v416
        }
      }
      
      // Fetch actual applicants from backend
      try {
        const { data: apps } = await api.get(`/campaigns/${id}/applications`, opts);
        setApplicants(Array.isArray(apps) ? apps : []); // v332: a non-list answer crashed the list
        setAppsError(false);
      } catch (err) {
        // v330: keep the list already on screen (a background refresh blip emptied it); flag the error.
        setAppsError(true);
      }
      
    } catch (e) {
      toast.error(campaignErrorText(e, "Couldn't load applicants. Please try again."), { id: "applicants-load" }); // v332 · v416: no raw 5xx detail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  // Session 28: a creator applies → the applicant appears here within seconds (no refresh).
  useLiveRefresh(loadData, { types: ["application", "campaign", "deal", "chat"], intervalMs: 30000 });

  const [shortlistingId, setShortlistingId] = useState(null); // v358: visible busy state on the tapped card
  const handleShortlist = async (app) => {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setShortlistingId(app.application_id);
    try {
      const { data } = await api.post(`/campaigns/${id || campaign?.campaign_id}/applications/${app.application_id}/action`, { action: "accept" });
      const who = app.full_name || app.creator_name || app.name || "Creator"; // v332: no "undefined has been shortlisted"
      if (data?.thread_id) { // v330: no crash (and a contradicting error toast) on an empty reply
        toast.success(`${who} has been shortlisted! Opening the chat.`);
        navigate(`/chat/${data.thread_id}`);
      } else {
        // v358: one clear message (it said "Opening the chat" and then "thread not found") + refresh the card
        toast.success(`${who} has been shortlisted. Open the chat from Inbox.`);
        loadData({ silent: true });
      }
    } catch (err) {
      toast.error(campaignErrorText(err, "Couldn't shortlist this creator. Please try again."), { id: "applicant-action" }); // v332 · v416: no raw 5xx detail
    } finally {
      actionBusy.current = false;
      setShortlistingId(null);
    }
  };

  // v333 (Ravi): the app's own Decline sheet instead of the browser's grey prompt box. Same API call.
  const [rejecting, setRejecting] = useState(null);
  const handleReject = (app) => { if (!actionBusy.current) setRejecting(app); };
  const confirmReject = async (reason) => {
    const app = rejecting;
    if (!app || actionBusy.current) return;
    actionBusy.current = true;
    try {
      // Session 25: the reason goes with the API call. This also wrote a "brand_applications"
      // table from the browser — the app's table is campaign_applications, so that write went
      // nowhere (or into a leftover table anyone could write).
      await api.post(`/campaigns/${id || campaign?.campaign_id}/applications/${app.application_id}/action`, { action: "reject", reason });

      toast.success("Application declined."); // v332: plain copy
      // v415: mark it declined instead of dropping it — the phone "Passed" tab counts it right away
      // (it vanished, then came back on the next refresh).
      setApplicants(prev => prev?.map(a => a.application_id === app.application_id ? { ...a, status: "rejected" } : a));
      setRejecting(null);
    } catch (e) {
      toast.error(campaignErrorText(e, "Couldn't decline this application. Please try again."), { id: "applicant-action" }); // v332 · v416: no raw 5xx detail
    } finally {
      actionBusy.current = false;
    }
  };
  const rejectSheet = <RejectApplicantSheet applicant={rejecting} onCancel={() => setRejecting(null)} onConfirm={confirmReject} />;

  const exportCsv = () => {
    if (!applicants.length) return toast.error("No applicants to export.");
    // Session 58: Email / Platform / Handle / Message were always blank (fields the API never sends).
    const headers = ["Name", "Instagram", "City", "Pitch", "Proposed amount", "Status"];
    const csvContent = applicants.map(a => 
      [a.full_name || a.creator_name || a.name, a.instagram_handle, a.city || a.creator_location, maskContact(a.pitch_text || a.pitch) /* v346 */, a.proposed_amount, a.status].map(val => `"${(val || "").toString().replace(/"/g, '""')}"`).join(",")
    );
    const blob = new Blob([headers.join(",") + "\n" + csvContent.join("\n")], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `applicants-${id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Session 33: which applicants are hired (secure payment hold funded) — from the same chat-thread list the
  // Chat button already reads. v416: desktop too (it now has the same New / Shortlisted / Hired / Passed tabs).
  const [hiredIds, setHiredIds] = useState(() => new Set());
  useEffect(() => {
    if (!(id || campaign?.campaign_id)) return undefined;
    let alive = true;
    api.get('chat/v2/threads').then(({ data }) => { if (alive) setHiredIds(hiredCreatorIds(data, id || campaign?.campaign_id)); }).catch(() => {});
    return () => { alive = false; };
  }, [id, campaign?.campaign_id, applicants?.length]);

  // v415: counts + share link for the desktop header / empty state
  const newCount = applicants.filter((a) => ["pending", "applied", "new", ""].includes(String(a?.status || "").toLowerCase())).length;
  const copyCampaignLink = async () => {
    try {
      await navigator.clipboard.writeText(`${publicOrigin()}/campaigns/${id}`); // v415: same public link as the phone
      toast.success("Campaign link copied");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  const handleProfileView = (app) => {
    navigate(`/creator/${app.creator_id}`);
  };

  const handleChat = async (app) => {
    try {
      // Find the thread
      const { data } = await api.get('chat/v2/threads');
      const thread = data.find(t => t.campaign_id === (app.campaign_id || id) && t.creator_id === app.creator_id);
      if (thread) {
        navigate(`/chat/${thread.id}`);
      } else {
        toast.error("Couldn't find this chat. Open it from Inbox.", { id: "applicant-chat" }); // v416: plain copy
      }
    } catch(err) {
      toast.error("Couldn't open the chat. Please try again.", { id: "applicant-chat" });
    }
  };

  // v416 (C8): desktop gets the phone's campaign actions (same endpoints) and the New / Shortlisted / Hired / Passed tabs.
  const lowerS = (v) => String(v || "").toLowerCase().trim();
  const campStatus = lowerS(campaign?.status);
  const isClosed = campStatus === "completed" || Boolean(campaign?.closed_at);
  const isPaused = Boolean(campaign?.applications_paused) && !isClosed;
  const isLive = (campStatus === "live" || campStatus === "approved") && !isClosed;
  const [manageBusy, setManageBusy] = useState(null); // "pause" | "close"
  const [confirmClose, setConfirmClose] = useState(false);
  const campId = id || campaign?.campaign_id;
  const togglePause = async () => {
    if (manageBusy) return;
    setManageBusy("pause");
    try {
      await api.post(`/campaigns/${campId}/applications-paused`, { paused: !isPaused });
      toast.success(isPaused ? "New applications are open again" : "New applications paused", { id: "campaign-manage" });
      await loadData({ silent: true, fresh: true });
    } catch (e) {
      toast.error(campaignErrorText(e, "Couldn't update the campaign. Please try again."), { id: "campaign-manage" });
    } finally { setManageBusy(null); }
  };
  const closeCampaign = async () => {
    if (manageBusy) return;
    setManageBusy("close");
    try {
      await api.post(`/campaigns/${campId}/close`);
      toast.success("Campaign closed. Hired creators keep their deals.", { id: "campaign-manage" });
      setConfirmClose(false);
      await loadData({ silent: true, fresh: true });
    } catch (e) {
      toast.error(campaignErrorText(e, "Couldn't close the campaign. Please try again."), { id: "campaign-manage" });
    } finally { setManageBusy(null); }
  };
  const isHiredApp = (a) => ["hired", "deal_active", "completed"].includes(lowerS(a.status)) || hiredIds.has(String(a.creator_id));
  const tabLists = {
    new: applicants.filter((a) => ["pending", "applied", "new", ""].includes(lowerS(a.status))),
    shortlisted: applicants.filter((a) => ["accepted", "shortlisted", "approved"].includes(lowerS(a.status)) && !isHiredApp(a)),
    hired: applicants.filter(isHiredApp),
    passed: applicants.filter((a) => ["rejected", "declined", "passed"].includes(lowerS(a.status))),
    all: applicants,
  };
  const [appTab, setAppTab] = useState("all");
  const shownApplicants = tabLists[appTab] || applicants;
  const [pitchIndex, setPitchIndex] = useState(null); // v417: desktop pitch player (same one as the phone)

  if (loading) {
    return (
      <div className="w-full max-w-none px-4 py-8 animate-pulse bg-[var(--bg-base)] min-h-screen">
        <div className="h-10 bg-gray-200 dark:bg-zinc-800 rounded-xl w-1/3 mb-6"></div>
        <div className="space-y-4">
          {[1, 2, 3].map(k => (
            <div key={k} className="h-32 bg-gray-200 dark:bg-zinc-800 rounded-3xl p-6 border border-[var(--border-default)]"></div>
          ))}
        </div>
      </div>
    );
  }

  // Session 30: phones get Ravi's mobile design (MG-04/05/06). Same data and applicant actions.
  if (isMobile) {
    return (
      <>
      <BrandCampaignDetailMobile
        campaignId={id}
        campaign={campaign}
        applicants={applicants || []}
        onShortlist={handleShortlist}
        shortlistingId={shortlistingId} /* v416: "Shortlist & chat" shows it's working on phones too */
        onReject={handleReject}
        onProfileView={handleProfileView}
        onChat={handleChat}
        onReload={loadData}
        appsError={appsError} /* v344: a failed applicants load ≠ "No pitches yet" */
        hiredCreatorIds={hiredIds}
      />
      {rejectSheet}
      </>
    );
  }

  return (
    <div className="w-full max-w-none text-left min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <div className="mb-8">
        <button 
          onClick={() => navigate("/brand/campaigns")}
          className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-4 transition-all"
        >
          <ArrowLeft size={14} /> Back to My Campaigns
        </button>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0">
            {campaign && ( /* v416: no made-up "LIVE · Budget not set" when the campaign didn't load */
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`px-3 py-1 rounded-full border text-[11px] font-semibold flex items-center gap-1.5 uppercase tracking-normal ${
                (campaign?.status || '').toLowerCase() === 'live' 
                  ? 'bg-[#F5F0FF] text-[#6D28D9] border-[#DDD6FE]' 
                  : ((campaign?.status || '').toLowerCase() === 'under_review' || (campaign?.status || '').toLowerCase() === 'under review')
                  ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-xs'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}>
                {((campaign?.status || '').toLowerCase() === 'under_review' || (campaign?.status || '').toLowerCase() === 'under review') ? (
                  <span className="relative flex h-2 w-2 mr-0.5">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                ) : (
                  <Megaphone size={12} className="text-[#7C3AED]" />
                )}
                <span>{/* v415: no endless pulse */}
                  {/* v358: paused / closed campaigns said "Active Campaign Briefing" or a raw code */}
                  {(String(campaign?.status || '').toLowerCase() === 'completed' || campaign?.closed_at) ? 'Closed' : campaign?.applications_paused ? 'Applications paused' : ['live', 'approved'].includes(String(campaign?.status || '').toLowerCase()) ? 'Live' : ['under_review', 'under review', 'pending_review'].includes(String(campaign?.status || '').toLowerCase()) ? 'Under review' : String(campaign?.status || '').toLowerCase() === 'draft' ? 'Draft' : ['rejected', 'cancelled'].includes(String(campaign?.status || '').toLowerCase()) ? 'Not approved' : 'Live'}
                </span>
              </span>
              <span className="text-[var(--text-primary)]/20">•</span>
              <span className="text-emerald-700 text-xs font-semibold font-sans">
                {campaignBudgetText(campaign) || "Budget not set" /* v415: "Up to ₹5,000" when min is 0 (was "₹0 - ₹5,000"); v330: no invented ₹10,000 */}
              </span>
            </div>
            )}
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)] mt-1.5 line-clamp-2 [overflow-wrap:anywhere]" title={campaign?.title || ""}>
              {campaign?.title || (campError ? "Campaign" : "Campaign applicants")}{/* v346: very long titles clamp to 2 lines */}
            </h1>
            {campError && !campaign && <p className="text-xs text-[var(--text-secondary)] mt-1">Couldn't load the campaign details. <button type="button" onClick={() => loadData()} className="font-bold text-[var(--violet)] underline cursor-pointer">Try again</button></p>}
            {isPaused && <p className="text-xs text-amber-700 mt-1.5">New applications are paused. Existing applicants and deals continue.</p>}
          </div>

          <div className="flex flex-wrap gap-3 items-center lg:justify-end">
            {/* v415: "Download Analysis" (NEW) removed — the PDF filled in made-up reach / ROI numbers */}
            {!appsError && (
            <div className="flex items-center gap-3 bg-[var(--bg-card)] border border-[var(--border-default)] px-4 py-2.5 rounded-2xl shadow-sm">
              <Users size={18} className="text-[var(--violet)] shrink-0" />
              <div className="text-left font-sans">
                <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold">Applicants</div>
                <div className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{applicants.length} {applicants.length === 1 ? 'pitch' : 'pitches'}{newCount > 0 ? ` · ${newCount} new` : ""}</div>{/* v415: plain words + how many still need a decision */}
              </div>
            </div>
            )}
            {/* v416 (C8): same Pause / Close actions as the phone */}
            {isLive && (
              <button type="button" onClick={togglePause} disabled={Boolean(manageBusy)}
                className="h-10 px-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap">
                {manageBusy === "pause" ? <Loader2 size={14} className="animate-spin" /> : isPaused ? <Play size={14} /> : <Pause size={14} />}
                {isPaused ? "Resume applications" : "Pause applications"}
              </button>
            )}
            {isLive && (
              <button type="button" onClick={() => setConfirmClose(true)} disabled={Boolean(manageBusy)}
                className="h-10 px-4 rounded-xl border border-red-200 bg-[var(--bg-card)] text-xs font-bold text-red-700 hover:bg-red-50 flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap">
                <X size={14} /> Close campaign
              </button>
            )}
          </div>
        </div>
      </div>

      {/* v415: "Predictive AI ROI" block removed (made-up estimate; see above) */}
      <div className="mt-6 mb-6 border-t border-[var(--border-default)]" />

      {/* v416 (C8): applicant tabs like the phone */}
      {applicants.length > 0 && (
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1" role="tablist" aria-label="Pitches">
          {[["all", "All"], ["new", "New"], ["shortlisted", "Shortlisted"], ["hired", "Hired"], ["passed", "Passed"]].map(([key, label]) => {
            const on = appTab === key;
            return (
              <button key={key} type="button" role="tab" aria-selected={on} onClick={() => setAppTab(key)}
                className={`h-9 px-4 rounded-xl border text-xs font-bold whitespace-nowrap flex items-center gap-2 cursor-pointer transition-colors ${on ? "bg-[var(--violet)] border-[var(--violet)] text-white" : "bg-[var(--bg-card)] border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                {label}
                <span className={`text-[11px] px-1.5 rounded-full ${on ? "bg-white/25 text-white" : "bg-[var(--bg-elevated)] text-[var(--text-tertiary)]"}`}>{tabLists[key].length}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5">
        {applicants.length === 0 && appsError ? (
          // v330: the request failed — say so and offer a retry.
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl p-12 text-center max-w-2xl mx-auto flex flex-col items-center justify-center">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Couldn't load applicants</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1.5">Something went wrong. Please try again.</p>
            <button type="button" onClick={() => loadData()} className="mt-4 h-10 px-5 rounded-xl bg-[var(--violet)] text-white text-xs font-bold cursor-pointer">Try again</button>
          </div>
        ) : applicants.length === 0 ? (
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-3xl p-16 text-center max-w-2xl mx-auto flex flex-col items-center justify-center">
            <div className="p-4 bg-[var(--bg-elevated)] text-[var(--text-tertiary)] rounded-full mb-3">
              <HelpCircle size={28} />
            </div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">No pitches yet</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed max-w-md">
              New pitches from creators show up here. Share your campaign link or invite creators to get pitches faster.
            </p>
            {/* v415: a clear next step (copy was "No applicant entries yet … briefing URL …!") */}
            <div className="mt-4 flex items-center gap-2">
              <button type="button" onClick={copyCampaignLink} className="h-10 px-4 rounded-xl border border-[var(--border-default)] text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] cursor-pointer">Copy campaign link</button>
              <button type="button" onClick={() => navigate("/creators")} className="h-10 px-4 rounded-xl bg-[var(--violet)] text-white text-xs font-bold cursor-pointer">Invite creators</button>
            </div>
          </div>
        ) : shownApplicants.length === 0 ? (
          <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-8 text-center">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {appTab === "new" ? "No new pitches" : appTab === "shortlisted" ? "Nobody shortlisted" : appTab === "hired" ? "No one hired yet" : "No passed pitches"}
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {appTab === "new" ? "You've gone through every pitch." : appTab === "shortlisted" ? "Shortlist a pitch to open a chat with the creator." : appTab === "hired" ? "A creator shows here once the payment is held." : "Pitches you decline show here."}
            </p>
            <button type="button" onClick={() => setAppTab("all")} className="mt-3 h-9 px-4 rounded-xl border border-[var(--border-default)] text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] cursor-pointer">Show all pitches</button>
          </div>
        ) : (
          shownApplicants.map((app, index) => (
            <div key={(app.application_id || app.id) ? (app.application_id || app.id) + "-" + index : index} className="flex flex-col gap-2">
            <ApplicantCard
              applicant={app}
              onShortlist={handleShortlist}
              onReject={handleReject}
              onViewProfile={handleProfileView}
              onChat={handleChat}
              busy={shortlistingId != null && String(shortlistingId) === String(app.application_id)} /* v358 */
            />
            {/* v417: watch the pitch (video / link / written pitch) on desktop too */}
            <button type="button" onClick={() => setPitchIndex(index)} data-testid="open-pitch-player"
              className="self-start min-h-[40px] px-4 rounded-xl bg-[#F3EDFF] hover:bg-[#EAE0FF] text-[#7C3AED] text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors">
              <PlayCircle size={15} /> View pitch
            </button>
            </div>
          ))
        )}
      </div>
      {rejectSheet}
      <PitchPlayer list={shownApplicants} index={pitchIndex} onIndex={setPitchIndex} onReject={handleReject} onShortlist={handleShortlist} />{/* v417 */}

      {/* v416 (C8): close-campaign confirm on desktop */}
      <Presence>{confirmClose && (
        <PopupBackdrop className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4" onClick={() => !manageBusy && setConfirmClose(false)}>
          <PopupPanel kind="modal" closeOnEscape={!manageBusy} onClose={() => !manageBusy && setConfirmClose(false)} aria-labelledby="close-campaign-title" onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-6 shadow-2xl text-left">
            <h2 id="close-campaign-title" className="text-base font-bold text-[var(--text-primary)]">Close this campaign?</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">New pitches stop and it moves to Completed. Hired creators keep their deals. This can't be undone from the app.</p>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" disabled={Boolean(manageBusy)} onClick={() => setConfirmClose(false)} className="min-h-[40px] px-4 rounded-xl border border-[var(--border-default)] text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-60">Cancel</button>
              <button type="button" disabled={Boolean(manageBusy)} onClick={closeCampaign} className="min-h-[40px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer disabled:opacity-60 flex items-center gap-1.5">
                {manageBusy === "close" && <Loader2 size={14} className="animate-spin" />} Close campaign
              </button>
            </div>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>
    </div>
  );
}
