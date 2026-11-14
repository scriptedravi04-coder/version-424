// v348 (Ravi's iPhone screenshot: a COMPLETED deal kept an unread "1" — sometimes 100 / 200 — in the
// Inbox, and brand home said "1 unread message in Partner Inbox", even after the chat was opened many
// times with no new message). The server count can stay high for messages it can never mark read
// (lifecycle cards saved without a `read` value, copies kept only in the server's local store). The
// phone now remembers when each chat was last opened: anything that came in before that is read.
// Only browser storage — no server call, no database change.
const KEY = "yb_thread_seen_v1";
const MAX_ENTRIES = 300;

function load() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch (e) {
    return {};
  }
}

function save(map) {
  try {
    const ids = Object.keys(map);
    if (ids.length > MAX_ENTRIES) {
      ids.sort((a, b) => (map[a]?.at || 0) - (map[b]?.at || 0));
      for (const id of ids.slice(0, ids.length - MAX_ENTRIES)) delete map[id];
    }
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch (e) { /* private mode / storage full: the server count is used as before */ }
}

const threadIdOf = (t) => String(t?.id || t?.thread_id || "");

/** Time (ms) of the newest message the list knows about, 0 if unknown. */
export function lastMessageTime(thread) {
  const lm = thread?.last_message;
  const v = lm?.created_at || lm?.timestamp || thread?.last_message_at || null;
  const ms = v ? new Date(v).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

/** Call when a chat is opened and again when it is closed. */
export function markThreadSeen(thread, now = Date.now()) {
  const id = threadIdOf(thread);
  if (!id) return;
  const map = load();
  const prev = map[id] || {};
  const total = Number(thread?.total_messages_count);
  map[id] = {
    at: Math.max(now, lastMessageTime(thread), prev.at || 0),
    total: Number.isFinite(total) && total > 0 ? Math.max(total, prev.total || 0) : (prev.total || 0),
  };
  save(map);
}

/**
 * Unread count to SHOW for a thread: the server's `unread_count`, but 0 when nothing arrived after
 * the chat was last opened, and never more than the messages that arrived since then.
 */
export function effectiveUnread(thread, seenMap = null) {
  const server = Number(thread?.unread_count) || 0;
  if (server <= 0) return 0;
  const seen = (seenMap || load())[threadIdOf(thread)];
  if (!seen || !seen.at) return server;
  const lastMs = lastMessageTime(thread);
  if (lastMs && lastMs <= seen.at) return 0;
  const total = Number(thread?.total_messages_count);
  if (seen.total > 0 && Number.isFinite(total) && total > seen.total) return Math.min(server, total - seen.total);
  return server;
}

/** How many threads have something unread (home "Needs your action" line). */
export function countUnreadThreads(threads) {
  if (!Array.isArray(threads)) return 0;
  const map = load();
  return threads.filter((t) => effectiveUnread(t, map) > 0).length;
}

export const __test = { KEY, load };
