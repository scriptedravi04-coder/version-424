// Session 51: everything the brand side of Ybex Assist needs, loaded only when a BRAND uses the bot
// (FeedbackBot imports this file lazily, so creators and the home page don't download it).
export { handleBrandMessage, onOpen, initialBrandState } from "./brain";
export { default as AssistCard } from "./AssistCards";
export { InviteSheet } from "../../explore/mobile/ExploreMobile";
export { takeMessage, DAILY_LIMIT, currentDraft } from "./tools"; // v345: currentDraft → "Show it again" re-opens the saved brief card
export { loadHistory, saveTurn, listChats, newChatId, clearHistory, markSeenServer } from "./memory"; // Session 52/53: Eva's chats on the server
// Session 54: the same names the creator module uses, so FeedbackBot treats both alike.
export { handleBrandMessage as handleAssistMessage, initialBrandState as initialAssistState } from "./brain";
export const ROLE = "brand";
