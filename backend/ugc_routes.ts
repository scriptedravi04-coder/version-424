import { minPayoutFor } from "./directInvites"; // v420: in-house brands keep the ₹500 UGC floor
import { hasRefund } from "./refundFlags";
import { isBrandLike } from "./roleGuards"; // v416 (CR4): agency / talent-manager accounts are brands too
import { isDepositRow } from "./ugcFeeRefunds"; // v416 (U7): the brief's deposit row (fee shown in the cancel quote)
import { logIgnored } from "./logIgnored";
import { isPaymentFundingSomething, isUnlinkedPaymentRow } from "./briefPayment";
import { getCreatorKycStatus } from "./creatorKyc";
import { normalizeDeliveryHours, isMissingColumnError, UGC_REVISION_LIMIT, isBriefFullyDelivered } from "./ugcTerms";
import express from "express";
import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import { isCampaignThread } from "./dealFlow";
import { resolveUgcStage } from "./ugcOrderStage";
import {
  partyRole, isUgcOrderClosed, isUgcOrderRefunded, hasUgcDeliverable, ugcForbid, ugcConflict, isAdmin,
  orderStatus, publicBrief, briefForOutsider, isBriefOwner, UGC_DRAFT_REVISION, UGC_LIVE_LINK_DUE, UGC_LINK_WITH_BRAND
} from "./ugcGuards";
import { getRazorpay, Resend, buildEmailHtml } from "./helpers";
import { resolveTestMode } from "./paymentTestMode";
import { createUgcSlots } from "./ugcSlots";
import { consumeSignToken, takeLastSignMeta, signOtpRequired } from "./signTokens";
import { recordAgreementSignature } from "./agreementRecord";
import { calculateFee as calculatePlatformFee } from "../src/utils/feeCalculator";
import { quoteBrandPayment, quoteFromNotes, brandStamp, confirmBrandCoupon, loadFeeConfig } from "./brandFee"; // v364 split fee; v366 atomic coupon
import { ephemeralGet } from "./ephemeralStore"; // v366: test-mode order quotes
import { attachFeeViews, registerUgcFeeRefundRoute } from "./ugcFeeRefunds"; // v366: fee view + manual fee refund
import { ADMIN_ROOM } from "./socketAccess";
import { parseRefundAccount, toPublicRefundAccount, toAdminRefundSnapshot } from "./ugcRefundAccounts";
import { runUgcDeadlineChecks, cancelUgcOrderByCreator, cancelUgcOrderByBrand } from "./services/ugcDeadlineService";
import { UGC_NO_RECLAIM_REASONS } from "./statusTokens";

/** v389: a first-draft value that is really a video: our storage path / media link, or a web link with a real host. Pure. */
// v416 (CR5): a team member acts for their brand. New briefs are saved under the brand; old briefs saved under the
// member's own id still count as theirs (so nothing they posted before disappears).
export const actingBrandIdOf = (u: any): string => String(u?.parent_brand_id || u?.user_id || "");
export const brandIdsOf = (u: any): string[] => Array.from(new Set([actingBrandIdOf(u), String(u?.user_id || "")].filter(Boolean)));
export const ownsBrandRow = (u: any, brandId: any): boolean => Boolean(brandId) && brandIdsOf(u).includes(String(brandId));
// v416 (CR25): an id that goes into an .or() filter must be a plain id (no "," "(" ")" that would add filters)
export const isPlainId = (v: any): boolean => typeof v === "string" && /^[A-Za-z0-9_:.\-]{1,200}$/.test(v);
export const safeOrId = (v: any): string => (isPlainId(String(v ?? "")) ? String(v) : "__invalid_id__");
// v416 (CR19): one real budget range per creator for UGC briefs (the client shows the same numbers)
export const UGC_MIN_BUDGET_PER_CREATOR = 2000; // v420 (Ravi): special offer ₹2,000 per video (usually ₹3,000) — same as MIN_OFFER in directInvites.ts
export const UGC_MAX_BUDGET_PER_CREATOR = 500000;
/** null = OK, else the message for the brand. Pure. */
export function ugcBudgetProblem(raw: any, min: number = UGC_MIN_BUDGET_PER_CREATOR): string | null { // v420: min = ₹500 for Ybex in-house brands
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "Enter a budget per creator.";
  if (n < min) return `The minimum budget is ₹${min.toLocaleString("en-IN")} per creator${min === 2000 ? " (special offer — usually ₹3,000)" : ""}.`;
  if (n > UGC_MAX_BUDGET_PER_CREATOR) return `The maximum budget is ₹${UGC_MAX_BUDGET_PER_CREATOR.toLocaleString("en-IN")} per creator.`;
  return null;
}
/** v416 (U6): "your account ending 1234" / "your UPI ID name@bank" — never "account ending bank". Pure. */
export function refundDestinationText(snap: any): string {
  const upi = String(snap?.upi_id || "").trim();
  const isUpi = String(snap?.method_type || "").toUpperCase() === "UPI" || (!snap?.bank_account_number && Boolean(upi));
  if (isUpi && upi) return `your UPI ID ${upi.includes("*") ? upi : `${upi.slice(0, 2)}***@${upi.split("@")[1] || ""}`}`;
  const last4 = String(snap?.account_last4 || "").trim();
  if (last4) return `your account ending ${last4}`;
  return "your saved refund account";
}

export function isAcceptableDraftRef(raw: string): boolean {
  const v = String(raw || "").trim();
  if (!v || /\s/.test(v)) return false;
  if (v.startsWith("/api/media?") || v.startsWith("api/media?")) return true;
  if (/^(https?:\/\/)?(ugc-videos|campaign-deliverables|campaign-videos|campaign-submissions|chat-attachments|chat-submissions|content-submissions|live-proofs|ugc-assets)\//i.test(v)) return true; // storage paths / old pseudo links
  try {
    const parsed = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false; // "mailto:a@b.co" is not a web link
    const parts = parsed.hostname.split(".");
    return parts.length >= 2 && (parts[parts.length - 1] || "").length >= 2;
  } catch { return false; }
}


// Supabase and the local JSON db can both hold the same UGC order. The old merge always
// preferred the Supabase copy and only fell back to the local one when Supabase had no row
// at all — so whenever a lifecycle write landed locally but not in Supabase, the stale
// Supabase row masked the fresh local one and the UI showed the pre-action state. Prefer
// whichever copy was written last, and merge the local fields on top of it so nothing an
// action recorded is lost.
export function getOrderTimestamp(record: any): number {
  if (!record) return 0;
  return Math.max(
    Date.parse(record.updated_at || '') || 0,
    Date.parse(record.delivered_at || '') || 0,
    Date.parse(record.escrow_released_at || '') || 0,
    Date.parse(record.cancelled_at || '') || 0,
    Date.parse(record.created_at || '') || 0
  );
}

// Distinguish Collaboration formats (requires creator to publish to their social profile & submit a live link)
// vs Normal UGC video formats (raw or edited video deliverable for the brand to download/use; creator does not post to own profile).
export function isCollaborationDeliverable(deliverableType?: string): boolean {
  if (!deliverableType) return true;
  const norm = String(deliverableType).toLowerCase().trim();
  if (
    norm.startsWith('ugc_video') ||
    norm.includes('raw') ||
    norm.includes('edited') ||
    norm.startsWith('video_') ||
    norm === 'ugc_video_raw' ||
    norm === 'ugc_video_edited' ||
    norm === 'ugc_raw_video'
  ) {
    return false;
  }
  if (
    norm.includes('collab') ||
    norm.includes('reel') ||
    norm === 'collaboration_reel' ||
    norm === 'instagram_reel'
  ) {
    return true;
  }
  return false;
}

export function mergeOrderRecords(remote: any, local: any) {
  if (!remote) return local;
  if (!local) return remote;
  const isCompleted = remote.status === 'COMPLETED' || local.status === 'COMPLETED' ||
    remote.payment_status === 'RELEASED' || local.payment_status === 'RELEASED' ||
    remote.payment_status === 'PAID' || local.payment_status === 'PAID';
  const remoteAt = getOrderTimestamp(remote);
  const localAt = getOrderTimestamp(local);
  const merged = localAt > remoteAt ? { ...remote, ...local } : { ...local, ...remote };

  // Preserve revision notes / feedback across merges if present on either copy
  const revisionNotes = remote.revision_notes || local.revision_notes || remote.revision_feedback || local.revision_feedback || null;
  if (revisionNotes && !merged.revision_notes) {
    merged.revision_notes = revisionNotes;
  }
  if (revisionNotes && !merged.revision_feedback) {
    merged.revision_feedback = revisionNotes;
  }

  // If remote has a deliverable submitted that is newer or matches latest delivered_at, ensure status is SUBMITTED
  if (remote.status === 'SUBMITTED' && remote.video_url && (Date.parse(remote.delivered_at || '') >= Date.parse(local.delivered_at || '') || !local.video_url)) {
    merged.status = 'SUBMITTED';
    merged.video_url = remote.video_url;
    merged.delivered_at = remote.delivered_at || merged.delivered_at;
  }

  if (isCompleted) {
    merged.status = 'COMPLETED';
    merged.payment_status = 'RELEASED';
  }
  return merged;
}


// UGC Lifecycle Handlers (Approve, Submit, Revision, Decline, Cancel)
export function createUgcLifecycleHandlers({
  supabase,
  privilegedSupabase,
  getDb,
  parseAuthUser,
  syncUgcLifecycleEvent,
  handleThreadApproveLiveLinks,
  handleThreadApproveContent,
  handleCampaignRevision,
  saveDb = () => {},
  releaseBriefSlot,
}: {
  supabase: any;
  privilegedSupabase: any;
  getDb: () => any;
  saveDb?: (db: any) => void;
  releaseBriefSlot?: (briefId: string, creatorId?: string) => Promise<any>;
  parseAuthUser: (req: any) => Promise<any>;
  syncUgcLifecycleEvent: (opts: any) => Promise<any>;
  handleThreadApproveLiveLinks: (req: any, res: any) => Promise<any>;
  handleThreadApproveContent: (req: any, res: any) => Promise<any>;
  handleCampaignRevision: (req: any, res: any) => Promise<any>;
}) {
  // Creator self-cancel relists the slot, so these handlers need the slot helper too.
  const releaseSlot = releaseBriefSlot
    || createUgcSlots({ getClient: () => privilegedSupabase || supabase, getDb, saveDb }).releaseBriefSlot;
  // One cancel per order at a time on this instance (the refund row id is the cross-instance guard).
  const orderCancelLocks = new Set<string>();

  const handleUgcDeliverableSubmit = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    let rawId = req.params.id || req.params.threadId || req.params.orderId;
    // v414: the old /ugc-orders/:orderId/submit runs through this handler now. It may get a BRIEF id —
    // on a multi-slot brief pick the caller's own order (never another creator's).
    if (!req.params.id && !req.params.threadId && req.params.orderId) {
      const legacyId = String(req.params.orderId);
      const dbL = getDb();
      let own: any = (dbL.ugc_orders || []).find((o: any) => o.id === legacyId) || null;
      if (!own && supabase) {
        try {
          const { data } = await (privilegedSupabase || supabase).from('ugc_orders').select('id').eq('id', legacyId).maybeSingle();
          if (data) own = data;
        } catch (e: any) { logIgnored("ugc_routes:legacySubmitById", e); }
      }
      if (!own) {
        const mine = (o: any) => o.brief_id === legacyId && String(o.creator_id) === String(user.user_id) && !isUgcOrderClosed(o);
        own = (dbL.ugc_orders || []).find(mine) || null;
        if (supabase) {
          try {
            const { data } = await (privilegedSupabase || supabase).from('ugc_orders').select('*').eq('brief_id', legacyId).eq('creator_id', user.user_id);
            const open = (data || []).filter((o: any) => !isUgcOrderClosed(o));
            if (open[0]) own = open[0];
          } catch (e: any) { logIgnored("ugc_routes:legacySubmitByBrief", e); }
        }
      }
      if (!own) return res.status(404).json({ error: "Order not found", code: "ORDER_NOT_FOUND" });
      rawId = own.id;
    }

    let finalVideoUrl = (
      req.body?.videoUrl ||
      req.body?.video_url ||
      req.body?.content_url ||
      req.body?.contentUrl ||
      req.body?.driveUrl ||
      req.body?.drive_url ||
      req.body?.link ||
      req.body?.url ||
      req.body?.fileUrl ||
      ""
    ).trim();

    const notes = (
      req.body?.notes ||
      req.body?.creator_notes ||
      req.body?.contentNotes ||
      req.body?.notes_to_brand ||
      req.body?.feedback ||
      ""
    ).trim();

    if (!finalVideoUrl) {
      return res.status(400).json({ error: "A video file or link is required" });
    }
    const db = getDb();
    let thread = (db.chat_threads || []).find((t: any) => t.id === rawId || t.deal_id === rawId);
    if (!thread && supabase) {
      try {
        const { data: thr } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(`id.eq.${safeOrId(rawId)},deal_id.eq.${safeOrId(rawId)}`) // v416 (CR25)
          .maybeSingle();
        if (thr) thread = thr;
      } catch (e: any) { logIgnored("ugc_routes:154", e); }
    }

    const targetOrderId = thread?.deal_id || thread?.id || rawId;
    let ugcOrder = (db.ugc_orders || []).find((o: any) => o.id === rawId || o.id === targetOrderId || o.brief_id === rawId);
    if (!ugcOrder && supabase) {
      try {
        const { data: o } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .or(`id.eq.${safeOrId(rawId)},id.eq.${safeOrId(targetOrderId)},brief_id.eq.${safeOrId(rawId)}`) // v416 (CR25)
          .maybeSingle();
        if (o) ugcOrder = o;
      } catch (e: any) { logIgnored("ugc_routes:167", e); }
    }

    // Only the creator who claimed this order can upload deliverables
    const claimedCreatorId = ugcOrder?.creator_id || thread?.creator_id;
    if (claimedCreatorId && user.role !== 'admin' && user.user_id !== claimedCreatorId) {
      return res.status(403).json({
        error: "Only the creator who claimed this video may upload deliverables.",
        code: "CREATOR_MISMATCH"
      });
    }

    // Session 58 (bug hunt): the checks below used this server's local copy, which can be older than the database (the
    // deadline job or a cancel on another server). A stale "still open" let an expired / cancelled order come back as
    // SUBMITTED after its slot was relisted or refunded. Re-read the live row first.
    if (ugcOrder?.id && supabase) {
      try {
        const { data: live } = await (privilegedSupabase || supabase).from('ugc_orders').select('*').eq('id', ugcOrder.id).maybeSingle();
        if (live) ugcOrder = { ...ugcOrder, ...live };
      } catch (e: any) { logIgnored("ugc_routes:submit-fresh", e); }
    }
    // A finished order takes no more uploads, and an approved draft is not re-uploaded. A
    // submit on a COMPLETED order used to flip it back to SUBMITTED.
    if (ugcOrder && (orderStatus(ugcOrder) === 'EXPIRED' || ugcOrder.expired_at)) {
      return ugcConflict(res, 'ORDER_EXPIRED', "This order expired because no draft was submitted in time.");
    }
    if (ugcOrder && isUgcOrderClosed(ugcOrder)) {
      return ugcConflict(res, 'ORDER_CLOSED', "This order is already closed.");
    }
    if (ugcOrder && [...UGC_LIVE_LINK_DUE, ...UGC_LINK_WITH_BRAND].includes(orderStatus(ugcOrder))) {
      return ugcConflict(res, 'DRAFT_ALREADY_APPROVED', "Your draft is already approved — submit the live post link instead.");
    }

    // v389 (QA, Ravi OK 30 Oct): "will send tomorrow" used to be accepted as the first draft — the order became SUBMITTED, the 24 h expiry and
    // the brand's cancel / missed-deadline rules all stopped. The draft must be an uploaded file (our storage path or /api/media link) or a real
    // web link (same rule as the live-link handler below). Anything else is refused and the order stays as it was (checked after the order-state rules, so a closed / expired order still answers 409 first).
    if (!isAcceptableDraftRef(finalVideoUrl)) {
      return res.status(400).json({ error: "Please upload your video or paste a valid link (https://…). Text like a message is not a video.", code: "INVALID_DRAFT_LINK" });
    }

    const result = await syncUgcLifecycleEvent({
      rawId,
      action: 'SUBMIT_DELIVERABLE',
      actorUser: user,
      notes,
      videoUrl: finalVideoUrl,
      io: req.app.get("io")
    });

    if (result.error) {
      return res.status(result._status || 500).json(result);
    }

    return res.json({
      ...result,
      message: "Deliverable submitted successfully! Brand has been notified.",
      video_url: finalVideoUrl,
      notes: notes,
      status: 'SUBMITTED'
    });
  };

  const handleUgcLiveLinkSubmit = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const rawId = req.params.id || req.params.threadId;

    const db = getDb();
    let thread = (db.chat_threads || []).find((t: any) => t.id === rawId || t.deal_id === rawId);
    if (!thread && supabase) {
      try {
        const { data: thr } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(`id.eq.${safeOrId(rawId)},deal_id.eq.${safeOrId(rawId)}`) // v416 (CR25)
          .maybeSingle();
        if (thr) thread = thr;
      } catch (e: any) { logIgnored("ugc_routes:225", e); }
    }

    const targetOrderId = thread?.deal_id || thread?.id || rawId;
    let ugcOrder = (db.ugc_orders || []).find((o: any) => o.id === rawId || o.id === targetOrderId || o.brief_id === rawId);
    if (!ugcOrder && supabase) {
      try {
        const { data: o } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .or(`id.eq.${safeOrId(rawId)},id.eq.${safeOrId(targetOrderId)},brief_id.eq.${safeOrId(rawId)}`) // v416 (CR25)
          .maybeSingle();
        if (o) ugcOrder = o;
      } catch (e: any) { logIgnored("ugc_routes:238", e); }
    }

    // Only the creator who claimed this order can submit live links
    const claimedCreatorId = ugcOrder?.creator_id || thread?.creator_id;
    if (claimedCreatorId && user.role !== 'admin' && user.user_id !== claimedCreatorId) {
      return res.status(403).json({
        error: "Only the creator who claimed this collaboration order may submit live links.",
        code: "CREATOR_MISMATCH"
      });
    }

    if (ugcOrder && isUgcOrderClosed(ugcOrder)) {
      return ugcConflict(res, 'ORDER_CLOSED', "This order is already closed.");
    }
    // Session 58: the live link comes AFTER the brand approves the draft. Sending one first skipped the draft review
    // (the next "Approve" released the payout) and stopped the order from ever expiring.
    {
      let live: any = ugcOrder;
      if (ugcOrder?.id && supabase) {
        try {
          const { data: fresh } = await (privilegedSupabase || supabase).from('ugc_orders').select('status, draft_approved_at').eq('id', ugcOrder.id).maybeSingle();
          if (fresh) live = { ...ugcOrder, ...fresh }; // the local copy can be stale
        } catch (e: any) { logIgnored("ugc_routes:liveLinkStage", e); }
      }
      const st = String(live?.status || '').toUpperCase();
      // v414: allow-list instead of a deny-list — DISPUTED (and any new draft stage) slipped through before.
      const LIVE_LINK_OK = [...UGC_LIVE_LINK_DUE, ...UGC_LINK_WITH_BRAND];
      if (live && !live.draft_approved_at && !LIVE_LINK_OK.includes(st)) {
        return ugcConflict(res, 'DRAFT_NOT_APPROVED', "Post the live link after the brand approves your video draft.");
      }
    }

    const briefId = ugcOrder?.brief_id || thread?.ugc_brief_id;
    let brief = (db.ugc_briefs || []).find((b: any) => b.id === briefId);
    if (!brief && supabase && briefId) {
      try {
        const { data: b } = await (privilegedSupabase || supabase)
          .from('ugc_briefs')
          .select('*')
          .eq('id', briefId)
          .maybeSingle();
        if (b) brief = b;
      } catch (e: any) { logIgnored("ugc_routes:264", e); }
    }

    const deliverableType = String(
      ugcOrder?.deliverable_type ||
      brief?.deliverable_type ||
      thread?.deliverable_type ||
      ""
    ).toLowerCase();

    const isCollab = ugcOrder?.is_collaboration !== undefined
      ? Boolean(ugcOrder.is_collaboration)
      : (ugcOrder?.requires_live_link !== undefined
        ? Boolean(ugcOrder.requires_live_link)
        : (brief?.is_collaboration !== undefined
          ? Boolean(brief.is_collaboration)
          : (brief?.requires_live_link !== undefined
            ? Boolean(brief.requires_live_link)
            : isCollaborationDeliverable(deliverableType))));

    const requiresLiveLink = ugcOrder?.requires_live_link !== undefined
      ? Boolean(ugcOrder.requires_live_link)
      : isCollab;

    // Strict rule: DO NOT request or accept live links for UGC Raw or UGC Edited videos!
    if (!requiresLiveLink) {
      return res.status(400).json({
        error: "Live link submissions are not allowed for UGC Raw or UGC Edited videos. Only Collaboration orders require a live post link.",
        code: "LIVE_LINK_NOT_REQUIRED"
      });
    }

    const { link, links, live_link, live_links, instagram_post_url, videoUrl, video_url, url } = req.body || {};
    const rawUrl = (
      link ||
      (Array.isArray(links)
        ? (links.map((l: any) => (typeof l === 'string' ? l : l?.url || '')).find((u: string) => u.trim() !== '') || '')
        : (typeof links === 'string' ? links : (links?.url || ''))) ||
      (Array.isArray(live_links)
        ? (live_links.map((l: any) => (typeof l === 'string' ? l : l?.url || '')).find((u: string) => u.trim() !== '') || '')
        : (typeof live_links === 'string' ? live_links : (live_links?.url || ''))) ||
      live_link ||
      instagram_post_url ||
      videoUrl ||
      video_url ||
      url ||
      ""
    ).trim();

    const notes = (
      req.body?.notes ||
      req.body?.creator_notes ||
      req.body?.contentNotes ||
      req.body?.content_notes ||
      req.body?.notes_to_brand ||
      req.body?.feedback ||
      ""
    ).trim();

    const isValidLiveUrl = (urlStr: string): boolean => {
      if (!urlStr || typeof urlStr !== 'string') return false;
      const trimmed = urlStr.trim();
      if (!trimmed || /\s/.test(trimmed)) return false;
      try {
        const toTest = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
        const parsed = new URL(toTest);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
        const hostParts = parsed.hostname.split('.');
        if (hostParts.length < 2) return false;
        const tld = hostParts[hostParts.length - 1];
        if (!tld || tld.length < 2) return false;
        return true;
      } catch (e) {
        return false;
      }
    };

    if (!isValidLiveUrl(rawUrl)) {
      return res.status(400).json({
        error: "A valid live post link (URL) is required to submit live links proof.",
        detail: "Please provide a valid web link starting with http:// or https://"
      });
    }

    const finalLiveUrl = rawUrl.startsWith("http://") || rawUrl.startsWith("https://") ? rawUrl : `https://${rawUrl}`;

    const result = await syncUgcLifecycleEvent({
      rawId,
      action: 'SUBMIT_LIVE_LINK',
      actorUser: user,
      notes,
      videoUrl: finalLiveUrl,
      io: req.app?.get ? req.app.get("io") : undefined
    });

    if (result?.error) {
      return res.status(result._status || 500).json(result);
    }

    return res.json({
      ...result,
      message: "Live link submitted successfully! Brand has been notified.",
      live_link: finalLiveUrl,
      notes: notes,
      status: 'LINKS_UNDER_REVIEW'
    });
  };

  const handleUgcOrderApprove = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    // v423 (S14): approving releases the creator's money — on a brand team only the brand's admin may do it.
    // (a draft-only approval releases nothing, so any team member may still do that)
    if (user.parent_brand_id && String(user.team_role || "member") !== "admin" && req.body?.action !== 'approve_draft') return res.status(403).json({ error: "Only the brand's admin can approve and release payment." });
    const id = req.params.id || req.params.threadId;
    const notes = req.body?.notes || req.body?.feedback || "";
    if (!isPlainId(String(id || ""))) return res.status(400).json({ error: "Invalid order id" }); // v416 (CR25)

    const db = getDb();
    let thread = (db.chat_threads || []).find((t: any) => t.id === id || t.deal_id === id);
    if (!thread && supabase) {
      try {
        const { data: thr } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(`id.eq.${safeOrId(id)},deal_id.eq.${safeOrId(id)}`) // v416 (CR25)
          .maybeSingle();
        if (thr) thread = thr;
      } catch (e: any) { logIgnored("ugc_routes:388", e); }
    }

    const targetOrderId = thread?.deal_id || thread?.id || id;
    let ugcOrder = (db.ugc_orders || []).find((o: any) => o.id === id || o.id === targetOrderId || o.brief_id === id);
    if (!ugcOrder && supabase) {
      try {
        const { data: o } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .or(`id.eq.${safeOrId(id)},id.eq.${safeOrId(targetOrderId)},brief_id.eq.${safeOrId(id)}`) // v416 (CR25)
          .maybeSingle();
        if (o) ugcOrder = o;
      } catch (e: any) { logIgnored("ugc_routes:401", e); }
    }

    const targetThreadForFlow = thread || { id, deal_id: targetOrderId, ugc_order: ugcOrder };
    if (isCampaignThread(targetThreadForFlow)) {
      return handleThreadApproveLiveLinks(req, res);
    }

    const briefId = ugcOrder?.brief_id || thread?.ugc_brief_id;
    let brief = (db.ugc_briefs || []).find((b: any) => b.id === briefId);
    if (!brief && supabase && briefId) {
      try {
        const { data: b } = await (privilegedSupabase || supabase)
          .from('ugc_briefs')
          .select('*')
          .eq('id', briefId)
          .maybeSingle();
        if (b) brief = b;
      } catch (e: any) { logIgnored("ugc_routes:419", e); }
    }

    const deliverableType = String(
      ugcOrder?.deliverable_type ||
      brief?.deliverable_type ||
      thread?.deliverable_type ||
      ""
    ).toLowerCase();

    // Resolution order: order's flags, brief's flags, deliverable type
    const isCollab = ugcOrder?.is_collaboration !== undefined
      ? Boolean(ugcOrder.is_collaboration)
      : (ugcOrder?.requires_live_link !== undefined
        ? Boolean(ugcOrder.requires_live_link)
        : (brief?.is_collaboration !== undefined
          ? Boolean(brief.is_collaboration)
          : (brief?.requires_live_link !== undefined
            ? Boolean(brief.requires_live_link)
            : isCollaborationDeliverable(deliverableType))));

    const requiresLiveLink = ugcOrder?.requires_live_link !== undefined
      ? Boolean(ugcOrder.requires_live_link)
      : isCollab;

    if (!deliverableType) {
      console.error(
        "[UGC approve] no deliverable_type on order, brief or thread — defaulting to requiresLiveLink=" +
        requiresLiveLink + ". order=" + (ugcOrder?.id || id) + " brief=" + (briefId || "none")
      );
    }

    // Brand authorization check
    const orderBrandId = ugcOrder?.brand_id || thread?.brand_id || brief?.brand_id;
    // No brand on record is not permission for everyone.
    if (!orderBrandId && !isAdmin(user)) {
      return res.status(403).json({ error: "This order has no brand on record.", code: "BRAND_MISMATCH" });
    }
    if (orderBrandId && user.role !== 'admin' && user.user_id !== orderBrandId && user.parent_brand_id !== orderBrandId) {
      return res.status(403).json({
        error: "Only the brand that created this brief or an administrator may approve this order.",
        code: "BRAND_MISMATCH"
      });
    }

    // Payout recipient verification: Must release payout ONLY to the claimed creator
    const claimedCreatorId = ugcOrder?.creator_id || thread?.creator_id;
    if (!claimedCreatorId) {
      return res.status(400).json({
        error: "No claimed creator is associated with this order to release payout to.",
        code: "NO_CLAIMED_CREATOR"
      });
    }

    // A cancelled, refunded order is over. Approving it used to mark it COMPLETED / RELEASED —
    // the brand refunded AND the creator paid for the same order.
    if (ugcOrder && isUgcOrderRefunded(ugcOrder)) {
      return ugcConflict(res, 'ORDER_CANCELLED', "This order was cancelled and refunded, so it cannot be approved.");
    }
    // v414: an expired order is closed — never approved or paid.
    if (ugcOrder && orderStatus(ugcOrder) === 'EXPIRED') {
      return ugcConflict(res, 'ORDER_EXPIRED', "This order expired, so it cannot be approved.");
    }
    // Nothing is approved before something was delivered. A raw order used to pay out from
    // ACCEPTED, with no video at all.
    if (ugcOrder && orderStatus(ugcOrder) !== 'COMPLETED' && !hasUgcDeliverable(ugcOrder)) {
      return ugcConflict(res, 'NOTHING_DELIVERED', "The creator has not delivered anything for this order yet.");
    }

    // Evidence that a live post actually exists (only relevant for collaboration orders)
    const hasLiveLinkEvidence = Boolean(
      thread?.flow_state === 'PROOF_SUBMITTED' ||
      thread?.live_links_submitted ||
      thread?.live_link ||
      ugcOrder?.live_link ||
      ugcOrder?.live_links_submitted ||
      ['LINKS_UNDER_REVIEW', 'LIVE_LINKS_SUBMITTED', 'PROOF_SUBMITTED'].includes(
        String(ugcOrder?.status || '').toUpperCase()
      )
    );

    const isLiveLinkApproval = Boolean(
      requiresLiveLink && (
        (req.body?.action === 'approve_live_links' && hasLiveLinkEvidence) ||
        (req.body?.action !== 'approve_draft' && (
          thread?.flow_state === 'PROOF_SUBMITTED' ||
          thread?.live_links_submitted ||
          Boolean(ugcOrder?.live_link)
        ))
      )
    );

    // Reject an explicit live-link approval when nothing was submitted
    if (requiresLiveLink && req.body?.action === 'approve_live_links' && !hasLiveLinkEvidence) {
      console.error(
        "[UGC approve] approve_live_links requested with no live link on record. order=" +
        (ugcOrder?.id || id)
      );
      return res.status(400).json({
        error: "No live post link has been submitted for this order yet, so there is nothing to approve. Ask the creator to publish the post and submit the link first.",
        code: "NO_LIVE_LINK_TO_APPROVE"
      });
    }

    // v414: never pay out a live link whose draft was never approved (a DISPUTED order could post a link first).
    // Re-read draft_approved_at, then fall back to a "draft approved" chat message for older rows.
    let draftWasApproved = Boolean(ugcOrder?.draft_approved_at) || !ugcOrder;
    if (requiresLiveLink && isLiveLinkApproval && !draftWasApproved && supabase) {
      try {
        const { data: fresh } = await (privilegedSupabase || supabase).from('ugc_orders').select('draft_approved_at').eq('id', ugcOrder.id).maybeSingle();
        if (fresh?.draft_approved_at) { draftWasApproved = true; ugcOrder.draft_approved_at = fresh.draft_approved_at; }
      } catch (e: any) { logIgnored("ugc_routes:approve-draftCheck", e); }
    }
    if (requiresLiveLink && isLiveLinkApproval && !draftWasApproved) {
      const approveThreadId = thread?.id || ugcOrder?.thread_id || targetOrderId;
      let msgs: any[] = (db.chat_messages || []).filter((m: any) => m.thread_id === approveThreadId || m.thread_id === targetOrderId);
      if (supabase && approveThreadId) {
        try {
          const { data: m } = await (privilegedSupabase || supabase).from('chat_messages').select('message_type, metadata, text').eq('thread_id', approveThreadId).limit(200);
          if (Array.isArray(m)) msgs = msgs.concat(m);
        } catch (e: any) { logIgnored("ugc_routes:approve-draftMsgs", e); }
      }
      draftWasApproved = msgs.some((m: any) => String(m?.metadata?.action || '').toLowerCase() === 'draft_approved');
    }
    if (requiresLiveLink && isLiveLinkApproval && !draftWasApproved) {
      // v414: treat this approve as the draft approval only — no payout.
      if (req.body?.action === 'approve_live_links') {
        return ugcConflict(res, 'DRAFT_NOT_APPROVED', "The video draft was never approved. Approve the draft first — payout is released only after the draft and the live link are both approved.");
      }
      const draftResult = await syncUgcLifecycleEvent({ rawId: id, action: 'APPROVE_DRAFT', actorUser: user, notes, io: req.app.get("io") });
      if (draftResult?.error) return res.status(draftResult._status || 500).json(draftResult);
      return res.json({ ...draftResult, code: 'DRAFT_APPROVED_ONLY', message: "Video draft approved. Review the live post link next — payout is released when you approve it." });
    }

    // If it's a Collaboration UGC and live links are submitted, approve live links & release payout!
    if (requiresLiveLink && isLiveLinkApproval) {
      const result = await syncUgcLifecycleEvent({
        rawId: id,
        action: 'APPROVE',
        actorUser: user,
        notes,
        io: req.app.get("io"),
        isLiveLinkApproval: true
      });

      if (result?.error) {
        return res.status(result._status || 500).json(result);
      }

      return res.json({
        ...result,
        message: "Live links approved! Escrow payout released to creator."
      });
    }

    // Session 58: a draft that was already approved can't be "approved" again — it moved the order back to
    // AWAITING_LIVE_LINK (e.g. after the creator declined link changes) and hid the live-link approval.
    if (requiresLiveLink && !isLiveLinkApproval && ugcOrder?.draft_approved_at) {
      return ugcConflict(res, 'DRAFT_ALREADY_APPROVED', hasLiveLinkEvidence
        ? "The draft is already approved — review the creator's live link instead."
        : "The draft is already approved — the creator now posts it and sends the live link.");
    }

    // If it's a Collaboration UGC and live links are NOT yet submitted, approve draft ONLY (do not release payout)!
    if (requiresLiveLink && !isLiveLinkApproval) {
      const result = await syncUgcLifecycleEvent({
        rawId: id,
        action: 'APPROVE_DRAFT',
        actorUser: user,
        notes,
        io: req.app.get("io")
      });

      if (result?.error) {
        return res.status(result._status || 500).json(result);
      }

      return res.json({
        ...result,
        message: "Video draft approved! Creator has been notified to submit their live post link."
      });
    }

    // Otherwise, this is a Normal UGC Video (UGC Raw / UGC Edited, requiresLiveLink === false):
    // Deliverable approval directly releases payout to the claimed creator! No live link required.
    const result = await syncUgcLifecycleEvent({
      rawId: id,
      action: 'APPROVE',
      actorUser: user,
      notes,
      io: req.app.get("io")
    });

    if (result?.error) {
      return res.status(result._status || 500).json(result);
    }

    return res.json({
      ...result,
      message: result.message || "Deliverable approved! Escrow payout released to creator."
    });
  };

  const handleUgcOrderRevision = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const id = req.params.id || req.params.threadId;
    const notes = (
      req.body?.notes ||
      req.body?.feedback ||
      req.body?.revision_notes ||
      req.body?.comments ||
      ""
    ).trim();

    if (!notes) {
      return res.status(400).json({ error: "Revision notes are required. Please describe the specific changes needed." });
    }

    const db = getDb();
    let thread = (db.chat_threads || []).find((t: any) => t.id === id || t.deal_id === id);
    if (!thread && supabase) {
      try {
        const { data: thr } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(`id.eq.${safeOrId(id)},deal_id.eq.${safeOrId(id)}`) // v416 (CR25)
          .maybeSingle();
        if (thr) thread = thr;
      } catch (e: any) { logIgnored("ugc_routes:606", e); }
    }

    const targetOrderId = thread?.deal_id || thread?.id || id;
    let ugcOrder = (db.ugc_orders || []).find((o: any) => o.id === id || o.id === targetOrderId || o.brief_id === id);
    if (!ugcOrder && supabase) {
      try {
        const { data: o } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .or(`id.eq.${safeOrId(id)},id.eq.${safeOrId(targetOrderId)},brief_id.eq.${safeOrId(id)}`) // v416 (CR25)
          .maybeSingle();
        if (o) ugcOrder = o;
      } catch (e: any) { logIgnored("ugc_routes:619", e); }
    }

    const targetThreadForFlow = thread || { id, deal_id: targetOrderId, ugc_order: ugcOrder };
    if (isCampaignThread(targetThreadForFlow)) {
      return handleCampaignRevision(req, res);
    }

    const briefId = ugcOrder?.brief_id || thread?.ugc_brief_id;
    let brief = (db.ugc_briefs || []).find((b: any) => b.id === briefId);
    if (!brief && supabase && briefId) {
      try {
        const { data: b } = await (privilegedSupabase || supabase)
          .from('ugc_briefs')
          .select('*')
          .eq('id', briefId)
          .maybeSingle();
        if (b) brief = b;
      } catch (e: any) { logIgnored("ugc_routes:637", e); }
    }

    const deliverableType = String(
      ugcOrder?.deliverable_type ||
      brief?.deliverable_type ||
      thread?.deliverable_type ||
      ""
    ).toLowerCase();

    const isCollab = ugcOrder?.is_collaboration !== undefined
      ? Boolean(ugcOrder.is_collaboration)
      : (ugcOrder?.requires_live_link !== undefined
        ? Boolean(ugcOrder.requires_live_link)
        : (brief?.is_collaboration !== undefined
          ? Boolean(brief.is_collaboration)
          : (brief?.requires_live_link !== undefined
            ? Boolean(brief.requires_live_link)
            : isCollaborationDeliverable(deliverableType))));

    const requiresLiveLink = ugcOrder?.requires_live_link !== undefined
      ? Boolean(ugcOrder.requires_live_link)
      : isCollab;

    // Same chat timeline the order screens read, for the same reason: it is the one record of
    // this order that is always written.
    let revisionMessages: any[] = [];
    const revisionThreadId = thread?.id || ugcOrder?.thread_id || targetOrderId;
    if (supabase && revisionThreadId) {
      try {
        const { data: m } = await (privilegedSupabase || supabase)
          .from('chat_messages')
          .select('message_type, metadata, text, created_at')
          .eq('thread_id', revisionThreadId)
          .order('created_at', { ascending: false })
          .limit(40);
        if (Array.isArray(m)) revisionMessages = m;
      } catch (e: any) { logIgnored("ugc_routes:674", e); }
    }
    if (revisionMessages.length === 0) {
      revisionMessages = (db.chat_messages || []).filter((m: any) =>
        m.thread_id === revisionThreadId || m.thread_id === targetOrderId
      );
    }

    const currentStage = resolveUgcStage({
      order: ugcOrder || { id: targetOrderId },
      thread,
      messages: revisionMessages,
      requiresLiveLink
    });

    // Once the draft is approved, every further correction is about the live post — there is no
    // draft left to revise. The old chain tried to spot that from a scattered list of flags and
    // missed whenever draft_approved_at had not persisted and the thread lookup came back
    // empty, which handed the creator a "re-upload your draft" form for a live-link problem.
    // The client sends the answer explicitly now; this is the fallback for clients that do not.
    const isPastDraftApproval =
      currentStage.phase === 'CONTENT_APPROVED' ||
      currentStage.phase === 'PROOF_SUBMITTED' ||
      currentStage.phase === 'REVISION_REQUESTED_LINKS' ||
      currentStage.phase === 'REVISION_DECLINED_LINKS';

    const isLiveLinkRevision = Boolean(
      req.body?.action === 'reject_live_links' ||
      req.body?.action === 'live_links_resubmit' ||
      req.body?.action === 'live_links_resubmit_requested' ||
      req.originalUrl?.includes('reject-live-links') ||
      (requiresLiveLink && isPastDraftApproval)
    );

    // Only the brand asks for changes, and only while something is actually with them.
    // Anyone signed in could spend an order's revisions before — including the creator.
    {
      const role = partyRole(user, thread, ugcOrder);
      if (role !== 'brand' && role !== 'admin') return ugcForbid(res, 'brand');
      const phase = currentStage.phase;
      if (phase === 'COMPLETED' || phase === 'CANCELLED' || (ugcOrder && isUgcOrderClosed(ugcOrder))) {
        return ugcConflict(res, 'ORDER_CLOSED', "This order is already closed.");
      }
      const allowed = isLiveLinkRevision
        ? ['PROOF_SUBMITTED', 'REVISION_DECLINED_LINKS'].includes(phase)
        : ['SUBMITTED', 'REVISION_DECLINED'].includes(phase);
      if (!allowed) {
        return ugcConflict(res, isLiveLinkRevision ? 'NO_LINK_UNDER_REVIEW' : 'NO_DRAFT_UNDER_REVIEW',
          isLiveLinkRevision ? "There is no live link waiting for your review." : "There is no draft waiting for your review.",
          { phase });
      }
    }

    // UGC Order Revision: targetOrderId resolves to the UGC order id
    const result = await syncUgcLifecycleEvent({
      rawId: targetOrderId,
      action: isLiveLinkRevision ? 'REQUEST_LIVE_LINK_REVISION' : 'REQUEST_REVISION',
      actorUser: user,
      notes,
      io: req.app.get("io"),
      isLiveLinkRevision
    });

    if (result?.error) {
      return res.status(result._status || 400).json({ error: result.error });
    }

    return res.json({
      ...result,
      message: isLiveLinkRevision ? "Live link correction requested" : "Revision request submitted"
    });
  };

  const handleUgcOrderDeclineRevisions = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const id = req.params.id || req.params.threadId;
    const notes = (
      req.body?.feedback ||
      req.body?.notes ||
      req.body?.reason ||
      req.body?.declineReason ||
      ""
    ).trim();

    const db = getDb();
    let thread = (db.chat_threads || []).find((t: any) => t.id === id || t.deal_id === id);
    if (!thread && supabase) {
      try {
        const { data: thr } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(`id.eq.${safeOrId(id)},deal_id.eq.${safeOrId(id)}`) // v416 (CR25)
          .maybeSingle();
        if (thr) thread = thr;
      } catch (e: any) { logIgnored("ugc_routes:769", e); }
    }

    const targetOrderId = thread?.deal_id || thread?.id || id;
    let ugcOrder = (db.ugc_orders || []).find((o: any) => o.id === id || o.id === targetOrderId);
    if (!ugcOrder && supabase) {
      try {
        const { data: o } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .or(`id.eq.${safeOrId(id)},id.eq.${safeOrId(targetOrderId)}`) // v416 (CR25)
          .maybeSingle();
        if (o) ugcOrder = o;
      } catch (e: any) { logIgnored("ugc_routes:782", e); }
    }

    const isLiveLinkDecline = Boolean(
      thread?.flow_state === 'REVISION_REQUESTED_LINKS' ||
      ugcOrder?.status === 'REVISION_REQUESTED_LINKS' ||
      req.body?.action === 'decline_live_links_resubmission' ||
      req.originalUrl?.includes('decline-live-links-resubmission')
    );

    // Only the creator declines, and only a request that is actually open.
    {
      const role = partyRole(user, thread, ugcOrder);
      if (role !== 'creator' && role !== 'admin') return ugcForbid(res, 'creator');
      if (ugcOrder && isUgcOrderClosed(ugcOrder)) {
        return ugcConflict(res, 'ORDER_CLOSED', "This order is already closed.");
      }
      const st = orderStatus(ugcOrder);
      const flow = String(thread?.flow_state || '').toUpperCase();
      const open = isLiveLinkDecline
        ? (st === 'REVISION_REQUESTED_LINKS' || st === 'LIVE_LINK_REVISION_REQ' || flow === 'REVISION_REQUESTED_LINKS')
        : (UGC_DRAFT_REVISION.includes(st) || UGC_DRAFT_REVISION.includes(flow));
      if (!open) {
        return ugcConflict(res, 'NO_REQUEST_OPEN', "There is no open change request to decline.");
      }
    }

    const result = await syncUgcLifecycleEvent({
      rawId: targetOrderId,
      action: isLiveLinkDecline ? 'DECLINE_LIVE_LINKS_RESUBMIT' : 'DECLINE_REVISION',
      actorUser: user,
      notes,
      io: req.app.get("io")
    });

    if (result?.error) {
      return res.status(result._status || 400).json({ error: result.error });
    }

    return res.json({
      ...result,
      message: isLiveLinkDecline ? "Live links resubmission declined" : "Revisions declined"
    });
  };

  const handleUgcOrderCancel = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const id = req.params.id || req.params.threadId;
    const notes = (
      req.body?.reason ||
      req.body?.notes ||
      req.body?.feedback ||
      ""
    ).trim();

    // WHO and WHEN. Anyone signed in could cancel any order (writing a "refund processed" row);
    // and the brand could cancel after the creator delivered, keep the video and get the escrow
    // back. After delivery a cancellation is a dispute, not a button.
    {
      const db = getDb();
      let thread: any = (db.chat_threads || []).find((t: any) => t.id === id || t.deal_id === id) || null;
      const orderId = thread?.ugc_order_id || thread?.deal_id || id;
      let order: any = (db.ugc_orders || []).find((o: any) => o.id === orderId || o.id === id) || null;
      if (supabase) {
        try {
          const { data } = await (privilegedSupabase || supabase).from('ugc_orders').select('*').eq('id', orderId).maybeSingle();
          if (data) order = { ...(order || {}), ...data };
        } catch (e: any) { logIgnored("ugc_routes:850", e); }
        if (!thread) {
          try {
            const { data } = await (privilegedSupabase || supabase).from('chat_threads').select('*').or(`id.eq.${safeOrId(id)},deal_id.eq.${safeOrId(orderId)}`).limit(1); // v416 (CR25)
            if (Array.isArray(data) && data[0]) thread = data[0];
          } catch (e: any) { logIgnored("ugc_routes:855", e); }
        }
      }
      if (!order && !thread) return res.status(404).json({ error: "Order not found" });
      const role = partyRole(user, thread, order);
      if (!role) return ugcForbid(res, 'party');
      if (order && isUgcOrderRefunded(order)) {
        return res.json({ ok: true, already_cancelled: true, status: 'CANCELLED', message: "This order was already cancelled." });
      }
      if (order && isUgcOrderClosed(order)) {
        return ugcConflict(res, 'ORDER_CLOSED', "This order is already closed.");
      }
      if (role === 'brand' && order && hasUgcDeliverable(order)) {
        return ugcConflict(res, 'DELIVERED_USE_DISPUTE',
          "The creator has already delivered on this order, so it can no longer be cancelled for a refund. Raise it with support from the order.");
      }
      // Session 25 (rule 51): the creator stepping away is NOT a refund. The order is cancelled,
      // the slot is relisted at the top and the money stays in the brief. It used to run the
      // CANCEL path below, which refunded the brand through Razorpay for the creator's choice.
      // Session 25 (rule 52, Ravi): the brand cancels ONE order only when the creator's timer
      // started 24h+ ago and there is still no draft. No fee; the slot's money goes to the manual
      // UGC Refunds queue. This used to auto-refund through Razorpay at any time.
      if (role === 'brand' && order) {
        const key = `brand:${order.id}`;
        if (orderCancelLocks.has(key)) return ugcConflict(res, 'CANCEL_IN_PROGRESS', "A cancellation for this order is already in progress.");
        orderCancelLocks.add(key);
        try {
          const out = await cancelUgcOrderByBrand(
            { supabase, privilegedSupabase, getDb, saveDb, releaseBriefSlot: releaseSlot, app: req.app },
            { order, thread, user, reason: req.body?.reason || req.body?.notes || "" }
          );
          return res.status(out.status).json(out.json);
        } finally {
          orderCancelLocks.delete(key);
        }
      }
      if (role === 'creator' && order) {
        const out = await cancelUgcOrderByCreator(
          { supabase, privilegedSupabase, getDb, saveDb, releaseBriefSlot: releaseSlot, app: req.app },
          { order, thread, user, reason: req.body?.reason_code || req.body?.reason || "", note: req.body?.note || req.body?.details || "" }
        );
        return res.status(out.status).json(out.json);
      }
      // Session 56 (payment audit): an admin calling this used to fall through to the old CANCEL path,
      // which refunded the brand through Razorpay AND reopened the slot for another creator — the
      // same money could go to the brand and to a new creator (rule 51/52: no automatic refunds).
      // Admins handle a stuck order from the admin panel (UGC Refunds queue / support).
      if (role === 'admin' && order) {
        return ugcConflict(res, 'ADMIN_USE_REFUND_QUEUE', "Admins can't cancel a UGC order from here. Use the admin UGC Refunds queue or support tools.");
      }
    }

    const result = await syncUgcLifecycleEvent({
      rawId: id,
      action: 'CANCEL',
      actorUser: user,
      notes,
      io: req.app.get("io")
    });

    if (result?.error) {
      return res.status(result._status || 400).json({ error: result.error });
    }

    return res.json({
      ...result,
      message: "Claim cancelled and escrow refunded"
    });
  };

  return {
    handleUgcDeliverableSubmit,
    handleUgcLiveLinkSubmit,
    handleUgcOrderApprove,
    handleUgcOrderRevision,
    handleUgcOrderDeclineRevisions,
    handleUgcOrderCancel
  };
}

// Thin route-registration wiring for the UGC order lifecycle (and the one
// Campaign-Deal content-approval route that shares this naming pattern).
//
// This file intentionally does NOT contain any of the actual business
// logic — every route here just forwards to an already-existing handler
// function (handleUgcOrderApprove, handleUgcDeliverableSubmit, etc.) that
// still lives in server.ts, passed in as a dependency. This makes the
// move essentially zero-risk: we're only relocating *where a route path
// is registered*, never touching what it actually does.
//
// The handler functions themselves are much bigger and reach deep into
// server.ts's shared state (supabase, db, syncUgcLifecycleEvent, etc.) —
// extracting THEM safely is a separate, more involved task for later.
export function setupUgcOrderRoutes(
  app: express.Application,
  router: express.Router,
  {
    handleThreadApproveContent,
    handleUgcDeliverableSubmit,
    handleUgcLiveLinkSubmit,
    handleUgcOrderApprove,
    handleUgcOrderRevision,
    handleUgcOrderDeclineRevisions,
    handleUgcOrderCancel,
  }: {
    handleThreadApproveContent: (req: express.Request, res: express.Response) => any;
    handleUgcDeliverableSubmit: (req: express.Request, res: express.Response) => any;
    handleUgcLiveLinkSubmit?: (req: express.Request, res: express.Response) => any;
    handleUgcOrderApprove: (req: express.Request, res: express.Response) => any;
    handleUgcOrderRevision: (req: express.Request, res: express.Response) => any;
    handleUgcOrderDeclineRevisions: (req: express.Request, res: express.Response) => any;
    handleUgcOrderCancel: (req: express.Request, res: express.Response) => any;
  }
) {
  // UGC thread routes namespace
  router.post([
    "/ugc/threads/:id/reject-content",
    "/ugc/threads/:id/request-revision",
    "/ugc/threads/:id/reject-live-links"
  ], handleUgcOrderRevision);
  router.post(["/ugc/threads/:id/mark-complete", "/ugc/threads/:id/approve"], handleUgcOrderApprove);
  // Was wired straight to handleThreadApproveContent, which bypassed the deliverable-type
  // routing in handleUgcOrderApprove entirely. Every approval through this path therefore
  // behaved like a collaboration: "draft approved, now submit your live link" — even for a
  // raw UGC order that should have released the payout on the spot. Same handler as
  // /approve and /mark-complete now, so all three decide identically.
  router.post(["/ugc/threads/:id/approve-content", "/ugc/threads/:id/content/approve"], handleUgcOrderApprove);
  router.post([
    "/ugc/threads/:id/decline-revisions",
    "/ugc/threads/:id/decline-live-links-resubmission"
  ], handleUgcOrderDeclineRevisions);
  router.post(["/ugc/threads/:id/cancel-order", "/ugc/threads/:id/cancel-claim"], handleUgcOrderCancel);
  router.post([
    "/ugc/threads/:id/submit-live-link",
    "/ugc/threads/:id/submit-live-links",
    "/ugc/orders/:id/submit-live-link",
    "/ugc/orders/:id/submit-live-links",
    "/ugc/order/:id/submit-live-link"
  ], handleUgcLiveLinkSubmit || handleUgcDeliverableSubmit);
  router.post(["/ugc/threads/:id/submit-content", "/ugc/threads/:id/submit-draft"], handleUgcDeliverableSubmit);

  // UGC order routes
  router.post(["/ugc/orders/:id/submit", "/ugc/order/:id/submit"], handleUgcDeliverableSubmit);
  // v414: the old Orders page route goes through the same submit (guards, lifecycle, chat message, brand notice).
  router.post(["/ugc-orders/:orderId/submit"], handleUgcDeliverableSubmit);
  router.post(["/ugc/orders/:id/approve", "/ugc/order/:id/approve"], handleUgcOrderApprove);
  router.post([
    "/ugc/orders/:id/revision",
    "/ugc/order/:id/revision",
    "/ugc/orders/:id/reject-live-links",
    "/ugc/order/:id/reject-live-links"
  ], handleUgcOrderRevision);
  router.post([
    "/ugc/orders/:id/decline-revisions",
    "/ugc/order/:id/decline-revisions",
    "/ugc/orders/:id/decline-live-links-resubmission",
    "/ugc/order/:id/decline-live-links-resubmission"
  ], handleUgcOrderDeclineRevisions);
  router.post(["/ugc/orders/:id/cancel-claim", "/ugc/order/:id/cancel-claim", "/ugc/orders/:id/cancel", "/ugc/order/:id/cancel"], handleUgcOrderCancel);

  // Legacy draft/content submit aliases
  router.post("/chat/v2/threads/:threadId/content/approve", (req, res) => handleThreadApproveContent(req, res));
  router.post([
    "/chat/v2/threads/:threadId/submit-content",
    "/chat/v2/threads/:threadId/submit-draft",
    "/chat/v2/threads/:id/submit-content",
    "/chat/v2/threads/:id/submit-draft"
  ], handleUgcDeliverableSubmit);
}

// UGC brief browsing, order claiming/signing, brand/creator order listing,
// UGC-specific earnings/showcase views, and the internal ops-team pages
// (admin/ugc/orders, and the hyphenated /ugc-orders/... internal team
// flow). This is the "browse and discover" half of the UGC domain — the
// lifecycle-action routes (approve/revision/decline/cancel) already live
// in setupUgcOrderRoutes below, in this same file.
export function setupUgcBrowseRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    ensureUGCChatThread,
    enrichBriefsWithBrandProfiles,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    ensureUGCChatThread: (order: any, brief: any, user: any, io: any) => Promise<any>;
    enrichBriefsWithBrandProfiles: (briefs: any[]) => Promise<any[]>;
  }
) {
  const getIsoNow = () => new Date().toISOString();

  // Loads the chat thread and its lifecycle messages for one UGC order.
  //
  // Both order-list routes used to select only five thread columns
  // ('id, deal_id, status, flow_state, updated_at') while the code below them read
  // thr.live_links_submitted, thr.live_link, thr.revision_notes, thr.revision_notes_links and
  // thr.decline_notes_links — every one of those was silently undefined on the Supabase path.
  // Selecting '*' costs one row and makes those reads mean what they say.
  //
  // The messages matter more. chat_messages is written on every lifecycle event and has no
  // column whitelist to fall through, which is why the chat screen stayed correct while the
  // Manage Orders screens went stale. Reading it here is what actually keeps the two in sync.
  // Manage Orders used to run ~5 Supabase queries PER ORDER (brief, user, profile, thread,
  // messages), all orders at once with no limit, every 20 s poll. The lookups that are the same
  // for many orders are now fetched once per request, and the per-order thread/message reads run
  // at most 6 at a time.
  const makeLimiter = (n: number) => {
    let active = 0;
    const queue: Array<() => void> = [];
    const pump = () => {
      if (active >= n || queue.length === 0) return;
      active++;
      queue.shift()!();
    };
    return <T>(fn: () => Promise<T>): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        queue.push(() => {
          fn().then(resolve, reject).finally(() => { active--; pump(); });
        });
        pump();
      });
  };

  const prefetchOrderRefs = async (orders: any[]) => {
    const briefs = new Map<string, any>();
    const users = new Map<string, any>();
    const profiles = new Map<string, any>();
    if (!supabase) return { briefs, users, profiles, ready: false };
    const briefIds = [...new Set(orders.map((o: any) => o.brief_id).filter(Boolean))];
    const creatorIds = [...new Set(orders.map((o: any) => o.creator_id).filter(Boolean))];
    const c = privilegedSupabase || supabase;
    try {
      const [bRes, uRes, pRes]: any = await Promise.all([
        briefIds.length ? c.from('ugc_briefs').select('*').in('id', briefIds) : Promise.resolve({ data: [] }),
        creatorIds.length ? c.from('users').select('user_id, name, picture, email').in('user_id', creatorIds) : Promise.resolve({ data: [] }),
        creatorIds.length ? c.from('creator_profiles').select('user_id, name, picture, photo, avatar_url, instagram_handle').in('user_id', creatorIds) : Promise.resolve({ data: [] }),
      ]);
      (bRes?.data || []).forEach((b: any) => briefs.set(b.id, b));
      (uRes?.data || []).forEach((u: any) => users.set(u.user_id, u));
      (pRes?.data || []).forEach((p: any) => profiles.set(p.user_id, p));
      return { briefs, users, profiles, ready: true };
    } catch (e) {
      return { briefs, users, profiles, ready: false };
    }
  };

  const loadUgcThreadContext = async (o: any, db: any): Promise<{ thr: any; messages: any[] }> => {
    let thr: any = null;
    if (supabase) {
      try {
        const threadFilter = [
          `id.eq.${o.id}`,
          `deal_id.eq.${o.id}`,
          o.thread_id ? `id.eq.${o.thread_id}` : null,
          o.deal_id ? `deal_id.eq.${o.deal_id}` : null,
          o.deal_id ? `id.eq.${o.deal_id}` : null,
          o.chat_thread_id ? `id.eq.${o.chat_thread_id}` : null
        ].filter(Boolean).join(',');

        const { data: tData } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(threadFilter)
          .maybeSingle();
        if (tData) thr = tData;
      } catch (e: any) { logIgnored("ugc_routes:1092", e); }
    }
    if (!thr) {
      thr = (db.chat_threads || []).find((t: any) =>
        t.id === o.id || t.deal_id === o.id ||
        (o.thread_id && (t.id === o.thread_id || t.deal_id === o.thread_id)) ||
        (o.deal_id && (t.id === o.deal_id || t.deal_id === o.deal_id))
      ) || null;
    }

    const threadId = thr?.id || o.thread_id || o.id;
    let messages: any[] = [];
    if (supabase && threadId) {
      try {
        const { data: mData } = await (privilegedSupabase || supabase)
          .from('chat_messages')
          .select('message_id, thread_id, message_type, metadata, text, created_at')
          .eq('thread_id', threadId)
          .order('created_at', { ascending: false })
          .limit(40);
        if (Array.isArray(mData)) messages = mData;
      } catch (e: any) { logIgnored("ugc_routes:1113", e); }
    }
    if (messages.length === 0) {
      messages = (db.chat_messages || []).filter((m: any) =>
        m.thread_id === threadId || m.thread_id === o.id
      );
    }

    return { thr, messages };
  };

  router.post("/ugc-orders/:orderId/in-house", async (req, res) => {
    // No authentication before. Now: the brief's brand or an admin.
    const viewer = await parseAuthUser(req);
    if (!viewer) return res.status(401).json({ error: "Unauthorized" });
    const { orderId } = req.params;
    const db = getDb();
    let order = (db.ugc_orders || []).find((o: any) => o.id === orderId || o.brief_id === orderId);
    {
      const ownerBrief = (db.ugc_briefs || []).find((b: any) => b.id === (order?.brief_id || orderId));
      const ownerBrandId = order?.brand_id || ownerBrief?.brand_id;
      const actingBrand = viewer.parent_brand_id || viewer.user_id;
      if (!isAdmin(viewer) && (!ownerBrandId || ownerBrandId !== actingBrand)) {
        return res.status(403).json({ error: "Only the brand that posted this brief can do this." });
      }
      if (order && isUgcOrderClosed(order)) {
        return res.status(409).json({ error: "This order is already closed." });
      }
    }
    // Session 58: not a real feature yet — it changed only this server's local copy (no team assigned, no admin told,
    // and it could flip a creator's live order) while the brand saw "In-house team assigned". Refused honestly.
    return res.status(410).json({ error: "In-house production isn't available yet. Contact support if you need help with this brief.", code: "IN_HOUSE_UNAVAILABLE" });
    if (order) {
      order.in_house_assigned = true;
      order.status = "IN_HOUSE_ASSIGNED";
      saveDb(db);
    } else {
      const brief = (db.ugc_briefs || []).find((b: any) => b.id === orderId);
      if (brief) {
        const newOrder = {
          id: 'ugcord_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
          brief_id: brief.id,
          brand_id: brief.brand_id,
          // No hardcoded creator account and no invented ₹50,000: the in-house team is assigned
          // by an admin, at the brief's own budget.
          creator_id: null,
          creator_payout: Number(brief.budget) || 0,
          agreed_amount: Number(brief.budget) || 0,
          status: "IN_HOUSE_ASSIGNED",
          in_house_assigned: true,
          created_at: getIsoNow()
        };
        if (!db.ugc_orders) db.ugc_orders = [];
        db.ugc_orders.unshift(newOrder);
        saveDb(db);
      }
    }
    res.json({ ok: true, message: "In-house SLA override triggered" });
  });

  router.post("/ugc/ai-generate-brief", async (req, res) => {
    // Session 53 (security): logged-in brands only — it used to call Gemini for anyone on the internet.
    const aiUser = await parseAuthUser(req);
    if (!aiUser) return res.status(401).json({ error: "Please log in." });
    if (!isBrandLike(aiUser.role) && aiUser.role !== "admin") // v416 (CR4)
      return res.status(403).json({ error: "Only brands can generate a brief." });
    const { product_name, category, target_audience, focus_area, current_title, current_requirements } = req.body || {};

    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        const prompt = `You are a high-performing D2C UGC (User Generated Content) Creative Director.
Generate a structured, authentic, high-converting UGC campaign brief based on this input:
- Product Name: ${product_name || "D2C Brand Product"}
- Category: ${category || "Lifestyle, Beauty, D2C, Tech or Fitness"}
- Target Audience: ${target_audience || "Gen Z & Millennial consumers"}
- Focus/Hook: ${focus_area || "High-converting authentic proof and lifestyle integration"}
- Current Title: ${current_title || "None"}
- Current Requirements: ${current_requirements || "None"}

Respond with ONLY a valid raw JSON object (no markdown, no backticks, no code fence) matching this schema:
{
  "title": "<Catchy concise campaign title, e.g. 30s Honest Skin Texture & Glow Routine>",
  "product_name": "<Refined product name>",
  "product_description": "<Compelling 1-2 sentence product description under 40 words>",
  "detailed_requirements": "<Actionable creator instructions: 3s hook, key benefit in use, natural daylight demonstration, and crisp CTA. Under 100 words>",
  "dos": [
    "<Direct rule 1>",
    "<Direct rule 2>",
    "<Direct rule 3>"
  ],
  "donts": [
    "<Restriction 1>",
    "<Restriction 2>"
  ],
  "recommended_format": "collaboration_reel",
  "recommended_duration": "30s"
}`;

        const aiCallPromise = ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: prompt,
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("AI generation timeout")), 5000)
        );

        const aiRes: any = await Promise.race([aiCallPromise, timeoutPromise]);
        const rawText = (aiRes.text || "").trim().replace(/^```json\s*|```$/g, "");
        const parsed = JSON.parse(rawText);
        return res.json({ ok: true, data: parsed });
      } catch (err: any) {
        console.error("[POST /ugc/ai-generate-brief] Gemini error, using fallback:", err?.message || err);
      }
    }

    const pName = product_name || "Premium Everyday Essential";
    return res.json({
      ok: true,
      data: {
        title: `${pName} Real Life Review & Demo`,
        product_name: pName,
        product_description: "High-performance formula designed for noticeable everyday results and authentic social proof.",
        detailed_requirements: "Hook viewers in the first 3 seconds with a relatable problem. Show product unboxing, close-up texture in natural daylight, real application, and conclude with a crisp CTA to check the link.",
        dos: [
          "Shoot vertical 9:16 format in bright natural daylight",
          "Highlight close-up product texture and immediate reaction",
          "Include high-contrast captions during the hook"
        ],
        donts: [
          "Do not mention competitor brand names or comparison pricing",
          "Avoid artificial skin smoothing filters or distorted lighting"
        ],
        recommended_format: "collaboration_reel",
        recommended_duration: "30s"
      }
    });
  });

  router.post("/ugc/briefs", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required", detail: "Please log in to post a UGC brief." });
    }

    // Brands post briefs. A creator account could post one before.
    if (!isBrandLike(user.role) && String(user.role || '').toLowerCase() !== 'admin') { // v416 (CR4)
      return res.status(403).json({ error: "Only brand accounts can post UGC briefs." });
    }

    const body = req.body || {};
    const briefId = `brief_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`;
    const deliverableType = body.deliverable_type || body.format || "collaboration_reel";
    const isCollab = body.is_collaboration !== undefined
      ? Boolean(body.is_collaboration)
      : (body.requires_live_link !== undefined
        ? Boolean(body.requires_live_link)
        : isCollaborationDeliverable(deliverableType));
    const requiresLiveLink = body.requires_live_link !== undefined
      ? Boolean(body.requires_live_link)
      : isCollab;
    // v416 (CR19): was "at least ₹1" (a testing leftover) — now the real per-creator range, with a clear error
    let ugcFloor = UGC_MIN_BUDGET_PER_CREATOR; // v420: ₹2,000 special offer; a Ybex in-house brand keeps ₹500
    try { ugcFloor = Math.min(ugcFloor, await minPayoutFor(user?.user_id)); } catch { /* default floor */ }
    const budgetProblem = ugcBudgetProblem(body.budget, ugcFloor);
    if (budgetProblem) return res.status(400).json({ error: budgetProblem, detail: budgetProblem, code: "BUDGET_OUT_OF_RANGE", min_budget: ugcFloor, max_budget: UGC_MAX_BUDGET_PER_CREATOR });
    const budget = Math.round(Number(body.budget));
    const maxCreators = Math.max(1, Math.floor(Number(body.max_creators) || 1));
    // The escrow is what the brief promises to pay out — never a number the client names.
    const totalBudget = budget * maxCreators;

    // PAYMENT. This route used to create the brief and write a local "SUCCESS / escrow_hold"
    // transaction without looking at any payment at all, and reply "payment held in Escrow!".
    // The real Razorpay payment was recorded nowhere (verify had no deal/brief to attach it to).
    // Now the brief is created only against a PAID Razorpay order that covers the escrow and
    // has not already funded another brief. Test mode keeps the simulated checkout working.
    const paymentOrderId = String(body.razorpay_order_id || body.order_id || "").trim();
    const testMode = resolveTestMode(process.env);
    // v364 (Ravi: brand fee on UGC too): what the brand owes = escrow + brand fee. The order's notes carry the quote made
    // at checkout (with the coupon); if they don't match this brief's escrow, it's re-quoted here without a coupon.
    let briefQuote: any = null;
    let briefPaid = 0;
    if (!testMode) {
      if (!paymentOrderId.startsWith("order_")) {
        return res.status(402).json({ error: "Payment is required to post a brief.", code: 'PAYMENT_REQUIRED' });
      }
      try {
        const rzpOrder: any = await getRazorpay().orders.fetch(paymentOrderId);
        const paidRupees = Number(rzpOrder?.amount_paid || 0) / 100;
        if (String(rzpOrder?.status || '').toLowerCase() !== 'paid') {
          return res.status(402).json({ error: "The payment for this brief has not completed.", code: 'PAYMENT_NOT_COMPLETED' });
        }
        if (paidRupees + 0.5 < totalBudget) {
          return res.status(402).json({ error: `The payment (₹${paidRupees}) does not cover the escrow (₹${totalBudget}).`, code: 'PAYMENT_TOO_LOW' });
        }
        briefPaid = paidRupees;
        const fromNotes = quoteFromNotes(rzpOrder?.notes);
        if (fromNotes && Math.abs(fromNotes.gross - totalBudget) <= 0.5) briefQuote = fromNotes;
        else if (fromNotes) {
          const q = await quoteBrandPayment(privilegedSupabase || supabase, totalBudget, { brandId: String(user.parent_brand_id || user.user_id) }); // v365: team members count as their brand
          briefQuote = { ...q, brandFeePercent: q.brandFeePercent, couponCode: null, couponId: null };
        }
        if (briefQuote && paidRupees + 0.5 < Number(briefQuote.total || totalBudget)) {
          return res.status(402).json({ error: `The payment (₹${paidRupees}) does not cover the amount due (₹${briefQuote.total} incl. service fee).`, code: 'PAYMENT_TOO_LOW' });
        }
      } catch (e: any) {
        return res.status(502).json({ error: "The payment could not be confirmed with Razorpay. Please retry in a moment.", code: 'PAYMENT_UNCONFIRMED' });
      }
    } else if (paymentOrderId.startsWith("order_test_")) {
      // v366: test mode only fakes Razorpay — the brand fee and coupon are stamped from the quote create-order remembered.
      try {
        const saved: any = await ephemeralGet(`orderquote:${paymentOrderId}`);
        const fromSaved = quoteFromNotes(saved);
        if (fromSaved && Math.abs(fromSaved.gross - totalBudget) <= 0.5) { briefQuote = fromSaved; briefPaid = Number(fromSaved.total) || 0; }
      } catch (e: any) { logIgnored("ugc_routes:test-order-quote", e); }
    }
    if (paymentOrderId) {
      // Session 26: posting is IDEMPOTENT per paid order. If this brand already turned this
      // payment into a brief (e.g. the page timed out after the server saved it, or a retry
      // fired), answer with that brief instead of "already used" — the page then moves on to
      // My Briefs instead of sitting on "Processing…".
      let existingBrief: any = (getDb().ugc_briefs || []).find((b: any) => b?.razorpay_order_id === paymentOrderId) || null;
      if (!existingBrief && supabase) {
        try {
          const { data: eb, error: ebErr } = await (privilegedSupabase || supabase)
            .from('ugc_briefs').select('*').eq('razorpay_order_id', paymentOrderId).limit(1);
          if (!ebErr && Array.isArray(eb) && eb[0]) existingBrief = eb[0];
        } catch (e: any) { logIgnored("ugc_routes:brief-by-order", e); }
      }
      if (existingBrief) {
        const owner = existingBrief.brand_id || existingBrief.brand_user_id;
        if (owner && [user.user_id, user.parent_brand_id].filter(Boolean).map(String).includes(String(owner))) { // v423 (QA): a team member's brief carries the parent brand id
          return res.json({ ok: true, brief: existingBrief, already_posted: true, message: "Brief posted and payment held in Escrow!" });
        }
        return res.status(409).json({ error: "This payment has already been used for another brief.", code: 'PAYMENT_ALREADY_USED' });
      }
      const dbCheck = getDb();
      // Session 24. Only a transaction that already FUNDS something (a brief, deal or UGC order)
      // makes the payment "used". /payments/razorpay/verify runs first and writes an unlinked
      // local row for this same order — that row counted as "used", so every paid brief was
      // refused with "already been used for another brief" and the brand was charged for nothing.
      let used = (dbCheck.transactions || []).some((t: any) => isPaymentFundingSomething(t, paymentOrderId));
      if (!used && supabase) {
        try {
          const { data: prior } = await (privilegedSupabase || supabase)
            .from('transactions').select('id').eq('zaakpay_order_id', paymentOrderId).limit(1);
          used = Array.isArray(prior) && prior.length > 0;
        } catch (e: any) { logIgnored("ugc_routes:1308", e); }
      }
      if (used) {
        return res.status(409).json({ error: "This payment has already been used for another brief.", code: 'PAYMENT_ALREADY_USED' });
      }
    }
    const brandName = user.name || user.company_name || body.brand_name || "Brand Partner";

    const newBrief = {
      id: briefId,
      razorpay_order_id: paymentOrderId || null,
      brand_id: actingBrandIdOf(user), // v416 (CR5): a team member's brief belongs to the brand
      brand_name: brandName,
      title: body.title || `Review of ${body.product_name || "Product"}`,
      product_name: body.product_name || "",
      product_description: body.product_description || "",
      detailed_requirements: body.detailed_requirements || "",
      sample_content_url: body.sample_content_url || "",
      deliverable_type: deliverableType,
      is_collaboration: isCollab,
      requires_live_link: requiresLiveLink,
      format_category: isCollab ? 'collaboration' : 'ugc_video',
      video_duration: body.video_duration || "30s",
      budget: budget,
      max_creators: maxCreators,
      claimed_count: 0,
      status: 'OPEN',
      dos: Array.isArray(body.dos) ? body.dos.filter((d: any) => typeof d === 'string' && d.trim().length > 0) : [],
      donts: Array.isArray(body.donts) ? body.donts.filter((d: any) => typeof d === 'string' && d.trim().length > 0) : [],
      // Session 24: brand-chosen first-draft deadline (Express 24h / Standard 48h / Relaxed 72h).
      delivery_hours: normalizeDeliveryHours(body.delivery_hours),
      created_at: getIsoNow()
    };

    if (supabase) {
      try {
        const supaPayload = {
          id: briefId,
          brand_id: actingBrandIdOf(user), // v416 (CR5)
          brand_name: brandName,
          title: newBrief.title,
          product_name: newBrief.product_name,
          product_description: newBrief.product_description,
          detailed_requirements: newBrief.detailed_requirements,
          sample_content_url: newBrief.sample_content_url,
          deliverable_type: deliverableType,
          video_duration: newBrief.video_duration,
          budget: budget,
          max_creators: maxCreators,
          claimed_count: 0,
          status: 'OPEN',
          dos: newBrief.dos,
          donts: newBrief.donts,
          delivery_hours: newBrief.delivery_hours,
          razorpay_order_id: newBrief.razorpay_order_id,
          created_at: newBrief.created_at
        };
        let { error } = await (privilegedSupabase || supabase).from('ugc_briefs').insert(supaPayload);
        // The delivery_hours column is new (scripts/sql/ugc_delivery_hours.sql). If the database
        // doesn't have it yet, save the brief without it rather than losing a PAID brief.
        if (error && isMissingColumnError(error, 'delivery_hours')) {
          console.error("[POST /ugc/briefs] ugc_briefs.delivery_hours missing — run scripts/sql/ugc_delivery_hours.sql. Saved without it.");
          const { delivery_hours: _omit, ...withoutHours } = supaPayload;
          ({ error } = await (privilegedSupabase || supabase).from('ugc_briefs').insert(withoutHours));
        }
        // ugc_briefs.razorpay_order_id was added in session 25; keep a PAID brief even if a
        // database is missing it.
        if (error && isMissingColumnError(error, 'razorpay_order_id')) {
          console.error("[POST /ugc/briefs] ugc_briefs.razorpay_order_id missing — saved without it.");
          const { razorpay_order_id: _o, ...withoutOrder } = supaPayload as any;
          ({ error } = await (privilegedSupabase || supabase).from('ugc_briefs').insert(withoutOrder));
        }
        if (error) {
          console.error("[POST /ugc/briefs] Supabase insert error:", error);
          // Session 56 (payment audit): a paid brief that isn't in the database must not look posted.
          // The same paid order was used at the same moment (double tap / two tabs) → give the brand
          // that brief; anything else → error, the page keeps the paid order and "Post" retries it free.
          if (String((error as any)?.code || "") === "23505" && paymentOrderId) {
            const { data: dup } = await (privilegedSupabase || supabase).from('ugc_briefs').select('*').eq('razorpay_order_id', paymentOrderId).limit(1);
            const b0 = Array.isArray(dup) ? dup[0] : null;
            if (b0 && ownsBrandRow(user, b0.brand_id || b0.brand_user_id)) { // v416 (CR5)
              return res.json({ ok: true, brief: b0, already_posted: true, message: "Brief posted and payment held in Escrow!" });
            }
            return res.status(409).json({ error: "This payment has already been used for another brief.", code: 'PAYMENT_ALREADY_USED' });
          }
          return res.status(502).json({ error: "Your payment is safe, but the brief couldn't be saved. Please try again — you won't be charged again.", code: 'BRIEF_SAVE_FAILED' });
        }
      } catch (err) {
        console.error("[POST /ugc/briefs] Supabase insert caught error:", err);
        return res.status(502).json({ error: "Your payment is safe, but the brief couldn't be saved. Please try again — you won't be charged again.", code: 'BRIEF_SAVE_FAILED' });
      }
    }

    const db = getDb();
    if (!db.ugc_briefs) db.ugc_briefs = [];
    db.ugc_briefs.unshift(newBrief);

    // Record the escrow deposit against the payment that funded it — in Supabase too, so the
    // payment is on record and cannot fund a second brief.
    // Session 56: saved with the brief id (the DB now accepts a brief-only row) and stamped with the
    // platform fee set in Admin at the moment the brand paid — the same "fee at payment time" rule as
    // campaigns (session 36). Each creator's payout on this brief uses that stamp.
    let depositFee = { platformFee: 0, gstAmount: 0 };
    try {
      const perSlot: any = await calculatePlatformFee(budget, (privilegedSupabase || supabase) as any);
      depositFee = {
        platformFee: Math.round(Number(perSlot?.platformFee || 0) * maxCreators),
        gstAmount: Math.round(Number(perSlot?.gstAmount || 0) * maxCreators),
      };
    } catch (e: any) { logIgnored("ugc_routes:brief-deposit-fee", e); }
    if (supabase && paymentOrderId) {
      try {
        const { error: txErr } = await (privilegedSupabase || supabase).from('transactions').insert({
          id: crypto.randomUUID(),
          zaakpay_order_id: paymentOrderId,
          brief_id: briefId,
          brand_id: user.parent_brand_id || user.user_id, // v366: a team member's payment belongs to the brand (old rows unchanged)
          gross_amount: totalBudget,
          platform_fee_amount: depositFee.platformFee,
          creator_net_amount: Math.max(0, totalBudget - depositFee.platformFee - depositFee.gstAmount),
          gst_amount: depositFee.gstAmount,
          ...(briefQuote ? brandStamp(briefQuote, briefPaid) : {}), // v364: brand fee paid on top
          status: 'SUCCESS',
          payout_status: 'PENDING',
          payout_type: 'full',
          escrow_hold: true,
          notes: 'UGC brief deposit',
          created_at: getIsoNow()
        });
        if (txErr) console.error("[POST /ugc/briefs] escrow transaction insert failed:", txErr.message || txErr);
        else if (briefQuote?.couponId) {
          const full = Math.round((totalBudget * Number((await loadFeeConfig(privilegedSupabase || supabase))?.brand_fee_pct || 0)) / 100);
          await confirmBrandCoupon(privilegedSupabase || supabase, { orderId: paymentOrderId, couponId: briefQuote.couponId, brandId: String(user.parent_brand_id || user.user_id), campaignId: briefId, discount: Math.max(0, full - Number(briefQuote.brandFee || 0)) }); // v366: atomic, once per order
        }
      } catch (e: any) {
        console.error("[POST /ugc/briefs] escrow transaction insert threw:", e?.message || e);
      }
    }
    if (!db.transactions) db.transactions = [];
    // The unlinked row verify wrote for this payment becomes this brief's row (no double count).
    if (paymentOrderId) {
      db.transactions = db.transactions.filter((t: any) => !isUnlinkedPaymentRow(t, paymentOrderId));
    }
    db.transactions.unshift({
      id: crypto.randomUUID(),
      transaction_id: `txn_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`,
      razorpay_order_id: paymentOrderId || null,
      brief_id: briefId,
      brand_id: user.parent_brand_id || user.user_id, // v366: same as the Supabase deposit row
      gross_amount: totalBudget,
      platform_fee_amount: 0,
      creator_net_amount: totalBudget,
      gst_amount: 0,
      status: 'SUCCESS',
      escrow_hold: true,
      payout_status: 'PENDING',
      payout_type: 'full',
      created_at: getIsoNow()
    });
    saveDb(db);

    return res.json({ ok: true, brief: newBrief, message: "Brief posted and payment held in Escrow!" });
  });


  router.get("/ugc/briefs/my", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    let briefs: any[] = [];
    const myBrandIds = brandIdsOf(user); // v416 (CR5): team members see the brand's briefs
    if (supabase) {
      // v416 (CR2): a database error answered 200 [] ("no briefs yet") — now 503 so the page shows retry
      let failed = false;
      try {
        const { data, error } = await (privilegedSupabase || supabase)
          .from('ugc_briefs')
          .select('*')
          .in('brand_id', myBrandIds)
          .order('created_at', { ascending: false });
        if (error) failed = true;
        else if (data) briefs = data;
      } catch (e) {
        console.error("[GET /ugc/briefs/my] Supabase query error:", e);
        failed = true;
      }
      if (failed) return res.status(503).json({ error: "Couldn't load your briefs. Please try again.", detail: "Couldn't load your briefs. Please try again.", code: "BRIEFS_LOAD_FAILED" });
    }

    const db = getDb();
    const localBriefs = (db.ugc_briefs || []).filter((b: any) => myBrandIds.includes(String(b.brand_id)));
    const combinedMap = new Map();
    briefs.forEach((b: any) => combinedMap.set(b.id, b));
    localBriefs.forEach((b: any) => {
      if (!combinedMap.has(b.id)) combinedMap.set(b.id, b);
    });
    const finalBriefs = Array.from(combinedMap.values());

    // Fetch matching orders for applications count
    let allOrders: any[] = [];
    if (supabase) {
      try {
        const { data: ords } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .in('brand_id', myBrandIds); // v416 (CR5)
        if (ords) allOrders = ords;
      } catch (e: any) { logIgnored("ugc_routes:1455", e); }
    }
    const localOrders = (db.ugc_orders || []).filter((o: any) => myBrandIds.includes(String(o.brand_id)));
    const allOrdersMap = new Map();
    allOrders.forEach((o: any) => allOrdersMap.set(o.id, o));
    localOrders.forEach((o: any) => {
      if (!allOrdersMap.has(o.id)) allOrdersMap.set(o.id, o);
    });
    const mergedOrders = Array.from(allOrdersMap.values());

    // Gather creator details for all orders to ensure real creator data is returned
    const creatorIds = Array.from(new Set(mergedOrders.map((o: any) => o.creator_id).filter(Boolean)));
    const creatorMap = new Map<string, any>();
    if (supabase && creatorIds.length > 0) {
      try {
        const [uRes, cpRes] = await Promise.all([
          (privilegedSupabase || supabase)
            .from('users')
            .select('user_id, name, picture, email')
            .in('user_id', creatorIds),
          (privilegedSupabase || supabase)
            .from('creator_profiles')
            .select('user_id, name, picture, photo, avatar_url, instagram_handle')
            .in('user_id', creatorIds)
        ]);
        const usersList = uRes?.data || [];
        const profilesList = cpRes?.data || [];
        creatorIds.forEach((cid: string) => {
          const u = usersList.find((x: any) => x.user_id === cid);
          const cp = profilesList.find((x: any) => x.user_id === cid);
          if (u || cp) {
            const resolvedName = u?.name || cp?.name || "Verified UGC Creator";
            const resolvedAvatar = cp?.picture || cp?.photo || cp?.avatar_url || u?.picture || null;
            creatorMap.set(cid, {
              id: cid,
              user_id: cid,
              name: resolvedName,
              full_name: resolvedName,
              avatar: resolvedAvatar,
              picture: resolvedAvatar,
              photo: resolvedAvatar,
              email: u?.email || null,
              instagram_handle: cp?.instagram_handle || null
            });
          }
        });
      } catch (e) {
        console.error("[GET /ugc/briefs/my] Error loading creator info:", e);
      }
    }

    const populatedBriefs = finalBriefs.map((b: any) => {
      const matching = mergedOrders.filter((o: any) => o.brief_id === b.id);
      // Session 24. A brief is complete only when ALL its slots are delivered and paid. It used to
      // flip to COMPLETED as soon as every EXISTING order was done — a 2-slot brief with one
      // finished order closed with the second slot unclaimed (brand saw "Completed · 1/2"), no
      // creator could claim it any more, and that slot's escrow sat with no way back.
      const isOrderDone = (o: any) =>
        ['COMPLETED', 'PAID', 'RELEASED'].includes(String(o.status || '').toUpperCase()) ||
        ['RELEASED', 'PAID'].includes(String(o.payment_status || '').toUpperCase());
      const doneCount = matching.filter(isOrderDone).length;
      const isEveryOrderCompleted = isBriefFullyDelivered(doneCount, b.max_creators);
      const isCompleted = b.status === 'COMPLETED' || isEveryOrderCompleted;
      const statusToReturn = isCompleted ? 'COMPLETED' : b.status;

      if (isCompleted && b.status !== 'COMPLETED') {
        b.status = 'COMPLETED';
        if (supabase) {
          (privilegedSupabase || supabase).from('ugc_briefs').update({ status: 'COMPLETED' }).eq('id', b.id).then().catch(() => {});
        }
        const localBriefRecord = (db.ugc_briefs || []).find((lb: any) => lb.id === b.id);
        if (localBriefRecord) localBriefRecord.status = 'COMPLETED';
      }

      // Populate creator inside matching orders
      const matchingPopulated = matching.map((o: any) => {
        const cr = creatorMap.get(o.creator_id) || (db.users || []).find((u: any) => u.user_id === o.creator_id || u.id === o.creator_id);
        const crName = cr?.name || o.creator_name || "Verified UGC Creator";
        const crAvatar = cr?.avatar || cr?.picture || cr?.photo || o.creator_avatar || null;
        return {
          ...o,
          creator: cr ? { ...cr, name: crName, avatar: crAvatar, picture: crAvatar } : { name: crName, avatar: crAvatar },
          creator_name: crName,
          creator_avatar: crAvatar
        };
      });

      return {
        ...b,
        status: statusToReturn,
        orders: matchingPopulated,
        applications: matchingPopulated.map((o: any) => ({
          creator_id: o.creator_id,
          creator_name: o.creator_name || "Verified UGC Creator",
          creator_avatar: o.creator_avatar || null,
          creator_picture: o.creator_avatar || null,
          creator_username: o.creator?.instagram_handle || null,
          status: o.status,
          order_id: o.id
        }))
      };
    });

    const enriched = await enrichBriefsWithBrandProfiles(populatedBriefs);
    return res.json(enriched);
  });


  router.get("/ugc/briefs/available", async (req, res) => {
    let briefs: any[] = [];
    if (supabase) {
      try {
        const { data, error } = await (privilegedSupabase || supabase)
          .from('ugc_briefs')
          .select('*')
          .eq('status', 'OPEN')
          .order('created_at', { ascending: false });
        if (!error && data) {
          briefs = data;
        }
      } catch (e) {
        console.error("[GET /ugc/briefs/available] Supabase error:", e);
      }
    }

    const db = getDb();
    const localBriefs = (db.ugc_briefs || []).filter((b: any) => (b.status || 'OPEN') === 'OPEN');
    const combinedMap = new Map();
    briefs.forEach((b: any) => combinedMap.set(b.id, b));
    localBriefs.forEach((b: any) => {
      if (!combinedMap.has(b.id)) combinedMap.set(b.id, b);
    });
    const mockBrandNames = new Set(["Test Ravi", "Nexus Brands", "Nexus Brands Inc.", "Urban Kicks Studio", "FitGlow Nutrition"]);
    const finalBriefs = Array.from(combinedMap.values()).filter((b: any) => {
      if (
        // Session 58: exact demo names only — "contains ravi / nexus" hid real paid briefs (e.g. "Gravity", "Ravi Kumar").
        mockBrandNames.has(b.brand_name) ||
        b.id?.startsWith('brief_test_ravi') ||
        b.id?.startsWith('brief_nexus_demo')
      ) {
        return false;
      }
      const maxC = Number(b.max_creators) || 1;
      const claimedC = Number(b.claimed_count) || 0;
      return claimedC < maxC;
    });

    // Priority Explore sorting (§7): relisted briefs (is_priority = true) come FIRST,
    // newest relist first, then regular order (newest created_at first).
    finalBriefs.sort((a: any, b: any) => {
      const aPrio = Boolean(a.is_priority);
      const bPrio = Boolean(b.is_priority);
      if (aPrio && !bPrio) return -1;
      if (!aPrio && bPrio) return 1;
      if (aPrio && bPrio) {
        const aRelist = new Date(a.relisted_at || 0).getTime();
        const bRelist = new Date(b.relisted_at || 0).getTime();
        return bRelist - aRelist;
      }
      const aCreated = new Date(a.created_at || 0).getTime();
      const bCreated = new Date(b.created_at || 0).getTime();
      return bCreated - aCreated;
    });

    const enriched = await enrichBriefsWithBrandProfiles(finalBriefs);
    // Logged-out visitors get the listing only; requirements, references and the rest of the
    // brief are for signed-in users.
    const viewer = await parseAuthUser(req).catch(() => null);
    if (!viewer) return res.json(enriched.map(publicBrief));
    return res.json(enriched.map((b: any) => isBriefOwner(viewer, b) ? b : briefForOutsider(b))); // v378 (QA M1)
  });


  router.get("/ugc/briefs/:id", async (req, res) => {
    const { id } = req.params;
    let brief: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('ugc_briefs').select('*').eq('id', id).maybeSingle();
        if (data) brief = data;
      } catch (e: any) { logIgnored("ugc_routes:1614", e); }
    }
    if (!brief) {
      const db = getDb();
      brief = (db.ugc_briefs || []).find((b: any) => b.id === id);
    }
    if (!brief) return res.status(404).json({ error: "UGC Brief not found" });

    // Session 58 (security): no login → only the public fields (payment order id etc. stayed visible to anyone).
    const viewer = await parseAuthUser(req).catch(() => null);
    const [enriched] = await enrichBriefsWithBrandProfiles([brief]);
    const full = enriched || brief;
    if (!viewer) return res.json(publicBrief(full));
    if (!isBriefOwner(viewer, full)) return res.json(briefForOutsider(full)); // v378 (QA M1): no private fields
    return res.json(full);
  });



  // Session 24: one calculation for the cancel sheet (quote) and the cancel itself, so the
  // amount the brand sees is exactly what the server refunds.
  const computeBriefCancelQuote = async (brief: any) => {
    const id = brief.id;
    let briefOrders: any[] = [];
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('ugc_orders').select('*').eq('brief_id', id);
        if (data) briefOrders = data;
      } catch (e: any) { logIgnored("ugc_routes:briefOrdersCancel", e); }
    }
    const db = getDb();
    const orderMap = new Map();
    briefOrders.forEach((o: any) => orderMap.set(o.id, o));
    (db.ugc_orders || []).filter((o: any) => o.brief_id === id).forEach((lo: any) => {
      orderMap.set(lo.id, orderMap.has(lo.id) ? { ...orderMap.get(lo.id), ...lo } : lo);
    });
    // Working = anything not cancelled / expired (in progress, in review, delivered, completed).
    const workingOrders = Array.from(orderMap.values()).filter((o: any) =>
      !['CANCELLED', 'EXPIRED', 'REFUNDED'].includes(String(o.status || '').toUpperCase())
    );
    const maxCreators = Number(brief.max_creators) || 1;
    // v414: a slot whose money already went back with an ORDER cancel must not be refunded again by the brief cancel.
    //  · old Razorpay order cancels (CANCELLED + REFUNDED, no queue row) freed the slot but kept max_creators → subtract them;
    //  · brand order cancels (ugcref_ord_ / ugcref_exp_ rows) normally lower max_creators — but when that failed the
    //    claim was kept on purpose, so a claim left over on a cancelled order is counted as refunded too.
    let orderRefundIds = new Set<string>();
    (db.ugc_refunds || []).forEach((r: any) => { if (r?.brief_id === id && /^ugcref_(ord|exp)_/.test(String(r.id || ''))) orderRefundIds.add(String(r.id)); });
    if (supabase) {
      try {
        const { data: rr } = await (privilegedSupabase || supabase).from('ugc_refunds').select('id').eq('brief_id', id);
        (rr || []).forEach((r: any) => { if (/^ugcref_(ord|exp)_/.test(String(r.id || ''))) orderRefundIds.add(String(r.id)); });
      } catch (e: any) { logIgnored("ugc_routes:briefCancelOrderRefunds", e); }
    }
    const allOrders = Array.from(orderMap.values());
    const hasOrderRefundRow = (o: any) => orderRefundIds.has(`ugcref_ord_${o.id}`) || orderRefundIds.has(`ugcref_exp_${o.id}`);
    const legacyRefunded = allOrders.filter((o: any) =>
      String(o.status || '').toUpperCase() === 'CANCELLED' &&
      String(o.payment_status || '').toUpperCase() === 'REFUNDED' &&
      String(o.expiry_reason || '').toUpperCase() !== 'BRAND_CANCELLED' &&
      !hasOrderRefundRow(o)
    ).length;
    const queuedOrderRefunds = allOrders.filter(hasOrderRefundRow).length;
    const claimsKept = Math.max(0, (Number(brief.claimed_count) || 0) - workingOrders.length);
    const alreadyRefundedSlots = legacyRefunded + Math.min(queuedOrderRefunds, claimsKept);
    const openSlots = Math.max(0, maxCreators - workingOrders.length - alreadyRefundedSlots);
    const perCreatorBudget = Number(brief.budget) || 0;
    const createdAtMs = new Date(brief.created_at || 0).getTime();
    // v416 (U7): what the refund covers. Cancelling refunds the creator budget of the open slots only; the service fee
    // (+ GST) paid at checkout is not refunded automatically (an admin can refund it by hand — ugcFeeRefunds.ts).
    let serviceFeePaid = 0;
    let brandPaid = 0;
    try {
      let deps: any[] = [];
      if (supabase) {
        const { data: txs } = await (privilegedSupabase || supabase).from('transactions')
          .select('id, brief_id, deal_id, ugc_order_id, gross_amount, brand_paid_amount, brand_fee_amount, brand_fee_gst').eq('brief_id', id);
        deps = (txs || []).filter(isDepositRow);
      }
      if (!deps.length) deps = (db.transactions || []).filter((t: any) => isDepositRow(t) && t.brief_id === id);
      const dep = deps.find((t: any) => Number(t.brand_paid_amount) > 0) || deps[0];
      if (dep) {
        serviceFeePaid = Math.max(0, (Number(dep.brand_fee_amount) || 0) + (Number(dep.brand_fee_gst) || 0));
        brandPaid = Number(dep.brand_paid_amount) > 0 ? Number(dep.brand_paid_amount) : (Number(dep.gross_amount) || 0) + serviceFeePaid;
      }
    } catch (e: any) { logIgnored("ugc_routes:cancelQuoteFee", e); }
    const refundAmount = openSlots * perCreatorBudget;
    return {
      workingOrders, maxCreators, openSlots,
      perCreatorBudget,
      refundAmount,
      canCancelAt: new Date(createdAtMs + 24 * 3600 * 1000).toISOString(),
      breakdown: {
        creator_budget_refund: refundAmount,
        open_slots: openSlots,
        per_slot: perCreatorBudget,
        service_fee_paid: Math.round(serviceFeePaid * 100) / 100,
        service_fee_refunded: 0,
        brand_paid_total: Math.round(brandPaid * 100) / 100,
        fee_note: serviceFeePaid > 0
          ? "The refund covers the creator budget for the open slots. The service fee and GST paid at checkout are not refunded."
          : "The refund covers the creator budget for the open slots.",
      },
    };
  };

  router.get("/ugc/briefs/:id/cancel-quote", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    let brief: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('ugc_briefs').select('*').eq('id', req.params.id).maybeSingle();
        if (data) brief = data;
      } catch (e: any) { logIgnored("ugc_routes:cancelQuote", e); }
    }
    if (!brief) brief = (getDb().ugc_briefs || []).find((b: any) => b.id === req.params.id);
    if (!brief) return res.status(404).json({ error: "UGC Brief not found" });
    if (!ownsBrandRow(user, brief.brand_id) && !isAdmin(user)) return res.status(403).json({ error: "Forbidden" }); // v416 (CR5)
    const q = await computeBriefCancelQuote(brief);
    return res.json({
      ok: true,
      open_slots: q.openSlots,
      working_slots: q.workingOrders.length,
      per_slot: q.perCreatorBudget,
      amount: q.refundAmount,
      can_cancel_at: q.canCancelAt,
      closed: ["CANCELLED", "COMPLETED"].includes(String(brief.status || "").toUpperCase()),
      refund_breakdown: q.breakdown, // v416 (U7): creator budget refunded vs service fee kept
    });
  });

  const briefCancelLocks = new Set<string>();
  const escapeHtml = (v: any) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]);

  // Brand refund destination account management (§8)
  router.get("/brand/refund-account", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    let accountRow: any = null;
    // v416 (CR5): the brand's account first (team members share it), then one saved under the member's own id
    const myIds = brandIdsOf(user);
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase)
          .from('brand_refund_accounts')
          .select('*')
          .in('brand_id', myIds);
        if (Array.isArray(data) && data.length) accountRow = data.find((a: any) => String(a.brand_id) === myIds[0]) || data[0];
      } catch (e: any) { logIgnored("brandRefundAccount:get", e); }
    }
    const db = getDb();
    if (!accountRow && db.brand_refund_accounts) {
      accountRow = db.brand_refund_accounts.find((a: any) => String(a.brand_id) === myIds[0]) || db.brand_refund_accounts.find((a: any) => myIds.includes(String(a.brand_id)));
    }

    return res.json({ ok: true, refund_account: toPublicRefundAccount(accountRow) });
  });

  router.post("/brand/refund-account", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!isBrandLike(user.role)) return res.status(403).json({ error: "Only brands have a refund account." }); // v416 (CR4)

    const parsed = parseRefundAccount(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const nowIso = new Date().toISOString();
    const row: any = {
      ...parsed.row,
      brand_id: actingBrandIdOf(user), // v416 (CR5): saved for the brand, not the team member
      updated_at: nowIso
    };
    const myIds = brandIdsOf(user);

    const db = getDb();
    if (!db.brand_refund_accounts) db.brand_refund_accounts = [];
    const idx = db.brand_refund_accounts.findIndex((a: any) => a.brand_id === row.brand_id);
    if (idx >= 0) {
      row.id = db.brand_refund_accounts[idx].id;
      db.brand_refund_accounts[idx] = { ...db.brand_refund_accounts[idx], ...row };
    } else {
      row.id = `bra_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      row.created_at = nowIso;
      db.brand_refund_accounts.unshift(row);
    }

    if (supabase) {
      const { error } = await (privilegedSupabase || supabase)
        .from('brand_refund_accounts')
        .upsert(row, { onConflict: 'brand_id' });
      if (error) {
        console.error("[POST /brand/refund-account] Supabase error:", error.message);
        return res.status(502).json({ error: "Couldn't save your refund account. Please try again." });
      }
    }

    // A refund the admin marked FAILED (e.g. wrong account) goes back to the queue with the new
    // account, so fixing the details is all the brand has to do (spec §9).
    const snapshot = toAdminRefundSnapshot(row);
    (db.ugc_refunds || []).forEach((r: any) => {
      if (myIds.includes(String(r.brand_id)) && r.status === "FAILED") { r.status = "PENDING"; r.refund_account_snapshot = snapshot; r.failure_reason = null; }
    });
    if (supabase) {
      const { error: reErr } = await (privilegedSupabase || supabase)
        .from('ugc_refunds')
        .update({ status: 'PENDING', refund_account_snapshot: snapshot, failure_reason: null })
        .in('brand_id', myIds)
        .eq('status', 'FAILED');
      if (reErr) console.error("[POST /brand/refund-account] re-queue failed refunds:", reErr.message);
      // Session 58 (bug hunt): refunds queued BEFORE the brand had an account were stored with an empty "missing"
      // account and could never be paid — give them the new account too.
      const { error: missErr } = await (privilegedSupabase || supabase)
        .from('ugc_refunds')
        .update({ refund_account_snapshot: snapshot })
        .in('brand_id', myIds)
        .eq('status', 'PENDING')
        .contains('refund_account_snapshot', { missing: true });
      if (missErr) console.error("[POST /brand/refund-account] attach account to waiting refunds:", missErr.message);
    }
    (db.ugc_refunds || []).forEach((r: any) => {
      if (myIds.includes(String(r.brand_id)) && r.status === "PENDING" && r.refund_account_snapshot?.missing) r.refund_account_snapshot = snapshot;
    });

    saveDb(db);
    return res.json({ ok: true, refund_account: toPublicRefundAccount(row) });
  });


  // Brand cancels a brief -> refund queue (§8)
  router.post("/ugc/briefs/:id/cancel", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    // One cancel per brief at a time: a double tap must not write two refunds.
    if (briefCancelLocks.has(id)) return res.status(409).json({ error: "A cancellation for this brief is already in progress.", code: "CANCEL_IN_PROGRESS" });
    briefCancelLocks.add(id);
    try {
      return await handleBriefCancel(req, res, user, id);
    } finally {
      briefCancelLocks.delete(id);
    }
  });

  const handleBriefCancel = async (req: any, res: any, user: any, id: string) => {
    let brief: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase)
          .from('ugc_briefs')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (data) brief = data;
      } catch (e: any) { logIgnored("ugc_routes:briefCancel", e); }
    }
    const db = getDb();
    if (!brief) {
      brief = (db.ugc_briefs || []).find((b: any) => b.id === id);
    }
    if (!brief) return res.status(404).json({ error: "UGC Brief not found" });

    // WHO check: only brief's brand (or admin)
    if (!ownsBrandRow(user, brief.brand_id) && !isAdmin(user)) { // v416 (CR5)
      return res.status(403).json({ error: "Only the brand that posted this brief can cancel it." });
    }
    if (["CANCELLED", "COMPLETED"].includes(String(brief.status || "").toUpperCase())) {
      return res.status(409).json({ error: "This brief is already closed.", code: "BRIEF_CLOSED" });
    }

    // WHEN check: Not within 24 hours of creating the brief (§8)
    const createdAtMs = new Date(brief.created_at || 0).getTime();
    const ageMs = Date.now() - createdAtMs;
    if (ageMs < 24 * 3600 * 1000) {
      return res.status(409).json({
        error: "You can cancel this brief 24 hours after posting it.",
        code: "CANCEL_WITHIN_24H",
        time_left_ms: Math.max(0, (24 * 3600 * 1000) - ageMs)
      });
    }

    const quote = await computeBriefCancelQuote(brief);
    const { workingOrders, maxCreators, openSlots, refundAmount } = quote;
    if (openSlots <= 0) {
      return res.status(409).json({
        error: "All slots on this brief are currently in progress. Cancellations apply only to open slots. If you need support, please contact helpdesk.",
        code: "NO_OPEN_SLOTS"
      });
    }
    if (refundAmount <= 0) {
      return res.status(409).json({ error: "No refundable amount on open slots.", code: "NO_REFUNDABLE_AMOUNT" });
    }

    // Refund destination account: provided in body or saved brand refund account
    let accountRow: any = null;
    if (req.body?.account_details || req.body?.method_type || req.body?.upi_id || req.body?.bank_account_number) {
      const parsed = parseRefundAccount(req.body);
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      accountRow = { ...parsed.row, brand_id: brief.brand_id, updated_at: new Date().toISOString() };
      // Save it for future use as well
      if (!db.brand_refund_accounts) db.brand_refund_accounts = [];
      const exIdx = db.brand_refund_accounts.findIndex((a: any) => a.brand_id === brief.brand_id);
      if (exIdx >= 0) db.brand_refund_accounts[exIdx] = { ...db.brand_refund_accounts[exIdx], ...accountRow };
      else db.brand_refund_accounts.unshift({ ...accountRow, id: `bra_${crypto.randomUUID()}` });
      const existingId = (db.brand_refund_accounts.find((a: any) => a.brand_id === brief.brand_id) || {}).id;
      if (supabase) {
        const { error: accErr } = await (privilegedSupabase || supabase).from('brand_refund_accounts')
          .upsert({ ...accountRow, id: existingId || `bra_${crypto.randomUUID()}` }, { onConflict: 'brand_id' });
        if (accErr) console.error("[brief cancel] refund account save:", accErr.message);
      }
    } else {
      if (supabase) {
        try {
          const { data: savedAcc } = await (privilegedSupabase || supabase)
            .from('brand_refund_accounts')
            .select('*')
            .eq('brand_id', brief.brand_id)
            .maybeSingle();
          if (savedAcc) accountRow = savedAcc;
        } catch (e: any) { logIgnored("ugc_routes:savedAccLookup", e); }
      }
      if (!accountRow && db.brand_refund_accounts) {
        accountRow = db.brand_refund_accounts.find((a: any) => a.brand_id === brief.brand_id);
      }
    }

    if (!accountRow) {
      return res.status(400).json({
        error: "Please provide a refund account (UPI or Bank account) to receive your refund.",
        code: "REFUND_ACCOUNT_REQUIRED"
      });
    }

    const accountSnapshot = toAdminRefundSnapshot(accountRow);
    const nowIso = new Date().toISOString();
    const refundId = `ugcref_${crypto.randomUUID()}`;

    const refundRow = {
      id: refundId,
      brief_id: brief.id,
      brand_id: brief.brand_id,
      amount: refundAmount,
      slots: openSlots,
      reason: req.body?.reason || "Brand cancelled unused brief slots",
      status: "PENDING",
      refund_account_snapshot: accountSnapshot,
      utr: null,
      failure_reason: null,
      requested_at: nowIso,
      processed_at: null,
      processed_by: null
    };

    // The refund row is the brand's money claim: if the shared table refuses it, stop here —
    // before the brief changes — instead of keeping it only in a local file lost on restart.
    if (supabase) {
      const { error: refErr } = await (privilegedSupabase || supabase).from('ugc_refunds').insert(refundRow);
      if (refErr) {
        console.error("[POST /ugc/briefs/:id/cancel] ugc_refunds insert error:", refErr.message);
        return res.status(502).json({ error: "Couldn't record the refund. Nothing was cancelled — please try again.", code: "REFUND_NOT_SAVED" });
      }
    }
    if (!db.ugc_refunds) db.ugc_refunds = [];
    db.ugc_refunds.unshift(refundRow);

    const newBriefStatus = workingOrders.length === 0 ? "CANCELLED" : "PARTIALLY_CANCELLED";
    const newClaimedCount = workingOrders.length;
    const newMaxCreators = workingOrders.length;

    if (supabase) {
      // Conditional on the slot count we priced, so a parallel claim/cancel can't be refunded twice.
      let q = (privilegedSupabase || supabase)
        .from('ugc_briefs')
        .update({
          status: newBriefStatus,
          claimed_count: newClaimedCount,
          max_creators: newMaxCreators,
          is_priority: false
        })
        .eq('id', brief.id);
      q = brief.max_creators === null || brief.max_creators === undefined ? q.is('max_creators', null) : q.eq('max_creators', brief.max_creators);
      // Session 58 (bug hunt): a claim changes claimed_count, not max_creators — a claim landing mid-cancel slipped
      // through and the same slot was refunded AND paid. Now the claim count must be unchanged too.
      q = brief.claimed_count === null || brief.claimed_count === undefined ? q.is('claimed_count', null) : q.eq('claimed_count', brief.claimed_count);
      const { data: upd, error: bErr } = await q.select('id');
      if (bErr || !upd || upd.length === 0) {
        console.error("[POST /ugc/briefs/:id/cancel] brief update failed:", bErr?.message || "brief changed meanwhile");
        await (privilegedSupabase || supabase).from('ugc_refunds').delete().eq('id', refundId);
        db.ugc_refunds = (db.ugc_refunds || []).filter((r: any) => r.id !== refundId);
        return res.status(409).json({ error: "The brief changed while cancelling. Nothing was cancelled — please try again.", code: "BRIEF_CHANGED" });
      }
    }

    brief.status = newBriefStatus;
    brief.claimed_count = newClaimedCount;
    brief.max_creators = newMaxCreators;
    brief.is_priority = false;

    const locBrief = (db.ugc_briefs || []).find((b: any) => b.id === brief.id);
    if (locBrief) {
      locBrief.status = newBriefStatus;
      locBrief.claimed_count = newClaimedCount;
      locBrief.max_creators = newMaxCreators;
      locBrief.is_priority = false;
    }

    saveDb(db);

    const io = app.get("io");
    if (io) {
      io.to(ADMIN_ROOM).emit("admin_notification", {
        type: "UGC_REFUND_REQUESTED",
        title: "New UGC Brand Refund Due",
        message: `Refund of ₹${Number(refundAmount).toLocaleString("en-IN")} requested for brief "${brief.title || brief.id}" (${openSlots} open slots).`,
        created_at: nowIso
      });
    }

    const last4 = accountSnapshot?.account_last4 || accountSnapshot?.upi_id || "account";
    // v416 (U6): "₹12,000" (en-IN) and "your UPI ID x@y" / "your account ending 1234" — it said "account ending bank"
    return res.json({
      ok: true,
      amount: refundAmount,
      slots: openSlots,
      brief_status: newBriefStatus,
      refund_id: refundId,
      account_last4: last4,
      refund_destination: refundDestinationText(accountSnapshot),
      refund_breakdown: quote.breakdown, // v416 (U7)
      message: `Brief cancelled. Your refund of ₹${Number(refundAmount).toLocaleString("en-IN")} for the creator budget will be sent to ${refundDestinationText(accountSnapshot)} within 1–2 working days.`
    });
  };

  router.get("/ugc/briefs/:id/refund", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    let refund: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase)
          .from('ugc_refunds')
          .select('*')
          .eq('brief_id', id)
          .order('requested_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) refund = data;
      } catch (e: any) { logIgnored("ugc_routes:briefRefundGet", e); }
    }
    const db = getDb();
    if (!refund) {
      refund = (db.ugc_refunds || []).find((r: any) => r.brief_id === id);
    }
    if (!refund) return res.status(404).json({ error: "No refund found for this brief" });

    if (!ownsBrandRow(user, refund.brand_id) && !isAdmin(user)) { // v416 (CR5)
      return res.status(403).json({ error: "Forbidden" });
    }

    const snap = refund.refund_account_snapshot || {};
    return res.json({
      ok: true,
      refund: {
        id: refund.id,
        brief_id: refund.brief_id,
        brand_id: refund.brand_id,
        amount: refund.amount,
        slots: refund.slots,
        status: refund.status,
        utr: refund.utr || null,
        account_last4: snap.account_last4 || snap.upi_id || null,
        method_type: snap.method_type || (snap.upi_id ? "UPI" : "BANK"),
        requested_at: refund.requested_at,
        processed_at: refund.processed_at || null,
        failure_reason: refund.failure_reason || null
      }
    });
  });


  // Admin UGC Refunds Management Endpoints (§9)
  router.get("/admin/ugc-refunds", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || !isAdmin(user)) return res.status(403).json({ error: "Admin access required" });

    let refunds: any[] = [];
    if (supabase) {
      try {
        const { data, error } = await (privilegedSupabase || supabase)
          .from('ugc_refunds')
          .select('*')
          .order('requested_at', { ascending: false });
        if (!error && Array.isArray(data)) refunds = data;
      } catch (e: any) { logIgnored("ugc_routes:adminRefunds", e); }
    }
    const db = getDb();
    const localRefunds = db.ugc_refunds || [];
    const rMap = new Map();
    refunds.forEach((r: any) => rMap.set(r.id, r));
    localRefunds.forEach((lr: any) => {
      if (!rMap.has(lr.id)) rMap.set(lr.id, lr);
      else rMap.set(lr.id, { ...rMap.get(lr.id), ...lr });
    });
    const combinedRefunds = Array.from(rMap.values());

    const enriched = combinedRefunds.map((r: any) => {
      const brief = (db.ugc_briefs || []).find((b: any) => b.id === r.brief_id);
      const brand = (db.users || []).find((u: any) => (u.user_id || u.id) === r.brand_id);
      const bp = (db.brand_profiles || []).find((p: any) => (p.user_id || p.id) === r.brand_id);
      return {
        ...r,
        brief_title: brief?.title || brief?.product_name || "UGC Brief",
        brand_name: bp?.company_name || bp?.brand_name || brand?.name || "Brand Partner",
        brand_email: brand?.email || null,
        brand_phone: brand?.phone || null
      };
    });

    // v366: brand paid / service fee / coupon for each brief, so the admin can see what to refund.
    return res.json(await attachFeeViews(privilegedSupabase || supabase, enriched, db.transactions || []));
  });

  // v366: manual service-fee refund (amount + reason, capped) — lands in this same queue as PENDING.
  registerUgcFeeRefundRoute(router, { parseAuthUser, isAdmin, client: () => privilegedSupabase || supabase, getDb, saveDb });

  router.post("/admin/ugc-refunds/:id/process", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || !isAdmin(user)) return res.status(403).json({ error: "Admin access required" });

    const { id } = req.params;
    const utr = String(req.body?.utr || req.body?.utr_number || "").trim();
    if (!/^[A-Za-z0-9\-]{6,40}$/.test(utr)) {
      return res.status(400).json({ error: "Enter the bank's UTR / reference number (6–40 letters or digits)." });
    }

    const nowIso = new Date().toISOString();
    const db = getDb();
    let refund: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase)
          .from('ugc_refunds')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (data) refund = data;
      } catch (e: any) { logIgnored("ugc_routes:adminProcessRefund", e); }
    }
    if (!refund) {
      refund = (db.ugc_refunds || []).find((r: any) => r.id === id);
    }
    if (!refund) return res.status(404).json({ error: "Refund request not found" });

    if (refund.status !== "PENDING") {
      return res.status(409).json({ error: refund.status === "PROCESSED" ? "This refund has already been marked as processed." : "Only a pending refund can be marked as sent." });
    }
    const snapChk = refund.refund_account_snapshot || {};
    if (!snapChk.upi_id && !snapChk.bank_account_number) {
      return res.status(409).json({ error: "The brand hasn't added a refund account yet — nothing to send to." });
    }

    if (supabase) {
      // Only a PENDING refund can be marked paid (two admins / a double click can't both do it).
      const { data: done, error: upErr } = await (privilegedSupabase || supabase)
        .from('ugc_refunds')
        .update({
          status: 'PROCESSED',
          utr,
          processed_at: nowIso,
          processed_by: user.user_id
        })
        .eq('id', id)
        .eq('status', 'PENDING')
        .select('id');
      if (upErr) return res.status(502).json({ error: "Couldn't save. Please try again." });
      if (!done || done.length === 0) return res.status(409).json({ error: "This refund is not pending any more — refresh the list." });
    }

    refund.status = 'PROCESSED';
    refund.utr = utr;
    refund.processed_at = nowIso;
    refund.processed_by = user.user_id;

    const locR = (db.ugc_refunds || []).find((r: any) => r.id === id);
    if (locR) {
      locR.status = 'PROCESSED';
      locR.utr = utr;
      locR.processed_at = nowIso;
      locR.processed_by = user.user_id;
    }

    // Log admin action (WHO = user.user_id, WHEN = now)
    if (!db.admin_logs) db.admin_logs = [];
    db.admin_logs.unshift({
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      actor_id: user.user_id,
      action: "UGC_REFUND_PROCESSED",
      target_id: refund.id,
      details: `Processed UGC refund of ₹${refund.amount} for brief ${refund.brief_id} with UTR ${utr}`,
      created_at: nowIso
    });
    saveDb(db);

    // Brand "refund sent" notification (§10)
    const brief = (db.ugc_briefs || []).find((b: any) => b.id === refund.brief_id);
    const briefTitle = brief?.title || "your brief";
    const snap = refund.refund_account_snapshot || {};
    const accLast4 = snap.account_last4 || snap.upi_id || "account";

    // v416 (U6): en-IN amount + "UPI ID ab***@bank" instead of "account ending bank"
    const notifMsg = `We've sent ₹${Number(refund.amount || 0).toLocaleString("en-IN")} for "${briefTitle}" to ${refundDestinationText(snap)}. Bank reference (UTR): ${utr}.`;
    const notifPayload = {
      notif_id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      user_id: refund.brand_id,
      type: "UGC_REFUND_SENT",
      title: `✅ ₹${refund.amount} refund sent — UTR ${utr}`,
      message: notifMsg,
      read: false,
      created_at: nowIso
    };
    if (!db.notifications) db.notifications = [];
    db.notifications.unshift(notifPayload);

    if (supabase) {
      try {
        await (privilegedSupabase || supabase).from('notifications').insert(notifPayload);
      } catch (e) { logIgnored("adminProcessRefund:notif", e); }
    }

    const io = app.get("io");
    if (io) {
      io.to(`user_${refund.brand_id}`).emit("new_notification", notifPayload);
      io.to(`user_${refund.brand_id}`).emit("bell_notification", notifPayload);
    }

    // Email to brand via Resend (§10)
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        let brandEmail: string | null = null;
        if (supabase) {
          const { data: u } = await (privilegedSupabase || supabase).from('users').select('email').eq('user_id', refund.brand_id).maybeSingle();
          if (u?.email) brandEmail = u.email;
        }
        if (!brandEmail) {
          const u = (db.users || []).find((x: any) => (x.user_id || x.id) === refund.brand_id);
          brandEmail = u?.email || null;
        }
        if (brandEmail && brandEmail.includes('@') && !brandEmail.endsWith('.demo')) {
          const resend = new Resend(resendKey);
          const fromEmail = process.env.RESEND_FROM_EMAIL || "Ybex <noreply@ybexmedia.in>";
          const html = buildEmailHtml({
            title: `✅ ₹${Number(refund.amount || 0).toLocaleString("en-IN")} refund sent — UTR ${utr}`,
            greeting: "Hello,",
            paragraphs: [
              `We've sent <strong>₹${escapeHtml(Number(refund.amount || 0).toLocaleString("en-IN"))}</strong> for <strong>${escapeHtml(briefTitle)}</strong> to <strong>${escapeHtml(refundDestinationText(snap))}</strong>.`, // v416 (U6)
              `Bank reference (UTR): <strong>${escapeHtml(utr)}</strong>.`
            ]
          });
          await resend.emails.send({
            from: fromEmail,
            to: [brandEmail],
            subject: `₹${Number(refund.amount || 0).toLocaleString("en-IN")} refund sent`, // v419: short (UTR is inside)
            html
          });
        }
      } catch (e: any) {
        console.warn("[adminProcessRefund] Email notification failed:", e?.message || e);
      }
    }

    return res.json({ ok: true, refund });
  });

  router.post("/admin/ugc-refunds/:id/fail", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user || !isAdmin(user)) return res.status(403).json({ error: "Admin access required" });

    const { id } = req.params;
    const reason = String(req.body?.reason || req.body?.failure_reason || "Transfer failed — invalid account details").trim();

    const nowIso = new Date().toISOString();
    const db = getDb();
    let refund: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase)
          .from('ugc_refunds')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (data) refund = data;
      } catch (e: any) { logIgnored("ugc_routes:adminFailRefund", e); }
    }
    if (!refund) {
      refund = (db.ugc_refunds || []).find((r: any) => r.id === id);
    }
    if (!refund) return res.status(404).json({ error: "Refund request not found" });
    if (refund.status !== "PENDING") return res.status(409).json({ error: "Only a pending refund can be marked as failed." });

    if (supabase) {
      const { data: failedRows, error: upErr } = await (privilegedSupabase || supabase)
        .from('ugc_refunds')
        .update({
          status: 'FAILED',
          failure_reason: reason.slice(0, 300)
        })
        .eq('id', id)
        .eq('status', 'PENDING')
        .select('id');
      if (upErr) return res.status(502).json({ error: "Couldn't save. Please try again." });
      // Session 56: another admin may have just marked it sent — don't tell the brand it failed.
      if (!failedRows || failedRows.length === 0) return res.status(409).json({ error: "This refund was just changed by someone else. Refresh and check." });
    }

    refund.status = 'FAILED';
    refund.failure_reason = reason;

    const locR = (db.ugc_refunds || []).find((r: any) => r.id === id);
    if (locR) {
      locR.status = 'FAILED';
      locR.failure_reason = reason;
    }

    if (!db.admin_logs) db.admin_logs = [];
    db.admin_logs.unshift({
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      actor_id: user.user_id,
      action: "UGC_REFUND_FAILED",
      target_id: refund.id,
      details: `Marked UGC refund of ₹${refund.amount} as failed: ${reason}`,
      created_at: nowIso
    });
    saveDb(db);

    const notifPayload = {
      notif_id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      user_id: refund.brand_id,
      type: "UGC_REFUND_FAILED",
      title: "Action Required: Update Refund Account",
      message: `Your refund of ₹${refund.amount} could not be completed: ${reason}. Please update your bank/UPI refund details.`,
      read: false,
      created_at: nowIso
    };
    if (!db.notifications) db.notifications = [];
    db.notifications.unshift(notifPayload);

    if (supabase) {
      try {
        await (privilegedSupabase || supabase).from('notifications').insert(notifPayload);
      } catch (e) { logIgnored("adminFailRefund:notif", e); }
    }

    const io = app.get("io");
    if (io) {
      io.to(`user_${refund.brand_id}`).emit("new_notification", notifPayload);
      io.to(`user_${refund.brand_id}`).emit("bell_notification", notifPayload);
    }

    return res.json({ ok: true, refund });
  });


  router.get("/ugc/orders/brand", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    let orders: any[] = [];
    const myBrandIds = brandIdsOf(user); // v416 (CR5)
    if (supabase) {
      // v416 (CR2): a database error answered 200 [] ("no orders") — now 503 so the page shows retry
      let failed = false;
      try {
        const { data, error } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .in('brand_id', myBrandIds)
          .order('created_at', { ascending: false });
        if (error) failed = true;
        else if (data) orders = data;
      } catch (e: any) { logIgnored("ugc_routes:1640", e); failed = true; }
      if (failed) return res.status(503).json({ error: "Couldn't load your orders. Please try again.", detail: "Couldn't load your orders. Please try again.", code: "ORDERS_LOAD_FAILED" });
    }

    const db = getDb();
    const localOrders = (db.ugc_orders || []).filter((o: any) => myBrandIds.includes(String(o.brand_id)));
    const combinedMap = new Map();
    orders.forEach((o: any) => combinedMap.set(o.id, o));
    localOrders.forEach((o: any) => {
      combinedMap.set(o.id, mergeOrderRecords(combinedMap.get(o.id), o));
    });
    const finalOrders = Array.from(combinedMap.values());

    const refs = await prefetchOrderRefs(finalOrders);
    const limitThreadLoad = makeLimiter(6);
    const populated = await Promise.all(finalOrders.map(async (o: any) => {
      let brief = null;
      if (supabase && o.brief_id) {
        try {
          const b = refs.ready
            ? (refs.briefs.get(o.brief_id) || null)
            : (await (privilegedSupabase || supabase).from('ugc_briefs').select('*').eq('id', o.brief_id).maybeSingle()).data;
          if (b) brief = b;
        } catch (e) { logIgnored("ugc_routes:1663", e); }
      }
      if (!brief) {
        brief = (db.ugc_briefs || []).find((b: any) => b.id === o.brief_id);
      }
      let creator: any = null;
      if (supabase && o.creator_id) {
        try {
          const [uRes, cpRes]: any = refs.ready
            ? [{ data: refs.users.get(o.creator_id) || null }, { data: refs.profiles.get(o.creator_id) || null }]
            : await Promise.all([
                (privilegedSupabase || supabase).from('users').select('user_id, name, picture, email').eq('user_id', o.creator_id).maybeSingle(),
                (privilegedSupabase || supabase).from('creator_profiles').select('user_id, name, picture, photo, avatar_url, instagram_handle').eq('user_id', o.creator_id).maybeSingle()
              ]);
          const u = uRes?.data;
          const cp = cpRes?.data;
          if (u || cp) {
            const resolvedName = u?.name || cp?.name || "Verified UGC Creator";
            const resolvedAvatar = cp?.picture || cp?.photo || cp?.avatar_url || u?.picture || null;
            creator = {
              id: o.creator_id,
              user_id: o.creator_id,
              name: resolvedName,
              full_name: resolvedName,
              avatar: resolvedAvatar,
              picture: resolvedAvatar,
              photo: resolvedAvatar,
              email: u?.email || null,
              instagram_handle: cp?.instagram_handle || null
            };
          }
        } catch(e) {
          console.warn("[ugc/orders/brand] Creator query warning:", e);
        }
      }
      if (!creator) {
        const localUser = (db.users || []).find((u: any) => u.user_id === o.creator_id || u.id === o.creator_id);
        if (localUser) {
          creator = {
            id: localUser.user_id || localUser.id,
            user_id: localUser.user_id || localUser.id,
            name: localUser.name || "Verified UGC Creator",
            avatar: localUser.picture || localUser.avatar || null,
            picture: localUser.picture || localUser.avatar || null,
            email: localUser.email || null
          };
        }
      }

      // Check chat thread + chat timeline so this screen can never disagree with the chat screen
      const { thr, messages: threadMessages } = await limitThreadLoad(() => loadUgcThreadContext(o, db));

      let resolvedRevisionNotes = o.revision_notes || o.revision_feedback || null;
      if (!resolvedRevisionNotes && typeof o.creator_notes === 'string' && o.creator_notes.includes('Revision feedback:')) {
        resolvedRevisionNotes = o.creator_notes.replace(/^Revision feedback:\s*/i, '').trim();
      }
      if (!resolvedRevisionNotes && (thr?.revision_notes || thr?.revision_feedback)) {
        resolvedRevisionNotes = thr.revision_notes || thr.revision_feedback;
      }

      const resolvedLiveLink = o.live_link || (Array.isArray(o.live_links) ? o.live_links[0] : o.live_links) || thr?.live_link || (Array.isArray(thr?.live_links) ? thr?.live_links[0] : thr?.live_links) || null;
      const resolvedDeliverableType = o.deliverable_type || brief?.deliverable_type || 'collaboration_reel';
      const isCollab = o.is_collaboration !== undefined
        ? Boolean(o.is_collaboration)
        : (brief?.is_collaboration !== undefined
          ? Boolean(brief.is_collaboration)
          : isCollaborationDeliverable(resolvedDeliverableType));
      const requiresLiveLink = o.requires_live_link !== undefined
        ? Boolean(o.requires_live_link)
        : (brief?.requires_live_link !== undefined
          ? Boolean(brief.requires_live_link)
          : isCollab);

      // One resolver, shared with /ugc/orders/creator and fed by the chat timeline. The chain
      // that used to sit here recognised 'CONTENT_APPROVED' but not 'AWAITING_LIVE_LINK' — the
      // token the lifecycle actually writes on a draft approval — so a collaboration order that
      // had been approved kept reporting "draft under review" to the brand.
      const resolved = resolveUgcStage({
        order: { ...o, live_link: resolvedLiveLink },
        thread: thr,
        messages: threadMessages,
        requiresLiveLink
      });

      const isCompleted = resolved.isCompleted;
      const activeStatus = resolved.status;
      const isContentApproved = resolved.isContentApproved;
      const brandStage = resolved.brandStage;

      // Keep draft_approved_at in step when the stage came from chat rather than the column.
      // Non-fatal: if the column is absent this write fails and the resolver still works,
      // because it never depended on the column in the first place.
      if (isContentApproved && !o.draft_approved_at && supabase) {
        Promise.resolve(
          (privilegedSupabase || supabase)
            .from('ugc_orders')
            .update({ draft_approved_at: new Date().toISOString() })
            .eq('id', o.id)
        ).catch(() => {});
      }

      return {
        ...o,
        status: activeStatus,
        stage: brandStage,
        live_link: resolvedLiveLink,
        deliverable_type: resolvedDeliverableType,
        is_collaboration: isCollab,
        requires_live_link: requiresLiveLink,
        format_category: isCollab ? 'collaboration' : 'ugc_video',
        flow_state: thr?.flow_state || o.flow_state || (activeStatus === 'CONTENT_APPROVED' ? 'CONTENT_APPROVED' : null),
        thread_status: thr?.status || activeStatus,
        thread_flow_state: thr?.flow_state || activeStatus,
        thread_id: thr?.id || o.thread_id || o.id,
        threadId: thr?.id || o.thread_id || o.id,
        content_approved: isContentApproved,
        isApproved: isContentApproved,
        draft_approved_at: o.draft_approved_at || (isContentApproved ? (thr?.updated_at || new Date().toISOString()) : null),
        brief: brief || { title: "UGC Brief", budget: o.creator_payout || 0, deliverable_type: resolvedDeliverableType },
        creator: creator || { name: "Verified UGC Creator" },
        creator_name: creator?.name || "Verified UGC Creator",
        creator_avatar: creator?.avatar || creator?.picture || null,
        revision_notes: resolvedRevisionNotes,
        revision_feedback: resolvedRevisionNotes,
        revision_notes_links: o.revision_notes_links || thr?.revision_notes_links || resolvedRevisionNotes || null,
        decline_notes_links: o.decline_notes_links || thr?.decline_notes_links || null,
        decline_reason: o.decline_reason || thr?.decline_reason || o.decline_notes_links || thr?.decline_notes_links || null,
        // NOTE: brand_status must stay a raw, underscore-style status token (e.g. 'SUBMITTED',
        // 'REVISION_REQUESTED', 'CONTENT_APPROVED') identical to `status` — the frontend's stage classifier
        // (BrandUGCOrders.jsx / BrandInstantUGC.jsx) matches against these exact tokens.
        brand_status: activeStatus
      };
    }));

    return res.json(populated);
  });


  router.get("/ugc/orders/creator", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const includeCancelled = req.query.include_cancelled === 'true';

    let orders: any[] = [];
    if (supabase) {
      try {
        let query = (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .eq('creator_id', user.user_id)
          .order('created_at', { ascending: false });

        if (!includeCancelled) {
          query = query.neq('status', 'CANCELLED');
        }

        const { data } = await query;
        if (data) orders = data;
      } catch (e: any) { logIgnored("ugc_routes:1821", e); }
    }

    const db = getDb();
    const localOrders = (db.ugc_orders || []).filter((o: any) => {
      if (o.creator_id !== user.user_id) return false;
      if (!includeCancelled) {
        const st = (o.status || o.creator_status || '').toUpperCase();
        if (st === 'CANCELLED' || o.brand_id === 'archived_deleted_brand') return false;
      }
      return true;
    });

    const combinedMap = new Map();
    orders.forEach((o: any) => {
      if (!includeCancelled) {
        const st = (o.status || o.creator_status || '').toUpperCase();
        if (st === 'CANCELLED' || o.brand_id === 'archived_deleted_brand') return;
      }
      combinedMap.set(o.id, o);
    });

    localOrders.forEach((o: any) => {
      combinedMap.set(o.id, mergeOrderRecords(combinedMap.get(o.id), o));
    });
    let finalOrders = Array.from(combinedMap.values());
    if (!includeCancelled) {
      finalOrders = finalOrders.filter((o: any) => {
        const st = (o.status || o.creator_status || '').toUpperCase();
        return st !== 'CANCELLED' && o.brand_id !== 'archived_deleted_brand';
      });
    }

    const refs = await prefetchOrderRefs(finalOrders);
    const limitThreadLoad = makeLimiter(6);
    const populated = await Promise.all(finalOrders.map(async (o: any) => {
      let brief = null;
      if (supabase && o.brief_id) {
        try {
          const b = refs.ready
            ? (refs.briefs.get(o.brief_id) || null)
            : (await (privilegedSupabase || supabase).from('ugc_briefs').select('*').eq('id', o.brief_id).maybeSingle()).data;
          if (b) brief = b;
        } catch (e) { logIgnored("ugc_routes:1865", e); }
      }
      if (!brief) {
        brief = (db.ugc_briefs || []).find((b: any) => b.id === o.brief_id);
      }
      if (brief) {
        const [enrichedBrief] = await enrichBriefsWithBrandProfiles([brief]);
        if (enrichedBrief) brief = enrichedBrief;
      }
      let brand = null;
      if (supabase && o.brand_id) {
        try {
          const { data: br } = await (privilegedSupabase || supabase).from('brand_profiles').select('*').eq('user_id', o.brand_id).maybeSingle();
          if (br) brand = br;
        } catch (e) { logIgnored("ugc_routes:1879", e); }
      }

      // Same thread + chat timeline the brand list reads, so both sides of one order can never
      // report different stages.
      const { thr, messages: threadMessages } = await limitThreadLoad(() => loadUgcThreadContext(o, db));

      let resolvedRevisionNotes = o.revision_notes || o.revision_feedback || null;
      if (!resolvedRevisionNotes && typeof o.creator_notes === 'string' && o.creator_notes.includes('Revision feedback:')) {
        resolvedRevisionNotes = o.creator_notes.replace(/^Revision feedback:\s*/i, '').trim();
      }
      if (!resolvedRevisionNotes && (thr?.revision_notes || thr?.revision_feedback)) {
        resolvedRevisionNotes = thr.revision_notes || thr.revision_feedback;
      }

      const resolvedLiveLink = o.live_link || (Array.isArray(o.live_links) ? o.live_links[0] : o.live_links) || thr?.live_link || (Array.isArray(thr?.live_links) ? thr?.live_links[0] : thr?.live_links) || null;
      const resolvedDeliverableType = o.deliverable_type || brief?.deliverable_type || 'collaboration_reel';
      const isCollab = o.is_collaboration !== undefined
        ? Boolean(o.is_collaboration)
        : (brief?.is_collaboration !== undefined
          ? Boolean(brief.is_collaboration)
          : isCollaborationDeliverable(resolvedDeliverableType));
      const requiresLiveLink = o.requires_live_link !== undefined
        ? Boolean(o.requires_live_link)
        : (brief?.requires_live_link !== undefined
          ? Boolean(brief.requires_live_link)
          : isCollab);

      // Same resolver the brand list uses. Before this, the creator's copy of the chain also
      // had no branch for 'AWAITING_LIVE_LINK', so after the brand approved the draft the
      // creator's Manage Orders never asked for the live post link — the chat did, and nothing
      // else in the app agreed with it.
      const resolved = resolveUgcStage({
        order: { ...o, live_link: resolvedLiveLink },
        thread: thr,
        messages: threadMessages,
        requiresLiveLink
      });

      const isCompleted = resolved.isCompleted;
      const finalStatus = resolved.status;
      const isContentApproved = resolved.isContentApproved;
      const creatorStage = resolved.creatorStage;
      const finalPaymentStatus = isCompleted ? 'RELEASED' : (o.payment_status || 'PENDING');
      const bLogo = brief?.brand_logo || brand?.logo || null;

      if (isContentApproved && !o.draft_approved_at && supabase) {
        Promise.resolve(
          (privilegedSupabase || supabase)
            .from('ugc_orders')
            .update({ draft_approved_at: new Date().toISOString() })
            .eq('id', o.id)
        ).catch(() => {});
      }

      return {
        ...o,
        status: finalStatus,
        payment_status: finalPaymentStatus,
        creator_status: isCompleted ? 'COMPLETED' : finalStatus,
        stage: creatorStage,
        content_approved: isContentApproved,
        isApproved: isContentApproved,
        draft_approved_at: o.draft_approved_at || (isContentApproved ? (thr?.updated_at || new Date().toISOString()) : null),
        live_link: resolvedLiveLink,
        deliverable_type: resolvedDeliverableType,
        is_collaboration: isCollab,
        requires_live_link: requiresLiveLink,
        format_category: isCollab ? 'collaboration' : 'ugc_video',
        thread_status: thr?.status || finalStatus,
        thread_flow_state: thr?.flow_state || finalStatus,
        thread_id: thr?.id || o.thread_id || o.id,
        threadId: thr?.id || o.thread_id || o.id,
        revision_notes: resolvedRevisionNotes,
        revision_feedback: resolvedRevisionNotes,
        revision_notes_links: o.revision_notes_links || thr?.revision_notes_links || resolvedRevisionNotes || null,
        decline_notes_links: o.decline_notes_links || thr?.decline_notes_links || null,
        decline_reason: o.decline_reason || thr?.decline_reason || o.decline_notes_links || thr?.decline_notes_links || null,
        brief: brief || { title: "UGC Brief", budget: o.creator_payout || 0, brand_logo: bLogo },
        brand: brand || { company_name: brief?.brand_name || "Brand Partner", logo: bLogo },
        brand_name: brand?.company_name || brief?.brand_name || "Brand Partner",
        brand_logo: bLogo
      };
    }));

    return res.json(populated);
  });


  router.get(["/ugc/orders/:id", "/ugc/order/:id"], async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    let order: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .or(`id.eq.${safeOrId(id)},brief_id.eq.${safeOrId(id)}`) // v416 (CR25)
          .maybeSingle();
        if (data) order = data;
      } catch (e: any) { logIgnored("ugc_routes:1980", e); }
    }
    const db = getDb();
    const localOrder = (db.ugc_orders || []).find((o: any) => o.id === id || o.brief_id === id);
    if (!order && localOrder) order = localOrder;
    else if (order && localOrder) order = { ...localOrder, ...order };

    if (!order) return res.status(404).json({ error: "Order not found" });
    // The order's brand and creator only. Any signed-in user could read any order, video URL
    // and payout included.
    if (!partyRole(user, null, order)) return ugcForbid(res, 'party');

    let brief = (db.ugc_briefs || []).find((b: any) => b.id === order.brief_id);
    const resolvedDeliverableType = order.deliverable_type || brief?.deliverable_type || 'collaboration_reel';
    const isCollab = order.is_collaboration !== undefined
      ? Boolean(order.is_collaboration)
      : (brief?.is_collaboration !== undefined
        ? Boolean(brief.is_collaboration)
        : isCollaborationDeliverable(resolvedDeliverableType));
    const requiresLiveLink = order.requires_live_link !== undefined
      ? Boolean(order.requires_live_link)
      : (brief?.requires_live_link !== undefined
        ? Boolean(brief.requires_live_link)
        : isCollab);

    // The list routes return the resolved stage; this single-order read did not, so a screen that
    // opened one order derived its own and could disagree with the list.
    let stage: any = null;
    try { stage = resolveUgcStage({ order, thread: null, messages: [], requiresLiveLink } as any); } catch (e: any) { logIgnored("ugc_routes:2008", e); }
    return res.json({
      ...order,
      deliverable_type: resolvedDeliverableType,
      is_collaboration: isCollab,
      requires_live_link: requiresLiveLink,
      format_category: isCollab ? 'collaboration' : 'ugc_video',
      ugc_stage: stage
    });
  });


  const { reserveBriefSlot, finishBriefClaim, releaseBriefSlot } = createUgcSlots({
    getClient: () => privilegedSupabase || supabase,
    getDb,
    saveDb
  });

  // Protected UGC deadline reminders, relist, and expiry cron endpoint (§3)
  const handleCronUgcDeadlines = async (req: express.Request, res: express.Response) => {
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = req.headers["x-cron-secret"];

    if (!cronSecret || typeof headerSecret !== "string") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const bufHeader = Buffer.from(headerSecret);
    const bufSecret = Buffer.from(cronSecret);

    if (bufHeader.length !== bufSecret.length || !crypto.timingSafeEqual(bufHeader, bufSecret)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const results = await runUgcDeadlineChecks({
        supabase,
        privilegedSupabase,
        getDb,
        saveDb,
        releaseBriefSlot,
        app
      });
      return res.json({ ok: true, ...results });
    } catch (err: any) {
      console.error("[POST /internal/cron/ugc-deadlines] execution error:", err);
      return res.status(500).json({ error: err?.message || "Internal server error" });
    }
  };

  // Cloud Scheduler calls POST /api/internal/cron/ugc-deadlines with header x-cron-secret.
  router.post("/internal/cron/ugc-deadlines", handleCronUgcDeadlines);

  const handleUgcBriefClaim = async (req: any, res: any) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required" });

    const { brief_id, signature } = req.body;
    if (!brief_id) return res.status(400).json({ error: "brief_id is required" });

    let brief: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('ugc_briefs').select('*').eq('id', brief_id).maybeSingle();
        if (data) brief = data;
      } catch (e) { logIgnored("ugc_routes:2039", e); }
    }
    const db = getDb();
    if (!brief) {
      brief = (db.ugc_briefs || []).find((b: any) => b.id === brief_id);
    }
    if (!brief) return res.status(404).json({ error: "Brief not found" });

    if (ownsBrandRow(user, brief.brand_id)) { // v416 (CR5)
      return res.status(400).json({ error: "You cannot claim your own brief." });
    }
    // Creators claim; brands do not (a brand could claim another brand's brief as the creator).
    if (String(user.role || '').toLowerCase() !== 'creator') {
      return res.status(403).json({ error: "Only creator accounts can claim UGC briefs." });
    }
    // Session 24 (Ravi): only KYC-approved creators can claim a UGC brief. Checked before the
    // OTP sign token is used and before a slot is reserved. A failed lookup refuses (it is a
    // money commitment) and asks to retry — never lets an unverified creator through.
    {
      const kyc = await getCreatorKycStatus(privilegedSupabase || supabase, db, user.user_id);
      if (kyc === "UNKNOWN") {
        return res.status(503).json({ error: "We couldn't check your KYC right now. Please try again in a moment.", code: 'KYC_CHECK_FAILED' });
      }
      if (kyc !== "APPROVED") {
        return res.status(403).json({
          error: kyc === "PENDING"
            ? "Your KYC is under review. You can claim briefs once it's approved."
            : "Complete your KYC to claim UGC briefs.",
          code: 'KYC_REQUIRED',
          kyc_status: kyc,
        });
      }
    }
    // One claim per creator per brief. A three-slot brief could be claimed three times by the
    // same creator — three payouts for one piece of work.
    {
      let previouslyExpired = (db.ugc_orders || []).some((o: any) =>
        o.brief_id === brief.id && o.creator_id === user.user_id &&
        (String(o.status || '').toUpperCase() === 'EXPIRED' || UGC_NO_RECLAIM_REASONS.includes(o.expiry_reason))
      );
      if (!previouslyExpired && supabase) {
        try {
          const { data: expiredRows } = await (privilegedSupabase || supabase)
            .from('ugc_orders')
            .select('id, status, expiry_reason')
            .eq('brief_id', brief.id)
            .eq('creator_id', user.user_id);
          // Session 58: a CANCELLED order counts too — the database allows one order per brief per creator, so a
          // re-claim after a brand cancel always failed with a generic "Could not claim" error.
          previouslyExpired = (expiredRows || []).some((o: any) =>
            ['EXPIRED', 'CANCELLED'].includes(String(o.status || '').toUpperCase()) || UGC_NO_RECLAIM_REASONS.includes(o.expiry_reason)
          );
        } catch (e: any) { logIgnored("ugc_routes:claimCheckExpired", e); }
      }
      if (previouslyExpired) {
        return res.status(409).json({
          // Covers a missed deadline and a creator who cancelled this brief (session 25).
          error: "You can't claim this brief again — an earlier order of yours on it was cancelled or expired.",
          code: "PREVIOUSLY_EXPIRED"
        });
      }

      let alreadyClaimed = (db.ugc_orders || []).some((o: any) =>
        o.brief_id === brief.id && o.creator_id === user.user_id && String(o.status || '').toUpperCase() !== 'CANCELLED');
      if (!alreadyClaimed && supabase) {
        try {
          const { data: mine } = await (privilegedSupabase || supabase)
            .from('ugc_orders')
            .select('id, status')
            .eq('brief_id', brief.id)
            .eq('creator_id', user.user_id);
          alreadyClaimed = (mine || []).some((o: any) => String(o.status || '').toUpperCase() !== 'CANCELLED');
        } catch (e: any) { logIgnored("ugc_routes:2066", e); }
      }
      if (alreadyClaimed) {
        return res.status(409).json({ error: "You have already claimed this brief.", code: 'ALREADY_CLAIMED' });
      }
    }

    const maxC = Number(brief.max_creators) || 1;
    if (brief.status !== 'OPEN' && brief.status !== 'CLAIMED') {
      return res.status(400).json({ error: "This brief is not open for claims." });
    }
    // Reserve the slot FIRST, atomically. This read the count, checked it, and wrote count+1
    // after the order insert — two creators claiming at once both saw the old count, both
    // passed, and a one-slot brief got two orders (two payouts). The reservation below is a
    // compare-and-set on claimed_count, and it is released again if the order cannot be saved.
    // Claiming signs the creator's side of the agreement (agreement_signed_creator: true), so it
    // needs the verified email OTP like every other signature (backend/signTokens.ts). Checked
    // before the slot is reserved, so a missing code never holds a slot.
    if (user.role !== 'admin' && !(await consumeSignToken(user.user_id, req.body?.sign_token))) {
      return signOtpRequired(res);
    }
    const claimSignMeta = user.role === 'admin' ? null : takeLastSignMeta(user.user_id);
    const slot = await reserveBriefSlot(brief, user.user_id);
    if (!slot.ok) {
      return res.status(slot.status || 400).json({ error: slot.error, code: slot.code });
    }
    const claimedC = slot.previousCount;

    const orderId = `ugcord_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 6)}`;
    const nowIso = getIsoNow();
    const payout = Number(brief.budget) || 1;

    // Detect if this is a Collaboration (requires live link) vs Normal UGC (draft approval only)
    const deliverableType = brief.deliverable_type || brief.format || brief.format_category || (brief.is_raw ? "ugc_video_raw" : (brief.is_collaboration ? "collaboration_reel" : "ugc_video_edited"));
    const isCollab = brief.is_collaboration !== undefined
      ? Boolean(brief.is_collaboration)
      : (brief.requires_live_link !== undefined
        ? Boolean(brief.requires_live_link)
        : isCollaborationDeliverable(deliverableType));
    const requiresLiveLink = brief.requires_live_link !== undefined
      ? Boolean(brief.requires_live_link)
      : isCollab;

    const newOrder = {
      id: orderId,
      brief_id: brief.id,
      brand_id: brief.brand_id,
      creator_id: user.user_id,
      status: 'ACCEPTED',
      deliverable_type: deliverableType,
      is_collaboration: isCollab,
      requires_live_link: requiresLiveLink,
      format_category: isCollab ? 'collaboration' : 'ugc_video',
      creator_payout: payout,
      agreed_amount: payout,
      escrow_amount: payout,
      escrow_hold: true,
      escrow_held_at: nowIso,
      payment_status: 'ESCROW_HELD',
      agreement_signed_creator: true,
      internal_deadline: new Date(Date.now() + normalizeDeliveryHours(brief.delivery_hours, 24) * 3600 * 1000).toISOString(),
      // Session 24 (Ravi): 3 revisions on every UGC order (was 5 here, 2 in the design, 3 on mobile).
      revision_count: UGC_REVISION_LIMIT,
      revisions_used: 0,
      created_at: nowIso
    };

    if (supabase) {
      try {
        const supaPayload = {
          id: orderId,
          brief_id: brief.id,
          brand_id: brief.brand_id,
          creator_id: user.user_id,
          status: 'ACCEPTED',
          creator_payout: payout,
          agreed_amount: payout,
          escrow_amount: payout,
          escrow_hold: true,
          escrow_held_at: nowIso,
          payment_status: 'ESCROW_HELD',
          agreement_signed_creator: true,
          internal_deadline: newOrder.internal_deadline,
          revision_count: UGC_REVISION_LIMIT,
          revisions_used: 0,
          created_at: nowIso,
          // Carried from the brief at claim time. Without these the order has no record of
          // what kind of deliverable it is, and the approval path has to guess — which it
          // did, wrongly, by defaulting to "collaboration" and demanding a live link.
          deliverable_type: deliverableType,
          is_collaboration: isCollab,
          requires_live_link: requiresLiveLink
        };
        const { error: insErr } = await (privilegedSupabase || supabase).from('ugc_orders').insert(supaPayload);
        // A failed insert used to fall through: the order existed only locally and the creator
        // was told the claim succeeded.
        if (insErr) {
          console.error("[POST /ugc/orders/claim] order insert failed:", insErr.message || insErr);
          await releaseBriefSlot(brief.id, user.user_id);
          return res.status(500).json({ error: "Could not claim this brief right now. Please try again." });
        }
      } catch(e) {
        console.error("[POST /ugc/orders/claim] Supabase error:", e);
        await releaseBriefSlot(brief.id, user.user_id);
        return res.status(500).json({ error: "Could not claim this brief right now. Please try again." });
      }
    }

    if (!db.ugc_orders) db.ugc_orders = [];
    db.ugc_orders.unshift(newOrder);

    // If this brief was priority/relisted, clear is_priority now that the slot is claimed (§7)
    if (brief.is_priority) {
      brief.is_priority = false;
      if (supabase) {
        (privilegedSupabase || supabase)
          .from('ugc_briefs')
          .update({ is_priority: false })
          .eq('id', brief.id)
          .then().catch(() => {});
      }
      const locB = (db.ugc_briefs || []).find((b: any) => b.id === brief.id);
      if (locB) locB.is_priority = false;
    }

    saveDb(db);
    finishBriefClaim(brief.id, user.user_id);

    // Session 28: permanent signature record (backend/agreementRecord.ts). Never blocks the claim.
    await recordAgreementSignature(privilegedSupabase || supabase, supabase ? null : db, {
      kind: "ugc", req, user,
      signerRole: user.role === 'admin' ? "admin" : "creator",
      signMeta: claimSignMeta,
      orderId, briefId: brief.id, threadId: orderId,
      amount: payout,
      summary: [`UGC brief: ${brief.id}`, `Order: ${orderId}`, `Brand: ${brief.brand_id || "-"}`],
    });

    // Create dedicated UGC chat thread immediately
    await ensureUGCChatThread(newOrder, brief, user, req.app.get("io"));

    return res.json({ ok: true, order_id: orderId, thread_id: orderId, order: newOrder, message: "Brief successfully claimed!" });
  };
  router.post("/ugc/orders/claim", handleUgcBriefClaim);


  router.post("/ugc/orders/:id/sign", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    const { signature } = req.body;

    // Anyone could call this on any order, and it rewrote status to ACCEPTED — a COMPLETED
    // order went back to the start. Only the order's creator signs, and signing never moves an
    // order that is already past acceptance.
    {
      let target: any = (getDb().ugc_orders || []).find((o: any) => o.id === id) || null;
      if (supabase) {
        try {
          const { data } = await (privilegedSupabase || supabase).from('ugc_orders').select('*').eq('id', id).maybeSingle();
          if (data) target = { ...(target || {}), ...data };
        } catch (e: any) { logIgnored("ugc_routes:2200", e); }
      }
      if (!target) return res.status(404).json({ error: "Order not found" });
      const role = partyRole(user, null, target);
      if (role !== 'creator' && role !== 'admin') return ugcForbid(res, 'creator');
      const st = orderStatus(target);
      if (st && !['ACCEPTED', 'PENDING', 'CLAIMED', 'AWAITING_SIGNATURE'].includes(st)) {
        return res.json({ ok: true, already_signed: true, order_id: id, thread_id: id, message: "Agreement already signed" });
      }
      // Session 58 (bug hunt): signing again restarted the draft timer — a creator could push their deadline back for
      // ever (and restart the free-cancel / brand-wait windows). An order signed once keeps its timer.
      if (target.agreement_signed_creator === true && target.internal_deadline) {
        return res.json({ ok: true, already_signed: true, order_id: id, thread_id: id, message: "Agreement already signed" });
      }
    }

    // The email OTP must have been verified on the server (backend/signTokens.ts).
    if (user.role !== 'admin' && !(await consumeSignToken(user.user_id, req.body?.sign_token))) {
      return signOtpRequired(res);
    }
    const orderSignMeta = user.role === 'admin' ? null : takeLastSignMeta(user.user_id);

    // Session 24 (strict rule): same KYC gate as a claim, and the timer starts at signing.
    {
      const kyc = await getCreatorKycStatus(privilegedSupabase || supabase, getDb(), user.user_id);
      if (user.role !== 'admin' && kyc !== "APPROVED") {
        return res.status(kyc === "UNKNOWN" ? 503 : 403).json({
          error: kyc === "UNKNOWN" ? "We couldn't check your KYC right now. Please try again." : "Complete your KYC to sign and start this order.",
          code: kyc === "UNKNOWN" ? 'KYC_CHECK_FAILED' : 'KYC_REQUIRED',
        });
      }
    }
    const db = getDb();
    const order = (db.ugc_orders || []).find((o: any) => o.id === id);
    let signBriefId = order?.brief_id;
    if (!signBriefId && supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('ugc_orders').select('brief_id').eq('id', id).maybeSingle();
        signBriefId = data?.brief_id;
      } catch (e) { logIgnored("ugc_routes:signBrief", e); }
    }
    let signBrief: any = (db.ugc_briefs || []).find((b: any) => b.id === signBriefId) || null;
    if (!signBrief && signBriefId && supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('ugc_briefs').select('delivery_hours').eq('id', signBriefId).maybeSingle();
        signBrief = data;
      } catch (e) { logIgnored("ugc_routes:signBriefHours", e); }
    }
    const signedDeadline = new Date(Date.now() + normalizeDeliveryHours(signBrief?.delivery_hours, 24) * 3600 * 1000).toISOString();

    if (supabase) {
      try {
        await (privilegedSupabase || supabase).from('ugc_orders').update({
          agreement_signed_creator: true,
          status: 'ACCEPTED',
          internal_deadline: signedDeadline
        }).eq('id', id);
      } catch (e) { logIgnored("ugc_routes:2223", e); }
    }
    if (order) {
      order.agreement_signed_creator = true;
      order.status = 'ACCEPTED';
      order.internal_deadline = signedDeadline;
      saveDb(db);
    }

    // Session 28: permanent signature record (backend/agreementRecord.ts). Never blocks signing.
    await recordAgreementSignature(privilegedSupabase || supabase, supabase ? null : db, {
      kind: "ugc", req, user,
      signerRole: user.role === 'admin' ? "admin" : "creator",
      signMeta: orderSignMeta,
      orderId: id, briefId: signBriefId || null, threadId: id,
      amount: Number(order?.creator_payout || order?.agreed_amount || order?.escrow_amount || 0),
      summary: [`UGC order: ${id}`, `Brief: ${signBriefId || "-"}`],
    });

    // Ensure dedicated chat thread is created on signing
    let fullOrder = order;
    if (!fullOrder && supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('ugc_orders').select('*').eq('id', id).maybeSingle();
        if (data) fullOrder = data;
      } catch (e: any) { logIgnored("ugc_routes:2238", e); }
    }
    if (fullOrder) {
      await ensureUGCChatThread(fullOrder, null, user, req.app.get("io"));
    }

    return res.json({ ok: true, order_id: id, thread_id: id, message: "Agreement signed" });
  });


  router.get("/ugc/earnings", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    let orders: any[] = [];
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .eq('creator_id', user.user_id)
          .eq('status', 'COMPLETED');
        if (data) orders = data;
      } catch (e) { logIgnored("ugc_routes:2262", e); }
    }
    const db = getDb();
    const localOrders = (db.ugc_orders || []).filter((o: any) => o.creator_id === user.user_id && o.status === 'COMPLETED');
    const combinedMap = new Map();
    orders.forEach((o: any) => combinedMap.set(o.id, o));
    localOrders.forEach((o: any) => {
      combinedMap.set(o.id, mergeOrderRecords(combinedMap.get(o.id), o));
    });
    const finalOrders = Array.from(combinedMap.values());

    // The earnings page showed creator_payout (the GROSS order amount) as what the creator
    // earns. The platform fee is taken at release and written to the transaction row — attach
    // those amounts so the page shows the real net. Orders with no release row yet get the
    // same fee calculation the release will use.
    const ids = finalOrders.map((o: any) => o.id).filter(Boolean);
    const txByOrder = new Map<string, any>();
    const isRefundRow = (t: any) => hasRefund(t) || String(t?.status || '').toUpperCase() === 'REFUNDED'; // Session 58: 'NONE' is not a refund
    if (supabase && ids.length) {
      try {
        const { data: txs } = await (privilegedSupabase || supabase)
          .from('transactions')
          .select('ugc_order_id, gross_amount, platform_fee_amount, creator_net_amount, payout_status, refund_amount, refund_status, status')
          .in('ugc_order_id', ids);
        (txs || []).filter((t: any) => !isRefundRow(t) && t.creator_net_amount != null).forEach((t: any) => txByOrder.set(t.ugc_order_id, t));
      } catch (e: any) {
        console.warn("[ugc/earnings] transactions lookup failed:", e?.message || e);
      }
    }
    (db.transactions || [])
      .filter((t: any) => ids.includes(t.ugc_order_id) && !isRefundRow(t) && t.creator_net_amount != null && !txByOrder.has(t.ugc_order_id))
      .forEach((t: any) => txByOrder.set(t.ugc_order_id, t));

    const feeByGross = new Map<number, Promise<any>>(); // one fee lookup per distinct amount
    const withNet = await Promise.all(finalOrders.map(async (o: any) => {
      const gross = Number(o.escrow_amount ?? o.creator_payout ?? o.agreed_amount ?? 0) || 0;
      const tx = txByOrder.get(o.id);
      if (tx) {
        return {
          ...o,
          gross_amount: Number(tx.gross_amount ?? gross) || gross,
          platform_fee_amount: Number(tx.platform_fee_amount) || 0,
          creator_net_amount: Number(tx.creator_net_amount) || 0
        };
      }
      let fee = Math.round(gross * 15) / 100;
      try {
        if (!feeByGross.has(gross)) feeByGross.set(gross, calculatePlatformFee(gross, (privilegedSupabase || supabase)).catch(() => null));
        const calc: any = await feeByGross.get(gross);
        if (calc && calc.creatorNet != null) {
          return { ...o, gross_amount: gross, platform_fee_amount: Number(calc.platformFee) || 0, creator_net_amount: Number(calc.creatorNet) || 0 };
        }
      } catch (e: any) { logIgnored("ugc_routes:2313", e); }
      return { ...o, gross_amount: gross, platform_fee_amount: fee, creator_net_amount: Math.max(0, gross - fee) };
    }));

    await attachEarningsBriefs(withNet); // Session 58: brief title / brand + real approval date
    return res.json(withNet);
  });

  // Session 58 (bug hunt): the earnings page reads `brief.title / brief.brand_name` and an approval date — every row
  // said "UGC Fast Turnaround Order · Brand Partner" with the claim date. Attach the brief and the real approval time.
  async function attachEarningsBriefs(withNet: any[]) {
    const db = getDb();
    const briefIds = [...new Set(withNet.map((o: any) => o.brief_id).filter(Boolean))];
    const briefOf = new Map<string, any>();
    if (supabase && briefIds.length) {
      try {
        const { data: bs } = await (privilegedSupabase || supabase).from('ugc_briefs').select('id, title, product_name, brand_name, deliverable_type, video_duration').in('id', briefIds);
        (bs || []).forEach((b: any) => briefOf.set(String(b.id), b));
      } catch (e) { logIgnored("ugc_routes:earnings-briefs", e); }
    }
    (db.ugc_briefs || []).forEach((b: any) => { if (briefIds.includes(b.id) && !briefOf.has(String(b.id))) briefOf.set(String(b.id), b); });
    withNet.forEach((o: any) => {
      const b = briefOf.get(String(o.brief_id));
      if (!o.brief && b) o.brief = { title: b.title || b.product_name, brand_name: b.brand_name, deliverable_type: b.deliverable_type, video_duration: b.video_duration };
      o.approved_at = o.approved_at || o.escrow_released_at || o.draft_approved_at || null;
    });

  }


  // Session 58: public (no login) — only open briefs, and never internal fields (payment order ids, requirements).
  router.get("/ugc/showcase", async (req, res) => {
    let briefs: any[] = [];
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('ugc_briefs').select('id, title, product_name, brand_name, deliverable_type, budget, max_creators, claimed_count, created_at, status').eq('status', 'OPEN').limit(12);
        if (data) briefs = data;
      } catch (e) { logIgnored("ugc_routes:2328", e); }
    }
    return res.json(briefs.map(({ status: _s, ...b }: any) => b));
  });


  router.get("/admin/ugc/orders", async (req, res) => {
    // There was no authentication here at all: anyone on the internet could list every UGC
    // order. The /admin prefix is not protected by any middleware.
    const adminUser = await parseAuthUser(req);
    if (!adminUser) return res.status(401).json({ error: "Unauthorized" });
    if (!isAdmin(adminUser)) return res.status(403).json({ error: "Admins only" });
    let orders: any[] = [];
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('ugc_orders').select('*').order('created_at', { ascending: false });
        if (data) orders = data;
      } catch (e) { logIgnored("ugc_routes:2349", e); }
    }
    const db = getDb();
    const localOrders = db.ugc_orders || [];
    const combinedMap = new Map();
    orders.forEach((o: any) => combinedMap.set(o.id, o));
    localOrders.forEach((o: any) => {
      combinedMap.set(o.id, mergeOrderRecords(combinedMap.get(o.id), o));
    });
    return res.json(Array.from(combinedMap.values()));
  });


  router.post("/admin/ugc/orders/:id/team-upload", async (req, res) => {
    // Unauthenticated before: anyone could replace any order's video and mark it SUBMITTED.
    const adminUser = await parseAuthUser(req);
    if (!adminUser) return res.status(401).json({ error: "Unauthorized" });
    if (!isAdmin(adminUser)) return res.status(403).json({ error: "Admins only" });
    const { id } = req.params;
    if (!req.body?.videoUrl) return res.status(400).json({ error: "videoUrl is required" });
    const { videoUrl, notes } = req.body;
    const nowIso = getIsoNow();
    if (supabase) {
      try {
        await (privilegedSupabase || supabase).from('ugc_orders').update({
          video_url: videoUrl,
          creator_notes: notes || "Team SLA Upload",
          status: 'SUBMITTED',
          delivered_at: nowIso
        }).eq('id', id);
      } catch (e) { logIgnored("ugc_routes:2379", e); }
    }
    const db = getDb();
    const order = (db.ugc_orders || []).find((o: any) => o.id === id);
    if (order) {
      order.video_url = videoUrl;
      order.creator_notes = notes || "Team SLA Upload";
      order.status = 'SUBMITTED';
      order.delivered_at = nowIso;
      saveDb(db);
    }
    return res.json({ ok: true, message: "Team upload saved" });
  });


  router.get("/ugc-orders", async (req, res) => {
    const viewer = await parseAuthUser(req);
    // PUBLIC PREVIEW. Logged-out visitors see the open briefs (title, brand, budget, format) so
    // the public "Live UGC Orders" page works — it showed "Failed to load UGC Orders" because
    // this answered 401. Nothing else is exposed: no orders, creators or videos. Claiming,
    // posting and every detail stay behind sign-in.
    if (!viewer) {
      let open: any[] = [];
      if (supabase) {
        try {
          const { data } = await (privilegedSupabase || supabase).from('ugc_briefs').select('*').eq('status', 'OPEN').order('created_at', { ascending: false }).limit(100);
          if (data) open = data;
        } catch (e: any) { logIgnored("ugc_routes:2405", e); }
      }
      const localOpen = (getDb().ugc_briefs || []).filter((b: any) => (b.status || 'OPEN') === 'OPEN');
      localOpen.forEach((b: any) => { if (!open.some((x: any) => x.id === b.id)) open.push(b); });
      open = open.filter((b: any) => (Number(b.claimed_count) || 0) < (Number(b.max_creators) || 1));
      return res.json(open.map(publicBrief));
    }

    const db = getDb();
    let briefs: any[] = [];
    let orders: any[] = [];
    let brands: any[] = [];
    let creators: any[] = [];

    if (supabase) {
      try {
        const [rawBriefs, rawOrders, rawBrands, rawCreators] = await Promise.all([
          (privilegedSupabase || supabase).from('ugc_briefs').select('*'),
          (privilegedSupabase || supabase).from('ugc_orders').select('*'),
          (privilegedSupabase || supabase).from('brand_profiles').select('*'),
          (privilegedSupabase || supabase).from('users').select('user_id, name').eq('role', 'creator')
        ]);
        if (rawBriefs.data) briefs = rawBriefs.data;
        if (rawOrders.data) orders = rawOrders.data;
        if (rawBrands.data) brands = rawBrands.data;
        if (rawCreators.data) creators = rawCreators.data;
      } catch (e: any) {
        console.warn("[ugc-orders] Supabase fetch error:", e);
      }
    }

    // Merge with local db briefs
    const briefMap = new Map(briefs.map((b: any) => [b.id, b]));
    (db.ugc_briefs || []).forEach((lb: any) => {
      if (!briefMap.has(lb.id)) {
        briefMap.set(lb.id, lb);
        briefs.push(lb);
      }
    });

    // Map orders by brief_id and id, prioritizing newest and local updates
    const orderMap = new Map<string, any>();
    orders.forEach((o: any) => {
      if (o.brief_id) orderMap.set(o.brief_id, o);
      if (o.id) orderMap.set(o.id, o);
    });
    (db.ugc_orders || []).forEach((lo: any) => {
      if (lo.brief_id) {
        const existing = orderMap.get(lo.brief_id);
        orderMap.set(lo.brief_id, existing ? { ...existing, ...lo } : lo);
      }
      if (lo.id) {
        const existing = orderMap.get(lo.id);
        orderMap.set(lo.id, existing ? { ...existing, ...lo } : lo);
      }
    });

    const brandMap = new Map(brands.map((b: any) => [b.user_id, b]));
    const creatorMap = new Map(creators.map((c: any) => [c.user_id, c.name]));
    const viewerBrand = viewer.parent_brand_id || viewer.user_id;
    const canSeeVideo = (brief: any, order: any) =>
      isAdmin(viewer) || brief?.brand_id === viewerBrand || ownsBrandRow(viewer, brief?.brand_id) || (order && order.creator_id === viewer.user_id); // v417: acting brand ids

    // Session 58: a signed-in user saw EVERY brief in every status (full requirements) and other creators' names.
    // Now: open briefs, plus the viewer's own briefs / orders (admins see all). For a creator, their own order on a
    // brief is the one shown (a multi-slot brief used to show a random creator's order).
    const myOrderByBrief = new Map<string, any>();
    orders.concat(db.ugc_orders || []).forEach((o: any) => { if (o?.brief_id && o.creator_id === viewer.user_id) myOrderByBrief.set(o.brief_id, { ...(myOrderByBrief.get(o.brief_id) || {}), ...o }); });
    const visibleBriefs = briefs.filter((b: any) => isAdmin(viewer) || ownsBrandRow(viewer, b.brand_id) /* v417 */ || b.brand_id === viewerBrand || myOrderByBrief.has(b.id) || String(b.status || 'OPEN').toUpperCase() === 'OPEN');
    const processed = visibleBriefs.map((brief: any) => {
      const order = (myOrderByBrief.get(brief.id) || (isAdmin(viewer) || brief.brand_id === viewerBrand || ownsBrandRow(viewer, brief.brand_id) /* v417 */ ? orderMap.get(brief.id) : null)) as any;
      const brand = brandMap.get(brief.brand_id) as any;
      const creatorName = order ? (creatorMap.get(order.creator_id) || order.accepted_by_creator_name) : null;
      
      const rawStatus = order?.status || "Open";
      const normalizedStatus = order
        ? (order.in_house_assigned && (rawStatus === 'IN_HOUSE_ASSIGNED' || rawStatus === 'in_house_backup')
            ? 'in_house_backup'
            : rawStatus.toLowerCase())
        : "open";

      return {
        order_id: brief.id,
        brief_id: brief.id,
        brand_user_id: brief.brand_id,
        brand_name: brand?.company_name || brief.brand_name || "Unknown Brand",
        brand_logo: brand?.logo_url || null,
        product_name: brief.product_name || brief.title || "UGC Product",
        instructions: brief.detailed_requirements || brief.product_description || "",
        category: brief.deliverable_type || "Fashion",
        video_length: brief.video_duration || "30s",
        ref_link: brief.sample_content_url || null,
        budget: brief.budget || 0,
        amount: brief.budget || 0,
        creator_name: creatorName || "Unknown Creator",
        accepted_by_creator_id: order?.creator_id || order?.accepted_by_creator_id || null,
        accepted_by_creator_name: creatorName || "Vetted Creator",
        // Delivered videos go to the order's own brand, its creator and admins. Every signed-in
        // user used to receive every brand's delivered (unwatermarked) video URL here.
        submitted_video_url: canSeeVideo(brief, order) ? (order?.video_url || null) : null,
        video_url: canSeeVideo(brief, order) ? (order?.video_url || null) : null,
        status: normalizedStatus,
        raw_status: rawStatus,
        in_house_assigned: !!order?.in_house_assigned,
        date: brief.created_at || new Date().toISOString(),
        content_type: brief.content_type || brief.deliverable_type || "Video",
        title: brief.title || brief.product_name || "UGC Campaign"
      };
    });
    return res.json(processed);
  });


  router.post("/ugc-orders/:orderId/accept", async (req, res) => {
    const viewer = await parseAuthUser(req);
    // Legacy second claim path. It accepted anonymous callers and brands, with none of the
    // claim rules. Now: signed-in creators (or admins) only, and never over someone else's order.
    if (!viewer) return res.status(401).json({ error: "Sign in as a creator to accept this order." });
    if (!['creator', 'admin'].includes(String(viewer.role || '').toLowerCase())) {
      return res.status(403).json({ error: "Only creator accounts can accept UGC orders." });
    }
    const { orderId } = req.params;
    const nowIso = getIsoNow();

    const db = getDb();
    let order: any = (db.ugc_orders || []).find((o: any) => o.id === orderId || o.brief_id === orderId);
    if (order && order.creator_id && order.creator_id !== viewer.user_id && !isAdmin(viewer)) {
      return res.status(409).json({ error: "This order has already been claimed by another creator." });
    }
    if (order && isUgcOrderClosed(order)) {
      return res.status(409).json({ error: "This order is already closed." });
    }
    let brief: any = (db.ugc_briefs || []).find((b: any) => b.id === orderId || (order && b.id === order.brief_id));

    if (supabase) {
      try {
        if (!order) {
          const { data: supaOrder } = await (privilegedSupabase || supabase)
            .from('ugc_orders')
            .select('*')
            .or(`id.eq.${safeOrId(orderId)},brief_id.eq.${safeOrId(orderId)}`) // v416 (CR25)
            .maybeSingle();
          if (supaOrder) order = supaOrder;
        }
        if (!brief) {
          const targetBriefId = order?.brief_id || orderId;
          const { data: supaBrief } = await (privilegedSupabase || supabase)
            .from('ugc_briefs')
            .select('*')
            .eq('id', targetBriefId)
            .maybeSingle();
          if (supaBrief) brief = supaBrief;
        }
      } catch (e) {
        console.warn("[POST /ugc-orders/:orderId/accept] Supabase lookup error:", e);
      }
    }

    // A brief with no order yet is a claim: send it through the one claim path, which applies
    // every rule (creators only, one per creator, capacity, atomic slot). This route used to
    // create the order itself and skip all of them.
    if (!order && brief) {
      req.body = { ...(req.body || {}), brief_id: brief.id };
      return handleUgcBriefClaim(req, res);
    }
    // Neither exists: this used to invent a ₹50,000 order under a placeholder brand.
    if (!order) {
      return res.status(404).json({ error: "This order or brief no longer exists." });
    }

    const candidateCreatorId = viewer?.user_id;
    const briefBrandId = brief?.brand_id || order?.brand_id;
    if (!candidateCreatorId || candidateCreatorId === briefBrandId) {
      return res.status(400).json({ error: "You cannot accept your own order." });
    }
    const assignedCreatorId = candidateCreatorId;
    const creatorName = viewer?.name || 'Creator';

    // Already this creator's order: nothing to accept. Re-running the update below used to put
    // a delivered or in-review order back to ACCEPTED.
    if (order.creator_id && order.creator_id === assignedCreatorId) {
      return res.json({ ok: true, success: true, order_id: order.id, brief_id: order.brief_id, status: order.status, order, message: "This order is already yours." });
    }

    // Session 24 (Ravi, strict rule): a creator gets an order ONLY by claiming + signing with OTP,
    // and the timer starts at that moment. This legacy path used to hand over an unassigned order
    // with agreement_signed_creator = true, no OTP, no KYC check and no deadline.
    if (order && !isAdmin(viewer)) {
      return res.status(409).json({
        error: "Claim this brief from Explore — you'll sign the agreement with an OTP and your timer starts then.",
        code: "CLAIM_WITH_SIGNATURE",
      });
    }

    if (order) {
      // An unassigned order: this creator takes it.
      if (supabase) {
        try {
          await (privilegedSupabase || supabase).from('ugc_orders').update({
            creator_id: assignedCreatorId,
            status: 'ACCEPTED',
            agreement_signed_creator: true
          }).eq('id', order.id).is('creator_id', null); // only if still unassigned
        } catch (e) {
          console.warn("[POST /ugc-orders/:orderId/accept] Supabase update error:", e);
        }
      }

      order.creator_id = assignedCreatorId;
      order.status = 'ACCEPTED';
      order.in_house_assigned = true;
      order.agreement_signed_creator = true;
      order.accepted_at = nowIso;
      order.accepted_by_creator_id = viewer?.user_id || assignedCreatorId;
      order.accepted_by_creator_name = creatorName;

      // Update local db
      if (!db.ugc_orders) db.ugc_orders = [];
      const locIdx = db.ugc_orders.findIndex((o: any) => o.id === order.id || o.brief_id === order.brief_id);
      if (locIdx >= 0) {
        db.ugc_orders[locIdx] = { ...db.ugc_orders[locIdx], ...order };
      } else {
        db.ugc_orders.unshift(order);
      }
      saveDb(db);
    }

    return res.json({
      ok: true,
      success: true,
      order_id: order?.id || orderId,
      brief_id: brief?.id || order?.brief_id || orderId,
      status: 'ACCEPTED',
      in_house_assigned: true,
      order,
      message: "Order claimed/accepted for in-house handling"
    });
  });


  // v414: POST /ugc-orders/:orderId/submit moved to setupUgcOrderRoutes — it runs the normal deliverable submit
  // (lifecycle, chat message, brand notice, closed / expired guards) instead of writing the row directly.

}
