// Session 23 — shared chat helpers.

/**
 * Oldest first. Rows without a usable time (e.g. an optimistic message) go last.
 * Stable: equal times keep their arrival order.
 */
export function sortChronologically(list) {
  const t = (m) => {
    const v = new Date(m?.created_at || m?.timestamp || 0).getTime();
    return Number.isFinite(v) && v > 0 ? v : Number.POSITIVE_INFINITY;
  };
  return (list || [])
    .map((m, i) => ({ m, i, k: t(m) }))
    .sort((a, b) => (a.k === b.k ? a.i - b.i : a.k < b.k ? -1 : 1))
    .map((x) => x.m);
}

/**
 * One refresh for a burst of socket events. A single action can send new_message +
 * thread_updated + agreement_signed (some twice); each used to start its own
 * messages + thread download, and the answers arrived out of order — buttons flickered.
 * Now: the first event schedules a refresh `delayMs` later; anything that arrives while one
 * is running queues exactly one more.
 */
export function createCoalescedRunner(run, delayMs = 80) {
  let timer = null;
  let running = false;
  let again = false;
  let stopped = false;

  const fire = async () => {
    timer = null;
    if (stopped) return;
    if (running) { again = true; return; }
    running = true;
    try { await run(); } catch { /* next event or poll retries */ }
    running = false;
    if (again && !stopped) { again = false; schedule(); }
  };
  const schedule = () => {
    if (stopped || timer) return;
    timer = setTimeout(fire, delayMs);
  };
  schedule.cancel = () => { stopped = true; if (timer) clearTimeout(timer); timer = null; };
  return schedule;
}

/** Last activity of a thread: a local bump, its newest message, else its update/creation time. */
export function threadActivityTime(t) {
  const cands = [t?._activity_at, t?.last_message?.created_at, t?.last_message_at, t?.updated_at, t?.created_at];
  let best = 0;
  for (const c of cands) {
    const v = new Date(c || 0).getTime();
    if (Number.isFinite(v) && v > best) best = v;
  }
  return best;
}

/** Inbox order: newest activity first (stable for equal times). */
export function sortThreadsByActivity(list) {
  return (list || [])
    .map((t, i) => ({ t, i, k: threadActivityTime(t) }))
    .sort((a, b) => (a.k === b.k ? a.i - b.i : b.k - a.k))
    .map((x) => x.t);
}

/** Tell the inbox list that a thread just had a message (open chat → list moves it to the top). */
export function announceChatActivity(threadId, at) {
  if (typeof window === "undefined" || !threadId) return;
  try {
    window.dispatchEvent(new CustomEvent("chat_activity", { detail: { threadId, at: at || new Date().toISOString() } }));
  } catch { /* old browsers: the next list refresh sorts it anyway */ }
}

// ---- v414: optimistic sends -------------------------------------------------------------------
// Sent messages used to be matched to their temp bubble by TEXT, so two "ok"s (or someone else's "ok") swapped or
// hid each other, and every poll threw away pending / failed bubbles. Each send now carries a client_msg_id.

/** v414: a fresh id for one send ("c_" + time + random). */
export function makeClientMsgId() {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** v414: the client_msg_id a row carries — top level or inside metadata (string or object). */
export function clientMsgIdOf(m) {
  if (!m) return null;
  if (m.client_msg_id) return String(m.client_msg_id);
  let meta = m.metadata;
  if (typeof meta === "string") { try { meta = JSON.parse(meta); } catch { meta = null; } }
  return meta && meta.client_msg_id ? String(meta.client_msg_id) : null;
}

/** v414: an optimistic (not yet confirmed) row. */
export const isTempMessage = (m) => Boolean(m) && String(m.id || "").startsWith("temp_");

const senderOf = (m) => String(m?.sender_user_id || m?.sender_id || "");
const textOf = (m) => String(m?.content || m?.text || "").trim();
const timeOf = (m) => new Date(m?.created_at || 0).getTime();

/**
 * v414: index in `list` of the temp bubble that `serverMsg` confirms, or -1.
 * By client_msg_id when the server echoes it. If it does not echo one: same sender, same text, created within
 * 30 s of the temp, temp still "sending" (a failed one stays failed). Never another person's message.
 */
export function findTempFor(list, serverMsg) {
  if (!Array.isArray(list) || !serverMsg) return -1;
  const cid = clientMsgIdOf(serverMsg);
  if (cid) return list.findIndex((m) => isTempMessage(m) && m.client_msg_id === cid);
  const sid = senderOf(serverMsg);
  if (!sid) return -1;
  const txt = textOf(serverMsg);
  const st = timeOf(serverMsg);
  if (!Number.isFinite(st) || st <= 0) return -1;
  return list.findIndex((m) =>
    isTempMessage(m) && m.status === "sending" && senderOf(m) === sid && textOf(m) === txt &&
    Math.abs(st - timeOf(m)) <= 30000
  );
}

/**
 * v414: a poll / socket sync result merged with what is on screen: the server list (by id), plus local temp /
 * failed bubbles the server list does not confirm yet. A server row already on screen is never used again to
 * confirm a temp (so an older identical "ok" does not swallow a new pending "ok").
 */
export function mergeServerMessages(prev, serverList) {
  const server = Array.isArray(serverList) ? serverList.slice() : [];
  const before = Array.isArray(prev) ? prev : [];
  const known = new Set(before.filter((m) => m && !isTempMessage(m)).map((m) => String(m.id || m.message_id)));
  const used = new Set();
  const keep = [];
  for (const t of before.filter(isTempMessage)) {
    const idx = server.findIndex((s, i) => {
      if (used.has(i)) return false;
      const cid = clientMsgIdOf(s);
      if (cid) return cid === t.client_msg_id;
      if (known.has(String(s.id || s.message_id))) return false;
      return findTempFor([t], s) === 0;
    });
    if (idx === -1) keep.push(t);
    else used.add(idx);
  }
  return [...server, ...keep];
}

/** v414: the server's own words for a refused message (block / restricted / closed), else null (network etc.). */
export function sendRefusalReason(err) {
  const res = err?.response;
  if (!res) return null;
  const d = res.data || {};
  const status = Number(res.status || 0);
  const refused = Boolean(d.blocked) || ["CHAT_RESTRICTED", "CHAT_CLOSED", "NOT_A_PARTICIPANT"].includes(d.code) ||
    [400, 403, 404, 409, 410, 423, 429].includes(status);
  if (!refused) return null;
  const msg = d.detail || d.error;
  return typeof msg === "string" && msg.trim() ? msg.trim() : null;
}
