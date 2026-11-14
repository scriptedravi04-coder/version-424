// Session 34 (Ravi, 7 Oct 2026): ONE source for every legal page and card.
// Public (landing footer, no login): Terms (short), Privacy Policy, Refunds (short).
// In-app: Common cards (both panels) + Creator rules (creator panel) + Brand rules (brand panel).
// Draft reviewed with Ravi in the "Ybex Media — Legal Pages (Rough Draft v1)" doc; a lawyer and a
// CA still review it before launch. Change text HERE only, and bump TERMS_VERSION when the Terms change.

export const LEGAL = {
  company: "Ybex Media",
  domain: "ybexmedia.in",
  site: "https://ybexmedia.in",
  city: "Jaipur",
  grievanceOfficer: "Ravi Sharma",
  emails: {
    support: "support@ybexmedia.in",
    legal: "legal@ybexmedia.in",
    privacy: "privacy@ybexmedia.in",
    grievance: "grievance@ybexmedia.in",
  },
  lastUpdated: "16 October 2026",
  termsVersion: "1.4",
  // Session 36: what changed in this version — shown once to every user who accepted an older one.
  termsChanges: [
    "New (v1.4): the fee taken from a creator's payout is now called \"Convenience fee & TDS\" everywhere (payout card, receipts, agreements). The amount and how it is worked out have not changed.",
    "New (v1.3): invite rewards — ₹21 for you and your friend when they complete their profile, ₹500 for each brand you bring that funds a ₹5,000+ deal, paid to your UPI from your Ybex wallet. See \"Referral and invite rewards\".",
    "Delivered files are kept for 15 days after approval (or cancellation), then deleted — download your copy in that time.",
    "Payment release: after the brand approves, Ybex sends the creator's payout to their bank or UPI, usually within 1–2 working days (not automatically).",
    "During offers the platform fee can be ₹0 with a small convenience fee instead. Any fee is always shown before you sign.",
    "New: the creator referral programme — invite creators for fee-free deals and a share of what they earn on Ybex.",
  ],
};

export const LEGAL_LINKS = {
  terms: "/info/terms",
  privacy: "/privacy-policy",
  refunds: "/info/refunds",
  creatorTerms: "/info/creator-terms",
  brandTerms: "/info/brand-terms",
};

const E = LEGAL.emails;

/** Each page = { title, intro, sections: [{ h, p?: string[], list?: string[] }] } */
export const PUBLIC_TERMS = {
  title: "Terms of Service",
  intro: `Ybex (the website ${LEGAL.domain} and the Ybex apps) is run by ${LEGAL.company}. By creating an account or using Ybex you agree to these Terms and our Privacy Policy.`,
  sections: [
    { h: "1. What Ybex is", p: [
      "Ybex is an online marketplace that connects brands and agencies (Brands) with content creators and influencers (Creators). Brands post campaigns and UGC briefs; Creators apply, agree deals, deliver content and get paid through Ybex.",
      "Ybex provides the platform and the secure payment hold. The deal itself is between the Brand and the Creator, and each is responsible for their own content, products and promises.",
    ] },
    { h: "2. Who can use Ybex", list: [
      "You must be 14 or older to use Ybex.", // v365 (Ravi: "14+ creators, parents ki permission ki need nahi")
      "If you sign up for a business, you confirm you are allowed to act for it.",
      "Give true details and keep them up to date. Keep your password and OTPs secret.",
    ] },
    { h: "3. Rules for everyone", list: [
      "No fake followers, fake engagement, fake reviews or false information.",
      "No illegal, hateful, obscene or harmful content, and nothing that promotes products the law does not allow to be advertised.",
      "Paid content must be clearly marked as an ad (for example #ad or the Paid partnership label), as required by ASCI and Government of India guidelines.",
      "Keep deals, payments and deal messages on Ybex. Do not share phone numbers or payment links in chat to take a deal outside Ybex.",
      "Do not misuse, copy or try to break the platform.",
    ] },
    { h: "4. Payments", p: [
      "Brands pay through our payment partner. The amount is kept in a secure payment hold and released to the Creator after the delivery is approved. A Convenience fee & TDS is deducted from the Creator's payout on completed deals (during offers, a ₹0 platform fee plus a small convenience fee instead); every Creator sees the fee and their payout before signing a deal. Refunds follow our Refund Policy.",
    ] },
    { h: "5. Suspension", p: [
      "We may limit, suspend or close accounts that break these Terms or the law, or that put other users at risk. You can close your account at any time once open deals are finished.",
    ] },
    { h: "6. Liability", p: [
      "Ybex is provided as it is. We are not responsible for what users post, sell or promise, or for campaign results. To the extent the law allows, our total liability for any claim is limited to the fees we received from you in the 3 months before the claim, and we are not liable for indirect losses.",
    ] },
    { h: "7. Grievance Officer", p: [
      `Grievance Officer: ${LEGAL.grievanceOfficer} · ${E.grievance}. We acknowledge complaints within 24 hours and aim to resolve them within 15 days.`,
    ] },
    { h: "8. Law and disputes", p: [
      `These Terms are governed by Indian law. Disputes with Ybex are first discussed in good faith; if not settled in 30 days they go to arbitration by a sole arbitrator seated in ${LEGAL.city}. Subject to that, courts at ${LEGAL.city} have jurisdiction.`,
    ] },
    { h: "9. Messages from Ybex", p: [
      "By creating an account you agree to get messages about your account, deals and payments, new campaigns that may suit you, and Ybex updates, by email, SMS, WhatsApp or in the app. Offers and promotions come too; you can switch them off in settings at any time. You can unsubscribe from update emails with the link in each email; account, deal, payment and security messages always come.",
    ] },
    { h: "10. Referral and invite rewards", list: [
      "Ybex may run invite offers. Unless an offer says otherwise: when a friend you invited completes their profile 100% (profile details, portfolio for creators, and approved KYC), you and your friend each get the reward shown in the app (now ₹21), up to the limit shown for you (now ₹1,000 in total).",
      "Invite a brand: when a brand you invited funds its first deal or UGC order of the amount shown in the app (now ₹5,000 or more), you get the brand-invite reward (now ₹500 per brand, for up to 10 brands) and, where shown, a few days of Featured placement. This reward unlocks only after you have completed the number of your own deals shown in the app (now 2).",
      "Words like \"earn up to\" in an offer mean the most one person can get under that offer — not the amount for each friend. The amount per friend, the limits and the conditions are always the ones shown on the Refer & Earn screen at the time your friend qualifies. Ybex may change, pause or end an offer at any time; rewards already earned stay yours.",
      "Rewards go to your Ybex wallet and are paid to the UPI ID on your account once your balance reaches the minimum shown (now ₹11). Rewards are not transferable and have no cash value outside Ybex until paid.",
      "Not counted: inviting yourself, the same person, email, phone, device or GST number, fake or duplicate accounts, or anything meant to game the programme. Ybex may hold, cancel or take back rewards where it finds misuse, and may close the accounts involved.",
      "Prizes (for example gadgets) are given only as described in that offer, subject to availability; Ybex may replace a prize with one of similar value. Taxes on rewards, if any, are the receiver's responsibility.",
    ] },
    { h: "11. Changes and contact", p: [
      `We may update these Terms and will tell you before important changes. Questions: ${E.support} · ${E.legal}.`,
    ] },
  ],
};

export const REFUND_POLICY = {
  title: "Refund & Cancellation Policy",
  intro: "How payments, refunds and cancellations work on Ybex.",
  sections: [
    { h: "Secure payment hold", p: [
      "Brands pay the agreed amount upfront. It is held and released to the Creator only after the Brand approves the delivery.",
    ] },
    { h: "Refunds to Brands", list: [
      "Deal cancelled by both sides before delivery: full refund.",
      "Creator misses the deadline and does not deliver: full refund (or a new date, if the Brand agrees).",
      "UGC brief: after 24 hours from posting, the Brand can cancel and get back the amount for slots no Creator has claimed.",
      "Delivered content that does not match the agreed brief: raise a dispute within 7 days; Ybex decides on release, refund or a split.",
      "Payments made outside Ybex are not covered.",
    ] },
    { h: "Timelines", p: [
      "Refunds go back to the original payment method, normally within 5–7 working days after approval (your bank may take longer). Failed or double payments: write to " + E.support + " with the payment ID.",
    ] },
    { h: "Contact", p: [`${E.support} · Grievance Officer ${LEGAL.grievanceOfficer}, ${E.grievance}`] },
  ],
};

export const PRIVACY_POLICY = {
  title: "Privacy Policy",
  intro: `${LEGAL.company} decides how your personal data on Ybex is used (Data Fiduciary under the Digital Personal Data Protection Act, 2023). Questions: ${E.privacy}.`,
  sections: [
    { h: "1. What we collect", list: [
      "Account: name, email, mobile number, password (stored encrypted), role.",
      "Google sign-in: name, email and photo from your Google account, if you use it.",
      // v334: Sign in with Apple is offered on iPhone / iPad — disclose what it shares.
      "Apple sign-in: name and email from your Apple ID (or the private relay email Apple creates if you choose \"Hide My Email\"), if you use it.",
      "Creator profile: photo, date of birth, gender, city, languages, niches, bio, social handles and audience numbers, rate card, portfolio.",
      "Brand profile: company details, logo, website, representative's name, designation and mobile, team members.",
      "Verification: Creators — PAN and bank or UPI details. Brands — one registered business document (for example GSTIN or PAN) and bank or UPI details. We do not collect Aadhaar.",
      "Deals: campaigns, briefs, applications, chat messages, offers, signed agreements, content and links.",
      "Payments: amounts and payment / payout references. Card and net-banking details are handled by our payment partner, not stored by us.",
      "Device and usage: IP address, device and browser, login sessions, pages used, cookies.",
    ] },
    { h: "2. Why we use it", list: [
      "Run your account and keep it secure (OTP, sessions).",
      "Show your profile to the other side of the marketplace and match Creators with Brands.",
      "Run deals, payments, payouts, refunds and receipts, and meet tax law.",
      "Verify users and prevent fraud and deals outside the platform.",
      "Answer support tickets and resolve disputes.",
      "Send messages about your account, deals and payments, new campaigns and Ybex updates — and offers and promotions, which you can switch off in settings.",
      "Improve Ybex and comply with the law.",
    ] },
    { h: "3. AI features", p: [
      "Some features use AI service providers to draft deal agreements and brief text from the details you agreed. Only the details needed for that task are sent, and people review and sign the result.",
    ] },
    { h: "4. Who we share it with", list: [
      "Other users, as the marketplace needs (your public profile; deal details with the other side of a deal). Brands never see a Creator's KYC or bank details.",
      "Service providers who work for us under contract: cloud hosting and database, payment gateway, email / SMS / messaging, sign-in and analytics, AI services, verification. The current list is available on request at " + E.privacy + ".",
      "Authorities, when the law requires it.",
      "We do not sell your personal data.",
    ] },
    { h: "5. How long we keep it", list: [
      "Account and profile: while your account is open, then deleted within 90 days of closing.",
      "Deals, chats and agreements: 3 years after the deal ends.",
      "Delivered video and image files: 15 days after the delivery is approved or the order is cancelled.",
      "Payment and tax records: 8 years, as accounting and tax law require.",
      "Verification documents: 5 years after the account closes, or as the law requires.",
    ] },
    { h: "6. Your rights", p: [
      `You can delete your account and personal data yourself at any time from Settings \u2192 Account \u2192 Delete account in the app, or at ybexmedia.in/delete-account. After you delete, you have 30 days to recover the account by writing to ${E.privacy}; after that it is removed for good. You can also ask for a summary of your data, correct it, turn off offers and promotions (settings), unsubscribe from update emails (link in each email), nominate someone to act for you, and complain to our Grievance Officer and then the Data Protection Board of India. Write to ${E.privacy} from your registered email; we reply within 30 days.`,
    ] },
    { h: "7. Security, cookies and children", p: [
      "We use encrypted connections, hashed passwords and OTPs and limited access. We use cookies to keep you signed in and to measure use. To measure our ads and sign-ups we use Google Analytics and the Meta Pixel, which send pages visited and steps completed (for example “signed up”) to Google and Meta — never your name, email, phone or Instagram handle. You can block these with your browser's privacy settings or an ad blocker. Ybex is for people aged 14 or older.",
    ] },
    { h: "8. Contact", p: [`${E.privacy} · Grievance Officer ${LEGAL.grievanceOfficer}, ${E.grievance}`] },
  ],
};

/** In-app cards. `role` = "common" | "creator" | "brand". */
export const IN_APP_CARDS = [
  { role: "common", h: "Verification (KYC)", p: "Creators verify with PAN and bank or UPI details. Brands verify with one registered business document (GSTIN, PAN or similar) and bank or UPI details. Payouts and payments can wait until verification is complete." },
  { role: "common", h: "Taxes", p: "Each user handles their own income tax and GST. Ybex deducts tax at source where the law requires and shares the details." },
  { role: "common", h: "Messages from Ybex", p: "By using Ybex you get messages about your account, deals and payments, new campaigns and Ybex updates — they are part of the service. Offers and promotions are on by default; switch them off in settings any time. Every update email has an unsubscribe link." },
  { role: "common", h: "Disputes", p: "Either side can raise a dispute from the deal within 7 days. Ybex reviews the chat, agreement, brief and content, and decides how the held amount is released or refunded." },
  { role: "common", h: "Deleting your account", p: "Delete your account any time from Settings \u2192 Account \u2192 Delete account, or at ybexmedia.in/delete-account. Open deals, payment holds and disputes are finished first. Your profile, chats and saved payout details are removed; payment and invoice records are kept for tax, with your name removed. You have 30 days to recover before it is permanent." },
  { role: "common", h: "Referrals and ratings", p: "Referral rewards are paid only for genuine new users. Ratings and reviews must be honest and based on a real deal." },
  { role: "creator", h: "Applying and deadlines", p: "Apply or accept only if you can deliver on time. Missing a deadline can cancel the order (UGC) or lead to a refund to the Brand, and lowers your rank." },
  { role: "creator", h: "Delivering content", p: "Deliver what the deal agreement says. Revisions within the agreed brief are part of the deal; anything extra needs your agreement. Live posts stay up for the agreed period (at least 30 days if none is agreed)." },
  { role: "creator", h: "Getting paid", p: "Your payout is released after the Brand approves the delivery and reaches your bank or UPI, usually within 1–2 working days. A Convenience fee & TDS is deducted (during offers, the offer rate applies); you always see it before you sign." },
  { role: "creator", h: "Delivered files", p: "Files you deliver are kept for 15 days after the Brand approves them (or the order is cancelled), then deleted. Keep your own copy." },
  { role: "creator", h: "Referral programme", p: "Invite creators with your link. Rewards (fee-free deals, a Featured period, and a share of what the creators you invited earn on Ybex (after the Convenience fee & TDS), paid by Ybex and capped per creator) are shown in Invite creators, with the full rules in How it works. Self-referrals, duplicate or fake accounts are not counted. Share balances can be withdrawn to your payout account above a minimum amount. Ybex may change or end the programme; rewards already earned stay." },
  { role: "creator", h: "Ad disclosure", p: "Every paid post made through Ybex must be marked as an ad (#ad, #collab or the Paid partnership label)." },
  { role: "creator", h: "Your content", p: "You own your content. After a paid deal, the Brand may use it as the agreement says — if it says nothing, on the Brand's own organic social media for 12 months. Paid ads or other uses need your consent." },
  { role: "brand", h: "Posting campaigns and briefs", p: "Describe the product, deliverables, platform, timeline and budget honestly. Do not ask for misleading, illegal or unsafe content, or for the ad label to be hidden." },
  { role: "brand", h: "Paying and the secure payment hold", p: "You pay the agreed amount upfront — zero platform fee for brands. It is held and released to the Creator only after you approve the delivery." },
  { role: "brand", h: "Reviews and revisions", p: "Review drafts and live links in time. Ask for revisions only within the agreed brief." },
  { role: "brand", h: "Refunds and cancellations", p: "Full refund if both sides cancel before delivery or the Creator does not deliver. UGC brief slots nobody has claimed can be refunded 24 hours after posting. See the Refund Policy for the full table." },
  { role: "brand", h: "Using the content", p: "You may use delivered content as the deal agreement says — if it says nothing, on your own organic social media for 12 months. Paid ads or edits beyond the brief need the Creator's consent." },
  { role: "brand", h: "Downloading delivered files", p: "Delivered files are kept for 15 days after you approve them (or the order is cancelled), then deleted. Please download them in that time. Your right to use the content does not change." },
  { role: "brand", h: "Hiring outside Ybex", p: "For 12 months after you meet a Creator on Ybex, hire them for paid content through Ybex — not outside it." },
  { role: "brand", h: "Team members", p: "Your brand is responsible for what its team members do on Ybex." },
];

/** Full creator / brand rules pages (accepted at the last onboarding step). */
export const roleTermsPage = (role) => ({
  title: role === "brand" ? "Brand Terms" : "Creator Terms",
  intro: `These rules apply to ${role === "brand" ? "Brands" : "Creators"} on Ybex, together with the Terms of Service and the Privacy Policy.`,
  sections: IN_APP_CARDS.filter((c) => c.role === role || c.role === "common").map((c) => ({ h: c.h, p: [c.p] })),
});
