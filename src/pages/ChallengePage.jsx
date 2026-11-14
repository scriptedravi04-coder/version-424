import React, { useEffect, useState } from "react";
import PlayStoreBanner from "../components/common/PlayStoreBanner"; // v418
import { noteOfferVisit, DIWALI_ADD_PATH } from "../lib/afterSignup"; // v376, v377
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Share2, Trophy, Eye, Heart, Copy, ShieldCheck, BadgeCheck, Landmark, ChevronDown, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { getChallengePublic, getMyChallenge, remindMe } from "../lib/challengeApi";
import {
  CHALLENGE_NAME, HASHTAG, MENTION, MAX_ENTRIES, RANK_LABEL, RANKS, phaseAt, datesFrom, dayText, dayTimeText, prizesFrom, sponsorsFrom, scriptsFrom, RECHARGE_AMOUNT, RECHARGE_SLOTS, RECHARGE_DAYS, reelsFrom, headlineFrom, SOCIAL_PROOF_MIN,
} from "../lib/diwaliChallenge";
import { UPI_LOGO, GPAY_LOGO, PHONEPE_LOGO, PAYTM_LOGO } from "../components/challenge/payLogos"; // v377
import { CashRain } from "../components/challenge/ChallengeUi"; // v377
import { Countdown, StringLights, shareChallenge, useNow, SAFFRON, MARIGOLD, DEEP, ExampleReel } from "../components/challenge/ChallengeUi";

// v367 (Ravi's design 2a): /challenge — the only page with its own loud festive look. Works without login (ads and
// the Instagram bio link land here). Order follows what people ask: what is it, when does it close, what do I win,
// how do I enter. Join is always on screen (pinned bar):
//   logged out → sign up as a creator · onboarding not done → onboarding · done → Portfolio → Add collabs.
// From results day the same page shows the winners. Dates, prizes, sponsors: Admin → Challenge entries → Sponsors & prizes.

const ROYAL = "#1E3FB8";
// v371 (Ravi: "proper English, offer real aur trusted lage"): plain answers to what people ask before they join
// v377 (Ravi, "Diwali Challenge v2: Easy Entry"): any reel of your own works; ₹50 recharge for the first 300
const FAQ = [
  ["Does my reel have to be about Ybex?", "No. Any reel of your own works. Just follow @ybex.in, tag @ybex.in and add #Ybex and #YbexDiwaliChallenge in the caption."], // v396: + follow
  ["What is the ₹300 cash?", `The first ${RECHARGE_SLOTS} creators with a complete Ybex profile (photo, niche & bio, Instagram, rate card, past work) get ${RECHARGE_AMOUNT} cash, paid to the payout details you add in KYC. The Ybex finance team sends it within 1–2 days of approval.`], // v388 (QA): was still "₹50 by UPI … within 7 days"
  ["Is it free to join?", "Yes. There is no joining fee. It's free for every Instagram creator in India."],
  ["Do I need a lot of followers?", "No. Winners are picked on the reel — views, likes and how good it is — not on follower count. 50 creators win."],
  ["How do I get paid?", "Cash prizes go straight to your bank account after a quick KYC on Ybex, within 7 working days of the results."],
  ["How are winners picked?", "The Ybex team reviews every valid entry and ranks them on views, likes and quality. Winners are listed publicly on this page."],
  ["Can I enter more than one reel?", "Yes, up to 3 reels per creator. Each one gets its own entry number."],
];
const STEPS = [
  ["Post any reel of your own", "Any topic. It doesn't have to be about Ybex."],
  [`Tag ${MENTION} and add #Ybex ${HASHTAG}`, "All three in the caption. Follow @ybex.in and keep the reel public."] /* v396: + follow */,
  ["Join Ybex free and add the reel", "Add it to your Ybex Portfolio. \u201cSubmit to Diwali Challenge\u201d is already on. Entry done."],
];

function Display({ children, size = 64 }) {
  return (
    <span className="block font-black leading-[0.9]" style={{
      fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif", fontSize: size, letterSpacing: "-1px",
      color: MARIGOLD, textShadow: `0 2px 0 #E8901A, 0 4px 0 ${DEEP}, 0 10px 18px rgba(120,10,20,.35)`,
    }}>{children}</span>
  );
}

function WinnerCard({ w }) {
  return (
    <a href={w.content_url} target="_blank" rel="noopener noreferrer" className="block rounded-[22px] bg-white overflow-hidden border border-amber-200">
      <div className="relative aspect-[4/5] bg-amber-50">
        {w.cover && <img src={w.cover} alt={`${w.name}'s reel`} className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" />}
        <span className="absolute left-2 top-2 h-7 px-2.5 rounded-full text-[12px] font-black text-white inline-flex items-center gap-1" style={{ background: DEEP }}>
          <Trophy size={13} /> {RANK_LABEL[w.rank]}
        </span>
      </div>
      <div className="p-2.5">
        <div className="text-[13.5px] font-black text-slate-900 truncate">{w.name || `@${w.handle}`}</div>
        <div className="text-[11.5px] font-semibold text-slate-500 flex gap-2">
          {w.handle && <span className="truncate">@{w.handle}</span>}
          {w.views > 0 && <span className="inline-flex items-center gap-0.5"><Eye size={11} />{w.views.toLocaleString("en-IN")}</span>}
          {!w.views && w.likes > 0 && <span className="inline-flex items-center gap-0.5"><Heart size={11} />{w.likes.toLocaleString("en-IN")}</span>}
        </div>
      </div>
    </a>
  );
}

function useRyeFont() { // the "Diwali" lettering in the v3 design
  useEffect(() => {
    if (document.getElementById("yb-rye-font")) return;
    const l = document.createElement("link");
    l.id = "yb-rye-font"; l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=Rye&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap";
    document.head.appendChild(l);
  }, []);
}

export default function ChallengePage() {
  const navigate = useNavigate();
  useRyeFont();
  const { user } = useAuth() || {};
  const [info, setInfo] = useState(null);
  const [me, setMe] = useState(null);
  const [offset, setOffset] = useState(0); // server time − phone time, so the countdown never trusts the phone clock
  const phoneNow = useNow(1000);
  const now = phoneNow + offset;
  const dates = datesFrom(info); // v369: close / results dates from Admin (server)
  const phase = phaseAt(now, dates);

  useEffect(() => {
    document.title = `Ybex ${CHALLENGE_NAME} · make a reel, win big`;
    getChallengePublic().then((d) => { setInfo(d); if (d?.now) setOffset(Number(d.now) - Date.now()); }).catch(() => {});
  }, []);
  useEffect(() => { if (user?.role === "creator") getMyChallenge().then(setMe); }, [user?.user_id]); // eslint-disable-line react-hooks/exhaustive-deps
  // v376 (Ravi: "offer page se aaye creator ko signup ke baad seedha challenge page pe bhejo"): remember the visit;
  // the sign-up screens send a NEW creator back here with ?joined=1 → "Add your reel" card on top.
  useEffect(() => { if (!user) noteOfferVisit(); }, [user]);
  const justJoined = (() => { try { return new URLSearchParams(window.location.search).get("joined") === "1"; } catch { return false; } })();

  const [ask, setAsk] = useState(false); // v371: "Is your reel ready?"
  const [openFaq, setOpenFaq] = useState(0);
  const head = headlineFrom(info?.config);
  const showCount = (n) => Number(n) >= SOCIAL_PROOF_MIN; // small numbers put people off
  const isCreator = !user || user.role === "creator";
  const myCount = me?.entries?.length || 0;
  const join = () => {
    if (!user) { navigate("/signup?role=creator"); return; }
    if (user.role !== "creator") return;
    // v371: a name + email or phone is enough to enter (Instagram username is asked when tagging) — no full onboarding
    if (me && me.eligible === false) { navigate("/onboarding"); return; }
    setAsk(true);
  };
  const addReel = () => { setAsk(false); navigate(DIWALI_ADD_PATH); }; // v377: "Add your Diwali reel" (toggle ON, no brand question)
  const later = async () => {
    setAsk(false); // v387: close the question first — it used to stay open until the request finished
    try { await remindMe(); toast.success(`You're in. We'll remind you before entries close on ${dayText(dates.closesAt)}.`); setMe((m) => (m ? { ...m, remind: true } : m)); }
    catch (e) { toast.error(e.message); }
  };
  const joinLabel = phase === "soon" ? "Opens soon" : phase !== "open" ? "Entries closed"
    : !user ? "Join Challenge" : !isCreator ? "For creators only"
      : myCount >= MAX_ENTRIES ? "All 3 entries used" : myCount ? "Add another reel" : "Add your reel"; // v376: logged-in creators see "Add your reel"
  const canJoin = phase === "open" && isCreator && myCount < MAX_ENTRIES;
  const winners = info?.winners || [];
  // v368: sponsors (name, logo, scripts) and prizes come from Admin → Challenge entries → Sponsors & prizes
  const SPONSORS = sponsorsFrom(info?.config);
  const PRIZES = prizesFrom(info?.config);
  const scripted = SPONSORS.filter((x) => x.scripts && x.scripts.length);
  const looseScripts = scriptsFrom(info?.config); // v376: scripts added in Admin without a brand name / logo
  const reels = reelsFrom(info?.config); // v371: example reels from Admin
  const poolAmount = (String(head.pool || "").match(/₹[\d,]+/) || ["₹1,00,000"])[0]; // v377: the big number in the hero
  const rechargeLeft = Number(info?.recharge_left ?? RECHARGE_SLOTS);
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast.success("Script copied"); } catch { toast(t); } };

  return (
    <div className="min-h-[100dvh] w-full" style={{ background: `radial-gradient(130% 900px at 50% 300px, #FFFFFF 0, #FFFDF7 12%, #FFE2B8 22%, #FF9A3D 38%, #F0501E 58%, ${DEEP} 100%)`, fontFamily: "'Plus Jakarta Sans','DM Sans',sans-serif" }}
      data-statusbar="#FFB255" data-testid="challenge-page">
      <PlayStoreBanner page="offer" />{/* v418: Android browsers get the Play Store app first */}
      <div className="mx-auto max-w-[520px] relative pb-[calc(110px+env(safe-area-inset-bottom))]">
        <StringLights className="absolute left-0 right-0 top-[env(safe-area-inset-top)] w-full h-9" count={16} />

        <header className="relative flex items-center justify-between px-4 pt-[calc(12px+env(safe-area-inset-top))]">
          <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))} aria-label="Back"
            className="w-10 h-10 rounded-full bg-white/70 backdrop-blur flex items-center justify-center text-slate-800 mt-6"><ArrowLeft size={18} /></button>
          <button type="button" onClick={shareChallenge} aria-label="Share"
            className="w-10 h-10 rounded-full bg-white/70 backdrop-blur flex items-center justify-center text-slate-800 mt-6"><Share2 size={17} /></button>
        </header>

        {/* v376: just signed up from the offer page → the next step, right on top */}
        {justJoined && user && isCreator && phase === "open" && myCount === 0 && (
          <section className="mx-3 mt-4 mb-4 rounded-[24px] bg-white px-5 py-5 text-center shadow-[0_18px_40px_-18px_rgba(80,0,0,.6)]" data-testid="challenge-joined">
            <div className="text-[30px]" aria-hidden="true">🎉</div>
            <h2 className="mt-1 text-[21px] font-black text-slate-900 leading-tight">You're on Ybex{user?.name && !String(user.name).startsWith("@") ? `, ${String(user.name).split(" ")[0]}` : ""}!</h2>
            <p className="mt-1.5 text-[13.5px] text-slate-600 leading-snug">Follow {MENTION}, post your reel on Instagram with {MENTION} and {HASHTAG}, then add it here to get your entry number.</p>
            <button type="button" onClick={addReel} data-testid="challenge-add-reel" className="mt-4 w-full h-[54px] rounded-full bg-[#7C3AED] text-white text-[16px] font-bold">Add your reel</button>
            <button type="button" onClick={later} className="mt-2 w-full h-11 rounded-full bg-slate-100 text-[14px] font-bold text-slate-800">Reel not ready yet — remind me</button>
          </section>
        )}

        {/* hero · v377 (Ravi's "Diwali Challenge v3" design, screen 3a): reward first, one big register button */}
        <section className="relative text-center px-5 pt-2" data-testid="offer-hero">
          <div className="flex flex-col items-center gap-3.5">
            <div className="inline-flex items-center gap-2 rounded-[14px] py-[5px] pl-3.5 pr-1.5 bg-[#E8282B]" style={{ boxShadow: "0 4px 0 #12807C" }}>
              <span style={{ fontFamily: "'Rye','Playfair Display',Georgia,serif", fontSize: 24, lineHeight: 1, color: "#FFE14D", textShadow: "0 2px 0 #6B0A12" }}>Diwali</span>
              <span className="h-6 px-2.5 rounded-[7px] bg-[#2346C9] inline-flex items-center text-[11px] font-extrabold tracking-[1.8px] text-white whitespace-nowrap">CREATOR CHALLENGE</span>
            </div>
            <div className="flex flex-col items-center gap-0.5" data-testid="prize-pool">
              <h1 className="text-[15px] leading-[1.35] font-extrabold text-[#3A0A0E]" style={{ textWrap: "balance" }} data-testid="offer-subline">
                Apni reel me <span className="text-[#7C3AED]">#Ybex</span> use karo &amp; <span className="text-[#7C3AED]">{MENTION}</span> follow + tag karo, jeeto
              </h1>
              <div className="text-[54px] leading-none font-extrabold text-[#B8141F] tracking-[-2px]" data-testid="prize-amount">{poolAmount}</div>
              <div className="mt-1 text-[13px] font-semibold text-[#3A0A0E]">Prize pool · {head.winners} · Free entry</div>
            </div>

            {/* ₹50 UPI card */}
            <div className="relative w-full text-left" style={{ filter: "drop-shadow(0 8px 16px rgba(120,10,20,.18))" }} data-testid="recharge-counter">
              <div className="relative rounded-t-2xl border-2 border-b-0 border-[#9ED9C2] pl-4 pr-3.5 pt-[13px] pb-3 flex items-center gap-2.5 overflow-hidden" style={{ background: "linear-gradient(180deg,#FFF6D6 0,#FFFBEF 100%)" }}>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <div className="text-[18px] leading-tight font-extrabold text-[#0E9F6E] whitespace-nowrap">{RECHARGE_AMOUNT} FREE CASH</div>
                  <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#3A3A44] whitespace-nowrap">First {RECHARGE_SLOTS} creators · Paid to <img src={UPI_LOGO} alt="UPI" className="h-[11px] w-auto block" /></div>
                  <div className="self-start flex items-center gap-1.5 h-6 pl-2 pr-2.5 rounded-xl bg-white text-[11.5px] font-extrabold text-[#C2410C] whitespace-nowrap">
                    <span className="w-[7px] h-[7px] rounded-full bg-[#E8282B]" aria-hidden="true" />
                    Only {rechargeLeft.toLocaleString("en-IN")} left
                  </div>
                  <div className="self-start flex items-center gap-2.5 h-7 px-3 rounded-[14px] bg-white border border-[#F0E2CC]">
                    <img src={GPAY_LOGO} alt="Google Pay" className="h-[11px] w-auto block" />
                    <span className="w-px h-3 bg-[#E5E5EA]" aria-hidden="true" />
                    <img src={PHONEPE_LOGO} alt="PhonePe" className="h-[13px] w-auto block" />
                    <span className="w-px h-3 bg-[#E5E5EA]" aria-hidden="true" />
                    <img src={PAYTM_LOGO} alt="Paytm" className="h-[11px] w-auto block" />
                  </div>
                </div>
                <CashRain />
              </div>
              <div className="h-[9px]" aria-hidden="true" style={{ background: "radial-gradient(circle at 6px 0,transparent 5.5px,#FFFBEF 6px) 0 0/12px 9px repeat-x" }} />
            </div>

            <button type="button" onClick={join} disabled={!!user && !canJoin} data-testid="offer-register"
              className="w-full h-[58px] rounded-full bg-[#7C3AED] text-white text-[17px] font-extrabold inline-flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ boxShadow: "0 6px 0 #4C1D95, 0 14px 28px rgba(124,58,237,.4)" }}>
              {!user ? "Free me register karo" : joinLabel}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
            <div className="-mt-0.5 flex items-center gap-2.5">
              <div className="flex pl-[5px]" aria-hidden="true">
                {["30% 12%", "62% 10%", "80% 30%", "45% 40%"].map((pos) => (
                  <span key={pos} className="w-[18px] h-[18px] rounded-full border-[1.5px] border-white -ml-[5px] shrink-0"
                    style={{ background: `#F0E2CC url(/challenge-hero.webp) ${pos}/420% no-repeat`, boxShadow: "0 2px 6px rgba(120,10,20,.18)" }} />
                ))}
              </div>
              <span className="text-[12.5px] font-bold text-[#3A0A0E]" data-testid="joined-count">
                {Number(info?.creators) > 0 ? `${Number(info.creators).toLocaleString("en-IN")} creator${Number(info.creators) === 1 ? "" : "s"} already joined` : `Be one of the first ${RECHARGE_SLOTS}`}
              </span>
            </div>
            <div className="-mt-1.5 text-[11px] font-semibold text-[#3A0A0E]/60">*T&amp;C apply · {RECHARGE_AMOUNT} for the first {RECHARGE_SLOTS} approved creators</div>
          </div>
          <img src="/challenge-hero.webp" alt="Creators making reels at Diwali" className="mt-2 w-full max-w-[480px] mx-auto select-none" style={{ filter: "drop-shadow(0 16px 24px rgba(120,10,20,.3))" }} draggable="false" />
          {/* sponsors sit under the hero now (the first screen is for the reward) */}
          {SPONSORS.length > 0 && (() => {
            const isNote = (s) => !s.logo && /^\s*t\s*&\s*c\b|terms/i.test(String(s.name || ""));
            const brands = SPONSORS.filter((s) => !isNote(s));
            return brands.length > 0 ? (
              <div className="mt-1 mb-3">
                <div className="text-[11px] font-black tracking-[0.2em] text-white/90">POWERED BY</div>
                <div className="mt-1.5 inline-flex flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-2xl bg-white/90 px-4 py-2" data-testid="powered-by">
                  {brands.map((s) => s.logo
                    ? <img key={s.name} src={s.logo} alt={s.name} title={s.name} className="h-6 max-w-[96px] object-contain" />
                    : <span key={s.name} className="text-[13px] font-black text-[#3B0A06]">{s.name}</span>)}
                </div>
              </div>
            ) : null;
          })()}
        </section>

        {/* deadline band (truck-art blue) */}
        <section className="mx-3 -mt-2 rounded-[26px] px-4 py-5 text-center relative overflow-hidden" style={{ background: ROYAL, boxShadow: "inset 0 0 0 4px #F4C531, inset 0 0 0 8px #1E3FB8, inset 0 0 0 10px #E8455B" }}>
          {phase === "open" || phase === "soon" ? (
            <>
              <div className="text-[13px] font-black tracking-[0.14em] text-[#FFD15C]">{phase === "soon" ? `OPENS ON ${dayText(dates.startsAt).toUpperCase()}` : "ENTRIES CLOSE IN"}</div>
              <div className="mt-3"><Countdown now={now} target={phase === "soon" ? dates.startsAt : dates.closesAt} /></div>
              <div className="mt-3 text-[13px] font-bold text-white/90">Entries close {dayTimeText(dates.closesAt)} · Winners on {dayText(dates.resultsAt)}</div>
            </>
          ) : phase === "judging" ? (
            <>
              <div className="text-[22px] font-black text-[#FFD15C]">Entries are closed</div>
              <div className="mt-1 text-[13.5px] font-bold text-white/90">We're picking the winners. Results on {dayText(dates.resultsAt)}.</div>
            </>
          ) : (
            <>
              <div className="text-[22px] font-black text-[#FFD15C]">The winners are here</div>
              <div className="mt-1 text-[13.5px] font-bold text-white/90">{winners.length ? "Thank you to every creator who entered." : "Results are being finalised. Check back soon."}</div>
            </>
          )}
          {showCount(info?.entries) && <div className="mt-2 text-[12px] font-semibold text-white/75">{info.entries.toLocaleString("en-IN")} entries so far</div>}
        </section>

        {/* winners (from results day) */}
        {(phase === "results" || phase === "over") && winners.length > 0 && (
          <section className="mx-3 mt-4 rounded-[26px] bg-[#FFF7EC] p-4">
            <h2 className="text-[22px] font-black text-slate-900">Winners</h2>
            {RANKS.map((r) => {
              const list = winners.filter((w) => w.rank === r);
              if (!list.length) return null;
              return (
                <div key={r} className="mt-3">
                  <div className="text-[12px] font-black text-[#B8141F] mb-2">{RANK_LABEL[r]}</div>
                  <div className="grid grid-cols-2 gap-2.5">{list.map((w) => <WinnerCard key={`${w.user_id}-${w.no}`} w={w} />)}</div>
                </div>
              );
            })}
          </section>
        )}

        {/* prizes */}
        <section className="mx-3 mt-4 rounded-[26px] bg-[#FFF7EC] p-4">
          <h2 className="text-[22px] font-black text-slate-900">Prizes</h2>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {PRIZES.map((p, i) => (
              <div key={p.rank} className={`rounded-[20px] p-3.5 ${i === 0 ? "col-span-2" : ""}`}
                style={{ background: i === 0 ? `linear-gradient(135deg, ${MARIGOLD}, ${SAFFRON})` : "#fff", border: i === 0 ? "none" : "1px solid #FBD9A8" }}>
                <div className={`text-[11px] font-black tracking-[0.12em] ${i === 0 ? "text-[#5A1405]" : "text-[#B8141F]"}`}>{p.title.toUpperCase()}</div>
                <div className={`mt-1 font-black leading-tight ${i === 0 ? "text-[24px] text-[#2B0806]" : "text-[16px] text-slate-900"}`}>{p.value}</div>
                {p.note && <div className={`mt-0.5 text-[12px] font-semibold ${i === 0 ? "text-[#5A1405]/80" : "text-slate-500"}`}>{p.note}</div>}
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-[20px] p-3.5 border-2 border-dashed border-[#F4A340] bg-white flex gap-3 items-start" data-testid="everyone-wins">
            <span className="text-[26px] leading-none" aria-hidden="true">🎁</span>
            <span className="min-w-0">
              <span className="block text-[15px] font-black text-slate-900">Everyone who enters wins</span>
              <span className="block text-[12.5px] text-slate-600 font-medium leading-snug">{head.everyone}</span>
            </span>
          </div>
          <p className="mt-3 text-[11px] text-slate-500 leading-snug">Winners are picked on views, likes and reel quality. Prizes are subject to applicable taxes and are paid after a completed KYC. Ybex's decision is final.</p>
        </section>

        {/* v371: why people can trust this */}
        <section className="mx-3 mt-4 rounded-[26px] bg-white/90 p-4" data-testid="trust">
          <h2 className="text-[18px] font-black text-slate-900">How you get paid</h2>
          <div className="mt-3 space-y-3">
            {[
              [Landmark, "Straight to your bank", "Cash prizes are sent to your bank account within 7 working days of the results, after a quick KYC."],
              [BadgeCheck, "Winners shown publicly", `Every winner is listed on this page on ${dayText(dates.resultsAt)}, with their reel.`],
              [ShieldCheck, "Run by the Ybex team", "Questions? Write to support@ybexmedia.in — we reply to every message."],
            ].map(([Icon, t, d]) => (
              <div key={t} className="flex gap-3">
                <span className="w-10 h-10 rounded-2xl bg-[#FFF1DF] text-[#B8141F] flex items-center justify-center shrink-0"><Icon size={19} /></span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-black text-slate-900">{t}</span>
                  <span className="block text-[12.5px] text-slate-600 font-medium leading-snug">{d}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* steps (monochrome orange, big numbers) */}
        <section className="mx-3 mt-4 rounded-[26px] p-4" style={{ background: "#FF6A13" }}>
          <div className="flex items-end gap-3">
            <span className="text-[86px] font-black leading-[0.8] text-[#FFD9B8]">{STEPS.length}</span>
            <h2 className="text-[24px] leading-[1.05] font-black text-white pb-1">steps.<br />Any reel.</h2>
          </div>
          <ol className="mt-4 space-y-2.5">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="flex gap-3 rounded-[20px] bg-[#FF8A3D] p-3.5">
                <span className="text-[34px] font-black leading-none text-white/90 w-7 text-center">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-[15.5px] font-black text-white leading-snug break-words">{t}</span>
                  <span className="block text-[12.5px] font-semibold text-white/85 leading-snug">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* v371: example reels (Admin → Sponsors & prizes → Example reels) */}
        {reels.length > 0 && (
          <section className="mx-3 mt-4 rounded-[26px] bg-[#FFF7EC] p-4" data-testid="example-reels">
            <h2 className="text-[22px] font-black text-slate-900">See an example</h2>
            <p className="text-[13px] text-slate-600 font-medium">Any reel works. Just add the tag and the hashtags in the caption.</p>
            <div className={`mt-3 -mx-1 px-1 flex gap-2.5 overflow-x-auto pb-1 snap-x ${reels.length === 1 ? "justify-center" : ""}`}>
              {reels.map((r, i) => <ExampleReel key={r.url} reel={r} index={i} />)}
            </div>
          </section>
        )}

        {/* v376 (Ravi): "Reel ideas" section removed */}

        {/* v368: sponsor scripts (Admin → Sponsors & prizes) */}
        {(scripted.length > 0 || looseScripts.length > 0) && (
          <section className="mx-3 mt-4 rounded-[26px] bg-[#FFF7EC] p-4" data-testid="sponsor-scripts">
            <h2 className="text-[22px] font-black text-slate-900">{scripted.length ? "Brand scripts" : "Reel scripts"}</h2>
            <p className="text-[13px] text-slate-600 font-medium">Shoot one{scripted.length ? " for a sponsor" : ""}. Keep {MENTION} + {HASHTAG} in the caption{scripted.length ? " and tag the brand in your Ybex Portfolio" : ""}.</p>
            {/* v376 (Ravi: "T&C apply se upar, chota sa"): your own reel can win too */}
            <p className="mt-2 text-[12.5px] text-[#9A3412] font-bold leading-snug" data-testid="own-reel-line">✨ Or make your own reel about Ybex, your way. If it's good, it can win too.</p>
            {looseScripts.length > 0 && (
              <div className="mt-3 space-y-2" data-testid="loose-scripts">
                {looseScripts.map((t, i) => (
                  <div key={i} className="rounded-[18px] bg-white border border-amber-200 p-3 flex gap-2">
                    <p className="flex-1 text-[13px] text-slate-700 font-medium leading-snug whitespace-pre-line">{t}</p>
                    <button type="button" onClick={() => copy(t)} aria-label={`Copy script ${i + 1}`} className="w-9 h-9 rounded-full bg-amber-50 text-amber-800 flex items-center justify-center shrink-0"><Copy size={15} /></button>
                  </div>
                ))}
              </div>
            )}
            {scripted.map((sp) => (
              <div key={sp.name} className="mt-3">
                <div className="flex items-center gap-2 mb-2">
                  {sp.logo && <img src={sp.logo} alt="" className="h-6 max-w-[80px] object-contain" />}
                  <span className="text-[15px] font-black text-slate-900">{sp.name}</span>
                </div>
                <div className="space-y-2">
                  {sp.scripts.map((t, i) => (
                    <div key={i} className="rounded-[18px] bg-white border border-amber-200 p-3 flex gap-2">
                      <p className="flex-1 text-[13px] text-slate-700 font-medium leading-snug whitespace-pre-line">{t}</p>
                      <button type="button" onClick={() => copy(t)} aria-label={`Copy ${sp.name} script ${i + 1}`} className="w-9 h-9 rounded-full bg-amber-50 text-amber-800 flex items-center justify-center shrink-0"><Copy size={15} /></button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* v371: questions people ask before they join */}
        <section className="mx-3 mt-4 rounded-[26px] bg-white/90 p-4" data-testid="faq">
          <h2 className="text-[18px] font-black text-slate-900">Questions</h2>
          <div className="mt-2 divide-y divide-amber-100">
            {FAQ.map(([q, a], i) => (
              <div key={q}>
                <button type="button" onClick={() => setOpenFaq(openFaq === i ? -1 : i)} aria-expanded={openFaq === i}
                  className="w-full min-h-[48px] py-2 flex items-center justify-between gap-3 text-left text-[14px] font-bold text-slate-900">
                  {q} <ChevronDown size={17} className={`shrink-0 text-slate-500 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                {openFaq === i && <p className="pb-3 text-[13px] text-slate-600 font-medium leading-snug">{a}</p>}
              </div>
            ))}
          </div>
        </section>

        {/* rules */}
        <section className="mx-3 mt-4 rounded-[26px] bg-white/85 p-4">
          <h2 className="text-[18px] font-black text-slate-900">Rules</h2>
          <ul className="mt-2 space-y-1.5 text-[13px] text-slate-700 font-medium leading-snug list-disc pl-5">
            <li>Open to Instagram creators in India. No joining fee.</li>
            <li>Any topic. The reel must be your own content (no reposts), public on Instagram, posted after the challenge started, and have {MENTION}, #Ybex and {HASHTAG} in the caption. You must follow {MENTION} on Instagram.</li>
            <li>Only Instagram reel or post links count. You can enter up to {MAX_ENTRIES} reels. Every entry is reviewed by the Ybex team.</li>
            <li>The first {RECHARGE_SLOTS} creators with an approved entry and a complete profile get {RECHARGE_AMOUNT} by UPI on their WhatsApp number within {RECHARGE_DAYS} days of approval (one per creator).</li>
            <li>Entries close on {dayTimeText(dates.closesAt)} (IST). Winners are announced here on {dayText(dates.resultsAt)}.</li>
            <li>Reels that are deleted, made private or copied from someone else are removed.</li>
            <li>Prizes are subject to applicable taxes and are paid after KYC. Ybex's decision is final.</li>
          </ul>
        </section>

        {!user && (
          <p className="mt-6 text-center text-[13px] font-semibold text-white/90">
            Already on Ybex? <button type="button" onClick={() => navigate("/login?next=/challenge")} className="underline font-black text-white">Log in</button>
          </p>
        )}
        <p className="mt-4 text-center text-[13px] font-bold text-white/90">See you on the winners' list 🪔</p>
      </div>

      {/* pinned Join bar */}
      <div className="fixed left-0 right-0 bottom-0 z-40 pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] pb-[calc(10px+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-[520px] rounded-[26px] bg-white/80 backdrop-blur-2xl border border-white shadow-[0_18px_40px_-18px_rgba(80,0,0,.6)] flex items-center gap-3 max-[339px]:gap-2 pl-4 pr-2 h-[68px]">
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-black text-slate-900 tabular-nums truncate">
              {phase === "open" ? <Countdown now={now} target={dates.closesAt} compact /> : phase === "soon" ? `Opens ${dayText(dates.startsAt)}` : "Entries closed"}{phase === "open" ? " left" : ""}
            </div>
            <div className="max-[339px]:hidden text-[11.5px] leading-[1.25] font-semibold text-slate-500 line-clamp-2">{/* v378: ₹300 line wraps instead of "…" on 360 px */}
              {myCount ? `You have ${myCount} entr${myCount === 1 ? "y" : "ies"}` : <span className="text-[#0E9F6E] font-bold" data-testid="pinned-recharge">{RECHARGE_AMOUNT} UPI cash for the first {RECHARGE_SLOTS} · {(info?.recharge_left ?? RECHARGE_SLOTS)} left</span>}
            </div>
          </div>
          <button type="button" onClick={join} disabled={!canJoin} data-testid="challenge-join"
            className="h-[52px] px-5 max-[339px]:px-4 rounded-full bg-[#7C3AED] text-white text-[15px] font-bold shadow-[0_10px_20px_-10px_rgba(124,58,237,1)] disabled:opacity-50 shrink-0">
            {joinLabel}
          </button>
        </div>
      </div>
      {ask && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center" role="dialog" aria-modal="true" data-testid="reel-ready-sheet">
          <div className="absolute inset-0 bg-[#1B1430]/45 backdrop-blur-sm" onClick={() => setAsk(false)} />
          <div className="relative w-full max-w-[520px] rounded-t-[30px] bg-white px-5 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))]">
            <div className="mx-auto h-1 w-10 rounded-full bg-slate-300" />
            <button type="button" onClick={() => setAsk(false)} aria-label="Close" className="absolute right-3 top-3 w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600"><X size={17} /></button>
            <div className="mt-4 text-[34px] text-center" aria-hidden="true">🪔</div>
            <h3 className="mt-1 text-center text-[24px] font-black text-slate-900">Is your reel ready?</h3>
            <p className="mt-1.5 text-center text-[13.5px] text-slate-600 leading-snug">Follow {MENTION}, post it on Instagram with {MENTION} and {HASHTAG}, then add it here to get your entry number.</p>
            <button type="button" onClick={addReel} data-testid="reel-ready-yes" className="mt-5 w-full h-[54px] rounded-full bg-[#7C3AED] text-white text-[15px] font-bold">Yes, add my reel</button>
            <button type="button" onClick={later} data-testid="reel-ready-later" className="mt-2 w-full h-12 rounded-full bg-slate-100 text-[14.5px] font-bold text-slate-800">Not yet — remind me</button>
            <p className="mt-2 text-center text-[12px] text-slate-500">We'll remind you before entries close on {dayText(dates.closesAt)}.</p>
          </div>
        </div>
      )}
      <span className="sr-only">Entries close {dayTimeText(dates.closesAt)} (IST)</span>
    </div>
  );
}
