// Session 40 (Ravi chose option B in session 39, OK'd in session 40: "in pr bhi ok h kaam shuru kro").
//
// Before: "Authentic Audience" and "Performance Score" were made from the follower count alone
// (fake % = 3.5 + (followers mod 120) / 10) — a number that looked measured but meant nothing.
// Now both are an ESTIMATE from the creator's own onboarding numbers, always labelled "Estimate".
//
//   engagement  = (avg likes + avg comments) ÷ followers × 100
//   reach rate  = avg reach ÷ followers × 100
//   Each is compared with a typical level for that account size (rough Instagram norms, not Ybex
//   data — they can become admin settings later):
//       < 10K      ER 4%    reach 30%
//       10K – 1L   ER 2.5%  reach 25%
//       1L – 10L   ER 1.5%  reach 20%
//       > 10L      ER 1%    reach 15%
//   Authentic audience (Estimate) = 60% engagement fit + 40% reach fit (each capped at 1),
//                                   shown between 50% and 98%.
//   Performance score (Estimate)  = 50 + 30 × engagement fit + 15 × reach fit (fits capped at 1.25),
//                                   shown between 40 and 98.
//   No followers, or neither likes nor reach → "Not enough data" (null), never a made-up number.
//
// Example: 50,000 followers, 1,200 likes, 85 comments, 8,500 reach → ER 2.57%, reach 17% →
// authentic ~87% · performance ~91.

export type AudienceInput = {
  followers?: number | string | null;
  avgLikes?: number | string | null;
  avgComments?: number | string | null;
  avgReach?: number | string | null;
};

export type AudienceEstimate = {
  enough: boolean;
  engagementRate: number | null; // %
  reachRate: number | null;      // %
  authenticPct: number | null;   // 50–98
  performanceScore: number | null; // 40–98
};

export const ESTIMATE_NOTE = "Based on the creator's own numbers, not verified.";

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function typicalLevels(followers: number): { er: number; reach: number } {
  if (followers < 10_000) return { er: 4, reach: 30 };
  if (followers < 100_000) return { er: 2.5, reach: 25 };
  if (followers < 1_000_000) return { er: 1.5, reach: 20 };
  return { er: 1, reach: 15 };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function audienceEstimate(input: AudienceInput): AudienceEstimate {
  const followers = num(input.followers);
  const likes = num(input.avgLikes);
  const comments = num(input.avgComments);
  const reach = num(input.avgReach);
  const none: AudienceEstimate = { enough: false, engagementRate: null, reachRate: null, authenticPct: null, performanceScore: null };
  if (!followers) return none;

  const er = likes || comments ? Math.min(100, ((likes + comments) / followers) * 100) : null;
  const rr = reach ? Math.min(100, (reach / followers) * 100) : null;
  if (er === null && rr === null) return none;

  const t = typicalLevels(followers);
  const erFit = er === null ? null : er / t.er;
  const rrFit = rr === null ? null : rr / t.reach;

  // When only one number exists, it carries the whole weight.
  const fitA = (x: number | null) => (x === null ? null : Math.min(x, 1));
  const a = fitA(erFit);
  const b = fitA(rrFit);
  const authenticFit = a !== null && b !== null ? 0.6 * a + 0.4 * b : (a ?? b ?? 0);
  const authenticPct = Math.round(clamp(authenticFit * 100, 50, 98));

  const fitP = (x: number | null) => (x === null ? null : Math.min(x, 1.25));
  const pa = fitP(erFit);
  const pb = fitP(rrFit);
  const perfRaw = pa !== null && pb !== null ? 50 + 30 * pa + 15 * pb : 50 + 45 * (pa ?? pb ?? 0);
  const performanceScore = Math.round(clamp(perfRaw, 40, 98));

  return {
    enough: true,
    engagementRate: er === null ? null : Math.round(er * 100) / 100,
    reachRate: rr === null ? null : Math.round(rr * 10) / 10,
    authenticPct,
    performanceScore,
  };
}

/** Picks the numbers from any creator row the app passes around (profile, search result, deal). */
export function estimateForCreator(c: any): AudienceEstimate {
  const x = c || {};
  const p = x.creator_profiles || x.profile || {};
  const pick = (...vals: any[]) => vals.find((v) => num(v) > 0);
  return audienceEstimate({
    followers: pick(x.instagram_followers, x.follower_count, x.followers_instagram, x.ig_followers, x.followers,
      p.instagram_followers, p.follower_count, p.followers_instagram),
    avgLikes: pick(x.avg_likes_30d, x.instagram_avg_likes, x.avg_likes, p.avg_likes_30d, p.instagram_avg_likes),
    avgComments: pick(x.avg_comments_30d, x.instagram_avg_comments, x.avg_comments, p.avg_comments_30d, p.instagram_avg_comments),
    avgReach: pick(x.instagram_avg_reach, x.average_reach, x.avg_reach, p.instagram_avg_reach, p.average_reach),
  });
}
