import { isInhouseBrand, INHOUSE_MIN_OFFER } from "./directInvites"; // v419
import { logIgnored } from "./logIgnored";
import { chatBlockFor, chatBlockedUntil, chatActionNotice, forgetChatBlock } from "./chatRestriction";
import { emitThreadEvent, emitAdminEvent } from "./socketAccess";
import express from "express";
import crypto from "crypto";
import { inspectContactLeakage } from "./helpers";
import { checkAbusiveContent } from "./abuseFilter";
import { chatModeration, newModerationEvent } from "./chatModeration";
import { splitNumberAcrossMessages } from "./contactSecurityFilter"; // v414: split-number check from saved history
import { isBrandLike } from "./roleGuards"; // v417: brand side = owner + team
import { chatAttachmentProblem, CHAT_ATTACHMENT_MAX_BYTES, CHAT_ATTACHMENT_SIZE_ERROR } from "./fileMagic"; // v417: attachment type / size

// Core chat/messaging routes: listing a user's threads, fetching a single
// thread, fetching/sending messages, and admin chat-moderation endpoints.
//
// NOTE: this deliberately covers only the "generic chat infrastructure"
// routes. UGC-order-specific and Campaign-Deal-specific chat ACTIONS (sign,
// negotiate, approve, submit-live-link, etc.) still live in server.ts for
// now, because they're tightly coupled to large UGC/Deals lifecycle
// handler functions (syncUgcLifecycleEvent and friends) that would need
// their own careful, separate extraction pass — moving them together with
// this file risked a much larger, riskier change. This split is
// intentionally incremental.
// Inbox cache (session 23). Short on purpose: it only merges bursts; any write clears it.
export const INBOX_TTL_MS = 5000;
// v347 (Ravi approved): the only message types a non-staff user may post through
// POST /chat/v2/threads/:id/messages. Everything else (lifecycle cards) is server-written.
export const USER_CHAT_MESSAGE_TYPES = new Set(["text", "attachment", "file", "image", "video"]);
// v414: the attachment types — only kept when the message really carries this thread's attachment.
export const USER_ATTACHMENT_TYPES = new Set(["attachment", "file", "image", "video"]);
/** v414: the type a non-staff message is saved as. Attachment types need a real attachment; anything else is "text". */
export function userMessageType(rawType: any, hasAttachment: boolean): string {
  const t = String(rawType || "text");
  if (USER_ATTACHMENT_TYPES.has(t) && hasAttachment) return t;
  return "text";
}
/** v414: an attachment message's text is its file label only (one short line). */
export function attachmentLabel(text: any, path?: string | null): string {
  const first = String(text || "").split(/\r?\n/)[0].trim().slice(0, 160);
  if (/^📎\s*Attached file:\s*\S/u.test(first)) return first;
  const ext = String(path || "").match(/\.([A-Za-z0-9]{1,8})$/)?.[1];
  return `📎 Attached file${ext ? ` (.${ext.toLowerCase()})` : ""}`;
}
/** v414: a client message id — string, trimmed, max 64 chars, only A-Z a-z 0-9 _ -; else null. */
export function cleanClientMsgId(v: any): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.length <= 64 && /^[A-Za-z0-9_-]+$/.test(t) ? t : null;
}
/** v414: chats of these deals take no new messages (COMPLETED stays open for "thanks" talk). */
export const CHAT_CLOSED_STATES = ["CANCELLED", "CANCELED", "DECLINED", "REJECTED", "REFUNDED", "EXPIRED"];
export function isChatClosed(thread: any, dealStatus?: any): boolean {
  const vals = [thread?.status, thread?.flow_state, thread?.ugc_order?.status, dealStatus].map((v) => String(v || "").toUpperCase());
  return vals.some((v) => CHAT_CLOSED_STATES.includes(v));
}
// v417: Ybex staff messages in a deal chat. The client shows these as "Ybex Support" (never as the brand).
// Shape on every message from GET /chat/v2/threads/:id/messages, POST …/messages and the socket "new_message":
//   sender_role: "admin", is_staff: true, sender_label: "Ybex Support", metadata.sender_role: "admin", metadata.is_staff: true
export const STAFF_SENDER_LABEL = "Ybex Support";
const STAFF_ROLES = new Set(["admin", "sub_admin", "support", "staff"]);
/** v417: was this message written by Ybex staff? Covers the old shapes too (admin_injection, "Platform Admin"). Pure. */
export function isStaffMessage(m: any): boolean {
  if (!m) return false;
  const meta = (m.metadata && typeof m.metadata === "object") ? m.metadata : {};
  const role = String(m.sender_role || meta.sender_role || "").toLowerCase();
  if (STAFF_ROLES.has(role)) return true;
  if (m.is_staff === true || meta.is_staff === true) return true;
  if (String(m.message_type || "") === "admin_injection") return true;
  const from = String(m.from_name || "").trim();
  return from === "Platform Admin" || from === STAFF_SENDER_LABEL;
}
/** v417: the staff marker fields to add to a message (empty object for non-staff). Pure. */
export function staffMarker(m: any): Record<string, any> {
  if (!isStaffMessage(m)) return {};
  const meta = (m.metadata && typeof m.metadata === "object") ? m.metadata : {};
  return { sender_role: "admin", is_staff: true, sender_label: STAFF_SENDER_LABEL, metadata: { ...meta, sender_role: "admin", is_staff: true } };
}
const inboxCache = new Map<string, { at: number; data: any; gen: number }>();
const inboxInflight = new Map<string, Promise<any>>();
let inboxGen = 0;
/** Called after every successful non-GET API request (server.ts), and usable by tests. */
export function clearInboxCache() {
  inboxGen += 1;
  inboxCache.clear();
}

/** Last activity of a thread: its newest message, else its own update/creation time. */
export function threadActivityTime(t: any): number {
  const cands = [t?.last_message?.created_at, t?.last_message_at, t?.updated_at, t?.created_at];
  let best = 0;
  for (const c of cands) {
    const v = new Date(c || 0).getTime();
    if (Number.isFinite(v) && v > best) best = v;
  }
  return best;
}

/** Newest activity first; stable for equal times. */
export function sortThreadsByActivity<T>(list: T[]): T[] {
  return (list || [])
    .map((t, i) => ({ t, i, k: threadActivityTime(t) }))
    .sort((a, b) => (a.k === b.k ? a.i - b.i : b.k - a.k))
    .map((x) => x.t);
}

/** Oldest first; rows without a usable time go last. Stable for equal times. */
export function sortMessagesChronologically<T extends { created_at?: any }>(list: T[]): T[] {
  const t = (m: any) => {
    const v = new Date(m?.created_at || 0).getTime();
    return Number.isFinite(v) && v > 0 ? v : Number.POSITIVE_INFINITY;
  };
  return list
    .map((m, i) => ({ m, i, k: t(m) }))
    .sort((a, b) => (a.k === b.k ? a.i - b.i : a.k < b.k ? -1 : 1))
    .map((x) => x.m);
}

export function setupChatCoreRoutes(
  app: express.Application,
  router: express.Router,
  {
    supabase,
    privilegedSupabase,
    getDb,
    saveDb,
    parseAuthUser,
    ensureUGCChatThread,
    populateThreadData,
    insertChatMessageToSupabase,
  }: {
    supabase: any;
    privilegedSupabase: any;
    getDb: () => any;
    saveDb: (db: any) => void;
    parseAuthUser: (req: express.Request) => Promise<any>;
    ensureUGCChatThread: (order: any, brief: any, user: any, io: any) => Promise<any>;
    populateThreadData: (threads: any[], userId: string | string[]) => Promise<any[]>; // v417: list = my whole side
    insertChatMessageToSupabase: (payload: any) => Promise<any>;
  }
) {

  // Session 38: blocked / flagged chat messages are kept in Supabase (backend/chatModeration.ts).
  const moderation = chatModeration({ getClient: () => privilegedSupabase || null, getDb, saveDb });

  // v417: every id on my side of a chat. Brand side = the brand owner + all its team members (+ me);
  // a creator's side is just themselves. Used so the brand side's own messages never count as unread.
  const sideCache = new Map<string, { at: number; ids: string[] }>();
  const mySideIds = async (user: any): Promise<string[]> => {
    const own = [String(user?.user_id || ""), String(user?.parent_brand_id || "")].filter(Boolean);
    if (!user?.parent_brand_id && !isBrandLike(user?.role)) return Array.from(new Set(own));
    const brandId = String(user.parent_brand_id || user.user_id);
    const hit = sideCache.get(brandId);
    if (hit && Date.now() - hit.at < 60_000) return Array.from(new Set([...own, ...hit.ids]));
    const ids = new Set<string>([brandId]);
    for (const u of (getDb().users || [])) if (u && String(u.parent_brand_id || "") === brandId && u.user_id) ids.add(String(u.user_id));
    const c = privilegedSupabase || supabase;
    if (c) {
      try {
        const { data } = await c.from('users').select('user_id').eq('parent_brand_id', brandId).limit(200);
        for (const r of data || []) if (r?.user_id) ids.add(String(r.user_id));
      } catch (e) { logIgnored("chat_routes:my-side-ids", e); }
    }
    const list = Array.from(ids);
    sideCache.set(brandId, { at: Date.now(), ids: list });
    if (sideCache.size > 5000) sideCache.clear();
    return Array.from(new Set([...own, ...list]));
  };

  // v417: the real size of an uploaded chat attachment (storage metadata), or null when it can't be read.
  const storedAttachmentSize = async (path: string): Promise<number | null> => {
    const c = privilegedSupabase || supabase;
    if (!c?.storage) return null;
    try {
      const slash = path.lastIndexOf("/");
      const folder = path.slice(0, slash); const name = path.slice(slash + 1);
      const { data } = await c.storage.from("content-submissions").list(folder, { search: name, limit: 5 });
      const hit = (data || []).find((f: any) => f?.name === name);
      const n = Number(hit?.metadata?.size);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch (e) { logIgnored("chat_routes:attachment-size", e); return null; }
  };

  // v414: the sender's last 6 text messages in this thread, oldest first (for the split-number check).
  const SPLIT_NUMBER_WINDOW_MS = 10 * 60 * 1000;
  const recentSenderTexts = async (threadId: string, senderId: string): Promise<string[]> => {
    // v414: only messages from the last 10 minutes — yesterday's "75000" is not half a phone number.
    const since = Date.now() - SPLIT_NUMBER_WINDOW_MS;
    const isRecent = (m: any) => { const t = new Date(m?.created_at || 0).getTime(); return Number.isFinite(t) && t >= since; };
    const c = privilegedSupabase || supabase;
    if (c) {
      try {
        const { data } = await c.from('chat_messages').select('text, created_at')
          .eq('thread_id', threadId).eq('sender_user_id', senderId).eq('message_type', 'text')
          .order('created_at', { ascending: false }).limit(6);
        if (Array.isArray(data)) return data.filter(isRecent).map((m: any) => String(m?.text || "")).reverse(); // v414: last 10 min only
      } catch (e) { logIgnored("chat_routes:recent-sender-texts", e); }
      return [];
    }
    const local = (getDb().chat_messages || []).filter((m: any) => m.thread_id === threadId
      && String(m.sender_user_id || m.sender_id || "") === senderId && String(m.message_type || "text") === "text");
    return sortMessagesChronologically(local).slice(-6).filter(isRecent).map((m: any) => String(m.text || m.content || "")); // v414: last 10 min only
  };

  // Bounded parallelism for per-row Supabase work. Serial `for … await` over every UGC order was
  // the single largest cost of opening the inbox: two round trips per order, one after another.
  const mapLimit = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> => {
    const out: R[] = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        try { out[i] = await fn(items[i]); } catch (e) { out[i] = undefined as any; }
      }
    });
    await Promise.all(workers);
    return out;
  };

  // Threads for this user, Supabase + local store merged (newest copy of each wins).
  // Session 58 (bug hunt): a brand TEAM member's inbox was empty — the threads belong to the parent brand.
  const loadUserThreads = async (userId: string, brandId?: string) => {
    let threads: any[] = [];
    if (supabase) {
      try {
        const { data: dbThreads } = await (privilegedSupabase || supabase).from('chat_threads')
          .select('*')
          .or(`creator_id.eq.${userId},brand_id.eq.${userId}${brandId && brandId !== userId ? `,brand_id.eq.${brandId}` : ""}`)
          .order('updated_at', { ascending: false });
        if (dbThreads) threads = dbThreads;
      } catch (e) {
        console.error("[GET /chat/v2/threads] Supabase fetch error:", e);
      }
    }
    const db = getDb();
    const localThreads = (db.chat_threads || []).filter((t: any) => t.creator_id === userId || t.brand_id === userId || (brandId && t.brand_id === brandId));
    threads = threads.map(st => {
      const lt = localThreads.find((l: any) => l.id === st.id || (st.deal_id && st.deal_id === l.deal_id));
      if (lt) {
        const stUpdated = new Date(st.updated_at || st.created_at || 0).getTime();
        const ltUpdated = new Date(lt.updated_at || lt.created_at || 0).getTime();
        if (ltUpdated > stUpdated) {
          return { ...st, ...lt, flow_state: lt.flow_state || st.flow_state || st.status, status: lt.status || st.status };
        } else {
          return { ...lt, ...st, flow_state: st.flow_state || lt.flow_state || st.status, status: st.status || lt.status };
        }
      }
      return st;
    });
    localThreads.forEach((lt: any) => {
      if (!threads.some(t => t.id === lt.id || (t.deal_id && t.deal_id === lt.deal_id))) {
        threads.push(lt);
      }
    });
    return threads;
  };

  // Lightweight count for the nav badge. Layout used to fetch the ENTIRE populated thread list
  // every 30 seconds on every page just to read `.length` — the heaviest request in the app, run
  // continuously in the background for every signed-in user. Registered before /:threadId so
  // "count" is not read as a thread id.
  router.get("/chat/v2/threads/count", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const threads = await loadUserThreads(user.user_id, user.parent_brand_id || undefined);
    // Session 23: the nav badge shows UNREAD messages. Layout used to fetch the whole populated
    // inbox every 30 s to add them up (the heaviest request in the app). One head-count query now.
    let unread = 0;
    try {
      const ids = threads.map((t: any) => t.id).filter(Boolean);
      const client = privilegedSupabase || supabase;
      if (client && ids.length) {
        const { count } = await client.from('chat_messages')
          .select('message_id', { count: 'exact', head: true })
          .in('thread_id', ids)
          .eq('read', false)
          // v414: messages from my own side are never "unread" for me. v417: the whole brand side (owner + team).
          .not('sender_user_id', 'in', `(${(await mySideIds(user)).join(",")})`);
        unread = Number(count) || 0;
      }
    } catch (e) { logIgnored("chat_routes:threads-count-unread", e); }
    return res.json({ count: threads.length, unread });
  });


  // v419 (Ravi): a paid deal whose cancel request is waiting for Ybex support → `cancel_requested: true` on the thread,
  // so the chat, inbox and deals show "Cancellation under review" (and stop the upload nudges). Read from the open
  // "Cancel & refund request" support ticket on that thread (closed / resolved ticket → the flag goes away).
  const markCancelRequested = async (threads: any[]) => {
    // v419: a Ybex in-house brand's deal starts at ₹500, not ₹3,000 — the chat's offer boxes read this.
    for (const t of threads || []) { try { if (t && t.brand_id && !t.is_ugc && (await isInhouseBrand(t.brand_id))) t.offer_minimum = INHOUSE_MIN_OFFER; } catch { /* default floor */ } }
    const list = (threads || []).filter((t: any) => t && t.id && !['CANCELLED', 'CANCELED', 'REFUNDED', 'COMPLETED'].includes(String(t.status || '').toUpperCase()));
    if (!list.length) return threads;
    const ids = list.map((t: any) => String(t.id));
    const open = new Set<string>();
    const isOpen = (tk: any) => ['OPEN', 'IN PROGRESS', 'IN_PROGRESS', 'PENDING'].includes(String(tk?.status || '').toUpperCase()) && /^Cancel & refund request/i.test(String(tk?.subject || ''));
    try {
      const sb = privilegedSupabase || supabase;
      if (sb) {
        const { data } = await sb.from('support_tickets').select('thread_id, subject, status').in('thread_id', ids.slice(0, 300)).ilike('subject', 'Cancel & refund request%');
        for (const tk of data || []) if (isOpen(tk) && tk.thread_id) open.add(String(tk.thread_id));
      }
    } catch (e) { logIgnored("chat_routes:v419-cancel-flag", e); }
    for (const tk of (getDb().support_tickets || [])) if (isOpen(tk) && tk.thread_id && ids.includes(String(tk.thread_id))) open.add(String(tk.thread_id));
    for (const t of threads) if (t && open.has(String(t.id))) t.cancel_requested = true;
    return threads;
  };

  router.get("/chat/v2/threads", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const t0 = Date.now();

    // Session 23: the inbox is the heaviest request (threads + heal + profiles + orders + deals +
    // message windows). The dashboard, the inbox, the chat and a socket event often ask for it
    // within the same second. Same user at the same moment → one computation (in-flight share);
    // an answer is reused for INBOX_TTL_MS; ANY write request clears it (see clearInboxCache).
    const uid = String(user.user_id);
    const hit = inboxCache.get(uid);
    if (hit && Date.now() - hit.at < INBOX_TTL_MS && hit.gen === inboxGen) {
      res.setHeader("X-Inbox-Cache", "hit");
      return res.json(hit.data);
    }
    const running = inboxInflight.get(uid);
    if (running) {
      try { const data = await running; res.setHeader("X-Inbox-Cache", "shared"); return res.json(data); }
      catch { /* the first computation failed — compute our own below */ }
    }
    const myGen = inboxGen;
    let settle: (v: any) => void = () => {};
    let fail: (e: any) => void = () => {};
    const shared = new Promise<any>((ok, no) => { settle = ok; fail = no; });
    shared.catch(() => {});
    inboxInflight.set(uid, shared);
    const sendJson = res.json.bind(res);
    res.json = (body: any) => {
      if (inboxInflight.get(uid) === shared) inboxInflight.delete(uid);
      if (res.statusCode < 400) {
        if (myGen === inboxGen) inboxCache.set(uid, { at: Date.now(), data: body, gen: myGen });
        settle(body);
      } else {
        fail(new Error("inbox failed"));
      }
      return sendJson(body);
    };
    res.on("close", () => {
      if (inboxInflight.get(uid) === shared) { inboxInflight.delete(uid); fail(new Error("closed")); }
    });

    // 1. Threads first.
    let threads: any[] = await loadUserThreads(user.user_id, user.parent_brand_id || undefined);
    const tThreads = Date.now();

    // 2. Auto-heal: every UGC order must have a thread. This used to run ensureUGCChatThread for
    //    EVERY order, serially, on every inbox load (and every 10 s poll on mobile) — even for
    //    orders whose thread already existed. Now only orders with no thread are healed, in
    //    parallel, and the healed threads are added to the list.
    try {
      let userOrders: any[] = [];
      if (supabase) {
        const { data: ords } = await (privilegedSupabase || supabase).from('ugc_orders')
          .select('*')
          .or(`creator_id.eq.${user.user_id},brand_id.eq.${user.user_id}${user.parent_brand_id ? `,brand_id.eq.${user.parent_brand_id}` : ""}`); // v417: team member heals the brand's orders
        if (ords) userOrders = ords;
      }
      const db = getDb();
      const localOrds = (db.ugc_orders || []).filter((o: any) => o.creator_id === user.user_id || o.brand_id === user.user_id || (user.parent_brand_id && o.brand_id === user.parent_brand_id)); // v417
      const combinedOrders = [...userOrders];
      localOrds.forEach((lo: any) => {
        if (!combinedOrders.some(o => o.id === lo.id)) combinedOrders.push(lo);
      });

      const known = new Set<string>();
      threads.forEach((t: any) => { if (t.id) known.add(t.id); if (t.deal_id) known.add(t.deal_id); if (t.ugc_order_id) known.add(t.ugc_order_id); });
      // A thread that exists but is behind a COMPLETED order is also healed (status sync).
      const needsHeal = combinedOrders.filter((o: any) => {
        if (!o?.id) return false;
        if (!known.has(o.id)) return true;
        if (o.status === 'COMPLETED') {
          const t = threads.find((x: any) => x.id === o.id || x.deal_id === o.id);
          return t && t.status !== 'COMPLETED';
        }
        return false;
      });
      if (needsHeal.length > 0) {
        const healed = await mapLimit(needsHeal, 5, (ord: any) => ensureUGCChatThread(ord, null, user, req.app.get("io")));
        healed.forEach((ht: any) => {
          if (!ht || !ht.id) return;
          const i = threads.findIndex((t: any) => t.id === ht.id || (ht.deal_id && t.deal_id === ht.deal_id));
          if (i >= 0) threads[i] = { ...threads[i], ...ht };
          else threads.unshift(ht);
        });
      }
    } catch (e) {
      console.error("[GET /chat/v2/threads] Auto-heal UGC orders error:", e);
    }
    const tHeal = Date.now();

    const db = getDb();

    // If dedicated test thread exists, ensure it is available for easy manual browser testing
    const dedicatedTestThread = (db.chat_threads || []).find((t: any) => t.id === 'thread_test_live_link_flow_v2');
    if (dedicatedTestThread && !threads.some(t => t.id === 'thread_test_live_link_flow_v2')) {
      threads.unshift(dedicatedTestThread);
    }

    // 3. Populate full thread metadata
    const populated = await populateThreadData(threads, await mySideIds(user)); // v417: owner + team never unread
    const tEnd = Date.now();
    // Stage timings, so the next "inbox is slow" report can be answered from the logs instead of
    // by reading code.
    res.setHeader('Server-Timing', `threads;dur=${tThreads - t0}, heal;dur=${tHeal - tThreads}, populate;dur=${tEnd - tHeal}`);
    if (tEnd - t0 > 3000) {
      console.warn(`[GET /chat/v2/threads] slow: ${tEnd - t0}ms (threads ${tThreads - t0}ms, heal ${tHeal - tThreads}ms, populate ${tEnd - tHeal}ms, n=${threads.length})`);
    }
    // Newest activity first. The list used to follow chat_threads.updated_at (changes on status
    // updates, not on every message) and healed threads were unshifted to the top — so a thread
    // with a day-old message could sit above one messaged a minute ago (session 23).
    await markCancelRequested(populated); // v419
    return res.json(sortThreadsByActivity(populated));
  });


  router.get("/chat/v2/threads/:threadId", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { threadId } = req.params;

    // Check if this threadId is a UGC order or deal ID and ensure thread
    if (threadId.startsWith('ugcord_')) {
      let ord: any = null;
      if (supabase) {
        const { data } = await (privilegedSupabase || supabase).from('ugc_orders').select('*').eq('id', threadId).maybeSingle();
        if (data) ord = data;
      }
      if (!ord) {
        const db = getDb();
        ord = (db.ugc_orders || []).find((o: any) => o.id === threadId);
      }
      // v414: only a party of the order (or staff) may auto-heal its thread.
      const healStaff = ["admin", "sub_admin"].includes(String(user.role || "")) || user.team_role === "sub_admin";
      const healMe = new Set([String(user.user_id), String(user.parent_brand_id || user.user_id)]);
      if (ord && (healStaff || healMe.has(String(ord.creator_id)) || healMe.has(String(ord.brand_id)))) {
        await ensureUGCChatThread(ord, null, user, req.app.get("io"));
      }
    }

    let thread: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('chat_threads')
          .select('*')
          .or(`id.eq.${threadId},deal_id.eq.${threadId}`)
          .maybeSingle();
        if (data) thread = data;
      } catch (e) { logIgnored("chat_routes:209", e); }
    }
    const db = getDb();
    const localT = (db.chat_threads || []).find((t: any) => t.id === threadId || t.deal_id === threadId);
    if (!thread && localT) {
      thread = localT;
    } else if (thread) {
      // Trust Supabase data, but map agreed_amount back to counter_amount if negotiating
      if (thread.flow_state === 'NEGOTIATING_COUNTER' && thread.agreed_amount && !thread.counter_amount) {
        thread.counter_amount = thread.agreed_amount;
      }
    }
    
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    // WHO (session 27): the two parties and admins only.
    {
      const isStaff = ["admin", "sub_admin"].includes(String(user.role || "")) || user.team_role === "sub_admin";
      const me = new Set([String(user.user_id), String(user.parent_brand_id || user.user_id)]);
      if (!isStaff && !me.has(String(thread.creator_id)) && !me.has(String(thread.brand_id))) {
        return res.status(403).json({ detail: "You are not part of this chat.", code: "NOT_A_PARTICIPANT" });
      }
    }

    const [populated] = await populateThreadData([thread], await mySideIds(user)); // v417
    await markCancelRequested([populated]); // v419
    return res.json(populated);
  });


  router.get("/chat/v2/threads/:threadId/messages", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { threadId } = req.params;
    const client = privilegedSupabase || supabase;

    // Thread and messages are fetched in parallel (they were two round trips in a row).
    // Messages are asked for by both ids the caller might use; the thread row tells us the real one.
    const threadP = client
      ? Promise.resolve(client.from('chat_threads').select('id, creator_id, brand_id')
          .or(`id.eq.${threadId},deal_id.eq.${threadId}`).limit(1))
          .then((r: any) => (Array.isArray(r?.data) ? r.data[0] : r?.data) || null, () => null)
      : Promise.resolve(null);
    const msgsP = client
      ? Promise.resolve(client.from('chat_messages').select('*').eq('thread_id', threadId)
          .order('created_at', { ascending: true }).limit(2000))
          .then((r: any) => r?.data || [], (e: any) => { logIgnored("chat_routes:261", e); return []; })
      : Promise.resolve([]);

    const db = getDb();
    let thrRecord: any = await threadP;
    let targetThreadId = thrRecord?.id || threadId;
    if (!thrRecord) {
      thrRecord = (db.chat_threads || []).find((t: any) => t.id === threadId || t.deal_id === threadId) || null;
      if (thrRecord?.id) targetThreadId = thrRecord.id;
    }

    // WHO (session 27): only the two parties (a brand team member acts for the brand) and admins
    // read a chat. Before, any logged-in user could read any thread's messages by its id.
    const isStaff = ["admin", "sub_admin"].includes(String(user.role || "")) || user.team_role === "sub_admin";
    const me = new Set([String(user.user_id), String(user.parent_brand_id || user.user_id)]);
    if (!isStaff && thrRecord && !me.has(String(thrRecord.creator_id)) && !me.has(String(thrRecord.brand_id))) {
      return res.status(403).json({ detail: "You are not part of this chat.", code: "NOT_A_PARTICIPANT" });
    }
    if (!isStaff && !thrRecord) return res.json([]);

    let messages: any[] = await msgsP;
    if (client && targetThreadId !== threadId) {
      try {
        const { data: more } = await client.from('chat_messages').select('*').eq('thread_id', targetThreadId)
          .order('created_at', { ascending: true }).limit(2000);
        const have = new Set(messages.map((m: any) => String(m.message_id || m.id)));
        for (const m of more || []) if (!have.has(String(m.message_id || m.id))) messages.push(m);
      } catch (e) { logIgnored("chat_routes:msgs-by-real-id", e); }
    }
    const localMsgs = (db.chat_messages || []).filter((m: any) => m.thread_id === targetThreadId || m.thread_id === threadId);
    localMsgs.forEach((lm: any) => {
      const mid = lm.message_id || lm.id;
      // v414: same row = same id. Equal TEXT is not the same message ("ok" sent twice is two messages —
      // the second used to vanish when only the local copy had it).
      const alreadyExists = messages.some(m => {
        const mId = m.message_id || m.id;
        return Boolean(mId && mid && String(mId) === String(mid));
      });
      if (!alreadyExists) {
        messages.push(lm);
      }
    });
    // Local-only rows were pushed at the END, whatever their time — a card from 18:54 then sat
    // below messages from 18:57 for ever. One chronological order for everything (stable, so
    // equal timestamps keep their original order).
    messages = sortMessagesChronologically(messages);

    // Mark as read if user is receiver
    // In the background: the reply does not wait for this write any more.
    // Session 58 (bug hunt): many cards are saved with no receiver, so "receiver = me" never cleared them and every deal kept
    // a permanent unread badge. Mark read what the OTHER side sent (same rule the unread counts use).
    // v414: an admin reading a chat they are not part of must not mark it read for the real parties, and a
    // brand team member's "my side" is both their own id and the parent brand's.
    const readerIsParty = Boolean(thrRecord) && (me.has(String(thrRecord.creator_id)) || me.has(String(thrRecord.brand_id)));
    // v417: my side = brand owner + every team member — a teammate's message isn't "read" by the creator when I open it.
    const sideIds = readerIsParty ? await mySideIds(user) : Array.from(me).filter(Boolean);
    const sideSet = new Set(sideIds);
    if (supabase && readerIsParty && messages.some((m: any) => m.read === false && !sideSet.has(String(m.sender_user_id || "")))) {
      Promise.resolve((privilegedSupabase || supabase).from('chat_messages')
        .update({ read: true })
        .eq('thread_id', targetThreadId)
        .not('sender_user_id', 'in', `(${sideIds.join(",")})`)
        .eq('read', false)).catch((e: any) => logIgnored("chat_routes:289", e));
    }

    return res.json(messages.map(m => {
      const mid = m.message_id || m.id;
      const localMatch = localMsgs.find((lm: any) => (lm.message_id || lm.id) === mid);
      let meta = m.metadata || localMatch?.metadata || {};
      let mType = m.message_type || localMatch?.message_type;
      let mUrl = m.media_url || m.content_url || meta.content_url || 
        meta.video_url || meta.media_url || 
        localMatch?.media_url || localMatch?.content_url;
      const txt = m.text || m.content || "";

      if (!mType || mType === "system") {
        if (txt.includes("Deliverables Approved & Payment Released") || txt.includes("Payment Released & Approved") || txt.includes("payout is being processed via Escrow")) {
          mType = "live_links_approved";
        } else if (txt.includes("Live Post Link Submitted") || txt.includes("Live link submitted")) {
          mType = "live_links_submitted";
        } else if (txt.includes("Creator has signed the partnership agreement")) {
          mType = "creator_signed";
        } else if (txt.includes("Brand has signed the partnership agreement")) {
          mType = "brand_signed";
        } else if (txt.includes("Agreement Executed! Both parties have signed") || txt.includes("Agreement Executed")) {
          mType = "agreement_executed";
        } else if (txt.includes("Payment Secured!") || txt.includes("Payment Secured") || txt.includes("Escrow Payment Secured") || txt.includes("held safely in escrow")) {
          mType = "payment_secured";
          if (!meta.action) {
            meta = { ...meta, action: 'payment_secured' };
          }
        } else if (txt.includes("Brand requested a revision") || txt.includes("Revision feedback:") || txt.includes("CHANGES_REQUESTED")) {
          mType = "revision_requested";
          if (!meta.feedback && txt.includes("revision: ")) {
            const fb = txt.split("revision: ")[1]?.trim();
            meta = {
              ...meta,
              feedback: fb,
              notes: fb,
              revision_notes: fb,
              action: 'revision_requested'
            };
          }
        } else if (txt.includes("UGC Deliverable Draft Submitted") || txt.includes("Deliverable URL:")) {
          mType = "content_proof_submitted";
          if (!mUrl && txt.includes("Deliverable URL: ")) {
            mUrl = txt.split("Deliverable URL: ")[1]?.split("\n")[0]?.trim();
          }
        } else if (txt.includes("Creator declined revision") || txt.includes("declined the revision") || txt.includes("Declined Revision Request")) {
          mType = "revision_declined";
        } else if (txt.includes("UGC Deliverable Approved") || txt.includes("Deliverable Approved") || txt.includes("Content Approved") || txt.includes("Content Draft Approved")) {
          mType = "content_approved";
        } else if (txt.includes("UGC Order Cancelled") || txt.includes("Order Cancelled")) {
          mType = "order_cancelled";
        }
      }

      let senderUid = m.sender_user_id || m.sender_id || meta.sender_id;
      const sRole = (mType === 'brand_signed' || mType === 'creator_signed' || mType === 'agreement_executed')
        ? 'system'
        : (m.sender_role || meta.sender_role || (
          mType === 'live_links_submitted' || mType === 'content_proof_submitted' || mType === 'live_links_resubmit_declined'
            ? 'creator'
            : (mType === 'live_links_approved' || mType === 'live_links_resubmit_request' || mType === 'revision_requested'
              ? 'brand'
              : (thrRecord ? (String(thrRecord.creator_id) === String(senderUid) ? 'creator' : (String(thrRecord.brand_id) === String(senderUid) ? 'brand' : undefined)) : undefined))
        ));

      if (!senderUid && sRole === 'creator' && thrRecord?.creator_id) {
        senderUid = thrRecord.creator_id;
      } else if (!senderUid && sRole === 'brand' && thrRecord?.brand_id) {
        senderUid = thrRecord.brand_id;
      }

      if (mUrl) {
        if (!meta.content_url) meta.content_url = mUrl;
        if (!meta.video_url) meta.video_url = mUrl;
      }

      const out: any = {
        ...m,
        id: mid,
        message_id: mid,
        sender_id: senderUid,
        receiver_id: m.receiver_user_id || m.receiver_id,
        sender_user_id: senderUid,
        receiver_user_id: m.receiver_user_id || m.receiver_id,
        sender_role: sRole,
        message_type: mType,
        metadata: meta,
        media_url: mUrl,
        content_url: mUrl,
        video_url: mUrl,
        content: txt,
        text: txt
      };
      // v417: staff messages carry the "Ybex Support" marker (old admin rows included).
      return { ...out, ...staffMarker({ ...out, from_name: m.from_name, message_type: m.message_type || mType }) };
    }));
  });


  const chatSendHits = new Map<string, number[]>(); // v378 (QA L14): per-person message rate
  router.post("/chat/v2/threads/:threadId/messages", async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ detail: "Not authenticated", _status: 403 });
    const { threadId } = req.params;
    const { content, text } = req.body;
    // Session 53 (security): only Ybex staff may post a "system" message. A user sending
    // message_type:"system" skipped the abuse / phone-number filters and could fake a
    // "Payment secured" card in someone else's chat.
    const postIsStaff = ["admin", "sub_admin"].includes(String(user.role || "")) || user.team_role === "sub_admin";
    let msgText = (content || text || "").trim();
    if (!msgText) return res.status(400).json({ error: "Message content cannot be empty" });

    // v414: WHO first — the thread lookup and the participation check run BEFORE any moderation record,
    // auto-heal or rate-limit side effect (a stranger's post used to be logged as a violation in a chat
    // they are not part of, and could auto-heal someone else's UGC thread).
    // 1. Find thread in Supabase or local DB
    let thread: any = null;
    if (supabase) {
      try {
        const { data } = await (privilegedSupabase || supabase).from('chat_threads')
          .select('*')
          .or(`id.eq.${threadId},deal_id.eq.${threadId}`)
          .maybeSingle();
        if (data) thread = data;
      } catch (e) { logIgnored("chat_routes:457", e); }
    }
    if (!thread) {
      const db = getDb();
      thread = (db.chat_threads || []).find((t: any) => t.id === threadId || t.deal_id === threadId);
    }
    const postMe = new Set([String(user.user_id), String(user.parent_brand_id || user.user_id)]);

    // If still not found and looks like a UGC order, auto-heal thread creation
    if (!thread && threadId.startsWith('ugcord_')) {
      let ord: any = null;
      if (supabase) {
        const { data } = await (privilegedSupabase || supabase).from('ugc_orders').select('*').eq('id', threadId).maybeSingle();
        if (data) ord = data;
      }
      if (!ord) {
        const db = getDb();
        ord = (db.ugc_orders || []).find((o: any) => o.id === threadId);
      }
      // v414: only a party of the order (or staff) may heal its thread.
      if (ord && (postIsStaff || postMe.has(String(ord.creator_id)) || postMe.has(String(ord.brand_id)))) {
        thread = await ensureUGCChatThread(ord, null, user, req.app.get("io"));
      }
    }

    if (!thread) return res.status(404).json({ error: "Thread not found" });

    // Session 53 (security): only the two people in this chat (a brand team member acts for the brand)
    // or Ybex staff can post — the same rule reading the chat already had. The sender's side comes
    // from the thread, never from what the phone says.
    const isThreadCreator = String(thread.creator_id) === String(user.user_id);
    const isThreadBrand = postMe.has(String(thread.brand_id));
    if (!postIsStaff && !isThreadCreator && !isThreadBrand) {
      return res.status(403).json({ detail: "You are not part of this chat.", code: "NOT_A_PARTICIPANT" });
    }

    // v414: a cancelled / declined / refunded / expired deal's chat is closed to new messages (the UI hid
    // the box, the API still took them). A COMPLETED deal stays open for "thanks" talk.
    if (!postIsStaff) {
      let dealStatus = "";
      const dc = privilegedSupabase || supabase;
      if (dc && thread.deal_id && thread.deal_id !== thread.id) {
        try {
          const { data: d } = await dc.from('deals').select('status').eq('id', thread.deal_id).maybeSingle();
          dealStatus = String(d?.status || "");
        } catch (e) { logIgnored("chat_routes:closed-deal-status", e); }
      }
      if (isChatClosed(thread, dealStatus)) {
        return res.status(409).json({ code: "CHAT_CLOSED", error: "This chat is closed because the deal has ended.", detail: "This chat is closed because the deal has ended." });
      }
    }

    // v347 (Ravi approved): a non-staff user may only send the plain chat types the app itself sends
    // (ChatBox / mobile chat: text, attachment; SendBrief: file; image/video kept for attachments).
    // Lifecycle types (payout_released, payment_funded, content_approved, live_links_submitted,
    // order_cancelled, …) are written by the server directly, never through this route — anything
    // else from a user is saved as plain "text" (not rejected, so an old app build never breaks).
    // v414: an attachment type only WITH a real attachment of this thread; otherwise "text". The text of
    // an attachment is just its file label.
    const rawType = req.body?.message_type;
    const attachmentPath = chatAttachmentPath(req.body?.attachment_url, thread.id, threadId);
    // v417: attachments are checked on the server — allowed type (photo / MP4 / MOV / PDF) and 50 MB max, else 400.
    if (attachmentPath && !postIsStaff) {
      const typeProblem = chatAttachmentProblem({ path: attachmentPath, contentType: req.body?.content_type ?? req.body?.contentType, size: req.body?.size ?? req.body?.file_size });
      if (typeProblem) return res.status(400).json({ error: typeProblem, detail: typeProblem, code: "BAD_ATTACHMENT" });
      const storedSize = await storedAttachmentSize(attachmentPath);
      if (storedSize !== null && storedSize > CHAT_ATTACHMENT_MAX_BYTES) {
        Promise.resolve((privilegedSupabase || supabase)?.storage?.from("content-submissions").remove([attachmentPath])).catch((e: any) => logIgnored("chat_routes:attachment-too-big-remove", e)); // v417
        return res.status(400).json({ error: CHAT_ATTACHMENT_SIZE_ERROR, detail: CHAT_ATTACHMENT_SIZE_ERROR, code: "BAD_ATTACHMENT" });
      }
    }
    const message_type = postIsStaff ? rawType : userMessageType(rawType, Boolean(attachmentPath));
    if (!postIsStaff && message_type !== 'text') msgText = attachmentLabel(msgText, attachmentPath);

    // v378 (QA L14): messages up to 4,000 characters, and at most 30 messages a minute per person (spam / flood).
    if (!postIsStaff) {
      if (msgText.length > 4000) return res.status(400).json({ error: "Message is too long (max 4,000 characters).", detail: "Message is too long (max 4,000 characters)." });
      const nowT = Date.now(); const key = String(user.user_id || "");
      const hits = (chatSendHits.get(key) || []).filter((t: number) => nowT - t < 60_000);
      if (hits.length >= 30) return res.status(429).json({ error: "You're sending messages too fast. Please wait a moment.", detail: "You're sending messages too fast. Please wait a moment.", code: "CHAT_TOO_FAST" });
      hits.push(nowT); chatSendHits.set(key, hits);
      if (chatSendHits.size > 20000) for (const [k, v] of chatSendHits) if (!v.length || nowT - v[v.length - 1] > 60_000) chatSendHits.delete(k);
    }
    // Session 58: an admin can pause someone's chat for breaking the rules (Admin → chat violations → Restrict).
    if (!postIsStaff) {
      const blockedUntil = await chatBlockFor(privilegedSupabase || supabase, getDb().user_violations || [], String(user.user_id || ""));
      if (blockedUntil) {
        const d = new Date(blockedUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
        return res.status(403).json({ code: "CHAT_RESTRICTED", error: `Your chat is paused until ${d} because of a chat-rule violation.`, detail: `Your chat is paused until ${d} because of a chat-rule violation.`, until: blockedUntil });
      }
    }
    // threadId + sender are what let the filter reassemble a number split across several
    // messages; without them only single-message detection works.
    if (message_type !== 'system') {
      // Both checks run HERE, on the server. The frontend copies exist only for instant
      // feedback — a client-side block is bypassed by posting to this route directly, which
      // is exactly what someone determined to share a number will do.
      // Session 38: saved to Supabase (chat_moderation_events) instead of this instance's local
      // file only. Not awaited: recording must never slow down or stop the block itself.
      const recordAttempt = (code: string, reason: string, matched?: string, blocked = true) => {
        moderation.record(newModerationEvent({
          threadId: thread.id || threadId, senderId: user.user_id, senderRole: user.role || null,
          code, reason, matched: matched || null, content: String(msgText), blocked,
        })).catch((e: any) => console.warn("[chat] could not record blocked attempt:", e?.message || e));
      };

      // Harassment first: it is the more serious of the two, and a message can trip both.
      const abuse = checkAbusiveContent(msgText);
      if (abuse.blocked) {
        recordAttempt(abuse.code || "ABUSE", abuse.severity || "harassment", abuse.matched);
        return res.status(400).json({
          blocked: true,
          error: abuse.message || "This message was blocked. Please keep the conversation professional.",
          code: abuse.code || "ABUSE_BLOCKED"
        });
      }
      if (abuse.severity === "profanity" && abuse.matched) {
        // Not blocked, but recorded so admin can see a pattern building up.
        recordAttempt("PROFANITY_FLAGGED", "profanity", abuse.matched, false);
      }

      const leak = inspectContactLeakage(msgText, { threadId, senderId: user.user_id });
      if (leak.blocked) {
        recordAttempt(leak.code || "CONTACT_INFO_BLOCKED", "contact_leak");
        return res.status(400).json({
          blocked: true,
          error: leak.message || "Contact details cannot be shared in chat. Please keep all communications on-platform.",
          code: leak.code || "CONTACT_INFO_BLOCKED"
        });
      }

      // v414: a number sent in pieces over several messages, checked from this chat's saved history (the
      // in-memory buffer above only sees messages that landed on THIS server instance).
      if (message_type === 'text' || !message_type) {
        const previous = await recentSenderTexts(thread.id, String(user.user_id));
        if (splitNumberAcrossMessages(msgText, previous)) {
          recordAttempt("PHONE_SPLIT", "contact_leak");
          return res.status(400).json({
            blocked: true,
            error: "That looks like a phone number split across messages. Please keep the conversation on Ybex.",
            code: "PHONE_SPLIT"
          });
        }
      }
    }

    // v415: staff who are not a party of this chat always post as 'admin' (shown as "Ybex Support");
    // the body's sender_role is ignored so a message can never be passed off as the brand's / creator's.
    const senderRole = isThreadCreator ? 'creator' : isThreadBrand ? 'brand' : 'admin';
    const receiverId = (senderRole === 'creator') ? thread.brand_id : thread.creator_id;
    const nowIso = new Date().toISOString();
    const msgId = crypto.randomUUID();

    // v414 (lead OK): the client's own id for this message, so the app can match its "sending" bubble.
    // Kept inside metadata (no new column) and echoed top-level.
    const clientMsgId = cleanClientMsgId(req.body?.client_msg_id);
    const msgMeta: any = {
      ...(attachmentPath && message_type !== 'text' ? { attachment_url: attachmentPath } : {}),
      ...(clientMsgId ? { client_msg_id: clientMsgId } : {}),
      ...(senderRole === 'admin' ? { sender_role: 'admin', is_staff: true } : {}), // v417: staff marker
    };
    // 2. Insert into Supabase chat_messages (matching exact table schema)
    const dbMsg = {
      message_id: msgId,
      thread_id: thread.id,
      sender_user_id: user.user_id,
      receiver_user_id: receiverId,
      sender_role: senderRole,
      text: msgText,
      from_name: senderRole === 'admin' ? STAFF_SENDER_LABEL : user.name, // v417: staff post as "Ybex Support"
      message_type: message_type || 'text',
      created_at: nowIso,
      read: false,
      // Session 58 (Q16): desktop chat attachments — the file path was sent but never saved, so the other side
      // only saw "📎 Attached file". Only a chat-attachments path for THIS thread is kept (opened via /api/media).
      // v414: users never set metadata — only this server-built attachment path (no action / isPayment / payment_funded …).
      ...(Object.keys(msgMeta).length ? { metadata: msgMeta } : {}),
    };

    if (supabase) {
      // v414: a message that was NOT saved used to answer 200, so the sender saw it as sent while the other
      // side never got it. Now the client gets 503 MESSAGE_NOT_SAVED and shows it as failed.
      let saveError: any = null;
      try {
        const ins = await insertChatMessageToSupabase(dbMsg);
        saveError = ins && ins.error ? ins.error : null;
      } catch (err) {
        saveError = err || new Error("insert failed");
      }
      if (saveError) {
        console.error("[POST /chat/v2/threads/:threadId/messages] message not saved:", saveError?.message || saveError);
        return res.status(503).json({ code: "MESSAGE_NOT_SAVED", error: "Your message couldn't be sent. Please try again.", detail: "Your message couldn't be sent. Please try again." });
      }
      try {
        // Update updated_at on thread
        await (privilegedSupabase || supabase).from('chat_threads').update({ 
          updated_at: nowIso 
        }).eq('id', thread.id);
      } catch (err) {
        console.warn("[POST /chat/v2/threads/:threadId/messages] Supabase notice:", err);
      }
    }

    // 3. Update local DB
    const db = getDb();
    if (!db.chat_messages) db.chat_messages = [];
    const localMsg = {
      ...dbMsg,
      id: msgId,
      sender_id: user.user_id,
      sender_user_id: user.user_id,
      receiver_id: receiverId,
      receiver_user_id: receiverId,
      sender_role: senderRole,
      content: msgText,
      message_type: message_type || 'text',
      ...(clientMsgId ? { client_msg_id: clientMsgId } : {}), // v414
      ...(senderRole === 'admin' ? { is_staff: true, sender_label: STAFF_SENDER_LABEL } : {}), // v417
    };
    db.chat_messages.push(localMsg);
    const localThr = (db.chat_threads || []).find((t: any) => t.id === thread.id || t.deal_id === thread.id);
    if (localThr) {
      localThr.updated_at = nowIso;
      localThr.last_message = localMsg;
    }
    saveDb(db);

    // 4. Socket notifications
    const io = req.app.get("io");
    if (io) {
      io.to(thread.id).emit("new_message", localMsg);
      io.to(threadId).emit("new_message", localMsg);
      emitThreadEvent(io, "thread_updated", { threadId: thread.id, last_message: localMsg });
    }

    return res.json(localMsg);
  });


  router.get("/admin/chat/all", async (req, res) => {
    const admin = await parseAuthUser(req);
    if (!admin || (admin.role !== "admin" && admin.role !== "sub_admin")) return res.status(403).json({ detail: "Admin only" });
    // Session 38: all chats from Supabase (newest first, up to 1000) with both names, instead of
    // the threads this one server instance happened to have in its local file.
    const client = privilegedSupabase || null;
    if (client) {
      try {
        const { data: threads, error } = await client.from('chat_threads').select('*').order('updated_at', { ascending: false }).limit(1000);
        if (error) throw error;
        const ids = Array.from(new Set((threads || []).flatMap((t: any) => [t.brand_id, t.creator_id]).filter(Boolean).map(String)));
        const people = new Map<string, any>();
        for (let i = 0; i < ids.length; i += 200) {
          const { data } = await client.from('users').select('user_id, name, email, role, picture').in('user_id', ids.slice(i, i + 200));
          for (const u of data || []) people.set(String(u.user_id), u);
        }
        return res.json((threads || []).map((t: any) => ({
          ...t,
          status: t.status || t.flow_state || null,
          creator: t.creator || people.get(String(t.creator_id)) || null,
          brand: t.brand || people.get(String(t.brand_id)) || null,
        })));
      } catch (e: any) {
        console.error("[admin/chat/all]", e?.message || e);
        return res.status(502).json({ error: "Could not load chats. Please try again." });
      }
    }
    const db = getDb();
    res.json(db.chat_threads || []);
  });


  router.get("/admin/chat/flagged", async (req, res) => {
    const admin = await parseAuthUser(req);
    if (!admin || (admin.role !== "admin" && admin.role !== "sub_admin")) return res.status(403).json({ detail: "Admin only" });
    const db = getDb();
    res.json(db.message_flags || []);
  });


  // Session 38: both lists come from chat_moderation_events (Supabase). "Guard violations" are
  // the blocked messages only; "chat violations" are all rows (blocked + profanity logged).
  router.get("/admin/chat_guard_violations", async (req, res) => {
    const admin = await parseAuthUser(req);
    if (!admin || (admin.role !== "admin" && admin.role !== "sub_admin")) return res.status(403).json({ detail: "Admin only" });
    try {
      const all = await moderation.list();
      res.json(all.filter((v: any) => v.violation_type === "hard_number"));
    } catch (e: any) {
      res.status(502).json({ error: "Could not load blocked messages." });
    }
  });


  router.get("/admin/chat_violations", async (req, res) => {
    const admin = await parseAuthUser(req);
    if (!admin || (admin.role !== "admin" && admin.role !== "sub_admin")) return res.status(403).json({ detail: "Admin only" });
    try {
      res.json(await moderation.list());
    } catch (e: any) {
      res.status(502).json({ error: "Could not load chat violations." });
    }
  });


  router.post("/admin/chat/flagged/:id/resolve", async (req, res) => {
    const admin = await parseAuthUser(req);
    if (!admin || (admin.role !== "admin" && admin.role !== "sub_admin")) return res.status(403).json({ detail: "Admin only" });
    const db = getDb();
    const flag = (db.message_flags || []).find((f: any) => f.id === req.params.id);
    if (flag) {
      flag.status = req.body.action;
      saveDb(db);
    }
    res.json({ success: true });
  });


  router.post("/admin/chat_violations/:id/resolve", async (req, res) => {
    const admin = await parseAuthUser(req);
    if (!admin || (admin.role !== "admin" && admin.role !== "sub_admin")) return res.status(403).json({ detail: "Admin only" });
    try {
      const action = String(req.body?.action || "");
      const found = await moderation.resolve(req.params.id, action, admin.user_id);
      if (!found) return res.status(404).json({ error: "This entry was not found. Refresh the list." });
      // Session 58 (Ravi: "hn"): Warn / Restrict / Lift used to change only the label. Now they act on the person:
      // a warning is recorded + notified, Restrict pauses their chat for CHAT_BLOCK_DAYS days, Lift ends it.
      const target = String(req.body?.user_id || "").trim();
      const note = String(req.body?.note || "").trim().slice(0, 300);
      if (target && ["issue_warning", "restrict_user", "unrestrict"].includes(action)) {
        const c = privilegedSupabase || supabase;
        const now = new Date().toISOString();
        const vType = action === "issue_warning" ? "Warning" : action === "restrict_user" ? "CHAT_RESTRICTED" : "CHAT_UNRESTRICTED";
        const row = { id: `viol_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, user_id: target, violation_type: vType, reason: `Chat: ${note || (action === "issue_warning" ? "warning" : action === "restrict_user" ? "chat paused" : "chat pause lifted")}`, created_at: now };
        if (c) {
          const { error: vErr } = await c.from("user_violations").insert(row);
          if (vErr) return res.status(502).json({ error: `Marked, but couldn't apply it to the user: ${vErr.message}` });
        }
        const db = getDb();
        if (!db.user_violations) db.user_violations = [];
        db.user_violations.push(row);
        saveDb(db);
        forgetChatBlock(target);
        const until = action === "restrict_user" ? chatBlockedUntil([row]) : null;
        const n = chatActionNotice(action, note, until);
        const nid = `notif_${Math.random().toString(36).slice(2, 11)}`;
        if (c) await c.from("notifications").insert({ notif_id: nid, id: nid, user_id: target, type: "WARNING", title: n.title, message: n.message, read: false, created_at: now }).then(() => null, () => null);
        return res.json({ success: true, applied: vType, until });
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(502).json({ error: `Couldn't save: ${e?.message || "database error"}` });
    }
  });


  router.post([
    // The frontend posts reviews on the split namespaces; only the legacy path existed.
    "/ugc/threads/:threadId/submit-review",
    "/campaign/threads/:threadId/submit-review",
    "/chat/v2/threads/:threadId/submit-review"
  ], async (req, res) => {
    const user = await parseAuthUser(req);
    if (!user) return res.status(403).json({ error: "Unauthorized" });
    const { threadId } = req.params;
    const { rating, communication_rating, timeliness_rating, quality_rating, comment } = req.body;

    // Ratings are 1–5 and the server says so; the UI was the only check.
    const inRange = (v: any) => v === undefined || v === null || (Number.isFinite(Number(v)) && Number(v) >= 1 && Number(v) <= 5);
    if (!Number.isFinite(Number(rating)) || Number(rating) < 1 || Number(rating) > 5 ||
        !inRange(communication_rating) || !inRange(timeliness_rating) || !inRange(quality_rating)) {
      return res.status(400).json({ error: "Ratings must be between 1 and 5." });
    }

    try {
      if (supabase) {
        // Find the thread
        const { data: thread } = await (privilegedSupabase || supabase).from('chat_threads').select('*').eq('id', threadId).maybeSingle();
        if (!thread) return res.status(404).json({ error: "Thread not found" });
        
        // Only the two parties review each other. Anyone could post a review before, with no
        // target; and the same person could review the same deal any number of times.
        const uid = user.user_id || user.id;
        let targetId = null;
        if (uid === thread.creator_id) targetId = thread.brand_id;
        else if (uid === thread.brand_id || (user.parent_brand_id && user.parent_brand_id === thread.brand_id)) targetId = thread.creator_id;
        if (!targetId) return res.status(403).json({ error: "Only the brand and creator on this deal can review it." });
        // Session 58: a review comes after the work is done (a brand could give 1 star mid-negotiation).
        const doneStates = ['COMPLETED', 'CONTENT_APPROVED', 'CLOSED'];
        if (!doneStates.includes(String(thread.flow_state || '').toUpperCase()) && !doneStates.includes(String(thread.status || '').toUpperCase())) {
          return res.status(409).json({ error: "You can review once the collaboration is complete." });
        }

        try {
          // Session 58: one review per SIDE of the deal (each brand team member could review the same deal again).
          const { data: existing } = await (privilegedSupabase || supabase)
            .from('reviews')
            .select('id')
            .eq('thread_id', threadId)
            .eq('target_id', targetId)
            .limit(1);
          if (Array.isArray(existing) && existing.length > 0) {
            return res.status(409).json({ error: "You have already reviewed this collaboration." });
          }
        } catch (e) { logIgnored("chat_routes:652", e); }

        const reviewData = {
          reviewer_id: user.user_id || user.id,
          target_id: targetId,
          thread_id: threadId,
          deal_id: thread?.deal_id,
          ugc_order_id: thread?.ugc_order_id,
          rating,
          communication_rating,
          timeliness_rating,
          quality_rating,
          comment,
          created_at: new Date().toISOString()
        };
        const { error: insErr } = await (privilegedSupabase || supabase).from('reviews').insert(reviewData).select();
        // A failed insert used to answer { success: true }.
        if (insErr) {
          console.error("[submit-review] insert failed:", insErr.message || insErr);
          return res.status(500).json({ error: "Failed to submit review" });
        }
      }

      res.json({ success: true });
    } catch (e) {
      console.error("[POST /chat/v2/threads/:threadId/submit-review] Error:", e);
      res.status(500).json({ error: "Failed to submit review" });
    }
  });
}

/** Session 58 (Q16): a safe chat-attachments path that belongs to this thread, or null. */
export function chatAttachmentPath(v: any, ...threadIds: any[]): string | null {
  const p = String(v ?? "").trim();
  const m = p.match(/^chat-attachments\/([A-Za-z0-9_-]+)-\d{10,}\.[A-Za-z0-9]{1,8}$/);
  if (!m) return null;
  return threadIds.filter(Boolean).map(String).includes(m[1]) ? p : null;
}
