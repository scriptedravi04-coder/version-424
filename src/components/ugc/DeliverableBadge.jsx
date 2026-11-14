import React from "react";
import { Film, Video, Scissors, Share2, EyeOff, Camera } from "lucide-react";

/**
 * Normalizes and extracts standard deliverable configuration
 * Supports:
 * 1. collaboration_reel / instagram_reel / collab -> "COLLAB REEL"
 * 2. ugc_video_edited / edited -> "UGC EDITED"
 * 3. ugc_video_raw / ugc_raw_video / raw / draft -> "UGC DRAFT / RAW"
 */
export const getDeliverableConfig = (deliverableType) => {
  const dt = String(deliverableType || "").toLowerCase().trim();

  // 1. COLLABORATION REEL / INSTAGRAM REEL
  if (dt === "collaboration_reel" || dt === "instagram_reel" || dt.includes("collab")) {
    return {
      key: "collab",
      label: "COLLAB REEL", // v418
      shortLabel: "Collaboration",
      pillBg: "bg-[#F5F0FF] text-[#7C3AED] border-[#DDD6FE] dark:bg-purple-950/60 dark:text-purple-300 dark:border-[#6D28D9]/60",
      pillSolid: "bg-[#7C3AED] text-white border-transparent",
      badgeGradient: "from-[#7C3AED] via-[#7C3AED] to-fuchsia-600 text-white shadow-[#7C3AED]/20",
      cardBorder: "border-purple-300 dark:border-[#6D28D9]/60",
      bannerBg: "bg-gradient-to-br from-[#7C3AED]/10 via-fuchsia-500/5 to-[#7C3AED]/10",
      accentColor: "#7C3AED",
      emoji: "",
      IconComponent: Share2,
      headline: "Collab Reel (Instagram profile collab)", // v418
      tagline: "Publish as a Collaborative Reel on your personal Instagram feed",
      postingSummary: "Required on your Personal Instagram",
      editingSummary: "Fully edited & sound-synced video",
      privacySummary: "Public Collab with Brand co-author",
      shortBenefit: "Co-author with brand • High audience engagement & viral reach on your handle",
      details: "You will film, edit, and post this video directly on your personal Instagram profile as a collaborative Reel with the brand account.",
      whatToDeliver: "Publish live Instagram Collab Reel & submit link",
      isPostingRequired: true,
      tag: "Instagram Collab"
    };
  }

  // 2. RAW UGC / DRAFT CLIPS (NO EDITING)
  if (dt === "ugc_video_raw" || dt === "ugc_raw_video" || dt.includes("raw") || dt.includes("draft")) {
    return {
      key: "raw",
      label: "UGC RAW",
      shortLabel: "UGC Raw",
      pillBg: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60",
      pillSolid: "bg-amber-600 text-white border-transparent",
      badgeGradient: "from-amber-500 via-orange-600 to-yellow-600 text-white shadow-amber-500/20",
      cardBorder: "border-amber-300 dark:border-amber-800/60",
      bannerBg: "bg-gradient-to-br from-amber-500/10 via-yellow-500/5 to-orange-500/10",
      accentColor: "#D97706",
      emoji: "",
      IconComponent: Film,
      headline: "UGC Raw Takes (Zero Video Editing Required)",
      tagline: "Shoot clean raw camera takes & upload directly to the brand",
      postingSummary: "NO posting on your personal profile",
      editingSummary: "Zero editing • No captions • Raw takes only",
      privacySummary: "100% Private (Direct Brand asset)",
      shortBenefit: "Zero video editing • No captions • Never posted on your personal profile",
      details: "Zero editing, background music, or text overlays required! Just shoot clean, steady high-res video clips and upload them directly. Your personal social media stays 100% untouched.",
      whatToDeliver: "Upload raw camera clips directly (no editing needed)",
      isPostingRequired: false,
      tag: "Zero Editing Needed"
    };
  }

  // 3. EDITED UGC VIDEO (DEFAULT)
  return {
    key: "edited",
    label: "UGC EDITED",
    shortLabel: "UGC Edited",
    pillBg: "bg-blue-50 text-[#6D28D9] border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/60",
    pillSolid: "bg-blue-600 text-white border-transparent",
    badgeGradient: "from-blue-600 via-[#7C3AED] to-cyan-600 text-white shadow-blue-500/20",
    cardBorder: "border-blue-300 dark:border-blue-800/60",
    bannerBg: "bg-gradient-to-br from-blue-500/10 via-[#7C3AED]/5 to-cyan-500/10",
    accentColor: "#2563EB",
    emoji: "",
    IconComponent: Video,
    headline: "UGC Edited Video (Brand Asset Submission)",
    tagline: "Deliver fully edited vertical video with sound/subtitles directly to brand",
    postingSummary: "NO posting on your personal profile",
    editingSummary: "Fully edited vertical video (audio + text)",
    privacySummary: "100% Private (Direct Brand asset)",
    shortBenefit: "Upload file directly to brand • Personal profile remains 100% private",
    details: "Produce, edit, and upload a polished vertical UGC video with background audio and subtitles. This is for brand marketing campaigns — you DO NOT post anything on your personal profile.",
    whatToDeliver: "Upload finished edited video file directly (no personal post)",
    isPostingRequired: false,
    tag: "Brand Asset • No IG Post"
  };
};

/**
 * Compact Deliverable Badge for Brief Cards and Modals
 */
export function DeliverableBadge({ deliverableType, size = "sm", className = "", showIcon = true }) {
  const config = getDeliverableConfig(deliverableType);
  const Icon = config.IconComponent;

  if (size === "pill" || !showIcon) {
    return (
      <span
        className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap border shadow-2xs ${config.pillBg} ${className}`}
        title={config.headline}
      >
        <span>{config.shortLabel || config.label}</span>
      </span>
    );
  }

  if (size === "xs") {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[11px] uppercase tracking-wider border shadow-2xs ${config.pillBg} ${className}`}
        title={config.headline}
      >
        <Icon size={10} className="stroke-[2.5]" />
        <span>{config.label}</span>
      </span>
    );
  }

  if (size === "lg") {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-black text-[11px] uppercase tracking-wider border shadow-xs ${config.pillBg} ${className}`}
        title={config.headline}
      >
        <Icon size={13} className="stroke-[2.5]" />
        <span>{config.label}</span>
      </div>
    );
  }

  // Default 'sm' or 'md'
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-extrabold text-[10px] uppercase tracking-wider border shadow-2xs ${config.pillBg} ${className}`}
      title={config.headline}
    >
      <Icon size={11} className="stroke-[2.5]" />
      <span>{config.label}</span>
    </span>
  );
}

/**
 * Sleek, high-density Deliverable Explainer Strip for the "I Commit — Claim Now" Modal
 * Ultra-compact (~50-60px) so the brief title, requirements and details remain visible above the fold!
 */
export function DeliverableExplainerCard({ deliverableType, duration = "" }) {
  const config = getDeliverableConfig(deliverableType);
  const Icon = config.IconComponent;

  return (
    <div
      className={`p-2.5 sm:p-3 rounded-xl border ${config.cardBorder} ${config.bannerBg} relative transition-all shadow-2xs my-1`}
    >
      {/* Top micro-row: Deliverable Format + Duration + Tag */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-[var(--text-tertiary)]">
            Deliverable:
          </span>
          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border shadow-2xs ${config.pillBg}`}>
            <span className="text-xs leading-none">{config.emoji}</span>
            <Icon size={11} className="stroke-[2.5]" />
            <span>{config.label}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {duration && (
            <span className="text-[10px] font-bold text-[var(--text-secondary)] bg-[var(--bg-card)]/90 px-2 py-0.5 rounded-md border border-[var(--border-default)] shadow-2xs">
              ⏱ {duration}
            </span>
          )}
          <span className={`text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${config.pillBg}`}>
            {config.tag}
          </span>
        </div>
      </div>

      {/* High-density 2-Pillar Guidance in 1 clean responsive row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
        {/* Where to publish */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)]/90 border border-[var(--border-default)] shadow-2xs">
          {config.isPostingRequired ? (
            <Share2 size={13} className="text-[#7C3AED] shrink-0 stroke-[2.2]" />
          ) : (
            <EyeOff size={13} className="text-emerald-600 shrink-0 stroke-[2.2]" />
          )}
          <div className="min-w-0 flex-1">
            <span className={`text-[11px] font-bold block leading-tight ${config.isPostingRequired ? 'text-[#7C3AED]' : 'text-emerald-700 dark:text-emerald-400'}`}>
              {config.isPostingRequired ? "Post on your Instagram (Collab)" : "No posting on your profile (Private)"}
            </span>
          </div>
        </div>

        {/* Editing requirement */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)]/90 border border-[var(--border-default)] shadow-2xs">
          {config.key === "raw" ? (
            <Camera size={13} className="text-amber-600 shrink-0 stroke-[2.2]" />
          ) : (
            <Scissors size={13} className="text-[#7C3AED] shrink-0 stroke-[2.2]" />
          )}
          <div className="min-w-0 flex-1">
            <span className={`text-[11px] font-bold block leading-tight ${config.key === 'raw' ? 'text-amber-700 dark:text-amber-400' : 'text-[#6D28D9] dark:text-blue-400'}`}>
              {config.key === 'raw' ? "Raw clips only • Zero editing needed" : "Fully edited vertical video (Audio/subs)"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DeliverableBadge;
