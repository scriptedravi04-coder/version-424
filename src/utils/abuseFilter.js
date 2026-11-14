// Frontend access to the abuse filter.
//
// A re-export, not a copy — the client and server must never be able to disagree about what
// counts as abusive. This exists purely so the user gets feedback without a round-trip; the
// enforcement point is backend/chat_routes.ts.
export * from "../../backend/abuseFilter";
export { default } from "../../backend/abuseFilter";
