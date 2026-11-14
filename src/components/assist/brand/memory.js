// Session 52 (Ravi): what Ybex Assist remembers, kept on the server (scripts/sql/session52_assist.sql):
//   • chat history  → the brand's chat comes back on any phone (last 40 messages, 90 days)
//   • saved searches → "naye creators aaye to batana": the server checks every 30 min and sends a bell +
//                      phone push; the chat also shows the new ones when it opens.
// Only these Assist routes are called here — nothing pays, publishes or invites. Every call fails soft:
// server / database down → the Session 51 behaviour (this phone only) keeps working.
import { api } from "../../../lib/api";

let serverOff = 0; // NO_DB / errors → don't keep asking for a while
// v419 (QA): one 5xx switched history + saved searches off for 5 min (reads too). Only "no database here" does that now.
const off = (e) => { if (e?.response?.data?.code === "NO_DB" || e?.response?.status === 501) serverOff = Date.now() + 5 * 60 * 1000; return null; };
const usable = () => Date.now() >= serverOff;

/** Session 53: Eva keeps several chats. → { chat_id, messages: [{ user, text, card_type, at }] } or null.
 *  No chatId → the latest chat. */
export async function loadHistory(chatId = null) {
  if (!usable()) return null;
  try {
    const { data } = await api.get(`assist/history${chatId ? `?chat=${encodeURIComponent(chatId)}` : ""}`, { timeout: 15000, bypassCache: true });
    return data?.ok && Array.isArray(data.messages) ? { chat_id: data.chat_id || null, messages: data.messages } : null;
  } catch (e) { return off(e); }
}

/** → [{ chat_id, title, last_at, count }] or null. */
export async function listChats() {
  if (!usable()) return null;
  try {
    const { data } = await api.get("assist/chats", { timeout: 15000, bypassCache: true });
    return data?.ok && Array.isArray(data.chats) ? data.chats : null;
  } catch (e) { return off(e); }
}

/** A new chat id (the phone makes it; the server only checks its shape). */
export const newChatId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Save a user message + the bot's answer (text and the card's type only). Fire and forget. */
export function saveTurn(chatId, userText, botText, card) {
  if (!usable()) return;
  const messages = [
    { user: true, text: String(userText || "").slice(0, 2000) },
    { user: false, text: String(botText || "").slice(0, 2000), card: card?.type ? { type: card.type } : null },
  ].filter((m) => m.text);
  if (!messages.length) return;
  api.post("assist/history", { messages, chat_id: chatId || null }, { timeout: 15000 }).catch(off);
}

/** Delete one chat (or every chat when no id). */
export async function clearHistory(chatId = null) {
  try { const { data } = await api.delete(`assist/history${chatId ? `?chat=${encodeURIComponent(chatId)}` : ""}`, { timeout: 15000 }); return Boolean(data?.ok); } catch (e) { off(e); return false; }
}

/** → [{ id, label, filters, fresh_ids, seen_ids }] or null (server not available → use the phone copy). */
export async function listSavedServer() {
  if (!usable()) return null;
  try {
    const { data } = await api.get("assist/saved-searches", { timeout: 15000, bypassCache: true });
    return data?.ok && Array.isArray(data.searches) ? data.searches : null;
  } catch (e) { return off(e); }
}

export async function saveSearchServer(filters, label, seenIds = []) {
  if (!usable()) return false;
  try {
    const { data } = await api.post("assist/saved-searches", { filters, label, seen_ids: seenIds.slice(0, 3000) }, { timeout: 15000 });
    return Boolean(data?.ok);
  } catch (e) { off(e); return false; }
}

export function markSeenServer(id, ids) {
  if (!usable() || !id) return;
  api.post(`assist/saved-searches/${encodeURIComponent(id)}/seen`, { ids: (ids || []).slice(0, 500) }, { timeout: 15000 }).catch(off);
}

export async function deleteSavedServer(id) {
  try { const { data } = await api.delete(`assist/saved-searches/${encodeURIComponent(id)}`, { timeout: 15000 }); return Boolean(data?.ok); } catch (e) { off(e); return false; }
}
