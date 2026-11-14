import React from "react";
import { Briefcase, ChevronRight, MessageCircle } from "lucide-react";
import { Shimmer } from "../../common/ContentSkeletons";
import MobileBackButton from "../../common/MobileBackButton";
import { OfflineAware } from "../../common/OfflineState"; // v334

// Session 23 — design D01 (Deals workspace). Presentation only: the lists come from the desktop
// Collabs page (`categorized` from GET collabs), the same data desktop shows.
// Taps (design wiring, mapped to what exists in the app):
//   Application PENDING   → campaign details (C02)
//   Application with chat → the chat (shortlisted / offer)
//   REJECTED / DECLINED   → greyed, no tap
//   Ongoing / Completed   → the deal's chat — contract OTP sign, secure payment hold, submit and payout all
//                           happen there (same as desktop "Open chat").

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

const CHIP = {
  PENDING: ["#FFFBEB", "#B45309", "Pending"],
  APPLIED: ["#FFFBEB", "#B45309", "Pending"],
  SHORTLISTED: ["#F5F0FF", "#7C3AED", "Shortlisted"],
  NEGOTIATING: ["#F5F0FF", "#7C3AED", "Negotiating"],
  AI_AGREEMENT_READY: ["#FEF2F2", "#DC2626", "Sign contract"],
  AWAITING_SIGNATURE: ["#FEF2F2", "#DC2626", "Sign contract"],
  ACCEPTED: ["#ECFDF5", "#059669", "Accepted"],
  ACTIVE: ["#EFF6FF", "#2563EB", "In progress"],
  IN_PROGRESS: ["#EFF6FF", "#2563EB", "In progress"],
  SUBMITTED: ["#FFFBEB", "#B45309", "Under review"],
  CONTENT_SUBMITTED: ["#FFFBEB", "#B45309", "Under review"],
  CONTENT_APPROVED: ["#ECFDF5", "#059669", "Draft approved"],
  COMPLETED: ["#ECFDF5", "#059669", "Completed"],
  PAID: ["#ECFDF5", "#059669", "Paid"],
  REJECTED: ["#F2F2F7", "#8E8E93", "Not selected"],
  DECLINED: ["#F2F2F7", "#8E8E93", "Declined"],
  CANCELLED: ["#F2F2F7", "#8E8E93", "Cancelled"],
};
const chipFor = (s) => CHIP[String(s || "").toUpperCase()] || ["#F2F2F7", "#4B5563", String(s || "Open").replace(/_/g, " ").toLowerCase().replace(/^./, (m) => m.toUpperCase())];
const isDead = (s) => ["REJECTED", "DECLINED", "CANCELLED"].includes(String(s || "").toUpperCase());

function Row({ it, onTap }) {
  const [bg, fg, label] = chipFor(it.status);
  const dead = isDead(it.status);
  return (
    <button
      disabled={dead}
      onClick={() => onTap(it)}
      className={`w-full text-left bg-white rounded-[18px] border border-[#E5E5EA] p-3.5 flex items-center gap-3 ${dead ? "opacity-55" : "active:scale-[.99]"} transition-transform`}
    >
      <div className="w-10 h-10 rounded-xl bg-[#F5F0FF] text-[#7C3AED] flex items-center justify-center font-bold shrink-0">
        {String(it.brandName || "B").charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-bold text-[#0A0A0A] truncate">{it.title}</div>
        <div className="text-[12px] text-[#6B7280] truncate">{it.brandName}{it.payout ? ` · ${inr(it.payout)}` : ""}</div>
      </div>
      <span className="shrink-0 px-2 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-wide" style={{ background: bg, color: fg }}>{label}</span>
      {!dead && <ChevronRight size={16} className="text-[#C7C7CC] shrink-0" />}
    </button>
  );
}

export default function DealsMobile({ categorized, loading, error = false, onRetry, tab, setTab, onOpenChat, onOpenCampaign, onBrowse, role }) {
  const isBrandView = role === "brand"; // v415
  const apps = categorized?.applications || [];
  const ongoing = categorized?.activeDeals || [];
  const done = categorized?.history || [];
  // v353: the "Completed" stat counted rejected / declined / cancelled pitches too — only finished deals now.
  const doneCount = done.filter((d) => !isDead(d.status)).length;
  const hasDeadInHistory = done.length > doneCount;
  const inReview = ongoing.filter((d) => ["SUBMITTED", "CONTENT_SUBMITTED", "LIVE_LINKS_SUBMITTED", "PROOF_SUBMITTED"].includes(String(d.status || "").toUpperCase())).length; // v414: + PROOF_SUBMITTED

  const tabs = [
    ["applications", "Applications", apps.length],
    ["active_deals", "Ongoing", ongoing.length],
    ["history", hasDeadInHistory ? "Past" : "Completed", done.length], // v353: holds declined / cancelled too → "Past"
  ];
  const list = tab === "applications" ? apps : tab === "history" ? done : ongoing;

  const onTap = (it) => {
    const chatId = it.thread_id || it.raw?.thread_id;
    if (tab === "applications") {
      if (chatId) return onOpenChat(chatId);
      const campaignId = it.raw?.campaign_id || it.campaign_id;
      if (campaignId) return onOpenCampaign(campaignId);
      return;
    }
    onOpenChat(chatId || it.raw?.collab_id || it.id);
  };

  return (
    <div className="bg-[#F2F2F7] pb-3" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="bg-white px-4 pt-4 pb-3 border-b border-[#E5E5EA]">
        <div className="flex items-center gap-3">
          <MobileBackButton />
          <div className="min-w-0">
            <div className="text-[24px] font-bold tracking-[-.6px] text-[#0A0A0A]">Deals</div>
            <div className="text-[12.5px] text-[#6B7280]">{isBrandView ? "Your creator deals in one place" : "Pitches, contracts and deliverables"}</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {[["In progress", ongoing.length - inReview], ["Under review", inReview], ["Completed", doneCount]].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-[#F9F9FB] px-3 py-2.5">
              <div className="text-[18px] font-bold text-[#0A0A0A]">{loading ? "—" : Math.max(0, v) /* v332: no "0 0 0" flash before the deals load */}</div>
              <div className="text-[11px] text-[#6B7280]">{l}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-1 p-1 rounded-[13px] bg-[#F2F2F7]">
          {/* v330: labels truncate instead of spilling at 320px ("Applications · 12") */}
          {tabs.map(([id, label, n]) => (
            <button key={id} onClick={() => setTab(id)} className={`flex-1 min-w-0 px-1 truncate h-9 rounded-[10px] text-[12.5px] font-bold ${tab === id ? "bg-white text-[#7C3AED] shadow-sm" : "text-[#6B7280]"}`}>
              {label}{n > 0 && !loading ? ` · ${n}` : "" /* v353: was `n &&` → "Ongoing0" */}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-[18px] border border-[#E5E5EA] p-3.5 flex gap-3">
              <Shimmer className="w-10 h-10 !rounded-xl" /><div className="flex-1 space-y-2"><Shimmer className="h-3.5 w-3/4" /><Shimmer className="h-3 w-1/3" /></div>
            </div>
          ))
        ) : error && list.length === 0 ? (
          /* v330: a failed load used to say "No pending applications" / "No ongoing deals". */
          <OfflineAware className="mt-6" onRetry={onRetry}>{/* v334: offline → OfflineState */}
          <div className="mt-10 flex flex-col items-center text-center px-8">
            <div className="text-[16px] font-bold text-[#0A0A0A]">Couldn't load your deals</div>
            <div className="mt-1 text-[13px] text-[#6B7280]">Check your connection and try again.</div>
            {onRetry && <button type="button" onClick={onRetry} className="mt-4 h-11 px-5 rounded-xl bg-[#7C3AED] text-white text-[13.5px] font-bold">Try again</button>}
          </div>
          </OfflineAware>
        ) : list.length === 0 ? (
          <div className="mt-10 flex flex-col items-center text-center px-8">
            <div className="w-14 h-14 rounded-2xl bg-white border border-[#E5E5EA] flex items-center justify-center"><Briefcase size={22} className="text-[#7C3AED]" /></div>
            <div className="mt-4 text-[16px] font-bold text-[#0A0A0A]">
              {tab === "applications" ? (isBrandView ? "No new applications" : "No pending applications") : tab === "history" ? "No completed deals yet" : "No ongoing deals"}
            </div>
            {/* v416 (QA U13): brands saw the creator text "Apply to live campaigns…" + "Browse live campaigns" */}
            <div className="mt-1 text-[13px] text-[#6B7280]">{isBrandView
              ? (tab === "applications" ? "Creators who apply to your campaigns will appear here." : tab === "history" ? "Finished deals will be kept here." : "When you accept a creator's application, the deal appears here.")
              : "Apply to live campaigns — accepted pitches become deals here."}</div>
            <button type="button" onClick={onBrowse} className="mt-4 h-11 px-5 rounded-xl bg-[#7C3AED] text-white text-[13.5px] font-bold">{isBrandView ? "View my campaigns" : "Browse live campaigns"}</button>
          </div>
        ) : (
          list.map((it) => <Row key={`${tab}-${it.id}`} it={it} onTap={onTap} />)
        )}
        {!loading && tab !== "applications" && list.length > 0 && (
          <div className="pt-2 flex items-center justify-center gap-1.5 text-[11.5px] text-[#8E8E93]">
            <MessageCircle size={12} /> {isBrandView ? "Agreement, payment, drafts and approval all happen in each deal's chat." : "Contract, secure payment hold, submission and payout happen in the deal's chat."}
          </div>
        )}
      </div>
    </div>
  );
}
