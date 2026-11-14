// v378 (Ravi: "profile incomplete ho toh automatic push — 'Complete your profile', 'Add your bio…' — offer ke baare mein.
// Pehle mujhse approve karwana"). Creators whose profile (photo, niche & bio, Instagram/YouTube, rate card, past work)
// or KYC is not done get at most 3 reminders while the Diwali offer is open: right away, 2 days later, 4 days after
// that. Each one names the FIRST missing part and opens that exact screen. Only 9 am – 10 pm India time.
// Sent as a normal notification row (bell) — the push loop turns it into a phone push.
// State = push_log rows (kind "profile-nudge", ref "1".."3"), so two servers never send the same one. No new tables.
// Turned on only after Ravi approves the texts: PROFILE_NUDGES_ON (or env PROFILE_NUDGES=on).
import { creatorProfileStrength } from "../src/lib/creatorTasks";
import { readCreatorsLean } from "./inboxLean"; // v428: list reads without Instagram posts (egress)
import { RECHARGE_AMOUNT, datesFrom } from "../src/lib/diwaliChallenge";
import { resolveKycStatus } from "./creatorKyc";
import { CONFIG_KEY } from "./challenge_routes";

export const PROFILE_NUDGES_ON = true; // Ravi approved the texts (28 Oct 2026)
// v397 (Ravi, 3 Nov: "jo complete nahi kar rahe unhe baar baar bhejo"): 8 reminders instead of 3 — the first three as
// before (now, +2 days, +4 days), then every 3–7 days, ~4 weeks in total. A finished profile gets nothing more.
export const NUDGE_GAPS_HOURS = [0, 48, 96, 72, 72, 96, 120, 168];
const MAX_PER_RUN = 300;
const KIND = "profile-nudge";

/** The texts Ravi approves. One per missing part — the first missing one is used. */
export const NUDGE_TEXT: Record<string, { title: string; message: string; link: string }> = {
  Photo: { title: "Add your photo 📸", message: `Brands skip profiles without one. Complete your profile & get ${RECHARGE_AMOUNT} cash.`, link: "/creator/settings?section=profile" },
  "Niche & bio": { title: "Write a 1-line bio ✍️", message: `Finish your profile and get ${RECHARGE_AMOUNT} UPI cash.`, link: "/creator/settings?section=profile" },
  "Instagram / YouTube": { title: "Add your Instagram 📲", message: `So brands can see your reach. ${RECHARGE_AMOUNT} cash on a complete profile.`, link: "/creator/settings?section=platforms" },
  "Rate card": { title: "Set your price 💰", message: `Brands book creators who show rates. Complete profile = ${RECHARGE_AMOUNT} cash.`, link: "/creator/settings?section=rates" },
  "Past work": { title: "Add 1 past collab 🎬", message: `You're almost there! ${RECHARGE_AMOUNT} cash on a 100% profile.`, link: "/creator/settings?section=portfolio" },
  // Ravi: "KYC ki jagah 'add your payout details' — paise ke liye jaldi bharega"
  KYC: { title: "Add your payout details 💸", message: `Add where we should send your ${RECHARGE_AMOUNT} — last step, then it's on its way.`, link: "/creator/kyc" },
};

/** v397: same reminders without the cash line — used when the profile offer isn't running (they kept stopping then). */
export const NUDGE_TEXT_PLAIN: Record<string, { title: string; message: string; link: string }> = {
  Photo: { title: "Add your photo 📸", message: "Brands skip profiles without one. It takes 10 seconds.", link: "/creator/settings?section=profile" },
  "Niche & bio": { title: "Write a 1-line bio ✍️", message: "Tell brands what you create — they search by niche.", link: "/creator/settings?section=profile" },
  "Instagram / YouTube": { title: "Add your Instagram 📲", message: "So brands can see your reach and send you deals.", link: "/creator/settings?section=platforms" },
  "Rate card": { title: "Set your price 💰", message: "Brands book creators who show rates.", link: "/creator/settings?section=rates" },
  "Past work": { title: "Add 1 past collab 🎬", message: "You're almost there — one past work and your profile is complete.", link: "/creator/settings?section=portfolio" },
  KYC: { title: "Add your payout details 💸", message: "So your deal money reaches you on time.", link: "/creator/kyc" },
};
/** v397: signed up but never finished the sign-up form → the reminder opens the form itself. */
export const NUDGE_FINISH_SIGNUP = { part: "Sign-up", title: "Finish your Ybex profile ✨", message: "One minute left — finish it and brands can find you.", link: "/onboarding" };

/** India time 9:00–21:59 → ok to send. Pure. */
export function quietHoursOk(now = Date.now()): boolean {
  const h = new Date(now + 5.5 * 3600_000).getUTCHours();
  return h >= 9 && h < 22;
}

/** Missing parts of one creator (same five as Home + KYC submitted). Pure. */
export function missingParts(profile: any, kyc: string): string[] {
  const p = profile || {};
  const m = creatorProfileStrength(p, Array.isArray(p.portfolio) ? p.portfolio.length : null).missing;
  return kyc === "APPROVED" || kyc === "PENDING" ? m : [...m, "KYC"];
}

/** Which reminder (1..3) is due for this creator, or 0. sent = push_log rows of this creator. Pure. */
export function dueStep(sent: Array<{ ref: string; sent_at: string }>, now = Date.now()): number {
  const steps = (sent || []).map((r) => Number(r.ref)).filter((n) => n >= 1 && n <= NUDGE_GAPS_HOURS.length);
  const next = steps.length ? Math.max(...steps) + 1 : 1;
  if (next > NUDGE_GAPS_HOURS.length) return 0;
  if (next === 1) return 1;
  const last = (sent || []).find((r) => Number(r.ref) === next - 1);
  const at = Date.parse(String(last?.sent_at || ""));
  if (!Number.isFinite(at)) return 0;
  return now - at >= NUDGE_GAPS_HOURS[next - 1] * 3600_000 ? next : 0;
}

export function nudgeFor(missing: string[], offerOpen = true) {
  const texts = offerOpen ? NUDGE_TEXT : NUDGE_TEXT_PLAIN;
  const part = (missing || []).find((m) => texts[m]);
  return part ? { part, ...texts[part] } : null;
}

export async function runProfileNudges(client: any, kick: () => void, now = Date.now()) {
  const out = { checked: 0, sent: 0, skipped: "" as string };
  if (!(PROFILE_NUDGES_ON || process.env.PROFILE_NUDGES === "on")) { out.skipped = "off"; return out; }
  if (!client) { out.skipped = "no db"; return out; }
  if (!quietHoursOk(now)) { out.skipped = "quiet hours"; return out; }
  const { data: cfg } = await client.from("ybex_ephemeral").select("value").eq("key", CONFIG_KEY).maybeSingle().then((r: any) => r, () => ({ data: null }));
  const d = datesFrom(cfg?.value || null);
  // v397: the reminders keep going after the offer closes, just without the cash line
  const offerOpen = !(now < d.startsAt || now >= d.closesAt);

  const users: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from("users").select("user_id, role, banned, is_deleted, auth_method, onboarded").eq("role", "creator").range(from, from + 999);
    if (error || !data?.length) break;
    users.push(...data.filter((u: any) => u.banned !== true && u.is_deleted !== true && u.auth_method !== "unclaimed")); // v388: CSV-imported "ghost" profiles never signed up — they ate the 300/run cap (QA: 83 of 94)
    if (data.length < 1000) break;
  }
  let sentCount = 0;
  for (let i = 0; i < users.length && sentCount < MAX_PER_RUN; i += 200) {
    const ids = users.slice(i, i + 200).map((u) => String(u.user_id));
    const [{ data: profs }, { data: cks }, { data: vs }, { data: logs }] = await Promise.all([
      readCreatorsLean(client, (q: any) => q.in("user_id", ids)),
      client.from("creator_kyc").select("creator_id, status").in("creator_id", ids),
      client.from("verifications").select("user_id, status, note, documents, created_at").in("user_id", ids).order("created_at", { ascending: false }),
      client.from("push_log").select("user_id, ref, sent_at").eq("kind", KIND).in("user_id", ids),
    ]);
    const prof = new Map<string, any>((profs || []).map((r: any) => [String(r.user_id), r]));
    const userById = new Map<string, any>(users.slice(i, i + 200).map((u: any) => [String(u.user_id), u]));
    const ck = new Map<string, any>((cks || []).map((r: any) => [String(r.creator_id), r]));
    for (const id of ids) {
      if (sentCount >= MAX_PER_RUN) break;
      out.checked++;
      const p = prof.get(id);
      if (p?.is_deleted === true) continue;
      const step = dueStep((logs || []).filter((r: any) => String(r.user_id) === id), now);
      if (!step) continue;
      // v397: signed up but never finished the sign-up form (no profile yet, or not onboarded) → "Finish your profile"
      const unfinished = !p || userById.get(id)?.onboarded === false;
      const kyc = unfinished ? "NONE" : resolveKycStatus(ck.get(id), (vs || []).filter((r: any) => String(r.user_id) === id));
      const n = unfinished ? NUDGE_FINISH_SIGNUP : nudgeFor(missingParts(p, kyc), offerOpen);
      if (!n) continue; // complete — nothing to say
      // claim the step first: the server that writes the row sends it
      const { data: mine } = await client.from("push_log")
        .upsert({ user_id: id, kind: KIND, ref: String(step), sent_at: new Date(now).toISOString() }, { onConflict: "kind,ref,user_id", ignoreDuplicates: true })
        .select("ref");
      if (!mine?.length) continue;
      const nid = `notif_${Math.random().toString(36).slice(2, 11)}`;
      const { error } = await client.from("notifications").insert({
        notif_id: nid, id: nid, user_id: id, type: "PROFILE_NUDGE", title: n.title, message: n.message,
        link: n.link, redirect_path: n.link, read: false, created_at: new Date(now).toISOString(),
      });
      if (!error) sentCount++;
    }
  }
  out.sent = sentCount;
  if (sentCount) kick();
  return out;
}

export function startProfileNudges(client: any, kick: () => void) {
  if (process.env.NODE_ENV === "test" || !client) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runProfileNudges(client, kick);
      if (r.sent) console.log(`[profile-nudges] sent ${r.sent}`);
    } catch (e: any) {
      console.warn("[profile-nudges]", e?.message || e);
    } finally { running = false; }
  };
  const first: any = setTimeout(run, 5 * 60 * 1000); first.unref?.();
  const every: any = setInterval(run, 60 * 60 * 1000); every.unref?.();
}
