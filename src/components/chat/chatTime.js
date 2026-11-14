// v332: message time in IST ("04:35 pm"); an unreadable or missing date gives "" instead of
// "Invalid Date" on the card.
export function istTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).replace(/\b(am|pm)\b/g, (s) => s.toUpperCase());
}

// v332: date + time in IST for admin lists ("16 Oct 2026, 04:35 pm"); "" when unreadable.
export function istDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).replace(/\b(am|pm)\b/g, (s) => s.toUpperCase());
}

// v417: date separators in the message list — "Today", "Yesterday" or "7 Nov 2026" (IST calendar day).
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IST_MS = 330 * 60 * 1000;
// v417: "2026-11-07" for the IST day of a time; "" when unreadable.
export function istDayKey(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
}
export function chatDayLabel(value, now = new Date()) {
  const key = istDayKey(value);
  if (!key) return "";
  const today = istDayKey(now);
  if (key === today) return "Today";
  const y = new Date(new Date(`${today}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
  if (key === y) return "Yesterday";
  const [yy, mm, dd] = key.split("-").map(Number);
  return `${dd} ${MONTHS[mm - 1]} ${yy}`;
}
// v417: label to show ABOVE this message, or "" when it is on the same day as the one before it.
export function dateSeparatorFor(message, prevMessage, now = new Date()) {
  const key = istDayKey(message?.created_at);
  if (!key) return "";
  if (prevMessage && istDayKey(prevMessage.created_at) === key) return "";
  return chatDayLabel(message.created_at, now);
}

export default istTime;
