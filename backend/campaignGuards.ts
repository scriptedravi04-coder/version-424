import { hasRefund } from "./refundFlags";
import { logIgnored } from "./logIgnored";
// Campaign lifecycle guards.
//
// Why this file exists
// --------------------
// Every campaign lifecycle endpoint used to check exactly one thing: that *somebody* was
// logged in. None of them asked "is this person the brand on this deal?" or "is the deal at
// the step this action belongs to?". So a creator could call approve-live-links on their own
// thread and release their own escrow; a stranger could do it to someone else's deal; a
// payout could be released for a deal that had no live post and no approved draft; and a
// completed deal could be dragged back to ACTIVE by a stale button.
//
// These helpers answer those two questions in one place so each handler does not grow its
// own slightly different copy. CAMPAIGN ONLY — the UGC flow has its own checks in
// ugc_routes.ts / ugcLifecycleService.ts and is deliberately not routed through here.

export const upper = (v: any) => (typeof v === "string" ? v.toUpperCase() : "");

/** The deal is over. Nothing may move it again. */
export const CLOSED_STATES = ["COMPLETED", "CLOSED", "CANCELLED", "PAID", "RELEASED", "REFUNDED"]; // v414: a refunded deal is closed too

/** Before the contract is executed and funded: no content work is allowed yet. */
export const PRE_WORK_STATES = [
  "NEGOTIATING", "NEGOTIATING_COUNTER", "AI_AGREEMENT_READY", "AGREEMENT_SIGNED",
  "AWAITING_SIGNATURE", "AGREEMENT_PENDING", "CONTRACT_READY", "APPROVED"
];

/** A draft is sitting with the brand, waiting for a decision. */
export const DRAFT_UNDER_REVIEW_STATES = ["SUBMITTED", "CONTENT_SUBMITTED", "UNDER_REVIEW", "IN_REVIEW", "REVISION_DECLINED"];

/** The brand asked for changes to the draft; the creator owes a new one (or a decline). */
export const DRAFT_REVISION_STATES = ["CHANGES_REQUESTED", "REVISION_REQUESTED", "REVISION_REQ", "NEEDS_REVISION"];

/** Draft approved; the creator now owes (or is correcting) the live post. */
export const LIVE_LINK_DUE_STATES = ["CONTENT_APPROVED", "COMPLETED_APPROVAL", "REVISION_REQUESTED_LINKS", "REVISION_DECLINED_LINKS", "LIVE_LINK_REVISION_REQ", "LIVE_LINK_REVISION"];

/** A live link is with the brand. */
export const LIVE_LINK_UNDER_REVIEW_STATES = ["PROOF_SUBMITTED", "LINKS_UNDER_REVIEW", "LIVE_LINKS_SUBMITTED"];

/** Stages at which a payout for live links may be released (evidence is still required). */
export const LIVE_LINK_APPROVABLE_STATES = [...LIVE_LINK_UNDER_REVIEW_STATES, "REVISION_REQUESTED_LINKS", "REVISION_DECLINED_LINKS", "LIVE_LINK_REVISION_REQ", "LIVE_LINK_REVISION"];

export function flowOf(thread: any, deal?: any): string {
  return upper(thread?.flow_state) || upper(deal?.flow_state) || "";
}

export function isClosed(thread: any, deal?: any): boolean {
  return (
    CLOSED_STATES.includes(upper(thread?.status)) ||
    CLOSED_STATES.includes(upper(thread?.flow_state)) ||
    CLOSED_STATES.includes(upper(deal?.status))
  );
}

export type PartyRole = "brand" | "creator" | "admin" | null;

/**
 * Which side of this deal is the caller on? Uses the thread first and the deal as a fallback,
 * and understands team members acting for a brand (`parent_brand_id`).
 */
export function partyRole(user: any, thread: any, deal?: any): PartyRole {
  if (!user) return null;
  if (upper(user.role) === "ADMIN") return "admin";
  const uid = user.user_id || user.id;
  const actingBrand = user.parent_brand_id || uid;
  const brandId = thread?.brand_id || deal?.brand_id || deal?.brand_user_id;
  const creatorId = thread?.creator_id || deal?.creator_id;
  if (brandId && (uid === brandId || actingBrand === brandId)) return "brand";
  if (creatorId && uid === creatorId) return "creator";
  return null;
}

// v417: one plain message when no revisions are left — cancel is blocked at this stage, so it points to Support.
export const REVISION_LIMIT_MESSAGE = "Revision limit reached. Need more changes? Contact Ybex Support from the deal menu.";

export function forbid(res: any, needed: "brand" | "creator", code = "NOT_A_PARTY") {
  return res.status(403).json({
    error: needed === "brand"
      ? "Only the brand on this deal can do this."
      : "Only the creator on this deal can do this.",
    code,
    _status: 403
  });
}

export function conflict(res: any, code: string, error: string, extra: Record<string, any> = {}) {
  return res.status(409).json({ error, detail: error, code, _status: 409, ...extra });
}

/**
 * Revision allowance. `revision_count` of 0 is a real value ("no revisions") and must not be
 * read as "unset" — `x || 5` turned a zero allowance into five.
 */
export function revisionAllowance(...candidates: any[]): number {
  for (const c of candidates) {
    if (c === null || c === undefined || c === "") continue;
    const n = Number(c);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 5;
}

/** The agreed amount, or 0 if nobody knows it. Never invents a figure. */
export function knownAmount(...candidates: any[]): number {
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

const msgMatches = (m: any, types: string[], actions: string[]) => {
  const t = String(m?.message_type || m?.type || "").toLowerCase();
  const a = String(m?.metadata?.action || "").toLowerCase();
  return types.includes(t) || actions.includes(a);
};

/**
 * Does the thread carry a message of one of these types? Local store first, then Supabase.
 * Used as evidence for legacy rows whose flow_state was never written correctly.
 */
export async function threadHasMessage(
  opts: { client: any; db: any; threadId: string },
  types: string[],
  actions: string[] = []
): Promise<boolean> {
  const { client, db, threadId } = opts;
  if ((db?.chat_messages || []).some((m: any) => m.thread_id === threadId && msgMatches(m, types, actions))) {
    return true;
  }
  if (!client || !threadId) return false;
  try {
    const { data } = await client
      .from("chat_messages")
      .select("message_type, metadata")
      .eq("thread_id", threadId)
      .in("message_type", types)
      .limit(1);
    if (Array.isArray(data) && data.length > 0) return true;
  } catch (e) {
    /* fall through to "no evidence" — a failed lookup must never unlock money */
  }
  return false;
}

/** Is there a live post on record for this campaign deal? */
export async function hasCampaignLiveLinkEvidence(opts: { client: any; db: any; threadId: string; dealId: string | null; thread?: any; deal?: any }): Promise<boolean> {
  const { client, db, threadId, dealId, thread, deal } = opts;
  if (thread?.live_link || deal?.live_link || deal?.instagram_post_url) return true;
  if (dealId && (db?.content_submissions || []).some((s: any) => s.deal_id === dealId && s.submission_type === "live_link")) return true;
  if (await threadHasMessage({ client, db, threadId }, ["live_links_submitted"], ["live_link_submitted"])) return true;
  if (client && dealId) {
    try {
      const { data } = await client
        .from("content_submissions")
        .select("id")
        .eq("deal_id", dealId)
        .eq("submission_type", "live_link")
        .limit(1);
      if (Array.isArray(data) && data.length > 0) return true;
    } catch (e) { logIgnored("campaignGuards:157", e); }
  }
  return false;
}

/** Is there a draft on record for this campaign deal? */
export async function hasCampaignDraftEvidence(opts: { client: any; db: any; threadId: string; dealId: string | null }): Promise<boolean> {
  const { client, db, threadId, dealId } = opts;
  if (dealId && (db?.content_submissions || []).some((s: any) => s.deal_id === dealId && s.submission_type !== "live_link")) return true;
  if (await threadHasMessage({ client, db, threadId }, ["content_proof_submitted"], ["deliverable_submitted"])) return true;
  if (client && dealId) {
    try {
      const { data } = await client
        .from("content_submissions")
        .select("id, submission_type")
        .eq("deal_id", dealId)
        .limit(5);
      if (Array.isArray(data) && data.some((s: any) => s.submission_type !== "live_link")) return true;
    } catch (e) { logIgnored("campaignGuards:175", e); }
  }
  return false;
}

/**
 * Is the escrow for this campaign deal actually funded? A deal flag, or a transaction row
 * that is a deposit (not a refund).
 */
export function isEscrowDepositRow(tx: any): boolean {
  if (!tx) return false;
  // Session 58: refund_status 'NONE' is the DB default, not a refund.
  // v389 (QA, Ravi OK 30 Oct): a deposit row that only had a PART of the deal refunded (₹2,000 of ₹20,000, or just the service fee) is STILL
  // the deposit. It used to count as "a refund row", so on approval no deposit row was found and a SECOND full payout row was inserted
  // (creator paid ₹20,000 although the brand got ₹2,000 back).
  if (hasRefund(tx)) return isPartRefundedDeposit(tx);
  return ["SUCCESS", "COMPLETED", "HELD"].includes(upper(tx.status)) || tx.escrow_hold === true;
}

/** v389: a funded deposit row with a refund on it that is SMALLER than what the brand paid. Needs the paid amount on the row — a row with a
 *  refund and no paid amount is still read as a refund row (old rule). Pure. */
export function isPartRefundedDeposit(tx: any): boolean {
  if (!tx || !hasRefund(tx)) return false;
  const paid = Number(tx.brand_paid_amount) || Number(tx.gross_amount) || 0;
  const refunded = Number(tx.refund_amount) || 0;
  if (!(paid > 0) || !(refunded > 0) || refunded >= paid - 0.5) return false;
  if (upper(tx.status) === "REFUNDED") return false;
  return ["SUCCESS", "COMPLETED", "HELD"].includes(upper(tx.status)) || tx.escrow_hold === true;
}

/**
 * Resolve the chat thread and its campaign deal from any id the routes accept (thread id,
 * `thread_camp_<uuid>`, or the bare deal uuid).
 */
export async function loadCampaignThreadAndDeal(opts: { client: any; db: any; rawId: string; getCampaignDealId: (t: any) => string | null }) {
  const { client, db, rawId, getCampaignDealId } = opts;
  let thread: any = (db?.chat_threads || []).find((t: any) => t.id === rawId || t.deal_id === rawId) || null;
  if (!thread && client && rawId) {
    try {
      const { data } = await client.from("chat_threads").select("*").eq("id", rawId).maybeSingle();
      if (data) thread = data;
    } catch (e) { logIgnored("campaignGuards:201", e); }
    if (!thread) {
      try {
        const { data } = await client.from("chat_threads").select("*").eq("deal_id", rawId).limit(1);
        if (Array.isArray(data) && data[0]) thread = data[0];
      } catch (e) { logIgnored("campaignGuards:206", e); }
    }
  }
  const dealId = getCampaignDealId(thread || { id: rawId });
  let deal: any = dealId ? (db?.deals || []).find((d: any) => d.id === dealId) || null : null;
  if (!deal && client && dealId) {
    try {
      const { data } = await client.from("deals").select("*").eq("id", dealId).maybeSingle();
      if (data) deal = data;
    } catch (e) { logIgnored("campaignGuards:215", e); }
  }
  return { thread, deal, dealId };
}

// v418: states that only exist after the brand paid into escrow.
const FUNDED_STATES = new Set(["ESCROW_FUNDED", "ESCROW_HELD", "ESCROW_PAID", "FUNDED", "PAYMENT_HELD", "PAYMENT_SECURED", "HELD",
  "CONTENT_SUBMITTED", "SUBMITTED", "IN_REVIEW", "REVISION_REQUESTED", "REVISION_REQ", "CHANGES_REQUESTED", "REVISION_DECLINED",
  "CONTENT_APPROVED", "AWAITING_LIVE_LINK", "PROOF_SUBMITTED", "LIVE_LINK_SUBMITTED", "LIVE_LINKS_SUBMITTED", "LINKS_UNDER_REVIEW",
  "REVISION_REQUESTED_LINKS", "REVISION_DECLINED_LINKS"]);
/** Is the escrow for this campaign deal funded? Deal flag, thread flag, or a deposit row. */
export async function isCampaignEscrowFunded(opts: { client: any; db: any; dealId: string | null; thread?: any; deal?: any }): Promise<boolean> {
  const { client, db, dealId, thread, deal } = opts;
  // v414: escrow_hold_at alone no longer counts once escrow_hold was switched off (a full refund leaves the date behind).
  if (deal?.escrow_hold === true || (deal?.escrow_hold_at && deal?.escrow_hold !== false)) return true;
  if (thread?.payment_funded === true || thread?.escrow_funded === true) return true;
  if (!dealId) return false;
  if ((db?.transactions || []).some((t: any) => (t.deal_id === dealId || t.campaign_deal_id === dealId) && isEscrowDepositRow(t))) return true;
  if (!client) return false;
  try {
    const { data } = await client
      .from("transactions")
      .select("id, status, refund_amount, refund_status, refunded_at, escrow_hold, gross_amount, brand_paid_amount, fee_correction_note") // v414: paid amount + refund split, or a part-refunded deposit never counted
      .or(`deal_id.eq.${dealId},campaign_deal_id.eq.${dealId}`);
    if (Array.isArray(data) && data.some(isEscrowDepositRow)) return true;
  } catch (e) { logIgnored("campaignGuards:233", e); }
  return false;
}

/** v414: was this deal's deposit fully refunded (or a full refund is pending)? True only when a refunded row exists and no live
 *  deposit row is left. Pure — rows come from the transactions table. */
export function isDepositRefunded(rows: any[]): boolean {
  const list = Array.isArray(rows) ? rows : [];
  const refunded = list.some((t: any) => ["REFUNDED", "REFUND_PENDING"].includes(upper(t?.status)));
  return refunded && !list.some(isEscrowDepositRow);
}

// v414: live-post proof must be a post on a known platform. Pure.
const LIVE_POST_PATTERNS: RegExp[] = [
  /^(www\.|m\.)?instagram\.com\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+/i,
  /^(www\.|m\.)?instagram\.com\/[A-Za-z0-9_.]+\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+/i,
  /^(www\.|m\.)?youtube\.com\/(shorts\/[A-Za-z0-9_-]+|watch\?(.*&)?v=[A-Za-z0-9_-]+|live\/[A-Za-z0-9_-]+)/i,
  /^youtu\.be\/[A-Za-z0-9_-]+/i,
  /^(www\.|m\.|web\.)?facebook\.com\/(reel|reels)\/[A-Za-z0-9_-]+/i,
  /^(www\.|m\.|web\.)?facebook\.com\/share\/((r|v|p)\/)?[A-Za-z0-9_-]+/i, // v414: plain /share/<id>/ links too
  /^(www\.|m\.)?instagram\.com\/stories\/[A-Za-z0-9_.]+\/\d+/i, // v414: story links
  /^(www\.|m\.)?instagram\.com\/share\/((reel|p|v|tv)\/)?[A-Za-z0-9_-]+/i, // v414: app "share" links
  /^(www\.)?threads\.(net|com)\/@[A-Za-z0-9_.]+\/post\/[A-Za-z0-9_-]+/i, // v414: Threads posts
  /^(www\.|m\.|web\.)?facebook\.com\/[A-Za-z0-9_.]+\/(posts|videos)\/[A-Za-z0-9_.-]+/i,
  /^(www\.|m\.)?facebook\.com\/watch\/?\?v=\d+/i,
  /^fb\.watch\/[A-Za-z0-9_-]+/i,
  /^(www\.|mobile\.)?(x|twitter)\.com\/[A-Za-z0-9_]+\/status\/\d+/i,
  /^(www\.)?linkedin\.com\/(posts\/[A-Za-z0-9_%-]+|feed\/update\/urn:li:[a-z]+:\d+)/i,
];
export function isKnownLivePostUrl(url: string): boolean {
  try {
    const u = new URL(String(url || '').trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const rest = `${u.hostname}${u.pathname}${u.search}`;
    return LIVE_POST_PATTERNS.some((re) => re.test(rest));
  } catch { return false; }
}
/** v414: one key per post (no query, no trailing slash, lower-case host) so the same post pasted twice matches. Pure. */
export function livePostKey(url: string): string {
  try {
    const u = new URL(String(url || '').trim().startsWith('http') ? String(url).trim() : `https://${String(url || '').trim()}`);
    const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.|web\.)/, '');
    const path = u.pathname.replace(/\/+$/, '');
    // v414: same YouTube video / Instagram post in any URL shape → one key ("yt:<id>" / "ig:<id>").
    if (host === 'youtu.be') { const id = path.split('/')[1]; if (id) return `yt:${id}`; }
    if (host === 'youtube.com') {
      const v = u.searchParams.get('v');
      if (path === '/watch' && v) return `yt:${v}`;
      const m = path.match(/^\/(shorts|live)\/([A-Za-z0-9_-]+)/);
      if (m) return `yt:${m[2]}`;
    }
    if (host === 'instagram.com') {
      const m = path.match(/^\/(?:[A-Za-z0-9_.]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
      if (m) return `ig:${m[1]}`;
    }
    const fbv = host === 'facebook.com' && path === '/watch' ? u.searchParams.get('v') : null; // v414: facebook.com/watch?v=<id> keeps its id
    return `${host}${path}${fbv ? `?v=${fbv}` : ''}`; // v414: no query string
  } catch { return String(url || '').trim().toLowerCase(); }
}

/**
 * v418 (cancel test): for CANCELLING only — "might the brand have paid?". Stricter checks (payout release) keep using
 * isCampaignEscrowFunded. Here a thread whose flow says the money is in, or any held deposit row found by any of the
 * thread's deal ids, counts — so a paid deal is never cancelled outright (it becomes a support request instead).
 */
export async function isCampaignPossiblyFunded(opts: { client: any; db: any; dealId: string | null; thread?: any; deal?: any }): Promise<boolean> {
  const { db, dealId, thread, deal } = opts;
  if ([thread?.flow_state, thread?.status, thread?.payment_status, deal?.status, deal?.payment_status].some((v) => FUNDED_STATES.has(upper(v)))) return true;
  const ids = [dealId, thread?.deal_id, thread?.campaign_deal_id, deal?.id].filter(Boolean).map(String);
  if ((db?.transactions || []).some((t: any) => (ids.includes(String(t.deal_id)) || ids.includes(String(t.campaign_deal_id))) && isEscrowDepositRow(t))) return true;
  return isCampaignEscrowFunded(opts);
}
