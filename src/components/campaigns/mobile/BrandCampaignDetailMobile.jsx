import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, MoreHorizontal, Share2, Plus, Users, ChevronRight, Pencil, Pause, Play, X, ExternalLink } from "lucide-react"; // v417: + ExternalLink
import { api } from "../../../lib/api";
import ApplicantCard from "../ApplicantCard";
import ModalPortal from "../../common/ModalPortal";
import useScrollLock from "../../../lib/useScrollLock";
import ButtonSpinner from "../../common/ButtonSpinner";

import { Presence, PopupBackdrop, PopupPanel } from "../../common/Popup";
import PersonPhoto from "../../common/PersonPhoto";
import { publicOrigin } from "../../../lib/publicUrl";
import { campaignBudgetText, campaignDaysLeft, campaignErrorText } from "./HomeCampaignCard"; // v415: shared budget + days rules · v416: calm 5xx text
import { maskContact } from "../../../utils/maskContact";
// Session 30: Ravi's brand mobile design — MG-04 campaign detail, MG-05 no pitches, MG-06 actions.
// Data + applicant actions come from BrandCampaignApplicants.jsx (locked page, calls unchanged).
// The three calls in this file are the new, Ravi-approved campaign actions (backend/campaignManage.ts):
//   POST /campaigns/:id/applications-paused · POST /campaigns/:id/close · GET /campaigns/:id/matching-creators

const lower = (s) => String(s || "").toLowerCase().trim();

function budgetText(c) {
  // v415: min 0 + max → "Up to ₹5,000 per creator" (was "Barter"); "Barter" only when both are 0
  const b = campaignBudgetText(c);
  return b && b !== "Barter" ? `${b} per creator` : b;
}

function closesText(c) {
  const end = c?.deadline || c?.end_date;
  if (!end) return "";
  const t = new Date(end);
  if (Number.isNaN(t.getTime())) return "";
  const d = campaignDaysLeft(end); // v415: IST calendar days — same number as the list
  const date = t.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }); // v330: IST
  if (d < 0) return `Closed ${date}`;
  if (d === 0) return `Closes today`; // v332: was "Closes 5 Oct · 0 days left"
  return `Closes ${date} · ${d} day${d === 1 ? "" : "s"} left`;
}

function Chip({ bg, fg, children }) {
  return <span className="h-[22px] px-2 rounded-[7px] inline-flex items-center text-[10px] font-bold tracking-[.5px] uppercase whitespace-nowrap shrink-0" style={{ background: bg, color: fg }}>{children}</span>;
}


export default function BrandCampaignDetailMobile({
  campaignId, campaign, applicants = [], // v415: ROI props dropped (feature hidden)
  onShortlist, onReject, onProfileView, onChat, onReload, hiredCreatorIds = null, appsError = false,
  shortlistingId = null, // v416: the card being shortlisted shows "Shortlisting…"
}) {
  const navigate = useNavigate();
  const [sheet, setSheet] = useState(null); // null | "actions" | "confirm-close"
  const [busy, setBusy] = useState(null);
  const [matching, setMatching] = useState(null);
  const listRef = useRef(null);
  useScrollLock(Boolean(sheet));

  const id = campaignId || campaign?.campaign_id || campaign?.id;
  const status = lower(campaign?.status);
  const isClosed = status === "completed" || Boolean(campaign?.closed_at);
  const isPaused = Boolean(campaign?.applications_paused) && !isClosed;
  const isLive = (status === "live" || status === "approved") && !isClosed;
  const pending = applicants.filter((a) => ["pending", "applied", "new", ""].includes(lower(a.status))).length;
  const shortlisted = applicants.filter((a) => ["accepted", "shortlisted", "approved"].includes(lower(a.status))).length;
  const noPitches = applicants.length === 0;

  const [applicantTab, setApplicantTabRaw] = useState("under_review"); // "under_review" | "shortlisted" | "hired" | "passed" | "all"
  const tabChosen = useRef(false);
  const setApplicantTab = (t) => { tabChosen.current = true; setApplicantTabRaw(t); };
  const [playerIndex, setPlayerIndex] = useState(null);
  // v344: the full-screen pitch player locks the page behind — v417: now inside <PitchPlayer> (shared with desktop)
  // v415: Escape closes the pitch player / the actions sheet (not while an action is running)
  useEffect(() => {
    if (!sheet || playerIndex !== null) return undefined; // v417: the pitch player handles its own Escape
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (!busy) setSheet(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playerIndex, sheet, busy]);

  const underReviewList = applicants.filter((a) => ["pending", "applied", "new", ""].includes(lower(a.status)));
  // Session 33: hired = escrow funded (from the deal threads, see src/lib/hiredCreators.js).
  const isHired = (a) => ["hired", "deal_active", "completed"].includes(lower(a.status)) || Boolean(hiredCreatorIds && hiredCreatorIds.has(String(a.creator_id)));
  const shortlistedList = applicants.filter((a) => ["accepted", "shortlisted", "approved"].includes(lower(a.status)) && !isHired(a));
  const hiredList = applicants.filter(isHired);
  const passedList = applicants.filter((a) => ["rejected", "declined", "passed"].includes(lower(a.status)));

  // v360 (Ravi: "campaign ka UI bekar"): open on the first tab that has people — it opened an empty
  // "Under review · 0" ("No applicants in this category.") while the only creator was hired.
  useEffect(() => {
    if (tabChosen.current) return;
    const first = underReviewList.length ? "under_review" : shortlistedList.length ? "shortlisted" : hiredList.length ? "hired" : passedList.length ? "passed" : "under_review";
    setApplicantTabRaw(first);
  }, [underReviewList.length, shortlistedList.length, hiredList.length, passedList.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentList =
    applicantTab === "under_review"
      ? underReviewList
      : applicantTab === "shortlisted"
      ? shortlistedList
      : applicantTab === "hired"
      ? hiredList
      : applicantTab === "passed"
      ? passedList
      : applicants;

  useEffect(() => {
    if (!id || !noPitches) return;
    let alive = true;
    api.get(`/campaigns/${id}/matching-creators`).then(({ data }) => { if (alive) setMatching(data); }).catch(() => {});
    return () => { alive = false; };
  }, [id, noPitches]);

  const shareLink = async () => {
    const url = `${publicOrigin()}/campaigns/${id}`;
    const title = campaign?.title || "Campaign on Ybex";
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      toast.success("Brief link copied");
    } catch (e) {
      if (e?.name !== "AbortError") toast.error("Could not share the link.");
    }
  };

  const togglePause = async () => {
    setBusy("pause");
    try {
      await api.post(`/campaigns/${id}/applications-paused`, { paused: !isPaused });
      toast.success(isPaused ? "New applications are open again" : "New applications paused");
      setSheet(null);
      await onReload?.({ silent: true });
    } catch (e) {
      toast.error(campaignErrorText(e, "Couldn't update the campaign. Please try again."), { id: "campaign-manage" }); // v416
    } finally { setBusy(null); }
  };

  const closeCampaign = async () => {
    setBusy("close");
    try {
      await api.post(`/campaigns/${id}/close`);
      toast.success("Campaign closed. Hired creators keep their deals.");
      setSheet(null);
      await onReload?.({ silent: true });
    } catch (e) {
      toast.error(campaignErrorText(e, "Couldn't close the campaign. Please try again."), { id: "campaign-manage" }); // v416
    } finally { setBusy(null); }
  };

  // v344: campaign failed to load → no status chip (was a made-up "Draft")
  const chip = !campaign ? null : isClosed ? ["#EEF2FF", "#4338CA", "Closed"] : isPaused ? ["#FEF3C7", "#B45309", "Paused"] : isLive ? ["#DCFCE7", "#15803D", "Live"] : ["#F1F1F5", "#4B5563", String(campaign?.status || "Draft").replace(/_/g, " ")]; // v330: no raw "under_review"
  const plats = Array.isArray(campaign?.platforms) ? campaign.platforms.filter(Boolean).join(", ") : "";

  return (
    <div className="w-full text-left text-[#0A0A0A] px-4 pb-4" style={{ fontFamily: "'DM Sans', sans-serif" }} data-testid="brand-campaign-detail-mobile">{/* v358: phone pages get no padding from Layout — cards touched the screen edges */}
      <div className="h-[54px] flex items-center gap-2.5">
        <button type="button" onClick={() => navigate("/brand/campaigns")} aria-label="Back" className="w-10 h-10 rounded-[13px] bg-white border border-[#E5E5EA] flex items-center justify-center"><ChevronLeft size={18} /></button>
        <div className="flex-1 min-w-0 text-[17px] font-bold tracking-[-.4px] truncate">Campaign</div>
        <button type="button" onClick={() => setSheet("actions")} aria-label="Campaign actions" className="w-10 h-10 rounded-[13px] bg-white border border-[#E5E5EA] flex items-center justify-center"><MoreHorizontal size={18} /></button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="bg-white border border-[#E6E6EE] rounded-[20px] p-3.5">
          <div className="flex items-center gap-2 flex-wrap">{chip && <Chip bg={chip[0]} fg={chip[1]}>{chip[2]}</Chip>}<span className="text-xs font-medium text-[#6B7280]">{closesText(campaign)}</span></div>
          <div className="mt-2.5 text-[19px] font-bold leading-tight line-clamp-2 [overflow-wrap:anywhere]" title={campaign?.title || ""}>{campaign?.title || "Campaign"}{/* v346: very long titles clamp to 2 lines */}</div>
          {plats && <div className="mt-1 text-[12.5px] text-[#6B7280]">{plats}</div>}
          {budgetText(campaign) && <div className="mt-2 text-sm font-semibold text-[#15803D]">{budgetText(campaign)}</div>}
          {isPaused && <div className="mt-2.5 text-xs text-[#B45309]">New applications are paused. Existing applicants and deals continue.</div>}
        </div>

        {noPitches && appsError ? ( /* v344: load failed — offer a retry, not "No pitches yet" */
          <div className="bg-white border border-[#E6E6EE] rounded-[20px] p-3.5 flex items-center gap-3" role="alert">
            <div className="flex-1 min-w-0 text-[13.5px] font-semibold text-[#0A0A0A]">Couldn't load applicants</div>
            <button type="button" onClick={() => onReload?.()} className="min-h-[40px] px-3.5 rounded-xl bg-[#F3EDFF] text-[#7C3AED] text-[13px] font-semibold">Retry</button>
          </div>
        ) : noPitches ? (
          <>
            <div className="bg-white border border-[#E6E6EE] rounded-[20px] p-3.5 flex flex-col items-center text-center gap-2">
              <div className="w-[52px] h-[52px] rounded-2xl bg-[#F1F1F5] flex items-center justify-center"><Users size={26} color="#4B5563" /></div>
              <div className="mt-1 text-base font-bold">No pitches yet</div>
              <div className="text-[13px] leading-normal text-[#6B7280]">Sharing the brief link gets pitches faster.</div>
              <div className="w-full mt-2 flex flex-col gap-2">
                <button type="button" onClick={shareLink} className="h-[50px] rounded-2xl bg-[#7C3AED] text-white flex items-center justify-center gap-2 text-[15px] font-semibold"><Share2 size={17} /> Share brief link</button>
                <button type="button" onClick={() => navigate("/creators")} className="h-[50px] rounded-2xl bg-[#F3EDFF] text-[#7C3AED] flex items-center justify-center gap-2 text-[15px] font-semibold"><Plus size={17} /> Invite creators</button>
              </div>
            </div>
            {matching && matching.count > 0 && (
              <button type="button" onClick={() => navigate(Array.isArray(matching?.categories) && matching.categories[0] ? `/creators?niche=${encodeURIComponent(matching.categories[0])}` : "/creators")} className="bg-white border border-[#E6E6EE] rounded-[20px] px-3.5 py-3 min-h-[60px] flex items-center gap-3 text-left">
                <div className="w-9 h-9 rounded-[11px] bg-[#DCFCE7] flex items-center justify-center shrink-0"><Users size={18} color="#15803D" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] font-semibold">{matching.count} creator{matching.count === 1 ? "" : "s"} match this brief</div>
                  {matching.categories?.length > 0 && <div className="mt-0.5 text-xs text-[#6B7280] truncate capitalize">{matching.categories.join(" · ")}</div>}
                </div>
                <ChevronRight size={16} color="#9CA3AF" />
              </button>
            )}
          </>
        ) : (
          <>
            {/* v360: one row = the stats AND the tabs (they used to be two rows with different numbers) */}
            <div ref={listRef} className="scroll-mt-4 grid grid-cols-4 gap-2" role="tablist" aria-label="Pitches">
              {[
                ["under_review", "New", underReviewList.length, true],
                ["shortlisted", "Shortlisted", shortlistedList.length, false],
                ["hired", "Hired", hiredList.length, false],
                ["passed", "Passed", passedList.length, false],
              ].map(([key, label, n, hot]) => {
                const on = applicantTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setApplicantTab(key)}
                    className={`min-w-0 rounded-2xl px-2.5 py-2.5 text-left transition active:scale-[0.98] border ${on ? "bg-[#0A0A0A] border-[#0A0A0A] text-white" : "bg-white border-[#E6E6EE] text-[#0A0A0A]"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[19px] font-bold leading-none">{n}</span>
                      {hot && n > 0 && <span className={`w-2 h-2 rounded-full ${on ? "bg-[#C4B5FD]" : "bg-[#7C3AED]"}`} />}
                    </div>
                    <div className={`mt-1.5 text-[11px] font-semibold truncate ${on ? "text-white/80" : "text-[#6B7280]"}`}>{label}</div>
                  </button>
                );
              })}
            </div>
            {pending > 0 && applicantTab !== "under_review" && (
              <button
                type="button"
                onClick={() => setApplicantTab("under_review")}
                className="h-[48px] rounded-2xl bg-[#7C3AED] text-white text-[15px] font-semibold"
                style={{ boxShadow: "0 12px 22px -14px rgba(124,58,237,.9)" }}
              >
                Review {pending} new pitch{pending === 1 ? "" : "es"}
              </button>
            )}
            {currentList.length === 0 ? (
              <div className="bg-white border border-[#E6E6EE] rounded-[20px] p-5 text-center">
                <div className="text-[14px] font-semibold text-[#0A0A0A]">
                  {applicantTab === "under_review" ? "No new pitches" : applicantTab === "shortlisted" ? "Nobody shortlisted" : applicantTab === "hired" ? "No one hired yet" : "No passed pitches"}
                </div>
                <div className="mt-1 text-[12.5px] text-[#6B7280] leading-snug">
                  {applicantTab === "under_review" ? "You've gone through every pitch. Share the brief to get more." : applicantTab === "shortlisted" ? "Shortlist a pitch to open a chat with the creator." : applicantTab === "hired" ? "A creator shows here once the payment is held." : "Pitches you pass on show here."}
                </div>
                {applicantTab === "under_review" && (
                  <button type="button" onClick={shareLink} className="mt-3 h-10 px-4 rounded-xl bg-[#F3EDFF] text-[#7C3AED] text-[13px] font-semibold inline-flex items-center gap-1.5"><Share2 size={15} /> Share brief link</button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {currentList.map((app, i) => (
                  <div key={(app.application_id || app.id || i) + "-" + i} className="relative">
                    <ApplicantCard
                      applicant={app}
                      onShortlist={onShortlist}
                      onReject={onReject}
                      onViewProfile={onProfileView}
                      onChat={onChat}
                      busy={shortlistingId != null && String(shortlistingId) === String(app.application_id)} /* v416 */
                    />
                    <button
                      type="button"
                      onClick={() => setPlayerIndex(i)}
                      className="mt-2 w-full min-h-[40px] py-2 bg-[#F3EDFF] hover:bg-[#EAE0FF] text-[#7C3AED] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <span>Open pitch details &amp; player</span>
                      <ChevronRight size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* v415: "Predict ROI" + "Download analysis report" removed — the estimate and the PDF used made-up
                numbers (default follower counts, a fixed 3.2x ROI). Brands only see real data here. */}
          </>
        )}
      </div>

      <Presence>{sheet && (
        <ModalPortal>
          <PopupBackdrop className="fixed inset-0 z-[70] bg-[rgba(10,10,14,.45)]" onClick={() => !busy && setSheet(null)} />
          <PopupPanel kind="sheet" onClose={() => !busy && setSheet(null)} className="fixed left-0 right-0 bottom-0 z-[71] bg-white rounded-t-[26px] px-[18px] pt-2.5 flex flex-col gap-3.5" style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))", fontFamily: "'DM Sans', sans-serif", boxShadow: "0 -20px 40px -20px rgba(0,0,0,.3)" }}>
            <div className="w-10 h-[5px] rounded-full bg-[#E0E0E6] self-center" />
            {sheet === "actions" ? (
              <>
                <div>
                  <div className="text-[17px] font-bold leading-snug line-clamp-2 [overflow-wrap:anywhere]">{campaign?.title || "Campaign"}{/* v346 */}</div>
                  <div className="mt-0.5 text-[12.5px] text-[#6B7280]">{chip ? `${chip[2]} · ` : ""}{applicants.length} applicant{applicants.length === 1 ? "" : "s"}</div>
                </div>
                <div className="flex flex-col">
                  {/* v332: a closed campaign can't be edited (the server refuses it) — same rule as the desktop card */}
                  {!isClosed && <SheetRow icon={<Pencil size={19} />} label="Edit brief" onClick={() => navigate(`/brand/campaigns/create?edit=${id}`)} />}
                  <SheetRow icon={<Share2 size={19} />} label="Share brief link" onClick={() => { setSheet(null); shareLink(); }} />
                  {!isClosed && isLive && (
                    <SheetRow icon={isPaused ? <Play size={19} /> : <Pause size={19} />} label={isPaused ? "Resume new applications" : "Pause new applications"} busy={busy === "pause"} onClick={togglePause} />
                  )}
                  {!isClosed && isLive && (
                    <button type="button" onClick={() => setSheet("confirm-close")} className="pt-3 pb-0.5 flex items-start gap-3.5 text-left">
                      <X size={19} color="#B91C1C" className="shrink-0" />
                      <div><div className="text-[15px] font-semibold text-[#B91C1C]">Close campaign</div><div className="mt-0.5 text-xs text-[#6B7280]">Hired creators keep their deals. New pitches stop.</div></div>
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="text-lg font-bold">Close this campaign?</div>
                <div className="-mt-1.5 text-[13.5px] leading-normal text-[#6B7280]">New pitches stop and it moves to Completed. Hired creators keep their deals. This can't be undone from the app.</div>
                <div className="flex items-center gap-2.5">
                  <button type="button" onClick={() => !busy && setSheet(null)} className="flex-1 h-[50px] rounded-2xl bg-white border border-[#E0E0E8] text-[15px] font-semibold">Cancel</button>
                  <button type="button" onClick={closeCampaign} disabled={busy === "close"} className="flex-1 h-[50px] rounded-2xl bg-[#DC2626] text-white flex items-center justify-center gap-2 text-[15px] font-semibold disabled:opacity-60">{busy === "close" && <ButtonSpinner />} Close campaign</button>
                </div>
              </>
            )}
            {sheet === "actions" && (
              <button type="button" onClick={() => !busy && setSheet(null)} className="h-[50px] rounded-2xl bg-white border border-[#E0E0E8] text-[15px] font-semibold">Cancel</button>
            )}
          </PopupPanel>
        </ModalPortal>
      )}</Presence>

      {/* AP-02: Full-screen pitch player · v417: shared with the desktop applicants page */}
      <PitchPlayer list={currentList} index={playerIndex} onIndex={setPlayerIndex} onReject={onReject} onShortlist={onShortlist} />
    </div>
  );
}

// v417: links typed in a pitch (YouTube, Drive, Instagram…) — the brand can open them from the player
export function pitchLinks(text) {
  // masked first, and no chat/phone links — the pitch never gives the brand a way around Ybex chat (v346)
  const found = String(maskContact(text || "") || "").match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
  return [...new Set(found.map((u) => u.replace(/[.,;:!?]+$/, "")))]
    .filter((u) => !/^https?:\/\/(www\.)?(wa\.me|api\.whatsapp\.com|t\.me|telegram\.me)\b/i.test(u) && !/contact hidden/i.test(u))
    .slice(0, 3);
}
const isVideoFile = (u) => /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(String(u || ""));

// AP-02 full-screen pitch player. v417: its own component so the desktop applicants page reuses it
// (video when the pitch has one, links from the pitch, the written pitch, Decline / Shortlist & chat).
export function PitchPlayer({ list = [], index = null, onIndex, onReject, onShortlist }) {
  const item = index !== null && index !== undefined ? list[index] : null;
  const open = Boolean(item);
  useScrollLock(open); // v344: page behind must not scroll
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onIndex?.(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onIndex]);
  const rawVideo = item ? (item.pitch_video_url || item.video_url) : null;
  const pitchText = item ? (item.pitch_text || item.pitch || item.message) : "";
  const links = item ? pitchLinks(pitchText) : [];
  const videoSrc = rawVideo || links.find(isVideoFile) || null;
  const otherLinks = links.filter((u) => u !== videoSrc);
  return (
      <Presence>{open && (
        <ModalPortal>
          <PopupBackdrop role="dialog" aria-modal="true" aria-label="Pitch" data-testid="pitch-player" className="fixed inset-0 z-[80] bg-[#0A0A0A] text-white flex flex-col justify-between overflow-hidden" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)", fontFamily: "'DM Sans', sans-serif" }}>
            {/* Header */}
            <div className="h-12 px-4 flex items-center justify-between z-10 shrink-0">
              <button
                type="button"
                onClick={() => onIndex(null)}
                aria-label="Close pitch" /* v330 */
                className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white cursor-pointer"
              >
                <X size={18} />
              </button>
              <div className="h-7 px-3 rounded-lg bg-black/50 backdrop-blur-md flex items-center text-xs font-bold text-white">
                Pitch {index + 1} of {list.length}
              </div>
              <div className="w-10" />
            </div>

            {/* Pitch Body / Video */}
            <div className="flex-1 flex flex-col justify-center px-4 relative overflow-y-auto">
              {videoSrc ? (
                <div className="w-full max-w-3xl mx-auto max-h-[50vh] sm:max-h-[60vh] rounded-2xl overflow-hidden bg-black flex items-center justify-center">{/* v417: sized for desktop too */}
                  <video preload="metadata"
                    src={videoSrc}
                    controls
                    autoPlay
                    playsInline
                    className="w-full h-full max-h-[50vh] object-contain"
                  />
                </div>
              ) : (
                <div className="p-6 rounded-3xl bg-white/10 backdrop-blur-md border border-white/10 text-center space-y-4 max-w-sm mx-auto">
                  <PersonPhoto
                    src={item.profile_photo_url || item.photo}
                    name={item.full_name || item.name}
                    alt=""
                    className="w-20 h-20 rounded-2xl object-cover mx-auto border-2 border-white/20 shadow-lg"
                    textClassName="text-2xl"
                  />
                  <div>
                    <h3 className="text-xl font-bold text-white">{item.full_name || item.name || "Creator"}</h3>
                    <p className="text-xs text-white/70 mt-1">
                      {[item.category, item.city].filter(Boolean).join(" · ") || "Creator" /* v415: no made-up "India" */}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-left text-xs text-white/90 italic leading-relaxed">
                    &ldquo;{maskContact(pitchText) || "No written pitch." /* v330: was a made-up pitch line; v346: phone/email hidden */}&rdquo;
                  </div>
                  <div className={`text-sm font-bold ${Number(item.proposed_amount) > 0 ? "text-emerald-400" : "text-white/70"}`}>{/* v416: "No fee proposed yet" isn't money-green */}
                    {Number(item.proposed_amount) > 0 ? `Proposed fee: ₹${Number(item.proposed_amount).toLocaleString("en-IN")}` : "No fee proposed yet" /* v415: was "Bid: Bid not set" */}
                  </div>
                </div>
              )}
              {/* v417: the written pitch under a video, and links from the pitch (open in a new tab) */}
              {videoSrc && maskContact(pitchText) && (
                <p className="mt-3 w-full max-w-2xl mx-auto text-xs text-white/85 italic leading-relaxed">&ldquo;{maskContact(pitchText)}&rdquo;</p>
              )}
              {otherLinks.length > 0 && (
                <div className="mt-3 w-full max-w-sm mx-auto flex flex-col gap-2" data-testid="pitch-links">
                  {otherLinks.map((u) => (
                    <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="min-h-[40px] px-3.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-semibold text-white flex items-center gap-2 transition">
                      <ExternalLink size={14} className="shrink-0" />
                      <span className="truncate">Open pitch link · {(() => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "link"; } })()}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="p-4 bg-black/80 backdrop-blur-md border-t border-white/10 flex flex-col gap-3 shrink-0">
              <div className="flex items-center justify-between text-xs text-white/70">
                <button
                  type="button"
                  disabled={index <= 0}
                  onClick={() => onIndex(index - 1)}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                >
                  ← Previous
                </button>
                <span className="truncate max-w-[150px]">{item.full_name || item.name}</span>
                <button
                  type="button"
                  disabled={index >= list.length - 1}
                  onClick={() => onIndex(index + 1)}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                >
                  Next →
                </button>
              </div>

              {/* v332: Decline / Shortlist only for a new pitch — they showed on hired and passed creators too */}
              {["pending", "applied", "new", ""].includes(lower(item.status)) && (
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const pick = item; // v417
                    onIndex(null);
                    onReject?.(pick);
                  }}
                  className="h-11 px-4 rounded-xl border border-red-600 bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <X size={15} /> Decline{/* v416: same word as the card */}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const pick = item; // v417
                    onIndex(null);
                    onShortlist?.(pick);
                  }}
                  className="flex-1 h-11 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg shadow-purple-900/40"
                >
                  Shortlist &amp; chat{/* v417: same words as the card */}
                </button>
              </div>
              )}
            </div>
          </PopupBackdrop>
        </ModalPortal>
      )}</Presence>
  );
}

function SheetRow({ icon, label, onClick, busy }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className="h-[52px] flex items-center gap-3.5 border-b border-[#F0F0F4] text-left disabled:opacity-60">
      <span className="shrink-0">{busy ? <ButtonSpinner /> : icon}</span>
      <span className="text-[15px] font-medium">{label}</span>
    </button>
  );
}
