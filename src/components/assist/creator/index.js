// Session 54: everything the creator side of Eva needs, loaded only when a CREATOR opens the bot
// (FeedbackBot imports this file lazily). Same shape as ../brand/index.js so the chat works the same way.
export { handleCreatorMessage as handleAssistMessage, initialCreatorState as initialAssistState, onOpen } from "./brain";
export { default as AssistCard } from "./CreatorCards";
export { takeMessage, DAILY_LIMIT } from "./tools";
export { loadHistory, saveTurn, listChats, newChatId, clearHistory, markSeenServer } from "../brand/memory";
export const InviteSheet = null; // creators don't invite anyone
export const ROLE = "creator";
