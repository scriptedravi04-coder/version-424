import React from "react";

// Session 58 (Ravi, Q14): the brand's own Do's / Don'ts / Hashtags on the campaign page.
// Shows nothing when the brand left them empty (no sample text).
const lines = (v) => (Array.isArray(v) ? v : String(v || "").split("\n")).map((x) => String(x || "").trim()).filter(Boolean);

export default function CampaignBriefExtras({ campaign, compact = false }) {
  const dos = lines(campaign?.dos);
  const donts = lines(campaign?.donts);
  const tags = (Array.isArray(campaign?.hashtags) ? campaign.hashtags : []).filter(Boolean);
  if (!dos.length && !donts.length && !tags.length) return null;
  const box = compact ? "mt-3 space-y-3 text-[13px]" : "mt-4 space-y-4 text-sm";
  return (
    <div className={box}>
      {dos.length > 0 && (
        <div>
          <p className="text-xs font-bold text-[#027A48] mb-1">Do's</p>
          <ul className="list-disc pl-5 space-y-0.5 text-[var(--text-primary)]">{dos.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </div>
      )}
      {donts.length > 0 && (
        <div>
          <p className="text-xs font-bold text-[#B42318] mb-1">Don'ts</p>
          <ul className="list-disc pl-5 space-y-0.5 text-[var(--text-primary)]">{donts.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </div>
      )}
      {tags.length > 0 && (
        <div>
          <p className="text-xs font-bold text-[var(--text-secondary)] mb-1">Hashtags</p>
          <div className="flex flex-wrap gap-1.5">{tags.map((t) => <span key={t} className="px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-default)] text-xs">{t}</span>)}</div>
        </div>
      )}
    </div>
  );
}
