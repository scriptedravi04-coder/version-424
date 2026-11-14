// Session 58: calendar dates in India time. toISOString() gives the UTC date — between midnight and 5:30 am IST
// that is still "yesterday", so "today" / "tomorrow" defaults and date-picker minimums were a day off.
export function istDateString(offsetDays = 0, now = Date.now()) {
  return new Date(now + offsetDays * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
