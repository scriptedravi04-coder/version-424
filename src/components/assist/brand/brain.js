// Session 51 (Ravi): Ybex Assist for brands — decides what to do with one message and returns
// { reply, card? } (a card = creator list, compare table, draft, report…), or null when the message is
// not a brand task (then the old Ybex Assist brain answers: hi / help / budget / bug / idea).
// Order: the brand's daily limit → a question we are in the middle of (UGC wizard) → rules → AI.
import { classify, detectLang } from "../../feedback/assistBrain";
import { inr, knowledge } from "../../feedback/assistKnowledge";
import { detectBrandIntent, parseCreatorQuery, hasCreatorFilters, describeFilters, readUgcFields, nextUgcQuestion, ugcDraftFrom, festivalPlan, checkBrief, templateScript, nichesIn, reportText, NICHES, CLEAR_CHAT, NEW_CHAT, nextCampaignQuestion, readCampaignAnswer, campaignBuilderDraft, numOf, isMoneyAsk, cid, nameOf, budgetFit } from "./brandLogic";
import * as T from "./tools";
import { splitRequests, editRequest, editFallback } from "../creator/creatorLogic";
import * as M from "./memory";
import { readEvaSettings, blockedSwitch, blockedReply } from "../../feedback/evaSettings";


// v328: the question box that is open right now ({ flow, field }); older boxes in the chat ignore taps.
let liveQ = null;
export const isLiveQuestion = (flow, field) => Boolean(liveQ && liveQ.flow === flow && liveQ.field === field);
const liveQuestionOf = (st) => {
  if (st?.awaiting === "ugc" && st.ugc) { const q = nextUgcQuestion(st.ugc); return q ? { flow: "ugc", field: q.field } : null; }
  if (st?.awaiting === "campaign" && st.camp) { const q = nextCampaignQuestion(st.camp); return q ? { flow: "campaign", field: q.field } : null; }
  return null;
};
export const initialBrandState = () => { liveQ = null; return { awaiting: null, ugc: null, lastFilters: null, lastResults: null, opened: false }; };
const say = (lang, en, hi) => (lang === "hi" ? hi : en);
// v328: one page size everywhere (the creators card shows 12).
const PAGE = 12;
const pageSize = (f) => Math.min(PAGE, Number(f?.count) || PAGE);
const CANCEL = /^(cancel|stop|chhodo|rehne do|nahi chahiye|never ?mind|leave it)( it| this| please)?$/i;
// v328: a clear switch to another task while a question flow is half done ("find Delhi fashion creators",
// "what's my status?") — the flow no longer swallows it. Long brief answers rarely look like this.
const SEARCH_ASK = /^(please |pls |now |also |actually |ok |okay )?(find|show|search|get|list|need|i need|i want|want|looking for|dhundo|dhoondo)\b|\b(dikhao|dhundo|dhoondo|dhoondh\w*|chahiye|chaiye)\s*[?.!]*$/i;
const BRIEF_FIELDS = ["requirementsText", "detailed_requirements"];
function switchIntent(text, field) {
  const hit = detectBrandIntent(text);
  if (!hit) return null;
  const t = String(text).trim();
  const briefAnswer = BRIEF_FIELDS.includes(field); // the brief describes the video ("show how it's applied") — be stricter
  if (hit.intent === "creators" && hasCreatorFilters(hit.filters || parseCreatorQuery(text)) && (briefAnswer ? /^(please |pls )?(find|search|show me|list)\b/i : SEARCH_ASK).test(t)) return hit;
  if (["status", "alerts", "report", "applicants", "handoff"].includes(hit.intent) && (/\?\s*$/.test(t) || (!briefAnswer && /\b(what|what's|whats|how|kya|kitna|kitne|kab|kahan|show|any|status|check)\b/i.test(t)))) return hit;
  return null;
}
const WA_NUMBER = "918764004299"; // the Campaign Manager number brand home already uses

/** First thing when a brand opens the chat: what needs them now + new creators in saved searches. */
export async function onOpen() {
  // Session 58: English by default; "Deals & offers" off in Eva settings → no pending items here.
  const dealsOn = !blockedSwitch("brand", "alerts", readEvaSettings());
  const [alerts, fresh] = await Promise.all([dealsOn ? T.alertsNow().catch(() => []) : [], T.newInSavedSearches().catch(() => [])]);
  const out = [];
  if (alerts.length) out.push({ reply: alerts.length > 1 ? `${alerts.length} things are waiting for you:` : "1 thing is waiting for you:", card: { type: "alerts", items: alerts } });
  for (const f of fresh) out.push({ reply: `${f.creators.length} new creator${f.creators.length > 1 ? "s" : ""} in your "${f.label}" search:`, card: { type: "creators", items: f.creators, total: f.creators.length, filters: f.filters }, seen: f.seen });
  return out;
}

export const BRAND_POPULAR = [
  { label: "Find creators", value: "Find creators" },
  { label: "Rank applicants", value: "Rank my applicants" },
  { label: "What's pending", value: "What's pending for me?" },
  { label: "Festival planner", value: "Plan my Diwali campaign for 50000" },
  { label: "Hooks & script", value: "Write hooks and a script" },
];

/** One brand message → { reply, card?, state } | null */
export async function handleBrandMessage(text, state = initialBrandState(), opts = {}) {
  const r0 = await handleBrandMessageInner(text, state, opts);
  // v438: remember the last text card (script / brief) and plan so follow-ups can change them
  if (r0 && r0.card && ["text", "copy"].includes(r0.card.type) && r0.card.text) r0.state = { ...(r0.state || state), lastText: String(r0.card.text).slice(0, 3000), lastTitle: r0.card.title || "", lastKind: "text" };
  if (r0 && r0.card && r0.card.type === "plan") r0.state = { ...(r0.state || state), lastPlan: { text: String(text), budget: r0.card.plan?.budget || 0 }, lastKind: "plan" };
  if (r0 && r0.card && r0.card.type === "creators") r0.state = { ...(r0.state || state), lastKind: "creators" }; // v443: the newest result is what "make it…" changes
  return r0;
}
async function handleBrandMessageInner(text, state = initialBrandState(), opts = {}) {
  // v438 (Eva deep test #6): follow-ups change the last result — text ("make it shorter", "hindi mein"), the creator
  // search ("only female", "under 5000", "show beauty instead") and the plan ("make it 50000").
  if (!state?.awaiting) {
    const t0 = String(text).trim();
    const lang0 = ["hi", "hinglish"].includes(readEvaSettings().lang) ? "hi" : detectLang(text);
    const amt0 = numOf(t0);
    const planEdit = state?.lastPlan && amt0 >= 1000 && (state.lastKind === "plan" || !state.lastText); // v443: "make it 50000" after a plan changes the plan, not the script above it
    if (state?.lastText && !planEdit && (!state.lastKind || state.lastKind === "text") && editRequest(t0) && !detectBrandIntent(t0)?.intent?.match(/creators|campaignCreate|ugcCreate|status/)) {
      const ai = await T.askAi("text", `Rewrite the text below exactly as asked: "${t0}". Keep its sections and labels; change only what is asked. Return only the new text — no intro line like "Here's…".`, { history: opts.history || [], context: { text_to_change: state.lastText } });
      const out = String(ai?.text || ai?.reply || "").trim().replace(/^(here('s| is)|sure|ok(ay)?|ye(h)? (raha|lo))[^\n]{0,80}:\s*\n/i, "").trim() || editFallback(state.lastText, t0);
      return { reply: out !== state.lastText ? say(lang0, "Changed it:", "Badal diya:") : say(lang0, "I couldn't change it right now (AI is busy) — here it is again:", "Abhi badal nahi paayi — ye raha:"), card: { type: "text", title: state.lastTitle || "Text", text: out || state.lastText }, state: { ...state, lastText: out || state.lastText } };
    }
    const amt = numOf(t0);
    if (state?.lastPlan && amt >= 1000 && /\b(make it|change|instead|budget|kar do|karo|ho to|with|for)\b/i.test(t0) && t0.split(/\s+/).length <= 8 && !/\bcreators?\b/i.test(t0)) {
      return handle(`${state.lastPlan.text.replace(/₹?\s*[\d,.]+\s*(k|lakh|l)?\b/gi, "").trim()} ${amt}`, state, opts);
    }
    const nf = parseCreatorQuery(t0);
    const refine = state?.lastFilters && hasCreatorFilters(nf) && t0.split(/\s+/).length <= 8 && !/\b(new search|naya search|find|search|dhundo|dhoondo)\b/i.test(t0)
      && (/^(only|sirf|just|bas|under|below|above|over|in|from|show|with|without|female|male|women|men|girls|boys|ab|now|and|aur)\b/i.test(t0) || /\b(instead|bhi|only|sirf)\b/i.test(t0));
    if (refine) {
      const keep = { ...state.lastFilters };
      const merged = { ...keep };
      for (const [k, v] of Object.entries(nf)) { if (Array.isArray(v) ? v.length : (v && v !== 0)) merged[k] = v; }
      if (/\binstead\b|\bki jagah\b/i.test(t0) && nf.niches?.length) merged.niches = nf.niches;
      return creatorsReply(await T.searchCreators(merged), merged, { ...state }, lang0);
    }
  }
  // v435 (Eva question test #12): "find Delhi food creators and also rank my applicants" — each request in turn.
  const parts = !state?.awaiting ? splitRequests(text, detectBrandIntent) : null;
  if (parts) {
    const out = [];
    let st0 = state;
    for (const part of parts) { const r1 = await handle(part, st0, opts).catch(() => null); if (r1 && r1.reply) { out.push(r1); st0 = r1.state || st0; } }
    if (out.length) { liveQ = liveQuestionOf(st0); return { ...out[0], state: st0, more: out.slice(1).map((x) => ({ reply: x.reply, card: x.card })) }; }
  }
  const r = await handle(text, state, opts);
  // v435: the campaign builder was paused for this request — say how to get back to it (once).
  if (r?.state?.pausedNote) {
    const hi = detectLang(text) === "hi" || ["hi", "hinglish"].includes(readEvaSettings().lang);
    r.reply = `${r.reply || ""}\n\n${hi ? "(Campaign draft save hai — \"continue campaign\" likho to wahi se shuru karenge.)" : "(Your campaign draft is saved — say \"continue campaign\" to finish it.)"}`.trim();
    r.state = { ...r.state, pausedNote: false };
  }
  if (r && r.reply) liveQ = liveQuestionOf(r.state); // v328: remember which question box is the live one
  return r;
}

async function handle(text, state = initialBrandState(), opts = {}) {
  const { history = [], brandName = "", chatId = null } = opts;
  // v328: the Eva settings language — Hinglish / Hindi → Hinglish replies; English → follow how the user writes.
  const setLang = readEvaSettings().lang;
  const lang = setLang === "hinglish" || setLang === "hi" ? "hi" : detectLang(text);
  const st = { ...state };
  const kind = classify(text);
  // A real bug report / feature idea goes to the team as before. ("chahiye" alone is a request, not an idea.)
  const isReport = kind.type === "feedback" && (kind.category === "bug" || (kind.category === "feature" && /\b(suggest|suggestion|feature|idea|please add|add (karo|kar do|kijiye)|should (have|add)|hona chahiye)\b/i.test(text)));

  // v328: "new chat" / "clear chat" work even in the middle of a question flow (they were read as answers).
  if (NEW_CHAT.test(text.trim())) return { reply: say(lang, "Fresh chat started. What do you need?", "Nayi chat shuru. Batao kya chahiye?"), newChat: true, state: initialBrandState() };
  if (CLEAR_CHAT.test(text.trim())) {
    const ok = await M.clearHistory(chatId); // Session 53: this chat only (others stay in the menu)
    return { reply: ok ? say(lang, "Done — old chat cleared. Fresh start!", "Ho gaya — purani chat saaf kar di. Nayi shuruaat!") : say(lang, "Couldn't clear the chat right now. Try again in a bit.", "Abhi chat saaf nahi ho payi, thodi der mein try karo."), clearScreen: ok, state: initialBrandState() };
  }
  const inFlow = (st.awaiting === "ugc" && st.ugc) || (st.awaiting === "campaign" && st.camp);
  // v328: a bug report goes to the team (old brain) — the half-done brief stays for the next answer.
  // (Not while the open question is the free-text brief itself: that text describes the video.)
  const openField = liveQuestionOf(st)?.field;
  if (inFlow && isReport && !BRIEF_FIELDS.includes(openField)) return null;
  // v328: the brand clearly moved on → drop the half-done flow with one line, then answer the new ask.
  if (inFlow && !CANCEL.test(text.trim()) && switchIntent(text, openField)) {
    const what = st.awaiting === "ugc" ? say(lang, "the UGC brief", "UGC brief") : say(lang, "the campaign draft", "campaign draft");
    const note = say(lang, `Okay, leaving ${what} for now.`, `Theek hai, ${what} abhi chhod dete hain.`);
    const out = await handle(text, { ...st, awaiting: null, ugc: null, camp: null }, opts);
    if (out && out.reply) return { ...out, reply: `${note}\n${out.reply}` };
    return { reply: note, state: { ...st, awaiting: null, ugc: null, camp: null } };
  }

  // A UGC brief we are filling in, one question at a time.
  if (st.awaiting === "ugc" && st.ugc) {
    if (CANCEL.test(text.trim())) return { reply: say(lang, "Okay, cancelled.", "Theek hai, rehne dete hain."), state: { ...st, awaiting: null, ugc: null } };
    const q = nextUgcQuestion(st.ugc);
    // v328: the requirements answer only fills requirements ("show 2 creators using it" changed the video count).
    let ugc = q?.field === "detailed_requirements" ? { ...st.ugc } : readUgcFields(text, st.ugc);
    if (q && ugc[q.field] === st.ugc[q.field]) {
      if (q.field === "product_name") ugc.product_name = text.trim().slice(0, 60);
      else if (q.field === "detailed_requirements") ugc.detailed_requirements = text.trim().slice(0, 800);
      else if (q.field === "max_creators") { const n = parseInt(text, 10); if (n > 0) ugc.max_creators = Math.min(50, n); }
      else if (q.field === "budget") { const n = numOf(text); if (n > 0) ugc.budget = n; } // v328: "2.5k" = ₹2,500 (was ₹25,000)
      else if (q.field === "deliverable_type") { const f = [["collab", "collaboration_reel"], ["reel", "collaboration_reel"], ["edit", "ugc_video_edited"], ["raw", "ugc_video_raw"]].find(([w]) => text.toLowerCase().includes(w)); if (f) ugc.deliverable_type = f[1]; }
    }
    return ugcStep(ugc, st, lang);
  }
  // Session 58 (Eva handoff §7.2): the campaign builder, one question at a time (typed text answers it).
  // v435 (Eva question test #5): "continue campaign" picks a paused draft back up.
  if (st.pausedCamp && /\b(continue|resume|finish|jari|aage badh\w*|complete)\b.*\bcampaign\b|\bcampaign\b.*\b(continue|resume|finish|jari)\b/i.test(text)) {
    return campaignStep(st.pausedCamp, { ...st, pausedCamp: null }, say(lang, "Back to your campaign draft.\n", "Campaign draft par wapas.\n"));
  }
  if (st.awaiting === "campaign" && st.camp) {
    if (CANCEL.test(text.trim())) return { reply: say(lang, "Okay, cancelled.", "Theek hai, rehne dete hain."), state: { ...st, awaiting: null, camp: null } };
    const q = nextCampaignQuestion(st.camp);
    // v435 (Eva question test #5): "write a script", "check my brief", "make a ugc brief"… while the builder waits —
    // the draft is paused (not lost) and the new request is handled; "continue campaign" brings the draft back.
    const other = detectBrandIntent(text);
    const looksNew = other && other.intent !== "campaignCreate" && (["write", "briefCheck", "ugcCreate", "status", "alerts", "report", "applicants", "handoff", "invoice", "planner", "compare", "saveSearch"].includes(other.intent) || (other.intent === "creators" && SEARCH_ASK.test(text.trim())));
    const notAnAnswer = q && readCampaignAnswer(q.field, text, st.camp).error;
    if (q && other && (looksNew || (notAnAnswer && other.intent !== "creators"))) {
      Object.assign(st, { awaiting: null, camp: null, pausedCamp: st.camp, pausedNote: true });
    } else if (q) {
      const { c, error, note } = readCampaignAnswer(q.field, text, st.camp);
      if (error) return { reply: error, card: { type: "question", flow: "campaign", ...q }, state: st }; // v328: tagged box
      return campaignStep(c, st, note ? `${note}\n` : ""); // v329: "kept the first 3 niches" is said
    }
  }
  if (st.awaiting === "ugcReview" && st.ugc && !(detectBrandIntent(text) && detectBrandIntent(text).intent !== "ugcCreate")) {
    const ugc = readUgcFields(text, st.ugc);
    if (JSON.stringify(ugc) !== JSON.stringify(st.ugc)) return ugcStep(ugc, st, lang);
  }
  if (st.awaiting === "briefText") {
    return briefCheckReply({ detailed_requirements: text, title: "" }, st, lang);
  }
  // v329: the answer to "Which creators? Tell me a niche, a city…" ("fashion in Jaipur") is that search —
  // it had no "creators" word, so it fell to the AI / old brain.
  if (st.awaiting === "creatorFilters") {
    st.awaiting = null;
    const f = parseCreatorQuery(text);
    const again = detectBrandIntent(text);
    if (hasCreatorFilters(f) && (!again || again.intent === "creators")) return creatorsReply(await T.searchCreators(f), f, st, lang);
  }

  // Session 52: "chat clear karo" / "nayi chat" → the saved chat history is deleted.
  // Session 58: "new chat" opens a fresh chat; the old one is kept (it used to be deleted).
  // v328: NEW_CHAT / CLEAR_CHAT moved above the question flows.

  // "aur dikhao" → the next page of the last creator search.
  // v328: only when the message brings no new filters ("more creators in Delhi" is a new search), and one page size.
  if (st.lastFilters && /^(aur|more|aur dikhao|aur bhi|show more|next|aage|aur creators)\b/i.test(text.trim()) && !hasCreatorFilters(parseCreatorQuery(text))) {
    const all = await T.searchCreators(st.lastFilters);
    const size = pageSize(st.lastFilters);
    const from = (st.page || 1) * size;
    const items = all.slice(from, from + size);
    if (!items.length) return { reply: say(lang, "That's everyone for this search.", "Is search ke saare creators dikha diye."), state: st };
    // v329: `from` → the card says "Showing 13–24 of 40" (it said "Showing 12 of 40 · say show more" even on the last page).
    return { reply: say(lang, `${from + 1}–${from + items.length} of ${all.length}:`, `${all.length} mein se ${from + 1}–${from + items.length}:`), card: { type: "creators", items, total: all.length, from, filters: st.lastFilters }, state: { ...st, page: (st.page || 1) + 1 } };
  }

  // Session 58 (Eva handoff §8b): "What can you do?" → one short line + the 5 popular features as chips.
  // v329: only when nothing else matched — "can you help me with finding fashion creators" got the chip list.
  if (/\b(what can you do|what do you do|kya kar sakt[ie]|kya kya kar|your features|help me with)\b/i.test(String(text)) && !detectBrandIntent(text)) {
    return {
      reply: say(lang, "I find and invite creators, draft campaigns and UGC briefs, and keep track of what needs you. Popular:", "Main creators dhoondh ke invite karti hoon, campaign aur UGC brief banati hoon, aur pending kaam batati hoon. Popular:"),
      card: { type: "chips", send: "value", chips: BRAND_POPULAR },
      state: st,
    };
  }

  let hit = detectBrandIntent(text);
  // Session 58: a real bug report ("payments page not loading") goes to the team, like on the creator side —
  // it used to be swallowed by the matching feature (payments, status…).
  if (hit && kind.type === "feedback" && kind.category === "bug") hit = null;
  // v435 (Eva question test #2/#4): a Ybex FAQ (escrow, refund, fees, KYC, delete account, support…) gets the fixed
  // answer right away — no AI wait, and it works when the AI is down.
  if (!hit && !isReport) { const kb = knowledge(text, lang, { role: "brand" }); if (kb && kb.topic !== "budget-ask") return { reply: kb.reply, state: st }; }
  // Rules didn't get it → ask the AI (only for real questions, never for small talk or bug reports).
  let aiData = null;
  let aiAsked = false; // v397: the AI was asked once already for this message
  if (!hit && !isReport && kind.type !== "greeting" && kind.type !== "thanks" && kind.type !== "bye" && String(text).trim().length > 6) {
    aiAsked = true;
    aiData = await T.askAi("understand", text, { history });
    if (aiData && aiData.intent && !["other", "help"].includes(aiData.intent)) {
      hit = { intent: aiData.intent, filters: { ...parseCreatorQuery(""), ...(aiData.filters || {}) }, names: aiData.names || [], budget: aiData.budget || 0 };
    }
  }
  if (!hit) {
    if (!isReport && kind.type !== "feedback" && String(text).trim().length > 1) {
      // v397 (AI Studio): no rule matched → Eva answers with the real AI instead of "didn't get that".
      // Not asked again when the first AI call just failed (no answer) — the person would wait twice for nothing.
      const chatReply = aiData?.reply || (aiAsked && !aiData ? null : (await T.askAi("chat", text, { history }))?.reply);
      if (chatReply) return { reply: String(chatReply).slice(0, 1000), state: st };
    }
    return null;
  }
  st.awaiting = null;
  // Session 58 (Eva settings): a switched-off permission means Eva doesn't read that data.
  const off = blockedSwitch("brand", hit.intent);
  if (off) return { reply: blockedReply("brand", off), card: { type: "evaSettings" }, state: st };

  switch (hit.intent) {
    case "creators": {
      const f = hit.filters || parseCreatorQuery(text);
      // v329: "top 5 creators" (a count, no filter) shows the top 5 by reach instead of asking again.
      if (!hasCreatorFilters(f) && f.count) return creatorsReply(await T.searchCreators({ ...f, sort: f.sort || "reach" }), { ...f, sort: f.sort || "reach" }, st, lang);
      // v329: the next message answers this ("fashion in Jaipur") — see awaiting "creatorFilters".
      if (!hasCreatorFilters(f)) return { reply: say(lang, "Which creators? Tell me a niche, a city, followers or a budget — e.g. \"Jaipur fashion creators 10k–50k, under ₹15k\".", /* v328: English example */ "Kaise creators chahiye? Niche, city, followers ya budget batao — jaise \"Jaipur fashion creators 10k–50k, ₹15k tak\"."), state: { ...st, awaiting: "creatorFilters" } };
      return creatorsReply(await T.searchCreators(f), f, st, lang);
    }
    case "budgetFit": {
      // v419: "10 creators 50k mein?" — answered with totals from the real rates; no single creator's rate is shown.
      const f = hit.filters || parseCreatorQuery(text);
      const found = await T.searchCreators(f);
      const r = budgetFit(found, hit);
      const label = describeFilters(f);
      const where = label ? ` (${label})` : "";
      if (!r.priced) return { reply: say(lang, `I couldn't find creators${where} with a rate set yet, so I can't check ${inr(hit.budget)}. Try a wider search, or post a campaign with this budget and let creators apply.`, `${where ? label + " ke " : ""}creators ke rate abhi set nahi mile, isliye ${inr(hit.budget)} check nahi kar payi. Search thoda bada karo, ya isi budget ka campaign post karo — creators khud apply karenge.`), state: { ...st, lastFilters: f } };
      let en, hi;
      if (hit.count) {
        en = r.enough
          ? `Yes — ${inr(hit.budget)} for ${hit.count} creators works${where}: that's about ${inr(r.per)} each, and ${r.under} creator${r.under === 1 ? "" : "s"} fit that. The ${hit.count} most affordable come to about ${inr(r.needFor)} in total.`
          : `${inr(hit.budget)} is tight for ${hit.count} creators${where} — about ${inr(r.per)} each, and only ${r.under} fit that. ${r.fit ? `This budget covers about ${r.fit} creator${r.fit === 1 ? "" : "s"}` : "No creator fits it yet"}${r.needFor ? `; ${hit.count} would need about ${inr(r.needFor)}` : ""}.`;
        hi = r.enough
          ? `Haan — ${inr(hit.budget)} mein ${hit.count} creators ho jayenge${where}: har ek ka ~${inr(r.per)}, aur ${r.under} creators isme fit hain. Sabse affordable ${hit.count} ka total ~${inr(r.needFor)} aata hai.`
          : `${inr(hit.budget)} mein ${hit.count} creators thoda tight hai${where} — har ek ka ~${inr(r.per)}, aur sirf ${r.under} fit hain. ${r.fit ? `Is budget mein ~${r.fit} creators aayenge` : "Abhi koi fit nahi hota"}${r.needFor ? `; ${hit.count} ke liye ~${inr(r.needFor)} chahiye` : ""}.`;
      } else {
        en = r.fit ? `${inr(hit.budget)} covers about ${r.fit} creator${r.fit === 1 ? "" : "s"}${where} (counting the most affordable first).` : `No creator${where} fits ${inr(hit.budget)} yet. Try a higher budget or a wider search.`;
        hi = r.fit ? `${inr(hit.budget)} mein ~${r.fit} creators aa jayenge${where} (sabse affordable pehle gine).` : `${inr(hit.budget)} mein abhi koi creator${where} fit nahi hota. Budget badhao ya search bada karo.`;
      }
      const note = say(lang, " Rates are each creator's own ask; final price is agreed in chat.", " Rate har creator ka apna hai; final price chat mein tay hoti hai.");
      const per = hit.count ? Math.floor(hit.budget / hit.count) : 0;
      const show = per ? found.filter((c) => { const x = Number(c?.rate_reel || c?.reel_rate || c?.rate_card?.reels || c?.rate_card?.reel || c?.base_rate || c?.rate || 0); return x > 0 && x <= per; }) : [];
      return {
        reply: say(lang, en, hi) + note + (show.length ? say(lang, " Here are the ones that fit:", " Ye fit hone wale creators hain:") : ""),
        card: show.length ? { type: "creators", items: show.slice(0, 12), total: show.length, filters: { ...f, maxRate: per } } : undefined,
        state: { ...st, lastFilters: f },
      };
    }
    case "invoice":
      return { reply: hit.list ? say(lang, "Opening your invoices.", "Aapki invoices khol rahi hoon.") : say(lang, "Let's make your invoice — free, saved to your account, ready as PDF or JPG.", "Chaliye invoice banate hain — free, account mein save, PDF ya JPG mein ready."), card: { type: "invoice", auto: true, text, role: "brand", view: hit.list ? "list" : null }, state: st };

    case "product": {
      const ai = await T.askAi("product_match", text, { history });
      const niches = (ai?.niches || []).filter((n) => NICHES.some((x) => x.label === n));
      const f = { ...parseCreatorQuery(text), niches: niches.length ? niches : nichesIn(text) };
      if (!f.niches.length) return { reply: say(lang, "Tell me in 2 lines what the product is (e.g. \"vitamin C face serum for women\") and I'll find matching creators.", "Product kya hai 2 line mein batao (jaise \"women ke liye vitamin C face serum\"), main matching creators dhoondh dungi." /* v328: Eva is feminine */), state: st };
      const res = creatorsReply(await T.searchCreators(f), f, st, lang);
      const why = ai?.reasons ? Object.entries(ai.reasons).map(([k, v]) => `${k}: ${v}`).join("\n") : "";
      return { ...res, reply: `${say(lang, "This product fits", "Ye product fit hota hai")} ${f.niches.join(" / ")} ${say(lang, "creators", "creators ke saath")}.${why ? `\n${why}` : ""}\n${res.reply}` };
    }
    case "compare": {
      const all = (hit.names && hit.names.length >= 2 ? hit.names : []);
      if (all.length < 2) return { reply: say(lang, "Write the names like: Riya vs Aman vs Kunal", "Naam aise likho: Riya vs Aman vs Kunal"), state: st };
      // v329: up to 3 side by side (a 4th made the table scroll sideways); the same creator twice counts once.
      const names = all.slice(0, 3);
      const seen = new Set();
      const rows = (await T.compareCreators(names)).map((r) => { if (!r.creator) return r; const k = String(cid(r.creator)); if (seen.has(k)) return null; seen.add(k); return r; }).filter(Boolean);
      const found = rows.filter((r) => r.creator);
      const missing = rows.filter((r) => !r.creator).map((r) => r.query);
      if (!found.length) return { reply: say(lang, "I couldn't find these names on Explore. Check the spelling or use their Instagram handle.", "Ye naam Explore par nahi mile. Spelling check karo ya Instagram handle likho."), state: st };
      // v329: one creator is not a comparison — say who was missing instead of a 1-row table.
      if (found.length < 2) return { reply: missing.length ? say(lang, `I found only ${nameOf(found[0].creator)} — couldn't find ${missing.join(", ")}. Check the spelling or use their Instagram handle.`, `Sirf ${nameOf(found[0].creator)} mile — ${missing.join(", ")} nahi mile. Spelling check karo ya Instagram handle likho.`) : say(lang, "Those names point to the same creator. Write two or three different names.", "Ye sab ek hi creator hain. Do-teen alag naam likho."), state: st };
      const more = all.length > 3 ? say(lang, " (first 3 — I compare up to 3 at a time)", " (pehle 3 — ek baar mein 3 tak)") : "";
      return { reply: `${say(lang, "Side by side", "Side by side")}${more}:`, card: { type: "compare", rows }, state: st };
    }
    case "applicants": {
      const { campaign, rows } = await T.rankApplicants(text);
      if (!campaign) return { reply: say(lang, "You have no campaign yet. Want to make one? Say \"create a campaign\".", /* v328: English */ "Abhi koi campaign nahi hai. Banani hai? Bolo \"campaign banani hai …\"."), state: st };
      if (!rows.length) return { reply: say(lang, `No applications on "${campaign.title || "your campaign"}" yet.`, `"${campaign.title || "Aapki campaign"}" par abhi koi application nahi aayi.`), state: st };
      return { reply: say(lang, `Best fits for "${campaign.title}" (niche, reach, budget fit):`, `"${campaign.title}" ke liye sabse fit applicants (niche, reach, budget fit):` /* v329: no "rate" wording to brands */), card: { type: "applicants", campaign, rows: rows.slice(0, 8), total: rows.length }, state: st };
    }
    case "alerts": {
      const items = await T.alertsNow();
      if (!items.length) return { reply: say(lang, "All clear — nothing is waiting on you right now. ✅", "Sab clear hai — abhi kuch bhi aapka wait nahi kar raha. ✅"), state: st };
      return { reply: say(lang, "These need you:", "Ye aapka wait kar rahe hain:"), card: { type: "alerts", items }, state: st };
    }
    case "report": {
      const r = await T.reportNow();
      return { reply: say(lang, `Your ${r.monthName} so far:`, `${r.monthName} ab tak:`), card: { type: "report", report: r, text: reportText(r, brandName) }, state: st };
    }
    case "status": {
      // v328: a money question ("payment hold", "how much paid", "spent") needs "Payments & reports" on.
      if (isMoneyAsk(text) && blockedSwitch("brand", "report")) return { reply: blockedReply("brand", "money"), card: { type: "evaSettings" }, state: st };
      const s = await T.statusSummary();
      const stages = Object.entries(s.byStage).map(([k, v]) => `${v} ${k.toLowerCase().replace(/_/g, " ")}`).join(", ");
      const lines = [
        `${say(lang, "Campaigns", "Campaigns")}: ${s.campaigns} (${s.live} live) · ${s.applications} ${say(lang, "applications", "applications")}`,
        `UGC: ${s.briefs} brief${s.briefs === 1 ? "" : "s"} · ${s.orders} order${s.orders === 1 ? "" : "s"}${stages ? ` (${stages})` : ""}`,
        // Session 58 (Eva settings): "Payments & reports" off → no money line.
        readEvaSettings().money ? (s.held == null ? say(lang, "Payment hold: couldn't check right now — your money is safe", "Payment hold: abhi check nahi ho paya — paise safe hain") /* v332 */ : `${say(lang, "In secure payment hold", "Secure payment hold mein")}: ${inr(s.held)}`) : "",
      ].filter(Boolean);
      const items = await T.alertsNow().catch(() => []);
      return { reply: lines.join("\n"), card: items.length ? { type: "alerts", items } : undefined, state: st };
    }
    case "ugcCreate": {
      const fromAi = aiData?.ugc ? Object.fromEntries(Object.entries(aiData.ugc).filter(([, v]) => v)) : {};
      return ugcStep(readUgcFields(text, fromAi), st, lang);
    }
    case "repeat": {
      const b = await T.lastBrief(hit.keyword);
      if (!b) return { reply: say(lang, "You haven't posted a UGC brief yet. Want to make one? Tell me the product and how many videos.", "Abhi tak koi UGC brief nahi hai. Banana hai? Product aur kitni videos chahiye batao."), state: st };
      return ugcStep(b, st, lang, say(lang, "Your last brief, ready again — change anything by typing (e.g. \"budget 3000\"), or:", "Pichla brief dobara ready hai — kuch badalna ho to likho (jaise \"budget 3000\"), ya:"));
    }
    case "campaignCreate": {
      // Session 58: step by step (9 questions). Anything already said (niche, budget) is filled in.
      const f = parseCreatorQuery(text);
      const pre = {};
      if (f.niches.length) pre.selectedCategories = f.niches.slice(0, 3);
      if (f.maxRate) { pre.isBudgetRange = false; pre.budget = String(f.maxRate); pre.budgetMin = String(f.maxRate); pre.budgetMax = String(f.maxRate); }
      return campaignStep(pre, st, "Let's build it together — 9 quick questions. Say \"cancel\" any time.\n");
    }
    case "write": {
      const product = (text.match(/\bfor\s+(?:my\s+)?([\w\s'-]{2,40})/i) || text.match(/([\w'-]{2,30})\s+ke\s+liye/i) || [])[1] || "";
      const ai = await T.askAi("write", text, { history });
      const body = ai?.text || templateScript(product.trim() || "your product");
      return { reply: ai?.text ? say(lang, "Here you go:", "Ye lo:") : say(lang, "Here are tested formats (AI is off right now):", "Ye tested formats hain (AI abhi band hai):"), card: { type: "text", title: "Hooks · script · caption", text: body }, state: st };
    }
    case "planner": {
      const budget = hit.budget || aiData?.budget || 0;
      if (!budget) return { reply: say(lang, "What's the total budget? (e.g. \"Diwali plan ₹1 lakh\")", "Total budget kitna hai? (jaise \"Diwali plan ₹1 lakh\")"), state: st };
      const plan = festivalPlan(text, budget);
      const ai = await T.askAi("plan", text, { history, context: plan });
      return { reply: say(lang, `${plan.title} for ${inr(budget)}:`, `${plan.title} — ${inr(budget)}:`), card: { type: "plan", plan, text: ai?.text || "" }, state: st };
    }
    case "briefCheck": {
      const cur = T.currentDraft();
      if (!cur) return { reply: say(lang, "Paste your brief here and I'll check it.", "Apna brief yahan paste karo, main check kar dungi." /* v328: Eva is feminine */), state: { ...st, awaiting: "briefText" } };
      return briefCheckReply(cur.data, st, lang, cur.kind);
    }
    case "saveSearch": {
      const f = hasCreatorFilters(parseCreatorQuery(text)) ? parseCreatorQuery(text) : st.lastFilters;
      if (!f || !hasCreatorFilters(f)) return { reply: say(lang, "First search creators (e.g. \"Jaipur fashion creators\"), then say \"alert me when new ones join\".", /* v328: English */ "Pehle creators search karo (jaise \"Jaipur fashion creators\"), phir bolo \"naye aaye to batana\"."), state: st };
      const label = describeFilters(f) || "creators";
      const where = await T.saveSearch(f, label).catch(() => "phone");
      if (where === "server") return { reply: say(lang, `Saved "${label}". When a new creator matches, you'll get a notification on your phone (and I'll show them here).`, `"${label}" save kar liya. Naya creator match hote hi phone pe notification aayega (aur yahan bhi dikha dungi).` /* v328 */), state: st };
      return { reply: say(lang, `Saved "${label}". When new creators match, I'll tell you as soon as you open this chat.`, `"${label}" save kar liya. Naye creators match hote hi, chat kholte hi bata dungi.` /* v328 */), state: st };
    }
    case "handoff": {
      const summary = history.filter((h) => h.user).slice(-5).map((h) => `• ${String(h.text).slice(0, 120)}`).join("\n");
      return { reply: say(lang, "Your Campaign Manager can take it from here — the chat summary goes with your message:", "Aapke Campaign Manager aage sambhal lenge — chat ka summary message ke saath jayega:"), card: { type: "handoff", number: WA_NUMBER, text: `Hi YBEX Team, I am ${brandName || "a brand"} on Ybex. I need help with:\n${summary || text}` }, state: st };
    }
    default:
      return null;
  }
}

function creatorsReply(found, f, st, lang) {
  const count = pageSize(f); // v328: was 20 while the card shows 12 → "show more" skipped 13–20
  const label = describeFilters(f);
  if (!found.length) {
    if (f.maxRate) return { reply: say(lang, `No creators fit ${inr(f.maxRate)} per creator for ${label || "this search"} yet. Try a slightly higher budget, or tap "Alert me" next time to hear when new ones join.`, `${inr(f.maxRate)} per creator mein abhi koi creator fit nahi hua. Budget thoda badha ke try karo.`), state: { ...st, lastFilters: f } };
    return { reply: say(lang, `No creators for ${label} yet. Try without the reach limit or a nearby city, or say "alert me" to hear when new ones join.`, `${label} ke creators abhi nahi mile. Rate / reach ki limit hata ke try karo, paas ka shehar likho, ya bolo "naye aaye to batana".`), state: { ...st, lastFilters: f } };
  }
  const items = found.slice(0, count);
  // v419: "5 male 5 female" — say plainly when there aren't enough of one.
  if (f.split) {
    const m = found.filter((c) => /^m/i.test(c.gender || "")).length, w = found.length - m;
    if (m < f.split.male || w < f.split.female) return { reply: say(lang, `Only ${m} male and ${w} female creator${w === 1 ? "" : "s"} match${describeFilters({ ...f, split: null }) ? ` (${describeFilters({ ...f, split: null })})` : ""} — you asked for ${f.split.male} + ${f.split.female}. Here's who fits:`, `Sirf ${m} male aur ${w} female creators mile${describeFilters({ ...f, split: null }) ? ` (${describeFilters({ ...f, split: null })})` : ""} — aapne ${f.split.male} + ${f.split.female} maange the. Ye fit hain:`), card: { type: "creators", items, total: found.length, filters: f }, state: { ...st, lastFilters: f, page: 1, lastResults: items.map((c) => c.user_id || c.id) } };
  }
  return {
    // Session 58 (handoff §7.1): with a budget, only creators whose (private) rate fits are shown — never the rates.
    reply: f.maxRate
      ? say(lang, `Found ${found.length} creator${found.length > 1 ? "s" : ""} who fit your ${inr(f.maxRate)} budget per creator. Tick and invite:`, `${found.length} creator mile jo aapke ${inr(f.maxRate)} per creator budget mein fit hain. Tick karo aur invite bhejo:`)
      : say(lang, `${found.length} creator${found.length > 1 ? "s" : ""} found${label ? ` (${label})` : ""}${found.length > items.length ? ` — top ${items.length}` : ""}. Tick and invite:`, `${found.length} creator mile${label ? ` (${label})` : ""}${found.length > items.length ? ` — top ${items.length}` : ""}. Tick karo aur invite bhejo:`),
    card: { type: "creators", items, total: found.length, filters: f },
    state: { ...st, lastFilters: f, page: 1, lastResults: items.map((c) => c.user_id || c.id) },
  };
}

function campaignStep(c, st, lead = "") {
  const q = nextCampaignQuestion(c);
  if (q) return { reply: `${lead}${q.ask}`, card: { type: "question", flow: "campaign", ...q }, state: { ...st, awaiting: "campaign", camp: c } }; // v328: tagged box
  const draft = campaignBuilderDraft(c);
  return { reply: "Your campaign draft is ready. Save it, or review and publish:", card: { type: "campaignDraft", draft }, state: { ...st, awaiting: null, camp: null, campaign: draft } };
}

function ugcStep(ugc, st, lang, lead) {
  const q = nextUgcQuestion(ugc);
  // Session 58: the question box (label, n of N, progress, options / text box) instead of a chip row.
  if (q) return { reply: q.ask, card: { type: "question", flow: "ugc", ...q }, state: { ...st, awaiting: "ugc", ugc } }; // v328: tagged box
  const draft = ugcDraftFrom(ugc);
  try { T.rememberUgcDraft(ugc); } catch { /* v345: never block the reply */ } // v345: it also shows on the UGC screen as a draft
  return {
    reply: lead || say(lang, "UGC brief ready. Change anything by typing (e.g. \"budget 3000\", \"5 videos\"), or open it to pay:", "UGC brief ready hai. Kuch badalna ho to likho (jaise \"budget 3000\", \"5 videos\"), ya kholke pay karo:"),
    card: { type: "ugcDraft", draft },
    state: { ...st, awaiting: "ugcReview", ugc },
  };
}

async function briefCheckReply(data, st, lang, kind = "") {
  const rules = checkBrief(data);
  const ai = await T.askAi("brief_check", JSON.stringify(data).slice(0, 1800));
  const issues = [...new Set([...(rules.issues || []), ...((ai?.issues || []).slice(0, 3))])].slice(0, 6);
  return { reply: say(lang, "Brief check:", "Brief check:"), card: { type: "briefCheck", score: Math.max(10, 100 - issues.length * 15), issues, good: rules.good, betterTitle: ai?.better_title || "", kind }, state: { ...st, awaiting: null } };
}
