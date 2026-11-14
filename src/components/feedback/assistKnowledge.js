// v295 (Ravi): "Ybex Assist ko poori app study karwao — brand ke liye kya karta hai, creator ke liye kya karta
// hai — aur agar koi budget bataye to bata do ki us budget mein kya ho jayega."
// Plain rules (no AI call, no server call, no database): every answer below is written from how the app
// really works (campaign / UGC / chat agreement / secure payment hold / KYC / payout screens). Numbers that
// the admin can change (fee %, referral reward) are NOT quoted as fixed — the answer points to the screen
// that shows the live number. Never write the word "escrow" in a user-facing answer (Ravi, session 34).

const nrm = (t) => String(t || "").toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s'₹.]/gu, " ").replace(/\s+/g, " ").trim();

// ── amounts: ₹50,000 · 50k · 1.5 lakh · 2 lac · 50 hazar ────────────────────────────────────────────
const UNIT = { k: 1e3, thousand: 1e3, hazar: 1e3, hazaar: 1e3, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, crore: 1e7, crores: 1e7, cr: 1e7 };
/** First money amount in the text, in rupees (or null). A bare small number like "5 videos" is not money. */
export function parseAmount(text) {
  const t = String(text || "").toLowerCase().replace(/(\d),(?=\d)/g, "$1");
  const rx = /(₹|rs\.?\s*|inr\s*)?(\d+(?:\.\d+)?)\s*(k|thousand|hazaar|hazar|lakhs?|lacs?|crores?|cr)?(?![a-z0-9])/g;
  let m;
  while ((m = rx.exec(t))) {
    const [, cur, num, unit] = m;
    const value = Number(num) * (unit ? UNIT[unit] : 1);
    if (!Number.isFinite(value)) continue;
    if (unit || cur || Number(num) >= 1000) return Math.round(value);
  }
  return null;
}
export const inr = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;

// Ybex's own indicative per-reel bands (backend/market_intelligence_routes.ts "Base rate calculation").
const BANDS = [
  { key: "nano", min: 3000, max: 8000, en: "nano creators (under 20k followers)", hi: "nano creators (20k followers se kam)" },
  { key: "micro", min: 8000, max: 25000, en: "micro creators (20k–100k)", hi: "micro creators (20k–100k)" },
  { key: "macro", min: 25000, max: 75000, en: "macro creators (100k–500k)", hi: "macro creators (100k–500k)" },
];
const range = (a, b) => (a === b ? `${a}` : `${a}–${b}`);

/** A rough "what can I do with ₹X" answer for a brand. */
export function budgetPlan(amount, lang = "en") {
  const hi = lang === "hi";
  const rows = [];
  for (const b of BANDS) {
    const lo = Math.floor(amount / b.max), up = Math.floor(amount / b.min);
    if (up >= 1) rows.push(`• ${range(Math.max(lo, 1), up)} ${hi ? "reels" : "reels"} — ${hi ? b.hi : b.en}`);
  }
  const head = hi ? `${inr(amount)} ke budget mein rough idea:` : `With ${inr(amount)}, roughly:`;
  let mix = "";
  if (amount >= 16000) {
    const micro = Math.max(1, Math.floor((amount * 0.6) / 16500));
    const nano = Math.max(1, Math.floor((amount * 0.4) / 5500));
    mix = hi
      ? `\n\nBalanced mix: ${micro} micro + ${nano} nano reels (60% micro, 40% nano) — reach bhi, variety bhi.`
      : `\n\nA balanced mix: ${micro} micro + ${nano} nano reels (60% micro, 40% nano) — good reach and variety.`;
  }
  let small = "";
  if (!rows.length) {
    small = hi
      ? `\nIs budget mein ek nano reel bhi mushkil hai — ek chhota UGC brief try karo, usme per-video budget aap khud set karte ho.`
      : `\nThat's tight for even one nano reel — try a small UGC brief instead, where you set the per-video budget yourself.`;
  }
  const ugc = hi
    ? `\n\nUGC videos: brief mein per-video budget aap set karte ho, to budget ko zyada videos mein baant sakte ho.`
    : `\n\nUGC videos: you set the per-video budget in the brief, so you can split the budget over more videos.`;
  const foot = hi
    ? `\n\nYe indicative rates hain (Ybex Market Rate Advisor ke). Final price creator se chat mein tay hota hai; fee/GST ka exact breakup payment se pehle dikhta hai.`
    : `\n\nThese are indicative rates (from Ybex's Market Rate Advisor). The final price is agreed with the creator in chat; the exact fee/GST breakup shows before you pay.`;
  return `${head}\n${rows.join("\n")}${small}${mix}${ugc}${foot}`;
}

// ── topics ──────────────────────────────────────────────────────────────────────────────────────────
const A = (en, hi) => ({ en, hi });
const TOPICS = [
  {
    key: "payout",
    rx: /\b(withdraw|withdrawal|payout|payouts|payout take|how long.*(payout|payment)|get paid|when (do|will) i (get|receive)|paise (kab|kaise)|payment (kab|kaise)|money (kab|kaise)|bank (me|mein)|utr)\b/,
    ans: A(
      "Payouts: once the brand approves your work and releases the payment, Ybex sends it to your verified bank/UPI in 1–2 working days. The payout receipt says \"Transfer pending\" until the UTR number is posted. Add your bank/UPI in KYC first — without it the payout can't go.\n\nBrands don't withdraw anything: you pay into the secure payment hold and release it after approving the content.",
      "Payout: brand aapka kaam approve karke payment release karta hai, uske baad Ybex 1–2 working days mein aapke verified bank/UPI mein bhejta hai. Jab tak UTR number nahi aata, receipt par \"Transfer pending\" dikhta hai. Pehle KYC mein bank/UPI add karna zaroori hai.\n\nBrands ko kuch withdraw nahi karna hota: wo secure payment hold mein pay karte hain aur content approve karke release karte hain."
    ),
  },
  {
    key: "kyc",
    rx: /\b(kyc|verification|verify|verified|pan|gstin|aadhaar|aadhar|documents?)\b/,
    ans: A(
      "KYC is done after login. Creators: PAN number + bank account or UPI. Brands: GSTIN or business PAN + one business proof document. Payments and payouts stay locked until KYC is verified; if the team needs more info, you'll see it in your KYC status.",
      "KYC login ke baad hota hai. Creators: PAN number + bank account ya UPI. Brands: GSTIN ya business PAN + ek business proof document. KYC verify hone tak payment aur payout locked rehte hain; team ko aur info chahiye to KYC status mein dikh jaata hai."
    ),
  },
  {
    key: "fees",
    rx: /\b(fee|fees|commission|gst|convenience|platform charges?|ybex charges?|service charges?|kitna kat|kitna cut)\b/,
    ans: A(
      "Fees: Ybex charges a fee per deal (for creators it is called \"Convenience fee & TDS\" and is taken from the payout), and the exact breakup (fee + GST, if applicable) is shown before you accept or pay. Standard rates are higher for small deals (under ₹20,000) and lower for bigger ones; the team can change them, and at times there's an offer (₹0 platform fee + a small convenience fee) or a coupon. Creators see \"You receive in your bank\" on the payout card.",
      "Fees: Ybex har deal par fee leta hai (creators ke liye iska naam \"Convenience fee & TDS\" hai, jo payout se katta hai), aur exact breakup (fee + GST agar lagta ho) accept ya pay karne se pehle dikh jaata hai. Standard rate chhoti deals (₹20,000 se kam) par zyada aur badi deals par kam hota hai; team ise badal sakti hai, aur kabhi-kabhi offer (₹0 platform fee + chhota convenience fee) ya coupon bhi hota hai. Creators ko payout card par \"You receive in your bank\" dikhta hai."
    ),
  },
  {
    key: "refer",
    rx: /\b(refer|referral|referrals|refer and earn|invite friends?|coupon|coupons|promo code|promocode|discount)\b/,
    ans: A(
      "Refer & Earn: open the Refer & Earn page for your code, the reward amount and when the reward is credited. Coupons: enter the promo code on the payment/fee screen before you pay — the discount shows in the fee breakup.",
      "Refer & Earn: Refer & Earn page par aapka code, reward amount aur reward kab milega, sab dikhta hai. Coupon: payment/fee screen par pay karne se pehle promo code daalo — discount fee breakup mein dikh jaata hai."
    ),
  },
  {
    key: "apply",
    rx: /\b(fill the form|apply creator|apply as (a )?creator|join as (a )?creator|creators? (apply|join|signup|sign up|register|banna|ban)|apply without (a )?(login|logging|account)|waitlist|become a creator|creator kaise ban)\b/,
    ans: A(
      "Creators can apply without logging in: tap \"Fill the Form\" in the website footer (it opens the creator application page). Your application goes to a waitlist, the Ybex team approves it, and then you appear in Explore Creators for brands.",
      "Creators bina login ke apply kar sakte hain: website ke footer mein \"Fill the Form\" dabao (creator application page khulta hai). Aapka application waitlist mein jaata hai, Ybex team approve karti hai, phir aap brands ko Explore Creators mein dikhte ho."
    ),
  },
  {
    key: "explore",
    rx: /\b(explore|find creators?|search creators?|discover creators?|creators? (dhundh|dhoond|kaise milenge)|hire creators?)\b/,
    ans: A(
      "Explore: brands can search creators by niche and place — try \"Jaipur creators\": that city comes first, then creators within 50 km. Each card shows followers, average reach, niche and city. Open a creator to invite them to a campaign or UGC brief.",
      "Explore: brands niche aur jagah se creators dhundh sakte hain — jaise \"Jaipur creators\": pehle wahi city, phir 50 km ke andar ke creators. Har card par followers, average reach, niche aur city dikhta hai. Creator khol kar campaign ya UGC brief ke liye invite kar sakte ho."
    ),
  },
  {
    key: "agreement",
    rx: /\b(agreement|contract|e-?sign|signature|sign (the|an|my)|otp sign|signing)\b/,
    ans: A(
      "Agreement: once both sides accept the price in chat, an agreement appears. Tick the terms, get an OTP on your email and sign. Both parties must sign before the payment and the work start.",
      "Agreement: chat mein dono taraf price accept kar lein to agreement aata hai. Terms tick karo, email par OTP aayega, usse sign karo. Payment aur kaam shuru hone se pehle dono ko sign karna hota hai."
    ),
  },
  {
    key: "ugc",
    rx: /\b(ugc|brief|briefs|instant ugc|raw video|edited video|collab(oration)? reel)\b/,
    ans: A(
      "UGC briefs: a brand posts a brief in one of 3 formats — Collaboration Reel, UGC video (raw) or UGC video (edited) — with a per-video budget and number of creators. The brand pays for the whole batch when posting; it stays in the secure payment hold. A creator takes a slot → uploads a draft → brand approves → creator submits the live link → payout. If a creator cancels, the slot is listed again; a brand can cancel (24h+ and no draft yet) and the refund is processed in 1–2 working days.",
      "UGC brief: brand 3 formats mein se ek chunta hai — Collaboration Reel, UGC video (raw) ya UGC video (edited) — per-video budget aur creators ki sankhya ke saath. Brief post karte waqt poore batch ka payment hota hai, jo secure payment hold mein rehta hai. Creator slot leta hai → draft upload → brand approve → creator live link submit → payout. Creator cancel kare to slot dobara list hota hai; brand 24 ghante baad aur draft se pehle cancel kar sakta hai, refund 1–2 working days mein process hota hai."
    ),
  },
  {
    key: "campaign",
    rx: /\b(campaign|campaigns)\b/,
    ans: A(
      "Campaigns: (1) The brand creates a campaign — the budget shown is only a range for creators, nothing is charged yet. (2) Ybex reviews it, then it goes live. (3) Creators apply; the brand shortlists and negotiates in chat. (4) Both sign the agreement with an OTP. (5) The brand pays into the secure payment hold. (6) The creator posts the content, the brand approves it. (7) Payout is released to the creator.",
      "Campaigns: (1) Brand campaign banata hai — dikhne wala budget creators ke liye sirf ek range hai, abhi koi charge nahi. (2) Ybex review karta hai, phir live hota hai. (3) Creators apply karte hain; brand shortlist karke chat mein negotiate karta hai. (4) Dono OTP se agreement sign karte hain. (5) Brand secure payment hold mein pay karta hai. (6) Creator content post karta hai, brand approve karta hai. (7) Creator ko payout release hota hai."
    ),
  },
  // v435 (Eva question test #4 / step 1): fixed answers for the top FAQs, so they are answered — never filed as tickets.
  {
    key: "escrow",
    rx: /\b(escrow|secure hold|money hold|paisa kahan rehta|paise kahan rehte)\b/,
    ans: A(
      "Escrow (secure payment hold): the brand pays into Ybex's hold before the work starts. The creator can see the money is there, but it's released only after the brand approves the content — then it goes to the creator's KYC-verified bank/UPI. If the deal is cancelled before approval, the money goes back to the brand.",
      "Escrow (secure payment hold): kaam shuru hone se pehle brand Ybex ke hold mein pay karta hai. Creator dekh sakta hai ki paisa aa gaya, par release tabhi hota hai jab brand content approve kare — phir creator ke KYC-verified bank/UPI mein jaata hai. Approve hone se pehle deal cancel ho to paisa brand ko wapas jaata hai."
    ),
  },
  {
    key: "refund",
    rx: /\b(refund|refunds|money back|paise wapas|paisa wapas|where is my refund|refund kab)\b/,
    ans: A(
      "Refunds: if a deal or brief is cancelled before the content is approved, the held amount goes back to the brand's original payment method in about 5–7 working days. You can see the refund on the deal's payment screen. If it's been longer, tell me \"send to team\" and I'll pass it on.",
      "Refund: content approve hone se pehle deal ya brief cancel ho to hold kiya hua paisa brand ke original payment method mein lagbhag 5–7 working days mein wapas aata hai. Deal ki payment screen par refund dikhta hai. Isse zyada time ho gaya ho to \"team ko bhejo\" likho, main aage bhej dungi."
    ),
  },
  {
    key: "support",
    rx: /\b(contact (support|ybex|the team|team)|support team|customer (care|support)|helpline|help ?desk|raise (a )?ticket|support se baat|team se baat|complain|complaint kahan|support kaise)\b/,
    ans: A(
      "Support: open Help (Menu → Help & Support) and raise a ticket — the Ybex team replies there and you get a notification. You can also just tell me the problem here and I'll send it to the team.",
      "Support: Help kholo (Menu → Help & Support) aur ticket raise karo — Ybex team wahin reply karti hai aur notification aata hai. Ya yahin mujhe problem bata do, main team ko bhej dungi."
    ),
  },
  {
    key: "delete",
    rx: /\b(delete (my )?account|remove (my )?account|close (my )?account|deactivate|account delete|account band|account hatao)\b/,
    ans: A(
      "Delete account: go to Settings → Delete account (or open ybexmedia.in/delete-account). Finish or cancel any running deal first — money in the payment hold must be settled before the account can be removed.",
      "Account delete: Settings → Delete account (ya ybexmedia.in/delete-account kholo). Pehle chal rahi deal poori ya cancel karo — payment hold ka paisa settle hone ke baad hi account hat sakta hai."
    ),
  },
  {
    key: "cancel",
    rx: /\b(cancel (my |the |this |a )?(campaign|brief|order|deal|collab)|campaign (cancel|band|delete)|deal cancel)\b/,
    ans: A(
      "Cancelling: a campaign or UGC brief that has no signed deal yet can be closed from its page (⋯ → Close / Cancel) — money not yet used goes back as a refund. Once a deal is signed and paid, open that deal and use \"Cancel deal\": if the creator hasn't delivered, the held money is refunded; if there's a dispute, the Ybex team decides.",
      "Cancel karna: jis campaign ya UGC brief mein abhi koi deal sign nahi hui, use uske page se band karo (⋯ → Close / Cancel) — jo paisa use nahi hua wo refund ho jaata hai. Deal sign aur pay hone ke baad us deal mein \"Cancel deal\" use karo: creator ne deliver nahi kiya to hold ka paisa refund hota hai; dispute ho to Ybex team decide karti hai."
    ),
  },
  {
    key: "payless",
    rx: /\b(less than (agreed|promised|decided)|kam (paise|payment|paisa) (aaya|mila|aaye)|deduct\w*|tds)\b|\b(why|kyun|kyu)\b.*\b(payment|payout|paisa|paise|money|amount)\b.*\b(less|kam|cut|kat)\b|\b(payment|payout|paisa|paise|money|amount)\b.*\b(less|kam|cut|kat)\b.*\b(why|kyun|kyu)\b/,
    ans: A(
      "Why the payout is less than the deal amount: the creator payout is the agreed amount minus Ybex's convenience fee and TDS (tax deducted at source, shown as \"Convenience fee & TDS\"). The exact breakup is on the payout receipt in Earnings. If the numbers still don't match, tell me \"send to team\" and they'll check it.",
      "Payout deal amount se kam kyun: creator ko tay amount mein se Ybex ki convenience fee aur TDS (\"Convenience fee & TDS\") kat ke milta hai. Exact breakup Earnings mein payout receipt par hai. Phir bhi number match na ho to \"team ko bhejo\" likho, wo check karenge."
    ),
  },
  {
    key: "safety",
    rx: /\b(threaten\w*|harass\w*|blackmail\w*|dhamki|pareshan kar)\b/,
    ans: A(
      "I'm sorry you're dealing with that. If you're in danger, call 112 right away. If it's someone on Ybex, use Report on their profile or chat (⋯ → Report / Block) and the team will act on it. For cyber harassment you can also report at cybercrime.gov.in or call 1930.",
      "Sorry, ye sun ke bura laga. Khatra ho to turant 112 call karo. Agar Ybex par koi hai to unki profile ya chat mein Report / Block (⋯) karo, team action legi. Online harassment ke liye cybercrime.gov.in par report ya 1930 par call bhi kar sakte ho."
    ),
  },
  {
    key: "team",
    rx: /\b(team members?|add (my )?(team|colleague|coworker|employee)|team access|add (a )?user|multiple users|team ko add|team add)\b/,
    ans: A(
      "Team members: a brand can have teammates who work on the same account (they see the brand's campaigns and chats and act for the brand). Ask for it from Help & Support with your teammate's email — the Ybex team adds them.",
      "Team members: brand ke account par teammates kaam kar sakte hain (wo brand ke campaigns aur chats dekhte hain aur brand ke naam se kaam karte hain). Help & Support mein teammate ki email ke saath request daalo — Ybex team add kar degi."
    ),
  },
  {
    key: "payment",
    rx: /\b(secure payment hold|payment hold|safe|safety|scam|fraud|refund|money back|paise wapas|pay|payment|payments)\b/,
    ans: A(
      "Payments are safe by design: the brand's money goes into Ybex's secure payment hold, not straight to the creator. It's released only after the brand approves the content, and the creator is paid to a KYC-verified bank/UPI. Both sides sign an agreement first, so the terms are on record.",
      "Payment safe tareeke se hota hai: brand ka paisa seedha creator ko nahi, Ybex ke secure payment hold mein jaata hai. Brand content approve kare tabhi release hota hai, aur creator ko KYC-verified bank/UPI mein milta hai. Pehle dono agreement sign karte hain, to terms record mein rehte hain."
    ),
  },
  {
    key: "brandwhat",
    rx: /\b(for brands?|brand ke liye|brands? (can|kya|ko kya)|what (can|do) brands|brand kya kar sakta|main brand hoon|i am a brand|i'm a brand|as a brand)\b/,
    ans: A(
      "For brands, Ybex lets you: find verified creators (Explore, by niche and city) · run campaigns (creators apply, you negotiate in chat) · post UGC briefs for quick video content · sign an agreement with an OTP · pay into a secure payment hold and release it after approving the work · get the live link back. Ask me about any step — campaigns, UGC, fees, payments or budget.",
      "Brands ke liye Ybex mein: verified creators dhundho (Explore, niche aur city se) · campaigns chalao (creators apply karte hain, aap chat mein negotiate karte ho) · UGC brief post karo · OTP se agreement sign karo · secure payment hold mein pay karke kaam approve hone par release karo · live link wapas pao. Kisi bhi step ke baare mein poocho — campaigns, UGC, fees, payment ya budget."
    ),
  },
  {
    key: "creatorwhat",
    rx: /\b(for creators?|creator ke liye|creators? (can|kya|ko kya)|what (can|do) creators|main creator hoon|i am a creator|i'm a creator|as a creator)\b/,
    ans: A(
      "For creators, Ybex lets you: build a profile and share it · complete KYC (PAN + bank/UPI) · find campaigns and UGC briefs and apply · negotiate offers in chat · sign the agreement with an OTP · upload your draft, then the live link after approval · get paid to your bank/UPI in 1–2 working days · earn through Refer & Earn.",
      "Creators ke liye Ybex mein: profile banao aur share karo · KYC karo (PAN + bank/UPI) · campaigns aur UGC briefs dhundh kar apply karo · chat mein offer negotiate karo · OTP se agreement sign karo · draft upload karo, approve hone ke baad live link · 1–2 working days mein bank/UPI mein payout · Refer & Earn se kamao."
    ),
  },
  {
    key: "about",
    rx: /\b(what is ybex|what'?s ybex|ybex kya hai|about ybex|ybex ke bare|ybex kaise kaam|how (does|do) ybex work|how ybex works|how (does|do) (this|the) (app|platform) work|ye app kya hai|app kaise kaam)\b/,
    ans: A(
      "Ybex is India's influencer marketplace where brands and creators work together safely. Brands post campaigns or UGC briefs, verified creators apply, you chat and agree a price, both sign an agreement with an OTP, and the payment sits in a secure payment hold until the work is approved — then the creator is paid. Ask me about brands, creators, fees, payouts, KYC or your budget.",
      "Ybex India ka influencer marketplace hai jahan brands aur creators safely saath kaam karte hain. Brands campaigns ya UGC briefs post karte hain, verified creators apply karte hain, chat mein price tay hota hai, dono OTP se agreement sign karte hain, aur kaam approve hone tak payment secure payment hold mein rehta hai — phir creator ko payout milta hai. Brands, creators, fees, payout, KYC ya budget ke baare mein poocho."
    ),
  },
];

const BUDGET_WORD = /\b(budget|bajet|spend|invest|kharch|kharcha|rupees?|rupay|rs)\b|₹/;
// v345 (tester: "I need to know about UGC" became a ticket for the team): "know about / learn about / info / samjhao /
// jaanna" are questions too.
const QUESTION = /\?|\b(how|what|which|when|where|can i|can we|could|kaise|kya|kab|kahan|kitna|kitne|batao|bata do|explain|tell me|process|steps?|works?|karna hai|karun|karu|chahiye|ho jayega|ho sakta|know about|knw about|learn about|info about|information|details? about|samjha\w*|jaan\w*)\b/;

const TAIL = {
  en: "\n\nAnything else about Ybex? Ask away — if this didn't help, say \"confusing\" and I'll note it for the team.",
  hi: "\n\nYbex ke baare mein aur kuch? Poochte raho — ye jawab kaam ka na lage to \"confusing\" likh do, main team ko note kar dunga.",
};
const ASK_BUDGET = {
  en: "Happy to plan it! Tell me your budget (like ₹50,000) and what you want — reels, UGC videos, a mix — and I'll give you a rough plan.",
  hi: "Zaroor! Apna budget bata do (jaise ₹50,000) aur kya chahiye — reels, UGC videos ya mix — main rough plan bata dunga.",
};
export const BUDGET_ASK = ASK_BUDGET;

/**
 * Answer a question about the Ybex app. → { reply, topic } or null (not an app question).
 *   opts.awaitingBudget: the bot just asked "how much is your budget?" — a bare amount is enough.
 */
export function knowledge(text, lang = "en", opts = {}) {
  const raw = String(text || "").trim();
  const n = nrm(raw);
  if (!n) return null;
  const L = lang === "hi" ? "hi" : "en";
  const amount = parseAmount(raw);
  const isQ = QUESTION.test(raw.toLowerCase()); // the raw text keeps the "?" that nrm() strips

  // Budget: an amount + a budget word / question, or the bot is waiting for the amount.
  if (amount != null && (opts.awaitingBudget || BUDGET_WORD.test(n) && (isQ || /\bbudget|bajet\b/.test(n)))) {
    if (amount < 500) return { reply: L === "hi" ? "Itne chhote budget se campaign nahi ban payega — kam se kam kuch hazaar rupaye ka budget bata do, to main plan bana dunga." : "That's too small for a campaign — tell me a budget of at least a few thousand rupees and I'll plan it.", topic: "budget" };
    return { reply: budgetPlan(amount, L) + TAIL[L], topic: "budget" };
  }
  if (/\b(budget|bajet)\b/.test(n) && isQ && amount == null) return { reply: ASK_BUDGET[L], topic: "budget-ask" };

  // v435: "is my money safe", "add my team member", "delete my account" — a yes/no question or a plain request on a
  // FAQ topic is answered too.
  const yesNoQ = /^(is|are|do|does|can|will|should|am|did|has|have)\b/.test(n);
  if (!isQ && !yesNoQ && n.split(" ").length > 3) {
    const t = TOPICS.find((x) => ["escrow", "refund", "support", "delete", "team", "cancel", "payless", "safety"].includes(x.key) && x.rx.test(n));
    return t ? { reply: t.ans[L] + TAIL[L], topic: t.key } : null; // other statements are not questions
  }
  // v435: the specific FAQs (cancel, refund, escrow…) win over the general ones ("cancel my campaign" isn't "how campaigns work").
  const FIRST = ["safety", "cancel", "refund", "escrow", "payless", "delete", "support", "team"];
  for (const t of [...TOPICS.filter((x) => FIRST.includes(x.key)), ...TOPICS.filter((x) => !FIRST.includes(x.key))]) {
    if (t.rx.test(n)) return { reply: t.ans[L] + TAIL[L], topic: t.key };
  }
  return null;
}
