import React from "react";
import { MessageSquare, X, Eye } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import PersonPhoto from "@/components/common/PersonPhoto";
import { maskContact } from "@/utils/maskContact";

export default function ApplicantCard({ applicant, onShortlist, onReject, onViewProfile, onChat, busy = false }) { // v358: + busy
  const a = applicant;
  
  // Format followers display
  let followersCount = ""; // v332: unknown follower count showed a made-up "0 followers" — now hidden
  const rawFollowers = a.followers_count ?? a.follower_count ?? a.followers ?? a.followers_instagram ?? a.ig_followers;
  
  if (typeof rawFollowers === 'number') {
    if (rawFollowers >= 1000000) followersCount = (rawFollowers / 1000000).toFixed(1).replace(/\.0$/, '') + "M";
    else if (rawFollowers >= 1000) followersCount = (rawFollowers / 1000).toFixed(1).replace(/\.0$/, '') + "K";
    else if (rawFollowers > 0) followersCount = rawFollowers.toLocaleString("en-IN"); // v332: Indian format
  } else if (rawFollowers) {
    let str = String(rawFollowers).toUpperCase().trim();
    let num = parseFloat(str.replace(/[^0-9.]/g, ''));
    if (!isNaN(num) && num > 0) {
      if (str.includes('M')) num = num * 1000000;
      else if (str.includes('K')) num = num * 1000;
      
      if (num >= 1000000) followersCount = (num / 1000000).toFixed(1).replace(/\.0$/, '') + "M";
      else if (num >= 1000) followersCount = (num / 1000).toFixed(1).replace(/\.0$/, '') + "K";
      else followersCount = num.toLocaleString("en-IN");
    } else {
      followersCount = String(rawFollowers);
    }
  }

  // Clean social handle if URL was passed
  let cleanHandle = a.instagram_handle || a.handle || ""; // v358: no made-up "@creator"
  if (cleanHandle.includes("instagram.com/")) {
    cleanHandle = cleanHandle.split("instagram.com/")[1]?.split("/")[0]?.split("?")[0] || cleanHandle;
  } else if (cleanHandle.startsWith("http://") || cleanHandle.startsWith("https://")) {
    try {
      const urlObj = new URL(cleanHandle);
      cleanHandle = urlObj.pathname.replace(/^\/+|\/+$/g, '').split("/")[0] || (a.full_name || "creator").toLowerCase().replace(/\s+/g, '_');
    } catch (e) {
      cleanHandle = (a.full_name || "creator").toLowerCase().replace(/\s+/g, '_');
    }
  }
  cleanHandle = cleanHandle.replace(/^@+/, ''); // v358: no handle made up from the name

  // Session 58: brands see only what the creator really sent (no ₹12,000 / "5 days" / made-up pitch).
  const hasRate = Number(a.proposed_amount) > 0; // v415: "Not specified" was shown in money-green
  const rateProposed = hasRate ? `₹${Number(a.proposed_amount).toLocaleString("en-IN")}` : "Not proposed yet";
  const estDelivery = a.delivery_days ? (/day/i.test(String(a.delivery_days)) ? a.delivery_days : `${a.delivery_days} days`) : "";
  const status = String(a.status || "PENDING").toUpperCase();
  // v330: "applied" / "new" / lowercase "pending" pitches showed only a raw status badge — no Reject /
  // Shortlist buttons — although the mobile "Under review" tab lists them as new pitches.
  const isNewPitch = ["PENDING", "APPLIED", "NEW"].includes(status);
  // v415: readable status words (badge showed raw "ACCEPTED" / "SHORTLISTED" / "REJECTED")
  const isShortlisted = ["ACCEPTED", "SHORTLISTED", "APPROVED"].includes(status);
  const statusWord = isShortlisted ? "Shortlisted" : ["REJECTED", "DECLINED", "PASSED"].includes(status) ? "Declined" : ["HIRED", "DEAL_ACTIVE"].includes(status) ? "Hired" : status === "COMPLETED" ? "Completed" : status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
  const bio = maskContact(a.pitch_text || a.pitch || ""); // v346: the brand never sees a phone/email typed in the pitch

  return (
    <div className="bg-[var(--bg-card)]/80 border border-[var(--border-default)] p-5 rounded-2xl shadow-sm text-left relative overflow-hidden hover:border-[var(--violet)]/20 transition-all duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Author Avatar & details */}
        <div className="flex items-start gap-3.5 min-w-0">
          <PersonPhoto
            src={a.profile_photo_url || a.photo}
            name={a.full_name}
            className="w-12 h-12 rounded-xl object-cover border border-[var(--border-default)] shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-base font-bold text-[var(--text-primary)] leading-tight break-words min-w-0">{a.full_name || "Creator"}</h4>
              {followersCount && <span className="text-xs font-mono font-bold text-[#9D7CFF]">{followersCount} followers</span>}
            </div>
            {/* v330: long handles ran off the card at 320px — the line now wraps / truncates. */}
            <div className="text-xs text-[var(--text-secondary)] mt-1 flex flex-wrap items-center gap-x-1.5 font-sans min-w-0">
              {/* v358: only what we know — no "@creator" / "—" / made-up "India" */}
              {[cleanHandle ? `@${cleanHandle}` : null, a.category || null, a.city || null].filter(Boolean).map((part, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span>•</span>}
                  <span className={i === 0 ? "truncate max-w-full" : ""}>{part}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* Commercial summary */}
        <div className="bg-white/[0.02] border border-[var(--border-default)] px-4 py-2.5 rounded-xl text-left sm:text-right font-mono min-w-[140px]">
          <div className="text-[10px] text-[var(--text-tertiary)] uppercase">Proposed fee</div>
          <div className={`text-sm font-bold mt-0.5 ${hasRate ? "text-emerald-600" : "text-[var(--text-secondary)] font-semibold"}`}>{rateProposed}</div>
          {estDelivery && <div className="text-[11px] text-[var(--text-secondary)] mt-1">Delivery: {estDelivery}</div>}
        </div>
      </div>

      {/* Pitch pitch */}
      {bio && <div className="mt-4 bg-white/[0.02] border-l border-[var(--violet)]/30 pl-3.5 py-1 text-xs text-[var(--text-secondary)] leading-relaxed italic">
        &ldquo;{bio}&rdquo;
      </div>}

      {/* Actions */}
      <div className="mt-5 pt-4 border-t border-[var(--border-default)] flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => onViewProfile && onViewProfile(a)}
          className="min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-bold border border-[var(--border-default)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-all cursor-pointer flex items-center gap-1.5" /* v332: 40px tap target */
        >
          <Eye size={13} /> View profile
        </button>

        {isNewPitch ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onReject && onReject(a)}
              className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-bold border border-red-500/20 hover:bg-red-500/10 text-red-400 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <X size={14} /> Decline{/* v415: same word as the confirm sheet */}
            </button>
            
            <button
              onClick={() => onShortlist && onShortlist(a)}
              disabled={busy} /* v358: visible busy state */
              className="min-h-[40px] px-4 py-2 rounded-lg text-xs font-bold bg-[var(--violet)] hover:bg-[#6B4AFF] text-white shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-wait"
            >
              <MessageSquare size={14} /> {busy ? "Shortlisting…" : "Shortlist & chat"}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Badge variant={status}>{statusWord /* v330: no raw DEAL_ACTIVE · v415: plain words */}</Badge>
            {isShortlisted && ( /* v415: "SHORTLISTED" pitches had no Chat button */
               <button
                 onClick={() => onChat && onChat(a)}
                 className="min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-bold bg-[var(--violet)] hover:bg-[#6B4AFF] text-white shadow-md transition-all cursor-pointer flex items-center gap-1.5"
               >
                 <MessageSquare size={14} /> Chat
               </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
