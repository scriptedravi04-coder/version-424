// v332: one calm, plain-English message for a failed chat / deal action.
// The server's own sentence is kept when it is a short, readable one ("Minimum offer is ₹3,000",
// "The code has expired"). Technical text — "Network Error", "Request failed with status code 500",
// "timeout of 45000ms exceeded", database errors — is replaced by the fallback the screen passes in.
const TECH = /request failed|status code|network error|timeout|timed out|internal server|exception|stack|supabase|postgres|pgrst|sql|syntax|undefined|null|cannot read|econn|fetch failed|<html/i;

// v415: M4 a server reply like "x" or "bad_request" was shown as the toast. Only a real sentence passes:
// at least 2 words / 8 letters, no code-like snake_case, not technical text.
export function isReadableServerText(text) {
  const t = typeof text === "string" ? text.trim() : "";
  if (!t || t.length < 8 || t.length > 160) return false;
  if (TECH.test(t)) return false;
  if (!/\s/.test(t)) return false; // one word ("x", "Forbidden", "bad_request")
  if (/^[A-Z0-9_]+$/.test(t.replace(/\s/g, ""))) return false; // ENUM_CODE
  return /[a-z]{2,}/i.test(t);
}
export function calmText(text, fallback = null) {
  return isReadableServerText(text) ? String(text).trim() : fallback;
}

export function calmError(err, fallback = "Something went wrong. Please try again.") {
  const d = err?.response?.data;
  if (Number(err?.response?.status || 0) >= 500) return fallback; // v415: our own server error — never its raw text
  const server = [d?.error, d?.detail, d?.message].find((v) => typeof v === "string" && v.trim()) || "";
  if (server && isReadableServerText(server)) return server.trim(); // v415: was any short text (showed "x")
  return fallback;
}

export default calmError;
