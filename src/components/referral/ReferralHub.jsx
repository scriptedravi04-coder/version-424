import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Share2, Wallet, X, Lock } from "lucide-react";
import { api } from "../../lib/api";

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
import { publicOrigin } from "../../lib/publicUrl";
import ButtonSpinner from "../common/ButtonSpinner";
// Session 36 (Ravi): creator referral programme. Rewards come from the server (/referrals/me); every
// number here is real. "How it works" carries the full rules (incl. the withdrawal minimum, small print).
const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
// v332: a bad / missing date shows nothing instead of "Invalid Date".
const date = (d) => { const x = d ? new Date(d) : null; return x && !Number.isNaN(x.getTime()) ? x.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : ""; };
// v330: server status words ("requested", "rejected", "signed_up") shown as plain words, not raw values.
const STATUS_WORDS = { requested: "Requested", processing: "Processing", rejected: "Rejected", failed: "Failed", cancelled: "Cancelled", joined: "Joined", signed_up: "Signed up", pending: "Pending" };
const statusWord = (s) => STATUS_WORDS[String(s || "").toLowerCase()] || (s ? String(s).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "");

export function referralShareText(link) {
  return `I get brand deals on Ybex — brands pay into a secure payment hold before you start. Join with my link: ${link}`;
}

function ReferralHowItWorksBody({ open, onClose, data }) {
  if (!open) return null;
  const n = data?.signups_per_reward || 3, f = data?.free_deals_per_reward || 2;
  return (
    <PopupBackdrop className="fixed inset-0 z-[130] bg-black/50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" data-testid="referral-howto">
      <PopupPanel kind="auto" below={640} onClose={onClose} className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto" style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">How inviting works</h3>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-gray-100"><X size={17} /></button>
        </div>
        <ol className="mt-3 space-y-3 text-[13px] text-gray-800 list-decimal pl-5">
          <li>Share your link. Creators who join Ybex through it (sign up or apply) count for you.</li>
          {/* Session 57: only when the admin has this offer on (it showed "your next 0 deals"). */}
          {Number(data?.signups_per_reward) > 0 && Number(data?.free_deals_per_reward) > 0 && (
            <li>Every {n} creators who join → your next {f} deals at <b>0% fee</b> (use them within {Math.round((data?.free_deals_valid_days || 180) / 30)} months), and your profile is <b>Featured</b> to brands for {data?.featured_days || 7} days.</li>
          )}
          {/* Session 39 (Ravi, M17a): one simple line — no numbers about who gets how much. */}
          <li>You also get a share of what your friend earns.</li>
        </ol>
        {/* v290 (Ravi): the ₹21 / ₹500 rules, same numbers the server uses */}
        <ul className="mt-3 space-y-2 text-[13px] text-gray-800 list-disc pl-5">
          {/* v353: a reward the admin switched off (0) said "you both get ₹0 … up to ₹0" — hidden then */}
          {Number(data?.friend_reward ?? 21) > 0 && <li>When a friend you invited completes their profile 100% (details, portfolio and KYC), you both get <b>{inr(data?.friend_reward ?? 21)}</b> in your Ybex wallet — up to {inr(data?.friend_reward_cap ?? 1000)} for you.</li>}
          {Number(data?.brand_invite_reward ?? 500) > 0 && <li>Invite a brand: when it funds its first deal of {inr(data?.brand_invite_min_deal ?? 5000)} or more, you get <b>{inr(data?.brand_invite_reward ?? 500)}</b>{data?.brand_invite_featured_days ? ` + ${data.brand_invite_featured_days} days Featured` : ""} — up to {data?.brand_invite_max_brands ?? 10} brands. It unlocks after you complete {data?.brand_invite_unlock_deals ?? 2} deals yourself.</li>}
        </ul>
        <p className="mt-3 text-[11.5px] text-gray-500">Not counted: inviting yourself, the same email/phone, accounts older than 7 days, more than {data?.monthly_cap_per_user || 20} a month. Ybex may change or end the programme; earned rewards stay.</p>
        <p className="mt-2 text-[10.5px] text-gray-500">Your wallet is paid to your UPI ID from {inr(data?.min_withdraw ?? 11)}. Amounts and limits can change during an offer; full rules in Terms → Referral and invite rewards.</p>
        <button onClick={onClose} className="mt-4 w-full h-11 rounded-xl bg-[#4f46e5] text-white text-sm font-semibold">Got it</button>
      </PopupPanel>
    </PopupBackdrop>
  );
}

// Session 37: stays mounted for its closing animation.
export function ReferralHowItWorks(props) {
  return <Presence>{props.open && <ReferralHowItWorksBody key="referralhowitworks" {...props} />}</Presence>;
}


// Session 57 — Ravi's Money screens design (RF-01 brand · RF-02 invite creators · RF-03 invite brands).
// One ticket-style offer per tab, an invite list with progress, and the wallet with its withdraw rule.
// Every number comes from GET /referrals/me; an offer whose amount is 0 (not set by admin) is hidden.
function TicketCard({ eyebrow, upTo, lineA, lineB, note, onTerms }) {
  return (
    <div className="relative rounded-[22px] overflow-hidden text-white" style={{ background: "linear-gradient(150deg,#8B2CF5 0%,#6A1FD8 60%,#4C12A8 100%)" }} data-testid="referral-ticket">
      <div className="p-5">
        <div className="text-[11.5px] font-extrabold tracking-[1.2px] text-[#E4D4FF]">{eyebrow}</div>
        <div className="mt-2 text-[12.5px] font-semibold text-[#E9DBFF]">Earn up to</div>
        <div className="text-[38px] font-extrabold tracking-[-1px] leading-none mt-0.5">{upTo}</div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="px-2.5 py-1 rounded-full bg-white text-[#5B16C9] text-[12.5px] font-extrabold">{lineA}</span>
          {lineB ? <><span className="text-[#E4D4FF] font-bold">+</span><span className="px-2.5 py-1 rounded-full bg-white/[.18] text-[12.5px] font-bold">{lineB}</span></> : null}
        </div>
      </div>
      <div className="relative border-t-2 border-dashed border-white/25 px-5 py-3 flex items-center justify-between gap-3">
        <span className="absolute -left-3 -top-3 w-6 h-6 rounded-full bg-[#F4F4F8]" />
        <span className="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-[#F4F4F8]" />
        <span className="text-[12px] text-[#EBDDFF] leading-snug">{note}</span>
        <button type="button" onClick={onTerms} className="text-[11.5px] font-bold text-white underline shrink-0">T&amp;C apply</button>
      </div>
    </div>
  );
}

function Steps({ items }) {
  return (
    <div className="bg-white rounded-[18px] border border-[#EEEDF3] p-4">
      <div className="text-[15px] font-extrabold text-[#0A0A0A]">How it works</div>
      <div className="mt-3 flex flex-col gap-3">
        {items.map(([t, d], i) => (
          <div key={t} className="flex gap-3 items-start">
            <div className="w-[26px] h-[26px] rounded-full bg-[#F2EAFF] text-[#7C3AED] text-[13px] font-extrabold flex items-center justify-center shrink-0">{i + 1}</div>
            <div><div className="text-[14px] font-bold text-[#0A0A0A]">{t}</div>{d ? <div className="text-[12px] text-[#6B7280] mt-px">{d}</div> : null}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Progress({ label, right, pct }) {
  return (
    <div className="bg-white rounded-[18px] border border-[#EEEDF3] p-4">
      <div className="flex items-center justify-between text-[13.5px]"><span className="font-bold text-[#0A0A0A]">{label}</span><span className="font-semibold text-[#6B7280]">{right}</span></div>
      <div className="mt-2.5 h-2 rounded-full bg-[#EFEAF8] overflow-hidden"><div className="h-full rounded-full bg-[#7C3AED]" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
    </div>
  );
}

function PeopleList({ title, people, emptyText, line }) {
  return (
    <div className="bg-white rounded-[18px] border border-[#EEEDF3] p-4" data-testid="referral-people">
      <div className="flex items-center justify-between"><div className="text-[15px] font-extrabold text-[#0A0A0A]">{title}</div><span className="text-[12.5px] font-semibold text-[#6B7280]">{people.length} joined</span></div>
      {people.length === 0 ? (
        <div className="mt-2 text-[12.5px] text-[#6B7280]">{emptyText}</div>
      ) : (
        <ul className="mt-2 divide-y divide-[#F0EEF4]">
          {people.map((p, i) => {
            const l = line(p);
            return (
              <li key={i} className="py-2.5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#F2EAFF] text-[#7C3AED] text-[13px] font-extrabold flex items-center justify-center shrink-0">{String(p.name || "?").slice(0, 2).toUpperCase()}</div>
                {/* v332: a person with no name showed an empty bold line */}
                <div className="flex-1 min-w-0"><div className="text-[14px] font-bold text-[#0A0A0A] truncate">{p.name || (p.type === "brand" ? "A brand" : "A creator")}</div><div className="text-[12px] text-[#6B7280] truncate">{l.text}</div></div>
                {l.right ? <span className={`text-[12.5px] font-extrabold shrink-0 ${l.good ? "text-[#0E7A55]" : "text-[#6B7280]"}`}>{l.right}</span> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function ReferralHub({ compact = false, mode = "creator" }) {
  const [d, setD] = useState(null);
  const [howto, setHowto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState(() => (typeof window !== "undefined" && window.location.hash === "#brand" ? "brands" : "creators"));
  const load = () => api.get("referrals/me").then((r) => setD(r.data)).catch(() => setD({ error: true }));
  useEffect(() => { load(); }, []);
  // v332: a calm skeleton instead of a bare "Loading…" line.
  if (!d) return (
    <div className={`flex flex-col gap-3 ${compact ? "" : "max-w-2xl"}`} aria-busy="true" aria-label="Loading your invite details">
      <div className="h-11 rounded-[14px] bg-[#EEEBF3] animate-pulse" />
      <div className="h-44 rounded-[22px] bg-[#EEEBF3] animate-pulse" />
      <div className="h-28 rounded-[18px] bg-[#EEEBF3] animate-pulse" />
    </div>
  );
  if (d.error) return (
    <div className="p-6 text-sm text-gray-500">
      Could not load your invite details. Please try again.
      {/* v330: a way to retry without leaving the page */}
      <button type="button" onClick={() => { setD(null); load(); }} className="mt-3 block h-10 px-4 rounded-xl bg-[#7C3AED] text-white text-sm font-semibold">Try again</button>
    </div>
  );

  const isBrand = mode === "brand";
  // v332: never show ".../undefined" as the invite link if the server left link_path out.
  const link = d.link_path ? `${publicOrigin()}${d.link_path}` : (d.code ? `${publicOrigin()}/r/${d.code}` : "");
  const brandLink = link.replace("/r/", "/b/");
  const showBrands = isBrand || tab === "brands";
  const activeLink = showBrands ? brandLink : link;
  const inv = d.invite || {};
  const people = Array.isArray(d.people) ? d.people : [];
  const creatorsInvited = people.filter((p) => p.type !== "brand");
  const brandsInvited = people.filter((p) => p.type === "brand");
  const brandReward = Number(d.brand_invite_reward || 0);
  const brandMax = Number(d.brand_invite_max_brands || 0);
  const friendReward = Number(d.friend_reward || 0);
  const friendCap = Number(d.friend_reward_cap || 0);
  const bonusOn = Number(d.signups_per_reward || 0) > 0 && Number(d.free_deals_per_reward || 0) > 0;
  const step = Math.max(0, Number(d.signups_per_reward || 0) - Number(d.to_next_reward || 0));
  const minW = Number(d.min_withdraw || 0);
  const need = Math.max(0, minW - Number(d.balance || 0));

  const copy = async () => { try { await navigator.clipboard.writeText(activeLink); toast.success("Invite link copied"); } catch { toast.error("Couldn't copy the link. Please try again."); /* v332: calm copy */ } };
  const share = async () => {
    const text = showBrands
      ? (isBrand
        ? `We hire creators on Ybex — verified creators, money held safely until you approve the content. Sign up as a brand: ${brandLink}`
        : `We run creator campaigns on Ybex — verified creators, money held safely until you approve the content. Sign up as a brand: ${brandLink}`)
      : referralShareText(link);
    if (navigator.share) { try { await navigator.share({ title: showBrands ? "Ybex for brands" : "Join me on Ybex", text, url: activeLink }); return; } catch { /* cancelled */ } }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  const withdraw = async () => {
    if (busy) return; // v332: a fast double tap sent two withdrawal requests
    setBusy(true);
    try { await api.post("referrals/withdraw", {}); toast.success(isBrand ? "Withdrawal requested. It goes to your refund account UPI." : "Withdrawal requested. It goes to your payout UPI." /* Session 58: referral rewards are paid on UPI only */); load(); }
    catch (e) { toast.error(e?.response?.data?.error || "Could not request a withdrawal."); }
    finally { setBusy(false); }
  };

  const brandLine = (p) => p.qualified
    ? { text: "Funded their first deal", right: brandReward ? `+${inr(brandReward)}` : null, good: true }
    : { text: `Signed up · waiting for a ${inr(d.brand_invite_min_deal)}+ deal`, right: "Joined" };
  const creatorLine = (p) => p.complete
    ? { text: "Profile 100% · reward paid", right: friendReward ? `+${inr(friendReward)}` : null, good: true }
    : { text: p.status === "joined" ? "Joined · profile not 100% yet" : statusWord(p.status), right: p.earned ? inr(p.earned) : null, good: Boolean(p.earned) };

  const walletCard = (
    <div className="bg-white rounded-[18px] border border-[#EEEDF3] p-4" data-testid="referral-wallet">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[15px] font-extrabold text-[#0A0A0A]"><Wallet size={16} className="text-[#7C3AED]" />Ybex wallet</div>
        <div className="text-[20px] font-extrabold text-[#0A0A0A]">{inr(d.balance)}</div>
      </div>
      <div className="text-[12px] text-[#6B7280] mt-1">Earned {inr(d.earned)} · withdrawn {inr(d.withdrawn)}</div>
      {inv.locked > 0 && <div className="text-[12px] text-[#B45309] mt-1 flex items-center gap-1"><Lock size={12} /> {inr(inv.locked)} locked — complete {inv.deals_to_unlock} more deal{inv.deals_to_unlock === 1 ? "" : "s"} to unlock</div>}
      <button onClick={withdraw} disabled={busy || need > 0 || Number(d.balance || 0) <= 0} className="mt-3 w-full h-11 rounded-[13px] bg-[#7C3AED] text-white text-[14px] font-bold disabled:bg-[#ECE7F6] disabled:text-[#A79CC2]">{busy ? <ButtonSpinner label="Sending…" /> : "Withdraw"}</button>{/* v332: spinner while it runs */}
      <div className="text-[11.5px] text-[#6B7280] mt-2 text-center">
        {Number(d.balance || 0) <= 0 ? `Withdraw from ${inr(minW)}. ` : need > 0 ? `${inr(need)} more to withdraw (minimum ${inr(minW)}). ` : ""}
        {isBrand ? "Paid to the UPI on your refund account." : "Paid to your payout UPI."}
      </div>
      {d.withdrawals?.length > 0 && (
        <ul className="mt-3 pt-2 border-t border-[#F0EEF4] space-y-1 text-[12px] text-[#6B7280]">
          {d.withdrawals.map((w) => <li key={w.id} className="flex justify-between"><span>{inr(w.amount)} · {date(w.created_at)}</span><span>{w.status === "paid" ? (w.utr ? `Paid · UTR ${w.utr}` : "Paid") : statusWord(w.status)}</span></li>)}
        </ul>
      )}
    </div>
  );

  const questions = (
    <button type="button" onClick={() => setHowto(true)} className="w-full bg-white rounded-[18px] border border-[#EEEDF3] p-3.5 flex items-center gap-3 text-left">
      <div className="w-9 h-9 rounded-full bg-[#F2F0F6] flex items-center justify-center shrink-0 text-[15px]">?</div>
      <div className="flex-1 min-w-0"><div className="text-[14px] font-bold text-[#0A0A0A]">Got questions?</div><div className="text-[12px] text-[#6B7280]">Offer terms, eligibility and FAQ</div></div>
    </button>
  );

  const brandSection = (
    <>
      {brandReward > 0 ? (
        <TicketCard
          eyebrow="REFER A BRAND"
          upTo={inr(brandReward * Math.max(1, brandMax))}
          lineA={isBrand ? `${inr(brandReward)} for every brand you invite` : `${inr(brandReward)} per brand`}
          lineB={d.brand_invite_featured_days && !isBrand ? `${d.brand_invite_featured_days} days Featured` : null}
          note={`When the brand funds its first deal of ${inr(d.brand_invite_min_deal)} or more. Added to your Ybex wallet.`}
          onTerms={() => setHowto(true)}
        />
      ) : (
        <div className="bg-white rounded-[18px] border border-[#EEEDF3] p-4 text-[13px] text-[#6B7280]">The brand invite reward isn't running right now. You can still share your link.</div>
      )}
      {isBrand && (
        <div className="grid grid-cols-3 gap-2">
          {[["Joined", brandsInvited.length], ["Qualified", inv.brand_count || 0], ["Earned", inr(inv.brand_total)]].map(([l, v]) => (
            <div key={l} className="bg-white rounded-[16px] border border-[#EEEDF3] p-3 text-center"><div className="text-[18px] font-extrabold text-[#0A0A0A] truncate">{v}</div><div className="text-[11.5px] text-[#6B7280]">{l}</div></div>
          ))}
        </div>
      )}
      {!isBrand && d.brand_invite_featured_days ? (
        <div className="bg-[#FFF8EB] border border-[#FBE3B5] rounded-[18px] p-3.5">
          <div className="text-[13.5px] font-bold text-[#7A4A06]">What is Featured?</div>
          <div className="text-[12px] text-[#92612A] mt-0.5">For {d.brand_invite_featured_days} days your profile is highlighted to brands browsing creators, so more brands see you first.</div>
        </div>
      ) : null}
      {brandReward > 0 && brandMax > 0 && (
        <Progress label="Brand rewards" right={`${inv.brand_count || 0} of ${brandMax} brands`} pct={((inv.brand_count || 0) / brandMax) * 100} />
      )}
      {brandReward > 0 && ( /* v353: with the brand offer off (₹0) the steps said "You get ₹0" */
      <Steps items={[
        ["Send your link to a brand", isBrand ? "One that works with creators" : "One you've worked with or know"],
        [`They fund a deal of ${inr(d.brand_invite_min_deal)}+`, "Their first deal on Ybex"],
        [`You get ${inr(brandReward)}${d.brand_invite_featured_days && !isBrand ? ` + ${d.brand_invite_featured_days} days Featured` : ""}`, brandMax ? `Up to ${inr(brandReward * brandMax)} from ${brandMax} brands` : "Into your Ybex wallet"],
      ]} />
      )}
      {inv.locked > 0 && <div className="text-[12px] text-[#B45309] px-1">Brand rewards unlock after you complete {inv.deals_to_unlock} more deal{inv.deals_to_unlock === 1 ? "" : "s"} yourself.</div>}
      <PeopleList title="Brands you invited" people={brandsInvited} emptyText="No brands yet. Share your link with a brand you know." line={brandLine} />
    </>
  );

  const creatorSection = (
    <>
      {friendReward > 0 ? (
        <TicketCard
          eyebrow="REFER A CREATOR"
          upTo={inr(friendCap || friendReward)}
          lineA={`${inr(friendReward)} for you`}
          lineB={`${inr(friendReward)} for your friend`}
          note="When your friend completes their profile 100%: details, portfolio and KYC."
          onTerms={() => setHowto(true)}
        />
      ) : null}
      {friendReward > 0 && friendCap > 0 && (
        <Progress label="Friend rewards" right={`${inr(inv.friend_earned)} of ${inr(friendCap)}`} pct={((inv.friend_earned || 0) / friendCap) * 100} />
      )}
      <Steps items={[
        ["Share your link", "With a creator who isn't on Ybex yet"],
        ["They complete their profile", "Details, portfolio and KYC, 100%"],
        [friendReward > 0 ? `You both get ${inr(friendReward)}` : "You both get rewarded", "Straight into your Ybex wallets"],
      ]} />
      <PeopleList title="Your friends" people={creatorsInvited} emptyText="No friends yet. Share your link to get started." line={creatorLine} />
      {bonusOn && (
        <Progress label="Friends bonus" right={`${step} of ${d.signups_per_reward}`} pct={(step / d.signups_per_reward) * 100} />
      )}
      {bonusOn && (
        <div className="text-[12px] text-[#6B7280] px-1 -mt-1">
          Every {d.signups_per_reward} friends who join → your next {d.free_deals_per_reward} deals at 0% fee{d.featured_days ? ` + ${d.featured_days} days Featured` : ""}.
          {Number(d.free_deals_left) > 0 ? ` You have ${d.free_deals_left} left${d.free_deals_expire_at ? ` (till ${date(d.free_deals_expire_at)})` : ""}.` : ""}
          {d.featured_until ? ` Featured till ${date(d.featured_until)}.` : ""}
        </div>
      )}
    </>
  );

  return (
    <div className={`pb-[120px] md:pb-6 ${compact ? "flex flex-col gap-3" : "flex flex-col gap-3 max-w-2xl lg:max-w-5xl lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5 lg:items-start"}`} data-testid="referral-hub">
      {/* v403: desktop gets two columns (programme left, code + wallet right) instead of one phone-width strip */}
      <div className="flex flex-col gap-3 min-w-0">
      {isBrand && (
        <div className="px-1">
          <div className="text-[20px] font-extrabold text-[#0A0A0A] leading-tight">Bring a brand, get paid</div>
          <div className="text-[13px] text-[#6B7280] mt-0.5">Every brand you invite can earn you a reward in your Ybex wallet.</div>
        </div>
      )}
      {!isBrand && (
        <div className="grid grid-cols-2 bg-[#E9E6F0] rounded-[14px] p-1 gap-1" role="tablist">
          {[["creators", "Invite creators"], ["brands", "Invite brands"]].map(([id, l]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`h-10 rounded-[10px] text-[13.5px] font-bold ${tab === id ? "bg-white text-[#0A0A0A] shadow-[0_1px_3px_rgba(20,17,28,.12)]" : "text-[#6B7280]"}`}>{l}</button>
          ))}
        </div>
      )}
      {showBrands ? brandSection : creatorSection}
      </div>
      <div className={`flex flex-col gap-3 min-w-0 ${compact ? "" : "lg:sticky lg:top-4"}`} data-testid="referral-side">
      {/* sticky code + share */}
      <div className="lg:order-first fixed md:static left-0 right-0 bottom-0 z-30 bg-white border-t md:border md:rounded-[18px] border-[#ECEAF1] px-4 pt-2.5" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-extrabold tracking-[1px] text-[#6B7280]">CODE</span>
            <span className="flex-1 min-w-0 text-[15px] font-extrabold text-[#0A0A0A] truncate" data-testid="referral-code">{d.code}</span>
            <button type="button" onClick={copy} className="h-10 px-3 rounded-[10px] border border-[#E2DFEA] text-[12.5px] font-bold text-[#0A0A0A] flex items-center gap-1.5 shrink-0"><Copy size={13} />Copy link</button>
          </div>
          <button type="button" onClick={share} className="mt-2 w-full h-12 rounded-[14px] bg-[#7C3AED] text-white text-[15px] font-bold flex items-center justify-center gap-2"><Share2 size={16} />{showBrands ? (isBrand ? "Invite a brand" : "Send to a brand") : "Invite creators"}</button>
        </div>
      </div>
      {walletCard}
      {questions}
      </div>
      <ReferralHowItWorks open={howto} onClose={() => setHowto(false)} data={d} />
    </div>
  );
}
