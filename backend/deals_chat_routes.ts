import { isInhouseBrand, INHOUSE_MIN_OFFER, MIN_OFFER, specialOfferNote } from "./directInvites"; // v419; v420 special-offer floor
import { logIgnored } from "./logIgnored";
import { consumeSignToken, takeLastSignMeta, signOtpRequired } from "./signTokens";
import { recordAgreementSignature } from "./agreementRecord";
import { emitThreadEvent, emitAdminEvent } from "./socketAccess";
import express from "express";
import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import { isCampaignThread, isUgcThread, getUgcOrderId, isUuid } from "./dealFlow";
import { partyRole, forbid, conflict, isClosed, knownAmount, isEscrowDepositRow, upper } from "./campaignGuards";

// Campaign Deal negotiation & agreement-signing chat actions: the brand
// proposing formal terms (approve-request, generating the AI agreement
// text), escrow payment (pay), agreement signing (both the legacy
// creator-approve-agreement shortcut and the real dual-signature /sign
// route), and the counter-offer negotiation flow (creator-negotiate,
// brand-accept-counter).
//
// These are more involved than the plain chat-CRUD routes (chat_routes.ts)
// because they carry real Deal-lifecycle business logic — status/flow_state
// transitions, escrow bookkeeping, and chat-message side effects — so each
// dependency this code touches from server.ts's shared scope is passed in
// explicitly below.
// A signed partnership contract is final. Once a party has signed, they may VIEW the
// negotiation table but must not be able to move the numbers — otherwise signing costs
// nothing: sign, then re-open the table, propose new rates (which wipes both signatures
// in creator-negotiate below) and the agreed terms quietly change underneath the other
// party. The lock is enforced here on the server; the UI lock alone is only cosmetic
// because these endpoints can be called directly.
//
// CAMPAIGN THREADS ONLY. Instant UGC orders have no signature stage and are deliberately
// left untouched by this guard.
// v417: the lowest offer / counter-offer by DEAL TYPE (never by URL path). Barter has no floor, UGC has its
// own ₹500 floor, every other (campaign / direct invite / unknown) deal needs ₹3,000. Pure.
export const CAMPAIGN_MIN_OFFER = MIN_OFFER; // v420: ₹2,000 special offer (usually ₹3,000) — see directInvites.ts
export const UGC_MIN_OFFER = MIN_OFFER; // v420: UGC too (was ₹500)
export function isBarterDeal(...rows: any[]): boolean {
  return rows.some((r) => r && (r.is_barter === true || /barter/i.test(String(r.collab_mode || r.deal_mode || r.compensation_type || ""))));
}
export function offerMinimumFor(thread: any, ...related: any[]): number {
  if (isBarterDeal(thread, ...related)) return 0;
  if (isUgcThread(thread)) return UGC_MIN_OFFER;
  return CAMPAIGN_MIN_OFFER;
}
export function offerMinimumMessage(min: number): string {
  return `The minimum offer for this deal is ₹${min.toLocaleString("en-IN")}${specialOfferNote(min)}.`;
}

export function isCampaignThreadRecord(thread: any): boolean {
  if (!thread) return false;
  // The canonical check. The inline copy below missed campaign threads keyed by a bare UUID
  // or carrying only campaign_deal_id, and those were never locked after signing. It is kept
  // underneath so detection can only widen, never narrow.
  if (isCampaignThread(thread)) return true;
  const isUgcThread = Boolean(
    thread.is_ugc ||
    thread.ugc_order_id ||
    thread.ugc_brief_id ||
    String(thread.deal_type || '').toUpperCase() === 'UGC' ||
    String(thread.type || '').toLowerCase() === 'ugc' ||
    String(thread.id || '').startsWith('thread_ugc_') ||
    String(thread.id || '').startsWith('ugcord_') ||
    String(thread.deal_id || '').startsWith('ugcord_')
  );
  if (isUgcThread) return false;
  return Boolean(
    thread.campaign_id ||
    String(thread.deal_type || '').toUpperCase() === 'CAMPAIGN' ||
    String(thread.type || '').toLowerCase() === 'campaign' ||
    String(thread.id || '').startsWith('thread_camp_')
  );
}

// v414: stages after signing / funding. The price can't move once a thread is here (campaign AND UGC).
export const POST_SIGN_FLOW_STATES = [
  'CONTRACT_SIGNED', 'ACTIVE', 'ESCROW_PAID', 'ESCROW_FUNDED', 'ESCROW_HELD', 'PAID', 'IN_PROGRESS', 'AWAITING_LIVE_LINK',
  'SUBMITTED', 'CONTENT_SUBMITTED', 'PENDING_REVIEW', 'UNDER_REVIEW', 'IN_REVIEW', 'CHANGES_REQUESTED', 'REVISION_REQ',
  'REVISION_REQUESTED', 'REVISION_DECLINED', 'NEEDS_REVISION', 'CONTENT_APPROVED', 'COMPLETED_APPROVAL', 'PROOF_SUBMITTED',
  'LINKS_UNDER_REVIEW', 'LIVE_LINKS_SUBMITTED', 'REVISION_REQUESTED_LINKS', 'REVISION_DECLINED_LINKS', 'LIVE_LINK_REVISION_REQ',
  'LIVE_LINK_REVISION', 'COMPLETED', 'CLOSED', 'CANCELLED', 'RELEASED', 'REFUNDED', 'DISPUTED'
];

// v414: is this UGC order (or campaign deal) funded? escrow_hold_at / escrow_held_at only counts while escrow_hold isn't false (a refund sets it false).
export function isOrderFunded(order: any): boolean {
  if (!order) return false;
  if (order.escrow_hold === true) return true;
  if ((order.escrow_held_at || order.escrow_hold_at) && order.escrow_hold !== false) return true;
  if (['ESCROW_HELD', 'PAID', 'RELEASED'].includes(upper(order.payment_status))) return true;
  return POST_SIGN_FLOW_STATES.includes(upper(order.status));
}

// v414: why the price is locked (null = not locked). Signatures lock campaign threads; funded / past-signing stages lock every thread.
export function negotiationLockReason(thread: any, order?: any): null | 'signed_both' | 'signed_brand' | 'signed_creator' | 'funded' {
  if (!thread) return null;
  const flow = upper(thread.flow_state);
  const status = upper(thread.status);
  const campaign = isCampaignThreadRecord(thread);
  if (campaign) {
    const b = Boolean(thread.agreement_signed_brand);
    const c = Boolean(thread.agreement_signed_creator);
    if (b && c) return 'signed_both';
    if (b) return 'signed_brand';
    if (c) return 'signed_creator';
  }
  if (thread.payment_funded || isOrderFunded(order)) return 'funded';
  if (POST_SIGN_FLOW_STATES.includes(flow)) return 'funded';
  // Campaign thread status ACTIVE could come from the old one-signature bug, so for campaigns only the flow decides.
  if (POST_SIGN_FLOW_STATES.includes(status) && (!campaign || status !== 'ACTIVE')) return 'funded';
  return null;
}

export function negotiationLockedFor(thread: any, user: any, order?: any): boolean {
  if (user?.role === 'admin') return false;
  // v414: a prepared-but-unsigned agreement (AI_AGREEMENT_READY etc.) no longer locks the price — only a signature or a funded / in-progress deal does.
  return negotiationLockReason(thread, order) !== null;
}

export const NEGOTIATION_LOCKED_MESSAGE =
  "The contract has been signed, so the price is locked. Contact support if the agreed terms genuinely need to change.";

// v414: accurate wording — who signed, or that the deal is already funded.
export function negotiationLockedMessage(thread: any, order?: any): string {
  const r = negotiationLockReason(thread, order);
  const tail = " Contact support if the agreed terms genuinely need to change.";
  if (r === 'signed_both') return "The contract has been signed by both sides, so the price is locked." + tail;
  if (r === 'signed_brand') return "The contract has been signed by the brand, so the price is locked." + tail;
  if (r === 'signed_creator') return "The contract has been signed by the creator, so the price is locked." + tail;
  if (r === 'funded') return "This deal is already funded or in progress, so the price is locked." + tail;
  return NEGOTIATION_LOCKED_MESSAGE;
}

// v414: one shape for every "price is locked" refusal.
function lockedResponse(res: any, thread: any, order?: any) {
  return res.status(409).json({ error: negotiationLockedMessage(thread, order), code: 'NEGOTIATION_LOCKED', negotiation_locked: true, _status: 409 });
}

// v414: revisions / delivery days carried on a counter message -> thread columns that already exist (revision_count, deadline).
export function counterTermsFrom(meta: any, now: number = Date.now()): { revision_count?: number; deadline?: string } {
  const out: { revision_count?: number; deadline?: string } = {};
  const rev = meta?.revision_count;
  if (rev !== undefined && rev !== null && rev !== '' && Number.isFinite(Number(rev)) && Number(rev) >= 0) out.revision_count = Math.round(Number(rev));
  // v414: the deadline moves only when this offer explicitly carried delivery_days (no default 7 days).
  const hasDays = meta && Object.prototype.hasOwnProperty.call(meta, 'delivery_days') && meta.delivery_days !== null && meta.delivery_days !== '';
  const days = hasDays ? Number(meta.delivery_days) : NaN;
  if (hasDays && Number.isFinite(days) && days >= 1) out.deadline = new Date(now + Math.round(days) * 86400000).toISOString().slice(0, 10);
  return out;
}

// v414: the latest counter/offer message in a list (sender + amount). Messages may be newest-first or oldest-first; we sort.
export function latestOfferFrom(messages: any[]): { sender: string | null; amount: number; metadata: any } | null {
  const offers = (messages || []).filter((m: any) => m && m.message_type === 'negotiation_offer');
  if (!offers.length) return null;
  const ts = (m: any) => { const t = new Date(m.created_at || 0).getTime(); return Number.isFinite(t) ? t : 0; };
  // stable: later index wins on equal timestamps (local store is append-only)
  let best = offers[0]; let bestIdx = 0;
  offers.forEach((m: any, i: number) => { if (ts(m) > ts(best) || (ts(m) === ts(best) && i > bestIdx)) { best = m; bestIdx = i; } });
  return {
    sender: best.sender_user_id || best.sender_id || null,
    amount: Number(best.metadata?.proposed_amount) || 0,
    metadata: best.metadata || {},
  };
}

export function setupDealsChatRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    sendNotification,
    serializeChatMessage,
    insertChatMessageToSupabase,
    parseThreadState,
    updateThreadState,
    enrichThread,
    handleThreadApproveLiveLinks,
    handleThreadApproveContent,
    handleThreadSubmitLiveLink,
    handleThreadRejectLiveLinks,
    handleThreadDeclineLiveLinksResubmission,
    getIsTestMode,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    sendNotification: (db: any, userId: string, type: string, message: string) => Promise<any>;
    serializeChatMessage: (a?: any, b?: any, c?: any, d?: any) => any;
    insertChatMessageToSupabase: (payload: any) => Promise<any>;
    parseThreadState: (thread: any) => any;
    updateThreadState: (clientOrThread: any, threadIdOrA?: any, updates?: any) => Promise<any>;
    enrichThread: (thread: any, a?: any, b?: any, c?: any) => any;
    handleThreadApproveLiveLinks: (req: express.Request, res: express.Response) => any;
    handleThreadApproveContent: (req: express.Request, res: express.Response) => any;
    handleThreadSubmitLiveLink: (req: express.Request, res: express.Response) => any;
    handleThreadRejectLiveLinks: (req: express.Request, res: express.Response) => any;
    handleThreadDeclineLiveLinksResubmission: (req: express.Request, res: express.Response) => any;
    getIsTestMode: () => boolean;
  }
) {
  const getIsoNow = () => new Date().toISOString();

  // v414: the UGC order behind a thread (null for campaigns / unknown), so funded UGC orders lock the price.
  const loadUgcOrderFor = async (thread: any): Promise<any> => {
    const orderId = getUgcOrderId(thread);
    if (!orderId) return null;
    const local = (getDb()?.ugc_orders || []).find((o: any) => o.id === orderId) || null;
    const client = privilegedSupabase || supabase;
    if (!client) return local;
    try {
      const { data } = await client.from('ugc_orders').select('*').eq('id', orderId).maybeSingle();
      return data || local;
    } catch (e: any) { logIgnored("deals_chat_routes:loadUgcOrderFor", e); return local; }
  };

  // v417: the minimum comes from the loaded thread's deal type (barter / UGC / campaign), never the URL path.
  const offerFloorFor = async (t: any): Promise<number> => {
    const related: any[] = [];
    const db = getDb();
    const dealId = t?.deal_id && t.deal_id !== t.id ? t.deal_id : (isUuid(t?.id) ? t.id : null);
    const c = privilegedSupabase || supabase;
    if (c && isUuid(dealId)) {
      try { const { data } = await c.from('deals').select('is_barter, campaign_id').eq('id', dealId).maybeSingle(); if (data) related.push(data); }
      catch (e: any) { logIgnored("deals_chat_routes:offer-floor-deal", e); }
    }
    const localDeal = (db.deals || []).find((d: any) => d.id === dealId);
    if (localDeal) related.push(localDeal);
    const campId = t?.campaign_id || related.find((r) => r?.campaign_id)?.campaign_id;
    if (campId) related.push((db.campaigns || []).find((x: any) => x.campaign_id === campId));
    const min = offerMinimumFor(t, ...related);
    // v419: a Ybex in-house brand's campaign deal starts at ₹500 (UGC ₹500 and barter ₹0 stay as they are).
    if (min > INHOUSE_MIN_OFFER && (await isInhouseBrand(t?.brand_id || related.find((r) => r?.brand_id)?.brand_id))) return INHOUSE_MIN_OFFER;
    return min;
  };

  // v414: latest counter (sender + amount) — Supabase first, local store as fallback.
  const loadLatestOffer = async (threadId: string) => {
    const client = privilegedSupabase || supabase;
    if (client) {
      try {
        const { data } = await client
          .from('chat_messages')
          .select('sender_user_id, metadata, created_at, message_type')
          .eq('thread_id', threadId)
          .eq('message_type', 'negotiation_offer')
          .order('created_at', { ascending: false })
          .limit(1);
        const hit = latestOfferFrom(data || []);
        if (hit) return hit;
      } catch (e: any) { logIgnored("deals_chat_routes:loadLatestOffer", e); }
    }
    return latestOfferFrom((getDb()?.chat_messages || []).filter((m: any) => m.thread_id === threadId));
  };

  // v389 (QA, Ravi OK 30 Oct): counter offers, "counter accepted", "agreement prepared" and "I signed" gave the OTHER party no bell / push — with the app
  // closed the deal just sat there (rule 92 was written for exactly this). Same pattern as the payment notification below: best effort, never blocks the
  // request. The other side = creator if the actor is the brand (or brand team), brand if the actor is the creator; staff / third parties send nothing.
  const notifyOtherParty = async (thread: any, actor: any, type: string, message: string) => {
    try {
      if (!thread || !actor) return;
      const actorIsCreator = actor.user_id === thread.creator_id;
      const actorIsBrand = actor.user_id === thread.brand_id || (actor.parent_brand_id && actor.parent_brand_id === thread.brand_id);
      const target = actorIsCreator ? thread.brand_id : actorIsBrand ? thread.creator_id : null;
      if (!target || target === actor.user_id) return;
      await sendNotification(null, target, type, message);
    } catch (e: any) { logIgnored("deals_chat_routes:notifyOtherParty", e); }
  };

  router.post([
    "/campaign/threads/:threadId/approve-request",
    "/chat/v2/threads/:threadId/approve-request"
  ], async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { threadId } = req.params;

    if (supabase) {
      const { data: thread, error: fetchErr } = await supabase
        .from('chat_threads')
        .select('*')
        .eq('id', threadId)
        .maybeSingle();
        
      if (fetchErr || !thread) return res.status(404).json({ error: "Thread not found" });
      if (thread.brand_id !== user.user_id && thread.brand_id !== (user.parent_brand_id || user.user_id) && thread.creator_id !== user.user_id && user.role !== "admin" /* Session 58: brand team members act for their brand */) return res.status(403).json({ error: "Not authorized to modify this thread" });

      // Preparing the agreement is the brand's move, and it resets both signatures — so it must
      // not be callable once anyone has signed. The creator could call it before, and a call
      // after signing silently wiped both signatures.
      if (isCampaignThread(thread)) {
        const role = partyRole(user, thread);
        if (role !== 'brand' && role !== 'admin') return forbid(res, 'brand');
        if (negotiationLockedFor(thread, user) && (thread.agreement_signed_brand || thread.agreement_signed_creator || isClosed(thread))) {
          return res.status(409).json({ error: negotiationLockedMessage(thread), code: 'NEGOTIATION_LOCKED', negotiation_locked: true }); // v414: says who signed
        }
        // Session 58: not while the creator's counter-offer waits (it locked the old price and dropped the counter).
        if (String(thread.flow_state || '').toUpperCase() === 'NEGOTIATING_COUNTER') {
          return conflict(res, 'COUNTER_PENDING', "There's a counter-offer waiting — accept or answer it first.");
        }
      }
      
      const parsed = await enrichThread(supabase, thread);
      
      const creatorName = parsed.creator_name || "Creator";
      const brandName = parsed.brand?.name || parsed.campaigns?.brand_name || "Brand Partner";
      // No invented dates or amounts in a contract. The old fallbacks were a fixed date that has
      // already passed and a flat ₹5000.
      const dueDate = parsed.due_date || thread.deadline || parsed.campaigns?.deadline || parsed.campaigns?.content_deadline || "the date mutually agreed in chat";
      const amountFixed = knownAmount(parsed.amount_fixed, thread.agreed_amount);
      if (!amountFixed) {
        return res.status(400).json({ error: "Agree on an amount in the negotiation before preparing the agreement." });
      }
      const termsAndConditions = parsed.campaigns?.requirements || parsed.campaigns?.deliverables || "Deliver campaign requirements.";

      let agreementContent = "";
      try {
        if (process.env.GEMINI_API_KEY) {
          const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              }
            }
          });
          const promptString = `You are an expert marketing manager at ${brandName}.
Generate a clear, formal, and professional sponsorship campaign agreement between ${brandName} and the creator ${creatorName}.

Details:
- Brand: ${brandName}
- Creator: ${creatorName}
- Work Location: Mumbai, India (or Creator's location)
- Project Due Date: ${dueDate}
- Fixed Payment Amount: INR ${amountFixed}
- Scope of Work: ${termsAndConditions}

The agreement must read like a formal yet simple contract. Break it down into clear numbered sections with clean bullet points. Avoid any mention of AI or machine/humanized descriptors. Make it look like a normal, plain text contract. Ensure the payment of INR ${amountFixed} is clearly presented, but explicitly state that this amount is subject to a standard platform fee deduction from the creator's final payout.`;

          const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: promptString,
          });
          agreementContent = response.text || "";
        }
      } catch (err) {
        console.error("Gemini API error during agreement generation:", err);
      }

      if (!agreementContent) {
        agreementContent = `### CAMPAIGN COLLABORATION AGREEMENT

This agreement is entered into between **${brandName}** ("Brand") and **${creatorName}** ("Creator").

**1. Project Deliverables & Due Date**
The Creator agrees to deliver high-quality content as specified below by **${dueDate}**:
* ${termsAndConditions}

**2. Compensation**
Upon successful completion, review, and publication of the content, the Brand shall pay the Creator a fixed sum of **INR ${amountFixed}** (subject to standard Convenience fee & TDS deductions from the final payout).

**3. Location of Work**
All production and creative styling will take place remotely at Creator's designated location.

We are pleased to partner with you to bring this campaign to life!`;
      }

      await updateThreadState(supabase, threadId, {
        flow_state: "AI_AGREEMENT_READY",
        ai_generated_agreement: agreementContent,
        amount_fixed: amountFixed,
        agreement_signed_creator: false,
        agreement_signed_brand: false,
        agreement_signed_at: null
      });

      const msgContent = serializeChatMessage(
        `Hello ${creatorName}! We've approved your application and prepared the sponsorship agreement for you. Please review the terms and let me know if you are ready to sign or would like to propose a counter offer!`,
        "text",
        "brand",
        null
      );

      await insertChatMessageToSupabase({
        message_id: crypto.randomUUID(),
        thread_id: threadId,
        sender_user_id: thread.brand_id,
        text: msgContent,
        message_type: 'system',
        metadata: { action: 'sponsorship_agreement_prepared', amount_fixed: amountFixed },
        created_at: new Date().toISOString()
      });

      const updatedThread = await (privilegedSupabase || supabase).from('chat_threads').select('*').eq('id', threadId).maybeSingle();
      await notifyOtherParty(thread, user, "agreement_ready", "📄 Your agreement is ready. Open the chat to review the terms and sign."); // v389
      return res.json({ success: true, thread: await enrichThread(supabase, updatedThread.data) });
    }

    const db = getDb();
    const thread = db.chat_threads?.find(t => t.id === threadId);
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    if (isCampaignThread(thread)) {
      const role = partyRole(user, thread);
      if (role !== 'brand' && role !== 'admin') return forbid(res, 'brand');
      if (thread.agreement_signed_brand || thread.agreement_signed_creator || isClosed(thread)) {
        return res.status(409).json({ error: negotiationLockedMessage(thread), code: 'NEGOTIATION_LOCKED', negotiation_locked: true }); // v414: says who signed
      }
    }
    const amountFixed = knownAmount(thread.amount_fixed, thread.agreed_amount);
    if (!amountFixed) {
      return res.status(400).json({ error: "Agree on an amount in the negotiation before preparing the agreement." });
    }

    // Transition state
    thread.flow_state = "APPROVED";
    
    // Now generate the formal agreement!
    const creatorName = thread.creator_name || "Creator";
    const brandName = thread.brand_name || "Brand Partner";
    const dueDate = thread.due_date || thread.deadline || "the date mutually agreed in chat";
    const termsAndConditions = thread.terms_and_conditions || "Deliver 1 high-quality Instagram Reel and 1 Story promoting the campaign. Ensure clear visuals and tag the brand account.";

    let agreementContent = "";
    try {
      if (process.env.GEMINI_API_KEY) {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });
        const promptString = `You are an expert marketing manager at ${brandName}.
Generate a clear, formal, and professional sponsorship campaign agreement between ${brandName} and the creator ${creatorName}.

Details:
- Brand: ${brandName}
- Creator: ${creatorName}
- Work Location: Mumbai, India (or Creator's location)
- Project Due Date: ${dueDate}
- Fixed Payment Amount: INR ${amountFixed}
- Scope of Work: ${termsAndConditions}

The agreement must read like a formal yet simple contract. Break it down into clear numbered sections with clean bullet points. Avoid any mention of AI or machine/humanized descriptors. Make it look like a normal, plain text contract. Ensure the payment of INR ${amountFixed} is clearly presented, but explicitly state that this amount is subject to a standard platform fee deduction from the creator's final payout.`;

        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-lite",
          contents: promptString,
        });
        agreementContent = response.text || "";
      }
    } catch (err) {
      console.error("Gemini API error during agreement generation:", err);
    }

    // Fallback if Gemini fails or is not configured
    if (!agreementContent) {
      agreementContent = `### CAMPAIGN COLLABORATION AGREEMENT

This agreement is entered into between **${brandName}** ("Brand") and **${creatorName}** ("Creator").

**1. Project Deliverables & Due Date**
The Creator agrees to deliver high-quality content as specified below by **${dueDate}**:
* ${termsAndConditions}

**2. Compensation**
Upon successful completion, review, and publication of the content, the Brand shall pay the Creator a fixed sum of **INR ${amountFixed}** (subject to standard Convenience fee & TDS deductions from the final payout).

**3. Location of Work**
All production and creative styling will take place remotely at Creator's designated location.

We are pleased to partner with you to bring this campaign to life!`;
    }

    thread.ai_generated_agreement = agreementContent;
    thread.flow_state = "AI_AGREEMENT_READY";

    // Add default initial message from brand
    db.chat_messages.push({
      id: `msg_${Math.random().toString(36).substring(2, 10)}`,
      message_id: `msg_${Math.random().toString(36).substring(2, 10)}`,
      thread_id: threadId,
      sender_id: thread.brand_id,
      sender_role: "brand",
      message_type: "text",
      content: `Hello ${creatorName}! We've approved your application and prepared the sponsorship agreement for you. Please review the terms and let me know if you are ready to sign or would like to propose a counter offer!`,
      created_at: new Date().toISOString()
    });

    saveDb(db);
    res.json({ success: true, thread });
  });


  router.post([
    "/campaign/threads/:threadId/pay",
    "/chat/v2/threads/:threadId/pay"
  ], async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { threadId } = req.params;
    const nowIso = getIsoNow();

    if (supabase) {
      const { data: thread, error: fetchErr } = await supabase
        .from('chat_threads')
        .select('*')
        .eq('id', threadId)
        .maybeSingle();

      if (fetchErr || !thread) return res.status(404).json({ error: "Thread not found" });
      if (thread.brand_id !== user.user_id && thread.brand_id !== (user.parent_brand_id || user.user_id) && thread.creator_id !== user.user_id && user.role !== "admin" /* Session 58: brand team members act for their brand */) {
        return res.status(403).json({ error: "Not authorized to modify this thread" });
      }
      const isCampaignPay = isCampaignThread(thread);
      if (isCampaignPay) {
        const role = partyRole(user, thread);
        if (role !== 'brand' && role !== 'admin') return forbid(res, 'brand');
        if (isClosed(thread)) return conflict(res, 'DEAL_CLOSED', "This deal is already complete.");
      }

      // Verify that a matching valid transaction exists
      const targetDealId = thread.deal_id || threadId;
      let hasVerifiedPayment = false;
      let verifiedAmount = Number(thread.agreed_amount || thread.amount_fixed) || 0;

      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetDealId);
        let txnQuery = supabase.from('transactions').select('*');
        if (isUuid) {
          txnQuery = txnQuery.or(`deal_id.eq.${targetDealId},id.eq.${targetDealId},ugc_order_id.eq.${targetDealId},deal_id.eq.${threadId},ugc_order_id.eq.${threadId}`);
        } else {
          txnQuery = txnQuery.or(`ugc_order_id.eq.${targetDealId},ugc_order_id.eq.${threadId}`);
        }
        const { data: txns } = await txnQuery;
        if (txns && txns.length > 0) {
          // Campaign: only a real escrow DEPOSIT counts. A refund row also has status SUCCESS
          // and used to be accepted as proof of payment.
          // v347 (Ravi approved): UGC now uses the same rule — a refunded / refund-in-progress row (status still
          // SUCCESS) or a row that is only payout_status PENDING is not proof the brand's money is held.
          const validTx = txns.find((t: any) => isEscrowDepositRow(t));
          if (validTx) {
            hasVerifiedPayment = true;
            // The deposit's size is reported, but it no longer overwrites the agreed amount.
            if (validTx.gross_amount) verifiedAmount = Number(validTx.gross_amount);
          }
        }
      } catch (txErr) {
        console.warn("[Thread Pay Callback] Txn lookup error:", txErr);
      }

      // Check if thread was previously marked funded or in dev test mode (Issue #7 Fix: Use centralized test mode detection)
      if (!hasVerifiedPayment && (thread.payment_funded || getIsTestMode())) {
        hasVerifiedPayment = true;
      }

      if (!hasVerifiedPayment) {
        return res.status(400).json({ error: "No verified escrow payment found for this thread/deal. Please complete payment first." });
      }
      // Session 58: a second "Pay" tap (already paid) re-ran this and dragged a deal that was already in production
      // (draft submitted, approved, live link…) back to ACTIVE. Work already started → nothing to change.
      {
        const fs = String(thread.flow_state || '').toUpperCase();
        const WORK_STARTED = ['SUBMITTED', 'CHANGES_REQUESTED', 'REVISION_REQUESTED', 'REVISION_REQ', 'REVISION_DECLINED', 'CONTENT_APPROVED', 'AWAITING_LIVE_LINK', 'PROOF_SUBMITTED', 'REVISION_REQUESTED_LINKS', 'REVISION_DECLINED_LINKS', 'LINKS_UNDER_REVIEW', 'COMPLETED'];
        if (WORK_STARTED.includes(fs)) return res.json({ success: true, already_funded: true, flow_state: thread.flow_state });
      }

      const parsed = parseThreadState(thread);
      const amountVal = isCampaignPay
        ? knownAmount(thread.agreed_amount, parsed.amount_fixed, verifiedAmount)
        : knownAmount(verifiedAmount, parsed.amount_fixed, thread.agreed_amount); // v347 (Ravi approved): no invented ₹5,000
      // v347 (Ravi approved): a UGC order whose amount is unknown is NOT marked funded (the old code wrote ₹5,000).
      if (!isCampaignPay && !(amountVal > 0)) {
        return res.status(409).json({ error: "We couldn't confirm the payment amount for this order yet. Please try again in a moment.", code: "AMOUNT_UNCONFIRMED", retry: true });
      }

      // Update thread state to ACTIVE and funded
      await updateThreadState(supabase, threadId, {
        flow_state: "ACTIVE",
        payment_funded: true,
        escrow_funded: true,
        funded_at: nowIso
      });

      if (isCampaignPay) {
        // chat_threads has no payment_funded column, so this write used to fail as a whole
        // (Postgres 42703) — and the agreed_amount in it was the deposit's gross, which would
        // have rewritten the contract amount. Funding lives on the deal (escrow_hold below).
        const { error: thrErr } = await (privilegedSupabase || supabase).from('chat_threads').update({
          status: 'ACTIVE',
          flow_state: 'ACTIVE',
          updated_at: nowIso
        }).eq('id', threadId);
        if (thrErr) console.error("[Thread Pay Callback] chat_threads update error:", thrErr.message || thrErr);
      } else {
        // Session 58 (bug hunt): chat_threads has no payment_funded column — that made this whole update fail
        // (same bug fixed earlier for campaign deals). Funding lives on the order (escrow_hold below).
        await (privilegedSupabase || supabase).from('chat_threads').update({
          status: 'ACTIVE',
          flow_state: 'ACTIVE',
          agreed_amount: amountVal,
          updated_at: nowIso
        }).eq('id', threadId);
      }

      // Update related deal or ugc_order
      if (parsed.is_ugc && parsed.ugc_order_id) {
        await (privilegedSupabase || supabase).from('ugc_orders').update({
          status: 'IN_PROGRESS',
          payment_status: 'ESCROW_HELD',
          escrow_hold: true,
          updated_at: nowIso
        }).eq('id', parsed.ugc_order_id);
      } else if (thread.deal_id) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(thread.deal_id);
        if (isUuid) {
          await (privilegedSupabase || supabase).from('deals').update({
            status: 'ACTIVE',
            escrow_hold: true,
            escrow_hold_at: nowIso,
            updated_at: nowIso
          }).eq('id', thread.deal_id);
        } else {
          await (privilegedSupabase || supabase).from('ugc_orders').update({
            status: 'IN_PROGRESS',
            payment_status: 'ESCROW_HELD',
            escrow_hold: true,
            escrow_held_at: nowIso,
            updated_at: nowIso
          }).eq('id', thread.deal_id);
        }
      }

      // Insert system message into chat if not already inserted
      let hasRecentPaymentMsg = false;
      if (supabase) {
        try {
          const { data: recentMsgs } = await (privilegedSupabase || supabase)
            .from('chat_messages')
            // Session 58: chat_messages has no "id" column — selecting it failed the whole check, so every
            // payment posted "💰 Payment Secured!" twice (once from verify, once from this follow-up).
            .select('message_id, message_type, metadata, created_at')
            .eq('thread_id', threadId)
            .order('created_at', { ascending: false })
            .limit(20);
          if (recentMsgs && recentMsgs.some((m: any) => 
            m.message_type === 'payment_secured' || 
            m.message_type === 'payment_funded' || 
            m.metadata?.action === 'payment_secured' || 
            m.metadata?.action === 'escrow_funded'
          )) {
            hasRecentPaymentMsg = true;
          }
        } catch (chkErr: any) { logIgnored("deals_chat_routes:484", chkErr); }
      }

      let msgRecord: any = null;
      if (!hasRecentPaymentMsg) {
        const msgText = amountVal
          ? `💰 Payment Secured! ₹${amountVal.toLocaleString('en-IN')} has been deposited and is now held safely in escrow. The creator can begin work.`
          : `💰 Payment Secured! The payment has been deposited and is now held safely in a secure payment hold. The creator can begin work.`;
        const sysContent = serializeChatMessage(
          msgText,
          "payment_secured",
          "system",
          { action: 'payment_secured', amount: amountVal, paid_at: nowIso }
        );

        const isUuid = (val: any) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
        const senderUid = isUuid(thread.brand_id) ? thread.brand_id : (isUuid(user?.user_id) ? user.user_id : null);

        msgRecord = {
          message_id: crypto.randomUUID(),
          thread_id: threadId,
          sender_user_id: senderUid,
          text: sysContent,
          message_type: 'payment_secured',
          metadata: { action: 'payment_secured', amount: amountVal, paid_at: nowIso },
          created_at: nowIso
        };

        await insertChatMessageToSupabase(msgRecord);
      }

      // Send notification to creator
      if (thread.creator_id) {
        try {
          await sendNotification(
            null,
            thread.creator_id,
            "payment_funded",
            amountVal
              ? `💳 A payment of ₹${amountVal.toLocaleString('en-IN')} secured for your collaboration! You can now start work.`
              : `💳 Payment secured for your collaboration! You can now start work.`
          );
        } catch (notifErr: any) { logIgnored("deals_chat_routes:526", notifErr); }
      }

      // Emit Socket.io event in real time
      const io = req.app.get("io");
      if (io) {
        if (msgRecord) {
          io.to(threadId).emit("new_message", msgRecord);
        }
        emitThreadEvent(io, "thread_updated", {
          id: threadId,
          threadId: threadId,
          status: "ACTIVE",
          payment_funded: true,
          ...(msgRecord ? { lastMessage: msgRecord } : {})
        });
      }

      const updatedThread = await (privilegedSupabase || supabase).from('chat_threads').select('*').eq('id', threadId).maybeSingle();
      return res.json({ success: true, message: "Payment recorded and thread activated", thread: await enrichThread(supabase, updatedThread.data) });
    }

    // Memory DB Fallback
    const db = getDb();
    const thread = db.chat_threads?.find((t: any) => t.id === threadId);
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    if (isCampaignThread(thread)) {
      const role = partyRole(user, thread);
      if (role !== 'brand' && role !== 'admin') return forbid(res, 'brand');
      if (isClosed(thread)) return conflict(res, 'DEAL_CLOSED', "This deal is already complete.");
    }

    thread.status = "ACTIVE";
    thread.payment_funded = true;
    thread.flow_state = "ACTIVE";
    const amountVal = knownAmount(thread.agreed_amount, thread.amount_fixed); // v347 (Ravi approved): no invented ₹5,000 (local dev store only)

    const msgRecord = {
      id: `msg_${Math.random().toString(36).substring(2, 10)}`,
      message_id: `msg_${Math.random().toString(36).substring(2, 10)}`,
      thread_id: threadId,
      sender_id: "system",
      sender_role: "system",
      message_type: "system",
      content: `💳 Payment Secured! The funds${amountVal ? ` of ₹${amountVal.toLocaleString('en-IN')}` : ''} have been safely deposited into a secure payment hold. Work can now proceed!`,
      created_at: nowIso
    };

    if (!db.chat_messages) db.chat_messages = [];
    db.chat_messages.push(msgRecord);

    if (thread.deal_id) {
      const d = (db.deals || []).find((x: any) => x.id === thread.deal_id);
      if (d) {
        d.status = "ACTIVE";
        d.payment_status = "ESCROW_HELD";
        d.payment_funded = true;
      }
      const uo = (db.ugc_orders || []).find((x: any) => x.id === thread.deal_id);
      if (uo) {
        uo.status = "IN_PROGRESS";
        uo.payment_status = "ESCROW_HELD";
      }
    }

    saveDb(db);

    const io = req.app.get("io");
    if (io) {
      io.to(threadId).emit("new_message", msgRecord);
      emitThreadEvent(io, "thread_updated", {
        id: threadId,
        threadId: threadId,
        status: "ACTIVE",
        payment_funded: true,
        lastMessage: msgRecord
      });
    }

    res.json({ success: true, message: "Payment recorded and thread activated", thread });
  });


  router.post([
    "/campaign/threads/:threadId/creator-approve-agreement",
    "/chat/v2/threads/:threadId/creator-approve-agreement"
  ], async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { threadId } = req.params;

    // RETIRED. This legacy shortcut set BOTH signatures in one call, whoever made it — the brand
    // could sign for the creator and vice versa — and then threw on a missing amount after the
    // signatures were already written. Nothing in the app calls it; signing goes through /sign,
    // where each side signs for itself.
    if (threadId) {
      return res.status(410).json({
        error: "This endpoint has been retired. Each party signs through /sign.",
        code: 'ENDPOINT_RETIRED'
      });
    }

    if (supabase) {
      const { data: thread, error: fetchErr } = await supabase
        .from('chat_threads')
        .select('*')
        .eq('id', threadId)
        .maybeSingle();
        
      if (fetchErr || !thread) return res.status(404).json({ error: "Thread not found" });
      if (thread.brand_id !== user.user_id && thread.brand_id !== (user.parent_brand_id || user.user_id) && thread.creator_id !== user.user_id && user.role !== "admin" /* Session 58: brand team members act for their brand */) return res.status(403).json({ error: "Not authorized to modify this thread" });
      
      const parsed = parseThreadState(thread);

      // Save signed status
      await updateThreadState(supabase, threadId, {
        flow_state: "ACTIVE",
        agreement_signed_creator: true,
        agreement_signed_brand: true,
        agreement_signed_at: new Date().toISOString()
      });

      // Update actual status to ACTIVE and sync agreed_amount and updated_at
      await (privilegedSupabase || supabase).from('chat_threads').update({
        status: 'ACTIVE',
        flow_state: 'ACTIVE',
        agreed_amount: parsed.amount_fixed,
        updated_at: new Date().toISOString()
      }).eq('id', threadId);

      // Update related records
      if (parsed.is_ugc && parsed.ugc_order_id) {
        // Update ugc_orders to IN_PROGRESS
        await (privilegedSupabase || supabase).from('ugc_orders').update({ status: 'IN_PROGRESS' }).eq('id', parsed.ugc_order_id);
      } else if (thread.deal_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(thread.deal_id)) {
        // Update campaign deals to ACTIVE
        await (privilegedSupabase || supabase).from('deals').update({
          status: 'ACTIVE',
          agreed_amount: parsed.amount_fixed,
          agreement_signed_creator: true,
          agreement_signed_brand: true,
          agreement_signed_at: new Date().toISOString()
        }).eq('id', thread.deal_id);
      }

      const sysContent = serializeChatMessage(
        `🎉 Agreement Approved! The sponsorship contract of ₹${parsed.amount_fixed.toLocaleString('en-IN')} is signed and locked. Chats are now fully activated.`,
        "system",
        "system",
        null
      );

      await insertChatMessageToSupabase({
        message_id: crypto.randomUUID(),
        thread_id: threadId,
        sender_user_id: thread.creator_id,
        text: sysContent,
        message_type: 'system',
        metadata: { action: 'agreement_approved', amount_fixed: parsed.amount_fixed },
        created_at: new Date().toISOString()
      });

      const updatedThread = await (privilegedSupabase || supabase).from('chat_threads').select('*').eq('id', threadId).maybeSingle();
      return res.json({ success: true, thread: await enrichThread(supabase, updatedThread.data) });
    }

    const db = getDb();
    const thread = db.chat_threads?.find(t => t.id === threadId);
    if (!thread) return res.status(404).json({ error: "Thread not found" });

    thread.flow_state = "COMPLETED";
    thread.status = "ACTIVE"; // Mark thread active
    thread.agreed_amount = thread.amount_fixed;

    db.chat_messages.push({
      id: `msg_${Math.random().toString(36).substring(2, 10)}`,
      message_id: `msg_${Math.random().toString(36).substring(2, 10)}`,
      thread_id: threadId,
      sender_id: "system",
      sender_role: "system",
      message_type: "system",
      content: `🎉 Agreement Approved! The sponsorship contract of ₹${thread.amount_fixed.toLocaleString('en-IN')} is signed and locked in a secure payment hold. Chats are now fully activated.`,
      created_at: new Date().toISOString()
    });

    saveDb(db);
    res.json({ success: true, thread });
  });


  router.post([
    "/campaign/threads/:threadId/sign",
    "/ugc/threads/:threadId/sign",
    "/chat/v2/threads/:threadId/sign"
  ], async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { threadId } = req.params;
    const { offer_id, signatureText } = req.body || {};
    // The representative's mobile number from the signing screen, kept with the signature record.
    const signerMobileRaw = String(req.body?.signer_mobile || '').replace(/\D/g, '').slice(-10);
    const signer_mobile = /^[6-9]\d{9}$/.test(signerMobileRaw) ? signerMobileRaw : null;

    let thread: any = null;

    if (supabase) {
      try {
        const { data: tData, error: fetchErr } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .eq('id', threadId)
          .maybeSingle();
        if (tData) thread = tData;
      } catch (e: any) { logIgnored("deals_chat_routes:739", e); }
    }

    const db = getDb();
    if (!thread && db.chat_threads) {
      thread = db.chat_threads.find((t: any) => t.id === threadId || t.thread_id === threadId);
    }

    if (!thread) return res.status(404).json({ error: "Thread not found" });

    const creatorId = thread.creator_id || thread.creator?.id;
    const brandId = thread.brand_id || thread.brand?.id || thread.brand_user_id;

    const isCampaignSign = isCampaignThread(thread);
    let isCreator: boolean;
    let isBrand: boolean;
    if (isCampaignSign) {
      // CAMPAIGN: you sign for your own side of THIS deal, and nothing else. The loose check
      // below treated ANY creator on the platform as "the creator" (any user whose id was not
      // the brand's), and any brand as "the brand".
      const role = partyRole(user, thread);
      isCreator = role === 'creator';
      isBrand = role === 'brand';
    } else {
      // Session 53 (security): on UGC threads too, you sign only your own side. The old loose rule
      // let ANY creator sign as "the creator" and ANY brand as "the brand" when both ids were known.
      // The loose fallback stays only for a side whose id the thread doesn't carry.
      isCreator = creatorId ? String(user.user_id) === String(creatorId)
        : (user.role === 'creator' && (!brandId || user.user_id !== brandId));
      isBrand = brandId ? (String(user.user_id) === String(brandId) || String(user.parent_brand_id || '') === String(brandId))
        : (user.role === 'brand' && (!creatorId || user.user_id !== creatorId));
    }

    if (!isCreator && !isBrand && user.role !== 'admin') {
      return res.status(403).json({ error: "Not authorized to sign this agreement" });
    }

    if (isCampaignSign) {
      if (isClosed(thread)) {
        return conflict(res, 'DEAL_CLOSED', "This deal is already complete.");
      }
      // Signing again used to rewrite status/flow_state to ACTIVE — dragging a deal that had
      // moved on (in review, completed) back to the start, and posting a second "executed" card.
      const alreadySigned = (isCreator && thread.agreement_signed_creator) || (isBrand && thread.agreement_signed_brand) ||
        (user.role === 'admin' && thread.agreement_signed_creator && thread.agreement_signed_brand);
      if (alreadySigned) {
        return res.json({
          success: true,
          already_signed: true,
          signed_by: isCreator ? "creator" : (isBrand ? "brand" : "admin"),
          both_signed: Boolean(thread.agreement_signed_creator && thread.agreement_signed_brand),
          thread
        });
      }
      // Session 58: no signing while a counter-offer waits, or before a price is agreed — a brand could sign the old
      // amount from a stale card, locking the deal while the creator's screen showed the newer price.
      if (String(thread.flow_state || '').toUpperCase() === 'NEGOTIATING_COUNTER') {
        return conflict(res, 'COUNTER_PENDING', "There's a counter-offer waiting — accept or answer it before signing.");
      }
      const agreedNow = knownAmount(thread.agreed_amount);
      if (!agreedNow) return conflict(res, 'PRICE_NOT_AGREED', "Agree on the price first, then sign.");
      const shown = Number(req.body?.amount ?? req.body?.agreed_amount);
      if (Number.isFinite(shown) && shown > 0 && Math.round(shown) !== Math.round(agreedNow)) {
        return conflict(res, 'AMOUNT_CHANGED', `The agreed amount is now ₹${Math.round(agreedNow).toLocaleString('en-IN')} — please review the updated contract.`, { current_amount: Math.round(agreedNow) }); // v414: current amount for the app
      }
    }

    // v414: UGC sign gets the same stale-amount check when the app sends the amount it showed (no amount = old app, still allowed).
    if (!isCampaignSign) {
      const agreedUgc = knownAmount(thread.agreed_amount);
      const shownUgc = Number(req.body?.amount ?? req.body?.agreed_amount);
      if (agreedUgc && Number.isFinite(shownUgc) && shownUgc > 0 && Math.round(shownUgc) !== Math.round(agreedUgc)) {
        return conflict(res, 'AMOUNT_CHANGED', `The agreed amount is now ₹${Math.round(agreedUgc).toLocaleString('en-IN')} — please review the updated contract.`, { current_amount: Math.round(agreedUgc) });
      }
    }

    // The email OTP must have been verified on the server (backend/signTokens.ts).
    if (user.role !== 'admin' && !(await consumeSignToken(user.user_id, req.body?.sign_token))) {
      return signOtpRequired(res);
    }
    const signMeta = user.role === 'admin' ? null : takeLastSignMeta(user.user_id);

    // Session 28: permanent signature record (backend/agreementRecord.ts). Never blocks signing.
    {
      const st = parseThreadState(thread);
      const adminFor = user.role === 'admin' ? (thread.agreement_signed_creator ? brandId : creatorId) : null;
      await recordAgreementSignature(privilegedSupabase || supabase, supabase ? null : getDb(), {
        kind: st.is_ugc ? "ugc" : "campaign",
        req, user,
        signerRole: isCreator ? "creator" : (isBrand ? "brand" : "admin"),
        actingBrandId: isBrand ? (user.parent_brand_id || brandId || null) : null,
        onBehalfOfUserId: adminFor,
        signMeta,
        threadId,
        dealId: thread.deal_id || null,
        campaignId: thread.campaign_id || null,
        amount: Number(thread.agreed_amount || thread.amount_fixed || st.amount_fixed || st.agreed_amount || 0),
        summary: [`Thread: ${threadId}`, `Brand: ${brandId || "-"}`, `Creator: ${creatorId || "-"}`],
      });
    }

    let signedCreator = Boolean(thread.agreement_signed_creator);
    let signedBrand = Boolean(thread.agreement_signed_brand);

    if (isCreator) {
      signedCreator = true;
    } else if (isBrand) {
      signedBrand = true;
    } else if (user.role === 'admin') {
      if (!signedCreator) signedCreator = true;
      else if (!signedBrand) signedBrand = true;
      else { signedCreator = true; signedBrand = true; }
    }

    // v414: write ONLY this signer's column(s) first, then re-read the row — two people signing at the same moment each
    // wrote BOTH flags from their own older read, so one signature was lost.
    const ownSig: any = {};
    if (signedCreator && !thread.agreement_signed_creator) ownSig.agreement_signed_creator = true;
    if (signedBrand && !thread.agreement_signed_brand) ownSig.agreement_signed_brand = true;
    if (supabase && Object.keys(ownSig).length) {
      const sigClient = privilegedSupabase || supabase;
      try {
        await sigClient.from('chat_threads').update({ ...ownSig, updated_at: new Date().toISOString() }).eq('id', threadId);
        const { data: freshSig } = await sigClient.from('chat_threads')
          .select('agreement_signed_creator, agreement_signed_brand, agreement_signed_at, flow_state, status')
          .eq('id', threadId).maybeSingle();
        if (freshSig) {
          signedCreator = signedCreator || Boolean(freshSig.agreement_signed_creator);
          signedBrand = signedBrand || Boolean(freshSig.agreement_signed_brand);
          if (freshSig.agreement_signed_at && !thread.agreement_signed_at) thread.agreement_signed_at = freshSig.agreement_signed_at;
        }
      } catch (e: any) { logIgnored("deals_chat_routes:signOwnColumn", e); }
    }

    const parsed = parseThreadState(thread);
    const bothSigned = parsed.is_ugc ? signedCreator : (signedCreator && signedBrand);

    const signedAt = (bothSigned && !thread.agreement_signed_at)
      ? new Date().toISOString()
      : (thread.agreement_signed_at || (bothSigned ? new Date().toISOString() : null));

    const resolvedAmount = Number(thread.agreed_amount || thread.amount_fixed || parsed.amount_fixed || parsed.agreed_amount || 0);

    const specificMessageType = bothSigned
      ? 'agreement_executed'
      : (isCreator ? 'creator_signed' : 'brand_signed');

    const msgText = bothSigned
      ? (parsed.is_ugc 
          ? `🎉 Agreement Executed! Creator has signed the UGC contract${resolvedAmount ? ` of ₹${resolvedAmount.toLocaleString('en-IN')}` : ''}. The deal is now ACTIVE. Brand can proceed to secure payment in a secure payment hold to begin work.`
          : `🎉 Agreement Executed! Both parties have signed the contract${resolvedAmount ? ` of ₹${resolvedAmount.toLocaleString('en-IN')}` : ''}. The deal is now ACTIVE. Brand can proceed to secure payment in a secure payment hold to begin work.`)
      : isCreator
        ? `✍️ Creator has signed the partnership agreement. Awaiting Brand signature to execute contract.`
        : `✍️ Brand has signed the partnership agreement. Awaiting Creator signature to execute contract.`;

    const agreementMsgId = crypto.randomUUID();

    if (supabase) {
      try {
        // v414: signature columns were written above (own column only); here only flow/state, decided from the re-read.
        const threadUpdates: any = {
          ...ownSig,
          updated_at: new Date().toISOString()
        };
        if (signedAt) threadUpdates.agreement_signed_at = signedAt;
        if (bothSigned) {
          threadUpdates.status = 'ACTIVE';
          threadUpdates.flow_state = 'ACTIVE';
        } else {
          threadUpdates.flow_state = 'AGREEMENT_SIGNED';
        }
        if (resolvedAmount > 0) {
          threadUpdates.agreed_amount = resolvedAmount;
        }

        if (bothSigned) {
          await (privilegedSupabase || supabase).from('chat_threads').update(threadUpdates).eq('id', threadId);
          const stateUpdates: any = { ...ownSig, flow_state: "ACTIVE", agreement_signed_at: signedAt };
          await updateThreadState(supabase, threadId, stateUpdates);
        } else {
          // v414: one signature — never overwrite an ACTIVE written by the other signer a moment ago; status is left alone.
          await (privilegedSupabase || supabase).from('chat_threads').update(threadUpdates).eq('id', threadId).or('flow_state.is.null,flow_state.neq.ACTIVE'); // v414: .neq alone skipped rows with a NULL flow_state
        }

        // Update related deal / collabs if linked
        const isUuidDeal = thread.deal_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(thread.deal_id);
        if (isUuidDeal) {
          const dealUpdates: any = {
            ...ownSig, // v414: only this signer's column (see above)
            ...(bothSigned ? { agreement_signed_creator: true, agreement_signed_brand: true } : {}),
            updated_at: new Date().toISOString()
          };
          if (signedAt) dealUpdates.agreement_signed_at = signedAt;
          if (bothSigned) {
            dealUpdates.status = 'ACTIVE';
          }
          if (resolvedAmount > 0) {
            dealUpdates.agreed_amount = resolvedAmount;
          }

          await (privilegedSupabase || supabase).from('deals').update(dealUpdates).eq('id', thread.deal_id);

          try {
            await (privilegedSupabase || supabase).from('collabs').update({
              status: bothSigned ? 'ACTIVE' : thread.status
            }).eq('collab_id', thread.deal_id);
          } catch (e: any) { logIgnored("deals_chat_routes:885", e); }
        }

        if (bothSigned && (parsed.is_ugc || threadId.startsWith('ugcord_') || thread.ugc_order_id)) {
          const ugcId = thread.ugc_order_id || (threadId.startsWith('ugcord_') ? threadId : null);
          if (ugcId) {
            await (privilegedSupabase || supabase).from('ugc_orders').update({ status: 'IN_PROGRESS' }).eq('id', ugcId);
          }
        }

        const sysContent = serializeChatMessage(msgText, "system", "system", null);
        await insertChatMessageToSupabase({
          message_id: agreementMsgId,
          thread_id: threadId,
          sender_user_id: user.user_id,
          text: sysContent,
          message_type: specificMessageType,
          metadata: { action: 'agreement_signed', signer_id: user.user_id, signer_mobile, signed_at: new Date().toISOString(), offer_id, message_type: specificMessageType },
          created_at: new Date().toISOString()
        });
      } catch (err) {
        console.error("Error persisting agreement signature in Supabase:", err);
      }
    }

    // Mock DB synchronization
    const mockT = db.chat_threads?.find((t: any) => t.id === threadId || t.thread_id === threadId);
    if (mockT) {
      mockT.agreement_signed_creator = signedCreator;
      mockT.agreement_signed_brand = signedBrand;
      if (signedAt) mockT.agreement_signed_at = signedAt;
      if (bothSigned) {
        mockT.status = 'ACTIVE';
        mockT.flow_state = 'ACTIVE';
      } else {
        mockT.flow_state = 'AGREEMENT_SIGNED';
      }
      if (resolvedAmount > 0) mockT.agreed_amount = resolvedAmount;
    }

    if (thread.deal_id) {
      const mockDeal = db.deals?.find((d: any) => d.id === thread.deal_id || d.deal_id === thread.deal_id);
      if (mockDeal) {
        mockDeal.agreement_signed_creator = signedCreator;
        mockDeal.agreement_signed_brand = signedBrand;
        if (signedAt) mockDeal.agreement_signed_at = signedAt;
        if (bothSigned) {
          mockDeal.status = 'ACTIVE';
          mockDeal.stage = 'ACTIVE';
        }
        if (resolvedAmount > 0) mockDeal.agreed_amount = resolvedAmount;
      }
      const mockCollab = db.collabs?.find((c: any) => c.collab_id === thread.deal_id || c.id === thread.deal_id);
      if (mockCollab && bothSigned) {
        mockCollab.status = 'ACTIVE';
        mockCollab.stage = 'ACTIVE';
      }
    }

    if (bothSigned) {
      const ugcId = thread.ugc_order_id || (threadId.startsWith('ugcord_') ? threadId : null);
      if (ugcId && db.ugc_orders) {
        const uo = db.ugc_orders.find((o: any) => o.id === ugcId);
        if (uo) uo.status = 'IN_PROGRESS';
      }
    }

    if (db.chat_messages) {
      db.chat_messages.push({
        id: agreementMsgId,
        message_id: agreementMsgId,
        thread_id: threadId,
        sender_id: user.user_id,
        sender_role: "system",
        message_type: specificMessageType,
        content: msgText,
        metadata: { action: 'agreement_signed', signer_id: user.user_id, signer_mobile, signed_at: new Date().toISOString(), offer_id, message_type: specificMessageType },
        created_at: new Date().toISOString()
      });
    }
    saveDb(db);

    try {
      const ioInstance = req.app.get("io") || null;
      if (ioInstance) {
        const msgRecord = {
          id: agreementMsgId,
          message_id: agreementMsgId,
          thread_id: threadId,
          sender_id: user.user_id,
          sender_user_id: user.user_id,
          sender_role: "system",
          message_type: specificMessageType,
          content: msgText,
          text: msgText,
          metadata: { action: 'agreement_signed', signer_id: user.user_id, signer_mobile, signed_at: new Date().toISOString(), offer_id, message_type: specificMessageType },
          created_at: new Date().toISOString()
        };

        const threadUpdatePayload = {
          id: threadId,
          threadId: threadId,
          thread_id: threadId,
          status: bothSigned ? 'ACTIVE' : thread.status,
          flow_state: bothSigned ? 'ACTIVE' : 'AGREEMENT_SIGNED',
          agreement_signed_creator: signedCreator,
          agreement_signed_brand: signedBrand,
          agreement_signed_at: signedAt,
          agreed_amount: resolvedAmount > 0 ? resolvedAmount : thread.agreed_amount,
          both_signed: bothSigned,
          signed_by: isCreator ? "creator" : (isBrand ? "brand" : "admin")
        };

        ioInstance.to(threadId).emit("new_message", msgRecord);
        ioInstance.to(`thread_${threadId}`).emit("new_message", msgRecord);

        emitThreadEvent(ioInstance, "thread_updated", threadUpdatePayload, threadId); // room + both parties + admins, once

        ioInstance.to(threadId).emit("agreement_signed", threadUpdatePayload);
        ioInstance.to(`thread_${threadId}`).emit("agreement_signed", threadUpdatePayload);
      }
    } catch (e) {
      console.error("Error broadcasting agreement_signed socket event:", e);
    }

    const updatedThreadRecord = {
      ...thread,
      agreement_signed_creator: signedCreator,
      agreement_signed_brand: signedBrand,
      agreement_signed_at: signedAt,
      status: bothSigned ? 'ACTIVE' : thread.status,
      flow_state: bothSigned ? 'ACTIVE' : 'AGREEMENT_SIGNED',
      agreed_amount: resolvedAmount > 0 ? resolvedAmount : thread.agreed_amount
    };

    // v389: the other party hears about it (the first signature, and the second one that makes the deal active).
    await notifyOtherParty(thread, user, bothSigned ? "agreement_both_signed" : "agreement_signed",
      bothSigned ? "✅ Both of you have signed the agreement. The deal is active." : "✍️ The other side signed the agreement. Open the chat to sign too.");
    return res.json({
      success: true,
      signed_by: isCreator ? "creator" : (isBrand ? "brand" : "admin"),
      both_signed: bothSigned,
      thread: updatedThreadRecord
    });
  });


  router.post([
    "/campaign/threads/:threadId/creator-negotiate",
    // Instant UGC has price negotiation too (the mobile chat calls this path), so the UGC
    // namespace has to be registered or every UGC counter-offer 404s.
    "/ugc/threads/:threadId/creator-negotiate",
    "/chat/v2/threads/:threadId/creator-negotiate"
  ], async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { threadId } = req.params;
    const { counter_amount } = req.body;

    const counterNum = Math.round(Number(counter_amount));
    if (!counterNum || !Number.isFinite(counterNum) || counterNum <= 0) {
      return res.status(400).json({ error: "Invalid counter_amount provided" });
    }
    // Session 58: same limits as the app (the API took ₹1, "1e15", decimals).
    if (counterNum > 10000000) return res.status(400).json({ error: "That amount is too large. Enter up to ₹1 crore." });
    // v417: minimum by deal type (offerFloorFor) — a ₹1 counter used to pass on threads the old campaign check missed.
    const campaignMinimumFails = async (t: any) => counterNum < (await offerFloorFor(t)); // v417
    // v414: revisions + delivery days typed in the negotiation table travel with the counter (stored on the offer message; written to the thread on accept).
    const revRaw = req.body?.revision_count;
    const counterRevisions = revRaw === undefined || revRaw === null || revRaw === '' ? null : Math.round(Number(revRaw));
    if (counterRevisions !== null && (!Number.isFinite(counterRevisions) || counterRevisions < 0 || counterRevisions > 20)) {
      return res.status(400).json({ error: "Revisions must be between 0 and 20." });
    }
    const daysRaw = req.body?.delivery_days ?? req.body?.deadline_days;
    const counterDays = daysRaw === undefined || daysRaw === null || daysRaw === '' ? null : Math.round(Number(daysRaw));
    if (counterDays !== null && (!Number.isFinite(counterDays) || counterDays < 1 || counterDays > 365)) {
      return res.status(400).json({ error: "Delivery days must be between 1 and 365." });
    }
    const counterTerms: any = {};
    if (counterRevisions !== null) counterTerms.revision_count = counterRevisions;
    if (counterDays !== null) counterTerms.delivery_days = counterDays;
    // v414: the table's line items ride along on the offer message only when they add up to the counter amount.
    if (Array.isArray(req.body?.breakdown) && req.body.breakdown.length > 0 && req.body.breakdown.length <= 20) {
      const items = req.body.breakdown.map((it: any, i: number) => ({
        id: String(it?.id ?? i).slice(0, 40),
        name: String(it?.name || 'Deliverable').slice(0, 120),
        qty: Math.max(0, Math.round(Number(it?.qty) || 0)),
        rate: Math.max(0, Math.round(Number(it?.rate) || 0)),
      }));
      if (items.reduce((a: number, it: any) => a + it.qty * it.rate, 0) === counterNum) counterTerms.breakdown = items;
    }

    if (supabase) {
      const { data: thread, error: fetchErr } = await supabase
        .from('chat_threads')
        .select('*')
        .eq('id', threadId)
        .maybeSingle();
        
      if (fetchErr || !thread) return res.status(404).json({ error: "Thread not found" });
      if (thread.brand_id !== user.user_id && thread.brand_id !== (user.parent_brand_id || user.user_id) && thread.creator_id !== user.user_id && user.role !== "admin" /* Session 58: brand team members act for their brand */) return res.status(403).json({ error: "Not authorized to modify this thread" });
      if (await campaignMinimumFails(thread)) { const min = await offerFloorFor(thread); return res.status(400).json({ error: offerMinimumMessage(min), detail: offerMinimumMessage(min), code: "BELOW_MIN_OFFER", minimum: min }); } // v417: by deal type
      // v414: UGC threads too — a funded / in-progress order can't be rolled back to negotiating. Admins aren't exempt from the funded lock.
      const ugcOrderN = await loadUgcOrderFor(thread);
      if (negotiationLockedFor(thread, user, ugcOrderN) || (user.role === 'admin' && negotiationLockReason(thread, ugcOrderN) === 'funded')) {
        return lockedResponse(res, thread, ugcOrderN);
      }

      await updateThreadState(supabase, threadId, {
        flow_state: "NEGOTIATING_COUNTER",
        status: "NEGOTIATING",
        counter_amount: counterNum,
        agreement_signed_creator: false,
        agreement_signed_brand: false,
        agreement_signed_at: null
      });

      // Save counter_amount in local cache
      const db = getDb();
      if (!db.chat_threads) db.chat_threads = [];
      let localThr = db.chat_threads.find((t: any) => t.id === threadId);
      if (!localThr) {
        localThr = { ...thread };
        db.chat_threads.push(localThr);
      }
      localThr.counter_amount = counterNum;
      localThr.flow_state = "NEGOTIATING_COUNTER";
      localThr.status = "NEGOTIATING";
      saveDb(db);

      const isSenderCreator = user.user_id === thread.creator_id;
      const senderRoleLabel = isSenderCreator ? "creator" : "brand";

      const counterContent = serializeChatMessage(
        `I would like to negotiate the offer to ₹${counterNum.toLocaleString('en-IN')}.`,
        "negotiation_offer",
        senderRoleLabel,
        { proposed_amount: counterNum, ...counterTerms }
      );

      await insertChatMessageToSupabase({
        message_id: crypto.randomUUID(),
        thread_id: threadId,
        sender_user_id: user.user_id,
        text: counterContent,
        message_type: 'negotiation_offer',
        metadata: { action: 'negotiation_offer', proposed_amount: counterNum, ...counterTerms }, // v414: + revisions / delivery days
        created_at: new Date().toISOString()
      });

      const updatedThread = await (privilegedSupabase || supabase).from('chat_threads').select('*').eq('id', threadId).maybeSingle();
      const enriched = await enrichThread(supabase, updatedThread.data);
      if (enriched) {
        enriched.counter_amount = counterNum;
        enriched.flow_state = "NEGOTIATING_COUNTER";
        enriched.status = "NEGOTIATING";
      }
      // Session 58 (Q16): the other side sees the counter live (it only showed after a refresh).
      { const io = req.app.get("io"); if (io) emitThreadEvent(io, "thread_updated", { id: threadId, threadId, counter_amount: counterNum, flow_state: "NEGOTIATING_COUNTER", status: "NEGOTIATING" }, threadId); }
      await notifyOtherParty(thread, user, "counter_offer", `💬 New counter offer: ₹${counterNum.toLocaleString('en-IN')}. Open the chat to reply.`); // v389
      return res.json({ success: true, thread: enriched });
    }

    const db = getDb();
    const thread = db.chat_threads?.find(t => t.id === threadId);
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    if (thread.brand_id !== user.user_id && thread.brand_id !== (user.parent_brand_id || user.user_id) && thread.creator_id !== user.user_id && user.role !== "admin" /* Session 58: brand team members act for their brand */) {
      return res.status(403).json({ error: "Not authorized to modify this thread" });
    }
    if (await campaignMinimumFails(thread)) { const min = await offerFloorFor(thread); return res.status(400).json({ error: offerMinimumMessage(min), detail: offerMinimumMessage(min), code: "BELOW_MIN_OFFER", minimum: min }); } // v417: by deal type
    {
      const ugcOrderL = await loadUgcOrderFor(thread);
      if (negotiationLockedFor(thread, user, ugcOrderL) || (user.role === 'admin' && negotiationLockReason(thread, ugcOrderL) === 'funded')) {
        return lockedResponse(res, thread, ugcOrderL); // v414
      }
    }

    // Save the negotiation
    thread.flow_state = "NEGOTIATING_COUNTER";
    thread.status = "NEGOTIATING";
    thread.counter_amount = counterNum;

    const isSenderCreatorLocal = user.user_id === thread.creator_id;
    db.chat_messages.push({
      id: `msg_${Math.random().toString(36).substring(2, 10)}`,
      message_id: `msg_${Math.random().toString(36).substring(2, 10)}`,
      thread_id: threadId,
      sender_id: user.user_id,
      sender_role: isSenderCreatorLocal ? "creator" : "brand",
      message_type: "negotiation_offer",
      content: `I would like to negotiate the offer to ₹${counterNum.toLocaleString('en-IN')}.`,
      metadata: { proposed_amount: counterNum, ...counterTerms }, // v414
      created_at: new Date().toISOString()
    });

    saveDb(db);
    res.json({ success: true, thread });
  });


  router.post([
    "/campaign/threads/:threadId/brand-accept-counter",
    "/ugc/threads/:threadId/brand-accept-counter",
    "/chat/v2/threads/:threadId/brand-accept-counter"
  ], async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { threadId } = req.params;

    if (supabase) {
      const { data: thread, error: fetchErr } = await supabase
        .from('chat_threads')
        .select('*')
        .eq('id', threadId)
        .maybeSingle();
        
      if (fetchErr || !thread) return res.status(404).json({ error: "Thread not found" });
      if (thread.brand_id !== user.user_id && thread.brand_id !== (user.parent_brand_id || user.user_id) && thread.creator_id !== user.user_id && user.role !== "admin" /* Session 58: brand team members act for their brand */) return res.status(403).json({ error: "Not authorized to modify this thread" });
      // v414: one lock + one "who may accept" rule for campaign AND UGC threads. A funded / in-progress order or a
      // fully signed contract can't be re-priced (admins included — the escrow already holds the old amount).
      const ugcOrderA = await loadUgcOrderFor(thread);
      const lockReasonA = negotiationLockReason(thread, ugcOrderA);
      if (lockReasonA === 'funded' || lockReasonA === 'signed_both') {
        return lockedResponse(res, thread, ugcOrderA);
      }
      if (negotiationLockedFor(thread, user, ugcOrderA) && upper(thread.flow_state) !== 'NEGOTIATING_COUNTER') {
        return lockedResponse(res, thread, ugcOrderA);
      }

      const isCampaignAccept = isCampaignThread(thread);
      // v414: was campaign-only — UGC accept had no stage or role check and took the browser's amount.
      let latestOfferA: any = null;
      {
        if (upper(thread.flow_state) !== 'NEGOTIATING_COUNTER') {
          return conflict(res, 'NO_COUNTER_PENDING', "There is no counter offer waiting for your answer.");
        }

        // Find the latest counter offer message to see who sent it
        latestOfferA = await loadLatestOffer(threadId);
        const latestOfferSender: string | null = latestOfferA?.sender || null;

        const role = partyRole(user, thread);
        // WHO: only this deal's brand or creator (or admin). Session 21 review: the v171c change
        // dropped the party check, so anyone who had not sent the latest offer — including a
        // stranger to the deal — could accept it.
        if (!role) return forbid(res, 'brand');
        // The side that sent the latest offer cannot accept it; the other side can. Compared by
        // SIDE, not user id: an offer sent by a brand team member is still the brand's offer.
        const senderRole = latestOfferSender
          ? (latestOfferSender === thread.creator_id ? 'creator' : 'brand')
          : 'creator'; // no offer message: the creator's original ask, answered by the brand
        if (role !== 'admin' && role === senderRole) {
          return forbid(res, senderRole === 'brand' ? 'creator' : 'brand');
        }
      }

      const parsed = await enrichThread(supabase, thread);

      // v414: the accepted amount is ALWAYS the latest counter on the server (offer message, then the thread's counter_amount).
      // A body amount is only a stale check — never the price.
      let proposedCounter: number | null = null;
      {
        if (latestOfferA?.amount > 0) proposedCounter = latestOfferA.amount;
        if (!proposedCounter) {
          const localThrA = (getDb().chat_threads || []).find((t: any) => t.id === threadId);
          proposedCounter = knownAmount(thread.counter_amount, parsed?.counter_amount, localThrA?.counter_amount) || null;
        }
        if (!proposedCounter) {
          return conflict(res, 'COUNTER_AMOUNT_UNKNOWN', "The counter offer amount could not be found. Ask the other side to send it again.");
        }
        // Session 58: the card the person tapped must be the latest offer — an older card's Accept used to agree to the
        // newest amount without them seeing it.
        const tapped = Number(req.body?.counter_amount ?? req.body?.amount);
        if (Number.isFinite(tapped) && tapped > 0 && Math.round(tapped) !== Math.round(proposedCounter)) {
          return conflict(res, 'STALE_OFFER', `There's a newer offer (₹${Math.round(proposedCounter).toLocaleString('en-IN')}). Refresh the chat and accept that one.`, { current_amount: Math.round(proposedCounter) }); // v414
        }
      }
      if (!proposedCounter && parsed.counter_amount) {
        proposedCounter = Number(parsed.counter_amount);
      }
      if (!proposedCounter && thread.counter_amount) {
        proposedCounter = Number(thread.counter_amount);
      }
      const db = getDb();
      let localThr = (db.chat_threads || []).find((t: any) => t.id === threadId);
      if (!proposedCounter && localThr?.counter_amount) {
        proposedCounter = Number(localThr.counter_amount);
      }

      if (!proposedCounter) {
        let msgs: any[] = [];
        try {
          const { data } = await (privilegedSupabase || supabase)
            .from('chat_messages')
            .select('*')
            .eq('thread_id', threadId)
            .order('created_at', { ascending: false });
          if (data) msgs = data;
        } catch (e: any) { logIgnored("deals_chat_routes:1264", e); }
        const localMsgs = (db.chat_messages || []).filter((m: any) => m.thread_id === threadId);
        const allMsgs = [...msgs, ...localMsgs];
        for (const m of allMsgs) {
          if (m.metadata?.proposed_amount) {
            proposedCounter = Number(m.metadata.proposed_amount);
            if (proposedCounter > 0) break;
          }
          const txt = m.text || m.content || "";
          if (txt.includes("negotiate") || txt.includes("negotiation") || txt.includes("offer to") || m.message_type === "negotiation_offer") {
            const match = txt.match(/₹([0-9,]+)/);
            if (match) {
              const parsedAmt = Number(match[1].replace(/,/g, ''));
              if (parsedAmt > 0) {
                proposedCounter = parsedAmt;
                break;
              }
            }
          }
        }
      }

      const finalAmount = proposedCounter || parsed.amount_fixed || parsed.agreed_amount || thread.agreed_amount || 0;
      { const min = await offerFloorFor(thread); if (Number(finalAmount) < min) return res.status(400).json({ error: offerMinimumMessage(min), detail: offerMinimumMessage(min), code: "BELOW_MIN_OFFER", minimum: min }); } // v417: no accepting an offer under the floor
      // v414: revisions / delivery days sent with the accepted counter become the thread's terms (existing columns only).
      const acceptedTerms = counterTermsFrom(latestOfferA?.metadata);

      const creatorName = parsed.creator_name || "Creator";
      const brandName = parsed.brand?.name || parsed.campaigns?.brand_name || "Brand Partner";
      const dueDate = acceptedTerms.deadline || parsed.due_date || thread.deadline || parsed.campaigns?.deadline || parsed.campaigns?.content_deadline || "the date mutually agreed in chat";
      const termsAndConditions = parsed.campaigns?.requirements || parsed.campaigns?.deliverables || "Deliver campaign requirements.";

      const agreementContent = `### CAMPAIGN COLLABORATION AGREEMENT

This agreement is entered into between **${brandName}** ("Brand") and **${creatorName}** ("Creator").

**1. Project Deliverables & Due Date**
The Creator agrees to deliver high-quality content as specified below by **${dueDate}**:
* ${termsAndConditions}

**2. Compensation**
Upon successful completion, review, and publication of the content, the Brand shall pay the Creator a fixed sum of **INR ${finalAmount}** (subject to standard Convenience fee & TDS deductions).

**3. Location of Work**
All production and creative styling will take place remotely at Creator's designated location.

We are pleased to partner with you to bring this campaign to life!`;

      // 1. Update chat_threads in Supabase
      await (privilegedSupabase || supabase).from('chat_threads').update({
        agreed_amount: finalAmount,
        status: 'NEGOTIATING',
        flow_state: 'AI_AGREEMENT_READY',
        agreement_signed_creator: false,
        agreement_signed_brand: false,
        agreement_signed_at: null,
        ...acceptedTerms, // v414
        updated_at: new Date().toISOString()
      }).eq('id', threadId);

      // 2. Also update underlying deals table if deal_id exists and is a valid UUID
      const dealId = thread.deal_id || threadId;
      const isUuidDeal = dealId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealId);
      if (isUuidDeal) {
        try {
          await (privilegedSupabase || supabase).from('deals').update({
            agreed_amount: finalAmount,
            ...(acceptedTerms.revision_count !== undefined ? { revision_count: acceptedTerms.revision_count } : {}), // v414
            updated_at: new Date().toISOString()
          }).eq('id', dealId);
        } catch (e: any) { logIgnored("deals_chat_routes:1329", e); }
      }

      // 3. Update local cache
      if (!localThr) {
        localThr = { ...thread, id: threadId };
        if (!db.chat_threads) db.chat_threads = [];
        db.chat_threads.push(localThr);
      }
      if (localThr) {
        Object.assign(localThr, acceptedTerms); // v414
        localThr.agreed_amount = finalAmount;
        localThr.amount_fixed = finalAmount;
        localThr.counter_amount = null;
        localThr.flow_state = "AI_AGREEMENT_READY";
        localThr.status = "NEGOTIATING";
        localThr.ai_generated_agreement = agreementContent;
      }
      const localDeal = (db.deals || []).find((d: any) => d.id === dealId || d.id === thread.deal_id);
      if (localDeal) {
        localDeal.agreed_amount = finalAmount;
      }
      saveDb(db);

      const isAcceptorBrand = partyRole(user, thread) !== 'creator'; // brand, brand team member or admin
      const acceptorLabel = isAcceptorBrand ? "Brand" : "Creator";

      const sysContent = serializeChatMessage(
        `🎉 Offer of ₹${finalAmount.toLocaleString('en-IN')} accepted by the ${acceptorLabel}! The sponsorship agreement has been updated. Please review and sign the agreement to activate the campaign.`,
        "system",
        "system",
        null
      );

      await insertChatMessageToSupabase({
        message_id: crypto.randomUUID(),
        thread_id: threadId,
        sender_user_id: user.user_id,
        text: sysContent,
        message_type: 'system',
        metadata: { action: 'counter_offer_accepted', final_amount: finalAmount, accepted_by: acceptorLabel.toLowerCase() },
        created_at: new Date().toISOString()
      });

      const updatedThread = await (privilegedSupabase || supabase).from('chat_threads').select('*').eq('id', threadId).maybeSingle();
      const enriched = await enrichThread(supabase, updatedThread.data);
      if (enriched) {
        Object.assign(enriched, acceptedTerms); // v414
        enriched.agreed_amount = finalAmount;
        enriched.amount_fixed = finalAmount;
        enriched.flow_state = "AI_AGREEMENT_READY";
        enriched.status = "NEGOTIATING";
        enriched.counter_amount = null;
      }
      // Session 58 (Q16): the other side sees the accept live.
      { const io = req.app.get("io"); if (io) emitThreadEvent(io, "thread_updated", { id: threadId, threadId, ...acceptedTerms, agreed_amount: finalAmount, amount_fixed: finalAmount, counter_amount: null, flow_state: "AI_AGREEMENT_READY", status: "NEGOTIATING" }, threadId); } // v414: + terms
      await notifyOtherParty(thread, user, "counter_accepted", "🤝 Your counter offer was accepted. The agreement is ready to sign."); // v389
      return res.json({ success: true, thread: enriched });
    }

    const db = getDb();
    const thread = db.chat_threads?.find(t => t.id === threadId);
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    if (thread.brand_id !== user.user_id && thread.brand_id !== (user.parent_brand_id || user.user_id) && thread.creator_id !== user.user_id && user.role !== "admin" /* Session 58: brand team members act for their brand */) {
      return res.status(403).json({ error: "Not authorized to modify this thread" });
    }
    // v414: same lock / who / amount rules as the Supabase path above, for campaign AND UGC.
    const ugcOrderLA = await loadUgcOrderFor(thread);
    const lockReasonLA = negotiationLockReason(thread, ugcOrderLA);
    if (lockReasonLA === 'funded' || lockReasonLA === 'signed_both') return lockedResponse(res, thread, ugcOrderLA);
    if (negotiationLockedFor(thread, user, ugcOrderLA) && upper(thread.flow_state) !== 'NEGOTIATING_COUNTER') {
      return lockedResponse(res, thread, ugcOrderLA);
    }

    const isCampaignAcceptLocal = isCampaignThread(thread);
    if (upper(thread.flow_state) !== 'NEGOTIATING_COUNTER') {
      return conflict(res, 'NO_COUNTER_PENDING', "There is no counter offer waiting for your answer.");
    }
    const latestOfferLA = latestOfferFrom((db.chat_messages || []).filter((m: any) => m.thread_id === threadId));
    {
      const role = partyRole(user, thread);
      if (!role) return forbid(res, 'brand');
      const senderRoleLA = latestOfferLA?.sender
        ? (latestOfferLA.sender === thread.creator_id ? 'creator' : 'brand')
        : 'creator'; // no offer message: the creator's original ask, answered by the brand
      if (role !== 'admin' && role === senderRoleLA) return forbid(res, senderRoleLA === 'brand' ? 'creator' : 'brand');
    }

    let proposedCounter: number | null = knownAmount(latestOfferLA?.amount, thread.counter_amount) || null;
    if (!proposedCounter) {
      return conflict(res, 'COUNTER_AMOUNT_UNKNOWN', "The counter offer amount could not be found. Ask the other side to send it again.");
    }
    {
      const tappedLA = Number(req.body?.counter_amount ?? req.body?.amount);
      if (Number.isFinite(tappedLA) && tappedLA > 0 && Math.round(tappedLA) !== Math.round(proposedCounter)) {
        return conflict(res, 'STALE_OFFER', `There's a newer offer (₹${Math.round(proposedCounter).toLocaleString('en-IN')}). Refresh the chat and accept that one.`, { current_amount: Math.round(proposedCounter) });
      }
    }
    void isCampaignAcceptLocal;
    if (!proposedCounter && thread.counter_amount) {
      proposedCounter = Number(thread.counter_amount);
    }
    if (!proposedCounter) {
      const localMsgs = (db.chat_messages || []).filter((m: any) => m.thread_id === threadId);
      for (let i = localMsgs.length - 1; i >= 0; i--) {
        const m = localMsgs[i];
        if (m.metadata?.proposed_amount) {
          proposedCounter = Number(m.metadata.proposed_amount);
          break;
        }
        const txt = m.text || m.content || "";
        if (txt.includes("negotiate") || txt.includes("offer to") || m.message_type === "negotiation_offer") {
          const match = txt.match(/₹([0-9,]+)/);
          if (match) {
            const parsedAmt = Number(match[1].replace(/,/g, ''));
            if (parsedAmt > 0) {
              proposedCounter = parsedAmt;
              break;
            }
          }
        }
      }
    }

    const finalAmount = proposedCounter || thread.counter_amount || thread.agreed_amount || thread.amount_fixed || 0;
    { const min = await offerFloorFor(thread); if (Number(finalAmount) < min) return res.status(400).json({ error: offerMinimumMessage(min), detail: offerMinimumMessage(min), code: "BELOW_MIN_OFFER", minimum: min }); } // v417
    Object.assign(thread, counterTermsFrom(latestOfferLA?.metadata)); // v414: revisions / delivery days of the accepted counter
    thread.amount_fixed = finalAmount;
    thread.agreed_amount = finalAmount;
    thread.counter_amount = null;
    thread.flow_state = "AI_AGREEMENT_READY";
    thread.status = "NEGOTIATING";

    const dealId = thread.deal_id || threadId;
    if (dealId && db.deals) {
      const localDeal = db.deals.find((d: any) => d.id === dealId || d.id === thread.deal_id);
      if (localDeal) {
        localDeal.agreed_amount = finalAmount;
      }
    }

    // Generate the formal agreement with the negotiated price
    const creatorName = thread.creator_name || "Creator";
    const brandName = thread.brand_name || "Brand Partner";
    const dueDate = thread.due_date || thread.deadline || "the date mutually agreed in chat";
    const termsAndConditions = thread.terms_and_conditions || "Deliver 1 high-quality Instagram Reel and 1 Story promoting the campaign. Ensure clear visuals and tag the brand account.";

    let agreementContent = `### CAMPAIGN COLLABORATION AGREEMENT

This agreement is entered into between **${brandName}** ("Brand") and **${creatorName}** ("Creator").

**1. Project Deliverables & Due Date**
The Creator agrees to deliver high-quality content as specified below by **${dueDate}**:
* ${termsAndConditions}

**2. Compensation**
Upon successful completion, review, and publication of the content, the Brand shall pay the Creator a fixed sum of **INR ${finalAmount}** (subject to standard Convenience fee & TDS deductions).

**3. Location of Work**
All production and creative styling will take place remotely at Creator's designated location.

We are pleased to partner with you to bring this campaign to life!`;

    thread.ai_generated_agreement = agreementContent;

    db.chat_messages.push({
      id: `msg_${Math.random().toString(36).substring(2, 10)}`,
      message_id: `msg_${Math.random().toString(36).substring(2, 10)}`,
      thread_id: threadId,
      sender_id: "system",
      sender_role: "system",
      message_type: "system",
      content: `🎉 Counter offer of ₹${finalAmount.toLocaleString('en-IN')} accepted by the Brand! The sponsorship agreement has been updated. Creator, please review and sign to activate the campaign.`,
      created_at: new Date().toISOString()
    });

    saveDb(db);
    res.json({ success: true, thread });
  });


  // v414: Decline a counter offer on the server. Desktop "Decline" used to clear only the screen — the counter stayed
  // pending for both sides. Only the side that did NOT send the latest counter may decline it, only while it's pending.
  router.post([
    "/chat/v2/threads/:threadId/decline-counter",
    "/campaign/threads/:threadId/decline-counter",
    "/ugc/threads/:threadId/decline-counter"
  ], async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { threadId } = req.params;
    const db = getDb();
    let thread: any = null;
    if (supabase) {
      const { data, error } = await supabase.from('chat_threads').select('*').eq('id', threadId).maybeSingle();
      if (error) return res.status(404).json({ error: "Thread not found" });
      thread = data;
    } else {
      thread = (db.chat_threads || []).find((t: any) => t.id === threadId) || null;
    }
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    const role = partyRole(user, thread);
    if (!role) return res.status(403).json({ error: "Not authorized to modify this thread" });

    const order = await loadUgcOrderFor(thread);
    const reason = negotiationLockReason(thread, order);
    // v414: UGC price is fixed by the brief and the order is funded at claim, so a UGC counter can never be accepted.
    // Declining it is still allowed (even when funded) so a stuck NEGOTIATING_COUNTER thread goes back to ACTIVE.
    const fundedUgcReset = reason === 'funded' && !isCampaignThreadRecord(thread) && upper(thread.flow_state) === 'NEGOTIATING_COUNTER';
    if ((reason === 'funded' && !fundedUgcReset) || reason === 'signed_both') return lockedResponse(res, thread, order);
    if (upper(thread.flow_state) !== 'NEGOTIATING_COUNTER') {
      return conflict(res, 'NO_COUNTER_PENDING', "There is no counter offer waiting for your answer.");
    }
    const latest = await loadLatestOffer(threadId);
    const senderRole = latest?.sender ? (latest.sender === thread.creator_id ? 'creator' : 'brand') : 'creator';
    // v414: on a funded UGC thread either side may clear the stuck counter (there is nothing to negotiate).
    if (role !== 'admin' && role === senderRole && !fundedUgcReset) {
      return forbid(res, senderRole === 'brand' ? 'creator' : 'brand');
    }
    const localThr = (db.chat_threads || []).find((t: any) => t.id === threadId);
    const declinedAmount = knownAmount(latest?.amount, thread.counter_amount, localThr?.counter_amount);
    const stale = Number(req.body?.counter_amount ?? req.body?.amount);
    if (declinedAmount && Number.isFinite(stale) && stale > 0 && Math.round(stale) !== Math.round(declinedAmount)) {
      return conflict(res, 'STALE_OFFER', `There's a newer offer (₹${Math.round(declinedAmount).toLocaleString('en-IN')}). Refresh the chat first.`, { current_amount: Math.round(declinedAmount) });
    }

    const declinedBy = role === 'creator' ? 'creator' : 'brand';
    const text = declinedAmount
      ? `Counter offer of ₹${Math.round(declinedAmount).toLocaleString('en-IN')} declined`
      : `Counter offer declined`;
    const nowIso = new Date().toISOString();
    const msgId = crypto.randomUUID();
    const metadata = { action: 'counter_offer_declined', declined_amount: declinedAmount || null, declined_by: declinedBy, status: 'REJECTED' };

    // v414: a funded UGC thread goes back to its active flow, not NEGOTIATING (status ACTIVE is allowed by the DB).
    const resetFlow = fundedUgcReset ? "ACTIVE" : "NEGOTIATING";
    const resetStatus = fundedUgcReset ? "ACTIVE" : "NEGOTIATING";
    if (supabase) {
      await updateThreadState(supabase, threadId, { flow_state: resetFlow, status: resetStatus });
      await insertChatMessageToSupabase({
        message_id: msgId,
        thread_id: threadId,
        sender_user_id: user.user_id,
        text: serializeChatMessage(text, "system", "system", null),
        message_type: 'system',
        metadata,
        created_at: nowIso
      });
    } else {
      if (!db.chat_messages) db.chat_messages = [];
      db.chat_messages.push({
        id: msgId, message_id: msgId, thread_id: threadId, sender_id: user.user_id, sender_role: "system",
        message_type: "system", content: text, metadata, created_at: nowIso
      });
    }
    const target = localThr || (supabase ? null : thread);
    if (target) {
      target.flow_state = resetFlow; // v414
      target.status = resetStatus;
      target.counter_amount = null;
    }
    saveDb(db);

    const updated = { ...thread, flow_state: resetFlow, status: resetStatus, counter_amount: null }; // v414
    { const io = req.app?.get?.("io"); if (io) emitThreadEvent(io, "thread_updated", { id: threadId, threadId, counter_amount: null, flow_state: resetFlow, status: resetStatus }, threadId); }
    await notifyOtherParty(thread, user, "counter_declined", fundedUgcReset ? `${text}. The order continues at the brief's price.` : `${text}. Open the chat to send a new offer.`); // v414
    return res.json({ success: true, declined_amount: declinedAmount || null, thread: updated });
  });

  router.post([
    "/chat/v2/threads/:id/approve-live-links",
    "/chat/v2/threads/:threadId/approve-live-links",
    "/chat/v2/threads/:id/approve-live-link",
    "/chat/v2/threads/:threadId/approve-live-link"
  ], handleThreadApproveLiveLinks);
  router.post([
    "/chat/v2/threads/:id/approve-content",
    "/chat/v2/threads/:threadId/approve-content",
    "/chat/v2/threads/:id/content/approve",
    "/chat/v2/threads/:threadId/content/approve"
  ], handleThreadApproveContent);
  router.post([
    "/chat/v2/threads/:id/submit-live-link",
    "/chat/v2/threads/:threadId/submit-live-link",
    "/chat/v2/threads/:id/submit-live-links",
    "/chat/v2/threads/:threadId/submit-live-links"
  ], handleThreadSubmitLiveLink);
  router.post([
    // SystemMessage.jsx posts here on the campaign namespace; only the legacy paths were
    // registered, so "ask creator to resubmit live links" 404'd on every campaign deal.
    "/campaign/threads/:id/reject-live-links",
    "/campaign/threads/:threadId/reject-live-links",
    "/chat/v2/threads/:id/reject-live-links",
    "/chat/v2/threads/:threadId/reject-live-links"
  ], handleThreadRejectLiveLinks);
  router.post([
    "/chat/v2/threads/:id/decline-live-links-resubmission",
    "/chat/v2/threads/:threadId/decline-live-links-resubmission"
  ], handleThreadDeclineLiveLinksResubmission);
}
