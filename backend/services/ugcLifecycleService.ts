import { hasRefund } from "../refundFlags";
import { isBriefFullyDelivered } from "../ugcTerms";
import { logIgnored } from "../logIgnored";
import { feeAtPaymentTime } from "../stampedFee";
import { UGC_REVISION_LIMIT } from "../ugcTerms";
import { REVISION_LIMIT_MESSAGE } from "../campaignGuards"; // v417
import { emitThreadEvent } from "../socketAccess";
import crypto from "crypto";
import { isCampaignThread, getCampaignDealId } from "../dealFlow";
import { isUgcOrderRefunded, hasUgcDeliverable, UGC_CLOSED, isUgcOrderClosed } from "../ugcGuards";
// v414: submit only writes while the order is open (see the ugc_orders write below).
const SUBMIT_CLOSED_STATUSES = UGC_CLOSED;
const isSubmitClosedRow = (row: any) => isUgcOrderClosed(row) || Boolean(row?.cancelled_at);
import { createUgcSlots } from "../ugcSlots";
import { refundUgcOrder, refundMessageLine, type RefundOutcome } from "../refunds";
import { getRazorpay } from "../helpers";
import { resolveTestMode } from "../paymentTestMode";
import { calculateFee as calculatePlatformFee } from "../../src/utils/feeCalculator";

export interface SyncUgcLifecycleOptions {
  rawId: string;
  action:
    | 'SUBMIT_DELIVERABLE'
    | 'SUBMIT_LIVE_LINK'
    | 'REQUEST_REVISION'
    | 'REQUEST_LIVE_LINK_REVISION'
    | 'APPROVE'
    | 'APPROVE_DRAFT'
    | 'DECLINE_REVISION'
    | 'DECLINE_LIVE_LINKS_RESUBMIT'
    | 'CANCEL';
  actorUser: any;
  notes?: string;
  videoUrl?: string;
  io?: any;
  isLiveLinkRevision?: boolean;
  isLiveLinkApproval?: boolean;
}

export interface UgcLifecycleServiceDeps {
  supabase: any;
  privilegedSupabase: any;
  getDb: () => any;
  saveDb: (db: any) => void;
  getIsoNow: () => string;
  ensureUGCChatThread: (order: any, briefInput?: any, actorUser?: any, ioInstance?: any) => Promise<any>;
  insertChatMessageToSupabase: (payload: any) => Promise<any>;
  broadcastAdminNotification?: (n: { type: string; message: string; metadata?: any; actor_id?: string; title?: string }) => Promise<any>;
}

export function createUgcLifecycleService({
  supabase,
  privilegedSupabase,
  getDb,
  saveDb,
  getIsoNow,
  ensureUGCChatThread,
  insertChatMessageToSupabase,
  broadcastAdminNotification,
}: UgcLifecycleServiceDeps) {
  const { releaseBriefSlot } = createUgcSlots({ getClient: () => privilegedSupabase || supabase, getDb, saveDb });
  return async function syncUgcLifecycleEvent({
    rawId,
    action,
    actorUser,
    notes = "",
    videoUrl = "",
    io,
    isLiveLinkRevision = false,
    isLiveLinkApproval = false,
  }: SyncUgcLifecycleOptions) {
    const nowIso = getIsoNow();
    const db = getDb();
    const cleanNotes = (notes || "").trim();
    const cleanVideoUrl = (videoUrl || "").trim();

    // 1. Resolve UGC Order & Chat Thread
    let order: any = null;
    let thread: any = null;

    if (supabase) {
      try {
        const { data: o1 } = await (privilegedSupabase || supabase)
          .from('ugc_orders')
          .select('*')
          .or(`id.eq.${rawId},brief_id.eq.${rawId}`)
          .maybeSingle();
        if (o1) order = o1;
      } catch (e: any) { logIgnored("ugcLifecycleService:80", e); }

      try {
        const { data: thr } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(`id.eq.${rawId},deal_id.eq.${rawId}`)
          .maybeSingle();
        if (thr) {
          thread = thr;
          if (!order && thr.deal_id) {
            const { data: o2 } = await (privilegedSupabase || supabase)
              .from('ugc_orders')
              .select('*')
              .eq('id', thr.deal_id)
              .maybeSingle();
            if (o2) order = o2;
          }
        }
      } catch (e: any) { logIgnored("ugcLifecycleService:99", e); }
    }

    const localOrderRecord = (db.ugc_orders || []).find((o: any) => o.id === rawId || o.brief_id === rawId);
    if (!order && localOrderRecord) {
      order = localOrderRecord;
    } else if (order && localOrderRecord) {
      order = { ...localOrderRecord, ...order };
    }

    if (!thread && db.chat_threads) {
      thread = db.chat_threads.find((t: any) => t.id === rawId || t.deal_id === rawId);
    }
    if (!order && thread) {
      order = (db.ugc_orders || []).find((o: any) => o.id === thread.deal_id || o.id === thread.id);
    }
    if (!thread && order) {
      thread = (db.chat_threads || []).find((t: any) => t.id === order.id || t.deal_id === order.id);
    }

    // Ensure thread exists if order exists
    if (!thread && order) {
      try {
        thread = await ensureUGCChatThread(order, null, actorUser, io);
      } catch (e) {
        console.warn("[syncUgcLifecycleEvent] ensureUGCChatThread error:", e);
      }
    }

    const isUuid = (val: any) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    const targetOrderId = order?.id || thread?.deal_id || rawId;
    const targetThreadId = thread?.id || order?.id || rawId;
    const creatorId = order?.creator_id || thread?.creator_id || (actorUser?.role === 'creator' ? actorUser?.user_id : null);
    const brandId = order?.brand_id || thread?.brand_id || (actorUser?.role === 'brand' ? actorUser?.user_id : null);
    const targetDealId = thread?.deal_id || (isUuid(targetOrderId) ? targetOrderId : null) || (isUuid(rawId) ? rawId : null);
    const subDealId = targetDealId || targetOrderId || thread?.deal_id || rawId;

    const briefId = order?.brief_id || thread?.ugc_brief_id;
    let brief = (db.ugc_briefs || []).find((b: any) => b.id === briefId);
    if (!brief && supabase && briefId) {
      try {
        const { data: b } = await (privilegedSupabase || supabase)
          .from('ugc_briefs')
          .select('*')
          .eq('id', briefId)
          .maybeSingle();
        if (b) brief = b;
      } catch (e: any) { logIgnored("ugcLifecycleService:146", e); }
    }

    const isUgc = Boolean(
      order ||
      localOrderRecord ||
      thread?.is_ugc ||
      thread?.type === 'ugc' ||
      thread?.deal_type === 'UGC' ||
      String(rawId).startsWith('ugcord_') ||
      String(rawId).startsWith('thread_ugc_') ||
      String(thread?.id).startsWith('ugcord_') ||
      String(thread?.id).startsWith('thread_ugc_') ||
      String(thread?.deal_id).startsWith('ugcord_')
    );

    const actorRole = actorUser?.role || (actorUser?.user_id === brandId ? 'brand' : 'creator');
    const actorName = actorUser?.name || (actorRole === 'brand' ? 'Brand' : 'Creator');
    const receiverId = (actorRole === 'brand' ? creatorId : brandId) || '';
    const receiverRole = (actorRole === 'brand' ? 'creator' : 'brand');

    let orderStatus = '';
    let threadStatus = '';
    let orderUpdates: any = { updated_at: nowIso };
    let threadUpdates: any = { updated_at: nowIso };
    let msgType = '';
    let refundOutcome: RefundOutcome | null = null; // set by CANCEL
    let msgText = '';
    let msgMetadata: any = {};
    let notifType = '';
    let notifTitle = '';
    let notifMessage = '';
    let notifLink = (receiverRole === 'brand' ? '/brand/ugc/orders' : '/creator/ugc/orders');

    // Pre-action guards
    if (action === 'CANCEL') {
      const isCompleted = order?.status === 'COMPLETED' || order?.brand_status === 'COMPLETED' || order?.creator_status === 'COMPLETED';
      if (isCompleted) {
        return {
          error: "Cannot cancel an already completed order",
          _status: 400,
          status: 'COMPLETED'
        };
      }
    }

    // Money guards that must hold on EVERY path into APPROVE (order page, chat, legacy aliases):
    // a cancelled/refunded order is never paid out, and nothing is paid before a delivery.
    if (action === 'APPROVE' && order && isUgcOrderRefunded(order)) {
      return { error: "This order was cancelled and refunded, so it cannot be approved.", code: 'ORDER_CANCELLED', _status: 409 };
    }
    // v414: an expired order (relisted, money back on the brief) is never paid out either.
    if ((action === 'APPROVE' || action === 'APPROVE_DRAFT') && order && String(order.status || '').toUpperCase() === 'EXPIRED') {
      return { error: "This order expired, so it cannot be approved.", code: 'ORDER_EXPIRED', _status: 409 };
    }
    if (action === 'APPROVE' && order && String(order.status || '').toUpperCase() !== 'COMPLETED' && !hasUgcDeliverable(order)) {
      return { error: "The creator has not delivered anything for this order yet.", code: 'NOTHING_DELIVERED', _status: 409 };
    }
    // A second cancel must not write a second refund row.
    if (action === 'CANCEL' && order && isUgcOrderRefunded(order)) {
      return { already_cancelled: true, status: 'CANCELLED', message: "This order was already cancelled." };
    }

    // APPROVE must be idempotent
    if (action === 'APPROVE') {
      const alreadyApproved =
        String(order?.status || '').toUpperCase() === 'COMPLETED' ||
        String(order?.brand_status || '').toUpperCase() === 'COMPLETED' ||
        ['RELEASED', 'PAID'].includes(String(order?.payment_status || '').toUpperCase());
      if (alreadyApproved) {
        return {
          already_approved: true,
          status: 'COMPLETED',
          payment_status: order?.payment_status || 'RELEASED',
          order_id: order?.id || targetOrderId,
          message: "This order was already approved — payout is in progress."
        };
      }
    }

    let currentUsed = 0;
    let maxRevisions = UGC_REVISION_LIMIT;
    // Session 58: live-link corrections count too — they had no limit and reset revisions_used to 1 each time.
    if (action === 'REQUEST_REVISION' || action === 'REQUEST_LIVE_LINK_REVISION') {
      currentUsed = Math.max(Number(order?.revisions_used || 0), Number(localOrderRecord?.revisions_used || 0));
      // Orders keep the limit they were signed with; a missing value is the current rule (3).
      maxRevisions = Number(order?.revision_count || localOrderRecord?.revision_count || UGC_REVISION_LIMIT);
      if (currentUsed >= maxRevisions) {
        return {
          // v415: cancel is refused after delivery, so don't suggest it
          error: REVISION_LIMIT_MESSAGE, // v417: point to Support from the deal menu
          detail: REVISION_LIMIT_MESSAGE,
          code: "REVISION_LIMIT",
          _status: 400,
          revisions_used: currentUsed,
          revision_count: maxRevisions
        };
      }
    }

    switch (action) {
      case 'SUBMIT_DELIVERABLE': {
        orderStatus = 'SUBMITTED';
        threadStatus = 'ACTIVE';
        orderUpdates = {
          ...orderUpdates,
          video_url: cleanVideoUrl,
          creator_notes: cleanNotes,
          status: 'SUBMITTED',
          delivered_at: nowIso
        };
        threadUpdates = {
          ...threadUpdates,
          status: 'ACTIVE',
          flow_state: 'SUBMITTED',
          submitted_video_url: cleanVideoUrl,
          revision_notes: null,
          revision_feedback: null
        };
        msgType = 'content_proof_submitted';
        msgText = `🎥 ${isUgc ? 'UGC' : 'Campaign'} Deliverable Draft Submitted for Review!\n\nDeliverable URL: ${cleanVideoUrl}${cleanNotes ? `\n\nNotes: ${cleanNotes}` : ''}`;
        msgMetadata = {
          video_url: cleanVideoUrl,
          content_url: cleanVideoUrl,
          media_url: cleanVideoUrl,
          notes: cleanNotes,
          feedback: cleanNotes,
          action: 'deliverable_submitted'
        };
        notifType = isUgc ? 'ugc_deliverable_submitted' : 'deal_deliverable_submitted';
        notifTitle = isUgc ? 'UGC Deliverable Submitted' : 'Campaign Deliverable Submitted';
        notifMessage = `🎥 Deliverable submitted! Creator has uploaded ${isUgc ? 'UGC' : 'campaign'} content for your review.`;
        notifLink = isUgc ? '/brand/ugc/orders' : `/messages/${targetThreadId}`;
        break;
      }

      case 'SUBMIT_LIVE_LINK': {
        orderStatus = 'LINKS_UNDER_REVIEW';
        threadStatus = 'ACTIVE';
        orderUpdates = {
          ...orderUpdates,
          status: 'LINKS_UNDER_REVIEW',
          stage: 'LIVE_LINK_SUBMITTED',
          live_link: cleanVideoUrl,
          live_links_submitted: true,
          creator_notes: cleanNotes || undefined,
          live_link_submitted_at: nowIso,
          delivered_at: order?.delivered_at || nowIso,
          revision_notes_links: null,
          revision_feedback: null
        };
        threadUpdates = {
          ...threadUpdates,
          status: 'ACTIVE',
          flow_state: 'PROOF_SUBMITTED',
          live_links_submitted: true,
          live_link: cleanVideoUrl,
          revision_notes: null,
          revision_feedback: null,
          revision_notes_links: null,
          decline_notes_links: null
        };
        msgType = 'live_links_submitted';
        msgText = `🚀 Live Post Link Submitted!\n\nLink: ${cleanVideoUrl}${cleanNotes ? `\n\nNotes: ${cleanNotes}` : ''}`;
        msgMetadata = {
          action: 'live_link_submitted',
          status: 'PROOF_SUBMITTED',
          link: cleanVideoUrl,
          links: [cleanVideoUrl],
          video_url: cleanVideoUrl,
          notes: cleanNotes || undefined,
          feedback: cleanNotes || undefined,
          sender_role: 'creator',
          sender_id: actorUser?.user_id || actorUser?.id,
          creator_id: actorUser?.user_id || actorUser?.id
        };
        notifType = isUgc ? 'ugc_live_link_submitted' : 'deal_live_links_submitted';
        notifTitle = 'Live Link Submitted! 🚀';
        notifMessage = `🚀 Live link submitted! Creator has published the content and submitted the live post URL.`;
        notifLink = isUgc ? '/brand/ugc/orders' : `/messages/${targetThreadId}`;
        break;
      }

      case 'REQUEST_LIVE_LINK_REVISION':
      case 'REQUEST_REVISION': {
        const isCollab = order?.is_collaboration !== undefined
          ? Boolean(order.is_collaboration)
          : (order?.requires_live_link !== undefined
            ? Boolean(order.requires_live_link)
            : (brief?.is_collaboration !== undefined
              ? Boolean(brief.is_collaboration)
              : (brief?.requires_live_link !== undefined
                ? Boolean(brief.requires_live_link)
                : false)));

        const isLiveLinkRev = action === 'REQUEST_LIVE_LINK_REVISION' ||
          Boolean(isLiveLinkRevision) ||
          Boolean(
            (isCollab || order?.live_link || thread?.live_links_submitted) && (
              Boolean(order?.draft_approved_at) ||
              thread?.flow_state === 'PROOF_SUBMITTED' ||
              thread?.flow_state === 'REVISION_REQUESTED_LINKS' ||
              thread?.flow_state === 'REVISION_DECLINED_LINKS' ||
              thread?.flow_state === 'AWAITING_LIVE_LINK' ||
              thread?.flow_state === 'CONTENT_APPROVED' ||
              order?.status === 'LINKS_UNDER_REVIEW' ||
              order?.status === 'LIVE_LINK_SUBMITTED' ||
              order?.status === 'AWAITING_LIVE_LINK' ||
              Boolean(order?.live_link)
            )
          );

        const nextUsed = currentUsed + 1;

        if (isLiveLinkRev) {
          orderStatus = 'REVISION_REQUESTED_LINKS';
          threadStatus = 'ACTIVE';
          orderUpdates = {
            ...orderUpdates,
            status: 'REVISION_REQUESTED_LINKS',
            stage: 'REVISION_REQUESTED_LINKS',
            live_links_submitted: false,
            revisions_used: nextUsed,
            // `creator_notes` is the creator's own note on their submission. It used to be
            // overwritten here with the brand's feedback, prefixed, because it was the only
            // column guaranteed to persist. That destroyed what the creator had written and
            // put the brand's words under a "Creator Notes:" heading on both screens.
            // The feedback belongs in the revision columns and in the chat message.
            revision_feedback: cleanNotes,
            revision_notes: cleanNotes,
            revision_notes_links: cleanNotes
          };
          threadUpdates = {
            ...threadUpdates,
            status: 'ACTIVE',
            flow_state: 'REVISION_REQUESTED_LINKS',
            live_links_submitted: false,
            revision_notes_links: cleanNotes,
            revision_notes: cleanNotes
          };
          msgType = 'live_links_resubmit_request';
          msgText = `❌ Resubmission requested by Brand: ${cleanNotes || 'Please review feedback and submit a corrected live link.'}`;
          msgMetadata = {
            action: 'live_links_resubmit_requested',
            status: 'REVISION_REQUESTED_LINKS',
            feedback: cleanNotes,
            revision_notes: cleanNotes,
            revision_notes_links: cleanNotes,
            revisions_used: nextUsed
          };
          notifType = 'ugc_live_links_resubmit';
          notifTitle = 'Correction Requested for Live Links ⚠️';
          const displaySnippet = cleanNotes && cleanNotes.length > 80 ? cleanNotes.substring(0, 77) + '...' : (cleanNotes || 'Please review feedback');
          notifMessage = `Brand requested resubmission: "${displaySnippet}"`;
          notifLink = isUgc ? '/creator/ugc/orders' : `/messages/${targetThreadId}`;
        } else {
          orderStatus = 'REVISION_REQ';
          threadStatus = 'ACTIVE';
          orderUpdates = {
            ...orderUpdates,
            status: 'REVISION_REQ',
            revisions_used: nextUsed,
            // See the note in the live-link branch: the brand's feedback never belongs in
            // the creator's own notes column.
            revision_feedback: cleanNotes,
            revision_notes: cleanNotes
          };
          threadUpdates = {
            ...threadUpdates,
            status: 'ACTIVE',
            flow_state: 'REVISION_REQ',
            revision_notes: cleanNotes
          };
          msgType = 'revision_requested';
          msgText = `Brand requested a revision: ${cleanNotes || 'Please review feedback and upload an updated draft.'}`;
          msgMetadata = {
            feedback: cleanNotes,
            notes: cleanNotes,
            revision_notes: cleanNotes,
            revisions_used: nextUsed,
            action: 'revision_requested'
          };
          notifType = 'ugc_revision_requested';
          notifTitle = 'Revision Requested';
          const displaySnippet = cleanNotes && cleanNotes.length > 80 ? cleanNotes.substring(0, 77) + '...' : (cleanNotes || 'Please review feedback');
          notifMessage = `📝 Brand requested a revision: "${displaySnippet}"`;
          notifLink = '/creator/ugc/orders';
        }
        break;
      }

      case 'APPROVE_DRAFT': {
        orderStatus = 'AWAITING_LIVE_LINK';
        threadStatus = 'ACTIVE';
        orderUpdates = {
          ...orderUpdates,
          status: 'AWAITING_LIVE_LINK',
          draft_approved_at: nowIso
        };
        threadUpdates = {
          ...threadUpdates,
          status: 'ACTIVE',
          flow_state: 'CONTENT_APPROVED',
          content_approved: true
        };
        msgType = 'content_approved';
        msgText = `🎉 Video Draft Approved by Brand!\n\nPlease publish your content and submit the live post link to complete the deal and release secure payment hold payout.`;
        msgMetadata = {
          action: 'draft_approved',
          status: 'CONTENT_APPROVED'
        };
        notifType = 'ugc_draft_approved';
        notifTitle = 'Draft Approved! 🎉';
        notifMessage = 'Brand approved your video draft! Please submit the live post link.';
        notifLink = isUgc ? '/creator/ugc/orders' : `/messages/${targetThreadId}`;
        break;
      }

      case 'APPROVE': {
        const isLiveLinkApprove = Boolean(
          isLiveLinkApproval ||
          thread?.flow_state === 'PROOF_SUBMITTED' ||
          thread?.flow_state === 'REVISION_REQUESTED_LINKS' ||
          thread?.flow_state === 'REVISION_DECLINED_LINKS' ||
          order?.status === 'LINKS_UNDER_REVIEW' ||
          order?.status === 'LIVE_LINK_SUBMITTED' ||
          Boolean(order?.live_link)
        );

        orderStatus = 'COMPLETED';
        threadStatus = 'COMPLETED';
        orderUpdates = {
          ...orderUpdates,
          status: 'COMPLETED',
          payment_status: 'RELEASED',
          escrow_released_at: nowIso
        };
        threadUpdates = {
          ...threadUpdates,
          status: 'COMPLETED',
          flow_state: 'COMPLETED'
        };
        msgType = isLiveLinkApprove ? 'live_links_approved' : 'payment_released';
        msgText = isLiveLinkApprove
          ? `🎉 Live Links Approved!\n\nThe brand has approved the live links and released the secure payment hold payout to the creator.`
          : `🎉 UGC Deliverable Approved & Payment Released!\n\nThe brand has approved your deliverable and released secure payment hold payout to your account.`;
        msgMetadata = {
          action: isLiveLinkApprove ? 'live_links_approved' : 'payout_released',
          status: 'COMPLETED',
          payout_status: 'RELEASED',
          is_ugc: true,
          order_id: targetOrderId
        };
        notifType = isLiveLinkApprove ? 'ugc_live_links_approved' : 'ugc_deliverable_approved';
        notifTitle = isLiveLinkApprove ? 'Live Links Approved! 🎉' : 'Deliverable Approved & Payment Released! 🎉';
        notifMessage = isLiveLinkApprove
          ? '🎉 Congratulations! Your live collaboration link has been approved and secure payment hold payout released.'
          : '🎉 Congratulations! Your UGC deliverable has been approved and secure payment hold payout released.';
        notifLink = isUgc ? '/creator/ugc/orders' : `/messages/${targetThreadId}`;
        break;
      }

      case 'DECLINE_LIVE_LINKS_RESUBMIT':
      case 'DECLINE_REVISION': {
        const isLiveLinkDecline = action === 'DECLINE_LIVE_LINKS_RESUBMIT' ||
          thread?.flow_state === 'REVISION_REQUESTED_LINKS' ||
          order?.status === 'REVISION_REQUESTED_LINKS';

        if (isLiveLinkDecline) {
          orderStatus = 'REVISION_DECLINED_LINKS';
          threadStatus = 'ACTIVE';
          orderUpdates = {
            ...orderUpdates,
            status: 'REVISION_DECLINED_LINKS',
            // The decline reason goes to the thread and the chat message, not over the
            // creator's submission notes.
            decline_notes_links: cleanNotes || null,
            decline_reason: cleanNotes || null
          };
          threadUpdates = {
            ...threadUpdates,
            status: 'ACTIVE',
            flow_state: 'REVISION_DECLINED_LINKS',
            decline_notes_links: cleanNotes,
            decline_reason: cleanNotes,
            revision_notes: cleanNotes
          };
          msgType = 'live_links_resubmit_declined';
          msgText = `⚠️ Creator declined live links resubmission: ${cleanNotes || 'Creator declined the resubmission request.'}`;
          msgMetadata = {
            action: 'live_links_resubmit_declined',
            status: 'REVISION_DECLINED_LINKS',
            feedback: cleanNotes
          };
          notifType = 'ugc_live_links_resubmit_declined';
          notifTitle = 'Creator Declined Live Link Resubmission ⚠️';
          const displaySnippet = cleanNotes && cleanNotes.length > 80 ? cleanNotes.substring(0, 77) + '...' : (cleanNotes || 'Creator declined request');
          notifMessage = `⚠️ Creator declined live links resubmission: "${displaySnippet}"`;
          notifLink = isUgc ? '/brand/ugc/orders' : `/messages/${targetThreadId}`;
        } else {
          orderStatus = 'DISPUTED';
          threadStatus = 'ACTIVE';
          orderUpdates = {
            ...orderUpdates,
            status: 'DISPUTED',
            // Same reasoning as the other three sites: creator_notes is the creator's, not
            // a general-purpose message channel.
            revision_notes: cleanNotes || null,
            decline_reason: cleanNotes || null
          };
          threadUpdates = {
            ...threadUpdates,
            status: 'ACTIVE',
            flow_state: 'REVISION_DECLINED',
            revision_notes: cleanNotes,
            decline_reason: cleanNotes
          };
          msgType = 'revision_declined';
          msgText = `⚠️ Creator Declined Revision Request\n\nReason: ${cleanNotes || 'Creator is unable to accommodate the requested changes.'}`;
          msgMetadata = {
            feedback: cleanNotes,
            notes: cleanNotes,
            action: 'revision_declined'
          };
          notifType = 'ugc_revision_declined';
          notifTitle = 'Revision Declined by Creator';
          const displaySnippet = cleanNotes && cleanNotes.length > 80 ? cleanNotes.substring(0, 77) + '...' : (cleanNotes || 'Unable to accommodate changes');
          notifMessage = `⚠️ Creator declined revision: "${displaySnippet}"`;
          notifLink = '/brand/ugc/orders';
        }
        break;
      }

      case 'CANCEL': {
        orderStatus = 'CANCELLED';
        threadStatus = 'COMPLETED';
        const refundAmount = Number(order?.escrow_amount || order?.creator_payout || order?.agreed_amount || 0);
        orderUpdates = {
          ...orderUpdates,
          status: 'CANCELLED',
          brand_status: 'CANCELLED',
          creator_status: 'CANCELLED',
          payment_status: 'REFUNDED',
          escrow_hold: false,
          escrow_released_at: nowIso,
          cancelled_at: nowIso,
          refunded_at: nowIso
        };
        threadUpdates = {
          ...threadUpdates,
          status: 'COMPLETED',
          flow_state: 'CANCELLED'
        };
        const actorLabel = actorRole === 'brand' ? 'Brand' : 'Creator';
        // Actually refund through Razorpay (backend/refunds.ts). This said "have been refunded"
        // while no money moved.
        {
          const briefId = order?.brief_id;
          let rzpOrderId: string | null = null;
          const localBrief = (getDb().ugc_briefs || []).find((b: any) => b.id === briefId);
          rzpOrderId = localBrief?.razorpay_order_id || null;
          if (!rzpOrderId && briefId && (privilegedSupabase || supabase)) {
            try {
              const { data: b } = await (privilegedSupabase || supabase).from('ugc_briefs').select('razorpay_order_id').eq('id', briefId).maybeSingle();
              rzpOrderId = b?.razorpay_order_id || null;
            } catch (e: any) { logIgnored("ugcLifecycleService:602", e); }
          }
          refundOutcome = await refundUgcOrder(
            { getRazorpay, isTestMode: () => resolveTestMode(process.env) },
            { razorpayOrderId: rzpOrderId, amount: refundAmount, orderId: targetOrderId }
          );
        }
        msgType = 'order_cancelled';
        msgText = `🚫 UGC Order Cancelled\n\n${actorLabel} has cancelled the order.${cleanNotes ? `\nReason: ${cleanNotes}` : ''}\n${refundMessageLine(refundOutcome, refundAmount)}`;
        msgMetadata = {
          reason: cleanNotes,
          notes: cleanNotes,
          refund_amount: refundAmount,
          refund_status: refundOutcome?.refund_status,
          razorpay_refund_id: refundOutcome?.razorpay_refund_id,
          action: 'order_cancelled'
        };
        notifType = 'ugc_order_cancelled';
        notifTitle = 'UGC Order Cancelled & Secure Payment Hold Refunded';
        notifMessage = `🚫 UGC Order was cancelled by ${actorLabel.toLowerCase()}. Secure payment hold refunded.`;
        notifLink = (receiverRole === 'brand' ? '/brand/ugc/orders' : '/creator/ugc/orders');
        break;
      }
    }

    let supabaseOrderWriteFailed = false;
    let supabaseOrderWriteReason = "";
    
    if (!db.ugc_orders) db.ugc_orders = [];
    let localOrder = db.ugc_orders.find((o: any) => o.id === targetOrderId || o.id === rawId || o.brief_id === rawId);

    // 2. Persist to Supabase
    if (supabase) {
      if (action === 'APPROVE') {
        // v416 (cross-note): `??` kept a stored 0 → "Escrow payment of ₹0 has been released … payout of ₹0" while the
        // order was worth ₹3,000. First positive amount wins; last resort = the brief's per-creator budget.
        const firstPositive = (...v: any[]) => { for (const x of v) { const n = Number(x); if (Number.isFinite(n) && n > 0) return n; } return 0; };
        let grossAmount = firstPositive(
          order?.escrow_amount, localOrder?.escrow_amount,
          order?.creator_payout, localOrder?.creator_payout,
          order?.agreed_amount, localOrder?.agreed_amount
        );
        if (!grossAmount && order?.brief_id) {
          const lb = (db.ugc_briefs || []).find((b: any) => b.id === order.brief_id);
          grossAmount = firstPositive(lb?.budget);
          if (!grossAmount) {
            try {
              const { data: b } = await (privilegedSupabase || supabase).from('ugc_briefs').select('budget').eq('id', order.brief_id).maybeSingle();
              grossAmount = firstPositive(b?.budget);
            } catch (e: any) { console.warn("[syncUgcLifecycleEvent] brief budget lookup failed:", e?.message || e); }
          }
        }
        let feePercentage = 15;
        let platformFee = Math.round(((grossAmount * feePercentage) / 100) * 100) / 100;
        let netAmount = Math.max(0, Math.round((grossAmount - platformFee) * 100) / 100);
        try {
          // Session 36 (option A): the fee stamped when the brand paid, not today's setting.
          const feeCalc = await feeAtPaymentTime((privilegedSupabase || supabase), { ugcOrderId: order?.id || targetOrderId, briefId: order?.brief_id }, grossAmount, calculatePlatformFee);
          if (feeCalc) {
            feePercentage = Number(feeCalc.feePercent ?? feePercentage);
            platformFee = Number(feeCalc.platformFee ?? platformFee);
            netAmount = Number(feeCalc.creatorNet ?? netAmount);
          }
        } catch (e) {
          console.warn("[syncUgcLifecycleEvent] calculatePlatformFee failed, using 15% default:", e);
        }

        const releaseFields = {
          status: 'SUCCESS',
          // RELEASED, not PAID: approval releases the escrow to the payout queue. Nothing has
          // reached the creator's bank yet — the admin payout desk marks it paid.
          payout_status: 'RELEASED',
          payout_type: 'full',
          gross_amount: grossAmount,
          platform_fee_amount: platformFee,
          creator_net_amount: netAmount,
          payout_completed_at: nowIso
        };

        const { data: released, error: relErr } = await (privilegedSupabase || supabase)
          .from('transactions')
          .update(releaseFields)
          .eq('ugc_order_id', targetOrderId)
          // Never stamp a refund row as the payout.
          .is('refund_amount', null)
          .select('id');

        if (relErr) {
          console.error("[syncUgcLifecycleEvent] transactions release error:", relErr);
          return { error: `Failed to update transaction: ${relErr.message}`, _status: 500 };
        } else if (!released || released.length === 0) {
          const { error: insErr } = await (privilegedSupabase || supabase)
            .from('transactions')
            .insert({
              id: crypto.randomUUID(),
              ugc_order_id: targetOrderId,
              creator_id: creatorId,
              gst_amount: 0,
              created_at: nowIso,
              ...releaseFields
            });
          // Session 56: the DB allows ONE payout row per UGC order (uq_transactions_ugc_payout). A second
          // approve landing at the same instant hits it — the first approve already did everything.
          if (insErr && String((insErr as any)?.code || "") === "23505") {
            return {
              already_approved: true,
              status: 'COMPLETED',
              payment_status: 'RELEASED',
              order_id: order?.id || targetOrderId,
              message: "This order was already approved — payout is in progress."
            };
          }
          if (insErr) {
            console.error("[syncUgcLifecycleEvent] transactions release insert error:", insErr);
            return { error: `Failed to insert transaction: ${insErr.message}`, _status: 500 };
          }
        }

        if (!db.transactions) db.transactions = [];
        const localTxn = db.transactions.find((t: any) =>
          (t.ugc_order_id === targetOrderId || t.deal_id === targetOrderId) && !hasRefund(t)
        );
        if (localTxn) {
          Object.assign(localTxn, releaseFields);
        } else {
          db.transactions.unshift({
            id: crypto.randomUUID(),
            ugc_order_id: targetOrderId,
            creator_id: creatorId,
            gst_amount: 0,
            created_at: nowIso,
            ...releaseFields
          });
        }

        msgMetadata = {
          ...msgMetadata,
          amount: grossAmount,
          gross_amount: grossAmount,
          platform_fee_percent: feePercentage,
          platform_fee_amount: platformFee,
          creator_net_amount: netAmount,
          net_amount: netAmount,
          payout_status: 'RELEASED',
          is_ugc: isUgc,
          order_id: targetOrderId
        };
        const isLiveLink = msgType === 'live_links_approved' || Boolean(isLiveLinkApproval);
        msgText = isLiveLink
          ? `🎉 Deliverables & Live Links Approved!\n\nEscrow payment of ₹${grossAmount.toLocaleString('en-IN')} has been released. The deal is now complete! Creator will receive payout of ₹${netAmount.toLocaleString('en-IN')} after Convenience fee & TDS.`
          : `🎉 ${isUgc ? 'UGC' : 'Campaign'} Deliverable Approved & Payment Released!\n\nEscrow payment of ₹${grossAmount.toLocaleString('en-IN')} has been released. The deal is now complete! Creator will receive payout of ₹${netAmount.toLocaleString('en-IN')} after Convenience fee & TDS.`;
      }

      const SUPABASE_UGC_ORDER_COLS = new Set([
        'id', 'brief_id', 'brand_id', 'creator_id', 'status', 'creator_payout',
        'video_url', 'thumbnail_url', 'creator_notes', 'payment_status', 'created_at',
        'internal_deadline', 'agreement_signed_creator', 'escrow_hold', 'escrow_amount',
        'escrow_held_at', 'escrow_released_at', 'revision_count', 'revisions_used',
        'agreed_amount', 'delivered_at', 'cancelled_at',
        // These decide whether an order needs a live post link, and whether one was
        // already submitted. Missing from this list, they were stripped from every write:
        // the order forgot what type it was, and it forgot that a live link had arrived.
        // That is both of the reported bugs — a raw UGC order demanding a live link, and
        // an approved live link being asked for a second time.
        'deliverable_type', 'requires_live_link', 'is_collaboration',
        'live_link', 'live_link_submitted_at', 'draft_approved_at',
        // Every lifecycle write sets updated_at, and mergeOrderRecords compares it to pick the
        // newer copy. Stripped here, the Supabase row never advanced while the local one did.
        'updated_at'
      ]);

      // Session 58 (bug hunt): ugc_orders has revision_notes only, chat_threads has neither — asking for the missing
      // columns made the whole write fail, so the brand's change notes never reached the database.
      const FEEDBACK_ONLY_ORDER_COLS = ['revision_notes'];
      const FEEDBACK_ONLY_THREAD_COLS: string[] = [];
      const supaOrderUpdates: any = {};
      for (const [k, v] of Object.entries(orderUpdates)) {
        if (SUPABASE_UGC_ORDER_COLS.has(k) && v !== undefined) {
          supaOrderUpdates[k] = v;
        }
      }

      const SUPABASE_CHAT_THREAD_COLS = new Set([
        'id', 'deal_id', 'campaign_id', 'creator_id', 'brand_id', 'status', 'flow_state',
        'agreed_amount', 'deliverables', 'deadline', 'revision_count',
        'agreement_signed_creator', 'agreement_signed_brand', 'agreement_signed_at',
        'created_at', 'updated_at'
      ]);
      const supaThreadUpdates: any = {};
      for (const [k, v] of Object.entries(threadUpdates)) {
        if (SUPABASE_CHAT_THREAD_COLS.has(k) && v !== undefined) {
          supaThreadUpdates[k] = v;
        }
      }

      const isExplicitCampaign = isCampaignThread(thread || { id: rawId });

      if (!isExplicitCampaign) {
        try {
          let orderWriteQuery: any = (privilegedSupabase || supabase)
            .from('ugc_orders')
            .update(supaOrderUpdates)
            // Session 56 (payment audit): this order only. Matching `brief_id = rawId` too meant an
            // approve sent with a BRIEF id completed every order on that brief (other creators'
            // orders marked paid with no payout row).
            .or(`id.eq.${targetOrderId}`) /* ids are checked by backend/idGuard.ts (v396, QA S-1) */;
          // v414: a submit racing a cancel / expiry must not revive the order — only write while it is still open.
          if (action === 'SUBMIT_DELIVERABLE') {
            orderWriteQuery = orderWriteQuery
              .not('status', 'in', `(${SUBMIT_CLOSED_STATUSES.join(',')})`)
              .is('cancelled_at', null);
          }
          const { data: updatedRows, error: oErr } = await orderWriteQuery.select('id');
          if (action === 'SUBMIT_DELIVERABLE' && !oErr && (!updatedRows || updatedRows.length === 0)) {
            // v414: no row written — find out if the order was closed meanwhile.
            try {
              const { data: nowRow } = await (privilegedSupabase || supabase)
                .from('ugc_orders').select('id, status, cancelled_at, payment_status').eq('id', targetOrderId).maybeSingle();
              if (nowRow && isSubmitClosedRow(nowRow)) {
                return { error: "This order is already closed.", detail: "This order is already closed.", code: 'ORDER_CLOSED', _status: 409 };
              }
            } catch (e: any) { logIgnored("ugcLifecycleService:submitClosedCheck", e); }
          }
          if (oErr) {
            console.error("[syncUgcLifecycleEvent] Supabase ugc_orders update error:", oErr);
            supabaseOrderWriteFailed = true;
            supabaseOrderWriteReason = oErr.message || String(oErr);

            // A rejected `status` token used to take the whole row update down with it, and
            // everything else in the same payload was collateral: the live post URL, the
            // submitted-at timestamp, the revision notes. That is how a CHECK constraint on
            // one column turned into "the creator's live link vanished".
            //
            // So when the write fails, try once more without the two status columns. The
            // event still counts as failed — the caller is told, and nothing here pretends
            // the status moved — but the data the creator actually typed is not thrown away
            // because of a token the database has not been taught yet.
            const { status: _rejectedStatus, stage: _rejectedStage, ...orderDataOnly } = supaOrderUpdates;
            if (Object.keys(orderDataOnly).length > 0) {
              try {
                const { error: dataErr } = await (privilegedSupabase || supabase)
                  .from('ugc_orders')
                  .update(orderDataOnly)
                  .or(`id.eq.${targetOrderId}`) /* ids are checked by backend/idGuard.ts (v396, QA S-1) */;
                if (dataErr) {
                  console.error(
                    "[syncUgcLifecycleEvent] ugc_orders data-only fallback also failed:",
                    dataErr.message || dataErr
                  );
                } else {
                  console.warn(
                    "[syncUgcLifecycleEvent] ugc_orders status rejected; saved the rest of the payload without it.",
                    { targetOrderId, action, rejectedStatus: _rejectedStatus, reason: supabaseOrderWriteReason }
                  );
                }
              } catch (e: any) {
                console.error("[syncUgcLifecycleEvent] ugc_orders data-only fallback threw:", e?.message || e);
              }
            }
          } else if (!updatedRows || updatedRows.length === 0) {
            let retryQuery: any = (privilegedSupabase || supabase)
              .from('ugc_orders')
              .update(supaOrderUpdates)
              .eq('id', targetOrderId);
            // v414: the retry keeps the "not cancelled" guard for a submit.
            if (action === 'SUBMIT_DELIVERABLE') retryQuery = retryQuery.is('cancelled_at', null);
            const { data: retryRows, error: retryErr } = await retryQuery.select('id');
            if (!retryErr && retryRows && retryRows.length > 0) {
              // Successfully updated on retry
            } else {
              // Row might be missing from Supabase entirely (e.g. created in mock/local state, or lost during migration).
              // Attempt to recover by upserting the full order record so creator submissions never fail.
              let orderUpserted = false;
              if (order && order.brief_id && (order.brand_id || brandId) && (order.creator_id || creatorId)) {
                try {
                  const fallbackOrderPayload: any = {
                    id: targetOrderId,
                    brief_id: order.brief_id,
                    brand_id: order.brand_id || brandId,
                    creator_id: order.creator_id || creatorId,
                    creator_payout: order.creator_payout || order.agreed_amount || 0,
                    status: supaOrderUpdates.status || order.status || 'IN_PROGRESS',
                    created_at: order.created_at || nowIso,
                    ...supaOrderUpdates
                  };
                  const { error: upsertErr } = await (privilegedSupabase || supabase)
                    .from('ugc_orders')
                    .upsert(fallbackOrderPayload);
                  if (!upsertErr) {
                    console.log(`[syncUgcLifecycleEvent] Successfully recovered missing ugc_order in Supabase: ${targetOrderId}`);
                    orderUpserted = true;
                  } else {
                    console.warn(`[syncUgcLifecycleEvent] Fallback upsert failed:`, upsertErr);
                  }
                } catch (recovErr) {
                  console.warn(`[syncUgcLifecycleEvent] Error in fallback upsert:`, recovErr);
                }
              }

              if (!orderUpserted) {
                console.error(
                  "[syncUgcLifecycleEvent] ugc_orders update matched 0 rows.",
                  { targetOrderId, rawId, action, retryError: retryErr?.message || null }
                );
                // If local order exists in db_mock.json or in-memory state, we do NOT want to completely hard-crash the user's upload submission if local DB persistence succeeds!
                if (localOrderRecord || order) {
                  console.warn(`[syncUgcLifecycleEvent] Order ${targetOrderId} exists locally; allowing submission to proceed with local persistence and background sync.`);
                  supabaseOrderWriteFailed = false;
                } else {
                  supabaseOrderWriteFailed = true;
                  supabaseOrderWriteReason = retryErr?.message
                    || `No ugc_orders row matched id=${targetOrderId}`;
                }
              }
            }
          }
        } catch (e: any) {
          console.error("[syncUgcLifecycleEvent] Supabase ugc_orders update error:", e);
          supabaseOrderWriteFailed = true;
          supabaseOrderWriteReason = e?.message || String(e);
        }
      } else {
        const campaignDealId = getCampaignDealId(thread || { id: rawId, deal_id: targetDealId });
        if (campaignDealId) {
          try {
            const dealStatusUpdate = action === 'SUBMIT_DELIVERABLE' ? 'CONTENT_SUBMITTED'
              : action === 'SUBMIT_LIVE_LINK' ? 'PROOF_SUBMITTED'
              : action === 'REQUEST_REVISION' ? 'ACTIVE'
              : action === 'APPROVE' ? 'CONTENT_APPROVED'
              : action === 'CANCEL' ? 'CANCELLED' : undefined;
            if (dealStatusUpdate) {
              const dealPayload: any = {
                status: dealStatusUpdate,
                updated_at: nowIso
              };
              if (action === 'REQUEST_REVISION') {
                dealPayload.revisions_used = currentUsed + 1;
              }
              await (privilegedSupabase || supabase)
                .from('deals')
                .update(dealPayload)
                .eq('id', campaignDealId);
            }
          } catch (e) {
            console.warn("[syncUgcLifecycleEvent] Supabase deals update warning:", e);
          }
        }
      }

      // Stop here, before the thread moves.
      //
      // This check used to sit further down, after the thread had already been updated. The
      // result was a half-applied event: the order never moved, no chat message was ever
      // created, but the thread's flow_state did advance — so the screen showed "Live Post
      // Link Submitted" next to a red "failed to update order" toast, and the creator was
      // told their link was delivered when nothing had been recorded.
      //
      // The thread is the thing both screens read to decide what step they are on. It must
      // never get ahead of the order it describes.
      if (isUgc && supabaseOrderWriteFailed) {
        return {
          error: `Failed to update order in database: ${supabaseOrderWriteReason}`,
          _status: 500
        };
      }

      try {
        const { error: tErr } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .update(supaThreadUpdates)
          .or(`id.eq.${targetThreadId},deal_id.eq.${targetOrderId}`);
        if (tErr) console.error("[syncUgcLifecycleEvent] Supabase chat_threads update error:", tErr);
      } catch (e) {
        console.error("[syncUgcLifecycleEvent] Supabase chat_threads update error:", e);
      }

      if (action === 'REQUEST_REVISION' || action === 'SUBMIT_DELIVERABLE') {
        const feedbackValue = action === 'REQUEST_REVISION' ? cleanNotes : null;

        const orderFeedback: any = {};
        for (const col of FEEDBACK_ONLY_ORDER_COLS) {
          if (orderUpdates[col] !== undefined || orderUpdates.revision_feedback !== undefined || action === 'SUBMIT_DELIVERABLE') {
            orderFeedback[col] = feedbackValue;
          }
        }
        if (Object.keys(orderFeedback).length > 0 && !isExplicitCampaign) {
          try {
            const { error: fErr } = await (privilegedSupabase || supabase)
              .from('ugc_orders')
              .update(orderFeedback)
              .eq('id', targetOrderId);
            if (fErr) {
              console.warn("[syncUgcLifecycleEvent] revision feedback columns not written on ugc_orders:", fErr.message || fErr);
            }
          } catch (e: any) {
            console.warn("[syncUgcLifecycleEvent] revision feedback write skipped (ugc_orders):", e?.message || e);
          }
        }

        const threadFeedback: any = {};
        for (const col of FEEDBACK_ONLY_THREAD_COLS) {
          threadFeedback[col] = feedbackValue;
        }
        if (Object.keys(threadFeedback).length) try {
          const { error: tfErr } = await (privilegedSupabase || supabase)
            .from('chat_threads')
            .update(threadFeedback)
            .eq('id', targetThreadId);
          if (tfErr) {
            console.warn("[syncUgcLifecycleEvent] revision feedback columns not written on chat_threads:", tfErr.message || tfErr);
          }
        } catch (e: any) {
          console.warn("[syncUgcLifecycleEvent] revision feedback write skipped (chat_threads):", e?.message || e);
        }
      }

      if (action === 'SUBMIT_DELIVERABLE') {
        try {
          await (privilegedSupabase || supabase).from('content_submissions').insert({
            id: crypto.randomUUID(),
            deal_id: subDealId,
            creator_id: creatorId,
            submission_type: 'draft',
            video_url: cleanVideoUrl,
            caption: "",
            notes_to_brand: cleanNotes,
            status: 'PENDING_REVIEW',
            submitted_at: nowIso
          });
        } catch (e) {
          console.warn("[syncUgcLifecycleEvent] content_submissions insert warning:", e);
        }
      }

      if (action === 'CANCEL') {
        const refundAmount = Number(order?.escrow_amount || order?.creator_payout || order?.agreed_amount || 0);
        try {
          const { error: txnErr } = await (privilegedSupabase || supabase).from('transactions').insert({
            id: crypto.randomUUID(),
            deal_id: isUuid(targetOrderId) ? targetOrderId : null,
            ugc_order_id: targetOrderId,
            creator_id: creatorId,
            gross_amount: refundAmount,
            platform_fee_amount: 0,
            creator_net_amount: 0,
            gst_amount: 0,
            status: 'SUCCESS',
            // Session 58: the column defaults to 'PAID' — this refund row counted as a payout to the creator.
            payout_status: 'CANCELLED',
            payout_type: 'refund',
            refund_amount: refundAmount,
            refund_status: refundOutcome?.refund_status || 'PENDING', // what Razorpay actually did
            refund_reason: cleanNotes ? `Order cancelled: ${cleanNotes}` : 'Order cancelled by user',
            refund_reference: `REFUND_${Date.now()}`,
            created_at: nowIso,
            refunded_at: nowIso
          });
          if (txnErr) console.warn("[syncUgcLifecycleEvent] Supabase transaction refund insert error:", txnErr);
        } catch (e) {
          console.warn("[syncUgcLifecycleEvent] Supabase transaction refund insert warning:", e);
        }

        // The slot is given back once, below, for both stores (releaseBriefSlot).
      }

      if (action === 'APPROVE') {
        try {
          const briefId = order?.brief_id || localOrder?.brief_id;
          if (briefId) {
            const { data: siblingOrders } = await (privilegedSupabase || supabase)
              .from('ugc_orders')
              .select('id, status, payment_status')
              .eq('brief_id', briefId);

            const allOrdersCompleted = (siblingOrders || []).every((so: any) =>
              so.id === targetOrderId ||
              ['COMPLETED', 'PAID', 'RELEASED'].includes(String(so.status).toUpperCase()) ||
              ['RELEASED', 'PAID'].includes(String(so.payment_status).toUpperCase())
            );

            // Session 58 (bug hunt): only when EVERY paid slot is delivered. It closed a 3-slot brief after one approval —
            // the 2 unclaimed paid slots then could neither be claimed nor refunded.
            const doneCount = (siblingOrders || []).filter((so: any) =>
              so.id === targetOrderId ||
              ['COMPLETED', 'PAID', 'RELEASED'].includes(String(so.status).toUpperCase()) ||
              ['RELEASED', 'PAID'].includes(String(so.payment_status).toUpperCase())
            ).length;
            let maxCreators: any = null;
            try {
              const { data: br } = await (privilegedSupabase || supabase).from('ugc_briefs').select('max_creators').eq('id', briefId).maybeSingle();
              maxCreators = br?.max_creators;
            } catch (e) { /* unknown → don't close */ }
            if (allOrdersCompleted && maxCreators != null && isBriefFullyDelivered(doneCount, maxCreators)) {
              await (privilegedSupabase || supabase)
                .from('ugc_briefs')
                .update({ status: 'COMPLETED' })
                .eq('id', briefId);
            }
          }
        } catch (e) {
          console.warn("[syncUgcLifecycleEvent] Brief status COMPLETED update error:", e);
        }
      }
    }

    // The failed-order-write check that used to live here now runs earlier, before the
    // chat_threads update — see the comment there. By this point the order write has either
    // succeeded or the function has already returned.

    // 3. Persist to Local DB
    if (isUgc) {
      if (localOrder) {
        Object.assign(localOrder, orderUpdates);
      } else if (order) {
        localOrder = { ...order, ...orderUpdates };
        db.ugc_orders.push(localOrder);
      }
    } else if (targetDealId) {
      if (db.deals) {
        const d = db.deals.find((x: any) => x.id === targetDealId || x.deal_id === targetDealId);
        if (d) {
          if (action === 'SUBMIT_DELIVERABLE') {
            d.status = 'CONTENT_SUBMITTED';
            d.stage = 'CONTENT_SUBMITTED';
          }
          d.updated_at = nowIso;
        }
      }
      if (db.collabs) {
        const c = db.collabs.find((x: any) => x.collab_id === targetDealId || x.id === targetDealId);
        if (c) {
          if (action === 'SUBMIT_DELIVERABLE') {
            c.status = 'CONTENT_SUBMITTED';
            c.stage = 'CONTENT_SUBMITTED';
          }
          c.updated_at = nowIso;
        }
      }
    }

    if (!db.chat_threads) db.chat_threads = [];
    let localThread = db.chat_threads.find((t: any) => t.id === targetThreadId || t.deal_id === targetOrderId || t.id === targetOrderId);
    if (localThread) {
      Object.assign(localThread, threadUpdates);
      if (action === 'SUBMIT_DELIVERABLE' || action === 'SUBMIT_LIVE_LINK') {
        delete localThread.revision_notes;
        delete localThread.revision_feedback;
        delete localThread.revision_notes_links;
        delete localThread.decline_notes_links;
      }
      if (localThread.ugc_order) {
        Object.assign(localThread.ugc_order, orderUpdates);
        if (action === 'SUBMIT_DELIVERABLE' || action === 'SUBMIT_LIVE_LINK') {
          delete localThread.ugc_order.revision_notes;
          delete localThread.ugc_order.revision_feedback;
          delete localThread.ugc_order.revision_notes_links;
          delete localThread.ugc_order.decline_notes_links;
        }
      }
    } else if (thread) {
      localThread = { ...thread, ...threadUpdates };
      if (action === 'SUBMIT_DELIVERABLE' || action === 'SUBMIT_LIVE_LINK') {
        delete localThread.revision_notes;
        delete localThread.revision_feedback;
        delete localThread.revision_notes_links;
        delete localThread.decline_notes_links;
      }
      db.chat_threads.push(localThread);
    }

    if (action === 'SUBMIT_DELIVERABLE') {
      if (!db.content_submissions) db.content_submissions = [];
      db.content_submissions.push({
        id: crypto.randomUUID(),
        deal_id: subDealId,
        creator_id: creatorId,
        submission_type: 'draft',
        video_url: cleanVideoUrl,
        caption: "",
        notes_to_brand: cleanNotes,
        status: 'PENDING_REVIEW',
        submitted_at: nowIso
      });
    }

    if (action === 'SUBMIT_LIVE_LINK') {
      if (supabase) {
        try {
          await (privilegedSupabase || supabase)
            .from('content_submissions')
            .insert({
              id: crypto.randomUUID(),
              deal_id: isUgc ? null : (targetDealId || null),
              creator_id: creatorId,
              submission_type: 'live_link',
              video_url: cleanVideoUrl,
              notes_to_brand: cleanNotes || null,
              status: 'PENDING_REVIEW',
              submitted_at: nowIso
            });
        } catch (e) {
          console.warn("[syncUgcLifecycleEvent] content_submissions live_link insert warning:", e);
        }
      }
      if (!db.content_submissions) db.content_submissions = [];
      db.content_submissions.push({
        id: crypto.randomUUID(),
        deal_id: subDealId,
        creator_id: creatorId,
        submission_type: 'live_link',
        video_url: cleanVideoUrl,
        caption: "",
        notes_to_brand: cleanNotes,
        status: 'PENDING_REVIEW',
        submitted_at: nowIso
      });
    }

    if (action === 'CANCEL') {
      const refundAmount = Number(order?.escrow_amount || localOrder?.escrow_amount || order?.creator_payout || localOrder?.creator_payout || order?.agreed_amount || localOrder?.agreed_amount || 0);
      const refundTxnId = `txn_ref_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
      const refundTxnPayload = {
        id: crypto.randomUUID(),
        transaction_id: refundTxnId,
        deal_id: null,
        ugc_order_id: targetOrderId,
        brief_id: order?.brief_id || localOrder?.brief_id || null,
        brand_id: brandId,
        creator_id: creatorId,
        gross_amount: refundAmount,
        platform_fee_amount: 0,
        creator_net_amount: 0,
        gst_amount: 0,
        status: 'REFUNDED',
        escrow_hold: false,
        payout_status: 'REFUNDED',
        payout_type: 'refund',
        refund_amount: refundAmount,
        refund_status: refundOutcome?.refund_status || 'PENDING', // what Razorpay actually did
        refund_reason: cleanNotes ? `Order cancelled: ${cleanNotes}` : 'Order cancelled by user',
        refund_reference: `REFUND_${Date.now()}`,
        created_at: nowIso,
        refunded_at: nowIso
      };

      if (!db.transactions) db.transactions = [];
      db.transactions.unshift(refundTxnPayload);

      const priorTxn = db.transactions.find((t: any) => 
        (t.ugc_order_id && t.ugc_order_id === targetOrderId) || 
        (t.deal_id && t.deal_id === targetOrderId) || 
        ((order?.brief_id || localOrder?.brief_id) && t.brief_id === (order?.brief_id || localOrder?.brief_id))
      );
      if (priorTxn && priorTxn !== refundTxnPayload) {
        priorTxn.escrow_hold = false;
        priorTxn.status = 'REFUNDED';
        priorTxn.refund_status = refundOutcome?.refund_status || 'PENDING';
        priorTxn.refund_amount = refundAmount;
        priorTxn.refunded_at = nowIso;
      }

      // A cancelled order frees its slot. This read the count and wrote count-1 (racy) and
      // always set the brief to OPEN — reopening a brief the brand had closed.
      const briefId = order?.brief_id || localOrder?.brief_id;
      if (briefId) await releaseBriefSlot(briefId);
    }

    if (action === 'APPROVE') {
      const briefId = order?.brief_id || localOrder?.brief_id;
      if (briefId && db.ugc_briefs) {
        const brief = db.ugc_briefs.find((b: any) => b.id === briefId);
        if (brief) {
          const siblingOrders = (db.ugc_orders || []).filter((o: any) => o.brief_id === briefId);
          const allOrdersCompleted = siblingOrders.every((so: any) =>
            so.id === targetOrderId ||
            ['COMPLETED', 'PAID', 'RELEASED'].includes(String(so.status).toUpperCase()) ||
            ['RELEASED', 'PAID'].includes(String(so.payment_status).toUpperCase())
          );
          if (allOrdersCompleted) {
            brief.status = 'COMPLETED';
          }
        }
      }
    }

    // 4. Create and persist Chat Message
    const msgId = crypto.randomUUID();
    const senderUserId = actorUser?.user_id || (actorRole === 'brand' ? brandId : creatorId) || '';
    const msgPayload = {
      message_id: msgId,
      thread_id: targetThreadId,
      sender_user_id: senderUserId,
      receiver_user_id: receiverId,
      text: msgText,
      from_name: actorName,
      message_type: msgType,
      metadata: msgMetadata,
      created_at: nowIso,
      read: false
    };

    if (supabase) {
      try {
        await insertChatMessageToSupabase(msgPayload);
      } catch (e) {
        console.error("[syncUgcLifecycleEvent] Chat message insert error:", e);
      }
    }

    const localMsgObj = {
      ...msgPayload,
      id: msgId,
      content: msgText,
      sender_id: senderUserId,
      receiver_id: receiverId,
      sender_role: actorRole,
      message_type: msgType,
      media_url: cleanVideoUrl || undefined,
      content_url: cleanVideoUrl || undefined,
      metadata: msgMetadata
    };

    if (!db.chat_messages) db.chat_messages = [];
    db.chat_messages.push(localMsgObj);

    // 5. Create and persist Notification
    let notifObj: any = null;
    if (receiverId) {
      const notifId = `notif_${crypto.randomUUID().replace(/-/g, '').substring(0, 10)}`;
      notifObj = {
        notif_id: notifId,
        user_id: receiverId,
        type: notifType,
        title: notifTitle,
        message: notifMessage,
        event_type: notifType,
        event_ref_id: targetOrderId,
        role_context: receiverRole,
        subtype: 'general',
        read: false,
        created_at: nowIso,
        // v414: on an admin action the brand gets the brand-side link (the case may have set the creator one).
        link: (String(actorRole).toLowerCase() === 'admin' && isUgc && receiverRole === 'brand') ? '/brand/ugc/orders' : notifLink
      };

      if (supabase) {
        try {
          // Session 58: notifications has a link column now — keep it, so the bell / push opens the order.
          const { error: nErr } = await (privilegedSupabase || supabase).from('notifications').insert(notifObj);
          if (nErr) console.warn("[syncUgcLifecycleEvent] Notification insert warning:", nErr.message);
        } catch (e) {
          console.warn("[syncUgcLifecycleEvent] Notification insert warning:", e);
        }
      }

      if (!db.notifications) db.notifications = [];
      db.notifications.unshift(notifObj);
    }

    // v414: an admin action concerns both sides — the creator is told too (receiverId above is the brand).
    const adminExtraReceiverId = (String(actorRole).toLowerCase() === 'admin' && creatorId && creatorId !== receiverId) ? creatorId : '';
    const adminExtraLink = isUgc ? '/creator/ugc/orders' : `/messages/${targetThreadId}`;
    if (adminExtraReceiverId) {
      const extraNotif = {
        notif_id: `notif_${crypto.randomUUID().replace(/-/g, '').substring(0, 10)}`,
        user_id: adminExtraReceiverId,
        type: notifType,
        title: notifTitle,
        message: notifMessage,
        event_type: notifType,
        event_ref_id: targetOrderId,
        role_context: 'creator',
        subtype: 'general',
        read: false,
        created_at: nowIso,
        link: adminExtraLink
      };
      if (supabase) {
        try {
          const { error: nErr } = await (privilegedSupabase || supabase).from('notifications').insert(extraNotif);
          if (nErr) console.warn("[syncUgcLifecycleEvent] Creator notification (admin action) warning:", nErr.message);
        } catch (e) {
          console.warn("[syncUgcLifecycleEvent] Creator notification (admin action) warning:", e);
        }
      }
      if (!db.notifications) db.notifications = [];
      db.notifications.unshift(extraNotif);
    }

    saveDb(db);

    // 5b. The escrow was released (a repeat APPROVE returns early above): alert the admin payout
    // desk, who make the bank transfer.
    if (action === 'APPROVE' && broadcastAdminNotification) {
      try {
        const src: any = localOrder || order || {};
        const gross = Number(src.escrow_amount ?? src.creator_payout ?? src.agreed_amount ?? 0) || 0;
        await broadcastAdminNotification({
          type: 'payout_due',
          title: 'UGC payout due to creator',
          message: `Brand approved UGC order ${targetOrderId} — pay the creator${gross ? ` (order ₹${gross.toLocaleString('en-IN')}, before platform fee)` : ''}. Mark it disbursed in the secure payment hold once transferred.`,
          metadata: { ugc_order_id: targetOrderId, creator_id: src.creator_id, brand_id: src.brand_id, gross_amount: gross },
          actor_id: actorUser?.user_id
        });
      } catch (e: any) {
        console.error("[ugc approve] admin payout alert failed:", e?.message || e);
      }
    }

    // 5c. The automatic refund did not go through: an admin has to return the brand's money.
    if (action === 'CANCEL' && refundOutcome?.refund_status === 'PENDING' && broadcastAdminNotification) {
      try {
        const src: any = localOrder || order || {};
        const amt = Number(src.escrow_amount ?? src.creator_payout ?? src.agreed_amount ?? 0) || 0;
        await broadcastAdminNotification({
          type: 'refund_due',
          title: 'Refund due to brand',
          message: `UGC order ${targetOrderId} was cancelled — refund ₹${amt.toLocaleString('en-IN')} to the brand manually. Reason: ${refundOutcome.reason || 'automatic refund unavailable'}.`,
          metadata: { ugc_order_id: targetOrderId, brand_id: src.brand_id, amount: amt, reason: refundOutcome.reason },
          actor_id: actorUser?.user_id
        });
      } catch (e: any) {
        console.error("[ugc cancel] admin refund alert failed:", e?.message || e);
      }
    }

    // 6. Broadcast Realtime Socket.io events
    if (io) {
      io.to(targetThreadId).emit("new_message", localMsgObj);
      const socketThreadPayload = {
        threadId: targetThreadId,
        id: targetThreadId,
        deal_id: targetOrderId,
        status: threadStatus,
        flow_state: threadUpdates.flow_state,
        ...threadUpdates,
        live_links_submitted: threadUpdates.live_links_submitted ?? (thread?.live_links_submitted || false),
        live_link: threadUpdates.live_link || thread?.live_link || (action === 'SUBMIT_LIVE_LINK' ? cleanVideoUrl : undefined),
        revision_notes: action === 'REQUEST_REVISION' ? cleanNotes : null,
        revision_feedback: action === 'REQUEST_REVISION' ? cleanNotes : null,
        submitted_video_url: action === 'SUBMIT_DELIVERABLE' ? cleanVideoUrl : (thread?.submitted_video_url || undefined),
        content_url: action === 'SUBMIT_DELIVERABLE' ? cleanVideoUrl : undefined,
        video_url: action === 'SUBMIT_DELIVERABLE' ? cleanVideoUrl : undefined,
        creator_notes: action === 'SUBMIT_DELIVERABLE' ? cleanNotes : undefined,
        ugc_order: {
          ...(order || localOrder || {}),
          ...orderUpdates,
          id: targetOrderId,
          status: orderStatus,
          live_links_submitted: orderUpdates.live_links_submitted ?? (order?.live_links_submitted || false),
          live_link: orderUpdates.live_link || order?.live_link || (action === 'SUBMIT_LIVE_LINK' ? cleanVideoUrl : undefined),
          revision_notes: action === 'REQUEST_REVISION' ? cleanNotes : null,
          revision_feedback: action === 'REQUEST_REVISION' ? cleanNotes : null,
          payment_status: orderUpdates.payment_status || (action === 'APPROVE' ? 'RELEASED' : (order?.payment_status || 'PENDING'))
        }
      };
      emitThreadEvent(io, "thread_updated", socketThreadPayload); // room + both parties + admins, once
      emitThreadEvent(io, "ugc_order_updated", {
        orderId: targetOrderId,
        status: orderStatus,
        stage: orderStatus === 'COMPLETED' ? 'COMPLETED' : orderStatus,
        payment_status: orderUpdates.payment_status || (action === 'APPROVE' ? 'RELEASED' : (order?.payment_status || 'PENDING')),
        order: {
          ...(order || localOrder || {}),
          ...orderUpdates,
          id: targetOrderId,
          status: orderStatus,
          payment_status: orderUpdates.payment_status || (action === 'APPROVE' ? 'RELEASED' : (order?.payment_status || 'PENDING'))
        }
      });

      if (receiverId) {
        io.to(receiverId).to(`user_${receiverId}`).emit("notification", {
          type: notifType,
          title: notifTitle,
          message: notifMessage,
          link: notifLink,
          order_id: targetOrderId,
          thread_id: targetThreadId
        });
      }
      // v414: admin action → the creator gets the live notification too.
      if (adminExtraReceiverId) {
        io.to(adminExtraReceiverId).to(`user_${adminExtraReceiverId}`).emit("notification", {
          type: notifType,
          title: notifTitle,
          message: notifMessage,
          link: adminExtraLink,
          order_id: targetOrderId,
          thread_id: targetThreadId
        });
      }
    }

    return {
      ok: true,
      success: true,
      action,
      order_id: targetOrderId,
      thread_id: targetThreadId,
      status: orderStatus,
      message_id: msgId,
      message_text: msgText,
      chat_message: localMsgObj,
      notification: notifObj,
      order: { ...(order || {}), ...(localOrder || {}), ...orderUpdates }
    };
  };
}
