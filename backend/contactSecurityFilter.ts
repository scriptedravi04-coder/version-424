// Anti-disintermediation filter: stops people moving a deal off the platform by swapping
// phone numbers, emails or social handles in chat.
//
// DESIGN NOTE — why bare keywords do not block on their own.
//
// The obvious implementation is a word blacklist: ban "phone", "contact", "mobile". That
// was tried and it is unusable, because those words carry ordinary meanings in exactly the
// conversations this platform exists to host:
//
//     "Is this for iPhone or Android?"
//     "Who should I contact about shipping?"
//     "My phone broke so I was offline"
//     "Shoot it in mobile portrait, not landscape"
//
// Blocking those trains users to distrust the chat, and they route around it — which is the
// opposite of what the filter is for. So a contact-word only counts as evidence when it
// appears NEAR something that could actually be a contact detail: digits, an @handle, a
// messaging domain. "contact me on 98765 43210" is blocked; "who should I contact" is not.
//
// Set STRICT_KEYWORD_MODE to true to go back to blocking bare keywords.

export const STRICT_KEYWORD_MODE = false;

export type FilterResult = {
  blocked: boolean;
  reason?: string;
  code?: string;
  message?: string;
};

export type FilterOptions = {
  threadId?: string;
  senderId?: string;
  /** Revision feedback, brief text and support tickets are never filtered. */
  exempt?: boolean;
  /** Test hook: overrides Date.now() for the chunking window. */
  now?: number;
};

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

const LEET_MAP: Record<string, string> = {
  o: "0", q: "0", i: "1", l: "1", z: "2", e: "3", a: "4", s: "5", b: "8", g: "9", t: "7"
};

/** Turns 9I23O4578 into 912304578 so leetspeak digits are countable. */
export function decodeLeet(text: string): string {
  return text.replace(/[oqilzeasbgt]/gi, (ch) => LEET_MAP[ch.toLowerCase()] ?? ch);
}

const WORD_DIGITS: Record<string, string> = {
  // English
  zero: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  oh: "0", nought: "0",
  // Hindi / Hinglish
  shunya: "0", sunya: "0", zerro: "0",
  ek: "1", do: "2", teen: "3", tin: "3", char: "4", chaar: "4",
  panch: "5", paanch: "5", chah: "6", chhah: "6", chhe: "6", che: "6",
  saat: "7", sat: "7", aath: "8", ath: "8", nau: "9", no: "9"
};

/** "nine eight seven..." / "nau aath saat..." -> "987..." */
/** double/triple repeat the NEXT digit: "triple zero" is 000, not 0. */
const MULTIPLIERS: Record<string, number> = {
  double: 2, doubl: 2, dubble: 2, triple: 3, tripple: 3, tripel: 3
};

/**
 * Collapses runs of a repeated letter: "threee" -> "three", "naau" -> "nau".
 *
 * People misspell these deliberately precisely because it defeats a dictionary lookup, and
 * a single unmatched token used to end the whole digit run before it reached ten digits.
 */
function normaliseWord(tok: string): string {
  const collapsed = tok.replace(/(.)\1{1,}/g, "$1");
  if (WORD_DIGITS[tok] !== undefined) return tok;
  if (WORD_DIGITS[collapsed] !== undefined) return collapsed;
  // try the doubled-vowel forms people actually type: thre/three, nin/nine
  for (const key of Object.keys(WORD_DIGITS)) {
    if (key.replace(/(.)\1{1,}/g, "$1") === collapsed) return key;
  }
  return tok;
}

export function wordsToDigits(text: string): string {
  const tokens = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  let out = "";
  let run = "";
  let pendingRepeat = 0;

  for (const raw of tokens) {
    const mult = MULTIPLIERS[raw] ?? MULTIPLIERS[raw.replace(/(.)\1{1,}/g, "$1")];
    if (mult) {
      pendingRepeat = mult;
      continue;
    }
    const tok = normaliseWord(raw);
    const d = WORD_DIGITS[tok];
    if (d !== undefined) {
      run += pendingRepeat > 1 ? d.repeat(pendingRepeat) : d;
      pendingRepeat = 0;
    } else {
      pendingRepeat = 0;
      if (run.length > out.length) out = run;
      run = "";
    }
  }
  if (run.length > out.length) out = run;
  return out;
}

// v346: number words MIXED with real digits ("nine eight seven six five 43210", "9876five43210")
// slipped through: digitRuns() stops at letters and wordsToDigits() ignores real digits. This
// walks one run that may hold both, joined only by separators (space - . ( ) , + /). Any other
// word ends the run, so "5 videos", prices and dates are untouched. A run only counts when it
// really mixes the two AND either a word is glued to digits ("9876five") or it carries a clear
// number word — a lone everyday Hinglish word ("do", "no", "ek", "sat"...) between two prices is
// not enough on its own.
const AMBIGUOUS_NUMBER_WORDS = new Set(["do", "no", "oh", "ek", "sat", "tin", "che", "char", "ath", "chah"]);

export function mixedNumberRuns(text: string): string[] {
  const tokens = String(text || "").toLowerCase().match(/[a-z]+|\d+|[^a-z\d]+/g) || [];
  const runs: string[] = [];
  let run = "";
  let realDigits = 0;
  let words = 0;
  let clearWords = 0;
  let glued = false;
  let prev: "digit" | "word" | "sep" | null = null;
  let pendingRepeat = 0;
  const flush = () => {
    if (realDigits > 0 && words > 0 && (glued || clearWords > 0 || words >= 2)) runs.push(run);
    run = ""; realDigits = 0; words = 0; clearWords = 0; glued = false; prev = null; pendingRepeat = 0;
  };
  for (const tok of tokens) {
    if (/^\d+$/.test(tok)) {
      if (prev === "word") glued = true;
      run += pendingRepeat > 1 ? tok[0].repeat(pendingRepeat - 1) + tok : tok;
      pendingRepeat = 0;
      realDigits += tok.length;
      prev = "digit";
      continue;
    }
    if (/^[a-z]+$/.test(tok)) {
      const mult = MULTIPLIERS[tok] ?? MULTIPLIERS[tok.replace(/(.)\1{1,}/g, "$1")];
      if (mult) { pendingRepeat = mult; prev = "sep"; continue; }
      const w = normaliseWord(tok);
      const d = WORD_DIGITS[w];
      if (d === undefined) { flush(); continue; }
      if (prev === "digit") glued = true;
      run += pendingRepeat > 1 ? d.repeat(pendingRepeat) : d;
      pendingRepeat = 0;
      words++;
      if (!AMBIGUOUS_NUMBER_WORDS.has(w)) clearWords++;
      prev = "word";
      continue;
    }
    if (/^[\s\-.()+,\/]+$/.test(tok)) { prev = "sep"; continue; }
    flush();
  }
  flush();
  return runs;
}

/** Every real digit in the message, separators removed. No leet decoding — see below. */
export function extractDigits(text: string): string {
  return text.replace(/\D/g, "");
}

/**
 * Leet decoding is applied PER TOKEN, and only to tokens that already look like a
 * disguised number.
 *
 * Running decodeLeet over a whole sentence is catastrophic: every o/i/l/s/b/e in ordinary
 * prose becomes a digit, so "we need better mobility in the shot" turns into a long digit
 * run and gets blocked as a phone number. It has to be scoped to tokens that are already
 * mostly digits and long enough to be a number in the first place.
 */
export function leetDigitCandidates(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const token = raw.replace(/[-().+]/g, "");
    if (token.length < 8 || token.length > 16) continue;
    const realDigits = (token.match(/\d/g) || []).length;
    const leetish = (token.match(/[oqilzeasbgt]/gi) || []).length;
    // must be predominantly digits already, with only a few letters standing in
    if (realDigits < 4) continue;
    if (realDigits + leetish < token.length) continue;
    out.push(decodeLeet(token).replace(/\D/g, ""));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Allow-list — these are the links creators legitimately send
// ---------------------------------------------------------------------------

// v414: host + path rules. A token is only skipped when it IS one of these links (host matched
// exactly, or a subdomain of it) — "ravi@gmail.com/ybex.in" or "wa.me/91…?drive.google.com/" used
// to be wiped out whole because the allowed text appeared anywhere inside the token.
const ALLOWED_URL_HOSTS: { host: string; path?: RegExp }[] = [
  { host: "instagram.com", path: /^\/(p|reel|reels|tv|stories)\//i }, // v414: story links allowed too
  { host: "youtube.com", path: /^\/(watch|shorts)/i },
  { host: "youtu.be", path: /^\/./ },
  { host: "drive.google.com", path: /^\// },
  { host: "docs.google.com", path: /^\// },
  { host: "vimeo.com", path: /^\/\d/ },
  { host: "dropbox.com", path: /^\// },
  { host: "ybex.in" }, { host: "ybex.io" }, { host: "ybex.club" }, { host: "ybex.app" }, { host: "ybexmedia.in" },
];

/** v414: true when the token is a real allowed link (https?://, www. or the bare host at the start). */
export function isAllowedLinkToken(token: string): boolean {
  const tok = String(token || "").replace(/[)\],.;!]+$/, "");
  const m = tok.match(/^(?:https?:\/\/)?([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?([\/?#][^\s]*)?$/i);
  if (!m) return false;
  const host = m[1].toLowerCase().replace(/^www\./, "");
  const rest = m[2] || "";
  const rule = ALLOWED_URL_HOSTS.find((r) => host === r.host || host.endsWith(`.${r.host}`));
  if (!rule) return false;
  if (rule.path && !rule.path.test(rest)) return false;
  // A phone number hidden in the path or query still counts.
  if (anyRunIsMobile(rest)) return false;
  return true;
}

function stripAllowedUrls(text: string): string {
  return text.split(/(\s+)/).map((t) => (/\S/.test(t) && isAllowedLinkToken(t) ? " " : t)).join("");
}

/**
 * v414: the desktop chat sends "📎 Attached file: <filename>". Camera filenames are full of
 * digits (Screenshot_20261107-183045.png) and were blocked as phone numbers. The filename token
 * is dropped before checking — unless the name itself is just a phone number.
 */
export function stripAttachmentLabel(text: string): string {
  // v414: filenames can hold spaces ("WhatsApp Image 2026-11-07 at 18.30.45.jpeg") — strip up to the
  // extension (one with a letter in it, so "18.30" is not taken as one). Kept when the name holds a mobile.
  return String(text || "").replace(/📎\s*Attached file:\s*([^\n]*?\.(?=[a-z0-9]*[a-z])[a-z0-9]{1,8})(?=\s|$)/giu, (all, name) => {
    const base = String(name).replace(/\.[a-z0-9]{1,8}$/i, "");
    if (anyRunIsMobile(base)) return all;
    return " ";
  });
}

// ---------------------------------------------------------------------------
// Hard signals — these block on their own, no keyword needed
// ---------------------------------------------------------------------------

const EMAIL_RE = /[a-z0-9._%+-]+\s*(?:@|\[at\]|\(at\)|\s+at\s+)\s*[a-z0-9.-]+\s*(?:\.|\[dot\]|\(dot\)|\s+dot\s+)\s*[a-z]{2,}/i;

const MESSAGING_DOMAIN_RE = /\b(?:wa\.me|whatsapp\.com|t\.me|telegram\.me|telegram\.org|signal\.me|m\.me|snapchat\.com\/add)\b/i;

/** ig: handle, insta id @foo, tg: @foo, snap: foo */
// v414: needs ":" / "=" / "id|handle|username" — or a dash NOT followed by a content word, so
// "1 IG - Reel, 2 stories" and "FB - post" (deliverable lists) are not handles.
// v414: content words after the separator ("Instagram: carousel post", "Insta: 60s reel") are deliverables too.
const HANDLE_CONTENT_WORDS = "reels?|posts?|story|stories|carousels?|feeds?|statics?|highlights?|grid|videos?|live|lives|collab\\w*|boost\\w*|ads?|shorts?|photos?|images?|content|deliverables?|igtv";
const HANDLE_RE = new RegExp(
  "\\b(?:ig|insta|instagram|fb|facebook|tg|telegram|snap|snapchat|wa|whatsapp|discord)\\s*(?:(?:id|handle|username)\\s*[:=\\-]?|user\\s*[:=\\-]|[:=\\-])\\s*@?" +
  `(?!(?:${HANDLE_CONTENT_WORDS}|is|hai|has|was|and|the|for|par|pe|me|mein|account|page|bio|profile)\\b)` +
  "(?!\\d+\\s*(?:s|sec|secs|seconds?|m|min|mins|minutes?)\\b)" + // v414: a duration (15s / 60s / 1min)
  `(?!\\d+\\s*x?\\s*(?:${HANDLE_CONTENT_WORDS})\\b)` + // v414: "2 stories", "3x reels"
  "[a-z0-9._]{3,}",
  "i"
);

// v414: UPI ids. Any PSP suffix after "@"; with " at " only the suffixes that are never ordinary
// words (okaxis, ybl, …) — "meet at sbi" stays fine. A bare PSP token next to a payment app word
// ("gpay pe ravi okicici") counts too.
const UPI_PSP = "ybl|ibl|axl|okaxis|okhdfcbank|okicici|oksbi|paytm|upi|apl|yapl|ptyes|ptsbi|ptaxis|pthdfc|axisbank|axisb|icici|sbi|hdfcbank|hdfc|kotak|kotak811|waicici|wahdfcbank|waaxis|wasbi|freecharge|airtel|jio|indus|federal|yesbank|yesbankltd|idfcbank|idfcfirst|barodampay|unionbank|pnb|boi|cnrb|aubank|rbl|dbs|hsbc|citi|abfspay|ikwik|fbl|naviaxis|superyes|tapicici|pingpay|mahb|kbl|sib|uco|cbin|ibkl|idbi|okbizaxis";
const UPI_STRONG = "okaxis|okhdfcbank|okicici|oksbi|okbizaxis|ybl|ibl|axl|apl|yapl|ptyes|ptsbi|ptaxis|pthdfc|waicici|wahdfcbank|waaxis|wasbi|abfspay|ikwik|naviaxis|superyes|tapicici";
// v414: the handle must sit right before "@" (no space) — "tag @paytm" / "collab with @airtel" are brand mentions.
const UPI_AT_RE = new RegExp(`[a-z0-9._-]{2,}(?:@|\\s*\\[at\\]|\\s*\\(at\\))\\s*(?:${UPI_PSP})(?![a-z0-9.])`, "i");
const UPI_SPOKEN_RE = new RegExp(`[a-z0-9._-]{2,}\\s+at\\s+(?:${UPI_STRONG})(?![a-z0-9.])`, "i");
const UPI_BARE_STRONG_RE = new RegExp(`(?:^|[^a-z0-9])(?:${UPI_STRONG})(?![a-z0-9])`, "i");
const PAY_APP_RE = /\b(?:g\s?pay|google\s?pay|phone\s?pe|paytm|bhim|upi|amazon\s?pay|mobikwik|cred\s?pay)\b/i;
const UPI_LABEL_RE = /\b(?:upi|vpa)\s*(?:id|address|handle)?\s*[:=]\s*\S{3,}/i;

export function hasUpiId(lower: string): boolean {
  if (UPI_AT_RE.test(lower) || UPI_SPOKEN_RE.test(lower) || UPI_LABEL_RE.test(lower)) return true;
  if (PAY_APP_RE.test(lower) && UPI_BARE_STRONG_RE.test(lower)) return true;
  return false;
}

// v414: asking to be paid outside Ybex. Only a clear outside intent blocks: outside / direct / bahar / seedha /
// personally, cash being paid, a payee detail next to the channel, or an order like "pay me on gpay",
// "gpay kar do", "paytm karo", "phonepe pe bhejo". Questions about payment timing ("Bank transfer kab hoga?",
// "NEFT se payment kab aayega") are fine — the channel word ("bank transfer") is not also the action.
const PAY_CHANNEL_WORDS = "g\\s?pay|google\\s?pay|phone\\s?pe|paytm|bhim|upi|amazon\\s?pay|cash|bank\\s*transfer|bank|neft|imps|rtgs|(?:my\\s+)?(?:bank\\s+)?account(?:\\s*(?:no|number))?|a\\/c|ifsc";
const PAY_CHANNEL_RE = new RegExp(`\\b(?:${PAY_CHANNEL_WORDS})(?![a-z])`, "i");
const PAY_ACTION_RE = /\b(?:pay|paid|payment|bhejo|bhej|bhejna|bhejdo|karo|kar\s?do|kardo|send|transfer|de\s?do|dedo)\b/i;
const PAY_OUTSIDE_STRONG_RE = /\b(?:outside|bahar|directly|direct|seedha|sidha|alag\s?se|personally|off\s?(?:the\s)?(?:app|platform))\b/i;
const PAY_INSIDE_RE = /\b(?:ybex|escrow|razorpay|checkout|in\s?app|on\s?(?:the\s)?app|refund|failed|fail|deducted|pending)\b/i;
const PAY_IMPERATIVE_RE = new RegExp(
  `\\b(?:pay|send|transfer)\\s+(?:me\\s+|it\\s+|money\\s+|the\\s+money\\s+|amount\\s+|the\\s+amount\\s+|payment\\s+)?(?:on|at|via|to|through|using|in)\\s+(?:my\\s+)?(?:${PAY_CHANNEL_WORDS})(?![a-z])` +
  `|\\b(?:${PAY_CHANNEL_WORDS})\\s*(?:se|pe|par|pr|on|me|mein|mai)?\\s*(?:pay\\s*|payment\\s*|paise\\s*|money\\s*|amount\\s*)?(?:kar\\s?do|kardo|karo|kariye|kr\\s?do|krdo|kro|bhejo|bhej\\s?do|bhejdo|bhej\\s?dena|daal\\s?do|dalo|send\\s+karo)\\b`,
  "i"
);

export function asksToPayOutside(lower: string): boolean {
  if (!PAY_CHANNEL_RE.test(lower)) return false;
  if (PAY_OUTSIDE_STRONG_RE.test(lower)) return true; // v414: clear outside intent
  // Talking about a payment made through Ybex itself (UPI on the checkout, a failed payment) is fine.
  if (PAY_INSIDE_RE.test(lower)) return false;
  if (/\bcash\b/i.test(lower) && PAY_ACTION_RE.test(lower)) return true; // v414: cash is always outside
  if (/\d{9,}/.test(lower.replace(/\s/g, ""))) return true; // v414: payee detail (account / UPI number)
  return PAY_IMPERATIVE_RE.test(lower); // v414: an order to pay on that channel, not a question about it
}

// v414: "@brand" inside a sentence that asks to TAG / collab / mention it is deal talk, not a handle
// being handed over — unless the same message also carries a contact word (dm, follow, insta id …).
const MENTION_ASK_RE = /\b(?:tag|tags|tagged|tagging|collab\w*|mention\w*|feature\w*|credit\w*|co-?author\w*|partnership|paid\s+partner)\b/i;
const MENTION_CONTACT_RE = /\b(?:dm|dms|message|msg|ping|contact|follow|followme|reach|whatsapp|watsapp|telegram|snap|snapchat|call|text\s+me|mail|email|gmail|number|baat|connect|insta\s*id|ig\s*id|my\s+(?:insta|ig|instagram|id|handle|account|page))\b/i;
const EMAILISH_MENTION = /(gmail|yahoo|hotmail|outlook|rediff|icloud|proton|live)\b|\.(com|in|net|org|co|io|me)$/i;

export function stripAllowedMentions(text: string): string {
  if (!MENTION_ASK_RE.test(text) || MENTION_CONTACT_RE.test(text)) return text;
  return text.replace(/(^|[\s(])@([a-z0-9._]{2,30})(?=[\s),.!?]|$)/gi, (all, pre, h) => {
    const handle = String(h).replace(/\.+$/, "");
    if (EMAILISH_MENTION.test(handle) || /\d{5,}/.test(handle)) return all;
    return `${pre} `;
  });
}

/** Filenames and domains are not handles. */
const NOT_A_HANDLE = /\.(com|in|co|net|org|io|me|app|dev|mp4|mov|jpg|jpeg|png|gif|pdf|docx?|xlsx?|zip|csv|html?)$/i;

/**
 * A message that is nothing but a username.
 *
 * `HANDLE_RE` needs a prefix like `ig:` to fire, so `himanshu.gupta` sent on its own passed
 * straight through — and that is how handles are actually shared: one bare token, often
 * followed by "this is my insta" in the next message.
 *
 * Deliberately narrow: the WHOLE message has to be that single token. A sentence that
 * happens to contain a dotted word is not touched.
 */
export function isBareHandle(text: string): boolean {
  const tok = text.trim();
  if (!/^[^\s]{6,30}$/.test(tok)) return false;
  if (NOT_A_HANDLE.test(tok)) return false;
  if (/^https?:/i.test(tok)) return false;
  if (/\d{4,}/.test(tok)) return false;            // long digit runs are the phone rule's job
  // One character after the separator is enough — "himanshu_g" is a handle. The 6-character
  // minimum on the whole token is what keeps "e.g" and similar out.
  // v414: a letter or digit must follow the separator — "thanks..." / "Okay..." are not handles.
  return /^@?[a-z0-9]+[._]+[a-z0-9][a-z0-9._]*$/i.test(tok) || /^@[a-z0-9._]{3,}$/i.test(tok);
}

/**
 * `himasnhugupta@` has no domain, so the email pattern never matched it. A token carrying a
 * bare `@` is still someone handing over an address or a handle.
 */
export function hasLooseAtToken(text: string): boolean {
  for (const raw of text.split(/\s+/)) {
    const tok = raw.replace(/[),.;:]+$/, "");
    if (!tok.includes("@")) continue;
    if (tok.length < 4) continue;
    const [before, after = ""] = tok.split("@");
    if (before.length >= 3 || after.length >= 3) return true;
  }
  return false;
}

/**
 * Strips a country code or trunk prefix so 919876543210 and 09876543210 both reduce to the
 * bare number.
 */
function stripDialPrefix(digits: string): string {
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/**
 * Does this run of digits look like an Indian mobile?
 *
 * 9 and 11 digits count as well as 10. A number typed one digit short or one digit long is
 * still a phone number being shared — `890909099` (9 digits) went straight through while
 * this only accepted exactly 10. The 6-9 leading digit is what keeps prices, follower
 * counts and pincodes out: those are shorter, and the ones that are not do not start 6-9.
 */
function hasIndianMobile(digits: string): boolean {
  if (digits.length < 9 || digits.length > 15) return false;
  const core = stripDialPrefix(digits);
  for (const len of [10, 9, 11]) {
    for (let i = 0; i + len <= core.length; i++) {
      const slice = core.slice(i, i + len);
      if (new RegExp(`^[6-9]\\d{${len - 1}}$`).test(slice)) return true;
    }
  }
  return false;
}

/**
 * Digit runs, where a run may span spaces/dashes/dots/brackets but NEVER letters.
 *
 * Concatenating every digit in a message is too greedy: "890000 followers, avg reach
 * 2300000" becomes one 13-digit string containing "9000023000", which looks like a mobile
 * number and is not. Separate numbers in a sentence are separate numbers.
 */
export function digitRuns(text: string): string[] {
  const runs: string[] = [];
  for (const m of text.matchAll(/\d[\d\s\-.()]*\d|\d/g)) {
    const only = m[0].replace(/\D/g, "");
    if (only) runs.push(only);
  }
  return runs;
}

/**
 * v414: a WHOLE number shaped like a mobile (9-11 digits starting 6-9, after +91 / 0). The old
 * check looked for a mobile-shaped slice anywhere inside a long run, so a 13-digit order id
 * (2026110712345) was "a phone number".
 */
export function hasMobileShape(digits: string): boolean {
  let d = String(digits || "");
  if (d.length === 13 && d.startsWith("091")) d = d.slice(3);
  const core = stripDialPrefix(d);
  return /^[6-9]\d{8,10}$/.test(core);
}

/** v414: a digit run is a mobile when its separator-split groups, joined in order, form one. */
function runHasMobile(rawRun: string): boolean {
  const groups = String(rawRun || "").split(/\D+/).filter(Boolean);
  for (let i = 0; i < groups.length; i++) {
    let joined = "";
    for (let j = i; j < groups.length; j++) {
      joined += groups[j];
      if (joined.length > 13) break;
      if (hasMobileShape(joined)) return true;
    }
  }
  return false;
}

function anyRunIsMobile(text: string): boolean {
  for (const m of String(text || "").matchAll(/\d[\d\s\-.()]*\d|\d/g)) {
    if (runHasMobile(m[0])) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Soft signals — contact words. Only count when near a contact-shaped thing.
// ---------------------------------------------------------------------------

const CONTACT_WORDS = [
  "phone", "mobile", "mob", "cell", "contact", "whatsapp", "whats app", "wapp",
  "telegram", "insta", "instagram", "snapchat", "signal", "email", "mail", "gmail",
  "call me", "ping me", "text me", "dm me", "number", "no.", "ph no", "contact no",
  "sampark", "number de", "baat karte", "call kar", "message kar",
  // Session 43 (Ravi: "Reach me at 931" / "509" / "9117" went through)
  "reach me", "reach out", "connect me", "msg me", "message me", "ring me", "dial", "whatsapp kar",
  "contact kar", "phone kar", "number pe", "is number"
];

function contactWordIn(lower: string): string | null {
  for (const w of CONTACT_WORDS) {
    // word-boundary match so "mob" does not fire inside "mobility"
    const re = new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i");
    if (re.test(lower)) return w;
  }
  return null;
}

/** v414: dd-mm-yyyy, dd.mm.yyyy, dd/mm/yyyy, yyyy-mm-dd (and 2-digit years) are dates, not contact digits. */
const DATE_RUN_RE = /^(?:\d{1,2}([-.\/])\d{1,2}\1(?:\d{4}|\d{2})|\d{4}([-.\/])\d{1,2}\2\d{1,2})$/;
export function isDateRun(raw: string): boolean {
  return DATE_RUN_RE.test(String(raw || "").trim());
}

/** v414: length of the longest digit run that is not an amount of money. */
export function longestNonMoneyRun(text: string): number {
  return nonMoneyRuns(text).reduce((best, r) => Math.max(best, r.length), 0);
}

/** v414: the digit runs that are not money, dates or invoice / order refs. */
function nonMoneyRuns(text: string): string[] {
  const out: string[] = [];
  const t = String(text || "");
  for (const m of t.matchAll(/\d[\d\s\-.()]*\d|\d/g)) {
    const raw = m[0];
    const only = raw.replace(/\D/g, "");
    const before = t.slice(Math.max(0, (m.index || 0) - 16), m.index || 0).toLowerCase();
    const after = t.slice((m.index || 0) + raw.length, (m.index || 0) + raw.length + 12).toLowerCase();
    const money = /(₹|rs\.?|inr|\$|budget|price|amount|fee|fees|cost|rate|pay|paid|payment)\s*(of|is|hai|:|=|-)?\s*$/.test(before)
      || /^\s*(\/-|k\b|rs\b|inr\b|rupees|followers|views|likes)/.test(after)
      || (/^\d+$/.test(raw) && /000$/.test(only) && only.length <= 8);
    if (money) continue;
    if (isDateRun(raw)) continue; // v414: 15-11-2026 / 10.12.2026 / 2026-11-07 are dates
    // v414: invoice / order / ref numbers (not mobile-shaped) are deal talk.
    if (/(invoice|inv|order|ref|reference|txn|transaction|utr|booking|tracking)\s*(id|no\.?|number|#)?\s*[:=#-]?\s*$/.test(before) && !runHasMobile(raw)) continue;
    out.push(only);
  }
  return out;
}

/** 6+ digits, or an @handle, or a bare domain — something a contact detail could hide in. */
function hasContactShape(text: string, digits: string): boolean {
  // v414: the LONGEST single number, not every digit added up ("No. of reels 2, budget 25000"),
  // and amounts (budget / ₹ / rs / round thousands) are not contact details.
  // v414: 8+ digits (phone-sized) or a mobile shape — "Invoice number 100234" / a pincode is not a contact detail.
  // A 6-7 digit run still counts when it starts like a mobile (6-9): "whatsapp 9876543".
  if (nonMoneyRuns(text).some((r) => r.length >= 8 || (r.length >= 6 && /^[6-9]/.test(r))) || anyRunIsMobile(text)) return true;
  if (/@[a-z0-9._]{3,}/i.test(text)) return true;
  if (/\b[a-z0-9-]+\.(com|in|me|net|org|io|co)\b/i.test(text)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Cross-message chunking buffer
// ---------------------------------------------------------------------------

const WINDOW_MS = 5 * 60 * 1000;
const MIN_CHUNK = 3;

type BufferEntry = { digits: string; at: number };
const recentBuffer = new Map<string, BufferEntry[]>();

/**
 * Remembers whether a contact WORD or a contact VALUE was seen recently, per thread+sender.
 *
 * The digit buffer only ever remembered digits, so this pair walked straight through:
 *
 *     "himanshu.gupta"      <- a value, innocent on its own
 *     "this is my insta"    <- a word, innocent on its own
 *
 * Neither message is blockable alone; together they are obviously a handle being handed
 * over. Either order has to work, because people send them both ways round.
 */
type Signal = { kind: "word" | "value"; at: number };
const signalBuffer = new Map<string, Signal[]>();

export function resetRecentMessageBuffer(): void {
  recentBuffer.clear();
  signalBuffer.clear();
}

function recordSignal(key: string, kind: "word" | "value", now: number): boolean {
  const prior = (signalBuffer.get(key) || []).filter((e) => now - e.at < WINDOW_MS);
  const opposite = kind === "word" ? "value" : "word";
  const pairFound = prior.some((e) => e.kind === opposite);
  prior.push({ kind, at: now });
  signalBuffer.set(key, prior);
  return pairFound;
}

/**
 * A "value" is something a contact detail could actually BE: a message that is essentially
 * just a number, or a bare handle, or an @token.
 *
 * Note what is excluded — a sentence that merely contains a number. "890000 followers, avg
 * reach 2300000" is a fact about the deal, not a contact detail, and treating it as one
 * would block the next perfectly ordinary "who should I contact" message.
 */
function looksLikeContactValue(text: string, digits: string): boolean {
  if (isBareHandle(text)) return true;
  if (hasLooseAtToken(text)) return true;
  const compact = text.replace(/[\s\-().]/g, "");
  const mostlyDigits = compact.length > 0 && digits.length / compact.length >= 0.8;
  return mostlyDigits && digits.length >= 4;
}

/**
 * A phone number split across messages ("98765" then "43210") never contains ten digits
 * in any single message, so it has to be reassembled across the window.
 *
 * Only messages that are MOSTLY digits are buffered. A sentence that happens to contain a
 * number ("budget is 3500 for 2 reels") is not a chunk of anything, and treating it as one
 * is how a price discussion turns into a false block.
 */
function pushChunkAndCheck(key: string, text: string, digits: string, now: number): boolean {
  const chunk = chunkDigits(text, digits);
  if (!chunk) return false;
  digits = chunk;

  const prior = (recentBuffer.get(key) || []).filter((e) => now - e.at < WINDOW_MS);
  prior.push({ digits, at: now });
  recentBuffer.set(key, prior);

  // try every contiguous run of recent chunks
  for (let start = 0; start < prior.length; start++) {
    let joined = "";
    for (let end = start; end < prior.length; end++) {
      joined += prior[end].digits;
      if (joined.length >= 10 && hasIndianMobile(joined)) return true;
      if (joined.length > 14) break;
    }
  }
  return false;
}

/**
 * Session 43: the digits a message adds to a number being sent in pieces. A mostly-digit
 * message counts whole ("509"); a sentence counts only the run at its very END ("Reach me at
 * 931" → "931") — that is where people start a number they continue in the next message.
 * Prices ("₹3000", "3k", "5000 followers") are never chunks.
 */
// v414: money talk is never a phone chunk ("My rate is 75000" then "Negotiable to 60000").
const CHUNK_MONEY_RE = /[₹$]|\b(?:rs|inr|rate|rates|price|budget|fees?|negotiable|amount|lakh|lakhs|lac|rupees|cost)\b|\d\s*k\b/i;
/** v414: 5+ digits that are round thousands (75000, 1,50,000) or comma-grouped are amounts. */
function isRoundAmount(t: string, digits: string): boolean {
  if (digits.length < 5) return false;
  return /000$/.test(digits) || /\d,\d{2,3}(?:,\d{2,3})*\b/.test(t);
}

export function chunkDigits(text: string, digits = extractDigits(text)): string | null {
  const t = String(text || "").trim();
  if (CHUNK_MONEY_RE.test(t)) return null; // v414
  const compact = t.replace(/[\s\-().]/g, "");
  // v414: 60% (was 80%) — but a sentence is no longer a chunk unless it carries a contact word (below).
  const isMostlyDigits = compact.length > 0 && digits.length / compact.length >= 0.6;
  if (isMostlyDigits) {
    if (isRoundAmount(t, digits)) return null; // v414
    if (isDateRun(t.replace(/[^\d\-.\/]/g, ""))) return null; // v414: a date
    return digits.length >= 2 && digits.length <= 9 ? digits : null;
  }
  // v414: only "Reach me at 931"-style sentences (a contact word) start a number at their end.
  if (!contactWordIn(t.toLowerCase())) return null;
  const m = t.match(/(?:^|[^\d₹$])(\d[\d\s\-.]{0,12})\s*$/);
  if (!m) return null;
  const before = t.slice(0, t.length - m[0].length + (m[0].match(/^\D/) ? 1 : 0));
  if (/(₹|rs\.?|inr|\$)\s*$/i.test(before)) return null;
  if (isDateRun(m[1])) return null; // v414
  const run = m[1].replace(/\D/g, "");
  if (isRoundAmount(m[1], run)) return null; // v414
  return run.length >= 2 && run.length <= 9 ? run : null;
}

/**
 * Session 43: same check from the chat's own history, so it works even when the messages
 * landed on different servers (the in-memory buffer above is per server). `previous` = this
 * sender's last text messages, oldest first. Blocks when whole pieces join into a mobile number.
 */
export function splitNumberAcrossMessages(text: string, previous: string[] = []): boolean {
  const pieces = [...previous.slice(-6), text].map((m) => chunkDigits(m));
  // Only consecutive pieces count — a normal sentence in between breaks the chain.
  let chain: string[] = [];
  const chains: string[][] = [];
  for (const p of pieces) {
    if (p) chain.push(p);
    else { if (chain.length) chains.push(chain); chain = []; }
  }
  if (chain.length) chains.push(chain);
  const last = chains[chains.length - 1];
  if (!last || pieces[pieces.length - 1] === null) return false;
  // The newest piece must be part of it; try every run of pieces that ends with it.
  for (let start = last.length - 1; start >= 0; start--) {
    const joined = last.slice(start).join("");
    if (joined.length > 13) break;
    const core = stripDialPrefix(joined);
    if (core.length === 10 && /^[6-9]\d{9}$/.test(core)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function checkComprehensiveDisallowedContent(
  text: string,
  opts: FilterOptions = {}
): FilterResult {
  const allow: FilterResult = { blocked: false };
  if (opts.exempt) return allow;
  if (!text || typeof text !== "string") return allow;

  // v414: attachment filename and only real allowed links are skipped; @mentions asked to be tagged are deal talk.
  const linkFree = stripAllowedUrls(stripAttachmentLabel(text));
  const fullLower = linkFree.toLowerCase();
  const cleaned = stripAllowedMentions(linkFree);
  const lower = cleaned.toLowerCase();
  const digits = extractDigits(cleaned);
  const now = opts.now ?? Date.now();

  // --- hard signals ---
  // v414: UPI ids first — "ravi@okaxis" is a payment address, not a half-typed email.
  if (hasUpiId(lower)) { // v414: after brand @mentions are stripped ("tag @paytm" is not a UPI id)
    return block("UPI", "UPI IDs can't be shared in chat. Payments must stay inside Ybex.");
  }
  if (EMAIL_RE.test(lower)) {
    return block("EMAIL", "Email addresses can't be shared in chat.");
  }
  if (MESSAGING_DOMAIN_RE.test(lower)) {
    return block("MESSAGING_LINK", "Links to outside messaging apps can't be shared in chat.");
  }
  if (HANDLE_RE.test(lower)) {
    return block("HANDLE", "Social handles can't be shared in chat.");
  }
  if (isBareHandle(cleaned)) {
    return block("HANDLE_BARE", "That looks like a social handle. Please keep the conversation on Ybex.");
  }
  if (hasLooseAtToken(cleaned)) {
    return block("EMAIL_PARTIAL", "Email addresses and handles can't be shared in chat.");
  }
  if (anyRunIsMobile(cleaned)) {
    return block("PHONE", "Phone numbers can't be shared in chat.");
  }
  for (const cand of leetDigitCandidates(cleaned)) {
    if (hasMobileShape(cand)) { // v414: whole number only (a 13-digit order id is not a phone)
      return block("PHONE_LEET", "Phone numbers can't be shared in chat, disguised or otherwise.");
    }
  }

  const spelled = wordsToDigits(lower);
  // 9, not 10 — hasIndianMobile accepts short-by-one numbers now, and this guard was
  // silently overriding that for the spelled-out path.
  if (spelled.length >= 9 && hasIndianMobile(spelled)) {
    return block("PHONE_WORDS", "Phone numbers can't be shared in chat, spelled out or otherwise.");
  }
  // v346: digits and number words mixed in one run.
  for (const run of mixedNumberRuns(lower)) {
    if (run.length >= 9 && hasIndianMobile(run)) {
      return block("PHONE_WORDS", "Phone numbers can't be shared in chat, spelled out or otherwise.");
    }
  }

  // v414: being paid outside Ybex (gpay / cash / bank transfer + pay / bhejo / outside …).
  if (asksToPayOutside(fullLower)) {
    return block("PAY_OUTSIDE", "Payments must stay inside Ybex.");
  }

  // --- chunking across messages ---
  if (opts.threadId && opts.senderId) {
    const key = `${opts.threadId}:${opts.senderId}`;
    if (pushChunkAndCheck(key, cleaned, digits, now)) {
      return block("PHONE_CHUNKED", "That looks like a phone number split across messages.");
    }
  }

  // --- soft signal: contact word near something contact-shaped ---
  const word = contactWordIn(lower);
  const isValue = looksLikeContactValue(cleaned, digits);

  if (word && (STRICT_KEYWORD_MODE || hasContactShape(cleaned, digits))) {
    return block(
      "CONTACT_INTENT",
      "It looks like you're sharing contact details. Please keep the conversation on Ybex — your payment is only protected here."
    );
  }

  // --- a word and a value split across two messages ---
  if (opts.threadId && opts.senderId && (word || isValue)) {
    const key = `${opts.threadId}:${opts.senderId}`;
    if (recordSignal(key, word ? "word" : "value", now)) {
      return block(
        "CONTACT_SPLIT",
        "It looks like you're sharing contact details across messages. Please keep the conversation on Ybex."
      );
    }
  }

  return allow;
}

/**
 * v347 (Ravi approved): mask contact details in free text that is SAVED rather than sent as chat
 * (campaign application pitch). Never rejects — emails, outside-messaging links, "ig: handle" /
 * "@handle" and mobile numbers are replaced with "[hidden]". Only runs when the chat filter itself
 * would block the text, so ordinary pitches ("890000 followers", "₹15,000") are left exactly as typed.
 */
export const CONTACT_MASK = "[hidden]";
export function maskContactDetails(text: string): string {
  if (!text || typeof text !== "string") return text;
  if (!checkComprehensiveDisallowedContent(text).blocked) return text;
  let out = text;
  out = out.replace(new RegExp(UPI_AT_RE.source, "gi"), CONTACT_MASK); // v414: UPI ids too
  out = out.replace(new RegExp(UPI_SPOKEN_RE.source, "gi"), CONTACT_MASK);
  out = out.replace(new RegExp(EMAIL_RE.source, "gi"), CONTACT_MASK);
  out = out.replace(new RegExp(`\\S*${MESSAGING_DOMAIN_RE.source}\\S*`, "gi"), CONTACT_MASK);
  out = out.replace(new RegExp(HANDLE_RE.source, "gi"), CONTACT_MASK);
  out = out.replace(/(^|[\s(])@[a-z0-9._]{3,}/gi, (_m, pre) => `${pre}${CONTACT_MASK}`);
  out = out.replace(/\+?\d[\d\s\-.()]*\d/g, (m) => (runHasMobile(m) ? CONTACT_MASK : m)); // v414: same whole-number rule as the check
  return out;
}

function block(code: string, message: string): FilterResult {
  return { blocked: true, code, reason: code, message };
}

export default checkComprehensiveDisallowedContent;
