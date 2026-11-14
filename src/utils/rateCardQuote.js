// Session 40 (Ravi OK): the apply quote starts from the creator's own rate card for what the
// campaign asks for, instead of the brand's minimum budget. The creator can still type any amount.
// v430 (Ravi): creators' rates are collected and kept, but NOT shown to brands yet — they come later in the paid
// (premium) plan for brands. false = brands see "coming soon"; the creator still sees their own rates.
export const RATES_PUBLIC = false;

const n = (v) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };

export function rateForDeliverables(profile, deliverables = [], platforms = []) {
  if (!profile) return 0;
  const rc = profile.rate_card && typeof profile.rate_card === "object" ? profile.rate_card : {};
  const reel = n(profile.rate_reel) || n(rc.reels) || n(rc.reel);
  const story = n(profile.rate_story) || n(rc.stories) || n(rc.story);
  const yt = n(profile.rate_yt_video) || n(rc.yt_video) || n(rc.dedicated_video) || n(rc.youtube_integration);
  const ugc = n(rc.ugc_video) || n(rc.ugc);
  const text = [...(Array.isArray(deliverables) ? deliverables : [deliverables]), ...(platforms || [])]
    .map((d) => String(d?.title || d?.type || d || "").toLowerCase()).join(" ");
  let total = 0;
  if (/youtube|video integration|dedicated video/.test(text) && yt) total += yt;
  if (/reel/.test(text) && reel) total += reel;
  if (/stor(y|ies)/.test(text) && story) total += story;
  if (/ugc/.test(text) && ugc) total += ugc;
  return total || reel || 0;
}
