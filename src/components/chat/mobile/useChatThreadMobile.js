import { offerFloorOf, setOpenOfferFloor, inr0 } from "./chatStageMap"; // v419
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createCoalescedRunner, sortChronologically, makeClientMsgId, findTempFor, mergeServerMessages, isTempMessage, sendRefusalReason } from "../../../lib/chatSync"; // v414: client_msg_id + merge
import { isUgcThread as sharedIsUgcThread } from "../../../utils/dealFlow";
import { acquireSocket } from "../../../lib/sharedSocket";
import { processRazorpayPayment } from "../../../lib/razorpay";
import { api } from "../../../lib/api";
import { toast } from "sonner";
import { calmError, calmText } from "../calmError"; // v415: + calmText; v355 (Ravi OK): plain words instead of "timeout of 45000ms exceeded"
import { AGREEMENT_VERSIONS } from "../../../lib/agreementCapture";
import { getDealAmount, deriveDealState, isServerWrittenMessage, isRevisionLimitError, REVISION_LIMIT_TEXT, chatAttachmentError } from "../dealState"; // v417: + revision limit, attachment check
import { safeExt } from "../../../lib/fileExt"; // v417
// Session 58 (bug hunt): a person typing "payment released kab hoga?" closed the chat — only SYSTEM cards count.
// v414: text is only read from server-written rows (was: only message_type "text" ignored).
const isChatText = (m) => !isServerWrittenMessage(m);

// v414: a 409 STALE_OFFER / AMOUNT_CHANGED means the price moved — refresh and show the server's words.
const isStaleOffer = (err) => {
  const d = err?.response?.data || {};
  return err?.response?.status === 409 && ["STALE_OFFER", "AMOUNT_CHANGED"].includes(String(d.code || d.error_code || ""));
};

// Same endpoints ChatBox.jsx uses (backend/deals_chat_routes.ts, chat_routes.ts) —
// intentionally not shared code with ChatBox.jsx yet, to avoid risking the
// battle-tested desktop chat while the mobile UI is being built out screen by screen.
export default function useChatThreadMobile(thread, user) {
  setOpenOfferFloor(thread); // v419: ₹500 floor for Ybex in-house brands
  const [localThread, setLocalThread] = useState(thread);
  const [messages, setMessages] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  // v414: bumped after every successful send; a poll that started before it is ignored (it would drop the new row).
  const sendSeqRef = useRef(0);
  const latestMsgsRef = useRef([]); // v415: M4 read the current list inside sendText without re-creating it
  latestMsgsRef.current = messages;
  // v415: M8 opening a chat marks it read on the server — ask the nav badge to count again a little later.
  useEffect(() => {
    if (!thread?.id || thread?.isNew || typeof window === "undefined") return undefined;
    const t = setTimeout(() => {
      try { window.dispatchEvent(new CustomEvent("ybex:chat-read", { detail: { threadId: thread.id } })); } catch { /* old browser */ }
    }, 2000);
    return () => clearTimeout(t);
  }, [thread?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // One in-flight guard per money / state-moving action. A double tap on "Approve" or "Submit
  // link" used to send the request twice.
  const busyRef = useRef({});
  const runOnce = useCallback(async (key, fn) => {
    if (busyRef.current[key]) return undefined;
    busyRef.current[key] = true;
    try {
      return await fn();
    } finally {
      busyRef.current[key] = false;
    }
  }, []);

  const currentThread =
    localThread && (localThread.id === thread?.id || localThread.deal_id === thread?.id)
      ? localThread
      : thread;

  const isBrand = user?.role === "brand" || user?.user_type === "brand";

  const isUgcOrder = sharedIsUgcThread(currentThread);

  const isCreatorSigned = Boolean(
    currentThread?.agreement_signed_creator ||
    currentThread?.is_signed_creator ||
    currentThread?.creator_signed ||
    currentThread?.contract_signed_creator
  );
  const isBrandSigned = Boolean(
    currentThread?.agreement_signed_brand ||
    currentThread?.is_signed_brand ||
    currentThread?.brand_signed ||
    currentThread?.contract_signed_brand
  );
  const isMySignatureSigned = isBrand ? isBrandSigned : isCreatorSigned;
  const isOtherPartySigned = isBrand ? isCreatorSigned : isBrandSigned;

  const refreshThread = useCallback(async () => {
    if (!thread?.id) return;
    try {
      const { data } = await api.get(`/chat/v2/threads/${thread.id}`, { bypassCache: true });
      if (data) setLocalThread(data);
    } catch (err) {
      console.error("[mobile chat] refreshThread failed:", err);
    }
  }, [thread?.id]);

  const loadMessages = useCallback(async () => {
    if (!thread?.id) return;
    const seqAtStart = sendSeqRef.current; // v414
    try {
      const { data } = await api.get(`/chat/v2/threads/${thread.id}/messages`, { bypassCache: true });
      if (Array.isArray(data)) {
        if (seqAtStart !== sendSeqRef.current) return; // v414: stale poll — started before the latest send
        // v414: merge, don't replace — pending / failed bubbles stay until the server confirms them
        const fresh = data.filter((m) => m.content !== "⏳ Waiting for the other party to sign.");
        setMessages((prev) => mergeServerMessages(prev, fresh));
        setLoadError(null);
      }
    } catch (err) {
      console.error("[mobile chat] loadMessages failed:", err);
      setLoadError(calmError(err, "Couldn't load messages. Check your internet and try again.")); // v355
    }
  }, [thread?.id]);

  // Initial load + on thread switch
  useEffect(() => {
    setLocalThread(thread);
    setMessages([]);
    if (thread?.id && !thread?.isNew) {
      refreshThread();
      loadMessages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id]);

  // Socket — same event/room names as desktop ChatBox.jsx (register_user / join_room /
  // leave_room), plus the same 6s polling safety-net it uses, so behaviour matches exactly.
  useEffect(() => {
    if (!thread?.id) return;
    // Session 36 (Ravi OK "chat socket"): one shared socket.io connection per tab (src/lib/sharedSocket.js)
    // instead of a new connection per open chat. Same events, same rooms; release() removes only
    // this screen's listeners.
    const socket = acquireSocket(user?.user_id || user?.id);
    // One messages + thread refresh for a burst of socket events (session 23).
    const syncNow = createCoalescedRunner(() =>
      Promise.all([Promise.resolve(loadMessages()), Promise.resolve(refreshThread())])
    );

    socket.onConnect(() => {
      socket.emit("register_user", user?.user_id || user?.id);
      socket.emit("join_room", thread.id);
    });

    socket.on("new_message", (newMessage) => {
      if (!newMessage || (newMessage.thread_id !== thread.id && newMessage.conversation_id !== thread.id)) return;
      setMessages((prev) => {
        const newId = newMessage.id || newMessage.message_id;
        // v414: the temp bubble is matched by client_msg_id (or same sender + text within 30 s), never by text alone
        const tempIdx = findTempFor(prev, newMessage);
        if (prev.some((m) => m.id === newId)) {
          return tempIdx !== -1 ? prev.filter((_, i) => i !== tempIdx) : prev;
        }
        if (tempIdx !== -1) {
          const copy = [...prev];
          copy[tempIdx] = newMessage;
          return copy;
        }
        return [...prev, newMessage];
      });
    });

    socket.on("thread_updated", (updatedThread) => {
      const tId = updatedThread?.id || updatedThread?.threadId || updatedThread?.thread_id || updatedThread?.deal_id;
      if (!updatedThread || (tId !== thread.id && tId !== thread.deal_id)) return;
      // The event's id may name the order/deal route — never overwrite this thread's id.
      const { id: _eid, threadId: _etid, thread_id: _ethid, _sync: _es, ...patch } = updatedThread;
      setLocalThread((prev) => {
        const merged = { ...prev, ...patch };
        if (prev?.ugc_order && patch.ugc_order) {
          merged.ugc_order = { ...prev.ugc_order, ...patch.ugc_order };
        }
        return merged;
      });
      syncNow();
    });

    socket.on("agreement_signed", (payload) => {
      const tId = payload?.id || payload?.threadId || payload?.thread_id || payload?.deal_id;
      if (!payload || (tId !== thread.id && tId !== thread.deal_id)) return;
      setLocalThread((prev) => ({
        ...prev,
        ...payload,
        status: payload.both_signed ? "ACTIVE" : prev?.status || payload.status,
        flow_state: payload.both_signed ? "ACTIVE" : payload.flow_state || "AGREEMENT_SIGNED",
        agreement_signed_creator: payload.agreement_signed_creator ?? prev?.agreement_signed_creator,
        agreement_signed_brand: payload.agreement_signed_brand ?? prev?.agreement_signed_brand,
      }));
      syncNow();
    });

    socket.on("payment_funded", (payload) => {
      if (!payload || (payload.threadId !== thread.id && payload.thread_id !== thread.id && payload.deal_id !== thread.deal_id && payload.dealId !== thread.deal_id)) return;
      setLocalThread((prev) => ({ ...prev, payment_funded: true, status: "ACTIVE" }));
      syncNow();
      toast.success("Payment received & confirmed in Ybex secure payment hold!");
    });

    socket.on("order_updated", (payload) => {
      if (payload && (payload.id === thread.deal_id || payload.id === thread.id)) {
        syncNow();
      }
    });
    socket.on("deal_updated", (payload) => {
      if (payload && (payload.id === thread.deal_id || payload.id === thread.id)) {
        syncNow();
      }
    });

    // Same polling safety-net as desktop, in case a socket event is missed
    // Safety net for a missed socket event — the socket delivers messages live. It was every
    // 6 s (two requests each time), overlapping itself on slow connections. Now every 15 s,
    // skipped while the previous round is still running or the tab is in the background.
    let pollBusy = false;
    const interval = setInterval(async () => {
      if (pollBusy || (typeof document !== "undefined" && document.hidden)) return;
      pollBusy = true;
      try {
        await Promise.all([Promise.resolve(loadMessages()), Promise.resolve(refreshThread())]);
      } catch (e) {
        /* background refresh — errors surface on the next explicit load */
      } finally {
        pollBusy = false;
      }
    }, 15000);

    return () => {
      syncNow.cancel();
      socket.emit("leave_room", thread.id);
      socket.release();
      clearInterval(interval);
    };
  }, [thread?.id, user?.user_id, refreshThread, loadMessages]);

  // v414: one POST for a temp bubble (first send and "tap to try again" both use it). Returns true when sent.
  const postTemp = useCallback(
    async (tempId, msg, clientMsgId, effectiveMyId) => {
      try {
        const { data } = await api.post(`/chat/v2/threads/${thread.id}/messages`, {
          content: msg,
          message_type: "text",
          sender_role: isBrand ? "brand" : "creator",
          sender_user_id: effectiveMyId,
          client_msg_id: clientMsgId, // v414
        });
        sendSeqRef.current += 1; // v414: polls that started before this are stale
        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => m.id !== tempId);
          if (data && withoutTemp.some((m) => m.id === (data.id || data.message_id))) return withoutTemp;
          return data ? [...withoutTemp, data] : withoutTemp;
        });
        return true;
      } catch (err) {
        // v414: stays visible as failed; a block / restriction shows the server's own reason on the bubble
        const reason = calmText(sendRefusalReason(err)); // v415: M4 only a readable sentence (a raw "x" showed)
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "failed", fail_reason: reason || null } : m)));
        if (err?.response?.data?.blocked) {
          toast.error(err.response.data.error || "Contact details can't be shared in chat.");
        } else {
          toast.error(reason || calmError(err, "Message didn't send. Check your internet and tap it to try again."));
        }
        return false;
      }
    },
    [thread?.id, isBrand]
  );

  const sendText = useCallback(
    async (text) => {
      const msg = (text || "").trim();
      if (!msg || !thread?.id || sendingRef.current) return false;
      sendingRef.current = true;
      setSending(true);

      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      // v415: M4 re-sending the text of a failed bubble keeps its client_msg_id, so the server can't save it twice
      const clientMsgId = (latestMsgsRef.current || []).find((m) => isTempMessage(m) && m.status === "failed" && String(m.content || "").trim() === msg)?.client_msg_id || makeClientMsgId(); // v414
      const effectiveMyId =
        user?.user_id || user?.id || (isBrand ? currentThread?.brand_id : currentThread?.creator_id);
      const optimistic = {
        id: tempId,
        client_msg_id: clientMsgId, // v414
        thread_id: thread.id,
        sender_id: effectiveMyId,
        sender_user_id: effectiveMyId,
        sender_role: isBrand ? "brand" : "creator",
        content: msg,
        message_type: "text",
        created_at: new Date().toISOString(),
        status: "sending",
      };
      // v414: re-sending the same text replaces its old failed bubble (no two copies)
      setMessages((prev) => [...prev.filter((m) => !(isTempMessage(m) && m.status === "failed" && String(m.content || "").trim() === msg)), optimistic]);

      try {
        return await postTemp(tempId, msg, clientMsgId, effectiveMyId);
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [thread?.id, user, isBrand, currentThread, postTemp]
  );

  // v414: "tap to try again" on a failed bubble — same bubble, same client_msg_id.
  const retryMessage = useCallback(
    async (failedMsg) => {
      if (!failedMsg || !isTempMessage(failedMsg) || failedMsg.status !== "failed" || !thread?.id || sendingRef.current) return false;
      sendingRef.current = true;
      setSending(true);
      const clientMsgId = failedMsg.client_msg_id || makeClientMsgId();
      setMessages((prev) => prev.map((m) => (m.id === failedMsg.id ? { ...m, client_msg_id: clientMsgId, status: "sending", fail_reason: null, created_at: new Date().toISOString() } : m)));
      try {
        return await postTemp(failedMsg.id, String(failedMsg.content || "").trim(), clientMsgId, failedMsg.sender_user_id || failedMsg.sender_id);
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [thread?.id, postTemp]
  );

  // v414: `shownAmount` = the amount on the card being accepted, so the server can refuse a stale offer.
  const acceptCounter = useCallback(async (shownAmount) => runOnce("acceptCounter", async () => {
    if (!thread?.id) return;
    if (isUgcOrder) { toast.error("UGC price is fixed by the brief, so there's no counter offer to accept."); return false; } // v414: no UGC negotiation
    try {
      const acceptEndpoint = (thread?.is_ugc || thread?.deal_type === 'UGC')
        ? `/ugc/threads/${thread.id}/brand-accept-counter`
        : `/campaign/threads/${thread.id}/brand-accept-counter`;
      const shown = Number(shownAmount);
      const res = await api.post(acceptEndpoint, Number.isFinite(shown) && shown > 0 ? { counter_amount: shown } : {}); // v414
      const data = res.data;
      toast.success("Counter offer accepted! 🤝");
      // The response is { success, thread } — merge the thread, not the envelope (session 23).
      if (data?.thread) setLocalThread((prev) => ({ ...prev, ...data.thread }));
      refreshThread();
      loadMessages();
    } catch (err) {
      if (isStaleOffer(err)) { // v414: the offer changed — show the latest one
        refreshThread();
        loadMessages();
        toast.error(err.response.data.detail || err.response.data.error || "The offer changed. Please check the latest amount.");
        return false;
      }
      toast.error(calmError(err, "Couldn't accept the offer. Please try again."));
      return false; // v355: the Respond sheet stays open
    }
  }), [thread?.id, thread?.is_ugc, thread?.deal_type, isUgcOrder, refreshThread, loadMessages, runOnce]);

  const sendCounter = useCallback(
    async (amount) => {
      if (isUgcOrder) { toast.error("UGC price is fixed by the brief, so it can't be negotiated."); return false; } // v414: no UGC negotiation
      const amountNum = Number(amount);
      if (!amountNum || amountNum <= 0) {
        toast.error("Please enter a valid amount.");
        return false;
      }
      if (amountNum < offerFloorOf(thread)) { // v419
        toast.error(`Minimum offer amount for this deal is ${inr0(offerFloorOf(thread))}.`);
        return false;
      }
      try {
        const negotiateEndpoint = (thread?.is_ugc || thread?.deal_type === 'UGC')
          ? `/ugc/threads/${thread.id}/creator-negotiate`
          : `/campaign/threads/${thread.id}/creator-negotiate`;
        const res = await api.post(negotiateEndpoint, {
          counter_amount: amountNum,
        });
        const data = res.data;
        toast.success(`Counter offer of ₹${amountNum.toLocaleString("en-IN")} sent.`);
        // The response is { success, thread } — merge the thread, not the envelope (session 23).
      if (data?.thread) setLocalThread((prev) => ({ ...prev, ...data.thread }));
        refreshThread();
        loadMessages();
      } catch (err) {
        toast.error(calmError(err, "Couldn't send your counter offer. Please try again."));
        return false; // v355: the Respond sheet stays open
      }
    },
    [thread?.id, thread?.is_ugc, thread?.deal_type, isUgcOrder, refreshThread, loadMessages]
  );

  // ---- Draft / deliverable review (campaign uses approve-content, UGC uses /ugc/orders/:id/approve) ----
  const getUgcOrderId = useCallback(() => {
    return (
      currentThread?.ugc_order_id ||
      currentThread?.ugc_order?.id ||
      (currentThread?.id?.startsWith("ugcord_") ? currentThread.id : null) ||
      (currentThread?.deal_id?.startsWith("ugcord_") ? currentThread.deal_id : null) ||
      (currentThread?.id?.startsWith("thread_ugc_") ? currentThread.id.replace("thread_ugc_", "") : null)
    );
  }, [currentThread]);

  const approveDeliverable = useCallback(async () => runOnce("approveDeliverable", async () => {
    // A UGC approval releases the creator's payout from escrow. One tap used to do it with no
    // warning ("payment happened by itself"). Ask first (session 23).
    // Session 31: a UGC collaboration (reel + live link) only approves the DRAFT here; the payout is
    // released after the live link is approved. Same rule as desktop (dealState isCollabOrder) and
    // as the server (ugc_routes handleUgcOrderApprove). Raw-video UGC releases the payout now.
    const { isCollabOrder } = deriveDealState({ thread: currentThread, messages: [], isBrand: true });
    const releasesPayout = isUgcOrder && !isCollabOrder;
    // v359 (Ravi OK): say how much and to whom before releasing it.
    const relAmt = Number(getDealAmount(currentThread)) || 0;
    const relWho = String(currentThread?.creator_name || currentThread?.ugc_order?.creator_name || currentThread?.other_user?.name || currentThread?.partner?.name || "").trim();
    const relMsg = `Approve this delivery? This releases ${relAmt > 0 ? `₹${relAmt.toLocaleString("en-IN")}` : "the payment"} from the secure payment hold to ${relWho || "the creator"}. Ybex pays it to their bank in 1–2 working days. This can't be undone.`;
    if (!isCollabOrder && isUgcOrder && typeof window !== "undefined" && !window.confirm(relMsg)) {
      return;
    }
    try {
      if (isUgcOrder) {
        const orderId = getUgcOrderId() || thread.id;
        await api.post(`/ugc/orders/${orderId}/approve`);
        toast.success(releasesPayout
          ? "Approved! Payment released — Ybex pays the creator in 1–2 working days. 🎉" // v359
          : "Draft approved — the creator can now post it and send the live link.");
      } else {
        await api.post(`/campaign/threads/${thread.id}/approve-content`);
        toast.success("Draft approved — creator can now post it live.");
      }
      refreshThread();
      loadMessages();
    } catch (err) {
      toast.error(calmError(err, "Failed to approve"));
    }
  }), [thread?.id, currentThread, isUgcOrder, getUgcOrderId, refreshThread, loadMessages, runOnce]);

  const requestChanges = useCallback(
    async (feedback) => {
      const fb = (feedback || "").trim();
      if (!fb) {
        toast.error("Please describe what should change.");
        return false;
      }
      try {
        const endpoint = isUgcOrder
          ? `/ugc/threads/${thread.id}/reject-content`
          : `/campaign/threads/${thread.id}/reject-content`;
        await api.post(endpoint, { feedback: fb });
        toast.success("Revision request sent.");
        refreshThread();
        loadMessages();
        return true;
      } catch (err) {
        // v417: limit reached — the caller opens Contact support (cancel is blocked at this stage)
        if (isRevisionLimitError(err)) { toast.error(REVISION_LIMIT_TEXT); refreshThread(); return "limit"; }
        toast.error(calmError(err, "Failed to send revision request"));
        return false;
      }
    },
    [thread?.id, isUgcOrder, refreshThread, loadMessages]
  );

  // Session 24. Creator declines a revision request — the desktop "Decline Changes" button
  // (ContentProofNotice), same endpoints and body. The mobile card had the form but its handler
  // was an empty function, so nothing was ever sent.
  const declineRevisions = useCallback(
    async (reason) => runOnce("declineRevisions", async () => {
      const fb = (reason || "").trim();
      if (!fb) {
        toast.error("Please give a reason for declining.");
        return false;
      }
      try {
        if (isUgcOrder) {
          const orderId = getUgcOrderId();
          const endpoint = orderId
            ? `/ugc/orders/${orderId}/decline-revisions`
            : `/ugc/threads/${thread.id}/decline-revisions`;
          await api.post(endpoint, { feedback: fb });
        } else {
          await api.post(`/campaign/threads/${thread.id}/decline-revisions`, { feedback: fb });
        }
        toast.success("Changes declined. The brand has been told.");
        refreshThread();
        loadMessages();
        return true;
      } catch (err) {
        toast.error(calmError(err, "Failed to decline the changes"));
        return false;
      }
    }),
    [thread?.id, isUgcOrder, getUgcOrderId, refreshThread, loadMessages, runOnce]
  );

  // Session 31 (Ravi): the creator declines the brand's request to correct the LIVE LINKS. Same
  // endpoints and body as desktop SystemMessage ("live_links_resubmit_request" → Decline):
  // campaign → decline-live-links-resubmission, UGC → /ugc/threads/:id/decline-revisions.
  // (The draft decline above is a different step with a different server handler.)
  const declineLinkResubmission = useCallback(
    async (reason) => runOnce("declineLinkResubmission", async () => {
      const fb = (reason || "").trim();
      if (!fb) {
        toast.error("Please give a reason for declining.");
        return false;
      }
      const targetId = currentThread?.id || thread?.id;
      if (!targetId) return false;
      try {
        const endpoint = isUgcOrder
          ? `/ugc/threads/${targetId}/decline-revisions`
          : `/campaign/threads/${targetId}/decline-live-links-resubmission`;
        await api.post(endpoint, { feedback: fb });
        toast.success("Resubmission request declined. The brand has been told.");
        refreshThread();
        loadMessages();
        return true;
      } catch (err) {
        toast.error(calmError(err, "Failed to decline the request"));
        return false;
      }
    }),
    [thread?.id, currentThread?.id, isUgcOrder, refreshThread, loadMessages, runOnce]
  );

  // ---- Live links (campaign deal or UGC collaboration) ----
  const submitLiveLink = useCallback(
    async (link, notes) => runOnce("submitLiveLink", async () => {
      const rawLink = (link || "").trim();
      if (!rawLink) {
        toast.error("Please paste your live post link.");
        return false;
      }
      const targetId = currentThread?.id || thread?.id;
      if (!targetId) {
        toast.error("No active thread found.");
        return false;
      }
      try {
        const isUgc = Boolean(
          isUgcOrder ||
          currentThread?.is_ugc ||
          currentThread?.type === "ugc" ||
          currentThread?.deal_type === "UGC" ||
          String(targetId).startsWith("ugcord_") ||
          String(targetId).startsWith("thread_ugc_") ||
          String(currentThread?.deal_id).startsWith("ugcord_")
        );

        const payload = {
          link: rawLink,
          links: [rawLink],
          live_link: rawLink,
          notes: notes || "",
        };

        // One POST, no hand-written retry. The old `catch` resent the SAME submission to
        // /chat/v2/..., which reaches the same handler — so whenever the first call's RESPONSE
        // failed, the link was submitted twice (two cards, two notifications). lib/api.js
        // retries GETs only, on purpose. The /deals/:id/add-collab "safety sync" that followed
        // was a third write of the same link and is gone too.
        await api.post(
          isUgc ? `/ugc/threads/${targetId}/submit-live-link` : `/campaign/threads/${targetId}/submit-live-link`,
          payload
        );

        // Optimistically update local thread state so button immediately switches to WAITING FOR APPROVAL
        setLocalThread((prev) => ({
          ...prev,
          live_links_submitted: true,
          live_link: rawLink,
          flow_state: "PROOF_SUBMITTED",
          ugc_order: prev?.ugc_order
            ? {
                ...prev.ugc_order,
                live_links_submitted: true,
                live_link: rawLink,
                status: "LINKS_UNDER_REVIEW",
              }
            : undefined,
        }));

        toast.success("Live link submitted! 🚀");
        refreshThread();
        loadMessages();
        return true;
      } catch (err) {
        toast.error(calmError(err, "Failed to submit live link"));
        return false;
      }
    }),
    [thread?.id, currentThread, isUgcOrder, refreshThread, loadMessages, runOnce]
  );

  // ---- Secure payment (brand). Same call and arguments as desktop ChatBox.handleEscrowPayment. ----
  const [paying, setPaying] = useState(false);
  const payIntoEscrow = useCallback(async (method, couponCode, hooks) => runOnce("payIntoEscrow", async () => {
    if (!currentThread?.id) return false;
    // Session 31 (Ravi): no invented amount. The same amount the screen shows (getDealAmount — the
    // agreed amount first); the server still charges the deal's own agreed amount. No amount → stop.
    const grossAmt = Number(getDealAmount(currentThread)) || 0;
    if (!(grossAmt > 0)) {
      toast.error("The deal amount isn't set yet, so payment can't start. Agree on the amount first.");
      return false;
    }
    setPaying(true);
    let ok = false;
    let paid = null; // v366: the verified payment (payment_id …) for the "Escrow funded" screen
    try {
      await processRazorpayPayment({
        dealId: currentThread?.deal_id || currentThread?.id,
        threadId: currentThread?.id,
        campaignId: currentThread?.campaign_id || null,
        creatorId: currentThread?.creator_id || null,
        grossAmount: grossAmt,
        method: typeof method === "string" ? method : undefined, // Session 58: UPI / card / netbanking picked on Review & pay
        couponCode: typeof couponCode === "string" ? couponCode : "", // v364: brand-fee coupon from Review & pay
        quiet: true, // the sheet shows "Payment successful" itself
        onOpen: hooks?.onOpen, // v366: Razorpay's window is up (the sheet's "Opening secure checkout" step)
        cancel: hooks?.cancel, // v366: Cancel on that step stops the window from opening
        onSuccess: async (res) => {
          ok = true;
          paid = res && typeof res === "object" ? res : null;
          // Same follow-up call as desktop (SystemMessage.handleEscrowPayment). The verified payment
          // already marked the deal funded; this only repeats it (idempotent), so an error here is
          // logged, never shown as a failed payment.
          if (!isUgcOrder) {
            try { await api.post(`/campaign/threads/${currentThread.id}/pay`); }
            catch (e) { console.warn("[mobile escrow] /pay follow-up:", e?.response?.data?.error || e?.message); }
          }
          setLocalThread((prev) => ({ ...prev, ...(res?.thread || {}), payment_funded: true, status: "ACTIVE" }));
          refreshThread();
          loadMessages();
        },
        onError: (err) => {
          if (hooks?.cancel?.cancelled) return; // v366: the brand cancelled on the sheet — it already went back, no toast
          toast.error(/cancel/i.test(String(err?.message || "")) ? "Payment cancelled." : "Payment didn't go through. No money was taken — try again.");
        },
      });
    } catch (e) {
      toast.error(calmError(e, "Payment didn't start. Please try again."));
    } finally {
      setPaying(false);
    }
    return ok ? (paid ? { ...paid, ok: true } : true) : false; // v366: truthy as before; + payment details when known
  }), [currentThread, isUgcOrder, refreshThread, loadMessages, runOnce]);

  const approveLiveLinks = useCallback(async () => runOnce("approveLiveLinks", async () => {
    const targetId = currentThread?.id || thread?.id;
    if (!targetId) return;
    try {
      const isUgc = Boolean(
        isUgcOrder ||
        currentThread?.is_ugc ||
        currentThread?.type === "ugc" ||
        currentThread?.deal_type === "UGC" ||
        String(targetId).startsWith("ugcord_") ||
        String(targetId).startsWith("thread_ugc_") ||
        String(currentThread?.deal_id).startsWith("ugcord_")
      );

      // No retry to a second URL: /mark-complete and /approve are the same handler, and this
      // request releases money.
      if (isUgc) {
        await api.post(`/ugc/threads/${targetId}/mark-complete`, { action: "approve_live_links" });
      } else {
        await api.post(`/campaign/threads/${targetId}/approve-live-links`);
      }

      setLocalThread((prev) => ({
        ...prev,
        status: "COMPLETED",
        flow_state: "COMPLETED",
        payment_status: "RELEASED",
        ugc_order: prev?.ugc_order
          ? {
              ...prev.ugc_order,
              status: "COMPLETED",
              payment_status: "RELEASED",
            }
          : undefined,
      }));

      toast.success("Live links approved — payout released! 🎉");
      refreshThread();
      loadMessages();
    } catch (err) {
      toast.error(calmError(err, "Failed to approve live links"));
    }
  }), [thread?.id, currentThread, isUgcOrder, refreshThread, loadMessages, runOnce]);

  const rejectLiveLinks = useCallback(
    async (feedback) => runOnce("rejectLiveLinks", async () => {
      const fb = (feedback || "").trim();
      if (!fb) {
        toast.error("Please describe what's wrong with the link.");
        return false;
      }
      const targetId = currentThread?.id || thread?.id;
      if (!targetId) return false;
      try {
        const isUgc = Boolean(
          isUgcOrder ||
          currentThread?.is_ugc ||
          currentThread?.type === "ugc" ||
          currentThread?.deal_type === "UGC" ||
          String(targetId).startsWith("ugcord_") ||
          String(targetId).startsWith("thread_ugc_") ||
          String(currentThread?.deal_id).startsWith("ugcord_")
        );

        if (isUgc) {
          await api.post(`/ugc/threads/${targetId}/reject-content`, { feedback: fb, revision_notes: fb, action: "reject_live_links" });
        } else {
          // No fallback to reject-content: that is the DRAFT revision endpoint. A live-link
          // correction that fell through to it spent a draft revision and moved the deal back to
          // CHANGES_REQUESTED — asking the creator to re-upload a draft the brand had approved.
          await api.post(`/campaign/threads/${targetId}/reject-live-links`, { feedback: fb, notes: fb });
        }

        setLocalThread((prev) => ({
          ...prev,
          // A live-link correction, not a draft revision.
          // Same state the server writes for both flows (ugcLifecycleService / campaign_lifecycle).
          flow_state: "REVISION_REQUESTED_LINKS",
          live_links_submitted: false,
          ugc_order: prev?.ugc_order
            ? {
                ...prev.ugc_order,
                status: "REVISION_REQUESTED",
                live_links_submitted: false,
              }
            : undefined,
        }));

        toast.success("Resubmission requested.");
        refreshThread();
        loadMessages();
        return true;
      } catch (err) {
        toast.error(calmError(err, "Failed to request resubmission"));
        return false;
      }
    }),
    [thread?.id, currentThread, isUgcOrder, refreshThread, loadMessages, runOnce]
  );

  // ---- Deliverable upload (draft submit / revised re-upload), campaign or UGC ----
  // Same pipeline as desktop ChatBox (session 23): the same UGC detection + order-id fallback
  // (mobile's narrower check sent some UGC orders to the campaign endpoint, so the upload
  // "didn't happen"), the same payload fields, and a drive/cloud link as an alternative to a file.
  const uploadDeliverable = useCallback(
    async (file, notes, link) => {
      const t = currentThread || thread;
      if (!t?.id || (!file && !String(link || "").trim())) return false;
      const targetUgcOrderId =
        t?.ugc_order_id ||
        t?.ugc_order?.id ||
        (t?.id?.startsWith("ugcord_") ? t.id : null) ||
        (t?.deal_id?.startsWith("ugcord_") ? t.deal_id : null) ||
        (t?.id?.startsWith("thread_ugc_") ? t.id.replace("thread_ugc_", "") : (isUgcOrder ? t?.deal_id : null));
      const asUgc = Boolean(isUgcOrder || targetUgcOrderId);
      const tid = "mobile-deliverable";
      try {
        let finalVideoUrl = String(link || "").trim();
        if (file) {
          toast.loading("Uploading video…", { id: tid });
          const fileExt = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
          const safeId = String(t.id).replace(/[^A-Za-z0-9_-]/g, "");
          const fileName = `${safeId}-${Date.now()}.${fileExt}`;
          const filePath = asUgc ? `ugc-videos/${fileName}` : `campaign-deliverables/${fileName}`;
          const { data: signedData } = await api.post("/upload/signed-url", {
            bucket: "content-submissions",
            path: filePath,
            contentType: file.type || "video/mp4",
          });
          const { supabase } = await import("../../../lib/supabase");
          const { error: uploadError } = await supabase.storage
            .from("content-submissions")
            .uploadToSignedUrl(signedData.path, signedData.token, file);
          if (uploadError) throw uploadError;
          finalVideoUrl = filePath; // relative path — the server signs it for viewing
        }
        toast.loading("Saving submission…", { id: tid });
        const cleanNotes = (notes || "").trim();
        const submitPayload = {
          videoUrl: finalVideoUrl,
          video_url: finalVideoUrl,
          content_url: finalVideoUrl,
          ...(file ? {} : { driveUrl: finalVideoUrl }),
          notes: cleanNotes,
          creator_notes: cleanNotes,
        };
        if (asUgc) {
          await api.post(`/ugc/orders/${targetUgcOrderId || t.id}/submit`, submitPayload);
        } else {
          await api.post(`/campaign/threads/${t.id}/submit-content`, submitPayload);
        }
        toast.success("Deliverable submitted! The brand has been notified.", { id: tid });
        refreshThread();
        loadMessages();
        return true;
      } catch (err) {
        toast.error(calmError(err, "Upload failed. Try again, or paste a Google Drive / Dropbox link instead."), { id: tid });
        return false;
      }
    },
    [thread, currentThread, isUgcOrder, refreshThread, loadMessages]
  );

  // v417: paperclip — a photo / MP4/MOV video / PDF (max 50 MB) sent as a chat attachment, same upload as desktop ChatBox.
  const [attaching, setAttaching] = useState(false);
  const sendAttachment = useCallback(
    async (file) => {
      const t = currentThread || thread;
      if (!t?.id || !file || attaching) return false;
      const err = chatAttachmentError(file);
      if (err) { toast.error(err); return false; }
      const tid = "mobile-attach";
      setAttaching(true);
      try {
        toast.loading("Uploading file…", { id: tid });
        const filePath = `chat-attachments/${String(t.id).replace(/[^A-Za-z0-9_-]/g, "")}-${Date.now()}.${safeExt(file)}`;
        const { data: signedData } = await api.post("/upload/signed-url", { bucket: "content-submissions", path: filePath, contentType: file.type || "application/octet-stream" });
        const { supabase } = await import("../../../lib/supabase");
        const { error: uploadError } = await supabase.storage.from("content-submissions").uploadToSignedUrl(signedData.path, signedData.token, file);
        if (uploadError) throw uploadError;
        await api.post(`/chat/v2/threads/${t.id}/messages`, { content: `📎 Attached file: ${file.name}`, message_type: "attachment", attachment_url: filePath });
        toast.success("File sent.", { id: tid });
        loadMessages();
        return true;
      } catch (e) {
        toast.error(calmError(e, "Couldn't send the file. Please try again."), { id: tid });
        return false;
      } finally {
        setAttaching(false);
      }
    },
    [thread, currentThread, attaching, loadMessages]
  );

  // ---- Rating ----
  const submitReview = useCallback(
    async ({ rating, communication, timeliness, quality, comment }) => {
      if (!rating || rating < 1 || rating > 5) {
        toast.error("Please give an overall rating.");
        return false;
      }
      try {
        const reviewEndpoint = (thread?.is_ugc || thread?.deal_type === 'UGC')
          ? `/ugc/threads/${thread.id}/submit-review`
          : `/campaign/threads/${thread.id}/submit-review`;
        await api.post(reviewEndpoint, {
          rating,
          communication_rating: communication ?? rating,
          timeliness_rating: timeliness ?? rating,
          quality_rating: quality ?? rating,
          comment: comment || "",
        });
        toast.success("Thanks for the feedback!");
        refreshThread();
        return true;
      } catch (err) {
        toast.error(calmError(err, "Failed to submit review"));
        return false;
      }
    },
    [thread?.id, thread?.is_ugc, thread?.deal_type, refreshThread]
  );

  // ---- Contract signing ----
  // Same two calls the desktop ContractModal.jsx makes: a real OTP to the signer's
  // registered email (backend/session_routes.ts has a dedicated `contract_sign`
  // email template), then POST .../sign once the code verifies.
  const sendSignOtp = useCallback(
    async (email) => {
      const value = String(email || "").trim();
      if (!value || !value.includes("@")) {
        toast.error("No verified email on this account to send the code to.");
        return false;
      }
      try {
        const otpRes = await api.post("/otp/send", {
          value,
          target: "email",
          purpose: "contract_sign",
          recipientName: user?.name || user?.full_name || (isBrand ? "Brand Partner" : "Creator Partner"),
          brandName: currentThread?.brand?.name || currentThread?.brand?.company_name || "Brand Partner",
          creatorName: currentThread?.creator?.name || currentThread?.creator?.full_name || "Creator Partner",
          campaignTitle: currentThread?.campaign_title || currentThread?.ugc_title || "Influencer Partnership Agreement",
          dealAmount: currentThread?.agreed_amount || currentThread?.amount_fixed || "",
        });
        if (otpRes?.data?.code && String(otpRes?.data?.message || "").startsWith("Test mode")) {
          toast.warning(`${otpRes.data.message} Test code: ${otpRes.data.code}`, { duration: 15000 });
        } else toast.success(`Verification code sent to ${value}`);
        return true;
      } catch (err) {
        toast.error(calmError(err, "Failed to send the code."));
        return false;
      }
    },
    [user, isBrand, currentThread]
  );

  const signAgreement = useCallback(
    async ({ email, code, agreementText = "" }) => {
      const value = String(email || "").trim();
      const otp = String(code || "").trim();
      if (otp.length < 4) {
        toast.error("Enter the 6-digit code from your email.");
        return false;
      }
      let signToken = null;
      try {
        const verified = await api.post("/otp/verify", { value, code: otp });
        signToken = verified?.data?.sign_token;
      } catch (err) {
        toast.error(calmError(err, "Incorrect or expired code."));
        return false;
      }
      try {
        // v414: send the amount I'm signing at (as desktop ContractModal does) so a changed price is caught
        const signAmount = Number(getDealAmount(currentThread)) || 0;
        await api.post(`/campaign/threads/${thread.id}/sign`, { offer_id: thread?.id, sign_token: signToken, agreement_text: agreementText, agreement_version: AGREEMENT_VERSIONS.campaignMobile, ...(signAmount > 0 ? { amount: signAmount } : {}) });
        toast.success("Contract signed.");
        refreshThread();
        loadMessages();
        return true;
      } catch (err) {
        if (isStaleOffer(err)) { // v414
          refreshThread();
          loadMessages();
          toast.error(err.response.data.detail || err.response.data.error || "The amount changed. Please review the agreement again.");
          return false;
        }
        toast.error(calmError(err, "Failed to execute the agreement."));
        return false;
      }
    },
    [thread?.id, currentThread, refreshThread, loadMessages]
  );

  const hasCompletedMessage = useMemo(() => {
    return (messages || []).some((m) => {
      const type = (m.message_type || m.type || "").toLowerCase();
      const content = (m.content || m.text || "").toLowerCase();
      const action = (m.metadata?.action || "").toLowerCase();
      const status = (m.metadata?.status || "").toLowerCase();
      return (
        type === "payment_trigger" ||
        type === "payout_released" ||
        type === "payment_released" ||
        type === "live_links_approved" ||
        type === "chat_closed" ||
        action === "live_links_approved" ||
        action === "payout_released" ||
        status === "completed" ||
        (!isChatText(m) && content.includes("escrow payment released")) ||
        (!isChatText(m) && content.includes("payout has been released")) ||
        (!isChatText(m) && content.includes("payment released")) ||
        (!isChatText(m) && content.includes("payout released")) ||
        (!isChatText(m) && content.includes("deliverables & live links approved")) ||
        (!isChatText(m) && content.includes("collaboration completed")) ||
        (!isChatText(m) && content.includes("ugc deliverable approved")) ||
        (!isChatText(m) && content.includes("invoice generated and payment has been processed"))
      );
    });
  }, [messages]);

  const isDealCompleted = Boolean(
    currentThread?.isDealCompleted ||
    hasCompletedMessage ||
    ["COMPLETED", "CLOSED", "PAID", "RELEASED", "RESOLVED"].includes(currentThread?.status?.toUpperCase()) ||
    ["COMPLETED", "CLOSED", "PAID", "RELEASED"].includes(currentThread?.ugc_order?.status?.toUpperCase()) ||
    ["COMPLETED", "CLOSED", "PAID", "RELEASED"].includes(currentThread?.ugc_order?.payment_status?.toUpperCase()) ||
    ["COMPLETED", "CLOSED", "PAID", "RELEASED"].includes(currentThread?.payout_status?.toUpperCase()) ||
    ["COMPLETED", "CLOSED", "PAID", "RELEASED"].includes(currentThread?.flow_state?.toUpperCase()) ||
    Boolean(currentThread?.utr_number || currentThread?.transaction?.utr_number)
  );

  const isEscrowFunded = Boolean(
    currentThread?.payment_funded === true ||
    currentThread?.escrow_funded === true ||
    currentThread?.escrow_hold === true ||
    currentThread?.isEscrowFunded === true ||
    currentThread?.ugc_order?.is_escrow_funded ||
    currentThread?.ugc_order?.escrow_funded
  );

  // Time order, whatever order rows arrived in (socket / poll / local store) — session 23.
  const orderedMessages = useMemo(() => sortChronologically(messages), [messages]);

  return {
    currentThread,
    messages: orderedMessages,
    loadError,
    sending,
    isBrand,
    isUgcOrder,
    isMySignatureSigned,
    isOtherPartySigned,
    isDealCompleted,
    isEscrowFunded,
    hasCompletedMessage,
    sendText,
    retryMessage, // v414
    acceptCounter,
    sendCounter,
    payIntoEscrow,
    paying,
    approveDeliverable,
    requestChanges,
    declineRevisions,
    declineLinkResubmission,
    submitLiveLink,
    approveLiveLinks,
    rejectLiveLinks,
    uploadDeliverable,
    sendAttachment, // v417
    attaching, // v417
    submitReview,
    sendSignOtp,
    signAgreement,
    refreshThread,
    loadMessages,
  };
}
