// v367 (Ravi: "Diwali Creator Challenge banana hai"). One place for the challenge's dates, rules and
// placeholder prizes. Used by the browser AND the server (backend/challenge_routes.ts), so the rules match.
//
// How an entry works: the creator posts a reel about Ybex on Instagram (@ybex.in + #YbexDiwaliChallenge), then adds
// that reel to their Ybex Portfolio and tags the brand "Ybex" (or the caption has the hashtag / mention). The
// "Submit to Diwali Challenge" toggle (default ON) asks the server for a signed stamp; the stamp is saved inside the
// portfolio item JSON (creator_profiles.portfolio) — no new table or column. Winners are marked the same way.
//
// To change prizes / sponsors before announcing: edit PRIZES / SPONSORS below (placeholders until brands confirm).

export const CHALLENGE_ID = "diwali2026";
export const CHALLENGE_NAME = "Diwali Creator Challenge";
export const HASHTAG = "#YbexDiwaliChallenge";
export const MENTION = "@ybex.in";
// v377 (Ravi, "Diwali Challenge v2: Easy Entry"): ANY reel of the creator's own works — it doesn't have to be about
// Ybex. The caption must tag @ybex.in and carry BOTH #Ybex and #YbexDiwaliChallenge.
export const TAG_YBEX = "#Ybex";
export const TAGS_LINE = `${MENTION} + #Ybex #YbexDiwaliChallenge`;
/** v377: the first 300 creators with a valid entry get ₹50 by UPI on their WhatsApp number. */
export const RECHARGE_SLOTS = 300;
export const RECHARGE_AMOUNT = "₹300"; // v378 (Ravi, 28 Oct): ₹300 cash for the first 300 (was ₹50)
export const RECHARGE_DAYS = 7;
export const BRAND = "Ybex";
export const MAX_ENTRIES = 3;
export const PAGE_PATH = "/challenge";
/** v378: what Eva says about the current offer (and the profile reminders). One place to change the rule. */
export const OFFER_NEEDS_REEL = true; // true = Diwali reel entry approved + complete profile; false = complete profile only
// v378 (Ravi, 28 Oct): what creators hear first = "complete your profile → ₹300 cash". The reel step is told once their
// profile is complete (popup) or when they ask about the terms — never hidden if asked.
export const OFFER_FOR_EVA = `Current offer: complete your Ybex profile (photo, niche & bio, Instagram, rate card, past work, payout details in KYC) and get ${RECHARGE_AMOUNT} cash by UPI — first ${RECHARGE_SLOTS} creators. Lead with this. Only when the creator says their profile is complete, or asks about the terms/conditions, tell them the last step: follow @ybex.in on Instagram, post any reel of their own with @ybex.in + #Ybex #YbexDiwaliChallenge in the caption and add it to their Ybex Portfolio with the Diwali toggle on; after the reel is approved the Ybex finance team pays to their KYC payout details within 1–2 days. Full terms are on the offer page ${PAGE_PATH}. Never deny the reel step if asked. Top creators can also win up to ₹1,00,000.`;

// IST = UTC+5:30
// v369 (Ravi: "kitne din baad band karna hai, admin se karenge"): close + results dates are set in
// Admin → Challenge entries → Sponsors & prizes → Dates. These are only the defaults used until the admin saves.
export const STARTS_AT = Date.parse("2026-10-21T18:30:00Z"); // 22 Oct 2026, 00:00 IST (open for testing after deploy; announce 23 Oct)
export const ENTRIES_CLOSE_AT = Date.parse("2026-11-15T18:29:59Z"); // default: 15 Nov 2026, 23:59:59 IST
export const RESULTS_AT = Date.parse("2026-11-17T18:30:00Z"); // default: 18 Nov 2026, 00:00 IST (winners show once marked)
export const FESTIVE_UNTIL = Date.parse("2026-11-08T18:29:59Z"); // 8 Nov 2026 (Diwali), 23:59 IST — Diwali lights / greeting off after
/** The challenge stays visible (page, Home card) this long after results. */
export const SHOW_AFTER_RESULTS_MS = 7 * 86400_000;
/** The admin can't set a close date further than this from the start (typo guard). */
export const MAX_RUN_MS = 120 * 86400_000;

export type Dates = { startsAt: number; closesAt: number; resultsAt: number };
export const DEFAULT_DATES: Dates = { startsAt: STARTS_AT, closesAt: ENTRIES_CLOSE_AT, resultsAt: RESULTS_AT };

/** Admin-saved dates (config.closes_at / results_at, ISO or ms) → checked dates; defaults when missing / wrong. Pure. */
export function datesFrom(config: any): Dates {
  const ms = (v: any) => (typeof v === "number" ? v : Date.parse(String(v || "")));
  let closesAt = ms(config?.closes_at ?? config?.closesAt);
  let resultsAt = ms(config?.results_at ?? config?.resultsAt);
  if (!Number.isFinite(closesAt) || closesAt <= STARTS_AT || closesAt > STARTS_AT + MAX_RUN_MS) closesAt = ENTRIES_CLOSE_AT;
  if (!Number.isFinite(resultsAt) || resultsAt < closesAt || resultsAt > closesAt + 60 * 86400_000) resultsAt = Math.max(RESULTS_AT, closesAt + 1000);
  return { startsAt: STARTS_AT, closesAt, resultsAt };
}

/** "15 Nov" / "15 Nov, 11:59 PM" in India time. Pure. */
export function dayText(ms: number): string {
  try { return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }); } catch { return ""; }
}
export function dayTimeText(ms: number): string {
  try { return `${dayText(ms)}, ${new Date(ms).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).toUpperCase()}`; } catch { return dayText(ms); }
}

// v371 (Ravi: "₹1,00,000 fixed, breakdown — top 10, 20, 50"): ranks the admin can mark.
export const RANKS = ["1st", "2nd", "3rd", "top10", "top20", "top50"] as const;
export type Rank = (typeof RANKS)[number];
export const RANK_LABEL: Record<string, string> = {
  "1st": "1st prize", "2nd": "2nd prize", "3rd": "3rd prize", top10: "Ranks 4–10", top20: "Ranks 11–20", top50: "Ranks 21–50",
};

/** Headline + "everyone wins" line — editable in Admin → Sponsors & prizes. */
export const PRIZE_POOL = "₹1,00,000 prize pool";
export const WINNERS_LINE = "50 winners";
export const EVERYONE_WINS = "Every valid entry is featured on Ybex and gets priority access to Ybex brand campaigns. The first 300 creators also get ₹300 on UPI.";

/** Default ₹1,00,000 split (50 winners). Admin → Sponsors & prizes can change it. */
export const PRIZES = [
  { rank: "1st", title: "1st prize", value: "₹20,000", note: "Paid to your bank" },
  { rank: "2nd", title: "2nd prize", value: "₹12,000", note: "" },
  { rank: "3rd", title: "3rd prize", value: "₹8,000", note: "" },
  { rank: "top10", title: "Ranks 4–10", value: "₹3,000 each", note: "7 winners" },
  { rank: "top20", title: "Ranks 11–20", value: "₹1,500 each", note: "10 winners" },
  { rank: "top50", title: "Ranks 21–50", value: "₹800 each", note: "30 winners" },
];
/** Sponsor names shown as "Powered by". Empty = the line is hidden. e.g. [{ name: "Wefrnd" }] */
export const SPONSORS: { name: string; logo?: string; scripts?: string[] }[] = []; // v368: Admin → Challenge entries → Sponsors & prizes overrides this

/** Counts ("1,284 creators joined") show only from this many — small numbers put people off. */
export const SOCIAL_PROOF_MIN = 50;

export type Phase = "soon" | "open" | "judging" | "results" | "over";

/** Where the challenge is at a moment (ms), for the given dates. Pure. */
export function phaseAt(now: number, d: Dates = DEFAULT_DATES): Phase {
  if (now < d.startsAt) return "soon";
  if (now <= d.closesAt) return "open";
  if (now < d.resultsAt) return "judging";
  if (now <= d.resultsAt + SHOW_AFTER_RESULTS_MS) return "results";
  return "over";
}
export const entriesOpen = (now: number, d: Dates = DEFAULT_DATES) => phaseAt(now, d) === "open";
/** Diwali lights + "Happy Diwali" on the Home header (fixed: Diwali is Diwali). Pure. */
export const festiveOn = (now: number) => now >= STARTS_AT && now <= FESTIVE_UNTIL;
/** The challenge card / page shows from the start till a week after results. Pure. */
export const challengeOn = (now: number, d: Dates = DEFAULT_DATES) => now >= d.startsAt && now <= d.resultsAt + SHOW_AFTER_RESULTS_MS;

/** Only a public Instagram reel or post link counts: instagram.com/reel/… or /p/… (also /reels/). Pure. */
export function isEntryLink(url: any): boolean {
  return /^https?:\/\/(www\.)?instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(reel|reels|p)\/[A-Za-z0-9_-]{5,}/i.test(String(url || "").trim());
}

/** Shortcode of an Instagram link (same reel pasted twice = one entry). Pure. */
export function entryKey(url: any): string {
  const m = /instagram\.com\/(?:[^/?#]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{5,})/i.exec(String(url || ""));
  return m ? m[1] : String(url || "").trim().toLowerCase();
}

/** Brand typed as Ybex (Ybex, @ybex.in, ybexmedia …) or a caption with the hashtag / mention. Pure. */
export function brandIsYbex(brand: any): boolean {
  const b = String(brand || "").trim().toLowerCase().replace(/^@+/, "").replace(/\s+/g, "");
  return b === "ybex" || b === "ybex.in" || b === "ybexmedia" || b === "ybexapp" || b === "ybex.app";
}
export function captionHasTag(caption: any): boolean {
  const c = String(caption || "").toLowerCase();
  return c.includes(HASHTAG.toLowerCase()) || /(^|[^a-z0-9_.])@ybex\.in\b/.test(c);
}
/** v377: what the caption has — @ybex.in, #Ybex (the exact tag, not only inside #YbexDiwaliChallenge) and
 *  #YbexDiwaliChallenge. `ok` = all three (what Admin approves on). Pure. */
export function captionChecks(caption: any): { mention: boolean; ybex: boolean; challenge: boolean; ok: boolean } {
  const c = String(caption || "").toLowerCase();
  const mention = /(^|[^a-z0-9_.])@ybex\.in\b/.test(c);
  const ybex = /(^|[^a-z0-9_])#ybex(?![a-z0-9_])/.test(c);
  const challenge = /(^|[^a-z0-9_])#ybexdiwalichallenge(?![a-z0-9_])/.test(c);
  return { mention, ybex, challenge, ok: mention && ybex && challenge };
}
/** v377: any reel of the creator's own can be entered (the toggle shows for every reel while entries are open).
 *  The old rule (brand "Ybex", the hashtag in the caption or a sponsor brand) no longer limits it. Pure. */
export function qualifies(_brand?: any, _captions: any[] = [], _sponsorNames: any[] = []): boolean {
  return true;
}

/** Saved prizes (admin) → the page's prize cards; defaults when none saved. Pure. */
export function prizesFrom(config: any) {
  const p = Array.isArray(config?.prizes) ? config.prizes.filter((x: any) => x && x.title && x.value) : [];
  return p.length ? p.map((x: any, i: number) => ({ rank: `p${i}`, title: x.title, value: x.value, note: x.note || "" })) : PRIZES;
}
/** Saved sponsors (admin) or the defaults. Pure. */
export function sponsorsFrom(config: any): { name: string; logo?: string; scripts?: string[] }[] {
  return Array.isArray(config?.sponsors) ? config.sponsors.filter((x: any) => x && x.name) : SPONSORS;
}

/** v376: reel scripts saved without a brand name / logo (Admin → Sponsors & prizes). Pure. */
export function scriptsFrom(config: any): string[] {
  return Array.isArray(config?.scripts) ? config.scripts.map((t: any) => String(t || "").trim()).filter(Boolean) : [];
}

/** ms left → { d, h, m, s } (never negative). Pure. */
export function countdown(msLeft: number) {
  const t = Math.max(0, Math.floor(msLeft / 1000));
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}

/** "5 days left" / "Last day" / "" when closed. Pure. */
export function daysLeftText(now: number, dates: Dates = DEFAULT_DATES): string {
  if (!entriesOpen(now, dates)) return "";
  const { d, h } = countdown(dates.closesAt - now);
  if (d >= 1) return `${d} day${d === 1 ? "" : "s"} left`;
  return h >= 1 ? `${h}h left · last day` : "Closing soon";
}

/** The message the signed stamp covers. Pure (the server adds the secret). */
export const stampMessage = (userId: any, itemId: any, at: any) => `${CHALLENGE_ID}:entry:${userId}:${itemId}:${at}`;
export const rankMessage = (userId: any, itemId: any, rank: any) => `${CHALLENGE_ID}:rank:${userId}:${itemId}:${rank}`;

/** A portfolio item that carries a challenge stamp (signature checked only on the server). Pure. */
export const isStamped = (it: any) => Boolean(it && it.challenge === CHALLENGE_ID && it.challenge_at && it.challenge_sig);

/** Share text for "Tell your friends". Pure. */
export function shareText(origin = "https://ybexapp.ai.studio") {
  return `I just entered the Ybex ${CHALLENGE_NAME}. Post any reel, follow + tag ${MENTION}, use #Ybex ${HASHTAG}, add it on Ybex and you can win up to ₹1 lakh. The first 300 get ₹300 on UPI: ${origin}/offer`;
}

/** v371: example reels the admin uploaded (shown on /offer). Pure. */
export function reelsFrom(config: any): { url: string; poster?: string; caption?: string }[] {
  return Array.isArray(config?.reels) ? config.reels.filter((x: any) => x && /^https:\/\//.test(String(x.url || ""))).slice(0, 3) : [];
}

/** v371: headline texts from Admin, else the defaults. Pure. */
export function headlineFrom(config: any) {
  const t = (v: any) => String(v || "").trim();
  return { pool: t(config?.pool) || PRIZE_POOL, winners: t(config?.winners) || WINNERS_LINE, everyone: t(config?.everyone) || EVERYONE_WINS };
}
