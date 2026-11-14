// Session 54: Eva for creators — decides what to do with one message and returns { reply, card?, state }, or
// null when it isn't a creator task (then the old helper answers: hi / thanks / bug / idea / budget).
// Order: a question we are in the middle of → rules → AI (only for real questions).
import { classify, detectLang } from "../../feedback/assistBrain";
import { inr, knowledge } from "../../feedback/assistKnowledge";
import { CLEAR_CHAT, NEW_CHAT, nichesIn } from "../brand/brandLogic";
import {
  detectCreatorIntent, applyCount, profileScore, rateAdvice, earningsSummary, dueItems, insightLines, pitchFor,
  suggestedAmount, explainBrief, draftChecklist, growthIdeas, nicheGroupsOfMe, nichesOfMe, followersOfMe, reachOfMe,
  fairQuote, quoteCheck, myRates, fairRates, shortNum, applyAmount, pickByName, applyTarget, campaignFiltersIn, applyCampaignFilters, splitRequests, editRequest, editFallback, isReportText, reportClearsIntent, // v328: Indian-style shortNum; apply amount / name
  dealLines, ugcLines, rateFormat, reachFromText, fairFor, writeMode, topicFrom, hashtagsFor, captionFor, // v419
  missingFill, fillQuestion, parseFill, fillsInText, paymentLines, monthReport, AGREEMENT_SIMPLE, contractFlags, contentPlan, brandReplyKind, brandReplyDraft,
} from "./creatorLogic";
import * as T from "./tools";
import { getInboxChip } from "../../chat/mobile/chatStageMap";
import { CREATOR_POPULAR, CREATOR_MORE } from "./capsChips";
import * as M from "../brand/memory";
import { readEvaSettings, blockedSwitch, blockedReply } from "../../feedback/evaSettings";

export const initialCreatorState = () => ({ awaiting: null, last: null, page: 0 });
const say = (lang, en, hi) => (lang === "hi" ? hi : en);
const WA_NUMBER = "918764004299";

export const CREATOR_CAPS = [
  "Find campaigns & UGC briefs that fit you, and apply in one tap",
  "Show brand invitations — accept or decline with a reason",
  "Tell you when new matching campaigns go live (phone notification)",
  "Show what brands want right now and what they pay",
  "Write hooks, scripts, captions, your bio and portfolio text",
  "Explain a brief and give you a checklist before you submit",
  "Check your profile score and your fair rate",
  "Your earnings, pending payouts and what's due",
  "KYC / payout help, refer a friend, a card to share your win",
  "Fill your missing profile details right here — I save them for you",
  "When your money arrives, your monthly report, a 7-day content plan",
  "Explain an agreement, check a contract for red flags, write your reply to a brand",
];

/** First thing when a creator opens the chat: what's due + new matching work + profile nudge. */
export async function onOpen() {
  const out = [];
  try {
    // Session 58 (Eva handoff part 3): English by default; brand invitations come first.
    const dealsOn = !blockedSwitch("creator", "due", readEvaSettings()); // "Deals & offers" off → no invites / due items
    const [{ profile, kyc, hasPayout: hp, payoutUnknown, money }, work, invites] = await Promise.all([T.loadMe(), T.loadWork(), dealsOn ? T.loadInvites() : []]);
    const hasPayout = hp || Boolean(payoutUnknown); // v332: couldn't read → don't nag "add bank / UPI"
    if (invites.length) out.push({ reply: invites.length > 1 ? `${invites.length} brands invited you:` : `${invites[0].brand_name || "A brand"} invited you:`, card: { type: "invites", items: invites.slice(0, 5) } });
    const due = dealsOn ? dueItems({ orders: work.orders, applications: work.applications }) : [];
    if (due.length) out.push({ reply: due.length > 1 ? `${due.length} things are waiting for you:` : "1 thing is waiting for you:", card: { type: "due", items: due } });
    const { list } = await T.opportunities();
    const fresh = list.filter((o) => !o.applied && o.score >= 60).slice(0, 3);
    if (fresh.length) out.push({ reply: fresh.length > 1 ? `${fresh.length} new opportunities match you:` : "1 new opportunity matches you:", card: { type: "opps", items: fresh, total: fresh.length } });
    const ps = profileScore(profile, { kyc, hasPayout, money }); // v328: no KYC / payout items when "Earnings & payouts" is off
    if (ps.score < 70) out.push({ reply: `Your profile is ${ps.score}% complete — finish it and brands will invite you more.`, card: { type: "profile", score: ps } });
    else if (missingFill(profile).length) out.push({ reply: `${missingFill(profile).length} details brands search by are missing from your profile — I can fill them here in a minute.`, card: { type: "chips", send: "value", chips: [{ label: "Fill them now ✨", value: "Complete my profile in chat" }] } }); // v419
  } catch { /* nothing to show */ }
  return out;
}

/** One creator message → { reply, card?, state } | null */
export async function handleCreatorMessage(text, state = initialCreatorState(), opts = {}) {
  // v438 (Eva deep test #6): "make it shorter / hindi mein likho / for Nykaa…" edits her last text instead of starting over.
  if (state?.lastText && !state?.awaiting && editRequest(text)) {
    const setLang = readEvaSettings().lang;
    const lang = setLang === "hinglish" || setLang === "hi" ? "hi" : detectLang(text);
    const ai = await T.askAi("text", `Rewrite the text below exactly as asked: "${text}". Keep its sections and labels; change only what is asked. Return only the new text — no intro line like "Here's…".`, { history: opts.history || [], context: { text_to_change: state.lastText } });
    const out = String(ai?.text || ai?.reply || "").trim().replace(/^(here('s| is)|sure|ok(ay)?|ye(h)? (raha|lo))[^\n]{0,80}:\s*\n/i, "").trim() || editFallback(state.lastText, text);
    const changed = out && out !== state.lastText;
    return { reply: changed ? say(lang, "Changed it:", "Badal diya:") : say(lang, "I couldn't change it right now (AI is busy) — here it is again, edit it as you like:", "Abhi badal nahi paayi (AI busy hai) — ye raha, jaisa chaho edit kar lo:"), card: { type: "copy", text: out || state.lastText, title: state.lastTitle || say(lang, "Text", "Text") }, state: { ...state, lastText: out || state.lastText } };
  }
  const r0 = await handleCreatorMessageInner(text, state, opts);
  // remember Eva's last text (pitch, script, caption, bio, reply) so a follow-up can change it
  if (r0 && r0.card && r0.card.type === "copy" && r0.card.text) r0.state = { ...(r0.state || state), lastText: String(r0.card.text).slice(0, 3000), lastTitle: r0.card.title || "" };
  else if (r0 && r0.state && r0.card) r0.state = { ...r0.state, lastText: null };
  return r0;
}
async function handleCreatorMessageInner(text, state = initialCreatorState(), opts = {}) {
  // v435 (Eva question test #12): several requests in one message are done one after another.
  const parts = !state?.awaiting ? splitRequests(text) : null;
  if (parts) {
    const out = [];
    let st0 = state;
    for (const part of parts) {
      const r = await handleOne(part, st0, opts).catch(() => null);
      if (r && r.reply) { out.push(r); st0 = r.state || st0; }
    }
    if (out.length) return { ...out[0], state: st0, more: out.slice(1).map((r) => ({ reply: r.reply, card: r.card })) };
  }
  return handleOne(text, state, opts);
}
async function handleOne(text, state = initialCreatorState(), { history = [], name = "", chatId = null } = {}) {
  // v328: Eva settings language — "en" follows how the user writes (Hinglish in → Hinglish out); Hinglish / Hindi → "hi".
  const setLang = readEvaSettings().lang;
  const lang = setLang === "hinglish" || setLang === "hi" ? "hi" : detectLang(text);
  const st = { ...state };
  const kind = classify(text);
  const isReport = isReportText(kind, text); // v328: moved to creatorLogic (same rule) so it can be tested

  // Session 58: "new chat" opens a fresh chat; the old one is kept (it used to be deleted).
  if (NEW_CHAT.test(text.trim())) return { reply: say(lang, "Fresh chat started. What do you need?", "Nayi chat shuru. Batao kya chahiye?"), newChat: true, state: initialCreatorState() };
  if (CLEAR_CHAT.test(text.trim())) {
    const ok = await M.clearHistory(chatId);
    return { reply: ok ? say(lang, "Done — this chat is cleared.", "Ho gaya — ye chat saaf kar di.") : say(lang, "Couldn't clear the chat right now.", "Abhi chat saaf nahi ho payi."), clearScreen: ok, state: initialCreatorState() };
  }

  // v419 (Ravi): filling the profile in chat — each answer is saved right away, then the next question.
  if (st.awaiting === "fill" && st.fill?.queue?.length) {
    const field = st.fill.queue[0];
    const tt = text.trim().toLowerCase();
    if (/^(stop|cancel|band karo|rehne do|baad mein|later|chhodo sab|bas)\b/.test(tt)) return { reply: say(lang, "Okay, stopped. Say \"complete my profile\" any time to continue.", "Theek hai, rok diya. Kabhi bhi \"profile complete karo\" bolo, wahin se aage karenge."), state: { ...st, awaiting: null, fill: null } };
    if (/^(skip|chhodo|next|aage|pata nahi|nahi batana|no thanks)\b/.test(tt)) return fillNext({ ...st, fill: { ...st.fill, queue: st.fill.queue.slice(1) } }, lang, say(lang, "Skipped.", "Chhod diya."));
    const got = parseFill(field, text);
    if (got) {
      const ok = await T.saveProfileFields(got.payload);
      if (!ok) return { reply: say(lang, "I couldn't save that just now — check your internet and send it again.", "Abhi save nahi ho paya — internet check karke dobara bhejo."), state: st };
      return fillNext({ ...st, fill: { ...st.fill, queue: st.fill.queue.slice(1), saved: [...(st.fill.saved || []), got.show] } }, lang, say(lang, `Saved ✅ ${got.show}`, `Save ho gaya ✅ ${got.show}`));
    }
    const other = detectCreatorIntent(text);
    if (!other || other.intent === "fillProfile") {
      const q = fillQuestion(field, lang);
      const hint = field === "dob" ? say(lang, "I couldn't read that date — write it like \"10 May 2001\" or \"10/05/2001\".", "Ye date samajh nahi aayi — aise likho: \"10 May 2001\" ya \"10/05/2001\".") : say(lang, "I didn't get that.", "Ye samajh nahi aaya.");
      return { reply: `${hint} ${q.text}`, card: { type: "chips", send: "value", chips: [...q.chips.map((c) => ({ label: c, value: c })), { label: say(lang, "Skip", "Skip"), value: "skip" }] }, state: st };
    }
    st.awaiting = null; st.fill = null; // she asked something else — answer that
  }

  // A brief / script request we asked a follow-up for.
  if (st.awaiting === "scriptProduct") {
    st.awaiting = null;
    return writeScript(text, st, lang, history);
  }
  if (st.awaiting === "briefText") {
    st.awaiting = null;
    const e = explainBrief({ detailed_requirements: text, title: "Your brief" });
    return { reply: say(lang, "Here's the brief in simple words, plus a checklist:", "Brief simple bhasha mein, aur checklist:"), card: { type: "brief", brief: e, checklist: draftChecklist({}) }, state: st };
  }

  // "aur dikhao" → the next page of opportunities
  if (st.last === "opps" && /^(aur|more|aur dikhao|aur bhi|show more|see more|next|aage)\b/i.test(text.trim())) {
    const got = await T.opportunities({ ugcOnly: Boolean(st.ugcOnly), niches: st.niches || (st.cf ? "all" : null) }); // v328: keep the UGC-only filter (v431: and the asked niche)
    const list = st.cf ? applyCampaignFilters(got.list, st.cf) : got.list; // v435: and city / budget / barter
    const from = (st.page + 1) * 6;
    const items = list.slice(from, from + 6);
    if (!items.length) return { reply: say(lang, "That's everything live for you right now.", "Abhi ke liye itna hi live hai."), state: st };
    return { reply: say(lang, `${from + 1}–${from + items.length} of ${list.length}:`, `${list.length} mein se ${from + 1}–${from + items.length}:`), card: { type: "opps", items, total: list.length, shown: from + items.length }, state: { ...st, page: st.page + 1 } };
  }

  let hit = detectCreatorIntent(text);
  // A real bug report still goes to the team; "rate kitna hona chahiye" is a question, not a feature idea.
  // v328: a feature idea ("please add …") also goes to the team, not the caps card (see reportClearsIntent).
  if (hit && reportClearsIntent(kind, text)) hit = null;
  // v435 (Eva question test #2/#4): a Ybex FAQ (escrow, refund, fees, KYC, delete account, support…) gets the fixed
  // answer right away — no AI wait, and it works when the AI is down.
  if (!hit && !isReport) { const kb = knowledge(text, lang, { role: "creator" }); if (kb && kb.topic !== "budget-ask") return { reply: kb.reply, state: st }; }
  let aiFailed = false; // v397: the first AI call for this message gave no answer
  if (!hit && !isReport && kind.type !== "chat" && text.trim().length > 6) {
    const ai = await T.askAi("creator_understand", text, { history });
    if (!ai) aiFailed = true;
    if (ai?.intent && ai.intent !== "other") hit = { intent: ai.intent, ai };
    else if (ai?.reply) return { reply: String(ai.reply).slice(0, 1000), state: st };
  }
  if (!hit) {
    // v397 (AI Studio): no rule matched → Eva answers with the real AI (not asked twice when the first call failed).
    if (!isReport && !aiFailed && kind.type !== "feedback" && text.trim().length > 1) {
      const chatReply = (await T.askAi("chat", text, { history }))?.reply;
      if (chatReply) return { reply: String(chatReply).slice(0, 1000), state: st };
    }
    return null;
  }
  // Session 58 (Eva settings): a switched-off permission means Eva doesn't read that data.
  const off = blockedSwitch("creator", hit.intent);
  if (off) return { reply: blockedReply("creator", off), card: { type: "evaSettings" }, state: st };
  // v329: any other answer ends the "Show more" paging — "more" after a rate question used to page old campaigns.
  if (hit.intent !== "campaigns") st.last = null;

  switch (hit.intent) {
    case "caps":
      // v333: one short line + popular chips + "Show more" (Eva design §8b), not the long ✓ box.
      return { reply: say(lang, "I find brand deals for you, write scripts and bios, check your rate and keep track of your money. Popular:", "Main aapke liye brand deals dhoondhti hoon, script aur bio likhti hoon, rate check karti hoon aur paison ka hisaab rakhti hoon. Popular:"), card: { type: "chips", send: "value", chips: CREATOR_POPULAR, more: CREATOR_MORE }, state: st };

    case "campaigns": {
      // v431 (Eva audit #5/#7): "beauty campaigns" → beauty, whatever the profile says; no niche on the profile → all + a nudge.
      const askedNiche = nichesIn(text);
      const cf = campaignFiltersIn(text); // v435 (Eva question test #7): city / budget / barter in the message
      const hasCf = Boolean(cf.city || cf.min || cf.max || cf.barter);
      const got = await T.opportunities({ ugcOnly: Boolean(hit.ugcOnly), niches: askedNiche.length ? askedNiche : (hasCf ? "all" : null) });
      const profile = got.profile;
      const list = hasCf ? applyCampaignFilters(got.list, cf) : got.list;
      const open = list.filter((o) => !o.applied);
      const noNiche = !askedNiche.length && !nichesOfMe(profile || {}).length;
      const label = [askedNiche.join(" / "), cf.barter === "barter" ? "barter" : cf.barter === "paid" ? "paid" : "", cf.city ? `in ${cf.city}` : "", cf.min ? `above ${inr(cf.min)}` : "", cf.max ? `under ${inr(cf.max)}` : ""].filter(Boolean).join(" ");
      const setNiche = { type: "chips", send: "value", chips: [{ label: say(lang, "Set my niche ✨", "Niche set karo ✨"), value: "Complete my profile in chat" }] };
      if (!list.length) {
        if (askedNiche.length || hasCf) return { reply: say(lang, `No live ${label} campaign right now. Turn on alerts and I'll tell you the moment one goes live.`, `Abhi koi live ${label} campaign nahi hai. Alert on kar do — naya aate hi bata dungi.`), card: { type: "alertToggle" }, state: st };
        if (noNiche) return { reply: say(lang, "No live campaign right now. Add your niche (beauty, food, tech…) so I can match you the moment one goes live.", "Abhi koi live campaign nahi hai. Apna niche (beauty, food, tech…) add kar do — match aate hi bata dungi."), card: setNiche, state: st };
        return { reply: say(lang, "No live campaign matches your niche right now. Turn on alerts and I'll tell you the moment one goes live.", "Abhi aapke niche ka koi live campaign nahi hai. Alert on kar do — naya aate hi bata dungi."), card: { type: "alertToggle" }, state: st };
      }
      const applied = list.length > open.length;
      const head = (askedNiche.length || hasCf)
        ? say(lang, `${open.length} ${label} open${applied ? ` (+${list.length - open.length} already applied)` : ""}. Best match first:`, `${open.length} ${label} khule hain${applied ? ` (+${list.length - open.length} pe apply ho chuka)` : ""}. Sabse achha match pehle:`)
        : noNiche
          ? say(lang, `${open.length} open right now. Add your niche and I'll show the best fits first:`, `Abhi ${open.length} khule hain. Niche add karo to sabse sahi wale pehle dikhaungi:`)
          : say(lang, `${open.length} open for you${applied ? ` (+${list.length - open.length} already applied)` : ""}. Best match first:`, `Aapke liye ${open.length} khule hain${applied ? ` (+${list.length - open.length} pe apply ho chuka)` : ""}. Sabse achha match pehle:`);
      return { reply: head, card: { type: "opps", items: list.slice(0, 6), total: list.length, shown: Math.min(6, list.length) }, state: { ...st, last: "opps", page: 0, ugcOnly: Boolean(hit.ugcOnly), niches: askedNiche.length ? askedNiche : null, cf: hasCf ? cf : null } }; // v328: remembered for "Show more"
    }

    case "pitch": {
      // v431 (Eva audit #6): a pitch for the campaign she names (brand or title), else her best open match.
      const { list, profile } = await T.opportunities({ campaignsOnly: true });
      const named = pickByName(list, text);
      const brandWord = (String(text).match(/\bfor (?:the |a |an |my )?([a-z0-9&'.-]+)/i) || [])[1];
      const generic = !brandWord || /^(this|that|campaign|brand|brands|it|me|ugc|reel|collab)$/i.test(brandWord);
      const opp = named || (generic ? list.find((o) => !o.applied) : null);
      const target = opp || { title: brandWord ? `${brandWord.replace(/\b\w/g, (c) => c.toUpperCase())} campaign` : "your campaign" };
      const draft = pitchFor(target, profile || {});
      const lead = opp || generic
        ? say(lang, `A pitch for "${target.title}"${opp?.brand ? ` by ${opp.brand}` : ""} — edit anything, then apply:`, `"${target.title}"${opp?.brand ? ` (${opp.brand})` : ""} ke liye pitch — kuch bhi badal lo, phir apply karo:`)
        : say(lang, `I couldn't find a live "${brandWord}" campaign, so here's a pitch you can adapt:`, `"${brandWord}" ka live campaign nahi mila, ye pitch apne hisaab se badal lo:`);
      return { reply: lead, card: { type: "copy", text: draft, title: say(lang, "Pitch", "Pitch") }, state: st };
    }

    case "apply": {
      const { list, profile } = await T.opportunities({ campaignsOnly: true });
      const n = applyCount(text);
      // v328: a named brand / title → that campaign; an amount in the message → the quote.
      let named = pickByName(list.filter((o) => !o.applied), text);
      // v435 (Eva question test #6): "apply to Nykaa with 5000" — Nykaa may be outside her niche list; look at every
      // live campaign, and never fill a different brand's campaign when the one she named isn't there.
      const target = applyTarget(text);
      if (!named && target) {
        const all = (await T.opportunities({ campaignsOnly: true, niches: "all" })).list;
        named = pickByName(all.filter((o) => !o.applied), text);
        const doneAll = !named && pickByName(all.filter((o) => o.applied), text);
        if (doneAll) return { reply: say(lang, `You've already applied to "${doneAll.title}" by ${doneAll.brand}.`, `"${doneAll.title}" (${doneAll.brand}) pe aap pehle hi apply kar chuke ho.`), state: st };
        if (!named) return { reply: say(lang, `I couldn't find a live campaign by "${target}" right now. Want to see the campaigns that are open for you?`, `"${target}" ka koi live campaign abhi nahi mila. Aapke liye khule campaigns dikhaun?`), card: { type: "chips", send: "value", chips: [{ label: say(lang, "Show campaigns", "Campaigns dikhao"), value: "Show campaigns for me" }] }, state: st };
      }
      // v329: "apply to boAt" when boAt is already applied → say so (it used to fill a different campaign).
      const namedDone = !named && pickByName(list.filter((o) => o.applied), text);
      if (namedDone) return { reply: say(lang, `You've already applied to "${namedDone.title}" by ${namedDone.brand}. It shows in your to-do once the brand accepts you.`, `"${namedDone.title}" (${namedDone.brand}) pe aap pehle hi apply kar chuke ho. Brand accept kare to to-do mein dikhega.`), state: st };
      const picks = named ? [named] : list.filter((o) => !o.applied).slice(0, n);
      const asked = applyAmount(text);
      if (!picks.length) return { reply: say(lang, "Nothing new to apply for right now — you've applied to everything that matches.", "Abhi apply karne ko kuch naya nahi hai — jo match karta tha sab pe apply ho chuka."), state: st };
      // v438 (Eva deep test #7): the card said "Send application" and the send was then refused — check first.
      const me0 = await T.loadMe().catch(() => ({}));
      if (!(me0?.user?.onboarded || me0?.profile?.onboarded || me0?.profile?.onboarding_complete)) {
        return { reply: say(lang, "Finish your profile first — brands see it before they accept you. I can fill the missing details with you right here.", "Pehle profile poori karo — brand accept karne se pehle wahi dekhte hain. Missing details main yahin aapke saath bhar deti hoon."), card: { type: "chips", send: "value", chips: [{ label: say(lang, "Complete my profile", "Profile poori karo"), value: "Complete my profile in chat" }] }, state: st };
      }
      if (me0?.money !== false && me0?.kycRaw && !/approved|verified/.test(String(me0.kyc || ""))) {
        return { reply: say(lang, "Your KYC isn't verified yet — brands can only pay verified creators. Finish KYC and I'll fill the application for you.", "Aapka KYC abhi verified nahi hai — brand sirf verified creators ko pay kar sakte hain. KYC pura karo, phir main application bhar dungi."), card: { type: "steps", items: [{ text: say(lang, "KYC: PAN + bank / UPI", "KYC: PAN + bank / UPI"), link: "/settings?section=kyc&from=eva", cta: say(lang, "Open KYC", "KYC kholo") }] }, state: st };
      }
      const reach = fairRates(profile).reach;
      const items = picks.map((o) => ({ ...o, pitch: pitchFor(o, profile), amount: asked || suggestedAmount(o, profile), reach }));
      return { reply: say(lang, `I filled ${items.length > 1 ? "these" : "this"} for you — check the pitch and quote, then tap Send application.`, "Maine bhar diya — pitch aur quote dekh lo, phir Send application dabao."), card: { type: "apply", items }, state: st };
    }

    case "alertsOn": {
      const { profile } = await T.loadMe();
      const ok = await T.setCampaignAlerts(true, profile);
      return { reply: ok ? say(lang, "Done — when a campaign or UGC brief that fits you goes live, you'll get a phone notification.", "Ho gaya — aapke match ka campaign ya UGC brief live hote hi phone pe notification aayega.") : say(lang, "Couldn't turn alerts on right now. Try again in a bit.", "Abhi alert on nahi ho paya, thodi der mein try karo."), state: st };
    }
    case "alertsOff": {
      const ok = await T.setCampaignAlerts(false);
      return { reply: ok ? say(lang, "Alerts are off.", "Alerts band kar diye.") : say(lang, "Couldn't change it right now.", "Abhi badal nahi paya."), state: st };
    }

    case "insights": {
      const [ins, { profile }] = await Promise.all([T.loadInsights(), T.loadMe()]);
      return { reply: say(lang, "What brands on Ybex are asking for right now:", "Ybex pe brands abhi ye maang rahe hain:"), card: { type: "insights", lines: insightLines(ins || {}, profile) }, state: st };
    }

    case "invoice": {
      // v419 (Ravi): the free invoice maker opens full screen; it reads her profile / KYC / deals itself.
      const list = /\b(my|meri|mere|all)\s+invoices?\b|\binvoice (history|list)\b/i.test(text);
      return { reply: list ? say(lang, "Opening your invoices.", "Tumhari invoices khol rahi hoon.") : say(lang, "Let's make your invoice — free, saved to your account, ready as PDF or JPG.", "Chalo invoice banate hain — free, account mein save, PDF ya JPG mein ready."), card: { type: "invoice", auto: true, text, role: "creator", view: list ? "list" : null }, state: st };
    }

    case "fillProfile": {
      // v419 (Ravi): "DOB missing hai" → Eva asks for it here and saves it to the profile herself.
      const direct = fillsInText(text);
      const saved = [];
      for (const [, r] of direct) { if (await T.saveProfileFields(r.payload)) saved.push(r.show); }
      const { profile } = await T.loadMe(true);
      const queue = missingFill(profile);
      const lead = saved.length ? say(lang, `Saved ✅ ${saved.join(" · ")}`, `Save ho gaya ✅ ${saved.join(" · ")}`) : "";
      if (!queue.length) return { reply: `${lead ? `${lead}${/[.!?]$/.test(lead) ? "" : "."} ` : ""}${say(lang, "Your profile has every detail brands search by. 🎉", "Brands jo details dhoondhte hain, wo sab aapki profile mein hain. 🎉")}`, state: { ...st, awaiting: null, fill: null } };
      return fillNext({ ...st, fill: { queue, saved } }, lang, lead || say(lang, `${queue.length} detail${queue.length > 1 ? "s" : ""} missing — brands search by these. I'll save each answer for you.`, `${queue.length} details missing hain — brands inhi se dhoondhte hain. Har jawab main khud save kar dungi.`));
    }

    case "payWhen": {
      const [{ kyc, payoutUnknown }, money] = await Promise.all([T.loadMe(true), T.loadMoney()]);
      if (money.failed) return { reply: say(lang, "I couldn't check your payments just now — your money is safe. Ask me again in a minute.", "Abhi payments check nahi ho paye — paise safe hain. Ek minute baad phir poochho."), state: st };
      const items = paymentLines(money.txns, { kycOk: payoutUnknown || /approved|verified/.test(kyc) });
      if (!items.length) return { reply: say(lang, "No payment is on the way yet — once a brand pays for a deal, I'll show exactly when it reaches you.", "Abhi koi payment aane wala nahi hai — jaise hi brand deal ka paisa daalega, main exact bataungi kab aayega."), card: { type: "chips", send: "value", chips: [{ label: say(lang, "Find campaigns", "Campaigns dhundo"), value: "Show campaigns for me" }] }, state: st };
      const coming = items.filter((x) => x.tone !== "done").reduce((a, x) => a + x.amount, 0);
      return { reply: coming ? say(lang, `${inr(coming)} is on its way to you:`, `${inr(coming)} aapke paas aa raha hai:`) : say(lang, "Everything's paid — your recent payouts:", "Sab paisa aa chuka hai — haal ke payouts:"), card: { type: "steps", items }, state: st };
    }

    case "monthReport": {
      const [{ profile }, money, work, threads] = await Promise.all([T.loadMe(), T.loadMoney(), T.loadWork(), T.loadThreads()]);
      const r = monthReport({ txns: money.txns, applications: work.applications, orders: work.orders, threads: threads || [], profile });
      const mName = new Date(`${r.month}-01T00:00:00Z`).toLocaleString("en-IN", { month: "long", timeZone: "UTC" });
      return { reply: say(lang, `Your ${mName} report:`, `Aapki ${mName} ki report:`), card: { type: "steps", items: [...r.lines.map((l) => ({ text: l })), ...r.tips.map((l) => ({ text: `💡 ${l}` }))] }, state: st };
    }

    case "agreement": {
      // A pasted contract (long text) → red flags; otherwise Ybex's own agreement in simple words.
      const pasted = text.length > 220;
      if (pasted) {
        const flags = contractFlags(text);
        const ai = await T.askAi("text", `Explain this contract to an Indian creator in simple ${lang === "hi" ? "Hinglish" : "English"}, in 6 short points, and list anything risky:\n\n${text.slice(0, 4000)}`, { history: [] });
        const body = String(ai?.text || "").trim();
        return { reply: flags.length ? say(lang, `I found ${flags.length} thing${flags.length > 1 ? "s" : ""} to check before you sign:`, `Sign karne se pehle ye ${flags.length} points check karo (sign se pehle):`) : say(lang, "No big red flags in this text. Still confirm the amount, deadline, revisions and usage period in writing.", "Isme koi bada khatra nahi dikha. Phir bhi amount, deadline, revisions aur usage period likhit mein confirm karo."), card: flags.length || body ? { type: "steps", items: [...flags.map((f) => ({ text: `⚠️ ${f}`, urgent: true })), ...(body ? [{ text: body.slice(0, 1200) }] : [])] } : undefined, state: st };
      }
      return { reply: say(lang, "Your Ybex agreement in simple words:", "Ybex agreement simple bhasha mein:"), card: { type: "steps", items: AGREEMENT_SIMPLE[lang === "hi" ? "hi" : "en"].map((l) => ({ text: `• ${l}` })) }, state: { ...st, awaiting: null } };
    }

    case "plan": {
      const [{ profile }, work] = await Promise.all([T.loadMe(), T.loadWork()]);
      const due = (work.orders || []).map((o) => ({ title: o.brief?.title || o.title, due: o.sla_deadline || o.internal_deadline || o.deadline })).filter((x) => x.due);
      const p = contentPlan(profile, Date.now(), due);
      return { reply: say(lang, `Your 7-day plan as a ${p.niche.toLowerCase()} creator:`, `${p.niche} creator ke liye 7 din ka plan:`), card: { type: "steps", items: [...p.days, { text: `💡 ${p.tip}` }] }, state: st };
    }

    case "brandReply": {
      const [{ profile }, threads] = await Promise.all([T.loadMe(), T.loadThreads()]);
      const offer = applyAmount(text);
      const kindR = brandReplyKind(text);
      const own = myRates(profile).reel || 0;
      const fair = fairFor("reel", reachOfMe(profile)) || 0;
      const brandName = (() => { const b = (threads || []).find((x) => new RegExp(`\\b${String(x.brand_name || x.other_name || "").split(" ")[0] || "zzzz"}\\b`, "i").test(text)); return b?.brand_name || b?.other_name || ""; })();
      const ai = await T.askAi("text", `Write a short, polite, confident reply from an Indian creator to a brand. Situation: ${text}. ${own ? `Creator's reel rate: ₹${own}.` : ""} ${fair ? `Fair rate for their reach: about ₹${fair}.` : ""} Keep it under 90 words, ${lang === "hi" ? "in simple Hinglish" : "in simple English"}, no emojis, end by suggesting to confirm the deal on Ybex.`, { history });
      const aiText = String(ai?.text || "").trim();
      const draft = aiText && aiText.length > 40 ? aiText : brandReplyDraft({ kind: kindR, offer, myRate: own, fair, brand: brandName });
      const tip = kindR === "counter" && offer && (own || fair) && offer < Math.max(own, fair) ? say(lang, ` Your fair rate is about ${inr(Math.max(own, fair))} — ${inr(offer)} is below it, so countering is fair.`, ` Aapka sahi rate ~${inr(Math.max(own, fair))} hai — ${inr(offer)} usse kam hai, isliye counter karna theek hai.`) : "";
      return { reply: say(lang, "Here's a reply you can send — edit anything:", "Ye reply bhej sakte ho — kuch bhi badal lo:") + tip, card: { type: "copy", text: draft, title: say(lang, "Reply to brand", "Brand ko reply") }, state: st };
    }

    case "match": {
      const { list } = await T.opportunities();
      const top = list.filter((o) => !o.applied).slice(0, 3);
      if (!top.length) return { reply: say(lang, "No open campaign matches you right now. Want an alert when one goes live?", "Abhi koi open campaign match nahi karta. Naya aaye to alert chahiye?"), card: { type: "chips", send: "value", chips: [{ label: say(lang, "Alert me", "Alert lagao"), value: "Alert me for new campaigns" }] }, state: st };
      return { reply: say(lang, `Your best ${top.length > 1 ? `${top.length} matches` : "match"} right now (match % = niche, city, budget and followers):`, `Abhi aapke liye sabse sahi ${top.length} (match % = niche, city, budget, followers):`), card: { type: "opps", items: top, total: top.length }, state: { ...st, last: "opps", page: 0 } };
    }

    case "myDeals": {
      const threads = await T.loadThreads(true);
      if (!threads) return { reply: say(lang, "I couldn't load your deals just now. Try again in a minute, or open your inbox.", "Abhi aapki deals load nahi ho payi. Ek minute baad phir poochho, ya inbox kholo."), card: { type: "steps", items: [{ text: say(lang, "Open your deals", "Deals kholo"), link: "/creator/inbox", cta: "Inbox" }] }, state: st };
      const items = dealLines(threads, (t) => { try { return getInboxChip(t, false); } catch { return null; } });
      // v435 (Eva question test #11): "brand ne revision maanga hai kya karu" — explain revisions even with no deal loaded.
      if (/\brevision|changes? (maang|chahiye|asked)|edit (maang|chahiye)/i.test(String(text)) && /\b(kya karu|kya karun|what (do|should) i do|how|kaise|kya kare)\b/i.test(String(text))) {
        const how = say(lang,
          "When a brand asks for a revision: open the deal chat, read the notes, make the change and upload the new draft from the same deal (Upload draft). Revisions agreed in the brief are part of the price; if the brand asks for something new (a reshoot, extra video), reply in chat and agree an extra amount first. The money stays in the hold until the brand approves.",
          "Brand revision maange to: deal ka chat kholo, notes padho, change karo aur usi deal se naya draft upload karo (Upload draft). Brief mein jitne revisions tay hain wo price mein shamil hain; agar brand kuch naya maange (reshoot, extra video) to chat mein pehle extra amount tay karo. Brand ke approve karne tak paisa hold mein safe rehta hai.");
        return { reply: how, card: items.length ? { type: "steps", items } : null, state: { ...st, lastTopic: "deals" } };
      }
      if (!items.length) return { reply: say(lang, "You don't have a running deal right now. Want me to find campaigns for you?", "Abhi koi deal chal nahi rahi. Aapke liye campaigns dhundu?"), card: { type: "chips", send: "value", chips: [{ label: say(lang, "Find campaigns", "Campaigns dhundo"), value: "Show campaigns for me" }] }, state: st };
      return { reply: say(lang, items.length > 1 ? `Your ${items.length} running deals:` : "Your running deal:", items.length > 1 ? `Aapki ${items.length} chal rahi deals:` : "Aapki chal rahi deal:"), card: { type: "steps", items }, state: { ...st, lastTopic: "deals" } };
    }

    case "myUgc": {
      const work = await T.loadWork(true);
      const items = ugcLines(work.orders);
      if (!items.length) return { reply: say(lang, "No UGC order running right now. Want to see open UGC briefs?", "Abhi koi UGC order nahi chal raha. Open UGC briefs dikhaun?"), card: { type: "chips", send: "value", chips: [{ label: "UGC briefs", value: "Show UGC briefs" }] }, state: st };
      return { reply: say(lang, items.length > 1 ? `Your ${items.length} UGC orders:` : "Your UGC order:", items.length > 1 ? `Aapke ${items.length} UGC orders:` : "Aapka UGC order:"), card: { type: "steps", items }, state: { ...st, lastTopic: "ugc" } };
    }

    case "rate": {
      // v419 (QA): no guessed reach. Uses the reach she has (or typed), per format (reel / story / YouTube), and her
      // real numbers: own rate card, her last Ybex deal, and what live campaigns in her niche pay.
      const [{ profile }, ins, threads] = await Promise.all([T.loadMe(), T.loadInsights(), T.loadThreads()]);
      const fmt = rateFormat(text);
      const reach = reachFromText(text) || reachOfMe(profile);
      const fair = fairFor(fmt, reach);
      const own = myRates(profile)[fmt] || 0;
      const name = { reel: "reel", story: "story", yt: "YouTube video" }[fmt];
      const lastDeal = (threads || []).filter((t) => !t.is_ugc && Number(t.agreed_amount) > 0).sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))[0];
      const market = (ins?.niches || []).find((n) => nicheGroupsOfMe(profile).includes(n.niche));
      const facts = [
        own ? say(lang, `Your ${name} rate on your profile: ${inr(own)}.`, `Aapki profile pe ${name} rate: ${inr(own)}.`) : "",
        lastDeal ? say(lang, `Your last Ybex deal: ${inr(lastDeal.agreed_amount)}.`, `Aapki pichhli Ybex deal: ${inr(lastDeal.agreed_amount)}.`) : "",
        market?.median_budget ? say(lang, `Live campaigns in your niche pay around ${inr(market.median_budget)} per creator.`, `Aapke niche ke live campaigns ek creator ko lagbhag ${inr(market.median_budget)} dete hain.`) : "",
      ].filter(Boolean);
      const check = fair && own && fmt === "reel" ? quoteCheck(reach, own) : null;
      const reply = fair
        ? say(lang, `For ~${shortNum(reach)} average views, a fair ${name} rate is around ${inr(fair)}.`, `~${shortNum(reach)} average views ke liye ${name} ka sahi rate lagbhag ${inr(fair)} hai.`)
        : say(lang, `I can't say a fair ${name} rate without your average views — followers alone don't decide it. Add your average reach in your profile (or tell me, e.g. "my reach is 20k").`, `Average views ke bina ${name} ka sahi rate nahi bata sakti — sirf followers se rate tay nahi hota. Profile mein average reach daalo (ya mujhe batao, jaise "meri reach 20k hai").`);
      return { reply, card: { type: "rate", rate: { reach }, fair, own, label: { reel: "FAIR REEL RATE", story: "FAIR STORY RATE", yt: "FAIR YOUTUBE RATE" }[fmt], unit: { reel: "per reel", story: "per story", yt: "per video" }[fmt], facts,
        check: check ? { level: check.level, message: check.level === "warn" ? `⚠️ Your reel rate ${inr(own)} is above that — you can keep it, brands may negotiate.` : check.message } : null }, state: { ...st, lastTopic: "rate" } };
    }

    case "invites": {
      const items = await T.loadInvites();
      if (!items.length) return { reply: say(lang, "No brand invitations waiting right now. Want me to find campaigns you can apply to?", "Abhi koi brand invitation nahi hai. Campaigns dhundu jin pe apply kar sako?"), card: { type: "chips", send: "value", chips: [{ label: "Find campaigns", value: "Show campaigns for me" }] }, state: st };
      return { reply: say(lang, items.length > 1 ? `${items.length} brands invited you:` : `${items[0].brand_name || "A brand"} invited you:`, items.length > 1 ? `${items.length} brands ne invite kiya hai:` : `${items[0].brand_name || "Ek brand"} ne invite kiya hai:`), card: { type: "invites", items: items.slice(0, 5) }, state: st };
    }

    case "profile": {
      const { profile, kyc, hasPayout: hp, payoutUnknown, money } = await T.loadMe(true);
      const hasPayout = hp || Boolean(payoutUnknown); // v332
      const ps = profileScore(profile, { kyc, hasPayout, money }); // v328
      return { reply: ps.score >= 90 ? say(lang, `Your profile is ${ps.score}% — looking strong!`, `Aapki profile ${ps.score}% hai — badhiya!`) : say(lang, `Your profile is ${ps.score}%. Fix these and brands will find you more:`, `Aapki profile ${ps.score}% hai. Ye theek karo, brands zyada dhundhenge:`), card: { type: "profile", score: ps }, state: st };
    }

    case "bio":
    case "portfolio": {
      const { profile } = await T.loadMe();
      const context = { name: profile?.name, niche: nichesOfMe(profile).slice(0, 3), city: profile?.city, followers: followersOfMe(profile), reach: reachOfMe(profile), bio: String(profile?.bio || "").slice(0, 300), past_brands: (profile?.past_brands || []).slice?.(0, 5) };
      const ai = await T.askAi(hit.intent === "bio" ? "creator_bio" : "creator_portfolio", text, { history, context });
      const fallback = hit.intent === "bio"
        ? `${profile?.name || "Creator"} · ${nicheGroupsOfMe(profile)[0] || "lifestyle"} creator${profile?.city ? ` from ${profile.city}` : ""}. I make honest, relatable reels that people actually watch${followersOfMe(profile) ? ` — ${shortNum(followersOfMe(profile))} followers` : ""}. Open for brand collabs & UGC.`
        : "Title: [what you made, e.g. \"Serum review reel\"]\nBrand: [brand name]\nResult: [views / likes / reach]\nWhat I did: [1 line — idea, shoot, edit]";
      return { reply: hit.intent === "bio" ? say(lang, "A bio for your profile — copy it, or ask me to change the tone:", "Aapki profile ke liye bio — copy karo, ya tone badalwa lo:") : say(lang, "How to write each portfolio piece (fill the brackets):", "Har portfolio piece aise likho (brackets bharo):"), card: { type: "copy", text: ai?.text || fallback, section: hit.intent === "bio" ? "profile" : "portfolio" }, state: st };
    }

    case "script":
      return writeScript(text, st, lang, history);

    case "brief":
    case "checklist": {
      const work = await T.loadWork();
      const active = (work.orders || []).find((o) => /IN_PROGRESS|CLAIMED|REVISION|ACTIVE|ACCEPTED/i.test(String(o.stage || o.status)));
      const b = active?.brief || null;
      if (!b) return { reply: say(lang, "Paste the brief here and I'll explain it simply.", "Brief yahan paste karo, simple bhasha mein samjha dungi."), state: { ...st, awaiting: "briefText" } };
      return { reply: say(lang, `"${b.title || "Your brief"}" in simple words:`, `"${b.title || "Aapka brief"}" simple bhasha mein:`), card: { type: "brief", brief: explainBrief(b), checklist: draftChecklist(b) }, state: st };
    }

    case "due": {
      const work = await T.loadWork(true);
      const items = dueItems({ orders: work.orders, applications: work.applications });
      if (!items.length) return { reply: say(lang, "Nothing pending right now. Want me to find new work?", "Abhi kuch pending nahi hai. Naya kaam dhundu?"), card: { type: "chips", send: "value", chips: [{ label: "Find campaigns", value: "Show campaigns for me" }] }, state: st };
      return { reply: say(lang, "Here's what's due:", "Ye baaki hai:"), card: { type: "due", items }, state: st };
    }

    case "earnings": {
      const { txns, failed } = await T.loadMoney();
      if (failed) return { reply: say(lang, "I couldn't check your earnings just now — your money is safe. Ask me again in a minute, or open Earnings.", "Abhi aapki earnings check nahi ho payi — paise safe hain. Ek minute baad phir poochho, ya Earnings kholo."), card: { type: "chips", send: "value", chips: [{ label: "Try again", value: "Show my earnings" }] }, state: st }; // v332
      const s = earningsSummary(txns); // v328: deals = paid / approved only, so also show the card when payouts are still coming
      return { reply: s.deals || s.pendingCount ? say(lang, "Your earnings on Ybex:", "Ybex pe aapki kamai:") : say(lang, "No paid work yet — let's find your first campaign!", "Abhi tak koi paid kaam nahi — chalo pehla campaign dhundte hain!"), card: { type: "earnings", s }, state: st };
    }

    case "kyc": {
      const [{ kyc, hasPayout, kycRaw, payoutUnknown }, money] = await Promise.all([T.loadMe(true), T.loadMoney()]);
      if (payoutUnknown || money.failed) return { reply: say(lang, "I couldn't check your payout details just now — nothing has changed with your money. Ask me again in a minute.", "Abhi payout details check nahi ho payi — paise mein kuch nahi badla. Ek minute baad phir poochho."), card: { type: "chips", send: "value", chips: [{ label: "Try again", value: "Check my payout" }] }, state: st }; // v332
      const s = earningsSummary(money.txns);
      const steps = [];
      // v435 (Eva question test #11): "is my kyc done" with KYC approved got only "no bank account" — say it first.
      if (/approved|verified/.test(kyc)) steps.push({ text: say(lang, "✓ Your KYC is verified.", "✓ Aapka KYC verified hai."), link: "/settings?section=kyc&from=eva", cta: say(lang, "View", "Dekho") });
      if (!/approved|verified/.test(kyc)) steps.push({ text: kyc && !/not[_\s-]?submitted|not[_\s-]?started|missing|none/.test(kyc) && /pending|review|submitted/.test(kyc) ? /* v419 (QA): "not_submitted" matched "submitted" → "under review" */ "KYC is under review — the team checks it within 24–48 hours." : kyc && /reject|declin/.test(kyc) ? `KYC was rejected${kycRaw?.rejection_reason ? `: ${kycRaw.rejection_reason}` : ""} — please submit again.` : "KYC isn't done — payouts need PAN + bank / UPI.", link: "/settings?section=kyc&from=eva", cta: "Open KYC" }); // v329: &from=eva → back to Eva
      if (!hasPayout) steps.push({ text: "No bank account / UPI added for payouts.", link: "/settings?section=kyc&from=eva", cta: "Add" }); // v329
      if (s.approvedCount) steps.push({ text: `${inr(s.approved)} is approved — the payout to your bank comes next.`, link: "/earnings", cta: "Earnings" }); // v328
      if (s.pendingCount) steps.push({ text: `${inr(s.pending)} is waiting: money is released after the brand approves your work (and the live link for collab reels).`, link: "/earnings", cta: "Earnings" });
      if (steps.length === 1 && /approved|verified/.test(kyc)) steps.push({ text: "Everything looks fine — KYC verified and payout account added. Payouts go out after the brand approves.", link: "/earnings", cta: "Earnings" });
      // v419 (QA): "KYC kaise karte hai" got only the payout check — a how-to question gets the how-to first.
      if (/\b(kaise|how|process|steps?|kya chahiye|documents?|kya kya)\b/i.test(String(text || "")) && !/approved|verified/.test(kyc)) {
        steps.unshift({ text: say(lang, "How to do KYC: open Settings → KYC, add your PAN number + a clear PAN photo, Aadhaar front & back, and your bank account or UPI ID, then submit. The team checks it in 24–48 hours.", "KYC kaise kare: Settings → KYC kholo, PAN number + PAN ki saaf photo, Aadhaar front & back, aur bank account ya UPI ID daalo, phir submit. Team 24–48 ghante mein check karti hai."), link: "/settings?section=kyc&from=eva", cta: say(lang, "Start KYC", "KYC shuru karo") });
        return { reply: say(lang, "Here's how KYC works and where you stand:", "KYC aise hota hai — aur aapka status:"), card: { type: "steps", items: steps }, state: st };
      }
      return { reply: say(lang, "Your payout check:", "Aapka payout check:"), card: { type: "steps", items: steps }, state: st };
    }

    case "growth": {
      const { profile } = await T.loadMe();
      const g = growthIdeas(profile, T.weekNo());
      const ai = await T.askAi("creator_growth", text, { history, context: { niche: g.niche, followers: followersOfMe(profile), reach: reachOfMe(profile) } });
      return { reply: say(lang, `This week's ideas for a ${g.niche.toLowerCase()} creator:`, `${g.niche} creator ke liye is hafte ke ideas:`), card: { type: "ideas", ideas: Array.isArray(ai?.ideas) && ai.ideas.length ? ai.ideas.slice(0, 5) : g.ideas, tips: g.tips }, state: st };
    }

    case "refer": {
      const { user } = await T.loadMe();
      return { reply: say(lang, "Invite a creator friend — when they join with your code you both benefit:", "Dost creator ko bulao — aapke code se join kare to dono ko fayda:"), card: { type: "refer", user }, state: st };
    }

    case "share": {
      const [{ profile }, money] = await Promise.all([T.loadMe(), T.loadMoney()]);
      const s = earningsSummary(money.txns);
      return { reply: say(lang, "Your share card — post it on your story:", "Aapka share card — story pe daalo:"), card: { type: "share", name: profile?.name || "Creator", deals: s.deals, niche: nicheGroupsOfMe(profile)[0] || "" }, state: st };
    }

    case "handoff": {
      const summary = history.filter((h) => h.user).slice(-5).map((h) => `• ${String(h.text).slice(0, 120)}`).join("\n");
      return { reply: say(lang, "The Ybex team can help on WhatsApp — your chat summary goes with it:", "Ybex team WhatsApp pe madad karegi — chat ka summary saath jayega:"), card: { type: "handoff", number: WA_NUMBER, text: `Hi YBEX Team, I am ${name || "a creator"} on Ybex. I need help with:\n${summary || text}` }, state: st };
    }

    default:
      return null;
  }
}

async function writeScript(text, st, lang, history) {
  // v419 (QA): the creator's own topic comes first ("reel script for masala chai" got the running UGC brief's
  // "Masala Box"); the brief is only used when she names no topic or asks for "my brief / my order". Caption-only
  // and hashtag-only asks get just that.
  const mode = writeMode(text);
  const topic = topicFrom(text);
  const wantsBrief = /\b(brief|order|ugc)\b/i.test(text) || !topic;
  // Session 58 (Eva settings): "Deals & offers" switched off → Eva doesn't read the creator's orders for context.
  const work = wantsBrief && readEvaSettings().deals ? await T.loadWork() : { orders: [] };
  const active = (work.orders || []).find((o) => /IN_PROGRESS|CLAIMED|REVISION|ACTIVE|ACCEPTED/i.test(String(o.stage || o.status)));
  const ctx = wantsBrief && active?.brief ? { product: active.brief.product_name || active.brief.title, requirements: String(active.brief.detailed_requirements || "").slice(0, 600), duration: active.brief.video_duration } : null;
  const subject = topic || ctx?.product || "";
  if (!subject) return { reply: say(lang, "Sure! Which product or brand is it for? Tell me in a line (or paste the brief).", "Zaroor! Kis product / brand ke liye? Ek line mein batao (ya brief paste karo)."), state: { ...st, awaiting: "scriptProduct" } };
  const { profile } = await T.loadMe().catch(() => ({ profile: {} }));
  const niche = nicheGroupsOfMe(profile)[0] || "";
  const tags = hashtagsFor(subject, niche).join(" ");
  if (mode === "hashtags") return { reply: say(lang, `Hashtags for ${subject}:`, `${subject} ke liye hashtags:`), card: { type: "copy", text: tags, title: "Hashtags" }, state: st };
  // v444 (Ravi): "write a caption" gets only a caption — creator_write always wrote hooks + script + caption
  const capOnly = mode === "caption" || mode === "caption+tags";
  const ai = capOnly
    ? await T.askAi("text", `Write ONE Instagram caption for an Indian creator's reel about ${subject}${niche ? ` (niche: ${niche})` : ""}: 1–2 short, natural lines with one question to get comments, then a new line with 4–6 relevant hashtags (add #ad only if it is a paid brand deal). No hooks, no script, no notes. ${lang === "hi" ? "Simple Hinglish." : "Simple English."} The creator asked: "${text}"`, { history })
    : await T.askAi("creator_write", ctx && !topic ? `${text}\n\nBrief: ${JSON.stringify(ctx)}` : text, { history });
  const aiText = String(ai?.text || "").trim();
  // v333: the AI sometimes answered "I don't write scripts" — that is never shown as the script.
  const refused = /\b(nahi likh(ti|ta|te)|can(no|')t write|cannot write|i don'?t write|not able to write|unable to write|sirf ybex)\b/i.test(aiText);
  if (capOnly) {
    const fb = `${captionFor(subject)}\n\n${tags}`;
    const kit = /\b(HOOKS?|SCRIPT)\b|0[–-]3\s?s/i.test(aiText); // a full kit slipped through → the plain caption instead
    return { reply: say(lang, `A caption for ${subject}:`, `${subject} ke liye caption:`), card: { type: "copy", text: aiText && !refused && !kit ? aiText : fb, title: "Caption" }, state: st };
  }
  const p = subject;
  const fallback = `HOOKS\n1. "I didn't expect ${p} to be this good…"\n2. "Stop scrolling if you love ${p}."\n3. "3 reasons ${p} is now in my routine."\n\nSCRIPT (30s)\n0–3s: Hook + ${p} close up\n3–15s: How you use / make / try ${p} (show, don't tell)\n15–25s: The result + your honest take\n25–30s: "Would you try it? Tell me below" + final shot\n\nCAPTION\n${captionFor(p)}\n\n${tags}`;
  return { reply: say(lang, "Here you go — 3 hooks, a 30-second script, a caption and hashtags:", "Ye lo — 3 hooks, 30 second script, caption aur hashtags:"), card: { type: "copy", text: aiText && !refused ? aiText : fallback, title: "Script" }, state: st };
}

// v419: ask the next missing profile detail (with tap answers), or say it's all done.
function fillNext(st, lang, lead = "") {
  const queue = st.fill?.queue || [];
  if (!queue.length) {
    const n = (st.fill?.saved || []).length;
    return { reply: `${lead ? `${lead}${/[.!?]$/.test(lead) ? "" : "."} ` : ""}${n ? say(lang, `All done — ${n} detail${n > 1 ? "s" : ""} saved to your profile. Brands can now find you by them. 🎉`, `Ho gaya — ${n} details aapki profile mein save. Ab brands aapko inse dhoondh payenge. 🎉`) : say(lang, "Okay — nothing more to fill.", "Theek hai — aur kuch bharna nahi.")}`, state: { ...st, awaiting: null, fill: null } };
  }
  const q = fillQuestion(queue[0], lang);
  return { reply: `${lead ? `${lead}${/[.!?]$/.test(lead) ? "" : "."} ` : ""}${q.text}`, card: { type: "chips", send: "value", chips: [...q.chips.map((c) => ({ label: c, value: c })), { label: "Skip", value: "skip" }] }, state: { ...st, awaiting: "fill" } };
}
