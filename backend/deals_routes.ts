import { logIgnored } from "./logIgnored";
import { consumeSignToken, takeLastSignMeta, signOtpRequired } from "./signTokens";
import { recordAgreementSignature } from "./agreementRecord";
import { emitThreadEvent, emitAdminEvent } from "./socketAccess";
import express from "express";
import crypto from "crypto";
import { isClosed, flowOf, isKnownLivePostUrl, PRE_WORK_STATES, DRAFT_UNDER_REVIEW_STATES, LIVE_LINK_DUE_STATES, LIVE_LINK_UNDER_REVIEW_STATES } from "./campaignGuards"; // v414

// Remaining Campaign Deal routes: fetching a single deal, the dual-
// signature /sign route, the initial content draft submission
// (submit-draft), and adding a live collab/post-performance record
// (add-collab). Plus one thin wrapper: /deals/:id/proof/verify, which
// just forwards to handleThreadApproveLiveLinks (the real approve-and-
// pay logic, which still lives in server.ts alongside the rest of the
// Deal-negotiation chat actions in deals_chat_routes.ts).
export function setupDealsRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    insertChatMessageToSupabase,
    handleThreadApproveLiveLinks,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    insertChatMessageToSupabase: (payload: any) => Promise<any>;
    handleThreadApproveLiveLinks: (req: express.Request, res: express.Response) => any;
  }
) {
  const getIsoNow = () => new Date().toISOString();

  // v414: the deal's real chat thread (same lookup submit-draft uses), local store first.
  const findDealThread = async (dealId: string): Promise<any> => {
    const local = (getDb().chat_threads || []).find((t: any) =>
      t.deal_id === dealId || t.id === `thread_camp_${dealId}` || t.id === `thread_${dealId}`) || null;
    if (local) return local;
    if (!supabase) return null;
    try {
      const { data } = await (privilegedSupabase || supabase)
        .from('chat_threads')
        .select('*')
        .or(`deal_id.eq.${dealId},id.eq.thread_camp_${dealId},id.eq.thread_${dealId}`)
        .limit(1);
      return Array.isArray(data) && data[0] ? data[0] : null;
    } catch (e) { logIgnored("deals_routes:v414-thread", e); return null; }
  };

  router.get("/deals/:id", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { id } = req.params;

    let deal: any = null;
    let submissions: any[] = [];

    if (supabase) {
      try {
        const { data: dData } = await supabase
          .from('deals')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (dData) deal = dData;

        if (!deal) {
          const { data: cData } = await supabase
            .from('collabs')
            .select('*')
            .eq('collab_id', id)
            .maybeSingle();
          if (cData) deal = cData;
        }
      } catch (e) {
        console.error("Error fetching deal from Supabase:", e);
      }
    }

    if (!deal) {
      const db = getDb();
      deal = (db.deals && db.deals.find((d: any) => d.id === id || d.deal_id === id)) ||
             (db.collabs && db.collabs.find((c: any) => c.collab_id === id || c.id === id));
    }

    if (!deal) {
      return res.status(404).json({ error: "Deal not found" });
    }

    const creatorId = deal.creator_id || deal.to_user_id;
    const brandId = deal.brand_id || deal.from_user_id;

    // v416 (CR5): a brand team member acts for their brand
    if (user.role !== 'admin' && user.user_id !== creatorId && user.user_id !== brandId && !(user.parent_brand_id && user.parent_brand_id === brandId)) {
      return res.status(403).json({ error: "Unauthorized access to deal" });
    }

    // Note: No foreign key exists between deals and content_submissions in postgres,
    // so we fetch submissions in a separate query instead of embedded join.
    if (supabase) {
      try {
        const { data: subs } = await supabase
          .from('content_submissions')
          .select('*')
          .eq('deal_id', id)
          .order('submitted_at', { ascending: false });
        if (subs && subs.length > 0) submissions = subs;
      } catch (e) {
        console.error("Error fetching content_submissions from Supabase:", e);
      }
    }

    if (submissions.length === 0) {
      const db = getDb();
      submissions = (db.content_submissions || []).filter((s: any) => s.deal_id === id);
    }

    const latestSub = submissions[0] || null;

    // Calculate stage based on signatures and latest submission
    let stage = "SIGNING";
    const brandSigned = Boolean(deal.agreement_signed_brand);
    const creatorSigned = Boolean(deal.agreement_signed_creator);

    if (!brandSigned || !creatorSigned) {
      stage = "SIGNING";
    } else if (deal.status === 'COMPLETED' || deal.stage === 'COMPLETED') {
      stage = "COMPLETED";
    } else if (deal.status === 'PROOF_SUBMITTED' || deal.stage === 'PROOF_SUBMITTED' || deal.proof_url || deal.instagram_post_url) {
      stage = "PROOF_SUBMITTED";
    } else if (latestSub && (latestSub.status === 'APPROVED' || deal.status === 'CONTENT_APPROVED')) {
      stage = "CONTENT_APPROVED";
    } else if (latestSub && latestSub.status === 'PENDING_REVIEW') {
      stage = "CONTENT_SUBMITTED";
    } else {
      stage = deal.stage || "ACTIVE";
    }

    const formattedDeal = {
      ...deal,
      id: deal.id || deal.collab_id,
      collab_id: deal.collab_id || deal.id,
      creator_id: creatorId,
      to_user_id: creatorId,
      brand_id: brandId,
      from_user_id: brandId,
      deliverable: deal.deliverables ? (typeof deal.deliverables === 'string' ? deal.deliverables : JSON.stringify(deal.deliverables)) : (deal.deliverable || "Campaign Deliverables"),
      proposed_amount: deal.agreed_amount || deal.proposed_amount || deal.rate || deal.payout || 0,
      agreement_signed_brand: brandSigned,
      agreement_signed_creator: creatorSigned,
      agreement_signed_at: deal.agreement_signed_at,
      stage,
      status: deal.status || 'NEGOTIATING',
      feedback: latestSub?.brand_feedback || deal.feedback || deal.revision_notes || null,
      submission: latestSub ? {
        id: latestSub.id,
        video_url: latestSub.video_url,
        caption: latestSub.caption,
        notes: latestSub.notes_to_brand || latestSub.notes || "",
        status: latestSub.status,
        brand_feedback: latestSub.brand_feedback
      } : null,
      content_submissions: submissions.map((s: any) => ({
        ...s,
        notes: s.notes_to_brand || s.notes || ""
      }))
    };

    // v419 (QA): a paid deal showed today's fee settings ("8% fee, total ₹13,133") instead of what the brand was
    // actually charged (₹12,000, no fee). Send the paid amounts from the payment record; the screen shows those.
    try {
      let tx: any = null;
      if (supabase) {
        const { data: txs } = await supabase.from('transactions').select('gross_amount, platform_fee_amount, gst_amount, creator_net_amount, brand_fee_amount, brand_fee_gst, brand_paid_amount, status')
          .or(`deal_id.eq.${id},campaign_deal_id.eq.${id}`).limit(5);
        tx = (txs || []).find((t: any) => ['SUCCESS', 'ESCROW_HELD', 'HELD', 'CAPTURED', 'PAID', 'RELEASED', 'COMPLETED', 'REFUNDED'].includes(String(t.status || '').toUpperCase())) || null;
      }
      if (!tx) tx = ((getDb().transactions || []) as any[]).find((t: any) => (t.deal_id === id || t.campaign_deal_id === id) && ['SUCCESS', 'ESCROW_HELD', 'HELD', 'CAPTURED', 'PAID', 'RELEASED', 'COMPLETED', 'REFUNDED'].includes(String(t.status || '').toUpperCase())) || null;
      if (tx) {
        const gross = Number(tx.gross_amount) || 0;
        const brandFee = Number(tx.brand_fee_amount) || 0, brandFeeGst = Number(tx.brand_fee_gst) || 0;
        (formattedDeal as any).paid = {
          gross, brand_fee: brandFee, brand_fee_gst: brandFeeGst, brand_paid: Number(tx.brand_paid_amount) || gross + brandFee + brandFeeGst,
          platform_fee: Number(tx.platform_fee_amount) || 0, gst: Number(tx.gst_amount) || 0,
          creator_net: Number(tx.creator_net_amount) || Math.max(0, gross - (Number(tx.platform_fee_amount) || 0) - (Number(tx.gst_amount) || 0)),
        };
      }
    } catch (e: any) { console.warn("[deals] paid amounts:", e?.message || e); }

    return res.json(formattedDeal);
  });


  router.post("/deals/:id/sign", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { id } = req.params;

    let deal: any = null;
    let isCollabTable = false;

    if (supabase) {
      try {
        const { data: dData } = await supabase.from('deals').select('*').eq('id', id).maybeSingle();
        if (dData) deal = dData;
        if (!deal) {
          const { data: cData } = await supabase.from('collabs').select('*').eq('collab_id', id).maybeSingle();
          if (cData) {
            deal = cData;
            isCollabTable = true;
          }
        }
      } catch (e) { logIgnored("deals_routes:177", e); }
    }

    const db = getDb();
    if (!deal) {
      deal = (db.deals && db.deals.find((d: any) => d.id === id || d.deal_id === id)) ||
             (db.collabs && db.collabs.find((c: any) => c.collab_id === id || c.id === id));
      if (deal && !db.deals?.find((d: any) => d.id === id)) isCollabTable = true;
    }

    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const creatorId = deal.creator_id || deal.to_user_id;
    const brandId = deal.brand_id || deal.from_user_id;
    // Only THIS deal's parties. `|| user.role === 'creator'` let any creator on the platform
    // sign any deal as its creator (and any brand as its brand) — the bug v163 fixed on
    // campaign threads, still open here.
    const isCreator = Boolean(creatorId) && user.user_id === creatorId;
    const isBrand = Boolean(brandId) && (user.user_id === brandId || user.parent_brand_id === brandId);

    if (!isCreator && !isBrand && user.role !== 'admin') {
      return res.status(403).json({ error: "Unauthorized to sign this deal" });
    }
    const alreadySigned = (isCreator && deal.agreement_signed_creator) || (isBrand && deal.agreement_signed_brand);
    if (alreadySigned) {
      return res.json({ ok: true, already_signed: true, deal_id: deal.id, status: deal.status });
    }
    // Session 58: a deal with a chat thread is signed in the chat (that's where the price lock and the payment check
    // live). Signing here signed only the deal row — the chat stayed unlocked, the price could still change, and a
    // cancelled deal could be flipped back to ACTIVE.
    if (['CANCELLED', 'CANCELED', 'COMPLETED', 'EXPIRED', 'REFUNDED', 'REJECTED'].includes(String(deal.status || '').toUpperCase())) {
      return res.status(409).json({ error: "This deal is closed.", code: "DEAL_CLOSED" });
    }
    if (supabase && !isCollabTable) {
      const { data: thr } = await (privilegedSupabase || supabase).from('chat_threads').select('id').eq('deal_id', deal.id || id).limit(1);
      if (Array.isArray(thr) && thr.length) {
        return res.status(409).json({ error: "Please review and sign the contract in the deal chat.", code: "SIGN_IN_CHAT", thread_id: thr[0].id });
      }
    }
    // The email OTP must have been verified on the server (backend/signTokens.ts).
    if (user.role !== 'admin' && !(await consumeSignToken(user.user_id, req.body?.sign_token))) {
      return signOtpRequired(res);
    }
    const signMeta = user.role === 'admin' ? null : takeLastSignMeta(user.user_id);
    // Session 28: permanent signature record (backend/agreementRecord.ts). Never blocks signing.
    await recordAgreementSignature(privilegedSupabase || supabase, supabase ? null : db, {
      kind: "campaign",
      req, user,
      signerRole: isCreator ? "creator" : (isBrand ? "brand" : "admin"),
      actingBrandId: isBrand ? (user.parent_brand_id || brandId || null) : null,
      onBehalfOfUserId: user.role === 'admin' ? (deal.agreement_signed_creator ? brandId : creatorId) : null,
      signMeta,
      dealId: deal.id || deal.collab_id || id,
      campaignId: deal.campaign_id || null,
      amount: Number(deal.amount || deal.agreed_amount || deal.budget || 0),
      summary: [`Deal: ${deal.id || deal.collab_id || id}`, `Brand: ${brandId || "-"}`, `Creator: ${creatorId || "-"}`],
    });

    if (isCreator) deal.agreement_signed_creator = true;
    if (isBrand) deal.agreement_signed_brand = true;

    if (deal.agreement_signed_creator && deal.agreement_signed_brand) {
      deal.agreement_signed_at = new Date().toISOString();
      deal.status = 'ACTIVE';
      deal.stage = 'ACTIVE';
    }

    if (supabase) {
      try {
        if (!isCollabTable) {
          await (privilegedSupabase || supabase)
            .from('deals')
            .update({
              agreement_signed_creator: deal.agreement_signed_creator,
              agreement_signed_brand: deal.agreement_signed_brand,
              agreement_signed_at: deal.agreement_signed_at,
              status: deal.status,
              updated_at: new Date().toISOString()
            })
            .eq('id', id);
        } else {
          await (privilegedSupabase || supabase)
            .from('collabs')
            .update({
              status: deal.status
            })
            .eq('collab_id', id);
        }
      } catch (e) {
        console.error("Error updating deal sign in Supabase:", e);
      }
    }

    // Also update mock db
    if (db.deals) {
      const idx = db.deals.findIndex((d: any) => d.id === id || d.deal_id === id);
      if (idx !== -1) db.deals[idx] = { ...db.deals[idx], ...deal };
    }
    if (db.collabs) {
      const cIdx = db.collabs.findIndex((c: any) => c.collab_id === id || c.id === id);
      if (cIdx !== -1) db.collabs[cIdx] = { ...db.collabs[cIdx], ...deal };
    }
    saveDb(db);

    return res.json({ success: true, deal });
  });


  router.post("/deals/:id/submit-draft", async (req, res) => {
    const io = req.app.get("io");
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { id } = req.params;
    const { video_url, caption, notes } = req.body;

    if (!video_url) {
      return res.status(400).json({ error: "video_url is required" });
    }

    // Session 53 (security): only the creator on this deal (or an admin) may submit its draft.
    // Before, any logged-in user could push a draft into any deal and move it to CONTENT_SUBMITTED.
    {
      let owner: any = null;
      try {
        if (supabase) {
          const { data } = await (privilegedSupabase || supabase).from('deals').select('creator_id, status, escrow_hold').eq('id', id).maybeSingle();
          owner = data || null;
        }
      } catch { owner = null; }
      if (!owner) owner = (getDb().deals || []).find((d: any) => d.id === id) || null;
      if (!owner) return res.status(404).json({ error: "Deal not found" });
      const staff = user.role === 'admin' || user.role === 'sub_admin';
      if (!staff && String(owner.creator_id) !== String(user.user_id)) {
        return res.status(403).json({ error: "Only the creator on this deal can submit its draft.", code: "NOT_A_PARTY" });
      }
      // Session 58: same rules as the chat — not on a closed deal (it reopened COMPLETED deals) and not before the
      // brand's payment is held (drafts went in before signing / paying).
      const st = String(owner.status || '').toUpperCase();
      if (['COMPLETED', 'CANCELLED', 'CANCELED', 'EXPIRED', 'REFUNDED', 'REJECTED', 'DISPUTED'].includes(st)) {
        return res.status(409).json({ error: "This deal is closed.", code: "DEAL_CLOSED" });
      }
      if (supabase && owner.escrow_hold !== true && !staff) {
        return res.status(409).json({ error: "The brand's payment isn't in place yet — submit your draft once the deal is funded.", code: "NOT_FUNDED" });
      }
      if (['CONTENT_APPROVED', 'LIVE', 'PROOF_SUBMITTED'].includes(st)) {
        return res.status(409).json({ error: "Your draft is already approved — share the live link instead.", code: "DRAFT_ALREADY_APPROVED" });
      }
      // v414: same chat-stage rules as the campaign draft guard — this route used to pull a deal in the live-link stage
      // back to "draft submitted" and take a 2nd draft while one was with the brand.
      const gThread = await findDealThread(id);
      if (isClosed(gThread, owner)) return res.status(409).json({ error: "This deal is closed.", code: "DEAL_CLOSED" });
      const gFlow = flowOf(gThread);
      if (PRE_WORK_STATES.includes(gFlow) && !staff) {
        return res.status(409).json({ error: "The contract has to be signed by both sides and funded before you submit a draft.", code: "CONTRACT_NOT_ACTIVE" });
      }
      if ([...LIVE_LINK_DUE_STATES, ...LIVE_LINK_UNDER_REVIEW_STATES].includes(gFlow)) {
        return res.status(409).json({ error: "Your draft is already approved — share the live link instead.", code: "DRAFT_ALREADY_APPROVED" });
      }
      if (DRAFT_UNDER_REVIEW_STATES.includes(gFlow) && gFlow !== 'REVISION_DECLINED') {
        return res.status(409).json({ error: "Your draft is already with the brand for review.", code: "DRAFT_UNDER_REVIEW" });
      }
    }

    const subId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Actual columns in content_submissions: id, deal_id, creator_id, submission_type, video_url, caption, notes_to_brand, status, submitted_at
    const submissionRecord = {
      id: subId,
      deal_id: id,
      creator_id: user.user_id,
      submission_type: 'draft',
      video_url,
      caption: caption || "",
      notes_to_brand: notes || req.body.notes_to_brand || "",
      status: 'PENDING_REVIEW',
      submitted_at: now
    };

    if (supabase) {
      try {
        await (privilegedSupabase || supabase).from('content_submissions').insert(submissionRecord);
        await (privilegedSupabase || supabase)
          .from('deals')
          .update({
            status: 'CONTENT_SUBMITTED',
            updated_at: now
          })
          .eq('id', id);
      } catch (e) {
        console.error("Error submitting draft to Supabase:", e);
      }
    }

    let dealRecord: any = null;
    let threadRecord: any = null;
    if (supabase) {
      try {
        const { data: dData } = await (privilegedSupabase || supabase)
          .from('deals')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (dData) dealRecord = dData;

        const { data: thrData } = await (privilegedSupabase || supabase)
          .from('chat_threads')
          .select('*')
          .or(`deal_id.eq.${id},id.eq.${id},id.eq.thread_camp_${id},id.eq.thread_ugc_${id},id.eq.thread_${id}`)
          .limit(1)
          .maybeSingle();
        if (thrData) threadRecord = thrData;
      } catch (e) {
        console.warn("[deals/submit-draft] Error fetching deal/thread:", e);
      }
    }

    const db = getDb();
    if (!db.content_submissions) db.content_submissions = [];
    db.content_submissions.push(submissionRecord);

    if (db.deals) {
      const idx = db.deals.findIndex((d: any) => d.id === id || d.deal_id === id);
      if (idx !== -1) {
        db.deals[idx].status = 'CONTENT_SUBMITTED';
        db.deals[idx].stage = 'CONTENT_SUBMITTED';
      }
    }
    if (db.collabs) {
      const cIdx = db.collabs.findIndex((c: any) => c.collab_id === id || c.id === id);
      if (cIdx !== -1) {
        db.collabs[cIdx].status = 'CONTENT_SUBMITTED';
        db.collabs[cIdx].stage = 'CONTENT_SUBMITTED';
      }
    }

    const localDeal = (db.deals || []).find((d: any) => d.id === id || d.deal_id === id) ||
      (db.collabs || []).find((c: any) => c.id === id || c.collab_id === id);
    const localThread = (db.chat_threads || []).find((t: any) =>
      t.deal_id === id || t.id === id || t.id === `thread_camp_${id}` || t.id === `thread_ugc_${id}` || t.id === `thread_${id}`
    );

    const brandUserId = threadRecord?.brand_id || dealRecord?.brand_id || localThread?.brand_id || localDeal?.brand_id || localDeal?.brand_user_id || "";
    const targetThreadId = threadRecord?.id || localThread?.id || `thread_camp_${id}`;
    const cleanNotes = (notes || req.body.notes_to_brand || "").trim();
    const actorName = user.name || user.full_name || "Creator";

    // Create content_proof_submitted chat message
    const msgId = crypto.randomUUID();
    const msgType = 'content_proof_submitted';
    const msgText = `🎥 Campaign Deliverable Draft Submitted for Review!\n\nDeliverable URL: ${video_url}${cleanNotes ? `\n\nNotes: ${cleanNotes}` : ''}`; // v414: campaign deal, not "UGC" (same text as the chat route)
    const msgMetadata = {
      video_url,
      content_url: video_url,
      notes: cleanNotes,
      feedback: cleanNotes,
      creator_notes: cleanNotes,
      action: 'deliverable_submitted'
    };

    const isUuid = (val: any) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    const senderUid = isUuid(user.user_id) ? user.user_id : null;
    const receiverUid = isUuid(brandUserId) ? brandUserId : null;

    const msgPayload = {
      message_id: msgId,
      thread_id: targetThreadId,
      sender_user_id: senderUid,
      receiver_user_id: receiverUid,
      text: msgText,
      from_name: actorName,
      message_type: msgType,
      metadata: msgMetadata,
      created_at: now,
      read: false
    };

    if (supabase) {
      try {
        await insertChatMessageToSupabase(msgPayload);
        if (targetThreadId) {
          await (privilegedSupabase || supabase)
            .from('chat_threads')
            .update({
              status: 'ACTIVE',
              flow_state: 'SUBMITTED',
              updated_at: now
            })
            .eq('id', targetThreadId);
        }
      } catch (e) {
        console.error("[deals/submit-draft] Error inserting chat message to Supabase:", e);
      }
    }

    const localMsgObj = {
      ...msgPayload,
      id: msgId,
      content: msgText,
      sender_id: user.user_id,
      receiver_id: brandUserId,
      sender_role: 'creator',
      message_type: msgType,
      media_url: video_url,
      content_url: video_url,
      video_url: video_url,
      metadata: msgMetadata
    };

    if (!db.chat_messages) db.chat_messages = [];
    db.chat_messages.push(localMsgObj);

    if (db.chat_threads) {
      const tIdx = db.chat_threads.findIndex((t: any) => t.id === targetThreadId || t.deal_id === id);
      if (tIdx !== -1) {
        db.chat_threads[tIdx].status = 'ACTIVE';
        db.chat_threads[tIdx].flow_state = 'SUBMITTED';
        db.chat_threads[tIdx].submitted_video_url = video_url;
      }
    }

    // Create Notification for the brand
    let notifObj: any = null;
    if (brandUserId) {
      const notifId = `notif_${crypto.randomUUID().replace(/-/g, '').substring(0, 10)}`;
      notifObj = {
        notif_id: notifId,
        user_id: brandUserId,
        type: 'ugc_deliverable_submitted',
        title: 'Draft Submitted',
        message: '🎥 Draft submitted! The creator has uploaded content for your review.', // v414: not "UGC" on a campaign deal
        event_type: 'ugc_deliverable_submitted',
        event_ref_id: id,
        role_context: 'brand',
        subtype: 'general',
        read: false,
        created_at: now,
        link: `/deals/${id}`
      };

      if (supabase) {
        try {
          // Session 58 (bug hunt): `link` is a real column — keep it so tapping the notification opens the deal.
          await (privilegedSupabase || supabase).from('notifications').insert(notifObj);
        } catch (e) {
          console.warn("[deals/submit-draft] Notification insert warning:", e);
        }
      }

      if (!db.notifications) db.notifications = [];
      db.notifications.unshift(notifObj);
    }

    if (io && targetThreadId) {
      io.to(targetThreadId).emit("new_message", localMsgObj);
      io.to(targetThreadId).emit("thread_updated", {
        threadId: targetThreadId,
        status: 'ACTIVE',
        flow_state: 'SUBMITTED',
        submitted_video_url: video_url
      });
      emitThreadEvent(io, "thread_updated", { threadId: targetThreadId, status: 'ACTIVE', flow_state: 'SUBMITTED' });

      if (brandUserId) {
        io.to(brandUserId).to(`user_${brandUserId}`).emit("notification", {
          type: 'ugc_deliverable_submitted',
          title: 'Draft Submitted',
          message: '🎥 Draft submitted! The creator has uploaded content for your review.', // v414: not "UGC" on a campaign deal
          notif_id: notifObj?.notif_id
        });
      }
    }
    saveDb(db);

    return res.json({ success: true, submission: submissionRecord });
  });


  router.post("/deals/:id/add-collab", async (req, res) => {
    const io = req.app.get("io");
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { id } = req.params;
    const { instagram_post_url, fetched_views, fetched_likes, fetched_reach, manual_screenshot_url } = req.body;
    const now = new Date().toISOString();
    let collabThread: any = null; // v414

    // Anyone logged in could mark any deal PROOF_SUBMITTED and post a live-link card into its
    // chat. Only the creator on the deal (or an admin) may.
    {
      let owner: any = (getDb().deals || []).find((x: any) => x.id === id || x.deal_id === id) || null;
      if (!owner && supabase) {
        try {
          const { data } = await (privilegedSupabase || supabase).from('deals').select('id, creator_id, brand_id, status').eq('id', id).maybeSingle();
          if (data) owner = data;
        } catch (e) { logIgnored("deals_routes:501", e); }
      }
      if (!owner) return res.status(404).json({ error: "Deal not found" });
      const isAdmin = String(user?.role || '').toLowerCase() === 'admin';
      if (!isAdmin && owner.creator_id !== user.user_id) {
        return res.status(403).json({ error: "Only the creator on this deal can submit its live post." });
      }
      if (['COMPLETED', 'CANCELLED', 'CLOSED'].includes(String(owner.status || '').toUpperCase())) {
        return res.status(409).json({ error: "This deal is already complete." });
      }
      // Session 58: the live link comes after the brand approves the draft (same rule as the chat), and needs a real URL.
      let liveStatus = String(owner.status || '').toUpperCase();
      if (supabase) {
        try { const { data } = await (privilegedSupabase || supabase).from('deals').select('status').eq('id', owner.id || id).maybeSingle(); if (data) liveStatus = String(data.status || '').toUpperCase(); } catch { /* keep */ }
      }
      if (!isAdmin && !['CONTENT_APPROVED', 'LIVE', 'PROOF_SUBMITTED', 'AWAITING_LIVE_LINK'].includes(liveStatus)) {
        return res.status(409).json({ error: "Post the live link after the brand approves your draft.", code: "DRAFT_NOT_APPROVED" });
      }
      if (!/^https?:\/\/\S+\.\S+/i.test(String(instagram_post_url || '').trim())) {
        return res.status(400).json({ error: "Paste the full link of your live post." });
      }
      // v414: same proof rule as the chat — a real post link on a known platform.
      if (!isKnownLivePostUrl(String(instagram_post_url).trim())) {
        return res.status(400).json({ error: "Please paste the link of the live post itself (Instagram post/reel, YouTube video/short, Facebook reel/video, X post or LinkedIn post).", code: "LIVE_LINK_NOT_A_POST" });
      }
      // v414: not while a live link is already with the brand.
      collabThread = await findDealThread(owner.id || id);
      if (isClosed(collabThread, owner)) return res.status(409).json({ error: "This deal is already closed." });
      if (LIVE_LINK_UNDER_REVIEW_STATES.includes(flowOf(collabThread))) {
        return res.status(409).json({ error: "Your live link is already with the brand for review.", code: "LINK_ALREADY_UNDER_REVIEW" });
      }
    }

    const proofData = {
      instagram_post_url,
      fetched_views: fetched_views || 0,
      fetched_likes: fetched_likes || 0,
      fetched_reach: fetched_reach || 0,
      manual_screenshot_url,
      submitted_at: now
    };

    if (supabase) {
      try {
        await (privilegedSupabase || supabase)
          .from('deals')
          .update({
            status: 'PROOF_SUBMITTED',
            updated_at: now
          })
          .eq('id', id);
      } catch (e) { logIgnored("deals_routes:531", e); }
    }

    const db = getDb();
    if (db.deals) {
      const d = db.deals.find((x: any) => x.id === id || x.deal_id === id);
      if (d) {
        d.status = 'PROOF_SUBMITTED';
        d.stage = 'PROOF_SUBMITTED';
        d.proof = proofData;
        d.instagram_post_url = instagram_post_url;
      }
    }
    if (db.collabs) {
      const c = db.collabs.find((x: any) => x.collab_id === id || x.id === id);
      if (c) {
        c.status = 'PROOF_SUBMITTED';
        c.stage = 'PROOF_SUBMITTED';
        c.proof = proofData;
        c.instagram_post_url = instagram_post_url;
      }
    }

    // Sync corresponding chat_thread if present
    const threadId = collabThread?.id || `thread_camp_${id}`; // v414: the real thread, not a guessed id
    if (supabase) {
      try {
        await (privilegedSupabase || supabase)
          .from('chat_threads')
          .update({
            flow_state: 'PROOF_SUBMITTED',
            status: 'ACTIVE',
            updated_at: now
          })
          .or(`id.eq.${threadId},deal_id.eq.${id}`);
      } catch (e) { logIgnored("deals_routes:566", e); }
    }
    if (db.chat_threads) {
      const t = db.chat_threads.find((x: any) => x.id === threadId || x.deal_id === id);
      if (t) {
        t.flow_state = 'PROOF_SUBMITTED';
        t.status = 'ACTIVE';
        t.live_links_submitted = true;
        t.live_link = instagram_post_url;
        t.updated_at = now;
      }
    }

    // Insert live_links_submitted message if not already present
    const recentMsgs = (db.chat_messages || []).filter((m: any) => 
      (m.thread_id === threadId || m.thread_id === id) && 
      m.message_type === 'live_links_submitted' &&
      new Date(m.created_at).getTime() > Date.now() - 30000
    );
    if (recentMsgs.length === 0) {
      const msgId = crypto.randomUUID();
      const msgText = `🚀 Live Post Link Submitted!\n\nLink: ${instagram_post_url}`;
      const msgRecord: any = {
        message_id: msgId,
        id: msgId,
        thread_id: threadId,
        sender_user_id: user?.user_id || user?.id,
        receiver_user_id: null,
        sender_id: user?.user_id || user?.id,
        receiver_id: null,
        sender_role: 'creator',
        text: msgText,
        content: msgText,
        from_name: user?.name || user?.full_name || 'Creator',
        message_type: 'live_links_submitted',
        metadata: {
          action: 'live_link_submitted',
          status: 'PROOF_SUBMITTED',
          link: instagram_post_url,
          links: [instagram_post_url]
        },
        read: false,
        created_at: now
      };
      if (supabase) {
        try {
          await insertChatMessageToSupabase(msgRecord);
        } catch (e) { logIgnored("deals_routes:613", e); }
      }
      if (!db.chat_messages) db.chat_messages = [];
      db.chat_messages.push(msgRecord);

      if (io) {
        io.to(threadId).emit("new_message", msgRecord);
        emitThreadEvent(io, "thread_updated", {
          threadId,
          status: 'ACTIVE',
          flow_state: 'PROOF_SUBMITTED'
        });
      }
    }

    saveDb(db);

    return res.json({ success: true, proof: proofData });
  });

  router.post("/deals/:id/proof/verify", async (req, res) => {
    return handleThreadApproveLiveLinks(req, res);
  });
}
