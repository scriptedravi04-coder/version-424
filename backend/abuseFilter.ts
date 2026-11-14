// Blocks abusive and sexually harassing messages in chat.
//
// There was no check of any kind for this. On a platform where brands and creators are
// strangers transacting money, messages like "baby i wanna fuck you" and "aapki gaand
// milegi?" were delivered with nothing in their way.
//
// Deliberately separate from contactSecurityFilter.ts — different reason, different message
// to the sender, different rules. Mixing them would make both harder to reason about.
//
// Two severities:
//   HARASSMENT  sexual propositions, threats, slurs, sexualised body references
//               -> always blocked
//   PROFANITY   ordinary frustrated swearing ("this is shit", "bakwas hai")
//               -> NOT blocked by default. Blocking it stops people complaining about a
//                  late delivery, which is legitimate business conversation. Flip
//                  BLOCK_MILD_PROFANITY to true to change that.
//
// Hindi/Hinglish matters more than English here, and Roman-script Hindi is the common case.

export const BLOCK_MILD_PROFANITY = false;

export type AbuseResult = {
  blocked: boolean;
  severity?: "harassment" | "profanity";
  code?: string;
  matched?: string;
  message?: string;
};

// ---------------------------------------------------------------------------
// Normalisation — people space out, repeat and substitute characters on purpose
// ---------------------------------------------------------------------------

const CHAR_SUBS: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i"
};

/**
 * "f u c k" -> "fuck", "gaaaand" -> "gand", "fu*k" -> "fuk".
 *
 * Returns BOTH a spaced-preserving form (for word-boundary matching) and a fully collapsed
 * form (for obfuscation that removes the boundaries entirely). Matching only the collapsed
 * form would fire on innocent word pairs, so the two are used for different rule sets.
 */
export function normalise(text: string): { spaced: string; collapsed: string } {
  const lowered = String(text || "").toLowerCase();

  const substituted = lowered.replace(/[01345 7@$!]/g, (ch) =>
    ch === " " ? " " : (CHAR_SUBS[ch] ?? ch)
  );

  // drop anything that is not a letter or a space
  const cleaned = substituted.replace(/[^a-z\s]/g, " ");

  // collapse runs of the same letter: gaaand -> gand
  const deduped = cleaned.replace(/([a-z])\1{1,}/g, "$1");

  const spaced = deduped.replace(/\s+/g, " ").trim();

  // join single letters that were spaced out: "f u c k you" -> "fuck you"
  const joinedSingles = spaced.replace(/\b(?:[a-z]\s){2,}[a-z]\b/g, (m) => m.replace(/\s/g, ""));

  return {
    spaced: joinedSingles,
    collapsed: joinedSingles.replace(/\s+/g, "")
  };
}

// ---------------------------------------------------------------------------
// Word lists
// ---------------------------------------------------------------------------

// Sexual / harassing. Matched on word boundaries against the normalised text.
const HARASSMENT_WORDS = [
  // English
  "fuck", "fucking", "fuk", "fck", "fvck", "phuck", "fuq", "fuck u", "wtf",
  "cock", "dick", "pussy", "pusy", "boobs", "tits", "nude",
  "nudes", "sexy", "horny", "slut", "whore", "bitch", "rape", "molest", "bastard",
  // Hindi / Hinglish
  "gand", "gaand", "chut", "chutiya", "chutiye", "lund", "lauda", "loda", "randi",
  "bhosdi", "bhosda", "bhosdike", "madarchod", "behenchod", "bhenchod", "mc", "bc",
  "haramkhor", "kutiya", "rakhail", "chinal", "chudai", "chod", "chodna", "chudne",
  "sex", "boob", "stan"
];

// Phrases — these need the surrounding words, a single token would over-block.
const HARASSMENT_PHRASES = [
  "wanna fuck", "want to fuck", "sleep with me", "send nudes", "send pics",
  "show me your", "meet me alone", "come to my room", "come to my place",
  "milegi kya", "milegi", "de do na", "raat ko free", "video call karo na",
  "akele milo", "kiss karo", "pyar karo"
];

// Ordinary swearing — annoyance, not harassment.
const MILD_WORDS = [
  "shit", "crap", "damn", "hell", "ass", "idiot", "stupid", "useless",
  "bakwas", "faltu", "ghatiya", "bewakoof", "pagal", "nalayak"
];

// Words that legitimately contain a listed token. Checked before flagging.
const SAFE_CONTEXT = [
  "sexuality", "sexual harassment", "unisex", "middlesex", "essex", "sussex",
  "assess", "assessment", "asset", "assign", "assist", "associate", "assume",
  "class", "pass", "mass", "glass", "grass", "bass", "brass", "compass",
  "shiitake", "scunthorpe", "standard", "stand", "standing", "understand",
  "mcdonald", "bcc", "mcq", "chodhary", "chaudhary", "chowdhury"
];

function hasSafeContext(spaced: string): boolean {
  return SAFE_CONTEXT.some((w) => spaced.includes(w));
}

function wordHit(spaced: string, collapsed: string, words: string[]): string | null {
  for (const w of words) {
    // word-boundary match on the spaced form — "ass" must not fire inside "class"
    if (new RegExp(`(^|\\s)${w}(\\s|$)`).test(spaced)) return w;
    // obfuscated form: only for words long enough that a substring hit is meaningful
    if (w.length >= 5 && collapsed.includes(w)) return w;
  }
  return null;
}

function phraseHit(spaced: string, phrases: string[]): string | null {
  for (const p of phrases) {
    if (spaced.includes(p)) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------

export type AbuseOptions = {
  /** Revision notes, briefs and support tickets are not filtered. */
  exempt?: boolean;
};

export function checkAbusiveContent(text: string, opts: AbuseOptions = {}): AbuseResult {
  const pass: AbuseResult = { blocked: false };
  if (opts.exempt) return pass;
  if (!text || typeof text !== "string") return pass;

  const { spaced, collapsed } = normalise(text);
  if (!spaced) return pass;

  if (hasSafeContext(spaced)) return pass;

  const phrase = phraseHit(spaced, HARASSMENT_PHRASES);
  if (phrase) {
    return {
      blocked: true,
      severity: "harassment",
      code: "HARASSMENT",
      matched: phrase,
      message: "This message was blocked. Please keep the conversation professional."
    };
  }

  const word = wordHit(spaced, collapsed, HARASSMENT_WORDS);
  if (word) {
    return {
      blocked: true,
      severity: "harassment",
      code: "HARASSMENT",
      matched: word,
      message: "This message was blocked. Please keep the conversation professional."
    };
  }

  const mild = wordHit(spaced, collapsed, MILD_WORDS);
  if (mild) {
    if (!BLOCK_MILD_PROFANITY) {
      // Reported but not blocked, so admin can still see a pattern building.
      return { blocked: false, severity: "profanity", code: "PROFANITY", matched: mild };
    }
    return {
      blocked: true,
      severity: "profanity",
      code: "PROFANITY",
      matched: mild,
      message: "This message was blocked. Please keep the conversation professional."
    };
  }

  return pass;
}

export default checkAbusiveContent;
