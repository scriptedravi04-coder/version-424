// Direct brand invitations (session 26) — shared rules for backend/creators_routes.ts.
//
// A direct invite is a normal CAMPAIGN deal with a different start: the brand invites, the
// creator accepts, and a new `deals` row + `thread_camp_<dealId>` chat opens. See ARCHITECTURE.md
// rule 54.

import { isClosed } from "./campaignGuards";
import { ephemeralGet, ephemeralSet } from "./ephemeralStore";
import bcrypt from "bcryptjs"; // v419: in-house pay PIN

/** Invite statuses (brief_requests.status). */
export const INVITE_PENDING = "pending_creator_acceptance";
/** Short-lived, in memory only: set while an accept is writing the deal, so a double tap can't open two. */
export const INVITE_ACCEPTING = "accepting";
export const INVITE_ACCEPTED = "accepted";
export const INVITE_DECLINED = "creator_declined";

/** Same floor as a counter offer in chat (ChatBox / useChatThreadMobile). */
// v420 (Ravi, 10 Nov): SPECIAL OFFER — every paid deal (campaign payout, direct invite, send-brief, offer / counter in
// chat, UGC brief) starts at ₹2,000 for now. The usual floor is ₹3,000: to end the offer set SPECIAL_MIN_OFFER = REGULAR_MIN_OFFER.
export const REGULAR_MIN_OFFER = 3000;
export const SPECIAL_MIN_OFFER = 2000;
export const MIN_OFFER = SPECIAL_MIN_OFFER;
/** " (special offer — usually ₹3,000)" while the offer runs, for a floor message at that amount; "" otherwise. Pure. */
export const specialOfferNote = (min: number): string => (Number(min) === SPECIAL_MIN_OFFER && SPECIAL_MIN_OFFER < REGULAR_MIN_OFFER ? ` (special offer — usually ₹${REGULAR_MIN_OFFER.toLocaleString("en-IN")})` : "");
export const MIN_INVITE_AMOUNT = MIN_OFFER;

// v416 (C14): a paid campaign can't be published with a payout below the invite floor (the wizard
// accepted ₹1 per creator, then every invite / offer needed ₹3,000). Drafts and barter are exempt.
export const MIN_CAMPAIGN_PAYOUT = MIN_INVITE_AMOUNT;
export function campaignPayoutProblem(payoutPerCreator: unknown, collabMode: unknown, isDraft: boolean, min: number = MIN_CAMPAIGN_PAYOUT): string | null {
  if (isDraft) return null;
  if (/barter/i.test(String(collabMode ?? ""))) return null;
  const n = Number(payoutPerCreator);
  if (Number.isFinite(n) && n >= min) return null;
  return `Please set a payout of at least ₹${min.toLocaleString("en-IN")} per creator${specialOfferNote(min)}.`;
}

// ═══ v419 (Ravi): Ybex in-house brands ═════════════════════════════════════════════════════════════════════════
// Brands Ybex runs itself. An admin marks them (Admin → user → "Ybex in-house brand"); for them:
//   • the ₹3,000 minimum (campaign payout, direct invite, offer / counter in chat) is ₹500 instead;
//   • "Pay" doesn't open Razorpay — the deal is recorded as funded by Ybex (order id order_inhouse_…, brand paid ₹0),
//     the creator sees it funded like any deal, and Ybex pays the creator from the admin payouts as usual.
// Kept server-side only (ybex_ephemeral, service role) — no schema change, and the list is never sent to creators.
export const INHOUSE_MIN_OFFER = 500;
const INHOUSE_KEY = "cfg:inhouse_brands";
const INHOUSE_TTL = 50 * 365 * 864e5;
let inhouseCache: { at: number; ids: Set<string>; meta: Record<string, any> } | null = null;
async function inhouseLoad(force = false) {
  if (!force && inhouseCache && Date.now() - inhouseCache.at < 30_000) return inhouseCache;
  let v: any = null;
  try { v = await ephemeralGet(INHOUSE_KEY); } catch { v = null; }
  const meta = v && typeof v === "object" && v.brands && typeof v.brands === "object" ? v.brands : {};
  inhouseCache = { at: Date.now(), ids: new Set(Object.keys(meta)), meta };
  return inhouseCache;
}
export async function isInhouseBrand(brandId: unknown): Promise<boolean> {
  const id = String(brandId || "").trim();
  if (!id) return false;
  return (await inhouseLoad()).ids.has(id);
}
export async function listInhouseBrands(): Promise<Array<{ id: string; name: string; by: string; at: string }>> {
  const c = await inhouseLoad(true);
  return Object.entries(c.meta).map(([id, m]: [string, any]) => ({ id, name: String(m?.name || ""), by: String(m?.by || ""), at: String(m?.at || "") }));
}
export async function setInhouseBrand(brandId: string, on: boolean, info: { name?: string; by?: string; pin?: string } = {}): Promise<boolean> {
  const c = await inhouseLoad(true);
  const brands = { ...c.meta };
  // v419 (Ravi: security layer): the pay PIN is kept only as a bcrypt hash; it is never sent back by any route.
  if (on) brands[brandId] = { name: String(info.name || "").slice(0, 80), by: String(info.by || ""), at: new Date().toISOString(), pin_hash: info.pin ? await bcrypt.hash(String(info.pin), 10) : (brands[brandId]?.pin_hash || "") };
  else delete brands[brandId];
  await ephemeralSet(INHOUSE_KEY, { brands }, INHOUSE_TTL);
  inhouseCache = { at: Date.now(), ids: new Set(Object.keys(brands)), meta: brands };
  return on;
}
/** The lowest per-creator payout / offer for this brand: ₹500 for a Ybex in-house brand, else ₹3,000. */
export async function minPayoutFor(brandId: unknown): Promise<number> {
  return (await isInhouseBrand(brandId)) ? INHOUSE_MIN_OFFER : MIN_INVITE_AMOUNT;
}
/** v419: a valid in-house pay PIN is 4-8 digits. */
export const inhousePinProblem = (pin: unknown) => (/^\d{4,8}$/.test(String(pin || "").trim()) ? "" : "The pay PIN must be 4 to 8 digits.");
/** v419 (security layer): the ₹0 "funded by Ybex" payment needs the PIN the admin set when marking the brand. */
const pinFails = new Map<string, number[]>();
export async function checkInhousePin(brandId: unknown, pin: unknown): Promise<"ok" | "missing" | "wrong" | "locked" | "not_set"> {
  const id = String(brandId || "").trim();
  const now = Date.now();
  const recent = (pinFails.get(id) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (recent.length >= 5) return "locked";
  const hash = String((await inhouseLoad(true)).meta[id]?.pin_hash || "");
  if (!hash) return "not_set";
  const p = String(pin || "").trim();
  if (!p) return "missing";
  let ok = false;
  try { ok = await bcrypt.compare(p, hash); } catch { ok = false; }
  if (!ok) { recent.push(now); pinFails.set(id, recent); return "wrong"; }
  pinFails.delete(id);
  return "ok";
}
export const isInhouseOrderId = (id: unknown) => String(id || "").startsWith("order_inhouse_");

/** A rupee amount from what the brand typed ("₹45,000", "45000"). 0 when there is no number. */
export function parseInviteBudget(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
  // v347 (Ravi approved): FIRST number only. Gluing every digit together turned "15000 + 18% GST" into
  // ₹15,00,018 and "10,000-15,000" into ₹1,00,00,15,000. Commas between digits are thousands separators.
  const m = String(raw ?? "").replace(/(\d),(?=\d)/g, "$1").match(/\d+(\.\d+)?/);
  const n = m ? Number(m[0]) : 0;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** The fee on an invite, from any of the fields older invites used. */
export function inviteAmount(invite: any): number {
  if (!invite) return 0;
  return parseInviteBudget(invite.amount) || parseInviteBudget(invite.proposed_budget) || parseInviteBudget(invite.budget_range);
}

/** "7" -> "7 days", "1" -> "1 day"; anything with words is kept as the brand wrote it. */
export function formatInviteTimeline(raw: unknown): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return `${n} ${n === 1 ? "day" : "days"}`;
  }
  return t;
}

/** WHO: only the invited creator (matched by id, or by email for an invite sent before they claimed the profile). */
export function isInvitedCreator(invite: any, user: any): boolean {
  if (!invite || !user) return false;
  if (String(user.role || "").toLowerCase() !== "creator") return false;
  if (invite.creator_id && (invite.creator_id === user.user_id || invite.creator_id === user.id)) return true;
  const inviteEmail = String(invite.creator_email || "").trim().toLowerCase();
  const userEmail = String(user.email || "").trim().toLowerCase();
  return Boolean(inviteEmail && userEmail && inviteEmail === userEmail);
}

/** Columns of public.brief_requests (Supabase report, session 26). Anything else stays local. */
export const INVITE_COLUMNS = [
  "id", "brand_id", "creator_id", "campaign_title", "budget_range", "deliverables", "timeline",
  "message", "status", "creator_name", "creator_handle", "creator_email", "creator_is_claimed",
  "thread_id", "created_at", "updated_at", "brand_name", "brand_logo", "creator_phone",
  "campaign_description", "proposed_budget", "deliverables_count", "pitch", "decline_reason",
  "admin_notes", "accepted_at", "declined_at", "amount", "deal_id", "accepted_by",
] as const;

/** The row to write: only real columns, never undefined. */
export function toInviteRow(invite: any): Record<string, any> {
  const row: Record<string, any> = {};
  for (const c of INVITE_COLUMNS) {
    if (invite && invite[c] !== undefined) row[c] = invite[c];
  }
  return row;
}

/** An accept that crashed half-way must not lock the invite forever. */
export const ACCEPTING_STALE_MS = 2 * 60 * 1000;
export function isStaleAccepting(invite: any, now = Date.now()): boolean {
  if (String(invite?.status || "") !== INVITE_ACCEPTING) return false;
  const t = new Date(invite?.updated_at || 0).getTime();
  return !t || now - t > ACCEPTING_STALE_MS;
}

// v347 (Ravi approved): "Invite to campaign" for a creator who is already in that campaign with this brand
// (a live application, or an open deal chat) used to create a second invite → a second deal + chat on accept.
const DEAD_APPLICATION = new Set(["REJECTED", "DECLINED", "WITHDRAWN", "CANCELLED", "CANCELED"]);
const DEAD_THREAD = new Set(["REJECTED", "DECLINED", "CANCELED"]);
const up = (v: unknown) => String(v ?? "").trim().toUpperCase();

/**
 * applications: this creator's campaign_applications rows for the campaign; threads: chat_threads for the
 * same campaign + creator + brand. Returns why a new invite would duplicate, or null when it is fine.
 */
export function campaignInviteConflict(applications: any[] = [], threads: any[] = []): { reason: "in_deal" | "applied"; thread_id: string | null } | null {
  const ths = (threads || []).filter(Boolean);
  const open = ths.find((t: any) => !isClosed(t) && !DEAD_THREAD.has(up(t.status)) && !DEAD_THREAD.has(up(t.flow_state)));
  if (open) return { reason: "in_deal", thread_id: String(open.id || "") || null };
  const live = (applications || []).find((a: any) => a && !DEAD_APPLICATION.has(up(a.status)));
  // An ACCEPTED application whose deal chat is already closed (completed / cancelled) is history, not a live link.
  if (live && !(up(live.status) === "ACCEPTED" && ths.length > 0)) return { reason: "applied", thread_id: null };
  return null;
}

// v414: invites expire 14 days after they were sent (by created_at). A pending invite past that is shown
// as "expired" and can't be accepted (410 INVITE_EXPIRED).
export const INVITE_EXPIRY_DAYS = 14;
export const INVITE_EXPIRED = "expired";
export function isInviteExpired(invite: any, now = Date.now()): boolean {
  const st = String(invite?.status || INVITE_PENDING);
  if (st !== INVITE_PENDING && !(st === INVITE_ACCEPTING && isStaleAccepting(invite, now))) return false;
  const t = new Date(invite?.created_at || 0).getTime();
  return Boolean(t) && now - t > INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
}

// v414: a brand can withdraw a pending invite. brief_requests.status is free text in the docs but no
// migration is in this repo to prove there is no CHECK, so the stored value reuses the existing
// "creator_declined" with this reason; the API shows it as "withdrawn".
export const INVITE_WITHDRAWN = "withdrawn";
export const WITHDRAWN_REASON = "Withdrawn by brand";
export function isInviteWithdrawn(invite: any): boolean {
  return String(invite?.status || "") === INVITE_DECLINED && String(invite?.decline_reason || "").startsWith(WITHDRAWN_REASON);
}

/** v414: the status the app should show for an invite (stale accepting → pending, withdrawn, expired). */
export function inviteViewStatus(invite: any, now = Date.now()): string {
  if (isInviteWithdrawn(invite)) return INVITE_WITHDRAWN;
  if (isInviteExpired(invite, now)) return INVITE_EXPIRED;
  if (isStaleAccepting(invite, now)) return INVITE_PENDING;
  return String(invite?.status || INVITE_PENDING);
}

const DEFAULT_INVITE_TITLE = "campaign collaboration";
const normTitle = (v: unknown) => String(v ?? "").trim().toLowerCase();
export const REINVITE_WINDOW_DAYS = 30;

/**
 * v414: an invite from this brand to this creator that a new one would duplicate (each accept opens a
 * deal + chat). `existing` = this brand's invites to this creator. A new invite is refused while one is
 * pending / being accepted for the same campaign (same title), or — when no campaign is named — any open one;
 * and while an invite for the same campaign was accepted in the last 30 days (`openThreadIds` = its chat is
 * still open, when known).
 */
export function duplicateInvite(existing: any[] = [], next: { campaign_title?: any; has_campaign?: boolean }, now = Date.now(), openThreadIds?: Set<string>): any | null {
  const title = normTitle(next?.campaign_title);
  const noCampaign = !next?.has_campaign && (!title || title === DEFAULT_INVITE_TITLE);
  for (const inv of existing || []) {
    if (!inv) continue;
    const st = inviteViewStatus(inv, now);
    const sameCampaign = normTitle(inv.campaign_title) === title;
    const age = now - new Date((st === INVITE_ACCEPTED ? inv.accepted_at : null) || inv.created_at || 0).getTime();
    if (st === INVITE_PENDING || st === INVITE_ACCEPTING) {
      if (sameCampaign || (noCampaign && age <= REINVITE_WINDOW_DAYS * 24 * 60 * 60 * 1000)) return inv;
      continue;
    }
    if (st === INVITE_ACCEPTED && sameCampaign && age <= REINVITE_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
      if (!openThreadIds || !inv.thread_id || openThreadIds.has(String(inv.thread_id))) return inv;
    }
  }
  return null;
}
