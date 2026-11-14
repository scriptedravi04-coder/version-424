// v346: hide phone numbers and emails in text a creator wrote (campaign pitch / "Creator's note") before a
// brand sees it. Display-time only — the saved text is not changed. Works without regex lookbehind so old
// iPhone Safari can still parse this file.

export const CONTACT_HIDDEN = "[contact hidden]";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
// "ravi at gmail dot com", "ravi[at]gmail[dot]com"
const SPELLED_EMAIL_RE = /\b[A-Z0-9._%+-]+\s*(?:@|\[at\]|\(at\)|\s+at\s+)\s*[A-Z0-9-]+\s*(?:\.|\[dot\]|\(dot\)|\s+dot\s+)\s*(?:com|in|co\.in|co|net|org|io|me)\b/gi;

const WORD_DIGITS = { zero: 1, oh: 1, one: 1, two: 1, three: 1, four: 1, five: 1, six: 1, seven: 1, eight: 1, nine: 1 };
const TOKEN = "(?:\\d+|zero|one|two|three|four|five|six|seven|eight|nine)";
// A run of digits and/or number words ("98765 43210", "+91-98765-43210", "nine 8 7 six 5 4 3 2 1 0").
const RUN_RE = new RegExp(`\\+?\\b${TOKEN}\\b(?:[\\s.()\\-]*\\b${TOKEN}\\b)+|\\+?\\d{10,}`, "gi");

const digitCount = (run) => {
  let n = 0;
  const parts = String(run).toLowerCase().match(/\d+|[a-z]+/g) || [];
  for (const p of parts) {
    if (/^\d+$/.test(p)) n += p.length;
    else if (WORD_DIGITS[p]) n += 1;
  }
  return n;
};

/** Text with emails and 10+ digit phone numbers (incl. +91, spaces, dashes, number words) replaced by "[contact hidden]". */
export function maskContact(text) {
  if (text === null || text === undefined) return text;
  let out = String(text);
  if (!out) return out;
  out = out.replace(EMAIL_RE, CONTACT_HIDDEN).replace(SPELLED_EMAIL_RE, CONTACT_HIDDEN);
  out = out.replace(RUN_RE, (run) => {
    const n = digitCount(run);
    // An Indian mobile is 10 digits (12 with 91). A run with fewer digits is a price, a count or a date.
    if (n < 10) return run;
    // "₹15000 - 25000" is a price range, not a number (phones are written "98765-43210" or "98765 43210").
    if (!/[a-z]/i.test(run) && /\s[-–]\s/.test(run)) return run;
    return CONTACT_HIDDEN;
  });
  return out;
}

export const hasContact = (text) => typeof text === "string" && maskContact(text) !== text;

export default maskContact;
