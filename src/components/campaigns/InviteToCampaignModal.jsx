import React, { useState, useEffect } from "react";
import { X, Send, Calendar, IndianRupee, Package, FileText, CheckCircle2 } from "lucide-react"; // v358: ₹ icon (was a dollar sign)
import { AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { api } from "../../lib/api";
import useBusy from "../../lib/useBusy";
import ButtonSpinner from "../common/ButtonSpinner";
import ModalPortal from "../common/ModalPortal";
import useScrollLock from "../../lib/useScrollLock";
import useIsMobile from "../../hooks/useIsMobile";
import { campaignBudgetText, campaignErrorText, MIN_CAMPAIGN_PAYOUT } from "./mobile/HomeCampaignCard"; // v415: shared budget rule · v416: + calm 5xx text
import { initialsOf } from "../common/PersonPhoto"; // v416: "Creator 4 Das" → "CD" (was "CR")
import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
import { RATES_PUBLIC } from "../../utils/rateCardQuote"; // v430

// v415 · v419: MIN_CAMPAIGN_PAYOUT is read live (₹500 for Ybex in-house brands) — one number for the prefill, the hint and the check

// v416 (C5): the server says "already invited — withdraw that invitation first" and sends the invite id.
// Offer the withdraw right there (POST /brands/invitations/:id/withdraw), so the advice can be followed.
export async function withdrawInvite(inviteId) {
  await api.post(`/brands/invitations/${encodeURIComponent(inviteId)}/withdraw`);
}
export function showInviteError(err, { name = "", fallback = "Couldn't send the invitation. Please try again.", onWithdrawn = null, toastId } = {}) {
  const d = err?.response?.data;
  const id = toastId || `invite-error-${name || "x"}`;
  if (d?.code === "ALREADY_INVITED" && d?.invite_id && d?.status !== "accepted" && !/accepted/i.test(String(d?.error || ""))) {
    toast.error(name ? `${name} already has your invitation` : "Already invited", {
      id,
      description: "Wait for a reply, or withdraw it to send a new one.",
      action: {
        label: "Withdraw invite",
        onClick: async () => {
          try {
            await withdrawInvite(d.invite_id);
            toast.success("Invitation withdrawn. You can send a new one now.", { id });
            onWithdrawn?.(d.invite_id);
          } catch (e) {
            toast.error(campaignErrorText(e, "Couldn't withdraw the invitation. Please try again."), { id });
          }
        },
      },
    });
    return;
  }
  if (d?.code === "ALREADY_INVITED" && d?.thread_id) {
    toast.info(d.error || "Already accepted — open the chat instead.", { id, action: { label: "Open chat", onClick: () => window.location.assign(`/chat/${d.thread_id}`) } });
    return;
  }
  toast.error(campaignErrorText(err, fallback), { id });
}

// v416 (C6): one short reason per creator for a multi-invite ("already invited", not "check your connection").
export function inviteFailReason(err) {
  const d = err?.response?.data;
  if (!err?.response) return "network problem";
  if (d?.code === "ALREADY_INVITED") return /accepted/i.test(String(d?.error || "")) || d?.status === "accepted" ? "already accepted your invite" : "already invited";
  if (d?.code === "ALREADY_IN_CAMPAIGN") return d?.thread_id ? "already in a deal for this campaign" : "already applied to this campaign";
  if (Number(err?.response?.status) >= 500) return "server error";
  const m = typeof d?.error === "string" ? d.error : typeof d?.detail === "string" ? d.detail : "";
  return m && m.length < 90 ? m.replace(/[.]$/, "") : "couldn't send";
}

// v416 (C5): brand's sent invitations with Withdraw. Reads GET /brands/invitations ({ invitations: [{ id, creator_name,
// campaign_title, amount, status, can_withdraw }] }). Shows nothing when the list is empty or fails — never a fake list.
export function SentInvitesList({ className = "" }) {
  const [rows, setRows] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const load = React.useCallback(async () => {
    try {
      const { data } = await api.get("brands/invitations", { bypassCache: true });
      const list = Array.isArray(data) ? data : Array.isArray(data?.invitations) ? data.invitations : null;
      setRows(list);
    } catch { setRows(null); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const word = (st) => {
    const v = String(st || "").toLowerCase();
    if (v === "pending_creator_acceptance" || v === "pending") return ["Waiting for reply", "bg-amber-50 text-amber-800 border-amber-200"];
    if (v === "accepted") return ["Accepted", "bg-emerald-50 text-emerald-700 border-emerald-200"];
    if (v === "withdrawn") return ["Withdrawn", "bg-slate-100 text-slate-700 border-slate-200"];
    if (v === "expired") return ["Expired", "bg-slate-100 text-slate-700 border-slate-200"];
    if (v.includes("declin")) return ["Declined", "bg-red-50 text-red-700 border-red-200"];
    return ["Sent", "bg-slate-100 text-slate-700 border-slate-200"];
  };
  const withdraw = async (inv) => {
    if (busyId) return;
    setBusyId(inv.id);
    try {
      await withdrawInvite(inv.id);
      toast.success("Invitation withdrawn.", { id: `withdraw-${inv.id}` });
      setRows((prev) => (prev || []).map((r) => (r.id === inv.id ? { ...r, status: "withdrawn" } : r)));
    } catch (e) {
      toast.error(campaignErrorText(e, "Couldn't withdraw the invitation. Please try again."), { id: `withdraw-${inv.id}` });
    } finally { setBusyId(null); }
  };
  return (
    <section className={`bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-4 sm:p-5 ${className}`} aria-labelledby="sent-invites-title" data-testid="sent-invites">
      <h2 id="sent-invites-title" className="text-sm font-bold text-[var(--text-primary)]">Sent invites</h2>
      <p className="text-xs text-[var(--text-secondary)] mt-0.5">Creators you invited directly. Withdraw a pending one to send a new offer.</p>
      <ul className="mt-3 divide-y divide-[var(--border-default)]">
        {rows.slice(0, 20).map((inv) => {
          const [label, tone] = word(inv.status);
          const pending = inv.can_withdraw != null ? Boolean(inv.can_withdraw) && label === "Waiting for reply" : label === "Waiting for reply";
          return (
            <li key={inv.id} className="py-2.5 flex items-center gap-3 min-w-0">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{inv.creator_name || inv.creator_full_name || "Creator"}</div>
                <div className="text-[11.5px] text-[var(--text-secondary)] truncate">{inv.campaign_title || "Direct invitation"}{Number(inv.amount) > 0 ? ` · ₹${Number(inv.amount).toLocaleString("en-IN")}` : ""}</div>
              </div>
              <span className={`shrink-0 text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${tone}`}>{label}</span>
              {pending && (
                <button type="button" onClick={() => withdraw(inv)} disabled={busyId === inv.id}
                  className="shrink-0 min-h-[36px] px-3 rounded-xl border border-[var(--border-default)] text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60 cursor-pointer flex items-center gap-1">
                  {busyId === inv.id && <ButtonSpinner />} Withdraw
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
function InviteToCampaignModalBody({
  isOpen = true,
  onClose,
  creator,
  onInviteSent,
  onCreateCampaign = null, // session 30: page-provided route to Create campaign
  campaigns = null, // session 30: the brand's live campaigns (loaded by the page) to prefill from
  campaignsError = false, // v344: the page's campaigns fetch failed — show Retry, not "no live campaigns"
  onRetryCampaigns = null,
}) {
  const [campaignTitle, setCampaignTitle] = useState("");
  const [budget, setBudget] = useState("");
  const [deliverables, setDeliverables] = useState("");
  const [timeline, setTimeline] = useState("");
  const [pitch, setPitch] = useState("");

  const { isBusy, anyBusy, run } = useBusy();
  const isMobile = useIsMobile();
  const [pickedId, setPickedId] = useState(null);
  useScrollLock(Boolean(isOpen && creator));
  // v415: Escape closes the invite (not while sending)
  useEffect(() => {
    if (!isOpen || !creator) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !anyBusy) onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, creator, anyBusy, onClose]);

  if (!isOpen || !creator) return null;

  const creatorName = creator.name || creator.full_name || "Creator";
  const creatorPhoto = creator.photo || creator.profile_photo_url || creator.picture;
  const creatorHandle = creator.instagram_handle || creator.handle || creator.instagram || "";
  // v332: content_niches can be an array — `.split` on it crashed the desktop invite modal.
  const creatorNiche = String(creator.category || (Array.isArray(creator.content_niches) ? creator.content_niches.filter(Boolean).join(",") : creator.content_niches) || "");

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!pitch.trim()) {
      toast.error("Please include a brief or pitch message for the creator.", { id: "invite-form" }); // v416: one toast, not a stack
      return;
    }
    // The invite becomes a real campaign deal when the creator accepts, so it needs a fee.
    // Same ₹3,000 floor as a counter offer; the server checks it again.
    const feeNumber = Number(String(budget).replace(/[^0-9.]/g, ""));
    if (!feeNumber || feeNumber < MIN_CAMPAIGN_PAYOUT) {
      toast.error(`Please enter the fee you are offering (₹${MIN_CAMPAIGN_PAYOUT.toLocaleString("en-IN")} or more).`, { id: "invite-form" }); // v416
      return;
    }

    run("send_invite", async () => {
      try {
        const creatorId = creator.user_id || creator.id;
        const res = await api.post(`/creators/${creatorId}/send-brief`, {
          campaign_title: campaignTitle.trim() || undefined,
          campaign_description: pitch.trim(),
          budget_range: budget.trim(),
          deliverables: deliverables.trim() || undefined,
          timeline: timeline.trim() || undefined,
          message: pitch.trim(),
          pitch: pitch.trim(),
          campaign_id: pickedId || undefined, // v347 (Ravi approved): lets the server spot "already in this campaign"
        });

        // Prompt requirement: Brand sees exact success toast and do NOT open chat thread
        toast.success(
          res.data?.note ||
          res.data?.message ||
          "Invitation sent. The chat opens once the creator accepts.",
          { id: "invite-form" } // v416: replaces any earlier form toast
        );

        if (onInviteSent) onInviteSent(res.data);
        onClose();
      } catch (err) {
        const d = err.response?.data;
        // v347 (Ravi approved): already applied / already in a deal for this campaign → say so and offer the chat
        // (or the applicants list), instead of a generic "couldn't send". (Plain link: this modal is also rendered
        // outside a router, so no useNavigate here.)
        if (d?.code === "ALREADY_IN_CAMPAIGN") {
          const to = d.thread_id ? `/chat/${d.thread_id}` : (d.campaign_id ? `/brand/campaigns/${d.campaign_id}/applicants` : null);
          toast.info(d.thread_id ? "Already in a deal for this campaign" : "Already applied to this campaign", {
            id: "invite-form", // v416
            description: d.error,
            ...(to ? { action: { label: d.thread_id ? "Open chat" : "View application", onClick: () => { onClose(); window.location.assign(to); } } } : {}),
          });
          return;
        }
        // v416: "already invited" offers Withdraw; 5xx shows a calm line (no raw server text)
        showInviteError(err, { name: creatorName, toastId: "invite-form" });
      }
    });
  };

  // Session 30 — EX-05 mobile invite sheet (Ravi's design). Same submit (handleSubmit → the same
  // send-brief call and payload). Picking a campaign only prefills the fields.
  const firstName = creatorName.split(" ")[0];
  const reelRate = RATES_PUBLIC ? (Number(creator.rate_reel || creator.reel_rate || creator.rate_card?.reels || creator.rate_card?.reel || 0) || null) : null; // v430: private for now
  const pick = (camp) => {
    const cid = camp.campaign_id || camp.id;
    setPickedId(cid);
    setCampaignTitle(camp.title || "");
    // v332: deliverables can be a list (or list of objects) — String() showed "Reel,Story" / "[object Object]".
    if (camp.deliverables && !deliverables) setDeliverables(Array.isArray(camp.deliverables) ? camp.deliverables.map((d) => (typeof d === "string" ? d : d?.label || d?.type || "")).filter(Boolean).join(" + ") : String(camp.deliverables));
    if (!pitch.trim()) setPitch(camp.description || camp.brief || `We'd love to have you on ${camp.title || "our campaign"}.`);
    // v415: a rate card below the ₹3,000 minimum was prefilled and then refused — prefill the minimum instead (hint below)
    if (!budget && reelRate) setBudget(String(Math.max(reelRate, MIN_CAMPAIGN_PAYOUT)));
  };
  const rateBelowMin = Boolean(reelRate && reelRate < MIN_CAMPAIGN_PAYOUT);
  const campLine = (camp) => {
    const bits = [];
    // v415: full en-IN amounts (₹1,500 showed as "₹2K"); "Up to ₹X" when min is 0; "Barter" only when both are 0
    const b = campaignBudgetText(camp, "–");
    if (b) bits.push(b);
    const end = camp.deadline || camp.end_date;
    if (end && !Number.isNaN(new Date(end).getTime())) bits.push(`closes ${new Date(end).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" /* v330: IST */ })}`);
    return bits.join(" · ");
  };
  if (isMobile) {
    return (
      <ModalPortal>
        <PopupBackdrop className="fixed inset-0 z-[9998] bg-[rgba(10,10,14,.45)]" onClick={() => !anyBusy && onClose()} />
        <PopupPanel as="form" kind="sheet" onClose={() => !anyBusy && onClose()} onSubmit={handleSubmit} className="fixed inset-x-0 bottom-0 z-[9999] bg-white rounded-t-[26px] px-[18px] pt-2.5 flex flex-col gap-3 max-h-[88dvh] overflow-y-auto overscroll-contain"
          style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))", fontFamily: "'DM Sans', sans-serif", boxShadow: "0 -20px 40px -20px rgba(0,0,0,.3)" }}>
          <div className="w-10 h-[5px] rounded-full bg-[#E0E0E6] self-center" />
          <div className="text-[17px] font-bold">Invite {firstName} to a campaign</div>
          <div className="flex flex-col gap-2">
            {campaignsError ? ( /* v344 */
              <div className="flex items-center gap-2 text-[13px] text-[#B91C1C]" role="alert">
                <span className="flex-1">Couldn't load your campaigns</span>
                {onRetryCampaigns && <button type="button" onClick={() => onRetryCampaigns()} className="min-h-[36px] px-3 rounded-xl bg-[#F3EDFF] text-[#7C3AED] font-semibold">Retry</button>}
              </div>
            ) : campaigns === null ? (
              [0, 1].map((k) => <div key={k} className="h-[60px] rounded-2xl bg-[#EFEFF4] animate-pulse" />)
            ) : campaigns.length === 0 ? (
              <div className="text-[13px] text-[#6B7280]">You have no live campaigns. Write the offer below, or create a campaign first.</div>
            ) : campaigns.map((camp) => {
              const cid = camp.campaign_id || camp.id;
              const on = pickedId === cid;
              return (
                <button type="button" key={cid} onClick={() => pick(camp)} className="min-h-[60px] rounded-2xl px-3.5 py-2.5 text-left flex items-center gap-3 transition"
                  style={{ border: on ? "1.5px solid #7C3AED" : "1px solid #E6E6EE", background: on ? "#F3EDFF" : "#fff" }}>
                  <span className="w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center" style={{ borderColor: on ? "#7C3AED" : "#D4D4DE" }}>{on && <span className="w-2.5 h-2.5 rounded-full bg-[#7C3AED]" />}</span>
                  <span className="flex-1 min-w-0"><span className="block text-sm font-semibold truncate">{camp.title || "Campaign"}</span>{campLine(camp) && <span className="block text-xs text-[#6B7280] truncate">{campLine(camp)}</span>}</span>
                </button>
              );
            })}
            {onCreateCampaign && (
              <button type="button" onClick={() => { onClose(); onCreateCampaign(); }} className="h-11 text-[13.5px] font-semibold text-[#7C3AED] text-left">+ Create a new campaign</button>
            )}
          </div>
          {!pickedId && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-[#374151]">Campaign title</span>
              <input value={campaignTitle} onChange={(e) => setCampaignTitle(e.target.value)} placeholder="e.g. Summer launch reel" className="h-[50px] rounded-[14px] border border-[#E0E0E8] px-3.5 text-[16px] outline-none focus:border-[#7C3AED]" /* v358: 16px — iOS zoomed in at 15px */ />
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-[#374151]">Deliverables</span>
            <input value={deliverables} onChange={(e) => setDeliverables(e.target.value)} placeholder="e.g. 1 Reel + 2 Stories" className="h-[50px] rounded-[14px] border border-[#E0E0E8] px-3.5 text-[16px] outline-none focus:border-[#7C3AED]" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-[#374151]">Your offer (₹)</span>
            <input value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder={`${MIN_CAMPAIGN_PAYOUT.toLocaleString("en-IN")} or more`} className="h-[50px] rounded-[14px] border border-[#E0E0E8] px-3.5 text-[17px] font-bold outline-none focus:border-[#7C3AED]" />
            {reelRate && <span className="text-[11.5px] text-[#6B7280]">{firstName}'s rate card: ₹{reelRate.toLocaleString("en-IN")} per reel{rateBelowMin ? ` · minimum offer on Ybex is ₹${MIN_CAMPAIGN_PAYOUT.toLocaleString("en-IN")}` : ""}</span>}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-[#374151]">Message</span>
            <textarea value={pitch} onChange={(e) => setPitch(e.target.value)} rows={3} placeholder="What you'd like them to make" className="rounded-[14px] border border-[#E0E0E8] px-3.5 py-3 text-[16px] outline-none focus:border-[#7C3AED] resize-none" /* v332: 16px stops iOS zoom */ />
          </label>
          <button type="submit" disabled={isBusy("send_invite")} className="h-[50px] rounded-2xl bg-[#7C3AED] text-white flex items-center justify-center gap-2 text-[15px] font-semibold disabled:opacity-60">
            {isBusy("send_invite") ? <ButtonSpinner /> : <Send size={16} />} Send invite
          </button>
          <div className="text-center text-xs text-[#6B7280]">No money moves until you hire them.</div>
        </PopupPanel>
      </ModalPortal>
    );
  }

  return (
    <ModalPortal>
    <AnimatePresence>
      <PopupBackdrop 
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget && !anyBusy) onClose();
        }}
      >
        <PopupPanel kind="modal"
          className="bg-white rounded-3xl border border-[var(--border-default)] shadow-2xl max-w-lg w-full p-6 sm:p-7 relative my-8"
        >
          {/* Dismiss button (top-right X) */}
          <button
            type="button"
            onClick={onClose}
            disabled={anyBusy}
            aria-label="Close"
            className="absolute top-3.5 right-3.5 w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors rounded-full hover:bg-gray-100 disabled:opacity-50" /* v415: 40px tap target */
          >
            <X size={18} />
          </button>

          {/* Modal Header with Creator Brief Preview */}
          <div className="flex items-center gap-3.5 mb-5 pb-4 border-b border-[var(--border-default)]">
            {creatorPhoto ? (
              <img
                src={creatorPhoto}
                alt={creatorName}
                className="w-12 h-12 rounded-2xl object-cover border border-black/5 shrink-0 shadow-xs"
              />
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--violet-soft)] to-purple-100 text-[var(--violet)] font-bold flex items-center justify-center text-base shrink-0 border border-[#DDD6FE]">
                {initialsOf(creatorName)}{/* v416 */}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--violet)] bg-[var(--violet-soft)] px-2 py-0.5 rounded-full">
                  Direct Invitation
                </span>
                {creatorNiche && (
                  <span className="text-[10px] text-gray-500 font-medium truncate max-w-[120px]">
                    • {creatorNiche.split(",")[0]}
                  </span>
                )}
              </div>
              <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)] truncate mt-0.5">
                Invite {creatorName}
              </h3>
              {creatorHandle && (
                <p className="text-xs text-gray-500 font-medium">@{creatorHandle.replace('@', '')}</p>
              )}
            </div>
          </div>

          {/* Form */}
          <form data-testid="invite-form" onSubmit={handleSubmit} className="space-y-4">
            {/* v358: desktop can pick one of the brand's live campaigns too (same send-brief call; campaign_id lets the
                server spot "already applied / in a deal") — the campaigns list was ignored on desktop */}
            {Array.isArray(campaigns) && campaigns.length > 0 && (
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1.5">Campaign (optional)</label>
                <select
                  value={pickedId || ""}
                  onChange={(e) => {
                    const camp = campaigns.find((c) => String(c.campaign_id || c.id) === e.target.value);
                    if (camp) pick(camp); else setPickedId(null);
                  }}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[var(--text-primary)] focus:border-[var(--violet)] outline-none"
                >
                  <option value="">Not linked to a campaign</option>
                  {campaigns.map((c) => <option key={c.campaign_id || c.id} value={String(c.campaign_id || c.id)}>{c.title || "Campaign"}</option>)}
                </select>
              </div>
            )}
            {campaignsError && <p className="text-[11px] text-red-600" role="alert">Couldn't load your campaigns — you can still send the invite.</p>}
            {/* Campaign Name */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <FileText size={12} className="text-gray-500" /> Campaign Name
              </label>
              <input
                type="text"
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
                placeholder="e.g. Summer Skincare Product Launch"
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[var(--text-primary)] focus:border-[var(--violet)] focus:bg-white outline-none transition-all placeholder:text-gray-400"
              />
            </div>

            {/* Proposed Budget & Timeline Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <IndianRupee size={12} className="text-gray-500" /> Your Offer (₹, min {MIN_CAMPAIGN_PAYOUT.toLocaleString("en-IN")})
                </label>
                <input
                  type="text"
                  required
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="e.g. 15,000"
                  inputMode="numeric"
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[var(--text-primary)] focus:border-[var(--violet)] focus:bg-white outline-none transition-all placeholder:text-gray-400"
                />
                {reelRate && <p className="text-[10px] text-gray-500 mt-1">Rate card: ₹{reelRate.toLocaleString("en-IN")} per reel{rateBelowMin ? ` · minimum offer is ₹${MIN_CAMPAIGN_PAYOUT.toLocaleString("en-IN")}` : ""}</p>}{/* v415 */}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Calendar size={12} className="text-gray-500" /> Timeline / Deadline
                </label>
                <input
                  type="text"
                  value={timeline}
                  onChange={(e) => setTimeline(e.target.value)}
                  placeholder="e.g. 7-10 days (a number means days)"
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[var(--text-primary)] focus:border-[var(--violet)] focus:bg-white outline-none transition-all placeholder:text-gray-400"
                />
              </div>
            </div>

            {/* Deliverables */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Package size={12} className="text-gray-500" /> Deliverables Requested
              </label>
              <input
                type="text"
                value={deliverables}
                onChange={(e) => setDeliverables(e.target.value)}
                placeholder="e.g. 1 Dedicated Reel + 2 Story frames"
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[var(--text-primary)] focus:border-[var(--violet)] focus:bg-white outline-none transition-all placeholder:text-gray-400"
              />
              <p className="text-[10px] text-gray-500 mt-1">Specify formats so the creator understands the required content.</p>
            </div>

            {/* Pitch / Message */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Send size={12} className="text-gray-500" /> Pitch & Campaign Brief
              </label>
              <textarea
                required
                rows={3}
                value={pitch}
                onChange={(e) => setPitch(e.target.value)}
                placeholder="Describe your brand goals, creative angles, key talking points, or product details..."
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-3 text-xs sm:text-sm text-[var(--text-primary)] focus:border-[var(--violet)] focus:bg-white outline-none transition-all placeholder:text-gray-400 resize-none"
              />
            </div>

            {/* Explainer Note */}
            <div className="bg-amber-50/70 border border-amber-200/70 rounded-xl p-3 flex items-start gap-2.5 text-amber-900 text-xs">
              <CheckCircle2 size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="leading-snug text-[11px]">
                The chat opens once {creatorName} accepts your invitation. No money moves until you hire them.{/* v415: plain copy (was "Gated Privacy Protection") */}
              </p>
            </div>

            {/* Action Buttons: Strict docs/code/ARCHITECTURE.md Alignment */}
            {/* Left: Dismissive / Secondary; Right: Affirmative / Primary */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--border-default)]">
              <button
                type="button"
                onClick={onClose}
                disabled={anyBusy}
                className="btn-secondary py-2.5 px-5 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={anyBusy}
                className="btn-primary py-2.5 px-6 text-xs font-semibold cursor-pointer shadow-md"
              >
                {isBusy("send_invite") ? (
                  <ButtonSpinner label="Sending Invitation..." />
                ) : (
                  <>
                    <Send size={14} /> Send Invitation
                  </>
                )}
              </button>
            </div>
          </form>
        </PopupPanel>
      </PopupBackdrop>
    </AnimatePresence>
    </ModalPortal>
  );
}

// Session 37: stays mounted for its closing animation.
export default function InviteToCampaignModal(props) {
  return <Presence>{props.isOpen && props.creator && <InviteToCampaignModalBody key="invitetocampaignmodal" {...props} />}</Presence>;
}

